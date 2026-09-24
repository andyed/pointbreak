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
import { readFileSync, existsSync } from 'node:fs';

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

// One headless bake at (H0, card T, tide), read the way stageAlpha() reads it.
const shippedAt = (spot, H0, tide = PEEL_FLOOR[spot].basisTideM) => I.repSummary(
  I.instrumentState(spot, { H0, T: PEEL_FLOOR[spot].basisT, tide }), 1).shipped;
const near = (a, b, tol) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
// The tide band as the HUD, CONTROLS.md and MODEL.md print it.
const fmtTide = (t) => `${t >= 0 ? '+' : ''}${t.toFixed(2)}`;
const bandText = (f) => `${fmtTide(f.tideBandM[0])}…${fmtTide(f.tideBandM[1])} m`;

test('the floor table carries its basis, and the basis is the instrument\'s and the runtime\'s', () => {
  assert.deepEqual(Object.keys(PEEL_FLOOR).sort(), Object.keys(PRESETS).sort(),
    'every preset needs a PEEL_FLOOR entry, even if it is null');
  assert.ok(PEEL_FLOOR.privates,
    'Privates has a floor since the 2026-09-24 refit: its table wedge (crest 0.912 m) '
    + 'activates at 0.305 m, below the 0.70 m card, so the card line is on the reef and the '
    + 'criterion has a domain (re-baked in its own test below; REEF_REFIT_2026-09-24)');
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
    // a ladder with no branch flip carries null flip rungs (Second Peak since
    // the refit): the floor there is the peel returning, not a branch changing
    if (f.flipLo === null) assert.equal(f.flipHi, null, `${spot}: flipLo null but flipHi ${f.flipHi}`);
    else assert.ok(near(f.flipHi - f.flipLo, B.stepM, 1e-9), `${spot}: flipLo/flipHi must be one ${B.stepM} m rung apart`);
    // The floor is the measured healthy-side rung, not a picked number with a
    // margin — anything else is authorship wearing a measurement's clothes.
    assert.equal(f.floorH0, f.floorHi, `${spot} floor must be the measured healthy-side H0`);
    assert.match(f.bakeDigest, /^[0-9a-f]{16}$/, `${spot} carries no bake fingerprint`);
  }
  // The tide axis (TIDE_FLOOR_2026-09-01): the band is measured on the same
  // 0.01 m rungs as the H0 floor, over the range the model accepts and no
  // further — a band edge AT the range limit is "holds as far as the tide
  // can go", not "holds forever".
  assert.equal(B.tideStepM, I.TIDE_STEP_M);
  assert.deepEqual(B.tideRangeM, I.TIDE_RANGE_M, 'the basis tide range must be the bake\'s own TIDE_RANGE');
  assert.match(B.tideMeasured, /^\d{4}-\d{2}-\d{2}$/);
  const [tLo, tHi] = B.tideRangeM;
  for (const spot of MAPPED) {
    const f = PEEL_FLOOR[spot];
    assert.ok(Array.isArray(f.tideBandM) && f.tideBandM.length === 2, `${spot} carries no tide band`);
    const [lo, hi] = f.tideBandM;
    assert.ok(lo <= 0 && hi >= 0, `${spot} tide band ${bandText(f)} does not contain the tide-0 basis`);
    assert.ok(lo >= tLo - 1e-9 && hi <= tHi + 1e-9, `${spot} tide band ${bandText(f)} leaves the accepted tide range`);
    for (const [side, edge, limit] of [['lo', f.tideEdges.lo, tLo], ['hi', f.tideEdges.hi, tHi]]) {
      assert.equal(edge.tide, side === 'lo' ? lo : hi, `${spot} ${side} edge is not the band edge`);
      if (edge.beyondTide === null) {
        assert.ok(near(edge.tide, limit, 1e-9), `${spot} ${side} edge has no failing rung beyond it, so it must be the range limit ${limit}`);
      } else {
        // one tide rung beyond the edge, on the instrument's own ladder
        const ladder = I.tideLadder();
        const i = ladder.findIndex((t) => near(t, edge.tide, 1e-9));
        assert.ok(i >= 0, `${spot} ${side} edge ${edge.tide} is not a rung of the tide ladder`);
        assert.ok(near(ladder[i + (side === 'lo' ? -1 : 1)], edge.beyondTide, 1e-9),
          `${spot} ${side}: beyondTide ${edge.beyondTide} is not the next rung after ${edge.tide}`);
        assert.ok(edge.failH0 >= f.floorH0 - 1e-9 && edge.failH0 <= PRESETS[spot].H0 + 1e-9,
          `${spot} ${side}: the failing rung ${edge.failH0} must lie between the floor and the card`);
      }
    }
    assert.match(f.tideDigest, /^[0-9a-f]{16}$/, `${spot} carries no tide-edge fingerprint`);
  }
});

