// Swept-ribbon A/B capture rig (#tube=1 vs the shipped default) plus the
// default-parity check against a second server (the main checkout).
//
// Matched frames, tube off / on, at three cameras and five clocks. Each arm is
// its own boot (about:blank between — a warm-page hash goto races the app's
// boot-only reload), which is legitimate here because every frame is a pure
// function of the sim clock at speed=0. Camera poses are recorded per frame so
// off/on drift would be caught (MEASUREMENT_LESSONS 11: the camera is the
// instrument, pinned, never re-aimed at the signal).
//
//   (a) sewers_close   fixed eye [12, 11, -190] -> [-52, 4, -229] (stage coords,
//                      CLASSIC_WAVE_PROGRESS), Sewers card day
//   (b) secondpeak_lookout  #cam=lookout, day=big&h0=1.4&tide=0.732
//   (c) sewers_pov     #cam=pov (eased rider-eye camera: settled over 40 frames)
//
// Parity: with MAIN_URL set (a server on the pristine main checkout), a default
// boot on both servers is screenshotted as PNG at (a) and at #cam=cliff, and
// the two are compared byte-for-byte, then pixel-for-pixel if they differ.
//
// Usage: node scripts/capture_tube_ab.mjs [outdir]
// BASE_URL (default http://127.0.0.1:8132), MAIN_URL (optional), PLAYWRIGHT_DIR.
// Overrides (Track G, 2026-09-24, for the post-impact clocks and the receiver
// arms): SIMS=50,52,54,56  RIGS=sewers_close  ARMS=name:flag,name:flag where
// flag is the hash suffix (e.g. tubeclassic:&tube=1&classic=1&descent=1,
// classicdescent:&classic=1&descent=1). Camera drift is reported against the
// first arm listed. MAIN_URL parity is unchanged by the overrides.
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
const OUT = resolve(process.argv[2] || 'qa/tube-2026-09-24');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8132';
const MAIN_URL = process.env.MAIN_URL || '';
mkdirSync(OUT, { recursive: true });

const SIMS = process.env.SIMS ? process.env.SIMS.split(',').map(Number) : [42, 46, 48, 50, 52];
const COMMON = 'controls=0&q=high&speed=0&sim=48';
const ALL_RIGS = [
  { name: 'sewers_close', hash: `preset=sewers&month=card&cam=cliff&${COMMON}`, view: [[12, 11, -190], [-52, 4, -229]], settle: 2 },
  { name: 'secondpeak_lookout', hash: `preset=secondpeak&cam=lookout&day=big&h0=1.4&tide=0.732&${COMMON}`, settle: 2 },
  { name: 'sewers_pov', hash: `preset=sewers&month=card&cam=pov&${COMMON}`, settle: 40 },
  // Track B's diagnostic pose, looking down the line into the head: the view in
  // which "flap" against "tube" is decided (TUBE_MESH_2026-09-24.md, captures).
  // Not in the default set; select with RIGS=diag_downline.
  { name: 'diag_downline', hash: `preset=sewers&month=card&cam=cliff&${COMMON}`, view: [[-36, 6, -222], [-48, 6, -233]], settle: 2 },
];
const RIGS = process.env.RIGS ? ALL_RIGS.filter(r => process.env.RIGS.split(',').includes(r.name)) : ALL_RIGS;
const ARMS = process.env.ARMS
  ? process.env.ARMS.split(',').map(a => { const i = a.indexOf(':'); return { name: a.slice(0, i), flag: a.slice(i + 1) }; })
  : [{ name: 'off', flag: '' }, { name: 'on', flag: '&tube=1' }];
assert.ok(RIGS.length && ARMS.length && SIMS.every(Number.isFinite), 'bad SIMS/RIGS/ARMS override');

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
    // A pristine main build (the parity baseline) has neither hook.
    return { sim: p.sim(), tube: p.tube ? p.tube() : null, tubeBuild: !!p.tubeBuild,
      camera: p.camera.position.toArray().map(v => +v.toFixed(3)), target: p.controls.target.toArray().map(v => +v.toFixed(3)),
      state: { H0: p.state.H0, T: p.state.T, xi: p.state.xi, tide: p.state.tide } };
  }, { sim, settle });
}

const manifest = { baseUrl: BASE_URL, viewport: [1000, 625], sims: SIMS, jpegQuality: 80, frames: [] };
// ONLY_PARITY=1 skips the frame captures (rerun the parity step alone).
for (const rig of process.env.ONLY_PARITY ? [] : RIGS) {
  for (const arm of ARMS) {
    await boot(`${BASE_URL}/web-three/#${rig.hash}${arm.flag}`);
    if (rig.view) await page.evaluate(v => { const p = window.__pointbreak; p.controls.dispatchEvent({ type: 'start' }); p.setView(...v); }, rig.view);
    for (const sim of SIMS) {
      const probe = await frameAt(sim, rig.settle);
      assert.equal(probe.tubeBuild, arm.flag.includes('tube=1'), 'build flag matches arm');
      const file = `${rig.name}_${arm.name}_${sim}.jpg`;
      await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 80 });
      manifest.frames.push({ rig: rig.name, arm: arm.name, sim, file, bytes: statSync(join(OUT, file)).size, ...probe });
      console.log(`captured ${file}  cam ${probe.camera}`);
    }
  }
}
if (!process.env.ONLY_PARITY) {
  // Camera drift between arms, per rig/sim, each arm against the first listed.
  manifest.cameraDriftM = {};
  for (const rig of RIGS) for (const sim of SIMS) {
    const a = manifest.frames.find(f => f.rig === rig.name && f.arm === ARMS[0].name && f.sim === sim);
    for (const arm of ARMS.slice(1)) {
      const b = manifest.frames.find(f => f.rig === rig.name && f.arm === arm.name && f.sim === sim);
      manifest.cameraDriftM[`${rig.name}_${arm.name}_${sim}`] = +Math.hypot(...a.camera.map((v, i) => v - b.camera[i])).toFixed(3);
    }
  }
  manifest.totalBytes = manifest.frames.reduce((s, f) => s + f.bytes, 0);
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

// ---- default parity against the main checkout ----
if (MAIN_URL) {
  const parity = { baseUrl: BASE_URL, mainUrl: MAIN_URL, cases: [] };
  const CASES = [
    { name: 'sewers_close_48', hash: RIGS[0].hash, view: RIGS[0].view, sim: 48 },
    { name: 'sewers_cliff_42', hash: `preset=sewers&month=card&cam=cliff&${COMMON}`, sim: 42 },
    { name: 'secondpeak_lookout_48', hash: RIGS[1].hash, sim: 48 },
  ];
  for (const c of CASES) {
    const shots = {};
    for (const [label, url] of [['branch', BASE_URL], ['main', MAIN_URL]]) {
      await boot(`${url}/web-three/#${c.hash}`);
      if (c.view) await page.evaluate(v => { const p = window.__pointbreak; p.controls.dispatchEvent({ type: 'start' }); p.setView(...v); }, c.view);
      await frameAt(c.sim, 2);
      shots[label] = await page.screenshot({ type: 'png' });
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
console.log(`done - ${manifest.frames.length} frames, ${(manifest.totalBytes / 1e6).toFixed(2)} MB in ${OUT}`);
