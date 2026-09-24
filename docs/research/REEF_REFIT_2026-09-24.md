# The reef refit — 2026-09-24

Andy's call, verbatim: "allow the intertidal crest, go with the refit."
PEEL_BAND_FIELD_2026-09-24 §6 had named the binding constraint — the −0.5 m
NAVD88 crest cap, not the strike, is what closed the 2026-08-15 Second Peak
day — and FIDELITY_AUDIT item 3 had queued the signed refit over the H0 band
on the canonical α. This note is both: the crest cap moves to MLLW + 0.1 m,
and every spot's wedge is re-fitted offline over (crest depth, strike) on the
stage-median signed α, baked into `data/model/pp_reef_fit.json`. Model at
`12ffab7` (the refit commit, off `a8f16ca`), NCEI 1/3" 2012 interpolant.
Headless throughout: nothing here has been looked at.

## Finding

With the crest allowed up to an intertidal +0.143 m NAVD88 (0.76 m below
MSL), a per-spot (crest, β) search on the canonical stage α puts every spot's
whole 0.7–1.3× H0 band on a right-handed peel on the reef (the shipped fit
held only 0.75–1.3× at six spots and 1.1–1.4× at Privates), lands the
2026-08-15 Second Peak cells at α 41° with Vp 6.1–6.3 m/s and c 4.2 m/s
(observed 4.7–6.7 / 3.8–5.3; shipped 7–10° at Vp 24–35), and drops every
peel floor (Second Peak 1.11 → 0.47 m, Jack's 0.78 → 0.47, Sharks 0.81 →
0.46) so that four of seven spots keep 92–100 % of their seasonal range
against 0–70 % before. The Sentinel-2 score improves from 4/24/6 to 3/25/7
contradicted/consistent/closest with the apex consistent on all four frames,
Jack's Lookout line moves 37 m seaward toward the photographed wave A, and
the cost is what the policy allows: 230–344 posts at Second Peak, Jack's,
Sharks and Privates rise above the old −0.5 m cap, of which 30–52 per spot
(1,500–2,600 m²) stand out of the water at MLLW and none at MSL. Two things
did not close: Second Peak's card reads 32° against 41° and reverses at the
up-point stage head (x −47…−33 m) at H0 ≥ 1.1× the card — the reef-window
feather that REEF_FIT_SIGNED §6 item 3 leaves to the reef-extent decision —
and Sewers cannot leave its 2.76 m crest without its low rungs turning into
lefts, so its August p75 stays unreachable (activation 1.21 m).

## 1. The policy: the intertidal crest

