# Validation plan — comparing the model with an observation

**Status 2026-08-12: not yet run.** This is the project's largest honesty gap
(TODO Phase 3). Everything below is method and instrument; no residual has been
measured against a real day.

The claim under test is deliberately modest, and is worth stating before any
data is looked at:

> With the date and conditions fixed **before** comparison, does the model place
> the breaking locus and the direction of peel materially closer to a camera
> observation than a planar or generic-break baseline does?

One successful day would not validate Pleasure Point. One failed day would say
which layer owns the error. Both move the model, which is why the experiment is
worth running before more shader work.

## What already exists on each side

| | model side | observation side |
|---|---|---|
| break locus | `__pointbreak.lineProbe()` — z(x) in metres | cam frame, needs pose |
| peel angle | `derivedAlphaDeg()` | from peel + crest speeds |
| zipper speed | `scripts/capture_temporal.mjs` | `scripts/measure_cam.py` |
| period / sets | authored `1/dF`, 125–167 s | autocorrelation, scale-free |
| **baseline** | `#bed=plane`, `#bed=measured` | — |

The baseline is not hypothetical: `#bed=plane` substitutes the submerged-fit
least-squares plane (same depth scale and mean slope, structure removed) and
`#bed=measured` removes the synthetic reef. So the three-way comparison the
criterion asks for already ships.

## Choosing the observable — what survives an uncalibrated oblique cam

**Use:** cross-shore crest propagation, alongshore (peel) propagation, repeat
interval, breaking-locus position, takeoff location (the surfer cluster is an
independent marker).

**Do not use — yet:** anything in absolute metres, and anything about
appearance.

* **Absolute metres need camera pose.** Alongshore and cross-shore foreshorten
  *differently* in an oblique view, so one scalar cannot convert both. In
  particular `sin(α) = c/Vp` is **invalid across axes** until pose is solved,
  however tempting it is that both are px/s. Same-axis ratios are safe.
* **Appearance is not defensible from a cam stream.** Codec, exposure, auto
  white balance and sun angle dominate foam brightness, lip contrast and face
  darkness. Grade those against stills (`VISUAL_GROUND_TRUTH.md`), not residuals.

## Source quality — ranked, with reasons

1. **Own capture from a fixed cam, 2–3 minutes, clock visible.** Best. Fixed
   pose, known time, uncut, continuous.
2. **Surfline cam rewind** (subscription). Same fixed camera *with* timestamps,
   so a historical big day can be picked and its CDIP hour pulled before
   looking. Strictly better than anything public.
3. **Satellite (Sentinel‑2, 10 m/px, ~5‑day revisit).** Georeferenced, so the
   breaking locus needs **no** camera registration, and the acquisition time
   keys the hindcast. Geometry only — a single frame has no kinematics.
4. **Edited video (YouTube etc.) — NOT usable as a residual.** Four independent
   killers: the camera moves (drone/tracking telephoto breaks the fixed-frame
   assumption, so you measure the camera); no timestamp (no conditions, no
   tide); **speed ramps and slow motion destroy the time base silently** and
   produce a clean-looking wrong answer that no pixel test can detect; and
   highlight-reel selection bias. Useful for *look targets* only — extending
   `VISUAL_GROUND_TRUTH.md` with foam aging and lip throw at size.

Sourcing posture: measure privately, publish only derived numbers. Do not
commit third-party frames or clips to this public repo.

## Conditions are the easy half — and they are free

`SC116_hindcast.nc` on CDIP THREDDS holds **221,328 hourly records back to
2000‑01‑01** at the 15 m contour off the point, carrying `waveHs`, `waveTp`,
`waveDp`, `waveDm`, `waveSxy`. So any historical date can be pre-registered with
real nearshore forcing. Tide from NOAA CO‑OPS. Verified reachable 2026‑08‑12.

The nowcast endpoint is what `#day=live` already consumes (`web/js/cdip.js`).

