#!/usr/bin/env python3
"""Parse the NCEI Monterey 1/3 arc-second DEM subset into pointbreak stage space.

Input:  bathy_subset.ascii (OPeNDAP ASCII, Band1[261][649] + lat/lon maps)
Output: pp_bathy.json — elevation grid (m, NAVD88; negative = below datum)
        on the same local-meter frame as ../osm/pp_geometry.json.

Source dataset: NOAA NCEI Monterey Bay 1/3 arc-second Coastal DEM (2012),
monterey_13_navd88_2012.nc. ~10 m post spacing.

The projection, the OPeNDAP parser and the bilinear sampler live in
stage_frame.py so build_candidate_grids.py shares them byte-for-byte.
"""
import json, math

from stage_frame import StageGrid, load_origin, make_projector, parse_opendap_ascii

# --- parse the OPeNDAP ascii ---
rows, lats, lons = parse_opendap_ascii('bathy_subset.ascii')

# --- same origin as the OSM geometry ---
lat0, lon0, geo = load_origin('../osm/pp_geometry.json')
to_xy, _ = make_projector(lat0, lon0)

grid = StageGrid.from_latlon_grid(rows, lats, lons, to_xy)
x0, y0, dx, dy = grid.x0, grid.y0, grid.dx, grid.dy
x1, y1 = grid.x_max(), grid.y_max()
sample = grid.sample

spot_depths = []
for sp in geo['spots']:
    z = sample(sp['x'], sp['y'])
    spot_depths.append({'name': sp['name'], 'u': sp['u'],
                        'elev_navd88_m': None if z is None else round(z, 2)})

out = {
    'source': 'NOAA NCEI monterey_13_navd88_2012.nc (1/3 arc-second), OPeNDAP subset',
    'datum': 'NAVD88 meters; negative below datum. Local MSL/tide conversion TODO.',
    'origin': geo['origin'],
    'x0': round(x0, 1), 'y0': round(y0, 1),
    'dx': round(dx, 3), 'dy': round(dy, 3),
    'ncols': len(lons), 'nrows': len(lats),
    'elev': [[round(v, 2) for v in row] for row in rows],
    'spot_elev': spot_depths,
    'attribution': 'NOAA NCEI, public domain',
}
with open('pp_bathy.json', 'w') as f:
    json.dump(out, f, separators=(',', ':'))

print(f'grid {len(lats)}x{len(lons)}, dx={dx:.1f} m dy={dy:.1f} m, '
      f'x [{x0:.0f},{x1:.0f}] y [{y0:.0f},{y1:.0f}]')
print(f"{'spot':<22}{'u (m)':>8}{'elev NAVD88 (m)':>17}")
for sd in spot_depths:
    print(f"{sd['name']:<22}{sd['u']:>8.0f}{str(sd['elev_navd88_m']):>17}")

# shore-normal transect at Sewer Peak: depth vs offshore distance
sew = next(s for s in geo['spots'] if s['name'] == 'Sewer Peak')
t = math.radians(sew['coast_tangent_deg'])
nx, ny = math.sin(t), -math.cos(t)  # right of tangent = seaward (land left)
print('\nSewer Peak shore-normal transect (offshore m -> elev m):')
line = []
for d in range(0, 401, 50):
    z = sample(sew['x'] + nx * (d - sew['offshore_m']),
               sew['y'] + ny * (d - sew['offshore_m']))
    line.append(f'{d}:{z:.1f}' if z is not None else f'{d}:--')
print('  ' + '  '.join(line))
