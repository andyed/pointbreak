# data/bathy — real seafloor elevation

Pulled 2026-08-09 from NOAA NCEI via THREDDS/OPeNDAP.

Source: **Monterey Bay 1/3 arc-second Coastal DEM** (`monterey_13_navd88_2012.nc`),
~10 m post spacing (grid here: dx 8.2 m × dy 10.3 m locally). NOAA NCEI data,
public domain. (No 1/9 arc-second CUDEM tile exists for this corner as of the
pull; 1/3 is the finest hosted grid.)

Datum: **NAVD88** meters, negative below datum. Local mean sea level sits
roughly a meter above NAVD88 here — the exact tidal-datum conversion (for the
Phase 3 tide input) is a TODO: use NOAA CO-OPS datums for the Monterey/Santa
Cruz tide station rather than a guessed constant.

## Files

- `bathy_subset.ascii` — raw OPeNDAP ASCII subset, `Band1[13478:13738][4644:5292]`
  of the source grid = lat 36.948–36.972, lon −121.99 to −121.93 (261×649).
- `process_bathy.py` — parses it, projects onto the same local-meter frame as
  `../osm/pp_geometry.json` (origin = PP apex), bilinear-samples elevation at
  each surf spot, prints a shore-normal transect at Sewer Peak.
- `pp_bathy.json` — the grid in stage space: `x0,y0,dx,dy,ncols,nrows,elev[][]`
  (row-major, elev[r][c] at x = x0+c·dx, y = y0+r·dy) + per-spot elevations.

## Refetch

```bash
curl -s "https://www.ngdc.noaa.gov/thredds/dodsC/regional/monterey_13_navd88_2012.nc.ascii?Band1%5B13478:1:13738%5D%5B4644:1:5292%5D" -o bathy_subset.ascii
python3 process_bathy.py
```
