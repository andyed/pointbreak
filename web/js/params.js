// Model parameters + spot presets. Single source of truth for the UI and shader
// uniforms. Values trace to docs/MODEL.md (model card + preset taxonomy).

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

// alpha in degrees here; shader gets radians. aframe: 0 = point break, 1 = Middle Peak.
export const PRESETS = {
  cowells:    { label: "Cowell's",     alpha: 70, xi: 0.35, sections: 0.05, T: 12, H0: 0.7, dF: 0.006, tau: 4,   chop: 0.15, aframe: 0 },
  jacks:      { label: "Jack's",       alpha: 62, xi: 0.5,  sections: 0.1,  T: 13, H0: 1.1, dF: 0.006, tau: 5,   chop: 0.1,  aframe: 0 },
  secondpeak: { label: 'Second Peak',  alpha: 58, xi: 0.65, sections: 0.15, T: 14, H0: 1.5, dF: 0.006, tau: 5,   chop: 0.1,  aframe: 0 },
  firstpeak:  { label: 'First Peak',   alpha: 50, xi: 0.85, sections: 0.25, T: 14, H0: 1.8, dF: 0.007, tau: 5.5, chop: 0.1,  aframe: 0 },
  thehook:    { label: 'The Hook',     alpha: 48, xi: 0.8,  sections: 0.2,  T: 13, H0: 1.5, dF: 0.007, tau: 5,   chop: 0.15, aframe: 0 },
  theslot:    { label: 'The Slot',     alpha: 35, xi: 1.3,  sections: 0.5,  T: 15, H0: 2.4, dF: 0.008, tau: 6,   chop: 0.2,  aframe: 0 },
  middlepeak: { label: 'Middle Peak',  alpha: 45, xi: 1.1,  sections: 0.3,  T: 15, H0: 2.2, dF: 0.008, tau: 6,   chop: 0.2,  aframe: 1 },
};

export const DEFAULT_PRESET = 'secondpeak';

export function makeState() {
  return { ...PRESETS[DEFAULT_PRESET], speed: 1, view: 1, surfer: 0, paused: false, preset: DEFAULT_PRESET };
}

export function applyPreset(state, key) {
  const p = PRESETS[key];
  if (!p) return;
  for (const k of Object.keys(p)) if (k !== 'label') state[k] = p[k];
  state.preset = key;
}
