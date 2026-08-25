#!/usr/bin/env python3
"""
Generate fig-curl.svg — "THE CURL: how the wave gets over itself"

A mechanism figure for the essay's curl brief. Unlike fig-topology/fig-ladder,
this one plots no survey data: it plots THE SHIPPED MODEL'S OWN FORMULAS,
transcribed from web-three/js/shaders.js (choppyPos) and shared/model-glsl.js
(ocean's phase skew), evaluated at stated parameters. Every curve on the page
is computed here from those expressions; none is drawn by hand.

Transcribed expressions and where they live
-------------------------------------------
  phase skew (even map, u_pitchOdd = 0 default)   model-glsl.js:1011-1013
      skew  = clamp(excess*0.82, 0, 0.8)
      theta -= skew*(1 - cos(theta))
  choppy displacement (Tessendorf)                shaders.js:333, 498-506
      off = lam*grad ,  lam = S/(aEst*k*k) ,  S := lam*a*k^2
      so for h = a*cos(k*z):  z = z0 - (S/k)*sin(k*z0),  dz/dz0 = 1 - S*cos(k*z0)
      => S = 1 is the vertical tangent, S > 1 folds. Cap S_CAP_HARD = 3.2.
  front-face gate                                 shaders.js:509-511
      frontPhase = smoothstep(0.02,0.78,-sin(th))*smoothstep(-0.35,0.82,cos(th))
  pocket (compact arm, u_breakShape = 1)          model-glsl.js:1072
      pocketCompact = exp(-d^2 / (2*(7.5*pockS)^2))
  lip throw in the wave's own length (#throwlen)  shaders.js:284, 570-577
      THROW_FRAC = 0.30 ; throwLen = S/k ; throwMag = 0.30*pocket*plunge*throwLen
  drop, post-2026-08-18 (band-scoped)             shaders.js:645-652
      yBendD = 0.35*crestCeil ; dyD = max(h - yBendD, 0)
      dropMag = clamp(0.80*pocket*plunge*frontPhase, 0, 0.85) * dyD
  the bend (#curl)                                shaders.js:701-748
      yBend = 0.35*hCrest ; dyB = h - yBend
      kEff  = (mix(0.30,2.60,plunge)/hCrest) * overGate * pocket * bandZ
      th    = clamp(dyB*kEff, 0, 2.30)          (2.30 rad = 132 deg backstop)
      dz    = dyB*(1-cos th)/th ;  y = yBend + dyB*sin(th)/th
  plunge                                          shaders.js:361
      plunge = smoothstep(0.45, 1.25, xi)

Drawing parameters (declared, not measured -- this is a mechanism schematic):
  LAM = 70 m, a = 2.5 m, xi = 1.25 (full plunge), excess = 1.0, pocket centred
  on the crest. They are printed on the figure itself so the reader can redraw
  it. Measured numbers appear ONLY in the evidence strip, each with its source.

Measured numbers quoted in the evidence strip (all from committed sources):
  - shaders.js:928-935  six-clock #lamcap A/B: fold points -41..-56%,
    crest height bit-identical 8.28/8.59/9.72/8.71/11.60/9.37 m
  - docs/CONTROLS.md `curl` row: max bend 132 deg at Sewers q=high;
    Sharks (xi 0.45) moves 12 deg
  - shaders.js:690-696 (FALSIFIED note): rigid rotation, apex 8.8 -> 12.4 m,
    +41% over the depth-limited ceiling
  - TODO.md head (2026-08-22): 279 overhang bins on the default path, 21 foam
    over bare water, worst gap 7.67 m

Deterministic; no randomness.
Run: python3 gen_curl.py
Output: fig-curl.svg next to this script.
"""
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))

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

# ---- palette (identical to fig-ladder / fig-topology / index.html) --------
BG = "#0f1216"
FG = "#e6e4d2"
FOAM = "#eef2f3"
KELP = "#1d2b28"
SAND = "#c9a86a"
TEAL = "#4a8f85"
SLATE = "#6b7f8c"
FOAM_DIM = "#d8dcdd"   # foam pre-blended at 0.9 over bg, baked solid

