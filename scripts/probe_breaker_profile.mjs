// Headless GPU readback of shared/breaker-profile-glsl.js over a grid of
// (age x xi x hC x c), sampling u at 129 points per profile. The GLSL runs in
// experiments/tube-profile.html's readback pass (a float render target); this
// script only asserts on what comes back. No CPU copy of the curve exists.
//
// Asserts: every output finite; the two seams sit where the contract says;
// the pre-impact curve has no proper self-intersection (segment test); nothing
// below still water before impact; the reach is the documented ground-frame
// formula and lands on CURT_REACH at depth-limited pairs; the weight is zero
// at both lifecycle ends and monotone into impact; the family is continuous
// across the impact instant. v2 (Track G): after impact the roof stays rooted
// at the crest (apex within the root thickness of (0, hC)), the tip stays at
// the landing, the face never rises above the roof's underside, and the
// cavity's height and chord are non-increasing in age. Then captures the
// profile sheet (10 ages x 5 xi) and one explorer frame.
//
// Requires the dev server: python3 scripts/serve.py 8142
// Usage: node scripts/probe_breaker_profile.mjs [outdir]
//   BASE_URL   default http://127.0.0.1:8142
//   SHEET_OUT  default docs/research/assets/breaker-profile-v2-2026-09-24/sheet.png
//   PLAYWRIGHT_DIR  path to playwright/index.mjs (sibling repo by default)

import { mkdirSync, writeFileSync, statSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

let chromium;
for (const path of [process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname].filter(Boolean)) {
  try { ({ chromium } = await import(path)); break; } catch { /* next */ }
}
assert.ok(chromium, 'playwright not found. Set PLAYWRIGHT_DIR=/path/to/playwright/index.mjs');

const OUT = resolve(process.argv[2] || 'qa/breaker-profile-v2-2026-09-24');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8142';
const SHEET_OUT = resolve(process.env.SHEET_OUT || 'docs/research/assets/breaker-profile-v2-2026-09-24/sheet.png');
mkdirSync(OUT, { recursive: true });
mkdirSync(dirname(SHEET_OUT), { recursive: true });

const glslSource = readFileSync(new URL('../shared/breaker-profile-glsl.js', import.meta.url), 'utf8');
const glslSha = createHash('sha256').update(glslSource).digest('hex');
const modelSource = readFileSync(new URL('../shared/model-glsl.js', import.meta.url), 'utf8');
function constant(text, name) {
  const m = text.match(new RegExp(`const float ${name}\\s*=\\s*([0-9.]+);`));
  assert.ok(m, `missing GLSL constant ${name}`);
  return Number(m[1]);
}
// Read from the two sources so the documented formula below cannot drift from
// either: the receiver's reach and the depth-limited crest fraction from the
// model, the launch fraction and root thickness from the profile.
const G = constant(modelSource, 'G'), GAMMA = constant(modelSource, 'GAMMA'), CURT_REACH = constant(modelSource, 'CURT_REACH');
const LAUNCH_REL = constant(glslSource, 'BP_LAUNCH_REL'), ROOT_THICK = constant(glslSource, 'BP_ROOT_THICK');
const IMPACT = 0.42, RELEASE = 0.72;
const AGES = [-1, -0.2, 0, 0.05, 0.1, 0.15, 0.3, 0.41, 0.42, 0.43, 0.5, 0.55, 0.6, 0.65, 0.7, 0.72, 1.0, 5, 20];
const XIS = [0, 0.3, 0.45, 0.65, 0.8, 0.85, 1.15, 1.5, 2.0];
const HCS = [0.3, 1, 3, 6];
const CS = [2, 6, 12];
// plunging blend, the renderer's shared ramp -- used only to decide which
// cases have a sheet at all (plunge > 0) and to state the documented reach,
// never to predict a curve coordinate
function smoothstep(a, b, x) { const t = Math.min(Math.max((x - a) / (b - a), 0), 1); return t * t * (3 - 2 * t); }
const plunge = (xi) => smoothstep(0.45, 1.25, xi);
const reachDoc = (xi, hC, c) => LAUNCH_REL * plunge(xi) * c * Math.sqrt(2 * hC / G);

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1400, height: 700 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

try {
  await page.goto(`${BASE}/experiments/tube-profile.html?probe=1`, { waitUntil: 'load' });
} catch (e) {
  console.error(`cannot reach ${BASE} -- start the server: python3 scripts/serve.py 8142`);
  throw e;
}
await page.waitForFunction(() => window.__tubeProfile?.ready === true, null, { timeout: 15000 });
const hasFloat = await page.evaluate(() => window.__tubeProfile.hasFloat);
assert.ok(hasFloat, 'EXT_color_buffer_float unavailable: no float readback');

async function probe(age, xi, hC, c) {
  return page.evaluate(([age, xi, hC, c]) => window.__tubeProfile.probe(age, xi, hC, c), [age, xi, hC, c]);
}

// ---- geometry helpers (node side, on the readback) -------------------------
function cross(ax, ay, bx, by) { return ax * by - ay * bx; }
// proper intersection of open segments p1p2 and p3p4 (touching endpoints excluded)
function segmentsCross(p1, p2, p3, p4) {
  const d1 = cross(p4[0] - p3[0], p4[1] - p3[1], p1[0] - p3[0], p1[1] - p3[1]);
  const d2 = cross(p4[0] - p3[0], p4[1] - p3[1], p2[0] - p3[0], p2[1] - p3[1]);
  const d3 = cross(p2[0] - p1[0], p2[1] - p1[1], p3[0] - p1[0], p3[1] - p1[1]);
  const d4 = cross(p2[0] - p1[0], p2[1] - p1[1], p4[0] - p1[0], p4[1] - p1[1]);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}
function selfIntersects(points, eps) {
  // drop degenerate (zero-length) segments first: collapsed legs are allowed
  const pts = [points[0]];
  for (const p of points) { const q = pts[pts.length - 1]; if (Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) pts.push(p); }
  for (let i = 0; i + 1 < pts.length; i++) {
    for (let j = i + 2; j + 1 < pts.length; j++) {
      if (segmentsCross(pts[i], pts[i + 1], pts[j], pts[j + 1])) return { i, j, a: pts[i], b: pts[i + 1], c: pts[j], d: pts[j + 1] };
    }
  }
  return null;
}
function maxDist(a, b) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]));
  return m;
}
const uIndex = (u, n) => Math.round(u * (n - 1));

