// Track 1c: judge the FLAG ENSEMBLE, not flags alone.
//
// The spec's acceptance triple (WEB_THREE_SPEC "What M5 needs"): A-frames at 0
// (Sewers exempt — its A-frame is canon-true, decided 2026-08-11), right branch
// above 1.5 crests, and derived alpha within tolerance of target — all three at
// once. Plus the TODO's swing criterion: alpha moves < ~5 deg for +/-0.3 m H0.
//
// Every prior measurement scored one flag against default. Each flag fixes a
// different section-4.5 defect and each fails alone; the candidate shipping
// default is a combination. This instrument runs the matrix: baseline, each
// flag alone, the full ensemble, and leave-one-out of the full ensemble —
// one fresh headless page per (spot, config), which also sidesteps the bed.js
// cache caveat that nose settings are not in the bake cache keys.
//
//   node scripts/measure_ensemble.mjs [--json] [--skip-swing]
//
// Reads: takeoffProfile(1) (takeoff frac + crests per branch) and lineProbe()
// alpha at the station nearest x = 0 — the same HUD instrument the nose
// re-measure used (spec, "The nose, re-measured").

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
const PORT = 8191;
const JSON_OUT = process.argv.includes('--json');
const SKIP_SWING = process.argv.includes('--skip-swing');

const PRESETS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks'];
const FLAGS = ['psi', 'smooth', 'peeldir', 'nose'];
const EDGE = 0.08;        // takeoff within 8% of a stage end = "at the edge"
const ALPHA_TOL = 5;      // deg — target tolerance for the triple criterion
const SWING_TOL = 5;      // deg — max alpha excursion across H0 +/- 0.3 m
const H0_SWING = 0.3;     // m

// The matrix. Order matters only for reading the report.
const CONFIGS = [
  { name: 'base', flags: [] },
  ...FLAGS.map((f) => ({ name: f, flags: [f] })),
  { name: 'full', flags: [...FLAGS] },
  ...FLAGS.map((f) => ({ name: `full-${f}`, flags: FLAGS.filter((g) => g !== f) })),
];

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

async function measure(page, preset, flags, h0) {
  let url = `http://localhost:${PORT}/web-three/#preset=${preset}&sim=42&hud=0`;
  for (const f of flags) url += `&${f}=1`;
  if (h0 !== undefined) url += `&h0=${h0}`;
  await page.goto(url, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1800);
  const r = await page.evaluate(() => {
    const pb = window.__pointbreak;
    if (!pb) return null;
    const prof = pb.takeoffProfile(1);
    const line = pb.lineProbe(2);
    let alpha0 = null;
    if (line && line.length) {
      let best = line[0];
      for (const s of line) if (Math.abs(s.x) < Math.abs(best.x)) best = s;
      alpha0 = best.a;
    }
    return { preset: pb.state.preset, target: pb.state.alpha, H0: pb.state.H0,
             alpha0, prof };
  });
  if (!r || r.preset !== preset) throw new Error(`preset did not apply: ${r && r.preset}`);
  return r;
}

// A-frame per the takeoff instrument: interior minimum with a whole crest on
// the left. Sewers is exempt (canon-true A-frame).
function judge(preset, target, alpha0, prof) {
  const interior = prof.frac > EDGE && prof.frac < 1 - EDGE;
  const aframe = interior && prof.leftCrests >= 1;
  return {
    aframeOK: preset === 'sewers' ? true : !aframe,
    aframe,
    rightOK: prof.rightCrests >= 1.5,
    alphaOK: alpha0 !== null && Math.abs(alpha0 - target) <= ALPHA_TOL,
    dAlpha: alpha0 === null ? null : alpha0 - target,
  };
}

const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// ---- Phase 1: the matrix at each spot's own default H0 ----
const matrix = [];
for (const cfg of CONFIGS) {
  for (const preset of PRESETS) {
    const r = await measure(page, preset, cfg.flags);
    const j = judge(preset, r.target, r.alpha0, r.prof);
    matrix.push({ config: cfg.name, preset, target: r.target, H0: r.H0,
                  alpha0: r.alpha0, frac: r.prof.frac,
                  leftCrests: r.prof.leftCrests, rightCrests: r.prof.rightCrests,
                  ...j });
    if (!JSON_OUT) process.stderr.write('.');
  }
  if (!JSON_OUT) process.stderr.write(` ${cfg.name}\n`);
}

