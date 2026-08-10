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
- [x] A-frame mode (Middle Peak) — abs(x) fold via u_aframe; verified in
      web-three (mirrored double zipper in the Middle Peak drone capture)
- [x] Preset bank: Cowell's / Jack's / Second Peak / First Peak / The Hook /
      The Slot / Middle Peak — keys 1–7, imported by web-three from
      web/js/params.js; all seven verified rendering from the Cliff camera
- [x] Real-data stage profiles: OSM `u`/canon windows + NCEI equal-elevation
      contour fits drive the shared GLSL, JS surfer twin, and both renderers
      for Jack's/38th, Second Peak, First Peak, and The Hook; borrowed West
      Side presets fail truthfully to the synthetic stage

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

## Phase 2b — substrate (raymarcher, now maintenance-only)
- [ ] FFTOcean_V1.0.tox as deep-water substrate; zipper modulates
      displacement/sharpness/foam
- [ ] Iribarren-driven pocket geometry (spill fringe vs thrown lip)

## Phase 2c — real depth (landed 2026-08-10, docs/MODEL.md 2.2)
- [x] NCEI seabed as `u_bed`; depth = (MSL-NAVD88 0.905 m + tide) - bed
- [x] Green's-law shoaling + depth-limited breaking (gamma 0.78)
- [x] Shoreline/beach/cliff as `max(bed, water)`; cameras derive the cliff top
- [x] Forward pitch: phase skew proportional to breaking excess
- [ ] Emergent break line: alpha as a consequence of contour-vs-swell geometry
      rather than an authored knob (the depth field makes this reachable)
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
- [ ] "Right now at Pleasure Point" mode

## Someday
- [ ] Web explainer essay (zipper math, interactive)
- [ ] Psychodeli+ port: zipper as musical-phrase primitive
- [ ] PointBreak.tox release on derivative.ca
