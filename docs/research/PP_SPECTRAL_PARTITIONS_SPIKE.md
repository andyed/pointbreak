# Measuring set structure — a spike against a finer spectral grid

**Status: RUN 2026-08-20. OUTCOME D — the premise fails, the route is closed.**
Step 1 was decisive and the spike stopped there, as §11 says it should. The
measurement is in `data/climatology/pp_spectral_grids.json`, regenerable with
`python3 data/climatology/check_spectral_grids.py --out`, and written up in
`PP_SPECTRAL_SETS.md` §8. Steps 2–6 below were never executed.

**What was measured.** At Pleasure Point's own swell peak (T 14.5 s →
0.0690 Hz) both sources step at **0.005 Hz** — CDIP buoy 156 is *not* finer
than the SC116 MOP grid where the swell actually is. The smallest separation
either can resolve is 0.010 Hz, and the authored Δf of 0.006 Hz stays below
that floor. §6.5's proposed instrument change does not reach the question.

**The trap this nearly walked into.** The buoy carries **64 bands against the
model's 20**, which is why §6.5 expected it to be finer — and by band *count*
it plainly is. But the extra bands are at high frequency: the buoy runs to
0.58 Hz in 0.01 Hz steps, against the model's 0.4 Hz. Compare *spacing at the
frequency of interest* and the two are identical. Band count was the
misleading statistic, and a partitioning pipeline built on it would have
produced Δf estimates the grid cannot support, with a plausible provenance
story attached. Lesson 8c again: check the domain before reading the value.

**Where the buoy is genuinely better**, recorded so this is not read as a
blanket dismissal: it holds 0.005 Hz spacing from 0.025–0.095 Hz against the
model's 0.040–0.075 Hz, so short-period windswell and very long groundswell are
better resolved there, and it is in-situ rather than model output. Neither
bears on Δf.

Original spec follows unchanged, as the record of what was asked.

Naming follows the house rule: the artifact is named after the mechanism
(spectral partitions), not after the library used to compute it.

## 1. The question

**Can the authored set bandwidth Δf be measured at all — and if it can, do
measured swell partitions describe Pleasure Point's sets better than the
authored two-component beat?**

This is not a new idea. `PP_SPECTRAL_SETS.md` §6.5 already names it:

> If set structure ever needs to be measured properly, the instrument has to
> change: CDIP **buoy** spectra (station 156) are published on a finer grid
> than the MOP model output, and the temporal harness measures crest
> recurrence directly from the rendered field, which is the only path that
> observes groups rather than inferring them from a spectrum.

The spike executes the first half of that sentence. The second half — crest
recurrence from the rendered field — is a different instrument answering a
different question, and §9 says why both are wanted.

## 2. What is already settled and must not be relitigated

These are prior measured results. The spike may **extend** them with a
different instrument; it may not quietly overwrite them.

1. **Δf is unresolvable in SC116 MOP output.** The grid is 0.005 Hz, so the
   smallest resolvable separation is 0.010 Hz and the model's 0.006 Hz sits
   below the floor. This is not a processing problem. **Do not retune Δf from
   SC116 under any circumstance** (`PP_SPECTRAL_SETS.md` §1, §6.1).
2. **Bimodality is a minority state that thins with size** — 23.8% of all
   hours, 12.6% above Hs 1 m, 8.9% above 2 m. The absolute level is
   threshold-dependent (3.2–39.3% across a 3×3 threshold grid × three band
   cutoffs) and must never be quoted alone; the *trend at fixed thresholds* is
   the finding (§2, and `partitioning.threshold_caveat` in the data file).
3. **When two components exist they arrive from nearly the same direction** —
   11.4° apart at the median, p90 23.4°. A directional two-component model was
   measured and rejected; the scalar beat stands (§3, §6.3).
4. **Spectral width (ν, σ_f) is a cutoff artifact**, swinging 6.1× across
   defensible band cutoffs. It is not a continuous substitute for Δf and its
   sensitivity table, not any single value, is the result (§4).
5. **The envelope floor IS constrainable from this data** and was measured at
   0.15 (uncertainty 0.05–0.20), shipped as `#env` (§7). The spike must
   reproduce that number from the new source or explain the difference.

A spike that returns "Δf is 0.0071 Hz" without confronting (1) is wrong on its
face, and the reviewer of this work should reject it on that basis alone.

