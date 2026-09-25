// Second Peak breaks on the field day — pinned so a bake change cannot
// quietly bring back the curl jury's "nothing breaks" (CURL_JURY_2026-09-24
// §3.1; research/SECONDPEAK_FIELDDAY_2026-09-24.md).
//
// Three forcings have been typed for 2026-08-15 at Second Peak: the jury's
// hash (day=big&h0=1.4&tide=0.732, the morning loop's numbers), and the 15:28
// clip's two cells (Surfline 0.914 m at the predicted +0.357; SC116 0.778 m at
// the verified +0.500, both T 16). On the shipped (table) reef arm every one
// is a peel on the wedge by the floor's criterion and clears Walker's 30 deg;
// on #reef=legacy none does. The clip cells' kinematics are pinned by
// tests/reef-fit-table.test.js already; this file pins the jury cell and the
// arm contrast, through the instrument that reported them (bed.js's own bake,
// MEASUREMENT_LESSONS 4). The instrument's main() does not run on import.
import test from 'node:test';
import assert from 'node:assert/strict';

const M = await import('../scripts/measure_secondpeak_fieldday.mjs');

const CELLS = M.CELLS.filter((c) => ['jury', 'clip_surfline', 'clip_verified'].includes(c.id));
const arms = M.measureAll(M.bedTable, CELLS);

test('the shipped reef arm peels at Second Peak at the jury hash and both clip cells', () => {
  for (const r of arms.table.rows) {
    assert.equal(r.healthy, 1, `${r.id}: alpha ${r.alpha} on-reef ${r.onReef} is not a peel by the floor criterion`);
    assert.equal(r.walker, 1, `${r.id}: alpha ${r.alpha} below Walker's 30 deg`);
    assert.ok(r.Vp < 10, `${r.id}: Vp ${r.Vp} m/s is a closeout speed`);
    assert.ok(r.activation && r.activation.aboveActivation, `${r.id}: below the wedge's activation H0`);
  }
});

test('#reef=legacy does not peel at any of them (the jury numbers belong to that arm)', () => {
  for (const r of arms.legacy.rows) {
    assert.equal(r.healthy, 0, `${r.id}: legacy arm reads alpha ${r.alpha} on-reef ${r.onReef}`);
    assert.ok(Math.abs(r.alpha) < 12, `${r.id}: legacy alpha ${r.alpha}`);
  }
});

test('the floor is not an actor on any of these hashes: #h0= is explicit, and the floor would decline anyway', () => {
  for (const r of arms.table.rows) {
    assert.equal(r.floor.routedThroughFloor, false);
    assert.ok(r.floor.declines.length >= 1, `${r.id}: the floor would apply at T ${r.T}, tide ${r.tide}`);
  }
});

test('the Lookout eye under the Second Peak preset is hundreds of metres down-point of the stage', () => {
  const jury = arms.table.rows.find((r) => r.id === 'jury');
  const g = M.lookoutGeometry(M.bedTable, jury.stations.map((s) => ({ x: s.x, z: s.z })));
  assert.ok(g.distanceToNodeM > 400, `eye ${g.distanceToNodeM} m from the node`);
  assert.ok(g.eyeStage.x > 300, `eye at stage x ${g.eyeStage.x} is not beyond the 600 m bake`);
  for (const e of g.stageEnds) assert.equal(e.inHorizontalField, false, `stage end x ${e.x} inside the horizontal field`);
});
