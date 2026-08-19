// Is the wave TALLEST where it breaks? — the dropMag audit, as numbers.
//
// A breaking wave's crest approaches the depth limit H = gamma*h at the pocket:
// that is what "depth-limited" means. The shipped geometry does the opposite.
// `dropMag` (choppyPos) subtracts `3.0 * pocket * plunge * hM` from the height,
// and hM IS h/VIS — so the subtraction is proportional to the height it is
// subtracted from, i.e. a MULTIPLICATIVE shrink of the whole face, weighted by
// `pocket`. It bites hardest exactly at the breaking pocket and hardest of all
// at the crest, which is the tallest point on it.
//
// So this measures three heights per station and compares them:
//
//   crestY   the displayed crest apex, read back off the GPU (curlProbe runs
//            the shipped SURFACE_GLSL as a fragment pass — no JS twin, cf.
//            MEASUREMENT_LESSONS 4).
//   ceilM    crestCeilM at the apex: the depth-limited ceiling the model
//            itself computes (0.8*VIS*min(H0*Ks, gamma*h)). The denominator.
//            Without it "the pocket crest is 5 m" is a number with no claim in
//            it (MEASUREMENT_LESSONS 8c).
//   nbrY     the tallest crest among nearby stations that are NOT in the
//            pocket. This is the "one station away" comparison from the audit,
//            done systematically instead of at one hand-picked x.
//
// The headline statistic is `fill` = crestY / ceilM at pocket stations. A
// breaking crest should be near 1. A pocket that measures well below its own
// non-breaking neighbours is the defect, stated without reference to any tuned
// constant.
//
// The server is NOT started here — run `python3 scripts/serve.py 8215` first.
//
// Usage: node scripts/measure_pocket_crest.mjs [outdir] [--port=8215]
//                                              [--q=high] [--arms=default,legacy]

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
const OUT = resolve(args.find((a) => !a.startsWith('--')) || '/tmp/pointbreak-drop');
const PORT = Number(flag('port', 8215));
const TIER = flag('q', 'high');
const BASE = `http://localhost:${PORT}/web-three/`;
const TAG = flag('tag', '');

// The same two spots #curl was measured on, for comparability: Sewers is the
// most plunging preset in the bank, Sharks the most spilling one that still has
// measured bathymetry behind it (so the depth-limited ceiling is real there).
const SPOTS = [
  { preset: 'sewers', cam: 'cliff' },
  { preset: 'sharks', cam: 'cliff' },
];
const TIMES = [36, 42, 48, 54];
const ALL_ARMS = {
  default: { name: 'default', hash: '' },
  legacy:  { name: 'legacy',  hash: '&drop=legacy' },
  curl:    { name: 'curl',    hash: '&curl=1' },
  legacycurl: { name: 'legacycurl', hash: '&drop=legacy&curl=1' },
};
const ARMS = flag('arms', 'default').split(',').map((a) => {
  if (!ALL_ARMS[a]) throw new Error(`unknown arm ${a}`);
  return ALL_ARMS[a];
});

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const median = (a) => {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y);
  return +s[Math.floor(s.length / 2)].toFixed(3);
};

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
      // about:blank between configs: #drop and #curl are boot-only, so a clean
      // load is the only way to be sure which build produced the numbers.
      await page.goto('about:blank');
      await page.goto(`${BASE}#${hash}`, { waitUntil: 'load' });
      await page.waitForTimeout(2600);
      const probe = await page.evaluate(() => {
        const pb = window.__pointbreak;
        if (!pb?.curlProbe) return { err: 'no curlProbe' };
        const line = pb.lineProbe(10) || [];
        const zAt = (x) => {
          if (!line.length) return -20;
          let best = line[0];
          for (const p of line) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
          return best.z;
        };
        const s0 = pb.state.stageStart, s1 = pb.state.stageEnd;
        const xs = [];
        // Finer than measure_curl's 0.05: the audit's claim is about ADJACENT
        // stations, so the spacing has to be small against the pocket bell
        // (sigma ~7.5 m in z, tens of metres along the line).
        for (let f = 0.06; f <= 0.95; f += 0.025) xs.push(Math.round(s0 + (s1 - s0) * f));
        const out = [];
        for (const x of xs) {
          const zc = zAt(x);
          const s = pb.curlProbe(x, zc - 70, zc + 30, 1024);
          const water = s.filter((p) => p.land < 0.5);
          if (!water.length) continue;
          let apex = water[0], pockMax = 0, aerMax = 0, curlMax = 0;
          for (const p of s) {
            if (p.pocket > pockMax) pockMax = p.pocket;
            if (p.aer > aerMax) aerMax = p.aer;
            if (p.curl > curlMax) curlMax = p.curl;
          }
          for (const p of water) if (p.y > apex.y) apex = p;
          out.push({ x, zBreak: +zc.toFixed(1),
                     crestY: +apex.y.toFixed(3), ceilM: +apex.ceil.toFixed(3),
                     depthM: +apex.depth.toFixed(3),
                     pocketAtApex: +apex.pocket.toFixed(3),
                     pocketMax: +pockMax.toFixed(3),
                     aerMax: +aerMax.toFixed(3), curlMax: +curlMax.toFixed(3) });
        }
        return { curl: pb.uniforms.u_curl.value, legacyDrop: pb.uniforms.u_legacyDrop?.value ?? null,
                 sim: pb.sim(), xi: +pb.state.xi.toFixed(2), H0: +pb.state.H0.toFixed(2),
                 stations: out };
      });
      if (probe.err) throw new Error(probe.err);
      if (probe.sim !== sim) throw new Error(`clock mismatch ${probe.sim} != ${sim}`);
      const wantCurl = arm.name.includes('curl') ? 1 : 0;
      if (probe.curl !== wantCurl) throw new Error(`curl uniform mismatch (${probe.curl})`);

      // "One station away": for each station, the tallest crest among stations
      // within +/-3 steps that are NOT in the pocket. Taken per (preset, sim)
      // because the neighbour has to be the SAME WAVE at the SAME clock.
      const st = probe.stations;
      for (let i = 0; i < st.length; i++) {
        let nbrY = 0, nbrCeil = 0;
        for (let j = Math.max(0, i - 3); j <= Math.min(st.length - 1, i + 3); j++) {
          if (j === i || st[j].pocketMax > 0.15) continue;
          if (st[j].crestY > nbrY) { nbrY = st[j].crestY; nbrCeil = st[j].ceilM; }
        }
        rows.push({ preset: spot.preset, xi: probe.xi, H0: probe.H0, arm: arm.name,
                    q: TIER, sim, ...st[i],
                    nbrY: +nbrY.toFixed(3), nbrCeil: +nbrCeil.toFixed(3),
                    fill: +(st[i].crestY / Math.max(st[i].ceilM, 1e-3)).toFixed(3) });
      }
      process.stdout.write(`${spot.preset} ${arm.name} sim=${sim} ok (${st.length} stations)\n`);
    }
  }
}

