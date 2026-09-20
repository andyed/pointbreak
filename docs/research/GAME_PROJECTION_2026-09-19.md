# Stepwise projection: from simulation to game

Companion to [MAKEABILITY_FIELD_2026-09-19.md](MAKEABILITY_FIELD_2026-09-19.md),
which established that the shipped lineup already contains a difficulty field.
This document is the plan for building on it: a rider who can lose, sections
that unlock, a tide that constrains where a session can be spent, and an honest
scoping of what "bigger waves" can and cannot mean at this stage.

Three recon passes back this: the rider subsystem, wave shape and evolution, and
the section/tide plumbing. Every claim below carries a `file:line` or a
measurement.

---

## 0. The three findings that shape everything

### 0.1 The acceptance instrument will reject a correct rider

`scripts/measure_ride.mjs` gates CI at `ACCEPT = 0.9` on `rideMetric`
([`main.js:3196`](../../web-three/js/main.js:3196)), which is *face height under
the rider ÷ best crest height at his own station*. That is a
**breakpoint-adherence meter** — it is definitionally maximised by sitting
exactly on the peel. Its own comment says a ride that "has drifted off the wave
reads low here."

A rider who can fall behind will score low **by design** and the gate will call
it a regression. Same shape in the unit tests:
[`tests/m4-rider.test.js:76`](../../tests/m4-rider.test.js:76) pins the rider's
face offset to `1e-9`, and `:83` pins `vz` to be the analytic derivative of that
kinematic formula. Both are false the moment `vx` is a state.

**Nothing in Track A can start until the instruments are replaced.** This is
Phase 0 and it is not optional.

### 0.2 ~~The giant wave is not available at this stage~~ — CORRECTED 2026-09-19

> **This section was wrong and is kept, struck through, because the error is
> instructive.** `scripts/measure_size_headroom.mjs` measured it and overturned
> it the same day. The corrected reading follows; §C3 is updated to match.

**What I claimed.** That γ·h at the card break line is a ceiling, that the
1.43–1.66 ratio to card H₀ is headroom, and that the tight spread of that ratio
across all seven spots was an unplanned regularity worth noting.

**Why it is wrong.** The break line is *defined* as the zero crossing of
`H₀·Ks − γ·h`. So at the line `H₀·Ks = γ·h` identically, and therefore
`γ·h / H₀ = Ks`. The "regularity" was the shoaling coefficient wearing a
disguise (measured Ks at the line: 1.385–1.578). And γ·h is not a ceiling — it
is the height the card wave **already breaks at**. Sewers at H₀ 2.2 does not
break at 2.2 m. It breaks at 3.15 m.

**What is true instead.** Raising H₀ migrates the line seaward into deeper
water and the breaking height rides up with it:

