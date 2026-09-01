// The reef fit's two metrics, measured against each other (2026-09-01).
//
// bed.js reefFitFor() fits the synthetic wedge's strike beta so that an
// UNSIGNED line bearing (atan|mean dz/dx| of the raw seaward-most march over
// the five mid-window stations) hits the preset's alpha target, and reports
// `fitMetric: 'legacy-break-line-bearing', canonicalFitDeferred: true`. The
// runtime judges the wave by the SIGNED crest-relative alpha of the baked,
// selected, slew-clamped line (derivedAlphaDeg / stageAlpha().medianClean).
// This instrument measures the disagreement, reproduces the deferred direct
// refit, and tests objectives that cannot buy magnitude with handedness.
//
// NOTHING SHIPPED IS EDITED. bed.js internals (makeReefFn, marchBreakFn, the
// fit's geometry rules, the caches) are exposed by a node:module LOAD hook that
// appends one export to the module source at load time; the file on disk and
// the shipped path are untouched, and the shipped fit is re-derived and
// compared bit-for-bit at the end of every run (MEASUREMENT_LESSONS 4).
// Candidate reefs are built with the fit's OWN geometry (targetEl, zRef, seed,
// window) at a chosen beta, injected into the fit cache, and run through the
// REAL bake via measure_break_activation.mjs instrumentState(), whose gate
// (replica == bake) runs at every evaluation.
//
// Usage:
//   node scripts/measure_reef_fit_signed.mjs                 # everything, ~6 min
//   node scripts/measure_reef_fit_signed.mjs --mode=disagree # section 1 tables + profiles
//   node scripts/measure_reef_fit_signed.mjs --mode=naive    # the deferred refit, reproduced
//   node scripts/measure_reef_fit_signed.mjs --mode=scan     # beta scan + candidate objectives
//   node scripts/measure_reef_fit_signed.mjs --mode=ladders  # activation / floor per candidate
//   //   node scripts/measure_reef_fit_signed.mjs --mode=shape    # reef extent / wedge shape variants
//   --preset=<key>   --out=qa/reef-fit-signed   --quick (coarser scan, no ladders)
import { registerHooks } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BED_URL = new URL('../web-three/js/bed.js', import.meta.url).href;

// ---------- expose bed.js internals, read-only, at load time ----------
// One appended export. `refrKey` and `breakKey` are module `let`s that only
// the module's own code can assign, so the reset lives inside the appended
// text. invalidateReef() is the bake's own cache reset (fit, u16, tex, cpu,
// breakKey); the refraction key is added because refractionCacheKey() does
// not carry the reef and Psi is integrated over the composite bed.
const INSTRUMENT_EXPORT = `
export const __reefFitInstrument = {
  makeReefFn, marchBreakFn, reefCard, elevGrid, bilinearAt, breakDepthFor, reefWinFor, nameSeed,
  effH0, breakExcess, fitCache,
  REEF_ANCHOR_X, PHI_BREAK_DEG, REEF_CEIL_EL, FIT_DENSE_DX, REEF_FIT_TOL_DEG, REEF_FIT_MAX_ITER,
  MSL_ABOVE_NAVD88,
  resetCaches() { invalidateReef(); refrKey = ''; },
  setFit(name, fit) { invalidateReef(); refrKey = ''; if (fit) fitCache.set(name, fit); },
};
`;
registerHooks({
  load(url, context, nextLoad) {
    const r = nextLoad(url, context);
    if (url === BED_URL) {
      const src = typeof r.source === 'string' ? r.source : Buffer.from(r.source).toString('utf8');
      return { ...r, source: src + INSTRUMENT_EXPORT };
    }
    return r;
  },
});

// The break-field instrument registers the `three` resolve hook and imports
// bed.js; importing it here shares that one module instance.
const I = await import('./measure_break_activation.mjs');
const bed = await import('../web-three/js/bed.js');
const B = bed.__reefFitInstrument;
const { PRESETS, PEEL_FLOOR } = await import('../shared/params.js');
const { PP_DEPTH_DATA } = await import('../data/model/pp_depth_patches.js');

const [X0, X1] = I.X_RANGE;
const HAND = 1;                    // every mapped preset is a right
export const REVERSAL_DEG = I.REVERSAL_DEG;
export const AGREE_TOL_DEG = 5;    // objective 3: legacy vs signed disagreement gate
export const CORRECTION_BOUND_DEG = 10;   // objective 4: bounded correction around the legacy beta
const fmt = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const round = (v, d) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : v);
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

// ---------- candidate reef at a beta, with the fit's own geometry ----------
// Mirrors reefFitFor() up to the root-find: hb, crest depth, targetEl, the
// anchor on the natural h_b contour at REEF_ANCHOR_X, seed, window. At the
// shipped beta this reproduces the shipped reef (checked in gateShipped()).
export function fitGeometry(key) {
  const spot = I.spotOf(key);
  const card = B.reefCard(spot);
  const raw = B.elevGrid(spot, false);
  const hb = B.breakDepthFor(card.H0, card.T);
  const crestDepth = Math.min(Math.max(0.75 * hb, 1.2), 3.0);
  const targetEl = Math.min(B.MSL_ABOVE_NAVD88 - crestDepth, B.REEF_CEIL_EL - 0.2);
  const anchorEl = B.MSL_ABOVE_NAVD88 - hb;
  let zRef = null;
  for (let z = PP_DEPTH_DATA.grid.z0; z <= PP_DEPTH_DATA.grid.z1; z += 2) {
    if (B.bilinearAt(raw, B.REEF_ANCHOR_X, z) >= anchorEl) { zRef = z; break; }
  }
  return { spot, card, raw, hb, targetEl, zRef, seed: B.nameSeed(spot), reefWin: B.reefWinFor(spot) };
}
export function candidateFit(geo, betaDeg, extra = {}) {
  const reefAt = B.makeReefFn(betaDeg, geo.targetEl, geo.zRef, geo.seed, geo.reefWin);
  return { spot: geo.spot, synthetic: true, targetDeg: geo.card.alphaDeg, betaDeg,
           fitMetric: extra.fitMetric || 'instrument-candidate', canonicalFitDeferred: false,
           targetEl: geo.targetEl, zRef: geo.zRef, hbM: geo.hb, reefAt, stations: 0, iterations: 0,
           fitDerivedDeg: NaN, residualDeg: NaN, withinTol: false, signViolations: 0, directionOk: true, ...extra };
}
// The legacy objective, replicated: raw seaward-most march on raw+candidate at
// the five mid-window stations, atan|mean slope| by least squares, plus the
// sign-violation count. Checked against fit.fitDerivedDeg at the shipped beta.
export function legacyBearing(geo, reefAt) {
  const rawAt = (x, z) => B.bilinearAt(geo.raw, x, z);
  const elevAt = (x, z) => { const em = rawAt(x, z); return em + reefAt(x, z, em); };
  const xs = [-16, -8, 0, 8, 16];
  const zs = xs.map((x) => B.marchBreakFn(elevAt, x, geo.card.H0, geo.card.T));
  const xm = xs.reduce((q, v) => q + v, 0) / xs.length;
  let sxz = 0, sxx = 0;
  for (let i = 0; i < xs.length; i++) { sxz += (xs[i] - xm) * zs[i]; sxx += (xs[i] - xm) ** 2; }
  const slope = sxz / sxx, dir = Math.sign(slope) || 1;
  let viol = 0;
  for (let i = 1; i < zs.length; i++) if (Math.sign((zs[i] - zs[i - 1]) / (xs[i] - xs[i - 1])) !== dir) viol++;
  return { bearingDeg: Math.atan(Math.abs(slope)) * 180 / Math.PI, signedBearingDeg: Math.atan(slope) * 180 / Math.PI, slope, viol, zs };
}

