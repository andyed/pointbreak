# Ψ promotion — the wave that shortens as it shoals

**The next investment in core wave shape, specified before it is built.**
Method-named per house convention: Ψ is the eikonal phase `Ψ(contourZ) =
∫kz dz` that `bed.js` already bakes per site, and promotion means the carrier
runs on it instead of the frozen 90 m plane wave. Written 2026-08-24; the
evidence it cites is committed as of `201ad24`.

## 1. Why this, and why now

The model has already named its own next shape frontier, in writing. MODEL.md
§2.2a closes with the unclaimed remainder of the skew correction:

> the physical face angle is still far below a real breaking wave. The
> steepest point of the front face at the line is **6.8–9.9° physical**
> against Carini et al. (2021)'s 22° spilling / 30° plunging at breaking
> onset. … closing the rest needs the frozen 90 m wavelength (`u_psiMix` —
> the wave never shortens as it shoals) and the 20 m displacement clamp,
> **not** more skew: `s` already sits at its monotonicity ceiling of 0.8 at
> the line, and the ceiling is structural.

That sentence names two mechanisms. One is done: the 20 m displacement clamp
became the wave-derived `S/k` ceiling on 2026-08-22 (`#lamcap`, fold points
−41…−56% across six clocks, crest height bit-identical). The other — the
frozen wavelength — is this spec. The skew knob is at a structural ceiling,
the clamp is fixed, so wavelength compression is not one candidate among
several; it is the only remaining lever §2.2a's own measurement points at.

The reason it is the *right* lever and not merely the remaining one: a wave
steepens as it shoals because `k` rises while `H` is Ks-limited — steepness
`H·k/2` grows through the wavenumber, not the height. Every shape mechanism
downstream of the carrier already parameterises on `k` and inherits the
correction for free:

- the cusp parameter `S = λ·a·k²` and the choppy fold it drives;
- the offset ceiling `|off| ≤ S/k`, whose own comment block anticipates this
  spec: *"it shrinks with the shoaling wavelength on its own"*;
- the bend's crest spacing `kz = k·cos(φ)` (which crest bends, and how wide);
- the throw, now denominated in `S/k` (`#throwlen`).

One change, made where the phase lives, steepens the face for the physical
reason — instead of four calibrations chasing the same defect from below.

## 2. What exists (inventory, verified against source)

| piece | state |
|---|---|
| `bed.js bakeRefraction` → `dispersion.js integratePsi` | built; 256-sample Ψ table per site, trapezoid over the measured bed, real dispersion at live ω, alongshore κ conserved (Snell) |
| `u_psiMix` / `#psi=1` | wired, water only, OFF by default |
| `kLocalAt(xz)` | collapses to `2π/LAM` at Ψ-off; already consumed by `choppyPos`'s S solve |
| `rayPhase` | `mix(legacy, baked, u_psiMix·u_depthMix)` — one mix at Ψ-off |
| `psiAt` / `zcAtPsi` / `incidenceAt` | kept from the reverted full-eikonal build; measured incidence 17.1° deep → 9.4° at the break → 7.9° inside at Second Peak |
| Staging note (model-glsl.js:91) | "rider, audio crest solve and setEnv group speed all still assume the constant-φ plane wave; with `u_psiMix = 1` the rider drifts off the crests" |

The promotion is therefore **consumer closure plus measurement**, not new
physics: the physics is baked and idle.

## 3. The offshore question, pre-registered

`LAM = 90 m` is documented at its declaration as "shoaled ~15 s swell at ~8 m
depth" — the authored carrier is already the *inshore* wavelength. Real
dispersion at T = 15 s gives L₀ ≈ 351 m in deep water. So the Ψ arm agrees
with the frozen carrier near the break line and diverges seaward, with
offshore crests up to ~4× farther apart.

Pre-registered as an open outcome, §4.6-style, before anyone looks:

- **Outcome A** — the long offshore swell reads *better* (lines of swell with
  long lulls between crests is what the reference footage shows). Ship it.
- **Outcome B** — it reads emptier at landscape scale and the authored look
  was doing real work. Then the promotion needs a **declared boundary**, not
  a silent blend: state the depth (or contour-z) seaward of which the model
  keeps an authored carrier, hold the Ψ ramp inshore of it, and say so in
  the HUD — exactly the §4.6 pattern (declare the boundary, stay on one side,
  price stated per spot).

