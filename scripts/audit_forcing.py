#!/usr/bin/env python3
"""Forcing audit: is the water the model is fed the water that arrives at
Pleasure Point?  (docs/research/FORCING_AUDIT_2026-09-23.md)

Six questions, one script, one JSON per question under
docs/research/assets/forcing-2026-09-23/ plus a summary.json.  Raw pulls
land in qa/forcing-audit/ (gitignored) and are re-used if present, so a
rerun is offline once the pulls exist.

  1. deshoal    Ks(15.03 m) and Ks(10 m) from the model's own dispersion
                (Guo 2002 + finite-depth cg, the same maths as
                web-three/js/dispersion.js) -> how much #day=live and the
                monthly table over-force H0, per period.  The proposed
                correction is `deshoal_h0()` below.
  2. cards      where each preset card and each month entry sits in the
                SC116 hindcast (2000-2024) by season, in the 15 m frame.
  3. days       the SC116 nowcast records and 9413450 tide for the two
                pre-registered field days, and the hashes that reproduce them.
  4. sets       authored dF vs the spectral bandwidth the nowcast spectra
                (2025-04 .. 2026-09) support; envelope-floor estimator A
                re-run on those spectra against the hindcast bracket.
  5. datums     the tide datum chain, every constant against CO-OPS.
  6. direction  how often Hs > 1 m arrives outside the 188-216 deg band.

Sources (all fetched by this script; URLs recorded in the outputs):
  https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_alongshore/SC116_hindcast.nc   (via build_cdip_climatology._pull)
  https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_alongshore/SC116_nowcast.nc
  https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9413450/datums.json
  https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9413745/tidepredoffsets.json
  https://api.tidesandcurrents.noaa.gov/api/prod/datagetter  (predictions, water_level, hilo)
  http://cdip.ucsd.edu/MOP_v1.1/CA_v1.1_transect_definitions.txt

Usage:
    python3 scripts/audit_forcing.py            # fetch what is missing, build
    python3 scripts/audit_forcing.py --offline  # refuse to fetch

Needs numpy only (Homebrew python3 has it).  No netCDF4: everything comes
down as OPeNDAP ASCII, which is why the spectra are pulled for the 16-month
nowcast and not for 25 years of hindcast.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "qa" / "forcing-audit"
OUT = ROOT / "docs" / "research" / "assets" / "forcing-2026-09-23"
CACHE = ROOT / "data" / "climatology" / ".cache" / "sc116_hindcast_bulk.npz"

MOP = "https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_alongshore"
NOWCAST = f"{MOP}/SC116_nowcast.nc"
HINDCAST = f"{MOP}/SC116_hindcast.nc"
COOPS_API = "https://api.tidesandcurrents.noaa.gov/api/prod/datagetter"
COOPS_MD = "https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations"
TRANSECTS = "http://cdip.ucsd.edu/MOP_v1.1/CA_v1.1_transect_definitions.txt"

URLS_USED: list[str] = []
OFFLINE = False
# Every endpoint this audit reads, independent of which run fetched them.
SOURCES = [
    HINDCAST + " (.dds, .das, .ascii bulk in 20k chunks via build_cdip_climatology._pull)",
    NOWCAST + " (.dds, .das, .ascii bulk, .ascii waveEnergyDensity[all][20], metaWaterDepth, metaShoreNormal)",
    f"{COOPS_MD}/9413450/datums.json?units=metric",
    f"{COOPS_MD}/9413745/datums.json?units=metric",
    f"{COOPS_MD}/9413745.json",
    f"{COOPS_MD}/9413745/tidepredoffsets.json",
    COOPS_API + "?station=9413450&product=predictions&datum=MSL&units=metric&interval=6&time_zone=lst_ldt (2026-08-15, 2026-09-05)",
    COOPS_API + "?station=9413450&product=water_level&datum=MSL&units=metric&interval=6&time_zone=lst_ldt (2026-08-15, 2026-09-05)",
    COOPS_API + "?station=9413450|9413745&product=predictions&datum=MLLW&units=english&interval=hilo (2026-08-15, 2026-09-05)",
    TRANSECTS,
    "https://thredds.cdip.ucsd.edu/thredds/catalog/cdip/model/MOP_alongshore/catalog.html (SC116 product list)",
    "https://vdatum.noaa.gov/vdatumweb/api/convert (NAVD88->LMSL at Pleasure Point; returned errorCode 412, unresolved)",
]

# ---------------------------------------------------------------- the model
# Constants the audit checks, copied from the code they live in so a drift
# shows up as a mismatch here rather than silently.  Do not "fix" these to
# make the audit pass; fix the doc's finding.
G = 9.81
GAMMA = 0.78                       # dispersion.js GAMMA
KS_CLAMP = (0.7, 2.6)              # shoalingKsAt / shoaledHeight clamp
SC116_DEPTH_M = 15.03              # metaWaterDepth in both SC116 files (fetched below)
BUILDER_DESHOAL_T_S = 14.8         # build_cdip_climatology.DESHOAL_T_S
BUILDER_DEPTH_M = 15.0             # build_cdip_climatology.SC116_DEPTH_M
MSL_ABOVE_NAVD88 = 0.905           # bed.js / pp_depth_patches mslAboveNavd88M
TIDE_RANGE = (-0.862, 0.764)       # bed.js TIDE_RANGE, MLLW..MHHW about MSL
REEF_CEIL_NAVD88 = -0.5            # bed.js REEF_CEIL_EL
H0_CLAMP = (0.4, 3.0)              # params.js H0_DEF / cdip.js applyOcean
T_CLAMP = (8, 18)                  # cdip.js applyOcean
SET_DEPTH_M = 0.425                # model-glsl u_setDepth default (floor 0.15)

# shared/params.js PRESETS (H0, T, dF) and the transect each spot reads from
# (data/climatology/pp_mop_alongshore.json nearestSpot; First Peak has no
# transect of its own and sits between SC116 and SC117 per the README).
PRESETS = {
    "sewers":     {"label": "Sewers",       "H0": 2.2, "T": 15, "dF": 0.008, "transect": "SC117"},
    "firstpeak":  {"label": "First Peak",   "H0": 1.8, "T": 14, "dF": 0.007, "transect": "SC116"},
    "secondpeak": {"label": "Second Peak",  "H0": 1.5, "T": 14, "dF": 0.006, "transect": "SC116"},
    "jacks":      {"label": "Jack's (38th)", "H0": 1.1, "T": 13, "dF": 0.006, "transect": "SC114"},
    "thehook":    {"label": "The Hook",     "H0": 1.5, "T": 13, "dF": 0.007, "transect": "SC112"},
    "sharks":     {"label": "Sharks",       "H0": 1.0, "T": 13, "dF": 0.006, "transect": "SC111"},
    "privates":   {"label": "Privates",     "H0": 0.7, "T": 12, "dF": 0.006, "transect": "SC109"},
}
# shared/params.js PEEL_FLOOR floorH0 / basisT (tide 0). Used only to ask
# whether the de-shoal flips any month's clamp verdict; never to clamp.
PEEL_FLOOR = {
    "sewers": (1.62, 15), "firstpeak": (1.38, 14), "secondpeak": (1.11, 14),
    "jacks": (0.78, 13), "thehook": (1.09, 13), "sharks": (0.81, 13),
}
# web-three/js/conditions.js CONDITION_DAYS: the only way a hash sets T.
CONDITION_DAYS = {
    "small": 9, "modelcard": 14, "pulse": 12, "foggy": 13,
    "overhead": 16, "big": 17, "stormy": 10,
}
CONDITION_DAY_TIDE = {
    "small": 0.35, "modelcard": 0.0, "pulse": 0.2, "foggy": 0.15,
    "overhead": -0.6, "big": -0.2, "stormy": 0.6,
}

# The two pre-registered days.  Times are what the notes record; the SC116
# record is the hourly one whose +-30 min bounds contain that time.
FIELD_DAYS = [
    {
        "key": "2026-08-15",
        "note": "docs/research/PLEASURE_POINT_CAPTURE_2026-08-15.md (afternoon Surfline cam clip, 15:28 PDT; page reported 3 ft at 16 s SSW 202 deg, tide 4.0 ft after a 5.2 ft high at 13:22)",
        "when_utc": "2026-08-15T22:28:00Z",
        "when_local": "2026-08-15 15:28 PDT",
        "date": "20260815",
        "spot": "secondpeak",
        "reported": {"hs_ft": 3, "tp_s": 16, "dp_deg": 202, "tide_ft_mllw": 4.0},
        # the clip's own carrier: 16 s recurrence r=0.942, intervals 15.9/16.6 s
        "carrier_evidence_s": 16.25,
        "carrier_evidence": "measured in the clip (PLEASURE_POINT_CAPTURE_2026-08-15 'What the afternoon recording establishes')",
    },
    {
        "key": "2026-09-05",
        "note": "docs/research/FIELD_CAPTURE_2026-09-05.md (iPhone/Osmo at Second Peak from the cliff, 11:12 PDT; pre-registered 08:00 PDT record 0.828 m / 16.7 s / 189 deg)",
        "when_utc": "2026-09-05T18:12:00Z",
        "when_local": "2026-09-05 11:12 PDT",
        "date": "20260905",
        "spot": "secondpeak",
        "reported": {"hs_m": 0.902, "tp_s": 16.67, "dp_deg": 188.5},
        "carrier_evidence_s": None,
        "carrier_evidence": "none in-clip yet; the nowcast Tp band centre is the only period evidence",
    },
]


# ---------------------------------------------------------------- dispersion
# Twin of web-three/js/dispersion.js.  Checked against a node run of the JS
# module in tests/audit-forcing-deshoal.test.mjs to 1e-4.
def wavenumber(omega: float, h: float, floor_m: float = 0.05) -> float:
    hh = max(h, floor_m)
    y = omega * omega * hh / G
    return (y / (1.0 - math.exp(-(y ** 1.25))) ** 0.4) / hh


def group_velocity(omega: float, h: float, floor_m: float = 0.05) -> float:
    hh = max(h, floor_m)
    k = wavenumber(omega, hh, floor_m)
    x = 2.0 * k * hh
    x_over_sinh = (1 - x * x / 6 + 7 * x ** 4 / 360) if abs(x) < 1e-3 else x / math.sinh(x)
    return 0.5 * (1.0 + x_over_sinh) * omega / k


def ks_finite(T: float, h: float) -> float:
    """shoalingKsAt(): Green's law from deep water with finite-depth cg."""
    cg0 = G * T / (4.0 * math.pi)
    ks = math.sqrt(cg0 / group_velocity(2.0 * math.pi / T, h))
    return min(max(ks, KS_CLAMP[0]), KS_CLAMP[1])


