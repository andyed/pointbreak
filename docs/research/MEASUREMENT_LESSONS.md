# Measurement lessons

Method notes earned by getting things wrong on this project. Each entry is here
because a confident claim was made and then falsified by an instrument, usually
within the hour. Roughly ordered by how much time the mistake cost.

## 1. A still frame cannot support a claim about motion

Three instances in two days, all mine:

* The external-validity audit graded the whole sim from **one frozen clock**
  (`sim=42`) and concluded the tide response was inverted. It was not: the depth
  path was correct and `sim=42` was a **lull at both tides**.
* "Multiple shore-parallel foam rows prove a beach break" — the real cam shows
  several broken lines at low tide. The point-break signature is *progressive
  peeling*, which is kinematic.
* "Peel direction is rightward, confirmed across two frames" — frame order was
  never established, and lag cross-correlation later found **no alongshore
  propagation at all** in that window.

The rule: if the claim contains a verb of motion — peels, travels, advances,
breaks first — a still cannot support it, and confidence while reading one is
not evidence.

## 2. Prove the probe before trusting the measurement

* **Wall-clock timing is useless on a fast machine.** An M3 Max reported
  **8.3 ms for every configuration** — baseline, 4× fill, quarter grid —
  because rAF caps at 120 Hz. Only GPU timer queries
  (`EXT_disjoint_timer_query_webgl2`) separated the cases.
* **Cross-launch GPU timing is too noisy for a 10% effect** — 3.1–4.4 ms for
  identical configs. A change must be A/B'd **inside one page session**, which
  is why the land-skip threshold is a uniform rather than a `const`.
* **A buffering video player looks exactly like calm water.** A 48 s cam capture
  changed by 1.3 grey levels total; tracking it would have produced a clean peel
  speed built from JPEG noise. `measure_cam.py` gates on motion *first*.
* **Editing destroys a time base invisibly.** Speed ramps and slow motion in
  edited footage yield a confidently wrong speed with a good correlation
  coefficient and no pixel-level tell. Fixed cams only.

## 3. Linearity is the validity check, and a null can be a result

Lag cross-correlation is only trustworthy when the lag **scales with the
separation**: 4 frames at 6 px and 8 frames at 12 px is a real signal; the same
lag at every separation is not.

And zero lag at *every* separation is itself a finding — a standing bore pulsing
in phase — not a failed measurement. Distinguishing "no propagation" from "too
fast to resolve" is arithmetic: zero lag at 90 px separation at 30 fps would
mean >2700 px/s, which is absurd, so it is genuinely standing.

## 4. Instruments that score a replica certify the replica

`rideMetric` scored the rider through a CPU twin that lacked the entire depth
path, so its published 0.81–0.87 face-height ratios measured **twin
self-consistency**, not rider-on-the-drawn-wave. Measure the surface that ships.
Corollary: when a metric and the renderer read different fields, the metric is
decorative.

## 5. Calibrate a threshold, never assume it

The land-vertex wave-math skip was first set at the open-water crest bound
(16 m) and measured **useless**: it fired on 0–11.6% of vertices and **0% at
three of six spots**. The defensible bound was 6 m — on dry ground the wave is
depth-limited to nothing, so the only reach is the setup lift (2.88 m capped) —
and that covers 19–42% of each patch. Same lesson at the break-line slew limit,
where "2.0 m/m is well above every α target" was falsified by its own
measurement: it clamped Sharks' 66° line to 63.4°.

## 6. Refutations need the same evidentiary bar as claims

Round 2 overturned four conclusions of the external-validity audit — and each
refutation came from a **single agent with no second seat**, exactly the
standard the audit was criticised for. A newer story is not automatically a
truer one.

## 7. The measurement often relocates the bug rather than confirming it

Repeatedly, instrumenting a suspected defect found a *different*, larger one:

* Chasing an "inverted tide" found the whitewater channel has no dependence on
  broken **area** at all.
