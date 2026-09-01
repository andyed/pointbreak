# The peel floor's tide axis (2026-09-01)

**Scope.** `docs/NEXT_INVESTMENTS.md` §1 "what is next" item 2, named by the
2026-09-01 verdict: the `PEEL_FLOOR` table (`shared/params.js`) is a point on
the H₀ axis at tide 0, `peelFloorH0()` declined at every other tide, and the
break-field instrument had found the shipped line flipping on a 0.04 m tide
step at five of six spots at the card H₀ (`BREAK_FIELD_2026-09-01.md` §5.2).
The tide is a live control (`#tide=`, the `[` `]` keys, the drawer slider), so
readers reach those states. This note measures the floor on the tide axis and
records what was declared from it. Nothing in the renderer, the bake or the
shared GLSL changes; `shared/params.js` gains a tide band per spot,
`peelFloorH0()` honours it, and `web-three/js/main.js` re-derives an active
month when the tide moves.

**Verdict in one paragraph.** floorH₀ is not tide-independent and not close
to it: it rises **0.53–0.65 m per metre of tide** at every mapped spot,
tracking the reef's own activation height (0.53–0.61 m/m; to first order the
slope is γ/(shelter·K_s)). The tide-0 floor is therefore conservative at
every tide below 0 and wrong by the first 0.01 m rung above it — at +0.01 m
Sewers' 1.62 m draws −8.9° and The Hook's 1.09 m draws −5.3°, both lefts.
Above +0.33 to +0.66 m (spot-dependent) the *card state itself* is off the
reef or under 10°, so no floor on H₀ exists there at all. The smallest honest
extension is a **tide band** per spot inside which the tide-0 floor holds and
binds, and outside which it declines: Sewers, Jack's and The Hook
−0.862…0.00 m; First Peak and Sharks −0.862…+0.01; Second Peak −0.72…+0.01
(bounded below by its card failing, not by the range). A tide-dependent floor
table was measured — it is §3 — and not adopted (§4). The bit-identical
reproduction gate held on all 111,540 bakes.

## 1. The instrument and its basis

`scripts/measure_break_activation.mjs --mode=tide`, one spot per process.
Per spot, the full (H₀, tide) grid:

| axis | range | step | why this range |
|---|---|---|---|
| tide | **−0.862 … +0.764 m** about MSL, plus both limits as rungs (165 rungs) | 0.01 m | the range the model **accepts**: `bed.js` `TIDE_RANGE` = `PP_DEPTH_DATA.tideRangeM`, MLLW…MHHW about MSL at NOAA CO-OPS 9413450 (Monterey), which `main.js` clamps `#tide=` and the slider to and `conditions.js` clamps every day to |
| H₀ | 0.40 → the card H₀ | 0.01 m | the floor ladder's own (`PEEL_FLOOR_BASIS.ladderLoM`, `stepM`) |
| T | the card period | — | the floor's basis |

The station itself spans more than the model accepts. From the CO-OPS datums
page for 9413450 (epoch 1983–2001, metres on the station datum): MSL 1.893,
MLLW 1.031, MHHW 2.657, NAVD88 0.988; **highest observed 3.432 m
(1983-01-27)**, **lowest observed 0.301 m (2009-01-11)** — i.e. **+1.539 and
−1.592 m about MSL**. Those extremes are storm surge and king tides on top
of the mean datums; the model does not accept them and this note does not
measure them. Everything below is about the accepted range, and a band edge
*at* the range limit means "holds as far as the tide can go here", not
"holds at all tides".

Two things held fixed and stated (MEASUREMENT_LESSONS 14b): γ = 0.78
(`dispersion.js`), and the peel criterion is the one `PEEL_FLOOR_BASIS`
carries — stage-median clean signed α ≥ 10° with the authored handedness and
≥ 50 % of stage stations on the reef footprint, at every rung from the floor
up to the card. The tide step matches the H₀ step deliberately: a boundary
measured at 0.01 m in one axis and 0.04 in the other is a boundary in one axis.

### The gate (MEASUREMENT_LESSONS 4)

Every rung of the grid: the replica line rebuilt from the exported field is
compared to the real `bakeBreakLine` read through `breakZAt` on the 2 m stage
grid, plus gap flags, the field itself and the phase-twin α.

