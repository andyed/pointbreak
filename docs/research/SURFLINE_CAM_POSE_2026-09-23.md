# Surfline cam pose and the first peel-speed residual — 2026-09-23

Observation half of the residual VALIDATION_PLAN has wanted since August:
peel speed in metres per second from the fixed Surfline "Pleasure Point" cam,
against the model at that day's pre-registered forcing. Source clip, its hash
and its motion checks are in `FIELD_WAVE_MOTION_2026-09-15.md`; conditions in
`PLEASURE_POINT_CAPTURE_2026-08-15.md`.

## Finding

On 2026-08-15 at 15:28 PDT (3–5 ft observed, 3 ft at 16 s SSW, tide 4.0 ft
MLLW) the cam shows two crests peeling progressively down-point at an
observed **Vp ≈ 4.7–6.8 m/s** (steady peel; a closing section reaches 8–12 m/s)
with **α ≈ 35–75°**, while the model's Second Peak line at the same forcing
is a **closeout: α = 3.9° (IQR 0.5–12°), Vp = 37 m/s** on every bed variant,
including the plane baseline, because the day sits below the documented
PEEL_FLOOR (H0 0.91 m against a 1.11 m floor) and above its tide band (+0.36 m
against a +0.01 m top). The crest speed agrees where the pose is physical
(model c 4.3–4.6 m/s at 2.0 m depth; observed 3.8–4.7 m/s at the short end
of the focal bracket), so this is VALIDATION_PLAN's "right on locus, wrong on
peel" outcome, with the qualification that the full camera pose could not be
solved: the frame holds no land feature with a fixable stage coordinate, so
focal length is bracketed rather than measured and every metre number below
carries that bracket.

## What the frame permits, and what blocked the solve

The only land in the 2288 × 1286 frame is the cliff-top fence, the path
behind it and iceplant on the brow (bottom quarter, right two-thirds). There
is no stair head, riprap corner, cross-street, house, lookout wall or distant
coastline, and the near water at the cliff base is occluded by the fence. So
there is nothing to feed `cv2.solvePnP` — a control point needs a 3-D
coordinate, and none of the visible land features has one in OSM or the DEM.
The task's fallback applies. What could be solved without control points:

| quantity | method | value |
|---|---|---|
| horizon row | per-column sea/sky step on a people-free median frame, robust line over 66/105 columns | y = 562.87 − 0.00653 x; **555.4 at centre**; rms 2.03 px |
| roll | slope of that line | **−0.37°** (horizon rises to the right) |
| eye height above the sea surface, from the fence | posts at (1330, 1110→1250) and (2010, 965→1092), 1.15 ± 0.10 m tall: 5.31 ± 0.62 m above the brow; CUDEM 1/9″ terrace at the brow 10.75 ± 0.75 m NAVD88, sea at 1.26 m NAVD88 | **14.8 ± 1.0 m** |
| eye height, from the lineup | 65 sitting-surfer blobs (median 12 px tall, 212 px below the horizon), torso above water 0.85 ± 0.15 m | **15.3 m**, IQR 12.3–21.2 |
| eye height, combined | inverse-variance | **H = 14.85 ± 0.92 m** |
| focal length | not solvable; bracketed | **1300 / 1800 / 2500 px** (HFOV 83° / 65° / 49°) |
| pitch | from the horizon and f | 3.86° / 2.79° / 2.01° |
| principal point | assumed | image centre |
| lens distortion | none modelled | — |
| reprojection residual | **none exists** — no control-point solve | the 2.0 px horizon rms is the only geometric residual |

The two eye-height estimates are independent (one uses the DEM, one does not)
and agree; that is the check that licenses the conversion. The vertical-bar
method is focal-length-free: an object of height h on a plane H below the eye
subtends h·(y − y_h)/H pixels whatever the lens. The same fact makes the
**alongshore ground scale at a row, H/(y − y_h), independent of f** (0.083–
0.086 m/px at the tracked fronts), while the **range scale, ≈ f·H/(y − y_h)²,
is proportional to f** (0.63 m/px at f = 1300, 0.87 at 1800, 1.21 at 2500 at
row 730). So the lateral part of the peel is measured; its shoreward part and
the crest speed inherit the bracket.