* Chasing a rectangular tableland found `bedElevM` clamping outside the patch —
  and that the seabed mesh and the water grid's land path had been disagreeing
  about the same ground.
* Chasing the seam found the synthetic reef was an **unbounded bar** running
  200–300 m offshore, which also explained the "light shaft" and the isolated
  whitecap column.
* Extending the DEM surfaced that `BED_FRAG` had **no aerial perspective**, so
  every distant bed fragment converged on near-black.

## 8. Repair-the-output fails where change-the-selection works

Three separate attempts to fix the break line by post-processing it —
smoothing, a direction-monotonicity constraint (`#peeldir`), and morphological
closing — each destroyed the peel while fixing its noise. All died on the same
rock: the measured bed's stage-scale trend opposes the declared handedness, and
the line is notched at every scale.

What worked was moving the intervention into the **selection** step:
branch-following collects every criterion crossing, lets the declaration pick
the branch once at the reef anchor, and propagates by continuity. α landed on
target at all six spots, unsmoothed, for the first time.

When repairing the output keeps failing, change which physics gets selected.

**Corollary (2026-08-13): changing the selection only works when the
declaration and the candidates are in the same neighbourhood.** A second
selection-step intervention — rank crossings by their distance from the fitted
wedge crest — measured bit-identical to default at bands from 45 m down to 1 m,
because `crestOffset()` puts the drawn line 40–191 m from that crest, so the
in-band set is empty and the fallback runs everywhere. Branch-following worked
because continuity compares each candidate to the *previous crossing*, which is
always nearby. Before declaring a constraint, measure the distance between what
you are declaring and what you are choosing among.

## 8b. An ensemble is dominated by its worst member — measure the matrix

Track 1c assumed four flags that "each fail differently" would compose into a
shipping default. The matrix (`measure_ensemble.mjs`) showed every combination
containing `#peeldir` is bit-for-bit the peeldir failure alone — α ≈ 8–10°
everywhere, no rideable branch — because after the V-fix's branch-following
selection there was nothing left for the constraint to do but flatten a
coherent line. Judging flags one-at-a-time against default can never see this;
only leave-one-out reveals which member owns the ensemble's behaviour. And a
config can pass a stability criterion by being uniformly dead — the full
ensemble's 1–3° H₀ swing was the stability of a flat line, not of a wave.

## 8c. A summary statistic needs its domain checked before its value is read

Diagnosing the H₀ swing, the first instrument reported line-wide α as a median
over the entire ~600 m break-line bake. It came back stable at 1.7–3.4°, which
supported a clean conclusion: the line is fine, only the single-station ruler
moves. The median was dominated by flank stations far outside the 113–312 m
rideable stage, which are flat and stable whatever the surf does. Restricted to
the stage, the same sweep gives 7.4–9.6° — still 4–8× smaller than the station
reading, but a real failure of the < 5° band rather than a pass.

The stable-looking number was true and vacuous. Before believing a summary,
check what it is summarising over — especially when the domain is set by an
implementation detail (here, a bake width) rather than by the question.

## 9. Parallel agents on shared files fail silently

A workflow round left **two debug probes committed** — an early `return` that
skipped the entire foam/fresnel pipeline, and a kelp mask multiplied by zero —
and the verification pass greped for *claimed edits* rather than for leftover
scaffolding, so both shipped. Grep every agent-touched file for
`TEMP|DEBUG|PROBE|XXX|HACK` before believing a round is done.

Worse: the "kelp polarity is visibly fixed" verification was performed against
frames rendered by the broken probe. A capture is not verification if you have
not established what the renderer was doing when it was taken.

## 10. Browser-driving agent fleets are not free

Two multi-agent rounds driving headless Chromium against a WebGL app made the
host machine unusable — ~640 screenshots and 434 MB of scratch drove Spotlight
and icon services to pin Finder at 73–82%, a live preview tab animated for the
whole session, and task notifications drove NotificationCenter to 132%. Cap
concurrent browser agents at ~2, budget captures in tens, never leave a preview
animating, and check machine load **before** launching and **between** phases.

