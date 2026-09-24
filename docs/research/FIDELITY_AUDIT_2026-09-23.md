# Fidelity audit against the available truth data — 2026-09-23

Seven tracks run in parallel worktrees, each with its own instrument and
research note; this note is the index and the cross-track reading. Base
commit `a863e58` (the opt-in classic/descent experiments, committed the same
evening so every track forked from one state). Nothing shipped changes in
this audit: every finding is a measurement, every proposal is behind a flag
or a protocol rule, and MODEL.md carries two wording corrections only.

## Finding

The physics core is right and invisible; the picture's fidelity is decided
by three authored quantities the truth data now contradicts. (1) **Peel.**
The one field day with kinematics (2026-08-15, Second Peak) peels at
4.7–6.7 m/s and α 55–73° while the model closes out at every bed (α 3.9°,
Vp 37 m/s) — because the day is above the measured tide band and below the
peel floor, i.e. the §4.6 floor/band is the wrong threshold, not the break
criterion (crest speed agrees to 10 %). (2) **Break locus.** Four Sentinel-2
frames retire the plane bed at the apex and confirm the fitted reef there,
but no frame supports the down-point reef (38th → Private's, seaward of the
foam by 40–155 m in 10/16 cells); the Lookout photograph puts the drawn
significant-wave line 62–91 m inside the set wave the surfers ride, on every
bed. (3) **Breaker type and face.** The bed at every line says spilling
(ξ₀ 0.11–0.44) while the authored ξ draws plunging at five spots, and the
physical front face is 10–15° against Carini's 22–30° with ~1° of budget
left in the phase map. Forcing is a second-order but systematic error:
`#day=live` shoals SC116's Hs twice (+5 to +10 % at 15–17 s) and both field
days ran 0.13–0.18 m above predicted tide. The only soundings under this
coast (OFR 2007-1270 Fig. 9) stop 110–220 m short of the break but already
show the CUDEM sheet 1.1–2.3 m too shallow from 38th to Shark's, and the
Sentinel-2 residual on CUDEM does not rescue the down-point reef. One side
finding, if it verifies (T8): every render is the horizontal mirror of the
site, so the +x peel reads as a left-hander on screen.

## The truth data, and what each piece can and cannot check

