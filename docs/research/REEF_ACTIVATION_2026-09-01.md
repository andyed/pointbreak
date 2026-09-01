# Reef activation at Sewers and First Peak: honest boundary, authored number (2026-09-01)

*Companion to `BREAK_FIELD_2026-09-01.md` (which measured the activation table
this note explains) and `CUDEM_BED_2026-09-01.md` (which found activation stable
across two DEMs). Answers NEXT_INVESTMENTS §1 "what is next" item 3, the
reef-extent question. Nothing shipped changes: `web-three/js/bed.js`,
`shared/model-glsl.js`, `shared/params.js` and every data module are untouched.
Every number comes from `scripts/measure_reef_activation_sensitivity.mjs`, a
new instrument that runs the bake's own code with four constants
parameterised in memory, plus one new data pull
(`data/climatology/pp_mop_alongshore.json`).*

**Verdict in one paragraph.** Reef-activation H0 is the depth of the
shallowest cell of the synthetic wedge and nothing else: the closed form
γ·h*/(shelter(x*)·K_s(h*)) reproduces the instrument's bisection to 1e-12 at
all six spots. That depth is set by `crestDepth = clamp(0.75·h_b(card H0, card T),
1.2, 3.0)`, an authored quantity derived from the card, so the 0.31–0.93 m DEM
residual is not its error bar — the DEM only decides where the wedge exists,
not how deep its crest is. Reef *extent* (the question as posed) barely moves
activation: across every window, feather and amplitude variant the OSM bounds
permit, Sewers' activation stays between 1.11 and 1.43 m, First Peak's between
0.98 and 1.19, and the other four move by ≤ 0.13 m. What does move it is crest
depth, at ~0.5 m of H0 per metre of crest, and tide, at ~0.55 m of H0 per metre
of water — and the −0.5 m NAVD88 reef ceiling floors the reachable activation at
0.60–0.73 m at every spot, all above the August p75 of 0.585 m. **No wedge
inside the shipped invariants activates at the August p75 anywhere on the
point.** Sewers would need a crest 1.11 m shallower than the rule gives it to
activate at the August p90, and 1.28 m plus a lifted ceiling for the p75. New
evidence from the ten MOP transects around the point puts Sewers' own August
p75 at 0.633 m (1.08× the SC116 value the month table uses), so the
single-transect climatology is not what hides a Sewers summer. Reading (a),
the honest boundary, holds at Sewers, First Peak, Second Peak and The Hook;
Jack's and Sharks are ceiling-limited, so their activation numbers are
statements about `REEF_CEIL_EL`, not about a reef. The summer state at Sewers is
a lull, the HUD already says the clamp binds, and the QA season sheet does not
yet say so (§6.1).

## 1. What sets activation

The instrument serves `bed.js` through a `node:module` load hook with four
string patches (each asserted to match exactly once;
`tests/reef-activation-sweep.test.js` pins them): the crest-depth rule, the
crest-target ceiling, the post ceiling, and `reefWinFor`'s knots. A
`?sweep=<json>` query makes each import a distinct module instance, so one
process holds every sweep point. At zero knobs it must reproduce
`measure_break_activation.mjs`'s `reefActivationH0` and the shipped
`reefFitFor` at every mapped spot before it prints anything else
(MEASUREMENT_LESSONS 4).

Gate, tide 0, card T (max |Δ| over the six spots: activation 0, fit β 0, crest
target 0):

| spot | activation H0 | h_b (card) | crest target depth | activating cell: depth / x / shelter | closed form | shallowest wedge cell |
|---|---:|---:|---:|---|---:|---:|
| Sewers | 1.239 | 3.900 | 2.925 | 2.639 m / −111 m / 1.084 | 1.239 | 2.633 |
| First Peak | 1.143 | 3.250 | 2.438 | 2.316 / −31 / 1.033 | 1.143 | 2.304 |
| Second Peak | 1.003 | 2.800 | 2.100 | 2.061 / −7 / 1.019 | 1.003 | 2.041 |
| Jack's | 0.616 | 2.100 | **1.605 (ceiling)** | **1.405** / −87 / 1.069 | 0.616 | 1.405 |
| The Hook | 0.916 | 2.700 | 2.025 | 1.861 / −7 / 1.019 | 0.916 | 1.861 |
| Sharks | 0.726 | 1.950 | **1.605 (ceiling)** | 1.550 / −17 / 1.025 | 0.726 | 1.550 |

