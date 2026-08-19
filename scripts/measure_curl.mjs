// Does the breaking wave actually overturn? — the #curl A/B, as numbers.
//
// An overhang is a FOLD in the map z0 -> z (source grid coordinate to displaced
// world z). Nothing in a rendered frame can decide that: two surfaces at the
// same screen pixel look like one. So this reads the displaced surface back
// from the GPU along shore-normal transects (`__pointbreak.curlProbe`, which
// runs the shipped SURFACE_GLSL chunk) and reports, per transect:
//
//   faceDeg   max turning angle of the front face from horizontal, measured as
//             atan2(-dy, dz). Values > 90 deg ARE the overhang: the surface has
//             passed vertical and is running back seaward as it descends.
//   overhangM the retrograde excursion, metres — sum of |dz| over the longest
//             run of dz < 0. This is the horizontal distance the lip stands
//             clear of the water beneath it.
//   cells     overhangM in grid cells at the tier under test: an overturn
//             thinner than the cell cannot be drawn, only aliased.
//
// The server is NOT started here — run `python3 scripts/serve.py 8211` first
// (house rule for this worktree; sibling rigs own 8188-8210).
//
// Usage: node scripts/measure_curl.mjs [outdir] [--port=8211] [--q=high]

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
import { resolve } from 'node:path';

