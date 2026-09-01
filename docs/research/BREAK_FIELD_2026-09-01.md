# The break-activation field, instrumented (2026-09-01)

**Scope.** `docs/NEXT_INVESTMENTS.md` §1, slices 1 and 2 only: export the raw
breaker excess field and compare continuous representations of the break line
on it. Nothing here is wired. `shared/model-glsl.js`, `web-three/js/shaders.js`
and the shipped bake are untouched; every number below comes from
`scripts/measure_break_activation.mjs` running the bake's own code headless.

**Verdict in one paragraph.** A continuous representation of the break line
does not preserve a sharply timed onset on this field. The two forms that pass
the halving test (an activation-weighted centroid and an onset-weighted ridge)
do so by sitting 38–222 m *inside* the first crossing — in already-broken
water, off the synthetic reef, with alpha 5–43° low or reversed at four of six
spots. The forms that keep the onset (a finite-width band on the zero set, the
shipped selector, and the ridge as its weighting narrows) all flip. Sweeping
the one free parameter (the excess scale F0) trades the two properties against
each other monotonically; no value does both. This is not a selector defect
and not a parameter choice: the field has two positive components (the wedge
and the inshore bore) separated by a trough 0.002–0.144 m deep on a bed with a
0.31–0.93 m residual, and any line drawn on it either picks a component
(discretely) or averages them (late, blurred, off-reef). The "second guess" in
NEXT_INVESTMENTS §1 — accept the discrete regime change and strengthen the
declared operating floor — is the position the measurement supports. Two
side findings need acting on regardless: the `PEEL_FLOOR` table is off-basis
on the current bake (§4), and the `h0-low` QA row is an honest `n/a` (§7).

## 1. The instrument

`scripts/measure_break_activation.mjs` (Node ESM, headless; imports `bed.js`
through the same `three` resolve hook as `tests/reef-audit.test.js`). Per
preset and (H0, T, tide) it exports, on the bake's own lattice — 128 stations
across the 600 m bake, z from the grid's seaward edge in 2 m steps to the
beach cutoff at 0.35 m depth:

