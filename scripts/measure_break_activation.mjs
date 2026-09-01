// NEXT_INVESTMENTS section 1, slices 1 and 2: INSTRUMENT the break-activation
// field, and COMPARE continuous representations of the break line on it.
// Nothing here is wired into the renderer; nothing here changes the bake.
//
// Headless. Imports bed.js the way tests/reef-audit.test.js does (a resolve
// hook for the bare `three` specifier), so the field, the crossings and the
// shipped line all come from the bake's own code, not a twin of it.
//
// WHAT IS EXPORTED, per preset and (H0, T, tide):
//
//   F(x, z) = H_eff(x) * Ks(h) - gamma * h      the breaker excess, on the
//             bake's own lattice: 128 stations across the 600 m bake, z from
//             the grid's seaward edge in MARCH_DZ steps to the beach cutoff
//             (depth <= 0.35 m). Positive = the criterion is met.
//   every zero crossing (onset) per station, interpolated as the bake does
//   the shipped selected branch (anchored greedy walk + slew clamp + gaps)
//   source coordinates, mapped-bed validity, reef-footprint flag, limiter/gap
//
// THE GATE (MEASUREMENT_LESSONS 4): the selection replica here is rebuilt from
// the exported field and compared to the REAL bake (bed.js bakeBreakLine,
// read back through breakZAt on the 2 m stage grid stageAlpha() uses). A
// replica that does not reproduce the shipped line certifies itself. The gate
// runs at every step of every sweep, not once.
//
// REPRESENTATIONS compared on the same field (slice 2):
//   shipped       the discrete anchored branch (control, == the bake)
//   seaward       seaward-most onset (the pre-2026-08-11 markBreak rule)
//   shoreward     shoreward-most onset
//   centroidAll   activation-weighted centroid, w = max(F, 0)
//   ridgeOnset    activation-weighted ridge, w = max(F,0) exp(-F/F0): weight
//                 peaks at F = F0, the "just breaking" zone, F0 = 0.25 m =
//                 gamma x the best-fit bed residual (LESSONS 14: the excess a
//                 depth error of one RMS produces)
//   bandCenter    finite-width activation band {z : |F| <= eps}, piecewise-
//                 linear exact centroid and width, eps = F0
//
// CONTINUITY METRIC: per representation, the line displacement per parameter
// step, max over stage stations; the acceptance idea from NEXT_INVESTMENTS is
// that halving the step must reduce the change rather than relocate a fixed
// jump. One 0.005 m ladder is read at 0.005 / 0.01 / 0.02 so the three step
// sizes see identical states.
//
// Usage:
//   node scripts/measure_break_activation.mjs                    # everything
//   node scripts/measure_break_activation.mjs --preset=secondpeak --h0=0.7   # one field
//   node scripts/measure_break_activation.mjs --mode=sweep --preset=sewers
//   node scripts/measure_break_activation.mjs --mode=floor      # re-measure PEEL_FLOOR (MODEL.md 4.6)
//   --mode=field|sweep|f0|triage|floor|card|all   --out=qa/break-field   --step=0.005   --lo=0.4 --hi=3.0
//   A partial run merges into the standing qa/break-field/summary.json.
//
//   --bed=<tag>       run the whole model on an alternate bathymetry source:
//                     data/model/pp_geo_profiles.<tag>.js + pp_depth_patches.<tag>.js
//                     (built by the two builders' --bathy flag). A node:module
//                     resolve hook redirects every consumer, shipped code
//                     included (scripts/lib/bed-source.mjs); nothing is edited
//                     and no hook is installed without the flag. Output goes to
//                     qa/break-field-<tag>/ so the committed summary is untouched.
//   --map-privates    give the `privates` preset geoSpot "Private's" for this
//                     run, so a bed on which its contour fit is usable can be
//                     measured. The shipped preset keeps geoSpot null.
//   --mode=card       one table per spot at the card state: contour fit, plane
//                     residual, reef fit, activation H0, signed alpha, where the
//                     shipped line sits relative to the OSM node.
import { registerHooks } from 'node:module';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { bedSourceTag, registerBedSource } from './lib/bed-source.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

// The bed source must be chosen before the first import that reaches bed.js.
export const BED_SOURCE = registerBedSource(bedSourceTag());
const MAP_PRIVATES = process.argv.includes('--map-privates');

// bed.js imports the bare specifier 'three'; the browser resolves it through
// the import map in web-three/index.html. Same shim as reef-audit.test.js.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') {
      return { url: new URL('../web-three/vendor/three.module.js', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const bed = await import('../web-three/js/bed.js');
const { PRESETS, PEEL_FLOOR, reefWindowKnots } = await import('../shared/params.js');
const { PP_GEO_DATA } = await import('../data/model/pp_geo_profiles.js');
const { PP_DEPTH_DATA } = await import('../data/model/pp_depth_patches.js');
const D = await import('../web-three/js/dispersion.js');
const { signedPeelGeometryAt } = await import('../web-three/js/peel-geometry.js');
const { MONTHLY_OCEAN } = await import('../data/climatology/pp_monthly_ocean.js');
if (MAP_PRIVATES) PRESETS.privates.geoSpot = "Private's";   // this process only

// ---------- constants mirrored from bed.js / main.js ----------
// Not exported there; tests/break-field-gate.test.js reads bed.js's source to
// pin these so drift fails loudly instead of silently producing a twin.
export const BREAK_N = 128;          // bed.js BREAK_N
export const MARCH_DZ = 2;           // bed.js MARCH_DZ
export const REEF_ANCHOR_X = 24;     // bed.js REEF_ANCHOR_X
export const SLEW_M_PER_M = 3.0;     // bed.js SLEW_M_PER_M
export const GAP_SLOPE = 2.9;        // bed.js gap threshold / stageAlpha pinned
export const BEACH_DEPTH_M = 0.35;   // bed.js breakExcess: depth <= 0.35 -> null
export const X_RANGE = [-300, 300];  // main.js [-STAGE_W/2, STAGE_W/2], STAGE_W = 600
export const READBACK_DX = 2;        // main.js stageAlpha(2) / measure_branch_flip lineProbe(2)
// Representation parameters (this instrument's own, stated once).
export const F0_M = 0.25;            // gamma * 0.31 m best-fit bed residual (LESSONS 14)
export const FLIP_M = 20;            // a step that moves any stage station > 20 m is a flip
export const REVERSAL_DEG = 2;       // |alpha| above this with the wrong sign is a reversal

export const MAPPED = Object.keys(PRESETS).filter((k) => PRESETS[k].geoSpot
  && PP_GEO_DATA.profiles[PRESETS[k].geoSpot]?.contourFit?.usable);

const { GAMMA, G } = D;
const [X0, X1] = X_RANGE;
export const stationX = (i) => X0 + (X1 - X0) * (i / (BREAK_N - 1));

export function spotOf(key) { return PRESETS[key].geoSpot; }
export function cardOf(key) {
  const p = PRESETS[key];
  return { H0: p.H0, T: p.T, tide: 0, alpha: p.alpha };
}
export function stageOf(key) {
  const pr = PP_GEO_DATA.profiles[spotOf(key)];
  return { start: pr.stageBoundsM[0], end: pr.stageBoundsM[1],
           lo: pr.stageBoundsM[0] + 10, hi: pr.stageBoundsM[1] - 10 };
}
export function stageGrid(key) {
  const { lo, hi } = stageOf(key);
  const xs = [];
  for (let x = lo; x <= hi; x += READBACK_DX) xs.push(x);
  return xs;
}
// MODEL-TWIN of bed.js spotContourCurve (mapped, non-A-frame).
export function contourCurve(key, x) {
  const pr = PP_GEO_DATA.profiles[spotOf(key)];
  const gx = Math.min(Math.max(x, pr.stageBoundsM[0]), pr.stageBoundsM[1]);
  return pr.contourFit.x2 * gx * gx + pr.contourFit.x3 * gx * gx * gx;
}
// Same lerp as bed.js breakZAt, on any 128-texel array.
export function lineAt(arr, x) {
  const f = Math.min(Math.max((x - X0) / (X1 - X0), 0), 1) * (BREAK_N - 1);
  const i = Math.min(Math.floor(f), BREAK_N - 2);
  return arr[i] + (arr[i + 1] - arr[i]) * (f - i);
}
const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};
const round = (v, d) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);

