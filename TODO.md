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
follow-cam. Next:
- [ ] Surfer visibility: occlusion by foreground crests (partially fixed via
      16 m cliff camera), silhouette legibility at distance, spray at the board
- [ ] Ride grammar: takeoff (paddle -> pop), bottom/top turn linked to face
      shape, ξ-aware style (carves on mush, tube stance when plunging),
      kickout at closeout sections
- [ ] Wipeouts: section outruns surfer -> fall + tumble in whitewater
- [ ] Camera language: cut between rides, drone follow mode
- [ ] Surfer as the musical protagonist in the eventual Psychodeli port
      (rider = melody line over the wave's phrase)

## Phase 1 — proof of read (web first, then TD via tdmcp)
- [x] v0 web build (web/): raymarched cliff view + ortho drone view, zipper +
      sets + sections + A-frame + presets + live SC116 fetch. IT READS.
- [ ] Sets + lulls (two-component beat)
- [ ] Sections (crest noise, secondary zippers)
- [ ] A-frame mode (Middle Peak)
- [ ] Preset bank: Cowell's / Jack's / Second Peak / First Peak / The Slot / Middle Peak

## Phase 2 — substrate
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
