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

## Provenance of the surf-zone cells (second pass, 2026-09-01)

The first pass above said the per-tile source list "is not published". It is,
in two places, both found by following the dataset ISO record's pointer to
"DEM Development Reports" and the bulk page's `ninth_spatial_meta.zip`:

1. **The tile-set development report** — Lim, Love, Amante, Carignan &
   MacFerrin (2023), *Digital Elevation Models of Santa Cruz: Procedures, Data
   Sources, and Analysis*, NOAA NCEI / CIRES, 9 pp., dated 2023-07-31:
   https://www.ngdc.noaa.gov/mgg/dat/dems/tiled_tr/santa_cruz_ca_tiled_navd88_2023.pdf
   (fetched; 486 KB). Twelve 1/9" tiles, −122.50…−121.50, 36.50…37.25 N; this
   tile is one of them. Its Table 5 is the gridding-weight hierarchy:

   | source | date | weight |
   |---|---|---|
   | USGS Santa Cruz Harbor soundings | 2023 | 1.0 |
   | USGS lidar, Santa Clara County / San Mateo RCD lidar, Santa Cruz County | 2020 | 0.9 |
   | USGS Bathymetry Monterey Canyon and Vicinity (CSMP 2–5 m grids) | 1998–2014 | 0.9 |
   | FEMA lidar Region 9 | 2018 | 0.85 |
   | CSUMB SFML Elkhorn Slough topo-bathy; USACE NCMP topo-bathy lidar California | 2011; 2014 | 0.8 |
   | CSUMB SFML Monterey Bay grids (Soquel, Asilomar, …) | 2008–2011 | 0.75 |
   | NOS BAGs | 2011 | 0.61 |
   | NCEI multibeam; NOAA/JALBTCX Coastal California Topo-bathy DEM | 1998–2008; 2009–2013 | 0.6 |
   | NOS hydrographic surveys | 1932–1979 | 0.2 |
   | **bathymetric pre-surface** | — | **0.1** |

   Gridding is GMT `surface` (spline) on a datalist with those weights; the
   pre-surface is a coarser interpolated bathymetric grid, masked to a
   coastline derived from the lidar, that fills wherever no sounding exists
   (Amante et al. 2023 §2.3). The report's own caveat: "the largest issues
   with the Santa Cruz DEM tiles are the lack of full data coverage in some
   offshore areas".

2. **Per-tile spatial metadata** — the footprints of every source dataset that
   contributed cells, generated at 1/3" and vectorised (Amante et al. 2023
   §2.4, §3.4). Distributed only inside the 790 MB
   `ninth_spatial_meta.zip` on the bulk page; the member for this tile is
   `ninth_spatial_meta/CA/ncei19_n37x00_w122x00_2023v1_sm.gpkg` (25.3 MB,
   dated 2025-12-19; one MultiPolygon layer, 12 features, fields `Title,
   Agency, Date, Type, Resolution, HDatum, VDatum, URL`). The window clip is
   committed here as `ncei19_n37x00_w122x00_2023v1_sm_pp_clip.geojson`
   (EPSG:4269, eight of the twelve footprints intersect the window; polygons
   simplified at ~1 m, which is nothing against their 10 m cells).

   ```bash
   curl -s -o ninth_spatial_meta.zip https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/dem/NCEI_ninth_Topobathy_2014_8483/ninth_spatial_meta.zip
   unzip -j ninth_spatial_meta.zip "ninth_spatial_meta/CA/ncei19_n37x00_w122x00_2023v1_sm.gpkg"
   # then clip to -122.0001,36.93,-121.93,36.975 (pyogrio + shapely; the one-off is 30 lines)
   ```

**What the footprints say at the seven canon spots: no source covers any of
them.** Walking the OSM shore-normal from each node, the landward edge of the
nearest measured dataset (San Mateo RCD topographic lidar, 2020) is 39–114 m
shoreward of the node, and the seaward edge of the nearest bathymetric dataset
(the JALBTCX Coastal California Topo-bathy DEM and/or the CSMP Monterey Canyon
grid) is 324–576 m seaward. The unmeasured gap the tile interpolates across is
408–651 m wide, and every node sits inside it:

