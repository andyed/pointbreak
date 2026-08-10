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


def _profile_for(name: str, spots: dict, canon_u: list[float], index: int, bathy: dict) -> dict:
    spot = spots[name]
    u = spot["u"]
    prev_u = canon_u[index - 1] if index else 0.0
    next_u = canon_u[index + 1] if index + 1 < len(canon_u) else spots["Trees"]["u"]
    stage_start = max(-250.0, (prev_u + u) / 2 - u)
    stage_end = min(250.0, (u + next_u) / 2 - u)

    ox, oy = spot["x"], spot["y"]
    elev0 = _sample_bathy(bathy, ox, oy)
    if elev0 is None:
        raise ValueError(f"{name}: spot falls outside bathymetry grid")

    # Bathymetric gradient points uphill/shoreward. Its perpendicular is the
    # local equal-elevation tangent; orient that tangent to OSM down-point.
    eps = 5.0
    ex1, ex0 = _sample_bathy(bathy, ox + eps, oy), _sample_bathy(bathy, ox - eps, oy)
    ey1, ey0 = _sample_bathy(bathy, ox, oy + eps), _sample_bathy(bathy, ox, oy - eps)
    if None in (ex1, ex0, ey1, ey0):
        raise ValueError(f"{name}: cannot estimate bathymetric gradient")
    gx, gy = (ex1 - ex0) / (2 * eps), (ey1 - ey0) / (2 * eps)
    glen = math.hypot(gx, gy)
    if glen < 1e-9:
        raise ValueError(f"{name}: degenerate bathymetric gradient")
    shore = (gx / glen, gy / glen)
    along = (shore[1], -shore[0])
    osm_tangent = (
        math.cos(math.radians(spot["coast_tangent_deg"])),
        math.sin(math.radians(spot["coast_tangent_deg"])),
    )
    if along[0] * osm_tangent[0] + along[1] * osm_tangent[1] < 0:
        along = (-along[0], -along[1])

    contour_points: list[tuple[float, float]] = []
    x = math.ceil(stage_start / 10) * 10
    while x <= stage_end + 1e-9:
        scan = []
        z = -150.0
        while z <= 150.0 + 1e-9:
            px = ox + along[0] * x + shore[0] * z
            py = oy + along[1] * x + shore[1] * z
            scan.append((z, _sample_bathy(bathy, px, py)))
            z += 1.0
        candidates = _crossings(scan, elev0)
        if candidates:
            # The contour through the stage origin is the nearest branch in
            # this local window. Mapped runtime spots all fit below 2 m RMSE.
            contour_points.append((x, min(candidates, key=abs)))
        x += 10.0

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
        "uM": round(u, 1),
        "stageOriginENU": [round(ox, 1), round(oy, 1)],
        "stageAlongENU": [round(along[0], 8), round(along[1], 8)],
        "stageShoreENU": [round(shore[0], 8), round(shore[1], 8)],
        "osmCoastTangentDeg": round(spot["coast_tangent_deg"], 1),
        "bathyContourTangentDeg": round(math.degrees(math.atan2(along[1], along[0])), 1),
        "reefElevationNavd88M": round(elev0, 2),
        "shoreSlope": round(shore_slope, 6),
        "stageBoundsM": [round(stage_start, 1), round(stage_end, 1)],
        "contourFit": {
            "x2": round(c2, 10),
            "x3": round(c3, 12),
            "rmseM": round(rmse, 2),
            "samples": len(contour_points),
            "usable": rmse <= 5.0,
        },
    }


def build() -> str:
    osm = json.loads(OSM_PATH.read_text())
    bathy = json.loads(BATHY_PATH.read_text())
    spots = {spot["name"]: spot for spot in osm["spots"]}
    canon_u = [spots[name]["u"] for name in CANON]
    profiles = {
        name: _profile_for(name, spots, canon_u, index, bathy)
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
    args = parser.parse_args()
    output = build()
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