The sea-surface plane matters at this grazing angle: tide 4.0 ft MLLW is
+0.357 m on the model's MSL axis (CO-OPS 9413450 datums MSL 1.893, MLLW
1.031 m), and a 0.36 m plane error moves every range by 2.4 %. Sensitivity to
eye height is linear: ±2 m is ±13 % on every metre number (table below).

Focal-length bracket rationale: the sitting lineup sits 212 px below the
horizon; a lineup 130 ± 25 m from the eye (OSM node offshore distance 107–
111 m plus a ~20 m brow setback) gives f ≈ 1800 px, and the ends of the
bracket are the widest and narrowest lenses a fixed surf cam plausibly runs.
A physical check narrows it from the other side: the observed crest speed
matches √(g h_b) for h_b = 1.5–2.3 m only at **f = 1300–1600**; at f = 2500
the crest would outrun the peel (c/Vp > 1), which no breaking wave does.

The cam's mount, from what is visible: on the path side of the fence, 5.3 m
above the brow ground, at a fence range of 0.0077·f m (14–19 m across the
bracket), with the fence receding to the right, so the heading has a
component up-point. That is consistent with a pole or upper-storey mount on
the 33rd–38th Avenue stretch; nothing in frame fixes which cross-street.

## Tracker

`scripts/track_peel_front.py`. The 2026-09-15 thresholded tracker failed by
joining the older foreground bore; threshold selection cannot establish
subject identity. This one keys on *becoming* white: a pixel counts only
while its luma has risen through 150 within the last 1.0 s (a 4-frame window
was tried first and the section spilling to the right of the head won the
pick). Rows 650–800 (the outer line; the inside bore at y > 800 is excluded by
design), 3 × 3 opening, connected components, and a continuity gate: the
component whose down-line (image-left) edge is nearest the previous front,
rejected if it jumps more than 60 px per frame (the gate widens by 15 px per
lost frame so the same head can be re-acquired). The front is the mean of
the component's leftmost 5 % of pixels. Each sequence is seeded with the
head's column at its first frame, read off a band strip.

Validity checks, per sequence:

| check | seqA 2–12 s | seqB 34–44 s |
|---|---|---|
| motion gate (0.1 s steps, half-res, rows 650–800) | median 2.55 grey levels, 94 % of steps > 1.5 | 2.16, 87 % |
| frames locked | 270 / 300 | 270 / 300 |
| fixed-fence null (rail-top ROI 1900–2250 × 940–1010 vs sequence median, response > 0.3 in 300/300) | p95 0.14 px; drift **0.007 / 0.008 px/s** | 0.14 px; −0.007 / 0.008 px/s |
| alongshore lag linearity (sep 10–90 px) | lag/sep r² = 0.93 | **0.997** |
| cross-shore lag linearity, window (sep 6–30 px) | r² = 0.97 | 0.99 |

The note's fence ROI (600–1100 × 1140–1240) is iceplant and path: phase
correlation response ~0.09 there, so it gates out and any drift it reports
is noise. The rail top is textured and static. The camera is fixed.

## Kinematics

Source pixels, 30 fps. "Stepwise" is the central difference over 1 s at each
locked frame; the peel is not uniform, so the single-line fit is reported
beside it, not instead of it.

