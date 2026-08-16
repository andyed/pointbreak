# Pleasure Point wave climatology — CDIP MOP SC116, 25 years at the break

Built 2026-08-16 by `data/climatology/build_cdip_climatology.py` from the CDIP
MOP v1.1 alongshore hindcast, transect **SC116**. Numbers land in
`../../data/climatology/pp_cdip_climatology.json`; the endpoint grammar is the
one already documented in `CDIP_LIVE_DATA.md` and spoken by `web/js/cdip.js`.

**Nothing here discovers the source.** `VALIDATION_PLAN.md` §"Conditions are the
easy half" already named `SC116_hindcast.nc`, with the same 221,328 record
count, and marked it reachable on 2026-08-12. `web/js/cdip.js` has spoken to its
nowcast twin since 2026-08-09. What was outstanding is the reduction, which
`data/climatology/README.md` scoped and left open:

> If the "today's ocean" mode ever needs a climatology, it has to come from
> CDIP MOP SC116 hindcast […] which is nearshore and spectral. **That job is
> not done.**

That is what this file is. **It supersedes `PP_SWELL_CLIMATOLOGY.md` as the
seasonality prior.** That document stays: its wind half is still the best wind
source in the repo, and its diagnosis of *how* an offshore source fails turns
out to be right in a way that can now be measured rather than argued.

## What the source is, and what it is not

| | |
|---|---|
| Dataset | `MOPv1.1_SC116_2000010100-2025033123` |
| Position | 36.94873 N, −121.96333 W — **~110 m** from the Pleasure Point coordinate in `CDIP_LIVE_DATA.md` |
| Depth | the MOP 10–15 m contour, ~150 m off the break |
| Coverage | 2000-01-01 to 2025-03-31, **hourly** |
| Records | 221,328 in file; 221,135 flagged good (99.9%); **218,975 used** |
| Carries | `waveHs`, `waveTp`, `waveTa`, `waveDp`, `waveDm`, `waveSxx`, `waveSxy`, and a 20-band directional spectrum (`waveEnergyDensity`, `waveMeanDirection`) |

**It is a model, not a measurement.** MOP assimilates offshore buoy spectra and
transforms them shoreward through a linear refraction model. It is not ground
truth for Pleasure Point and does not make this repository validated — see
LICENSES.md, "Not a forecast." What it is: transparent about method, published
with per-record QC flags, and evaluated **at the break rather than 48 km out to
sea**, which is the whole argument.

**It stops where this repository starts.** MOP resolves incident conditions on
the 10–15 m contour. It does not model the reef, the break line, peel angle, or
anything in the surf zone. It is *forcing*; `docs/MODEL.md` is *transformation*.
That is the same split recorded for surfpy in README.md's related-work section,
and it is why this file is a climatology of the water arriving at Pleasure
Point, not of the wave you ride.

Two whole-record caveats, both encoded in the JSON's `method` block:

1. **Whole calendar years only, 2000–2024.** The file ends 2025-03-31, so
   unfiltered month-of-year bins would hold 26 Januaries against 25 Junes and
   tilt winter upward by ~4% for free.
2. **`waveTp` is band-quantised.** MOP reports peak period as the centre of
   whichever of its 20 frequency bands holds the most energy, so across 221k
   records `waveTp` takes **19 distinct values** and its median is the same band
   (14.29 s) in every month of the year. That is an artefact, not a finding.
   Period seasonality below is read off `waveTa` (mean period, continuous).

## The size season at the break

### Table A

| Month | Hs p50 (m) | Hs p90 (m) | Hs ≥1.3 m (%) | Ta p50 (s) | Dp mean (°T) |
|---|---|---|---|---|---|
| January | 0.86 | 1.70 | 21.5 | 9.86 | 203.0 |
| February | 0.81 | 1.57 | 18.2 | 9.11 | 202.1 |
| March | 0.77 | 1.30 | 10.2 | 8.81 | 201.0 |
| April | 0.68 | 1.04 | 3.2 | 8.39 | 199.2 |
| May | 0.62 | 0.87 | 0.8 | 8.08 | 197.2 |
| June | 0.59 | 0.81 | 0.2 | 7.88 | 196.5 |
| July | 0.52 | 0.71 | 0.0 | 8.13 | 193.6 |
| August | 0.47 | 0.67 | 0.0 | 8.18 | 193.5 |
| September | 0.55 | 0.80 | 0.5 | 8.77 | 195.0 |
| October | 0.63 | 0.97 | 2.5 | 9.25 | 197.5 |
| November | 0.67 | 1.17 | 6.8 | 9.11 | 201.7 |
| December | 0.84 | 1.62 | 18.9 | 9.42 | 202.8 |
| **Year** | **0.63** | **1.15** | **6.9** | — | **198.6** |

