// Canonical geometry of a crest crossing a breaking locus.
//
// Spatial phase Phi(x,z) labels crests: Phi(x,z) - omega*t = constant.  The
// breaking locus is z = zb(x).  At their intersection,
//
//   d/dt Phi(x, zb(x)) = (Phi_x + Phi_z*zb') * dx/dt = omega.
//
// The same derivatives give the crest tangent and therefore the signed peel
// angle.  Keeping those two results together prevents the old authority split
// where the rider followed phase along the line but the HUD called atan(zb')
// the peel angle.

const HALF_PI = Math.PI * 0.5;

function principalLineAngle(a) {
  // A crest is an unoriented line: angles separated by pi are identical.
  while (a > HALF_PI) a -= Math.PI;
  while (a <= -HALF_PI) a += Math.PI;
  return a;
}

export function signedPeelGeometryFromDerivatives({
  dzdx, phaseDx, phaseDz, omega = null,
} = {}) {
  if (![dzdx, phaseDx, phaseDz].every(Number.isFinite)) return null;
  const gradMag = Math.hypot(phaseDx, phaseDz);
  if (!(gradMag > 1e-12)) return null;

  const breakBearingRad = Math.atan(dzdx);
  // (Phi_z, -Phi_x) is tangent to a crest. principalLineAngle below makes
  // the result independent of which of the two tangent directions is chosen.
  const crestBearingRad = Math.atan2(-phaseDx, phaseDz);
  const alphaRad = principalLineAngle(breakBearingRad - crestBearingRad);
  const phaseAlongDx = phaseDx + phaseDz * dzdx;

  let xVelocityMps = null;
  let lineVelocityMps = null;
  let phaseSpeedMps = null;
  if (Number.isFinite(omega) && omega > 0) {
    phaseSpeedMps = omega / gradMag;
    if (Math.abs(phaseAlongDx) > 1e-10) {
      xVelocityMps = omega / phaseAlongDx;
      lineVelocityMps = xVelocityMps * Math.hypot(1, dzdx);
    }
  }

  return {
    alphaRad,
    alphaDeg: alphaRad * 180 / Math.PI,
    breakBearingRad,
    crestBearingRad,
    dzdx,
    phaseDx,
    phaseDz,
    phaseAlongDx,
    phaseGradient: gradMag,
    phaseSpeedMps,
    xVelocityMps,
    lineVelocityMps,
  };
}

export function signedPeelGeometryAt({
  x, breakZAt, phaseAt, omega = null, lineStep = 2, phaseStep = 1,
} = {}) {
  if (!Number.isFinite(x) || typeof breakZAt !== 'function'
      || typeof phaseAt !== 'function' || !(lineStep > 0) || !(phaseStep > 0)) {
    return null;
  }

  const z = breakZAt(x);
  const za = breakZAt(x - lineStep), zb = breakZAt(x + lineStep);
  if (![z, za, zb].every(Number.isFinite)) return null;
  const dzdx = (zb - za) / (2 * lineStep);
  const phaseDx = (phaseAt(x + phaseStep, z) - phaseAt(x - phaseStep, z))
                / (2 * phaseStep);
  const phaseDz = (phaseAt(x, z + phaseStep) - phaseAt(x, z - phaseStep))
                / (2 * phaseStep);

  return signedPeelGeometryFromDerivatives({ dzdx, phaseDx, phaseDz, omega });
}
