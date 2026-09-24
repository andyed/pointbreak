// The (H0, tide) peel field at Second Peak, against the 2026-08-15 observation.
//
// FIDELITY_AUDIT_2026-09-23 ranked action 1: the real Second Peak peeled on
// 2026-08-15 15:28 PDT at +0.36..+0.50 m of tide and 0.73-0.91 m of H0
// (SURFLINE_CAM_POSE: Vp 4.7-6.7 m/s, alpha 55-73 deg) where PEEL_FLOOR's
// tide band is closed (top +0.01 m) and the bake reads a closeout (alpha 3.9,
// Vp 37). Is the band too tight, or is the direction machinery wrong there?
//
// Headless, on the bake's own code (bed.js bakeRefraction / bakeBreakLine /
// derivedPeelGeometry), never a twin (MEASUREMENT_LESSONS 4). Nothing shipped
// is edited: the knob arms serve bed.js through a `node:module` load hook
// with TWO constants parameterised in memory, per spot:
//   crest   metres added to the wedge crest depth clamp(0.75*h_b, 1.2, 3.0)
//           (positive = deeper); same patch site as
//           measure_reef_activation_sensitivity.mjs, keyed by spot here
//   beta    the wedge strike angle off shore-parallel, overriding the fitted
//           value AFTER the fit loop (the reef function is rebuilt at that
//           angle through the fit's own evaluate(), so its derived line
//           bearing against the card is carried too)
//   ceil    HYPOTHETICAL: metres added to the -0.5 m NAVD88 reef ceiling at
//           the crest target and the post clamp (the dry-post gate stays, so
//           land is never touched). The shipped invariant (reef-audit.test.js
//           aboveCeil = 0) forbids it; it exists to show what the observed
//           peel would need when the ceiling is what binds, and every such
//           arm is audited with bed.reefAudit and labelled outside.
// At zero knobs the patched module must reproduce the shipped bed.js import
// bit-for-bit at the observed cells before anything else is reported.
//
// Every alpha is the canonical one the HUD, the floor and the rider share:
// stage-median clean signed crest-relative alpha on the 2 m stage grid
// (derivedAlphaDeg; limiter-pinned stations excluded), exactly as
// measure_break_activation.mjs reduces it. Vp is |lineVelocityMps| from the
// same derivedPeelGeometry call (peel-geometry.js, bed.js's 14.06 m stencil),
// c is phaseSpeedMps. "on-reef" is the fraction of stage stations whose line
// sits on the synthetic uplift footprint (composite grid > measured grid).
// "z - zc" is the signed shore-normal distance of the line from the fitted
// wedge crest line zc = zRef + tan(beta)(x - 24): negative = seaward of it.
//
// Usage:
//   node scripts/measure_peel_band_field.mjs                 # everything, ~3 min
//   node scripts/measure_peel_band_field.mjs --mode=map|observed|profile|solve|consistency|plot|all
//   --out=docs/research/assets/peel-band-2026-09-24   --bed=cudem19   --fast
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { bedSourceTag, registerBedSource } from './lib/bed-source.mjs';
// The knob patches and the load hook live in scripts/lib/reef-knobs.mjs
// (extracted 2026-09-24, unchanged, so scripts/score_reef_fit.mjs serves the
// same knobs to every instrument); re-exported here under their old names.
import { PATCHES, countOccurrences, patchBedSource, bedFor } from './lib/reef-knobs.mjs';
export { PATCHES, countOccurrences, patchBedSource, bedFor };

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
// The bed source must be chosen before the first import that reaches bed.js.
export const BED_SOURCE = registerBedSource(bedSourceTag());

const bedShipped = await import('../web-three/js/bed.js');
const { PRESETS } = await import('../shared/params.js');
const { PP_GEO_DATA } = await import('../data/model/pp_geo_profiles.js');
const D = await import('../web-three/js/dispersion.js');
const S2 = await import('./compare_sentinel2_line.mjs');

// ---------- constants mirrored from main.js / the floor's basis ----------
export const X_RANGE = [-300, 300];
const [X0, X1] = X_RANGE;
export const READBACK_DX = 2;            // main.js stageAlpha(2), the floor's grid
export const ALPHA_FLOOR_DEG = 10;       // PEEL_FLOOR_BASIS.alphaFloorDeg
export const ON_REEF_MIN = 0.5;          // PEEL_FLOOR_BASIS.onReefMin
export const ALPHA_WALKER_DEG = 30;      // Walker (1974) ~30 deg, the task's criterion
export const HAND_SIGN = 1;              // Pleasure Point peels +x
export const REEF_ANCHOR_X = 24;         // bed.js REEF_ANCHOR_X
export const KEY = 'secondpeak';
export const SPOT = PRESETS[KEY].geoSpot;
const G = D.G;

// The day (FORCING_AUDIT §3, SURFLINE_CAM_POSE, CDIP_LIVE_DATA): SC116 record
// 12046, 2026-08-15 22:00Z: Hs 0.778 m, Tp 16.67 s, Dp 187.5. Two tide values
// exist for the hour and both are carried, labelled:
//   +0.357  the note's 4.0 ft MLLW page reading = the CO-OPS PREDICTION (T6)
//   +0.500  the CO-OPS 9413450 VERIFIED water level, MSL (FORCING_AUDIT §3)
// Three H0 values: 0.914 = the Surfline "3 ft" T6 baked; 0.778 = SC116 Hs as
// shipped (#day=live convention, H0 := Hs); 0.726 = Hs de-shoaled from the
// 15.03 m MOP depth at T 16 (0.709 at T 17).
export const OBS_TIDES = [{ label: 'predicted (4.0 ft page)', tide: 0.357 }, { label: 'observed (CO-OPS verified)', tide: 0.500 }];
export const OBS_H0 = [{ label: 'de-shoaled Hs', H0: 0.726 }, { label: 'SC116 Hs', H0: 0.778 }, { label: 'Surfline 3 ft', H0: 0.914 }];
export const OBS_T = [16, 17, 14];       // day (overhead), day (big), card basis
export const OBSERVED = { Vp_mps: [4.7, 6.7], c_mps: [3.8, 5.3], alphaDeg: [55, 73], alphaDegSeqA: [36, 49] };