// SUMMARISE OVER THE POCKET, and separately over its neighbours. pocketMax >=
// 0.5 is the same gate the geometry uses to decide a breaking crest is here.
const summary = {};
for (const r of rows) {
  const k = `${r.preset}/${r.arm}`;
  summary[k] ??= { xi: r.xi, H0: r.H0, pocket: [], nbr: [], fillP: [], fillN: [],
                   ratio: [], ceil: [], nPocket: 0, nNbr: 0, overCeil: 0 };
  const s = summary[k];
  if (r.pocketMax >= 0.5) {
    s.nPocket++;
    s.pocket.push(r.crestY); s.fillP.push(r.fill); s.ceil.push(r.ceilM);
    if (r.nbrY > 0) s.ratio.push(r.crestY / r.nbrY);
    if (r.fill > 1.0) s.overCeil++;
  } else if (r.pocketMax < 0.15) {
    s.nNbr++;
    s.nbr.push(r.crestY); s.fillN.push(r.fill);
  }
}
const table = {};
for (const [k, s] of Object.entries(summary)) {
  table[k] = {
    xi: s.xi, H0: s.H0, nPocket: s.nPocket, nNbr: s.nNbr,
    medPocketCrestM: median(s.pocket),
    medNbrCrestM: median(s.nbr),
    medCeilM: median(s.ceil),
    medFillPocket: median(s.fillP),     // crest / depth-limited ceiling, pocket
    medFillNbr: median(s.fillN),        // ... away from the pocket
    medPocketOverNbr: median(s.ratio),  // the audit's headline ratio
    stationsOverCeiling: s.overCeil,
  };
}

writeFileSync(resolve(OUT, `pocket_crest${TAG ? `_${TAG}` : ''}_q${TIER}.json`),
  JSON.stringify({ port: PORT, tier: TIER, arms: ARMS.map((a) => a.name),
                   errors, table, rows }, null, 2));
console.log(`\nq=${TIER}   (fill = crest / depth-limited ceiling)`);
for (const [k, t] of Object.entries(table)) {
  console.log(`${k.padEnd(20)} xi=${t.xi}  pocket crest ${t.medPocketCrestM} m  ` +
              `neighbour ${t.medNbrCrestM} m  ceiling ${t.medCeilM} m\n` +
              `${''.padEnd(20)} fill pocket ${t.medFillPocket} vs away ${t.medFillNbr}  ` +
              `pocket/neighbour ${t.medPocketOverNbr}  ` +
              `over ceiling ${t.stationsOverCeiling}/${t.nPocket}`);
}
if (errors.length) console.error('PAGE ERRORS:', errors.slice(0, 5));
await browser.close();
