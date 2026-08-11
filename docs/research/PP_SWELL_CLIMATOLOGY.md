# Pleasure Point swell climatology — surf-forecast.com, and why it is wrong

Read 2026-08-11 from surf-forecast.com's Pleasure Point-First Peak statistics
pages. Numbers transcribed into `../../data/climatology/pp_surfforecast_climatology.json`;
refetch recipe and licence note in that directory's README.

Headline: **this source is not usable as a Pleasure Point seasonality prior, and
finding out exactly how it fails is more useful than the data itself.** The wind
half is fine and is worth keeping.

## What the source is

NWW3 hindcast, 3-hourly since 2006, binned by month-of-year, at the grid node
surf-forecast assigns to this break — **48 km (30 mi) offshore**. Their own page
states 3590 predictions for the August panel. Every panel prints badge
percentages (their at-the-break summary) over a bar chart of offshore size
distribution. Published break metadata: right-hand reef over reef, ideal swell
SSW, ideal wind NW, ideal tide low, consistency **3/10**.

## Offshore size distribution — "All Swell, Any Wind"

Percent of time in each offshore Hs bin, as printed. `swell%` is their badge.

| Period | swell% | <0.5 m | 0.5–1.3 m | 1.3–2 m | 2–3 m | >3 m |
|---|---|---|---|---|---|---|
| Jan | 2.0 | 97 | 0.2 | 1.0 | 1.2 | 1.0 |
| Feb | 5 | 93 | 1.1 | 1.2 | 3 | 1.8 |
| Mar | 3 | 89 | 3 | 5 | 3 | 0.2 |
| Apr | 3 | 85 | 3 | 9 | 3 | 0 |
| May | 3 | 72 | 8 | 17 | 4 | 0 |
| Jun | 4 | 69 | 11 | 16 | 4 | 0 |
| Jul | 3 | 62 | 13 | 22 | 4 | 0 |
| Aug | 2.0 | 57 | 18 | 23 | 2.0 | 0 |
| Sep | 2.0 | 64 | 10 | 24 | 2.0 | 0 |
| Oct | 2.0 | 81 | 6 | 11 | 3 | 0.2 |
| Nov | 1.0 | 94 | 3 | 2 | 0.6 | 0 |
| Dec | 2.0 | 97 | 0.4 | 0.6 | 1.8 | 0.6 |
| **Spring** | 4 | 82 | 4 | 10 | 3 | 0 |
| **Summer** | 4 | 62 | 14 | 20 | 3 | 0 |
| **Autumn** | 3 | 80 | 5 | 12 | 1.9 | 0.4 |
| **Winter** | 4 | 95 | 0.5 | 0.9 | 2 | 1.1 |
| **Year** | 4 | 79 | 6 | 11 | 3 | 0.3 |

## Clean-surf consistency — "Light or Offshore Winds"

Badges sum to 100. The bars are a different population (see failure 2).

| Period | too small | blown out | clean |
|---|---|---|---|
| Jan | 98 | 1.7 | 0.3 |
| Feb | 95 | 4 | 0.7 |
| Mar | 97 | 2.0 | 1.0 |
| Apr | 97 | 1.0 | 2.0 |
| May | 97 | 1.0 | 2.0 |
| Jun | 96 | 0 | 4 |
| Jul | 97 | 0 | 3 |
| Aug | 98 | 0.1 | 1.9 |
| Sep | 98 | 0.2 | 1.8 |
| Oct | 98 | 0 | 2.0 |
| Nov | 99 | 1.0 | 0 |
| Dec | 98 | 1.8 | 0.2 |
| **Year** | 96 | 2 | 1.6 |

## Three failures, in order of how much they matter

### 1. The season is backwards

This source says December and January are the flat months — offshore Hs below
0.5 m **97% of the time** — and that August is the biggest. Two independent
reasons that is wrong:

- **Physically.** A 48 km-offshore central-California node cannot sit under
  0.5 m for 97% of December. `CDIP_LIVE_DATA.md` records CDIP 156 (Monterey
  Canyon Outer) at Hs 0.82 m on a quiet August afternoon; the winter offshore
  distribution there is metres, not centimetres.
- **Locally.** `PP_VISITORS_GUIDE_NOTES.md` records PP as a **year-round** break
  whose winter W swell, after Monterey Bay refraction, still delivers
  double-overhead at the top of the point.

