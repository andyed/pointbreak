// First-person surfer acceptance: authoritative surface parity, board/eye
// clearance, capped roll, fail-closed submersion and query cost.
//
// Pinned clocks settle spatial correctness. A short live run per wave character
// settles the thing stills cannot: the camera keeps moving without entering
// the surface or violating its roll cap.
//
// Usage:
//   node scripts/measure_pov.mjs <outdir>
//     [--base=http://localhost:8127/web-three/]
//     [--presets=sewers,secondpeak,sharks] [--sims=36,37.5,40.5,42]

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  '/Users/andyed/Documents/dev/psychodeli-webgl-port/node_modules/playwright/index.mjs',
].filter(Boolean);
let chromium;
for (const candidate of PW_CANDIDATES) {
  try { ({ chromium } = await import(candidate)); break; } catch { /* next */ }
}
if (!chromium) { console.error('playwright not found'); process.exit(1); }

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--'))
  .map((a) => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
const OUT = resolve(args.find((a) => !a.startsWith('--')) || '/tmp/pointbreak-pov');
const BASE = flags.base || 'http://localhost:8127/web-three/';
const PRESETS = (flags.presets || 'sewers,secondpeak,sharks').split(',');
const SIMS = (flags.sims || '36,37.5,40.5,42').split(',').map(Number);
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));

async function readProbe() {
  return page.evaluate(() => {
    const pb = window.__pointbreak;
    const pov = pb.povProbe();
    const fwd = pb.camera.getWorldDirection(pb.camera.position.clone());
    const xiT = Math.min(Math.max((pb.state.xi - 0.45) / (1.25 - 0.45), 0), 1);
    const plunge = xiT*xiT*(3 - 2*xiT);
    const expectedClearance = 0.35 + 0.9*plunge;
    return {
      ...pov,
      sim: pb.sim(),
      preset: pb.state.preset,
      expectedClearance,
      clearanceErrorM: pov.clearance == null ? null : pov.clearance - expectedClearance,
      surfaceErrorM: null,
      surfaceReference: null,
      cameraForwardAlignment: fwd.dot(pb.camera.up.clone().fromArray(pov.forward)),
    };
  });
}

async function comparePinnedSurface(probe) {
  // curlProbe compiles the shipped surface chunk independently, but a sync
  // float-target read collides with the runtime query's pending PBO/fence on
  // Chromium/Metal and returns an all-zero row. Quiesce only that query,
  // compare the captured source point, then restore GPU authority and wait for
  // POV to recover before taking the screenshot.
  await page.evaluate(() => window.__pointbreak.setRiderSurfaceMode('legacy'));
  await page.waitForFunction(() => !window.__pointbreak.surfaceQueryStats().pending);
  const reference = await page.evaluate((source) => {
    const row = window.__pointbreak.curlProbe(source[0], source[1], source[1], 2)?.[0];
    return row ? [row.y, row.z] : null;
  }, probe.source);
  await page.evaluate(() => window.__pointbreak.setRiderSurfaceMode('gpu'));
  await page.waitForFunction(() => {
    const p = window.__pointbreak.povProbe();
    return p.ready && p.queryValid && p.authority === 'gpu';
  });
  return {
    ...probe,
    surfaceReference: reference,
    surfaceErrorM: reference
      ? Math.hypot(probe.surface[1] - reference[0], probe.surface[2] - reference[1])
      : null,
  };
}

