# Does the shipped lineup contain a game? — makeability field, 2026-09-19

**Question.** Before any engine work, before any rider rewrite: do the seven
surveyed spots, swept over the tide and swell they ship with, produce a varied
and readable difficulty field? If every state reads uniformly makeable there is
no challenge; if every state reads closeout there is no ride. Either way there
is no game in there, and porting to another engine would not put one there.

**Answer: yes, and it is already shaped.** 315 states populate every rung of the
skill ladder — 19.0% / 26.7% / 15.9% / 7.3% rideable at 6 / 8 / 10 / 12 m/s
respectively, 31.1% giving no ride at any ladder speed. Spots keep distinct
personalities across the sweep, tide moves difficulty spot-specifically, and
within a single wave the required speed varies smoothly enough to read as a
level rather than as noise.

Instrument: [`scripts/measure_makeability.mjs`](../../scripts/measure_makeability.mjs).
Data: `qa/makeability/summary.json`.

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

## 6. What this does and does not settle

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
