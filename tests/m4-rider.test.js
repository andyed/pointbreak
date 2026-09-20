// M4 rider continuity (model-js m4RideSolve).
//
// The defect this replaces was measured, not hypothesized: the per-frame
// global min-phase-residual re-scan teleported the rider (median 1-s |dx|
// 28-220 m, >30 m hops on up to 84/300 frames at 1/30 s, 8-95% of samples
// outside the mapped stage — 2026-08-11 Playwright + CPU replication). The
// contract under test is the fix: follow ONE crest, march down-point, stay
// inside the stage bounds, and only ever jump when a ride legitimately ends
// (hand-off back to the takeoff).
//
// ---------------------------------------------------------------------------
// Phase 0.2 (docs/research/GAME_PROJECTION_2026-09-19.md) — assertion triage.
//
// Track A1 gives the rider his own velocity state so he can fall behind the
// peel and lose the wave. Every assertion in this file was therefore sorted
// into one of three buckets, and each carries its bucket in a comment:
//
//   (a) CONTRACT   — true of any rider, kinematic or dynamic. Unchanged.
//   (b) KINEMATIC  — true only because position is a closed-form formula.
//                    Moved to the named kinematic fixture below, which
//                    exercises the code path where the closed form survives
//                    (surferState's authored branch), and is NOT asserted of
//                    m4RideSolve, whose formula A1 replaces.
//   (c) OBSOLETE   — deleted, with the reason at the deletion site.
//
// The rule applied throughout: no tolerance was loosened to buy a pass. Where
// an identity had to go, it was replaced by the weaker-but-still-real physical
// statement it was a special case of (vz is the time derivative of z), with a
// tolerance set from the measured truncation error of the solver's own
// stencil, not from whatever made the test green.
// ---------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  coastCurve, coastCurveSlope, contourZ, swellPhi, LAM, PUMP_PERIOD,
  m4RideSolve, surferState,
} from '../web-three/js/model-js.js';

const modelJs = readFileSync(new URL('../web-three/js/model-js.js', import.meta.url), 'utf8');
const modelGlsl = readFileSync(new URL('../shared/model-glsl.js', import.meta.url), 'utf8');

// A Second-Peak-shaped parameter set with a smooth synthetic emergent line —
// the solver only sees zbFn, so a synthetic line exercises the same math the
// baked one does without dragging the bathymetry decode into a unit test.
const P = {
  T: 14, H0: 1.5, alphaRad: 58 * Math.PI / 180, xi: 0.65,
  sections: 0, dF: 0.006, chop: 0, aframe: 0,
  geoMix: 1, contourX2: 1 / 5000, contourX3: 0,
  stageStart: -60, stageEnd: 160,
};
const zbFn = (x) => -coastCurve(x, P) - 20 + 0.08 * x;

