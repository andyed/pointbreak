// Crash A/B capture: default / #crash=1 / #roller=1 / #crash=1&roller=1 at the
// Sewers close camera, matched by LOCAL AGE of one head's pitch (station
// x = -52, the camera's target), plus the Lookout replay pose.
//
// Age is read off the GPU: the plume probe's landing clock (tauD + CRASH_PEAK_S)
// at sim 48 gives the station's birth, and every arm seeks birth + age. The
// clock is the lifecycle's own and does not depend on the flags, so the four
// arms are the same instant of the same wave. Frames are JPEG q80 at 1000x625.
//
// Usage: node scripts/capture_crash_ab.mjs [--out=qa/crash-2026-09-24]
//        [--base-url=http://127.0.0.1:8133] [--ages=0.3,0.45,0.6,0.8,1.2,2.0]
//        [--arms=default,crash,roller,both,tube] [--lookout-ages=0.6,1.2]
// Requires scripts/serve.py on the base port. PLAYWRIGHT_DIR optional.
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ROOT, loadChromium, installPlumeProbe, routeRenderer, seek, PLUME_SAMPLES, CRASH_PEAK_S } from './lib/plume-probe.mjs';

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const s = a.replace(/^--/, ''); const eq = s.indexOf('=');
  return eq < 0 ? [s, 'true'] : [s.slice(0, eq), s.slice(eq + 1)];
}));
const OUT = resolve(flags.out || join(ROOT, 'qa/crash-2026-09-24'));
const BASE = flags['base-url'] || 'http://127.0.0.1:8133';
const AGES = (flags.ages || '0.3,0.45,0.6,0.8,1.2,2.0').split(',').map(Number);
const LOOKOUT_AGES = (flags['lookout-ages'] || '0.6,1.2').split(',').map(Number);
const ARMS = {
  default: '',
  crash: '&crash=1',
  roller: '&roller=1',
  both: '&crash=1&roller=1',
  tube: '&crash=1&tube=1&classic=1&descent=1',   // the jury's best-shape arm with the plume on it
};
const ARM_NAMES = (flags.arms || 'default,crash,roller,both').split(',').filter((a) => a in ARMS);
const STATION_X = -52;
const CLOSE = { eye: [12, 11, -190], target: [-52, 4, -229] };   // stage coordinates
const COMMON = 'preset=sewers&month=card&speed=0&sim=48&q=high&controls=0';
mkdirSync(OUT, { recursive: true });

const chromium = await loadChromium();
const mainSource = readFileSync(join(ROOT, 'web-three/js/main.js'), 'utf8');
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 625 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await routeRenderer(page, mainSource);

async function boot(cam, arm) {
  await page.goto('about:blank');
  await page.goto(`${BASE}/web-three/#${COMMON}&cam=${cam}${ARMS[arm]}`);
  await page.waitForFunction(() => window.__pointbreak?.uniforms?.u_time.value === 48, null, { timeout: 90000 });
  if (cam === 'cliff') await page.evaluate(({ eye, target }) => {
    const p = window.__pointbreak; p.controls.dispatchEvent({ type: 'start' }); p.setView(eye, target);
  }, CLOSE);
}
const manifest = { baseUrl: BASE, viewport: [1000, 625], station: STATION_X, camera: CLOSE, ages: AGES, frames: [] };
let birth = null;
try {
  for (const arm of ARM_NAMES) {
    await boot('cliff', arm);
    await page.evaluate(installPlumeProbe, PLUME_SAMPLES);
    const at48 = await page.evaluate((x) => window.probePlume(x), STATION_X);
    const b = 48 - (at48.land.tauD + CRASH_PEAK_S);
    if (birth === null) birth = b;
    else if (Math.abs(b - birth) > 1e-3) throw new Error(`birth drifts between arms: ${birth} vs ${b}`);
    for (const age of AGES) {
      await seek(page, birth + age);
      const r = await page.evaluate((x) => window.probePlume(x), STATION_X);
      const png = `close_${arm}_${age.toFixed(2)}.jpg`;
      await page.screenshot({ path: join(OUT, png), type: 'jpeg', quality: 80 });
      manifest.frames.push({ cam: 'close', arm, age, t: birth + age, file: png, tauD: r.land.tauD,
                             strength: r.land.strength, plumeTopOverContactM: Math.max(...r.spine.map((q) => q.y)) - r.contact.y,
                             lipY: r.lip.y, contactY: r.contact.y,
                             hC: r.land.hC, bytes: statSync(join(OUT, png)).size });
      console.log(`${png}  tauD ${r.land.tauD.toFixed(3)} strength ${r.land.strength.toFixed(3)}`);
    }
    await boot('lookout', arm);
    for (const age of LOOKOUT_AGES) {
      await seek(page, birth + age);
      const png = `lookout_${arm}_${age.toFixed(2)}.jpg`;
      await page.screenshot({ path: join(OUT, png), type: 'jpeg', quality: 80 });
      manifest.frames.push({ cam: 'lookout', arm, age, t: birth + age, file: png, bytes: statSync(join(OUT, png)).size });
      console.log(png);
    }
  }
  manifest.birth = birth;
  manifest.totalBytes = manifest.frames.reduce((s, f) => s + f.bytes, 0);
  manifest.errors = errors;
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`done - ${manifest.frames.length} frames, ${(manifest.totalBytes / 1e6).toFixed(2)} MB -> ${OUT}`);
  if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exitCode = 1; }
} finally {
  await browser.close();
}
