#!/usr/bin/env python3
"""Generate fig-topology.svg — "PLEASURE POINT, the point, measured".

Planform topo-bathy map of Pleasure Point built from real measured data:
  data/osm/pp_geometry.json   (OSM coastline + surf-spot arclength/offset)
  data/bathy/pp_bathy.json    (NOAA NCEI seafloor elevation grid, NAVD88 m)

Coordinate strategy
--------------------
The raw geometry is in ENU meters (x=east, y=north) around the PP apex. The
coastline sweeps through ~110 degrees of heading (see PP_MAP_GEOMETRY.md
finding #1), so a straight ENU plot puts the seven-spot canon on a steep
diagonal and wastes most of a landscape canvas. PP_MAP_GEOMETRY.md finding #2
independently reports the down-point coast tangent is "roughly constant
(~33-57 deg, mean ~45 deg)" past First Peak — so we rotate the ENU frame by
-45 deg (the doc's own measured mean) into a "point frame" where the down-
point direction runs left-to-right. This is a data-grounded transform, not an
aesthetic pick: it is exactly the number PP_MAP_GEOMETRY.md already computed.
All *distances/depths/u values* drawn on the figure remain the original
measured numbers; only their screen placement is rotated.

Marching squares runs on the native ENU bathy grid (correct, no resampling
artifacts), and the resulting contour segments are rotated + mapped to SVG
space with the coastline, spots and avenues through the same transform.

Deterministic; no randomness.
"""
import json, math, os

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

with open(os.path.join(ROOT, "data/osm/pp_geometry.json")) as f:
    GEO = json.load(f)
with open(os.path.join(ROOT, "data/bathy/pp_bathy.json")) as f:
    BATHY = json.load(f)

# ---------------------------------------------------------------- transform
THETA_DEG = 45.0  # PP_MAP_GEOMETRY.md finding #2: mean down-point tangent
TH = math.radians(THETA_DEG)
COS, SIN = math.cos(TH), math.sin(TH)

def to_point_frame(x, y):
    """ENU meters -> rotated 'point frame' (X=alongpoint, Y=cross-point).
    Verified against spot offshore displacement: sea is Y<0, land Y>0."""
    X = x * COS + y * SIN
    Y = -x * SIN + y * COS
    return X, Y

# World window in point-frame meters (task spec)
WX0, WX1 = -400.0, 2300.0
WY0, WY1 = -800.0, 300.0   # Y0=sea-ward extreme, Y1=land-ward extreme

# ---------------------------------------------------------------- SVG layout
VB_W, VB_H = 1200, 820
PAD_X = 30
TITLE_H = 86
BOTTOM_H = 64

avail_w = VB_W - 2 * PAD_X
avail_h = VB_H - TITLE_H - BOTTOM_H
world_w = WX1 - WX0
world_h = WY1 - WY0
SCALE = min(avail_w / world_w, avail_h / world_h)
map_w = world_w * SCALE
map_h = world_h * SCALE
MAP_X0 = PAD_X + (avail_w - map_w) / 2.0
MAP_Y0 = TITLE_H + (avail_h - map_h) / 2.0

def world_to_svg(X, Y):
    """point-frame meters -> SVG px. X left->right increasing; Y land(+)
    at top, sea(-) at bottom (sea below/right per brief)."""
    sx = MAP_X0 + (X - WX0) * SCALE
    sy = MAP_Y0 + (WY1 - Y) * SCALE
    return sx, sy

def enu_to_svg(x, y):
    X, Y = to_point_frame(x, y)
    return world_to_svg(X, Y)

MAP_X1 = MAP_X0 + map_w
MAP_Y1 = MAP_Y0 + map_h

