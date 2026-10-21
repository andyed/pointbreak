# Breaking preview: landing on displaced water

The opt-in `#breaking=1` curtain previously had zero visibility at the active
Second Peak station x=14.9 throughout sim 49.2–50.6. The event clock and curl
were present. The nominal receiving source point, crest source + 0.9 face
heights, folded to a point **above and behind** the drawn lip. The existing
forward/downward validity gate correctly rejected that geometry.

The GPU scan in `qa/breaking-continuation-2026-10-20/landing-scan.json` records
this branch ambiguity. At sim49.4, source offsets +1.01m and +2.02m from the
impact crest seed map to drawn z−108.924 and −109.139, at heights1.610 and
1.621m. The lip is around z−107.52,y1.57. Source offsets +5.03m and +6.03m
instead reach the lower receiving face at z−105.358/y1.035 and
z−104.639/y.781.

## Change

`breakerSurfaceContactAt` in `SURFACE_GLSL` searches the existing canonical
`surfacePos` for the first water point at least the original curtain reach
forward of the tip and 0.35 local displayed face heights below it. Twelve
bounded samples establish a bracket and five bisections refine contact. The
source span is bounded by 0.28 local wavelengths and twelve physical face
heights. It returns the actual source coordinate, actual displaced position,
and a validity flag. A high or dry front returns invalid; endpoint height is
never forced downward.

`CURTAIN_VERT` calls this only for an actually turned lip, after selecting its
existing pre-impact pose or frozen impact pose. It retains the shared impact
frame, CRASH clock, curve, visibility gate, and one-way head/tail progression.
The sheet head reaches contact at the shared impact time; the top then clears
downward toward that contact. No independent timer or new break permission
was introduced. All new production code is under `BREAKING_BODY`.

The lower-shoulder fraction and search bounds are authored surface character,
not a hydrodynamic jet trajectory or measured contact law. The solver searches
one source station; alongshore lateral surface displacement is preserved in
the returned 3D point. It does not solve a full 2D surface inverse. If a narrow
qualifying interval lies entirely between search samples, contact can remain
invalid. The final short lifecycle already fades the sheet once its span has
collapsed. Performance requires rendered validation because the active curtain
vertices each evaluate several additional surface points.

## Evidence

`tests/breaking-landing.test.js` executes the actual scalar search body against
controlled displaced-surface fixtures: wrong folded branch rejection, exact
on-surface output, high/dry receiver rejection, bounded motion through coarse
scan-cell transitions, and shared clock/curl ownership.

`qa/breaking-continuation-2026-10-20/landing-curtain-probe.mjs` executes the actual
exported `CURTAIN_VERT`, replacing only its raster output with float position
and alpha. It also verifies contact against a fresh evaluation of the canonical
surface. This is stronger than reconstructing curtain equations in a test.

Actual-vertex results at VIS1, Second Peak card forcing, x14.9:

| Simulation time | Maximum alpha | Rendered top-to-bottom drop | Forward span |
| --- | ---: | ---: | ---: |
|49.4|.917|.496m|2.425m|
|49.420374 (impact)|.996|.625m|2.717m|
|49.5|.996|.548m|2.500m|
|49.6|.791|.248m|1.176m|
|49.7|.002|.009m|.044m|

At49.8 and later the completed sheet is transparent. These numbers establish
actual geometry and lifecycle; they do not establish visible pixel quality.
Rendered inspection and final combined-source motion evidence are recorded in
the continuation QA report by the parent agent.

The extended GPU regression checks 13 clocks including the exact canonical
impact at49.420374. Every visible curve sample descends and travels forward.
Every solved receiver has zero measured residual against `surfacePos`; the
bottom equals the receiver within0.1mm at impact and afterward. The solver
starts producing a visible sheet at49.34 (alpha.305).

Close rendered frames `landing-visible-{49.36,49.420374,49.6}.png` and the
impact `curtainoff` comparison confirm a real but visually small sheet: only
155 pixels differ at800×500, with maximum channel change44. It is similar in
value to the body and is not the broad white slab. That capture used curtain mesh
alongshore station spacing2.375m, with the strongest probe station x14.9
between mesh stations14.25 and16.625. The parent subsequently increased
`BREAKING_BODY` curtain density to1m (570segments), preserving the default
240segments. A repeat capture follows the radius and rear-join repairs.
The contact fix alone must not be reported as fully convincing falling-sheet
motion; physical contact characterization remains approximate.

Validation: four focused tests plus21 existing breaker anatomy tests pass;
shader literal checks pass; the continuation expanded-export parity checker
reports all18 legacy shader exports identical with `BREAKING_BODY` removed.
The combined body source was evolving concurrently; final combined renderer
motion/performance and source provenance belong to the parent validation pass.

The final repeat includes crest radius, narrow rear join, coherent two-axis
compaction, the toe slope margin, and1m curtain stations. It passes the same
actual-shader regression. At exact impact the sheet drops0.625m and spans
2.717m forward, with zero measured receiver residual. The rendered on/off
comparison changes305 of400,000 pixels (maximum channel change21), compared
with155 in the initial2.375m-station capture. This is combined-change evidence,
not an isolated density attribution. The sheet remains visually subtle. Source
hashes are retained in `landing-curtain-probe.json`; no shader errors were
reported.
