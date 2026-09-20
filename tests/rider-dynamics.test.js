// A1/A2: the rider with a board speed of his own.
//
// docs/research/GAME_PROJECTION_2026-09-19.md Track A. Off (no P.boardMps) the
// rider IS the breakpoint — his velocity is the peel speed at a fixed offset,
// so the gap between them is zero by construction and he cannot be beaten.
// Given a speed he becomes a second body that can fall out of the pocket, be
// caught by the whitewater, and lose the wave.
//
// The behavioural acceptance lives in scripts/measure_rider_makeability.mjs and
// tests/rider-makeability-gate.test.js, which score him against the makeability
// field. What is pinned HERE is the contract that made that scoring valid in
// the first place: the flag is genuinely off by default, and the integration
// does not depend on the frame rate it is stepped at.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coastCurve, m4RideSolve, RIDER_POCKET_M } from '../web-three/js/model-js.js';

const P0 = {
  T: 12, H0: 0.7, alphaRad: 31 * Math.PI / 180, aframe: 0, geoMix: 1,
  contourX2: 1 / 2000, contourX3: 5.1e-6, stageStart: -189.7, stageEnd: 60,
};
// A line oblique enough that the peel outruns a 6 m/s board over much of it.
const zbFn = (x) => -coastCurve(x, P0) + 34 * Math.sin(x / 95);

function march(P, dt, secs = 180) {
  const st = { n: null, prevX: null };
  let outruns = 0, prevFallen = false, maxLag = 0, frames = 0, tumbled = 0;
  for (let t = 0; t < secs; t += dt) {
    const s = m4RideSolve(t, P, zbFn, st);
    if (!s) continue;
    frames++;
    if (s.fallen && !prevFallen && s.lostTo === 'outrun') outruns++;
    prevFallen = s.fallen;
    if (s.tumbling) tumbled++;
    maxLag = Math.max(maxLag, s.lagM || 0);
  }
  return { outruns, maxLag, frames, tumbled };
}

test('OFF by default: without a board speed the rider is the breakpoint', () => {
  const r = march({ ...P0 }, 1 / 30, 60);
  assert.ok(r.frames > 100, 'the fixture must actually ride');
  assert.equal(r.outruns, 0, 'a rider with no declared speed cannot be outrun');
  assert.equal(r.maxLag, 0, 'and accumulates no lag at all');
  const s = m4RideSolve(10, { ...P0 }, zbFn, { n: null, prevX: null });
  assert.equal(s.fallen, false);
  assert.equal(s.lostTo, null);
  // x IS the breakpoint on this path: the additive field must agree with it.
  assert.equal(s.x, s.breakX);
});

test('given a board speed he is beaten, and tumbles when outrun', () => {
  const r = march({ ...P0, boardMps: 6 }, 1 / 30, 180);
  assert.ok(r.outruns > 0, 'the peel must be able to beat a 6 m/s board here');
  assert.ok(r.maxLag > RIDER_POCKET_M,
    `lag must exceed the ${RIDER_POCKET_M} m pocket for a loss to mean anything`);
  assert.ok(r.tumbled > 0, 'an outrun is a wipeout: he must spend frames tumbling');
});

test('a closeout is a kickout, not a wipeout', () => {
  // gapFn is the injected closeout predicate (bed.js owns the real one). The
  // wave shutting down ahead of him is not the same event as being outrun, and
  // the two must not render the same: no tumble, no shoreward push.
  const st = { n: null, prevX: null };
  // The gap must sit in the path of the ride being marched, and that window was
  // taken from a trace rather than guessed — three earlier placements tested
  // nothing. The first ride here takes off at x = 0 and is outrun by x ~ 6, so
  // a gap at 2..6 is crossed while he is still up. The failures are worth
  // recording because each one PASSED the predicate without ever returning
  // true: one window sat in water he only occupies while already down, one sat
  // behind the takeoff (he marches +x and never returns), and one was the
  // densest un-fallen band over 120 s — which belongs to a LATER ride, not this
  // one. A predicate that is called and never fires proves no branch.
  const P = { ...P0, boardMps: 6, gapFn: (x) => x > 2 && x < 6 };
  // Scored over THIS loss only. Counting across the whole march folded in the
  // later rides, which are outruns and do tumble — 608 frames of it — and that
  // says nothing about whether a kickout tumbles. The window closes 2 s after
  // the first loss, which is the full TUMBLE_S plus margin.
  let lost = null, tumbled = 0, maxPush = 0, rodeBefore = 0, lostT = null;
  for (let t = 0; t < 120; t += 1 / 30) {
    const s = m4RideSolve(t, P, zbFn, st);
    if (!s) continue;
    if (!lost && !s.fallen && !s.waiting) rodeBefore++;
    if (s.fallen && !lost) { lost = s.lostTo; lostT = t; }
    if (lostT !== null && t > lostT + 2) break;
    if (s.tumbling) tumbled++;
    if (s.fallen) maxPush = Math.max(maxPush, s.z - (zbFn(s.x) + 11 + 5 * s.pump));
  }
  assert.ok(rodeBefore > 3, 'the fixture must ride into the gap, not start inside it');
  assert.equal(lost, 'closeout', 'a gap under the rider must end the ride as a closeout');
  assert.equal(tumbled, 0, 'a kickout does not tumble');
  assert.equal(maxPush, 0, 'and the whitewater does not carry him shoreward');
});

test('RATE INDEPENDENT: the same ride at 60, 30, 12 and 4 fps', () => {
  // The defect this pins cost a silent revert to the kinematic rider. One
  // threshold served as both the integration clamp and the discontinuity test,
  // so any frame longer than 0.1 s became dt = 0, which counted as a new ride
  // and re-pinned him onto the breakpoint. In the app at speed 8 on a throttled
  // pane the per-frame dt is ~0.27 s, so EVERY frame reset him: he reported a
  // board speed and behaved exactly like the rider that cannot be beaten. Any
  // device under 10 fps would have done the same. Found by running it in the
  // renderer — headless, at a fixed 1/30, could not see it.
  const P = { ...P0, boardMps: 6 };
  const cadences = [1 / 60, 1 / 30, 1 / 12, 0.25, 0.267];
  const counts = cadences.map((dt) => march(P, dt, 180).outruns);
  assert.ok(counts[0] > 0, 'the fixture must produce losses to compare');
  for (let i = 1; i < counts.length; i++) {
    assert.equal(counts[i], counts[0],
      `outruns must not depend on frame rate: ${cadences[0]} s -> ${counts[0]}, `
      + `${cadences[i]} s -> ${counts[i]}`);
  }
});

test('a clock JUMP restarts the ride rather than integrating it', () => {
  // setSim, a tab wake, a preset rebake. Elapsed ride time it is not, and
  // integrating it would teleport him or fabricate a loss. Stepping the solve
  // in 2 s strides must therefore produce a rider who never accumulates lag —
  // which also means a Playwright rig that steps sim coarsely cannot observe a
  // fall, and should step at frame cadence if it wants one.
  const r = march({ ...P0, boardMps: 6 }, 2.0, 180);
  assert.ok(r.frames > 20, 'the fixture must still be marching');
  assert.equal(r.outruns, 0);
  assert.equal(r.maxLag, 0);
});
