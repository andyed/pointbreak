# The faceted lip: what the bright polygons at the heads are (2026-09-24)

The og hero (Drone camera, Sewers, sim 42) shows the two or three breaking
heads as bright angular polygons — "facets", "a white plate", the "jagged
lip" that [CLASSIC_WAVE_PROGRESS_2026-09-15](CLASSIC_WAVE_PROGRESS_2026-09-15.md)
left unresolved. This note reproduces them at two poses, toggles every
existing A/B switch at the same clock and camera, reads the folded surface
back off the GPU along the mesh's own vertex columns, and paints three
diagnostic views of the fragment's inputs.

**Verdict.** The plate is not a shading term and not one mechanism's flag.
It is the folded head geometry itself: at each head the displaced sheet is a
three-layer Z-fold with 7–14 m of overturned reach on a footprint 3–4 grid
columns wide, drawn by 3–6 chords per transect, and every layer of it is
painted white by the foam and pocket-lip paints (plus the aerated lip where
`breakMask` allows). To the fragment the topmost layer is a **back face seen
from above**; culling exactly that class (`#underside=0`, the flag-gated arm
this note adds) moves 2–4 % of the head-crop pixels and leaves the plate,
because the front-facing layer underneath has the same footprint and is
foam-white too. No rendering-side switch removes it. The facets are inherent
to a heightfield fold at this grid pitch; only an explicit tube mesh (Track B)
or a model change to the head's fold reach can.

## 1. Reproduction

Two poses, both pinned (`speed=0`, `q=high`, `surfer=0`, `controls=0`):

| pose | hash / camera | frame | zoom pass |
|---|---|---|---|
| `og` | `preset=sewers&cam=drone&sim=42`, the `capture_og_hero.mjs` pose and its 640×376 CSS clip | 1000×750 at DSF 2 (the renderer caps its pixel ratio at 1.5, so this is the shipped 1500×1125 render) | 3000×2250 at DSF 1 — same aspect, so the same framing at 2× the shipped render pixels; head crops 100×75 CSS → 300×225 px |
| `close` | `preset=sewers&cam=free&sim=52`, then `__pointbreak.setView([12, 11, −190], [−52, 4, −229])` (stage coordinates; the post-mirror camera still frames the head — see `frames/close_base.png`) | 1000×625 | 2000×1250; one 320×160 CSS crop over the plate → 640×320 px |

`python3 scripts/serve.py 8134`, then `PLAYWRIGHT_DIR=… node
scripts/capture_lip_facets_ab.mjs` (the worktree's sibling lookup does not
resolve from `.claude/worktrees/`, hence the env var). The `og_base` capture
matches the shipped `docs/figures/assets/og_hero.png` frame for frame. Every
capture is deterministic: `base` recaptured after each shader edit was
byte-identical to the first capture on all six frames/crops (`cmp`).

Evidence: `qa/lip-facets-2026-09-24/` — `sheet_og.jpg` and `sheet_close.jpg`
(rows = arms, each labelled with its exact hash; the frame at card-panel
width, then the head crops at zoom), `manifest.json` (per cell: hash, camera
in stage coordinates, the uniform values actually applied, `u_cell`),
`probe.json` (§3), `diff_base_<arm>.json` (§2). The PNG frames are not
committed; the rig regenerates them.

## 2. Flag elimination

Same clock, same camera, one switch per row. "Changed" is the fraction of
pixels that move by more than 8/255 in any channel against `base`
(`--diff=base,<arm>`), on the three og head crops (A, B, C at 3×) and the
close crop (2×). Head A is the x ≈ 7.6 m head (the only one `lip=0` touches,
§3); B and C are the x ≈ −133 and −108 m heads.

| arm | og A / B / C changed | close changed | what it did to the plate |
|---|---:|---:|---|
| `base` | — | — | plate at all three og heads; a ~20 m slab over the crest at close |
| `curl=0` | 32.5 / 12.4 / 17.6 % | 50.4 % | plate persists and grows: the bend is off, so the choppy S is uncapped (up to 1.8) and the legacy throw/drop apply — a broader sheet, still white |
| `curtain=0` | 0.00 / 0.00 / 0.00 % | 0.52 % | byte-identical at every og head; the falling sheet is not the plate |
| `lip=0` | 1.98 / 0.00 / 0.00 % | 10.2 % | the aerated lip paints head A only (B and C sit where `breakMask` = 0, §3); plate persists on all three |
| `onset=0` | 35.1 / 8.6 / 22.4 % | 45.8 % | reshaped (the held-pose bend), persists |
| `fft=0` | 0.11 / 0.75 / 0.41 % | 0.94 % | ripple only |
| `splash=0` | 0.00 / 0.00 / 0.00 % | 0.00 % | nothing at the heads |
| `classic=1` | 38.0 / 22.1 / 24.0 % | 43.8 % | reshaped (broader crown, elliptical reach), persists — the 2026-09-15 "remaining angular lip" |
| `look=full` | 70.0 / 57.8 / 45.1 % | 50.8 % | the whole look changes (S capped at 0.98, back faces discarded, connected throw); a white polygon remains at each head, front-facing by construction |
| `q=medium/low/potato` | low 10.1 / 6.9 / 7.7 %; potato 19.0 / 13.7 / 12.0 % | low 21.9 %; potato 33.4 % | fewer, larger facets on the same footprint; at the close pose the potato slab thins as the fold is under-sampled |
| `underside=0` (§5) | 4.27 / 2.33 / 3.44 % | 2.91 % | the back-facing layer is culled (facing view all green); plate persists |

