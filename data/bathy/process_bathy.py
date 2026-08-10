#!/usr/bin/env python3
"""Parse the NCEI Monterey 1/3 arc-second DEM subset into pointbreak stage space.

Input:  bathy_subset.ascii (OPeNDAP ASCII, Band1[261][649] + lat/lon maps)
Output: pp_bathy.json — elevation grid (m, NAVD88; negative = below datum)
        on the same local-meter frame as ../osm/pp_geometry.json.

Source dataset: NOAA NCEI Monterey Bay 1/3 arc-second Coastal DEM (2012),
monterey_13_navd88_2012.nc. ~10 m post spacing.
"""
import json, math, re

R = 6371000.0

# --- parse the OPeNDAP ascii ---
rows, lats, lons = [], [], []
section = None
with open('bathy_subset.ascii') as f:
    for line in f:
        line = line.strip()
        if line.startswith('Band1.Band1['):
            section = 'grid'; continue
        if re.match(r'^Band1\.lat($|\[)', line):
            section = 'lat'; continue
        if re.match(r'^Band1\.lon($|\[)', line):
            section = 'lon'; continue
        if not line or line.startswith(('Dataset', 'Grid', 'ARRAY', 'MAPS',
                                        'Float', '}', '---')):
            continue
        if section == 'grid' and line.startswith('['):
            vals = line.split(',')[1:]  # drop "[i]" row index
            rows.append([float(v) for v in vals])
        elif section == 'lat':
            lats = [float(v) for v in line.split(',')]
        elif section == 'lon':
            lons = [float(v) for v in line.split(',')]

assert rows and lats and lons, f'parse failure: {len(rows)} rows, {len(lats)} lats, {len(lons)} lons'
assert len(rows) == len(lats) and len(rows[0]) == len(lons)

# --- same origin as the OSM geometry ---
geo = json.load(open('../osm/pp_geometry.json'))
lat0, lon0 = geo['origin']['lat'], geo['origin']['lon']
coslat = math.cos(math.radians(lat0))
def to_xy(lat, lon):
    return ((lon - lon0) * math.radians(1) * R * coslat,
            (lat - lat0) * math.radians(1) * R)

x0, y0 = to_xy(lats[0], lons[0])
x1, y1 = to_xy(lats[-1], lons[-1])
dx = (x1 - x0) / (len(lons) - 1)
dy = (y1 - y0) / (len(lats) - 1)

def sample(x, y):
    """Bilinear elevation sample at local-meter (x, y); None outside grid."""
    fc, fr = (x - x0) / dx, (y - y0) / dy
    c, r = int(fc), int(fr)
    if not (0 <= c < len(lons) - 1 and 0 <= r < len(lats) - 1):
        return None
    tc, tr = fc - c, fr - r
    z00, z01 = rows[r][c], rows[r][c + 1]
    z10, z11 = rows[r + 1][c], rows[r + 1][c + 1]
    return (z00 * (1-tc) * (1-tr) + z01 * tc * (1-tr)
            + z10 * (1-tc) * tr + z11 * tc * tr)

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
