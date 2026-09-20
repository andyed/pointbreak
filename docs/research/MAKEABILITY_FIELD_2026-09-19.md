# Does the shipped lineup contain a game? — makeability field, 2026-09-19

**Question.** Before any engine work, before any rider rewrite: do the seven
surveyed spots, swept over the tide and swell they ship with, produce a varied
and readable difficulty field? If every state reads uniformly makeable there is
no challenge; if every state reads closeout there is no ride. Either way there
is no game in there, and porting to another engine would not put one there.

**Answer: yes, and it is already shaped.** 315 states populate every rung of the
skill ladder — 54.3% / 17.5% / 12.4% / 2.5% rideable at 6 / 8 / 10 / 12 m/s
respectively, 13.3% giving no ride at any ladder speed. Spots keep distinct
personalities across the sweep, tide moves difficulty spot-specifically, and
within a single wave the required speed varies smoothly enough to read as a
level rather than as noise.

**The difficulty signal is RIDE LENGTH, not the minimum skill.** At card state
every spot is rideable at 6 m/s, and what separates them is how far that ride
goes: 58 m at Privates against 196 m at The Hook, on the same day at the same
board speed. See the supersession notice below — the figures in this paragraph
are the corrected ones; the section tables further down are not all updated.

Instrument: [`scripts/measure_makeability.mjs`](../../scripts/measure_makeability.mjs).
Data: `qa/makeability/summary.json`.

---

