// M6 part 3 acceptance: does moving the phase field onto the baked Psi cost the
// rider his wave?
//
// The metric is M4's, so the two are directly comparable: face height under the
// rider as a fraction of the best crest available at his own station. M4 landed
// at 0.81-0.87 across three spots x H0 in {0.7, 1.5, 2.5}; the spec's bar for
// this step is that p90 must not regress below 0.9 of whatever the psi=0 run
// scores on the same frames.
//
// Runs the REAL app under Playwright rather than replicating it: the bake, the
// continuity solve and the twin all have to be the shipped ones or the number
// means nothing. Sim time is stepped explicitly (setSim) instead of sampled off
// wall-clock, so psi=0 and psi=1 are scored at IDENTICAL clock values — a
// time-varying sim compared at different sim times has reversed a conclusion in
// this repo before.
//
//   node scripts/measure_ride.mjs            # all spots, H0 sweep
//   node scripts/measure_ride.mjs --json     # machine-readable
//
// Exit code 1 if psi=1 regresses below the acceptance bar.

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
const PORT = 8189;
const JSON_OUT = process.argv.includes('--json');

// Mapped spots only: Psi needs bathymetry, and Privates has none.
const PRESETS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks'];
const H0S = [0.7, 1.5, 2.5];
const SIM_START = 60, SIM_STEP = 1 / 30, SIM_FRAMES = 300;   // 10 s at 1/30
const ACCEPT = 0.9;   // psi=1 p90 must be >= ACCEPT * psi=0 p90

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    // no-store: a cached module silently scores the PREVIOUS build, which has
    // already cost a debugging round here.
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));

const pct = (arr, p) => {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))];
};

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// One page load per (preset, H0); psi is toggled in-page so both arms see the
// identical bake, camera and clock.
async function run(preset, H0) {
  const url = `http://localhost:${PORT}/web-three/#preset=${preset}&h0=${H0}`
            + `&surfer=1&hud=0&cam=drone&sim=${SIM_START}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });     // hash-only nav wouldn't re-init
  await page.waitForTimeout(2200);              // shader compile + first frames

  const applied = await page.evaluate(() => ({
    preset: window.__pointbreak?.state?.preset,
    H0: window.__pointbreak?.state?.H0,
  }));
  if (applied.preset !== preset) throw new Error(`preset did not apply: ${applied.preset}`);
  if (Math.abs(applied.H0 - H0) > 1e-6) throw new Error(`H0 did not apply: ${applied.H0}`);

  const arm = async (psi) => {
    await page.evaluate((on) => window.__pointbreak.setPsi(on), psi);
    return page.evaluate(async ({ start, step, frames }) => {
      const pb = window.__pointbreak;
      const out = [];
      for (let i = 0; i < frames; i++) {
        pb.setSim(start + i * step);
        // one rAF so the frame loop re-solves the ride at this clock value
        await new Promise((r) => requestAnimationFrame(() => r()));
        const m = pb.rideMetric();
        if (m && m.ratio !== null && Number.isFinite(m.ratio)) out.push(m);
      }
      return out;
    }, { start: SIM_START, step: SIM_STEP, frames: SIM_FRAMES });
  };

  const off = await arm(false);
  const on  = await arm(true);
  const stat = (s) => ({
    n: s.length,
    p10: pct(s.map((m) => m.ratio), 0.10),
    p50: pct(s.map((m) => m.ratio), 0.50),
    p90: pct(s.map((m) => m.ratio), 0.90),
    faceP50: pct(s.map((m) => m.faceH), 0.50),
  });
  return { preset, H0, off: stat(off), on: stat(on) };
}

const rows = [];
for (const preset of PRESETS) {
  for (const H0 of H0S) {
    rows.push(await run(preset, H0));
    if (!JSON_OUT) process.stderr.write('.');
  }
}
await browser.close();
server.close();
if (!JSON_OUT) process.stderr.write('\n');

if (JSON_OUT) {
  console.log(JSON.stringify({ rows, accept: ACCEPT }, null, 2));
} else {
  console.log('\nface height under the rider / best crest at his station');
  console.log('                      psi=0                psi=1');
  console.log('preset       H0    n   p50   p90     n   p50   p90    verdict');
  for (const r of rows) {
    const f = (v) => (v === null ? '  -  ' : v.toFixed(2).padStart(5));
    const ok = r.on.p90 !== null && r.off.p90 !== null && r.on.p90 >= ACCEPT * r.off.p90;
    console.log(`${r.preset.padEnd(11)} ${String(r.H0).padStart(4)} `
      + `${String(r.off.n).padStart(4)}${f(r.off.p50)}${f(r.off.p90)}  `
      + `${String(r.on.n).padStart(4)}${f(r.on.p50)}${f(r.on.p90)}    ${ok ? 'ok' : 'REGRESSION'}`);
  }
}

const bad = rows.filter((r) => !(r.on.p90 !== null && r.off.p90 !== null
                                 && r.on.p90 >= ACCEPT * r.off.p90));
if (errors.length) console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
if (bad.length) {
  console.error(`\n${bad.length}/${rows.length} combos regress below ${ACCEPT}x the psi=0 p90.`);
  process.exit(1);
}
console.log(`\nall ${rows.length} combos hold at >= ${ACCEPT}x the psi=0 p90.`);
