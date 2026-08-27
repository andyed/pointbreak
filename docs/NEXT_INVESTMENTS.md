# Next investments

**Status:** implementation-ready sequencing after the 2026-08-26 correctness
and anatomy tranche. This is a decision document, not evidence that any item
below has shipped.

The last tranche fixed three authorities before tuning the picture:

- breaker phase, lifecycle, foam provenance and material age now follow source
  water, while terrain, coverage, light and fog remain world-space;
- shoaling now uses finite-depth group velocity from the same Guo wavenumber as
  the carrier phase;
- peel is now reported as a signed crest-relative quantity, although the reef
  is deliberately still fitted to its named legacy line bearing;
- curl, aerated lip, connected curtain, causal onset and `Sapp = 0.22` are the
  default anatomy. The detached bright plate is gone from the judged matrix.

That success changes the investment question. The next work should add the
missing event and remove remaining authority splits, not reopen the anatomy
bundle or compensate for bad state with another material pass.

## Ranked portfolio

| rank | investment | leverage | principal risk | default sequencing |
|---:|---|---|---|---|
| 1 | Continuous break activation and canonical reef fit | Very high: every breaker, peel and crash consumer depends on it | Very high: a plausible direct refit already reversed Second Peak through a closeout | Foundation; land before final crash promotion |
| 2 | Transported crash and roller state | Highest immediate visual return | High: state can become garnish, non-deterministic particles or a second break authority | Prototype alongside rank 1; integrate after its field is stable |
| 3 | Finite-depth set propagation | Medium-high systemic return | Medium-high: linear group speed near breaking may be a worse story than the current offshore approximation | Measure first; do after ranks 1–2 unless the probe shows a large visible phase error |
| 4 | Narrow CPU/GPU surface unification | Medium visual return, high truthfulness return | High cost and sync risk if treated as a full parity port | Migrate only proven consumers, last |

Parallelism belongs in **spikes and measurement**, not in simultaneous edits to
`shared/model-glsl.js`, `web-three/js/bed.js` and `web-three/js/shaders.js`.
The break-field and crash probes may be explored in parallel, but one owner
must integrate the shared authority and run the combined matrix.

## 1. Continuous break activation and canonical reef fit

### Decision to earn

Replace the binary onset/candidate-selection surface with a continuous
break-activation authority, then fit the synthetic reef against the canonical
signed peel metric. Do not merely soften the final line or move the threshold.

### Evidence

- `web-three/js/bed.js` explicitly reports
  `fitMetric: 'legacy-break-line-bearing'` and
  `canonicalFitDeferred: true`. Direct canonical retuning against the current
  locus made Second Peak pass through a closeout and reverse.
- `docs/research/MEASUREMENT_LESSONS.md` section 14 measured discontinuous
  35–172 m line changes across a 0.01 m H0 step at all six mapped sites. The
  disappearing dips were only 0.002–0.144 m deep on beds with 0.31–0.93 m
  residuals.
- Greedy, Viterbi, shoreward-most, seaward-most and a residual-derived merge
  threshold were all tried. The threshold moved the knife-edge and increased
  flip counts. Another post-selection smoother is not an untried solution.
- The new `derivedPeelGeometry()` already supplies signed alpha, crest-relative
  phase derivatives, breakpoint velocity and a stable target interface. The
  readout is ready; its selected locus is not.

### Owner and paths

Primary owner: **break-field/reef physics**.

- `web-three/js/bed.js`: activation bake, reef fit, break diagnostics
- `web-three/js/peel-geometry.js`: canonical peel evaluation only
- `shared/model-glsl.js`: renderer consumption of the activation authority
- `web-three/js/main.js`: uniforms, HUD diagnostics and legacy A/B
- `tests/peel-geometry.test.js`, `tests/peel-ceiling.test.js`: authority and
  operating-band gates
- new `scripts/measure_break_activation.mjs`: adjacent-state continuity and
  topology report

### Implementation slices

1. **Instrument before selecting.** Export the raw breaker excess
   `F(x,z) = H0 Ks - gamma h` and every current crossing over the authored stage.
   Record source coordinates, mapped-bed validity, limiter/gap status and the
   current selected branch. The instrument must reproduce the shipped bake
   before it is used to judge a replacement.
2. **Compare continuous representations.** At minimum compare an
   activation-weighted ridge/centroid and a finite-width activation band. Both
   must retain the sharp per-wave onset clock without reducing the bed field to
   a new hidden yes/no candidate list. A scalar `smoothstep` around the same
   threshold is not sufficient by itself; it still needs a continuous spatial
   owner for the route and handedness.
3. **Wire one authority.** Break permission, lifecycle seeding, foam, curtain
   landing and the HUD must read the same activation field. Gap and slew-clamp
   channels may remain as diagnostics during the A/B, but may not silently
   define breaking on the new arm.
