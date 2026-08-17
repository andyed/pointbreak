import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { readHashParams, shouldShowControls, parseSpeedParam, parseFidelityLook,
         writeHashParams, needsReloadForHash, bootOnlyParams } from '../web-three/js/url-params.js';

test('permalink state is read from the hash payload', () => {
  const params = readHashParams('#preset=firstpeak&controls=1&section=1');
  assert.equal(params.get('preset'), 'firstpeak');
  assert.equal(params.get('controls'), '1');
  assert.equal(params.get('section'), '1');
});

test('controls is the authoritative visibility parameter', () => {
  assert.equal(shouldShowControls(readHashParams('#controls=1&hud=0'), { tour: true }), true);
  assert.equal(shouldShowControls(readHashParams('#controls=0&hud=1')), false);
});

test('legacy hud links and Tour defaults remain compatible', () => {
  assert.equal(shouldShowControls(readHashParams('#hud=0')), false);
  assert.equal(shouldShowControls(readHashParams('#hud=1'), { tour: true }), true);
  assert.equal(shouldShowControls(readHashParams('#cam=tour'), { tour: true }), false);
  assert.equal(shouldShowControls(readHashParams('#cam=cliff')), true);
});

test('speed accepts a real zero and clamps finite values', () => {
  assert.equal(parseSpeedParam('0'), 0);
  assert.equal(parseSpeedParam('-2'), 0);
  assert.equal(parseSpeedParam('9'), 4);
  assert.equal(parseSpeedParam('nope', 1.25), 1.25);
});

test('visual-fidelity look names the reversible three-way comparison', () => {
  assert.equal(parseFidelityLook(null), 0);
  assert.equal(parseFidelityLook('current'), 0);
  assert.equal(parseFidelityLook('foam'), 1);
  assert.equal(parseFidelityLook('FULL'), 2);
  assert.equal(parseFidelityLook('unknown'), 0);
});

test('the permalink writer emits only round-trip controls, in table order', () => {
  const hash = writeHashParams({
    tide: '-0.500', preset: 'firstpeak', month: 'december', cam: 'cliff',
    m4: '0', sim: '42', reefamp: '3.2',       // boot-only: must not appear
  });
  assert.equal(hash, 'preset=firstpeak&cam=cliff&month=december&tide=-0.500');
});

test('a default view serialises to a bare URL', () => {
  assert.equal(writeHashParams({
    surfer: '0', section: '0', audio: '0', speed: '1', bed: 'reef',
    preset: 'secondpeak', cam: 'free',
  }), '');
  // and with nothing supplied at all
  assert.equal(writeHashParams({}), '');
});

test('the site card is the default ocean; any month is a written choice', () => {
  // REPLACES 'January is the default month' (2026-08-16). While a global
  // DEFAULT_MONTH_KEY shipped, january was omitted from links as the default
  // and `month=card` was the explicit escape. That default was reverted — it
  // replaced all seven per-spot card H0s and removed the SHELTER_* calibration
  // input — so the polarity flips: a month is now always a reader's choice and
  // must survive a copied link.
  assert.equal(writeHashParams({ month: 'january' }), 'month=january');
  assert.equal(writeHashParams({ month: 'august', h0: '1.40' }), 'month=august&h0=1.40');
  // A bare view carries no month at all.
  assert.equal(writeHashParams({}), '');
});

test('the writer keeps real zeroes that a truthiness check would drop', () => {
  // speed=0 freezes the sim and h0=0 is a floor value; both are states a
  // reader can reach through the UI and must survive a copied link.
  assert.equal(writeHashParams({ speed: '0', h0: '0.40' }), 'h0=0.40&speed=0');
});

test('round-tripping a written hash reproduces the same values', () => {
  const snap = { preset: 'sharks', cam: 'lineup', month: 'december', tide: '0.250' };
  const back = readHashParams('#' + writeHashParams(snap));
  for (const [k, v] of Object.entries(snap)) assert.equal(back.get(k), v);
});

