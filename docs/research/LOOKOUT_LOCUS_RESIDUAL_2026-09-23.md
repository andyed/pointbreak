# The first break-locus residual — Lookout pose, 2026-09-05 (measured 2026-09-23)

VALIDATION_PLAN asked for one thing before more shader work: with the day's
conditions fixed *before* comparison, put the model's breaking locus beside a
camera observation and subtract. The 2026-09-05 fixture supplied both halves —
pre-registered forcing (SC116 Hs 0.902 m, Tp 16.67 s, Dp 188.5°; verified
tide +0.316 m MSL at 9413450) and a photograph whose pose is solved
(`#cam=lookout`, SCALE_AND_BROW §0) — and nobody had subtracted. This does.

**Finding.** Driven by the day's significant height, the model breaks the wave
at Jack's 62–91 m *inside* the photographed breaking wave that carried the
riders and 195–222 m inside the next wave of the set, on all three beds; the
synthetic reef is 20–30 m closer to the observation than the plane or the
measured bed at every feature, which is real but a quarter of the miss. The
inner miss is explained by the photograph sampling set waves — at 1.3–1.5×Hs
the shipped bed puts the line on the riders' wave — while the outer wave needs
a 2.1–2.3 m deep-water wave on the DEM's 4.0–4.2 m of depth, which no
statistic of a 0.9 m sea supplies, so that residual belongs to the bed under
the surf zone, exactly where BATHY_SOURCES §7 says no grid has a sounding.
Found on the way: every `#cam=` render is the horizontal mirror of the site
(three.js embeds the right-handed stage as a left-handed world), and Second
Peak is not in this frame at all.

Instruments: `scripts/measure_lookout_locus.py` (photograph → ranges → residual
and figures), `scripts/measure_lookout_line.mjs` (bake → projected line),
`scripts/capture_lookout_locus.mjs` (the four renders). Assets in
`docs/research/assets/lookout-locus-2026-09-23/`.

## 0. The pose checks itself, and one term it leaves out

Re-derived, not copied. Pinhole focal length from the 31.4° vertical field at
960 px: f = 480 / tan(15.7°) = **1707.7 px**, which gives 41.09° across 1280 —
the manifest's 41.1°. The level row forward from the 5.59° pitch is
480 − f·tan(5.59°) = **312.9**; the photograph's sky/sea luma step is at
**row 313** (strongest row gradient over columns 0–1000, −18.8 levels). The
eye is bed.js `bedElevAt` at the station + 1.55 m = **13.28 m MSL** (the app's
own number; SCALE_AND_BROW rounded it to 13.0), **12.96 m over the water** at
+0.316 m tide. The app's camera lands at (153.3, 13.3, 89.2) in the 38th
frame, which is the station the projection here uses.

Range on the water plane from a pixel: forward, right and up axes in ENU, ray
= F + a·R − b·U with a, b the pixel offsets over f, intersect the plane at
−12.96 m, take the horizontal distance. Uncertainty carried per point:

