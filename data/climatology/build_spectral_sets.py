#!/usr/bin/env python3
"""Measure the set structure of the Pleasure Point swell from the CDIP spectrum.

README.md admits the thing this script is aimed at:

    the two-component beat that produces sets here is **invented rather than
    measured**

`docs/MODEL.md` carries the invention as `Delta f ~ 0.006 Hz`, and the preset
bank spans `dF` 0.004-0.018. This script asks the CDIP MOP SC116 hindcast --
221,328 hourly directional spectra on the same transect the climatology uses --
whether that model describes this ocean, and what number it should carry.

Requires netCDF4 (the bulk climatology script deliberately does not; this one
reads the 20-band spectral arrays, which are impractical over OPeNDAP ASCII):

    uv venv .venv-cdip && uv pip install --python .venv-cdip/bin/python netCDF4 numpy
    .venv-cdip/bin/python data/climatology/build_spectral_sets.py

The 148 MB source file is fetched once to `.cache/` (gitignored, regenerable):

    curl -sL -o data/climatology/.cache/SC116_hindcast.nc \\
      https://thredds.cdip.ucsd.edu/thredds/fileServer/cdip/model/MOP_alongshore/SC116_hindcast.nc

READ THE RESOLUTION CAVEAT before using any Delta f printed here. The MOP grid
is 0.005 Hz wide through the swell range, so two swell peaks must sit at least
two bands apart to show a trough between them -- a hard floor of ~0.010 Hz on
any Delta f this data can resolve. MODEL.md's 0.006 Hz is BELOW that floor. The
grid cannot confirm or refute it, and no amount of processing changes that.

Spectral width (nu, sigma_f) looks like the natural continuous substitute and is
NOT one: it is set almost entirely by where the swell band is truncated, swinging
6x across defensible cutoffs. The script reports that sensitivity instead of a
number, because publishing the number would have handed the model a retune based
on the analyst's choice of cutoff. See docs/research/PP_SPECTRAL_SETS.md.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

try:
    import netCDF4
except ModuleNotFoundError:  # pragma: no cover - environment guard
    raise SystemExit(
        "netCDF4 missing. See the module docstring for the uv venv recipe."
    )

HERE = Path(__file__).resolve().parent
NC_PATH = HERE / ".cache" / "SC116_hindcast.nc"
OUT_PATH = HERE / "pp_spectral_sets.json"

YEAR_MIN, YEAR_MAX = 2000, 2024
GOOD_FLAG = 1

# Swell band: f <= 0.125 Hz (T >= 8 s). Everything that breaks as surf at this
# spot lives here -- the measured peak period is 14.4-15.2 s year round -- and
# excluding the windsea tail keeps m2 from being dominated by chop that never
# reaches the reef as a set.
SWELL_F_MAX = 0.125

# A second peak counts as a distinct swell system when it clears a quarter of
# the primary AND the trough between them drops to 70% of the smaller peak.
# Both thresholds are conventional partitioning choices, not physics; they are
# exposed here so the sensitivity is checkable rather than buried.
PEAK_MIN_FRAC = 0.25
TROUGH_MAX_FRAC = 0.70


def _count_peaks(E: np.ndarray, nb: int) -> tuple[np.ndarray, np.ndarray]:
    """Resolvable swell peaks per record, and Delta f to the second one.

    Deliberately simple: on a 20-band grid there is nothing subtle to do. A peak
    is a strict local maximum; the second-largest such peak counts if it clears
    PEAK_MIN_FRAC of the primary and the minimum between them falls to
    TROUGH_MAX_FRAC of the smaller. Returns (n_peaks, df) with df NaN when there
    is no qualifying second peak.
    """
    n = E.shape[0]
    counts = np.zeros(n, dtype=np.int16)
    dfs = np.full(n, np.nan)
    band_f = _count_peaks.f  # set by caller; avoids threading it through

    interior = E[:, 1:nb - 1]
    is_peak = (interior > E[:, 0:nb - 2]) & (interior > E[:, 2:nb])
    for i in range(n):
        idx = np.flatnonzero(is_peak[i]) + 1
        if idx.size == 0:
            counts[i] = 1 if E[i, :nb].max() > 0 else 0
            continue
        order = idx[np.argsort(E[i, idx])[::-1]]
        counts[i] = 1
        if order.size < 2:
            continue
        p, q = order[0], order[1]
        if E[i, q] < PEAK_MIN_FRAC * E[i, p]:
            continue
        lo, hi = (p, q) if p < q else (q, p)
        trough = E[i, lo:hi + 1].min()
        if trough > TROUGH_MAX_FRAC * min(E[i, p], E[i, q]):
            continue
        counts[i] = 2
        dfs[i] = abs(band_f[p] - band_f[q])
    return counts, dfs


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("-o", "--out", type=Path, default=OUT_PATH)
    args = ap.parse_args()

    if not NC_PATH.exists():
        raise SystemExit(f"missing {NC_PATH} — see the docstring for the curl recipe")

    d = netCDF4.Dataset(NC_PATH)
    t = np.asarray(d["waveTime"][:])
    flag = np.asarray(d["waveFlagPrimary"][:])
    hs = np.asarray(d["waveHs"][:], float)
    f = np.asarray(d["waveFrequency"][:], float)
    bw = np.asarray(d["waveBandwidth"][:], float)
    E = np.asarray(d["waveEnergyDensity"][:], float)
    D = np.asarray(d["waveMeanDirection"][:], float)

    year = (np.asarray(t, "datetime64[s]").astype("datetime64[Y]").astype(int) + 1970)
    keep = (flag == GOOD_FLAG) & (year >= YEAR_MIN) & (year <= YEAR_MAX)
    print(f"  {int(keep.sum()):,} spectra, whole years {YEAR_MIN}-{YEAR_MAX}")

    # Closure: Hm0 = 4*sqrt(m0) recomputed over the FULL spectrum must reproduce
    # the published waveHs. This is the only thing standing between a band-
    # weighting slip and a plausible wrong answer, so it runs every time rather
    # than living in a comment.
    m0_full = (E * bw).sum(1)
    closure = float(np.abs(4 * np.sqrt(np.clip(m0_full, 0, None)) - hs)[keep].max())
    print(f"  closure |Hm0 - waveHs| max = {closure:.4f} m")
    if closure > 0.01:
        raise SystemExit(f"closure check FAILED ({closure:.4f} m) — band weighting is wrong")

    nb = int((f <= SWELL_F_MAX).sum())
    band_gap = float(np.diff(f[:nb]).min())
    resolution_floor = 2 * band_gap
    print(f"  swell band: {nb} bands, f <= {SWELL_F_MAX} Hz (T >= {1/SWELL_F_MAX:.0f} s)")
    print(f"  grid spacing {band_gap:.4f} Hz -> smallest RESOLVABLE df {resolution_floor:.4f} Hz")

    Ek, Dk, hsk = E[keep][:, :nb], D[keep][:, :nb], hs[keep]

    _count_peaks.f = f[:nb]
    counts, dfs = _count_peaks(Ek, nb)

    bimodal = counts == 2
    has_df = np.isfinite(dfs)

    def pct(a, q):
        a = a[np.isfinite(a)]
        return round(float(np.percentile(a, q)), 4) if a.size else None

    # Direction separation between the two components, when there are two.
    sep = np.full(dfs.shape, np.nan)
    sel = np.flatnonzero(has_df)
    if sel.size:
        pk = Ek[sel].argmax(1)
        # second peak = the band whose df matches, nearest in frequency
        for j, i in enumerate(sel):
            order = np.argsort(Ek[i])[::-1][:6]
            cand = [b for b in order if abs(abs(f[b] - f[pk[j]]) - dfs[i]) < 1e-6]
            if cand:
                a, b = Dk[i, pk[j]], Dk[i, cand[0]]
                sep[i] = abs((a - b + 180) % 360 - 180)

    # Cutoff sensitivity: the reason spectral width is not reported as a number.
    cutoff_rows = []
    for fc in (0.09, 0.10, 0.11, 0.125, 0.16, 0.25, 0.40):
        n = int((f <= fc).sum())
        if n < 4:
            continue
        Ec, fc_b, bc = E[keep][:, :n], f[:n], bw[:n]
        c0 = (Ec * bc).sum(1); c1 = (Ec * bc * fc_b).sum(1)
        c2 = (Ec * bc * fc_b * fc_b).sum(1)
        good = (c0 > 1e-9) & (hsk >= 1.0)
        with np.errstate(invalid="ignore", divide="ignore"):
            nu_c = np.sqrt(np.clip(c0 * c2 / np.square(c1) - 1.0, 0, None))
            sig = nu_c * c1 / np.where(c0 > 0, c0, 1)
            qp_c = 2.0 / np.square(np.where(c0 > 0, c0, 1)) * (Ec * Ec * bc * fc_b).sum(1)
        v = float(np.percentile(sig[good & np.isfinite(sig)], 50))
        q = float(np.percentile(qp_c[good & np.isfinite(qp_c)], 50))
        cutoff_rows.append({"cutoff_hz": fc, "period_s": round(1 / fc, 1),
                            "sigma_f_hz": round(v, 4),
                            "implied_set_s": round(1 / v, 1),
                            "qp": round(q, 3)})

    bimodal_by_size = [
        {"hs_min_m": lo, "n_hours": int((hsk >= lo).sum()),
         "bimodal_pct": round(100.0 * float(bimodal[hsk >= lo].mean()), 1)}
        for lo in (0.0, 1.0, 1.5, 2.0)
    ]

    model_df = 0.006
    out = {
        "source": {
            "dataset": "MOPv1.1_SC116 hindcast, directional spectra",
            "spectra_used": int(keep.sum()),
            "years": f"{YEAR_MIN}-{YEAR_MAX}",
            "swell_band": {"f_max_hz": SWELL_F_MAX, "n_bands": nb,
                           "period_min_s": round(1 / SWELL_F_MAX, 2)},
        },
        "closure_check_m": round(closure, 6),
        "resolution": {
            "grid_spacing_hz": round(band_gap, 5),
            "smallest_resolvable_df_hz": round(resolution_floor, 5),
            "model_df_hz": model_df,
            "verdict": (
                "MODEL.md's Delta f is BELOW the grid's resolution floor. Two "
                "swell peaks 0.006 Hz apart fall in adjacent bands and cannot "
                "show a trough, so this dataset can neither confirm nor refute "
                "the authored value. It is not a measurement problem that more "
                "processing fixes."
            ) if model_df < resolution_floor else "resolvable",
        },
        "partitioning": {
            "thresholds": {"peak_min_frac": PEAK_MIN_FRAC,
                           "trough_max_frac": TROUGH_MAX_FRAC},
            "threshold_caveat": (
                "The ABSOLUTE level is threshold-dependent (3.2%-39.3% across a "
                "3x3 grid of peak/trough thresholds and three band cutoffs) and "
                "should not be quoted alone. What survives every combination is "
                "that bimodality is a MINORITY state, and the decline with size "
                "below is measured at fixed thresholds so the choice cancels."
            ),
            "bimodal_pct_by_size": bimodal_by_size,
            "df_hz": {"p10": pct(dfs, 10), "p50": pct(dfs, 50), "p90": pct(dfs, 90)},
            "implied_set_period_s": {
                "p10": round(1 / pct(dfs, 90), 1) if pct(dfs, 90) else None,
                "p50": round(1 / pct(dfs, 50), 1) if pct(dfs, 50) else None,
                "p90": round(1 / pct(dfs, 10), 1) if pct(dfs, 10) else None,
            },
            "direction_separation_deg": {
                "p50": pct(sep, 50), "p90": pct(sep, 90),
            },
        },
        "spectral_width": {
            "verdict": "UNUSABLE AS A BRIDGE — do not retune dF from these.",
            "why": (
                "nu and the absolute width sigma_f = nu * m1/m0 look like the "
                "natural continuous stand-in for the two-component Delta f, and "
                "they are stable across sea state (sigma_f p50 moves 0.0185 -> "
                "0.0188 Hz from all hours to Hs >= 1.5 m). They are NOT stable "
                "across the one choice that is arbitrary: where the swell band "
                "ends. m2 is dominated by the highest frequency retained, so "
                "sigma_f swings 6x with the cutoff (see cutoff_sensitivity). "
                "Picking 0.125 Hz says the model's Delta f is 3x too long; "
                "picking 0.090 Hz says it is nearly right. That is a statement "
                "about the analyst, not the ocean."
            ),
            "cutoff_sensitivity": cutoff_rows,
            "qp_swing": round(
                max(r["qp"] for r in cutoff_rows) / min(r["qp"] for r in cutoff_rows), 2),
            "sigma_f_swing": round(
                max(r["sigma_f_hz"] for r in cutoff_rows)
                / min(r["sigma_f_hz"] for r in cutoff_rows), 2),
            "qp_note": (
                "Goda Qp is the least cutoff-sensitive of the three (see the "
                "two swing figures above) and is where a groupiness bridge "
                "should start if one is attempted — but it is dimensionless and "
                "does not convert to a Delta f without an assumption that would "
                "smuggle the answer back in."
            ),
        },
    }

    args.out.write_text(json.dumps(out, indent=2) + "\n")
    print(f"wrote {args.out}")
    print(json.dumps(out["resolution"], indent=1))
    print(json.dumps(out["partitioning"]["bimodal_pct_by_size"], indent=1))
    print("  cutoff sensitivity (why spectral width is not a number):")
    for r in cutoff_rows:
        print(f"    cutoff {r['cutoff_hz']:.3f} Hz (T>={r['period_s']:>4.1f} s)"
              f"  sigma_f {r['sigma_f_hz']:.4f} Hz  -> sets {r['implied_set_s']:6.1f} s"
              f"  Qp {r['qp']:.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