A single-peaked winter season: January largest on every statistic, August
smallest on every statistic, monotone in between apart from a shallow
July/August inversion in `Ta`. Median Hs is **1.8× larger in January than in
August** (0.86 vs 0.47 m); at the p90 it is **2.5×** (1.70 vs 0.67 m).

One bound is worth stating exactly rather than as a rounded percentage, because
it is exact: across 2000–2024 there are **zero hours at or above Hs 1.3 m in
either July or August** — 0 of 18,600 July hours and 0 of 18,540 August hours,
with whole-record maxima of **1.251 m** and **1.224 m**. January spends 21.5% of
its hours above that line.

This is the season Pleasure Point locals describe and the season
`PP_VISITORS_GUIDE_NOTES.md` records. It is the first time the repo has it as a
number.

## Three sources, one break

`fair+` and `clean` are quality ratings, not size — they fold in wind and shape,
so a negative relationship to size is not automatically an error. Read the
columns as rankings, not levels.

### Table B

| Month | CDIP Hs ≥1.3 m (%) | Spitcast fair+ (%) | surf-forecast clean (%) |
|---|---|---|---|
| January | 21.5 | 82 | 0.3 |
| February | 18.2 | 64 | 0.7 |
| March | 10.2 | 67 | 1.0 |
| April | 3.2 | 70 | 2.0 |
| May | 0.8 | 65 | 2.0 |
| June | 0.2 | 59 | 4 |
| July | 0.0 | 59 | 3 |
| August | 0.0 | 68 | 1.9 |
| September | 0.5 | 64 | 1.8 |
| October | 2.5 | 46 | 2.0 |
| November | 6.8 | 30 | 0 |
| December | 18.9 | 30 | 0.2 |

**Spearman ρ against the CDIP size ranking: Spitcast +0.06, surf-forecast −0.77.**

The two failures are different in kind, and the difference matters:

- **surf-forecast is inverted.** ρ = −0.77 is a strong, systematic, *explicable*
  signal — it is what you get from a fixed size threshold applied at an offshore
  node whose direction window excludes the W–NW quadrant. An inverted source
  still carries information; you can correct it once you know the sign.
- **Spitcast is unrelated.** ρ = +0.06 is not a wrong answer, it is the absence
  of an answer. Its ranking puts **August third-best (68%) and December
  worst-equal (30%)** at a break where August has zero hours over 1.3 m in 25
  years and December has 18.9%.

Spitcast's own prose, on the same page as that table, says:

> bigger sets in winter; NW to WNW groundswells tend to produce the best
> conditions

Its own Trends panel ranks the two winter-swell months last. The page has no
stated sample size, no year range, no definition of `fair+`, and prints a "Sand
18%" factor weight for a break it describes in the adjacent paragraph as a
sandstone reef. **Do not transcribe it.** It is recorded here so the negative
result is not re-derived later.

## The falsification: an offshore source claiming smaller waves than a nearshore one

This is the sharpest test available, and it needs no quality rating at all.

### Table C — percent of hours below Hs 0.5 m

| Month | surf-forecast, 48 km offshore | CDIP, at the break | gap |
|---|---|---|---|
| January | 97 | 10.5 | 86.5 |
| February | 93 | 9.2 | 83.8 |
| March | 89 | 11.8 | 77.2 |
| April | 85 | 13.3 | 71.7 |
| May | 72 | 21.8 | 50.2 |
| June | 69 | 24.8 | 44.2 |
| July | 62 | 44.8 | 17.2 |
| August | 57 | **58.9** | **−1.9** |
| September | 64 | 36.5 | 27.5 |
| October | 81 | 19.2 | 61.8 |
| November | 94 | 19.2 | 74.8 |
| December | 97 | 12.0 | 85.0 |

