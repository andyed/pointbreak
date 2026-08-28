// Marine-layer fog dial + drifting banks (2026-08-27).
//
// The fog law was duplicated as literal constants in GRID_FRAG and BED_FRAG
// ("shared verbatim" by discipline alone); FOG_GLSL replaced that with one
// spliced chunk. What is pinned here:
//
//   1. every fogging shader gets the law from the ONE chunk — no shader can
//      re-grow a private FOG_DENSITY that drifts from the others;
//   2. each assembled shader declares u_fogAmt exactly once (SKY_GLSL owns
//      the declaration; a second one is a compile error that only shows up
//      at runtime shader compile, which node tests never reach);
//   3. the shipped defaults are the neutral element: u_fogAmt 1, u_fogBank 0,
//      and the bank multiplier collapses to mix(x, y, 0) = x — the pre-knob
//      image, exactly (x1.0 is exact in IEEE);
//   4. the conditions bank: `foggy` is the only day carrying fog fields, and
//      applyConditionDay resets fog on EVERY day so a socked-in morning
//      cannot leak into the next day of a drift cycle.
//
// Like peel-floor.test.js, conditions.js itself is not loadable under
// `node --test` (it pulls TIDE_RANGE from bed.js, which imports three), so
// the bank and the reset semantics are checked source-shaped.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { GRID_FRAG, BED_FRAG, SKY_FRAG, SKY_GLSL, FOG_GLSL }
  from '../web-three/js/shaders.js';
import { ROUND_TRIP_PARAMS, writeHashParams } from '../web-three/js/url-params.js';
import { burnoffFog, BURNOFF_START, BURNOFF_TAU_S, BURNOFF_BANK }
  from '../web-three/js/fog.js';

const CONDITIONS_SRC = readFileSync(
  new URL('../web-three/js/conditions.js', import.meta.url), 'utf8');
const MAIN_SRC = readFileSync(
  new URL('../web-three/js/main.js', import.meta.url), 'utf8');

const count = (haystack, needle) => haystack.split(needle).length - 1;

test('one fog law: both fogging surfaces splice FOG_GLSL, no private constants', () => {
  for (const [name, src] of [['GRID_FRAG', GRID_FRAG], ['BED_FRAG', BED_FRAG]]) {
    assert.ok(src.includes(FOG_GLSL), `${name} must splice FOG_GLSL`);
    assert.equal(count(src, 'const float FOG_DENSITY'), 1,
      `${name}: FOG_DENSITY defined once, in the chunk`);
    assert.equal(count(src, 'const float HAZE_H'), 1,
      `${name}: HAZE_H defined once, in the chunk`);
    assert.ok(count(src, 'fogAmount(') >= 2,
      `${name}: the chunk's fogAmount() is defined and called`);
    // the pre-chunk inline law must be gone — its survival anywhere would be
    // exactly the drift the chunk exists to make impossible
    assert.ok(!src.includes('inLayerL') && !src.includes('inLayerB'),
      `${name}: no inlined fog arithmetic outside fogAmount()`);
  }
});

test('the horizon floor finishes the fade at any dial value', () => {
  // the JS mirror of FOG_GLSL's floor: by the far skirt (main.js FAR_EXTENT
  // 4000, floor complete at 4100) the fade must be 1.0 even at the dial's
  // minimum, or the skirt prints as a silvered edge ("minimum fog is not
  // great"). The floor's start stretches toward the eye as the dial thins,
  // so the fade occupies enough of the grazing ray to read as distance.
  assert.ok(FOG_GLSL.includes('mix(1200.0, 2400.0, clamp(u_fogAmt, 0.0, 1.0))'));
  assert.ok(FOG_GLSL.includes('smoothstep(floorStart, 4100.0, dist)'));
  const ss = (a, b, x) => { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  const fogAt = (dist, amt) => Math.max(1 - Math.exp(-dist * 0.0011 * amt),
    ss(1200 + 1200 * Math.min(Math.max(amt, 0), 1), 4100, dist));
  assert.equal(fogAt(4100, 0), 1, 'crystal air must still dissolve the skirt');
  assert.equal(fogAt(4100, 0.3), 1);
  // ...and at the shipped density the floor stays under the exponential
  // through the working range, so the default image is untouched there
  for (let d = 0; d <= 3900; d += 100)
    assert.ok(ss(2400, 4100, d) <= 1 - Math.exp(-d * 0.0011) + 1e-9,
      `floor overtakes the shipped curve at ${d} m`);
});

test('u_fogAmt declared exactly once per assembled shader (SKY_GLSL owns it)', () => {
  assert.ok(SKY_GLSL.includes('uniform float u_fogAmt;'));
  for (const [name, src] of
      [['GRID_FRAG', GRID_FRAG], ['BED_FRAG', BED_FRAG], ['SKY_FRAG', SKY_FRAG]]) {
    assert.equal(count(src, 'uniform float u_fogAmt;'), 1,
      `${name}: duplicate/missing u_fogAmt declaration`);
  }
});

test('sky dome socks in from the same dial the surface fog reads', () => {
  // the sock blend lives inside skyColor() so fog-toward-sky and the dome
  // cannot disagree; the dome material must therefore receive the uniform
  assert.ok(SKY_GLSL.includes('smoothstep(1.5, 4.0, u_fogAmt)'));
  assert.match(MAIN_SRC,
    /uniforms:\s*\{[^}]*u_fogAmt:\s*uniforms\.u_fogAmt[^}]*\}/,
    'skyMat must share the u_fogAmt uniform object');
});

