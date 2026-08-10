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
- Authored presets: Cliff (16 m, fixed lineup), Drone (top-down ortho-ish),
  Follow (telephoto tracking surferState, zoom ∝ 1/distance).
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

## M4 — emergent break line

**Status: specified, not built. This is the largest remaining gap between the
model and the physics it claims.**

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

## Out of scope (unchanged from MODEL.md §5)

Barrel-interior POV camera, true fluid sim, swash/kelp/cliff geometry (cliffs
may come later as a backdrop card), audio reactivity (that's the Psychodeli
port's job, after web-three proves the look).
