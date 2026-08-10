#!/usr/bin/env python3
"""Process raw Overpass pulls into pointbreak stage-space geometry.

Inputs (same dir): coastline_raw.json, refs_raw.json  (Overpass JSON, out geom)
Output: pp_geometry.json — local-meter coastline polyline + surf spots with
        down-point arclength u and local coast tangent, ready to inform
        coastCurve / alpha(u) in the model.

Projection: equirectangular around the PP apex (southernmost coastline vertex).
Good to well under 1 m over this ~3 km window — far below OSM digitization
error. x = east meters, y = north meters.

Data (c) OpenStreetMap contributors, ODbL. See README.md in this directory.
"""
import json, math

R = 6371000.0

def load(path):
    with open(path) as f:
        return json.load(f)

coast_raw = load('coastline_raw.json')
refs_raw  = load('refs_raw.json')

# --- stitch coastline ways into one polyline (endpoints chain exactly) ---
ways = {e['id']: e['geometry'] for e in coast_raw['elements'] if e['type'] == 'way'}
key = lambda p: (round(p['lat'], 7), round(p['lon'], 7))
# build chain: start with the way whose first point matches no other way's last
starts = {key(g[0]): wid for wid, g in ways.items()}
ends   = {key(g[-1]): wid for wid, g in ways.items()}
first = next(wid for wid, g in ways.items() if key(g[0]) not in ends)
chain, wid = [], first
while wid is not None:
    g = ways[wid]
    chain.extend(g if not chain else g[1:])  # drop duplicated joint
    wid = starts.get(key(g[-1]))

# --- origin = southernmost coastline vertex (the PP apex) ---
apex = min(chain, key=lambda p: p['lat'])
lat0, lon0 = apex['lat'], apex['lon']
coslat = math.cos(math.radians(lat0))

def to_xy(lat, lon):
    return ((lon - lon0) * math.radians(1) * R * coslat,
            (lat - lat0) * math.radians(1) * R)

coast = [to_xy(p['lat'], p['lon']) for p in chain]

# --- arclength s along the coast (west -> east, so s increases down-point) ---
s = [0.0]
for i in range(1, len(coast)):
    s.append(s[-1] + math.dist(coast[i-1], coast[i]))
apex_i = min(range(len(coast)), key=lambda i: chain[i]['lat'])
apex_s = s[apex_i]

def tangent_deg(i, half=3):
    """Coast tangent at vertex i, degrees CCW from east, smoothed +/-half pts."""
    a, b = max(0, i - half), min(len(coast) - 1, i + half)
    dx, dy = coast[b][0] - coast[a][0], coast[b][1] - coast[a][1]
    return math.degrees(math.atan2(dy, dx))

# --- surf spots + avenue cliff-ends from refs ---
spots = []
for e in refs_raw['elements']:
    if e['type'] == 'node' and e.get('tags', {}).get('sport') == 'surfing':
        x, y = to_xy(e['lat'], e['lon'])
        i = min(range(len(coast)), key=lambda i: math.dist(coast[i], (x, y)))
        spots.append({
            'name': e['tags'].get('name'),
            'lat': e['lat'], 'lon': e['lon'],
            'x': round(x, 1), 'y': round(y, 1),
            'u': round(s[i] - apex_s, 1),          # down-point meters from apex
            'offshore_m': round(math.dist(coast[i], (x, y)), 1),
            'coast_tangent_deg': round(tangent_deg(i), 1),
        })
spots.sort(key=lambda sp: sp['u'])

avenues = {}
for e in refs_raw['elements']:
    if e['type'] == 'way' and 'Avenue' in e.get('tags', {}).get('name', ''):
        g = min(e['geometry'], key=lambda p: p['lat'])  # cliff end
        name = e['tags']['name']
        if name not in avenues or g['lat'] < avenues[name]['lat']:
            x, y = to_xy(g['lat'], g['lon'])
            avenues[name] = {'lat': g['lat'], 'lon': g['lon'],
                             'x': round(x, 1), 'y': round(y, 1)}

out = {
    'origin': {'lat': lat0, 'lon': lon0,
               'note': 'PP apex = southernmost OSM coastline vertex; x east m, y north m'},
    'coast': [[round(x, 1), round(y, 1)] for x, y in coast],
    'coast_u': [round(v - apex_s, 1) for v in s],
    'spots': spots,
    'avenues': avenues,
    'attribution': 'Data (c) OpenStreetMap contributors, ODbL 1.0',
}
with open('pp_geometry.json', 'w') as f:
    json.dump(out, f, indent=1)

print(f"coast: {len(coast)} pts, {s[-1]:.0f} m total, apex at u=0 "
      f"({lat0:.5f},{lon0:.5f})")
print(f"{'spot':<22}{'u (m)':>8}{'offshore':>10}{'tangent':>9}")
for sp in spots:
    print(f"{sp['name']:<22}{sp['u']:>8.0f}{sp['offshore_m']:>10.0f}"
          f"{sp['coast_tangent_deg']:>9.1f}")
