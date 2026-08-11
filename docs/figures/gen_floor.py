#!/usr/bin/env python3
"""Generate fig-floor.svg — "PLEASURE POINT, the floor is a ramp".

The companion to fig-topology. That figure answers *where* the point is; this
one answers *why it can no longer make a peel*, which is the finding recorded in
MODEL.md 2.4 and is invisible in a contour plot.

The claim, in one line: over submerged ground the seabed is 0.58 m RMS about a
1:53 plane whose contours run 4 deg off shore-parallel, and refracted crests
arrive at 10 deg — leaving ~5 deg between crest and break line. 5 deg is a
closeout. Both ingredients of a peel are missing: relief AND bearing.

MEASUREMENT NOTE. Building this figure is what surfaced the plane-fit bug fixed
on 2026-08-10 (MODEL.md 2.2 correction): the A/B plane was fitted over every
post, 20-40% of each stage frame is dry cliff, and the cliff set both the slope
(2.07 deg vs 1.05 deg at Second Peak) and the residual (2.56 m vs 0.32 m). Both
are now submerged-fit. This generator does its own independent submerged-only
fit over the whole point window and reports 0.50 m RMS on a 1:58 ramp, which
cross-checks the patch builder.

A contour map cannot carry this. At 2 m contour intervals the relief is between
the lines, and the bearing is a property of the whole family rather than of any
one contour. So this is an oblique wireframe: gridlines displaced by the actual
elevation, which shows relief directly, with the break-depth locus and the
refracted crest direction drawn on the same surface so the reader can see the
angle between them close to zero.

Data
----
  data/bathy/pp_bathy.json    NOAA NCEI Monterey 1/3" coastal DEM, NAVD88 m
  data/osm/pp_geometry.json   OSM coastline + canon surf spots

Coordinate strategy
-------------------
Same point frame as gen_topology.py: ENU rotated by -45 deg, the mean down-point
coast tangent that PP_MAP_GEOMETRY.md finding #2 measured. Down-point runs
left-to-right, matching fig-topology and fig-ladder's shared u axis, so the
three figures can be read as one sequence. Only screen placement is rotated;
every depth, distance and angle printed on the figure is the measured number.

Projection is oblique (cavalier-style): the viewer stands on the cliff looking
seaward, so offshore is far/up and the shore is near/bottom. Vertical
exaggeration is stated on the figure because an unlabelled exaggerated relief
is a lie about slope.

Every CSS class is prefixed flr- because the essay INLINES its figures into
one document (fig-week does the same with wk-). Unprefixed .bg / .lbl would
collide with fig-topology's identically named rules.

Deterministic; no randomness.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

with open(os.path.join(ROOT, "data/bathy/pp_bathy.json")) as f:
    BATHY = json.load(f)
with open(os.path.join(ROOT, "data/osm/pp_geometry.json")) as f:
    GEO = json.load(f)

# ---------------------------------------------------------------- constants
THETA_DEG = 45.0          # PP_MAP_GEOMETRY.md finding #2, same as gen_topology
TH = math.radians(THETA_DEG)
MSL_ABOVE_NAVD88 = 0.905  # NOAA CO-OPS 9413450 Monterey (MODEL.md 2.2)
GAMMA = 0.78              # McCowan breaker index
H0_REF = 1.5              # m, the Second Peak model-card swell height
VE = 7.0                  # vertical exaggeration, STATED on the figure

# Break depth for the reference swell: H = gamma*h at h = H0/gamma.
H_BREAK = H0_REF / GAMMA

CANON = ["Sewer Peak", "First Peak", "Second Peak", "38th",
         "The Hook", "Shark's Cove", "Private's"]
SHORT = {"Sewer Peak": "Sewers", "First Peak": "First Peak",
         "Second Peak": "Second Peak", "38th": "38th", "The Hook": "The Hook",
         "Shark's Cove": "Sharks", "Private's": "Privates"}

# --------------------------------------------------------------- bathy grid
E = BATHY["elev"]
BX0, BY0 = BATHY["x0"], BATHY["y0"]
BDX, BDY = BATHY["dx"], BATHY["dy"]
NC, NR = BATHY["ncols"], BATHY["nrows"]


def bed(x, y):
    """Bilinear NAVD88 elevation at ENU (x, y); None outside or on a gap."""
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


# ------------------------------------------------------------- point frame
def to_point(x, y):
    """ENU -> point frame (X down-point, Y offshore-positive)."""
    return (x * math.cos(TH) + y * math.sin(TH),
            -x * math.sin(TH) + y * math.cos(TH))


def to_enu(X, Y):
    return (X * math.cos(TH) - Y * math.sin(TH),
            X * math.sin(TH) + Y * math.cos(TH))


SPOTS = {s["name"]: s for s in GEO["spots"]}
SPOT_PF = {n: to_point(SPOTS[n]["x"], SPOTS[n]["y"]) for n in CANON if n in SPOTS}

# Point-frame window: span the canon, with margin. Y is chosen so the mesh runs
# from comfortably outside the break to the waterline.
X_MIN = min(p[0] for p in SPOT_PF.values()) - 120.0
X_MAX = max(p[0] for p in SPOT_PF.values()) + 120.0
# Depth FALLS as Y rises (measured: Y=-673 is 8.6 m, Y=-193 is 0.3 m), so the
# shoreward edge is max(spot Y) + margin. Getting this backwards put the whole
# window seaward of every spot: no break locus, no spots, nothing to compare.
Y_NEAR = max(p[1] for p in SPOT_PF.values()) + 62.0     # shoreward edge (~0.3 m)
Y_FAR = Y_NEAR - 320.0                                  # seaward edge (~6.5 m)

# ------------------------------------------------------------- projection
W, H = 1200, 820
PLOT_L, PLOT_R = 68, 1148
PLOT_T, PLOT_B = 232, 668

SKEW = 0.30      # oblique lean: how far a unit of offshore distance slides in x
SPAN_X = X_MAX - X_MIN
SPAN_Y = Y_NEAR - Y_FAR

sx = (PLOT_R - PLOT_L) / (SPAN_X + SKEW * SPAN_Y)
sy = (PLOT_B - PLOT_T) / SPAN_Y


def project(X, Y, elev_m):
    """Point frame + elevation -> SVG px. Offshore is far (up); shore is near."""
    dy_off = Y_NEAR - Y                 # 0 at shore, +SPAN_Y offshore
    px = PLOT_L + (X - X_MIN) * sx + dy_off * SKEW * sx
    py = PLOT_B - dy_off * sy - (elev_m - (-12.0)) * VE * 0.5
    return px, py


# ------------------------------------------------------------------ colour
# Diverging about the local least-squares plane: this is the same measurement
# the sim's bed A/B (B key, MODEL.md 2.2) toggles, so the figure and the
# interactive demo report the same quantity.
def fit_plane(samples):
    n = len(samples)
    sX = sum(p[0] for p in samples); sY = sum(p[1] for p in samples)
    sE = sum(p[2] for p in samples)
    sXX = sum(p[0] * p[0] for p in samples); sYY = sum(p[1] * p[1] for p in samples)
    sXY = sum(p[0] * p[1] for p in samples)
    sXE = sum(p[0] * p[2] for p in samples); sYE = sum(p[1] * p[2] for p in samples)
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


# Sample the whole submerged window once, for the plane and the RMS.
PLANE_SAMPLES = []
_gx = 24
while X_MIN + _gx * 0 < X_MAX:
    break
X_STEP_S, Y_STEP_S = 25.0, 12.0
_X = X_MIN
while _X <= X_MAX:
    _Y = Y_FAR
    while _Y <= Y_NEAR:
        ex, ey = to_enu(_X, _Y)
        e = bed(ex, ey)
        if e is not None and MSL_ABOVE_NAVD88 - e > 0:
            PLANE_SAMPLES.append((_X, _Y, e))
        _Y += Y_STEP_S
    _X += X_STEP_S

PA, PB, PC = fit_plane(PLANE_SAMPLES)
RESID = [e - (PA + PB * X + PC * Y) for X, Y, e in PLANE_SAMPLES]
RMS = math.sqrt(sum(r * r for r in RESID) / len(RESID))
PLANE_SLOPE_DEG = math.degrees(math.atan(math.hypot(PB, PC)))
# Colour ramp spans +/- 2 sigma of the ACTUAL residual, not a round number:
# a +/-3 m ramp on a 0.58 m RMS field renders as uniform slate and hides the
# very structure the figure is asked about.
RESID_FULL = round(2.0 * RMS, 2)
# Contour bearing of the mean plane, relative to the point frame's down-point
# axis. atan2(-b, c) is the direction along which the plane does not change.
CONTOUR_BEARING_DEG = math.degrees(math.atan2(-PB, PC))
if CONTOUR_BEARING_DEG > 90:
    CONTOUR_BEARING_DEG -= 180
if CONTOUR_BEARING_DEG < -90:
    CONTOUR_BEARING_DEG += 180

# Refracted crest incidence for the reference swell (MODEL.md 2.4):
#   sin(phi_b) = sin(alpha) * c_b / c0
ALPHA_DEEP_DEG = 58.0
T_REF = 14.0
C0 = 9.81 * T_REF / (2 * math.pi)
CB = math.sqrt(9.81 * H_BREAK)
PHI_B_DEG = math.degrees(math.asin(min(math.sin(math.radians(ALPHA_DEEP_DEG)) * CB / C0, 1.0)))




def resid_color(r):
    """Diverging: channel (below plane) teal-dark -> plane -> reef (above) sand."""
    t = max(-1.0, min(1.0, r / RESID_FULL))
    if t >= 0:
        # plane -> reef high: slate to sand
        a = (0x6b, 0x7f, 0x8c); b = (0xc9, 0xa8, 0x6a)
    else:
        a = (0x6b, 0x7f, 0x8c); b = (0x2f, 0x6f, 0x7a)
        t = -t
    c = tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))
    return "#%02x%02x%02x" % c


# ------------------------------------------------------------------ meshes
X_STEP = 30.0      # down-point gridline spacing, m
Y_STEP = 20.0      # shore-normal gridline spacing, m


def polyline_pts(pairs):
    return " ".join(f"{px:.1f},{py:.1f}" for px, py in pairs)


def run_segments(pts):
    """Split a list of (px,py,resid) or None into contiguous runs."""
    runs, cur = [], []
    for p in pts:
        if p is None:
            if len(cur) > 1:
                runs.append(cur)
            cur = []
        else:
            cur.append(p)
    if len(cur) > 1:
        runs.append(cur)
    return runs


def mesh_lines():
    out = []
    # shore-normal lines (constant X) — the direction a wave actually travels
    X = X_MIN
    while X <= X_MAX + 1e-6:
        pts = []
        Y = Y_FAR
        while Y <= Y_NEAR + 1e-6:
            ex, ey = to_enu(X, Y)
            e = bed(ex, ey)
            if e is None or MSL_ABOVE_NAVD88 - e <= 0:
                pts.append(None)
            else:
                r = e - (PA + PB * X + PC * Y)
                pts.append(project(X, Y, e) + (r,))
            Y += Y_STEP * 0.5
        for run in run_segments(pts):
            out.append(("normal", run))
        X += X_STEP
    # shore-parallel lines (constant Y) — these ARE the contours' family, and
    # their near-horizontal run on screen is the bearing finding made visible
    Y = Y_FAR
    while Y <= Y_NEAR + 1e-6:
        pts = []
        X = X_MIN
        while X <= X_MAX + 1e-6:
            ex, ey = to_enu(X, Y)
            e = bed(ex, ey)
            if e is None or MSL_ABOVE_NAVD88 - e <= 0:
                pts.append(None)
            else:
                r = e - (PA + PB * X + PC * Y)
                pts.append(project(X, Y, e) + (r,))
            X += X_STEP * 0.5
        for run in run_segments(pts):
            out.append(("parallel", run))
        Y += Y_STEP
    return out


def break_locus():
    """Where still-water depth crosses H_BREAK — the reference break line."""
    pts = []
    X = X_MIN
    while X <= X_MAX + 1e-6:
        found = None
        Y = Y_FAR
        prev = None
        while Y <= Y_NEAR + 1e-6:
            ex, ey = to_enu(X, Y)
            d = depth(ex, ey)
            if d is not None and prev is not None and prev > H_BREAK >= d:
                e = bed(*to_enu(X, Y))
                found = project(X, Y, e)
                break
            prev = d if d is not None else prev
            Y += 4.0
        pts.append(found)
        X += 12.0
    return run_segments([p for p in pts])


# ---------------------------------------------------------------- emit SVG
def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))


def halo_label(px, py, text, cls="flr-lbl", size=17, weight=600, anchor="middle"):
    w = len(text) * size * 0.56 + 16
    h = size + 12
    x0 = px - (w / 2 if anchor == "middle" else (w - 10 if anchor == "end" else 10))
    return (f'<rect class="flr-halo" x="{x0:.1f}" y="{py - h + 5:.1f}" '
            f'width="{w:.1f}" height="{h:.1f}" rx="3"/>'
            f'<text class="{cls}" x="{px:.1f}" y="{py:.1f}" font-size="{size}" '
            f'font-weight="{weight}" text-anchor="{anchor}">{esc(text)}</text>')


parts = []
parts.append(
    f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" '
    f'font-family="-apple-system, \'Helvetica Neue\', Arial, sans-serif">')
parts.append('<title>Pleasure Point, the floor: relief without bearing</title>')
parts.append(
    '<desc>Oblique wireframe of the submerged seabed at Pleasure Point from the '
    'NOAA NCEI coastal DEM, with the reference break-depth locus and the '
    'refracted crest direction drawn on the same surface. The seabed carries '
    'the seabed is a smooth ramp whose contours and the arriving crests are '
    'nearly parallel, which is why the modelled wave closes out.</desc>')

# Contrast note, computed. SVG comments may not contain a double hyphen.
parts.append(
    '<!-- WCAG contrast, computed (sRGB relative luminance, WCAG 2.x).\n'
    '     No text uses opacity; dimmed labels are solid pre blended colors, so\n'
    '     the ratios below ARE what renders. Every text color sits on an opaque\n'
    '     bg colored halo.\n'
    '     foam    #eef2f3 on #0f1216 = 16.66:1  [title, spot labels]\n'
    '     ink     #e6e4d2 on #0f1216 = 14.66:1  [body labels, axis text]\n'
    '     lbl dim #c8c7b8 on #0f1216 = 11.01:1  [depth ticks, secondary]\n'
    '     credit  #bfbeb0 on #0f1216 = 10.02:1  [citation line]\n'
    '     sand    #c9a86a on #0f1216 =  8.31:1  [GRAPHICS only: the crest\n'
    '                                            strokes and the colour key]\n'
    '     slate   #6b7f8c and teal #2f6f7a are GRAPHICS only, never text. -->')

parts.append("""<style>
  .flr-bg { fill: var(--mg-bg, #0f1216); }
  .flr-halo { fill: var(--mg-bg, #0f1216); }
  .flr-lbl { fill: var(--mg-fg, #e6e4d2); }
  .flr-lbl-dim { fill: var(--mg-lbl-dim, #c8c7b8); }
  .flr-lbl-foam { fill: var(--mg-foam, #eef2f3); }
  .flr-title { fill: var(--mg-foam, #eef2f3); }
  .flr-credit { fill: var(--mg-credit, #bfbeb0); }
  .flr-mesh-n { fill: none; stroke-width: 0.9; stroke-linecap: round; }
  .flr-mesh-p { fill: none; stroke-width: 1.5; stroke-linecap: round; }
  .flr-breakline { fill: none; stroke: var(--mg-foam, #eef2f3); stroke-width: 3.2;
               stroke-linecap: round; stroke-linejoin: round; }
  .flr-crest { fill: none; stroke: var(--mg-sand, #c9a86a); stroke-width: 2.4;
           stroke-linecap: round; }
  .flr-spot { fill: var(--mg-foam, #eef2f3); stroke: var(--mg-bg, #0f1216);
          stroke-width: 1.4; }
  .flr-stem { stroke: var(--mg-foam, #eef2f3); stroke-width: 1.1; opacity: 0.75; }
  .flr-scalebar { stroke: var(--mg-fg, #e6e4d2); stroke-width: 2; }
  .flr-frame { fill: none; stroke: var(--mg-slate, #6b7f8c); stroke-width: 1;
           opacity: 0.45; }
</style>""")

parts.append(f'<rect class="flr-bg" x="0" y="0" width="{W}" height="{H}"/>')

# ---- title block
parts.append(f'<text class="flr-title" x="48" y="62" font-size="34" font-weight="700" '
             f'font-family="Georgia, \'Times New Roman\', serif">'
             f'PLEASURE POINT — the floor is a ramp</text>')
# Two lines each, measured to fit 1200 px: at 18 px the one-line version was
# ~1215 px and ran off the canvas. Text width is an input, not a guess.
PEEL_DEG = abs(abs(CONTOUR_BEARING_DEG) - PHI_B_DEG)
parts.append(f'<text class="flr-lbl" x="48" y="98" font-size="18" font-weight="500">'
             f'{RMS:.2f} m RMS about a 1:{1/math.tan(math.radians(PLANE_SLOPE_DEG)):.0f} plane. '
             f'Contours run {abs(CONTOUR_BEARING_DEG):.0f}\u00b0 off shore-parallel; '
             f'refracted crests arrive at {PHI_B_DEG:.0f}\u00b0.</text>')
parts.append(f'<text class="flr-lbl" x="48" y="124" font-size="18" font-weight="500">'
             f'The {PEEL_DEG:.0f}\u00b0 between them is the peel angle \u2014 and '
             f'{PEEL_DEG:.0f}\u00b0 is a closeout.</text>')
parts.append(f'<text class="flr-credit" x="48" y="152" font-size="14" font-weight="500">'
             f'Bathymetry: NOAA NCEI Monterey Bay 1/3\u2033 coastal DEM, NAVD88. '
             f'Coastline &amp; spots: OpenStreetMap (ODbL 1.0).</text>')
parts.append(f'<text class="flr-credit" x="48" y="172" font-size="14" font-weight="500">'
             f'Submerged ground only (MSL = NAVD88 + {MSL_ABOVE_NAVD88:.3f} m, '
             f'NOAA CO-OPS 9413450). Vertical exaggeration \u00d7{VE:.0f}.</text>')

parts.append(f'<rect class="flr-frame" x="{PLOT_L - 14}" y="{PLOT_T - 26}" '
             f'width="{PLOT_R - PLOT_L + 28}" height="{PLOT_B - PLOT_T + 74}"/>')

# ---- the mesh
g_norm, g_par = [], []
for kind, run in mesh_lines():
    # colour each run by its mean residual: one stroke per run keeps the file
    # small and the encoding legible (per-vertex gradients read as noise here)
    mr = sum(p[2] for p in run) / len(run)
    col = resid_color(mr)
    pts = polyline_pts([(p[0], p[1]) for p in run])
    if kind == "normal":
        g_norm.append(f'<polyline class="flr-mesh-n" stroke="{col}" points="{pts}"/>')
    else:
        g_par.append(f'<polyline class="flr-mesh-p" stroke="{col}" points="{pts}"/>')

parts.append('<g>' + "".join(g_norm) + '</g>')
parts.append('<g>' + "".join(g_par) + '</g>')

# ---- reference break locus
for run in break_locus():
    parts.append(f'<polyline class="flr-breakline" points="{polyline_pts(run)}"/>')

# ---- refracted crest direction, drawn ON the surface near the break
# Crests make PHI_B_DEG with the shore-normal, i.e. (90 - PHI_B) with the
# contour. Draw three parallel strokes crossing the break locus.
def crest_stroke(X_at, length=190.0):
    """A crest segment through (X_at, Y_break) at the refracted incidence."""
    # find the break Y at this X
    Yb = None
    prev = None
    Y = Y_FAR
    while Y <= Y_NEAR + 1e-6:
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
        if e is None:
            e = MSL_ABOVE_NAVD88 - H_BREAK
        seg.append(project(Xs, Ys, e))
    return seg


for frac in (0.30, 0.56, 0.82):
    Xc = X_MIN + (X_MAX - X_MIN) * frac
    seg = crest_stroke(Xc)
    if seg:
        parts.append(f'<polyline class="flr-crest" points="{polyline_pts(seg)}"/>')

# ---- canon spots
for _i, name in enumerate(CANON):
    if name not in SPOT_PF:
        continue
    X, Y = SPOT_PF[name]
    if not (X_MIN <= X <= X_MAX):
        continue
    e = bed(*to_enu(X, Y))
    if e is None:
        e = MSL_ABOVE_NAVD88
    px, py = project(X, Y, min(e, MSL_ABOVE_NAVD88 - 0.2))
    # stagger: adjacent spots are ~69 px apart on screen and labels are wider
    lift = 34 if _i % 2 == 0 else 62
    parts.append(f'<line class="flr-stem" x1="{px:.1f}" y1="{py:.1f}" '
                 f'x2="{px:.1f}" y2="{py - lift:.1f}"/>')
    parts.append(f'<circle class="flr-spot" cx="{px:.1f}" cy="{py:.1f}" r="4.6"/>')
    parts.append(halo_label(px, py - lift - 6, SHORT[name], cls="flr-lbl-foam",
                            size=16, weight=600))

# ---- legend / keys
LEG_Y = PLOT_B + 46
parts.append(f'<line class="flr-breakline" x1="{PLOT_L}" y1="{LEG_Y}" '
             f'x2="{PLOT_L + 46}" y2="{LEG_Y}"/>')
parts.append(f'<text class="flr-lbl" x="{PLOT_L + 56}" y="{LEG_Y + 6}" font-size="16" '
             f'font-weight="500">break depth, h = H&#8320;/γ = '
             f'{H_BREAK:.1f} m (H&#8320; = {H0_REF:.1f} m)</text>')

parts.append(f'<line class="flr-crest" x1="{PLOT_L + 470}" y1="{LEG_Y + 7}" '
             f'x2="{PLOT_L + 516}" y2="{LEG_Y - 7}"/>')
parts.append(f'<text class="flr-lbl" x="{PLOT_L + 526}" y="{LEG_Y + 6}" font-size="16" '
             f'font-weight="500">refracted crest, \u03c6 = {PHI_B_DEG:.0f}\u00b0</text>')

# residual colour key
KX = PLOT_L + 960
parts.append(f'<text class="flr-lbl-dim" x="{KX - 6}" y="{LEG_Y - 14}" font-size="14" '
             f'font-weight="500" text-anchor="middle">deviation from mean plane (m)</text>')
for i in range(41):
    t = i / 40.0
    r = -RESID_FULL + 2 * RESID_FULL * t
    parts.append(f'<rect x="{KX - 90 + i * 4.5:.1f}" y="{LEG_Y - 8}" width="4.6" '
                 f'height="13" fill="{resid_color(r)}"/>')
parts.append(f'<text class="flr-lbl-dim" x="{KX - 92}" y="{LEG_Y + 20}" font-size="14" '
             f'font-weight="500" text-anchor="start">−{RESID_FULL:.1f} channel</text>')
parts.append(f'<text class="flr-lbl-dim" x="{KX + 96}" y="{LEG_Y + 20}" font-size="14" '
             f'font-weight="500" text-anchor="end">+{RESID_FULL:.1f} reef</text>')

# ---- scale bar (down-point metres; oblique so state the axis it applies to)
SB_M = 200.0
sb_px = SB_M * sx
SBX, SBY = PLOT_L, PLOT_B + 88
parts.append(f'<line class="flr-scalebar" x1="{SBX}" y1="{SBY}" x2="{SBX + sb_px:.1f}" y2="{SBY}"/>')
parts.append(f'<line class="flr-scalebar" x1="{SBX}" y1="{SBY - 6}" x2="{SBX}" y2="{SBY + 6}"/>')
parts.append(f'<line class="flr-scalebar" x1="{SBX + sb_px:.1f}" y1="{SBY - 6}" '
             f'x2="{SBX + sb_px:.1f}" y2="{SBY + 6}"/>')
parts.append(f'<text class="flr-lbl" x="{SBX + sb_px / 2:.1f}" y="{SBY - 12}" font-size="16" '
             f'font-weight="600" text-anchor="middle">{SB_M:.0f} m along-point</text>')

parts.append(f'<text class="flr-lbl-dim" x="{PLOT_R}" y="{SBY + 4}" font-size="15" '
             f'font-weight="500" text-anchor="end">'
             f'T = {T_REF:.0f} s, deep-water α = {ALPHA_DEEP_DEG:.0f}° · '
             f'mean plane slope {PLANE_SLOPE_DEG:.1f}° '
             f'(1:{1 / math.tan(math.radians(PLANE_SLOPE_DEG)):.0f}) · '
             f'gridlines {X_STEP:.0f} m down-point × {Y_STEP:.0f} m shore-normal</text>')

parts.append(f'<text class="flr-lbl-dim" x="{PLOT_L}" y="{PLOT_T - 36}" font-size="16" '
             f'font-weight="500">&#8593; offshore</text>')
parts.append(f'<text class="flr-lbl-dim" x="{PLOT_R}" y="{PLOT_T - 36}" font-size="16" '
             f'font-weight="500" text-anchor="end">down-point &#8594;</text>')

parts.append('</svg>')

OUT = os.path.join(HERE, "fig-floor.svg")
with open(OUT, "w") as f:
    f.write("\n".join(parts) + "\n")

print(f"wrote {OUT}")
print(f"  residual RMS       {RMS:.2f} m   (n = {len(PLANE_SAMPLES)} submerged samples)")
print(f"  mean plane slope   {PLANE_SLOPE_DEG:.2f} deg  (1:{1/math.tan(math.radians(PLANE_SLOPE_DEG)):.0f})")
print(f"  contour bearing    {CONTOUR_BEARING_DEG:+.1f} deg off shore-parallel")
print(f"  refracted crest    {PHI_B_DEG:.1f} deg")
print(f"  peel angle implied {abs(abs(CONTOUR_BEARING_DEG) - PHI_B_DEG):.1f} deg")
