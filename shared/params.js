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
// is a real site on this point; geoSpot is its OSM surf node. Private's is the
// one site whose coastline defeats the cubic contour fit (16.5 m RMS), so it
// runs on the synthetic stage and says so in the app rather than borrowing a
// neighbour's bathymetry.
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
  privates:   { label: 'Privates',     geoSpot: null,           alpha: 31, xi: 0.35, sections: 0.05, T: 12, H0: 0.7, dF: 0.006, tau: 4,   chop: 0.15, aframe: 0 },
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
// Privates has no measured bed, so no bake, no break-line branch, no flip.
//
// Everything below was read off ONE run of the instrument; every field is
// checked against a fresh headless measurement by tests/peel-floor.test.js.
export const PEEL_FLOOR_BASIS = {
  measured: '2026-09-01',
  modelCommit: 'c85bf62',   // the tree the floors were read off (bake inputs last moved 1a0b17e, thresholds 09c7f4a)
  instrument: 'scripts/measure_break_activation.mjs --mode=floor',
  tideM: 0,                 // every spot: tide 0
  periodS: 'card',          // every spot: the site card's own T (basisT per row)
  gamma: 0.78,              // dispersion.js GAMMA, the breaker index in F = H0*shelter*Ks - gamma*h
  stepM: 0.01, ladderLoM: 0.4,
  alphaMetric: 'stage-median clean signed crest-relative alpha (derivedAlphaDeg on the 2 m stage grid, limiter-pinned stations excluded)',
  alphaFloorDeg: 10, onReefMin: 0.5,
  criterion: 'lowest H0 from which every 0.01 m rung up to the card H0 reads alpha >= alphaFloorDeg with the authored handedness and >= onReefMin of stage stations on the reef footprint',
};
export const PEEL_FLOOR = {
  sewers: {
    flipLo: 1.61, flipHi: 1.62, floorLo: 1.61, floorHi: 1.62, floorH0: 1.62,
    alphaBelow: -8.3, alphaAbove: 34.8, onReefBelow: 0.33, onReefAbove: 0.65,
    alphaTarget: 38, basisT: 15, basisTideM: 0, bakeDigest: '747a005bb046e8c7' },
  firstpeak: {
    flipLo: 1.27, flipHi: 1.28, floorLo: 1.37, floorHi: 1.38, floorH0: 1.38,
    alphaBelow: 5.9, alphaAbove: 22.1, onReefBelow: 0.88, onReefAbove: 0.88,
    alphaTarget: 50, basisT: 14, basisTideM: 0, bakeDigest: 'a586daac7d4ad798' },
  secondpeak: {
    flipLo: 1.04, flipHi: 1.05, floorLo: 1.10, floorHi: 1.11, floorH0: 1.11,
    alphaBelow: 9.4, alphaAbove: 10.6, onReefBelow: 0.70, onReefAbove: 0.75,
    alphaTarget: 41, basisT: 14, basisTideM: 0, bakeDigest: '58148fabc1138cb5' },
  jacks: {
    flipLo: 0.83, flipHi: 0.84, floorLo: 0.77, floorHi: 0.78, floorH0: 0.78,
    alphaBelow: 10.6, alphaAbove: 11.1, onReefBelow: 0.38, onReefAbove: 0.56,
    alphaTarget: 37, basisT: 13, basisTideM: 0, bakeDigest: '618f85df8f158b0e' },
  thehook: {
    flipLo: 1.03, flipHi: 1.04, floorLo: 1.08, floorHi: 1.09, floorH0: 1.09,
    alphaBelow: -5.3, alphaAbove: 12.3, onReefBelow: 0.50, onReefAbove: 0.54,
    alphaTarget: 41, basisT: 13, basisTideM: 0, bakeDigest: 'bf59838b525da980' },
  sharks: {
    flipLo: 0.79, flipHi: 0.80, floorLo: 0.80, floorHi: 0.81, floorH0: 0.81,
    alphaBelow: 15.0, alphaAbove: 16.4, onReefBelow: 0.49, onReefAbove: 0.54,
    alphaTarget: 36, basisT: 13, basisTideM: 0, bakeDigest: '01d723cefb316822' },
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
  if (Math.abs(tideM - f.basisTideM) > 1e-6) return null;
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
