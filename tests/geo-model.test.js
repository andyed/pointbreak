import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import { PP_GEO_DATA } from '../data/model/pp_geo_profiles.js';
import { PRESETS, applyPreset, makeState } from '../shared/params.js';
import { coastCurve, reefWindow, surferState } from '../web-three/js/model-js.js';


function modelP(state) {
  return {
    T: state.T,
    H0: state.H0,
    alphaRad: state.alpha * Math.PI / 180,
    xi: state.xi,
    sections: state.sections,
    dF: state.dF,
    chop: state.chop,
    aframe: state.aframe,
    geoMix: state.geoMix,
    contourX2: state.contourX2,
    contourX3: state.contourX3,
    stageStart: state.stageStart,
    stageEnd: state.stageEnd,
  };
}


test('generated geo module is current with its OSM/NCEI sources', () => {
  execFileSync('python3', ['data/model/build_geo_profiles.py', '--check'], {
    cwd: new URL('..', import.meta.url),
    stdio: 'pipe',
  });
  assert.equal(PP_GEO_DATA.version, 1);
  assert.match(PP_GEO_DATA.generatedFrom.osmSha256, /^[a-f0-9]{64}$/);
  assert.match(PP_GEO_DATA.generatedFrom.bathySha256, /^[a-f0-9]{64}$/);
});


test('only truthfully mapped presets opt into Pleasure Point geo profiles', () => {
  // Every preset is now a real Pleasure Point site (the west-side names are
  // gone). Private's is the sole synthetic: its coastline defeats the cubic
  // contour fit, so it must NOT quietly inherit a neighbour's bathymetry.
  const expected = {
    sewers: 'Sewer Peak',
    firstpeak: 'First Peak',
    secondpeak: 'Second Peak',
    jacks: '38th',
    thehook: 'The Hook',
    sharks: "Shark's Cove",
    privates: null,
  };
  for (const [key, spot] of Object.entries(expected)) assert.equal(PRESETS[key].geoSpot, spot);

  const state = makeState();
  assert.equal(state.geoMix, 1);
  assert.equal(state.geoSpot, 'Second Peak');
  applyPreset(state, 'privates');
  assert.equal(state.geoMix, 0);
  assert.equal(state.geoSpot, null);
  applyPreset(state, 'jacks');
  assert.equal(state.geoMix, 1);
  assert.equal(state.geoSpot, '38th');
});


test('mapped profiles use measured curvature and OSM validity bounds', () => {
  for (const key of ['jacks', 'secondpeak', 'firstpeak', 'thehook']) {
    const state = makeState();
    applyPreset(state, key);
    const P = modelP(state);
    const profile = PP_GEO_DATA.profiles[state.geoSpot];
    assert.equal(profile.contourFit.usable, true);
    assert.ok(profile.contourFit.rmseM < 2);
    assert.equal(state.stageStart, profile.stageBoundsM[0]);
    assert.equal(state.stageEnd, profile.stageBoundsM[1]);
    assert.ok(reefWindow(0, P) > 0.95);
    assert.ok(Math.abs(coastCurve(state.stageEnd + 100, P) - coastCurve(state.stageEnd, P)) < 1e-12);
  }
});


test('the synthetic site keeps the original quadratic, and A-frame stays a parameter', () => {
  const state = makeState();
  applyPreset(state, 'privates');
  let P = modelP(state);
  assert.equal(coastCurve(100, P), 2);

  // No preset ships aframe = 1 any more: the A-frame is a mechanism, and the
  // wave that demonstrates it is on the west side. It must still work when
  // set directly, and must stay finite.
  assert.ok(Object.values(PRESETS).every((p) => p.aframe === 0));
  P = { ...modelP(state), aframe: 1 };
  assert.equal(coastCurve(-100, P), coastCurve(100, P));
  for (const t of [0, 10, 42]) {
    const surfer = surferState(t, P);
    assert.ok(Object.values(surfer).every(Number.isFinite));
  }
});
