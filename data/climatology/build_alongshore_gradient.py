#!/usr/bin/env python3
"""Alongshore Hs gradient across the Pleasure Point canon, from CDIP MOP v1.1.

The shipped climatology (pp_cdip_climatology.json, pp_monthly_ocean.js) is ONE
transect, SC116, whose backbeach point lands between First Peak and Second
Peak (CA_v1.1_transect_definitions.txt, columns 3-4). A `#month=` state applies
that transect's p75 at every spot's reef anchor, while the preset bank encodes
a 2.2 -> 0.7 m card gradient along the point (params.js). This script measures
what MOP itself says about the gradient: monthly Hs percentiles at the ten
transects SC109..SC118 whose backbeach points span Private's (SC109) to west of
Sewers (SC118), and each transect's ratio to SC116.

MOP is a linear refraction model evaluated on the 10-15 m contour, ~1 km off
these spots. It carries the apex-shadow / refraction gradient at that contour
and nothing about the reef. That is the same caveat pp_cdip_climatology.json
already carries; this file adds a second axis to it, not a new kind of truth.

Usage:
  python3 data/climatology/build_alongshore_gradient.py            # pull + build
  python3 data/climatology/build_alongshore_gradient.py --offline  # cache only
Output: data/climatology/pp_mop_alongshore.json. Raw pulls cache under
data/climatology/.cache/ (gitignored, regenerable).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CACHE_DIR = HERE / ".cache"
OUT_PATH = HERE / "pp_mop_alongshore.json"
DEFS_URL = "http://cdip.ucsd.edu/MOP_v1.1/CA_v1.1_transect_definitions.txt"
BASE = "https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_alongshore/{t}_hindcast.nc"

TRANSECTS = [f"SC{n}" for n in range(109, 119)]   # SC109 (Private's) .. SC118 (west of Sewers)
REFERENCE = "SC116"                                 # the shipped climatology's transect
VARS = ("waveHs", "waveFlagPrimary")
GOOD_FLAG = 1
CHUNK = 40000
TIMEOUT_S = 180
RETRIES = 4
YEAR_MIN, YEAR_MAX = 2000, 2024
MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]
# The reference file's time axis, from pp_cdip_climatology.json: hourly,
# 1999-12-31T23:30Z .. 2025-03-31T23:30Z, 221,328 records. Every transect is
# checked against it (first/last stamp and length) before its Hs is binned on
# the reconstructed axis, so the pull can skip waveTime.
T0_ISO = "1999-12-31T23:30:00Z"
N_REF = 221328

# OSM surf nodes (data/osm/pp_geometry.json) so each transect's backbeach
# point can be named by the nearest canon spot. Lat/lon, degrees.
SPOTS = {
    "Suicide's": (36.9539085, -121.9748546), "Sewer Peak": (36.9535308, -121.9728983),
    "First Peak": (36.9545866, -121.9709742), "Second Peak": (36.9555205, -121.9702184),
    "38th": (36.9574939, -121.9677716), "The Hook": (36.9593054, -121.9643858),
    "Shark's Cove": (36.9609104, -121.9624799), "Private's": (36.9632137, -121.960258),
}


def _fetch(url: str) -> str:
    last: Exception | None = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pointbreak/alongshore"})
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"fetch failed after {RETRIES} attempts: {url}") from last


def _parse_ascii_var(text: str, name: str) -> np.ndarray:
    """Same OPeNDAP .ascii parser as build_cdip_climatology.py."""
    lines = text.splitlines()
    start = None
    for i, ln in enumerate(lines):
        s = ln.strip()
        if s.startswith((f"{name}[", f"{name}.{name}[")):
            start = i + 1
            break
    if start is None:
        raise RuntimeError(f"variable {name} not in response")
    buf: list[str] = []
    for ln in lines[start:]:
        s = ln.strip()
        if not s:
            break
        if "[" in s and "]" in s and "," not in s.split("[")[0]:
            head = s.split("[")[0]
            if head and not head[0].isdigit() and head[0] not in "-+.":
                break
        buf.append(s)
    raw = " ".join(buf)
    vals = [v.strip() for v in raw.split(",") if v.strip()]
    return np.array([float(v) for v in vals], dtype=np.float64)


def _epoch(iso: str) -> int:
    return int(datetime.strptime(iso, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc).timestamp())


def _pull_transect(t: str, offline: bool) -> dict[str, np.ndarray]:
    cache = CACHE_DIR / f"{t}_hindcast_hs.npz"
    if cache.exists():
        z = np.load(cache)
        return {k: z[k] for k in z.files}
    if offline:
        raise RuntimeError(f"--offline but no cache for {t}: {cache}")
    base = BASE.format(t=t)
    dds = _fetch(base + ".dds")
    m = re.search(r"waveTime\s*=\s*(\d+)", dds)
    if not m:
        raise RuntimeError(f"{t}: no waveTime dimension in .dds")
    n = int(m.group(1))
    # time-axis check: first and last stamps against the reference axis. Two
    # requests: OPeNDAP refuses two references to one variable in a constraint.
    t_first = int(_parse_ascii_var(_fetch(f"{base}.ascii?waveTime[0:1:0]"), "waveTime")[0])
    t_last = int(_parse_ascii_var(_fetch(f"{base}.ascii?waveTime[{n - 1}:1:{n - 1}]"), "waveTime")[0])
    # Same length and hourly cadence as the reference; the stamp may sit on the
    # hour or the half hour (SC109 stamps :00 where SC116 stamps :30), which
    # binning by month does not see. The axis is rebuilt from each file's own
    # first stamp.
    if n != N_REF or (t_last - t_first) != 3600 * (n - 1) or abs(t_first - _epoch(T0_ISO)) > 1800:
        raise RuntimeError(f"{t}: time axis differs from the reference "
                           f"(n {n}, first {t_first}, last {t_last})")
    cols: dict[str, list[np.ndarray]] = {v: [] for v in VARS}
    for lo in range(0, n, CHUNK):
        hi = min(lo + CHUNK, n) - 1
        idx = f"[{lo}:1:{hi}]"
        text = _fetch(f"{base}.ascii?" + ",".join(f"{v}{idx}" for v in VARS))
        for v in VARS:
            cols[v].append(_parse_ascii_var(text, v))
        print(f"  {t}: {hi + 1:,}/{n:,}", end="\r", flush=True)
    print(" " * 40, end="\r")
    out = {v: np.concatenate(cols[v]) for v in VARS}
    if any(len(a) != n for a in out.values()):
        raise RuntimeError(f"{t}: ragged pull {[len(a) for a in out.values()]}")
    out["timeFirst"] = np.array([t_first])
    CACHE_DIR.mkdir(exist_ok=True)
    np.savez_compressed(cache, **out)
    return out


def _defs() -> dict[str, dict]:
    cache = CACHE_DIR / "CA_v1.1_transect_definitions.txt"
    if not cache.exists():
        CACHE_DIR.mkdir(exist_ok=True)
        cache.write_text(_fetch(DEFS_URL))
    rows = {}
    for ln in cache.read_text().splitlines():
        p = ln.split("\t")
        if len(p) >= 9 and p[1] in TRANSECTS:
            rows[p[1]] = {"backbeachLon": float(p[2]), "backbeachLat": float(p[3]),
                          "siteLon": float(p[4]), "siteLat": float(p[5]),
                          "siteDepthM": float(p[6]), "shoreNormalDeg": float(p[7]),
                          "shoreType": int(p[8])}
    return rows


def _nearest_spot(lat: float, lon: float) -> tuple[str, float]:
    best, bd = None, 1e9
    for name, (slat, slon) in SPOTS.items():
        d = ((lat - slat) * 111_000) ** 2 + ((lon - slon) * 88_900) ** 2
        if d < bd:
            best, bd = name, d
    return best, round(bd ** 0.5)


def build(offline: bool) -> dict:
    defs = _defs()
    axis_cache: dict[int, tuple[np.ndarray, np.ndarray]] = {}

    def axis_for(t_first: int) -> tuple[np.ndarray, np.ndarray]:
        if t_first not in axis_cache:
            axis = t_first + 3600 * np.arange(N_REF, dtype=np.int64)
            dt = np.array([datetime.fromtimestamp(int(s), tz=timezone.utc) for s in axis])
            axis_cache[t_first] = (np.array([d.year for d in dt]), np.array([d.month for d in dt]))
        return axis_cache[t_first]

    per: dict[str, dict] = {}
    for t in TRANSECTS:
        d = _pull_transect(t, offline)
        hs, flag = d["waveHs"], d["waveFlagPrimary"]
        year, month = axis_for(int(d["timeFirst"][0]))
        in_years = (year >= YEAR_MIN) & (year <= YEAR_MAX)
        good = in_years & (flag == GOOD_FLAG) & np.isfinite(hs)
        spot, dist = _nearest_spot(defs[t]["backbeachLat"], defs[t]["backbeachLon"])
        months = {}
        for mi, name in enumerate(MONTHS, start=1):
            sel = good & (month == mi)
            h = hs[sel]
            months[name] = {"n": int(sel.sum()),
                            "p50": round(float(np.percentile(h, 50)), 3),
                            "p75": round(float(np.percentile(h, 75)), 3),
                            "p90": round(float(np.percentile(h, 90)), 3),
                            "mean": round(float(h.mean()), 3)}
        per[t] = {**defs[t], "nearestSpot": spot, "nearestSpotDistM": dist,
                  "nGood": int(good.sum()),
                  "year": {"p50": round(float(np.percentile(hs[good], 50)), 3),
                           "p75": round(float(np.percentile(hs[good], 75)), 3),
                           "p90": round(float(np.percentile(hs[good], 90)), 3),
                           "mean": round(float(hs[good].mean()), 3)},
                  "months": months}
        print(f"  {t} -> {spot} ({dist} m): year p75 {per[t]['year']['p75']}")

    ref = per[REFERENCE]
    for t in TRANSECTS:
        p = per[t]
        p["ratioToRef"] = {
            "year": {k: round(p["year"][k] / ref["year"][k], 3) for k in ("p50", "p75", "p90", "mean")},
            "months": {m: {k: round(p["months"][m][k] / ref["months"][m][k], 3)
                           for k in ("p50", "p75", "p90", "mean")} for m in MONTHS},
        }

    # hour-matched ratio at the reference: median over hours of Hs_t / Hs_ref,
    # which is the gradient a single day sees, as opposed to a ratio of
    # climatological percentiles
    ref_d = _pull_transect(REFERENCE, offline)
    ref_hs, ref_flag = ref_d["waveHs"], ref_d["waveFlagPrimary"]
    ref_year, ref_month = axis_for(int(ref_d["timeFirst"][0]))
    for t in TRANSECTS:
        d = _pull_transect(t, offline)
        # hour-matched by index: every file is hourly with the same length, and
        # the stamps differ by at most 30 min, so index i is the same hour.
        year, month = ref_year, ref_month
        in_years = (year >= YEAR_MIN) & (year <= YEAR_MAX)
        both = in_years & (d["waveFlagPrimary"] == GOOD_FLAG) & (ref_flag == GOOD_FLAG) \
            & np.isfinite(d["waveHs"]) & np.isfinite(ref_hs) & (ref_hs > 0.05)
        r = d["waveHs"][both] / ref_hs[both]
        per[t]["hourMatchedRatio"] = {
            "year": {"p50": round(float(np.percentile(r, 50)), 3),
                     "p10": round(float(np.percentile(r, 10)), 3),
                     "p90": round(float(np.percentile(r, 90)), 3)},
            "months": {},
        }
        for mi, name in enumerate(MONTHS, start=1):
            sel = both & (month == mi)
            rm = d["waveHs"][sel] / ref_hs[sel]
            per[t]["hourMatchedRatio"]["months"][name] = {
                "p50": round(float(np.percentile(rm, 50)), 3),
                "p10": round(float(np.percentile(rm, 10)), 3),
                "p90": round(float(np.percentile(rm, 90)), 3)}

    caches = sorted(CACHE_DIR.glob("SC1*_hindcast_hs.npz"))
    sha = hashlib.sha256()
    for c in caches:
        sha.update(c.read_bytes())
    return {
        "source": {
            "name": "CDIP MOP v1.1 alongshore hindcast, transects SC109-SC118",
            "endpoint": BASE,
            "transectDefinitions": DEFS_URL,
            "reference": REFERENCE,
            "yearsUsed": f"{YEAR_MIN}-{YEAR_MAX} (whole calendar years)",
            "qc": "waveFlagPrimary == 1",
            "timeAxis": f"reconstructed hourly from {T0_ISO}, {N_REF} records; first/last stamp and length "
                        "checked per transect against the reference",
            "caveat": "MOP is a linear refraction model on the 10-15 m contour, ~1 km off these spots; "
                      "it resolves the apex/refraction gradient at that contour and nothing about the reef",
            "cacheSha256": sha.hexdigest(),
            "built": datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "transects": per,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--offline", action="store_true", help="use cached pulls only")
    a = ap.parse_args()
    out = build(a.offline)
    OUT_PATH.write_text(json.dumps(out, indent=1) + "\n")
    print(f"wrote {OUT_PATH}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
