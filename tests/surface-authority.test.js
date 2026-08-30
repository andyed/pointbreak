// The rider and first-person camera must consume the displaced water the GPU
// actually draws. A CPU height twin drifted by metres once measured depth and
// shoaling became authoritative; mounting a camera on it put the eye inside
// the wave. These structural pins prevent that second source of truth from
// silently returning.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const query = read('../web-three/js/surface-query.js');
const surfer = read('../web-three/js/surfer.js');
const main = read('../web-three/js/main.js');
const controls = read('../docs/CONTROLS.md');

test('runtime surface authority compiles the shipped GPU geometry, not a replica', () => {
  assert.match(query, /import \{ SURFACE_PRELUDE, SURFACE_GLSL \} from '\.\/shaders\.js'/);
  assert.match(query, /fragmentShader: `\$\{SURFACE_PRELUDE\}\\n\$\{SURFACE_GLSL\}/);
  assert.match(query, /vec3 P = surfacePos\(xz, u_time/);
  assert.doesNotMatch(query, /oceanH|surfaceAt|model-js/,
    'the authoritative query must not call the deprecated CPU surface twin');
});

test('one batch returns P, Px and Pz and constructs GRID_VERT\'s normal', () => {
  assert.match(query, /const QUERY_W = 3/);
  assert.match(query, /xz\.x \+= u_query\.z/);
  assert.match(query, /xz\.y \+= u_query\.w/);
  assert.match(query, /readRenderTargetPixelsAsync\(target, 0, 0, QUERY_W, 1, pixels\)/);
  assert.match(query, /if \(!pending\)/,
    'the animation thread must not issue another query while the GPU fence is pending');
  assert.match(query, /result\.normal\.crossVectors\(dz, dx\)/,
    'normal must match GRID_VERT cross(Pz-P, Px-P) ordering');
});

test('authoritative rider placement is default, measured and reversible', () => {
  assert.match(main, /let riderSurfaceAuthoritative = true/);
  assert.match(main, /surfaceQuery\.sample\(currentRide\.x, currentRide\.z, queryMeta\)/);
  assert.match(main, /updateSurfer\(surferGroup, poseTime, riderP,[\s\S]{0,80}?ride: poseRide, surface: authoritative/);
  assert.match(main, /h\.get\('ridersurface'\) !== 'legacy'/);
  assert.match(surfer, /const authoritative = options\.surface\?\.valid === true/);
  assert.match(surfer, /authoritative \? surf\.position\.y : surf\.h/);
  assert.match(surfer, /group\.userData\.boardClearance/);
  assert.match(controls, /^\| `ridersurface` \| `legacy` \| GPU query \|/m);
});

test('POV is a scripted fail-closed rider camera, not a renamed Follow shot', () => {
  assert.match(main, /\{ name: 'POV'/);
  assert.match(main, /p\.name === 'POV'/);
  assert.match(main, /if \(pov && authoritative\)[\s\S]{0,180}?updatePovCam/);
  assert.match(main, /if \(pov && !authoritative\)[\s\S]{0,260}?povState\.ready = false/,
    'POV must not fall back to the metre-drift legacy surface');
  assert.match(main, /const wantsRiderVisible = state\.surfer === 1 && !pov/);
  assert.match(main, /surferGroup\.visible = wantsRiderVisible && Boolean\(canPlace\)/,
    'the procedural head must not surround the first-person eye');
  assert.match(main, /POV_MAX_ROLL_RAD = 8 \* Math\.PI \/ 180/);
  assert.match(main, /surfaceTilt \* 0\.18/);
  assert.doesNotMatch(main, /TOUR_SHOTS = \[[^\]]*POV/,
    'first person is intentional and must not appear in the unattended Tour');
});

test('POV exposes front-face position, clearance, roll, submersion and query cost as evidence', () => {
  assert.match(main, /povProbe: \(\) => \(\{/);
  for (const field of ['frontFaceOffsetM', 'clearance', 'eyeAboveSurface', 'upTiltDeg', 'cameraUnder', 'query']) {
    assert.match(main, new RegExp(`${field}:`), `povProbe missing ${field}`);
  }
  assert.match(main, /povState\.sourceZ - breakZAt\(povState\.sourceX/,
    'front-face evidence must be measured against the live baked break line');
  assert.match(query, /medianMs/);
  assert.match(query, /p95Ms/);
});