* eye ±0.75 m (the GPS-minus-DEM residual) → ±5.8 % of range;
* horizon ±1 px → ±0.034° of depression: ±1.2 % at 250 m, ±2 % at 400 m;
* **feature height.** The projection assumes the feature is on the plane. A
  breaking crest ~1.0 m over still water projects h/tan(δ) too far: 19 m per
  metre at 3° (the riders' wave), 34 m per metre at 1.7° (the outer wave).
  Applied as 1.0 m for crests and foam tops, 0.5 m for a rider, 0 for a
  sitting surfer; a ±0.5 m error is ±10 m on wave A, ±16 m on wave B.
* **the sea-horizon dip**, which the solved pose does not include: at 12.96 m
  the visible horizon lies 0.108° (3.2 px) below true level, so a pitch solved
  by putting *level* on row 313 is 0.108° too shallow and every range is a few
  per cent long (−4 % at 270 m, −6 % at 400 m). Reported as a separate column;
  `#cam=lookout` should probably absorb it, but that is a pose change and is
  not made here.

## 1. Observation — what the photograph puts where

`cliff-cam-reference.jpg`, 1280 × 960 derivative. Two waves of one set are
breaking in frame, both from the right (up-point) edge leftward, each with a
clean green face ahead of its whitewater; ~30 surfers sit *inside* both.
Whitewater edges are automatic (luma > 195, saturation < 60, ROI rows
340–520, per-column seaward-most row, bands split at row 392, columns
1100–1280; the ROI excludes cloud above and glitter below, which share foam's
signature). Everything else is manual, from 2× crops with a 20 px grid
(`locus-annotations.json`; `--crops` regenerates them).

| feature | rows | h | range m (plane) | height-corrected | envelope lo–hi | dip-corr. | stage x, z (38th) | DEM depth m | H0 needed m |
|---|---|---|---|---|---|---|---|---|---|
| (a) whitewater seaward edge, wave A (riders' wave) | 392–396 | 1.0 | 295 | **272** | 239–297 | 262 | −89, −35 | 2.78 | 1.36 |
| (a) whitewater seaward edge, wave B (outer) | 363–375 | 1.0 | 439 | **405** | 320–466 | 382 | −205, −96 | 3.98 | 2.12 |
| (b) crest of wave A, cols 100–1050 | 398–445 | 1.0 | 224 | 207 | 152–259 | 200 | 10, −56 | 2.25 | 1.05 |
| (b) the two riders | 407–410 | 0.5 | 236 | 227 | 207–248 | 219 | −31, −43 | 2.11 | 0.96 |
| (b) peel head, wave A | 403 | 1.0 | 254 | 234 | 218–250 | 226 | −46, −33 | 2.25 | 1.05 |
| (d) crest of wave B, cols 700–1130 | 369–377 | 1.0 | 386 | 356 | 297–410 | 338 | −140, −114 | 4.18 | 2.26 |
| (d) peel head, wave B | 367 | 1.0 | 428 | 395 | 365–426 | 373 | −192, −102 | 4.10 | 2.21 |
| (c) sitting lineup, 17 marks, cols 118–1090 | 447–478 | 0 | **156** | 156 | 126–184 | 153 | 50, −23 | 2.01 | 0.91 |
| outer dark band (kelp or wind shadow; not a break) | 335–340 | 0 | 925 | — | 797–1193 | 815 | −501, −564 | 11.4 | — |
| inshore foam and glitter (no crest; not a break) | 560–720 | — | 54–95 | — | — | — | — | — | — |

Stage is the 38th frame, +x down-coast, +z landward, origin the OSM node; the
DEM columns are the shipped bed at that stage point, and "H0 needed" is
γh / Ks(h) from `dispersion.js` — the deep-water height the criterion would
need to break there. SCALE_AND_BROW §0's eyeballed bands (lineup 150–250,
riders' wave 210–280, outer line 300–500) hold; the numbers here are tighter
and carry their error.

Two things the table says before any model is consulted. The surfers sit at
156 m, and the significant wave (0.91 m) would break, by the DEM, right where
they sit; the waves they are waiting for break 80–250 m outside them. And the
photographed locus is not a line but a band — two waves one period apart broke
130 m apart in range, which is what a set does on a sloping bed.

## 2. Model — the baked line, seen from the same eye

`bakeBreakLine` at Jack's over [−300, 300] m, T 16.67 s, tide +0.316, three
beds (`bedShape` 0 reef / 1 plane / 2 measured), no smoothing and no peel
constraint (both flags off in the app), read back with `breakZAt` and
`breakGapAt` at the 128 texels, projected with the same pose. The browser's
`lineProbe()` at the same state agrees with this bake to **≤ 7 mm** on all three
beds (captures.json vs model-lines.json), so the render draws the line reported.

**What the app does with this day.** `peelFloorH0('jacks', {T: 16.67, tideM:
0.316})` is **null** on two grounds at once — T is off the 13 s basis and the
tide is above the [−0.862, 0] band — as FIELD_CAPTURE §2 predicted, and the
same at every spot. Via `#day=live` the raw 0.902 m passes through; the
off-basis *disclosure* fires only where the request is under the spot's tide-0
floor, so it is silent at Jack's (floor 0.78) and would show at Second Peak
(floor 1.11). Via `#h0=` (what the captures use) nothing is routed through the
floor at all: `peelClamp()` is null. Reef activation at this T and tide is
0.70 m at Jack's, so the wedge is nominally in play on every arm.

H0 arms: **raw** = Hs 0.902 as the app uses it; **deshoal15/12** = Hs / Ks at
the −15 m MOP point (Ks 1.089 → 0.828 m) and at 12 m (1.140 → 0.791 m);
**set1.27 / set1.53** = Rayleigh H_1/10 and the expected maximum of ~100 waves
(1.146, 1.380 m), because a photograph of breaking waves samples the set, not
the significant height.

| H0 arm | bed | H0 m | in-frame stations | range at col 900 | range at col 1150 | stage z at wave-A columns |
|---|---|---|---|---|---|---|
| raw | reef | 0.90 | 30 | 213 | 210 | −6 |
| raw | plane | 0.90 | 33 | 140 | 179 | +4 |
| raw | measured | 0.90 | 32 | 133 | 172 | +7 |
| deshoal15 | reef | 0.83 | 28 | 117 | 152 | +17 |
| deshoal15 | plane | 0.83 | 30 | 128 | 163 | +12 |
| deshoal15 | measured | 0.83 | 28 | 117 | 151 | +17 |
| deshoal12 | reef | 0.79 | 25 | 110 | 140 | +23 |
| deshoal12 | plane | 0.79 | 28 | 122 | 155 | +16 |
| deshoal12 | measured | 0.79 | 25 | 110 | 140 | +23 |
| set1.27 | reef | 1.15 | 38 | — | — | (branch not in these columns) |
| set1.27 | plane | 1.15 | 43 | 181 | 233 | −22 |
| set1.27 | measured | 1.15 | 45 | 182 | 239 | −25 |
| set1.53 | reef | 1.38 | 50 | 328 | 316 | −59 |
| set1.53 | plane | 1.38 | 54 | 221 | 286 | −47 |
| set1.53 | measured | 1.38 | 59 | 226 | 298 | −54 |

Column 900 is the riders; column 1150 is the middle of both whitewater bands.
The model's takeoff — the up-point end of the stage window, x = −156.7 — sits
at 320–343 m and **projects out of frame to the right on every arm** (column
1378–1648). So does the photographed takeoff: both waves' whitewater runs to
the right edge of the frame. The frame does not contain either takeoff; only
the direction agrees.

**Second Peak** (the task said it is in frame; the manifest says
`spots_in_frame: ["38th"]`): at Hs none of its 128 stations projects into the
frame on any bed; at the set arms 1–32 stations enter at the right edge, at
187–240 m — still 170–220 m inside wave B, which by stage geometry is breaking
92 m down-coast and 60 m seaward of Second Peak's node. The manifest is right;
no Second Peak residual is claimed.

## 3. Residual — model minus photograph, at the photograph's own columns

Metres along the ground ray at each photo point's column (negative = the model
breaks *inside* the photographed feature), median over the feature's points;
Δz in stage metres (+ = model shoreward); Δrow in px (+ = model lower in
frame). Photo positions are height-corrected. deshoal12 is 6–13 m worse than
deshoal15 everywhere and is in `residual.json`.

| H0 arm | bed | wave A whitewater edge Δrange / Δz / Δrow | wave B whitewater edge | wave A crest | wave B crest | lineup |
|---|---|---|---|---|---|---|
| raw 0.90 | reef | **−62** / 29 / 32 | **−195** / 88 / 58 | −77 / 60 / 79 | −144 / 81 / 48 | −29 / 21 / 32 |
| raw 0.90 | plane | −84 / 39 / 46 | −217 / 99 / 72 | −82 / 64 / 98 | −207 / 119 / 95 | −42 / 30 / 52 |
| raw 0.90 | measured | −91 / 42 / 50 | −222 / 102 / 77 | −89 / 69 / 111 | −214 / 124 / 103 | −50 / 36 / 66 |
| deshoal15 0.83 | reef | −112 / 52 / 68 | −245 / 112 / 94 | −101 / 77 / 136 | −231 / 133 / 124 | −61 / 44 / 91 |
| deshoal15 0.83 | plane | −101 / 47 / 58 | −233 / 107 / 85 | −93 / 71 / 116 | −221 / 127 / 110 | −52 / 38 / 71 |
| deshoal15 0.83 | measured | −113 / 52 / 68 | −245 / 113 / 95 | −101 / 77 / 136 | −231 / 133 / 124 | −61 / 44 / 91 |
| set1.27 1.15 | reef | — | — | −32 / 26 / 38 | — | −3 / 3 / 3 |
| set1.27 1.15 | plane | −29 / 13 / 17 | −160 / 73 / 43 | −51 / 42 / 55 | −164 / 95 / 60 | −10 / 7 / 9 |
| set1.27 1.15 | measured | −23 / 10 / 14 | −153 / 71 / 41 | −58 / 48 / 60 | −165 / 94 / 60 | −14 / 10 / 14 |
| set1.53 1.38 | reef | +49 / −24 / −6 | −78 / 37 / 19 | +87 / −47 / −17 | −31 / 17 / 12 | +157 / −100 / −69 |
| set1.53 1.38 | plane | +27 / −12 / −1 | −106 / 48 / 25 | −25 / 21 / 27 | −125 / 71 / 39 | +21 / −15 / −17 |
| set1.53 1.38 | measured | +41 / −19 / −5 | −90 / 42 / 22 | −33 / 24 / 30 | −119 / 68 / 37 | +20 / −14 / −16 |

The photo's own envelope at wave A is ±29 m (pose) ± 10 m (height); at wave B
±73 m ± 16 m. A dash means the arm's line does not cross those columns without
a gap: at 1.15 m the reef arm's anchored branch flips (MODEL 4.6's knife-edge)
and the in-frame stretch moves elsewhere in the frame.

