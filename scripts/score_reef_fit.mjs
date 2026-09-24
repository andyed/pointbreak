// One headless scorecard for a reef bake (FIDELITY_AUDIT_2026-09-23 ranked
// item 3, PEEL_BAND_FIELD_2026-09-24 §6). Seven shipped presets, one row each,
// every number read through the instrument that first published it, on the
// bake's own code — never a twin (MEASUREMENT_LESSONS 4):
//
//   card state      measure_reef_fit_signed.mjs disagreeCard(): canonical signed
//                   stage-median alpha vs alphaTarget, on-reef fraction, clean
//                   off-ramp on-reef reversals, slew-ramp stations; Vp median
//                   from measure_peel_band_field.mjs measureCell()
//   H0 window       card x [0.7, 1.3] at tide 0 and the card T, 0.05 m rungs,
//                   the floor's own criterion (alpha >= 10 deg with the authored
//                   sign, >= 50 % of stage stations on the reef) at every rung,
//                   through measure_break_activation.mjs instrumentState/repSummary
//   R4 window       measure_physics_residuals.mjs peelWindow(): the contiguous
//                   H0 range around the card where |alpha| >= Walker's 30 deg
//   floor / band    measure_break_activation.mjs measurePeelFloor() (the
//                   PEEL_FLOOR ladder, digest included) and the tide band of
//                   that floor, walked outward from tide 0 on the instrument's
//                   own 0.01 m ladders until the first failing rung on each side
//                   (the contiguous-band half of measureTideFloor(); the
//                   holds-outside-band scan is not repeated)
//   activation      reefActivationH0() at the card T, tide 0
//   reef audit      bed.reefAudit (dry posts, posts above the -0.5 m NAVD88
//                   ceiling) plus the same count against MLLW + 0.1 m
//                   (+0.14 m NAVD88), read off the composite grids
//   field day       Second Peak only: the two 2026-08-15 cells (SC116 Hs at the
//                   verified tide; Surfline 3 ft at the predicted tide), alpha /
//                   Vp / c / on-reef against SURFLINE_CAM_POSE's brackets
//   Sentinel-2      measure_peel_band_field.mjs sentinelScore() — the reef arm's
//                   contradicted / consistent / closest against loci.json
//   Lookout         lib/lookout-line.mjs: Jack's line at the 2026-09-05 forcing
//                   projected into the Lookout pose, the residual against the
//                   recorded locus-measured.json feature points
//
// GATE (lesson 4). On the shipped bake with zero knobs the scorecard must
// reproduce, number for number, the records each instrument already
// published: PEEL_FLOOR (floors, bands, digests), qa/break-field/summary.json
// (activation), physics-core-2026-09-23/summary.json (R4 windows),
// sentinel2-locus-2026-09-23/residuals.json, lookout-locus-2026-09-23/
// residual.json and peel-band-2026-09-24/field.json (the field-day cells). The
// gate result prints FIRST; a mismatch is reported before anything else is
// trusted. With knobs or an alternate bed the gate is not applicable and says
// so.
//
// KNOBS. `--knobs=path.json` carries the same per-spot crest / beta / ceil
// knobs measure_peel_band_field.mjs serves through its load hook
// (scripts/lib/reef-knobs.mjs); here they are served at bed.js's PLAIN URL,
// so every instrument above scores the knob bake through the hooks it already
// uses. `--bed=<tag>` is the ordinary bed-source switch. `--reef=<arm>` is a
// pass-through: if the bake exports a reef-arm switch (setReefFitArm /
// setReefArm / setReefFitMode) it is called with the arm; otherwise the flag is
// recorded as ignored.
//
// VERDICT. One line per spot, PASS or FAIL naming the first failing criterion,
// in this order: dry posts untouched; no wet post above MLLW + 0.1 m; the card
// is a peel by the floor's criterion; no clean off-ramp on-reef reversal at
// the card; no Sentinel-2 cell contradicted on the reef arm; (Second Peak) both
// field-day cells inside the observed brackets with alpha >= 30 deg on the
// wedge; (Jack's) the Lookout Hs line at or inside the photographed wave A
// (not seaward of it beyond the pose envelope). The H0 window, the R4 window, the floor, the band, the
// activation, the card-target residual and the count above the OLD -0.5 m
// ceiling are reported, not gated: they describe the bake, the gated criteria
// are the observations and invariants a refit must not break.
//
// Usage:
//   node scripts/score_reef_fit.mjs                        # shipped, ~8 min (the tide bands are most of it)
//   node scripts/score_reef_fit.mjs --fast                 # no tide bands, ~40 s
//   node scripts/score_reef_fit.mjs --knobs=k.json --label=hypothetical-secondpeak
//   --bed=cudem19   --reef=legacy   --out=qa/reef-score   --spots=secondpeak,jacks
//   node scripts/score_reef_fit.mjs --render=qa/reef-score/shipped.json   # re-render the .md from a run's JSON
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute, basename } from 'node:path';
import { registerReefKnobs, normalizeKnobs, hasKnobs } from './lib/reef-knobs.mjs';
import { bedSourceTag } from './lib/bed-source.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ASSETS = join(ROOT, 'docs/research/assets');
const flag = (k, dflt) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : dflt; };
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

// Knobs first: the plain bed.js URL is served patched from here on, so this
// must precede every import that reaches bed.js.
const KNOBS_PATH = isMain ? flag('knobs', '') : '';
export const KNOBS = normalizeKnobs(KNOBS_PATH ? JSON.parse(readFileSync(isAbsolute(KNOBS_PATH) ? KNOBS_PATH : join(ROOT, KNOBS_PATH), 'utf8')) : {});
registerReefKnobs(KNOBS);

