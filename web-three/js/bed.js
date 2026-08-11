// Seabed patch -> GPU texture.
//
// data/model/pp_depth_patches.js ships each mapped spot's NCEI elevation grid
// as base64 uint16 (little-endian). The shader decodes 16 bits from R,G of an
// RGBA8 texture and does its own bilinear (model-glsl.js bedElevM) — RGBA8 +
// NEAREST is the one sampler configuration that needs no float-texture or
// linear-filter extension, so this works on every WebGL2 device.

import * as THREE from 'three';
import { PP_DEPTH_DATA } from '../../data/model/pp_depth_patches.js';

const cache = new Map();

// 1x1 stand-in so the sampler is always bound. Presets with no bathymetry run
// with u_depthMix = 0, and an unbound sampler is undefined behaviour.
function makeEmpty() {
  const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  tex.needsUpdate = true;
  return tex;
}

function decode(name) {
  if (cache.has(name)) return cache.get(name);
  const patch = PP_DEPTH_DATA.patches[name];
  if (!patch) return null;

  const { nx, nz } = PP_DEPTH_DATA.grid;
  const bin = atob(patch.u16);
  if (bin.length !== nx * nz * 2) {
    console.warn(`bed patch ${name}: expected ${nx * nz * 2} bytes, got ${bin.length}`);
    return null;
  }
  const rgba = new Uint8Array(nx * nz * 4);
  for (let i = 0; i < nx * nz; i++) {
    const lo = bin.charCodeAt(i * 2), hi = bin.charCodeAt(i * 2 + 1);
    rgba[i * 4] = hi;         // R: high byte
    rgba[i * 4 + 1] = lo;     // G: low byte
    rgba[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(rgba, nx, nz, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;   // bilinear happens in the shader
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  cache.set(name, tex);
  return tex;
}

// ---- CPU twin of model-glsl.js bedElevM ----
// Cameras and the rider need the seabed on the JS side too. Same bilinear, same
// grid, so a shot framed here lands where the GPU actually draws the shore.
const cpuCache = new Map();

function elevGrid(name) {
  if (cpuCache.has(name)) return cpuCache.get(name);
  const patch = PP_DEPTH_DATA.patches[name];
  if (!patch) return null;
  const { nx, nz, elevMinM, elevMaxM } = PP_DEPTH_DATA.grid;
  const bin = atob(patch.u16);
  const g = new Float32Array(nx * nz);
  for (let i = 0; i < nx * nz; i++) {
    const u = (bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8)) / 65535;
    g[i] = elevMinM + u * (elevMaxM - elevMinM);
  }
  cpuCache.set(name, g);
  return g;
}

export function bedElevAt(spotName, x, z) {
  const g = spotName && elevGrid(spotName);
  if (!g) return -999;
  const { x0, z0, x1, z1, nx, nz } = PP_DEPTH_DATA.grid;
  const fx = Math.min(Math.max((x - x0) / (x1 - x0), 0), 1) * (nx - 1);
  const fz = Math.min(Math.max((z - z0) / (z1 - z0), 0), 1) * (nz - 1);
  const i = Math.min(Math.floor(fx), nx - 2), j = Math.min(Math.floor(fz), nz - 2);
  const tx = fx - i, tz = fz - j;
  const a = g[j * nx + i], b = g[j * nx + i + 1];
  const c = g[(j + 1) * nx + i], d = g[(j + 1) * nx + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

// Shoreward-most z at this x where the bed is still under water, i.e. the
// waterline. Marches seaward from the inland edge so a lagoon or a low spot
// behind the beach cannot be mistaken for the shore.
export function shorelineZ(spotName, x, waterLevel = MSL_ABOVE_NAVD88) {
  const { z0, z1 } = PP_DEPTH_DATA.grid;
  const steps = 120;
  for (let s = 0; s <= steps; s++) {
    const z = z1 + (z0 - z1) * (s / steps);       // inland -> seaward
    if (bedElevAt(spotName, x, z) < waterLevel) return z;
  }
  return z0;
}

// The cliff top: march inland from the waterline until the ground stops
// climbing (gain < 0.5 m per 10 m inland). At Pleasure Point that plateau is
// the East Cliff Drive bluff, ~11 m above the water and ~50 m inland — a
// camera parked a fixed short distance inland lands on the beach berm instead,
// with the lineup hidden behind it.
export function cliffTop(spotName, x, waterLevel = MSL_ABOVE_NAVD88) {
  const { z1 } = PP_DEPTH_DATA.grid;
  const z0 = shorelineZ(spotName, x, waterLevel);
  let zBest = z0 + 12, eBest = -999;
  for (let z = z0 + 6; z <= Math.min(z1, z0 + 160); z += 10) {
    const e = bedElevAt(spotName, x, z) - waterLevel;
    if (e > eBest + 0.5) { eBest = e; zBest = z; } else break;
  }
  return { z: zBest, elev: Math.max(eBest, 0) };
}

export const EMPTY_BED = makeEmpty();
export const MSL_ABOVE_NAVD88 = PP_DEPTH_DATA.mslAboveNavd88M;
export const BED_GRID = PP_DEPTH_DATA.grid;
// The tide is not a free slider. Published excursion around MSL at the station
// the datum came from: MLLW -0.862 m, MHHW +0.764 m relative to MSL.
export const TIDE_RANGE = PP_DEPTH_DATA.tideRangeM || [-0.862, 0.764];
export function tideLabel(t) {
  if (t <= TIDE_RANGE[0] + 0.05) return 'MLLW';
  if (t >= TIDE_RANGE[1] - 0.05) return 'MHHW';
  return Math.abs(t) < 0.05 ? 'MSL' : (t > 0 ? 'above MSL' : 'below MSL');
}

// Bind the patch for `spotName` (an OSM canon name) into the uniform block.
// Returns true when real bathymetry is driving the model.
export function applyBed(uniforms, spotName, tideM = 0, bedShape = 0) {
  const tex = spotName ? decode(spotName) : null;
  const g = BED_GRID;
  const patch = spotName ? PP_DEPTH_DATA.patches[spotName] : null;
  uniforms.u_bed.value = tex || EMPTY_BED;
  uniforms.u_depthMix.value = tex ? 1 : 0;
  uniforms.u_bedRect.value.set(g.x0, g.z0, g.x1, g.z1);
  uniforms.u_bedSize.value.set(g.nx, g.nz);
  uniforms.u_bedElev.value.set(g.elevMinM, g.elevMaxM);
  uniforms.u_waterLevel.value = MSL_ABOVE_NAVD88 + tideM;
  uniforms.u_bedShape.value = tex ? bedShape : 0;
  const pf = patch?.planeFit || [0, 0, 0];
  uniforms.u_bedPlane.value.set(pf[0], pf[1], pf[2]);
  return Boolean(tex);
}

// CPU twin of the same blend, for the cross-section and cameras.
export function bedElevBlended(spotName, x, z, bedShape = 0) {
  const measured = bedElevAt(spotName, x, z);
  if (!bedShape) return measured;
  const pf = PP_DEPTH_DATA.patches[spotName]?.planeFit;
  if (!pf) return measured;
  // MODEL-TWIN of model-glsl.js bedElevM: submerged-fit plane, substituted
  // only where there is water, smoothstepped across the waterline.
  const plane = pf[0] + pf[1] * x + pf[2] * z;
  const t = Math.min(Math.max((measured - (MSL_ABOVE_NAVD88 + 0.15)) / -0.3, 0), 1);
  const wet = t * t * (3 - 2 * t);
  return measured + (plane - measured) * bedShape * wet;
}

export function planeResidualRms(spotName) {
  return PP_DEPTH_DATA.patches[spotName]?.planeResidualRmsM ?? 0;
}

// Seaward distance from the AUTHORED break line to the DEPTH-derived one.
//
// Depth-limited breaking happens where the shoaled height first exceeds what
// the water can carry: H0*Ks >= gamma*h. Before the seabed was real, the
// authored break line was that place by construction. It no longer is — at
// Sewers the two sit ~75 m apart — so the rider needs shifting onto the locus
// the wave actually breaks on, or he surfs flat water behind the whitewater.
//
// Marched CPU-side once per frame: the crossing has no closed form, and doing
// this per fragment would cost ~100 texture fetches.
const GAMMA = 0.78, G = 9.81;
export function depthBreakOffset(spotName, x, breakLineZ, { H0, T, tide = 0, bedShape = 0 } = {}) {
  if (!spotName) return 0;
  const cg0 = G * T / (4 * Math.PI);
  const wl = MSL_ABOVE_NAVD88 + tide;
  const { z0, z1 } = PP_DEPTH_DATA.grid;
  for (let z = Math.max(z0, -260); z <= Math.min(z1, 200); z += 3) {
    const depth = Math.max(wl - bedElevBlended(spotName, x, z, bedShape), 0.35);
    const Ks = Math.min(Math.max(Math.sqrt(cg0 / Math.sqrt(G * depth)), 0.7), 2.6);
    if (H0 * Ks >= GAMMA * depth) {
      // seaward is -z, so a break further out is a POSITIVE offset to subtract
      return Math.min(Math.max(breakLineZ - z, -60), 160);
    }
  }
  return 0;   // never satisfies the criterion here: leave the rider alone
}

// ---- M4: the emergent break line ----
// zBreak(x) = the seaward-most z where the shoaled height first exceeds what
// the depth can carry. Baked to a 128x1 texture because the crossing has no
// closed form: solving it per fragment costs ~140 texture fetches, while the
// answer is one-dimensional and only changes when the site, swell or tide does.
const BREAK_N = 128;
export const BREAK_Z_MIN = -400, BREAK_Z_MAX = 400;
let breakTex = null, breakKey = '', breakArr = new Float32Array(BREAK_N);

function markBreak(spotName, x, opts) {
  const { H0, T, tide, bedShape } = opts;
  const cg0 = G * T / (4 * Math.PI);
  const wl = MSL_ABOVE_NAVD88 + tide;
  const { z0, z1 } = PP_DEPTH_DATA.grid;
  let last = null;
  for (let z = z0; z <= z1; z += 2) {
    const depth = wl - bedElevBlended(spotName, x, z, bedShape);
    if (depth <= 0.35) break;                       // hit the beach; stop
    const Ks = Math.min(Math.max(Math.sqrt(cg0 / Math.sqrt(G * depth)), 0.7), 2.6);
    if (H0 * Ks >= GAMMA * depth) return z;         // seaward-most crossing
    last = z;
  }
  return last === null ? z0 : last;
}

// Returns { texture, x0, x1 } or null when the site has no bathymetry.
export function bakeBreakLine(spotName, xRange, opts) {
  if (!spotName) return null;
  const [x0, x1] = xRange;
  const key = [spotName, x0, x1, opts.H0, opts.T, opts.tide, opts.bedShape].join('|');
  if (breakTex && key === breakKey) return { texture: breakTex, x0, x1 };

  const rgba = new Uint8Array(BREAK_N * 4);
  for (let i = 0; i < BREAK_N; i++) {
    const x = x0 + (x1 - x0) * (i / (BREAK_N - 1));
    const z = markBreak(spotName, x, opts);
    breakArr[i] = z;
    const u = Math.min(Math.max((z - BREAK_Z_MIN) / (BREAK_Z_MAX - BREAK_Z_MIN), 0), 1);
    const q = Math.round(u * 65535);
    rgba[i * 4] = (q >> 8) & 255; rgba[i * 4 + 1] = q & 255; rgba[i * 4 + 3] = 255;
  }
  if (breakTex) breakTex.dispose();
  breakTex = new THREE.DataTexture(rgba, BREAK_N, 1, THREE.RGBAFormat);
  breakTex.magFilter = THREE.NearestFilter;   // lerp happens in the shader
  breakTex.minFilter = THREE.NearestFilter;
  breakTex.generateMipmaps = false;
  breakTex.needsUpdate = true;
  breakKey = key;
  return { texture: breakTex, x0, x1 };
}

// CPU twin of the shader's lookup, for the rider and the HUD.
export function breakZAt(x, x0, x1) {
  const f = Math.min(Math.max((x - x0) / (x1 - x0), 0), 1) * (BREAK_N - 1);
  const i = Math.min(Math.floor(f), BREAK_N - 2);
  return breakArr[i] + (breakArr[i + 1] - breakArr[i]) * (f - i);
}

// Peel angle as a READOUT: the slope of the emergent line, atan(dz/dx). This is
// what M4 buys — alpha stops being typed and starts being measured.
export function derivedAlphaDeg(x, x0, x1) {
  const e = (x1 - x0) / BREAK_N;
  const dz = breakZAt(x + e, x0, x1) - breakZAt(x - e, x0, x1);
  return Math.abs(Math.atan2(dz, 2 * e) * 180 / Math.PI);
}

// ---------- refraction: Snell over the measured depth profile ----------
// MODEL.md 2.4. Crests were rotated by a CONSTANT incidence, so they stayed
// oblique right into the shallows and read as "sideways". Real crests turn to
// follow the contours as they shoal (Cutler & Sethi 1995 do this by growing k
// as depth falls). With contours shore-parallel — which is what the contour
// frame asserts — the alongshore wavenumber is conserved exactly:
//
//   kappa = k0*sin(phi0) = const           (Snell)
//   kz(z) = sqrt(k(z)^2 - kappa^2)
//   S(x,z) = kappa*x + Psi(z),  Psi(z) = integral of kz
//   theta  = omega*t - S
//
// Psi is one-dimensional and only changes with spot/T/tide/swell direction, so
// it bakes to a 256-sample table exactly like the break line above.
const REFR_N = 256;
export const REFR_ZC_MIN = -260, REFR_ZC_MAX = 170;
let refrTex = null, refrKey = '';
const refrPsi = new Float32Array(REFR_N);
let refrKappa = 0, refrPsiMin = 0, refrPsiMax = 1;

// Guo (2002) explicit dispersion: with y = omega^2*h/g, k*h = y/sqrt(tanh(y)).
// Within ~1% of the exact root of omega^2 = g*k*tanh(k*h) and needs no
// iteration, which matters because this is evaluated per sample per rebake.
function wavenumberAt(omega, h) {
  const y = omega * omega * Math.max(h, 0.05) / G;
  return (y / Math.sqrt(Math.tanh(y))) / Math.max(h, 0.05);
}

// Returns { texture, kappa, psiMin, psiMax } or null with no bathymetry.
export function bakeRefraction(spotName, { T, tide = 0, bedShape = 0, swellDeg = 50, xRef = 0 } = {}) {
  if (!spotName) return null;
  const key = [spotName, T, tide, bedShape, swellDeg, xRef].join('|');
  if (refrTex && key === refrKey) {
    return { texture: refrTex, kappa: refrKappa, psiMin: refrPsiMin, psiMax: refrPsiMax };
  }
  const omega = 2 * Math.PI / T;
  const k0 = omega * omega / G;                    // deep-water wavenumber
  const kappa = k0 * Math.sin(swellDeg * Math.PI / 180);
  const wl = MSL_ABOVE_NAVD88 + tide;
  const dz = (REFR_ZC_MAX - REFR_ZC_MIN) / (REFR_N - 1);

  // Trapezoid the shore-normal wavenumber shoreward from the seaward edge.
  // Integration STOPS at the waterline. Past it there is no propagating wave,
  // and the depth floor would otherwise make k explode: at 0.05 m, k is
  // ~0.64 rad/m, so the beach alone contributed ~64 rad of pure fiction and
  // the phase field came out as noise (the mesh detonated when this was first
  // switched on). Freeze Psi instead — the shore fade has killed the wave
  // there anyway.
  const MIN_PROPAGATING_DEPTH = 0.5;
  let psi = 0, prevKz = null, frozen = false;
  for (let i = 0; i < REFR_N; i++) {
    const zc = REFR_ZC_MIN + dz * i;
    const depth = wl - bedElevBlended(spotName, xRef, zc, bedShape);
    if (depth <= MIN_PROPAGATING_DEPTH) frozen = true;
    if (frozen) { refrPsi[i] = psi; continue; }
    const k = wavenumberAt(omega, depth);
    // k < kappa means the ray has turned parallel to the contour and cannot
    // travel further shoreward (caustic). Floor it rather than take sqrt of a
    // negative: the phase then advances alongshore only, which is the correct
    // degenerate behaviour and keeps Psi monotonic for the rider's inversion.
    const kz = Math.sqrt(Math.max(k * k - kappa * kappa, 1e-6));
    if (prevKz !== null) psi += 0.5 * (kz + prevKz) * dz;
    prevKz = kz;
    refrPsi[i] = psi;
  }
  refrPsiMin = refrPsi[0];
  refrPsiMax = refrPsi[REFR_N - 1];
  const span = Math.max(refrPsiMax - refrPsiMin, 1e-6);

  const rgba = new Uint8Array(REFR_N * 4);
  for (let i = 0; i < REFR_N; i++) {
    const q = Math.round(Math.min(Math.max((refrPsi[i] - refrPsiMin) / span, 0), 1) * 65535);
    rgba[i * 4] = (q >> 8) & 255; rgba[i * 4 + 1] = q & 255; rgba[i * 4 + 3] = 255;
  }
  if (refrTex) refrTex.dispose();
  refrTex = new THREE.DataTexture(rgba, REFR_N, 1, THREE.RGBAFormat);
  refrTex.magFilter = THREE.NearestFilter;
  refrTex.minFilter = THREE.NearestFilter;
  refrTex.generateMipmaps = false;
  refrTex.needsUpdate = true;
  refrKey = key;
  refrKappa = kappa;
  return { texture: refrTex, kappa, psiMin: refrPsiMin, psiMax: refrPsiMax };
}

// CPU twin of the shader lookup (rider, audio, HUD).
export function psiAt(zc) {
  const f = Math.min(Math.max((zc - REFR_ZC_MIN) / (REFR_ZC_MAX - REFR_ZC_MIN), 0), 1) * (REFR_N - 1);
  const i = Math.min(Math.floor(f), REFR_N - 2);
  return refrPsi[i] + (refrPsi[i + 1] - refrPsi[i]) * (f - i);
}

// Invert Psi (monotonic non-decreasing) — the rider needs the contour position
// of a given crest phase. Bisection on the table, 24 steps over ~430 m is
// sub-millimetre and this runs once per frame, not per fragment.
export function zcAtPsi(target) {
  let lo = REFR_ZC_MIN, hi = REFR_ZC_MAX;
  for (let i = 0; i < 24; i++) {
    const mid = 0.5 * (lo + hi);
    if (psiAt(mid) < target) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// Local incidence from shore-normal, radians — the readout that says whether
// the swell has actually straightened out by the time it breaks.
export function incidenceAt(spotName, zc, { T, tide = 0, bedShape = 0, swellDeg = 50, xRef = 0 } = {}) {
  const omega = 2 * Math.PI / T;
  const kappa = (omega * omega / G) * Math.sin(swellDeg * Math.PI / 180);
  const depth = Math.max(MSL_ABOVE_NAVD88 + tide - bedElevBlended(spotName, xRef, zc, bedShape), 0.05);
  const k = wavenumberAt(omega, depth);
  return Math.asin(Math.min(kappa / Math.max(k, 1e-6), 1));
}

// ---------- Iribarren readout (M6 part 2) ----------
// Mean bottom slope of the SUBMERGED-fit plane, degrees. The A/B plane and
// this share one fit, so the number the HUD reports is the number the
// counterfactual swaps in.
export function planeSlopeDeg(spotName) {
  const pf = PP_DEPTH_DATA.patches[spotName]?.planeFit;
  if (!pf) return null;
  return Math.atan(Math.hypot(pf[1], pf[2])) * 180 / Math.PI;
}

// xi = tan(beta) / sqrt(H0/L0), deep-water form (Battjes 1974): spilling
// below 0.5, plunging 0.5-3.3. Returns null for the unmapped site, which has
// no measured slope to compute one from.
//
// This is a READOUT, not a driver. Every preset is authored more plunging than
// its bathymetry supports (0.19-0.33 measured against 0.35-1.15 authored), so
// feeding it into `plunge` today would zero the lip on all seven. It becomes
// the driver when M5's reef raises the local slope enough for it to mean
// something. See WEB_THREE_SPEC.md M6 part 2.
export function iribarrenMeasured(spotName, { H0, T }) {
  const beta = planeSlopeDeg(spotName);
  if (beta === null || !(H0 > 0) || !(T > 0)) return null;
  const L0 = G * T * T / (2 * Math.PI);
  return Math.tan(beta * Math.PI / 180) / Math.sqrt(H0 / L0);
}
