import test from 'node:test';
import assert from 'node:assert/strict';

import { readHashParams, shouldShowControls, parseSpeedParam } from '../web-three/js/url-params.js';

test('permalink state is read from the hash payload', () => {
  const params = readHashParams('#preset=firstpeak&controls=1&section=1');
  assert.equal(params.get('preset'), 'firstpeak');
  assert.equal(params.get('controls'), '1');
  assert.equal(params.get('section'), '1');
});

test('controls is the authoritative visibility parameter', () => {
  assert.equal(shouldShowControls(readHashParams('#controls=1&hud=0'), { tour: true }), true);
  assert.equal(shouldShowControls(readHashParams('#controls=0&hud=1')), false);
});

test('legacy hud links and Tour defaults remain compatible', () => {
  assert.equal(shouldShowControls(readHashParams('#hud=0')), false);
  assert.equal(shouldShowControls(readHashParams('#hud=1'), { tour: true }), true);
  assert.equal(shouldShowControls(readHashParams('#cam=tour'), { tour: true }), false);
  assert.equal(shouldShowControls(readHashParams('#cam=cliff')), true);
});

test('speed accepts a real zero and clamps finite values', () => {
  assert.equal(parseSpeedParam('0'), 0);
  assert.equal(parseSpeedParam('-2'), 0);
  assert.equal(parseSpeedParam('9'), 4);
  assert.equal(parseSpeedParam('nope', 1.25), 1.25);
});
