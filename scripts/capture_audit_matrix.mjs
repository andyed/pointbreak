// External-validity screenshot matrix (audit 2026-08-11). Usage:
//   node scripts/capture_audit_matrix.mjs [outdir]   (server must be up on :8127)
// Same deterministic pattern as scripts/capture_presets.mjs: fixed sim clock,
// reload after hash nav (hash-only nav would not re-init the modules).
const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  '/Users/andyed/Documents/dev/psychodeli-webgl-port/node_modules/playwright/index.mjs',
].filter(Boolean);
let chromium;
for (const c of PW_CANDIDATES) {
  try { ({ chromium } = await import(c)); break; } catch { /* try next */ }
}
if (!chromium) { console.error('playwright not found'); process.exit(1); }

import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = process.argv[2] || '/tmp/pointbreak-audit-captures';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:8127/web-three/';
const SIM_T = 42;

const PRESETS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks', 'privates'];

const shots = [];
for (const p of PRESETS) shots.push({ name: `drone_${p}`, hash: `preset=${p}&cam=drone&hud=0&sim=${SIM_T}` });
for (const p of PRESETS) shots.push({ name: `cliff_${p}`, hash: `preset=${p}&cam=cliff&hud=0&sim=${SIM_T}` });
for (const p of ['sewers', 'secondpeak', 'jacks']) shots.push({ name: `lineup_${p}`, hash: `preset=${p}&cam=lineup&hud=0&sim=${SIM_T}` });
// the 43-degree alpha swing pair: identical clock, 0.3 m of swell apart
shots.push({ name: `swing_secondpeak_h15`, hash: `preset=secondpeak&cam=drone&hud=0&sim=${SIM_T}&h0=1.5` });
shots.push({ name: `swing_secondpeak_h18`, hash: `preset=secondpeak&cam=drone&hud=0&sim=${SIM_T}&h0=1.8` });
// big winter day at the top of the point
shots.push({ name: `big_sewers_h28`, hash: `preset=sewers&cam=cliff&hud=0&sim=${SIM_T}&h0=2.8` });
// tide extremes (clamped range is -0.862..+0.764)
shots.push({ name: `tide_thehook_low`, hash: `preset=thehook&cam=cliff&hud=0&sim=${SIM_T}&tide=-0.8` });
shots.push({ name: `tide_thehook_high`, hash: `preset=thehook&cam=cliff&hud=0&sim=${SIM_T}&tide=0.7` });
// rider on, for the rider-on-wrong-surface question
shots.push({ name: `rider_secondpeak_cliff`, hash: `preset=secondpeak&cam=cliff&hud=0&sim=${SIM_T}&surfer=1` });

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

for (const s of shots) {
  const url = `${BASE}#${s.hash}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await page.screenshot({ path: join(OUT, `${s.name}.png`) });
  console.log(`captured ${s.name}`);
}
await browser.close();
if (errors.length) console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
console.log(`done — ${shots.length} captures in ${OUT}`);
