// Convert an observed compass wave direction into this spot's measured contour
// frame. CDIP waveDp is a FROM bearing; the phase field needs the opposite,
// shoreward propagation vector resolved onto stageAlong (+x) and stageShore
// (+contour-z). This module is pure so the geometry boundary stays testable.

import { PP_GEO_DATA } from '../../data/model/pp_geo_profiles.js';

const RAD = Math.PI / 180;
const DEG = 180 / Math.PI;
export const DIRECTION_RANGE_DEG = Object.freeze([188, 216]);

export function parseDirectionParam(value) {
  if (value === null || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(Math.max(parsed, DIRECTION_RANGE_DEG[0]), DIRECTION_RANGE_DEG[1]);
}

export function stageIncidenceDeg({
  waveFromDeg, stageAlongENU, stageShoreENU,
} = {}) {
  if (!Number.isFinite(waveFromDeg)
      || !Array.isArray(stageAlongENU) || stageAlongENU.length !== 2
      || !Array.isArray(stageShoreENU) || stageShoreENU.length !== 2
      || ![...stageAlongENU, ...stageShoreENU].every(Number.isFinite)) return null;

  const propagation = (waveFromDeg + 180) * RAD;
  const east = Math.sin(propagation);
  const north = Math.cos(propagation);
  const along = east * stageAlongENU[0] + north * stageAlongENU[1];
  const shoreward = east * stageShoreENU[0] + north * stageShoreENU[1];
  return Math.atan2(along, shoreward) * DEG;
}

export function incidentDirectionForSpot(geoSpot, waveFromDeg) {
  const profile = geoSpot ? PP_GEO_DATA.profiles[geoSpot] : null;
  if (!profile?.contourFit?.usable || !Number.isFinite(waveFromDeg)) return null;
  const incidentDeg = stageIncidenceDeg({
    waveFromDeg,
    stageAlongENU: profile.stageAlongENU,
    stageShoreENU: profile.stageShoreENU,
  });
  if (!Number.isFinite(incidentDeg)) return null;
  return { source: 'geometry', waveFromDeg, incidentDeg };
}

export function isShorewardIncidentDeg(incidentDeg) {
  return Number.isFinite(incidentDeg) && Math.abs(incidentDeg) < 90;
}

export function refractionDirectionOptions(phase) {
  if (!phase) return null;
  return { swellDeg: phase.incidentDeg, referenceDepthM: phase.referenceDepthM };
}

// The observed direction is deliberately narrower than the whole model state:
// it owns the measured-bed Psi phase arm, while authored alpha continues to own
// reef character and every legacy/deep-water consumer. Returning null is the
// explicit fallback for #psi=0 and for sites without defensible geometry.
export function directionPhaseForSpot({
  psiEnabled, geoSpot, waveFromDeg, authoredAlphaDeg,
} = {}) {
  if (!psiEnabled) return null;
  const incident = incidentDirectionForSpot(geoSpot, waveFromDeg);
  if (!incident || !isShorewardIncidentDeg(incident.incidentDeg)) return null;
  return { ...incident, authoredAlphaDeg, referenceDepthM: 15 };
}
