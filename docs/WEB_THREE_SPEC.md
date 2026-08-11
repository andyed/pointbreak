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

**Status: PART-BUILT, behind `?m4=1`. Off by default — turning it on today is a
visible regression.**

**2026-08-10 note:** the measurements in this section pre-date MODEL.md §2.3
(break line onto the contour) and §2.4 (refracted crests). The 75–133 m locus
gap and the 0.20 rider ratio were mostly the frame error and are resolved;
gap #2 below may already be closed because the envelope now keys off the same
contour the depth was fitted to. Re-measure before building. What M4 still
uniquely buys is α varying with H₀ and tide — and it is the **substrate M5
requires**, which is now its main justification.

Built: the bake (`bed.js bakeBreakLine`), the 128x1 texture, the shader lookup
(`breakTexZ`/`breakLine`), the CPU twin (`breakZAt`), derived-alpha readout, and
the `u_surferPos` seam that lets the rider be solved CPU-side. The baked line
curves through the measured seabed as it should.

Not built, and why it is still gated:
1. **The rider solve picks an arbitrary station.** Many x satisfy "a crest is on
   the break line" — one per crest. Taking the smallest phase residual parked
   the rider at the stage edge (x = 262) in 0.56 m of water with a 6.59 m crest
   available at that same x. It needs to track the peel continuously along the
   line, not re-solve from scratch each frame.
2. **The amplitude envelope still does not follow the emergent line.** `grow`
   boosts only seaward of `zb` (`max(d,0)`), and `decay` keys off `brk`, so
   moving `zb` does not move where the model makes its tallest water. Until
   this is fixed, relocating the rider cannot help — measured ratio of face
   height under the rider to best crest at his x is 0.20 either way.

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

**Status: SPEC. Depends on M4. This is the answer to the honest cost recorded
in MODEL.md §2.4: with refracted crests over the measured DEM, all seven
presets arrive within a degree of each other (8.6–9.6° off shore-parallel) and
the peel runs 38–50 m/s. The taxonomy no longer differentiates — Sewers and
Sharks are the same wave.**

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

### Out of scope for M5

Emergent A-frames (a focus component making its own peak), swell-direction
dependence of the fit (β is fitted at the canonical model card; a different
swell re-derives α through M4 naturally), and any claim that the invented
reef is Pleasure Point's actual geology — it is a plausible wedge fitted to a
surf-description target, and every surface that shows it says "synthetic".

## Out of scope (unchanged from MODEL.md §5)

Barrel-interior POV camera, true fluid sim, swash/kelp/cliff geometry (cliffs
may come later as a backdrop card), audio reactivity (that's the Psychodeli
port's job, after web-three proves the look).
