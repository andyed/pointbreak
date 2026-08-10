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

// Bind the patch for `spotName` (an OSM canon name) into the uniform block.
// Returns true when real bathymetry is driving the model.
export function applyBed(uniforms, spotName, tideM = 0) {
  const tex = spotName ? decode(spotName) : null;
  const g = BED_GRID;
  uniforms.u_bed.value = tex || EMPTY_BED;
  uniforms.u_depthMix.value = tex ? 1 : 0;
  uniforms.u_bedRect.value.set(g.x0, g.z0, g.x1, g.z1);
  uniforms.u_bedSize.value.set(g.nx, g.nz);
  uniforms.u_bedElev.value.set(g.elevMinM, g.elevMaxM);
  uniforms.u_waterLevel.value = MSL_ABOVE_NAVD88 + tideM;
  return Boolean(tex);
}
