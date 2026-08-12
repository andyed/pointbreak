# pointbreak — Claude Development Guide

Standalone project. NOT part of psychodeli-webgl-port; port back into the engine
only if the zipper proves itself (see README "Vehicles").

## What this is

A simplified point-break wave model (Pleasure Point, Santa Cruz) as real-time
graphics. Core artifact: `docs/MODEL.md`. Everything derives from it — when model
and implementation disagree, fix one deliberately and record why.

## Repo layout — web/ is DEPRECATED (2026-08-11)

**web-three/ is the only renderer.** The `web/` raymarch build is deprecated:
do not maintain it, do not fix its rendering, and do not read its breakage as a
regression signal. (It is currently broken — `u_reefWin` is never set, so the
wave never breaks. That is now expected, not a bug to fix.)

`web/` is NOT a deletable directory. Three modules under `web/js/` are
load-bearing for web-three and stay maintained:

| file | role |
|---|---|
| `web/js/model-glsl.js` | **THE shared GPU model** — source of truth for the wave math |
| `web/js/params.js` | the preset bank (imported by `bed.js` and `main.js`) |
| `web/js/cdip.js` | the SC116 live-ocean fetch |

Raymarch-only, and therefore dead: `web/index.html`, `web/js/main.js`,
`web/js/ui.js`, `web/js/shaders.js`.

The layout implies `web/` is alive when it is not; moving the three shared
modules to a neutral `shared/` is the obvious cleanup, not yet done.

## Conventions

- **Method-named, not venue-named** — the repo is `pointbreak`, artifacts are named
  after the mechanism (zipper, shelf, pocket), never after a platform or venue.
- **TouchDesigner is PARKED** (2026-08-10). It was planned as vehicle 1 and never
  started; `td/` is empty and gitignored. The web builds took the model somewhere
  the TD plan never went (measured bathymetry, a real shoreline), so TD is a
  possible later port, not pending work. If it is ever picked up: go through
  tdmcp (`~/Documents/dev/tdmcp`) — build node networks via the MCP bridge, don't
  hand-describe node graphs — and follow psychodeli-audio-lab's
  `PSYCHODELI_NATIVE_V3_MATH` module convention (`00_…` → `50_…` under
  `/project1`). Recon: `docs/research/TD_IMPLEMENTATION.md`.
- **Don't rewrite deep-water ocean.** This was written when the plan was to
  composite the zipper over a community FFTOcean `.tox`. web-three composites
  over nothing — it displaces a grid from the shared model — so the rule now only
  binds if a substrate is ever added back: take a commodity one (FFTOcean, or a
  Gerstner sum). The zipper/break layer is this project's contribution.
- **Rate independence** — all motion in seconds, one global speed scale, never bake
  frame rate into constants. `isFinite()`/NaN guards, `sin(α)` floors (α→0 is a
  closeout, not a NaN).
- Conventional commits (`type(scope): message`). No GitHub pushes weekdays
  10am–3pm PT.
- Verified citations only in `docs/research/` — no fabricated references.

## Surf-parameter cheat sheet

- **Peel angle α** — master character knob. Low = fast/closeout-y, high = mellow.
  Vp = c/sin(α).
- **Iribarren ξ** — barrel-ness (spilling < ~0.4 < plunging). Independent of α.
- **Section noise σ_h** — early-breaking patches; density = sectioniness.
- **Δf (bandwidth)** — set structure; smaller Δf = longer set cycles.
- **A-frame** — `abs(u−u0)` substitution, two symmetric zippers. A parameter,
  not a site: no Pleasure Point preset ships `aframe: 1`.

## Related repos

- `~/Documents/dev/tdmcp` — TD MCP server (user co-develops; has `search_td_code`)
- `~/Documents/dev/psychodeli-audio-lab` — TD house conventions, V3_MATH precedent
- `~/Documents/dev/psychodeli-webgl-port` — eventual musical-mapping target
