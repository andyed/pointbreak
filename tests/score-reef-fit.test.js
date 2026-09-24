// The reef scorecard's reproduction gate (MEASUREMENT_LESSONS 4): on the
// shipped bake with zero knobs, scripts/score_reef_fit.mjs must reproduce
// the records each instrument already published, number for number —
// PEEL_FLOOR (shared/params.js), qa/break-field/summary.json (activation),
// docs/research/assets/physics-core-2026-09-23/summary.json (R4 windows),
// sentinel2-locus-2026-09-23/residuals.json, lookout-locus-2026-09-23/
// residual.json and peel-band-2026-09-24/field.json (the 2026-08-15 cells).
//
// Kept fast (~15 s) by scoring a SUBSET: two spots (Sharks, the shortest
// ladder; Second Peak, the field-day spot) without their tide bands (the
// bands are ~20k gated bakes across the bank, ~7 min — the full run is
// `node scripts/score_reef_fit.mjs`, whose gate prints first and covers all
// seven spots and the bands). The Sentinel-2 and Lookout instruments run for
// every spot here since they are cheap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const S = await import('../scripts/score_reef_fit.mjs');
const { PEEL_FLOOR } = await import('../shared/params.js');
const KB = await import('../scripts/lib/reef-knobs.mjs');
const PB = await import('../scripts/measure_peel_band_field.mjs');

const { PRESETS } = await import('../shared/params.js');
const asset = (rel) => JSON.parse(readFileSync(new URL(`../docs/research/assets/${rel}`, import.meta.url), 'utf8'));

test('the scorecard sees the seven shipped presets with a reef fit, and no knobs', () => {
  assert.equal(S.KEYS.length, 7, `expected 7 mapped presets, got ${S.KEYS.join(', ')}`);
  assert.equal(KB.hasKnobs(S.KNOBS), false, 'the test must import the scorecard with zero knobs');
  assert.equal(KB.activeReefKnobs(), null);
  assert.equal(S.BED_SOURCE, '', 'the gate is defined on the shipped bed');
});

test('the shipped reef invariants hold at every spot (dry 0, above -0.5 m 0), and the MLLW+0.1 m count is reported', () => {
  for (const key of S.KEYS) {
    const a = S.reefAuditAt(PRESETS[key].geoSpot);
    assert.ok(a, `${key}: audit`);
    assert.equal(a.dryTouched, 0, `${key}: dry posts touched`);
    assert.equal(a.aboveOldCeil, 0, `${key}: wet posts above -0.5 m NAVD88`);
    assert.equal(a.aboveMllw01, 0, `${key}: wet posts above +0.143 m NAVD88 — the shipped -0.5 m ceiling is below it`);
    assert.ok(a.postsTouched > 0, `${key}: the wedge augments the grid`);
  }
  assert.equal(S.NEW_CEIL_EL, 0.143, 'MLLW + 0.1 m about NAVD88 (MSL 0.905 - 0.862 + 0.1)');
});
const run = await (async () => {
  const t0 = Date.now();
  const r = await S.run({ keys: ['sharks', 'secondpeak'], fast: true });
  r.wallS = (Date.now() - t0) / 1000;
  return r;
})();

test('gate: the subset reproduces every published record it touches', () => {
  assert.equal(run.gate.applicable, true);
  const bad = run.gate.mismatches.map((m) => `${m.record} ${m.key} ${m.field}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.got)}`);
  assert.deepEqual(bad, [], `gate mismatches:\n${bad.join('\n')}`);
  assert.ok(run.gate.checked >= 150, `the gate should check well over a hundred numbers on this subset (checked ${run.gate.checked})`);
});

test('PEEL_FLOOR: Sharks and Second Peak floors, flips and digests re-measure to the table', () => {
  for (const s of run.spots) {
    const pf = PEEL_FLOOR[s.key];
    assert.equal(s.floor.floorH0, pf.floorH0, `${s.key} floor`);
    assert.equal(s.floor.floorLo, pf.floorLo);
    assert.equal(s.floor.bakeDigest, pf.bakeDigest, `${s.key} bake digest`);
    assert.equal(s.floor.flipLo, pf.flipLo);
    assert.equal(s.floor.flipHi, pf.flipHi);
    assert.equal(s.band.band, null, 'bands are skipped in --fast (the full run measures them)');
  }
});