test('the bake still reads what the table says at the tide edges (tide basis)', () => {
  // The twin of the H0 check: at each band edge the floor and the card are
  // both peels, and one rung beyond the edge the tabulated H0 is not — with
  // the alpha and reef fraction the table recorded. A bake change that moves
  // the band fails here with the re-run command.
  const RE_TIDE = `re-run \`node ${PEEL_FLOOR_BASIS.tideInstrument}\` and update PEEL_FLOOR tideBandM/tideEdges/tideDigest `
    + '(+ MODEL.md 4.6, CONTROLS.md #clamp row, research/TIDE_FLOOR_2026-09-01.md)';
  for (const spot of MAPPED) {
    const f = PEEL_FLOOR[spot], cardH0 = PRESETS[spot].H0;
    const say = (H0, tide, r) => `${spot} at H0 ${H0} tide ${fmtTide(tide)}: alpha ${r.medianClean?.toFixed(2)}, on-reef ${r.onReefFrac.toFixed(3)}`;
    for (const side of ['lo', 'hi']) {
      const e = f.tideEdges[side];
      const atFloor = shippedAt(spot, f.floorH0, e.tide), atCard = shippedAt(spot, cardH0, e.tide);
      assert.ok(I.peelHealthy(atFloor, 1), `${say(f.floorH0, e.tide, atFloor)} — the floor is not a peel at the band edge; ${RE_TIDE}`);
      assert.ok(I.peelHealthy(atCard, 1), `${say(cardH0, e.tide, atCard)} — the card is not a peel at the band edge; ${RE_TIDE}`);
      assert.ok(near(atFloor.medianClean, e.alphaFloor, 0.051), `${say(f.floorH0, e.tide, atFloor)}; the table says ${e.alphaFloor} — ${RE_TIDE}`);
      assert.ok(near(atCard.medianClean, e.alphaCard, 0.051), `${say(cardH0, e.tide, atCard)}; the table says ${e.alphaCard} — ${RE_TIDE}`);
      assert.ok(near(atFloor.onReefFrac, e.onReefFloor, 0.0051), `${say(f.floorH0, e.tide, atFloor)}; the table says on-reef ${e.onReefFloor} — ${RE_TIDE}`);
      assert.ok(near(atCard.onReefFrac, e.onReefCard, 0.0051), `${say(cardH0, e.tide, atCard)}; the table says on-reef ${e.onReefCard} — ${RE_TIDE}`);
      if (e.beyondTide === null) continue;              // the band runs to the range limit on this side
      const edgeSame = shippedAt(spot, e.failH0, e.tide), beyond = shippedAt(spot, e.failH0, e.beyondTide);
      assert.ok(I.peelHealthy(edgeSame, 1), `${say(e.failH0, e.tide, edgeSame)} already fails inside the band; ${RE_TIDE}`);
      assert.ok(!I.peelHealthy(beyond, 1), `${say(e.failH0, e.beyondTide, beyond)} is a peel; the band is too narrow — ${RE_TIDE}`);
      assert.ok(near(edgeSame.medianClean, e.alphaAtEdge, 0.051), `${say(e.failH0, e.tide, edgeSame)}; the table says ${e.alphaAtEdge} — ${RE_TIDE}`);
      assert.ok(near(beyond.medianClean, e.alphaBeyond, 0.051), `${say(e.failH0, e.beyondTide, beyond)}; the table says ${e.alphaBeyond} — ${RE_TIDE}`);
      assert.ok(near(beyond.onReefFrac, e.onReefBeyond, 0.0051), `${say(e.failH0, e.beyondTide, beyond)}; the table says on-reef ${e.onReefBeyond} — ${RE_TIDE}`);
      assert.equal(I.peelFailures(beyond, 1).join('+'), e.fails, `${spot} ${side}: what fails beyond the edge changed — ${RE_TIDE}`);
    }
    const now = I.tideDigest(spot, { ...f, cardH0 });
    assert.equal(now, f.tideDigest,
      `${spot}: the bake at the tide edges fingerprints ${now}, the band was read off ${f.tideDigest}. The model moved under the tide band — ${RE_TIDE}`);
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
    if (f.flipLo === null) continue;
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
  // prevent. Lesson 13: check the domain before reading the number. On the
  // tide axis the basis is now a measured BAND (TIDE_FLOOR_2026-09-01): inside
  // it the tide-0 floor holds and binds; outside it floorH0(tide) is higher
  // than the tide-0 number, so a request must pass through, never be clamped
  // to a number from another tide.
  // 7 = the six original days + `foggy` (2026-08-27). Bank-size changes are
  // deliberate; bump this with the bank so a parse regression cannot hide.
  assert.equal(CONDITION_DAYS.length, 7, 'the conditions bank did not parse');
  const [tLo, tHi] = PEEL_FLOOR_BASIS.tideRangeM;
  for (const spot of MAPPED) {
    const b = PEEL_FLOOR[spot];
    const [lo, hi] = b.tideBandM;
    const inBand = (t) => t >= lo - 1e-9 && t <= hi + 1e-9;
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: 0 }), b.floorH0);
    assert.equal(peelFloorH0(spot, { T: b.basisT + 1, tideM: 0 }), null, `${spot}: wrong T still clamped`);
    // the band edges bind, one rung beyond them does not
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: lo }), b.floorH0, `${spot}: the low band edge must bind`);
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: hi }), b.floorH0, `${spot}: the high band edge must bind`);
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: lo - 0.01 }), null, `${spot}: one rung below the band still clamped`);
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: hi + 0.01 }), null, `${spot}: one rung above the band still clamped`);
    // and every tide the slider can reach agrees with the band, both ways
    for (let t = tLo; t <= tHi + 1e-9; t += 0.05) {
      const got = peelFloorH0(spot, { T: b.basisT, tideM: t });
      assert.equal(got, inBand(t) ? b.floorH0 : null, `${spot} at tide ${fmtTide(t)}: floor ${got}, band ${bandText(b)}`);
    }
    assert.equal(peelFloorH0(spot, { T: b.basisT, tideM: NaN }), null, `${spot}: a NaN tide must decline`);
    // Every condition day is either on the basis or left alone. None may be
    // clamped from off-basis, and none of the shipped seven changes height.
    for (const d of CONDITION_DAYS) {
      const drawn = clamp(spot, d.H0, { T: d.T, tideM: d.tideM });
      if (d.T !== b.basisT || !inBand(d.tideM))
        assert.equal(drawn, d.H0, `${spot} day=${d.key} was clamped off-basis`);
      else
        assert.equal(drawn, Math.max(d.H0, b.floorH0), `${spot} day=${d.key} is on-basis and must be held to the floor`);
      assert.equal(drawn, d.H0, `${spot} day=${d.key}: a shipped day changed height (${d.H0} -> ${drawn}); MODEL.md 4.6 says all seven pass through`);
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
});

