# pointbreak

A real-time model of the waves at Pleasure Point, a long point break on the east
side of Santa Cruz. Started 2026-08-09; it is early and unfinished.

**Visual essay (live):** https://mindbendingpixels.com/pleasurepoint/ — the
geography, the data behind it, and the model embedded and labelled work in
progress.

## What this actually models

A *zipper*: a breaking point that travels along a crest, driven by a phase
running down an angled break line. On top of that, real survey data does the
following work:

- **Depth from a real seabed.** The NOAA NCEI 1/3 arc-second DEM is resampled
  onto each site's local frame; water depth is `(MSL + tide) − bed`.
- **Shoaling by Green's law**, `Ks = √(cg₀/cg)`, replacing a distance-based
  stand-in.
- **Depth-limited breaking**, `H = min(H₀·Ks, γh)` with γ ≈ 0.78 (McCowan).
  Depth decides *whether* a wave may break; the zipper still decides where the
  peel runs.
- **A shoreline**, as `max(bed, water)` — so the beach and cliff are a
  consequence of the data, not scenery. Cameras read the cliff height from the
  same terrain.
- **Coastline shape** from OpenStreetMap: the break line follows a cubic fit to
  the measured equal-elevation contour through each site's surf node.
- **Sets and lulls** from two beating spectral components, and section noise
  that breaks the crest into patches.
- **Tide** as a live control, which moves the breaking position while leaving
  the breaking *depth* fixed.

## What it does not model

This is the part worth reading before trusting anything it shows.

- **No fluid solver.** No Navier–Stokes, no Boussinesq, no shallow-water
  equations integrated. Nothing here conserves mass or momentum. It is a
  kinematic construction that produces wave-shaped motion.
- **No refraction.** Swell direction does not bend around the point. The
  coastline's turn is *measured* and shapes the break line, but the model never
  computes how an incoming swell would actually wrap. This is the largest gap
  between the model and the physics it gestures at.
- **The break line is authored.** Peel angle α is an input, not a result. In a
  physical model it would fall out of the angle between the swell and the
  measured contour.
- **No currents, wind forcing, wave–wave interaction, swash or backwash.**
- **No validation.** Nothing has been compared against measured wave heights,
  breaking positions, or imagery of this break. It has not been shown to a
  local. "Looks plausible" is the entire claim.
- **Six of seven sites carry surveyed profiles.** Privates does not — its
  coastline defeats the cubic contour fit (16.5 m RMS), so it runs on a
  synthetic stage and says so in the app.
- **Deliberate exaggerations:** wave height is scaled ~3.2× against the terrain
  (true heights are near-invisible at landscape scale), and underwater sight
  distance is stretched well past Monterey Bay's real few metres.
- **The tidal datum is extrapolated.** MSL − NAVD88 = 0.905 m comes from NOAA
  CO-OPS 9413450 at Monterey, ~40 km away; the Santa Cruz gauge publishes no
  NAVD88 relationship.
- **"Today's ocean" is partial.** `web/` fetches CDIP and sets swell height and
  period. Direction and spectral width are not model inputs yet.

Do not use it for any decision about entering the water.

## The sites

Seven real Pleasure Point breaks, ordered apex → down-point, which is also the
gradient locals describe (bigger and faster toward the corner): **Sewers, First
Peak, Second Peak, Jack's (38th), The Hook, Sharks, Privates**. Peel angle rises
and Iribarren falls along that order. The A-frame is a *parameter*, not a site —
the wave that demonstrates it is on Santa Cruz's west side.

## Layout

- `docs/MODEL.md` — the vehicle-independent parametrization (start here)
- `docs/research/` — data-access notes, surf-science citations, ground truth
- `docs/figures/` — the essay and its figure generators
- `data/osm/`, `data/bathy/` — raw pulls + processing (see each README)
- `data/model/` — generated stage profiles and seabed patches read by both renderers
- `web/` — raymarched reference build (maintenance-only)
- `web-three/` — three.js displaced-grid build; the current vehicle
- `td/` — TouchDesigner build, not started

## Run it

No build step, plain ES modules:

```
cd pointbreak
python3 -m http.server 8000
# http://localhost:8000/web-three/   (or /web/ for the raymarcher)
```

Keys: `1`–`7` sites, `V` camera (Free / Cliff / Drone / Follow), `S` surfer,
`C` cross-section, `B` swap the seabed for its least-squares plane, `[` `]` tide,
`,` `.` move the section transect, `space` pause, `H` hide panels.

URL hash params drive the same build from outside: `#preset=firstpeak&cam=cliff&section=1&bed=plane&tide=-0.5&hud=0`.

```
npm test              # geo + depth model guards
npm run check:geo     # generated profiles match their sources
npm run check:depth   # generated seabed patches match theirs
```

## Status

`web-three/` is through M3 of `docs/WEB_THREE_SPEC.md` (shaded grid, pitching
lip, procedural surfer) plus the depth field described above. `web/` is the
depth-free reference raymarcher and stays that way. TouchDesigner not started.

Next, in rough order of how much they would change the model: an emergent break
line (α from swell-vs-contour geometry rather than a knob), refraction, live
CDIP direction, and a contour representation flexible enough for Privates. See
`TODO.md`.

## Licence

Code, docs and figures: **MIT** ([LICENSE](LICENSE)).

The data is not uniformly MIT and cannot be — the OpenStreetMap-derived files
carry ODbL's share-alike obligation. [LICENSES.md](LICENSES.md) gives the
file-by-file split: MIT for code/writing/renders, ODbL 1.0 for the OSM-derived
database files, public domain for the NOAA NCEI bathymetry, MIT for vendored
three.js.