def ks_shallow(T: float, h: float) -> float:
    """The builder's _ks_model(): deep cg over SHALLOW-water cg.  This was
    the shader's convention before commit 09c7f4a (2026-08-26) and is what
    pp_monthly_ocean.js was de-shoaled with."""
    cg0 = G * T / (4.0 * math.pi)
    return math.sqrt(cg0 / math.sqrt(G * h))


def deshoal_h0(hs_at_site: float, T: float, site_depth_m: float = SC116_DEPTH_M) -> float:
    """PROPOSED opt-in correction (not wired): the equivalent deep-water
    height the model should be fed so that its own Ks(h) re-shoaling
    reproduces Hs at the MOP site depth.  H0' = Hs_site / Ks(site depth).
    Refraction is NOT divided out: MOP already carried the swell through
    it, and the model applies no Kr from deep water on the default path."""
    return hs_at_site / ks_finite(T, site_depth_m)


# ---------------------------------------------------------------- fetch/parse
def fetch(url: str, path: Path, binary: bool = False) -> str | bytes:
    if path.exists():
        return path.read_bytes() if binary else path.read_text()
    if OFFLINE:
        raise SystemExit(f"--offline and {path} missing (would fetch {url})")
    RAW.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "pointbreak/forcing-audit"})
    with urllib.request.urlopen(req, timeout=600) as r:
        data = r.read()
    path.write_bytes(data)
    URLS_USED.append(url)
    return data if binary else data.decode("utf-8", "replace")


def parse_ascii_var(text: str, name: str) -> np.ndarray:
    lines = text.splitlines()
    start = None
    for i, ln in enumerate(lines):
        s = ln.strip()
        if s.startswith((f"{name}[", f"{name}.{name}[")):
            start = i + 1
            break
    if start is None:
        raise ValueError(f"{name!r} not in response")
    buf = []
    for ln in lines[start:]:
        s = ln.strip()
        if not s:
            break
        buf.append(s)
    return np.array([float(v) for v in ",".join(buf).split(",") if v.strip()], dtype=np.float64)


def parse_ascii_scalar(text: str, name: str) -> float:
    m = re.search(rf"^{name},\s*([-\d.]+)", text, re.M)
    if not m:
        raise ValueError(f"{name!r} not in response")
    return float(m.group(1))