// ---------- slice 1: the field basis ----------
// F is linear in H0 at fixed (T, tide, bed): F = (H0 * shelter) * Ks - gamma*h.
// The basis stores shelter, Ks and depth per cell so an H0 ladder is a
// multiply per cell, computed in the SAME operation order as bed.js
// breakExcess -> shoaledHeight (effH0 * Ks, then - GAMMA*depth), so the
// ladder is bit-identical to the bake's own march at every rung.
export function fieldBasis(key, { T, tide = 0 } = {}) {
  const spot = spotOf(key);
  if (!bed.hasBedGrid(spot, 0)) throw new Error(`${key}: no bed grid`);
  const wl = bed.MSL_ABOVE_NAVD88 + tide;
  const { z0, z1 } = PP_DEPTH_DATA.grid;
  const omega = 2 * Math.PI / T;
  const cg0 = G * T / (4 * Math.PI);
  const stations = [];
  for (let i = 0; i < BREAK_N; i++) {
    const x = stationX(i);
    const shelter = bed.getShelter() ? D.shelterFactor(x) : 1;
    const zs = [], depth = [], Ks = [], uplift = [];
    for (let z = z0; z <= z1; z += MARCH_DZ) {
      const eb = bed.bedElevBlended(spot, x, z, 0);
      const d = wl - eb;
      if (d <= BEACH_DEPTH_M) break;                    // beach: the march stops
      zs.push(z); depth.push(d);
      const cg = D.groupVelocityAt(omega, d);
      Ks.push(Math.min(Math.max(Math.sqrt(cg0 / cg), 0.7), 2.6));
      // reef footprint: the composite grid sits above the measured grid here
      uplift.push(eb - bed.bedElevAt(spot, x, z) > 0.005 ? 1 : 0);
    }
    stations.push({ i, x, shelter, zs, depth, Ks, uplift, fallback: zs.length ? zs[zs.length - 1] : z0 });
  }
  return { key, spot, T, tide, wl, z0, stations };
}

export function excessAt(basis, i, H0) {
  const s = basis.stations[i];
  const eff = H0 * s.shelter;
  const F = new Float64Array(s.zs.length);
  for (let j = 0; j < F.length; j++) F[j] = eff * s.Ks[j] - GAMMA * s.depth[j];
  return F;
}
export function fieldFor(basis, H0) {
  return { H0, F: basis.stations.map((_, i) => excessAt(basis, i, H0)) };
}

// Replica of bed.js markBreakCrossings at onsetMergeM = 0: every upward
// crossing, interpolated, plus the deepest march point as fallback.
export function onsetsOf(zs, F, z0) {
  const crossings = [];
  let last = null, fLast = null;
  for (let j = 0; j < zs.length; j++) {
    const z = zs[j], f = F[j];
    if (f >= 0 && fLast !== null && fLast < 0) {
      crossings.push(last + (z - last) * (-fLast) / Math.max(f - fLast, 1e-9));
    } else if (f >= 0 && fLast === null) {
      crossings.push(z);
    }
    last = z; fLast = f;
  }
  return { crossings, fallback: last === null ? z0 : last };
}

// Replica of bakeBreakLine's shipped path (reef fit present, dline 0,
// smoothM 0, peel null): anchor nearest the wedge crest, greedy continuity
// outward, slew clamp forward then backward, gap flags on the clamped runs.
export function selectShipped(basis, field, fit) {
  const all = basis.stations.map((s, i) => onsetsOf(s.zs, field.F[i], basis.z0));
  // Float32, like bed.js breakArr: every store rounds the same way the bake's
  // texture array does, so the replica is bit-identical rather than 5e-6 m off.
  const raw = new Float32Array(BREAK_N);
  const tanB = Math.tan(fit.betaDeg * Math.PI / 180);
  const zcAt = (x) => fit.zRef + tanB * (x - REEF_ANCHOR_X);
  let i0 = Math.round(((REEF_ANCHOR_X - X0) / (X1 - X0)) * (BREAK_N - 1));
  i0 = Math.min(Math.max(i0, 0), BREAK_N - 1);
  for (let d = 0; d < BREAK_N && !all[i0].crossings.length; d++)
    i0 = Math.min(Math.max(i0 + (d % 2 ? d : -d), 0), BREAK_N - 1);
  const nearest = (cands, ref) => cands.reduce((b, z) => Math.abs(z - ref) < Math.abs(b - ref) ? z : b);
  raw[i0] = all[i0].crossings.length ? nearest(all[i0].crossings, zcAt(stationX(i0))) : all[i0].fallback;
  for (let i = i0 + 1; i < BREAK_N; i++)
    raw[i] = all[i].crossings.length ? nearest(all[i].crossings, raw[i - 1]) : raw[i - 1];
  for (let i = i0 - 1; i >= 0; i--)
    raw[i] = all[i].crossings.length ? nearest(all[i].crossings, raw[i + 1]) : raw[i + 1];
  const z = Float32Array.from(raw);
  const dxTex = (X1 - X0) / (BREAK_N - 1);
  const maxStep = SLEW_M_PER_M * dxTex;
  for (let i = 1; i < BREAK_N; i++)
    z[i] = Math.min(Math.max(z[i], z[i - 1] - maxStep), z[i - 1] + maxStep);
  for (let i = BREAK_N - 2; i >= 0; i--)
    z[i] = Math.min(Math.max(z[i], z[i + 1] - maxStep), z[i + 1] + maxStep);
  const gap = new Uint8Array(BREAK_N);
  for (let i = 1; i < BREAK_N; i++)
    if (Math.abs(z[i] - z[i - 1]) / dxTex >= GAP_SLOPE) { gap[i] = 1; gap[i - 1] = 1; }
  return { onsets: all, raw, z, gap, anchorI: i0, anchorX: stationX(i0), anchorZc: zcAt(stationX(i0)) };
}

// ---------- slice 2: continuous representations on the same field ----------
// Each returns z per station (Float64Array(BREAK_N)) plus per-station meta.
export function representationsOf(basis, field, sel, { F0 = F0_M } = {}) {
  const n = BREAK_N;
  const seaward = new Float64Array(n), shoreward = new Float64Array(n);
  const centroidAll = new Float64Array(n), ridgeOnset = new Float64Array(n);
  const bandCenter = new Float64Array(n);
  const meta = [];
  for (let i = 0; i < n; i++) {
    const s = basis.stations[i], F = field.F[i], zs = s.zs;
    const o = sel.onsets[i];
    const first = o.crossings.length ? o.crossings[0] : o.fallback;
    seaward[i] = first;
    shoreward[i] = o.crossings.length ? o.crossings[o.crossings.length - 1] : o.fallback;
    // activation-weighted centroids
    let sw = 0, swz = 0, rw = 0, rwz = 0, fMax = -Infinity, fMaxReef = -Infinity, nPos = 0;
    for (let j = 0; j < zs.length; j++) {
      const a = Math.max(F[j], 0);
      if (F[j] > fMax) fMax = F[j];
      if (s.uplift[j] && F[j] > fMaxReef) fMaxReef = F[j];
      if (a > 0) nPos++;
      sw += a; swz += a * zs[j];
      const r = a * Math.exp(-a / F0);
      rw += r; rwz += r * zs[j];
    }
    centroidAll[i] = sw > 0 ? swz / sw : o.fallback;
    ridgeOnset[i] = rw > 0 ? rwz / rw : o.fallback;
    // finite-width band {z : |F| <= F0}, exact on the piecewise-linear F
    let len = 0, lenz = 0;
    for (let j = 0; j + 1 < zs.length; j++) {
      const fa = F[j], fb = F[j + 1], za = zs[j], zb = zs[j + 1];
      const lo = Math.min(fa, fb), hi = Math.max(fa, fb);
      if (hi < -F0 || lo > F0) continue;
      if (hi - lo < 1e-12) { len += zb - za; lenz += (zb - za) * 0.5 * (za + zb); continue; }
      // parameter t in [0,1] where F in [-F0, F0]
      const tOf = (f) => (f - fa) / (fb - fa);
      let t0 = tOf(-F0), t1 = tOf(F0);
      if (t0 > t1) [t0, t1] = [t1, t0];
      t0 = Math.max(t0, 0); t1 = Math.min(t1, 1);
      if (t1 <= t0) continue;
      const l = (t1 - t0) * (zb - za);
      len += l; lenz += l * (za + 0.5 * (t0 + t1) * (zb - za));
    }
    bandCenter[i] = len > 0 ? lenz / len : first;
    // gradient of F across each onset, m of excess per m of z
    const grads = o.crossings.map((zc) => {
      const j = Math.min(Math.max(Math.ceil((zc - zs[0]) / MARCH_DZ), 1), zs.length - 1);
      return (F[j] - F[j - 1]) / MARCH_DZ;
    });
    meta.push({
      nOnsets: o.crossings.length, onsets: o.crossings, fallback: o.fallback,
      fMax, fMaxReef: Number.isFinite(fMaxReef) ? fMaxReef : null,
      reefCells: s.uplift.reduce((q, v) => q + v, 0), nValid: zs.length, nPos,
      bandWidthM: len, gradFirst: grads.length ? grads[0] : null,
      gradMin: grads.length ? Math.min(...grads) : null,
      ridgeMinusFirstM: ridgeOnset[i] - first, centroidMinusFirstM: centroidAll[i] - first,
      bandMinusFirstM: bandCenter[i] - first,
    });
  }
  return {
    lines: { shipped: sel.z, seaward, shoreward, centroidAll, ridgeOnset, bandCenter },
    meta,
  };
}
export const REP_NAMES = ['shipped', 'seaward', 'shoreward', 'centroidAll', 'ridgeOnset', 'bandCenter'];