| quantity | seqA 2–12 s | seqB 34–44 s |
|---|---|---|
| front x, line fit (Theil–Sen, 95 %) | −69.5 [−71.6, −67.1] px/s, r = −0.98 | −36.0 [−36.7, −35.1] px/s, r = −0.98 |
| front x, stepwise q1 / median / q3 | −82 / **−42** / −27 px/s (p10 −143: a section closing out 6.7–8.3 s) | −44 / **−36** / −31 px/s |
| front y, stepwise median | +4.5 px/s | +4.8 px/s |
| alongshore lag cross-correlation, median over separations | −100 px/s (driven by the section) | −44 px/s |
| crest cross-shore advance, window | 6.2 px/s | 7.0 px/s |
| crest cross-shore advance, full clip, rows 660–800, x 900–1650, 10 Hz | **6.06 px/s**, lag/sep r² = 0.92 (sep 6–40 px) | same |
| front median position | (1256, 734) | (1341, 727) |

Both fronts move image-left, the down-point direction in this camera, as
FIELD_WAVE_MOTION reported qualitatively. The 34–44 s crest is the clean one.

### In metres

Vp is the front's ground speed, |J·(vx, vy)| through the pose Jacobian at
the front's median pixel; c is the crest's cross-shore advance through the
range scale at row 730; α = asin(c/Vp). Stepwise medians unless stated.

| f (px) | H (m) | front range (m) | **Vp seqB** (q1–q3) | Vp seqA (q1–q3) | Vp lateral-only (lag), B / A | **c** | α seqB | α seqA |
|---|---|---|---|---|---|---|---|---|
| 1300 | 14.85 | 111 / 107 | **4.65** (4.6–4.9) | 6.6 (4.5–6.8) | 3.8 / 8.3 | **3.84** | **55°** | **36°** |
| 1800 | 12.85 | 134 / 129 | 4.68 (4.4–5.2) | 5.9 (4.5–7.6) | 3.3 / 7.2 | 4.57 | 73° | 49° |
| 1800 | 14.85 | 155 / 149 | **5.41** (5.1–6.0) | 6.8 (5.1–8.8) | 3.8 / 8.3 | **5.28** | **73°** | **49°** |
| 1800 | 16.85 | 175 / 169 | 6.14 (5.8–6.8) | 7.7 (5.8–10.0) | 4.3 / 9.4 | 5.99 | 73° | 49° |
| 2500 | 14.85 | 215 / 207 | 6.70 (5.8–7.7) | 6.8 (6.2–11.9) | 3.8 / 8.3 | 7.31 | c > Vp | 68° |

Reading it: the steady peel is **Vp = 4.7–6.7 m/s** across the bracket
(5.4 m/s at the central f), and the eye-height ±2 m band is ±0.7 m/s. The
seqA sequence carries a section that closes out at 8–12 m/s for 1.6 s and a
slow peel either side of it, which is why its IQR is wide. The crest speed
is **3.8–7.3 m/s** across the bracket, and only its short end is physical: a
1.2–1.5 m face breaking in 1.5–2.3 m of water travels at 3.8–4.7 m/s. Taken
at f = 1300–1600, the observed pair is Vp ≈ 4.7–5.1 m/s, c ≈ 3.8–4.7 m/s,
**α ≈ 55–67° (seqB), 36–43° (seqA)**: a mellow, makeable right, which is
what the riders in the clip are doing.

Error propagation for α: with c ∝ f and Vp's forward component ∝ f, c/Vp
rises from 0.82 (f 1300) to 0.95 (f 1800) to 1.06 (f 2500) on seqB, so α is
the number most exposed to the missing focal length; the ±2 m eye-height
band cancels in the ratio exactly (both scale with H).

## Model side

`scripts/compare_peel_speed.mjs`, headless, reading `bed.derivedPeelGeometry`
(peel-geometry.js: `alphaDeg`, `phaseSpeedMps` = c, `lineVelocityMps` = Vp,
the one definition the HUD and rider use). Second Peak stage, x ∈ [−290,
290] at 2 m, non-gap stations. Pre-registered forcing: T = 16 s, tide +0.357 m
MSL, H0 = 0.914 m (3 ft) directly, and de-shoaled from the 15 m MOP depth
(Ks = 1.072, H0 = 0.853 m). `swellDeg` is the preset's 41°, as `main.js`
passes it; the reported 202° SSW is not wired.