CONTRASTS = {
    "cream(#e6e4d2) on bg(#0f1216)": contrast(FG, BG),
    "foam(#eef2f3) on bg(#0f1216)": contrast(FOAM, BG),
    "cream(#e6e4d2) on kelp(#1d2b28)": contrast(FG, KELP),
    "foam(#eef2f3) on kelp(#1d2b28)": contrast(FOAM, KELP),
    "sand(#c9a86a) on bg(#0f1216)": contrast(SAND, BG),
    "foam-dim(#d8dcdd) on bg(#0f1216) [solid, no opacity]": contrast(FOAM_DIM, BG),
}
CONTRASTS_EXCLUDED_FROM_TEXT = {
    "teal(#4a8f85) on bg(#0f1216) [graphic only]": contrast(TEAL, BG),
    "slate(#6b7f8c) on bg(#0f1216) [graphic only]": contrast(SLATE, BG),
    "sand(#c9a86a) on kelp(#1d2b28) [avoid, use bg instead]": contrast(SAND, KELP),
}

# ---- model constants, transcribed ----------------------------------------
LAM = 70.0                 # carrier wavelength, m (drawing parameter)
K = 2.0 * math.pi / LAM
A = 2.5                    # carrier amplitude, m (drawing parameter)
XI = 1.25                  # Iribarren: full plunge at the Battjes top end
EXCESS = 1.0               # H0*Ks / (gamma*h) -- at the break line, by construction
S_CAP_HARD = 3.2
THROW_FRAC = 0.30
BEND_FRAC = 0.35           # yBend = 0.35 * hCrest
TH_MAX = 2.30              # rad, the mesh backstop (132 deg)

def smoothstep(e0, e1, x):
    t = max(0.0, min(1.0, (x - e0) / (e1 - e0)))
    return t * t * (3.0 - 2.0 * t)

PLUNGE = smoothstep(0.45, 1.25, XI)          # shaders.js:361
SKEW = max(0.0, min(0.8, EXCESS * 0.82))     # model-glsl.js:1011-1012

# ---- the profile ----------------------------------------------------------
# z is shoreward-positive metres from the crest. theta = -k*z puts the steep
# (already-skewed) face on the shoreward side, which is what the even skew map
# produces: at theta = -pi/2 the surface is at -0.72a, at +pi/2 it is +0.72a.
def theta_of_z(z):
    return -K * z

def h_of_theta(th):
    """Carrier height with the shipped even phase skew."""
    ths = th - SKEW * (1.0 - math.cos(th))
    return A * math.cos(ths)

def h_of_z(z):
    return h_of_theta(theta_of_z(z))

H_CREST = h_of_z(0.0)      # = A by construction (the skew fixes theta = 0)

def dh_dz(z, e=0.25):
    return (h_of_z(z + e) - h_of_z(z - e)) / (2.0 * e)

def pocket_of_z(z, sigma=9.0):
    """pocketCompact, centred on the crest (the zipper's locus is the crest
    crossing the break line, so d = 0 there). sigma quoted on the figure."""
    return math.exp(-(z * z) / (2.0 * sigma * sigma))

def front_phase(th):
    """shaders.js:509-511, evaluated on the raw (unskewed) phase."""
    return (smoothstep(0.02, 0.78, -math.sin(th))
            * smoothstep(-0.35, 0.82, math.cos(th)))

# ---- the four profiles ----------------------------------------------------
ZS = [(-LAM / 2.0) + i * (LAM / 400.0) for i in range(401)]

def profile_pitch():
    """A: the height field alone. Single-valued in z by construction."""
    return [(z, h_of_z(z)) for z in ZS]

def profile_choppy(S):
    """B/C: Tessendorf choppy. lam = S/(a k^2); off = lam * dh/dz."""
    lam = S / (A * K * K)
    out = []
    for z0 in ZS:
        out.append((z0 + lam * dh_dz(z0), h_of_z(z0)))
    return out

