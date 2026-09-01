# The reef fit's two metrics, measured against each other (2026-09-01)

*Companion to `BREAK_FIELD_2026-09-01.md` (the instrument) and
`CUDEM_BED_2026-09-01.md` §4 (where the disagreement was first tabulated).
Nothing here changes a shipped default: `web-three/js/bed.js`, `shared/params.js`
and `docs/NEXT_INVESTMENTS.md` are untouched. Every number comes from
`scripts/measure_reef_fit_signed.mjs`, which runs the bake's own code headless
and re-derives the shipped fit after every section (§6).*

## Why

`reefFitFor()` fits the synthetic wedge's strike β so that an **unsigned** line
bearing — `atan|mean dz/dx|` of the raw seaward-most march over five stations at
x = −16 … 16 m — hits the preset's α target, and reports
`fitMetric: 'legacy-break-line-bearing', canonicalFitDeferred: true`. The runtime
judges the wave by the **signed** crest-relative α of the baked, selected,
slew-clamped line (`derivedAlphaDeg`, reduced by `stageAlpha().medianClean`).
At the card ocean the two disagree: Second Peak fits 41.0 against 41 while the
signed metric reads 25.8 with 19 reversed stations; First Peak fits 50.3 while
the signed metric reads 60.7. The direct refit against the signed metric was
tried in August and deferred because "Second Peak reverses through a closeout";
NEXT_INVESTMENTS §1 (verdict 2026-09-01) now gates that refit on the
reef-extent question. This note measures the disagreement station by station,
reproduces the deferred refit, tests objectives that cannot buy magnitude with
handedness, and tests reef extent and wedge shape directly.

**Verdict in one paragraph.** The disagreement has three causes, and only one of
them is the fit's metric. (1) **The abs.** At Second Peak the shipped fit's own
mean slope is **−0.868 (−41.0°)**: the five-station window line runs seaward as
x increases, `Math.abs` reports 40.96 against 41, and the fit records
`signViolations: 2` without rejecting. The other five spots fit with positive
slopes. (2) **Slew ramps.** Every on-reef reversal at every spot, at every β in
3–80°, sits on the clean shoulders of a slew-clamped branch teleport; **off the
ramps the shipped line has zero on-reef reversals at all six spots**. The
"no clean/on-reef station reverses" gate is unsatisfiable by any β not because
the wave peels left but because every strike produces at least one branch
change on the stage. (3) **Reef extent, at Second Peak only.** Its stage starts
at −57 m, so `reefWindowKnots` puts the up-point feather at −57 … 18 m — over
the fit window, the anchor, the branch handoff and every reversal. No β reaches
41° signed on the shipped window (max 27.2°; the on-reef stations away from
the ramp read 45.5°). Moving the feathers outside the stage so the plateau
covers it makes 41.5° reachable at β 49 with zero ramp stations, zero pinned
stations and 2 reversed stations at the stage's up-point edge, or 37.5° at
β 43 with none; wedge amplitude does nothing there (6.0 m: identical
numbers) and flank alone reaches 40.3° only with 32 ramp stations. So: **no
objective on the shipped reef geometry closes the gap at every spot**; a signed
stage-median objective closes five of six within 5° while moving activation
≤ 0.04 m and the floor ≤ 0.05 m; Second Peak is blocked by the reef window,
which is the "gated on reef extent" claim confirmed in a precise form — the
gate is the window's feather inside the stage, not the wedge's amplitude and
not the selector.

## 1. The instrument

