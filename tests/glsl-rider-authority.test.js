// One rider authority in web-three (MODEL.md 4.5).
//
// web-three splices shared/model-glsl.js wholesale into its shaders
// (web-three/js/shaders.js imports MODEL_GLSL), so the GLSL surferState() is
// COMPILED into every web-three program. Nothing calls it: the renderer reads
// the rider through the u_surferPos uniform, which main.js uploads once a frame
// from the single JS solve (m4RideSolve). Its only real call sites are the
// legacy web/ raymarcher.
//
// That is load-bearing rather than incidental. The u_breakMix > 0.5 arm returns
// the uniform, but the arm below it is a KINEMATIC twin that places the rider on
// the breakpoint in closed form. It agrees with the JS rider today only because
// the JS rider is also kinematic. The moment the rider gets his own velocity
// state and can be beaten by the peel (GAME_PROJECTION Track A), that body
// becomes a second, disagreeing answer to "where is the surfer".
//
// So the hazard is dormant, not absent, and the thing that wakes it is a new
// web-three call site. This test forbids one. If you are here because you added
// a legitimate call, the fix is not to relax the test: it is to delete the
// kinematic arm and have the GLSL read the uniform unconditionally, so there is
// one authority again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('no web-three source calls the GLSL surferState()', () => {
  const dir = join(ROOT, 'web-three', 'js');
  const offenders = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.js')) continue;
    // model-js.js exports a JS function of the same name (the documented
    // MODEL-TWIN of the authored path) and surfer.js calls THAT. Both take
    // (t, P); the GLSL one takes (t) alone, which is how they are told apart.
    const src = readFileSync(join(dir, name), 'utf8');
    src.split('\n').forEach((line, i) => {
      if (line.trimStart().startsWith('//')) return;
      // a GLSL-shaped call: surferState(<one arg, no comma>)
      if (/\bsurferState\(\s*[^,)]*\s*\)/.test(line) && !/surferState\([^)]*,/.test(line)) {
        offenders.push(`${name}:${i + 1}  ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(offenders, [],
    `web-three must read the rider from u_surferPos, not from the GLSL twin:\n${offenders.join('\n')}`);
});

test('the GLSL surferState() still hands web-three the uniform on the baked path', () => {
  const glsl = readFileSync(join(ROOT, 'shared', 'model-glsl.js'), 'utf8');
  const body = glsl.slice(glsl.indexOf('vec4 surferState(float t){'));
  assert.match(body.slice(0, 400), /if\s*\(u_breakMix\s*>\s*0\.5\)\s*return\s+u_surferPos;/,
    'the baked-line arm must return the uniform — that branch IS the single-authority guarantee');
});

test('main.js uploads u_surferPos from the one solve', () => {
  const main = readFileSync(join(ROOT, 'web-three', 'js', 'main.js'), 'utf8');
  const writes = main.split('\n').filter((l) => /u_surferPos\.value\.set\(/.test(l));
  assert.equal(writes.length, 1,
    `exactly one writer for u_surferPos, found ${writes.length}:\n${writes.join('\n')}`);
});
