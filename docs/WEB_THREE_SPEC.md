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

## Out of scope (unchanged from MODEL.md §5)

Barrel-interior POV camera, true fluid sim, swash/kelp/cliff geometry (cliffs
may come later as a backdrop card), audio reactivity (that's the Psychodeli
port's job, after web-three proves the look).
