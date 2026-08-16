# data/climatology — Pleasure Point wave climatology

Four files, and they are not peers.

| File | Source | Status |
|---|---|---|
| `pp_cdip_climatology.json` | CDIP MOP SC116 hindcast, 25 y hourly, ~110 m from the break | **the seasonality prior** |
| `pp_monthly_ocean.js` | derived from the above | the `#month=` data module web-three imports |
| `pp_spectral_sets.json` | CDIP MOP SC116 directional spectra | set-structure analysis — **a negative result** |
| `pp_surfforecast_climatology.json` | surf-forecast.com break stats, NWW3 node 48 km offshore | provenance + wind only |

Two builders. `build_cdip_climatology.py` needs only stdlib + numpy and emits the
first two files; `build_spectral_sets.py` needs netCDF4 and a 148 MB local copy
of the hindcast (both scripts document their own recipe in `--help`).

Analyses: `../../docs/research/PP_CDIP_CLIMATOLOGY.md`,
`../../docs/research/PP_SPECTRAL_SETS.md`, and for the older source and why it
fails, `../../docs/research/PP_SWELL_CLIMATOLOGY.md`.

## pp_spectral_sets.json — read the verdict before using it

Built to replace MODEL.md's invented `Δf ~0.006 Hz` with a measured one. **It
does not.** MOP's grid is 0.005 Hz through the swell range, so the smallest
resolvable Δf is 0.010 Hz and the authored value sits below the floor — this
instrument can neither confirm nor refute it. Spectral width looks like the
natural substitute and is a cutoff artifact (6.1× swing). What the file does
establish: bimodality is a minority state thinning with size (23.8% of all
hours, 8.9% above Hs 2 m), and two-component seas arrive from within 11.4° of
each other, which vindicates the model's directionless scalar beat.
**Do not retune `dF` from this file.**

`.cache/` holds the raw OPeNDAP pull. It is gitignored and regenerable; the
committed JSON records its SHA-256.

## pp_cdip_climatology.json — use this one

CDIP MOP v1.1 alongshore transect SC116, hourly 2000–2024 (whole calendar years;
the file runs to 2025-03-31 and the partial year is excluded so month-of-year
bins are balanced). 218,975 records after QC. Carries Hs percentiles and bins,
`Ta`, `Dp` with a circular mean, resultant length and 16-point rose, per month.

Read `method` in the JSON before using it. The two traps it encodes: **`waveTp`
is quantised** to MOP's 20 frequency bands (19 distinct values in 221k records,
same median band every month — use `ta_s` for period), and **it is a model, not
a measurement** — MOP transforms offshore buoy spectra shoreward, it does not
observe Pleasure Point.

Headline: a single-peaked winter season. January median Hs 0.86 m against
August's 0.47 m; 21.5% of January hours at or over 1.3 m against **zero hours in
July and August across 25 years**. Direction is collimated to a 25°-wide band
around 198.6 °T with a 9.5° seasonal rotation.

## pp_surfforecast_climatology.json — kept, but not for swell

Read 2026-08-11 from surf-forecast.com's published statistics for
**Pleasure Point-First Peak**.

This is a **weak source**, kept for provenance and for the one thing it is
actually good for (wind), not as a climatology of Pleasure Point. Read the
caveats before using any number here. The analysis lives in
`../../docs/research/PP_SWELL_CLIMATOLOGY.md`.

## What it is

NWW3 hindcast, 3-hourly since 2006, binned by month-of-year, at the grid node
surf-forecast picked for this break — **48 km (30 mi) offshore**. Each panel
carries two things: badge percentages (their at-the-break summary) and a bar
chart of offshore size distribution. Both are transcribed here.

## Caveats

1. **The node is 48 km out.** Nothing here is a measurement at the break.
   Everything at the break — refraction around Soquel Point, the reef, the
   sheltering gradient down-point — happens shoreward of it.