Resolution changes the facet count, not the plate; no shading or mechanism
switch removes it. So the plate is geometry, and the question becomes which
geometry and why it is white.

## 3. The convicting probe: the fold as the mesh sees it

`scripts/probe_lip_facets.mjs` reads `__pointbreak.curlProbe` — the shipped
`surfacePos`, live uniforms, live bed textures — along shore-normal transects
at the grid's own vertex columns (x = −375 + i·1.465 m), sampled at 1/16 of a
core cell (0.102 m) so every 16th sample is a grid vertex. Columns with a bend
past a quarter turn (`curl` > 0.25) cluster into three heads at sim 42:
x ≈ −133.0, −108.1 and 7.6 m. Per transect (`probe.json`):

| head x (m) | column | fold chords | layers | mesh reach (m) | fine reach (m) | max normal jump | foam at fold | pocket at fold | `breakMask` | `aer` max |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| −133.0 | −133.3 | 4 | 3 | 7.53 | 7.85 | 135° | 0.67 | 0.90 | 0 | 0 |
| | −131.8 | 6 | 3 | 11.56 | 12.27 | 110° | 0.65 | 0.87 | 0 | 0 |
| | −130.4 | 6 | 3 | 10.95 | 11.60 | 109° | 0.56 | 0.75 | 0 | 0 |
| −108.1 | −108.4 | 4 | 3 | 3.25 | 3.30 | 109° | 0.86 | 0.99 | 0 | 0 |
| | −106.9 | 5 | 3 | 9.42 | 9.66 | 143° | 0.87 | 0.98 | 0 | 0 |
| | −105.5 | 4 | 3 | 9.47 | 9.76 | 150° | 0.87 | 0.82 | 0 | 0 |
| 7.6 | 4.4 | 6 | 3 | 11.32 | 11.86 | 110° | 0.85 | 0.96 | 1 | 0.02 |
| | 5.9 | 5 | 3 | 11.41 | 11.72 | 128° | 0.84 | 0.97 | 1 | 0.02 |
| | 7.3 | 4 | 3 | 14.18 | 14.27 | 132° | 0.84 | 0.97 | 1 | 0.74 |
| | 8.8 | 3 | 3 | 11.52 | 11.72 | 155° | 0.83 | 0.96 | 1 | 1.00 |
| | 10.3 | 3 | 3 | 3.01 | 3.15 | 79° | 0.82 | 0.95 | 1 | 0.02 |

Reading it:

- **The fold is real and resolved.** Mesh reach is 96–99 % of the finely
  sampled reach: the plate's footprint is the surface's, not an aliasing
  artefact. 7–14 m of overturned reach across 3–4 columns (4.5–6 m
  alongshore) is a 1.5:1 to 3:1 slab, which is what the drone sees.
- **It is a Z-fold.** Every folded transect crosses exactly three layers
  (forward, back, forward). A vertical ray meets the reversed middle layer
  first — the crest band, doubled back seaward over the rising face — then
  the front face under it, then the foot.
- **The bend is a minor contributor.** `curl` (turns of bend) peaks at
  0.26–0.52, i.e. 47–93°; the reach comes from the choppy displacement
  `off = lam·grad` at S → 1 (1/k ≈ 15 m at T = 15 s in 4 m of water) over a
  sharply curved head — the same thing the 2026-09-15 note saw the foam-mound
  gradient do. `curl=0` removing the S cap makes it larger, not smaller.
- **Chord normals reverse between neighbours.** The forward-difference
  normal at vertex j is the chord j→j+1 normal (GRID_VERT), and consecutive
  chords in the fold differ by 109–155°. The fragment interpolates across
  that; where the interpolated `vNormal` passes near zero length,
  `normalize()` scatters it — the bright specks along the plate edges.
- **The paint is not one flag's.** Foam at the fold is 0.56–0.87 and pocket
  0.75–0.99 at all three heads (GRID_FRAG mixes `foamCol` at up to 0.97 and
  `vec3(0.98)` at up to 0.9 there). The aerated lip reaches 1.0 only at the
  x ≈ 7.6 head; at the other two `breakMask` = 0 — those heads sit in section
  gaps, so `aer` is gated to 0 while foam and pocket are not. That is why
  `lip=0` touches head A alone.

## 4. Diagnostic views (`#facetdebug=1|2|3`, a build flag)

Three views replace the water colour in `GRID_FRAG`, under `#ifdef
FACETDEBUG` so the shipped program text is untouched (a uniform branch alone
was measured to move default pixels — the ROLLER precedent in main.js).