| H0 (m) | tide | bed | α median (IQR) | c (m/s) | Vp median (IQR) | depth at line | √(g h) | stations with 2° < α < 88° |
|---|---|---|---|---|---|---|---|---|
| 0.914 | +0.357 | measured + reef | **3.9° (0.5–12.0)** | 4.59 | **37.0 (21–95)** | 2.01 m | 4.44 | 84 % |
| 0.914 | +0.357 | plane | 6.0° (5.5–6.1) | 4.42 | 43.6 (41.5–46.6) | 2.01 | 4.44 | 90 % |
| 0.914 | +0.357 | measured, no reef | 3.9° (0.5–12.0) | 4.59 | 37.0 | 2.01 | 4.44 | 84 % |
| 0.853 | +0.357 | measured + reef | 3.9° (−0.4–12.2) | 4.47 | 34.3 (20–100) | 1.90 | 4.32 | 84 % |
| 0.853 | +0.357 | plane | 5.6° | 4.31 | 45.1 | 1.90 | 4.32 | 89 % |
| 1.4 (46042 a.m.) | +0.357 | measured + reef | 9.4° (3.8–13.2) | 5.02 | 27.6 (22–72) | 2.81 | 5.25 | 90 % |
| 1.4 | +0.357 | plane | 8.3° | 5.30 | 36.3 | 2.83 | 5.27 | 94 % |
| 0.914 | 0 | measured + reef | 3.7° (1.6–11.3) | 4.57 | 42.0 | 2.01 | 4.44 | 81 % |
| 1.4 | 0 | measured + reef | 10.9° (3.2–12.4); 24° near the node | 4.71 | 23.4; 6.8 near the node | 2.81 | 5.25 | 95 % |

The reef and no-reef rows are identical: at this H0 the reef fit is not on
the selected branch. The plane baseline is a closeout too.

### Observed vs model

| | observed (f 1300–1800, H 14.85) | model, pre-registered forcing | model, 1.4 m / tide 0 (diagnostic) |
|---|---|---|---|
| Vp | **4.7–5.4 m/s** steady; 8–12 m/s in a section | **37 m/s** (IQR 21–95) | 23–28 m/s; 6.8 near the node |
| c | **3.8–5.3 m/s** | **4.6 m/s** | 4.7–5.0 |
| α | **55–73° (B), 36–49° (A)** | **3.9°** (IQR 0.5–12) | 9–11°; 24° near the node |

## Reading it honestly

* **The crest speed is right.** Model c 4.3–4.6 m/s at a 2.0 m line depth
  sits inside the observed 3.8–5.3 m/s, and at the physical end of the
  focal bracket the match is within 10 %. The break criterion puts the line
  in water of the right depth.
* **The peel is wrong, by an order of magnitude, on every bed.** The model
  says Second Peak closes out on this day (α ≈ 4°, the break point outrunning
  the crest at 37 m/s); the cam shows two crests peeling at 5 m/s with a
  head that a rider follows for ten seconds. This is the "model right on
  locus, wrong on peel" row of VALIDATION_PLAN: the direction machinery, not
  the criterion.
* **The plane is no better and no worse.** Reef, no reef and plane all
  close out, so on this day the fitted reef earns nothing; the 41° authored
  α is a declaration the geometry does not produce at this forcing.
* **The floor is the mechanism, and the field contradicts it.**
  `PEEL_FLOOR.secondpeak` says the peel dies below H0 1.11 m and above tide
  +0.01 m. This day was 0.91 m and +0.36 m, and it peeled. The diagnostic
  arms say which threshold is the tighter: at 1.4 m the model still closes
  out at this tide (9°), and only at 1.4 m *and* tide 0 does the line near
  the node reach 24°. So the model's tide sensitivity of the Second Peak peel
  has the wrong size or the wrong sign, before H0 is even in question. That
  is a stronger statement than the floor note's "genuine discontinuity":
  the discontinuity is on the wrong side of a day that was observed.
