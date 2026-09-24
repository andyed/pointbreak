import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { PRESETS } from '../shared/params.js';
import { PP_DEPTH_DATA } from '../data/model/pp_depth_patches.js';

// bed.js imports the bare specifier 'three'; the browser resolves it through
// the import map in web-three/index.html. Mirror that map here so the M5
// composite runs headless. Module resolution only — no browser-API shims
// (DataTexture construction off-DOM is plain JS).
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') {
      return { url: new URL('../web-three/vendor/three.module.js', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const bed = await import('../web-three/js/bed.js');
const { reefAudit, reefFitFor, setReefFitMode, getReefFitMode, REEF_CREST_CEIL_EL, MSL_ABOVE_NAVD88, TIDE_RANGE } = bed;

const spots = [...new Set(Object.values(PRESETS).map((p) => p.geoSpot).filter(Boolean))];
const quantum = (PP_DEPTH_DATA.grid.elevMaxM - PP_DEPTH_DATA.grid.elevMinM) / 65535;

// The load-bearing M5 guarantees, as re-stated 2026-09-24 (the intertidal
// crest, research/REEF_REFIT_2026-09-24.md): the synthetic reef may only RAISE
// posts that are underwater, never deepen one, never touch a dry post
// (shoreline, beach, cliff: anything already at/above the -0.5 m NAVD88
// gate), and never lift a wet post past the arm's crest cap — the intertidal
// ceiling REEF_CREST_CEIL_EL on the shipped table arm, the old -0.5 m on the
// legacy arm. Posts lifted past the OLD cap are reported, not forbidden, on
// the table arm: that count is the exposed shelf the policy allows.
test('M5 clamp invariants hold on every mapped spot (table arm)', () => {
  assert.equal(getReefFitMode(), 'table');
  // Seven since the 2026-09-01 Private's mapped-bed candidate; the M5 invariants
  // below must hold on its wedge like any other.
  assert.equal(spots.length, 7, 'seven mapped spots');
  for (const spot of spots) {
    const a = reefAudit(spot);
    assert.ok(a, `${spot}: reef fit exists`);
    assert.ok(a.postsTouched > 0, `${spot}: the wedge actually augments the grid`);
    assert.equal(a.deepened, 0, `${spot}: no post deepened`);
    assert.equal(a.crestCeilEl, REEF_CREST_CEIL_EL, `${spot}: the table arm caps the crest at the intertidal ceiling`);
    assert.equal(a.aboveCeil, 0, `${spot}: no wet post raised above the ${REEF_CREST_CEIL_EL.toFixed(3)} m NAVD88 crest ceiling`);
    assert.equal(a.dryTouched, 0, `${spot}: no dry post touched`);
    assert.ok(Number.isFinite(a.aboveLegacyCeil), `${spot}: the audit must report the posts above the old -0.5 m cap`);
    // the crest cannot be shallower than the ceiling allows, and the fit says
    // where it is
    const fit = reefFitFor(spot);
    assert.ok(fit.crestDepthM >= MSL_ABOVE_NAVD88 - REEF_CREST_CEIL_EL - 1e-9, `${spot}: crest ${fit.crestDepthM} m is above the ceiling`);
    assert.ok(fit.targetEl <= REEF_CREST_CEIL_EL + 1e-9);
  }
});

test('the intertidal ceiling is derived from the datums the repo keeps, not retyped', () => {
  // MLLW + 0.1 m: MSL is +0.905 m NAVD88 at NOAA 9413450 (pp_depth_patches),
  // MLLW sits TIDE_RANGE[0] = -0.862 m below it, so the ceiling is +0.143 m
  // NAVD88, 0.762 m below MSL. A crest there is out of the water at MLLW.
  assert.equal(MSL_ABOVE_NAVD88, PP_DEPTH_DATA.mslAboveNavd88M);
  assert.equal(TIDE_RANGE[0], PP_DEPTH_DATA.tideRangeM[0]);
  assert.ok(Math.abs(REEF_CREST_CEIL_EL - (MSL_ABOVE_NAVD88 + TIDE_RANGE[0] + 0.1)) < 1e-12);
  assert.ok(Math.abs(REEF_CREST_CEIL_EL - 0.143) < 1e-9, `ceiling ${REEF_CREST_CEIL_EL}`);
  // the ceiling is above the old cap (a policy change) and still below MSL
  assert.ok(REEF_CREST_CEIL_EL > -0.5 && REEF_CREST_CEIL_EL < MSL_ABOVE_NAVD88);
  // and the shoreline gate is unchanged: a post at -0.5 m or above is never touched
  for (const spot of spots) assert.equal(reefAudit(spot).dryTouched, 0);
});

test('the legacy arm keeps the old cap as its crest ceiling, and the gate', () => {
  setReefFitMode('legacy');
  try {
    for (const spot of spots) {
      const a = reefAudit(spot);
      assert.equal(a.crestCeilEl, -0.5, `${spot}: legacy crest cap`);
      assert.equal(a.aboveCeil, 0, `${spot}: legacy arm lifted a wet post above -0.5 m`);
      assert.equal(a.aboveLegacyCeil, 0);
      assert.equal(a.dryTouched, 0);
      assert.equal(a.deepened, 0);
      assert.equal(a.fitMetric, 'legacy-break-line-bearing');
      // the lift is capped at REEF_AMP_MAX = 3.2 m before the +-15 % ridge
      // modulation; quantisation floors, so the cap survives to a quantum
      assert.ok(a.maxRaiseM > 0 && a.maxRaiseM <= 3.2 * 1.15 + quantum, `${spot}: max raise ${a.maxRaiseM}`);
    }
  } finally { setReefFitMode('table'); }
});
