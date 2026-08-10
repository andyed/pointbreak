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

The contour fit uses elevation differences, so it does not require the still
unresolved NAVD88-to-MSL offset. Absolute elevation is not used as water depth.
Profiles with more than 5 m RMS contour-fit error fail closed to the synthetic
stage.

The current preset bank truthfully maps Jack's to OSM's `38th`, plus Second
Peak, First Peak, The Hook and Sharks. Only Privates is synthetic: its
coastline defeats the cubic contour fit (16.5 m RMS), so it fails closed to the
synthetic stage rather than borrowing a neighbour's bathymetry.
