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

Fix, 2026-08-19: the validity test lives in the probe, not in the reader.
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
