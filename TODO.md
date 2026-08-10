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
- [x] **Swell direction — the frame fix (2026-08-10, MODEL.md 2.3).** theta_s was
      in the model card and in no uniform, so crests arrived shore-parallel and
      alpha was carried by tilting the BREAK LINE off the shore. Relative angle
      right, absolute orientation wrong: at Second Peak the line crossed the
      measured waterline at x = 70 m and ran 322 m inland by the end of the reef
      window, so the peel had ~120 m of water out of ~265 m of reef and the rest
      read as a shore-parallel closeout. Now the swell carries the angle
      (`rayS`) and the break line follows the measured contour: 56-119 m of
      clearance on every mapped preset, and rider p90 height went 0.78-0.88 ->
      0.91-0.99 of the available crest (Privates' 1.18 overshoot gone).
- [x] **Depth gate was a union, not a product (2026-08-10, MODEL.md 2.3).**
      `max(brkZip, gate)` let depth permission alone break the wave: measured
      25-40 m SEAWARD of the break line across the full stage, reef or no reef,
      so the peel drew on top of an already-broken field. Invisible under the
      old tilted line (the zipper mask covered everything, so the gate was
      redundant) and dominant once the line was correctly placed. Now
      `inside * max(reef, gate)` — shore break outside the reef survives,
      nothing breaks before the crest arrives. Edge tracks z_b + 4..5 m.
- [x] **Refraction — LANDED 2026-08-10 (MODEL.md 2.4), simple form.** alpha is
      the DEEP-WATER swell direction; swellPhi() refracts it once to breaking
      depth (sin(phi_b) = sin(alpha) * c_b/c0, h_b = H0/gamma). Crest bearing
      58 deg -> 8.6-9.6 deg on every preset; the crest field stays a plane wave
      so the zipper keeps its closed form; JS twin bit-identical. The full
      eikonal version (Psi table, depth-varying phi) was built and REVERTED —
      rider/audio/twin all assume constant phi. Kept for M6-someday in bed.js:
      bakeRefraction/psiAt/zcAtPsi/incidenceAt (verified 17.1 -> 9.4 -> 7.9 deg
      at Second Peak). Known cost, and M5's whole motivation: taxonomy dead
      (~9 deg everywhere), V_p 38-50 m/s, audio quiet (zipper stations ~534 m
      apart).
- [ ] Rider sits low on the FAST presets (Sewers p50 0.18 vs Second Peak 0.41).
      Not sections (tested: sections=0 moves it 0.01) and not the frame.
      `faceOff` is a fixed 11+/-5 m, and the phase step that implies scales with
      cos(phi), so low-alpha presets sit lower on the face. Decide whether that
      is correct (you do ride lower on a steep wave) or wants phi-aware tuning.
- [ ] **M5 synthetic reef — SPEC'D 2026-08-10, see WEB_THREE_SPEC.md "M5".**
      The answer to the 2.4 cost: refracted crests + measured DEM = every
      preset ~9 deg, peel 38-50 m/s, taxonomy dead. Character returns via an
      invented Mead&Black wedge (strike beta ~ alpha_target - 9 deg) added to
      the decoded uint16 grid in bed.js at load — ONE augmentation surface, so
      break line (via M4), depth gate, shoaling and shoreline stay coherent.
      alpha becomes a fit TARGET with reported residual. Retires the sections
      shader hack (ridges in the grid instead). B becomes a three-way A/B:
      measured -> measured+reef -> plane. Depends on M4; order of work and
      acceptance in the spec.
- [ ] **M4 emergent break line — SPEC'D 2026-08-10, see WEB_THREE_SPEC.md.**
      breakLine(x) becomes the locus where H0*Ks >= gamma*h; alpha becomes a
      readout, not an input. Bake zBreak(x) as a 128-sample 1-D texture,
      recomputed on spot/H0/T/tide change only. NOTE 2026-08-10: the original
      motivation (authored and depth loci 75-133 m apart at Sewers; rider at 20%
      of available crest on either) was mostly the frame error above, and is
      resolved. M4's remaining value is the part the frame fix does NOT give:
      alpha varying with H0 and tide, not just with the contour. Re-measure the
      locus gap before building further — the number it was justified by has
      changed.
- [ ] Handedness: a left is now the sign of the swell incidence rather than a
      structural assumption, but `swellPhi()` still clamps positive and no
      control reaches it. Sign-preserving clamp + slider range if a left is
      ever wanted (no Santa Cruz preset needs one).
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
      generated data file, same pattern as build_geo_profiles.py. Supplies real
      spectral components (the set beat is currently invented) and a MEASURED
      swell direction. Direction is no longer structurally absent — MODEL.md 2.3
      gave the model a real incidence angle — but its value is still authored
      (phi = alpha), so the model asserts the incidence its peel angle implies
      rather than reading one. Feeding a measured direction in is what turns
      alpha from an input into a consequence, and is still the prerequisite for
      the emergent break line in Phase 2c.
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