test('shipped defaults are the neutral element', () => {
  assert.match(MAIN_SRC, /u_fogAmt:\s*\{\s*value:\s*1\s*\}/);
  assert.match(MAIN_SRC, /u_fogBank:\s*\{\s*value:\s*0\s*\}/);
  // bank multiplier collapses to 1.0 via mix(1.0, _, 0.0); the JS mirror of
  // that identity, so the neutrality claim is executed, not just asserted
  const mix = (a, b, k) => a * (1 - k) + b * k;
  assert.equal(mix(1.0, 0.30 + 2.3 * 0.7, 0.0), 1.0);
});

test('fog/bank/burnoff are round-trip controls with defaults omitted', () => {
  for (const k of ['fog', 'bank', 'burnoff'])
    assert.ok(ROUND_TRIP_PARAMS.includes(k), `${k} must round-trip (drawer control)`);
  // a default-state view serialises to a bare URL — the permalink contract
  assert.equal(writeHashParams({ fog: '1', bank: '0', burnoff: '0' }), '');
  const set = writeHashParams({ fog: '2.5', bank: '0.6', burnoff: '1' });
  assert.equal(set, 'fog=2.5&bank=0.6&burnoff=1');
});

test('burn-off is a dawn-anchored envelope that only ever adds fog', () => {
  const halfBurn = BURNOFF_TAU_S * Math.LN2;   // k = 0.5
  // dawn: socked in, and the sheet is UNIFORM — banks are earned by burning
  const dawn = burnoffFog(1, 0, 0);
  assert.equal(dawn.fog, BURNOFF_START);
  assert.equal(dawn.bank, 0);
  // half-burnt: banks peak at exactly the authored depth
  const mid = burnoffFog(1, 0, halfBurn);
  assert.ok(Math.abs(mid.bank - BURNOFF_BANK) < 1e-9, 'banks peak at k=0.5');
  assert.ok(mid.fog > 1 && mid.fog < BURNOFF_START);
  // burnt out: converges on the base the reader dialled
  const late = burnoffFog(1, 0, BURNOFF_TAU_S * 20);
  assert.ok(Math.abs(late.fog - 1) < 1e-3 && late.bank < 1e-3);
  // fog decays monotonically — the morning never re-thickens
  let prev = Infinity;
  for (let t = 0; t <= 1200; t += 30) {
    const { fog } = burnoffFog(1, 0, t);
    assert.ok(fog <= prev + 1e-12, `fog re-thickened at t=${t}`);
    prev = fog;
  }
  // a base thicker than dawn is left alone, not thinned by its own sunrise
  assert.equal(burnoffFog(6, 0.8, 0).fog, 6);
  assert.equal(burnoffFog(6, 0.8, BURNOFF_TAU_S * 20).bank, 0.8);
  // NaN guards (house rule): garbage in, clear day out
  const bad = burnoffFog(NaN, undefined, NaN);
  assert.ok(Number.isFinite(bad.fog) && Number.isFinite(bad.bank));
});

test('foggy is the only day carrying fog fields, and every day resets fog', () => {
  const days = [...CONDITIONS_SRC.matchAll(
    /\{\s*key:\s*'([a-z]+)'[^}]*\}/g)].map((m) => ({ key: m[1], body: m[0] }));
  assert.ok(days.length >= 7, 'condition bank parse failed');
  for (const d of days) {
    if (d.key === 'foggy') {
      const fog = Number(d.body.match(/fog:\s*([0-9.]+)/)[1]);
      const bank = Number(d.body.match(/fogBank:\s*([0-9.]+)/)[1]);
      assert.ok(fog > 1.5, 'foggy day must be visibly socked in');
      assert.ok(bank > 0 && bank <= 1, 'foggy day banks in (0, 1]');
      assert.ok(d.body.includes('good: true'),
        'foggy is a surf-worthy day — the drift curator should visit it');
    } else {
      assert.ok(!/fog(Bank)?:/.test(d.body),
        `${d.key}: fog fields belong to foggy alone — clear days reset by omission`);
    }
  }
  // the reset: applyConditionDay writes fog unconditionally, defaulting clear
  assert.match(CONDITIONS_SRC, /state\.fog\s*=\s*d\.fog\s*\?\?\s*1/);
  assert.match(CONDITIONS_SRC, /state\.fogBank\s*=\s*d\.fogBank\s*\?\?\s*0/);
});

test('#fog= / #bank= are clamped and parsed after the day block', () => {
  const code = MAIN_SRC.split('\n')
    .filter((l) => !l.trim().startsWith('//')).join('\n');
  // inside applyLiveParams, the day is applied first and the explicit value
  // second — the specific number in the permalink is the one the author meant
  const day = code.indexOf('setConditionDay(dayKey)');
  const fogParse = code.indexOf("h.has('fog')");
  const bankParse = code.indexOf("h.has('bank')");
  const burnParse = code.indexOf("h.has('burnoff')");
  assert.ok(day > 0 && fogParse > day && bankParse > day && burnParse > day,
    'explicit hash fog must win over what a #day= set');
  // the dial floors at FOG_MIN in BOTH entry paths (slider and hash) — below
  // it the horizon fade has no exponential gradient under it and bands
  assert.match(code, /const FOG_MIN = 0\.3/);
  assert.match(code, /v <= 8\) state\.fog = Math\.max\(v, FOG_MIN\)/);
  assert.match(code, /Math\.max\(v, FOG_MIN\), 8\)/);
  assert.match(code, /v >= 0 && v <= 1\) state\.fogBank = v/);
  // and the writer must not pin a day's own air (same rule as h0)
  assert.match(code, /fog:\s*activeDayKey\s*\?\s*null/);
});