const flag = (k, dflt) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : dflt; };
const FAST = process.argv.includes('--fast');
const MODE = flag('mode', 'all');
const OUT_ARG = flag('out', 'docs/research/assets/peel-band-2026-09-24');
const OUT_DIR = isAbsolute(OUT_ARG) ? OUT_ARG : join(ROOT, OUT_ARG);
const OUT_SUFFIX = BED_SOURCE ? `.${BED_SOURCE}` : '';

const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
// measure_break_activation.mjs's median: s[floor(n/2)] over finite values
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const quantile = (v, q) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i); };

export function stageGrid(spot) {
  const pr = PP_GEO_DATA.profiles[spot];
  const xs = [];
  for (let x = pr.stageBoundsM[0] + 10; x <= pr.stageBoundsM[1] - 10; x += READBACK_DX) xs.push(x);
  return xs;
}

// ---------- one cell, fully read ----------
// Bakes Psi and the line exactly as main.js's default path does and reads
// every stage station through the same exports the HUD reads.
export function measureCell(bed, key, { H0, T, tide, bedShape = 0 }, { xs = null, keepStations = false, audit = false } = {}) {
  const spot = PRESETS[key].geoSpot;
  xs = xs || stageGrid(spot);
  const omega = 2 * Math.PI / T;
  bed.bakeRefraction(spot, { T, tide, bedShape, swellDeg: PRESETS[key].alpha, xRef: 0 });
  const baked = bed.bakeBreakLine(spot, X_RANGE, { H0, T, tide, bedShape, smoothM: 0, peel: null });
  if (!baked) throw new Error(`${key}: bake returned null`);
  const fit = bed.reefFitFor(spot);
  const tanB = fit ? Math.tan(fit.betaDeg * Math.PI / 180) : 0;
  const wl = bed.MSL_ABOVE_NAVD88 + tide;
  const st = [];
  let zPrev = null;
  for (const x of xs) {
    const z = bed.breakZAt(x, X0, X1);
    const gap = bed.breakGapAt(x, X0, X1) ? 1 : 0;
    const g = bed.derivedPeelGeometry(x, X0, X1, { omega });
    const pinned = zPrev !== null && Math.abs((z - zPrev) / READBACK_DX) >= bed.GAP_SLOPE;   // stageStats: backward slope
    zPrev = z;
    const eb = bed.bedElevBlended(spot, x, z, bedShape);
    const depth = eb === bed.BED_UNKNOWN ? null : wl - eb;
    const onReef = bed.bedElevBlended(spot, x, z, 0) - bed.bedElevAt(spot, x, z) > 0.005 ? 1 : 0;
    const zc = fit ? fit.zRef + tanB * (x - REEF_ANCHOR_X) : null;
    st.push({ x, z, gap, pinned: pinned ? 1 : 0, onReef, zc, dzc: zc === null ? null : z - zc, depth,
      alpha: g?.alphaDeg ?? NaN, lineBearing: g ? g.breakBearingRad * 180 / Math.PI : NaN,
      crestBearing: g ? g.crestBearingRad * 180 / Math.PI : NaN,
      c: g?.phaseSpeedMps ?? NaN, Vp: g?.lineVelocityMps == null ? NaN : Math.abs(g.lineVelocityMps) });
  }
  const clean = st.filter((r) => !r.pinned);
  const cleanLive = clean.filter((r) => !r.gap);
  const alphaClean = clean.map((r) => r.alpha);
  const alphaMed = median(alphaClean);
  const onReefFrac = st.reduce((q, r) => q + r.onReef, 0) / st.length;
  const reversals = clean.filter((r) => r.onReef && Number.isFinite(r.alpha) && Math.abs(r.alpha) > 2 && Math.sign(r.alpha) !== HAND_SIGN).length;
  const healthy = Number.isFinite(alphaMed) && Math.sign(alphaMed) === HAND_SIGN && Math.abs(alphaMed) >= ALPHA_FLOOR_DEG && onReefFrac >= ON_REEF_MIN;
  const walker = Number.isFinite(alphaMed) && Math.sign(alphaMed) === HAND_SIGN && Math.abs(alphaMed) >= ALPHA_WALKER_DEG && onReefFrac >= ON_REEF_MIN;
  const cell = {
    H0: round(H0, 3), T, tide: round(tide, 3), bedShape,
    alpha: round(alphaMed, 2), alphaQ1: round(quantile(alphaClean, 0.25), 2), alphaQ3: round(quantile(alphaClean, 0.75), 2),
    onReef: round(onReefFrac, 3), reversals, pinnedN: st.length - clean.length, gapFrac: round(st.reduce((q, r) => q + r.gap, 0) / st.length, 3),
    Vp: round(median(cleanLive.map((r) => r.Vp)), 2), VpQ1: round(quantile(cleanLive.map((r) => r.Vp), 0.25), 2), VpQ3: round(quantile(cleanLive.map((r) => r.Vp), 0.75), 2),
    c: round(median(cleanLive.map((r) => r.c)), 2),
    lineBearing: round(median(clean.map((r) => r.lineBearing)), 2), crestBearing: round(median(clean.map((r) => r.crestBearing)), 2),
    depth: round(median(st.map((r) => r.depth)), 2), zLine: round(median(st.map((r) => r.z)), 1),
    dzc: round(median(st.map((r) => r.dzc)), 1),
    healthy: healthy ? 1 : 0, walker: walker ? 1 : 0,
    fit: fit ? { betaDeg: round(fit.betaDeg, 3), fitDerivedDeg: round(fit.fitDerivedDeg, 2), withinTol: fit.withinTol, signViolations: fit.signViolations,
                 crestDepthM: round(bed.MSL_ABOVE_NAVD88 - fit.targetEl, 3), zRef: fit.zRef, hbM: round(fit.hbM, 3) } : null,
    // the shipped wedge invariants (tests/reef-audit.test.js): additive, no
    // post deepened, no wet post above the -0.5 m NAVD88 ceiling, no dry post
    audit: audit ? (() => { const a = bed.reefAudit(spot); return a ? { aboveCeil: a.aboveCeil, dryTouched: a.dryTouched, deepened: a.deepened, postsTouched: a.postsTouched, maxRaiseM: round(a.maxRaiseM, 3) } : null; })() : undefined,
  };
  if (keepStations) cell.stations = st.map((r) => ({ x: r.x, z: round(r.z, 1), gap: r.gap, pinned: r.pinned, onReef: r.onReef, dzc: round(r.dzc, 1),
    depth: round(r.depth, 2), alpha: round(r.alpha, 1), lineBearing: round(r.lineBearing, 1), crestBearing: round(r.crestBearing, 1), c: round(r.c, 2), Vp: round(r.Vp, 1) }));
  return cell;
}