## 11. An instrument that frames itself on the signal is not a fixed instrument

The drone capture rig auto-frames on the brightest water bins (that is its
design: find the surf zone, frame it). So any change to FOAM — the thing a
foam A/B measures — can move the instrument's own window: the 4a′ v2 check
framed at camera z = −96 where the identical hash on the pre-change build
framed at z = 84. The two sides of that A/B would have counted different
world windows and the ratio would have been framing, not foam.

Tell: record the camera per run (the manifest already does) and diff it
across the arms of any A/B. Fix: pin the sampling — `--rig=nadir` with
explicit --cx/--cz/--halfw — whenever the quantity being measured is also
the quantity the auto-framer keys on. Same family as lesson 4
(self-certifying instruments): the framer is part of the instrument, and it
must not share a variable with the measurand.

## 12. A sample is not an envelope — check the reducer against the carrier

The QA sets sheet asks a question about the SET envelope (period 1/Δf =
125–167 s) and answered it with one instantaneous crest height at one
station. But crest height at a fixed station is that envelope times a
CARRIER — individual waves, period T = 12–15 s. The sheet's columns are a
quarter beat apart, 31–42 s, which is 2.1–3.5 carrier periods: a spacing
with no relation to T. So every column sampled the passing wave at an
arbitrary phase, and the numbers were the carrier aliased into a column
labelled "SET PEAK".

It produced a convincing false positive. The Hook read
`1.04 / 3.63 / 3.13 / 1.25 / 0.98` m across one beat — a set apparently
cresting a column early and half over by the peak column, with a low peak
as well; two symptoms, one site, exactly the shape of a site-specific model
defect. Sweeping that same station every 1 s across the same beat found
waves of 2.11–5.30 m arriving every 13 s, the tallest at t = 184 s, **3.9 s
(0.027 beat) before** the peak column's own clock. The envelope was where
the anchor put it; the column simply landed between two waves. Measured the
same way, all seven sites peak in column 3 and every station on every stage
peaks within ±0.11 beat of the anchor phase.

Two cheaper "fixes" that do not work, both measured rather than assumed:

* **Re-phase the columns.** dF and T are independent site parameters, so
  the commensurability differs per site — 2.08 waves per column at Sewers
  (which is why Sewers looked fine: luck) against 2.75 at The Hook. No one
  clock choice serves the bank. Pinned in `tests/qa-set-clocks.test.js`.
* **Widen the transect instead of sweeping time.** A ±135 m transect (three
  display wavelengths) at the same station and clock reads 3.46 m against
  the envelope's 5.27 m, because height also falls off away from the break
  line — a spatial max over deep water is not the local envelope.

Tell: whenever a number is sampled at a spacing set by one period of a
system and is *about* another, write both periods down and compare them
before reading the number. If the sample interval is not a whole number of
the fast period, the reducer has to span one — `crest±T/2` here.
Corollary of lesson 8c (a summary statistic needs its domain checked): the
domain of a reducer includes the time window, not only the spatial extent.
## 13. A denominator must be checked for a domain, not just for a value

The 2026-08-18 QA contact sheet reported Privates drawing a **5.20 m crest
at the aim station (5.32 m stage-wide)
against a `crestCeilM` of 2.34 m — 2.2× over its depth limit**, the only site
on the sheet in apparent violation. The number was real, reproducible, and
read straight off the GPU. It measured nothing.

`crestCeilM` is `0.8·VIS·min(H₀·K_s, γh)`, and everything after `min` depends
on `h = modelDepthM(xz)`. Privates has no measured bed (its coastline defeats
the contour fit at 16.5 m RMS), so it runs `u_depthMix = 0` — and `bedElevM`
is **not gated by that switch**. It samples `u_bed`, which `applyBed` binds to
`bed.js`'s 1×1 all-zeros `EMPTY_BED` stand-in. `bedTexel` decodes `unit = 0`
and returns `u_bedElev.x`: the **low edge of the RGBA8 quantization window**,
−30 m NAVD88. That is a storage constant describing the format, not a seabed.

