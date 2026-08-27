import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  signedPeelGeometryAt, signedPeelGeometryFromDerivatives,
} from '../web-three/js/peel-geometry.js';

const RAD = Math.PI / 180;

function close(actual, expected, tolerance, label) {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} != ${expected} (+/- ${tolerance})`);
}

test('signed peel angle is crest-relative, not the break-line bearing', () => {
  const phi = 12 * RAD;       // crest bearing is -12 degrees
  const beta = 35 * RAD;      // break-line bearing is +35 degrees
  const k = 0.08;
  const line = (x) => Math.tan(beta) * x;
  const phase = (x, z) => k * (x * Math.sin(phi) + z * Math.cos(phi));
  const g = signedPeelGeometryAt({
    x: 7, breakZAt: line, phaseAt: phase, lineStep: 3, phaseStep: 1,
  });

  close(g.alphaDeg, 47, 1e-10, 'crest-relative alpha');
  close(g.breakBearingRad / RAD, 35, 1e-10, 'line bearing');
  assert.notEqual(Math.round(g.alphaDeg), Math.round(g.breakBearingRad / RAD),
    'peel angle must not collapse to atan(dz/dx)');
});

test('signed peel angle preserves the side of a crest crossing', () => {
  const phi = 10 * RAD;
  const beta = -30 * RAD;
  const g = signedPeelGeometryFromDerivatives({
    dzdx: Math.tan(beta), phaseDx: Math.sin(phi), phaseDz: Math.cos(phi),
  });
  close(g.alphaDeg, -20, 1e-10, 'signed alpha');
  assert.ok(g.phaseAlongDx < 0, 'this line must carry the crossing toward -x');
});

test('breakpoint velocity is the derivative of phase along the baked line', () => {
  const phi = 9 * RAD;
  const beta = 38 * RAD;
  const k = 0.071;
  const omega = 2 * Math.PI / 15;
  const g = signedPeelGeometryFromDerivatives({
    dzdx: Math.tan(beta),
    phaseDx: k * Math.sin(phi),
    phaseDz: k * Math.cos(phi),
    omega,
  });

  const expectedX = omega
    / (k * (Math.sin(phi) + Math.cos(phi) * Math.tan(beta)));
  const expectedAlongLine = (omega / k) / Math.sin(phi + beta);
  close(g.xVelocityMps, expectedX, 1e-12, 'x velocity');
  close(g.lineVelocityMps, expectedAlongLine, 1e-12, 'line velocity');
  close(g.phaseSpeedMps, omega / k, 1e-12, 'phase speed');
});

test('a crest tangent to the break line reports a closeout, not a huge finite speed', () => {
  const phi = 14 * RAD;
  const g = signedPeelGeometryFromDerivatives({
    dzdx: -Math.tan(phi),
    phaseDx: Math.sin(phi), phaseDz: Math.cos(phi), omega: 0.4,
  });
  close(g.alphaDeg, 0, 1e-10, 'closeout alpha');
  assert.equal(g.xVelocityMps, null);
  assert.equal(g.lineVelocityMps, null);
});

test('runtime readout is canonical while legacy reef calibration is explicit and deferred', () => {
  const bed = readFileSync(new URL('../web-three/js/bed.js', import.meta.url), 'utf8');
  assert.match(bed, /export function derivedPeelGeometry\(/);
  assert.match(bed, /return signedPeelGeometryAt\(/);
  assert.match(bed, /export function derivedAlphaDeg[\s\S]*derivedPeelGeometry\(x, x0, x1\)/);
  assert.match(bed, /fitMetric: 'legacy-break-line-bearing'/);
  assert.match(bed, /canonicalFitDeferred: true/);
});
