# Attached foam volume preview

The opt-in `#breaking=1` surface remains a heightfield, even after repairing
its landing receiver, front compaction and lateral folds. Close renders still
showed a broad smooth top. The attached-volume pass adds actual curved,
opaque, depth-writing geometry to the existing aerated front. It is a visual
character experiment, not a fluid-volume simulation or a new breaking model.

## Ownership and motion

`web-three/js/breaking-foam-volume.js` consumes the existing `SURFACE_GLSL`.
It allocates only when explicitly created for the breaking preview. The
default renderer does not create its geometry or atlas.

768 alongshore source stations across 570 metres each carry two rolling
cohorts. Every frame, a 1536×1 three-attachment float atlas evaluates the
canonical surface on the GPU. The attachments contain centre/radius,
physical normal/gate, and physical forward tangent/rolling arc. The normal
renderer never reads this atlas back to the CPU.

Each station finds its just-passed crest using the existing ray phase, then
inverts `boreWedgeAt` over the first front quadrant. Permission, crest age,
body activity, domain fade and local physical carrier range all come from
the shared wave. Active curl suppresses attached volumes while the lip is
airborne. The same `breakingRollCycleAt` used by surface morphology drives
descent along the front and rotation; there is no independent event clock.
Each cohort now traverses the full front independently. A fixed instance
seed offsets its phase within the shared rolling clock; its radius reaches
zero at both ends before that instance wraps to the top. This replaces the
original two groups confined to separate halves of the front, which produced
conspicuous parallel rows.

The single carrier bank retires with
`1-smoothstep(.75*T,.98*T,max(age,0))` before the next canonical crest replaces
it. The next crest starts with the existing zero bore birth gain. This
prevents an outgoing row disappearing abruptly at the period boundary and
leaves the observed 7.5-second peel unaffected for T14/T16. Old residual foam
continues to belong to the surface material.

## Shape and bounds

Radius varies deterministically from 0.13 to 0.26 of the local physical
carrier range before the canonical visibility gate. Fixed instance seeds
also vary alongshore position, three axis lengths, yaw and initial roll.
Axis factors range from 1.25–2.10, 0.68–1.03 and 0.75–1.20 respectively;
centres remain embedded 0.60 radii into the actual surface. The
whole rotated ellipsoid's vertical extent is capped against the crest at its
source station and the known physical crest ceiling. An unknown negative
ceiling sentinel is ignored. VIS scales vertical display coordinates only.

The final mesh uses `SphereGeometry(1,12,8)`: 117 vertices and 168 triangles
per instance, or 179,712 vertices and 258,048 triangles declared across all
1536 instances. Invisible instances are clipped in the vertex shader. The
atlas computation is unchanged by this tessellation increase. Renderer
target, viewport, scissor and auto-clear state are restored after the atlas
pass. Paused-time uniform edits recompute normally; disposal is idempotent.

The separate `breaking-foam-material.js` supplies matte, opaque foam using
the existing sky/fog. Fine recess texture rotates with the real geometry.
Stable instance albedo varies by at most 3%; gentle, filtered sub-lobe
normal variation is attached to the rotating geometry and capped at roughly
12 degrees. It adds neither specular beads nor an independent animation clock.

## Evidence and limits

`tests/breaking-foam-volume.test.js` checks explicit opt-in, bounded resource
counts, disposal, canonical input ownership and the full-extent cap. Its
handoff test executes the production retirement helper and canonical bore
birth expression, checking both replacement endpoints, smooth retirement,
and preservation of the observed peel. The combined body, landing and volume
suite has 20 passing tests, including all 1536 instance wrap endpoints and
the randomized shape bounds. Shader literal validation passes; all 18 legacy
expanded shader exports remain identical when the experimental branches are
removed.

