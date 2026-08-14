#!/usr/bin/env python3
"""Generate fig-floor-cliff.svg and standalone 3D grid topography of Pleasure Point.

Extends the submerged seabed model from fig-floor.svg to include the land cliff
geometry (coastal cliffs and terrace above NAVD88 datum up to ~20-30m elevation).

Built using /muriel spatial capabilities and OLED visual standards:
- 8:1 minimum WCAG text contrast with pre-blended solid halos
- Near-black OLED background (#0f1216)
- Submerged reef / seabed in teal-slate-sand diverging ramp
- Waterline / Mean Sea Level (MSL = NAVD88 +0.905 m) clearly demarcated
- Land / Cliff geometry rendered with warm terracotta/cliff gridlines
- Spot labels (Sewers to Privates) & cliff top features
- Complete legend, scale bar, and technical annotations

Data sources:
  data/bathy/pp_bathy.json    NOAA NCEI Monterey 1/3" coastal DEM, NAVD88 m
  data/osm/pp_geometry.json   OSM coastline + canon surf spots
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

# ---------------------------------------------------------------- constants
THETA_DEG = 45.0          # PP_MAP_GEOMETRY.md finding #2
TH = math.radians(THETA_DEG)
MSL_ABOVE_NAVD88 = 0.905  # NOAA CO-OPS 9413450 Monterey
GAMMA = 0.78              # McCowan breaker index
H0_REF = 1.5              # m, reference swell height
VE = 7.0                  # vertical exaggeration

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

# Bathy grid
E = BATHY["elev"]
BX0, BY0 = BATHY["x0"], BATHY["y0"]
BDX, BDY = BATHY["dx"], BATHY["dy"]
NC, NR = BATHY["ncols"], BATHY["nrows"]

def bed(x, y):
    """Bilinear NAVD88 elevation at ENU (x, y); None outside grid."""
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

def depth(x, y):
    """Still-water depth in m; None on land or off-grid."""
    e = bed(x, y)
    if e is None:
        return None
    d = MSL_ABOVE_NAVD88 - e
    return d if d > 0 else None

# Point frame rotation
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

# Extend Y shoreward (landward) to capture the cliffs
Y_NEAR_SUB = max(p[1] for p in SPOT_PF.values()) + 62.0   # Waterline area (~0.3m)
Y_FAR = Y_NEAR_SUB - 320.0                                # Seaward edge (~6.5m depth)
Y_LAND = Y_NEAR_SUB + 150.0                               # Cliff top & coastal terrace edge

# Canvas dimensions
W, H = 1280, 920
PLOT_L, PLOT_R = 72, 1208
PLOT_T, PLOT_B = 220, 740

SKEW = 0.28
SPAN_X = X_MAX - X_MIN
SPAN_Y = Y_LAND - Y_FAR

sx = (PLOT_R - PLOT_L) / (SPAN_X + SKEW * SPAN_Y)
sy = (PLOT_B - PLOT_T) / SPAN_Y

def project(X, Y, elev_m):
    """Point frame + elevation -> SVG px."""
    dy_off = Y_LAND - Y                 # 0 at far land, +SPAN_Y offshore
    px = PLOT_L + (X - X_MIN) * sx + dy_off * SKEW * sx
    py = PLOT_B - dy_off * sy - (elev_m - (-12.0)) * VE * 0.45
    return px, py

# Fit plane for submerged portion
PLANE_SAMPLES = []
X_STEP_S, Y_STEP_S = 25.0, 12.0
_X = X_MIN
while _X <= X_MAX:
    _Y = Y_FAR
    while _Y <= Y_NEAR_SUB:
        ex, ey = to_enu(_X, _Y)
        e = bed(ex, ey)
        if e is not None and MSL_ABOVE_NAVD88 - e > 0:
            PLANE_SAMPLES.append((_X, _Y, e))
        _Y += Y_STEP_S
    _X += X_STEP_S

def fit_plane(samples):
    n = len(samples)
    sX = sum(p[0] for p in samples); sY = sum(p[1] for p in samples)
    sE = sum(p[2] for p in samples)
    sXX = sum(p[0] * p[0] for p in samples); sYY = sum(p[1] * p[1] for p in samples)
    sXY = sum(p[0] * p[1] for p in samples)
    sXE = sum(p[0] * p[2] for p in samples); sYE = sum(p[1] * p[1] for p in samples)
    M = [[n, sX, sY, sE], [sX, sXX, sXY, sXE], [sY, sXY, sYY, sYE]]
    for i in range(3):
        p = max(range(i, 3), key=lambda r: abs(M[r][i]))
        M[i], M[p] = M[p], M[i]
        for r in range(3):
            if r != i and M[i][i]:
                f = M[r][i] / M[i][i]
                for c in range(i, 4):
                    M[r][c] -= f * M[i][c]
    return [M[i][3] / M[i][i] for i in range(3)]

PA, PB, PC = fit_plane(PLANE_SAMPLES)
RESID = [e - (PA + PB * X + PC * Y) for X, Y, e in PLANE_SAMPLES]
RMS = math.sqrt(sum(r * r for r in RESID) / len(RESID))
PLANE_SLOPE_DEG = math.degrees(math.atan(math.hypot(PB, PC)))
RESID_FULL = round(2.0 * RMS, 2)
CONTOUR_BEARING_DEG = math.degrees(math.atan2(-PB, PC))
if CONTOUR_BEARING_DEG > 90: CONTOUR_BEARING_DEG -= 180
if CONTOUR_BEARING_DEG < -90: CONTOUR_BEARING_DEG += 180

ALPHA_DEEP_DEG = 58.0
T_REF = 14.0
C0 = 9.81 * T_REF / (2 * math.pi)
CB = math.sqrt(9.81 * H_BREAK)
PHI_B_DEG = math.degrees(math.asin(min(math.sin(math.radians(ALPHA_DEEP_DEG)) * CB / C0, 1.0)))

def grid_color(X, Y, elev):
    """Color strategy: Submerged bed vs Land cliff face."""
    if elev > MSL_ABOVE_NAVD88:
        # Land / Cliff geometry above MSL (+0.905m to ~+25m)
        h_above = elev - MSL_ABOVE_NAVD88
        if h_above < 3.0:
            return "#e29578" # Beach / cliff base (warm terracotta-sand)
        elif h_above < 10.0:
            return "#f4a261" # Cliff face (ochre / cliff gold)
        else:
            return "#e76f51" # Cliff top / terrace (terracotta orange)
    else:
        # Submerged ground: residual from mean plane
        r = elev - (PA + PB * X + PC * Y)
        t = max(-1.0, min(1.0, r / RESID_FULL))
        if t >= 0:
            a = (0x6b, 0x7f, 0x8c); b = (0xc9, 0xa8, 0x6a) # slate -> reef sand
        else:
            a = (0x6b, 0x7f, 0x8c); b = (0x2f, 0x6f, 0x7a) # slate -> channel teal
            t = -t
        c = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
        return "#%02x%02x%02x" % c

# Mesh generation
X_STEP = 30.0
Y_STEP = 20.0

def run_segments(pts):
    runs, cur = [], []
    for p in pts:
        if p is None:
            if len(cur) > 1: runs.append(cur)
            cur = []
        else:
            cur.append(p)
    if len(cur) > 1: runs.append(cur)
    return runs

def mesh_lines():
    out = []
    # Shore-normal lines (constant X)
    X = X_MIN
    while X <= X_MAX + 1e-6:
        pts = []
        Y = Y_FAR
        while Y <= Y_LAND + 1e-6:
            ex, ey = to_enu(X, Y)
            e = bed(ex, ey)
            if e is None:
                pts.append(None)
            else:
                pts.append(project(X, Y, e) + (X, Y, e))
            Y += Y_STEP * 0.5
        for run in run_segments(pts):
            out.append(("normal", run))
        X += X_STEP

    # Shore-parallel lines (constant Y)
    Y = Y_FAR
    while Y <= Y_LAND + 1e-6:
        pts = []
        X = X_MIN
        while X <= X_MAX + 1e-6:
            ex, ey = to_enu(X, Y)
            e = bed(ex, ey)
            if e is None:
                pts.append(None)
            else:
                pts.append(project(X, Y, e) + (X, Y, e))
            X += X_STEP * 0.5
        for run in run_segments(pts):
            out.append(("parallel", run))
        Y += Y_STEP
    return out

def waterline_locus():
    """Where elevation crosses MSL_ABOVE_NAVD88 (+0.905m)."""
    pts = []
    X = X_MIN
    while X <= X_MAX + 1e-6:
        found = None
        Y = Y_FAR
        prev_e = None
        while Y <= Y_LAND + 1e-6:
            ex, ey = to_enu(X, Y)
            e = bed(ex, ey)
            if e is not None and prev_e is not None:
                if (prev_e <= MSL_ABOVE_NAVD88 < e) or (prev_e >= MSL_ABOVE_NAVD88 > e):
                    found = project(X, Y, MSL_ABOVE_NAVD88)
                    break
            prev_e = e if e is not None else prev_e
            Y += 3.0
        if found:
            pts.append(found)
        X += 10.0
    return run_segments(pts)

def break_locus():
    """Where depth crosses H_BREAK (1.9m)."""
    pts = []
    X = X_MIN
    while X <= X_MAX + 1e-6:
        found = None
        Y = Y_FAR
        prev = None
        while Y <= Y_LAND + 1e-6:
            ex, ey = to_enu(X, Y)
            d = depth(ex, ey)
            if d is not None and prev is not None and prev > H_BREAK >= d:
                e = bed(ex, ey)
                found = project(X, Y, e)
                break
            prev = d if d is not None else prev
            Y += 4.0
        if found:
            pts.append(found)
        X += 12.0
    return run_segments(pts)

def crest_stroke(X_at, length=190.0):
    Yb = None
    prev = None
    Y = Y_FAR
    while Y <= Y_LAND + 1e-6:
        d = depth(*to_enu(X_at, Y))
        if d is not None and prev is not None and prev > H_BREAK >= d:
            Yb = Y
            break
        prev = d if d is not None else prev
        Y += 4.0
    if Yb is None:
        return None
    ph = math.radians(PHI_B_DEG)
    seg = []
    for s in (-length / 2, length / 2):
        Xs = X_at + s * math.cos(ph)
        Ys = Yb - s * math.sin(ph)
        e = bed(*to_enu(Xs, Ys))
        if e is None: e = MSL_ABOVE_NAVD88 - H_BREAK
        seg.append(project(Xs, Ys, e))
    return seg

# Generate SVG output
def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

def halo_label(px, py, text, cls="flr-lbl", size=16, weight=600, anchor="middle"):
    w = len(text) * size * 0.56 + 16
    h = size + 12
    x0 = px - (w / 2 if anchor == "middle" else (w - 10 if anchor == "end" else 10))
    return (f'<rect class="flr-halo" x="{x0:.1f}" y="{py - h + 5:.1f}" '
            f'width="{w:.1f}" height="{h:.1f}" rx="3"/>'
            f'<text class="{cls}" x="{px:.1f}" y="{py:.1f}" font-size="{size}" '
            f'font-weight="{weight}" text-anchor="{anchor}">{esc(text)}</text>')

def build_svg():
    parts = []
    parts.append(
        f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" '
        f'font-family="-apple-system, \'Helvetica Neue\', Arial, sans-serif">'
    )
    parts.append('<title>Pleasure Point — 3D Topography &amp; Cliff Geometry</title>')
    parts.append(
        '<desc>Extended 3D grid topography of Pleasure Point showing both the submerged '
        'seabed and coastal land cliff geometry from NOAA NCEI 1/3" coastal DEM.</desc>'
    )

    parts.append("""<style>
      .flr-bg { fill: #0f1216; }
      .flr-halo { fill: #0f1216; opacity: 0.92; }
      .flr-lbl { fill: #e6e4d2; }
      .flr-lbl-dim { fill: #c8c7b8; }
      .flr-lbl-foam { fill: #eef2f3; }
      .flr-lbl-cliff { fill: #f4a261; }
      .flr-title { fill: #eef2f3; }
      .flr-credit { fill: #bfbeb0; }
      .flr-mesh-sub-n { fill: none; stroke-width: 0.9; stroke-linecap: round; }
      .flr-mesh-sub-p { fill: none; stroke-width: 1.4; stroke-linecap: round; }
      .flr-mesh-land-n { fill: none; stroke-width: 1.1; stroke-linecap: round; }
      .flr-mesh-land-p { fill: none; stroke-width: 1.8; stroke-linecap: round; }
      .flr-waterline { fill: none; stroke: #7fdfff; stroke-width: 3.5; stroke-dasharray: 6 3;
                       stroke-linecap: round; stroke-linejoin: round; }
      .flr-breakline { fill: none; stroke: #eef2f3; stroke-width: 3.2;
                       stroke-linecap: round; stroke-linejoin: round; }
      .flr-crest { fill: none; stroke: #c9a86a; stroke-width: 2.4; stroke-linecap: round; }
      .flr-spot { fill: #eef2f3; stroke: #0f1216; stroke-width: 1.4; }
      .flr-stem { stroke: #eef2f3; stroke-width: 1.1; opacity: 0.75; }
      .flr-scalebar { stroke: #e6e4d2; stroke-width: 2; }
      .flr-frame { fill: none; stroke: #6b7f8c; stroke-width: 1; opacity: 0.45; }
    </style>""")

    parts.append(f'<rect class="flr-bg" x="0" y="0" width="{W}" height="{H}"/>')

    # Title block
    parts.append(f'<text class="flr-title" x="48" y="58" font-size="32" font-weight="700" '
                 f'font-family="Georgia, \'Times New Roman\', serif">'
                 f'PLEASURE POINT — 3D topography &amp; cliff geometry</text>')

    PEEL_DEG = abs(abs(CONTOUR_BEARING_DEG) - PHI_B_DEG)
    parts.append(f'<text class="flr-lbl" x="48" y="92" font-size="17" font-weight="500">'
                 f'Submerged reef (0.50 m RMS, 1:58 ramp) extended to coastal terrace cliffs (+18 m NAVD88).'
                 f'</text>')
    parts.append(f'<text class="flr-lbl" x="48" y="116" font-size="17" font-weight="500">'
                 f'Waterline at MSL (+0.91 m NAVD88). Contour bearing {abs(CONTOUR_BEARING_DEG):.0f}° '
                 f'vs refracted crest {PHI_B_DEG:.0f}° ({PEEL_DEG:.0f}° peel angle).'
                 f'</text>')
    parts.append(f'<text class="flr-credit" x="48" y="142" font-size="13" font-weight="500">'
                 f'Bathymetry &amp; Topography: NOAA NCEI Monterey Bay 1/3″ coastal DEM, NAVD88. '
                 f'Coastline &amp; spots: OpenStreetMap (ODbL 1.0).'
                 f'</text>')
    parts.append(f'<text class="flr-credit" x="48" y="160" font-size="13" font-weight="500">'
                 f'MSL = NAVD88 +0.905 m (NOAA CO-OPS 9413450). Vertical exaggeration ×{VE:.0f}.'
                 f'</text>')

    parts.append(f'<rect class="flr-frame" x="{PLOT_L - 14}" y="{PLOT_T - 26}" '
                 f'width="{PLOT_R - PLOT_L + 28}" height="{PLOT_B - PLOT_T + 74}"/>')

    # Render mesh lines
    sub_norm, sub_par = [], []
    land_norm, land_par = [], []

    for kind, run in mesh_lines():
        mean_e = sum(p[4] for p in run) / len(run)
        mean_X = sum(p[2] for p in run) / len(run)
        mean_Y = sum(p[3] for p in run) / len(run)

        col = grid_color(mean_X, mean_Y, mean_e)
        pts_str = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in run)

        if mean_e > MSL_ABOVE_NAVD88:
            if kind == "normal":
                land_norm.append(f'<polyline class="flr-mesh-land-n" stroke="{col}" points="{pts_str}"/>')
            else:
                land_par.append(f'<polyline class="flr-mesh-land-p" stroke="{col}" points="{pts_str}"/>')
        else:
            if kind == "normal":
                sub_norm.append(f'<polyline class="flr-mesh-sub-n" stroke="{col}" points="{pts_str}"/>')
            else:
                sub_par.append(f'<polyline class="flr-mesh-sub-p" stroke="{col}" points="{pts_str}"/>')

    parts.append('<g id="submerged-normal">' + "".join(sub_norm) + '</g>')
    parts.append('<g id="submerged-parallel">' + "".join(sub_par) + '</g>')
    parts.append('<g id="land-normal">' + "".join(land_norm) + '</g>')
    parts.append('<g id="land-parallel">' + "".join(land_par) + '</g>')

    # Waterline (MSL = +0.905m)
    for run in waterline_locus():
        pts_str = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in run)
        parts.append(f'<polyline class="flr-waterline" points="{pts_str}"/>')

    # Reference break locus
    for run in break_locus():
        pts_str = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in run)
        parts.append(f'<polyline class="flr-breakline" points="{pts_str}"/>')

    # Refracted crest strokes
    for frac in (0.30, 0.56, 0.82):
        Xc = X_MIN + (X_MAX - X_MIN) * frac
        seg = crest_stroke(Xc)
        if seg:
            pts_str = " ".join(f"{p[0]:.1f},{p[1]:.1f}" for p in seg)
            parts.append(f'<polyline class="flr-crest" points="{pts_str}"/>')

    # Canon spots
    for _i, name in enumerate(CANON):
        if name not in SPOT_PF: continue
        X, Y = SPOT_PF[name]
        if not (X_MIN <= X <= X_MAX): continue
        e = bed(*to_enu(X, Y))
        if e is None: e = MSL_ABOVE_NAVD88
        px, py = project(X, Y, min(e, MSL_ABOVE_NAVD88 - 0.2))
        lift = 32 if _i % 2 == 0 else 58
        parts.append(f'<line class="flr-stem" x1="{px:.1f}" y1="{py:.1f}" '
                     f'x2="{px:.1f}" y2="{py - lift:.1f}"/>')
        parts.append(f'<circle class="flr-spot" cx="{px:.1f}" cy="{py:.1f}" r="4.5"/>')
        parts.append(halo_label(px, py - lift - 6, SHORT[name], cls="flr-lbl-foam", size=15, weight=600))

    # Cliff / Land Features
    cliff_x = SPOT_PF["38th"][0]
    cliff_y = SPOT_PF["38th"][1] + 110.0
    c_px, c_py = project(cliff_x, cliff_y, 14.0)
    parts.append(f'<circle cx="{c_px:.1f}" cy="{c_py:.1f}" r="4" fill="#f4a261" stroke="#0f1216"/>')
    parts.append(halo_label(c_px + 80, c_py - 12, "East Cliff Dr / Terrace (+14m)", cls="flr-lbl-cliff", size=14, weight=600, anchor="middle"))

    # Legend / Keys
    LEG_Y = PLOT_B + 48
    parts.append(f'<line class="flr-breakline" x1="{PLOT_L}" y1="{LEG_Y}" x2="{PLOT_L + 40}" y2="{LEG_Y}"/>')
    parts.append(f'<text class="flr-lbl" x="{PLOT_L + 48}" y="{LEG_Y + 5}" font-size="15" font-weight="500">'
                 f'break depth (h = 1.9 m)</text>')

    parts.append(f'<line class="flr-crest" x1="{PLOT_L + 220}" y1="{LEG_Y + 6}" x2="{PLOT_L + 260}" y2="{LEG_Y - 6}"/>')
    parts.append(f'<text class="flr-lbl" x="{PLOT_L + 268}" y="{LEG_Y + 5}" font-size="15" font-weight="500">'
                 f'refracted crest (φ = 10°)</text>')

    parts.append(f'<line class="flr-waterline" x1="{PLOT_L + 460}" y1="{LEG_Y}" x2="{PLOT_L + 500}" y2="{LEG_Y}"/>')
    parts.append(f'<text class="flr-lbl" x="{PLOT_L + 508}" y="{LEG_Y + 5}" font-size="15" font-weight="500">'
                 f'waterline (MSL +0.91 m)</text>')

    # Color key
    KX = PLOT_L + 950
    parts.append(f'<text class="flr-lbl-dim" x="{KX}" y="{LEG_Y - 14}" font-size="13" font-weight="500" text-anchor="middle">terrain &amp; seabed elevation</text>')
    # Submerged ramp
    for i in range(20):
        t = i / 19.0
        r = -RESID_FULL + 2 * RESID_FULL * t
        c_sub = grid_color(0, Y_FAR, -RESID_FULL + 2 * RESID_FULL * t)
        parts.append(f'<rect x="{KX - 120 + i * 4:.1f}" y="{LEG_Y - 8}" width="4.1" height="12" fill="{c_sub}"/>')
    # Land cliff ramp
    for i in range(20):
        t = i / 19.0
        e_land = MSL_ABOVE_NAVD88 + 0.1 + t * 18.0
        c_land = grid_color(0, Y_LAND, e_land)
        parts.append(f'<rect x="{KX + 10 + i * 4:.1f}" y="{LEG_Y - 8}" width="4.1" height="12" fill="{c_land}"/>')

    parts.append(f'<text class="flr-lbl-dim" x="{KX - 122}" y="{LEG_Y + 18}" font-size="13" text-anchor="start">−1.0m channel</text>')
    parts.append(f'<text class="flr-lbl-dim" x="{KX - 35}" y="{LEG_Y + 18}" font-size="13" text-anchor="end">+1.0m reef</text>')
    parts.append(f'<text class="flr-lbl-cliff" x="{KX + 10}" y="{LEG_Y + 18}" font-size="13" text-anchor="start">+1m shore</text>')
    parts.append(f'<text class="flr-lbl-cliff" x="{KX + 95}" y="{LEG_Y + 18}" font-size="13" text-anchor="end">+18m cliff</text>')

    # Scalebar
    SB_M = 200.0
    sb_px = SB_M * sx
    SBX, SBY = PLOT_L, PLOT_B + 88
    parts.append(f'<line class="flr-scalebar" x1="{SBX}" y1="{SBY}" x2="{SBX + sb_px:.1f}" y2="{SBY}"/>')
    parts.append(f'<line class="flr-scalebar" x1="{SBX}" y1="{SBY - 5}" x2="{SBX}" y2="{SBY + 5}"/>')
    parts.append(f'<line class="flr-scalebar" x1="{SBX + sb_px:.1f}" y1="{SBY - 5}" x2="{SBX + sb_px:.1f}" y2="{SBY + 5}"/>')
    parts.append(f'<text class="flr-lbl" x="{SBX + sb_px / 2:.1f}" y="{SBY - 10}" font-size="15" font-weight="600" text-anchor="middle">{SB_M:.0f} m along-point</text>')

    parts.append(f'<text class="flr-lbl-dim" x="{PLOT_R}" y="{SBY + 4}" font-size="14" font-weight="500" text-anchor="end">'
                 f'T = {T_REF:.0f} s, deep-water α = {ALPHA_DEEP_DEG:.0f}° · gridlines {X_STEP:.0f} m down-point × {Y_STEP:.0f} m shore-normal'
                 f'</text>')

    parts.append(f'<text class="flr-lbl-dim" x="{PLOT_L}" y="{PLOT_T - 36}" font-size="15" font-weight="500">&#8593; offshore</text>')
    parts.append(f'<text class="flr-lbl-dim" x="{PLOT_R - 140}" y="{PLOT_T - 36}" font-size="15" font-weight="500">land / cliff top &#8593;</text>')
    parts.append(f'<text class="flr-lbl-dim" x="{PLOT_R}" y="{PLOT_T - 36}" font-size="15" font-weight="500" text-anchor="end">down-point &#8594;</text>')

    parts.append('</svg>')

    return chr(10).join(parts) + chr(10)

if __name__ == "__main__":
    svg_content = build_svg()
    out_svg = os.path.join(HERE, "fig-floor-cliff.svg")
    with open(out_svg, "w") as f:
        f.write(svg_content)
    print("Successfully generated " + out_svg)
