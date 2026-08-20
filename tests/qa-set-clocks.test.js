// The set-sheet clock derivation and its crest reducer (2026-08-19).
//
// The QA contact sheet reported The Hook's set peaking a column early and low
// (crest 1.04/3.63/3.13/1.25/0.98 m across one beat, apparently cresting in
// column 2). It was a MEASUREMENT artifact, not a model defect: the crest at a
// fixed station is a 12-15 s carrier inside a 125-167 s set envelope, and the
// sheet's columns are a quarter beat (31-42 s) apart, so a single-instant read
// samples the carrier at an unrelated phase in every column. Swept, the same
// station carried 2.11-5.30 m waves with the biggest 3.9 s BEFORE the peak
// column's own clock. See docs/research/MEASUREMENT_LESSONS.md 12.
//
// Two things are pinned here so the diagnosis cannot silently rot:
//   1. the clock formula really does land the envelope maximum in column 3,
//      for every shipped Delta-f and INDEPENDENTLY of u_setRef — which is what
//      rules out "the anchor is off at this one site" as an explanation;
//   2. the sets sheet reduces its crest over one full carrier period rather
//      than sampling an instant.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setEnv, SET_ANCHOR_S, SET_DEPTH } from '../web-three/js/model-js.js';
import { PRESETS } from '../shared/params.js';

const rig = readFileSync(new URL('../scripts/build_qa_sheets.mjs', import.meta.url), 'utf8');

// The sheet's own column formula (scripts/build_qa_sheets.mjs clocksFor).
const columns = (dF) =>
  [0, 1, 2, 3, 4].map((k) => SET_ANCHOR_S + (1 / dF) * (0.5 + k / 4));

test('column 3 is the envelope maximum for every shipped site, at any setRef', () => {
  // setRef is the stage-median rayS of the live break line; the bank spans
  // 0 to -63 m today and the bake can move it. The anchor cancels it by
  // construction (tRef = (SET_ANCHOR_S - setRef/cg)), so the column clocks must
  // be exactly right for ANY value — including ones far outside the bank.
  for (const [name, p] of Object.entries(PRESETS)) {
    for (const setRef of [0, -53.91, -62.58, 5.11, 400, -400]) {
      const P = { T: p.T, dF: p.dF, setRef, setAnchor: 1, setDepth: SET_DEPTH };
      const env = columns(p.dF).map((t) => setEnv(setRef, t, P));
      assert.ok(Math.abs(env[2] - 1) < 1e-9,
        `${name} setRef=${setRef}: peak column env ${env[2]}, expected 1`);
      // and the lulls are the floor, symmetric about it
      assert.ok(Math.abs(env[0] - (1 - 2 * SET_DEPTH)) < 1e-9, `${name}: column 1 is not the floor`);
      assert.ok(Math.abs(env[4] - (1 - 2 * SET_DEPTH)) < 1e-9, `${name}: column 5 is not the floor`);
      assert.ok(Math.abs(env[1] - env[3]) < 1e-9, `${name}: the shoulders are not symmetric`);
    }
  }
});

test('no single clock phasing can make an instantaneous crest honest', () => {
  // WHY the instantaneous read had to be REPLACED rather than re-phased. A
  // quarter beat is 1/(4*dF) and a wave is T; the column spacing is a whole
  // number of waves only where those happen to divide. Measured across the
  // shipped bank: 2.08 waves at Sewers (which is why Sewers' instant looked
  // fine — luck, 0.08 of a wave from commensurate) against 2.75 at The Hook
  // (0.25 off, i.e. the worst case, a clock landing squarely between crests —
  // which is exactly the cell that was reported as a model defect). dF and T
  // are independent site parameters, so this spread is structural: there is no
  // choice of column times that serves every site, and the fix has to be in
  // the reducer.
  const frac = Object.fromEntries(Object.entries(PRESETS).map(([name, p]) => {
    const waves = (1 / p.dF) / 4 / p.T;
    return [name, Math.abs(waves - Math.round(waves))];
  }));
  const vals = Object.values(frac);
  assert.ok(Math.max(...vals) > 0.2,
    `worst site is only ${Math.max(...vals).toFixed(2)} of a wave off commensurate `
    + '— if that is ever true of the whole bank, revisit whether the sweep is still needed');
  assert.ok(Math.max(...vals) - Math.min(...vals) > 0.1,
    `the bank spans only ${(Math.max(...vals) - Math.min(...vals)).toFixed(2)} of a wave `
    + '— a common clock phasing might exist, which this test exists to deny');
});

test('the sets sheet reduces the crest over one full carrier period', () => {
  // Source-level, the same way set-envelope.test.js pins the GPU form: the
  // window must be centred on the column clock, span exactly one T, and be
  // fed the LIVE period (a hardcoded T would alias again on the 12 s site).
  assert.match(rig, /const ENV_SUBCLOCKS = (\d+);/);
  assert.ok(Number(rig.match(/const ENV_SUBCLOCKS = (\d+);/)[1]) >= 8,
    'fewer than 8 sub-clocks cannot resolve a crest to a few percent');
  assert.match(rig, /\(j \/ ENV_SUBCLOCKS - 0\.5\) \* T/);
  assert.match(rig, /measureStationEnvelope\(page, live\.T, t, stage\.atAim/);
  // and only the SET sheet gets it — on the wave-period sheet the carrier is
  // the subject, so an instant is the right read there.
  assert.match(rig, /sheet\.clock\.kind === 'set' && stage\.atAim/);
});