// ---------- per-station profile of one baked state ----------
// x, z, signed alpha, pinned (stageAlpha's backward slope), gap flag (the
// bake's own B channel), on-reef (line on the uplift footprint), depth, local
// unsigned bearing atan|dz/dx| with derivedPeelGeometry's stencil, stage
// fraction, fit-window membership, gap adjacency.
export function stationProfile(inst) {
  const { xs, real, basis } = inst;
  const { lo, hi } = I.stageOf(inst.key);
  const st = I.stageStats(real.z, real.alpha, xs);
  const e = 3 * (X1 - X0) / I.BREAK_N;
  const zLine = (x) => I.lineAt(inst.sel.z, x);
  const rows = xs.map((x, k) => {
    const i = Math.round(((x - X0) / (X1 - X0)) * (I.BREAK_N - 1));
    const s = basis.stations[i];
    const j = Math.round((real.z[k] - s.zs[0]) / I.MARCH_DZ);
    const onReef = j >= 0 && j < s.uplift.length && s.uplift[j] === 1;
    const depth = s.depth[Math.min(Math.max(j, 0), s.depth.length - 1)];
    const dzdx = (zLine(x + e) - zLine(x - e)) / (2 * e);
    const a = real.alpha[k];
    const clean = !st.pinned[k];
    const reversed = clean && Number.isFinite(a) && Math.abs(a) > REVERSAL_DEG && Math.sign(a) !== HAND;
    return { x, z: real.z[k], alpha: a, pinned: st.pinned[k], gap: real.gap[k] === 1, onReef, depth,
             legacyLocalDeg: Math.atan(Math.abs(dzdx)) * 180 / Math.PI, dzdx,
             u: (x - lo) / (hi - lo), inFit: Math.abs(x) <= 16, clean, reversed, reversedOnReef: reversed && onReef };
  });
  // gap adjacency: within 2 stations (4 m) of a pinned or gap-flagged station
  for (let k = 0; k < rows.length; k++) {
    let adj = false;
    for (let m = Math.max(0, k - 2); m <= Math.min(rows.length - 1, k + 2); m++) if (rows[m].pinned || rows[m].gap) adj = true;
    rows[k].gapAdjacent = adj;
  }
  // ramp membership: a maximal contiguous run of stations whose dz/dx has one
  // sign and which contains at least one pinned or gap-flagged station is a
  // slew ramp (a branch teleport turned into a line). Its clean shoulders are
  // what the reversal count sees; classifying them separates "the line peels
  // the wrong way here" from "the line is changing branch here".
  let k0 = 0;
  while (k0 < rows.length) {
    let k1 = k0;
    while (k1 + 1 < rows.length && Math.sign(rows[k1 + 1].dzdx) === Math.sign(rows[k0].dzdx)) k1++;
    let hasGap = false;
    for (let m = k0; m <= k1; m++) if (rows[m].pinned || rows[m].gap) hasGap = true;
    for (let m = k0; m <= k1; m++) rows[m].rampMember = hasGap;
    k0 = k1 + 1;
  }
  return rows;
}
// The reductions a table row needs, from one profile.
export function profileStats(rows, fit) {
  const clean = rows.filter((r) => r.clean);
  const onReefClean = clean.filter((r) => r.onReef);
  const fitWin = clean.filter((r) => r.inFit);
  // fit-style unsigned bearing on the baked line: atan|mean slope| over |x|<=16
  const fw = rows.filter((r) => r.inFit);
  const xm = fw.reduce((q, r) => q + r.x, 0) / Math.max(fw.length, 1);
  let sxz = 0, sxx = 0;
  for (const r of fw) { sxz += (r.x - xm) * r.z; sxx += (r.x - xm) ** 2; }
  const bakedWindowBearing = sxx > 0 ? Math.atan(Math.abs(sxz / sxx)) * 180 / Math.PI : NaN;
  const rev = clean.filter((r) => r.reversed);
  const revOn = rev.filter((r) => r.onReef);
  const third = (r) => (r.u < 1 / 3 ? 'up' : r.u < 2 / 3 ? 'mid' : 'down');
  const where = { up: 0, mid: 0, down: 0, offReef: 0, gapAdjacent: 0, ramp: 0, rampOnReef: 0, inFit: 0 };
  for (const r of rev) {
    where[third(r)]++; if (!r.onReef) where.offReef++; if (r.gapAdjacent) where.gapAdjacent++;
    if (r.rampMember) { where.ramp++; if (r.onReef) where.rampOnReef++; } if (r.inFit) where.inFit++;
  }
  // contiguous reversed runs (clean stations), as x-intervals
  const runs = [];
  let cur = null;
  for (const r of rows) {
    if (r.reversed) { if (cur && r.x - cur.x1 <= I.READBACK_DX + 1e-9) { cur.x1 = r.x; cur.n++; cur.on += r.onReef ? 1 : 0; } else { cur = { x0: r.x, x1: r.x, n: 1, on: r.onReef ? 1 : 0 }; runs.push(cur); } }
  }
  return {
    stations: rows.length, cleanN: clean.length, pinnedN: rows.length - clean.length, gapN: rows.filter((r) => r.gap).length,
    medianClean: median(clean.map((r) => r.alpha)),
    medianCleanOnReef: median(onReefClean.map((r) => r.alpha)),
    medianCleanOffReef: median(clean.filter((r) => !r.onReef).map((r) => r.alpha)),
    inFitMedian: median(fitWin.map((r) => r.alpha)),
    onReefFrac: rows.filter((r) => r.onReef).length / rows.length,
    reversals: revOn.length, reversalsAll: rev.length, where, runs,
    // the same reductions with slew-ramp stations excluded from the domain
    reversalsNoRamp: revOn.filter((r) => !r.rampMember).length,
    medianCleanNoRamp: median(clean.filter((r) => !r.rampMember).map((r) => r.alpha)),
    medianCleanOnReefNoRamp: median(onReefClean.filter((r) => !r.rampMember).map((r) => r.alpha)),
    rampStations: rows.filter((r) => r.rampMember).length,
    offReefStations: rows.filter((r) => !r.onReef).length,
    legacyMedianLocal: median(clean.map((r) => r.legacyLocalDeg)),
    bakedWindowBearing,
    fitDerivedDeg: fit?.fitDerivedDeg ?? NaN, betaDeg: fit?.betaDeg ?? NaN, targetDeg: fit?.targetDeg ?? NaN,
  };
}

// ---------- evaluate one (spot, beta) at one state through the real bake ----------
// Injects the candidate, runs instrumentState (field -> replica -> bake ->
// gate), reads the profile. The gate must be zero here exactly as on the
// shipped fit; a candidate that broke the replica would be reported, not used.
export function evalCandidate(key, geo, betaDeg, state = I.cardOf(key)) {
  const fit = candidateFit(geo, betaDeg);
  B.setFit(geo.spot, fit);
  const inst = I.instrumentState(key, state);
  const g = inst.gate;
  if (g.maxDzM > 0 || g.gapMismatch > 0 || g.alphaMaxAbsDiff > 0 || g.latticeMismatch > 0) {
    throw new Error(`${key} beta ${betaDeg}: gate broke (dz ${g.maxDzM}, gap ${g.gapMismatch}, alpha ${g.alphaMaxAbsDiff})`);
  }
  const rows = stationProfile(inst);
  const leg = legacyBearing(geo, fit.reefAt);
  const stats = profileStats(rows, { ...fit, fitDerivedDeg: leg.bearingDeg });
  return { betaDeg, fit, inst, rows, stats, legacy: leg };
}
export function restoreShipped(spot) {
  bed.setReefFlank(bed.REEF_FLANK_DEFAULT); bed.setReefAmp(bed.REEF_AMP_DEFAULT);   // shape probes must not leak
  B.resetCaches(); return bed.reefFitFor(spot);
}