def profile_throw_drop(S):
    """D: the shipped default -- choppy fold, plus the throw (shoreward
    translation of the crest band) and the band-scoped drop."""
    lam = S / (A * K * K)
    out = []
    for z0 in ZS:
        h = h_of_z(z0)
        th = theta_of_z(z0)
        pk = pocket_of_z(z0)
        fp = front_phase(th)
        throw_len = S / K
        throw_mag = THROW_FRAC * pk * PLUNGE * throw_len
        y_bend = BEND_FRAC * H_CREST
        dy_d = max(h - y_bend, 0.0)
        drop_mag = min(0.85, 0.80 * pk * PLUNGE * fp) * dy_d
        out.append((z0 + lam * dh_dz(z0) + throw_mag, h - drop_mag))
    return out

def profile_bend(S, sig_z=None, k_scale=1.0):
    """E: #curl. Choppy is capped at the cusp (S = 1) and the bend owns
    everything past it. Returns (points, tip_index, arc_centre, R_at_tip)."""
    lam = S / (A * K * K)
    if sig_z is None:
        # sigZ = clamp(mix(0.85,0.50,plunge)*hCrest, 2.5, 10.0), then widened
        # by the carrier length the schematic is drawn at.
        sig_z = max(2.5, min(10.0, (0.85 + (0.50 - 0.85) * PLUNGE) * H_CREST))
    y_bend = BEND_FRAC * H_CREST
    out = []
    for z0 in ZS:
        h = h_of_z(z0)
        zc = z0 + lam * dh_dz(z0)
        if h > y_bend:
            dy_b = h - y_bend
            band_z = math.exp(-(z0 * z0) / (2.0 * sig_z * sig_z))
            k_eff = ((0.30 + (2.60 - 0.30) * PLUNGE) / max(H_CREST, 0.5)) \
                    * min(EXCESS, 1.5) * pocket_of_z(z0) * band_z * k_scale
            th = max(0.0, min(TH_MAX, dy_b * k_eff))
            if th > 1e-4:
                s_th = math.sin(th) / th
                c_th = (1.0 - math.cos(th)) / th
            else:
                s_th, c_th = 1.0, 0.0
            out.append((zc + dy_b * c_th, y_bend + dy_b * s_th, th))
        else:
            out.append((zc, h, 0.0))
    # tip = the most shoreward point that actually WENT OVER. Taking the
    # global argmax in z picks an unbent trough vertex far shoreward, which
    # is how the first draft annotated a lip at theta = 0.
    bent = [i for i in range(len(out)) if out[i][2] > 0.10]
    tip = max(bent, key=lambda i: out[i][0]) if bent else 0
    return out, tip, y_bend

# ---- SVG scaffolding ------------------------------------------------------
# Layout rule: every text run is hand-wrapped to a measured line budget for its
# container (see LINE BUDGETS below) because SVG <text> does not wrap. The
# earlier draft let equations and card prose run past their boxes and collide;
# the budgets exist so that cannot recur silently.
#   sans 16px  ~ 8.6 px/char   mono 16px ~ 9.65 px/char
#   panel eq (262 px)      -> 26 mono chars   panel caption -> 30 sans chars
#   card body (390 px)     -> 40 mono / 45 sans chars
#   stat column (353 px)   -> 40 sans chars
VB_W, VB_H = 1200, 1360
svg = []

def poly(points, mapper):
    return " ".join("%.2f,%.2f" % mapper(z, y) for (z, y) in points)

class Panel:
    def __init__(self, x0, y0, w, h, z0, z1, ylo, yhi):
        self.x0, self.y0, self.w, self.h = x0, y0, w, h
        self.z0, self.z1, self.ylo, self.yhi = z0, z1, ylo, yhi
    def map(self, z, y):
        fx = (z - self.z0) / (self.z1 - self.z0)
        fy = (y - self.ylo) / (self.yhi - self.ylo)
        return (self.x0 + fx * self.w, self.y0 + self.h - fy * self.h)

