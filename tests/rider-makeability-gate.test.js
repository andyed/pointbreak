// The rider acceptance gate, wired into `npm test`.
//
// scripts/measure_rider_makeability.mjs holds the instrument and the reasoning;
// this file is the part that FAILS A BUILD. Two spots rather than seven, chosen
// for opposite ends of the difficulty field (The Hook is the forgiving one at
// 6 m/s, Privates the knife-edge at 10), so the suite stays a few seconds while
// still exercising both ends. Run the script for the whole lineup.
//
// What this protects, and why it exists before any rider change: the old
// acceptance path (scripts/measure_ride.mjs, ACCEPT = 0.9 on rideMetric) scores
// breakpoint ADHERENCE, so it rejects a correct dynamic rider. If Track A lands
// against that gate the build goes red for being right. This gate scores
// AGREEMENT with the makeability field instead, and arms 2 and 3 are what prove
// the difference: the same spot, the same board speed and the same field must
// put the shipped kinematic rider and a reference dynamic rider on opposite
// sides. A metric that cannot separate those two is adherence wearing a hat.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const G = await import('../scripts/measure_rider_makeability.mjs');

const SPOTS = ['thehook', 'privates'];

for (const key of SPOTS) {
  test(`rider gate — ${key}`, () => {
    const r = G.runSpot(key, 'bake');
    assert.ok(r.uncapped.rides > 0, 'no rides to score: the harness, not the rider, is broken');

    // Arm 1 — regression guard. At unbounded board speed nothing can outrun
    // him, so any predicted loss is the predictor hallucinating.
    assert.equal(r.uncapped.agreement, G.PASS_UNCAPPED,
      `arm 1: uncapped agreement ${r.uncapped.agreement} != ${G.PASS_UNCAPPED}`);

    // Arm 3 — the target is reachable. A reference rider who advances at
    // min(V_peel, V_board) and is lost where the peel outruns him must score
    // high, or the gate is unfair rather than strict.
    assert.ok(r.reference.rides > 0,
      `arm 3: the reference rider never took off at ${r.boardMps} m/s — the board speed is below what this spot allows`);
    assert.ok(r.reference.agreement >= G.PASS_REFERENCE,
      `arm 3: reference agreement ${r.reference.agreement} < ${G.PASS_REFERENCE}`);

    // Arm 4 — A1. The REAL m4RideSolve with a board speed declared must obey
    // the same criterion the reference does. This is the assertion Track A1
    // exists to satisfy.
    assert.ok(r.dynamic.rides > 0, 'arm 4: the dynamic rider never rode');
    assert.ok(r.dynamic.agreement >= G.PASS_REFERENCE,
      `arm 4: the real dynamic rider scored ${r.dynamic.agreement} < ${G.PASS_REFERENCE} — `
      + `he is not obeying the loss rule the field predicts`);
  });
}

// Arm 2 — separation, asserted once rather than per spot. Under the integrated
// pocket rule most of the lineup genuinely IS makeable at its own minSkill, so
// the kinematic rider agreeing there is correct. The claim that matters is that
// where the pocket really fails, the metric can tell the two riders apart —
// which is the property rideMetric cannot have at any threshold.
test('rider gate — the metric separates a kinematic rider from a dynamic one', () => {
  const r = G.runSpot('privates', 'bake');   // median V_peel 14 m/s: the knife-edge
  const sep = r.dynamic.agreement - r.capped.agreement;
  assert.ok(sep >= G.MIN_SEPARATION,
    `at ${r.boardMps} m/s the dynamic rider scored ${r.dynamic.agreement} and the kinematic one `
    + `${r.capped.agreement}; separation ${sep.toFixed(2)} < ${G.MIN_SEPARATION}. `
    + `If this regressed to ~0 the metric has gone back to measuring adherence.`);
});