const results = { glslSha, base: BASE, constants: { G, GAMMA, CURT_REACH, LAUNCH_REL, ROOT_THICK }, cases: 0, finiteViolations: 0, seamViolations: 0,
  intersections: [], belowWater: [], weightViolations: [], roofViolations: [], cavityViolations: [], landing: {}, continuity: [], collapse: [], sheet: null };
const failures = [];
for (const hC of HCS) for (const c of CS) for (const xi of XIS) {
  const byAge = new Map();
  for (const age of AGES) {
    const r = await probe(age, xi, hC, c);
    results.cases++;
    byAge.set(age, r);
    const flat = r.points.flat().concat([r.weight, r.sL, r.vortexRatio, r.roundness, r.fallTime, r.plunge, r.rootThickness, r.cavity.maxGap, r.cavity.minGap, r.cavity.chord]);
    if (!flat.every(Number.isFinite)) { results.finiteViolations++; failures.push(`non-finite at age ${age} xi ${xi} hC ${hC} c ${c}`); continue; }
    // seams
    const B = r.points[0], L = r.points[r.n - 1];
    const tol = 1e-3 * hC + 1e-4;
    const bOk = Math.abs(B[0] + 0.5 * hC) < tol && Math.abs(B[1] - hC * (1 - 0.5 * Math.tan(Math.PI / 6))) < tol;
    const lOk = Math.abs(L[0] - r.sL) < tol && Math.abs(L[1]) < tol;
    if (!bOk || !lOk) { results.seamViolations++; failures.push(`seam off at age ${age} xi ${xi} hC ${hC} c ${c}: B=${B} L=${L} sL=${r.sL}`); }
    // the documented reach: sL = BP_LAUNCH_REL * plunge * c * sqrt(2 hC / g)
    const sLDoc = reachDoc(xi, hC, c);
    if (Math.abs(r.sL - sLDoc) > 1e-3 * Math.max(1, sLDoc)) failures.push(`reach off: GPU ${r.sL} vs documented ${sLDoc} (xi ${xi} hC ${hC} c ${c})`);
    // pre-impact invariants
    if (age >= 0 && age < IMPACT) {
      const hit = selfIntersects(r.points, 1e-6 * hC);
      if (hit) { results.intersections.push({ age, xi, hC, c, hit }); failures.push(`self-intersection at age ${age} xi ${xi} hC ${hC} c ${c}: ${JSON.stringify(hit)}`); }
      const minY = Math.min(...r.points.map((p) => p[1]));
      if (minY < -1e-4 * hC) { results.belowWater.push({ age, xi, hC, c, minY }); failures.push(`below still water pre-impact: y ${minY} at age ${age} xi ${xi} hC ${hC} c ${c}`); }
    }
    // the roof, all ages: nothing above the crest, the apex within the root
    // thickness of (0, hC) (it sags onto the fixed underside, never leaves the
    // crest), and from impact on the tip is at the landing. The 129-point walk
    // does not land exactly on u = 0.10 or 0.45, so the nearest sample may sit
    // one step along the neighbouring leg: the jet legs cover sL across and hC
    // down over 0.35 of u, so one step moves at most (sL + hC)/(0.35 (n - 1)).
    const A = r.points[uIndex(0.10, r.n)], T = r.points[uIndex(0.45, r.n)];
    const step = (r.sL + hC) / (0.35 * (r.n - 1)) + tol;
    const maxY = Math.max(...r.points.map((p) => p[1]));
    const rootThick = ROOT_THICK * hC * plunge(xi);
    const roofOk = maxY <= hC + tol && Math.abs(A[0]) < step && A[1] >= hC - rootThick - step && A[1] <= hC + tol;
    if (!roofOk) { results.roofViolations.push({ age, xi, hC, c, A, maxY }); failures.push(`roof off the crest at age ${age} xi ${xi} hC ${hC} c ${c}: apex ${A} max y ${maxY}`); }
    if (age >= IMPACT && Math.hypot(T[0] - r.sL, T[1]) > step) { results.roofViolations.push({ age, xi, hC, c, tip: T }); failures.push(`tip off the landing after impact at age ${age} xi ${xi} hC ${hC} c ${c}: ${T} vs ${r.sL}`); }
    // the face never rises above the roof's underside (a negative gap would be
    // the underside and face legs crossing). The gap is a vertical measure
    // interpolated in s, so its resolution is the sample spacing times the
    // local slope, ~hC/sL for a short-reach (near-vertical) section.
    const gapTol = 1e-3 * hC * Math.max(1, hC / Math.max(r.sL, 1e-6));
    if (r.cavity.minGap < -gapTol) { results.cavityViolations.push({ age, xi, hC, c, minGap: r.cavity.minGap, gapTol }); failures.push(`face above the roof: gap ${r.cavity.minGap} at age ${age} xi ${xi} hC ${hC} c ${c}`); }
    // weight envelope
    if ((age <= 0 || age >= RELEASE || xi <= 0.45) && r.weight !== 0) { results.weightViolations.push({ age, xi, hC, c, w: r.weight }); failures.push(`weight ${r.weight} should be 0 at age ${age} xi ${xi}`); }
    if (r.weight < 0 || r.weight > 1) failures.push(`weight out of range ${r.weight}`);
  }
  // weight monotone into impact
  let last = -1;
  for (const age of AGES.filter((a) => a >= 0 && a <= IMPACT)) { const w = byAge.get(age).weight; if (w < last - 1e-6) failures.push(`weight not monotone into impact at xi ${xi}: ${w} after ${last}`); last = w; }
  // continuity across impact: 0.41 vs 0.43. The tip legitimately advances
  // (0.02/0.42)*sL = 0.048 sL horizontally and falls (1 - 0.976^2) hC =
  // 0.047 hC vertically over that interval, so the bound is the tip's own
  // travel plus a little; anything larger is a jump in the family.
  const sL = byAge.get(IMPACT).sL;
  const d = maxDist(byAge.get(0.41).points, byAge.get(0.43).points);
  results.continuity.push({ xi, hC, c, maxJump: d, bound: 0.06 * (sL + hC) });
  if (d > 0.06 * (sL + hC)) failures.push(`discontinuity across impact ${d} m at xi ${xi} hC ${hC} c ${c} (sL ${sL})`);
  // the collapse: the cavity's area (in hC^2) and chord are non-increasing
  // from impact to release, and the cavity is gone by release (area below
  // 0.5% hC^2, the sampling floor of a 129-point walk). Area rather than the
  // vertical gap: the gap over-reads under a near-vertical face.
  const collapseAges = [0.42, 0.43, 0.5, 0.55, 0.6, 0.65, 0.7, 0.72];
  const series = collapseAges.map((a) => ({ age: a, area: byAge.get(a).cavity.area / (hC * hC), gap: byAge.get(a).cavity.maxGap / hC, chord: byAge.get(a).cavity.chord / hC }));
  // the chord is read off ~26 face samples, so it is quantized to sL/25
  const chordTol = 1.5 * (sL / hC) / 25 + 1e-3;
  for (let i = 1; i < series.length; i++) {
    if (series[i].area > series[i - 1].area + 1e-3) failures.push(`cavity grows after impact at xi ${xi} hC ${hC} c ${c}: area ${series[i - 1].area} -> ${series[i].area} hC^2 at age ${series[i].age}`);
    if (series[i].chord > series[i - 1].chord + chordTol) failures.push(`cavity chord grows after impact at xi ${xi} hC ${hC} c ${c}: ${series[i - 1].chord} -> ${series[i].chord} hC at age ${series[i].age}`);
  }
  if (series[series.length - 1].area > 0.005) failures.push(`cavity still open at release: area ${series[series.length - 1].area} hC^2 at xi ${xi} hC ${hC} c ${c}`);
  results.collapse.push({ xi, hC, c, series });
  // landing table at impact (age-independent; recorded once)
  const ri = byAge.get(IMPACT);
  results.landing[`xi${xi}_hC${hC}_c${c}`] = { sL: ri.sL, ofHC: ri.sL / hC, vortexRatio: ri.vortexRatio, roundness: ri.roundness, fallTime: ri.fallTime,
    plunge: ri.plunge, rootThickness: ri.rootThickness, cavityHC: ri.cavity.maxGap / hC, chordHC: ri.cavity.chord / hC, aspect: ri.cavity.aspect, areaHC2: ri.cavity.area / (hC * hC) };
}
// The sheet case (hC 3, c 6, full plunge): reported. The receiver check is
// at depth-limited pairs, where c and hC are one number: the landing must sit
// on CURT_REACH (the model's own receiver) within 3%.
const sheetCase = await probe(IMPACT, 1.5, 3, 6);
results.sheetCaseLanding = { sL: sheetCase.sL, ofHC: sheetCase.sL / 3, fallTime: sheetCase.fallTime, warp: sheetCase.fallTime / IMPACT, cavityHC: sheetCase.cavity.maxGap / 3, aspect: sheetCase.cavity.aspect, areaHC2: sheetCase.cavity.area / 9 };
results.depthConsistent = [];
for (const h of [1, 2, 4, 6]) {
  const c = Math.sqrt(G * h), hC = 0.8 * GAMMA * h;
  const r = await probe(IMPACT, 1.5, hC, c);
  results.depthConsistent.push({ h, c, hC, sL: r.sL, ofHC: r.sL / hC, fallTime: r.fallTime, warp: r.fallTime / IMPACT, cavityHC: r.cavity.maxGap / hC, chordHC: r.cavity.chord / hC, aspect: r.cavity.aspect, areaHC2: r.cavity.area / (hC * hC) });
  if (Math.abs(r.sL / hC - CURT_REACH) > 0.03 * CURT_REACH) failures.push(`depth-limited full-plunge landing ${r.sL / hC} hC is not on CURT_REACH ${CURT_REACH} (h ${h})`);
}

