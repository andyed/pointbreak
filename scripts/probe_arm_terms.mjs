// Track 5 / 6b follow-up: per-station foam-TERM probe along the baked break
// line. The 6b instrument established WHERE the frame is bright (swash bands,
// not the line); this one establishes WHY the line-attached foam terms go dark
// on the peel arm, term by term, with numbers — the diagnose-before-editing
// step MEASUREMENT_LESSONS 8 demands.
//
// Method: read the LIVE uniforms and the LIVE baked textures (u_breakTex,
// u_refrTex, u_bed expose their DataTexture arrays to page JS) out of
// window.__pointbreak, then evaluate a line-by-line JS transcription of the
// model-glsl.js foam path at stations along the line. This is a diagnostic
// twin, not an acceptance instrument (MEASUREMENT_LESSONS 4): any fix is
// verified on real captures by measure_peel_visibility.mjs, never by this.
//
// Usage: node scripts/probe_arm_terms.mjs <outdir> [--base=http://localhost:8206/web-three/]
//        [--sims=36,42,48,54] [--preset=sewers]
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
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--'))
  .map((a) => a.replace(/^--/, '').split('=')));
const OUT = resolve(args.filter((a) => !a.startsWith('--'))[0] || '/tmp/pointbreak-armprobe');
const BASE = flags.base || 'http://localhost:8206/web-three/';
const SIMS = (flags.sims || '36,42,48,54').split(',').map(Number);
const PRESET = flags.preset || 'sewers';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// Runs INSIDE the page. A transcription of the model-glsl.js foam path plus
// the shipped-look fragment foam pipeline (shaders.js lines ~660-770,
// foamLook = fullLook = 0). Everything reads live uniforms; nothing is
// hardcoded from the preset bank.
function probeInPage(step) {
  const pb = window.__pointbreak;
  const U = {};
  for (const [k, u] of Object.entries(pb.uniforms)) {
    const v = u.value;
    if (typeof v === 'number') U[k] = v;
    else if (v && v.isVector2) U[k] = [v.x, v.y];
    else if (v && v.isVector3) U[k] = [v.x, v.y, v.z];
    else if (v && v.isVector4) U[k] = [v.x, v.y, v.z, v.w];
  }
  const t = pb.sim();
  const texArr = (u) => Array.from(u.value.image.data);
  const breakTex = texArr(pb.uniforms.u_breakTex);
  const refrTex = pb.uniforms.u_refrTex && pb.uniforms.u_refrTex.value
    ? texArr(pb.uniforms.u_refrTex) : null;
  const bedTex = texArr(pb.uniforms.u_bed);

  // ---- GLSL constants (model-glsl.js) ----
  const PI = 3.14159265, G = 9.81, LAM = 90.0, GAMMA = 0.78;
  const CRASH_PEAK_S = 0.42, CRASH_SIGMA_S = 0.20;
  const BORE_FADE_START_S = 2.60, BORE_END_S = 3.80;
  const SHELTER_X0 = 24.0, SHELTER_L = 1675.0;

  const fract = (x) => x - Math.floor(x);
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  const mix = (a, b, s) => a + (b - a) * s;
  const step_ = (e, x) => (x >= e ? 1 : 0);
  const smoothstep = (a, b, x) => {
    const s = clamp((x - a) / (b - a), 0, 1);
    return s * s * (3 - 2 * s);
  };
  const modG = (a, b) => a - b * Math.floor(a / b);   // GLSL mod()
  // crestClockS twin (model-glsl.js, 2026-08-18): the foam clocks are ramped
  // across their wrap so nothing keyed to them draws a hard crest-line seam.
  // Keep numerically identical or this probe mirrors a shader that is not
  // running (MEASUREMENT_LESSONS 4).
  const CREST_WRAP_S = 2.4;
  const crestClockS = (ageS) => {
    const Tp = Math.max(U.u_T, 1e-3);
    const wrapW = Math.min(CREST_WRAP_S, 0.25 * Tp);
    return ageS * (1 - smoothstep(Tp - wrapW, Tp, ageS) * (U.u_crestWrap ?? 0));
  };
  function hash11(p) { p = fract(p * 0.1031); p *= p + 33.33; return fract((p + p) * p); }
  function hash21(x, y) {
    let qx = fract(x * 0.1031), qy = fract(y * 0.1031), qz = fract(x * 0.1031);
    const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
    qx += d; qy += d; qz += d;
    return fract((qx + qy) * qz);
  }
  function vnoise1(x) {
    const i = Math.floor(x); let f = x - i; f = f * f * (3 - 2 * f);
    return mix(hash11(i), hash11(i + 1), f);
  }
  function vnoise2(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return mix(
      mix(hash21(ix, iy), hash21(ix + 1, iy), fx),
      mix(hash21(ix, iy + 1), hash21(ix + 1, iy + 1), fx), fy);
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
    const c0 = G * U.u_T / (2 * PI);
    const cb = Math.sqrt(G * hb);
    const s = Math.sin(a) * clamp(cb / Math.max(c0, 0.1), 0, 1);
    return clamp(Math.asin(clamp(s, 0, 1)), 0.04, 1.45);
  }
  const contourZ = (x, z) => z + coastCurve(x);
  const shelterAt = (x) => mix(1, clamp(Math.exp(-(x - SHELTER_X0) / SHELTER_L), 0.6, 1.25),
    U.u_depthMix * U.u_shelterMix);
  function breakTexZ(x) {
    const f = clamp((x - U.u_breakX[0]) / Math.max(U.u_breakX[1] - U.u_breakX[0], 1e-3), 0, 1) * 127;
    const i = Math.floor(f), tf = f - i;
    const dec = (j) => {
      const o = Math.min(j, 127) * 4;
      return mix(U.u_breakZ[0], U.u_breakZ[1], (breakTex[o] * 256 + breakTex[o + 1]) / 65535);
    };
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
    const authored = -coastCurve(x);
    const base = mix(authored, breakTexZ(x), U.u_breakMix);
    return base + Math.min(sec, 0) * step_(0.05, U.u_sections);
  }
  function reefWindow(x) {
    const xx = mix(x, Math.abs(x), aframe);
    return smoothstep(U.u_reefWin[0], U.u_reefWin[1], xx)
      * (1 - smoothstep(U.u_reefWin[2], U.u_reefWin[3], xx));
  }
  function bedTexel(i, j) {
    const nx = U.u_bedSize[0], nz = U.u_bedSize[1];
    const qi = clamp(i, 0, nx - 1), qj = clamp(j, 0, nz - 1);
    const o = (qj * nx + qi) * 4;
    return mix(U.u_bedElev[0], U.u_bedElev[1], (bedTex[o] * 256 + bedTex[o + 1]) / 65535);
  }
  function bedElevM(x, z) {
    const rx0 = U.u_bedRect[0], rz0 = U.u_bedRect[1], rx1 = U.u_bedRect[2], rz1 = U.u_bedRect[3];
    const uvx = (x - rx0) / Math.max(rx1 - rx0, 1e-3);
    const uvy = (z - rz0) / Math.max(rz1 - rz0, 1e-3);
    const tcx = clamp(uvx, 0, 1) * (U.u_bedSize[0] - 1);
    const tcy = clamp(uvy, 0, 1) * (U.u_bedSize[1] - 1);
    const i0 = Math.floor(tcx), j0 = Math.floor(tcy);
    const fx = tcx - i0, fy = tcy - j0;
    const measured = mix(
      mix(bedTexel(i0, j0), bedTexel(i0 + 1, j0), fx),
      mix(bedTexel(i0, j0 + 1), bedTexel(i0 + 1, j0 + 1), fx), fy);
    const plane = U.u_bedPlane[0] + U.u_bedPlane[1] * x + U.u_bedPlane[2] * z;
    const wet = smoothstep(U.u_waterLevel + 0.15, U.u_waterLevel - 0.15, measured);
    const e = mix(measured, plane, (U.u_bedShape || 0) * wet);
    const dox = Math.max(Math.max(rx0 - x, x - rx1), 0);
    const doz = Math.max(Math.max(rz0 - z, z - rz1), 0);
    const dO = Math.hypot(dox, doz);
    const oceanic = 1 - smoothstep(U.u_waterLevel - 0.5, U.u_waterLevel + 1.0, e);
    const landHold = mix(e, Math.min(e, U.u_waterLevel + 2), smoothstep(60, 520, dO));
    return mix(landHold, e - 0.045 * dO, oceanic);
  }
  const waterDepthM = (x, z) => Math.max(U.u_waterLevel - bedElevM(x, z), 0);
  const modelDepthM = (x, z) => Math.max(waterDepthM(x, z), 0.35);
  function rayS(x, z) {
    const phi = swellPhi();
    const xx = mix(x, Math.abs(x), aframe);
    return xx * Math.sin(phi) + contourZ(x, z) * Math.cos(phi);
  }
  function psiLookup(zc) {
    const f = clamp((zc - U.u_refrZ[0]) / Math.max(U.u_refrZ[1] - U.u_refrZ[0], 1e-3), 0, 1) * 255;
    const i = Math.floor(f), tf = f - i;
    const dec = (j) => {
      const o = Math.min(j, 255) * 4;
      return mix(U.u_refrPsi[0], U.u_refrPsi[1], (refrTex[o] * 256 + refrTex[o + 1]) / 65535);
    };
    return mix(dec(i), dec(i + 1), tf);
  }
  function rayPhase(x, z) {
    const legacy = (2 * PI / LAM) * rayS(x, z);
    if (!refrTex) return legacy;
    const xx = mix(x, Math.abs(x), aframe);
    const baked = U.u_refrKappa * xx + psiLookup(contourZ(x, z));
    return mix(legacy, baked, U.u_psiMix * U.u_depthMix);
  }
  function setPhase(s, tt) {   // mirrors GLSL setPhase incl. the 2026-08-18 anchor
    const cg = G * U.u_T / (4 * PI);
    const tRef = (45.0 - (U.u_setRef ?? 0) / cg) * (U.u_setAnchor ?? 0);
    return 2 * PI * U.u_dF * (tt - tRef - s / cg);
  }
  function setEnv(s, tt) {
    return 0.5 + 0.5 * Math.cos(setPhase(s, tt));
  }
  const setupPeakM = () => 0.3 * U.u_H0 * U.u_depthMix;
  function setupLiftM(x, z, tt) {
    const ph = setPhase(rayS(x, z), tt);
    const lagPh = 0.9 + 0.8 * Math.sin(ph);
    const envS = 0.5 + 0.5 * Math.cos(ph - lagPh);
    const nearShore = 1 - smoothstep(1.2, 2.0, waterDepthM(x, z));
    return setupPeakM() * envS * nearShore;
  }
  function breakerLifecycleAtX(x, tt) {
    const w = 2 * PI / U.u_T;
    const zb = breakLine(x);
    const thetaBreak = w * tt - rayPhase(x, zb);
    const age = modG(thetaBreak, 2 * PI) / w;
    const plunge = smoothstep(0.45, 1.25, U.u_xi);
    const frontSpeed = mix(2.4, 4.1, plunge);
    const frontZ = zb + frontSpeed * age;
    const env = setEnv(rayS(x, zb), tt);
    const activity = env * env * reefWindow(x) * breakMask(x);
    const impactAge = Math.exp(-0.5 * Math.pow((age - CRASH_PEAK_S) / CRASH_SIGMA_S, 2));
    const boreWindow = smoothstep(0.18, 0.55, age)
      * (1 - smoothstep(BORE_FADE_START_S, BORE_END_S, age));
    const boreAge = boreWindow * Math.exp(-age / 3.20);
    const sizeAmp = mix(1, clamp(U.u_H0 * shelterAt(x) / 1.5, 0.55, 1.6), U.u_depthMix);
    const impact = activity * impactAge * (0.18 + 0.82 * plunge) * sizeAmp;
    const bore = activity * boreAge * (0.72 + 0.28 * (1 - plunge)) * sizeAmp;
    return { age, frontZ, impact, bore, activity, env, impactAge, boreWindow, sizeAmp, plunge };
  }

  // The foam path of ocean() (model-glsl.js ~653-963), terms kept separate.
  function foamTerms(x, z, tt) {
    const w = 2 * PI / U.u_T;
    const zb = breakLine(x);
    const d = zb - z;
    const reef = reefWindow(x);
    const lift = setupLiftM(x, z, tt);
    const dep = modelDepthM(x, z) + lift;
    const cg0 = G * U.u_T / (4 * PI);
    const Ks = clamp(Math.sqrt(cg0 / Math.sqrt(G * dep)), 0.7, 2.6);
    const Heff = U.u_H0 * shelterAt(x);
    const Hsh = Heff * Ks;
    const Hlim = GAMMA * dep;
    const inside = smoothstep(-6, 14, z - zb);
    const mask = breakMask(x);
    const brkZip = inside * reef * mask;
    const excess = Hsh / Math.max(Hlim, 0.05);
    const gate = smoothstep(0.90, 1.25, excess);
    const brkW = mix(reef * mask, Math.max(reef * mask, gate), U.u_depthMix);
    const brk = inside * brkW;

    let theta = w * tt - rayPhase(x, z);
    // Forward pitch: EVEN map (2026-08-18); u_pitchOdd = 1 is the #pitch=0 revert.
    const pOdd = U.u_pitchOdd || 0;
    const skew = mix(0, clamp(excess * mix(0.82, 0.62, pOdd), 0, 0.8), U.u_depthMix);
    const thetaC = theta;
    theta -= skew * mix(1 - Math.cos(theta), Math.sin(theta), pOdd);
    // The foam terms below want the crest LOCUS, which is the carrier phase;
    // #pitch=0 restores the old conflation with the shape-skewed phase.
    const thetaL = mix(thetaC, theta, pOdd);
    const env = setEnv(rayS(x, z), tt);
    const env2 = env * env;
    const tSince = crestClockS(modG(thetaL, 2 * PI) / w);
    const tau = Math.max(U.u_tau, 0.5);

    const crestNear = smoothstep(0.55, 0.98, Math.cos(thetaL));
    const pockS = mix(1, clamp(U.u_H0 * shelterAt(x) / 1.5, 0.70, 1.50),
      U.u_depthMix * U.u_pockSize);
    const shape = clamp(U.u_breakShape, 0, 1);
    const pocketLegacy = Math.exp(-(d * d) / (2 * (22 * pockS) * (22 * pockS)));
    const pocketCompact = Math.exp(-(d * d) / (2 * (7.5 * pockS) * (7.5 * pockS)));
    const pocket = crestNear * mix(pocketLegacy, pocketCompact, shape) * env2 * reef;

    const boreBandLegacy = brk * env2 * Math.exp(-Math.abs(z - zb) / 9);
    const life = breakerLifecycleAtX(x, tt);
    const frontWidth = 2.8 + 0.90 * life.age;
    const frontBand = Math.exp(-0.5 * Math.pow((z - life.frontZ) / frontWidth, 2));
    const impactBand = frontBand * life.impact;
    const boreBand = frontBand * life.bore;
    const trailStart = smoothstep(zb - 2.0, zb + 1.5, z);
    const trailEnd = 1 - smoothstep(life.frontZ - 1.5, life.frontZ + 2.5, z);
    const trailBand = trailStart * trailEnd * life.bore;

    const sizeFoam = mix(1, clamp(U.u_H0 * shelterAt(x) / 1.5, 0.55, 1.6), U.u_depthMix);
    const streaks = 0.45 + 0.55 * vnoise2(x * 0.10 + 1.7, (z - 3.2 * tt) * 0.10);
    let legacyFoam = brk * env2 * Math.exp(-tSince / tau) * streaks;
    legacyFoam += boreBandLegacy * 0.85 * Math.exp(-tSince / (0.5 * U.u_T));
    const laceN = vnoise2(x * 0.09, (z - 5.0 * tt) * 0.10) * 0.62
      + vnoise2(x * 0.33, (z - 4.0 * tt) * 0.30) * 0.38;
    const lace = brk * env2 * Math.exp(-tSince / (2.4 * tau)) * smoothstep(0.45, 0.72, laceN);
    legacyFoam += lace * 0.4;

    const clumps = vnoise2(x * 0.22, (z - 3.5 * tt) * 0.22) * 0.58
      + vnoise2(x * 0.62, (z - 3.0 * tt) * 0.62) * 0.42;
    const impactFoam = impactBand * smoothstep(0.20, 0.66, clumps + 0.28);
    const boreFoam = boreBand * (0.62 + 0.38 * streaks);
    const trailFoam = trailBand * (0.34 + 0.48 * streaks)
      * Math.exp(-life.age / Math.max(2.4 * U.u_tau, 1));
    const trailLace = trailBand * smoothstep(0.48, 0.73, laceN)
      * Math.exp(-life.age / Math.max(1.8 * U.u_tau, 1));
    const eA = 2.0;
    const dSdxLine = Math.abs(rayPhase(x + eA, breakLine(x + eA))
      - rayPhase(x - eA, breakLine(x - eA))) / (2 * eA);
    const cometClk = crestClockS(life.age);
    const behindM = cometClk * w / Math.max(dSdxLine, 1e-3);
    const cometAge = mix(Math.exp(-cometClk / 2.5), Math.exp(-behindM / 55.0),
      U.u_armRead ?? 0);
    const cometW = mix(brk, smoothstep(-5.0, 1.0, z - zb) * brkW, U.u_armRead ?? 0);
    const cometFoam = U.u_headRead * cometW * env2 * cometAge
      * Math.exp(-Math.max(z - zb, 0) / 22) * mask * sizeFoam;
    const structuralFoam = 1.55 * impactFoam + 0.84 * boreFoam
      + 0.66 * trailFoam + 0.42 * trailLace + 0.90 * cometFoam;
    let residue = lace * 0.40 + 0.30 * brk * env2 * Math.exp(-tSince / (1.6 * tau)) * streaks;
    const boreTex = vnoise2(x * 0.16, (z - 4.5 * tt) * 0.16);
    const reBrk = smoothstep(1.02, 1.35, excess) * brk;
    const swashF = smoothstep(0.85, 0.55, dep);
    const areaBoost = U.u_wwArea * U.u_depthMix * 0.48 * reBrk * env
      * Math.exp(-tSince / (1.8 * tau)) * (0.55 + 0.45 * boreTex) * (1 - swashF);
    residue += areaBoost;
    let foam = mix(legacyFoam * sizeFoam, structuralFoam + residue * sizeFoam, shape);
    const lipFoam = pocket * (0.45 + 0.75 * smoothstep(0.3, 1.4, U.u_xi));
    foam += lipFoam * mix(1, 0.52, shape);
    const crumb = crestNear * (1 - brk) * env2
      * Math.exp(-Math.max(d, 0) / 28) * smoothstep(0.55, 0.2, U.u_xi);
    foam += crumb * 0.6 * (0.6 + 0.4 * vnoise2(x * 0.4 + tt * 0.3, z * 0.4));
    foam = clamp(foam, 0, 1);
    foam *= 0.72 + 0.28 * vnoise1(x * 0.045 + 3.1);

    // ---- fragment stage, shipped look (shaders.js ~660-767) ----
    const tSinceF = crestClockS(modG(w * tt - rayPhase(x, z), 2 * PI) / w);
    const ageK = smoothstep(1.2, 0.62 * U.u_T, tSinceF);
    const ax = x, az = z - 1.1 * Math.min(tSinceF, 7);
    const er = vnoise2(ax * 0.35 + tt * 0.08, az * 0.35 - tt * 0.05) * 0.65
      + vnoise2(ax * 0.90 + tt * 0.10, az * 0.90 - tt * 0.07) * 0.35;
    let foamM = clamp(foam, 0, 1);
    foamM = 1 - Math.exp(-1.55 * foamM);
    const erAmp = mix(0.50, 0.18, ageK);
    const hiEdge = mix(0.75, 1.10, ageK);
    foamM = smoothstep(0.15, hiEdge, foamM + (er - 0.5) * erAmp);
    foamM *= mix(1, mix(0.70, 0.50, U.u_headRead), ageK);
    foamM = Math.max(foamM, U.u_crestRead * 0.72 * clamp(pocket * 1.5, 0, 1));
    const lifeC = life;
    const lifeClk = crestClockS(lifeC.age);
    const foamAge = mix(lifeClk + U.u_T, lifeClk,
      smoothstep(z - 3, z + 3, lifeC.frontZ));
    const onStripe = Math.exp(-Math.pow((z - zb) / 25, 2));
    const eC = 2.0;
    const dSdxC = Math.abs(rayPhase(x + eC, breakLine(x + eC))
      - rayPhase(x - eC, breakLine(x - eC))) / (2 * eC);
    const behindC = foamAge * w / Math.max(dSdxC, 1e-3);
    const carveTail = mix(Math.exp(-foamAge / 9), Math.exp(-behindC / 110.0),
      U.u_armRead ?? 0);
    foamM *= mix(1, 0.45 + 0.55 * carveTail, onStripe * U.u_headRead);

    return {
      zb, d, reef, mask, inside, gate, excess, brk, env, env2,
      age: life.age, frontZ: life.frontZ, frontWidth, impactAge: life.impactAge,
      boreWindow: life.boreWindow, activity: life.activity, sizeAmp: life.sizeAmp,
      impactBand, boreBand, trailBand, cometFoam, structuralFoam,
      legacyFoam, residue, areaBoost, lipFoam, pocket, crumb,
      foam, foamM, tSince, ageK, dep, lift, shelter: shelterAt(x),
    };
  }

  // stations along the baked span; foam evaluated at the GLSL line and at
  // shoreward offsets (the band lives shoreward of the line)
  const x0 = U.u_breakX[0], x1 = U.u_breakX[1];
  const offs = [0, 4, 8, 14, 20];
  const stations = [];
  for (let x = x0; x <= x1; x += step) {
    const zb = breakLine(x);
    const zbBaked = breakTexZ(x);
    let best = null, bestOff = 0;
    const at0 = foamTerms(x, zb, t);
    for (const off of offs) {
      const ft = foamTerms(x, zb + off, t);
      if (!best || ft.foamM > best.foamM) { best = ft; bestOff = off; }
    }
    stations.push({
      x, zbGLSL: +zb.toFixed(1), zbBaked: +zbBaked.toFixed(1),
      secShift: +(zb - mix(-coastCurve(x), zbBaked, U.u_breakMix)).toFixed(1),
      atLine: at0, best, bestOff,
    });
  }
  return { t, U, phiRad: swellPhi(), stations };
}

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