// Import order matters. measure_reef_fit_signed.mjs registers the load hook
// that appends its read-only instrument export to bed.js, then imports
// measure_break_activation.mjs, which installs the bed-source switch and the
// `three` hook and imports bed.js itself. Everything after that shares the
// one bed.js instance (knobbed or shipped).
const F = await import('./measure_reef_fit_signed.mjs');
const I = await import('./measure_break_activation.mjs');
const PH = await import('./measure_physics_residuals.mjs');
const PB = await import('./measure_peel_band_field.mjs');
const S2 = await import('./compare_sentinel2_line.mjs');
const LL = await import('./lib/lookout-line.mjs');
const bed = await import('../web-three/js/bed.js');
const { PRESETS, PEEL_FLOOR, PEEL_FLOOR_BASIS, peelFloorH0 } = await import('../shared/params.js');
const { PP_GEO_DATA } = await import('../data/model/pp_geo_profiles.js');
const { PP_DEPTH_DATA } = await import('../data/model/pp_depth_patches.js');
const D = await import('../web-three/js/dispersion.js');

export const BED_SOURCE = I.BED_SOURCE || '';
export const HAND = 1;                       // every mapped preset is a right (REEF_FIT_SIGNED)
export const WINDOW_MULTS = Array.from({ length: 13 }, (_, i) => +(0.7 + 0.05 * i).toFixed(2));
export const OLD_CEIL_EL = -0.5;             // m NAVD88, bed.js REEF_CEIL_EL as shipped
export const MLLW_EL = PP_DEPTH_DATA.mslAboveNavd88M + PP_DEPTH_DATA.tideRangeM[0];   // MLLW about NAVD88 (+0.043)
export const NEW_CEIL_EL = +(MLLW_EL + 0.1).toFixed(3);                              // +0.143 m NAVD88
export const FIELD_DAY = {
  observed: PB.OBSERVED,                     // Vp 4.7-6.7, c 3.8-5.3, alpha 55-73 (36-49 on seqA)
  alphaFloorDeg: PB.ALPHA_WALKER_DEG,        // Walker's 30 deg, the task's criterion
  cells: [{ label: 'SC116 Hs, verified tide', H0: 0.778, T: 16, tide: 0.5 },
          { label: 'Surfline 3 ft, predicted tide', H0: 0.914, T: 16, tide: 0.357 }],
};
// The reef-arm pass-through, if the bake exposes one.
export const REEF_ARM = (() => {
  const arm = isMain ? flag('reef', '') : '';
  if (!arm) return null;
  for (const fn of ['setReefFitArm', 'setReefArm', 'setReefFitMode']) {
    if (typeof bed[fn] === 'function') { bed[fn](arm); return { arm, applied: true, via: fn }; }
  }
  return { arm, applied: false, note: 'the bake exports no reef-arm switch (setReefFitArm / setReefArm / setReefFitMode); flag ignored' };
})();

const round = (v, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : (v === undefined ? null : v));
const f = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? 'n/a' : Number(v).toFixed(d));
const sgn = (t, d = 2) => (Number.isFinite(t) ? `${t >= 0 ? '+' : ''}${t.toFixed(d)}` : 'n/a');
function mdTable(head, rows) {
  const line = (r) => `| ${r.join(' | ')} |`;
  return [line(head), line(head.map(() => '---')), ...rows.map(line)].join('\n');
}

// The seven shipped presets with a reef fit on this bake.
export const KEYS = Object.keys(PRESETS).filter((k) => PRESETS[k].geoSpot && bed.reefFitFor(PRESETS[k].geoSpot));

// ---------- reef audit, two ceilings ----------
// bed.reefAudit counts wet posts raised above REEF_CEIL_EL; the same count
// against a candidate ceiling, off the same composite grids (u16-decoded).
export function reefAuditAt(spot) {
  const a = bed.reefAudit(spot);
  if (!a) return null;
  const B = bed.__reefFitInstrument;
  const raw = B.elevGrid(spot, false), aug = B.elevGrid(spot, true);
  const { elevMinM, elevMaxM } = PP_DEPTH_DATA.grid;
  const quantum = (elevMaxM - elevMinM) / 65535;
  let aboveNew = 0, maxAugEl = -Infinity;
  for (let i = 0; i < raw.length; i++) {
    if (aug[i] !== raw[i] && aug[i] > maxAugEl) maxAugEl = aug[i];
    if (raw[i] < NEW_CEIL_EL && aug[i] > NEW_CEIL_EL + quantum) aboveNew++;
  }
  return { postsTouched: a.postsTouched, deepened: a.deepened, dryTouched: a.dryTouched,
           aboveOldCeil: a.aboveCeil, aboveMllw01: aboveNew, maxRaiseM: round(a.maxRaiseM, 3),
           maxTouchedElNavd88: Number.isFinite(maxAugEl) ? round(maxAugEl, 3) : null, checksum: a.checksum };
}

// ---------- the H0 window on the floor's criterion ----------
export function h0Window(key, { mults = WINDOW_MULTS } = {}) {
  const card = I.cardOf(key);
  const basis = I.fieldBasis(key, { T: card.T, tide: 0 });
  const rungs = mults.map((mult) => {
    const H0 = +(card.H0 * mult).toFixed(3);
    const inst = I.instrumentState(key, { H0, T: card.T, tide: 0 }, basis);
    const rep = I.repSummary(inst, HAND).shipped;
    return { mult, H0, alpha: round(rep.medianClean, 2), onReef: round(rep.onReefFrac, 3), reversals: rep.reversals,
             healthy: I.peelHealthy(rep, HAND), fails: I.peelFailures(rep, HAND) };
  });
  const failing = rungs.filter((r) => !r.healthy);
  return { mults, pass: failing.length === 0, rungs, failingH0: failing.map((r) => r.H0) };
}

