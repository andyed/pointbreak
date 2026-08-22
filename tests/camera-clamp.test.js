// The world-collision camera clamp: its floor must be a MEASUREMENT of the
// surface that is actually drawn, or an explicit "unknown" — never a sentinel
// wearing a measurement's clothes.
//
// Two defects are pinned here, both found 2026-08-21 from a screenshot of the
// eye sitting under the seabed looking up at the underside of the land:
//
//   1. bedElevBlended() returns BED_UNKNOWN (-999) when no grid is bound, and
//      the clamp consumed that as `floorY`. At Privates (geoSpot null) the eye
//      fell a kilometre through the world and STAYED there — measured 269 m
//      below the drawn ground when released, 982 m under a held pan. Same
//      class as crestCeilM collapsing onto the RGBA8 quantization edge at
//      u_depthMix = 0 (MEASUREMENT_LESSONS 13).
//   2. The floor was metres NAVD88 while every drawn surface is metres
//      relative to the water (BED_VERT: bedElevM(xz) - u_waterLevel), so the
//      clamp guarded a surface u_waterLevel away from the visible one — and
//      moved with the tide, which no collision floor should.
//
// Plus the ordering defect that made both visible: an EASED floor is a
// suggestion. Half-recovery per frame, applied after controls.update(), is
// outrun by any input that lowers the eye faster than that.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { PRESETS } from '../shared/params.js';

