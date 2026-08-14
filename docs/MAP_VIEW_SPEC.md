# Map view — wide topology mode, spec

Status: **SPECIFIED, NOT BUILT** (2026-08-14). Sibling to `WEB_THREE_SPEC.md`.
That spec covers the wave renderer; this one covers a second mode that renders
the *place* and deliberately runs no wave model.

## Why this exists, measured

The sim answers "what does the wave do here". Nothing in the repo answers
"what is this place, and where are the seven spots on it". Two attempts to
get there by widening the existing view failed for reasons that are now
measured rather than guessed:

1. **The render patch is smaller than the point.** Each spot renders a
   1280 × 1040 m DEM patch (`grid` in `data/model/pp_depth_patches.js`:
   x −640..640, z −520..520, 180 × 148 posts ≈ 7.1 m/post). Sewers
   (294.8, −62.7) to Privates (1418.0, 1014.0) is **1556 m** apart. The two
   ends of the canon point cannot be framed together at any camera position.
   The full named arc, Little Wind-an-Sea to Bombora, is 3522 m.
2. **At true elevation range the surf is 7.8% of the picture.** The source
   DEM spans −21.9 to +79.8 m NAVD88 — 102 m of relief. The surf-relevant
   band (the seven spots ±250 m, 0–8 m depth) spans −7.01 to +0.90 m: **7.91 m,
   or 7.8% of the range**. A wide view that maps the full range to its ramp
   spends ~92% of its contrast on terrace cliffs and the offshore drop, and
   the shore platform reads as a faint smear. This is why a "larger view"
   feels like it doesn't deliver: it is a scale-mapping problem, not a camera
   or geometry problem.

**A free camera is NOT the missing piece.** `OrbitControls` is already wired
(`web-three/js/main.js`), `V` cycles Cliff / Lineup / Drone / Follow / Tour,
and the free camera can already dive below the surface. The constraint is the
patch and the elevation mapping, both of which this mode changes.

Proven by a scratch render on 2026-08-14: the 9.4 km DEM at true range is
unreadable for surf; the same data cropped to ~2 km and with the underwater
ramp clipped to 0–9 m depth shows the shore platform as a continuous shelf,
the seven spots strung along it, and — the payoff — **the platform edge**,
the offshore-parallel drop-off that sets `h_s`, the depth where refraction
over the component begins. That is the quantity the peel ceiling turns on
(`tests/peel-ceiling.test.js`), and it has never been drawn.

## What it is

A wide, orbitable relief view of Pleasure Point: seabed + land, the
waterline, the seven canon spots, and — the reason to build it rather than
screenshot a map — **each spot's baked break line and the extent over which
its reef actually owns that line**.

## Non-goals

- **No wave simulation.** No shoaling, no breaking, no foam, no rider, no
  audio. This mode never calls the reef fit, so the patch-coordinate coupling
  that makes widening the sim invasive does not apply here.
- **Not a replacement for the sim's cameras.** Cliff / Lineup / Drone / Follow
  / Tour stay exactly as they are.
- **Not a profile.** The 2026-08-13/14 Gemini Spark trial
  (`experiments/cliff-topography/`) built a cross-section mesh and titled it
  "3D topography". A profile answers a different question and is explicitly
  out of scope; this is a plan/oblique view.
- **Not a published figure yet.** See "DEM artifacts" — the wide view cannot
  ship until those are handled.

## Data path

Source is the existing `data/bathy/pp_bathy.json` — NOAA NCEI Monterey Bay
1/3″ coastal DEM, NAVD88, 1143 × 421 posts at dx 8.228 m / dy 10.296 m,
covering 9404 × 4335 m. Spots and coastline from `data/osm/pp_geometry.json`.
MSL = NAVD88 + 0.905 m.

No new survey data and no new derived data module. If a pre-baked tile is
wanted for load time it must be *generated* from these two files by a
committed script, never hand-authored — the trial's viewer had no generator
and could not be regenerated (recorded in `experiments/cliff-topography/README.md`).

Default crop: x −150..1900, y −560..1350 (2050 × 1910 m), which holds the
seven canon spots with margin. The full 9.4 km must remain reachable as an
option, because it is the only view that shows the coast turning.

## Rendering rules

These are the settings that made the scratch render legible; they are the
spec's substance, not decoration.

1. **Clip the ramp to the surf band, do not map the full range.** Underwater:
   0–9 m depth spans the whole teal→sand ramp; deeper saturates. Land: 0–22 m
   above MSL. Both clips are the point of the mode — see "Why this exists" #2.
