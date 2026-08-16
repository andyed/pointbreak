// Conditions bank — the screensaver "good day" curator (TODO mission item 2).
// A small authored bank of named condition-days spanning the character space:
// each day is a point in the six-knob swell/tide space (H0, T, tide, chop, dF;
// alpha/xi stay with the SITE preset — peel geometry is a property of the
// shelf, not the day). Values sit inside PARAM_DEFS ranges (shared/params.js)
// and tides inside TIDE_RANGE (bed.js), so a day can never ask the model for
// conditions the sliders themselves forbid.
//
// `good: true` marks the surf-worthy days: the idle-drift curator cycles only
// those, so a parked screen sees a session of days worth watching. The junky
// ones exist to be *picked* (contrast, honesty) — never drifted into.

import { TIDE_RANGE } from './bed.js';

const clampTide = (t) =>
  Math.min(Math.max(t, TIDE_RANGE[0]), TIDE_RANGE[1]);

export const CONDITION_DAYS = [
  // Small summer windswell: short-period, choppy, weak. Watchable, not surfable.
  { key: 'small',     label: 'small summer windswell',        H0: 0.7, T: 9,  tideM: 0.35,  chop: 0.5,  dF: 0.015, good: false },
  // The model-card day (docs/MODEL.md reference conditions).
  { key: 'modelcard', label: 'model-card day',                H0: 1.5, T: 14, tideM: 0.0,   chop: 0.1,  dF: 0.006, good: true },
  // Mid-size mid-period pulse: the everyday good day between card and overhead.
  { key: 'pulse',     label: 'fun mid-period pulse',          H0: 1.2, T: 12, tideM: 0.2,   chop: 0.15, dF: 0.008, good: true },
  // Overhead WNW groundswell on a draining low tide — the barrel day.
  { key: 'overhead',  label: 'overhead WNW groundswell, low', H0: 2.2, T: 16, tideM: -0.6,  chop: 0.1,  dF: 0.005, good: true },
  // Big and clean: long-period, glassy, long set cycles (small dF).
  { key: 'big',       label: 'big clean groundswell',         H0: 2.5, T: 17, tideM: -0.2,  chop: 0.05, dF: 0.004, good: true },
  // Storm junk: victory-at-sea. High tide slop, sets have no rhythm.
  { key: 'stormy',    label: 'storm junk',                    H0: 1.8, T: 10, tideM: 0.6,   chop: 0.9,  dF: 0.018, good: false },
];

export function getConditionDay(key) {
  return CONDITION_DAYS.find((d) => d.key === key) || null;
}

// Apply a named day onto the state (and, if given, straight onto the uniforms
// so a headless probe sees the change without waiting a frame — the render
// loop re-copies state -> uniforms every frame anyway). The site preset is
// left alone: a day changes the ocean, not the reef. Returns the day or null.
export function applyConditionDay(state, uniforms, key) {
  const d = getConditionDay(key);
  if (!d) return null;
  state.H0 = d.H0;
  state.T = d.T;
  state.chop = d.chop;
  state.dF = d.dF;
  state.tide = clampTide(d.tideM);
  if (uniforms) {
    if (uniforms.u_H0)   uniforms.u_H0.value = d.H0;
    if (uniforms.u_T)    uniforms.u_T.value = d.T;
    if (uniforms.u_chop) uniforms.u_chop.value = d.chop;
    if (uniforms.u_dF)   uniforms.u_dF.value = d.dF;
  }
  return d;
}

// Next surf-worthy day after `key`, cycling. An unknown/junky/null key lands
// on the first good day, so drift always enters the good rotation.
export function nextGoodDay(key) {
  const good = CONDITION_DAYS.filter((d) => d.good);
  const i = good.findIndex((d) => d.key === key);
  return good[(i + 1) % good.length].key;
}
