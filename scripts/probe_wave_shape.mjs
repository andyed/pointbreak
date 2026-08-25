// WAVE-SHAPE AUDIT probe (measurement only; nothing here tunes anything).
//
// Question: the drawn waves read as "smooth rounded dunes" and the curl as a
// thin shell. This turns that into the standard nonlinear shape statistics of
// a shoaling wave — skewness Sk = <n^3>/<n^2>^1.5 (peaked crests / flat
// troughs) and asymmetry As = <H[n]^3>/<n^2>^1.5 via the Hilbert transform
// (the pitched-forward face) — plus face slope, crest curvature, crest/trough
// ratio and the local Ursell number, as a function of distance-to-break and of
// Iribarren xi.
//
// INSTRUMENT. Three independent legs, because MEASUREMENT_LESSONS 2 and 4 say
// a probe that scores a replica certifies the replica:
//
//   1. GPU leg (primary). The probe fragment shader is the SHIPPED source:
//      MODEL_GLSL verbatim, plus the farFadeAt/choppyPos block sliced by text
//      out of GRID_VERT, bound to the LIVE uniform objects (same DataTextures
//      for u_bed / u_breakTex / u_refrTex) read off window.__pointbreak. It is
//      compiled by the same three.js from the same strings the water mesh uses,
//      so it is the drawn surface's own math, not a transcription of it. The
//      splice is asserted to be a substring of GRID_VERT and MODEL_GLSL is
//      asserted to be a substring of GRID_VERT.
//   2. JS leg (cross-check). An independent hand transcription of the height
//      path, in the probe_arm_terms.mjs idiom. Two implementations agreeing is
//      the check that the splice did not silently drop a term.
//   3. Section-view leg. The breaking depth the probe finds along a transect is
//      compared with what section.js draws (Hsh vs gamma*h crossing) using
//      bed.js's own bedElevBlended, i.e. the on-screen analysis chart.
//
// Two render passes per configuration, both to a FloatType render target:
//   SPACE: rows = x stations, cols = z. One frozen clock. Gives eta(z) plus the
//          horizontally displaced position, so a fold (dZ/dz0 < 0, i.e. an
//          overturning face) is directly detectable.
//   TIME:  rows = gauge points at fixed distance-to-break, cols = t. Gives the
//          surface time series a field instrument would record, which is what
//          Elgar & Guza / Doering & Bowen statistics are defined on.
//
// Usage:
//   node scripts/probe_wave_shape.mjs <outdir> [--base=http://localhost:8210/web-three/]
//        [--presets=sewers,secondpeak,sharks,jacks] [--sims=42,48,54]
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  '/Users/andyed/Documents/dev/psychodeli-webgl-port/node_modules/playwright/index.mjs',
].filter(Boolean);
let chromium;
for (const c of PW_CANDIDATES) {
  try { ({ chromium } = await import(c)); break; } catch { /* try next */ }
}
if (!chromium) { console.error('playwright not found'); process.exit(1); }

