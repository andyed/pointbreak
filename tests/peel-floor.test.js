// The peel floor: #month= / #day= may not ask a spot for an ocean it cannot
// draw a peel in, and the authored card states must not move.
//
// WHAT THIS FILE PINS, AND HOW. The floor table in shared/params.js is a
// MEASUREMENT of the bake (MODEL.md 4.6), and a measurement carries its basis:
// tide, period, gamma, the H0 step, the alpha criterion — and the model
// version (research/BREAK_FIELD_2026-09-01 §4: the 2026-08-20 table was one
// to two rungs stale after commit 09c7f4a changed shoaling, and nothing
// noticed because the old version of this file compared the table to
// constants copied from the same sweep). So this file does not carry a copy
// of the numbers. It RE-MEASURES them: bed.js bakes on the CPU, headless,
// through the same instrument that produced the table
// (scripts/measure_break_activation.mjs, reproduction-gated against the real
// bake in tests/break-field-gate.test.js), and asserts
//
//   1. the table's basis (tide 0, card T, gamma, step, criterion) is the
//      instrument's and the runtime's;
//   2. at each spot the bake at floorLo/floorHi still reads what the table
//      says, and the criterion still turns between them — the peel is absent
//      below and present above, on the reef, with the authored handedness;
//   3. the bake fingerprint at those rungs matches PEEL_FLOOR[spot].bakeDigest,
//      so a bake change that moves the floor fails HERE and says what to
//      re-run, instead of a #month= quietly clamping to a closeout;
//   4. every reachable month at every mapped spot lands on a peel, and no
//      authored card H0 is at or below its own floor (the clamp is inert on
//      bare-URL states);
//   5. the floor declines off-basis, main.js routes derived oceans through ONE
//      clamp (MODEL.md 4.5), and the product discloses it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The instrument registers the `three` resolve hook bed.js needs; import it
// before anything that pulls bed.js.
const I = await import('../scripts/measure_break_activation.mjs');
import { PRESETS, PEEL_FLOOR, PEEL_FLOOR_BASIS, peelFloorH0 } from '../shared/params.js';
import { MONTHLY_OCEAN } from '../data/climatology/pp_monthly_ocean.js';
const { GAMMA } = await import('../web-three/js/dispersion.js');

// conditions.js pulls TIDE_RANGE from bed.js. The bank is a flat literal, so
// read the H0s off the source instead of vendoring a copy that could go stale.
const CONDITIONS_SRC = readFileSync(
  new URL('../web-three/js/conditions.js', import.meta.url), 'utf8');
const CONDITION_DAYS = [...CONDITIONS_SRC.matchAll(
  /\{\s*key:\s*'([a-z]+)',[^}]*?H0:\s*([0-9.]+),\s*T:\s*([0-9.]+),\s*tideM:\s*(-?[0-9.]+)/g)]
  .map((m) => ({ key: m[1], H0: Number(m[2]), T: Number(m[3]), tideM: Number(m[4]) }));

const MAIN_JS = readFileSync(
  new URL('../web-three/js/main.js', import.meta.url), 'utf8');
const code = MAIN_JS.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

const MAPPED = Object.keys(PEEL_FLOOR).filter((k) => PEEL_FLOOR[k]);

// The acceptance floor for stage-median alpha, picked from the data rather
// than chosen: the collapsed states read 1.4-9.1 deg against 36-50 deg
// targets, the healthy card states read 26.3-51.4. 10 deg is the gap. The
// instrument owns the number (ALPHA_FLOOR_DEG); the table's basis records it;
// this file checks all three agree.
export const ALPHA_FLOOR_DEG = 10;

const RE_MEASURE = `re-run \`node ${PEEL_FLOOR_BASIS.instrument}\` and update PEEL_FLOOR `
  + '(+ MODEL.md 4.6, CONTROLS.md #clamp row); the floor was measured at commit '
  + `${PEEL_FLOOR_BASIS.modelCommit} on ${PEEL_FLOOR_BASIS.measured}`;

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

// One headless bake at (H0, card T, tide 0), read the way stageAlpha() reads it.
const shippedAt = (spot, H0) => I.repSummary(
  I.instrumentState(spot, { H0, T: PEEL_FLOOR[spot].basisT, tide: PEEL_FLOOR[spot].basisTideM }), 1).shipped;
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