# ---------------------------------------------------------------- marching squares
def marching_squares(elev, x0, y0, dx, dy, ncols, nrows, level):
    """Return list of ((x1,y1),(x2,y2)) segments in ENU meters where elev==level."""
    segs = []
    def vx(c): return x0 + c * dx
    def vy(r): return y0 + r * dy
    def interp(p1, v1, p2, v2):
        t = (level - v1) / (v2 - v1) if v2 != v1 else 0.5
        return (p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1]))

    for r in range(nrows - 1):
        row0 = elev[r]
        row1 = elev[r + 1]
        for c in range(ncols - 1):
            tl = row0[c];     tr = row0[c + 1]
            bl = row1[c];     br = row1[c + 1]
            idx = (tl > level) * 1 | (tr > level) * 2 | (br > level) * 4 | (bl > level) * 8
            if idx == 0 or idx == 15:
                continue
            P_tl = (vx(c),     vy(r))
            P_tr = (vx(c + 1), vy(r))
            P_br = (vx(c + 1), vy(r + 1))
            P_bl = (vx(c),     vy(r + 1))
            # edge midpoints via interpolation
            def top():    return interp(P_tl, tl, P_tr, tr)
            def right():  return interp(P_tr, tr, P_br, br)
            def bottom(): return interp(P_bl, bl, P_br, br)
            def left():   return interp(P_tl, tl, P_bl, bl)
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

X0, Y0, DX, DY = BATHY["x0"], BATHY["y0"], BATHY["dx"], BATHY["dy"]
NCOLS, NROWS = BATHY["ncols"], BATHY["nrows"]
ELEV = BATHY["elev"]

LEVELS = [-2, -4, -6, -8, -10]
contour_segs = {lv: marching_squares(ELEV, X0, Y0, DX, DY, NCOLS, NROWS, lv) for lv in LEVELS}

# ---------------------------------------------------------------- helpers
def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))

def halo_text(x, y, text, size=16, weight=600, cls="lbl", anchor="start", dx=6, dy=4,
              font_family=None):
    """Text on an opaque bg-colored halo box for guaranteed 8:1 contrast."""
    w = 0.62 * size * len(text) + 10
    h = size + 8
    if anchor == "start":
        bx = x - 4
    elif anchor == "end":
        bx = x - w + 4
    else:
        bx = x - w / 2
    by = y - size
    ff_attr = f' font-family="{font_family}"' if font_family else ""
    return (f'<rect class="halo" x="{bx:.1f}" y="{by:.1f}" width="{w:.1f}" '
            f'height="{h:.1f}" rx="3"/>'
            f'<text class="{cls}" x="{x:.1f}" y="{y:.1f}" font-size="{size}" '
            f'font-weight="{weight}" text-anchor="{anchor}"{ff_attr}>{esc(text)}</text>')

# ---------------------------------------------------------------- coastline (clipped w/ margin)
coast = GEO["coast"]
coast_u = GEO["coast_u"]
margin_u = 500
coast_pts = []
for (x, y), u in zip(coast, coast_u):
    if WX0 - margin_u <= u <= WX1 + margin_u:
        coast_pts.append(enu_to_svg(x, y))

coast_path_d = "M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in coast_pts)

# land polygon: coastline + top corners of the plot rect (land is Y>0, screen-top)
land_pts = list(coast_pts)
land_path_d = ("M " + " L ".join(f"{x:.1f},{y:.1f}" for x, y in land_pts) +
               f" L {MAP_X1:.1f},{MAP_Y0:.1f} L {MAP_X0:.1f},{MAP_Y0:.1f} Z")

# ---------------------------------------------------------------- contour paths (clip to map rect w/ margin)
def in_bounds(pt, m=60):
    x, y = pt
    return (MAP_X0 - m <= x <= MAP_X1 + m) and (MAP_Y0 - m <= y <= MAP_Y1 + m)

contour_svg = {}
for lv, segs in contour_segs.items():
    d_parts = []
    for (x1, y1), (x2, y2) in segs:
        p1 = enu_to_svg(x1, y1)
        p2 = enu_to_svg(x2, y2)
        if in_bounds(p1) or in_bounds(p2):
            d_parts.append(f"M {p1[0]:.1f},{p1[1]:.1f} L {p2[0]:.1f},{p2[1]:.1f}")
    contour_svg[lv] = " ".join(d_parts)

