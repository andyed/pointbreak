// TRACK 1c'-d. The low-H0 break-line branch flips were traced to the ONSET
// bookkeeping in bed.js markBreakCrossings, and the repair for it (`#merge=`)
// was built and falsified. What survives is a knob that must stay inert by
// default and must never be able to delete the only break at a station.
//
// Structure, not tuned literals: none of these assertions pins a measured
// threshold or an alpha. They pin the two safety properties the knob has to
// keep, and the opt-in-ness of the finding's blast radius.
//
// bed.js imports three.js, so it cannot be imported in a bare node test the way
// depth-model.test.js imports its data module. These read the source, the same
// way url-params.test.js reads CONTROLS.md for the doc-parity gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(path.join(ROOT, p), 'utf8');
const BED = read('web-three/js/bed.js');
const MAIN = read('web-three/js/main.js');
const CONTROLS = read('docs/CONTROLS.md');

test('the onset-merge knob is OFF by default, so the shipped bake is untouched', () => {
  // `#merge` was measured and falsified (it raises the flip count rather than
  // removing flips). It stays in the tree so the negative is reproducible in
  // one build, exactly as #dline does — but only as long as it ships at zero.
  assert.match(BED, /let onsetMergeM = 0;/,
    'onsetMergeM must default to 0 — a nonzero default would ship a falsified mechanism');
});

test('the seaward-most onset is unconditional, whatever the merge threshold', () => {
  // The gate may only ever suppress a LATER onset. If it could suppress the
  // first one, a large enough threshold would empty the candidate set and the
  // bake would fall through to `fallback` — the deepest march point — at every
  // station, which is a flat line at the seaward edge of the patch and would
  // read as a plausible-looking closeout rather than as a failure.
  const fn = BED.slice(BED.indexOf('function markBreakCrossings'),
                       BED.indexOf('// ---------- density-composite candidates'));
  assert.ok(fn.length > 200, 'markBreakCrossings not found — this test needs rewiring');
  assert.match(fn, /let dipMin = -Infinity;/,
    'dipMin must start at -Infinity so the first onset passes any threshold');
  // the first-onset branch (fLast === null) must push WITHOUT consulting dipMin
  const firstOnset = fn.slice(fn.indexOf('fLast === null'));
  const gateInFirstOnset = firstOnset.slice(0, firstOnset.indexOf('last = z'));
  assert.ok(!gateInFirstOnset.includes('onsetMergeM'),
    'the first-onset branch must not be gated by the merge threshold');
});

test('the merge knob is boot-only and reports itself back', async () => {
  // Boot-only: it must never be written into a permalink, or a shared link
  // could silently carry a falsified selection rule. (The doc-parity test in
  // url-params.test.js already enforces that it has a CONTROLS.md row.)
  const { ROUND_TRIP_PARAMS } = await import('../web-three/js/url-params.js');
  assert.ok(!ROUND_TRIP_PARAMS.includes('merge'),
    'merge must not round-trip into the URL');
  // Liveness readback: the anchor-band falsification (1c'-c.2) cost a run
  // because an inert flag and a null result look identical. Every knob that
  // gates a bake now reports the value the bake actually used.
  assert.match(MAIN, /onsetMerge: \(\) => getOnsetMerge\(\)/,
    'the bake must expose the merge value it used, so a sweep can prove it is live');
});

test('the falsification is recorded where someone would retry it', () => {
  // Same discipline as the anchor band's do-not-retry note at its call site.
  assert.match(CONTROLS, /MEASURED AND FALSIFIED 2026-08-19 — do not retry as a flip fix/,
    'CONTROLS.md must carry the do-not-retry note for #merge');
  assert.match(BED, /WHY THIS EXISTS/,
    'bed.js must carry the derivation at the call site');
});

test('the break-criterion probes are read-only diagnostics, not render inputs', () => {
  // breakCandidates / breakExcessProfile re-run the bake's own march for
  // instruments. If either were ever called from the frame loop it would
  // double the march cost per frame, and worse, invite a second locus.
  for (const fnName of ['breakCandidates', 'breakExcessProfile']) {
    const calls = [...MAIN.matchAll(new RegExp(`${fnName}\\s*\\(`, 'g'))];
    assert.equal(calls.length, 1, `${fnName} must be called exactly once in main.js (the probe)`);
    // and that one call must be inside the __pointbreak surface, which starts
    // well after the render loop
    assert.ok(calls[0].index > MAIN.indexOf('window.__pointbreak = {'),
      `${fnName} must only be called from the __pointbreak instrument surface`);
  }
});