// ---------- the shipped path, gated ----------
// Records the shipped fit and card line before any injection; after every
// section restoreShipped() re-derives the fit and the line must be identical.
const shippedRef = new Map();
export function gateShipped(key, phase) {
  const spot = I.spotOf(key);
  const fit = restoreShipped(spot);
  const inst = I.instrumentState(key, I.cardOf(key));
  const audit = bed.reefAudit(spot);
  const sig = { betaDeg: fit.betaDeg, fitDerivedDeg: fit.fitDerivedDeg, iterations: fit.iterations,
                checksum: audit.checksum, z: inst.real.z.map((v) => v.toFixed(6)).join(','),
                alpha: inst.real.alpha.map((v) => (Number.isFinite(v) ? v.toFixed(6) : 'nan')).join(','),
                gap: inst.real.gap.join('') };
  if (!shippedRef.has(key)) { shippedRef.set(key, sig); return { ok: true, phase, first: true }; }
  const ref = shippedRef.get(key);
  const diffs = Object.keys(ref).filter((k) => ref[k] !== sig[k]);
  if (diffs.length) throw new Error(`${key}: shipped path changed after ${phase}: ${diffs.join(', ')}`);
  return { ok: true, phase };
}
// The candidate constructor reproduces the shipped reef at the shipped beta:
// same composite checksum, same line, same legacy bearing.
export function gateCandidateConstructor(key) {
  const spot = I.spotOf(key);
  const shipped = restoreShipped(spot);
  const ref = shippedRef.get(key);
  const geo = fitGeometry(key);
  const ev = evalCandidate(key, geo, shipped.betaDeg);
  const audit = bed.reefAudit(spot);
  const out = { zRefSame: geo.zRef === shipped.zRef, targetElSame: Math.abs(geo.targetEl - shipped.targetEl) < 1e-12,
                checksumSame: audit.checksum === ref.checksum,
                lineSame: ev.inst.real.z.map((v) => v.toFixed(6)).join(',') === ref.z,
                legacySame: Math.abs(ev.legacy.bearingDeg - shipped.fitDerivedDeg) < 1e-9,
                legacyDeg: ev.legacy.bearingDeg, shippedFitDeg: shipped.fitDerivedDeg };
  restoreShipped(spot);
  if (!Object.values(out).every((v) => v !== false)) throw new Error(`${key}: candidate constructor does not reproduce the shipped reef: ${JSON.stringify(out)}`);
  return out;
}

// ---------- section 1: the disagreement, at card and along the ladder ----------
export function disagreeCard(key) {
  const spot = I.spotOf(key);
  const fit = restoreShipped(spot);
  const inst = I.instrumentState(key, I.cardOf(key));
  const rows = stationProfile(inst);
  const stats = profileStats(rows, fit);
  const legacySigned = legacyBearing(fitGeometry(key), fit.reefAt).signedBearingDeg;
  return { key, label: PRESETS[key].label, card: I.cardOf(key), stats, rows, legacySigned, fit: {
    betaDeg: fit.betaDeg, fitDerivedDeg: fit.fitDerivedDeg, signViolations: fit.signViolations, iterations: fit.iterations,
    residualDeg: fit.residualDeg, fitMetric: fit.fitMetric } };
}
export function disagreeLadder(key, { step = 0.01 } = {}) {
  const spot = I.spotOf(key);
  const fit = restoreShipped(spot);
  const card = I.cardOf(key);
  const floor = PEEL_FLOOR[key]?.floorH0 ?? 0.4;
  const basis = I.fieldBasis(key, { T: card.T, tide: 0 });
  const rungs = [];
  for (let h = floor; h <= card.H0 + 1e-9; h = Math.round((h + step) * 10000) / 10000) {
    const inst = I.instrumentState(key, { H0: h, T: card.T, tide: 0 }, basis);
    const rows = stationProfile(inst);
    const s = profileStats(rows, fit);
    rungs.push({ H0: round(h, 4), legacyMedianLocal: s.legacyMedianLocal, bakedWindowBearing: s.bakedWindowBearing,
                 medianClean: s.medianClean, medianCleanOnReef: s.medianCleanOnReef, medianCleanOnReefNoRamp: s.medianCleanOnReefNoRamp, onReefFrac: s.onReefFrac,
                 reversals: s.reversals, reversalsAll: s.reversalsAll, reversalsNoRamp: s.reversalsNoRamp, pinnedN: s.pinnedN, rampStations: s.rampStations, where: s.where });
  }
  if (rungs[rungs.length - 1].H0 !== card.H0) {
    const inst = I.instrumentState(key, card, basis);
    const s = profileStats(stationProfile(inst), fit);
    rungs.push({ H0: card.H0, legacyMedianLocal: s.legacyMedianLocal, bakedWindowBearing: s.bakedWindowBearing,
                 medianClean: s.medianClean, medianCleanOnReef: s.medianCleanOnReef, medianCleanOnReefNoRamp: s.medianCleanOnReefNoRamp, onReefFrac: s.onReefFrac,
                 reversals: s.reversals, reversalsAll: s.reversalsAll, reversalsNoRamp: s.reversalsNoRamp, pinnedN: s.pinnedN, rampStations: s.rampStations, where: s.where });
  }
  return { key, floor, card, rungs };
}