# a representative label point per contour: pick a segment near the vertical
# center of the map and roughly 1/3 across, for a legible single label
def label_point_for(lv, frac_x):
    segs = contour_segs[lv]
    target_X = WX0 + frac_x * (WX1 - WX0)
    best, best_d = None, 1e18
    for (x1, y1), (x2, y2) in segs:
        mx, my = (x1 + x2) / 2, (y1 + y2) / 2
        X, Y = to_point_frame(mx, my)
        if not (WX0 <= X <= WX1 and WY0 <= Y <= WY1):
            continue
        d = abs(X - target_X)
        if d < best_d:
            best_d, best = d, (mx, my)
    return best

label_fracs = {-2: 0.10, -4: 0.20, -6: 0.32, -8: 0.46, -10: 0.62}
contour_labels = {}
for lv, frac in label_fracs.items():
    p = label_point_for(lv, frac)
    if p:
        contour_labels[lv] = enu_to_svg(*p)

# ---------------------------------------------------------------- spots
CANON = {"Sewer Peak", "First Peak", "Second Peak", "38th", "The Hook",
         "Shark's Cove", "Private's"}
EXTRA = {"Suicide's", "Little Wind-an-Sea", "Bombora"}

spot_svg = []
offmap_notes = []
for sp in GEO["spots"]:
    name = sp["name"]
    if name not in CANON and name not in EXTRA:
        continue
    x, y = enu_to_svg(sp["x"], sp["y"])
    canon = name in CANON
    if MAP_X0 - 20 <= x <= MAP_X1 + 20 and MAP_Y0 - 20 <= y <= MAP_Y1 + 20:
        spot_svg.append((sp, x, y, canon))
    else:
        offmap_notes.append(sp)

# ---------------------------------------------------------------- build SVG
parts = []
# Typography: sans for the root (spot names, u-values, credit line, legend --
# these are DATA labels, not display copy) with the headline set explicitly in
# Georgia to match index.html's serif-display/sans-data convention (h1/h2 are
# Georgia there, body/captions are sans). Fixes the muriel audit's "two font
# systems" finding by aligning topology's data labels with ladder/week (both
# already sans) instead of splitting map=serif vs strips=sans arbitrarily.
SANS = "-apple-system, 'Helvetica Neue', Arial, sans-serif"
SERIF = "Georgia, 'Times New Roman', serif"
parts.append(f'<svg viewBox="0 0 {VB_W} {VB_H}" xmlns="http://www.w3.org/2000/svg" '
             f'font-family="{SANS}">')
parts.append('<title>Pleasure Point, the point, measured — topo-bathy map</title>')
parts.append('<desc>Planform map of Pleasure Point, Santa Cruz: measured coastline '
             '(OSM), depth contours from NOAA NCEI bathymetry, and the seven canon '
             'surf spots with along-point arclength u.</desc>')

parts.append(f"""
<!-- WCAG contrast ratios, computed (sRGB relative luminance, WCAG 2.x formula).
     Effective ratios below are RENDERED values: no text in this figure uses
     CSS opacity<1 (opacity thins glyphs and was previously misreported: this
     comment used to cite the pre-opacity base-color ratio for .lbl-dim/.credit
     even though their alpha-blended on-screen values were lower). Dimmed
     labels are pre-blended solid colors instead, so the ratio below IS what
     renders:
     ink  #e6e4d2 on bg #0f1216 (halo)        = 14.66:1  [.lbl / .lbl-foam(foam) primary labels]
     foam #eef2f3 on bg #0f1216 (halo)        = 16.66:1  [.lbl-foam / .title]
     lbl-dim #c8c7b8 on bg #0f1216 (halo)     = 11.01:1  [.lbl-dim (u-values, contour labels), solid, no opacity]
     credit  #bfbeb0 on bg #0f1216 (halo)     = 10.02:1  [.credit (citation line), solid, no opacity]
     sand #c9a86a on bg #0f1216               =  8.31:1  [unused for text; icon/legend glyph only]
     teal #4a8f85 / slate #6b7f8c on bg       =  4.97:1 / 4.51:1 [graphics only, NOT text]
     All readable text below sits on an opaque bg-colored halo box, every value >=8:1, all >=10:1.
     (Note: SVG comments may not contain a literal double-hyphen, so this
     block uses brackets/colons instead of a dash: a real XML-validity
     constraint, caught when render_check.mjs was fixed to load this file
     directly rather than string-injected into HTML.)
-->
""")