The rose graphic says what happened: its open sector runs roughly **045° → 225°**
through E and S — a naive seaward half-plane from the local coast orientation.
W and NW fall in the shaded (land) sector and are discarded. That is precisely
PP's winter source, which does not arrive from the west *at the break* — it
arrives from the south-southwest, after wrapping Soquel Point. A half-plane
filter applied at a node 48 km out throws the entire winter season away.

This is the same geometry the repo already measured: `PP_MAP_GEOMETRY.md` found
the coast tangent rotating ~110° at the apex and holding ~45° down-point, which
is why the down-point gradient is **sheltering, not peel angle**. A half-plane
window has no way to represent that.

### 2. The badges and the bars are computed on different filters

August: badges say 2.0% swell; the bars say 43% of the month is at or above
0.5 m. Both cannot describe the same population. The relation that does hold:

- statistics `swell%` ≈ (2–3 m bar) + (>3 m bar) — within rounding in 10 of 13
  panels (Aug 2.0 vs 2.0, Jun 4 vs 4, Apr 3 vs 3; outliers Oct, Nov, Year).
- consistency `clean%` = the 2–3 m bar **exactly**, in 12 of 13 panels (Feb is
  the exception, 0.7 vs 0.5).

So "too small" is a **fixed ~2 m offshore-Hs threshold**, not a judgement about
whether the break is rideable. Pleasure Point at 2 m offshore with a long period
is a good day; at 1 m it is still a wave. Score a spot by "how often is offshore
Hs ≥ 2 m in a half-plane that excludes NW" and you get **3/10 consistency** for
one of the more reliable waves in Santa Cruz. The rating is an artifact of the
threshold, not a finding.

### 3. Precision is decorative

`2.0%` and `2%` and `3%` appear side by side on the same graph. Values are
transcribed as printed; some rows do not sum to 100. Do not propagate more than
one significant figure out of this source.

## The wind data is fine, and is the part to keep

"Averages since 2006," prevailing **WNW**:

| Period | offshore | onshore | 0–10 kph | 10–20 | 20–30 | 30–40 | >40 |
|---|---|---|---|---|---|---|---|
| Year | 17% | 3% | 4% | 9% | 6% | 1.6% | 0.5% |
| Summer | 35% | 3% | 8% | 17% | 11% | 3% | 0.1% |
| Winter | 1.2% | 3% | 0.5% | 1.0% | 0.9% | 0.9% | 1.4% |

(Strength bars sum to ~21% year — offshore plus onshore, with cross-shore not
broken out. Read them as the classified fraction, not as a full distribution.)

The **35% summer vs 1.2% winter offshore** asymmetry is real, is not affected by
the swell-window bug, and lines up with `VISUAL_GROUND_TRUTH.md`: PP's default
mood is marine-layer diffuse, and its groomed window is the morning offshore
regime — which winter essentially does not get. Winter's strength distribution
is also flatter and reaches >40 kph more often than summer does (1.4% vs 0.1%),
i.e. winter wind is rarer to be offshore and stronger when it blows.

## Model implications

- **Nothing here changes MODEL.md.** No parameter is derived from this source.
- **Do not build a seasonality knob from it.** If "today's ocean" ever wants a
  climatology, take it from the CDIP MOP **SC116 hindcast** — nearshore,
  spectral, on the 10–15 m contour ~150 m off the break, endpoints in
  `CDIP_LIVE_DATA.md`. That job is not started.
- **Wind/texture:** a seasonal offshore probability (summer 0.35, winter 0.012)
  is a defensible input to a surface-texture or grooming term if one is ever
  added. It is a probability of a regime, not a wind speed.
- **The negative result is the keeper.** A commodity break-stats pipeline —
  offshore node, half-plane window, fixed size threshold — gets Pleasure Point
  exactly backwards. That is the argument for the repo's own measured substrate
  (NCEI seabed, OSM shoreline, per-spot depths), stated in one paragraph with
  numbers. It belongs in the essay.

---

*Compiled 2026-08-11. Source: surf-forecast.com break statistics for Pleasure
Point-First Peak (surf-stats, wind-stats), read 2026-08-11. Graphs are their
copyrighted content and are not redistributed; the numeric readings are cited.*
