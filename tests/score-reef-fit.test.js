// The reef scorecard's reproduction gate (MEASUREMENT_LESSONS 4): on each
// reef arm with zero knobs, scripts/score_reef_fit.mjs must reproduce the
// records published ON THAT ARM, number for number.
//
//   legacy  the pre-refit bake (#reef=legacy, bit-for-bit — see
//           tests/reef-legacy-parity.test.js): PEEL_FLOOR_LEGACY, the legacy
//           scorecard's activation (qa/reef-fit/score.legacy.json), the
//           physics-core R4 windows, sentinel2-locus residuals.json,
//           lookout-locus residual.json and peel-band field.json — the
//           dated notes' assets, all measured on that bake.
//   table   the shipped bake since the 2026-09-24 refit: PEEL_FLOOR, the
//           standing qa/break-field/summary.json activation, the field-day
//           cells and card alpha the table was accepted at
//           (data/model/pp_reef_fit.json) and the table scorecard's
//           Sentinel-2 verdicts (qa/reef-fit/score.table.json).
//
// Kept fast (~30 s) by scoring a SUBSET on each arm: two spots (Sharks, the
// shortest ladder; Second Peak, the field-day spot) without their tide bands
// (the bands are ~20k gated bakes across the bank, ~7 min — the full run is
// `node scripts/score_reef_fit.mjs [--reef=legacy]`, whose gate prints first
// and covers all seven spots and the bands). The Sentinel-2 and Lookout
// instruments run for every spot here since they are cheap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const S = await import('../scripts/score_reef_fit.mjs');
const { PEEL_FLOOR, PEEL_FLOOR_LEGACY } = await import('../shared/params.js');
const KB = await import('../scripts/lib/reef-knobs.mjs');
const PB = await import('../scripts/measure_peel_band_field.mjs');
const bed = await import('../web-three/js/bed.js');

