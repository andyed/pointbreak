# web-three — Mesh Renderer Spec

Successor to `web/` (the raymarched reference implementation). Same model, new
geometry class and a ground-up shading pass. Drafted 2026-08-09 after the honest
assessment: the raymarcher proves the zipper *reads* but does not evoke ocean.

## Why a mesh renderer

1. **The heightfield is the wrong geometry class for the mission.** One y per
   (x,z) can never produce an overhanging lip — a plunging wave is multi-valued
   in y. Vertex-shader **horizontal** displacement (Tessendorf choppy, pushed
   past self-intersection) produces a genuine curling lip. The barrel — and the
   surfer's eventual place inside it — requires this.
2. **The surfer needs a body.** glTF low-poly rider replaces SDF capsules;
   shadows and silhouette come free.
3. **Free camera.** OrbitControls for exploration + authored shots (cliff /
   drone / follow) as camera presets.

`web/` stays as the reference implementation until web-three clearly beats it,
then retires.

## Architecture

- `web-three/` beside `web/`; no bundler. three.js vendored once as an ES module
  (`web-three/vendor/three.module.js`, pinned version noted in a VENDOR.md).
- **Shared math**: extract the model GLSL (`coastCurve`, `breakLine`,
  `reefWindow`, `setEnv`, the zipper/foam field logic of `ocean()`) into
  `web/js/model-glsl.js` exported as a string; both renderers include it.
  MODEL.md remains the source of truth; this file is its one executable form.
- Geometry: `PlaneGeometry` grid, ~512×384 over the ~600×500 m stage, displaced
  in the vertex shader. Static camera-independent LOD is fine at this scale;
  no clipmaps until profiling says otherwise.
- Vertex shader outputs varyings: world pos, displaced normal (finite diff in
  UV space), foam, pocket, crest, brk. Fragment shader owns shading only.

## Displacement (vertex)

- Vertical: `ocean()` as today (carrier + set envelope + shoal/decay + bore).
- **Horizontal (new)**: choppy displacement `xy -= lambda * grad(h)` with
  lambda ramping with steepness near the break line; past the cusp limit at the
  pocket when ξ says plunging → the lip visibly pitches. This is the feature
  the raymarcher cannot have; it is the reason web-three exists. Accept
  self-intersection artifacts at first — a folding lip that slightly z-fights
  beats a smooth mound.
- Fine displacement octaves (see Shading 1) applied at reduced amplitude in the
  vertex stage; full detail lives in normals.

## Shading (ranked by visual ROI — from the 2026-08-09 critique)

1. **Detail spectrum.** 3–4 fbm octaves of animated ripple in the normal field
   (fragment-stage normal perturbation, not geometry). Two drift directions
   (swell-aligned + wind), amplitude damped inside foam and over the boil slick.
   This alone moves us from silk to water.
2. **Fresnel + glitter.** Schlick fresnel (F0 ≈ 0.02): near-black looking down,
   mirror at grazing. Sun glitter = specular from the detail normals with a
   tight highlight; thousands of sparkle hits in motion. Sky reflection from a
   small procedural sky (marine-layer gradient, same palette as web/).
3. **Subsurface transmission.** Backlit thin crests glow green-teal:
   `sss = pow(max(dot(V, -sunDir),0), n) * crestThinness * heightAboveMean`,
   tinted (0.2, 0.5, 0.45). Strongest at the pocket. This is the Pleasure Point
   money cue.
4. **Foam in the surface, not on it.** Foam perturbs normals (rough), raises
   diffuse albedo, kills fresnel/glitter locally, receives sun. Keep the
   web/ structure: bore mound, streaks, two-octave lace, ξ-scaled spray, crumb.
5. Aerial perspective: scene fog matched to the marine-layer sky; no hard
   horizon seam (plane extends past fog distance or a far skirt ring).

## Surfer (behind the existing toggle, still default off)

- Low-poly glTF rider + board (author in Blender or grab CC0; style: dark
  silhouette, no face detail needed at these distances).
- Position/orientation from `surferState()` (JS-side port of the same formula),
  board pitched by local surface normal, lean from pump phase.
- Ride grammar per TODO.md (takeoff, linked turns, kickout, wipeout) is
  web-three work — do not build it in the raymarcher.

## Cameras

- `OrbitControls` free mode (default for dev).
- Authored presets: Cliff (16 m, fixed lineup), Lineup (low telephoto anatomy
  proof), Drone (top-down ortho-ish), Follow (telephoto tracking surferState,
  zoom ∝ 1/distance).
- Keys: V cycles presets, S surfer, 1–7 spot presets, space pause — parity
  with web/.

## Ground truth & acceptance

- **The test is motion, not stills.** 10-second captures compared against the
  Surfline Pleasure Point cam (link in TODO) at matched conditions via Today's
  Ocean (SC116). Grade: does a naive viewer say "ocean" before "graphics demo"?
- Milestones:
  - **M0** — grid + vertical displacement + shared model GLSL; parity with
    web/ geometry. (Mechanical.)
  - **M1** — shading pass 1–4 above. Acceptance: evokes ocean in a 10 s capture.
  - **M2** — horizontal displacement + pitching lip at high ξ. Acceptance: the
    highest-xi site (Sewers) visibly throws; the lowest (Privates) still spills.
  - **M3** — glTF surfer on the ride line. Acceptance: reads as riding, not
    sliding.
- Perf budget: 60 fps at 1080p on the M-series MacBook, DPR capped 1.5;
  fbm octaves are the first knob to drop under load.

### Breaker anatomy pass (2026-08-10)

The original M2 fold produced a broad raised ridge with foam on it. The
structural pass keeps the same bed, break line, refraction and carrier phase,
but makes the breaking event readable as five linked parts: dark concave face,
compact pitching lip, negative-space pocket, bright impact head, low aerated
train. `breakerLifecycleAtX()` in the shared model is the only collapse clock;
surface mound, foam age and the sparse airborne point pass all consume it.

This is the default web-three renderer path. `N` toggles the legacy/structural
A/B, and `#shape=legacy` makes comparisons reproducible. The raymarcher remains
the legacy reference. Acceptance is matched-time Cliff, Lineup and Drone proof:
structural mode must preserve clean dark set lanes, narrow the impact head, show
a lip/face hinge at plunging sites, retain a lower trailing foam band, and keep
Privates spilling. It must not change shoreline, break locus or crest bearing.

The crash must be an EVENT, not merely a better foam profile. At First Peak the
physics-owned peel speed is ~38.6 m/s; the structural lifecycle therefore uses a
0.20 s impact sigma (~15 m head) and a hard 3.8 s bore end (~146 m wake). In
matched frames one second apart, the bright impact head should move ~39 m
down-point, water ahead must remain unbroken, and only the lower wake may remain
behind. Do not slow that motion to make it easier to see: its speed is the
refraction/Walker result, not an aesthetic parameter.

## M4 — emergent break line

**Status: BUILT, ON BY DEFAULT for mapped spots as of 2026-08-11. `#m4=0`
reverts to the authored line; unmapped sites (Privates) and the A-frame keep
the authored line regardless (no bathymetry to derive from).**

**2026-08-11 re-measure** (shader-faithful CPU twin of `ocean()`'s amplitude
path; sign convention: gap = z_authored − z_emergent, positive = emergent
locus seaward, sampled at 1 m across each stage, tide 0, preset T): the
2026-08-10 note below was right to distrust the old numbers. The static
~75–133 m gap is gone *as a constant* — but only near the 1.5 m model card,
where the two loci happen to cross (Sewers mean gap at 1.5 m is −1.4 m). At
Sewers' own preset H₀ = 2.2 the emergent locus is still 35–106 m seaward, and
the locus swings ~200 m across H₀ 0.7→2.5 (breaking in ~1.5 m of water on a
0.7 day vs ~4.2 m on a 2.5 day, verified against the raw criterion). That
H₀/tide dependence is what the authored line cannot express, and it is the fix
for SIZE_AUDIT's master finding: at big H₀ the emergent line moves breaking
into deeper water where `Hlim = H₀`, so size finally buys face height.

**2026-08-10 note:** the measurements in this section pre-date MODEL.md §2.3
(break line onto the contour) and §2.4 (refracted crests). The 75–133 m locus
gap and the 0.20 rider ratio were mostly the frame error and are resolved;
gap #2 below may already be closed because the envelope now keys off the same
contour the depth was fitted to. Re-measure before building. What M4 still
uniquely buys is α varying with H₀ and tide — and it is the **substrate M5
requires**, which is now its main justification.

Built: the bake (`bed.js bakeBreakLine`), the 128x1 texture, the shader lookup
(`breakTexZ`/`breakLine`), the CPU twin (`breakZAt`), derived-alpha readout,
the `u_surferPos` seam, and (2026-08-11) the rider continuity solve
(`model-js.js m4RideSolve`, MODEL-TWIN of the GLSL `u_breakMix` branch). The
baked line curves through the measured seabed as it should.

The two gaps that kept it gated, and how they closed:
1. **The rider solve picked an arbitrary station — worse, a different one each
   frame.** Many x satisfy "a crest is on the break line" — one per crest.
   The global min-phase-residual re-scan teleported the rider: measured
   (Playwright `u_surferPos` + bit-exact CPU replication) median 1-s |dx| of
   28–220 m, >30 m hops (up to ~570 m) on 5–84 of 300 frames at 1/30 s, and
   8–95% of samples outside the mapped stage because the scan ran to the baked
   ±290 m. Fixed 2026-08-11 by a continuity solve: the takeoff is the minimum
   of ray distance S over the stage (at Sewer Peak that minimum is mid-stage —
   the wave breaks first AT the peak and the crossing splits into a left and a
   right; the model rides the +x branch), one crest index is picked there,
   that crest's crossing with the baked line is bisected each frame and
   followed down-point, clamped to the stage bounds, handing off to the crest
   at the takeoff when it runs off the end. Between crests (the stage spans
   less than one wavelength of S) the rider waits at the takeoff. Face height
   under the rider while riding: 0.81–0.87 of the best crest at his x across
   all three measured spots × H₀ ∈ {0.7, 1.5, 2.5} — acceptance was ≥ 0.7;
   the re-scan measured 0.19–0.44.
2. ~~**The amplitude envelope still does not follow the emergent line.**
   `grow` boosts only seaward of `zb` (`max(d,0)`), and `decay` keys off
   `brk`, so moving `zb` does not move where the model makes its tallest
   water. Until this is fixed, relocating the rider cannot help — measured
   ratio of face height under the rider to best crest at his x is 0.20 either
   way.~~ **Closed — and mostly not by M4** (measured 2026-08-11): with
   `growGeo = min(Hsh, Hlim)/H₀`, depth owns the height cap (SIZE_AUDIT's
   master finding), so the envelope stopped keying off the authored line when
   the depth path landed. Under `m4` the argmax-z of face amplitude sits
   4–12 m seaward of the emergent line at every station tested (the face just
   before breaking — physically correct, not divergence). Where m4 does still
   matter for the envelope: on a 0.7 m day with m4 off the peak sits 20–105 m
   seaward of the depth locus (the authored-line decay cut clips in the wrong
   place); with m4 on it tracks within 5–25 m. No envelope work was needed.