## 3. The instrument change

| | SC116 MOP (current) | CDIP buoy 156 (proposed) |
|---|---|---|
| Kind | model output at a nearshore point | in-situ measurement |
| Spectral grid | 0.005 Hz, 20 directional bands | finer — **verify before relying on it** |
| Record | 25 y hourly, 218,975 QC-passed | shorter; establish coverage |
| Location | the surf spot's own MOP point | offshore of it |

The buoy trades *locality* for *resolution*, and that trade is the whole
experiment. SC116 is the better description of the water at Pleasure Point;
buoy 156 may be the only source that can see the structure at all. Neither
supersedes the other, and the spike must report which question each answers
rather than declaring a winner.

**Verify the buoy's actual grid spacing as step 1.** The premise fails if it is
not materially finer than 0.005 Hz, and that outcome is a legitimate result
(§6, outcome D) — it would close the question rather than leave it open.

## 4. Where `wavespectra` fits, and where it does not

`wavespectra` is a build-time convenience, not the subject. It supplies a
standard `xarray` representation of E(f, θ), readers for the formats involved,
and partitioning, rotation and interpolation. Adopting it replaces hand-rolled
parsing in `build_spectral_sets.py` with a maintained implementation, which
matters mostly because partitioning is fiddly and easy to get subtly wrong.

Three hard boundaries:

- **Build-time only.** It never enters `web-three/` or `shared/`. The renderer
  keeps zero runtime dependencies (README: "no build step, plain ES modules").
- **A library cannot add resolution.** If the buoy grid is coarse, wavespectra
  will partition it just as confidently as a fine one. The floor is a property
  of the data.
- **Its partitioner is a threshold algorithm**, so lesson 5 (calibrate a
  threshold, never assume it) and lesson 14 (a threshold chooses which quantity
  carries the knife-edge) both apply. Sweep its parameters and report the
  sensitivity, exactly as §2 of the existing document does for the hand-rolled
  one. A partition count that moves with the threshold is a threshold result,
  not a sea-state result.

## 5. Method

1. **Establish the source.** Pull CDIP 156 spectra; record the frequency grid,
   directional resolution, record count, QC flags and coverage. Compare like
   for like against SC116's documented grid. Stop here and report if the grid
   is not finer (outcome D).
2. **Reproduce a known result on the new source.** Before asking anything new,
   recompute the envelope floor (§2 item 5) and the bimodality-versus-size
   trend. If the new source disagrees with the old on quantities the old source
   *could* measure, that disagreement is the finding and everything downstream
   is suspect (lesson 2: prove the probe first).
3. **Partition.** Run wavespectra's partitioning across a sweep of its
   threshold parameters, not one setting. For each partition set record Hs, Tp,
   Dp, and the separation in frequency between the two largest partitions.
4. **Answer the Δf question.** Is the frequency separation between dominant
   partitions resolvable on this grid, and what distribution does it take?
   Report the fraction of surf-relevant hours where two partitions exist at
   all — the §2 finding says most hours are unimodal, and a Δf statistic
   computed only over bimodal hours describes a minority of the record
   (lesson 8c: check the domain before reading the value).
5. **Compare against the authored model.** Authored Δf = 0.006 Hz. Where does
   it sit in the measured distribution — inside it, at an edge, or outside?
6. **Cross-check against the rendered field.** The temporal harness measures
   set cadence from the render (120.8–122.4 s by two estimators). A measured
   Δf implies a beat period; if that implied period is far from what the render
   produces at the same conditions, one of the two is wrong and the spike says
   which it suspects and why.

## 6. Pre-registered outcomes

Written before the run. Each outcome licenses exactly what is listed, and
nothing else.

**A — The grid resolves it and the authored value survives.** Measured Δf
distribution brackets 0.006 Hz. → Licenses: stating Δf as *supported by
measurement at buoy 156*, replacing the current "unresolvable at this
instrument" language. Does **not** license retuning Δf, since it is already
inside the measured range.

**B — The grid resolves it and the authored value is outside the
distribution.** → Licenses proposing a retune, as a §4.5 ownership change
(see §7), with the cost of moving set structure from authorship to physics
stated explicitly and the decision left to Andy. Requires the §5.6 cross-check
against the rendered cadence before any number is adopted.