Three things to read off.

1. **Activation is a depth.** F = H0·shelter·K_s(h) − γh is linear in H0, so the
   first cell to reach zero is the one minimising γh/(shelter·K_s), and its H0
   is the activation. The "closed form" column is that cell's number; it equals
   the bisection at every spot. Everything else in this note is about what sets
   that cell's depth.
2. **The activating cell sits above the crest target.** The wedge lifts toward
   `targetEl` with a ridge factor of 1 ± 0.15 on the lift (Mead & Black's
   "sections"), so ridge peaks overshoot the target by up to 15 % of the local
   lift: Sewers' crest target is 2.925 m deep and its shallowest cell 2.63 m.
   Where the overshoot would breach the −0.5 m NAVD88 ceiling it is clamped
   there — Jack's 1.405 m is exactly `MSL − REEF_CEIL_EL` = 0.905 + 0.5.
3. **Two spots are already on the ceiling.** Jack's and Sharks have
   `0.75·h_b` < 1.605 m, so `targetEl = min(MSL − crestDepth, REEF_CEIL_EL − 0.2)`
   takes the ceiling branch. Their crest depth, and therefore their activation,
   is a property of the invariant "the reef must never move the shoreline",
   not of h_b, the card, or the bed. CUDEM_BED §4.4 saw this as "Jack's is the
   invariant" without naming the cause.

The crest depth is the card's: h_b(2.2 m, 15 s) = 3.90 m at Sewers, and 0.75
of it is 2.93 m. The DEM enters only through `bound` (where the natural bed sits
more than `REEF_AMP_MAX + 1.2` m below the target the wedge ends) and the anchor
`zRef`. So the DEM residual is the right error bar for *where the wedge is*,
and the wrong one for *how deep its crest is* — the question as posed
("within the DEM residual") assumed a coupling the code does not have.

## 2. Sensitivity to crest depth, and where the ceiling binds

`crestDeltaM` is added to `clamp(0.75·h_b, 1.2, 3.0)` before the ceiling min.
Positive = deeper. Activation H0, tide 0, card T, shipped ceiling
(full 0.1 m ladder −1.6…+1.0 in `qa/reef-activation/summary.json`):

| crest Δ (m) | Sewers | First Peak | Second Peak | Jack's | The Hook | Sharks |
|---:|---:|---:|---:|---:|---:|---:|
| −1.3 | **0.604** | 0.628 | 0.701 | 0.616 | 0.646 | 0.726 |
| −1.1 | 0.694 | 0.628 | 0.701 | 0.616 | 0.646 | 0.726 |
| −0.9 | 0.819 | 0.628 | 0.701 | 0.616 | 0.646 | 0.726 |
| −0.7 | 0.948 | 0.691 | 0.701 | 0.616 | 0.646 | 0.726 |
| −0.5 | 1.081 | 0.820 | 0.701 | 0.616 | 0.646 | 0.726 |
| −0.3 | 1.200 | 0.880 | 0.823 | 0.616 | 0.718 | 0.726 |
| −0.1 | 1.233 | 1.073 | 0.940 | 0.616 | 0.850 | 0.726 |
| **0** | **1.239** | **1.143** | **1.003** | **0.616** | **0.916** | **0.726** |
| +0.3 | 1.336 | 1.328 | 1.202 | 0.704 | 1.119 | 0.843 |
| +0.5 | 1.450 | 1.442 | 1.299 | 0.802 | 1.253 | 0.938 |
| +1.0 | 1.794 | 1.700 | 1.620 | 1.277 | 1.569 | 1.203 |

Slope in the free range: ~0.5 m of activation H0 per metre of crest (Sewers
1.239 → 0.756 over −1.0 m). Every column stops moving where the ceiling
binds — the crest target cannot go above −0.7 m NAVD88 (1.605 m depth) and no
post above −0.5 m — and the floors are **0.603 / 0.628 / 0.701 / 0.616 / 0.646 /
0.726 m**. All six are above the August p75 (0.585). Sewers' floor is 1.3 m of
crest away; Jack's and Sharks are already there. Second Peak's floor (0.701) is
higher than Jack's because its ridge overshoot is smaller where the natural bed
is deeper (less lift, less 15 %).