`scripts/measure_reef_fit_signed.mjs` (Node ESM, headless). It imports
`measure_break_activation.mjs` — the field/replica/bake instrument whose gate
reproduces `bakeBreakLine` bit-for-bit — and exposes `bed.js` internals
(`makeReefFn`, `marchBreakFn`, the fit's geometry rules, the caches) through a
`node:module` **load hook** that appends one export to the module source at
load time. The file on disk is untouched; no copy of `bed.js` exists.

A candidate reef at strike β is built with the shipped fit's own geometry
(`h_b`, crest depth, `targetEl`, `zRef` on the natural h_b contour at
`REEF_ANCHOR_X`, seed, window), injected into the fit cache with every reef,
bake and **refraction** cache cleared (`refractionCacheKey` does not carry the
reef, and Ψ is integrated over the composite bed), and run through
`instrumentState()` — the real `bakeRefraction` + `bakeBreakLine`, read back on
the 2 m stage grid, with the replica-equals-bake gate at every evaluation.
At the shipped β the constructor reproduces the shipped composite checksum,
the shipped line and the shipped legacy bearing to 1e−9° at all six spots.

Per station the profile records z, signed α, pinned (stageAlpha's backward
slope ≥ 2.9), the bake's gap flag, on-reef (line on the uplift footprint),
depth, local `atan|dz/dx|`, stage fraction, fit-window membership, and **ramp
membership**: a maximal contiguous run of stations whose dz/dx has one sign
and which contains at least one pinned or gap-flagged station is a slew ramp
(a branch teleport turned into a line by the 3.0 m/m clamp). Reversal = clean
on-reef station with |α| > 2° and the wrong sign for a right, the
BREAK_FIELD definition; "off-ramp" reversals exclude ramp members.

Outputs: `qa/reef-fit-signed/report.md` (committed), `summary.json`, per-spot
station profiles (CSV), β scans and shape scans (JSON; ignored, regenerable in
about four minutes with `node scripts/measure_reef_fit_signed.mjs`).

## 2. The disagreement at the card state, shipped fit

Tide 0, card T and H₀. "fit legacy" is `fitDerivedDeg`, the unsigned bearing
the fit converged on; "fit mean slope, signed" is the same slope without the
abs; "baked window bearing" is `atan|mean slope|` of the *baked* line over
|x| ≤ 16; the signed columns are `derivedAlphaDeg` medians over clean
stations, over clean on-reef stations, over clean on-reef stations off the
ramps, and over clean off-reef stations.

| spot | target | β | fit legacy (viol) | fit slope, signed | baked window | signed clean | signed on-reef | on-reef, no ramp | off-reef | on-reef frac | rev on-reef (all; off-ramp) | pinned / ramp stations |
|---|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| Sewers | 38 | 37.0 | 37.7 (0) | +37.7 | 37.5 | 36.3 | 44.6 | 45.5 | −8.4 | 0.76 | 6 (31; **0**) | 25 / 56 |
| First Peak | 50 | 48.0 | 50.3 (0) | +50.3 | 50.9 | 60.7 | 60.7 | 63.2 | — | 1.00 | 11 (11; **0**) | 13 / 24 |
| Second Peak | 41 | 57.6 | 41.0 (2) | **−41.0** | 41.6 | 25.8 | 36.9 | 45.5 | −0.0 | 0.84 | 19 (21; **0**) | 7 / 27 |
| Jack's | 37 | 41.9 | 36.1 (0) | +36.1 | 35.5 | 37.1 | 40.8 | 40.9 | 3.8 | 0.82 | 4 (11; **0**) | 18 / 31 |
| The Hook | 41 | 55.2 | 40.6 (0) | +40.6 | 40.1 | 36.8 | 50.3 | 50.9 | −36.6 | 0.70 | 7 (42; **0**) | 19 / 62 |
| Sharks | 36 | 43.3 | 36.8 (0) | +36.8 | 36.8 | 30.5 | 38.2 | 39.0 | 0.5 | 0.73 | 7 (24; **0**) | 15 / 40 |

Where the reversals sit (clean stations, all; on-reef in parentheses):

| spot | reversed runs, x [m] × stations | stage third | off-reef | on a slew ramp | inside the fit window |
|---|---|---|---:|---|---:|
| Sewers | [−191, −143] × 25 (0 on reef); [−91, −81] × 6 | up 25 / mid 6 / down 0 | 25 | 31 (6 on reef) | 0 |
| First Peak | [−66, −54] × 7; [−26, −20] × 4 | up 7 / mid 4 / down 0 | 0 | 11 (11 on reef) | 0 |
| Second Peak | [−45, −21] × 13; [−5, 5] × 6; [143, 145] × 2 (0 on reef) | up 19 / mid 0 / down 2 | 2 | 19 (19 on reef) | **6** |
| Jack's | [−127, −115] × 7 (0 on reef); [−77, −71] × 4 | up 11 / mid 0 / down 0 | 7 | 11 (4 on reef) | 0 |
| The Hook | [−165, −97] × 35 (0 on reef); [−57, −45] × 7 | up 35 / mid 7 / down 0 | 35 | 42 (7 on reef) | 0 |
| Sharks | [−124, −86] × 20 (3 on reef); [−54, −48] × 4 | up 24 / mid 0 / down 0 | 17 | 24 (7 on reef) | 0 |

Three things to read off.

1. **Every on-reef reversal is a ramp shoulder.** At all six spots the
   "off-ramp" count is 0: the clean stations that read left-handed are the
   two ends of a slew-clamped branch teleport, where the line is still running
   seaward (dz/dx < 0) but the slope has fallen below the 2.9 pinned
   threshold. The pinned core is excluded from `medianClean`; its shoulders
   are not. The long off-reef runs (Sewers 25, The Hook 35, Sharks 17) are the
   up-point end of the stage where the line has left the wedge and follows the
   natural bed at −8 … −37°. Both are already documented mechanisms
   (MEASUREMENT_LESSONS 8, 14); what is new is that they account for **all**
   of the reversal count.

2. **The stage-wide median is a domain artefact at four spots** (LESSONS 8c).
   The shipped fit lands the *on-reef, off-ramp* median at 45.5 / 63.2 / 45.5
   / 40.9 / 50.9 / 39.0 against 38 / 50 / 41 / 37 / 41 / 36 — 2–13° *high* at
   five spots, 4.5° high at Second Peak — while the stage median reads low at
   Second Peak (25.8), The Hook (36.8) and Sharks (30.5) because 16–30 % of
   stage stations are off the reef and read ~0° or negative. The metric the
   floor and the HUD use mixes the reef's peel with the natural bed's
   closeout in one number.

3. **Second Peak is the one spot where the fit itself is wrong**, not merely
   its domain. The signed mean slope is −41.0°. The raw march at the five fit
   stations is z = −81.5, −109.9, −119.8, −118.4, −111.9 m: a 38 m *seaward*
   teleport between x = −16 and −8, then a shallow right. The abs turns that
   into 40.96 and the fit converges. Along the baked line (profile CSV) the
   same handoff is an 80 m seaward run from x = −45 (z −40) to x = −5
   (z −119), pinned from −19 to −7, gap-flagged from −23 to −5, with the
   reversed shoulders on either side — six of them *inside* the fit window.
   The reef window there is `reefWindowKnots(−57, 157) = [−57, 18, 82, 157]`:
   the up-point feather spans −57 … 18 m and the wedge envelope `w` is 0.57
   at x = −16 and 0.998 at x = 16. **The fit window straddles the feather.** At
   the other five spots the window sits on the plateau (w ≥ 0.9). Second Peak
   is the shortest stage up-point of the anchor (x = 24), so it is the only
   spot whose fit is done where the reef is still fading in.

### 2b. Along the H₀ ladder, floor → card (tide 0, card T)

Signed clean median / on-reef median / on-reef off-ramp median / reversals
(all; off-ramp) at 0.05 m rungs from the shipped `PEEL_FLOOR` to the card.
Full 0.01 m ladders in `qa/reef-fit-signed/<key>_ladder.json`.

| spot | floor | at floor | mid-ladder | at card |
|---|---:|---|---|---|
| Sewers | 1.62 | 34.8 / 39.6 / — / 4 (36; 0) | 1.9: 39.1 / 41.9 / — / 4 (31; 0) | 2.2: 36.3 / 44.6 / 45.5 / 6 (31; 0) |
| First Peak | 1.38 | 22.1 / 32.9 / — / 10 (13; 0) | 1.6: 57.5 / 57.5 / — / 9 (9; 0) | 1.8: 60.7 / 60.7 / 63.2 / 11 (11; 0) |
| Second Peak | 1.11 | 10.6 / 26.4 / 48.9 / 14 (22; 0) | 1.3: 22.1 / 35.3 / 45.1 / 17 (22; 0) | 1.5: 25.8 / 36.9 / 45.5 / 19 (21; 0) |
| Jack's | 0.78 | 11.1 / 9.6 / 9.6 / 0 (0; 0) | 0.95: 34.7 / 39.4 / 40.0 / 2 (8; 0) | 1.1: 37.1 / 40.8 / 40.9 / 4 (11; 0) |
| The Hook | 1.09 | 12.3 / 59.7 / 60.1 / 4 (63; 0) | 1.3: 40.3 / 50.4 / 52.7 / 4 (44; 0) | 1.5: 36.8 / 50.3 / 50.9 / 7 (42; 0) |
| Sharks | 0.81 | 16.4 / 40.6 / 41.3 / 4 (31; 0) | 0.9: 29.3 / 40.7 / 41.4 / 5 (26; 0) | 1.0: 30.5 / 38.2 / 39.0 / 7 (24; 0) |

Off-ramp reversals are 0 at every rung of every ladder. At Second Peak the
on-reef off-ramp median is 45–49° from the floor to the card while the stage
median climbs 10.6 → 25.8: the peel on the reef is there at every rung; the
stage number is diluted by the same up-point handoff at every rung. First
Peak's reversals are all on-reef ramps in the up-point third at every rung.
Sewers' and The Hook's reversal counts are 31–63 off-reef stations of natural
bed at the up-point end, at every rung.

## 3. The deferred refit, reproduced

The August attempt left no code in history (`git log -S canonicalFitDeferred`
finds only the guard's introduction in `09c7f4a`, 2026-08-26). It is
reproduced here as `reefFitFor()`'s own root-finder — seed β = α − 9°, second
probe ±8°, false position when bracketed, 20° step cap, 14 evaluations, 1°
tolerance, best-so-far — with the objective replaced by a signed readout of the
fully baked line at the card state: the stage-median clean α (`stage`), or the
clean α over |x| ≤ 16 (`infit`, `stageAlpha().inFit`).

| spot | objective | β shipped → refit | evals | converged | signed clean | on-reef | reversals shipped → refit | on-reef frac |
|---|---|---|---:|---|---:|---:|---|---|
| Sewers | stage | 37.0 → 38.2 | 3 | yes | 38.3 | 46.1 | 6 → 6 | 0.76 → 0.76 |
| First Peak | stage | 48.0 → 40.0 | 3 | yes | 50.2 | 50.2 | 11 → 9 | 1.00 → 1.00 |
| **Second Peak** | stage | 57.6 → 60.0 | **14** | **no** | **27.2** | 38.8 | 19 → 17 | 0.84 → 0.84 |
| Jack's | stage | 41.9 → 38.6 | 3 | yes | 36.7 | 38.1 | 4 → 5 | 0.82 → 0.85 |
| The Hook | stage | 55.2 → 41.7 | 3 | yes | 40.5 | 42.7 | 7 → 5 | 0.70 → 0.82 |
| Sharks | stage | 43.3 → 47.8 | 14 | no | 31.3 | 41.8 | 7 → 4 | 0.73 → 0.69 |
| **Second Peak** | infit | 57.6 → 32.0 | 14 | no | 26.2 | 26.3 | 19 → **24** | 0.84 → 0.98 |

Second Peak under the `stage` objective walks β 32 → 40 → 20 → 40 → 60 → 80
→ … and never gets closer than 27.2° (β 60): the objective is flat in β
between 20 and 60 (25.3–26.2°) and falls to 4.3° at 80. Under the `infit`
objective it reads **−0.3 to −8°** at every β tried (the fit window *is* the
handoff), and the best-so-far lands at β 32 with **24 reversed stations,
0.98 on-reef and 0 pinned** — the seaward run is no longer steep enough to be
pinned, so the whole handoff becomes clean reversed stations. That is the
"reverses through a closeout" the guard describes, with numbers: the refit
does not make the wave a left; it moves the strike to where the branch handoff
is no longer caught by the slew clamp and the reversal count doubles. Sharks
fails the same way more mildly (best 31.3° at β 47.8, non-convergent). Four
spots converge in three evaluations to within 0.5° with β moving ≤ 13.5°.

## 4. Objectives that cannot buy magnitude with handedness

One β scan per spot at the card state, 3–80° at 1° refined to 0.25° around
each optimum; every objective is read off the same scan (`<key>_scan.json`).

| | definition |
|---|---|
| O2 | signed clean median over on-reef stations = target; **infeasible** if any on-reef reversal; ≥ 50 % of the stage on the reef (the floor's own reef condition) |
| O2′ | O2 with slew-ramp stations excluded from the domain |
| O3 | the legacy (unsigned) root, rejected if the signed stage median disagrees with it by more than 5° |
| O4 | two-stage: legacy β, then β within ±10° minimising \|signed stage median − target\| without increasing the reversal count |
| O5 | the legacy objective with its sign kept: `atan(mean slope)` = +target |

| spot | target | shipped | O2 | O2′ | O3 | O4 | O5 |
|---|---:|---|---|---|---|---|---|
| Sewers | 38 | β 37.0: 36.3, rev 6 | **infeasible** (min rev 2 at any β) | β 31.75: 29.0 (no-ramp on-reef 38.2), rev 12 | β 37.25: 36.7, legacy 38.0, Δ −1.3, **passes** | β 38.00: 37.9, rev 6 | β 37.25 (near root): 36.7 |
| First Peak | 50 | β 48.0: 60.7, rev 11 | infeasible (min 8) | β 37.75: 46.9 (50.1), rev 8 | roots β 47.75 (Δ +10.3), β 60.0 (Δ +13.0): **none passes** | β 40.50: 49.8, rev 10 | β 47.75 (near root): 60.2 |
| Second Peak | 41 | β 57.6: 25.8, rev 19 | infeasible (min 12) | β 52.50: 23.9 (41.2), rev 25 | root β 57.5 (Δ −14.9): **none passes** | β 59.75: 27.3, rev 17 | **no root** (signed legacy never reaches +41 on the shipped window) |
| Jack's | 37 | β 41.9: 37.1, rev 4 | infeasible (min 3) | β 36.75: 34.8 (37.0), rev 9 | β 42.50: 37.5, legacy 37.1, **passes** | β 41.50: 36.9, rev 4 | β 42.50: 37.5 |
| The Hook | 41 | β 55.2: 36.8, rev 7 | infeasible (min 4) | β 39.00: 39.3 (41.0), rev 6 | roots β 55.5 (Δ −5.1), β 66.75 (Δ −25.2): none passes | β 52.25: 40.7, rev 6 | β 55.50: 35.8 |
| Sharks | 36 | β 43.3: 30.5, rev 7 | infeasible (min 3) | β 39.75: 29.3 (36.1), rev 12 | roots β 42.5 (Δ −5.3), β 72.5 (Δ −27.6): none passes | β 46.50: 31.8, rev 3 | β 42.50: 30.8 |

("signed" = stage-median clean α; O2′'s parenthesis is the on-reef off-ramp
median it optimised. O5's scan picker returned a far root at Sewers (β 73,
−13.3°) and First Peak (β 60, 63.0°); the near roots quoted are also roots and
are what the shipped secant, seeded at α − 9°, would find.)

What the scan says about reachability on the shipped reef, per spot:

| spot | β with signed stage median within 5° of target | β with zero on-reef reversals | β with zero *off-ramp* on-reef reversals | max signed: stage / on-reef / on-reef off-ramp |
|---|---|---|---|---|
| Sewers | 35–41, 56 | none | 8–52, 65–80 | 56.5 / 82.8 / 81.6 |
| First Peak | 36–43, 61 | none | 20–80 | 68.5 / 68.5 / 73.3 |
| Second Peak | **none** | none | 46–80 | **27.2** / 46.8 / 58.5 |
| Jack's | 33–54 | none | 20–80 | 38.0 / 53.9 / 56.2 |
| The Hook | 34–55 | none | 3–4, 12–80 | 43.0 / 58.8 / 66.6 |
| Sharks | 46–50 | none | 22–80 | 31.7 / 54.9 / 55.6 |

- **O2 is infeasible everywhere**, and O2′ shows why: with ramps excluded the
  feasible β set is most of the range. The reversal gate as written in
  NEXT_INVESTMENTS §1 ("no clean/on-reef station reverses") is unsatisfiable
  by any strike on this bed because every β leaves at least one branch
  handoff on the stage, and the handoff's shoulders are clean stations. The
  gate needs the ramp exclusion to be a test of handedness rather than a test
  of whether the field has one component (it does not; BREAK_FIELD §2).
- **O3 passes at two spots** (Sewers, Jack's) and would reject the shipped fit
  at four. It is a gate, not a fit: at Second Peak the only legacy root is
  the shipped one, so rejecting it leaves nothing.
- **O4 closes five spots within 0.3°** with β moving 0.4–7.5° (Sewers 38.0,
  First Peak 40.5, Jack's 41.5, The Hook 52.25, Sharks 46.5) and does not
  increase reversals; at Second Peak the bound reaches 27.3°.
- **O5 fails honestly at Second Peak**: the signed legacy bearing has no root
  at +41 on the shipped window, so the fit would report a miss instead of
  certifying a left-bearing line as 40.96°. At the other five spots O5's near
  root is within 0.3° of the shipped β. It is the smallest possible change to
  `reefFitFor` and it converts the Second Peak defect from silent to loud; it
  does not fix it.

### 4b. Activation H₀ and the peel floor under each candidate

`reefActivationH0` (selector-free) and `measurePeelFloor` (BREAK_FIELD §4
criterion, 0.40 → card at 0.01 m, tide 0, card T) with the candidate reef
injected; the replica-equals-bake gate was 0 m / 0 mismatches at every rung.

| spot | candidate | β | activation H₀ | floor (peel returns) | shipped floor | largest flip | flips | card signed α |
|---|---|---:|---:|---:|---:|---|---:|---:|
| Sewers | shipped | 37.00 | 1.239 | 1.62 | 1.62 | 1.61→1.62 (164 m) | 1 | 36.3 |
| | O4 | 38.00 | 1.243 | 1.62 | | 1.61→1.62 (168 m) | 1 | 37.9 |
| | naive/stage | 38.24 | 1.242 | 1.62 | | 1.61→1.62 (162 m) | 1 | 38.3 |
| First Peak | shipped | 47.97 | 1.143 | 1.38 | 1.38 | 1.27→1.28 (75 m) | 4 | 60.7 |
| | O4 | 40.50 | 1.157 | 1.40 | | 1.27→1.28 (76 m) | 1 | 49.8 |
| | naive/stage | 39.95 | 1.157 | 1.41 | | 1.27→1.28 (76 m) | 1 | 50.2 |
| Second Peak | shipped | 57.59 | 1.003 | 1.11 | 1.11 | 1.04→1.05 (40 m) | 2 | 25.8 |
| | O4 | 59.75 | 1.003 | 1.11 | | 1.04→1.05 (39 m) | 2 | 27.3 |
| | naive/stage | 60.00 | 1.003 | 1.11 | | 1.04→1.05 (38 m) | 2 | 27.2 |
| Jack's | shipped | 41.91 | 0.616 | 0.78 | 0.78 | 0.83→0.84 (130 m) | 3 | 37.1 |
| | O4 | 41.50 | 0.616 | 0.78 | | 0.83→0.84 (130 m) | 3 | 36.9 |
| | naive/stage | 38.59 | 0.619 | 0.78 | | 0.82→0.83 (120 m) | 4 | 36.7 |
| The Hook | shipped | 55.22 | 0.916 | 1.09 | 1.09 | 1.03→1.04 (112 m) | 4 | 36.8 |
| | O4 | 52.25 | 0.914 | 1.10 | | 1.01→1.02 (110 m) | 2 | 40.7 |
| | naive/stage | 41.73 | 0.913 | 1.05 | | 1.11→1.12 (118 m) | 3 | 40.5 |
| Sharks | shipped | 43.29 | 0.726 | 0.81 | 0.81 | 0.79→0.80 (73 m) | 2 | 30.5 |
| | O4 | 46.50 | 0.686 | 0.80 | | 0.79→0.80 (83 m) | 2 | 31.8 |
| | naive/stage | 47.76 | 0.661 | 0.81 | | 0.80→0.81 (92 m) | 3 | 31.3 |

Activation moves ≤ 0.02 m at five spots (Sharks 0.04–0.07 m: β rotates the
footprint off the shallow patch that activates it) and the floor ≤ 0.05 m;
the largest-flip rung is unchanged at five spots. **The strike is not what
the floor and activation depend on** — they are properties of the wedge's
crest depth and the bed (CUDEM_BED §4.4), and a refit of β would not move
them beyond their measured basis. Full table with O2's nearest-infeasible, O3
and O5 rows in `qa/reef-fit-signed/report.md` §2c.

## 5. Reef extent and wedge shape

Six variants of the reef, each with a 2° β scan at the card state: the shipped
window/shape; the window with its feathers moved *outside* the stage so the
plateau covers it (`[s₀ − f, s₀, s₁, s₁ + f]`, extent not amplitude);
flank 120 m (shipped 80); amplitude 6.0 m (shipped 3.2, `reefamp`); and the
combinations. "best" = β minimising |signed stage median − target| with zero
off-ramp on-reef reversals and ≥ 50 % on reef.

| spot | variant | window knots [m] | max signed | best β: signed / on-reef; rev (off-ramp); on-reef frac; ramp; off-reef stations | strict zero-reversal β: signed | activation H₀ |
|---|---|---|---:|---|---|---:|
| Second Peak | shipped | [−57, 18, 82, 157] | 26.9 | β 60: 27.2 / 38.8; 17 (0); 0.84; 28; 16 | none | 1.003 |
| | **window: plateau covers stage** | [−132, −57, 157, 231] | **46.8** | **β 49: 41.5 / 43.8; 2 (2); 0.91; ramp 0; off-reef 9; pinned 0** — β 53.5: 43.1 / 47.1; 5 (0); 0.86; ramp 6 | **β 43: 37.5** | 1.000 |
| | flank 120 | shipped | 40.3 | β 71: 40.3 / 42.2; 18 (0); 0.96; ramp 32; pinned 14 | none | 0.995 |
| | amp 6.0 | shipped | 26.9 | identical to shipped (amplitude saturates) | none | 1.003 |
| | window + flank 120 | wide | 43.8 | β 49: 41.0 / 41.0; 2 (2); 1.00; ramp 0; off-reef 0; pinned 0 | β 45: 38.7 | 0.980 |
| Sewers | shipped | [−201, −126, 1, 76] | 55.9 | β 38: 37.9 / 45.8; 6 (0); 0.76; ramp 56; off-reef 31 | none | 1.243 |
| | window | [−276, −201, 76, 151] | 55.9 | β 38: 37.9 / 45.4; 6 (0); 0.78; ramp 54; off-reef 29 | β 9: 6.7 | 1.243 |
| | amp 6.0 | shipped | 64.1 | β 37.5: 37.8 / 44.5; 6 (0); 0.80; ramp 51 | none | 1.114 |
| First Peak | shipped | [−76, −29, 11, 57] | 68.3 | β 40.5: 49.8 / 49.8; 10 (0); 1.00; ramp 21 | none | 1.157 |
| | window | [−122, −76, 57, 103] | 54.9 | β 56.5: 50.0 / 50.0; 9 (0); 1.00; ramp 16; pinned 5 | β 31: 37.8 | 0.976 |
| Jack's | shipped | [−157, −82, 100, 175] | 38.0 | β 47: 37.2 / 44.7; 3 (0); 0.77; ramp 32; off-reef 36 | none | 0.616 |
| | window | [−232, −157, 175, 250] | 41.6 | β 37.5: 37.1 / 37.5; 6 (0); **0.97**; ramp 13; off-reef 4 | β 23: 27.6 | 0.603 |
| The Hook | shipped | [−175, −100, 59, 134] | 43.0 | β 43: 40.9 / 42.9; 6 (0); 0.81; ramp 48; off-reef 27 | none | 0.914 |
| | window | [−250, −175, 134, 209] | 41.7 | β 52.5: 41.0 / 46.5; 6 (0); 0.77; ramp 56; off-reef 34 | none | 0.914 |
| Sharks | shipped | [−134, −59, 115, 190] | 31.4 | β 50: 31.5 / 43.5; 3 (0); 0.68; ramp 42; off-reef 48 | none | 0.627 |
| | window | [−209, −134, 190, 265] | 37.4 | β 41.5: 36.0 / 37.7; 9 (0); 0.86; ramp 17; off-reef 21 | β 17: 20.4 | 0.604 |

All 36 rows in `report.md` §3. Ladders for every variant that closed within 5°
(§3b there), the ones that matter:

| spot | variant | β | activation H₀ (shipped) | floor (shipped) | largest flip (shipped) | flips (shipped) | card signed α | on-reef | rev |
|---|---|---:|---|---|---|---|---:|---:|---:|
| Second Peak | window: plateau covers stage | 53.5 | 1.000 (1.003) | 1.08 (1.11) | 1.16→1.17, 87 m (1.04→1.05, 40 m) | 3 (2) | 43.1 | 0.86 | 5 |
| Second Peak | window + flank 120 | 74.0 | 0.980 (1.003) | 1.10 (1.11) | 1.04→1.05, 38 m | 4 (2) | 41.1 | 0.98 | 8 |
| Second Peak | flank 120 | 71.0 | 0.995 | 1.14 | 1.04→1.05, 34 m | 3 | 40.3 | 0.96 | 18 |
| Sharks | window | 41.5 | 0.604 (0.726) | 0.80 (0.81) | 0.79→0.80, 149 m (73 m) | 2 (2) | 36.0 | 0.86 | 9 |
| Jack's | window | 37.5 | 0.603 (0.616) | 0.78 (0.78) | 0.83→0.84, 149 m (130 m) | 5 (3) | 37.1 | 0.97 | 6 |
| First Peak | window | 56.5 | 0.976 (1.143) | 1.37 (1.38) | 1.36→1.37, 140 m (1.27→1.28, 75 m) | 4 (4) | 50.0 | 1.00 | 9 |
| Sewers | window | 38.0 | 1.243 (1.239) | 1.55 (1.62) | 1.54→1.55, 160 m (1.61→1.62, 164 m) | 3 (1) | 37.9 | 0.78 | 6 |
| The Hook | window | 52.5 | 0.914 (0.916) | 1.10 (1.09) | 1.01→1.02, 110 m (1.03→1.04, 112 m) | 2 (4) | 41.0 | 0.77 | 6 |

Reading it:

- **At Second Peak the window is the lever and nothing else is.** Amplitude
  6.0 m reproduces the shipped numbers to the decimal (the wedge is already at
  its crest ceiling there). Flank 120 alone reaches 40.3° but by widening the
  ramp: 32 ramp stations, 14 pinned, 18 reversals. Moving the feathers outside
  the stage makes the plateau cover the fit window and the anchor; at β 49 the
  line has **no ramp, no pinned station, 91 % on reef, 41.5°**, and its 2
  reversed stations are the first genuine (off-ramp) on-reef reversals in the
  whole study: the first two stage stations, x = −47.1 and −45.1 m, reading
  −25.7° and −13.7° — a real left at the up-point edge, 4 m of it. At β 43 the
  line reads **37.5° with zero reversals of any kind** (min clean on-reef α
  +0.15°, 96 % on reef, zero ramp, zero pinned), inside the 5° band. The floor
  (measured at β 53.5, the O2′ pick) moves
  1.11 → 1.08 and a new 87 m flip appears at 1.16→1.17 between two peels
  (both sides ≥ 10°, on reef), the Jack's pattern.
- **At the other five spots the window is not the constraint.** The shipped
  window already reaches the target with β alone (§4); widening it raises the
  on-reef fraction (Jack's 0.82 → 0.97, Sharks 0.73 → 0.86) and removes the
  off-reef closeout from the stage median at Sharks (30.5 → 36.0), at the cost
  of larger flips (Sharks 73 → 149 m, First Peak 75 → 140 m) and a lower
  activation at First Peak (1.143 → 0.976) and Sharks (0.726 → 0.604). Those
  are real changes to the operating basis and would need the floor re-measured.
- **Wedge amplitude is inert** at Second Peak, First Peak (68.3 → 70.5 max),
  Jack's and Sharks, and raises Sewers' max from 55.9 to 64.1 while pulling its
  activation from 1.243 to 1.114 — the CONTROLS `reefamp` saturation note,
  confirmed on the signed metric.

## 6. Verdict

**Is there an objective that closes the gap at every spot without a reversal
anywhere and without moving activation or the floor beyond their measured
basis?** On the shipped reef geometry, **no**, for two separable reasons:

1. "Without a reversal anywhere" is unsatisfiable by construction. At every β
   at every spot the on-reef reversals are the clean shoulders of one or more
   slew-clamped branch handoffs, and no β removes every handoff from the stage
   (the field has two positive components above activation, BREAK_FIELD §2).
   With ramp stations excluded, **the shipped line already has zero on-reef
   reversals at all six spots**, and the feasible set for a signed on-reef
   objective is most of 3–80°. The acceptance gate should say "no clean,
   on-reef, off-ramp station reverses" — a ramp is a section gap, which
   MODEL.md §4.5 already classifies as not breaking, and its shoulders belong
   with it.
2. Second Peak cannot reach 41° signed at any β: max 27.2° stage-wide, while
   its on-reef off-ramp stations read 45.5° at the shipped β. The shortfall is
   the domain, and the domain is set by the reef window: the up-point feather
   (−57 … 18 m) covers the fit window, the anchor and the handoff.

**What blocks it is reef extent, in this specific form**: `reefWindowKnots`
feathers 35 % of the stage (capped at 75 m) inside each stage end, and at the
one spot whose stage is short up-point of the anchor that puts the reef's
fade-in under the fit. The "gated on reef extent" claim is **confirmed** — and
sharpened: it is the window's along-shore feather, not the wedge's amplitude
(inert) and not the selector (a continuous line does not remove the handoff,
BREAK_FIELD §5). It is also **refuted in part**: the claim's original framing
tied the refit to the selector ("until the locus is continuous"); the numbers
here say a β-only refit on the shipped geometry closes five spots today.

**What is implementable now, in order, none of it shipped here:**

1. **Keep the sign in the fit** (O5): `Math.atan(meanSlope)` instead of
   `Math.atan(Math.abs(meanSlope))`, target +α. Changes no converged β at the
   five spots that fit with positive slope (near roots within 0.3° of the
   shipped β: 37.25 / 47.75 / 42.5 / 55.5 / 42.5). At Second Peak the fit
   would report no root and `withinTol: false` instead of certifying a
   −41° window line as 40.96°. `signViolations: 2` was the only trace of this
   and it is non-blocking. Cost: Second Peak's HUD says "reef synthetic, fit
   missed" until 3 lands.
2. **Correct the reversal gate's domain** in `measure_break_activation.mjs`
   and the tests: exclude slew-ramp stations (the monotone run containing a
   pinned/gap station) from the clean set, report ramp count separately. This
   is a metric-domain fix (LESSONS 8c), not a smoother; the line does not
   move. With it, the shipped line passes "no reversal" at all six spots and
   the O2 objective becomes feasible.
3. **The reef-extent decision at Second Peak**, which is Andy's, not the
   fit's: a plateau that covers the stage means feathers at −132 … −57 and
   157 … 231 m — reef relief 75 m up-point of the OSM stage start, toward
   First Peak. Numbers if taken: β 43 for 37.5° with zero reversals, zero
   ramp, 96 % on reef; β 49–53.5 for 41.5–43.1° with 2–5 reversals (β 49's
   two are −25.7° and −13.7° at the first two stage stations) and 0–6 ramp
   stations; activation 1.000 (was 1.003), floor 1.08 (was 1.11, at β 53.5),
   a new 87 m peel-to-peel flip at 1.16→1.17. The alternative that
   stays inside the stage — flank 120 at β 71 — reads 40.3° with 18 reversals
   and 32 ramp stations and is not better than shipped on any axis but the
   headline number.
4. **Then the signed refit** (O4's numbers, or O2 with the corrected domain)
   at the five spots it closes today, with the floor re-measured per
   `--mode=floor` afterwards: β 38.0 / 40.5 / — / 41.5 / 52.25 / 46.5 for
   signed 37.9 / 49.8 / — / 36.9 / 40.7 / 31.8 against 38 / 50 / 41 / 37 / 41
   / 36; activation within 0.02 m (Sharks 0.04); floors within 0.02 m
   (Sewers, Second Peak, Jack's unchanged). Sharks stays 4° low on the stage
   median because 27 % of its stage is off the reef; its on-reef stations read
   40.9. Whether that residual is a fit miss or a domain fact is decided by
   item 2 and by whether Sharks gets the window in item 3.

**Nothing here has been looked at.** Every number is headless
(MEMORY: visual work needs his eye), and the extent change at Second Peak
moves the reef 75 m into the neighbouring stage; what it does to the drone
frame is not a question this instrument answers.

## 7. Bounds of every sweep

- Bed: the shipped NCEI 1/3″ DEM only. Card ocean (tide 0, card T and H₀) for
  every scan; ladders 0.40 → card at 0.01 m, tide 0, card T. The T and tide
  axes were not swept here (BREAK_FIELD §5.2 covers the shipped line).
- β scans 3–80° at 1° (shape probe 2°), refined to 0.25° around optima; the
  fit's own clamp is [3, 80]. Reversal threshold 2°, flip 20 m, on-reef
  threshold 5 mm of uplift, all BREAK_FIELD's.
- Shape variants: flank {80, 120}, amplitude {3.2, 6.0}, window {shipped,
  feathers outside the stage}. No nose (`REEF_NOSE_FRAC` 0, the default), no
  ridge-noise change, no crest-depth change.
- The deferred refit's exact August code is not in history; §3 reproduces its
  stated objective through the shipped root-finder.
- The shipped path: the shipped fit (β, legacy bearing, composite checksum) and
  the card line, gap flags and signed α were re-derived and compared to the
  pre-injection record after every section at every spot, identical; the
  candidate constructor reproduced the shipped reef at the shipped β at every
  spot; the replica-equals-bake gate was 0 at every evaluation (an evaluation
  that broke it would have thrown). `npm test` green (169 tests), `bed.js`
  unmodified.

## 8. Reproduce

```bash
node scripts/measure_reef_fit_signed.mjs                      # everything, ~4 min
node scripts/measure_reef_fit_signed.mjs --mode=disagree      # §2, profiles + ladders
node scripts/measure_reef_fit_signed.mjs --mode=naive         # §3
node scripts/measure_reef_fit_signed.mjs --mode=scan          # §4 (add --mode=ladders for §4b)
node scripts/measure_reef_fit_signed.mjs --mode=shape         # §5
node scripts/measure_reef_fit_signed.mjs --mode=disagree --preset=secondpeak
```

Outputs under `qa/reef-fit-signed/`: `report.md` (committed), `summary.json`,
`<key>_card.profile.csv`, `<key>_ladder.json`, `<key>_scan.json`,
`<key>_shape.json`, `<key>_naive_{stage,infit}.profile.csv` (ignored).