def parse_ascii_grid(text: str, name: str, ncol: int) -> np.ndarray:
    rows = []
    for ln in text.splitlines():
        if ln.startswith("["):
            vals = ln.split(",")[1:]
            if len(vals) == ncol:
                rows.append([float(v) for v in vals])
    return np.array(rows, dtype=np.float64)


def load_hindcast() -> dict[str, np.ndarray]:
    if not CACHE.exists():
        if OFFLINE:
            raise SystemExit(f"--offline and {CACHE} missing")
        sys.path.insert(0, str(ROOT / "data" / "climatology"))
        import build_cdip_climatology as b  # noqa: E402
        data = b._pull()
        CACHE.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(CACHE, **data)
        URLS_USED.append(HINDCAST + " (chunked .ascii via build_cdip_climatology._pull)")
    z = np.load(CACHE)
    return {k: z[k] for k in z.files}


def load_nowcast() -> dict[str, np.ndarray]:
    dds = fetch(NOWCAST + ".dds", RAW / "nowcast.dds")
    n = int(re.search(r"waveTime\s*=\s*(\d+)", dds).group(1))
    idx = f"[0:1:{n - 1}]"
    q = ",".join(f"{v}{idx}" for v in ("waveTime", "waveHs", "waveTp", "waveTa", "waveDp", "waveFlagPrimary"))
    txt = fetch(f"{NOWCAST}.ascii?{q}", RAW / "nowcast_bulk.ascii")
    out = {v: parse_ascii_var(txt, v) for v in ("waveTime", "waveHs", "waveTp", "waveTa", "waveDp", "waveFlagPrimary")}
    if len(out["waveTime"]) != n:
        raise RuntimeError("nowcast bulk length mismatch")
    spec_txt = fetch(f"{NOWCAST}.ascii?waveEnergyDensity[0:1:{n - 1}][0:1:19]", RAW / "nowcast_spectra.ascii")
    out["waveEnergyDensity"] = parse_ascii_grid(spec_txt, "waveEnergyDensity", 20)
    meta = fetch(f"{NOWCAST}.ascii?metaWaterDepth,metaShoreNormal,waveFrequency,waveBandwidth", RAW / "meta_nowcast.ascii")
    out["waveFrequency"] = parse_ascii_var(meta, "waveFrequency")
    out["waveBandwidth"] = parse_ascii_var(meta, "waveBandwidth")
    out["metaWaterDepth"] = parse_ascii_scalar(meta, "metaWaterDepth")
    out["metaShoreNormal"] = parse_ascii_scalar(meta, "metaShoreNormal")
    das = fetch(NOWCAST + ".das", RAW / "nowcast.das")
    out["time_coverage"] = re.findall(r'time_coverage_(?:start|end) "([^"]+)"', das)
    hmeta = fetch(f"{HINDCAST}.ascii?metaWaterDepth,metaShoreNormal", RAW / "meta_hindcast.ascii")
    out["hindcastWaterDepth"] = parse_ascii_scalar(hmeta, "metaWaterDepth")
    hdas = fetch(HINDCAST + ".das", RAW / "hindcast.das")
    out["hindcast_time_coverage"] = re.findall(r'time_coverage_(?:start|end) "([^"]+)"', hdas)
    return out


def coops(product: str, station: str, date: str, **kw) -> dict:
    params = {"begin_date": date, "end_date": date, "station": station, "product": product,
              "time_zone": "lst_ldt", "format": "json", "application": "pointbreak_forcing_audit"}
    params.update(kw)
    url = COOPS_API + "?" + "&".join(f"{k}={v}" for k, v in params.items())
    tag = kw.get("interval", "6")
    path = RAW / f"tide_{station}_{product}_{tag}_{date}.json"
    return json.loads(fetch(url, path))


# ---------------------------------------------------------------- helpers
def month_of(t: np.ndarray) -> np.ndarray:
    return np.array([datetime.fromtimestamp(int(v), timezone.utc).month for v in t])


SEASONS = {"all": tuple(range(1, 13)), "DJF": (12, 1, 2), "MAM": (3, 4, 5), "JJA": (6, 7, 8), "SON": (9, 10, 11)}


def pct_rank(x: np.ndarray, v: float) -> float:
    """Percentile rank of v in x: % of hours strictly below v."""
    return round(100.0 * float(np.mean(x < v)), 2)


def r(x, n=3):
    return None if x is None or (isinstance(x, float) and not math.isfinite(x)) else round(float(x), n)


# ================================================================ Q1
def q1_deshoal(depth_site: float) -> dict:
    periods = [8, 9, 10, 11, 12, 13, 14, 14.8, 15, 16, 16.67, 17, 18]
    rows = []
    for T in periods:
        k15 = ks_finite(T, depth_site)
        rows.append({
            "T_s": T,
            "L0_m": r(G * T * T / (2 * math.pi), 1),
            "h_over_L0_at_site": r(depth_site / (G * T * T / (2 * math.pi)), 4),
            "Ks_site_15.03m": r(k15, 4),
            "Ks_10m": r(ks_finite(T, 10.0), 4),
            "Ks_12.5m": r(ks_finite(T, 12.5), 4),
            "Ks_site_tide_lo_14.17m": r(ks_finite(T, depth_site + TIDE_RANGE[0]), 4),
            "Ks_site_tide_hi_15.79m": r(ks_finite(T, depth_site + TIDE_RANGE[1]), 4),
            "Ks_shallow_15m_builder": r(ks_shallow(T, BUILDER_DEPTH_M), 4),
            # live path: H0 := Hs(site).  The drawn height at every depth is
            # then Hs*Ks(h) instead of Hs*Ks(h)/Ks(site): over by Ks(site)-1.
            "live_overforce_pct": r(100 * (k15 - 1), 2),
            # month path: H0 := Hs/Ks_shallow(14.8 s, 15 m) = Hs/0.9759, then
            # the shader re-shoals at the CARD T with finite-depth Ks.
            "month_overforce_pct_at_this_T": r(100 * (k15 / ks_shallow(BUILDER_DESHOAL_T_S, BUILDER_DEPTH_M) - 1), 2),
        })
    ks_builder = ks_shallow(BUILDER_DESHOAL_T_S, BUILDER_DEPTH_M)
    return {
        "question": "u_H0 is declared deep-water and re-shoaled by Ks(h) from cg0; SC116 waveHs is already at the MOP site depth. How much does each path over-force?",
        "mop_site_depth_m": depth_site,
        "mop_depth_basis": "metaWaterDepth attribute of SC116_nowcast.nc and SC116_hindcast.nc (both 15.03), and column 7 of CA_v1.1_transect_definitions.txt (SC116: -15.03). The files carry no vertical datum for it; geospatial_vertical_origin is 'sea surface'. The tide columns bracket what MSL..MLLW/MHHW would do to Ks.",
        "builder_ks_used_for_months": r(ks_builder, 4),
        "builder_ks_finite_at_same_T_and_depth": r(ks_finite(BUILDER_DESHOAL_T_S, BUILDER_DEPTH_M), 4),
        "per_period": rows,
        "correction": {
            "name": "deshoal_h0",
            "form": "H0' = Hs_site / Ks_finite(T, 15.03 m); refraction not divided out",
            "flag_design": "#deshoal=1 (default 0). Applies ONLY to derived oceans (day=live, #month=), never to card H0 or #h0=. When on: applyOcean sets state.H0 = clamp(deshoal_h0(o.hs, o.tp)); pp_monthly_ocean.js needs regenerating with ks_finite at each CARD T (the month restores the card T before re-shoaling), i.e. the table becomes hsP75 only and setMonth divides at runtime. HUD line: 'H0 = Hs/Ks(15 m) = x.xx m'.",
            "js_twin": "scripts/lib/deshoal.mjs (imports dispersion.js; no renderer import)",
        },
    }