**The reef fit under the same sweep** (derived α / target, sign violations):
Sewers holds 37.7–39.0° with 0 violations at every Δ. First Peak's fit degrades
below Δ −0.3 (48.8°) to 27.3° at Δ ≤ −0.8 and stops at the 14-iteration cap.
Second Peak collapses to 15.1° below Δ −0.3. Jack's and Sharks hold to +0.4 and
collapse at +0.6 (5.1°, 2.0°): at those two spots the ceiling crest is also the
only crest the fit works at. A shallower Sewers wedge would still peel at the
card; a shallower First Peak wedge would not.

### 2.1 What it would take, per spot

Bisection on `crestDeltaM` for activation = each August target (SC116
deep-water H0: p90 0.691, p75 0.585, p50 0.485), with the ceiling as shipped and
with it lifted 1.0 m (HYPOTHETICAL: the lifted arm violates
`tests/reef-audit.test.js`'s invariant and exists only to show which constraint
binds):

| spot | target | ceiling | crest Δ | crest depth | activation | fit α / target | vs residual 0.31–0.93 |
|---|---|---|---:|---:|---:|---|---|
| Sewers | Aug p90 0.691 | shipped | **−1.11** | 1.82 | 0.691 | 38.6 / 38 | outside |
| Sewers | Aug p75 0.585 | shipped | unreachable (floor 0.603) | | | | |
| Sewers | Aug p75 0.585 | lifted | −1.28 | 1.65 | 0.585 | 38.6 / 38 | outside |
| Sewers | Aug p50 0.485 | lifted | −1.45 | 1.48 | 0.485 | 38.0 / 38 | outside |
| First Peak | Aug p90 | shipped | −0.70 | 1.74 | 0.691 | **33.4** / 50 | inside 0.93 |
| First Peak | Aug p75 | shipped | unreachable (floor 0.628) | | | | |
| First Peak | Aug p75 | lifted | −0.87 | 1.57 | 0.585 | **25.9** / 50 | inside 0.93 |
| Second Peak | Aug p90 | shipped | unreachable (floor 0.701) | | | | |
| Second Peak | Aug p75 | lifted | −0.73 | 1.37 | 0.585 | 40.9 / 41 | inside 0.93 |
| Jack's | Aug p90 | shipped | +0.27 | 1.85 | 0.691 | 36.6 / 37 | inside 0.31 |
| Jack's | Aug p75 | shipped | unreachable (floor 0.616) | | | | |
| Jack's | Aug p75 | lifted | +0.06 | 1.63 | 0.585 | 36.0 / 37 | inside 0.31 |
| The Hook | Aug p90 | shipped | −0.34 | 1.68 | 0.691 | 37.6 / 41 | inside 0.93 |
| The Hook | Aug p75 | shipped | unreachable (floor 0.646) | | | | |
| The Hook | Aug p75 | lifted | −0.52 | 1.51 | 0.585 | 35.4 / 41 | inside 0.93 |
| Sharks | Aug p90 | shipped | unreachable (floor 0.726) | | | | |
| Sharks | Aug p75 | lifted | −0.20 | 1.26 | 0.585 | 36.6 / 36 | inside 0.31 |

The "vs residual" column is kept because the question asked for it, and it is
the wrong column: the crest is not a DEM quantity, so "inside 0.93" at First
Peak does not mean the DEM could be hiding a shallower reef there — it means a
different authored rule would put one there, and the fit says that reef would
peel at 26–33° against a 50° target. For Sewers the answer is unambiguous on
either reading: 1.11 m for the p90, 1.28 m plus a lifted ceiling for the p75,
1.2–4× the residual, and a crest 0.6–1.2 m above the NCEI node (2.44 m deep)
and 2.1–2.3 m above the CUDEM node (3.77 m). Neither grid is validated under
the surf zone (BATHY_SOURCES §4), but a reef that both grids miss by 1–2 m at
the node is a sounding's claim to make, not a fit's.