So along the whole synthetic stage:

* `modelDepthM` = 0.905 − (−30.0) = **30.905 m, at every station** — measured
  back off the GPU at 576 station-reads, constant to 3 decimals.
* `γh` = 24.1 m, which `min` therefore **never selects**. The depth-limited
  branch is unreachable.
* `crestCeilM` collapses to `0.8·VIS·H₀·K_s(30.9 m)` = **1.878·H₀**. Checked
  against the shipped sheet: 1.878 × 1.245 = 2.338, i.e. the reported "2.34 m
  ceiling" exactly.
* the crest above it came from `ocean()`'s `growSyn` branch, which contains no
  depth term at all.

The ratio divided a depth-free crest by a rescaled swell height and printed it
as a breaking-limit breach.

**The obvious tell is not the tell, and checking that mattered.** The first
draft of this entry said the giveaway was that `ceilM` came back identical at
all eleven stations and all five clocks — a depth-limited ceiling that does not
vary with depth. That reads well and it is wrong: the sheet's per-station
`ceil` is constant at *every* site, mapped ones included (Sewers 4.92 at all
eleven, Sharks 4.64 at all eleven), because `probeStage` reduces by `max` over
a wide shore-normal transect and the max always lands on the deepest sample at
the seaward end, where the bed is doing much the same thing at every x along a
contour-following line. So constancy is a property of the *reduction*, not a
symptom of the defect, and a rule phrased on it would have cleared Privates and
convicted nobody.

The real tell is **which branch of the `min` is selected**. At every mapped
site the ceiling is `γh` — a depth. At Privates it is `H₀·K_s` to the last
decimal, because `γh` there is 24.1 m, a depth no surf zone has. One line of
arithmetic on the reported number, not an eyeball on its variance.

(Second finding, recorded in passing: because the sheet takes the transect
`max`, its `ceilM` is the ceiling at the deep end of the window rather than at
the breaking station, which is why the sheet's mapped fills run 1.04–1.14 while
the station-resolved `measure_pocket_crest.mjs` gives 0.99–1.07 on the same
model. Two instruments, two domains — lesson 8c again.)

And the crest it condemned was never anomalous. At the same January day
(H₀ = 1.245 m) the seven sites draw 4.99, 5.09, 5.16, 5.17, 5.19, 5.32 and
5.32 m — Privates is tied for the largest and inside the spread. Only its
denominator was different. The same sheet also refutes the companion claim
that the mapped sites "sit at or below their ceiling": their set-peak fills are
**1.042–1.144**, all above 1.0, as `docs/CONTROLS.md` already says they should
be (`crestCeilM` is a reference height, not a clamp).

Lesson 8c said to check what a summary is summarising **over**. This is its
sibling one level down: check that the quantity a denominator is derived from
is *in play at all* under the configuration being measured. A number computed
from a switched-off code path is not a weak measurement — it is not a
measurement. And it arrives wearing the same units, the same field name and the
same three decimal places as the real thing, so nothing about its *presentation*
will ever flag it. Only tracing the inputs will.

Fix, 2026-08-19 (a): the validity test lives in the probe, not in the reader.
`curlProbe` emits the ceiling only when `u_depthMix > 0.5` and otherwise
returns `ceil: null` with `bedBacked: false`; `measure_pocket_crest.mjs`,
`build_qa_sheets.mjs` and `capture_drop_ab.mjs` carry the null through as
`n/a` and refuse to form `fill`. This is the honesty the pixel corridor on the
same row was already practising for the same reason — no baked line, so `n/a`.
The shader term is untouched; the instrument channel is what was wrong.