- **`1` facing** — front faces green, back faces red. At both poses the plate
  is solid red: every fragment of it is a back face. With the eye above the
  water a visible back face cannot belong to a single-valued heightfield (the
  view ray would have to enter the water from below), so this is the reverse
  side of the overturned middle layer, which GRID_FRAG then flips
  (`Ng *= gl_FrontFacing ? 1 : −1`) and lights as a face.
- **`2` raw vertex normal y** (0.5 = horizontal, unflipped). Black across the
  plate: `vNormal.y ≈ −1`. The forward-difference normal the fragment
  inherits points down on the whole plate.
- **`3` paint owner** — R = foam mask, G = pocket-lip mask, B = aerated-lip
  mask. The plate is pink/orange: foam plus aer on head A, foam plus pocket
  lip on B and C, all saturating on the back face because those paints are
  applied to both sides.

Sheet rows `dbgfacing`, `dbgnormal`, `dbgpaint`; frames
`frames/<pose>_dbg*_<head>.png`.

## 5. The flag-gated arm: `#underside=0`

The facing view names one class exactly: back face, eye above water
(`u_camUnder` < 0.5), eye above the fragment (`V.y` > 0). GRID_FRAG now
discards it under `#ifdef FOLDCULL`, read at boot like `roller`. The barrel
roof seen from inside the tube has `V.y` < 0 and is kept; the dive view is
already `u_camUnder`'s branch; the default build compiles the shipped text
and the default frame is byte-identical (verified after the edit, §1).

**A/B.** `sheet_og.jpg` / `sheet_close.jpg` rows `base` vs `underside0`;
`diff_base_underside0.json`. The cull works — `underside0dbg` (facing view
with the arm on) is green everywhere — and moves 4.27 / 2.33 / 3.44 % of the
og head crops and 2.91 % of the close crop, mostly the plate's rim. **The
plate stays.** Removing the reversed middle layer exposes the front face
beneath it, which the Z-fold gives the same footprint and which foam and
pocket paint the same white. This is the result the probe predicts (three
layers, paint on all of them), and it retires hypothesis 3 as *the* cause
while confirming it as the topmost skin.

**What the arm does not do.** It is not a fix for the og hero; it is the arm
that shows the underside is not the owner. It has not been checked from the
`follow`/`pov` cameras or across other presets and clocks; a fragment of the
tube roof seen from a camera slightly above it would be culled. It stays a
build flag, default off.

## 6. Hypotheses, disposed

| # | hypothesis | disposition |
|---|---|---|
| 1 | mesh chords across the fold | true but not sufficient: 3–6 chords resolve 96–99 % of the reach; `q` tiers change the facet count on a fixed footprint |
| 2 | the FD normal straddling the fold | true: consecutive chord normals differ by 109–155°, `vNormal.y ≈ −1` on the plate; it sets the shading, not the plate |
| 3 | DoubleSide underside lit as a front face | true for the topmost layer (100 % back-facing at both poses); culling it exposes a front-facing layer with the same footprint (§5) |
| 4 | specular/fresnel on flipped normals | not the whiteness: the paint view shows foam/pocket/aer saturating; `fft=0` moves < 1 % |
| 5 | curtain z-fighting the grid | no: `curtain=0` is byte-identical at the og heads |
| 6 | horizontal displacement shearing quads | this *is* the fold: `off = lam·grad` at S → 1 gives 7–14 m of reversed travel; the bend adds 47–93° on top |

## 7. What would remove it

Not a fragment-shader change. The plate is a 4–6 m by 7–14 m three-layer
fold painted white on every layer, and any shading of it renders a slab. The
routes that address the geometry:

- **Track B's explicit tube mesh** — draw the lip as its own strip from the
  crest line, and stop folding the heightfield (cap S below the fold at the
  head, or drop the choppy horizontal displacement inside the bend band). The
  heightfield then stays single-valued, no back faces from above, no plate.
- **A model change to the head's fold reach** — the reach comes from
  `lam·grad` with lam = S/(a·k²) ≈ 1/k at S = 1; bounding the *reversed*
  component (`dz/dz0` < 0) rather than |off| would keep the cusp and remove
  the doubling back. That is a `choppyPos` decision, outside this track.
- **Paint** — foam and pocket paint both sides of every layer. Restricting
  them to `gl_FrontFacing` (as `steepF` already is) would darken the reversed
  layer, not remove it; with `underside=0` it would darken nothing. Not
  pursued.

## 8. Files

- `scripts/capture_lip_facets_ab.mjs` — the matrix (poses, arms, zoom crops,
  contact sheets, `--diff`, `--sheet-only`).
- `scripts/probe_lip_facets.mjs` — the transect probe (`probe.json`).
- `web-three/js/shaders.js` — `#ifdef FACETDEBUG` views and the
  `#ifdef FOLDCULL` cull in `GRID_FRAG`.
- `web-three/js/main.js` — `FACETDEBUG_BUILD`, `FOLDCULL_BUILD`,
  `u_facetDebug`, `u_underside`, the water material's defines, the hash reads.
- `docs/CONTROLS.md` — `facetdebug`, `underside` rows.
- `qa/lip-facets-2026-09-24/` — sheets, manifest, probe, diffs.
