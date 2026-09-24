// The baked reef table (data/model/pp_reef_fit.json) and the intertidal crest
// policy it is fitted under (research/REEF_REFIT_2026-09-24.md).
//
// The table is a MEASUREMENT of the bake by scripts/fit_reef.mjs, and a
// measurement carries its basis. This file does not trust the table's numbers;
// it re-bakes the card state and the field-day cells headlessly through the
// same reductions the search used and asserts the table still describes the
// bake it was fitted against — the same discipline tests/peel-floor.test.js
// applies to PEEL_FLOOR. When the bed, the physics or the presets move, this
// fails naming the re-run instead of shipping a wedge fitted to a model that
// no longer exists.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const F = await import('../scripts/fit_reef.mjs');
const bed = await import('../web-three/js/bed.js');
import { PRESETS } from '../shared/params.js';

const TABLE = JSON.parse(readFileSync(new URL('../data/model/pp_reef_fit.json', import.meta.url), 'utf8'));
const RE_FIT = 're-run `node scripts/fit_reef.mjs --mode=fit` per spot, then `--mode=table`, and update REEF_REFIT_2026-09-24.md';
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
const sha = (p) => createHash('sha1').update(readFileSync(new URL(`../${p}`, import.meta.url))).digest('hex').slice(0, 16);

test('the table carries a row for every mapped spot, inside the search lattice, with its basis', () => {
  assert.equal(TABLE.version, 1);
  assert.match(TABLE.generated, /^\d{4}-\d{2}-\d{2}$/, 'the table must carry the date it was fitted');
  assert.equal(TABLE.instrument, 'scripts/fit_reef.mjs --mode=fit --write');
  assert.ok(near(TABLE.crestCeilEl, bed.REEF_CREST_CEIL_EL, 1e-3), `the table was fitted under a ${TABLE.crestCeilEl} m ceiling; bed.js now caps at ${bed.REEF_CREST_CEIL_EL}`);
  assert.equal(F.MAPPED.length, 7);
  for (const key of F.MAPPED) {
    const row = TABLE.spots[PRESETS[key].geoSpot];
    assert.ok(row, `${key}: no table row for ${PRESETS[key].geoSpot}`);
    assert.equal(row.preset, key);
    assert.equal(row.targetDeg, PRESETS[key].alpha, `${key}: the table's alpha target drifted from the preset`);
    assert.ok(row.crestDepthM >= TABLE.lattice.crestMinM - 1e-9 && row.crestDepthM <= TABLE.lattice.crestMaxM + 1e-9, `${key}: crest ${row.crestDepthM} outside the lattice`);
    assert.ok(row.betaDeg >= TABLE.lattice.betaRange[0] && row.betaDeg <= TABLE.lattice.betaRange[1], `${key}: beta ${row.betaDeg} outside the lattice`);
    assert.ok(Number.isFinite(row.cardAlphaDeg) && Number.isFinite(row.reversalsOffRamp));
    // the ceiling is where the crest search starts: MSL - ceiling
    assert.ok(near(TABLE.lattice.crestMinM, bed.MSL_ABOVE_NAVD88 - bed.REEF_CREST_CEIL_EL, 1e-3));
  }
  // the physics and the bed the table was fitted against are the ones on disk
  for (const p of ['data/model/pp_depth_patches.js', 'data/model/pp_geo_profiles.js', 'web-three/js/dispersion.js', 'web-three/js/peel-geometry.js'])
    assert.equal(TABLE.fittedAgainst[p], sha(p), `${p} changed since the table was fitted — ${RE_FIT}`);
});