parts.append(f"""
<style>
  .bg {{ fill: var(--mg-bg, #0f1216); }}
  .sea {{ fill: #142229; }}
  .land {{ fill: var(--mg-kelp, #1d2b28); fill-opacity: 0.55; }}
  .coast {{ fill: none; stroke: var(--mg-fg, #e6e4d2); stroke-width: 2.6;
            stroke-linejoin: round; stroke-linecap: round; }}
  .contour {{ fill: none; stroke: var(--mg-teal, #4a8f85); stroke-width: 1.1;
              opacity: 0.85; }}
  .halo {{ fill: var(--mg-bg, #0f1216); }}
  .lbl {{ fill: var(--mg-fg, #e6e4d2); }}
  .lbl-dim {{ fill: var(--mg-lbl-dim, #c8c7b8); }}
  .lbl-foam {{ fill: var(--mg-foam, #eef2f3); }}
  .title {{ fill: var(--mg-foam, #eef2f3); }}
  .credit {{ fill: var(--mg-credit, #bfbeb0); }}
  .spot-canon {{ fill: var(--mg-foam, #eef2f3); stroke: var(--mg-teal, #4a8f85);
                 stroke-width: 1.6; }}
  .spot-extra {{ fill: var(--mg-slate, #6b7f8c); stroke: var(--mg-bg, #0f1216);
                 stroke-width: 1; opacity: 0.85; }}
  .apex {{ fill: var(--mg-sand, #c9a86a); stroke: var(--mg-bg, #0f1216); stroke-width: 1.2; }}
  .access {{ fill: none; stroke: var(--mg-sand, #c9a86a); stroke-width: 1.6; }}
  .goldenrule {{ fill: none; stroke: var(--mg-sand, #c9a86a); stroke-width: 1.6;
                 opacity: 0.9; }}
  .scalebar {{ stroke: var(--mg-fg, #e6e4d2); stroke-width: 2; }}
  .northarrow {{ fill: var(--mg-fg, #e6e4d2); }}
  .frame {{ fill: none; stroke: var(--mg-slate, #6b7f8c); stroke-width: 1; opacity: 0.5; }}
</style>
""")

parts.append(f'<rect class="bg" x="0" y="0" width="{VB_W}" height="{VB_H}"/>')

# clip path for the map band
parts.append(f'<clipPath id="mapclip"><rect x="{MAP_X0:.1f}" y="{MAP_Y0:.1f}" '
             f'width="{map_w:.1f}" height="{map_h:.1f}"/></clipPath>')

parts.append(f'<g clip-path="url(#mapclip)">')
parts.append(f'<rect class="sea" x="{MAP_X0-40:.1f}" y="{MAP_Y0-40:.1f}" '
             f'width="{map_w+80:.1f}" height="{map_h+80:.1f}"/>')
parts.append(f'<path class="land" d="{land_path_d}"/>')
for lv in LEVELS:
    parts.append(f'<path class="contour" d="{contour_svg[lv]}"/>')
parts.append(f'<path class="coast" d="{coast_path_d}"/>')
parts.append('</g>')
parts.append(f'<rect class="frame" x="{MAP_X0:.1f}" y="{MAP_Y0:.1f}" '
             f'width="{map_w:.1f}" height="{map_h:.1f}"/>')

# contour labels (halo)
for lv in LEVELS:
    if lv in contour_labels:
        x, y = contour_labels[lv]
        parts.append(halo_text(x, y - 6, f"{lv} m", size=16, weight=500,
                                cls="lbl-dim", anchor="middle", dx=0, dy=0))

