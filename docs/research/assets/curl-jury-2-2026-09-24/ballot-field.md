# Field-comparator ballot — jury 2 (2026-09-24)

Seat: side-by-side against the site's own footage, ratios only. Reference = the three field sheets and
`measurements.json` in `docs/research/assets/curl-truth-2026-09-24/` (Andy's 2026-08-15 15:28 Second Peak
clip, cliff rail), ratio definitions from CURL_TRUTH §1.3, lip behaviour from §1.2. Nothing else read.

## Method

- All 45 frames of `jury2-matrix/` opened and read; 3 rigs × 5 arms × clocks 52/54/56, 1000 × 625 px.
- Luma-run method of `measurements.json`, thresholds re-set for the render's ~1.4× exposure as the previous
  field seat did: foam (saturated white) = luma > 205 and chroma < 25; sheet = luma > 182; dark face = luma < 133
  (= 95 × 1.4); cavity = teal and luma < 80. Columns averaged over 5 px.
- Second Peak rigs: knuckle edge x_k = leftmost x on the outer crest where foam ≥ 3 px tall holds for ≥ 6 px.
  H_f = crest (the sheet-jump row that marks the lip; foam sits on it, so it is the crest, not the dark
  beyond-crest band above it) → trough luma minimum, median over 15–50 px ahead of x_k. Knuckle width = run
  where foam height ≥ ½ its max (gaps ≤ 15 px). Bore band read at the field's own offsets, 40–80 px behind the
  knuckle edge, and again 150–220 px behind (4–5 H_f, where the field's bore is still full). Plume = highest
  sheet pixel above the crest line behind the head. Feather zone = lit crest (luma > 150) run ahead of x_k.
- Pixel diff first: at both Second Peak rigs `default ≈ tubeclassic ≈ sections` (1–5 k px differ out of 625 k,
  JPEG-noise level) and `bore ≈ all` (7–13 k). The five arms are two pictures at the site comparison; the tube
  and section flags do not reach the cliff view. At Sewers all five differ (`default ≈ bore`, `sections ≈ all`).
- Best-developed clock: setwave 54 (largest saturated block, cleanest crest ahead); surfline 52 for bore/all
  (at 52 and 54 the default family shows **no** saturated white at the head at all, only a 3-px cap at 56, so
  surfline 56 is used for default/tubeclassic/sections). Sewers 52 for every arm (throw phase).
- Sewers: camera is inside the wave, lens and pose differ from the footage. H_f taken as crest (y≈280) → ribbon
  landing (y≈470), ≈190 px, from the `tubeclassic` frame; hand-read boxes checked against component masks.

Crops (all under `jury2/crops/`): `sp_<rig>_<arm>_<clock>_annot.png` (yellow = H_f ahead, red = knuckle edge,
green = knuckle block, cyan = band 40–80 px behind, magenta = sheet band 150–220 px behind), `*_head3x.png`
raw 3× heads, `sewers_<arm>_52_annot.png` and `sewers_<arm>_5x_head2x.png`.

## Ratio table

Field row: A = outer peel (the normal head), B = section collapse (the only throw), C = thin head. Field
values from §1.3 verbatim; "none" = not present in that source. Render: setwave 54 / surfline (52 bore & all,
56 others), Sewers 52. `—` = not measurable at that rig.

| quantity ÷ H_f | **field** A · B · C | default | bore | tubeclassic | sections | all |
|---|---|---|---|---|---|---|
| H_f, px (unbroken face at head) | 49–56 · 57–59 · 49–55 | sw 40 / sl 26 / sew ~190 | 39 / 22 / ~190 | 40 / 26 / ~190 | 40 / 25 / ~190 | 40 / 22 / ~190 |
| knuckle width | 0.8–1.5 · — · 0.5–0.8 | 0.65 (3–6 px feather cap, no blob) / 0.58 | **1.49** / 4.36 | 0.35 (cap) / 0.92 | 0.23 (cap) / 0.88 | **1.45** / 4.41 |
| knuckle (head white) height | ≈ bore band at head, 0.35–0.65 | 0.13 / 0.12 | **0.62** / 0.73 | 0.18 / 0.23 | 0.13 / 0.12 | **0.58** / 0.64 |
| lip projection ahead of face | none · ≤ 0.3 · ≤ 0.1 | SP none; sew 0.40 (flat white plate, not a lip) | SP none; sew 0.40 (plate) | SP none; sew 0.50 mid-height (0.9 at leg tip) | SP none; sew 0.17 (hook) | SP none; sew 0.17 (hook) |
| curtain height (throw phase) | — · 0.5–0.6 · — | SP none; sew none (plate spans 0.45 below crest, static) | same as default | SP none; sew **1.0** (ribbon lands at the base) | SP none; sew none | SP none; sew none |
| plume above prior crest | — · ≤ 0.15 · — | SP 0.08; sew 0.12 (plate top), spray streaks to 0.4 | SP 0.03; sew 0.12, spray 0.4 | SP 0.05; sew 0.05, spray 0.25 | SP 0.08; sew 0.08, spray 0.2 | SP 0.02; sew 0.08, spray 0.2 |
| bore band, 40–80 px behind head | 0.5–0.65 · 0.4–0.55 · 0.35–0.4 | 0.09 / 0.00 (sheet 0.12) | **0.51** / 0.55 | 0.10 / 0.00 (sheet 0.12) | 0.10 / 0.00 (sheet 0.12) | **0.53** / 0.55 |
| bore band, 4–5 H_f behind head | same, the bore is continuous for 7.5 s | 0.00 foam, 0.00–0.16 sheet | 0.08 foam, 0.22 sheet | 0.00, 0.00–0.12 | 0.00, 0.00–0.12 | 0.07 foam, 0.30 sheet |
| bore top vs unbroken crest | level (≤ 0.1 below) · 0.2 below wall · level | −0.07 (level) | +0.05 (level) | −0.05 | −0.03 | +0.03 |
| feather zone ahead of knuckle | ~1 · — · ~0.5 | 0.60 / 0.96 | 0.90 / 1.95 | 0.60 / 0.85 | 0.60 / 1.00 | 0.62 / 1.91 |
| dark face readable ≥ 1 H_f ahead | yes, luma 45–90, darkest at the wall top | yes at setwave (98 % of face rows < 133 at 1–2 H_f ahead), marginal at surfline (40–60 %); but the face is **lit at the crest and dark at the trough**, the inverse of the footage | same face (flags do not touch it) | same | same | same |
| dark cavity behind lip (§1.2: never) | none in 1,825 frames | none | none | none at SP; Sewers: ribbon is translucent over mid-teal, luma > 100, no cavity | none | none |

Notes on the table:
- setwave (h0 = 1.40) gives H_f ≈ 37–40 px, closest to the footage's 49–59; surfline (h0 = 0.914) gives
  22–26 px, so its ratios are coarser (1 px = 0.04 H_f) and its knuckle widths in H_f run high.
- In the default family the "knuckle" is a 3–6 px feather line along the crest; width is quoted for
  completeness but the field's knuckle is a saturated blob 0.5–0.65 H_f tall, which no default-family frame has.
- In bore/all the saturated block is 55–60 px at setwave, then the whitewater collapses to a 2–3 px foam /
  8–12 px sheet within ~3 H_f. The footage's bore stays 27–33 px thick across the whole 400-px crop.
- `setwave_sections_52` gave plume 0.33 from a bright pixel in the beyond-crest band; discarded as noise
  (sections is pixel-identical to default there).

## Per arm: two ratios furthest from the field, one closest

Distance = |ln(render ÷ nearest edge of the field range)|, 0 inside the range, render zero floored at 1 px ÷ H_f.

- **default** — furthest: bore band 4–5 H_f behind (0 vs 0.35–0.65; the bore does not exist) and bore band at the
  head (0.09 / 0.00 vs 0.5–0.65). Closest: bore top vs crest, plume, feather zone all inside the field bracket
  (the crest line is conserved and nothing rises; §1.3 point 1 is satisfied by omission).
- **bore** — furthest: bore band 4–5 H_f behind (0.08 foam / 0.22 sheet vs 0.35–0.65) and knuckle width at
  surfline (4.4 H_f, the block is one undifferentiated slab of white). Closest: bore band 40–80 px behind the
  head, 0.51–0.55, dead inside the field's 0.5–0.65.
- **tubeclassic** — furthest: same two as default (band 0.10 / 0.00, far band 0). Closest: knuckle width 0.92
  at surfline 56 (a cap, not a blob, but the right width). At Sewers the ribbon is the only arm with a curtain,
  and it is a full face tall (1.0 vs 0.5–0.6): the §1.3 "half a face, not a face" note applies to it directly.
- **sections** — furthest: same two as default. Closest: bore top vs crest (−0.03). No section-collapse
  signature (wall, curtain, plume) is visible at either Second Peak rig; the flag changes nothing there.
- **all** — furthest: bore band 4–5 H_f behind (0.07 / 0.30) and knuckle width at surfline (4.4). Closest:
  knuckle height 0.58 and band 0.53 at setwave, both inside the field bracket; setwave 54 total distance 0.15.

## Ranking 1 — Second Peak cliff rigs (the site comparison)

Sum of |ln| over the ratios measurable in both: knuckle width, knuckle height, band 40–80, band 4–5 H_f,
bore top vs crest, plume, feather zone, lip projection (none in both → 0). Mean of setwave 54 and surfline.

| rank | arm | setwave 54 | surfline | mean | what carries it |
|---|---|---|---|---|---|
| 1 | **all** | 0.15 | 2.39 | 1.27 | head white right height and thickness; loses on the surfline slab width and the missing trailing bore |
| 2 | **bore** | 0.46 | 2.27 | 1.37 | same picture as `all` within noise (7–13 k px) |
| 3 | tubeclassic | 4.91 | 3.70 | 4.31 | default picture; a 6–7 px cap instead of 3–5 px |
| 4 | default | 4.99 | 4.35 | 4.67 | feather line, no knuckle, no bore |
| 5 | sections | 5.66 | 4.31 | 4.98 | default picture; narrowest cap at setwave 54 |

Ranks 1–2 and 3–5 are each within measurement noise of one another; the real ordering is
{all, bore} ≺ {tubeclassic, default, sections}. What separates the groups is one thing: whether the head carries
a saturated white body 0.5–0.65 H_f tall. Every arm fails the same second thing: the footage's bore is
continuous and 0.5–0.65 H_f thick for the length of the crop; the render's collapses to a sheet within ~3 H_f.

## Ranking 2 — Sewers throw geometry (ordinal, not metric)

Caveat: Sewers is a different spot on a plunging card, the lens and the pose are not the footage's, the camera
sits inside the wave, and H_f (≈190 px) is read to the ribbon landing rather than a trough. Only lip projection,
curtain and plume are compared, against event B (the clip's one throw). The white polygon in default/bore is a
flat plate, not a descending sheet; it is scored as "no curtain", with the lenient reading given after.

| rank | arm | lip proj. | curtain | plume | sum |ln| | note |
|---|---|---|---|---|---|---|
| 1 | tubeclassic | 0.50 | 1.0 | 0.05 | 1.02 | the only arm that throws; projects ~1.7× and falls ~1.8× further than B |
| 2= | all | 0.17 | none | 0.08 | 4.55 | hook only, matches B's ≤ 0.3 projection; no curtain |
| 2= | sections | 0.17 | none | 0.08 | 4.55 | pixel-near `all` at Sewers 52 |
| 4= | default | 0.40 (plate) | none | 0.12 | 4.84 | flat white polygon 400 px along the crest, spray streaks to 0.4 above |
| 4= | bore | 0.40 (plate) | none | 0.12 | 4.84 | same plate |

Lenient reading (count the plate's 0.45 H_f extent below the crest as a curtain): default/bore would score 0.39
and top the list. I do not take that reading: §1.2's curtain is water that descends from a wall and lands within
a fraction of a second; a static plate with straight edges is not that, whatever its height.

## Two things the footage says that no arm does

1. The bore is the wave's second body, not a trim: 0.5–0.65 H_f thick, level with the crest, continuous for
   7.5 s. bore/all get the first 1.5 H_f of it right and then lose it.
2. The face is darkest at the top. Every arm lights the crest and darkens toward the trough; the footage does
   the opposite (wall 45–90, lip line the only bright thing). This does not enter the ratio sums, and it is the
   biggest side-by-side difference at the cliff pose.