// ---------- the real bake, and the gate ----------
export function shippedOpts({ H0, T, tide = 0 }) {
  return { H0, T, tide, bedShape: 0, smoothM: 0, peel: null };
}
// Bake Psi and the line exactly as main.js's default path does, then read the
// line back on the stage grid. bakeRefraction first: derivedPeelGeometry needs
// refrSpotName === activeBreakSpotName.
export function bakeReal(key, state) {
  const spot = spotOf(key);
  const refr = bed.bakeRefraction(spot, { T: state.T, tide: state.tide || 0, bedShape: 0,
                                          swellDeg: PRESETS[key].alpha, xRef: 0 });
  const baked = bed.bakeBreakLine(spot, X_RANGE, shippedOpts(state));
  if (!baked) throw new Error(`${key}: bake returned null`);
  const xs = stageGrid(key);
  return {
    kappa: refr.kappa,
    xs,
    z: xs.map((x) => bed.breakZAt(x, X0, X1)),
    gap: xs.map((x) => (bed.breakGapAt(x, X0, X1) ? 1 : 0)),
    alpha: xs.map((x) => bed.derivedAlphaDeg(x, X0, X1)),
  };
}
// Phase twin for the canonical signed peel along ANY line: kappa*x + Psi(zc),
// same contour frame as bed.js derivedPeelGeometry. Must be called after
// bakeReal (or bed.bakeRefraction) for this spot/T/tide.
export function phaseTwin(key, kappa) {
  return (px, pz) => kappa * px + bed.psiAt(pz + contourCurve(key, px));
}
export function alphaAlong(zArr, xs, phaseAt) {
  const e = 3 * (X1 - X0) / BREAK_N;
  return xs.map((x) => signedPeelGeometryAt({
    x, breakZAt: (px) => lineAt(zArr, px), phaseAt, lineStep: e, phaseStep: 1,
  })?.alphaDeg ?? NaN);
}
// stageAlpha()'s reductions on a readback line: pinned by backward slope.
export function stageStats(zStage, alphaStage, xs) {
  const pinned = xs.map((x, i) => i > 0
    && Math.abs((zStage[i] - zStage[i - 1]) / (xs[i] - xs[i - 1])) >= GAP_SLOPE);
  const clean = alphaStage.filter((_, i) => !pinned[i]);
  return { median: median(alphaStage), medianClean: median(clean),
           pinnedN: pinned.filter(Boolean).length, pinned };
}
export function maxAbsDiff(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (!Number.isFinite(d)) return Infinity;
    if (d > m) m = d;
  }
  return m;
}

// One state, fully instrumented: field, replica, reps, gate against the bake.
export function instrumentState(key, state, basis = null) {
  const spot = spotOf(key);
  const fit = bed.reefFitFor(spot);
  if (!fit) throw new Error(`${key}: no reef fit`);
  basis = basis || fieldBasis(key, state);
  const field = fieldFor(basis, state.H0);
  const sel = selectShipped(basis, field, fit);
  const reps = representationsOf(basis, field, sel);
  const real = bakeReal(key, state);
  const xs = real.xs;
  // GATE 0: the exported field IS the bake's own excess profile (same lattice)
  let fieldMaxAbsDiff = 0, latticeMismatch = 0;
  for (let i = 0; i < BREAK_N; i++) {
    const prof = bed.breakExcessProfile(spot, stationX(i), shippedOpts(state));
    if (prof.zs.length !== basis.stations[i].zs.length) { latticeMismatch++; continue; }
    fieldMaxAbsDiff = Math.max(fieldMaxAbsDiff, maxAbsDiff(prof.fs, field.F[i]));
  }
  // GATE 1: replica selected line == shipped bake on the readback grid
  const zRep = xs.map((x) => lineAt(sel.z, x));
  const gapRep = xs.map((x) => {
    const f = Math.min(Math.max((x - X0) / (X1 - X0), 0), 1) * (BREAK_N - 1);
    return sel.gap[Math.round(f)] === 1 ? 1 : 0;
  });
  const maxDz = maxAbsDiff(zRep, real.z);
  const gapMismatch = gapRep.reduce((q, g, i) => q + (g !== real.gap[i] ? 1 : 0), 0);
  // GATE 2: the phase twin reproduces derivedAlphaDeg on the shipped line
  const phaseAt = phaseTwin(key, real.kappa);
  const alphaRep = alphaAlong(sel.z, xs, phaseAt);
  const alphaMaxAbsDiff = maxAbsDiff(alphaRep, real.alpha);
  return { key, spot, state, fit, basis, field, sel, reps, real, xs, phaseAt,
           gate: { fieldMaxAbsDiff, latticeMismatch, maxDzM: maxDz, gapMismatch, alphaMaxAbsDiff } };
}

// Per-representation stage summary at one state: readback line, alpha stats,
// reef-footprint coverage and handedness reversals.
export function repSummary(inst, handSign) {
  const { basis, reps, xs, phaseAt } = inst;
  const out = {};
  for (const name of REP_NAMES) {
    const arr = reps.lines[name];
    const zStage = xs.map((x) => lineAt(arr, x));
    const alpha = alphaAlong(arr, xs, phaseAt);
    const st = stageStats(zStage, alpha, xs);
    // on-reef: the line at this station sits on the synthetic uplift footprint
    let onReef = 0, reversals = 0, cleanN = 0;
    xs.forEach((x, k) => {
      const i = Math.round(((x - X0) / (X1 - X0)) * (BREAK_N - 1));
      const s = basis.stations[i];
      const j = Math.round((zStage[k] - s.zs[0]) / MARCH_DZ);
      const on = j >= 0 && j < s.uplift.length && s.uplift[j] === 1;
      if (on) onReef++;
      if (!st.pinned[k]) {
        cleanN++;
        if (on && Number.isFinite(alpha[k]) && Math.abs(alpha[k]) > REVERSAL_DEG
            && Math.sign(alpha[k]) !== handSign) reversals++;
      }
    });
    out[name] = { zStage, alpha, medianClean: st.medianClean, median: st.median,
                  pinnedN: st.pinnedN, onReefFrac: onReef / xs.length, reversals, cleanN };
  }
  return out;
}

// ---------- sweeps ----------
// One ladder over H0 at fixed (T, tide). Every rung: field -> replica -> gate
// against the real bake -> all representations -> alpha/handedness.
export function sweepH0(key, { T, tide = 0, lo = 0.4, hi = 3.0, step = 0.005, handSign = 1, log = null } = {}) {
  const basis = fieldBasis(key, { T, tide });
  const ladder = [];
  for (let h = lo; h <= hi + 1e-9; h += step) ladder.push(Math.round(h * 10000) / 10000);
  const rows = [];
  let worstGate = { maxDzM: 0, gapMismatch: 0, fieldMaxAbsDiff: 0, alphaMaxAbsDiff: 0, latticeMismatch: 0 };
  for (const H0 of ladder) {
    const inst = instrumentState(key, { H0, T, tide }, basis);
    for (const k of Object.keys(worstGate)) worstGate[k] = Math.max(worstGate[k], inst.gate[k]);
    const reps = repSummary(inst, handSign);
    const row = { H0, T, tide, gate: inst.gate, reps: {} };
    for (const name of REP_NAMES) {
      const r = reps[name];
      row.reps[name] = { z: r.zStage, medianClean: r.medianClean, pinnedN: r.pinnedN,
                         onReefFrac: r.onReefFrac, reversals: r.reversals };
    }
    // field-level facts that do not depend on a selector
    const stageIdx = basis.stations.map((s, i) => i).filter((i) => stationX(i) >= stageOf(key).lo && stationX(i) <= stageOf(key).hi);
    const metas = stageIdx.map((i) => inst.reps.meta[i]);
    row.field = {
      nOnsetsMean: metas.reduce((q, m) => q + m.nOnsets, 0) / metas.length,
      multiOnsetFrac: metas.filter((m) => m.nOnsets > 1).length / metas.length,
      fMaxReefMax: Math.max(...metas.map((m) => m.fMaxReef ?? -Infinity)),
      reefActive: metas.some((m) => (m.fMaxReef ?? -Infinity) >= 0),
      bandWidthMed: median(metas.map((m) => m.bandWidthM)),
      gradFirstMed: median(metas.map((m) => m.gradFirst)),
      ridgeMinusFirstMed: median(metas.map((m) => m.ridgeMinusFirstM)),
      bandMinusFirstMed: median(metas.map((m) => m.bandMinusFirstM)),
    };
    rows.push(row);
    if (log && rows.length % 50 === 0) log(`${key}: ${rows.length}/${ladder.length}`);
  }
  return { key, T, tide, lo, hi, step, rows, worstGate, xs: stageGrid(key) };
}