// ---------- section 2a: the deferred refit, reproduced ----------
// reefFitFor()'s own root-finder (seed alpha_target - PHI_BREAK, second probe
// +-8 deg, false position when bracketed, 20 deg step cap, 14 evaluations,
// 1 deg tolerance, best-so-far) with the objective swapped for a SIGNED
// readout of the fully baked line at the card state:
//   'stage'  stage-median clean signed alpha  (stageAlpha().medianClean)
//   'infit'  clean signed alpha over |x| <= 16 (stageAlpha().inFit)
// Every evaluation is recorded so the path through beta is visible.
export function naiveCanonicalFit(key, geo, objective = 'stage') {
  const target = geo.card.alphaDeg;
  const readout = (ev) => (objective === 'infit' ? ev.stats.inFitMedian : ev.stats.medianClean);
  const trace = [];
  const evaluate = (b) => {
    const ev = evalCandidate(key, geo, b);
    const v = readout(ev);
    trace.push({ betaDeg: round(b, 3), value: round(v, 2), medianClean: round(ev.stats.medianClean, 2),
                 onReefFrac: round(ev.stats.onReefFrac, 3), reversals: ev.stats.reversals, pinnedN: ev.stats.pinnedN,
                 legacyDeg: round(ev.legacy.bearingDeg, 2) });
    return { value: Number.isFinite(v) ? v : -90, ev };
  };
  let best = null, bestErr = Infinity;
  const record = (b, r) => { const e = Math.abs(r.value - target); if (e < bestErr) { bestErr = e; best = { betaDeg: b, ...r }; } };
  let b0 = Math.min(Math.max(target - B.PHI_BREAK_DEG, 3), 80);
  let r0 = evaluate(b0); let iterations = 1; record(b0, r0);
  let f0 = r0.value - target;
  let b1 = Math.min(Math.max(b0 - Math.sign(f0) * 8, 3), 80);
  let r1 = evaluate(b1); iterations++; record(b1, r1);
  let f1 = r1.value - target;
  while (iterations < B.REEF_FIT_MAX_ITER && bestErr > B.REEF_FIT_TOL_DEG) {
    let b2;
    if (f0 * f1 < 0) {
      b2 = b1 - f1 * (b1 - b0) / (f1 - f0);
      const lo = Math.min(b0, b1), hi = Math.max(b0, b1);
      if (!(b2 > lo && b2 < hi) || !Number.isFinite(b2)) b2 = 0.5 * (lo + hi);
    } else {
      const denom = f1 - f0;
      b2 = Math.abs(denom) < 1e-6 ? b1 - Math.sign(f1) * 8 : b1 - f1 * (b1 - b0) / denom;
      if (!Number.isFinite(b2)) b2 = b1 - Math.sign(f1) * 8;
      b2 = b1 + Math.min(Math.max(b2 - b1, -20), 20);
    }
    b2 = Math.min(Math.max(b2, 3), 80);
    if (Math.abs(b2 - b1) < 1e-3) break;
    const r2 = evaluate(b2); iterations++; record(b2, r2);
    const f2 = r2.value - target;
    if (f0 * f1 < 0 && f1 * f2 < 0) { b0 = b1; f0 = f1; }
    else if (f0 * f1 < 0) { /* keep the opposite bracket */ }
    else { b0 = b1; f0 = f1; }
    b1 = b2; f1 = f2;
  }
  const s = best.ev.stats;
  return { key, objective, target, betaDeg: best.betaDeg, value: best.value, iterations, converged: bestErr <= B.REEF_FIT_TOL_DEG,
           stats: { medianClean: s.medianClean, medianCleanOnReef: s.medianCleanOnReef, inFitMedian: s.inFitMedian,
                    onReefFrac: s.onReefFrac, reversals: s.reversals, reversalsAll: s.reversalsAll, pinnedN: s.pinnedN,
                    where: s.where, runs: s.runs, legacyDeg: best.ev.legacy.bearingDeg },
           trace, rows: best.ev.rows };
}

// ---------- section 2b: the beta scan and the candidate objectives ----------
export function scanBeta(key, geo, { lo = 3, hi = 80, step = 1 } = {}) {
  const out = [];
  for (let b = lo; b <= hi + 1e-9; b = Math.round((b + step) * 1000) / 1000) {
    const ev = evalCandidate(key, geo, b);
    const s = ev.stats;
    out.push({ betaDeg: b, legacyDeg: ev.legacy.bearingDeg, legacySignedDeg: ev.legacy.signedBearingDeg, legacyViol: ev.legacy.viol,
               medianClean: s.medianClean, medianCleanOnReef: s.medianCleanOnReef, medianCleanNoRamp: s.medianCleanNoRamp,
               medianCleanOnReefNoRamp: s.medianCleanOnReefNoRamp, reversalsNoRamp: s.reversalsNoRamp, inFitMedian: s.inFitMedian,
               rampStations: s.rampStations, offReefStations: s.offReefStations,
               onReefFrac: s.onReefFrac, reversals: s.reversals, reversalsAll: s.reversalsAll, pinnedN: s.pinnedN, gapN: s.gapN,
               where: s.where });
  }
  return out;
}
// Refine around a coarse optimum: re-scan [b - step, b + step] at step/4.
function refineAround(key, geo, b, step, score) {
  const fine = scanBeta(key, geo, { lo: Math.max(3, b - step), hi: Math.min(80, b + step), step: step / 4 });
  let best = null;
  for (const r of fine) { const sc = score(r); if (sc !== null && (best === null || sc < best.sc)) best = { sc, r }; }
  return best ? best.r : null;
}
// The objectives, read off one scan of the same field.
//   O2 on-reef signed median, hard penalty on ANY on-reef reversal (infeasible),
//      and >= 50% of the stage on the reef (the floor's own reef condition)
//   O3 legacy fit (|legacy - target| <= tol) that ALSO agrees with the signed
//      stage median within AGREE_TOL_DEG; report the closest if none
//   O4 two-stage: legacy beta, then |beta - beta_L| <= CORRECTION_BOUND_DEG
//      minimising |signed - target| without adding reversals (<= shipped count)
export function objectivesFromScan(key, geo, scan, shippedBeta, shippedStats, step) {
  const target = geo.card.alphaDeg;
  const sc2 = (r) => (r.reversals === 0 && r.onReefFrac >= I.ON_REEF_MIN && Number.isFinite(r.medianCleanOnReef)
    ? Math.abs(r.medianCleanOnReef - target) : null);
  const feasible2 = scan.filter((r) => sc2(r) !== null);
  let o2 = null;
  if (feasible2.length) {
    const c = feasible2.reduce((b, r) => (sc2(r) < sc2(b) ? r : b));
    o2 = { feasible: true, feasibleBetas: feasible2.map((r) => r.betaDeg), coarse: c, best: refineAround(key, geo, c.betaDeg, step, sc2) || c };
  } else {
    const minRev = Math.min(...scan.map((r) => r.reversals));
    const c = scan.filter((r) => r.reversals === minRev).reduce((b, r) => (Math.abs(r.medianCleanOnReef - target) < Math.abs(b.medianCleanOnReef - target) ? r : b));
    o2 = { feasible: false, minReversals: minRev, coarse: c, best: c };
  }
  // O2': the same objective with slew-ramp stations excluded from the domain
  // (a branch change is a section gap, not a peel). Tests whether the reversal
  // gate is unsatisfiable because of handedness or because of ramps.
  const sc2r = (r) => (r.reversalsNoRamp === 0 && r.onReefFrac >= I.ON_REEF_MIN && Number.isFinite(r.medianCleanOnReefNoRamp)
    ? Math.abs(r.medianCleanOnReefNoRamp - target) : null);
  const feasible2r = scan.filter((r) => sc2r(r) !== null);
  let o2r = null;
  if (feasible2r.length) {
    const c = feasible2r.reduce((b, r) => (sc2r(r) < sc2r(b) ? r : b));
    o2r = { feasible: true, feasibleBetas: feasible2r.map((r) => r.betaDeg), coarse: c, best: refineAround(key, geo, c.betaDeg, step, sc2r) || c };
  } else {
    const minRev = Math.min(...scan.map((r) => r.reversalsNoRamp));
    const c = scan.filter((r) => r.reversalsNoRamp === minRev).reduce((b, r) => (Math.abs(r.medianCleanOnReefNoRamp - target) < Math.abs(b.medianCleanOnReefNoRamp - target) ? r : b));
    o2r = { feasible: false, minReversals: minRev, coarse: c, best: c };
  }
  // O3: legacy roots. The legacy bearing is continuous in beta; find the coarse
  // rungs where |legacy - target| is minimal, refine, then apply the gate.
  const sc3fit = (r) => Math.abs(r.legacyDeg - target);
  const legacyRoots = [];
  for (let i = 0; i < scan.length; i++) {
    const r = scan[i];
    const prev = scan[i - 1], next = scan[i + 1];
    const isMin = (!prev || sc3fit(prev) >= sc3fit(r)) && (!next || sc3fit(next) > sc3fit(r));
    if (isMin && sc3fit(r) <= 3) legacyRoots.push(refineAround(key, geo, r.betaDeg, step, sc3fit) || r);
  }
  const o3 = { roots: legacyRoots.map((r) => ({ ...r, disagreeDeg: r.medianClean - r.legacyDeg,
                 passes: Math.abs(r.legacyDeg - target) <= B.REEF_FIT_TOL_DEG && Math.abs(r.medianClean - r.legacyDeg) <= AGREE_TOL_DEG })) };
  o3.pass = o3.roots.find((r) => r.passes) || null;
  // O4: bounded correction around the shipped legacy beta.
  const inBound = (r) => Math.abs(r.betaDeg - shippedBeta) <= CORRECTION_BOUND_DEG;
  const sc4 = (r) => (inBound(r) && r.reversals <= shippedStats.reversals && Number.isFinite(r.medianClean) ? Math.abs(r.medianClean - target) : null);
  const sc4free = (r) => (inBound(r) && Number.isFinite(r.medianClean) ? Math.abs(r.medianClean - target) : null);
  const pick = (score) => {
    const f = scan.filter((r) => score(r) !== null);
    if (!f.length) return null;
    const c = f.reduce((b, r) => (score(r) < score(b) ? r : b));
    return refineAround(key, geo, c.betaDeg, step, score) || c;
  };
  const o4 = { bounded: pick(sc4), boundedFree: pick(sc4free) };
  // O5: the legacy objective with its sign kept, atan(mean slope) = +target.
  // The smallest possible change to the shipped fit: a seaward-running window
  // line can no longer satisfy it.
  const sc5 = (r) => Math.abs(r.legacySignedDeg - target);
  const roots5 = [];
  for (let i = 0; i < scan.length; i++) {
    const r = scan[i], prev = scan[i - 1], next = scan[i + 1];
    const isMin = (!prev || sc5(prev) >= sc5(r)) && (!next || sc5(next) > sc5(r));
    if (isMin && sc5(r) <= 3) roots5.push(refineAround(key, geo, r.betaDeg, step, sc5) || r);
  }
  const o5 = { roots: roots5, best: roots5.length ? roots5.reduce((b, r) => (sc5(r) < sc5(b) ? r : b)) : null };
  return { target, o2, o2r, o3, o4, o5 };
}

