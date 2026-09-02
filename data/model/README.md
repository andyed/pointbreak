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

The preset bank truthfully maps all seven canon spots to their own OSM nodes:
Sewers, First Peak, Second Peak, Jack's (OSM `38th`), The Hook, Sharks and —
since 2026-09-02 — Private's. `npm run build:geo` / `check:geo` pass
`--truncate 0.5` (the script's own default stays off, so a bare invocation still
reproduces the pre-2026-09-02 module), which ends each stage where its contour
turns more than 27° off the frame between adjacent 10 m lines. Six profiles are
byte-identical under the flag; Private's gains a [-189.7, 60] m window at
1.87 m RMS (25 samples) and a seventh depth patch. No spot borrows a
neighbour's bathymetry.

Why the untruncated fit failed is measured in
`docs/research/PRIVATES_CONTOUR_2026-09-01.md`: the contour is smooth but turns
33–38° shoreward from ~70 m down-point of the node (the platform edge receding
into the cove toward Trees), and the origin-constrained cubic cannot follow it
over the 250 m OSM-midpoint window (16.62 m RMS). The reference elevation and
the branch selection were tested and are not the cause; the passing band for
the truncation slope is 0.4–0.7. The sweep itself is
`data/model/experiments/contour_variants.py` (read-only, ~2 s).

What the mapped bed does not settle, recorded in the same note ("Render
evidence" and "Peel floor and tide band"): the M5 reef fit does not converge at
Private's (7.6° against a 31° target; h_b 1.40 m is the node's own depth) and
its wedge activates at 0.721 m, above the 0.70 m card, so the card-state line is
the DEM platform's (15.7° stage median, 0 % of stations on the wedge),
`PEEL_FLOOR.privates` stays null with that reason, and the depth ceiling is real
while the peel is the DEM's.