| spot | bakes | max \|Δz\| m | gap mismatches | max \|ΔF\| | max \|Δα\| | wall time |
|---|---|---|---|---|---|---|
| Sewers | 29,865 | 0 | 0 | 0 | 0 | 861 s |
| First Peak | 23,265 | 0 | 0 | 0 | 0 | 692 s |
| Second Peak | 18,315 | 0 | 0 | 0 | 0 | 536 s |
| Jack's | 11,715 | 0 | 0 | 0 | 0 | 188 s |
| The Hook | 18,315 | 0 | 0 | 0 | 0 | 528 s |
| Sharks | 10,065 | 0 | 0 | 0 | 0 | 258 s |

111,540 bakes, bit-identical. Six processes ran concurrently, so the wall
times are under contention.

Outputs: `qa/break-field/tide-floor/<spot>.json` (committed: per tide rung
the floor, whether the tide-0 floor holds, the card and floor rows, the first
and last failing rung, flips, slopes, edges, digest) and
`<spot>.rungs.json` (ignored: the whole grid as `[H₀, α, on-reef, healthy]`
per rung per tide, ~0.2–0.5 MB each).

## 2. The tide sweep at the card H₀ and at the floor H₀

Definitions as in `BREAK_FIELD_2026-09-01.md`: a flip is any stage station
moving more than 20 m in one rung; α is stage-median clean signed
crest-relative alpha; on-reef is the fraction of stage stations whose line
sits on the synthetic wedge footprint.

### 2.1 Flips along the tide axis (0.01 m rungs)

| spot | row | flips | rungs (from → to: Δz m, % stations moving > 5 m, α from → to) |
|---|---|---|---|
| Sewers | card 2.2 m | 0 | none |
| | floor 1.62 m | 1 | 0 → +0.01: **163.2**, 70 %, 34.8 → **−8.9** |
| First Peak | card 1.8 m | 3 | +0.71 → +0.72: 41.1, 32 %, 8.7 → 8.7; +0.74 → +0.75: 40.7, 30 %, 8.8 → 1.3; +0.76 → +0.764: 55.1, 35 %, 1.4 → 8.9 |
| | floor 1.38 m | 4 | +0.06 → +0.07: 40.7, 32 %, 6.5 → 6.2; +0.10 → +0.11: 40.6, 30 %, 6.7 → −0.7; +0.12 → +0.13: 55.3, 35 %, −0.7 → 7.0; +0.17 → +0.18: 76.3, 51 %, 7.6 → 8.2 |
| Second Peak | card 1.5 m | 3 | +0.70 → +0.71: 27.6, 20 %, 5.9 → 6.7; +0.71 → +0.72: 32.9, 20 %, 6.7 → 8.6; +0.72 → +0.73: 29.9, 11 %, 8.6 → 11.5 |
| | floor 1.11 m | 2 | +0.10 → +0.11: 32.8, 25 %, 4.3 → 5.7; +0.11 → +0.12: 33.3, 16 %, 5.7 → 9.2 |
| Jack's | card 1.1 m | 2 | +0.42 → +0.43: **129.9**, 27 %, 24.7 → 13.9; +0.50 → +0.51: 36.1, 15 %, 12.6 → 12.3 |
| | floor 0.78 m | 2 | −0.11 → −0.10: **129.4**, 27 %, 24.9 → 12.0; −0.01 → 0: 30.2, 10 %, 10.8 → 11.1 |
| The Hook | card 1.5 m | 5 | +0.54 → +0.55: 82.6, 21 %, 18.9 → 15.9; +0.71 → +0.72: 111.3, 36 %, −3.0 → 4.2; +0.72 → +0.73: 110.2, 34 %, 4.2 → −3.4; +0.73 → +0.74: 30.2, 10 %, −3.4 → −5.4; +0.74 → +0.75: 112.5, 30 %, −5.4 → 6.1 |
| | floor 1.09 m | 6 | −0.10 → −0.09: 82.1, 21 %, 19.1 → 14.2; +0.08 → +0.09: 36.2, 14 %, −5.2 → −7.7; +0.09 → +0.10: 111.6, 31 %, −7.7 → 3.2; +0.10 → +0.11: 107.3, 32 %, 3.2 → −5.6; +0.11 → +0.12: 25.1, 11 %, −5.6 → −6.9; +0.12 → +0.13: 109.3, 30 %, −6.9 → 4.2 |
| Sharks | card 1.0 m | 2 | +0.34 → +0.35: 69.0, 36 %, 16.9 → 12.4; +0.35 → +0.36: 35.2, 18 %, 12.4 → 9.1 |
| | floor 0.81 m | 3 | +0.02 → +0.03: 70.1, 41 %, 15.2 → 10.7; +0.03 → +0.04: 40.6, 24 %, 10.7 → 8.9; +0.04 → +0.05: 28.6, 16 %, 8.9 → 7.0 |