// ---------- the tide band of a floor ----------
// holds(t) = every 0.01 m rung from floor0 to the card is healthy at tide t,
// which is measureTideFloor's "floorH0(t) <= floorH0(0) and the card is a
// peel" (floorH0(t) is the lowest rung from which every rung up to the card
// is healthy). Walked outward from 0 to the first failing tide on each side;
// the same ladders, the same instrumentState/repSummary reductions.
export function tideBand(key, floor0, { log = null } = {}) {
  const card = I.cardOf(key);
  const ladder = I.tideLadder();
  const i0 = ladder.findIndex((t) => Math.abs(t) < 1e-9);
  const h0Ladder = [];
  for (let h = I.FLOOR_LADDER_LO_M; h <= card.H0 + 1e-9; h += I.FLOOR_STEP_M) {
    const r = Math.round(h * 10000) / 10000;
    if (r >= floor0 - 1e-9) h0Ladder.push(r);
  }
  if (!h0Ladder.length || Math.abs(h0Ladder[0] - floor0) > 1e-9) throw new Error(`${key}: floor ${floor0} is not on the ${I.FLOOR_STEP_M} m ladder`);
  let bakes = 0;
  const probe = (tide) => {
    const basis = I.fieldBasis(key, { T: card.T, tide });
    const rungs = [];
    for (const H0 of h0Ladder) {
      const inst = I.instrumentState(key, { H0, T: card.T, tide }, basis);
      const rep = I.repSummary(inst, HAND).shipped;
      bakes++;
      const healthy = I.peelHealthy(rep, HAND);
      rungs.push({ H0, alpha: rep.medianClean, onReef: rep.onReefFrac, healthy, fails: I.peelFailures(rep, HAND) });
      if (!healthy) break;
    }
    const fail = rungs.find((r) => !r.healthy) || null;
    if (log) log(`  ${key} tide ${sgn(tide, 3)}: ${fail ? `FAILS at ${fail.H0} (${fail.fails.join('+')})` : 'holds'}`);
    return { tide, holds: !fail, rungs, fail };
  };
  const probes = new Map();
  const at = (i) => { if (!probes.has(i)) probes.set(i, probe(ladder[i])); return probes.get(i); };
  if (!at(i0).holds) return { floor0, band: null, bakes, note: `the floor ${floor0} does not hold at tide 0` };
  let a = i0, b = i0;
  while (a > 0 && at(a - 1).holds) a--;
  while (b < ladder.length - 1 && at(b + 1).holds) b++;
  const edgeOf = (iEdge, iBeyond) => {
    const e = at(iEdge);
    const first = e.rungs[0], last = e.rungs[e.rungs.length - 1];
    const base = { tide: ladder[iEdge], alphaCard: round(last.alpha, 1), onReefCard: round(last.onReef, 2),
                   alphaFloor: round(first.alpha, 1), onReefFloor: round(first.onReef, 2) };
    if (iBeyond < 0 || iBeyond >= ladder.length) return { ...base, beyondTide: null };
    const by = at(iBeyond), fail = by.fail;
    const same = e.rungs.find((r) => Math.abs(r.H0 - fail.H0) < 1e-9);
    return { tide: base.tide, beyondTide: ladder[iBeyond], failH0: fail.H0, fails: fail.fails.join('+'),
             alphaAtEdge: round(same.alpha, 1), alphaBeyond: round(fail.alpha, 1),
             onReefAtEdge: round(same.onReef, 2), onReefBeyond: round(fail.onReef, 2),
             alphaCard: base.alphaCard, onReefCard: base.onReefCard, alphaFloor: base.alphaFloor, onReefFloor: base.onReefFloor };
  };
  const tideEdges = { lo: edgeOf(a, a - 1), hi: edgeOf(b, b + 1) };
  const band = [ladder[a], ladder[b]];
  const digest = I.tideDigest(key, { tideEdges, floorH0: floor0, cardH0: card.H0, basisT: card.T });
  return { floor0, band, tideEdges, tideDigest: digest, bakes, tidesProbed: probes.size };
}

