// The published upper bound on peel angle for a planar component, evaluated on
// THIS model's own dispersion physics and this bank's own conditions.
//
// Why this test exists. The reef-shape sweep (WEB_THREE_SPEC, "The reef-shape
// sweep") measured a ceiling: no wedge amplitude or flank width takes the
// stage-median peel angle much past ~45 deg, and the three spots whose authored
// targets are >= 58 deg plateau at 33-43. The literature says that ceiling is
// real and gives its mechanism (SURF_SCIENCE_REFS 2.3.2):
//
//   Snell over a slope turns crests toward shore-parallel as they shoal, so for
//   straight parallel contours the peel angle IS the incidence angle at
//   breaking, and
//         sin(alpha) / c_b = sin(theta_s) / c_s        (Henriquez 2004, eq. 3.5)
//   With sin(theta_s) <= 1 the bound follows immediately:
//         sin(alpha_max) = c_b / c_s
//
// c_b is the celerity at breaking depth, c_s the celerity where refraction over
// the component begins. The bound depends on those two depths and NOTHING about
// how big or how steep the component is — which is exactly why widening the
// wedge saturated.
//
// This is not a regression test on rendered output. It is a standing check that
// the model's authored targets stay inside the physics the model itself
// implements, so the next person to raise an alpha target finds out here rather
// than after another reef sweep.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { G, wavenumberAt, breakingDepth, GAMMA } from '../web-three/js/dispersion.js';

// Linear-theory phase speed at depth h: c = omega / k.
function celerity(T, h) {
  const omega = 2 * Math.PI / T;
  return omega / wavenumberAt(omega, h);
}

// sin(alpha_max) = c_b / c_s. Returns degrees, or null where the bound is
// vacuous (c_b >= c_s, i.e. no refraction contrast).
function peelCeilingDeg(T, hBreak, hShelf) {
  const r = celerity(T, hBreak) / celerity(T, hShelf);
  return r >= 1 ? null : Math.asin(r) * 180 / Math.PI;
}

// The bank is imported live (web/js/params.js), not copied: the whole point of
// this test is that the next person to edit an alpha target finds out here.
import { PRESETS } from '../web/js/params.js';
const BANK = Object.entries(PRESETS).map(([key, p]) =>
  ({ key, alpha: p.alpha, T: p.T, H0: p.H0 }));

// First Peak is exempt from the planar bound BY MEASUREMENT: it holds 50
// against a ~44 planar ceiling (stage-median 50.8 at the shipped shape). It
// sits at the apex, where the coast tangent carries ~111 deg of rotation
// (PP_MAP_GEOMETRY) — refraction the straight-contour bound cannot see. The
// exemption is named, not silent, so it cannot creep to other spots.
const MEASURED_EXEMPT = new Set(['firstpeak']);

// Where refraction over the Pleasure Point shore platform begins, PER SPOT:
// the wedge's own seaward edge. bed.js ends the reef where the natural bed
// falls more than REEF_AMP_MAX + 1.2 (the fade band) below the crest datum,
// and the crest sits at clamp(0.75 h_b, 1.2, 3.0) below MSL — so
// h_s = crestDepth + 3.2 + 1.2. This lands in the 5.6-7.3 m band, inside
// Henriquez's own h_s < 8 m threshold for alpha > 30.
const REEF_AMP_MAX = 3.2, REEF_FADE = 1.2;
function shelfDepthFor(spot) {
  const hb = breakingDepth(spot.H0, spot.T);
  const crestDepth = Math.min(Math.max(0.75 * hb, 1.2), 3.0);
  return crestDepth + REEF_AMP_MAX + REEF_FADE;
}
const SHELF_DEPTHS_M = [5, 6, 8];