# golden-rule gradient arrow along the coast, drawn once in clear deep water
# (Y=-580: seaward of every spot label's offshore extent and between the -6 m
# and -8 m contour labels, so it never fights spot/contour text for space)
grx0, gry0 = world_to_svg(150, -580)
grx1, gry1 = world_to_svg(1900, -580)
parts.append(f'<path class="goldenrule" marker-end="url(#arrow)" '
             f'd="M {grx0:.1f},{gry0:.1f} L {grx1:.1f},{gry1:.1f}"/>')
parts.append('<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" '
             'markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
             '<path d="M0,0 L10,5 L0,10 z" fill="#c9a86a"/></marker></defs>')
gx_mid = (grx0 + grx1) / 2
gy_mid = gry0 - 12
parts.append(halo_text(gx_mid, gy_mid, "softer, shallower, more sheltered →",
                        size=16, weight=600, cls="lbl", anchor="middle"))

# apex marker (label below-left, into the sea, away from Little Wind-an-Sea's
# above-right label 8 m up-point of it)
ax, ay = enu_to_svg(0, 0)
# diamond glyph (matches the legend's "◆ apex" promise -- a plain circle read
# as a spot marker and was indistinguishable from the canon dots at a glance)
_r = 6.5
parts.append(f'<path class="apex" d="M {ax:.1f},{ay-_r:.1f} L {ax+_r:.1f},{ay:.1f} '
             f'L {ax:.1f},{ay+_r:.1f} L {ax-_r:.1f},{ay:.1f} Z"/>')
parts.append(halo_text(ax - 10, ay + 20, "apex, u=0 m", size=16, weight=600,
                        cls="lbl", anchor="end"))

# avenue access points (38th & 41st) — snapped onto the coastline at matching
# alongpoint X. The Santa Cruz street grid puts these right at the 38th/Hook
# takeoff zones (avenue X is within ~150 m of the spot's own X), so a lone
# floating label would collide with that spot's label; instead we mark the
# access point with a small tick on the coast and fold the note into the
# corresponding spot's stacked label below (avoids a duplicate crowded box).
avenue_note = {}  # spot name -> access note text
access_tick_svg = []  # deferred: painted AFTER spot labels so a halo box can
                       # never occlude a tick (muriel audit #1 -- The Hook's
                       # label halo previously painted over the 41st Ave mark)
_AVE_TO_SPOT_NOTE = {"38th Avenue": ("38th", "38th Ave access"),
                      "41st Avenue": ("The Hook", "41st Ave access, stairs")}
for avname, (spot_name, note) in _AVE_TO_SPOT_NOTE.items():
    av = GEO["avenues"].get(avname)
    if not av:
        continue
    X, _ = to_point_frame(av["x"], av["y"])
    best_i, best_d = 0, 1e18
    for i, (x, y) in enumerate(coast):
        cX, _ = to_point_frame(x, y)
        d = abs(cX - X)
        if d < best_d:
            best_d, best_i = d, i
    cxw, cyw = coast[best_i]
    vx, vy = enu_to_svg(cxw, cyw)
    access_tick_svg.append(f'<path class="access" d="M {vx-5:.1f},{vy-5:.1f} '
                 f'L {vx+5:.1f},{vy+5:.1f} M {vx-5:.1f},{vy+5:.1f} '
                 f'L {vx+5:.1f},{vy-5:.1f}"/>')
    avenue_note[spot_name] = note

def stack_labels(x, y, side, lines, leader_gap=13):
    """Stack halo_text lines outward from (x,y) with guaranteed non-overlapping
    halo boxes (each box's [top,bottom] computed the same way halo_text does)."""
    out = []
    gap = 4
    cursor = y + side * leader_gap
    for text, size, weight, cls in lines:
        if side < 0:
            box_bottom = cursor
            box_top = box_bottom - (size + 8)
            baseline = box_bottom - 8
            cursor = box_top - gap
        else:
            box_top = cursor
            baseline = box_top + size
            box_bottom = box_top + size + 8
            cursor = box_bottom + gap
        out.append(halo_text(x, baseline, text, size=size, weight=weight,
                              cls=cls, anchor="middle"))
    return out