**The residue, recorded not fixed.** `dropMag`'s bend line (`0.35·crestCeilM`,
`#drop`) and `#curl`'s (`0.35·hCrest`, plus its `sigZ` band width) read that
same degenerate reference at a synthetic site. Measured: `#drop` is **exactly
inert at Privates** — ξ = 0.35 puts `plunge = smoothstep(0.45, 1.25, ξ)` at 0,
so `dropMag` is 0 in both arms, and default vs `#drop=legacy` is bit-identical
over 576 station-reads (0 differing fields). That is luck of the preset, not
design: any synthetic site with ξ ≥ 0.45 would key a shipped geometry term to
`1.878·H₀`. `#curl` (opt-in, default off) is **not** inert — 133 differing
fields at Privates. Neither was changed here. There is no measured bed at
Privates, so any replacement reference would be unvalidatable taste, and
repairing an output nobody can check is lesson 8's mistake with the sign
flipped. `tests/depth-model.test.js` pins the hazard where it can actually be
caught — no shipped preset may combine `geoSpot: null` with ξ ≥ 0.45.

## 14. A threshold cannot remove a knife-edge — it chooses which quantity carries one

Four interventions have now been built against the low-H₀ break-line branch
flips, and the fourth is the one that explains the other three.

The flips are real and they are everywhere: **all six mapped spots** jump
discontinuously at a spot-specific H₀ — 35–172 m of line, 19–78% of stage
stations, for a 0.01 m step (`scripts/measure_branch_flip.mjs`, threshold table
in TODO 1c'-d). No hysteresis: up-sweep and down-sweep are **bit-identical at
211 paired steps**, because the bake's cache key carries H₀ and nothing in the
selection remembers the previous bake.

Tracing it down, each layer relocated the defect rather than containing it
(lesson 7 again, three times in one night):

* **Not the anchor.** At five of six spots the seed station has ONE crossing on
  both sides of the threshold and it moves smoothly; at the sixth the anchor is
  simply one of the stations that loses a crossing. In no case does the anchor
  re-rank a set that persisted. (The anchor *band* was already falsified in
  1c'-c.2 for a different reason.)
* **Not the greedy propagation, and this is the surprise.** Over the identical
  candidate lattice, a **Viterbi global minimum-total-|Δz| path** — the exact
  non-greedy version of the same continuity claim — has *more* flip steps than
  the shipped greedy rule at five of six spots (Sewers 13 vs 1, The Hook 11 vs
  4, Jack's 10 vs 3), as do seaward-most and shoreward-most. Greedy-from-anchor
  is **already the best of the four**. A global optimum is not a stable one: it
  is free to re-route the whole line when the lattice twitches, whereas an
  anchored greedy walk is pinned at one end. (The replica used for this was
  validated against the real bake first — max 1.5 m over 318 bakes, all of it
  the 1 m readback grid against a 4.72 m texel — because a selection replica
  that does not reproduce the shipped line certifies itself, lesson 4.)
* **It is the candidate set.** `markBreakCrossings` returns **onsets**, and an
  onset is born or dies when a negative dip in `H₀Kₛ − γh` crosses zero. The
  dips that vanish at the six thresholds measure **−0.002 to −0.144 m** — the
  criterion grazing zero at **0.1–0.7% of its own scale**, on a bed whose
  elevation residual is 0.31–0.93 m and which the same file already notes
  displaces the crossing 22–70 m. One break was being split into two branches
  over three millimetres of wave height.

So the obvious repair: require a dip to be a *real* un-breaking before it starts
a new branch (`#merge=`, threshold derived as γ × the bed's own residual). It
was built, proven live, and **falsified**. Raising the threshold does not remove
a single flip — it slides the threshold H₀ down (Sewers 1.65→1.55, First Peak
1.30→1.20) and **raises the flip count** (Sewers 1→4, The Hook 4→6), while the
largest jump stays put (172→166 m) and every card α is unchanged to 0.1°.

**Why, and this is the transferable part.** The onset count flips when the dip
crosses 0. Put a threshold *m* on it and the count flips when the dip crosses
−*m*. The knife-edge did not go away; it moved onto a different level set of the
same continuous field — and *m* introduced a second discontinuity, the merge
decision itself, which is why the count went up rather than sideways.

Lesson 8 says: when repairing the output keeps failing, change which physics
gets selected. Its corollary says the declaration has to be in the same
neighbourhood as the candidates. This is the next constraint down: **any rule
that reduces a continuous field to a discrete choice has a knife-edge
somewhere, and no amount of threshold tuning deletes it.** Selection-layer work
on this line is now exhausted for a fourth time and for the first time with a
reason that predicts the failure instead of describing it. Removing the
discontinuity requires not selecting discretely at all — or accepting it and
declaring what the model does on each side.

### 14b. A measured threshold's *basis* is part of the threshold (2026-08-20)

Acting on 14's conclusion — accept the discontinuity, declare which side the
model draws on — produced two more findings, both from the same mistake in
different clothes: **reading a number off a table without re-reading what it is
a number about.**

* **The flip is not the floor.** The 1c'-d table gives Second Peak a threshold
  at 1.02→1.03, and it is real. It is also a branch change from α **2.6° to
  3.7°**, against a 41° target — two closeouts. Clamping to it would have cost
  two thirds of that spot's seasonal range and bought no peel. Its peel returns
  at 1.07→1.08 (9.1 → 14.4). A floor is defined by the quantity it is a floor
  *on*. The table's column heading said "threshold H₀", not "the peel returns
  here", and the two are the same thing at five of six spots — which is exactly
  how the sixth gets missed.
* **The ladder is one slice of a surface.** The thresholds were measured at tide
  0 and each site's card period. The first build applied them to `#day=` too,
  where T and tide both move. Measured result: clamping `#day=small` (T 9, tide
  +0.35) *up* to the tide-0 floor took Sewers from α **12.8 to 3.9** and The
  Hook from **10.4 to 5.9** — the clamp manufacturing two of the closeouts it
  was written to prevent, on states that had been healthy. This is lesson 13
  arriving from the other direction: there the denominator was computed from a
  switched-off code path, here the number was computed from an ocean that is not
  the one on screen. Same tell, and the same fix: carry the basis with the
  number and refuse outside it (`peelFloorH0()` returns null off-basis).

The general form: **a threshold measured along one axis of a multi-parameter
field describes a point on that axis, not a boundary in the field.** Before
applying one, write down every parameter that was held fixed while it was
measured, and check each against the state you are about to apply it to.

Corollary worth its own line: **a negative result has a range, and the range is
part of the result.** The 2026-08-19 `#lipn` note recorded "an H₀ sweep
0.40→1.60 m in 0.05 steps found **no threshold**" at Sewers, and concluded its
closeout was a separate, thresholdless defect. Sewers' threshold is at **1.605**
— that sweep stopped one step short of it. The sweep was correct, the arithmetic
was correct, and the conclusion drawn from it was wrong, because a bounded
search that finds nothing establishes nothing outside its bounds. State the
bound with the null.

## 15. A sequence sampled over one whole period of its own subject shows nothing

Sibling of lesson 12, one level up. There the reducer's window was wrong for the
carrier; here the *layout* was.

The QA break sheet is five columns of one wave breaking. Its columns spanned one
full wave period T at T/5 each — an obvious-looking choice, and the sheet was
unreadable. Andy, looking at the published page: *"it's hard to see what's
happening here… which wave are we tracking?"*

**A crest advances exactly one crest spacing per period.** So column *k* sat
*k*/5 of a spacing along, and column 5 sat **0.80 of a spacing on — 0.20 from
where the next wave upstream had been in column 1**. The sequence very nearly
aliased back onto itself, and the five frames were five near-identical parallel
lines with no identifiable subject.

The part worth carrying: **that ratio is not a measurement and not a property of
the site.** advance ÷ spacing = Δt ÷ T, and the local wavelength cancels out of
it exactly. So it was 0.80 on every row of the sheet, at every camera, at every
H₀ — including rows where the local crest spacing differs by 5× (15.5 m at
`day=small`'s aim station against 82.4 m at `day=big`'s, both against a 90 m
deep-water Λ). No amount of looking at one row could have found it, and no
per-site tuning could have fixed it. **Whenever a sequence samples a periodic
subject, write down the sample interval as a fraction of the subject's own
period before choosing anything else.** If that fraction approaches 1, the last
frame is the first frame.

And it is not only arithmetic — the sheet's own subject can be watched doing it.
Laid out over a full T, the tracked breakpoint's world x across the five columns
reads `36/56/88/4/36` at `day=small`, `56/72/92/44/56` at `day=modelcard` and
`52/76/16/36/52` at `h0=2.5`: **three rows where column 5 lands on column 1's
station to the metre**, having wrapped through the stage in between. Over T/4
the same rows read `37/43/46/50/55`, `58/62/66/70/74` and `50/54/58/66/74` —
monotone, and nowhere near their own start.

Three things this cost, all avoidable:

* **A whole-period span is the worst case, not the natural one.** "Cover one
  full cycle" is the instinct, and it is exactly the layout that guarantees the
  ends match. The natural span is however much of the cycle the *change you are
  showing* needs.
* **The subject was the wrong quantity.** The sheet is about a POINT BREAK, and
  what a point break does is peel: the breakpoint travels along the line at
  Vp = c/sin α, **faster than the wave**. Over T/4 the crest advances a quarter
  of a spacing while the model's own zipper locus travels 37→55 m of line at
  `day=small` (+17.6 m in 2.25 s) and 42→88 m at `day=big` (+46.3 m in 4.25 s).
  Sampling the slow quantity over a period of the fast one had it backwards.
* **The span has an upper bound from the other side too, and it is not the
  aliasing.** Measured (`scripts/measure_break_sequence.mjs`): at `day=big` the
  tracked wave has **peeled off the stage end by about 0.35 T** — its pocket
  goes 0.99 → 0.00 between 0.30 T and 0.40 T — so a longer sheet loses its own
  subject in the last columns whether or not it aliases. Two bounds from two
  unrelated mechanisms, and the shorter one wins.

Fix: span T/4 (columns T/16), and **mark the tracked wave**. The marker is
computed from the model — the argmax of `pocket` along the break line, which the
shader's own comment calls the zipper's locus, with a continuity term across
columns — and projected through the live camera matrices, so it is falsifiable
rather than decorative. It carries its own error bar: `markerOffM` is the
distance from the ring to the tallest displaced surface point on a shore-normal
transect at the same station, i.e. the same crest read through a different
reduction. Worst case over the shipped sheet is **5.36 m (33.6 px)**, at
`h0=0.7` — which is the low-H₀ branch collapse (stage α 4.3°, a near-closeout
below Second Peak's 1.08 m peel floor) showing up as the zipper locus and the
crest maximum coming apart, exactly what an instrumented marker is for.

Related, and the reason this is not lesson 1 again: **a still cannot support a
claim about motion, but an ordered set of stills with model-derived clocks can
support a claim about positions.** Each cell states where the breakpoint is at a
clock the model chose; the row states the difference between two such reads.
Nothing is measured off the pictures. Lesson 1's third failure — "peel direction
is rightward, confirmed across two frames" — failed because frame order was
never established. Here it is established by construction, and that is the whole
difference.

Framing, recorded because it was the tempting wrong answer: the cells are
**cropped**, not re-shot from a tighter camera. Moving the camera to frame the
wave would make the instrument frame itself on the signal (lesson 11) and would
void the sheet's `camDriftM` guarantee. A crop is a pixel operation on an
already-captured frame, identical across a row, so the camera stays where it
was, the drift stays 0.00 m, and each cell's hash still reopens the full state.
