# The reef scorecard — 2026-09-24

FIDELITY_AUDIT_2026-09-23 ranked item 3 (fit the down-point reefs over the
H0 band, signed) and PEEL_BAND_FIELD_2026-09-24 §6 (the apex fit is wrong at
depth) both end with the same instruction: the Sentinel-2 loci and the
2026-08-15 cell are the acceptance tests for any refit. Until now those tests
lived in seven scripts with seven output formats. `scripts/score_reef_fit.mjs`
is one headless scorecard for a reef bake: seven presets, one row each, every
number read through the instrument that first published it, on the bake's own
code (MEASUREMENT_LESSONS 4). It takes the same per-spot knobs the peel-band
instrument serves (`--knobs=`), the ordinary bed-source switch (`--bed=`), and
a reef-arm pass-through (`--reef=`) for a bake that exposes one. Assets:
`docs/research/assets/reef-scorecard-2026-09-24/` (`shipped.json/.md`,
`hypothetical-secondpeak.json/.md`, the knob file). Model at `a8f16ca`.

## 1. What it scores

Per spot, one markdown table plus one JSON:

| column | instrument | definition |
|---|---|---|
| card α (target) | `measure_reef_fit_signed.mjs` `disagreeCard()` | canonical signed stage-median clean α at the card (tide 0, card T, card H0) vs `alphaTarget` |
| on-reef, rev off-ramp / ramp st. | same | fraction of stage stations on the uplift footprint; clean on-reef reversals with slew-ramp members excluded; ramp-station count |
| Vp | `measure_peel_band_field.mjs` `measureCell()` | median \|lineVelocityMps\| over clean non-gap stage stations (the HUD's 14.06 m stencil) |
| H0 window 0.7–1.3× | `measure_break_activation.mjs` `instrumentState`/`repSummary` | every 0.05 m rung of card × [0.7, 1.3] at tide 0 and the card T healthy by the floor's criterion (α ≥ 10° with the authored sign, ≥ 50 % on reef); pass/fail and the failing rungs |
| R4 \|α\| ≥ 30° | `measure_physics_residuals.mjs` `peelWindow()` | the contiguous H0 range around the card (0.7–1.4×) where the stage α clears Walker's 30° |
| floor | `measure_break_activation.mjs` `measurePeelFloor()` | the `PEEL_FLOOR` ladder (0.4 → card at 0.01 m), with flips and the bake digest |
| tide band | `tideBand()` in the scorecard, on the instrument's own ladders | contiguous tide interval around 0 in which every 0.01 m rung from the floor to the card is healthy — `measureTideFloor`'s "floorH0(t) ≤ floorH0(0) and the card is a peel", walked outward from 0 to the first failing tide on each side; `tideDigest` included |
| activation | `reefActivationH0()` | lowest H0 at which the break criterion is met anywhere on the wedge, card T, tide 0 |
| posts > −0.5 / > +0.14 / dry | `bed.reefAudit` + the composite grids | wet posts raised above the old −0.5 m NAVD88 ceiling; the same count against MLLW + 0.1 m (+0.143 m NAVD88); dry posts touched |
| field day (Second Peak) | `measureCell()` | the two 2026-08-15 cells — SC116 Hs 0.778 m at the verified tide +0.500 m, Surfline 3 ft 0.914 m at the predicted tide +0.357 m, T 16 — α, Vp, c, on-reef against observed Vp 4.7–6.7, c 3.8–5.3, α ≥ 30° on the wedge |
| S2 contradicted / closest | `compare_sentinel2_line.mjs` `compareScene()` + `main()`'s rule | reef arm per main (scene, spot): contradicted when the H1/10 line sits > 16 m shoreward of the median foam edge; closest among consistent arms by the Hs/Ks line; the apex cells listed |
| Lookout (Jack's) | `scripts/lib/lookout-line.mjs` | Jack's line at the 2026-09-05 forcing (Hs 0.902, T 16.67, tide +0.316) projected into the Lookout pose; model − photo along the ground ray at wave A / wave B / lineup, raw Hs and 1.27·Hs, against the recorded `locus-measured.json` points |

**Verdict.** One line per spot, PASS or FAIL naming the first failing
criterion, in this order: dry posts untouched; no wet post above MLLW + 0.1 m;
the card is a peel by the floor's criterion; no clean off-ramp on-reef
reversal at the card; no Sentinel-2 cell contradicted on the reef arm; (Second
Peak) both field-day cells inside the observed brackets with α ≥ 30° on the
wedge; (Jack's) the Hs line not seaward of the photographed wave A beyond the
pose envelope (±28.8 m). The photograph bounds the line from the seaward side
only — a bigger set wave may have broken at the edge — so that is the only
Lookout statement a single frame supports; the wave-A residual at 1.27·Hs is
undefined on the shipped reef (that arm's line does not cross wave A's columns
in frame), which is why it is reported and not gated.

Reported, not gated: the card-target residual, the H0 window, the R4 window,
floor, band, activation, and the count above the old −0.5 m ceiling. They
describe the bake; the gated criteria are the observations and the invariants
a refit must not break. The H0 window fails at every spot on the shipped bake
(the floors sit above 0.7× the card everywhere), so gating on it would make
the verdict column uniform and useless; it stays a column.

## 2. The gate (lesson 4)

On the shipped bake with zero knobs the scorecard reproduces the published
records number for number — **466/466 checked values matched**, printed
before the table:

| record | what was checked | matched |
|---|---|---|
| `PEEL_FLOOR` (params.js) | floorLo/Hi/H0, flipLo/Hi, alphaBelow/Above, onReefBelow/Above, basisT, bakeDigest, tideBandM, every tideEdges field, tideDigest, all six spots | all |
| `qa/break-field/summary.json` | reefActivationH0, seven spots (4 dp) | all |
| `physics-core-2026-09-23/summary.json` | R4 windowLo/Hi and the fifteen rung α (3 dp), seven spots | all |
| `sentinel2-locus-2026-09-23/residuals.json` | the 4/24/6 reef score (and plane 12/16/8, measured 10/18/1), per-cell reef verdict, H1/10 and Hs/Ks offsets at K = 6, 28 cells | all |
| `lookout-locus-2026-09-23/residual.json` | d_range and d_z medians, five features × fifteen arms | all, within 0.0151 m |
| `peel-band-2026-09-24/field.json` | the field-day cells: α 9.74 / Vp 24.17 / c 4.12 / on-reef 0.000 and 7.26 / 34.73 / 4.43 / 0.000 | all |

Two things the gate taught. (1) The peel-band note's Sentinel *replica*
reproduces the record's score but not its offsets to 0.1 m (it takes the median
of unrounded station offsets; `compare_sentinel2_line.mjs` rounds each station
to 0.1 m first, then takes the median — 88.1 vs 88.0 at Sewers), so the
scorecard runs `compareScene()` itself on the knob bed rather than the replica.
(2) The Lookout residual is re-formed from the recorded photo points, which
`measure_lookout_locus.py` wrote to 2 dp after computing its residual from the
unrounded ones; the re-formed medians agree to ≤ 0.0151 m, and the tolerance
is declared in the gate rather than hidden by a rounding.

## 3. The shipped bake

| spot | card α (target) | on-reef | rev / ramp | Vp | H0 window | R4 ≥ 30° | floor | tide band | activation | posts > −0.5 / > +0.14 / dry | S2 contra / closest | verdict |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Sewers | 36.3 (38) | 0.76 | 0 / 56 | 10.2 | FAIL (1.54) | 1.65–2.42 | 1.62 | [−0.862, 0.000] | 1.239 | 0 / 0 / 0 | 0/4 / 2 | PASS |
| First Peak | 60.7 (50) | 1.00 | 0 / 24 | 6.3 | FAIL (1.26, 1.35) | 1.44–open | 1.38 | [−0.862, +0.010] | 1.143 | 0 / 0 / 0 | 2/4 / 1 | FAIL — Sentinel-2 (2024-01-04, 2021-01-09) |
| Second Peak | 25.8 (41) | 0.83 | 0 / 27 | 8.1 | FAIL (1.05) | none | 1.11 | [−0.720, +0.010] | 1.003 | 0 / 0 / 0 | 0/4 / 3 | FAIL — field-day cells (both: α, on-reef, Vp) |
| Jack's | 37.1 (37) | 0.82 | 0 / 31 | 7.4 | FAIL (0.77) | 0.88–open | 0.78 | [−0.862, 0.000] | 0.616 | 0 / 0 / 0 | 1/4 / 0 | FAIL — Sentinel-2 (2023-09-26) |
| The Hook | 36.8 (41) | 0.70 | 0 / 62 | 6.8 | FAIL (1.05) | 1.20–1.65 | 1.09 | [−0.862, 0.000] | 0.916 | 0 / 0 / 0 | 1/4 / 0 | FAIL — Sentinel-2 (2023-09-26) |
| Sharks | 30.5 (36) | 0.73 | 0 / 40 | 7.5 | FAIL (0.70–0.80) | 0.95–1.05 | 0.81 | [−0.862, +0.010] | 0.726 | 0 / 0 / 0 | 0/4 / 0 | PASS |
| Privates | 15.8 (31) | 0.00 | 0 / 0 | 14.0 | FAIL (all) | none | none | none | 0.721 | 0 / 0 / 0 | 0/4 / 0 | FAIL — card not a peel (on-reef 0.00) |

Second Peak field-day cells: 0.778 / +0.500 → α 9.7, Vp 24.2, c 4.12, on-reef
0.00; 0.914 / +0.357 → α 7.3, Vp 34.7, c 4.43, on-reef 0.00. Jack's Lookout
(reef arm): raw Hs wave A −62, wave B −195, lineup −29; 1.27·Hs wave A n/a,
wave B n/a, lineup −3. Sentinel-2 all spots: reef 4/24/6, plane 12/16/8,
measured 10/18/1.

Two spots pass every gated criterion (Sewers, Sharks); the five failures are
the audit's own findings restated in one column — the down-point reef against
the 2023-09-26 frame at Jack's and The Hook (the open H0 anomaly of T5), First
Peak against two January frames, Second Peak against the 2026-08-15 day, and
Privates with no wedge under its card.

## 4. The demonstration: PEEL_BAND §4's hypothetical wedge

`--knobs=knobs-hypothetical-secondpeak.json` = `{"crest":{"Second Peak":-1.6},
"ceil":{"Second Peak":0.8},"beta":{"Second Peak":45}}`: the ceiling lifted by
0.8 m with the crest riding it (0.805 m below MSL, +0.10 m NAVD88), strike
45°. Served through `registerReefKnobs()` at bed.js's plain URL, so every
instrument in the card scores it; the six other spots are bit-identical to the
shipped table (the knobs are per spot).

| Second Peak | shipped | hypothetical L 0.8, β 45 |
|---|---|---|
| card α (target 41) / on-reef / Vp | 25.8 / 0.83 / 8.1 | 30.7 / 0.93 / 6.6 |
| H0 window 0.7–1.3× | FAIL (1.05) | pass (α 40.2 → 30.7 over 1.05–1.50, on-reef ≥ 0.93) |
| R4 \|α\| ≥ 30° | none | open (1.05) – 1.50 |
| floor / tide band / activation | 1.11 / [−0.72, +0.01] / 1.003 | 0.45 / [−0.80, +0.01] / 0.261 |
| 0.778 m, +0.500 m: α / Vp / c / on-reef | 9.7 / 24.2 / 4.12 / 0.00 | 40.7 / 6.4 / 4.18 / 0.63 |
| 0.914 m, +0.357 m: α / Vp / c / on-reef | 7.3 / 34.7 / 4.43 / 0.00 | 41.6 / 6.0 / 4.14 / 0.84 |
| Sentinel-2 Second Peak, H1/10 offsets | +10, −124, +16, +12 (all consistent) | +9, −112, +13, +15 (all consistent) |
| posts > −0.5 / > +0.14 m NAVD88 / dry | 0 / 0 / 0 | 235 / 32 / 0 |
| verdict | FAIL — 2026-08-15 field-day cells | FAIL — 32 wet posts above MLLW + 0.1 m |

The verdict flips from the observation to the invariant: with the shelf, both
field-day cells pass on every quantity (α 41° inside seqA's 36–49°, Vp 6.0–6.4
inside 4.7–6.7, c 4.1–4.2 inside 3.8–5.3, on the wedge), the card gains 5°,
the floor drops 0.66 m, the band widens below, and the Sentinel-2 Second Peak
cells stay consistent — and the first failing criterion becomes the ceiling.
Not the old one: the count above −0.5 m (235) is reported, and the gate is
the MLLW + 0.1 m line at +0.143 m NAVD88, which the wedge's ridge modulation
crosses on 32 posts (crest target +0.10, post clamp +0.30; highest touched
post +0.228 m). So the scorecard says what the peel-band note said and puts
a number on it: the day is reproducible by a wedge that breaks the shoreline
ceiling, and the decision is the ceiling. The numbers are the note's own
(PEEL_BAND §4's L 0.8 row: 40.7 / 0.63 / 6.4, 41.6 / 0.84 / 6.0, card 30.7 /
0.93 / 6.6, 235 posts), which is the plain-URL hook reproducing the `?band=`
instance the note used.

## 5. Usage

```sh
node scripts/score_reef_fit.mjs                          # shipped bake, all seven spots, ~6-8 min (the tide bands are ~20k gated bakes)
node scripts/score_reef_fit.mjs --fast                   # no tide bands, ~35 s
node scripts/score_reef_fit.mjs --knobs=docs/research/assets/reef-scorecard-2026-09-24/knobs-hypothetical-secondpeak.json --label=hypothetical-secondpeak
node scripts/score_reef_fit.mjs --bed=cudem19            # the CUDEM candidate (output tagged .cudem19; gate not applicable)
node scripts/score_reef_fit.mjs --reef=legacy            # pass-through; applied only if bed.js exports setReefFitArm / setReefArm / setReefFitMode
node scripts/score_reef_fit.mjs --spots=secondpeak,jacks --out=qa/reef-score
node scripts/score_reef_fit.mjs --render=qa/reef-score/shipped.json   # re-render the .md from a run's JSON
```

Default output `qa/reef-score/<label>.json` (compact) and `.md`; the label is
the knob file's basename or `shipped`, with the bed tag appended. The gate is
defined only on the shipped bed with zero knobs and no applied reef arm; any
other run prints "gate: not applicable" and why. Exit code 2 on a gate
mismatch.

`tests/score-reef-fit.test.js` runs the gate on a subset in ~8 s: Sharks and
Second Peak without their tide bands (the bands are most of the full run), the
Sentinel-2 and Lookout instruments for every spot, the reef audit at all
seven, and the knob hook's zero-knob reproduction at the field-day cells. A
bake change that moves a floor, a digest, a Sentinel verdict or a field-day
cell fails there before it reaches the scorecard.

## 6. Reproduction and what changed

Two instruments were refactored so the scorecard could import them, each
proven output-identical by re-running before and after and diffing
(`generated` stamp aside): `measure_peel_band_field.mjs`'s PATCHES / load hook
/ `bedFor` moved verbatim to `scripts/lib/reef-knobs.mjs` (re-exported under
the old names; `--mode=observed` field.json and console identical), and
`measure_lookout_line.mjs`'s pose read, projection and arm loop moved to
`scripts/lib/lookout-line.mjs` (`model-lines.json` and console identical).
Nothing under `web-three/`, `shared/` or the shaders changed. Run time on an
M-series laptop: 34 s `--fast`, ~6–8 min full (717 s and 809 s here with the
two runs sharing the machine). `npm test` 221 green at this commit.
