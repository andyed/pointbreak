# TODO

## Phase 0 — model on paper (current)
- [x] Core parametrization written (`docs/MODEL.md`)
- [x] Shader-ready zipper sketch (`glsl/zipper.md`)
- [x] Research docs land (CDIP data, surf-science refs, TD recon)
- [x] Reconcile MODEL.md numbers against verified literature (peel-angle ranges,
      Iribarren thresholds, Pleasure Point bathymetry if published)

## MISSION (reprioritized 2026-08-09): simulate the SURFER
The wave is the stage; the ride is the show. v0 surfer shipped in web/ —
closed-form rider on the zipper (no state): face position + 6s pump cycle +
follow-cam. All further surfer work is web-three work (M3/M3+ below) — do not
build it in the raymarcher (per WEB_THREE_SPEC.md).

## Phase 1 — proof of read (web/ raymarcher — reference, maintenance-only)
- [x] v0 web build (web/): raymarched cliff view + ortho drone view, zipper +
      sets + sections + A-frame + presets + live SC116 fetch. IT READS.
- [x] Sets + lulls (two-component beat) — in the shared model (setEnv/u_dF);
      verified in web-three (set-phase bands in the drone view)
- [x] Sections (crest noise, secondary zippers) — u_sections pulls the break
      line seaward in patches; verified in web-three (The Slot, σ=0.5)
- [x] A-frame mode — abs(x) fold via u_aframe; verified in web-three (mirrored
      double zipper). Demoted from a named preset to a parameter on 2026-08-10:
      the wave that demonstrates it is on the west side, not this point.
- [x] Preset bank of seven on keys 1–7, imported by web-three from
      web/js/params.js; all verified rendering. NOTE: the original bank borrowed
      three west-side names (Cowell's, The Slot, Middle Peak); retargeted to the
      real Pleasure Point canon on 2026-08-10 — Sewers, First Peak, Second Peak,
      Jack's (38th), The Hook, Sharks, Privates.
- [x] Real-data stage profiles: OSM `u`/canon windows + NCEI equal-elevation
      contour fits drive the shared GLSL, JS surfer twin, and both renderers
      for the mapped sites; superseded 2026-08-10 — six of seven now carry
      surveyed profiles, and only Privates falls back to the synthetic stage

## Phase 2 — web-three (SPEC'D: docs/WEB_THREE_SPEC.md)
- [x] M0 grid + vertical displacement + shared model GLSL (extract model-glsl.js)
- [x] M1 shading pass: fbm detail normals, fresnel+glitter, subsurface, foam-in-surface
      — acceptance: 10 s capture evokes ocean (grade vs Surfline PP cam, not stills)
- [x] M2 horizontal choppy displacement -> pitching lip when xi plunges
      (choppy toward-crest offset + shoreward lip throw at the pocket;
      normals FD'd on displaced positions)
- [x] M3 surfer on the ride line — procedural low-poly rider + board
      (makeSurferMesh() in web-three/js/surfer.js), posed by the JS twin of
      the model (web-three/js/model-js.js: surferState + height + choppy
      offset + FD normal), Follow camera preset (V cycle, zoom ∝ 1/distance)
- [ ] M3+ swap the primitive rider for a CC0/Blender low-poly glTF — the
      makeSurferMesh() factory is the single swap point (keep the 'rider'
      child name; lean is applied there)
- [ ] M3+ surfer visibility: occlusion by foreground crests, silhouette
      legibility at distance, spray at the board
- [ ] M3+ ride grammar: takeoff (paddle -> pop), bottom/top turn linked to face
      shape, ξ-aware style (carves on mush, tube stance when plunging),
      kickout at closeout sections
- [ ] M3+ wipeouts: section outruns surfer -> fall + tumble in whitewater
- [ ] M3+ camera language: cut between rides, drone follow mode
- [ ] M3+ Psychodeli port: surfer as musical protagonist (rider = melody line
      over the wave's phrase)
- Surfline PP cam (ground truth): https://www.surfline.com/surf-report/pleasure-point/5842041f4e65fad6a7708807

## Phase 2b — substrate (PARKED with the TouchDesigner vehicle)
- [~] FFTOcean_V1.0.tox as deep-water substrate — parked. web-three displaces
      the grid from the model directly and gets depth from the NCEI seabed, so
      there is no substrate to composite over. Only revisit alongside TD.
- [ ] Iribarren-driven pocket geometry (spill fringe vs thrown lip) — still
      live; belongs to web-three, not to a substrate

## Phase 2c — real depth (landed 2026-08-10, docs/MODEL.md 2.2)
- [x] NCEI seabed as `u_bed`; depth = (MSL-NAVD88 0.905 m + tide) - bed
- [x] Green's-law shoaling + depth-limited breaking (gamma 0.78)
- [x] Shoreline/beach/cliff as `max(bed, water)`; cameras derive the cliff top
- [x] Forward pitch: phase skew proportional to breaking excess
- [ ] **M4 emergent break line — SPEC'D 2026-08-10, see WEB_THREE_SPEC.md.**
      breakLine(x) becomes the locus where H0*Ks >= gamma*h; alpha becomes a
      readout, not an input. Bake zBreak(x) as a 128-sample 1-D texture,
      recomputed on spot/H0/T/tide change only. Measured motivation: at Sewers
      the authored and depth loci sit 75-133 m apart, and the rider averages
      20% of the available crest height on either one.
- [x] Tide as a live control ([ and ]) -> the break point slides while the
      breaking DEPTH stays fixed; Privates-on-a-lower-tide falls out of this
- [x] Underwater: seabed as its own mesh, surface-from-below (Snell's window +
      total internal reflection), murk, and a deepening ramp past the finite
      NCEI patch (extrapolation, flagged as such in BED_VERT)
- [x] Bed A/B (B): swap the measured bed for its own least-squares plane —
      same depth scale and mean slope, structure removed (2.5-3.8 m rms).
      Removing the reef collapses the peel; this is the causal demo.
- [x] Cross-section station along-shore (, and .)
- [ ] DEM land artifacts: cliff-top structures read as rectangular steps at
      7 m posts; decide whether to smooth land or keep it honest

## Phase 3 — today's ocean
- [ ] CDIP polling (Web Client DAT) → live T, Hs, direction, bandwidth
      (web/ already fetches and sets H0 and T only)
- [ ] "Right now at Pleasure Point" mode
- [ ] Real forcing via surfpy (MIT, Python, NDBC + WaveWatch III): decompose a
      measured spectrum into swell components at build time and emit a
      generated data file, same pattern as build_geo_profiles.py. Supplies the
      two inputs the model does not have — swell DIRECTION (the reason
      refraction is unmodelled) and real spectral components (the set beat is
      currently invented). Direction is also the prerequisite for the emergent
      break line in Phase 2c.
- [ ] FIRST VALIDATION PASS — the largest gap in the whole project. Drive the
      model with a specific historical swell and compare breaking position and
      height against an independent estimate (a forecast API, or the Surfline
      PP cam for that date). Not rigorous validation, but it moves the claim
      from "looks plausible" to "agrees with something that isn't us on N
      days". Until this exists, every public artifact must keep saying
      unvalidated.

## Someday
- [ ] Web explainer essay (zipper math, interactive)
- [ ] Psychodeli+ port: zipper as musical-phrase primitive
- [ ] PointBreak.tox release on derivative.ca (needs the parked TD vehicle first)
