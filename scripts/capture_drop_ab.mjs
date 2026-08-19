// Capture rig for the dropMag re-scope (#drop=legacy) and for the
// #curl x #lip coherence matrix.
//
// Two questions, one rig because they are one code region:
//  1. THE SILHOUETTE. dropMag used to subtract a fixed fraction of the whole
//     water column wherever the wave was breaking, so the crest was shortest
//     at the pocket. The numbers are in scripts/measure_pocket_crest.mjs; this
//     is what it looks like. The LINEUP camera is the one that can answer it —
//     it sits at water level in profile, where crest height reads as height
//     rather than as plan area (a drone frame cannot support a height claim,
//     MEASUREMENT_LESSONS 1 in its spatial form).
//  2. THE FOUR-COMBINATION CHECK. #lip's aeration curtain and #curl's bend
//     used to contradict each other: the curtain keyed off throwMag, which
//     #curl computes and then does not apply. All four combinations are
//     captured so "coherent in each" is a checkable statement rather than an
//     assertion about the one that was looked at.
//
// Requires the dev server already running (python3 scripts/serve.py 8215).
// about:blank between configs: #drop and #curl are boot-only.
//
// Usage: node scripts/capture_drop_ab.mjs [outdir] [--port=8215] [--matrix]

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

const args = process.argv.slice(2);
const flag = (k, d) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const OUT = resolve(args.find((a) => !a.startsWith('--')) || '/tmp/pointbreak-drop');
const PORT = Number(flag('port', 8215));
const MATRIX = args.includes('--matrix');
const BASE_URL = `http://localhost:${PORT}`;
const TIMES = [36, 42, 48, 54];

// cliff = the low profile view, 16 m over the point — the one that can carry a
// crest-height claim, and the view the #curl evidence was shot from. drone =
// the hero state.
// CAVEAT, measured 2026-08-18: cam=lineup sits AT water level and at Sewers
// sims 48/54 the camera ends up INSIDE the wave — the frame is a flat white
// wall and every pixel differs between arms for reasons that have nothing to
// do with the arm. It is kept in the drop A/B set (where it reads fine at
// 36/42 and shows the pocket silhouette better than anything else) and kept
// OUT of the coherence matrix, where a swamped frame would be scored as a
// difference. An instrument has to be checked against what it is measuring
// over (MEASUREMENT_LESSONS 8c).
const RIGS = MATRIX
  ? [{ name: 'cliff_sewers', hash: 'preset=sewers&cam=cliff' },
     { name: 'drone_sewers', hash: 'preset=sewers&cam=drone' }]
  : [{ name: 'lineup_sewers', hash: 'preset=sewers&cam=lineup' },
     { name: 'cliff_sewers',  hash: 'preset=sewers&cam=cliff' },
     { name: 'drone_sewers',  hash: 'preset=sewers&cam=drone' },
     { name: 'lineup_sharks', hash: 'preset=sharks&cam=lineup' }];

// The drop A/B is fixed-vs-legacy. The matrix is the four lip x curl states,
// all on the FIXED drop (that is what ships).
const ARMS = MATRIX
  ? [{ name: 'lipoff-curloff', flag: '' },
     { name: 'lipon-curloff',  flag: '&lip=1' },
     { name: 'lipoff-curlon',  flag: '&curl=1' },
     { name: 'lipon-curlon',   flag: '&lip=1&curl=1' }]
  : [{ name: 'legacy', flag: '&drop=legacy' },
     { name: 'fixed',  flag: '' },
     { name: 'curl',   flag: '&curl=1' }];
const BASE = 'controls=0&q=high&speed=0&month=card';

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const manifest = { baseUrl: BASE_URL, viewport: [1440, 900], times: TIMES,
                   matrix: MATRIX, frames: [] };

for (const rig of RIGS) {
  for (const arm of ARMS) {
    for (const sim of TIMES) {
      const hash = `${rig.hash}&${BASE}&sim=${sim}${arm.flag}`;
      await page.goto('about:blank');
      await page.goto(`${BASE_URL}/web-three/#${hash}`, { waitUntil: 'load' });
      await page.waitForTimeout(2600);
      // Numbers alongside the picture: the aeration mask and the overturn
      // angle at the head, so the four-combination check is not decided by
      // eye alone. Sampled through curlProbe (the shipped SURFACE_GLSL) at the
      // rider's own station, which is where the zipper's pocket is.
      const probe = await page.evaluate(() => {
        const pb = window.__pointbreak;
        const ride = pb.m4Ride ? pb.m4Ride() : null;
        const headX = ride ? ride.x : 0;
        const line = pb.lineProbe ? pb.lineProbe(10) : [];
        let zc = -20;
        if (line && line.length) {
          let best = line[0];
          for (const p of line) if (Math.abs(p.x - headX) < Math.abs(best.x - headX)) best = p;
          zc = best.z;
        }
        const s = pb.curlProbe(Math.round(headX), zc - 70, zc + 30, 1024);
        const water = s.filter((p) => p.land < 0.5);
        let apex = water[0] || s[0];
        for (const p of water) if (p.y > apex.y) apex = p;
        const mx = (f) => Math.max(...s.map(f));
        return {
          sim: pb.sim(),
          curl: pb.uniforms.u_curl.value,
          lipAer: pb.uniforms.u_lipAer.value,
          legacyDrop: pb.uniforms.u_legacyDrop.value,
          xi: +pb.state.xi.toFixed(2), H0: +pb.state.H0.toFixed(2),
          headX: Math.round(headX), zLine: +zc.toFixed(1),
          crestY: +apex.y.toFixed(2), ceilM: +apex.ceil.toFixed(2),
          fill: +(apex.y / Math.max(apex.ceil, 1e-3)).toFixed(3),
          aerMax: +mx((p) => p.aer).toFixed(3),
          curlMax: +mx((p) => p.curl).toFixed(3),
          pocketMax: +mx((p) => p.pocket).toFixed(3),
        };
      });
      if (probe.sim !== sim) throw new Error(`clock mismatch: wanted ${sim}, got ${probe.sim}`);
      const png = `${rig.name}_${arm.name}_${String(sim).padStart(3, '0')}.png`;
      await page.screenshot({ path: join(OUT, png) });
      manifest.frames.push({ rig: rig.name, arm: arm.name, sim, hash, png, ...probe });
      console.log(`${png}  crest=${probe.crestY} ceil=${probe.ceilM} fill=${probe.fill} ` +
                  `aer=${probe.aerMax} curl=${probe.curlMax} pocket=${probe.pocketMax}`);
    }
  }
}

writeFileSync(join(OUT, MATRIX ? 'manifest_matrix.json' : 'manifest_drop.json'),
  JSON.stringify(manifest, null, 2));
await browser.close();
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`done - ${manifest.frames.length} captures in ${OUT}`);