// ---------- section 2c: ladder metrics for one candidate ----------
// Activation H0 (selector-free), PEEL_FLOOR-style floor rung and largest flip,
// all with the candidate injected; then the shipped fit is restored and gated.
export function ladderFor(key, geo, betaDeg, label) {
  const spot = I.spotOf(key);
  const card = I.cardOf(key);
  if (geo.shape) { bed.setReefFlank(geo.shape.flank); bed.setReefAmp(geo.shape.amp); }
  if (betaDeg === null) { B.setFit(spot, null); restoreShipped(spot); } else B.setFit(spot, candidateFit(geo, betaDeg));
  const act = I.reefActivationH0(key, { T: card.T, tide: 0 });
  const floor = I.measurePeelFloor(key, { handSign: HAND });
  const cardEv = I.repSummary(I.instrumentState(key, card), HAND).shipped;
  restoreShipped(spot);
  return { key, label, betaDeg, activationH0: act.H0, fMaxReefAtCard: act.fMaxReefAtCard,
           floorH0: floor.floorH0 ?? null, floorNote: floor.note ?? null, alphaBelow: floor.alphaBelow ?? null, alphaAbove: floor.alphaAbove ?? null,
           flips: floor.flips.map((f) => ({ from: f.from, to: f.to, dzMax: round(f.dzMax, 1) })),
           largestFlip: floor.largestFlip ? { from: floor.largestFlip.from, to: floor.largestFlip.to, dzMax: round(floor.largestFlip.dzMax, 1) } : null,
           worstGate: floor.worstGate,
           cardAlpha: cardEv.medianClean, cardOnReef: cardEv.onReefFrac, cardReversals: cardEv.reversals };
}

// ---------- section 3: reef extent and wedge shape ----------
// Is the shortfall the strike (beta), the wedge (flank, amplitude) or the reef's
// along-shore EXTENT (the window whose 35%/75 m feathers sit inside the stage)?
// Variants are evaluated with the same instrument; the window variant moves
// the feathers OUTSIDE the stage so the plateau covers it (extent, not
// amplitude). A coarse beta scan per variant; report the beta that best hits
// the signed stage-median target with zero off-ramp on-reef reversals, the
// max signed alpha reachable, and the ramp/off-reef station counts.
export const SHAPE_VARIANTS = [
  { label: 'shipped', ext: 0, flank: 80, amp: 3.2 },
  { label: 'window: plateau covers stage', ext: 'feather', flank: 80, amp: 3.2 },
  { label: 'flank 120', ext: 0, flank: 120, amp: 3.2 },
  { label: 'amp 6.0', ext: 0, flank: 80, amp: 6.0 },
  { label: 'window + flank 120', ext: 'feather', flank: 120, amp: 3.2 },
  { label: 'window + flank 120 + amp 6.0', ext: 'feather', flank: 120, amp: 6.0 },
];
export function geoWithVariant(key, v) {
  bed.setReefFlank(v.flank); bed.setReefAmp(v.amp);
  const geo = fitGeometry(key);
  geo.shape = { flank: v.flank, amp: v.amp };
  if (v.ext === 'feather') {
    const [a, b, c, d] = geo.reefWin;
    const f = b - a;
    geo.reefWin = [a - f, a, d, d + f];
  } else if (Number.isFinite(v.ext) && v.ext !== 0) {
    const [a, b, c, d] = geo.reefWin;
    geo.reefWin = [a - v.ext, b - v.ext, c + v.ext, d + v.ext];
  }
  return geo;
}
export function shapeProbe(key, { step = 2 } = {}) {
  const target = PRESETS[key].alpha;
  const out = [];
  for (const v of SHAPE_VARIANTS) {
    const geo = geoWithVariant(key, v);
    const scan = scanBeta(key, geo, { step });
    const sc = (r) => Math.abs(r.medianClean - target);
    const feas = scan.filter((r) => r.reversalsNoRamp === 0 && r.onReefFrac >= I.ON_REEF_MIN);
    const bestAny = scan.reduce((b, r) => (sc(r) < sc(b) ? r : b));
    const bestFeas = feas.length ? refineAround(key, geo, feas.reduce((b, r) => (sc(r) < sc(b) ? r : b)).betaDeg, step, (r) => (r.reversalsNoRamp === 0 && r.onReefFrac >= I.ON_REEF_MIN ? sc(r) : null)) : null;
    const strictFeas = scan.filter((r) => r.reversals === 0 && r.onReefFrac >= I.ON_REEF_MIN);
    const bestStrict = strictFeas.length ? strictFeas.reduce((b, r) => (sc(r) < sc(b) ? r : b)) : null;
    const pickRow = bestFeas || bestAny;
    B.setFit(geo.spot, candidateFit(geo, pickRow.betaDeg));
    const act = I.reefActivationH0(key, { T: PRESETS[key].T, tide: 0 });
    out.push({ variant: v, reefWin: geo.reefWin, target, scan,
               bestAny: { ...bestAny }, bestFeasible: bestFeas ? { ...bestFeas } : null, bestStrict: bestStrict ? { ...bestStrict } : null,
               activationAtPick: act.H0,
               maxSigned: Math.max(...scan.map((r) => r.medianClean)),
               minRampStations: Math.min(...scan.map((r) => r.rampStations)),
               minOffReefStations: Math.min(...scan.map((r) => r.offReefStations)),
               minReversals: Math.min(...scan.map((r) => r.reversals)), minReversalsNoRamp: Math.min(...scan.map((r) => r.reversalsNoRamp)) });
    restoreShipped(geo.spot);
  }
  return out;
}

