// Track 2 evidence: WHERE does the rider actually sit relative to the DRAWN
// surface? The rider is placed by the model-js twin (surferState/surfaceAt),
// which was deliberately not ported to the depth path (Track 2 ABANDONED),
// while the water is drawn by the GPU model (ocean() + choppyPos). This
// instrument quantifies the gap so the parked item can be re-decided with
// numbers. MEASUREMENT ONLY — nothing here feeds placement or acceptance.
//
// Method (probe_arm_terms.mjs pattern): read the LIVE uniforms and the LIVE
// baked textures out of window.__pointbreak, evaluate a line-by-line JS
// transcription of the GPU height path — ocean() h (model-glsl.js) plus
// choppyPos/surfacePos displacement (shaders.js GRID_VERT) — and compare
// against the rider mesh's actual world position (surferGroup.position,
// ground truth of where the shipped twin put him).
//
// Instrument proofs (MEASUREMENT_LESSONS 2):
//  * twin identity: riderY - (0.35 + 0.9*plunge) must equal rideMetric().faceH
//    (the shipped twin's own height) to float precision — proves we read the
//    real placement, and lets us A/B which set-phase the runtime P carries.
//  * skirt still-water: GPU-twin surface deep in the far skirt must be ~0.
//  * the rider mesh must move between sim clocks.
//
// Usage: node scripts/measure_rider_surface.mjs <outdir>
//        [--base=http://localhost:8208/web-three/] [--sims=36,42,48,54]
//        [--preset=secondpeak] [--cam=follow]
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
const OUT = resolve(args.filter((a) => !a.startsWith('--'))[0] || '/tmp/pointbreak-rider');
const BASE = flags.base || 'http://localhost:8208/web-three/';
const SIMS = (flags.sims || '36,42,48,54').split(',').map(Number);
const PRESET = flags.preset || 'secondpeak';
const CAM = flags.cam || 'follow';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// Runs INSIDE the page. Transcription of the model-glsl.js HEIGHT path and the
// GRID_VERT choppyPos/surfacePos displacement, on live uniforms + textures.
// Also a transcription of the model-js twin's oceanH (the rider's reference)
// so the set-phase the runtime P carries can be identified by matching the
// mesh-derived height.
function probeInPage() {
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
  const st = pb.state;
  const texArr = (u) => (u && u.value && u.value.image ? Array.from(u.value.image.data) : null);
  const breakTex = texArr(pb.uniforms.u_breakTex);
  const refrTex = texArr(pb.uniforms.u_refrTex);
  const bedTex = texArr(pb.uniforms.u_bed);

  // ---- GLSL constants (model-glsl.js / shaders.js) ----
  const PI = 3.14159265, G = 9.81, LAM = 90.0, VIS = 3.2, GAMMA = 0.78;
  const CRASH_PEAK_S = 0.42, CRASH_SIGMA_S = 0.20;
  const BORE_FADE_START_S = 2.60, BORE_END_S = 3.80;
  const SHELTER_X0 = 24.0, SHELTER_L = 1675.0;
  const STAGE_HALF = [300.0, 250.0], STAGE_CENTER = [0.0, 10.0];

  const fract = (x) => x - Math.floor(x);
  const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
  const mix = (a, b, s) => a + (b - a) * s;
  const step_ = (e, x) => (x >= e ? 1 : 0);
  const smoothstep = (a, b, x) => {
    const s = clamp((x - a) / (b - a), 0, 1);
    return s * s * (3 - 2 * s);
  };
  const modG = (a, b) => a - b * Math.floor(a / b);
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
  function rayS(x, z) {
    const phi = swellPhi();
    const xx = mix(x, Math.abs(x), aframe);
    return xx * Math.sin(phi) + contourZ(x, z) * Math.cos(phi);
  }
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
  function psiLookup(zc) {
    const f = clamp((zc - U.u_refrZ[0]) / Math.max(U.u_refrZ[1] - U.u_refrZ[0], 1e-3), 0, 1) * 255;
    const i = Math.floor(f), tf = f - i;
    const dec = (j) => {
      const o = Math.min(j, 255) * 4;
      return mix(U.u_refrPsi[0], U.u_refrPsi[1], (refrTex[o] * 256 + refrTex[o + 1]) / 65535);
    };
    return mix(dec(i), dec(i + 1), tf);
  }
  function rayPhase(x, z) {   // GPU form: mix(legacy, baked, psiMix*depthMix)
    const legacy = (2 * PI / LAM) * rayS(x, z);
    if (!refrTex) return legacy;
    const xx = mix(x, Math.abs(x), aframe);
    const baked = U.u_refrKappa * xx + psiLookup(contourZ(x, z));
    return mix(legacy, baked, U.u_psiMix * U.u_depthMix);
  }
  function kLocalAt(x, z) {
    const omega = 2 * PI / U.u_T;
    const h = modelDepthM(x, z);
    const y = omega * omega * h / G;
    const den = Math.max(Math.pow(1 - Math.exp(-Math.pow(y, 1.25)), 0.4), 1e-4);
    const k = (y / den) / h;
    return mix(2 * PI / LAM, k, U.u_psiMix * U.u_depthMix);
  }
  const groupSpeedM = () => mix(G * U.u_T / (4 * PI), 0.5 * LAM / U.u_T, U.u_cgLegacy);
  function setPhase(s, tt, anchor) {   // anchor param lets us A/B the #arm re-anchor
    const cg = groupSpeedM();
    const tRef = (45.0 - (U.u_setRef ?? 0) / cg) * anchor;
    return 2 * PI * U.u_dF * (tt - tRef - s / cg);
  }
  const setEnv = (s, tt, anchor) => 0.5 + 0.5 * Math.cos(setPhase(s, tt, anchor));
  const setupPeakM = () => 0.3 * U.u_H0 * U.u_depthMix;
  function setupLiftM(x, z, tt) {
    const ph = setPhase(rayS(x, z), tt, U.u_setAnchor);
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
    const env = setEnv(rayS(x, zb), tt, U.u_setAnchor);
    const activity = env * env * reefWindow(x) * breakMask(x);
    const impactAge = Math.exp(-0.5 * Math.pow((age - CRASH_PEAK_S) / CRASH_SIGMA_S, 2));
    const boreWindow = smoothstep(0.18, 0.55, age)
      * (1 - smoothstep(BORE_FADE_START_S, BORE_END_S, age));
    const boreAge = boreWindow * Math.exp(-age / 3.20);
    const sizeAmp = mix(1, clamp(U.u_H0 * shelterAt(x) / 1.5, 0.55, 1.6), U.u_depthMix);
    const impact = activity * impactAge * (0.18 + 0.82 * plunge) * sizeAmp;
    const bore = activity * boreAge * (0.72 + 0.28 * (1 - plunge)) * sizeAmp;
    return { age, frontZ, impact, bore };
  }
  const crestShape = (phase, q) => {
    const c01 = Math.max(0.5 + 0.5 * Math.cos(phase), 0);
    return Math.pow(c01, q) - 0.5 / q;
  };

  // ---- ocean() HEIGHT path, transcribed (model-glsl.js ~747-911, 1102) ----
  // Returns { h, pocket } — pocket is needed by choppyPos.
  function oceanGPU(x, z, tt) {
    const w = 2 * PI / U.u_T;
    const zb = breakLine(x);
    const d = zb - z;
    const reef = reefWindow(x);
    const lift = setupLiftM(x, z, tt);
    const dep = modelDepthM(x, z) + lift;
    const growSyn = 1 + 0.85 * Math.exp(-Math.max(d, 0) / 90) * reef;
    const cg0 = G * U.u_T / (4 * PI);
    const Ks = clamp(Math.sqrt(cg0 / Math.sqrt(G * dep)), 0.7, 2.6);
    const Heff = U.u_H0 * shelterAt(x);
    const Hsh = Heff * Ks;
    const Hlim = GAMMA * dep;
    const growGeo = Math.min(Hsh, Hlim) / Math.max(Heff, 0.05);
    const grow = mix(growSyn, growGeo, U.u_depthMix);
    const inside = smoothstep(-6, 14, z - zb);
    const mask = breakMask(x);
    const excess = Hsh / Math.max(Hlim, 0.05);
    const gate = smoothstep(0.90, 1.25, excess);
    const brkW = mix(reef * mask, Math.max(reef * mask, gate), U.u_depthMix);
    const brk = inside * brkW;
    const decay = 1 - 0.68 * brk;
    const shoreFade = mix(1, smoothstep(0, 1.6, waterDepthM(x, z) + lift), U.u_depthMix);
    let theta = w * tt - rayPhase(x, z);
    const skew = mix(0, clamp(excess * 0.62, 0, 0.8), U.u_depthMix);
    theta -= skew * Math.sin(theta);
    const env = setEnv(rayS(x, z), tt, U.u_setAnchor);
    const env2 = env * env;
    const q = 1.6 + 3.2 * Math.exp(-Math.abs(d) / 55) * (0.6 + 0.5 * U.u_xi);
    const amp = 0.5 * Heff * grow * decay * env * shoreFade;
    let h = amp * crestShape(-theta, q) * 2;
    h += lift;
    const boilX = -22.0;
    const boilZ = -coastCurve(boilX) - 8.0;
    const boil = Math.exp(-((x - boilX) ** 2 + (z - boilZ) ** 2) / (2 * 5.5 * 5.5));
    h += 0.10 * U.u_H0 * boil * (0.8 + 0.2 * Math.sin(tt * 0.7));
    const chopG = U.u_chop * (1 - 0.9 * boil);
    h += chopG * 0.22 * (vnoise2(x * 0.11, z * 0.11 + tt * 0.6) - 0.5)
       + chopG * 0.10 * (vnoise2(x * 0.31 - tt * 0.9, z * 0.31) - 0.5);
    const crestNear = smoothstep(0.55, 0.98, Math.cos(theta));
    const shape = clamp(U.u_breakShape, 0, 1);
    const pockS = mix(1, clamp(U.u_H0 * shelterAt(x) / 1.5, 0.70, 1.50),
      U.u_depthMix * U.u_pockSize);
    const pocketLegacy = Math.exp(-(d * d) / (2 * (22 * pockS) * (22 * pockS)));
    const pocketCompact = Math.exp(-(d * d) / (2 * (7.5 * pockS) * (7.5 * pockS)));
    const pocket = crestNear * mix(pocketLegacy, pocketCompact, shape) * env2 * reef;
    const boreBandLegacy = brk * env2 * Math.exp(-Math.abs(z - zb) / 9);
    const life = breakerLifecycleAtX(x, tt);
    const frontWidth = 2.8 + 0.90 * life.age;
    const frontBand = Math.exp(-0.5 * Math.pow((z - life.frontZ) / frontWidth, 2));
    const impactBand = frontBand * life.impact;
    const boreBand = frontBand * life.bore;
    const moundNoise = 0.75 + 0.25 * vnoise2(x * 0.2, tt * 0.8);
    const legacyMound = 0.30 * U.u_H0 * boreBandLegacy * moundNoise;
    const structuralMound = U.u_H0 * (0.62 * impactBand + 0.27 * boreBand) * moundNoise;
    h += mix(legacyMound, structuralMound, shape);
    h *= VIS;
    if (!Number.isFinite(h)) h = 0;
    return { h, pocket, env, env2, lift, frontZ: life.frontZ, zb, excess };
  }
  const oceanHGPU = (x, z, tt) => oceanGPU(x, z, tt).h;

  // ---- choppyPos + surfacePos, transcribed (shaders.js GRID_VERT) ----
  function farFadeAt(x, z) {
    const dx = Math.max(Math.abs(x - STAGE_CENTER[0]) - STAGE_HALF[0], 0);
    const dz = Math.max(Math.abs(z - STAGE_CENTER[1]) - STAGE_HALF[1], 0);
    return 1 - smoothstep(100, 800, Math.hypot(dx, dz));
  }
  function choppyPos(x0, z0, tt) {
    const fade = farFadeAt(x0, z0);
    if (fade <= 0.001) return { x: x0, y: 0, z: z0, fade };
    const o = oceanGPU(x0, z0, tt);
    let h = o.h;
    const e = 2.0;
    const gx = (oceanHGPU(x0 + e, z0, tt) - oceanHGPU(x0 - e, z0, tt)) / (2 * e);
    const gz = (oceanHGPU(x0, z0 + e, tt) - oceanHGPU(x0, z0 - e, tt)) / (2 * e);
    const d = breakLine(x0) - z0;
    const steep = Math.exp(-Math.max(d, 0) / 70) * reefWindow(x0);
    const plunge = smoothstep(0.45, 1.25, U.u_xi);
    const kk = kLocalAt(x0, z0);
    const aEst = clamp(Math.abs(h), Math.max(0.6, 0.30 * U.u_H0 * VIS), 12.0);
    const depQ = modelDepthM(x0, z0);
    const KsQ = clamp(Math.sqrt((G * U.u_T / (4 * PI)) / Math.sqrt(G * depQ)), 0.7, 2.6);
    const excessQ = (U.u_H0 * KsQ) / Math.max(GAMMA * depQ, 0.05);
    const sizeGate = mix(1, clamp(excessQ, 0, 1.5), U.u_depthMix);
    const cl = step_(1.5, U.u_fidelityLook || 0);
    const Sapp = mix(0.42, 0.22, cl) * steep;
    const Sover = (0.15 + 1.30 * plunge) * o.pocket * sizeGate;
    let S = clamp(Sapp + Sover, 0, 1.8);
    if (cl > 0.5) S = Math.min(S, 0.98);
    const lam = S / (aEst * kk * kk);
    let offX = lam * gx, offY = lam * gz;   // GLSL off.xy over (x, z)
    const w = 2 * PI / U.u_T;
    const thetaRaw = w * tt - rayPhase(x0, z0);
    const frontPhase = smoothstep(0.02, 0.78, -Math.sin(thetaRaw))
      * smoothstep(-0.35, 0.82, Math.cos(thetaRaw));
    const hingeSigma = mix(9, 16, cl);
    const hingeBand = Math.exp(-(d * d) / (2 * hingeSigma * hingeSigma)) * reefWindow(x0);
    const anatomy = clamp(U.u_breakShape, 0, 1) * plunge;
    h -= mix(0.34, 0.20, cl) * U.u_H0 * VIS * frontPhase * hingeBand * anatomy;
    const hM = clamp(h / VIS, 0, 3.5);
    const lipJit = 0.65 + 0.7 * vnoise2(x0 * 0.11, tt * 0.45);
    let lipTip = mix(1, 1 + 0.65 * frontPhase, anatomy);
    lipTip = mix(lipTip, 1 + 0.18 * frontPhase * anatomy, cl);
    const throwMag = mix(5.0, 0.72, cl) * o.pocket * plunge * hM * lipJit * lipTip;
    offY += throwMag;
    const dropMag = mix(3.0, 0.28, cl) * o.pocket * plunge * hM * lipJit
      * mix(1, 0.72 + 0.82 * frontPhase, anatomy);
    h -= dropMag;
    const offLen = Math.hypot(offX, offY);
    const sc = Math.min(offLen, 20) / Math.max(offLen, 1e-6);
    offX *= sc; offY *= sc;
    if (!Number.isFinite(offX) || !Number.isFinite(offY)) { offX = 0; offY = 0; }
    return { x: x0 + offX * fade, y: h * fade, z: z0 + offY * fade, fade,
             hPre: o.h, drop: dropMag, anatomyCut: mix(0.34, 0.20, cl) * U.u_H0 * VIS * frontPhase * hingeBand * anatomy,
             offX: offX * fade, offZ: offY * fade, pocket: o.pocket };
  }
  function surfacePos(x0, z0, tt) {
    const bedY = mix(-999, bedElevM(x0, z0) - U.u_waterLevel, U.u_depthMix);
    const P = choppyPos(x0, z0, tt);
    if (bedY > P.y) return { x: x0, y: bedY, z: z0, land: 1, fade: P.fade };
    return { ...P, land: 0 };
  }

  // ---- model-js twin oceanH transcription (the rider's own reference) ----
  // breakLine here is the AUTHORED line (model-js has no breakMix); phase is
  // the injected phaseFn (pure baked kappa*x + Psi when refraction is live).
  function twinBreakLine(x) {
    const xx = mix(x, Math.abs(x), aframe);
    const sec = U.u_sections * 55 * (vnoise1(xx * 0.02 + 7.3) - 0.5) * 2;
    return -coastCurve(x) + Math.min(sec, 0) * (U.u_sections >= 0.05 ? 1 : 0);
  }
  function twinRayPhase(x, z) {
    if (refrTex && U.u_psiMix > 0.5) {
      const xx = mix(x, Math.abs(x), aframe);
      return U.u_refrKappa * xx + psiLookup(contourZ(x, z));
    }
    return (2 * PI / LAM) * rayS(x, z);
  }
  function twinOceanH(x, z, tt, anchor) {   // anchor: 1 = P carries setRef/setAnchor
    const w = 2 * PI / U.u_T;
    const zb = twinBreakLine(x);
    const d = zb - z;
    const reef = reefWindow(x);
    const grow = 1 + 0.85 * Math.exp(-Math.max(d, 0) / 90) * reef;
    const brk = smoothstep(-6, 14, z - zb) * reef;
    const decay = 1 - 0.68 * brk;
    const s = rayS(x, z);
    const theta = w * tt - twinRayPhase(x, z);
    const env = setEnv(s, tt, anchor);
    const env2 = env * env;
    const q = 1.6 + 3.2 * Math.exp(-Math.abs(d) / 55) * (0.6 + 0.5 * U.u_xi);
    const amp = 0.5 * U.u_H0 * grow * decay * env;
    let h = amp * crestShape(-theta, q) * 2;
    const bx = -22;
    const bz = -coastCurve(bx) - 8;
    const boil = Math.exp(-((x - bx) ** 2 + (z - bz) ** 2) / (2 * 5.5 * 5.5));
    h += 0.10 * U.u_H0 * boil * (0.8 + 0.2 * Math.sin(tt * 0.7));
    const chopG = U.u_chop * (1 - 0.9 * boil);
    h += chopG * 0.22 * (vnoise2(x * 0.11, z * 0.11 + tt * 0.6) - 0.5)
       + chopG * 0.10 * (vnoise2(x * 0.31 - tt * 0.9, z * 0.31) - 0.5);
    const boreBand = brk * env2 * Math.exp(-Math.abs(z - zb) / 9);
    h += 0.30 * U.u_H0 * boreBand * (0.75 + 0.25 * vnoise2(x * 0.2, tt * 0.8));
    h *= VIS;
    return Number.isFinite(h) ? h : 0;
  }

  // ---- the rider, ground truth ----
  const r = pb.m4Ride();
  const g = pb.surferGroup.position;
  const rm = pb.rideMetric();
  const plunge = smoothstep(0.45, 1.25, st.xi);
  const boardFloat = 0.35 + 0.9 * plunge;   // surfer.js wy = h + 0.35 + 0.9*plunge... times plunge from surfaceAt
  const out = {
    t, preset: st.preset, xi: st.xi, H0: st.H0, T: st.T,
    uniformsKey: {
      depthMix: U.u_depthMix, psiMix: U.u_psiMix, breakMix: U.u_breakMix,
      setRef: U.u_setRef, setAnchor: U.u_setAnchor, cgLegacy: U.u_cgLegacy,
      breakShape: U.u_breakShape, fidelityLook: U.u_fidelityLook || 0,
      surferUniform: U.u_surfer,
    },
    rider: r ? { ...r } : null,
    riderWorld: { x: g.x, y: g.y, z: g.z },
    rideMetric: rm,
    visible: pb.surferGroup.visible,
  };
  if (!r) return { ...out, error: 'no m4Ride (bake off?)' };

  // instrument proof 1: which set-phase does the runtime P carry?
  // The mesh y is twin_h + 0.35 + 0.9*plunge_twin. Recover twin_h from the mesh
  // and match against our twin transcription under both anchor hypotheses.
  // NOTE surfaceAt returns plunge = smoothstep(0.45,1.25,xi) exactly.
  const twinHFromMesh = g.y - boardFloat;
  const twinHAnchor = twinOceanH(r.x, r.z, t, U.u_setAnchor);
  const twinHLegacy = twinOceanH(r.x, r.z, t, 0);
  out.proofTwin = {
    twinHFromMesh, twinHAnchor, twinHLegacy,
    faceHRideMetric: rm ? rm.faceH : null,
    errAnchor: Math.abs(twinHFromMesh - twinHAnchor),
    errLegacy: Math.abs(twinHFromMesh - twinHLegacy),
  };

  // instrument proof 2: still water deep in the skirt
  out.proofSkirt = { y: surfacePos(-2000, -2000, t).y };

  // ---- 1. vertical offset vs the DRAWN surface at the rider's world (x,z) ----
  // The drawn surface at world (wx, wz) is the displaced image of some source
  // point. Scan a source neighbourhood, keep displaced samples that land within
  // rTol of (wx, wz) horizontally, take the max y (the visible top sheet).
  function drawnSurfaceAt(wx, wz) {
    let best = null, n = 0;
    for (let dx = -30; dx <= 30; dx += 1) {
      for (let dz = -40; dz <= 40; dz += 1) {
        const p = surfacePos(wx + dx, wz + dz, t);
        const hd = Math.hypot(p.x - wx, p.z - wz);
        if (hd <= 1.2) {
          n++;
          if (!best || p.y > best.y) best = { ...p, srcX: wx + dx, srcZ: wz + dz, hd };
        }
      }
    }
    return best ? { ...best, samples: n } : null;
  }
  const drawn = drawnSurfaceAt(g.x, g.z);
  out.drawnAtRider = drawn;
  if (drawn) {
    out.verticalOffset = {
      riderY: g.y,
      drawnY: drawn.y,
      boardMinusSurface: g.y - drawn.y,          // total gap mesh origin -> drawn water
      intendedFloat: boardFloat,                  // what surfer.js meant the gap to be
      excess: g.y - drawn.y - 0.35,               // float beyond the authored 0.35 m
    };
  }

  // ---- 2. decomposition at the rider's SOURCE point ----
  const src = choppyPos(r.x, r.z, t);
  const gpuAtSrc = oceanGPU(r.x, r.z, t);
  out.decomp = {
    twinH: twinHFromMesh,
    gpuHPre: gpuAtSrc.h,                 // GPU ocean() height at the same (x,z)
    modelErr: gpuAtSrc.h - twinHFromMesh, // twin-height error (depth path the twin lacks)
    gpuYDisplaced: src.y,                // after anatomy cut + lip drop
    foldErr: src.y - gpuAtSrc.h,         // vertical displacement the twin ignores
    anatomyCut: src.anatomyCut, drop: src.drop, pocketGPU: src.pocket,
    // horizontal: where the GPU maps the same source point vs where the twin put the mesh
    gpuOff: { x: src.offX, z: src.offZ },
    twinOff: { x: g.x - r.x, z: g.z - r.z },
    horizErr: Math.hypot((r.x + src.offX) - g.x, (r.z + src.offZ) - g.z),
    envGPU: gpuAtSrc.env, env2GPU: gpuAtSrc.env2,
    envLegacyPhase: setEnv(rayS(r.x, r.z), t, 0),
    setPhaseShiftS: (() => {   // how far the #arm anchor moved the set clock
      const cg = groupSpeedM();
      const tRef = (45.0 - (U.u_setRef ?? 0) / cg) * 1;
      return tRef;   // seconds the anchored envelope is shifted vs legacy
    })(),
    liftGPU: gpuAtSrc.lift,
  };

  // ---- 3. where is the rider relative to line and drawn crest? ----
  const zbBaked = U.u_breakMix > 0.5 ? breakTexZ(r.x) : null;
  const zbAuthored = -coastCurve(r.x);
  // drawn crest: scan source z at the rider's source x, displaced, max y
  let peak = null;
  const prof = [];
  for (let dz = -60; dz <= 60; dz += 0.5) {
    const p = surfacePos(r.x, r.z + dz, t);
    prof.push({ srcZ: r.z + dz, wx: p.x, wy: p.y, wz: p.z, land: p.land });
    if (!p.land && (!peak || p.y > peak.wy)) peak = { srcZ: r.z + dz, wx: p.x, wy: p.y, wz: p.z };
  }
  out.crest = {
    zbBaked, zbAuthored,
    faceOff: 11 + 5 * r.pump,
    riderZMinusBaked: r.z - (zbBaked ?? NaN),
    riderZMinusAuthored: r.z - zbAuthored,
    drawnPeak: peak,
    riderWzMinusPeakWz: peak ? g.z - peak.wz : null,   // + = shoreward (behind) the drawn crest
    riderYMinusPeakY: peak ? g.y - peak.wy : null,
    frontZ: gpuAtSrc.frontZ,
  };
  out.profile = prof.filter((_, i) => i % 4 === 0);   // 2 m resolution for the JSON
  return out;
}

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const results = [];
let prevRider = null;
for (const sim of SIMS) {
  await page.goto('about:blank');
  await page.goto(`${BASE}#preset=${PRESET}&cam=${CAM}&surfer=1&sim=${sim}&speed=0&controls=0&q=high`,
    { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  const res = await page.evaluate(probeInPage);
  if (Math.abs(res.t - sim) > 1e-6) throw new Error(`clock mismatch ${res.t} != ${sim}`);
  // instrument proof 3: the rider mesh moves between clocks
  if (prevRider && res.riderWorld) {
    res.proofMoves = Math.hypot(res.riderWorld.x - prevRider.x, res.riderWorld.z - prevRider.z);
  }
  prevRider = res.riderWorld;
  results.push(res);
  await page.screenshot({ path: join(OUT, `${PRESET}_${CAM}_sim${sim}.png`) });

  const v = res.verticalOffset, dcp = res.decomp, c = res.crest;
  console.log(`\n=== ${PRESET} sim=${sim} cam=${CAM} rider=(${res.rider?.x.toFixed(1)}, ${res.rider?.z.toFixed(1)}) waiting=${res.rider?.waiting}`);
  console.log(`  proofTwin errAnchor=${res.proofTwin.errAnchor.toExponential(2)} errLegacy=${res.proofTwin.errLegacy.toExponential(2)} (mesh-derived twin h vs transcription)`);
  if (v) console.log(`  VERTICAL riderY=${v.riderY.toFixed(2)} drawnY=${v.drawnY.toFixed(2)} gap=${v.boardMinusSurface.toFixed(2)} m (intended ${v.intendedFloat.toFixed(2)}) excess=${v.excess.toFixed(2)} m`);
  console.log(`  DECOMP twinH=${dcp.twinH.toFixed(2)} gpuHPre=${dcp.gpuHPre.toFixed(2)} modelErr=${dcp.modelErr.toFixed(2)} foldErr=${dcp.foldErr.toFixed(2)} horizErr=${dcp.horizErr.toFixed(2)} env2=${dcp.env2GPU.toFixed(3)}`);
  console.log(`  CREST zBaked=${c.zbBaked?.toFixed(1)} riderZ-baked=${c.riderZMinusBaked?.toFixed(1)} (faceOff=${c.faceOff.toFixed(1)}) riderWz-peakWz=${c.riderWzMinusPeakWz?.toFixed(1)} m riderY-peakY=${c.riderYMinusPeakY?.toFixed(2)} m`);
}

// wide establishing capture at sim 42 for context
await page.goto('about:blank');
await page.goto(`${BASE}#preset=${PRESET}&cam=drone&surfer=1&sim=42&speed=0&controls=0&q=high`,
  { waitUntil: 'load' });
await page.waitForTimeout(2600);
await page.screenshot({ path: join(OUT, `${PRESET}_drone_sim42.png`) });

writeFileSync(join(OUT, `${PRESET}_rider_offsets.json`), JSON.stringify(results, null, 1));
await browser.close();
if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`\nwritten -> ${OUT}`);