def water_path(pts, panel):
    """Surface polyline closed down to the panel floor. Self-intersecting where
    the mesh folds -- which is the point; nonzero fill keeps the body solid."""
    d = "M " + " L ".join("%.2f %.2f" % panel.map(z, y) for (z, y) in pts)
    xe, ye = panel.map(pts[-1][0], panel.ylo)
    xs, ys = panel.map(pts[0][0], panel.ylo)
    d += " L %.2f %.2f L %.2f %.2f Z" % (xe, ye, xs, ys)
    return d

def lines(cls, style, x, y, rows, dy=21):
    for j, r in enumerate(rows):
        svg.append('<text class="%s %s" x="%.1f" y="%.1f">%s</text>' % (cls, style, x, y + j * dy, r))

# ---- header ---------------------------------------------------------------
audit = ["WCAG contrast ratios computed for this figure (see gen_curl.py):"]
for k_, v in CONTRASTS.items():
    audit.append("  %s: %.2f:1  [%s >=8:1]" % (k_, v, "PASS" if v >= 8 else "FAIL"))
audit.append("Graphic-only colors (never used for text), for reference:")
for k_, v in CONTRASTS_EXCLUDED_FROM_TEXT.items():
    audit.append("  %s: %.2f:1" % (k_, v))
audit.append("Rule applied: readable text is cream/foam on bg or kelp only (>=11:1); sand is used for")
audit.append("text only directly on bg (8.31:1), never on kelp (6.51:1, would fail). Water fill, surface")
audit.append("strokes, arcs and leader lines use teal/slate and carry no text. 16px text floor throughout.")

svg.append('<svg viewBox="0 0 %d %d" xmlns="http://www.w3.org/2000/svg">' % (VB_W, VB_H))
svg.append("<!--\n" + "\n".join(audit) + "\n-->")
svg.append("""<style>
  .fg-text { fill: %s; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
  .foam-text { fill: %s; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
  .foam-dim-text { fill: %s; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
  .sand-text { fill: %s; font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; }
  .mono { font-family: ui-monospace, Menlo, Consolas, monospace; }
  .title { font-size: 27px; font-weight: 700; letter-spacing: 0.3px; }
  .subtitle { font-size: 16px; }
  .strip-label { font-size: 18px; font-weight: 700; letter-spacing: 1.5px; }
  .panel-name { font-size: 17px; font-weight: 700; }
  .eq { font-size: 16px; }
  .caption { font-size: 16px; }
  .annot { font-size: 16px; }
  .annot-b { font-size: 16px; font-weight: 700; }
  .stat-n { font-size: 21px; font-weight: 700; }
</style>""" % (FG, FOAM, FOAM_DIM, SAND))
svg.append('<rect width="%d" height="%d" fill="%s"/>' % (VB_W, VB_H, BG))

svg.append('<text class="fg-text title" font-family="Georgia, \'Times New Roman\', serif" x="40" y="46">THE CURL &#8212; how the wave gets over itself</text>')
svg.append('<text class="fg-text subtitle" x="40" y="74">A height field carries one surface for every point on the seabed, so it can steepen to vertical and never past it. Getting past vertical takes a second mechanism.</text>')
svg.append('<text class="foam-dim-text subtitle" x="40" y="96">Every curve below is the shipped model&#8217;s own expression, evaluated here &#8212; none is drawn by hand. Schematic: &#923; = 70 m, a = 2.5 m, &#958; = 1.25, excess 1.0.</text>')

# ==== STRIP A ==============================================================
A_TOP = 138
svg.append('<text class="fg-text strip-label" x="40" y="%d">ONE CROSS-SECTION, FOUR MECHANISMS</text>' % A_TOP)
svg.append('<line x1="40" y1="%d" x2="1160" y2="%d" stroke="%s" stroke-width="1"/>' % (A_TOP + 12, A_TOP + 12, SLATE))

PW, PH, PGAP, PX0 = 262.0, 200.0, 24.0, 40.0
PY0 = A_TOP + 32
ZLO, ZHI = -34.0, 30.0
YLO, YHI = -3.4, 4.6

