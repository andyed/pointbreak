# Mirror verification — 2026-09-23

Independent check of the claim in `LOOKOUT_LOCUS_RESIDUAL_2026-09-23.md` §6:
every web-three render is a mirror image of the site, because the stage frame
(x = along-shore, z = shore-normal) is a proper rotation of ENU and the
renderer places it as three.js (x, y = up, z).

**Verdict: CONFIRMED.**

Strongest evidence: the camera pose read back from the running app at
`#preset=jacks&cam=lookout` has screen-right vector (+0.707, 0, −0.707), so
the land side (+z) projects to the **left** (dot −0.707), and the capture has
all 15 197 land-coloured pixels in the left half of the frame (median column
80 of 1280). The photograph that pose replays (`cliff-cam-reference.jpg`) and
the OSM coastline both put the land on the **right**: ray-cast from the lookout
across the photograph's 41.1° field, the water's edge is 35 m away at the
left edge and 56 m away at the right edge, so the cliff top fills more of
the bottom-right. No camera algebra is needed for that last statement.

## 1. Handedness, with the numbers

ENU is right-handed: E × N = U. From `data/model/pp_geo_profiles.js`
(`data/osm/process.py`: "x east m, y north m"; `build_geo_profiles.py`
lines 204-205: `shore` = bathymetric gradient, `along = (shore_y, −shore_x)`):

