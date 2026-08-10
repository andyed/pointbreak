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
- [ ] Sets + lulls (two-component beat)
- [ ] Sections (crest noise, secondary zippers)
- [ ] A-frame mode (Middle Peak)
- [ ] Preset bank: Cowell's / Jack's / Second Peak / First Peak / The Slot / Middle Peak

## Phase 2 — web-three (SPEC'D: docs/WEB_THREE_SPEC.md)
- [x] M0 grid + vertical displacement + shared model GLSL (extract model-glsl.js)
- [x] M1 shading pass: fbm detail normals, fresnel+glitter, subsurface, foam-in-surface
      — acceptance: 10 s capture evokes ocean (grade vs Surfline PP cam, not stills)
- [ ] M2 horizontal choppy displacement -> pitching lip when xi plunges
- [ ] M3 glTF surfer on the ride line
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

## Phase 3 — today's ocean
- [ ] CDIP polling (Web Client DAT) → live T, Hs, direction, bandwidth
- [ ] "Right now at Pleasure Point" mode

## Someday
- [ ] Web explainer essay (zipper math, interactive)
- [ ] Psychodeli+ port: zipper as musical-phrase primitive
- [ ] PointBreak.tox release on derivative.ca