4. **Refit against canonical peel.** Change the reef objective only after the
   activation continuity gates pass. Fit signed crest-relative alpha over the
   declared clean/on-reef window, report the off-reef result separately, and
   reject a fit that achieves magnitude by reversing handedness.
5. **Promote as a pair.** Do not land a canonical fit on the legacy locus or a
   continuous field still calibrated to the legacy line bearing as the final
   state. Keep a temporary `breakfield=0` whole-path revert until the combined
   QA matrix is accepted.

### Acceptance gates

- The adjacent-state sweep covers all six mapped presets across the documented
  H0, period and tide operating basis. Halving a parameter step must reduce the
  activation-field change rather than relocate a fixed jump; exceptions are
  allowed only at a declared no-break boundary.
- No clean/on-reef station reverses the preset's authored handedness. Limiter-
  pinned stations cannot count toward a passing alpha residual.
- At reference conditions, the canonical clean-window alpha residual is at
  most 5 degrees for every fitted mapped preset, or the preset is explicitly
  rejected as outside the model family. The HUD and test must report the same
  signed number.
- Across `H0 +/- 0.3 m`, the stage clean-window alpha swing remains below the
  existing approximately 5-degree acceptance band unless the site crosses a
  declared no-break boundary.
- A renderer capture matrix covers all seven presets, drone/cliff/lineup,
  small/card/big states and representative tides. No new A-frame is accepted
  outside Sewers' documented exception.
- The old `legacy-break-line-bearing` fit is unreachable on the promoted arm;
  a test pins that there is one active peel authority.

### Rollback and non-goals

Rollback is the complete legacy bake plus legacy reef calibration, not a mix of
new activation with old fit. Preserve it for one judged release only.

Non-goals: no DEM beautification, no monotonic line repair, no new merge
threshold, no observed `D_p` wiring, no attempt to force breaking below the
declared peel floor, and no claim that every authored alpha is physically
reachable before the fit says so.

### Second guess before committing

The alternative may be to **accept** the discrete regime change and strengthen
the declared operating floor, rather than invent a continuous line where the
model has insufficient bathymetric resolution. The spike must demonstrate that
continuity preserves a recognizable, sharply timed break and does not merely
blur the closeout. It must also test whether reef extent or component geometry,
not only the selector, is what prevents the canonical target from being
reachable.

## 2. Transported crash and roller state

### Decision to earn

Give the landing lip a visible consequence: impact at curtain contact that
feeds white mass transported down-face and down-line as a decaying roller.

### Evidence

- The promoted anatomy bends the lip and closes its connection to the face, but
  `TODO.md` and the refreshed `cover-anatomy` QA row agree on the remaining
  read: the lip lands without a persistent crash/roller state.
- The existing `#splash` path was measured as a tiny garnish, roughly 0.1% of
  drone pixels and absent in one cover frame. Increasing its height does not
  create transported mass.
- `breakerLifecycleAtX` already has an impact channel, and the curtain knows its
  tip and landing edge. Timing and contact geometry exist; transport and
  material persistence do not.
- Source/world ownership is now explicit. A roller seeded from a source-water
  event must not query its lifecycle again at the displaced world position.

### Owner and paths

Primary owner: **breaker state and material**, integrated with the break-field
owner from rank 1.

- `shared/model-glsl.js`: canonical impact source, age and transport functions
- `web-three/js/shaders.js`: roller/deposit geometry or surface material
- `web-three/js/main.js`: curtain-contact inputs, feature A/B and diagnostics
- `scripts/build_qa_sheets.mjs`: current-default anatomy/crash sequence
- new `scripts/measure_crash_transport.mjs`: origin, displacement, lifetime and
  screen-coverage measurements
- `tests/breaker-anatomy.test.js`: default, revert and authority guards

### Implementation slices

1. Define one `impactSourceAt(sourceXZ, t)` from continuous break activation,
   lifecycle impact gain and curtain contact. It must be zero before contact
   and outside the active landing band.
2. Start with deterministic analytic advection: retain event time and source
   coordinate, then evaluate displacement and decay from canonical time. This
   keeps `speed=0`, permalink clocks and filmsheets seek-safe. A ping-pong
   texture or particle history is admissible only if arbitrary-time replay is
   exact or bounded replay is part of the capture contract.
3. Split the visible result into only the mechanisms evidence requires:
   a short impact deposit at the curtain landing and a longer-lived roller
   transported down-face/down-line. Both share one source and clock.
4. Make size derive from incoming/breaking scale and plunge character, then
   test spilling Sharks and synthetic Privates for graceful near-zero output.
   Do not add a per-site crash-strength bank.
5. Judge motion in tracked-wave sequences. Still frames may judge silhouette
   and material, but cannot certify that mass lands, travels or decays.

### Acceptance gates

