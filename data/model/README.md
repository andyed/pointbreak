# Runtime geo profiles

`pp_geo_profiles.js` is the compact generated bridge from the checked-in OSM
and NCEI source files to both browser renderers.

Regenerate and verify it with:

```bash
npm run build:geo
npm run check:geo
```

For each Pleasure Point canon spot, `build_geo_profiles.py` records:

- the OSM down-point coordinate `u` and a local validity window bounded by the
  neighboring canon spots;
- a local stage frame tangent to the NCEI equal-elevation contour through the
  OSM surf node;
- a constrained contour fit `z = x2*x^2 + x3*x^3`; and
- the NCEI reef elevation and shore-normal slope as provenance metadata.

Those OSM midpoint bounds constrain contour sampling and the surfer's local
ride span; they are not presented as measured reef edges. The authored reef
envelope therefore remains separate.

## Alternate bathymetry sources (2026-09-01)

Both builders take `--bathy FILE` (a name under `data/bathy/` or a path) and,
for any grid other than the shipped `pp_bathy.json`, write sibling modules
named after the grid instead of the shipped ones:

```bash
python3 data/model/build_geo_profiles.py  --bathy pp_bathy_cudem19.json   # -> pp_geo_profiles.cudem19.js
python3 data/model/build_depth_patches.py --bathy pp_bathy_cudem19.json   # -> pp_depth_patches.cudem19.js
python3 data/model/build_geo_profiles.py  --bathy pp_bathy_cudem19.json --truncate 0.5   # -> pp_geo_profiles.cudem19-t05.js
node scripts/measure_break_activation.mjs --mode=card --bed=cudem19        # the whole headless model on that bed
python3 data/model/experiments/bed_source_compare.py                        # the cross-grid tables
```

The default invocations are unchanged and `--check` on them is still
byte-stable. A candidate grid may carry `null` cells; a spot whose contour scan
or depth patch touches one **fails closed** (`usable: false`, reason in
`generatedFrom.failedClosed`), as does a spot the grid cannot frame (a flat at
the storage quantum gives a zero gradient — The Hook and Shark's Cove on the
CUDEM grid). `--geo` / `--out` override the derived paths.

The headless switch is `scripts/lib/bed-source.mjs`: `--bed=<tag>` (or
`POINTBREAK_BED=<tag>`) installs a `node:module` resolve hook that redirects the
two module specifiers to the tagged siblings for every consumer, shipped code
included; nothing is edited and no hook exists without the flag. Instrument
output for a tagged bed goes to `qa/break-field-<tag>/` (ignored), never into
the committed `qa/break-field/summary.json`. What the model does on the finer
bed is measured in `docs/research/CUDEM_BED_2026-09-01.md`. The tagged modules
(`*.ncei13_wide.js`, `*.cudem19.js`, `*.cudem19-t05.js`) are committed so those
numbers are reproducible without rebuilding; nothing imports them by default.

The contour fit uses elevation differences, so it does not require the still
unresolved NAVD88-to-MSL offset. Absolute elevation is not used as water depth.
Profiles with more than 5 m RMS contour-fit error fail closed to the synthetic
stage.

The current preset bank truthfully maps Jack's to OSM's `38th`, plus Second
Peak, First Peak, The Hook and Sharks. On `main` Privates is synthetic: its
coastline defeats the cubic contour fit (16.5 m RMS) over the OSM-midpoint
window, so it fails closed to the synthetic stage rather than borrowing a
neighbour's bathymetry. The `privates-mapped-bed` branch is the candidate that
maps it (below); it is evidence for a decision, not the decision.

Why it fails is measured in `docs/research/PRIVATES_CONTOUR_2026-09-01.md`: the
contour is smooth but turns 33–38° shoreward from ~70 m down-point of the node
(the platform edge receding into the cove toward Trees), and the origin-
constrained cubic cannot follow it over the 250 m OSM-midpoint window. The
reference elevation and the branch selection were tested and are not the cause.
`build_geo_profiles.py --truncate 0.5` ends each stage where its contour turns
more than 27° off the frame; that gives Privates a [-189.7, 60] m window at
1.87 m RMS and leaves the six mapped profiles byte-identical (passing band
0.4–0.7). On `main` it is off by default; the `privates-mapped-bed` branch
carries it in `build:geo`/`check:geo`, sets the `privates` preset's `geoSpot`,
regenerates `pp_depth_patches.js` with a seventh patch and re-derives the tests
that pinned Privates as unmapped. The render evidence for that branch is the
"Render evidence" section of the same doc. The sweep itself is
`data/model/experiments/contour_variants.py` (read-only, ~2 s).
