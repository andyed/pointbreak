// The forward-pitch phase map must be EVEN in theta, and the resulting height
// field must actually lean.
//
// Why this test exists. MODEL.md 2.2 has claimed since 2026-08-10 that "phase
// is skewed by sin(theta) ... so the shoreward face steepens". It never did.
// The height path is
//
//     h(theta) = amp * 2 * crestShape(-theta', q),
//     crestShape(p, q) = pow(max(0.5 + 0.5*cos(p), 0), q) - 0.5/q
//
// and crestShape depends on its argument ONLY through cos(), so it is an EVEN
// function of it. Composing an even function with an ODD map (`theta -= s*sin
// theta`) leaves h even about the crest for EVERY s: the wave is exactly
// fore-aft symmetric and cannot pitch. Measured front/back max-slope ratio
// 1.000000 and As -0.0001 over the whole reachable (s, q) plane
// (scripts/probe_wave_shape.mjs, 2026-08-18). The fix is an EVEN map,
// `theta -= s*(1 - cos theta)`.
//
// This is a guard, not a tuning pin. It asserts the STRUCTURE — parity of the
// map, monotonicity of the composed phase, and that a nonzero skew produces a
// front/back ratio meaningfully greater than 1 — so a future refactor cannot
// silently restore a symmetric wave, whatever the coefficients become. The
// literal s and q values live in shared/model-glsl.js and are read from there,
// so retuning them does not touch this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MODEL_GLSL } from '../shared/model-glsl.js';