// ---------- one spot ----------
export function scoreSpot(key, { fast = false, log = null, sentinel = null, lookout = null } = {}) {
  const t0 = Date.now();
  const p = PRESETS[key], spot = p.geoSpot, card = I.cardOf(key);
  const dc = F.disagreeCard(key);
  const cell = PB.measureCell(bed, key, { H0: card.H0, T: card.T, tide: 0 });
  const fit = bed.reefFitFor(spot);
  const s = dc.stats;
  const cardRow = {
    H0: card.H0, T: card.T, tide: 0, alphaTarget: p.alpha,
    alpha: round(s.medianClean, 2), alphaMinusTarget: round(s.medianClean - p.alpha, 2),
    alphaOnReefOffRamp: round(s.medianCleanOnReefNoRamp, 2),
    onReef: round(s.onReefFrac, 3), reversalsOffRamp: s.reversalsNoRamp, reversalsOnReef: s.reversals, reversalsAll: s.reversalsAll,
    rampStations: s.rampStations, pinned: s.pinnedN, gapN: s.gapN, stations: s.stations,
    Vp: cell.Vp, VpQ1: cell.VpQ1, VpQ3: cell.VpQ3, c: cell.c, depth: cell.depth, zLine: cell.zLine, dzc: cell.dzc,
    healthy: Number.isFinite(s.medianClean) && Math.sign(s.medianClean) === HAND && Math.abs(s.medianClean) >= I.ALPHA_FLOOR_DEG && s.onReefFrac >= I.ON_REEF_MIN,
    fit: fit ? { betaDeg: round(fit.betaDeg, 3), fitDerivedDeg: round(fit.fitDerivedDeg, 2), targetDeg: fit.targetDeg, withinTol: fit.withinTol,
                 signViolations: fit.signViolations, crestDepthM: round(bed.MSL_ABOVE_NAVD88 - fit.targetEl, 3), targetElNavd88: round(fit.targetEl, 3),
                 zRef: fit.zRef, hbM: round(fit.hbM, 3), fitMetric: fit.fitMetric } : null,
  };
  if (log) log(`${key}: card alpha ${f(cardRow.alpha)} (target ${p.alpha}), on-reef ${f(cardRow.onReef, 2)}, Vp ${f(cardRow.Vp)}`);
  const audit = reefAuditAt(spot);
  const win = h0Window(key);
  if (log) log(`${key}: H0 window ${win.pass ? 'PASS' : `FAIL at ${win.failingH0.join(' ')}`}`);
  const r4 = PH.peelWindow(key, { tide: 0 });
  const fl = I.measurePeelFloor(key, { handSign: HAND });
  const floor = { floorLo: fl.floorLo ?? null, floorHi: fl.floorHi ?? null, floorH0: fl.floorH0 ?? null, note: fl.note || null,
                  flipLo: fl.largestFlip?.from ?? null, flipHi: fl.largestFlip?.to ?? null, flipDzM: fl.largestFlip?.dzMax ?? null,
                  alphaBelow: round(fl.alphaBelow, 1), alphaAbove: round(fl.alphaAbove, 1),
                  onReefBelow: round(fl.onReefBelow, 2), onReefAbove: round(fl.onReefAbove, 2), failedBelow: fl.failedBelow || null,
                  basisT: card.T, bakeDigest: fl.bakeDigest || null, activationH0: fl.reefActivationH0,
                  worstGateDzM: fl.worstGate?.maxDzM ?? null, shippedFloorH0: PEEL_FLOOR[key]?.floorH0 ?? null };
  if (log) log(`${key}: floor ${f(floor.floorLo, 2)}->${f(floor.floorHi, 2)} (PEEL_FLOOR ${f(floor.shippedFloorH0, 2)}), activation ${f(floor.activationH0, 3)}`);
  let band = null;
  if (floor.floorH0 === null) band = { band: null, note: floor.note || 'no floor on this bake' };
  else if (fast) band = { band: null, note: 'skipped (--fast)' };
  else band = tideBand(key, floor.floorH0, { log });
  if (log && band.band) log(`${key}: tide band [${sgn(band.band[0])}, ${sgn(band.band[1])}] (PEEL_FLOOR ${JSON.stringify(PEEL_FLOOR[key]?.tideBandM ?? null)}), ${band.bakes} bakes`);
  const out = { key, label: p.label, spot, card: cardRow, audit, window: win,
                r4: { windowLoH0: r4.windowLoH0, windowHiH0: r4.windowHiH0, rungs: r4.rungs.map((r) => ({ mult: r.mult, H0: r.H0, alphaDeg: r.alphaDeg })) },
                floor, band, fieldDay: null, sentinel: null, lookout: null };
  if (key === 'secondpeak') out.fieldDay = fieldDayCells();
  if (sentinel) out.sentinel = sentinelForSpot(sentinel, spot);
  if (key === 'jacks' && lookout) out.lookout = lookoutForJacks(lookout);
  out.verdict = verdictOf(out);
  out.seconds = round((Date.now() - t0) / 1000, 1);
  if (log) log(`${key}: ${out.verdict.line} (${out.seconds} s)`);
  return out;
}

// ---------- Second Peak: the 2026-08-15 cells ----------
export function fieldDayCells() {
  const o = FIELD_DAY.observed, inR = (v, [lo, hi]) => Number.isFinite(v) && v >= lo && v <= hi;
  return FIELD_DAY.cells.map((c) => {
    const m = PB.measureCell(bed, 'secondpeak', { H0: c.H0, T: c.T, tide: c.tide });
    const checks = { alpha: Number.isFinite(m.alpha) && Math.sign(m.alpha) === HAND && Math.abs(m.alpha) >= FIELD_DAY.alphaFloorDeg,
                     onReef: m.onReef >= I.ON_REEF_MIN, Vp: inR(m.Vp, o.Vp_mps), c: inR(m.c, o.c_mps) };
    return { ...c, alpha: m.alpha, alphaQ1: m.alphaQ1, alphaQ3: m.alphaQ3, Vp: m.Vp, c: m.c, onReef: m.onReef, depth: m.depth, dzc: m.dzc,
             checks, pass: Object.values(checks).every(Boolean), fails: Object.keys(checks).filter((k) => !checks[k]) };
  });
}

// ---------- Sentinel-2, all spots at once ----------
// compare_sentinel2_line.mjs compareScene() on this bake (its module-level
// bed.js is the same knobbed-or-shipped instance), then main()'s verdict rule
// per (main scene, spot): CONTRADICTED when the reef arm's H1/10 line sits
// > 2 sigma shoreward of the median station foam edge; among consistent arms
// the Hs/Ks line nearest the foam is 'closest' when it leads the next by
// >= 2 sigma. Same numbers as residuals.json, to the decimal.
export function sentinelAll() {
  const loci = JSON.parse(readFileSync(join(ASSETS, 'sentinel2-locus-2026-09-23/loci.json'), 'utf8'));
  const arms = Object.keys(S2.ARMS), sigma = S2.PIXEL_REG_SIGMA_M;
  const score = Object.fromEntries(arms.map((a) => [a, { contradicted: 0, consistent: 0, closest: 0 }]));
  let cells = 0;
  const perCell = [];
  for (const scene of loci.scenes) {
    const cmp = S2.compareScene(scene);
    for (const [spotName, sp] of Object.entries(cmp.spots)) {
      const off = (arm, v) => sp.arms[arm][v].offsets.k6.median;
      const verdicts = {};
      let closest = null;
      if (sp.nWithWhitewater > 0) {
        for (const arm of arms) verdicts[arm] = off(arm, 'h10') > 2 * sigma ? 'contradicted' : 'consistent';
        if (!scene.supplementary) {
          cells++;
          for (const arm of arms) score[arm][verdicts[arm]]++;
          const ok = arms.filter((a) => verdicts[a] === 'consistent').sort((a, b) => Math.abs(off(a, 'deshoaled')) - Math.abs(off(b, 'deshoaled')));
          if (ok.length && (ok.length === 1 || Math.abs(off(ok[1], 'deshoaled')) - Math.abs(off(ok[0], 'deshoaled')) >= 2 * sigma)) { score[ok[0]].closest++; closest = ok[0]; }
        }
      }
      perCell.push({ date: scene.date, supplementary: Boolean(scene.supplementary), spot: spotName, nWithWhitewater: sp.nWithWhitewater,
                     offsets: Object.fromEntries(arms.map((a) => [a, { hs: off(a, 'hs'), deshoaled: off(a, 'deshoaled'), h10: off(a, 'h10') }])),
                     verdicts, closest });
    }
  }
  return { score, cells, sigmaM: sigma, perCell };
}
export function sentinelForSpot(all, spot) {
  const cells = all.perCell.filter((c) => c.spot === spot && !c.supplementary && c.verdicts.reef);
  const contradicted = cells.filter((c) => c.verdicts.reef === 'contradicted');
  return { n: cells.length, contradicted: contradicted.length, consistent: cells.length - contradicted.length,
           closest: cells.filter((c) => c.closest === 'reef').length,
           contradictedDates: contradicted.map((c) => c.date),
           cells: cells.map((c) => ({ date: c.date, verdict: c.verdicts.reef, closest: c.closest, hs: c.offsets.reef.hs, deshoaled: c.offsets.reef.deshoaled, h10: c.offsets.reef.h10 })) };
}