// Displacement per step at stride k of a ladder (k rungs of `step`), per rep.
export function continuityOf(sweep, stride = 1) {
  const out = {};
  for (const name of REP_NAMES) {
    const perStep = [];
    for (let r = stride; r < sweep.rows.length; r += stride) {
      const a = sweep.rows[r - stride].reps[name].z, b = sweep.rows[r].reps[name].z;
      const dz = maxAbsDiff(a, b);
      const da = Math.abs((sweep.rows[r].reps[name].medianClean ?? NaN) - (sweep.rows[r - stride].reps[name].medianClean ?? NaN));
      perStep.push({ from: sweep.rows[r - stride].H0, to: sweep.rows[r].H0, dzMax: dz, dAlpha: da,
                     fracMove: b.reduce((q, z, i) => q + (Math.abs(z - a[i]) > 5 ? 1 : 0), 0) / b.length });
    }
    const dzs = perStep.map((p) => p.dzMax).sort((a, b) => a - b);
    const flips = perStep.filter((p) => p.dzMax > FLIP_M);
    out[name] = {
      stride, stepSize: sweep.step * stride, nSteps: perStep.length,
      dzMaxOverSteps: dzs.length ? dzs[dzs.length - 1] : null,
      dzP90: dzs.length ? dzs[Math.floor(0.9 * (dzs.length - 1))] : null,
      dzMedian: dzs.length ? dzs[Math.floor(dzs.length / 2)] : null,
      flipCount: flips.length,
      flips: flips.map((p) => ({ from: p.from, to: p.to, dzMax: round(p.dzMax, 1), fracMove: round(p.fracMove, 2), dAlpha: round(p.dAlpha, 1) })),
      dAlphaMax: Math.max(...perStep.map((p) => (Number.isFinite(p.dAlpha) ? p.dAlpha : 0))),
    };
  }
  return out;
}

// Generic 1-D parameter ladder (T or tide) at fixed everything else. The basis
// is recomputed per rung because Ks and depth move.
export function sweepParam(key, param, values, base, { handSign = 1 } = {}) {
  const rows = [];
  let worstGate = { maxDzM: 0, gapMismatch: 0, fieldMaxAbsDiff: 0, alphaMaxAbsDiff: 0, latticeMismatch: 0 };
  for (const v of values) {
    const state = { ...base, [param]: v };
    const inst = instrumentState(key, state);
    for (const k of Object.keys(worstGate)) worstGate[k] = Math.max(worstGate[k], inst.gate[k]);
    const reps = repSummary(inst, handSign);
    const row = { H0: state.H0, T: state.T, tide: state.tide, [param]: v, gate: inst.gate, reps: {} };
    for (const name of REP_NAMES) {
      const r = reps[name];
      row.reps[name] = { z: r.zStage, medianClean: r.medianClean, pinnedN: r.pinnedN,
                         onReefFrac: r.onReefFrac, reversals: r.reversals };
    }
    rows.push(row);
  }
  const step = values.length > 1 ? values[1] - values[0] : 0;
  return { key, param, values, step, rows, worstGate, xs: stageGrid(key) };
}

// F0 sensitivity of the two field-parameterised representations. F0 -> 0 makes
// the ridge the zero level set (the onset); F0 -> infinity makes it the plain
// centroid. If continuity and onset trade against each other along F0 with no
// value doing both, the trade-off is structural rather than a parameter choice.
// Selector-only ladder (the replica is gated elsewhere), 0.01 m rungs.
export const F0_SWEEP_M = [0.05, 0.1, 0.25, 0.5, 1.0, 2.0];
export function sweepF0(key, { lo = 0.4, hi = 3.0, step = 0.01, F0s = F0_SWEEP_M, handSign = 1 } = {}) {
  const card = cardOf(key);
  const inst = instrumentState(key, card);          // bakes Psi for the phase twin
  const { fit, basis, phaseAt, xs } = inst;
  const { lo: sLo, hi: sHi } = stageOf(key);
  const stageIdx = basis.stations.map((_, i) => i).filter((i) => stationX(i) >= sLo && stationX(i) <= sHi);
  const ladder = [];
  for (let h = lo; h <= hi + 1e-9; h += step) ladder.push(Math.round(h * 1000) / 1000);
  const out = [];
  for (const F0 of F0s) {
    const lines = { ridgeOnset: [], bandCenter: [] };
    let atCard = null;
    for (const H0 of ladder) {
      const field = fieldFor(basis, H0);
      const sel = selectShipped(basis, field, fit);
      const reps = representationsOf(basis, field, sel, { F0 });
      for (const n of Object.keys(lines)) lines[n].push(xs.map((x) => lineAt(reps.lines[n], x)));
      if (Math.abs(H0 - card.H0) < 1e-6) atCard = { reps, sel };
    }
    for (const n of Object.keys(lines)) {
      const Dof = (stride) => { let m = 0; for (let r = stride; r < lines[n].length; r += stride) m = Math.max(m, maxAbsDiff(lines[n][r - stride], lines[n][r])); return m; };
      let flips = 0;
      for (let r = 1; r < lines[n].length; r++) if (maxAbsDiff(lines[n][r - 1], lines[n][r]) > FLIP_M) flips++;
      const arr = atCard.reps.lines[n];
      const alpha = alphaAlong(arr, xs, phaseAt);
      const zStage = xs.map((x) => lineAt(arr, x));
      const st = stageStats(zStage, alpha, xs);
      let onReef = 0, rev = 0;
      xs.forEach((x, k) => {
        const i = Math.round(((x - X0) / (X1 - X0)) * (BREAK_N - 1));
        const s = basis.stations[i];
        const j = Math.round((zStage[k] - s.zs[0]) / MARCH_DZ);
        const on = j >= 0 && j < s.uplift.length && s.uplift[j] === 1;
        if (on) onReef++;
        if (on && !st.pinned[k] && Number.isFinite(alpha[k]) && Math.abs(alpha[k]) > REVERSAL_DEG
            && Math.sign(alpha[k]) !== handSign) rev++;
      });
      const offs = stageIdx.map((i) => arr[i] - (atCard.sel.onsets[i].crossings[0] ?? atCard.sel.onsets[i].fallback));
      out.push({ F0, rep: n, D2: Dof(2), D1: Dof(1), ratio: Dof(1) / Dof(2), flips,
                 cardAlpha: st.medianClean, cardOnReef: onReef / xs.length, cardReversals: rev,
                 cardMinusFirstMed: median(offs) });
    }
  }
  return { key, lo, hi, step, rows: out };
}

// Reef activation threshold: the lowest H0 at which F >= 0 anywhere on the
// synthetic uplift footprint inside the stage. Selector-free: a fact about the
// field. Bisection on a monotone quantity (F is increasing in H0 cell-wise).
export function reefActivationH0(key, { T, tide = 0, lo = 0.2, hi = 3.0 } = {}) {
  const basis = fieldBasis(key, { T, tide });
  const { lo: sLo, hi: sHi } = stageOf(key);
  const idx = basis.stations.map((s, i) => i).filter((i) => stationX(i) >= sLo && stationX(i) <= sHi);
  const fMaxReef = (H0) => {
    let m = -Infinity;
    for (const i of idx) {
      const F = excessAt(basis, i, H0), s = basis.stations[i];
      for (let j = 0; j < F.length; j++) if (s.uplift[j] && F[j] > m) m = F[j];
    }
    return m;
  };
  if (fMaxReef(hi) < 0) return { H0: null, note: 'reef never activates below hi' };
  if (fMaxReef(lo) >= 0) return { H0: lo, note: 'reef active at lo already' };
  let a = lo, b = hi;
  for (let k = 0; k < 40; k++) { const m = 0.5 * (a + b); if (fMaxReef(m) >= 0) b = m; else a = m; }
  return { H0: 0.5 * (a + b), fMaxReefAtCard: fMaxReef(PRESETS[key].H0) };
}

// MODEL-TWIN of main.js takeoffProfile(1): the stage station where the crest
// label S along the shipped line is minimal — where a crest first meets the
// line. The QA break sheet's watch station.
export function takeoffX(key, zArr, phaseAt, step = 1) {
  const { lo, hi } = stageOf(key);
  let best = Infinity, xb = lo;
  for (let x = lo; x <= hi; x += step) {
    const S = phaseAt(x, lineAt(zArr, x));
    if (S < best) { best = S; xb = x; }
  }
  return xb;
}