# ================================================================ Q2
def q2_cards(hind: dict, along: dict, monthly: list[dict], depth_site: float) -> dict:
    t, hs, tp, ta, flag = hind["waveTime"], hind["waveHs"], hind["waveTp"], hind["waveTa"], hind["waveFlagPrimary"]
    yr = np.array([datetime.fromtimestamp(int(v), timezone.utc).year for v in t])
    good = (flag == 1) & (yr >= 2000) & (yr <= 2024)
    hs, tp, ta = hs[good], tp[good], ta[good]
    mon = month_of(t[good])

    def season_mask(name):
        return np.isin(mon, SEASONS[name])

    cards = []
    for key, p in PRESETS.items():
        k15 = ks_finite(p["T"], depth_site)
        hs_site = p["H0"] * k15                       # what the card is at 15 m
        ratio = along["transects"][p["transect"]]["hourMatchedRatio"]["year"]["p50"]
        hs_sc116 = hs_site / ratio                    # the same water read at SC116
        row = {
            "preset": key, "label": p["label"], "H0_card": p["H0"], "T_card": p["T"],
            "Ks_15m_at_T": r(k15, 4), "Hs_equiv_at_15m": r(hs_site, 3),
            "transect": p["transect"], "transect_ratio_to_SC116_p50": ratio,
            "Hs_equiv_at_SC116": r(hs_sc116, 3),
            "hs_rank_pct": {}, "hs_exceed_pct": {}, "hs_exceed_hours_per_year": {},
            "tp_rank_pct": {}, "ta_rank_pct": {}, "joint_exceed_pct": {},
        }
        for s in SEASONS:
            m = season_mask(s)
            n_years = 25
            row["hs_rank_pct"][s] = pct_rank(hs[m], hs_sc116)
            ex = float(np.mean(hs[m] >= hs_sc116))
            row["hs_exceed_pct"][s] = r(100 * ex, 2)
            row["hs_exceed_hours_per_year"][s] = r(ex * m.sum() / n_years, 1)
            row["tp_rank_pct"][s] = pct_rank(tp[m], p["T"] - 0.01)   # Tp is band-quantised; rank = % below the card band
            row["ta_rank_pct"][s] = pct_rank(ta[m], p["T"])
            # joint: at least the card's height AND a peak period within one
            # MOP band of the card (bands are 0.005 Hz: 14.29 -> 13.33 -> 12.5 s)
            row["joint_exceed_pct"][s] = r(100 * float(np.mean((hs[m] >= hs_sc116) & (tp[m] >= p["T"] - 0.8))), 2)
        # raw deep-water number read as if it were the SC116 Hs (the naive reading)
        row["hs_rank_pct_if_H0_read_as_Hs"] = pct_rank(hs, p["H0"])
        cards.append(row)

    months = []
    ks_builder = ks_shallow(BUILDER_DESHOAL_T_S, BUILDER_DEPTH_M)
    for i, m in enumerate(monthly, start=1):
        msk = mon == i
        hsp75 = m["hsP75"]
        row = {
            "month": m["label"], "hsP75_SC116": hsp75, "H0_shipped": m["H0"],
            "H0_shipped_check": r(min(max(hsp75 / ks_builder, *H0_CLAMP[:1]), H0_CLAMP[1]), 3),
            "hs_p75_rank_check_pct": pct_rank(hs[msk], hsp75),
            "H0_deshoaled_at_card_T": {str(T): r(hsp75 / ks_finite(T, depth_site), 3) for T in (12, 13, 14, 15)},
            "overforce_pct_at_card_T": {str(T): r(100 * (ks_finite(T, depth_site) / ks_builder - 1), 2) for T in (12, 13, 14, 15)},
            "tp_p50_s": r(np.median(tp[msk]), 2), "ta_p50_s": r(np.median(ta[msk]), 2),
        }
        months.append(row)

    # Does the de-shoal flip any month's tide-0 floor verdict? (MODEL.md 4.6)
    verdicts = []
    for m in monthly:
        for spot, (floor, T) in PEEL_FLOOR.items():
            shipped = m["H0"]
            corrected = m["hsP75"] / ks_finite(T, depth_site)
            verdicts.append({"month": m["label"], "spot": spot, "floor": floor, "H0_shipped": shipped,
                             "H0_corrected": r(corrected, 3), "clears_shipped": shipped >= floor,
                             "clears_corrected": corrected >= floor, "flips": (shipped >= floor) != (corrected >= floor),
                             "margin_corrected_m": r(corrected - floor, 3)})
    flips = [v for v in verdicts if v["flips"]]
    tight = sorted((v for v in verdicts if v["clears_corrected"]), key=lambda v: v["margin_corrected_m"])[:3]

    return {
        "question": "Where do the seven cards and the twelve month entries sit in the SC116 hindcast distribution (2000-2024, flag==1, n=%d)?" % int(good.sum()),
        "month_floor_verdicts": {"flips": flips, "tightest_clears_after_correction": tight, "n_checked": len(verdicts)},
        "frame": "card H0 is deep-water; it is carried to 15.03 m with the model's own Ks(T) and to SC116 with the spot transect's hour-matched year p50 ratio (pp_mop_alongshore.json). Ranks are % of hours strictly below; exceedance is % of hours at or above.",
        "tp_caveat": "waveTp is band-quantised (0.005 Hz bands: 14.29, 15.38, 16.67, 18.18 s); tp_rank is % of hours whose band centre is below the card T. ta is the continuous mean period and runs 4-5 s shorter than Tp at this site.",
        "cards": cards,
        "months": months,
    }


