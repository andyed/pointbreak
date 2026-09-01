#!/usr/bin/env python
"""Resample the candidate bathymetry grids onto the pp_bathy.json stage frame.

Outputs (all in this directory, all the pp_bathy.json schema —
x0,y0,dx,dy,ncols,nrows,elev[][] row-major, elev[r][c] at x = x0+c*dx,
y = y0+r*dy, plus per-spot elevations):

  pp_bathy_ncei13_wide.json   — the widened NCEI 1/3 arc-second subset
                                (bathy_subset_wide.ascii), native lat/lon
                                lattice exactly as process_bathy.py does it
  pp_bathy_cudem19.json       — NOAA NCEI CUDEM 1/9 arc-second tile
                                ncei19_n37x00_w122x00_2023v1, resampled to a
                                3 m stage lattice
  pp_bathy_csmp_aptos.json    — USGS CSMP "BathymetryA [USGS]--Offshore Aptos"
                                2 m SWATHplus grid on the same lattice. OPT-IN
                                (`build_candidate_grids.py csmp`): the grid is
                                null at every canon spot, so the clip and this
                                JSON are gitignored; candidates/csmp_aptos/
                                README.md has the refetch recipe.

Default targets: ncei, cudem. Nothing here touches pp_bathy.json.

Datums. Every source is NAVD88 metres, positive up, per its own metadata
(NCEI: geospatial_bounds_vertical_crs; CSMP: Altitude_Datum_Name; CUDEM:
EPSG:5703 in the GeoTIFF CRS), so no vertical shift is applied. Horizontal:
the stage frame is anchored to OSM (WGS84); CSMP is NAD83 / UTM 10N
(EPSG:26910) and CUDEM is NAD83 geographic (EPSG:4269). NAD83–WGS84 differ by
~1 m in California, below the finest post spacing, and no realization shift is
applied — pyproj's default null transform is used and that choice is recorded
in each output's `horizontal_note`.

Bilinear resampling; a stage cell whose four source neighbours are not all
valid is written as null rather than extrapolated.

Needs rasterio + numpy. The Homebrew python3 has neither; the repo recipe is a
uv venv (see README).
"""
import json
import math
import os
import sys

import numpy as np
import rasterio
from rasterio.warp import transform as warp_transform

from stage_frame import StageGrid, load_origin, make_projector, parse_opendap_ascii

HERE = os.path.dirname(os.path.abspath(__file__))
CAND = os.path.join(HERE, 'candidates')

# The 3 m stage lattice shared by the fine candidates. Covers every canon spot
# (x -47..2865, y -63..1919) plus 1.5 km along the ~146 deg seaward normal from
# each, which is where the 15 m contour has to be found.
FINE = dict(x0=-300.0, y0=-1500.0, dx=3.0, dy=3.0, ncols=1168, nrows=1201)

lat0, lon0, geo = load_origin(os.path.join(HERE, '..', 'osm', 'pp_geometry.json'))
to_xy, to_latlon = make_projector(lat0, lon0)


def spot_table(sample):
    out = []
    for sp in geo['spots']:
        z = sample(sp['x'], sp['y'])
        out.append({'name': sp['name'], 'u': sp['u'],
                    'elev_navd88_m': None if z is None else round(z, 2)})
    return out


def write(path, grid, meta):
    rows = [[None if (v is None or v != v) else round(float(v), 2) for v in row]
            for row in grid.rows]
    out = dict(meta)
    out.update({
        'origin': geo['origin'],
        'x0': round(grid.x0, 1), 'y0': round(grid.y0, 1),
        'dx': round(grid.dx, 3), 'dy': round(grid.dy, 3),
        'ncols': grid.ncols, 'nrows': grid.nrows,
        'elev': rows,
        'spot_elev': spot_table(grid.sample),
    })
    with open(path, 'w') as f:
        json.dump(out, f, separators=(',', ':'))
    print(f'{os.path.basename(path)}: {grid.nrows}x{grid.ncols}, '
          f'dx={grid.dx:.2f} dy={grid.dy:.2f}, x [{grid.x0:.0f},{grid.x_max():.0f}] '
          f'y [{grid.y0:.0f},{grid.y_max():.0f}], {os.path.getsize(path)/1e6:.1f} MB')
    for s in out['spot_elev']:
        print(f"  {s['name']:<20}{str(s['elev_navd88_m']):>8}")


