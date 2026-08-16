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
    preset: 'secondpeak', cam: 'free', month: 'january',
  }), '');
  // and with nothing supplied at all
  assert.equal(writeHashParams({}), '');
});

test('January is the default month; the site card is the explicit state', () => {
  // The shipped ocean (month=january) must not appear in a copied link…
  assert.equal(writeHashParams({ month: 'january' }), '');
  // …while stepping OFF the default onto the site card must be written,
  // because a bare URL now means January, not "no month".
  assert.equal(writeHashParams({ month: 'card' }), 'month=card');
  assert.equal(writeHashParams({ month: 'card', h0: '1.40' }), 'month=card&h0=1.40');
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