// ---------- tables ----------
function mdTable(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}
function whereStr(w) { return `up ${w.up} / mid ${w.mid} / down ${w.down}; off-reef ${w.offReef}; on ramp ${w.ramp} (${w.rampOnReef} on reef); in-fit ${w.inFit}`; }

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
    const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v];
  }));
  const mode = flags.mode || 'all';
  const quick = !!flags.quick;
  const presets = flags.preset && flags.preset !== 'all' ? [flags.preset] : I.MAPPED;
  const outDir = isAbsolute(flags.out || '') ? flags.out : join(ROOT, flags.out || 'qa/reef-fit-signed');
  mkdirSync(outDir, { recursive: true });
  const log = (s) => process.stderr.write(s + '\n');
  const summary = { measured: new Date().toISOString().slice(0, 10), presets, spots: {} };
  const md = [];

  // gate 0: the shipped path recorded, the candidate constructor checked
  for (const key of presets) {
    gateShipped(key, 'start');
    const g = gateCandidateConstructor(key);
    summary.spots[key] = { constructorGate: g, label: PRESETS[key].label, target: PRESETS[key].alpha };
    log(`${key}: constructor gate ok (legacy ${g.legacyDeg.toFixed(3)} == fit ${g.shippedFitDeg.toFixed(3)})`);
  }

  if (mode === 'all' || mode === 'disagree') {
    md.push('## 1. Card state: the two metrics on the shipped fit');
    const rows = [];
    for (const key of presets) {
      const d = disagreeCard(key);
      const s = d.stats;
      summary.spots[key].card = { fit: d.fit, stats: { ...s, runs: s.runs } };
      writeFileSync(join(outDir, `${key}_card.profile.csv`),
        'x,z,alpha,pinned,gap,onReef,depth,legacyLocalDeg,dzdx,u,inFit,clean,reversed,ramp\n'
        + d.rows.map((r) => [round(r.x, 1), r.z.toFixed(3), Number.isFinite(r.alpha) ? r.alpha.toFixed(3) : 'nan', +r.pinned, +r.gap, +r.onReef,
                              r.depth.toFixed(3), r.legacyLocalDeg.toFixed(3), r.dzdx.toFixed(5), r.u.toFixed(3), +r.inFit, +r.clean, +r.reversed, +r.rampMember].join(',')).join('\n') + '\n');
      rows.push([d.label, d.card.H0, s.targetDeg, fmt(d.fit.betaDeg), `${fmt(d.fit.fitDerivedDeg)} (${d.fit.signViolations})`, fmt(d.legacySigned), fmt(s.bakedWindowBearing), fmt(s.legacyMedianLocal),
                 fmt(s.medianClean), fmt(s.medianCleanOnReef), fmt(s.medianCleanOnReefNoRamp), fmt(s.medianCleanOffReef), fmt(s.inFitMedian), fmt(s.onReefFrac, 2), `${s.reversals} (${s.reversalsAll}; ${s.reversalsNoRamp} off-ramp)`, `${s.pinnedN} / ${s.rampStations}`,
                 whereStr(s.where), s.runs.map((r) => `[${round(r.x0, 1)},${round(r.x1, 1)}]×${r.n}${r.on < r.n ? `(${r.on} on)` : ''}`).join(' ')]);
      log(`${key}: card legacy ${fmt(d.fit.fitDerivedDeg)} signed ${fmt(s.medianClean)} on-reef ${fmt(s.medianCleanOnReef)} rev ${s.reversals}`);
      gateShipped(key, 'disagree-card');
    }
    md.push(mdTable(['spot', 'card H0', 'target', 'β°', 'fit legacy ° (viol)', 'fit mean slope, signed °', 'baked window bearing °', 'stage median atan|dz/dx| °',
                     'signed clean median °', 'signed on-reef °', 'on-reef, no ramp °', 'signed off-reef °', 'signed in-fit °', 'on-reef', 'rev on-reef (all; off-ramp)', 'pinned / ramp',
                     'where the reversals sit', 'reversed runs x [m] × stations'], rows));
    md.push('\n## 1b. The H0 ladder, floor to card (tide 0, card T), shipped fit');
    for (const key of presets) {
      const L = disagreeLadder(key, { step: 0.01 });
      summary.spots[key].ladder = L;
      writeFileSync(join(outDir, `${key}_ladder.json`), JSON.stringify(L));
      const pick = L.rungs.filter((r, i) => i === 0 || i === L.rungs.length - 1 || Math.abs((r.H0 * 100) % 5) < 1e-6);
      md.push(`\n### ${PRESETS[key].label} — floor ${L.floor} → card ${L.card.H0} m (target ${PRESETS[key].alpha}°)`);
      md.push(mdTable(['H0', 'stage median atan|dz/dx| °', 'baked window bearing °', 'signed clean median °', 'signed on-reef °', 'on-reef, no ramp °', 'on-reef', 'rev on-reef (all; off-ramp)', 'pinned / ramp', 'where'],
        pick.map((r) => [r.H0, fmt(r.legacyMedianLocal), fmt(r.bakedWindowBearing), fmt(r.medianClean), fmt(r.medianCleanOnReef), fmt(r.medianCleanOnReefNoRamp), fmt(r.onReefFrac, 2), `${r.reversals} (${r.reversalsAll}; ${r.reversalsNoRamp})`, `${r.pinnedN} / ${r.rampStations}`, whereStr(r.where)])));
      log(`${key}: ladder ${L.rungs.length} rungs`);
      gateShipped(key, 'disagree-ladder');
    }
  }

  if (mode === 'all' || mode === 'naive') {
    md.push('\n## 2a. The deferred direct refit, reproduced (reefFitFor root-finder, signed objective)');
    const rows = [];
    for (const key of presets) {
      const geo = fitGeometry(key);
      const shipped = restoreShipped(geo.spot);
      const shippedEv = evalCandidate(key, geo, shipped.betaDeg);
      for (const obj of ['stage', 'infit']) {
        const n = naiveCanonicalFit(key, geo, obj);
        summary.spots[key][`naive_${obj}`] = n;
        writeFileSync(join(outDir, `${key}_naive_${obj}.profile.csv`),
          'x,z,alpha,pinned,onReef,reversed\n' + n.rows.map((r) => [r.x, r.z.toFixed(3), Number.isFinite(r.alpha) ? r.alpha.toFixed(3) : 'nan', +r.pinned, +r.onReef, +r.reversed].join(',')).join('\n') + '\n');
        rows.push([PRESETS[key].label, obj, n.target, `${fmt(shipped.betaDeg)} → ${fmt(n.betaDeg)}`, n.iterations, n.converged ? 'yes' : 'no',
                   fmt(n.value), fmt(n.stats.medianClean), fmt(n.stats.medianCleanOnReef), fmt(n.stats.legacyDeg), `${fmt(shippedEv.stats.onReefFrac, 2)} → ${fmt(n.stats.onReefFrac, 2)}`,
                   `${shippedEv.stats.reversals} → ${n.stats.reversals}`, `${shippedEv.stats.pinnedN} → ${n.stats.pinnedN}`, whereStr(n.stats.where),
                   n.trace.map((t) => `${t.betaDeg}:${t.value}/${t.reversals}r`).join(' ')]);
        log(`${key} naive/${obj}: beta ${fmt(shipped.betaDeg)} -> ${fmt(n.betaDeg)}, alpha ${fmt(n.value)}, rev ${n.stats.reversals}, converged ${n.converged}`);
      }
      gateShipped(key, 'naive');
    }
    md.push(mdTable(['spot', 'objective', 'target', 'β shipped → refit', 'evals', 'converged', 'objective value °', 'signed clean median °', 'signed on-reef °', 'legacy bearing at refit °',
                     'on-reef', 'rev on-reef', 'pinned', 'where', 'trace β:α/rev'], rows));
  }

  if (mode === 'all' || mode === 'scan') {
    const step = quick ? 2 : 1;
    md.push(`\n## 2b. Beta scan at the card state (${step}° rungs, refined to ${step / 4}°) and the candidate objectives`);
    const rowsO = [];
    for (const key of presets) {
      const geo = fitGeometry(key);
      const shipped = restoreShipped(geo.spot);
      const shippedEv = evalCandidate(key, geo, shipped.betaDeg);
      const scan = scanBeta(key, geo, { step });
      writeFileSync(join(outDir, `${key}_scan.json`), JSON.stringify(scan));
      const O = objectivesFromScan(key, geo, scan, shipped.betaDeg, shippedEv.stats, step);
      summary.spots[key].scan = scan;
      summary.spots[key].objectives = O;
      summary.spots[key].shippedBeta = shipped.betaDeg;
      // scan digest: where the signed metric can reach the target at all, and at what cost
      const reach = scan.filter((r) => Math.abs(r.medianClean - geo.card.alphaDeg) <= 5);
      const reachClean = reach.filter((r) => r.reversals === 0);
      const zeroRev = scan.filter((r) => r.reversals === 0);
      const zeroRevNoRamp = scan.filter((r) => r.reversalsNoRamp === 0);
      summary.spots[key].scanDigest = {
        reachBetas: reach.map((r) => r.betaDeg), reachCleanBetas: reachClean.map((r) => r.betaDeg), zeroRevBetas: zeroRev.map((r) => r.betaDeg),
        maxSigned: Math.max(...scan.map((r) => r.medianClean)), maxSignedOnReef: Math.max(...scan.map((r) => r.medianCleanOnReef ?? -90)),
        maxSignedZeroRev: zeroRev.length ? Math.max(...zeroRev.map((r) => r.medianClean)) : null,
        zeroRevNoRampBetas: zeroRevNoRamp.map((r) => r.betaDeg),
        maxSignedOnReefNoRamp: Math.max(...scan.map((r) => r.medianCleanOnReefNoRamp ?? -90)),
      };
      md.push(`\n### ${PRESETS[key].label} — target ${geo.card.alphaDeg}°, shipped β ${fmt(shipped.betaDeg)}`);
      md.push(mdTable(['β°', 'legacy± °', 'viol', 'signed clean °', 'signed on-reef °', 'on-reef no-ramp °', 'in-fit °', 'on-reef', 'rev on-reef (off-ramp)', 'pinned', 'ramp', 'where'],
        scan.filter((r) => step >= 2 || r.betaDeg % 2 === 1 || Math.abs(r.betaDeg - Math.round(shipped.betaDeg)) <= 1).map((r) => [r.betaDeg, fmt(r.legacySignedDeg), r.legacyViol, fmt(r.medianClean), fmt(r.medianCleanOnReef), fmt(r.medianCleanOnReefNoRamp), fmt(r.inFitMedian), fmt(r.onReefFrac, 2), `${r.reversals} (${r.reversalsNoRamp})`, r.pinnedN, r.rampStations, whereStr(r.where)])));
      const d = summary.spots[key].scanDigest;
      md.push(`\nsigned within 5° of target at β ∈ {${d.reachBetas.join(', ') || '—'}}; of those with zero on-reef reversals: {${d.reachCleanBetas.join(', ') || '—'}}. `
        + `Zero-reversal β set: {${d.zeroRevBetas.join(', ') || '—'}}, max signed there ${fmt(d.maxSignedZeroRev)}°. Max signed anywhere ${fmt(d.maxSigned)}°; on-reef ${fmt(d.maxSignedOnReef)}°; on-reef off-ramp ${fmt(d.maxSignedOnReefNoRamp)}°. `
        + `Zero off-ramp-reversal β set: {${d.zeroRevNoRampBetas.join(', ') || '—'}}.`);
      const o2 = O.o2, o3 = O.o3, o4 = O.o4;
      const fmtR = (r) => (r ? `β ${fmt(r.betaDeg, 2)}: signed ${fmt(r.medianClean)} / on-reef ${fmt(r.medianCleanOnReef)} / no-ramp ${fmt(r.medianCleanOnReefNoRamp)} / legacy± ${fmt(r.legacySignedDeg)}; rev ${r.reversals} (${r.reversalsNoRamp} off-ramp); on-reef ${fmt(r.onReefFrac, 2)}; pinned ${r.pinnedN}; ramp ${r.rampStations}` : 'none');
      const o2r = O.o2r, o5 = O.o5;
      const sh = shippedEv.stats;
      rowsO.push([PRESETS[key].label, geo.card.alphaDeg, `β ${fmt(shipped.betaDeg)}: signed ${fmt(sh.medianClean)} / on-reef ${fmt(sh.medianCleanOnReef)} / no-ramp ${fmt(sh.medianCleanOnReefNoRamp)} / legacy± ${fmt(shippedEv.legacy.signedBearingDeg)}; rev ${sh.reversals} (${sh.reversalsNoRamp} off-ramp); on-reef ${fmt(sh.onReefFrac, 2)}; pinned ${sh.pinnedN}; ramp ${sh.rampStations}`,
                  o2.feasible ? fmtR(o2.best) : `INFEASIBLE (min rev ${o2.minReversals}); nearest ${fmtR(o2.best)}`,
                  o2r.feasible ? fmtR(o2r.best) : `INFEASIBLE (min off-ramp rev ${o2r.minReversals}); nearest ${fmtR(o2r.best)}`,
                  o3.pass ? fmtR(o3.pass) : `no root passes; roots: ${o3.roots.map((r) => `β ${fmt(r.betaDeg, 2)} legacy ${fmt(r.legacyDeg)} signed ${fmt(r.medianClean)} (Δ ${fmt(r.disagreeDeg)}) rev ${r.reversals}`).join('; ') || 'none within 3°'}`,
                  `${fmtR(o4.bounded)}${o4.boundedFree && o4.bounded && o4.boundedFree.betaDeg !== o4.bounded.betaDeg ? ` — unconstrained-in-bound: ${fmtR(o4.boundedFree)}` : ''}`,
                  o5.best ? fmtR(o5.best) + (o5.roots.length > 1 ? ` (other root${o5.roots.length > 2 ? 's' : ''}: ${o5.roots.filter((r) => r !== o5.best).map((r) => `β ${fmt(r.betaDeg, 2)} signed ${fmt(r.medianClean)} rev ${r.reversals}`).join('; ')})` : '') : 'no root within 3°']);
      log(`${key}: scan done; O2 ${o2.feasible ? 'feasible' : 'INFEASIBLE'}, O3 ${o3.pass ? 'pass' : 'no pass'}, O4 ${o4.bounded ? fmt(o4.bounded.medianClean) : 'n/a'}`);
      gateShipped(key, 'scan');
    }
    md.push('\n### Candidate objectives at the card state');
    md.push(mdTable(['spot', 'target', 'shipped (legacy fit)', 'O2 on-reef signed, zero on-reef reversals, ≥50% on reef', 'O2′ same, slew-ramp stations excluded from the domain', `O3 legacy root that agrees with signed within ${AGREE_TOL_DEG}°`, `O4 legacy β ± ${CORRECTION_BOUND_DEG}°, min |signed − target|, reversals ≤ shipped`, 'O5 signed legacy bearing (no abs) = target'], rowsO));
  }

  if ((mode === 'all' || mode === 'ladders') && !quick) {
    md.push('\n## 2c. Activation H0 and the peel floor under each candidate (0.40 → card at 0.01 m, tide 0, card T)');
    const rows = [];
    for (const key of presets) {
      const geo = fitGeometry(key);
      const shipped = restoreShipped(geo.spot);
      const O = summary.spots[key].objectives;
      const cands = [['shipped', shipped.betaDeg]];
      if (O) {
        if (O.o2.best) cands.push([O.o2.feasible ? 'O2' : 'O2 (infeasible, nearest)', O.o2.best.betaDeg]);
        if (O.o3.pass) cands.push(['O3', O.o3.pass.betaDeg]);
        if (O.o4.bounded) cands.push(['O4', O.o4.bounded.betaDeg]);
        if (O.o5?.best) cands.push(['O5', O.o5.best.betaDeg]);
        const n = summary.spots[key].naive_stage; if (n) cands.push(['naive/stage', n.betaDeg]);
      }
      summary.spots[key].ladders = [];
      const seen = new Set();
      for (const [label, b] of cands) {
        const kb = round(b, 3); if (seen.has(kb)) { summary.spots[key].ladders.push({ label, sameAs: kb }); continue; } seen.add(kb);
        const L = ladderFor(key, geo, b, label);
        summary.spots[key].ladders.push(L);
        const pf = PEEL_FLOOR[key];
        rows.push([PRESETS[key].label, label, fmt(b, 2), fmt(L.activationH0, 3), fmt(L.floorH0, 2) + (L.floorNote ? ` (${L.floorNote})` : ''), pf ? pf.floorH0 : 'n/a',
                   L.largestFlip ? `${L.largestFlip.from}→${L.largestFlip.to} (${L.largestFlip.dzMax} m)` : 'none', L.flips.length,
                   fmt(L.cardAlpha), fmt(L.cardOnReef, 2), L.cardReversals, `${L.worstGate.maxDzM} / ${L.worstGate.gapMismatch}`]);
        log(`${key} ${label} β ${fmt(b, 2)}: activation ${fmt(L.activationH0, 3)} floor ${fmt(L.floorH0, 2)} flips ${L.flips.length}`);
        gateShipped(key, `ladder ${label}`);
      }
    }
    md.push(mdTable(['spot', 'candidate', 'β°', 'activation H0', 'floor H0 (peel returns)', 'PEEL_FLOOR shipped', 'largest flip', 'flips', 'card signed α', 'card on-reef', 'card rev', 'gate |dz| / gap'], rows));
  }

  if (mode === 'all' || mode === 'shape') {
    md.push('\n## 3. Reef extent and wedge shape at the card state (coarse 2° β scan per variant)');
    const rows = [];
    for (const key of presets) {
      const P = shapeProbe(key, { step: quick ? 4 : 2 });
      summary.spots[key].shape = P;
      writeFileSync(join(outDir, `${key}_shape.json`), JSON.stringify(P));
      for (const r of P) {
        const f = (q) => (q ? `β ${fmt(q.betaDeg, 2)}: signed ${fmt(q.medianClean)} / on-reef ${fmt(q.medianCleanOnReef)}; rev ${q.reversals} (${q.reversalsNoRamp} off-ramp); on-reef ${fmt(q.onReefFrac, 2)}; ramp ${q.rampStations}; off-reef ${q.offReefStations}; pinned ${q.pinnedN}` : 'none');
        rows.push([PRESETS[key].label, r.variant.label, `[${r.reefWin.map((v) => round(v, 0)).join(', ')}]`, fmt(r.maxSigned), f(r.bestAny), f(r.bestFeasible), r.bestStrict ? `β ${r.bestStrict.betaDeg}: signed ${fmt(r.bestStrict.medianClean)}` : 'none',
                   fmt(r.activationAtPick, 3), `${r.minRampStations} / ${r.minOffReefStations}`, `${r.minReversals} / ${r.minReversalsNoRamp}`]);
        log(`${key} shape ${r.variant.label}: max signed ${fmt(r.maxSigned)}, best feasible ${r.bestFeasible ? fmt(r.bestFeasible.medianClean) : 'none'}`);
      }
      gateShipped(key, 'shape');
    }
    md.push(mdTable(['spot', 'variant', 'reef window knots [m]', 'max signed °', 'best β for target (any)', 'best β with zero off-ramp on-reef reversals, ≥50% on reef', 'best β with zero on-reef reversals (strict)', 'activation H0 at pick', 'min ramp / off-reef stations over β', 'min rev / min off-ramp rev over β'], rows));
    // ladders for any variant that closes the gap cleanly, per spot
    if (!quick) {
      md.push('\n### 3b. Ladders for the closing variants (0.40 → card at 0.01 m, tide 0, card T)');
      const lrows = [];
      for (const key of presets) {
        const P = summary.spots[key].shape || [];
        const closing = P.filter((r) => r.bestFeasible && Math.abs(r.bestFeasible.medianClean - r.target) <= 5);
        summary.spots[key].shapeLadders = [];
        for (const r of closing) {
          const geo = geoWithVariant(key, r.variant);
          const L = ladderFor(key, geo, r.bestFeasible.betaDeg, `shape: ${r.variant.label}`);
          restoreShipped(geo.spot);
          summary.spots[key].shapeLadders.push(L);
          const pf = PEEL_FLOOR[key];
          lrows.push([PRESETS[key].label, r.variant.label, fmt(r.bestFeasible.betaDeg, 2), fmt(L.activationH0, 3), fmt(L.floorH0, 2) + (L.floorNote ? ` (${L.floorNote})` : ''), pf ? pf.floorH0 : 'n/a',
                      L.largestFlip ? `${L.largestFlip.from}→${L.largestFlip.to} (${L.largestFlip.dzMax} m)` : 'none', L.flips.length, fmt(L.cardAlpha), fmt(L.cardOnReef, 2), L.cardReversals, `${L.worstGate.maxDzM} / ${L.worstGate.gapMismatch}`]);
          log(`${key} shape-ladder ${r.variant.label}: activation ${fmt(L.activationH0, 3)} floor ${fmt(L.floorH0, 2)} flips ${L.flips.length}`);
          gateShipped(key, `shape-ladder ${r.variant.label}`);
        }
      }
      md.push(lrows.length ? mdTable(['spot', 'variant', 'β°', 'activation H0', 'floor H0 (peel returns)', 'PEEL_FLOOR shipped', 'largest flip', 'flips', 'card signed α', 'card on-reef', 'card rev', 'gate |dz| / gap'], lrows) : 'No variant closes the gap with zero off-ramp on-reef reversals at any spot.');
    }
  }

  for (const key of presets) gateShipped(key, 'end');
  md.push('\nShipped-path gate: the shipped fit (β, legacy bearing, composite checksum) and the card line, gap flags and signed alpha were re-derived after every section and are identical to the pre-injection record at every spot.');
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary));
  const report = md.join('\n');
  writeFileSync(join(outDir, 'report.md'), report + '\n');
  process.stdout.write(report + '\n');
  log(`wrote ${outDir}/summary.json, report.md, per-spot profiles`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) await main();