**C — Partitions exist but Δf is not stably estimable** (e.g. the value moves
with the partitioner's threshold, as spectral width did with band cutoffs). →
Licenses one sentence: *a second, finer instrument also fails to constrain Δf,
by a different mechanism.* This is a real result and belongs in the document.
Do **not** publish a number from a swept-unstable estimator.

**D — The buoy grid is not materially finer.** → Licenses closing §6.5 as
unreachable by this route, and promoting the temporal-harness path (§9).

**E — Partitions are informative about something other than Δf** (e.g. they
describe the seasonal sea/swell split better than the current monthly p75
does). → Record it, and do not let it smuggle in a Δf claim the data cannot
support.

Outcomes C, D and E are not failures. Two of the three most-cited results in
`PP_SPECTRAL_SETS.md` are negative, and they are the reason that document is
trusted.

## 7. The ownership consequence — this is a product call, not a refactor

`MODEL.md` §4.5 assigns every quantity an owner: physics owns the field,
authorship owns the character. **Δf and the set envelope are currently
authored.** Replacing them with measured partitions moves them to physics, and
that is the same category of decision as the peel-floor clamp (§4.6): it may
be more truthful and less controllable.

Two concrete risks to state before, not after:

- The authored beat produces sets of ~5–7 waves with a legible rhythm. A
  measured partition set may produce something less regular, and "sets and
  lulls" is a mission-level behaviour of the screensaver.
- `#env`'s floor was derived *from* the two-component picture (the floor is the
  component amplitude ratio). If the two-component model is replaced, that
  derivation needs revisiting, not merely re-running.

So even outcome B does not authorise a change. It authorises a proposal.

## 8. Known traps

- **`waveTp` is band-quantised** (19 distinct values across 219k records). Use
  `waveTa`. Confirm whether the buoy product has the same defect
  (`PP_CDIP_CLIMATOLOGY.md`).
- **Threshold-dependence is the default, not the exception** here — both the
  bimodality fraction and the spectral width proved threshold artifacts. Sweep
  first, quote second (lessons 5, 14).
- **Domain before value** — any Δf statistic is conditioned on being bimodal,
  which is a minority of hours (lesson 8c, and lesson 13's denominator case).
- **Prove the probe** by reproducing a known result on the new source before
  trusting a new one (lesson 2, and §5.2 above).
- **A null is a result** (lesson 3). Outcomes C and D are pre-registered for
  exactly this reason.
- **Citations must be verified.** Anything asserted about buoy 156's grid, or
  about the partitioning algorithm's provenance, gets a checked reference in
  `refs.bib` — no library README paraphrased as a method citation.

## 9. Scope boundary and non-goals

**In scope:** a Python build-time script under `data/climatology/`, a results
section appended to `PP_SPECTRAL_SETS.md`, and a JSON artifact beside
`pp_spectral_sets.json`.

**Explicitly out of scope:**

- Any change to `shared/`, `web-three/`, or a shipped default. The spike ends
  in a document and a JSON file.
- Any renderer runtime dependency.
- **Rebuilding the deep-water field as a spectral sum.** That is the separate,
  larger question of whether the model's single carrier phase becomes a
  spectrum, and it is a rewrite of the layer every foam clock, the pocket, the
  break bookkeeping and the zipper all key to (28 consumers of `rayPhase` at
  the time of writing). The `CLAUDE.md` rule stands: if a substrate is ever
  added back, take a commodity one. This spike does not touch that decision and
  must not be cited as evidence for it.
- Retuning Δf. Even outcome B produces a proposal, not a commit.

## 10. Deliverables

1. `data/climatology/build_spectral_partitions.py` — the pull, the partition
   sweep, and the comparison. Regenerable, with its source and grid recorded in
   the output.
2. `data/climatology/pp_spectral_partitions.json` — results, including the
   threshold sweep and the coverage of the record, never a single headline
   number without its sensitivity.
3. `PP_SPECTRAL_SETS.md` §8 — the findings, written to the standard of §1–§7:
   what was measured, what it licenses, and what it cannot say.
4. This file updated with the outcome letter (A–E) and the date it was run.

## 11. Exit criteria

Stop when the outcome letter is determined, even if that takes one afternoon
and returns D. The failure mode to avoid is the one §4 of the existing document
already documents: continuing to process a dataset until a number appears,
then discovering the number was an artifact of the processing.