// The h0-low triage, answered from the field.
export function triageLowH0(key, { H0, T, tide = 0 }) {
  const inst = instrumentState(key, { H0, T, tide });
  const card = instrumentState(key, cardOf(key));
  const act = reefActivationH0(key, { T, tide });
  const xw = takeoffX(key, inst.sel.z, inst.phaseAt);
  const iw = Math.round(((xw - X0) / (X1 - X0)) * (BREAK_N - 1));
  const s = inst.basis.stations[iw];
  const F = inst.field.F[iw];
  const zLine = inst.sel.z[iw];
  const j = Math.min(Math.max(Math.round((zLine - s.zs[0]) / MARCH_DZ), 0), s.zs.length - 1);
  // where the shipped line sits relative to the reef footprint at the watch x
  const reefJs = s.uplift.map((u, k) => (u ? k : -1)).filter((k) => k >= 0);
  const reefZ = reefJs.length ? [s.zs[reefJs[0]], s.zs[reefJs[reefJs.length - 1]]] : null;
  const fReef = reefJs.length ? Math.max(...reefJs.map((k) => F[k])) : null;
  const rReef = reefJs.length ? Math.max(...reefJs.map((k) => (H0 * s.shelter * s.Ks[k]) / (GAMMA * s.depth[k]))) : null;
  const stage = inst.basis.stations.map((_, i) => i).filter((i) => stationX(i) >= stageOf(key).lo && stationX(i) <= stageOf(key).hi);
  const fMaxReefStage = Math.max(...stage.map((i) => inst.reps.meta[i].fMaxReef ?? -Infinity));
  // The renderer's permission at the watch station, from the same field: the
  // shader gate is smoothstep(0.90, 1.25, Hsh/Hlim), so full depth permission
  // needs F >= 0.25*gamma*h. Where along z is that first met? And how much
  // of the reef window's along-shore envelope is left at this x? (Twin of
  // params.js reefWindowKnots / GLSL reefWindow; reported, not consumed.)
  const gateFullJ = F.findIndex((f, k) => f >= 0.25 * GAMMA * s.depth[k]);
  const knots = reefWindowKnots(stageOf(key).start, stageOf(key).end);
  const ss = (a, b, v) => { const t = Math.min(Math.max((v - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); };
  const reefWindowAt = (x) => ss(knots[0], knots[1], x) * (1 - ss(knots[2], knots[3], x));
  const rs = repSummary(inst, 1), rc = repSummary(card, 1);
  const cardIw = Math.round(((takeoffX(key, card.sel.z, card.phaseAt) - X0) / (X1 - X0)) * (BREAK_N - 1));
  const cs = card.basis.stations[cardIw];
  const cj = Math.min(Math.max(Math.round((card.sel.z[cardIw] - cs.zs[0]) / MARCH_DZ), 0), cs.zs.length - 1);
  return {
    key, state: { H0, T, tide }, gate: inst.gate,
    reefActivationH0: act.H0, fMaxReefAtCard: act.fMaxReefAtCard,
    peelFloor: PEEL_FLOOR[key],
    watch: {
      x: xw, zLine, depthAtLineM: s.depth[j], reefZRange: reefZ,
      fMaxOnReefAtWatch: fReef, excessRatioMaxOnReefAtWatch: rReef,
      lineOnReef: reefZ ? zLine >= reefZ[0] - MARCH_DZ && zLine <= reefZ[1] + MARCH_DZ : false,
      fJustInside: F[Math.min(j + 5, F.length - 1)], fAtBeachCutoff: F[F.length - 1],
      nOnsets: inst.sel.onsets[iw].crossings.length, onsets: inst.sel.onsets[iw].crossings,
      gateFullZ: gateFullJ >= 0 ? s.zs[gateFullJ] : null,
      gateFullMinusLineM: gateFullJ >= 0 ? s.zs[gateFullJ] - zLine : null,
      gateFullDepthM: gateFullJ >= 0 ? s.depth[gateFullJ] : null,
      reefWindowAtWatch: reefWindowAt(xw),
    },
    stage: {
      fMaxReefMax: fMaxReefStage,
      shippedOnReefFrac: rs.shipped.onReefFrac, shippedAlpha: rs.shipped.medianClean,
      shippedPinnedN: rs.shipped.pinnedN,
      lineDepthMed: median(rs.shipped.zStage.map((z, k) => {
        const i = Math.round(((inst.xs[k] - X0) / (X1 - X0)) * (BREAK_N - 1));
        const st = inst.basis.stations[i];
        const jj = Math.min(Math.max(Math.round((z - st.zs[0]) / MARCH_DZ), 0), st.zs.length - 1);
        return st.depth[jj];
      })),
    },
    card: {
      state: card.state, takeoffX: stationX(cardIw), zLine: card.sel.z[cardIw], depthAtLineM: cs.depth[cj],
      onReefFrac: rc.shipped.onReefFrac, alpha: rc.shipped.medianClean,
      gateFullMinusLineM: (() => { const Fc = card.field.F[cardIw];
        const g = Fc.findIndex((f, k) => f >= 0.25 * GAMMA * cs.depth[k]);
        return g >= 0 ? cs.zs[g] - card.sel.z[cardIw] : null; })(),
      reefWindowAtWatch: reefWindowAt(stationX(cardIw)),
      fMaxReefMax: Math.max(...stage.map((i) => card.reps.meta[i].fMaxReef ?? -Infinity)),
    },
  };
}

// ---------- the peel floor, re-measured on this bake (MODEL.md 4.6, LESSONS 14b) ----------
// The floor is a floor ON THE PEEL, not on the branch id: the lowest H0 from
// which every rung up to the card draws a peel on the reef. Three conditions,
// all on the shipped line's stage readback, all stated once here and copied
// into shared/params.js PEEL_FLOOR_BASIS with the numbers:
//   1. stage-median clean signed alpha >= ALPHA_FLOOR_DEG with the authored
//      sign (tests/peel-floor.test.js ALPHA_FLOOR_DEG: collapsed states read
//      1-9 deg, healthy card states 26-51, 10 is the gap);
//   2. at least ON_REEF_MIN of the stage stations sit on the synthetic wedge
//      footprint (the peel is the REEF branch, not the inshore bore, which at
//      First Peak reads 10-12 deg with 0% on the reef);
//   3. both hold at every rung from the floor to the card H0 (First Peak's
//      line dips to 6-8 deg between 1.26 and 1.37 after reading 10.6 at 1.25).
// Basis: tide 0, the site card's own T, 0.01 m rungs from FLOOR_LADDER_LO_M
// to the card H0. Off that basis peelFloorH0() must return null (14b).
export const ALPHA_FLOOR_DEG = 10;
export const ON_REEF_MIN = 0.5;
export const FLOOR_STEP_M = 0.01;
export const FLOOR_LADDER_LO_M = 0.4;

export function peelHealthy(rep, handSign = 1) {
  const a = rep.medianClean;
  return Number.isFinite(a) && Math.sign(a) === handSign && Math.abs(a) >= ALPHA_FLOOR_DEG
    && rep.onReefFrac >= ON_REEF_MIN;
}
// Which of the three conditions a rung fails, for the report.
export function peelFailures(rep, handSign = 1) {
  const a = rep.medianClean, out = [];
  if (!Number.isFinite(a) || Math.sign(a) !== handSign) out.push('sign');
  else if (Math.abs(a) < ALPHA_FLOOR_DEG) out.push('alpha');
  if (rep.onReefFrac < ON_REEF_MIN) out.push('reef');
  return out;
}

// A fingerprint of the bake at the two floor rungs: the shipped line, its gap
// flags and the canonical alpha along it on the stage grid. Any change to the
// bake inputs (bed, dispersion, reef fit, presets, the alpha metric) that
// could move the floor changes this; tests/peel-floor.test.js compares it to
// PEEL_FLOOR[key].bakeDigest so a stale floor fails loudly instead of quietly
// clamping a #month= to a height the current bake draws a closeout at.
export function floorDigest(key, spec) {
  const h = createHash('sha1');
  for (const H0 of [spec.floorLo, spec.floorHi]) {
    const inst = instrumentState(key, { H0, T: spec.basisT, tide: spec.basisTideM ?? 0 });
    h.update(`${key} H0=${H0} T=${spec.basisT} tide=${spec.basisTideM ?? 0}\n`);
    h.update(inst.real.z.map((z) => z.toFixed(4)).join(','));
    h.update(inst.real.gap.join(''));
    h.update(inst.real.alpha.map((a) => (Number.isFinite(a) ? a.toFixed(6) : 'nan')).join(','));
  }
  return h.digest('hex').slice(0, 16);
}

export function measurePeelFloor(key, { handSign = 1, lo = FLOOR_LADDER_LO_M, log = null } = {}) {
  const card = cardOf(key);
  const sw = sweepH0(key, { T: card.T, tide: 0, lo, hi: card.H0, step: FLOOR_STEP_M, handSign, log });
  const rows = sw.rows;
  // the lowest rung from which every rung up to the card is healthy
  let k = rows.length;
  while (k > 0 && peelHealthy(rows[k - 1].reps.shipped, handSign)) k--;
  const cont = continuityOf(sw, 1).shipped;
  const flips = cont.flips.slice().sort((a, b) => a.from - b.from);
  const largest = cont.flips.reduce((b, f) => (b === null || f.dzMax > b.dzMax ? f : b), null);
  const act = reefActivationH0(key, { T: card.T, tide: 0 });
  const base = { key, label: PRESETS[key].label, basisT: card.T, basisTideM: 0, alphaTarget: card.alpha,
                 cardH0: card.H0, ladder: { lo, hi: card.H0, step: FLOOR_STEP_M }, worstGate: sw.worstGate,
                 reefActivationH0: act.H0, flips, largestFlip: largest };
  if (k === rows.length) return { ...base, floorLo: null, floorHi: null, note: 'the card state itself is not healthy' };
  if (k === 0) return { ...base, floorLo: null, floorHi: rows[0].H0, note: `healthy at the ladder bottom ${lo}` };
  const below = rows[k - 1].reps.shipped, above = rows[k].reps.shipped;
  const spec = { ...base, floorLo: rows[k - 1].H0, floorHi: rows[k].H0, floorH0: rows[k].H0,
    alphaBelow: below.medianClean, alphaAbove: above.medianClean,
    onReefBelow: below.onReefFrac, onReefAbove: above.onReefFrac,
    reversalsBelow: below.reversals, reversalsAbove: above.reversals,
    pinnedBelow: below.pinnedN, pinnedAbove: above.pinnedN,
    failedBelow: peelFailures(below, handSign),
    flipsAboveFloor: flips.filter((f) => f.from >= rows[k].H0),
    rungs: rows.map((r) => ({ H0: r.H0, alpha: round(r.reps.shipped.medianClean, 2), onReef: round(r.reps.shipped.onReefFrac, 3),
                              reversals: r.reps.shipped.reversals, pinned: r.reps.shipped.pinnedN })) };
  spec.bakeDigest = floorDigest(key, spec);
  return spec;
}

// What the floor does to the twelve #month= states at one spot, headless. A
// month keeps the card T and tide 0, i.e. it sits exactly on the floor's
// basis, and bed.js bakes on the CPU in the browser too, so these are the
// numbers audit_shipped_states.mjs would read back through stageAlpha().
export function monthCost(key, floorH0, { handSign = 1, prevFloorH0 = null } = {}) {
  const card = cardOf(key);
  const basis = fieldBasis(key, { T: card.T, tide: 0 });
  const alphaAt = (H0) => repSummary(instrumentState(key, { H0, T: card.T, tide: 0 }, basis), handSign).shipped;
  const H0_MIN = 0.4, H0_MAX = 3.0;
  const months = MONTHLY_OCEAN.map((m) => {
    const asked = Math.min(Math.max(m.H0, H0_MIN), H0_MAX);
    const drawn = floorH0 !== null && asked < floorH0 ? floorH0 : asked;
    const prev = prevFloorH0 !== null && asked < prevFloorH0 ? prevFloorH0 : asked;
    const raw = alphaAt(asked), now = alphaAt(drawn);
    return { key: m.key, asked, drawn, prevDrawn: prev, clamped: drawn !== asked, changed: Math.abs(drawn - prev) > 1e-9,
             alphaRaw: raw.medianClean, alphaDrawn: now.medianClean, onReefDrawn: now.onReefFrac };
  });
  const drawnH0 = months.map((m) => m.drawn);
  const askedSpan = Math.max(...months.map((m) => m.asked)) - Math.min(...months.map((m) => m.asked));
  return { key, floorH0, months, clampedN: months.filter((m) => m.clamped).length,
           changedN: months.filter((m) => m.changed).length,
           drawnMin: Math.min(...drawnH0), drawnMax: Math.max(...drawnH0),
           rangeKept: (Math.max(...drawnH0) - Math.min(...drawnH0)) / askedSpan,
           alphaRawMin: Math.min(...months.map((m) => m.alphaRaw)), alphaRawMax: Math.max(...months.map((m) => m.alphaRaw)),
           alphaDrawnMin: Math.min(...months.map((m) => m.alphaDrawn)), alphaDrawnMax: Math.max(...months.map((m) => m.alphaDrawn)) };
}

// ---------- the card-state summary (bed-source comparison) ----------
// One row per spot, all from the bake's own code at the card ocean (tide 0,
// card T, card H0): the contour fit and depth patch it read, the reef fit's
// convergence, where the field first goes positive on the reef, the shipped
// line's signed alpha and where it sits relative to the OSM node (the stage
// origin, x = 0). Selector-free facts and selector facts side by side so a
// cross-grid table can say which moved.
export function cardSummary(key) {
  const spot = spotOf(key);
  const pr = PP_GEO_DATA.profiles[spot];
  const patch = PP_DEPTH_DATA.patches[spot];
  const card = cardOf(key);
  const inst = instrumentState(key, card);
  const st = stageStats(inst.real.z, inst.real.alpha, inst.xs);
  const rs = repSummary(inst, Math.sign(st.medianClean || 1)).shipped;
  const act = reefActivationH0(key, { T: card.T, tide: 0 });
  const fit = inst.fit;
  // where the shipped line sits: at the node (x = 0) and as a stage median,
  // metres shore-normal from the node (negative = seaward), plus the depth there
  const zAtNode = lineAt(inst.sel.z, 0);
  const zMed = median(Array.from(inst.real.z));
  const depthAt = (x, z) => {
    const i = Math.round(((x - X0) / (X1 - X0)) * (BREAK_N - 1));
    const s = inst.basis.stations[i];
    const j = Math.min(Math.max(Math.round((z - s.zs[0]) / MARCH_DZ), 0), s.zs.length - 1);
    return s.depth[j];
  };
  const depthMed = median(inst.xs.map((x, k) => depthAt(x, inst.real.z[k])));
  // the wedge crest line at the node, for "line minus crest" (the 2026-08-13 metric)
  const crestAtNode = fit.zRef + Math.tan(fit.betaDeg * Math.PI / 180) * (0 - REEF_ANCHOR_X);
  return {
    key, spot, bedSource: BED_SOURCE || 'shipped', card,
    contour: { rmseM: pr.contourFit.rmseM, samples: pr.contourFit.samples, usable: pr.contourFit.usable,
               tangentDeg: pr.bathyContourTangentDeg, osmTangentDeg: pr.osmCoastTangentDeg,
               reefElevM: pr.reefElevationNavd88M, shoreSlope: pr.shoreSlope, stage: pr.stageBoundsM },
    patch: { planeResidualRmsM: patch?.planeResidualRmsM ?? null, planeSlopeDeg: bed.planeSlopeDeg(spot),
             landFractionAtMsl: patch?.landFractionAtMsl ?? null, outOfGridCells: patch?.outOfGridCells ?? 0 },
    reefFit: { targetDeg: fit.targetDeg, betaDeg: fit.betaDeg, fitDerivedDeg: fit.fitDerivedDeg,
               residualDeg: fit.residualDeg, withinTol: fit.withinTol, iterations: fit.iterations,
               signViolations: fit.signViolations, hbM: fit.hbM, zRef: fit.zRef, targetEl: fit.targetEl },
    activationH0: act.H0, fMaxReefAtCard: act.fMaxReefAtCard,
    alpha: { medianClean: st.medianClean, median: st.median, pinnedN: st.pinnedN, stations: inst.xs.length,
             onReefFrac: rs.onReefFrac, reversals: rs.reversals },
    line: { zAtNodeM: zAtNode, zMedianM: zMed, depthMedianM: depthMed, depthAtNodeM: depthAt(0, zAtNode),
            crestAtNodeM: crestAtNode, lineMinusCrestAtNodeM: zAtNode - crestAtNode },
    gate: inst.gate,
    peelFloor: PEEL_FLOOR[key]?.floorH0 ?? null,
  };
}

// ---------- field export ----------
export function fieldDump(inst) {
  const { key, spot, state, basis, field, sel, reps, gate, fit } = inst;
  const { lo, hi } = stageOf(key);
  return {
    preset: key, spot, state, generated: new Date().toISOString(),
    grid: { x0: X0, x1: X1, n: BREAK_N, z0: basis.z0, dz: MARCH_DZ, beachDepthM: BEACH_DEPTH_M,
            bedGrid: PP_DEPTH_DATA.grid, waterLevelNavd88M: basis.wl },
    stage: { lo, hi, start: stageOf(key).start, end: stageOf(key).end },
    fit: { betaDeg: fit.betaDeg, zRef: fit.zRef, targetEl: fit.targetEl, hbM: fit.hbM,
           fitMetric: fit.fitMetric, canonicalFitDeferred: fit.canonicalFitDeferred },
    anchor: { i: sel.anchorI, x: sel.anchorX, zc: sel.anchorZc },
    gate,
    F0_M, definitions: {
      F: 'H_eff(x)*Ks(h) - gamma*h, metres; H_eff = H0*shelter(x); positive = criterion met',
      onsets: 'upward zero crossings of F along +z, interpolated (bed.js markBreakCrossings, merge 0)',
      selected: 'bed.js bakeBreakLine shipped path replica: anchored greedy walk, slew 3.0 m/m, then gap flags',
      uplift: '1 where the composite (reef) grid sits > 5 mm above the measured grid: the synthetic wedge footprint',
      valid: 'cells listed are those the bake marches (depth > 0.35 m); the list ends at the beach',
    },
    stations: basis.stations.map((s, i) => ({
      i, x: round(s.x, 3), inStage: s.x >= lo && s.x <= hi, shelter: round(s.shelter, 6),
      nValid: s.zs.length, zFirst: s.zs[0] ?? null, zLast: s.fallback,
      F: Array.from(field.F[i], (v) => round(v, 4)),
      depth: s.depth.map((v) => round(v, 3)),
      uplift: s.uplift,
      onsets: sel.onsets[i].crossings.map((v) => round(v, 3)), fallback: sel.onsets[i].fallback,
      selectedRaw: round(sel.raw[i], 3), selected: round(sel.z[i], 3), gap: sel.gap[i],
      reps: Object.fromEntries(REP_NAMES.filter((n) => n !== 'shipped').map((n) => [n, round(reps.lines[n][i], 3)])),
      bandWidthM: round(reps.meta[i].bandWidthM, 2), gradFirst: round(reps.meta[i].gradFirst, 4),
      fMaxReef: round(reps.meta[i].fMaxReef, 4),
    })),
  };
}

// ---------- reporting ----------
const fmt = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
function mdTable(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
          ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--'))
    .map((a) => { const t = a.replace(/^--/, ''); const i = t.indexOf('='); return i < 0 ? [t, '1'] : [t.slice(0, i), t.slice(i + 1)]; }));
  const presets = flags.preset && flags.preset !== 'all' ? flags.preset.split(',') : MAPPED;
  const mode = flags.mode || 'all';
  // An alternate bed writes beside, never into, the committed break-field dir.
  const outRel = flags.out || (BED_SOURCE ? `qa/break-field-${BED_SOURCE}` : 'qa/break-field');
  const outDir = isAbsolute(outRel) ? outRel : join(ROOT, outRel);
  mkdirSync(outDir, { recursive: true });
  const LO = Number(flags.lo ?? 0.4), HI = Number(flags.hi ?? 3.0), STEP = Number(flags.step ?? 0.005);
  const log = (m) => process.stderr.write(m + '\n');
  if (BED_SOURCE) log(`bed source: ${BED_SOURCE} (${PP_GEO_DATA.generatedFrom.bathy}); mapped: ${MAPPED.join(', ')}`);
  let summary = { generated: new Date().toISOString(), X_RANGE, READBACK_DX, F0_M, FLIP_M, REVERSAL_DEG,
                  bedSource: BED_SOURCE || 'shipped', bathy: PP_GEO_DATA.generatedFrom.bathy,
                  ladder: { lo: LO, hi: HI, step: STEP }, presets: {} };
  // A partial run (one mode, one preset) updates the standing summary rather
  // than replacing a full sweep's tables with a fragment.
  if (mode !== 'all' || (flags.preset && flags.preset !== 'all')) {
    try { summary = { ...JSON.parse(readFileSync(join(outDir, 'summary.json'), 'utf8')), updated: new Date().toISOString() }; }
    catch { /* no standing summary: start fresh */ }
  }

  // Authored handedness, from the shipped line at the card state. All six
  // spots are rights; the instrument asserts the sign agrees before using it.
  const handSigns = {};
  for (const key of presets) {
    const inst = instrumentState(key, cardOf(key));
    const st = stageStats(inst.real.z, inst.real.alpha, inst.xs);
    handSigns[key] = Math.sign(st.medianClean || 1);
  }
  const handSet = new Set(Object.values(handSigns));
  if (handSet.size > 1) log(`WARNING: card-state handedness disagrees across spots: ${JSON.stringify(handSigns)}`);

  for (const key of presets) {
    const P = { ...(summary.presets[key] || {}), key, spot: spotOf(key), card: cardOf(key), handSign: handSigns[key] };
    summary.presets[key] = P;

    // ---- card-state summary for the bed-source comparison ----
    if (mode === 'card') {
      P.card = cardSummary(key);
      log(`${key} card: gate maxDz ${P.card.gate.maxDzM.toExponential(2)} m; activation ${fmt(P.card.activationH0, 3)}; `
        + `alpha ${fmt(P.card.alpha.medianClean)}; reef fit ${fmt(P.card.reefFit.fitDerivedDeg)} vs ${P.card.reefFit.targetDeg}`);
    }

    // ---- slice 1: the card-state field, dumped ----
    if (mode === 'all' || mode === 'field') {
      const states = [cardOf(key)];
      if (flags.h0 || flags.T || flags.tide) {
        states.length = 0;
        states.push({ H0: Number(flags.h0 ?? PRESETS[key].H0), T: Number(flags.T ?? PRESETS[key].T), tide: Number(flags.tide ?? 0) });
      }
      P.fields = [];
      for (const st of states) {
        const inst = instrumentState(key, st);
        const dump = fieldDump(inst);
        const name = `${key}_H0-${st.H0}_T-${st.T}_tide-${st.tide}.field.json`;
        writeFileSync(join(outDir, name), JSON.stringify(dump));
        const rs = repSummary(inst, P.handSign);
        P.fields.push({ state: st, file: name, gate: inst.gate,
          reps: Object.fromEntries(REP_NAMES.map((n) => [n, { medianClean: rs[n].medianClean, pinnedN: rs[n].pinnedN,
            onReefFrac: rs[n].onReefFrac, reversals: rs[n].reversals }])) });
        log(`${key} field ${JSON.stringify(st)}: gate maxDz ${inst.gate.maxDzM.toExponential(2)} m, `
          + `gap mismatches ${inst.gate.gapMismatch}, field maxdiff ${inst.gate.fieldMaxAbsDiff.toExponential(2)}, `
          + `alpha maxdiff ${inst.gate.alphaMaxAbsDiff.toExponential(2)} -> ${name}`);
      }
    }

    // ---- slice 2: the H0 ladder on the floor basis (tide 0, card T) ----
    if (mode === 'all' || mode === 'sweep') {
      const sw = sweepH0(key, { T: PRESETS[key].T, tide: 0, lo: LO, hi: HI, step: STEP, handSign: P.handSign, log });
      P.h0Sweep = { basis: { T: PRESETS[key].T, tide: 0 }, lo: LO, hi: HI, step: STEP, worstGate: sw.worstGate,
        continuity: { s1: continuityOf(sw, 1), s2: continuityOf(sw, 2), s4: continuityOf(sw, 4) },
        reefActivation: reefActivationH0(key, { T: PRESETS[key].T, tide: 0 }),
        // compact per-rung record: alpha, pinned, reef coverage, reversals, field facts
        rungs: sw.rows.map((r) => ({ H0: r.H0,
          alpha: Object.fromEntries(REP_NAMES.map((n) => [n, round(r.reps[n].medianClean, 2)])),
          pinned: Object.fromEntries(REP_NAMES.map((n) => [n, r.reps[n].pinnedN])),
          onReef: Object.fromEntries(REP_NAMES.map((n) => [n, round(r.reps[n].onReefFrac, 3)])),
          reversals: Object.fromEntries(REP_NAMES.map((n) => [n, r.reps[n].reversals])),
          field: Object.fromEntries(Object.entries(r.field).map(([k, v]) => [k, typeof v === 'number' ? round(v, 4) : v])) })),
      };
      log(`${key} H0 ladder: worst gate maxDz ${sw.worstGate.maxDzM.toExponential(2)} m over ${sw.rows.length} bakes; `
        + `shipped flips(0.01) ${P.h0Sweep.continuity.s2.shipped.flipCount}`);

      // ---- coarser T and tide sweeps at the card H0 ----
      // fine ladders; continuityOf reads them at stride 1 and 2 (0.25/0.5 s,
      // 0.04/0.08 m) so the halving test sees identical states
      const Th = [], tidesH = [];
      for (let t = 8; t <= 18 + 1e-9; t += 0.25) Th.push(round(t, 3));
      for (let t = -0.86; t <= 0.76 + 1e-9; t += 0.04) tidesH.push(round(t, 3));
      const base = { H0: PRESETS[key].H0, T: PRESETS[key].T, tide: 0 };
      const swT = sweepParam(key, 'T', Th, base, { handSign: P.handSign });
      const swTide = sweepParam(key, 'tide', tidesH, base, { handSign: P.handSign });
      P.tSweep = { values: Th, worstGate: swT.worstGate,
        continuity: { fine: continuityOf(swT, 1), coarse: continuityOf(swT, 2) },
        rungs: swT.rows.map((r) => ({ T: r.T, alpha: Object.fromEntries(REP_NAMES.map((n) => [n, round(r.reps[n].medianClean, 2)])) })) };
      P.tideSweep = { values: tidesH, worstGate: swTide.worstGate,
        continuity: { fine: continuityOf(swTide, 1), coarse: continuityOf(swTide, 2) },
        rungs: swTide.rows.map((r) => ({ tide: r.tide, alpha: Object.fromEntries(REP_NAMES.map((n) => [n, round(r.reps[n].medianClean, 2)])) })) };
      log(`${key} T/tide sweeps: worst gate maxDz ${Math.max(swT.worstGate.maxDzM, swTide.worstGate.maxDzM).toExponential(2)} m`);
    }
  }

  // ---- F0 sensitivity of the field-parameterised forms ----
  if (mode === 'all' || mode === 'f0') {
    for (const key of presets) {
      const sw = sweepF0(key, { handSign: handSigns[key] });
      summary.presets[key].f0Sweep = sw;
      log(`${key} F0 sweep: ${sw.rows.length} rows`);
    }
  }

  // ---- the h0-low triage (TODO: break-progression/drone/h0-low) ----
  if ((mode === 'all' || mode === 'triage') && presets.includes('secondpeak')) {
    summary.triage = triageLowH0('secondpeak', { H0: 0.70, T: PRESETS.secondpeak.T, tide: 0 });
    const inst = instrumentState('secondpeak', { H0: 0.70, T: PRESETS.secondpeak.T, tide: 0 });
    const name = 'secondpeak_H0-0.7_T-14_tide-0.field.json';
    writeFileSync(join(outDir, name), JSON.stringify(fieldDump(inst)));
    summary.triage.file = name;
    // reef activation for every mapped spot (not only the presets selected for
    // this run), for the table
    summary.reefActivation = Object.fromEntries(MAPPED.map((k) => [k, reefActivationH0(k, { T: PRESETS[k].T, tide: 0 })]));
  }

  // ---- the peel floor on this bake (MODEL.md 4.6) ----
  if (mode === 'all' || mode === 'floor') {
    for (const key of presets) {
      const fl = measurePeelFloor(key, { handSign: handSigns[key], log });
      const prev = PEEL_FLOOR[key]?.floorH0 ?? null;
      const cost = fl.floorH0 ? monthCost(key, fl.floorH0, { handSign: handSigns[key], prevFloorH0: prev }) : null;
      summary.presets[key].peelFloor = { ...fl, shippedFloorH0: prev, monthCost: cost };
      log(`${key} floor: ${fl.floorLo}->${fl.floorHi} (shipped ${prev}); largest flip ${fl.largestFlip?.from}->${fl.largestFlip?.to}; digest ${fl.bakeDigest}`);
    }
  }

  // Compact: the committed summary carries 521 rungs x 6 spots x 6 reps and
  // pretty-printing doubles it. Read it with a tool, not an eye.
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary));
  log(`wrote ${join(outDir, 'summary.json')}`);

  // ---- console tables (markdown, paste-ready) ----
  if (mode === 'all' || mode === 'sweep') {
    console.log('\n## Gate: replica vs shipped bake, worst over every rung\n');
    console.log(mdTable(['spot', 'bakes', 'max |dz| m', 'gap mismatches', 'field max |dF| m', 'alpha max |da| deg'],
      presets.filter((k) => summary.presets[k].h0Sweep).map((k) => {
        const g = summary.presets[k].h0Sweep.worstGate, n = summary.presets[k].h0Sweep.rungs.length;
        return [PRESETS[k].label, n, g.maxDzM.toExponential(2), g.gapMismatch, g.fieldMaxAbsDiff.toExponential(2), g.alphaMaxAbsDiff.toExponential(2)];
      })));
    console.log('\n## Continuity on the H0 ladder (tide 0, card T): max over steps of max over stage stations |dz|, m\n');
    for (const k of presets) {
      const S = summary.presets[k].h0Sweep; if (!S) continue;
      console.log(`\n### ${PRESETS[k].label} (target ${PRESETS[k].alpha} deg, card ${PRESETS[k].H0} m)\n`);
      console.log(mdTable(['representation', 'D(0.02)', 'D(0.01)', 'D(0.005)', 'D(.01)/D(.02)', 'D(.005)/D(.01)', 'flips(0.01)', 'p90 dz(0.01)', 'max dAlpha(0.01)'],
        REP_NAMES.map((n) => {
          const a = S.continuity.s4[n], b = S.continuity.s2[n], c = S.continuity.s1[n];
          return [n, fmt(a.dzMaxOverSteps), fmt(b.dzMaxOverSteps), fmt(c.dzMaxOverSteps),
                  fmt(b.dzMaxOverSteps / a.dzMaxOverSteps, 2), fmt(c.dzMaxOverSteps / b.dzMaxOverSteps, 2),
                  b.flipCount, fmt(b.dzP90), fmt(b.dAlphaMax)];
        })));
      const sh = S.continuity.s2.shipped;
      console.log(`\nshipped flips at 0.01: ${sh.flips.map((f) => `${f.from}->${f.to} (${f.dzMax} m, ${Math.round(f.fracMove * 100)}% sta, dα ${f.dAlpha})`).join('; ') || 'none'}`);
    }
  }
  if (mode === 'all' || mode === 'f0') {
    console.log('\n## F0 sweep: ridge/band continuity vs onset, card-state alpha\n');
    console.log(mdTable(['spot', 'F0 m', 'rep', 'D(0.02)', 'D(0.01)', 'ratio', 'flips>20 (0.01)', 'card alpha', 'card on-reef', 'card reversals', 'rep - first onset m'],
      presets.flatMap((k) => (summary.presets[k].f0Sweep?.rows || []).map((r) =>
        [PRESETS[k].label, r.F0, r.rep, fmt(r.D2), fmt(r.D1), fmt(r.ratio, 2), r.flips, fmt(r.cardAlpha), fmt(r.cardOnReef, 2), r.cardReversals, fmt(r.cardMinusFirstMed)]))));
  }
  if (mode === 'all' || mode === 'floor') {
    const P = presets.filter((k) => summary.presets[k].peelFloor);
    console.log(`\n## The peel floor, re-measured (tide 0, card T, ${FLOOR_STEP_M} m rungs; alpha >= ${ALPHA_FLOOR_DEG} deg with the authored sign, >= ${Math.round(ON_REEF_MIN * 100)}% of stage stations on the reef, holding to the card)\n`);
    console.log(mdTable(['spot', 'shipped floor', 'largest flip', 'reef activates', 'floor (peel returns)', 'alpha below -> above', 'on-reef below -> above', 'fails below', 'flips above floor', 'gate max |dz|', 'digest'],
      P.map((k) => { const f = summary.presets[k].peelFloor;
        return [f.label, fmt(f.shippedFloorH0, 2), f.largestFlip ? `${f.largestFlip.from}->${f.largestFlip.to} (${f.largestFlip.dzMax} m)` : 'none',
                fmt(f.reefActivationH0, 3), `${fmt(f.floorLo, 2)}->${fmt(f.floorHi, 2)}`, `${fmt(f.alphaBelow)} -> ${fmt(f.alphaAbove)}`,
                `${fmt(f.onReefBelow, 2)} -> ${fmt(f.onReefAbove, 2)}`, (f.failedBelow || []).join('+') || 'n/a',
                (f.flipsAboveFloor || []).map((x) => `${x.from}->${x.to}`).join('; ') || 'none', f.worstGate.maxDzM.toExponential(1), f.bakeDigest || 'n/a']; })));
    console.log('\n## What the floor does to #month= (headless twin of audit_shipped_states.mjs, months only)\n');
    console.log(mdTable(['spot', 'floor', 'months clamped', 'months that move vs shipped floor', 'H0 drawn', 'seasonal range kept', 'alpha raw', 'alpha drawn'],
      P.filter((k) => summary.presets[k].peelFloor.monthCost).map((k) => { const c = summary.presets[k].peelFloor.monthCost;
        return [PRESETS[k].label, fmt(c.floorH0, 2), `${c.clampedN}/12`, `${c.changedN}: ${c.months.filter((m) => m.changed).map((m) => `${m.key} ${fmt(m.prevDrawn, 3)}->${fmt(m.drawn, 3)}`).join(', ') || '-'}`,
                `${fmt(c.drawnMin, 3)}-${fmt(c.drawnMax, 3)}`, `${Math.round(c.rangeKept * 100)}%`, `${fmt(c.alphaRawMin)}-${fmt(c.alphaRawMax)}`, `${fmt(c.alphaDrawnMin)}-${fmt(c.alphaDrawnMax)}`]; })));
    console.log('\n## Paste-ready shared/params.js PEEL_FLOOR entries\n');
    for (const k of P) { const f = summary.presets[k].peelFloor; if (!f.floorH0) continue;
      console.log(`  ${k}: {\n    flipLo: ${f.largestFlip.from.toFixed(2)}, flipHi: ${f.largestFlip.to.toFixed(2)}, floorLo: ${f.floorLo.toFixed(2)}, floorHi: ${f.floorHi.toFixed(2)}, floorH0: ${f.floorH0.toFixed(2)},\n`
        + `    alphaBelow: ${f.alphaBelow.toFixed(1)}, alphaAbove: ${f.alphaAbove.toFixed(1)}, onReefBelow: ${f.onReefBelow.toFixed(2)}, onReefAbove: ${f.onReefAbove.toFixed(2)},\n`
        + `    alphaTarget: ${f.alphaTarget}, basisT: ${f.basisT}, basisTideM: 0, bakeDigest: '${f.bakeDigest}' },`); }
  }
  if (mode === 'card') {
    const bedLabel = BED_SOURCE || 'shipped';
    console.log(`\n## Card-state summary, bed source: ${bedLabel} (${summary.bathy})\n`);
    console.log(mdTable(['spot', 'contour RMS m', 'tangent °', 'plane resid m', 'reef fit β°', 'fit α° / target', 'resid °', 'iters', 'sign viol', 'h_b m', 'activation H0', 'card α (clean)', 'pinned', 'on-reef', 'rev', 'line z@node m', 'line z med m', 'depth med m', 'line−crest @node m', 'gate |dz|'],
      presets.filter((k) => summary.presets[k].card).map((k) => {
        const c = summary.presets[k].card;
        return [PRESETS[k].label, fmt(c.contour.rmseM, 2), fmt(c.contour.tangentDeg), fmt(c.patch.planeResidualRmsM, 2),
                fmt(c.reefFit.betaDeg), `${fmt(c.reefFit.fitDerivedDeg)} / ${c.reefFit.targetDeg}`, fmt(c.reefFit.residualDeg),
                c.reefFit.iterations, c.reefFit.signViolations, fmt(c.reefFit.hbM, 2), fmt(c.activationH0, 3),
                fmt(c.alpha.medianClean), c.alpha.pinnedN, fmt(c.alpha.onReefFrac, 2), c.alpha.reversals,
                fmt(c.line.zAtNodeM), fmt(c.line.zMedianM), fmt(c.line.depthMedianM, 2), fmt(c.line.lineMinusCrestAtNodeM),
                c.gate.maxDzM.toExponential(1)];
      })));
  }
  if (summary.triage) {
    const t = summary.triage;
    console.log('\n## h0-low triage (Second Peak, H0 0.70, T 14, tide 0)\n');
    console.log(JSON.stringify({ reefActivationH0: t.reefActivationH0, watch: t.watch, stage: t.stage, card: t.card }, null, 1));
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) await main();