# ================================================================ Q3
def q3_days(now: dict, depth_site: float) -> dict:
    t = now["waveTime"]
    t0 = int(t[0])
    if not np.all(np.diff(t) == 3600):
        raise RuntimeError("nowcast time axis is not hourly-contiguous")
    datums = json.loads(fetch(f"{COOPS_MD}/9413450/datums.json?units=metric", RAW / "datums_9413450.json"))
    dmap = {d["name"]: d["value"] for d in datums["datums"]}
    out_days = []
    for fd in FIELD_DAYS:
        when = datetime.fromisoformat(fd["when_utc"].replace("Z", "+00:00"))
        i = round((when.timestamp() - t0) / 3600)       # record whose +-30 min bounds contain `when`
        recs = []
        for j in range(i - 3, i + 4):
            ts = datetime.fromtimestamp(int(t[j]), timezone.utc)
            recs.append({"index": j, "utc": ts.strftime("%Y-%m-%dT%H:%MZ"),
                         "hs_m": r(now["waveHs"][j]), "tp_s": r(now["waveTp"][j], 2),
                         "ta_s": r(now["waveTa"][j], 2), "dp_deg": r(now["waveDp"][j], 1),
                         "flag": int(now["waveFlagPrimary"][j]), "is_target": j == i})
        rec = recs[3]
        hs, tp, dp = rec["hs_m"], rec["tp_s"], rec["dp_deg"]
        # tide at Monterey on the model's own axis (MSL, metric), predicted and observed
        pred = coops("predictions", "9413450", fd["date"], datum="MSL", units="metric", interval="6")["predictions"]
        obs = coops("water_level", "9413450", fd["date"], datum="MSL", units="metric", interval="6")["data"]
        local = fd["when_local"][:16]
        def at(rows, key):
            # linear interpolation on the 6-min series to the clip minute
            tt = [datetime.strptime(x["t"], "%Y-%m-%d %H:%M") for x in rows]
            vv = [float(x[key]) for x in rows]
            target = datetime.strptime(local, "%Y-%m-%d %H:%M")
            for a, b in zip(range(len(tt) - 1), range(1, len(tt))):
                if tt[a] <= target <= tt[b]:
                    f = (target - tt[a]).total_seconds() / (tt[b] - tt[a]).total_seconds()
                    return vv[a] + f * (vv[b] - vv[a])
            return None
        tide_pred = at(pred, "v")
        tide_obs = at(obs, "v")
        obs_q = next((x["q"] for x in obs if x["t"][-5:] == local[-5:]), None)
        hilo_m = coops("predictions", "9413450", fd["date"], datum="MLLW", units="english", interval="hilo")["predictions"]
        hilo_sc = coops("predictions", "9413745", fd["date"], datum="MLLW", units="english", interval="hilo")["predictions"]
        # hashes. There is no #T= param: the period rides on the named day
        # (conditions.js), and an explicit #h0=/#tide= outrank the day's own.
        # The day is the one whose T is nearest the best period evidence for
        # that clip: an in-clip carrier measurement where one exists, else the
        # nowcast Tp (a band centre; the 0.06 Hz band spans 16.0-17.4 s).
        T_evidence = fd["carrier_evidence_s"] if fd["carrier_evidence_s"] else tp
        day = min(CONDITION_DAYS, key=lambda k: (abs(CONDITION_DAYS[k] - T_evidence), k))
        T_hash = CONDITION_DAYS[day]
        alt = min((k for k in CONDITION_DAYS if k != day), key=lambda k: (abs(CONDITION_DAYS[k] - T_evidence), k))
        h0_live = min(max(hs, *H0_CLAMP[:1]), H0_CLAMP[1])
        h0_de = deshoal_h0(hs, T_hash, depth_site)
        h0_de_alt = deshoal_h0(hs, CONDITION_DAYS[alt], depth_site)
        tide_hash = min(max(tide_obs, TIDE_RANGE[0]), TIDE_RANGE[1])
        tide_hash_pred = min(max(tide_pred, TIDE_RANGE[0]), TIDE_RANGE[1])
        base = f"#preset={fd['spot']}&day={day}"
        out_days.append({
            "day": fd["key"], "note": fd["note"], "when_local": fd["when_local"], "when_utc": fd["when_utc"],
            "sc116_product": "SC116_nowcast.nc (buoy-forced; waveModelInputSource 071p1-222p1-157p1-029p1-642p1:157p1-642p1-156p1-626p1 at both records)",
            "sc116_record": rec, "sc116_neighbours": recs,
            "reported_in_note": fd["reported"],
            "tide_9413450_msl_m": {"predicted": r(tide_pred), "observed": r(tide_obs), "observed_quality": obs_q,
                                   "residual_obs_minus_pred": r(tide_obs - tide_pred),
                                   "predicted_mllw_ft": r((tide_pred - TIDE_RANGE[0]) / 0.3048, 2),
                                   "observed_mllw_ft": r((tide_obs - TIDE_RANGE[0]) / 0.3048, 2)},
            "hilo_9413450_mllw_ft": hilo_m, "hilo_9413745_mllw_ft": hilo_sc,
            "period_carrier": {"day_key": day, "T_in_app": T_hash, "tp_nowcast": tp,
                               "period_evidence_s": T_evidence, "period_evidence": fd["carrier_evidence"],
                               "dT_app_minus_evidence": r(T_hash - T_evidence, 2),
                               "ks_at_T_app": r(ks_finite(T_hash, depth_site), 4), "ks_at_tp": r(ks_finite(tp, depth_site), 4),
                               "alternate_day": alt, "alternate_T": CONDITION_DAYS[alt]},
            "hash_as_shipped_live_convention": f"{base}&h0={h0_live:.3f}&tide={tide_hash:+.2f}",
            "hash_deshoaled": f"{base}&h0={h0_de:.3f}&tide={tide_hash:+.2f}",
            "hash_as_shipped_predicted_tide": f"{base}&h0={h0_live:.3f}&tide={tide_hash_pred:+.2f}",
            "hash_deshoaled_predicted_tide": f"{base}&h0={h0_de:.3f}&tide={tide_hash_pred:+.2f}",
            "hash_alternate_period_as_shipped": f"#preset={fd['spot']}&day={alt}&h0={h0_live:.3f}&tide={tide_hash:+.2f}",
            "hash_alternate_period_deshoaled": f"#preset={fd['spot']}&day={alt}&h0={h0_de_alt:.3f}&tide={tide_hash:+.2f}",
            "hash_notes": [
                "cam= is deliberately absent: the Lookout / cam-pose tracks own it.",
                f"day={day} also sets chop/dF/fog for that day and a tide of {CONDITION_DAY_TIDE[day]:+.2f} m, which the explicit tide= overrides (main.js reads #tide= after #day=).",
                "h0= is clamped to [0.4, 3.0] and NOT snapped to 0.1 m (main.js applyHashParams), so three decimals survive.",
                "tide is the Monterey OBSERVED water level on the MSL axis (the model's axis); the predicted-tide variants are for cross-reference with the pre-registration tables.",
            ],
        })
    return {
        "question": "What SC116 record and 9413450 tide correspond to the two field clips, and what hash reproduces each?",
        "nowcast_coverage": now["time_coverage"], "hindcast_coverage": now["hindcast_time_coverage"],
        "coverage_note": "SC116_hindcast.nc still ends 2025-03-31T23:30Z; SC116_nowcast.nc now starts 2025-04-01T00:00Z and runs to the present, so both 2026 days are in the nowcast and nothing has rolled out of it. No newer hindcast file is published for SC116 (catalog checked 2026-09-23).",
        "datums_9413450_m_station_datum": {k: dmap.get(k) for k in ("MSL", "MLLW", "MHHW", "NAVD88", "MHW", "MLW", "MTL")},
        "days": out_days,
    }