test('Privates\' floor is a measured verdict on the refit wedge, not an inherited null', () => {
  // Until the 2026-09-24 refit Privates carried a null floor: its card ocean
  // (0.70 m, T 12, tide 0) sat BELOW its legacy wedge's activation (0.721 m),
  // so no rung up to the card put a station on the reef. The table wedge
  // (crest 0.912 m, beta 65.5) activates at 0.305 m, the card line sits on it
  // (59 % of stations, alpha 30.4 against 31) and a floor exists at 0.64 m.
  // If the bake, the card or the table ever move the card back off the wedge,
  // this fails naming the run — the same discipline as the digests above.
  const key = 'privates', card = PRESETS[key];
  assert.equal(card.geoSpot, "Private's", 'Privates is the mapped preset this verdict was measured on');
  const act = I.reefActivationH0(key, { T: card.T, tide: 0 }).H0;
  assert.ok(Number.isFinite(act) && act < card.H0,
    `Privates' wedge activates at ${act?.toFixed(3)} m, at or above its ${card.H0} m card — `
    + 'the card is off the reef again and the floor has no domain; re-run `node scripts/measure_break_activation.mjs '
    + '--mode=floor --preset=privates` and set PEEL_FLOOR.privates back to null (MODEL.md 4.6 "Privates")');
  const r = I.repSummary(I.instrumentState(key, { H0: card.H0, T: card.T, tide: 0 }), 1).shipped;
  assert.ok(I.peelHealthy(r, 1), `Privates' card line reads alpha ${r.medianClean?.toFixed(1)}, on-reef ${r.onReefFrac.toFixed(2)} — not a peel on the wedge`);
  const f = PEEL_FLOOR[key];
  assert.ok(f && f.floorH0 < card.H0, 'Privates carries a floor below its card');
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
  assert.ok(/c\.bound\s*\n?\s*\?/.test(hud) && /basisT/.test(hud) && /tideBandM/.test(hud),
    'the HUD must distinguish a bound clamp from one that declined off-basis, '
    + 'and name the basis it declined against — the period AND the tide band');
  // The tide is a live control. Moving it under an active month must re-derive
  // the month's height at the new tide (the hash parser already reads #tide=
  // before #month= for the same reason), or the slider carries a tide-0 clamp
  // and its HUD line to a tide the floor does not describe.
  assert.ok(/function setTide\b[\s\S]{0,1200}?if \(activeMonthKey\) setMonth\(activeMonthKey\)/.test(code),
    'setTide() must re-apply an active month so the floor is re-evaluated at the new tide');
  assert.ok(/if \(h\.has\('tide'\)\)[^\n]*\n\s*setMonth\(/.test(code),
    'the hash parser must read #tide= immediately before applying #month=');
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
  // ...and its tide band, per spot, in the HUD's own format, plus what a
  // reader sees when the tide leaves it.
  assert.ok(row.includes('--mode=tide'), 'the #clamp row must name the instrument that measures the tide band');
  for (const spot of MAPPED)
    assert.ok(row.includes(bandText(PEEL_FLOOR[spot])),
      `the #clamp row must quote ${spot}'s tide band ${bandText(PEEL_FLOOR[spot])}`);
  const tideRow = doc.split('\n').find((l) => l.startsWith('| `tide` |'));
  assert.ok(/peel floor/.test(tideRow) && /clamp/.test(tideRow),
    'the #tide row must point at the peel floor\'s tide band: the tide is a live control that leaves it');
});

test('MODEL.md documents the tradeoff the clamp takes, and the basis names the note that tabulates the current floors', () => {
  const doc = readFileSync(new URL('../docs/MODEL.md', import.meta.url), 'utf8');
  assert.ok(/## 4\.6 The peel floor/.test(doc),
    'MODEL.md must carry the named tradeoff section the clamp is justified by');
  const sec = doc.split('## 4.6 The peel floor')[1].split('\n## 5')[0];
  assert.ok(/Sewers/.test(sec.slice(0, 6000)),
    'the tradeoff section must state the spot that loses its whole seasonal range');
  assert.ok(/model[- ]version/i.test(sec), '4.6 must name the model-version dependence of the floor');
  assert.ok(/tide band/i.test(sec), '4.6 must carry the tide-band measurement');
  assert.ok(existsSync(new URL('../docs/research/TIDE_FLOOR_2026-09-01.md', import.meta.url)),
    'the tide-band measurement must have its research note');
  // The numbers live where the basis says they live. Since the 2026-09-24
  // refit that is the refit note (the coordinator folds it into 4.6); the
  // basis field is what keeps the doc and the table from drifting apart.
  assert.match(PEEL_FLOOR_BASIS.tabulatedIn, /^docs\//, 'the basis must name the doc that tabulates the current floors');
  const tab = readFileSync(new URL(`../${PEEL_FLOOR_BASIS.tabulatedIn}`, import.meta.url), 'utf8');
  assert.ok(tab.includes(PEEL_FLOOR_BASIS.measured) && tab.includes(PEEL_FLOOR_BASIS.modelCommit),
    `${PEEL_FLOOR_BASIS.tabulatedIn} must carry the re-measurement date and commit`);
  for (const spot of MAPPED)
    assert.ok(tab.includes(`**${PEEL_FLOOR[spot].floorH0.toFixed(2)}**`),
      `${PEEL_FLOOR_BASIS.tabulatedIn} must tabulate ${spot}'s current floor ${PEEL_FLOOR[spot].floorH0}`);
  assert.ok(tab.includes(PEEL_FLOOR_BASIS.tideMeasured), `${PEEL_FLOOR_BASIS.tabulatedIn} must carry the tide-band measurement date`);
  for (const spot of MAPPED)
    assert.ok(tab.includes(bandText(PEEL_FLOOR[spot])), `${PEEL_FLOOR_BASIS.tabulatedIn} must tabulate ${spot}'s tide band ${bandText(PEEL_FLOOR[spot])}`);
});