| exported | definition |
|---|---|
| `F(x,z)` | `H_eff(x)·Ks(h) − γh`, metres; `H_eff = H0·shelter(x)`; positive = criterion met |
| onsets | every upward zero crossing of F along +z, interpolated as `markBreakCrossings` does (merge 0) |
| selected | the shipped branch: anchor nearest the wedge crest, greedy continuity outward, 3.0 m/m slew clamp, gap flags (`bakeBreakLine`'s default path, replicated from the field) |
| `depth`, `uplift` | water depth per cell; 1 where the composite grid sits > 5 mm above the measured grid — the synthetic wedge's footprint |
| validity | cells listed are those the bake marches; the list ends at the beach |

Dumps: `qa/break-field/<preset>_H0-<h>_T-<T>_tide-<t>.field.json` (~0.7 MB
each, gitignored, regenerable in seconds). Tables: `qa/break-field/summary.json`
(committed, compact; 521 rungs × 6 spots × 6 representations).

**F is linear in H0** at fixed (T, tide, bed): `F = (H0·shelter)·Ks − γh`.
The instrument stores `shelter`, `Ks` and `depth` per cell and forms F in the
same operation order as `breakExcess → shoaledHeight`, so an H0 ladder is a
multiply per cell and bit-identical to the bake's own march at every rung.

### The gate (MEASUREMENT_LESSONS 4)

A selection replica that does not reproduce the shipped line certifies itself.
Three checks run at **every** rung of every sweep, against the real
`bakeBreakLine` read back through `breakZAt` on the 2 m stage grid
`stageAlpha()` uses:

| spot | bakes (H0 + T + tide ladders) | max \|Δz\| m | gap mismatches | max \|ΔF\| m | max \|Δα\| deg |
|---|---|---|---|---|---|
| Sewers | 603 | 0 | 0 | 0 | 0 |
| First Peak | 603 | 0 | 0 | 0 | 0 |
| Second Peak | 603 | 0 | 0 | 0 | 0 |
| Jack's | 603 | 0 | 0 | 0 | 0 |
| The Hook | 603 | 0 | 0 | 0 | 0 |
| Sharks | 603 | 0 | 0 | 0 | 0 |

Bit-identical, 3,618 bakes. The first cut was 4.8 µm off: `breakArr` is a
`Float32Array` and the replica was double precision. The replica now stores
float32 like the bake. `tests/break-field-gate.test.js` pins the gate at the
card state and both sides of each spot's tabulated flip, plus the constants
the instrument mirrors (`BREAK_N`, `MARCH_DZ`, `REEF_ANCHOR_X`,
`SLEW_M_PER_M`, the 2.9 gap slope, the 0.35 m beach cutoff, `STAGE_W`,
`peeldir`/`smooth` defaults) against the source text.

The phase twin for signed alpha along an arbitrary line (`κx + Ψ(z + c(x))`,
the same contour frame as `derivedPeelGeometry`) reproduces `derivedAlphaDeg`
on the shipped line to 0 at every rung, so the alpha columns below for the
other representations are the canonical metric, not a twin of it.

## 2. What the field says before any selector

Reef activation: the lowest H0 at which F reaches zero anywhere on the wedge
footprint inside the stage (bisection; selector-free). At tide 0, card T:

| spot | card H0 | reef activates at | max F on reef at card | `PEEL_FLOOR` floor | tabulated flip |
|---|---|---|---|---|---|
| Sewers | 2.2 | **1.239** | 1.60 | 1.61 | 1.60→1.61 |
| First Peak | 1.8 | **1.143** | 1.04 | 1.26 | 1.25→1.26 |
| Second Peak | 1.5 | **1.003** | 0.80 | 1.08 | 1.02→1.03 |
| Jack's | 1.1 | **0.616** | 0.86 | 0.85 | 0.84→0.85 |
| The Hook | 1.5 | **0.916** | 0.93 | 1.05 | 1.04→1.05 |
| Sharks | 1.0 | **0.726** | 0.46 | 0.81 | 0.80→0.81 |

Below reef activation the wedge is dry of breaking at every cell: the only
positive component is the inshore bore, and every representation — discrete
or continuous — draws that or nothing. The branch flips sit 0.04–0.38 m
*above* activation, in the band where both components exist. At every rung above
activation the mean onset count per stage station runs 1.0–1.6 and the
fraction of stations with more than one onset is what the flip tables count.

Sharpness of the onset itself: dF/dz at the first crossing runs 0.007–0.017
m/m at low H0, 0.017–0.035 m/m at the card states and up to 0.07 at 3 m — the
criterion clears zero by one bed residual (0.3 m) over 4–40 m of z. The ±F0
band around the zero set (F0 = 0.25 m) is 8–101 m wide depending on rung.

## 3. The shipped selector, reproduced

At 0.01 m rungs (tide 0, card T), a flip = any stage station moving more than
20 m in one rung. Against the 2026-08-19 table (`measure_branch_flip.mjs`,
TODO 1c'-d):

| spot | 2026-08-19 threshold (jump, stations) | today, largest (jump, stations, Δα) | today, all flips |
|---|---|---|---|
| Sewers | 1.60→1.61 (169 m, 73%) | 1.61→1.62 (163.6 m, 70%, 43.2°) | that one |
| First Peak | 1.25→1.26 (78 m, 52%) | 1.27→1.28 (75.1 m, 58%, 0.5°) | 1.30→1.31 55.6; 1.31→1.32 40.1; 1.33→1.34 41.3 |
| Second Peak | 1.02→1.03 (35 m, 19%) | 1.04→1.05 (39.7 m, 26%, 2.1°) | 1.03→1.04 31.2 |
| Jack's | 0.84→0.85 (130 m, 28%) | 0.83→0.84 (130.2 m, 28%, 11.4°) | 0.78→0.79 37.2; 0.79→0.80 29.2 |
| The Hook | 1.04→1.05 (111 m, 38%) | 1.03→1.04 (111.6 m, 38%, 7.8°) | 1.01→1.02 109.5; 1.02→1.03 106.6; 1.15→1.16 82.5 |
| Sharks | 0.80→0.81 (78 m, 47%) | 0.79→0.80 (73.2 m, 45%, 5.0°) | 0.78→0.79 38.5 |

Same mechanism, same jump sizes to a few metres, same station fractions —
and every threshold one or two rungs off. Not the instrument: the same
ladder run through the real bake of three older commits (extracted with
`git archive`) gives

| spot | bake at 533aef6 (2026-08-20, the floor commit) | bake at 7bc4380 (08-21) | bake at 09c7f4a (08-26) |
|---|---|---|---|
| Sewers | 1.60→1.61 (170.6) | same | 1.61→1.62 (163.6) |
| First Peak | 1.25→1.26 (78.4); 1.29→1.30; 1.30→1.31; 1.32→1.33 | same | 1.27→1.28 (75.1); 1.30→1.31; 1.31→1.32; 1.33→1.34 |
| Second Peak | 1.02→1.03 (34.8); 1.03→1.04 (27.2) | same | 1.03→1.04 (31.2); 1.04→1.05 (39.7) |
| Jack's | 0.79→0.80; 0.80→0.81; 0.84→0.85 (130.1) | same | 0.78→0.79; 0.79→0.80; 0.83→0.84 (130.2) |
| The Hook | 1.02→1.03; 1.03→1.04; 1.04→1.05 (111.6); 1.16→1.17 | same | 1.01→1.02; 1.02→1.03; 1.03→1.04 (111.6); 1.15→1.16 |
| Sharks | 0.78→0.79; 0.79→0.80; 0.80→0.81 (77.6) | same | 0.78→0.79; 0.79→0.80 (73.2) |

The 2026-08-20 bake reproduces the 2026-08-19 table exactly. Commit `09c7f4a`
("make the breaking wave cohere", 2026-08-26: finite-depth group velocity in
`Ks`, and the reef fit's `hb` with it) moved every threshold and matches
today's instrument flip-for-flip. A legacy-`Ks` replica on today's reef fit
does *not* recover the old rungs (Sewers 1.63→1.64), so the shift is the Ks
change acting through the fit as well as the march, not the march alone.

## 4. Side finding: `PEEL_FLOOR` is off-basis on two axes

MEASUREMENT_LESSONS 14b says a threshold's basis is part of the threshold. The
table in `shared/params.js` carries `basisT` and `basisTideM`; it does not
carry the model version or the alpha metric, and both have moved under it:

1. **Model version.** Every flip is one to two rungs off since `09c7f4a` (§3).
2. **Alpha metric.** The floors were read off `stageAlpha().medianClean` when
   `derivedAlphaDeg` was `|atan(dz/dx)|`. Since the 2026-08-26 tranche it is
   the signed crest-relative angle, and the collapsed inshore branch reads
   *negative* (a left) at Sewers and The Hook rather than 6–9° positive.

With today's bake and today's metric, the rung at which the shipped line's
stage-median clean alpha first reaches 10° and holds to the card state:

| spot | `PEEL_FLOOR` floor (α below→above, legacy) | today: flip | today: peel returns | α across it (signed) |
|---|---|---|---|---|
| Sewers | 1.61 (9.1→35.0) | 1.61→1.62 | 1.61→1.62 | −8.3 → 34.9 |
| First Peak | 1.26 (1.4→12.1) | 1.27→1.28 | **1.37→1.38** | 5.9 → 22.1 |
| Second Peak | 1.08 (9.1→14.4) | 1.04→1.05 | **1.10→1.11** | 9.4 → 10.6 |
| Jack's | 0.85 (7.2→21.3) | 0.83→0.84 | 0.72→0.73 (marginal; 23.6→26.7 at 0.84→0.85) | 9.6 → 10.0 |
| The Hook | 1.05 (6.2→17.1) | 1.03→1.04 | **1.08→1.09** | −5.3 → 12.3 |
| Sharks | 0.81 (7.5→16.4) | 0.79→0.80 | 0.78→0.79 | 6.7 → 10.1 |

Second Peak rung by rung (α / pinned / on-reef fraction): 1.03 → 9.2/0/0.45,
1.04 → 6.2/7/0.49, 1.05 → 4.1/10/0.53, 1.08 → 5.8/7/0.61, 1.10 → 9.4/8/0.70,
1.11 → 10.6/8/0.75. The clamp currently holds a `#month=` at Second Peak to
1.08 m, where today's bake draws 5.8°. First Peak's floor of 1.26 lands on
8.5°; its peel now returns at 1.38. **Not changed here** — `PEEL_FLOOR` is
shipped behaviour and re-deriving it belongs with a re-run of
`audit_shipped_states.mjs` — but `tests/peel-floor.test.js` pins the table
against constants copied from the 08-19 sweep, so it will not notice. The
instrument's ladder is the re-measurement; what is missing is the decision to
adopt it.

## 5. Continuous representations on the same field

All representations are lines z(x) on the 128 stations, read back on the 2 m
stage grid, alpha by the canonical signed metric along each.

| name | definition |
|---|---|
| shipped | the bake (control) |
| seaward / shoreward | seaward-most / shoreward-most onset (controls) |
| centroidAll | activation-weighted centroid, w = max(F,0) |
| ridgeOnset | onset-weighted ridge, w = max(F,0)·exp(−F/F0); weight peaks at F = F0 = 0.25 m (γ × the best-fit bed residual, the excess one RMS of depth error produces) |
| bandCenter | finite-width band {z : \|F\| ≤ F0}: exact centroid of the piecewise-linear level band; its width is reported |

### 5.1 Continuity on the H0 ladder (tide 0, card T, 0.40–3.00 m)

D(step) = max over rungs of max over stage stations |Δz|, metres. One 0.005 m
ladder read at strides 1/2/4, so the three step sizes see identical states.
A continuous line halves D when the step halves (ratio 0.5); a fixed jump does
not (ratio 1).

| spot | rep | D(0.02) | D(0.01) | D(0.005) | D(.01)/D(.02) | D(.005)/D(.01) | flips > 20 m at 0.01 | p90 Δz at 0.01 | max Δα at 0.01 |
|---|---|---|---|---|---|---|---|---|---|
| Sewers | shipped | 164.6 | 163.6 | 163.1 | 0.99 | 1.00 | 1 | 2.0 | 43.2 |
| | centroidAll | 2.5 | 1.3 | 0.6 | 0.51 | 0.50 | 0 | 1.1 | 0.8 |
| | ridgeOnset | 30.7 | 19.5 | 10.4 | 0.64 | 0.53 | 0 | 8.5 | 5.8 |
| | bandCenter | 88.7 | 80.1 | 67.6 | 0.90 | 0.84 | 57 | 32.0 | 17.7 |
| First Peak | shipped | 79.5 | 75.1 | 73.4 | 0.94 | 0.98 | 4 | 2.0 | 16.2 |
| | centroidAll | 3.8 | 2.0 | 1.0 | 0.51 | 0.51 | 0 | 1.2 | 2.0 |
| | ridgeOnset | 18.3 | 9.5 | 4.8 | 0.52 | 0.51 | 0 | 5.5 | 8.4 |
| | bandCenter | 76.1 | 76.0 | 56.8 | 1.00 | 0.75 | 15 | 12.0 | 26.7 |
| Second Peak | shipped | 45.0 | 39.7 | 35.1 | 0.88 | 0.88 | 2 | 2.6 | 3.0 |
| | centroidAll | 3.2 | 1.6 | 0.8 | 0.50 | 0.50 | 0 | 0.9 | 1.3 |
| | ridgeOnset | 15.9 | 8.8 | 4.5 | 0.55 | 0.51 | 0 | 2.0 | 3.5 |
| | bandCenter | 29.6 | 21.9 | 18.3 | 0.74 | 0.83 | 1 | 3.1 | 3.0 |
| Jack's | shipped | 131.4 | 130.2 | 129.7 | 0.99 | 1.00 | 3 | 2.5 | 11.4 |
| | centroidAll | 10.8 | 5.5 | 2.8 | 0.51 | 0.51 | 0 | 2.7 | 1.5 |
| | ridgeOnset | 34.7 | 19.6 | 10.5 | 0.56 | 0.54 | 0 | 7.6 | 2.6 |
| | bandCenter | 82.5 | 82.4 | 65.4 | 1.00 | 0.79 | 31 | 26.4 | 3.9 |
| The Hook | shipped | 110.7 | 111.6 | 111.1 | 1.01 | 1.00 | 4 | 3.2 | 17.6 |
| | centroidAll | 4.4 | 2.2 | 1.1 | 0.51 | 0.50 | 0 | 1.5 | 1.8 |
| | ridgeOnset | 26.4 | 14.9 | 7.8 | 0.57 | 0.53 | 0 | 6.6 | 7.7 |
| | bandCenter | 82.6 | 74.2 | 66.1 | 0.90 | 0.89 | 39 | 28.2 | 8.6 |
| Sharks | shipped | 74.7 | 73.2 | 68.7 | 0.98 | 0.94 | 2 | 3.1 | 7.6 |
| | centroidAll | 6.2 | 3.1 | 1.6 | 0.51 | 0.51 | 0 | 1.8 | 1.9 |
| | ridgeOnset | 31.2 | 17.1 | 8.8 | 0.55 | 0.51 | 0 | 6.5 | 5.1 |
| | bandCenter | 76.5 | 70.3 | 60.7 | 0.92 | 0.86 | 22 | 15.7 | 6.1 |

Controls: seaward-most flips 4–30 times per spot, shoreward-most 3–34, both
with ratios 0.77–1.00 — the shipped anchored walk is again the best discrete
rule, as MEASUREMENT_LESSONS 14 recorded. The band centre is worse than the
shipped selector at five of six spots (15–57 flips against 1–4; Second Peak
1 against 2): components of the level band are born and die exactly where
onsets are, and the band's centroid jumps when they do. `centroidAll` and `ridgeOnset` pass the halving test
cleanly (ratios 0.50–0.64, zero flips) at every spot.

### 5.2 Continuity on T and tide (card H0)

Fine ladders T 8–18 s at 0.25 s and tide −0.86…+0.76 m at 0.04 m, read at
strides 1 and 2. Ratio = D(fine)/D(coarse); flips counted at the fine step.

| spot | shipped T ratio / flips | shipped tide ratio / flips (D fine) | centroidAll T / tide | ridgeOnset T / tide | bandCenter T / tide |
|---|---|---|---|---|---|
| Sewers | 0.89 / 0 | 0.88 / 0 (15.7 m) | 0.50 / 0 · 0.58 / 0 | 0.55 / 0 · 0.54 / 0 | 0.86 / 22 · 0.99 / 28 |
| First Peak | 0.88 / 0 | 0.95 / 1 (43.6) | 0.52 / 0 · 0.61 / 0 | 0.55 / 0 · 0.54 / 0 | 0.84 / 11 · 0.95 / 12 |
| Second Peak | 0.57 / 0 | 0.72 / 3 (51.6) | 0.51 / 0 · 0.61 / 0 | 0.53 / 0 · 0.62 / 0 | 0.66 / 2 · 0.75 / 1 |
| Jack's | 0.93 / 0 | 0.98 / 3 (132.1) | 0.54 / 0 · 0.63 / 0 | 0.51 / 0 · **0.56 / 6** | 0.73 / 17 · 0.91 / 25 |
| The Hook | 0.92 / 0 | 0.84 / 2 (84.2) | 0.52 / 0 · 0.65 / 0 | 0.56 / 0 · **0.70 / 3** | 0.91 / 16 · 0.99 / 21 |
| Sharks | 0.65 / 0 | 0.96 / 2 (71.4) | 0.51 / 0 · 0.51 / 0 | 0.51 / 0 · **0.65 / 3** | 0.83 / 10 · 0.86 / 20 |

The shipped line has no flips on the period axis at the card H0 but flips on
the tide axis at five of six spots (a 0.04 m tide step moves Jack's line
132 m) — the (H0, T, tide) surface MEASUREMENT_LESSONS 14b describes, seen on
its third axis. `ridgeOnset` at F0 = 0.25 is not flip-free on the tide axis
either (Jack's 6, The Hook 3, Sharks 3). Only `centroidAll` is continuous on
all three axes, and §5.3 says what it costs.

### 5.3 Alpha, reef coverage and handedness along each representation

Card state. α = stage-median clean signed alpha (limiter-pinned stations
excluded); on-reef = fraction of stage stations whose line sits on the wedge
footprint; rev = clean on-reef stations with |α| > 2° and the wrong sign for a
right (all six spots read positive on the shipped line at card, so the
authored handedness is +).

| spot | target | shipped α / on-reef / rev | centroidAll | ridgeOnset | bandCenter | seaward | shoreward |
|---|---|---|---|---|---|---|---|
| Sewers | 38 | 36.3 / 0.76 / 6 | **−5.7** / 0.00 / 0 | **−7.0** / 0.68 / 39 | 7.2 / 0.73 / 26 | 34.0 / 0.81 / 25 | 34.0 / 0.60 / 6 |
| First Peak | 50 | 60.7 / 1.00 / 11 | 31.3 / 0.00 / 0 | 42.8 / 0.95 / 10 | 60.6 / 1.00 / 11 | 60.7 / 1.00 / 12 | 60.7 / 1.00 / 12 |
| Second Peak | 41 | 25.8 / 0.83 / 19 | 7.7 / 0.00 / 0 | 13.3 / 0.80 / 21 | 20.2 / 0.83 / 24 | 27.9 / 0.83 / 18 | 27.9 / 0.83 / 18 |
| Jack's | 37 | 37.1 / 0.82 / 4 | 12.6 / 0.29 / 5 | 22.2 / 0.75 / 5 | 31.1 / 0.84 / 18 | 38.6 / 0.83 / 6 | 35.0 / 0.80 / 13 |
| The Hook | 41 | 36.8 / 0.70 / 7 | 4.9 / 0.10 / 3 | 19.4 / 0.69 / 13 | 33.2 / 0.73 / 19 | 26.1 / 0.72 / 8 | 26.1 / 0.64 / 12 |
| Sharks | 36 | 30.5 / 0.73 / 7 | 21.7 / 0.03 / 2 | 31.8 / 0.49 / 6 | 20.8 / 0.74 / 20 | 33.9 / 0.73 / 8 | 30.9 / 0.73 / 14 |

Where each representation sits relative to the first onset (stage median of
z_rep − z_firstOnset, metres, card state): centroidAll sits **88–222 m
shoreward** of the first crossing, in the swash, and is not on the reef at
all (0–29% coverage); ridgeOnset sits **38–74 m shoreward** (Sewers 74, First
Peak 55, Second Peak 38, Jack's 47, The Hook 44, Sharks 53); bandCenter sits
on it (0.2–3.1 m). At a 7–9 m/s breakpoint speed a line 40 m inside the first
crossing calls the onset 5–10 s late: that is the blur.

Handedness: `ridgeOnset` is a **left** at Sewers (−7.0°, 39 reversed
stations) at the card state, and the maximum reversal count over the ladder
is higher for the ridge than for the shipped line at every spot (Sewers 52 vs
28, Jack's 38 vs 20, The Hook 44 vs 25). Per NEXT_INVESTMENTS §1 it is
rejected on that ground alone. The shipped line itself carries 4–19 reversed
on-reef stations at card — pre-existing, and part of why the canonical refit
(slice 4) is deferred.

### 5.4 The trade-off is structural: sweeping F0

Both field-parameterised forms have one scale. F0 → 0 makes the ridge the
zero level set (the onset); F0 → ∞ makes it the plain centroid. Instrument
mode `--mode=f0`: ladder 0.40–3.00 at 0.01 m (D at 0.01 and 0.02 by stride;
flips at 0.01), card state for the alpha columns.

| spot | F0 m | ridge D(.02) / D(.01) / ratio / flips | ridge α / on-reef / rev / − first onset m | band D(.02) / D(.01) / ratio / flips | band α / on-reef / rev / − first onset m |
|---|---|---|---|---|---|
| Sewers | 0.05 | 111.7 / 74.7 / 0.67 / 36 | 10.7 / 0.71 / 22 / 5.7 | 121.9 / 120.9 / 0.99 / 68 | 33.9 / 0.73 / 23 / 0.0 |
| | 0.10 | 77.3 / 42.9 / 0.56 / 17 | −6.7 / 0.71 / 39 / 18.0 | 106.7 / 97.0 / 0.91 / 69 | 33.7 / 0.74 / 23 / 0.0 |
| | 0.25 | 30.7 / 19.5 / 0.64 / 0 | −7.0 / 0.68 / 39 / 73.9 | 88.7 / 80.1 / 0.90 / 57 | 7.2 / 0.73 / 26 / 0.2 |
| | 0.50 | 15.5 / 8.2 / 0.53 / 0 | 15.6 / 0.63 / 12 / 105.8 | 68.1 / 60.6 / 0.89 / 38 | −6.1 / 0.73 / 37 / 2.8 |
| | 1.0 | 7.6 / 3.9 / 0.51 / 0 | 15.7 / 0.33 / 0 / 142.9 | 50.5 / 44.0 / 0.87 / 19 | −5.9 / 0.73 / 41 / 56.1 |
| | 2.0 | 4.4 / 2.2 / 0.51 / 0 | 6.7 / 0.00 / 0 / 178.1 | 19.5 / 13.5 / 0.69 / 0 | −6.0 / 0.73 / 42 / 72.1 |
| First Peak | 0.05 | 58.6 / 36.4 / 0.62 / 13 | 61.2 / 1.00 / 12 / 3.7 | 94.2 / 90.3 / 0.96 / 25 | 60.6 / 1.00 / 11 / 0.0 |
| | 0.10 | 36.2 / 18.8 / 0.52 / 0 | 55.2 / 1.00 / 17 / 14.3 | 87.2 / 87.0 / 1.00 / 23 | 60.5 / 1.00 / 11 / 0.1 |
| | 0.25 | 18.3 / 9.5 / 0.52 / 0 | 42.8 / 0.95 / 10 / 54.9 | 76.1 / 76.0 / 1.00 / 15 | 60.6 / 1.00 / 11 / 0.5 |
| | 0.50 | 11.5 / 5.8 / 0.51 / 0 | 42.1 / 0.82 / 6 / 80.8 | 72.5 / 51.9 / 0.72 / 9 | 58.5 / 1.00 / 16 / 2.3 |
| | 1.0 | 8.0 / 4.1 / 0.51 / 0 | 42.2 / 0.65 / 6 / 103.7 | 43.6 / 43.4 / 1.00 / 6 | 30.5 / 1.00 / 13 / 49.2 |
| | 2.0 | 5.8 / 3.0 / 0.52 / 0 | 38.7 / 0.37 / 6 / 120.7 | 32.2 / 25.2 / 0.78 / 2 | 17.9 / 1.00 / 10 / 64.5 |
| Second Peak | 0.05 | 27.1 / 19.2 / 0.71 / 0 | 24.8 / 0.86 / 20 / 5.3 | 28.6 / 22.8 / 0.80 / 2 | 27.9 / 0.84 / 18 / 0.0 |
| | 0.10 | 25.2 / 14.4 / 0.57 / 0 | 16.1 / 0.86 / 23 / 13.3 | 31.4 / 21.5 / 0.69 / 2 | 27.1 / 0.84 / 18 / 0.1 |
| | 0.25 | 15.9 / 8.8 / 0.55 / 0 | 13.4 / 0.80 / 21 / 38.4 | 29.6 / 21.9 / 0.74 / 1 | 20.2 / 0.84 / 24 / 0.7 |
| | 0.50 | 9.7 / 5.0 / 0.52 / 0 | 13.0 / 0.49 / 14 / 63.3 | 32.1 / 22.5 / 0.70 / 1 | 8.1 / 0.84 / 29 / 3.6 |
| | 1.0 | 6.1 / 3.1 / 0.50 / 0 | 9.4 / 0.22 / 8 / 85.1 | 31.9 / 22.4 / 0.70 / 1 | 6.5 / 0.84 / 19 / 15.4 |
| | 2.0 | 4.5 / 2.3 / 0.50 / 0 | 7.6 / 0.00 / 0 / 97.5 | 23.5 / 20.2 / 0.86 / 1 | 8.2 / 0.86 / 10 / 26.2 |
| Jack's | 0.05 | 89.8 / 70.6 / 0.79 / 26 | 27.7 / 0.84 / 21 / 5.8 | 122.2 / 111.3 / 0.91 / 41 | 36.4 / 0.83 / 10 / 0.0 |
| | 0.10 | 66.4 / 45.5 / 0.68 / 14 | 20.9 / 0.83 / 22 / 21.2 | 105.7 / 99.6 / 0.94 / 39 | 34.8 / 0.83 / 13 / 0.2 |
| | 0.25 | 34.7 / 19.6 / 0.56 / 0 | 22.2 / 0.75 / 5 / 46.6 | 82.5 / 82.4 / 1.00 / 31 | 31.1 / 0.84 / 18 / 1.3 |
| | 0.50 | 21.9 / 11.6 / 0.53 / 0 | 21.3 / 0.54 / 6 / 63.1 | 67.1 / 56.2 / 0.84 / 26 | 12.8 / 0.85 / 11 / 18.2 |
| | 1.0 | 16.0 / 8.3 / 0.52 / 0 | 16.7 / 0.44 / 7 / 74.5 | 60.2 / 47.0 / 0.78 / 16 | 21.0 / 0.88 / 11 / 35.4 |
| | 2.0 | 13.3 / 6.8 / 0.51 / 0 | 14.7 / 0.35 / 6 / 80.9 | 28.3 / 20.3 / 0.72 / 1 | 17.9 / 0.85 / 8 / 30.0 |
| The Hook | 0.05 | 68.2 / 46.8 / 0.69 / 30 | 28.3 / 0.73 / 16 / 5.1 | 95.7 / 95.5 / 1.00 / 52 | 31.8 / 0.72 / 18 / 0.0 |
| | 0.10 | 47.6 / 26.9 / 0.56 / 9 | 19.3 / 0.73 / 26 / 12.5 | 94.2 / 88.5 / 0.94 / 49 | 34.5 / 0.72 / 18 / 0.1 |
| | 0.25 | 26.4 / 14.9 / 0.57 / 0 | 19.4 / 0.69 / 13 / 44.1 | 82.6 / 74.2 / 0.90 / 39 | 33.2 / 0.73 / 19 / 0.6 |
| | 0.50 | 15.0 / 7.9 / 0.53 / 0 | 21.8 / 0.51 / 13 / 66.5 | 68.4 / 58.5 / 0.85 / 30 | 15.1 / 0.73 / 29 / 3.1 |
| | 1.0 | 8.7 / 4.4 / 0.51 / 0 | 13.6 / 0.37 / 10 / 85.3 | 56.1 / 44.8 / 0.80 / 27 | 13.1 / 0.74 / 20 / 32.6 |
| | 2.0 | 6.1 / 3.0 / 0.50 / 0 | 8.8 / 0.26 / 7 / 96.9 | 50.8 / 39.2 / 0.77 / 7 | 11.6 / 0.72 / 6 / 47.8 |
| Sharks | 0.05 | 69.2 / 43.9 / 0.63 / 15 | 22.2 / 0.74 / 17 / 10.3 | 88.3 / 87.4 / 0.99 / 24 | 32.1 / 0.73 / 10 / 0.1 |
| | 0.10 | 48.3 / 34.3 / 0.71 / 6 | 21.6 / 0.74 / 5 / 23.8 | 77.9 / 75.7 / 0.97 / 25 | 30.5 / 0.73 / 12 / 0.4 |
| | 0.25 | 31.2 / 17.1 / 0.55 / 0 | 31.8 / 0.49 / 6 / 53.0 | 76.5 / 70.3 / 0.92 / 22 | 20.8 / 0.74 / 20 / 3.1 |
| | 0.50 | 16.9 / 8.5 / 0.50 / 0 | 31.8 / 0.36 / 6 / 72.4 | 65.6 / 58.6 / 0.89 / 21 | 19.8 / 0.77 / 9 / 18.7 |
| | 1.0 | 10.6 / 5.5 / 0.52 / 0 | 28.4 / 0.26 / 7 / 84.0 | 62.1 / 42.2 / 0.68 / 14 | 24.9 / 0.74 / 18 / 32.2 |
| | 2.0 | 8.3 / 4.2 / 0.51 / 0 | 25.5 / 0.20 / 6 / 89.5 | 40.0 / 30.3 / 0.76 / 5 | 10.7 / 0.81 / 23 / 15.3 |

Reading down any spot: as F0 shrinks the ridge regains the onset (4–10 m
from the first crossing at F0 = 0.05) and the band-like alpha, and
re-acquires the flips (13–36 at five spots; Second Peak, whose flips are
small, stays at 0 but its ratio rises to 0.71). As F0 grows the ridge becomes
continuous (ratio 0.50–0.53, zero flips) and walks 80–180 m into broken
water, off the reef (coverage 0.00–0.37 at F0 = 2), with alpha falling to
7–39°. The band keeps the onset at every F0 ≤ 0.5 and keeps flipping; where
its flips finally fall (F0 = 2 at Sewers, 0 flips) it has moved 72 m off the
onset and reads −6°. There is no F0 at which either form is both continuous
in H0 and on the onset: the two properties are traded against each other
along the only parameter. First Peak is the one spot where the ridge holds a
peel (42°) while continuous, and it does so 55–120 m inside the crossing.

## 6. Verdict on the second guess

NEXT_INVESTMENTS §1 asked the spike to "demonstrate that continuity preserves
a recognizable, sharply timed break and does not merely blur the closeout",
and named the alternative: accept the discrete regime change and strengthen
the declared operating floor. Measured:

1. **Continuity is available, at the cost of the onset.** `centroidAll` and
   large-F0 `ridgeOnset` halve cleanly on all three axes. They sit 38–222 m
   inside the first crossing, in the swash, off the reef, and read alpha
   5–43° low or left-handed. That is the blurred closeout, by the numbers.
2. **The onset is available, at the cost of continuity.** `bandCenter`, small-
   F0 `ridgeOnset` and the shipped selector all sit on the first crossing and
   all flip, because the zero set itself gains and loses components as H0
   moves — the same fact MEASUREMENT_LESSONS 14 stated for thresholds, now
   measured for level bands and weighted ridges.
3. **A scalar reweighting of the same field cannot escape this**, which is
   what NEXT_INVESTMENTS §1 slice 2 already suspected of `smoothstep`: any
   1-D line z(x) drawn on a field with two positive components either picks
   one (discontinuous) or averages them (late). The route and the
   handedness live on the *reef* component; below reef activation (§2) that
   component does not exist, so no representation can draw a peel there,
   and the honest output is the inshore bore or a declared no-break.
4. **What a continuous authority would have to be** is therefore not a line
   but the 2-D activation itself, consumed as a field by the renderer (break
   permission, lifecycle seeding, foam) with the *peel route* taken from the
   reef component's own geometry (the wedge crest line the fit already
   knows) rather than from a crossing. That is a different investment from
   slice 3 as written — it removes the line rather than smoothing it — and
   it does not remove the regime change: the wedge still switches on at
   0.6–1.24 m, and the sharpness the viewer sees at that switch is a fact
   about the bathymetry, not the selector.

Position: **take the second guess.** Keep the discrete selector, keep
declaring the floor, and re-measure the floor on the current bake (§4). Do
not spend slice 3 on a continuous line. If the activation field is to own
breaking, scope it as a 2-D consumer with the reef crest as the route, and
gate that on the reef-extent question NEXT_INVESTMENTS already raised: at
Sewers the wedge activates at 1.24 m against an August p75 of 0.585 m, so no
representation on this bed draws a Sewers peel in summer.

## 7. The `h0-low` row (TODO): n/a, not a foam defect

`break-progression/drone/h0-low` is Second Peak at H0 0.70 m, card T 14 s,
tide 0; the sheet reports peak foam at the tracked crest 0.05–0.10 against
the 0.60 threshold, BREAK EVENT NO. From the field
(`qa/break-field/secondpeak_H0-0.7_T-14_tide-0.field.json`):

| quantity | at 0.70 m | at the card 1.50 m |
|---|---|---|
| reef activation H0 (T 14, tide 0) | 1.003 m — 0.70 is 0.30 m below it | — |
| max F on the wedge, stage-wide | **−0.49 m** (criterion never met on the reef) | +0.80 m |
| stage stations with the shipped line on the reef | **0 %** | 83.5 % |
| watch station (takeoff, `takeoffProfile` twin) | x = −47.1 m | x = +2.4 m |
| shipped line at the watch x | z = +37.7 m, depth 1.57 m; the wedge spans z −206…−22 there | z = −119.5 m, depth 2.85 m, on the reef |
| max excess ratio Hsh/Hlim on the wedge at the watch x | 0.54 | — |
| reef-window envelope at the watch x | **0.049** (the stage feather) | 0.89 |
| z where the shader gate is fully open (F ≥ 0.25 γh) | 18 m inside the line, depth 1.31 m | 39 m inside |
| stage-median clean alpha of the shipped line | 6.7° (an inshore bore) | 25.8° |

0.70 m is below Second Peak's real break threshold on this bed: the synthetic
reef is never activated, the only breaking is the depth-limited bore in
1.5 m of water, and the sheet's watch station — which follows the takeoff to
the up-point end of the stage — lands where the reef window's along-shore
envelope is 0.05, so the zipper term contributes almost nothing and the depth
gate is barely open at the line. The row's premise (a break event at the
takeoff) is not met by the physics, so the acceptance row should read **n/a**,
the MODEL.md §4.6 pattern, exactly as the published sheet already treats
`day-small`. This is not the small-day foam family: there is no reef break
for the foam to under-paint. Whether the inshore bore *should* paint more
whitewater at 0.70 m is a separate, renderer-side question the field does
not settle and this row does not ask.

## 8. Reproduction

```
node scripts/measure_break_activation.mjs                       # all six spots, all sweeps (~4 min)
node scripts/measure_break_activation.mjs --mode=field --preset=secondpeak --h0=0.7
node scripts/measure_break_activation.mjs --mode=triage --preset=secondpeak
node scripts/measure_break_activation.mjs --mode=f0             # section 5.4
node --test tests/break-field-gate.test.js
```

Outputs under `qa/break-field/`: `summary.json` (committed; a partial run
merges into it), per-state `*.field.json` and run logs (ignored). The
older-commit ladders in §3 were run on archive extracts of `bed.js` and its
imports at each commit, with the same 0.01 m ladder and flip definition. Flip = any stage station moving more
than 20 m in one rung; reversal = a clean on-reef station with |α| > 2° and
the wrong sign; F0 = 0.25 m unless stated. All stage restrictions are
`stageAlpha()`'s (`stageStart + 10 … stageEnd − 10`, 2 m grid).