// ---------------------------------------------------------------------------
// The shipped coefficients, read off the shipped source rather than copied.
// ---------------------------------------------------------------------------
function glslNumber(re, what) {
  const m = MODEL_GLSL.match(re);
  assert.ok(m, `could not find ${what} in shared/model-glsl.js — the pitch block moved`);
  return Number(m[1]);
}
const SKEW_GAIN = glslNumber(/float skewGain = mix\(([0-9.]+),/, 'the skew gain');
const SKEW_MAX = glslNumber(/clamp\(excess\*skewGain, 0\.0, ([0-9.]+)\)/, 'the skew clamp');
const Q_BASE = glslNumber(/float qBase\s*= mix\(([0-9.]+),/, 'the q base');
const Q_GAIN = glslNumber(/float qGain\s*= mix\(([0-9.]+),/, 'the q gain');

// The two maps, transcribed from the shipped line. The transcription is
// verified against the source text below so it cannot drift.
const evenMap = (th, s) => th - s * (1 - Math.cos(th));
const oddMap = (th, s) => th - s * Math.sin(th);
const crestShape = (p, q) => Math.pow(Math.max(0.5 + 0.5 * Math.cos(p), 0), q) - 0.5 / q;
const profile = (map, s, q, N = 4096) => {
  const y = new Float64Array(N);
  for (let i = 0; i < N; i++) y[i] = crestShape(-map(2 * Math.PI * i / N, s), q) * 2;
  return y;
};
// Front face = the RISE at a fixed gauge: a shoreward-travelling wave shows the
// gauge its shoreward face first. Back face = the fall.
function faceRatio(y) {
  let rise = 0, fall = 0;
  const N = y.length;
  for (let i = 0; i < N; i++) {
    const sl = y[(i + 1) % N] - y[i];
    if (sl > 0 && sl > rise) rise = sl;
    if (sl < 0 && -sl > fall) fall = -sl;
  }
  return rise / fall;
}

test('the shipped source really contains the even map, not the odd one', () => {
  // Whitespace-insensitive, so reformatting the shader does not fail the suite.
  const flat = MODEL_GLSL.replace(/\s+/g, '');
  assert.ok(flat.includes('theta-=skew*mix(1.0-cos(theta),sin(theta),u_pitchOdd);'),
    'the forward-pitch line is not the even map gated by u_pitchOdd. If it was '
    + 'deliberately changed, the new map must still be EVEN in theta — see the '
    + 'parity test below for why an odd one is a no-op.');
  // SHAPE vs LOCUS. The skew transforms the SHAPE of h; the crest's LOCUS is
  // the carrier phase. `tSince` and `crestNear` must read the locus, or the
  // pocket footprint (and through it the fold and the lip throw) rides on a
  // shape knob — which is how the odd map came to inflate the pocket ~30%.
  assert.ok(flat.includes('floatthetaL=mix(thetaC,theta,u_pitchOdd);'),
    'the locus phase thetaL is gone: the pocket would follow the shape knob again');
  // The clock may be wrapped by crestClockS (the #wrap crest-clock ramp, which
  // landed the same day) — what this pins is the ARGUMENT: the locus phase.
  assert.match(flat, /floattSince=(crestClockS\()?mod\(thetaL,2\.0\*PI\)\/w\)?;/,
    'tSince must read the LOCUS phase, not the shape-skewed one');
  assert.ok(flat.includes('floatcrestNear=smoothstep(0.55,0.98,cos(thetaL));'),
    'crestNear must read the LOCUS phase, not the shape-skewed one');
  // And the JS twin's q schedule must move with it (model-js has no depth path,
  // so it carries no skew, but it does carry q).
  const twin = readFileSync(new URL('../web-three/js/model-js.js', import.meta.url), 'utf8');
  assert.ok(twin.includes(`P.pitchOdd ? 1.6 : ${Q_BASE}`)
    && twin.includes(`P.pitchOdd ? 3.2 : ${Q_GAIN}`),
  `model-js.js q schedule is out of parity with the shader (${Q_BASE} + ${Q_GAIN}*...)`);
});

test('the skew map must be EVEN: an odd map cannot pitch anything', () => {
  // Parity of the map itself. f(theta) = theta - theta' is the displacement the
  // map applies; the requirement is that it be EVEN, because crestShape is.
  for (const s of [0.2, 0.5, 0.8]) {
    for (const th of [0.3, 0.9, 1.7, 2.6, 3.0]) {
      const evenDisp = (t) => t - evenMap(t, s);
      const oddDisp = (t) => t - oddMap(t, s);
      assert.ok(Math.abs(evenDisp(th) - evenDisp(-th)) < 1e-12,
        `the shipped map's displacement is not even at theta = ${th}, s = ${s}`);
      assert.ok(Math.abs(oddDisp(th) + oddDisp(-th)) < 1e-12,
        'the reverted map should be odd — the premise of this test changed');
    }
  }
  // And the consequence, measured on the composed height: the odd map is a
  // no-op for asymmetry at EVERY (s, q) in the reachable plane.
  for (const s of [0, 0.2, 0.4, 0.6, 0.8]) {
    for (const q of [1.6, 2.5, 3.5, 4.56, 6.0]) {
      const r = faceRatio(profile(oddMap, s, q));
      assert.ok(Math.abs(r - 1) < 1e-6,
        `the ODD map produced front/back ${r.toFixed(6)} at s=${s}, q=${q} — `
        + 'if this ever fails, crestShape stopped being even in its argument '
        + 'and the whole falsification needs revisiting');
    }
  }
});

test('a nonzero skew leans the wave: front/back grows well past 1', () => {
  // The guard that stops a refactor from silently restoring a symmetric wave.
  // Thresholds are deliberately loose — this pins CAPABILITY, not tuning.
  const q = Q_BASE + Q_GAIN * (0.6 + 0.5 * 0.65);          // secondpeak at the line
  assert.ok(Math.abs(faceRatio(profile(evenMap, 0, q)) - 1) < 1e-6,
    'zero skew must still be symmetric');
  let prev = 1;
  for (const s of [0.2, 0.4, 0.6, SKEW_MAX]) {
    const r = faceRatio(profile(evenMap, s, q));
    assert.ok(r > prev, `front/back must grow with skew: ${prev.toFixed(3)} -> ${r.toFixed(3)} at s=${s}`);
    prev = r;
  }
  const atLine = faceRatio(profile(evenMap, SKEW_MAX, q));
  assert.ok(atLine > 2.0,
    `at the break line the front face must be at least twice the back, got ${atLine.toFixed(2)}`);
});

test('the phase map stays monotonic, so the height field stays single-valued', () => {
  // dtheta'/dtheta = 1 - s*sin(theta). At s = 1 the front face is vertical and
  // past it the map folds — h would be multivalued in the HEIGHT field, which
  // no amount of choppyPos care can undo. This is what the 0.8 clamp buys, and
  // it is why raising the clamp is not a free tuning knob.
  assert.ok(SKEW_MAX < 1,
    `the skew clamp is ${SKEW_MAX}; at s >= 1 the phase map is non-monotonic`);
  for (const s of [0.2, 0.5, SKEW_MAX]) {
    let minSlope = Infinity;
    for (let i = 0; i < 4096; i++) {
      const th = 2 * Math.PI * i / 4096;
      minSlope = Math.min(minSlope, 1 - s * Math.sin(th));
    }
    assert.ok(minSlope > 0, `dtheta'/dtheta hits ${minSlope.toFixed(4)} at s = ${s}`);
  }
  // The largest skew the schedule can request must respect the clamp, and the
  // clamp is what keeps it monotonic — so the gain alone may not exceed it
  // without the clamp present.
  assert.ok(MODEL_GLSL.includes('clamp(excess*skewGain, 0.0, 0.8)'),
    'the skew clamp was removed or reshaped — see the monotonicity argument above');
  assert.ok(SKEW_GAIN > 0, 'the skew gain went to zero: nothing pitches');
});

test('crestShape never takes pow() of a negative base, on either map', () => {
  // House rule: pow(neg, frac) is NaN. The max(..., 0) guard in crestShape
  // exists for that; the pitch change alters the PHASE feeding it, so the
  // trough is re-checked here rather than assumed.
  for (const map of [evenMap, oddMap]) {
    for (const s of [0, 0.4, SKEW_MAX, 0.95]) {
      for (const q of [Q_BASE, Q_BASE + Q_GAIN * 1.325, 1.6, 4.56]) {
        const y = profile(map, s, q);
        for (const v of y) assert.ok(Number.isFinite(v), `non-finite h at s=${s}, q=${q}`);
        // The trough is exactly -0.5/q * 2 and must still be reached: the map
        // is a reparameterisation, so it may move the trough but not remove it.
        const lo = Math.min(...y);
        assert.ok(Math.abs(lo - (-1.0 / q)) < 1e-6,
          `trough moved: ${lo.toFixed(6)} vs ${(-1 / q).toFixed(6)} at s=${s}, q=${q}`);
      }
    }
  }
});
