// The break-field instrument's reproduction gate (MEASUREMENT_LESSONS 4):
// scripts/measure_break_activation.mjs rebuilds the shipped break line from
// the exported excess field F(x, z) and must reproduce bed.js bakeBreakLine
// bit-for-bit on the readback grid, or every continuous-representation
// comparison it makes is a comparison against a twin.
//
// Pinned here, per mapped spot, at the card state AND at both sides of the
// spot's measured branch flip (the states where a selection replica is most
// likely to diverge):
//   1. the exported field equals bed.js breakExcessProfile on the same lattice
//   2. the replica selected line equals the bake through breakZAt (2 m grid)
//   3. the replica gap flags equal breakGapAt
//   4. the phase twin reproduces derivedAlphaDeg along the shipped line
// plus the constants the instrument mirrors from bed.js/main.js, read off
// the source so a drift there fails here instead of producing a quiet twin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const I = await import('../scripts/measure_break_activation.mjs');
const { PRESETS, PEEL_FLOOR } = await import('../shared/params.js');

const BED = readFileSync(new URL('../web-three/js/bed.js', import.meta.url), 'utf8');
const MAIN = readFileSync(new URL('../web-three/js/main.js', import.meta.url), 'utf8');
const SRC = readFileSync(new URL('../scripts/measure_break_activation.mjs', import.meta.url), 'utf8');

test('the instrument mirrors the bake constants it cannot import', () => {
  // assert.ok(re.test(...)) rather than assert.match: a failure must name the
  // constant, not print 70 KB of bed.js.
  const has = (src, re, what) => assert.ok(re.test(src), `${what}: pattern ${re} not found in source`);
  has(BED, new RegExp(`const BREAK_N = ${I.BREAK_N};`), 'BREAK_N');
  has(BED, new RegExp(`const MARCH_DZ = ${I.MARCH_DZ};`), 'MARCH_DZ');
  has(BED, new RegExp(`const REEF_ANCHOR_X = ${I.REEF_ANCHOR_X};`), 'REEF_ANCHOR_X');
  has(BED, new RegExp(`const SLEW_M_PER_M = ${I.SLEW_M_PER_M.toFixed(1)};`), 'SLEW_M_PER_M');
  has(BED, new RegExp(`\\) / dxTex >= ${I.GAP_SLOPE}\\)`), 'gap slope threshold');
  has(MAIN, new RegExp(`>= ${I.GAP_SLOPE}\\)`), 'stageAlpha pinned threshold');
  has(BED, new RegExp(`if \\(depth <= ${I.BEACH_DEPTH_M}\\) return null;`), 'beach cutoff');
  has(BED, /breakArr = new Float32Array\(BREAK_N\)/, 'the bake stores float32; the replica must too');
  has(SRC, /new Float32Array\(BREAK_N\)/, 'replica float32 storage');
  const stageW = Number(MAIN.match(/const STAGE_W = (\d+)/)[1]);
  assert.deepEqual(I.X_RANGE, [-stageW / 2, stageW / 2]);
  // the shipped bake path the replica mirrors: peeldir and smooth default OFF
  has(MAIN, /let peelDirEnabled = false;/, 'peeldir default');
  has(MAIN, /let smoothEnabled = false;/, 'smooth default');
});

test('the instrument touches no renderer file', () => {
  assert.ok(!/model-glsl|shaders\.js/.test(SRC), 'slices 1-2 are instrument-only: no renderer imports');
});

test('replica line == shipped bake at card and flip states, all six mapped spots', () => {
  assert.equal(I.MAPPED.length, 6);
  for (const key of I.MAPPED) {
    const f = PEEL_FLOOR[key];
    const states = [I.cardOf(key),
      { H0: f.flipLo, T: f.basisT, tide: f.basisTideM }, { H0: f.flipHi, T: f.basisT, tide: f.basisTideM }];
    for (const st of states) {
      const inst = I.instrumentState(key, st);
      const g = inst.gate;
      assert.equal(g.latticeMismatch, 0, `${key} ${JSON.stringify(st)}: field lattice differs from the bake's march`);
      assert.equal(g.fieldMaxAbsDiff, 0, `${key} ${JSON.stringify(st)}: exported F differs from breakExcessProfile`);
      assert.ok(g.maxDzM <= 1e-9, `${key} ${JSON.stringify(st)}: replica line off the bake by ${g.maxDzM} m`);
      assert.equal(g.gapMismatch, 0, `${key} ${JSON.stringify(st)}: gap flags differ`);
      assert.ok(g.alphaMaxAbsDiff <= 1e-9, `${key} ${JSON.stringify(st)}: phase twin alpha off by ${g.alphaMaxAbsDiff} deg`);
    }
  }
});

test('the shipped representation is the bake, and the others are not it', () => {
  // A representation that silently collapses onto the shipped branch would pass
  // every continuity gate by inheritance. At the card state the continuous
  // forms must differ from the selected line somewhere on the stage.
  const inst = I.instrumentState('secondpeak', I.cardOf('secondpeak'));
  const rs = I.repSummary(inst, 1);
  assert.equal(I.maxAbsDiff(rs.shipped.zStage, inst.real.z), 0);
  for (const name of ['centroidAll', 'ridgeOnset', 'bandCenter'])
    assert.ok(I.maxAbsDiff(rs[name].zStage, inst.real.z) > 1, `${name} is indistinguishable from the shipped line`);
});

test('the reef fit the replica anchors on is still the legacy one', () => {
  // Slice 4 (canonical refit) has not happened; the instrument must be reading
  // the bake as shipped, not a refit.
  const inst = I.instrumentState('sewers', I.cardOf('sewers'));
  assert.equal(inst.fit.fitMetric, 'legacy-break-line-bearing');
  assert.equal(inst.fit.canonicalFitDeferred, true);
  assert.equal(PRESETS.sewers.geoSpot, inst.spot);
});