Waves do not grow crossing 48 km of shelf toward shore. Shoaling to the 15 m
contour adds a modest amount at these periods, and the sheltering gradient down
the point — `MODEL.md` §2.6.7 — takes some back. An offshore source cannot
report 97% flat in December while the nearshore model at the same break reports
12%. December is falsified, not merely doubted.

**And the error is direction-gated, not noise.** August, when the swell is from
the S and inside surf-forecast's published ~045°→225° window, agrees to within
**1.9 points**. December, when it is from the W–NW and outside that window, is
off by **85 points**. The gap column is essentially a plot of how much of the
year that half-plane window throws away.

`PP_SWELL_CLIMATOLOGY.md` caveat 2 inferred this mechanism from a rose graphic
and called it "some direction window is being applied that excludes the W–NW
quadrant." That inference is now confirmed quantitatively, and the month where
the two sources agree identifies the window's open sector.

## Direction — the part the model currently throws away

At SC116 the swell has already refracted around Soquel Point, and the result is
extraordinarily collimated:

- year-round circular mean **198.6 °T**, resultant length **R = 0.989**
- monthly circular mean swings **193.5° (August) → 203.0° (January) = 9.5°**
- full p10–p90 envelope across all months: **188.8°–213.8°, 25.0° wide**
- January rose: SSW 88.3%, S 7.7%, SW 3.9%
- August rose: SSW 63.3%, S 33.6%, SW 3.0%

R = 0.989 is the collimation the 2026-08-11 external-validity audit found in 16
months of data, now confirmed over 25 years: a deep-water window ~100° wide
arrives at the break as a ~25° band. Everything reaches Pleasure Point from the
SSW, and the seasonal signal is not *which way* the swell comes from but a 9.5°
rotation within that band — south-ier in summer, west-ier in winter — carried on
top of a 2 s `Ta` swing.

This is directly actionable, and it puts a number on a guess. `web/js/cdip.js`
comments the incident band as "a ~15–30° seasonally and period-structured
incident band." Measured: **9.5° in the monthly mean, 25° in the p10–p90
envelope.** The low end of that guess is about right for the envelope and about
2.5× too wide for the seasonal component.

It also sharpens an open item rather than closing it. `cdip.js:79` says:

```js
// INERT field: nothing reads this yet.
state.swellDpObserved = (o.dp != null && Number.isFinite(o.dp)) ? o.dp : null;
```

`describeOcean()` prints `from 199°` in the HUD; nothing consumes it. Wiring it
is still gated behind the MODEL.md α-split (TODO Track 3a), which is downstream
of Track 1 — **this file does not change that ordering**. What it changes is the
target: a Track 3 α-split is being asked to respond to a 25°-wide band with a
9.5° seasonal mean swing, not to a free-ranging direction input. That is a much
smaller job than the TODO currently implies, and it is now specified.

## Rebuild

```bash
python3 data/climatology/build_cdip_climatology.py
```

First run pulls ~221k hourly records over OPeNDAP in 20k chunks (a few minutes)
and caches them to `data/climatology/.cache/` (5 MB, gitignored, regenerable).
Later runs reuse the cache; `--offline` forces it, `--refetch` bypasses it. The
cache SHA-256 is written into the JSON's `source` block, so a rebuild that
produces different numbers is distinguishable from a re-pull that changed.

No API key, no scraping, no licence problem: CDIP is Scripps/US-federal public
data, unlike the two forecast sites this file compares against, whose numbers
are cited but not redistributed.

## What is deliberately not here

No rideability, quality, or `fair+` percentage. Every site publishes one, none
publish the definition, and the two examined here disagree with each other and
with the physics. If this repo ever wants such a number it belongs downstream of
MODEL.md's breaking gate with its criterion stated in the open — not smuggled
into a climatology file as though it were an observation.

**DONE 2026-08-16, with a negative result:** `waveEnergyDensity[t][20]` and
`waveMeanDirection[t][20]` were pulled and analysed in
`PP_SPECTRAL_SETS.md`. They do **not** replace the invented Δf — MODEL.md's
0.006 Hz sits below the grid's 0.010 Hz resolution floor, so this instrument can
neither confirm nor refute it. What they did establish: bimodality is a minority
state that thins as the surf grows (23.8% of all hours, 8.9% above Hs 2 m), and
when two components do exist they arrive from within 11.4° of each other — which
measures, and vindicates, the model's directionless scalar beat.
