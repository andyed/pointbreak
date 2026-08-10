# pointbreak — Claude Development Guide

Standalone project. NOT part of psychodeli-webgl-port; port back into the engine
only if the zipper proves itself (see README "Vehicles").

## What this is

A simplified point-break wave model (Pleasure Point, Santa Cruz) as real-time
graphics. Core artifact: `docs/MODEL.md`. Everything derives from it — when model
and implementation disagree, fix one deliberately and record why.

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
- **A-frame** — `abs(u−u0)` substitution, two symmetric zippers. Middle Peak.

## Related repos

- `~/Documents/dev/tdmcp` — TD MCP server (user co-develops; has `search_td_code`)
- `~/Documents/dev/psychodeli-audio-lab` — TD house conventions, V3_MATH precedent
- `~/Documents/dev/psychodeli-webgl-port` — eventual musical-mapping target