// ---- the sheet ----------------------------------------------------------------
await page.goto(`${BASE}/experiments/tube-profile.html?sheet=1&hC=3&c=6`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__tubeProfile?.ready === true, null, { timeout: 15000 });
await page.waitForTimeout(150);
const stage = await page.$('#stage');
await stage.screenshot({ path: SHEET_OUT, type: 'png' });
const bytes = statSync(SHEET_OUT).size;
const sheetLayout = await page.evaluate(() => ({ ages: window.__tubeProfile.sheetAges, xi: window.__tubeProfile.sheetXi }));
results.sheet = { path: SHEET_OUT, bytes, hC: 3, c: 6, ...sheetLayout };
if (bytes > 1_000_000) failures.push(`sheet is ${bytes} bytes (> 1 MB)`);
// one explorer frame beside the sheet: Sewers character mid-collapse
const EXPLORER_OUT = resolve(dirname(SHEET_OUT), 'explorer-xi1.15-age0.55.png');
await page.goto(`${BASE}/experiments/tube-profile.html?age=0.55&xi=1.15&hC=3&c=6`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__tubeProfile?.ready === true, null, { timeout: 15000 });
await page.waitForTimeout(150);
await (await page.$('body')).screenshot({ path: EXPLORER_OUT, type: 'png' });
results.explorer = { path: EXPLORER_OUT, bytes: statSync(EXPLORER_OUT).size };

