import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { PRESETS } from '../shared/params.js';

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
const { reefAudit } = await import('../web-three/js/bed.js');

// The load-bearing M5 guarantees: the synthetic reef may only RAISE posts that
// are underwater, never deepen one, never lift one past the -0.5 m NAVD88
// ceiling, and never touch a dry post (shoreline, beach, cliff). Until now
// these were only checked by hand through Playwright via window.__pointbreak.
test('M5 clamp invariants hold on every mapped spot', () => {
  const spots = [...new Set(Object.values(PRESETS).map((p) => p.geoSpot).filter(Boolean))];
  assert.equal(spots.length, 6, 'six mapped spots (Privates is unmapped on purpose)');
  for (const spot of spots) {
    const a = reefAudit(spot);
    assert.ok(a, `${spot}: reef fit exists`);
    assert.ok(a.postsTouched > 0, `${spot}: the wedge actually augments the grid`);
    assert.equal(a.deepened, 0, `${spot}: no post deepened`);
    assert.equal(a.aboveCeil, 0, `${spot}: no wet post raised above the -0.5 m NAVD88 ceiling`);
    assert.equal(a.dryTouched, 0, `${spot}: no dry post touched`);
  }
});
