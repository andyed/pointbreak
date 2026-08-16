// Track 1c'-b, diagnosis: WHAT is the alpha swing across H0?
//
// The ensemble judgement recorded a 10.5-56.9 deg derived-alpha swing across
// H0 +/- 0.3 m (Sharks 48.5 -> 3.2 -> 60.0). Three candidate causes, which want
// three different fixes, and a coarse three-point sweep of one station cannot
// tell them apart:
//
//   A. BRANCH FLIP. markBreakCrossings' crossing SET changes with H0, so the
//      branch-following anchor picks a different branch and the whole line
//      moves at once. Fix belongs in the selection step (seed the branch from
//      the previous bake), per MEASUREMENT_LESSONS 8.
//   B. SMOOTH MIGRATION. The locus really does slide ~200 m across the H0
//      range (SIZE_AUDIT), alpha follows continuously, and there is nothing to
//      repair — the swing is the model being honest.
//   C. DIAGNOSTIC ARTIFACT. The LINE is stable and only derivedAlphaDeg(x=0),
//      a 3-texel local slope at one station, is unlucky. Then the acceptance
//      criterion is measuring the wrong thing and the fix is the instrument.
//
// So this sweeps H0 finely and reports the LOCUS, not just the station:
//
//   a0        derived alpha at x = 0 (the HUD/acceptance instrument)
//   aMed      median derivedAlphaDeg over all stations (line-wide, robust)
//   dzMax     max |z(H0) - z(H0_prev)| over the stage, in metres
//   dzMean    mean |z(H0) - z(H0_prev)|
//   xJump     x where dzMax occurs
//   frac>5m   fraction of stations that moved more than 5 m this step
//
// A branch flip is a large dzMax over a CONTIGUOUS run of stations for a
// small step in H0. Smooth migration is a small dzMax at every step. A
// diagnostic artifact is a0 jumping while aMed and dzMax stay flat.
//
//   node scripts/measure_h0_swing.mjs [--spots=sharks,jacks] [--json]

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
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
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8193;
const JSON_OUT = process.argv.includes('--json');
const spotsArg = process.argv.find((a) => a.startsWith('--spots='));
// Default set: the two worst swings (sharks 56.9, secondpeak 39.4), the
// middling one (jacks 22.3) and a passing control (sewers 0.5).
const PRESETS = spotsArg ? spotsArg.slice(8).split(',')
                         : ['sharks', 'secondpeak', 'jacks', 'sewers'];
// The acceptance band is H0 +/- 0.3 m about each spot's default. 0.05 m steps
// resolve a flip to a 0.05 m window; 13 points per spot.
const DH = 0.05, SPAN = 0.3;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const median = (a) => {
  const s = [...a].sort((p, q) => p - q);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

const extraArg = process.argv.find((a) => a.startsWith('--extra='));
const EXTRA = extraArg ? '&' + extraArg.slice(8) : '';   // e.g. --extra=anchorband=0

async function probe(preset, h0) {
  const url = `http://localhost:${PORT}/web-three/#preset=${preset}&sim=42&hud=0&month=card`
            + (h0 === null ? '' : `&h0=${h0.toFixed(2)}`) + EXTRA;
  await page.goto(url, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1600);
  return page.evaluate(() => {
    const pb = window.__pointbreak;
    if (!pb) return null;
    // STAGE-RESTRICTED. The bake spans ~600 m; the rideable stage is 113-312 m
    // of it. A median over the whole bake is dominated by flank stations that
    // are flat and stable whatever the wave does, which would make "line-wide
    // alpha is stable" true and vacuous (MEASUREMENT_LESSONS 2 — prove the
    // probe). aMed below is the median over the STAGE only.
    const t = pb.takeoffProfile(1);
    const line = pb.lineProbe(2).filter((p) => p.x >= t.xLo && p.x <= t.xHi);
    return { preset: pb.state.preset, H0: pb.state.H0, target: pb.state.alpha, line };
  });
}

const out = [];
for (const preset of PRESETS) {
  const base = await probe(preset, null);
  if (!base || base.preset !== preset) throw new Error(`preset did not apply: ${preset}`);
  const h0s = [];
  for (let h = base.H0 - SPAN; h <= base.H0 + SPAN + 1e-9; h += DH) h0s.push(+h.toFixed(2));

  let prev = null;
  const rows = [];
  for (const h0 of h0s) {
    const r = await probe(preset, h0);
    const zs = r.line.map((p) => p.z);
    const as = r.line.map((p) => p.a);
    let a0 = null, best = Infinity;
    for (const p of r.line) if (Math.abs(p.x) < best) { best = Math.abs(p.x); a0 = p.a; }
    let dzMax = null, dzMean = null, xJump = null, fracBig = null;
    if (prev && prev.length === zs.length) {
      const d = zs.map((z, i) => Math.abs(z - prev[i]));
      dzMax = Math.max(...d);
      dzMean = d.reduce((s, v) => s + v, 0) / d.length;
      xJump = r.line[d.indexOf(dzMax)].x;
      fracBig = d.filter((v) => v > 5).length / d.length;
    }
    rows.push({ h0, a0, aMed: median(as), dzMax, dzMean, xJump, fracBig });
    prev = zs;
    if (!JSON_OUT) process.stderr.write('.');
  }
  const a0s = rows.map((r) => r.a0).filter((v) => v !== null);
  const aMeds = rows.map((r) => r.aMed).filter((v) => v !== null);
  out.push({
    preset, target: base.target, baseH0: base.H0, rows,
    a0Swing: Math.max(...a0s) - Math.min(...a0s),
    aMedSwing: Math.max(...aMeds) - Math.min(...aMeds),
    maxStepDz: Math.max(...rows.map((r) => r.dzMax ?? 0)),
  });
  if (!JSON_OUT) process.stderr.write(` ${preset}\n`);
}

await browser.close();
server.close();

if (JSON_OUT) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log('\n== H0 swing diagnosis (locus, not just the station) ==');
  console.log('dz* = change in the baked break line vs the PREVIOUS H0 step, metres\n');
  for (const s of out) {
    console.log(`-- ${s.preset} (target ${s.target}, default H0 ${s.baseH0}) --`);
    console.log(`   a0 swing ${s.a0Swing.toFixed(1)}   aMed swing ${s.aMedSwing.toFixed(1)}   max single-step locus move ${s.maxStepDz.toFixed(1)} m`);
    console.log('   H0     a(x=0)  aMed   dzMax   dzMean   xJump   frac>5m');
    for (const r of s.rows) {
      console.log(`   ${r.h0.toFixed(2)}  ${String(r.a0 === null ? '?' : r.a0.toFixed(1)).padStart(6)}  ${String(r.aMed === null ? '?' : r.aMed.toFixed(1)).padStart(5)}  `
        + `${String(r.dzMax === null ? '-' : r.dzMax.toFixed(1)).padStart(6)}  ${String(r.dzMean === null ? '-' : r.dzMean.toFixed(1)).padStart(6)}  `
        + `${String(r.xJump === null ? '-' : r.xJump.toFixed(0)).padStart(6)}  ${r.fracBig === null ? '-' : (r.fracBig * 100).toFixed(0) + '%'}`);
    }
    console.log('');
  }
}
if (errors.length) console.error('CONSOLE ERRORS:\n' + [...new Set(errors)].join('\n'));