## First attempt, 2026-08-12 — what it produced

Surfline "Pleasure Point Overview" (First/Second Peak framing), cam clock
1:23 pm, small day.

* **A 48 s capture was a buffering player.** 3 of 78 steps changed, max 1.3 grey
  levels. Zero kinematic value. `measure_cam.py` now gates on this **first**,
  because tracking it would have yielded a confident peel speed manufactured
  from JPEG noise.
* **A 35 s capture was live.** Cross-shore crest propagation **6.0 px/s**, with
  lag doubling exactly as separation doubled (4 frames at 6 px, 8 at 12 px,
  r = 0.79). That linearity is the validity check.
* **Alongshore: zero lag at every separation out to 90 px, at both 4 and
  30 fps.** Not a failure — a real peel would show *some* lag, and zero lag at
  90 px would imply >2700 px/s. The outer band was pulsing **in phase**: a
  standing bore over the reef, not a peeling front, on a small day.
* **No repeat interval resolvable.** 35 s holds ~3 cycles of a 12 s wave; a
  usable estimate wants >10, i.e. 2–3 minutes.

### Two claims this retracted

Both were made from eyeballing stills, hours apart, and both were wrong:

1. *"Multiple shore-parallel whitewater rows prove a beach-break render."* The
   real cam shows several broken lines at low tide (outer break, inner reform).
   What distinguishes a point break is that the outer line **peels
   progressively**, which is kinematic and cannot be judged from a still at all.
2. *"Peel direction is established, rightward, confirmed across two frames."*
   Frame order was never established, and the measurement found **no alongshore
   propagation** in that window.

The general lesson, third instance in two days: *a still frame cannot support a
claim about motion, and confidence in reading one is not evidence.*

## Next run — what to change

* **2–3 minutes**, not 35 seconds (period and set structure).
* **A scale reference in the water plane** — exposed reef edge at a known tide,
  a channel marker, anything of known length. This is the single thing standing
  between px/s and m/s.
* **Bigger surf.** A small day at this reef may genuinely bore rather than peel;
  the peel may need the size. 4–5 ft is the test of whether the model's
  4.8–10 m/s zipper is anywhere near right.
* Pre-register: date, hour, tide, SC116 Hs/Tp/Dp **written down before** the
  model is run.

## Reading the outcome honestly

* Model closer than both baselines on locus **and** peel direction → the reef
  is doing real work.
* Model no better than `#bed=plane` → the synthetic reef is decoration; the
  fitted α is a declaration the geometry does not earn.
* Model right on locus, wrong on peel → the break criterion is fine and the
  *direction* machinery is not, which is where `#peeldir` already failed twice.
* Everything wrong at one spot only → suspect that spot's reef fit, not the model.

## Ground truth status 2026-09-01

Everything above is about the *observation* side of the residual: a camera,
a clock, a scale reference. Today's bathymetry work
(`BATHY_SOURCES_2026-09-01.md`, `CUDEM_BED_2026-09-01.md`) changed what the
*model* side can honestly claim, and that changes the plan.

**What changed.**

1. **No bathymetric surface is measured under the surf zone at any canon
   spot.** The shipped NCEI 1/3" 2012 DEM never had soundings here (its swath
   sources stop near the 10 m isobath). The finer CUDEM 1/9" tile, acquired
   today, was hoped to be different; its own per-tile source footprints say
   it is not: the 2020 land lidar ends 39–114 m shoreward of each node and
   the nearest bathymetry begins 324–576 m seaward, so every canon spot sits
   in a 408–651 m gap filled by GMT `surface` interpolation
   (BATHY_SOURCES §7). The CSMP 2 m swath grid has no data at any spot
   either. Three public grids, zero measurements under the break.