panels = [
    ("1. PITCH ONLY",
     ["h = a&#183;cos(&#952; &#8722; s(1&#8722;cos &#952;))"],
     ["The face leans shoreward and",
      "stops. For every z there is",
      "exactly one y, so no reparam-",
      "etrisation of h(&#952;) can overhang."], "pitch", "foam-dim-text"),
    ("2. CHOPPY, S = 1",
     ["z = z&#8320; + &#955;&#183;&#8706;h/&#8706;z&#8320;", "S := &#955;&#183;a&#183;k&#178;"],
     ["Points slide toward the crest.",
      "dz/dz&#8320; = 1 &#8722; S&#183;cos(kz&#8320;), so at",
      "S = 1 the tangent goes vertical.",
      "This is the cusp, exactly."], "cusp", "foam-dim-text"),
    ("3. CHOPPY, S = 1.8",
     ["S &gt; 1 &#8594; the mesh folds"],
     ["Past the cusp the surface really",
      "is multivalued. But it folds",
      "SYMMETRICALLY about the crest.",
      "That is a fold, not a lip."], "fold", "foam-dim-text"),
    ("4. THROW + DROP",
     ["off_z += 0.30&#183;(S/k)", "&#215; pocket &#215; plunge"],
     ["What ships today. The crest band",
      "is translated shoreward and the",
      "front face pulled down. A trans-",
      "lation cannot preserve thickness."], "throwdrop", "sand-text"),
]

PROFS = {"pitch": profile_pitch(), "cusp": profile_choppy(1.0),
         "fold": profile_choppy(1.8), "throwdrop": profile_throw_drop(1.8)}

for i, (name, eq, caption, key, cls) in enumerate(panels):
    px = PX0 + i * (PW + PGAP)
    p = Panel(px, PY0 + 62, PW, PH, ZLO, ZHI, YLO, YHI)
    svg.append('<text class="foam-text panel-name" x="%.1f" y="%.1f">%s</text>' % (px, PY0 + 12, name))
    lines("fg-text", "eq mono", px, PY0 + 34, eq, dy=20)
    svg.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="%s" stroke-width="1"/>'
               % (p.x0, p.y0, p.w, p.h, SLATE))
    a0 = p.map(ZLO, 0.0); a1 = p.map(ZHI, 0.0)
    svg.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1" stroke-dasharray="4 4"/>'
               % (a0[0], a0[1], a1[0], a1[1], SLATE))
    svg.append('<path d="%s" fill="%s" fill-rule="nonzero" stroke="%s" stroke-width="2" stroke-linejoin="round"/>'
               % (water_path(PROFS[key], p), KELP, TEAL))
    if i == 0:
        ax0, ay0 = p.map(-31.0, 3.95)
        ax1, _ = p.map(-20.0, 3.95)
        svg.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="2"/>' % (ax0, ay0, ax1, ay0, SAND))
        svg.append('<path d="M %.1f %.1f l -7 -4.5 l 0 9 Z" fill="%s"/>' % (ax1 + 1, ay0, SAND))
        svg.append('<text class="sand-text annot" x="%.1f" y="%.1f">shoreward</text>' % (ax1 + 9, ay0 + 5))
        svg.append('<text class="foam-dim-text annot" x="%.1f" y="%.1f">still water</text>' % (p.x0 + 8, a0[1] - 8))
    lines(cls, "caption", px, p.y0 + p.h + 26, caption)

# ==== STRIP B ==============================================================
B_TOP = 578
svg.append('<text class="fg-text strip-label" x="40" y="%d">THE BEND &#8212; what <tspan class="mono">#curl</tspan> does, and the one piece that is missing</text>' % B_TOP)
svg.append('<line x1="40" y1="%d" x2="1160" y2="%d" stroke="%s" stroke-width="1"/>' % (B_TOP + 12, B_TOP + 12, SLATE))

BP = Panel(40, B_TOP + 34, 660, 478, -45.0, 20.0, -2.8, 4.8)
svg.append('<rect x="%.1f" y="%.1f" width="%.1f" height="%.1f" fill="none" stroke="%s" stroke-width="1"/>'
           % (BP.x0, BP.y0, BP.w, BP.h, SLATE))