// bed.js imports the bare specifier 'three'; mirror web-three/index.html's
// import map so it resolves headless (same shim as reef-audit.test.js).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') {
      return { url: new URL('../web-three/vendor/three.module.js', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const { bedElevBlended, bedElevAt, cameraFloorY, hasBedGrid,
        BED_UNKNOWN, UNMAPPED_DIP_M, MSL_ABOVE_NAVD88 } = await import('../web-three/js/bed.js');
const { PP_DEPTH_DATA } = await import('../data/model/pp_depth_patches.js');

const MAPPED = Object.keys(PP_DEPTH_DATA.patches);
const SHAPES = [0, 1, 2];               // reef / plane / measured (M5 three-way)
const { x0, x1, z0, z1, elevMinM, elevMaxM } = PP_DEPTH_DATA.grid;
// Stations spread across the patch, including its own corners.
const STATIONS = [];
for (const fx of [0, 0.27, 0.5, 0.73, 1]) for (const fz of [0, 0.31, 0.5, 0.69, 1])
  STATIONS.push([x0 + (x1 - x0) * fx, z0 + (z1 - z0) * fz]);
// ...and stations well OUTSIDE it, out to the clamp's own x/z bounds.
const OUTSIDE = [[-1200, -1000], [1200, 1000], [0, 1000], [-1200, 0], [900, -800]];

test('the unmapped site is still unmapped (the case that produced the sentinel)', () => {
  assert.equal(PRESETS.privates.geoSpot, null,
    'Privates carries no OSM surf node; if that changes, re-derive this test');
  assert.ok(!MAPPED.includes("Private's"));
});

test('no grid means hasBedGrid is false and the read is the NAMED sentinel', () => {
  for (const spot of [null, undefined, '', "Private's", 'Not A Spot']) {
    for (const shape of SHAPES) {
      assert.equal(hasBedGrid(spot, shape), false, `hasBedGrid(${spot}, ${shape})`);
      assert.equal(bedElevBlended(spot, 0, 0, shape), BED_UNKNOWN);
    }
    assert.equal(bedElevAt(spot, 0, 0), BED_UNKNOWN);
  }
});

// THE PIN. A missing grid must not become a permissive floor.
test('cameraFloorY is null wherever the bed is unknown — never a number', () => {
  for (const spot of [null, undefined, '', "Private's", 'Not A Spot']) {
    for (const shape of SHAPES) {
      for (const [x, z] of [...STATIONS, ...OUTSIDE]) {
        const f = cameraFloorY(spot, x, z, shape, MSL_ABOVE_NAVD88);
        assert.equal(f, null,
          `cameraFloorY(${spot}, ${x}, ${z}, ${shape}) must be null, got ${f}`);
      }
    }
  }
});

test('the clamp floor is never a sentinel where the bed IS known', () => {
  // Every value the clamp can consume at a mapped spot has to be a real
  // elevation: finite, not BED_UNKNOWN, and inside the grid's own storage
  // window. -30 m NAVD88 (elevMinM) is the low edge of the RGBA8 quantization
  // window and is what EMPTY_BED decodes to, so a floor that lands exactly
  // there is the OTHER sentinel and fails too.
  for (const spot of MAPPED) {
    for (const shape of SHAPES) {
      assert.ok(hasBedGrid(spot, shape), `${spot} shape ${shape} should have a grid`);
      for (const [x, z] of [...STATIONS, ...OUTSIDE]) {
        for (const tide of [-0.862, 0, 0.764]) {
          const wl = MSL_ABOVE_NAVD88 + tide;
          const f = cameraFloorY(spot, x, z, shape, wl);
          assert.ok(Number.isFinite(f), `${spot}/${shape} @ ${x},${z}: not finite`);
          assert.notEqual(f, BED_UNKNOWN);
          assert.notEqual(f, BED_UNKNOWN - wl);
          assert.ok(f > elevMinM - wl && f < elevMaxM - wl,
            `${spot}/${shape} @ ${x},${z}: floor ${f} outside the storage window`);
          assert.notEqual(Number(f.toFixed(6)), Number((elevMinM - wl).toFixed(6)),
            `${spot}/${shape} @ ${x},${z}: floor sits on the quantization edge`);
        }
      }
    }
  }
});

test('the floor is water-relative, the datum every drawn surface uses', () => {
  // BED_VERT draws the seabed at `bedElevM(xz) - u_waterLevel`, and the water
  // grid's land path does the same, so the clamp has to be in that frame too.
  // A floor that changes with the tide relative to the DRAWN ground would be
  // guarding a surface nobody can see.
  for (const spot of MAPPED.slice(0, 3)) {
    for (const shape of SHAPES) {
      for (const [x, z] of STATIONS) {
        const navd = bedElevBlended(spot, x, z, shape);
        for (const tide of [-0.862, 0, 0.764]) {
          const wl = MSL_ABOVE_NAVD88 + tide;
          assert.equal(cameraFloorY(spot, x, z, shape, wl), navd - wl);
        }
      }
    }
  }
});

test('the unmapped dip is a declared limit, not a decoded one', () => {
  assert.ok(Number.isFinite(UNMAPPED_DIP_M) && UNMAPPED_DIP_M > 0);
  // It must not be either sentinel, nor the storage window it would be easy to
  // reach for: the point of the constant is that there is nothing to measure.
  assert.notEqual(-UNMAPPED_DIP_M, BED_UNKNOWN);
  assert.notEqual(-UNMAPPED_DIP_M, elevMinM);
  assert.ok(UNMAPPED_DIP_M < Math.abs(elevMinM),
    'a dip as deep as the storage window is the sentinel by another route');
});

// ---- the clamp itself, read from main.js ----
const MAIN = readFileSync(new URL('../web-three/js/main.js', import.meta.url), 'utf8');
const CLAMP = MAIN.slice(MAIN.indexOf('world-collision clamp'),
                         MAIN.indexOf('skyMesh.position.copy'));

test('the clamp reads cameraFloorY, not the NAVD88 elevation', () => {
  assert.ok(CLAMP.includes('cameraFloorY('), 'clamp must go through cameraFloorY');
  assert.ok(!CLAMP.includes('bedElevBlended('),
    'the raw NAVD88 read is the datum defect; go through cameraFloorY');
  assert.ok(CLAMP.includes('u_waterLevel'),
    'the floor has to be expressed against the water level the bed is drawn against');
});

test('the floor is HARD — an eased constraint is one a held input outruns', () => {
  assert.ok(/v\.y\s*=\s*floorY/.test(CLAMP),
    'the eye must be AT the floor at the end of a frame, not part-way back to it');
  assert.ok(!/v\.y\s*\+=\s*\(floorY - v\.y\)/.test(CLAMP),
    'half-recovery per frame is outrun by any faster input (a held OrbitControls '
    + 'pan is ~15 m/frame from a 700 m orbit) and holds the eye under permanently');
});

test('#noclip=1 still turns the whole clamp off (x-ray debugging)', () => {
  assert.ok(/if \(!noclipEnabled\)/.test(CLAMP));
  assert.ok(MAIN.includes("h.get('noclip') === '1'"));
});