test('the rider follows one crest: in-bounds, monotone down-point, no teleports', () => {
  const st = { n: null, prevX: null };
  const DT = 1 / 30;
  const xLo = P.stageStart + 10, xHi = P.stageEnd + 1e-6;
  let prev = null, rides = 0, maxRideSpan = 0, rideStartX = null;
  for (let i = 0; i <= 60 * 30; i++) {
    const t = 30 + i * DT;
    const s = m4RideSolve(t, P, zbFn, st);
    assert.ok(s, 'solver returned null on a well-posed stage');
    // (a) finiteness — a dynamic rider integrates, which is exactly the shape
    // of code that produces NaN once a divisor reaches zero. Keep.
    for (const v of [s.x, s.z, s.vx, s.vz]) assert.ok(Number.isFinite(v));
    // (a) clamped to the stage bounds, never the baked +/-290. A rider who
    // falls still has to be somewhere on the mapped stage.
    assert.ok(s.x >= xLo - 1e-6 && s.x <= xHi, `x=${s.x} escaped the stage`);
    if (prev && !prev.waiting && !s.waiting) {
      const dx = s.x - prev.x;
      if (dx >= -1e-6) {
        // (a) same ride: down-point, and bounded by the vx clamp (90 m/s).
        // This is an UPPER bound, so A1's board-speed ceiling (6-12 m/s) only
        // makes it slacker — it stays true, it just stops being tight. Worth
        // re-keying to the ceiling once that constant exists; see the report.
        assert.ok(dx <= 90 * DT + 0.5, `teleport within a ride: dx=${dx.toFixed(1)} m in ${DT}s`);
        maxRideSpan = Math.max(maxRideSpan, s.x - rideStartX);
      } else {
        // the ONLY allowed jump: ride ended, hand-off restarts near the takeoff.
        //
        // (c) DELETED here: `assert.ok(s.x < prev.x, 'hand-off must move back
        // toward the takeoff')`. It is a tautology — this branch is reached
        // only when dx = s.x - prev.x < -1e-6, which already says s.x < prev.x,
        // so the assertion could not fail for any implementation. It was also
        // unreachable in practice: measured 0 backward steps across the 1801
        // frames of this march (today every ride boundary arrives through the
        // waiting->riding transition below). The branch itself is kept because
        // a dynamic rider that hands off without a waiting frame will use it.
        //
        // What SHOULD be asserted here — where a hand-off is allowed to land —
        // depends on A2's fall/recover design (does a beaten rider always
        // return to the takeoff, or can he resume mid-stage in whitewater?).
        // Not guessed; flagged.
        rides++; rideStartX = s.x;
      }
    }
    if ((!prev || prev.waiting) && !s.waiting) { rideStartX = s.x; if (prev) rides++; }
    prev = s;
  }
  // (a) a rider who can be beaten by the peel produces MORE ride boundaries,
  // not fewer — a fall ends a ride and the next takeoff starts another — so
  // this lower bound only gets easier to satisfy. Keep. (Measured today: 4.)
  assert.ok(rides >= 2, `expected several rides in 60 s, saw ${rides}`);
  // FLAGGED, left unchanged: this is the one bar a dynamic rider can fail
  // honestly. It asserts that this synthetic Second-Peak-shaped stage is
  // MAKEABLE — that a rider gets 40 m down the point before the peel leaves
  // him. Whether that is true depends on A1's board-speed ceiling (the 6/8/
  // 10/12 m/s ladder) versus this stage's required peel speed, which is a
  // design decision, not a test decision. Measured today: 199.2 m.
  assert.ok(maxRideSpan > 40, `rides should cover the stage, longest was ${maxRideSpan.toFixed(1)} m`);
});

