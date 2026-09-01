#!/usr/bin/env python3
"""Build compact Pleasure Point stage profiles for the browser models.

The raw OSM and NCEI files remain the source of truth.  This script reduces
them to the small per-spot values the shared kinematic model can consume:

- an OSM along-point window bounded by neighboring canon spots;
- a local stage basis aligned to the NCEI equal-elevation contour through the
  surf spot, oriented in OSM's positive down-point direction;
- a cubic-free contour fit z = c2*x^2 + c3*x^3 through that spot; and
- the local shore-normal bathymetric slope.

The equal-elevation fit is datum-offset independent: the unresolved
NAVD88-to-MSL conversion does not enter the curve.  Absolute reef elevation is
carried as metadata only until the tidal datum is resolved.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OSM_PATH = ROOT / "data" / "osm" / "pp_geometry.json"
BATHY_PATH = ROOT / "data" / "bathy" / "pp_bathy.json"
OUT_PATH = HERE / "pp_geo_profiles.js"

CANON = [
    "Sewer Peak",
    "First Peak",
    "Second Peak",
    "38th",
    "The Hook",
    "Shark's Cove",
    "Private's",
]


def _sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def _sample_bathy(bathy: dict, x: float, y: float) -> float | None:
    """Bilinear sample of pp_bathy.json's local ENU grid."""
    col = (x - bathy["x0"]) / bathy["dx"]
    row = (y - bathy["y0"]) / bathy["dy"]
    c0, r0 = math.floor(col), math.floor(row)
    if c0 < 0 or r0 < 0 or c0 + 1 >= bathy["ncols"] or r0 + 1 >= bathy["nrows"]:
        return None
    fx, fy = col - c0, row - r0
    elev = bathy["elev"]
    return (
        (1 - fx) * (1 - fy) * elev[r0][c0]
        + fx * (1 - fy) * elev[r0][c0 + 1]
        + (1 - fx) * fy * elev[r0 + 1][c0]
        + fx * fy * elev[r0 + 1][c0 + 1]
    )


def _fit_x2_x3(points: list[tuple[float, float]]) -> tuple[float, float, float]:
    """Least-squares z=c2*x^2+c3*x^3, constrained through the stage origin."""
    s4 = sum(x**4 for x, _ in points)
    s5 = sum(x**5 for x, _ in points)
    s6 = sum(x**6 for x, _ in points)
    b2 = sum((x**2) * z for x, z in points)
    b3 = sum((x**3) * z for x, z in points)
    det = s4 * s6 - s5 * s5
    if abs(det) < 1e-12:
        raise ValueError("degenerate contour fit")
    c2 = (b2 * s6 - b3 * s5) / det
    c3 = (s4 * b3 - s5 * b2) / det
    rmse = math.sqrt(sum((c2 * x * x + c3 * x**3 - z) ** 2 for x, z in points) / len(points))
    return c2, c3, rmse


def _linear_slope(points: list[tuple[float, float]]) -> float:
    mx = sum(x for x, _ in points) / len(points)
    my = sum(y for _, y in points) / len(points)
    den = sum((x - mx) ** 2 for x, _ in points)
    return sum((x - mx) * (y - my) for x, y in points) / den


def _crossings(samples: list[tuple[float, float | None]], target: float) -> list[float]:
    out: list[float] = []
    for (z0, v0), (z1, v1) in zip(samples, samples[1:]):
        if v0 is None or v1 is None:
            continue
        d0, d1 = v0 - target, v1 - target
        if d0 * d1 > 0:
            continue
        if d1 == d0:
            out.append(z0)
        else:
            out.append(z0 - d0 * (z1 - z0) / (d1 - d0))
    return out


# Fit options. The defaults reproduce the shipped module byte for byte; the
# alternatives exist for data/model/experiments/contour_variants.py (see
# docs/research/PRIVATES_CONTOUR_2026-09-01.md).
#
#   ref:     ("node", delta_m)   contour at the surf node's own elevation + delta
#            ("fixed", navd88_m) contour at an absolute NAVD88 elevation
#   window:  ("neighbors", cap)  midpoints to the neighbouring canon spots, |x| <= cap
#            ("symmetric", cap)  +-min(cap, half the nearer neighbour gap)
#            ("fixed", half)     +-half
#   branch:  "nearest"  per scan line, the crossing nearest z = 0 (the origin line)
#            "track"    walk outward from x = 0, picking the crossing nearest the
#                       previous line's selection (continuity)
#   truncate: None      keep the whole window
#             slope     walking outward from x = 0, end the stage at the last line
#                       before the selected contour steps more than slope * 10 m
#                       shore-normal between adjacent lines (the contour has
#                       turned away from the stage frame; the platform ends)
DEFAULT_OPTIONS = {
    "ref": ("node", 0.0),
    "window": ("neighbors", 250.0),
    "branch": "nearest",
    "truncate": None,
}

