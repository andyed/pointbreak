// Model parameters + spot presets. Single source of truth for the UI and shader
// uniforms. Values trace to docs/MODEL.md (model card + preset taxonomy).

import { PP_GEO_DATA } from '../data/model/pp_geo_profiles.js';

// ---------- the finite-reef envelope ----------
// reefWindow(x) fades the wave in and out at the ends of the shelf. Its four
// knots were hard-coded as (-110, -35, 215, 290) — which is exactly the
// SYNTHETIC stage [-110, 290] feathered inward by 75 m. That was the rule all
// along; it was just frozen at the one stage that existed when it was written.
//
// Six mapped spots later, every one of them still inherited that same envelope
// in world x, so all six shared one manufactured shelf edge at x ~ -35..-64 —
// measured 2026-08-11 (scripts/measure_takeoff.mjs): the takeoff clustered
// there on 5 of 6 spots regardless of where the spot's own stage sat, and the
// peak split into a left and a right at a point break whose stated convention
// is that no site ships aframe = 1. The envelope also feathers M5's synthetic
// reef (bed.js makeReefFn), so the corner reached the seabed too.
//
// Same rule, each spot's own bounds. MODEL.md 2.1 says the OSM partitions "do
// not replace the authored finite-reef envelope" — that stands: this does not
// replace the envelope, it stops pinning it to a stage none of these spots
// occupy. The partitions are still not measured reef edges; they are, at
// least, per-spot and defensible, which one shared constant is not.
//
// The feather is capped so a narrow stage keeps a plateau: First Peak spans
// 113 m, and two 75 m ramps would invert it.
export const REEF_FEATHER_MAX = 75;

export function reefWindowKnots(stageStart, stageEnd) {
  const w = Math.max(stageEnd - stageStart, 1);
  const f = Math.min(REEF_FEATHER_MAX, 0.35 * w);
  return [stageStart, stageStart + f, stageEnd - f, stageEnd];
}

export const PARAM_DEFS = [
  // key,        label,               min,   max,   step,  unit
  { key: 'alpha',    label: 'Peel angle α',   min: 20,    max: 80,   step: 1,     unit: '°'  },
  { key: 'xi',       label: 'Barrel ξ',       min: 0.2,   max: 2.0,  step: 0.05,  unit: ''   },
  { key: 'sections', label: 'Sections σ',     min: 0,     max: 1,    step: 0.05,  unit: ''   },
  { key: 'T',        label: 'Period T',       min: 8,     max: 18,   step: 0.5,   unit: 's'  },
  { key: 'H0',       label: 'Swell height',   min: 0.4,   max: 3.0,  step: 0.1,   unit: 'm'  },
  { key: 'dF',       label: 'Set beat Δf',    min: 0.002, max: 0.02, step: 0.001, unit: 'Hz' },
  { key: 'tau',      label: 'Foam decay τ',   min: 2,     max: 10,   step: 0.5,   unit: 's'  },
  { key: 'chop',     label: 'Wind chop',      min: 0,     max: 1,    step: 0.05,  unit: ''   },
  { key: 'speed',    label: 'Time scale',     min: 0,     max: 3,    step: 0.1,   unit: '×'  },
];