`REEF_CEIL_EL = −0.5 m NAVD88` had two jobs in `bed.js`: the dry-post gate
(a post already at or above it is never touched — the beach, the cliff, the
cameras' ground) and the crest cap (no wet post lifted past it). PEEL_BAND §4
measured the second job to be exactly what closes the field day: the cap puts
the shallowest allowed crest 1.605 m below MSL, the 0.73–0.91 m waves of
2026-08-15 break in 1.6–2.0 m of water, and under +0.36…+0.50 m of tide the
crest sits 1.96–2.10 m down, so the line is the natural bed's 1.7 m isobath
30–82 m shoreward of a wedge that touches nothing under it.

The gate stays. The cap is now `REEF_CREST_CEIL_EL = MLLW + 0.1 m`, derived
from the datums the repo keeps: `PP_DEPTH_DATA.mslAboveNavd88M` = +0.905 m
NAVD88 (NOAA CO-OPS 9413450) and `TIDE_RANGE[0]` = MLLW − MSL = −0.862 m, so

    0.905 − 0.862 + 0.1 = +0.143 m NAVD88 = 0.762 m below MSL.

A crest at the cap is an intertidal shelf: 0.1 m out of the water at MLLW,
0.76 m under at MSL. That is the Purisima shore platform the wedge stands in
for, and the 08-15 wedge PEEL_BAND §4 found (0.6–0.8 m below MSL) sits on it.
The two invariants `tests/reef-audit.test.js` pins are now: `dryTouched = 0`
(unchanged) and `aboveCeil = 0` against the arm's cap; the count above the
old cap (`aboveLegacyCeil`) is reported, and it is the exposed shelf.

`#reef=legacy` (boot-only, `docs/CONTROLS.md`) is the pre-refit bake: the
load-time five-station line-bearing fit under the −0.5 m cap, bit-for-bit.
`tests/reef-legacy-parity.test.js` pins the composite checksum, β, crest
depth, the card α and every 0.7–1.4× window α at all seven spots against the
scorecard taken on the `a8f16ca` tree before `bed.js` was touched
(`qa/reef-fit/score.pre-refit.json`), and re-bakes the `c85bf62` floor and
tide-band digests (`PEEL_FLOOR_LEGACY`) on that arm. Max |Δz| 0, max |Δα| 0,
Δβ 0 everywhere; the coordinator's scorecard gates 340/340 on it against the
records the dated notes published.

## 2. The fit

`scripts/fit_reef.mjs --mode=fit`, one process per spot, then `--mode=table`.
Each candidate wedge is handed to the shipped table path through
`bed.setReefFitOverride()` — the code that scores a candidate is the code that
draws it (MEASUREMENT_LESSONS 4) — and read back through the canonical
reductions the HUD, the floor and the rider share: stage-median clean signed
crest-relative α on the 2 m stage grid, limiter-pinned stations excluded
(`derivedAlphaDeg`, `PEEL_FLOOR_BASIS.alphaMetric`), not the legacy
five-station bearing (the MIGRATION GUARD of 2026-08-11 is retired on the
shipped arm; the bearing is still carried as `legacyDerivedDeg`).

Lattice: crest depth from the cap (0.762 m) to 3.0 m at 0.1 m, β 3–80° at
2.5°, then a ±0.15 m / ±3.75° refinement at 0.05 m / 1.25° around the best
cell; the tide band is measured on the twenty best coarse cells and the fine
cells only. Per spot the objective, in order:

* (a) card-state α = α_target (`params.js`), signed with the authored
  handedness, within 2°;
* (b) every rung of card × {0.7, 0.8, …, 1.3} at tide 0 and card T a peel by
  the floor's criterion (α ≥ 10° with the authored sign, ≥ 50 % of stage
  stations on the wedge); and, as the maximised secondary, the widest
  contiguous tide interval around 0 over which the whole band stays a peel
  (0.05 m rungs, −0.85…+0.75 m);
* (c) no reversal at any clean, on-reef, off-ramp station at the card or at
  any band rung (a slew ramp is a section gap and its shoulders belong with
  it, REEF_FIT_SIGNED §6 item 2; ramp count reported separately);
* (d) at Second Peak the two 2026-08-15 cells — SC116 Hs 0.778 m at the
  verified +0.500 m, Surfline 0.914 m at the predicted +0.357 m, T 16 —
  read α ≥ 30° on the wedge with Vp inside the observed 4.7–6.7 m/s;
* (e) the per-spot Sentinel-2 contradicted count on the reef arm does not rise
  above the pre-refit count for that spot (so the point-wide 4/28 cannot rise
  and a consistent apex stays consistent).

Ranking is by shortfall first (a failing band rung 1, a clean off-ramp
reversal 1 capped at 20, a card that is not a peel 5, a missed field-day cell
25, a Sentinel-2 regression 25), then the card within tolerance, then the
widest tide band, then the smallest card error. The two observation terms
outweigh the reversal term on purpose: where (c) and (d) conflict — they do
at Second Peak, §3 — the day the refit exists for wins and the reversals are
counted and located, not hidden.

The table (`data/model/pp_reef_fit.json`) carries, per spot, the crest depth
and β, the card α and on-reef it was accepted at, the band and reversal
counts, the tide band, the field-day cells and Sentinel-2 offsets, and the
digests of the bed, the physics and the presets it was fitted against;
`tests/reef-fit-table.test.js` re-bakes the card, the band and the field
cells on every run and fails naming the re-fit when the bake moves under it.

## 3. Per spot, shipped (`a8f16ca`, now `#reef=legacy`) → refit

