// Section-gap paint probe (docs/research/SECTION_GAP_FOAM_2026-09-24.md).
//
// Track D's side finding: at Sewers sim 42 two of the three folded heads sit
// where breakMask(x) = 0 (a baked section gap) yet carry pocket 0.75-0.99 and
// foam 0.56-0.87 at the fold. This asks whether that is general. It reads the
// GPU surface through __pointbreak.curlProbe (shipped surfacePos, live
// uniforms and bed textures — the JS twin is not consulted) along one
// shore-normal transect per grid vertex column, for several presets, clocks
// and arms, and reports per column:
//
//   breakMask   the section-gap mask at this x (0 = gap, 1 = breaking allowed)
//   reefWin     the reef window at this x
//   pocket/foam/brk/aer/curl   the transect maxima over wet samples
//   foldM       backwards travel in displaced z along the transect (the fold's
//               horizontal reach on the 0.59 m sampling)
//   zPocket     the source z where pocket peaks (the break line's locus)
//
// and then the gap-column statistics the note tabulates: how many gap columns
// carry pocket > 0.7, a fold > 1.5 m, foam > 0.5, brk > 0.5, aer > 0.1.
//
// Usage: node scripts/probe_section_gap_foam.mjs [--base=http://127.0.0.1:8137]
//        [--out=qa/section-gap-foam-2026-09-24/probe.json]
//        [--cells=sewers:42,46,50;secondpeak:42,46,50;sharks:42,46,50]
//        [--arms=base,gap0]

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname,
].filter(Boolean);
let chromium;
for (const candidate of PW_CANDIDATES) {
  try { ({ chromium } = await import(candidate)); break; } catch { /* next */ }
}
if (!chromium) { console.error('playwright not found. Set PLAYWRIGHT_DIR'); process.exit(1); }

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const body = a.replace(/^--/, ''), i = body.indexOf('=');
  return i < 0 ? [body, '1'] : [body.slice(0, i), body.slice(i + 1)];
}));
const BASE_URL = flags.base || 'http://127.0.0.1:8137';
const OUT = resolve(flags.out || join(ROOT, 'qa/section-gap-foam-2026-09-24/probe.json'));
const CELLS = (flags.cells || 'sewers:42,46,50;secondpeak:42,46,50;sharks:42,46,50')
  .split(';').map((s) => { const [preset, sims] = s.split(':'); return { preset, sims: sims.split(',').map(Number) }; });
const ARMS = { base: '', gap0: '&gap=0' };
const armNames = (flags.arms || 'base').split(',');