// alpha in degrees here; shader gets radians. aframe stays a PARAMETER (0 for
// every site) rather than a named preset: the A-frame is a mechanism, and the
// wave that demonstrates it is on the west side, not here.
//
// The bank is the Pleasure Point canon, ordered apex -> down-point. Every name
// is a real site on this point; geoSpot is its OSM surf node. Private's was the
// one site whose coastline defeated the cubic contour fit (16.62 m RMS over the
// 250 m OSM-midpoint window). MAPPED 2026-09-02: with the stage ended where
// the contour departs the frame (`build_geo_profiles.py --truncate 0.5`, the
// default in `npm run build:geo` since that date; see
// docs/research/PRIVATES_CONTOUR_2026-09-01.md) it fits at 1.87 m RMS on a
// [-189.7, 60] m window and maps to its own OSM node. The six other profiles
// are byte-identical under the flag. What the mapped bed does NOT give it: the
// M5 reef fit does not converge there (7.6 deg against 31 after 14 iterations;
// h_b 1.40 m is the node's own depth, so the wedge may lift the bed by at most
// 0.64 m) and its wedge activates at 0.721 m — ABOVE the 0.70 m card — so at
// the card ocean the line is the DEM platform's own peel (15.7 deg stage
// median, 0 % of stations on the wedge), not the reef's. See PEEL_FLOOR below
// for what that costs.
//
// RETARGET 2026-08-13 (Track 1c'-c.7). The old bank encoded the golden-rule
// gradient as alpha RISING down-point (58/62/66/70 = mellower). That is
// backwards physics: Snell over the shore platform bounds the peel at
// sin(a_max) = c_b/c_s (Henriquez 2004 eq. 3.5, tests/peel-ceiling.test.js),
// smaller waves break shallower, refract more, and get a LOWER ceiling — so
// the small down-point spots are the LOW-alpha ones. Each retargeted alpha is
// its spot's own ceiling evaluated at the model's own geometry (h_b from the
// card, shelf depth = wedge seaward edge, crest + REEF_AMP_MAX + 1.2 fade),
// corroborated independently by Integral's Topanga study (31-53 deg, 12
// scenarios, never above 53) — the 58-70 deg targets came from surf-guide
// character prose and sat outside both bounds. Sewers (38) is well inside its
// 47 deg ceiling and keeps its guide value. First Peak keeps 50 against a 44
// planar bound BY MEASUREMENT: it hits 50.8 stage-median at the shipped
// shape — it sits at the apex, where the coast tangent carries ~111 deg of
// rotation the planar bound cannot see. Mellow-down-point now belongs to
// SHELTERING (H_eff falling down-point), not to alpha.
export const PRESETS = {
  sewers:     { label: 'Sewers',       geoSpot: 'Sewer Peak',   alpha: 38, xi: 1.15, sections: 0.40, T: 15, H0: 2.2, dF: 0.008, tau: 6,   chop: 0.2,  aframe: 0 },
  firstpeak:  { label: 'First Peak',   geoSpot: 'First Peak',   alpha: 50, xi: 0.85, sections: 0.25, T: 14, H0: 1.8, dF: 0.007, tau: 5.5, chop: 0.1,  aframe: 0 },
  secondpeak: { label: 'Second Peak',  geoSpot: 'Second Peak',  alpha: 41, xi: 0.65, sections: 0.15, T: 14, H0: 1.5, dF: 0.006, tau: 5,   chop: 0.1,  aframe: 0 },
  jacks:      { label: "Jack's (38th)", geoSpot: '38th',        alpha: 37, xi: 0.50, sections: 0.10, T: 13, H0: 1.1, dF: 0.006, tau: 5,   chop: 0.1,  aframe: 0 },
  thehook:    { label: 'The Hook',     geoSpot: 'The Hook',     alpha: 41, xi: 0.80, sections: 0.20, T: 13, H0: 1.5, dF: 0.007, tau: 5,   chop: 0.15, aframe: 0 },
  sharks:     { label: 'Sharks',       geoSpot: "Shark's Cove", alpha: 36, xi: 0.45, sections: 0.10, T: 13, H0: 1.0, dF: 0.006, tau: 4.5, chop: 0.1,  aframe: 0 },
  privates:   { label: 'Privates',     geoSpot: "Private's",    alpha: 31, xi: 0.35, sections: 0.05, T: 12, H0: 0.7, dF: 0.006, tau: 4,   chop: 0.15, aframe: 0 },
};

export const DEFAULT_PRESET = 'secondpeak';