# spot markers
# canon: alternate label above/below coast to reduce collisions
canon_side = {"Sewer Peak": -1, "First Peak": 1, "Second Peak": -1, "38th": 1,
              "The Hook": -1, "Shark's Cove": 1, "Private's": -1}
# The Hook's stack needs extra clearance from its spot: it's the one canon
# label that shares its neighborhood with a cliff-access tick (41st Ave,
# drawn on the coastline). Default leader_gap (13px) let the value box's
# spot-proximal edge sit right on top of the tick (muriel audit #1's fix --
# ticks painting on top of the halo -- otherwise just traded "hidden tick"
# for "tick defacing the u-value text"). A longer leader clears both.
LEADER_GAP_OVERRIDE = {"The Hook": 40}

for sp, x, y, canon in spot_svg:
    if canon:
        r = 5.5
        parts.append(f'<circle class="spot-canon" cx="{x:.1f}" cy="{y:.1f}" r="{r}"/>')
        side = canon_side.get(sp["name"], -1)
        leader_gap = LEADER_GAP_OVERRIDE.get(sp["name"], 13)
        lines = [(sp["name"], 17, 700, "lbl-foam"),
                 (f"u={sp['u']:.0f} m", 16, 500, "lbl-dim")]
        # stack_labels() processes `lines` in order, placing each successive
        # item FARTHER from the spot. For side>0 that already reads name
        # (near spot, top of stack) -> value (below it) top-to-bottom, which
        # is the wanted "value below name" convention. For side<0 the stack
        # grows upward, so the same list order put the value (processed
        # second, farthest from spot = topmost on screen) ABOVE the name --
        # muriel audit #2: at Sewer Peak this let "u=402 m" read as if it
        # belonged to the unrelated "Suicide's" label sitting just above it.
        # Reversing the order for side<0 puts the value nearest the spot
        # (bottom of the upward stack) and the name farthest (top), so every
        # spot reads name-then-value top-to-bottom regardless of side.
        stack_lines = list(reversed(lines)) if side < 0 else lines
        end_y = y + side * (leader_gap + sum((s + 12) for _, s, _, _ in lines))
        parts.append(f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x:.1f}" y2="{end_y:.1f}" '
                     f'stroke="var(--mg-fg,#e6e4d2)" stroke-width="1" opacity="0.5"/>')
        parts.extend(stack_labels(x, y, side, stack_lines, leader_gap=leader_gap))
    else:
        r = 3.2
        parts.append(f'<circle class="spot-extra" cx="{x:.1f}" cy="{y:.1f}" r="{r}"/>')
        parts.append(halo_text(x + 7, y - 7, sp["name"], size=16, weight=400,
                                cls="lbl-dim", anchor="start"))

# access ticks painted last among map-layer elements -- always on top of every
# spot-label halo box (muriel audit #1)
parts.extend(access_tick_svg)

# off-map note for spots beyond the window (e.g. Bombora) — real numbers, no map slot
if offmap_notes:
    note_bits = []
    for sp in offmap_notes:
        note_bits.append(f"{sp['name']} — u={sp['u']:.0f} m, "
                          f"{sp['offshore_m']:.0f} m offshore (off map, east)")
    note_txt = "  |  ".join(note_bits)
    parts.append(halo_text(MAP_X1 - 6, MAP_Y1 - 10, note_txt, size=16, weight=500,
                            cls="lbl-dim", anchor="end"))

# ---------------------------------------------------------------- scale bar + north arrow
bar_m = 500.0
bar_px = bar_m * SCALE
sb_x0 = MAP_X0 + 10
sb_y = MAP_Y1 - 18
parts.append(f'<line class="scalebar" x1="{sb_x0:.1f}" y1="{sb_y:.1f}" '
             f'x2="{sb_x0+bar_px:.1f}" y2="{sb_y:.1f}"/>')