- For one tracked crest, impact is absent in the pre-break frame, begins at the
  curtain landing, advances monotonically from that origin, and decays without
  teleporting to the next carrier. The measured trajectory must scale with
  elapsed time over at least three separations.
- Re-seeking the same permalink clock from a clean page produces pixel-identical
  output. Playback rate and a prior visit to another clock cannot change it.
- The crash remains attached under source-coordinate displacement and under
  all current camera rigs. There is no second break line encoded in a mesh or
  material threshold.
- Screen coverage grows monotonically across small/card/big Sewers states, but
  does not create a mature plunging plume at spilling Sharks or bed-less
  Privates.
- The existing 122-test model suite, geometry/depth/swash checks and all-seven-
  preset camera matrix remain green. The final live gate is an ordered
  five-clock cover plus drone row with a plain, flag-free URL.

### Rollback and non-goals

Ship the spike behind one whole-state `crash=0` revert. Keep `#splash` off so
two effects cannot impersonate one event during judgment.

Non-goals: no Navier-Stokes solver, no spray-volume claim, no generic particle
system, no foam-material redesign, no revival of `look=foam`, and no tuning of
the promoted curl/curtain/onset bundle unless the transport measurement
convicts it.

### Second guess before committing

The visually strongest solution may be a thin analytic deposit and streak
field, not a persistent Eulerian state buffer. Conversely, a purely analytic
mask may read as another shader garnish. Run both in the same tracked-wave rig
and require measurable transport. Also test whether the roller should move with
the bore, the down-face water, the breakpoint, or two of those as separate
phases; choosing a velocity because it looks dramatic would create a new
unowned quantity.

## 3. Finite-depth set propagation

### Decision to earn

Decide whether the set envelope and setup surge should propagate on a baked
finite-depth group-travel-time field rather than the current constant
deep-water group speed.

### Evidence

- Shoaling now evaluates exact finite-depth `cg(h)`, but `groupSpeedM()` still
  advances every set band at `gT/(4pi)`. Those can be different approximations
  for different jobs, but the difference is currently a convention, not a
  measured decision.
- The existing constant fixed a real 3.9x error caused by applying `c/2` to the
  90 m display wavelength. The fixed-point set period is already validated to
  3.6%; replacing it must not re-litigate `dF` or the envelope floor.
- The refreshed set sheet correctly removes the carrier with a `+/-T/2`
  reducer and exposes a separate policy cost: Sewers' monthly requests all draw
  at the same 1.61 m peel floor. A propagation change cannot be credited with
  fixing that authored policy.

### Owner and paths

Primary owner: **dispersion and temporal phase**.

- `web-three/js/dispersion.js`: `cg(h)` and travel-time integration
- `web-three/js/bed.js`: bake group delay along the same ray/depth authority
- `shared/model-glsl.js`: `setPhase`, `setEnv` and `setupLiftM`
- `web-three/js/main.js`: delay texture/uniform and legacy A/B
- `scripts/measure_wave_scale.mjs`, `scripts/probe_arm_terms.mjs`: temporal and
  line-anchor parity
- new `tests/set-propagation.test.js`: travel time, anchoring and period guards

### Implementation slices

1. Measure `tau_g(s) = integral ds/cg(h(s))` from the offshore reference to the
   live stage using the same depth and Guo wavenumber authority as shoaling.
   Report the delay difference against constant `cg0` at the break line and
   shoreline before building a visible arm.
2. If material, bake a monotone delay field and evaluate
   `setPhase = 2 pi dF [t - (tau_g(s)-tau_g(s_ref)) - t_ref]`. Preserve the
   existing live-line anchor exactly.
3. Route `setEnv` and `setupLiftM` through the same phase. Audit sound and any JS
   mirror; a consumer that cannot share the authority must be labeled legacy or
   held back.
4. Rebuild the set filmsheet with the carrier-window reducer unchanged.

### Acceptance gates

- At any fixed station the measured set-to-set period remains `1/dF` within 1%.
  The envelope floor and peak remain bit-identical at the reference station.
- Travel time is monotone along the ray and converges when integration spacing
  is halved. No shallow-depth clamp may introduce a visible phase kink.
- Set crest, line-attached breaker terms and setup surge remain phase-coherent
  at the live break line; the existing anchor clocks continue to put the peak
  in column three.
- `check:swash` passes, and shoreline motion does not lead the responsible set.
- In-page A/B timing and rendering stay within the project's existing frame
  budget; do not use cross-launch timing as evidence for a small effect.

### Rollback and non-goals

Keep constant `cg0` as `setprop=0` through judgment. Roll back the whole phase
authority, not only `setEnv`, because setup must stay coherent.

Non-goals: no `dF` retune, no envelope-floor retune, no new seasonal policy, no
multi-frequency spectrum, no swash solver and no claim that linear `cg` remains
valid inside an actively breaking bore.

