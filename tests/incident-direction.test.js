import test from 'node:test';
import assert from 'node:assert/strict';

import {
  directionPhaseForSpot,
  incidentDirectionForSpot,
  isShorewardIncidentDeg,
  parseDirectionParam,
  refractionDirectionOptions,
  stageIncidenceDeg,
} from '../web-three/js/incident-direction.js';
import {
  alongshoreKappa,
  incidenceAt,
  referenceAlongshoreKappa,
  refractionCacheKey,
  wavenumberAt,
} from '../web-three/js/dispersion.js';
import { PP_GEO_DATA } from '../data/model/pp_geo_profiles.js';
import { applyPreset, makeState } from '../shared/params.js';

const close = (actual, expected, tolerance, label) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${label}: ${actual} vs ${expected} (tolerance ${tolerance})`);
};

test('compass wave direction becomes signed incidence in the local contour frame', () => {
  close(stageIncidenceDeg({
    waveFromDeg: 180,
    stageAlongENU: [1, 0],
    stageShoreENU: [0, 1],
  }), 0, 1e-12, 'shore-normal incidence');

  close(stageIncidenceDeg({
    waveFromDeg: 270,
    stageAlongENU: [1, 0],
    stageShoreENU: [0, 1],
  }), 90, 1e-12, 'contour-parallel incidence');
});

test('the same observed direction resolves against each spot geometry', () => {
  const first = incidentDirectionForSpot('First Peak', 194);
  const hook = incidentDirectionForSpot('The Hook', 194);

  assert.equal(first.source, 'geometry');
  assert.equal(first.waveFromDeg, 194);
  close(first.incidentDeg, 62.7896, 1e-3, 'First Peak incidence');
  close(hook.incidentDeg, 54.8523, 1e-3, 'The Hook incidence');
  assert.ok(first.incidentDeg > hook.incidentDeg,
    'local contour geometry must remain visible in the resolved incidence');
});

test('invalid or unmapped geometry declines instead of inventing an incidence', () => {
  assert.equal(incidentDirectionForSpot(null, 194), null);
  assert.equal(incidentDirectionForSpot('Private\'s', 194), null);
  assert.equal(incidentDirectionForSpot('First Peak', Number.NaN), null);
});

test('nearshore direction uses the wavenumber at its stated reference depth', () => {
  const omega = 2 * Math.PI / 14;
  const incidenceDeg = 48;
  const expected = wavenumberAt(omega, 15) * Math.sin(incidenceDeg * Math.PI / 180);
  close(referenceAlongshoreKappa(omega, incidenceDeg, 15), expected, 1e-12,
    '15 m reference kappa');
  close(referenceAlongshoreKappa(omega, incidenceDeg), alongshoreKappa(omega, incidenceDeg),
    1e-12, 'deep-water compatibility');
});

test('reference-depth Snell invariant round-trips the observed incidence', () => {
  const omega = 2 * Math.PI / 14;
  for (const incidentDeg of [12, 48, 78]) {
    const kappa = referenceAlongshoreKappa(omega, incidentDeg, 15);
    close(incidenceAt(omega, 15, kappa) * 180 / Math.PI, incidentDeg, 1e-9,
      `${incidentDeg} degree round trip`);
  }
});

test('refraction cache identity includes direction and reference depth', () => {
  const base = {
    spotName: 'First Peak', T: 14, tide: 0, bedShape: 0,
    swellDeg: 48, referenceDepthM: 15, xRef: 0,
  };
  assert.equal(refractionCacheKey(base), refractionCacheKey({ ...base }));
  assert.notEqual(refractionCacheKey(base), refractionCacheKey({ ...base, swellDeg: 49 }));
  assert.notEqual(refractionCacheKey(base), refractionCacheKey({ ...base, referenceDepthM: 14 }));
});

test('every mapped spot resolves both observed direction bounds', () => {
  const mapped = Object.entries(PP_GEO_DATA.profiles)
    .filter(([, profile]) => profile.contourFit.usable)
    .map(([name]) => name);
  assert.equal(mapped.length, 6);
  for (const spot of mapped) {
    for (const direction of [188, 216]) {
      const resolved = incidentDirectionForSpot(spot, direction);
      assert.ok(resolved, `${spot} at ${direction} degrees`);
      assert.ok(Math.abs(resolved.incidentDeg) <= 180,
        `${spot} incidence escaped the signed local frame`);
    }
  }
});

test('direction parameter parsing rejects fiction and clamps the measured range', () => {
  assert.equal(parseDirectionParam(null), null);
  assert.equal(parseDirectionParam(''), null);
  assert.equal(parseDirectionParam('not-a-bearing'), null);
  assert.equal(parseDirectionParam('194deg'), null);
  assert.equal(parseDirectionParam('170'), 188);
  assert.equal(parseDirectionParam('194'), 194);
  assert.equal(parseDirectionParam('230'), 216);
});

test('direction owns only the Psi phase arm and preserves authored alpha', () => {
  const authoredAlphaDeg = 50;
  const active = directionPhaseForSpot({
    psiEnabled: true, geoSpot: 'First Peak', waveFromDeg: 194, authoredAlphaDeg,
  });
  assert.equal(active.authoredAlphaDeg, authoredAlphaDeg);
  assert.equal(active.referenceDepthM, 15);
  close(active.incidentDeg, 62.7896, 1e-3, 'phase incidence');
  assert.deepEqual(refractionDirectionOptions(active), {
    swellDeg: active.incidentDeg,
    referenceDepthM: 15,
  }, 'the bake input must exclude authored alpha');

  assert.equal(directionPhaseForSpot({
    psiEnabled: false, geoSpot: 'First Peak', waveFromDeg: 194, authoredAlphaDeg,
  }), null, '#psi=0 must disable the direction phase arm');
  assert.equal(directionPhaseForSpot({
    psiEnabled: true, geoSpot: null, waveFromDeg: 194, authoredAlphaDeg: 31,
  }), null, 'Privates must retain the authored fallback');
  assert.equal(directionPhaseForSpot({
    psiEnabled: true, geoSpot: "Shark's Cove", waveFromDeg: 216, authoredAlphaDeg: 36,
  }), null, 'a seaward local propagation vector cannot feed shoreward Snell refraction');
});

test('shoreward phase rejects both exact contour-parallel boundaries', () => {
  assert.equal(isShorewardIncidentDeg(-90), false);
  assert.equal(isShorewardIncidentDeg(90), false);
  assert.equal(isShorewardIncidentDeg(-89.999), true);
  assert.equal(isShorewardIncidentDeg(89.999), true);
});

test('preset switching re-resolves direction instead of retaining the prior frame', () => {
  const state = makeState();
  applyPreset(state, 'firstpeak');
  const first = directionPhaseForSpot({
    psiEnabled: true, geoSpot: state.geoSpot, waveFromDeg: 194,
    authoredAlphaDeg: state.alpha,
  });
  applyPreset(state, 'thehook');
  const hook = directionPhaseForSpot({
    psiEnabled: true, geoSpot: state.geoSpot, waveFromDeg: 194,
    authoredAlphaDeg: state.alpha,
  });
  assert.notEqual(first.incidentDeg, hook.incidentDeg);
  assert.equal(first.authoredAlphaDeg, 50);
  assert.equal(hook.authoredAlphaDeg, 41);
});
