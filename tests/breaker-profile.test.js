// Source-level invariants of the breaking-crest cross-section family
// (shared/breaker-profile-glsl.js). The GPU readback and the segment test live
// in scripts/probe_breaker_profile.mjs (needs a browser); this file checks
// what node can: the Track B contract signatures, that the clock constants
// mirror shared/model-glsl.js, no frame constants, no backticks or GLSL ES
// reserved identifiers inside the literal, balanced braces, and that the
// shipped renderer only splices it under the TUBE build define (Track B,
// 2026-09-24: a default boot compiles the pristine text; byte-identical frames).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { BREAKER_PROFILE_GLSL } from '../shared/breaker-profile-glsl.js';

const model = readFileSync(new URL('../shared/model-glsl.js', import.meta.url), 'utf8');
const shaders = readFileSync(new URL('../web-three/js/shaders.js', import.meta.url), 'utf8');
const source = readFileSync(new URL('../shared/breaker-profile-glsl.js', import.meta.url), 'utf8');
const explorer = readFileSync(new URL('../experiments/tube-profile.html', import.meta.url), 'utf8');

function constant(text, name) {
  const m = text.match(new RegExp(`const float ${name}\\s*=\\s*([0-9.]+);`));
  assert.ok(m, `missing GLSL constant ${name}`);
  return Number(m[1]);
}

