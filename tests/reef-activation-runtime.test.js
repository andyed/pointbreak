// The runtime's reef-activation H0 (bed.js reefActivationH0) against the
// instrument's (scripts/measure_break_activation.mjs reefActivationH0).
//
// The HUD's peel-floor line names the reef's activation height — the H0 below
// which the wedge is not in play at all and a clamped month is a lull, not a
// smaller wave on the reef (MODEL.md 4.6 "Activation is a crest depth"). That
// number is derived in bed.js as a closed form over the wedge's cells
// (gamma*h / (shelter*Ks), minimised), while the instrument bisects the field.
// research/REEF_ACTIVATION_2026-09-01.md §1 measured the two to agree to 1e-12;
// this file keeps them agreeing, on the bake's own lattice, at every mapped
// spot, at tide 0 and off it. It also pins that the runtime derivation is
// read-only — it may not move a uniform, a texture or a cache the bake reads,
// because the HUD text is the only thing it exists to change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The instrument registers the `three` resolve hook bed.js needs; import it
// before anything that pulls bed.js.
const I = await import('../scripts/measure_break_activation.mjs');
const bed = await import('../web-three/js/bed.js');
import { PRESETS } from '../shared/params.js';

// main.js bakes across [-STAGE_W/2, STAGE_W/2]; the instrument mirrors it as
// X_RANGE and tests/break-field-gate.test.js pins that mirror against main.js.
const X_RANGE = I.X_RANGE;

// The six numbers the docs quote (REEF_ACTIVATION_2026-09-01 §1, MODEL.md 4.6,
// NEXT_INVESTMENTS §1), tide 0, card T. If the bake moves them, the docs move
// too — this is the test that says so.
const DOCUMENTED = { sewers: 1.239, firstpeak: 1.143, secondpeak: 1.003,
                     jacks: 0.616, thehook: 0.916, sharks: 0.726 };

test('the runtime activation equals the instrument\'s bisection at every mapped spot, tide 0', () => {
  assert.equal(I.MAPPED.length, 6);
  for (const key of I.MAPPED) {
    const T = PRESETS[key].T;
    const ref = I.reefActivationH0(key, { T, tide: 0 }).H0;
    const mine = bed.reefActivationH0(PRESETS[key].geoSpot, X_RANGE, { T, tide: 0 });
    assert.ok(mine && Number.isFinite(mine.H0), `${key}: no runtime activation`);
    assert.ok(Math.abs(mine.H0 - ref) < 1e-9,
      `${key}: runtime ${mine.H0} vs instrument ${ref} (|d| ${Math.abs(mine.H0 - ref)})`);
    assert.equal(Math.round(mine.H0 * 1000) / 1000, DOCUMENTED[key],
      `${key}: activation ${mine.H0.toFixed(3)} is not the documented ${DOCUMENTED[key]} — `
      + 'the bake moved; re-run `node scripts/measure_break_activation.mjs --mode=card` and update '
      + 'MODEL.md 4.6, NEXT_INVESTMENTS §1 and REEF_ACTIVATION_2026-09-01');
  }
});

test('…and off tide 0, where the HUD actually reads it (the band runs to MLLW)', () => {
  for (const key of I.MAPPED) {
    const T = PRESETS[key].T;
    for (const tide of [-0.862, -0.5, 0.3, 0.764]) {
      const ref = I.reefActivationH0(key, { T, tide }).H0;
      const mine = bed.reefActivationH0(PRESETS[key].geoSpot, X_RANGE, { T, tide });
      if (ref === null) { assert.equal(mine, null); continue; }
      // the instrument's search floor is 0.2 m; the closed form has no floor
      if (ref <= 0.2) { assert.ok(mine.H0 <= 0.2 + 1e-9, `${key} @ ${tide}: below the search floor both ways`); continue; }
      assert.ok(Math.abs(mine.H0 - ref) < 1e-9, `${key} @ tide ${tide}: runtime ${mine.H0} vs instrument ${ref}`);
    }
    // more water over the wedge needs a bigger wave: monotone in tide
    const lo = bed.reefActivationH0(PRESETS[key].geoSpot, X_RANGE, { T, tide: -0.5 }).H0;
    const hi = bed.reefActivationH0(PRESETS[key].geoSpot, X_RANGE, { T, tide: 0.3 }).H0;
    assert.ok(lo < hi, `${key}: activation must rise with the tide (${lo} at -0.5, ${hi} at +0.3)`);
  }
  // an unmapped spot has no wedge and says so
  assert.equal(bed.reefActivationH0(null, X_RANGE, { T: 12 }), null);
  assert.equal(bed.reefActivationH0('Nowhere', X_RANGE, { T: 12 }), null);
});

