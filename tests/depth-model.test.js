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

// ---------------------------------------------------------------------------
// The synthetic stage: what the depth path degenerates to when it is switched
// off, and which shipped terms are allowed to read it (2026-08-19).
// ---------------------------------------------------------------------------

const { PRESETS } = await import('../shared/params.js');
const { readFileSync } = await import('node:fs');
const SHADERS = readFileSync(path.join(ROOT, 'web-three/js/shaders.js'), 'utf8');
const MAIN = readFileSync(path.join(ROOT, 'web-three/js/main.js'), 'utf8');

test('crestCeilM is unreachable as a DEPTH limit on the synthetic stage', () => {
  // bedElevM is NOT gated by u_depthMix: with no patch bound it samples
  // bed.js's 1x1 all-zeros EMPTY_BED, decodes unit = 0, and returns
  // u_bedElev.x — the low edge of the RGBA8 quantization window. The depth the
  // whole ceiling is built on is therefore a STORAGE constant, not a seabed.
  const { elevMinM } = PP_DEPTH_DATA.grid;
  const depth = PP_DEPTH_DATA.mslAboveNavd88M - elevMinM;
  const GAMMA = 0.78;
  // Read back off the GPU at 576 station-reads over four clocks and the whole
  // stage: a flat 30.905 m everywhere. Pinned so a change to the storage
  // window cannot quietly move a number that reads as bathymetry.
  assert.ok(Math.abs(depth - 30.905) < 1e-6, `synthetic-stage depth ${depth} m`);
  // The point of the pin: gamma*h dwarfs every H0 the bank can reach, so
  // min(H0*Ks, gamma*h) never selects the depth branch and crestCeilM is
  // 0.8*VIS*H0*Ks in disguise. See MEASUREMENT_LESSONS 13.
  const maxH0Ks = Math.max(...Object.values(PRESETS).map((p) => p.H0)) * 2.6; // Ks cap
  assert.ok(GAMMA * depth > 4 * maxH0Ks,
    `gamma*h = ${GAMMA * depth} m is within reach of H0*Ks — the branch is live again`);
});

test('the crest-height instrument reports n/a rather than that number', () => {
  // The fix for the above lives in the PROBE, not in each reader: curlProbe
  // withholds the ceiling where there is no bed, the way the pixel corridor on
  // the same QA row already withholds a foam fraction where there is no baked
  // line. A reader that forgets to check then gets a null, not a wrong number.
  assert.match(MAIN, /u_depthMix > 0\.5 \? crestCeilM\(xz\) : -1\.0/);
  assert.match(MAIN, /ceil: buf\[c\] < 0 \? null : buf\[c\], bedBacked: buf\[c\] >= 0/);
});

test('no shipped preset keys a geometry term to that degenerate ceiling', () => {
  // dropMag's bend line is 0.35*crestCeilM and #curl's is 0.35*hCrest, and
  // neither is gated on u_depthMix. Both are scaled by
  // plunge = smoothstep(0.45, 1.25, xi), so on a bed-less preset with xi below
  // 0.45 they multiply zero and the degenerate reference cannot reach the
  // image — which is why Privates (xi 0.35) measures bit-identical across
  // #drop's two arms (0 differing fields, 576 station-reads). That is luck of
  // the bank, not design, so pin it: a synthetic site with xi >= 0.45 would
  // put 1.878*H0 into shipped geometry with no measured bed to validate it
  // against. Fix the reference before shipping such a preset.
  for (const [key, p] of Object.entries(PRESETS)) {
    if (p.geoSpot !== null) continue;
    assert.ok(p.xi < 0.45,
      `${key}: geoSpot null AND xi ${p.xi} >= 0.45 — dropMag's bend line would `
      + 'read crestCeilM on a stage that has no depth (MEASUREMENT_LESSONS 13)');
  }
  // ...and the gate that makes it so is still the one described above.
  assert.match(SHADERS, /float plunge = smoothstep\(0\.45, 1\.25, u_xi\);/);
  assert.match(SHADERS, /float yBendD = 0\.35\*crestCeilM\(depQ, KsQ\)/);
});
