// Reef-activation sensitivity: what sets the H0 at which the synthetic wedge
// first meets the break criterion, and how far each knob would have to move
// to bring a spot's activation down to the summer climatology.
//
// NEXT_INVESTMENTS section 1, "what is next" item 3 (the reef-extent question
// at Sewers and First Peak). Companion to measure_break_activation.mjs, whose
// `reefActivationH0` is the number being explained. Nothing here is wired and
// nothing shipped is edited: the sweep runs the bake's own code from
// web-three/js/bed.js with FOUR constants parameterised in memory.
//
// HOW THE KNOBS REACH THE BAKE. A `node:module` load hook serves bed.js's
// source with four string patches applied (PATCHES below, each asserted to
// match exactly once) whenever it is imported with a `?sweep=<json>` query.
// The query makes each import a distinct module instance with its own fit and
// grid caches, so one process holds every sweep point side by side. Relative
// imports inside the patched module resolve against the unqueried URL, so
// dispersion.js, params.js and the data modules are the shipped ones. At zero
// knobs the patched source is numerically the shipped bake, and the gate below
// requires it to reproduce measure_break_activation.mjs's activation table at
// every mapped spot before any other number is printed.
//
// KNOBS (all default to the shipped value):
//   crestDeltaM  added to the wedge crest depth, clamp(0.75*h_b, 1.2, 3.0) m.
//                Positive = deeper. The DEM residual is 0.31-0.93 m; the sweep
//                runs well past it in both directions.
//   ceilLiftM    raises the arm's crest cap (REEF_CREST_CEIL_EL = MLLW + 0.1 m
//                on the shipped table arm since 2026-09-24; the old -0.5 m
//                NAVD88 cap on #reef=legacy) used for the crest target and the
//                post clamp. HYPOTHETICAL: the shipped invariant
//                (reef-audit.test.js) forbids it; the dry-post gate at -0.5 m
//                is left alone so land is never touched. Exists to show where
//                the ceiling, not the crest rule, is what binds.
//   winUpM / winDownM  extend (positive) or shrink the reef window's up-point
//                (negative-x) and down-point bounds, metres. The shipped knots
//                are the OSM stage bounds feathered inward (params.js
//                reefWindowKnots); a neighbouring spot's node sits one half-
//                partition past each bound, so +75 m is about the most the OSM
//                partition permits before the wedge claims the neighbour.
//   featherM     the feather cap, shipped REEF_FEATHER_MAX = 75 (f = min(cap, 0.35 w)).
//   ampM         REEF_AMP_MAX via the exported setter (no patch needed).
//
// ACTIVATION here is the same quantity as the instrument's: the lowest H0 at
// which F = H0*shelter*Ks - gamma*h >= 0 at any cell on the wedge footprint
// (composite grid > measured grid + 5 mm), at tide 0 and the card T. Because
// F is linear in H0 the first cell to activate is the one minimising
// gamma*h / (shelter*Ks(h)), and that closed form is printed next to the
// bisection so the reader can see activation IS the crest depth.
//
// Usage:
//   node scripts/measure_reef_activation_sensitivity.mjs            # everything, ~20 s
//   node scripts/measure_reef_activation_sensitivity.mjs --mode=gate|crest|solve|window|amp|ocean|all
//   --out=qa/reef-activation   --preset=sewers,firstpeak
import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BED_URL = new URL('../web-three/js/bed.js', import.meta.url).href;
const THREE_URL = new URL('../web-three/vendor/three.module.js', import.meta.url).href;
const BED_SRC = readFileSync(fileURLToPath(BED_URL), 'utf8');

