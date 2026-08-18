// Aerated-lip A/B capture rig (#lip=1 vs shipped OFF).
//
// The claim under test is Track 5's "the lip lacks the field footage's aerated
// volume": at the curl the plunging lip should be the WHITEST thing in frame,
// and the shipped renderer draws it as clean glass. This rig captures pinned
// clocks OFF and ON and, per frame, records WHERE the fold locus is — solved
// from the model's own head (m4Ride rides the zipper crest) and the baked
// line (lineProbe), projected to screen through the live camera — so the luma
// measurement (scripts/measure_lip_luma.py) samples the mechanism's locus,
// not a hand-drawn crop. Instrument-not-framer discipline per
// MEASUREMENT_LESSONS 11: the camera rigs are the app's own presets, pinned
// by sim clock, and recorded per frame so OFF/ON drift would be caught.
//
// Requires the dev server already running (python3 scripts/serve.py 8209 —
// this rig deliberately does NOT self-serve; 8188-8198 are taken by sibling
// rigs and the no-store server is the anti-stale-module guard).
// Navigation goes through about:blank between configs: a warm-page hash goto
// races the app's own boot-only reload.
//
// Usage: node scripts/capture_lip_ab.mjs [outdir] [baseUrl]

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname,
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

const OUT = resolve(process.argv[2] || '/tmp/pointbreak-lip-ab');
const BASE_URL = process.argv[3] || 'http://localhost:8209';
const TIMES = [36, 42, 48, 54];
// Hero drone state + a low profile view of the curl, and a spilling-character
// contrast (Sharks xi = 0.45 sits at the plunge ramp's foot; Sewers 1.15 near
// its top) so the Iribarren modulation is measured, not asserted.
const RIGS = [
  { name: 'drone_sewers', hash: 'preset=sewers&cam=drone' },
  { name: 'cliff_sewers', hash: 'preset=sewers&cam=cliff' },
  { name: 'cliff_sharks', hash: 'preset=sharks&cam=cliff' },
];
// LIP_ARMS=off runs the baseline alone (the pre-implementation diagnosis pass).
const ARMS = [ { name: 'off', flag: '' }, { name: 'on', flag: '&lip=1' } ]
  .filter((a) => (process.env.LIP_ARMS || 'off,on').split(',').includes(a.name));
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
        const V3 = cam.position.constructor;
        const proj = (x, y, z) => {
          const v = new V3(x, y, z).project(cam);
          return [Math.round((v.x * 0.5 + 0.5) * innerWidth * 10) / 10,
                  Math.round((1 - (v.y * 0.5 + 0.5)) * innerHeight * 10) / 10,
                  (v.z > -1 && v.z < 1) ? 1 : 0];
        };
        const line = pb.lineProbe ? pb.lineProbe(2) : null;
        const zAt = (x) => {
          if (!line || !line.length) return null;
          let best = line[0];
          for (const p of line) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
          return best.z;
        };
        const ride = pb.m4Ride ? pb.m4Ride() : null;
        const headX = ride ? ride.x : 0;
        // Sample loci in the MODEL frame around the head: the lip column at
        // the line (world y swept 0..8 m — displayed crest heights), the face
        // 12 m seaward (y 0..4.5), open water 45 m seaward (y 0..2).
        const stations = [];
        for (let k = -30; k <= 30; k += 5) {
          const x = headX + k;
          const zl = zAt(x);
          if (zl === null) continue;
          stations.push({
            x, zLine: Math.round(zl * 100) / 100,
            lip:   [proj(x, 0.0, zl),      proj(x, 8.0, zl)],
            face:  [proj(x, 0.0, zl - 12), proj(x, 4.5, zl - 12)],
            water: [proj(x, 0.0, zl - 45), proj(x, 2.0, zl - 45)],
          });
        }
        return {
          sim: pb.sim(),
          lipAer: pb.uniforms.u_lipAer ? pb.uniforms.u_lipAer.value : null,
          xi: pb.state.xi, h0: pb.state.H0,
          camera: cam.position.toArray().map((v) => Math.round(v * 100) / 100),
          target: pb.controls.target.toArray().map((v) => Math.round(v * 100) / 100),
          headX: Math.round(headX * 100) / 100,
          headZ: ride ? Math.round(ride.z * 100) / 100 : null,
          stations,
        };
      });
      if (probe.sim !== sim) throw new Error(`clock mismatch: wanted ${sim}, got ${probe.sim}`);
      const png = `${rig.name}_${arm.name}_${String(sim).padStart(3, '0')}.png`;
      await page.screenshot({ path: join(OUT, png) });
      manifest.frames.push({ rig: rig.name, arm: arm.name, sim, hash, png, ...probe });
      console.log(`captured ${png}  head x=${probe.headX} lipAer=${probe.lipAer}`);
    }
  }
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`done - ${manifest.frames.length} captures in ${OUT}`);