| spot | Hb @ card | Hb @ H₀ 3.0 | d ln Hb / d ln H₀ |
|---|---|---|---|
| Sewers | 3.15 m | 4.09 m (+30%) | 0.81–0.84 |
| First Peak | 2.55 m | 3.91 m (+53%) | (all seven spots |
| Second Peak | 2.17 m | 3.80 m (+75%) | fall in this band; |
| Jack's (38th) | 1.65 m | 3.77 m (+128%) | flat would be 0) |
| The Hook | 2.15 m | 3.83 m (+78%) | |
| Sharks | 1.52 m | 3.74 m (+146%) | |
| Privates | 1.17 m | 3.80 m (+225%) | |

Sewers 2.2 → 3.0 concretely: the line moves 40 m seaward, broken area +20%,
**gap fraction falls 0.22 → 0.15**, and subtended crest height from the
aim-following cameras +29%. Card → ×2 is 1.73–1.77× on the Lineup camera at
every spot. That is several times a size JND — not a number without a sensation.

**Where the real wall is.** H₀ ≈ 8.8, when the line reaches the depth-grid
edge — four times the card day. Everything that binds before it is a one-line
constant: the 3.0 slider (binds 3.08–4.00), `hM`'s 3.5 m face cap (3.30–4.40),
`breakerCeilM` (4.40–6.00), the 500 m stage (7.50–9.00). A new bed is **not**
needed for size.

**What actually blocks "giant", and it is not depth.** The skew clamp is
already saturated at the **card** state on 91–100% of stations at every spot:
`skew = clamp(excess·0.82, 0, 0.8)`, and `excess ≡ 1.0` at the line by the same
definition above, so 0.82 > 0.80 always. Size therefore buys scale and never
form. That is why §C3(2) is now the *only* remaining lever rather than one of
three.

**One surviving fragment, narrowed.** `iribarrenMeasured` does fall as
H₀^−½ on a fixed slope — but `u_xi` reads the **authored** preset, so it reaches
no pixel; nothing in the renderer classifies breaker type from it. Local ξ built
on the bed slope *at* the line actually **rises** at 5 of 7 spots as the line
migrates onto steeper bed. The claim "size makes the wave read more spilling" is
false in the shipped renderer.

Also corrected: the `depthBreakOffset` clamp that binds is **−60, not +160**.

**The lesson worth keeping.** A ratio that is suspiciously tight across seven
independent spots is more likely to be an identity than a discovery. I should
have divided it out before calling it a finding.

### 0.3 Sections and tide are half-built already, in the right direction

- `stageStart` / `stageEnd` are **first-class per-spot bounds**
  ([`params.js:338`](../../shared/params.js:338)), already used to restrict aim
  sampling. They are the natural section domain.
- Tide is **first-class**: range, label, slider, `[`/`]` keys, a drag handle in
  the cross-section view, a hash param, and a member of the bake cache key
  ([`bed.js:1151`](../../web-three/js/bed.js:1151)). Every tide change already
  rebakes the line and re-derives the gaps.
- The permalink is **already the save format** — `ROUND_TRIP_PARAMS`
  ([`url-params.js:60`](../../web-three/js/url-params.js:60)) round-trips spot,
  tide, H₀, month, day, speed, live, with a 120 ms debounce.
- `simTime` + the conditions-drift pattern
  ([`main.js:1997-2009`](../../web-three/js/main.js:1997), `DRIFT_PERIOD_S = 300`)
  is a working template for a clock that is rate-independent and `setSim`-safe.

What does **not** exist: any section concept in the app (only in
`measure_makeability.mjs`), any progression store, and any persistence beyond a
CDIP nowcast cache ([`cdip.js:54`](../../shared/cdip.js:54)).

---

## Phase 0 — Unblock the instruments — **DONE 2026-09-19** (`aa5795e`, `7386022`)

No game work is safe until these land. All four are small and none change
behaviour. What the doing changed, beyond the table:

- **0.3 did not collapse to one stencil, and must not.** The two forms disagree
  by 0.13–1.1% at the rider's 1.5 m stencil and **6.6–51%** at bed.js's 14.06 m
  one; measured again per-station along the stage, the spread reaches **280%
  (Second Peak) and 487% (Sewers)**. They share one `peelVelocity()` now, with
  the stencil passed per call site. Sharing a stencil would have moved the rider
  by up to half his speed while looking like a tidy-up.
  *But*: both stencils produce **identical** arm scores in the new gate. Peel
  speed is wildly stencil-dependent; outrun classification is not. So A1 does
  **not** have to settle the stencil first — that was the wrong worry.
- **0.1's arm 1 is a regression guard, not a discriminator.** At unbounded board
  speed nothing can outrun the rider, so it can only catch a hallucinated loss.
  Arms 2 and 3 carry the weight: same spot, same speed, same field, shipped
  rider **0.00–0.14** against reference dynamic rider **1.00**.
- Two of my own design errors, both caught by the instrument failing rather than
  by review: scoring completion against an arbitrary `stageEnd − 14`, and
  running every spot at one 6 m/s ladder rung when the field says three of them
  need 8–10 and cannot be taken off on at 6.
- `GAP_SLOPE` collapsed from three copies of a bare `2.9` to one export.

| # | Step | Why | Gate |
|---|---|---|---|
| 0.1 | Replace `measure_ride.mjs`'s acceptance metric. Keep `rideMetric` as a diagnostic; gate instead on makeability — did the rider hold a section he should have held, and lose one he should have lost? | The current gate rejects a correct rider (§0.1) | The new gate passes on today's kinematic rider *and* is not maximised by breakpoint adherence — prove the second by scoring a deliberately-lagging synthetic rider and showing it separates |
| 0.2 | Rewrite the `1e-9` pins in `tests/m4-rider.test.js`. The front-face offset becomes a *bound* (`6 ≤ z−zb ≤ 16`, already asserted at `:74`) rather than an identity; the `vz` identity test moves to a kinematic-mode-only fixture | `z = zb + faceOff` to 1e-9 is the glue (§0.1) | Suite green on the unchanged rider |
| 0.3 | Collapse the two peel-speed derivations to one. `m4RideSolve`'s `w/dSdx` ([`model-js.js:455`](../../web-three/js/model-js.js:455), x-frame, stencil 1.5) and `peel-geometry.js`'s `lineVelocityMps` (along-line, stencil `3(x1−x0)/BREAK_N`) are the same quantity computed twice | A rider comparing his speed to the peel needs one canonical number — MODEL.md §4.5 | Both call sites return values agreeing to the Walker identity's own tolerance; `measure_makeability` gate still passes at ~1e-14 |
| 0.4 | Resolve `u_surferPos`. It is uploaded every frame ([`main.js:2133`](../../web-three/js/main.js:2133)) and read by **nothing** in `web-three`; the GLSL `surferState()` body ([`model-glsl.js:627`](../../shared/model-glsl.js:627)) is live below a `u_breakMix` branch | Dormant §4.5 second source — it starts lying the moment the rider leaves the breakpoint. Either delete the GLSL body or make the uniform the single channel | A grep shows one rider authority; `web/` raymarcher callers either migrate or are declared legacy |

**Also give `GAP_SLOPE` a home.** It is a bare `2.9` literal in
[`bed.js:1250`](../../web-three/js/bed.js:1250), named only in
`measure_break_activation.mjs:105` and bound by a source-text regex test. A game
layer that reads section boundaries needs it exported.

---

## Track A — The rider

### A1. Velocity becomes state

Today `vx` **is** the peel speed
([`model-js.js:459`](../../web-three/js/model-js.js:459), clamped [2, 90]) and
`z = zb + faceOff` is the entire z model
([`model-js.js:465`](../../web-three/js/model-js.js:465)). There is no rider — it
is the breakpoint with a body on it.

Give him:

- **`vAlong`** — speed along the break line, integrated, not derived.
- **A board-speed ceiling** — the one declared parameter, already stated in
  `measure_makeability.mjs` as the 6/8/10/12 m/s ladder.
- **A position along the line that can lag** the breakpoint, so `x` is no longer
  the phase root.
- **Persistent state with the same reset discipline as `st = {n, prevX}`** —
  which resets on preset, `setM4` and `setPsi`
  ([`main.js:2125`](../../web-three/js/main.js:2125), `:2888`, `:3187`). Any new
  state that misses this carries a stale ride across a spot change.

Three downstream meanings change simultaneously, because all three read `vx`:
the mesh forward vector ([`surfer.js:159`](../../web-three/js/surfer.js:159)),
the POV gaze direction ([`main.js:1088`](../../web-three/js/main.js:1088)), and
`vz`. Budget for all three.

Also: the `waiting ? 2` floor exists solely to stop the mesh spinning at `vx = 0`
([`model-js.js:459`](../../web-three/js/model-js.js:459)). A rider who genuinely
stalls at 0 m/s resurfaces that bug.

**Gate:** on a state the makeability field says is makeable at 8 m/s, an 8 m/s
rider completes the section; a 6 m/s rider does not. The offline prediction and
the live run must agree on *which* sections, not just how many.

### A2. Losing the wave

`TODO.md:3170` already carries the intent: *"M3+ wipeouts: section outruns
surfer → fall + tumble in whitewater."* The trigger is now measurable rather
than authored — the rider is beaten when `vAlong_max < V_peel` at his station,
which is exactly the quantity `measure_makeability` scores.

Note there are **two distinct failure modes** the field already separates, and
they deserve different outcomes: the peel outrunning the rider (Privates, gap
fraction 0.00, median V_req 14.0 m/s) versus the wave closing out ahead of him (a
baked gap). Losing a race is not the same event as the wave ending.

**Gate:** the live loss rate per (spot, tide, H₀) matches the offline
`minSkillMps` prediction within a stated tolerance across the 315-state field.

### A3. Ride grammar

Takeoff, trim, pump, kickout. Deferred at `TODO.md:3120`;
`docs/WEB_THREE_SPEC.md:82` records it as not built. This is where "fun" lives
and it is the least specified — deliberately left last, because it is the only
phase whose acceptance is taste rather than measurement.

---

## Track B — Sections, tide, progression

Runs in parallel with Track A after Phase 0. B1 has no dependency on the rider
at all.

### B1. Sections become first-class in the app

`enumerateSections` exists and is written as a progression unit, but it lives in
a node-only script. Promote it to a shared module both the app and the
instrument import — one definition, MODEL.md §4.5 discipline.

Two pieces of care:

- **Section identity must be stable across states.** Today `index` is assigned in
  enumeration order, so a gap appearing at low tide renumbers everything
  shoreward of it. "Second Peak section 2" must name the same water at every
  tide, or progression state is meaningless. Anchor indices to
  `stageStart`/`stageEnd` positions rather than to enumeration order.
- **There is a second closeout mechanism that sets no gap flag.** The peel
  running-max constraint flattens reversals to `dQ/dx = 0`
  ([`bed.js:1317-1334`](../../web-three/js/bed.js:1317)) and its own comment calls
  that "a CLOSEOUT section" — but those stations are not in `gapArr`. My section
  splitter catches them via the α ≈ 0 divider; a naive `breakGapAt`-only
  splitter would not.

**Gate:** the app's section decomposition is byte-identical to the instrument's
on all 315 states.

### B2. The tide clock

Ride the `simTime` drift pattern — an interval index, not an accumulator, so it
inherits pause, speed and `setSim` determinism for free
([`main.js:1998-2005`](../../web-three/js/main.js:1998)).

The data already exists: MAKEABILITY_FIELD §7's tide windows say exactly which
spot is open to which rider at which tide. At 6 m/s the world is small and
specific — The Hook nearly always, Sewers and First Peak mid-tide only, Jack's a
narrow low window, Privates **high-tide only**, Second Peak and Sharks shut. That
is the "tide timeout" constraint, already measured.

**One hazard to design around.** A tide clock sweeping through `tideBandM`'s edge
moves a spot from "peel floor binds" to "peel floor declines" mid-animation, and
`setTide` already re-derives the active month on every change
([`main.js:1604`](../../web-three/js/main.js:1604)). That machinery will fire
continuously under an animated tide. Either quantise the clock to steps that
straddle no band edge, or make the decline a visible in-world event ("the tide
has killed it here") rather than a HUD warning.

**Cost:** every tide change is a cache miss on both `bakeBreakLine` and
`bakeRefraction`. Measured at 14 ms per bake headless — fine at drift cadence,
not fine per frame.

**Gate:** a full tide cycle visits the predicted open/closed set per spot, and
the app never draws a spot the offline field calls closed.

### B3. Progression and persistence

Nothing exists but a nowcast cache. But the permalink is already a working save
format with a round-trip contract and a test
([`tests/url-params.test.js`](../../tests/url-params.test.js)) — extending it is
cheaper and more in-idiom than introducing `localStorage`, and it keeps sessions
shareable, which is a feature.

**The rule, restated from MAKEABILITY_FIELD §8:** the game layer may **select**
model states (spot, tide, H₀, T, α target) and may **never** write model
constants. When a wave does not play well the pressure will be to move a physics
constant; that is the §4.5 defect generator wearing a new hat.

---

## Track C — Wave shape and evolution

Independent of A and B. Scoped honestly against §0.2.

### C1. Tunable today (constants and uniforms)

- H₀ range 0.4 → 3.0 ([`params.js:42`](../../shared/params.js:42)). One line, and
  §0.2 says there is ~1.5× of real headroom before the depth cap binds.
- `breakerCeilM`'s 14 m displayed clamp; `hM`'s 3.5 m face cap.
- The bend budget: `yBend = 0.35·hCrest`, `kEff`, the 2.30 rad arc cap,
  `S_CAP_HARD`, `OFF_MAX_M` (all in `shaders.js`).
- ξ up to 2.0 — and it must be raised **by hand**, because larger H₀ lowers
  measured Iribarren (§0.2).
- Grid tier: measured 4.37 / 2.00 / 0.90 ms full / half / quarter. The app is
  **vertex-bound, not fill-bound** — grid density is the lever, and
  `ocean()` runs **5× per vertex** via the finite-difference gradient, so any new
  term costs 5×.

### C2. Requires a new representation — say so before starting

- **Per-wave identity.** `ocean(xz, t)` is doubly periodic (carrier × set
  envelope). No wave in a set has a history different from another at the same
  envelope phase. Making "the set wave" genuinely bigger is **new state**, and
  the stateless design is deliberate — it is what makes the field seek-safe and
  screenshot-testable.
- **A real face angle.** The steepest front face is 6.8–9.9° physical against
  Carini's 22° spilling / 30° plunging — **2–4× too gentle**, and the skew `s`
  already sits at its monotonicity ceiling of 0.8. Past `s = 1` the height field
  goes multivalued. The ceiling is structural, not tuning.
- **An enterable barrel.** Explicitly out of scope at `MODEL.md:2059`. The render
  layer *does* fold (a `curlProbe` counted 279–283 multivalued bins), but the
  curtain is one fall-column per alongshore x — `TODO.md:878` records the
  down-line view as only partially closed.
- **A board wake.** Removed 2026-08-30 with the correct diagnosis: a real wake is
  a trail left in water the board passed through, which needs water memory. Same
  missing-state class as per-wave identity.

### C3. What "giant" could actually mean

Three readings, re-ranked by the §0.2 correction:

1. **Run the existing spots nearer their ceiling — confirmed free and confirmed
   perceptual.** +30% to +225% of breaking height inside the existing 3.0
   slider, +20% broken area, and the peel gets *better* (gap fraction falls).
   The slider clamp binds before any physics does at 5 of 7 spots, so raising
   it buys the rest; `hM`'s 3.5 m face cap is the next thing to meet, not a
   depth wall. One line, `params.js:42`. **This is a shipped product change —
   it widens what a user can dial — so it is proposed, not assumed.**
2. **Fix the face-angle deficit — this is what "giant" means, and the blocker
   is now named.** The skew clamp is not approaching its ceiling with size; it
   is already there at the card state on every spot. That is exactly why (1)
   gives a taller, wider, longer-breaking wave that is *the same shape*.
   Everything (1) buys is scale; nothing it buys is form. The carrier's skew is
   at a structural limit (s > 1 goes multivalued), so the work is re-budgeting
   the bend — and it is the only remaining lever, not one of three.
3. **A different bed is not needed for size.** Keep it for a genuinely
   different *place*, not for a bigger wave here.

**One piece of good news:** §4.6's peel collapse is a *low*-H₀ pathology. The
floors are 0.78–1.62 m. Going bigger moves **away** from the repo's hardest open
defect.

---

## Ordering

```
Phase 0  (0.1 → 0.4, plus GAP_SLOPE)     BLOCKS Track A entirely
   │
   ├── Track A   A1 velocity state → A2 losing → A3 ride grammar
   │
   ├── Track B   B1 sections  ──┐
   │             B2 tide clock ─┼→ B3 progression   (B3 needs A2 for a
   │                            │                    difficulty to progress
   │                            │                    against)
   └── Track C   C1 tunables (any time) → C2/C3 only after an explicit
                 decision about which reading of "giant" is wanted
```

B1 and C1 can start immediately and in parallel with Phase 0 — neither touches
the rider.

## What would falsify this plan

- **Phase 0.1 fails to produce a metric that separates a lagging rider from an
  adherent one.** Then makeability is not observable in the live app and the
  whole Track A acceptance story collapses back onto taste.
- **A1's live rider disagrees with the offline field about *which* sections are
  makeable.** That would mean the offline instrument and the runtime are reading
  different physics — the §4.5 failure this plan is built to avoid.
- **Section indices prove unstable across tide.** Then progression has nothing
  durable to attach to and the unlock model needs rethinking.
- **C1's headroom turns out to be perceptually flat.** If running Sewers at 3.0
  instead of 2.2 does not read as bigger, the ~1.5× is a number without a
  sensation, and Track C reduces to C3(3) — a new bed or nothing.