for xx in (sb_x0, sb_x0 + bar_px):
    parts.append(f'<line class="scalebar" x1="{xx:.1f}" y1="{sb_y-5:.1f}" '
                 f'x2="{xx:.1f}" y2="{sb_y+5:.1f}"/>')
parts.append(halo_text(sb_x0 + bar_px / 2, sb_y - 10, "500 m", size=16, weight=600,
                        cls="lbl", anchor="middle"))

# north arrow: rotate ENU (0,1) through the same transform. Anchor is the
# TAIL; the line points toward true north (up-right in this rotated frame)
# and the "N" glyph sits beyond the arrowhead, at the end it points to.
nx0, ny0 = enu_to_svg(0, 0)
nx1, ny1 = enu_to_svg(0, 130)
dnx, dny = nx1 - nx0, ny1 - ny0
dlen = math.hypot(dnx, dny)
dnx, dny = dnx / dlen, dny / dlen  # unit vector, points true north on screen
na_len = 30
na_tail_x, na_tail_y = MAP_X1 - 62, MAP_Y0 + 58
na_tip_x = na_tail_x + na_len * dnx
na_tip_y = na_tail_y + na_len * dny
parts.append('<g>')
parts.append(f'<line x1="{na_tail_x:.1f}" y1="{na_tail_y:.1f}" '
             f'x2="{na_tip_x:.1f}" y2="{na_tip_y:.1f}" '
             f'stroke="var(--mg-fg,#e6e4d2)" stroke-width="2.2" stroke-linecap="round"/>')
parts.append(f'<circle class="northarrow" cx="{na_tip_x:.1f}" cy="{na_tip_y:.1f}" r="3"/>')
parts.append(halo_text(na_tip_x + 10 * dnx, na_tip_y + 10 * dny, "N", size=16,
                        weight=700, cls="lbl", anchor="middle"))
parts.append('</g>')

# ---------------------------------------------------------------- title block
parts.append(halo_text(PAD_X, 40, "PLEASURE POINT — the point, measured",
                        size=26, weight=700, cls="title", anchor="start",
                        font_family=SERIF))
parts.append(halo_text(PAD_X, 66, "Coastline & spots: OpenStreetMap (ODbL 1.0). "
                        "Bathymetry: NOAA NCEI Monterey Bay 1/3″ coastal DEM, NAVD88.",
                        size=16, weight=400, cls="credit", anchor="start"))

# cliff access caption, bottom-left (the two sand ticks on the coast in the
# 38th/Hook stretch) — kept off the crowded spot-label stack, see avenue_note
if avenue_note:
    short = {"38th": "38th Ave, u≈981 m", "The Hook": "41st Ave stairs, u≈1331 m"}
    av_bits = [short[k] for k in avenue_note if k in short]
    parts.append(halo_text(PAD_X, VB_H - 12, "✕ cliff access: " + "  ·  ".join(av_bits),
                            size=16, weight=500, cls="lbl-dim", anchor="start"))

# legend, bottom-right (right-aligned so it never runs off the viewBox edge)
lg_x, lg_y = VB_W - PAD_X, VB_H - 12
parts.append(halo_text(lg_x, lg_y, "● canon   ○ minor   line=depth (m)   ◆ apex",
                        size=16, weight=500, cls="lbl-dim", anchor="end"))

parts.append('</svg>')

svg = "\n".join(parts)
out_path = os.path.join(HERE, "fig-topology.svg")
with open(out_path, "w") as f:
    f.write(svg)
print("wrote", out_path)
print("viewBox", VB_W, VB_H, "map rect", MAP_X0, MAP_Y0, map_w, map_h, "scale", SCALE)
print("north dir (dx,dy)", round(dnx, 3), round(dny, 3))
print("canon spots plotted:", [s[0]["name"] for s in spot_svg if s[3]])
print("extra spots plotted:", [s[0]["name"] for s in spot_svg if not s[3]])
print("off-map:", [s["name"] for s in offmap_notes])
