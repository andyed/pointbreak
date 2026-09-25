// Section-curl clock sweep (docs/research/SECTION_CURL_2026-09-24.md).
//
// Two questions the GPU answers, both through __pointbreak.curlProbe (the
// shipped surfacePos as a fragment pass over a float target — live uniforms,
// live bed textures; the JS twin is not consulted):
//
//   1. WHERE are the sections? Row 5 of the probe carries xiAt / plungeAt /
//      sectionShut / sectionNoise per column, so the section lobes are read
//      off the same field breakLine reads, not re-derived here.
//   2. WHEN does one shut, and what does the station do through it? At the
//      strongest lobe's centre column (or --x), the sim clock is swept at
//      --step seconds and each clock reports the transect maxima of pocket,
//      curl (turns of overturn), aer, foam, brk, crest, the fold reach in
//      metres, the crest height above still water, the breaking ceiling and
//      the lifecycle age at the line — the wall -> curtain -> plume -> bore
//      sequence as numbers, on the station's own clock. The steady head (the
//      strongest non-section pocket column at the same clock) is reported
//      beside it, so "the section plunges while the head spills" is one row.
//
// Usage: node scripts/probe_section_curl.mjs [--base=http://127.0.0.1:8146]
//        [--preset=secondpeak] [--flags=sectioncurl=1&gapfix=1] [--x=<m>]
//        [--sim0=36] [--sim1=54] [--step=0.5] [--fine=0.1]
//        [--out=qa/section-curl-2026-09-24/sweep_<preset>.json]
//
// The coarse pass finds the clock at which the pocket peaks on the section
// column (the crest is AT the line there); the fine pass then samples
// [peak-1.0, peak+2.0] s at --fine so the ~1.5 s event is resolved.

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
const BASE_URL = flags.base || 'http://127.0.0.1:8146';
const PRESET = flags.preset || 'secondpeak';
const FLAGS = flags.flags == null ? 'sectioncurl=1&gapfix=1' : flags.flags;
const SIM0 = Number(flags.sim0 ?? 36), SIM1 = Number(flags.sim1 ?? 54);
const STEP = Number(flags.step ?? 0.5), FINE = Number(flags.fine ?? 0.1);
const OUT = resolve(flags.out || join(ROOT, `qa/section-curl-2026-09-24/sweep_${PRESET}.json`));
const Z0 = -300, Z1 = 300, N = 1024;

// Grid vertex lattice in the core (main.js makeWaterGeometry + stretchAxis).
const STAGE_W = 600, CORE = 0.8, SEG_X = 512;
const vx = (i) => (-STAGE_W / 2 + i * STAGE_W / SEG_X) / CORE;
const XS = Array.from({ length: SEG_X * CORE + 1 }, (_, i) => vx(i + SEG_X * (1 - CORE) / 2)).filter((x) => Math.abs(x) <= 240);

const hash = `preset=${PRESET}&surfer=0&hud=0&controls=0&speed=0&q=high&cam=drone&sim=${SIM0}${FLAGS ? '&' + FLAGS : ''}`;
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('about:blank');
await page.goto(`${BASE_URL}/web-three/#${hash}`, { waitUntil: 'load' });
await page.waitForTimeout(2600);

const meta = await page.evaluate(() => {
  const pb = window.__pointbreak; const u = pb.uniforms;
  return { preset: pb.state.preset, H0: u.u_H0.value, T: u.u_T.value, xi: u.u_xi.value, sections: u.u_sections.value,
           sectionCurl: u.u_sectionCurl.value, sectionXi: u.u_sectionXi.value, gapFix: u.u_gapFix.value, curl: u.u_curl.value };
});
if (meta.preset !== PRESET) throw new Error(`preset ${meta.preset} != ${PRESET}`);

// ---- 1. the section field, per column (x-only quantities: any clock) ----
const field = await page.evaluate((xs) => xs.map((x) => {
  const r = window.__pointbreak.curlProbe(x, 0, 1, 2)[0];
  return { x, xiEff: r.xiEff, plunge: r.plunge, shut: r.sectionShut, noise: r.sectionNoise, mask: r.breakMask, reef: r.reefWin, zLine: r.bLine };
}), XS);
const lobes = [];
for (const c of field) {
  if (c.shut < 0.25) continue;
  const l = lobes[lobes.length - 1];
  if (l && c.x - l.cols[l.cols.length - 1].x < 3.0) l.cols.push(c); else lobes.push({ cols: [c] });
}
const lobeRows = lobes.map((l) => {
  const peak = l.cols.reduce((a, b) => (b.shut > a.shut ? b : a));
  return { x0: +l.cols[0].x.toFixed(1), x1: +l.cols[l.cols.length - 1].x.toFixed(1), widthM: +(l.cols[l.cols.length - 1].x - l.cols[0].x).toFixed(1),
           xPeak: +peak.x.toFixed(1), shutMax: +peak.shut.toFixed(3), xiMax: +peak.xiEff.toFixed(3), plungeMax: +peak.plunge.toFixed(3),
           reef: +peak.reef.toFixed(2), mask: +peak.mask.toFixed(2) };
}).filter((l) => l.reef > 0.3);
console.log(`\n${PRESET}  H0 ${meta.H0} T ${meta.T} xi ${meta.xi} sections ${meta.sections}  flags "${FLAGS}"  sectioncurl ${meta.sectionCurl} sectionxi ${meta.sectionXi} gapfix ${meta.gapFix}`);
console.log(`section lobes (shut >= 0.25, on the reef):`);
for (const l of lobeRows) console.log(`  x ${l.x0}..${l.x1} (${l.widthM} m)  peak x ${l.xPeak}  shut ${l.shutMax}  xi ${l.xiMax}  plunge ${l.plungeMax}  mask ${l.mask}`);

