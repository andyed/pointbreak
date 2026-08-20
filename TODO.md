# TODO

## 2026-08-19 — the foam field's size contract, and two things it did NOT fix

**Shipped (`#lipn=0` reverts).** The QA contact sheet's seasons rows caught
Sewers `month=august` (H₀ 0.585 m) rendering MORE whitewater than
`month=october` (H₀ 0.801 m) — foam 0.929 vs 0.385, pix 11.8% vs 4.1% — while
the wave itself was correctly small (aim-station crest 1.3 m vs January's
5.0 m). Convicted: **two foam terms sat outside the SIZE_AUDIT calibration
contract**, the model's `lipFoam` (documented "xi-owned", which is a claim
about ξ and not a substitute for size) and GRID_FRAG's pocket foam floor (a
RELATIVE claim — "never dimmer than its own trailing bore" — written as the
ABSOLUTE constant `0.72`). Both convert `pocket` straight to white, and at the
break line the pocket Gaussian is 1 so even `pockS` drops out. As H₀ falls,
every other term is attenuated toward the 0.55 clamp and foam's COMPOSITION
shifts onto terms that do not know how big the wave is. The factor is now
named once as `foamSizeAt()` in `shared/model-glsl.js` and reaches all three
routes. It is exactly 1.0 at the 1.5 m card day, so the card look is unchanged
by construction; January measured **identical to 3 dp** at all seven sites
(`foamMax`, crest, α, ceil), with only stage-mean foam moving ≤ 0.007.

**The lead was refuted, and the check is worth keeping.** This is NOT the
documented 2026-08-16 `month`/peel-collapse class. Stage α at Sewers is
6.2°/3.3°/3.5° for jan/oct/aug — flat, not collapsing — and an H₀ sweep
0.40→1.60 m in 0.05 steps found **no threshold at Sewers at all**: α moves
smoothly 12.3° → 2.9° → 9.1° and the whole-stage-in-phase state recurs at
H₀ 0.50–0.60, 0.90–1.10 and 1.55–1.60 as well.