for (const sim of SIMS) {
  await page.goto('about:blank');
  await page.goto(`${BASE}#preset=${PRESET}&cam=drone&controls=0&q=high&speed=0&sim=${sim}`,
    { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  const res = await page.evaluate(probeInPage, 4);
  if (res.t !== sim) throw new Error(`clock mismatch ${res.t} != ${sim}`);
  writeFileSync(join(OUT, `${PRESET}_sim${sim}_terms.json`), JSON.stringify(res, null, 1));
  // compact console table over the rideable stage
  const sb = res.U.u_stageBounds;
  const rows = res.stations.filter((s) => s.x >= sb[0] + 10 && s.x <= sb[1] - 10);
  console.log(`\n=== ${PRESET} sim=${sim}  phi=${(res.phiRad * 180 / Math.PI).toFixed(1)}deg ` +
    `H0=${res.U.u_H0.toFixed(2)} T=${res.U.u_T} dF=${res.U.u_dF} stage=[${sb[0].toFixed(0)},${sb[1].toFixed(0)}]`);
  console.log('   x    zb  reef mask  env2   age  brk  comet struct legacy resid  foam  foamM(best@off)');
  for (let i = 0; i < rows.length; i += 3) {
    const s = rows[i], a = s.atLine, b = s.best;
    console.log(
      `${String(s.x).padStart(5)} ${String(s.zbGLSL).padStart(6)} ` +
      `${a.reef.toFixed(2)} ${a.mask.toFixed(2)} ${a.env2.toFixed(3)} ` +
      `${a.age.toFixed(1).padStart(5)} ${b.brk.toFixed(2)} ` +
      `${b.cometFoam.toFixed(3)} ${b.structuralFoam.toFixed(3)}  ${b.legacyFoam.toFixed(3)} ` +
      `${b.residue.toFixed(3)} ${b.foam.toFixed(3)} ${b.foamM.toFixed(3)}@${s.bestOff}`);
  }
}
await browser.close();
if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`\nwritten -> ${OUT}`);
