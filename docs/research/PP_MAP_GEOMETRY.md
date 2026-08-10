# Pleasure Point — real planform geometry (OSM + spot map)

Sources, 2026-08-09:
- Sunny California spot map (supplied in-session; stylized, canon labels
  Sewers → Privates — see PP_VISITORS_GUIDE_NOTES.md).
- OpenStreetMap via Overpass: `natural=coastline` polyline AND the surf spots
  themselves as tagged `sport=surfing` nodes. Raw pulls + processing:
  `data/osm/` (README there has attribution + refetch). Output:
  `data/osm/pp_geometry.json` — coastline in local meters, spots with
  down-point arclength u.

## The measured spot table

u = arclength along the coast from the apex (southernmost coastline vertex,
36.95410, -121.97622), positive down-point (toward Capitola). Tangent =
local coast direction, degrees CCW from east, ±3-vertex smoothing.

| Spot               | u (m) | offshore (m) | coast tangent (°) |
|--------------------|------:|-------------:|------------------:|
| Little Wind-an-Sea |    -8 |           42 |             -54.8 |
| Suicide's          |   147 |           36 |             -25.5 |
| Sewer Peak         |   402 |          118 |              -7.1 |
| First Peak         |   554 |          111 |              57.3 |
| Second Peak        |   668 |          107 |              47.4 |
| 38th (Jack's)      |   981 |           77 |              32.8 |
| The Hook           |  1331 |           65 |              44.8 |
| Shark's Cove       |  1598 |           53 |              55.1 |
| Private's          |  1977 |           84 |              56.5 |
| Trees              |  2499 |           97 |              99.0 |
| Toes Over          |  3582 |          100 |              34.3 |
| Bombora            |  3911 |          309 |              37.0 |

Bonus spots the guides didn't cover: Suicide's and Little Wind-an-Sea west of
the apex, Trees/Toes Over toward Capitola, and Bombora — 309 m offshore, the
outer-reef wave. All free preset material.

## What the geometry says

1. **The apex is a ~110° coastline rotation.** Tangent swings from ≈-55°
   (west of the point) through ≈-7° at Sewer Peak to ≈+57° at First Peak over
   ~550 m of arc. Between Sewers and First Peak the coast turns the corner —
   that is the point, mechanically.
2. **Down-point the tangent is roughly constant (~33–57°, mean ≈45°) with
   scalloped wiggles** — the coves at the Hook (visible on the map as cusps).
   So the golden-rule gradient (softer down-point) is NOT mainly a
   tangent effect past First Peak: it is **sheltering** — energy decay as
   swell refracts around the apex — plus reef depth. Model consequence: the
   along-point character split is
   `alpha(u) = f(swell_dir - coast_tangent(u))` **and**
   `H_eff(u) = H0 * shelter(u, swell_dir)`, two separate fields.
   A W winter swell wraps the apex (strong shelter gradient, biggest at the
   top — matches the guides); a S summer swell hits the ~45° arc squarely
   (weak gradient, everything breaks — the "smorgasbord").
3. **The canon span is ~1.6 km** (Sewers u=402 → Private's u=1977). The
   current ~600×500 m stage covers roughly apex → 38th. Full 7-spot fidelity
   wants preset = takeoff u₀ + a stage *window* sliding along one global
   coast, not a bigger monolithic grid.
4. **coastCurve should be data-fit.** Fit the analytic coastCurve (or a small
   spline) to `pp_geometry.json`'s polyline over the active window instead of
   hand-tuned constants. MODEL.md stays the source of truth for the *wave*
   math; the *planform* now has ground truth.

## Seafloor (NOAA NCEI 1/3 arc-second DEM — `data/bathy/`)

Real bathymetry on the same stage frame, ~10 m posts, NAVD88 (local MSL ≈
+1 m above datum, exact conversion TODO). Spot-sampled elevations:

| Spot | u (m) | elev NAVD88 (m) |
|---|---:|---:|
| Sewer Peak | 402 | −1.53 |
| First Peak | 554 | −1.66 |
| Second Peak | 668 | −1.30 |
| 38th (Jack's) | 981 | −0.91 |
| The Hook | 1331 | −0.74 |
| Shark's Cove | 1598 | −0.69 |
| Private's | 1977 | −0.53 |
| Bombora | 3911 | −5.38 |

Two findings:

1. **The reef gets SHALLOWER down-point** (−1.66 m at First Peak → −0.53 m at
   Private's). This inverts naive intuition (softer ≠ deeper) and explains the
   guides' activation behavior mechanically: up-point reef is deep enough to
   break size; down-point shelves are so shallow that big-swell energy has
   already broken/decayed before reaching them, small swell only *breaks*
   there when tide drops the water level onto the shelf — Private's
   "usually breaks on a lower tide" is a −0.5 m shelf talking. Activation
   threshold(u) can be *derived from depth(u) + tide + H*, not hand-tuned.
2. **Sewer Peak's shore-normal slope is gentle, ~1:70** (0 → −5.8 m over
   400 m). Iribarren with that slope predicts spilling/mushy character for
   typical swell — consistent with PP's rep vs the steeper West Side. ξ per
   preset can eventually come from measured slope(u) rather than a knob.

Bombora at −5.4 m, 309 m offshore, is the outer-reef big-swell wave — a
natural "XL day" preset.

## Provenance note

The stylized shop map prompted this; OSM supersedes it for geometry (the map's
projection is decorative). The map remains the canon/label source and future
essay art reference. Data © OpenStreetMap contributors (ODbL).
