// The stage -> world embedding (#mirror). See main.js "the stage -> world
// embedding" and research/MIRROR_VERIFICATION_2026-09-23.md.
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { PP_GEO_DATA } from '../data/model/pp_geo_profiles.js';
import { GRID_FRAG, BED_FRAG, FOG_GLSL, GRID_VERT, SKY_FRAG } from '../web-three/js/shaders.js';

const main = readFileSync(new URL('../web-three/js/main.js', import.meta.url), 'utf8');

test('every mapped profile\'s (along, up, shore) triad is left-handed, so the renderer must negate z', () => {
  const names = Object.keys(PP_GEO_DATA.profiles);
  assert.ok(names.length >= 6);
  for (const name of names) {
    const pr = PP_GEO_DATA.profiles[name];
    const [ax, ay] = pr.stageAlongENU, [sx, sy] = pr.stageShoreENU;
    // a x s in ENU (z = up): a proper rotation of (E, N) has a x s = +up
    const axs = ax * sy - ay * sx;
    assert.ok(axs > 0.99, `${name}: along x shore = ${axs} (not a rotation of ENU)`);
    // (a x up) . s with a = (ax, ay, 0), up = (0, 0, 1): a x up = (ay, -ax, 0)
    const handed = ay * sx - ax * sy;
    assert.ok(handed < -0.99, `${name}: (along x up) . shore = ${handed}; expected -1 (left-handed as (x, y, z))`);
  }
});

test('meshes hang under one root group whose z scale is the embedding sign; nothing else is added to the scene', () => {
  assert.match(main, /const Z_SIGN = MIRROR \? -1 : 1;/);
  assert.match(main, /const world = new THREE\.Group\(\);\s*\n\s*world\.scale\.z = Z_SIGN;/);
  const sceneAdds = [...main.matchAll(/\bscene\.add\(([A-Za-z_]+)\)/g)].map((m) => m[1]);
  assert.deepEqual(sceneAdds, ['world']);
  for (const m of ['waterMesh', 'sprayPoints', 'curtainMesh', 'splashUpMesh', 'bedMesh', 'skyMesh', 'surferGroup']) {
    assert.match(main, new RegExp(`world\\.add\\(${m}\\)`), `${m} must hang under world`);
  }
});

test('camera writes go through the embedding and the instrument API stays in stage coordinates', () => {
  assert.doesNotMatch(main, /camera\.position\.set\(\.\.\.p\.pos\(\)\)/);
  assert.doesNotMatch(main, /controls\.target\.set\(\.\.\.p\.target\(\)\)/);
  assert.match(main, /camera\.position\.set\(\.\.\.toWorld\(p\.pos\(\)\)\)/);
  assert.match(main, /setView: \(pos, target\) => \{ camera\.position\.set\(\.\.\.toWorld\(pos\)\)/);
  // the reads that feed stage-space lookups carry the sign
  assert.match(main, /cameraFloorY\(state\.geoSpot, v\.x, v\.z \* Z_SIGN/);
  assert.match(main, /oceanHJS\(camera\.position\.x, camera\.position\.z \* Z_SIGN/);
});

test('fragment shaders take the eye in stage coordinates, never three.js\'s world cameraPosition', () => {
  for (const [name, src] of Object.entries({ GRID_FRAG, BED_FRAG, FOG_GLSL, SKY_FRAG, GRID_VERT })) {
    assert.doesNotMatch(src, /\bcameraPosition\b/, `${name} reads world-space cameraPosition`);
  }
  assert.match(FOG_GLSL, /uniform vec3 u_camStage;/);
  assert.match(GRID_FRAG, /normalize\(u_camStage - vWorldPos\)/);
  assert.match(BED_FRAG, /length\(u_camStage - vBedPos\)/);
  assert.match(main, /u_camStage:\s*\{ value: new THREE\.Vector3\(\) \}/);
  assert.match(main, /uniforms\.u_camStage\.value\.copy\(skyMesh\.position\)/);
});

test('the audio pan follows screen-right, with the legacy world-x path kept for callers without it', () => {
  const sound = readFileSync(new URL('../web-three/js/sound.js', import.meta.url), 'utf8');
  assert.match(sound, /export function updateAudio\(camera, t, P, camUnder = false, rightStage = null\)/);
  assert.match(sound, /dx \* rightStage\.x \+ \(zCrest - camZ\) \* rightStage\.z/);
  assert.match(main, /updateAudio\(_audioCam, simTime, modelP\(\), uniforms\.u_camUnder\.value > 0\.5, _camRight\)/);
});