The break-field note's 0.04 m sweep at the card counted 0/1/3/3/2/2 flips
(Sewers → Sharks); at 0.01 m the same axis reads 0/3/3/2/5/2. The Jack's
132 m step it reported is the +0.42 → +0.43 rung here (129.9 m); Jack's
floor row has the same 129 m jump at −0.11 → −0.10, half a metre of tide
lower, which is the H₀-tide surface: the same branch change, reached at a
lower tide with a smaller wave. The Hook's card carries a cluster of four
~110 m flips between +0.71 and +0.75 that swing the sign (−3 → 4 → −3 → −5 →
6): a left-right-left oscillation of the selected branch at a tide where the
card is no longer a peel anyway (§2.2).

### 2.2 Signed α and on-reef along the tide (card row / floor row)

| spot | row | −0.86 | −0.50 | −0.25 | 0 | +0.25 | +0.50 | +0.76 |
|---|---|---|---|---|---|---|---|---|
| Sewers | card | 16.9 / 0.85 | 25.5 / 0.82 | 32.5 / 0.78 | 36.3 / 0.76 | 39.0 / 0.74 | 40.1 / 0.72 | 39.6 / 0.69 |
| | floor | 34.9 / 0.76 | 38.1 / 0.72 | 37.9 / 0.70 | 34.8 / 0.65 | **−6.8 / 0.00** | −5.5 / 0.00 | −4.3 / 0.00 |
| First Peak | card | 53.2 / 1.00 | 58.8 / 1.00 | 60.0 / 1.00 | 60.7 / 1.00 | 58.0 / 1.00 | 43.3 / 0.91 | **8.9** / 0.82 |
| | floor | 59.0 / 1.00 | 58.1 / 1.00 | 54.7 / 0.95 | 22.1 / 0.88 | 12.3 / **0.46** | 13.1 / 0.00 | 13.7 / 0.00 |
| Second Peak | card | **8.4** / 0.71 | 14.5 / 0.76 | 20.8 / 0.80 | 25.8 / 0.84 | 25.2 / 0.86 | 15.8 / 0.80 | 10.8 / **0.20** |
| | floor | 18.8 / 0.80 | 25.8 / 0.86 | 23.2 / 0.82 | 10.6 / 0.75 | 8.6 / 0.00 | 9.5 / 0.00 | 10.5 / 0.00 |
| Jack's | card | 35.2 / 0.82 | 37.9 / 0.83 | 38.4 / 0.82 | 37.1 / 0.82 | 35.6 / 0.81 | 12.6 / 0.51 | 11.7 / **0.00** |
| | floor | 35.7 / 0.83 | 35.6 / 0.82 | 31.6 / 0.79 | 11.1 / 0.56 | 9.6 / 0.00 | 9.9 / 0.00 | 5.9 / 0.00 |
| The Hook | card | 16.0 / 0.69 | 23.1 / 0.70 | 29.7 / 0.70 | 36.8 / 0.70 | 41.0 / 0.69 | 22.8 / 0.65 | **6.5 / 0.22** |
| | floor | 28.4 / 0.70 | 37.5 / 0.69 | 39.1 / 0.68 | 12.3 / 0.54 | 6.0 / 0.00 | 6.5 / 0.00 | 7.5 / 0.00 |
| Sharks | card | 15.6 / 0.66 | 25.2 / 0.70 | 30.1 / 0.73 | 30.5 / 0.73 | 28.8 / 0.68 | 12.5 / **0.00** | 16.7 / 0.00 |
| | floor | 22.2 / 0.69 | 29.2 / 0.72 | 29.8 / 0.73 | 16.4 / 0.54 | 12.2 / 0.00 | 16.1 / 0.00 | 16.5 / 0.00 |

Read across the floor rows: every one is a peel at every low tide and none
is a peel by +0.25. Read across the card rows: the card fails high — the
line leaves the reef (on-reef 0.00–0.22) at Sharks, Jack's, Second Peak and
The Hook, and drops to 8.9° at First Peak — and Second Peak's card is
marginal *low* as well (8.4° at MLLW). Only Sewers' card is a peel at every
accepted tide.

### 2.3 Where the peel criterion fails, in tide

