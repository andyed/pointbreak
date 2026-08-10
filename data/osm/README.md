# data/osm — real-world geometry substrate

Pulled 2026-08-09 from the Overpass API (kumi.systems mirror; the main
overpass-api.de instance was rate-limiting).

Data © OpenStreetMap contributors, licensed ODbL 1.0
(https://www.openstreetmap.org/copyright).

## Files

- `coastline_raw.json` — `natural=coastline` ways, bbox (36.948, -121.990,
  36.972, -121.930): apex of Pleasure Point through Capitola.
- `refs_raw.json` — `sport=surfing` nodes (the spots themselves are mapped!),
  numbered avenues (32nd–41st) for georeferencing stair access, East Cliff Dr.
- `process.py` — stitches the coastline ways into one polyline, projects to
  local meters (equirectangular about the apex), computes each spot's
  down-point arclength u, offshore distance, and local coast tangent.
- `pp_geometry.json` — the output. `coast` is [[x,y],…] east/north meters from
  the apex; `coast_u` the matching arclength; `spots` sorted by u.

## Refetch

```bash
curl -s "https://overpass.kumi.systems/api/interpreter" \
  --data-urlencode 'data=[out:json][timeout:60];(way["natural"="coastline"](36.948,-121.990,36.972,-121.930););out geom;' \
  -o coastline_raw.json
# (see git history for the refs query)
python3 process.py
```