// ---------- the peel floor (measured 2026-08-19, TODO 1c'-d) ----------
// Every mapped spot has ONE H0 at which the baked break line abandons the
// oblique reef branch for a near-shore-parallel inshore one and the peel
// collapses to a closeout. It is a genuine discontinuity, not noise in the
// instrument: `markBreakCrossings` returns onsets, an onset dies when a
// negative dip in the breaking excess `H0*Ks - gamma*h` crosses zero, and the
// dips that vanish at these thresholds measure -0.002 to -0.144 m — the
// criterion grazing zero at 0.1-0.7% of its own scale, over a bed whose own
// elevation residual is 0.31-0.93 m. Branch identity sits below the noise
// floor of the data underneath it. Four selection-layer fixes have been built
// and falsified (anchor band, density composite, `#merge`, and the Viterbi /
// extremal counterfactuals); MEASUREMENT_LESSONS 14 says why a fifth will not
// work either — a threshold relocates a knife-edge, it never deletes one.
//
// So the numbers below are not a tuning knob. They are the measured boundary
// of the regime where this model draws a peel, and a DERIVED ocean is held to
// the healthy side of it (MODEL.md 4.6 "The peel floor"). Measured with
// `scripts/measure_break_activation.mjs --mode=floor` on the 0.40 m -> card
// H0 ladder at 0.01 m, tide 0, card T (PEEL_FLOOR_BASIS below), through a
// selector the instrument reproduces from the bake bit-for-bit at every rung
// (LESSONS 4). The selection is hysteresis-free (up- and down-sweeps
// bit-identical, 2026-08-19), which is what makes a clamp stable rather than
// a latch.
//
//   flipLo / flipHi        the largest branch flip on the ladder, the mechanism
//   floorLo / floorHi      the 0.01 m step at which the PEEL returns
//   floorH0                floorHi — the lowest H0 a derived ocean may draw at
//   alphaBelow / Above     stage-median clean SIGNED alpha (deg) at floorLo/Hi
//   onReefBelow / Above    fraction of stage stations on the wedge at floorLo/Hi
//   basisT, basisTideM     THE OCEAN THESE WERE MEASURED AT (see below)
//   bakeDigest             fingerprint of the bake at floorLo/Hi (see below)
//   tideBandM              the tide interval in which the tide-0 floor HOLDS
//                          (PEEL_FLOOR_BASIS.tideCriterion); the floor binds
//                          inside it and declines outside it
//   tideEdges.lo/hi        the last holding tide rung on each side, with the
//                          alpha / on-reef of the floor and the card there,
//                          and — where the band does not run to the range
//                          limit — the next rung, the H0 that fails on it and
//                          why (the twin of alphaBelow/Above on the tide axis)
//   tideDigest             fingerprint of the bake at those edge states
//
// THE FLIP IS NOT THE FLOOR. "The peel returns" means: at every 0.01 m rung
// from the floor up to the card H0, stage-median clean signed alpha is at
// least PEEL_FLOOR_BASIS.alphaFloorDeg with the authored handedness AND at
// least onReefMin of the stage stations sit on the reef footprint. The reef
// condition is what stops First Peak's inshore bore (10-12 deg at 0% on the
// reef, 0.60-1.25 m) and Jack's at 0.73-0.77 (10 deg, 1-38% on the reef)
// from counting as a peel. Against that definition the branch flips fall
// where they fall: at Second Peak the largest flip (1.04->1.05) moves alpha
// 6.2 -> 4.1, two closeouts, and the peel returns at 1.10->1.11; at First
// Peak the flip is 1.27->1.28 and the peel does not return until 1.37->1.38
// (the line dips to 6-8 deg in between); at Jack's the peel is present from
// 0.78 and the flips above it (0.78->0.79, 0.79->0.80, 0.83->0.84) are
// changes between two PEELS (11-12 deg -> 24). A floor is defined by the
// quantity it is a floor ON, which is the peel, not the branch id.
//
// THE MODEL VERSION IS PART OF THE BASIS (research/BREAK_FIELD_2026-09-01 §4).
// The first table (2026-08-20, commit 533aef6, measure_branch_flip.mjs) was
// read off a bake with deep-water shoaling and an unsigned |atan(dz/dx)|
// alpha. Commit 09c7f4a (2026-08-26, finite-depth group velocity) moved every
// threshold 1-2 rungs, and the signed metric makes the collapsed inshore
// branch read NEGATIVE at Sewers and The Hook. On today's bake the old 1.61
// floor at Sewers drew -8.3 deg — a left-handed closeout at all twelve
// months — and the old 1.08 at Second Peak drew 5.8. `bakeDigest` is a sha1
// of the shipped line, its gap flags and the canonical alpha along it at
// floorLo and floorHi; tests/peel-floor.test.js recomputes it headlessly and
// fails when the bake moves, naming this table as the thing to re-derive.
//
// THE BASIS IS PART OF THE NUMBER. These were measured at tide 0 and the site
// card's own T, and the flip threshold is a surface in (H0, T, tide), not a
// point on the H0 axis. Applying them off that basis is MEASUREMENT_LESSONS 13
// — a number computed from a configuration that is not in play — and it was
// measured to do real damage: clamping `#day=small` (T 9, tide +0.35) up to
// the tide-0 floor took Sewers from alpha 12.8 to 3.9 and The Hook from 10.4
// to 5.9, turning two healthy states into closeouts. So `basisT`/`basisTideM`
// are checked before the floor is allowed to bind.
//
// THE REFIT (2026-09-24, research/REEF_REFIT_2026-09-24.md). Every row below
// was re-measured on the table-arm bake (bed.js data/model/pp_reef_fit.json
// under the MLLW + 0.1 m crest cap); the c85bf62 rows are kept as
// PEEL_FLOOR_LEGACY for the #reef=legacy arm. What moved: the shallower
// wedges activate lower (0.29-1.21 m against 0.62-1.24), so every floor
// dropped (Sewers 1.62 -> 1.54, First Peak 1.38 -> 1.20, Second Peak 1.11 ->
// 0.47, Jack's 0.78 -> 0.47, The Hook 1.09 -> 0.92, Sharks 0.81 -> 0.46) and
// Second Peak's ladder has NO branch flip any more (flipLo/flipHi null: the
// floor there is the peel returning on the reef, not a branch changing).
// Privates, null since 2026-09-02 (its legacy wedge activated at 0.721 m,
// above its 0.70 m card, so no rung up to the card was on the reef), now
// carries a floor: the table wedge (crest 0.912 m, beta 65.5) activates at
// 0.305 m, the card line sits on it (59 %, alpha 30.4 against 31) and the
// peel returns at 0.63 -> 0.64 (on-reef 0.00 -> 0.55). Its tide band is
// [MLLW, 0]: at +0.01 m the floor rung is off the wedge again.
// Sharks' tide band is [0, 0] by the criterion's own letter: the tide-0
// floor holds at every rung from MLLW to -0.02 m and at 0, and FAILS at
// -0.01 m alone (H0 0.61 m there sits 37 % on the reef — a one-rung
// knife-edge, MEASUREMENT_LESSONS 14); the band is the contiguous interval
// around 0, so it is a point, and peelFloorH0 declines at every other tide.
// Months sit at tide 0 and are unaffected; a reader dragging the tide sees
// the "NOT applied" line, which is the honest one.
//
// Everything below was read off ONE run of the instrument; every field is
// checked against a fresh headless measurement by tests/peel-floor.test.js.
export const PEEL_FLOOR_BASIS = {
  measured: '2026-09-24',
  modelCommit: '12ffab7',   // the tree the floors were read off: the refit (bed.js table arm + data/model/pp_reef_fit.json)
  tabulatedIn: 'docs/research/REEF_REFIT_2026-09-24.md',   // where the current floors and tide bands are tabulated (MODEL.md 4.6 carries the c85bf62 table until the coordinator folds this in)
  instrument: 'scripts/measure_break_activation.mjs --mode=floor',
  tideM: 0,                 // every spot: tide 0
  periodS: 'card',          // every spot: the site card's own T (basisT per row)
  gamma: 0.78,              // dispersion.js GAMMA, the breaker index in F = H0*shelter*Ks - gamma*h
  stepM: 0.01, ladderLoM: 0.4,
  alphaMetric: 'stage-median clean signed crest-relative alpha (derivedAlphaDeg on the 2 m stage grid, limiter-pinned stations excluded)',
  alphaFloorDeg: 10, onReefMin: 0.5,
  criterion: 'lowest H0 from which every 0.01 m rung up to the card H0 reads alpha >= alphaFloorDeg with the authored handedness and >= onReefMin of stage stations on the reef footprint',
  // THE TIDE AXIS (research/TIDE_FLOOR_2026-09-01.md). The whole (H0, tide)
  // grid: at every 0.01 m tide rung of the range the model accepts (bed.js
  // TIDE_RANGE = MLLW..MHHW about MSL at NOAA CO-OPS 9413450, the range
  // main.js clamps #tide= to; the observed extremes there are -1.59/+1.54 m
  // and are NOT reachable), the H0 ladder above, gated at every rung.
  // tideBandM per row is the contiguous tide interval around 0 in which the
  // tide-0 floor HOLDS: floorH0(t) <= floorH0(0) and the card is a peel.
  // Above it floorH0(t) is higher (the floor rises 0.53-0.65 m per m of tide,
  // TIDE_FLOOR §3, tracking the reef's own activation depth), so the tide-0
  // number would clamp a month onto a closeout; the floor declines there.
  // Below it the tide-0 floor is conservative (over-clamps by up to 0.38-0.54
  // m at MLLW) and still lands every month on a peel. A tide-dependent floor
  // table was measured and not adopted — TIDE_FLOOR §4: above +0.33..+0.66 m
  // (spot-dependent) the CARD itself is off the reef and no floor exists, so
  // the table would have holes across a third to half of the accepted range.
  tideMeasured: '2026-09-24',
  tideInstrument: 'scripts/measure_break_activation.mjs --mode=tide',
  tideStepM: 0.01, tideRangeM: [-0.862, 0.764],
  tideCriterion: 'contiguous interval of 0.01 m tide rungs around 0 at which floorH0(tide) <= floorH0(0) and the card H0 is a peel; the tide-0 floor is returned inside it and null outside',
};
export const PEEL_FLOOR = {
  sewers: {
    flipLo: 1.53, flipHi: 1.54, floorLo: 1.53, floorHi: 1.54, floorH0: 1.54,
    alphaBelow: -7.8, alphaAbove: 21.6, onReefBelow: 0.28, onReefAbove: 0.62,
    alphaTarget: 38, basisT: 15, basisTideM: 0, bakeDigest: 'bcd661f5eac8d3e3',
    tideBandM: [-0.862, 0], tideDigest: '3b7b08ed10b2fbd1',
    tideEdges: { lo: { tide: -0.862, beyondTide: null, alphaCard: 16.8, onReefCard: 0.83, alphaFloor: 37, onReefFloor: 0.73 },
                 hi: { tide: 0, beyondTide: 0.01, failH0: 1.54, fails: "sign+reef", alphaAtEdge: 21.6, alphaBeyond: -7.8, onReefAtEdge: 0.62, onReefBeyond: 0.29, alphaCard: 38.1, onReefCard: 0.74, alphaFloor: 21.6, onReefFloor: 0.62 } } },
  firstpeak: {
    flipLo: 0.95, flipHi: 0.96, floorLo: 1.19, floorHi: 1.20, floorH0: 1.20,
    alphaBelow: 5.2, alphaAbove: 13.1, onReefBelow: 0.79, onReefAbove: 0.82,
    alphaTarget: 50, basisT: 14, basisTideM: 0, bakeDigest: '0e2ab6aeaa9015ba',
    tideBandM: [-0.862, 0], tideDigest: '0628628ff60d3101',
    tideEdges: { lo: { tide: -0.862, beyondTide: null, alphaCard: 33.2, onReefCard: 1, alphaFloor: 44.7, onReefFloor: 1 },
                 hi: { tide: 0, beyondTide: 0.01, failH0: 1.2, fails: "alpha", alphaAtEdge: 13.1, alphaBeyond: 5.3, onReefAtEdge: 0.82, onReefBeyond: 0.81, alphaCard: 50, onReefCard: 1, alphaFloor: 13.1, onReefFloor: 0.82 } } },
  secondpeak: {
    flipLo: null, flipHi: null, floorLo: 0.46, floorHi: 0.47, floorH0: 0.47,
    alphaBelow: 15.3, alphaAbove: 15.8, onReefBelow: 0.48, onReefAbove: 0.52,
    alphaTarget: 41, basisT: 14, basisTideM: 0, bakeDigest: '262e8b6c866fbf4b',
    tideBandM: [-0.81, 0], tideDigest: '638e18ed3fd63d6e',
    tideEdges: { lo: { tide: -0.81, beyondTide: -0.82, failH0: 1.5, fails: "alpha", alphaAtEdge: 10.1, alphaBeyond: 9.7, onReefAtEdge: 0.73, onReefBeyond: 0.73, alphaCard: 10.1, onReefCard: 0.73, alphaFloor: 37.5, onReefFloor: 0.91 },
                 hi: { tide: 0, beyondTide: 0.01, failH0: 0.47, fails: "reef", alphaAtEdge: 15.8, alphaBeyond: 15, onReefAtEdge: 0.52, onReefBeyond: 0.49, alphaCard: 32.1, onReefCard: 0.93, alphaFloor: 15.8, onReefFloor: 0.52 } } },
  jacks: {
    flipLo: 0.46, flipHi: 0.47, floorLo: 0.46, floorHi: 0.47, floorH0: 0.47,
    alphaBelow: 9.7, alphaAbove: 27.2, onReefBelow: 0.47, onReefAbove: 0.67,
    alphaTarget: 37, basisT: 13, basisTideM: 0, bakeDigest: '67b21cf21762b099',
    tideBandM: [-0.862, 0.01], tideDigest: '28c6d42e357c3a4f',
    tideEdges: { lo: { tide: -0.862, beyondTide: null, alphaCard: 29.9, onReefCard: 0.87, alphaFloor: 32.9, onReefFloor: 0.83 },
                 hi: { tide: 0.01, beyondTide: 0.02, failH0: 0.47, fails: "alpha+reef", alphaAtEdge: 27.8, alphaBeyond: 9.8, onReefAtEdge: 0.67, onReefBeyond: 0.47, alphaCard: 35.1, onReefCard: 0.92, alphaFloor: 27.8, onReefFloor: 0.67 } } },
  thehook: {
    flipLo: 1.01, flipHi: 1.02, floorLo: 0.91, floorHi: 0.92, floorH0: 0.92,
    alphaBelow: -4.8, alphaAbove: 12.2, onReefBelow: 0.51, onReefAbove: 0.54,
    alphaTarget: 41, basisT: 13, basisTideM: 0, bakeDigest: '0a3ae5d50232c1d1',
    tideBandM: [-0.862, 0], tideDigest: '1bc16e6356282fc1',
    tideEdges: { lo: { tide: -0.862, beyondTide: null, alphaCard: 22.2, onReefCard: 0.78, alphaFloor: 37.4, onReefFloor: 0.79 },
                 hi: { tide: 0, beyondTide: 0.01, failH0: 0.92, fails: "sign", alphaAtEdge: 12.2, alphaBeyond: -4.9, onReefAtEdge: 0.54, onReefBeyond: 0.52, alphaCard: 39.7, onReefCard: 0.81, alphaFloor: 12.2, onReefFloor: 0.54 } } },
  sharks: {
    flipLo: 0.45, flipHi: 0.46, floorLo: 0.45, floorHi: 0.46, floorH0: 0.46,
    alphaBelow: 12.3, alphaAbove: 21.9, onReefBelow: 0.39, onReefAbove: 0.53,
    alphaTarget: 36, basisT: 13, basisTideM: 0, bakeDigest: '386e89d6b816943e',
    tideBandM: [0, 0], tideDigest: '2bb38ca3045c8a71',
    tideEdges: { lo: { tide: 0, beyondTide: -0.01, failH0: 0.61, fails: "reef", alphaAtEdge: 39.3, alphaBeyond: 18.1, onReefAtEdge: 0.72, onReefBeyond: 0.37, alphaCard: 34.3, onReefCard: 0.84, alphaFloor: 21.9, onReefFloor: 0.53 },
                 hi: { tide: 0, beyondTide: 0.01, failH0: 0.46, fails: "reef", alphaAtEdge: 21.9, alphaBeyond: 17.5, onReefAtEdge: 0.53, onReefBeyond: 0.47, alphaCard: 34.3, onReefCard: 0.84, alphaFloor: 21.9, onReefFloor: 0.53 } } },
  privates: {
    flipLo: 0.55, flipHi: 0.56, floorLo: 0.63, floorHi: 0.64, floorH0: 0.64,
    alphaBelow: 17.3, alphaAbove: 26.7, onReefBelow: 0.00, onReefAbove: 0.55,
    alphaTarget: 31, basisT: 12, basisTideM: 0, bakeDigest: 'e15596316c313dfc',
    tideBandM: [-0.862, 0], tideDigest: '9d43a2d8fe01113a',
    tideEdges: { lo: { tide: -0.862, beyondTide: null, alphaCard: 33.7, onReefCard: 0.67, alphaFloor: 33.4, onReefFloor: 0.62 },
                 hi: { tide: 0, beyondTide: 0.01, failH0: 0.64, fails: "reef", alphaAtEdge: 26.7, alphaBeyond: 17.1, onReefAtEdge: 0.55, onReefBeyond: 0, alphaCard: 30.4, onReefCard: 0.58, alphaFloor: 26.7, onReefFloor: 0.55 } } },
};