SCAN_HALF_M = 150.0
LINE_STEP_M = 10.0


def _stage_window(spots: dict, canon_u: list[float], index: int, mode: tuple) -> tuple[float, float]:
    u = canon_u[index]
    prev_u = canon_u[index - 1] if index else 0.0
    next_u = canon_u[index + 1] if index + 1 < len(canon_u) else spots["Trees"]["u"]
    kind, value = mode
    if kind == "neighbors":
        return max(-value, (prev_u + u) / 2 - u), min(value, (u + next_u) / 2 - u)
    if kind == "symmetric":
        half = min(value, (u - prev_u) / 2, (next_u - u) / 2)
        return -half, half
    if kind == "fixed":
        return -float(value), float(value)
    raise ValueError(f"unknown window mode {mode!r}")


def _frame_at(name: str, bathy: dict, px: float, py: float, osm_tangent_deg: float):
    """Elevation and (shore, along) unit vectors at an ENU point.

    Bathymetric gradient points uphill/shoreward. Its perpendicular is the
    local equal-elevation tangent; orient that tangent to OSM down-point.
    """
    elev = _sample_bathy(bathy, px, py)
    if elev is None:
        raise ValueError(f"{name}: spot falls outside bathymetry grid")
    eps = 5.0
    ex1, ex0 = _sample_bathy(bathy, px + eps, py), _sample_bathy(bathy, px - eps, py)
    ey1, ey0 = _sample_bathy(bathy, px, py + eps), _sample_bathy(bathy, px, py - eps)
    if None in (ex1, ex0, ey1, ey0):
        raise ValueError(f"{name}: cannot estimate bathymetric gradient")
    gx, gy = (ex1 - ex0) / (2 * eps), (ey1 - ey0) / (2 * eps)
    glen = math.hypot(gx, gy)
    if glen < 1e-9:
        raise ValueError(f"{name}: degenerate bathymetric gradient")
    shore = (gx / glen, gy / glen)
    along = (shore[1], -shore[0])
    osm_tangent = (math.cos(math.radians(osm_tangent_deg)), math.sin(math.radians(osm_tangent_deg)))
    if along[0] * osm_tangent[0] + along[1] * osm_tangent[1] < 0:
        along = (-along[0], -along[1])
    return elev, shore, along


def _scan_line(bathy: dict, ox: float, oy: float, along, shore, x: float) -> list[tuple[float, float | None]]:
    """Shore-normal elevation samples at 1 m spacing along the stage line x."""
    scan = []
    z = -SCAN_HALF_M
    while z <= SCAN_HALF_M + 1e-9:
        px = ox + along[0] * x + shore[0] * z
        py = oy + along[1] * x + shore[1] * z
        scan.append((z, _sample_bathy(bathy, px, py)))
        z += 1.0
    return scan


def _contour_lines(bathy: dict, ox: float, oy: float, along, shore, target: float,
                   stage_start: float, stage_end: float) -> list[tuple[float, list[float]]]:
    """(x, crossings of target) for every stage line in the window."""
    lines: list[tuple[float, list[float]]] = []
    x = math.ceil(stage_start / LINE_STEP_M) * LINE_STEP_M
    while x <= stage_end + 1e-9:
        lines.append((x, _crossings(_scan_line(bathy, ox, oy, along, shore, x), target)))
        x += LINE_STEP_M
    return lines


