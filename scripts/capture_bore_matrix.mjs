// Bore matrix capture (#bore=1 vs the shipped default vs bore on the tube arm)
// plus the default-parity check against a second server on the pristine tree.
// Copied from scripts/capture_curl_jury_matrix.mjs (Track B's rig) with the
// arms and clocks the bore track needs: the jury found the 46-50 s clocks
// blind (CURL_JURY §3.4) and asked for 52-56 s, so the matrix runs 48-56 s.
//
//   (a) sewers_close        fixed eye [12, 11, -190] -> [-52, 4, -229] (stage), Sewers card day
//   (b) secondpeak_lookout  #cam=lookout, day=big&h0=1.4&tide=0.732 (the field day;
//                           another track is finding out why nothing breaks there —
//                           captured anyway so the coordinator can compare)
//
// Each arm is its own boot (about:blank between — a warm-page hash goto races
// the app's boot-only reload); every frame is a pure function of the sim clock
// at speed=0. Camera poses are recorded per frame.
//
// Usage: node scripts/capture_bore_matrix.mjs [outdir]
// BASE_URL (default http://127.0.0.1:8145), MAIN_URL (optional), PLAYWRIGHT_DIR.
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
let chromium;
for (const path of [process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname].filter(Boolean)) {
  try { ({ chromium } = await import(path)); break; } catch { /* next */ }
}
assert.ok(chromium, 'Set PLAYWRIGHT_DIR to the Playwright index.mjs');
const OUT = resolve(process.argv[2] || 'qa/bore-2026-09-24');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8145';
const MAIN_URL = process.env.MAIN_URL || '';
mkdirSync(OUT, { recursive: true });

const SIMS = (process.env.SIMS || '48,50,52,54,56').split(',').map(Number);
const COMMON = 'controls=0&q=high&speed=0&sim=48';
const RIGS = [
  { name: 'sewers_close', hash: `preset=sewers&month=card&cam=cliff&${COMMON}`, view: [[12, 11, -190], [-52, 4, -229]], settle: 2 },
  { name: 'secondpeak_lookout', hash: `preset=secondpeak&cam=lookout&day=big&h0=1.4&tide=0.732&${COMMON}`, settle: 2 },
  // (c) the Second Peak CLIFF on the card day: the one pose in the matrix that
  // shows a head from the side, so the knuckle and the bore behind it can be
  // read against the dark face ahead (the field sheets' geometry).
  { name: 'secondpeak_cliff', hash: `preset=secondpeak&month=card&cam=cliff&${COMMON}`, settle: 2 },
];
const ARMS = [
  { name: 'default', flag: '' },
  { name: 'bore', flag: '&bore=1' },
  { name: 'boretube', flag: '&bore=1&tube=1&classic=1&descent=1' },
];
const ONLY_RIGS = process.env.RIGS ? process.env.RIGS.split(',') : null;
const ONLY_ARMS = process.env.ARMS ? process.env.ARMS.split(',') : null;

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 625 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

async function boot(url) {
  await page.goto('about:blank');
  await page.goto(url);
  await page.waitForFunction(() => window.__pointbreak?.uniforms?.u_time?.value === 48, null, { timeout: 60000 });
}
async function frameAt(sim, settle) {
  return page.evaluate(async ({ sim, settle }) => {
    const p = window.__pointbreak;
    p.setSim(sim);
    for (let i = 0; i < settle; i++) await new Promise(r => requestAnimationFrame(r));
    if (Math.abs(p.uniforms.u_time.value - sim) > 1e-5) throw new Error('clock mismatch');
    // A pristine main build (the parity baseline) has none of these hooks.
    return { sim: p.sim(), bore: p.bore ? p.bore() : null, boreBuild: !!p.boreBuild, tubeBuild: !!p.tubeBuild,
      camera: p.camera.position.toArray().map(v => +v.toFixed(3)), target: p.controls.target.toArray().map(v => +v.toFixed(3)),
      state: { H0: p.state.H0, T: p.state.T, xi: p.state.xi, tide: p.state.tide } };
  }, { sim, settle });
}

