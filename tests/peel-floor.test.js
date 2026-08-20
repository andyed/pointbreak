// The peel floor: #month= / #day= may not ask a spot for an ocean it cannot
// draw a peel in, and the authored card states must not move.
//
// WHAT THIS FILE CAN AND CANNOT PIN. The acceptance instrument for the peel is
// `__pointbreak.stageAlpha()`, which needs a GPU bake, so the measured α
// invariant is enforced by `scripts/audit_shipped_states.mjs` (evidence under
// evidence/clamp/) and recorded below as the constants this file checks the
// CLAMP ARITHMETIC against. That split is the repo's existing practice — see
// url-params.test.js, whose default-ocean regression is source-shaped for the
// same reason. What is pinned here:
//
//   1. every reachable month/day request at every mapped spot lands on the
//      healthy side of that spot's measured branch-flip threshold;
//   2. no authored card H0 is at or below its own floor, i.e. the clamp is
//      provably inert on the bare-URL states;
//   3. the floor table still matches the measurement it was read off;
//   4. main.js routes derived oceans through ONE clamp (MODEL.md 4.5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { PRESETS, PEEL_FLOOR, peelFloorH0 } from '../shared/params.js';
import { MONTHLY_OCEAN } from '../data/climatology/pp_monthly_ocean.js';

// conditions.js pulls TIDE_RANGE from bed.js, which imports three — not
// loadable under `node --test`. The bank is a flat literal, so read the H0s
// off the source instead of vendoring a copy that could go stale.
const CONDITIONS_SRC = readFileSync(
  new URL('../web-three/js/conditions.js', import.meta.url), 'utf8');
const CONDITION_DAYS = [...CONDITIONS_SRC.matchAll(
  /\{\s*key:\s*'([a-z]+)',[^}]*?H0:\s*([0-9.]+),\s*T:\s*([0-9.]+),\s*tideM:\s*(-?[0-9.]+)/g)]
  .map((m) => ({ key: m[1], H0: Number(m[2]), T: Number(m[3]), tideM: Number(m[4]) }));

const MAIN_JS = readFileSync(
  new URL('../web-three/js/main.js', import.meta.url), 'utf8');
const code = MAIN_JS.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const MAPPED = Object.keys(PEEL_FLOOR).filter((k) => PEEL_FLOOR[k]);

// The measured thresholds (TODO 1c'-d, scripts/measure_branch_flip.mjs, 0.01 m
// resolution at tide 0 and card T). Duplicated here on purpose: if someone
// edits the bank, this fails rather than silently redefining what "healthy"
// means. Update BOTH only with a fresh sweep.
// `floor*` is the step at which the PEEL returns, which is the flip at five
// spots and is NOT at Second Peak — its 1.02->1.03 flip moves alpha 2.6 -> 3.7,
// a branch change between two closeouts, and the peel returns at 1.07->1.08.
const MEASURED = {
  sewers:     { flipLo: 1.60, flipHi: 1.61, floorLo: 1.60, floorHi: 1.61, target: 38, cardH0: 2.2, basisT: 15 },
  firstpeak:  { flipLo: 1.25, flipHi: 1.26, floorLo: 1.25, floorHi: 1.26, target: 50, cardH0: 1.8, basisT: 14 },
  secondpeak: { flipLo: 1.02, flipHi: 1.03, floorLo: 1.07, floorHi: 1.08, target: 41, cardH0: 1.5, basisT: 14 },
  jacks:      { flipLo: 0.84, flipHi: 0.85, floorLo: 0.84, floorHi: 0.85, target: 37, cardH0: 1.1, basisT: 13 },
  thehook:    { flipLo: 1.04, flipHi: 1.05, floorLo: 1.04, floorHi: 1.05, target: 41, cardH0: 1.5, basisT: 13 },
  sharks:     { flipLo: 0.80, flipHi: 0.81, floorLo: 0.80, floorHi: 0.81, target: 36, cardH0: 1.0, basisT: 13 },
};

// The acceptance floor for stage-median alpha, picked from the data rather
// than chosen: the collapsed states read 1.4-9.1 deg against 36-50 deg
// targets, the healthy card states read 26.3-51.4. 10 deg is the gap.
export const ALPHA_FLOOR_DEG = 10;

// The clamp, as the runtime applies it (main.js setDerivedH0). `ocean` carries
// the basis check — a floor measured at tide 0 and card T does not describe an
// ocean at some other tide and period.
const clamp = (spot, requestedH0, ocean = {}) => {
  const floor = peelFloorH0(spot, ocean);
  return floor !== null && requestedH0 < floor ? floor : requestedH0;
};
// A #month= keeps the site card's period and does not move the tide, so it is
// on-basis by construction. That is what makes the month the clampable state.
const onBasis = (spot) => ({ T: PEEL_FLOOR[spot].basisT, tideM: 0 });

