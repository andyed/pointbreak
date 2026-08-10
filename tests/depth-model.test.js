// The seabed half of the real-data stage (build_geo_profiles.py fits the
// planform; build_depth_patches.py carries the depth). Same contract as
// geo-model.test.js: the generated module must be current with its sources,
// and the model must not quietly claim bathymetry it does not have.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { PP_DEPTH_DATA } = await import('../data/model/pp_depth_patches.js');
const { PP_GEO_DATA } = await import('../data/model/pp_geo_profiles.js');

test('generated depth module is current with its OSM/NCEI sources', () => {
  const out = execFileSync('python3',
    [path.join(ROOT, 'data/model/build_depth_patches.py'), '--check'],
    { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /^current:/m);
});

test('every mapped geo profile has a depth patch, and no unmapped one does', () => {
  const mapped = Object.entries(PP_GEO_DATA.profiles)
    .filter(([, p]) => p.contourFit?.usable).map(([n]) => n).sort();
  assert.deepEqual(Object.keys(PP_DEPTH_DATA.patches).sort(), mapped);
});

test('each patch actually contains a shoreline', () => {
  // The whole point of the depth field is that the beach is in frame. A patch
  // that is all water (or all land) would render as the old shoreless stage
  // while still reporting u_depthMix = 1.
  for (const [name, p] of Object.entries(PP_DEPTH_DATA.patches)) {
    assert.ok(p.landFractionAtMsl > 0.05 && p.landFractionAtMsl < 0.75,
      `${name}: land fraction ${p.landFractionAtMsl} — stage has no usable waterline`);
    assert.ok(p.elevMinM < 0 && p.elevMaxM > 0, `${name}: patch never crosses the datum`);
  }
});

test('water level is a cited datum, not a guessed constant', () => {
  // MSL - NAVD88 at NOAA CO-OPS 9413450 (Monterey). Guarded because the whole
  // depth field shifts with it, and an unsourced tweak here silently moves
  // every shoreline in the project.
  assert.equal(PP_DEPTH_DATA.mslAboveNavd88M, 0.905);
  assert.match(PP_DEPTH_DATA.mslSource, /9413450/);
});

test('quantization is storage, not a modelling choice', () => {
  const { elevMinM, elevMaxM } = PP_DEPTH_DATA.grid;
  const step = (elevMaxM - elevMinM) / 65535;
  assert.ok(step < 0.01, `elevation step ${step} m is coarse enough to be visible`);
});