> ## ⚠ SUPERSEDED IN PART — 2026-09-19, later the same day
>
> Every table below was computed with an **instantaneous** loss rule: a single
> station where `V_peel > V_board` ended the ride. Building the actual rider
> (Track A1/A2) showed that rule is too strict to be true. At Sewers the peel
> touches 6.4 m/s against a 6 m/s board on **98 frames out of 5401** and the
> total ground he gives up is **0.04 m** — a wave anyone makes, which the old
> rule scored as a wipeout at the first sample over the line.
>
> Being beaten is a **distance**, not an instant. The rule is now an integrated,
> **recoverable** pocket — he gives up ground where the peel is faster, takes it
> back where it is slower, and is lost when the gap exceeds `RIDER_POCKET_M`
> (18 m, shared with `model-js.js`, not restated). The field, the sections, the
> reference rider and the real rider now use one rule and one constant.
>
> **What survives.** The lineup does contain a difficulty field; spots keep
> distinct personalities; tide moves difficulty spot-specifically; Privates
> still inverts; within one wave the required speed still ramps into an
> impassable section and out again. §4's finding that the §4.6 peel collapse
> *is* the closeout boundary is unaffected — it is about where the line exists,
> not about who can ride it.
>
> **What changed, and it is not cosmetic.** The field is far more permissive and
> the discriminator moved:
>
> | | old (instantaneous) | new (integrated pocket) |
> |---|---|---|
> | 315-state spread, min skill 6 / 8 / 10 / 12 / none | 19.0 / 26.7 / 15.9 / 7.3 / **31.1**% | **54.3** / 17.5 / 12.4 / 2.5 / 13.3% |
> | card-state min skill | 6–10, varied by spot | **6 at every spot** |
> | card-state ride at 6 m/s | 2–104 m | **58–196 m** |
> | sections that never open | 3 of 12 | **0 of 12** (Sewers §0 at 10, Jack's §0 and Sharks §0 at 8) |
> | tide at 6 m/s | Second Peak and Sharks **shut** | both open; only Privates still restricted (−0.18 → 0.76) |
>
> So `minSkillMps` against a 50 m bar has stopped discriminating, and **ride
> length is now the difficulty signal** — 58 m at Privates against 196 m at The
> Hook, at the same 6 m/s, on the same day. For a game that is arguably the
> better currency anyway: not "can you ride here" but "how long a ride does this
> place give you".
>
> One property the new rule brings that the old one did not: near the pocket
> threshold the outcome is **knife-edge**. Measured, Jack's at 6 m/s peaks at
> 17.4 m of lag against an 18 m pocket, and the station walk and the
> time-stepped rider land on opposite sides of it — 68 m against 207 m of ride.
> 66 of 140 state×board pairs graze the threshold that closely, and agreement
> within them drops to 0.89 against 0.97 for pairs clear of it. Same shape as
> MODEL.md §4.6: a branch decided by a criterion grazing zero.
>
> Regenerate with `node scripts/measure_makeability.mjs`; the committed
> `qa/makeability/summary.json` already carries the new numbers.

---

## 1. What is measured

Walker's (1972) makeable criterion states playability as one inequality: a rider
holds the curl iff his own speed can match the speed the breakpoint travels
along the break line,

```
V_surfer  >=  V_peel  =  c / sin(alpha)
```

The repo already computes both sides. `peel-geometry.js` returns
`lineVelocityMps` — the breakpoint's speed along the locus, derived from the
spatial phase gradient rather than from the sine form. That is the quantity;
nothing new was modelled.

The probe reads the **shipped** `bed.derivedPeelGeometry` after the **shipped**
`bakeRefraction` + `bakeBreakLine`, so the line, the phase and the angle are the
renderer's own rather than a fourth mirror of the physics (MODEL.md §4.5).

**Ride length** is arc length along the baked line, summed over contiguous
stations that are makeable at a given board speed *and* not inside a baked
section gap. A gap is the wave closing out — no line to ride — which is a
different failure from "too fast to make", and the two are reported separately.

**The headline per state** is `minSkillMps`: the slowest board speed on the
ladder that still yields a contiguous ride of at least 50 m.

### The gate

MEASUREMENT_LESSONS §4: an instrument that re-derives the physics it measures
certifies itself. Every station is checked against Walker's sine form,

```
| |lineVelocityMps| - phaseSpeedMps / sin|alpha| |  /  (c / sin|alpha|)   <=   1e-6
```

This is an identity, not a fit — a station that breaks it means the phase
derivatives and the reported angle have come apart. Over the full sweep:
**52,684 stations checked, max relative error 2.11e-14, PASS.** Stations within
0.05° of alpha = 0 are excluded (the sine form is singular there) and counted.

### What is declared rather than measured

Exactly one thing: the board-speed ladder, 6 / 8 / 10 / 12 m/s. It is a physical
ceiling — a human on a surfboard, not a peel angle — so it cannot be read off
this bathymetry. Every per-station quantity is exported raw, so the ladder can
be re-cut from `summary.json` without re-running the sweep. The Hutt, Black &
Mead (2001) skill bands are reported alongside, on |alpha| directly, as the
literature's own independent difficulty read; they are **not** used to define
makeability.

## 2. Card state — the lineup as it ships

| spot | H0 m | T s | α° med | c m/s | V_req p10 / med / p90 | gap frac | rev | ride m @6 / 8 / 10 / 12 | min skill |
|---|---|---|---|---|---|---|---|---|---|
| Sewers | 2.2 | 15 | 46.8 | 5.75 | 5.2 / 8.7 / 40.4 | 0.22 | 1 | 72 / 102 / 138 / 159 | 6 |
| First Peak | 1.8 | 14 | 60.6 | 5.22 | 5.2 / 6.3 / 11.0 | 0.28 | 1 | 61 / 108 / 111 / 111 | 6 |
| Second Peak | 1.5 | 14 | 40.2 | 4.75 | 6.1 / 7.4 / 148.5 | 0.10 | 2 | 4 / 100 / 114 / 120 | 8 |
| Jack's (38th) | 1.1 | 13 | 40.5 | 4.07 | 6.0 / 7.2 / 29.9 | 0.13 | 2 | 5 / 192 / 221 / 233 | 8 |
| The Hook | 1.5 | 13 | 49.2 | 4.44 | 4.9 / 6.3 / 12.1 | 0.15 | 1 | 104 / 160 / 180 / 190 | 6 |
| Sharks | 1.0 | 13 | 37.1 | 4.00 | 5.4 / 7.1 / 36.4 | 0.13 | 1 | 2 / 162 / 182 / 193 | 8 |
| Privates | 0.7 | 12 | 15.7 | 3.79 | 6.7 / 14.0 / 20.6 | 0.00 | 0 | 6 / 33 / 52 / 66 | 10 |

The spots are not interchangeable. **The Hook** is the forgiving one — 104 m at
6 m/s, the only spot that gives a beginner a long ride at card state.
**Privates** is the knife-edge: median required speed 14.0 m/s, above the
ladder's top rung, and the only spot whose *median* station is unmakeable.
Notably its gap fraction is 0.00 — it does not close out, it simply peels too
fast everywhere. That is a distinct failure mode from Second Peak's p90 of
148.5 m/s, which is one hard section inside an otherwise makeable wave.

**Jack's** has the longest rides in the set (221 m at 10 m/s) despite the
smallest card swell.

## 3. Tide is a real axis, and it is spot-specific

Min skill (m/s) at card H0/T, `none` = no 50 m ride at any ladder speed:

| spot | −0.86 | −0.59 | −0.32 | −0.05 | +0.22 | +0.49 | +0.76 |
|---|---|---|---|---|---|---|---|
| Sewers | 8 | 8 | 6 | 6 | 6 | 10 | 12 |
| First Peak | 8 | 6 | 6 | 6 | 8 | none | none |
| Second Peak | 8 | 8 | 8 | 8 | 8 | 8 | none |
| Jack's (38th) | 6 | 6 | 8 | 8 | 8 | none | none |
| The Hook | 6 | 6 | 6 | 6 | 6 | 6 | 12 |
| Sharks | 8 | 8 | 8 | 8 | 8 | none | 10 |
| Privates | 10 | 10 | 12 | 12 | 10 | 6 | 6 |

Most spots degrade at high tide — the wave stops breaking where the reef is.
**Privates inverts**: hardest at low and mid tide, easiest at the top of the
range, the only spot in the set that rewards a high tide. **The Hook** holds 6
across six of seven tide steps and then falls off a cliff at +0.76.

This is the material for a meta-game of reading conditions, and none of it was
designed — it falls out of surveyed bathymetry plus a tide that physically
moves the takeoff while breaking depth stays fixed.

## 4. The §4.6 peel collapse is the closeout boundary

H0 ladder at tide 0, min skill; ▲ marks the first rung at or above each spot's
`PEEL_FLOOR.floorH0` (MODEL.md §4.6):

| spot | 0.50 | 0.75 | 1.00 | 1.25 | 1.50 | 1.75 | 2.00 | 2.25 | 2.50 | floorH0 |
|---|---|---|---|---|---|---|---|---|---|---|
| Sewers | none | none | none | none | none | 10▲ | 6 | 6 | 8 | 1.62 |
| First Peak | none | none | none | none | none▲ | 6 | 8 | 8 | 8 | 1.38 |
| Second Peak | none | none | none | 8▲ | 8 | 8 | 8 | 8 | 8 | 1.11 |
| Jack's (38th) | none | none | 8▲ | 8 | 8 | 8 | 8 | 10 | 10 | 0.78 |
| The Hook | 6 | 8 | 10 | 6▲ | 6 | 6 | 6 | 8 | 8 | 1.09 |
| Sharks | 8 | none | 8▲ | 8 | 8 | 10 | 10 | 12 | none | 0.81 |
| Privates | 8 | none | 12 | 12 | 10 | 12 | none | none | none | n/a |

For Sewers, First Peak, Second Peak and Jack's the match is clean: `none` below
`floorH0`, a real ride at and above it. An instrument that knows nothing about
§4.6 — it measures rider speed, not branch selection — recovers the same
boundary from a different direction.

**Under simulation intent that boundary is the repo's hardest open defect: four
repair attempts built, measured, none survived. Under game intent it is the
difficulty dial, already calibrated per spot.** A closeout is content.

### Caveat: the sub-floor rows are not trustworthy

The Hook reads rideable at 0.50 (min skill 6) well below its floor of 1.09, and
Sharks is non-monotonic — 8 at 0.50, `none` at 0.75, 8 at 1.00. §4.6 records
that branch selection below the floor is decided by a criterion grazing zero at
0.1–0.7% of its own scale, so a bake there may be selecting a spurious branch.
These cells should be read as "the line below floorH0 is unreliable", not as
"small-swell Hook is a beginner wave". Privates, which has no `PEEL_FLOOR` entry
at all, is erratic across the whole ladder for the same reason.

That matters for game design: **the honest playable envelope is at or above
floorH0 per spot**, and the sub-floor region needs either the §4.6 work or an
explicit "these conditions are not simulated" gate.

## 5. Within one wave, difficulty has a readable shape

The Hook at card state, every second station through the hard section
(`--mode=line --preset=thehook`):

| x m | α° | c m/s | V_req m/s | Hutt | makes @6/8/10/12 |
|---|---|---|---|---|---|
| −54.8 | −50.36 | 6.25 | 8.11 | advanced | ··●● |
| −50.8 | −39.22 | 6.31 | 9.97 | expert | ··●● |
| −48.8 | −31.53 | 6.32 | 12.08 | expert | ···· |
| −44.8 | −10.32 | 6.32 | 35.29 | pro | ···· |
| −42.8 | +1.50 | 6.32 | 240.83 | pro | ···· |
| −38.8 | +19.02 | 6.31 | 19.35 | pro | ···· |
| −32.8 | +29.40 | 6.24 | 12.71 | expert | ···· |
| −28.8 | +36.80 | 6.18 | 10.31 | expert | ···● |
| −24.8 | +42.14 | 6.09 | 9.08 | advanced | ··●● |
| −16.8 | +48.10 | 5.79 | 7.77 | advanced | ·●●● |
| −6.8 | +51.42 | 5.40 | 6.91 | advanced | ·●●● |

The required speed ramps smoothly into an impassable section and smoothly out of
it. The α sign change at x = −42.8 is the peel reversing direction — the wave
breaking outward from a point, an A-frame closeout — and V_req spikes through
240 m/s there because sin(α) passes through zero.

This is a level: an easy entry, a section that only an expert makes, a payoff
stretch after it. Nobody authored it.

## 6. Sections are already a progression ladder

A **section** is a maximal stretch of line between physical dividers: a baked
gap, or the peel passing through alpha = 0 (the wave breaking outward from a
point, where V_peel is unbounded and the direction flips). Both are features of
the water, so a section keeps its identity at every skill level.

> A first cut split sections wherever V_req exceeded a ceiling. That made every
> section end at a near-ceiling station and drove its difficulty metric to the
> ceiling by construction — the instrument was measuring its own cut. The
> dividers are now speed-independent for that reason.

A rider does not traverse a section end to end; he takes off inside it and holds
on until he is beaten. So difficulty is not one number: per board speed, the
table gives the longest makeable stretch **within** the section, and `opens at`
is the slowest ladder speed yielding at least 15 m of it.

| spot | # | x range m | length m | V_req p10/med/p90 | α° med | Hutt | ride m @6/8/10/12 | opens at |
|---|---|---|---|---|---|---|---|---|
| Sewers | 0 | −191 → −147 | 45 | 8.3 / 39.5 / 50.0 | 8.1 | pro | 0 / 2 / 6 / 6 | never |
| | 1 | −89 → 65 | 218 | 5.0 / 9.3 / 13.5 | 45.2 | advanced | 72 / 102 / 138 / 159 | 6 |
| First Peak | 0 | −24 → 46 | 127 | 5.1 / 6.3 / 12.8 | 62.5 | intermediate | 61 / 108 / 111 / 111 | 6 |
| Second Peak | 0 | −45 → −25 | 27 | 6.0 / 8.2 / 28.5 | 34.6 | expert | 4 / 14 / 19 / 19 | 10 |
| | 1 | −3 → 123 | 158 | 6.1 / 7.4 / 26.4 | 42.8 | advanced | 0 / 100 / 114 / 120 | 8 |
| Jack's (38th) | 0 | −147 → −119 | 28 | 7.2 / 16.3 / 33.6 | 14.1 | pro | 0 / 2 / 4 / 4 | never |
| | 1 | −75 → 153 | 277 | 6.1 / 7.0 / 19.6 | 40.5 | advanced | 5 / 192 / 221 / 233 | 8 |
| The Hook | 0 | −165 → −101 | 68 | 5.4 / 6.8 / 9.7 | 38.3 | expert | 13 / 37 / 52 / 68 | 8 |
| | 1 | −41 → 123 | 213 | 5.0 / 6.4 / 13.2 | 50.5 | advanced | 104 / 160 / 180 / 190 | 6 |
| Sharks | 0 | −124 → −92 | 32 | 5.5 / 14.9 / 18.7 | 15.5 | pro | 2 / 6 / 6 / 8 | never |
| | 1 | −44 → 164 | 237 | 6.2 / 7.0 / 27.2 | 37.3 | expert | 0 / 162 / 182 / 193 | 8 |
| Privates | 0 | −180 → 48 | 232 | 6.7 / 14.0 / 20.6 | 15.7 | pro | 6 / 33 / 52 / 66 | 8 |

**12 sections at card state, and they stage themselves**: 3 open at 6 m/s, 5
more at 8, 1 more at 10, and 3 never open at card state. The three that never
open are all far-outside stretches (Sewers −191, Jack's −147, Sharks −124) where
the peel is in the `pro` band — the outside bowl that only turns on in other
conditions. That is an unlock table nobody wrote.

## 7. Tide is a timeout on where a session can be spent

The tide band at card H0/T over which a ride of ≥ 50 m exists, at each board
speed, from a 13-step sweep of the full range:

| spot | 6 m/s | 8 m/s | 10 m/s | 12 m/s |
|---|---|---|---|---|
| Sewers | −0.46 → 0.22 | −0.86 → 0.22 | −0.86 → 0.63 | −0.86 → 0.76 |
| First Peak | −0.59 → 0.09 | −0.86 → 0.22 | −0.86 → 0.22 | −0.86 → 0.22 |
| Second Peak | **closed** | −0.86 → 0.63 | −0.86 → 0.63 | −0.86 → 0.63 |
| Jack's (38th) | −0.86 → −0.59 | −0.86 → 0.36 | −0.86 → 0.36 | −0.86 → 0.36 |
| The Hook | −0.86 → 0.63 | −0.86 → 0.63 | −0.86 → 0.63 | −0.86 → 0.76 |
| Sharks | **closed** | −0.86 → 0.22 | −0.86 → 0.76 | −0.86 → 0.76 |
| Privates | 0.49 → 0.76 | 0.36 → 0.76 | −0.86 → 0.76 | −0.86 → 0.76 |

At 6 m/s the world is small and specific: The Hook is open almost always, Sewers
and First Peak are mid-tide only, Jack's has a narrow low-tide window three
steps wide, **Privates is high-tide only** — the one spot that inverts — and two
spots are shut entirely. By 12 m/s almost everything is open almost always.

**Skill buys time and place before it buys speed.** The constraint the game
needs — "you cannot surf there right now" — is already in the bathymetry, spot
by spot, and it resolves as the rider improves. No timer had to be invented.

## 8. What this does and does not settle

**Settled.** The lineup contains a difficulty field. It is varied across spots,
across tide, and along a single wave. The measurement is cheap (10 s for 315
states, pure node, no renderer) and repeatable, and it gates itself against an
identity rather than a tolerance.

**Not settled, and out of scope here.**

- *The rider cannot currently lose.* `web-three/js/model-js.js:315` sets the
  rider's velocity to `c/sin(φ)` at a fixed `11 + 5·pump` m offset. The rider
  **is** the breakpoint with a body on it: the gap between his speed and V_peel
  is zero by construction. Everything above is the antagonist for a rider that
  does not yet exist.
- *The water has no memory of the board.* `ocean(xz, t)` is a pure function, which
  is what makes it cheap, deterministic and screenshot-testable — and what makes
  a real wake impossible (the foam wake was removed 2026-08-30 on exactly this
  diagnosis). Board–water coupling is where surf games are judged and where this
  model is structurally weakest.
- *Whether any of this is fun.* Makeability is necessary, not sufficient.

**The rule that has to come with game intent.** MODEL.md §4.5 settles physics
versus authorship with a stated rule for which wins. Game intent adds a third
claimant — fun — and when a wave does not play well the pressure will be to move
a physics constant. The game layer may **select** model states (spot, tide, H0,
T, alpha target) and may **never** write model constants. The `#` URL params
already prove the pattern: the game is a state selector plus a rider, not a fork.

## 7. Reproducing

```
node scripts/measure_makeability.mjs                   # card + tide + h0 + field, ~10 s
node scripts/measure_makeability.mjs --mode=card
node scripts/measure_makeability.mjs --mode=line --preset=thehook
```

Exits 1 if the Walker gate fails. `--bed=<tag>` and `--map-privates` are
inherited from `measure_break_activation.mjs` and work unchanged.