test('bed.js builds the shipped wedge from the table, and the bake still reads what the table says', () => {
  for (const key of F.MAPPED) {
    const spot = PRESETS[key].geoSpot, row = TABLE.spots[spot];
    const fit = bed.reefFitFor(spot);
    assert.equal(fit.source, 'data/model/pp_reef_fit.json', `${key}: the shipped wedge is not the table's`);
    assert.equal(fit.fitMetric, 'canonical-stage-alpha-table');
    assert.equal(fit.canonicalFitDeferred, false, 'the MIGRATION GUARD is retired on the table arm');
    assert.equal(fit.betaDeg, row.betaDeg);
    assert.ok(near(fit.crestDepthM, row.crestDepthM, 1e-9));
    assert.equal(fit.zRef, row.zRef, `${key}: the anchor moved`);
    assert.ok(near(fit.targetEl, row.targetEl, 1e-3));
    assert.equal(fit.fitDerivedDeg, row.cardAlphaDeg, 'fitDerivedDeg is the canonical card alpha the table was accepted at');
    assert.ok(Number.isFinite(fit.legacyDerivedDeg), 'the legacy five-station bearing is carried beside it');
    // re-bake the card: the canonical stage-median signed alpha and the
    // reversal count the table records must be what the bake reads today
    const p = PRESETS[key];
    const card = F.readState(key, { H0: p.H0, T: p.T, tide: 0 });
    assert.ok(near(card.alpha, row.cardAlphaDeg, 0.051), `${key}: card alpha ${card.alpha} vs table ${row.cardAlphaDeg} — the bake moved under the table; ${RE_FIT}`);
    assert.ok(near(card.onReef, row.cardOnReef, 0.0051), `${key}: card on-reef ${card.onReef} vs table ${row.cardOnReef}`);
    const band = F.bandAt(key, 0);
    assert.equal(`${band.healthyN}/${band.rungs.length}`, row.bandHealthy, `${key}: band ${band.healthyN}/${band.rungs.length} vs table ${row.bandHealthy} — ${RE_FIT}`);
    assert.equal(band.reversalsOffRamp + card.reversalsOffRamp, row.reversalsOffRamp, `${key}: reversals moved — ${RE_FIT}`);
  }
});

test('Second Peak: the 2026-08-15 field-day cells read what the table was accepted on', () => {
  const row = TABLE.spots['Second Peak'];
  assert.ok(row.fieldCells && row.fieldCells.length === 2, 'the Second Peak row must carry the two field-day cells');
  const cells = F.fieldCells('secondpeak');
  for (let i = 0; i < 2; i++) {
    assert.ok(near(cells[i].alpha, row.fieldCells[i].alpha, 0.051), `${F.FIELD_CELLS[i].label}: alpha ${cells[i].alpha} vs table ${row.fieldCells[i].alpha} — ${RE_FIT}`);
    assert.ok(near(cells[i].Vp, row.fieldCells[i].Vp, 0.051), `${F.FIELD_CELLS[i].label}: Vp ${cells[i].Vp} vs table ${row.fieldCells[i].Vp}`);
  }
  assert.equal(`${cells.filter((c) => c.ok).length}/2`, row.fieldOk);
  // the reason the refit exists: both cells are a peel at Walker's 30 deg
  // with the peel speed inside the cam's bracket (PEEL_BAND_FIELD §4)
  for (const c of cells) {
    assert.ok(c.alpha >= F.FIELD_ALPHA_MIN_DEG, `${c.label}: alpha ${c.alpha} < ${F.FIELD_ALPHA_MIN_DEG}`);
    assert.ok(c.Vp >= F.OBSERVED.Vp_mps[0] && c.Vp <= F.OBSERVED.Vp_mps[1], `${c.label}: Vp ${c.Vp} outside ${F.OBSERVED.Vp_mps}`);
    assert.ok(c.onReef >= F.ON_REEF_MIN, `${c.label}: on-reef ${c.onReef}`);
  }
});

test('a spot missing from the table falls back to the live legacy fit, with the old cap', () => {
  const spot = PRESETS.jacks.geoSpot;
  const fromTable = bed.reefFitFor(spot);
  const tableChk = bed.reefAudit(spot).checksum;
  assert.equal(bed.reefFitFor('Nowhere'), null, 'an unmapped name has no grid and no fit');
  // the override path IS the table path: a candidate handed in with the
  // table's own numbers is drawn bit-for-bit as the baked row
  bed.setReefFitOverride(spot, { crestDepthM: fromTable.crestDepthM, betaDeg: fromTable.betaDeg, cardAlphaDeg: fromTable.fitDerivedDeg, reversalsOffRamp: 0 });
  try {
    assert.equal(bed.reefFitFor(spot).source, 'override');
    assert.equal(bed.reefAudit(spot).checksum, tableChk, 'the override path drew a different grid from the table path');
  } finally { bed.setReefFitOverride(spot, null); }
  assert.equal(bed.reefFitFor(spot).source, 'data/model/pp_reef_fit.json');
  assert.equal(bed.reefAudit(spot).checksum, tableChk);
  // the fallback: with the row withheld the live legacy fit runs under the old cap
  const src = readFileSync(new URL('../web-three/js/bed.js', import.meta.url), 'utf8');
  assert.match(src, /const crestCeil = row \? REEF_CREST_CEIL_EL : REEF_CEIL_EL;/, 'a spot without a row must take the legacy cap');
  assert.match(src, /fitOverride\.get\(name\) \?\? PP_REEF_FIT\.spots\?\.\[name\] \?\? null/, 'the table is the source of the row');
});