2. **Vertical exaggeration is a control, not a constant.** Expose ×1 → ×20.
   At ×1 the shore platform is invisible; the scratch render used a slope gain
   of ×12 for the shading. Whatever the default, **the current VE must be
   displayed**, because an exaggerated relief read as true is exactly the kind
   of quiet dishonesty MODEL.md §4.5 exists to prevent.
3. **Hillshade** from a fixed sun (az 300°, alt 35° worked) so the platform
   edge casts a readable line. The sun must not be user-movable without also
   showing its azimuth — a rotating sun changes which bedforms appear real.
4. **Waterline** drawn as an explicit band (|depth| < 0.45 m), not implied by
   the ramp, and it must follow the tide control if one is exposed.
5. **8:1 contrast floor on every label**, per the project rule — and measured
   against the *terrain under the glyphs*, not against the page background.
   The trial figure passed 8:1 against its flat background and still had 13 of
   26 labels over terrain bright enough to break the floor. Method that
   works: render with all text stripped, sample the backdrop under each glyph
   run, compare. Labels over terrain need genuinely opaque plates, not
   `opacity: 0.92`.

## Camera

Reuse the existing `OrbitControls` rig. Additions:

- A framing that fits the default crop, and a "whole coast" framing for the
  9.4 km.
- Optional oblique/axonometric default — plan view reads the platform edge
  best, oblique reads relief best; both are cheap once the mesh exists.
- Spot-anchored waypoints: fly to a spot and hand off to the sim at that
  preset. This is the coupling the trial's `build_dual_view_data.py` name was
  reaching for.

## Overlays — the reason to build this rather than screenshot a map

- **Baked break line per spot**, from `bakeBreakLine` / `lineProbe`, drawn on
  the real bathymetry. Seven stage-length lines on one continuous platform is
  the single image that says "this is one reef with named stations".
- **Reef-authority extent.** `scripts/measure_alpha_regimes.mjs` measures how
  much of each stage the synthetic wedge actually owns: sewers 58%,
  firstpeak 59%, secondpeak 47%, jacks 53%, thehook 47%, **sharks 39%**.
  Drawing the owned segment solid and the bare-DEM segment dashed puts the
  model's own coverage limit on the map, and makes the dead down-point third
  (TODO 1c'-c.4) visible instead of a note.
- **Limiter-pinned stretches** flagged distinctly. Every spot has a run where
  the break line rides `SLEW_M_PER_M = 3.0` (Sharks: x −86..−54, a 100 m
  seaward excursion). Those are artifacts; a map that draws them as ordinary
  break line would publish a defect as bathymetry.
- **Shelf edge / `h_s` contour**, since it is what the peel ceiling depends on
  and the scratch render showed it is legible.

## DEM artifacts — blocking for any published version

The scratch render showed dense stippling on the terrace and regular
striations in deeper water. These are near-certainly lidar returns off houses
and vegetation, and survey track lines — not topography. At the sim's patch
scale they are invisible; a wide view puts them centre-frame. Before this
mode is published anywhere:

- characterise both (extent, amplitude, whether they track survey geometry),
- mask or smooth them, and say in the figure which was done,
- confirm the smoothing does not touch the 0–9 m band the surf reads from.

The measured DEM residual over the shore platform is 0.31–0.93 m
(EXTERNAL_VALIDITY_AUDIT), so any smoothing kernel must stay well under the
relief it is meant to preserve.

## Acceptance

1. The seven canon spots are visible in one frame at the default crop, each
   identifiable, all labels ≥ 8:1 against the terrain beneath them.
2. The shore platform reads as continuous, and its seaward edge is visible as
   a distinct line rather than a gradient.
3. Break lines are drawn from the same bake the sim uses — no second
   derivation. A discrepancy between map and sim is a bug in one of them.
4. Reef-authority and limiter-pinned segments are visually distinct from
   ordinary break line.
5. VE is displayed and adjustable; at ×1 the view is honest even if dull.
6. Runs without the wave model: no reef fit, no shader, no audio.

## Open questions

- **Plan vs oblique as the default.** Plan reads the platform edge; oblique
  reads relief. Untested which teaches faster.
- **Does it live in web-three or standalone?** Sharing the bed loader and
  `OrbitControls` argues for web-three behind a `#map` flag; not needing any
  of the wave machinery argues for standalone. Leaning `#map` in web-three,
  since the spot→sim handoff is the point and a standalone page would have to
  duplicate the bed loader.
- **Tile pre-bake or load-time build?** 1143 × 421 hillshaded at load may be
  fine; unmeasured.
- **Relationship to `docs/figures/fig-floor.svg`**, which already covers the
  submerged seabed as a static figure. Companion or replacement was never
  decided — same open question the trial left.