// T6's domain (compare_peel_speed.mjs): every non-gap station of the WHOLE
// 600 m bake, x in [-290, 290]. Reported beside the stage number so the two
// can be reconciled (MEASUREMENT_LESSONS 8c: check the domain before the value).
export function fullBakeGrid() { const xs = []; for (let x = X0 + 10; x <= X1 - 10; x += 2) xs.push(x); return xs; }

// ---------- the gate ----------
export function gate(bedZero, cells) {
  const rows = [];
  let worst = 0;
  for (const c of cells) {
    const a = measureCell(bedZero, KEY, c, { keepStations: true });
    const b = measureCell(bedShipped, KEY, c, { keepStations: true });
    let dz = 0, da = 0;
    for (let i = 0; i < a.stations.length; i++) {
      dz = Math.max(dz, Math.abs(a.stations[i].z - b.stations[i].z));
      const d = Math.abs(a.stations[i].alpha - b.stations[i].alpha);
      if (Number.isFinite(d)) da = Math.max(da, d);
    }
    const dBeta = Math.abs(a.fit.betaDeg - b.fit.betaDeg);
    worst = Math.max(worst, dz, da, dBeta);
    rows.push({ ...c, maxDzM: dz, maxDAlphaDeg: da, dBeta, alphaPatched: a.alpha, alphaShipped: b.alpha });
  }
  return { rows, worst, pass: worst === 0 };
}

// ---------- maps ----------
export function ladder(lo, hi, step) { const v = []; for (let x = lo; x <= hi + 1e-9; x += step) v.push(Math.round(x * 1000) / 1000); return v; }

export function bakeMap(bed, T, { h0s, tides, log = null }) {
  const cells = [];
  for (const tide of tides) {
    for (const H0 of h0s) {
      const c = measureCell(bed, KEY, { H0, T, tide });
      cells.push([c.H0, c.tide, c.alpha, c.onReef, c.Vp, c.c, c.lineBearing, c.crestBearing, c.dzc, c.depth, c.gapFrac, c.healthy, c.walker]);
    }
    if (log) log(`  T ${T} tide ${tide.toFixed(2)}: ${cells.length} cells`);
  }
  return { T, h0s, tides, columns: ['H0', 'tide', 'alpha', 'onReef', 'Vp', 'c', 'lineBearing', 'crestBearing', 'dzc', 'depth', 'gapFrac', 'healthy', 'walker'], cells };
}

// ---------- the Sentinel-2 check on an arbitrary bed instance ----------
// A replica of compare_sentinel2_line.mjs compareScene / main's verdict rule,
// parameterised on the bed module so a knob instance can be scored. At zero
// knobs it must reproduce residuals.md's score (checked in main()).
export function sentinelScore(bed, loci, spots = null) {
  const out = { cells: 0, score: {}, perCell: [] };
  for (const arm of Object.keys(S2.ARMS)) out.score[arm] = { contradicted: 0, consistent: 0, closest: 0 };
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
          cell[arm][vName] = round(S2Median(offs), 1);
        }
      }
      let verdicts = {};
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
// compare_sentinel2_line's median (mean of the two middle values when even)
function S2Median(v) { const s = v.filter(Number.isFinite).sort((a, b) => a - b); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]); }