Card state (tide 0, card T, card H0). Floors and tide bands are the
re-measured `PEEL_FLOOR` (§5). "Posts" are wet posts of the 7 m grid lifted
above the old −0.5 m cap / the new +0.143 m cap.

| spot | crest m | β° | card α (target) | on-reef | rev off-ramp (ramp st.) | band 0.7–1.3× | tide band m (fit) | activation H0 | floor | posts > old / new cap |
|---|---|---|---|---|---|---|---|---|---|---|
| Sewers | 2.93 → **2.76** | 37.0 → **38.0** | 36.3 → **38.1** (38) | 0.76 → 0.74 | 0 (56) → 0 (58) | 6/7 → **7/7** | none → [−0.08, 0.00] | 1.239 → 1.206 | 1.62 → **1.54** | 0 / 0 → 0 / 0 |
| First Peak | 2.44 → **1.76** | 48.0 → **50.5** | 60.7 → **50.0** (50) | 1.00 → 1.00 | 0 (24) → 0 (24) | 6/7 → **7/7** | none → [−0.86, +0.10] | 1.143 → 0.707 | 1.38 → **1.20** | 0 / 0 → 0 / 0 |
| Second Peak | 2.10 → **0.86** | 57.6 → **44.25** | 25.8 → **32.1** (41) | 0.83 → 0.93 | 0 (27) → 0 (24) | 6/7 → **7/7** | none → [−0.26, +0.76] | 1.003 → 0.299 | 1.11 → **0.47** | 0 / 0 → **230** / 0 |
| Jack's | 1.60 → **0.86** | 41.9 → **35.5** | 37.1 → **35.0** (37) | 0.82 → 0.92 | 0 (31) → 0 (30) | 6/7 → **7/7** | none → [−0.86, +0.54] | 0.616 → 0.288 | 0.78 → **0.47** | 0 / 0 → **344** / 0 |
| The Hook | 2.02 → **1.81** | 55.2 → **45.5** | 36.8 → **39.7** (41) | 0.70 → 0.81 | 0 (62) → 0 (48) | 6/7 → **7/7** | none → [−0.86, +0.20] | 0.916 → 0.775 | 1.09 → **0.92** | 0 / 0 → 0 / 0 |
| Sharks | 1.60 → **0.96** | 43.3 → **38.0** | 30.5 → **34.3** (36) | 0.73 → 0.84 | 0 (40) → 0 (36) | 6/7 → **7/7** | none → [−0.66, +0.42] | 0.726 → 0.439 | 0.81 → **0.46** | 0 / 0 → **296** / 0 |
| Privates | 1.60 → **0.91** | 22.0 → **65.5** | 15.8 → **30.4** (31) | 0.00 → 0.59 | 0 (0) → 0 (80) | 3/7 → 5/7 | none → none | 0.721 → 0.305 | none → **0.64** | 0 / 0 → **284** / 0 |

"tide band (fit)" is (b)'s band — every rung of the H0 band a peel — which
is a stricter object than the floor's band in §5 and was empty on the
shipped bake at every spot because its 0.7× rung was never a peel.

The R4b window (`measure_physics_residuals.mjs`, |α| ≥ 30° around the card,
0.7–1.4×): Sewers 1.65–2.42 → 1.65–2.42 (the one spot whose wedge barely
moved); First Peak 1.44–open → 1.35–open; Second Peak none → open(1.05)–1.50;
Jack's 0.88–open → open(0.77)–open(1.54); The Hook 1.20–1.65 →
open(1.05)–1.88; Sharks 0.95–1.05 → open(0.70)–1.20; Privates none →
0.70–open(0.98). The window widened at six spots and is bounded below by the
0.7× sweep end at four of them.