// THE LEGACY ARM'S FLOOR (#reef=legacy). The table above was re-measured on
// 2026-09-24 for the refit wedge (research/REEF_REFIT_2026-09-24.md); this is
// the c85bf62 table as it shipped before that, kept because the legacy arm
// must reproduce the pre-refit bake bit-for-bit and its digests are the proof
// (tests/reef-legacy-parity.test.js re-bakes bakeDigest and tideDigest on the
// legacy arm). Not read by the runtime: peelFloorH0() serves the shipped arm
// only, and a #reef=legacy boot draws derived oceans through PEEL_FLOOR — a
// known, documented mismatch on an A/B arm, not a floor claim about it.
export const PEEL_FLOOR_LEGACY = {
  sewers: {
    flipLo: 1.61, flipHi: 1.62, floorLo: 1.61, floorHi: 1.62, floorH0: 1.62,
    alphaBelow: -8.3, alphaAbove: 34.8, onReefBelow: 0.33, onReefAbove: 0.65,
    alphaTarget: 38, basisT: 15, basisTideM: 0, bakeDigest: '747a005bb046e8c7',
    tideBandM: [-0.862, 0], tideDigest: '1b971b6f02103c5b',
    tideEdges: { lo: { tide: -0.862, beyondTide: null, alphaCard: 16.9, onReefCard: 0.85, alphaFloor: 34.9, onReefFloor: 0.76 },
                 hi: { tide: 0, beyondTide: 0.01, failH0: 1.62, fails: 'sign+reef', alphaAtEdge: 34.8, alphaBeyond: -8.9, onReefAtEdge: 0.65, onReefBeyond: 0.33,
                       alphaCard: 36.3, onReefCard: 0.76, alphaFloor: 34.8, onReefFloor: 0.65 } } },
  firstpeak: {
    flipLo: 1.27, flipHi: 1.28, floorLo: 1.37, floorHi: 1.38, floorH0: 1.38,
    alphaBelow: 5.9, alphaAbove: 22.1, onReefBelow: 0.88, onReefAbove: 0.88,
    alphaTarget: 50, basisT: 14, basisTideM: 0, bakeDigest: 'a586daac7d4ad798',
    tideBandM: [-0.862, 0.01], tideDigest: 'f50f43c907966b90',
    tideEdges: { lo: { tide: -0.862, beyondTide: null, alphaCard: 53.2, onReefCard: 1, alphaFloor: 59, onReefFloor: 1 },
                 hi: { tide: 0.01, beyondTide: 0.02, failH0: 1.38, fails: 'alpha', alphaAtEdge: 21.7, alphaBeyond: 6, onReefAtEdge: 0.88, onReefBeyond: 0.88,
                       alphaCard: 60.7, onReefCard: 1, alphaFloor: 21.7, onReefFloor: 0.88 } } },
  secondpeak: {
    flipLo: 1.04, flipHi: 1.05, floorLo: 1.10, floorHi: 1.11, floorH0: 1.11,
    alphaBelow: 9.4, alphaAbove: 10.6, onReefBelow: 0.70, onReefAbove: 0.75,
    alphaTarget: 41, basisT: 14, basisTideM: 0, bakeDigest: '58148fabc1138cb5',
    // the one band not bounded below by the tide range: at -0.73 the CARD
    // (1.50 m) reads 10.0 deg and stops being a peel, so no floor exists there
    tideBandM: [-0.72, 0.01], tideDigest: 'e73974ace98ab333',
    tideEdges: { lo: { tide: -0.72, beyondTide: -0.73, failH0: 1.5, fails: 'alpha', alphaAtEdge: 10.2, alphaBeyond: 10, onReefAtEdge: 0.73, onReefBeyond: 0.73,
                       alphaCard: 10.2, onReefCard: 0.73, alphaFloor: 23.8, onReefFloor: 0.8 },
                 hi: { tide: 0.01, beyondTide: 0.02, failH0: 1.11, fails: 'alpha', alphaAtEdge: 10, alphaBeyond: 9.7, onReefAtEdge: 0.71, onReefBeyond: 0.7,
                       alphaCard: 26, onReefCard: 0.84, alphaFloor: 10, onReefFloor: 0.71 } } },
  jacks: {
    flipLo: 0.83, flipHi: 0.84, floorLo: 0.77, floorHi: 0.78, floorH0: 0.78,
    alphaBelow: 10.6, alphaAbove: 11.1, onReefBelow: 0.38, onReefAbove: 0.56,
    alphaTarget: 37, basisT: 13, basisTideM: 0, bakeDigest: '618f85df8f158b0e',
    tideBandM: [-0.862, 0], tideDigest: '3e3884efee6997e0',
    tideEdges: { lo: { tide: -0.862, beyondTide: null, alphaCard: 35.2, onReefCard: 0.82, alphaFloor: 35.7, onReefFloor: 0.83 },
                 hi: { tide: 0, beyondTide: 0.01, failH0: 0.78, fails: 'reef', alphaAtEdge: 11.1, alphaBeyond: 10.7, onReefAtEdge: 0.56, onReefBeyond: 0.43,
                       alphaCard: 37.1, onReefCard: 0.82, alphaFloor: 11.1, onReefFloor: 0.56 } } },
  thehook: {
    flipLo: 1.03, flipHi: 1.04, floorLo: 1.08, floorHi: 1.09, floorH0: 1.09,
    alphaBelow: -5.3, alphaAbove: 12.3, onReefBelow: 0.50, onReefAbove: 0.54,
    alphaTarget: 41, basisT: 13, basisTideM: 0, bakeDigest: 'bf59838b525da980',
    tideBandM: [-0.862, 0], tideDigest: 'cf6007523a31c057',
    tideEdges: { lo: { tide: -0.862, beyondTide: null, alphaCard: 16, onReefCard: 0.69, alphaFloor: 28.4, onReefFloor: 0.7 },
                 hi: { tide: 0, beyondTide: 0.01, failH0: 1.09, fails: 'sign', alphaAtEdge: 12.3, alphaBeyond: -5.3, onReefAtEdge: 0.54, onReefBeyond: 0.52,
                       alphaCard: 36.8, onReefCard: 0.7, alphaFloor: 12.3, onReefFloor: 0.54 } } },
  sharks: {
    flipLo: 0.79, flipHi: 0.80, floorLo: 0.80, floorHi: 0.81, floorH0: 0.81,
    alphaBelow: 15.0, alphaAbove: 16.4, onReefBelow: 0.49, onReefAbove: 0.54,
    alphaTarget: 36, basisT: 13, basisTideM: 0, bakeDigest: '01d723cefb316822',
    tideBandM: [-0.862, 0.01], tideDigest: 'af7576574f8fe5f5',
    tideEdges: { lo: { tide: -0.862, beyondTide: null, alphaCard: 15.6, onReefCard: 0.66, alphaFloor: 22.2, onReefFloor: 0.69 },
                 hi: { tide: 0.01, beyondTide: 0.02, failH0: 0.81, fails: 'reef', alphaAtEdge: 15, alphaBeyond: 15.2, onReefAtEdge: 0.51, onReefBeyond: 0.49,
                       alphaCard: 30.6, onReefCard: 0.73, alphaFloor: 15, onReefFloor: 0.51 } } },
  privates: null,
};