test('the floor table carries its basis, and the basis is the instrument\'s and the runtime\'s', () => {
  assert.deepEqual(Object.keys(PEEL_FLOOR).sort(), Object.keys(PRESETS).sort(),
    'every preset needs a PEEL_FLOOR entry, even if it is null');
  assert.equal(PEEL_FLOOR.privates, null,
    'Privates has no measured bed, so no bake, no branch and nothing to clamp to');
  const B = PEEL_FLOOR_BASIS;
  assert.match(B.modelCommit, /^[0-9a-f]{7,40}$/, 'the basis must name the commit it was measured at');
  assert.match(B.measured, /^\d{4}-\d{2}-\d{2}$/, 'the basis must carry its date');
  assert.equal(B.gamma, GAMMA, `the floor was measured at gamma ${B.gamma}; dispersion.js GAMMA is now ${GAMMA} — ${RE_MEASURE}`);
  assert.equal(B.alphaFloorDeg, ALPHA_FLOOR_DEG);
  assert.equal(I.ALPHA_FLOOR_DEG, ALPHA_FLOOR_DEG, 'the instrument\'s collapse line drifted from the table\'s');
  assert.equal(I.ON_REEF_MIN, B.onReefMin, 'the instrument\'s on-reef criterion drifted from the table\'s');
  assert.equal(I.FLOOR_STEP_M, B.stepM);
  assert.equal(I.FLOOR_LADDER_LO_M, B.ladderLoM);
  assert.equal(B.tideM, 0, 'the floor is measured at tide 0 — a #month= does not move the tide');
  for (const spot of MAPPED) {
    const f = PEEL_FLOOR[spot];
    assert.equal(f.basisTideM, 0, `${spot} basis tide must be 0 — the ladder was run there`);
    assert.equal(f.basisT, PRESETS[spot].T, `${spot}: the floor's basis period must be the card's own`);
    assert.equal(f.alphaTarget, PRESETS[spot].alpha, `${spot} alpha target drifted from the preset`);
    assert.ok(near(f.floorHi - f.floorLo, B.stepM, 1e-9), `${spot}: floorLo/floorHi must be one ${B.stepM} m rung apart`);
    assert.ok(near(f.flipHi - f.flipLo, B.stepM, 1e-9), `${spot}: flipLo/flipHi must be one ${B.stepM} m rung apart`);
    // The floor is the measured healthy-side rung, not a picked number with a
    // margin — anything else is authorship wearing a measurement's clothes.
    assert.equal(f.floorH0, f.floorHi, `${spot} floor must be the measured healthy-side H0`);
    assert.match(f.bakeDigest, /^[0-9a-f]{16}$/, `${spot} carries no bake fingerprint`);
  }
});

test('the bake still reads what the table says at every floor rung (model-version basis)', () => {
  // This is the check the 2026-08-20 version of this file could not make: it
  // compared the table to constants copied from the same sweep, so when
  // 09c7f4a moved the bake, Sewers' floor went on clamping twelve months to a
  // height that had become a left-handed closeout (-8.3 deg) and nothing
  // failed. Now the bake is re-run at floorLo and floorHi.
  for (const spot of MAPPED) {
    const f = PEEL_FLOOR[spot];
    const below = shippedAt(spot, f.floorLo), above = shippedAt(spot, f.floorHi);
    const say = (side, r) => `${spot} at ${side}: alpha ${r.medianClean?.toFixed(2)} deg, on-reef ${r.onReefFrac.toFixed(3)}`;
    assert.ok(near(below.medianClean, f.alphaBelow, 0.051),
      `${say('floorLo ' + f.floorLo, below)}; the table says ${f.alphaBelow}. The bake moved under the floor — ${RE_MEASURE}`);
    assert.ok(near(above.medianClean, f.alphaAbove, 0.051),
      `${say('floorHi ' + f.floorHi, above)}; the table says ${f.alphaAbove}. The bake moved under the floor — ${RE_MEASURE}`);
    assert.ok(near(below.onReefFrac, f.onReefBelow, 0.0051), `${say('floorLo', below)}; the table says on-reef ${f.onReefBelow} — ${RE_MEASURE}`);
    assert.ok(near(above.onReefFrac, f.onReefAbove, 0.0051), `${say('floorHi', above)}; the table says on-reef ${f.onReefAbove} — ${RE_MEASURE}`);
    // ...and the step it names must actually be the peel returning, by the
    // declared criterion: absent one rung below (alpha, sign or reef), present
    // one rung above. This is what caught Second Peak in 2026-08 (a flip
    // between two closeouts) and First Peak's inshore bore in 2026-09 (10-12
    // deg with 0% of the stage on the reef).
    assert.ok(!I.peelHealthy(below, 1),
      `${say('floorLo', below)} already reads as a peel on the reef; the floor is too high — ${RE_MEASURE}`);
    assert.ok(I.peelHealthy(above, 1),
      `${say('floorHi', above)} is not a peel on the reef (needs alpha >= ${ALPHA_FLOOR_DEG}, right-handed, >= ${I.ON_REEF_MIN} on the reef); `
      + `the floor does not restore a peel — ${RE_MEASURE}`);
    // The flip the table names must still be a flip on this bake.
    const lo = I.instrumentState(spot, { H0: f.flipLo, T: f.basisT, tide: 0 }).real.z;
    const hi = I.instrumentState(spot, { H0: f.flipHi, T: f.basisT, tide: 0 }).real.z;
    assert.ok(I.maxAbsDiff(lo, hi) > I.FLIP_M,
      `${spot}: ${f.flipLo}->${f.flipHi} moves the line ${I.maxAbsDiff(lo, hi).toFixed(1)} m, not a flip (> ${I.FLIP_M} m) — ${RE_MEASURE}`);
  }
});

