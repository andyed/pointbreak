import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeState, applyPreset } from '../shared/params.js';
import { swellPhi } from '../web-three/js/model-js.js';

const model = readFileSync(new URL('../shared/model-glsl.js', import.meta.url), 'utf8');
const shaders = readFileSync(new URL('../web-three/js/shaders.js', import.meta.url), 'utf8');
const main = readFileSync(new URL('../web-three/js/main.js', import.meta.url), 'utf8');

function glslConstant(name) {
  const match = model.match(new RegExp(`const float ${name} = ([0-9.]+);`));
  assert.ok(match, `missing GLSL constant ${name}`);
  return Number(match[1]);
}

function modelParams(state) {
  return {
    T: state.T, H0: state.H0, alphaRad: state.alpha*Math.PI/180,
    xi: state.xi, sections: state.sections, dF: state.dF,
    chop: state.chop, aframe: state.aframe, geoMix: state.geoMix,
    contourX2: state.contourX2, contourX3: state.contourX3,
    stageStart: state.stageStart, stageEnd: state.stageEnd, rideOffset: 0,
  };
}

test('breaker consequences share one canonical lifecycle clock', () => {
  assert.match(model, /vec4 breakerLifecycleAtX\(float x, float t\)/);
  assert.match(model, /vec4 life = breakerLifecycleAtX\(x, t\)/);
  assert.match(shaders, /breakerLifecycleAtX\(x0, u_time\)/);
});

