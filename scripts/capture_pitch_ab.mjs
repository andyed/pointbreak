// Forward-pitch A/B capture rig (shipped EVEN skew map vs #pitch=0, the odd
// one that pitched nothing).
//
// The numbers are settled by scripts/probe_wave_shape.mjs — Sk, As, the biphase
// psi and the front/back face ratio, measured on the shipped MODEL_GLSL. This
// rig exists for the half a probe cannot settle: whether the corrected wave
// READS as a wave leaning into its break. Two views, because they answer
// different questions:
//
//   drone  — the hero screensaver state, where the change must not wreck the
//            established read of the peel.
//   lineup — the low telephoto (8.5 m eye, looking at 4 m) that the camera
//            comment calls the shot for judging face/lip negative space. This
//            is the PROFILE view: the only rig where fore-aft lean is visible
//            as lean rather than as shading.
//
// Two spots, because pitch and barrel-ness are independent parameters and the
// change must not quietly become an xi effect: Sewers (xi 1.15, plunging) and
// Sharks (xi 0.45, spilling).
//
// Requires the dev server already running (python3 scripts/serve.py 8214 —
// 8188-8213 are taken by sibling rigs, and the no-store server is the
// anti-stale-module guard). Navigation goes through about:blank between
// configs: a warm-page hash goto races the app's own boot-only reload.
//
// Usage: node scripts/capture_pitch_ab.mjs [outdir] [baseUrl]

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname,
  // Absolute fallback, same as probe_wave_shape.mjs: inside a git worktree the
  // sibling-repo relative path resolves under .claude/worktrees/ and misses.
  '/Users/andyed/Documents/dev/psychodeli-webgl-port/node_modules/playwright/index.mjs',
].filter(Boolean);
let chromium;
for (const candidate of PW_CANDIDATES) {
  try { ({ chromium } = await import(candidate)); break; } catch { /* next */ }
}
if (!chromium) {
  console.error('playwright not found. Set PLAYWRIGHT_DIR=/path/to/playwright/index.mjs');
  process.exit(1);
}

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const OUT = resolve(process.argv[2] || '/tmp/pointbreak-pitch-ab');
const BASE_URL = process.argv[3] || 'http://localhost:8214';
const TIMES = [36, 42, 48, 54];
const RIGS = [
  { name: 'drone_sewers', hash: 'preset=sewers&cam=drone' },
  { name: 'drone_secondpeak', hash: 'preset=secondpeak&cam=drone' },
  { name: 'lineup_sewers', hash: 'preset=sewers&cam=lineup' },
  { name: 'lineup_sharks', hash: 'preset=sharks&cam=lineup' },
];
// ON is the shipped default; OFF is the #pitch=0 revert. Named that way round
// deliberately — this is a defect fix, so "off" is the old behaviour.
const ARMS = [{ name: 'off', flag: '&pitch=0' }, { name: 'on', flag: '' }];
const BASE = 'controls=0&q=high&speed=0';

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const manifest = { baseUrl: BASE_URL, viewport: [1440, 900], times: TIMES, frames: [] };

for (const rig of RIGS) {
  for (const arm of ARMS) {
    for (const sim of TIMES) {
      const hash = `${rig.hash}&${BASE}&sim=${sim}${arm.flag}`;
      await page.goto('about:blank');
      await page.goto(`${BASE_URL}/web-three/#${hash}`, { waitUntil: 'load' });
      await page.waitForTimeout(2600);
      const probe = await page.evaluate(() => {
        const pb = window.__pointbreak;
        const cam = pb.camera;
        const ride = pb.m4Ride ? pb.m4Ride() : null;
        return {
          sim: pb.sim(),
          pitchOdd: pb.uniforms.u_pitchOdd ? pb.uniforms.u_pitchOdd.value : null,
          xi: pb.state.xi, h0: pb.state.H0, tide: pb.state.tide,
          camera: cam.position.toArray().map((v) => Math.round(v * 100) / 100),
          target: pb.controls.target.toArray().map((v) => Math.round(v * 100) / 100),
          fov: cam.fov,
          headX: ride ? Math.round(ride.x * 100) / 100 : null,
          headZ: ride ? Math.round(ride.z * 100) / 100 : null,
        };
      });
      if (probe.sim !== sim) throw new Error(`clock mismatch: wanted ${sim}, got ${probe.sim}`);
      const wantOdd = arm.name === 'off' ? 1 : 0;
      if (probe.pitchOdd !== wantOdd)
        throw new Error(`arm ${arm.name} did not take: u_pitchOdd = ${probe.pitchOdd}`);
      const png = `${rig.name}_${arm.name}_${String(sim).padStart(3, '0')}.png`;
      await page.screenshot({ path: join(OUT, png) });
      manifest.frames.push({ rig: rig.name, arm: arm.name, sim, hash, png, ...probe });
      console.log(`captured ${png}  pitchOdd=${probe.pitchOdd} cam=${JSON.stringify(probe.camera)}`);
    }
  }
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`done - ${manifest.frames.length} captures in ${OUT}`);
