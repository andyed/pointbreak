# Rounded attached breaking body — 20 October 2026

Opt-in `BREAKING_BODY` geometry inside the existing `BORE` build. The renderer
bundles it through `#breaking=1`; default and standalone `#bore=1` retain the
previous model. No physical forcing or break-location parameters changed.

## Evidence and scope

The fresh [footage study](../../qa/breaking-study-2026-10-20/index.html) shows a
round, irregular whitewater body attached to a dark face. The continuous peel
retains substantial depth for 7.5 seconds; the older shoreward rows flatten.
The existing bore broadens the white band but leaves a smooth cap. Prior
[CURL_TRUTH](CURL_TRUTH_2026-09-24.md) observations put the thick bore at about
0.4–0.65 of the face height, with its top level with or below the previous
crest. These are image-plane observations, not calibrated metre measurements.

## Shared morphology

`breakingBodyAt(sourceX, fracB, ageB, t)` returns coverage, rounded profile,
rolling relief and age activity. `boreWedgeAt` still owns the crest index,
unwrapped age, phase-derived face coordinate and existing break permission.
The helper introduces no event clock or break-location solve. Both shader
stages read the same source station and seconds clock. Two smooth noise scales
move down the face, with a slower modulation along the crest so neighbouring
lobes grow and merge rather than blink independently.

The irregular toe lies 0.48–0.65 of the original carrier range below its crest.
The circular-section shoulder broadens the upper face while retaining top curvature; the cap acquires shallow hollows and a
small back-face transition. These hollows lower the crest by at most 0.085 of
the local range, before the existing gain. The shoulder's lift is bounded by
0.70 of the original local crest clearance, so this term cannot create a new
higher crest, even if `u_bore` exceeds one. The existing bend remains the owner
of overturning.

Activity stays full through eight seconds and smoothly reaches 0.18 at 28
seconds, in addition to the existing bore exponential decay. This keeps the
observed active peel while subordinating older rows. The carrier's local
physical amplitude still supplies all metre scaling and existing post-break
height retention; `VIS` applies only at the model's final display conversion.
The old structural bore mound is withdrawn exactly as in the earlier bore.

With `BREAKING_BODY`, the face coordinate now reads `xiAt(sourceX)`, matching
`ocean()` in section-curl builds. Previously the bore used the spot-wide
`u_xi` even when the underlying face used local section character.

## Adaptive renderer sampling

The high-quality mesh has core cells of 1.465 × 1.628 metres. The first rolling
lattice had fewer than two along-crest samples per lobe; its x frequency is now
0.25 per metre. `GRID_VERT` additionally redistributes existing z samples toward
the canonical carrier crests with a monotone phase map:

`target = phase + 0.70 × edge × sin(ωt − phase)`

At an interior crest its derivative is 0.30, allocating 3.33 times as many
samples without adding triangles. The edge gain fades over four radians at the
Psi bounds. Its maximum derivative is 0.375, so the complete mapping derivative
has lower bound `1 − 0.70 − 0.70 × 0.375 = 0.0375`: it cannot invert the mesh.
The renderer inverts the existing piecewise-linear `rayPhase` table by eight
binary-search steps and interpolation between the resulting adjacent nodes.
Outside that table it keeps the original source coordinate. It does not replace
Psi with local-wavenumber integration or move any physical crest.

Geometry, material's `vSourceXZ`, and both normal finite-difference taps read
this same remapped source. Otherwise the old broad normal tap would smooth out
the newly resolved cap. Surface queries, curtains and other consumers retain
the same canonical surface; this is only the grid's sampling strategy.

## Verification

- Seven focused tests execute the actual scalar GLSL helper bodies with a
  bounded continuous noise substitute. Sweeps check finite bounded outputs,
  no crest inflation or detached toe/back mound, sustained active peel,
  monotonic ageing and continuity across carrier-period boundaries. This tests
  envelopes, not a claim of fluid simulation or a pixel comparison. Additional
  tests execute the actual sampling helper against varying piecewise-linear
  Psi fields, checking monotonicity at every carrier phase, unchanged source x,
  identity at table edges, 3.33× crest density, and coherent normal taps.
