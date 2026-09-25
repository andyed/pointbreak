# The crash plume draws: back-face culling under the mirror, and a contact anchor off the drawn lip (`#crash=1`) — 2026-09-24

Status: **the plume draws; flag-gated; default byte-identical (0 pixels in 4
frames against the pristine `main` tree). Not judged by a live eye. Not
promoted.** Second pass on Track C (`CRASH_PLUME_2026-09-24.md`), base
`a3de204`. Time-boxed to ~75 minutes; §6 lists what is still wrong.

## 1. The convicted draw bug: `world`'s mirror flips the front face

Track C left the plume as a compiled, probed, issued mesh (6 vs 5 draw calls,
+10 000 triangles) that put no pixel on screen. The probe compiled
`PLUME_VERT` as a *fragment* pass, so the mesh's own program had never been
checked; that was the first suspect and it was wrong: `renderer.info.programs`
carries no diagnostics for any program and the page logs no shader error at
`#crash=1` (`scratchpad/diag_plume.mjs`, rerun on this tree).

The split test the note asked for was run in-page on the live material
(`scratchpad/split_plume.mjs`; pixels differing from the default frame, Sewers
close camera, birth + 0.6 s):

| variant | px differing |
|---|---|
| as committed | 0 |
| solid-red fragment | 0 |
| solid-red fragment, `depthTest` off | 0 |
| solid-red fragment, `gl_Position` overridden to an NDC scatter on `gl_InstanceID` | 0 |
| same scatter, dead-station early return disabled (all 5000 instances) | 0 |

A forced NDC scatter with no depth test and an opaque fragment draws nothing,
so neither the vertex math nor the fragment is the owner: the rasterizer is
rejecting the primitives. The one datum left in the mesh readout was the
parent's transform: `world.scale = (1, 1, -1)` — the 2026-09-23 mirror
(MIRROR_VERIFICATION). three.js flips `gl.frontFace` to CW for every
`FrontSide` material whose world matrix has a negative determinant. Grid
geometry is mirrored with the group, so its winding flips too and the
picture is right. A **billboard whose corners are added in view space after
`modelViewMatrix`** (the plume, and the shipped spray) keeps its authored CCW
winding, is now a back face, and is culled to the last pixel.

Proof by the one knob that touches only this:

| material change (in-page, no shader edit) | px differing |
|---|---|
| plume `FrontSide` → `DoubleSide`, `#crash=1` | **20 235** |

Fix: `side: THREE.DoubleSide` on the plume material (`main.js
ensurePlumeMesh`), with the reason in the comment. A billboard has no back
face to cull, so this is the correct setting independent of the mirror.
Track C's `gl_VertexID` corner construction was kept; it was not the cause.

**Instrument note for the coordinator.** Track C's diagnosis "position reads
as zero for instanced draws under headless ANGLE/Metal" was a misread of the
same defect: a `position`-scaled scatter drawn in stage/view space is culled,
a `gl_VertexID` scatter written straight to NDC in CCW order is culled too —
unless the test happened to write CW. Nothing here is headless-specific
(§2).

## 2. The shipped spray draws zero pixels under the mirror — headed and headless agree

Same in-page test on the **default** boot (no flags), spray material only:

| build | change | px differing | headless | headed (`headless: false`) |
|---|---|---|---|---|
| default (mirror on) | spray `FrontSide` → `DoubleSide` | 192 | 192 | 192 |
| default (mirror on) | spray `FrontSide` → `BackSide` | 192 | 192 | 192 |
| default (mirror on) | spray `BackSide` vs `DoubleSide` | 0 | 0 | 0 |
| `#mirror=0` | spray `FrontSide` → `DoubleSide` | 0 | 0 | 0 |
| `#crash=1` (mirror on) | spray `FrontSide` → `DoubleSide` | 189 | 189 | 189 |

Every spray pixel (192 at this camera and clock) is culled in the shipped
mirrored build; `BackSide` recovers exactly the `DoubleSide` set; under
`#mirror=0` the FrontSide spray draws. Headed Chromium reproduces every count,
so **this is not a headless-vs-headed instrument finding**: every QA capture
since the mirror landed has faithfully shown a spray-less wave because the
wave has been spray-less. Frames: `qa/crash-draw-2026-09-24/
spray_default_frontside.jpg` (shipped) vs `spray_default_doubleside.jpg`,
and the 3× crop `spray_frontside_vs_doubleside_crop3x.png` (bbox of the
192 px: x 301–520, y 195–259 — filaments above the lip on the right, none on
the left).

