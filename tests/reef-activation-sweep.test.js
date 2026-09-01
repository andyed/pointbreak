// The reef-activation sensitivity instrument's gate (MEASUREMENT_LESSONS 4):
// scripts/measure_reef_activation_sensitivity.mjs serves bed.js with four
// constants parameterised in memory. At zero knobs that source must BE the
// shipped bake — same activation H0, same reef fit — or every sensitivity it
// reports is a sensitivity of a twin. Pinned here:
//   1. each patch pattern still occurs exactly once in bed.js (drift there must
//      fail here, not silently sweep a constant that moved)
//   2. the patched-at-zero activation equals measure_break_activation.mjs's at
//      every mapped spot, and the fit's beta / crest target are the shipped ones
//   3. the knobs actually reach the bake (a shallower crest lowers activation)
//   4. the instrument imports no renderer file
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const S = await import('../scripts/measure_reef_activation_sensitivity.mjs');
const { PRESETS } = await import('../shared/params.js');

const BED = readFileSync(new URL('../web-three/js/bed.js', import.meta.url), 'utf8');
const SRC = readFileSync(new URL('../scripts/measure_reef_activation_sensitivity.mjs', import.meta.url), 'utf8');

test('every patch pattern occurs exactly once in bed.js', () => {
  assert.equal(S.PATCHES.length, 4);
  for (const p of S.PATCHES) {
    assert.equal(S.countOccurrences(BED, p.find), 1, `patch "${p.name}": pattern not unique or missing in bed.js`);
  }
  // the patched source still parses as the same module: prelude + one
  // substitution per patch, nothing else
  const patched = S.patchBedSource(BED, {});
  for (const p of S.PATCHES) assert.equal(S.countOccurrences(patched, p.replace), 1, `patch "${p.name}" not applied`);
  assert.ok(patched.startsWith('const __SWEEP = '), 'prelude first');
});

test('patched-at-zero bake reproduces the shipped instrument at every mapped spot', async () => {
  const g = await S.gate();
  assert.equal(g.rows.length, 6);
  for (const r of g.rows) {
    assert.equal(r.dH0, 0, `${r.key}: activation ${r.patchedH0} vs instrument ${r.refH0}`);
    assert.equal(r.dBeta, 0, `${r.key}: reef fit beta differs`);
    assert.equal(r.dTargetEl, 0, `${r.key}: crest target differs`);
    // activation IS the shallowest wedge cell: closed form equals the bisection
    assert.ok(r.dClosed < 1e-6, `${r.key}: closed form off by ${r.dClosed}`);
  }
  assert.ok(g.pass);
});

test('the knobs reach the bake, and instances do not share state', async () => {
  const T = PRESETS.sewers.T;
  const shipped = S.activationOn(await S.bedFor({}), 'sewers', { T }).H0;
  const shallower = S.activationOn(await S.bedFor({ crestDeltaM: -0.5 }), 'sewers', { T }).H0;
  const deeper = S.activationOn(await S.bedFor({ crestDeltaM: 0.5 }), 'sewers', { T }).H0;
  assert.ok(shallower < shipped && shipped < deeper, `monotone in crest depth: ${shallower} < ${shipped} < ${deeper}`);
  // an amplitude-only instance must not mutate the shipped one (the query
  // carries ampM so the module URL differs)
  await S.bedFor({ ampM: 9.6 });
  assert.equal(S.activationOn(await S.bedFor({}), 'sewers', { T }).H0, shipped, 'shipped instance mutated by an amp sweep');
  // the ceiling binds: below it a shallower crest stops moving activation
  const atCeil = S.activationOn(await S.bedFor({ crestDeltaM: -2.0 }), 'jacks', { T: PRESETS.jacks.T }).H0;
  assert.equal(atCeil, S.activationOn(await S.bedFor({}), 'jacks', { T: PRESETS.jacks.T }).H0, "Jack's is ceiling-limited at the shipped crest");
});

test('the instrument touches no renderer file', () => {
  assert.ok(!/model-glsl|shaders\.js|main\.js/.test(SRC), 'instrument-only: no renderer imports');
});
