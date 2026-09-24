#!/usr/bin/env python3
"""Sentinel-2 whitewater locus over Pleasure Point — the observation side of
research/SENTINEL2_LOCUS_2026-09-23.md (VALIDATION_PLAN source rank 3).

Three subcommands, run in this order:

  candidates   join every Sentinel-2 L2A acquisition over the point (Planetary
               Computer STAC, anonymous) to the SC116 hindcast hour (CDIP
               THREDDS .ascii, same grammar as data/climatology/
               build_cdip_climatology.py), the NOAA CO-OPS 9413450 verified
               water level (MSL) at the acquisition second, and the SCL cloud
               classes inside the analysis window. Writes the whole table,
               rejected rows included (MEASUREMENT_LESSONS 3).
  extract      for the selected scenes, read ONE window (~2.2 x 1.8 km) of
               B02/B03/B04/B08 + SCL, save it as a GeoTIFF under qa/ with its
               SHA-256, build the whitewater mask, and read the seaward
               whitewater edge along each mapped spot's shore-normal stations
               in the model's own stage frame (data/model/pp_geo_profiles.js).
  overlay      draw the true-colour window, the whitewater mask and the model
               lines scripts/compare_sentinel2_line.mjs projected, one PNG per
               scene, into the research assets directory.

Frames. Stage (x, z) per spot is the frame bed.js bakes in: ENU = origin +
along*x + shore*z with the vectors from pp_geo_profiles.js (+z is shoreward,
the bathymetric uphill). ENU is metres east/north of the OSM apex; lat/lon
from the stage projection in docs/research/assets/pleasure-point-2026-09-05/
manifest.json (88857.8 m/deg lon, 111193.2 m/deg lat). Raster sampling goes
lat/lon -> the tile's UTM CRS through rasterio.

Whitewater. Clear water is nearly black in NIR (B08); foam is bright and
spectrally flat; shallow sand bottom is bright in red but dark in NIR; kelp
canopy is bright in NIR and dark in red. The foam mask is therefore NIR above
a per-scene CALIBRATED threshold (LESSONS 5: median + K*MAD over SCL water
pixels, K = 6 shipped, 4 and 9 carried as the threshold arms) with a
whiteness test (blue excess >= half the NIR excess) that rejects kelp; see
whitewater_masks(). A second, red-based
"dense" mask marks the continuous inner band of bores and swash and is
recorded only as the falsifier the note discusses (its outer edge is a reform
line, not the break). Components under 3 pixels are dropped as noise.

Sign and logic of the observable. Foam at stage z means a wave broke at or
seaward of z, so the outer foam edge is a SHOREWARD BOUND on the break locus:
a model line shoreward of it (positive offset) is contradicted; a model line
seaward of it is not confirmed by that frame. A single frame is one instant of
a set cycle — a lull shows less foam, never more.

Usage:
  python3 scripts/measure_sentinel2_locus.py candidates
  python3 scripts/measure_sentinel2_locus.py extract --scenes S2A_...,S2B_...
  python3 scripts/measure_sentinel2_locus.py overlay
Requires: pystac-client planetary-computer rasterio numpy matplotlib
  (python3 -m pip install --user --break-system-packages ...)
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
QA = ROOT / "qa" / "sentinel2-locus"
ASSETS = ROOT / "docs" / "research" / "assets" / "sentinel2-locus-2026-09-23"
GEO_JS = ROOT / "data" / "model" / "pp_geo_profiles.js"

STAC = "https://planetarycomputer.microsoft.com/api/stac/v1"
COLLECTION = "sentinel-2-l2a"
POINT = (-121.965, 36.955)                     # lon, lat — Pleasure Point
# Analysis window, lon/lat. Sewer Peak to Private's plus ~350 m seaward of
# the outermost stage. Tile 10SEG's footprint ends at lat 36.9515, so it
# truncates this window's seaward edge; 10SEF contains it whole.
WIN = dict(lon0=-121.980, lon1=-121.955, lat0=36.948, lat1=36.964)
BANDS = ("B02", "B03", "B04", "B08")           # 10 m; SCL is 20 m

CDIP = ("https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/"
        "MOP_alongshore/SC116_hindcast.nc")
COOPS = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
STATION = "9413450"
HINDCAST_WINDOW = ("2017-01-01T00:00:00Z", "2025-03-31T23:59:59Z")

# Stage projection, docs/research/assets/pleasure-point-2026-09-05/manifest.json
ORIGIN_LAT, ORIGIN_LON = 36.954095, -121.976216
M_PER_DEG_LON, M_PER_DEG_LAT = 88857.8, 111193.2

# Selection thresholds (stated once; the table shows every row against them)
HS_MIN, TP_MIN = 1.2, 12.0
TIDE_MAX = 0.5          # "low-to-mid": at or below +0.5 m MSL
STRIP_CLOUD_MAX = 0.05  # SCL cloud/shadow/cirrus fraction over the station scan lines

K_SHIPPED, K_ARMS = 6.0, (4.0, 6.0, 9.0)
MIN_COMPONENT_PX = 3
STATION_STEP_M = 10
Z_SCAN = (-450.0, 150.0, 2.0)                  # stage z: seaward .. shoreward, step
MIN_RUN_M = 10.0                               # one 10 m pixel along the scan


# ---------------------------------------------------------------- helpers
def fetch(url: str, tries: int = 4, timeout: int = 240) -> str:
    last = None
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pointbreak/sentinel2-locus"})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
            time.sleep(2 ** a)
    raise RuntimeError(f"fetch failed: {url}") from last


def parse_ascii_var(text: str, name: str) -> np.ndarray:
    m = re.search(rf"^{name}(?:\.{name})?\[\d+\]\s*\n(.*?)(?:\n\s*\n|\Z)", text, re.S | re.M)
    if not m:
        raise RuntimeError(f"variable {name} not in response")
    return np.array([float(v) for v in re.split(r"[,\s]+", m.group(1).strip()) if v])


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def load_geo_profiles() -> dict:
    """Same parse as data/model/build_depth_patches.py."""
    txt = GEO_JS.read_text()
    start = txt.index("Object.freeze(") + len("Object.freeze(")
    return json.loads(txt[start:txt.rindex(");")])


def enu_to_lonlat(x: float, y: float) -> tuple[float, float]:
    return ORIGIN_LON + x / M_PER_DEG_LON, ORIGIN_LAT + y / M_PER_DEG_LAT


def stage_to_enu(p: dict, x: float, z: float) -> tuple[float, float]:
    ox, oy = p["stageOriginENU"]
    ax, ay = p["stageAlongENU"]
    sx, sy = p["stageShoreENU"]
    return ox + ax * x + sx * z, oy + ay * x + sy * z


def utc_to_pdt(iso: str) -> str:
    t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    # PDT for every candidate (all fall in March..November, second Sunday
    # of March through first Sunday of November) — check and label
    year = t.year
    mar = dt.datetime(year, 3, 8, 10, tzinfo=dt.timezone.utc)
    while mar.weekday() != 6:
        mar += dt.timedelta(days=1)
    nov = dt.datetime(year, 11, 1, 9, tzinfo=dt.timezone.utc)
    while nov.weekday() != 6:
        nov += dt.timedelta(days=1)
    dst = mar <= t < nov
    off = -7 if dst else -8
    local = t + dt.timedelta(hours=off)
    return local.strftime("%Y-%m-%d %H:%M:%S ") + ("PDT" if dst else "PST")


# ------------------------------------------------------------- candidates
def stac_items(cloud_lt: float | None = None) -> list[dict]:
    from pystac_client import Client
    cat = Client.open(STAC)
    kw = dict(collections=[COLLECTION],
              intersects={"type": "Point", "coordinates": list(POINT)},
              datetime="/".join(HINDCAST_WINDOW), limit=500)
    if cloud_lt is not None:
        kw["query"] = {"eo:cloud_cover": {"lt": cloud_lt}}
    rows = []
    for it in cat.search(**kw).items():
        p = it.properties
        rows.append({"id": it.id, "datetime": p["datetime"], "cloud": p.get("eo:cloud_cover"),
                     "tile": p.get("s2:mgrs_tile"), "bbox": it.bbox,
                     "processing_baseline": p.get("s2:processing_baseline"),
                     "href_stac": f"{STAC}/collections/{COLLECTION}/items/{it.id}"})
    rows.sort(key=lambda r: r["datetime"])
    return rows


def sc116_subset(cache: Path) -> dict:
    """waveTime/Hs/Tp/Dp/flag for the hindcast window, chunked .ascii pulls."""
    if cache.exists():
        d = np.load(cache)
        return {k: d[k] for k in d.files}
    VARS = ("waveTime", "waveHs", "waveTp", "waveDp", "waveFlagPrimary")
    dds = fetch(CDIP + ".dds")
    n = int(re.search(r"waveTime\s*=\s*(\d+)", dds).group(1))
    t0 = parse_ascii_var(fetch(CDIP + ".ascii?waveTime[0:1:0]"), "waveTime")[0]
    t_start = dt.datetime.fromisoformat(HINDCAST_WINDOW[0].replace("Z", "+00:00")).timestamp()
    lo0 = max(int((t_start - t0) // 3600) - 2, 0)
    cols = {v: [] for v in VARS}
    for lo in range(lo0, n, 20000):
        hi = min(lo + 20000, n) - 1
        text = fetch(f"{CDIP}.ascii?" + ",".join(f"{v}[{lo}:1:{hi}]" for v in VARS))
        for v in VARS:
            cols[v].append(parse_ascii_var(text, v))
        print(f"  SC116 {hi + 1}/{n}", file=sys.stderr, flush=True)
    out = {v: np.concatenate(cols[v]) for v in VARS}
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.savez(cache, **out)
    return out


def coops_tide(iso: str) -> dict:
    t = dt.datetime.fromisoformat(iso.replace("Z", "+00:00"))
    b = (t - dt.timedelta(minutes=30)).strftime("%Y%m%d %H:%M").replace(" ", "%20")
    e = (t + dt.timedelta(minutes=30)).strftime("%Y%m%d %H:%M").replace(" ", "%20")
    url = (f"{COOPS}?begin_date={b}&end_date={e}&station={STATION}&product=water_level"
           "&datum=MSL&time_zone=gmt&units=metric&format=json")
    d = json.loads(fetch(url, timeout=60))
    rows = sorted((dt.datetime.strptime(x["t"], "%Y-%m-%d %H:%M").replace(tzinfo=dt.timezone.utc), float(x["v"]))
                  for x in d.get("data", []) if x.get("v") not in ("", None))
    val = None
    for (t0, v0), (t1, v1) in zip(rows, rows[1:]):
        if t0 <= t <= t1:
            val = v0 + (t - t0).total_seconds() / (t1 - t0).total_seconds() * (v1 - v0)
            break
    return {"tide_msl_m": None if val is None else round(val, 3), "url": url, "n_rows": len(rows)}


def surf_strip_lonlat(geo: dict) -> tuple[np.ndarray, np.ndarray]:
    """Every (lon, lat) the extract step will sample: the station scan lines of
    all mapped spots. Cloud is judged HERE, where the measurand is, not over
    the whole window (a cloud over the cliff-top houses costs nothing)."""
    z0, z1, dz = Z_SCAN
    zs = np.arange(z0, z1 + 1e-9, dz)
    lons, lats = [], []
    for p in geo.values():
        if not p.get("contourFit", {}).get("usable"):
            continue
        lo, hi = p["stageBoundsM"][0] + 10, p["stageBoundsM"][1] - 10
        for x in np.arange(np.ceil(lo / STATION_STEP_M) * STATION_STEP_M, hi + 1e-9, STATION_STEP_M):
            enu = np.array([stage_to_enu(p, float(x), float(z)) for z in zs])
            lons.append(ORIGIN_LON + enu[:, 0] / M_PER_DEG_LON)
            lats.append(ORIGIN_LAT + enu[:, 1] / M_PER_DEG_LAT)
    return np.concatenate(lons), np.concatenate(lats)


def scl_window(item_id: str, strip: tuple[np.ndarray, np.ndarray]) -> dict:
    import rasterio
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds
    from pystac_client import Client
    import planetary_computer as pc
    cat = Client.open(STAC, modifier=pc.sign_inplace)
    item = cat.get_collection(COLLECTION).get_item(item_id)
    with rasterio.open(item.assets["SCL"].href) as src:
        b = transform_bounds("EPSG:4326", src.crs, WIN["lon0"], WIN["lat0"], WIN["lon1"], WIN["lat1"])
        w = from_bounds(*b, transform=src.transform)
        inside = (w.col_off >= 0 and w.row_off >= 0
                  and w.col_off + w.width <= src.width and w.row_off + w.height <= src.height)
        a = src.read(1, window=w, boundless=True, fill_value=0)
        meta = {"crs": src.crs, "transform": src.window_transform(w)}
    n = a.size
    cls = {int(k): int(v) for k, v in zip(*np.unique(a, return_counts=True))}
    cloudy = np.isin(a, (3, 8, 9, 10))
    strip_hit = sample_mask_along(cloudy, meta, strip[0], strip[1])
    strip_nodata = sample_mask_along(a == 0, meta, strip[0], strip[1])
    return {"window_inside": bool(inside), "win_px": int(n),
            "win_cloudy_frac": round(float(cloudy.mean()), 3),
            "surf_strip_cloudy_frac": round(float(strip_hit.mean()), 3),
            "surf_strip_nodata_frac": round(float(strip_nodata.mean()), 3),
            "win_water_frac": round(cls.get(6, 0) / n, 3),
            "win_nodata_frac": round(cls.get(0, 0) / n, 3),
            "win_snow_px": cls.get(11, 0), "classes": cls}


def cmd_candidates(args) -> None:
    QA.mkdir(parents=True, exist_ok=True)
    items = stac_items(None)
    (QA / "stac_items_all.json").write_text(json.dumps(items, indent=1))
    hc = sc116_subset(QA / "sc116_hindcast_subset.npz")
    t, Hs, Tp, Dp, fl = (hc[k] for k in ("waveTime", "waveHs", "waveTp", "waveDp", "waveFlagPrimary"))
    by_dt: dict[str, list[dict]] = {}
    for it in items:
        by_dt.setdefault(it["datetime"], []).append(it)
    rows = []
    for d, its in by_dt.items():
        ts = dt.datetime.fromisoformat(d.replace("Z", "+00:00")).timestamp()
        i = int(np.argmin(np.abs(t - ts)))
        rows.append({"datetime": d, "local": utc_to_pdt(d), "hs": round(float(Hs[i]), 3),
                     "tp": round(float(Tp[i]), 2), "dp": round(float(Dp[i]), 1),
                     "flag": int(fl[i]), "sc116_record_utc": dt.datetime.fromtimestamp(int(t[i]), dt.timezone.utc).isoformat(),
                     "items": [{"id": x["id"], "tile": x["tile"], "cloud": x["cloud"]} for x in its]})
    rows.sort(key=lambda r: -r["hs"])
    qualified = [r for r in rows if r["hs"] >= HS_MIN and r["tp"] >= TP_MIN and r["flag"] == 1]
    print(f"{len(rows)} acquisitions, {len(qualified)} with Hs>={HS_MIN}, Tp>={TP_MIN}", file=sys.stderr)
    strip = surf_strip_lonlat(load_geo_profiles()["profiles"])
    for r in qualified:
        r["tide"] = coops_tide(r["datetime"])
        r["scl"] = {}
        for x in r["items"]:
            try:
                r["scl"][x["id"]] = scl_window(x["id"], strip)
            except Exception as e:  # noqa: BLE001 — record the failure as a row, do not stop the table
                r["scl"][x["id"]] = {"error": str(e)[:200]}
        best = None
        for iid, s in r["scl"].items():
            if "error" in s or not s["window_inside"] or s["surf_strip_nodata_frac"] > 0:
                continue
            if best is None or s["surf_strip_cloudy_frac"] < r["scl"][best]["surf_strip_cloudy_frac"]:
                best = iid
        r["best_item"] = best
        tide = r["tide"]["tide_msl_m"]
        reasons = []
        if best is None:
            reasons.append("no tile holds the whole window")
        elif r["scl"][best]["surf_strip_cloudy_frac"] > STRIP_CLOUD_MAX:
            reasons.append(f"surf-strip cloud {r['scl'][best]['surf_strip_cloudy_frac']:.0%}")
        if tide is None:
            reasons.append("no verified tide")
        elif tide > TIDE_MAX:
            reasons.append(f"tide +{tide:.2f} m above +{TIDE_MAX} m")
        r["reject"] = "; ".join(reasons)
        print(f"  {r['datetime'][:16]} Hs {r['hs']:.2f} Tp {r['tp']:5.2f} tide {tide} "
              f"best {best and best.split('_')[5]} strip cloud {best and r['scl'][best]['surf_strip_cloudy_frac']} -> {r['reject'] or 'USABLE'}",
              file=sys.stderr, flush=True)
    out = {"generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
           "thresholds": {"hs_min": HS_MIN, "tp_min": TP_MIN, "tide_max_msl_m": TIDE_MAX, "surf_strip_cloud_max": STRIP_CLOUD_MAX},
           "window_lonlat": WIN, "n_acquisitions": len(rows), "qualified": qualified,
           "all_acquisitions_brief": [{k: r[k] for k in ("datetime", "hs", "tp", "dp", "flag")} for r in rows]}
    (QA / "candidates.json").write_text(json.dumps(out, indent=1))
    print("wrote", QA / "candidates.json", file=sys.stderr)


# ---------------------------------------------------------------- extract
def read_window(item_id: str, out_dir: Path) -> dict:
    """Read the analysis window of BANDS + SCL, save one GeoTIFF, return arrays."""
    import rasterio
    from rasterio.warp import transform_bounds
    from rasterio.windows import from_bounds
    from rasterio.enums import Resampling
    from pystac_client import Client
    import planetary_computer as pc
    cat = Client.open(STAC, modifier=pc.sign_inplace)
    item = cat.get_collection(COLLECTION).get_item(item_id)
    p = item.properties
    arrays, meta, hrefs = {}, None, {}
    for b in BANDS:
        href = item.assets[b].href
        hrefs[b] = href.split("?")[0]
        with rasterio.open(href) as src:
            bb = transform_bounds("EPSG:4326", src.crs, WIN["lon0"], WIN["lat0"], WIN["lon1"], WIN["lat1"])
            w = from_bounds(*bb, transform=src.transform).round_offsets().round_lengths()
            arrays[b] = src.read(1, window=w)
            if meta is None:
                meta = {"crs": src.crs, "transform": src.window_transform(w),
                        "height": arrays[b].shape[0], "width": arrays[b].shape[1]}
    href = item.assets["SCL"].href
    hrefs["SCL"] = href.split("?")[0]
    with rasterio.open(href) as src:
        bb = transform_bounds("EPSG:4326", src.crs, WIN["lon0"], WIN["lat0"], WIN["lon1"], WIN["lat1"])
        w = from_bounds(*bb, transform=src.transform)
        arrays["SCL"] = src.read(1, window=w, out_shape=(meta["height"], meta["width"]),
                                 resampling=Resampling.nearest, boundless=True, fill_value=0)
    out_dir.mkdir(parents=True, exist_ok=True)
    tif = out_dir / "window.tif"
    with rasterio.open(tif, "w", driver="GTiff", dtype="uint16", count=len(BANDS) + 1,
                       crs=meta["crs"], transform=meta["transform"],
                       height=meta["height"], width=meta["width"], compress="deflate") as dst:
        for i, b in enumerate(BANDS + ("SCL",), start=1):
            dst.write(arrays[b].astype("uint16"), i)
            dst.set_band_description(i, b)
    pb = float(p.get("s2:processing_baseline") or 0)
    offset = -1000.0 if pb >= 4.0 else 0.0     # BOA_ADD_OFFSET from PB 04.00 (2022-01-25)
    return {"arrays": arrays, "meta": meta, "tif": tif, "sha256": sha256(tif),
            "hrefs": hrefs, "properties": {k: p.get(k) for k in
                                           ("datetime", "eo:cloud_cover", "s2:mgrs_tile", "s2:processing_baseline",
                                            "platform", "s2:datatake_id", "view:sun_elevation", "view:sun_azimuth")},
            "reflectance_offset": offset}


def _drop_small(m: np.ndarray) -> np.ndarray:
    from scipy import ndimage
    lab, n = ndimage.label(m)
    if not n:
        return m
    sizes = ndimage.sum(m, lab, index=np.arange(1, n + 1))
    return m & np.isin(lab, np.nonzero(sizes >= MIN_COMPONENT_PX)[0] + 1)


def whitewater_masks(arrays: dict, offset: float) -> dict:
    """Calibrated foam masks; returns masks and the calibration numbers.

    Two tiers, both calibrated on the scene's own SCL-water pixels:

    foam   NIR (B08) above water median + K*MAD. Clear water is nearly black
           in NIR (median 0.001-0.005, MAD 0.001-0.004 on these scenes), so
           the sparse streaks of a wave breaking on the outer reef clear the
           bar; shallow sand bottom, bright in red, stays dark here. Kelp
           canopy (the beds 300-500 m off Sewers/First Peak) is NIR-bright
           too, but it is BLUE-DARK where foam is white: a foam pixel's blue
           excess over clear water is ~1.5x its NIR excess (measured on the
           2023-09-26 outer streaks: dB02 0.022 vs dB08 0.030), a kelp
           pixel's is <= 0. The mask therefore also requires
           (B02 - median) > 0.5 * (B08 - median). NDWI > -0.05 and SCL in
           {6, 11} keep it off land, exposed reef and cloud; SCL 11 ("snow")
           is what dense foam is classed as on every scene.
    dense  red (B04) above water median + 6*MAD — the continuous inner band
           of bores and swash. Recorded per station as the "reform line"
           falsifier: its outer edge is NOT the break locus.
    """
    refl = {b: (arrays[b].astype("float64") + offset) / 10000.0 for b in BANDS}
    blue, g, nir, red = refl["B02"], refl["B03"], refl["B08"], refl["B04"]
    ndwi = (g - nir) / np.maximum(g + nir, 1e-6)
    scl = arrays["SCL"]
    water = scl == 6
    calib_nir, calib_red, calib_blue = nir[water], red[water], blue[water]
    med_n = float(np.median(calib_nir)); mad_n = float(np.median(np.abs(calib_nir - med_n))) * 1.4826
    med_r = float(np.median(calib_red)); mad_r = float(np.median(np.abs(calib_red - med_r))) * 1.4826
    med_b = float(np.median(calib_blue))
    white = (blue - med_b) > 0.5 * (nir - med_n)          # foam is white; kelp is blue-dark
    water_like = np.isin(scl, (6, 11)) & (ndwi > -0.05) & white
    masks, thr = {}, {}
    for K in K_ARMS:
        t = med_n + K * mad_n
        masks[K] = _drop_small(water_like & (nir > t))
        thr[K] = t
    dense_t = med_r + K_SHIPPED * mad_r
    dense = _drop_small(np.isin(scl, (6, 11)) & (ndwi > 0.0) & (red > dense_t))
    return {"masks": masks, "thresholds": thr, "nir_median": med_n, "nir_mad": mad_n,
            "dense": dense, "dense_threshold": dense_t, "red_median": med_r, "red_mad": mad_r,
            "ndwi": ndwi, "refl": refl, "n_calib_px": int(calib_nir.size)}


def sample_mask_along(mask: np.ndarray, meta: dict, lon: np.ndarray, lat: np.ndarray) -> np.ndarray:
    from rasterio.warp import transform
    xs, ys = transform("EPSG:4326", meta["crs"], list(lon), list(lat))
    inv = ~meta["transform"]
    cols, rows = [], []
    for x, y in zip(xs, ys):
        c, r = inv * (x, y)
        cols.append(int(np.floor(c)))
        rows.append(int(np.floor(r)))
    cols, rows = np.array(cols), np.array(rows)
    ok = (cols >= 0) & (rows >= 0) & (cols < mask.shape[1]) & (rows < mask.shape[0])
    out = np.zeros(len(cols), dtype=bool)
    out[ok] = mask[rows[ok], cols[ok]]
    return out


def edges_along_scan(hit: np.ndarray, zs: np.ndarray) -> tuple[float | None, float | None]:
    """Seaward-most and shoreward-most whitewater z with a run >= MIN_RUN_M."""
    dz = zs[1] - zs[0]
    need = max(int(round(MIN_RUN_M / dz)), 1)
    outer = inner = None
    run = 0
    for i, h in enumerate(hit):
        run = run + 1 if h else 0
        if run >= need:
            z_start = zs[i - need + 1]
            if outer is None:
                outer = float(z_start)
            inner = float(zs[i])
    return outer, inner


def cmd_extract(args) -> None:
    geo = load_geo_profiles()["profiles"]
    cands = json.loads((QA / "candidates.json").read_text())
    want = [s.strip() for s in args.scenes.split(",") if s.strip()]
    supp = {s.strip() for s in (args.supplementary or "").split(",") if s.strip()}
    loci = {"generated_utc": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
            "window_lonlat": WIN, "k_shipped": K_SHIPPED, "k_arms": list(K_ARMS),
            "station_step_m": STATION_STEP_M, "z_scan": Z_SCAN, "min_run_m": MIN_RUN_M,
            "min_component_px": MIN_COMPONENT_PX, "scenes": []}
    for item_id in want + sorted(supp):
        row = next((r for r in cands["qualified"] if item_id in r["scl"]), None)
        if row is None:
            raise SystemExit(f"{item_id} is not in candidates.json qualified rows")
        date = row["datetime"][:10]
        print(f"[{date}] reading window {item_id}", file=sys.stderr, flush=True)
        win = read_window(item_id, QA / item_id)
        ww = whitewater_masks(win["arrays"], win["reflectance_offset"])
        cloudy = np.isin(win["arrays"]["SCL"], (3, 8, 9, 10))
        scene = {"id": item_id, "date": date, "datetime_utc": row["datetime"], "local": row["local"],
                 "supplementary": item_id in supp, "reject_reason": row.get("reject", ""),
                 "sc116": {"hs": row["hs"], "tp": row["tp"], "dp": row["dp"], "record_utc": row["sc116_record_utc"]},
                 "tide_msl_m": row["tide"]["tide_msl_m"], "tide_url": row["tide"]["url"],
                 "properties": win["properties"], "cog_hrefs": win["hrefs"],
                 "raster": {"path": str(win["tif"].relative_to(ROOT)), "sha256": win["sha256"],
                            "crs": str(win["meta"]["crs"]), "transform": list(win["meta"]["transform"])[:6],
                            "shape": [win["meta"]["height"], win["meta"]["width"]],
                            "reflectance_offset": win["reflectance_offset"]},
                 "calibration": {"nir_median": round(ww["nir_median"], 5), "nir_mad": round(ww["nir_mad"], 5),
                                 "red_median": round(ww["red_median"], 5), "red_mad": round(ww["red_mad"], 5),
                                 "n_calib_px": ww["n_calib_px"],
                                 "foam_nir_thresholds": {str(k): round(v, 5) for k, v in ww["thresholds"].items()},
                                 "foam_mask_px": {str(k): int(m.sum()) for k, m in ww["masks"].items()},
                                 "dense_red_threshold": round(ww["dense_threshold"], 5),
                                 "dense_mask_px": int(ww["dense"].sum())},
                 "scl_window": row["scl"][item_id], "spots": {}}
        z0, z1, dz = Z_SCAN
        zs = np.arange(z0, z1 + 1e-9, dz)
        for name, p in geo.items():
            if not p.get("contourFit", {}).get("usable"):
                continue
            lo, hi = p["stageBoundsM"][0] + 10, p["stageBoundsM"][1] - 10
            xs = np.arange(np.ceil(lo / STATION_STEP_M) * STATION_STEP_M, hi + 1e-9, STATION_STEP_M)
            stations, cloud_hits = [], []
            for x in xs:
                enu = np.array([stage_to_enu(p, float(x), float(z)) for z in zs])
                lon = ORIGIN_LON + enu[:, 0] / M_PER_DEG_LON
                lat = ORIGIN_LAT + enu[:, 1] / M_PER_DEG_LAT
                st = {"x": float(x)}
                for K in K_ARMS:
                    hit = sample_mask_along(ww["masks"][K], win["meta"], lon, lat)
                    outer, inner = edges_along_scan(hit, zs)
                    st[f"outer_k{K:g}"] = outer
                    st[f"inner_k{K:g}"] = inner
                d_outer, _ = edges_along_scan(sample_mask_along(ww["dense"], win["meta"], lon, lat), zs)
                st["dense_outer"] = d_outer
                c = sample_mask_along(cloudy, win["meta"], lon, lat)
                st["cloud_frac"] = round(float(c.mean()), 3)
                cloud_hits.append(c)
                stations.append(st)
            outer = [s[f"outer_k{K_SHIPPED:g}"] for s in stations if s[f"outer_k{K_SHIPPED:g}"] is not None]
            dense = [s["dense_outer"] for s in stations if s["dense_outer"] is not None]
            cloud_frac = round(float(np.concatenate(cloud_hits).mean()), 3) if cloud_hits else None
            scene["spots"][name] = {
                "stations": stations, "n_stations": len(stations), "n_with_whitewater": len(outer),
                "cloud_frac_on_stations": cloud_frac,
                # seaward envelope (q10 across stations) and median of the foam outer edge
                "z_obs_median": None if not outer else round(float(np.median(outer)), 1),
                "z_obs_q10": None if not outer else round(float(np.percentile(outer, 10)), 1),
                "z_dense_median": None if not dense else round(float(np.median(dense)), 1)}
            print(f"  {name:14s} stations {len(stations)} foam {len(outer)} z_obs med {scene['spots'][name]['z_obs_median']} "
                  f"q10 {scene['spots'][name]['z_obs_q10']} dense med {scene['spots'][name]['z_dense_median']} cloud {cloud_frac}",
                  file=sys.stderr)
        # the outer-edge polyline (shipped K) in lat/lon, for the figure and the record
        poly = []
        for name, sp in scene["spots"].items():
            p = geo[name]
            for st in sp["stations"]:
                z = st[f"outer_k{K_SHIPPED:g}"]
                if z is None:
                    continue
                lon, lat = enu_to_lonlat(*stage_to_enu(p, st["x"], z))
                poly.append([name, st["x"], round(lon, 6), round(lat, 6)])
        scene["outer_edge_polyline"] = poly
        loci["scenes"].append(scene)
    ASSETS.mkdir(parents=True, exist_ok=True)
    (ASSETS / "loci.json").write_text(json.dumps(loci, separators=(",", ":")))
    print("wrote", ASSETS / "loci.json", file=sys.stderr)


# ---------------------------------------------------------------- overlay
def cmd_overlay(args) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import rasterio
    from rasterio.warp import transform
    loci = json.loads((ASSETS / "loci.json").read_text())
    lines = json.loads((ASSETS / "model_lines.json").read_text())
    geo = load_geo_profiles()["profiles"]
    arm_style = {"reef": ("#ff3b30", "-"), "plane": ("#ffd60a", "--"), "measured": ("#30d158", ":")}
    for scene in loci["scenes"]:
        if scene.get("supplementary"):
            continue
        tif = ROOT / scene["raster"]["path"]
        with rasterio.open(tif) as src:
            bands = {src.descriptions[i - 1]: src.read(i).astype("float64") for i in range(1, src.count + 1)}
            crs, T = src.crs, src.transform
            H, W = src.height, src.width
        off = scene["raster"]["reflectance_offset"]
        rgb = np.dstack([(bands[b] + off) / 10000.0 for b in ("B04", "B03", "B02")])
        rgb = np.clip((rgb - 0.0) / 0.25, 0, 1) ** 0.8           # stretch: 0..0.25 reflectance
        ww = whitewater_masks({b: bands[b] for b in BANDS} | {"SCL": bands["SCL"].astype("uint8")}, off)
        mask = ww["masks"][K_SHIPPED]
        extent = (T.c, T.c + W * T.a, T.f + H * T.e, T.f)
        fig, ax = plt.subplots(figsize=(9, 7.4), dpi=110)
        ax.imshow(rgb, extent=extent, interpolation="nearest")
        over = np.zeros((H, W, 4))
        over[mask] = (0.2, 0.7, 1.0, 0.55)
        ax.imshow(over, extent=extent, interpolation="nearest")
        # OSM spot nodes + shore-normal through each stage origin
        for name, p in geo.items():
            if not p.get("contourFit", {}).get("usable"):
                continue
            lon, lat = enu_to_lonlat(*p["stageOriginENU"])
            x, y = transform("EPSG:4326", crs, [lon], [lat])
            ax.plot(x, y, "w+", ms=9, mew=1.4)
            ax.annotate(name, (x[0], y[0]), xytext=(4, 4), textcoords="offset points",
                        color="white", fontsize=7.5, fontweight="bold")
        scene_lines = lines["scenes"].get(scene["id"], {})
        drawn = set()
        for spot, per_arm in scene_lines.get("spots", {}).items():
            for arm, rec in per_arm.items():
                pts = rec.get("lonlat")
                if not pts:
                    continue
                x, y = transform("EPSG:4326", crs, [q[0] for q in pts], [q[1] for q in pts])
                c, ls = arm_style[arm]
                ax.plot(x, y, color=c, ls=ls, lw=1.4, label=None if arm in drawn else f"model bed={arm}")
                drawn.add(arm)
        # observed outer edge (shipped K)
        px = [q[2] for q in scene["outer_edge_polyline"]]
        py = [q[3] for q in scene["outer_edge_polyline"]]
        if px:
            x, y = transform("EPSG:4326", crs, px, py)
            ax.plot(x, y, "o", color="#ffffff", ms=2.2, label=f"whitewater outer edge (K={K_SHIPPED:g})")
        ax.legend(loc="lower right", fontsize=7.5, framealpha=0.85)
        h0 = scene_lines.get("forcing", {})
        ax.set_title(f"{scene['id']}\n{scene['local']}  SC116 Hs {scene['sc116']['hs']:.2f} m  Tp {scene['sc116']['tp']:.1f} s  "
                     f"Dp {scene['sc116']['dp']:.0f}  tide {scene['tide_msl_m']:+.2f} m MSL  "
                     f"H0 {h0.get('H0_hs', float('nan')):.2f}/{h0.get('H0_deshoaled', float('nan')):.2f} m", fontsize=8.5)
        ax.set_xlabel(f"{crs} easting (m)", fontsize=8)
        ax.set_ylabel("northing (m)", fontsize=8)
        ax.tick_params(labelsize=7)
        fig.tight_layout()
        out = ASSETS / f"overlay-{scene['date']}.png"
        fig.savefig(out, dpi=110)
        plt.close(fig)
        print("wrote", out, f"{out.stat().st_size / 1024:.0f} KB", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("candidates")
    e = sub.add_parser("extract")
    e.add_argument("--scenes", required=True, help="comma-separated STAC item ids from candidates.json")
    e.add_argument("--supplementary", default="", help="item ids measured but flagged (fail a selection rule); no overlay")
    sub.add_parser("overlay")
    args = ap.parse_args()
    {"candidates": cmd_candidates, "extract": cmd_extract, "overlay": cmd_overlay}[args.cmd](args)


if __name__ == "__main__":
    main()
