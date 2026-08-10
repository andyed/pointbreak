// Headless SVG -> PNG render check, using the playwright install cached under hermes-agent.
import { chromium } from '/Users/andyed/.hermes/hermes-agent/node_modules/playwright/index.mjs';
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
