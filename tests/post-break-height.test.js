import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BREAK_HEIGHT_ATTEN_PER_L,
  postBreakHeightRetention,
} from '../web-three/js/model-js.js';

const model = readFileSync(new URL('../shared/model-glsl.js', import.meta.url), 'utf8');

test('post-break height loss develops over local wavelengths instead of at the threshold', () => {
  const L = 60;
  assert.equal(postBreakHeightRetention(-5, L, 1), 1);
  assert.equal(postBreakHeightRetention(0, L, 1), 1);

  const quarter = postBreakHeightRetention(0.25 * L, L, 1);
  const one = postBreakHeightRetention(L, L, 1);
  const two = postBreakHeightRetention(2 * L, L, 1);
  assert.ok(quarter > 0.9, `quarter-wavelength retention ${quarter.toFixed(3)} is an abrupt collapse`);
  assert.ok(Math.abs(one - Math.exp(-BREAK_HEIGHT_ATTEN_PER_L)) < 1e-12);
  assert.ok(one > 0.69 && one < 0.71, `one-wavelength retention ${one.toFixed(3)} is not about 70%`);
  assert.ok(two > 0.49 && two < 0.51, `two-wavelength retention ${two.toFixed(3)} is not about 50%`);
  assert.ok(quarter > one && one > two, 'post-break height must decay monotonically with travel');
});

test('break weight blends dissipation without becoming the dissipation clock', () => {
  const full = postBreakHeightRetention(60, 60, 1);
  const partial = postBreakHeightRetention(60, 60, 0.4);
  const none = postBreakHeightRetention(60, 60, 0);
  assert.ok(full < partial && partial < none);
  assert.equal(none, 1);
});

test('GPU model uses local wavelength-scaled retention and has no instant 68% cut', () => {
  assert.match(model, /const float BREAK_HEIGHT_ATTEN_PER_L = 0\.35;/);
  assert.match(model, /float postBreakHeightRetention\(float runM, float localWaveLenM, float breakWeight\)/);
  assert.match(model, /float localWaveLen = 2\.0\*PI\/max\(kLocalAt\(xz\), 1e-3\);/);
  assert.match(model, /float decay = postBreakHeightRetention\(z - zb, localWaveLen, brkW\);/);
  assert.doesNotMatch(model, /1\.0 - 0\.68\*brk/);
});