**Not fixed here** — the default frame is required byte-identical by this
track's rules, and putting the spray back is a visible default change the
coordinator should take deliberately (the spray was judged "~0.1 % of drone
pixels, a garnish" *before* the mirror; the judgement should be re-made with
it drawing). The one-line fix is `side: THREE.DoubleSide` on `sprayMat`. The
same audit should be run on every other mesh that offsets in view or NDC
space after the modelView transform (curtain and splash-up are authored in
stage space and are not affected by construction; the rider's sprites, if
any, should be checked).

## 3. Landing anchor: off the source→drawn map, onto the drawn lip

Track C measured the shared landing `zL` drawn 7.8–10 m *behind* the lip at
Sewers x = −52 because the fold maps source z −242…−230 to drawn −230…−237.
Its plume anchored the contact at `surfacePos(zc + 1.9 h_crest)` — a source
point pushed further along the same map, an authored guess. This pass anchors
the contact **in drawn space**, off the lip's own sample:

```
lip     = surfacePos(x0, zcNow)                          (CURTAIN_VERT's tip; unchanged)
dir     = tube.js tubeFrame's sweep axis (∇ rayPhase, guarded dir.y ≥ 0.3)
c       = ω / k                                          (phase speed, tube.js)
sL      = max( bpReach(ξ, h_crest/VIS, c), 0.35 h_crest ) (physical horizontal metres; floor = tube.js's)
contact = lip + (dir.x·sL, −h_crest, dir.y·sL)           (the profile's landing level: still water under the crest)
```

`bpReach` is the tube's own ballistic reach (`shared/breaker-profile-glsl.js`:
plunge · c · √(2 h_C/g)), so the plume erupts where the profile's jet lands,
and horizontal metres are not VIS-scaled. The plume material now defines
`TUBE` privately as well as `ROLLER` to reach the profile symbols; the grid
handover inside that guard is gated by `u_tube` (0 on a non-tube boot), and
the Track B contract test (every profile splice inside `#ifdef TUBE`) still
passes — the plume has no splice of its own. `PLUME_REACH_HC` is gone.

GPU probe (`scripts/probe_crash.mjs`, exact vertex text, 17-sample spine,
3 stations × 36 ages; `docs/research/assets/crash-draw-2026-09-24/probe.json`):

| station | h_crest (displayed) | contact ahead of lip | contact below lip | spine top over lip / h_C | over contact / h_C | visible ages |
|---|---|---|---|---|---|---|
| x = −84 | 7.56 m | ≥ 4.56 m | 7.56 m | +0.063 | 1.063 | 0.45–1.25 s |
| x = −52 | 7.59 m | ≥ 4.46 m | 7.59 m | +0.021 | 1.021 | 0.45–1.25 s |
| x = −20 | 7.83 m | ≥ 4.19 m | 7.83 m | +0.048 | 1.048 | 0.45–1.25 s |

At x = −52, birth + 0.6 s: lip (y 10.31, z −232.17), contact (y 2.71,
z −227.71). Track C's transect put the drawn face ahead of the lip at y 3.2 at
drawn z −227 — the new contact sits ~0.5 m under that face, 4.5 m ahead of
the lip, where the first cut's stood 7.8–10 m behind it. All 108 poses pass
the probe's "contact ahead of and below the lip" assertion, including the
x = −52, age 1.15 pose that failed Track C by 0.43 m; 9 out-of-order seeks
are exact; gain 0 draws nothing.

**Is the fold the real defect?** Not judged here. What the numbers say: the
drawn lip at x = −52 sits at z −232.2 from source −235.2 (`zcNow`), i.e. the
crest is drawn 3 m ahead of its source, while the shared landing source
−229.6 is drawn *behind* the lip. Any consumer that turns a source z into a
drawn point through `surfacePos` on the fold's shoreward flank inherits that
inversion — the roller deposit, the splash-up foot and the relocated spray
all anchor at `surfacePos(zL)`, and tube.js guards its own foot with the
same 0.35 h_C floor this pass borrowed, which suggests it has met the same
thing. A source→drawn remap that keeps the landing *ahead* of the lip is a
model-side question for `shared/model-glsl.js`; the plume no longer depends
on the answer.

## 4. Field ratio cap

