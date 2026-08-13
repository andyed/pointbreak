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

// The bank, as it ships (web/js/params.js). alpha is the authored target.
const BANK = [
  { key: 'sewers',     alpha: 38, T: 15, H0: 2.2 },
  { key: 'firstpeak',  alpha: 50, T: 14, H0: 1.8 },
  { key: 'secondpeak', alpha: 58, T: 14, H0: 1.5 },
  { key: 'jacks',      alpha: 62, T: 13, H0: 1.1 },
  { key: 'thehook',    alpha: 48, T: 13, H0: 1.5 },
  { key: 'sharks',     alpha: 66, T: 13, H0: 1.0 },
  { key: 'privates',   alpha: 70, T: 12, H0: 0.7 },
];

// Where refraction over the Pleasure Point shore platform begins. The reef's
// own cross-shore bound ends the wedge where the bed falls more than
// REEF_AMP_MAX + 1.2 below the crest datum (bed.js), which on these spots is
// roughly the 5-7 m contour; Henriquez's own threshold for reaching alpha > 30
// is h_s < 8 m. Both bracket the same band, so the bound is reported across it
// rather than at one assumed depth.
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

test('authored alpha targets vs the physics ceiling on this bank', () => {
  const rows = [];
  let overCount = 0;
  for (const spot of BANK) {
    const hb = breakingDepth(spot.H0, spot.T);
    const ceil = SHELF_DEPTHS_M.map((hs) => peelCeilingDeg(spot.T, hb, hs));
    const best = Math.max(...ceil.filter((v) => v !== null));
    const over = spot.alpha > best;
    if (over) overCount++;
    rows.push(`  ${spot.key.padEnd(11)} H0 ${String(spot.H0).padStart(4)}  h_b ${hb.toFixed(2)} m  `
      + `ceiling ${ceil.map((v) => v === null ? ' -- ' : v.toFixed(0).padStart(4)).join(' /')}  `
      + `target ${String(spot.alpha).padStart(3)}  ${over ? 'OVER' : 'ok'}`);
  }
  console.log(`\n  peel-angle ceiling, sin(a_max) = c_b/c_s, at h_s = ${SHELF_DEPTHS_M.join(' / ')} m:`);
  console.log(rows.join('\n'));
  console.log(`\n  ${overCount} of ${BANK.length} authored targets exceed the bound at EVERY shelf depth tried.\n`);

  // The finding this test pins down, so it cannot silently regress: the small-H0
  // down-point spots are the ones asking for the HIGHEST peel angles, and they
  // are the ones the physics constrains HARDEST — smaller waves break shallower,
  // refract more, and end up with a lower bound. Mead (2001) records the same
  // effect measured at Raglan (Hutt 1997): 15 deg vs 40 deg of offshore-to-break
  // direction change for 4 m vs 1 m waves on ONE bathymetry.
  const sharks = BANK.find((s) => s.key === 'sharks');
  const sewers = BANK.find((s) => s.key === 'sewers');
  const ceilSharks = peelCeilingDeg(sharks.T, breakingDepth(sharks.H0, sharks.T), 6);
  const ceilSewers = peelCeilingDeg(sewers.T, breakingDepth(sewers.H0, sewers.T), 6);
  assert.ok(ceilSharks < ceilSewers,
    `the smaller spot should have the LOWER ceiling: sharks ${ceilSharks.toFixed(1)} vs sewers ${ceilSewers.toFixed(1)}`);
  assert.ok(sharks.alpha > sewers.alpha,
    'and the bank asks the smaller spot for the HIGHER target — that is the contradiction');
});
