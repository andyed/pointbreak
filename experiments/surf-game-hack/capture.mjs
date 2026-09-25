// Capture rig for the surf-game hack. Pinned sim clocks via the page's own
// #t= hash (the page warms 4 s of particles and camera lag before holding).
// Requires the repo dev server: python3 scripts/serve.py 8135
//
// Usage: node experiments/surf-game-hack/capture.mjs [outdir] [baseUrl]
//        FRAMES="pocket:19,pocket:21.1,cliff:22.5" to override the shot list.

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../../node_modules/playwright/index.mjs', import.meta.url).pathname,
  // worktree checkouts nest under .claude/worktrees/, so the relative sibling misses; try the dev root
  `${process.env.HOME}/Documents/dev/psychodeli-webgl-port/node_modules/playwright/index.mjs`,
].filter(Boolean);
let chromium;
for (const c of PW_CANDIDATES) { try { ({ chromium } = await import(c)); break; } catch { /* next */ } }
if (!chromium) { console.error('playwright not found; set PLAYWRIGHT_DIR'); process.exit(1); }

import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve(process.argv[2] || 'qa/game-hack-2026-09-24');
const BASE = process.argv[3] || 'http://127.0.0.1:8135';
mkdirSync(OUT, { recursive: true });

// Wave 1 of the first set (the 1.35× one) is born at sim 13.5; tau = sim - 13.5.
const DEFAULT = [
  ['pocket', 21.4, 'feather'], ['pocket', 22.6, 'pitch'], ['pocket', 23.8, 'tube'],
  ['pocket', 25.0, 'impact'], ['pocket', 26.6, 'plume'], ['pocket', 29.9, 'whitewater'],
  ['cliff', 25.0, 'lineup'], ['cliff', 29.9, 'lineup-late'],
];
const FRAMES = process.env.FRAMES
  ? process.env.FRAMES.split(',').map((s, i) => { const [cam, t] = s.split(':'); return [cam, parseFloat(t), `f${i}`]; })
  : DEFAULT;

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 625 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const manifest = [];
for (const [cam, t, tag] of FRAMES) {
  await page.goto('about:blank');
  await page.goto(`${BASE}/experiments/surf-game-hack/#cam=${cam}&t=${t}&speed=0&hud=0`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  const probe = await page.evaluate(() => { const h = window.__hack; return { sim: h.sim, cam: h.camera.position.toArray().map((v) => +v.toFixed(2)) }; });
  const name = `${cam}_${String(t).replace('.', 'p')}_${tag}.jpg`;
  await page.screenshot({ path: join(OUT, name), type: 'jpeg', quality: 80 });
  manifest.push({ cam, t, tag, name, ...probe });
  console.log('captured', name, JSON.stringify(probe));
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
if (errors.length) { console.error('PAGE ERRORS:\n' + errors.join('\n')); process.exit(1); }
