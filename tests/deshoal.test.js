// Pins scripts/lib/deshoal.mjs (JS, on dispersion.js) to scripts/audit_forcing.py
// (Python twin of the same Guo + finite-depth cg maths) through the audit's
// committed table. If either side drifts, the forcing audit's percentages stop
// describing the renderer.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shoalingKs, deshoalH0, SC116_SITE_DEPTH_M } from '../scripts/lib/deshoal.mjs';

const q1 = JSON.parse(readFileSync(
  new URL('../docs/research/assets/forcing-2026-09-23/q1_deshoal.json', import.meta.url), 'utf8'));

test('site depth matches the audit', () => {
  assert.equal(q1.mop_site_depth_m, SC116_SITE_DEPTH_M);
});

test('JS Ks agrees with the Python twin at 15.03 m and 10 m for every audited period', () => {
  for (const row of q1.per_period) {
    assert.ok(Math.abs(shoalingKs(row.T_s, SC116_SITE_DEPTH_M) - row['Ks_site_15.03m']) < 1e-4,
      `Ks(15.03) at T=${row.T_s}`);
    assert.ok(Math.abs(shoalingKs(row.T_s, 10) - row.Ks_10m) < 1e-4, `Ks(10) at T=${row.T_s}`);
  }
});

test('deshoalH0 inverts the shader re-shoal exactly at the site depth', () => {
  for (const T of [12, 13, 14, 15, 16, 17]) {
    const hs = 1.234;
    const h0 = deshoalH0(hs, T);
    assert.ok(Math.abs(h0 * shoalingKs(T, SC116_SITE_DEPTH_M) - hs) < 1e-12, `round trip at T=${T}`);
  }
});

test('deshoalH0 is finite-guarded', () => {
  assert.equal(deshoalH0(NaN, 15), null);
  assert.equal(deshoalH0(1, 0), null);
  assert.equal(deshoalH0(1, NaN), null);
});
