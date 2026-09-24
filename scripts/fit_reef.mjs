// The reef refit (docs/research/REEF_REFIT_2026-09-24.md): the offline
// per-spot search over (crest depth, strike beta) that bakes
// data/model/pp_reef_fit.json, and the scorecard that reads any arm of the
// bake back through the same reductions.
//
// Headless, on the bake's own code (bed.js bakeRefraction / bakeBreakLine /
// derivedPeelGeometry), never a twin (MEASUREMENT_LESSONS 4). The search does
// not patch bed.js: each candidate wedge is handed to the SHIPPED table path
// through bed.setReefFitOverride(), so the code that scores a candidate is the
// code that will draw it once it is in the table.
//
// WHAT IS SCORED, per spot (every alpha is the canonical one the HUD, the
// floor and the rider share: stage-median clean signed crest-relative alpha on
// the 2 m stage grid, limiter-pinned stations excluded — derivedAlphaDeg,
// PEEL_FLOOR_BASIS.alphaMetric):
//   (a) card-state alpha against the authored target, signed;
//   (b) the H0 band card x [0.7, 1.3] at tide 0 and card T: every rung must be
//       a peel by the floor's own criterion (alpha >= 10 deg with the authored
//       handedness, >= 50 % of stage stations on the wedge); and the widest
//       contiguous tide interval around 0 over which the whole band stays a
//       peel, maximised as the secondary objective;
//   (c) no reversal at any clean, on-reef, off-ramp station at any band rung
//       (REEF_FIT_SIGNED §6 item 2: a slew ramp is a section gap, its
//       shoulders belong with it; ramp count is reported separately);
//   (d) at Second Peak the 2026-08-15 field-day cells (SC116 Hs 0.778 m at the
//       verified +0.500 m tide, and the Surfline 0.914 m at the predicted
//       +0.357 m, both T 16) must read alpha >= 30 deg with Vp inside the
//       observed 4.7-6.7 m/s (SURFLINE_CAM_POSE; compare_peel_speed.mjs);
//   (e) the Sentinel-2 loci (compare_sentinel2_line.mjs, the acceptance test
//       FIDELITY_AUDIT item 3 names): per spot, the reef arm's contradicted
//       count over the four main scenes may not rise above the pre-refit
//       count for that spot (qa/reef-fit/score.pre-refit.json), so the
//       point-wide 4/28 cannot rise and a consistent apex stays consistent.
// Crest depth is searched from the intertidal ceiling (bed.js
// REEF_CREST_CEIL_EL, MLLW + 0.1 m) down to 3.0 m below MSL; beta from 3 to
// 80 deg. Coarse grid, then a local refinement around the best feasible cell.
//
// Objective, in order: feasibility of (b)-(d) [as counts, so a spot that
// cannot satisfy all of them still gets the wedge that comes closest, with the
// shortfall printed]; then |card alpha - target| within CARD_TOL_DEG; then the
// widest tide band; then the smallest |card alpha - target|.
//
// Usage:
//   node scripts/fit_reef.mjs --mode=score [--reef=legacy] [--out=qa/reef-fit]
//   node scripts/fit_reef.mjs --mode=fit [--spots=secondpeak,jacks] [--write]   # one process per spot is fine
//   node scripts/fit_reef.mjs --mode=table                                   # assemble pp_reef_fit.json from qa/reef-fit/fit.<spot>.json
//   node scripts/fit_reef.mjs --mode=parity        # legacy arm vs the pre-refit scorecard
import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { bedSourceTag, registerBedSource } from './lib/bed-source.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
export const BED_SOURCE = registerBedSource(bedSourceTag());

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') {
      return { url: new URL('../web-three/vendor/three.module.js', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const bed = await import('../web-three/js/bed.js');
const { PRESETS, PEEL_FLOOR } = await import('../shared/params.js');
const { PP_GEO_DATA } = await import('../data/model/pp_geo_profiles.js');
const { PP_DEPTH_DATA } = await import('../data/model/pp_depth_patches.js');
const D = await import('../web-three/js/dispersion.js');
const S2 = await import('./compare_sentinel2_line.mjs');

// ---------- declared ----------
export const X_RANGE = [-300, 300];            // main.js [-STAGE_W/2, STAGE_W/2]
const [X0, X1] = X_RANGE;
export const READBACK_DX = 2;                  // main.js stageAlpha(2), the floor's grid
export const ALPHA_FLOOR_DEG = 10;             // PEEL_FLOOR_BASIS.alphaFloorDeg
export const ON_REEF_MIN = 0.5;                // PEEL_FLOOR_BASIS.onReefMin
export const ALPHA_WALKER_DEG = 30;            // Walker (1974)
export const REVERSAL_DEG = 2;                 // measure_break_activation REVERSAL_DEG
export const HAND_SIGN = 1;                    // Pleasure Point peels +x
export const REEF_ANCHOR_X = 24;               // bed.js REEF_ANCHOR_X
export const CARD_TOL_DEG = 2;                 // (a): "card alpha = target" within this
export const BAND_MULTS = [0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.3];        // (b), the search
export const WINDOW_MULTS = Array.from({ length: 15 }, (_, i) => +(0.7 + 0.05 * i).toFixed(2));  // R4b's ladder, the score
export const TIDE_LADDER_FIT = ladder(-0.85, 0.75, 0.05);             // the band search
export const TIDE_LADDER_SCORE = ladder(-0.86, 0.76, 0.02);
// (d): the 2026-08-15 cells at Second Peak (PEEL_BAND_FIELD §1)
export const FIELD_CELLS = [
  { label: 'SC116 Hs / verified tide', H0: 0.778, T: 16, tide: 0.500 },
  { label: 'Surfline 3 ft / predicted tide', H0: 0.914, T: 16, tide: 0.357 },
];
export const OBSERVED = { Vp_mps: [4.7, 6.7], c_mps: [3.8, 5.3], alphaDeg: [55, 73], alphaDegSeqA: [36, 49] };
export const FIELD_ALPHA_MIN_DEG = 30;
// the search lattice
export const CREST_MAX_M = 3.0;
export const CREST_STEP_COARSE = 0.1, CREST_STEP_FINE = 0.05;
export const BETA_MIN = 3, BETA_MAX = 80, BETA_STEP_COARSE = 2.5, BETA_STEP_FINE = 1.25;
// the two ceilings, read from bed.js where they live (the legacy one is not
// exported; it is the shoreline gate every arm keeps)
export const LEGACY_CEIL_EL = -0.5;
export const CREST_CEIL_EL = bed.REEF_CREST_CEIL_EL ?? (bed.MSL_ABOVE_NAVD88 + bed.TIDE_RANGE[0] + 0.1);
export const MAPPED = Object.keys(PRESETS).filter((k) => PRESETS[k].geoSpot
  && PP_GEO_DATA.profiles[PRESETS[k].geoSpot]?.contourFit?.usable);

function ladder(lo, hi, step) { const v = []; for (let x = lo; x <= hi + 1e-9; x += step) v.push(Math.round(x * 1000) / 1000); return v; }
const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const quantile = (v, q) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); };
const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : Number(v).toFixed(d));
function mdTable(head, rows) {
  const line = (r) => `| ${r.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}
const flag = (k, dflt) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : dflt; };

export function stageGrid(key) {
  const pr = PP_GEO_DATA.profiles[PRESETS[key].geoSpot];
  const xs = [];
  for (let x = pr.stageBoundsM[0] + 10; x <= pr.stageBoundsM[1] - 10; x += READBACK_DX) xs.push(x);
  return xs;
}

// ---------- one state, read the way the HUD reads it ----------
// Bakes Psi and the line exactly as main.js's default path does, then reads
// every stage station through the same exports the HUD reads. Ramp
// membership per REEF_FIT_SIGNED: a maximal run of stations whose dz/dx has
// one sign and which contains a pinned or gap-flagged station.
export function readState(key, { H0, T, tide, bedShape = 0 }, { keepStations = false } = {}) {
  const spot = PRESETS[key].geoSpot;
  const xs = stageGrid(key);
  const omega = 2 * Math.PI / T;
  bed.bakeRefraction(spot, { T, tide, bedShape, swellDeg: PRESETS[key].alpha, xRef: 0 });
  const baked = bed.bakeBreakLine(spot, X_RANGE, { H0, T, tide, bedShape, smoothM: 0, peel: null });
  if (!baked) throw new Error(`${key}: bake returned null`);
  const wl = bed.MSL_ABOVE_NAVD88 + tide;
  const e = 3 * (X1 - X0) / 128;                       // derivedPeelGeometry's stencil (BREAK_N = 128)
  const st = [];
  let zPrev = null;
  for (const x of xs) {
    const z = bed.breakZAt(x, X0, X1);
    const gap = bed.breakGapAt(x, X0, X1) ? 1 : 0;
    const g = bed.derivedPeelGeometry(x, X0, X1, { omega });
    const pinned = zPrev !== null && Math.abs((z - zPrev) / READBACK_DX) >= bed.GAP_SLOPE;
    zPrev = z;
    const eb = bed.bedElevBlended(spot, x, z, bedShape);
    const onReef = bedShape === 0 && bed.bedElevBlended(spot, x, z, 0) - bed.bedElevAt(spot, x, z) > 0.005 ? 1 : 0;
    const dzdx = (bed.breakZAt(x + e, X0, X1) - bed.breakZAt(x - e, X0, X1)) / (2 * e);
    const alpha = g?.alphaDeg ?? NaN;
    const clean = !pinned;
    const reversed = clean && Number.isFinite(alpha) && Math.abs(alpha) > REVERSAL_DEG && Math.sign(alpha) !== HAND_SIGN;
    st.push({ x, z, gap, pinned: pinned ? 1 : 0, onReef, depth: eb === bed.BED_UNKNOWN ? null : wl - eb, dzdx,
      alpha, clean, reversed, c: g?.phaseSpeedMps ?? NaN, Vp: g?.lineVelocityMps == null ? NaN : Math.abs(g.lineVelocityMps) });
  }
  let k0 = 0;
  while (k0 < st.length) {
    let k1 = k0;
    while (k1 + 1 < st.length && Math.sign(st[k1 + 1].dzdx) === Math.sign(st[k0].dzdx)) k1++;
    let hasGap = false;
    for (let m = k0; m <= k1; m++) if (st[m].pinned || st[m].gap) hasGap = true;
    for (let m = k0; m <= k1; m++) st[m].ramp = hasGap ? 1 : 0;
    k0 = k1 + 1;
  }
  const clean = st.filter((r) => r.clean);
  const cleanLive = clean.filter((r) => !r.gap);
  const alphaMed = median(clean.map((r) => r.alpha));
  const onReefFrac = st.reduce((q, r) => q + r.onReef, 0) / st.length;
  const revOn = clean.filter((r) => r.reversed && r.onReef);
  const healthy = Number.isFinite(alphaMed) && Math.sign(alphaMed) === HAND_SIGN && Math.abs(alphaMed) >= ALPHA_FLOOR_DEG && onReefFrac >= ON_REEF_MIN;
  const walker = healthy && Math.abs(alphaMed) >= ALPHA_WALKER_DEG;
  const out = {
    H0: round(H0, 3), T, tide: round(tide, 3),
    alpha: round(alphaMed, 2), alphaQ1: round(quantile(clean.map((r) => r.alpha), 0.25), 2), alphaQ3: round(quantile(clean.map((r) => r.alpha), 0.75), 2),
    onReef: round(onReefFrac, 3), pinnedN: st.length - clean.length, gapFrac: round(st.reduce((q, r) => q + r.gap, 0) / st.length, 3),
    reversalsOnReef: revOn.length, reversalsOffRamp: revOn.filter((r) => !r.ramp).length, reversalsAll: clean.filter((r) => r.reversed).length,
    rampStations: st.filter((r) => r.ramp).length,
    Vp: round(median(cleanLive.map((r) => r.Vp)), 2), VpQ1: round(quantile(cleanLive.map((r) => r.Vp), 0.25), 2), VpQ3: round(quantile(cleanLive.map((r) => r.Vp), 0.75), 2),
    c: round(median(cleanLive.map((r) => r.c)), 2), depth: round(median(st.map((r) => r.depth)), 2), zLine: round(median(st.map((r) => r.z)), 1),
    healthy: healthy ? 1 : 0, walker: walker ? 1 : 0,
  };
  if (keepStations) out.stations = st.map((r) => ({ x: r.x, z: round(r.z, 2), gap: r.gap, pinned: r.pinned, onReef: r.onReef, ramp: r.ramp,
    alpha: round(r.alpha, 2), c: round(r.c, 2), Vp: round(r.Vp, 2), depth: round(r.depth, 2) }));
  return out;
}

// ---------- the wedge as built: fit, audit, ceilings, waterline ----------
export function wedgeSummary(key) {
  const spot = PRESETS[key].geoSpot;
  const fit = bed.reefFitFor(spot);
  const audit = bed.reefAudit(spot);
  const { nx, nz, x0, x1, z0, z1 } = PP_DEPTH_DATA.grid;
  const pr = PP_GEO_DATA.profiles[spot];
  const [sLo, sHi] = pr.stageBoundsM;
  // posts lifted above each ceiling (wet in the measured grid, above it in the
  // composite), and the drawn waterline: posts the wedge lifts from below the
  // water level to at/above it, at MLLW and at MSL, whole grid and stage
  const wlMLLW = bed.MSL_ABOVE_NAVD88 + bed.TIDE_RANGE[0], wlMSL = bed.MSL_ABOVE_NAVD88;
  const quantum = (PP_DEPTH_DATA.grid.elevMaxM - PP_DEPTH_DATA.grid.elevMinM) / 65535;
  const c = { aboveLegacyCeil: 0, aboveCrestCeil: 0, exposedMLLW: 0, exposedMSL: 0, exposedMLLWStage: 0, exposedMSLStage: 0, touched: 0, maxAugEl: -Infinity, minCrestDepthM: null };
  let shallowest = Infinity;
  for (let j = 0; j < nz; j++) {
    const z = z0 + (z1 - z0) * (j / (nz - 1));
    for (let i = 0; i < nx; i++) {
      const x = x0 + (x1 - x0) * (i / (nx - 1));
      const em = bed.bedElevAt(spot, x, z), ea = bed.bedElevBlended(spot, x, z, 0);
      if (ea - em <= 0.005) continue;
      c.touched++;
      if (ea > c.maxAugEl) c.maxAugEl = ea;
      if (wlMSL - ea < shallowest) shallowest = wlMSL - ea;
      if (em < LEGACY_CEIL_EL && ea > LEGACY_CEIL_EL + quantum) c.aboveLegacyCeil++;
      if (em < LEGACY_CEIL_EL && ea > CREST_CEIL_EL + quantum) c.aboveCrestCeil++;
      const inStage = x >= sLo && x <= sHi;
      if (em < wlMLLW && ea >= wlMLLW) { c.exposedMLLW++; if (inStage) c.exposedMLLWStage++; }
      if (em < wlMSL && ea >= wlMSL) { c.exposedMSL++; if (inStage) c.exposedMSLStage++; }
    }
  }
  c.minCrestDepthM = round(shallowest, 3);
  c.maxAugEl = round(c.maxAugEl, 3);
  return {
    fit: fit && { betaDeg: round(fit.betaDeg, 3), crestDepthM: round(bed.MSL_ABOVE_NAVD88 - fit.targetEl, 3), targetEl: round(fit.targetEl, 3),
                  zRef: fit.zRef, hbM: round(fit.hbM, 3), fitDerivedDeg: round(fit.fitDerivedDeg, 2), fitMetric: fit.fitMetric,
                  legacyDerivedDeg: round(fit.legacyDerivedDeg ?? NaN, 2), withinTol: fit.withinTol, signViolations: fit.signViolations,
                  source: fit.source ?? 'live', crestCeilEl: round(fit.crestCeilEl ?? LEGACY_CEIL_EL, 3) },
    audit: audit && { postsTouched: audit.postsTouched, deepened: audit.deepened, aboveCeil: audit.aboveCeil, dryTouched: audit.dryTouched,
                      maxRaiseM: round(audit.maxRaiseM, 3), checksum: audit.checksum, aboveLegacyCeil: audit.aboveLegacyCeil ?? null },
    posts: c,
  };
}

// ---------- (b)/(c): the band at one tide ----------
export function bandAt(key, tide, mults = BAND_MULTS) {
  const p = PRESETS[key];
  const rungs = mults.map((m) => ({ mult: m, ...readState(key, { H0: +(p.H0 * m).toFixed(4), T: p.T, tide }) }));
  return { tide, rungs, healthyN: rungs.filter((r) => r.healthy).length, reversalsOffRamp: rungs.reduce((q, r) => q + r.reversalsOffRamp, 0),
           rampStations: rungs.reduce((q, r) => q + r.rampStations, 0), allHealthy: rungs.every((r) => r.healthy) ? 1 : 0 };
}
// The contiguous tide interval around 0 over which the whole band is a peel.
export function tideBandOf(key, ladderT, mults = BAND_MULTS, { needZero = true } = {}) {
  const i0 = ladderT.findIndex((t) => Math.abs(t) < 1e-9);
  const at = new Map();
  const ok = (t) => { if (!at.has(t)) at.set(t, bandAt(key, t, mults)); return at.get(t).allHealthy; };
  if (needZero && !ok(0)) return { band: null, widthM: 0, perTide: [...at.values()] };
  let a = i0, b = i0;
  while (a > 0 && ok(ladderT[a - 1])) a--;
  while (b < ladderT.length - 1 && ok(ladderT[b + 1])) b++;
  return { band: [ladderT[a], ladderT[b]], widthM: round(ladderT[b] - ladderT[a], 3),
           perTide: ladderT.filter((t) => at.has(t)).map((t) => ({ tide: t, allHealthy: at.get(t).allHealthy, healthyN: at.get(t).healthyN, rev: at.get(t).reversalsOffRamp })) };
}

// ---------- (d): the field-day cells ----------
export function fieldCells(key = 'secondpeak') {
  return FIELD_CELLS.map((c) => {
    const r = readState(key, c);
    const ok = r.healthy && r.alpha >= FIELD_ALPHA_MIN_DEG && r.Vp >= OBSERVED.Vp_mps[0] && r.Vp <= OBSERVED.Vp_mps[1];
    return { ...c, alpha: r.alpha, onReef: r.onReef, Vp: r.Vp, VpQ1: r.VpQ1, VpQ3: r.VpQ3, c: r.c, depth: r.depth, healthy: r.healthy, walker: r.walker, ok: ok ? 1 : 0 };
  });
}

// ---------- Sentinel-2 (replica of compare_sentinel2_line's verdict rule) ----------
export function sentinelScore(spots = null) {
  const loci = JSON.parse(readFileSync(join(ROOT, 'docs/research/assets/sentinel2-locus-2026-09-23/loci.json'), 'utf8'));
  const out = { cells: 0, score: {}, perCell: [] };
  for (const arm of Object.keys(S2.ARMS)) out.score[arm] = { contradicted: 0, consistent: 0, closest: 0 };
  const s2Median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]); };
  for (const scene of loci.scenes) {
    const forcing = S2.forcingFor(scene);
    for (const key of Object.keys(PRESETS)) {
      const spotName = PRESETS[key].geoSpot;
      if (!spotName || (spots && !spots.includes(spotName))) continue;
      const obs = scene.spots[spotName];
      if (!obs || !bed.hasBedGrid(spotName, 0)) continue;
      const cell = {};
      for (const [arm, bedShape] of Object.entries(S2.ARMS)) {
        cell[arm] = {};
        for (const [vName, H0] of Object.entries(forcing.H0)) {
          bed.bakeRefraction(spotName, { T: forcing.T, tide: forcing.tide, bedShape, swellDeg: PRESETS[key].alpha, xRef: 0 });
          if (!bed.bakeBreakLine(spotName, X_RANGE, { H0, T: forcing.T, tide: forcing.tide, bedShape, smoothM: 0, peel: null })) throw new Error('bake null');
          const offs = obs.stations.map((st) => (st.outer_k6 === null || st.outer_k6 === undefined) ? null : bed.breakZAt(st.x, X0, X1) - st.outer_k6);
          cell[arm][vName] = round(s2Median(offs), 1);
        }
      }
      const verdicts = {};
      if (obs.n_with_whitewater > 0) {
        for (const arm of Object.keys(S2.ARMS)) verdicts[arm] = cell[arm].h10 > 2 * S2.PIXEL_REG_SIGMA_M ? 'contradicted' : 'consistent';
        if (!scene.supplementary) {
          out.cells++;
          for (const arm of Object.keys(S2.ARMS)) out.score[arm][verdicts[arm]]++;
          const ok = Object.keys(S2.ARMS).filter((a) => verdicts[a] === 'consistent').sort((a, b) => Math.abs(cell[a].deshoaled) - Math.abs(cell[b].deshoaled));
          if (ok.length && (ok.length === 1 || Math.abs(cell[ok[1]].deshoaled) - Math.abs(cell[ok[0]].deshoaled) >= 2 * S2.PIXEL_REG_SIGMA_M)) out.score[ok[0]].closest++;
        }
      }
      out.perCell.push({ date: scene.date, supplementary: Boolean(scene.supplementary), spot: spotName, offsets: cell, verdicts });
    }
  }
  return out;
}

// (e) on one spot, reef arm only: the H1/10 line's median offset per main
// scene and the contradicted count (compare_sentinel2_line's rule), four
// bakes per call. The pre-refit per-spot count is the bar.
const LOCI = JSON.parse(readFileSync(join(ROOT, 'docs/research/assets/sentinel2-locus-2026-09-23/loci.json'), 'utf8'));
const PRE_REFIT_PATH = join(ROOT, 'qa/reef-fit/score.pre-refit.json');
const PRE_REFIT = existsSync(PRE_REFIT_PATH) ? JSON.parse(readFileSync(PRE_REFIT_PATH, 'utf8')) : null;
export function sentinelShippedContradicted(key) {
  if (!PRE_REFIT) return null;
  return PRE_REFIT.sentinel.perCell.filter((c) => c.spot === PRESETS[key].geoSpot && !c.supplementary && c.verdicts.reef === 'contradicted').length;
}
export function sentinelSpot(key) {
  const spotName = PRESETS[key].geoSpot;
  const s2Median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]); };
  const out = { contradicted: 0, h10: [] };
  for (const scene of LOCI.scenes) {
    if (scene.supplementary) continue;
    const obs = scene.spots[spotName];
    if (!obs || !obs.n_with_whitewater) continue;
    const forcing = S2.forcingFor(scene);
    bed.bakeRefraction(spotName, { T: forcing.T, tide: forcing.tide, bedShape: 0, swellDeg: PRESETS[key].alpha, xRef: 0 });
    if (!bed.bakeBreakLine(spotName, X_RANGE, { H0: forcing.H0.h10, T: forcing.T, tide: forcing.tide, bedShape: 0, smoothM: 0, peel: null })) throw new Error('bake null');
    const offs = obs.stations.map((st) => (st.outer_k6 === null || st.outer_k6 === undefined) ? null : bed.breakZAt(st.x, X0, X1) - st.outer_k6);
    const h10 = round(s2Median(offs), 1);
    out.h10.push({ date: scene.date, h10 });
    if (h10 > 2 * S2.PIXEL_REG_SIGMA_M) out.contradicted++;
  }
  return out;
}

// ---------- the Lookout line at Jack's (T3 forcing) ----------
export function lookoutLine({ Hs = 0.910, T = 16.67, tide = 0.316 } = {}) {
  const Ks15 = D.shoaledHeight(1, T, 15);
  const arms = [['raw', Hs], ['deshoal15', Hs / Ks15], ['set1.27', 1.27 * Hs], ['set1.53', 1.53 * Hs]];
  const out = {};
  for (const [label, H0] of arms) {
    const r = readState('jacks', { H0, T, tide }, { keepStations: true });
    const live = r.stations.filter((s) => !s.gap);
    out[label] = { H0: round(H0, 3), zMedian: round(median(live.map((s) => s.z)), 1), zQ1: round(quantile(live.map((s) => s.z), 0.25), 1), zQ3: round(quantile(live.map((s) => s.z), 0.75), 1),
                   alpha: r.alpha, onReef: r.onReef, gapFrac: r.gapFrac };
  }
  return out;
}

// ---------- the scorecard for one spot ----------
export function scoreSpot(key, { log = null } = {}) {
  const p = PRESETS[key];
  const w = wedgeSummary(key);
  const card = readState(key, { H0: p.H0, T: p.T, tide: 0 });
  const act = bed.reefActivationH0(p.geoSpot, X_RANGE, { T: p.T, tide: 0 });
  const window = bandAt(key, 0, WINDOW_MULTS);
  const okW = window.rungs.map((r) => r.walker === 1);
  const ic = window.rungs.findIndex((r) => r.mult === 1);
  let r4 = null;
  if (okW[ic]) { let a = ic, b = ic; while (a > 0 && okW[a - 1]) a--; while (b < okW.length - 1 && okW[b + 1]) b++; r4 = { lo: window.rungs[a].H0, hi: window.rungs[b].H0, openBelow: a === 0, openAbove: b === okW.length - 1 }; }
  const band = { rungs: window.rungs.filter((r) => BAND_MULTS.includes(r.mult)) };
  band.healthyN = band.rungs.filter((r) => r.healthy).length; band.n = band.rungs.length;
  band.reversalsOffRamp = band.rungs.reduce((q, r) => q + r.reversalsOffRamp, 0); band.rampStations = band.rungs.reduce((q, r) => q + r.rampStations, 0);
  const tb = tideBandOf(key, TIDE_LADDER_SCORE);
  const out = { key, label: p.label, spot: p.geoSpot, targetDeg: p.alpha, cardH0: p.H0, cardT: p.T,
                wedge: w, activationH0: act ? round(act.H0, 3) : null, activationCell: act?.cell ? { depthM: round(act.cell.depthM, 3), x: act.cell.x } : null,
                card, cardErrDeg: round(card.alpha - p.alpha, 2), band, r4Window: r4, window: window.rungs.map((r) => ({ mult: r.mult, H0: r.H0, alpha: r.alpha, onReef: r.onReef, healthy: r.healthy, walker: r.walker, rev: r.reversalsOffRamp, ramp: r.rampStations, Vp: r.Vp })),
                tideBand: tb.band, tideBandWidthM: tb.widthM,
                peelFloor: PEEL_FLOOR[key] ? { floorH0: PEEL_FLOOR[key].floorH0, tideBandM: PEEL_FLOOR[key].tideBandM } : null };
  if (key === 'secondpeak') out.fieldCells = fieldCells(key);
  if (log) log(`${key}: beta ${fmt(w.fit?.betaDeg)} crest ${fmt(w.fit?.crestDepthM, 2)} m; card alpha ${fmt(card.alpha)} vs ${p.alpha} (on-reef ${fmt(card.onReef, 2)}, rev ${card.reversalsOffRamp}); band ${band.healthyN}/${band.n}; tide band ${tb.band ? `[${tb.band[0]}, ${tb.band[1]}]` : 'none'}; activation ${fmt(act?.H0, 3)}; above old/new ceiling ${w.posts.aboveLegacyCeil}/${w.posts.aboveCrestCeil}`);
  return out;
}

export function scoreAll({ spots = MAPPED, log = null } = {}) {
  const out = { generated: new Date().toISOString(), arm: flag('reef', bed.getReefFitMode ? bed.getReefFitMode() : 'pre-refit'), bedSource: BED_SOURCE || 'shipped',
                crestCeilEl: round(CREST_CEIL_EL, 3), legacyCeilEl: LEGACY_CEIL_EL, spots: {} };
  for (const key of spots) out.spots[key] = scoreSpot(key, { log });
  out.sentinel = sentinelScore();
  out.sentinelSecondPeak = out.sentinel.perCell.filter((c) => c.spot === 'Second Peak' && !c.supplementary).map((c) => ({ date: c.date, reef: c.offsets.reef, verdict: c.verdicts.reef }));
  out.lookoutJacks = lookoutLine();
  return out;
}

export function scoreMarkdown(s) {
  const md = [];
  md.push(`## Reef scorecard — arm: ${s.arm}, bed ${s.bedSource}, crest ceiling ${s.crestCeilEl} m NAVD88 (legacy ${s.legacyCeilEl})\n`);
  md.push(mdTable(['spot', 'crest m', 'beta', 'card alpha / target', 'on-reef', 'rev (ramp)', 'band 0.7-1.3 healthy', 'tide band m', 'R4 |alpha|>=30 window', 'activation H0', 'floor (table)', 'posts > old / new ceiling', 'exposed MLLW (stage)', 'exposed MSL', 'checksum'],
    Object.values(s.spots).map((r) => [r.label, fmt(r.wedge.fit?.crestDepthM, 2), fmt(r.wedge.fit?.betaDeg), `${fmt(r.card.alpha)} / ${r.targetDeg}`, fmt(r.card.onReef, 2), `${r.card.reversalsOffRamp} (${r.card.rampStations})`,
      `${r.band.healthyN}/${r.band.n}`, r.tideBand ? `[${fmt(r.tideBand[0], 2)}, ${fmt(r.tideBand[1], 2)}]` : 'none', r.r4Window ? `${fmt(r.r4Window.lo, 2)}${r.r4Window.openBelow ? '(open)' : ''}-${fmt(r.r4Window.hi, 2)}${r.r4Window.openAbove ? '(open)' : ''}` : 'card < 30',
      fmt(r.activationH0, 3), r.peelFloor ? fmt(r.peelFloor.floorH0, 2) : 'n/a', `${r.wedge.posts.aboveLegacyCeil} / ${r.wedge.posts.aboveCrestCeil}`, `${r.wedge.posts.exposedMLLW} (${r.wedge.posts.exposedMLLWStage})`, r.wedge.posts.exposedMSL, r.wedge.audit?.checksum ?? 'n/a'])));
  md.push('\n### R4b: derived alpha across 0.7x-1.4x card H0 (tide 0, card T); * healthy, ** Walker\n');
  md.push(mdTable(['spot', ...WINDOW_MULTS.map((m) => `x${m}`)], Object.values(s.spots).map((r) => [r.label, ...r.window.map((w) => `${fmt(w.alpha)}${w.walker ? '**' : w.healthy ? '*' : ''}`)])));
  const sp = s.spots.secondpeak;
  if (sp?.fieldCells) {
    md.push('\n### Second Peak, the 2026-08-15 cells (observed Vp 4.7-6.7 m/s, c 3.8-5.3, alpha 55-73 / 36-49 on seqA)\n');
    md.push(mdTable(['cell', 'H0', 'T', 'tide', 'alpha', 'on-reef', 'Vp med [q1, q3]', 'c', 'depth', 'ok'], sp.fieldCells.map((c) => [c.label, c.H0, c.T, `+${c.tide}`, fmt(c.alpha), fmt(c.onReef, 2), `${fmt(c.Vp)} [${fmt(c.VpQ1)}, ${fmt(c.VpQ3)}]`, fmt(c.c, 2), fmt(c.depth, 2), c.ok ? 'yes' : 'no'])));
  }
  const sc = s.sentinel.score;
  md.push(`\n### Sentinel-2 (${s.sentinel.cells} cells): reef ${sc.reef.contradicted} contradicted / ${sc.reef.consistent} consistent / ${sc.reef.closest} closest; plane ${sc.plane.contradicted}/${sc.plane.consistent}/${sc.plane.closest}; measured ${sc.measured.contradicted}/${sc.measured.consistent}/${sc.measured.closest}\n`);
  md.push(mdTable(['scene', 'Second Peak reef Hs/Ks offset', 'H1/10 offset', 'verdict'], s.sentinelSecondPeak.map((c) => [c.date, fmt(c.reef.deshoaled, 0), fmt(c.reef.h10, 0), c.verdict])));
  md.push('\n### Jack\'s line at the 2026-09-05 Lookout forcing (Hs 0.910, T 16.67, tide +0.316)\n');
  md.push(mdTable(['arm', 'H0', 'z median [q1, q3]', 'alpha', 'on-reef', 'gap'], Object.entries(s.lookoutJacks).map(([k, v]) => [k, fmt(v.H0, 3), `${fmt(v.zMedian, 0)} [${fmt(v.zQ1, 0)}, ${fmt(v.zQ3, 0)}]`, fmt(v.alpha), fmt(v.onReef, 2), fmt(v.gapFrac, 2)])));
  return md.join('\n');
}