`qa/breaking-continuation-2026-10-20/volume-bounds.mjs` instruments the actual
exported state fragment to expose its canonical attachment and ceiling. It
reads all three MRT attachments explicitly with `gl.readBuffer`, checks
finite/nonnegative radii, full rotated extent, embedding, and deterministic
seek 50.3→54→50.3. The pre-randomization `volume-bounds.json` records SHA256 provenance for
the model, shaders, volume, material and main module. With the retirement
gate and 12×8 mesh, 1184 instances are active at 50.3 and 960 at 54 under
Second Peak card forcing. Maximum crest excess is 2.66e−8m, minimum
embedding 0.59966 radii, transverse attachment error below 1.52e−5m, with
zero seek mismatches and no GL/shader errors. The tested volume source hash
is `8795cc89fdd881205e1579cd02b99b50ef3cfd0c34b70a36d9b92c6495e16de7`.

First images (`volume-first-*.png`) established actual curved silhouette and
self-occlusion but looked like large marshmallow rows. Smaller, denser,
more deeply embedded lobes (`volume-second-*.png`) connect better, though a
regular bead pattern remains visible. The final motion/performance review
belongs in `volume-validation/`; still images alone do not establish
convincing tumbling motion or acceptable frame cost.

A final runtime-only A/B (`volume-shoulder-ab.mjs/json`) set only the
positive shoulder lift to zero, retaining the hollow and cap. At field
T16/H0=1.4, mature54 and card T14/H0=1.5, detail49.4, the front becomes
slightly steeper, but the pale upper strip remains and the lobe rows look
more isolated. This was not a decisive visual improvement. The candidate
was rejected; production source and final motion validation remain intact.

This is bounded overlapping geometry, not a union of a continuous foam
volume. Intersections and regular station sampling can remain visible. The
ceiling bound is local to each source station, not a full neighbouring-field
collision test. Surface normals use finite differences. Material and
geometry fidelity remain a visual acceptance question against the raw
footage, separate from numeric correctness. No commit or deployment is
implied by these checks.

## Stable variation follow-up (2026-10-21)

The previous version was saved before edits under
`qa/breaking-randomization-2026-10-21/baseline/`. The matched review is
`qa/breaking-randomization-2026-10-21/validation/index.html`; both arms enable
attached volume. It contains 84 native 1800×1125 frames sampled at 20 Hz:
29 frames per arm around mature whitewater and 13 per arm around landing.
Each arm loads a fresh document with frozen module sources. A read-only
capture hook changes the served main-module hash; the manifest records both
served hashes and production snapshot hashes explicitly.

The stable variation breaks the synchronized paired rows into overlapping
groups with different sizes and orientations. Each identity keeps its shape
when seeking; randomness is spatial, not newly sampled each frame. The
ordered frames still show identifiable ellipsoids and a broad smooth upper
strip. This is an incremental improvement, not a match to the continuous
churning mass in the field footage.

The full repository suite passes 283 tests. All 18 expanded legacy shader
exports remain unchanged outside the experimental branches. Exact seek
restoration compares all 18,432 float values across the three GPU state
attachments, rather than a sampled aggregate. The final GPU continuity,
bounds and frame-cadence evidence is stored with the review and this
follow-up's QA files; earlier measurements above describe the preserved
pre-randomization version.

The new `qa/breaking-randomization-2026-10-21/volume-bounds.json` verifies
the randomized full ellipsoid extent: maximum crest excess 3.33e−8 m,
minimum embedding 0.59979785 radii, transverse attachment error below
1.522e−5 m, and zero seek mismatches or GL errors. The continuity probe
checks three cohort wraps and three carrier replacements; all sampled
radii are zero within ±10 ms of those boundaries. Two cohorts are visible
on either side of their wraps; the third remains canonically inactive, so
that case alone does not demonstrate a visible fade.

The compact comparative cadence run measured roughly 91/92 fps for
previous/current field views and 109/113 fps for previous/current close
views; current medium quality at phone width reached 120 fps. Host timing
was more variable than in the earlier run. These paired measurements show
no large comparative regression, but do not isolate GPU cost or establish
physical-phone performance. The comparison viewer passed checks at 1440
and 390 pixels, including paired playback, seeking and keyboard controls.
