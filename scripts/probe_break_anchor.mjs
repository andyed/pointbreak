// TRACK 1c'-d, cause: WHICH of the three candidate mechanisms drives the
// low-H0 break-line branch flips (see scripts/measure_branch_flip.mjs for the
// map of WHERE they are).
//
//   (i)   PHYSICS   — the criterion H0*Ks >= gamma*h is genuinely bistable
//                     over this bathymetry and a crossing appears/vanishes;
//   (ii)  SELECTION — the crossing set is unchanged and only
//                     nearest-to-previous (or the 3.0 m/m slew clamp) moves;
//   (iii) ANCHOR    — the set is unchanged everywhere, but the seed station's
//                     nearest-to-wedge-crest pick swaps and continuity carries
//                     that swap down the whole line.
//
// These want three different fixes and the baked z cannot tell them apart, so
// this reads `__pointbreak.crossProbe()` — bed.js's own march, not a twin —
// across an H0 ladder and reports, per step:
//
//   nAnchor   how many crossings exist AT the anchor station
//   anchorSet the anchor's crossing z's (the candidate set)
//   pick      which one nearest-to-crest took
//   zc        the wedge-crest reference it ranked against
//   setSame   did the anchor's candidate SET survive this step (all members
//             matched within SET_TOL m, same count)?
//   pickJump  |pick(H0) - pick(H0_prev)|
//   nMean     mean crossings per stage station
//   nHist     distribution of crossing counts over stage stations
//
// The verdict rule, stated before the numbers (so it cannot be fitted to
// them): if `setSame` is TRUE across a step where the baked line jumps, the
// crossings did not move and the flip is (ii)/(iii) — a selection defect. If
// `setSame` is FALSE because the count changed, a branch was born or died and
// the flip is (i) — physics, and no selection rule can smooth it without
// inventing a crossing the criterion does not have.
//
// Usage:
//   node scripts/probe_break_anchor.mjs --preset=firstpeak --lo=1.20 --hi=1.32 --step=0.005 \
//        [--out=file.json] [--base=http://localhost:8223/web-three/]
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
const PRESETS = (flags.preset || 'firstpeak').split(',');
const LO = Number(flags.lo ?? 0.4), HI = Number(flags.hi ?? 3.0), STEP = Number(flags.step ?? 0.01);
const OUT = flags.out || null;

function probeFn() {
  const pb = window.__pointbreak;
  const cp = pb.crossProbe ? pb.crossProbe(window.__stride || 4) : null;
  const sa = pb.stageAlpha ? pb.stageAlpha(2) : null;
  const line = pb.lineProbe(1) || [];
  if (!cp || !sa) return { ok: false };
  const st = cp.stations.filter((s) => s.x >= sa.stageLo && s.x <= sa.stageHi);
  const hist = {};
  let tot = 0;
  for (const s of st) { const n = s.crossings.length; hist[n] = (hist[n] || 0) + 1; tot += n; }
  const stage = line.filter((p) => p.x >= sa.stageLo && p.x <= sa.stageHi);
  return {
    ok: true, H0: pb.state.H0,
    anchorX: cp.anchorX, anchorZc: cp.anchorZc,
    anchorSet: cp.anchorCrossings.map((z) => Math.round(z * 100) / 100),
    pick: Math.round(cp.anchorPick * 100) / 100,
    nMean: st.length ? tot / st.length : 0, nHist: hist, nStage: st.length,
    aStage: sa.medianClean, pinned: sa.pinnedN,
    stageLo: sa.stageLo, stageHi: sa.stageHi,
    // per-station candidate sets over the stage, so "the set changed" can be
    // located rather than only counted at the anchor
    sets: st.map((s) => ({ x: s.x, c: s.crossings.map((z) => Math.round(z * 100) / 100) })),
    // ALL stations (not stage-clipped): derivedAlphaDeg's stencil reaches
    // +/-3 texels, so a counterfactual alpha computed on the stage alone would
    // be short its stencil at both ends.
    all: cp.stations.map((s) => ({ x: s.x, c: s.crossings.map((z) => Math.round(z * 100) / 100), f: Math.round(s.fallback * 100) / 100 })),
    zs: stage.map((p) => Math.round(p.z * 100) / 100),
    xs: stage.map((p) => p.x),
    stride: window.__stride || 4,
  };
}
const PROBE_SRC = probeFn.toString();

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.error('PAGEERR', e.message));

const ladder = [];
for (let h = LO; h <= HI + 1e-9; h += STEP) ladder.push(Math.round(h * 10000) / 10000);

const result = { base: BASE, lo: LO, hi: HI, step: STEP, presets: {} };
for (const preset of PRESETS) {
  // fresh document per preset: control params are applied live on a hash
  // change and are not reset by a hash that omits them (see
  // scripts/audit_shipped_states.mjs for the measured version of that leak).
  await page.goto(`${BASE}?r=${preset}#preset=${preset}&controls=0&speed=0`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  await page.evaluate((s) => { window.__stride = s; }, Number(flags.stride || 4));
  const rows = [];
  for (const h0 of ladder) {
    const r = await page.evaluate(async ({ h, src }) => {
      window.__pointbreak.state.H0 = h;
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      return (0, eval)(`(${src})`)();
    }, { h: h0, src: PROBE_SRC }).catch((e) => ({ ok: false, err: String(e) }));
    rows.push(r);
  }
  result.presets[preset] = { rows };
  process.stderr.write(`${preset}: ${rows.length} steps\n`);
}
await browser.close();
if (OUT) { writeFileSync(OUT, JSON.stringify(result)); process.stderr.write(`wrote ${OUT}\n`); }
else console.log(JSON.stringify(result));
