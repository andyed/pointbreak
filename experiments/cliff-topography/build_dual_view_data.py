#!/usr/bin/env python3
"""Build high-resolution shore-normal transect profiles for Pleasure Point.

Computes 2D elevation profiles across all canonical spots and along regular
down-point intervals from deep water (-12m NAVD88) across the breaking zone,
waterline (MSL = +0.905m), cliff face, and upper coastal terrace (+18m NAVD88).

Exports:
  data/model/pp_transects.js — compact data module for the dual-view interactive UI
"""

import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))  # repo root (2 up from experiments/<name>/)

BATHY_PATH = os.path.join(ROOT, "data/bathy/pp_bathy.json")
GEO_PATH = os.path.join(ROOT, "data/osm/pp_geometry.json")

with open(BATHY_PATH) as f:
    BATHY = json.load(f)
with open(GEO_PATH) as f:
    GEO = json.load(f)

THETA_DEG = 45.0
TH = math.radians(THETA_DEG)
MSL_ABOVE_NAVD88 = 0.905
GAMMA = 0.78
H0_REF = 1.5
H_BREAK = H0_REF / GAMMA

CANON = [
    "Sewer Peak", "First Peak", "Second Peak", "38th",
    "The Hook", "Shark's Cove", "Private's"
]
SHORT = {
    "Sewer Peak": "Sewers", "First Peak": "First Peak",
    "Second Peak": "Second Peak", "38th": "38th",
    "The Hook": "The Hook", "Shark's Cove": "Sharks",
    "Private's": "Privates"
}

E = BATHY["elev"]
BX0, BY0 = BATHY["x0"], BATHY["y0"]
BDX, BDY = BATHY["dx"], BATHY["dy"]
NC, NR = BATHY["ncols"], BATHY["nrows"]

def bed(x, y):
    c = (x - BX0) / BDX
    r = (y - BY0) / BDY
    c0, r0 = math.floor(c), math.floor(r)
    if c0 < 0 or r0 < 0 or c0 + 1 >= NC or r0 + 1 >= NR:
        return None
    fx, fy = c - c0, r - r0
    v00, v10 = E[r0][c0], E[r0][c0 + 1]
    v01, v11 = E[r0 + 1][c0], E[r0 + 1][c0 + 1]
    if None in (v00, v10, v01, v11):
        return None
    return ((1 - fx) * (1 - fy) * v00 + fx * (1 - fy) * v10
            + (1 - fx) * fy * v01 + fx * fy * v11)

def to_point(x, y):
    return (x * math.cos(TH) + y * math.sin(TH),
            -x * math.sin(TH) + y * math.cos(TH))

def to_enu(X, Y):
    return (X * math.cos(TH) - Y * math.sin(TH),
            X * math.sin(TH) + Y * math.cos(TH))

SPOTS = {s["name"]: s for s in GEO["spots"]}
SPOT_PF = {n: to_point(SPOTS[n]["x"], SPOTS[n]["y"]) for n in CANON if n in SPOTS}

X_MIN = min(p[0] for p in SPOT_PF.values()) - 120.0
X_MAX = max(p[0] for p in SPOT_PF.values()) + 120.0
Y_NEAR_SUB = max(p[1] for p in SPOT_PF.values()) + 62.0
Y_FAR = Y_NEAR_SUB - 320.0
Y_LAND = Y_NEAR_SUB + 150.0

def get_transect(X_val, step_y=2.0):
    pts = []
    y = Y_FAR
    waterline_y = None
    break_y = None
    cliff_top_y = None
    cliff_top_elev = -999.0
    prev_e = None

    while y <= Y_LAND + 1e-6:
        ex, ey = to_enu(X_val, y)
        e = bed(ex, ey)
        if e is not None:
            depth_m = max(0.0, MSL_ABOVE_NAVD88 - e)
            height_m = max(0.0, e - MSL_ABOVE_NAVD88)

            if prev_e is not None and waterline_y is None:
                if (prev_e <= MSL_ABOVE_NAVD88 < e) or (prev_e >= MSL_ABOVE_NAVD88 > e):
                    waterline_y = y

            if break_y is None and depth_m <= H_BREAK and prev_e is not None and (MSL_ABOVE_NAVD88 - prev_e) > H_BREAK:
                break_y = y

            if e > cliff_top_elev and y > Y_NEAR_SUB - 20:
                cliff_top_elev = e
                cliff_top_y = y

            pts.append({
                "y": round(y, 1),
                "elev": round(e, 2),
                "depth": round(depth_m, 2),
                "height": round(height_m, 2)
            })
            prev_e = e
        y += step_y

    return {
        "x": round(X_val, 1),
        "waterline_y": round(waterline_y, 1) if waterline_y is not None else None,
        "break_y": round(break_y, 1) if break_y is not None else None,
        "cliff_top_y": round(cliff_top_y, 1) if cliff_top_y is not None else None,
        "cliff_top_elev": round(cliff_top_elev, 2) if cliff_top_elev > -900 else None,
        "points": pts
    }

spot_transects = {}
for name in CANON:
    if name in SPOT_PF:
        X_s, Y_s = SPOT_PF[name]
        tr = get_transect(X_s, step_y=2.0)
        tr["spot_name"] = SHORT[name]
        tr["full_name"] = name
        tr["spot_y"] = round(Y_s, 1)
        spot_transects[SHORT[name]] = tr

grid_transects = []
cur_x = X_MIN
while cur_x <= X_MAX + 1e-6:
    tr = get_transect(cur_x, step_y=3.0)
    grid_transects.append(tr)
    cur_x += 30.0

payload = {
    "datum": "NAVD88",
    "msl_navd88_m": MSL_ABOVE_NAVD88,
    "h_break_m": round(H_BREAK, 2),
    "h0_ref_m": H0_REF,
    "gamma": GAMMA,
    "y_far": Y_FAR,
    "y_land": Y_LAND,
    "x_min": X_MIN,
    "x_max": X_MAX,
    "spots": spot_transects,
    "grid": grid_transects
}

out_js = os.path.join(HERE, "pp_transects.js")
with open(out_js, "w") as f:
    f.write("export const PP_TRANSECTS = " + json.dumps(payload, separators=(',', ':')) + ";" + chr(10))

print(f"Generated {out_js} ({len(spot_transects)} spots, {len(grid_transects)} grid transects)")
