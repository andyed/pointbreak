# TODO

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
- [ ] BREAK-LINE V STILL PRESENT AT SHARKS (found 2026-08-14). Default
      conditions, tide 0: the baked line runs at exactly the
      `SLEW_M_PER_M = 3.0` clamp for 16 consecutive stations (x −86 → −54,
      −6.00 m per 2 m step, a 100 m seaward excursion) and reverses at x −48.
      `derivedAlphaDeg` reads 52–72° across it — 25–40° above the local
      refraction ceiling, impossible for a planar component. This is the same
      "100 m seaward V at Sharks" the V-fix part 3 comment (`bed.js`
      bakeBreakLine, BRANCH FOLLOWING) names as the thing branch-following
      cures, and branch-following IS active here. Never took, or regressed —
      unknown. Every spot shows a pinned regime at 67–71°, so this is not
      Sharks-only. Until it is fixed, α summaries must exclude pinned
      stations.
- [ ] 1c'-c.4 DEAD DOWN-POINT THIRD: still a judgement, not a measurement —
      real point breaks shut down on the inside. If it stays, record it in
      MODEL.md; likely resolves with c.3.
- [x] 1d. M6p3 CLOSED 2026-08-13 (steps 2-4 landed, #psi DEFAULT ON, cg unified to gT/4π; spec "M6 part 3, closed out"). Superseded text follows: (sound onto Ψ, flip default) NO LONGER ride with the
      ensemble — judge a #psi-only default flip on its own merits (it holds α
      at 4.3° mean but raises spurious A-frames 3→5; steps 2–3 still open)
- Acceptance is now visual AND measured: drone capture shows a single-takeoff
  zipper; α HUD swing < ~5° for ±0.3 m H₀; spots distinguishable by their
  SURF (pairwise-RMSE instrument from the audit), not just coastline.
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
- [ ] Kelp wedge: DARK, tracking the reef (sim currently paints the reef
      tongue bright — value polarity inverted vs the NAIP ortho)
- [ ] Crowd scatter (sitting riders bobbing; near-free realism + rider scale
      calibration per VISUAL_GROUND_TRUTH) and cliff riprap/swash/houses
- [ ] Hunt the vertical bake seam + fixed light wedge (cause unidentified;
      provably NOT the Ψ bake — it was off in every audit capture)

### Track 2 — CPU twin: ABANDONED for now (Andy, 2026-08-11)
No parity port. Consequences to carry honestly:
- [ ] rideMetric DEPRECATED as an acceptance instrument (it scores the
      pre-depth twin; the 0.81–0.87 ratios are self-referential). Acceptance
      moves to capture-based instruments (Track 6).
- [ ] Rider stays garnish behind its toggle; known to stand off the drawn
      surface under #m4 default — do not tune rider items until/unless the
      twin returns
- [ ] sound.js keyed to the authored line (audio ~7–20 s late vs drawn crash,
      replica-derived estimate) — accept for now; revisit with a GPU-side
      break signal, not a twin repair
- [ ] Camera aim via authored breakLineJS (5–9° error) — cheap partial: aim
      cameras off the BAKED emergent line data (CPU-side bake already exists)

### Track 3 — direction becomes a condition (doc NOW, wire AFTER Track 1)
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
- [ ] Remaining foam gaps: aging texture (chunky→lace→gray), the shore-normal
      streaks house texture (legacy/bore terms still carry it; the 4a′ boost
      already dropped it), swash-band brightness vs the head at low tide
- [ ] Face darkening tuning from a LOW camera against VISUAL_GROUND_TRUTH
      stills (current verification is top-down; the money view is the cliff)

### Track 6 — instrumentation (cheap; start anytime — now the acceptance path
### since the twin instruments are deprecated)
- [x] **CADENCE AUDIT RUN 2026-08-13** (first execution since the harness
      landed; spec "The cadence audit, finally run"). Clock proved bit-exact
      first (`--verify-clock`, mean |ΔLuma| 0.000). **Set cadence VERIFIED:
      120.5 s foam-residual / 120.8 s mean-luma vs 125.0 s authored, two
      estimators agreeing to 0.3 s.** Three defects surfaced, below.
- [ ] 6a. GROUP SPEED 3.9× WRONG (measured): authored LAM/2T = 3.00 m/s vs
      physical gT/4π = 11.71 m/s; set band 375 m where it should be 1464 m.
      Control confirms it — measured carrier phase speed 6.18–6.64 m/s matches
      LAM/T = 6.00, not √(g·h_b) = 5.26. **This is M6 parts 1+3**, now with a
      temporal argument on top of the steepness one. Fix there, not here.
- [ ] 6b. SEPARATE THE α DISAGREEMENT before acting on it. Pixel α reads
      4.3–8.8° across rigs vs 38° authored / 38° stageAlpha, but the detector's
      break-line fit is R² = 0.00–0.05 over a 378 m-wide activity band — it has
      no line to fit, so none of those numbers is a measurement. Three
      unseparated causes: (a) the render doesn't express the peel (Track 5 foam
      attachment), (b) the detector is captured by a brighter non-break feature,
      (c) 38° is real but buried. **Discriminator is ONE capture**: overlay
      `lineProbe()` on a frame and look at where the baked line falls relative
      to the bright bins. Consistent with the 2026-08-11 audit's independent
      "α collapses to ~8–10° visible crest angle" — two instruments now say the
      picture doesn't show the geometry's peel.
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
      The 3.4× is now RECORDED as an open defect with the numbers in the
      spec's M6 section (setEnv/setupLiftM 0.5·LAM/T ≈ 3.2 m/s vs shoaling
      gT/4π ≈ 10.9 m/s at T=14) — fix gated on M6p3 steps 2–4.
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
- [ ] FIRST VALIDATION PASS — the largest gap in the whole project. Drive the
      model with a specific historical swell and compare breaking position and
      height against an independent estimate (a forecast API, or the Surfline
      PP cam for that date). Not rigorous validation, but it moves the claim
      from "looks plausible" to "agrees with something that isn't us on N
      days". Until this exists, every public artifact must keep saying
      unvalidated.
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

## Someday
- [ ] Web explainer essay (zipper math, interactive)
- [ ] Psychodeli+ port: zipper as musical-phrase primitive
- [ ] PointBreak.tox release on derivative.ca (needs the parked TD vehicle first)