// The lowest H0 a DERIVED ocean (a month, a condition day, the live nowcast)
// may ask this spot for — or null where there is nothing measured to hold to,
// EITHER because the spot has no bake (Privates) OR because the ocean being
// asked for is off the basis the floor was measured at.
//
// Authored card H0s are never routed through this. Every one of them already
// sits above its own floor, and they are the calibration input for
// model-glsl.js SHELTER_*.
export function peelFloorH0(presetKey, { T = null, tideM = 0 } = {}) {
  const f = PEEL_FLOOR[presetKey];
  if (!f) return null;
  // Off-basis: the floor was measured somewhere else and does not describe
  // this ocean. Declining is the honest answer; guessing is lesson 13.
  if (T !== null && T !== f.basisT) return null;
  // The tide axis (research/TIDE_FLOOR_2026-09-01.md). The floor was measured
  // at tide 0 and HOLDS — floorH0(t) <= floorH0(0) with the card still a peel,
  // at every 0.01 m rung of H0 — only inside tideBandM. Above the band the
  // floor at that tide is HIGHER than the tide-0 number (the reef sits deeper
  // under more water; floorH0 rises 0.53-0.65 m per metre of tide), so clamping
  // to 0's floor would land a month on a closeout. This is not a clamp on
  // tide: the tide stays where the reader put it, the raw request draws, and
  // the HUD says the floor does not describe this state.
  if (!Number.isFinite(tideM) || tideM < f.tideBandM[0] - 1e-9 || tideM > f.tideBandM[1] + 1e-9) return null;
  return f.floorH0;
}