Lineup versus takeoff: the model's takeoff is out of frame (§2). The
comparison that *is* in frame is the line against the sitting cluster: at Hs
the line runs 29–50 m **inside** the surfers on every bed; at H_1/10 it runs
through them (−3 to −14 m); at 1.53×Hs it is 20 m outside them on the plane
and measured beds and jumps 157 m outside on the reef branch. Surfers sit just
outside where the waves they want break; the Hs-driven model puts the break
inside them.

## 4. Reading it honestly (VALIDATION_PLAN)

* **Model vs baselines on locus.** At Hs the reef is closer to the observation
  than the plane by 20–22 m at wave A and 22 m at wave B, and than the measured
  bed by 27–29 m; the ordering holds at every feature. That is the "reef is
  doing real work" outcome, on the NCEI 2012 interpolant, as the plan says to
  phrase it — but it is 25–30 % of a 62–222 m miss shared by all three beds.
  The residual is not owned by reef *shape*. It is owned by something common
  to the arms: the depth scale of the bed and/or the height the criterion is
  driven with.
* **Wave A is a forcing-statistics miss, not a bed miss.** The riders' wave
  breaks where the shipped DEM needs 1.36 m of deep-water wave (2.78 m of
  water). 1.36 m is H_1/10–H_max of a 0.9 m sea; the set1.27 and set1.53 arms
  bracket it (−23…−29 m and +27…+49 m). A photograph of a breaking wave is a
  photograph of a set wave, and the line the app draws is the *significant*
  wave's. This is a design question, not a bug: which wave should the drawn
  locus represent? The lineup position says the surfers' answer.
