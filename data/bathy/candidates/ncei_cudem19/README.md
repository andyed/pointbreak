# candidates/ncei_cudem19 — NOAA NCEI CUDEM 1/9 arc-second tile

Fetched 2026-09-01. This corrects the 2026-08-09 note in `../../README.md`:
a 1/9 arc-second CUDEM tile **does** cover Pleasure Point.

- Tile: `ncei19_n37x00_w122x00_2023v1.tif` — 8112×8112 cells, 1/9 arc-second
  (3.086e-5°, ≈2.75 m E–W × 3.43 m N–S at 37° N), covering −122.00…−121.75 E,
  36.75…37.00 N. Float32, nodata −9999, deflate, tiled 512. 202,085,134 bytes
  (over this task's ~200 MB single-file cap, so only a window was fetched).
- CRS in the file: `NAD83 + NAVD88 height` compound (EPSG:5498 = EPSG:4269
  horizontal + EPSG:5703 vertical). Vertical datum is therefore NAVD88 metres,
  positive up, same as the shipped NCEI 1/3" grid.
- Direct URL (public S3 bucket behind the NOAA bulk page):
  https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/dem/NCEI_ninth_Topobathy_2014_8483/CA/ncei19_n37x00_w122x00_2023v1.tif
- Bulk index: https://chs.coast.noaa.gov/htdata/raster2/elevation/NCEI_ninth_Topobathy_2014_8483/CA/
  (40 CA tiles; the neighbours `n37x00_w122x25`, `n36x75_w122x00` also exist)
- Dataset landing / metadata: https://www.ncei.noaa.gov/access/metadata/landing-page/bin/iso?id=gov.noaa.ngdc.mgg.dem%3A199919
- Human-readable ISO: https://chs.coast.noaa.gov/htdata/raster2/elevation/NCEI_ninth_Topobathy_2014_8483/ncei_nintharcsec_dem_m8483_met_forHumans.html
- DOI: https://doi.org/10.25921/ds9v-ky35 (DataCite: CIRES / NOAA NCEI, 2014, continuously updated)

## What is committed here

`ncei19_n37x00_w122x00_2023v1_pp_clip.tif` (11.0 MB) — the tile windowed to
−122.0001…−121.930 E, 36.930…36.975 N (1458×2271 cells, no nodata in the
window: it is a topobathy tile, land included), read by HTTP range requests
through GDAL `/vsicurl/`, written deflate with SOURCE_URL, CLIP_BOUNDS and
FETCH_DATE tags. Values, nodata and CRS untouched.

## Relationship to the other grids (measured, 3 m stage lattice)

- vs the CSMP 2 m SWATHplus grid: 790,593 cells, mean +0.006 m, RMS 0.071 m;
  a ±2-cell shift test has its minimum at (0,0). The CUDEM is the CSMP
  survey re-gridded wherever the CSMP has data.
- vs the NCEI 1/3" grid: deeper than 15 m, mean +0.005 m, RMS 0.018 m
  (same source lineage); shallower than 10 m the RMS rises to 0.7–1.1 m. The
  two DEMs differ only in the surf zone, which is where the CUDEM has data the
  2012 DEM did not (the CUDEM programme's shallow sources are NOAA/USACE
  topobathymetric lidar and NOS surveys; the exact source list for this tile is
  not published per-tile — see the BATHY_SOURCES doc).

## Licence

NOAA NCEI product, "Not subject to copyright protection within the United
States." Not for navigation. Citation: Cooperative Institute for Research in
Environmental Sciences (CIRES) at the University of Colorado, Boulder. 2014:
Continuously Updated Digital Elevation Model (CUDEM) - 1/9 Arc-Second
Resolution Bathymetric-Topographic Tiles. NOAA National Centers for
Environmental Information. https://doi.org/10.25921/ds9v-ky35. Tile version
2023v1 (file Last-Modified 2024-01-10).