# ================================================================ Q4
def q4_sets(now: dict, sets_json: dict) -> dict:
    E = now["waveEnergyDensity"]
    f = now["waveFrequency"]
    bw = now["waveBandwidth"]
    hs = now["waveHs"]
    good = now["waveFlagPrimary"] == 1
    E, hs = E[good], hs[good]
    hm0 = 4 * np.sqrt((E * bw).sum(axis=1))
    closure = float(np.max(np.abs(hm0 - hs)))

    def sigma_f(mask_hs: np.ndarray, cutoff: float) -> float:
        b = f <= cutoff + 1e-9
        e = E[mask_hs][:, b] * bw[b]
        m0, m1, m2 = e.sum(1), (e * f[b]).sum(1), (e * f[b] ** 2).sum(1)
        nu = np.sqrt(np.maximum(m0 * m2 / m1 ** 2 - 1, 0))
        return float(np.median(nu * m1 / m0))

    cutoffs = [0.09, 0.10, 0.11, 0.125, 0.16, 0.25, 0.40]
    width = []
    hind_w = {row["cutoff_hz"]: row for row in sets_json["spectral_width"]["cutoff_sensitivity"]}
    for c in cutoffs:
        sa = sigma_f(np.ones(len(hs), bool), c)
        s1 = sigma_f(hs >= 1.0, c)
        width.append({"cutoff_hz": c, "sigma_f_all_hz": r(sa, 4), "set_period_all_s": r(1 / sa, 1),
                      "sigma_f_hs_ge_1_hz": r(s1, 4), "set_period_hs_ge_1_s": r(1 / s1, 1),
                      "hindcast_sigma_f_hz": hind_w[c]["sigma_f_hz"], "hindcast_set_period_s": hind_w[c]["implied_set_s"]})

    # estimator A: adjacent-band amplitude ratio at the spectral peak. Peak =
    # argmax of band ENERGY (E*bw) within the swell band f <= 0.125 Hz;
    # rho = sqrt(E_n bw_n / E_p bw_p), floor = (1-rho)/(1+rho), as
    # PP_SPECTRAL_SETS 7.1. "strong" = the neighbour with more energy.
    swell = f <= 0.125 + 1e-9
    def floor_est(mask_hs: np.ndarray, step: int) -> tuple[float, float]:
        e = (E * bw)[mask_hs]
        strong, weak = [], []
        for row in e:
            sw = row.copy(); sw[~swell] = -1
            p = int(np.argmax(sw))
            cands = [q for q in (p - step, p + step) if 0 <= q < len(f)]
            if not cands:
                continue
            rho = [math.sqrt(max(row[q], 0) / row[p]) if row[p] > 0 else float("nan") for q in cands]
            rho = [min(x, 1.0) for x in rho if math.isfinite(x)]
            if not rho:
                continue
            fl = [(1 - x) / (1 + x) for x in rho]
            strong.append(min(fl)); weak.append(max(fl))
        return float(np.median(strong)), float(np.median(weak))

    floors = []
    hind_f = {row["step"]: row for row in sets_json["envelope_floor"]["adjacent_band"]["separation"]}
    for step in (1, 2, 3):
        s, w = floor_est(hs >= 1.0, step)
        floors.append({"step": step, "df_hz_nominal": 0.005 * step, "floor_strong_p50": r(s, 4), "floor_weak_p50": r(w, 4),
                       "hindcast_strong": hind_f[step]["floor_strong_p50"], "hindcast_weak": hind_f[step]["floor_weak_p50"]})
    # interpolate to the model's dF=0.006 the way PP_SPECTRAL_SETS 7.1 did
    def interp(k):
        a, b = floors[0][k], floors[1][k]
        return r(a + (0.006 - 0.005) / 0.005 * (b - a), 4)
    now_bracket = [interp("floor_strong_p50"), interp("floor_weak_p50")]

    authored = sorted({p["dF"] for p in PRESETS.values()})
    return {
        "question": "Does the authored dF sit inside the bandwidth the spectra support, and is the modulation-depth floor still consistent with the current (2025-04..2026-09) spectra?",
        "nowcast_spectra_used": int(good.sum()), "hm0_closure_max_abs_m": r(closure, 4),
        "grid": {"spacing_at_swell_peak_hz": 0.005, "smallest_resolvable_df_hz": 0.010,
                 "authored_df_hz": authored, "authored_set_period_s": [r(1 / d, 1) for d in authored],
                 "verdict": "every authored dF (0.006-0.008) is below the 0.010 Hz resolution floor of both the MOP grid and buoy 156; the spectra can neither confirm nor refute it (PP_SPECTRAL_SETS 1, 8)"},
        "spectral_width_by_cutoff": width,
        "honest_range": {
            "swell_band_only_0.09_to_0.10_hz_cutoff": {"sigma_f_hz": [width[0]["sigma_f_all_hz"], width[1]["sigma_f_all_hz"]],
                                                        "set_period_s": [width[1]["set_period_all_s"], width[0]["set_period_all_s"]]},
            "all_defensible_cutoffs": {"sigma_f_hz": [width[0]["sigma_f_all_hz"], width[-1]["sigma_f_all_hz"]],
                                       "set_period_s": [width[-1]["set_period_all_s"], width[0]["set_period_all_s"]]},
            "swing": r(width[-1]["sigma_f_all_hz"] / width[0]["sigma_f_all_hz"], 2),
        },
        "envelope_floor_estimator_A_hs_ge_1m": floors,
        "floor_at_df_0.006": {"nowcast_bracket": now_bracket, "hindcast_bracket": [0.075, 0.163],
                              "shipped_floor": 0.15, "shipped_m": SET_DEPTH_M,
                              "duty_cycle_fit_hindcast": sets_json["envelope_floor"]["realised_envelope"]["fitted_floor"]},
    }