// ---------- the Lookout residual at Jack's ----------
export function lookoutAll() {
  const measured = JSON.parse(readFileSync(join(ASSETS, 'lookout-locus-2026-09-23/locus-measured.json'), 'utf8'));
  const lines = LL.lookoutModelLines({ bed, PRESETS, PEEL_FLOOR, peelFloorH0, PP_GEO_DATA, D }, { presetKeys: ['jacks'] });
  const jacks = lines.presets[0];
  const arms = jacks.arms.map((a) => LL.residualSummary(a, measured, '38th'));
  const wa = measured.features.whitewater_edge_wave_a, wb = measured.features.whitewater_edge_wave_b;
  // the photo's own pose envelope at each feature: half of (range_hi - range_lo)
  const envelope = { waveA: round((wa.range_hi - wa.range_lo) / 2, 1), waveB: round((wb.range_hi - wb.range_lo) / 2, 1) };
  return { forcing: lines.forcing, h0Arms: lines.h0Arms.map((a) => ({ label: a.label, H0: round(a.H0, 3) })), envelopeM: envelope, arms,
           dayHandling: jacks.dayHandling };
}
// The photograph bounds the drawn line from the seaward side only: the wave
// carrying the riders broke where its whitewater edge is, so the Hs line may
// sit at or inside that edge (a bigger wave of the set broke there) but not
// seaward of it by more than the pose envelope. Reported: wave A / wave B /
// lineup at raw Hs and at H1/10 = 1.27 Hs (an arm whose line does not cross a
// feature's columns in frame reads null, as residual.json does).
export function lookoutForJacks(all) {
  const pick = (h0Arm) => all.arms.find((a) => a.h0Arm === h0Arm && a.bed === 'reef');
  const row = (a) => (a ? { H0: a.H0, waveA: a.features.whitewater_edge_wave_a.d_range_median, waveB: a.features.whitewater_edge_wave_b.d_range_median,
                            lineup: a.features.lineup_cluster.d_range_median, crestA: a.features.crest_wave_a.d_range_median,
                            nWaveA: a.features.whitewater_edge_wave_a.n } : null);
  const raw = row(pick('raw')), set = row(pick('set1.27'));
  const defined = raw && raw.nWaveA > 0 && Number.isFinite(raw.waveA);
  const pass = defined && raw.waveA <= all.envelopeM.waveA;
  return { raw, set127: set, envelopeM: all.envelopeM, pass, note: defined ? null : 'raw-Hs reef line does not cross wave A in frame' };
}

// ---------- the verdict ----------
export const CRITERIA = [
  ['dry posts untouched', (s) => s.audit && s.audit.dryTouched === 0, (s) => `${s.audit?.dryTouched ?? 'n/a'} dry posts touched`],
  [`no wet post above MLLW+0.1 m (${sgn(NEW_CEIL_EL, 3)} NAVD88)`, (s) => s.audit && s.audit.aboveMllw01 === 0, (s) => `${s.audit?.aboveMllw01 ?? 'n/a'} posts above ${sgn(NEW_CEIL_EL, 3)} m`],
  ['card is a peel (sign, alpha >= 10, on-reef >= 0.5)', (s) => s.card.healthy, (s) => `card alpha ${f(s.card.alpha)}, on-reef ${f(s.card.onReef, 2)}`],
  ['no clean off-ramp on-reef reversal at the card', (s) => s.card.reversalsOffRamp === 0, (s) => `${s.card.reversalsOffRamp} off-ramp reversals`],
  ['no Sentinel-2 cell contradicted (reef arm)', (s) => !s.sentinel || s.sentinel.contradicted === 0, (s) => `${s.sentinel.contradicted}/${s.sentinel.n} contradicted (${s.sentinel.contradictedDates.join(', ')})`],
  ['2026-08-15 field-day cells (Second Peak)', (s) => !s.fieldDay || s.fieldDay.every((c) => c.pass), (s) => s.fieldDay.filter((c) => !c.pass).map((c) => `${c.H0}/${sgn(c.tide, 3)}: ${c.fails.join('+')}`).join('; ')],
  ['Lookout: Hs line not seaward of photographed wave A beyond the pose envelope (Jack\'s)', (s) => !s.lookout || s.lookout.pass, (s) => s.lookout.note || `wave A ${sgn(s.lookout.raw?.waveA, 0)} m vs +${s.lookout.envelopeM.waveA}`],
];
export function verdictOf(s) {
  const checks = CRITERIA.map(([name, test, why]) => { const ok = Boolean(test(s)); return { name, ok, why: ok ? null : why(s) }; });
  const first = checks.find((c) => !c.ok);
  return { pass: !first, line: first ? `FAIL — ${first.name}: ${first.why}` : 'PASS', checks };
}