## 3. Sensitivity to extent, feather and amplitude

The question as posed. Activation searched over the whole wedge footprint (not
the ±10 m stage restriction), so an extended window is counted.

| variant | Sewers | First Peak | Second Peak | Jack's | The Hook | Sharks |
|---|---|---|---|---|---|---|
| shipped | 1.239 | 1.143 | 1.003 | 0.616 | 0.916 | 0.726 |
| up-point bound −50 / −25 m | 1.424 / 1.246 | 1.152 / 1.156 | 1.022 / 1.011 | 0.737 / 0.714 | 0.916 / 0.916 | 0.726 / 0.726 |
| up-point bound +25 / +50 / +75 m | 1.239 / 1.239 / 1.239 | **0.995 / 0.976 / 0.986** | 1.000 / 1.000 / 1.000 | 0.609 / 0.606 / 0.606 | 0.916 ×3 | 0.616 / 0.608 / 0.606 |
| down-point bound −50 / −25 m | 1.327 / 1.153 | 1.191 / 1.176 | 0.996 / 1.000 | 0.616 ×2 | 0.916 ×2 | 0.726 ×2 |
| down-point bound +25…+75 m | 1.240 | 1.155 | 1.003 | 0.616 | 0.916 | 0.726 |
| feather cap 0 / 25 / 50 m (shipped 75) | 1.240 / 1.240 / 1.240 | **0.979 / 0.979** / 1.143 | 1.000 / 1.000 / 1.000 | 0.606 / 0.606 / 0.609 | 0.916 ×3 | 0.606 / 0.609 / 0.616 |
| feather cap 100 / 150 m | 1.249 / 1.249 | 1.143 / 1.143 | 1.003 / 1.003 | 0.713 / 0.737 | 0.916 / 0.916 | 0.726 / 0.726 |
| amplitude 1.6 / 2.4 / 4.8 / 9.6 m (shipped 3.2) | 1.427 / 1.426 / **1.114** / 1.114 | 1.149 / 1.162 / 1.143 / 1.143 | 1.000 / 1.003 / 1.003 / 1.003 | 0.716 / 0.621 / 0.616 / 0.616 | 0.921 / 0.913 / 0.915 / 0.915 | 0.723 / 0.726 / 0.726 / 0.726 |
| **range over all variants** | **1.114–1.427** | **0.976–1.191** | 0.996–1.022 | 0.606–0.737 | 0.913–0.921 | 0.606–0.726 |

Extent does not set activation, for the reason §1 gives: the crest is an
absolute elevation, so widening the window adds cells at the *same* depth. What
extent changes is *where* the shallowest cell sits, and that reaches activation
only through the shelter factor `exp(−(x − 24)/1675)`: an up-point cell is
under a slightly larger H_eff, so Jack's and Sharks drop 0.11–0.12 m when the
window or feather lets the wedge reach x ≈ −116 (shelter 1.087). Amplitude
saturates above 4.8 m, as CONTROLS already says; at Sewers it is worth 0.13 m
because a taller wedge exists further up-point where shelter is higher, and no
more after that.

One side finding. **First Peak's reef window is 70 % feather.** The stage is
132.6 m wide (OSM partition), `reefWindowKnots` gives f = min(75, 0.35·w) =
46.4 m per side, and the plateau where the wedge reaches its full lift is
40 m (x −29…+11). With the feather cap at 0–25 m, or the up-point bound out
25–75 m, its activation falls 0.15–0.17 m to 0.976–0.995, because the wedge
reaches the crest target over more of the stage. That is the largest
extent effect on the table, it still leaves First Peak 0.29 m above the August
p90, and it is recorded rather than recommended: the fit at those variants
reads 49–51° with 0 violations, so it costs nothing, but it also buys no
season.

## 4. The ocean axes: tide and period

Activation on the shipped wedge as the water moves (the floor's basis is tide
0 and the card T; MEASUREMENT_LESSONS 14b):