test('the rider occupies the shoreward front face and vz is the true derivative of z', () => {
  // Sampled over the same 60 s march as the continuity test rather than the
  // old 6 s window: in that window the rider was WAITING on 106 of 121 samples,
  // so the vz assertion was mostly exercising the waiting branch (where the
  // line term is hard-zeroed) and only 15 samples tested a moving rider. The
  // 60 s march gives 946 riding samples.
  const st = { n: null, prevX: null };
  const DT = 1 / 30;
  const xLo = P.stageStart + 10, xHi = P.stageEnd + 1e-6;

  // vz must be dz/dt. That is the physical meaning of the field, it is what
  // surfer.js and the POV gaze read it as, and it stays true when z stops
  // being a closed form. Central difference against the solver itself, on a
  // CLONE of the march state so the probe does not disturb the ride.
  //
  // Tolerance 0.05 m/s. Not a loosened 1e-9: the residual is the truncation
  // error of the solver's own +/-1.5 m dzb/dx stencil against the exact
  // derivative, measured at 7.07e-3 m/s worst case over this march. The two
  // terms this check exists to catch are far larger than that — the pump
  // derivative is 5*(2pi/6) = 5.24 m/s and the line term reaches 2.59 m/s on
  // this stage — so it has ~50-700x headroom over the defects it must see
  // (a dropped pump term, a sign flip, the old seaward arm).
  const FD_H = 1e-4;
  const FD_TOL = 0.05;
  let fdSamples = 0, worstFd = 0;

  for (let i = 0; i <= 60 * 30; i++) {
    const t = 30 + i * DT;
    const before = { ...st };
    const s = m4RideSolve(t, P, zbFn, st);
    assert.ok(s);

    // (a) CONTRACT: the rider is on the shoreward front face of the crest,
    // 6-16 m in. This is the assertion that survives A1 — it says where the
    // rider is allowed to be, not what formula put him there. It is tight,
    // not slack: the measured offset touches both 6.000 and 16.000.
    const signedOffset = s.z - zbFn(s.x);
    assert.ok(signedOffset >= 6 - 1e-9 && signedOffset <= 16 + 1e-9,
      `rider crossed behind the crest: z-zb=${signedOffset.toFixed(3)} m`);
    //
    // (b) MOVED OUT: `Math.abs(signedOffset - (11 + 5*s.pump)) < 1e-9`. That
    // pinned the offset to the closed form z = zb + 11 + 5*pump, which is
    // precisely the model A1 replaces. It now lives in the kinematic fixture
    // below, asserted of surferState's authored branch, where it holds.

    if (s.waiting) continue;
    const sa = m4RideSolve(t - FD_H, P, zbFn, { ...before });
    const sb = m4RideSolve(t + FD_H, P, zbFn, { ...before });
    if (!sa || !sb || sa.waiting || sb.waiting) continue;
    if (Math.abs(sb.x - sa.x) > 1) continue;   // a hand-off inside the probe window
    const err = Math.abs((sb.z - sa.z) / (2 * FD_H) - s.vz);
    worstFd = Math.max(worstFd, err);
    fdSamples++;
    assert.ok(err < FD_TOL,
      `vz is not dz/dt at t=${t.toFixed(3)}: |fd - vz| = ${err.toFixed(4)} m/s`);
    //
    // (b) MOVED OUT: `Math.abs(s.vz - dzbdx*s.vx - 5*omega*cos(t*omega)) < 1e-9`.
    // That pinned vz to the analytic derivative of the closed-form z — true
    // only while z IS that formula. The derivative relation above is the part
    // of it that is physics rather than bookkeeping.
  }
  // The skip guards above must not be able to hollow the test out: a rider
  // that never rides would otherwise pass vacuously. Measured today: 946.
  assert.ok(fdSamples >= 400,
    `vz derivative check covered only ${fdSamples} riding samples — it has gone vacuous`);
  assert.ok(worstFd < FD_TOL);
});

