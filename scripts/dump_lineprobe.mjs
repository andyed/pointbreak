// Dump __pointbreak.lineProbe() (+ stageAlpha when present) for a given hash —
// companion to scripts/measure_argmax_vs_line.mjs, which needs the baked break
// line the frames were rendered against. Promoted from scratchpad 2026-08-14.
//
// Usage: node scripts/dump_lineprobe.mjs '<hash>' out.json [--base=http://localhost:8127/web-three/]
import { writeFileSync } from 'node:fs';

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

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--'))
  .map((a) => a.replace(/^--/, '').split('=')));
const [hash, out] = args.filter((a) => !a.startsWith('--'));
if (!hash || !out) {
  console.error("usage: node scripts/dump_lineprobe.mjs '<hash>' out.json [--base=URL]");
  process.exit(1);
}
const BASE = flags.base || 'http://localhost:8127/web-three/';

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
await page.goto(`${BASE}#${hash}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
const probe = await page.evaluate(() => ({
  line: window.__pointbreak.lineProbe(5),
  stage: window.__pointbreak.stageAlpha ? window.__pointbreak.stageAlpha() : null,
}));
writeFileSync(out, JSON.stringify(probe));
console.log('line points:', probe.line ? probe.line.length : null);
await browser.close();
