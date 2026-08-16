// Capture one cliff-view still per preset for docs/figures/fig-week.svg.
// Serves the repo, drives web-three via its URL hash (preset/cam/hud/sim), and
// writes assets/cliff_<key>.png. Deterministic: the sim clock is jumped to a
// fixed time rather than sampled from wall-clock, so re-runs are comparable.
//
//   node scripts/capture_presets.mjs

// pointbreak ships no node_modules on purpose (no bundler, no deps). Resolve
// Playwright from wherever it already exists: PLAYWRIGHT_DIR, else a sibling
// repo that has it. Keeps this a dev-only tool instead of a dependency.
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
import { existsSync, mkdirSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'docs/figures/assets');
const PORT = 8188;
const SIM_T = 42;          // mid-set, matches the other figure captures

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});

const presets = (await readFile(join(ROOT, 'shared/params.js'), 'utf8'))
  .match(/export const PRESETS = \{[\s\S]*?\n\};/)[0]
  .split('\n').slice(1, -1)
  .map((l) => (l.match(/^\s*(\w+):/) || [])[1]).filter(Boolean);

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

for (const key of presets) {
  const url = `http://localhost:${PORT}/web-three/#preset=${key}&cam=drone&hud=0&sim=${SIM_T}&month=card`;
  await page.goto(url, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });     // hash-only nav wouldn't re-init
  await page.waitForTimeout(2600);              // shader compile + first frames
  const label = await page.evaluate(() => window.__pointbreak?.state?.preset);
  if (label !== key) throw new Error(`preset did not apply: wanted ${key}, got ${label}`);
  await page.screenshot({ path: join(OUT, `cliff_${key}.png`) });
  console.log(`  captured ${key}`);
}

await browser.close();
server.close();
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`done — ${presets.length} captures in docs/figures/assets`);