test('the 2026-08-15 cells read what peel-band field.json recorded (alpha 9.7 / Vp 24.2 / on-reef 0; 7.3 / 34.7 / 0)', () => {
  const sp = run.spots.find((s) => s.key === 'secondpeak');
  const rec = asset('peel-band-2026-09-24/field.json').observedCells;
  for (const c of sp.fieldDay) {
    const o = rec.find((r) => r.bed === 'reef' && r.T === c.T && Math.abs(r.H0 - c.H0) < 1e-6 && Math.abs(r.tide - c.tide) < 1e-6);
    assert.ok(o, `${c.H0}/${c.tide}: recorded cell`);
    for (const k of ['alpha', 'Vp', 'c', 'onReef']) assert.equal(c[k], o[k], `${c.H0}/${c.tide} ${k}`);
    assert.equal(c.pass, false, 'the shipped wedge is inert on the day (PEEL_BAND_FIELD §6)');
  }
  assert.match(sp.verdict.line, /^FAIL — 2026-08-15 field-day cells/);
});

test('Sentinel-2: the reef arm scores 4 / 24 / 6 on the shipped bake, as residuals.json records', () => {
  const rec = asset('sentinel2-locus-2026-09-23/residuals.json').summary.score;
  assert.deepEqual(run.sentinel.score, rec);
  assert.equal(run.sentinel.cells, 28);
});

test('Lookout: Jack\'s residual re-forms residual.json to the rounding of the recorded points', () => {
  const rec = asset('lookout-locus-2026-09-23/residual.json');
  let worst = 0, n = 0;
  for (const arm of rec.arms) {
    const got = run.lookout.arms.find((a) => a.h0Arm === arm.h0Arm && a.bed === arm.bed);
    assert.ok(got, `${arm.h0Arm}/${arm.bed}`);
    for (const [feat, fe] of Object.entries(arm.features)) {
      const g = got.features[feat];
      assert.equal(g.n, fe.n, `${arm.h0Arm}/${arm.bed} ${feat} n`);
      if (fe.d_range_median === null) { assert.equal(g.d_range_median, null); continue; }
      n++;
      worst = Math.max(worst, Math.abs(g.d_range_median - fe.d_range_median));
    }
  }
  assert.ok(n > 40, `features compared: ${n}`);
  assert.ok(worst <= 0.0151, `worst |d_range_median| deviation ${worst} m (the recorded photo points are 2-dp rounded)`);
  const wa = run.lookout.arms.find((a) => a.h0Arm === 'raw' && a.bed === 'reef').features.whitewater_edge_wave_a.d_range_median;
  assert.equal(wa, rec.arms.find((a) => a.h0Arm === 'raw' && a.bed === 'reef').features.whitewater_edge_wave_a.d_range_median);
});

test('the knob hook at zero knobs reproduces the shipped bake bit-for-bit at the field-day cells', async () => {
  const bedZero = await KB.bedFor({});
  const g = PB.gate(bedZero, [{ H0: 0.778, T: 16, tide: 0.5 }, { H0: 0.914, T: 16, tide: 0.357 }]);
  assert.equal(g.pass, true, `patched-at-zero vs shipped: worst ${g.worst}`);
  assert.equal(KB.PATCHES.length, 6);
});

test('the H0 window\'s x1.0 rung is the card, and the verdict names its first failing criterion', () => {
  for (const s of run.spots) {
    const r1 = s.window.rungs.find((r) => r.mult === 1);
    assert.ok(Math.abs(r1.alpha - s.card.alpha) < 0.01, `${s.key}: window x1.0 alpha ${r1.alpha} vs card ${s.card.alpha}`);
    assert.equal(r1.healthy, s.card.healthy);
    assert.equal(typeof s.verdict.line, 'string');
    assert.equal(s.verdict.checks.length, S.CRITERIA.length);
  }
  const sharks = run.spots.find((s) => s.key === 'sharks');
  assert.equal(sharks.verdict.pass, true, `Sharks passes every gated criterion on the shipped bake: ${sharks.verdict.line}`);
  assert.equal(sharks.window.pass, false, 'and still fails the 0.7x rungs of its H0 window (reported, not gated)');
});

test('subset wall time stays in test range', () => {
  assert.ok(run.wallS < 60, `subset took ${run.wallS.toFixed(1)} s`);
});
