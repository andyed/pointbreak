# pointbreak

A real-time model of the right-hand point break at Pleasure Point, on the east
side of Santa Cruz — measured bathymetry (NOAA NCEI), a real shoreline
(OpenStreetMap), linear-theory wave physics, and authored spot character,
rendered as a WebGL scene built to be watched unattended: peel, curl that
scales with wave size, sets and lulls, tide, and a camera that knows where to
look.

[![Pleasure Point — the measured coastline, the seabed under it, and the model built on both](docs/figures/og-card.png)](https://mindbendingpixels.com/pleasurepoint/)

**Visual essay (live):** https://mindbendingpixels.com/pleasurepoint/ — the
geography, the data behind it, and the model embedded and labelled work in
progress.

## The product definition

Walking the line between simulation and aesthetic recreation is not a tension —
it is the strategy. **Physics owns the field; authorship owns the character.**
Dispersion, shoaling, refraction, and depth-limited breaking are computed from
linear theory over the measured seabed; peel direction and spot identity are
declared per site. Where the two meet, the declaration constrains the
derivation, never the reverse. That rule, and the table assigning an owner to
every quantity in the model, is `docs/MODEL.md` §4.5 — it exists because every
defect found in one day's audit turned out to be the same defect: two sources
of truth for one quantity with no rule for which wins.

§4.5 settles who owns a quantity. The harder case is when ownership is settled
and the model still cannot serve both sides at one state, and `docs/MODEL.md`
§4.6 is the worked example: at the climatologically honest wave height for a
summer month, the break line's branch selection is decided by a criterion
grazing zero at 0.1–0.7% of its own scale over a seabed with a 0.31–0.93 m
elevation residual, so the peel collapses and the season is unwatchable. Four
attempts to repair the selection were built and measured and none survived.
What ships is a declared boundary — the model states the conditions it will
draw a peel in, holds `#month=` to the healthy side of it, and says so in the
HUD — and the price is stated per spot in that section: at Sewers and First
Peak the seasonal signal is gone entirely, twelve months on one height.

## What the model computes

The generating idea is a *zipper*: a breaking point traveling along a crest,
driven by narrow-band swell meeting a shelf tilted against the swell direction.
On top of that kinematic core, real survey data does the following work:

- **Depth from a real seabed.** The NOAA NCEI 1/3 arc-second (~10 m post
  spacing) DEM is resampled onto each site's local frame; water depth is
  `(MSL + tide) − bed`.
- **Shoaling by Green's law**, `Ks = √(cg₀/cg)`.
- **Depth-limited breaking**, `H = min(H₀·Ks, γh)` with breaker index
  γ ≈ 0.78 (McCowan). The break line is the emergent `H₀Ks ≥ γh` locus over
  the measured bed — depth decides *whether* a wave may break; the zipper
  decides where the peel runs.
- **Refraction as single-step Snell**, `sin φ_b = sin α · c_b/c₀`, keeping the
  crest field a plane wave so the zipper keeps its closed form. A depth-varying
  eikonal phase bake exists behind `#psi`.
- **A shoreline as `max(bed, water)`** — beach and cliff are consequences of
  the data, not scenery; cameras read the cliff height from the same terrain.
- **Coastline shape from OpenStreetMap**: the break line follows a cubic fit to
  the measured equal-elevation contour through each site's surf node.
- **Sets and lulls** from two beating spectral components; **tide** as a live
  control that moves the breaking position while leaving breaking depth fixed.
- **Seasonality from 25 years of CDIP hindcast**: ~219,000 quality-controlled
  hourly records from MOP point SC116 (2000–2024) supply monthly wave-height
  climatology and confirm the swell arrives in a 25°-wide direction band.

The authorship side is seven real Pleasure Point spots — Sewers, First Peak,
Second Peak, Jack's (38th), The Hook, Sharks, Privates, ordered apex →
down-point — each carrying a declared peel direction, a peel-angle target the
physics is measured against, and an Iribarren-driven breaker character. Six of
seven run on surveyed depth profiles; Privates' coastline defeats the contour
fit (16.5 m RMS) and runs on a synthetic stage, and says so in the app. The
consequence runs further than the shoreline: with no measured bed there is no
depth-limited breaking height either, so **Privates is the one site whose wave
cannot be checked against what the water can carry**. The instruments say `n/a`
there rather than quoting a ceiling computed from a seabed that is not in play
(`docs/research/MEASUREMENT_LESSONS.md` §12).

Deliberate exaggerations, stated as such: wave height is scaled ~3.2× against
the terrain (true heights are near-invisible at landscape scale) and underwater
sight distance is stretched past Monterey Bay's real few metres. There is no
fluid solver — no Navier–Stokes, no Boussinesq — because the zipper reduction
makes one unnecessary for what this renders. The model is unvalidated against
measured surf; a first validation pass (model residuals against an independent
record of a specific day) is the largest open gap, tracked in `TODO.md`.

Do not use it for any decision about entering the water.

## Measurement, not vibes

Claims in this repo are instrumented. The renderer exposes probe APIs
(`__pointbreak.stageAlpha()`, `lineProbe()`) that headless capture rigs drive
for deterministic, clock-pinned screenshots and sweeps — `scripts/measure_*.mjs`
covers reef shape, peel-angle profiles, H₀ sensitivity, and temporal cadence.
Physics ceilings are pinned as tests: `tests/peel-ceiling.test.js` evaluates
the Snell refraction bound `sin α_max = c_b/c_s` on the model's own dispersion
code and fails if an authored target is raised back over it. Negative results
are recorded rather than buried — `docs/research/PP_CDIP_CLIMATOLOGY.md` and
`PP_SPECTRAL_SETS.md` document what the 25-year hindcast *cannot* resolve
(the authored set-bandwidth Δf sits below the spectral grid's 0.010 Hz floor)
alongside what it settles. Every citation in `docs/research/` is entered in
`refs.bib` and audited against CrossRef with
[science-agent](https://github.com/andyed/science-agent);
`docs/research/MEASUREMENT_LESSONS.md` collects the ways instruments here have
lied, and is worth reading before trusting any number in the repo.

## Run it

No build step, plain ES modules:

```
cd pointbreak
python3 scripts/serve.py 8127
# http://localhost:8127/web-three/
```

Use `scripts/serve.py`, not `python3 -m http.server`. The stdlib server sends
no `Cache-Control`, so Chrome heuristically caches ES modules across reloads
and you edit a file, reload, and see the old build — including import errors
naming exports that are present on disk. `scripts/serve.py` is the same server
with `no-store`. It binds to `127.0.0.1` only; the development checkout is not
exposed to other devices on the network.

Keys: `1`–`7` sites, `V` camera, `S` surfer, `C` cross-section, `M` audio,
`-` `+` wave size, `[` `]` tide, `D` condition day, `B` seabed mode,
`,` `.` move the section transect, `space` pause, `H` hide panels.

URL hash params drive the same build from outside, and the controls write back
to the URL, so the address bar is always a valid permalink:
`#preset=firstpeak&cam=cliff&section=1&bed=plane&tide=-0.5&controls=1`. The
full list — presets, condition days, quality tiers, and which flags are A/B
reverts vs gated features — is in [docs/CONTROLS.md](docs/CONTROLS.md).

```
npm test              # model guards: geo, depth, dispersion, peel ceiling
npm run check:geo     # generated profiles match their sources
npm run check:depth   # generated seabed patches match theirs
```

## Layout

- `docs/MODEL.md` — the vehicle-independent parametrization (start here)
- `docs/research/` — data-access notes, surf-science citations, ground truth,
  measurement lessons
- `docs/figures/` — the essay and its figure generators
- `data/osm/`, `data/bathy/` — raw pulls + processing (see each README)
- `data/climatology/` — the 25-year CDIP MOP SC116 seasonality prior
- `data/model/` — generated stage profiles and seabed patches
- `scripts/` — the dev server, capture rigs, and measurement instruments
- `web-three/` — three.js displaced-grid build; the current vehicle
- `shared/` — the shared model source (`model-glsl.js`, `params.js`, `cdip.js`)
- `web/` — deprecated raymarcher
- `td/` — TouchDesigner build, parked

## Related work

Most open surf tooling models **forcing** — what the ocean is doing offshore.
This models **transformation** — what one seabed does to that forcing. The two
compose rather than compete:

- [surfpy](https://github.com/mpiannucci/surfpy) (MIT, Python) — NDBC buoy data
  and WaveWatch III with spectra and swell components; the natural build-time
  source for measured swell direction and real spectral components.
- [Meta Surf Forecast](https://github.com/swellnet/meta-surf-forecast) —
  aggregates buoys and forecast sources.
- [Surfline's Pleasure Point cam](https://www.surfline.com/surf-report/pleasure-point/5842041f4e65fad6a7708807)
  — the visual ground truth renders are graded against.

The academic lineage the model derives from — Walker's peel angle, Mead &
Black's bathymetric components, Hutt's skill bands, Battjes' Iribarren
thresholds, McCowan's breaker index — is cited in `docs/MODEL.md`, with
full verified references in `docs/research/SURF_SCIENCE_REFS.md`. No measured
peel angle has ever been published for any Santa Cruz break; the USGS
survey of this exact reef (OFR 2007-1270) holds a year of shore-camera imagery
that could yield one, which is the measurement this project's biggest open
question waits on.

## Licence

Code, docs and figures: **MIT** ([LICENSE](LICENSE)).

The data is not uniformly MIT and cannot be — the OpenStreetMap-derived files
carry ODbL's share-alike obligation. [LICENSES.md](LICENSES.md) gives the
file-by-file split: MIT for code/writing/renders, ODbL 1.0 for the OSM-derived
database files, public domain for the NOAA NCEI bathymetry, MIT for vendored
three.js.