sw0 = BP.map(-45.0, 0.0); sw1 = BP.map(20.0, 0.0)
svg.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1" stroke-dasharray="4 4"/>'
           % (sw0[0], sw0[1], sw1[0], sw1[1], SLATE))

bend_pts, tip_i, Y_BEND = profile_bend(1.0)
bend_xy = [(z, y) for (z, y, _t) in bend_pts]
svg.append('<path d="%s" fill="%s" fill-rule="nonzero" stroke="%s" stroke-width="2.5" stroke-linejoin="round"/>'
           % (water_path(bend_xy, BP), KELP, TEAL))
# AFTER the fill, not before: underneath it the A/B trace is invisible. And
# ONLY over the band that actually bent -- the bend is the identity below
# y_bend, so tracing the whole profile just double-draws the same line and
# makes the entire outline read as dashed.
pre = profile_choppy(1.0)
seg, segs = [], []
for i, (_z, _y, th) in enumerate(bend_pts):
    if th > 0.01:
        seg.append(pre[i])
    elif seg:
        segs.append(seg); seg = []
if seg:
    segs.append(seg)
for sgm in segs:
    if len(sgm) > 1:
        svg.append('<polyline points="%s" fill="none" stroke="%s" stroke-width="2" stroke-dasharray="6 5"/>'
                   % (poly(sgm, BP.map), FOAM_DIM))

yb0 = BP.map(-45.0, Y_BEND); yb1 = BP.map(20.0, Y_BEND)
svg.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="%s" stroke-width="1.5" stroke-dasharray="7 4"/>'
           % (yb0[0], yb0[1], yb1[0], yb1[1], SAND))
svg.append('<text class="sand-text annot" x="%.1f" y="%.1f">y_bend = 0.35&#183;h_crest &#8212; the face below is untouched, and keeps standing</text>'
           % (yb0[0] + 8, yb0[1] - 9))

# THE VOID. Exactly the geometry the defect is measured on: at one screen-z,
# the TOP surface sample and the BOTTOM surface sample, with nothing between.
tz, ty, tth = bend_pts[tip_i]
under = [(z, y) for (z, y, _t) in bend_pts if abs(z - tz) < 2.0 and y < ty - 0.8]
fz, fy_ = (min(under, key=lambda p: p[1]) if under else (tz, BP.ylo))
tx, tyy = BP.map(tz, ty)
fx, fyy = BP.map(fz, fy_)
svg.append('<path d="M %.1f %.1f C %.1f %.1f %.1f %.1f %.1f %.1f" fill="none" stroke="%s" stroke-width="3" stroke-dasharray="9 6" stroke-linecap="round"/>'
           % (tx, tyy, tx + 16, tyy + 34, fx + 20, fyy - 34, fx, fyy, SAND))
svg.append('<circle cx="%.1f" cy="%.1f" r="4.5" fill="%s"/>' % (tx, tyy, SAND))
svg.append('<circle cx="%.1f" cy="%.1f" r="4.5" fill="none" stroke="%s" stroke-width="2"/>' % (fx, fyy, SAND))
svg.append('<text class="foam-text annot-b" x="%.1f" y="%.1f">&#952; = %.0f&#176; at the lip</text>' % (tx - 150, tyy - 8, math.degrees(tth)))
svg.append('<text class="foam-dim-text annot" x="%.1f" y="%.1f">(132&#176; is the mesh backstop)</text>' % (tx - 150, tyy + 12))
lines("sand-text", "annot", tx + 34, (tyy + fyy) / 2.0 - 10,
      ["THE CURTAIN &#8212; not built.", "The void it would close", "is the barrel."])

lines("foam-dim-text", "caption", BP.x0, BP.y0 + BP.h + 26,
      ["Dashed pale: the crest band BEFORE the bend, drawn only where the bend actually acts. Solid teal: after. The bend never lifts, so the crest lowers as it pitches.",
       "Filled dot: the top surface sample. Hollow dot: the bottom sample at the same screen-z. Between them the model currently has open air."])