test('KINEMATIC FIXTURE — the authored closed-form rider (surferState with no m4Ride)', () => {
  // This is where the 1e-9 identities from the front-face test now live.
  //
  // COVERS: model-js surferState()'s authored branch — the no-emergent-line
  // rider, taken when P.m4Ride is absent. That rider is closed-form by
  // construction (its own comment: "Closed-form rider on the zipper: no
  // state"), it is the MODEL-TWIN of the GLSL surferState body, and A1 does
  // not touch it: Track A gives velocity state to m4RideSolve, the emergent-
  // line solver. So the identities are still pinned, on the path where they
  // are true.
  //
  // DOES NOT COVER: m4RideSolve. Deliberately. Asserting these of the M4
  // rider is what Phase 0.2 exists to undo.
  const omega = 2 * Math.PI / PUMP_PERIOD;
  const w = 2 * Math.PI / P.T;
  const k = 2 * Math.PI / LAM;
  const sp = Math.max(Math.sin(swellPhi(P)), 0.05);
  const cp = Math.max(Math.cos(swellPhi(P)), 0.05);

  for (let i = 0; i <= 120; i++) {
    const t = 30 + i / 20;
    const s = surferState(t, P);
    assert.ok(s);
    for (const v of [s.x, s.z, s.vx, s.vz, s.pump]) assert.ok(Number.isFinite(v));

    // (b) the pump is the bare 6 s sine — the cycle the wake and lean shaders
    // share, so a phase change here desyncs them.
    const pump = Math.sin(t * omega);
    assert.ok(Math.abs(s.pump - pump) < 1e-12, `pump ${s.pump} != sin(t*omega) ${pump}`);

    // (b) vx IS the peel speed c/sin(phi), with no rider of its own. This is
    // the identity A1 breaks for the M4 rider and keeps for this one.
    const vxExpected = (LAM / P.T) / sp;
    assert.ok(Math.abs(s.vx - vxExpected) < 1e-12,
      `authored vx ${s.vx} != peel speed ${vxExpected}`);

    // (b) the front-face offset, stated so it does not merely copy the
    // implementation back: in the CONTOUR frame the rider sits exactly
    // faceOff = 11 + 5*pump shoreward of a real crest, so subtracting faceOff
    // must land on an integer number of wavelengths of ray phase.
    const faceOff = 11 + 5 * pump;
    const zcCrest = contourZ(s.x, s.z, P) - faceOff;
    const cycles = (w * t - k * (s.x * sp + zcCrest * cp)) / (2 * Math.PI);
    assert.ok(Math.abs(cycles - Math.round(cycles)) < 1e-9,
      `rider is not faceOff=${faceOff.toFixed(3)} m shoreward of a crest: phase ${cycles}`);

    // (b) vz is the analytic derivative of that closed form — the coast-curve
    // slope carried by vx, plus the pump. The M4 version of this assertion is
    // now a numerical dz/dt check; here the closed form is available, so the
    // stronger analytic pin is kept.
    const vzExpected = -coastCurveSlope(s.x, P) * s.vx + 5 * omega * Math.cos(t * omega);
    assert.ok(Math.abs(s.vz - vzExpected) < 1e-9,
      `authored vz ${s.vz} != analytic ${vzExpected}`);
  }

  // (a) source twin of the authored branch. Survives A1 and Phase 0.4 — it
  // pins the path this fixture just exercised behaviourally.
  assert.match(modelJs, /zcCrest \+ faceOff - coastCurve\(xs, P\)/);
});