// ---------- the gate against the published records ----------
export function gateAgainstRecords(spots, sentinel, lookout) {
  const rows = [];
  const add = (record, key, field, expected, got, tol = 0) => {
    const num = Number.isFinite(expected) && Number.isFinite(got);
    const ok = num ? Math.abs(expected - got) <= tol + 1e-12 : JSON.stringify(expected) === JSON.stringify(got);
    rows.push({ record, key, field, expected, got, ok });
  };
  const readJson = (rel) => { const p = join(ROOT, rel); return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null; };
  const qaSummary = readJson('qa/break-field/summary.json');
  const physics = readJson('docs/research/assets/physics-core-2026-09-23/summary.json');
  const s2 = readJson('docs/research/assets/sentinel2-locus-2026-09-23/residuals.json');
  const lk = readJson('docs/research/assets/lookout-locus-2026-09-23/residual.json');
  const field = readJson('docs/research/assets/peel-band-2026-09-24/field.json');
  for (const s of spots) {
    const key = s.key, pf = PEEL_FLOOR[key];
    if (pf) {
      for (const k of ['floorLo', 'floorHi', 'floorH0', 'flipLo', 'flipHi', 'basisT', 'bakeDigest']) add('PEEL_FLOOR', key, k, pf[k], s.floor[k]);
      for (const k of ['alphaBelow', 'alphaAbove']) add('PEEL_FLOOR', key, k, pf[k], s.floor[k], 0.051);
      for (const k of ['onReefBelow', 'onReefAbove']) add('PEEL_FLOOR', key, k, pf[k], s.floor[k], 0.0051);
      if (s.band?.band) {
        add('PEEL_FLOOR', key, 'tideBandM', pf.tideBandM, s.band.band);
        add('PEEL_FLOOR', key, 'tideDigest', pf.tideDigest, s.band.tideDigest);
        for (const side of ['lo', 'hi']) for (const k of Object.keys(pf.tideEdges[side])) {
          const e = pf.tideEdges[side][k], g = s.band.tideEdges[side][k];
          add('PEEL_FLOOR', key, `tideEdges.${side}.${k}`, e, g, typeof e === 'number' && (k.startsWith('alpha') ? 0.051 : k.startsWith('onReef') ? 0.0051 : 0));
        }
      } else rows.push({ record: 'PEEL_FLOOR', key, field: 'tideBandM', expected: pf.tideBandM, got: s.band?.note || null, ok: null });
    } else add('PEEL_FLOOR', key, 'floorH0', null, s.floor.floorH0);
    const act = qaSummary?.presets?.[key]?.peelFloor?.reefActivationH0 ?? qaSummary?.reefActivation?.[key]?.H0;
    if (act !== undefined) add('qa/break-field/summary.json', key, 'reefActivationH0', round(act, 4), round(s.floor.activationH0, 4));
    const w = physics?.windows?.find((x) => x.key === key);
    if (w) {
      add('physics-core summary.json', key, 'windowLoH0', w.windowLoH0, s.r4.windowLoH0);
      add('physics-core summary.json', key, 'windowHiH0', w.windowHiH0, s.r4.windowHiH0);
      add('physics-core summary.json', key, 'rungs.alphaDeg', w.rungs.map((r) => r.alphaDeg), s.r4.rungs.map((r) => r.alphaDeg));
    }
    if (s2 && s.sentinel) {
      for (const [sid, sc] of Object.entries(s2.scenes)) {
        const rec = sc.spots[s.spot]; if (!rec || sc.supplementary || !rec.verdicts?.reef) continue;
        const got = s.sentinel.cells.find((c) => sid.includes(c.date.replace(/-/g, '')));
        add('sentinel2 residuals.json', key, `${sid.slice(11, 19)} reef verdict`, rec.verdicts?.reef ?? null, got?.verdict ?? null);
        add('sentinel2 residuals.json', key, `${sid.slice(11, 19)} reef h10 offset`, rec.arms.reef.h10.offsets.k6.median, got?.h10 ?? null);
        add('sentinel2 residuals.json', key, `${sid.slice(11, 19)} reef Hs/Ks offset`, rec.arms.reef.deshoaled.offsets.k6.median, got?.deshoaled ?? null);
      }
    }
    if (field && s.fieldDay) {
      for (const c of s.fieldDay) {
        const rec = field.observedCells.find((o) => o.bed === 'reef' && o.T === c.T && Math.abs(o.H0 - c.H0) < 1e-6 && Math.abs(o.tide - c.tide) < 1e-6);
        for (const k of ['alpha', 'Vp', 'c', 'onReef']) add('peel-band field.json', key, `${c.H0}/${sgn(c.tide, 3)} ${k}`, rec?.[k] ?? null, c[k], k === 'onReef' ? 0.0005 : 0.005);
      }
    }
  }
  if (s2 && sentinel) for (const arm of ['reef', 'plane', 'measured']) add('sentinel2 residuals.json', 'all', `score.${arm}`, s2.summary.score[arm], sentinel.score[arm]);
  if (lk && lookout) {
    for (const rec of lk.arms) {
      const got = lookout.arms.find((a) => a.h0Arm === rec.h0Arm && a.bed === rec.bed);
      for (const feat of LL.RESIDUAL_FEATURES) for (const k of ['d_range_median', 'd_z_median']) {
        // the recorded feature points are 2-dp rounded (locus-measured.json); a
        // median re-formed from them can differ by that rounding
        add('lookout residual.json', 'jacks', `${rec.h0Arm}/${rec.bed} ${feat} ${k}`, rec.features[feat][k], got?.features[feat][k] ?? null, 0.0151);
      }
    }
  }
  const checked = rows.filter((r) => r.ok !== null);
  const mismatches = checked.filter((r) => !r.ok);
  return { applicable: true, checked: checked.length, matched: checked.length - mismatches.length, mismatches, skipped: rows.filter((r) => r.ok === null) };
}
export function gateMarkdown(g) {
  if (!g.applicable) return `## Gate: not applicable — ${g.note}\n`;
  const out = [`## Gate against the published records: ${g.matched}/${g.checked} matched${g.mismatches.length ? ` — ${g.mismatches.length} MISMATCH` : ''}${g.skipped.length ? ` (${g.skipped.length} not checked: ${g.skipped.map((s) => `${s.key} ${s.field} — ${s.got}`).join('; ')})` : ''}\n`];
  if (g.mismatches.length) out.push(mdTable(['record', 'spot', 'field', 'expected', 'got'], g.mismatches.map((m) => [m.record, m.key, m.field, JSON.stringify(m.expected), JSON.stringify(m.got)])));
  return out.join('\n');
}