await browser.close();
if (errors.length) failures.push(...errors.map((e) => `browser: ${e}`));
results.failures = failures;
writeFileSync(resolve(OUT, 'probe.json'), JSON.stringify(results, null, 2));

console.log(`cases ${results.cases}  finite violations ${results.finiteViolations}  seam violations ${results.seamViolations}`);
console.log(`self-intersections ${results.intersections.length}  below-water ${results.belowWater.length}  weight violations ${results.weightViolations.length}  roof violations ${results.roofViolations.length}  cavity violations ${results.cavityViolations.length}`);
console.log(`sheet case (xi 1.5, hC 3, c 6): landing ${results.sheetCaseLanding.ofHC.toFixed(3)} hC, cavity area ${results.sheetCaseLanding.areaHC2.toFixed(3)} hC^2, gap ${results.sheetCaseLanding.cavityHC.toFixed(3)} hC (aspect ${results.sheetCaseLanding.aspect.toFixed(2)}), free fall ${results.sheetCaseLanding.fallTime.toFixed(3)} s = ${results.sheetCaseLanding.warp.toFixed(2)}x the clock`);
for (const d of results.depthConsistent) console.log(`depth-limited h ${d.h} m: c ${d.c.toFixed(2)} hC ${d.hC.toFixed(2)} -> landing ${d.ofHC.toFixed(3)} hC (CURT_REACH ${CURT_REACH}), cavity area ${d.areaHC2.toFixed(3)} hC^2, gap ${d.cavityHC.toFixed(3)} hC, chord ${d.chordHC.toFixed(3)} hC, aspect ${d.aspect.toFixed(2)}`);
console.log('landing table at hC 3, c 6:');
for (const xi of XIS) { const l = results.landing[`xi${xi}_hC3_c6`]; console.log(`  xi ${xi}: plunge ${l.plunge.toFixed(2)} sL ${l.ofHC.toFixed(3)} hC  VR ${l.vortexRatio.toFixed(2)} round ${l.roundness.toFixed(2)}  cavity area ${l.areaHC2.toFixed(3)} hC^2 gap ${l.cavityHC.toFixed(3)} hC chord ${l.chordHC.toFixed(3)} aspect ${l.aspect.toFixed(2)}  root ${(l.rootThickness / 3).toFixed(3)} hC`); }
const s115 = results.collapse.find((s) => s.xi === 1.15 && s.hC === 3 && s.c === 6);
if (s115) console.log('collapse at xi 1.15, hC 3, c 6: ' + s115.series.map((s) => `${s.age}s area ${s.area.toFixed(3)} gap ${s.gap.toFixed(3)} chord ${s.chord.toFixed(3)}`).join(' | '));
console.log(`sheet ${SHEET_OUT} (${bytes} bytes)`);
console.log(`probe.json -> ${resolve(OUT, 'probe.json')}`);
if (failures.length) { console.error(`\n${failures.length} failure(s):\n` + failures.slice(0, 30).join('\n')); process.exit(1); }
console.log('breaker profile probe: all invariants hold');