- Shader literal check passes.
- Actual Clang preprocessing compared against the preserved session baseline
  is identical (ignoring whitespace) for default, `BORE`, and
  `BORE + SECTION_CURL` without `BREAKING_BODY`.

This remains a height-field body. It cannot represent disconnected air pockets
or a turbulent fluid volume. The existing curtain and optional plume remain
separate layers; this bundle does not enable the plume. See the combined
verification below for the unresolved curtain landing.

## Compact attached cross-section

The next GPU probe resolved why height relief and denser sampling alone stayed
planar: the white upper face occupied 9–10 source metres, or 7–9 metres after
choppy displacement, over only 0.6–1.4 metres of vertical drop. Disabling the
`earn` bend floor changed exactly none of the sampled body heights. Removing
approach convergence changed horizontal reach by up to 2.4 metres but widened
the already shallow body.

The final surface pass therefore compresses the existing attached body toward
a quarter-circle shoulder with radius `0.65 × local physical carrier range`.
Its crest source is a three-step Newton approximation of the existing
`rayPhase` crossing, tested against exact inversion to within 0.10 m across the
variable-slope test fields (below the 0.49 m high-tier crest cell). Its original
height is retained; this pass cannot raise the crest. The existing bore gain,
activity and permission determine the strength. It blends back into the dark
lower face on a monotone **raw phase** interval. An initial height-fraction join
was rejected: after the pitch-skewed trough, surface height rises again and its drop
fraction decreases before the carrier half-cycle ends, causing reactivation and visible slits.
The phase join fixes that mechanism. During an active curl the compaction
fades out over 0.10–0.30 turns, preserving the existing bend's lip projection.

Seven 512-sample GPU transects at sim 54 found no reversed source-z steps
larger than 2 mm after the join repair. The small existing −0.0009 m step at
x=30 remains within that tolerance. Three established active-body stations:

| Source x | Upper-face width before | Width after |
|---|---:|---:|
| 0 m | 8.63 m | 1.86 m |
| 60 m | 7.30 m | 2.40 m |
| 90 m | 7.09 m | 1.57 m |

The gain keeps fresh/weak and older bodies less compressed. This is authored
surface morphology within the existing breaking field, not a fluid-volume or
mass-conservation solve.

[GPU samples and provenance](../../qa/breaking-upgrade-2026-10-20/breaking-body-transects.json)
include exact rows and source-hash limitations. The capture preceded the final
active-curl suppression; all measured sim-54 body samples had zero curl, and
full-render validation checks the final bundle. Reproduce the final GPU check
with `node tests/breaking-body-probe.mjs` while the local server runs on 8127.
`BASE_URL` and `OUT` override the server and default temporary output folder.
The probe checks finite values and no lower-join reversals, and records final
source hashes and optional `sapp` comparison stills.

## Visual assessment and limits

The compact pass removes the demonstrated long upper-face tabletop and the
corrected join removes the introduced slits. It still does not match the raw
footage's complex tumbling volume. In the wide cliff still, the steeper front
projects as a narrower white band; motion and close-view judgement are
necessary. The first two passes did not achieve a meaningful fidelity win,
and numerical improvement alone is not visual acceptance. The combined
renderer QA report owns the final motion review and performance measurements.

This remains one deformed surface, not disconnected air pockets or a turbulent
fluid volume. The bend retains ownership while the lip is airborne; the
section-to-impact handoff remains unresolved in the tested event.


## Combined review and verification

Three parallel slices integrated into the local `#breaking=1` bundle: body
geometry and sampling, foam material, and independent motion validation. The
material pass removes duplicate bore compositing, prevents later aeration from
repainting the body white, and filters broad alongshore lobes separately from
unresolved cross-face detail. The rider query receives the same compiled
surface and uses smaller local derivative taps; its normals are structural
surface estimates, not bit-identical adaptive-triangle normals.

- `npm test`: **270/270 passing**. Shader literal checks and legacy token parity
  also pass. No commit, push or deployment was performed.
- **184 final ordered frames**: four scenes × default/experiment, at matched
  camera, clock, forcing and 1× displayed height. No renderer errors or source
  changes during capture. All **92 default frames** are pixel-identical to the
  earlier default captures.
