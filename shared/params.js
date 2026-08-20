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
// the healthy side of it (MODEL.md 4.6 "The peel floor"). Measured on the
// 0.40-3.00 m ladder refined to 0.01 m with `scripts/measure_branch_flip.mjs`,
// and hysteresis-free (up- and down-sweeps bit-identical at 211 paired steps
// bank-wide, and at 21 more for Second Peak's refinement), which is what makes
// a clamp stable rather than a latch.
//
//   flipLo / flipHi        the 1c'-d branch flip, the mechanism
//   floorLo / floorHi      the 0.01 m step at which the PEEL returns
//   floorH0                floorHi — the lowest H0 a derived ocean may draw at
//   alphaBelow / Above     stage-median alpha (deg) either side of floorLo/Hi
//   basisT, basisTideM     THE OCEAN THESE WERE MEASURED AT (see below)
//
// THE FLIP IS NOT ALWAYS THE FLOOR, and Second Peak is why this table carries
// both. At five spots the branch flip IS the peel returning: cross it and
// alpha goes 1.4-9.1 -> 12.1-35.0. At Second Peak the tabulated 1.02->1.03
// flip moves alpha 2.6 -> 3.7 — a real branch change between two CLOSED-OUT
// branches, against a 41 deg target. Clamping there would have cost two thirds
// of that spot's seasonal range and bought nothing. Its peel actually returns
// at 1.07->1.08 (9.1 -> 14.4), measured on the same ladder. A floor is defined
// by the quantity it is a floor ON, which is the peel, not the branch id.
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
export const PEEL_FLOOR = {
  sewers: {
    flipLo: 1.60, flipHi: 1.61, floorLo: 1.60, floorHi: 1.61, floorH0: 1.61,
    alphaBelow: 9.1, alphaAbove: 35.0, alphaTarget: 38, basisT: 15, basisTideM: 0 },
  firstpeak: {
    flipLo: 1.25, flipHi: 1.26, floorLo: 1.25, floorHi: 1.26, floorH0: 1.26,
    alphaBelow: 1.4, alphaAbove: 12.1, alphaTarget: 50, basisT: 14, basisTideM: 0 },
  secondpeak: {
    flipLo: 1.02, flipHi: 1.03, floorLo: 1.07, floorHi: 1.08, floorH0: 1.08,
    alphaBelow: 9.1, alphaAbove: 14.4, alphaTarget: 41, basisT: 14, basisTideM: 0 },
  jacks: {
    flipLo: 0.84, flipHi: 0.85, floorLo: 0.84, floorHi: 0.85, floorH0: 0.85,
    alphaBelow: 7.2, alphaAbove: 21.3, alphaTarget: 37, basisT: 13, basisTideM: 0 },
  thehook: {
    flipLo: 1.04, flipHi: 1.05, floorLo: 1.04, floorHi: 1.05, floorH0: 1.05,
    alphaBelow: 6.2, alphaAbove: 17.1, alphaTarget: 41, basisT: 13, basisTideM: 0 },
  sharks: {
    flipLo: 0.80, flipHi: 0.81, floorLo: 0.80, floorHi: 0.81, floorH0: 0.81,
    alphaBelow: 7.5, alphaAbove: 16.4, alphaTarget: 36, basisT: 13, basisTideM: 0 },
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
  const state = { speed: 1, view: 1, surfer: 0, paused: false, preset: null };
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