### Second guess before committing

Finite-depth `cg` is unquestionably right for the shoaling flux calculation;
it is not automatically the best propagation model through the breaking surf
zone. Compare three domains explicitly: offshore-to-break delay, break-to-
shore setup response, and the currently visible set bands. If the difference
is small on screen, or if the shallow integral is dominated by a clamp where
linear theory has failed, retain the simpler offshore group speed and document
the boundary rather than promoting precision without validity.

## 4. Narrow CPU/GPU surface unification

### Decision to earn

Replace only shipping decisions that still score or place against the obsolete
CPU surface twin. Do not begin with a full GLSL-to-JS parity port.

### Evidence

- `rideMetric` was invalidated because it scored a pre-depth CPU twin; the
  instrument certified its replica rather than the renderer.
- The measured rider error is large and state-dependent: its board sits
  1.3–2.7 m below the drawn surface at sampled Second Peak clocks, while the
  twin's crest is about 1.9–2.1 m wrong. A constant shim is ruled out.
- Camera aim already moved successfully to the baked line without requiring a
  full surface port. Audio remains keyed to the authored line and is estimated
  7–20 s late, but that estimate is itself replica-derived.
- GPU surface probes already exist and are the trusted authority. The question
  is how to batch and consume them without introducing readback stalls.

### Owner and paths

Primary owner: **runtime query interface**, with a separate consumer owner for
each migration.

- `web-three/js/main.js`: batched query scheduling and live uniforms
- `web-three/js/surfer.js`: optional rider vertical placement only
- `web-three/js/sound.js`: optional authoritative break-event timing
- `web-three/js/bed.js`: baked-line queries, not a second height model
- existing surface/curl probes plus a new `tests/surface-authority.test.js`
- `scripts/measure_rider_surface.mjs`: renderer-vs-consumer parity

### Implementation slices

1. Inventory every CPU twin consumer and classify it as shipping geometry,
   audio, camera, diagnostic or dead code. Migrate nothing merely because it
   exists.
2. Prototype one batched authoritative query interface: positions and canonical
   time in, rendered surface position plus break diagnostics out. Prefer a
   small GPU probe/readback or generated shared primitive over hand-porting the
   entire shader.
3. Migrate rider **vertical** placement first only if the rider is being kept as
   a product feature. Preserve its existing baked-line horizontal solve.
4. Measure the audio break signal directly before changing sound timing. Migrate
   it only if the authoritative error is audible and materially large.
5. Delete or quarantine deprecated metrics after each consumer has an
   authoritative acceptance path; do not leave two callable truths.

### Acceptance gates

- Query output matches the rendered probe to 1 mm for still water and 1 cm for
  the moving surface at the sampled position/time matrix.
- Rider board clearance remains within a declared visual tolerance across four
  clocks and at least Sewers, Second Peak and Sharks; no constant offset is
  accepted.
- Any audio change is validated against the renderer's break event, not against
  the old twin, and is judged in motion.
- Performance is measured within one page session. Batched queries add less
  than 5% to the relevant frame-time channel and introduce no recurring CPU
  long task; otherwise the consumer stays legacy/off.
- Tests fail if a migrated consumer imports or calls the deprecated height
  twin.

### Rollback and non-goals

Rollback is per consumer (`riderSurface=legacy`, `soundBreak=legacy`) while the
query interface remains available for measurement. A consumer that cannot meet
the performance gate does not block the others.

Non-goals: no complete CPU foam/material clone, no automatic GLSL transpiler,
no rider animation redesign, no camera rewrite, and no parity work whose only
beneficiary is a deprecated metric.

### Second guess before committing

The rider is garnish and audio timing has not yet been measured from the real
surface. Either may be cheaper and more honest to disable than to unify. A GPU
readback can also make the architecture more correct while making animation
less smooth. Require a consumer-specific product win before paying the shared
complexity cost; if several consumers ultimately need the same query, then and
only then invest in a generalized interface.

## Portfolio acceptance and order

1. Freeze a clean baseline capture manifest and app digest after the current
   tranche is committed. The existing refreshed sheets are useful evidence but
   correctly declare a dirty build.
2. Run rank 1's field instrument and rank 2's deterministic crash spike in
   parallel. Do not allow the crash spike to invent its own break line.
3. Land continuous activation plus canonical fit first. Rebase the crash source
   onto that authority, then run the combined all-preset temporal matrix and
   live judgment.
4. Measure rank 3 before scheduling implementation. A small or validity-limited
   effect is a documented no-change result.
5. Take rank 4 consumer by consumer. Full twin parity remains out of scope.

The release gate for every visual investment is the same: deterministic URL,
current-default filmsheet, measured claim, live eye, revert, and documentation
that names what remains false. A green still image cannot certify propagation,
transport, impact or decay.