const args = process.argv.slice(2);
const flag = (k, d) => {
  const hit = args.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const OUT = resolve(args.find((a) => !a.startsWith('--')) || '/tmp/pointbreak-curl');
const PORT = Number(flag('port', 8211));
const TIER = flag('q', 'high');
const BASE = `http://localhost:${PORT}/web-three/`;

// Two spots that must behave DIFFERENTLY or the xi modulation is decorative:
// Sewers is the most plunging preset in the bank, Sharks the most spilling one
// that still has measured bathymetry behind it (Privates has none, so its
// depth path is switched off and it cannot test the excess gate).
const SPOTS = [
  { preset: 'sewers', xi: 1.15, cam: 'cliff' },
  { preset: 'sharks', xi: 0.45, cam: 'cliff' },
];
const TIMES = [36, 42, 48, 54];
const ARMS = [{ name: 'off', hash: '' }, { name: 'on', hash: '&curl=1' }];
// Quality tiers, for the resolution honesty check. Cell sizes mirror main.js:
// u_cell = (STAGE_W/(segX*CORE), STAGE_D/(segZ*CORE)) with CORE = 0.8.
const TIERS = { high: [512, 384], medium: [362, 272], low: [256, 192], potato: [181, 136] };
const cellZ = (tier) => 500 / (TIERS[tier][1] * 0.8);

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// One transect -> the three numbers. Segments are taken in SOURCE order, so a
// fold shows up as dz < 0 and nothing has to be inferred from the picture.
// SCOPE THE STATISTIC TO THE CREST, or it measures the wrong defect. The first
// cut took the max over the whole 100 m transect and reported 180 deg face
// angles and 32 m overhangs in BOTH arms — dominated by the documented
// trough-crease pathology (lam = S/(a·k²) amplifies wind-chop gradients where
// the local amplitude estimate bottoms out; see the PACK-ICE FIX comment in
// choppyPos). Those creases are real geometry and worth counting, but they are
// not a lip: a summary has to be checked against what it is summarising over
// (MEASUREMENT_LESSONS 8c). So the lip window is +/-25 m of the crest apex,
// everything else is reported separately as `strayFoldM`.
const WIN_M = 25, MIN_SEG = 0.02;
function analyse(samples, cell) {
  const water = samples.filter((p) => p.land < 0.5);
  if (!water.length) return null;
  let apex = water[0];
  for (const p of water) if (p.y > apex.y) apex = p;
  let faceDeg = 0, bestRun = 0, run = 0, curlMax = 0, pockMax = 0;
  let strayRun = 0, strayBest = 0, multi = 0;
  // The retrograde run's VERTICAL extent. This is the number that separates a
  // thrown curtain from a shear: the shipped fold and the rotated lip can run
  // back the same number of metres in z, but the shipped one does it over ~1 m
  // of height (a thin shell) and the rotation does it over most of the face.
  let runDrop = 0, bestDrop = 0;
  for (let i = 1; i < samples.length; i++) {
    const a = samples[i - 1], b = samples[i];
    if (b.curl > curlMax) curlMax = b.curl;
    if (b.pocket > pockMax) pockMax = b.pocket;
    if (a.land > 0.5 || b.land > 0.5) { run = 0; strayRun = 0; continue; }
    const dz = b.z - a.z, dy = b.y - a.y;
    const inWin = Math.abs(b.z0 - apex.z0) <= WIN_M;
    if (!inWin) {
      if (dz < 0) { strayRun += -dz; if (strayRun > strayBest) strayBest = strayRun; }
      else strayRun = 0;
      run = 0;
      continue;
    }
    // Front face: descending shoreward. MIN_SEG drops degenerate steps, where
    // atan2 of two ~0 components reports 180 deg from rounding.
    if (dy < 0 && Math.abs(dy) + Math.abs(dz) > MIN_SEG && Math.max(a.y, b.y) > 0.5) {
      const deg = Math.atan2(-dy, dz) * 180 / Math.PI;
      if (deg > faceDeg) faceDeg = deg;
    }
    if (dz < 0) {
      run += -dz; runDrop += Math.max(-dy, 0); multi++;
      if (run > bestRun) { bestRun = run; bestDrop = runDrop; }
    } else { run = 0; runDrop = 0; }
  }
  return { faceDeg: +faceDeg.toFixed(2), overhangM: +bestRun.toFixed(3),
           overhangDropM: +bestDrop.toFixed(2),
           cells: +(bestRun / cell).toFixed(2), multiSamples: multi,
           strayFoldM: +strayBest.toFixed(2), curlMax: +curlMax.toFixed(3),
           pocketMax: +pockMax.toFixed(3),
           crestY: +apex.y.toFixed(2), crestZ: +apex.z.toFixed(2) };
}

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const rows = [];
for (const spot of SPOTS) {
  for (const arm of ARMS) {
    for (const sim of TIMES) {
      const hash = `preset=${spot.preset}&cam=${spot.cam}&month=card&controls=0&q=${TIER}` +
                   `&speed=0&sim=${sim}${arm.hash}`;
      // about:blank between configs: a hash-only change re-applies live for
      // control params, and #curl is boot-only, so a clean load is the only
      // way to be sure which build produced the numbers.
      await page.goto('about:blank');
      await page.goto(`${BASE}#${hash}`, { waitUntil: 'load' });
      await page.waitForTimeout(2600);
      const probe = await page.evaluate(({ n }) => {
        const pb = window.__pointbreak;
        if (!pb?.curlProbe) return { err: 'no curlProbe' };
        // Stations across the RIDEABLE STAGE, not the ~600 m bake: the bake's
        // flanks are flat and would make every statistic true and vacuous
        // (MEASUREMENT_LESSONS 8c). The window is then centred on the break
        // line where there is one, and on the stage otherwise.
        const line = pb.lineProbe(10) || [];
        const zAt = (x) => {
          if (!line.length) return -20;
          let best = line[0];
          for (const p of line) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
          return best.z;
        };
        const s0 = pb.state.stageStart, s1 = pb.state.stageEnd;
        const xs = [];
        for (let f = 0.08; f <= 0.93; f += 0.05) xs.push(Math.round(s0 + (s1 - s0) * f));
        return {
          curl: pb.uniforms.u_curl.value,
          sim: pb.sim(),
          xi: pb.state.xi,
          H0: +pb.state.H0.toFixed(2),
          stage: [s0, s1],
          transects: xs.map((x) => {
            const zc = zAt(x);
            // 100 m of z at ~0.1 m: the pocket bell is sigma 7.5 m and the
            // overturn is metres wide, so the sampling has to be well under
            // the feature, not under the grid cell.
            return { x, zc, s: pb.curlProbe(x, zc - 70, zc + 30, n) };
          }),
        };
      }, { n: 1024 });
      if (probe.err) throw new Error(probe.err);
      if (probe.sim !== sim) throw new Error(`clock mismatch ${probe.sim} != ${sim}`);
      if (probe.curl !== (arm.name === 'on' ? 1 : 0)) throw new Error('curl uniform mismatch');
      for (const tr of probe.transects) {
        const a = analyse(tr.s, cellZ(TIER));
        if (!a) continue;
        rows.push({ preset: spot.preset, xi: probe.xi, H0: probe.H0, arm: arm.name,
                    q: TIER, sim, x: tr.x, zBreak: +tr.zc.toFixed(1), ...a });
      }
      process.stdout.write(`${spot.preset} ${arm.name} sim=${sim} ok\n`);
    }
  }
}

// SUMMARISE OVER THE LIP, not over the stage. A transect with no pocket has
// no lip to measure, and including it makes "median overturn" a statement
// about how often the zipper is elsewhere. pocket >= 0.5 is the same gate the
// geometry uses to decide there is a breaking crest here at all.
const summary = {};
for (const r of rows) {
  if (r.pocketMax < 0.5) continue;
  const k = `${r.preset}/${r.arm}`;
  summary[k] ??= { faceDeg: 0, overhangM: 0, overhangDropM: 0, cells: 0, n: 0,
                   folded: 0, strayFoldM: 0, curlMax: 0, crestY: 0,
                   p90face: [], xi: r.xi };
  const s = summary[k];
  s.faceDeg = Math.max(s.faceDeg, r.faceDeg);
  s.overhangM = Math.max(s.overhangM, r.overhangM);
  s.overhangDropM = Math.max(s.overhangDropM, r.overhangDropM);
  s.crestY = Math.max(s.crestY, r.crestY);
  s.cells = Math.max(s.cells, r.cells);
  s.strayFoldM = Math.max(s.strayFoldM, r.strayFoldM);
  s.curlMax = Math.max(s.curlMax, r.curlMax);
  s.p90face.push(r.faceDeg);
  s.med ??= { overhangM: [], overhangDropM: [], crestY: [] };
  s.med.overhangM.push(r.overhangM);
  s.med.overhangDropM.push(r.overhangDropM);
  s.med.crestY.push(r.crestY);
  s.folded += r.overhangM > 0 ? 1 : 0;
  s.n++;
}

writeFileSync(resolve(OUT, `curl_metrics_q${TIER}.json`),
  JSON.stringify({ port: PORT, tier: TIER, cellZ: +cellZ(TIER).toFixed(3), errors, summary, rows }, null, 2));
console.log(`\nq=${TIER}  cellZ=${cellZ(TIER).toFixed(2)} m`);
for (const [k, s] of Object.entries(summary)) {
  s.p90face.sort((a, b) => a - b);
  s.p90 = +s.p90face[Math.floor(0.9 * (s.p90face.length - 1))].toFixed(1);
  delete s.p90face;
  const median = (a) => { a.sort((x, y) => x - y); return +a[Math.floor(a.length / 2)].toFixed(2); };
  s.medOverhangM = median(s.med.overhangM);
  s.medOverhangDropM = median(s.med.overhangDropM);
  s.medCrestY = median(s.med.crestY);
  delete s.med;
  console.log(`${k.padEnd(16)} xi=${s.xi}  maxFace=${s.faceDeg.toFixed(1)} deg (p90 ${s.p90})  ` +
              `overhang=${s.overhangM.toFixed(2)} m x ${s.overhangDropM.toFixed(1)} m drop ` +
              `(${s.cells.toFixed(1)} cells)  maxTurn=${(s.curlMax * 180).toFixed(0)} deg  ` +
              `crest=${s.crestY.toFixed(1)} m  stray=${s.strayFoldM.toFixed(1)} m  ` +
              `folded ${s.folded}/${s.n}\n${''.padEnd(16)} MEDIAN over lip transects: ` +
              `overhang=${s.medOverhangM} m x ${s.medOverhangDropM} m drop, crest=${s.medCrestY} m`);
}
if (errors.length) console.error('PAGE ERRORS:', errors.slice(0, 5));
await browser.close();