const manifest = { baseUrl: BASE_URL, viewport: [1000, 625], sims: SIMS, jpegQuality: 80, frames: [] };
for (const rig of process.env.ONLY_PARITY ? [] : RIGS) {
  if (ONLY_RIGS && !ONLY_RIGS.includes(rig.name)) continue;
  for (const arm of ARMS) {
    if (ONLY_ARMS && !ONLY_ARMS.includes(arm.name)) continue;
    await boot(`${BASE_URL}/web-three/#${rig.hash}${arm.flag}`);
    if (rig.view) await page.evaluate(v => { const p = window.__pointbreak; p.controls.dispatchEvent({ type: 'start' }); p.setView(...v); }, rig.view);
    for (const sim of SIMS) {
      const probe = await frameAt(sim, rig.settle);
      assert.equal(probe.boreBuild, arm.flag.includes('bore='), 'build flag matches arm');
      assert.equal(probe.tubeBuild, arm.flag.includes('tube=1'), 'tube build matches arm');
      const file = `${rig.name}_${arm.name}_${sim}.jpg`;
      await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 80 });
      manifest.frames.push({ rig: rig.name, arm: arm.name, sim, file, bytes: statSync(join(OUT, file)).size, ...probe });
      console.log(`captured ${file}  cam ${probe.camera}`);
    }
  }
}
if (!process.env.ONLY_PARITY) {
  manifest.totalBytes = manifest.frames.reduce((s, f) => s + f.bytes, 0);
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// ---- default parity against the pristine tree ----
if (MAIN_URL) {
  const parity = { baseUrl: BASE_URL, mainUrl: MAIN_URL, cases: [] };
  const CASES = [
    { name: 'sewers_close_48', hash: RIGS[0].hash, view: RIGS[0].view, sim: 48 },
    { name: 'sewers_close_52', hash: RIGS[0].hash, view: RIGS[0].view, sim: 52 },
    { name: 'sewers_cliff_42', hash: `preset=sewers&month=card&cam=cliff&${COMMON}`, sim: 42 },
    { name: 'secondpeak_lookout_52', hash: RIGS[1].hash, sim: 52 },
  ];
  for (const c of CASES) {
    const shots = {};
    for (const [label, url] of [['branch', BASE_URL], ['main', MAIN_URL]]) {
      await boot(`${url}/web-three/#${c.hash}`);
      if (c.view) await page.evaluate(v => { const p = window.__pointbreak; p.controls.dispatchEvent({ type: 'start' }); p.setView(...v); }, c.view);
      await frameAt(c.sim, 2);
      shots[label] = await page.screenshot({ type: 'png' });
      if (process.env.SAVE_PNG) writeFileSync(join(OUT, `parity_${c.name}_${label}.png`), shots[label]);
    }
    const identical = Buffer.compare(shots.branch, shots.main) === 0;
    let pixels = null;
    if (!identical) {
      pixels = await page.evaluate(async ([a, b]) => {
        const load = async d => { const img = await createImageBitmap(await (await fetch(d)).blob()); const cv = new OffscreenCanvas(img.width, img.height); const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); return cx.getImageData(0, 0, img.width, img.height).data; };
        const A = await load(a), B = await load(b);
        let differing = 0, maxDelta = 0; const hist = {};
        for (let i = 0; i < A.length; i += 4) {
          const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
          if (d) { differing++; maxDelta = Math.max(maxDelta, d); hist[d] = (hist[d] || 0) + 1; }
        }
        return { differing, maxDelta, hist, total: A.length / 4 };
      }, [`data:image/png;base64,${shots.branch.toString('base64')}`, `data:image/png;base64,${shots.main.toString('base64')}`]);
    }
    parity.cases.push({ ...c, identical, pixels });
    console.log(`parity ${c.name}: ${identical ? 'byte-identical' : `${pixels.differing} px differ, max ${pixels.maxDelta}/255`}`);
  }
  writeFileSync(join(OUT, 'parity.json'), JSON.stringify(parity, null, 2));
}
await browser.close();
if (errors.length) { console.error('BROWSER ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`done - ${manifest.frames.length} frames, ${((manifest.totalBytes || 0) / 1e6).toFixed(2)} MB in ${OUT}`);