// ---------- the four patches ----------
// Exported so tests/reef-activation-sweep.test.js can pin that each `find`
// still occurs exactly once in bed.js: a drift there must fail the test, not
// silently sweep a constant that no longer exists.
export const PATCHES = [
  // Since 2026-09-24 (the refit) bed.js resolves the crest depth and the crest
  // cap per arm on one line each — the table row's on the shipped arm, the
  // legacy rule on #reef=legacy — so one patch reaches both arms.
  { name: 'crest depth',
    find: 'const crestDepth = row ? row.crestDepthM : Math.min(Math.max(0.75 * hb, 1.2), 3.0);',
    replace: 'const crestDepth = (row ? row.crestDepthM : Math.min(Math.max(0.75 * hb, 1.2), 3.0)) + __SWEEP.crestDeltaM;' },
  { name: 'crest target ceiling',
    find: 'const targetEl = Math.min(MSL_ABOVE_NAVD88 - crestDepth, crestCeil - crestMargin);',
    replace: 'const targetEl = Math.min(MSL_ABOVE_NAVD88 - crestDepth, crestCeil + __SWEEP.ceilLiftM - crestMargin);' },
  { name: 'post ceiling',
    find: 'return Math.max(Math.min(em + lift, ceilEl) - em, 0);',
    replace: 'return Math.max(Math.min(em + lift, ceilEl + __SWEEP.ceilLiftM) - em, 0);' },
  { name: 'reef window knots',
    find: '? reefWindowKnots(pr.stageBoundsM[0], pr.stageBoundsM[1])',
    replace: '? __sweepKnots(pr.stageBoundsM[0], pr.stageBoundsM[1])' },
];
export const SWEEP_DEFAULTS = { crestDeltaM: 0, ceilLiftM: 0, winUpM: 0, winDownM: 0, featherM: 75 };

