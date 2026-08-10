#!/usr/bin/env python3
"""
Generate fig-ladder.svg — "BECOMING A REGULAR: the ladder runs down-point"

Data sources (no invented numbers):
  - data/osm/pp_geometry.json  -> spots[].u, spots[].coast_tangent_deg
  - data/bathy/pp_bathy.json   -> spot_elev[].u, spot_elev[].elev_navd88_m
  - docs/research/PP_VISITORS_GUIDE_NOTES.md -> spot canon captions (paraphrased clauses)
  - docs/research/PP_MAP_GEOMETRY.md -> apex-rotation / shelter narrative
  - docs/research/SURF_SCIENCE_REFS.md -> Hutt/Black/Mead peel-angle vs skill (used only
    qualitatively -- see note below; no alpha number is computed or shown for these spots)

SURF_SCIENCE_REFS.md note: Hutt et al. 2001 (JCR SI 29) gives a 1-10 skill rating vs.
peel-angle-and-height table (section 2.3), anchored on 28 *other* world-class breaks, not
on PP's own measured spots. It does not supply a formula mapping PP's coast_tangent_deg
or elevation to an alpha value or a skill rating for these specific spots, so this figure
does not compute or display alpha/skill numbers for Pleasure Point. What it does use from
that literature is the qualitative frame: gentler, more sheltered breaks (this project's
down-point, shallow-reef spots) suit lower skill ratings, while faster/steeper breaks
(up-point, deeper reef, more exposed) suit higher ratings -- consistent with
PP_MAP_GEOMETRY.md's own "golden rule" reading of the measured geometry.

Run: python3 gen_ladder.py
Output: fig-ladder.svg next to this script.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))

with open(os.path.join(REPO, "data", "osm", "pp_geometry.json")) as f:
    geom = json.load(f)
with open(os.path.join(REPO, "data", "bathy", "pp_bathy.json")) as f:
    bathy = json.load(f)

geom_spots = {s["name"]: s for s in geom["spots"]}
elev_spots = {s["name"]: s for s in bathy["spot_elev"]}

# ---- contrast helpers (WCAG relative luminance) --------------------------
def _lin(c):
    c = c / 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

def _lum(hexcolor):
    h = hexcolor.lstrip("#")
    r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)

def contrast(a, b):
    la, lb = _lum(a), _lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)

BG = "#0f1216"
FG = "#e6e4d2"
FOAM = "#eef2f3"
KELP = "#1d2b28"
SAND = "#c9a86a"
TEAL = "#4a8f85"
SLATE = "#6b7f8c"

# foam-dim: foam pre-blended at alpha 0.9 over bg -- previously applied as a
# live opacity="0.9" on <text>, which both thins glyphs and understates its
# own contrast comment (muriel audit #6/#7 pattern: text opacity<1 is a
# legibility defect and a false-ratio risk). Baked to a solid color instead.
FOAM_DIM = "#d8dcdd"

CONTRASTS = {
    "cream(#e6e4d2) on bg(#0f1216)": contrast(FG, BG),
    "foam(#eef2f3) on bg(#0f1216)": contrast(FOAM, BG),
    "cream(#e6e4d2) on kelp(#1d2b28)": contrast(FG, KELP),
    "foam(#eef2f3) on kelp(#1d2b28)": contrast(FOAM, KELP),
    "sand(#c9a86a) on bg(#0f1216)": contrast(SAND, BG),
    "foam-dim(#d8dcdd) on bg(#0f1216) [spot-caption, solid, no opacity]": contrast(FOAM_DIM, BG),
}
CONTRASTS_EXCLUDED_FROM_TEXT = {
    "teal(#4a8f85) on bg(#0f1216) [graphic only]": contrast(TEAL, BG),
    "slate(#6b7f8c) on bg(#0f1216) [graphic only]": contrast(SLATE, BG),
    "sand(#c9a86a) on kelp(#1d2b28) [avoid, use bg instead]": contrast(SAND, KELP),
}

# ---- geometry mapping ------------------------------------------------------
U_MIN, U_MAX = -100.0, 2100.0
PLOT_X0, PLOT_X1 = 130.0, 1160.0
SCALE = (PLOT_X1 - PLOT_X0) / (U_MAX - U_MIN)

def X(u):
    return PLOT_X0 + (u - U_MIN) * SCALE

# canon 7 ladder spots, top of point -> down-point (matches PP_VISITORS_GUIDE_NOTES.md canon)
LADDER_NAMES = [
    "Sewer Peak", "First Peak", "Second Peak", "38th", "The Hook",
    "Shark's Cove", "Private's",
]
LADDER_DISPLAY = {
    "Sewer Peak": "Sewers",
    "First Peak": "First Peak",
    "Second Peak": "Second Peak",
    "38th": "38th",
    "The Hook": "The Hook",
    "Shark's Cove": "Sharks",
    "Private's": "Private's",
}
# one-clause captions, paraphrased from PP_VISITORS_GUIDE_NOTES.md spot canon (section
# "Spot canon, top -> down-point") -- short factual clauses, not verbatim guide prose.
CAPTIONS = {
    "Sewer Peak": "fastest, most competitive",
    "First Peak": "steeper walls, shortboard",
    "Second Peak": "~90 m peel, longboard",
    "38th": "needs swell to activate",
    "The Hook": "handles size, mixed bag",
    "Shark's Cove": "space, mellow lines",
    "Private's": "breaks on a lower tide",
}

# reef / exposure profiles: all spots in the OSM/bathy join whose u falls in-range,
# ordered by u (adds Little Wind-an-Sea + Suicide's west of Sewer Peak for a continuous
# down-point read; these two are not on the 7-spot ladder canon so are drawn smaller/dimmer)
PROFILE_ORDER = [
    "Little Wind-an-Sea", "Suicide's", "Sewer Peak", "First Peak", "Second Peak",
    "38th", "The Hook", "Shark's Cove", "Private's",
]
CANON_SET = set(LADDER_NAMES)

reef_pts = [(elev_spots[n]["u"], elev_spots[n]["elev_navd88_m"]) for n in PROFILE_ORDER]
exp_pts = [(geom_spots[n]["u"], geom_spots[n]["coast_tangent_deg"]) for n in PROFILE_ORDER]
ladder_pts = [(n, geom_spots[n]["u"]) for n in LADDER_NAMES]

# ---- text width heuristic (Helvetica-ish average advance) -----------------
def text_w(s, fontsize, bold=False):
    return len(s) * fontsize * (0.60 if bold else 0.54)

# ---- vertical layout budget -------------------------------------------------
TITLE_Y, SUBTITLE_Y = 34.0, 56.0

R_LABEL_Y = 84.0
R_TOP, R_BOT = 100.0, 216.0
R_ELEV_TOP, R_ELEV_BOT = 0.2, -2.0
R_ANNOT_Y0 = R_BOT + 30.0   # inversion annotation, 2 lines

def RY(elev):
    return R_TOP + (elev - R_ELEV_TOP) / (R_ELEV_BOT - R_ELEV_TOP) * (R_BOT - R_TOP)

E_LABEL_Y = R_ANNOT_Y0 + 50.0
E_TOP = E_LABEL_Y + 16.0
E_BOT = E_TOP + 120.0
E_DEG_TOP, E_DEG_BOT = 70.0, -70.0
E_ANNOT_Y0 = E_BOT + 30.0  # sheltering annotation, 2 lines

def EY(deg):
    return E_TOP + (deg - E_DEG_TOP) / (E_DEG_BOT - E_DEG_TOP) * (E_BOT - E_TOP)

# ladder tier assignment (greedy horizontal interval scheduling, so no two spot
# label-blocks ever overlap regardless of how close their u values are)
TIER_GAP = 48.0     # vertical px between stacked tiers
MIN_HGAP = 14.0      # minimum horizontal px between adjacent label blocks in a tier

_tiers_rightmost = []
LABEL_TIER = {}
for name, u in sorted(ladder_pts, key=lambda t: X(t[1])):
    x = X(u)
    disp = LADDER_DISPLAY[name]
    cap = CAPTIONS[name]
    half = max(text_w(disp, 18, bold=True), text_w(cap, 16, bold=False)) / 2.0
    left, right = x - half, x + half
    placed = False
    for i, rmost in enumerate(_tiers_rightmost):
        if left >= rmost + MIN_HGAP:
            _tiers_rightmost[i] = right
            LABEL_TIER[name] = i
            placed = True
            break
    if not placed:
        _tiers_rightmost.append(right)
        LABEL_TIER[name] = len(_tiers_rightmost) - 1

N_TIERS = len(_tiers_rightmost)

LADDER_LABEL_Y0 = E_ANNOT_Y0 + 48.0                 # top of the highest label tier
SPINE_Y = LADDER_LABEL_Y0 + N_TIERS * TIER_GAP + 24.0
LADDER_STRIP_LABEL_Y = LADDER_LABEL_Y0 - 20.0

ARC_Y = SPINE_Y + 64.0
STAGE_LABEL_Y = ARC_Y + 28.0
AXIS_Y = STAGE_LABEL_Y + 40.0
APEX_TAG_Y = AXIS_Y + 40.0

GRID_TOP = R_LABEL_Y - 6.0
GRID_BOT = APEX_TAG_Y + 12.0
CANVAS_H = GRID_BOT + 20.0
CANVAS_W = 1200.0

svg_parts = []

def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

# ---------------------------------------------------------------------------
# Header / defs / style
# ---------------------------------------------------------------------------
contrast_comment_lines = ["WCAG contrast ratios computed for this figure (see gen_ladder.py):"]
for k, v in CONTRASTS.items():
    contrast_comment_lines.append(f"  {k}: {v:.2f}:1  [{'PASS >=8:1' if v >= 8 else 'FAIL'}]")
contrast_comment_lines.append("Graphic-only colors (never used for text), for reference:")
for k, v in CONTRASTS_EXCLUDED_FROM_TEXT.items():
    contrast_comment_lines.append(f"  {k}: {v:.2f}:1")
contrast_comment_lines.append(
    "Rule applied: all readable text uses cream/foam on bg or kelp only (>=11:1); "
    "sand is used for text only directly on bg (8.31:1), never on kelp (6.51:1, would fail); "
    "teal/slate are graphic-only (lines, dots, fills, gridlines) and never carry text."
)
svg_parts.append("<!--\n" + "\n".join(contrast_comment_lines) + "\n-->")

svg_parts.append(f'''
<title>Becoming a regular — the ladder runs down-point</title>
<desc>Three aligned strips along Pleasure Point's down-point coordinate u (meters from the
apex): reef elevation (NAVD88), coastal exposure (coast tangent, degrees), and the seven-spot
skill ladder from Private's to Sewers, with shared vertical gridlines tying spot position to
depth and exposure.</desc>
<style>
  .bg {{ fill: var(--mg-bg, {BG}); }}
  .fg-text {{ fill: var(--mg-fg, {FG}); font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }}
  .foam-text {{ fill: var(--mg-foam, {FOAM}); font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }}
  .foam-dim-text {{ fill: var(--mg-foam-dim, {FOAM_DIM}); font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }}
  .sand-text {{ fill: var(--mg-sand, {SAND}); font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }}
  .title {{ font-size: 27px; font-weight: 700; letter-spacing: 0.3px; }}
  .subtitle {{ font-size: 16px; }}
  .strip-label {{ font-size: 18px; font-weight: 700; letter-spacing: 1.5px; }}
  .axis-label {{ font-size: 16px; }}
  .spot-name {{ font-size: 18px; font-weight: 700; }}
  .spot-caption {{ font-size: 16px; }}
  .stage-label {{ font-size: 16px; font-weight: 700; }}
  .annot {{ font-size: 16px; }}
  .u-axis {{ font-size: 16px; }}
  .teal-line {{ stroke: var(--mg-teal, {TEAL}); }}
  .teal-fill {{ fill: var(--mg-teal, {TEAL}); }}
  .slate-line {{ stroke: var(--mg-slate, {SLATE}); }}
  .grid-line {{ stroke: var(--mg-slate, {SLATE}); stroke-width: 1; stroke-dasharray: 2 4; opacity: 0.45; }}
  .kelp-fill {{ fill: var(--mg-kelp, {KELP}); }}
  .sand-line {{ stroke: var(--mg-sand, {SAND}); }}
</style>
<rect class="bg" x="0" y="0" width="{CANVAS_W:.0f}" height="{CANVAS_H:.0f}"/>
''')

# ---------------------------------------------------------------------------
# Title
# ---------------------------------------------------------------------------
svg_parts.append(f'''
<text class="fg-text title" font-family="Georgia, 'Times New Roman', serif" x="40" y="{TITLE_Y:.1f}">BECOMING A REGULAR — the ladder runs down-point</text>
<text class="fg-text subtitle" x="40" y="{SUBTITLE_Y:.1f}">Pleasure Point, u = down-point arclength from the apex (m). Same u-axis, three strips: what&#8217;s under you, how exposed you are, who you become.</text>
''')

# shared vertical gridlines spanning all three strips -- the alignment IS the argument
for name, u in ladder_pts:
    x = X(u)
    svg_parts.append(f'<line class="grid-line" x1="{x:.1f}" y1="{GRID_TOP:.1f}" x2="{x:.1f}" y2="{GRID_BOT:.1f}"/>')

# ---------------------------------------------------------------------------
# STRIP 1 — REEF
# ---------------------------------------------------------------------------
svg_parts.append(f'<text class="fg-text strip-label" x="40" y="{R_LABEL_Y:.1f}">REEF</text>')

for elev in (0.0, -1.0, -2.0):
    y = RY(elev)
    svg_parts.append(f'<line x1="{PLOT_X0:.1f}" y1="{y:.1f}" x2="{PLOT_X1:.1f}" y2="{y:.1f}" class="slate-line" stroke-width="1" opacity="0.25"/>')
    svg_parts.append(f'<text class="fg-text axis-label" x="{PLOT_X0-10:.1f}" y="{y+5:.1f}" text-anchor="end">{elev:.0f} m</text>')

step_path = [f"M {X(reef_pts[0][0]):.1f} {RY(reef_pts[0][1]):.1f}"]
for i in range(1, len(reef_pts)):
    _, e_prev = reef_pts[i-1]
    x_cur, e_cur = reef_pts[i]
    xm = X(x_cur)
    step_path.append(f"L {xm:.1f} {RY(e_prev):.1f} L {xm:.1f} {RY(e_cur):.1f}")
line_d = " ".join(step_path)
x_first, x_last = X(reef_pts[0][0]), X(reef_pts[-1][0])
area_d = line_d + f" L {x_last:.1f} {RY(0.0):.1f} L {x_first:.1f} {RY(0.0):.1f} Z"
svg_parts.append(f'<path d="{area_d}" class="teal-fill" opacity="0.30" stroke="none"/>')
svg_parts.append(f'<path d="{line_d}" fill="none" class="teal-line" stroke-width="2.5"/>')

for name in PROFILE_ORDER:
    u, e = elev_spots[name]["u"], elev_spots[name]["elev_navd88_m"]
    x, y = X(u), RY(e)
    if name in CANON_SET:
        svg_parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="{FOAM}" stroke="{BG}" stroke-width="1"/>')
    else:
        svg_parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="{FOAM}" stroke="{BG}" stroke-width="1" opacity="0.55"/>')

# inversion annotation: First Peak (deepest) -> Private's (shallowest)
fp_u, fp_e = elev_spots["First Peak"]["u"], elev_spots["First Peak"]["elev_navd88_m"]
pr_u, pr_e = elev_spots["Private's"]["u"], elev_spots["Private's"]["elev_navd88_m"]
fx = X(fp_u)
px_ = X(pr_u)
bracket_y = R_BOT + 12.0
svg_parts.append(f'<path d="M {fx:.1f} {R_BOT+4:.1f} L {fx:.1f} {bracket_y:.1f} L {px_:.1f} {bracket_y:.1f} L {px_:.1f} {R_BOT+4:.1f}" fill="none" class="sand-line" stroke-width="1.4"/>')
mx = (fx + px_) / 2
svg_parts.append(f'<text class="sand-text annot" x="{mx:.1f}" y="{R_ANNOT_Y0:.1f}" text-anchor="middle">the reef gets SHALLOWER down-point</text>')
svg_parts.append(f'<text class="sand-text annot" x="{mx:.1f}" y="{R_ANNOT_Y0+22:.1f}" text-anchor="middle">First Peak {fp_e:.2f} m → Private&#8217;s {pr_e:.2f} m NAVD88</text>')

# ---------------------------------------------------------------------------
# STRIP 2 — EXPOSURE
# ---------------------------------------------------------------------------
svg_parts.append(f'<text class="fg-text strip-label" x="40" y="{E_LABEL_Y:.1f}">EXPOSURE</text>')

for deg in (70, 35, 0, -35, -70):
    y = EY(deg)
    svg_parts.append(f'<line x1="{PLOT_X0:.1f}" y1="{y:.1f}" x2="{PLOT_X1:.1f}" y2="{y:.1f}" class="slate-line" stroke-width="1" opacity="0.25"/>')
    svg_parts.append(f'<text class="fg-text axis-label" x="{PLOT_X0-10:.1f}" y="{y+5:.1f}" text-anchor="end">{deg:+d}&#176;</text>')

fp_u2 = geom_spots["First Peak"]["u"]
zx0, zx1 = X(U_MIN), X(fp_u2)
svg_parts.append(f'<rect x="{zx0:.1f}" y="{E_TOP:.1f}" width="{zx1-zx0:.1f}" height="{E_BOT-E_TOP:.1f}" class="kelp-fill" opacity="0.6"/>')

exp_line = " ".join(
    f"{'M' if i == 0 else 'L'} {X(u):.1f} {EY(d):.1f}" for i, (u, d) in enumerate(exp_pts)
)
svg_parts.append(f'<path d="{exp_line}" fill="none" class="teal-line" stroke-width="2.5"/>')
for u, d in exp_pts:
    x, y = X(u), EY(d)
    name_here = next(n for n in PROFILE_ORDER if abs(geom_spots[n]["u"] - u) < 0.01)
    if name_here in CANON_SET:
        svg_parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="4.5" fill="{FOAM}" stroke="{BG}" stroke-width="1"/>')
    else:
        svg_parts.append(f'<circle cx="{x:.1f}" cy="{y:.1f}" r="3" fill="{FOAM}" stroke="{BG}" stroke-width="1" opacity="0.55"/>')

lw_deg = geom_spots["Little Wind-an-Sea"]["coast_tangent_deg"]
fp_deg = geom_spots["First Peak"]["coast_tangent_deg"]
swing = fp_deg - lw_deg
zone_cx = (zx0 + zx1) / 2
svg_parts.append(f'<text class="foam-text annot" x="{zone_cx:.1f}" y="{E_TOP+22:.1f}" text-anchor="middle" font-weight="700">APEX ROTATION</text>')
svg_parts.append(f'<text class="foam-text annot" x="{zone_cx:.1f}" y="{E_TOP+42:.1f}" text-anchor="middle">{swing:.0f}&#176; swing</text>')
svg_parts.append(f'<text class="foam-text annot" x="{zone_cx:.1f}" y="{E_TOP+62:.1f}" text-anchor="middle">({lw_deg:.0f}&#176;→{fp_deg:.0f}&#176;)</text>')

mean_dp = sum(d for u, d in exp_pts if u > fp_u2) / len([1 for u, d in exp_pts if u > fp_u2])
sheltered_cx = (zx1 + PLOT_X1) / 2
svg_parts.append(f'<text class="fg-text annot" x="{sheltered_cx:.1f}" y="{E_ANNOT_Y0:.1f}" text-anchor="middle">past First Peak, tangent just wobbles (mean ≈ {mean_dp:.0f}&#176;)</text>')
svg_parts.append(f'<text class="fg-text annot" x="{sheltered_cx:.1f}" y="{E_ANNOT_Y0+22:.1f}" text-anchor="middle">the down-point gradient here is SHELTERING, not angle</text>')

# ---------------------------------------------------------------------------
# STRIP 3 — THE LADDER
# ---------------------------------------------------------------------------
svg_parts.append(f'<text class="fg-text strip-label" x="40" y="{LADDER_STRIP_LABEL_Y:.1f}">THE LADDER</text>')
svg_parts.append(f'<line x1="{PLOT_X0:.1f}" y1="{SPINE_Y:.1f}" x2="{PLOT_X1:.1f}" y2="{SPINE_Y:.1f}" class="teal-line" stroke-width="3"/>')

# progression arc (sand, graphic-only) below the spine, right (Private's) -> left (Sewers)
arc_order = ["Private's", "Shark's Cove", "The Hook", "38th", "First Peak", "Sewer Peak"]
arc_xs = [X(geom_spots[n]["u"]) for n in arc_order]
arc_pts = [(x, ARC_Y) for x in arc_xs]
arc_d = f"M {arc_pts[0][0]:.1f} {arc_pts[0][1]:.1f} " + " ".join(f"L {x:.1f} {y:.1f}" for x, y in arc_pts[1:])
svg_parts.append('''
<defs>
  <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--mg-sand, #c9a86a)"/>
  </marker>
</defs>
''')
svg_parts.append(f'<path d="{arc_d}" fill="none" class="sand-line" stroke-width="2" stroke-linejoin="round" marker-end="url(#arrow)"/>')
for x in arc_xs:
    svg_parts.append(f'<circle cx="{x:.1f}" cy="{ARC_Y:.1f}" r="3" fill="{SAND}"/>')
svg_parts.append(f'<text class="sand-text annot" x="{(arc_xs[0]+arc_xs[-1])/2:.1f}" y="{ARC_Y-12:.1f}" text-anchor="middle">years of paddling out — sheltered water first, the apex last</text>')

# stage labels along the arc
STAGES = [
    ("first winter", ["Private's", "Shark's Cove"]),
    ("finding your feet", ["The Hook"]),
    ("the longboard year", ["38th", "Second Peak"]),
    ("earning it", ["First Peak"]),
    ("a regular", ["Sewer Peak"]),
]
stage_centers = []
for label, members in STAGES:
    xs = [X(geom_spots[n]["u"]) for n in members]
    cx = sum(xs) / len(xs)
    stage_centers.append(cx)
# nudge apart any adjacent stage labels whose estimated widths would collide
min_pad = 12.0
for i in range(1, len(stage_centers)):
    w_prev = text_w(STAGES[i-1][0], 16, bold=True) / 2.0
    w_cur = text_w(STAGES[i][0], 16, bold=True) / 2.0
    needed = w_prev + w_cur + min_pad
    gap = stage_centers[i-1] - stage_centers[i]  # arc runs right->left, decreasing x
    if gap < needed:
        shift = (needed - gap) / 2.0
        stage_centers[i-1] += shift
        stage_centers[i] -= shift
for (label, _), cx in zip(STAGES, stage_centers):
    svg_parts.append(f'<text class="fg-text stage-label" x="{cx:.1f}" y="{STAGE_LABEL_Y:.1f}" text-anchor="middle">{esc(label)}</text>')

# spot dots, names, captions -- tiers assigned above via greedy interval scheduling
for name, u in ladder_pts:
    x = X(u)
    tier = LABEL_TIER[name]
    svg_parts.append(f'<circle cx="{x:.1f}" cy="{SPINE_Y:.1f}" r="6.5" class="teal-fill" stroke="{FOAM}" stroke-width="2"/>')
    cap_y = SPINE_Y - (tier * TIER_GAP) - 18.0
    name_y = cap_y - 20.0
    leader_top = name_y - 16.0
    svg_parts.append(f'<line x1="{x:.1f}" y1="{SPINE_Y-9:.1f}" x2="{x:.1f}" y2="{leader_top:.1f}" class="slate-line" stroke-width="1" opacity="0.6"/>')
    svg_parts.append(f'<text class="fg-text spot-name" x="{x:.1f}" y="{name_y:.1f}" text-anchor="middle">{esc(LADDER_DISPLAY[name])}</text>')
    svg_parts.append(f'<text class="foam-dim-text spot-caption" x="{x:.1f}" y="{cap_y:.1f}" text-anchor="middle">{esc(CAPTIONS[name])}</text>')

# u-axis ticks along the very bottom, shared reference
svg_parts.append(f'<line x1="{PLOT_X0:.1f}" y1="{AXIS_Y:.1f}" x2="{PLOT_X1:.1f}" y2="{AXIS_Y:.1f}" class="slate-line" stroke-width="1" opacity="0.5"/>')
for u in (0, 500, 1000, 1500, 2000):
    x = X(u)
    svg_parts.append(f'<line x1="{x:.1f}" y1="{AXIS_Y-4:.1f}" x2="{x:.1f}" y2="{AXIS_Y+4:.1f}" class="slate-line" stroke-width="1"/>')
    svg_parts.append(f'<text class="fg-text u-axis" x="{x:.1f}" y="{AXIS_Y+22:.1f}" text-anchor="middle">u={u} m</text>')
svg_parts.append(f'<text class="fg-text u-axis" x="{X(0):.1f}" y="{APEX_TAG_Y:.1f}" text-anchor="middle" font-style="italic" opacity="0.85">apex</text>')
# minor-spot legend (muriel audit #9): the reef/exposure strips also plot
# Little Wind-an-Sea and Suicide's -- real measured spots, just not on the
# seven-name ladder canon -- as smaller r=3 dots with no distinguishing key
# until now; the ladder strip's own dots are the full r=6.5/r=4.5 canon size.
_legend_txt = "small = minor spot (unnamed here)"
_legend_w = text_w(_legend_txt, 16, bold=False)
_legend_dot_x = PLOT_X1 - _legend_w - 14
svg_parts.append(f'<circle cx="{_legend_dot_x:.1f}" cy="{APEX_TAG_Y-4:.1f}" r="3" fill="{FOAM}" stroke="{BG}" stroke-width="1" opacity="0.55"/>')
svg_parts.append(f'<text class="fg-text u-axis" x="{PLOT_X1:.1f}" y="{APEX_TAG_Y:.1f}" text-anchor="end">{esc(_legend_txt)}</text>')

body = "\n".join(svg_parts)
svg = f'<svg viewBox="0 0 {CANVAS_W:.0f} {CANVAS_H:.0f}" xmlns="http://www.w3.org/2000/svg">\n{body}\n</svg>\n'

out_path = os.path.join(HERE, "fig-ladder.svg")
with open(out_path, "w") as f:
    f.write(svg)

print("wrote", out_path, f"viewBox 0 0 {CANVAS_W:.0f} {CANVAS_H:.0f}", f"tiers={N_TIERS}")
print()
print("Computed contrast ratios:")
for k, v in CONTRASTS.items():
    print(f"  {k}: {v:.2f}:1")
