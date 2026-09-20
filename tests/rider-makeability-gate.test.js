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

    // Arm 2 — the load-bearing one. The shipped rider IS the breakpoint, so at
    // this spot's own minimum board speed he rides straight through pinches
    // that beat a real surfer. If this ever passes the high bar, the metric has
    // stopped measuring agreement and gone back to measuring adherence.
    assert.ok(r.capped.agreement < G.FAIL_CAPPED_ABOVE,
      `arm 2: shipped rider scored ${r.capped.agreement} at ${r.boardMps} m/s, `
      + `which is NOT below ${G.FAIL_CAPPED_ABOVE}. Either the rider became dynamic `
      + `(then move this bar deliberately) or the metric regressed to adherence.`);

    // The separation itself, stated as one assertion so a reader sees the claim.
    assert.ok(r.reference.agreement - r.capped.agreement > 0.5,
      `the two riders must land on opposite sides: reference ${r.reference.agreement} `
      + `vs shipped ${r.capped.agreement} at the same speed on the same field`);
  });
}
