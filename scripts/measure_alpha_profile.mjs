// Track 1c'-b, diagnosis part 2: is the peel angle a PROPERTY OF THE LINE, or
// a property of the station the fit is tuned at?
//
// MODEL.md 4.5 lists "fit hits the target at mid-window and crosses zero out on
// the flanks" as a known alpha authority defect, but it has never been measured
// as a profile. It matters now because the acceptance instrument
// (derivedAlphaDeg at x = 0) and the reef fit's station set
// (xs = [-16, -8, 0, 8, 16] with smoothing off) are THE SAME NEIGHBOURHOOD.
// An instrument that scores the station a fit is tuned at certifies the fit,
// not the wave — MEASUREMENT_LESSONS 4, in a new costume.
//
// Reports, per spot, at the default ocean:
//   alpha in the fit window (|x| <= 16) vs outside it, and the whole profile
//   decile by decile across the stage; plus the line's END-TO-END bearing
//   atan(dz_total / dx_total), which is the one summary a staircase cannot fake.
//
//   node scripts/measure_alpha_profile.mjs [--json] [--smooth]

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname,
].filter(Boolean);
let chromium;
for (const c of PW_CANDIDATES) {
  try { ({ chromium } = await import(c)); break; } catch { /* try next */ }
}
if (!chromium) {
  console.error('playwright not found. Set PLAYWRIGHT_DIR=/path/to/playwright/index.mjs');
  process.exit(1);
}
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8194;
const JSON_OUT = process.argv.includes('--json');
const SMOOTH = process.argv.includes('--smooth');
const PRESETS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks'];
const FIT_HALF_WIDTH = 16;   // the unsmoothed fit's station span, bed.js reefFitFor

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const mean = (a) => a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
const median = (a) => {
  const s = [...a].sort((p, q) => p - q);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

const out = [];
for (const preset of PRESETS) {
  // NOT pinned to a month. An instrument pinned to a basis the product does
  // not ship is how the 2026-08-16 default-ocean regression passed a green
  // suite: every rig read `month=card` while the app booted January.
  const url = `http://localhost:${PORT}/web-three/#preset=${preset}&sim=42&hud=0`
            + (SMOOTH ? '&smooth=1' : '');
  await page.goto(url, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1600);
  const r = await page.evaluate(() => {
    const pb = window.__pointbreak;
    if (!pb) return null;
    // takeoffProfile carries the STAGE bounds (stageStart+10 .. stageEnd-10).
    // The bake spans ~600 m, far wider than any rideable stage, so a profile
    // over the whole bake would count flank stations no one surfs and no reef
    // reaches — and would overstate the defect it is looking for.
    const t = pb.takeoffProfile(1);
    return { preset: pb.state.preset, target: pb.state.alpha, line: pb.lineProbe(2),
             stageLo: t.xLo, stageHi: t.xHi };
  });
  if (!r || r.preset !== preset) throw new Error(`preset did not apply: ${preset}`);

  const line = r.line.filter((p) => p.x >= r.stageLo && p.x <= r.stageHi);
  const inFit = line.filter((p) => Math.abs(p.x) <= FIT_HALF_WIDTH).map((p) => p.a);
  const outFit = line.filter((p) => Math.abs(p.x) > FIT_HALF_WIDTH).map((p) => p.a);
  // End-to-end bearing: the obliquity the line ACTUALLY achieves across the
  // stage. A staircase of steep steps separated by flat runs has a high local
  // alpha at some stations and a low bearing; a genuinely oblique line has both.
  const dx = line[line.length - 1].x - line[0].x;
  const dz = line[line.length - 1].z - line[0].z;
  const bearing = Math.abs(Math.atan2(dz, dx) * 180 / Math.PI);
  const deciles = [];
  for (let d = 0; d < 10; d++) {
    const seg = line.slice(Math.floor(d * line.length / 10), Math.floor((d + 1) * line.length / 10));
    deciles.push({ x: median(seg.map((p) => p.x)), a: median(seg.map((p) => p.a)) });
  }
  out.push({ preset, target: r.target, x0: line[0].x, x1: line[line.length - 1].x,
             stageM: r.stageHi - r.stageLo,
             fitCoverPct: 100 * Math.min(2 * FIT_HALF_WIDTH, r.stageHi - r.stageLo) / (r.stageHi - r.stageLo),
             aInFit: median(inFit), aOutFit: median(outFit), aMean: mean(line.map((p) => p.a)),
             bearing, deciles });
  if (!JSON_OUT) process.stderr.write('.');
}

await browser.close();
server.close();

if (JSON_OUT) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`\n== alpha profile along the stage ${SMOOTH ? '(#smooth=1)' : '(default)'} ==`);
  console.log('aFit = median alpha inside the fit window |x|<=16; aOut = median outside it');
  console.log('bearing = end-to-end atan(dz/dx) of the whole line\n');
  console.log('spot        target  stage  fit%   aFit   aOut   bearing    decile medians across the stage');
  for (const s of out) {
    console.log(`${s.preset.padEnd(11)} ${String(s.target).padStart(5)}  ${s.stageM.toFixed(0).padStart(5)}m ${s.fitCoverPct.toFixed(0).padStart(3)}%  ${s.aInFit.toFixed(1).padStart(5)}  ${s.aOutFit.toFixed(1).padStart(5)}  ${s.bearing.toFixed(1).padStart(6)}     `
      + s.deciles.map((d) => d.a.toFixed(0).padStart(3)).join(' '));
  }
  console.log('\nstage x-ranges: ' + out.map((s) => `${s.preset} ${s.x0.toFixed(0)}..${s.x1.toFixed(0)}`).join(', '));
}
if (errors.length) console.error('CONSOLE ERRORS:\n' + [...new Set(errors)].join('\n'));
