// Deterministic field-video fidelity A/B.
//
// Captures one full carrier at a fixed cliff camera and identical clocks for:
//   current — shipped renderer
//   foam    — cellular foam material only
//   full    — foam + lifecycle hierarchy + connected face/thin lip
//
// Usage: node scripts/capture_fidelity_ab.mjs [outdir]

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname,
].filter(Boolean);
let chromium;
for (const candidate of PW_CANDIDATES) {
  try { ({ chromium } = await import(candidate)); break; } catch { /* next */ }
}
if (!chromium) {
  console.error('playwright not found. Set PLAYWRIGHT_DIR=/path/to/playwright/index.mjs');
  process.exit(1);
}

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || '/tmp/pointbreak-fidelity-ab');
const PORT = 8189;
const TIMES = [42, 48, 54, 58];
const LOOKS = ['current', 'foam', 'full'];
const BASE_HASH = 'preset=secondpeak&cam=cliff&day=big&h0=1.4&tide=0.732&controls=0&q=high&speed=0';
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (path.endsWith('/')) path += 'index.html';
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
await new Promise((resolveListen) => server.listen(PORT, resolveListen));

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
let cameraProof = null;
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

for (const look of LOOKS) {
  for (const sim of TIMES) {
    const url = `http://localhost:${PORT}/web-three/#${BASE_HASH}&look=${look}&sim=${sim}`;
    await page.goto(url, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2600);
    const state = await page.evaluate(() => ({
      sim: window.__pointbreak?.sim(),
      look: window.__pointbreak?.uniforms?.u_fidelityLook?.value,
      camera: window.__pointbreak?.camera?.position?.toArray(),
      target: window.__pointbreak?.controls?.target?.toArray(),
    }));
    if (state.sim !== sim) throw new Error(`clock mismatch: wanted ${sim}, got ${state.sim}`);
    if (state.look !== LOOKS.indexOf(look)) throw new Error(`look mismatch: wanted ${look}, got ${state.look}`);
    const rig = { camera: state.camera, target: state.target };
    if (!cameraProof) cameraProof = rig;
    else if (JSON.stringify(rig) !== JSON.stringify(cameraProof))
      throw new Error(`camera drift: ${JSON.stringify(rig)} != ${JSON.stringify(cameraProof)}`);
    await page.screenshot({ path: join(OUT, `${look}_${String(sim).padStart(3, '0')}.png`) });
    console.log(`captured ${look} at sim ${sim}`);
  }
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({
  generated: new Date().toISOString(),
  sourceCommit: process.env.SOURCE_COMMIT || null,
  viewport: [1440, 900],
  baseHash: BASE_HASH,
  times: TIMES,
  looks: { current: 0, foam: 1, full: 2 },
  camera: cameraProof,
}, null, 2));

await browser.close();
server.close();
if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`done — ${LOOKS.length * TIMES.length} captures in ${OUT}`);
