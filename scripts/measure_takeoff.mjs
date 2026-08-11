// Where does a crest FIRST meet the emergent break line, on every mapped spot?
//
// m4RideSolve takes the takeoff as argmin S over the stage. When that minimum
// sits at the up-point EDGE the wave is a clean one-way peel. When it sits
// INTERIOR, crests satisfy the break criterion in both directions from it and
// the peak splits into a left and a right — an A-frame, arrived at
// geometrically without u_aframe ever being set, at a point break whose whole
// convention is that no site ships aframe = 1.
//
// The question this answers: is that one spot with a real corner (Sewers), or
// does the bake do it everywhere? Reports the takeoff position as a fraction of
// the stage (0 = up-point edge, 1 = down-point edge) and how many whole crests
// fit on each branch — below one crest there is nothing to ride on that side
// however interior the minimum looks.
//
//   node scripts/measure_takeoff.mjs [--json]

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
const PORT = 8190;
const JSON_OUT = process.argv.includes('--json');
const PRESETS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks'];
const H0S = [0.7, 1.5, 2.5];
const EDGE = 0.08;   // within 8% of a stage end counts as "at the edge"

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
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const rows = [];
for (const preset of PRESETS) {
  for (const H0 of H0S) {
    const url = `http://localhost:${PORT}/web-three/#preset=${preset}&h0=${H0}`
              + `&hud=0&cam=drone&sim=60`;
    await page.goto(url, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1800);
    const applied = await page.evaluate(() => window.__pointbreak?.state?.preset);
    if (applied !== preset) throw new Error(`preset did not apply: ${applied}`);
    const p = await page.evaluate(() => window.__pointbreak.takeoffProfile());
    rows.push({ preset, H0, ...p });
    if (!JSON_OUT) process.stderr.write('.');
  }
}
await browser.close();
server.close();
if (!JSON_OUT) process.stderr.write('\n');

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log('\ntakeoff = argmin S over the stage (0 = up-point edge, 1 = down-point edge)');
  console.log('crests = whole wavelengths that fit on each branch; < 1 means nothing to ride there\n');
  console.log('preset       H0   stage x-range      takeoff    frac   left crests  right crests  shape');
  for (const r of rows) {
    if (r.takeoffX === undefined) { console.log(`${r.preset} ${r.H0}  (no bake)`); continue; }
    const interior = r.frac > EDGE && r.frac < 1 - EDGE;
    const realLeft = interior && r.leftCrests >= 1;
    const shape = realLeft ? 'A-FRAME' : interior ? 'interior, no left' : 'one-way peel';
    console.log(
      `${r.preset.padEnd(11)} ${String(r.H0).padStart(4)}  `
      + `${r.xLo.toFixed(0).padStart(5)}..${r.xHi.toFixed(0).padEnd(5)}  `
      + `${r.takeoffX.toFixed(1).padStart(7)}  ${r.frac.toFixed(2).padStart(5)}  `
      + `${r.leftCrests.toFixed(2).padStart(11)}  ${r.rightCrests.toFixed(2).padStart(12)}  ${shape}`);
  }
}
if (errors.length) console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