// ---------- the Lookout line at Jack's (T3 forcing) ----------
// Stage-z of the Jack's reef-arm line at the 2026-09-05 11:12 forcing, so a
// knob's effect on the T3 residual is read as the shift of the line the
// photograph was subtracted from (LOOKOUT_LOCUS_RESIDUAL §3: dz in stage
// metres, + = model shoreward = the inner miss grows).
export function lookoutLine(bed, { Hs = 0.910, T = 16.67, tide = 0.316 } = {}) {
  const key = 'jacks', spot = PRESETS[key].geoSpot;
  const Ks15 = D.shoaledHeight(1, T, 15);
  const arms = [['raw', Hs], ['deshoal15', Hs / Ks15], ['set1.27', 1.27 * Hs], ['set1.53', 1.53 * Hs]];
  const out = {};
  for (const [label, H0] of arms) {
    const c = measureCell(bed, key, { H0, T, tide }, { keepStations: true });
    const live = c.stations.filter((s) => !s.gap);
    out[label] = { H0: round(H0, 3), zMedian: round(median(live.map((s) => s.z)), 1), zQ1: round(quantile(live.map((s) => s.z), 0.25), 1), zQ3: round(quantile(live.map((s) => s.z), 0.75), 1),
                   alpha: c.alpha, onReef: c.onReef, gapFrac: c.gapFrac, crestDepthM: c.fit?.crestDepthM, betaDeg: c.fit?.betaDeg };
  }
  return out;
}