# ================================================================ Q5
def q5_datums() -> dict:
    d = json.loads(fetch(f"{COOPS_MD}/9413450/datums.json?units=metric", RAW / "datums_9413450.json"))
    dm = {x["name"]: x["value"] for x in d["datums"]}
    sc = json.loads(fetch(f"{COOPS_MD}/9413745/tidepredoffsets.json", RAW / "offsets_9413745.json"))
    scd = json.loads(fetch(f"{COOPS_MD}/9413745/datums.json?units=metric", RAW / "datums_9413745.json"))
    scs = json.loads(fetch(f"{COOPS_MD}/9413745.json", RAW / "station_9413745.json"))["stations"][0]
    chain = [
        {"constant": "MSL - NAVD88 (bed.js MSL_ABOVE_NAVD88)", "model": MSL_ABOVE_NAVD88,
         "coops": r(dm["MSL"] - dm["NAVD88"]), "basis": "9413450 datums.json: MSL 1.893, NAVD88 0.988 (station datum, m)"},
        {"constant": "MLLW about MSL (TIDE_RANGE[0])", "model": TIDE_RANGE[0],
         "coops": r(dm["MLLW"] - dm["MSL"]), "basis": "MLLW 1.031 - MSL 1.893"},
        {"constant": "MHHW about MSL (TIDE_RANGE[1])", "model": TIDE_RANGE[1],
         "coops": r(dm["MHHW"] - dm["MSL"]), "basis": "MHHW 2.657 - MSL 1.893"},
        {"constant": "reef ceiling -0.5 m NAVD88, on the MSL axis", "model": r(REEF_CEIL_NAVD88 - MSL_ABOVE_NAVD88),
         "coops": r(REEF_CEIL_NAVD88 - (dm["MSL"] - dm["NAVD88"])), "basis": "authored bed.js REEF_CEIL_EL; = %.3f m above MLLW" % (REEF_CEIL_NAVD88 - (dm["MLLW"] - dm["NAVD88"]))},
        {"constant": "observed extremes about MSL (not accepted by the model)", "model": None,
         "coops": [r(d["min"] - dm["MSL"]), r(d["max"] - dm["MSL"])], "basis": f"min {d['min']} ({d['mindate']}), max {d['max']} ({d['maxdate']})"},
        {"constant": "HAT / LAT about MSL", "model": None,
         "coops": [r(d["LAT"] - dm["MSL"]), r(d["HAT"] - dm["MSL"])], "basis": f"LAT {d['LAT']} ({d['LATdate']}), HAT {d['HAT']} ({d['HATdate']})"},
    ]
    for c in chain:
        if c["model"] is not None and not isinstance(c["coops"], list):
            c["delta_m"] = r(c["model"] - c["coops"])
    return {
        "question": "Every tide constant against CO-OPS 9413450, and whether Santa Cruz 9413745 differs enough to matter.",
        "epoch": {"tidal_datum_epoch": d["epoch"], "accepted": d["accepted"],
                  "note": "CO-OPS is migrating to the 2002-2020 NTDE; the API still returns the 1983-2001 epoch as accepted for 9413450 on 2026-09-23. A new epoch moves MSL/MLLW/MHHW by the local sea-level trend over ~19 years, order 0.02-0.04 m at Monterey."},
        "chain": chain,
        "santa_cruz_9413745": {
            "type": scs["type"], "reference_id": scs["reference_id"], "lat": scs["lat"], "lng": scs["lng"],
            "datums_published": scd["datums"] is not None,
            "prediction_offsets": {k: sc[k] for k in ("heightOffsetHighTide", "heightOffsetLowTide", "timeOffsetHighTide", "timeOffsetLowTide", "heightAdjustedType")},
            "reading": "subordinate station: predictions are Monterey's scaled by 0.97 (highs) / 0.99 (lows) on MLLW and shifted -6 / -11 min. No NAVD88 tie is published, so the DEM cannot be hung on Santa Cruz directly; Monterey is the only datum path.",
            "same_hour_effect_m": "at a mid-tide +0.4 m MSL (1.26 m MLLW) the height ratio moves the level by -0.01 to -0.04 m; an 8 min lead on a tide falling at 0.26 m/h (2026-08-15 15:28) is -0.03 m. Both below the non-tidal residual measured on the field days (+0.13 and +0.18 m, Q3).",
        },
        "unresolved": "MSL-NAVD88 at Pleasure Point itself (vs Monterey, 40 km) was not resolved: the VDatum REST API returned errorCode 412 on four attempts (2026-09-23). Expected magnitude is a few cm (geoid slope + local MSL); it is a residual, not a defect, until VDatum answers.",
    }


