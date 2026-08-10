// Capture the drone-view hero frame embedded in og-card.svg.
//
//   node docs/figures/capture_og_hero.mjs
//
// Writes docs/figures/assets/og_hero.png at 1280x752 (2x the 640x376 CSS
// clip), which the card downscales into its 460x270 inset panel. Captured
// larger than needed and downscaled -- never upscaled.
//
// Deterministic in the same way capture_presets.mjs is: the sim clock is
// jumped to a fixed SIM_T rather than sampled from wall-clock, and the preset
// is asserted after load, so re-runs are comparable frame-for-frame.
//
// Why drone/sewers: the card's map is a plan view, so the hero is too -- the
// two read as the same viewpoint, one measured and one modelled. Sewers is the
// most plunging preset in the bank (xi = 1.15) and the only one whose peel
// resolves as a continuous zipper at this altitude; the cliff and follow
// cameras wash out to pale sky at card size.

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
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

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'docs/figures/assets');
const PORT = 8189;

const PRESET = 'sewers';
const SIM_T = 42;                 // mid-set, matches the other figure captures
const VIEW = { width: 1000, height: 750 };
const DSF = 2;
// Framed on the peel with a thin band of shore along the bottom. Cropping the
// shore out entirely was tried first and fails: without it the whitewater reads
// as an amorphous smear rather than a wave breaking along a point. Only a
// sliver is kept -- a deeper shore band goes muddy at panel size. Aspect
// matches the card's 460x270 panel (1.704). At DSF=2 this 640x376 CSS clip
// yields 1280x752 device px, which the panel downscales into -- still a
// downscale at 2x export (920x540), never an upscale.
const CLIP = { x: 230, y: 275, width: 640, height: 376 };

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

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: DSF });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const url = `http://localhost:${PORT}/web-three/#preset=${PRESET}&cam=drone&surfer=0&hud=0&sim=${SIM_T}`;
await page.goto(url, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });     // hash-only nav wouldn't re-init
await page.waitForTimeout(2600);              // shader compile + first frames

const applied = await page.evaluate(() => window.__pointbreak?.state?.preset);
if (applied !== PRESET) throw new Error(`preset did not apply: wanted ${PRESET}, got ${applied}`);

const out = join(OUT, 'og_hero.png');
await page.screenshot({ path: out, clip: CLIP });
await browser.close();
server.close();

if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`wrote ${out}  ${CLIP.width * DSF}x${CLIP.height * DSF}  (preset=${PRESET}, sim=${SIM_T})`);
