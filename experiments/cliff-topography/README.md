# cliff-topography — QUARANTINED EXPERIMENT, not production

Land-cliff + seabed topography figures for Pleasure Point: a shore-normal
transect dataset, a static SVG cross-section, and a standalone dual-view
viewer.

**Provenance: generated in a trial of Google Gemini Spark (2026-08-13/14),
not by this repo's usual muriel path.** Parked here rather than in
`docs/figures/` + `scripts/` because it has unresolved defects (below). It is
NOT referenced by the essay, NOT in `scripts/build_site.py`'s `ITEMS`
allowlist, and therefore never reaches the deployed site.

## Contents

| file | what | reproducible? |
|---|---|---|
| `build_dual_view_data.py` | shore-normal transects → `pp_transects.js` | yes, byte-exact |
| `pp_transects.js` | 7 spots + 60 grid transects, 568 KB | generated |
| `gen_floor_cliff.py` | → `fig-floor-cliff.svg` | yes, byte-exact |
| `fig-floor-cliff.svg` | static cross-section, 1280×920 | generated |
| `standalone-3d-topography.html` | dual-view viewer over `pp_transects.js` | **NO — hand-authored** |

Run either generator from this directory; both write their output beside
themselves and read the repo's real data via `ROOT` (two levels up).

## What was verified (2026-08-14)

Held up:

- **Constants are correct and correctly cited.** `MSL_ABOVE_NAVD88 = 0.905`
  matches `data/model/pp_depth_patches.js`; `THETA_DEG = 45.0` matches
  `docs/research/PP_MAP_GEOMETRY.md` finding #2 ("mean ≈45°").
- **Real data sources** — NOAA NCEI Monterey 1/3" DEM and the OSM geometry
  this repo already uses, not invented numbers.
- **Both Python generators are deterministic** and reproduce their committed
  outputs byte-exact, before and after the move.
- **Text contrast against the flat page background passes 8:1** for all six
  text classes (9.11–16.66:1 vs `#0f1216`).

Did not hold up:

1. **Colliding labels — three places, visible in the render.** Top-right
   "land / cliff top ↑" (left-anchored at `PLOT_R − 140`) overprints
   "down-point →" (right-anchored at `PLOT_R`); the depth legend overlaps
   "−1.0m channel" with "+1.0m reef"; the cliff legend overlaps "+1m shore"
   with "+18m cliff". Deterministic in the generator, not a rasteriser
   artifact.
2. **The halo claim in the header is wrong.** `gen_floor_cliff.py` advertises
   "pre-blended solid halos"; the halos are `opacity: 0.92` (so they blend
   with whatever is under them), and there are 8 of them for 26 text
   elements.
3. **Contrast over terrain was never the thing checked.** Measured properly —
   re-rendering with all `<text>` stripped and sampling the real backdrop
   under each glyph run — 13 of 26 labels have backdrop bright enough to
   break 8:1 somewhere under the glyphs. "East Cliff Dr / Terrace (+14m)"
   sits directly on the bright `#f4a261`/`#e76f51` cliff mesh and is the
   clearest failure. (The spot labels' worst-pixel numbers are conservative —
   they read acceptably by eye — but the cliff labels do not.) Per the
   project's 8:1 floor this is the blocking defect.
4. **`gen_floor_cliff.py`'s docstring overclaims.** It says it generates "and
   standalone 3D grid topography"; it writes zero HTML files. The viewer has
   no generator and cannot be regenerated from source.
5. **"3D topography" oversells the artifact** — it reads as a 2D profile mesh
   with ×7 vertical exaggeration, not a 3D surface.

## Superseded by

`docs/MAP_VIEW_SPEC.md` (2026-08-14) specifies the wide topology view this was
reaching for — a plan/oblique relief of the point rather than a cross-section,
with the elevation ramp clipped to the surf band. The measurements behind that
spec explain why this attempt could not deliver a "larger view": at the DEM's
true elevation range the surf-relevant band is 7.8% of the relief, so scale
mapping, not geometry, was the obstacle. `build_dual_view_data.py`'s name had
the right instinct; the execution built a profile.

## If this is ever picked up

Fix order: label collisions (1) and terrain contrast (3) first — both are in
`gen_floor_cliff.py`'s label placement and both are mechanical. Then either
write a generator for the viewer or accept it as a hand artifact and say so
in its own header. Only after that is it a `docs/figures/` candidate, and it
would need adding to `build_site.py`'s `ITEMS` to publish.

Overlap to resolve before promoting: `docs/figures/fig-floor.svg` already
covers the submerged seabed. This extends it to the cliff; whether that is a
replacement or a companion was never decided.
