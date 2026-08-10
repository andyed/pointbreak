#!/usr/bin/env python3
"""Generate og-card.svg — the 1200x630 social preview for the Pleasure Point page.

Same measured substrate as the figures, cropped and retyped for a feed:
  data/osm/pp_geometry.json   (OSM coastline + surf-spot arclength u)
  data/bathy/pp_bathy.json    (NOAA NCEI seafloor elevation grid, NAVD88 m)
  docs/figures/assets/og_hero.png   (drone frame from the sim; capture_og_hero.mjs)

Why a purpose-drawn card instead of a crop of fig-topology
-----------------------------------------------------------
fig-topology is 1200x820 and carries twelve labelled spots, five labelled
contours, a scale bar and a north arrow. Cropped to 1.91:1 it loses either the
apex or the down-point end, and every label lands at roughly a third of the
size a feed thumbnail can resolve. The card therefore redraws the same geometry
through the same transform at OG proportions, keeps only the seven-spot canon,
and sizes type for the *thumbnail* case rather than the full-size one.

Composition
-----------
Land is drawn as the page background (#0f1216) rather than the kelp fill the
figures use, so the display type sits on exactly the ground index.html audits.
All texture lives in the sea band: depth contours, spot dots, labels. That
splits the canvas into one type zone (above the coast) and one data zone
(below it) instead of scrimming type over a busy field.

The sim appears as an inset panel bleeding off the top-right corner, filling
the one empty region the geometry leaves. It is a drone frame -- the same plan
viewpoint as the map -- so the pair reads as one place seen twice, measured and
modelled. It carries a SIMULATED caption: at a glance the render is
photographic enough to be mistaken for an aerial photo, and it is not one.

Deterministic; no randomness. Requires docs/figures/assets/og_hero.png --
run capture_og_hero.mjs first. Run render_og.mjs afterwards for the PNG.

Usage:
  node docs/figures/capture_og_hero.mjs     # once, or when the model changes
  python3 docs/figures/gen_og.py
  node docs/figures/render_check.mjs docs/figures/og-card.svg \
        docs/figures/og-card.png 2
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

with open(os.path.join(ROOT, "data/osm/pp_geometry.json")) as f:
    GEO = json.load(f)
with open(os.path.join(ROOT, "data/bathy/pp_bathy.json")) as f:
    BATHY = json.load(f)

HERO = "assets/og_hero.png"      # relative to this SVG; see capture_og_hero.mjs
if not os.path.exists(os.path.join(HERE, HERO)):
    raise SystemExit(f"missing {HERO} — run: node docs/figures/capture_og_hero.mjs")

# The hero's caption must state the preset it was actually captured from.
# capture_og_hero.mjs pins these; keep the two in step.
HERO_PRESET_KEY = "sewers"
HERO_PRESET_LABEL = "Sewers"

# ---------------------------------------------------------------- transform
# Identical to gen_topology.py: PP_MAP_GEOMETRY.md finding #2, mean down-point
# coast tangent. Distances and u values stay the measured numbers; only screen
# placement rotates.
THETA_DEG = 45.0
TH = math.radians(THETA_DEG)
COS, SIN = math.cos(TH), math.sin(TH)


def to_point_frame(x, y):
    """ENU meters -> rotated 'point frame' (X=alongpoint, Y=cross-point)."""
    return x * COS + y * SIN, -x * SIN + y * COS


# ---------------------------------------------------------------- canvas
VB_W, VB_H = 1200, 630            # OG_CARD (1.91:1); rendered at 2x for retina feeds

# World window, point-frame metres. WX0 is set so the apex (u=0) lands at
# x=95px: far enough from the left edge to carry its own label, far enough
# from the display type that the up-coast spur above it never crosses a glyph.
# Y follows from the OG aspect so the map is full-bleed, and WY1 parks the
# coastline near 55% height -- clean land above for type, sea below for two
# staggered label rows.
SCALE = 0.55                                # px per metre
APEX_X_PX = 95.0
WX0 = -APEX_X_PX / SCALE
WX1 = WX0 + VB_W / SCALE
WY1 = 500.0                                 # land-ward extreme (screen top)
WY0 = WY1 - VB_H / SCALE                    # sea-ward extreme (screen bottom)


def world_to_svg(X, Y):
    return (X - WX0) * SCALE, (WY1 - Y) * SCALE


def enu_to_svg(x, y):
    return world_to_svg(*to_point_frame(x, y))


# ---------------------------------------------------------------- contrast audit
# Every readable string on this card is checked against the ground it actually
# renders on, at build time. CLAUDE.md floor is 8:1; the build fails below it.
def _lin(c):
    c /= 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def luminance(hex_color):
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(fg, bg):
    a, b = luminance(fg), luminance(bg)
    hi, lo = max(a, b), min(a, b)
    return (hi + 0.05) / (lo + 0.05)


C_BG = "#0f1216"       # page background == land on this card == every halo
C_SEA = "#142229"
C_FOAM = "#eef2f3"     # display type
C_INK = "#e6e4d2"      # spot names, deck
C_DIM = "#c8c7b8"      # u values, legend, hero caption
C_CREDIT = "#cccbbb"   # provenance
C_SAND = "#c9a86a"     # accent: apex marker, rules, studio attribution
C_TEAL = "#4a8f85"     # contours (graphic only, never text)

# (label, fg, bg). bg is the ground each string is actually painted on. The
# display type sits on the land fill, which IS the page background; every data
# label and the hero caption sit on opaque page-background halo boxes. So the
# sea fill and the hero photograph never back a glyph, and the ratios below are
# the ones that render.
AUDIT = [
    ("kicker",              C_FOAM,   C_BG),
    ("title",               C_FOAM,   C_BG),
    ("deck",                C_INK,    C_BG),
    ("provenance",          C_CREDIT, C_BG),
    ("spot name (halo)",    C_INK,    C_BG),
    ("u value (halo)",      C_DIM,    C_BG),
    ("apex label (halo)",   C_DIM,    C_BG),
    ("hero caption (halo)", C_DIM,    C_BG),
    ("legend (halo)",       C_DIM,    C_BG),
    ("studio url (halo)",   C_SAND,   C_BG),
]

FLOOR = 8.0
audit_rows, failures = [], []
for label, fg, bg in AUDIT:
    ratio = contrast(fg, bg)
    audit_rows.append(f"     {label:<21} {fg} on {bg}  = {ratio:5.2f}:1")
    if ratio < FLOOR:
        failures.append(f"{label}: {fg} on {bg} = {ratio:.2f}:1 (floor {FLOOR}:1)")

# Graphics-only colours are recorded but exempt: they carry no glyphs.
for label, fg in (("contour stroke", C_TEAL), ("sea fill", C_SEA)):
    audit_rows.append(f"     {label:<21} {fg} on {C_BG}  = "
                      f"{contrast(fg, C_BG):5.2f}:1  [graphic only, no text]")

if failures:
    raise SystemExit("CONTRAST FAILURE:\n  " + "\n  ".join(failures))

# ---------------------------------------------------------------- marching squares
def marching_squares(elev, x0, y0, dx, dy, ncols, nrows, level):
    """Contour segments in ENU metres where elev == level."""
    segs = []

    def vx(c):
        return x0 + c * dx

    def vy(r):
        return y0 + r * dy

    def interp(p1, v1, p2, v2):
        t = (level - v1) / (v2 - v1) if v2 != v1 else 0.5
        return (p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]))

    for r in range(nrows - 1):
        row0, row1 = elev[r], elev[r + 1]
        for c in range(ncols - 1):
            tl, tr = row0[c], row0[c + 1]
            bl, br = row1[c], row1[c + 1]
            idx = (tl > level) | (tr > level) << 1 | (br > level) << 2 | (bl > level) << 3
            if idx in (0, 15):
                continue
            P_tl, P_tr = (vx(c), vy(r)), (vx(c + 1), vy(r))
            P_br, P_bl = (vx(c + 1), vy(r + 1)), (vx(c), vy(r + 1))
            top = lambda: interp(P_tl, tl, P_tr, tr)          # noqa: E731
            right = lambda: interp(P_tr, tr, P_br, br)        # noqa: E731
            bottom = lambda: interp(P_bl, bl, P_br, br)       # noqa: E731
            left = lambda: interp(P_tl, tl, P_bl, bl)         # noqa: E731
            table = {
                1: [(left, top)], 2: [(top, right)], 3: [(left, right)],
                4: [(right, bottom)], 5: [(left, top), (right, bottom)],
                6: [(top, bottom)], 7: [(left, bottom)],
                8: [(left, bottom)], 9: [(top, bottom)],
                10: [(top, right), (left, bottom)], 11: [(right, bottom)],
                12: [(left, right)], 13: [(top, right)], 14: [(left, top)],
            }
            for a, b in table.get(idx, []):
                segs.append((a(), b()))
    return segs


LEVELS = [-2, -4, -6, -8, -10]
CONTOUR_STEP_M = 2                 # LEVELS spacing; quoted in the legend
contour_segs = {
    lv: marching_squares(BATHY["elev"], BATHY["x0"], BATHY["y0"], BATHY["dx"],
                         BATHY["dy"], BATHY["ncols"], BATHY["nrows"], lv)
    for lv in LEVELS
}

# ---------------------------------------------------------------- helpers
def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def text_w(text, size, weight=600, tracking=0.0):
    """Advance-width estimate for the halo boxes (gen_topology's heuristic plus
    a letter-spacing term). Checked against the render, not trusted blind."""
    per = 0.60 if weight < 700 else 0.63
    return len(text) * size * (per + tracking) + 12


def halo_text(x, y, text, size=20, weight=600, cls="lbl", anchor="middle",
              tracking=0.0):
    """Text on an opaque page-background halo so the audited ratio is the one
    that renders, whatever lies underneath -- contours, sea, or the hero."""
    w = text_w(text, size, weight, tracking)
    h = size + 9
    bx = {"start": x - 5, "end": x - w + 5}.get(anchor, x - w / 2)
    return (f'<rect class="halo" x="{bx:.1f}" y="{y - size:.1f}" width="{w:.1f}" '
            f'height="{h:.1f}" rx="3"/>'
            f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" font-size="{size}" '
            f'font-weight="{weight}" text-anchor="{anchor}">{esc(text)}</text>')


# ---------------------------------------------------------------- geometry -> svg
# The whole measured coastline, unclipped at the down-coast end. Truncating it
# was tried and is worse: the land polygon then closes on an invented diagonal
# across the top-left corner. Left whole, the shoreline exits the frame on its
# own (every u < 0 point sits at x <= 110, well clear of the type block at
# x=195) and the closure happens off-canvas.
coast_pts = [enu_to_svg(x, y) for (x, y), u in zip(GEO["coast"], GEO["coast_u"])
             if u <= WX1 + 700]
coast_path_d = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in coast_pts)
# Land = everything shoreward of the coastline, closed over the top of the frame.
land_path_d = coast_path_d + f" L {VB_W + 40:.1f},-40 L -40,-40 Z"


def in_frame(pt, m=80):
    x, y = pt
    return -m <= x <= VB_W + m and -m <= y <= VB_H + m


contour_svg = {}
for lv, segs in contour_segs.items():
    d = []
    for (x1, y1), (x2, y2) in segs:
        p1, p2 = enu_to_svg(x1, y1), enu_to_svg(x2, y2)
        if in_frame(p1) or in_frame(p2):
            d.append(f"M {p1[0]:.1f},{p1[1]:.1f} L {p2[0]:.1f},{p2[1]:.1f}")
    contour_svg[lv] = " ".join(d)

# The seven-spot canon only. Suicide's / Little Wind-an-Sea / Trees / Toes Over /
# Bombora are on the full map in fig-topology; at feed size they are noise.
CANON = ["Sewer Peak", "First Peak", "Second Peak", "38th", "The Hook",
         "Shark's Cove", "Private's"]
SPOTS = {s["name"]: s for s in GEO["spots"]}

# Two staggered label rows in the sea band, alternating along the point, so
# neighbouring names cannot collide (First and Second Peak are 66 px apart).
# Row heights come from the measured envelope: the lowest canon dot is The Hook
# at y=458, the bottom furniture sits at y=618, and both rows plus their u
# values have to fit between without touching either.
ROW_Y = {0: 492, 1: 550}
U_DY = 21
ROW_OF = {"Sewer Peak": 0, "First Peak": 1, "Second Peak": 0, "38th": 1,
          "The Hook": 0, "Shark's Cove": 1, "Private's": 0}

# ---- inset panel carrying the sim, bleeding off the top and right edges.
# Sized to the empty land region the coastline leaves: the coast never rises
# above y=338 right of x=740, so the panel clears it by ~38 px.
P_X, P_Y, P_W, P_H = 740, 0, VB_W - 740, 270
P_CAP_Y = 294          # caption sits BELOW the panel on clean background:
                       # inside it, it landed on the shore band and both went muddy

# ---------------------------------------------------------------- build
SANS = "-apple-system, 'Helvetica Neue', Arial, sans-serif"
SERIF = "Georgia, 'Times New Roman', serif"

p = []
p.append(f'<svg viewBox="0 0 {VB_W} {VB_H}" width="{VB_W}" height="{VB_H}" '
         f'xmlns="http://www.w3.org/2000/svg" '
         f'xmlns:xlink="http://www.w3.org/1999/xlink" font-family="{SANS}">')
p.append('<title>Pleasure Point — a measured field guide</title>')
p.append('<desc>Social preview card: the measured Pleasure Point coastline in the '
         'rotated point frame, with NOAA NCEI depth contours and the seven canon '
         'surf breaks labelled by along-point arclength u, plus an inset drone '
         'frame from the wave simulation.</desc>')

p.append("<!-- Contrast audit, computed at build time (WCAG 2.x sRGB relative\n"
         "     luminance). Build fails below 8:1. Ratios are RENDERED values:\n"
         "     no text uses opacity, and every data label sits on an opaque\n"
         "     page-background halo, so neither the sea fill nor the inset\n"
         "     photograph ever backs a glyph.\n"
         + "\n".join(audit_rows) + "\n-->")

p.append(f"""
<style>
  .bg      {{ fill: {C_BG}; }}
  .sea     {{ fill: {C_SEA}; }}
  .coast   {{ fill: none; stroke: {C_INK}; stroke-width: 3.2;
              stroke-linejoin: round; stroke-linecap: round; }}
  .contour {{ fill: none; stroke: {C_TEAL}; stroke-width: 1.15; opacity: 0.9; }}
  .halo    {{ fill: {C_BG}; }}
  .lbl     {{ fill: {C_INK}; }}
  .lbl-dim {{ fill: {C_DIM}; }}
  .kicker  {{ fill: {C_FOAM}; letter-spacing: 0.2em; }}
  .title   {{ fill: {C_FOAM}; font-family: {SERIF}; }}
  .deck    {{ fill: {C_INK}; font-family: {SERIF}; font-style: italic; }}
  .credit  {{ fill: {C_CREDIT}; }}
  .studio  {{ fill: {C_SAND}; letter-spacing: 0.08em; }}
  .dot     {{ fill: {C_FOAM}; stroke: {C_TEAL}; stroke-width: 1.8; }}
  .apex    {{ fill: {C_SAND}; stroke: {C_BG}; stroke-width: 1.4; }}
  .leader  {{ stroke: {C_INK}; stroke-width: 1.1; opacity: 0.55; }}
  .rule    {{ stroke: {C_SAND}; stroke-width: 2.5; }}
  .panel-edge {{ fill: none; stroke: {C_SAND}; stroke-width: 2.5; }}
