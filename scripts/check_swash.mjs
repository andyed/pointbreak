// Swash standing check (2026-08-12): the two waterline regressions this repo
// has actually shipped, measured across a FULL SET CYCLE instead of one frame.
//
//   1. GOO — near-black bed-mesh slivers poking through the swash
//      (set-phase dependent: 0 px at a lull, 45 at a peak, so any single-clock
//      check is blind to it; that is how it shipped).
//   2. BREATHE — the minute-by-minute water pull-back (setupLiftM): the
//      waterline must advance and retreat with the set envelope. Its loss is
//      invisible in stills by construction.
//
// Deterministic: seeds #sim= then drives the clock via __pointbreak.setSim,
// same contract as scripts/capture_temporal.mjs. One browser, ~24 frames.
//
//   node scripts/check_swash.mjs [--preset=secondpeak] [--n=24] [--out=DIR]
//
// PASS/FAIL: goo fails if any frame has > GOO_MAX_PX near-black pixels below
// the header. Breathe fails if the water-coverage excursion over the cycle is
// under BREATHE_MIN_FRAC of its mean — i.e. the waterline is not moving.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

const flags = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
const PRESET = flags.preset || 'secondpeak';
const N = Math.round(Number(flags.n || 24));
const OUT = flags.out || `/tmp/pointbreak-swash-${PRESET}`;
const BASE = flags.base || 'http://localhost:8127/web-three/';
const GOO_MAX_PX = 10;           // fixed build measures 0-9 across the cycle; broken measured 45-89
// Measured healthy band is 0.47-0.51% at the default Second Peak view (both
// sides of the 2026-08-12 goo fix — the breathe channel was verified UNCHANGED
// by it, and setupLiftM's driver was untouched all session). Threshold at half
// the healthy floor so the check trips on a real loss, not on set-phase luck.
const BREATHE_MIN_FRAC = 0.0025;
const T0 = 0, SPAN = 200;       // s of sim, > one set cycle (1/dF ~ 125-167 s)

async function loadChromium() {
  const cands = [process.env.PLAYWRIGHT_DIR,
    '/Users/andyed/Documents/dev/psychodeli-webgl-port/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const c of cands) { try { return (await import(c)).chromium; } catch { /* next */ } }
  console.error('playwright not found; set PLAYWRIGHT_DIR'); process.exit(1);
}

// Minimal PNG decode (8-bit RGBA/RGB, non-interlaced) — same approach as
// capture_temporal.mjs, kept dependency-free on purpose.
function decodePNG(buf) {
  let off = 8; const idat = []; let w = 0, h = 0, bitDepth = 0, colorType = 0;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off); const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); bitDepth = data[8]; colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || (colorType !== 6 && colorType !== 2)) throw new Error(`unsupported PNG (${bitDepth}-bit, ct ${colorType})`);
  const ch = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch, px = new Uint8Array(w * h * ch);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; const row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[x - ch] : 0, b = prev[x], c = x >= ch ? prev[x - ch] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      out[x] = v & 255;
    }
    prev = out;
  }
  return { width: w, height: h, ch, px };
}

// goo: near-black (max channel < 40) below the header strip.
// water coverage: cool pixels (B >= R + 6) — sand is warm, water is not; the
// margin rides out the matte/fog desaturation.
function measure(img) {
  const { width: w, height: h, ch, px } = img;
  let goo = 0, water = 0;
  for (let y = 80; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch, r = px[i], g = px[i + 1], b = px[i + 2];
      if (r < 40 && g < 40 && b < 40) goo++;
      if (b >= r + 6) water++;
    }
  }
  return { goo, water };
}

mkdirSync(OUT, { recursive: true });
const chromium = await loadChromium();
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`${BASE}#preset=${PRESET}&cam=free&hud=0&sim=${T0}`, { waitUntil: 'load' });
await page.reload({ waitUntil: 'load' });
await page.waitForTimeout(2400);
await page.evaluate(() => { window.__pointbreak.state.speed = 0; });

const rows = [];
for (let k = 0; k < N; k++) {
  const t = T0 + (SPAN * k) / (N - 1);
  await page.evaluate((tt) => window.__pointbreak.setSim(tt), t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const file = join(OUT, `swash_${String(k).padStart(3, '0')}.png`);
  await page.screenshot({ path: file });
  const m = measure(decodePNG(readFileSync(file)));
  rows.push({ t: +t.toFixed(1), ...m });
}
await browser.close();

const goos = rows.map((r) => r.goo), waters = rows.map((r) => r.water);
const gooMax = Math.max(...goos);
const wMean = waters.reduce((a, v) => a + v, 0) / waters.length;
const excursion = (Math.max(...waters) - Math.min(...waters)) / wMean;
const gooPass = gooMax <= GOO_MAX_PX;
const breathePass = excursion >= BREATHE_MIN_FRAC;

const result = {
  preset: PRESET, frames: N, span_s: SPAN, rows,
  goo: { max_px: gooMax, threshold_px: GOO_MAX_PX, pass: gooPass },
  breathe: { coverage_mean_px: Math.round(wMean), excursion_frac: +excursion.toFixed(4), threshold_frac: BREATHE_MIN_FRAC, pass: breathePass },
  consoleErrors: errors,
};
writeFileSync(join(OUT, 'swash_metrics.json'), JSON.stringify(result, null, 2));
console.log(`goo:     max ${gooMax} px over ${N} frames (<= ${GOO_MAX_PX})  ${gooPass ? 'PASS' : 'FAIL'}`);
console.log(`breathe: water-coverage excursion ${(excursion * 100).toFixed(2)}% of mean (>= ${BREATHE_MIN_FRAC * 100}%)  ${breathePass ? 'PASS' : 'FAIL'}`);
if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.join('\n'));
process.exit(gooPass && breathePass && !errors.length ? 0 : 1);