// ---------- tables ----------
const f = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : Number(v).toFixed(d));
function mdTable(head, rows) {
  const line = (r) => `| ${r.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const log = (s) => console.log(s);
  const summary = { generated: new Date().toISOString(), bedSource: BED_SOURCE || 'shipped (NCEI 1/3" 2012)', preset: KEY, spot: SPOT,
                    observed: OBSERVED, obsTides: OBS_TIDES, obsH0: OBS_H0, obsT: OBS_T, patches: PATCHES.map((p) => p.name),
                    definitions: {
                      alpha: 'stage-median clean signed crest-relative alpha (deg) on the 2 m stage grid, limiter-pinned stations excluded (bed.derivedAlphaDeg; PEEL_FLOOR_BASIS.alphaMetric)',
                      onReef: 'fraction of stage stations whose line sits on the synthetic uplift footprint',
                      Vp: 'median |lineVelocityMps| over clean non-gap stage stations (peel-geometry.js, 14.06 m stencil), m/s',
                      c: 'median phaseSpeedMps at the line, m/s',
                      lineBearing_crestBearing: 'stage medians, degrees from the stage x axis; alpha is their difference',
                      dzc: 'median (z_line - z_crest) in stage metres, z_crest = zRef + tan(beta)(x - 24); negative = the line sits seaward of the wedge crest line',
                      healthy: 'alpha >= 10 with the authored (+) handedness and onReef >= 0.5 (the floor criterion)',
                      walker: 'alpha >= 30 with the authored handedness and onReef >= 0.5',
                    } };
  const bedZero = await bedFor({});

  // observed cells, every T, reef arm
  const obsCells = [];
  for (const T of OBS_T) for (const t of OBS_TIDES) for (const h of OBS_H0) obsCells.push({ H0: h.H0, T, tide: t.tide });

  // gate first, always
  const g = gate(bedZero, obsCells.filter((c) => c.T === 16 || c.T === 17));
  summary.gate = g;
  log(`\n## Gate: patched-at-zero bed.js vs the shipped import at ${g.rows.length} observed cells — ${g.pass ? 'PASS' : 'FAIL'} (worst ${g.worst.toExponential(1)})`);
  if (!g.pass) { console.error('gate failed; nothing below is a measurement of the shipped model'); process.exit(2); }
  const fit0 = bedZero.reefFitFor(SPOT);
  summary.shippedFit = { betaDeg: round(fit0.betaDeg, 3), fitDerivedDeg: round(fit0.fitDerivedDeg, 2), targetDeg: fit0.targetDeg, withinTol: fit0.withinTol,
                         signViolations: fit0.signViolations, crestDepthM: round(bedZero.MSL_ABOVE_NAVD88 - fit0.targetEl, 3), hbM: round(fit0.hbM, 3), zRef: fit0.zRef,
                         stageBoundsM: PP_GEO_DATA.profiles[SPOT].stageBoundsM };
  log(`shipped Second Peak wedge: beta ${f(fit0.betaDeg, 2)} deg (fit derived ${f(fit0.fitDerivedDeg)} vs target ${fit0.targetDeg}), crest depth ${f(bedZero.MSL_ABOVE_NAVD88 - fit0.targetEl, 3)} m, h_b(card) ${f(fit0.hbM, 3)} m, zRef ${fit0.zRef}, stage ${PP_GEO_DATA.profiles[SPOT].stageBoundsM}`);

  const all = MODE === 'all';
  if (all || MODE === 'observed') {
    log('\n## Observed cells (stage domain; T6 full-bake domain beside it)\n');
    const rows = [];
    summary.observedCells = [];
    for (const T of OBS_T) for (const t of OBS_TIDES) for (const h of OBS_H0) {
      for (const [bedLabel, bedShape] of [['reef', 0], ['plane', 1], ['measured', 2]]) {
        const c = measureCell(bedZero, KEY, { H0: h.H0, T, tide: t.tide, bedShape });
        const full = measureCell(bedZero, KEY, { H0: h.H0, T, tide: t.tide, bedShape }, { xs: fullBakeGrid() });
        summary.observedCells.push({ ...c, h0Label: h.label, tideLabel: t.label, bed: bedLabel, fullBake: { alpha: full.alpha, alphaQ1: full.alphaQ1, alphaQ3: full.alphaQ3, Vp: full.Vp, c: full.c, onReef: full.onReef } });
        rows.push([T, `${f(h.H0, 3)} (${h.label})`, `${f(t.tide, 3)} (${t.label.split(' ')[0]})`, bedLabel,
          `${f(c.alpha)} [${f(c.alphaQ1)}, ${f(c.alphaQ3)}]`, f(c.onReef, 2), `${f(c.Vp)} [${f(c.VpQ1)}, ${f(c.VpQ3)}]`, f(c.c, 2),
          `${f(c.lineBearing)} / ${f(c.crestBearing)}`, f(c.dzc, 0), f(c.depth, 2), f(c.gapFrac, 2), c.healthy ? 'yes' : 'no',
          `${f(full.alpha)} / ${f(full.Vp)}`]);
      }
    }
    log(mdTable(['T', 'H0', 'tide', 'bed', 'alpha med [q1, q3]', 'on-reef', 'Vp med [q1, q3]', 'c', 'line / crest bearing', 'z-zc m', 'depth m', 'gap', 'healthy', 'full-bake alpha / Vp'], rows));
    // The FORCING arm: the drawn line is the significant wave's; the cam's
    // crests may be set waves (Rayleigh H1/10 = 1.27 Hs, E[Hmax of 100] = 1.53 Hs).
    log('\n## Set-wave arms at the observed tides (reef arm): does a bigger wave put the wedge in play?\n');
    summary.setWave = [];
    const srows = [];
    for (const T of [16, 17]) for (const t of OBS_TIDES) for (const h of [OBS_H0[1], OBS_H0[2]]) for (const [mLabel, mult] of [['H1/10 1.27x', 1.27], ['E[Hmax] 1.53x', 1.53]]) {
      const c = measureCell(bedZero, KEY, { H0: h.H0 * mult, T, tide: t.tide });
      summary.setWave.push({ ...c, base: h.label, mult: mLabel, tideLabel: t.label });
      srows.push([T, `${f(h.H0, 3)} x ${mLabel} = ${f(h.H0 * mult, 3)}`, `${f(t.tide, 3)} (${t.label.split(' ')[0]})`, `${f(c.alpha)} [${f(c.alphaQ1)}, ${f(c.alphaQ3)}]`, f(c.onReef, 2), f(c.Vp), f(c.depth, 2), f(c.dzc, 0), c.healthy ? 'yes' : 'no', c.walker ? 'yes' : 'no']);
    }
    log(mdTable(['T', 'H0', 'tide', 'alpha med [q1, q3]', 'on-reef', 'Vp', 'depth m', 'z-zc m', 'healthy', 'Walker >= 30'], srows));
  }

  if (all || MODE === 'profile') {
    log('\n## Line-bearing profile along x at two observed cells (reef arm, T 16; every 5th stage station)\n');
    summary.profiles = [];
    for (const c of [{ H0: 0.778, T: 16, tide: 0.5 }, { H0: 0.914, T: 16, tide: 0.357 }, { H0: 1.5, T: 14, tide: 0 }]) {
      const cell = measureCell(bedZero, KEY, c, { keepStations: true });
      summary.profiles.push({ cell: c, label: c.H0 === 1.5 ? 'card (reference)' : 'observed', summary: { ...cell, stations: undefined }, stations: cell.stations });
      log(`\n### H0 ${c.H0} m, T ${c.T} s, tide ${c.tide >= 0 ? '+' : ''}${c.tide} m — alpha ${f(cell.alpha)}, on-reef ${f(cell.onReef, 2)}, z-zc ${f(cell.dzc, 0)} m\n`);
      log(mdTable(['x', 'z', 'z-zc', 'on-reef', 'gap', 'pinned', 'depth', 'line brg', 'crest brg', 'alpha', 'c', 'Vp'],
        cell.stations.filter((_, i) => i % 5 === 0).map((s) => [s.x, f(s.z, 0), f(s.dzc, 0), s.onReef, s.gap, s.pinned, f(s.depth, 2), f(s.lineBearing), f(s.crestBearing), f(s.alpha), f(s.c, 2), f(s.Vp)])));
    }
  }

  if (all || MODE === 'map') {
    const h0s = ladder(0.6, 1.6, FAST ? 0.2 : 0.05);
    const tides = ladder(-0.3, 0.8, FAST ? 0.2 : 0.05);
    summary.maps = [];
    for (const T of OBS_T) {
      log(`\n## Map T ${T}: H0 ${h0s[0]}..${h0s[h0s.length - 1]} x tide ${tides[0]}..${tides[tides.length - 1]} (${h0s.length * tides.length} cells)`);
      const t0 = Date.now();
      const m = bakeMap(bedZero, T, { h0s, tides, log: FAST ? log : null });
      m.wallS = round((Date.now() - t0) / 1000, 1);
      summary.maps.push(m);
      // compact print: alpha (on-reef) per cell, tide rows x H0 columns, every other rung unless --fast
      const stride = FAST ? 1 : 2;
      const hs = h0s.filter((_, i) => i % stride === 0), ts = tides.filter((_, i) => i % stride === 0);
      const at = (H0, tide) => m.cells.find((r) => Math.abs(r[0] - H0) < 1e-6 && Math.abs(r[1] - tide) < 1e-6);
      log(mdTable(['tide \\ H0', ...hs.map((h) => f(h, 2))], ts.map((t) => [(t >= 0 ? '+' : '') + f(t, 2), ...hs.map((h) => { const r = at(h, t); return r ? `${f(r[2], 0)}${r[12] ? '**' : r[11] ? '*' : ''}(${f(r[3] * 100, 0)})` : ''; })])));
      log(`cells: alpha(on-reef %); * healthy (>=10 deg, >=50 % on reef); ** Walker (>=30 deg). ${m.wallS} s`);
    }
  }

  if (all || MODE === 'solve') {
    log('\n## Knob solve at the observed cells: what wedge would give alpha >= 30 deg there (Second Peak knobs only)\n');
    const cells = [{ H0: 0.778, T: 16, tide: 0.5, label: 'SC116 Hs, observed tide' }, { H0: 0.914, T: 16, tide: 0.357, label: 'T6: 3 ft, predicted tide' }];
    summary.solve = { cells, crestSweep: [], betaSweep: [], grid: [] };
    const crests = ladder(-1.6, 1.0, 0.1);
    const betas = ladder(5, 80, 5);
    for (const dc of crests) {
      const bed = await bedFor({ crest: { [SPOT]: dc } });
      for (const c of cells) {
        const r = measureCell(bed, KEY, c);
        summary.solve.crestSweep.push({ crestDeltaM: dc, cell: c.label, ...r });
      }
    }
    for (const b of betas) {
      const bed = await bedFor({ beta: { [SPOT]: b } });
      for (const c of cells) {
        const r = measureCell(bed, KEY, c);
        summary.solve.betaSweep.push({ betaDeg: b, cell: c.label, ...r });
      }
    }
    const gridC = [-1.5, -1.0, -0.5, 0, 0.5, 1.0], gridB = ladder(10, 80, 10);
    for (const dc of gridC) for (const b of gridB) {
      const bed = await bedFor({ crest: { [SPOT]: dc }, beta: { [SPOT]: b } });
      for (const c of cells) {
        const r = measureCell(bed, KEY, c);
        summary.solve.grid.push({ crestDeltaM: dc, betaDeg: b, cell: c.label, ...r });
      }
    }
    // HYPOTHETICAL: the ceiling lifted by L, with crest -1.6 so the crest
    // rides the lifted ceiling (crest depth = 1.605 - L m below MSL); beta
    // shipped-refit or overridden. Audited: wet posts above -0.5 m NAVD88 are
    // the invariant these arms break, and the count is printed.
    summary.solve.ceilingLifted = [];
    for (const L of [0.2, 0.4, 0.6, 0.8, 1.0, 1.2]) for (const b of [NaN, 15, 30, 45, 60]) {
      const knobs = { crest: { [SPOT]: -1.6 }, ceil: { [SPOT]: L } };
      if (Number.isFinite(b)) knobs.beta = { [SPOT]: b };
      const bed = await bedFor(knobs);
      for (const c of cells) {
        const r = measureCell(bed, KEY, c, { audit: true });
        summary.solve.ceilingLifted.push({ ceilLiftM: L, betaDeg: Number.isFinite(b) ? b : 'fit', cell: c.label, ...r });
      }
    }
    for (const c of cells) {
      log(`\n### ${c.label}: H0 ${c.H0}, T ${c.T}, tide +${c.tide}\n`);
      log('crest-depth delta (shipped beta refit each time):\n');
      log(mdTable(['crest delta m', 'crest depth m', 'fit beta', 'fit derived / 41', 'alpha', 'on-reef', 'Vp', 'z-zc', 'depth', 'walker'],
        summary.solve.crestSweep.filter((r) => r.cell === c.label).map((r) => [f(r.crestDeltaM), f(r.fit.crestDepthM, 2), f(r.fit.betaDeg), `${f(r.fit.fitDerivedDeg)}${r.fit.withinTol ? '' : ' (off)'}`, f(r.alpha), f(r.onReef, 2), f(r.Vp), f(r.dzc, 0), f(r.depth, 2), r.walker ? 'yes' : ''])));
      log('\nstrike beta override (shipped crest):\n');
      log(mdTable(['beta deg', 'fit derived / 41', 'sign viol', 'alpha', 'on-reef', 'Vp', 'z-zc', 'walker'],
        summary.solve.betaSweep.filter((r) => r.cell === c.label).map((r) => [f(r.betaDeg, 0), `${f(r.fit.fitDerivedDeg)}${r.fit.withinTol ? '' : ' (off)'}`, r.fit.signViolations, f(r.alpha), f(r.onReef, 2), f(r.Vp), f(r.dzc, 0), r.walker ? 'yes' : ''])));
      log('\ncrest x beta grid — alpha (on-reef %):\n');
      const gg = summary.solve.grid.filter((r) => r.cell === c.label);
      log(mdTable(['crest delta \\ beta', ...gridB.map((b) => f(b, 0))], gridC.map((dc) => [f(dc), ...gridB.map((b) => { const r = gg.find((q) => q.crestDeltaM === dc && q.betaDeg === b); return `${f(r.alpha, 0)}${r.walker ? '**' : r.healthy ? '*' : ''}(${f(r.onReef * 100, 0)})`; })])));
      log('\nHYPOTHETICAL, outside the shipped invariants: ceiling lifted by L with the crest riding it (crest depth 1.605 - L m below MSL), beta fit or overridden:\n');
      log(mdTable(['ceiling lift m', 'crest depth m', 'beta', 'fit derived / 41', 'alpha', 'on-reef', 'Vp', 'c', 'depth', 'wet posts above -0.5 m', 'dry touched', 'walker'],
        summary.solve.ceilingLifted.filter((r) => r.cell === c.label).map((r) => [f(r.ceilLiftM), f(r.fit.crestDepthM, 2), r.betaDeg === 'fit' ? `fit ${f(r.fit.betaDeg)}` : f(r.betaDeg, 0), `${f(r.fit.fitDerivedDeg)}${r.fit.withinTol ? '' : ' (off)'}`, f(r.alpha), f(r.onReef, 2), f(r.Vp), f(r.c, 2), f(r.depth, 2), r.audit?.aboveCeil ?? 'n/a', r.audit?.dryTouched ?? 'n/a', r.walker ? 'yes' : ''])));
    }
  }

  if (all || MODE === 'consistency') {
    log('\n## Consistency: the candidate knobs against the Sentinel-2 apex verdicts and the Lookout line at Jack\'s\n');
    const loci = JSON.parse(readFileSync(join(ROOT, 'docs/research/assets/sentinel2-locus-2026-09-23/loci.json'), 'utf8'));
    const candidates = [{ label: 'shipped', knobs: {} }];
    const cand = flag('knobs', '');
    if (cand) for (const spec of cand.split(';')) { const k = JSON.parse(spec); candidates.push({ label: spec, knobs: k }); }
    else {
      // Explicit candidates, not "best by alpha": inside the invariants the
      // knobs do not move the SC116 cell at all, so the arms worth pricing
      // are the ceiling-bound crest (the shallowest wedge the invariant
      // allows), that crest with the best in-invariant beta at the T6 cell,
      // the same crest rule at every spot, and the smallest hypothetical
      // ceiling lift that puts the SC116 cell on the wedge.
      candidates.push({ label: 'crest -0.5 m at Second Peak (ceiling-bound: the shallowest in-invariant wedge)', knobs: { crest: { [SPOT]: -0.5 } } });
      candidates.push({ label: 'crest -0.5 m + beta 10 deg at Second Peak (best in-invariant alpha at the T6 cell)', knobs: { crest: { [SPOT]: -0.5 }, beta: { [SPOT]: 10 } } });
      const crestAll = {}; for (const p of Object.values(PRESETS)) if (p.geoSpot) crestAll[p.geoSpot] = -0.5;
      candidates.push({ label: 'crest -0.5 m at EVERY spot (the rule, not a Second Peak fit)', knobs: { crest: crestAll } });
      if (summary.solve?.ceilingLifted) {
        const onWedge = summary.solve.ceilingLifted.filter((r) => r.cell === 'SC116 Hs, observed tide' && r.onReef >= 0.5)
          .sort((a, b) => a.ceilLiftM - b.ceilLiftM || (b.alpha ?? -99) - (a.alpha ?? -99))[0];
        const walker = summary.solve.ceilingLifted.filter((r) => r.cell === 'SC116 Hs, observed tide' && r.walker)
          .sort((a, b) => a.ceilLiftM - b.ceilLiftM || (b.alpha ?? -99) - (a.alpha ?? -99))[0];
        for (const [pick, why] of [[onWedge, 'smallest lift with the SC116 cell on the wedge'], [walker, 'smallest lift with alpha >= 30 at the SC116 cell']]) {
          if (!pick) continue;
          const knobs = { crest: { [SPOT]: -1.6 }, ceil: { [SPOT]: pick.ceilLiftM } };
          if (pick.betaDeg !== 'fit') knobs.beta = { [SPOT]: pick.betaDeg };
          candidates.push({ label: `HYPOTHETICAL ceiling +${pick.ceilLiftM} m, crest riding it (${f(pick.fit.crestDepthM, 2)} m below MSL), beta ${pick.betaDeg} (${why}; alpha ${pick.alpha})`, knobs });
        }
      }
    }
    summary.consistency = [];
    for (const cnd of candidates) {
      const bed = await bedFor(cnd.knobs);
      const s2 = sentinelScore(bed, loci, null);
      const s2apex = sentinelScore(bed, loci, ['Second Peak']);
      const lk = lookoutLine(bed);
      const cellObs = measureCell(bed, KEY, { H0: 0.778, T: 16, tide: 0.5 });
      // the cost side: the authored card state (1.5 m, T 14, tide 0) and the
      // T6 cell under the same knobs
      const cellCard = measureCell(bed, KEY, { H0: PRESETS[KEY].H0, T: PRESETS[KEY].T, tide: 0 }, { audit: true });
      const cellT6 = measureCell(bed, KEY, { H0: 0.914, T: 16, tide: 0.357 });
      summary.consistency.push({ label: cnd.label, knobs: cnd.knobs, sentinel: { all: s2.score, cells: s2.cells, secondPeak: s2apex.perCell.filter((c) => !c.supplementary).map((c) => ({ date: c.date, reef: c.offsets.reef, verdict: c.verdicts.reef })) },
                                lookoutJacks: lk, secondPeakObsCell: { alpha: cellObs.alpha, onReef: cellObs.onReef, Vp: cellObs.Vp },
                                secondPeakT6Cell: { alpha: cellT6.alpha, onReef: cellT6.onReef, Vp: cellT6.Vp },
                                secondPeakCard: { alpha: cellCard.alpha, onReef: cellCard.onReef, Vp: cellCard.Vp, zLine: cellCard.zLine, fit: cellCard.fit, audit: cellCard.audit } });
      log(`\n### ${cnd.label}`);
      log(`Sentinel-2, all spots (28 cells): reef contradicted ${s2.score.reef.contradicted}, consistent ${s2.score.reef.consistent}, closest ${s2.score.reef.closest}; plane ${s2.score.plane.contradicted}/${s2.score.plane.consistent}/${s2.score.plane.closest}; measured ${s2.score.measured.contradicted}/${s2.score.measured.consistent}/${s2.score.measured.closest}`);
      log(mdTable(['scene', 'Second Peak reef: Hs/Ks offset', 'H1/10 offset', 'verdict'], s2apex.perCell.filter((c) => !c.supplementary).map((c) => [c.date, f(c.offsets.reef.deshoaled, 0), f(c.offsets.reef.h10, 0), c.verdicts.reef])));
      log(mdTable(['Jack\'s arm (T3 forcing)', 'H0', 'z median [q1, q3]', 'alpha', 'on-reef', 'gap', 'crest depth', 'beta'], Object.entries(lk).map(([k, v]) => [k, f(v.H0, 3), `${f(v.zMedian, 0)} [${f(v.zQ1, 0)}, ${f(v.zQ3, 0)}]`, f(v.alpha), f(v.onReef, 2), f(v.gapFrac, 2), f(v.crestDepthM, 2), f(v.betaDeg)])));
      log(`Second Peak at SC116 Hs / observed tide with these knobs: alpha ${f(cellObs.alpha)}, on-reef ${f(cellObs.onReef, 2)}, Vp ${f(cellObs.Vp)}; T6 cell: alpha ${f(cellT6.alpha)}, on-reef ${f(cellT6.onReef, 2)}, Vp ${f(cellT6.Vp)}`);
      log(`Second Peak CARD (1.5 m, T 14, tide 0) with these knobs: alpha ${f(cellCard.alpha)}, on-reef ${f(cellCard.onReef, 2)}, Vp ${f(cellCard.Vp)}, z ${f(cellCard.zLine, 0)}; fit beta ${f(cellCard.fit?.betaDeg)} derived ${f(cellCard.fit?.fitDerivedDeg)}${cellCard.fit?.withinTol ? '' : ' (off)'}; wet posts above -0.5 m: ${cellCard.audit?.aboveCeil ?? 'n/a'}, dry touched ${cellCard.audit?.dryTouched ?? 'n/a'}`);
    }
  }

  const outJson = join(OUT_DIR, `field${OUT_SUFFIX}.json`);
  // --mode=plot re-draws from the JSON a full run wrote; it must not replace
  // that JSON with a summary that holds no maps.
  if (MODE !== 'plot') {
    writeFileSync(outJson, JSON.stringify(summary));
    log(`\nwrote ${outJson}`);
  } else if (!existsSync(outJson)) {
    throw new Error(`--mode=plot needs ${outJson} from a full run first`);
  }

  if (all || MODE === 'plot') {
    const png = join(OUT_DIR, `peel-band-map${OUT_SUFFIX}.png`);
    try {
      execFileSync('python3', ['-c', PLOT_PY, outJson, png], { stdio: 'inherit', env: { ...process.env, MPLCONFIGDIR: '/tmp/pointbreak-mpl' } });
      log(`wrote ${png}`);
    } catch (e) { console.error(`plot skipped: ${e.message}`); }
  }
}