function assertProbe(p, label, { requireSurfaceParity = false } = {}) {
  const fail = (message) => { throw new Error(`${label}: ${message}`); };
  if (!p.active || !p.ready) fail(`POV inactive/not ready (${JSON.stringify({ active: p.active, ready: p.ready })})`);
  if (p.authority !== 'gpu' || !p.queryValid) fail(`surface authority ${p.authority}, valid=${p.queryValid}`);
  if (!(p.frontFaceOffsetM >= 5.9 && p.frontFaceOffsetM <= 16.1)) {
    fail(`rider is not on the shoreward front face (offset ${p.frontFaceOffsetM} m)`);
  }
  if (p.cameraUnder) fail('camera is underwater');
  if (!(p.eyeAboveSurface > 1.30)) fail(`eye clearance ${p.eyeAboveSurface?.toFixed(3)} m`);
  if (!(Math.abs(p.clearanceErrorM) < 1e-4)) fail(`board clearance error ${p.clearanceErrorM} m`);
  if (!(p.upTiltDeg <= 8.01)) fail(`roll ${p.upTiltDeg.toFixed(3)} deg`);
  if (!(p.cameraForwardAlignment > 0.995)) fail(`gaze alignment ${p.cameraForwardAlignment}`);
  if (requireSurfaceParity && !(p.surfaceErrorM < 0.01)) fail(`GPU probe parity ${p.surfaceErrorM} m`);
  // 0.835 ms is 5% of a 60 Hz frame. Use the warmed median: compilation and
  // first-read stalls are outside the rolling 240-sample window by this read.
  if (!(p.query?.medianMs < 0.835)) fail(`query median ${p.query?.medianMs} ms exceeds 5% of 60 Hz`);
}

const pinned = [];
for (const preset of PRESETS) {
  for (const sim of SIMS) {
    const hash = `#preset=${preset}&cam=pov&surfer=1&sim=${sim}&speed=0&controls=0&q=high`;
    await page.goto('about:blank');
    await page.goto(`${BASE}${hash}`, { waitUntil: 'load' });
    await page.waitForTimeout(2600);
    let probe = await readProbe();
    probe = await comparePinnedSurface(probe);
    const label = `${preset}/sim${sim}`;
    assertProbe(probe, label, { requireSurfaceParity: true });
    pinned.push(probe);
    await page.screenshot({ path: join(OUT, `${preset}_pov_sim${sim}.png`) });
    console.log(`${label.padEnd(22)} surface=${probe.surfaceErrorM.toFixed(4)}m ` +
      `front=${probe.frontFaceOffsetM.toFixed(2)}m board=${probe.clearance.toFixed(3)}m ` +
      `eye=${probe.eyeAboveSurface.toFixed(3)}m ` +
      `roll=${probe.upTiltDeg.toFixed(2)}deg query=${probe.query.medianMs.toFixed(3)}ms`);
  }
}

const motion = [];
for (const preset of PRESETS) {
  await page.goto('about:blank');
  await page.goto(`${BASE}#preset=${preset}&cam=pov&surfer=1&sim=36&speed=1&controls=0&q=high`,
    { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  const samples = [];
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(150);
    const probe = await readProbe();
    assertProbe(probe, `${preset}/motion/${i}`);
    samples.push(probe);
  }
  const distance = Math.hypot(...samples[0].eye.map((v, i) => samples.at(-1).eye[i] - v));
  if (!(distance > 0.5)) throw new Error(`${preset}/motion: eye moved only ${distance} m`);
  motion.push({ preset, distanceM: distance, samples });
  console.log(`${preset.padEnd(22)} motion=${distance.toFixed(2)}m ` +
    `front=${Math.min(...samples.map((s) => s.frontFaceOffsetM)).toFixed(2)}-` +
    `${Math.max(...samples.map((s) => s.frontFaceOffsetM)).toFixed(2)}m ` +
    `minEye=${Math.min(...samples.map((s) => s.eyeAboveSurface)).toFixed(2)}m ` +
    `maxRoll=${Math.max(...samples.map((s) => s.upTiltDeg)).toFixed(2)}deg`);
}

await browser.close();
if (pageErrors.length) throw new Error(`PAGE ERRORS:\n${pageErrors.join('\n')}`);
writeFileSync(join(OUT, 'pov_acceptance.json'), JSON.stringify({ base: BASE, pinned, motion }, null, 1));
console.log(`written -> ${OUT}`);
