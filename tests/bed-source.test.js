// The bathymetry-source switch (scripts/lib/bed-source.mjs) must be inert by
// default and must rewrite exactly the two generated data modules, wherever
// they are imported from, when a tag is given. The builders' default outputs
// are pinned byte-for-byte by geo-model.test.js / depth-model.test.js
// (`--check`); this pins the redirect and the flag parsing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

import { redirectSpecifier, bedSourceTag, BED_MODULES } from '../scripts/lib/bed-source.mjs';

test('no tag: every specifier passes through untouched', () => {
  for (const s of ['../../data/model/pp_geo_profiles.js', '../data/model/pp_depth_patches.js', 'three', './bed.js'])
    assert.equal(redirectSpecifier(s, ''), s);
});

test('a tag rewrites only the two generated data modules, from any relative depth', () => {
  assert.equal(redirectSpecifier('../../data/model/pp_geo_profiles.js', 'cudem19'),
               '../../data/model/pp_geo_profiles.cudem19.js');
  assert.equal(redirectSpecifier('../data/model/pp_depth_patches.js', 'ncei13_wide'),
               '../data/model/pp_depth_patches.ncei13_wide.js');
  // not a data module: unchanged
  assert.equal(redirectSpecifier('../../data/model/pp_bspot.json', 'cudem19'), '../../data/model/pp_bspot.json');
  assert.equal(redirectSpecifier('../web-three/js/bed.js', 'cudem19'), '../web-three/js/bed.js');
  assert.deepEqual(BED_MODULES, ['pp_geo_profiles', 'pp_depth_patches']);
});

test('the flag wins over the environment, and the shipped aliases mean no tag', () => {
  assert.equal(bedSourceTag(['node', 'x.mjs'], {}), '');
  assert.equal(bedSourceTag(['node', 'x.mjs'], { POINTBREAK_BED: 'cudem19' }), 'cudem19');
  assert.equal(bedSourceTag(['node', 'x.mjs', '--bed=ncei13_wide'], { POINTBREAK_BED: 'cudem19' }), 'ncei13_wide');
  for (const alias of ['shipped', 'default', 'ncei13'])
    assert.equal(bedSourceTag(['node', 'x.mjs', `--bed=${alias}`], {}), '');
});

test('the builders reject a grid that does not exist instead of writing anything', () => {
  for (const script of ['data/model/build_geo_profiles.py', 'data/model/build_depth_patches.py']) {
    let code = 0;
    try {
      execFileSync('python3', [script, '--bathy', 'pp_bathy_nonexistent.json'],
                   { cwd: new URL('..', import.meta.url), stdio: 'pipe' });
    } catch (e) { code = e.status; }
    assert.equal(code, 2, `${script} should exit 2 on a missing grid`);
  }
});
