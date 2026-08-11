import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeState, applyPreset } from '../web/js/params.js';
import { swellPhi } from '../web-three/js/model-js.js';

const model = readFileSync(new URL('../web/js/model-glsl.js', import.meta.url), 'utf8');
const shaders = readFileSync(new URL('../web-three/js/shaders.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../web-three/js/main.js', import.meta.url), 'utf8');

function glslConstant(name) {
  const match = model.match(new RegExp(`const float ${name} = ([0-9.]+);`));
  assert.ok(match, `missing GLSL constant ${name}`);
  return Number(match[1]);
}

function modelParams(state) {
  return {
    T: state.T, H0: state.H0, alphaRad: state.alpha*Math.PI/180,
    xi: state.xi, sections: state.sections, dF: state.dF,
    chop: state.chop, aframe: state.aframe, geoMix: state.geoMix,
    contourX2: state.contourX2, contourX3: state.contourX3,
    stageStart: state.stageStart, stageEnd: state.stageEnd, rideOffset: 0,
  };
}

test('breaker consequences share one canonical lifecycle clock', () => {
  assert.match(model, /vec4 breakerLifecycleAtX\(float x, float t\)/);
  assert.match(model, /vec4 life = breakerLifecycleAtX\(x, t\)/);
  assert.match(shaders, /breakerLifecycleAtX\(x0, u_time\)/);
});

test('structural pocket is compact and legacy remains reversible', () => {
  assert.match(model, /2\.0\*7\.5\*7\.5/);
  assert.match(model, /mix\(pocketLegacy, pocketCompact, clamp\(u_breakShape/);
  assert.match(main, /h\.get\('shape'\) === 'legacy'/);
  assert.match(main, /setBreakerShape/);
});

test('airborne whitewater is a separate deterministic render pass', () => {
  assert.match(main, /let seed = 0x51f15e/);
  assert.match(main, /new THREE\.Points\(makeSprayGeometry\(\), sprayMat\)/);
  assert.match(shaders, /export const SPRAY_VERT/);
  assert.match(shaders, /export const SPRAY_FRAG/);
});

test('First Peak crash head and wake reveal the physics-owned zipper', () => {
  const state = makeState();
  applyPreset(state, 'firstpeak');
  const phi = swellPhi(modelParams(state));
  const peelSpeed = (90/state.T)/Math.max(Math.sin(phi), 0.05);
  const headM = 2*glslConstant('CRASH_SIGMA_S')*peelSpeed;
  const wakeM = glslConstant('BORE_END_S')*peelSpeed;

  assert.ok(headM >= 12 && headM <= 18, `impact head ${headM.toFixed(1)} m`);
  assert.ok(wakeM >= 100 && wakeM <= 160, `foam wake ${wakeM.toFixed(1)} m`);
  assert.match(model, /1\.0 - smoothstep\(BORE_FADE_START_S, BORE_END_S, age\)/);
});
