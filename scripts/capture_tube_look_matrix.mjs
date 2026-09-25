// Ribbon-material capture rig (Track H, 2026-09-24): the curl jury's matrix
// (scripts/capture_curl_jury_matrix.mjs, kept as the jury ran it) with a
// fifth arm — `tubeclassic_glass`, the tube+classic bundle on the 2026-09-24
// glass material via #tubelook=0 — and the clock extended to 46–56 s, because
// the jury found 46–50 blind (the face collapses to a textured midtone) and
// arm differences legible only from 52 s.
//
// Each arm is its own boot (about:blank between — a warm-page hash goto races
// the app's boot-only reload); legitimate because every frame is a pure
// function of the sim clock at speed=0. Camera poses are recorded per frame.
//
//   (a) sewers_close       fixed eye [12, 11, -190] -> [-52, 4, -229] (stage
//                          coords, CLASSIC_WAVE_PROGRESS), Sewers card day
//   (b) secondpeak_lookout #cam=lookout, day=big&h0=1.4&tide=0.732
//
// Usage: node scripts/capture_tube_look_matrix.mjs [outdir]
// BASE_URL (default http://127.0.0.1:8143), PLAYWRIGHT_DIR.
// ARMS=tubeclassic,tubeclassic_glass narrows the arm set; RIGS=sewers_close
// narrows the rigs.
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
const OUT = resolve(process.argv[2] || 'qa/tube-look-2026-09-24');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8143';
mkdirSync(OUT, { recursive: true });

const SIMS = [46, 48, 50, 52, 54, 56];
const COMMON = 'controls=0&q=high&speed=0&sim=48';
const ALL_RIGS = [
  { name: 'sewers_close', hash: `preset=sewers&month=card&cam=cliff&${COMMON}`, view: [[12, 11, -190], [-52, 4, -229]], settle: 2 },
  { name: 'secondpeak_lookout', hash: `preset=secondpeak&cam=lookout&day=big&h0=1.4&tide=0.732&${COMMON}`, settle: 2 },
];
const ALL_ARMS = [
  { name: 'default', flag: '' },
  { name: 'classicdescent', flag: '&classic=1&descent=1' },
  { name: 'tube', flag: '&tube=1' },
  { name: 'tubeclassic', flag: '&tube=1&classic=1&descent=1' },
  { name: 'tubeclassic_glass', flag: '&tube=1&classic=1&descent=1&tubelook=0' },
];
const pick = (all, env) => env ? all.filter(a => env.split(',').includes(a.name)) : all;
const RIGS = pick(ALL_RIGS, process.env.RIGS);
const ARMS = pick(ALL_ARMS, process.env.ARMS);

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
    return { sim: p.sim(), tube: p.tube ? p.tube() : null, tubeBuild: !!p.tubeBuild,
      tubeLook: p.tubeLook ? p.tubeLook() : null,
      camera: p.camera.position.toArray().map(v => +v.toFixed(3)), target: p.controls.target.toArray().map(v => +v.toFixed(3)),
      state: { H0: p.state.H0, T: p.state.T, xi: p.state.xi, tide: p.state.tide } };
  }, { sim, settle });
}

const manifest = { baseUrl: BASE_URL, viewport: [1000, 625], sims: SIMS, jpegQuality: 80, frames: [] };
for (const rig of RIGS) {
  for (const arm of ARMS) {
    await boot(`${BASE_URL}/web-three/#${rig.hash}${arm.flag}`);
    if (rig.view) await page.evaluate(v => { const p = window.__pointbreak; p.controls.dispatchEvent({ type: 'start' }); p.setView(...v); }, rig.view);
    for (const sim of SIMS) {
      const probe = await frameAt(sim, rig.settle);
      assert.equal(probe.tubeBuild, arm.flag.includes('tube=1'), 'build flag matches arm');
      if (probe.tubeBuild) assert.equal(probe.tubeLook, arm.flag.includes('tubelook=0') ? 0 : 1, 'material flag matches arm');
      const file = `${rig.name}_${arm.name}_${sim}.jpg`;
      await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 80 });
      manifest.frames.push({ rig: rig.name, arm: arm.name, sim, file, bytes: statSync(join(OUT, file)).size, ...probe });
      console.log(`captured ${file}  cam ${probe.camera}`);
    }
  }
}
// Camera drift between every arm and the first, per rig/sim: the camera is the
// instrument and must not move with the signal.
manifest.cameraDriftM = {};
for (const rig of RIGS) for (const sim of SIMS) {
  const a = manifest.frames.find(f => f.rig === rig.name && f.arm === ARMS[0].name && f.sim === sim);
  for (const arm of ARMS.slice(1)) {
    const b = manifest.frames.find(f => f.rig === rig.name && f.arm === arm.name && f.sim === sim);
    if (a && b) manifest.cameraDriftM[`${rig.name}_${arm.name}_${sim}`] = +Math.hypot(...a.camera.map((v, i) => v - b.camera[i])).toFixed(3);
  }
}
manifest.totalBytes = manifest.frames.reduce((s, f) => s + f.bytes, 0);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
if (errors.length) { console.error('BROWSER ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`done - ${manifest.frames.length} frames, ${(manifest.totalBytes / 1e6).toFixed(2)} MB in ${OUT}`);