test('the bake fingerprint at the floor rungs matches the one the floor was read off', () => {
  // Stronger than the alpha check above: ANY change to the line, its gaps or
  // the canonical alpha along it at floorLo/floorHi (bed, dispersion, reef
  // fit, presets, the alpha metric) changes this. When it fails and the alpha
  // check passes, the floor may still hold — but it has to be re-read, not
  // assumed; that is MEASUREMENT_LESSONS 14b on the model-version axis.
  for (const spot of MAPPED) {
    const f = PEEL_FLOOR[spot];
    const now = I.floorDigest(spot, f);
    assert.equal(now, f.bakeDigest,
      `${spot}: the bake at ${f.floorLo}/${f.floorHi} m (T ${f.basisT}, tide 0) fingerprints ${now}, `
      + `the floor was read off ${f.bakeDigest}. The model moved under PEEL_FLOOR — ${RE_MEASURE}`);
  }
});

test('every reachable month lands above the spot floor, and draws a peel there', () => {
  const H0_MIN = 0.4, H0_MAX = 3.0;
  assert.equal(MONTHLY_OCEAN.length, 12);
  for (const spot of MAPPED) {
    const floor = peelFloorH0(spot, onBasis(spot));
    const drawnSet = new Set();
    for (const m of MONTHLY_OCEAN) {
      const asked = Math.min(Math.max(m.H0, H0_MIN), H0_MAX);
      const drawn = clamp(spot, asked, onBasis(spot));
      assert.ok(drawn >= floor,
        `${spot} month=${m.key} draws ${drawn} m, below its floor ${floor} m`);
      // and the clamp only ever raises: a month must never be made SMALLER
      // than the climatology says, which would be authorship overriding data.
      assert.ok(drawn >= asked, `${spot} month=${m.key}: the clamp lowered H0`);
      drawnSet.add(drawn);
    }
    // The point of the floor: what the month DRAWS is a peel on the reef. A
    // month is on-basis by construction, so the headless bake is the one the
    // reader gets. (Every distinct drawn height, once.)
    for (const H0 of drawnSet) {
      const r = shippedAt(spot, H0);
      assert.ok(I.peelHealthy(r, 1),
        `${spot}: a month drawn at ${H0} m reads alpha ${r.medianClean?.toFixed(1)} deg, on-reef ${r.onReefFrac.toFixed(2)} — `
        + `the floor is not holding the months on a peel; ${RE_MEASURE}`);
    }
  }
});

