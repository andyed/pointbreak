import test from 'node:test';
import assert from 'node:assert/strict';
import { GRID_VERT, GRID_FRAG } from '../web-three/js/shaders.js';

test('grid shaders carry the undisplaced source coordinate into the fragment', () => {
  assert.match(GRID_VERT, /varying vec2\s+vSourceXZ;/);
  assert.match(GRID_FRAG, /varying vec2\s+vSourceXZ;/);
  assert.match(GRID_VERT, /vSourceXZ\s*=\s*xz;/);
  assert.match(GRID_FRAG, /vec2 sourceXZ\s*=\s*vSourceXZ;/);
  assert.match(GRID_FRAG, /vec2 worldXZ\s*=\s*vWorldPos\.xz;/);
});

test('phase, breaker lifecycle and foam material history use source coordinates', () => {
  assert.match(GRID_FRAG, /rayPhase\(sourceXZ\)/);
  assert.match(GRID_FRAG, /foamSizeAt\(sourceXZ\.x\)/);
  assert.match(GRID_FRAG, /float zbC\s*=\s*breakLine\(sourceXZ\.x\)/);
  assert.match(GRID_FRAG, /breakerLifecycleAtX\(sourceXZ\.x, t\)/);
  assert.match(GRID_FRAG, /stripeAgeAt\(sourceXZ, t\)/);
  assert.match(GRID_FRAG, /vec2 axz\s*=\s*sourceXZ/);
  assert.match(GRID_FRAG, /sourceXZ\.y - breakLine\(sourceXZ\.x\)/);
  assert.match(GRID_FRAG, /vnoise2\(sourceXZ\*0\.35/);

  assert.doesNotMatch(GRID_FRAG, /rayPhase\(worldXZ/);
  assert.doesNotMatch(GRID_FRAG, /breakerLifecycleAtX\(worldXZ/);
  assert.doesNotMatch(GRID_FRAG, /stripeAgeAt\(worldXZ/);
  assert.doesNotMatch(GRID_FRAG, /foamSizeAt\(worldXZ/);
  assert.doesNotMatch(GRID_FRAG, /breakLine\(worldXZ/);
});

test('spatial substrate, modeled-domain coverage and lighting detail stay world-space', () => {
  assert.match(GRID_FRAG, /bedElevM\(worldXZ\)/);
  assert.match(GRID_FRAG, /wetSand\(worldXZ, t\)/);
  assert.match(GRID_FRAG, /provenanceAt\(worldXZ\)/);
  assert.match(GRID_FRAG, /kelpMask\(worldXZ, vDepth\)/);
  assert.match(GRID_FRAG, /detailGrad\(worldXZ, t\)/);
  assert.match(GRID_FRAG, /foamGrad\(worldXZ, t\)/);
});