* **Which H0 to use does not change the verdict.** Reported, de-shoaled and
  the morning's buoy value all close out at this tide.
* **What the pose does and does not carry.** Vp's lateral part (3.3–4.3 m/s)
  is focal-length-free and eye-height-linear; even that alone is 5–10× below
  the model. No choice of f in a 2× bracket, or of H in a ±2 m band, moves
  the observed Vp into the model's range. The residual does not depend on
  the unsolved pose.

Model-side numbers are on the NCEI 2012 interpolant (VALIDATION_PLAN 2026-
09-01 status): no surveyed bed exists under this break, so "the model" here
is the model on that bed.

## What would falsify this

* A control-point solve (a capture of the same cam with the 38th Avenue
  stair head, the riprap or the lookout wall in frame, or Surfline's own
  lens metadata) giving f > 2500 px would put c above Vp and mean the
  cross-shore number is the bore, not the crest — the α column would go, but
  the lateral Vp (3.3–4.3 m/s) and the order-of-magnitude gap would not.
* An eye height outside 12–17 m from a better vertical reference (a rider
  standing tall, a measured fence) would scale every m/s number linearly; a
  factor of 7 is needed to reach the model and no plausible mount gives it.
* A second crest tracked in the 44–60 s tail, or the 11–13.6 s local-birth
  patch, reading Vp > 15 m/s would mean the two clean sequences were the
  slow exception, not the rule.
* The model peeling at 5 m/s with α ≈ 50–70° on a `#day` built from this
  forcing would mean the headless bake and the browser bake disagree (the
  bake is imported, not twinned, so that would be a real bug).
* A CO-OPS verified water level for 15:28 PDT far from 4.0 ft MLLW would
  move the model's tide arm; the reported value is the page's prediction,
  not the gauge.

## Reproduction

From the repository root, Python 3 with cv2, numpy, scipy, matplotlib; Node 26.

```sh
# 1. verify and stage the clip (never modify the original; qa/ is ignored)
shasum -a 256 '/Volumes/andyed/Movies/desktop-captures-2026-09/pointbreak-pleasure-point-2026-08-15-1528-unique-clean.mp4'
#   11428e3fa283bea0834c724c7a6c79d6bb6b506ae9e0885525d43ee08e962695
mkdir -p qa/surfline-cam-2026-09-23
cp '/Volumes/andyed/Movies/desktop-captures-2026-09/pointbreak-pleasure-point-2026-08-15-1528-unique-clean.mp4' qa/surfline-cam-2026-09-23/field-clean.mp4

# 2. track the two fronts (px/s, validity checks) -> peel_kinematics_px.json
python3 scripts/track_peel_front.py qa/surfline-cam-2026-09-23/field-clean.mp4

# 3. model at the pre-registered forcing -> model_peel_2026-08-15.json
node scripts/compare_peel_speed.mjs

# 4. pose, conversion, figure -> cam_pose.json, control_points.json, peel_speed_overlay.png
MPLCONFIGDIR=/tmp/pointbreak-mpl python3 scripts/solve_cam_pose.py \
  --clip qa/surfline-cam-2026-09-23/field-clean.mp4 \
  --kin docs/research/assets/surfline-cam-2026-09-23/peel_kinematics_px.json \
  --model docs/research/assets/surfline-cam-2026-09-23/model_peel_2026-08-15.json
```

Both Python scripts refuse any clip but the reference hash. The tracker
writes per-15-frame debug overlays into `qa/`, which stay private (people
at scale). The committed figure is drawn on the median frame, which has no
people in it. The optional step-5 render at the solved pose was not made:
there is no solved heading or stage position to render from.

Durable: this note, the three scripts, and
`docs/research/assets/surfline-cam-2026-09-23/` (control points, pose,
kinematics, model arms, one figure). No video, no frames, no TODO or MODEL.md
edits.
