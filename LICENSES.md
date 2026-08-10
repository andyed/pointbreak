# Licensing

Short version: **the code and the writing are MIT. Some of the data is not.**

A blanket MIT grant over this repository would be wrong, because the OSM-derived
files carry ODbL's share-alike obligation, which the repository owner cannot
relicense away. The split below is the accurate statement.

## MIT — code, docs, figures, renders

Everything not listed in the sections below, including:

- `web/`, `web-three/` (excluding `web-three/vendor/`) — both renderers
- `data/osm/process.py`, `data/bathy/process_bathy.py`,
  `data/model/build_geo_profiles.py`, `data/model/build_depth_patches.py`,
  `docs/figures/gen_*.py`, `scripts/`, `tests/` — the processing and build tools
- `docs/` prose: `MODEL.md`, `WEB_THREE_SPEC.md`, `research/`
- `docs/figures/*.svg` and `docs/figures/assets/*.png` — figures and renders.
  Under ODbL these are **Produced Works**: a map or plot made *from* the
  database is not itself the database, so they may be MIT-licensed provided
  OpenStreetMap is credited. They are — in each figure and in the page footer.

Copyright (c) 2026 Andy Edmonds. See [LICENSE](LICENSE).

## ODbL 1.0 — the OpenStreetMap-derived database files

**Open Database License v1.0**, https://opendatacommons.org/licenses/odbl/1-0/
Data © OpenStreetMap contributors, https://www.openstreetmap.org/copyright

| File | Why |
|---|---|
| `data/osm/coastline_raw.json` | verbatim Overpass extract |
| `data/osm/refs_raw.json` | verbatim Overpass extract |
| `data/osm/pp_geometry.json` | derivative database: OSM geometry reprojected |
| `data/model/pp_geo_profiles.js` | generated from `pp_geometry.json`; encodes OSM node positions and OSM-derived stage frames |
| `data/model/pp_depth_patches.js` | NCEI elevations (public domain) **resampled onto an OSM-derived frame**, so the arrangement is a derivative database |

If you redistribute those files, or a database derived from them, ODbL requires
you to attribute OpenStreetMap and to offer the derived database under ODbL.
Redistributing only a *rendering* made from them does not trigger share-alike;
attribution is still required.

## Public domain — NOAA bathymetry

`data/bathy/bathy_subset.ascii` and `data/bathy/pp_bathy.json` are derived from
the NOAA NCEI Monterey Bay 1/3 arc-second Coastal DEM
(`monterey_13_navd88_2012.nc`). Work of the U.S. Government; no copyright.
Attribution is a courtesy, not an obligation — we give it anyway.

The tidal datum (MSL − NAVD88 = 0.905 m) comes from NOAA CO-OPS station 9413450
(Monterey). Also public domain.

## Third-party code

`web-three/vendor/three.module.js` and `web-three/vendor/OrbitControls.js` are
**three.js**, r170, MIT License, Copyright © 2010-2024 three.js authors.
https://github.com/mrdoob/three.js — see `web-three/vendor/VENDOR.md` for the
pinned version and source URLs.

## Sources that are cited, not redistributed

`docs/research/` cites published guides and papers (Surfer.com, Sunny
California, Hutt/Black/Mead, Battjes, McCowan, Storlazzi et al.). Those are
referenced and paraphrased under normal citation practice; none of their text
is reproduced at length here, and none of it is relicensed by this repository.

## Not a forecast

Nothing in this repository is validated against measurements of Pleasure Point.
It is a model, not a surf report, and it must not be used for navigation or for
any decision about entering the water.
