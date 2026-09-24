// Model side of the 2026-08-15 peel-speed residual (VALIDATION_PLAN: "4-5 ft
// is the test of whether the model's 4.8-10 m/s zipper is anywhere near
// right"). Headless: imports bed.js the way measure_break_activation.mjs does
// and reads the SAME functions the HUD and rider read, so the numbers are the
// bake's, not a twin's.
//
// Forcing is pre-registered from the capture note
// (PLEASURE_POINT_CAPTURE_2026-08-15): 3 ft at 16 s SSW 202 deg, tide 4.0 ft
// MLLW = +0.357 m on the model's MSL axis (CO-OPS 9413450: MSL 1.893, MLLW
// 1.031 m station datum). H0 is baked two ways: the reported 0.914 m as the
// model's H0 directly, and de-shoaled from the 15 m MOP depth to deep water
// (H0 = 0.914 / Ks(15 m, 16 s)), since the model shoals H0 from deep water.
//
// Per station on the Second Peak stage (and the two baselines VALIDATION_PLAN
// names, bedShape 1 = plane, 2 = measured without the reef):
//   alpha      derivedAlphaDeg, crest-relative signed peel angle
//   c          phaseSpeedMps = omega / |grad Phi|, the crest speed at the line
//   Vp         lineVelocityMps = the break point's speed along the baked line
//              (peel-geometry.js: omega / (Phi_x + Phi_z zb') * hypot(1, zb'))
//   depth      still water minus bed at the line, and sqrt(g h) for scale
//
//   node scripts/compare_peel_speed.mjs [--out docs/research/assets/surfline-cam-2026-09-23/model_peel_2026-08-15.json]
import { registerHooks } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') {
      return { url: new URL('../web-three/vendor/three.module.js', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const bed = await import('../web-three/js/bed.js');
const { PRESETS } = await import('../shared/params.js');
const D = await import('../web-three/js/dispersion.js');

const OUT = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1]
  : join(ROOT, 'docs/research/assets/surfline-cam-2026-09-23/model_peel_2026-08-15.json'); })();

// ---------- pre-registered forcing ----------
const T = 16;
const H_REPORTED = 3 * 0.3048;                 // 0.914 m, "3 ft at 16 s"
const MOP_DEPTH = 15;                          // SC116 sits on the 15 m contour
const TIDE_MSL = 4.0 * 0.3048 - (1.893 - 1.031); // +0.357 m
const omega = 2 * Math.PI / T;
const cg0 = D.G * T / (4 * Math.PI);
const KsMop = Math.sqrt(cg0 / D.groupVelocityAt(omega, MOP_DEPTH));
const H_DESHOALED = H_REPORTED / KsMop;
const KEY = 'secondpeak';
const SPOT = PRESETS[KEY].geoSpot;
const X_RANGE = [-300, 300];
const [X0, X1] = X_RANGE;

function bake(H0, bedShape, tide = TIDE_MSL) {
  bed.bakeRefraction(SPOT, { T, tide, bedShape, swellDeg: PRESETS[KEY].alpha, xRef: 0 });
  const baked = bed.bakeBreakLine(SPOT, X_RANGE, { H0, T, tide, bedShape, smoothM: 0, peel: null });
  if (!baked) throw new Error('bake returned null');
  const wl = bed.MSL_ABOVE_NAVD88 + tide;
  const st = [];
  for (let x = X0 + 10; x <= X1 - 10; x += 2) {
    const z = bed.breakZAt(x, X0, X1);
    const gap = bed.breakGapAt(x, X0, X1);
    const g = bed.derivedPeelGeometry(x, X0, X1, { omega });
    const el = bed.bedElevBlended(SPOT, x, z, bedShape);
    const depth = el === bed.BED_UNKNOWN ? null : wl - el;
    st.push({ x, z, gap: gap ? 1 : 0,
      alphaDeg: g?.alphaDeg ?? null, c: g?.phaseSpeedMps ?? null,
      Vp: g?.lineVelocityMps == null ? null : Math.abs(g.lineVelocityMps),
      Vx: g?.xVelocityMps ?? null, depth, sqrtGh: depth == null ? null : Math.sqrt(D.G * Math.max(depth, 0)) });
  }
  return st;
}

