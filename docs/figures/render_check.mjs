// Headless SVG -> PNG render check.
// This repo ships no node_modules on purpose, so Playwright is resolved from
// wherever it already exists rather than hardcoded to one machine.
// Override with PLAYWRIGHT_DIR=/path/to/playwright/index.mjs
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
import { readFileSync } from 'fs';
import path from 'path';

const svgPath = process.argv[2];
const outPath = process.argv[3] || svgPath.replace(/\.svg$/, '-render.png');
const scale = Number(process.argv[4] || 2);

const svg = readFileSync(svgPath, 'utf8');
// pull viewBox to size the page
const m = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
const w = m ? Math.round(Number(m[1])) : 1200;
const h = m ? Math.round(Number(m[2])) : 760;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
// Navigate directly to the SVG file (rather than setContent with an inline
// HTML wrapper) so relative hrefs -- e.g. fig-week's <image href="assets/...">
// crops -- resolve against the file's own directory instead of about:blank.
await page.goto('file://' + path.resolve(svgPath), { waitUntil: 'load' });
await page.waitForTimeout(150); // let raster <image> children finish decoding
await page.screenshot({ path: outPath });
await browser.close();
console.log('wrote', outPath, `${w}x${h} @${scale}x`);