def _select_branch(lines: list[tuple[float, list[float]]], branch: str, seed: float = 0.0) -> list[tuple[float, float]]:
    """Reduce multi-valued scan lines to one contour point each, sorted by x."""
    points: list[tuple[float, float]] = []
    if branch == "nearest":
        for x, candidates in lines:
            if candidates:
                # The contour through the stage origin is the nearest branch in
                # this local window. Mapped runtime spots all fit below 2 m RMSE.
                points.append((x, min(candidates, key=abs)))
        return points
    if branch == "track":
        by_x = dict(lines)
        outward = [x for x, _ in lines if x >= 0]
        inward = [x for x, _ in lines if x < 0][::-1]
        for sequence in (outward, inward):
            prev = seed
            for x in sequence:
                candidates = by_x[x]
                if not candidates:
                    continue
                prev = min(candidates, key=lambda c: abs(c - prev))
                points.append((x, prev))
        points.sort()
        return points
    raise ValueError(f"unknown branch mode {branch!r}")


def _truncate_at_departure(points: list[tuple[float, float]], stage_start: float, stage_end: float,
                           slope: float) -> tuple[list[tuple[float, float]], float, float]:
    """Cut the window where the contour leaves the stage frame.

    Walk outward from x = 0 on each side. The first adjacent pair whose
    shore-normal step exceeds slope * line spacing marks the contour turning
    more than atan(slope) away from the stage tangent; the stage ends at the
    last line before it. A side that never departs keeps its original bound.
    """
    limit = slope * LINE_STEP_M
    pts = sorted(points)
    pos = [p for p in pts if p[0] >= 0]
    neg = [p for p in pts if p[0] <= 0][::-1]
    keep: list[tuple[float, float]] = []
    new_start, new_end = stage_start, stage_end
    for side, sequence in (("pos", pos), ("neg", neg)):
        kept = sequence[:1]
        for prev, cur in zip(sequence, sequence[1:]):
            if abs(cur[1] - prev[1]) > limit:
                if side == "pos":
                    new_end = prev[0]
                else:
                    new_start = prev[0]
                break
            kept.append(cur)
        keep.extend(kept)
    dedup = sorted(set(keep))
    return dedup, new_start, new_end


def _measure(name: str, spots: dict, canon_u: list[float], index: int, bathy: dict, options: dict | None = None) -> dict:
    """Everything _profile_for needs, plus the raw contour for experiments."""
    opts = {**DEFAULT_OPTIONS, **(options or {})}
    spot = spots[name]
    stage_start, stage_end = _stage_window(spots, canon_u, index, opts["window"])

    ox, oy = spot["x"], spot["y"]
    elev0, shore, along = _frame_at(name, bathy, ox, oy, spot["coast_tangent_deg"])

    ref_kind, ref_value = opts["ref"]
    target = elev0 + ref_value if ref_kind == "node" else float(ref_value)
    rx, ry, ref_offset = ox, oy, 0.0
    if target != elev0:
        # The fit is constrained through (0, 0), so the frame origin has to sit
        # on the contour being fitted: slide shore-normal from the node to the
        # nearest crossing of the target elevation and re-take the tangent there.
        candidates = _crossings(_scan_line(bathy, ox, oy, along, shore, 0.0), target)
        if not candidates:
            raise ValueError(f"{name}: the origin scan line never crosses {target:.2f} m")
        ref_offset = min(candidates, key=abs)
        rx, ry = ox + shore[0] * ref_offset, oy + shore[1] * ref_offset
        _, shore, along = _frame_at(name, bathy, rx, ry, spot["coast_tangent_deg"])

    lines = _contour_lines(bathy, rx, ry, along, shore, target, stage_start, stage_end)
    contour_points = _select_branch(lines, opts["branch"])
    if opts["truncate"] is not None:
        contour_points, stage_start, stage_end = _truncate_at_departure(
            contour_points, stage_start, stage_end, float(opts["truncate"]))
    if len(contour_points) < 8:
        raise ValueError(f"{name}: too few contour samples ({len(contour_points)})")
    c2, c3, rmse = _fit_x2_x3(contour_points)

    slope_points: list[tuple[float, float]] = []
    for d in range(-150, 81, 10):
        value = _sample_bathy(bathy, ox + shore[0] * d, oy + shore[1] * d)
        if value is not None and value < 0.0:
            slope_points.append((float(d), value))
    shore_slope = _linear_slope(slope_points)

    return {
        "u": spot["u"],
        "origin": (ox, oy),
        "ref_point": (rx, ry),
        "ref_offset": ref_offset,
        "target": target,
        "elev0": elev0,
        "shore": shore,
        "along": along,
        "osm_tangent_deg": spot["coast_tangent_deg"],
        "tangent_deg": math.degrees(math.atan2(along[1], along[0])),
        "shore_slope": shore_slope,
        "stage": (stage_start, stage_end),
        "lines": lines,
        "points": contour_points,
        "c2": c2,
        "c3": c3,
        "rmse": rmse,
        "options": opts,
    }