const { PRESETS } = await import('../shared/params.js');
const asset = (rel) => JSON.parse(readFileSync(new URL(`../docs/research/assets/${rel}`, import.meta.url), 'utf8'));
const local = (rel) => JSON.parse(readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8'));

test('the scorecard sees the seven shipped presets with a reef fit, and no knobs', () => {
  assert.equal(S.KEYS.length, 7, `expected 7 mapped presets, got ${S.KEYS.join(', ')}`);
  assert.equal(KB.hasKnobs(S.KNOBS), false, 'the test must import the scorecard with zero knobs');
  assert.equal(KB.activeReefKnobs(), null);
  assert.equal(S.BED_SOURCE, '', 'the gate is defined on the shipped bed');
  assert.equal(bed.getReefFitMode(), 'table', 'the shipped default is the table arm');
});

test('the reef invariants hold at every spot on the table arm (dry 0, above MLLW+0.1 m 0); the count above the old cap is reported', () => {
  for (const key of S.KEYS) {
    const a = S.reefAuditAt(PRESETS[key].geoSpot);
    assert.ok(a, `${key}: audit`);
    assert.equal(a.dryTouched, 0, `${key}: dry posts touched`);
    assert.equal(a.aboveMllw01, 0, `${key}: wet posts above +0.143 m NAVD88 — the intertidal crest cap`);
    assert.ok(Number.isFinite(a.aboveOldCeil), `${key}: posts above the old -0.5 m cap must be counted`);
    assert.ok(a.postsTouched > 0, `${key}: the wedge augments the grid`);
  }
  assert.equal(S.NEW_CEIL_EL, 0.143, 'MLLW + 0.1 m about NAVD88 (MSL 0.905 - 0.862 + 0.1)');
  assert.equal(S.NEW_CEIL_EL, +bed.REEF_CREST_CEIL_EL.toFixed(3), 'the scorecard\'s ceiling is bed.js\'s');
});

// ---------- the table arm (shipped) ----------
const runTable = await (async () => {
  const t0 = Date.now();
  const r = await S.run({ keys: ['sharks', 'secondpeak'], fast: true });
  r.wallS = (Date.now() - t0) / 1000;
  return r;
})();

test('gate (table arm): the subset reproduces every re-measured record it touches', () => {
  assert.equal(runTable.gate.applicable, true);
  assert.equal(runTable.gate.arm, 'table');
  const bad = runTable.gate.mismatches.map((m) => `${m.record} ${m.key} ${m.field}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.got)}`);
  assert.deepEqual(bad, [], `gate mismatches:\n${bad.join('\n')}`);
  assert.ok(runTable.gate.checked >= 40, `the gate should check dozens of numbers on this subset (checked ${runTable.gate.checked})`);
});

test('PEEL_FLOOR (table arm): Sharks and Second Peak floors, flips and digests re-measure to the table', () => {
  for (const s of runTable.spots) {
    const pf = PEEL_FLOOR[s.key];
    assert.equal(s.floor.floorH0, pf.floorH0, `${s.key} floor`);
    assert.equal(s.floor.floorLo, pf.floorLo);
    assert.equal(s.floor.bakeDigest, pf.bakeDigest, `${s.key} bake digest`);
    assert.equal(s.floor.flipLo, pf.flipLo);
    assert.equal(s.floor.flipHi, pf.flipHi);
    assert.equal(s.band.band, null, 'bands are skipped in --fast (the full run measures them)');
  }
});

test('the 2026-08-15 cells on the table arm read what pp_reef_fit.json was accepted at, and pass', () => {
  const sp = runTable.spots.find((s) => s.key === 'secondpeak');
  const row = local('data/model/pp_reef_fit.json').spots['Second Peak'];
  for (let i = 0; i < sp.fieldDay.length; i++) {
    const c = sp.fieldDay[i];
    assert.ok(Math.abs(c.alpha - row.fieldCells[i].alpha) <= 0.051, `${c.H0}/${c.tide} alpha ${c.alpha} vs table ${row.fieldCells[i].alpha}`);
    assert.ok(Math.abs(c.Vp - row.fieldCells[i].Vp) <= 0.051, `${c.H0}/${c.tide} Vp ${c.Vp} vs table ${row.fieldCells[i].Vp}`);
    assert.equal(c.pass, true, `${c.H0}/${c.tide}: ${c.fails?.join('+')} — the refit wedge must reproduce the day (REEF_REFIT_2026-09-24)`);
  }
  assert.equal(sp.verdict.pass, true, sp.verdict.line);
});

test('Sentinel-2 (table arm): the reef arm scores what qa/reef-fit/score.table.json records', () => {
  const rec = local('qa/reef-fit/score.table.json').sentinel.score;
  assert.deepEqual(runTable.sentinel.score, rec);
  assert.equal(runTable.sentinel.cells, 28);
  // and never worse than the pre-refit 4 contradicted (the refit's acceptance bar)
  const pre = asset('sentinel2-locus-2026-09-23/residuals.json').summary.score.reef.contradicted;
  assert.ok(runTable.sentinel.score.reef.contradicted <= pre, `reef contradicted ${runTable.sentinel.score.reef.contradicted} > pre-refit ${pre}`);
});

// ---------- the legacy arm (the pre-refit bake) ----------
const runLegacy = await (async () => {
  const t0 = Date.now();
  const r = await S.run({ keys: ['sharks', 'secondpeak'], fast: true, reef: 'legacy' });
  r.wallS = (Date.now() - t0) / 1000;
  S.applyReefArm('table');
  return r;
})();

test('gate (legacy arm): the subset reproduces every pre-refit record it touches', () => {
  assert.equal(runLegacy.gate.applicable, true);
  assert.equal(runLegacy.gate.arm, 'legacy');
  const bad = runLegacy.gate.mismatches.map((m) => `${m.record} ${m.key} ${m.field}: expected ${JSON.stringify(m.expected)}, got ${JSON.stringify(m.got)}`);
  assert.deepEqual(bad, [], `gate mismatches:\n${bad.join('\n')}`);
  assert.ok(runLegacy.gate.checked >= 150, `the gate should check well over a hundred numbers on this subset (checked ${runLegacy.gate.checked})`);
  assert.equal(bed.getReefFitMode(), 'table', 'the arm is switched back after the legacy run');
});

test('PEEL_FLOOR_LEGACY: Sharks and Second Peak floors, flips and digests re-measure to the pre-refit table', () => {
  for (const s of runLegacy.spots) {
    const pf = PEEL_FLOOR_LEGACY[s.key];
    assert.equal(s.floor.floorH0, pf.floorH0, `${s.key} floor`);
    assert.equal(s.floor.floorLo, pf.floorLo);
    assert.equal(s.floor.bakeDigest, pf.bakeDigest, `${s.key} bake digest`);
    assert.equal(s.floor.flipLo, pf.flipLo);
    assert.equal(s.floor.flipHi, pf.flipHi);
  }
});

test('the 2026-08-15 cells on the legacy arm read what peel-band field.json recorded (alpha 9.7 / Vp 24.2 / on-reef 0; 7.3 / 34.7 / 0)', () => {
  const sp = runLegacy.spots.find((s) => s.key === 'secondpeak');
  const rec = asset('peel-band-2026-09-24/field.json').observedCells;
  for (const c of sp.fieldDay) {
    const o = rec.find((r) => r.bed === 'reef' && r.T === c.T && Math.abs(r.H0 - c.H0) < 1e-6 && Math.abs(r.tide - c.tide) < 1e-6);
    assert.ok(o, `${c.H0}/${c.tide}: recorded cell`);
    for (const k of ['alpha', 'Vp', 'c', 'onReef']) assert.equal(c[k], o[k], `${c.H0}/${c.tide} ${k}`);
    assert.equal(c.pass, false, 'the pre-refit wedge is inert on the day (PEEL_BAND_FIELD §6)');
  }
  assert.match(sp.verdict.line, /^FAIL — 2026-08-15 field-day cells/);
});

test('Sentinel-2 (legacy arm): the reef arm scores 4 / 24 / 6, as residuals.json records', () => {
  const rec = asset('sentinel2-locus-2026-09-23/residuals.json').summary.score;
  assert.deepEqual(runLegacy.sentinel.score, rec);
  assert.equal(runLegacy.sentinel.cells, 28);
});

test('Lookout (legacy arm): Jack\'s residual re-forms residual.json to the rounding of the recorded points', () => {
  const rec = asset('lookout-locus-2026-09-23/residual.json');
  let worst = 0, n = 0;
  for (const arm of rec.arms) {
    const got = runLegacy.lookout.arms.find((a) => a.h0Arm === arm.h0Arm && a.bed === arm.bed);
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
  const wa = runLegacy.lookout.arms.find((a) => a.h0Arm === 'raw' && a.bed === 'reef').features.whitewater_edge_wave_a.d_range_median;
  assert.equal(wa, rec.arms.find((a) => a.h0Arm === 'raw' && a.bed === 'reef').features.whitewater_edge_wave_a.d_range_median);
});

test('the knob hook at zero knobs reproduces the shipped (table) bake bit-for-bit at the field-day cells', async () => {
  const bedZero = await KB.bedFor({});
  const g = PB.gate(bedZero, [{ H0: 0.778, T: 16, tide: 0.5 }, { H0: 0.914, T: 16, tide: 0.357 }]);
  assert.equal(g.pass, true, `patched-at-zero vs shipped: worst ${g.worst}`);
  assert.equal(KB.PATCHES.length, 6);
});

test('the H0 window\'s x1.0 rung is the card, and the verdict names its first failing criterion', () => {
  for (const run of [runTable, runLegacy]) for (const s of run.spots) {
    const r1 = s.window.rungs.find((r) => r.mult === 1);
    assert.ok(Math.abs(r1.alpha - s.card.alpha) < 0.01, `${s.key}: window x1.0 alpha ${r1.alpha} vs card ${s.card.alpha}`);
    assert.equal(r1.healthy, s.card.healthy);
    assert.equal(typeof s.verdict.line, 'string');
    assert.equal(s.verdict.checks.length, S.CRITERIA.length);
  }
  const sharks = runLegacy.spots.find((s) => s.key === 'sharks');
  assert.equal(sharks.verdict.pass, true, `Sharks passes every gated criterion on the pre-refit bake: ${sharks.verdict.line}`);
  assert.equal(sharks.window.pass, false, 'and still fails the 0.7x rungs of its H0 window on that arm (reported, not gated)');
  const sharksT = runTable.spots.find((s) => s.key === 'sharks');
  assert.equal(sharksT.verdict.pass, true, sharksT.verdict.line);
  assert.equal(sharksT.window.pass, true, 'on the table arm Sharks\' whole 0.7-1.3x window is a peel');
});

test('subset wall time stays in test range', () => {
  assert.ok(runTable.wallS + runLegacy.wallS < 90, `subsets took ${(runTable.wallS + runLegacy.wallS).toFixed(1)} s`);
});
