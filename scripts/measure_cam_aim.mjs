// Camera-aim acceptance instrument (TODO Track 2): for each mapped preset and
// each fixed rig, the angular error between the camera's forward direction and
// the baked break line's action centroid (__pointbreak.aimProbe().errDeg),
// with the baked-line aim ON (#aim=1 default) vs OFF (#aim=0, authored-line
// rigs). Follows the dump_lineprobe.mjs pattern: playwright over serve.py.
//
// Usage: node scripts/measure_cam_aim.mjs out.json [--base=http://localhost:8205/web-three/]
//        [--shots=screens_dir]   also capture per-config PNGs
import { writeFileSync, mkdirSync } from 'node:fs';

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../../../../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
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

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--'))
  .map((a) => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
const out = args.find((a) => !a.startsWith('--'));
if (!out) { console.error('usage: node scripts/measure_cam_aim.mjs out.json [--base=URL] [--shots=dir]'); process.exit(1); }
const BASE = flags.base || 'http://localhost:8205/web-three/';
const SHOTS = flags.shots || null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
// Screenshot subset: enough presets to see the composition change without 56 PNGs.
const SHOT_PRESETS = new Set(['secondpeak', 'sewers', 'sharks']);

const PRESETS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks', 'privates'];
const CAMS = ['drone', 'cliff'];

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
const rows = [];
for (const preset of PRESETS) {
  for (const cam of CAMS) {
    for (const aim of [0, 1]) {
      // sim=42: the house probe clock, deterministic captures. #aim is
      // boot-only, so each config is a fresh load.
      const hash = `preset=${preset}&cam=${cam}&sim=42&aim=${aim}`;
      await page.goto(`${BASE}#${hash}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      const probe = await page.evaluate(() => window.__pointbreak.aimProbe());
      // NB: probe carries its own `aim` (the smoothed point) — keep the 0/1
      // flag under a distinct key or the spread clobbers it.
      rows.push({ preset, cam, aimFlag: aim, ...probe });
      console.log(`${preset.padEnd(11)} ${cam.padEnd(6)} aim=${aim}  errDeg=${probe.errDeg == null ? 'n/a' : probe.errDeg.toFixed(2)}`);
      if (SHOTS && SHOT_PRESETS.has(preset))
        await page.screenshot({ path: `${SHOTS}/${preset}_${cam}_aim${aim}.png` });
    }
  }
}
await browser.close();
writeFileSync(out, JSON.stringify(rows, null, 1));

// summary table: before (aim=0) vs after (aim=1)
console.log('\npreset      cam     before   after');
for (const preset of PRESETS) {
  for (const cam of CAMS) {
    // probe.cam is the preset's display name ("Drone"); compare case-blind
    const b = rows.find((r) => r.preset === preset && r.cam.toLowerCase() === cam && r.aimFlag === 0);
    const a = rows.find((r) => r.preset === preset && r.cam.toLowerCase() === cam && r.aimFlag === 1);
    const f = (r) => (r && r.errDeg != null ? r.errDeg.toFixed(2).padStart(6) : '   n/a');
    console.log(`${preset.padEnd(11)} ${cam.padEnd(6)} ${f(b)}  ${f(a)}`);
  }
}