# ================================================================ Q6
def q6_direction(hind: dict, now: dict, shore_normal: float) -> dict:
    def stats(t, hs, dp, flag, years=None):
        yr = np.array([datetime.fromtimestamp(int(v), timezone.utc).year for v in t])
        good = flag == 1
        if years:
            good &= (yr >= years[0]) & (yr <= years[1])
        mon = month_of(t[good]); hs, dp = hs[good], dp[good]
        out = {}
        for s in SEASONS:
            m = np.isin(mon, SEASONS[s]) & (hs > 1.0)
            d = dp[m]
            if d.size == 0:
                continue
            out[s] = {"hours": int(m.sum()),
                      "outside_188_216_pct": r(100 * np.mean((d < 188) | (d > 216)), 2),
                      "below_188_pct": r(100 * np.mean(d < 188), 2), "above_216_pct": r(100 * np.mean(d > 216), 2),
                      "outside_187_221_pct": r(100 * np.mean((d < 187) | (d > 221)), 2),
                      "dp_p5": r(np.percentile(d, 5), 1), "dp_p50": r(np.percentile(d, 50), 1), "dp_p95": r(np.percentile(d, 95), 1),
                      "incidence_p50_vs_mop_normal_deg": r(np.percentile(d, 50) - shore_normal, 1)}
        allm = hs > 0
        out["all_hours_any_hs"] = {"hours": int(allm.sum()), "outside_188_216_pct": r(100 * np.mean((dp < 188) | (dp > 216)), 2)}
        return out
    return {
        "question": "How often is the 'condition, not character' band (188-216 deg, MODEL.md 2.6.5) violated when there is surf (Hs > 1 m)?",
        "mop_shore_normal_deg_true": shore_normal,
        "shore_normal_note": "metaShoreNormal in both SC116 files and column 8 of the transect definitions is 136.46 deg, not the '~200 deg' CDIP_LIVE_DATA.md:95 quotes and MODEL.md 2.6.5 flags as unverified. 136 deg sits inside the 115-169 deg the model's own estimators land (2.6.3). Median Dp 194 deg is therefore +58 deg off MOP's normal at SC116, a near-grazing incidence, which is consistent with 2.6.5's corrected +42..+70 deg.",
        "hindcast_2000_2024": stats(hind["waveTime"], hind["waveHs"], hind["waveDp"], hind["waveFlagPrimary"], (2000, 2024)),
        "nowcast_2025_04_to_2026_09": stats(now["waveTime"], now["waveHs"], now["waveDp"], now["waveFlagPrimary"]),
    }


# ================================================================ main
def main() -> None:
    global OFFLINE
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--offline", action="store_true", help="never fetch; fail if a raw file is missing")
    args = ap.parse_args()
    OFFLINE = args.offline
    OUT.mkdir(parents=True, exist_ok=True)

    hind = load_hindcast()
    now = load_nowcast()
    along = json.loads((ROOT / "data" / "climatology" / "pp_mop_alongshore.json").read_text())
    sets_json = json.loads((ROOT / "data" / "climatology" / "pp_spectral_sets.json").read_text())
    monthly_src = (ROOT / "data" / "climatology" / "pp_monthly_ocean.js").read_text()
    monthly = [{"key": m[0], "label": m[1], "H0": float(m[2]), "hsP75": float(m[3])}
               for m in re.findall(r"key: '(\w+)', label: '(\w+)', H0: ([\d.]+), hsP75: ([\d.]+)", monthly_src)]
    if len(monthly) != 12:
        raise RuntimeError("could not parse pp_monthly_ocean.js")

    depth_site = now["metaWaterDepth"]
    if abs(depth_site - now["hindcastWaterDepth"]) > 1e-6:
        raise RuntimeError("nowcast and hindcast disagree on metaWaterDepth")

    results = {
        "q1_deshoal": q1_deshoal(depth_site),
        "q2_cards": q2_cards(hind, along, monthly, depth_site),
        "q3_days": q3_days(now, depth_site),
        "q4_sets": q4_sets(now, sets_json),
        "q5_datums": q5_datums(),
        "q6_direction": q6_direction(hind, now, now["metaShoreNormal"]),
    }
    for k, v in results.items():
        (OUT / f"{k}.json").write_text(json.dumps(v, indent=1) + "\n")
    summary = {
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "script": "scripts/audit_forcing.py",
        "hindcast_cache": str(CACHE.relative_to(ROOT)),
        "hindcast_records": int(len(hind["waveTime"])),
        "nowcast_records": int(len(now["waveTime"])),
        "nowcast_coverage": now["time_coverage"],
        "mop_site_depth_m": depth_site, "mop_shore_normal_deg": now["metaShoreNormal"],
        "sources": SOURCES,
        "urls_fetched_this_run": URLS_USED,
        "raw_dir": str(RAW.relative_to(ROOT)),
        "outputs": sorted(p.name for p in OUT.glob("*.json")),
    }
    (OUT / "summary.json").write_text(json.dumps(summary, indent=1) + "\n")

    # a terse console view of the load-bearing numbers
    q1 = results["q1_deshoal"]
    print("Q1 Ks(15.03 m) and live over-forcing:")
    for row in q1["per_period"]:
        if row["T_s"] in (12, 13, 14, 15, 16, 17):
            print(f"  T {row['T_s']:>4}  Ks15 {row['Ks_site_15.03m']:.4f}  Ks10 {row['Ks_10m']:.4f}  live {row['live_overforce_pct']:+.1f}%  month {row['month_overforce_pct_at_this_T']:+.1f}%")
    print("Q2 card ranks (all-year % of hours below, at SC116-equivalent Hs):")
    for c in results["q2_cards"]["cards"]:
        print(f"  {c['label']:<14} H0 {c['H0_card']} T {c['T_card']}  Hs@SC116 {c['Hs_equiv_at_SC116']:.2f}  rank all {c['hs_rank_pct']['all']:.1f}  DJF {c['hs_rank_pct']['DJF']:.1f}  JJA {c['hs_rank_pct']['JJA']:.1f}  joint(all) {c['joint_exceed_pct']['all']:.2f}%")
    for d in results["q3_days"]["days"]:
        print(f"Q3 {d['day']}: {d['sc116_record']}  tide pred {d['tide_9413450_msl_m']['predicted']} obs {d['tide_9413450_msl_m']['observed']}")
        print(f"   {d['hash_as_shipped_live_convention']}\n   {d['hash_deshoaled']}")
    q4 = results["q4_sets"]
    print(f"Q4 closure {q4['hm0_closure_max_abs_m']} m; floor bracket at dF 0.006 nowcast {q4['floor_at_df_0.006']['nowcast_bracket']} vs hindcast [0.075, 0.163]")
    for w in q4["spectral_width_by_cutoff"]:
        print(f"   cutoff {w['cutoff_hz']}: sigma_f {w['sigma_f_all_hz']} ({w['set_period_all_s']} s)  hindcast {w['hindcast_sigma_f_hz']}")
    print("Q5", [(c["constant"], c.get("delta_m")) for c in results["q5_datums"]["chain"] if "delta_m" in c])
    print("Q6", {s: v["outside_188_216_pct"] for s, v in results["q6_direction"]["hindcast_2000_2024"].items() if "dp_p50" in v})
    print("wrote", OUT)


if __name__ == "__main__":
    main()
