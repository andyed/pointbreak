// Seabed patch -> GPU texture.
//
// data/model/pp_depth_patches.js ships each mapped spot's NCEI elevation grid
// as base64 uint16 (little-endian). The shader decodes 16 bits from R,G of an
// RGBA8 texture and does its own bilinear (model-glsl.js bedElevM) — RGBA8 +
// NEAREST is the one sampler configuration that needs no float-texture or
// linear-filter extension, so this works on every WebGL2 device.
//
// M5 (2026-08-11): the decoded grid is the ONE augmentation surface. The
// synthetic reef (Mead & Black wedge + ridge noise) is added to the decoded
// uint16 values here, once, before anything reads them — the GPU texture, the
// CPU bilinear, the M4 break-line bake, the refraction bake, shoaling, the
// depth gate and the section chart all consume the same augmented grid, so
// there is no CPU/GPU twin to drift and no second locus to re-split.

import * as THREE from 'three';
import { PP_DEPTH_DATA } from '../../data/model/pp_depth_patches.js';
import { PRESETS, reefWindowKnots } from '../../web/js/params.js';
import { PP_GEO_DATA } from '../../data/model/pp_geo_profiles.js';
import {
  alongshoreKappa, integratePsi, psiSample, zcAtPsiIn, wavelengthAt,
  incidenceAt as dispIncidenceAt, GAMMA, G,
} from './dispersion.js';