* **Wave B is a bed miss.** It breaks where the DEM holds 3.98–4.18 m and
  would need a 2.1–2.3 m deep-water wave; the Rayleigh probability of H > 2.3
  Hs is ~2×10⁻⁵ per wave, so no 0.9 m sea produces it, and even +30 % on the
  nowcast Hs does not reach it. Either the DEM is ≥ 1.6 m too deep 100 m
  seaward of the node — a 1.4 m set wave needs ≤ 2.4 m of water — or the
  wave broke on a shallow feature the interpolant does not draw. Both are
  the BATHY_SOURCES §7 gap (408–651 m of GMT `surface` interpolation under
  every canon spot), seen for the first time from the water side.
* **De-shoaling makes every arm worse** (by 40–50 m). If SC116's Hs is
  already a nearshore height, treating it as deep water over-predicts
  shoaling and should push the line *out*, not in — so the direction of this
  correction argues that the H0 the model needs is larger than Hs, not
  smaller, which is the set-wave reading again.
* **Peel direction** is not judged: a still cannot support a claim about
  motion (LESSONS 1). The plan's "locus right, peel wrong" branch is untested.
* **Everything wrong at one spot only?** Only one spot is in frame. Two spots
  is the next fixture (§6).

## 5. What would falsify this, and what was checked

* *The whitewater edge is an inner reform, not the outer break.* Both
  whitewater bands end leftward in an unbroken green face — wave A's with two
  riders on it — which a reformed bore does not have. The only reform
  candidate is the inshore foam and glitter field at 54–95 m, annotated and
  excluded. If wave A were a reform of wave B, the model's Hs line (210 m)
  would still be 60 m inside it.