2. **The seasonality is inverted relative to reality.** This source says winter
   is the flat season (Dec/Jan `<0.5 m` 97% of the time) and August is the big
   one. Pleasure Point's main season is winter W/NW swell — the repo's own
   `docs/research/PP_VISITORS_GUIDE_NOTES.md` records double-overhead at the
   top of the point on winter W swell. A 97% flat December offshore of central
   California is not physically possible; some direction window is being applied
   that excludes the W–NW quadrant, which is exactly PP's winter source after it
   refracts. **Do not use this as a seasonality prior.** The rose graphic is
   consistent with this: its open sector runs ~045°→225° through S and E, so
   W and NW are outside it.

   **CONFIRMED 2026-08-16, quantitatively.** Against SC116 at the break, this
   source's `<0.5 m` fraction is 85 points too high in December (97% offshore
   vs 12.0% nearshore — waves do not grow shoreward) and **1.9 points off in
   August** (57 vs 58.9). The error is direction-gated exactly as inferred: it
   agrees when the swell is from the S and inside their window, and collapses
   when it is from the W–NW and outside it. Spearman ρ against the CDIP size
   ranking is −0.77. Full working: `../../docs/research/PP_CDIP_CLIMATOLOGY.md`.

3. **The badges and the bars are computed on different filters.** August:
   badges say 2.0% swell, bars sum to 43% of the month at ≥0.5 m. They cannot
   both be the same population. The badge tracks the `≥2 m` bins (see
   `derived_checks` in the JSON), so the "too small" line is a **~2 m offshore
   Hs threshold**, not an assessment of whether the break is rideable. That is
   why the published consistency rating is 3/10 for a spot that is locally
   regarded as one of the more reliable waves in Santa Cruz.

4. **Percentages are as printed**, including surf-forecast's mixed precision
   (`2.0%` vs `2%` vs `3%`). Rounding means some rows do not sum to 100.

## What it is good for

- **Wind.** Prevailing WNW, offshore 35% of summer vs 1.2% of winter, onshore
  3% year-round. That is a real and useful asymmetry, and it is consistent with
  `VISUAL_GROUND_TRUTH.md`'s marine-layer default: PP's clean window is the
  morning offshore/light regime, and winter is almost never offshore.
- **Break metadata** — right-hand reef, ideal swell SSW, ideal wind NW, ideal
  tide low. Matches the canon presets.
- **A negative result worth keeping**: an off-the-shelf break-stats source with
  a fixed offshore threshold and a half-plane swell window gets Pleasure Point's
  season backwards. If the "today's ocean" mode ever needs a climatology, it has
  to come from CDIP MOP SC116 hindcast (see `docs/research/CDIP_LIVE_DATA.md`),
  which is nearshore and spectral. **DONE 2026-08-16** —
  `pp_cdip_climatology.json`, above.

## A second weak source, checked and rejected (2026-08-16)

**spitcast.com** publishes a Pleasure Point page with a monthly `fair+ percent`
panel. It is **not** transcribed here and should not be. No stated sample size,
no year range, no definition of `fair+`, no swell direction anywhere on the
page, and a "Sand 18%" factor weight for a break its own adjacent paragraph
calls a sandstone reef. Its ranking puts August third-best and December
worst-equal; Spearman ρ against the CDIP size ranking is **+0.06** — not an
inverted signal like surf-forecast's, but no signal at all. Its own prose
("bigger sets in winter") contradicts its own table. Recorded so the negative
result is not re-derived: `../../docs/research/PP_CDIP_CLIMATOLOGY.md`.

## Refetch

The numbers are printed inside GIF images, one per period, so there is no API.
The images are **not** stored in this repo (see Licence below); refetch and
re-read them if you need to verify a value.

```bash
BASE=https://www.surf-forecast.com/graphs/statistics/Pleasure-Point-First-Peak
for m in january february march april may june july august september october \
         november december spring summer autumn winter year; do
  for k in surf.statistics surf.consistency; do
    curl -sL -A "Mozilla/5.0" \
      -e https://www.surf-forecast.com/breaks/Pleasure-Point-First-Peak/surf-stats \
      "$BASE.$k.$m.gif" -o "$k.$m.gif"
  done
done
# wind: $BASE.wind.statistics.$m.gif, same period names
```

Each panel's numbers sit in two strips — the badges at the top (y 0–100) and
the bar chart at the bottom (y 410–560) of the 390×560 frame.

## Licence

surf-forecast.com's graphs are their copyrighted content and are **not
redistributed here**. `pp_surfforecast_climatology.json` holds transcribed
numeric readings with attribution, which is citation, not republication —
the same footing as the guide sources in `docs/research/`. See
`../../LICENSES.md`, "Sources that are cited, not redistributed."
