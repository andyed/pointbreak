#!/usr/bin/env python3
"""Compare the frequency grids of the two CDIP sources, in the band that matters.

Step 1 of the spectral-partition spike (docs/research/PP_SPECTRAL_PARTITIONS_SPIKE.md).
PP_SPECTRAL_SETS.md 6.5 proposed CDIP buoy 156 as a finer instrument than the
SC116 MOP model output, on the grounds that buoy spectra are published on a
finer grid. This checks that premise before any partitioning work is built on
it, because the whole spike is downstream of it being true.

It is not true in the band Pleasure Point's swell occupies. The buoy carries
64 bands against the model's 20, but the extra bands are at HIGH frequency;
in the swell band both sources step at 0.005 Hz. A reader comparing band
COUNTS would conclude the opposite, which is why this script reports spacing
per band rather than a total.

No dependencies beyond the stdlib, matching build_cdip_climatology.py: the
OPeNDAP `.ascii` endpoint returns the grid as text, so netCDF4/xarray are not
needed to answer a question about the axis itself.

Usage:
  python3 data/climatology/check_spectral_grids.py            # fetch + report
  python3 data/climatology/check_spectral_grids.py --out FILE # also write JSON
"""
import argparse
import json
import re
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT_PATH = HERE / "pp_spectral_grids.json"

SOURCES = {
    "sc116_mop": {
        "label": "CDIP MOP v1.1 SC116 hindcast (model output, the spot's own point)",
        "url": "https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/"
               "MOP_alongshore/SC116_hindcast.nc",
    },
    "buoy156": {
        "label": "CDIP archive 156p1 historic (in-situ buoy, offshore)",
        "url": "https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/archive/"
               "156p1/156p1_historic.nc",
    },
}

# The band Pleasure Point's swell actually occupies. MODEL.md's card periods are
# T = 14-15 s and the climatology's seasonless period range is 14.4-15.2 s, so
# f = 1/T sits at 0.066-0.071 Hz. Widened to 0.04-0.10 Hz (T 10-25 s) to cover
# the windswell tail and the long-period groundswell days.
SWELL_F_MIN, SWELL_F_MAX = 0.04, 0.10

# Where Pleasure Point's swell actually sits. The card periods are T = 14-15 s
# and the 25-year climatology found period to be effectively seasonless at
# 14.4-15.2 s, so this is the frequency the delta-f question is really about.
# Reported separately from the band-wide numbers because a max-over-band
# statistic is dominated by the coarse bands at the band EDGE, which is not
# where the swell is (MEASUREMENT_LESSONS 8c: check the domain).
PEAK_F_HZ = 1.0 / 14.5

TIMEOUT_S = 90
RETRIES = 3


def fetch_grid(url: str) -> tuple[list[float], list[float]]:
    """Pull waveFrequency + waveBandwidth over OPeNDAP ascii."""
    q = f"{url}.ascii?waveFrequency,waveBandwidth"
    last = None
    for _ in range(RETRIES):
        try:
            req = urllib.request.Request(
                q, headers={"User-Agent": "pointbreak/spectral-grids"})
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
                txt = r.read().decode("utf-8", "replace")
            break
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            last = e
    else:
        raise RuntimeError(f"fetch failed after {RETRIES} attempts: {q}") from last

    def block(name: str) -> list[float]:
        # `name[N]` on its own line, then one comma-separated row of values.
        m = re.search(rf"^{name}\[\d+\]\s*\n(.+?)\n", txt, re.S | re.M)
        if not m:
            raise RuntimeError(f"{name} not found in OPeNDAP response")
        return [float(x) for x in m.group(1).split(",")]

    return block("waveFrequency"), block("waveBandwidth")


