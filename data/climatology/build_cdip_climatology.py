#!/usr/bin/env python3
"""Build a Pleasure Point wave climatology from the CDIP MOP SC116 hindcast.

This is the source `data/climatology/README.md` said the repo would need and
did not have: nearshore, at the break, with direction. It replaces
`pp_surfforecast_climatology.json` as the seasonality prior. That file stays
for provenance and for its wind panel; see `docs/research/PP_SWELL_CLIMATOLOGY.md`
for why its swell half is unusable.

Source: CDIP MOP v1.1 alongshore transect SC116, hourly hindcast, delivered over
OPeNDAP from thredds.cdip.ucsd.edu. Endpoint grammar and the CORS/index gotchas
are documented in `docs/research/CDIP_LIVE_DATA.md`; `web/js/cdip.js` already
speaks the same protocol against the *nowcast* twin of this file.

What makes it the right source and the offshore ones wrong:

- SC116 sits at 36.94873 N, -121.96333 W — about 110 m from the Pleasure Point
  coordinate in CDIP_LIVE_DATA.md, in 10-15 m of water. surf-forecast's NWW3
  node is 48 km offshore. Refraction around Soquel Point happens *between* those
  two points, which is precisely the transformation this repository models.
- Direction (`waveDp`) survives to the break here, so the seasonal direction
  band can be measured rather than assumed.

Deliberately NOT computed here: any "good day" / "fair+" percentage. Those are
subjective ratings, every site defines them differently and none of them publish
the definition. What this emits is the physical distribution; if a rideability
criterion is ever wanted, it belongs downstream of MODEL.md's breaking gate,
stated explicitly, not smuggled into a climatology file.

Usage:
    python3 data/climatology/build_cdip_climatology.py            # fetch + build
    python3 data/climatology/build_cdip_climatology.py --offline  # rebuild from cache
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
CACHE_PATH = HERE / ".cache" / "sc116_hindcast_bulk.npz"
OUT_PATH = HERE / "pp_cdip_climatology.json"

DATASET = "MOPv1.1_SC116_2000010100-2025033123"
BASE = (
    "https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/"
    "MOP_alongshore/SC116_hindcast.nc"
)
# waveTa (mean period) is pulled alongside waveTp because Tp here is NOT
# continuous: MOP reports peak period as the centre of whichever of its 20
# frequency bands holds the most energy, so waveTp takes only 19 distinct values
# across the whole 25-year record and its median is the same band every month.
# Any real period seasonality has to be read off waveTa.
VARS = ("waveTime", "waveHs", "waveTp", "waveTa", "waveDp", "waveFlagPrimary")

# CDIP flag_values 1,2,3,4,9 = good, not_evaluated, questionable, bad, missing.
GOOD_FLAG = 1

CHUNK = 20000
TIMEOUT_S = 180
RETRIES = 4

# Whole calendar years only. The file runs 1999-12-31T23:30Z to 2025-03-31T23:30Z,
# so an unfiltered month-of-year binning would carry 26 Januaries against 25
# Junes and tilt the winter months upward by ~4% for free. Slicing to complete
# years removes that; `records_per_month` in the output lets a reader confirm it.
YEAR_MIN = 2000
YEAR_MAX = 2024

# Hs bin edges in metres, chosen to line up with the surf-forecast panels in
# pp_surfforecast_climatology.json so the two sources can be read side by side.
HS_EDGES = [0.0, 0.5, 1.3, 2.0, 3.0, math.inf]
HS_LABELS = ["<0.5", "0.5-1.3", "1.3-2", "2-3", ">3"]

# 16-point compass rose, centred on the cardinal bearings.
ROSE = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]

MONTHS = ["January", "February", "March", "April", "May", "June",
          "July", "August", "September", "October", "November", "December"]


def _fetch(url: str) -> str:
    """GET with retries. THREDDS stalls under load rather than erroring."""
    last = None
    for attempt in range(RETRIES):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "pointbreak/climatology"})
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
            if attempt < RETRIES - 1:
                back = 2 ** attempt
                print(f"    retry {attempt + 1}/{RETRIES - 1} in {back}s ({e})", file=sys.stderr)
                time.sleep(back)
    raise RuntimeError(f"fetch failed after {RETRIES} attempts: {url}") from last


def _parse_ascii_var(text: str, name: str) -> np.ndarray:
    """Pull one variable's values out of an OPeNDAP .ascii response.

    The payload is `name[N]` on its own line followed by comma-separated values,
    which may wrap across lines until the next `name[` header or a blank line.
    """
    lines = text.splitlines()
    start = None
    for i, ln in enumerate(lines):
        s = ln.strip()
        if s.startswith((f"{name}[", f"{name}.{name}[")):
            start = i + 1
            break
    if start is None:
        raise ValueError(f"variable {name!r} not found in response")

    buf: list[str] = []
    for ln in lines[start:]:
        s = ln.strip()
        if not s:
            break
        # Next variable's header ends this block.
        if "[" in s and "]" in s and "," not in s.split("[")[0]:
            head = s.split("[")[0]
            if head and not head[0].isdigit() and head[0] not in "-+.":
                break
        buf.append(s)

    raw = ",".join(buf)
    vals = [v.strip() for v in raw.split(",") if v.strip()]
    return np.array([float(v) for v in vals], dtype=np.float64)


def _pull() -> dict[str, np.ndarray]:
    """Fetch the bulk time series in chunks."""
    dds = _fetch(BASE + ".dds")
    import re
    m = re.search(r"waveTime\s*=\s*(\d+)", dds)
    if not m:
        raise RuntimeError("no waveTime dimension in .dds")
    n = int(m.group(1))
    print(f"  SC116 hindcast: {n:,} hourly records")

    cols: dict[str, list[np.ndarray]] = {v: [] for v in VARS}
    for lo in range(0, n, CHUNK):
        hi = min(lo + CHUNK, n) - 1
        idx = f"[{lo}:1:{hi}]"
        query = ",".join(f"{v}{idx}" for v in VARS)
        text = _fetch(f"{BASE}.ascii?{query}")
        for v in VARS:
            cols[v].append(_parse_ascii_var(text, v))
        done = hi + 1
        print(f"  {done:,}/{n:,} ({100 * done / n:.0f}%)", end="\r", flush=True)
    print(" " * 40, end="\r")

    out = {v: np.concatenate(cols[v]) for v in VARS}
    lens = {v: len(a) for v, a in out.items()}
    if len(set(lens.values())) != 1:
        raise RuntimeError(f"ragged variables: {lens}")
    if lens["waveTime"] != n:
        raise RuntimeError(f"expected {n} records, got {lens['waveTime']}")
    return out


def _circular_stats(deg: np.ndarray) -> tuple[float, float]:
    """Circular mean (deg true) and resultant length R in [0,1].

    R is the concentration: 1.0 = every hour from the same bearing, 0.0 = no
    preferred direction. A plain arithmetic mean of bearings is meaningless
    across the 0/360 wrap, which is why this exists.
    """
    if deg.size == 0:
        return float("nan"), float("nan")
    rad = np.radians(deg)
    c, s = np.cos(rad).mean(), np.sin(rad).mean()
    mean = math.degrees(math.atan2(s, c)) % 360.0
    return mean, float(math.hypot(c, s))


def _pct(x: np.ndarray, q: float) -> float:
    return round(float(np.percentile(x, q)), 3)


def build(data: dict[str, np.ndarray]) -> dict:
    t = data["waveTime"]
    hs = data["waveHs"]
    tp = data["waveTp"]
    ta = data["waveTa"]
    dp = data["waveDp"]
    flag = data["waveFlagPrimary"]

    total = t.size
    flag_hist = {
        str(int(k)): int(v) for k, v in zip(*np.unique(flag, return_counts=True))
    }

    # Epoch seconds -> UTC calendar fields. Month-of-year is taken in UTC; the
    # Pacific offset shifts at most a few hours of each month across a boundary,
    # which is immaterial at 25-year sample sizes and avoids a DST dependency.
    dt = np.array([datetime.fromtimestamp(int(s), tz=timezone.utc) for s in t])
    year = np.array([d.year for d in dt])
    month = np.array([d.month for d in dt])

    tp_levels = int(np.unique(np.round(tp[flag == GOOD_FLAG], 4)).size)

    good = ((flag == GOOD_FLAG) & np.isfinite(hs) & np.isfinite(tp)
            & np.isfinite(ta) & np.isfinite(dp))
    window = (year >= YEAR_MIN) & (year <= YEAR_MAX)
    keep = good & window

    print(f"  {int(good.sum()):,}/{total:,} records flagged good "
          f"({100 * good.sum() / total:.1f}%)")
    print(f"  {int(keep.sum()):,} inside whole years {YEAR_MIN}-{YEAR_MAX}")

    months_out = {}
    for mi, name in enumerate(MONTHS, start=1):
        sel = keep & (month == mi)
        h, p, a, d = hs[sel], tp[sel], ta[sel], dp[sel]
        n = int(sel.sum())
        if n == 0:
            continue

        counts, _ = np.histogram(h, bins=HS_EDGES)
        hs_dist = {
            lab: round(100.0 * int(c) / n, 1) for lab, c in zip(HS_LABELS, counts)
        }

        rose_idx = np.floor(((d + 11.25) % 360.0) / 22.5).astype(int)
        rose_counts = np.bincount(rose_idx, minlength=16)
        rose = {
            ROSE[i]: round(100.0 * int(rose_counts[i]) / n, 1)
            for i in range(16) if rose_counts[i] > 0
        }

        dp_mean, dp_r = _circular_stats(d)

        months_out[name] = {
            "n_hours": n,
            "n_years": int(np.unique(year[sel]).size),
            "hs_m": {
                "mean": round(float(h.mean()), 3),
                "p10": _pct(h, 10), "p25": _pct(h, 25), "p50": _pct(h, 50),
                "p75": _pct(h, 75), "p90": _pct(h, 90), "p99": _pct(h, 99),
                "max": round(float(h.max()), 3),
            },
            "hs_distribution_pct": hs_dist,
            "tp_s": {
                "_warning": "band-quantised, see method.tp_is_quantised",
                "p25": _pct(p, 25), "p50": _pct(p, 50), "p75": _pct(p, 75),
                "p90": _pct(p, 90),
            },
            "ta_s": {
                "mean": round(float(a.mean()), 3),
                "p25": _pct(a, 25), "p50": _pct(a, 50), "p75": _pct(a, 75),
            },
            "dp_deg_true": {
                "circular_mean": round(dp_mean, 1),
                "resultant_length": round(dp_r, 3),
                "p10": _pct(d, 10), "p50": _pct(d, 50), "p90": _pct(d, 90),
            },
            "dp_rose_pct": rose,
        }

    all_h, all_d = hs[keep], dp[keep]
    all_mean, all_r = _circular_stats(all_d)
    counts, _ = np.histogram(all_h, bins=HS_EDGES)
    n_all = int(keep.sum())

    return {
        "source": {
            "name": "CDIP MOP v1.1 alongshore hindcast, transect SC116",
            "dataset_id": DATASET,
            "endpoint": BASE,
            "protocol": "OPeNDAP (.dds for length, .ascii for values)",
            "site": {
                "latitude": 36.94873,
                "longitude": -121.96333,
                "note": "~110 m from the Pleasure Point coordinate in "
                        "docs/research/CDIP_LIVE_DATA.md; MOP transforms to the "
                        "10-15 m contour, roughly 150 m off the break",
            },
            "file_coverage": "1999-12-31T23:30:00Z to 2025-03-31T23:30:00Z",
            "cadence": "hourly",
            "licence": "US federal / Scripps CDIP public data, no redistribution "
                       "restriction; see LICENSES.md",
        },
        "method": {
            "years_used": f"{YEAR_MIN}-{YEAR_MAX} (whole calendar years only)",
            "why_truncated": "the file ends 2025-03-31, so unfiltered "
                             "month-of-year bins would hold 26 Januaries "
                             "against 25 Junes",
            "qc": f"waveFlagPrimary == {GOOD_FLAG} (good); "
                  "flags 2/3/4/9 = not_evaluated/questionable/bad/missing",
            "month_binning": "UTC",
            "direction_convention": "degrees true, direction waves come FROM",
            "tp_is_quantised": f"waveTp takes only {tp_levels} distinct values "
                               "across the record — MOP reports the centre of "
                               "whichever of its 20 frequency bands holds the "
                               "most energy. Tp percentiles are band labels, not "
                               "a continuous distribution, and the Tp median is "
                               "the same band in every month. Use ta_s (mean "
                               "period, continuous) for period seasonality.",
            "not_computed": "no rideability, quality or 'fair+' percentage — "
                            "those are subjective ratings with undisclosed "
                            "definitions and do not belong in a physical "
                            "climatology",
        },
        "qc_summary": {
            "records_in_file": total,
            "flag_histogram": flag_hist,
            "records_used": n_all,
        },
        "year_round": {
            "n_hours": n_all,
            "hs_m": {
                "mean": round(float(all_h.mean()), 3),
                "p50": _pct(all_h, 50), "p90": _pct(all_h, 90),
            },
            "hs_distribution_pct": {
                lab: round(100.0 * int(c) / n_all, 1)
                for lab, c in zip(HS_LABELS, counts)
            },
            "dp_deg_true": {
                "circular_mean": round(all_mean, 1),
                "resultant_length": round(all_r, 3),
                "p10": _pct(all_d, 10), "p50": _pct(all_d, 50), "p90": _pct(all_d, 90),
            },
        },
        "months": months_out,
    }


# ---------------------------------------------------------------------------
# The month selector's data module (web-three #month=)
# ---------------------------------------------------------------------------

MODULE_PATH = HERE / "pp_monthly_ocean.js"

# The percentile the selector ships. p50 would be the honest median and would
# make August correctly look like nothing at all; the screensaver wants the good
# day *typical of* the month, so p75. It is named in the HUD rather than hidden,
# which is what keeps this a stated choice instead of tuning.
SELECTOR_PCT = 75

# Deshoal reference period. Measured interpolated spectral peak at SC116 is
# 14.4-15.2 s in EVERY month (range 0.79 s, non-monotonic — September is the
# longest, November the shortest), so peak period at this site is seasonless and
# one constant is more honest than twelve near-identical ones. The season lives
# entirely in height.
DESHOAL_T_S = 14.8
SC116_DEPTH_M = 15.0

# state.H0 clamp in web-three (params.js H0_DEF).
H0_CLAMP = (0.4, 3.0)


def _ks_model(period_s: float, depth_m: float) -> float:
    """Green's-law shoaling coefficient, **in the shader's own convention**.

    model-glsl.js computes `Ks = sqrt(cg0/sqrt(G*dep))` — deep-water group speed
    over a *shallow-water* cg. At 15 m and 15 s that approximation is poor in
    absolute terms (full linear dispersion gives 1.05 where this gives 0.98),
    but the point here is to invert what the model will re-apply, not to be
    textbook-correct. Matching the shader makes the round-trip exact; matching
    the textbook would leave a residual the renderer then bakes in.
    """
    cg0 = 9.81 * period_s / (4.0 * math.pi)
    return math.sqrt(cg0 / math.sqrt(9.81 * depth_m))


def emit_module(out: dict, path: Path = MODULE_PATH) -> None:
    """Write the generated ES module web-three imports for `#month=`.

    Deliberately carries H0 only. Period is seasonless here (see DESHOAL_T_S),
    tide is not a CDIP product, and chop/dF need the directional spectrum, which
    this script does not pull — so a month sets size and nothing else, and says
    so rather than inventing the other four knobs.
    """
    ks = _ks_model(DESHOAL_T_S, SC116_DEPTH_M)
    lo, hi = H0_CLAMP
    rows = []
    for name, v in out["months"].items():
        hs = _pct_from(v, SELECTOR_PCT)
        # SC116 Hs is at the 15 m contour; state.H0 is a DEEP-WATER height that
        # the shader re-shoals from. Divide out what it will re-apply.
        h0 = min(max(hs / ks, lo), hi)
        rows.append((name, hs, round(h0, 3), v["n_hours"]))

    body = "\n".join(
        f"  {{ key: '{n.lower()}', label: '{n}', H0: {h0}, "
        f"hsP{SELECTOR_PCT}: {hs}, nHours: {nh} }},"
        for n, hs, h0, nh in rows
    )
    path.write_text(f"""// GENERATED by data/climatology/build_cdip_climatology.py — do not edit.