test('the derivation is read-only: no uniform, texture or bake cache is touched', () => {
  const src = readFileSync(new URL('../web-three/js/bed.js', import.meta.url), 'utf8');
  const start = src.indexOf('export function reefActivationH0(');
  assert.ok(start > 0, 'bed.js exports reefActivationH0');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  for (const forbidden of ['uniforms', 'THREE.', 'needsUpdate', 'u16Cache', 'texCache', 'cpuCache', 'breakKey', 'fitCache.set', 'invalidateReef'])
    assert.ok(!body.includes(forbidden), `reefActivationH0 touches ${forbidden}; it must only read`);
  // the cache it does keep is cleared with every other reef cache
  const inv = src.slice(src.indexOf('function invalidateReef()'), src.indexOf('const REEF_FIT_TOL_DEG'));
  assert.match(inv, /actCache\.clear\(\)/, 'a new wedge must drop the cached activation');
  // Ks is the march's own (shoaledHeight), not a re-derivation of it
  assert.match(body, /shoaledHeight\(1, T, d\)/);
});

test('main.js records the activation on the clamp and the HUD names it', () => {
  const main = readFileSync(new URL('../web-three/js/main.js', import.meta.url), 'utf8');
  const code = main.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  // recorded where the clamp is decided, at the state's own T and tide
  const derive = code.slice(code.indexOf('function setDerivedH0('), code.indexOf('function setConditionDay('));
  assert.match(derive, /reefActivationH0\(PRESETS\[presetKey\]\?\.geoSpot, \[-STAGE_W \/ 2, STAGE_W \/ 2\],\s*\n?\s*\{ T: state\.T, tide: state\.tide \|\| 0 \}\)/,
    'setDerivedH0 must read the activation for the clamped spot at this state\'s T and tide');
  assert.match(derive, /reefActivationH0: act \? act\.H0 : null/);
  // named in the HUD, in both the bound and the off-basis line, with the
  // "lull" verdict when the asked height does not reach the reef
  const hud = code.slice(code.indexOf('const measured ='), code.indexOf('// M6 part 3'));
  assert.match(hud, /c\.reefActivationH0/);
  assert.match(hud, /not in play below/);
  assert.match(hud, /is a lull/);
  assert.match(hud, /in play from/);
  assert.ok(/\$\{measured\}\)\. \$\{reef\}/.test(hud), 'the bound line carries the reef clause');
  assert.ok(/\$\{reef\}Drawing the requested height unclamped/.test(hud), 'the off-basis line carries the reef clause');
  // and the readback the audits and the QA sheet use carries it too
  assert.match(code, /peelClamp: \(\) => \(activeClamp \? \{ \.\.\.activeClamp \} : null\)/);
});

test('the QA season sheet prints asked and drawn H0 with the verdict, from the capture\'s own readback', () => {
  const rig = readFileSync(new URL('../scripts/build_qa_sheets.mjs', import.meta.url), 'utf8');
  // read at capture time from the app, not typed into a caption
  assert.match(rig, /clamp: \(\(\) => \{\s*\n\s*const c = pb\.peelClamp \? pb\.peelClamp\(\) : null;/);
  assert.match(rig, /reefActivationH0: c\.reefActivationH0 \?\? null/);
  assert.match(rig, /clamp: st\.clamp \?\? null/, 'the row state must carry the clamp into the sidecar');
  // printed in the header's H0 cell, both heights, both verdicts
  assert.match(rig, /function h0HeaderHTML\(s\)/);
  assert.match(rig, /<dt>H₀<\/dt><dd>\$\{h0HeaderHTML\(s\)\}<\/dd>/);
  const h0 = rig.slice(rig.indexOf('function h0HeaderHTML('), rig.indexOf('function rowHTML('));
  assert.match(h0, /m drawn<\/b> · asked \$\{esc\(c\.source\)\} \$\{c\.requested\.toFixed\(3\)\} m · <b>floor applied<\/b>/);
  assert.match(h0, /reef inactive below \$\{act\.toFixed\(2\)\} m — <b>n\/a as a season<\/b>/);
  assert.match(h0, /floor NOT applied \(off its basis\)/);
  // the caption says the number it quotes is the ASKED one
  assert.match(rig, /asked H₀ p\$\{MONTHLY_OCEAN_PCT\}/);
  // and the floor numbers in the prose come from the table, not a copy
  assert.match(rig, /import \{ PEEL_FLOOR \} from '\.\.\/shared\/params\.js'/);
  assert.ok(!/1\.61 m drawn H₀|to 1\.61 m|to 1\.08 m/.test(rig), 'stale floor constants survive in the sheet prose');
});