### ▶ NOT FIXED 1 — Sewers is closed out at EVERY H₀ (blocks the sheet row)
Sewers' stage-median α sits at **3–9° against a 38° target** across the whole
sweep, so its break line is very nearly a crest line and the entire ~280 m
stage can go in phase at once: `crestNear > 0.5` at **43 of 64** stations at
the August peak clock against **3 of 64** at October. Sampled over 16 clocks
spanning one set beat, all three months saturate to foam ≈ 0.90–0.93 on their
closeout clocks — **including January** — and differ only in WHERE those
clocks fall. So the sheet's single pinned column is aliasing (MEASUREMENT
LESSONS 1: a still cannot support a claim about motion), and the beat-averaged
read is monotone after the fix (foamMax 0.444/0.335/0.330 for jan/oct/aug,
stage-mean 0.223/0.162/0.161) where before it was not (0.447/0.355/**0.346**,
stage-mean 0.228/0.180/**0.182** — inverted). **The pinned-clock inversion in
the sheet is therefore still there**, and it will stay until α at Sewers is
fixed. Tuning foam to hide it would be repair-the-output (LESSON 8).

### ▶ NOT FIXED 2 — First Peak flips branch between H₀ 1.25 and 1.26 m
Found while running the requested control sweep, and it is worse than the
Sewers case because it is a knife edge: α **1.4° → 12.1° → 30.1° → 43.7°** and
stage-max crest **2.93 → 5.13 m** across a **0.01 m** change in swell height.
`month=january` sets H₀ = 1.245 m, which lands **0.015 m on the collapsed
side** — which is why the QA sheet's First Peak row reads "α 50° target · 0° at
x0 · 1° stage". Second Peak has the same flip between 1.00 and 1.10 m (α 3.3°
→ 21.6°, target reached only above ~1.4), so `month=october`/`august` render it
collapsed too. With the TODO's existing Sharks ≈ 0.85 m and Jack's ≈ 0.90 m
notes, that is **five of six mapped spots with a spot-specific low-H₀ branch
flip** — one family, not four incidents. Worth one investigation, not four.

### Also made explicit, not fixed
`foamSizeAt`'s clamp means whitewater stops responding to swell height below
H₀·shelter = 0.825 m and above 2.4 m, while the `h0` control spans 0.4–3.0 m
and the SC116 summer months sit at 0.585–0.80 m. The clamp stays (a tiny day
must still show whitewater); the HUD swell row now says `foam size ×0.55 floor`
/ `×1.6 ceiling` when it binds, so the size-blind regime is no longer silent.

## Now / Next (2026-08-16)

The distilled open state. Everything below this section is the lab notebook,
kept in full as the record; blockers are marked here.

## ⚠ OPEN (2026-08-19) — the bend line has no reference on a bed-less stage

Closed for now as **instrument + documentation**, with one real residue left
deliberately unfixed. The QA sheet's "Privates draws 5.20 m against a 2.34 m
depth ceiling, 2.2× over" was an artifact: with `u_depthMix = 0` the seabed
sampler is `bed.js`'s 1×1 stand-in, `bedElevM` returns the RGBA8 quantization
floor (−30 m NAVD88), `modelDepthM` is a flat 30.905 m, `γh` never binds, and
`crestCeilM` is `1.878·H₀` — while the crest above it comes from `growSyn`,
which has no depth in it. Privates' set-peak crest (5.32 m) is in family with
all six mapped sites on the same January day (4.99–5.32 m). Done: the probe
now returns `ceil: null` / `bedBacked: false` there and every reader carries
the `n/a` through; `MEASUREMENT_LESSONS 13`; `MODEL.md` §2.2; a pinned
invariant in `tests/depth-model.test.js`.

**Still open, needs a decision, not a measurement.** `dropMag`'s bend line
(`0.35·crestCeilM`) and `#curl`'s (`0.35·hCrest`, plus `sigZ`) are *ungated*
and therefore key to that degenerate reference on any bed-less site.

- `#drop` is exactly inert at Privates today (ξ 0.35 → `plunge` = 0; both arms
  bit-identical over 576 station-reads). That is luck of the bank, and the new
  test fails the build if a `geoSpot: null` preset ever ships with ξ ≥ 0.45.
- `#curl` is **not** inert — 133 differing station fields at Privates — so if
  it is ever promoted from opt-in to default, its barrel radius and curtain
  width at Privates are set by `1.878·H₀`. **Judge that before flipping
  `#curl` on**, not after.

The reason nothing was changed in the geometry: there is no measured bed at
Privates, so any replacement reference is unvalidatable taste, and repairing an
output that no instrument can check is MEASUREMENT_LESSONS 8 with the sign
flipped. The two candidate answers when it does need deciding are (a) gate the
bend line on `u_depthMix` and fall back to a reference derived from the same
synthetic amplitude the crest is drawn from, or (b) give Privates a synthetic
*bed* rather than only a synthetic stage, which would make its ceiling real and
retire the whole class. (b) is the honest one and much the larger job.

Related, unchanged and still open from the 2026-08-18 sweep: "2/56 pocket
stations 1.4–1.7× over the ceiling" below. That is a **mapped**-site question
and this note does not touch it — but note the wider frame the seven-site run
gives it: at `month=card` the median pocket fill is 0.985–1.074 across all six
mapped sites, with 14–28 of 34–46 pocket stations above 1.0 at every one of
them. `crestCeilM` is a reference height, not a clamp, and "every mapped site
is at or below its ceiling" was never true.

## ▶ LIVE VERDICT QUEUE (2026-08-18) — nine flags waiting on Andy's eye

Nothing below has been judged live. Every one is instrumented, tested and
A/B-revertible; what none of the instruments can decide is whether it LOOKS
right. Defaults chosen per the house rule — defect fixes ship ON, new looks
ship OFF. Base state for all of them:
`#preset=sewers&cam=drone&sim=42&speed=0&controls=0` (and `cam=cliff` for the
profile calls; NOTE `cam=lineup` puts the camera inside the wave at sewers
sims 48/54 — use cliff for anything that claims a crest height).

Shipping ON — append the flag to REVERT and compare:
- `#pitch=0` — the even-map forward pitch. Faces ~60% steeper, As −0.70 vs
  target −0.72. **Costs Sewers much of its tube in profile** (pocket footprint
  x0.19–0.63; the old odd map was dilating the crest window 1.6x and the
  pocket/fold/lip were calibrated on that). THE consequential call here.
- `#drop=legacy` — pocket crest 5.34 → 7.79 m, fill 0.72 → 1.07 of the depth
  ceiling. Changes the silhouette of every PLUNGING wave (sewers, first/second
  peak, thehook, jacks); spilling spots bit-identical.
- `#env=0` — set-envelope floor 0.15. Lull H 0.40 → 1.02 m, whole-beat swing
  15.7x → 6.2x, peak row unchanged, cadence 120.8 s. Mission-level behaviour.
- `#wrap=0` — continuous crest clock. Hard foam edges: 91.6% → 1.5% of frame
  columns. Expect no aesthetic downside; verify anyway.
- `#arm=0` (also `anchor` / `tail` to bisect) — the peel arm lights.
- `#kelp=0` — dark canopy over the reef.
- `#aim=0` — cameras framing the baked line. At Sewers the cliff cam takes on
  more foreground bluff; that one is taste.
- `#cg=0` — group speed (A/B for measurement; default is correct).

Shipping OFF — append to TRY:
- `#lip=1` — aerated curl. Lip goes from LOSING to the face (202 vs 211) to
  leading it by 44–132 luma at sewers; ≤+3 at sharks (spilling, correct).
- `#curl=1` — the lip BENDS onto an arc instead of being thrown. Sewers bends
  132°, sharks 12°.
- `#slife=1` — per-stripe along-crest lifecycle; inner stripes stop banding.
- **`#lip=1&curl=1` is the combination that answers "the wave is curling, not
  the foam"** — measured as the best of the four, an aerated band lying on the
  bent lip instead of a detached pale slab.

Known-open after all of it: the SPRAY PLUME MESH is now the loudest hard edge
at a low camera (faceted white solid, geometry not foam — `#wrap` does not
touch it); the trough-crease fold pathology (63/68 transects fold somewhere,
`lam = S/(a k^2)` amplifying chop where the amplitude estimate bottoms out);
`throwMag` 12–19 m against a 5 m crest band, saturating its own 20 m clamp;
2/56 pocket stations 1.4–1.7x over the ceiling (uncovered by the drop fix, not
caused by it — the old drop was burying it); and the new drop coefficient 0.80
wants re-measuring now that #pitch made faces steeper.

## ▶ RIG DEFECT, NOT A MODEL DEFECT (2026-08-19) — the QA sets sheet's crest

- [x] **The Hook did not peak in the wrong column; the instrument did.** The
      new sets contact sheet showed six sites cresting in column 3 as designed
      and The Hook cresting in column 2 —
      `1.04 / 3.63 / 3.13 / 1.25 / 0.98` m across one beat — with a low peak as
      well (Sharks read low too, 3.14, but in the right column). Two symptoms
      at one site is the shape of a site-specific model defect, and it was not
      one. **CONVICTED: measurement.** Crest at a fixed station is the set
      envelope (1/Δf = 125–167 s) times a CARRIER of individual waves
      (T = 12–15 s); the sheet's columns are a quarter beat, 31–42 s, i.e.
      2.1–3.5 carrier periods. The peak column's clock at The Hook landed
      between two waves. Swept every 1 s at that same station: waves of
      **2.11 → 5.30 m**, the tallest at **t = 184 s, 3.9 s (0.027 beat) before**
      the column-3 clock of 187.86 s. Carrier-removed (max over ±T/2), the aim
      station reads **1.24 / 3.99 / 5.27 / 2.21 / 1.14** — peak in column 3,
      like everyone else. Refuted along the way, each with a number:
      *(a) the anchor is unrepresentative at The Hook* — every station on
      every one of the seven stages peaks within **±0.11 beat** of the anchor
      phase, and The Hook's stage spans only 0.14 beat end to end;
      *(c) |u_setRef| shifts the phase* — `setRef/cg` = −53.91/10.15 =
      **5.3 s = 0.037 beat**, against the 0.25 beat the symptom would need
      (the bank's largest, Jack's at −62.58 m, is 0.037 beat too);
      *(d) something clips the envelope there* — The Hook's stage envelope
      peaks at **5.42 m**, third of seven behind Sewers 6.31 and Privates 6.22.
      FIX (rig only, `scripts/build_qa_sheets.mjs`): the sets sheet's headline
      crest is now `crest±T/2`, the max over one full carrier period centred on
      the column clock (12 sub-clocks), with the instant printed beside it
      because the instant is what the frame shows. The wave-period sheet is
      untouched — there the carrier IS the subject. **No model change, no flag,
      no CONTROLS row**: nothing in `shared/model-glsl.js` moved.
      Pinned in `tests/qa-set-clocks.test.js` (column 3 is the envelope maximum
      for every shipped Δf and for ANY `setRef`, which is the permanent form of
      the (a)/(c) refutation) and written up as MEASUREMENT_LESSONS 12.

**The screensaver read (mission #1)**
- [x] WAVE SHAPE, second cause — **`dropMag` FLATTENED THE POCKET** (fixed
      2026-08-18, ships ON, `#drop=legacy` reverts; `scripts/measure_pocket_crest.mjs`
      is the instrument, reading the crest back off the GPU through the shipped
      SURFACE_GLSL). Independent of the forward-pitch defect below and present
      at DEFAULT settings — `#curl` masked it only because `#curl` switches the
      whole throw/drop pair off. What `dropMag` is FOR still stands: `throwMag`
      translates the crest band shoreward at constant height, so the throw
      alone leaves a flat shelf, and that is exactly what it was added to cure
      (3e28d38, 2026-08-10). What was wrong was WHERE it applied. It was
      `3.0·pocket·plunge·hM·lipJit` with `hM = h/VIS` — the height it is
      subtracted FROM — so it was a multiplicative shrink of the whole water
      column wherever `pocket > 0` (up to ~0.94·h), biting hardest at the
      crest, the tallest point on it. MEASURED at Sewers q=high over 4 pinned
      clocks × 36 stations: median crest / depth-limited ceiling `γh` **0.78 at
      pocket stations against 1.05 one station away**, and monotone in `pocket`
      (1.015 / 0.772 / 0.467 by bin). Sharks showed nothing, which is the
      mechanism confirming itself — `plunge` = 0 at ξ 0.45, so the term was 0.
      FIX: key it to `frontPhase` (zero at the crest, θ = 0; peaks ~0.9 rad
      shoreward — the water that has already gone over) and scope it to the
      band above the same `0.35·h_crest` bend line `#curl` uses, as a fraction
      of that band clamped below 1 so it can never invert the crest. AFTER:
      pocket fill **0.78 → 1.08** (1.05 is the calibrated norm — `crestCeilM`
      is a reference height, not a clamp, and non-breaking water sits there
      too); per clock 0.83/0.87/0.65/0.67 → 1.12/1.11/1.08/1.01. `#drop=legacy`
      reproduces the pre-fix frame **bit-identical** (0 px over 16 frames,
      2 spots × 2 cameras × 4 clocks); Sharks is bit-identical in both arms;
      the change is confined to the crest band (diff bbox y 396–494 on the
      cliff rig, nothing at the waterline). `check:swash` PASS, peel-arm
      stations ≥ L180 36→41 / 58→58 / 32→31, line median luma unchanged.
      ANDY OWES THIS A LIVE VERDICT — it changes the default silhouette on
      every plunging wave.
      TAIL, NOT FIXED and deliberately: 2 of 56 Sewers pocket stations now sit
      at 1.4–1.7 × the ceiling (p95 1.23, `#curl` 1.16). Those are the choppy
      fold at S = 1.8 plus the saturated 20 m displacement clamp, which the old
      drop was burying by 6 m of subtraction — a pre-existing defect that this
      uncovers rather than causes, and it belongs to the entry below (the
      `plunge` cliff / 20 m clamp list), downstream of the skew fix.
      INTERACTION TO WATCH: the even-skew forward pitch lands in `ocean()`'s
      height path and will raise `h` on the front face. The new drop is a
      fraction of `h − 0.35·h_crest` gated on `frontPhase`, so it scales with a
      steeper face instead of fighting it — but the 0.80 coefficient was
      calibrated against today's flatter face and should be re-measured with
      the same instrument once the skew lands.
- [x] `#curl` × `#lip` NOW COMPOSE (2026-08-18). They contradicted: the
      aeration curtain keyed off `throwMag`, which `#curl` computes and then
      never applies (the lip bends onto an arc instead), so `#curl=1&lip=1`
      painted white across water with no lip in it. `vCurl` (θ/π, turns of
      overturn) was already written for this and deliberately not consumed; it
      is now the curtain key whenever `#curl` is on, and the `throwMag` key
      stays when it is off. MEASURED over 288 Sewers stations: full white at
      < 0.10 turns of overturn at 18 stations, **all 18 now suppressed, 0
      strong-bend stations lost aeration**, 250 unchanged. All four flag
      combinations verified distinct and coherent on cliff + drone at four
      pinned clocks (`scripts/capture_drop_ab.mjs --matrix`); "both on" is the
      best of the four — the detached pale slab at the pocket is replaced by an
      aerated band lying on the bent lip.
      RIG NOTE: `cam=lineup` sits at water level and at Sewers sims 48/54 the
      camera ends up INSIDE the wave (flat white frame, every pixel differs
      between arms for reasons unrelated to the arm). Kept out of the
      coherence matrix; cliff is the profile view that carries a crest-height
      claim.
- [!] SCALE MEASURED 2026-08-18 — **the "dune" read is a DUTY CYCLE problem,
      and at the set peak the waves are TOO STEEP, not too flat.** Instrument
      `scripts/measure_wave_scale.mjs`: a dipstick occlusion probe (opaque
      depth-tested rods of known world height injected every 2 m along a
      shore-normal transect, viewed side-on at 70°; the lowest visible rod
      height IS the drawn surface, so shading cannot move it). Proofs: look-at
      to frame centre 0.000 px, project/unproject 1.7e-11 m, known 0/3/6 m
      markers recover to 0.075/3.10/6.08, 70° vs 80° re-measure agrees to
      median 0.32–0.50 m, and a `#psi=0` control reads the frozen LAM=90 as
      90.0 m flat with no depth trend.
      • WAVELENGTH IS RIGHT: drawn crest spacing 72 m @2.5 m depth → ~96 m
        @6 m, pooled median ratio **0.992** vs the model's own L(h); the
        shoaling is real (the psi=0 control shows none). Residue: 15–20%
        short in the deepest bake water (5.5–6.5 m), and a T=17 s day has
        <1 wavelength of unbroken water to measure (contourZ floor −260).
      • HEIGHT EXAGGERATION IS DELIVERED AS DESIGNED: measured 2.85–3.38x at
        the set peak, i.e. VIS=3.2 recovered off the screen. Consequence:
        drawn H/L 0.077–0.100 = **1.6–3.0x the Miche depth limit**, 0.48–0.70
        of Michell's 1/7, and drawn H/h up to **2.63** against GAMMA 0.78 —
        a wave that cannot exist. Faces 17–27° where the physical H/L gives ~5°.
      • THE LULL IS THE DEFECT: `setEnv = 0.5+0.5cos()` is zero-floored with
        100% modulation depth. Over one 166.7 s beat at secondpeak x=80 the
        drawn H swings **16x** (6.30 m → 0.40 m) and the height exaggeration
        swings 3.21x → **0.22x** — for ~40–50% of every cycle the render draws
        water FLATTER than the real ocean (H/L 0.006–0.013 vs physical 0.021).
        Evidence frame `envelope/env_secondpeak_sim122_x80_annotated.png` is a
        mirror-flat sea. **A floor on setEnv raises the lull without touching
        the peak** — likely more value for the "is this water" read than any
        shape work, and derivable: an envelope floor IS the amplitude ratio of
        the two beating components, |a1−a2|/(a1+a2), which PP_SPECTRAL_SETS
        can constrain instead of guessing.
      • THEREFORE: shape work aimed at the SET PEAK is aimed at the wrong
        target — there is no steepness headroom left there. If the peak still
        reads wrong it is anatomy/shading, not scale. Open question for Andy:
        VIS=3.2 is what pushes drawn H/h to 2.6 in 3 m of water, and that may
        itself be part of what reads as unconvincing.
      • INSTRUMENT LESSON (belongs in MEASUREMENT_LESSONS): the first build
        triangulated a band-passed LUMA feature across three depression angles,
        passed its own over-determination residual, and returned a surface
        floating 5.5–10.9 m above still water everywhere — view-dependent
        shading moves the luma feature to a different PHASE per view, and that
        shift varies monotonically with view angle, so it mimics height and the
        self-consistency check cannot see it. Luma is valid for SPACING (any
        consistent phase marker has the right period; it agrees with the
        dipstick to 1.018) and invalid for HEIGHT.
      • Limits declared: Michell 0.142, Miche 0.142·tanh(kh), McCowan 0.78 were
        verified against multiple consistent secondary sources; the 1893/1894/
        1944 primaries were NOT obtained.
- [x] SET-ENVELOPE FLOOR LANDED 2026-08-18 (`#env=0` reverts, **default ON**) —
      the lull half of the SCALE finding above is closed. `setEnv` was
      `0.5 + 0.5·cos(…)`: 100% modulation, floored at **exactly zero**. It is
      now `(1−m) + m·cos(…)` with `m = 0.425`, so the **peak is 1.0 for every m
      by construction** (the set peak has no steepness headroom, same finding)
      and only the trough rises, to **0.15**.
      • **DERIVED, NOT PICKED.** A two-component beat's envelope ranges
        |a₁−a₂| … (a₁+a₂), so the floor IS the component amplitude ratio,
        zero only for exactly equal components. Two independent estimators on
        the repo's own 25-year SC116 spectra agree (`PP_SPECTRAL_SETS.md` §7,
        regenerable from `build_spectral_sets.py`): **adjacent-band amplitude
        ratio** at the model's own Δf → 0.075–0.163, and **matching the
        measured lull DUTY CYCLE** over 108,000 set-cycle windows → 0.135–0.171.
        Uncertainty recorded as 0.05–0.20; dominant axis is which neighbour of
        the peak band counts as the second component (2.33×).
      • **§4's artifact does not reach it, and that was checked.** The band
        cutoff that swings σ_f by 6.1× moves this floor by **1.28×**, because
        the floor is LOCAL to the spectral peak and never touches m₂. Sea state
        1.29×, year-to-year 1.95×. **Δf is NOT retuned** — §4's prohibition
        stands and nothing here touches it.
      • NEGATIVE RESULT worth keeping: the measured envelope MINIMUM is 0.034
        (p50 of min/max per set cycle), *lower* than any two-component floor —
        a many-component narrowband envelope is Rayleigh and does approach
        zero. So the null's DEPTH is not the unphysical part; its **DURATION**
        is. The zero-floored model spends 3.8× too long below 0.15 and 1.8×
        too long below 0.25 of its own cycle max. The fit is to duty cycle.
      • MEASURED (dipstick, secondpeak x=80, the same sim 22…202 sweep):
        worst lull H **0.40 → 1.02 m**, exaggeration **0.22× → 0.51×**, H/L
        0.0063 → 0.0127, face 1.9° → 4.0°; whole-beat H swing **15.7× → 6.2×**.
        The set-peak row (sim 202) is **bit-unchanged**: 6.30 m, 3.21×, 25.1°.
      • **OPEN FOR ANDY — sets and lulls are mission-level, this owes a live
        verdict.** Also: exaggeration ≥ 1.0 through the lull is NOT reachable
        by derivation. It would need floor ≈ 0.31, twice the measured value and
        outside both estimators. Note the metric's own limit — the dipstick's
        `physH` is the *design* wave and carries no envelope, so demanding
        exaggeration ≥ 1 in a lull is demanding the render never modulate below
        its design height, which the measured ocean contradicts.
      • Regressions all green: cadence **120.8 s / 120.9 s** (foam residual and
        mean luma, r = 0.73; pinned band 120.5–122.4 s), peel-arm acceptance
        unmoved at the hero clocks (line median luma 52.5/52.5, 58.2/58.1,
        58.8/58.8 default vs `#env=0` — sims 42/48 sit at the set peak by the
        `#arm` anchor, where the floor does nothing), `check:swash` PASS
        (breathe 0.92%), npm test 55/55.
      • Interactions, reported not absorbed: foam is env²-gated so the floor
        raises baseline foam by 0.15² = **2.25%** — measured at the deepest
        lull, frame p99 84 vs 74 against **224.5** at the set peak, i.e. the
        lull does not become foamy. `setupLiftM` deliberately keeps 100% depth
        (setup is broken-wave momentum flux; lull waves do not break) and stays
        phase-coherent through the shared `setPhase`. Audio follows the same
        twin: the voice now bottoms at **−16.5 dB** instead of digital silence.
- [!] WAVE SHAPE — **THE FORWARD-PITCH TERM PITCHES NOTHING** (audited
      2026-08-18, `scripts/probe_wave_shape.mjs`; the probe compiles the
      SHIPPED MODEL_GLSL + the GRID_VERT choppyPos slice against the LIVE
      uniforms, provenance asserted by substring, cross-checked against an
      independent JS transcription to ≤4 cm and against the section view's
      breaking depth to ≤4.2%). `theta -= skew*sin(theta)` (model-glsl:844)
      is an ODD map of theta and `crestShape` is EVEN in its argument, so h
      is even about the crest FOR EVERY skew: measured front/back max-slope
      ratio **1.000000**, As **−0.0001** over a 30-cell (s,q) sweep spanning
      the whole reachable range. Live model As −0.03…+0.21 vs Ruessink+12
      −0.13…−0.75 and Elgar & Guza 1985 peaks −0.92/−1.24 — **As deficit
      0.85 at the break line**; biphase psi +5° vs −59° (**64° gap**);
      total nonlinearity B 0.42x the parameterized value. MODEL.md §2.2's
      "Forward pitch" claim is FALSIFIED and must be corrected with the fix.
      Worse, the term is actively harmful as written: it BROADENS the crest
      and narrows the trough, removing Sk 0.66–0.82 (crest/trough ratio
      1.29–1.77 shipped vs 2.76–3.20 at s=0) — literally the "rounded dune"
      read. FIX (verified numerically before landing): make the skew EVEN,
      `theta -= skew*(1 - cos(theta))` — at Second Peak's q=4.56 that gives
      As −0.25/−0.59/−0.79 and front/back 1.46/2.19/2.84 at s=0.3/0.6/0.8,
      raising the front face 50–60%, and lands the Ruessink As target at
      s≈0.75. Downstream of this, NOT before it: the 20 m displacement
      clamp (Sewers saturates it at every crest), the `plunge` cliff
      (smoothstep(0.45,1.25,xi) zeroes lip AND curl at sharks/privates/jacks
      and gives secondpeak 0.156), the frozen 90 m wavelength (u_psiMix=0,
      so the wave never shortens as it shoals — 38% of face steepness left
      unclaimed, and the eikonal bake already exists), and scheduling
      skew/q against the Ursell number instead of `excess`/|d|.
      Also measured: physical face 2.4–5.0° (displayed 7.4–15.0° via
      VIS=3.2) against Carini+21's 22° spilling / 30° plunging at breaking
      onset — the height field is 3–7x flatter than a breaking wave and only
      reads steep because of the exaggeration. Field stills CANNOT settle
      face slope (33 px of wave signature, ~1.9° depression angle; height
      and cross-shore span alias onto the same image axis) — not faked,
      recorded as a limit. Citations verified except Doering & Bowen 1995
      (paywalled, never opened — its fitted relations are UNVERIFIED here);
      Ursell has three incompatible conventions, both forms are in
      `stats_gauges.csv`.
  - [x] **PITCH LANDED 2026-08-18, `#pitch=0` reverts, DEFAULT ON — Andy still
        owes it a live verdict.** The map is now the EVEN
        `theta -= skew*(1 - cos theta)` with `skew = clamp(excess*0.82, 0, 0.8)`
        and a flattened `q = 2.2 + 1.5*exp(-|d|/55)*(0.6 + 0.5*xi)`
        (`shared/model-glsl.js`; the JS twin `model-js.js` carries the q half —
        it has no depth path, so it has no skew to carry). The defect was
        re-confirmed with a fresh probe run BEFORE the change: front/back
        **1.000000** for the odd map in every one of 30 (s, q) cells. Measured
        after, at the break line (secondpeak, drone, sims 42/48/54):
        **As +0.12 → −0.70** (Ruessink+12 target −0.72), **ψ +24° → −71°**
        (R12 −69°; inner-surf median −59°), **B 0.31 → 0.74** (R12 0.775),
        **front/back 0.96 → 2.3** (2.2–2.5 across the bank), with Sk 0.28 → 0.24
        (R12 0.28). Weighted
        mean-square (Sk, As) error over 44 gauges **0.398 → 0.021**. s and q
        were tuned as a PAIR: raising s alone fixes As and overshoots Sk 1.7×,
        because the old Sk sat on its target by coincidence. Guard test
        `tests/forward-pitch.test.js` pins the parity, the monotonicity ceiling
        (s < 1, or the height field itself goes multivalued) and the pow()
        trough. Docs: MODEL.md §2.2 bullet rewritten and the falsification
        recorded; new §2.2a owns the shape acceptance numbers; CONTROLS.md row.
        A/B rig `scripts/capture_pitch_ab.mjs`. **NOT closed by this**: the
        physical face is still 9–10° against Carini+21's 22–30°, and the next
        levers are the frozen 90 m wavelength (`u_psiMix`) and the 20 m
        displacement clamp, not more skew — s is already at its 0.8 ceiling at
        the line. Also open, and now measurable: ξ's authority over crest
        peakedness halved with the flatter q schedule (spread 1.11 → 0.52
        across the bank), so if ξ should still own "barrel-ness" it has to own
        it through `plunge` and the fold, not through q.
        **THE ONE THING THAT GOT WORSE, and the reason the live verdict
        matters:** the odd map's phase crawled at the crest, so the `crestNear`
        window spanned ±91° of carrier phase instead of its nominal ±56.6°, and
        the pocket bell — with the fold's `S_over`, the lip throw and the `#lip`
        mask on top of it — was calibrated on that 1.6× dilation. `tSince` and
        `crestNear` now read the unskewed carrier phase (shape vs locus, §4.5),
        which is principled and shrinks the pocket footprint ×0.19–0.63. Drone
        hero and the spilling site read unchanged-to-crisper; **the low profile
        view at Sewers loses much of its tube**. Not compensated here on
        purpose: restoring the footprint means re-deriving the 0.55/0.98
        `crestNear` thresholds, which is `#pock`/`#lip` calibration and collides
        with the concurrent `#curl` work.
- [ ] Hero read FAILED 2026-08-14, partially recovered since (#head comet
      gradient, #pock pocket scaling; `#look=current|foam|full` fidelity probe
      2026-08-15). Default stays `current` pending a live verdict. Open
      mechanisms: per-stripe lifecycle clock for the inner re-breaking stripes
      and the 4a' tide-area re-measure (kelp-mottle contrast budget resolved
      2026-08-18 — see Track 1b kelp entry).
- [ ] Track 1b scene identity — map view spec'd (`docs/MAP_VIEW_SPEC.md`), not
      built; publication blocked on characterising the DEM terrace/track-line
      artifacts. Also open: the ~110° headland corner, crowd scatter,
      cliff-path land-scale cues, the bake-seam hunt (kelp-wedge value
      polarity landed 2026-08-18, `#kelp=0` reverts; the seam half of that
      hunt was answered 2026-08-18 by `crestClockS` — see the Track 1b entry —
      leaving only the fixed light wedge).
- [ ] Break-line V at Sharks, layer 3 of 3: bridge the baked z across section
      gaps for the RENDER anchor only (instruments keep the honest V).

**Geometry & conditions**
- [ ] Track 3 (direction as a condition) is BLOCKED on B_spot, which is blocked
      on straightening the break line (perpendicular rms 23–50 m on 113–312 m
      stages; `pp_bspot.json` rms is the acceptance metric). Note the
      2026-08-13 retarget may have hit the wrong constraint (MODEL.md §2.6.2a).
- [ ] 4b wind/sky as data · 4c decide the live clamps (Hs 3.0 m / Tp 18 s) ·
      4d season+conditions panel — 4d gated on 3c, hence on B_spot.
- [x] 6a CLOSED 2026-08-18 — the fix was already M6p3's 2026-08-13 cg
      unification (69fd820); what the item still owed was measurement. New
      set-envelope estimator in capture_temporal ([2b]) + `#cg=0` A/B: the
      retired constant measures 2.91 m/s (363 m band — the audit's defect,
      reproduced), the shipped default 9.42 m/s toward gT/4π = 11.71; set
      cadence 121.7–122.4 s unmoved in both runs. Details in Track 6 6a.

**Validation (largest gap)**
- [ ] USGS shore-camera peel-angle derivation (OFR 2007-1270 stills) — the
      measurement that would settle the α-target question.
- [ ] First validation pass: a model residual against an independent record of
      a real day. Partial capture 2026-08-15; prerequisite instrument is the
      temporal audit harness (Track 6).

---

## Phase 0 — model on paper (current)
- [x] Core parametrization written (`docs/MODEL.md`)
- [x] Shader-ready zipper sketch (`glsl/zipper.md`)
- [x] Research docs land (CDIP data, surf-science refs, TD recon)
- [x] Reconcile MODEL.md numbers against verified literature (peel-angle ranges,
      Iribarren thresholds, Pleasure Point bathymetry if published)

## MISSION (reprioritized 2026-08-11): the SCREENSAVER
#1 goal: something surf aficionados would respect as a screensaver. Judged in
10 seconds of watching — peel, curl that scales with size, sets/lulls, tide —
and it must run unattended with a camera that knows where to look. The
Surfline PP cam stays the ground truth. Model honesty still matters (surfers
clock fake waves instantly) but honesty items that don't change the picture
drop. Supersedes the 2026-08-09 surfer mission: the rider is garnish; the
wave is the show.

## ▶ NEXT UP (2026-08-13) — retarget the peel-angle bank

Promoted to the top of this file because it is the one change the whole
2026-08-13 measurement arc points at, and everything in Track 1 below is
now downstream of it. Full derivation: `docs/WEB_THREE_SPEC.md` "The
reef-shape sweep" + `tests/peel-ceiling.test.js`.

- [x] 1c'-c.7 RETARGETED 2026-08-13 (Andy approved the paired plan). Each
      retargeted α is its spot's OWN ceiling from the model's own geometry
      (h_b from the card; h_s = wedge seaward edge = crest + AMP + 1.2 fade),
      not the h_s = 6 m column: secondpeak 58→41, jacks 62→37, thehook 48→41,
      sharks 66→36, privates 70→31; sewers 38 kept (inside its 47.3°);
      firstpeak 50 kept against a 44.0° planar bound BY MEASUREMENT (50.8
      stage-median at the shipped shape — apex rotation the planar bound can't
      see; named exemption in tests/peel-ceiling.test.js). The test now FAILS
      if a target is raised back over its ceiling. Mellow moved to sheltering
      (next item).
- [x] 1c'-c.8 FLANK 45→80 ADOPTED with it, amp unchanged 3.2. Scored TOGETHER
      against corrected targets (measure_reef_shape.mjs, 2026-08-13):
      3.2/45 = 4/6 on target, mean |Δα| 7.2°; **3.2/80 = 4/6, mean 4.6°**,
      invariants clean, max raise 3.6 m — vs 2/6 @ 23.6° pre-retarget. Residual
      misses are now single-digit: Second Peak 35/41, Sharks 26/36 (were
      −38/−55 against the old targets). First Peak overshoots at 80 (55/50).
- [x] 1c'-c.9 SHELTERING `H_eff(u)` LANDED 2026-08-13 (33c1443, deployed):
      shelter(x) = exp(−(x−24)/1675), calibrated from the card bank's own H₀
      gradient (r² 0.81), feeding shoaling + breaking gate + amplitude + foam
      + the bake. `#shelter=0` reverts both sides. MODEL.md §2.6.7. Scored:
      5/6 on target, mean |Δα| 3.3°; Second Peak H₀ swing 1.7° (<5° passes).
      Open residue: Sharks 28/36 + its low-H₀ collapse, First Peak 55/50
      overshoot at flank 80.

---

## PLAN (2026-08-11 evening, post external-validity audit — supersedes the
## priority list below, which is kept for landed-status history)
Source: docs/research/EXTERNAL_VALIDITY_AUDIT_2026-08-11.md. Decisions by Andy
2026-08-11: CPU twin ABANDONED for now (no parity work); direction α-split
DOCUMENTED now, WIRED after Track 1; scene identity PROMOTED alongside Track 1.

### Track 1 — the reef owns the break line (blocks Tracks 3 and 5)
- [x] 1a. `lift` probe along 38th's crest line — CONFIRMED: on the four wide
      stages the v1 crest datum fell below the natural bed inside the fit
      window, lift zeroed at every fit station, α collapsed to 0.97–2.65°
      (bed.js nose-v2 header; EXTERNAL_VALIDITY_AUDIT)
- [x] 1b. Nose v2 LANDED (fc062a7): amplitude taper in stage fraction,
      bed-relative. Re-measured 2026-08-12 post V-fix (spec nose table): the
      v1 wide-stage collapse is gone, but at the tuned 0.25 it is near-inert
      on five of six spots (|Δα| ≤ 1.3°) and makes Sharks WORSE (48.5 → 39.5
      vs 66 target). Not the one change that hits all three criteria; the
      sharks residual moves to 1c's ensemble judgement.
- [x] 1c. Ensemble JUDGED 2026-08-13 — REJECTED (spec "The ensemble, judged";
      instrument scripts/measure_ensemble.mjs). No combination passes the
      triple on >1/6 spots. Every combo containing #peeldir collapses to
      α≈8–10° edge-to-edge (post V-fix the running-max runs after
      branch-following already picked the branch — kill switch, delete
      candidate); psi+smooth+nose still loses the peel (mean |Δα| 26.7°, 3
      A-frames). NEW number: baseline α swing across H₀±0.3 m fails 4/6
      (10.5–56.9°; Sharks 48.5°→3.2° for −0.3 m). The reef still doesn't own
      the line, now bounded two ways: it must survive wave-scale smoothing,
      and the nose can't supply that (clamped ≤0.30, near-inert at 0.25).
- [x] 1c'-a. Nose-clamp sweep DONE 2026-08-13 (spec "The nose, swept to its
      bound"; scripts/measure_nose_sweep.mjs). Clamp raised to the
      definitional 1.0; f ∈ {0…1.0} bare + under #smooth. NO fraction passes
      >1/6 in either mode; under smoothing monotone-worse past 0.4, f=1.0 =
      48.9° mean |Δα| (a spent reef owns nothing). The taper mechanism is
      EXHAUSTED — it can only remove relief, smoothing demands added oblique
      structure. Curiosity: bare f=0.55 is the only measured config improving
      Sharks (48.5→55 vs 66, spurious A-frames→1) but it breaks Jack's (→30).
- [x] 1c'-b. Andy chose (b) 2026-08-13: accept the noise-peel, fix its real
      defects. DIAGNOSED FIRST (spec "The H₀ swing, diagnosed" + "Where the
      peel actually lives"; scripts/measure_h0_swing.mjs,
      measure_alpha_profile.mjs) rather than patching, because a hysteresis
      filter on the baked line is output repair and MEASUREMENT_LESSONS 8 says
      that fails here. What the swing actually is:
      • the acceptance instrument (α at x=0) overstates it 4–8× — stage-median
        swing is 7.4° (Sharks) / 9.6° (Second Peak) vs 57.9° / 41.8° at the
        station — and at Second Peak it moves the WRONG WAY (line 12.0→20.5°
        as H₀ 1.2→1.8 while the station reads 66.8→27.4°)
      • but it is real: 7.4–9.6° stage-wide still fails the <5° band
      • genuine discrete branch flips exist at the LOW-H₀ tail only (Sharks
        102.8 m / 87% of stations for a 0.05 m step at H₀ 0.85; Jack's 151.7 m
        at 0.90)
      • the peel is a sustained oblique run over ~40–100% of the stage (better
        than §4.5's "crosses zero on the flanks"), but Second Peak / Jack's /
        Sharks end in a DEAD DOWN-POINT THIRD reading 1–8°. As H₀ moves the run
        slides and a fixed station crosses into that tail — that IS the swing.
      • reporting correction: "α on target 4/6" describes the FIT WINDOW.
        Stage-median α is 11° (Sharks) and ~17° (Second Peak) vs 66 / 58.
- [x] 1c'-c.1 ACCEPTANCE INSTRUMENT RETIRED 2026-08-13. α-at-x=0 samples the
      same neighbourhood the reef fit is tuned at, so it certifies the fit
      (MEASUREMENT_LESSONS 4). `__pointbreak.stageAlpha()` is the acceptance
      instrument now — stage-restricted median, with the fit-window and
      outside-window medians alongside. HUD reports target · x0 · stage, never
      x0 alone. The <5° swing rule is restated on stage-median α.
- [x] 1c'-c.2 BRANCH-FLIP FIX BUILT AND FALSIFIED 2026-08-13 (spec "The anchor
      band, falsified"). Declaring "the line lies within one flank width of the
      wedge crest" and ranking crossings by it — at the anchor, then at every
      station — measured BIT-IDENTICAL to default at bands 45 m → 1 m, flag
      proven live first. Reverted, with a do-not-retry note at the call site.
      WHY: `__pointbreak.crestOffset()` shows the drawn line sits a median of
      40–191 m from the wedge crest, so the in-band set is empty and the
      fallback runs everywhere. Corollary added to MEASUREMENT_LESSONS 8:
      change-the-selection only works when the declaration and the candidates
      are in the SAME NEIGHBOURHOOD (continuity compares to the previous
      crossing — always near; a band compares to the crest — 40–191 m away).
- [x] 1c'-c.3 SWEPT 2026-08-13 (spec "The reef-shape sweep";
      scripts/measure_reef_shape.mjs, `#reefamp=` / `#reefflank=`). amp × flank
      over {3.2,5,7} × {45,80,120}, all six spots, M5 clamp invariants checked
      per row (all CLEAN — 0 deepened / 0 above ceiling / 0 dry, max raise
      ≤5.6 m) and the shape re-asserted per row so a stale cache can't fake it.
      • FLANK IS THE LEVER, AMPLITUDE SATURATES: 45→80 m nearly halves mean
        |Δα| (23.6→15.5 at amp 3.2; 20.6→12.9 at amp 5). amp 5→7 does NOTHING
        (bound + the −0.5 m ceiling already dominate). 120 m is worse than 80 —
        past some width the wedge is a shelf, not a reef.
      • CEILING, and it is not about reef size: at flank 160/240 the three
        failing spots do not improve (Second Peak 39→32→34, Jack's 43→40→42,
        Sharks 35→37→33). Targets ≤50° land; targets ≥58° plateau at 33–43°.
        The wedge cannot express a stage-wide peel past ~45° on this bathymetry.
      • The FIT still reports success throughout — residuals −0.4/2.8/1.0° at
        flank 240 while the stage reads 34/42/33. Self-certification is now
        measured at every reef shape, not just the shipped one.
      • CORRECTION: this morning's "drive crestOffset under ~45 m" is
        WITHDRAWN. Offset sits at 105–121 m across all shapes while mean |Δα|
        halves; 3.2/80 has a HIGHER offset and a much LOWER error. The
        correlation was across spots at one fixed shape. ~105 m looks
        structural (crest at 0.75·h_b, breaking at h_b). Objective is
        stageAlpha(); crestOffset() is demoted to a diagnostic.
- [x] 1c'-c.6 THE FORK IS SETTLED 2026-08-13 by literature + a new test:
      **THE α TARGETS ARE WRONG. THE WEDGE IS AT ITS PHYSICAL BOUND.**
      (SURF_SCIENCE_REFS 2.3.2, verified verbatim from Mead 2001 PhD and
      Henriquez 2004 TU Delft MSc; `tests/peel-ceiling.test.js`.)
      • MECHANISM: refraction aligns crests to the isobaths as they shoal, so
        for straight parallel contours peel angle IS the incidence angle at
        breaking and Snell bounds it: **sin α_max = c_b / c_s**. The bound
        contains NO wedge dimension — which is exactly why widening ours
        saturated. Mead: "as the depth of a wedge increases, the amount of
        refraction occurring on the wedge prior to breaking increases… the
        wedge must be rotated at a greater angle… to maintain a surfable peel
        angle." Enlarging a fixed-orientation plane LOWERS α.
      • EVALUATED ON OUR OWN DISPERSION CODE (ceiling at h_s = 5/6/8 m):
        sewers 62/54/45 vs target 38 ok · firstpeak 54/48/40 vs 50 ok ·
        secondpeak 49/43/37 vs 58 OVER · thehook 48/43/36 vs 48 AT BOUND ·
        jacks 41/37/32 vs 62 OVER · sharks 39/35/30 vs 66 OVER ·
        privates 33/30/26 vs 70 OVER. **5 of 7 targets exceed the bound at
        every shelf depth tried**, and the two that clear it are exactly the
        two spots that hit target in the reef sweep. Sharks' reef ends near
        the 6 m contour → bound 35°; best measured config produced EXACTLY 35.
      • THE GOLDEN RULE IS BACKWARDS: params.js raises α down-point while
        lowering H₀ 2.2→0.7, but smaller waves break shallower, refract more,
        and have a LOWER ceiling. It asks the highest peel angles of the spots
        physics constrains hardest. Mead records the same measured at Raglan
        (Hutt 1997): 15° vs 40° of direction change for 4 m vs 1 m waves.
      • FORCING IT WOULD LOOK WRONG ANYWAY: the Borth physical model (HR
        Wallingford HRPP576) targeted 45–65° and measured 72–85° — logged as a
        FAILURE, "wave breaking did not progress along the crest". High α off a
        planar structure is a wave that has stopped peeling, i.e. a closeout.
      • COUNTER-EVIDENCE, recorded not buried (SURF_SCIENCE_REFS 2.3.2): ASR
        Ltd's own prescription for an EASY reef is "a minimum of 50° and an
        average of around 60°" (Black & Mead 2009), a natural break at Cables
        was estimated 60–70°, and Walker's central value is ~50°. So high α is
        not absurd per se. The precise claim is narrower and still binding: at
        THESE spots' breaking depths — set by their own authored H₀ of 0.7–1.5 m
        — a planar component on this shelf cannot deliver 58–70°. Sharks would
        need refraction to begin essentially at the break point.
      • CONVENTION CONFLICT to be aware of: the Cables design brief (ASRC 1994)
        says "30 degrees is appropriate for beginners, 60 degrees is desirable
        for professional boardriders" — exactly INVERTED vs Hutt et al. 2001.
        Check which convention a source uses before citing its numbers.
- [x] 1c'-c.8 LANDED 2026-08-13 with the retarget (see NEXT UP above): flank
      80 shipped at 3.2 m amp, scored against corrected targets.
- [x] 1c'-c.11 DENSITY-COMPOSITE LINE MEASURED 2026-08-13 late night
      (`#dline`, default OFF; spec "The density-composite line, measured").
      The Topanga candidate for Sharks, run to a verdict: `dline=2` (density
      mode IS the line) turns the low-H₀ chatter into ONE clean transition at
      the physical bistability (H₀≈0.85) — the right form if flip-immunity is
      ever wanted — but NO density form lifts Sharks' α (26–28 vs 36 in every
      config; sub-0.85 collapse unchanged). The 28/36 gap is wedge saturation
      at the Snell bound + the dead down-point third, NOT branch selection.
      Selection-layer work is EXHAUSTED; what remains is c.10 (rotating
      strike) or accepting the bound. `dline=1` (peaks + anchor selection)
      falsified — the knife-edge moves into the anchor.
- [~] 1c'-d THE LOW-H₀ BRANCH FLIP IS ONE MECHANISM, BANK-WIDE — CHARACTERISED
      2026-08-19, NO BAKE CHANGE (the fix was built and falsified; see below).
      **This entry supersedes and consolidates four per-site residuals that
      were being tracked separately**: Sharks' 102.8 m flip at H₀≈0.85 (1c'-b),
      Jack's 151.7 m at 0.90 (1c'-b), Second Peak's flip "somewhere in
      1.00–1.10", and First Peak's α 1.4→43.7 across 1.25→1.26. They are not
      four site residuals. They are one defect with a per-site threshold.
      Instruments: `scripts/measure_branch_flip.mjs` (the map),
      `scripts/probe_break_anchor.mjs` (the cause),
      `scripts/audit_shipped_states.mjs` (the blast radius), plus two read-only
      probes, `__pointbreak.crossProbe()` and `.excessProbe()`.

      **(1) THE MAP — six of six mapped spots, one threshold each.** Full
      0.40–3.00 ladder, refined to 0.01 m. Privates has no measured bed, so no
      bake and no flip. `aStage` = `stageAlpha().medianClean`.

      | spot | target α | card H₀ | threshold H₀ | jump | stations | α below → above | pinned |
      |---|---|---|---|---|---|---|---|
      | Sewers | 38 | 2.2 | **1.60→1.61** | 169 m | 73% | 9.1 → 35.0 | 0 → 40 |
      | First Peak | 50 | 1.8 | **1.25→1.26** | 78 m | 52% | 1.4 → 12.1 | 0 → 22 |
      | Second Peak | 41 | 1.5 | **1.02→1.03** | 35 m | 19% | 2.6 → 3.7 | 0 → 8 |
      | Jack's | 37 | 1.1 | **0.84→0.85** | 130 m | 28% | 7.2 → 21.3 | 6 → 26 |
      | The Hook | 41 | 1.5 | **1.04→1.05** | 111 m | 38% | 6.2 → 17.1 | 0 → 20 |
      | Sharks | 36 | 1.0 | **0.80→0.81** | 78 m | 47% | 7.5 → 16.4 | 6 → 11 |

      **NO HYSTERESIS** — up-sweep and down-sweep are bit-identical at 211
      paired steps across the six spots (max |Δz| = 0.000000 m). The bake's
      cache key carries H₀ and nothing in the selection remembers the previous
      bake, so `#drift` / `#day=live` cannot latch. They can still cross a
      threshold, and when they do it is a step, not a slew.

      **CORRECTION to the 2026-08-19 `#lipn` note**, which recorded "an H₀
      sweep 0.40→1.60 m in 0.05 steps found **no threshold**" at Sewers and
      concluded its 3–9° closeout was a separate thresholdless defect. Sewers'
      threshold is **1.605**. That sweep stopped one step short. Sewers is the
      same defect as the other five; its threshold is just the highest in the
      bank and sits above every `#month` H₀.

      **(2) THE CAUSE — the candidate set, not the selection, and not the
      anchor.** Decomposed at each of the six thresholds:
      • NOT the anchor. At 5/6 the seed station has ONE crossing on both sides
        and it moves smoothly; at The Hook the anchor is simply one of the
        stations that loses a crossing. The anchor never re-ranks a set that
        persisted.
      • NOT the greedy walk — and this is the surprising half. Over the
        identical lattice a **Viterbi global min-total-|Δz| path** (the exact
        non-greedy form of the same continuity claim) has MORE flip steps than
        shipped at 5/6 spots (Sewers 13 vs 1, The Hook 11 vs 4, Jack's 10 vs
        3), as do seaward-most and shoreward-most. **The shipped greedy rule is
        already the best of the four.** A global optimum is free to re-route the
        whole line when the lattice twitches; an anchored greedy walk is pinned
        at one end. Replica validated against the real bake first (max 1.5 m
        over 318 bakes, all of it the 1 m readback grid vs the 4.72 m texel).
      • IT IS THE ONSET BOOKKEEPING. `markBreakCrossings` returns *onsets*, and
        an onset is born or dies when a negative dip in `H₀Kₛ − γh` crosses
        zero. Measured at all six thresholds, the dips that vanish are
        **−0.002 to −0.144 m** of excess — the criterion grazing zero at
        **0.1–0.7% of its own scale**, on a bed whose elevation residual is
        0.31–0.93 m and which `bakeBreakLine` already notes displaces the
        crossing 22–70 m. One break is split into two branches over three
        millimetres of wave height. Selection then amplifies 2–12× (1–8
        stations change candidate count; 7–39 change branch) and the 3.0 m/m
        slew clamp turns each teleport into a pinned ramp, which `gapArr` then
        declares NOT BREAKING — so the V at Sharks (tracked separately since
        2026-08-14) is this same mechanism seen at fixed H₀.

      **(3) THE FIX, BUILT AND FALSIFIED — `#merge=` (CONTROLS.md row).**
      Require a dip to be a real un-breaking before it starts a new branch,
      threshold derived as γ × the bed's own elevation residual. Proven live
      (`__pointbreak.onsetMerge()` reports it back), and `merge=0` measured
      bit-identical to shipped. It does not remove one flip: the count RISES
      (Sewers 1→4, The Hook 4→6, First Peak 1→3 at 0/0.05/0.12/0.24), the
      largest jump barely moves (172→166 m), and the threshold merely slides
      down (Sewers 1.65→1.55, First Peak 1.30→1.20). Card α unchanged to 0.1°
      at every value — nothing regresses, nothing improves. WHY, and it is the
      general result: the onset count flips when the dip crosses 0; with a
      threshold *m* it flips when the dip crosses −*m*. **A threshold relocates
      a knife-edge onto a different level set of the same continuous field; it
      never deletes one** — and *m* adds a second discontinuity (the merge
      decision), which is why the count went up. MEASUREMENT_LESSONS 14.
      Selection-layer work is now exhausted a FOURTH time (anchor band 1c'-c.2,
      density composite 1c'-c.11, this, plus the Viterbi/extremal
      counterfactuals) and for the first time with a reason that predicts the
      failure rather than describing it.

      **(4) SHIPPED IMPACT — the cards are clean, the opt-in states are not.**
      All 114 reachable baked states on mapped spots (7 presets × card + 12
      `#month` + 6 `#day`), each booted from a fresh document:
      • **Every card state is healthy and near target** — Sewers 36.4/38, First
        Peak 51.4/50, Second Peak 35.9/41, Jack's 32.9/37, The Hook 37.0/41,
        Sharks 26.3/36. A bare URL is fine at every spot. That is why this was
        never caught by the QA sheets.
      • **64 of 114 (56%) draw stage-median α below 10°** against targets of
        36–50°, i.e. a closeout. They are all `#month=` and `#day=` states.
      • **First Peak at `#month=january` (H₀ 1.245) is collapsed: α 1.0°
        against a 50° target, line z spanning 5→10 m over a 113 m stage.** It
        sits 0.015 m below its own threshold, at the deepest point of the
        pre-flip trough. This CONFIRMS the collapse already recorded in the
        `#month` CONTROLS row as the reason the global-January default was
        reverted on 2026-08-16 ("collapsed the peel at Sewers (α 38→5) and
        First Peak (50→1)") — the α 1.0 measured today is that same number. The
        new part is that it is not January-specific and not two-spot: it is
        **every month at First Peak**, and six of six spots have a threshold.
      • Sewers is the worst-hit: **all twelve months and three of six condition
        days** sit below 1.605, so `#month=` at Sewers is a closeout year-round.
      • `#month` remains OPT-IN and that is what contains this. The existing
        tests `no module-level default month overrides the per-spot card oceans`
        and `a month is applied only when the hash asks for one` are the pin
        that keeps the blast radius off the default view; do not weaken them.

      **NEXT — not a selection problem, so stop bringing selection fixes.**
      The pre-flip line is not a swash artifact (depth at the line measures
      1.5–3.2 m, a legitimate breaking depth) — it is a genuine inshore break on
      near-shore-parallel contours, while the post-flip line is the oblique reef
      line. The two are 27–295 m apart by `crestOffset()`. So this is the ROOT
      DEFECT (1c'-c.2's finding: the reef does not own the line) showing up as a
      function of H₀ rather than of site. Candidates, in order:
      (a) reef EXTENT (1c'-c.4) — if the wedge reached the depths a small swell
          breaks at, the reef branch would exist at low H₀ and there would be
          nothing to flip to;
      (b) an authorship declaration per §4.5 — the model may honestly say a spot
          has no surfable peel below its threshold instead of drawing a closeout
          and labelling it the site. This is a CONDITION-level call, not a
          line-level one, and it does not override physics on the quantity
          physics owns;
      (c) accept and document, which is the status quo plus this table.
      Do NOT retry: anchor band, density composite, onset merge, hysteresis on
      the baked line, global-optimal continuity, seaward/shoreward-most.
- [ ] 1c'-c.10 THE HIGH-α MECHANISM — **DEPRIORITIZED 2026-08-14, measured
      against the wrong defect.** `scripts/measure_alpha_regimes.mjs` splits
      the stage by whether the wedge actually lifts the bed under the break
      point: ON-REEF every spot hits its target within 3.6° (Sharks 34.8 vs
      36, with 7.8° of headroom to its own local Snell ceiling). The 28.4
      stage median is dilution by the 61% of Sharks' stage with no wedge under
      the line, plus a limiter-pinned stretch reading a spurious 68°. Rotating
      β reshapes the wedge where the wedge IS; it cannot touch either. The
      lever on the stage median is reef EXTENT — c.4 below. Keep c.10 parked
      unless a spot is ever wanted materially ABOVE its local ceiling.
      Original rationale, unchanged: literature says high α comes from
      NONUNIFORM contours — a ROTATING strike plus focusing. Real designed
      reefs do this: Narrowneck's arms rotate 85° offshore → 65° inshore, the
      stated principle being to hold peel angle constant by "gradually
      decreasing the reef angle β shoreward" (Mead, Black & Hutt 1998). Our
      wedge has ONE constant β.
      **CITATION UNVERIFIED**: that Narrowneck reference appears nowhere in
      `docs/research/` — SURF_SCIENCE_REFS carries Mead & Black 2001a/b/c,
      Hutt et al. 2001 and Mead et al. 1997, no 1998. Verify before it is ever
      used to justify a shape change (§2.3 already had one unsourceable claim
      withdrawn on 2026-08-13).
- [~] BREAK-LINE V AT SHARKS — CLASSIFIED, NOT YET RE-ROUTED (2026-08-14
      evening). Two of three layers landed:
      (1) INSTRUMENT: `stageAlpha()` excludes limiter-pinned stations
          (6abfc57), matching measure_alpha_regimes' classification exactly
          (15 stations at Sharks).
      (2) RENDERER: SECTION-GAP semantics per the standing 4.5 call — the
          bake flags pinned texels in the break texture's B channel
          (feathered over ~3 texels; the binary flags stay in `gapArr` for
          instruments via `breakGapAt`/lineProbe.gap), and `breakMask()` in
          model-glsl withdraws the zipper's breaking claim there: no crash,
          no zipper foam, the wave passes through unbroken. Depth's own
          permission (`gate`) deliberately stands. `#gap=0` is the A/B
          revert. Verified clock-pinned at sims 36/42/48: diffs confined to
          the gap's screen band; 19 gap stations x −88 → −52 (the ±1-texel
          endpoints widening is by design). MECHANISM, settled: across the
          bare-DEM stretch the near branch has no crossing, so
          nearest-to-previous teleports to the far branch and the slew clamp
          rams the teleport into a 16-station ramp at exactly 3.0 m/m.
      (3) OPEN — THE LINE ITSELF: the baked z still traces the V, so the
          face field anchored to `z - zb` shows a faint seam across the gap.
          Candidate: bridge zb linearly between gap endpoints for the
          RENDER anchor only (instruments keep the honest V). Also still
          open: whether reef EXTENT (c.4) removes the gap's cause outright.
- [ ] 1c'-c.4 DEAD DOWN-POINT THIRD: still a judgement, not a measurement —
      real point breaks shut down on the inside. If it stays, record it in
      MODEL.md; likely resolves with c.3.
- [x] 1d. M6p3 CLOSED 2026-08-13 (steps 2-4 landed, #psi DEFAULT ON, cg unified to gT/4π; spec "M6 part 3, closed out"). Superseded text follows: (sound onto Ψ, flip default) NO LONGER ride with the
      ensemble — judge a #psi-only default flip on its own merits (it holds α
      at 4.3° mean but raises spurious A-frames 3→5; steps 2–3 still open)
- Acceptance is now visual AND measured: drone capture shows a single-takeoff
  zipper; α HUD swing < ~5° for ±0.3 m H₀; spots distinguishable by their
  SURF (pairwise-RMSE instrument from the audit), not just coastline.
- [ ] HERO SCREENSAVER READ FAILED 2026-08-14 (10-second read of the hero
      state, sewers/drone/sim=42, full 1000×750 frame — the OG capture's
      source state). All four criteria fail:
      (1) no single wave reads as the subject — 3–4 parallel foam stripes
          read as static texture bands, nothing for the eye to land on;
      (2) crash direction illegible — no fresh→decayed foam gradient along
          any crest, no visible traveling breakpoint;
      (3) no curl locatable at drone altitude — the bright mid-frame teal
          band reads as shallows, not a wave face;
      (4) terrain reads generic coast — no 110° point turn, no cliff line;
          the kelp mottle reads as cloud shadow.
      The contrast budget is spent on deep-water kelp mottle (upper half)
      while the zipper is the least-differentiated stripe — the model knows
      more than the image communicates. Levers: the map-view slice
      (docs/MAP_VIEW_SPEC.md) as the place-identity layer, plus re-staging
      the hero shot (camera, light, foam freshness gradient) rather than
      more model tuning.
      PARTIAL PROGRESS 2026-08-14 late (edf91ca, #head/#pock): line-attached
      stripes carry a comet gradient behind #head, and the pocket footprint
      scales with H_eff (#pock, mechanism landed, unverified at altitude).
      VERDICT (same night, Andy, live A/B): "#head=0 is way better" — the
      comet default is OFF (#head=1 re-arms it). The mechanism stack (model
      cometFoam + aftermath thinning + post-threshold carve) stays in the
      code for iteration; whatever reads worse is in the tuning, not
      necessarily the idea. SUPERSEDED DEFAULT NOTE: a clean-load rematch on
      2026-08-14 restored #head=1 as the default; #head=0 remains the revert.
      FIDELITY PROBE 2026-08-15: `#look=current|foam|full` now isolates cellular
      foam material from material + lifecycle hierarchy + face/lip staging.
      The full state now keeps convergence sub-cusp, rejects DoubleSide fold
      undersides (the diagnosed source of the black manta/ribbons), darkens
      the surviving front face, and draws a fine crest-derived lip;
      matched Cliff captures and field stills are in
      `docs/research/PLEASURE_POINT_CAPTURE_2026-08-15.md`. Default remains
      `current` pending a live verdict. STILL OPEN: (a) the INNER re-breaking stripes have no along-crest clock —
      life.x anchors at the break line only — so they band uniformly and
      dominate wide frames; per-stripe lifecycle is the next mechanism.
      MECHANISM LANDED 2026-08-18 behind `#slife=1` (default OFF pending the
      live verdict): canonical clock `stripeAgeAt` in model-glsl
      (tSince + phaseLag/ω = time since this column's wave broke at the line,
      the phase-lagged copy of the zipper's along-crest age), read as a
      post-threshold GRID_FRAG carve (comet discipline, extended inward) —
      within-stripe freshness at T/3, stripe-to-stripe lag at 2.4τ. Verified
      2026-08-18: the rendered carve field matches the derivation r=0.995
      (twin instrument, scripts/measure_stripe_life.mjs); zeroing the carve
      removes the inner stripes entirely, so it multiplies exactly the pixels
      that band. Falsified along the way (recorded at stripeAgeAt and in the
      instrument header): a single unwrapped e-fold (every stripe lands on
      its floor), the model-side pre-threshold multiplication (invisible at
      set-peak clocks, crushes heads stacked with the carve), and four
      instrument variants (luma dilution, transect k-jumps, sawtooth vs
      linear fit, glint compensation via the foam-damped ripple field).
      (b) RESOLVED 2026-08-18 — kelp dark-wedge polarity (`#kelp=0` reverts,
      Track 1b entry below): upper-half mottle std down 41%/21%, break-band
      contrast ratio up at both mapped drone states. (c) the 4a'
      tide-area ratio (1.95x/2.17x) needs a capture_temporal re-measure
      under the deeper aftermath aging before the next conditions claim.
- **DECIDED 2026-08-11 (Andy): Sewer Peak's A-frame is canon-true** — the
  guides call it a bowly A-frame with rideable lefts. "A-frames = 0" applies
  to every OTHER preset; at Sewers an interior takeoff with leftCrests ≥ 1 is
  correct behaviour, not the defect. (V-fix status: LANDED parts 1–3 —
  reef cross-shore bound + break-line slew limit db61da0, branch-following
  crossing selection 6c4e2f6; teleports 46–180 m → 9.4 m, α on target 4/6
  unsmoothed. Residual: sharks α collapse (confirmed again in the 2026-08-12
  nose re-measure: 48.5 vs 66), thehook spurious A-frame, firstpeak α ~10° low.)

### Track 1b — scene identity (PROMOTED; parallel, independent of 1)
- [ ] MAP VIEW — wide topology mode. SPECIFIED 2026-08-14, not built:
      `docs/MAP_VIEW_SPEC.md`. Renders the place (platform, shelf edge, seven
      spots, per-spot break lines + reef-authority extent) and deliberately
      runs no wave model. Motivated by two measurements: the render patch
      (1280 m) is smaller than the point (Sewers→Privates 1556 m), and at the
      DEM's true elevation range the surf band is 7.9 m of 102 m — 7.8% — so a
      wide view at true scale spends its contrast on cliffs and the offshore
      drop. A free camera is NOT the gap: OrbitControls already ships. Blocked
      for publication on characterising the terrace/track-line DEM artifacts a
      wide frame exposes.
- [x] DEM extended to 9.4 km of coast (Cowell's → Bombora), patch extent
      doubled (1874939); extrapolation ramp moved into bedElevM, killing the
      rectangular tableland (8f74205)
- [x] Modeled-domain matte + world-collision clamp (9c08211; matte applies to
      land too f5221d7; bed mesh discarded within the swash band of the LIFTED
      waterline f74b9a3). A/B reverts: #matte=0, #noclip=1.
- [ ] Headland: the ~110° corner cannot appear in the per-spot re-centered
      coastline — build the real shoreline from data/osm (audit: no frame
      reads as Pleasure Point at any altitude)
- [ ] LAND SCALE CUES: add the cliff-top walking path and its fence/rail to the
      rendered land. Align the path to mapped geometry where available and keep
      the fence human-scaled and sparse enough to establish wave/cliff scale
      without becoming the focal subject. Verify from the Cliff camera against
      the 2026-08-15 field stills before adding more generic terrain detail.
- [x] Kelp wedge: DARK, tracking the reef — LANDED 2026-08-18 (`#kelp=0`
      reverts). The 2026-08-11 fix darkened the CLUMPS but at ~half coverage
      the sand-lane return still made the tongue read bright; now the canopy
      saturates over the depth band (clump thresholds 0.24/0.64 → 0.08/0.44)
      and the lanes take a mudstone bed albedo on the same gates/ramps.
      Measured at drone/sim=42: upper-half luma std 11.4→6.7 (sewers) /
      16.4→13.0 (secondpeak); break-band/upper-half ratio 1.97→2.20 / 1.88→2.11
      — the break line is now the brightest structure, releasing the
      upper-frame contrast the 2026-08-14 hero read said the mottle owned.
- [ ] Crowd scatter (sitting riders bobbing; near-free realism + rider scale
      calibration per VISUAL_GROUND_TRUTH) and cliff riprap/swash/houses
- [~] Hunt the vertical bake seam + fixed light wedge — HALF IDENTIFIED
      2026-08-18. It was never a BAKE seam. Every foam clock in the model is
      `mod(phase, 2π)/ω`, a sawtooth that snaps from T to 0 at each crest, and
      two of them draw seams: (a) `tSince`, whose wrap is a level set of
      `rayPhase` — a crest line, near shore-parallel after refraction, so it
      prints a straight hard edge sweeping shoreward (the 2026-08-18 live
      report); (b) the comet's line clock `life.x`, whose wrap is a level set
      in x — a genuinely VERTICAL hard edge, cometFoam jumping 0.845 across
      0.25 m at Sewers. Both fixed by `crestClockS` (`#wrap=0` reverts);
      measured on the drone hero frame at secondpeak/sim48, columns carrying a
      ≥60-level one-pixel VERTICAL jump 20.8% → 5.7%. Still open: the FIXED
      light wedge, which does not move and is therefore not this.

### Track 2 — CPU twin: ABANDONED for now (Andy, 2026-08-11)
No parity port. Consequences to carry honestly:
- [ ] rideMetric DEPRECATED as an acceptance instrument (it scores the
      pre-depth twin; the 0.81–0.87 ratios are self-referential). Acceptance
      moves to capture-based instruments (Track 6).
- [ ] Rider stays garnish behind its toggle; known to stand off the drawn
      surface under #m4 default — do not tune rider items until/unless the
      twin returns.
      MEASURED 2026-08-18 (`scripts/measure_rider_surface.mjs`; live-uniform
      JS mirror of the GPU height path vs the rider mesh's world position,
      instrument proved to 1e-3 m against still water and mesh motion).
      The sign is the opposite of the live read: the rider is not floating
      ON TOP, he is BURIED — board 1.3–2.7 m BELOW the drawn surface at
      secondpeak sims 36/42/48/54, head at or under it at all four, and he
      is invisible in three of the four captures. Blame, in order:
      (1) TWIN HEIGHT +1.9–2.1 m at every clock — model-js `oceanH` has no
      depth path, so `growSyn` peaks at the AUTHORED contour while the GPU's
      `growGeo` (shoaling + depth-limited breaking) peaks at the BAKED line,
      69–121 m away; the drawn wave is ~1.9x the twin's there. Deprecated
      rideMetric now reads 0.29–0.38 vs its pre-M4 0.81–0.87 — the twin no
      longer agrees with itself. (2) CHOPPY OFFSET 2–5 m (GPU displaces the
      source point 6.3–8.9 m shoreward, twin 2.2–6.8) — that is the
      "behind the crest" z-error. (3) SET PHASE: ZERO — the runtime P DOES
      carry the #arm anchor (matches anchored phase to 1e-4, misses the
      legacy phase by 1.3–1.7 m). #arm did not desync the rider; it raised
      env^2 at the house clocks from 0.02–0.16 to 0.88–1.00, so a height
      error that scales with env got 2.5–7x more visible. Independent
      corroboration that the anchor does what 6b's fix claims.
      RECOMMENDED IF EVER PICKED UP (not implemented, Andy unbothered
      2026-08-18): take rider VERTICAL from a live-uniform height sampler
      and keep m4RideSolve for (x,z) — it already sits on the baked line to
      the mm. The camera-aim precedent; ~120 lines, ~9 height evals/frame
      against the ~35 rayS evals u_setRef already spends. Explicitly NOT a
      constant shim (burial varies with env — MEASUREMENT_LESSONS 8) and
      NOT full twin parity (the foam path never moves geometry).
- [ ] sound.js keyed to the authored line (audio ~7–20 s late vs drawn crash,
      replica-derived estimate) — accept for now; revisit with a GPU-side
      break signal, not a twin repair
- [x] Camera aim via authored breakLineJS (5–9° error) — LANDED 2026-08-18:
      Cliff/Lineup/Drone (and their Tour legs) aim at the BAKED line's action
      centroid (stage stations, section gaps excluded via breakGapAt), smoothed
      first-order in SIM seconds (τ=6 s — a +0.7 m tide step moves the raw
      centroid 69 m in one frame at Second Peak; the camera glides ≤2.9 m per
      250 ms). Snap on preset switch; tracking stops when the user grabs the
      orbit. `#aim=0` reverts to the authored rigs; Follow untouched (the rider
      already rides the bake). Measured (scripts/measure_cam_aim.mjs, sim=42,
      `__pointbreak.aimProbe().errDeg` vs the raw centroid): drone 1.8–13.6°
      → 0.0°, cliff 1.9–18.9° → 0.4–0.8° across the six mapped spots
      (Privates has no bake — authored fallback by design). sound.js stays on
      the authored line (its own Track 2 item above).

### Track 3 — direction becomes a condition (doc NOW, wire AFTER Track 1)
- [x] 3b DONE ALREADY (verified 2026-08-16, entry was stale): bakeBreakLine's
      cache key has carried `peelPhi` since the peel work (bed.js:912-914);
      `#swell=` was removed 2026-08-11 with a do-not-re-add note (main.js:1407);
      applyOcean carries `dp` as `state.swellDpObserved` (cdip.js:80). Nothing
      to do here.
- [!] 3-PREREQ FOUND 2026-08-16 — **the bank is authored at grazing incidence,
      so direction has almost nothing to modulate.** Inverting
      sin(α) = (c_b/c_s)·sin(θ_s) over the bank: sewers demands θ_s 56.9°,
      secondpeak 82.5°, thehook 88.0°, and firstpeak/jacks/sharks/privates
      demand sin θ_s > 1 — unreachable. A spot at its ceiling is at grazing
      incidence and sin() is FLAT there, so over the measured 25.0° D_p band the
      α swing is **0.8–3.0° at six spots and 12.5° at Sewers**. MODEL.md's
      "4–8° for every spot" is wrong in both directions; §2.6.2a added, §2.6.2
      and §2.6.4 rule 2 corrected, `tests/peel-ceiling.test.js` now pins both the
      demanded-incidence set and the bimodal swing (41/41 pass).
      **The 2026-08-13 retarget bought defensibility and spent the dynamic range
      3c exists to exploit.** DECISION NEEDED before 3c: re-anchor each α to a
      reference incidence inside the band (median D_p, θ_s ≈ 65–70°) so α sits
      BELOW its ceiling with headroom both ways — or accept that direction is a
      Sewers-only effect and scope 3c accordingly.
- [!] RE-ANCHOR AUTHORISED 2026-08-16 AND STOPPED, unexecuted. Carrying it out
      needs a reference incidence; deriving one from measured D_p through this
      repo's own phi_ref chain (validated: it reproduces MODEL.md 2.6.2's cos phi
      0.74->0.34 to within 0.01) gives alpha 17-29 deg across the bank against
      31-50 authored. Those are CLOSEOUTS — the bank is not what fails, the
      straight-contour identity theta_b = alpha is. It holds only when the break
      line follows the contours; here the contours ARE near-parallel (normal
      144.9-148.9 deg) but the break line runs along the POINT, oblique to them,
      and that obliquity is B_spot and is the whole peel mechanism.
      **So sin(alpha_max) = c_b/c_s bounds theta_b, not alpha** — which means the
      2026-08-13 retarget may have retargeted five spots against the wrong
      constraint. Recorded in MODEL.md 2.6.2a. NO PRESET CHANGED. B_spot is now
      the hard blocker for everything in Track 3, not an optional refinement.
- [!] B_spot DERIVATION ATTEMPTED 2026-08-16 — `scripts/measure_bspot.mjs`,
      `data/model/pp_bspot.json`, `docs/research/BSPOT_DERIVATION_2026-08-16.md`.
      The method is sound (stageAlongENU IS the NCEI contour tangent — verified
      against Sewer Peak's published 11.2 deg — so one rotation gives a compass
      bearing). **The line cannot supply one.** Perpendicular rms 23-50 m on
      113-312 m stages; end-to-end and TLS estimators disagree by up to 18.5
      deg; and the obliquity to the contour is **~0-5 deg, not the 30-45 the
      peel implies**. Cross-checked: these reproduce measure_alpha_profile.mjs's
      own bearing column exactly, so the measurement is right.
      **This also kills the 2.6.2a reconciliation.** That section proposed
      break-line obliquity as the reason alpha (31-50) exceeds what measured
      incidence gives (17-29). Measured, the obliquity is ~0-5 deg. So neither
      geometric route supports the bank; the 36-50 the HUD reports comes from
      the LOCAL FIT, whose window covers 10-28% of the stage — exactly what
      measure_alpha_profile.mjs's header warns certifies the fit, not the wave.
      Narrow reading only: alpha is a property of the fit, not of the line's
      global geometry. It does NOT follow that the render looks wrong — that is
      a VISUAL_GROUND_TRUTH/cam question this does not answer.
      NEXT: straighten the break line. `rms` in pp_bspot.json is the acceptance
      metric and is already instrumented. B_spot, and all of Track 3, waits on it.
- [ ] 3a. MODEL.md §2.4/§4.5 amendment NOW: split α into site character
      (authorship) vs incident swell direction (ocean state); per-spot
      compass→contour constants from PP_MAP_GEOMETRY tangent tables.
      Direction MODULATES the peel; the reef owns spot identity.
- [ ] 3b. Mechanical hygiene (can land with the doc): bakeBreakLine cache key
      gains direction (latent stale-bake bug); #swell= dead knob wired or
      deleted; applyOcean carries `dp` into state (today the HUD announces a
      direction the model discards)
- [ ] 3c. Wiring (gated on Track 1): SC116 incident band ±15–30°, seasonal
      (winter wrapped-NW 203–209° vs summer direct-S ~191°) and
      period-structured (windswell ~215° vs groundswell ~192°); condition-day
      bundles gain a direction field; drift samples the seasonal distribution.
      Calibration set: the 16-month CDIP pull (audit doc, THREDDS recipes).
- [ ] 3d. User control (gated on Track 1c' + 3a–3c): add an **Incident
      direction** control to the Conditions drawer, expressed as the SC116
      nearshore true bearing the swell arrives from. Clamp to the observed 90%
      band **188–216°**, default/reference **194°**; named days set their
      period/season-appropriate direction and live mode uses observed `waveDp`.
      The value must remain ocean state (never rewrite site character or break
      location), preserve a right at every canon spot, and produce the expected
      monotone **4–8°** derived-peel swing across the full control range.

### Track 4 — conditions truthfulness
- [x] 4a. TIDE POLARITY RE-MEASURED 2026-08-13 post-retarget — CORRECT, the
      inversion does not reproduce. 32 frames over a 128 s set cycle at The
      Hook (identical sim clocks, drone rig): low tide −0.8 renders 1.28×
      MORE bright foam px than high +0.7 at L≥205 (1700 vs 1329) and 1.77×
      at L≥160 (8235 vs 4664). The 2026-08-11 "2.5× fewer" figure came from
      the frozen sim=42 lull single-frame (ROUND2 already flagged it) plus a
      pre-retarget build. Wiring live tide is no longer blocked on polarity.
- [x] 4a'. LANDED 2026-08-13 night (`#wwarea`, default ON; spec "Whitewater ∝
      broken area"). One excess-keyed boost in ocean()'s residue path makes
      per-point foam visibility tide-invariant, so pixels ∝ area emerges:
      low/high bright-px ratio 1.80×→2.66× at L≥205, 2.08×→2.62× at L≥160
      (pinned nadir rig; physical band 1.93–4.95×). Two falsified builds
      recorded in the spec: a tSince-free term prints the Ψ-frozen zone
      boundary (new `u_refrFrozen` uniform excludes it), and a steady
      in-zone bore field DILUTES the ratio (1.53×) — don't retry. Residual
      compression (Beer–Lambert brightening, gate nonlinearity) accepted.
- [ ] 4b. Wind as data (chop scalar + drift direction are compile-time now);
      sky state (sun visibility → glitter amplitude; marine layer default)
- [ ] 4c. Decide the live clamps (Hs 3.0 m / Tp 18 s) — surface or raise
- [ ] 4d. Season + conditions control panel: extend the responsive drawer's
      domain sections rather than creating a second UI/state system. Season
      shapes the ocean-state distribution (direction, period, size, wind),
      never the reef/site preset; named days, live conditions and eventual
      manual controls all write through the same condition application path.
      Gate the truthful surface on 3c and the tide-polarity fix in 4a.

### Track 5 — the reads (after Track 1 geometry)
- [x] FIRST PASS LANDED 2026-08-13 late night (`#crest`, default ON; spec
      "Track 5, first pass"): face darkening (steep-face Beer–Lambert path +
      sky-light shed — the audit's tone-inversion mechanism found: vDepth is
      the still-water column, so standing faces showed the sand return),
      pocket foam floor, and a fresh-foam white core CONFINED to the line
      (unconfined "fresh" measured null — every inner bore is fresh behind
      its own crest). Argmax-to-line discriminator: first-break frame 100%
      within 20 m; active frames improve; late-set frames gated on 6c.
- [~] Remaining foam gaps: aging texture (chunky→lace→gray) has a reversible
      renderer probe at `#look=foam`; material + lifecycle hierarchy is
      `#look=full`. Neither is default pending live A/B. Still open: the shore-normal
      streaks house texture (legacy/bore terms still carry it; the 4a′ boost
      already dropped it), swash-band brightness vs the head at low tide
- [~] Face/lip tuning from the Cliff camera against VISUAL_GROUND_TRUTH:
      deterministic sim 42/48/54/58 captures now remove the detached black
      fold undersides in `#look=full` and attach a thin crest edge to the dark
      front face. The diagnosed front-facing planar wall is also corrected in
      the full probe: approach convergence drops 0.42→0.22 while pocket-owned
      break sharpening stays intact, turning the sim-42 slab into a rounded
      slope without regressing the other captured clocks. Still open before
      any default decision: the lip lacks the field footage's aerated volume.
- [~] 2026-08-18: AERATED LIP landed behind `#lip=1` (default OFF pending
      Andy's live verdict). Live report (wide cam, surfer on): "feels like
      the wave is curling not the foam?" — the fold/lip displacement is pure
      geometry, every foam term paints the band BEHIND the line, so with
      #arm putting a cresting set on the line the naked glassy curl is on
      permanent display. Diagnosis first (scripts/capture_lip_ab.mjs +
      measure_lip_luma.py — model-anchored loci: head from m4Ride, line from
      lineProbe, projected through the live camera): at the hero drone state
      the lip band is NOT the brightest thing — sewers sim 42 lip 60.0 vs
      face 58.0, sim 48 lip 176.6 vs face 206.8 (the face wins). Mechanism:
      a vertex-stage mask on the fold's own variables — cusp parameter
      S = Sapp+Sover and applied throwMag normalized by face height
      (plunging curtain, BOTH faces of the thrown ribbon, which also covers
      the dark fold-underside facet class honestly) plus
      0.30·pocket·(1−plunge) (spilling crest crumble) — H_eff-scaled,
      section-gap masked, read post-carve in GRID_FRAG with #arm-metric
      freshness (85 m e-fold behind the head). OFF→ON numbers at the pinned
      clocks: CONTROLS.md `lip` row. Judge live from drone AND cliff before
      any default flip.
- [~] 2026-08-18: LIP OVERTURN as GEOMETRY landed behind `#curl=1` (default
      OFF pending Andy's live verdict), the vertex-path half of the same
      complaint ("the curl is a thin shell, not water with volume").
      DIAGNOSIS FIRST, and it moved the target twice.
      (a) Overturn was NOT missing. The model's h field cannot overhang — the
      forward pitch is a phase skew, `theta -= skew*sin(theta)`, and no
      reparametrisation of a single-valued h(theta) is multivalued — but the
      RENDERER already folds the mesh through the Tessendorf offset, and does
      reach S > 1 at Sewers. New instrument `scripts/measure_curl.mjs` +
      `__pointbreak.curlProbe` (reads the SHIPPED SURFACE_GLSL chunk back off
      the GPU as a fragment pass, so it scores the surface that ships, not a
      JS twin): the shipped build already produces multivalued lips.
      (b) The real defect is WHERE the height goes. `dropMag` subtracts up to
      ~3*hM AT THE POCKET, so the wave is flattest exactly where it should be
      tallest: median pocket crest 5.16 m against 8.3 m one station away on
      the same wave (Sewers, q=high, sims 36/42/48/54).
      MECHANISM: replace throw+drop with the classical BEND. Water above
      0.35*h_crest curves onto an arc of radius R = h_crest/mix(0.30, 2.60,
      plunge); `dz = dy*(1-cos th)/th`, `y = y_bend + dy*sin(th)/th`. Never
      lifts, preserves arc length (thickness = volume), overhangs where the
      face is steeper than 1/sin(th). NUMBERS (Sewers q=high): max bend 132
      deg, median pocket crest 5.16 -> 7.88 m, stray trough folds 20.4 ->
      14.2 m (S capped at the cusp), swash `goo 0 / breathe 5.96%` identical
      OFF and ON. Sharks (xi 0.45) moves 12 deg — spilling barely overturns,
      which is the xi contract.
      FALSIFIED, both measured, both noted at the call site: (i) a rigid
      ROTATION of the crest band about the crest line — a rotation lifts
      everything seaward of its pivot and the lift nearly cancels the falling
      h, so the crest rendered as a FLAT-TOPPED SLAB (crest 8.3 -> 12.4 m);
      narrowing the seaward tail did not fix it, because the lever is the
      mechanism. (ii) `smoothstep(0.95, 1.40, excessQ)` as the "past the
      limit" gate — AT the break line excess is ~1.0 by construction, so it
      evaluated to 0.03 exactly where pocket = 1 (Second Peak best station:
      pocket 0.99, overturn 3.4 deg). Linear `clamp(excessQ, 0, 1.5)`, the
      same idiom as sizeGate.
      STILL OPEN: the ~15 m median "overhang" the probe reports in BOTH arms
      is the documented trough-crease pathology (`lam = S/(a*k^2)` amplifying
      chop where the amplitude estimate bottoms out), not a lip — it is the
      next thing to fix if the fold is judged noisy. HOOK for #lip: `vCurl`
      (turns of overturn) is the honest key when #curl is on; the shipped
      `aerCurtain` reads `throwMag`, which #curl computes but no longer
      applies. Judge live from cliff AND lineup before any default flip.

### Track 6 — instrumentation (cheap; start anytime — now the acceptance path
### since the twin instruments are deprecated)
- [x] **CADENCE AUDIT RUN 2026-08-13** (first execution since the harness
      landed; spec "The cadence audit, finally run"). Clock proved bit-exact
      first (`--verify-clock`, mean |ΔLuma| 0.000). **Set cadence VERIFIED:
      120.5 s foam-residual / 120.8 s mean-luma vs 125.0 s authored, two
      estimators agreeing to 0.3 s.** Three defects surfaced, below.
- [x] 6a. GROUP SPEED — CLOSED 2026-08-18, VERIFIED BY MEASUREMENT. The
      original reading: authored LAM/2T = 3.00 m/s vs physical gT/4π =
      11.71 m/s; set band 375 m where it should be 1464 m (carrier control
      6.18–6.64 m/s matched LAM/T = 6.00). The FIX was already M6p3's
      2026-08-13 cg unification (69fd820, same day as the audit): setEnv
      (GLSL + JS twin), setupLiftM and the audio envelope all run gT/4π, and
      a grep audit (2026-08-18) finds NOTHING still carrying LAM/2T. What this
      item still owed was measurement — the 375 m band was measured BEFORE the
      same-day fix and never re-measured after. Done: capture_temporal gained
      a set-envelope propagation estimator ([2b] in the cadence report — the
      carrier control's phase fit pointed at dF, mean-removed rows), probe
      proven live per MEASUREMENT_LESSONS 2 through the new `#cg=0` A/B flag
      (re-arms the retired constant across GLSL + both JS twins; CONTROLS.md).
      Sewers cadence rig, 260 frames × 2 runs: under #cg=0 the envelope
      measures 2.91 m/s foam-residual / 2.48 m/s luma (R² 1.00) — the retired
      3.00 m/s to 3%, band 363/310 m, the audit's defect reproduced; at the
      shipped default the same rows read 9.42 / 6.27 m/s (R² 1.00/0.99) —
      3.2× faster, toward gT/4π = 11.71 with a declared low bias (the carrier
      control itself reads 5.61 vs 6.00 true; 3.1–3.2 m/s foam advection
      mixes into the dF bin). Set cadence 121.7–122.4 s in BOTH runs vs
      125.0 authored — the beat period at a fixed point is cg-independent,
      exactly as the unification note argued, so the fix moved the band
      without touching the verified cadence. M6 part 1 (S-form cusp) was
      already landed/corrected 2026-08-11; nothing of M6 parts 1+3 remains
      open. Spec: "M6 part 3, closed out" addendum.
- [x] 6b. RESOLVED 2026-08-18 — the discriminator ran
      (`scripts/measure_peel_visibility.mjs`, hero state sewers/drone/sim=42):
      **(a) is the root cause, (b) its downstream symptom, (c) refuted.** Over
      the rideable stage (x ∈ [−191, 66], stageAlpha 36.4–37.5°) the baked
      line's median local luma is 57.5 = the frame's **19th percentile**;
      brightest station 135.8, under the L≥180 foam threshold; at sim=48 the
      stage max (82.4) ≈ frame median (79.1) — nothing at the line to recover.
      All top-luma clusters sit 115–390 m SHOREWARD in 3–4 shore-parallel
      bore/swash bands (#1 at z=+153 m, luma 165), which is what the pixel
      detector fits — hence 4.3–8.8° at R²≈0. The ONE line-attached bright
      feature is a ~100 px peak-255 patch at the takeoff kink; the 38° arm
      downstream carries zero foam. Defect is #look-INDEPENDENT (same in
      current/foam/full), so the #look call and the arm fix are separable.
      Instrument checks: project↔unproject round-trip 0.000 m, look-at →
      frame center exactly, three cold loads bit-identical. Curiosity: at
      Second Peak the first bore band parallels the line's bump 30–60 px
      shoreward — geometry survives one band back; at Sewers it doesn't.
      Rig trap for future scripts: warm-page hash-only goto races the app's
      needsReloadForHash reload — navigate via about:blank between configs.
      DIAGNOSED AND FIXED 2026-08-18 (`#arm`, default ON). The peel-visibility
      instrument (scripts/measure_peel_visibility.mjs) settled the split as
      (a)+(b): at the hero state the line's stage-median luma was the frame's
      19th percentile with every bright cluster 115–390 m shoreward. The
      per-term probe (scripts/probe_arm_terms.mjs, a live-uniform JS mirror of
      the GLSL foam path) then found the kill factors, in order:
      (1) SET-PHASE STRANDING — the group envelope's spatial reference was the
      pre-M4 authored contour (s = 0); the emergent line sits 74–247 m seaward
      (s = −74..−247 at Sewers), and the 6a cg unification (3.00→11.71 m/s,
      2026-08-13) stretched the band pattern 3.9×, so the house clocks
      (sim 36–54) sampled a set NULL at the line: env 0.00–0.24, every
      env²-gated line term ≤ 0.055 — while the env¹-keyed swash residue kept
      the shoreward bands bright. Fix: setPhase() anchors the envelope to the
      LIVE line (u_setRef = stage-median rayS of the bake) with a set cresting
      there at t = SET_ANCHOR_S = 45 s. Cadence 1/Δf untouched.
      (2) TEMPORAL COMET TAIL — the head's along-line speed varies ~13×
      (43 m/s flank vs 3–8 m/s on the visible 40–70° arm), so the 2.5 s model
      tail and 9 s fragment carve collapsed to 8–20 m exactly where the drone
      looks. Fix: age converts to metres behind the head (age·ω/|dS/dx|),
      decayed on 55 m (model) / 110 m (carve) e-folds; α→0 still closes out.
      (3) ATTACHMENT WEIGHT — brk's −6..14 m inside ramp is 0.216 AT the line;
      the comet now carries its own ramp (full weight at the line, same
      reef/mask/depth permission via brkW).
      Measured (pinned drone, corridor max over z ∈ [z_b−6, z_b+16], stage):
      arm subset x ∈ [12,66] band-median pct 0.17–0.19 → 0.35–0.90, band max
      65.9–66.8 → 212–239, stations ≥180: 0 → 4–18 at every house sim;
      Second Peak's top cluster moved from +156 m shoreward to dz = −4.3 m
      (on the line). `#arm=0` reproduces the legacy image bit-exact
      (sim42 median 58.7/pct 0.21 = the 6b baseline); `#arm=anchor|tail`
      bisect. Known pre-existing exposure: the fold-underside facets appear
      at the tall V-bottom head whenever a set crosses it — same artifact at
      legacy sim=110 with #arm=0, so it is the documented #look=full fold
      class, not an #arm regression.
- [x] 6b FOLLOW-UP, THE HARD FOAM EDGE — RESOLVED 2026-08-18 (`#wrap=0`
      reverts, default ON as a defect fix). Live report: foam terminating
      against straight edges that "paint diagonally late in the wave's life",
      reproduced at `cam=lineup` (the low/close rig), sewers, sim 42/48.
      The prime hypothesis — the 128-texel break bake reconstructed by
      `mix()`, differentiated by the #arm metric tail's ±2 m stencil — is
      REFUTED. Station spacing at Sewers is 4.72 m, `dSdx` is smooth over the
      arm (max jump 0.013 per 0.25 m), and the bisect is unambiguous once its
      confound is removed: `#arm=tail`/`#arm=0` show no edge because at these
      clocks they show NO WAVE (flat water); `#arm=anchor`, `#gap=0` and
      `#head=0` all keep the edge at full strength. What the anchor did was
      make the frame legible enough for a long-standing seam to read.
      CONVICTED: the crest clock. `tSince = mod(θ, 2π)/ω` snaps from T to 0 at
      every crest, and the snap is a level set of `rayPhase` — with the swell
      refracted to ~8–11° that is a near shore-parallel straight line. It was
      only ever invisible while foam had decayed to nothing by tSince = T, and
      it has not for a while: residue/lace/area taus run 1.6–2.4·τ against a
      15 s period, and GRID_FRAG's `ageK` is not a decay but a 0/1 LOOK flip
      (erosion amplitude, threshold width, and a 2× aftermath multiplier).
      Measured with the probe_arm_terms twin at three stations across the seam
      (0.25 m steps): model foam 0.90→0.42, 0.93→0.48, 0.85→0.20 and shipped
      foamM 0.87→0.13, 0.89→0.16, 0.996→0.028. In pixels at the lineup rig,
      91.6% of frame columns carried a ≥60-level ONE-PIXEL row jump.
      FIX AT THE SOURCE: a crest does not inject foam along a mathematical
      line. `crestClockS` ramps the clock back to zero over the last
      CREST_WRAP_S = 2.4 s (≈14 m at c = Λ/T = 6 m/s) instead of snapping, so
      every consumer — amplitudes and look selector alike — is continuous at
      one place, for one smoothstep. Applied to ocean()'s tSince,
      stripeAgeAt's tSince, the model comet's `life.x` and GRID_FRAG's tSince
      and carve clock. AFTER: max Δ foamM per 0.25 m 0.745/0.723/0.968 →
      0.099/0.071/0.057; columns with a ≥60-level row jump 91.6% → 1.5%
      (sim 42) and 38.6% → 0.0% (sim 48); on the drone hero frame vertical
      jumps 20.8% → 5.7% (secondpeak sim48). `#wrap=0` reproduces the pre-fix
      frame bit-exact (identical p90/max/frac).
      NO 6b REGRESSION: arm corridor x ∈ [12,66] band-median pct
      Sewers 0.843–0.944 → 0.799–0.894, Second Peak 0.883–0.940 →
      0.920–0.996; band max identical to 0.1 luma at all eight configs;
      stations ≥ L180 7/3/16/6 → 8/5/17/6 (Sewers) and 12/11/14/14 →
      15/14/14/16 (Second Peak); top cluster stays within a few metres of the
      line. Cost: four smoothstep+multiply pairs on the foam path, no change
      to any interpolant or texture fetch.
      At the Second Peak lineup rig the same strip of far bands goes from
      18.3–21.7% of rows carrying a ≥60-level one-pixel VERTICAL jump to 0.0%.
      NOT FIXED, and deliberately: `#slife`'s `alongF` wrap (default OFF, and
      its own header declares the step as the stripe head), and the
      fold-underside facets at the tall V-bottom head, which are unchanged by
      `#wrap` and remain the documented `#look=full` class.
      NOT FIXED, and newly named: at `cam=lineup`/secondpeak/sim48 the loudest
      hard edge left in frame is the SPRAY PLUME MESH — a faceted white solid
      with polygon silhouettes, several metres across, sitting on the break.
      It is geometry, not a foam field, so `#wrap` does not touch it; it is
      the next hard-edge item if the low camera is going to be shipped.
- [x] 6c. RESOLVED 2026-08-13 late night — the "persists 4× authored" reading
      was INSTRUMENT SEMANTICS (spec "6c re-derived"). The Lagrangian tracker
      follows the bore, and what stays correlated in that frame is the
      band-scale foam structure riding a front that takes ~57 s to transit
      the zone — a 17–24 s co-moving e-fold is the front's coherent lifetime,
      not foam decay. Proof: churning the noise lattices left the correlation
      table bit-identical. The τ-governed quantity (Eulerian tail after
      passage) measures 2.7–3.7 s vs authored 5–6 — at or BELOW authored, no
      defect. Advection re-measured healthy post-4a′: +3.47 m/s vs front
      3.09, linear across separations (the old 5.50-vs-4.03 gap predates the
      area boost's advected texture). Kept from the investigation: aftermath
      lattices now advect shoreward (3.2/5.0/4.0 m/s) instead of creeping
      sideways — the live "foam from the wrong direction" artifact class.
- [ ] Temporal audit harness: N-frame captures → zipper speed vs Vp=c/sin α,
      set cadence (is the 3.4× group-speed error visible?), foam advection.
      The audit's biggest blind spot: every visual claim was one frozen frame.
      The 3.4× was RECORDED as an open defect with the numbers in the
      spec's M6 section (setEnv/setupLiftM 0.5·LAM/T ≈ 3.2 m/s vs shoaling
      gT/4π ≈ 10.9 m/s at T=14) — fixed by the 2026-08-13 unification and
      verified in pixels 2026-08-18 (see 6a above).
- [x] Swash standing check landed (c538dcf, scripts/check_swash.mjs): goo +
      breathe measured across a FULL set cycle, not one frame. Perf landed
      with it: quality tiers with auto-fallback — vertex-bound, not
      fill-bound (662c8c1, #q=), land-vertex wave-math skip with the
      threshold recalibrated to 6 m (758b137).
- [ ] Absolute scale from pixels: crest spacing in a drone frame vs
      dispersion — confirms LAM shoaling with no replica involved
- [x] Constant dedup DONE 2026-08-12: γ and G live in dispersion.js only
      (bed.js/model-js.js import), LAM exported from model-js.js (sound.js
      imports); the GLSL consts in model-glsl.js stay the GPU source of
      truth. Verified bit-identical lineProbe on Second Peak. Residue:
      section.js and scripts/capture_temporal.mjs still carry local copies.
- [x] Audit the two unaudited surfaces — DONE 2026-08-11 (ROUND2_FINDINGS):
      web/ is now DEPRECATED rather than fixed; the deployed essay predates the
      indicted config (m4Enabled=false, 2026-08-10 build) so its figures stand
- Phase 3 FIRST VALIDATION PASS below remains the project's largest honesty
  gap; the temporal harness is its prerequisite instrument.
- [x] Validation METHOD written up 2026-08-12: `docs/research/VALIDATION_PLAN.md`
      (observables, source ranking, pre-registration, how to read the outcome)
      and `scripts/measure_cam.py` (the observation-side instrument, with a
      motion gate). Conditions half is free — SC116 hindcast, 221k hourly
      records back to 2000. Still UNRUN: no residual measured against a real day.
- [x] Method lessons collected: `docs/research/MEASUREMENT_LESSONS.md` — read
      before trusting any measurement in this repo.
- [x] CLIMATOLOGY LANDED 2026-08-16 — `data/climatology/pp_cdip_climatology.json`
      + `build_cdip_climatology.py` + `docs/research/PP_CDIP_CLIMATOLOGY.md`.
      25 y hourly SC116, 218,975 QC-passed records, whole years 2000–2024.
      Single-peaked winter season: Jan Hs p50 0.86 m vs Aug 0.47 m; 21.5% of Jan
      hours ≥1.3 m vs **zero hours in Jul/Aug across 25 years**. Direction
      collimated to a 25°-wide band about 198.6 °T (R=0.989) with a 9.5°
      seasonal rotation — which SIZES Track 3a: the α-split answers to a 25°
      band, not a free direction input. Also settles the two consumer sources:
      surf-forecast ρ=−0.77 (inverted, direction-gated — falsified outright in
      December, agrees to 1.9 pts in August), spitcast.com ρ=+0.06 (no signal;
      rejected, not transcribed). Trap found: `waveTp` is band-quantised to 19
      values, use `waveTa`. NOT done: the 20-band directional spectrum
      (`waveEnergyDensity`/`waveMeanDirection`), which is the measured
      replacement for the invented two-component set beat.
- [x] SPECTRAL SET STRUCTURE 2026-08-16 — `build_spectral_sets.py` +
      `pp_spectral_sets.json` + `docs/research/PP_SPECTRAL_SETS.md`. **A negative
      result, and the honest one.** The 20-band MOP grid is 0.005 Hz through the
      swell range, so the smallest RESOLVABLE Δf is 0.010 Hz and MODEL.md's
      0.006 Hz is below the floor: this instrument can neither confirm nor
      refute it, and no processing changes that. Spectral width (ν, σ_f) looked
      like the continuous substitute — stable across sea state — and is a cutoff
      artifact: 6.1× swing across defensible band cutoffs, so 0.125 Hz says the
      model is 3× wrong and 0.090 Hz says it is nearly right. NOT published as a
      number; the sensitivity table is the finding. **Do not retune dF from it.**
      What IS established: (a) bimodality is a minority state that thins with
      size — 23.8% of all hours, 12.6% above Hs 1 m, 8.9% above 2 m (absolute
      level is threshold-dependent 3–39%, the trend is at fixed thresholds);
      (b) when two components exist they arrive within 11.4° (p90 23.4°), which
      MEASURES and vindicates the directionless scalar beat — drop any plan for
      a directional two-component model. Script self-checks closure (Hm0 vs
      waveHs, 0.0000 m over 221k records) and fails loudly if band weighting
      breaks.
      **RETRACTION, same day:** this entry originally claimed MODEL.md's
      parameter row was self-inconsistent (`Δf ~0.006 Hz` → 11.3 waves/set vs
      its own "sets of ~5–7"). That was an analysis error, not a defect.
      `setEnv` is the full envelope cycle INCLUDING the lull, so `1/Δf` is the
      set-to-SET period while "5–7" counts waves inside one set — half the
      cosine above `envS` 0.5 is 6.0 waves at the card values, and consumers
      square the envelope. Confirmed empirically by the temporal audit's
      **120.5 s measured vs 125.0 s authored** at Sewers (Δf 0.008), a 3.6%
      miss on the set-to-set period. MODEL.md **§2.5.1** added 2026-08-16 so the
      next reader does not repeat it.
- [x] MODEL.md housekeeping 2026-08-16 — §2.5.1 added (above); and the stale
      `MODEL.md 2.5 still quotes 0.2` follow-up in `model-glsl.js` setupPeakM is
      cleared, because §2.5 has said `0.3·H₀·envS` since the 2026-08-11 raise.
- [x] MONTH SELECTOR LANDED 2026-08-16 — drawer `<select>` + `#month=january…december`
      (CONTROLS.md). Sets **H₀ only**, from `pp_monthly_ocean.js`: the p75 of Hs
      at SC116, de-shoaled by the shader's own Ks convention so the renderer
      does not double-shoal what MOP already transformed. Percentile is NAMED in
      the HUD ("January · p75 climatology") — a stated editorial choice, not
      tuning. Period is deliberately not varied: measured interpolated spectral
      peak is 14.4–15.2 s in EVERY month (range 0.79 s, non-monotonic — Sep
      longest, Nov shortest), which also corroborates the card periods. A month
      restores the site card's T/chop/dF, overrides H₀, and leaves tide alone;
      month and condition-day are mutually exclusive in both directions. 34/34
      tests pass.
- [x] PERMALINK ROUND-TRIP LANDED 2026-08-16 — closes the boot-only-hash-params
      defect for the **control** half of the contract. Controls now write back
      (debounced 120 ms, `replaceState`, defaults omitted so a default view is a
      bare URL); hand-edits re-apply live; boot-only params typed into a URL
      survive control changes. Everything else stays boot-only by design:
      re-running `applyHashParams()` would re-bake the reef, re-arm audio and
      re-seed the sim clock. Split into `applyLiveParams()` so boot and hash-edit
      run the SAME code — the two drifting apart is how a permalink starts
      describing a view that is not on screen. Contract in CONTROLS.md;
      `writeHashParams`/`bootOnlyParams`/`needsReloadForHash` are pure and
      tested (39/39).
      Two bugs the live verification caught, neither visible in a static read:
      (1) coalescing was on rAF, which is SUSPENDED in a hidden tab — the same
      hidden-tab rAF trap that faked the `#cam=drone` failure on 2026-08-14;
      moved to a timer, since writing a permalink is not a rendering operation.
      (2) the reload guard inspected only the NEW hash, so hand-editing
      `#month=july&m4=0` down to `#month=august` applied live and left the app
      at `m4=0` while the URL claimed the default. The guard now compares the
      boot-only SET across the edit, in both directions.

Priority order (STATUS 2026-08-11, after the workflow sprint 6709530 —
superseded by the PLAN above, kept for landed-status history):
0. [LANDED 2026-08-11 — `setupLiftM()`/`setupPeakM()`/`wetSand()` in
   web/js/model-glsl.js: lagged asymmetric set envelope, 0.3*H0 peak, confined
   shoreward of the 2 m contour so the lineup and break line never feel it,
   waterline emergent via max(bed,water), plus the drying band the last set
   left. MODEL.md 2.5 still quotes 0.2 — doc follow-up.]
   WATER PULL-BACK, minute-to-minute (REDEFINED 2026-08-11 by Andy: "less
   excited about 20m cycle tide, more expecting minute to minute tide pull
   back"). Mechanism is wave SETUP/SETDOWN, not astronomical tide: during a
   set, broken waves push ~0.15-0.3*H_break of extra water level up the
   shore; in the lull it drains back. Drive a shoreward waterLevel term from
   the SMOOTHED, LAGGED set envelope (setEnv, 1/dF ~ 167 s — already the
   minute rhythm; drain slower than surge). Waterline is emergent
   (max(bed,water)) so the shoreline advances/retreats for free, and bigger
   days pull back further — another size cue. NOTE: this deliberately
   overrules MODEL.md section 5's swash/backwash exclusion — record the scope
   change in MODEL.md when it lands. Astronomical drift demoted to secondary.
1. [LANDED 1a/1c + foam tail + sound; camera fixed + Tour; conditions bank
   shipped — commits b34f031, 6709530. Screensaver entry:
   web-three/#cam=tour&drift=1. Critique NEEDS REVISION traces to M4/M5, not
   defects.] SIZE -> CURL & CRASH. [1a+1c LANDED 2026-08-11; 1b = M6 part 3 still
   open]. Delegated size audit: docs/research/SIZE_AUDIT.md — master finding
   is that the surf-zone surface height is H0-INVARIANT by construction
   (depth-limited amp = 0.5*gamma*dep), so size can only enter via gates
   until M4 moves the break seaward; also corrected the 2026-08-10 cusp
   claim (S = lam*a*k^2 = 1, not lam*k = 1 — the old "Q = 1.13" never
   cusped). Landed: S-form overturn + excess sizeGate + violence-in-metres
   + sound sizeAmp. Open tail ranked in the audit (foam block H0-free is
   #1). Original three couplings:
   (a) throw/drop/spray amplitude is H0-NORMALIZED (hN = h/(H0*VIS) in
       choppyPos) — a 2.5 m day curls exactly as hard as 0.7 m. Scale the
       violence by actual H in metres, keep SHAPE governed by xi.
   (b) M6 part 3 — LAM frozen at 90 m so steepness H/L FALLS inshore.
       The eikonal Psi bake in bed.js is the machinery.
   (c) breaking excess (Hsh/Hlim, already computed in ocean() for foam)
       never reaches Q — big days should cross the cusp earlier and harder.
   Honest physics note: Iribarren says bigger H0 -> LOWER xi -> more
   spilling. Big != barrels; the right DAY = barrels. Violence scales with
   H; hollowness comes from the conditions bank (below).
2. CONDITIONS PICKER + "good day" curator. All six knobs exist (H0, T,
   alpha_deep, tide, xi, dF). Author a small bank of named condition-days
   ("8 ft WNW groundswell, low tide", "3 ft summer windswell") and steer
   toward the good ones; web/'s cdip.js (MOP SC116 nowcast, CORS verified)
   supplies a "right now at Pleasure Point" live mode — port it to
   web-three. Idle mode drifts conditions over ~20 min so a parked screen
   sees a session, not a loop.
3. [LANDED: burial root-caused (station 210 past every stageEnd), Tour
   auto-cut shipped. Residual polish: small-day Follow framing.] CAMERA.
4. [LANDED 2026-08-11: re-measured (envelope already follows — growGeo gave
   depth the height cap; no envelope work needed), rider continuity solve
   shipped (model-js m4RideSolve; riding ratio 0.81-0.87 vs re-scan's
   0.19-0.44), default ON for mapped spots, #m4=0 escape hatch.] M4 -> M5.
Then: [LANDED 2026-08-11: M5 synthetic reef — taxonomy back, derived alpha
span 29.3 deg, clamp+determinism verified] -> M6 part 4 (explicit lip
geometry) if the fold still doesn't read after 1-3. Deferred: wipeouts, ride grammar,
rider-sits-low. Essay/figures: DONE, frozen.
Packaging: fullscreen page first; .saver/Electron later (Psychodeli
precedent) — do not decide now.

## Phase 1 — proof of read (web/ raymarcher — **DEPRECATED 2026-08-11**)
> web-three is the only renderer. Do not maintain the raymarch build; its
> `u_reefWin` breakage (wave never breaks) is expected, not a bug. The shared
> modules under `web/js/` — model-glsl.js, params.js, cdip.js — stay
> load-bearing. See CLAUDE.md "Repo layout".
- [x] v0 web build (web/): raymarched cliff view + ortho drone view, zipper +
      sets + sections + A-frame + presets + live SC116 fetch. IT READS.
- [x] Sets + lulls (two-component beat) — in the shared model (setEnv/u_dF);
      verified in web-three (set-phase bands in the drone view)
- [x] Sections (crest noise, secondary zippers) — u_sections pulls the break
      line seaward in patches; verified in web-three (The Slot, σ=0.5)
- [x] A-frame mode — abs(x) fold via u_aframe; verified in web-three (mirrored
      double zipper). Demoted from a named preset to a parameter on 2026-08-10:
      the wave that demonstrates it is on the west side, not this point.
- [x] Preset bank of seven on keys 1–7, imported by web-three from
      web/js/params.js; all verified rendering. NOTE: the original bank borrowed
      three west-side names (Cowell's, The Slot, Middle Peak); retargeted to the
      real Pleasure Point canon on 2026-08-10 — Sewers, First Peak, Second Peak,
      Jack's (38th), The Hook, Sharks, Privates.
- [x] Real-data stage profiles: OSM `u`/canon windows + NCEI equal-elevation
      contour fits drive the shared GLSL, JS surfer twin, and both renderers
      for the mapped sites; superseded 2026-08-10 — six of seven now carry
      surveyed profiles, and only Privates falls back to the synthetic stage

## Phase 2 — web-three (SPEC'D: docs/WEB_THREE_SPEC.md)
- [x] M0 grid + vertical displacement + shared model GLSL (extract model-glsl.js)
- [x] M1 shading pass: fbm detail normals, fresnel+glitter, subsurface, foam-in-surface
      — acceptance: 10 s capture evokes ocean (grade vs Surfline PP cam, not stills)
- [x] M2 horizontal choppy displacement -> pitching lip when xi plunges
      (choppy toward-crest offset + shoreward lip throw at the pocket;
      normals FD'd on displaced positions)
- [x] M3 surfer on the ride line — procedural low-poly rider + board
      (makeSurferMesh() in web-three/js/surfer.js), posed by the JS twin of
      the model (web-three/js/model-js.js: surferState + height + choppy
      offset + FD normal), Follow camera preset (V cycle, zoom ∝ 1/distance)
- [ ] M3+ swap the primitive rider for a CC0/Blender low-poly glTF — the
      makeSurferMesh() factory is the single swap point (keep the 'rider'
      child name; lean is applied there)
- [ ] M3+ surfer visibility: occlusion by foreground crests, silhouette
      legibility at distance, spray at the board
- [ ] M3+ ride grammar: takeoff (paddle -> pop), bottom/top turn linked to face
      shape, ξ-aware style (carves on mush, tube stance when plunging),
      kickout at closeout sections
- [ ] M3+ wipeouts: section outruns surfer -> fall + tumble in whitewater
- [ ] M3+ camera language: cut between rides, drone follow mode
- [ ] M3+ Psychodeli port: surfer as musical protagonist (rider = melody line
      over the wave's phrase)
- Surfline PP cam (ground truth): https://www.surfline.com/surf-report/pleasure-point/5842041f4e65fad6a7708807

## Phase 2b — substrate (PARKED with the TouchDesigner vehicle)
- [~] FFTOcean_V1.0.tox as deep-water substrate — parked. web-three displaces
      the grid from the model directly and gets depth from the NCEI seabed, so
      there is no substrate to composite over. Only revisit alongside TD.
- [ ] Iribarren-driven pocket geometry (spill fringe vs thrown lip) — still
      live; belongs to web-three, not to a substrate

## Phase 2c — real depth (landed 2026-08-10, docs/MODEL.md 2.2)
- [x] NCEI seabed as `u_bed`; depth = (MSL-NAVD88 0.905 m + tide) - bed
- [x] Green's-law shoaling + depth-limited breaking (gamma 0.78)
- [x] Shoreline/beach/cliff as `max(bed, water)`; cameras derive the cliff top
- [x] Forward pitch: phase skew proportional to breaking excess
- [x] **Swell direction — the frame fix (2026-08-10, MODEL.md 2.3).** theta_s was
      in the model card and in no uniform, so crests arrived shore-parallel and
      alpha was carried by tilting the BREAK LINE off the shore. Relative angle
      right, absolute orientation wrong: at Second Peak the line crossed the
      measured waterline at x = 70 m and ran 322 m inland by the end of the reef
      window, so the peel had ~120 m of water out of ~265 m of reef and the rest
      read as a shore-parallel closeout. Now the swell carries the angle
      (`rayS`) and the break line follows the measured contour: 56-119 m of
      clearance on every mapped preset, and rider p90 height went 0.78-0.88 ->
      0.91-0.99 of the available crest (Privates' 1.18 overshoot gone).
- [x] **Depth gate was a union, not a product (2026-08-10, MODEL.md 2.3).**
      `max(brkZip, gate)` let depth permission alone break the wave: measured
      25-40 m SEAWARD of the break line across the full stage, reef or no reef,
      so the peel drew on top of an already-broken field. Invisible under the
      old tilted line (the zipper mask covered everything, so the gate was
      redundant) and dominant once the line was correctly placed. Now
      `inside * max(reef, gate)` — shore break outside the reef survives,
      nothing breaks before the crest arrives. Edge tracks z_b + 4..5 m.
- [x] **Refraction — LANDED 2026-08-10 (MODEL.md 2.4), simple form.** alpha is
      the DEEP-WATER swell direction; swellPhi() refracts it once to breaking
      depth (sin(phi_b) = sin(alpha) * c_b/c0, h_b = H0/gamma). Crest bearing
      58 deg -> 8.6-9.6 deg on every preset; the crest field stays a plane wave
      so the zipper keeps its closed form; JS twin bit-identical. The full
      eikonal version (Psi table, depth-varying phi) was built and REVERTED —
      rider/audio/twin all assume constant phi. Kept for M6-someday in bed.js:
      bakeRefraction/psiAt/zcAtPsi/incidenceAt (verified 17.1 -> 9.4 -> 7.9 deg
      at Second Peak). Known cost, and M5's whole motivation: taxonomy dead
      (~9 deg everywhere), V_p 38-50 m/s, audio quiet (zipper stations ~534 m
      apart).
- [ ] **M6 curl — SPEC'D 2026-08-10, see WEB_THREE_SPEC.md "M6".** The lip
      machinery exists; three quantities are wrong. (1) Gerstner cusps at
      Q = lam*k = 1, i.e. lam = 14.3 m at LAM=90; measured Q max is 0.24-1.21
      and only Sewers crosses, so six of seven presets CANNOT curl at any
      tuning. Make Q explicit and drive it from the break criterion.
      (2) xi is authored 0.35-1.15 but measures 0.19-0.33 on the corrected
      submerged slope — all seven are spilling. Report both; keep authored
      driving the render until M5's reef makes the measured one mean
      something. (3) LAM is frozen at 90 m but should compress 107 -> 61 m
      across the surf zone, so modelled steepness FALLS inshore instead of
      rising. Parts 1+3 are independent of M4/M5 — do them first.
      Part 3 reinstates the eikonal Psi bake already sitting dormant in
      bed.js (bakeRefraction/psiAt/zcAtPsi), staged so the rider moves to
      u_surferPos before the default flips.
      **Part 3 STEP 1 LANDED 2026-08-11 (`#psi=1`, default off, water only).**
      Physics extracted to web-three/js/dispersion.js (pure, THREE-free) +
      tests/dispersion.test.js (9 headless tests). Second Peak crest spacing
      now 104 -> 55 m vs the frozen 90 m. Two spec claims corrected by
      measurement: the "Guo (2002)" formula in bed.js was not Guo (4.98% error
      vs the real form's 0.79%), and "steepness decreases inshore, which is
      backwards" is half wrong — it decreases inshore of the break in ANY
      correct model; the real defect is the approach ramp (1.35x frozen vs
      2.46x variable). Open: step 2 rider onto Psi, step 3 sound.js, step 4
      flip default. Under #psi=1 the rider drifts off the crests BY DESIGN.
- [ ] Rider sits low on the FAST presets (Sewers p50 0.18 vs Second Peak 0.41).
      Not sections (tested: sections=0 moves it 0.01) and not the frame.
      `faceOff` is a fixed 11+/-5 m, and the phase step that implies scales with
      cos(phi), so low-alpha presets sit lower on the face. Decide whether that
      is correct (you do ride lower on a steep wave) or wants phi-aware tuning.
- [x] **M5 synthetic reef — LANDED 2026-08-11, measured (spec section has the
      acceptance table).** Mead&Black wedge + ridge noise added to the decoded
      uint16 grid ONCE in bed.js (compositeU16, floor-quantized) — one
      augmentation surface; M4 line, depth gate, shoaling, refraction and
      shoreline all inherit. Fit loop <=5 iters per spot: derived alpha
      37.8-67.1 deg, residuals 0.2-1.3 deg vs targets, taxonomy span 29.3 deg
      (was ~0-4 without reef). Clamp holds: 0 deepened / 0 above -0.5 m
      NAVD88 / 0 dry posts touched, shoreline shift 0 m; deterministic per
      spot name (checksums match across loads). B = three-way bed mode
      (measured+reef / plane / measured; #bed=), HUD "alpha 58 deg target ·
      56 deg derived · reef synthetic". Honest gaps: V_p 4.8-10.0 vs the 5-8
      band (depth-limited c_b, not fit error — Sewers breaks in 3.8 m at H0
      2.2), rider p90 >= 0.9 only at Sewers (fixed faceOff vs oblique line —
      the phi-aware stance item above), sections shader hack NOT retired
      (model-glsl.js follow-up), fit/clamp npm tests deferred (bed.js needs a
      browser; reefAudit exports the invariants).
- [x] **M4 emergent break line — LANDED 2026-08-11, default ON for mapped
      spots (#m4=0 reverts).** breakLine(x) = the H0*Ks >= gamma*h locus,
      baked 128x1, rebaked on spot/H0/T/tide change only. Re-measure findings
      recorded in the spec's M4 section: the 75-133 m gap is gone as a
      constant but the locus swings ~200 m across H0 0.7->2.5 (the part the
      authored line cannot express — SIZE_AUDIT's fix); the amplitude
      envelope already followed (growGeo made depth own the height cap), so
      the whole build was the rider. Rider = continuity solve (model-js
      m4RideSolve): takeoff at the S minimum (mid-stage at Sewer Peak — the
      crossing splits left/right there; we ride +x), one crest followed by
      bisection, hand-off at the stage end, clamped to stage bounds. Riding
      face-height ratio 0.81-0.87 (acceptance >= 0.7; the old global re-scan
      measured 0.19-0.44 and teleported up to ~570 m mid-ride). Caveat for
      M5: derived alpha at Second Peak is ~0-0.3 deg mid-stage (DEM ramp) —
      the near-closeout M5 predicts is already visible.
- [ ] Handedness: a left is now the sign of the swell incidence rather than a
      structural assumption, but `swellPhi()` still clamps positive and no
      control reaches it. Sign-preserving clamp + slider range if a left is
      ever wanted (no Santa Cruz preset needs one).
- [x] Tide as a live control ([ and ]) -> the break point slides while the
      breaking DEPTH stays fixed; Privates-on-a-lower-tide falls out of this
- [x] Underwater: seabed as its own mesh, surface-from-below (Snell's window +
      total internal reflection), murk, and a deepening ramp past the finite
      NCEI patch (extrapolation, flagged as such in BED_VERT)
- [x] Bed A/B (B): swap the measured bed for its own least-squares plane —
      same depth scale and mean slope, structure removed (0.3-0.9 m rms,
      submerged-fit; the 2.5-3.8 m figure fitted across the cliff, corrected
      2026-08-10).
      Removing the reef collapses the peel; this is the causal demo.
- [x] Cross-section station along-shore (, and .)
- [ ] DEM land artifacts: cliff-top structures read as rectangular steps at
      7 m posts; decide whether to smooth land or keep it honest

## Phase 3 — today's ocean
- [ ] CDIP polling (Web Client DAT) → live T, Hs, direction, bandwidth
      (web/ already fetches and sets H0 and T only)
- [ ] "Right now at Pleasure Point" mode
- [ ] Real forcing via surfpy (MIT, Python, NDBC + WaveWatch III): decompose a
      measured spectrum into swell components at build time and emit a
      generated data file, same pattern as build_geo_profiles.py. Supplies real
      spectral components (the set beat is currently invented) and a MEASURED
      swell direction. Direction is no longer structurally absent — MODEL.md 2.3
      gave the model a real incidence angle — but its value is still authored
      (phi = alpha), so the model asserts the incidence its peel angle implies
      rather than reading one. Feeding a measured direction in is what turns
      alpha from an input into a consequence, and is still the prerequisite for
      the emergent break line in Phase 2c.
- [~] FIRST VALIDATION PASS — the largest gap in the whole project. Drive the
      model with a specific historical swell and compare breaking position and
      height against an independent estimate (a forecast API, or the Surfline
      PP cam for that date). Not rigorous validation, but it moves the claim
      from "looks plausible" to "agrees with something that isn't us on N
      days". Until this exists, every public artifact must keep saying
      unvalidated. PARTIAL 2026-08-15: one Pleasure Point webcam recording and
      contemporaneous condition snapshots are logged in
      `docs/research/PLEASURE_POINT_CAPTURE_2026-08-15.md`; the social render
      reproducibly matches the reported 17 s buoy period. This is not yet a
      validation pass: the afternoon recording's clean unique minute measures
      15.9 s and 16.6 s crest intervals (mean 16.25 s, strongest-transect
      recurrence r=0.942), consistent with its 16 s primary report. It is too
      short and viewer-repeated to estimate set cadence, and no breaking-position
      or face-height residual has been measured.
- [ ] PEEL ANGLE FROM THE USGS SHORE CAMERA — new 2026-08-13, and the thing
      that would settle 1c'-c.6. Literature search establishes there is NO
      measured peel angle for ANY Santa Cruz break (SURF_SCIENCE_REFS 2.3.1,
      verified by first-hand greps of OFR 2007-1270, the 2025 Save The Waves
      study, and the CCC seawall findings). But USGS OFR 2007-1270 — already
      this project's bathymetry source — pairs a YEAR of 5 Hz shore-camera
      time-exposure/variance imagery with surveyed Pleasure Point bathymetry,
      which is exactly the input class consumed by Wave Peel Tracking
      (Thompson et al. 2021, Remote Sensing 13(17):3372) and by the CNN
      breakpoint+crest detector (Atkin/McIntosh/Bryan, ICCE 2022). Deriving
      the first measured α at Pleasure Point from already-public data is
      tractable, is publishable in its own right, and is the only route that
      settles whether the ≥58° targets or the wedge is wrong. Cheaper and
      far more rigorous than the weekend drone footage, and it does not
      depend on the surf being good.

## M7 — subsurface view (PROTOTYPED 2026-08-14, not scheduled)

Two standalone mocks in `experiments/`, nothing wired into web-three. Full
record, measured cost, and the port checklist: `docs/WEB_THREE_SPEC.md` "M7".
Deliberately NOT jumping the queue ahead of the peel-angle retarget.

- [x] Establish it needs no new physics — orbital ellipses, bed scour `u_b`,
      and the flattening-with-depth read are all closed-form linear theory over
      fields `dispersion.js`/`bed.js` already carry
- [x] 2D cutaway (`experiments/aquarium-cutaway-mock.html`) — doubles as an
      essay figure
- [x] 3D lattice + underwater flight (`experiments/orbital-lattice-mock.html`)
      — submersion atmosphere, bed-collision clamp verified
- [x] Orbit rings BUILT, WATCHED, CUT — too dense to read; the moving dots
      carry the depth story alone. Don't re-propose without reading M7 first.
- [x] Cost measured with a real GPU timer query: submerged 0.51–0.96 ms GPU,
      *cheaper* than the aerial view (the opaque bed occludes the transparent
      surface). Dive is effectively free; the lattice is not the risk.
- [ ] Port: swap the synthetic wedge for the augmented bed grid + the Ψ/Snell
      bake (the mock hand-rolls a Snell invariant)
- [ ] Re-read the "barrel-interior POV camera" out-of-scope line if this lands
      — M7 is an instrument, not a hero camera, but it moves toward one

## Someday
- [ ] Web explainer essay (zipper math, interactive) — the aquarium cutaway
      (`experiments/aquarium-cutaway-mock.html`) is a ready figure for it
- [ ] Psychodeli+ port: zipper as musical-phrase primitive
- [ ] PointBreak.tox release on derivative.ca (needs the parked TD vehicle first)