test('Henriquez bound reproduces its own published figure', () => {
  // Figure 3.3: T = 16 s, H0 = 1.8 m, h_b ~ 1.75 m. Published peak alpha per
  // shelf depth, read off the figure: ~50 / 41.5 / 37 / 33 / 31 / 30 deg at
  // h_s = 3..8 m. Agreement to a few degrees is all a figure read-off supports.
  const expected = { 3: 50, 4: 41.5, 5: 37, 6: 33, 7: 31, 8: 30 };
  for (const [hs, want] of Object.entries(expected)) {
    const got = peelCeilingDeg(16, 1.75, Number(hs));
    assert.ok(got !== null, `bound vacuous at h_s = ${hs}`);
    assert.ok(Math.abs(got - want) < 4,
      `h_s = ${hs} m: bound ${got.toFixed(1)} deg vs published ~${want} deg`);
  }
});

test('the bound falls as the shelf deepens, and never depends on reef size', () => {
  // Monotonicity is the whole mechanism: deeper start -> more refraction before
  // breaking -> lower achievable peel. Nothing here takes a wedge dimension.
  const at = SHELF_DEPTHS_M.map((h) => peelCeilingDeg(14, 1.9, h));
  for (let i = 1; i < at.length; i++)
    assert.ok(at[i] < at[i - 1],
      `ceiling should fall with shelf depth: ${at[i - 1].toFixed(1)} -> ${at[i].toFixed(1)}`);
});

test('every authored alpha target sits inside its own per-spot ceiling', () => {
  // RETARGETED 2026-08-13 (Track 1c'-c.7). Before that date this test pinned
  // the contradiction (5 of 7 targets over the bound at every shelf depth
  // tried, the smallest spots asking for the highest angles); the bank now
  // carries each spot's own ceiling as its target, so the test's job flips:
  // it FAILS if anyone raises a target back over the physics, or edits the
  // wedge geometry in a way that lowers a ceiling below its target.
  const rows = [];
  for (const spot of BANK) {
    const hb = breakingDepth(spot.H0, spot.T);
    const hs = shelfDepthFor(spot);
    const ceil = peelCeilingDeg(spot.T, hb, hs);
    const exempt = MEASURED_EXEMPT.has(spot.key);
    const over = ceil !== null && spot.alpha > ceil + 0.5; // rounding headroom
    rows.push(`  ${spot.key.padEnd(11)} H0 ${String(spot.H0).padStart(4)}  h_b ${hb.toFixed(2)} m  `
      + `h_s ${hs.toFixed(2)} m  ceiling ${ceil === null ? ' --' : ceil.toFixed(1).padStart(5)}  `
      + `target ${String(spot.alpha).padStart(3)}  ${over ? (exempt ? 'over (measured exempt)' : 'OVER') : 'ok'}`);
    if (!exempt) {
      assert.ok(ceil !== null, `${spot.key}: bound vacuous — geometry changed?`);
      assert.ok(!over,
        `${spot.key}: target ${spot.alpha} exceeds its per-spot ceiling ${ceil.toFixed(1)} deg`);
    }
  }
  console.log(`\n  per-spot peel ceiling, sin(a_max) = c_b/c_s, h_s = wedge seaward edge:`);
  console.log(rows.join('\n') + '\n');

  // The mechanism, pinned so it cannot silently regress: smaller waves break
  // shallower, refract more, and get a LOWER bound — so down-point alpha must
  // FALL, not rise. Mead (2001) records the same effect measured at Raglan
  // (Hutt 1997): 15 deg vs 40 deg of offshore-to-break direction change for
  // 4 m vs 1 m waves on ONE bathymetry. "Mellow" down-point is sheltering
  // (H_eff), not peel angle.
  const sharks = BANK.find((s) => s.key === 'sharks');
  const sewers = BANK.find((s) => s.key === 'sewers');
  const ceilSharks = peelCeilingDeg(sharks.T, breakingDepth(sharks.H0, sharks.T), 6);
  const ceilSewers = peelCeilingDeg(sewers.T, breakingDepth(sewers.H0, sewers.T), 6);
  assert.ok(ceilSharks < ceilSewers,
    `the smaller spot should have the LOWER ceiling: sharks ${ceilSharks.toFixed(1)} vs sewers ${ceilSewers.toFixed(1)}`);
  assert.ok(sharks.alpha < sewers.alpha,
    'the bank must ask the smaller spot for the LOWER target — the pre-retarget contradiction resolved');
});