| profile | stageAlongENU **a** | stageShoreENU **s** | a × s | a × up | (a × up)·s |
|---|---|---|---|---|---|
| 38th (Jack's) | (0.79100, 0.61181) | (−0.61181, 0.79100) | (0, 0, **+1**) | (0.61181, −0.79100, 0) | **−1** |
| Second Peak | (0.68665, 0.72698) | (−0.72698, 0.68665) | (0, 0, **+1**) | (0.72698, −0.68665, 0) | **−1** |

Every other profile (Sewer Peak, First Peak, The Hook, Shark's Cove,
Private's) gives the same two signs.

- a × s = +U: (along, shore, up) is right-handed, so the stage frame **is a
  proper rotation of ENU**. The claim's premise holds.
- a × up = −s, i.e. det[a, up, s] = −1: the triad **(along, up, shore) is
  left-handed** in ENU.
- three.js is right-handed with x × y = z. Assigning x = along, y = up,
  z = shore therefore has determinant −1: the embedding is a **reflection**,
  not a rotation. Equivalently, a physical observer facing f = (f_x, f_z) in
  a rotation image of (E, N) has right-hand direction (f_z, −f_x), while
  three.js `lookAt` gives right = f × up = (−f_z, 0, f_x): the physical left.

The renderer makes exactly that assignment, with no transform in between:

- `web-three/js/main.js` 173-176, 193-196 (`makeWaterGeometry`): the
  authored XY plane is rotated onto XZ and "position.xz is the model
  coordinate directly"; the bed grid does the same (604-605). GRID_VERT's
  `vSourceXZ = xz` is pinned by `tests/coordinate-ownership.test.js`.
- `cliffStation()` (884), `lookoutStation()` (938), `lookoutTarget()` (947)
  return `[x, y, z]` = [along, up, shore] and go straight into
  `camera.position.set(...)` (1092, 1113, 1128, 2364). `enuToStage()` (934) is
  a plain change of basis and is **not** where the sign is wrong.

## 2. Map check, no camera algebra

The frame replayed by `#cam=lookout` is `cliff-cam-reference.jpg`: manifest
`heading_true_deg` 187.3 (the brief's 233.9° is a different frame in the same
manifest, and `LOOKOUT.headingDeg` in main.js matches the manifest), lat
36.95897, lon −121.96702, ENU (817.1, 542.3) from the PP apex origin.

From `data/osm/pp_geometry.json`:

- Nearest coastline vertex (#179) is 34 m away; walking the coast W→E
  (tangent heading 63° there) the lookout lies to the **left** of the walk
  (cross product +5019 m²), i.e. on the NW side. The 38th and Second Peak
  surf nodes lie to the **right** (−4168, −9462 m²): the SE, sea side. So the
  land is NW of the coast and the sea SE, as expected for Pleasure Point.
- Ray-cast from the lookout along the photograph's field (heading 187.3°,
  hfov 41.1°), range to the first coastline crossing:

  | offset from view axis | −20° | −15° | −10° | −5° | 0° | +5° | +10° | +15° | +20° |
  |---|---|---|---|---|---|---|---|---|---|
  | range to water's edge (m) | 35 | 36 | 37 | 38 | 40 | 43 | 46 | 50 | 56 |

  The water's edge recedes monotonically toward the right of the field, so
  it sits higher in the frame on the right and more cliff top is beneath it
  there: **land bottom-right**. The photograph agrees (fence post and scrub
  occupy the bottom-right; bottom-quarter dark-pixel fraction 0.83 right vs
  0.68 left). The Aug 15 Surfline still
  (`pleasure-point-2026-08-15/field_035_single-wave-subject.jpg`) has the
  fence and path bottom-right as well.

## 3. Captures

Served from the worktree root (`scripts/serve.py 8235`), Playwright
1280×960, `#speed=0`, three frames total. Poses read from `__pointbreak.camera`
/ `controls.target` (`assets/mirror-2026-09-23/poses.json`):

| hash | geoSpot | eye (x, y, z) | target | forward | three.js right | physical right (f_z, −f_x) |
|---|---|---|---|---|---|---|
| `preset=jacks&cam=lookout&sim=42` | 38th | (153.3, 13.3, 89.2) | (57.4, 0, −6.7) | (−0.704, −0.097, −0.704) | (+0.707, 0, −0.707) | (−0.704, 0, +0.704) |
| `preset=secondpeak&cam=cliff&sim=42` and `setSim(45)` | Second Peak | (156.6, 14.9, 141.3) | (55.0, 2, −62.6) | (−0.445, −0.056, −0.894) | (+0.895, 0, −0.446) | (−0.894, 0, +0.445) |

The lookout eye matches the hand computation from the profile basis
(stage (153.3, 89.2), forward (−0.707, −0.707)), so the app is standing where
the claim says it stands; the only disagreement with the site is the sign of
the right vector.

**Lookout capture** (`assets/mirror-2026-09-23/lookout-land-side.jpg`):
land classified as warm pixels (R − B > 25, R ≥ G): 15 197 px, 15 197 in the
left half, 0 in the right half, median column 80, median row 927. The
photograph has it bottom-right (§2). The render is the photograph's mirror
image.

## 4. Peel handedness on screen

Reasoning from the geometry: a right-hander breaks toward the surfer's right
when facing shore. At Pleasure Point facing shore is facing NW, so right is
NE = +along = **+x** (down-point, toward 38th and The Hook). The model peels
toward +x (`tests/m4-rider.test.js` "rides the +x branch"; MODEL.md), so the
model is a right-hander in stage coordinates. An observer on the cliff is NW
of the wave looking S–SE; NE is on that observer's **left**, so a right-hander
seen from the cliff advances **image-left**. `FIELD_WAVE_MOTION_2026-09-15.md`
records exactly that for the Surfline cliff cam: "the bright breaking front
progresses image-left".

In the app from `#cam=cliff` (`assets/mirror-2026-09-23/cliff-peel-direction.jpg`):

| witness | sim 42 s | sim 45 s | direction on screen |
|---|---|---|---|
| lip-front column, far crest band rows 425-475, bright ≥ 215 (p95 / max) | 646 / 649 | 657 / 665 | **right** (+11 / +16 px) |
| same, bright ≥ 200 (p95 / max) | 647 / 655 | 658 / 686 | **right** (+11 / +31 px) |
| analytic, per unit celerity c, V_p = c / sin 41° = 1.52 c in +x, c in +z | | | app **+0.92 c** (right); physical **−0.92 c** (left) |
| field (Surfline cam, FIELD_WAVE_MOTION §"34-44 s") | | | **left** |

The app's front advances screen-right while the site's advances screen-left
from the same side of the wave. The pixel witness settles only the sign; the
magnitude (a foam field ~250 m out, where the model predicts ~100 px of
lateral drift) was not audited and is not needed for the verdict. The app
draws a right-hander in stage coordinates and shows it as a left-hander.

## 5. Where the sign belongs, and what is downstream

**Fix location (one line):** at the stage → world boundary in
`web-three/js/main.js`, world z = −stage z: mount every mesh under one root
`THREE.Group` with `scale.z = −1` and push each camera `pos()`/`target()` and
`setView()` through a single `toWorld([x, y, z]) → [x, y, −z]`. Do **not**
negate `stageShoreENU`, `enuToStage()`, `process.py`, the model or the bed:
(along, shore, up) is a correct rotation of ENU and every test, bed grid and
CPU twin lives in it. The renderer's placement is the only wrong sign, and
with world z = −shore, (along, up, −shore) is right-handed (a × up = −s), so
the embedding becomes a rotation.

Downstream of that one sign (each keeps its stage meaning if it goes through
the helper, but each is a place to look):

- **Cameras**: every `CAM_PRESETS` closure (Free's hand-tuned
  `[-140, 55, -230]`, Cliff, Lookout, Lineup, Drone, Tour, Follow, POV), the
  four `camera.position.set(...p.pos())` sites, `controls.target`, `setView`,
  and `clampEye()`/`cameraFloorY(spot, x, z)`, which must keep evaluating in
  stage z. `ROUND_TRIP_PARAMS` carries no camera pose, so permalinks survive.
- **Rider**: `surferGroup` position and `_fwd.set(s.vx, 0, s.vz)`
  (surfer.js 159) are automatic under a mirrored group; the lean-sign comment
  at surfer.js 180-181 ("lean toward +x when the face is on the +x side") is
  geometric and still true, but re-check by eye.
- **Audio pan**: `sound.js` 219/234, `pan = (xZip − camX) / 50`, is world-x
  relative, not camera-relative. Today +x is screen-right from Cliff so it
  happens to agree; after the fix +x is screen-left from Cliff and the pan
  must be re-derived as `dot(zipper − eye, cameraRight)`.
- **Drone / Tour framing**: "seaward at the top of frame" stays; down-point
  swaps from screen-right to screen-left, which is the map orientation.
- **Shaders**: GRID_FRAG samples the bed in world space
  (`vec2 worldXZ = vWorldPos.xz;` then `bedElevM(worldXZ)`, `wetSand`, `brow`
  noise; shaders.js 1445-1511). Under a root-group mirror `vWorldPos.z` is
  −stage z, so those lookups must move to the stage-space varying
  (`vSourceXZ` / model position) or the bed reads mirrored. This is the
  one place the "one line" is not one line.
- **Captured fixtures**: every rendered capture under `docs/research/assets/*`
  and the QA set sheets change handedness;
  `lookout-locus-2026-09-23/render-overlay.jpg` is hand-flipped and would
  need re-rendering unflipped. `scripts/probe_wave_shape.mjs` reads model
  coordinates and is unaffected.

**Tests that pin the convention.** None asserts an on-screen side, so nothing
catches the mirror and nothing explicitly pins it either. What a fix touches:
`tests/coordinate-ownership.test.js` pins `vSourceXZ = xz` and
`vec2 worldXZ = vWorldPos.xz` (the identity stage = world assumption; the
second line changes under a root-group mirror); `tests/camera-clamp.test.js`
evaluates `cameraFloorY(spot, x, z)` in stage coordinates (unchanged if the
helper converts); `tests/incident-direction.test.js` uses an identity basis
`stageAlongENU [1, 0]`, `stageShoreENU [0, 1]` with a × s = +up, the same
handedness as the profiles, untouched by a renderer-side fix and broken by a
profile-side one; `tests/m4-rider.test.js` "+x branch" is model-level,
untouched.

## 6. Reproduction

```
git merge main   # ≥ 35194a3
python3 scripts/serve.py 8235 &
PLAYWRIGHT_DIR=~/Documents/dev/psychodeli-webgl-port/node_modules/playwright/index.mjs \
  node <capture script: goto #preset=jacks&cam=lookout&controls=0&speed=0&sim=42, then
        #preset=secondpeak&cam=cliff&controls=0&speed=0&sim=42 and __pointbreak.setSim(45);
        read __pointbreak.camera.position / getWorldDirection / (1,0,0).applyQuaternion(camera.quaternion)>
pkill -f "serve.py 8235"
```

Handedness: read `stageAlongENU`/`stageShoreENU` from
`data/model/pp_geo_profiles.js` and take a × s and (a × up)·s. Map check:
from `data/osm/pp_geometry.json`, cross product of the coast tangent with the
lookout offset, and ray/segment intersection from (817.1, 542.3) along
bearings 167.3°..207.3°. Pixel counts as in §3-4 (PIL + numpy on the PNGs).
