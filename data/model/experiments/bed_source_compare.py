#!/usr/bin/env python3
"""Cross-grid comparison of the generated geo profiles and depth patches.

Reads pp_geo_profiles[.<tag>].js and pp_depth_patches[.<tag>].js for each
bathymetry source tag and prints markdown tables: contour-fit RMS / usable /
tangent / reef elevation / stage window per spot, the wide-NCEI control's
deviation from the shipped module (the instrument check), and the depth-patch
plane residuals. Read-only; writes nothing. Companion to
docs/research/CUDEM_BED_2026-09-01.md.

    python3 data/model/experiments/bed_source_compare.py [tag ...]

Default tags: '' (shipped), ncei13_wide, cudem19, cudem19-t05.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
MODEL = HERE.parent
CANON = ["Sewer Peak", "First Peak", "Second Peak", "38th", "The Hook", "Shark's Cove", "Private's"]
DEFAULT_TAGS = ["", "ncei13_wide", "cudem19", "cudem19-t05"]


def load_js(path: Path) -> dict | None:
    if not path.exists():
        return None
    txt = path.read_text()
    return json.loads(txt[txt.index("Object.freeze(") + len("Object.freeze("):txt.rindex(");")])


def module(kind: str, tag: str) -> Path:
    return MODEL / (f"{kind}.js" if not tag else f"{kind}.{tag}.js")


def label(tag: str) -> str:
    return {"": "NCEI shipped", "ncei13_wide": "NCEI wide", "cudem19": "CUDEM", "cudem19-t05": "CUDEM --truncate 0.5"}.get(tag, tag)


def fmt(v, nd=2):
    return "—" if v is None else (f"{v:.{nd}f}" if isinstance(v, float) else str(v))


def main(tags: list[str]) -> None:
    geo = {t: load_js(module("pp_geo_profiles", t)) for t in tags}
    depth = {t: load_js(module("pp_depth_patches", t)) for t in tags}
    tags = [t for t in tags if geo[t] is not None]

    print("## Contour fit per grid\n")
    print("| spot | grid | RMS m | n | usable | tangent ° | OSM tangent ° | reef elev NAVD88 m | shore slope | window m | fail reason |")
    print("|---|---|---:|---:|:---:|---:|---:|---:|---:|---|---|")
    for name in CANON:
        for t in tags:
            p = geo[t]["profiles"][name]
            cf = p["contourFit"]
            reason = cf.get("failReason") or (f"{cf['nullCellsTouched']} null" if cf.get("nullCellsTouched") else "")
            print(f"| {name} | {label(t)} | {fmt(cf.get('rmseM'))} | {fmt(cf.get('samples'))} | {'yes' if cf.get('usable') else 'no'} | "
                  f"{fmt(p.get('bathyContourTangentDeg'), 1)} | {fmt(p.get('osmCoastTangentDeg'), 1)} | {fmt(p.get('reefElevationNavd88M'))} | "
                  f"{fmt(p.get('shoreSlope'), 4)} | [{p['stageBoundsM'][0]}, {p['stageBoundsM'][1]}] | {reason} |")

    if "" in tags and "ncei13_wide" in tags:
        print("\n## Instrument check: NCEI wide vs shipped (same DEM posts, lattice origin rounded 0.208 m apart)\n")
        print("| spot | Δ RMS m | Δ tangent ° | Δ reef elev m | Δ x2 | Δ x3 | max |Δz| over window m |")
        print("|---|---:|---:|---:|---:|---:|---:|")
        for name in CANON:
            a, b = geo[""]["profiles"][name], geo["ncei13_wide"]["profiles"][name]
            ca, cb = a["contourFit"], b["contourFit"]
            dz = 0.0
            x = a["stageBoundsM"][0]
            while x <= a["stageBoundsM"][1]:
                za = ca["x2"] * x * x + ca["x3"] * x ** 3
                zb = cb["x2"] * x * x + cb["x3"] * x ** 3
                dz = max(dz, abs(za - zb))
                x += 1.0
            print(f"| {name} | {cb['rmseM'] - ca['rmseM']:+.2f} | {b['bathyContourTangentDeg'] - a['bathyContourTangentDeg']:+.1f} | "
                  f"{b['reefElevationNavd88M'] - a['reefElevationNavd88M']:+.2f} | {cb['x2'] - ca['x2']:+.2e} | {cb['x3'] - ca['x3']:+.2e} | {dz:.3f} |")

    if any(depth[t] for t in tags):
        print("\n## Depth patches per grid\n")
        print("| spot | grid | plane residual RMS m | plane slope ° | plane fit samples | land @MSL | elev min..max m | out-of-grid cells | note |")
        print("|---|---|---:|---:|---:|---:|---|---:|---|")
        for name in CANON:
            for t in tags:
                d = depth[t]
                if d is None:
                    continue
                p = d["patches"].get(name)
                if p is None:
                    reason = (d.get("failedClosed") or {}).get(name, "no usable contour fit")
                    print(f"| {name} | {label(t)} | — | — | — | — | — | — | {reason} |")
                    continue
                pf = p["planeFit"]
                slope = math.degrees(math.atan(math.hypot(pf[1], pf[2])))
                print(f"| {name} | {label(t)} | {p['planeResidualRmsM']:.2f} | {slope:.2f} | {p['planeFitSamples']} | "
                      f"{100 * p['landFractionAtMsl']:.1f}% | {p['elevMinM']}..{p['elevMaxM']} | {p.get('outOfGridCells', 0)} | |")


if __name__ == "__main__":
    main(sys.argv[1:] or DEFAULT_TAGS)
