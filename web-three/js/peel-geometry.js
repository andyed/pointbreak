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

// The peel speed, from an along-line phase derivative. ONE definition, because
// two consumers need it and MODEL.md 4.5 does not allow two derivations of one
// quantity: signedPeelGeometryFromDerivatives below, and m4RideSolve, which
// arrives at dPhi/dx as a single total difference along the line rather than by
// recombining partials.
//
// The two are the same statement -- dPhi/dx along z = zb(x) is
// Phi_x + Phi_z*zb' either way -- but they are NOT numerically interchangeable,
// and the gap is not rounding. Measured on the card bake, max relative
// disagreement between the total-difference and recombined forms:
//
//   stencil 1.5 m (the rider's):     0.13% Sewers, 0.9% Second Peak, 1.1% Hook
//   stencil 14.06 m (bed.js's):      6.6% Sewers,   51% Second Peak,  37% Hook
//
// They converge as the stencil narrows and diverge as it widens, because the
// total difference smooths the line's curvature and the phase field's together
// over one baseline while the recombined form gives each its own. So the
// stencil is a property of the CALL SITE, passed in, never defaulted here --
// a shared default would move the rider by up to half his speed.
export function peelVelocity({ omega = null, phaseAlongDx = null, dzdx = null } = {}) {
  const none = { xVelocityMps: null, lineVelocityMps: null };
  if (!Number.isFinite(omega) || !(omega > 0)) return none;
  if (!Number.isFinite(phaseAlongDx) || Math.abs(phaseAlongDx) <= 1e-10) return none;
  const xVelocityMps = omega / phaseAlongDx;
  return {
    xVelocityMps,
    lineVelocityMps: Number.isFinite(dzdx) ? xVelocityMps * Math.hypot(1, dzdx) : null,
  };
}

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

  let phaseSpeedMps = null;
  if (Number.isFinite(omega) && omega > 0) phaseSpeedMps = omega / gradMag;
  // Recombined partials: this call site's stencil is the one signedPeelGeometryAt
  // was given (lineStep for dzdx, phaseStep for the partials).
  const { xVelocityMps, lineVelocityMps } = peelVelocity({ omega, phaseAlongDx, dzdx });

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