One new caveat for the derived-α readout and M5: the emergent line at Second
Peak is nearly shore-parallel (derived α ~0–0.3° mid-stage; Sewers reads 12°
at 1.5 m rising to 32° at 2.5 m). The DEM-smoothed-to-a-ramp problem M5
predicts is already visible in the bake — expect near-closeout derived α at
Second Peak until the synthetic reef lands.

### The problem, measured

`breakLine(x) = tan(α)·x − C_geo(x)` is authored: α is an input. Before the
depth field (MODEL.md §2.2) that line *was* where the wave broke, so everything
downstream — the peel, the foam, the rider — was correct by construction.

Depth changed that and the two loci silently diverged. Measured at Sewers
(H₀ = 2.2 m, T = 15 s, tide 0):

| | z |
|---|---|
| authored break line | ≈ −25 |
| depth criterion `H₀·Ks = γh` | ≈ −100 to −133 |

The visible consequence is the rider, because he tracks the authored line. But
he is the symptom. The disease is that **depth now drives the breaking gate and
the height cap, while the amplitude envelope (`grow`, `reefWindow`, `setEnv`)
still peaks at the authored line.** Foam is painted where depth says; the tall
water is where α says.

Shimming the rider onto the depth locus was tried on 2026-08-10 and rejected.
Controlled A/B, identical sim times, mean height under the rider across
t = 30…90 s:

| ride line | mean face height |
|---|---|
| authored | 1.03 m |
| depth-derived | 1.89 m |
| **best crest available at that x** | **5.27 m** |

The depth locus is better, but both sit far below what the wave field offers,
because neither locus is where the model actually makes its tallest water. No
rider placement fixes that. The break line itself has to move.

(Note for whoever picks this up: the first pass at the shim also forgot to
re-snap the rider's phase. The offset is ~110–133 m against a 90 m wavelength,
so it dropped him between crests — measured −1.65 m, a trough. `surferState()`
now snaps to the nearest crest, which is worth keeping regardless of M4.)

### The design

Make `breakLine(x)` the locus where the depth criterion is first met, marching
seaward to shoreward:

    zBreak(x) = min{ z : H₀·Ks(h(x,z)) ≥ γ·h(x,z) },  γ = 0.78

with `Ks = √(cg₀/cg)`, `cg = √(g·h)` as already implemented. Then:

- **α stops being an input and becomes a readout.** Peel angle is the slope of
  the emergent line, `α(x) = atan(dzBreak/dx)` — a *field*, not a constant,
  which is what the down-point gradient in the research notes always implied.
  The preset bank keeps α only for the unmapped site (Privates) and for the
  A-frame mechanism, and reports it everywhere else.
- **The amplitude envelope must follow the same locus.** `grow` and the
  `q` sharpening key off distance to the break line; once that line is
  emergent they track the real breaking position and the divergence closes.
- `reefWindow(x)` stays authored — it is a stated modelling choice, not a
  measurement, and MODEL.md §2.1 already says so.

### The cost, and how to pay it

The crossing has no closed form, so it needs a march. Per fragment that is
~35 steps × 4 texel fetches ≈ 140 fetches — far too expensive, and it is why
the 2026-08-10 shim computed the offset CPU-side for a single point.

**Bake it.** `zBreak(x)` is one-dimensional and changes only when the spot,
swell height, period or tide changes — not per frame:

1. CPU marches `zBreak` at N ≈ 128 stations across the stage x range
   (`bed.js depthBreakOffset()` already does exactly this march for one x).
2. Upload as a 128×1 RGBA8 texture (same 16-bit encode as the seabed) or a
   uniform array.
3. `breakLine(x)` becomes a lerp of two texels — cheaper than it is today.
4. Recompute on preset / H₀ / T / tide change, and on nothing else. The tide
   drag will exercise this hardest: it should stay smooth while dragging.

Keep `u_geoMix`-style fallback: unmapped sites and the A-frame keep the
authored line, so nothing regresses where there is no bathymetry.

### Acceptance

**2026-08-11 status:** rider criterion met — face height under the rider is
0.81–0.87 of the best crest at his x *while riding* (Sewers / Second Peak /
Sharks × H₀ 0.7 / 1.5 / 2.5, t = 30–90 s, shader-faithful CPU twin). The
rider now also waits at the takeoff between crests (the stage spans less than
one wavelength of ray distance, so a crest is on the line only ~20–45% of the
time); waiting frames are lineup behaviour, not placement error. Continuity:
across 16,200 frames at 1/30 s over all nine combos, zero samples outside the
stage bounds and zero >30 m within-ride steps (the re-scan produced both, up
to ~570 m). Tide drag rebakes in-loop as designed. Privates and the A-frame
never enter the m4 path (`bakeBreakLine` returns null).

- **The rider is on the wave.** Same controlled A/B as above: mean face height
  under the rider within 30% of the best crest available at his x, across a
  full set/lull cycle. Today it is 20%.
- **Foam and tall water coincide.** In a drone capture, the whitewater band and
  the crest line touch. Today they are ~100 m apart at Sewers.
- **α is reported, not set.** The HUD shows the derived peel angle, and it
  varies along the point rather than sitting at the preset's constant.
- **The golden rule falls out.** Derived α should rise down-point (mellower)
  without anyone typing those numbers — the research notes predict this, and it
  is the first genuine prediction the model would make rather than encode.
- **Tide still drags smoothly** at 60 fps with the rebake in the loop.
- No regression on Privates or with `aframe = 1`.

### Why this is worth doing

It converts the model's central claim from a construction into a consequence.
Right now "bed shape drives the wave" is demonstrated by the B-key A/B, which
is real but narrow. With an emergent break line the peel *position, angle and
character* all derive from measured bathymetry, and the down-point gradient
locals describe becomes a prediction the model can be wrong about — which is
the precondition for the validation pass in TODO Phase 3.


## M5 — synthetic reef (spot character from contour obliquity)

**Status: LANDED 2026-08-11, measured (acceptance run recorded at the end of
this section). This was the answer to the honest cost recorded in MODEL.md
§2.4: with refracted crests over the measured DEM, all seven presets arrived
within a degree of each other (8.6–9.6° off shore-parallel) and the taxonomy
no longer differentiated. With the reef: derived α 37.8–67.1° across the six
mapped presets (span 29.3°), every fit within 1.3° of its target.**

### Why obliquity, and only obliquity

Peel angle is the angle between the crest and the break line. Refraction pins
the crest bearing near 9° regardless of deep-water direction — that side is
now physics and should not be touched. So character can only come from the
OTHER line: the break line must cross the shore obliquely, which means the
γh-crossing must sweep seaward as x advances — a reef whose strike is rotated
against the shore. The measured DEM cannot supply this: at ~7 m posts the
Purisima mudstone bedding that makes the real spots is smoothed into a
featureless ramp (bed A/B in MODEL.md §2.2 already showed the residual
structure, 2.5–3.8 m RMS, is what carries the peel). The reef must be
invented. Per the 2026-08-10 decision: **make up plausible values, label them
synthetic, keep them toggleable.**

The target geometry, per preset (φ_break ≈ 9°):

    strike β ≈ α_target − φ_break

| preset | α target | ridge strike β | V_p at c_b ≈ 4.8 m/s |
|---|---|---|---|
| Sewers | 38° | ~29° | 7.8 m/s |
| First Peak | 50° | ~41° | 6.3 |
| Second Peak | 58° | ~49° | 5.7 |
| Jack's | 62° | ~53° | 5.4 |
| The Hook | 48° | ~39° | 6.5 |
| Sharks | 66° | ~57° | 5.2 |

V_p returns to Walker-makeable (V_s ≥ c/sin α, attainable ~10 m/s) on every
row. Privates and the A-frame stay on the synthetic-quadratic path, no reef.

### Architecture: augment the grid once, at decode time

The trap, hit and documented on 2026-08-10: `coastCurve` is a baked fit while
depth is a runtime texture. Invented relief added to only one of them moves
the depth gate without moving the break line (or vice versa) and re-splits the
loci §2.3 merged. And a procedural GLSL term would need a CPU twin in bed.js,
a fourth MODEL-TWIN surface to keep in sync.

So: **one augmentation function, applied to the decoded uint16 grid in
`bed.js` before anything reads it.** The GPU texture upload, `bedElevAt`,
`shorelineZ`, `cliffTop`, `bakeBreakLine`, and the section chart all consume
the same augmented grid with zero twin drift. Under M4 the break line derives
from that grid, so break line, depth gate, shoaling, and shoreline are
coherent by construction — the reef exists in exactly one place.

    elev'(x,z) = elev(x,z) + reef(x,z)

`reef(x,z)`, the Mead & Black wedge + ridge composition:

- **wedge** — a planar uplift whose strike runs at β off shore-parallel,
  amplitude A ≈ 1.5–3 m, cresting ~2–3 m below MSL (deep enough that waves
  reach it; the γh crossing happens ON it), feathered to zero over ~40 m at
  the reefWindow ends and the patch edges (smoothstep, C1).
- **ridges** — 1-D noise along the wedge strike (their §"sections" components):
  amplitude σ_h, wavelength ~30–60 m. This RETIRES the separate sections hack:
  u_sections stops pulling the authored line seaward in the shader and becomes
  the ridge amplitude knob feeding the same grid. One mechanism, not two.
- **clamps** — never raise the bed above −0.5 m NAVD88 (the invented reef must
  not move the measured shoreline or the cliff camera), never deepen (additive,
  ≥ 0). The DEM stays the floor of truth; the reef is relief on top of it.

Deterministic per preset (seeded by spot name) — rebake, not per-frame.

### Fitting: α returns as a target, honestly

α's meaning changes a third time, and this one should be final: **a character
target the synthetic reef is fitted to.** The fit loop, build/bake-time:

1. compose reef(β, A, σ_h) with β seeded from the table above
2. bake the M4 break line over the augmented grid
3. read `derivedAlphaDeg` mid-window; adjust β by the residual; iterate (≤5
   rounds — the response is nearly linear in β)
4. record the fit residual; HUD reports `α 58° target · 56° derived ·
   reef synthetic`

No silent success: if the fit cannot land within tolerance (e.g. the wedge
would breach the −0.5 m clamp before reaching β), the HUD says so and the
residual is committed with the profile.

### The A/B keeps its teeth

`B` currently toggles measured ↔ plane. It becomes a three-way cycle:
**measured → measured+reef → plane.** The causal demo gets stronger — one key
now shows: no reef = closeout (the §2.4 finding), synthetic reef = the spot,
plane = no peel at all. `u_bedShape` generalizes from a float mix to a mode.

### Order of work