// Score each config: spots passing all three criteria at once.
const scores = CONFIGS.map((cfg) => {
  const rows = matrix.filter((m) => m.config === cfg.name);
  const pass = rows.filter((m) => m.aframeOK && m.rightOK && m.alphaOK);
  const meanAbsDA = rows.reduce((s, m) => s + Math.abs(m.dAlpha ?? 99), 0) / rows.length;
  const spuriousAframes = rows.filter((m) => m.preset !== 'sewers' && m.aframe).length;
  return { config: cfg.name, pass: pass.length, of: rows.length,
           spuriousAframes, meanAbsDA };
});

// ---- Phase 2: H0 swing on baseline and the full ensemble ----
// (the acceptance's second clause: alpha HUD swing < ~5 deg for +/-0.3 m H0)
const swing = [];
if (!SKIP_SWING) {
  for (const cfgName of ['base', 'full']) {
    const cfg = CONFIGS.find((c) => c.name === cfgName);
    for (const preset of PRESETS) {
      const mid = matrix.find((m) => m.config === cfgName && m.preset === preset);
      const alphas = [mid.alpha0];
      for (const dh of [-H0_SWING, +H0_SWING]) {
        const r = await measure(page, preset, cfg.flags, +(mid.H0 + dh).toFixed(2));
        alphas.push(r.alpha0);
        if (!JSON_OUT) process.stderr.write('.');
      }
      const valid = alphas.filter((a) => a !== null);
      const sw = valid.length ? Math.max(...valid) - Math.min(...valid) : null;
      swing.push({ config: cfgName, preset, H0: mid.H0, alphas, swing: sw,
                   swingOK: sw !== null && sw < SWING_TOL });
    }
    if (!JSON_OUT) process.stderr.write(` swing:${cfgName}\n`);
  }
}

await browser.close();
server.close();

if (JSON_OUT) {
  console.log(JSON.stringify({ matrix, scores, swing }, null, 2));
} else {
  console.log('\n== Track 1c ensemble matrix ==');
  console.log('pass = A-frame OK (Sewers exempt) AND right crests >= 1.5 AND |dAlpha| <= 5, all at once\n');
  console.log('config        pass  spurious-Aframes  mean|dAlpha|');
  for (const s of scores)
    console.log(`${s.config.padEnd(13)} ${String(s.pass).padStart(2)}/${s.of}   ${String(s.spuriousAframes).padStart(6)}            ${s.meanAbsDA.toFixed(1).padStart(5)}`);

  console.log('\nper-spot detail (config | spot | alpha derived/target | takeoff frac | L/R crests | verdicts)');
  for (const cfg of CONFIGS) {
    console.log(`\n-- ${cfg.name} --`);
    for (const m of matrix.filter((x) => x.config === cfg.name)) {
      const v = [m.aframeOK ? '' : 'A-FRAME', m.rightOK ? '' : 'short-right',
                 m.alphaOK ? '' : `dA=${m.dAlpha === null ? '?' : m.dAlpha.toFixed(1)}`]
                .filter(Boolean).join(' ') || 'PASS';
      console.log(`${m.preset.padEnd(11)} a ${String(m.alpha0 === null ? '?' : m.alpha0.toFixed(1)).padStart(5)}/${String(m.target).padEnd(3)} frac ${m.frac.toFixed(2)}  L ${m.leftCrests.toFixed(2)} R ${m.rightCrests.toFixed(2)}  ${v}`);
    }
  }

  if (swing.length) {
    console.log('\n== H0 swing (alpha excursion across H0 -0.3 / default / +0.3) ==');
    for (const s of swing)
      console.log(`${s.config.padEnd(6)} ${s.preset.padEnd(11)} H0 ${s.H0}  alphas [${s.alphas.map((a) => a === null ? '?' : a.toFixed(1)).join(', ')}]  swing ${s.swing === null ? '?' : s.swing.toFixed(1)}  ${s.swingOK ? 'ok' : 'FAIL'}`);
  }
}
if (errors.length) console.error('\nCONSOLE ERRORS:\n' + [...new Set(errors)].join('\n'));