const xSection = flags.x != null ? Number(flags.x) : (lobeRows.sort((a, b) => b.shutMax - a.shutMax)[0]?.xPeak ?? 0);
const sectionCols = XS.filter((x) => Math.abs(x - xSection) <= 3.0);
console.log(`sweeping section column x = ${xSection} (${sectionCols.length} columns within 3 m)`);

// ---- 2. the clock sweep ----
async function stationAt(sim) {
  return page.evaluate(({ sim, xs, allXs, z0, z1, n }) => {
    const pb = window.__pointbreak;
    pb.setSim(sim);
    const readCol = (x) => {
      const rows = pb.curlProbe(x, z0, z1, n);
      const c = { x, pocket: 0, curl: 0, aer: 0, foam: 0, brk: 0, crest: 0, foldM: 0, yMax: -9, ceil: null, zPocket: null, age: null,
                  xiEff: rows[0].xiEff, plunge: rows[0].plunge, shut: rows[0].sectionShut, mask: rows[0].breakMask, impactPeak: rows[0].impactPeak };
      for (let k = 0; k < rows.length; k++) {
        const r = rows[k];
        if (r.land > 0.5) continue;
        if (r.pocket > c.pocket) { c.pocket = r.pocket; c.zPocket = r.z0; c.ceil = r.ceil; }
        c.curl = Math.max(c.curl, r.curl); c.aer = Math.max(c.aer, r.aer); c.foam = Math.max(c.foam, r.foam);
        c.brk = Math.max(c.brk, r.brk); c.crest = Math.max(c.crest, r.crest); c.yMax = Math.max(c.yMax, r.y);
        if (k + 1 < rows.length && rows[k + 1].land < 0.5) { const d = rows[k + 1].z - r.z; if (d < 0) c.foldM -= d; }
      }
      return c;
    };
    // the section: max over its columns
    const sec = xs.map(readCol).reduce((a, b) => (b.pocket > a.pocket ? b : a));
    // the steady head: strongest pocket column OUTSIDE any section lobe and outside gaps
    let head = null;
    for (const x of allXs) {
      const r0 = pb.curlProbe(x, 0, 1, 2)[0];
      if (r0.sectionShut > 0.05 || r0.breakMask < 0.99 || r0.reefWin < 0.5) continue;
      const c = readCol(x);
      if (!head || c.pocket > head.pocket) head = c;
    }
    return { sim: pb.sim(), section: sec, head };
  }, { sim, xs: sectionCols, allXs: allXs(), z0: Z0, z1: Z1, n: N });
}
// the head search samples every 4th column to keep a clock under a second
function allXs() { return XS.filter((_, i) => i % 4 === 0); }

const r3 = (v) => (v == null ? null : +Number(v).toFixed(3));
const tidy = (c) => c && ({ x: r3(c.x), pocket: r3(c.pocket), curl: r3(c.curl), aer: r3(c.aer), foam: r3(c.foam), brk: r3(c.brk), crest: r3(c.crest),
  foldM: r3(c.foldM), yMax: r3(c.yMax), ceil: r3(c.ceil), zPocket: r3(c.zPocket), xiEff: r3(c.xiEff), plunge: r3(c.plunge), shut: r3(c.shut), mask: r3(c.mask), impactPeak: r3(c.impactPeak) });

const coarse = [];
for (let sim = SIM0; sim <= SIM1 + 1e-9; sim = +(sim + STEP).toFixed(4)) {
  const s = await stationAt(sim);
  coarse.push({ sim: s.sim, section: tidy(s.section), head: tidy(s.head) });
}
const peak = coarse.reduce((a, b) => (b.section.pocket > a.section.pocket ? b : a));
console.log(`\ncoarse: section pocket peaks at sim ${peak.sim} (pocket ${peak.section.pocket}, curl ${peak.section.curl}, fold ${peak.section.foldM} m)`);

const fine = [];
for (let sim = +(peak.sim - 1.0).toFixed(4); sim <= peak.sim + 2.0 + 1e-9; sim = +(sim + FINE).toFixed(4)) {
  const s = await stationAt(sim);
  fine.push({ sim: s.sim, section: tidy(s.section), head: tidy(s.head) });
}
console.log(`\nfine sweep, section column x=${xSection} | steady head (strongest non-section pocket)`);
console.log('  sim     | sec: pocket curl  aer   foam  crest fold(m) yMax  ceil  | head: x     pocket curl  aer   foam  fold(m)');
for (const f of fine) {
  const s = f.section, h = f.head || {};
  console.log(`  ${String(f.sim).padEnd(7)} | ${String(s.pocket).padEnd(6)} ${String(s.curl).padEnd(5)} ${String(s.aer).padEnd(5)} ${String(s.foam).padEnd(5)} ${String(s.crest).padEnd(5)} ${String(s.foldM).padEnd(7)} ${String(s.yMax).padEnd(5)} ${String(s.ceil).padEnd(5)} | ${String(h.x).padEnd(6)} ${String(h.pocket).padEnd(6)} ${String(h.curl).padEnd(5)} ${String(h.aer).padEnd(5)} ${String(h.foam).padEnd(5)} ${h.foldM}`);
}
await browser.close();
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ preset: PRESET, flags: FLAGS, hash, meta, lobes: lobeRows, xSection, coarse, fine, errors }, null, 1));
console.log(`\nwrote ${OUT}`);
if (errors.length) { console.error('BROWSER ERRORS:\n' + errors.join('\n')); process.exit(1); }