2. **Therefore the model's site-character numbers are DEM-dependent, not
   site facts.** Between the two interpolants the breaking-depth contour
   normals rotate 6–20° and spot depths move up to 1.3 m — larger than the
   4–8° peel signal (CUDEM_BED §7, §10). The "model vs `#bed=plane`"
   comparison in this plan still discriminates *whether the fitted reef is
   doing work*, but a win no longer implies the reef is Pleasure Point's;
   it implies the reef the 2012 interpolant happens to draw is closer than
   a plane. State it that way.
3. **The only surveyed soundings under this break are USGS OFR 2007-1270's**,
   and today's check found none of it public. USGS Pubs Warehouse record
   `ofr20071270` (last modified 2022-11-03) links only the PDF, its index
   page and the NGMDB entry — no data release. ScienceBase returns zero items
   for "Pleasure Point", "East Cliff Drive" or "SWATHplus Santa Cruz County";
   `q=Storlazzi` returns 129, of which the only northern-Monterey-Bay entries
   are the 2014–2016 rippled-scour-depression datasets. The CMGDS field
   activity records for all ten IDs the report cites (W-1-05-MB waverunner
   CPS, P-1-05-MB and P-1-06-MB SWATHplus, P-P1-06-MB camera, F-1-06 … P-1-07
   AWAC turnarounds) exist and carry no data links; the InfoBank URLs printed
   in the report return 404. The report's own instruction stands: "For data
   files described in this report, please contact" the project chief at the
   USGS Pacific (Coastal and Marine) Science Center. A request draft is in
   `docs/drafts/` (gitignored, unsent).

**What the request would buy, in this plan's terms.**

| OFR 2007-1270 product | what it validates here |
|---|---|
| SWATHplus swath grid, Oct 2005 and Apr 2006 (P-1-05-MB, P-1-06-MB), soundings to "just less than 2 m" | the bed under the break at h_b ≈ 1.5–3 m — the one input every derived quantity in this repo is a function of; also whether the 2012 vs CUDEM 6–20° contour rotation is either grid, or neither |
| Coastal Profiling System waverunner transects, 2005-10-05 (W-1-05-MB), 25 shore-normal + 23 shore-parallel lines "into water depths less than 1 m" | the intertidal-to-2 m strip neither swath nor CUDEM has — the −0.10 m sheet directly |
| video timex + variance, 10-min windows, four scenes (s5 PP 1st peak, s18 3rd peak, s23 38th–Jack's, s32 Hook–38th), ~3,000 each, May 2006 – May 2007 | mean breaking position — the `H₀Ks ≥ γh` locus the model actually predicts — at *five* spots, under measured forcing |
| 30,317 stills, five scenes + zooms + composites | per-frame peel angle by the Walker/Palmer definition (whitewater edge vs unbroken crest), after rectification off the report's own bluff lidar |
| AWAC at 13–14 m, 20-min currents, hourly wave spectra, 8,927 bursts | the pre-registered conditions this plan asks for, contemporaneous with every image |

The imagery + AWAC pair is the whole "next run" section above, done in
2006–07 at 5 Hz for a year, with forcing measured 600 m from the break
instead of at SC116. The bathymetry is the thing this repo cannot get any
other way.

**Plan changes.**

* The camera experiment stays as written and is still worth running: it is
  the only path that does not wait on someone else. Its criterion now reads
  "model on the shipped interpolant vs plane vs measured-fit" and its win
  condition is stated as such.
* The Sentinel-2 option (source rank 3) gains weight: a georeferenced
  breaking-locus position is exactly the quantity the −0.10 sheet and the
  contour rotation disagree about, and it needs no bathymetry to compare.
* The OFR request is promoted from "the caveat that governs all of it"
  (SURF_SCIENCE_REFS) to a line item: send it, and until an answer arrives,
  write every per-spot number as "on the NCEI 2012 interpolant".
* Nothing else in the repo that depends on the bed should be tuned further
  until one of the two ground truths (a sounding under the break, or a
  measured breaking position on one day) exists. CUDEM_BED §10 says the same
  from the other side.