def bilinear_from_raster(tif_path, src_is_geographic):
    """Sample a GeoTIFF onto the FINE stage lattice. Returns a StageGrid whose
    missing cells are None."""
    with rasterio.open(tif_path) as ds:
        arr = ds.read(1).astype('float64')
        nod = ds.nodata
        valid = np.isfinite(arr)
        if nod is not None and np.isfinite(nod):
            valid &= arr != nod
        arr[~valid] = np.nan
        tr = ds.transform
        crs = ds.crs
        area_or_point = ds.tags().get('AREA_OR_POINT', 'Area')

    nx, ny = FINE['ncols'], FINE['nrows']
    xs = FINE['x0'] + FINE['dx'] * np.arange(nx)
    ys = FINE['y0'] + FINE['dy'] * np.arange(ny)
    X, Y = np.meshgrid(xs, ys)
    k = math.radians(1) * 6371000.0
    coslat = math.cos(math.radians(lat0))
    LAT = lat0 + Y / k
    LON = lon0 + X / (k * coslat)
    # stage lat/lon are WGS84 (OSM); the sources are NAD83 — see module doc
    sx, sy = warp_transform('EPSG:4326', crs, LON.ravel().tolist(), LAT.ravel().tolist())
    sx = np.asarray(sx)
    sy = np.asarray(sy)
    # pixel-space coordinates; for Area rasters the value sits at the pixel
    # centre, so shift by half a pixel before interpolating between centres
    inv = ~tr
    col = inv.a * sx + inv.b * sy + inv.c
    row = inv.d * sx + inv.e * sy + inv.f
    if area_or_point == 'Area':
        col -= 0.5
        row -= 0.5
    c0 = np.floor(col).astype(int)
    r0 = np.floor(row).astype(int)
    tc = col - c0
    trr = row - r0
    H, W = arr.shape
    ok = (c0 >= 0) & (c0 < W - 1) & (r0 >= 0) & (r0 < H - 1)
    c0c = np.clip(c0, 0, W - 2)
    r0c = np.clip(r0, 0, H - 2)
    z00 = arr[r0c, c0c]
    z01 = arr[r0c, c0c + 1]
    z10 = arr[r0c + 1, c0c]
    z11 = arr[r0c + 1, c0c + 1]
    z = (z00 * (1 - tc) * (1 - trr) + z01 * tc * (1 - trr)
         + z10 * (1 - tc) * trr + z11 * tc * trr)
    z[~ok] = np.nan
    Z = z.reshape(ny, nx)
    rows = [[None if not np.isfinite(v) else float(v) for v in r] for r in Z]
    return StageGrid(FINE['x0'], FINE['y0'], FINE['dx'], FINE['dy'], rows)


def build_ncei_wide():
    rows, lats, lons = parse_opendap_ascii(os.path.join(HERE, 'bathy_subset_wide.ascii'))
    rows = [[None if v <= -99998 else v for v in r] for r in rows]  # _FillValue -99999
    grid = StageGrid.from_latlon_grid(rows, lats, lons, to_xy)
    write(os.path.join(HERE, 'pp_bathy_ncei13_wide.json'), grid, {
        'source': 'NOAA NCEI monterey_13_navd88_2012.nc (1/3 arc-second), OPeNDAP subset '
                  'Band1[13284:13770][4536:5292], fetched 2026-09-01',
        'source_url': 'https://www.ngdc.noaa.gov/thredds/dodsC/regional/monterey_13_navd88_2012.nc',
        'datum': 'NAVD88 meters; negative below datum. MSL - NAVD88 = 0.905 m at CO-OPS 9413450.',
        'horizontal_note': 'source WGS84; stage frame WGS84 (OSM). No shift.',
        'attribution': 'NOAA NCEI, public domain',
    })


def build_csmp():
    tif = os.path.join(CAND, 'csmp_aptos', 'BathymetryA_USGS_OffshoreAptos_pp_clip.tif')
    if not os.path.exists(tif):
        print(f'csmp: {tif} is not present (gitignored); see candidates/csmp_aptos/README.md to refetch')
        return
    grid = bilinear_from_raster(tif, src_is_geographic=False)
    write(os.path.join(HERE, 'pp_bathy_csmp_aptos.json'), grid, {
        'source': 'USGS DS 781, BathymetryA [USGS]--Offshore Aptos, California (2 m, SWATHplus 2009), '
                  'clip BathymetryA_USGS_OffshoreAptos_pp_clip.tif, resampled bilinear to 3 m stage lattice',
        'source_url': 'https://cmgds.marine.usgs.gov/data/csmp/OffshoreAptos/data/BathymetryA_USGS_OffshoreAptos.zip',
        'source_doi': '10.5066/F7K35RQB',
        'native_resolution_m': 2.0,
        'datum': 'NAVD88 meters (Altitude_Datum_Name in source metadata); negative below datum.',
        'horizontal_note': 'source NAD83 / UTM 10N (EPSG:26910); stage frame WGS84 (OSM). '
                           'NAD83-WGS84 (~1 m here) not applied.',
        'attribution': 'U.S. Geological Survey, Pacific Coastal and Marine Science Center; public domain (CC0 1.0)',
    })


def build_cudem():
    tif = os.path.join(CAND, 'ncei_cudem19', 'ncei19_n37x00_w122x00_2023v1_pp_clip.tif')
    grid = bilinear_from_raster(tif, src_is_geographic=True)
    write(os.path.join(HERE, 'pp_bathy_cudem19.json'), grid, {
        'source': 'NOAA NCEI CUDEM 1/9 arc-second tile ncei19_n37x00_w122x00_2023v1.tif, '
                  'clip ncei19_n37x00_w122x00_2023v1_pp_clip.tif, resampled bilinear to 3 m stage lattice',
        'source_url': 'https://noaa-nos-coastal-lidar-pds.s3.amazonaws.com/dem/NCEI_ninth_Topobathy_2014_8483/CA/ncei19_n37x00_w122x00_2023v1.tif',
        'source_doi': '10.25921/ds9v-ky35',
        'native_resolution_m': 3.0,
        'datum': 'NAVD88 meters (EPSG:5703 compound CRS in the GeoTIFF); negative below datum.',
        'horizontal_note': 'source NAD83 geographic (EPSG:4269); stage frame WGS84 (OSM). '
                           'NAD83-WGS84 (~1 m here) not applied.',
        'attribution': 'NOAA NCEI / CIRES, public domain',
    })


if __name__ == '__main__':
    which = sys.argv[1:] or ['ncei', 'cudem']
    if 'ncei' in which:
        build_ncei_wide()
    if 'csmp' in which:
        build_csmp()
    if 'cudem' in which:
        build_cudem()