1. **M4 first, re-measured.** Rider tracking along the emergent line (the
   continuity solve M4 gap #1 — solve per crest and follow it, don't re-scan),
   and re-measure gap #2, which §2.3 may have closed already.
2. **Wedge + fit loop** on Second Peak only; acceptance below on one spot.
3. **Sweep the bank**, retire the sections shader hack, three-way A/B, HUD.
4. **Docs**: MODEL.md §2.5 records what happened, with the fit residuals.

### Acceptance

- derived α within ±5° of target on all six mapped presets, and the taxonomy
  differentiates again: derived α spans ≥ 20° across the bank
- V_p in 5–8 m/s on the mapped bank (Walker-makeable), crest bearing still
  ≤ 12° (refraction untouched — the §2.4 win is not given back)
- rider p90 height ≥ 0.9 of best available crest (parity with §2.3's number)
- shoreline and cliff cameras unmoved by the reef (clamp holds; assert in
  tests: augmented grid ≡ measured grid wherever measured ≥ −0.5 m NAVD88)
- zipper stations return to O(100 m) spacing, so the four audio voices are
  audible again (the §2.4 quieting reverses for free)
- `npm test` gains: fit residuals within tolerance, clamp invariant, and
  determinism (same seed → same grid)

### Landed 2026-08-11 — what was built, and the acceptance measured

Built as specified, with three deliberate deviations recorded below. The one
augmentation surface is `bed.js compositeU16()`: base64 → uint16 → reef →
floor re-quantize (floor, not round, so the −0.5 m ceiling survives
quantization and `floor(em + add) ≥ raw` can never deepen). GPU texture
(`decode`), CPU bilinear (`elevGrid`/`bedElevBlended`), M4 bake, refraction
bake and section chart all read it. Fit loop as specified (`reefFitFor`,
≤ 5 iterations, LSQ slope over x ∈ ±16 m, residual carried on the result);
`reefAudit()` exports the clamp/determinism invariants. B is the three-way
`bedShape` mode (0 measured+reef / 1 plane / 2 measured; `#bed=reef|plane|
measured`), HUD shows `α 58° target · 56° derived · reef synthetic` plus a
`bed …` tag in the geo line.

Deviations from the spec text:
1. **The crest line sweeps SHOREWARD as x advances**, not seaward: with a
   seaward-sweeping line dS/dx along the line goes negative and the crossing
   runs −x — a left. The strike-β table is unchanged (β = α − φ_break,
   positive, against the x-axis); only the prose sign was wrong.
2. **The wedge anchors on the natural h_b contour** (depth = breaking depth at
   the preset card), not the crest-depth contour. The march takes the
   seaward-most crossing, so a wedge anchored shoreward of where the wave
   already breaks never owns the line — the first fit pass diverged at Sewers
   (H0 2.2, h_b 3.9 m) exactly there.
3. **The sections shader hack is NOT retired.** That needs a `model-glsl.js`
   edit (out of this change's file set, and the file carries concurrent
   uncommitted edits). The ridge noise lives in the grid as specified; the
   GLSL `sec` term still pulls the *drawn* line seaward on top of it
   (visual-only double counting — the derived readout and the rider use the
   CPU line, which has no sec term). Follow-up: drop `sec` from `breakLine()`
   under `u_breakMix` and repoint σ at the grid ridge amplitude.

Acceptance, measured (Playwright, canonical preset cards, tide 0; script
drives `window.__pointbreak` + the page's own bed.js CPU twins):

| spot | α target | derived | resid | β fit | iters | h_b m | V_p m/s | rider p90 (reef / no-reef) |
|---|---|---|---|---|---|---|---|---|
| Sewer Peak | 38 | 37.8 | 0.2 | 38.1 | ≤5 | 3.83 | 10.0 | 0.96 / 0.58 |
| First Peak | 50 | 49.4 | 0.6 | 51.5 | ≤5 | 3.20 | 7.4 | 0.71 / 0.58 |
| Second Peak | 58 | 57.2 | 0.8 | 60.9 | ≤5 | 2.73 | 6.2 | 0.54 / 0.90 |
| 38th | 62 | 62.3 | −0.3 | 61.7 | 4 | 2.09 | 5.1 | 0.83 / 0.94 |
| The Hook | 48 | 46.7 | 1.3 | 53.0 | 2 | 2.67 | 7.0 | 0.68 / 0.85 |
| Shark's Cove | 66 | 67.1 | −1.1 | 68.2 | 3 | 1.96 | 4.8 | 0.84 / 0.89 |

- **Derived α within ±5° of target: PASS, all six** (max |resid| 1.3°).
  Without the reef the same readout is 0–4.1° — the closeout §2.4 predicted.
- **Taxonomy span ≥ 20°: PASS** — 29.3° across the bank.
- **Crest bearing ≤ 12°: PASS** — swellPhi 7.9–9.7°, untouched by the reef.
- **V_p 5–8 m/s: PARTIAL (4/6).** V_p = √(g·h_b)/sin α with the *measured*
  breaking depth: Sewers 10.0 (h_b 3.8 m at H0 2.2) and Sharks 4.8 sit
  outside. The spec's table assumed c_b ≈ 4.8 m/s uniformly, which
  depth-limited breaking contradicts once H0 varies per preset — fit error is
  not the cause (residuals above). Recorded, not fudged.
- **Rider p90 ≥ 0.9: PARTIAL (Sewers 0.96 only).** Face height under the
  rider / best crest at his x, replica of the ocean() carrier over the baked
  line, t = 30–90 s. The no-reef baseline (same metric) is 0.58–0.94, so
  ≥ 0.9 was not generally attainable before the reef either: the rider sits a
  fixed 11 ± 5 m seaward of the line, and the more oblique the line is to the
  crest, the further off-crest in phase that fixed offset lands. This is the
  φ-aware `faceOff` item already on TODO (rider stance), not a reef clamp
  issue. No teleports/out-of-stage regressions observed (riding share 1.0).
- **Shoreline unmoved: PASS** — waterline march reef vs measured at 21
  stations: max shift 0 m; audit: 0 posts deepened, 0 above the −0.5 m
  ceiling, 0 dry posts touched (per spot, all six).
- **Deterministic: PASS** — grid checksums identical across independent
  page loads (seed = spot name; no Math.random anywhere in the path).
- **Zipper-station spacing / audio voices: not re-measured** in this pass.
- **`npm test` gains deferred:** bed.js imports `three`, so it does not load
  under `node --test` today; the fit-residual / clamp / determinism
  invariants are exported (`reefAudit`) and verified via the Playwright run.
  Guard + existing 16 tests stay green.

Known cosmetic gap: the section chart's caption (section.js, untouched here)
still labels from the old boolean, so bed mode 2 ("measured") captions as
"PLANE"; the profile it draws is correct for every mode.

### Out of scope for M5

Emergent A-frames (a focus component making its own peak), swell-direction
dependence of the fit (β is fitted at the canonical model card; a different
swell re-derives α through M4 naturally), and any claim that the invented
reef is Pleasure Point's actual geology — it is a plausible wedge fitted to a
surf-description target, and every surface that shows it says "synthetic".


## M6 — the curl (steepness, not sculpture)

**Status: SPEC. Parts 1 and 3 are independent of M4/M5 and can land now;
part 2 reports honestly and waits on M5; part 4 is optional.**

The lip machinery already exists — Tessendorf choppy convergence, a pocket
term, `u_breakShape` face anatomy, lip throw and downward curl. The crest
still does not overturn convincingly, and measurement says that is not because
a term is missing. Three quantities are wrong, and two of them are one-line
consequences of constants set before the seabed existed.

### 1. The Gerstner cusp is never reached — **LANDED 2026-08-10, CORRECTED 2026-08-11**

**Correction:** the landed form asserted the cusp at `Q = lam·k = 1`. That
derivation is amplitude-blind and wrong — the cusp is `S = lam·a·k² = 1`, so
the "Q = 1.13" measured on 2026-08-10 was S ≈ 0.55 and never overturned. The
shader now parametrizes in S and solves `lam = S/(a_local·k²)`, reaching the
cusp by construction at any amplitude. Size enters via the breaking-excess
gate. Full derivation and the renderer-wide size sweep that caught it:
docs/research/SIZE_AUDIT.md.

In the Gerstner parametric form the horizontal offset is `(Q/k)·∂h/∂x`, so this
codebase's `lam` (metres, multiplying a dimensionless gradient) IS `Q/k`:

    Q = lam · k

With `LAM = 90 m` fixed, `k = 0.0698` and the cusp — where the crest develops a
vertical tangent and begins to overturn — sits at **lam = 1/k = 14.3 m**.
Measured maxima (steep = 1, pocket = 1, i.e. the most favourable point on the
whole stage):

| preset | ξ authored | plunge | lam max | **Q max** |
|---|---|---|---|---|
| Sewers | 1.15 | 0.96 | 17.4 | **1.21** |
| First Peak | 0.85 | 0.50 | 10.8 | 0.75 |
| The Hook | 0.80 | 0.41 | 9.4 | 0.66 |
| Second Peak | 0.65 | 0.16 | 5.8 | **0.40** |
| Jack's | 0.50 | 0.01 | 3.7 | 0.26 |
| Sharks | 0.45 | 0.00 | 3.5 | 0.24 |
| Privates | 0.35 | 0.00 | 3.5 | 0.24 |

Six of seven presets cannot cusp, so no amount of lip-throw tuning will make
them curl — the crest can only round over. Only Sewers crosses, and barely.

Fix: make the cusp explicit rather than emergent from three multiplied
constants. Compute `Q = lam·k` in the shader, report it, and drive it from the
breaking state — `Q → 1` as the wave reaches the break criterion, `Q > 1` only
where the criterion says it is overturning. `lam` stops being a hand-tuned
metre value and becomes `Q/k`, which is dimensionless, physical, and survives
the wavelength becoming variable in part 3.

### 2. ξ is authored, and the measured seabed disagrees — **READOUT LANDED 2026-08-10**, driver waits on M5

`plunge = smoothstep(0.45, 1.25, ξ)` gates every lip term, and ξ is typed into
the preset bank. Computing it from the corrected submerged plane slope
(MODEL.md 2.2 correction) and the model card's own H₀ and T:

    ξ = tan(β) / √(H₀/L₀)

| preset | ξ authored | ξ measured |
|---|---|---|
| Sewers | 1.15 | **0.19** |
| Second Peak | 0.65 | **0.26** |
| Sharks | 0.45 | **0.29** |
| Privates | 0.35 | **0.33** |

Every preset is authored more plunging than its bathymetry supports, and all
seven measure **spilling** (Battjes ξ < 0.5). This is the same finding as the
peel angle, arriving through a second door: a 1:58 ramp does not plunge.
Feeding measured ξ in today would zero the lip on all seven.

So: derive ξ, report both numbers in the HUD (`ξ 0.65 authored · 0.26
measured`), and keep the authored value driving the render until M5's reef
raises the local slope enough for the measured one to mean something. Do not
silently swap it — that would replace a wave that looks wrong with no wave.

### 3. The wavelength never shoals — **STEP 1 LANDED 2026-08-11, `#psi=1`, water only**

**Status:** the phase field runs on the baked Ψ behind `#psi=1`, default OFF.
Steps 2–4 of the staged path below (rider, audio, flip the default) are open.
Physics extracted to `web-three/js/dispersion.js` — pure, THREE-free, and
covered by `tests/dispersion.test.js` (9 tests, headless).

**Two claims in the original text below were wrong, and measurement caught
both:**

1. **The dispersion formula was miscited.** `bed.js` computed
   `k·h = y/√(tanh y)` while citing Guo (2002) and claiming "within ~1%". That
   is a different approximation and its measured max error is **4.98%**, at
   y ≈ 0.69 (h ≈ 39 m at T = 15 s) — the intermediate-depth band the phase
   integral spends most of its length in. It passed every round-number
   spot-check and peaked between them, which is why the test sweeps the band
   rather than sampling it. Guo's actual form is
   `k·h = y/[1 − exp(−y^{5/4})]^{2/5}`, measured 0.79%, matching the paper.
   Nothing had shipped on the wrong one — the bake was dormant.

2. **"Modelled steepness decreases approaching the beach, which is backwards"
   is half wrong.** Measured on the model's own amplitude path (H₀ = 1.5,
   T = 15): steepness peaks at the breaking depth and falls inshore of it in
   *both* the frozen and the variable-L model. That fall is correct — a bore
   decays, it does not keep steepening. The real defect is the **dynamic range
   of the approach**:

   | | h = 10 m | at break (h = 2.86 m) | ramp |
   |---|---|---|---|
   | frozen L = 90 m | 0.0181 | 0.0245 | **1.35×** |
   | variable L | 0.0110 | 0.0271 | **2.46×** |

   With L frozen the wave arrives almost as steep as it started, so there is
   nothing for the fold to develop out of. Variable L nearly doubles the
   steepening ramp. That — not a sign error inshore — is the measured reason
   the crest peaks and subsides. `tests/dispersion.test.js` asserts both halves,
   so the defect stays proven and cannot silently return.

**What landed, and what it measures.** Crest spacing at Second Peak now reads
**104 → 55 m** across the stage (HUD `wavelength` row) against the frozen 90 m,
bracketing the 107 → 61 m predicted below. The frozen constant is right at
~3.7 m depth and 36–40% too long through the inner surf zone, which is the part
in frame. Verified in-browser at matched preset/camera/sim: no shader compile
error, no console errors, no NaN or mesh detonation, crest structure carries
further inshore, and the pre-existing plate artifacts near the takeoff are
present identically in the `#psi=0` capture (not introduced here). Unmapped
sites report `L 90 m (frozen)` and render unchanged — both `kLocalAt` and
`rayPhase` gate on `u_psiMix * u_depthMix`, so a synthetic stage cannot pick up
a depth-derived wavelength it has no depth for.

**Known and expected under `#psi=1`:** the rider drifts off the crests. The
water moved to Ψ; `surferState`/`m4RideSolve`, `sound.js`'s crest solve and
`setEnv`'s group speed (`cg = LAM/2T`, which also feeds `setupLiftM`) are all
still on the constant-φ plane wave. That is step 1's declared boundary, not a
regression — and it is why the default stays off.

**Open defect — the group speed has two authorities (recorded 2026-08-12).**
The model carries two irreconcilable values of `cg` at once:

- **The set envelope and setup**: `setEnv` (model-glsl.js, mirrored in
  model-js.js `setEnv` and sound.js `updateAudio`) and `setupLiftM`
  (model-glsl.js) use `cg = 0.5·LAM/T` — half the *display* phase speed. At
  T = 14 s that is 0.5·90/14 ≈ **3.2 m/s**.
- **The shoaling path**: Green's-law `Ks` everywhere it appears
  (model-glsl.js `ocean()`, bed.js's M4 march, dispersion.js `shoaledHeight`)
  uses the physical deep-water group speed `cg₀ = gT/4π` ≈ **10.9 m/s** at
  T = 14 s.

A factor of **3.4×**. The deep-water relation `cg = c/2` is being applied to
`LAM = 90 m`, which is not a deep-water wavelength — it is the display
wavelength of an already-shoaled ~15 s swell (deep-water L for T = 14 s is
gT²/2π ≈ 306 m) — so the envelope's groups crawl at a speed no linear theory
assigns to this swell at any depth. Consequence: set groups take ~3.4× too long
to traverse the stage, so the spacing between sets in *space* (and the lag
`setupLiftM` sees between offshore envelope and shoreline surge) is wrong even
where the beat period 1/dF is right. TODO Track 6's temporal-audit item ("is
the 3.4× group-speed error visible?") is this defect. **Not fixed here**: moving
`cg` changes the set cadence the whole screensaver is tuned around, and it is
gated on the deferred waveform work (M6 part 3 steps 2–4) — fix the envelope's
transport when the phase field's consumers move, not before.

### The original problem statement (kept — the table is still the target)

`LAM` is a constant 90 m. Real overturning is driven by steepness `H/L`, and in
shallow water `L = T√(gh)`, so at Second Peak the wave should compress across
the surf zone:

| | offshore (h = 6 m) | at break (h = 1.9 m) |
|---|---|---|
| Second Peak | 107 m | **61 m** |
| Sewers | 115 m | 79 m |
| Privates | 92 m | 36 m |

Frozen at 90 m, `L` cannot fall, while `H` is capped by `γh` and therefore
*falls* inshore — so modelled steepness **decreases** approaching the beach,
which is backwards, and is why the crest peaks and then subsides instead of
pitching.

**The machinery for this already exists and is dormant.** `bed.js
bakeRefraction` integrates `Ψ(contourZ) = ∫kz dz` with `k(h)` from Guo (2002)
explicit dispersion, plus `psiAt` / `zcAtPsi` / `incidenceAt` CPU twins. It was
built and reverted on 2026-08-10 (MODEL.md 2.4) because the rider, audio and JS
twin all assume a constant-φ plane wave — not because the phase was wrong; it
verified at 17.1° → 9.4° → 7.9° and a 90 m mean wavelength matching LAM.

Reinstating it buys the wavelength compression AND depth-varying refraction in
one move. The staged path that avoids the revert's failure mode:

1. ~~Land `rayPhase` on the baked Ψ behind a flag, water only. Rider keeps the
   constant-φ closed form; nothing else moves.~~ **LANDED 2026-08-11 (`#psi=1`).**
   `rayPhase()` and `kLocalAt()` in `model-glsl.js`; call sites moved are
   `ocean()`'s `theta`, `breakerLifecycleAtX`'s `thetaBreak` (or the crash
   detaches from the crest that causes it), `choppyPos`'s `thetaRaw` and the
   S-form's `kk`, and the legacy-foam `tSince`. The S-form needed the local `k`
   too: the cusp is `S = lam·a·k²`, so a frozen `k` mis-solves `lam` by
   `(k_local/k_LAM)² ≈ 1.9` in 2 m of water.
2. Move the rider onto `u_surferPos`, solved CPU-side against Ψ — the same seam
   M4 already uses. The zipper x stays closed form (`x = (ωt − 2πn − Ψ(0))/κ`,
   `V_p = ω/κ`); only z needs the `zcAtPsi` inversion.
3. Port `sound.js`'s crest solve to Ψ.
4. Flip the default; delete the constant-φ branch for mapped spots, keep it for
   Privates and the A-frame, which have no depth to refract over.

### 4. A thrown lip is a surface the height field cannot represent (optional)

Past the cusp a real lip is multivalued in z: the crest passes over the trough.
A displaced height field self-intersects and z-fights, which the M2 spec
explicitly accepted. If parts 1–3 leave the fold unconvincing, the standard fix
is Müller et al., *Real-time Breaking Waves for Shallow Water Simulations* —
promote the crest band to explicit geometry (a swept ribbon or particles) where
`Q > 1`, and blend it back into the height field behind the zipper.

Scope this only after 1–3, and only if measurement says the fold is the
remaining defect. It is a renderer change, not a model change, and it is the
one piece here that cannot be verified by a number.

### Order of work

1. ~~Parts 1 + 3~~ — **part 1 landed 2026-08-10** (Q explicit, cusp-limited),
   **part 2's readout landed** (HUD reports authored vs measured ξ). Part 3
   still open and is now the live item.
2. Part 3: cusp-limited `Q` on a SHOALING `k`. Part 1 made the cusp reachable;
   until `L` compresses, steepness still falls inshore, so the crest cusps at
   the pocket and then subsides rather than pitching through. Measured after
   part 1: the numbers cross the cusp but the fold does not yet read.
3. Re-measure. Expect spilling character on this DEM: correct, and M5's remit.
4. Part 4 only if the fold is still the defect.

### Acceptance

- ~~`Q` reaches 1.0 at the break on every mapped preset~~ — wrong as written,
  corrected on implementation: a **spilling** crest must NOT overturn, so the
  criterion is that `Q` crosses 1 only where ξ says plunging. **LANDED**:
  effective Q attained on the stage over a 160 s sweep is Sewers 2.03,
  Second Peak 1.13, Sharks 0.95 (was 1.21 / 0.40 / 0.24). The cusp now sits
  exactly on the spilling/plunging boundary, which is where physics puts it.
- ~~wavelength measured at the break within 10% of `T√(gh)`~~ **MET** —
  within 0.2% at every preset H₀, asserted in `tests/dispersion.test.js`.
- ~~steepness `H/L` increases monotonically shoreward through the surf zone~~
  **WITHDRAWN as written** — it decreases inshore of the break in any correct
  model, because a bore decays. Replaced by: the steepening ramp from h = 10 m
  to the break must exceed 2.2× (measured 2.46×, vs 1.35× frozen), and
  steepness must peak within 15% of the breaking depth. Both asserted.
- ~~HUD reports `Q`, local `L`, and ξ authored vs measured~~ — `L` landed as a
  `wavelength` row reading `104 → 55 m (shoaling)` or `90 m (frozen)`; ξ landed
  with part 2. `Q` still to add.
- the rider's p90 face height (MODEL.md 2.3's metric) does not regress below
  0.9 when the phase moves onto Ψ
- no NaN in the displaced mesh: `Q > 1` self-intersects by design, and the
  existing offset clamp and finite guards must still hold

## Out of scope (unchanged from MODEL.md §5)

Barrel-interior POV camera, true fluid sim, swash/kelp/cliff geometry (cliffs
may come later as a backdrop card), audio reactivity (that's the Psychodeli
port's job, after web-three proves the look).

## The A-frame, and what killing it revealed (2026-08-11)

Measured with `scripts/measure_takeoff.mjs` (takeoff = argmin S over the stage;
"crests" = whole wavelengths that fit on each branch of it).

| state | A-frames | right-branch crests |
|---|---|---|
| as shipped | 8 / 18 | 1.2 – 3.0 |
| per-spot reef window | 9 / 18 | 1.2 – 2.6 |
| + α fit widened to the full stage | **13 / 18** | 1.3 – 3.0 |
| + direction constraint on the baked line | **0 / 18** | **0.0 – 1.2** |
| + wave-scale (90 m) smoothing first | **0 / 18** | 0.0 – 1.2 |

Three things this settles.

**1. Direction cannot be derived, only declared.** Widening the α fit from 32 m
to the whole stage made the split *worse*, not better. A bounded additive reef
on a measured DEM can move the mean slope of the break locus; it cannot hold
the sign of the local slope. MODEL.md §4.5's rule is not a stylistic preference
— it is what the measurement forces.

**2. Declaring it works.** Constraining the baked locus so its crest label never
decreases (running max, which flattens reversals into closeout sections rather
than inventing a left) takes the A-frame to zero on every spot and size.

**3. And it costs the entire peel — which is the real finding.** With direction
enforced, the right branch carries under one wavelength almost everywhere: the
breakpoint crosses the whole stage in less than one wave period. That is a
closeout. Wave-scale smoothing first does not recover it.

So **the peel angle this model currently renders is coming from small-scale
wander in the depth locus, not from a coherent reef slope.** Take the wander
away — which is exactly what enforcing one direction does — and there is almost
no peel left. That is the same finding M5 was built to address ("the DEM smooths
the bedding into a featureless ramp") arriving through a third door, and it says
M5's synthetic wedge is not yet supplying the peel either: the noise is.

The constraint ships behind `#peeldir=1`, default OFF — it trades a wrong wave
for a duller one, and neither is shippable. The next move is not another
constraint. It is to make the reef actually produce a sustained oblique locus,
which means a component that a tilted plane cannot express: a seaward-convex
nose (Mead & Black's *focus*/*pinnacle*, already in the taxonomy in
`docs/research/SURF_SCIENCE_REFS.md` §2.2 and not yet built).

### The peel is the noise — measured to a conclusion (2026-08-11)

Continuing the table above. Two more interventions, and the chain closes.

| state | A-frames | right-branch crests | derived α vs target |
|---|---|---|---|
| as shipped | 8 / 18 | 1.2 – 3.0 | 38/38, 50/49, 58/57, 62/62, 48/47, 66/67 |
| + interpolated break crossing | 13 / 18 | 1.3 – 3.0 | — |
| + 90 m wave-scale locus smoothing | **4 / 18** | 0.2 – 1.8 | **5–28° vs 38–66°** |
| + reef fit re-run against the smoothed locus | — | — | **still 5–28°** |

**The break crossing was quantized** to the 2 m march step with no interpolation
(`markBreak` returned the step, not the zero of `H₀K_s − γh`). Fixed — it is
strictly more correct — and it changed the A-frame count not at all. So the
locus wander is real structure, not march quantization. Kept.

**Why the wander is so large.** The residual of the measured bed against its own
fitted plane is only 0.31–0.93 m. But the bed slopes at about 1:75, so an
elevation residual of 0.9 m displaces the break crossing by ~70 m. The peel
signal the reef is fitted to carry is ~5 m of z per bake step. **The noise runs
4–13× the signal.**

**Smoothing at the wave's own scale is right and it works** — a crest 60–100 m
long cannot break at a 5 m wiggle any more than it refracts off a pebble.
A-frames fall to 4/18 (and the four survivors are Sewers and The Hook, the two
spots with the most pronounced geometry), the peel survives, and the cliff view
shows long continuous lines instead of notched ones.

**And α collapses with it, to 5–28° against 38–66° targets.** Re-running the
reef fit against the smoothed locus — the right thing to do regardless, since
fitting a raw march while rendering a smoothed line is the same authority split
as everything else here — does not recover it. β clamps out.

**Conclusion: the peel angle this model renders is the noise.** Not partly. The
reef contributes 5–28° of obliquity; everything above that was locus wander
amplified by a 1:75 bed. A planar wedge capped at 3.2 m of relief and clamped
below −0.5 m NAVD88 cannot produce a sustained oblique break line on this
bathymetry, which is precisely the question the fit was supposed to settle.

Smoothing therefore ships behind `#smooth=1`, **default off** — on by default it
would trade one torn wave for seven identical mushy ones, and losing the spot
taxonomy is worse than the tear. Three A/B flags now bracket this: `#psi=1`
(shoaling wavelength), `#smooth=1` (wave-scale locus), `#peeldir=1` (direction
constraint). None is shippable alone. All three are measured.

**What M5 needs.** A component a tilted plane cannot express: a seaward-convex
nose — Mead & Black's *focus* (convergence, local peak in H, easier takeoff)
or *pinnacle* (abrupt, small-area, defines the takeoff zone), both in
`docs/research/SURF_SCIENCE_REFS.md` §2.2 and neither built. The acceptance is
now sharp and already scored by `scripts/measure_takeoff.mjs` plus the α
readout: **A-frames at 0, right branch above 1.5 crests, and derived α within
tolerance of target — all three at once, with `#smooth=1` on.** No
configuration tried so far achieves two of them together.

### The nose, first build (2026-08-11) — `#nose=1`, default off

Mead & Black's *focus*/*pinnacle*: the component a tilted plane cannot express.
Built as the simplest form that could work — the reef crest **deepens
down-point** instead of holding one elevation along its whole length.

The mechanism it targets: `markBreak` returns the **seaward-most** crossing, and
a wedge lifted toward a single crest elevation meets the break criterion at the
same depth everywhere along itself. So the crossing went to whichever natural
shallow patch happened to sit furthest out — the reef never owned the line, the
DEM's accidents did. That is the 22–70 m locus wander behind all three symptoms
(the A-frame, α collapsing under smoothing, the 43° α swing for 0.3 m of swell).
A real point is shallowest at its apex and falls away down-point; tilting the
crest the same way makes the wave break first at the top and progressively later
down it.

**The v1 table that stood here is withdrawn (2026-08-12).** It claimed the nose
moved Second Peak 55 → 59, and re-measurement found `#nose=1` **bit-identical to
default on Second Peak** under that build — the published numbers could not have
come from the shipping instrument. Its wide-stage collapse column (α → 1–3° on
the four spots over 277 m) was real for v1, and the cause suspected below was
confirmed: the deepened crest fell below the natural bed and
`lift = max(crestEl − em, 0)` zeroed the reef down-point. That is why v2
(`fc062a7`) tapers the uplift **amplitude, in stage fraction, relative to the
natural bed** (`REEF_NOSE_FRAC` in bed.js) instead of tilting the crest
elevation toward a datum the bed can out-climb. The confirmed diagnosis from
the first build, kept for the record:

> the deepened crest eventually falls below the natural bed, at which point
> `lift = max(crestEl − em, 0)` is zero and the reef simply stops existing
> down-point. Over a 300 m stage the drop reaches ~2.3 m against a reef capped
> at 3.2 m of relief. The fix is not a smaller gradient — it is deepening
> relative to the **natural bed** rather than to a fixed datum.

### The nose, re-measured (2026-08-12) — v2, post V-fix

Current build: nose v2 plus the V-fix parts 1–3 (`db61da0` reef cross-shore
bound + break-line slew limit, `6c4e2f6` branch-following crossing selection),
which changed the very line the nose acts on. Instrument: one headless page per
config at `#preset=<spot>&sim=42&hud=0` (± `&nose=1`, i.e. the tuned
`REEF_NOSE_FRAC = 0.25`), reading `__pointbreak.takeoffProfile(1)`,
`lineProbe(4.72)`, and derived α at x = 0 (`derivedAlphaDeg`, the HUD
instrument). Cells read **nose off → nose on**.

| spot | stage span | target α | derived α (x=0) | takeoff frac | left crests | right crests |
|---|---|---|---|---|---|---|
| Sewers | 277 m | 38 | 38.4 → 38.5 | 0.50 → 0.50 | 1.87 → 1.86 | 1.52 → 1.52 |
| First Peak | 113 m | 50 | 50.6 → 50.9 | 0.43 → 0.43 | 0.94 → 0.91 | 1.03 → 1.02 |
| Second Peak | 194 m | 58 | 63.4 → 62.1 | 0.28 → 0.28 | 0.77 → 0.75 | 0.94 → 0.91 |
| 38th | 312 m | 62 | 61.4 → 61.3 | 0.36 → 0.37 | 1.30 → 1.23 | 1.94 → 1.87 |
| The Hook | 289 m | 48 | 46.9 → 47.4 | 0.42 → 0.45 | 1.90 → 1.76 | 1.60 → 1.47 |
| Shark's Cove | 304 m | 66 | 48.5 → 39.5 | 0.38 → 0.37 | 1.40 → 1.13 | 1.60 → 1.33 |

What the numbers say, post V-fix:

- **The v1 wide-stage collapse is gone.** No spot loses its α to the nose the
  way v1's 38 → 3 did; the bed-relative taper keeps authority to the stage end.
- **The nose is close to inert at the tuned fraction** on five of six spots:
  |Δα| ≤ 1.3°, takeoff moves ≤ 0.03 of the stage. The branch-following
  selection now owns the line that v1's locus wander used to, so there is
  little left for the nose to fix.
- **Shark's Cove is the exception, and the nose makes it worse**: 48.5 → 39.5
  against a 66° target. Sharks is already the V-fix's residual α collapse with
  the nose off (48.5 vs 66 — TODO Track 1); the nose deepens that hole rather
  than filling it.
- Interior takeoffs everywhere (frac 0.28–0.50). At Sewers with
  left crests ≈ 1.9 that is the canon-true A-frame (decided 2026-08-11); the
  other spots' left branches sit at or under ~1.5 crests.

Ships behind `#nose=1`, default off. Four A/B flags now: `#psi`, `#smooth`,
`#peeldir`, `#nose`.

### The ensemble, judged (2026-08-13) — Track 1c: REJECTED

Track 1c's premise was that each flag fixes a different §4.5 defect, each fails
alone, and the candidate shipping default is a combination. Measured:
`scripts/measure_ensemble.mjs`, one fresh headless page per (spot, config) at
`#preset=<spot>&sim=42&hud=0` — the nose re-measure's instrument, whose `base`
rows reproduce that table's numbers exactly. Matrix: baseline, each flag alone,
the full ensemble, and leave-one-out of the full ensemble; then an H₀ ± 0.3 m
sweep on `base` and `full`. Score = the acceptance triple all-at-once (A-frames
0 with Sewers exempt, right branch ≥ 1.5 crests, |derived α − target| ≤ 5°).

| config | pass | spurious A-frames | mean \|Δα\| |
|---|---|---|---|
| base | 1/6 | 3 | 4.3° |
| psi | 1/6 | 5 | 4.3° |
| smooth | 0/6 | 0 | 28.2° |
| peeldir | 0/6 | 0 | 44.5° |
| nose | 1/6 | 3 | 5.5° |
| **full (all four)** | **0/6** | 0 | 44.5° |
| full − peeldir | 0/6 | 3 | 26.7° |
| full − psi / − smooth / − nose | 0/6 | 0 | 44.5° |

Three findings, and a verdict.

**1. The ensemble is dominated by its worst member.** Every combination
containing `#peeldir` is indistinguishable from `#peeldir` alone: α ≈ 8–10° on
all six spots, takeoff pinned to a stage edge, zero whole crests on either
branch. The running-max constraint now runs *after* the V-fix's
branch-following selection already picked one branch by continuity, so it no
longer trades a wrong wave for a duller one — it flattens an already-coherent
line into an edge-to-edge closeout. Flags that "each fail differently" do not
compose into a fix; the kill switch wins.

**2. Without peeldir the ensemble still loses the peel.** `psi+smooth+nose`
lands at α 15–48° against 38–66° targets (mean |Δα| 26.7°) and keeps 3
A-frames anyway. Smoothing still eats what the noise was supplying, and the
nose at its tuned 0.25 cannot replace it — post V-fix confirmation of "the
peel is the noise", now at ensemble strength.

**3. The H₀ swing makes the noise-ownership vivid.** Baseline α across
H₀ ± 0.3 m: Sewers 0.5° and The Hook 3.0° (ok), First Peak 10.5°, Jack's
22.3°, Second Peak 39.4°, **Sharks 56.9°** (48.5° → 3.2° for 0.3 m less
swell). The acceptance's "< ~5° swing" fails 4/6 on the config that hits the α
targets. `full` swings 1–7° — stable because it is uniformly dead at ~9°.

**Verdict: no flag combination ships.** The choice the matrix leaves is
stability-of-the-dead or accuracy-of-the-accidental. The defect is unchanged
and now bounded on two sides: the reef must produce a sustained oblique locus
*strong enough to survive wave-scale smoothing*, and the nose as built cannot
(its fraction clamps at 0.30 and it is near-inert at 0.25 while making Sharks
worse). `#peeldir` is superseded by branch-following selection and is a
candidate for deletion, not for a default. M6p3 steps 3–4 no longer "ride with
the ensemble" — a `#psi` default flip must be judged on its own merits, noting
psi raises spurious A-frames 3 → 5 by fitting more (shorter, correct) crests
onto branches the takeoff instrument then counts as rideable.

### The nose, swept to its bound (2026-08-13) — the taper is exhausted

1c' asked whether *any* nose fraction can own the line, since the tuned 0.25
sat under a 0.30 tuning clamp. The clamp is raised to the definitional bound
(`REEF_NOSE_FRAC_MAX = 1.0` — all relief spent by the stage end; the shipping
default stays 0.25) and `scripts/measure_nose_sweep.mjs` sweeps
f ∈ {0, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0}, each fraction bare and under
`#smooth=1` — the acceptance condition, where the noise-peel is gone and only
reef authority remains. Instrument gotcha caught on the first run: `#nose=1`
is the tuned-shorthand in the hash parser, so the f=1.0 cells silently
re-measured 0.25 (bit-identical rows were the tell); the script now emits
decimals.

| f | bare mean \|Δα\| | smooth mean \|Δα\| |
|---|---|---|
| 0 | 4.3° | 28.2° |
| 0.25 | 5.5° | 26.7° |
| 0.4 | 6.0° | 33.0° |
| 0.55 | 8.3° | 35.3° |
| 0.7 | 12.0° | 35.0° |
| 0.85 | 11.6° | 37.8° |
| 1.0 | 16.9° | **48.9°** |

**No fraction passes the triple on more than 1/6 spots in either mode.** Under
smoothing the sweep is monotone-worse past 0.4 and ends at α ≈ 0–8° everywhere
at f=1.0: the nose is a *taper* — it can only remove relief down-point — so
turning it up starves the very authority smoothing demands. Bare, the fit
holds to ~0.4 and then breaks spot by spot (Jack's 62 → 30 at 0.55, 24 at
0.7). One secondary note for the Sharks residual: bare f=0.55 is the only
configuration measured that *improves* Sharks (48.5 → 55 vs 66) and cuts
spurious A-frames to 1, but it buys that by breaking Jack's.

**Verdict: the nose mechanism is exhausted.** An amplitude taper on a planar
wedge cannot produce a sustained oblique locus that survives wave-scale
smoothing at any strength. 1c' narrows to two options: (a) revisit
`REEF_AMP_MAX` — the 3.2 m Mead & Black relief band is what the ~0.9 m DEM
residual on a 1:75 slope out-shouts, so reef authority under smoothing needs
either more amplitude or a different shape; or (b) accept the noise-peel
(which hits α targets 4/6 unsmoothed) and treat its real defects directly —
locus hysteresis across H₀ rebakes for the 10.5–56.9° swing, plus the
per-spot A-frame residuals. (b) is the screensaver-mission read: the noise
IS this DEM's actual small-scale structure; its sin is instability, not
wrongness.

### The H₀ swing, diagnosed (2026-08-13) — mostly the ruler, partly the wave

Option (b) — accept the noise-peel, fix its real defects — starts with the
10.5–56.9° derived-α swing across H₀ ± 0.3 m. Before patching it, three
candidate causes that want three different fixes: a discrete **branch flip** in
the crossing selection, honest **smooth migration** of the locus, or a
**diagnostic artifact** of reading a 3-texel local slope at one station.
`scripts/measure_h0_swing.mjs` sweeps H₀ in 0.05 m steps and reports the whole
locus — α at x = 0, α median over the stage, and the station-by-station move
against the previous step.

**Probe correction, recorded because it nearly produced a wrong conclusion.**
The first version took its median over the entire ~600 m bake rather than the
113–312 m rideable stage, and returned a line-wide swing of 1.7–3.4° — which
would have said "the line is stable, only the ruler moves." That number was
the flat, stable flanks outvoting the stage. Stage-restricted, the same sweep
gives **7.4° (Sharks) and 9.6° (Second Peak)**. MEASUREMENT_LESSONS 2.

| spot | α swing at x = 0 | α swing, stage median | max single-step locus move |
|---|---|---|---|
| Sharks | 57.9° | **7.4°** | 102.8 m at H₀ 0.85 (87% of stations moved > 5 m) |
| Second Peak | 41.8° | **9.6°** | 15.7 m |
| Jack's | 25.2° | — | 151.7 m at H₀ 0.90 (61% of stations) |
| Sewers | 0.5° | — | 16.6 m |

Three findings.

**1. The acceptance instrument overstates the swing 4–8×, and at Second Peak
it has the wrong sign.** As H₀ goes 1.2 → 1.8 m there, the stage median rises
12.0° → 20.5° (the line gets *more* oblique) while α at x = 0 collapses
66.8° → 27.4°. A station readout that moves opposite to the line it is
sampling cannot be the acceptance criterion for "the wave's character is
stable."

**2. The swing is nevertheless real.** 7.4–9.6° stage-wide still fails the
< 5° band. Smaller than recorded, not absent.

**3. Genuine discrete flips exist, confined to the low-H₀ tail.** Sharks moves
102.8 m — 87% of stations — for a 0.05 m step at H₀ 0.85, and reads α ≈ 4–5°
(a closeout) below 0.80 against ≈ 11° above it. Jack's does the same at 0.90.
These are branch flips in `markBreakCrossings`' candidate set, not migration.

### Where the peel actually lives (2026-08-13)

`scripts/measure_alpha_profile.mjs`, default ocean, unsmoothed, stage-restricted.
Motivated by the above: the reef fit's station set (`xs = [-16, -8, 0, 8, 16]`)
and the acceptance station (x = 0) are the same neighbourhood, so the
instrument may be certifying the fit rather than the wave — MEASUREMENT_LESSONS
4 in a new costume.

| spot | target | stage | α in fit window | α outside it | decile medians across the stage |
|---|---|---|---|---|---|
| Sewers | 38 | 257 m | 38.7 | 38.8 | 15 15 25 71 67 38 39 39 44 49 |
| First Peak | 50 | 113 m | 48.5 | 54.9 | 22 59 70 67 24 48 49 51 56 52 |
| Second Peak | 58 | 194 m | 62.4 | **6.3** | 2 60 63 52 55 40 4 5 5 6 |
| Jack's | 62 | 312 m | 61.1 | **11.4** | 1 1 71 59 61 54 44 6 1 8 |
| The Hook | 48 | 288 m | 46.9 | 30.2 | 24 23 56 72 43 45 48 41 15 1 |
| Sharks | 66 | 303 m | 56.1 | **9.6** | 11 7 60 65 62 53 11 0 4 8 |

The peel is **not** a 32 m island — it is a sustained oblique run covering
roughly 40–100% of the stage, which is better than §4.5's "crosses zero out on
the flanks" implies. But on Second Peak, Jack's and Sharks the run ends in a
**dead down-point third** that reads 1–8°, i.e. shore-parallel. Those are the
same three spots with the worst H₀ swing, and the mechanism now joins up: as
H₀ moves, the oblique run slides along the stage, so a fixed station crosses
from the run into the dead tail and reads a 40–58° "swing" that the line as a
whole never made.

One consequence for how this repo reports itself: "α on target 4/6 unsmoothed"
is a statement about the **fit window**, not about the wave. Stage-median α is
11° at Sharks and ~17° at Second Peak against 66 and 58 targets. Both claims
can be true at once; only the second one is what a surfer sees.

Whether the dead down-point third is a defect or a true inside closeout is a
judgement call, not a measurement — point breaks do shut down on the inside.
It wants a decision before it wants code.

### The anchor band, falsified — and the root defect as one number (2026-08-13)

Acting on 1c'-c: item 1 (retire α-at-x=0 as the acceptance criterion) landed;
item 2 (a deterministic fix for the low-H₀ branch flips) was built, measured,
and **falsified**. Recorded because the negative is more informative than the
patch would have been.

**What was built.** Not hysteresis — seeding the branch from the previous bake
makes the rendered line depend on the *history* of H₀ and breaks the
determinism M5 holds deliberately. Instead a declaration in the reef's own
terms: *the reef's line lies within one flank width (`REEF_FLANK_W`, 45 m) of
the reef's crest*, used to rank crossings — first at the branch-following
anchor, then at every station.

**Both forms measured bit-identical to default, at bands from 45 m down to
1 m.** The flag was proven live before the result was believed (it reported
the band the bake actually used), so this is an inert mechanism rather than the
`#nose=1` unwired trap — but the tell was the same, and checking cost one run.

**Why it cannot work.** A new instrument, `__pointbreak.crestOffset()`,
measures how far the drawn line sits from the fitted wedge crest it is supposed
to be the break of:

| spot | median \|line − crest\| | stage-median α / target |
|---|---|---|
| First Peak | 40 m | 50.8 / 50 |
| Sewers | 41 m | 38.8 / 38 |
| The Hook | 70 m | 38.9 / 48 |
| Second Peak | 108 m | 18.2 / 58 |
| Jack's | 114 m | 25.9 / 62 |
| Sharks | **191 m** | **11 / 66** |

The in-band set is empty at most stations on most spots, so the unfiltered
fallback runs everywhere and the band is a no-op. Its premise — that the line
is near the crest — is false on exactly the spots that need help.

**And that ordering is the finding.** Crest offset predicts peel quality
monotonically: the two spots inside one flank width hit their stage-median α
target; the three beyond 100 m miss by 32–55°; The Hook sits between on both
axes. This is the ROOT DEFECT — "the reef never owns the break line" — reduced
to a single measurable number with a threshold at roughly one flank width, and
it explains the whole 2026-08-13 sequence at once: why the ensemble fails, why
the nose taper is exhausted, and why a selection rule phrased in the reef's
terms has nothing to select among.

> **PARTLY WITHDRAWN the same day** — see "The reef-shape sweep" below. The
> correlation above is across SPOTS at one fixed reef shape and does NOT
> survive changing the shape: median crest offset stays at 105-121 m while mean
> |Δα| halves, and the ~105 m floor is structural (the crest sits at 0.75·h_b,
> the wave breaks at h_b). `crestOffset()` is a diagnostic for a line that has
> left the reef, not an objective. The objective is `stageAlpha()`.

MEASUREMENT_LESSONS 8 says repair-the-output fails where change-the-selection
works. The corollary this adds: **changing the selection only works when the
declaration and the candidates are in the same neighbourhood.** Branch-following
succeeded because continuity compares candidates to the *previous crossing*,
which is always nearby. A band compares them to the *wedge crest*, which is
40–191 m away. Any future declaration must be phrased against something the
candidates are actually near.

**Where this leaves the flips.** Unfixed and now correctly scoped: they are not
an anchor-selection defect, and they will not yield to a rule expressed in reef
coordinates while `crestOffset` stays this large. Closing the offset is the
same work as option (a) (`REEF_AMP_MAX` / wedge shape) — the flips are a
symptom of it, not an independent item. ~~`crestOffset()` is now the cheap
progress meter for that work: drive it under ~45 m and the rest should
follow.~~ **Withdrawn — minimise `stageAlpha()` error instead; see "The
reef-shape sweep".**

### The reef-shape sweep (2026-08-13, later) — flank is the lever, and there is a ceiling

Track 1c'-c.3, run with `scripts/measure_reef_shape.mjs` over
amp × flank ∈ {3.2, 5, 7} × {45, 80, 120}, all six spots, scored on
stage-median α with the M5 clamp invariants (`reefAudit`) checked per row so
that peel angle bought by deepening posts or breaching the −0.5 m ceiling is
reported as a failure rather than a win. The shape is re-asserted per row from
`__pointbreak.reefShape()`, so a stale cache cannot masquerade as "this shape
does nothing".

| amp | flank | on target | mean \|Δα\| | median crest offset | max raise | invariants |
|---|---|---|---|---|---|---|
| **3.2** | **45 (shipped)** | 2/6 | 23.6° | 108 m | 3.6 m | ok |
| 3.2 | 80 | 2/6 | **15.5°** | 121 m | 3.6 m | ok |
| 3.2 | 120 | 1/6 | 17.1° | 105 m | 3.6 m | ok |
| 5 | 45 | 3/6 | 20.6° | 107 m | 4.8 m | ok |
| **5** | **80** | **3/6** | **12.9°** | 105 m | 5.1 m | ok |
| 5 | 120 | 2/6 | 14.0° | 111 m | 5.1 m | ok |
| 7 | 80 | 3/6 | 12.9° | 105 m | 5.3 m | ok |

**1. Flank width is the lever; amplitude saturates.** 45 → 80 m nearly halves
the mean error at either amplitude (23.6 → 15.5 at 3.2 m, 20.6 → 12.9 at 5 m).
Amplitude 5 → 7 m changes nothing at all — the `bound` term and the −0.5 m
ceiling have already taken over. 120 m is worse than 80 m: past some width the
wedge stops being a reef and starts being a shelf, and the fit loses the strike
it was reading. **Every configuration keeps the clamp invariants** (0 deepened,
0 above ceiling, 0 dry posts, max raise ≤ 5.6 m), so nothing here is bought by
breaking M5's guarantees.

**2. There is a ceiling on achievable stage-median α, and it is not about reef
size.** Pushed to flank 160 and 240 at amp 5, the three failing spots do not
improve — Second Peak 39 → 32 → 34, Jack's 43 → 40 → 42, Sharks 35 → 37 → 33.
The spots whose targets are ≤ 50° (Sewers 38, First Peak 50, The Hook 48) land
on target; every spot whose target is ≥ 58° (Second Peak 58, Jack's 62, Sharks
66) plateaus in the 33–43° band whatever the wedge does. On this bathymetry the
wedge cannot express a stage-wide peel much past ~45°.

**3. And the fit reports success throughout.** At flank 240, `reefAudit`
residuals are −0.4°, 2.8° and 1.0° — the fit believes it hit 58, 62 and 66 —
while the stage-median α is 34, 42 and 33. The self-certification named earlier
today is now measured at every reef shape, not just the shipped one: β
converges on the ±16 m window and the stage does not follow it.

**4. Correction to this morning's claim about `crestOffset()`.** It was written
up as "the root defect reduced to a single number… drive it under ~45 m and the
rest should follow." **The sweep falsifies the actionable half.** Across shapes,
median crest offset sits at 105–121 m and barely moves while mean \|Δα\| halves
— 3.2/80 has a *higher* offset (121 m) than the shipped 3.2/45 (108 m) and a
much *lower* error. The correlation that made it look like a root-defect meter
was across *spots at one fixed shape*; it does not survive changing the shape,
and the ~105 m floor looks structural (the crest sits at 0.75·h_b while the wave
breaks at h_b, so some separation is expected and correct). Use `stageAlpha()`
as the objective. `crestOffset()` is demoted to a diagnostic — useful for
spotting a line that has left the reef entirely, not a thing to minimise.

**Where this leaves 1c'-c.3.** The cheapest honest improvement is **flank
45 → 80 m at the unchanged 3.2 m amplitude**: mean error 23.6° → 15.5°, the
Mead & Black relief band intact, invariants clean. Going to amp 5 buys another
2.6° and a third on-target spot but exceeds that cited band, which is a
fidelity claim in the docs and therefore Andy's call, not a tuning decision.
Neither closes the ≥ 58° spots, because finding 2 says the wedge cannot. That
leaves a genuine fork for the high-target spots: **either the wedge needs a
component that is not a widened plane, or those three α targets — which came
from surf-guide character descriptions, not measurement — are wrong.** Nothing
in the sweep can settle which; it needs the drone-capture validation pass.

### The retarget, landed (2026-08-13, evening) — 1c'-c.7 + 1c'-c.8 as one change

The bank now carries each spot's own physics ceiling as its α target, and the
flank ships at 80 m. The two were landed together deliberately: flank 80 does
not beat the ceiling, it gets spots up to it, so scored against the old 58–70°
targets it reads as a failure and scored against corrected targets it reads as
what it is.

Per-spot targets from the model's own geometry — h_b from the card,
h_s = the wedge's own seaward edge (crest depth + REEF_AMP_MAX + 1.2 m fade,
the depth at which `bound` ends the reef), sin(α_max) = c_b/c_s:

| spot | h_b | h_s | ceiling | old target | new target |
|---|---|---|---|---|---|
| Sewers | 3.88 m | 7.31 m | 47.3° | 38 | **38** (kept, inside) |
| First Peak | 3.22 m | 6.81 m | 44.0° | 50 | **50** (kept, measured exempt) |
| Second Peak | 2.78 m | 6.49 m | 41.4° | 58 | **41** |
| Jack's | 2.11 m | 5.98 m | 36.9° | 62 | **37** |
| The Hook | 2.70 m | 6.43 m | 41.0° | 48 | **41** |
| Sharks | 1.95 m | 5.86 m | 35.8° | 66 | **36** |
| Privates | 1.42 m | 5.60 m | 30.8° | 70 | **31** |

First Peak's exemption is named in `tests/peel-ceiling.test.js`, not silent:
it measures 50.8 stage-median against the 44.0° planar bound because it sits
at the apex, where the coast tangent carries ~111° of rotation
(PP_MAP_GEOMETRY) that a straight-contour bound cannot see. The test now
asserts every other target sits INSIDE its per-spot ceiling and that the bank
asks the smaller spot for the LOWER α — the pre-retarget contradiction, now
guarded in the failing direction.

Re-scored with `measure_reef_shape.mjs` against the corrected targets:

| amp | flank | on target | mean \|Δα\| | med crestOff | max raise | invariants |
|---|---|---|---|---|---|---|
| 3.2 | 45 | 4/6 | 7.2° | 47 m | 3.6 m | ok |
| **3.2** | **80 (shipped)** | **4/6** | **4.6°** | 72 m | 3.6 m | ok |

Against the old targets this same sweep read 2/6 at 23.6° — the improvement is
mostly the targets stopping asking for the impossible, and partly the wider
flank (7.2 → 4.6° at identical targets). Note the retarget moved the FIT too
(β seeds from α_target), so per-spot measured values shifted: Second Peak
35/41 and Sharks 26/36 are the residual misses, single-digit now where they
were 32–55° under the old bank; First Peak overshoots at 80 (55/50), the one
regression worth watching.

What "mellow down-point" means now that α no longer fakes it: sheltering.
`H_eff(u)` (MODEL.md §2.6.2) is the next item — the per-spot card H₀ already
encodes the gradient dishonestly (Sewers 2.2 m → Privates 0.7 m as seven
disconnected constants); the field version derives it from apex geometry so
one swell produces the whole gradient.

### The cadence audit, finally run (2026-08-13, evening) — Track 6

The 260-frame temporal run had never been executed by anyone since the harness
landed on 2026-08-11. It has now been run. Probe proved first, per
MEASUREMENT_LESSONS: `--verify-clock` reports **mean |ΔLuma| 0.000/255, max
0.0** between driven (`setSim`) and per-frame-reload capture at sim 200/202/214
— the injected clock is bit-exact, so every number below is about the model,
not the harness.

**1. SET CADENCE — VERIFIED, the first temporal claim this model has ever
passed.** Authored `1/dF` = 125.0 s. Measured over 518 s of sim at 2 s steps:
set peak in the foam residual **120.5 s (r = 0.74)**, and independently in mean
luma **120.8 s (r = 0.73)**. Two estimators, 3.6% low, agreeing to 0.3 s. Sets
arrive when the model says they do.

**2. GROUP SPEED IS 3.9× WRONG — M6 part 3, now measured in the time domain.**
Authored `cg = LAM/2T` = 3.00 m/s against the physical `gT/4π` = 11.71 m/s, so
the set band is 375 m where it should be 1464 m. This is the frozen-LAM defect
(tests/dispersion.test.js) showing up as *rhythm*, not just steepness, and it
is confirmed independently by the harness control: the measured cross-shore
carrier phase speed is **6.18–6.64 m/s (R² 1.00)**, which matches
`LAM/T = 6.00` and not `√(g·h_b) = 5.26`. The renderer is propagating a frozen
90 m wave. M6 parts 1+3 now have a second, temporal argument.

**3. THE PIXEL-SPACE α INSTRUMENT HAS NO LINE TO FIT — verdict withheld.**
Across three rigs the measured peel came out 7.5° / 8.8° / 4.3° against a
38° authored target and a `stageAlpha()` reading of 38° stage-median. Do NOT
record any of those as "the measured peel". The reason they disagree is that
the detector's per-column most-active bin **does not form a line**: it ranges
over 378 m of cross-shore (z −147…231) and the break-line slope fit returns
**R² = 0.00–0.05**. A slope fitted at R² = 0 is not a measurement of anything,
and the number moving 2× with framing is the tell.

Three candidate causes, NOT yet separated, and the next session should
separate them before anyone acts on this:
  (a) *the render doesn't express the peel* — the foam field is wide and
      unattached enough that no coherent line survives to pixels (Track 5,
      foam attachment, the standing "biggest visual gap");
  (b) *the detector is captured by a brighter non-break feature* — swash, the
      along-shore foam stripe the secondary estimator already warns about, or
      lagoon chop outcompeting the break band in summed residual;
  (c) *the 38° is real but invisible* — the baked line genuinely carries it
      and a 378 m-wide activity field simply buries it.
The cheap discriminator is to overlay the baked line (`lineProbe()`) on a
captured frame and look: if the line is where the detector isn't, it is (b);
if the line is where nothing is bright, it is (a). That is one capture, not a
sweep. Note this is CONSISTENT with the 2026-08-11 audit's independent finding
that authored α "collapses to ~8–10° visible crest angle" — two instruments now
say the picture does not show the peel the geometry claims, which is a
screensaver-mission problem (the wave is judged in 10 seconds of watching)
whatever its cause.

**4. FOAM PERSISTS ~4× LONGER THAN AUTHORED.** Authored τ = 6 s. Measured
Eulerian decorrelation e-fold 3.5–3.7 s but **Lagrangian (advection-following)
24.0 s**. Foam that is followed as it moves stays correlated four times longer
than the authored decay. Shoreward advection measures 5.50 m/s against a shader
front speed of 4.03 m/s. The linearity check (speed must agree across frame
separations) reads 5.50 / 4.96 / 2.63 m/s at 1/2/4 dt in the cadence run — it
degrades exactly where the Eulerian correlation has already died (0.08 at 8 s),
so the 1 dt figure is the trustworthy one and the check is really telling us
the sampling window, not a nonlinearity.

### 6b separated: the pixel α instrument is captured by the swash field (2026-08-13, late)

One capture, as prescribed. `lineProbe()` overlaid on the zipper run's own
frames, detector argmax compared per column:

- **The detector's most-active bin sits a mean of +117 m SHOREWARD of the
  baked line** (mean |offset| 119 m); of the 179 columns missing by >60 m,
  **177 miss shoreward**. Only 6% of in-stage columns land within the
  detector's own ±24 m band of the baked line.
- The far-miss columns are **brighter** than the near-line columns (mean
  summed residual 0.088 vs 0.069): sustained swash/shore-edge whitewater and
  mid-water residual patches outscore the transient crest foam in
  summed-over-time activity, so an argmax detector goes to them.

**Verdict: cause (b).** The 4.3–8.8° pixel readings measured the shoreline's
geometry, not the peel's — they are void and stay out of every summary. The
2026-08-11 audit's "α collapses to ~8–10° visible" number was produced by the
same class of instrument and should be treated as suspect for the same reason.

**What the overlay frame ALSO shows (recorded as observation, not verdict):**
up-point, the rendered foam mass hugs the baked line; down-point of
mid-stage, the line runs over dark water with no visible activity in that
frame. Whether the render ever expresses the line's down-point run cannot be
answered from this capture — the saved x-t profiles follow the detector's
contaminated band (corr(x, t_peak) = −0.47 there, but that band is mostly
swash). A residual (a)-question stays open in Track 5's foam-attachment item:
crest foam must outshine the bore field for the peel to read at all.

**Instrument fix, when Track 6 returns to this:** band the pixel measurement
to the baked line rather than the per-column argmax. Not circular — the
pixels are independent of the bake; banding measures exactly the question
"does the drawn field follow the line", and it satisfies the
MEASUREMENT_LESSONS 8 corollary (the declaration and the candidates share a
neighbourhood by construction).

### M6 part 3, closed out (2026-08-13, night) — steps 2–4 landed, #psi default ON

Step 2 (rider) turned out to be ALREADY BUILT — `m4RideSolve` solves in phase
and consumes `P.phaseFn` (its own header says so; the "steps 2–4 open" status
above was stale). Step 3 landed tonight: `sound.js`'s crest solve runs on
`rayPhase` under the same injection contract — exact legacy arithmetic when
the plane wave is live, numeric inversion (monotone bisection) under Ψ, with
off-span crests fading their voice. The group speed was unified in the same
commit: `setEnv` (GLSL + twin), `setupLiftM` and the audio envelope all now
run the physical `cg = gT/4π` the shoaling path always used, retiring the
3.4× two-authorities defect recorded 2026-08-12 (and measured as 3.9× in the
time domain by the cadence audit). The beat period 1/dF at a fixed point is
cg-independent, so the audit-verified 120.5 s cadence is unaffected; what
changes is the set band (375 → 1464 m — whole-point sets) and the
envelope-to-shoreline lag.

Step 4: `#psi` defaults ON. At flip time it is α-neutral (identical
stage-median to base on all six spots, post-retarget A/B) and the crest
spacing compresses 104 → 55 m across the stage against the frozen 90 m.
`#psi=0` is the A/B revert. One measured caveat carried forward: under psi
the interior-takeoff proxy flags 5 spots vs base's 4 — but base's own count
moved 3 → 4 across the retarget+sheltering session, and the proxy cannot
distinguish a real A-frame from a sheltering-shifted takeoff. That question
belongs to the Track 5 visual pass, not to more proxy sweeps.

### Whitewater ∝ broken area (2026-08-13, night) — 4a′ landed, `#wwarea`

The defect (ROUND2, confirmed by the 4a re-measure): `brk` reached the surface
only as an amplitude subtraction, no foam term scaled with the WIDTH of the
broken zone, and the one term covering it (the aftermath residue) sat under
the renderer's 0.15 foam gate. A dropping tide broke over 1.9–5× more area
and rendered only 1.3–1.8× more bright pixels.

The fix is one term in `ocean()`'s residue path: water whose shoaled height
still exceeds the depth limit (`excess > 1`) is actively re-breaking, so its
whitewater gets a boost that clears the gate across the whole broken band —
per-point and local; the area coupling emerges because per-point visibility
becomes tide-invariant. It stays on tSince's clock (1.8·τ, slower than the
0.3-coefficient legacy residue) so the between-crest lanes survive, reuses
the `clumps` noise already computed (ocean() runs 5×/vertex; zero new noise
calls), and is `u_depthMix`-gated. `#wwarea=0` reverts.

**Measured** (pinned nadir rig, 600 m, ±320 m window, The Hook, 32 frames /
128 s set cycle, identical sim clocks, tide −0.8 vs +0.7, bright-px sums):

| config | L≥205 low/high | L≥160 low/high |
|---|---|---|
| `#wwarea=0` (pre-fix) | 1.80× | 2.08× |
| tSince-free draft (v1) | 1.97× | 2.19× |
| + steady frozen-strip bore (v2) | **1.53×** | **1.85×** |
| shipped (clocked, Ψ-frozen zone excluded) | **2.66×** | **2.62×** |

Physical broken-area band: 1.93× (wet transect) – 4.95× (surf-zone band).
The shipped ratio sits inside it; residual compression (Beer–Lambert bottom
brightening at low tide, the gate's nonlinearity) is accepted.

**Two builds falsified on the way, recorded so they are not retried:**

1. **A tSince-free (sustained) term prints the Ψ-frozen zone.** `integratePsi`
   stops at 0.5 m depth on the reference transect and freezes Ψ from that
   contour-z in, so the phase field inshore of `zc = frozenFrom` is spatially
   uniform. Any VISIBLE phase-clocked foam there throbs as one block and its
   boundary prints as a razor edge — near-horizontal down-point (straight
   coast), kinked at the apex: exactly the notch/sheet measured at The Hook.
   The bake's own comment assumed "the shore fade has killed the wave there
   anyway" — true for amplitude, false for foam once foam is raised. The
   shipped term fades out over the 30 m before `u_refrFrozen` (new uniform,
   `bakeRefraction` now returns `frozenFrom`). A depth-keyed exclusion was
   tried first and missed: the freeze is a contour-z condition from one baked
   transect, not a local-depth one.
2. **A steady bore field inside the frozen zone DILUTES tide legibility**
   (v2 row above): the zone hugs the shoreline, its area is nearly
   tide-invariant, and excess is saturated there at both tides — it adds
   equal foam to both sides of the A/B and drags the ratio DOWN (and it
   re-brightens the swash that already captured the pixel-α instrument, 6b).

**Instrument note (MEASUREMENT_LESSONS 11):** the drone capture rig
auto-frames on bright water, so a foam change MOVES ITS OWN measurement
window — the first A/B pair happened to frame consistently, the v2 check did
not (camera z −96 vs 84 for the same hash). All numbers above are from the
pinned `--rig=nadir` camera, which cannot feed back.

α-neutrality: by construction — the change touches only foam accumulation;
the bake, its cache key, and the height field are untouched.

### The density-composite line, measured (2026-08-13, late night) — `#dline`

The Topanga candidate (TOPANGA_PEEL_ANGLE_2023.md: break line = density
composite over 35 min of breaking waves) adapted to the static bake: per
station, criterion crossings are collected over a ±15% effective-height
ladder (7 members) and kernel-smoothed (σ = 6 m) into a density over z.
Two forms, both behind `#dline` (default OFF):

- `dline=1` — density PEAKS feed the existing anchor/continuity selection.
- `dline=2` — the per-station density MODE **is** the line (the literal
  Topanga reading; no anchor, no selection knife-edge).

Measured with measure_h0_swing.mjs (13 H₀ points/spot, 0.05 m steps):

| config | Sharks aMed@card (36 target) | Sharks low-tail flips | Second Peak aMed@card (41) |
|---|---|---|---|
| baseline | 28.5 | chatter: fracBig 1.00 across 0.75–1.0, dzMax 50–100 m | 37.2 |
| `dline=1` | 26.3 | WORSE — bistable chatter every step (79–113 m) | 38.0 |
| `dline=2` | 26.2 | **one clean transition at 0.85** (110 m), fracBig ≤0.47 elsewhere | 36.9 |

Verdicts, recorded so they are not re-derived:

1. **dline=1 is falsified.** With candidates stabilized, the knife-edge moves
   into selection-at-anchor: two comparable density peaks straddle the crest
   reference and `nearest()` flips between them, continuity propagating the
   flip line-wide. (An absolute existence threshold — 0.8, ~one ladder
   member — was required first: the initial 0.30·max relative threshold let
   the near branch VANISH when the far branch accumulated density, which is
   the same jump the method exists to prevent.)
2. **dline=2 does what Topanga's method actually promises**: chatter becomes
   one clean transition at the physical bistability (H₀ ≈ 0.85 at Sharks,
   where the ladder itself straddles the branch change). It is the right
   form if flip-immunity is ever wanted as a default.
3. **No density form lifts Sharks' α** — 26–28 stage-median vs 36 target in
   every config, and the sub-0.85 collapse (aMed ~6) persists identically.
   Consistent with the recorded Snell bound (~35° at Sharks' shelf) and the
   dead down-point third: the 28/36 gap is wedge saturation, not branch
   selection. The remaining candidates are the rotating-strike wedge
   (1c'-c.10) or accepting the bound; selection-layer work is EXHAUSTED.
