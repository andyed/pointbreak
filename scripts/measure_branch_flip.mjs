// TRACK 1c'-d: map the low-H0 break-line BRANCH FLIPS across the whole bank.
//
// Four separate investigations recorded the same shape of defect at four
// different spots — a discontinuous jump in the baked break line at one
// spot-specific low H0 (Sharks 102.8 m at 0.85; Jack's 151.7 m at 0.90;
// Second Peak somewhere in 1.00-1.10; First Peak alpha 1.4 -> 43.7 across
// 1.25 -> 1.26). This instrument tests whether they are ONE mechanism by
// sweeping every preset over the full clamped H0 range on one common ladder.
//
// WHY THIS DOES NOT RELOAD PER STEP. bakeBreakLine is cached on a key that
// contains H0, and main.js re-bakes inside the frame loop, so writing
// `__pointbreak.state.H0` and waiting a frame produces the SHIPPED bake for
// that H0 — the same code path a `#h0=` reload takes, minus 2.5 s of page
// boot. Proven per run: --verify reloads a handful of steps and diffs the
// baked z against the in-page mutation (reported as `verifyMaxDz`).
//
// The sweep is stateless by construction (the cache key carries H0), so it is
// ALSO the hysteresis test: sweeping up and sweeping down must produce
// identical lines at identical H0. Any difference is a latch, and a latch
// matters because #drift and #day=live walk H0 continuously.
//
// Reported per step, all restricted to the STAGE (MEASUREMENT_LESSONS 8c —
// the bake spans ~600 m and its flat flanks make a whole-bake median vacuous):
//
//   aStage   stageAlpha().medianClean, the acceptance instrument
//   aMedian  stageAlpha().median (all stations, incl. limiter-pinned)
//   pinned   how many stage stations ride the 3.0 m/m slew clamp
//   dzMax    max |z(H0) - z(H0_prev)| over stage stations, metres
//   dzMed    median |dz| over stage stations
//   fracMove fraction of stage stations that moved > 5 m this step
//   nCross   mean number of criterion crossings per stage station
//   crestOffset  median |z_line - z_wedgeCrest| (diagnostic, 1c'-c.3)
//
// The anchor/candidate decomposition that CONVICTS the mechanism lives in the
// companion probe `scripts/probe_break_anchor.mjs`, which re-runs bed.js's own
// crossing march in the page and reports the candidate set and the pick.
//
// Usage:
//   node scripts/measure_branch_flip.mjs --preset=firstpeak --lo=0.4 --hi=3.0 --step=0.01 \
//        [--dir=up|down] [--out=file.json] [--base=http://localhost:8223/web-three/] [--verify]
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PW = [];
for (let dir = ROOT; ; dir = dirname(dir)) {
  PW.push(join(dir, 'node_modules/playwright/index.mjs'));
  PW.push(join(dir, 'psychodeli-webgl-port/node_modules/playwright/index.mjs'));
  if (dirname(dir) === dir) break;
}
let chromium;
for (const c of PW) { try { ({ chromium } = await import(c)); break; } catch { /* next */ } }
if (!chromium) { console.error('no playwright'); process.exit(1); }

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--'))
  .map((a) => { const t = a.replace(/^--/, ''); const i = t.indexOf('='); return i < 0 ? [t, '1'] : [t.slice(0, i), t.slice(i + 1)]; }));
const BASE = flags.base || 'http://localhost:8223/web-three/';
const PRESETS = (flags.preset || 'sewers,firstpeak,secondpeak,jacks,thehook,sharks,privates').split(',');
const LO = Number(flags.lo ?? 0.4), HI = Number(flags.hi ?? 3.0), STEP = Number(flags.step ?? 0.01);
const DIR = flags.dir || 'up';
const OUT = flags.out || null;
const EXTRA = flags.extra ? `&${flags.extra}` : '';