- On this Mac's headless Chromium/ANGLE Metal path, 120-frame high-quality
  cadence samples measured median/p95 **8.3/9.2 ms default** and **8.3/16.6 ms
  experimental**. This includes scheduling and vsync; it is not isolated GPU
  time or a mobile-device benchmark. Medium-quality desktop and 390px viewport
  smoke checks passed.
- The rider smoke completed **92 GPU queries with zero failures** and a finite
  pose. Desktop/390px comparison UI checks passed play/pause, frame stepping,
  source-video event seeking, keyboard selection and overflow checks.

**Visual verdict: a reviewable prototype, not a default-promotion candidate.**
The front is demonstrably more compact and upright, with a stronger grey lower
edge. Close views still read as a smooth pale cap above a dark fascia; the
50.3 s detail frame contains a small bright triangular fragment. Wide cliff
views can make the whitewater look thinner. Neither numerical compactness nor
passing tests establishes the thick tumbling-water fidelity seen in the source.

The actual final `CURTAIN_VERT` was additionally probed at x=14.9 over
49.2–50.6 s, with 21 samples down the sheet. Its alpha is **zero throughout**.
At 49.4 s the computed receiver is above and behind the lip, so the contact
check correctly suppresses the invalid sheet. The downward handoff is compiled
but **not visually demonstrated** at this event. Correcting the common contact
receiver and resolving opaque front-face coverage are the next substantive
problems; a plume or tube overlay would not establish that they are solved.

[Interactive review](../../qa/breaking-upgrade-2026-10-20/index.html),
[frame manifest](../../qa/breaking-upgrade-2026-10-20/validation/manifest.json),
[cadence and rider checks](../../qa/breaking-upgrade-2026-10-20/validation/performance.json),
and [curtain probe](../../qa/breaking-upgrade-2026-10-20/validation/curtain-probe.json)
retain the evidence. `scripts/capture_breaking_upgrade.mjs` reproduces the
ordered stills; add `--scenes=field,section,detail,sharks --arms=default,breaking`.
The private QA artifacts are gitignored; the implementation, tests, capture
script and research note remain uncommitted alongside the preserved prior work.

## Continuation: landing and rolling front

The verdict above describes the preserved first preview. The continuation
addresses its failed contact and hidden surface folds, with prior source and
frames retained under `qa/breaking-continuation-2026-10-20/previous/`.

- The sheet now finds a forward, lower receiver on the actual displaced
  surface. Its existing impact clock owns contact and release. The optional
  curtain has 1m alongshore stations so narrow active sections are sampled.
  See [landing evidence](breaking-landing-2026-10-20.md).
- The attached body uses a crest-owned rolling radius factor, rear support
  matching the foam, coherent compression of both horizontal coordinates,
  and a small source-coordinate slope at the toe. These changes address
  measured inversions rather than hiding them with white paint. See the
  [mapping audit](breaking-body-mapping-2026-10-20.md).
- The shared rolling field has analytic derivatives for matte lobe lighting.
  Fine clumps use a fixed 0.28m alongshore scale instead of 1.4m, reducing
  the previous five-to-seven-fold elongation along the crest. A bounded local
  carrier-height estimate affects lighting slopes only. Keeping the material
  coordinates independent of this changing estimate avoids phase drift at
  distant source stations; it creates no new breaking authority.

Diagnostics established that the material was visible and had substantial
local contrast; later paint was not erasing it. Quadrupling the grid's triangle
count did not fix the slab. Replacing raised shoulders with negative hollows
made the surface more corrugated and was rejected. Neither diagnostic was
applied to production. The final temporal evidence and limitations belong in
the [continuation review](../../qa/breaking-continuation-2026-10-20/validation/index.html).

The surface-only continuation still showed organized bands in motion. A
subsequent attached-volume pass adds embedded, rotating ellipsoids sampled
from the same GPU surface and crest clock. It introduces actual curved
silhouettes and depth overlap while retaining the repaired sheet landing and
surface map. See the [volume design and limits](breaking-foam-volume-2026-10-20.md)
and the [volume motion comparison](../../qa/breaking-continuation-2026-10-20/volume-validation/index.html).
The earlier review and captures remain preserved as intermediate evidence.
