// M4 rider continuity (model-js m4RideSolve).
//
// The defect this replaces was measured, not hypothesized: the per-frame
// global min-phase-residual re-scan teleported the rider (median 1-s |dx|
// 28-220 m, >30 m hops on up to 84/300 frames at 1/30 s, 8-95% of samples
// outside the mapped stage — 2026-08-11 Playwright + CPU replication). The
// contract under test is the fix: follow ONE crest, march down-point, stay
// inside the stage bounds, and only ever jump when a ride legitimately ends
// (hand-off back to the takeoff).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coastCurve, m4RideSolve } from '../web-three/js/model-js.js';

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
    for (const v of [s.x, s.z, s.vx, s.vz]) assert.ok(Number.isFinite(v));
    // clamped to the stage bounds, never the baked +/-290
    assert.ok(s.x >= xLo - 1e-6 && s.x <= xHi, `x=${s.x} escaped the stage`);
    if (prev && !prev.waiting && !s.waiting) {
      const dx = s.x - prev.x;
      if (dx >= -1e-6) {
        // same ride: down-point, and bounded by the vx clamp (90 m/s)
        assert.ok(dx <= 90 * DT + 0.5, `teleport within a ride: dx=${dx.toFixed(1)} m in ${DT}s`);
        maxRideSpan = Math.max(maxRideSpan, s.x - rideStartX);
      } else {
        // the ONLY allowed jump: ride ended, hand-off restarts near the takeoff
        assert.ok(s.x < prev.x, 'hand-off must move back toward the takeoff');
        rides++; rideStartX = s.x;
      }
    }
    if ((!prev || prev.waiting) && !s.waiting) { rideStartX = s.x; if (prev) rides++; }
    prev = s;
  }
  assert.ok(rides >= 2, `expected several rides in 60 s, saw ${rides}`);
  assert.ok(maxRideSpan > 40, `rides should cover the stage, longest was ${maxRideSpan.toFixed(1)} m`);
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
  assert.ok(rode > 100, `expected rides at a peak-shaped spot, rode ${rode} frames`);
  // the takeoff is near the S minimum (x = -20 +/- the crest spacing seen
  // through the parabola), never the up-point stage edge
  assert.ok(minRideX > -80, `rode the left branch / stage edge: minRideX=${minRideX.toFixed(1)}`);
});

test('the ride survives a smoothly moving line (tide drag) without a crest reset', () => {
  const st = { n: null, prevX: null };
  const DT = 1 / 30;
  let prev = null, jumps = 0;
  for (let i = 0; i <= 20 * 30; i++) {
    const t = 40 + i * DT;
    const drift = 6 * Math.sin(t * 0.05);          // line slides ~metres, like a tide drag
    const s = m4RideSolve(t, P, (x) => zbFn(x) + drift, st);
    assert.ok(s);
    if (prev && !prev.waiting && !s.waiting && Math.abs(s.x - prev.x) > 90 * DT + 0.5) jumps++;
    prev = s;
  }
  // hand-offs at ride end are legitimate; mid-ride teleports are not. With
  // ~2 rides in 20 s, more than 3 jumps means the solver lost its crest.
  assert.ok(jumps <= 3, `line drift caused ${jumps} discontinuities`);
});