// Source: {DATASET} (CDIP MOP SC116), whole years {YEAR_MIN}-{YEAR_MAX}.
// Analysis: docs/research/PP_CDIP_CLIMATOLOGY.md
//
// A month sets SIZE ONLY. It is not a condition-day: period is seasonless at
// this site (interpolated spectral peak 14.4-15.2 s in every month), tide is not
// a CDIP product, and chop/dF need the directional spectrum this build does not
// pull. Carrying twelve near-identical periods would be noise dressed as signal.
//
// H0 is DEEP-WATER height, matching MODEL.md's definition: the p{SELECTOR_PCT}
// of Hs at the 15 m contour, divided by the shoaling coefficient the shader
// re-applies (Ks = {ks:.4f} at T = {DESHOAL_T_S} s, model-glsl.js convention).
// Clamped to params.js H0_DEF [{lo}, {hi}].
export const MONTHLY_OCEAN_PCT = {SELECTOR_PCT};
export const MONTHLY_OCEAN = [
{body}
];

export function getMonthlyOcean(key) {{
  const k = String(key || '').toLowerCase();
  return MONTHLY_OCEAN.find((m) => m.key === k) || null;
}}
""")
    print(f"wrote {path}")


def _pct_from(month: dict, pct: int) -> float:
    key = f"p{pct}"
    if key not in month["hs_m"]:
        raise KeyError(f"hs_m has no {key}; add it to the percentile list")
    return month["hs_m"][key]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--offline", action="store_true",
                    help="rebuild from the cached pull instead of hitting THREDDS")
    ap.add_argument("--refetch", action="store_true",
                    help="re-pull from THREDDS even if a cache exists")
    ap.add_argument("-o", "--out", type=Path, default=OUT_PATH)
    args = ap.parse_args()

    usable_cache = CACHE_PATH.exists() and not args.refetch
    if usable_cache:
        with np.load(CACHE_PATH) as z:
            missing = [v for v in VARS if v not in z.files]
            if missing:
                if args.offline:
                    print(f"cache is missing {missing}; rerun with --refetch",
                          file=sys.stderr)
                    return 1
                print(f"cache is missing {missing} — refetching")
                usable_cache = False
            else:
                print(f"reading cache {CACHE_PATH}")
                data = {v: z[v] for v in VARS}

    if not usable_cache:
        if args.offline:
            print(f"no usable cache at {CACHE_PATH}; run without --offline first",
                  file=sys.stderr)
            return 1
        print(f"fetching {DATASET}")
        data = _pull()
        CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(CACHE_PATH, **data)
        print(f"  cached to {CACHE_PATH}")

    out = build(data)
    # Provenance is the raw pull, not this file: the cache is the thing a rerun
    # has to reproduce for the numbers below to be reproducible.
    out["source"]["cache_sha256"] = hashlib.sha256(CACHE_PATH.read_bytes()).hexdigest()
    args.out.write_text(json.dumps(out, indent=2, sort_keys=False) + "\n")
    print(f"wrote {args.out}")
    emit_module(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