What is *not* acceptable is discovering this in the diff and tuning it away
quietly. The A/B frames at the stage-wide cameras (`cliff`, `drone`) decide
between A and B, and Andy's eye is the instrument.

## 4. Phases

### Phase 0 — measure the arm that already exists (no code)

`#psi=1` runs today. Before any closure work:

1. `probe_wave_shape.mjs` at the four measured spots, Ψ on/off: Sk, As,
   biphase ψ, B against the Ruessink et al. (2012) targets at local Ursell
   (the §2.2a instrument, 44 gauges), plus the protractor face angle against
   Carini's 22°/30°.
2. Fold/offset statistics (`measure_curl.mjs`, the `|off|` histogram): S and
   the S/k ceiling both move with local k — measure, don't predict.
3. Invariants that must NOT move: the break line locus (M4 owns it; Ψ is
   phase, not amplitude), crest height at the gauges (H is Ks-owned), Sharks'
   spilling character, rate independence.
4. The offshore question (§3): stage-wide frames, both arms, judged live.

Every later phase is conditional on Phase 0's table. If the face angle does
not move toward Carini on the Ψ arm, this spec is falsified and stops —
cheaply, before any consumer was touched.

### Phase 1 — consumer closure

Each consumer moves from the closed-form plane wave to the baked phase,
gated on the same `u_psiMix`, one commit each, with a pinned invariant test:

| consumer | where | closure |
|---|---|---|
| rider crest snap | `model-glsl.js` surfer path (`nz`/`zcCrest`) | solve the nearest crest through `zcAtPsi` instead of the closed form |
| audio crest voices | `sound.js` (four voices at crest positions) | same substitution; voices follow the compressed spacing |
| set envelope group speed | `setEnv` | group speed from local `cg` where the envelope is evaluated |
| JS twin | `model-js.js` (standable-surface mirror) | mirror the mix; twin-vs-GPU test already exists to catch drift |

The A-frame fold (`u_aframe`, synthetic, no bed, no bake) stays frozen-LAM
explicitly — it has no Ψ table to read, and pretending otherwise would be a
new authority violation.

### Phase 2 — promote

Default `u_psiMix = 1` on bed-backed sites; `#psi=0` is the revert arm.
Re-run the full §2.2a acceptance + the six-clock crest/fold A/B + `check:swash`
+ the shipped-states audit. Rebuild the QA sheets and **label the break** —
the drone-tilt precedent: pixel statistics are not comparable across this
change, so the sheets restate their baseline rather than diffing over it.

### Phase 3 — the crest budget (companion strand, deliberately after)

The head block (TODO 2026-08-24: crest 1.13× its ceiling at the break head,
bend reaching only 50° on the top vertex; tail of 2/56 Sewers pocket stations
at 1.4–1.7×) is a *shape* defect but it is measured against ceilings and S
values that Phase 2 changes. Fixing it first means fixing it twice.
After promotion: re-probe the fill table, then decide the open question
("`crestCeilM` is a reference height, not a clamp") and route the over-limit
water into the bend — candidate: `dyB` measured against raw local `h` rather
than the ceiling, so over-fill *earns* overturn instead of standing.

## 5. Non-goals

Explicitly out of scope, each owned elsewhere: the `Sapp` approach-term
calibration and the `#look` unbundling (owns the residual slab); foam
material promotion (`#look=foam`, awaiting live verdict); the curtain's
`CURT_REACH` refinement (waits on the Mead & Black vortex-ratio dial,
MODEL.md §1.4); Privates' synthetic bed (gates `#curl` promotion at that
site only; decision (b) in TODO).

## 6. Cost and risk

GPU cost is one texture fetch inside `rayPhase` on a path that already pays
the mix — effectively zero at Ψ-off, small at Ψ-on. The real costs are
Phase 1's four consumer closures (each small, each able to drift silently
without its pinned test) and the possibility of Outcome B in §3, which adds
a declared-boundary design decision. The risk register is short because the
physics was already built and reverted once: the reverted build's failure
mode (consumers drifting off the crests) is exactly what Phase 1 exists to
retire, in order, with tests.