export function countOccurrences(src, needle) {
  let n = 0, i = 0;
  while ((i = src.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}
export function patchBedSource(src, sweep) {
  const s = { ...SWEEP_DEFAULTS, ...sweep };
  let out = src;
  for (const p of PATCHES) {
    const n = countOccurrences(out, p.find);
    if (n !== 1) throw new Error(`patch "${p.name}": expected exactly one match in bed.js, found ${n}`);
    out = out.replace(p.find, p.replace);
  }
  // Prepended: imports are hoisted, so a declaration before them is legal, and
  // every patched site runs at call time, after module evaluation.
  const prelude = `const __SWEEP = ${JSON.stringify(s)};\n`
    + `function __sweepKnots(a, b) {\n`
    + `  const lo = a - __SWEEP.winUpM, hi = b + __SWEEP.winDownM;\n`
    + `  const w = Math.max(hi - lo, 1), f = Math.min(__SWEEP.featherM, 0.35 * w);\n`
    + `  return [lo, lo + f, hi - f, hi];\n}\n`;
  return prelude + out;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return { url: THREE_URL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(BED_URL + '?sweep=')) {
      const sweep = JSON.parse(decodeURIComponent(url.slice(BED_URL.length + '?sweep='.length)));
      return { format: 'module', source: patchBedSource(BED_SRC, sweep), shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

// A fresh bake instance for one sweep point. `ampM` goes through the export.
const instances = new Map();
export async function bedFor(sweep = {}) {
  const s = { ...SWEEP_DEFAULTS, ...sweep };
  const amp = s.ampM ?? null;
  const key = JSON.stringify({ ...s, ampM: amp });
  if (instances.has(key)) return instances.get(key);
  // ampM stays IN the query even though the patches ignore it: the query is
  // what makes the module instance distinct, and setReefAmp mutates module
  // state. Two sweep points that differ only in amplitude must not share one.
  const mod = await import(`${BED_URL}?sweep=${encodeURIComponent(key)}`);
  if (amp !== null) mod.setReefAmp(amp);
  instances.set(key, mod);
  return mod;
}

// The reference instrument (shipped bake, its own hooks) and the shared modules.
const I = await import('./measure_break_activation.mjs');
const { PRESETS } = await import('../shared/params.js');
const { PP_GEO_DATA } = await import('../data/model/pp_geo_profiles.js');
const { PP_DEPTH_DATA } = await import('../data/model/pp_depth_patches.js');
const D = await import('../web-three/js/dispersion.js');
const { MONTHLY_OCEAN } = await import('../data/climatology/pp_monthly_ocean.js');
const CLIM = JSON.parse(readFileSync(join(ROOT, 'data/climatology/pp_cdip_climatology.json'), 'utf8'));

const { GAMMA, G } = D;
const MAPPED = I.MAPPED;
const spotOf = (key) => PRESETS[key].geoSpot;

// Deep-water H0 for a percentile of the SC116 Hs climatology, the same
// de-shoaling pp_monthly_ocean.js applies (Ks = 0.9759 at T = 14.8 s).
const KS_MONTHLY = MONTHLY_OCEAN.find((m) => m.key === 'august').hsP75 / MONTHLY_OCEAN.find((m) => m.key === 'august').H0;
export function climH0(month, pct) {
  const hs = CLIM.months[month].hs_m[pct];
  return hs / KS_MONTHLY;
}
export const TARGETS = {
  augP75: climH0('August', 'p75'),   // the #month=august height, 0.585
  augP50: climH0('August', 'p50'),
  augP90: climH0('August', 'p90'),
  augMax: CLIM.months.August.hs_m.max / KS_MONTHLY,
};

// ---------- activation on one bake instance ----------
// Mirrors measure_break_activation.fieldBasis/excessAt, restricted to the
// wedge footprint, with the argmin cell reported. xLo/xHi default to the
// instrument's stage restriction (stage bounds +/- 10 m) so the gate compares
// like with like; 'window' uses the (possibly extended) reef window instead.
export function activationOn(bed, key, { T, tide = 0, xRange = 'stage', lo = 0.2, hi = 3.0 } = {}) {
  const spot = spotOf(key);
  const fit = bed.reefFitFor(spot);
  if (!fit) return { H0: null, note: 'no reef fit' };
  const pr = PP_GEO_DATA.profiles[spot];
  let xLo, xHi;
  if (xRange === 'stage') { xLo = pr.stageBoundsM[0] + 10; xHi = pr.stageBoundsM[1] - 10; }
  else if (xRange === 'all') { xLo = -Infinity; xHi = Infinity; }
  else { [xLo, xHi] = xRange; }
  const wl = bed.MSL_ABOVE_NAVD88 + tide;
  const { z0, z1 } = PP_DEPTH_DATA.grid;
  const omega = 2 * Math.PI / T, cg0 = G * T / (4 * Math.PI);
  const cells = [];   // every wedge cell: depth, Ks, shelter, x, z
  let reefXMin = Infinity, reefXMax = -Infinity;
  for (let i = 0; i < I.BREAK_N; i++) {
    const x = I.stationX(i);
    if (x < xLo || x > xHi) continue;
    const shelter = bed.getShelter() ? D.shelterFactor(x) : 1;
    for (let z = z0; z <= z1; z += I.MARCH_DZ) {
      const eb = bed.bedElevBlended(spot, x, z, 0);
      const d = wl - eb;
      if (d <= I.BEACH_DEPTH_M) break;
      if (eb - bed.bedElevAt(spot, x, z) > 0.005) {
        const cg = D.groupVelocityAt(omega, d);
        const Ks = Math.min(Math.max(Math.sqrt(cg0 / cg), 0.7), 2.6);
        cells.push({ x, z, d, Ks, shelter, lift: eb - bed.bedElevAt(spot, x, z) });
        if (x < reefXMin) reefXMin = x;
        if (x > reefXMax) reefXMax = x;
      }
    }
  }
  if (!cells.length) return { H0: null, note: 'no wedge footprint in range', fit: fitSummary(fit) };
  const fMax = (H0) => {
    let m = -Infinity;
    for (const c of cells) { const F = H0 * c.shelter * c.Ks - GAMMA * c.d; if (F > m) m = F; }
    return m;
  };
  // closed form: the cell minimising gamma*d / (shelter*Ks)
  let best = null;
  for (const c of cells) {
    const h0 = GAMMA * c.d / (c.shelter * c.Ks);
    if (!best || h0 < best.h0) best = { h0, ...c };
  }
  let H0 = null, note = null;
  if (fMax(hi) < 0) note = `reef never activates below ${hi}`;
  else if (fMax(lo) >= 0) { H0 = lo; note = `reef active at ${lo} already`; }
  else {
    let a = lo, b = hi;
    for (let k = 0; k < 40; k++) { const m = 0.5 * (a + b); if (fMax(m) >= 0) b = m; else a = m; }
    H0 = 0.5 * (a + b);
  }
  const minDepth = Math.min(...cells.map((c) => c.d));
  return {
    H0, note, closedFormH0: best.h0,
    argmin: { x: best.x, z: best.z, depthM: best.d, Ks: best.Ks, shelter: best.shelter, liftM: best.lift },
    minReefDepthM: minDepth, reefCells: cells.length, reefXMin, reefXMax,
    fMaxAtCard: fMax(PRESETS[key].H0),
    fit: fitSummary(fit),
  };
}
function fitSummary(fit) {
  return { betaDeg: fit.betaDeg, fitDerivedDeg: fit.fitDerivedDeg, targetDeg: fit.targetDeg,
           withinTol: fit.withinTol, signViolations: fit.signViolations, iterations: fit.iterations,
           hbM: fit.hbM, targetEl: fit.targetEl, crestDepthM: PP_DEPTH_DATA.mslAboveNavd88M - fit.targetEl,
           zRef: fit.zRef };
}

// ---------- the gate (MEASUREMENT_LESSONS 4) ----------
// The patched-at-zero bake must reproduce the shipped instrument's activation
// at every mapped spot, and its reef fit must be the shipped fit.
export async function gate() {
  const bed = await bedFor({});
  const rows = [];
  let worst = 0;
  for (const key of MAPPED) {
    const T = PRESETS[key].T;
    const ref = I.reefActivationH0(key, { T, tide: 0 });
    const mine = activationOn(bed, key, { T, tide: 0, xRange: 'stage' });
    const shippedFit = I.instrumentState(key, I.cardOf(key)).fit;
    const dH = Math.abs(mine.H0 - ref.H0);
    const dBeta = Math.abs(mine.fit.betaDeg - shippedFit.betaDeg);
    const dEl = Math.abs(mine.fit.targetEl - shippedFit.targetEl);
    worst = Math.max(worst, dH, dBeta, dEl);
    rows.push({ key, label: PRESETS[key].label, refH0: ref.H0, patchedH0: mine.H0, dH0: dH,
                closedFormH0: mine.closedFormH0, dClosed: Math.abs(mine.closedFormH0 - mine.H0),
                dBeta, dTargetEl: dEl, crestDepthM: mine.fit.crestDepthM, hbM: mine.fit.hbM,
                argminDepthM: mine.argmin.depthM, argminX: mine.argmin.x, argminShelter: mine.argmin.shelter,
                minReefDepthM: mine.minReefDepthM });
  }
  return { rows, worst, pass: worst <= 1e-9 };
}

// ---------- sweeps ----------
export async function sweepKnob(knob, values, { keys = MAPPED, base = {}, xRange = 'stage' } = {}) {
  const rows = [];
  for (const v of values) {
    const bed = await bedFor({ ...base, [knob]: v });
    for (const key of keys) {
      const a = activationOn(bed, key, { T: PRESETS[key].T, tide: 0, xRange });
      rows.push({ knob, value: v, key, label: PRESETS[key].label, H0: a.H0, note: a.note,
                  crestDepthM: a.fit?.crestDepthM ?? null, argminDepthM: a.argmin?.depthM ?? null,
                  minReefDepthM: a.minReefDepthM ?? null, argminX: a.argmin?.x ?? null,
                  reefCells: a.reefCells ?? 0, reefXMin: a.reefXMin ?? null, reefXMax: a.reefXMax ?? null,
                  betaDeg: a.fit?.betaDeg ?? null, fitDerivedDeg: a.fit?.fitDerivedDeg ?? null,
                  withinTol: a.fit?.withinTol ?? null, signViolations: a.fit?.signViolations ?? null,
                  iterations: a.fit?.iterations ?? null, fMaxAtCard: a.fMaxAtCard ?? null });
    }
  }
  return rows;
}

// Solve for the crest delta at which activation equals `target`, by bisection
// on crestDeltaM in [lo, hi]. Activation is monotone in crest depth by
// construction (deeper crest, more gamma*h to overcome), up to the ceiling,
// where it stops moving: the solve reports that plateau as unreachable.
export async function solveCrestDelta(key, target, { ceilLiftM = 0, lo = -3.0, hi = 1.0 } = {}) {
  const T = PRESETS[key].T;
  const at = async (dlt) => activationOn(await bedFor({ crestDeltaM: dlt, ceilLiftM }), key, { T, tide: 0 });
  const aLo = await at(lo), aHi = await at(hi);
  if (aLo.H0 === null || aLo.H0 > target) {
    return { key, target, ceilLiftM, reachable: false, floorH0: aLo.H0, floorCrestDepthM: aLo.fit?.crestDepthM,
             floorMinReefDepthM: aLo.minReefDepthM, note: `activation cannot go below ${aLo.H0?.toFixed(3)} at crestDelta ${lo}` };
  }
  if (aHi.H0 !== null && aHi.H0 < target) {
    return { key, target, ceilLiftM, reachable: false, note: `activation still below target at crestDelta ${hi}` };
  }
  let a = lo, b = hi, ra = aLo, rb = aHi;
  for (let k = 0; k < 24; k++) {
    const m = 0.5 * (a + b);
    const r = await at(m);
    if (r.H0 === null || r.H0 > target) { b = m; rb = r; } else { a = m; ra = r; }
  }
  const dlt = 0.5 * (a + b), r = await at(dlt);
  return { key, target, ceilLiftM, reachable: true, crestDeltaM: dlt, activationH0: r.H0,
           crestDepthM: r.fit.crestDepthM, shippedCrestDepthM: r.fit.crestDepthM - dlt,
           minReefDepthM: r.minReefDepthM, argminDepthM: r.argmin.depthM,
           betaDeg: r.fit.betaDeg, fitDerivedDeg: r.fit.fitDerivedDeg, withinTol: r.fit.withinTol,
           signViolations: r.fit.signViolations };
}

// Activation on the SHIPPED wedge as the ocean moves: tide and period, since
// the floor's basis is tide 0 / card T and the guides say tide matters.
export async function oceanTable(keys = MAPPED) {
  const bed = await bedFor({});
  const rows = [];
  for (const key of keys) {
    const T = PRESETS[key].T;
    for (const tide of [-0.862, -0.43, 0, 0.38, 0.764]) {
      const a = activationOn(bed, key, { T, tide });
      rows.push({ key, label: PRESETS[key].label, axis: 'tide', T, tide, H0: a.H0, note: a.note, argminDepthM: a.argmin?.depthM ?? null });
    }
    for (const Tv of [9, 11, 13, 15, 17]) {
      const a = activationOn(bed, key, { T: Tv, tide: 0 });
      rows.push({ key, label: PRESETS[key].label, axis: 'T', T: Tv, tide: 0, H0: a.H0, note: a.note, argminDepthM: a.argmin?.depthM ?? null });
    }
    // the tide at which the SHIPPED wedge activates at each August target
    // (card T): bisection on tide within the published MLLW..MHHW excursion
    for (const [name, target] of [['augP90', TARGETS.augP90], ['augP75', TARGETS.augP75], ['augP50', TARGETS.augP50]]) {
      const actAt = (tide) => activationOn(bed, key, { T, tide }).H0;
      let lo = bed.TIDE_RANGE[0], hi = bed.TIDE_RANGE[1];
      let tideNeeded = null, note = null;
      const aLo = actAt(lo);
      if (aLo !== null && aLo <= target) {
        if (actAt(hi) <= target) { tideNeeded = hi; note = 'active at MHHW already'; }
        else {
          for (let k = 0; k < 30; k++) { const m = 0.5 * (lo + hi); if (actAt(m) <= target) lo = m; else hi = m; }
          tideNeeded = 0.5 * (lo + hi);
        }
      } else note = `not reached at MLLW (activation ${aLo === null ? 'n/a' : aLo.toFixed(3)})`;
      rows.push({ key, label: PRESETS[key].label, axis: 'tideNeeded', target: name, targetH0: target, T, tideNeeded, note });
    }
  }
  return rows;
}

// ---------- tables ----------
const fmt = (v, d = 3) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : Number(v).toFixed(d));
function mdTable(head, rows) {
  const line = (r) => `| ${r.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}
function pivot(rows, valueOf) {
  const values = [...new Set(rows.map((r) => r.value))];
  const keys = [...new Set(rows.map((r) => r.key))];
  return mdTable(['value', ...keys.map((k) => PRESETS[k].label)],
    values.map((v) => [v, ...keys.map((k) => { const r = rows.find((q) => q.value === v && q.key === k); return r ? valueOf(r) : ''; })]));
}

async function main() {
  const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--'))
    .map((a) => { const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v]; }));
  const mode = flags.mode || 'all';
  const outDir = join(ROOT, flags.out || 'qa/reef-activation');
  mkdirSync(outDir, { recursive: true });
  const keys = flags.preset ? String(flags.preset).split(',') : MAPPED;
  const summary = { generated: new Date().toISOString(), targets: TARGETS, knobDefaults: SWEEP_DEFAULTS, patches: PATCHES.map((p) => p.name) };

  // gate first, always
  const g = await gate();
  summary.gate = g;
  console.log('\n## Gate: patched-at-zero bake vs the shipped instrument (activation, fit beta, crest target)\n');
  console.log(mdTable(['spot', 'instrument H0', 'patched H0', '|dH0|', 'closed-form H0', '|d closed|', '|d beta|', '|d targetEl|', 'h_b m', 'crest depth m', 'argmin depth m', 'argmin x m', 'shelter there', 'min reef depth m'],
    g.rows.map((r) => [r.label, fmt(r.refH0), fmt(r.patchedH0), r.dH0.toExponential(1), fmt(r.closedFormH0), r.dClosed.toExponential(1), r.dBeta.toExponential(1), r.dTargetEl.toExponential(1), fmt(r.hbM, 3), fmt(r.crestDepthM, 3), fmt(r.argminDepthM, 3), fmt(r.argminX, 1), fmt(r.argminShelter, 4), fmt(r.minReefDepthM, 3)])));
  console.log(`\ngate ${g.pass ? 'PASS' : 'FAIL'} (worst ${g.worst.toExponential(2)})`);
  if (!g.pass) { console.error('gate failed; nothing below is a measurement of the shipped model'); process.exit(2); }
  console.log(`\nclimatology targets (deep-water H0, SC116): Aug p50 ${fmt(TARGETS.augP50)}, p75 ${fmt(TARGETS.augP75)}, p90 ${fmt(TARGETS.augP90)}, 25-y Aug max ${fmt(TARGETS.augMax)}`);

  if (mode === 'all' || mode === 'crest') {
    const values = [];
    for (let d = -1.6; d <= 1.0 + 1e-9; d += 0.1) values.push(Math.round(d * 100) / 100);
    const rows = await sweepKnob('crestDeltaM', values, { keys });
    summary.crestSweep = rows;
    console.log('\n## Activation H0 vs crest-depth delta (m; shipped ceiling; tide 0, card T)\n');
    console.log(pivot(rows, (r) => `${fmt(r.H0)} (h ${fmt(r.argminDepthM, 2)})`));
    console.log('\n(each cell: activation H0 (depth of the activating cell). The ceiling holds the crest at >= 1.605 m below MSL, so the column stops moving where it binds.)');
    console.log('\n## Reef fit under the same sweep: derived alpha / target, sign violations, iterations\n');
    console.log(pivot(rows, (r) => `${fmt(r.fitDerivedDeg, 1)}/${PRESETS[r.key].alpha} v${r.signViolations} i${r.iterations}`));
    // the same sweep with the ceiling lifted out of the way
    const rowsNoCeil = await sweepKnob('crestDeltaM', values, { keys, base: { ceilLiftM: 1.0 } });
    summary.crestSweepCeilingLifted = rowsNoCeil;
    console.log('\n## HYPOTHETICAL: the same crest sweep with the reef ceiling lifted 1.0 m (to +0.5 m NAVD88, 0.4 m under MSL)\n');
    console.log(pivot(rowsNoCeil, (r) => `${fmt(r.H0)} (h ${fmt(r.argminDepthM, 2)})`));
  }

  if (mode === 'all' || mode === 'solve') {
    summary.solves = [];
    console.log('\n## What crest-depth change would bring activation to the August climatology\n');
    const rows = [];
    for (const key of keys) {
      for (const [name, target] of [['Aug p90', TARGETS.augP90], ['Aug p75', TARGETS.augP75], ['Aug p50', TARGETS.augP50]]) {
        for (const ceil of [0, 1.0]) {
          const s = await solveCrestDelta(key, target, { ceilLiftM: ceil });
          summary.solves.push({ name, ...s });
          rows.push([PRESETS[key].label, name, fmt(target), ceil ? 'lifted +1.0' : 'shipped',
            s.reachable ? fmt(s.crestDeltaM, 2) : 'unreachable',
            s.reachable ? fmt(s.crestDepthM, 2) : (s.floorCrestDepthM !== undefined ? `floor ${fmt(s.floorCrestDepthM, 2)}` : ''),
            s.reachable ? fmt(s.minReefDepthM, 2) : (s.floorMinReefDepthM !== undefined ? `floor ${fmt(s.floorMinReefDepthM, 2)}` : ''),
            s.reachable ? fmt(s.activationH0) : fmt(s.floorH0),
            s.reachable ? `${fmt(s.fitDerivedDeg, 1)}/${PRESETS[key].alpha} v${s.signViolations}` : '',
            s.reachable ? (Math.abs(s.crestDeltaM) <= 0.93 ? (Math.abs(s.crestDeltaM) <= 0.31 ? 'inside 0.31' : 'inside 0.93') : 'OUTSIDE residual') : (s.note || '')]);
        }
      }
    }
    console.log(mdTable(['spot', 'target', 'target H0', 'ceiling', 'crest delta m', 'crest depth m', 'min reef depth m', 'activation H0', 'fit alpha v.viol', 'vs DEM residual 0.31-0.93'], rows));
  }

  if (mode === 'all' || mode === 'window') {
    const ups = [-50, -25, 0, 25, 50, 75];
    const rowsUp = await sweepKnob('winUpM', ups, { keys, xRange: 'all' });
    const rowsDown = await sweepKnob('winDownM', ups, { keys, xRange: 'all' });
    const rowsF = await sweepKnob('featherM', [0, 25, 50, 75, 100, 150], { keys, xRange: 'all' });
    summary.windowSweep = { up: rowsUp, down: rowsDown, feather: rowsF };
    console.log('\n## Activation H0 vs reef-window extent (activation searched over the whole wedge footprint, not the stage)\n');
    console.log('\n### up-point bound moved outward by (m)\n');
    console.log(pivot(rowsUp, (r) => `${fmt(r.H0)} (x ${fmt(r.argminX, 0)}; ${r.reefCells} cells; ${fmt(r.fitDerivedDeg, 1)}° v${r.signViolations})`));
    console.log('\n### down-point bound moved outward by (m)\n');
    console.log(pivot(rowsDown, (r) => `${fmt(r.H0)} (x ${fmt(r.argminX, 0)}; ${r.reefCells} cells; ${fmt(r.fitDerivedDeg, 1)}° v${r.signViolations})`));
    console.log('\n### feather cap (m; shipped 75)\n');
    console.log(pivot(rowsF, (r) => `${fmt(r.H0)} (x ${fmt(r.argminX, 0)}; ${r.reefCells} cells; ${fmt(r.fitDerivedDeg, 1)}° v${r.signViolations})`));
  }

  if (mode === 'all' || mode === 'amp') {
    const rows = await sweepKnob('ampM', [1.6, 2.4, 3.2, 4.8, 6.4, 9.6], { keys });
    summary.ampSweep = rows;
    console.log('\n## Activation H0 vs wedge amplitude REEF_AMP_MAX (m; shipped 3.2)\n');
    console.log(pivot(rows, (r) => `${fmt(r.H0)} (${r.reefCells} cells; ${fmt(r.fitDerivedDeg, 1)}° v${r.signViolations})`));
  }

  if (mode === 'all' || mode === 'ocean') {
    const rows = await oceanTable(keys);
    summary.oceanTable = rows;
    console.log('\n## Activation H0 on the shipped wedge vs tide (card T) and vs period (tide 0)\n');
    const tides = rows.filter((r) => r.axis === 'tide'), Ts = rows.filter((r) => r.axis === 'T');
    const tv = [...new Set(tides.map((r) => r.tide))], Tv = [...new Set(Ts.map((r) => r.T))];
    console.log(mdTable(['spot', ...tv.map((t) => `tide ${t >= 0 ? '+' : ''}${t}`), ...Tv.map((t) => `T ${t}`)],
      keys.map((k) => [PRESETS[k].label, ...tv.map((t) => fmt(tides.find((r) => r.key === k && r.tide === t).H0)), ...Tv.map((t) => fmt(Ts.find((r) => r.key === k && r.T === t).H0))])));
    console.log('\n## Tide at which the shipped wedge activates at the August targets (card T; MLLW -0.862 .. MHHW +0.764)\n');
    const tn = rows.filter((r) => r.axis === 'tideNeeded');
    console.log(mdTable(['spot', 'Aug p90 (0.691)', 'Aug p75 (0.585)', 'Aug p50 (0.485)'],
      keys.map((k) => [PRESETS[k].label, ...['augP90', 'augP75', 'augP50'].map((t) => { const r = tn.find((q) => q.key === k && q.target === t);
        return r.tideNeeded === null ? r.note : `${r.tideNeeded >= 0 ? '+' : ''}${r.tideNeeded.toFixed(2)} m${r.note ? ` (${r.note})` : ''}`; })])));
  }

  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary));
  console.log(`\nwrote ${join(outDir, 'summary.json')}`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) await main();