// ---------- the search ----------
// One candidate wedge, scored on (a)-(d). The card and the band at tide 0 are
// cheap (8 bakes) and decide feasibility; the tide band (the maximised
// secondary) is only measured on candidates that pass or come closest.
export function evaluateCandidate(key, crestDepthM, betaDeg, { withTide = false } = {}) {
  const p = PRESETS[key];
  bed.setReefFitOverride(p.geoSpot, { crestDepthM, betaDeg });
  const fit = bed.reefFitFor(p.geoSpot);
  const card = readState(key, { H0: p.H0, T: p.T, tide: 0 });
  const band = bandAt(key, 0);
  const cells = key === 'secondpeak' ? fieldCells(key) : [];
  const s2 = sentinelSpot(key), s2Shipped = sentinelShippedContradicted(key) ?? s2.contradicted;
  const r = { crestDepthM, betaDeg, cardAlpha: card.alpha, cardErr: round(Math.abs(card.alpha - p.alpha), 3), cardOnReef: card.onReef,
              cardHealthy: card.healthy, bandHealthyN: band.healthyN, bandN: band.rungs.length, reversalsOffRamp: band.reversalsOffRamp + card.reversalsOffRamp,
              rampStations: band.rampStations, fieldOkN: cells.filter((c) => c.ok).length, fieldN: cells.length,
              fieldCells: cells.map((c) => ({ alpha: c.alpha, Vp: c.Vp, onReef: c.onReef })), zRef: fit?.zRef, targetEl: round(fit?.targetEl, 3),
              s2Contradicted: s2.contradicted, s2Shipped, s2Regressions: Math.max(0, s2.contradicted - s2Shipped), s2H10: s2.h10 };
  r.feasible = r.cardHealthy && r.bandHealthyN === r.bandN && r.reversalsOffRamp === 0 && r.fieldOkN === r.fieldN && r.s2Regressions === 0 ? 1 : 0;
  r.bandAlphaMin = round(Math.min(...band.rungs.map((q) => q.alpha)), 2);
  if (withTide) { const tb = tideBandOf(key, TIDE_LADDER_FIT); r.tideBand = tb.band; r.tideBandWidthM = tb.widthM; }
  return r;
}
// Rank: feasibility shortfall first — failing band rungs (1 each), clean
// on-reef off-ramp reversals (1 each, capped), a card that is not a peel (5),
// and a missed field-day cell (FIELD_CELL_WEIGHT each: the 2026-08-15 day is
// the decision the refit exists for, so where (c) and (d) conflict — at Second
// Peak they do, on the up-point feather that REEF_FIT_SIGNED §6 item 3 leaves
// to the reef-extent decision — the day wins and the reversals are reported,
// counted and located, not hidden), and a Sentinel-2 cell that regresses
// to contradicted (S2_WEIGHT each: an observation, weighted like the field
// day); then card alpha within tolerance; then the widest tide band; then the
// smallest card error.
export const FIELD_CELL_WEIGHT = 25, S2_WEIGHT = 25, REVERSAL_CAP = 20;
export function rankKey(r) {
  const shortfall = (r.bandN - r.bandHealthyN) + (r.fieldN - r.fieldOkN) * FIELD_CELL_WEIGHT + (r.s2Regressions ?? 0) * S2_WEIGHT
    + Math.min(r.reversalsOffRamp, REVERSAL_CAP) + (r.cardHealthy ? 0 : 5);
  return [shortfall, r.cardErr <= CARD_TOL_DEG ? 0 : 1, -(r.tideBandWidthM ?? 0), r.cardErr];
}
export function better(a, b) {
  const ka = rankKey(a), kb = rankKey(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i];
  return false;
}