// Grid vertex lattice in the core (main.js makeWaterGeometry + stretchAxis).
const STAGE_W = 600, CORE = 0.8, SEG_X = 512;
const CELL_X = STAGE_W / (SEG_X * CORE);
const vx = (i) => (-STAGE_W / 2 + i * STAGE_W / SEG_X) / CORE;
const XS = Array.from({ length: SEG_X * CORE + 1 }, (_, i) => vx(i + SEG_X * (1 - CORE) / 2)).filter((x) => Math.abs(x) <= 240);
const Z0 = -300, Z1 = 300, N = 1024;

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const results = [];
for (const cell of CELLS) for (const sim of cell.sims) for (const arm of armNames) {
  const hash = `preset=${cell.preset}&surfer=0&hud=0&controls=0&speed=0&q=high&cam=drone&sim=${sim}${ARMS[arm]}`;
  const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
  await page.goto('about:blank');
  await page.goto(`${BASE_URL}/web-three/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  const meta = await page.evaluate(() => {
    const pb = window.__pointbreak;
    const u = pb.uniforms;
    return { preset: pb.state.preset, sim: pb.sim(), H0: u.u_H0.value, T: u.u_T.value, xi: u.u_xi.value,
             gapMask: u.u_gapMask.value, breakMix: u.u_breakMix.value, depthMix: u.u_depthMix.value,
             curl: u.u_curl.value, lipAer: u.u_lipAer.value, sections: u.u_sections.value };
  });
  if (meta.preset !== cell.preset) throw new Error(`preset ${meta.preset} != ${cell.preset}`);
  const cols = await page.evaluate(({ xs, z0, z1, n }) => xs.map((x) => {
    const rows = window.__pointbreak.curlProbe(x, z0, z1, n);
    const c = { x, breakMask: rows[0].breakMask, reefWin: rows[0].reefWin,
                pocket: 0, foam: 0, brk: 0, aer: 0, curl: 0, foldM: 0, zPocket: null, zLine: rows[0].bLine };
    for (let k = 0; k < rows.length; k++) {
      const r = rows[k];
      if (r.land > 0.5) continue;
      if (r.pocket > c.pocket) { c.pocket = r.pocket; c.zPocket = r.z0; }
      if (r.foam > c.foam) c.foam = r.foam;
      if (r.brk > c.brk) c.brk = r.brk;
      if (r.aer > c.aer) c.aer = r.aer;
      if (r.curl > c.curl) c.curl = r.curl;
      if (k + 1 < rows.length && rows[k + 1].land < 0.5) {
        const d = rows[k + 1].z - r.z;
        if (d < 0) c.foldM -= d;
      }
    }
    return c;
  }), { xs: XS, z0: Z0, z1: Z1, n: N });
  await page.close();

  const r3 = (v) => (v == null ? null : +Number(v).toFixed(3));
  const columns = cols.map((c) => ({ x: r3(c.x), breakMask: r3(c.breakMask), reefWin: r3(c.reefWin),
    pocket: r3(c.pocket), foam: r3(c.foam), brk: r3(c.brk), aer: r3(c.aer), curl: r3(c.curl),
    foldM: r3(c.foldM), zPocket: r3(c.zPocket), zLine: r3(c.zLine) }));
  // heads, Track D's definition: contiguous columns with curl > 0.25
  const active = columns.filter((c) => c.curl > 0.25);
  const heads = [];
  for (const c of active) {
    const h = heads[heads.length - 1];
    if (h && c.x - h.cols[h.cols.length - 1].x < 2.5 * CELL_X) h.cols.push(c); else heads.push({ cols: [c] });
  }
  const headRows = heads.map((h) => {
    const peak = h.cols.reduce((a, b) => (b.curl > a.curl ? b : a));
    const mx = (k) => Math.max(...h.cols.map((c) => c[k]));
    return { x: peak.x, cols: h.cols.length, breakMask: peak.breakMask, reefWin: peak.reefWin,
             curl: mx('curl'), pocket: mx('pocket'), foam: mx('foam'), brk: mx('brk'), aer: mx('aer'), foldM: mx('foldM') };
  });
  const gap = columns.filter((c) => c.breakMask < 0.5), open = columns.filter((c) => c.breakMask >= 0.5);
  const count = (arr, f) => arr.filter(f).length;
  const stats = (arr) => ({
    n: arr.length,
    pocketGt07: count(arr, (c) => c.pocket > 0.7), foamGt05: count(arr, (c) => c.foam > 0.5),
    brkGt05: count(arr, (c) => c.brk > 0.5), aerGt01: count(arr, (c) => c.aer > 0.1),
    curlGt025: count(arr, (c) => c.curl > 0.25), foldGt15: count(arr, (c) => c.foldM > 1.5),
    pocketMax: arr.length ? +Math.max(...arr.map((c) => c.pocket)).toFixed(3) : null,
    aerMax: arr.length ? +Math.max(...arr.map((c) => c.aer)).toFixed(3) : null,
    brkMax: arr.length ? +Math.max(...arr.map((c) => c.brk)).toFixed(3) : null,
    foldMax: arr.length ? +Math.max(...arr.map((c) => c.foldM)).toFixed(2) : null,
  });
  const gapRuns = [];
  for (const c of gap) {
    const g = gapRuns[gapRuns.length - 1];
    if (g && c.x - g.x1 < 1.5 * CELL_X) g.x1 = c.x; else gapRuns.push({ x0: c.x, x1: c.x });
  }
  const summary = { preset: cell.preset, sim, arm, hash, meta, gapRuns, gap: stats(gap), open: stats(open), heads: headRows, columns };
  results.push(summary);
  console.log(`\n${cell.preset} sim ${sim} ${arm}  H0 ${meta.H0} T ${meta.T} xi ${meta.xi}  gapMask ${meta.gapMask}  gap columns ${gap.length}/${columns.length}  runs ${gapRuns.map((g) => `${g.x0}..${g.x1}`).join(' ')}`);
  console.log(`  gap : ${JSON.stringify(summary.gap)}`);
  console.log(`  open: ${JSON.stringify(summary.open)}`);
  for (const h of headRows)
    console.log(`  head x ${String(h.x).padStart(9)} cols ${h.cols} bm ${h.breakMask} reef ${h.reefWin} curl ${h.curl} pocket ${h.pocket} foam ${h.foam} brk ${h.brk} aer ${h.aer} fold ${h.foldM} m`);
}
await browser.close();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(results, null, 1));
console.log(`\nwrote ${OUT}`);
