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

// ---------------------------------------------------------------------------
// Direction sensitivity (added 2026-08-16, Track 3 prerequisite)
// ---------------------------------------------------------------------------
// The bound above is evaluated at sin(theta_s) = 1 — grazing incidence at the
// shelf. The FULL relation carries the incidence:
//
//       sin(alpha) = (c_b / c_s) * sin(theta_s)
//
// so an authored alpha implicitly DEMANDS an incidence. Inverting it turns the
// preset bank into a statement about the swell it assumes, which is exactly the
// quantity Track 3 wants to make an input.
//
// The measured operating band is now real, not estimated: CDIP MOP SC116, 25
// years, D_p p10-p90 = 188.8-213.8 deg = 25.0 deg wide, R = 0.989
// (docs/research/PP_CDIP_CLIMATOLOGY.md). With B_spot fixed per spot, a swing
// in D_p moves theta_s one-for-one.
//
// What this test pins, and why it matters more than it looks:
// the 2026-08-13 retarget moved every alpha to its own ceiling. A spot AT its
// ceiling is at grazing incidence, and sin() is flat there — so those spots are
// nearly IMMUNE to swell direction. The retarget bought physical defensibility
// and spent the dynamic range that Track 3c exists to exploit. That trade was
// never stated; this test states it.
const DP_BAND_HALF_DEG = 12.5;   // half of the measured 25.0 deg p10-p90 band

function demandedSinTheta(spot) {
  const hb = breakingDepth(spot.H0, spot.T);
  const hs = shelfDepthFor(spot);
  const r = celerity(spot.T, hb) / celerity(spot.T, hs);
  return { r, sinTs: Math.sin(spot.alpha * Math.PI / 180) / r };
}

// Spots whose authored alpha demands sin(theta_s) > 1 — unreachable under the
// straight-contour bound. Named, not silent, exactly like MEASURED_EXEMPT.
// firstpeak is separately exempt (apex rotation); the other three sit inside
// the ceiling test's 0.5 deg rounding headroom and so pass it while still
// asking for more incidence than exists.
const OVER_GRAZING = new Set(['firstpeak', 'jacks', 'sharks', 'privates']);

test('every authored alpha demands a physically reachable incidence', () => {
  const over = [];
  for (const spot of BANK) {
    const { sinTs } = demandedSinTheta(spot);
    if (sinTs > 1) over.push(spot.key);
  }
  assert.deepEqual(new Set(over), OVER_GRAZING,
    `spots demanding sin(theta_s) > 1 changed: ${over.join(', ')}. `
    + 'Either a target moved or the wedge geometry did. Update OVER_GRAZING '
    + 'deliberately — this set is the list of spots the straight-contour bound '
    + 'cannot supply, and it should be shrinking, not growing.');
});

test('direction sensitivity is bimodal, and MODEL.md 2.6.2 understates the spread', () => {
  // alpha swing across the measured 25 deg band, anchored at each spot's own
  // demanded incidence (clamped to grazing where it is unreachable).
  const swing = {};
  for (const spot of BANK) {
    const { r, sinTs } = demandedSinTheta(spot);
    const ts = Math.asin(Math.min(sinTs, 1)) * 180 / Math.PI;
    const at = (t) => Math.asin(Math.min(r * Math.sin(
      Math.min(Math.max(t, 0), 90) * Math.PI / 180), 1)) * 180 / Math.PI;
    const vals = [at(ts - DP_BAND_HALF_DEG), at(ts), at(Math.min(ts + DP_BAND_HALF_DEG, 90))];
    swing[spot.key] = Math.max(...vals) - Math.min(...vals);
  }
  // Sewers is the ONLY spot with real headroom below its ceiling (theta_s 56.9
  // deg), and it is 4x more direction-sensitive than every other spot. The
  // others are pinned near grazing where d(alpha)/d(theta_s) -> 0.
  assert.ok(swing.sewers > 10,
    `sewers should stay the direction-sensitive spot, got ${swing.sewers.toFixed(1)} deg`);
  for (const key of ['firstpeak', 'jacks', 'sharks', 'privates', 'thehook']) {
    assert.ok(swing[key] < 2.5,
      `${key} sits at its ceiling and should be direction-insensitive, `
      + `got ${swing[key].toFixed(1)} deg — if this rose, the bank gained headroom `
      + '(good for Track 3c) and MODEL.md 2.6.2 needs recomputing.');
  }
  // MODEL.md 2.6.2 claims "4-8 deg across the 90% band" for every spot. Six of
  // seven fall outside that, in both directions. Recorded as a standing check
  // so the doc and the bank cannot drift apart again.
  const inClaim = Object.values(swing).filter((s) => s >= 4 && s <= 8).length;
  assert.equal(inClaim, 0,
    'MODEL.md 2.6.2 says 4-8 deg for every spot; measured swings are 0.8-3.0 '
    + '(ceiling-pinned) or 12.5 (sewers). If any spot has entered 4-8, the bank '
    + 'has been re-anchored and MODEL.md 2.6.2 should be revisited.');
});
