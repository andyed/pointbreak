# Deriving B_spot from the emergent break line — measured, and it does not exist yet

`scripts/measure_bspot.mjs`, run 2026-08-16 against the shipped build at each
preset's own card ocean, `#sim=42`, default flags. Data:
`data/model/pp_bspot.json`.

## What was attempted

MODEL.md §2.6.1 defines `B_spot` as the break line's compass bearing — site
character, one constant per spot — and §2.6.3 leaves it provisional and "gated
on Track 1". Track 1 landed, so the line should now have a bearing to read.

The derivation is sound and worth keeping regardless of the result. The stage
basis in `pp_geo_profiles.js` is not arbitrary: `stageAlongENU` **is** the NCEI
equal-elevation contour tangent (checked — `atan2(N,E)` of Sewer Peak's
`stageAlongENU` is 11.2°, exactly its published `bathyContourTangentDeg`). So a
line measured in stage coordinates is measured against the depth contour, and
one rotation gives a compass bearing:

    dir_ENU = stageAlongENU·cos ψ + stageShoreENU·sin ψ
    B_spot  = atan2(E, N)

with ψ the line's obliquity to the contour.

## What came back

| spot | stage | ψ end-to-end | ψ TLS | B_end | B_TLS | rms |
|---|---|---|---|---|---|---|
| sewers | 257 m | −5.2° | −23.7° | 84.0° | 102.5° | **49.8 m** |
| firstpeak | 113 m | 0.3° | 13.7° | 40.9° | 27.5° | **30.8 m** |
| secondpeak | 194 m | 1.5° | 19.5° | 41.9° | 23.8° | **22.7 m** |
| jacks | 312 m | 3.9° | 18.2° | 48.3° | 34.1° | **34.0 m** |
| thehook | 288 m | −4.5° | −7.6° | 53.7° | 56.7° | **49.1 m** |
| sharks | 303 m | −0.1° | 11.7° | 34.9° | 23.1° | **29.6 m** |

`privates` has `geoSpot: null` — no OSM/NCEI frame, so no compass bearing exists
for it at all.

**Three reasons these are not a `B_spot`:**

1. **The two estimators disagree by up to 18.5°.** End-to-end and total least
   squares differ by more than the quantity being measured.
2. **Perpendicular scatter is 23–50 m** on stages of 113–312 m. The line is not
   straight, so no single constant describes it.
3. **The obliquity is ~0–5°, not the 30–45° the peel implies.**

## The cross-check, and why point 3 is the real finding

These end-to-end values reproduce `measure_alpha_profile.mjs`'s own `bearing`
column exactly (0.3 / 1.5 / 3.9 / 5.2 / 4.5 / 0.1 — that instrument takes an
absolute value; this one keeps the sign). Two independent scripts, same answer.
The measurement is right.

Set it beside the same instrument's decile medians:

| spot | local α across the stage | end-to-end bearing |
|---|---|---|
| sewers | 10 · 47 · 72 · 65 · 27 · 32 · 35 · 37 · 49 · 60 | **5.2°** |
| sharks | 8 · 68 · 41 · 39 · 35 · 31 · 27 · 20 · 7 · 3 | **0.1°** |

Local peel angle swings between 3° and 72° within one stage while the line as a
whole lies within 5° of its own depth contour. That is the staircase
`measure_alpha_profile.mjs` was written to detect — "a staircase of steep steps
separated by flat runs has a high local alpha at some stations and a low
bearing" — and MODEL.md §4.5 already lists it as a known α-authority defect.

## Why this matters beyond a missing constant

MODEL.md §2.6.2a records that anchoring α to the *measured* incidence through
the straight-contour identity gives 17–29° across the bank, against 31–50°
authored. The reconciliation offered there was break-line obliquity: α and θ_b
differ because the line is oblique to the contours, and that obliquity is
`B_spot`.

**Measured, the obliquity is ~0–5°.** So that reconciliation fails too. Neither
channel supports the authored bank:

| route | α it implies |
|---|---|
| measured incidence + straight-contour identity | 17–29° |
| measured break-line obliquity to the contour | ~0–5° of obliquity |
| the model's own local fit at the tuned station | 36–50° |

The third is the one the HUD reports and the tests score. It is also the one
`measure_alpha_profile.mjs`'s own header warns about: *"An instrument that
scores the station a fit is tuned at certifies the fit, not the wave."* The fit
window covers **10–28% of the stage**.

This is the strongest available statement, and it should be read narrowly:
**α is currently a property of the local fit rather than of the line's global
geometry, and two independent geometric routes now say so.** It does *not*
follow that the rendered wave looks wrong — the mission is the screensaver, and
whether the staircase reads as a peeling wave at drone distance is a visual
question this measurement does not answer. `VISUAL_GROUND_TRUTH.md` and the
Surfline cam remain the acceptance test for that.

It does follow that:

- **`B_spot` cannot be derived until the break line is straight enough to have a
  bearing.** Straightening it is a prerequisite for all of Track 3, not a
  refinement of it.
- **The 2026-08-13 retarget moved targets that the local fit reports.** Whether
  it improved the wave is a separate question from whether it improved α, and
  the two have been treated as the same thing.
- **The `rms` column is the acceptance metric for any straightening work.** It
  is cheap, it is already instrumented, and it needs to fall well below the
  stage length before a single-constant `B_spot` means anything.

## Rerun

```bash
node scripts/measure_bspot.mjs          # table + data/model/pp_bspot.json
node scripts/measure_alpha_profile.mjs  # the cross-check
```

Both need Playwright, resolved from the sibling `psychodeli-webgl-port` checkout
(or `PLAYWRIGHT_DIR`). They serve the repo on :8195 and :8194 respectively, so
neither collides with the dev server on :8127.