| source | what it is | resolves | checks in this audit |
|---|---|---|---|
| CDIP MOP SC116 hindcast/nowcast | hourly model forcing at the 15.03 m site ~150 m off the break, 2000–present | Hs, Tp (band-quantised), Dp, spectra | forcing (T2); day hashes for T3, T5, T6 |
| NOAA CO-OPS 9413450 | verified water level, published datums | tide on the model's MSL axis | datum chain (T2); observed-vs-predicted residual on both field days |
| NCEI 1/3" 2012 DEM, CUDEM 1/9", CSMP 2 m | interpolants; **no soundings under the break** (BATHY_SOURCES §7) | the bed the line is baked on | T1 (slope at the line), T4 (vs the report's soundings) |
| 2026-09-05 Lookout fixture | 11 stills, solved pose (`#cam=lookout`), pre-registered forcing | breaking-locus range on the water plane | T3 |
| 2026-08-15 Surfline clip | 60.8 s fixed-cam, hash-verified, 16 s carrier measured | peel kinematics in px/s; m/s if the pose solves | T6 |
| USGS OFR 2007-1270 | the only surveyed bed and timex breaking positions here; data not released | soundings, mean breaking position, AWAC forcing | T4 |
| Sentinel-2 L2A | 10 m/px, georeferenced, ~5-day revisit | whitewater locus with no camera registration | T5 |
| textbook / empirical relations | Komar & Gaughan, Weggel, Walker/Hutt, Carini, Guza & Thornton | the physics core's own claims | T1 |

## T1 — Physics core vs empirical relations (`PHYSICS_CORE_AUDIT_2026-09-23.md`)

The physics core is internally sound and its textbook residuals are invisible
in the picture: Ks matches exact linear theory to 0.3 %, neither clamp nor
`growSyn` is reachable at any shipped line, Hb is 6–12 % under Komar &
Gaughan (their 0.56 encodes γ ≈ 1.43), and γ = 0.78 sits at the low end of
Weggel's 0.82–1.07 on the local slopes — a line 2–19 m seaward of Weggel's,
inside the bed's own 22–70 m crossing uncertainty.

What a surfer would see is **authorship against the bed**:

- **Breaker type.** The bed at the line classifies every card state as
  spilling (ξ₀ 0.11–0.44); the authored ξ says plunging at five of seven
  spots, and `u_xi` is what draws the lip. Authored ξ is 1.4–3.1× what the
  bed supports.
- **Face angle.** Physical front face 10–15° (closed form) / 10–15° (GPU)
  vs Carini's 22° spilling / 30° plunging. The phase map's whole remaining
  budget is worth ~1°: an even monotone map steepens the front by at most
  `1 + s`, and carrier steepness Hb/L = 0.025–0.034 binds.
- **Peel angle is met at one depth only.** The bake's own α clears Walker's
  30° inside a spot-specific H0 window (Sewers 1.65–2.42 m, Hook 1.20–1.65,
  Sharks 0.95–1.05, Jack's 0.88–≥1.54, First Peak 1.44–≥2.52; Second Peak and
  Privates never), because the *line* bearing slides 35.8° → 7.7° as the line
  walks seaward off the wedge's oblique band while the crest bearing holds
  within 2°. GAME_PROJECTION C3(1) ("run the spots nearer their ceiling is
  free") is therefore not free at Sewers, Hook and Sharks.
- **Setup** 0.3·H0 is 1.76× Guza & Thornton, inside the Longuet-Higgins/Bowen
  band.

Two documentation errors corrected in `e51ff93`: the shoaling is the full
linear Ks (not Green's law), and the skew map steepens the front by at most
1+s with h(x) single-valued for any s (not "vertical face / multivalued").

## T2 — Forcing (`FORCING_AUDIT_2026-09-23.md`)

**The model shoals SC116's Hs twice.** `u_H0` is declared deep-water and
re-shoaled from `cg₀ = gT/4π`, but MOP's Hs is already at the 15.03 m site
(`metaWaterDepth`). `#day=live` over-forces by `Ks(15.03; T) − 1`: −2.7 % at
12 s, +4.6 % at 15 s, +9.8 % at 17 s. The month table meant to divide this out
but used a shallow-water Ks (0.9759) the shader stopped using on 2026-08-26,
so it is high too (+2 to +7 % at card periods). No tide-0 floor verdict flips
under correction (0 of 72 month pairs).

**Every tide constant reproduces CO-OPS 9413450 to the millimetre.** The
larger error on both field days is the unmodelled non-tidal residual:
Monterey water stood +0.127 m (08-15) and +0.176 m (09-05) above the
predictions the pre-registration used — worth 0.08–0.10 m of H0 on the tide
axis, the same size as the whole Ks correction.

Card quantiles at SC116 (2000–2024): Sewers 2.2 m/15 s is a top-1 % hour
(p99.0 all-year, p96.5 DJF); Privates 0.7/12 is p67.5. Authored `dF` sits
below the spectra's 0.010 Hz resolution floor (swell-band bridge 81–122 s vs
card 125–167 s: neither contradicted nor supported); the envelope floor 0.15
sits inside the nowcast bracket 0.061–0.208. Direction: 8.4 % of Hs > 1 m
hours fall outside 188–216°; `metaShoreNormal` is 136.46°.

Reproducible day hashes (observed Monterey tide, MSL axis):

```
2026-08-15 15:28 PDT  SC116 0.778 m / 16.67 s / 187.5°; tide obs +0.50 (pred +0.37)
  as shipped   #preset=secondpeak&day=overhead&h0=0.778&tide=0.50
  de-shoaled   #preset=secondpeak&day=overhead&h0=0.726&tide=0.50
2026-09-05 11:12 PDT  SC116 0.910 m / 16.67 s / 189.4°; tide obs +0.32 (pred +0.14)
  as shipped   #preset=secondpeak&day=big&h0=0.910&tide=0.32
  de-shoaled   #preset=secondpeak&day=big&h0=0.829&tide=0.32
```

Proposed, not wired: `#deshoal=1` (design in FORCING_AUDIT §7.2; a pure
`scripts/lib/deshoal.mjs` twin and `tests/deshoal.test.js` ship), a `#T=`
parameter (period is band-quantised and rides on `day=`), and the protocol
rule that every same-hour comparison uses the *observed* water level.

## T3 — Break locus at the Lookout pose (`LOOKOUT_LOCUS_RESIDUAL_2026-09-23.md`)

The first break-locus residual on a real day with a solved pose. Driven by
the day's Hs (0.902 m, Tp 16.67 s, observed tide +0.316 m), the model breaks
Jack's **62–91 m inside the photographed wave carrying the riders** and
195–222 m inside the next wave of the set, on all three beds. The synthetic
reef is 20–30 m closer to the observation than the plane or the measured bed
at every feature (reef −62 / plane −84 / measured −91 m at wave A), so by
VALIDATION_PLAN's reading "the reef is doing real work, on the NCEI 2012
interpolant" — but the miss the three beds share is not reef shape.

| H0 arm | bed | wave A edge | wave B edge | lineup |
|---|---|---|---|---|
| Hs 0.90 | reef / plane / measured | −62 / −84 / −91 | −195 / −217 / −222 | −29 / −42 / −50 |
| de-shoaled 0.83 | reef / plane / measured | −112 / −101 / −113 | −245 / −233 / −245 | −61 / −52 / −61 |
| 1.27·Hs | plane / measured | −29 / −23 | −160 / −153 | −10 / −14 |
| 1.53·Hs | reef / plane / measured | +49 / +27 / +41 | −78 / −106 / −90 | +157 / +21 / +20 |

(model − photo, metres along the ground ray; negative = model inside;
photo envelope ±29 m at wave A, ±73 m at wave B.)

Two readings, both recorded: (1) the inner miss is a **forcing-statistics
miss** — the photograph samples *set* waves, and at 1.3–1.5×Hs (Rayleigh
H_1/10 to E[Hmax]) the shipped bed lands on the riders' wave; (2) the outer
wave breaks where the DEM holds 4.0–4.2 m and would need a 2.1–2.3 m
deep-water wave, so that residual belongs to the interpolant under the surf
zone (BATHY_SOURCES §7, seen from the water side). De-shoaling (T2) makes
every arm worse on this day, which is consistent with (1): the drawn line is
the significant wave's, and surfers sit outside it. The lineup is 29–50 m
*outside* the Hs line.

Side findings: **every `#cam=` render is the horizontal mirror of the site**
(land bottom-left in the render, bottom-right in the photograph; three
independent checks in §6 of the note; confirmed by T8 below); the
render's horizon is the mesh edge, 27 px low; Second Peak is not in the frame,
so this is a Jack's residual; `#h0=` bypasses the peel floor entirely.

## T4 — USGS OFR 2007-1270 (`OFR_2007_1270_EVIDENCE_2026-09-23.md`)

The public PDF (29 pp, hash in the note) prints **no breaking position, no
profile and no depth table**. Its one quantitative bathymetry is Fig. 9, a
colour-coded swath map; georeferenced from its graticule (5.28 m/px, 0.2 px
tick residual) and colour-inverted through the legend (calibrated on the
CSMP-backed zone ≥ 10 m, RMS 0.28 m), it reaches ±0.3 m beyond 10 m and
±0.6 m inside — but the swath stops **110–220 m from the coastline at every
canon spot**, seaward of the model's line at all but one window. The timex
figures are oblique with no water-plane control (4–66 m/px at the break) and
cannot yield a locus. Printed AWAC statistics: Hs 0.92 ± 0.27 m, Tp 12.3 ±
2.1 s, Dp 211.3 ± 8.6°. Data release: still none (re-checked 2026-09-23).

First sounding-vs-interpolant residual under this coast, 110–500 m out
(Fig. 9 − grid, m):

| spot | NCEI 1/3" mean / RMS | CUDEM 1/9" mean / RMS | closer |
|---|---|---|---|
| Sewers | −0.78 / 1.02 | +1.50 / 1.57 | NCEI |
| First Peak | +0.44 / 0.66 | +0.12 / 0.43 | CUDEM |
| Second Peak | +0.21 / 0.43 | −0.27 / 0.42 | CUDEM |
| 38th | −0.04 / 0.50 | −1.14 / 1.23 | NCEI |
| The Hook | −0.38 / 0.51 | −2.25 / 2.40 | NCEI |
| Shark's | −0.11 / 0.22 | −1.65 / 1.74 | NCEI |
| Private's | −0.48 / 0.62 | −0.35 / 0.41 | CUDEM |

The CUDEM's −0.10 m sheet is measured 1.1–2.3 m too shallow from 38th to
Shark's Cove, which settles CUDEM_BED's "two flats" question against the
finer grid there; NCEI is ~0.8 m too deep at Sewers. One bake reaches a
sounding: **The Hook on the report's "1.5 m" day breaks 193 m out in 2.78 m
of interpolant where the swath reads 5.09 m — an implied 114 m shoreward
shift**, landing near the plane-bed line. At Hs 0.5 m the model's line
collapses to the waterline everywhere (activation floors 0.62–1.24 m) while
the report's variance panel shows a breaking band offshore — a qualitative
tension, recorded as such.

## T5 — Sentinel-2 georeferenced locus (`SENTINEL2_LOCUS_2026-09-23.md`)

Four cloud-free Sentinel-2 L2A frames on SC116 days of 1.32–1.50 m at
−0.30…+0.47 m tide (2023-09-26, 2023-11-25, 2024-01-04, 2021-01-09; tile
T10SEF; every ≥ 1.8 m day in eight years is under cloud at 11 am) give a
georeferenced foam edge at all seven mapped spots (10 m/px, σ = 8 m
including registration). A single frame bounds the locus from the shore side
only — foam ⇒ broken at or seaward, no foam ⇒ nothing — so this is a
falsification instrument, not a fit.

Against it the shipped reef bed is contradicted in **4 of 28** spot-frames,
the plane baseline in **12**, measured-only in **10**. At the apex (Sewers,
First Peak, Second Peak) foam sits 60–160 m seaward of the nodes; the plane
line is 84–184 m shoreward of it and fails 9/9 non-lull apex cells — **the
plane is retired at the apex and the fitted reef is doing real work there.**
Down-point (38th → Private's) no frame shows foam out at the reef line
(seaward of the foam in 13/16 cells, by 40–155 m in 10), while the plane sits
within ±20 m of the foam in 8/16 — **the down-point reef is unsupported, not
contradicted.** De-shoaling moves lines 10–75 m; verdicts at H1/10 are
unchanged. The 2023-09-26 38th/Hook cells are an open anomaly (foam 200–430 m
out while 46042 held a 4.8 m WNW swell that MOP wraps to 1.5 m): H0, not the
bed, is the suspect there. Masks were checked against the reform-line failure
(first mask sat on the swash band), kelp (NIR-only read kelp off Sewers; a
whiteness gate removes it), whitecaps (3–9 kt on all dates) and glint
(not excludable on the 48.6°-sun 2023-09-26 frame).

Re-run on the CUDEM 1/9" candidate after the merge
(`node scripts/compare_sentinel2_line.mjs --bed=cudem19`,
`residuals.cudem19.md`): only First Peak, Second Peak and 38th bake there
(CUDEM_BED's three lost spots stay lost), reef contradicted 1/12 vs plane
4/12 and measured 3/12, and at 38th the reef line still sits 47–128 m
seaward of the foam on every frame. The finer grid does not choose a bed
down-point; the down-point reef fits are the suspect on either grid.

## T6 — Surfline cam kinematics (`SURFLINE_CAM_POSE_2026-09-23.md`)

The residual VALIDATION_PLAN has wanted since August. On 2026-08-15 15:28
PDT (3 ft at 16 s SSW; tide 4.0 ft MLLW = +0.357 m MSL) the fixed Surfline
cam shows two crests peeling down-point at **Vp ≈ 4.7–6.7 m/s** (one section
closing out at 8–12 m/s), crest speed **c ≈ 3.8–5.3 m/s**, **α ≈ 55–73°** on
the clean 34–44 s crest (36–49° on 2–12 s). The model's Second Peak line at
that forcing is **a closeout on every bed** — reef, no-reef and plane alike:
α = 3.9° (IQR 0.5–12°), Vp = 37 m/s, c = 4.6 m/s — because the day sits
below `PEEL_FLOOR.secondpeak` (H0 0.91 vs floor 1.11 m) and above its tide
band (+0.36 vs +0.01 m). Crest speed agrees (model 4.3–4.6 m/s at 2.0 m
depth vs observed 3.8–4.7); the peel is off by an order of magnitude. In
VALIDATION_PLAN's table this is the "right on locus, wrong on peel" row: the
direction machinery, not the break criterion. At H0 1.4 m the model still
closes out at this tide (α 9°); only at 1.4 m *and* tide 0 does it reach
24° near the node — so the tide sensitivity of the Second Peak peel is the
tighter wrong threshold, and the observed peel at +0.36 m contradicts the
measured tide band's +0.01 m top directly.

Pose: full PnP was blocked (the frame holds only fence, path and iceplant;
the near water is occluded by the brow). Delivered instead: horizon fit
(roll −0.37°, rms 2.0 px), eye height from two independent bars that agree
(fence posts + CUDEM terrace 14.8 ± 1.0 m; sitting surfers 15.3 m; combined
14.85 ± 0.92 m), focal length bracketed 1300/1800/2500 px, not solved. The
alongshore ground scale is focal-length-free (0.083–0.086 m/px), so Vp is
robust; range scale ∝ f, so c and α carry the bracket. No f in a 2× bracket
and no H ± 2 m moves observed Vp into the model's range; even the f-free
lateral component (3.3–4.3 m/s) is ~10× below the model's 37 m/s.

Tracker: keys on luma *rising* through 150 within 1 s (the earlier
thresholded tracker joined the older bore), continuity-gated, seeded head;
locked 270/300 frames per sequence; alongshore lag-linearity r² 0.93 / 0.997;
fixed-rail null drift 0.007 px/s.

## T8 — Mirror verification (`MIRROR_VERIFICATION_2026-09-23.md`)

**Confirmed.** With the actual profile numbers (38th along a = (0.791,
0.612), shore s = (−0.612, 0.791)), a × s = +up, so the stage frame is a
proper rotation of ENU; but (a × up)·s = −1, so (along, up, shore) is
left-handed and placing it as three.js (x, y, z) is a reflection. The pose
read back from the running app at `#cam=lookout` has screen-right
(+0.707, 0, −0.707), so the land side projects left: all 15,197 land-coloured
pixels sit in the left half (median column 80/1280), while the photograph
and a camera-free ray-cast across the OSM coastline put the land
bottom-right. From `#cam=cliff` the lip front moves screen-right over sim
42 → 45 s; a right-hander peeling +x = NE should move image-left from that
cliff, as FIELD_WAVE_MOTION recorded for the real cam.

Fix location: the stage → world boundary in `main.js` (world z = −stage z:
a root `THREE.Group` with `scale.z = −1` plus one `toWorld` helper for camera
pos/target/`setView`), not `enuToStage`, the profiles, the model or the bed.
Not one line in practice: `GRID_FRAG` samples `bedElevM(vWorldPos.xz)` and
must move to a stage-space varying; audio pan is world-x; Drone/Tour
left–right swap; every rendered fixture and QA sheet re-captures.
`coordinate-ownership.test.js` pins `worldXZ = vWorldPos.xz` and
`incident-direction.test.js` pins the identity basis, both safe for a
renderer-side fix. Permalinks survive.

## T7 — Who still reads the CPU twin (code audit, no instrument)

`web-three/js/model-js.js` `oceanH` is the synthetic pre-bathymetry path:
`grow = 1 + 0.85·e^(−d/90)·reef` with no `growGeo` (no depth cap) and `P.H0`
where the shader uses `Heff` (no sheltering); SCALE_AND_BROW §1b measured it
at ~1.4× the GPU at Jack's. Its `breakLine` is the authored contour plus the
section shift, not the baked emergent line, unless a caller injects `zbFn`.
Consumers as of `a863e58`:

| consumer | reads | authority | picture effect |
|---|---|---|---|
| rider placement (`main.js` ~2308) | `surfaceQuery` (GPU, exact GRID_VERT text); twin only as `#ridersurface=legacy` and for the ride *solve*, whose `zbFn`/`phaseFn` are injected from the bake | **GPU** | none — already fixed |
| camera submersion `u_camUnder` (`main.js` ~2423) | twin `oceanH` at the eye, except POV | twin | a low camera can be tinted underwater when the drawn surface is below the eye (~1.4× at Jack's); Follow/Cover/Cliff read this |
| audio `updateAudio` (`sound.js`) | twin `breakLine` = authored contour for the zipper solve; `rayPhase` follows the injected `phaseFn` | twin (line) | the audible zipper sits on the authored contour, which `main.js`'s own comment places 74–247 m from the baked line at Sewers; the crest clock is right, the *where* is not |
| `rideMetric` (`main.js` ~3311) and `scripts/measure_ride.mjs` | twin `oceanH` | twin | instrument only; superseded by the rider-makeability gate (GAME_PROJECTION Phase 0), keep out of acceptance |
| `__pointbreak.surfaceRay` probe (`main.js` ~2961) | twin `oceanH` | twin | instrument only; documented as the twin (SCALE_AND_BROW §1) |

Proposed: route `u_camUnder` through `surfaceQuery` for every camera (one
extra sample per frame; the query already exists), and give `sound.js` the
baked `zbFn` the ride solve already receives. Both are wiring, not model.

## The cross-track picture

Reading the seven tracks together, ordered by what a surfer watching for ten
seconds would notice:

1. **The peel is the defect, and it is a threshold, not a mechanism.** T6 is
   the first kinematic residual and it is an order of magnitude on Vp with c
   agreeing — the "right on locus, wrong on peel" row. T1 says why the
   thresholds are fragile: the authored α is met only inside a spot-specific
   H0 window because the *line* bearing slides 36° → 8° as the line walks off
   the wedge's oblique band. T2 adds that the measured tide band (+0.01 m
   top at Second Peak) is contradicted by an observed peel at +0.36 m, and
   that both field days sat 0.13–0.18 m above predicted tide, on exactly the
   axis the floor is most sensitive to. Everything in §4.6 (peel floor, tide
   band, decline-outside-it) was measured on the model against itself; the
   first observation says the band is too tight by at least 0.35 m at Second
   Peak.
2. **The reef is real at the apex and unsupported down-point.** T5 (four
   georeferenced frames) and T3 (one posed photograph) agree that the
   synthetic reef beats the plane where the point is (Sewers–Second Peak).
   T5 shows no foam at the down-point reef lines in any frame while the
   plane sits within ±20 m of the foam there; T4's swath residual and the
   CUDEM re-run say the interpolant does not settle it. The down-point reef
   fits (38th, Hook, Shark's, Private's) are the suspect on either grid.
3. **The drawn line is the significant wave's; the photographed break is the
   set wave's.** T3's inner miss closes at 1.3–1.5×Hs and every surfer sits
   outside the Hs line. T2 records the opposite-sign convention issue
   (H0 as envelope peak vs Hs as H_1/3, 1.27× under Rayleigh). A drawn-line
   statistic (`#h0stat=`) separates the forcing question from the bed
   question, which the next fixture needs.
4. **Breaker type is authored against the bed (T1).** ξ authored 1.4–3.1×
   what the bed supports, `u_xi` reaches every lip pixel, `iribarrenMeasured`
   reaches none. The classic/descent experiments (`a863e58`) are shaping a
   plunging lip the bed does not earn at five of seven spots; that is a
   product call, but it should be made knowing it.
5. **The face cannot get steeper by tuning (T1).** 10–15° physical vs
   22–30°, with the even phase map's budget at most 1+s and carrier
   steepness binding. GAME_PROJECTION C2 stands: a real face angle is a
   representation change.
6. **Forcing (T2)** is systematic but second-order: de-shoal `#day=live` and
   the month table (+5 to +10 % at long periods), add `#T=`, and use observed
   water levels for every same-hour comparison.
7. **Wiring debts (T7)**: camera submersion and the audio zipper still read
   the synthetic twin / authored contour; both have a GPU or baked authority
   already in the app.

## Ranked next actions

Measured, proposed, not done. Product calls are Andy's.

1. ~~Re-measure the peel floor's tide band against the 2026-08-15 day~~ —
   **DONE 2026-09-24, verdict REEF FIT WRONG AT DEPTH**
   (`PEEL_BAND_FIELD_2026-09-24.md`). The band is a correct statement about
   the model: no cell of the (0.6–1.6 m) × (−0.3…+0.8 m) field at T 14/16/17
   reaches α 30° at Second Peak. At the observed cells the line sits 33–72 m
   *shoreward* of the wedge crest on the natural bed's 1.7 m isobath (on-reef
   0.00; reef and no-reef bakes bit-identical), because `REEF_CEIL_EL`
   (−0.5 m NAVD88) caps the crest at 1.6 m below MSL while the day's waves
   break in 1.6–2.0 m of water. No in-invariant knob moves it. A crest
   0.6–0.8 m below MSL at β 45° (an intertidal shelf, outside the invariant)
   gives α 41°, Vp 5.9–6.4, c 4.2 at both cells — inside the observed
   4.7–6.7 / 3.8–5.3 — keeps the card at 27–31°, leaves all four Sentinel-2
   Second Peak cells consistent and Jack's T3 line untouched. So item 1
   becomes a product call on the shoreline ceiling invariant, and item 3
   gains the apex and the tide axis.
2. **Adopt the comparison protocol** (T2 §7.1): observed 9413450 water
   level, not predicted, for every same-hour comparison; both day hashes in
   T2 already do this.
3. **Fit the down-point reefs over the H0 band, signed** (T1 + T5): the reef
   fit is a point fit at `breakDepthFor(H0, T)`; T1's line-bearing slide and
   T5's 13/16 down-point cells point at the same wedge obliquity. REEF_FIT
   §"signed refit" is already queued; T5's hashed loci are the acceptance
   test (`compare_sentinel2_line.mjs`, no new observation needed).
4. **`#h0stat=` for the drawn line** (T3): H_1/10 for the line, Hs for the
   HUD, one uniform. Puts the shipped bed on the riders' wave by T3's own
   numbers and makes the next fixture a bed test only.
5. **`#deshoal=1` and `#T=`** (T2 §7.2, §7.5): pure twin and tests already
   ship (`scripts/lib/deshoal.mjs`).
6. **Mirror** (T8, confirmed) — **LANDED 2026-09-24** as a root world group
   with `scale.z = −1`, `#mirror=0` the pixel-identical revert
   (MIRROR_VERIFICATION §7). `vWorldPos` turned out to be stage-space
   already, so only the shaders' eye moved (`u_camStage`); the audio pan is
   camera-relative. Fixtures captured before this date are mirror images.
7. **Wire `u_camUnder` to `surfaceQuery` and the audio zipper to the baked
   `zbFn`** (T7).
8. **Get the Surfline cam's focal length** (T6): one capture with the 38th
   Ave stair head or lookout wall in frame turns the f-bracket into a PnP
   solve and pins observed α to ±5°.
9. **Send the OFR 2007-1270 data request** (T4): the W-1-05-MB CPS transects
   are the only product reaching < 1 m; one line through The Hook decides
   the CUDEM sheet and the one model-vs-sounding residual.
10. **ξ from the bed** (T1): decide whether breaker type stays authored
    (character) or follows `iribarrenMeasured` (physics) — MODEL.md §4.5 has
    no row for it yet.

## What would falsify this audit

- A second field day at Second Peak inside the tide band that also closes
  out on the cam would move item 1 from "band too tight" to "peel machinery".
- A Sentinel-2 frame at ≥ 1.8 m with foam out at the down-point reef lines
  would restore those fits; the 2023-09-26 anomaly says the H0 side must be
  settled first (46042 vs MOP on WNW days).
- The Surfline f solving to > 2000 px would push observed α toward 90°
  (a shore-parallel bore, not a peel) and weaken T6's α claim, though not its
  Vp claim, which is focal-length-free.
- A CPS transect under The Hook within 0.5 m of NCEI would clear the
  interpolant and put the 114 m Hook shift on the reef fit alone.
- A `#cam=lookout` capture with the land bottom-right after a *profile*-side change would mean the reflection was in the data, not the embedding; T8 says it is the embedding.

## Reproduction

Each track's note carries its own Reproduction section; the instruments are
`scripts/measure_physics_residuals.mjs`, `scripts/audit_forcing.py`, and the
T3–T6 instruments named in their notes. `npm test` is 206 green at `ab857a8`.