CURL_TRUTH §1.3: nothing in the clip rises more than ~0.15 H_f above the crest
line that preceded it; the plume goes forward, not up. Puff **centres** are
now clamped at lip + `PLUME_TOP_HC` = 0.15 h_crest; the measured spine top
is +0.02…+0.06 h_crest over the lip (table above). Puff radii (0.16–0.36
h_crest) are not in that number, so bodies still peek ~0.2–0.3 h_crest over
the crest in the frames (§5). The clock is unchanged from Track C (erupt
0.28 s, hold to 0.45 s, gone by 0.90 s after impact — inside the field's
0.13–0.40 s curtain→plume and 0.40–0.67 s plume→bore brackets at the
eruption end, long at the tail as before).

## 5. Frames (opened)

`qa/crash-draw-2026-09-24/` — 21 JPEG q80 frames at 1000 × 625, Sewers close
camera (eye [12, 11, −190] → [−52, 4, −229]), ages 0.30 / 0.45 / 0.60 / 0.80 /
1.20 s after the x = −52 head's pitch, arms `default` / `crash` (`#crash=1`)
/ `tube` (`#crash=1&tube=1&classic=1&descent=1`), plus `#cam=lookout` at 0.6
and 1.2 s; 0.57 MB, plus the spray pair (§2). Manifest ignored.

- `close_crash_0.45` (tauD 0.03): a handful of puffs at the lip and down the
  face just ahead of it; the curtain still white behind them.
- `close_crash_0.60` (tauD 0.18): the cluster runs from the lip down the
  face toward the contact — no longer a column behind the crest (compare
  Track C's `qa/crash-2026-09-24/close_crash_*`, and the in-page DoubleSide
  frame before the anchor change, which stood on the crest's back).
- `close_crash_0.80` (tauD 0.38): densest; puffs spread about two crest
  heights along the line; two or three bodies stand over the crest line.
- `close_crash_1.20` (tauD 0.78): collapsing toward the contact; bodies
  merge into one lump on the face; still round-edged.
- `close_tube_0.60`: on the tube arm the plume is smaller and sits at the
  ribbon's lip; the tube's own foot is at the shared landing, so the two
  anchors disagree by a few metres here (§6).
- `lookout_crash_1.20`: the plume is not resolvable from the lookout at this
  head; frame kept for parity with the other arms.

## 6. What is still wrong

1. **Sparse.** ~5 % of 5000 puffs are alive at any clock and the visible
   cluster is 8–15 bodies; the field plume is a dense white band three faces
   long. Raising the live fraction (bias station seeds toward the break
   line) or the count is the next knob.
2. **Round bodies.** The erosion is subtle at these radii; puffs read as
   soft discs. The field crop is a lumpy white wall, not spheres.
3. **Over the crest.** Centre cap holds; radius does not. Either cap
   centre + radius, or shrink the top row.
4. **Tube-arm disagreement.** The tube's landing foot is `surfacePos(zL)`
   stretched by `sigma`; the plume's contact is the unstretched physical
   reach off the drawn lip. On the field day at Sewers they are ~3–5 m apart.
   Which one is right is the fold question (§3).
5. **No live eye yet.** Headless frames only. The memory rule stands: the
   automated checks passed on Track C while the artifact drew nothing.
6. **The spray** (§2) is a shipped defect awaiting the coordinator's call.

## 7. Reproduction

Serve this tree on a free port (8144 was held by a sibling serving `main`
from 19:03 — the first diagnostic run against it measured `main`'s tree, which
is why the DoubleSide conviction was done by in-page mutation and is valid for
both; every number above was then re-taken on 8154 against this tree):

```sh
python3 scripts/serve.py 8154 &
export PLAYWRIGHT_DIR=~/Documents/dev/psychodeli-webgl-port/node_modules/playwright/index.mjs
export PNGJS_DIR=~/Documents/dev/psychodeli-webgl-port/node_modules/pngjs/lib/png.js
node scripts/probe_crash.mjs --base-url=http://127.0.0.1:8154 --baseline-url=http://127.0.0.1:8144 \
     --out=docs/research/assets/crash-draw-2026-09-24
node scripts/capture_crash_ab.mjs --base-url=http://127.0.0.1:8154 --out=qa/crash-draw-2026-09-24 \
     --arms=default,crash,tube --ages=0.3,0.45,0.6,0.8,1.2 --lookout-ages=0.6,1.2
```

`npm test` green (242). The split and side tests are scratchpad scripts
(`diag_plume.mjs`, `split_plume.mjs`, `side_test.mjs`); their method — mutate
`material.side` / shader text in-page on the live mesh, count pixels against
the default frame — is the whole instrument and takes ten lines to redo.