test('the floor declines to bind off the ocean it was measured at', () => {
  // The measured guard, not a stylistic one: applying the tide-0 floor to
  // `#day=small` (T 9, tide +0.35) took Sewers from alpha 12.8 to 3.9 and The
  // Hook from 10.4 to 5.9 — the clamp manufacturing the closeouts it exists to
  // prevent. Lesson 13: check the domain before reading the number. And the
  // tide axis is the one the floor does NOT guard: the shipped line flips on
  // a 0.04 m tide step at five of six spots (BREAK_FIELD_2026-09-01 §5.2), so
  // an off-basis request must pass through, never be clamped to a tide-0 number.
  // 7 = the six original days + `foggy` (2026-08-27). Bank-size changes are
  // deliberate; bump this with the bank so a parse regression cannot hide.
  assert.equal(CONDITION_DAYS.length, 7, 'the conditions bank did not parse');
  for (const spot of MAPPED) {
    const b = PEEL_FLOOR[spot];
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: 0 }), b.floorH0);
    assert.equal(peelFloorH0(spot, { T: b.basisT + 1, tideM: 0 }), null, `${spot}: wrong T still clamped`);
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: 0.35 }), null, `${spot}: wrong tide still clamped`);
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: 0.04 }), null, `${spot}: one tide rung off-basis still clamped`);
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: -0.04 }), null, `${spot}: one tide rung off-basis still clamped`);
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
  // and every one of them measures healthy. If a card H0 ever sat at or below
  // its own floor the clamp would move a shipped default, which it must never do.
  for (const spot of MAPPED) {
    const cardH0 = PRESETS[spot].H0;
    const floor = peelFloorH0(spot, onBasis(spot));
    // The card's own period IS the basis, so a card state is maximally exposed
    // to the clamp — it is inert there because of the H0 gap, not a domain gap.
    assert.ok(cardH0 > floor,
      `${spot} card H0 ${cardH0} is not above its floor ${floor} — `
      + 'the clamp would now change a bare-URL state');
    assert.equal(clamp(spot, cardH0, onBasis(spot)), cardH0, `${spot} card H0 was clamped`);
    const r = shippedAt(spot, cardH0);
    assert.ok(I.peelHealthy(r, 1), `${spot} card state reads alpha ${r.medianClean?.toFixed(1)}, on-reef ${r.onReefFrac.toFixed(2)} — not a peel`);
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

test('CONTROLS.md carries the measured floors and their basis, not a bare mention', () => {
  const doc = readFileSync(new URL('../docs/CONTROLS.md', import.meta.url), 'utf8');
  const row = doc.split('\n').find((l) => l.startsWith('| `clamp` |'));
  assert.ok(row, 'no #clamp row in CONTROLS.md');
  for (const spot of MAPPED)
    assert.ok(row.includes(`**${PEEL_FLOOR[spot].floorH0.toFixed(2)}**`),
      `the #clamp row must quote ${spot}'s measured floor ${PEEL_FLOOR[spot].floorH0}`);
  assert.ok(row.includes(PEEL_FLOOR_BASIS.measured) && row.includes(PEEL_FLOOR_BASIS.modelCommit),
    'the #clamp row must name the date and commit the floors were measured at — the model version is part of the basis');
  assert.ok(row.includes('--mode=floor'), 'the #clamp row must name the instrument that re-measures the floor');
  assert.ok(/untouched by construction/.test(row),
    'the #clamp row must state that the card states are never routed through the clamp');
});

test('MODEL.md documents the tradeoff the clamp takes, and its model-version dependence', () => {
  const doc = readFileSync(new URL('../docs/MODEL.md', import.meta.url), 'utf8');
  assert.ok(/## 4\.6 The peel floor/.test(doc),
    'MODEL.md must carry the named tradeoff section the clamp is justified by');
  const sec = doc.split('## 4.6 The peel floor')[1].split('\n## 5')[0];
  assert.ok(/Sewers/.test(sec.slice(0, 6000)),
    'the tradeoff section must state the spot that loses its whole seasonal range');
  assert.ok(sec.includes(PEEL_FLOOR_BASIS.measured) && sec.includes(PEEL_FLOOR_BASIS.modelCommit),
    '4.6 must carry the re-measurement date and commit');
  for (const spot of MAPPED)
    assert.ok(sec.includes(`**${PEEL_FLOOR[spot].floorH0.toFixed(2)}**`),
      `4.6 must tabulate ${spot}'s current floor ${PEEL_FLOOR[spot].floorH0}`);
  assert.ok(/model[- ]version/i.test(sec), '4.6 must name the model-version dependence of the floor');
});
