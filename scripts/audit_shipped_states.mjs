// TRACK 1c'-d, shipped impact: which states a reader can actually REACH land
// on the collapsed side of the low-H0 break-line branch flip?
//
// The flip map (scripts/measure_branch_flip.mjs) says every mapped spot has a
// spot-specific H0 below which the baked line abandons the reef branch. That
// is only a defect if a shipped state sits below it, so this enumerates the
// reachable ocean states and measures the LINE at each:
//
//   * the CARD state (bare `#preset=`) — each spot's authored H0/T/tide
//   * all twelve `#month=` values (climatological p75 H0, preset T and tide)
//   * every `#day=` in conditions.js (H0 AND T AND tide all move)
//
// Each is loaded THE WAY A READER LOADS IT — a real hash, a real boot — not by
// poking state.H0, because `day` moves T and tide too and the flip threshold is
// a function of all three. (measure_branch_flip's in-page mutation is the right
// tool for an H0-only ladder and is proven bit-identical there; it would be the
// wrong tool here.)
//
// Reported per state: stageAlpha().medianClean against the preset's alpha
// target, the pinned-station count, the section-gap fraction over the stage,
// and the line's z range over the stage. A collapsed peel reads as alpha near
// zero with a nearly flat z — the line has become a crest line, so the whole
// stage breaks at once.
//
// Usage: node scripts/audit_shipped_states.mjs [--out=file.json] [--base=...]
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
const OUT = flags.out || null;
const PRESETS = (flags.preset || 'sewers,firstpeak,secondpeak,jacks,thehook,sharks,privates').split(',');
const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june',
                'july', 'august', 'september', 'october', 'november', 'december'];
const DAYS = ['small', 'modelcard', 'pulse', 'overhead', 'big', 'stormy'];

function probeFn() {
  const pb = window.__pointbreak;
  const sa = pb.stageAlpha ? pb.stageAlpha(2) : null;
  const line = pb.lineProbe(2) || [];
  const st = pb.state;
  const base = { H0: st.H0, T: st.T, tide: st.tide || 0, alphaTarget: st.alpha, preset: st.preset };
  if (!sa || !line.length) return { ok: true, baked: false, ...base };
  const stage = line.filter((p) => p.x >= sa.stageLo && p.x <= sa.stageHi);
  const zs = stage.map((p) => p.z);
  return {
    ok: true, baked: true, ...base,
    aStage: sa.medianClean, aMedian: sa.median, pinned: sa.pinnedN, stations: sa.stations,
    gapFrac: stage.filter((p) => p.gap).length / stage.length,
    zMin: Math.min(...zs), zMax: Math.max(...zs),
    stageLo: sa.stageLo, stageHi: sa.stageHi,
    crestOffset: pb.crestOffset ? (pb.crestOffset(4) || {}).median ?? null : null,
  };
}
const PROBE_SRC = probeFn.toString();

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=metal', '--enable-webgl', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => console.error('PAGEERR', e.message));

const rows = [];
let seq = 0;
for (const preset of PRESETS) {
  const states = [['card', `preset=${preset}`],
                  ...MONTHS.map((m) => [`month=${m}`, `preset=${preset}&month=${m}`]),
                  ...DAYS.map((d) => [`day=${d}`, `preset=${preset}&day=${d}`])];
  for (const [label, hash] of states) {
    // FRESH DOCUMENT PER STATE, and the cache-busting query is what makes it
    // fresh. Control params (tide, H0, T ...) are applied LIVE on a hash change
    // and are NOT reset by a hash that omits them — so walking `#day=stormy`
    // (tide +0.6) into a bare `#preset=firstpeak` leaves the next site sitting
    // at +0.6 m of tide while its card says 0. Measured, and it silently moved
    // every state after the first `day=` in the first draft of this audit: five
    // of seven presets reported their CARD at tide 0.6. Same class as
    // MEASUREMENT_LESSONS 2 — the probe has to be proven, and here the probe's
    // own navigation was the leak. `?r=` forces a new document, so every state
    // boots from the preset's own defaults.
    seq++;
    await page.goto(`${BASE}?r=${seq}#${hash}&controls=0&speed=0`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2200);
    const r = await page.evaluate((src) => (0, eval)(`(${src})`)(), PROBE_SRC)
      .catch((e) => ({ ok: false, err: String(e) }));
    rows.push({ preset, label, hash, ...r });
  }
  process.stderr.write(`${preset} done\n`);
}
await browser.close();
if (OUT) { writeFileSync(OUT, JSON.stringify({ base: BASE, rows })); process.stderr.write(`wrote ${OUT}\n`); }
else console.log(JSON.stringify({ base: BASE, rows }));