test('a hand-edited hash reloads only when the boot-only set changes', () => {
  // round-trip-only edits re-apply live, in both directions
  assert.equal(needsReloadForHash('#month=january&cam=cliff', '#month=august'), false);
  assert.equal(needsReloadForHash('#hud=0', ''), false);            // legacy alias
  // adding a boot-only flag
  assert.equal(needsReloadForHash('#month=january&m4=0', '#month=january'), true);
  assert.equal(needsReloadForHash('#sim=42', ''), true);
  assert.equal(needsReloadForHash('#nonsense=1', ''), true);        // unknown: reload beats lying
  // REMOVING one must reload too: m4Enabled was set at boot and the live path
  // never touches it, so the app would keep m4=0 while the URL claims default.
  assert.equal(needsReloadForHash('#month=august', '#month=july&m4=0'), true);
  // carrying the same boot-only flag through a control change does NOT reload
  assert.equal(needsReloadForHash('#month=august&m4=0', '#month=july&m4=0'), false);
  // order and round-trip params must not affect the comparison
  assert.equal(bootOnlyParams('#m4=0&sim=42&cam=cliff'), bootOnlyParams('#sim=42&m4=0&month=july'));
});

// Doc-parity gate: every hash param main.js parses has a CONTROLS.md row, and
// no row documents a param the runtime no longer reads. `controls`/`hud` are
// read through shouldShowControls() and `q` through an early standalone read,
// so the h.get/h.has scan cannot see them — whitelisted, still documented.
test('CONTROLS.md documents exactly the hash params main.js reads', () => {
  const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
  const main = read('../web-three/js/main.js');
  const doc = read('../docs/CONTROLS.md');
  const parsed = new Set([...main.matchAll(/\bh\.(?:get|has)\('([a-z0-9]+)'\)/g)].map((m) => m[1]));
  for (const k of ['controls', 'hud', 'q']) parsed.add(k);
  const documented = new Set([...doc.matchAll(/^\| `([a-z0-9]+)` \|/gm)].map((m) => m[1]));
  assert.deepEqual([...parsed].sort(), [...documented].sort());
});

// ---------------------------------------------------------------------------
// The default ocean is the site card's (regression, 2026-08-16)
// ---------------------------------------------------------------------------
// A global DEFAULT_MONTH_KEY shipped briefly and replaced all seven per-spot
// card H0s with one climatological value. That is not a size tweak: model-glsl
// SHELTER_* is calibrated by log-linear fit of the card bank's own H0 gradient
// (2.2 m at Sewers to 0.7 m at Private's, r^2 = 0.81), so one global H0 removes
// the calibration input. Measured, it collapsed the peel at the spots furthest
// from it — Sewers alpha 38 -> 5, First Peak 50 -> 1.
//
// It passed a green suite because every headless rig pinned `&month=card`,
// so the whole test surface read the card basis while the app booted January.
// This test is source-shaped on purpose: the invariant lives in a branch that
// no pure unit can reach, and the repo already pins doc-runtime parity the
// same way.
const MAIN_JS = readFileSync(
  new URL('../web-three/js/main.js', import.meta.url), 'utf8');

test('no module-level default month overrides the per-spot card oceans', () => {
  // Comments may DESCRIBE the reverted constant; code must not declare one.
  const code = MAIN_JS.split('\n')
    .filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.ok(!/DEFAULT_MONTH|MONTH_DEFAULT/.test(code),
    'a default-month constant is back. The default ocean must be each spot\'s '
    + 'card H0 — see shared/model-glsl.js SHELTER_*, whose calibration input IS '
    + 'the card H0 gradient. A seasonal default has to SCALE the card values by '
    + "the month's ratio, never replace them.");
});

test('a month is applied only when the hash asks for one', () => {
  const code = MAIN_JS.split('\n')
    .filter((l) => !l.trim().startsWith('//')).join('\n');
  const calls = [...code.matchAll(/setMonth\(([^)]*)\)/g)].map((m) => m[1].trim());
  // Expected: the hash branch, the drawer select, and setMonth's own recursion
  // guard are all fine; what must NOT exist is a bare literal month key.
  const literals = calls.filter((a) => /^['"][a-z]+['"]$/.test(a));
  assert.deepEqual(literals, [],
    `setMonth() is called with a hard-coded month: ${literals.join(', ')}. `
    + 'A month is opt-in via #month=; nothing may apply one on the reader\'s behalf.');
});

test('headless rigs are not pinned to a basis the app does not ship', () => {
  // The pin is what hid the regression. An instrument must measure the default
  // the product actually boots, or a green suite means nothing.
  for (const rig of ['measure_alpha_profile.mjs', 'measure_bspot.mjs']) {
    const src = readFileSync(new URL(`../scripts/${rig}`, import.meta.url), 'utf8');
    const code = src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
    assert.ok(!/month=card/.test(code),
      `${rig} pins month=card. That is how the 2026-08-16 default-ocean `
      + 'regression passed a green suite — every rig read the card basis while '
      + 'the app booted January. Measure what ships.');
  }
});