export function fitSpot(key, { log = null, topK = 20 } = {}) {
  if (!bed.setReefFitOverride) throw new Error('bed.js has no setReefFitOverride — the table path is not built');
  const p = PRESETS[key];
  const crestMin = round(bed.MSL_ABOVE_NAVD88 - CREST_CEIL_EL, 3);
  const crests = ladder(crestMin, CREST_MAX_M, CREST_STEP_COARSE);
  if (crests[crests.length - 1] < CREST_MAX_M - 1e-9) crests.push(CREST_MAX_M);
  const betas = ladder(BETA_MIN, BETA_MAX, BETA_STEP_COARSE);
  const t0 = Date.now();
  const coarse = [];
  for (const c of crests) for (const b of betas) coarse.push(evaluateCandidate(key, c, b));
  if (log) log(`${key}: coarse ${coarse.length} candidates in ${((Date.now() - t0) / 1000).toFixed(0)} s; feasible ${coarse.filter((r) => r.feasible).length}`);
  // the tide band on the best coarse cells (by the cheap key), then refine locally
  const sorted = coarse.slice().sort((a, b) => (better(a, b) ? -1 : better(b, a) ? 1 : 0));
  const heads = sorted.slice(0, topK);
  for (const h of heads) Object.assign(h, evaluateCandidate(key, h.crestDepthM, h.betaDeg, { withTide: true }));
  let best = heads.reduce((q, r) => (better(r, q) ? r : q));
  const fine = [];
  for (const dc of [-0.15, -0.1, -0.05, 0, 0.05, 0.1, 0.15]) for (const db of [-3.75, -2.5, -1.25, 0, 1.25, 2.5, 3.75]) {
    const c = round(best.crestDepthM + dc, 3), b = round(best.betaDeg + db, 3);
    if (c < crestMin - 1e-9 || c > CREST_MAX_M + 1e-9 || b < BETA_MIN || b > BETA_MAX) continue;
    if (dc === 0 && db === 0) continue;
    fine.push(evaluateCandidate(key, c, b, { withTide: true }));
  }
  for (const r of fine) if (better(r, best)) best = r;
  if (log) log(`${key}: best crest ${best.crestDepthM} m, beta ${best.betaDeg}: card ${fmt(best.cardAlpha)} vs ${p.alpha}, band ${best.bandHealthyN}/${best.bandN}, rev ${best.reversalsOffRamp}, tide band ${best.tideBand ? `[${best.tideBand[0]}, ${best.tideBand[1]}]` : 'none'}, field ${best.fieldOkN}/${best.fieldN}, S2 contradicted ${best.s2Contradicted} (shipped ${best.s2Shipped}) (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  bed.setReefFitOverride(p.geoSpot, null);
  return { key, best, coarse: coarse.map((r) => [r.crestDepthM, r.betaDeg, r.cardAlpha, r.bandHealthyN, r.reversalsOffRamp, r.fieldOkN, r.s2Contradicted, r.feasible]),
           heads: heads.map((r) => ({ crestDepthM: r.crestDepthM, betaDeg: r.betaDeg, cardAlpha: r.cardAlpha, bandHealthyN: r.bandHealthyN, reversalsOffRamp: r.reversalsOffRamp, fieldOkN: r.fieldOkN, tideBand: r.tideBand })),
           fine: fine.map((r) => ({ crestDepthM: r.crestDepthM, betaDeg: r.betaDeg, cardAlpha: r.cardAlpha, bandHealthyN: r.bandHealthyN, reversalsOffRamp: r.reversalsOffRamp, fieldOkN: r.fieldOkN, tideBand: r.tideBand })),
           seconds: Math.round((Date.now() - t0) / 1000) };
}

// The digests the table is fitted against: the bed, the presets, the fit code.
export function inputDigests() {
  const sha = (p) => createHash('sha1').update(readFileSync(join(ROOT, p))).digest('hex').slice(0, 16);
  return { 'web-three/js/bed.js': sha('web-three/js/bed.js'), 'web-three/js/dispersion.js': sha('web-three/js/dispersion.js'),
           'web-three/js/peel-geometry.js': sha('web-three/js/peel-geometry.js'), 'shared/params.js': sha('shared/params.js'),
           'data/model/pp_depth_patches.js': sha('data/model/pp_depth_patches.js'), 'data/model/pp_geo_profiles.js': sha('data/model/pp_geo_profiles.js') };
}

export function tableEntry(key, res) {
  const b = res.best;
  return { spot: PRESETS[key].geoSpot, preset: key, crestDepthM: b.crestDepthM, betaDeg: b.betaDeg,
           cardAlphaDeg: b.cardAlpha, targetDeg: PRESETS[key].alpha, cardOnReef: b.cardOnReef,
           bandHealthy: `${b.bandHealthyN}/${b.bandN}`, bandAlphaMinDeg: b.bandAlphaMin, reversalsOffRamp: b.reversalsOffRamp, rampStations: b.rampStations,
           tideBandM: b.tideBand, fieldCells: b.fieldN ? b.fieldCells : undefined, fieldOk: b.fieldN ? `${b.fieldOkN}/${b.fieldN}` : undefined,
           sentinel2: { contradicted: b.s2Contradicted, shipped: b.s2Shipped, h10Offsets: b.s2H10 },
           feasible: b.feasible, zRef: b.zRef, targetEl: b.targetEl };
}

async function main() {
  const mode = flag('mode', 'score');
  const outRel = flag('out', 'qa/reef-fit');
  const outDir = isAbsolute(outRel) ? outRel : join(ROOT, outRel);
  mkdirSync(outDir, { recursive: true });
  const log = (s) => process.stderr.write(s + '\n');
  const arm = flag('reef', '');
  if (arm) { if (!bed.setReefFitMode) throw new Error('--reef needs bed.setReefFitMode'); bed.setReefFitMode(arm); }
  const spots = flag('spots', '') ? flag('spots', '').split(',') : MAPPED;

  if (mode === 'score' || mode === 'parity') {
    const s = scoreAll({ spots, log });
    const tag = flag('tag', s.arm);
    const file = join(outDir, `score.${tag}${BED_SOURCE ? '.' + BED_SOURCE : ''}.json`);
    writeFileSync(file, JSON.stringify(s));
    console.log(scoreMarkdown(s));
    log(`wrote ${file}`);
    if (mode === 'parity') {
      // bit-for-bit against the pre-refit scorecard: composite checksum, fit
      // beta/crest, card alpha, every window rung, the field cells
      const ref = JSON.parse(readFileSync(join(outDir, 'score.pre-refit.json'), 'utf8'));
      let worst = 0; const rows = [];
      for (const key of spots) {
        const a = s.spots[key], b = ref.spots[key];
        const dChk = a.wedge.audit.checksum === b.wedge.audit.checksum ? 0 : 1;
        const dBeta = Math.abs(a.wedge.fit.betaDeg - b.wedge.fit.betaDeg), dCrest = Math.abs(a.wedge.fit.crestDepthM - b.wedge.fit.crestDepthM);
        let dAlpha = Math.abs(a.card.alpha - b.card.alpha);
        for (let i = 0; i < a.window.length; i++) dAlpha = Math.max(dAlpha, Math.abs(a.window[i].alpha - b.window[i].alpha));
        worst = Math.max(worst, dChk, dBeta, dCrest, dAlpha);
        rows.push([key, dChk ? 'DIFFERS' : 'same', dBeta, dCrest, dAlpha]);
      }
      console.log('\n## Parity: this arm vs score.pre-refit.json\n');
      console.log(mdTable(['spot', 'composite checksum', '|d beta|', '|d crest|', 'max |d alpha| (card + window)'], rows));
      console.log(worst === 0 ? '\nPARITY: bit-for-bit' : `\nPARITY FAILED: worst ${worst}`);
      if (worst !== 0) process.exit(2);
    }
    return;
  }

  if (mode === 'fit') {
    const results = {};
    for (const key of spots) results[key] = fitSpot(key, { log });
    const summaryFile = join(outDir, `fit.${spots.join('-')}.json`);
    writeFileSync(summaryFile, JSON.stringify({ generated: new Date().toISOString(), lattice: { crestMinM: round(bed.MSL_ABOVE_NAVD88 - CREST_CEIL_EL, 3), crestMaxM: CREST_MAX_M, crestStep: [CREST_STEP_COARSE, CREST_STEP_FINE], betaRange: [BETA_MIN, BETA_MAX], betaStep: [BETA_STEP_COARSE, BETA_STEP_FINE] }, results }));
    log(`wrote ${summaryFile}`);
    console.log(mdTable(['spot', 'crest m', 'beta', 'card alpha / target', 'on-reef', 'band', 'rev', 'ramp', 'tide band', 'field ok', 'S2 contradicted (shipped)', 'feasible', 's'],
      spots.map((k) => { const b = results[k].best; return [k, b.crestDepthM, b.betaDeg, `${fmt(b.cardAlpha)} / ${PRESETS[k].alpha}`, fmt(b.cardOnReef, 2), `${b.bandHealthyN}/${b.bandN}`, b.reversalsOffRamp, b.rampStations, b.tideBand ? `[${b.tideBand[0]}, ${b.tideBand[1]}]` : 'none', b.fieldN ? `${b.fieldOkN}/${b.fieldN}` : '-', `${b.s2Contradicted} (${b.s2Shipped})`, b.feasible, results[k].seconds]; })));
    if (process.argv.includes('--write')) writeTable(spots.map((k) => [k, results[k]]), log);
  }

  // Assemble the table from per-spot fit files (spots are run as parallel
  // processes, one file each, so no two writers race on the table).
  if (mode === 'table') {
    const pairs = spots.map((k) => [k, JSON.parse(readFileSync(join(outDir, `fit.${k}.json`), 'utf8')).results[k]]);
    writeTable(pairs, log);
  }
}

function writeTable(pairs, log) {
  {
    {
      const tablePath = join(ROOT, 'data/model/pp_reef_fit.json');
      const prev = existsSync(tablePath) ? JSON.parse(readFileSync(tablePath, 'utf8')) : { spots: {} };
      const table = { version: 1, generated: new Date().toISOString().slice(0, 10), instrument: 'scripts/fit_reef.mjs --mode=fit --write',
                      crestCeilEl: round(CREST_CEIL_EL, 3), crestCeilRule: 'MLLW + 0.1 m (bed.js REEF_CREST_CEIL_EL); the wedge never touches a post above the legacy -0.5 m NAVD88 shoreline gate',
                      objective: 'card alpha = target (canonical stage-median signed alpha) within 2 deg; H0 band card x [0.7, 1.3] at tide 0 / card T every rung a peel (alpha >= 10, on-reef >= 0.5); zero clean on-reef off-ramp reversals; Second Peak 2026-08-15 cells alpha >= 30 with Vp in 4.7-6.7 m/s; per-spot Sentinel-2 contradicted count not above the pre-refit count; widest tide band as the secondary. Rank: shortfall (band rung 1, reversal 1 capped at 20, card not a peel 5, field cell 25, Sentinel-2 regression 25), then card within tolerance, then widest tide band, then smallest card error',
                      lattice: { crestMinM: round(bed.MSL_ABOVE_NAVD88 - CREST_CEIL_EL, 3), crestMaxM: CREST_MAX_M, betaRange: [BETA_MIN, BETA_MAX], coarseStep: [CREST_STEP_COARSE, BETA_STEP_COARSE], fineStep: [CREST_STEP_FINE, BETA_STEP_FINE], tideLadder: [TIDE_LADDER_FIT[0], TIDE_LADDER_FIT[TIDE_LADDER_FIT.length - 1], 0.05], bandMults: BAND_MULTS },
                      fittedAgainst: inputDigests(), spots: { ...prev.spots } };
      for (const [key, res] of pairs) table.spots[PRESETS[key].geoSpot] = tableEntry(key, res);
      writeFileSync(tablePath, JSON.stringify(table, null, 1) + '\n');
      log(`wrote ${tablePath}`);
    }
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) await main();