test('MODEL-TWIN source pins — the rider stands on the line, at HIS station', () => {
  // Re-keyed by A1 (2026-09-19), which was the event this test was flagged and
  // left standing for. It was `const z = zb + faceOff`, where zb is the line
  // under the BREAKPOINT. A1 gives the rider a speed of his own, so he can sit
  // behind the breakpoint and the line under HIM is a different z — hence zbR.
  //
  // The pin is kept rather than deleted because what it guards did not go away:
  // z must stay the baked line plus the authored face offset, so that nobody
  // decouples the rider's height from the wave he is supposed to be on. The
  // behavioural statements carry the rest — the 6-16 m front-face bound and the
  // dz/dt check above, both of which now exercise the dynamic rider too.
  assert.match(modelJs, /const z\s*= zbR \+ faceOff/,
    'the rider\'s z must remain the baked line under HIM plus the face offset');
  assert.match(modelJs, /const zbR = \(Number\.isFinite\(board\)/,
    'zbR must be gated on a declared board speed, so the kinematic path is untouched');
  // Phase 0.4 resolved by DOCUMENTING and GUARDING the GLSL body rather than
  // deleting it (tests/glsl-rider-authority.test.js), so these two still stand.
  assert.match(modelGlsl, /zcCrest \+ faceOff - coastCurve\(xs\)/);
  assert.match(modelGlsl, /\+ 5\.0\*\(2\.0\*PI\/6\.0\)\*cos/);
});

test('a mid-stage S minimum (Sewer Peak shape) takes off AT the peak and rides the +x branch', () => {
  // At Sewers the emergent line is more oblique than the crest over the
  // up-point half of the stage, so ray distance S has its minimum mid-stage:
  // the wave breaks first at the peak and the crossing splits into a left and
  // a right. The v1 solver anchored the takeoff to the stage edge and waited
  // forever (measured: riding 0/121 samples). Model that shape with a line
  // whose S dips at x ~ -20 and assert the rider actually rides, down-point,
  // never on the left branch.
  const Pv = { ...P, stageStart: -200, stageEnd: 80 };
  // S(x) = sin(phi)*x + cos(phi)*(zb + coastCurve): make zb + coastCurve a
  // parabola in x so S has an interior minimum like the measured Sewers bake
  const zbV = (x) => -coastCurve(x, Pv) - 100 + 0.004 * (x + 20) * (x + 20);
  const st = { n: null, prevX: null };
  let rode = 0, minRideX = Infinity;
  for (let i = 0; i <= 60 * 30; i++) {
    const s = m4RideSolve(30 + i / 30, Pv, zbV, st);
    assert.ok(s);
    if (!s.waiting) { rode++; minRideX = Math.min(minRideX, s.x); }
  }
  // (a) both survive A1. The first is a lower bound on riding frames, and a
  // rider who can fall still has to take off at all — the v1 defect this
  // catches was riding 0 frames, which no rider design makes acceptable.
  assert.ok(rode > 100, `expected rides at a peak-shaped spot, rode ${rode} frames`);
  // (a) the takeoff is near the S minimum (x = -20 +/- the crest spacing seen
  // through the parabola), never the up-point stage edge. This is a statement
  // about where the WAVE starts breaking, not about the rider's dynamics, so
  // a rider who lags the peel is still bounded by it.
  assert.ok(minRideX > -80, `rode the left branch / stage edge: minRideX=${minRideX.toFixed(1)}`);
});

test('the ride survives a smoothly moving line (tide drag) without a crest reset', () => {
  const DT = 1 / 30;

  // Re-keyed from an absolute jump budget to a DIFFERENTIAL one. The old form
  // allowed <= 3 discontinuities of any sign over 20 s, on the reasoning that
  // ride hand-offs are legitimate and mid-ride teleports are not. That
  // conflates the two, and it breaks for the wrong reason under a rider who
  // can fall: more falls means more legitimate hand-offs, which would spend
  // the budget and fail a correct rider.
  //
  // Split into the two statements it was standing in for:
  //   1. a FORWARD mid-ride jump is never legitimate under any rider design
  //      (a hand-off moves back toward the takeoff), so its budget is zero —
  //      strictly tighter than the old <= 3;
  //   2. tide drag must not ADD ride boundaries relative to the same march on
  //      a still line. Comparative, so it isolates drift as the variable and
  //      stays valid however often the rider falls.
  const march = (zf) => {
    const st = { n: null, prevX: null };
    let prev = null, boundaries = 0, forwardJumps = 0;
    for (let i = 0; i <= 20 * 30; i++) {
      const t = 40 + i * DT;
      const s = m4RideSolve(t, P, (x) => zf(x, t), st);
      assert.ok(s);
      if (prev) {
        if (prev.waiting && !s.waiting) boundaries++;
        else if (!prev.waiting && !s.waiting) {
          const dx = s.x - prev.x;
          if (dx < -1e-6) boundaries++;                        // hand-off
          else if (dx > 90 * DT + 0.5) forwardJumps++;          // lost crest
        }
      }
      prev = s;
    }
    return { boundaries, forwardJumps };
  };

  const still = march((x) => zbFn(x));
  // the line slides ~metres, like a tide drag
  const drifted = march((x, t) => zbFn(x) + 6 * Math.sin(t * 0.05));

  assert.equal(still.forwardJumps, 0, 'the still line produced a forward teleport');
  assert.equal(drifted.forwardJumps, 0, 'line drift produced a forward teleport');
  // +1 of slack for a boundary that straddles the window edge under drift.
  // Measured today: 1 boundary in both marches.
  assert.ok(drifted.boundaries <= still.boundaries + 1,
    `line drift added crest resets: ${drifted.boundaries} vs ${still.boundaries} on a still line`);
});
