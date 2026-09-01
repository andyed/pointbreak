# data/bathy — real seafloor elevation

Pulled 2026-08-09 from NOAA NCEI via THREDDS/OPeNDAP.

Source: **Monterey Bay 1/3 arc-second Coastal DEM** (`monterey_13_navd88_2012.nc`),
~10 m post spacing (grid here: dx 8.2 m × dy 10.3 m locally). NOAA NCEI data,
public domain.

**Correction, 2026-09-01.** The 2026-08-09 note that "no 1/9 arc-second CUDEM
tile exists for this corner" was wrong, or has since stopped being true: NOAA
NCEI CUDEM tile `ncei19_n37x00_w122x00_2023v1.tif` (1/9 arc-second, ≈3 m,
NAVD88, file dated 2024-01-10) covers Pleasure Point, and the USGS California
Seafloor Mapping Program has a 2 m swath grid for the Offshore of Aptos block
that reaches to about the 10 m isobath. Both were fetched into
`candidates/` and compared in `../../docs/research/BATHY_SOURCES_2026-09-01.md`.
**The shipped `pp_bathy.json` is unchanged** — the candidates are evaluated,
not wired in.

Datum: **NAVD88** meters, negative below datum. Local mean sea level sits
roughly a meter above NAVD88 here — the exact tidal-datum conversion (for the
Phase 3 tide input) is a TODO: use NOAA CO-OPS datums for the Monterey/Santa
Cruz tide station rather than a guessed constant. (MSL − NAVD88 = 0.905 m at
CO-OPS 9413450 is what the rest of the repo uses.)

## Files

Shipped:

- `bathy_subset.ascii` — raw OPeNDAP ASCII subset, `Band1[13478:13738][4644:5292]`
  of the source grid = lat 36.948–36.972, lon −121.99 to −121.93 (261×649).
- `process_bathy.py` — parses it, projects onto the same local-meter frame as
  `../osm/pp_geometry.json` (origin = PP apex), bilinear-samples elevation at
  each surf spot, prints a shore-normal transect at Sewer Peak.
- `stage_frame.py` — the projection, OPeNDAP parser and bilinear sampler
  factored out of `process_bathy.py` (2026-09-01) so the candidate builder uses
  the identical frame. `process_bathy.py` reproduces `pp_bathy.json`
  byte-for-byte after the refactor.
- `pp_bathy.json` — the grid in stage space: `x0,y0,dx,dy,ncols,nrows,elev[][]`
  (row-major, elev[r][c] at x = x0+c·dx, y = y0+r·dy) + per-spot elevations.

Candidates (2026-09-01, same schema, `elev` may contain `null`):

| File | Source | Lattice | Notes |
|---|---|---|---|
| `bathy_subset_wide.ascii` | same NCEI DEM, `Band1[13284:13770][4536:5292]` = lat 36.930–36.975, lon −122.00 to −121.93 (487×757) | native 1/3" | seaward edge y = −2679 m, so the 15 m contour is inside the grid at all seven canon spots (the old subset ended at y = −682 m) |
| `pp_bathy_ncei13_wide.json` | the above on the stage frame | 8.2 × 10.3 m | drop-in superset of `pp_bathy.json`; identical values where they overlap |
| `pp_bathy_cudem19.json` | `candidates/ncei_cudem19/` | 3 m, x −300…3201, y −1500…2100 | full coverage incl. land; the only grid with data under the surf zone that is not the 2012 DEM |
| `pp_bathy_csmp_aptos.json` | `candidates/csmp_aptos/` (README only) | 3 m, same window | **not committed** (gitignored, with its clip): null at every canon spot — the swath survey starts 325–565 m seaward of them. `build_candidate_grids.py csmp` regenerates it after the README's refetch |

- `build_candidate_grids.py` — builds the candidate JSONs — `ncei`, `cudem` by default, `csmp` opt-in (needs the
  rasterio venv below). `compare_candidates.py` — the comparison tables in the
  BATHY_SOURCES doc (stdlib + numpy). `candidates/*/README.md` — provenance,
  URLs, datum, licence per source; `candidates/*/raw/` is gitignored.

## Refetch

```bash
# shipped subset
curl -s "https://www.ngdc.noaa.gov/thredds/dodsC/regional/monterey_13_navd88_2012.nc.ascii?Band1%5B13478:1:13738%5D%5B4644:1:5292%5D" -o bathy_subset.ascii
python3 process_bathy.py

# widened subset (index i = (lat - 35.699953703705)/9.259259e-05, j = (lon + 122.420046296295)/9.259259e-05)
curl -s "https://www.ngdc.noaa.gov/thredds/dodsC/regional/monterey_13_navd88_2012.nc.ascii?Band1%5B13284:1:13770%5D%5B4536:1:5292%5D" -o bathy_subset_wide.ascii

# candidate grids: rasterio is not in the Homebrew python; use a uv venv
~/.local/bin/uv venv .venv-bathy --python 3.12
~/.local/bin/uv pip install rasterio numpy --python .venv-bathy/bin/python
.venv-bathy/bin/python build_candidate_grids.py      # after refetching the clips per candidates/*/README.md
python3 compare_candidates.py
```

## Licence

NOAA NCEI and USGS data: work of the U.S. Government, public domain (the USGS
CSMP grid is additionally marked CC0 1.0). The processing scripts are MIT. See
../../LICENSES.md.
