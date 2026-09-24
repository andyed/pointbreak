// One frozen `#cam=lookout` frame per bed arm at the 2026-09-05 forcing, for
// the overlay figure in docs/research/LOOKOUT_LOCUS_RESIDUAL_2026-09-23.md.
//
// The GPU is NOT the authority for the line — scripts/measure_lookout_line.mjs
// is — so this exists only to put the photographed locus and the baked line on
// the picture the app draws. Four captures: jacks x {reef, plane, measured},
// secondpeak x reef (whose bake never enters the frame; the capture shows what
// the app draws there anyway).
//
// There is no hash control for the period, so T is set through
// window.__pointbreak.state after load; the bake is keyed on state.T and
// rebakes on the next frame, and the loop keeps running at speed=0.
//
// Expects a server already on PORT (the task's `python3 scripts/serve.py 8232 &`)
// and Playwright resolvable from PLAYWRIGHT_DIR, like every capture_*.mjs here.
//
//   python3 scripts/serve.py 8232 &
//   PLAYWRIGHT_DIR=... node scripts/capture_lookout_locus.mjs --out=/tmp/lookout
//   pkill -f "serve.py 8232"
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
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const arg = (k, dflt) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : dflt;
};
const PORT = Number(arg('port', '8232'));
const OUT = arg('out', '/tmp/lookout-locus');
const H0 = arg('h0', '0.902'), T = Number(arg('t', '16.67')), TIDE = arg('tide', '0.316');
const SIM = arg('sim', '42');
const CELLS = [
  ['jacks', 'reef'], ['jacks', 'plane'], ['jacks', 'measured'], ['secondpeak', 'reef'],
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 960 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const manifest = { forcing: { H0, T, TIDE, SIM }, cells: [] };
for (const [preset, bed] of CELLS) {
  const hash = `preset=${preset}&cam=lookout&bed=${bed}&h0=${H0}&tide=${TIDE}&speed=0&sim=${SIM}&controls=0`;
  await page.goto(`http://127.0.0.1:${PORT}/web-three/index.html#${hash}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__pointbreak && window.__pointbreak.state, null, { timeout: 30000 });
  // the period: not a hash control, so set it in state and let the loop rebake
  await page.evaluate((t) => { window.__pointbreak.state.T = t; }, T);
  await page.waitForTimeout(2500);
  const probe = await page.evaluate(() => {
    const pb = window.__pointbreak;
    const cam = pb.camera;
    return {
      preset: pb.state.preset, geoSpot: pb.state.geoSpot, H0: pb.state.H0, T: pb.state.T,
      tide: pb.state.tide, bedShape: pb.state.bedShape, vis: pb.uniforms.u_vis?.value,
      camPos: cam.position.toArray(), camFov: cam.fov, camAspect: cam.aspect,
      peelClamp: pb.peelClamp(), clampOn: pb.clampOn(),
      line: pb.lineProbe ? pb.lineProbe(50) : null,
    };
  });
  const file = join(OUT, `lookout_${preset}_${bed}.png`);
  await page.screenshot({ path: file });
  manifest.cells.push({ preset, bed, hash, file, probe });
  console.log(`${preset}/${bed}: H0 ${probe.H0} T ${probe.T} tide ${probe.tide} bedShape ${probe.bedShape} `
    + `cam [${probe.camPos.map((v) => v.toFixed(1))}] fov ${probe.camFov} clamp ${JSON.stringify(probe.peelClamp)} -> ${file}`);
}
await browser.close();
writeFileSync(join(OUT, 'captures.json'), JSON.stringify(manifest, null, 1));
if (errors.length) { console.error('page errors:', errors); process.exit(1); }
console.log(`wrote ${OUT}/captures.json`);