| spot | MLLW −0.86 | −0.43 | 0 | +0.38 | MHHW +0.76 | T 9 | T 11 | T 13 | T 15 | T 17 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Sewers | 0.759 | 0.994 | 1.239 | 1.464 | 1.698 | 1.569 | 1.434 | 1.327 | 1.239 | 1.167 |
| First Peak | 0.641 | 0.886 | 1.143 | 1.380 | 1.627 | 1.404 | 1.281 | 1.184 | 1.106 | 1.041 |
| Second Peak | 0.512 | 0.750 | 1.003 | 1.237 | 1.483 | 1.234 | 1.125 | 1.040 | 0.970 | 0.913 |
| Jack's | ≤ 0.200 | 0.391 | 0.616 | 0.829 | 1.056 | 0.734 | 0.668 | 0.616 | 0.575 | 0.540 |
| The Hook | 0.423 | 0.661 | 0.916 | 1.153 | 1.401 | 1.088 | 0.991 | 0.916 | 0.854 | 0.804 |
| Sharks | 0.264 | 0.485 | 0.726 | 0.953 | 1.193 | 0.865 | 0.787 | 0.726 | 0.677 | 0.637 |

Tide is a crest-depth knob the ocean actually turns: 0.55 m of activation per
metre of tide, the whole MLLW→MHHW excursion worth 0.94 m at Sewers. The tide
at which the shipped wedge activates at each August target (card T; "not
reached" = still above the target at MLLW):

| spot | Aug p90 (0.691) | Aug p75 (0.585) | Aug p50 (0.485) |
|---|---|---|---|
| Sewers | not reached (0.759 at MLLW) | not reached | not reached |
| First Peak | −0.77 m | not reached (0.641 at MLLW) | not reached |
| Second Peak | −0.54 m | −0.73 m | not reached (0.512) |
| Jack's | +0.14 m | −0.06 m | −0.25 m |
| The Hook | −0.38 m | −0.56 m | −0.75 m |
| Sharks | −0.06 m | −0.25 m | −0.43 m |

This is PP_MAP_GEOMETRY finding 1's mechanism ("small swell only breaks there
when tide drops the water level onto the shelf"; Private's "usually breaks on a
lower tide") showing up in the model at four of six spots. It does not rescue
Sewers or First Peak at the p75, and it is a statement about *activation*, not
about a peel: the `PEEL_FLOOR` at tide 0 is 1.62 / 1.38 / 1.11 / 0.78 / 1.09 /
0.81, and the tide axis is exactly what the floor does not yet guard
(NEXT_INVESTMENTS §1 item 2). Nothing here should be read as "Second Peak
peels at 0.585 m on a low tide"; it says the wedge is in play there.

## 5. External evidence

### 5.1 What the repo holds about which spots break at what size

The two guide sources (`PP_VISITORS_GUIDE_NOTES.md`, read 2026-08-09: the
Sunny California shop guide and Surfer.com's longboarding guide) carry **no
per-spot height numbers**. They carry an ordering. Quoted briefly, with what
each implies for an activation threshold in *offshore* swell:

| spot | guide language (source in the notes) | implied threshold | model activation, tide 0 (MLLW) | MOP transect, Aug p75 / p90, deep-water H0 |
|---|---|---|---:|---|
| Sewers | "very top; fastest, most competitive"; golden rule: "the waves get larger, faster, and more powerful as you move up the point"; winter: "double-overhead still shows at the top of the point" | gets the most energy — lowest offshore threshold on the point, or at least the biggest | 1.239 (0.759) | SC117: 0.633 / 0.749 |
| First Peak | "premier high-performance right; steeper tapered walls" | no size statement | 1.143 (0.641) | SC116: 0.585 / 0.691 |
| Second Peak | "softer, slower"; "peels ~100 yards on a good day" | no size statement | 1.003 (0.512) | SC116: 0.585 / 0.691 |
| Jack's (38th) | "needs a bit more swell to really activate; gentle rollers when on" | **explicitly higher than its neighbours** | 0.616 (≤ 0.200) | SC114: 0.571 / 0.673 |
| The Hook | "handles size, a bit faster" | upper-end statement only | 0.916 (0.423) | SC112: 0.535 / 0.632 |
| Sharks | "space, mellow lines" | none | 0.726 (0.264) | SC111: 0.523 / 0.617 |
| Privates | "can shut down if there is little to no swell"; "usually breaks on a lower tide" | **highest; tide-gated** | no measured bed | SC109: 0.497 / 0.585 |

No Surfline spot description is cited anywhere in the repo (README and the QA
docs cite Surfline's cam as visual ground truth only), and an attempt to read
one today met a bot-check page, so none is added. surf-forecast's break
metadata ("ideal tide low") is recorded in `PP_SWELL_CLIMATOLOGY.md` and is
not a per-spot threshold.

**A "breaks from about H0 = X" table cannot be built from these sources.**
What can be stated: the guides order activation *rising* down-point (Sewers
and First Peak break on the least offshore swell, Jack's needs more, Private's
the most), and the model's activation table in local H0 runs the *other way*
(Sewers needs the most, Jack's the least). The two are reconcilable only if
the local/offshore height ratio falls down-point faster than the activation
ratio rises — by more than 1.239/0.616 = 2.0× between Sewers and Jack's. The
card bank asserts a 2.0× fall (2.2 → 1.1 m) over exactly that span. §5.2
measures what MOP says about it.

### 5.2 New: the alongshore gradient at the 15 m contour (MOP SC109–SC118)

The month table is one transect, SC116, and a `#month=` applies its p75 at
every spot's anchor. `CA_v1.1_transect_definitions.txt` (fetched today;
`cdip2016moptransects`) places SC116's backbeach point 114 m from the Second
Peak node and 120 m from First Peak's — not down-point, as the earlier "~110 m
from the Pleasure Point coordinate" note left open. The neighbouring transects
are ~100 m apart along the shore and front every canon spot.
`data/climatology/build_alongshore_gradient.py` pulled the ten hindcasts
(hourly, 2000–2024 whole years, QC flag 1; `cdip2025mopalongshore`) and reduced
them:

| transect | nearest node (m) | Aug p50 / p75 / p90 Hs | Jan p50 / p75 / p90 | Aug p75 ÷ SC116 | Jan p75 ÷ SC116 | hour-matched median ratio, Aug / Jan |
|---|---|---|---|---:|---:|---|
| SC118 | Suicide's (73) | 0.536 / 0.648 / 0.771 | 1.063 / 1.471 / 1.996 | 1.135 | 1.211 | 1.131 / 1.219 |
| **SC117** | **Sewer Peak (120)** | **0.512 / 0.618 / 0.731** | 0.910 / 1.265 / 1.762 | **1.082** | 1.041 | 1.080 / 1.062 |
| SC116 | Second Peak (114), First Peak (120) | 0.473 / 0.571 / 0.674 | 0.862 / 1.215 / 1.698 | 1.000 | 1.000 | 1.000 / 1.000 |
| SC114 = SC115 | 38th (79) | 0.461 / 0.557 / 0.657 | 0.847 / 1.219 / 1.704 | 0.975 | 1.003 | 0.972 / 0.975 |
| SC113 | The Hook (185) | 0.459 / 0.556 / 0.659 | 0.798 / 1.122 / 1.583 | 0.974 | 0.923 | 0.968 / 0.933 |
| SC112 | The Hook (72) | 0.433 / 0.522 / 0.617 | 0.796 / 1.122 / 1.587 | 0.914 | 0.923 | 0.917 / 0.927 |
| SC111 | Shark's Cove (59) | 0.424 / 0.510 / 0.602 | 0.813 / 1.166 / 1.643 | 0.893 | 0.960 | 0.900 / 0.948 |
| SC109 = SC110 | Private's (87) | 0.407 / 0.485 / 0.571 | 0.838 / 1.212 / 1.686 | 0.849 | 0.998 | 0.868 / 0.978 |

(SC109/SC110 and SC114/SC115 share a prediction site and return identical
series; the transect definitions say so.)

Three readings.

1. **Sewers' own August is 0.633 m, not 0.585.** SC117 runs 1.08× SC116 in
   August, 1.04× in January. In deep-water terms Sewers' August p75 is 0.633 m
   and p90 0.749 m against an activation of 1.239 at tide 0 and 0.759 at MLLW.
   The single-transect month table understates Sewers by 8 %, which is real and
   worth carrying, and is nowhere near the 2× the ordering conflict needs.
2. **The gradient at the 15 m contour is 1.27×, not 3.1×.** SC117/SC109 in
   August is 0.618/0.485. The card bank's 2.2 → 0.7 m encodes 3.1× over the
   same span (params.js: "the seven card H0s ARE the guides' sheltering
   gradient", r² 0.81 against `exp(−u/1675)`). MOP does not see that gradient
   at 15 m. It cannot rule it out shoreward — MOP stops where the reef starts,
   and refraction into the coves is exactly the mechanism PP_MAP_GEOMETRY
   finding 2 names — but whatever produces the guides' ordering is happening
   inside 1 km of shore, on ground no source in this repo resolves.
3. **The season is stronger at the apex.** SC118, west of Sewers, runs 1.21×
   in January against 1.13× in August: the winter W swell wrapping Soquel Point
   delivers its size at the top, as the Surfer.com guide says. That is the one
   place the MOP gradient and the guide agree in kind.

So the external evidence neither rescues a Sewers summer nor indicts the
model's Sewers number: the transect that fronts Sewers says its August is
half its activation on any tide. What it does indict is weaker and should be
said plainly: **the model's cross-spot activation ordering is the crest rule's,
not the guide's.** `0.75·h_b(card)` makes the wedge deepest where the card is
biggest, so up-point spots need the most local H0 to activate. A uniform crest
depth, or one read off the bed, would order them differently. The guide's
ordering (down-point needs more) is the one every source here supports, and
the bank's 3.1× card gradient is the model's only mechanism for producing it —
a gradient MOP puts at 1.27× where it can see. Undecidable without a
surf-zone measurement; recorded so it is not re-derived.

## 6. Verdict, per spot

| spot | verdict | why | what the summer state should say |
|---|---|---|---|
| **Sewers** | **honest boundary** (authored) | activation is the 2.9 m crest the 2.2 m card builds; no extent, feather or amplitude variant brings it below 1.11 m; a 1.11 m shallower crest reaches only the August p90 and sits 0.6–2.3 m above either DEM's node; SC117 puts Sewers' August p75 at 0.633 m, p90 0.749, and its 25-year August maximum near the 1.24 activation at tide 0 | lull. `#month=august` clamps to the 1.62 m floor and the HUD names both numbers; it should also say the reef is not in play below 1.24 m (§6.1) |
| **First Peak** | **honest boundary** (authored) | 1.143 vs its transect's August p90 0.691; reaching the p90 needs −0.70 m of crest and the fit falls to 33° against 50°; the only extent lever (its 70 % feather) is worth 0.16 m | lull, same as Sewers; not on the QA season sheet at all |
| Second Peak | honest boundary | 1.003 vs 0.691; the shipped-ceiling floor 0.701 is above the p90; at tide −0.73 m the wedge activates at the p75 (activation, not peel — floor 1.11) | lull at tide 0. The `h0-low` row is already `n/a` per BREAK_FIELD §7 |
| Jack's | **ceiling-limited, undecidable** | crest 1.605 = the −0.7 m target ceiling, activating cell 1.405 = the −0.5 m post ceiling; 0.616 is `REEF_CEIL_EL`'s number; the p75 is 0.03 m below it (tide −0.06 activates) and the p90 above | on the healthy side of the floor (0.78) May–Sep via the clamp; the activation number should be reported as a ceiling, not a reef |
| The Hook | honest boundary | 0.916 vs 0.632; tide −0.56 m reaches the p75 | lull at tide 0; clamped Mar–Nov |
| Sharks | **ceiling-limited, undecidable** | crest 1.605 (ceiling); 0.726 vs 0.617; tide −0.25 m reaches the p75 | as Jack's |

**No spot is an artifact in the sense the question meant** — a wedge-depth
error inside the DEM residual that, corrected, would make the spot seasonal.
There is no such error because the crest depth is not a DEM quantity. Two
weaker findings are artifact-shaped and are recorded as such:

- **Jack's and Sharks' activation numbers are the ceiling's.** Reporting
  "Jack's reef activates at 0.616 m" as site character overstates what the
  model knows; it knows that a wedge clamped at −0.5 m NAVD88 under 0.905 m of
  MSL activates there. The smallest change that would make the number a reef's
  is none — the ceiling is the invariant that keeps the shoreline where the
  DEM puts it, and the instrument's lifted-ceiling arm shows what removing it
  costs: posts 0.4 m under still water.
- **The cross-spot ordering is the crest rule's** (§5.2). The smallest change
  that would test it is not a constant: it is replacing `0.75·h_b(card)` with a
  crest depth that has a source, and no source in the repo resolves the reef.

### 6.1 What the HUD and QA sheets say in summer, and should

The §4.6 pattern: declare the boundary, disclose in the product, `n/a` where
the premise is not met.

| surface | Sewers / First Peak, `#month=` Jun–Sep today | gap |
|---|---|---|
| HUD (`main.js` `hudClamp`) | "drawing 1.62 m — month august asks for 0.585 m. Sewers loses its peel below 1.62 m (measured 1.61→1.62 m, α −8.3°→34.8° against a 38° target). Size is clamped here — this is not the season's height. #clamp=0 draws it raw." | says the peel floor; does not say the reef itself is out of play below 1.24 m, which is the stronger and simpler fact. One clause: "the reef does not break here below 1.24 m; the season's height is a shore bore" |
| `audit_shipped_states.mjs` | records `clampBound`, `clampReq`, `clampApplied` per state | none |
| QA season sheet (`build_qa_sheets.mjs` `sea-sewers-august`) | note reads "the flat one — H₀ p75 0.585 m; ZERO hours ≥ 1.3 m in 25 years" over frames captured with the clamp ON, i.e. at 1.62 m | **the row shows a 1.62 m wave under a 0.585 m caption and does not read the clamp.** It should either carry the clamp readback the audit already has ("drawn at the 1.62 m floor; requested 0.585") or read `n/a — lull; the reef is not in play below 1.24 m`, the same footing as `day-small` and `h0-low` |
| `PEEL_FLOOR_BASIS` / MODEL.md §4.6 | "It does not make Sewers or First Peak seasonal … a reef-extent fact, not a floor fact" | the phrase "reef-extent" is now measured false: it is a crest-depth fact. Wording, for whoever next edits §4.6 |

Not changed here — `build_qa_sheets.mjs` and `main.js` are renderer-side and
other agents own the shipped surfaces today. The QA-sheet row is the one that
should move first; it is the published artifact that currently says the
opposite of what it shows.

## 7. Bounds of every sweep (state the range with the null)

- Crest Δ −1.6…+1.0 m at 0.1; ceiling lift 0 and +1.0 m; tide 0; card T. Solves
  bisected on Δ ∈ [−3.0, +1.0]; "unreachable" means activation at Δ = −3.0 is
  still above the target, with that floor stated.
- Window bounds ±50 / ±25 / +75 m per side, feather cap 0–150 m, amplitude
  1.6–9.6 m; one knob at a time, others shipped. Not swept jointly.
- Tide −0.862…+0.764 (the published MLLW–MHHW excursion), T 9–17 s, on the
  shipped wedge. Tide-needed bisected inside that excursion; "not reached"
  means activation at MLLW is still above the target.
- Activation searched at 0.2–3.0 m; a cell reported at 0.200 (Jack's at MLLW)
  is at the search floor, not a measurement.
- MOP: ten transects, 2000–2024 whole years, Hs and QC flag only; percentile
  ratios and hour-matched medians. Nothing about the reef, nothing shoreward of
  the 15 m contour.
- Not measured: whether a peel exists at any of these activations (the
  `PEEL_FLOOR` is the instrument for that and is unchanged); anything on the
  CUDEM bed (CUDEM_BED §4 already has activation there: Sewers 1.407, First
  Peak 1.101, Jack's 0.616).

## 8. Reproduce

```
node scripts/measure_reef_activation_sensitivity.mjs               # gate + every table, ~20 s
node scripts/measure_reef_activation_sensitivity.mjs --mode=solve  # section 2.1 only
node --test tests/reef-activation-sweep.test.js
python3 data/climatology/build_alongshore_gradient.py              # section 5.2, ~2 min pull, cached after
```

Tables: `qa/reef-activation/summary.json` (committed),
`data/climatology/pp_mop_alongshore.json` (committed). The instrument prints
markdown; the tables above are its output trimmed to the rungs discussed.