// ---------- tables ----------
const cellR4 = (v) => (v === null ? 'none' : typeof v === 'object' ? `open (${Object.values(v)[0]})` : f(v, 2));
export function scorecardMarkdown(spots, sentinel, lookout, meta) {
  const out = [];
  out.push(`## Reef scorecard — ${meta.label} (${meta.bedSource || 'shipped NCEI 1/3" 2012'}; knobs ${hasKnobs(meta.knobs) ? JSON.stringify(meta.knobs) : 'none'}${meta.reefArm ? `; reef arm ${JSON.stringify(meta.reefArm)}` : ''})\n`);
  out.push(mdTable(['spot', 'card α (target)', 'on-reef', 'rev off-ramp / ramp st.', 'Vp m/s', 'H0 window 0.7–1.3× (fails)', 'R4 |α|≥30°', 'floor', 'tide band', 'activation', 'posts >−0.5 / >+0.14 / dry', 'S2 reef contradicted / closest', 'verdict'],
    spots.map((s) => [s.label, `${f(s.card.alpha)} (${s.card.alphaTarget})`, f(s.card.onReef, 2), `${s.card.reversalsOffRamp} / ${s.card.rampStations}`, f(s.card.Vp),
      s.window.pass ? 'pass' : `FAIL (${s.window.failingH0.map((h) => h.toFixed(2)).join(' ')})`,
      `${cellR4(s.r4.windowLoH0)} – ${cellR4(s.r4.windowHiH0)}`,
      s.floor.floorH0 === null ? `none (${s.floor.note || 'card not a peel'})` : f(s.floor.floorH0, 2),
      s.band?.band ? `[${sgn(s.band.band[0], 3)}, ${sgn(s.band.band[1], 3)}]` : (s.band?.note || 'n/a'),
      f(s.floor.activationH0, 3),
      s.audit ? `${s.audit.aboveOldCeil} / ${s.audit.aboveMllw01} / ${s.audit.dryTouched}` : 'n/a',
      s.sentinel ? `${s.sentinel.contradicted}/${s.sentinel.n} / ${s.sentinel.closest}` : 'n/a',
      s.verdict.line])));
  const sp = spots.find((s) => s.key === 'secondpeak');
  if (sp?.fieldDay) {
    out.push(`\n### Second Peak, the 2026-08-15 cells (observed Vp ${FIELD_DAY.observed.Vp_mps.join('–')}, c ${FIELD_DAY.observed.c_mps.join('–')}, α ≥ ${FIELD_DAY.alphaFloorDeg}° on the wedge)\n`);
    out.push(mdTable(['cell', 'H0', 'T', 'tide', 'α med [q1, q3]', 'Vp', 'c', 'on-reef', 'depth', 'z−zc', 'verdict'],
      sp.fieldDay.map((c) => [c.label, f(c.H0, 3), c.T, sgn(c.tide, 3), `${f(c.alpha)} [${f(c.alphaQ1)}, ${f(c.alphaQ3)}]`, f(c.Vp), f(c.c, 2), f(c.onReef, 2), f(c.depth, 2), f(c.dzc, 0), c.pass ? 'pass' : `FAIL (${c.fails.join('+')})`])));
  }
  if (sentinel) {
    out.push(`\n### Sentinel-2, all spots (${sentinel.cells} cells): reef ${sentinel.score.reef.contradicted}/${sentinel.score.reef.consistent}/${sentinel.score.reef.closest}, plane ${sentinel.score.plane.contradicted}/${sentinel.score.plane.consistent}/${sentinel.score.plane.closest}, measured ${sentinel.score.measured.contradicted}/${sentinel.score.measured.consistent}/${sentinel.score.measured.closest} (contradicted / consistent / closest)\n`);
    const apex = spots.filter((s) => ['sewers', 'firstpeak', 'secondpeak'].includes(s.key) && s.sentinel);
    if (apex.length) {
      out.push('Apex cells, reef arm (H1/10 offset m, + = model shoreward of the foam; contradicted when > +16):\n');
      const dates = [...new Set(apex.flatMap((s) => s.sentinel.cells.map((c) => c.date)))];
      out.push(mdTable(['spot', ...dates], apex.map((s) => [s.label, ...dates.map((d) => { const c = s.sentinel.cells.find((q) => q.date === d); return c ? `${c.verdict === 'contradicted' ? 'CONTRA' : 'ok'} ${sgn(c.h10, 0)}` : '—'; })])));
    }
  }
  const jk = spots.find((s) => s.key === 'jacks');
  if (jk?.lookout) {
    out.push(`\n### Lookout, Jack's reef arm (model − photo along the ground ray, m; negative = model inside; envelope ±${jk.lookout.envelopeM.waveA} at wave A, ±${jk.lookout.envelopeM.waveB} at wave B)\n`);
    out.push(mdTable(['H0 arm', 'H0', 'wave A', 'wave B', 'lineup', 'crest A'],
      [['raw Hs', jk.lookout.raw], ['1.27·Hs', jk.lookout.set127]].map(([l, r]) => [l, f(r?.H0, 2), f(r?.waveA, 0), f(r?.waveB, 0), f(r?.lineup, 0), f(r?.crestA, 0)])));
  }
  out.push('\nVerdict criteria, in order: ' + CRITERIA.map(([n]) => n).join('; ') + '. Reported, not gated: card α vs target, the H0 window, the R4 window, floor, band, activation, and the count above the old −0.5 m ceiling.');
  return out.join('\n');
}