def _profile_for(name: str, spots: dict, canon_u: list[float], index: int, bathy: dict, options: dict | None = None) -> dict:
    m = _measure(name, spots, canon_u, index, bathy, options)
    profile = {
        "uM": round(m["u"], 1),
        "stageOriginENU": [round(m["origin"][0], 1), round(m["origin"][1], 1)],
        "stageAlongENU": [round(m["along"][0], 8), round(m["along"][1], 8)],
        "stageShoreENU": [round(m["shore"][0], 8), round(m["shore"][1], 8)],
        "osmCoastTangentDeg": round(m["osm_tangent_deg"], 1),
        "bathyContourTangentDeg": round(m["tangent_deg"], 1),
        "reefElevationNavd88M": round(m["elev0"], 2),
        "shoreSlope": round(m["shore_slope"], 6),
        "stageBoundsM": [round(m["stage"][0], 1), round(m["stage"][1], 1)],
        "contourFit": {
            "x2": round(m["c2"], 10),
            "x3": round(m["c3"], 12),
            "rmseM": round(m["rmse"], 2),
            "samples": len(m["points"]),
            "usable": m["rmse"] <= 5.0,
        },
    }
    if m["options"] != DEFAULT_OPTIONS:
        # Non-default fits carry their provenance. The default output is
        # unchanged so `--check` stays byte-stable.
        profile["contourFit"]["variant"] = {
            "ref": list(m["options"]["ref"]),
            "window": list(m["options"]["window"]),
            "branch": m["options"]["branch"],
            "truncate": m["options"]["truncate"],
            "refElevationNavd88M": round(m["target"], 2),
            "refOffsetShoreM": round(m["ref_offset"], 1),
        }
    return profile


def build(options: dict | None = None) -> str:
    osm = json.loads(OSM_PATH.read_text())
    bathy = json.loads(BATHY_PATH.read_text())
    spots = {spot["name"]: spot for spot in osm["spots"]}
    canon_u = [spots[name]["u"] for name in CANON]
    profiles = {
        name: _profile_for(name, spots, canon_u, index, bathy, options)
        for index, name in enumerate(CANON)
    }
    payload = {
        "version": 1,
        "generatedFrom": {
            "osm": "data/osm/pp_geometry.json",
            "osmSha256": _sha256(OSM_PATH),
            "bathy": "data/bathy/pp_bathy.json",
            "bathySha256": _sha256(BATHY_PATH),
            "bathyDatum": "NAVD88",
        },
        "profiles": profiles,
    }
    encoded = json.dumps(payload, indent=2, ensure_ascii=False)
    return (
        "// GENERATED by data/model/build_geo_profiles.py; do not edit by hand.\n"
        "// OSM supplies spot identity/u/windows; NCEI supplies the local contour and slope.\n"
        f"export const PP_GEO_DATA = Object.freeze({encoded});\n"
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="fail if the generated module is stale")
    parser.add_argument(
        "--truncate", type=float, default=None, metavar="SLOPE",
        help=(
            "end each stage where the contour turns more than atan(SLOPE) from the "
            "stage tangent between adjacent 10 m lines. Off by default. Measured "
            "passing band 0.4-0.7 (docs/research/PRIVATES_CONTOUR_2026-09-01.md); "
            "0.5 brings Private's to 1.87 m RMS and leaves the six mapped spots byte-identical."
        ),
    )
    parser.add_argument("--print", action="store_true", help="write the module to stdout instead of the file")
    args = parser.parse_args()
    options = {"truncate": args.truncate} if args.truncate is not None else None
    output = build(options)
    if args.print:
        print(output, end="")
        return 0
    if args.check:
        if not OUT_PATH.exists() or OUT_PATH.read_text() != output:
            print(f"stale: {OUT_PATH}")
            return 1
        print(f"current: {OUT_PATH}")
        return 0
    OUT_PATH.write_text(output)
    print(f"wrote {OUT_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
