// Model parameters + spot presets. Single source of truth for the UI and shader
// uniforms. Values trace to docs/MODEL.md (model card + preset taxonomy).

import { PP_GEO_DATA } from '../../data/model/pp_geo_profiles.js';

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
// The bank is the Pleasure Point canon, ordered apex -> down-point, which is
// also the golden-rule gradient: alpha rises (mellower) and xi falls (less
// plunging) as you move away from the corner. Every name is a real site on
// this point; geoSpot is its OSM surf node. Private's is the one site whose
// coastline defeats the cubic contour fit (16.5 m RMS), so it runs on the
// synthetic stage and says so in the app rather than borrowing a neighbour's
// bathymetry.
export const PRESETS = {
  sewers:     { label: 'Sewers',       geoSpot: 'Sewer Peak',   alpha: 38, xi: 1.15, sections: 0.40, T: 15, H0: 2.2, dF: 0.008, tau: 6,   chop: 0.2,  aframe: 0 },
  firstpeak:  { label: 'First Peak',   geoSpot: 'First Peak',   alpha: 50, xi: 0.85, sections: 0.25, T: 14, H0: 1.8, dF: 0.007, tau: 5.5, chop: 0.1,  aframe: 0 },
  secondpeak: { label: 'Second Peak',  geoSpot: 'Second Peak',  alpha: 58, xi: 0.65, sections: 0.15, T: 14, H0: 1.5, dF: 0.006, tau: 5,   chop: 0.1,  aframe: 0 },
  jacks:      { label: "Jack's (38th)", geoSpot: '38th',        alpha: 62, xi: 0.50, sections: 0.10, T: 13, H0: 1.1, dF: 0.006, tau: 5,   chop: 0.1,  aframe: 0 },
  thehook:    { label: 'The Hook',     geoSpot: 'The Hook',     alpha: 48, xi: 0.80, sections: 0.20, T: 13, H0: 1.5, dF: 0.007, tau: 5,   chop: 0.15, aframe: 0 },
  sharks:     { label: 'Sharks',       geoSpot: "Shark's Cove", alpha: 66, xi: 0.45, sections: 0.10, T: 13, H0: 1.0, dF: 0.006, tau: 4.5, chop: 0.1,  aframe: 0 },
  privates:   { label: 'Privates',     geoSpot: null,           alpha: 70, xi: 0.35, sections: 0.05, T: 12, H0: 0.7, dF: 0.006, tau: 4,   chop: 0.15, aframe: 0 },
};

export const DEFAULT_PRESET = 'secondpeak';

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