* *Feature height.* At wave A's depression (2.7°) a metre of feature height
  is 21 m of range, at wave B's (1.8°) it is 31 m. The wave-A residual (62 m,
  reef, Hs) is inside the ±29 m pose envelope only if the foam top sat
  > 2.6 m above still water, which a 0.9 m Hs sea does not do. Wave B's
  195 m would need about 5 m. Height does not rescue either.
* *Pose.* Eye ±0.75 m and horizon ±1 px together move wave A by ±29 m and
  wave B by ±73 m; the dip correction shortens both (−10, −23 m) and so
  *reduces* the residual slightly. The bearing is magnetometer-grade (a few
  degrees) and moves features along the crest, not across it; the residual
  is taken at each feature's own column, so a bearing error changes which
  stage x is compared, not the range.
* *The bake is not what the app draws.* Checked: browser `lineProbe` vs this
  bake ≤ 7 mm on three beds (LESSONS 4).
* *The forcing.* SC116 10:00 nowcast, 74 min before the frame, on a slowly
  building swell (FIELD_CAPTURE §1). A 20 % Hs error moves the Hs line by
  ~20 m and does not change the reading; a factor 2.3 would, and is not
  plausible for a MOP nowcast.
* *Rider height, lens distortion, rolling shutter* — second-order at 1280 px
  and 48 mm equivalent; not modelled.

What would overturn the wave-B conclusion is a sounding: 2–2.5 m of water at
stage (−205, −96) would say the criterion, not the bed, is wrong there. That
is the USGS OFR 2007-1270 request, or a tide-exposure timelapse on a minus
tide (FIELD_CAPTURE §5).

## 6. Side findings

**Every render is mirrored.** The stage frame (along, shore, up) is a rotation
of ENU and right-handed; the renderer places it as three.js (x = along,
y = up, z = shore), which is left-handed. Checked three ways: three.js's
`lookAt` right vector is (−f_z, 0, f_x) where the physical right is
(f_z, −f_x); a three.js `PerspectiveCamera` set up exactly as `lookoutTarget()`
projects a shoreline point to column 1280 − (this projection's column), rows
identical (2095 ↔ −815, 633 ↔ 646); and the `#cam=lookout` capture puts the
land in the bottom-left (sand-coloured pixels' median column 52) where the
photograph and the ENU projection put it bottom-right. SCALE_AND_BROW §3's
"land fills the bottom-left quarter" was this. Consequences: a `#cam=lookout`
capture must be flipped horizontally before it is laid on the photograph
(`render-overlay.jpg` is flipped and says so), and the peel the app draws
toward +x reads on screen as a *left* from the cliff, since a mirror swaps
handedness. Not fixed here — it is a one-line sign convention with every
camera, the rider, the audio pan and the drone framing downstream of it, and
it belongs to a deliberate change with its own A/B.

**The render's horizon is the mesh edge.** The `#cam=lookout` capture's sea/sky
boundary is at row 340, not 313: the ocean grid ends ~1 km out (depression
0.74°) and fog colour fills the 27 rows above it. Not a pitch error — the
camera is at the right station and pitch — but a cliff camera that shows
the horizon 27 px low against the photograph it replays.

**Second Peak is not in this frame** (§2). The one-frame residual is a
Jack's residual.

## 7. Reproduction

```
node scripts/measure_lookout_line.mjs                # pose from manifest + main.js; bake; -> model-lines.json
python3 scripts/measure_lookout_locus.py             # horizon check, whitewater, annotations, residual, photo-overlay.jpg
python3 scripts/serve.py 8232 &                      # renders, one frozen frame per bed arm
PLAYWRIGHT_DIR=.../playwright/index.mjs node scripts/capture_lookout_locus.mjs --out=/tmp/lookout
pkill -f "serve.py 8232"
python3 scripts/measure_lookout_locus.py --renders reef=/tmp/lookout/lookout_jacks_reef.png,plane=/tmp/lookout/lookout_jacks_plane.png,measured=/tmp/lookout/lookout_jacks_measured.png
python3 scripts/measure_lookout_locus.py --crops /tmp/crops   # the 2x annotation crops
```

Outputs in `docs/research/assets/lookout-locus-2026-09-23/`: `model-lines.json`
(pose, arms, every in-frame station, the per-pixel DEM depth grid),
`locus-measured.json`, `residual.json`, `locus-annotations.json`,
`photo-overlay.jpg` (the figure), `render-overlay.jpg` (three flipped renders
with the same overlay). The fixture photograph is referenced, not copied.