| spot | node z (m NAVD88) | land lidar ends (m shoreward) | bathymetry begins (m seaward) | gap (m) |
|---|---:|---:|---:|---:|
| Sewer Peak | −2.85 | 114 | 459 (JALBTCX) | 573 |
| First Peak | −0.49 | 84 | 507 (JALBTCX) | 591 |
| Second Peak | −0.39 | 75 | 486 (JALBTCX + CSMP) | 561 |
| 38th | −0.56 | 75 | 576 (both) | 651 |
| The Hook | −0.10 | 39 | 387 (both) | 426 |
| Shark's Cove | −0.10 | 45 | 462 (both) | 507 |
| Private's | −1.68 | 84 | 324 (both) | 408 |

The USACE NCMP 2014 topobathy lidar — the one source in the hierarchy that
*could* have sounded a surf zone — covers 0.07 % of the window and none of the
reef. So the source class at all seven spots is **interpolation** (GMT
`surface` between the 2020 land lidar and bathymetry ≥ 320 m out, with the
weight-0.1 pre-surface underneath). This is the same coverage pattern the
CSMP 2 m grid showed (data starting 325–565 m seaward); the CUDEM does not
have new surf-zone data here, it has a smoother interpolant across the same
hole.

**The −0.10 m flats, re-examined on the GeoTIFF rather than the stage JSON.**
`build_candidate_grids.py` rounds elevations to 2 dp when it writes
`pp_bathy_cudem19.json`, so "exactly −0.10 across 81 posts" (CUDEM_BED §3) is
the JSON's precision. In the raster the plateau is −0.100 ± 0.0005 m: seven
distinct float32 values within 4×10⁻⁵ of −0.1 each occupy 320–456 cells,
1,085 cells lie within 10⁻⁵ m, 8,564 within 0.5 mm (8.1 ha of the window),
15,135 within 1 cm. The connected component that carries The Hook and
Shark's Cove is 5,344 cells (5.0 ha) and runs from −121.9722 to −121.9573 E
(First Peak's longitude to Private's) hugging the coastline; its outer ring
is 0 % land, half a few mm above −0.1 and half a few mm below. The 0.1 m
histogram of the window's shallow cells piles up in [−0.2, −0.1): 17,007
cells against 2,400–3,600 in every bin from −3.0 to −0.3. The N→S transect
through The Hook reads +0.38, 0.00, −0.10, −0.10, −0.10, −0.11, −0.26, −0.62 m
at 17 m steps: a step from the lidar waterline to −0.10, a shelf, then the
ramp. Through Shark's Cove it reads −0.10 for ~190 m before the ramp starts.

A measured platform does not have a 0.5 mm vertical spread over five
hectares. Read with the footprints, this is the interpolant flattening
between the coastline mask (lidar ends at ~0 m) and the first soundings
300–500 m out; the pre-surface / `surface` combination produces a near-level
sheet before the offshore gradient takes over. **Why the level is −0.10 m
specifically is not stated in the report, the ISO record or the methods
paper**; it may be a coastline value the `coastline` module assigns or the
pre-surface's landward edge. What *is* documented is that no measurement lies
under it.

**No uncertainty raster exists for this tile.** The ISO record: "No
quantitative vertical accuracy analyses have been performed on the DEM
tiles." Amante et al. 2023: "We did not rigorously quantify the accuracy in
bathymetry in the CUDEM tiles due to the lack of high-accuracy, independent
measurements", and per-cell total-propagated-uncertainty rasters are listed
under future work ("collaborating with the USGS on generating spatially
explicit rasters"). The ICESat-2 validation (0.12 ± 0.75 m, RMSE 0.76 m) is
land-only. The spatial-metadata footprints are the only per-cell provenance
product, and they say "none" here.

## Licence

NOAA NCEI product, "Not subject to copyright protection within the United
States." Not for navigation. Citation: Cooperative Institute for Research in
Environmental Sciences (CIRES) at the University of Colorado, Boulder. 2014:
Continuously Updated Digital Elevation Model (CUDEM) - 1/9 Arc-Second
Resolution Bathymetric-Topographic Tiles. NOAA National Centers for
Environmental Information. https://doi.org/10.25921/ds9v-ky35. Tile version
2023v1 (file Last-Modified 2024-01-10).
