# candidates/csmp_aptos — USGS California Seafloor Mapping Program, Offshore of Aptos

Fetched 2026-09-01. Pleasure Point (−121.976, 36.954) is in the **Offshore of
Aptos** CSMP block, not Offshore of Santa Cruz: the Santa Cruz block's east
bound is −122.00 (its `Bathymetry_OffshoreSantaCruz_metadata.txt`,
`East_Bounding_Coordinate: -122.00`), which is 2.1 km west of the apex. The
Aptos block spans −122.00 to −121.80, 36.84 to 37.00.

## Products in the block

| File | What | Native | Covers PP? |
|---|---|---|---|
| `BathymetryA_USGS_OffshoreAptos.zip` (108.1 MB, TIFF 334 MB) | USGS 234 kHz SEA SWATHplus interferometric swath bathymetry, 2009, 2 m grid, 9047×9101 | NAD83 / UTM 10N (EPSG:26910), **NAVD88 m** | Offshore only — see below |
| `BathymetryB_CSUMB_OffshoreAptos.zip` (2.7 MB, TIFF 142 MB) | CSUMB Seafloor Mapping Lab Reson 8101 multibeam, 2006, 3 m grid | NAD83 / UTM 10N, NAVD88 m | **No** — zero valid cells in the −122.00…−121.93 × 36.93…36.975 window; the B grid is the eastern (Soquel / Aptos) part of the block. Not clipped, not committed. |

Source page (catalog with download links, metadata in txt/xml/html/faq):
https://cmgds.marine.usgs.gov/data/csmp/OffshoreAptos/data_catalog_OffshoreAptos.html

Direct downloads used:
- https://cmgds.marine.usgs.gov/data/csmp/OffshoreAptos/data/BathymetryA_USGS_OffshoreAptos.zip
- https://cmgds.marine.usgs.gov/data/csmp/OffshoreAptos/data/BathymetryB_CSUMB_OffshoreAptos.zip
- metadata: https://cmgds.marine.usgs.gov/data/csmp/OffshoreAptos/metadata/BathymetryA_USGS_OffshoreAptos_metadata.txt

Data release DOI: https://doi.org/10.5066/F7K35RQB (DataCite: "California State
Waters Map Series Data Catalog--Offshore of Aptos, California", USGS, 2015).
Parent catalog: USGS Data Series 781, https://doi.org/10.3133/ds781. Companion
map: Cochrane et al. 2016, USGS OFR 2016-1025, https://doi.org/10.3133/ofr20161025.

## What is committed here — only this README

This source is a **negative result** for the reef (next section), so neither
the clip nor its stage-frame JSON enters the repository's history. Both are
gitignored (`data/bathy/candidates/csmp_aptos/*.tif`,
`data/bathy/pp_bathy_csmp_aptos.json`) and regenerable:

```bash
# 1. fetch (108 MB + 2.7 MB) into raw/
mkdir -p raw && cd raw
curl -sL -A "Mozilla/5.0" -o BathymetryA_USGS_OffshoreAptos.zip \
  "https://cmgds.marine.usgs.gov/data/csmp/OffshoreAptos/data/BathymetryA_USGS_OffshoreAptos.zip"
unzip -q BathymetryA_USGS_OffshoreAptos.zip && cd ..

# 2. clip to the PP window (rasterio venv, see ../../README.md): transform
#    -122.0001,36.930,-121.930,36.975 (EPSG:4269) to EPSG:26910, window the
#    2 m TIFF, write BathymetryA_USGS_OffshoreAptos_pp_clip.tif (deflate,
#    2530x3148, ~15 MB). The one-off clip code is the `bilinear_from_raster`
#    input path documented in ../../build_candidate_grids.py.

# 3. stage-frame JSON (8.4 MB, gitignored)
cd ../.. && .venv-bathy/bin/python build_candidate_grids.py csmp
```

- `raw/` — the two zips and their extracted contents (577 MB). Gitignored
  (`data/bathy/candidates/*/raw/`).

## Coverage at the reef — the important caveat

The A grid's own metadata says the survey ran "from about the 10-m isobath to
beyond the 3-nautical-mile limit". Measured on the stage frame: the nearest
valid A cell to each canon spot is **325–565 m** seaward of it, at −6.3 to
−10.6 m NAVD88. In the clip the shallowest valid cell anywhere is −1.29 m, but
none of that is under the surf zone at Pleasure Point. So this product cannot
say anything about the reef at breaking depth; it is a check on the 10–30 m
shelf and on the 15 m contour. See `../../../../docs/research/BATHY_SOURCES_2026-09-01.md`.

## Datum check

Against the NCEI 1/3" grid on the 3 m stage lattice, 790,593 overlapping cells:
mean difference −0.001 m, RMS 0.076 m (RMS 0.049 m deeper than 15 m). Both
grids are NAVD88 as stated; no vertical shift was applied. Horizontal: NAD83
here vs the stage frame's WGS84 (OSM) — ~1 m, not applied.

## Licence

USGS-authored data, public domain, marked CC0 1.0 Universal per the metadata's
Use_Constraints. Attribution requested: "U.S. Geological Survey, Pacific Coastal
and Marine Science Center". Not for navigation.

Citation: Dartnell, P., Ritchie, A.C., and Finlayson, D.P., 2015,
Bathymetry--Offshore Aptos, California, in Golden, N.E., compiler, 2013,
California State Waters Map Series Data Catalog: U.S. Geological Survey Data
Series 781, https://doi.org/10.3133/ds781.