</style>
""")

# ---- ground: sea everywhere, land (page bg) painted back over it
p.append(f'<rect class="sea" x="0" y="0" width="{VB_W}" height="{VB_H}"/>')

p.append('<g class="contour">')
for lv in LEVELS:
    if contour_svg[lv]:
        p.append(f'<path d="{contour_svg[lv]}"/>')
p.append('</g>')

# Land is the page background, so display type above the coast sits on exactly
# the colour index.html audits (#0f1216) -- no scrim, no blended ground.
p.append(f'<path class="bg" d="{land_path_d}"/>')
p.append(f'<path class="coast" d="{coast_path_d}"/>')

# ---- apex marker: the origin every u value is measured from
ax, ay = enu_to_svg(0.0, 0.0)
p.append(f'<circle class="apex" cx="{ax:.1f}" cy="{ay:.1f}" r="6"/>')
p.append(halo_text(ax, ay + 33, "apex · u = 0", size=16, weight=600,
                   cls="lbl-dim", anchor="middle"))

# ---- canon spots: dot on the water, leader down to a staggered label row
for name in CANON:
    sp = SPOTS[name]
    sx, sy = enu_to_svg(sp["x"], sp["y"])
    ly = ROW_Y[ROW_OF[name]]
    p.append(f'<line class="leader" x1="{sx:.1f}" y1="{sy + 8:.1f}" '
             f'x2="{sx:.1f}" y2="{ly - 24:.1f}"/>')
    p.append(f'<circle class="dot" cx="{sx:.1f}" cy="{sy:.1f}" r="5.5"/>')
    p.append(halo_text(sx, ly, name, size=21, weight=700, cls="lbl"))
    p.append(halo_text(sx, ly + U_DY, f'u = {sp["u"]:.0f} m', size=17,
                       weight=600, cls="lbl-dim"))

# ---- sim inset, bleeding off the top-right corner
p.append(f'<clipPath id="panelclip"><rect x="{P_X}" y="{P_Y}" width="{P_W}" '
         f'height="{P_H}"/></clipPath>')
p.append(f'<g clip-path="url(#panelclip)">')
p.append(f'<image href="{HERO}" xlink:href="{HERO}" x="{P_X}" y="{P_Y}" '
         f'width="{P_W}" height="{P_H}" preserveAspectRatio="xMidYMid slice"/>')
p.append('</g>')
# Only the two edges that do not bleed get a rule.
p.append(f'<path class="panel-edge" d="M {P_X},{P_Y} L {P_X},{P_Y + P_H} '
         f'L {VB_W},{P_Y + P_H}"/>')
# The render is photographic enough to be mistaken for an aerial photo. Say so.
p.append(halo_text(P_X + 4, P_CAP_Y,
                   f"SIMULATED · {HERO_PRESET_LABEL} preset, plunging (ξ = 1.15)",
                   size=16, weight=600, cls="lbl-dim", anchor="start"))

# ---- display type, upper left, on clean page background
TX = 195
p.append(f'<text class="kicker" x="{TX}" y="96" font-size="18" font-weight="700">'
         'COASTAL GEOGRAPHY &#183; SANTA CRUZ</text>')
p.append(f'<line class="rule" x1="{TX}" y1="116" x2="{TX + 92}" y2="116"/>')
p.append(f'<text class="title" x="{TX}" y="192" font-size="70" font-weight="400">'
         'Pleasure Point</text>')
p.append(f'<text class="deck" x="{TX}" y="238" font-size="30" font-weight="500">'
         'a measured field guide</text>')
p.append(f'<text class="credit" x="{TX}" y="280" font-size="17" font-weight="500">'
         'OpenStreetMap coastline &#183; NOAA NCEI bathymetry</text>')

# ---- bottom furniture: what u means, and who made it
p.append(halo_text(64, 618,
                   "u = metres along the point from the apex  ·  "
                   f"contours every {CONTOUR_STEP_M} m",
                   size=17, weight=600, cls="lbl-dim", anchor="start"))
p.append(halo_text(VB_W - 64, 618, "mindbendingpixels.com", size=18, weight=700,
                   cls="studio", anchor="end", tracking=0.08))

p.append("</svg>")

OUT = os.path.join(HERE, "og-card.svg")
with open(OUT, "w") as f:
    f.write("\n".join(p) + "\n")

print(f"wrote {OUT}  {VB_W}x{VB_H}")
print(f"world window  X [{WX0:.1f}, {WX1:.1f}] m   Y [{WY0:.1f}, {WY1:.1f}] m   "
      f"scale {SCALE:.4f} px/m   apex at x={ax:.1f}")
print("contrast audit (floor 8:1):")
for row in audit_rows:
    print(row)