test('structural pocket is compact and legacy remains reversible', () => {
  // Structural pins, not literal ones: the bell must stay a compact Gaussian
  // whose footprint is scaled by pockS (H_eff coupling, 2026-08-14), and the
  // coupling must stay clamped and gated on u_depthMix*u_pockSize. The tuned
  // numbers themselves are free to move without failing the suite.
  assert.match(model, /2\.0\*\([\d.]+\*pockS\)\*\([\d.]+\*pockS\)/);
  assert.match(model, /clamp\(u_H0\*shelterAt\(x\)\/[\d.]+, [\d.]+, [\d.]+\), u_depthMix\*u_pockSize/);
  assert.match(model, /mix\(pocketLegacy, pocketCompact, clamp\(u_breakShape/);
  assert.match(main, /h\.get\('shape'\) === 'legacy'/);
  assert.match(main, /setBreakerShape/);
});

test('field-fidelity full look replaces the detached fold with a connected hinge', () => {
  // Structural claims only: the connected look must temper apparent steepness,
  // cap S below the fold threshold, and shrink lip throw/drop — which exact
  // numbers do that is tuning, and a retune must not fail the suite.
  assert.match(shaders, /uniform float u_fidelityLook;/);
  // 2026-08-25: the base strength is u_sApp (#sapp=, unbundled from the full
  // look so the approach calibration can be judged alone); the full arm's own
  // constant still wins through the same mix, so the structural claim — the
  // connected look tempers the approach — is unchanged.
  assert.match(shaders, /float Sapp\s+= mix\(u_sApp, [\d.]+, connectedLook\) \* steep/);
  assert.match(main, /u_sApp:\s+\{ value: 0\.22 \}/);
  assert.match(main, /h\.has\('sapp'\)/);
  assert.match(shaders, /if \(connectedLook > 0\.5\) S = min\(S, [\d.]+\)/);
  // throwMag is a uniform branch since the 2026-08-22 cusp-length re-form
  // (#throwlen), so — exactly like dropMag below — the claim is made once per
  // arm: BOTH must still shrink with the connected look, whichever length the
  // throw is measured in. Structural, not tuned.
  assert.match(shaders, /throwMag = mix\(THROW_FRAC, THROW_FRAC_FULL, connectedLook\)/);
  assert.match(shaders, /throwMag = mix\([\d.]+, [\d.]+, connectedLook\)/);
  // dropMag is a uniform branch since the 2026-08-18 re-scope (#drop=legacy),
  // so the claim is made once per arm: BOTH must still shrink with the
  // connected look. Same structural-not-tuned rule as the rest of this test.
  assert.match(shaders, /dropMag = mix\([\d.]+, [\d.]+, connectedLook\)/);
  assert.match(shaders, /dropMag = clamp\(mix\([\d.]+, [\d.]+, connectedLook\)/);
  assert.match(shaders, /float pocketSteepGate = mix/);
  assert.match(shaders, /if \(fullLook > 0\.5 && !gl_FrontFacing\) discard/);
  assert.match(shaders, /float facePocket = fullLook \* steepF/);
  assert.match(shaders, /float connectedLip = max\(vPocket/);
});

test('the judged breaker-anatomy bundle ships together and remains revertible', () => {
  assert.match(main, /u_lipAer:\s+\{ value: 1 \}/);
  assert.match(main, /u_curl:\s+\{ value: 1 \}/);
  assert.match(main, /u_onset:\s+\{ value: 1 \}/);
  assert.match(main, /curtainMesh\.visible = true/);

  assert.match(main, /h\.get\('lip'\) === '0'[\s\S]{0,80}?u_lipAer\.value = 0/);
  assert.match(main, /h\.get\('curl'\) === '0'[\s\S]{0,80}?u_curl\.value = 0/);
  assert.match(main, /h\.get\('onset'\) === '0'[\s\S]{0,80}?u_onset\.value = 0/);
  assert.match(main, /h\.get\('curtain'\) === '0'[\s\S]{0,80}?curtainMesh\.visible = false/);
});

test('airborne whitewater is a separate deterministic render pass', () => {
  assert.match(main, /let seed = 0x51f15e/);
  assert.match(main, /new THREE\.Points\(makeSprayGeometry\(\), sprayMat\)/);
  assert.match(shaders, /export const SPRAY_VERT/);
  assert.match(shaders, /export const SPRAY_FRAG/);
});

test('per-stripe lifecycle clock is canonical, phase-lagged, and flag-gated', () => {
  // Structural pins only (retunes must not fail the suite):
  // 1. the canonical clock lives in the shared model (stripeAgeAt): tSince
  //    plus the line->here travel phase — the phase-lagged copy of the
  //    zipper's along-crest clock;
  // 2. the READ is the fragment's post-threshold carve consuming that clock,
  //    decomposed age = alongF + lagF: the within-stripe along-crest ramp on
  //    a period-relative e-fold (a u_T multiple), the stripe lag on the foam
  //    clock family (a u_tau multiple) — all in seconds, never frames — and
  //    capped at 1.0 (a carve dissolves tails, never brightens);
  // 3. ocean() must NOT multiply its foam terms by this clock — that
  //    placement was built and falsified 2026-08-18 (see stripeAgeAt's
  //    header): pre-threshold it is invisible at set-peak clocks and stacked
  //    with the carve it crushes the heads;
  // 4. gated behind u_stripeLife (#slife=1, default OFF in main.js).
  assert.match(model, /uniform float u_stripeLife;/);
  assert.match(model, /float stripeAgeAt\(vec2 xz, float t\)/);
  assert.match(model, /rayPhase\(xz\) - rayPhase\(vec2\(xz\.x, zb\)\)/);
  assert.match(model, /tSince \+ phaseLag\/max\(w, [\de.-]+\)/);
  assert.doesNotMatch(model, /stripeMod/);
  assert.match(shaders, /if \(u_stripeLife > 0\.5\)/);
  // The lifecycle belongs to the source water, not the horizontally displaced
  // fragment position; otherwise the fold asks a neighbouring crest for age.
  assert.match(shaders, /float stripeAgeF = stripeAgeAt\(sourceXZ, t\)/);
  assert.match(shaders, /float alongF = mod\(stripeAgeF, u_T\)/);
  assert.match(shaders, /float lagF = stripeAgeF - alongF/);
  assert.match(shaders, /exp\(-alongF\/max\([\d.]+\*u_T, [\d.]+\)\)/);
  assert.match(shaders, /exp\(-lagF\/max\([\d.]+\*u_tau, [\d.]+\)\)/);
  assert.match(shaders, /min\(stripeCarve, 1\.0\)/);
  assert.match(main, /u_stripeLife: \{ value: 0 \}/);
  assert.match(main, /h\.get\('slife'\) === '1'/);
});

test('First Peak crash head and wake reveal the physics-owned zipper', () => {
  const state = makeState();
  applyPreset(state, 'firstpeak');
  const phi = swellPhi(modelParams(state));
  const peelSpeed = (90/state.T)/Math.max(Math.sin(phi), 0.05);
  const headM = 2*glslConstant('CRASH_SIGMA_S')*peelSpeed;
  const wakeM = glslConstant('BORE_END_S')*peelSpeed;

  assert.ok(headM >= 12 && headM <= 18, `impact head ${headM.toFixed(1)} m`);
  assert.ok(wakeM >= 100 && wakeM <= 160, `foam wake ${wakeM.toFixed(1)} m`);
  assert.match(model, /1\.0 - smoothstep\(BORE_FADE_START_S, BORE_END_S, age\)/);
});

test('the lip drop cannot flatten the pocket crest', () => {
  // The 2026-08-18 defect was structural, not a tuning miss: dropMag was
  // proportional to hM = h/VIS — the height it is subtracted FROM — so it was a
  // multiplicative shrink of the whole water column wherever pocket > 0, and it
  // bit hardest at the crest. These pin the SHAPE of the repair, not its
  // constants, so a retune stays free:
  //  * the shipped arm is a FRACTION of the band above the bend line, clamped
  //    below 1 (a drop that could exceed the band inverts the crest, which is
  //    the failure mode being removed);
  //  * it is gated on frontPhase, which is zero at the crest (theta = 0), so
  //    the crest itself can never be pulled down;
  //  * the bend line comes from crestCeilM, the depth-limited ceiling — the
  //    same authority #curl bends from (MODEL.md 4.5: physics owns the cap).
  assert.match(shaders, /float crestCeilM\(float dep, float Ks\)/);
  assert.match(shaders, /float yBendD = [\d.]+\*crestCeilM\(depQ, KsQ\)/);
  assert.match(shaders, /float dyD\s+= max\(h - yBendD, 0\.0\)/);
  assert.match(shaders, /dropMag = clamp\(mix\([\d.]+, [\d.]+, connectedLook\)[\s\S]{0,120}?frontPhase, 0\.0, 0\.\d+\) \* dyD/);
  assert.match(shaders, /uniform float u_legacyDrop;/);
  assert.match(shaders, /if \(u_legacyDrop > 0\.5\)/);
  assert.match(main, /u_legacyDrop: \{ value: 0 \}/);
  assert.match(main, /h\.get\('drop'\) === 'legacy'/);
  // #curl must keep reading the SAME ceiling, or the two mechanisms disagree
  // about where the lip starts.
  assert.match(shaders, /float hCrest = crestCeilM\(depQ, KsQ\)/);
});

test('the aeration curtain keys off the mechanism that is actually drawing the lip', () => {
  // #lip and #curl contradicted each other until 2026-08-18: the curtain keyed
  // off throwMag, which #curl computes and then never applies, so both flags on
  // painted an aerated curtain across water with no lip in it. The key must
  // switch with u_curl — vCurl (turns of overturn) when the bend is running,
  // the applied throw when it is not.
  assert.match(shaders, /float lipKey = u_curl > 0\.5 \? smoothstep\([\d.]+, [\d.]+, curl\)/);
  assert.match(shaders, /clamp\(throwMag \/ max\([\d.]+\*hM, [\d.]+\), 0\.0, 1\.0\)/);
  // 2026-08-25: the same principle, one step further — on the curl arm the
  // S-cusp factor was a SECOND authority on the question lipKey already
  // answers, and the two disagreed exactly at the advancing head (fold
  // 10.9 m, aer 0.01 — the bare "alien ship" plate). Curl arm: overturn
  // count alone. Throw arm: lip and cusp are separate mechanisms, so the
  // S-gate AND is earned there and must stay.
  assert.match(shaders, /float aerCurtain = u_curl > 0\.5 \? lipKey/);
  assert.match(shaders, /: smoothstep\([\d.]+, [\d.]+, Sapp \+ Sover\) \* lipKey/);
  // curl is written before the aeration block reads it, or the key is stale.
  assert.ok(shaders.indexOf('curl   = th/PI;') < shaders.indexOf('float lipKey'),
            'curl must be written before the aeration key reads it');
});

// ---------------------------------------------------------------------------
// The foam field's size contract, 2026-08-19 (#lipn=0 reverts)
// ---------------------------------------------------------------------------
// Every foam term is normalized by ONE size factor — exactly 1.0 at the
// H0 = 1.5 m model-card day at the reef anchor — reaching each term either as
// sizeFoam/sizeAmp or, for the pocket->whitewater path, through u_lipSize.
// Two terms used to sit outside it: model lipFoam (documented "xi-owned",
// which is a claim about xi and not a substitute for size) and GRID_FRAG's
// pocket foam floor (a RELATIVE claim — "never dimmer than its own trailing
// bore" — written as the ABSOLUTE constant 0.72). Measured at Sewers, that
// made stage-max foam read 0.929 at H0 = 0.585 m against 0.385 at H0 = 0.801 m.
//
// Structural pins only: the clamp bounds and the 0.72 floor are tuning and may
// move. What may not move is WHICH TERMS ARE INSIDE THE CONTRACT.
test('every foam term carries the one size factor, pocket path included', () => {
  // One named definition, not three copies — a factor you cannot point at is a
  // factor the next term forgets.
  assert.match(model, /float foamSizeAt\(float x\)\{[\s\S]{0,200}?clamp\(u_H0\*shelterAt\(x\)\/[\d.]+, [\d.]+, [\d.]+\), u_depthMix\)/);
  assert.match(model, /float sizeFoam = foamSizeAt\(x\);/);
  assert.match(model, /float sizeAmp = foamSizeAt\(x\);/);
  // The model's lip term is size-normalized, reversibly.
  assert.match(model, /uniform float u_lipSize;/);
  assert.match(model, /foam \+= lipFoam\*mix\([\d.]+, [\d.]+, shape\)\*mix\(1\.0, sizeFoam, u_lipSize\);/);
  // The fragment's pocket foam floor carries the same factor through the same
  // flag, or the two limbs of one defect can drift apart.
  assert.match(shaders, /foamM = max\(foamM, u_crestRead \* [\d.]+ \* mix\(1\.0, foamSizeAt\(sourceXZ\.x\), u_lipSize\)/);
  // Wired ON by default with the A/B revert reachable from the hash.
  assert.match(main, /u_lipSize:\s+\{ value: 1 \}/);
  assert.match(main, /h\.get\('lipn'\) === '0'/);
  // The clamp bound is a real calibration limit, so the HUD says when it binds
  // instead of rendering a size-blind field silently.
  assert.match(main, /foam size ×[\d.]+ floor/);
});