// The heatmap: one panel per T, signed alpha as colour (diverging about 0,
// clipped at +-45), hatched where the line is off the wedge (< 50 % on reef),
// the observed cells marked, the tide range the model accepts drawn.
const PLOT_PY = String.raw`
import json, sys
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.colors import TwoSlopeNorm
d = json.load(open(sys.argv[1]))
maps = d['maps']
fig, axes = plt.subplots(1, len(maps), figsize=(5.2 * len(maps), 5.6), sharey=True, constrained_layout=True)
if len(maps) == 1: axes = [axes]
norm = TwoSlopeNorm(vmin=-30, vcenter=0, vmax=30)
for ax, m in zip(axes, maps):
    h0s, tides = m['h0s'], m['tides']
    A = np.full((len(tides), len(h0s)), np.nan); R = np.full_like(A, np.nan); W = np.zeros_like(A)
    for c in m['cells']:
        i = tides.index(c[1]); j = h0s.index(c[0])
        A[i, j] = c[2] if c[2] is not None else np.nan; R[i, j] = c[3] if c[3] is not None else np.nan; W[i, j] = c[12]
    dh = h0s[1] - h0s[0]; dt = tides[1] - tides[0]
    ext = [h0s[0] - dh / 2, h0s[-1] + dh / 2, tides[0] - dt / 2, tides[-1] + dt / 2]
    im = ax.imshow(np.clip(A, -30, 30), origin='lower', extent=ext, aspect='auto', cmap='RdBu', norm=norm, interpolation='nearest')
    ax.contourf(np.array(h0s), np.array(tides), (R < 0.5).astype(float), levels=[0.5, 1.5], colors='none', hatches=['////'])
    # the 10 / 30 deg contours only where the line is ON the wedge, so the
    # dashed line is the floor criterion's boundary, not the inshore bore's
    onW = np.where(R >= 0.5, np.nan_to_num(A, nan=-99), -99)
    ax.contour(np.array(h0s), np.array(tides), onW, levels=[10, 30], colors=['k', 'k'], linewidths=[0.8, 1.4], linestyles=['--', '-'])
    ax.axhline(0.764, color='k', lw=0.6, ls=':'); ax.axhline(0.01, color='0.3', lw=0.8, ls='-.')
    for t in d['obsTides']:
        for h in d['obsH0']:
            ax.plot(h['H0'], t['tide'], marker='o', ms=7, mfc='none', mec='lime', mew=1.8)
    ax.plot(1.5, 0, marker='s', ms=7, mfc='none', mec='k', mew=1.2)
    ax.set_title('T = %d s%s' % (m['T'], ' (card basis)' if m['T'] == 14 else ''))
    ax.set_xlabel('H0 (m, deep water)')
axes[0].set_ylabel('tide (m about MSL)')
cb = fig.colorbar(im, ax=axes, shrink=0.85, pad=0.02); cb.set_label('stage-median clean signed alpha (deg), clipped at +-30')
fig.suptitle("Second Peak peel field on the shipped bed. Hatched: line off the wedge (< 50 % of stage stations on reef).\n"
             "On-wedge contours: dashed 10 deg (the floor criterion), solid 30 deg (none anywhere). Dash-dot: PEEL_FLOOR tide-band top +0.01 m; dotted: MHHW +0.764 m.\n"
             "Green circles: the 2026-08-15 cells (H0 0.726 / 0.778 / 0.914 at tide +0.357 predicted, +0.500 observed); square: the card (1.5 m, tide 0).", fontsize=8.5)
fig.savefig(sys.argv[2], dpi=105)
`;

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) await main();