# ---- right column: the card ----------------------------------------------
CX, CY, CW, CH = 730, B_TOP + 34, 430, 478
svg.append('<rect x="%d" y="%d" width="%d" height="%d" fill="%s" rx="4"/>' % (CX, CY, CW, CH, KELP))
svg.append('<text class="foam-text panel-name" x="%d" y="%d">A BEND, NOT A ROTATION</text>' % (CX + 20, CY + 32))
lines("fg-text", "eq mono", CX + 20, CY + 62,
      ["&#952;  = dy / R", "R  = h_crest / mix(0.30, 2.60, plunge)",
       "dz = dy&#183;(1 &#8722; cos &#952;) / &#952;", "y  = y_bend + dy&#183;sin &#952; / &#952;"], dy=23)
props = [
    ("It never lifts.", "sin&#160;&#952;/&#952; &#8804; 1 &#8212; no vertex ends higher."),
    ("Arc length is preserved.", "the band keeps its thickness."),
    ("It overhangs by construction.", "dz&#8242;/dz&#8320; = 1 + sin&#160;&#952;&#183;dh/dz&#8320; folds past 90&#176;."),
]
py = CY + 180
for label, body in props:
    svg.append('<text class="foam-text annot-b" x="%d" y="%d">%s</text>' % (CX + 20, py, label))
    svg.append('<text class="fg-text annot" x="%d" y="%d">%s</text>' % (CX + 20, py + 21, body))
    py += 54

svg.append('<line x1="%d" y1="%d" x2="%d" y2="%d" stroke="%s" stroke-width="1"/>'
           % (CX + 20, CY + 322, CX + CW - 20, CY + 322, SLATE))
svg.append('<text class="foam-text annot-b" x="%d" y="%d">FALSIFIED FIRST: A RIGID ROTATION</text>' % (CX + 20, CY + 348))
lines("fg-text", "annot", CX + 20, CY + 370,
     ["A rotation has a pivot, therefore a lever. It",
      "lifted everything seaward of the pivot and the",
      "crest came out a flat-topped slab (apex 8.8 &#8594;",
      "12.4 m, +41% over the ceiling). A bend has no",
      "pivot, so it has no lever."], dy=20)

# ==== STRIP C ==============================================================
C_TOP = 1214
svg.append('<text class="fg-text strip-label" x="40" y="%d">MEASURED</text>' % C_TOP)
svg.append('<line x1="40" y1="%d" x2="1160" y2="%d" stroke="%s" stroke-width="1"/>' % (C_TOP + 12, C_TOP + 12, SLATE))
stats = [
    ("&#8722;41&#8230;&#8722;56%",
     ["fold points across six clocks at Sewers,",
      "once the offset ceiling became S/k rather",
      "than a flat 20 m. Crest height unchanged."], "foam-dim-text"),
    ("132&#176; / 12&#176;",
     ["peak overturn at Sewers &#8212; which is the mesh",
      "backstop &#8212; against Shark&#8217;s Cove (&#958; 0.45).",
      "Spilling barely bends. The knob works."], "foam-dim-text"),
    ("21 of 279",
     ["overhang bins on the default path carry",
      "foam over bare water. Worst gap 7.67 m.",
      "That is the missing curtain, measured."], "sand-text"),
]
SW = (1120 - 2 * 32) / 3.0
for i, (n, rows, cls) in enumerate(stats):
    sx = 40 + i * (SW + 32)
    svg.append('<text class="foam-text stat-n" x="%.1f" y="%d">%s</text>' % (sx, C_TOP + 46, n))
    lines(cls, "caption", sx, C_TOP + 72, rows, dy=20)

svg.append("</svg>")

out = os.path.join(HERE, "fig-curl.svg")
with open(out, "w") as f:
    f.write("\n".join(svg))
print("wrote", out)
for k_, v in CONTRASTS.items():
    print("  %-56s %6.2f:1  %s" % (k_, v, "PASS" if v >= 8 else "FAIL"))
print("  plunge=%.3f skew=%.3f h_crest=%.2f m yBend=%.2f m tip_theta=%.1f deg"
      % (PLUNGE, SKEW, H_CREST, Y_BEND, math.degrees(bend_pts[tip_i][2])))