**Second Peak, what did not close.** The card reads 32.1° against 41 at the
only crests that carry the field day (0.76–0.86 m; PEEL_BAND §4 read 30.7
for its 0.81 m / 45° wedge). The 41° target is reached nowhere in the
lattice with the day intact: the 1.36–1.56 m crests that read 35–36° at the
card leave both field cells off the wedge (0/2). And the wedge that carries
the day reverses at H0 ≥ 1.1× the card: 18–21 clean on-reef off-ramp
stations per rung at ×1.1, ×1.2 and ×1.3, all at the up-point head of the
stage (x −47…−33 m, α −40…−55°), zero at the card and below it. Those
stations are ramp members at the lower rungs and clean at the higher ones,
which is why the count appears only there. The head is the reef window's
up-point feather (REEF_FIT_SIGNED §6: "the up-point feather covers the fit
window, the anchor and the handoff", item 3 the reef-extent decision that is
Andy's, not the fit's); no crest or strike inside the stage removes it. The
table row carries `reversalsOffRamp: 56` (card + seven band rungs) and
`feasible: 0` so the shortfall is on the record.

**Sewers, why it stayed deep.** Every crest shallower than 2.56 m turns the
0.7–0.9× rungs into lefts (−7…−9° at 54–63 % on reef, e.g. crest 1.76 m /
β 38: only the card rung healthy); at 2.56 the 0.7× rung is still −6.9°, at
2.76 it is +21.6° and the band closes. The card breaks in 3.9 m of water at
Sewers, and a crest more than ~1.2 m above that leaves the low rungs breaking
on the seaward flank the wrong way. So Sewers' activation stays at 1.21 m
against an August p75 of 0.585 — the REEF_ACTIVATION §2.1 verdict stands,
now with the cap out of the way: it is the fit, not the ceiling, that holds
Sewers deep.

**Privates** gets a wedge under its card for the first time (0.59 on reef,
30.4 against 31, a floor at 0.64) but its band is 5/7: the 0.85× and 0.9×
rungs (0.595, 0.63 m) sit 40–48 % on the reef. Not chased.

## 4. Acceptance

### 4.1 The coordinator's scorecard (`scripts/score_reef_fit.mjs`)

