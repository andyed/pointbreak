# data/climatology — surf-forecast.com break statistics

Read 2026-08-11 from surf-forecast.com's published statistics for
**Pleasure Point-First Peak**. One file: `pp_surfforecast_climatology.json`.

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
  which is nearshore and spectral. That job is not done.

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
