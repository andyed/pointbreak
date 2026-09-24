// The legacy reef arm (#reef=legacy) must BE the pre-refit bake, bit-for-bit.
//
// The 2026-09-24 refit (research/REEF_REFIT_2026-09-24.md) moved the shipped
// wedge to a baked table under the intertidal crest cap. The old load-time
// line-bearing fit under the -0.5 m NAVD88 cap stays as the A/B arm, and an
// A/B arm that has drifted from what it claims to reproduce is worse than no
// arm (MEASUREMENT_LESSONS 4: an instrument that scores a replica certifies
// the replica). So this file switches the shipped bed.js instance to the
// legacy arm and re-measures it against two records made BEFORE bed.js was
// touched:
//   1. qa/reef-fit/score.pre-refit.json — the scorecard scripts/fit_reef.mjs
//      wrote on the a8f16ca tree: composite checksum, beta, crest depth, the
//      card alpha and the alpha at every 0.7x-1.4x window rung, per spot;
//   2. PEEL_FLOOR_LEGACY in shared/params.js — the floor table as it was
//      shipped at c85bf62, whose bakeDigest / tideDigest fingerprint the line,
//      its gaps and the canonical alpha at the floor and tide-edge rungs.
// Any difference at any spot means the legacy arm is not the pre-refit bake.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Registers the `three` resolve hook; imports the shipped bed.js instance.
const F = await import('../scripts/fit_reef.mjs');
const I = await import('../scripts/measure_break_activation.mjs');
const bed = await import('../web-three/js/bed.js');
import { PRESETS, PEEL_FLOOR_LEGACY } from '../shared/params.js';

const REF = JSON.parse(readFileSync(new URL('../qa/reef-fit/score.pre-refit.json', import.meta.url), 'utf8'));
const MAPPED = F.MAPPED;

test('the legacy arm reproduces the pre-refit scorecard bit-for-bit at every mapped spot', () => {
  assert.equal(REF.arm, 'pre-refit', 'the reference scorecard must be the one taken before the refit');
  assert.equal(bed.getReefFitMode(), 'table', 'the shipped default is the table arm');
  bed.setReefFitMode('legacy');
  try {
    assert.equal(MAPPED.length, 7);
    for (const key of MAPPED) {
      const now = F.scoreSpot(key), ref = REF.spots[key];
      assert.ok(ref, `${key}: no pre-refit record`);
      assert.equal(now.wedge.audit.checksum, ref.wedge.audit.checksum, `${key}: the legacy composite grid differs from the pre-refit bake`);
      assert.equal(now.wedge.fit.betaDeg, ref.wedge.fit.betaDeg, `${key}: legacy beta ${now.wedge.fit.betaDeg} vs pre-refit ${ref.wedge.fit.betaDeg}`);
      assert.equal(now.wedge.fit.crestDepthM, ref.wedge.fit.crestDepthM, `${key}: legacy crest depth differs`);
      assert.equal(now.wedge.fit.fitMetric, 'legacy-break-line-bearing');
      assert.equal(now.wedge.fit.crestCeilEl, -0.5, `${key}: the legacy arm must keep the -0.5 m NAVD88 crest cap`);
      assert.equal(now.wedge.audit.aboveLegacyCeil, 0, `${key}: the legacy arm lifted a wet post above -0.5 m`);
      assert.equal(now.wedge.audit.aboveCeil, 0);
      assert.equal(now.wedge.audit.dryTouched, 0);
      assert.equal(now.card.alpha, ref.card.alpha, `${key}: legacy card alpha ${now.card.alpha} vs pre-refit ${ref.card.alpha}`);
      assert.equal(now.activationH0, ref.activationH0, `${key}: legacy activation differs`);
      for (let i = 0; i < ref.window.length; i++)
        assert.equal(now.window[i].alpha, ref.window[i].alpha, `${key} x${ref.window[i].mult}: legacy alpha ${now.window[i].alpha} vs pre-refit ${ref.window[i].alpha}`);
    }
  } finally { bed.setReefFitMode('table'); }
});

test('the legacy arm still fingerprints to the c85bf62 floor and tide-band digests', () => {
  bed.setReefFitMode('legacy');
  try {
    for (const key of MAPPED) {
      const f = PEEL_FLOOR_LEGACY[key];
      if (!f) { assert.equal(key, 'privates'); continue; }
      assert.equal(I.floorDigest(key, f), f.bakeDigest, `${key}: the legacy arm's bake at the c85bf62 floor rungs no longer matches PEEL_FLOOR_LEGACY`);
      assert.equal(I.tideDigest(key, { ...f, cardH0: PRESETS[key].H0 }), f.tideDigest, `${key}: the legacy arm's bake at the tide edges no longer matches PEEL_FLOOR_LEGACY`);
    }
  } finally { bed.setReefFitMode('table'); }
});

test('switching arms is a real switch: the table arm differs from legacy where the table says so, and switching back restores it', () => {
  const tableChk = Object.fromEntries(MAPPED.map((k) => [k, bed.reefAudit(PRESETS[k].geoSpot).checksum]));
  bed.setReefFitMode('legacy');
  const legacyChk = Object.fromEntries(MAPPED.map((k) => [k, bed.reefAudit(PRESETS[k].geoSpot).checksum]));
  bed.setReefFitMode('table');
  for (const k of MAPPED) {
    assert.equal(bed.reefAudit(PRESETS[k].geoSpot).checksum, tableChk[k], `${k}: switching back did not restore the table arm`);
    assert.equal(legacyChk[k], REF.spots[k].wedge.audit.checksum);
  }
  // at least the spots whose table crest is not the legacy crest must draw a different grid
  const differ = MAPPED.filter((k) => legacyChk[k] !== tableChk[k]);
  assert.ok(differ.length >= 6, `only ${differ.length} spots differ between the arms: ${differ.join(', ')}`);
});