test('the floor table still matches the sweep it was measured from', () => {
  assert.deepEqual(Object.keys(PEEL_FLOOR).sort(), Object.keys(PRESETS).sort(),
    'every preset needs a PEEL_FLOOR entry, even if it is null');
  assert.equal(PEEL_FLOOR.privates, null,
    'Privates has no measured bed, so no bake, no branch and nothing to clamp to');
  for (const [spot, m] of Object.entries(MEASURED)) {
    const f = PEEL_FLOOR[spot];
    for (const k of ['flipLo', 'flipHi', 'floorLo', 'floorHi'])
      assert.equal(f[k], m[k], `${spot} ${k} drifted from the measurement`);
    assert.equal(f.alphaTarget, m.target, `${spot} alpha target drifted`);
    assert.equal(f.basisT, m.basisT, `${spot} basis period drifted`);
    assert.equal(f.basisTideM, 0, `${spot} basis tide must be 0 — the ladder's own`);
    // The floor IS the healthy side of the measured step. Not a rounded-up
    // margin, not a tuned value — anything else is authorship wearing a
    // measurement's clothes.
    assert.equal(f.floorH0, m.floorHi,
      `${spot} floor must be the measured healthy-side H0, not a picked number`);
    // ...and the step it names must actually be the peel returning. This is
    // what caught Second Peak: its branch flip crosses from 2.6 to 3.7 deg,
    // two closeouts, so clamping to it would have cost seasonal range and
    // bought no peel.
    assert.ok(f.alphaBelow < ALPHA_FLOOR_DEG,
      `${spot} alphaBelow ${f.alphaBelow} is not a collapse; re-derive the floor`);
    assert.ok(f.alphaAbove >= ALPHA_FLOOR_DEG,
      `${spot} floor does not restore a peel (alpha ${f.alphaAbove} above it). `
      + 'A floor is defined by the quantity it floors — the peel, not the branch id.');
  }
});

test('every reachable month lands above the spot floor', () => {
  const H0_MIN = 0.4, H0_MAX = 3.0;
  assert.equal(MONTHLY_OCEAN.length, 12);
  for (const spot of MAPPED) {
    const floor = peelFloorH0(spot, onBasis(spot));
    for (const m of MONTHLY_OCEAN) {
      const asked = Math.min(Math.max(m.H0, H0_MIN), H0_MAX);
      const drawn = clamp(spot, asked, onBasis(spot));
      assert.ok(drawn >= floor,
        `${spot} month=${m.key} draws ${drawn} m, below its floor ${floor} m`);
      // and the clamp only ever raises: a month must never be made SMALLER
      // than the climatology says, which would be authorship overriding data.
      assert.ok(drawn >= asked, `${spot} month=${m.key}: the clamp lowered H0`);
    }
  }
});

test('the floor declines to bind off the ocean it was measured at', () => {
  // The measured guard, not a stylistic one: applying the tide-0 floor to
  // `#day=small` (T 9, tide +0.35) took Sewers from alpha 12.8 to 3.9 and The
  // Hook from 10.4 to 5.9 — the clamp manufacturing the closeouts it exists to
  // prevent. Lesson 13: check the domain before reading the number.
  assert.equal(CONDITION_DAYS.length, 6, 'the conditions bank did not parse');
  for (const spot of MAPPED) {
    const b = PEEL_FLOOR[spot];
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: 0 }), b.floorH0);
    assert.equal(peelFloorH0(spot, { T: b.basisT + 1, tideM: 0 }), null, `${spot}: wrong T still clamped`);
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: 0.35 }), null, `${spot}: wrong tide still clamped`);
    // Every condition day is either on the basis or left alone. None may be
    // clamped from off-basis.
    for (const d of CONDITION_DAYS) {
      const drawn = clamp(spot, d.H0, { T: d.T, tideM: d.tideM });
      if (d.T !== b.basisT || d.tideM !== 0)
        assert.equal(drawn, d.H0, `${spot} day=${d.key} was clamped off-basis`);
    }
  }
});