function q(arr, p) {
  const a = arr.filter(Number.isFinite).sort((u, v) => u - v);
  if (!a.length) return null;
  const i = (a.length - 1) * p; const lo = Math.floor(i); const hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
function summarize(st, sel) {
  const s = st.filter(sel);
  const pick = (k) => s.map((r) => r[k]);
  const stat = (k) => { const v = pick(k); return { median: q(v, 0.5), q1: q(v, 0.25), q3: q(v, 0.75), n: v.filter(Number.isFinite).length }; };
  return { n: s.length, alphaDeg: stat('alphaDeg'), c_mps: stat('c'), Vp_mps: stat('Vp'), depth_m: stat('depth'), sqrtGh_mps: stat('sqrtGh'),
           zLine_m: stat('z') };
}

// Diagnostic arms beyond the pre-registered pair: the morning's offshore buoy
// Hs (46042, 4.6 ft = 1.4 m, the value the 2026-08-15 social capture used) at
// this tide, and the reported H0 at tide 0 — because PEEL_FLOOR.secondpeak
// says the peel dies above tide +0.01 m and below H0 1.11 m, and this day was
// +0.36 m and 0.91 m. Those two arms say which threshold owns the closeout.
const arms = [];
const FORCINGS = [['reported', H_REPORTED, TIDE_MSL], ['deshoaled', H_DESHOALED, TIDE_MSL],
                  ['buoy1.4', 1.4, TIDE_MSL], ['reported@tide0', H_REPORTED, 0], ['buoy1.4@tide0', 1.4, 0]];
for (const [h0Label, H0, tide] of FORCINGS) {
  for (const [bedLabel, bedShape] of [['measured+reef', 0], ['plane', 1], ['measured', 2]]) {
    if (bedShape !== 0 && h0Label.includes('@') ) continue;
    const st = bake(H0, bedShape, tide);
    const notGap = (r) => !r.gap && Number.isFinite(r.alphaDeg);
    arms.push({ h0: h0Label, H0_m: +H0.toFixed(3), tide_msl_m: +tide.toFixed(3), bed: bedLabel, bedShape,
      stage: summarize(st, notGap),
      nearNode: summarize(st, (r) => notGap(r) && Math.abs(r.x) <= 50),
      gapFraction: st.filter((r) => r.gap).length / st.length,
      // a physically surfable peel needs Vp > c (alpha < 90); how much of the stage has one
      peelFraction: st.filter((r) => notGap(r) && Math.abs(r.alphaDeg) > 2 && Math.abs(r.alphaDeg) < 88).length / st.length,
      stations: st.filter((_, i) => i % 5 === 0) });
  }
}

const out = {
  date: '2026-08-15 15:28 PDT', spot: SPOT, preset: KEY, T, tide_msl_m: +TIDE_MSL.toFixed(3),
  H0_reported_m: +H_REPORTED.toFixed(3), Ks_at_mop_15m: +KsMop.toFixed(4), H0_deshoaled_m: +H_DESHOALED.toFixed(3),
  swellDeg_used: PRESETS[KEY].alpha, swellDeg_note: 'bakeRefraction takes the preset alpha as the incident bearing, as main.js does; the reported 202 deg SSW is not wired',
  definitions: {
    alphaDeg: 'bed.derivedAlphaDeg: crest-relative signed peel angle on the baked line (peel-geometry.js)',
    c_mps: 'phaseSpeedMps = omega/|grad Phi| from the refraction bake at the line',
    Vp_mps: '|lineVelocityMps| = speed of the break point along the baked line = c/sin(alpha)',
    stage: 'all non-gap stations x in [-290, 290] at 2 m',
    nearNode: 'non-gap stations |x| <= 50 m',
  },
  arms,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));
const f = (v, d = 2) => (v == null ? 'null' : v.toFixed(d));
console.log(`Second Peak, T=${T}, tide ${f(TIDE_MSL, 3)} m MSL; H0 reported ${f(H_REPORTED, 3)}, Ks(15 m) ${f(KsMop, 3)}, de-shoaled ${f(H_DESHOALED, 3)}`);
console.log('h0             bed             |  alpha med [q1,q3]   c med    Vp med [q1,q3]      depth   sqrt(gh)  gap%  peel%  | near node: alpha  c  Vp');
for (const a of arms) {
  const s = a.stage, n = a.nearNode;
  console.log(`${a.h0.padEnd(14)} ${a.bed.padEnd(15)} | ${f(s.alphaDeg.median, 1)} [${f(s.alphaDeg.q1, 1)},${f(s.alphaDeg.q3, 1)}]  ${f(s.c_mps.median)}   ${f(s.Vp_mps.median)} [${f(s.Vp_mps.q1)},${f(s.Vp_mps.q3)}]   ${f(s.depth_m.median)}   ${f(s.sqrtGh_mps.median)}   ${f(a.gapFraction * 100, 0)}   ${f(a.peelFraction * 100, 0)}   | ${f(n.alphaDeg.median, 1)}  ${f(n.c_mps.median)}  ${f(n.Vp_mps.median)}`);
}
console.log('wrote', OUT);