// 1x1 stand-in so the sampler is always bound. Presets with no bathymetry run
// with u_depthMix = 0, and an unbound sampler is undefined behaviour.
function makeEmpty() {
  const tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
  tex.needsUpdate = true;
  return tex;
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

// GAMMA / G come from dispersion.js (the one JS home for the pure physics
// constants); the GLSL copies in model-glsl.js are the GPU source of truth
// and must stay numerically identical.

function smoothstepJS(a, b, x) {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

// ---------- M5: the synthetic reef ----------
// The measured DEM (~7 m posts) smooths the Purisima mudstone bedding into a
// featureless ramp, so with M4's emergent break line all mapped presets
// converge on the same near-shore-parallel wave (WEB_THREE_SPEC.md M5). The
// reef that differentiates them must be invented: a planar wedge whose strike
// runs at beta off shore-parallel plus 1-D ridge noise along the strike,
// fitted per spot so the DERIVED peel angle hits the preset's alpha target.
// Everything about it is labelled synthetic; the measured DEM stays the floor
// of truth (the reef is additive relief, clamped below -0.5 m NAVD88).
//
// Sign of the strike: the crest line sweeps SHOREWARD as x advances
// (z_crest = zRef + tan(beta)·x). The spec's prose says "seaward", but with a
// seaward-sweeping line dS/dx along the line goes negative and the crossing
// runs -x — a left. Pleasure Point peels +x; a right needs the line rotated
// ABOVE the refracted crest bearing, which is the shoreward sweep. Both signs
// read the same |derived alpha|; only this one keeps the zipper a right.
const PHI_BREAK_DEG = 9;      // refracted crest bearing the seed assumes (MODEL.md 2.4)
const REEF_CEIL_EL = -0.5;    // m NAVD88 hard ceiling: the reef must never move the shoreline
const REEF_AMP_MAX = 3.2;     // m max uplift (Mead & Black wedge amplitude band)
const REEF_FLANK_W = 45;      // m cross-strike feather half-width (smoothstep, C1)
const REEF_RIDGE_WAVELENGTH = 50;  // m along-strike ridge spacing (their "sections")
const REEF_RIDGE_MOD = 0.15;  // fractional amplitude modulation from the ridges
const REEF_ANCHOR_X = 24;     // m: crest line meets the natural crest-depth contour here
// Down-point deepening of the reef — the nose, v2. DIMENSIONLESS: the fraction
// of the LOCAL available relief (crest datum minus natural bed) that the reef
// gives up by the down-point end of the stage. v1 was a gradient in m/m applied
// to the crest ELEVATION; that made the nose's total drop a function of where
// each spot's stage happened to sit in world x (reefWin[0] spans -201 m to
// -57 m), so by the fit window at x=0 it had spent 0.44 m at Second Peak and
// 1.55 m at Sewer Peak. On the four wide stages that drop pushed the crest
// datum BELOW the natural bed inside the fit window, lift went to 0 at every
// fit station, the break line reverted to the raw DEM march and derived alpha
// collapsed to 0.97-2.65 deg. See docs/research/EXTERNAL_VALIDITY_AUDIT.
//
// v2 keeps the crest anchored at targetEl and tapers the AMPLITUDE instead, on
// the stage's own normalized coordinate. The reef therefore always lifts toward
// (1 - FRAC·s) of the way from the local bed up to the crest datum: it deepens
// relative to the NATURAL BED, never toward a fixed datum that the bed can
// out-climb, so the wedge keeps authority over the break line to the end of the
// stage no matter how wide the stage is.
// NOT a bed-relative crest ELEVATION (lift = RHO·h_nat): that preserves the
// natural isobath shape, and the wedge's whole alpha authority comes from
// imposing an ABSOLUTE crest elevation that cuts across the measured contours.
// Measured: beta saturates at the 80 deg clamp and alpha misses by 15-35 deg.
const REEF_NOSE_FRAC_DEFAULT = 0.0;   // OFF by default — #nose=1 turns it on
// 1.0 is the definitional bound (the reef gives up ALL its relief by the stage
// end); raised from 0.30 for the 1c' sweep. 0.30 was the last value where all
// six spots stayed in the +-5 deg band UNSMOOTHED — the sweep's question is
// whether any fraction holds the line under #smooth=1, where the noise-peel is
// gone and only reef authority remains. The tuned default stays 0.25.
const REEF_NOSE_FRAC_MAX = 1.0;
let REEF_NOSE_FRAC = REEF_NOSE_FRAC_DEFAULT;
export const REEF_NOSE_FRAC_TUNED = 0.25;
export function setReefNose(frac) {
  const f = Math.min(Math.max(frac || 0, 0), REEF_NOSE_FRAC_MAX);
  if (f !== REEF_NOSE_FRAC) { REEF_NOSE_FRAC = f; invalidateReef(); }
}
// Every cache downstream of the reef fit, not just the fit itself. The reefed
// composite grid is memoised three more times (u16Cache -> texCache/cpuCache),
// and none of those keys carry the nose setting, so clearing only fitCache
// leaves the GPU texture and the CPU twin built from the PREVIOUS nose. Inert
// today because the hash is parsed once before the first bake, but it is the
// same latent stale-bake class as the bakeBreakLine key, and a probe that
// sweeps the nose in one process hits it immediately.
function invalidateReef() {
  fitCache.clear();
  breakKey = '';
  for (const c of [u16Cache, texCache, cpuCache]) {
    for (const k of [...c.keys()]) if (k.endsWith('|reef')) c.delete(k);
  }
}
const REEF_FIT_TOL_DEG = 1.0;
const REEF_FIT_MAX_ITER = 14; // secant evaluations; load-time only, so cheap

// Deterministic per spot: seed from the OSM canon name, value noise from an
// integer hash. No Math.random anywhere — same name, same grid, every load.
function nameSeed(name) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < name.length; i++) {
    h = (h ^ name.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h | 0;
}
function hash01(i, seed) {
  let x = (i + seed) | 0;
  x = Math.imul(x ^ (x >>> 16), 2246822519);
  x = Math.imul(x ^ (x >>> 13), 3266489917);
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 4294967296;
}
// 1-D value noise, C1, in [0, 1]
function ridgeNoise(s, seed) {
  const i = Math.floor(s), f = s - i, u = f * f * (3 - 2 * f);
  return hash01(i, seed) * (1 - u) + hash01(i + 1, seed) * u;
}

// Depth-limited breaking depth for the canonical model card: deepest h where
// the shoaled height first exceeds what the water can carry (same criterion
// and Ks clamp as the M4 march below).
function breakDepthFor(H0, T) {
  const cg0 = G * T / (4 * Math.PI);
  for (let h = 8; h > 0.4; h -= 0.05) {
    const Ks = Math.min(Math.max(Math.sqrt(cg0 / Math.sqrt(G * h)), 0.7), 2.6);
    if (H0 * Ks >= GAMMA * h) return h;
  }
  return 0.5;
}

// The preset bank is the single source of the alpha targets and the canonical
// ocean the fit runs at (params.js; keyed here by the spot's OSM canon name).
function reefCard(name) {
  for (const key of Object.keys(PRESETS)) {
    const p = PRESETS[key];
    if (p.geoSpot === name) return { alphaDeg: p.alpha, H0: p.H0, T: p.T };
  }
  return null;
}

// reef(x, z, em) -> additive uplift in metres given the measured elevation em.
// Additive only (>= 0), zero wherever em >= -0.5 m NAVD88 (dry land, the
// beach, the cliff — the shoreline and the cliff cameras cannot move), capped
// so the augmented bed never rises above the -0.5 m ceiling, and feathered at
// the reefWindow ends (the smoothstep pair is a MODEL-TWIN of the GLSL
// reefWindow; the A-frame fold never reaches this code — no mapped preset
// ships aframe = 1).
// The finite-reef envelope for a spot, from its own OSM stage bounds. Falls
// back to the synthetic stage — and therefore to the legacy constants exactly —
// for any spot without a usable contour fit.
function reefWinFor(spotName) {
  const pr = PP_GEO_DATA.profiles[spotName];
  return pr?.contourFit?.usable
    ? reefWindowKnots(pr.stageBoundsM[0], pr.stageBoundsM[1])
    : reefWindowKnots(-110, 290);
}

function makeReefFn(betaDeg, targetEl, zRef, seed, reefWin) {
  const bRad = betaDeg * Math.PI / 180;
  const tanB = Math.tan(bRad), cosB = Math.cos(bRad), sinB = Math.sin(bRad);
  // ---------- the nose: a crest that DEEPENS down-point ----------
  // Mead & Black's focus/pinnacle, the component a tilted plane cannot express
  // (SURF_SCIENCE_REFS 2.2). Until now the wedge lifted the bed toward ONE
  // crest elevation along its whole length, so the break criterion was met at
  // the same depth everywhere on it and the seaward-most crossing — which is
  // what markBreak returns — went to whichever natural shallow patch happened
  // to sit furthest out. The reef never owned the line; the DEM noise did, and
  // that is the 22-70 m locus wander behind the A-frame, the alpha collapse
  // under smoothing, and the 43 deg alpha swing for 0.3 m of swell.
  //
  // A real point is shallowest at its apex and falls away down-point. Giving
  // the reef the same profile makes the wave break FIRST at the top of the
  // point and progressively later down it — one takeoff, one direction, and a
  // locus whose position is set by something the reef owns instead of by
  // whichever pebble is shallowest.
  // v2 (see REEF_NOSE_FRAC above): the taper is on the UPLIFT AMPLITUDE and on
  // the stage's own normalized coordinate, so a wide stage gets the same shape
  // as a narrow one and the crest can never dive under the bed. Two earlier
  // formulations are ruled out by measurement: a fixed total drop per stage
  // (three different physical steepnesses, 0.48-1.3 m/100 m over a 113-312 m
  // spread) and a fixed gradient in m/m (v1 — flattened the four wide stages to
  // ~2 deg because its drop is measured in world x, not in stage fraction).
  const noseX0 = reefWin[0], noseSpan = Math.max(reefWin[3] - reefWin[0], 1);
  const noseTaper = (x) =>
    1 - REEF_NOSE_FRAC * Math.min(Math.max((x - noseX0) / noseSpan, 0), 1);
  return (x, z, em) => {
    if (em >= REEF_CEIL_EL) return 0;
    // MODEL-TWIN of the GLSL reefWindow, per spot: the synthetic reef must be
    // feathered by the SAME envelope the water uses, or the seabed carries a
    // shelf edge the wave field does not (which is how one hard-coded ramp put
    // the same corner on all six spots — see params.js reefWindowKnots).
    const w = smoothstepJS(reefWin[0], reefWin[1], x)
            * (1 - smoothstepJS(reefWin[2], reefWin[3], x));
    if (w <= 0) return 0;
    // crest line: through the natural crest-depth contour at REEF_ANCHOR_X,
    // sweeping shoreward down-point at the fitted strike
    const zc = zRef + tanB * (x - REEF_ANCHOR_X);
    const n = (z - zc) * cosB;                 // signed cross-strike distance, m
    const flank = smoothstepJS(-REEF_FLANK_W, -12, n)
                * (1 - smoothstepJS(12, REEF_FLANK_W, n));
    if (flank <= 0) return 0;
    const s = x * cosB + (z - zRef) * sinB;    // along-strike coordinate, m
    const ridge = 1 - REEF_RIDGE_MOD
                + 2 * REEF_RIDGE_MOD * ridgeNoise(s / REEF_RIDGE_WAVELENGTH, seed);
    // CROSS-SHORE BOUND (2026-08-11 — the V fix, part 1). The strike line
    // zc = zRef + tanB*(x - anchor) sweeps SEAWARD for x up-point of the
    // anchor, and nothing used to stop it: 150 m up-point it sat ~200 m
    // offshore in 6-7 m of water, where the capped lift could not reach the
    // crest datum but still built a submerged BAR that trips H0*Ks >= gamma*h
    // far seaward of the point. The bake then teleports 46-180 m between
    // adjacent 4.7 m texels (measured per spot; the raw-DEM bake is smooth to
    // 2.2 m), and that teleport is the A-frame V, the offshore break row, and
    // the "light shaft" (the bar seen through the water). A shore-platform
    // reef does not rise out of deep water: where the natural bed sits too far
    // below the crest datum for the wedge to OWN the crest, the reef ends.
    // Fade band 1.2 m — several times the 0.31-0.93 m DEM residual, per the
    // ramp rule (no boundary on a ramp narrower than the error beneath it).
    const bound = 1 - smoothstepJS(REEF_AMP_MAX, REEF_AMP_MAX + 1.2, targetEl - em);
    if (bound <= 0) return 0;
    // lift toward the crest elevation, never more than the wedge amplitude,
    // tapered down-point by the nose. Every factor is non-negative and
    // noseTaper >= 1 - 0.30 = 0.70, so the nose and the bound can only REDUCE
    // lift: they cannot deepen a post, and cannot push one above a ceiling the
    // unbounded path already respected.
    const lift = Math.min(Math.max(targetEl - em, 0), REEF_AMP_MAX)
               * bound * noseTaper(x) * flank * w * ridge;
    return Math.max(Math.min(em + lift, REEF_CEIL_EL) - em, 0);
  };
}

// Break-criterion march over an arbitrary elevation function (the fit needs
// candidate reefs that do not exist in any grid yet). Same criterion, step and
// clamps as markBreak below.
function marchBreakFn(elevAt, x, H0, T) {
  const cg0 = G * T / (4 * Math.PI);
  const wl = MSL_ABOVE_NAVD88;
  const { z0, z1 } = PP_DEPTH_DATA.grid;
  let last = null, fLast = null;
  for (let z = z0; z <= z1; z += MARCH_DZ) {
    const f = breakExcess(elevAt(x, z), wl, H0, cg0);
    if (f === null) break;
    if (f >= 0) {
      if (last === null || fLast === null) return z;
      return last + (z - last) * (-fLast) / Math.max(f - fLast, 1e-9);
    }
    last = z; fLast = f;
  }
  return last === null ? z0 : last;
}

// The fit loop (load-time, once per spot, cached): seed beta from
// alpha_target - phi_break, march the break line over the candidate reef,
// read the derived slope mid-window, adjust beta by the residual (<= 5
// rounds), record the residual. No silent success: withinTol is carried on
// the result and the HUD says "reef synthetic" either way.
const fitCache = new Map();
export function reefFitFor(name) {
  if (!name) return null;
  if (fitCache.has(name)) return fitCache.get(name);
  const card = reefCard(name);
  const raw = elevGrid(name, false);
  if (!card || !raw) { fitCache.set(name, null); return null; }
  const rawAt = (x, z) => bilinearAt(raw, x, z);

  const hb = breakDepthFor(card.H0, card.T);
  // Wedge crest ~0.75 of the breaking depth below the water: deep enough that
  // waves reach it, shallow enough that the gamma-h crossing happens ON the
  // flank. Small-H0 spots are ceiling-limited (the -0.5 m clamp with margin).
  const crestDepth = Math.min(Math.max(0.75 * hb, 1.2), 3.0);
  const targetEl = Math.min(MSL_ABOVE_NAVD88 - crestDepth, REEF_CEIL_EL - 0.2);
  // Anchor on the measured bed's NATURAL BREAKING contour (depth = h_b), not
  // the crest-depth contour: the march takes the seaward-most crossing, so a
  // wedge anchored shoreward of where the wave already breaks never owns the
  // line (Sewers, H0 2.2: natural h_b 3.9 m sits well seaward of the 2.9 m
  // crest contour, and the first fit pass diverged exactly there).
  const anchorEl = MSL_ABOVE_NAVD88 - hb;
  let zRef = null;
  for (let z = PP_DEPTH_DATA.grid.z0; z <= PP_DEPTH_DATA.grid.z1; z += 2) {
    if (rawAt(REEF_ANCHOR_X, z) >= anchorEl) { zRef = z; break; }
  }
  if (zRef === null) { fitCache.set(name, null); return null; }

  const seed = nameSeed(name);
  const reefWin = reefWinFor(name);
  let beta = Math.min(Math.max(card.alphaDeg - PHI_BREAK_DEG, 3), 80);
  let derived = 0, iterations = 0, reefFn = null, signViolations = 0;
  // Stations spanning the WHOLE stage, not 32 m of it. The old set was
  // [-16, -8, 0, 8, 16] — five points across 32 m of a 113-312 m reef, i.e.
  // 10-28% of it, all clustered mid-window. A fit that narrow can hit its alpha
  // target dead on and still let the break line's bearing cross the crest
  // bearing out on a flank it never sampled, which is a peel that reverses
  // direction: the A-frame measured on 5 of 6 spots (MODEL.md 4.5).
  // Stations. With smoothing off this is the original mid-window set, so the
  // shipped path is unchanged; with it on the fit spans the whole stage,
  // because a 32 m window cannot see a sign reversal out on a flank.
  const xs = [];
  if (locusSmoothM > 0) {
    const a = reefWin[0] + 10, b = reefWin[3] - 10, n = 9;
    for (let i = 0; i < n; i++) xs.push(a + (b - a) * i / (n - 1));
  } else {
    xs.push(-16, -8, 0, 8, 16);
  }
  const xMean = xs.reduce((q, v) => q + v, 0) / xs.length;
  // Root-find beta so the DERIVED peel angle hits the target. The old rule was
  // a fixed-gain step, beta += (target - derived), capped at 5 iterations. That
  // converges only where the local gain d(derived)/d(beta) happens to be near
  // 1; where it is not, the step over- or undershoots and five rounds are not
  // enough. Second Peak stalled at 69 deg against a 58 deg target that way.
  //
  // Secant instead: it MEASURES the local gain from two evaluations rather than
  // assuming it, with a bisection safeguard once the root is bracketed and the
  // best-so-far kept regardless. Load time, once per spot, cached — the extra
  // evaluations are free.
  const evaluate = (b) => {
    const fn = makeReefFn(b, targetEl, zRef, seed, reefWin);
    const elevAt = (x, z) => { const em = rawAt(x, z); return em + fn(x, z, em); };
    // Fit against the SMOOTHED locus, because that is the line the renderer
    // draws (bakeBreakLine smoothM). Fitting the raw march while rendering the
    // smoothed one is the same authority split as everything else today: the
    // reef would be tuned to a wave nobody sees. Measured cost of getting this
    // wrong: with smoothing on and the fit still raw, derived alpha collapsed
    // 57 deg -> 16 deg, because the raw locus's alpha was carried by the very
    // wander the smoothing removes.
    let dense = xs, smZ;
    if (locusSmoothM > 0) {
      dense = [];
      for (let x = xs[0]; x <= xs[xs.length - 1] + 1e-6; x += FIT_DENSE_DX) dense.push(x);
      const rawZ = dense.map((x) => marchBreakFn(elevAt, x, card.H0, card.T));
      const halfF = Math.max(1, Math.round((locusSmoothM / 2) / FIT_DENSE_DX));
      smZ = rawZ.map((_, i) => {
        let acc = 0, n = 0;
        for (let j = i - halfF; j <= i + halfF; j++) {
          acc += rawZ[Math.min(Math.max(j, 0), rawZ.length - 1)]; n++;
        }
        return acc / n;
      });
    } else {
      smZ = dense.map((x) => marchBreakFn(elevAt, x, card.H0, card.T));
    }
    const dMean = dense.reduce((q, v) => q + v, 0) / dense.length;
    let sxz = 0, sxx = 0;
    for (let i = 0; i < dense.length; i++) {
      const dx = dense[i] - dMean;
      sxz += dx * smZ[i]; sxx += dx * dx;
    }
    const zbs = smZ;
    // DIRECTION (MODEL.md 4.5: authorship owns it, the derivation must respect
    // it). The mean slope is taken |absolute| below, which is exactly where the
    // sign — the peel direction — used to be discarded. Keep it, and check that
    // the LOCAL slope holds that same sign at every station: one sign means one
    // crossing means one peel. A sign change is a line whose bearing sweeps
    // through the crest bearing, and that tears the wave into a left and a
    // right at a site that is a right.
    const meanSlope = sxz / sxx;
    const dir = Math.sign(meanSlope) || 1;
    let viol = 0;
    for (let i = 1; i < zbs.length; i++) {
      const local = (zbs[i] - zbs[i - 1]) / (xs[i] - xs[i - 1]);
      if (Math.sign(local) !== dir) viol++;
    }
    const d = Math.atan(Math.abs(meanSlope)) * 180 / Math.PI;
    return { derived: d, reefFn: fn, viol };
  };

  let bestErr = Infinity;
  const record = (b, r) => {
    const e = Math.abs(r.derived - card.alphaDeg);
    if (e < bestErr) {
      bestErr = e; beta = b; derived = r.derived;
      reefFn = r.reefFn; signViolations = r.viol;
    }
  };

  let b0 = beta;
  let r0 = evaluate(b0); iterations = 1; record(b0, r0);
  let f0 = r0.derived - card.alphaDeg;
  // second probe on the side the residual points to, so the pair usually
  // brackets the root immediately
  let b1 = Math.min(Math.max(b0 - Math.sign(f0) * 8, 3), 80);
  let r1 = evaluate(b1); iterations++; record(b1, r1);
  let f1 = r1.derived - card.alphaDeg;

  while (iterations < REEF_FIT_MAX_ITER && bestErr > REEF_FIT_TOL_DEG) {
    let b2;
    if (f0 * f1 < 0) {
      // bracketed: secant, but keep it inside the bracket (false position)
      b2 = b1 - f1 * (b1 - b0) / (f1 - f0);
      const lo = Math.min(b0, b1), hi = Math.max(b0, b1);
      if (!(b2 > lo && b2 < hi) || !Number.isFinite(b2)) b2 = 0.5 * (lo + hi);
    } else {
      const denom = f1 - f0;
      b2 = Math.abs(denom) < 1e-6 ? b1 - Math.sign(f1) * 8
                                  : b1 - f1 * (b1 - b0) / denom;
      if (!Number.isFinite(b2)) b2 = b1 - Math.sign(f1) * 8;
      // never leap more than 20 deg on an unbracketed step
      b2 = b1 + Math.min(Math.max(b2 - b1, -20), 20);
    }
    b2 = Math.min(Math.max(b2, 3), 80);
    if (Math.abs(b2 - b1) < 1e-3) break;            // converged in beta
    const r2 = evaluate(b2); iterations++; record(b2, r2);
    const f2 = r2.derived - card.alphaDeg;
    if (f0 * f1 < 0 && f1 * f2 < 0) { b0 = b1; f0 = f1; }
    else if (f0 * f1 < 0) { /* keep b0 as the opposite bracket */ }
    else { b0 = b1; f0 = f1; }
    b1 = b2; f1 = f2;
  }

  const fit = {
    spot: name, synthetic: true,
    targetDeg: card.alphaDeg,
    betaDeg: beta,
    fitDerivedDeg: derived,
    residualDeg: card.alphaDeg - derived,
    withinTol: Math.abs(card.alphaDeg - derived) <= 5,
    // Carried, not hidden — same contract as withinTol. A fit that hits its
    // alpha target while reversing direction somewhere on the stage has not
    // succeeded, and the HUD must be able to say so.
    signViolations,
    directionOk: signViolations === 0,
    stations: xs.length,
    iterations,
    targetEl, zRef, hbM: hb,
    reefAt: reefFn,
  };
  fitCache.set(name, fit);
  return fit;
}

// ---------- the one augmentation surface ----------
// Decode the shipped base64 uint16 once, apply the reef once, re-quantize
// once. Both the GPU texture and the CPU grid are built from THIS array, so
// they agree to the quantum (~0.9 mm). Quantization uses floor so the -0.5 m
// ceiling survives it (round could lift a post half a step above the clamp),
// and floor(em + add) >= raw for add >= 0, so it can never deepen either.
const u16Cache = new Map();
function compositeU16(name, withReef) {
  const key = `${name}|${withReef ? 'reef' : 'raw'}`;
  if (u16Cache.has(key)) return u16Cache.get(key);
  const patch = PP_DEPTH_DATA.patches[name];
  if (!patch) return null;
  const { nx, nz, x0, z0, x1, z1, elevMinM, elevMaxM } = PP_DEPTH_DATA.grid;
  const bin = atob(patch.u16);
  if (bin.length !== nx * nz * 2) {
    console.warn(`bed patch ${name}: expected ${nx * nz * 2} bytes, got ${bin.length}`);
    return null;
  }
  const u16 = new Uint16Array(nx * nz);
  for (let i = 0; i < nx * nz; i++) {
    u16[i] = bin.charCodeAt(i * 2) | (bin.charCodeAt(i * 2 + 1) << 8);
  }
  if (withReef) {
    const fit = reefFitFor(name);
    if (fit) {
      const span = elevMaxM - elevMinM;
      for (let j = 0; j < nz; j++) {
        const z = z0 + (z1 - z0) * (j / (nz - 1));
        for (let i = 0; i < nx; i++) {
          const idx = j * nx + i;
          const x = x0 + (x1 - x0) * (i / (nx - 1));
          const em = elevMinM + (u16[idx] / 65535) * span;
          const add = fit.reefAt(x, z, em);
          if (add > 0) {
            u16[idx] = Math.min(Math.floor((em + add - elevMinM) / span * 65535), 65535);
          }
        }
      }
    }
  }
  u16Cache.set(key, u16);
  return u16;
}

// Post-hoc audit of the clamp invariant, for verification and tests-by-hand:
// the augmented grid must be identical to the measured grid wherever the
// measured bed is at/above -0.5 m NAVD88 (shoreline, beach, cliff), never
// deepened, and never raised above the ceiling.
export function reefAudit(name) {
  const fit = reefFitFor(name);
  if (!fit) return null;
  const raw = compositeU16(name, false), aug = compositeU16(name, true);
  const { nx, nz, elevMinM, elevMaxM } = PP_DEPTH_DATA.grid;
  const span = elevMaxM - elevMinM, quantum = span / 65535;
  let maxRaise = 0, deepened = 0, aboveCeil = 0, dryTouched = 0, postsTouched = 0;
  for (let i = 0; i < nx * nz; i++) {
    const em = elevMinM + (raw[i] / 65535) * span;
    const ea = elevMinM + (aug[i] / 65535) * span;
    if (aug[i] !== raw[i]) postsTouched++;
    if (ea - em > maxRaise) maxRaise = ea - em;
    if (aug[i] < raw[i]) deepened++;
    if (em >= REEF_CEIL_EL && aug[i] !== raw[i]) dryTouched++;
    // ceiling violations are only meaningful on posts the reef could touch:
    // land is naturally above -0.5 m and must simply be untouched (dryTouched)
    if (em < REEF_CEIL_EL && ea > REEF_CEIL_EL + quantum) aboveCeil++;
  }
  let checksum = 0;
  for (let i = 0; i < aug.length; i++) checksum = (Math.imul(checksum, 31) + aug[i]) >>> 0;
  return {
    spot: name, targetDeg: fit.targetDeg, betaDeg: fit.betaDeg,
    fitDerivedDeg: fit.fitDerivedDeg, residualDeg: fit.residualDeg,
    withinTol: fit.withinTol, iterations: fit.iterations, hbM: fit.hbM,
    maxRaiseM: maxRaise, postsTouched, deepened, aboveCeil, dryTouched, checksum,
  };
}

// ---------- GPU texture / CPU grid, both from the composite ----------
const texCache = new Map();
function decode(name, withReef) {
  const key = `${name}|${withReef ? 'reef' : 'raw'}`;
  if (texCache.has(key)) return texCache.get(key);
  const u16 = compositeU16(name, withReef);
  if (!u16) return null;
  const { nx, nz } = PP_DEPTH_DATA.grid;
  const rgba = new Uint8Array(nx * nz * 4);
  for (let i = 0; i < nx * nz; i++) {
    rgba[i * 4] = (u16[i] >> 8) & 255;   // R: high byte
    rgba[i * 4 + 1] = u16[i] & 255;      // G: low byte
    rgba[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(rgba, nx, nz, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;   // bilinear happens in the shader
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  texCache.set(key, tex);
  return tex;
}

// ---- CPU twin of model-glsl.js bedElevM ----
// Cameras and the rider need the seabed on the JS side too. Same bilinear,
// same composite grid, so a shot framed here lands where the GPU draws.
const cpuCache = new Map();
function elevGrid(name, withReef = false) {
  const key = `${name}|${withReef ? 'reef' : 'raw'}`;
  if (cpuCache.has(key)) return cpuCache.get(key);
  const u16 = compositeU16(name, withReef);
  if (!u16) return null;
  const { nx, nz, elevMinM, elevMaxM } = PP_DEPTH_DATA.grid;
  const g = new Float32Array(nx * nz);
  for (let i = 0; i < nx * nz; i++) g[i] = elevMinM + (u16[i] / 65535) * (elevMaxM - elevMinM);
  cpuCache.set(key, g);
  return g;
}

function bilinearAt(g, x, z) {
  const { x0, z0, x1, z1, nx, nz } = PP_DEPTH_DATA.grid;
  const fx = Math.min(Math.max((x - x0) / (x1 - x0), 0), 1) * (nx - 1);
  const fz = Math.min(Math.max((z - z0) / (z1 - z0), 0), 1) * (nz - 1);
  const i = Math.min(Math.floor(fx), nx - 2), j = Math.min(Math.floor(fz), nz - 2);
  const tx = fx - i, tz = fz - j;
  const a = g[j * nx + i], b = g[j * nx + i + 1];
  const c = g[(j + 1) * nx + i], d = g[(j + 1) * nx + i + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}

// MEASURED bed, no reef: the shoreline/cliff consumers below. The clamp makes
// the two grids identical wherever the measured bed is at/above -0.5 m
// NAVD88, so cameras and the waterline read the same either way — measured is
// used so that stays provable rather than incidental.
export function bedElevAt(spotName, x, z) {
  const g = spotName && elevGrid(spotName, false);
  if (!g) return -999;
  return bilinearAt(g, x, z);
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

// Bind the patch for `spotName` (an OSM canon name) into the uniform block.
// Returns true when real bathymetry is driving the model.
//
// bedShape is a MODE (M5 three-way, B key):
//   0 = measured + synthetic reef (default — the spot's character)
//   1 = submerged-fit plane (structure removed; the GLSL mix still does this)
//   2 = measured only (reef off — the closeout the DEM actually supports)
// The reef lives in the texture, not the shader, so modes 0 and 2 differ only
// in which composite grid is bound; the u_bedShape uniform stays the plane mix.
export function applyBed(uniforms, spotName, tideM = 0, bedShape = 0) {
  const withReef = bedShape === 0;
  const tex = spotName ? decode(spotName, withReef) : null;
  const g = BED_GRID;
  const patch = spotName ? PP_DEPTH_DATA.patches[spotName] : null;
  uniforms.u_bed.value = tex || EMPTY_BED;
  uniforms.u_depthMix.value = tex ? 1 : 0;
  uniforms.u_bedRect.value.set(g.x0, g.z0, g.x1, g.z1);
  uniforms.u_bedSize.value.set(g.nx, g.nz);
  uniforms.u_bedElev.value.set(g.elevMinM, g.elevMaxM);
  uniforms.u_waterLevel.value = MSL_ABOVE_NAVD88 + tideM;
  uniforms.u_bedShape.value = tex && bedShape === 1 ? 1 : 0;
  const pf = patch?.planeFit || [0, 0, 0];
  uniforms.u_bedPlane.value.set(pf[0], pf[1], pf[2]);
  return Boolean(tex);
}

// CPU twin of the same mode selection, for the cross-section, cameras and the
// break-line/refraction bakes. Same bedShape mode contract as applyBed.
export function bedElevBlended(spotName, x, z, bedShape = 0) {
  const g = spotName && elevGrid(spotName, bedShape === 0);
  if (!g) return -999;
  const measured = bilinearAt(g, x, z);
  if (bedShape !== 1) return measured;
  const pf = PP_DEPTH_DATA.patches[spotName]?.planeFit;
  if (!pf) return measured;
  // MODEL-TWIN of model-glsl.js bedElevM: submerged-fit plane, substituted
  // only where there is water, smoothstepped across the waterline. The plane
  // is fitted to the MEASURED bed (mode 1 binds the raw grid), so this
  // counterfactual removes the synthetic reef along with the real structure.
  const plane = pf[0] + pf[1] * x + pf[2] * z;
  const t = Math.min(Math.max((measured - (MSL_ABOVE_NAVD88 + 0.15)) / -0.3, 0), 1);
  const wet = t * t * (3 - 2 * t);
  return measured + (plane - measured) * wet;
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
// Along-shore smoothing length for the break locus, metres — roughly a
// wavelength, the scale below which a crest cannot resolve the seabed.
export const PEEL_SMOOTH_M = 90;
// Active locus smoothing length, metres. ONE setting for both the reef fit and
// the bake: fitting at one smoothing length while rendering at another is the
// authority split this whole file has been chasing all day, and it bit here —
// leaving the fit unconditionally smoothed while the renderer defaulted to raw
// scattered derived alpha to 7-79 deg against 38-66 deg targets. main.js sets
// it from the #smooth flag; 0 is the shipped default and reproduces the
// original narrow fit exactly.
let locusSmoothM = 0;
export function setLocusSmoothing(m) {
  // Same invalidation as the nose: the smoothing length changes the FIT, and
  // the fitted reef is baked into u16Cache/texCache/cpuCache under keys that do
  // not carry it.
  if (m !== locusSmoothM) { locusSmoothM = m; invalidateReef(); }
}
// Shore-normal march step for the break criterion, metres. The crossing is
// interpolated between steps, so this sets cost, not precision.
const MARCH_DZ = 2;
// Along-shore sampling for the reef fit, metres. Dense enough that the 90 m
// smoothing kernel the renderer uses is resolved in the fit too.
const FIT_DENSE_DX = 10;
let breakTex = null, breakKey = '', breakArr = new Float32Array(BREAK_N);

// Excess at a station: H0*Ks - gamma*h. Negative seaward of the break, positive
// inside it; the break line is its zero crossing.
function breakExcess(elev, wl, H0, cg0) {
  const depth = wl - elev;
  if (depth <= 0.35) return null;                   // beach
  const Ks = Math.min(Math.max(Math.sqrt(cg0 / Math.sqrt(G * depth)), 0.7), 2.6);
  return H0 * Ks - GAMMA * depth;
}

function markBreak(spotName, x, opts) {
  const { H0, T, tide, bedShape } = opts;
  const cg0 = G * T / (4 * Math.PI);
  const wl = MSL_ABOVE_NAVD88 + tide;
  const { z0, z1 } = PP_DEPTH_DATA.grid;
  let last = null, fLast = null;
  for (let z = z0; z <= z1; z += MARCH_DZ) {
    const f = breakExcess(bedElevBlended(spotName, x, z, bedShape), wl, H0, cg0);
    if (f === null) break;                          // hit the beach; stop
    if (f >= 0) {
      // INTERPOLATE the crossing. Returning the march step quantized the break
      // line to MARCH_DZ, and on a gently sloping bed the crossing moves tens of
      // metres for a centimetre of elevation, so that quantization was a floor
      // on locus noise before any bathymetry was involved — and locus noise is
      // what tears the peel into a left and a right (MODEL.md 4.5).
      if (last === null || fLast === null) return z;
      return last + (z - last) * (-fLast) / Math.max(f - fLast, 1e-9);
    }
    last = z; fLast = f;
  }
  return last === null ? z0 : last;
}

// ALL upward crossings of the criterion at a station, interpolated, seaward to
// shoreward — plus the deepest march point as a fallback for stations where
// nothing breaks (lull at this H0, or beach). markBreak above keeps the old
// contract (seaward-most only) for the plane/measured A-B beds.
function markBreakCrossings(spotName, x, opts) {
  const { H0, T, tide, bedShape } = opts;
  const cg0 = G * T / (4 * Math.PI);
  const wl = MSL_ABOVE_NAVD88 + tide;
  const { z0, z1 } = PP_DEPTH_DATA.grid;
  const crossings = [];
  let last = null, fLast = null;
  for (let z = z0; z <= z1; z += MARCH_DZ) {
    const f = breakExcess(bedElevBlended(spotName, x, z, bedShape), wl, H0, cg0);
    if (f === null) break;
    if (f >= 0 && fLast !== null && fLast < 0) {
      crossings.push(last + (z - last) * (-fLast) / Math.max(f - fLast, 1e-9));
    } else if (f >= 0 && fLast === null) {
      crossings.push(z);                            // breaking from the first step
    }
    last = z; fLast = f;
  }
  return { crossings, fallback: last === null ? z0 : last };
}

// Returns { texture, x0, x1 } or null when the site has no bathymetry.
export function bakeBreakLine(spotName, xRange, opts) {
  if (!spotName) return null;
  const [x0, x1] = xRange;
  // Direction belongs in the key: the peel constraint below consumes
  // opts.peel.phiRad, so two bakes that differ only in direction are two
  // different lines. Same style as bakeRefraction's key (swellDeg member).
  // `null` when peeldir is off, which is its own distinct cache state.
  const peelPhi = opts.peel ? opts.peel.phiRad : null;
  const key = [spotName, x0, x1, opts.H0, opts.T, opts.tide, opts.bedShape, peelPhi].join('|');
  if (breakTex && key === breakKey) return { texture: breakTex, x0, x1 };

  const rgba = new Uint8Array(BREAK_N * 4);
  const xAtI = (i) => x0 + (x1 - x0) * (i / (BREAK_N - 1));
  // ---------- BRANCH FOLLOWING (2026-08-11 — the V fix, part 3) ----------
  // The criterion can have several crossings per station, and the seaward-most
  // rule hands the line to whichever outer patch clears it — measured at
  // Sharks as a 100 m seaward V mid-stage that the slew limit could only turn
  // into rate-limited ramps (branch selection is not a continuity problem).
  // With the synthetic reef active, the DECLARATION picks the branch at one
  // anchor station — the crossing nearest the fitted wedge crest — and
  // continuity, which is a property of a real crest, propagates the choice
  // outward. Physics still proposes every crossing; authorship only chooses
  // among them at a single point (MODEL.md 4.5). Plane/measured beds keep the
  // seaward-most rule: they are the no-reef controls, and changing their
  // semantics would blunt the A/B.
  const fit = opts.bedShape === 0 ? reefFitFor(spotName) : null;
  if (fit) {
    const all = [];
    for (let i = 0; i < BREAK_N; i++) all.push(markBreakCrossings(spotName, xAtI(i), opts));
    const tanB = Math.tan(fit.betaDeg * Math.PI / 180);
    const zcAt = (x) => fit.zRef + tanB * (x - 24);   // REEF_ANCHOR_X
    // anchor: the station nearest the wedge anchor that has any crossing
    let i0 = Math.round(((24 - x0) / (x1 - x0)) * (BREAK_N - 1));
    i0 = Math.min(Math.max(i0, 0), BREAK_N - 1);
    for (let d = 0; d < BREAK_N && !all[i0].crossings.length; d++)
      i0 = Math.min(Math.max(i0 + (d % 2 ? d : -d), 0), BREAK_N - 1);
    const nearest = (cands, ref) => cands.reduce((b, z) => Math.abs(z - ref) < Math.abs(b - ref) ? z : b);
    // ANCHOR BAND: TRIED AND FALSIFIED 2026-08-13 — do not retry without new
    // information.
    // The proposed deterministic fix for the low-H0 branch flips was to declare
    // that "the reef's line lies within one flank width of the reef's crest"
    // and rank candidates by that band (at the anchor, then at every station).
    // Both forms measured BIT-IDENTICAL to default, at bands from 45 m down to
    // 1 m — with the flag proven live first (it reported the band the bake
    // actually used), so this is an inert mechanism, not an unwired one.
    // Why it cannot work: __pointbreak.crestOffset() measures the drawn line at
    // a median of 40-191 m from the fitted wedge crest, so the in-band set is
    // empty at most stations and the unfiltered fallback runs everywhere. The
    // band's premise — that the line is near the crest — is false on exactly
    // the spots that need help. That is the ROOT DEFECT restated: the reef does
    // not own the line, so a declaration phrased in the reef's terms has
    // nothing to select among. See WEB_THREE_SPEC "The anchor band, falsified".
    breakArr[i0] = all[i0].crossings.length ? nearest(all[i0].crossings, zcAt(xAtI(i0))) : all[i0].fallback;
    for (let i = i0 + 1; i < BREAK_N; i++)
      breakArr[i] = all[i].crossings.length ? nearest(all[i].crossings, breakArr[i - 1]) : breakArr[i - 1];
    for (let i = i0 - 1; i >= 0; i--)
      breakArr[i] = all[i].crossings.length ? nearest(all[i].crossings, breakArr[i + 1]) : breakArr[i + 1];
  } else {
    for (let i = 0; i < BREAK_N; i++) breakArr[i] = markBreak(spotName, xAtI(i), opts);
  }
  // ---------- SLEW LIMIT (2026-08-11 — the V fix, part 2) ----------
  // Continuity is physics, not smoothing: a 60-100 m crest cannot break 150 m
  // discontinuously between two stations 4.7 m apart. markBreak takes the
  // seaward-most crossing, so wherever an outer patch trips the criterion the
  // line TELEPORTS to it and back (measured 46-180 m single-texel jumps; the
  // A-frame V is two zippers running off such a jump). Limit the step between
  // adjacent texels to SLEW_M_PER_M. 3.0 m of z per m of x preserves any
  // honest line up to atan(3.0) = 71.6 deg — above the steepest alpha target
  // (Privates, 70; the first cut used 2.0 and clamped Sharks' 66 deg line to
  // 63.4, which is how "well above every target" got falsified by its own
  // measurement) — while still capping teleports at ~14 m against the 46-180 m
  // they were. Forward then backward pass, so the bound holds in both
  // directions and neither stage end is privileged. Unlike the 90 m smoother
  // (#smooth), slopes below the limit pass through UNTOUCHED — the ~5 m/step
  // peel signal survives.
  const SLEW_M_PER_M = 3.0;
  {
    const dxTex = (x1 - x0) / (BREAK_N - 1);
    const maxStep = SLEW_M_PER_M * dxTex;
    for (let i = 1; i < BREAK_N; i++)
      breakArr[i] = Math.min(Math.max(breakArr[i], breakArr[i - 1] - maxStep), breakArr[i - 1] + maxStep);
    for (let i = BREAK_N - 2; i >= 0; i--)
      breakArr[i] = Math.min(Math.max(breakArr[i], breakArr[i + 1] - maxStep), breakArr[i + 1] + maxStep);
  }
  for (let i = 0; i < BREAK_N; i++) {
    const u = Math.min(Math.max((breakArr[i] - BREAK_Z_MIN) / (BREAK_Z_MAX - BREAK_Z_MIN), 0), 1);
    const q = Math.round(u * 65535);
    rgba[i * 4] = (q >> 8) & 255; rgba[i * 4 + 1] = q & 255; rgba[i * 4 + 3] = 255;
  }
  // ---------- DIRECTION: the declaration constrains the derivation ----------
  // MODEL.md 4.5. The site is a right. Depth proposes where the wave breaks;
  // it cannot propose which WAY the wave peels, because a measured seabed does
  // not encode that and no bounded additive reef can make it. Measured: fitting
  // alpha over the full stage instead of 32 m of it made the A-frame count
  // WORSE (9/18 -> 13/18), because the local slope of the depth locus wanders
  // whatever the mean is fitted to.
  //
  // So constrain it, minimally. The breakpoint is the crest/line crossing, and
  // along the line the crest label is (up to the positive factor k)
  //     Q(x) = x*sin(phi) + (z_b(x) + coastCurve(x))*cos(phi)
  // The crossing marches +x wherever dQ/dx > 0. Enforcing Q non-decreasing by a
  // running max is the closest line to the depth-derived one that never
  // reverses: it leaves every station where the raw locus already peels the
  // right way untouched, and flattens only the reversals — into dQ/dx = 0,
  // which is a CLOSEOUT section, not an invented wave. A point break that goes
  // momentarily tangent closes out; it does not sprout a left.
  //
  // The cost, stated: at those stations the break line is no longer purely
  // depth-derived. That is the rule working as intended, not a violation of it.
  // ---------- smooth the locus at the WAVE's scale ----------
  // Independent of the direction constraint below, and justified on its own:
  // a crest is 60-100 m long and cannot break at a 5 m wiggle in the DEM any
  // more than it refracts off a pebble, so sub-wavelength structure in z_b is
  // sampling noise. And that noise is AMPLIFIED: the bed slopes at ~1:75 here,
  // so the measured 0.31-0.93 m elevation residual displaces the break crossing
  // by 22-70 m. The peel signal the reef is fitted for is ~5 m of z per bake
  // step, so the noise runs 4-13x larger than the signal it is meant to carry.
  const smoothM = opts.smoothM || 0;
  if (smoothM > 0) {
    const half = Math.max(1, Math.round((smoothM / 2) / ((x1 - x0) / (BREAK_N - 1))));
    const sm = new Float32Array(BREAK_N);
    for (let i = 0; i < BREAK_N; i++) {
      let acc = 0, n = 0;
      for (let j = i - half; j <= i + half; j++) {
        const k = Math.min(Math.max(j, 0), BREAK_N - 1);
        acc += breakArr[k]; n++;
      }
      sm[i] = acc / n;
    }
    for (let i = 0; i < BREAK_N; i++) {
      breakArr[i] = sm[i];
      const u2 = Math.min(Math.max((sm[i] - BREAK_Z_MIN) / (BREAK_Z_MAX - BREAK_Z_MIN), 0), 1);
      const q2 = Math.round(u2 * 65535);
      rgba[i * 4] = (q2 >> 8) & 255; rgba[i * 4 + 1] = q2 & 255;
    }
  }

  const peel = opts.peel || null;
  if (peel) {
    const sp = Math.sin(peel.phiRad), cp = Math.cos(peel.phiRad);
    const xAt = (i) => x0 + (x1 - x0) * (i / (BREAK_N - 1));
    const qOf = (i, z) => xAt(i) * sp + (z + peel.curveAt(xAt(i))) * cp;
    let qPrev = qOf(0, breakArr[0]);
    for (let i = 1; i < BREAK_N; i++) {
      const q = qOf(i, breakArr[i]);
      if (q < qPrev) {
        // flatten to the running max: solve Q = qPrev for z at this station
        breakArr[i] = (qPrev - xAt(i) * sp) / cp - peel.curveAt(xAt(i));
        const u2 = Math.min(Math.max((breakArr[i] - BREAK_Z_MIN) / (BREAK_Z_MAX - BREAK_Z_MIN), 0), 1);
        const q2 = Math.round(u2 * 65535);
        rgba[i * 4] = (q2 >> 8) & 255; rgba[i * 4 + 1] = q2 & 255;
      } else {
        qPrev = q;
      }
    }
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
// Stencil widened from one texel to three with M5: the synthetic ridges put
// real O(10 m) structure on the line, and a +-4.7 m difference reads the ridge
// noise, not the wedge strike. +-14 m reads the strike the fit targets.
export function derivedAlphaDeg(x, x0, x1) {
  const e = 3 * (x1 - x0) / BREAK_N;
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

// Returns { texture, kappa, psiMin, psiMax } or null with no bathymetry.
// The maths lives in dispersion.js (pure, THREE-free, node-testable); this
// function owns only the bathymetry sampling and the texture packing.
export function bakeRefraction(spotName, { T, tide = 0, bedShape = 0, swellDeg = 50, xRef = 0 } = {}) {
  if (!spotName) return null;
  const key = [spotName, T, tide, bedShape, swellDeg, xRef].join('|');
  if (refrTex && key === refrKey) {
    return { texture: refrTex, kappa: refrKappa, psiMin: refrPsiMin, psiMax: refrPsiMax };
  }
  const omega = 2 * Math.PI / T;
  const kappa = alongshoreKappa(omega, swellDeg);
  const wl = MSL_ABOVE_NAVD88 + tide;

  const baked = integratePsi({
    elevAt: (zc) => bedElevBlended(spotName, xRef, zc, bedShape),
    waterLevel: wl, omega, kappa,
    zMin: REFR_ZC_MIN, zMax: REFR_ZC_MAX, n: REFR_N,
  });
  refrPsi.set(baked.psi);
  refrPsiMin = baked.psiMin;
  refrPsiMax = baked.psiMax;
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
  return psiSample(refrPsi, zc, REFR_ZC_MIN, REFR_ZC_MAX);
}

// Invert Psi (monotonic non-decreasing) — the rider needs the contour position
// of a given crest phase.
export function zcAtPsi(target) {
  return zcAtPsiIn(refrPsi, target, REFR_ZC_MIN, REFR_ZC_MAX);
}

// Local incidence from shore-normal, radians — the readout that says whether
// the swell has actually straightened out by the time it breaks.
export function incidenceAt(spotName, zc, { T, tide = 0, bedShape = 0, swellDeg = 50, xRef = 0 } = {}) {
  const omega = 2 * Math.PI / T;
  const depth = MSL_ABOVE_NAVD88 + tide - bedElevBlended(spotName, xRef, zc, bedShape);
  return dispIncidenceAt(omega, depth, alongshoreKappa(omega, swellDeg));
}

// Local wavelength at a station, metres — the HUD readout and the number the
// M6 part 3 acceptance is measured against.
export function wavelengthAtStation(spotName, zc, { T, tide = 0, bedShape = 0, xRef = 0 } = {}) {
  const depth = MSL_ABOVE_NAVD88 + tide - bedElevBlended(spotName, xRef, zc, bedShape);
  return wavelengthAt(2 * Math.PI / T, depth);
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
