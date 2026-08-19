// The set envelope's floor (2026-08-18). Pins the two invariants the fix is
// FOR, so a later retune cannot quietly reintroduce the defect:
//
//   1. the envelope MAXIMUM is unchanged — the set peak already has no
//      steepness headroom (measure_wave_scale.mjs: drawn H/L is 1.6-3.0x the
//      Miche depth limit and drawn H/h reaches 2.63 against gamma = 0.78), so
//      the fix must not touch it;
//   2. the envelope MINIMUM is strictly positive — a zero floor drew water
//      flatter than the physical sea for a large part of every beat (drawn
//      height exaggeration fell to 0.22x).
//
// Plus the things that must NOT move: the cadence 1/dF (verified at
// 120.5-122.4 s by two independent estimators), and the #env=0 revert, which
// has to reproduce the legacy envelope bit-identically.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setEnv, SET_DEPTH, SET_DEPTH_LEGACY } from '../web-three/js/model-js.js';

const model = readFileSync(new URL('../shared/model-glsl.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../web-three/js/main.js', import.meta.url), 'utf8');

// Model-card ocean. dF 0.006 Hz -> a 166.7 s beat, the clock the scale finding
// swept. setRef/setAnchor left at their defaults so this samples the phase the
// node tests have always sampled.
const P = { T: 14, dF: 0.006, setDepth: SET_DEPTH };
const BEAT = 1 / P.dF;

function sweep(p, n = 4001) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(setEnv(0, (i / (n - 1)) * BEAT, p));
  return out;
}

test('the envelope maximum is exactly 1 at every modulation depth', () => {
  // (1-m) + m*cos peaks at cos = 1 -> 1.0 for ALL m, which is the whole reason
  // this is a modulation depth and not a clamp: raising the floor cannot lift
  // the set peak even by rounding.
  for (const m of [SET_DEPTH_LEGACY, SET_DEPTH, 0.3, 0.1]) {
    const env = sweep({ ...P, setDepth: m });
    assert.ok(Math.abs(Math.max(...env) - 1) < 1e-9,
      `max ${Math.max(...env)} at m=${m} — the set peak must not move`);
  }
});

test('the envelope minimum is strictly positive at the shipped depth', () => {
  const env = sweep(P);
  const min = Math.min(...env);
  assert.ok(min > 0, `floor ${min} — the lull must not reach zero`);
  // and it is the DERIVED floor, 1 - 2m, not an accident of sampling
  assert.ok(Math.abs(min - (1 - 2 * SET_DEPTH)) < 1e-6, `floor ${min} != 1-2m`);
  assert.ok(Math.abs(min - 0.15) < 1e-9,
    `floor ${min} != 0.15 — see PP_SPECTRAL_SETS section 7 before changing it`);
});

test('the floor sits inside the band the spectra support', () => {
  // 0.075-0.163 (adjacent-band ratio at the model's dF) U 0.135-0.171 (duty
  // cycle). Anything outside 0.05-0.20 is authored, not derived.
  const floor = 1 - 2 * SET_DEPTH;
  assert.ok(floor >= 0.05 && floor <= 0.20,
    `floor ${floor} is outside the measured band — it would be a picked number`);
});

test('#env=0 reproduces the zero-floored envelope bit-identically', () => {
  const legacy = sweep({ ...P, setDepth: SET_DEPTH_LEGACY });
  for (let i = 0; i < legacy.length; i++) {
    const t = (i / (legacy.length - 1)) * BEAT;
    assert.equal(legacy[i], 0.5 + 0.5 * Math.cos(2 * Math.PI * P.dF * t));
  }
  assert.equal(Math.min(...legacy), 0);
});

test('a P without setDepth is the legacy envelope (twin default)', () => {
  // Same contract as setRef/setAnchor: callers predating the floor must not
  // silently change meaning.
  const t = 37;
  assert.equal(setEnv(0, t, { T: 14, dF: 0.006 }),
               setEnv(0, t, { T: 14, dF: 0.006, setDepth: SET_DEPTH_LEGACY }));
});

test('the cadence 1/dF does not move with the floor', () => {
  // The verified 120.5-122.4 s set period is a property of dF alone. Measure it
  // the way the temporal harness does — peak-to-peak of the envelope — at both
  // depths and require agreement to the sample step.
  const peakTimes = (m) => {
    const n = 20001, span = 3 * BEAT, out = [];
    let prev = -1, cur = setEnv(0, 0, { ...P, setDepth: m });
    for (let i = 1; i < n; i++) {
      const t = (i / (n - 1)) * span;
      const next = setEnv(0, t + span / (n - 1), { ...P, setDepth: m });
      if (cur > prev && cur >= next) out.push(t);
      prev = cur; cur = next;
    }
    return out;
  };
  const a = peakTimes(SET_DEPTH), b = peakTimes(SET_DEPTH_LEGACY);
  assert.ok(a.length >= 2 && a.length === b.length, 'peak count changed');
  for (let i = 1; i < a.length; i++) {
    assert.ok(Math.abs((a[i] - a[i - 1]) - BEAT) < 0.2, 'beat period moved');
    assert.ok(Math.abs(a[i] - b[i]) < 0.2, 'set peaks moved in time');
  }
});

test('the GPU carries the same form, and the flag is wired', () => {
  assert.match(model, /uniform float u_setDepth;/);
  assert.match(model, /return \(1\.0 - u_setDepth\) \+ u_setDepth\*cos\(setPhase\(s, t\)\);/);
  // setupLiftM deliberately keeps 100% depth — coherence with the sets is a
  // PHASE property (shared setPhase) and is preserved; setup is broken-wave
  // momentum flux, and lull waves do not break.
  assert.match(model, /float envS  = 0\.5 \+ 0\.5\*cos\(ph - lagPh\);/);
  assert.match(main, /u_setDepth:   \{ value: SET_DEPTH \}/);
  assert.match(main, /h\.get\('env'\) === '0'/);
});