const args = process.argv.slice(2);
// Split on the FIRST '=' only: --hash=pitch=0 must keep its whole value, and a
// plain .split('=') silently drops it (which reads as "the A/B arm did nothing"
// rather than as a parse bug — MEASUREMENT_LESSONS 2).
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const body = a.replace(/^--/, ''), i = body.indexOf('=');
  return i < 0 ? [body, '1'] : [body.slice(0, i), body.slice(i + 1)];
}));
const OUT = resolve(args.filter((a) => !a.startsWith('--'))[0] || '/tmp/pointbreak-shape');
const BASE = flags.base || 'http://localhost:8210/web-three/';
const PRESETS = (flags.presets || 'sewers,secondpeak,sharks,jacks').split(',');
const SIMS = (flags.sims || '42,48,54').split(',').map(Number);
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// ---------------------------------------------------------------- in-page
async function probeInPage(cfg) {
  const pb = window.__pointbreak;
  const THREE = await import('/web-three/vendor/three.module.js');
  const { MODEL_GLSL } = await import('/shared/model-glsl.js');
  const { GRID_VERT } = await import('/web-three/js/shaders.js');
  const bed = await import('/web-three/js/bed.js');
  const disp = await import('/web-three/js/dispersion.js');

  // ---- provenance: the probe must be the shipped source, not a copy of it ----
  const prov = {};
  prov.modelInVert = GRID_VERT.indexOf(MODEL_GLSL) >= 0;
  const SL_A = 'const vec2 STAGE_HALF';
  const SL_B = '// Terrain wins wherever the seabed stands above';
  const iA = GRID_VERT.indexOf(SL_A), iB = GRID_VERT.indexOf(SL_B);
  prov.sliceFound = iA > 0 && iB > iA;
  const CHOPPY = GRID_VERT.slice(iA, iB);
  prov.sliceIsSubstring = GRID_VERT.indexOf(CHOPPY) === iA;
  prov.sliceHasChoppyPos = CHOPPY.indexOf('vec3 choppyPos(') >= 0;
  prov.sliceHasFarFade = CHOPPY.indexOf('float farFadeAt(') >= 0;
  prov.sliceLen = CHOPPY.length;
  prov.modelLen = MODEL_GLSL.length;
  // choppyPos' out-parameter list is not stable across commits (an `aer` out was
  // added 2026-08-18). Read the signature and build the call to match, so the
  // probe cannot silently measure a stale arity.
  const sigM = CHOPPY.match(/vec3\s+choppyPos\s*\(([^)]*)\)/);
  if (!sigM) throw new Error('choppyPos signature not found in the GRID_VERT slice');
  const params = sigM[1].split(',').map((s2) => s2.trim());
  const outs = params.filter((s2) => s2.startsWith('out '))
    .map((s2) => s2.split(/\s+/).pop());
  prov.choppySignature = sigM[0];
  prov.choppyOuts = outs;
  const OUTDECL = outs.map((o) => `float o_${o} = 0.0;`).join(' ');
  const OUTCALL = outs.map((o) => `o_${o}`).join(', ');
  const gv = (n) => (outs.includes(n) ? `o_${n}` : '0.0');

  const U = {};
  for (const [k, u] of Object.entries(pb.uniforms)) {
    const v = u.value;
    if (typeof v === 'number') U[k] = v;
    else if (v && v.isVector2) U[k] = [v.x, v.y];
    else if (v && v.isVector3) U[k] = [v.x, v.y, v.z];
    else if (v && v.isVector4) U[k] = [v.x, v.y, v.z, v.w];
  }
  const t0 = pb.sim();

  // GRID_VERT declares its uniforms OUTSIDE the sliced choppyPos block, and
  // that list grows with every render feature (u_carrierAmp, u_curl, u_lamCap,
  // ...). Declaring them by hand here is a treadmill the probe has already
  // fallen off once, so: collect every u_* the slice references, subtract the
  // ones MODEL_GLSL (or this preamble) already declares, and declare the rest
  // with the type read off the LIVE uniform object — the same authority the
  // values are bound from, so declaration and binding cannot disagree.
  const declared = new Set([...`${MODEL_GLSL}`.matchAll(/uniform\s+\w+\s+(u_\w+)/g)].map((m) => m[1]));
  ['u_fidelityLook', 'u_pRectA', 'u_pRectB', 'u_pMode', 'u_pSize', 'u_pT', 'u_gauge'].forEach((n) => declared.add(n));
  const glType = (v) => {
    if (typeof v === 'number') return 'float';
    if (v && v.isVector2) return 'vec2';
    if (v && v.isVector3) return 'vec3';
    if (v && v.isVector4) return 'vec4';
    if (v && v.isTexture) return 'sampler2D';
    return null;
  };
  const missing = [];
  for (const name of new Set([...CHOPPY.matchAll(/\bu_\w+/g)].map((m) => m[0]))) {
    if (declared.has(name)) continue;
    const u = pb.uniforms[name];
    const ty = u ? glType(u.value) : null;
    if (!ty) throw new Error(`slice references ${name} but no live uniform of a declarable type exists`);
    missing.push(`uniform ${ty} ${name};`);
  }
  prov.autoDeclared = missing.map((d) => d.split(' ')[2].replace(';', ''));

  // ---- probe material ----
  const FRAG = `
precision highp float;
precision highp int;
uniform float u_fidelityLook;
uniform vec4  u_pRectA;   // space: x0, dx, z0, dz     | time: gauge unused
uniform vec4  u_pRectB;   // time:  t0, dt (x,y)
uniform float u_pMode;    // 0 space, 1 time
uniform vec2  u_pSize;    // render-target size
uniform float u_pT;
// gauge table for the TIME pass, one (x,z) per row
uniform vec2  u_gauge[16];
${MODEL_GLSL}
${missing.join('\n')}
${CHOPPY}
void main(){
  float col = floor(gl_FragCoord.x);
  float row = floor(gl_FragCoord.y);
  vec2 p; float t;
  if (u_pMode < 0.5) {
    p = vec2(u_pRectA.x + row*u_pRectA.y, u_pRectA.z + col*u_pRectA.w);
    t = u_pT;
  } else {
    int gi = int(row);
    vec2 g = vec2(0.0);
    for (int k = 0; k < 16; ++k) { if (k == gi) g = u_gauge[k]; }
    p = g;
    t = u_pRectB.x + col*u_pRectB.y;
  }
  ${OUTDECL}
  vec3 P = choppyPos(p, t, ${OUTCALL});
  // rgb = displaced position; a = the UNDISPLACED height at the source point
  gl_FragColor = vec4(P.x, P.y, P.z, oceanH(p, t));
}`;
  const FRAG2 = FRAG.replace(
    'gl_FragColor = vec4(P.x, P.y, P.z, oceanH(p, t));',
    `gl_FragColor = vec4(${gv('foam')}, ${gv('pocket')}, ${gv('brk')}, waterDepthM(p));`);

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(8, 8);
  const camQ = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quad = new THREE.PlaneGeometry(2, 2);

  const probeU = {
    u_pRectA: { value: new THREE.Vector4(0, 1, 0, 1) },
    u_pRectB: { value: new THREE.Vector4(0, 1, 0, 0) },
    u_pMode: { value: 0 },
    u_pSize: { value: new THREE.Vector2(1, 1) },
    u_pT: { value: t0 },
    u_gauge: { value: Array.from({ length: 16 }, () => new THREE.Vector2(0, 0)) },
  };
  const uni = Object.assign({}, pb.uniforms, probeU);
  const mkMat = (src) => new THREE.ShaderMaterial({
    vertexShader: 'void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: src, uniforms: uni,
  });
  const matA = mkMat(FRAG), matB = mkMat(FRAG2);
  const sceneQ = new THREE.Scene();
  const meshQ = new THREE.Mesh(quad, matA);
  sceneQ.add(meshQ);

  function renderPass(mat, W, H) {
    const rt = new THREE.WebGLRenderTarget(W, H, {
      type: THREE.FloatType, format: THREE.RGBAFormat,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
      depthBuffer: false, stencilBuffer: false,
    });
    meshQ.material = mat;
    probeU.u_pSize.value.set(W, H);
    renderer.setRenderTarget(rt);
    renderer.render(sceneQ, camQ);
    const buf = new Float32Array(W * H * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, W, H, buf);
    renderer.setRenderTarget(null);
    rt.dispose();
    return buf;
  }
  const shaderErr = [];
  const origErr = console.error;
  console.error = (...a) => { shaderErr.push(a.map(String).join(' ')); origErr(...a); };

  // ================= SPACE pass =================
  // rows = x stations, cols = z from Z0 in steps of DZ
  const sb = U.u_stageBounds || [-110, 290];
  const XS = cfg.xs && cfg.xs.length ? cfg.xs
    : [sb[0] + 0.25 * (sb[1] - sb[0]), sb[0] + 0.5 * (sb[1] - sb[0]), sb[0] + 0.75 * (sb[1] - sb[0])]
      .map((v) => Math.round(v));
  const DZ = 0.20, NZ = 2048, Z0 = -320;
  const NX = XS.length;
  probeU.u_pMode.value = 0;
  probeU.u_pT.value = t0;
  // rows carry x: p.x = x0 + row*dx  -> encode explicit list by rendering rows
  // one at a time is wasteful; instead make dx the spacing of a uniform list.
  // XS is arbitrary, so render one row-block per station.
  const space = [];
  for (const x of XS) {
    probeU.u_pRectA.value.set(x, 0, Z0, DZ);
    const a = renderPass(matA, NZ, 1);
    const b = renderPass(matB, NZ, 1);
    const row = { x, zb: null, z: [], X: [], Y: [], Z: [], hRaw: [], foam: [], pocket: [], brk: [], depth: [] };
    for (let i = 0; i < NZ; i++) {
      row.z.push(Z0 + i * DZ);
      row.X.push(a[i * 4]); row.Y.push(a[i * 4 + 1]); row.Z.push(a[i * 4 + 2]);
      row.hRaw.push(a[i * 4 + 3]);
      row.foam.push(b[i * 4]); row.pocket.push(b[i * 4 + 1]);
      row.brk.push(b[i * 4 + 2]); row.depth.push(b[i * 4 + 3]);
    }
    space.push(row);
  }

  // ================= TIME pass =================
  // gauges at fixed distance-to-break d = zb - z along the middle station
  const xg = XS[Math.floor(XS.length / 2)];
  // breakLine(x) via the GPU: sample the SPACE row for this x is not enough, so
  // re-derive from the JS twin below and confirm against the brk field.
  const DVALS = cfg.dvals || [200, 140, 100, 70, 45, 30, 18, 10, 4, 0, -12, -30];
  const NT = 2048;
  const Tcar = U.u_T;
  const DT = (cfg.periods || 6) * Tcar / NT;
  const tStart = t0 - (cfg.periods || 6) * Tcar / 2;

  // ---- JS transcription (leg 2). Independent hand port of the height path. ----
  const PI = Math.PI, G = 9.81, LAM = 90.0, GAMMA = 0.78;
  const SHELTER_X0 = 24.0, SHELTER_L = 1675.0;
  const texArr = (u) => Array.from(u.value.image.data);
  const breakTex = texArr(pb.uniforms.u_breakTex);
  const bedTex = texArr(pb.uniforms.u_bed);
  const refrTex = pb.uniforms.u_refrTex && pb.uniforms.u_refrTex.value
    ? texArr(pb.uniforms.u_refrTex) : null;
  const fract = (x) => x - Math.floor(x);
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  const mix = (a, b, s) => a + (b - a) * s;
  const step_ = (e, x) => (x >= e ? 1 : 0);
  const smoothstep = (a, b, x) => { const s = clamp((x - a) / (b - a), 0, 1); return s * s * (3 - 2 * s); };
  const modG = (a, b) => a - b * Math.floor(a / b);
  function hash11(p) { p = fract(p * 0.1031); p *= p + 33.33; return fract((p + p) * p); }
  function hash21(x, y) {
    let qx = fract(x * 0.1031), qy = fract(y * 0.1031), qz = fract(x * 0.1031);
    const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
    qx += d; qy += d; qz += d; return fract((qx + qy) * qz);
  }
  function vnoise1(x) { const i = Math.floor(x); let f = x - i; f = f * f * (3 - 2 * f); return mix(hash11(i), hash11(i + 1), f); }
  function vnoise2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return mix(mix(hash21(ix, iy), hash21(ix + 1, iy), fx), mix(hash21(ix, iy + 1), hash21(ix + 1, iy + 1), fx), fy);
  }
  const aframe = U.u_aframe || 0;
  const geoWeight = () => clamp(U.u_geoMix, 0, 1) * (1 - step_(0.5, aframe));
  function coastCurve(x) {
    const xx = mix(x, Math.abs(x), aframe);
    const synthetic = xx * xx / 5000;
    const gx = clamp(x, U.u_stageBounds[0], U.u_stageBounds[1]);
    const measured = U.u_contourFit[0] * gx * gx + U.u_contourFit[1] * gx * gx * gx;
    return mix(synthetic, measured, geoWeight());
  }
  function swellPhi() {
    const a = clamp(U.u_alpha, 0.06, 1.45);
    const hb = Math.max(U.u_H0 / GAMMA, 0.4);
    const c0 = G * U.u_T / (2 * PI), cb = Math.sqrt(G * hb);
    return clamp(Math.asin(clamp(Math.sin(a) * clamp(cb / Math.max(c0, 0.1), 0, 1), 0, 1)), 0.04, 1.45);
  }
  const contourZ = (x, z) => z + coastCurve(x);
  const shelterAt = (x) => mix(1, clamp(Math.exp(-(x - SHELTER_X0) / SHELTER_L), 0.6, 1.25), U.u_depthMix * U.u_shelterMix);
  function breakTexZ(x) {
    const f = clamp((x - U.u_breakX[0]) / Math.max(U.u_breakX[1] - U.u_breakX[0], 1e-3), 0, 1) * 127;
    const i = Math.floor(f), tf = f - i;
    const dec = (j) => { const o = Math.min(j, 127) * 4; return mix(U.u_breakZ[0], U.u_breakZ[1], (breakTex[o] * 256 + breakTex[o + 1]) / 65535); };
    return mix(dec(i), dec(i + 1), tf);
  }
  function breakMask(x) {
    const f = clamp((x - U.u_breakX[0]) / Math.max(U.u_breakX[1] - U.u_breakX[0], 1e-3), 0, 1) * 127;
    const i = Math.floor(f), tf = f - i;
    const b = (j) => breakTex[Math.min(j, 127) * 4 + 2] / 255;
    return mix(1, mix(b(i), b(i + 1), tf), U.u_gapMask * U.u_breakMix);
  }
  function breakLine(x) {
    const xx = mix(x, Math.abs(x), aframe);
    const sec = U.u_sections * 55 * (vnoise1(xx * 0.02 + 7.3) - 0.5) * 2;
    const base = mix(-coastCurve(x), breakTexZ(x), U.u_breakMix);
    return base + Math.min(sec, 0) * step_(0.05, U.u_sections);
  }
  function reefWindow(x) {
    const xx = mix(x, Math.abs(x), aframe);
    return smoothstep(U.u_reefWin[0], U.u_reefWin[1], xx) * (1 - smoothstep(U.u_reefWin[2], U.u_reefWin[3], xx));
  }
  function bedTexel(i, j) {
    const nx = U.u_bedSize[0], nz = U.u_bedSize[1];
    const o = (clamp(j, 0, nz - 1) * nx + clamp(i, 0, nx - 1)) * 4;
    return mix(U.u_bedElev[0], U.u_bedElev[1], (bedTex[o] * 256 + bedTex[o + 1]) / 65535);
  }
  function bedElevM(x, z) {
    const [rx0, rz0, rx1, rz1] = U.u_bedRect;
    const tcx = clamp((x - rx0) / Math.max(rx1 - rx0, 1e-3), 0, 1) * (U.u_bedSize[0] - 1);
    const tcy = clamp((z - rz0) / Math.max(rz1 - rz0, 1e-3), 0, 1) * (U.u_bedSize[1] - 1);
    const i0 = Math.floor(tcx), j0 = Math.floor(tcy), fx = tcx - i0, fy = tcy - j0;
    const measured = mix(mix(bedTexel(i0, j0), bedTexel(i0 + 1, j0), fx),
      mix(bedTexel(i0, j0 + 1), bedTexel(i0 + 1, j0 + 1), fx), fy);
    const plane = U.u_bedPlane[0] + U.u_bedPlane[1] * x + U.u_bedPlane[2] * z;
    const wet = smoothstep(U.u_waterLevel + 0.15, U.u_waterLevel - 0.15, measured);
    const e = mix(measured, plane, (U.u_bedShape || 0) * wet);
    const dO = Math.hypot(Math.max(Math.max(rx0 - x, x - rx1), 0), Math.max(Math.max(rz0 - z, z - rz1), 0));
    const oceanic = 1 - smoothstep(U.u_waterLevel - 0.5, U.u_waterLevel + 1.0, e);
    const landHold = mix(e, Math.min(e, U.u_waterLevel + 2), smoothstep(60, 520, dO));
    return mix(landHold, e - 0.045 * dO, oceanic);
  }
  const waterDepthM = (x, z) => Math.max(U.u_waterLevel - bedElevM(x, z), 0);
  const modelDepthM = (x, z) => Math.max(waterDepthM(x, z), 0.35);
  function rayS(x, z) {
    const phi = swellPhi(); const xx = mix(x, Math.abs(x), aframe);
    return xx * Math.sin(phi) + contourZ(x, z) * Math.cos(phi);
  }
  function psiLookup(zc) {
    const f = clamp((zc - U.u_refrZ[0]) / Math.max(U.u_refrZ[1] - U.u_refrZ[0], 1e-3), 0, 1) * 255;
    const i = Math.floor(f), tf = f - i;
    const dec = (j) => { const o = Math.min(j, 255) * 4; return mix(U.u_refrPsi[0], U.u_refrPsi[1], (refrTex[o] * 256 + refrTex[o + 1]) / 65535); };
    return mix(dec(i), dec(i + 1), tf);
  }
  function rayPhase(x, z) {
    const legacy = (2 * PI / LAM) * rayS(x, z);
    if (!refrTex) return legacy;
    const xx = mix(x, Math.abs(x), aframe);
    return mix(legacy, U.u_refrKappa * xx + psiLookup(contourZ(x, z)), U.u_psiMix * U.u_depthMix);
  }
  function setPhase(s, tt) {
    const cg = G * U.u_T / (4 * PI);
    const tRef = (45.0 - (U.u_setRef ?? 0) / cg) * (U.u_setAnchor ?? 0);
    return 2 * PI * U.u_dF * (tt - tRef - s / cg);
  }
  // u_setDepth is the 2026-08-18 lull floor (env = (1-m) + m*cos, floor 1-2m).
  // Legacy 0.5 fallback keeps an older uniform dump bit-identical.
  const setEnv = (s, tt) => {
    const m = U.u_setDepth ?? 0.5;
    return (1 - m) + m * Math.cos(setPhase(s, tt));
  };
  const setupPeakM = () => 0.3 * U.u_H0 * U.u_depthMix;
  function setupLiftM(x, z, tt) {
    const ph = setPhase(rayS(x, z), tt);
    const envS = 0.5 + 0.5 * Math.cos(ph - (0.9 + 0.8 * Math.sin(ph)));
    return setupPeakM() * envS * (1 - smoothstep(1.2, 2.0, waterDepthM(x, z)));
  }
  const crestShape = (ph, q) => Math.pow(Math.max(0.5 + 0.5 * Math.cos(ph), 0), q) - 0.5 / q;
  const VIS = 3.2;
  // the height path of ocean(), terms exposed
  function oceanJS(x, z, tt) {
    const w = 2 * PI / U.u_T;
    const zb = breakLine(x), d = zb - z, reef = reefWindow(x);
    const lift = setupLiftM(x, z, tt);
    const dep = modelDepthM(x, z) + lift;
    const growSyn = 1 + 0.85 * Math.exp(-Math.max(d, 0) / 90) * reef;
    const cg0 = G * U.u_T / (4 * PI);
    const Ks = clamp(Math.sqrt(cg0 / Math.sqrt(G * dep)), 0.7, 2.6);
    const Heff = U.u_H0 * shelterAt(x);
    const Hsh = Heff * Ks, Hlim = GAMMA * dep;
    const growGeo = Math.min(Hsh, Hlim) / Math.max(Heff, 0.05);
    const grow = mix(growSyn, growGeo, U.u_depthMix);
    const inside = smoothstep(-6, 14, z - zb), mask = breakMask(x);
    const excess = Hsh / Math.max(Hlim, 0.05);
    const gate = smoothstep(0.90, 1.25, excess);
    const brkW = mix(reef * mask, Math.max(reef * mask, gate), U.u_depthMix);
    const brk = inside * brkW;
    const decay = 1 - 0.68 * brk;
    const shoreFade = mix(1, smoothstep(0, 1.6, waterDepthM(x, z) + lift), U.u_depthMix);
    let theta = w * tt - rayPhase(x, z);
    // Forward pitch. u_pitchOdd = 1 is the #pitch=0 A/B revert to the ODD map
    // (and its q schedule), which is symmetric by construction — see the GLSL.
    const pOdd = U.u_pitchOdd || 0;
    const skew = mix(0, clamp(excess * mix(0.82, 0.62, pOdd), 0, 0.8), U.u_depthMix);
    const thetaRaw = theta;
    theta -= skew * mix(1 - Math.cos(theta), Math.sin(theta), pOdd);
    // locus phase: crestNear/tSince read the CARRIER, not the shape (see GLSL)
    const thetaL = mix(thetaRaw, theta, pOdd);
    const env = setEnv(rayS(x, z), tt);
    const q = mix(2.2, 1.6, pOdd)
            + mix(1.5, 3.2, pOdd) * Math.exp(-Math.abs(d) / 55) * (0.6 + 0.5 * U.u_xi);
    const amp = 0.5 * Heff * grow * decay * env * shoreFade;
    let h = amp * crestShape(-theta, q) * 2;
    h += lift;
    const boilX = -22.0, boilZ = -coastCurve(boilX) - 8.0;
    const bd = (x - boilX) * (x - boilX) + (z - boilZ) * (z - boilZ);
    const boil = Math.exp(-bd / (2 * 5.5 * 5.5));
    h += 0.10 * U.u_H0 * boil * (0.8 + 0.2 * Math.sin(tt * 0.7));
    const chopG = U.u_chop * (1 - 0.9 * boil);
    h += chopG * 0.22 * (vnoise2(x * 0.11, z + tt * 0.6) - 0.5)
       + chopG * 0.10 * (vnoise2(x * 0.31 - tt * 0.9, z * 1) - 0.5);
    // NOTE: the chop noise arg packing above is the one place a hand port can
    // drift from the GLSL vec2 form; it is tiny and the GPU leg is primary.
    const crestNear = smoothstep(0.55, 0.98, Math.cos(thetaL));
    const pockS = mix(1, clamp(U.u_H0 * shelterAt(x) / 1.5, 0.70, 1.50), U.u_depthMix * U.u_pockSize);
    const pocket = crestNear * mix(Math.exp(-(d * d) / (2 * (22 * pockS) ** 2)),
      Math.exp(-(d * d) / (2 * (7.5 * pockS) ** 2)), clamp(U.u_breakShape, 0, 1)) * env * env * reef;
    return { h: h * VIS, hPhys: h, zb, d, reef, dep, Ks, Hsh, Hlim, excess, gate, brk,
      skew, thetaRaw, theta, q, amp, env, grow, decay, shoreFade, lift, pocket, Heff };
  }

  // the break line per space station (needed for distance-to-break bookkeeping;
  // the JS transcription above is the only place breakLine() exists on the CPU)
  for (const row of space) row.zb = breakLine(row.x);

  // ---- TIME pass on the GPU ----
  const gauges = DVALS.map((d) => ({ d, x: xg, z: breakLine(xg) - d }));
  for (let i = 0; i < 16; i++) {
    const g = gauges[i];
    probeU.u_gauge.value[i].set(g ? g.x : 0, g ? g.z : 0);
  }
  probeU.u_pMode.value = 1;
  probeU.u_pRectB.value.set(tStart, DT, 0, 0);
  const NG = Math.min(gauges.length, 16);
  const ta = renderPass(matA, NT, NG);
  const tb = renderPass(matB, NT, NG);
  const time = gauges.slice(0, NG).map((g, r) => {
    const o = { d: g.d, x: g.x, z: g.z, t: [], Y: [], Zd: [], hRaw: [], brk: [], depth: [] };
    for (let i = 0; i < NT; i++) {
      const k = (r * NT + i) * 4;
      o.t.push(tStart + i * DT);
      o.Y.push(ta[k + 1]); o.Zd.push(ta[k + 2]); o.hRaw.push(ta[k + 3]);
      o.brk.push(tb[k + 2]); o.depth.push(tb[k + 3]);
    }
    return o;
  });

  // ---- leg 2: JS vs GPU agreement at sampled points ----
  const agree = [];
  for (const row of space) {
    for (let i = 40; i < NZ; i += 211) {
      const z = row.z[i];
      const js = oceanJS(row.x, z, t0);
      agree.push({ x: row.x, z, gpu: row.hRaw[i], js: js.h, dz: row.hRaw[i] - js.h });
    }
  }
  for (const g of time) {
    for (let i = 7; i < NT; i += 307) {
      const js = oceanJS(g.x, g.z, g.t[i]);
      agree.push({ x: g.x, z: g.z, t: g.t[i], gpu: g.hRaw[i], js: js.h, dz: g.hRaw[i] - js.h });
    }
  }

  // ---- leg 3: section-view cross-check (bed.js + dispersion.js, as drawn) ----
  let sect = null;
  if (pb.state.geoSpot) {
    const wl = bed.MSL_ABOVE_NAVD88 + (pb.state.tide || 0);
    const cg0 = disp.G * pb.state.T / (4 * Math.PI);
    let prev = null, cross = null;
    for (let i = 0; i <= 440; i++) {
      const z = -260 + (180 - -260) * (i / 440);
      const b = bed.bedElevBlended(pb.state.geoSpot, xg, z, pb.state.bedShape || 0) - wl;
      const depth = Math.max(-b, 0);
      if (depth <= 0.05) continue;
      const Ks = Math.min(Math.max(Math.sqrt(cg0 / Math.sqrt(disp.G * Math.max(depth, 0.35))), 0.7), 2.6);
      const Hsh = pb.state.H0 * Ks, Hlim = disp.GAMMA * Math.max(depth, 0.35);
      if (prev && prev.Hsh <= prev.Hlim && Hsh > Hlim && !cross) cross = { z, depth };
      prev = { Hsh, Hlim };
    }
    // the same crossing found by the probe's own JS path
    let probeCross = null; let pv = null;
    for (let i = 0; i <= 440; i++) {
      const z = -260 + (180 - -260) * (i / 440);
      const o = oceanJS(xg, z, t0);
      if (waterDepthM(xg, z) <= 0.05) continue;
      if (pv && pv <= 1 && o.excess > 1 && !probeCross) probeCross = { z, depth: o.dep };
      pv = o.excess;
    }
    sect = { x: xg, sectionCross: cross, probeCross };
  }

  // sanity terms at the break line for the report
  const zbg = breakLine(xg);
  const terms = {};
  for (const d of [140, 60, 25, 0, -20]) {
    const o = oceanJS(xg, zbg - d, t0);
    terms[`d=${d}`] = {
      depth: +o.dep.toFixed(2), excess: +o.excess.toFixed(3), skew: +o.skew.toFixed(3),
      q: +o.q.toFixed(2), amp: +o.amp.toFixed(3), brk: +o.brk.toFixed(3),
      pocket: +o.pocket.toFixed(4), reef: +o.reef.toFixed(3),
    };
  }
  console.error = origErr;
  renderer.dispose();

  return {
    prov, U, t0, XS, xg, DZ, Z0, NZ, NT, DT, tStart, Tcar,
    phiDeg: swellPhi() * 180 / Math.PI, zbAtXg: zbg,
    plunge: smoothstep(0.45, 1.25, U.u_xi),
    space, time, agree, sect, terms, shaderErr,
    preset: pb.state.preset || null, geoSpot: pb.state.geoSpot || null,
    H0: pb.state.H0, T: pb.state.T, xi: pb.state.xi, alpha: pb.state.alpha,
    tide: pb.state.tide, VIS,
  };
}