test('the clamp is inert on every authored card state', () => {
  // The bare-URL states are the calibration input for model-glsl SHELTER_*
  // and every one of them measured healthy (36.4/51.4/35.9/32.9/37.0/26.3
  // stage-median alpha). If a card H0 ever sat at or below its own floor the
  // clamp would move a shipped default, which it must never do.
  for (const spot of MAPPED) {
    const cardH0 = PRESETS[spot].H0;
    const floor = peelFloorH0(spot, onBasis(spot));
    assert.equal(cardH0, MEASURED[spot].cardH0, `${spot} card H0 moved`);
    // The card's own period IS the basis, so a card state is maximally exposed
    // to the clamp — it is inert there because of the H0 gap, not a domain gap.
    assert.equal(PRESETS[spot].T, PEEL_FLOOR[spot].basisT,
      `${spot}: the floor's basis period must be the card's own`);
    assert.ok(cardH0 > floor,
      `${spot} card H0 ${cardH0} is not above its floor ${floor} — `
      + 'the clamp would now change a bare-URL state');
    assert.equal(clamp(spot, cardH0, onBasis(spot)), cardH0, `${spot} card H0 was clamped`);
  }
  // Privates has no floor at all, so nothing there can be clamped.
  assert.equal(peelFloorH0('privates', { T: 12, tideM: 0 }), null);
  assert.equal(clamp('privates', 0.4, { T: 12, tideM: 0 }), 0.4);
});

test('a derived ocean has exactly one clamp owner (MODEL.md 4.5)', () => {
  // The failure this guards against is the one 4.5 exists for: the same clamp
  // written into the month path, the day path and the live path, drifting
  // apart. peelFloorH0 must be reached through setDerivedH0 and nowhere else.
  const callers = [...code.matchAll(/peelFloorH0\(/g)].length;
  assert.equal(callers, 1,
    `peelFloorH0 is called ${callers} times in main.js. A derived ocean's `
    + 'height has ONE owner: setDerivedH0. Route the new caller through it.');
  for (const path of ['setMonth', 'setConditionDay']) {
    assert.ok(new RegExp(`function ${path}\\b[\\s\\S]{0,2400}?setDerivedH0\\(`).test(code),
      `${path}() no longer routes its H0 through setDerivedH0`);
  }
  // applyOcean() nulls state.preset, so the live path must pass the spot key
  // explicitly or the floor lookup silently finds nothing.
  assert.ok(/setDerivedH0\(o\.hs,[^)]*,\s*spot\)/.test(code),
    'the #day=live path must hand setDerivedH0 the preset key it captured '
    + 'before applyOcean() cleared state.preset');
});

test('the clamp is A/B revertible and disclosed', () => {
  assert.ok(/h\.get\('clamp'\)/.test(code), '#clamp= is not read');
  assert.ok(/clampEnabled\s*\r?\n?\s*\?\s*peelFloorH0/.test(code),
    '#clamp=0 must switch the floor off at the one place it is applied');
  // A silent clamp is the dishonesty the docs in this repo exist to prevent.
  assert.ok(/hudClamp\.textContent/.test(code), 'the HUD does not report the clamp');
  const hud = code.slice(code.indexOf('const measured ='), code.indexOf('// M6 part 3'));
  for (const piece of ['c.applied', 'c.requested', 'c.source', 'floorLo', 'floorHi', 'alphaTarget'])
    assert.ok(hud.includes(piece),
      `the HUD clamp line must name ${piece} — both heights and the measured step`);
  assert.ok(/#clamp=0/.test(hud), 'the HUD must name the revert flag');
  // The off-basis case gets a disclosure too: a floor that exists, a request
  // under it, and a decline on domain grounds is a collapsed peel the reader
  // would otherwise have no account of.
  assert.ok(/c\.bound\s*\n?\s*\?/.test(hud) && /basisT/.test(hud),
    'the HUD must distinguish a bound clamp from one that declined off-basis, '
    + 'and name the basis it declined against');
});

test('CONTROLS.md carries the measured floors, not a bare mention', () => {
  const doc = readFileSync(new URL('../docs/CONTROLS.md', import.meta.url), 'utf8');
  const row = doc.split('\n').find((l) => l.startsWith('| `clamp` |'));
  assert.ok(row, 'no #clamp row in CONTROLS.md');
  for (const spot of MAPPED)
    assert.ok(row.includes(PEEL_FLOOR[spot].floorH0.toFixed(2)),
      `the #clamp row must quote ${spot}'s measured floor ${PEEL_FLOOR[spot].floorH0}`);
  assert.ok(/\*\*64 → 12\*\*/.test(row) && /52 → 0/.test(row),
    'the #clamp row must carry the before/after blast radius it was measured at');
  assert.ok(/0 of 7 differ/.test(row),
    'the #clamp row must state that the card states did not move');
});

test('MODEL.md documents the tradeoff the clamp takes', () => {
  const doc = readFileSync(new URL('../docs/MODEL.md', import.meta.url), 'utf8');
  assert.ok(/## 4\.6 The peel floor/.test(doc),
    'MODEL.md must carry the named tradeoff section the clamp is justified by');
  assert.ok(/Sewers/.test(doc.split('## 4.6 The peel floor')[1].slice(0, 6000)),
    'the tradeoff section must state the spot that loses its whole seasonal range');
});