// The per-step probe. Runs IN PAGE. Returns everything the flip analysis needs
// from one bake, so a 260-step ladder is 260 evaluate() calls, not 260 loads.
function probeFn() {
  const pb = window.__pointbreak;
  const sa = pb.stageAlpha ? pb.stageAlpha(2) : null;
  const line = pb.lineProbe(2) || [];
  if (!sa || !line.length) return { ok: false };
  const stage = line.filter((p) => p.x >= sa.stageLo && p.x <= sa.stageHi);
  const co = pb.crestOffset ? pb.crestOffset(4) : null;
  return {
    ok: true,
    H0: pb.state.H0, T: pb.state.T, tide: pb.state.tide || 0,
    stageLo: sa.stageLo, stageHi: sa.stageHi,
    aStage: sa.medianClean, aMedian: sa.median, pinned: sa.pinnedN,
    inFit: sa.inFit, outFit: sa.outFit, stations: sa.stations,
    crestOffset: co ? co.median : null,
    merge: pb.onsetMerge ? pb.onsetMerge() : null,
    zs: stage.map((p) => Math.round(p.z * 1000) / 1000),
    xs: stage.map((p) => p.x),
    as: stage.map((p) => Math.round(p.a * 100) / 100),
    gaps: stage.map((p) => p.gap ? 1 : 0),
  };
}

const PROBE_SRC = probeFn.toString();

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.error('PAGEERR', e.message));

const ladder = [];
for (let h = LO; h <= HI + 1e-9; h += STEP) ladder.push(Math.round(h * 1000) / 1000);
if (DIR === 'down') ladder.reverse();

const result = { base: BASE, dir: DIR, lo: LO, hi: HI, step: STEP, presets: {} };

for (const preset of PRESETS) {
  await page.goto(`${BASE}#preset=${preset}&controls=0&speed=0${EXTRA}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const card = await page.evaluate(() => ({ H0: window.__pointbreak.state.H0, T: window.__pointbreak.state.T }));
  const rows = [];
  for (const h0 of ladder) {
    const r = await page.evaluate(async ({ h, src }) => {
      window.__pointbreak.state.H0 = h;
      // two frames: one to re-bake under the new key, one so lastBaked is it
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      return (0, eval)(`(${src})`)();
    }, { h: h0, src: PROBE_SRC }).catch((e) => ({ ok: false, err: String(e) }));
    rows.push(r);
  }
  result.presets[preset] = { card, rows };
  process.stderr.write(`${preset}: ${rows.length} steps\n`);
}

// --verify: reload a few steps the honest way and diff the baked z.
if (flags.verify) {
  const checks = [];
  for (const preset of PRESETS) {
    const rows = result.presets[preset].rows.filter((r) => r.ok);
    if (!rows.length) continue;
    for (const pick of [0, Math.floor(rows.length / 2), rows.length - 1]) {
      const r = rows[pick];
      await page.goto(`${BASE}#preset=${preset}&h0=${r.H0}&controls=0&speed=0${EXTRA}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      const fresh = await page.evaluate((src) => (0, eval)(`(${src})`)(), PROBE_SRC);
      let maxDz = 0;
      if (fresh.ok && fresh.zs.length === r.zs.length)
        for (let i = 0; i < r.zs.length; i++) maxDz = Math.max(maxDz, Math.abs(fresh.zs[i] - r.zs[i]));
      else maxDz = NaN;
      checks.push({ preset, H0: r.H0, maxDz, aFresh: fresh.aStage, aMut: r.aStage });
    }
  }
  result.verify = checks;
  const worst = checks.reduce((m, c) => Math.max(m, Number.isFinite(c.maxDz) ? c.maxDz : Infinity), 0);
  process.stderr.write(`verifyMaxDz = ${worst}\n`);
}

await browser.close();
if (OUT) { writeFileSync(OUT, JSON.stringify(result)); process.stderr.write(`wrote ${OUT}\n`); }
else console.log(JSON.stringify(result));