// ---------------------------------------------------------------- analysis
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * wr - im[i + k + len / 2] * wi;
        const vi = re[i + k + len / 2] * wi + im[i + k + len / 2] * wr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
      }
    }
  }
}
// Hilbert transform, standard analytic-signal convention:
//   H[x] = Im{ analytic(x) }, analytic built by zeroing negative frequencies
//   and doubling positive ones. Sign calibrated on a known signal below.
function hilbert(x) {
  const n = x.length;
  const re = Float64Array.from(x), im = new Float64Array(n);
  fft(re, im);
  const h = new Float64Array(n);
  h[0] = 1; if (n % 2 === 0) { h[n / 2] = 1; for (let i = 1; i < n / 2; i++) h[i] = 2; }
  else { for (let i = 1; i < (n + 1) / 2; i++) h[i] = 2; }
  for (let i = 0; i < n; i++) { re[i] *= h[i]; im[i] *= h[i]; }
  // inverse FFT via conjugation
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = -im[i] / n;   // Im{analytic}
  return out;
}
function detrend(y) {
  const n = y.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += y[i]; sxx += i * i; sxy += i * y[i]; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  return y.map((v, i) => v - (a + b * i));
}
function moments(y) {
  const n = y.length; let m2 = 0, m3 = 0;
  for (const v of y) { m2 += v * v; m3 += v * v * v; }
  m2 /= n; m3 /= n;
  return { m2, m3, sk: m3 / Math.pow(m2, 1.5) };
}
function shapeStats(series) {
  const y = detrend(series);
  const { m2, sk } = moments(y);
  const hy = hilbert(y);
  let m3h = 0; for (const v of hy) m3h += v * v * v;
  m3h /= hy.length;
  return { Sk: sk, As: m3h / Math.pow(m2, 1.5), rms: Math.sqrt(m2) };
}
// Per-wave statistics. The whole-record form above is contaminated by the SET
// ENVELOPE: at dF = 0.006 Hz the group cycle is 167 s, so a 6-carrier-period
// (84 s) record spans half a set and the amplitude modulation leaks into m2 and
// m3. Sk/As are ratios normalised by each record's own variance, so computing
// them PER CARRIER PERIOD and taking the median removes the envelope exactly
// (it is a slowly-varying scale factor within one wave). The Hilbert transform
// is still taken once on the FULL record, so no window is ever edge-tapered.
function perWaveStats(series, samplesPerPeriod) {
  const y = detrend(series);
  const hy = hilbert(y);
  const P = Math.round(samplesPerPeriod);
  const sks = [], ass = [];
  // skip the first and last period: Hilbert edge effects live there
  for (let s = P; s + 2 * P <= y.length; s += P) {
    const w = y.slice(s, s + P), wh = hy.slice(s, s + P);
    const mu = w.reduce((a, b) => a + b, 0) / P;
    const muh = wh.reduce((a, b) => a + b, 0) / P;
    let m2 = 0, m3 = 0, m3h = 0;
    for (let i = 0; i < P; i++) {
      const v = w[i] - mu, vh = wh[i] - muh;
      m2 += v * v; m3 += v * v * v; m3h += vh * vh * vh;
    }
    m2 /= P; m3 /= P; m3h /= P;
    if (m2 < 1e-10) continue;
    sks.push(m3 / Math.pow(m2, 1.5));
    ass.push(m3h / Math.pow(m2, 1.5));
  }
  const med = (a) => { const s = [...a].sort((x, y2) => x - y2); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
  const spread = (a) => { const s = [...a].sort((x, y2) => x - y2); return s.length ? s[s.length - 1] - s[0] : NaN; };
  return { Sk: med(sks), As: med(ass), n: sks.length, SkRange: spread(sks), AsRange: spread(ass) };
}

// ---------------------------------------------------------------- driver
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

// --- instrument self-calibration: which sign does MY Hilbert give a
// --- pitched-forward (steep front face) wave in a TIME record?
{
  const N = 1024, out = [];
  for (let i = 0; i < N; i++) {
    const ph = 2 * Math.PI * 4 * i / N;      // 4 cycles
    // sawtooth with FAST RISE / slow fall: what a fixed gauge sees when a wave
    // with a steep SHOREWARD (front) face passes it.
    const u = ((ph / (2 * Math.PI)) % 1);
    out.push(u < 0.15 ? (u / 0.15) : (1 - (u - 0.15) / 0.85));
  }
  const s = shapeStats(out);
  console.log(`[calibration] fast-rise/slow-fall sawtooth: Sk=${s.Sk.toFixed(3)} As=${s.As.toFixed(3)}`);
  const peaked = [];
  for (let i = 0; i < N; i++) {
    const ph = 2 * Math.PI * 4 * i / N;
    peaked.push(Math.pow(0.5 + 0.5 * Math.cos(ph), 3));   // peaked crest, flat trough
  }
  const s2 = shapeStats(peaked);
  console.log(`[calibration] peaked-crest/flat-trough cos^3:  Sk=${s2.Sk.toFixed(3)} As=${s2.As.toFixed(3)}`);
  writeFileSync(join(OUT, 'instrument_calibration.json'), JSON.stringify({
    note: 'Sign convention check for the Hilbert-based asymmetry.',
    fastRiseSlowFall: s, peakedCrest: s2,
  }, null, 1));
}

// ---- REPRESENTATION LIMIT: what the height path can express, by construction ----
// h(z) = amp * (crestShape(-theta', q)) * 2  with  theta' = theta - s*sin(theta)
// and theta linear in z (theta = wt - k*rayS, k = 2*PI/LAM). Sweep (s, q) over
// the ranges the code can actually reach and record, in units of amp*k:
//   - the max front-face slope
//   - Sk and As of the resulting profile
// The key structural fact this exposes: theta -> theta - s*sin(theta) is an ODD
// map, and crestShape is EVEN in its argument, so h is an even function of
// theta about the crest for ANY s. The transform cannot produce front/back
// asymmetry; it can only redistribute crest vs trough sharpness.
//
// 2026-08-18: the shipped map is now the EVEN theta -> theta - s*(1 - cos theta)
// (#pitch=0 reverts to the odd one), so this block sweeps BOTH and prints them
// side by side. That is the whole falsification in one table: the odd column's
// front/back is 1.000000 everywhere, the even column's is not.
//
// FACE LABELLING. The index axis here is theta increasing, i.e. a TIME record
// at a fixed gauge. A wave travelling shoreward presents its FRONT (shoreward)
// face to the gauge first, so the front face is the RISE and the back face the
// FALL: frontOverBack = max(rise) / max(fall). The pre-2026-08-18 version of
// this block divided the other way; with an odd map the ratio is 1 either way,
// so the mislabelling was invisible until the map became asymmetric.
{
  const LAM = 90.0, k = 2 * Math.PI / LAM;
  const crestShape = (ph, q) => Math.pow(Math.max(0.5 + 0.5 * Math.cos(ph), 0), q) - 0.5 / q;
  const MAPS = {
    even: (th, s) => th - s * (1 - Math.cos(th)),   // shipped
    odd: (th, s) => th - s * Math.sin(th),          // #pitch=0
  };
  const N = 4096;
  const rows = [];
  for (const map of Object.keys(MAPS)) {
    for (const s of [0, 0.2, 0.4, 0.6, 0.8, 1.0]) {
      for (const q of [1.6, 2.5, 3.5, 4.56, 6.0]) {
        const prof = new Float64Array(N);
        for (let i = 0; i < N; i++) {
          const th = 2 * Math.PI * 4 * i / N;               // 4 wavelengths
          prof[i] = crestShape(-MAPS[map](th, s), q) * 2;   // == h/amp
        }
        // slope in units of amp*k: dz between samples is (4*2PI/N)/k
        const dz = (4 * 2 * Math.PI / N) / k;
        let rise = 0, fall = 0;
        for (let i = 1; i < N; i++) {
          const sl = (prof[i] - prof[i - 1]) / dz;
          if (sl > 0 && sl > rise) rise = sl;
          if (sl < 0 && -sl > fall) fall = -sl;
        }
        const st = shapeStats(Array.from(prof));
        rows.push({
          map, s, q,
          slopePerAmpK: +(Math.max(rise, fall) / k).toFixed(4),  // max|dh/dz|/(amp*k)
          frontSlopePerAmpK: +(rise / k).toFixed(4),
          frontOverBack: +(rise / Math.max(fall, 1e-9)).toFixed(4),
          Sk: +st.Sk.toFixed(3), As: +st.As.toFixed(4),
          psiDeg: +(Math.atan2(st.As, st.Sk) * 180 / Math.PI).toFixed(1),
          crestOverTroughAmp: +((Math.max(...prof)) / Math.abs(Math.min(...prof))).toFixed(3),
        });
      }
    }
  }
  writeFileSync(join(OUT, 'representation_limit.json'), JSON.stringify({
    note: 'h/amp = 2*crestShape(-map(theta, s), q); theta linear, k = 2PI/90. '
      + 'Index axis is theta increasing = a TIME record, so front face = rise.',
    maps: { even: 'theta - s*(1 - cos theta)  [shipped 2026-08-18]',
      odd: 'theta - s*sin theta  [#pitch=0; front/back == 1 for every (s,q)]' },
    ranges: 'skew = clamp(excess*0.82, 0, 0.8) [odd: 0.62]; '
      + 'q = 2.2 + 1.5*exp(-|d|/55)*(0.6+0.5*xi) [odd: 1.6 + 3.2*...]',
    rows,
  }, null, 1));
  console.log('\n[representation limit] h/amp profile, LAM = 90 m');
  console.log('   map    s     q   max|dh/dz|/(amp*k)  front/(amp*k)  front/back    Sk       As     psi');
  for (const r of rows) {
    console.log(`  ${r.map.padStart(4)} ${String(r.s).padStart(3)} ${String(r.q).padStart(5)} ` +
      `${String(r.slopePerAmpK).padStart(18)} ${String(r.frontSlopePerAmpK).padStart(14)} ` +
      `${String(r.frontOverBack).padStart(11)} ` +
      `${String(r.Sk).padStart(7)} ${String(r.As).padStart(8)} ${String(r.psiDeg).padStart(7)}`);
  }
}

const summary = [];
for (const preset of PRESETS) {
  for (const sim of SIMS) {
    await page.goto('about:blank');
    // --hash= appends arbitrary extra hash params, so an A/B arm (#pitch=0,
    // #cg=0, ...) can be measured with the same instrument in one build.
    const extra = (flags.look ? `&look=${flags.look}` : '')
      + (flags.hash ? `&${flags.hash.replace(/^[#&]/, '')}` : '');
    await page.goto(`${BASE}#preset=${preset}&cam=drone&controls=0&q=high&speed=0&sim=${sim}${extra}`,
      { waitUntil: 'load' });
    await page.waitForTimeout(2800);
    const res = await page.evaluate(probeInPage, {});
    if (Math.abs(res.t0 - sim) > 1e-6) throw new Error(`clock mismatch ${res.t0} != ${sim}`);
    // An A/B arm that silently fails to arm reads as "the change did nothing".
    if (/(^|&)pitch=0(&|$)/.test(flags.hash || '') && res.U.u_pitchOdd !== 1)
      throw new Error(`--hash asked for pitch=0 but u_pitchOdd = ${res.U.u_pitchOdd}`);
    if (!res.prov.modelInVert || !res.prov.sliceFound || !res.prov.sliceHasChoppyPos)
      throw new Error('GLSL provenance assertion failed: ' + JSON.stringify(res.prov));
    // A silently-failed probe shader reads back as a constant, which would look
    // like a very calm ocean rather than an error (MEASUREMENT_LESSONS 2).
    if (res.shaderErr.length)
      throw new Error('probe shader did not compile:\n' + res.shaderErr.join('\n').slice(0, 1200));

    // ---- agreement between GPU leg and JS leg ----
    const ds = res.agree.map((a) => Math.abs(a.dz)).sort((x, y) => x - y);
    const agree = {
      n: ds.length, median: ds[Math.floor(ds.length / 2)],
      p95: ds[Math.floor(ds.length * 0.95)], max: ds[ds.length - 1],
      rangeGPU: [Math.min(...res.agree.map((a) => a.gpu)), Math.max(...res.agree.map((a) => a.gpu))],
    };

    // ---- TIME-series statistics per gauge ----
    const gaugeStats = res.time.map((g) => {
      const n = 2048;                                  // power of two for the FFT
      const y = g.Y.slice(0, n);
      const per = Math.round(res.Tcar / res.DT);
      const st = perWaveStats(y, per);                 // envelope-immune (see note)
      const stWhole = shapeStats(y);                   // whole-record, for contrast
      let imax = 0; for (let i = 0; i < y.length; i++) if (y[i] > y[imax]) imax = i;
      const lo = Math.max(0, imax - Math.round(per / 2));
      const seg = g.Y.slice(lo, lo + per);
      const crest = Math.max(...seg), trough = Math.min(...seg);
      const mean = seg.reduce((a, b) => a + b, 0) / seg.length;
      const H = crest - trough;
      const depth = g.depth.reduce((a, b) => a + b, 0) / g.depth.length;
      // linear-dispersion wavelength at the local depth for the Ursell number
      const w = 2 * Math.PI / res.Tcar;
      let k = w * w / 9.81;
      for (let i = 0; i < 60; i++) k = w * w / (9.81 * Math.tanh(k * Math.max(depth, 0.05)));
      const L = 2 * Math.PI / k;
      const Hphys = H / res.VIS;
      return {
        d: g.d, z: +g.z.toFixed(1), depth: +depth.toFixed(2),
        Sk: +st.Sk.toFixed(3), As: +st.As.toFixed(3), nWaves: st.n,
        // Ruessink+12 biphase psi = atan2(As, Sk) and total nonlinearity
        // B = hypot(Sk, As). Inner-surf-zone median psi ~ -59 deg.
        psiDeg: +(Math.atan2(st.As, st.Sk) * 180 / Math.PI).toFixed(1),
        B: +Math.hypot(st.Sk, st.As).toFixed(3),
        SkRange: +st.SkRange.toFixed(3), AsRange: +st.AsRange.toFixed(3),
        SkWhole: +stWhole.Sk.toFixed(3), AsWhole: +stWhole.As.toFixed(3),
        Hdisp: +H.toFixed(2), Hphys: +Hphys.toFixed(3),
        crestOverTrough: +((crest - mean) / Math.max(mean - trough, 1e-6)).toFixed(3),
        Lm: +L.toFixed(1),
        UrsellHL: +(Hphys * L * L / Math.pow(Math.max(depth, 0.2), 3)).toFixed(1),
        UrsellKh: +((Hphys / Math.max(depth, 0.2)) / Math.pow(k * Math.max(depth, 0.2), 2)).toFixed(2),
        brk: +(g.brk.reduce((a, b) => a + b, 0) / g.brk.length).toFixed(3),
        HoverH: +(Hphys / Math.max(depth, 0.05)).toFixed(3),
      };
    });

    // ---- SPACE profile geometry, PER CREST ----
    // The whole-transect max-slope is meaningless once the mesh folds: inside a
    // fold dZ -> 0 and the difference quotient blows up to ~88 deg, which
    // measures the fold, not a wave face. So: (a) find crests in the raw
    // single-valued field, (b) for each, measure the front/back faces on the
    // OUTER SILHOUETTE — the displaced curve resampled onto a uniform Z grid
    // taking max Y, i.e. exactly the outline the camera sees — and (c) report
    // the fold/overhang separately as its own quantity.
    const crestStats = [];
    for (const row of res.space) {
      const zb = res.zbAtXg;   // same station only when x == xg; recomputed below
      const NZr = row.z.length;
      // outer silhouette on a uniform Z grid
      const gz0 = row.Z[0], gz1 = row.Z[NZr - 1], gN = 1600;
      const gdz = (gz1 - gz0) / (gN - 1);
      const sil = new Float64Array(gN).fill(-Infinity);
      for (let i = 0; i < NZr; i++) {
        const gi = Math.round((row.Z[i] - gz0) / gdz);
        if (gi >= 0 && gi < gN && row.Y[i] > sil[gi]) sil[gi] = row.Y[i];
      }
      for (let i = 1; i < gN; i++) if (sil[i] === -Infinity) sil[i] = sil[i - 1];
      for (let i = gN - 2; i >= 0; i--) if (sil[i] === -Infinity) sil[i] = sil[i + 1];
      // crests of the raw field, restricted to real water and the reef stage
      for (let i = 3; i < NZr - 3; i++) {
        if (!(row.hRaw[i] > row.hRaw[i - 1] && row.hRaw[i] >= row.hRaw[i + 1])) continue;
        if (row.depth[i] < 0.8) continue;                  // not the swash
        if (row.hRaw[i] < 0.25 * Math.max(...row.hRaw)) continue;
        const zc = row.z[i];
        // faces on the silhouette, within half a display wavelength either side
        const gi = Math.round((row.Z[i] - gz0) / gdz);
        const half = Math.round(38 / gdz);                 // ~LAM/2.4
        let front = 0, back = 0;
        for (let k = gi + 1; k < Math.min(gN, gi + half); k++) {
          const s = -(sil[k] - sil[k - 1]) / gdz; if (s > front) front = s;
        }
        for (let k = Math.max(1, gi - half); k < gi; k++) {
          const s = (sil[k] - sil[k - 1]) / gdz; if (s > back) back = s;
        }
        // raw single-valued field faces over the same span (the model's own
        // height field before any horizontal displacement)
        let rf = 0, rb = 0;
        const hw = Math.round(38 / res.DZ);
        for (let k = i + 1; k < Math.min(NZr, i + hw); k++) {
          const s = -(row.hRaw[k] - row.hRaw[k - 1]) / res.DZ; if (s > rf) rf = s;
        }
        for (let k = Math.max(1, i - hw); k < i; k++) {
          const s = (row.hRaw[k] - row.hRaw[k - 1]) / res.DZ; if (s > rb) rb = s;
        }
        // crest curvature of the raw field, normalised by the local wave height
        const c2 = (row.hRaw[i + 1] - 2 * row.hRaw[i] + row.hRaw[i - 1]) / (res.DZ * res.DZ);
        let tl = row.hRaw[i], tr = row.hRaw[i];
        for (let k = i; k > Math.max(0, i - hw); k--) tl = Math.min(tl, row.hRaw[k]);
        for (let k = i; k < Math.min(NZr, i + hw); k++) tr = Math.min(tr, row.hRaw[k]);
        const Hloc = row.hRaw[i] - 0.5 * (tl + tr);
        // FACE CHORD: the angle a photograph measures. Max difference-quotient
        // slope is dominated by the 1-2 cell step at a fold edge, which is a
        // silhouette discontinuity, not a face. The chord from the crest down
        // to half the wave height (and to the full trough) on the silhouette is
        // what a protractor on a still frame actually reads.
        const chordAt = (frac) => {
          const target = sil[gi] - frac * Hloc;
          for (let k = gi + 1; k < Math.min(gN, gi + half); k++) {
            if (sil[k] <= target) {
              const dzc = (k - gi) * gdz;
              return Math.atan((sil[gi] - sil[k]) / Math.max(dzc, 1e-6)) * 180 / Math.PI;
            }
          }
          return null;
        };
        const chordAtRaw = (frac) => {
          const target = row.hRaw[i] - frac * Hloc;
          for (let k = i + 1; k < Math.min(NZr, i + hw); k++) {
            if (row.hRaw[k] <= target) {
              const dzc = (k - i) * res.DZ;
              return Math.atan((row.hRaw[i] - row.hRaw[k]) / Math.max(dzc, 1e-6)) * 180 / Math.PI;
            }
          }
          return null;
        };
        const chordBackRaw = (frac) => {
          const target = row.hRaw[i] - frac * Hloc;
          for (let k = i - 1; k > Math.max(0, i - hw); k--) {
            if (row.hRaw[k] <= target) {
              const dzc = (i - k) * res.DZ;
              return Math.atan((row.hRaw[i] - row.hRaw[k]) / Math.max(dzc, 1e-6)) * 180 / Math.PI;
            }
          }
          return null;
        };
        // horizontal displacement diagnostics at this crest's face
        let offMax = 0, clampHits = 0, nOff = 0;
        for (let k = Math.max(1, i - hw); k < Math.min(NZr, i + hw); k++) {
          const ox = row.X[k] - row.x, oz = row.Z[k] - row.z[k];
          const L = Math.hypot(ox, oz);
          if (L > offMax) offMax = L;
          if (L > 19.9) clampHits++;
          nOff++;
        }
        // fold / overhang local to this crest, on the displaced curve
        let folded = 0, minJ = Infinity, overhang = 0;
        for (let k = Math.max(1, i - hw); k < Math.min(NZr, i + hw); k++) {
          const j = (row.Z[k] - row.Z[k - 1]) / res.DZ;
          if (j < minJ) minJ = j;
          if (j <= 0) { folded += res.DZ; overhang += -(row.Z[k] - row.Z[k - 1]); }
        }
        // BARREL OPENING. Where the displaced curve is multivalued in Z, the
        // vertical gap between the upper (lip) branch and the lower (face)
        // branch is the height of the hole the lip encloses. Relative to the
        // wave height this is the "is the curl a volume or a shell" number.
        const k0 = Math.max(1, i - hw), k1 = Math.min(NZr, i + hw);
        const zs = [], ys = [];
        for (let k = k0; k < k1; k++) { zs.push(row.Z[k]); ys.push(row.Y[k]); }
        let openMax = 0, openAtZ = null;
        const bz0 = Math.min(...zs), bz1 = Math.max(...zs), bN = 400;
        const bdz = (bz1 - bz0) / (bN - 1);
        for (let b = 0; b < bN; b++) {
          const zq = bz0 + b * bdz;
          let lo = Infinity, hi = -Infinity, hits = 0;
          for (let k = 1; k < zs.length; k++) {
            const a0 = zs[k - 1], a1 = zs[k];
            if ((a0 - zq) * (a1 - zq) > 0) continue;
            const f = Math.abs(a1 - a0) < 1e-9 ? 0 : (zq - a0) / (a1 - a0);
            const yv = ys[k - 1] + f * (ys[k] - ys[k - 1]);
            if (yv < lo) lo = yv; if (yv > hi) hi = yv; hits++;
          }
          if (hits >= 3 && hi - lo > openMax) { openMax = hi - lo; openAtZ = zq; }
        }
        crestStats.push({
          x: row.x, zc: +zc.toFixed(1), d: +(row.zb - zc).toFixed(1),
          depth: +row.depth[i].toFixed(2), Hdisp: +Hloc.toFixed(2),
          Hphys: +(Hloc / res.VIS).toFixed(3),
          frontDeg: +(Math.atan(front) * 180 / Math.PI).toFixed(2),
          backDeg: +(Math.atan(back) * 180 / Math.PI).toFixed(2),
          frontRawDeg: +(Math.atan(rf) * 180 / Math.PI).toFixed(2),
          backRawDeg: +(Math.atan(rb) * 180 / Math.PI).toFixed(2),
          frontPhysDeg: +(Math.atan(front / res.VIS) * 180 / Math.PI).toFixed(2),
          asymRaw: +(rf / Math.max(rb, 1e-6)).toFixed(3),
          faceChord50: chordAt(0.5) === null ? null : +chordAt(0.5).toFixed(2),
          faceChord100: chordAt(1.0) === null ? null : +chordAt(1.0).toFixed(2),
          faceChord50Raw: chordAtRaw(0.5) === null ? null : +chordAtRaw(0.5).toFixed(2),
          backChord50Raw: chordBackRaw(0.5) === null ? null : +chordBackRaw(0.5).toFixed(2),
          faceChord50Phys: chordAt(0.5) === null ? null
            : +(Math.atan(Math.tan(chordAt(0.5) * Math.PI / 180) / res.VIS) * 180 / Math.PI).toFixed(2),
          offMaxM: +offMax.toFixed(2), offClampFrac: +(clampHits / Math.max(nOff, 1)).toFixed(3),
          curv: +c2.toFixed(4),
          curvNorm: +(c2 * 90 * 90 / Math.max(Hloc, 1e-3)).toFixed(2),  // k^-2 scaled
          foldedM: +folded.toFixed(2), minJac: +minJ.toFixed(3),
          overhangM: +overhang.toFixed(2),
          barrelOpenM: +openMax.toFixed(2),
          barrelOpenOverH: +(openMax / Math.max(Hloc, 1e-3)).toFixed(3),
          barrelAtZ: openAtZ === null ? null : +openAtZ.toFixed(1),
          pocket: +row.pocket[i].toFixed(3), brk: +row.brk[i].toFixed(3),
        });
      }
    }
    // ---- spatial Sk/As over windows of the transect ----
    // For a translating wave eta(z,t) = f(z - ct), the spatial record is the
    // time record reversed, so As_space = -As_time. Computing both is the
    // consistency check that neither is a windowing artefact.
    const spatialShape = [];
    for (const row of res.space) {
      for (const [dHi, dLo] of [[260, 160], [160, 80], [80, 20], [20, -40]]) {
        const idx = [];
        for (let i = 0; i < row.z.length; i++) {
          const dd = row.zb - row.z[i];
          if (dd <= dHi && dd > dLo && row.depth[i] > 0.8) idx.push(i);
        }
        if (idx.length < 256) continue;
        const n = 1 << Math.floor(Math.log2(idx.length));
        const seg = idx.slice(0, n).map((i) => row.hRaw[i]);
        const st = shapeStats(seg);
        const segD = idx.slice(0, n).map((i) => row.Y[i]);
        const stD = shapeStats(segD);
        spatialShape.push({
          x: row.x, dBand: `${dLo}..${dHi}`, n,
          SkRaw: +st.Sk.toFixed(3), AsRaw: +st.As.toFixed(3),
          SkDisp: +stD.Sk.toFixed(3), AsDisp: +stD.As.toFixed(3),
        });
      }
    }

    const spaceStats = res.space.map((row) => {
      // displaced profile: (Z, Y). fold where dZ/dz0 <= 0
      let folds = 0, minJac = Infinity;
      for (let i = 1; i < row.Z.length; i++) {
        const j = (row.Z[i] - row.Z[i - 1]) / res.DZ;
        if (j < minJac) minJac = j;
        if (j <= 0) folds++;
      }
      // steepest front (shoreward-facing) slope on the displaced curve, and on
      // the raw single-valued field. Front face = dY/dZ < 0 going shoreward
      // (surface descends from crest toward the shore).
      let maxFront = 0, maxBack = 0, argFront = null;
      for (let i = 1; i < row.Z.length; i++) {
        const dZ = row.Z[i] - row.Z[i - 1];
        if (Math.abs(dZ) < 1e-6) continue;
        const s = (row.Y[i] - row.Y[i - 1]) / dZ;
        if (dZ > 0 && s < 0 && -s > maxFront) { maxFront = -s; argFront = row.z[i]; }
        if (dZ > 0 && s > 0 && s > maxBack) maxBack = s;
      }
      // raw (undisplaced) field slope
      let rawFront = 0, rawBack = 0;
      for (let i = 1; i < row.hRaw.length; i++) {
        const s = (row.hRaw[i] - row.hRaw[i - 1]) / res.DZ;
        if (s < 0 && -s > rawFront) rawFront = -s;
        if (s > 0 && s > rawBack) rawBack = s;
      }
      // crest curvature: pick the largest crest and fit d2Y/dz2
      let ic = 0; for (let i = 0; i < row.hRaw.length; i++) if (row.hRaw[i] > row.hRaw[ic]) ic = i;
      const c2 = (row.hRaw[ic + 1] - 2 * row.hRaw[ic] + row.hRaw[ic - 1]) / (res.DZ * res.DZ);
      return {
        x: row.x, folds, minJacobian: +minJac.toFixed(3),
        frontSlopeDeg: +(Math.atan(maxFront) * 180 / Math.PI).toFixed(2),
        backSlopeDeg: +(Math.atan(maxBack) * 180 / Math.PI).toFixed(2),
        frontSlopeDegRaw: +(Math.atan(rawFront) * 180 / Math.PI).toFixed(2),
        backSlopeDegRaw: +(Math.atan(rawBack) * 180 / Math.PI).toFixed(2),
        frontSlopeDegPhys: +(Math.atan(maxFront / res.VIS) * 180 / Math.PI).toFixed(2),
        frontAtZ: argFront, crestZ: +row.z[ic].toFixed(1),
        crestCurv: +c2.toFixed(4),
        crestRadiusOverH: null,
        maxY: +Math.max(...row.Y).toFixed(2), minY: +Math.min(...row.Y).toFixed(2),
        maxOffZ: +Math.max(...row.Z.map((v, i) => v - row.z[i])).toFixed(2),
        minOffZ: +Math.min(...row.Z.map((v, i) => v - row.z[i])).toFixed(2),
      };
    });

    const rec = {
      preset, sim, geoSpot: res.geoSpot, H0: res.H0, T: res.T, xi: res.xi,
      alpha: res.alpha, tide: res.tide, plunge: +res.plunge.toFixed(4),
      phiDeg: +res.phiDeg.toFixed(2), zbAtXg: +res.zbAtXg.toFixed(1), xg: res.xg,
      depthMix: res.U.u_depthMix, breakShape: res.U.u_breakShape,
      psiMix: res.U.u_psiMix, breakMix: res.U.u_breakMix, fidelityLook: res.U.u_fidelityLook,
      pitchOdd: res.U.u_pitchOdd,
      prov: res.prov, agree, sect: res.sect, terms: res.terms,
      gaugeStats, crestStats, spatialShape, spaceStats, shaderErr: res.shaderErr,
    };
    summary.push(rec);
    writeFileSync(join(OUT, `${preset}_sim${sim}_raw.json`), JSON.stringify({
      meta: { preset, sim, U: res.U, t0: res.t0, XS: res.XS, xg: res.xg, DZ: res.DZ, Z0: res.Z0 },
      space: res.space, time: res.time,
    }));
    writeFileSync(join(OUT, `${preset}_sim${sim}.json`), JSON.stringify(rec, null, 1));

    console.log(`\n=== ${preset} sim=${sim}  xi=${res.xi} plunge=${res.plunge.toFixed(3)} ` +
      `H0=${res.H0} T=${res.T} depthMix=${res.U.u_depthMix} breakShape=${res.U.u_breakShape}`);
    console.log(`  GPU-vs-JS |dh|: median ${agree.median.toExponential(2)} p95 ${agree.p95.toExponential(2)} ` +
      `max ${agree.max.toExponential(2)} m over h in [${agree.rangeGPU[0].toFixed(2)}, ${agree.rangeGPU[1].toFixed(2)}]`);
    if (res.sect) console.log(`  section-view break depth ${JSON.stringify(res.sect.sectionCross)} ` +
      `vs probe ${JSON.stringify(res.sect.probeCross)}`);
    console.log('    d    depth    Sk     As    psi      B   (SkW   AsW)   H/h   Ur(HL2/h3)  Hdisp  c/t   brk');
    for (const g of gaugeStats) {
      console.log(`${String(g.d).padStart(6)} ${String(g.depth).padStart(7)} ` +
        `${String(g.Sk).padStart(6)} ${String(g.As).padStart(6)} ` +
        `${String(g.psiDeg).padStart(6)} ${String(g.B).padStart(6)}  ` +
        `${String(g.SkWhole).padStart(6)} ${String(g.AsWhole).padStart(6)}  ` +
        `${String(g.HoverH).padStart(6)} ${String(g.UrsellHL).padStart(9)} ` +
        `${String(g.Hdisp).padStart(7)} ${String(g.crestOverTrough).padStart(6)} ${String(g.brk).padStart(6)}`);
    }
    console.log('  --- per-crest profile geometry ---');
    console.log('     x     zc      d  depth  Hdisp  chord50 chord100 chordRaw backRaw  rawF  rawB   F/B  fold_m overhang barrel b/H offMax pocket');
    for (const c of crestStats.filter((c2) => c2.d > -60 && c2.d < 260 && c2.Hdisp > 0.8)) {
      console.log(`${String(c.x).padStart(6)} ${String(c.zc).padStart(7)} ${String(c.d).padStart(6)} ` +
        `${String(c.depth).padStart(6)} ${String(c.Hdisp).padStart(6)} ` +
        `${String(c.faceChord50).padStart(7)} ${String(c.faceChord100).padStart(8)} ` +
        `${String(c.faceChord50Raw).padStart(8)} ${String(c.backChord50Raw).padStart(7)} ` +
        `${String(c.frontRawDeg).padStart(5)} ${String(c.backRawDeg).padStart(5)} ` +
        `${String(c.asymRaw).padStart(5)} ${String(c.foldedM).padStart(7)} ` +
        `${String(c.overhangM).padStart(8)} ${String(c.barrelOpenM).padStart(6)} ` +
        `${String(c.barrelOpenOverH).padStart(5)} ${String(c.offMaxM).padStart(6)} ${String(c.pocket).padStart(6)}`);
    }
    console.log('  --- spatial Sk/As (As_space should be -As_time) ---');
    for (const s of spatialShape) {
      console.log(`   x=${String(s.x).padStart(4)} d ${s.dBand.padStart(10)}  raw Sk ${String(s.SkRaw).padStart(6)} As ${String(s.AsRaw).padStart(6)}` +
        `   displaced Sk ${String(s.SkDisp).padStart(6)} As ${String(s.AsDisp).padStart(6)}`);
    }
  }
}
await browser.close();
writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 1));
if (errors.length) console.error('PAGE ERRORS:\n' + errors.slice(0, 20).join('\n'));
console.log(`\nwritten -> ${OUT}`);