export function makeState() {
  // fog/fogBank/burnoff are renderer air (web-three FOG_GLSL + fog.js), not
  // wave model — they live in state so days, sliders and the permalink writer
  // share one source of truth, and they default to the clear shipped image.
  const state = { speed: 1, view: 1, surfer: 0, paused: false, preset: null,
                  swellDp: null,
                  fog: 1, fogBank: 0, burnoff: false };
  applyPreset(state, DEFAULT_PRESET);
  return state;
}

export function applyPreset(state, key) {
  const p = PRESETS[key];
  if (!p) return;
  for (const k of Object.keys(p)) if (k !== 'label' && k !== 'geoSpot') state[k] = p[k];
  applyGeoProfile(state, p.geoSpot);
  state.preset = key;
}

export function applyGeoProfile(state, spotName) {
  const profile = spotName ? PP_GEO_DATA.profiles[spotName] : null;
  const usable = Boolean(profile?.contourFit?.usable);
  state.geoRequestedSpot = spotName;
  state.geoSpot = usable ? spotName : null;
  state.geoMix = usable ? 1 : 0;
  state.contourX2 = usable ? profile.contourFit.x2 : 1 / 5000;
  state.contourX3 = usable ? profile.contourFit.x3 : 0;
  state.stageStart = usable ? profile.stageBoundsM[0] : -110;
  state.stageEnd = usable ? profile.stageBoundsM[1] : 290;
  state.geoU = profile?.uM ?? 0;
  state.geoReefElev = profile?.reefElevationNavd88M ?? 0;
  state.geoShoreSlope = profile?.shoreSlope ?? 0;
  state.geoFitRmse = profile?.contourFit?.rmseM ?? 0;
}

export function describeGeoState(state) {
  if (state.geoMix > 0.5) {
    return `OSM/NCEI ${state.geoSpot} · u ${Math.round(state.geoU)} m · reef ${state.geoReefElev.toFixed(2)} m NAVD88`;
  }
  if (state.geoRequestedSpot) return `${state.geoRequestedSpot}: geo fit unavailable · synthetic contour`;
  return 'synthetic contour · no Pleasure Point mapping';
}