Verdict order: dry posts; MLLW + 0.1 m ceiling; card healthy; off-ramp
reversals at the card; Sentinel-2 contradicted; Second Peak field-day cells;
Lookout Jack's wave A. Both arms gate cleanly against their own records —
legacy **466/466**, table **306/306** in the full runs with tide bands
(`docs/research/assets/reef-refit-2026-09-24/legacy.md` and `table.md`;
340/340 and 154/154 with `--fast`).
The gate is arm-aware since this note: on `--reef=legacy` it reads the
pre-refit records (`PEEL_FLOOR_LEGACY`, the dated notes' assets), on the
table arm the re-measured ones (`PEEL_FLOOR`, `qa/break-field/summary.json`,
`pp_reef_fit.json`, `qa/reef-fit/score.table.json`).

| spot | verdict, legacy | verdict, table |
|---|---|---|
| Sewers | PASS | PASS |
| First Peak | FAIL — Sentinel-2 2/4 (2024-01-04, 2021-01-09) | FAIL — Sentinel-2 1/4 (2021-01-09) |
| Second Peak | FAIL — field-day cells (α, on-reef, Vp at both) | **PASS** |
| Jack's | FAIL — Sentinel-2 1/4 (2023-09-26) | FAIL — Sentinel-2 1/4 (2023-09-26) |
| The Hook | FAIL — Sentinel-2 1/4 (2023-09-26) | FAIL — Sentinel-2 1/4 (2023-09-26) |
| Sharks | PASS | PASS |
| Privates | FAIL — card not a peel (on-reef 0.00) | **PASS** |

The three remaining failures are the ones the coordinator's shipped run
already found (the 2023-09-26 frame at Jack's and The Hook, the H0-suspect
one; First Peak's January frames, one of which the refit clears). Not chased
beyond what the refit moved, as instructed.

### 4.2 The 2026-08-15 cells at Second Peak

| cell | shipped α / Vp / c / on-reef | refit α / Vp / c / on-reef | observed |
|---|---|---|---|
| 0.778 m, +0.500 m, T 16 (SC116 Hs, verified tide) | 9.7 / 24.2 / 4.12 / 0.00 | **41.0 / 6.3 / 4.19 / 0.62** | Vp 4.7–6.7, c 3.8–5.3, α 55–73 (36–49 on seqA) |
| 0.914 m, +0.357 m, T 16 (Surfline 3 ft, predicted tide) | 7.3 / 34.7 / 4.43 / 0.00 | **41.0 / 6.1 / 4.17 / 0.84** | same |

Vp and c inside their brackets at both cells; α inside seqA's bracket and
14–32° under seqB's, which the unsolved focal length also moves
(SURFLINE_CAM_POSE).

### 4.3 Sentinel-2 (`compare_sentinel2_line.mjs`, 28 cells)

Reef arm 4 / 24 / 6 → **3 / 25 / 7** (plane 12/16/8 and measured 10/18/1→2
unchanged in kind). Second Peak H1/10 offsets +10, −124, +16, +12 → +9,
−112, +13, +15: all four consistent on both arms. First Peak 2024-01-04
clears (+21 → consistent); 2021-01-09 stays contradicted; Jack's and The Hook
keep their 2023-09-26 cell. The (e) constraint held per spot, so no cell
regressed anywhere. The dated note's assets
(`docs/research/assets/sentinel2-locus-2026-09-23/`) are left as the
`a8f16ca` record; the table-arm run is in `qa/reef-fit/score.table.json`.

### 4.4 Lookout, Jack's line at the 2026-09-05 forcing (Hs 0.910, T 16.67, tide +0.316)

Stage-z median of the reef-arm line (+ = shoreward), the quantity
LOOKOUT_LOCUS_RESIDUAL §3 subtracted the photograph from:

| arm | shipped z med [q1, q3] | refit z med [q1, q3] | α | on-reef |
|---|---|---|---|---|
| raw Hs 0.910 | −4 [−47, +10] | **−41** [−81, −5] | 20.3 → 34.4 | 0.74 → 0.89 |
| deshoal15 0.835 | +15 [+9, +19] | −36 [−76, +2] | 9.7 → 34.8 | 0.21 → 0.88 |
| set1.27 1.156 | −40 [−87, −20] | −59 [−100, −32] | 36.4 → 33.8 | 0.82 → 0.93 |
| set1.53 1.392 | −59 [−108, −34] | −75 [−118, −41] | 37.5 → 31.9 | 0.85 → 0.94 |

The raw-Hs line moves 37 m seaward, toward the photographed wave A that the
shipped line missed by 62 m along the ground ray (29 m in stage z). In the
scorecard's own projection (model − photo along the ground ray, negative =
model inside) the refit changes what is measurable: at raw Hs the line no
longer crosses wave A's or wave B's columns in frame without a gap, so those
two residuals are undefined (as the 1.27·Hs arm's already were on the
shipped reef — LOOKOUT_LOCUS_RESIDUAL §3's dash), the lineup residual goes
from **−29 m** (the line 29 m inside the sitting surfers, every bed) to
**+17 m** (17 m outside them), and crest A from −77 to −20 m; at 1.27·Hs the
lineup goes −3 → +41 and crest A −32 → +3. The Lookout criterion (the Hs line
not seaward of wave A beyond the ±28.8 m envelope) passes on both arms — on
the table arm vacuously, because the residual it gates is undefined there.
That is a weaker statement than the legacy arm's, and it is reported as
such rather than read as an improvement.

### 4.5 The H0 window (R4)

§3's window column: widened at six spots, Second Peak from "card below 30°"
to open(1.05)–1.50, Jack's to the whole sweep. Every band rung 0.7–1.3× is a
peel at six spots (the shipped bake failed the 0.7× rung everywhere).

## 5. What the bake defines: the floor and its tide band, re-measured

`scripts/measure_break_activation.mjs --mode=floor` and `--mode=tide` on the
refit bake (measured 2026-09-24, commit `12ffab7`, tide step 0.01 m over
−0.862…+0.764, H0 step 0.01 m from 0.40 to the card, replica bit-identical
to the bake at every rung — gate max |Δz| 0 at all seven spots). The rows are
`PEEL_FLOOR` in `shared/params.js`; the `c85bf62` rows are `PEEL_FLOOR_LEGACY`.

| spot | floor H0 c85bf62 → 12ffab7 | α below → above | on-reef below → above | fails below | branch flip | tide band c85bf62 → 12ffab7 | activation |
|---|---|---|---|---|---|---|---|
| Sewers | 1.62 → **1.54** | −7.8 → 21.6 | 0.28 → 0.62 | sign+reef | 1.53→1.54 (163 m) | -0.86…+0.00 m → **-0.86…+0.00 m** | 1.206 |
| First Peak | 1.38 → **1.20** | 5.2 → 13.1 | 0.79 → 0.82 | alpha | 0.95→0.96 | -0.86…+0.01 m → **-0.86…+0.00 m** | 0.707 |
| Second Peak | 1.11 → **0.47** | 15.3 → 15.8 | 0.48 → 0.52 | reef | **none** | -0.72…+0.01 m → **-0.81…+0.00 m** | 0.299 |
| Jack's | 0.78 → **0.47** | 9.7 → 27.2 | 0.47 → 0.67 | alpha+reef | 0.46→0.47 (153 m) | -0.86…+0.00 m → **-0.86…+0.01 m** | 0.288 |
| The Hook | 1.09 → **0.92** | −4.8 → 12.2 | 0.51 → 0.54 | sign | 1.01→1.02 | -0.86…+0.00 m → **-0.86…+0.00 m** | 0.775 |
| Sharks | 0.81 → **0.46** | 12.3 → 21.9 | 0.39 → 0.53 | reef | 0.45→0.46 (92 m) | -0.86…+0.01 m → **+0.00…+0.00 m** | 0.439 |
| Privates | none → **0.64** | 17.3 → 26.7 | 0.00 → 0.55 | reef | 0.55→0.56 | none → **-0.86…+0.00 m** | 0.305 |

Three readings. (1) Second Peak's ladder has no branch flip any more: the
wedge owns the line from 0.47 m to the card, and the floor there is the peel
returning on the reef, not a branch changing (`flipLo`/`flipHi` are null in
the table; `tests/peel-floor.test.js` accepts that). (2) Sharks' tide band
is a point by the criterion's own letter: the tide-0 floor holds at every
rung from MLLW to −0.02 m and at 0, and fails at −0.01 m alone, where the
0.61 m rung sits 37 % on the reef — a one-rung knife-edge (MEASUREMENT_LESSONS
14). The band is the contiguous interval around 0, so `peelFloorH0()`
declines at every other tide at Sharks; months sit at tide 0 and are not
affected, and a reader who drags the tide gets the HUD's "NOT applied" line,
which is the honest one. (3) The card holds to MHHW at every spot but
Privates, whose card leaves its wedge from +0.25 m; on the `c85bf62` bake the
card itself stopped being a peel above +0.33…+0.66 m at five spots.

What the floor does to `#month=` (headless, months only):

| spot | floor | months clamped | seasonal range kept (was) | α drawn |
|---|---|---|---|---|
| Sewers | 1.54 | 12/12 (all twelve 1.62 → 1.54) | 0 % (0 %) | 21.6 |
| First Peak | 1.20 | 10/12 | 7 % (0 %) | 13.1–17.4 |
| Second Peak | 0.47 | **0/12** | **100 %** (20 %) | 38.5–40.8 |
| Jack's | 0.47 | **0/12** | **100 %** (70 %) | 34.0–35.4 |
| The Hook | 0.92 | 8/12 | 49 % (23 %) | 12.2–39.4 |
| Sharks | 0.46 | **0/12** | **100 %** (66 %) | 29.4–39.4 |
| Privates | 0.64 | 2/12 (July, August) | 92 % (n/a) | 26.7–36.2 |

Sewers and First Peak stay unseasonal: their floors sit above the whole
monthly climatology, as REEF_ACTIVATION §2.1 said they would with the crest
where the fit leaves it. Activation on the refit bake: 1.206 / 0.707 / 0.299
/ 0.288 / 0.775 / 0.439 / 0.305 m (was 1.239 / 1.143 / 1.003 / 0.616 / 0.916
/ 0.726 / 0.721); `tests/reef-activation-runtime.test.js` pins both sets, one
per arm.

## 6. The drawn waterline

Read off the composite grids (7.15 × 7.07 m posts, 50.6 m² each): posts the
wedge lifts from below a water level to at or above it.

| spot | max composite el (NAVD88) | exposed at MLLW (+0.043), whole grid / stage | exposed at MSL (+0.905) |
|---|---|---|---|
| Sewers | −1.61 | 0 / 0 | 0 |
| First Peak | −0.63 | 0 / 0 | 0 |
| Second Peak | **+0.142** | **48 / 48** (~2,400 m²) | 0 |
| Jack's | **+0.142** | **30 / 30** (~1,500 m²) | 0 |
| The Hook | −0.73 | 0 / 0 | 0 |
| Sharks | −0.09 | 0 / 0 | 0 |
| Privates | **+0.142** | **52 / 52** (~2,600 m²) | 0 |

At MSL nothing is exposed anywhere. At MLLW three spots show a shelf — the
crest ridge of the wedge, 0.1 m out of the water along a band of the stage —
exactly the intertidal platform the policy admits. Sharks' crest (0.96 m
below MSL) stays 0.13 m under at MLLW. The dry-post gate holds at every
spot (0 dry posts touched, 0 deepened), so the shoreline, the beach and the
cliff cameras have not moved.

## 7. Not looked at

No rendering here. Every number is headless (MEMORY: visual work needs his
eye). What the intertidal shelf looks like at low tide from the cliff and the
drone — a bare ridge of bed 0.1 m proud of the water at Second Peak, Jack's
and Privates, with the water's foam and kelp shaders drawn over a post that
is now dry — and whether the 0.86 m wedge's steeper seaward flank reads as a
reef or as a wall, are the coordinator's captures. Also not done: the
CUDEM 1/9" bed arm (`--bed=cudem19`), the reef-window feather at Second Peak
(§3), MODEL.md §4.6 and TODO.md (the coordinator's), and any re-run of the
09-23 note instruments whose assets are kept as the `a8f16ca` record.

## 8. What would falsify this

* A low-tide frame (Sentinel-2 or the Surfline cam at ≤ −0.8 m about MSL)
  with water over the whole Second Peak, Jack's or Privates stage would rule
  out the exposed shelf the table implies; exposed rock at those stages at
  MLLW would support it. Neither has been looked for.
* A second cam day at Second Peak above 1.1× the card (≥ 1.65 m) peeling
  right at the up-point head would put §3's reversals on the fit rather than
  on the feather; the model says that head reads −40…−55° there.
* The Surfline f solving above 2500 px pushes observed α toward 90° and
  weakens the α bracket, not Vp; the wedge is matched on Vp and c.
* A surveyed bed under Second Peak (OFR 2007-1270's CPS transects) with no
  shelf shallower than +0.14 m NAVD88 on the stage: then the day's peel must
  come from something the bed does not carry, and the table's crest is a
  fiction that happens to reproduce one afternoon.
* Sewers' August p75 peeling on a cam: the fit says no wedge inside the
  lattice draws it (activation floor 1.21 m with the low rungs a right).

## 9. Reproduction

```sh
node scripts/fit_reef.mjs --mode=fit --spots=<key>       # one process per spot, ~2-5 min each
node scripts/fit_reef.mjs --mode=table                     # assemble data/model/pp_reef_fit.json
node scripts/fit_reef.mjs --mode=score [--reef=legacy]     # the per-arm scorecard, qa/reef-fit/score.<arm>.json
node scripts/fit_reef.mjs --mode=parity --reef=legacy      # bit-for-bit vs qa/reef-fit/score.pre-refit.json
node scripts/measure_break_activation.mjs --mode=floor     # PEEL_FLOOR rows
node scripts/measure_break_activation.mjs --mode=tide --preset=<key>
node scripts/score_reef_fit.mjs [--reef=legacy] [--fast]  # the coordinator's scorecard, gated per arm
```

`npm test` 234 green at the commit that carries this note (211 at `a8f16ca`;
the new files are `tests/reef-fit-table.test.js`,
`tests/reef-legacy-parity.test.js`, the re-stated `tests/reef-audit.test.js`
and the arm-aware `tests/score-reef-fit.test.js`).