The tide at which the criterion first fails, sweeping away from 0, for the
floor row and for the card row, and the whole set of tides at which the card
is not a peel (at those tides no floor exists):

| spot | floor row fails above | floor row fails below | card fails | reason at the card |
|---|---|---|---|---|
| Sewers | +0.01 (sign + reef) | never | never | — |
| First Peak | +0.02 (α) | never | ≥ +0.66 (12 rungs) | α 8.7–8.9 |
| Second Peak | +0.02 (α) | −0.73 (α, the card's own row) | ≤ −0.73 and ≥ +0.63 (28 rungs) | α < 10 both ends; off the reef high |
| Jack's | +0.01 (reef) | never | ≥ +0.51 (27 rungs) | off the reef |
| The Hook | +0.01 (sign) | never | ≥ +0.65 (13 rungs) | off the reef, α ≤ 6.5 |
| Sharks | +0.02 (reef) | never | ≥ +0.33 (45 rungs) | off the reef |

## 3. The 2-D question: is the floor separable?

No. floorH₀(tide) — the lowest H₀ from which every rung up to the card is a
peel, at that tide — per spot, with the selector-free reef activation height
beside it:

| spot | floorH₀ at −0.86 / −0.50 / −0.25 / 0 / +0.25 / +0.50 / +0.76 m | least-squares slope m/m (rmse m, n) | slope inside the band | floor defined for tide | monotone in tide? |
|---|---|---|---|---|---|
| Sewers | 1.08 / 1.30 / 1.46 / 1.62 / 1.78 / 1.95 / 2.13 | **0.647** (0.006, 165) | 0.627 | −0.862 … +0.764 | yes |
| First Peak | 0.85 / 1.07 / 1.22 / 1.38 / 1.54 / 1.70 / — | **0.629** (0.006, 153) | 0.611 | −0.862 … +0.65 | yes |
| Second Peak | — / 0.82 / 0.96 / 1.11 / 1.26 / 1.42 / — | **0.537** (0.100, 137) | 0.557 | −0.80 … +0.62 | no: nine downward steps between −0.67 and −0.38 |
| Jack's | 0.40 / 0.54 / 0.65 / 0.78 / 0.94 / 1.10 / — | **0.526** (0.022, 138) | 0.446 | −0.862 … +0.50 | one dip (−0.15: 0.69) |
| The Hook | 0.63 / 0.81 / 0.94 / 1.09 / 1.25 / 1.41 / — | **0.585** (0.014, 152) | 0.532 | −0.862 … +0.64 | one dip (−0.43: 0.83) |
| Sharks | 0.40 / 0.52 / 0.66 / 0.81 / 0.96 / — / — | **0.550** (0.018, 120) | 0.511 | −0.862 … +0.32 | yes |

| spot | reef activation H₀ at −0.86 / −0.50 / −0.25 / 0 / +0.25 / +0.50 / +0.76 m | slope m/m |
|---|---|---|
| Sewers | 0.759 / 0.955 / 1.096 / 1.239 / 1.387 / 1.537 / 1.698 | 0.578 |
| First Peak | 0.641 / 0.845 / 0.992 / 1.143 / 1.298 / 1.456 / 1.627 | 0.606 |
| Second Peak | 0.512 / 0.710 / 0.854 / 1.003 / 1.156 / 1.313 / 1.483 | 0.597 |
| Jack's | 0.200 / 0.356 / 0.483 / 0.616 / 0.755 / 0.899 / 1.056 | 0.526 |
| The Hook | 0.423 / 0.621 / 0.766 / 0.916 / 1.071 / 1.229 / 1.401 | 0.601 |
| Sharks | 0.264 / 0.447 / 0.583 / 0.726 / 0.874 / 1.027 / 1.193 | 0.571 |

Three readings:

1. **The floor moves 0.53–0.65 m per metre of tide.** Over the 1.626 m
   accepted range that is 0.7–1.05 m of floor — larger than the whole
   0.660 m seasonal H₀ range the months span. A floor measured at one tide
   is not a floor at another; the H₀ floor and the tide are not separable.
2. **The slope is the reef's.** Activation moves 0.53–0.61 m/m, the floor
   0.53–0.65. With F = H₀·shelter·K_s − γh and h = h₀ + tide, holding F = 0
   gives dH₀/dtide = γ/(shelter·K_s); γ = 0.78 and shelter·K_s ≈ 1.2–1.5
   over the wedge gives 0.52–0.65. The floor is the reef component switching
   on, and more water over the reef needs a bigger wave to switch it on.
3. **Above a spot-specific tide there is no floor.** A dash is a tide at
   which the card itself is not a peel (§2.2): Sharks from +0.33, Jack's
   +0.51, Second Peak +0.63, The Hook +0.65, First Peak +0.66. At those tides
   the wedge is deep enough that the authored card does not break on it, and
   no H₀ up to the card does; this is `BREAK_FIELD` §6's reef-extent
   finding on the tide axis. The floor exists on 100 % (Sewers), 93 %, 87 %,
   84 %, 92 % and 73 % (Sharks) of the accepted range.

## 4. What ships: a tide band (form a), and why not a table (form b)

**Adopted: (a).** Each `PEEL_FLOOR` row carries `tideBandM`, the contiguous
interval of 0.01 m tide rungs around 0 on which the tide-0 floor *holds* —
floorH₀(t) ≤ floorH₀(0) and the card is a peel — and `peelFloorH0()` returns
the tide-0 floor inside it and null outside. The band edges are re-baked by
`tests/peel-floor.test.js` the way the H₀ edges are, and pinned by a
`tideDigest`.

| spot | floor | band | low edge | high edge: H₀ that fails, α / on-reef edge → beyond | holds anywhere outside the band? |
|---|---|---|---|---|---|
| Sewers | 1.62 | **−0.862 … 0.00** | MLLW (range limit): card 16.9 / 0.85, floor 34.9 / 0.76 | 0 → +0.01 at 1.62: 34.8 → **−8.9**, 0.65 → 0.33 (sign + reef); floor at +0.01 is 1.63 | no |
| First Peak | 1.38 | **−0.862 … +0.01** | MLLW: card 53.2 / 1.00, floor 59.0 / 1.00 | +0.01 → +0.02 at 1.38: 21.7 → 6.0, 0.88 → 0.88 (α); floor there 1.39 | no |
| Second Peak | 1.11 | **−0.72 … +0.01** | −0.72 → −0.73 at the **card** 1.50: 10.2 → 10.0 (α); no floor at −0.73 | +0.01 → +0.02 at 1.11: 10.0 → 9.7, 0.71 → 0.70 (α); floor there 1.12 | no |
| Jack's | 0.78 | **−0.862 … 0.00** | MLLW: card 35.2 / 0.82, floor 35.7 / 0.83 | 0 → +0.01 at 0.78: 11.1 → 10.7, 0.56 → 0.43 (reef); floor there 0.79 | no |
| The Hook | 1.09 | **−0.862 … 0.00** | MLLW: card 16.0 / 0.69, floor 28.4 / 0.70 | 0 → +0.01 at 1.09: 12.3 → **−5.3**, 0.54 → 0.52 (sign); floor there 1.10 | no |
| Sharks | 0.81 | **−0.862 … +0.01** | MLLW: card 15.6 / 0.66, floor 22.2 / 0.69 | +0.01 → +0.02 at 0.81: 15.0 → 15.2, 0.51 → 0.49 (reef); floor there 0.82 | no |

The bands are one-sided because the floor is (nearly) monotone in tide and
the tide-0 number is, by construction, the tightest floor at 0: it cannot
hold above 0 unless floorH₀ is flat for a rung, which it is at three spots
(+0.01). Every band is contiguous — no tide outside a band holds.

**The cost of (a), stated.**

* *Below 0 the tide-0 floor over-clamps.* At MLLW the true floors are
  1.08 / 0.85 / — / 0.40 / 0.63 / 0.40 against the tide-0 1.62 / 1.38 / 1.11 /
  0.78 / 1.09 / 0.81 (0.38–0.54 m too high). Concretely: at tide −0.50 the
  August p75 of 0.585 m is a peel on the reef *raw* at Jack's (floor 0.54)
  and Sharks (0.52), and the band still raises it to 0.78 / 0.81. Seasonal
  range that a low tide would have returned is not returned.
* *Above the band nothing is guarded.* `#month=august&tide=0.3` draws
  0.585 m at every spot, which is a closeout at every spot (reef activation
  at +0.3 is 0.78–1.42 m). The HUD says so — "NOT applied … holds for tide
  −0.86…+0.00 m — this state is at tide +0.30 m" — and the clamp does not
  touch the tide.

**Not adopted: (b), a tide-dependent floor.** §3 *is* the table, so this is
a decision with the numbers in hand, not a deferral:

1. *It has holes where it would matter.* At five spots the card fails above
   +0.33 to +0.66 m — 7 to 27 % of the accepted range — and no floor exists
   there. A table that answers "1.10 m" at Jack's for +0.50 and "no floor"
   at +0.51 declares a month drawable at a state where the card itself is
   off the reef one rung later; declining across the whole high-tide side,
   which (a) does, is the cleaner statement.
2. *It moves the picture under the slider.* A month's drawn height would
   slide 0.53–0.65 m per metre of tide (Sewers 1.08 → 2.13 m across the
   range) — the clamp would become the dominant thing the tide slider does
   to a month, larger than the seasonal signal the month exists to show.
3. *It is not monotone everywhere.* Second Peak's floor steps *down* nine
   times between −0.67 and −0.38 (rmse 0.10 m about the fitted line); a
   linear form would under-clamp there, and a step table at 0.01 m is 165
   entries per spot pinned by 165 digests.
4. *Nothing that ships needs it.* Months sit at tide 0. All seven `#day=`
   states are off-basis on T (`small` T 9, `pulse` 12, `overhead` 16, `big`
   17, `stormy` 10; `modelcard` T 14 at 1.5 m and `foggy` T 13 at 1.1 m are
   above every floor they could meet). The nowcast's T is a float and never
   the card's integer. The band therefore changes **zero shipped states**;
   it changes the reader-dragged tide state from stale-or-unguarded to
   clamped-and-conservative (below) or raw-and-disclosed (above).

If (b) is wanted later the grid is in `qa/break-field/tide-floor/*.rungs.json`
and `--mode=tide` regenerates it in ~15 minutes; the honest form would be a
per-rung table with the card-fails tides returning null, not a fit.

## 5. On screen

Two runtime changes, both in `web-three/js/main.js`, neither a clamp on tide:

* `setTide()` re-applies an active month through `setMonth()` →
  `setDerivedH0()`, so the floor is re-evaluated at the tide the reader just
  set. Before this the slider carried a tide-0 clamp — and the HUD line
  vouching for it — to any tide. The hash parser already read `#tide=`
  before `#month=` for the same reason.
* The off-basis HUD line names the band: "measured … at T 15 s and holds for
  tide −0.86…+0.00 m — this state is at T 15 s, tide +0.30 m, so the number
  does not describe it. Drawing the requested height unclamped; the peel here
  is whatever the bed gives."

So: drag the tide *down* with a month on and the month stays at the floor
(a peel, more conservative than needed); drag it *up* past the band and the
month drops to its raw p75 — the picture goes to the inshore bore or nothing,
and the HUD says why. `#clamp=0` still draws everything raw. The card states
and `#h0=` are never routed through any of this.

## 6. What this does not do

* It does not make the high-tide side drawable. Above +0.33…+0.66 m the
  authored cards are not peels on this bed; that is the reef-extent question
  (`NEXT_INVESTMENTS` §1 item 3) on its second axis, and no floor fixes it.
* It does not return the seasonal range a low tide would allow (the over-clamp
  above). A (b)-form floor on the *low* side only — where the floor is
  monotone at four spots and defined at all six — would; it is not built.
* It does not measure the period axis. `BREAK_FIELD` §5.2 found zero flips on
  T at the card H₀; the floor's T basis stays "the card's own" and declines
  elsewhere, and every shipped off-card-T state passes through unchanged.
* It does not wire live tide. `shared/cdip.js` carries no tide; `#day=live`
  keeps whatever tide is on screen.

## 7. Reproduction

```
node scripts/measure_break_activation.mjs --mode=tide --preset=<spot>   # ~3–15 min per spot; run spots in parallel
node --test tests/peel-floor.test.js                                     # re-bakes the band edges and the H0 edges
```

Outputs under `qa/break-field/tide-floor/`: `<spot>.json` (committed),
`<spot>.rungs.json` (ignored). Definitions: flip = any stage station moving
more than 20 m in one rung; α = stage-median clean signed crest-relative
alpha on the 2 m stage grid, limiter-pinned stations excluded; on-reef =
fraction of stage stations on the wedge footprint; healthy = α ≥ 10° with
the authored sign and on-reef ≥ 0.5; floorH₀(t) = lowest rung from which
every rung up to the card is healthy at tide t; the band = the contiguous
tide rungs around 0 with floorH₀(t) ≤ floorH₀(0) and the card healthy.
Model at commit `ab56730` (bake inputs unchanged since the floor's
`c85bf62`; the H₀-edge digests still match).