// ---------- main ----------
export async function run({ keys = KEYS, fast = false, log = null } = {}) {
  const t0 = Date.now();
  const sentinel = sentinelAll();
  if (log) log(`Sentinel-2: reef ${sentinel.score.reef.contradicted}/${sentinel.score.reef.consistent}/${sentinel.score.reef.closest} over ${sentinel.cells} cells`);
  const lookout = lookoutAll();
  const spots = keys.map((k) => scoreSpot(k, { fast, log, sentinel, lookout }));
  const gateApplicable = !hasKnobs(KNOBS) && !BED_SOURCE && !(REEF_ARM && REEF_ARM.applied);
  const gate = gateApplicable ? gateAgainstRecords(spots, sentinel, lookout)
    : { applicable: false, note: `gate is only defined on the shipped bake with zero knobs (knobs ${hasKnobs(KNOBS) ? 'active' : 'none'}, bed ${BED_SOURCE || 'shipped'}${REEF_ARM?.applied ? `, reef arm ${REEF_ARM.arm}` : ''})` };
  return { gate, spots, sentinel, lookout, seconds: round((Date.now() - t0) / 1000, 1) };
}

function renderFromJson(path) {
  const json = JSON.parse(readFileSync(isAbsolute(path) ? path : join(ROOT, path), 'utf8'));
  const md = [gateMarkdown(json.gate), scorecardMarkdown(json.spots, json.sentinel, json.lookout, json), `\n${json.seconds} s`].join('\n');
  writeFileSync(path.replace(/\.json$/, '.md'), md + '\n');
  console.log(md);
}

async function main() {
  if (flag('render', '')) return renderFromJson(flag('render', ''));
  const fast = process.argv.includes('--fast');
  const keys = flag('spots', '') ? flag('spots', '').split(',') : KEYS;
  const outArg = flag('out', 'qa/reef-score');
  const outDir = isAbsolute(outArg) ? outArg : join(ROOT, outArg);
  const label = flag('label', KNOBS_PATH ? basename(KNOBS_PATH).replace(/\.json$/, '') : 'shipped') + (BED_SOURCE ? `.${BED_SOURCE}` : '');
  mkdirSync(outDir, { recursive: true });
  const log = (m) => process.stderr.write(m + '\n');
  if (REEF_ARM) log(`reef arm: ${JSON.stringify(REEF_ARM)}`);
  const r = await run({ keys, fast, log });
  const meta = { generated: new Date().toISOString(), label, bedSource: BED_SOURCE || null, knobs: KNOBS, knobsPath: KNOBS_PATH || null, reefArm: REEF_ARM,
                 fast, seconds: r.seconds, model: { alphaFloorDeg: I.ALPHA_FLOOR_DEG, onReefMin: I.ON_REEF_MIN, walkerDeg: PB.ALPHA_WALKER_DEG, oldCeilEl: OLD_CEIL_EL, newCeilEl: NEW_CEIL_EL, mllwEl: round(MLLW_EL, 3), windowMults: WINDOW_MULTS, floorBasis: PEEL_FLOOR_BASIS.modelCommit },
                 criteria: CRITERIA.map(([n]) => n),
                 definitions: {
                   alpha: 'stage-median clean signed crest-relative alpha (deg) on the 2 m stage grid, limiter-pinned stations excluded (bed.derivedAlphaDeg)',
                   onReef: 'fraction of stage stations whose line sits on the synthetic uplift footprint',
                   reversalsOffRamp: 'clean on-reef stations with |alpha| > 2 deg and the wrong sign, slew-ramp members excluded (REEF_FIT_SIGNED)',
                   rampStations: 'stations on a maximal one-sign dz/dx run containing a pinned or gap-flagged station',
                   Vp: 'median |lineVelocityMps| over clean non-gap stage stations (14.06 m stencil), m/s',
                   window: `every rung of card x ${WINDOW_MULTS[0]}..${WINDOW_MULTS[WINDOW_MULTS.length - 1]} (tide 0, card T) healthy by the floor criterion`,
                   r4: 'contiguous H0 range around the card (0.7-1.4x) where |alpha| >= 30 deg; null = the card itself does not',
                   band: 'contiguous tide interval around 0 in which every 0.01 m rung from the floor to the card is healthy',
                   aboveMllw01: `wet posts (raw < ${NEW_CEIL_EL} m NAVD88) raised above ${NEW_CEIL_EL} m NAVD88 (MLLW + 0.1 m) by more than one quantum`,
                   sentinel: 'reef arm per (main scene, spot): contradicted when the H1/10 line is > 16 m shoreward of the median foam edge',
                   lookout: 'model - photo along the ground ray at each photo point column, median per feature (lib/lookout-line.mjs residualSummary)',
                 } };
  const md = [gateMarkdown(r.gate), scorecardMarkdown(r.spots, r.sentinel, r.lookout, meta), `\n${r.seconds} s`].join('\n');
  console.log(md);
  const json = { ...meta, gate: r.gate, spots: r.spots, sentinel: r.sentinel, lookout: r.lookout };
  writeFileSync(join(outDir, `${label}.json`), JSON.stringify(json));
  writeFileSync(join(outDir, `${label}.md`), md + '\n');
  log(`wrote ${join(outDir, label)}.json / .md`);
  if (r.gate.applicable && r.gate.mismatches.length) process.exitCode = 2;
}

if (isMain) await main();