def describe(freq: list[float], bw: list[float]) -> dict:
    steps = [round(freq[i + 1] - freq[i], 6) for i in range(len(freq) - 1)]
    # Spacing AT each band, in the swell band only. The step to the next band is
    # what decides whether two nearby peaks can show a trough between them.
    swell = [(f, s) for f, s in zip(freq, steps) if SWELL_F_MIN <= f <= SWELL_F_MAX]
    swell_steps = sorted({s for _, s in swell})
    # Spacing at the band holding PP's own swell peak — the discriminating
    # number, as opposed to a max over a band whose edge is always coarser.
    peak_i = min(range(len(freq) - 1), key=lambda i: abs(freq[i] - PEAK_F_HZ))
    peak_step = steps[peak_i]
    return {
        "n_bands": len(freq),
        "peak_f_hz": round(PEAK_F_HZ, 5),
        "band_at_peak_hz": freq[peak_i],
        "spacing_at_peak_hz": peak_step,
        "resolvable_df_at_peak_hz": round(2 * peak_step, 6),
        "f_min_hz": freq[0],
        "f_max_hz": freq[-1],
        "bandwidth_min_hz": min(bw),
        "bandwidth_max_hz": max(bw),
        "swell_band_hz": [SWELL_F_MIN, SWELL_F_MAX],
        "n_bands_in_swell_band": len(swell),
        "swell_band_spacings_hz": swell_steps,
        "swell_band_spacing_hz": swell_steps[0] if len(swell_steps) == 1 else None,
        # Two peaks need a band between them to show a trough, so the smallest
        # separation this grid can RESOLVE is twice its spacing. Same reasoning
        # as PP_SPECTRAL_SETS.md 1.
        "smallest_resolvable_df_hz": (
            round(2 * max(swell_steps), 6) if swell_steps else None),
        "frequencies_hz": freq,
        "bandwidths_hz": bw,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", nargs="?", const=str(OUT_PATH), default=None)
    args = ap.parse_args()

    out = {
        "what": "Frequency-grid comparison of the two CDIP sources, in the swell band.",
        "why": "PP_SPECTRAL_SETS.md 6.5 proposed the buoy as a finer instrument. "
               "This tests that premise before building on it.",
        "model_df_hz": 0.006,
        "sources": {},
    }
    for key, src in SOURCES.items():
        freq, bw = fetch_grid(src["url"])
        d = describe(freq, bw)
        d["label"], d["url"] = src["label"], src["url"]
        out["sources"][key] = d
        print(f"{key}: {d['n_bands']} bands, {d['f_min_hz']}-{d['f_max_hz']} Hz")
        print(f"  swell band {SWELL_F_MIN}-{SWELL_F_MAX} Hz: "
              f"{d['n_bands_in_swell_band']} bands, "
              f"spacing {d['swell_band_spacings_hz']} Hz, "
              f"smallest resolvable df {d['smallest_resolvable_df_hz']} Hz")

    a = out["sources"]["sc116_mop"]["spacing_at_peak_hz"]
    b = out["sources"]["buoy156"]["spacing_at_peak_hz"]
    floor = out["sources"]["buoy156"]["resolvable_df_at_peak_hz"]
    out["verdict"] = {
        "buoy_finer_at_swell_peak": bool(b < a),
        "buoy_spacing_at_peak_hz": b,
        "mop_spacing_at_peak_hz": a,
        "resolvable_df_at_peak_hz": floor,
        "model_df_below_buoy_floor": bool(floor and out["model_df_hz"] < floor),
        "note": (
            "The buoy carries more bands overall but the extra resolution is at "
            "HIGH frequency. In the swell band both sources step at the same "
            "0.005 Hz, so the smallest resolvable separation is 0.010 Hz for "
            "both and the authored 0.006 Hz stays below the floor. Band COUNT "
            "is the misleading comparison; spacing in the band of interest is "
            "the one that decides. Where the buoy IS better: it holds 0.005 Hz "
            "spacing from 0.025 to 0.095 Hz, against the model's 0.040-0.075 Hz, "
            "so short-period windswell structure is better resolved there. That "
            "does not bear on delta-f."),
    }
    print()
    print(f"AT PP's own swell peak ({out['sources']['buoy156']['peak_f_hz']} Hz, T 14.5 s)"
          " — the number that decides:")
    print(f"  mop spacing   {a} Hz")
    print(f"  buoy spacing  {b} Hz")
    print(f"  resolvable df {floor} Hz  vs authored {out['model_df_hz']} Hz")
    print()
    print("VERDICT: buoy finer AT the swell peak? "
          f"{out['verdict']['buoy_finer_at_swell_peak']}")
    print("         model df below the buoy's floor? "
          f"{out['verdict']['model_df_below_buoy_floor']}")

    if args.out:
        Path(args.out).write_text(json.dumps(out, indent=1) + "\n")
        print(f"wrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