test('Track B contract: both signatures present, verbatim', () => {
  assert.match(BREAKER_PROFILE_GLSL, /\nvec2 breakerProfile\(float u, float age, float xi, float hC, float c\)\{/);
  assert.match(BREAKER_PROFILE_GLSL, /\nfloat breakerProfileWeight\(float age, float xi\)\{/);
});

test('the profile clock mirrors the model lifecycle constants', () => {
  assert.equal(constant(BREAKER_PROFILE_GLSL, 'BP_IMPACT_S'), constant(model, 'CRASH_PEAK_S'));
  assert.equal(constant(BREAKER_PROFILE_GLSL, 'BP_SIGMA_S'), constant(model, 'CRASH_SIGMA_S'));
  assert.equal(constant(BREAKER_PROFILE_GLSL, 'BP_G'), constant(model, 'G'));
  // release endpoint: impact + 1.5 sigma, the same expression breakerCurlCycle uses
  assert.match(BREAKER_PROFILE_GLSL, /const float BP_RELEASE_S = BP_IMPACT_S \+ 1\.5\*BP_SIGMA_S;/);
  assert.match(model, /CRASH_PEAK_S \+ 1\.5\*CRASH_SIGMA_S/);
});

test('the plunging blend is the renderer\'s shared ramp, byte for byte', () => {
  assert.match(BREAKER_PROFILE_GLSL, /float bpPlunge\(float xi\)\{ return smoothstep\(0\.45, 1\.25, xi\); \}/);
  // Since 2026-09-24 (SECTION_CURL) the model owns the ramp once, at a
  // station: plungeAt(x) = smoothstep(0.45, 1.25, xiAt(x)), and xiAt returns
  // u_xi verbatim unless #sectioncurl is armed. Every renderer consumer reads
  // plungeAt/xiAt — no raw u_xi ramp may survive in the shaders, or a station
  // would keep the spot constant while its neighbours went local.
  assert.match(model, /float plungeAt\(float x\)\{ return smoothstep\(0\.45, 1\.25, xiAt\(x\)\); \}/);
  assert.match(model, /if \(u_sectionCurl <= 0\.5\) return u_xi;/);
  // ...and a default boot (no SECTION_CURL define) preprocesses both names
  // back to the shipped text, so main's pixels are unchanged by construction.
  assert.match(model, /#ifdef SECTION_CURL[\s\S]*#else\n#define xiAt\(x\) u_xi\n#define plungeAt\(x\) smoothstep\(0\.45, 1\.25, u_xi\)\n#endif/);
  assert.match(shaders, /float plunge = plungeAt\(xz0\.x\);/);
  assert.doesNotMatch(shaders, /smoothstep\(0\.45, 1\.25, u_xi\)/);
  assert.doesNotMatch(shaders.replace(/\/\/[^\n]*/g, ''), /breakerProfileWeight\([^)]*u_xi\)/);
});

test('rate independence: seconds only, no frame constants', () => {
  assert.doesNotMatch(BREAKER_PROFILE_GLSL, /1\.0\s*\/\s*60|\/\s*60\.0|0\.0166|0\.01667|16\.6|\bdt\b|u_frame|deltaTime|frameRate|u_dt/);
  // no uniforms at all: every input is an argument so the text runs anywhere
  assert.doesNotMatch(BREAKER_PROFILE_GLSL, /\buniform\b/);
});

test('the literal is clean GLSL: no backticks, no reserved identifiers, balanced braces', () => {
  const body = source.slice(source.indexOf('`') + 1, source.lastIndexOf('`'));
  assert.equal((body.match(/`/g) || []).length, 0, 'backtick inside the GLSL literal');
  const reserved = new Set(['flat', 'smooth', 'noperspective', 'sample', 'patch', 'layout', 'precise',
    'shared', 'buffer', 'coherent', 'volatile', 'restrict', 'readonly', 'writeonly', 'centroid',
    'invariant', 'subroutine', 'common', 'partition', 'active', 'filter', 'resource', 'input', 'output']);
  for (const line of body.split('\n')) {
    const decl = line.match(/\b(?:float|int|uint|bool|[iub]?vec[234]|mat[234])\s+(\w+)/);
    if (decl) assert.ok(!reserved.has(decl[1]), `reserved word as identifier: ${decl[1]}`);
  }
  const open = (body.match(/\{/g) || []).length, close = (body.match(/\}/g) || []).length;
  assert.equal(open, close, 'unbalanced braces');
  const po = (body.match(/\(/g) || []).length, pc = (body.match(/\)/g) || []).length;
  assert.equal(po, pc, 'unbalanced parentheses');
  // every function has a NaN guard or is a pure arithmetic helper; the two
  // contract functions carry the house-rule guard explicitly
  assert.match(BREAKER_PROFILE_GLSL, /if \(!\(P\.x == P\.x && P\.y == P\.y\)\)/);
  assert.match(BREAKER_PROFILE_GLSL, /if \(!\(w == w\)\) w = 0\.0;/);
});

test('inputs are clamped to the documented ranges before use', () => {
  assert.match(BREAKER_PROFILE_GLSL, /u\s*=\s*clamp\(u, 0\.0, 1\.0\);/);
  assert.match(BREAKER_PROFILE_GLSL, /age\s*=\s*clamp\(age, -1\.0, 20\.0\);/);
  assert.match(BREAKER_PROFILE_GLSL, /hC\s*=\s*clamp\(hC, 0\.05, 50\.0\);/);
});

test('physics terms carry their stated basis in the source', () => {
  // each named mechanism is present with its one-line why
  assert.match(source, /Stokes' 120-degree limiting crest/);
  assert.match(source, /Mead & Black \(2001c/);
  assert.match(source, /Battjes \(1974\)/);
  assert.match(source, /Longuet-Higgins \/ Peregrine plunging-jet picture/);
  assert.match(source, /kinematic stretching/);
  // the ballistic parabola is the jet: y = hC (1 - sigma^2)
  assert.match(BREAKER_PROFILE_GLSL, /return vec2\(sigma\*sL, hC\*\(1\.0 - sigma\*sigma\)\);/);
  // reach = launch speed (relative to the crest) * sqrt(2 hC / g)
  assert.match(BREAKER_PROFILE_GLSL, /return BP_LAUNCH_REL\*bpPlunge\(xi\)\*c; \}/);
  assert.match(BREAKER_PROFILE_GLSL, /return bpLaunchSpeed\(xi, c\)\*bpFallTime\(hC\);/);
  assert.match(BREAKER_PROFILE_GLSL, /return sqrt\(2\.0\*hC\/BP_G\);/);
  // v2: the post-impact collapse names its sources
  assert.match(source, /Peregrine 1983's/);
  assert.match(source, /Kimmoun & Branger 2007/);
  assert.match(source, /Duncan's \(1999\) bulge/);
});

test('v2 launch frame: the ground-frame launch lands on the model\'s receiver at depth-limited pairs', () => {
  // s is measured from the crest source point, which moves at c, so the
  // relative launch fraction must be strictly between 0 (no throw) and 1
  // (2 c in the ground frame, faster than any measured tip).
  const rel = constant(BREAKER_PROFILE_GLSL, 'BP_LAUNCH_REL');
  assert.ok(rel > 0 && rel < 1, `BP_LAUNCH_REL ${rel} outside (0, 1)`);
  // At c = sqrt(g h) and hC = 0.8*GAMMA*h (breakerCeilM's depth limit) the
  // landing sL/hC = rel * sqrt(2 / (0.8*GAMMA)) is depth-free; it must sit on
  // CURT_REACH within 3% so the ribbon's foot and the shared landing agree
  // without a second constant. A formula check on the constants, not a twin.
  const gamma = constant(model, 'GAMMA');
  const curtReach = constant(model, 'CURT_REACH');
  assert.match(model, /0\.8\*VIS\*min\(u_H0\*Ks, GAMMA\*dep\)/, 'breakerCeilM depth limit moved; re-derive the landing');
  const landing = rel * Math.sqrt(2 / (0.8 * gamma));
  assert.ok(Math.abs(landing - curtReach) <= 0.03 * curtReach, `depth-limited landing ${landing.toFixed(3)} hC is not on CURT_REACH ${curtReach}`);
});

test('v2 collapse: the roof is rooted at the crest and the cavity closes from the landing side', () => {
  // the collapse runs on the shared release window, so both weight ends stay zero
  assert.match(BREAKER_PROFILE_GLSL, /float bpCollapse\(float age\)\{ return smoothstep\(BP_IMPACT_S, BP_RELEASE_S, age\); \}/);
  // the apex sags onto the FIXED underside root (never rises, never leaves s = 0)
  assert.match(BREAKER_PROFILE_GLSL, /vec2 A {2}= mix\(A0, R, col\);/);
  // the face rises to the underside behind a front that runs landing -> root,
  // and the same closure is exposed for the ribbon to fade the face leg by
  assert.match(BREAKER_PROFILE_GLSL, /\nfloat bpFaceClosure\(float u, float age\)\{/);
  assert.match(BREAKER_PROFILE_GLSL, /float front = \(1\.0 \+ BP_CLOSE_W\)\*\(1\.0 - bpCollapse\(/);
  assert.match(BREAKER_PROFILE_GLSL, /float k = bpFaceClosure\(u, age\);/);
  assert.match(BREAKER_PROFILE_GLSL, /P = mix\(F, U, k\);/);
  // no trailing edge clears any more: the v1 sig0 handoff is gone
  assert.doesNotMatch(BREAKER_PROFILE_GLSL, /sig0/);
});

test('the explorer draws from the GLSL; the renderer splices it only under #ifdef TUBE', () => {
  assert.match(explorer, /import \{ BREAKER_PROFILE_GLSL \} from '\.\.\/shared\/breaker-profile-glsl\.js'/);
  assert.match(explorer, /breakerProfile\(a_u, u_age, u_xi, u_hC, u_c\)/);
  assert.match(explorer, /breakerProfileWeight\(u_age, u_xi\)/);
  // shaders.js may import the module, but every splice of the literal must sit
  // inside a TUBE guard so a default boot never sees the profile text.
  const splices = [...shaders.matchAll(/\$\{BREAKER_PROFILE_GLSL\}/g)].map((m) => m.index);
  assert.ok(splices.length >= 1, 'the tube build splices the profile into the surface prelude');
  for (const i of splices) {
    const before = shaders.slice(0, i);
    const open = before.lastIndexOf('#ifdef TUBE');
    const close = before.lastIndexOf('#endif');
    assert.ok(open > close, `BREAKER_PROFILE_GLSL splice at ${i} is not inside an #ifdef TUBE block`);
  }
  // No other renderer file imports the module directly; tube.js composes it
  // through shaders.js's guarded prelude.
  const dir = new URL('../web-three/js/', import.meta.url);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.js') || f === 'shaders.js') continue;
    assert.doesNotMatch(readFileSync(new URL(f, dir), 'utf8'), /from\s+['"][^'"]*breaker-profile/, `${f} imports the profile`);
  }
});
