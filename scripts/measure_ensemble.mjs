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
// Reads: takeoffProfile(1) (takeoff frac + crests per branch) and BOTH alpha
// instruments — stageAlpha().median, which is the acceptance instrument since
// 2026-08-13 (TODO 1c'-c.1), and lineProbe()'s alpha at the station nearest
// x = 0, retained as a reported diagnostic ONLY. The verdicts below judge on
// the stage median. alpha-at-x=0 samples the same neighbourhood the reef fit
// is tuned at (xs = [-16..16]), so it certifies the fit rather than the wave —
// it is the reason the pre-2026-08-13 runs of this script read "alpha on
// target 4/6" while the stage medians were 11-17 deg off.
//
// FLAG STATE IS ALWAYS EXPLICIT (fixed 2026-08-13). Every config writes
// `<flag>=1` or `<flag>=0` for ALL FOUR flags, never relying on a default.
// Before this, configs only appended the flags they wanted ON — which broke
// silently the moment #psi's default flipped to ON (M6p3 step 4): `base`
// quietly became psi-on, the `psi` row became a duplicate of it, and
// `full-psi` stopped removing psi at all, so the leave-one-out row that
// should isolate psi's contribution was measuring the full ensemble twice.
// All four flags accept an explicit 0 (main.js applyHashParams; nose=0 goes
// through parseFloat and sets the taper fraction to zero).

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

// The flag set the app actually ships, so the report can mark it. Since
// M6p3 step 4 the shipped default is psi ON and the other three OFF — which
// means `base` (everything off) is no longer "what a user sees", and the row
// matching SHIPPED_FLAGS is. Keep this in sync with main.js's initialisers.
const SHIPPED_FLAGS = ['psi'];
const sameSet = (a, b) => a.length === b.length && a.every((f) => b.includes(f));

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
  // Explicit state for EVERY flag — see the header note. A config's `flags`
  // list is the set that should be ON; everything else is forced OFF.
  for (const f of FLAGS) url += `&${f}=${flags.includes(f) ? 1 : 0}`;
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
    const sa = pb.stageAlpha();
    return { preset: pb.state.preset, target: pb.state.alpha, H0: pb.state.H0,
             stageAlpha: sa ? sa.median : null, alpha0, prof };
  });
  if (!r || r.preset !== preset) throw new Error(`preset did not apply: ${r && r.preset}`);
  return r;
}

// A-frame per the takeoff instrument: interior minimum with a whole crest on
// the left. Sewers is exempt (canon-true A-frame).
// Judged on the STAGE MEDIAN (the acceptance instrument). dAlpha0 is carried
// alongside as a diagnostic so a reader can see the fit-vs-wave gap directly,
// but it decides nothing.
function judge(preset, target, stageAlpha, alpha0, prof) {
  const interior = prof.frac > EDGE && prof.frac < 1 - EDGE;
  const aframe = interior && prof.leftCrests >= 1;
  return {
    aframeOK: preset === 'sewers' ? true : !aframe,
    aframe,
    rightOK: prof.rightCrests >= 1.5,
    alphaOK: stageAlpha !== null && Math.abs(stageAlpha - target) <= ALPHA_TOL,
    dAlpha: stageAlpha === null ? null : stageAlpha - target,
    dAlpha0: alpha0 === null ? null : alpha0 - target,
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
    const j = judge(preset, r.target, r.stageAlpha, r.alpha0, r.prof);
    matrix.push({ config: cfg.name, preset, target: r.target, H0: r.H0,
                  stageAlpha: r.stageAlpha, alpha0: r.alpha0, frac: r.prof.frac,
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
      // Swing on the stage median too: measured 2026-08-13, alpha-at-x=0
      // overstates the H0 swing 4-8x and at Second Peak moves the WRONG WAY.
      const alphas = [mid.stageAlpha];
      for (const dh of [-H0_SWING, +H0_SWING]) {
        const r = await measure(page, preset, cfg.flags, +(mid.H0 + dh).toFixed(2));
        alphas.push(r.stageAlpha);
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
  console.log('pass = A-frame OK (Sewers exempt) AND right crests >= 1.5 AND |dAlpha| <= 5, all at once');
  console.log('alpha = stageAlpha() MEDIAN (the acceptance instrument); a@x0 is a diagnostic, judged on nothing');
  console.log('every config sets all four flags explicitly (=1/=0) — no reliance on shipped defaults\n');
  console.log('config        pass  spurious-Aframes  mean|dAlpha|');
  for (const s of scores) {
    const cfg = CONFIGS.find((c) => c.name === s.config);
    const mark = sameSet(cfg.flags, SHIPPED_FLAGS) ? '  <- SHIPPED default' : '';
    console.log(`${s.config.padEnd(13)} ${String(s.pass).padStart(2)}/${s.of}   ${String(s.spuriousAframes).padStart(6)}            ${s.meanAbsDA.toFixed(1).padStart(5)}${mark}`);
  }

  console.log('\nper-spot detail (config | spot | stage alpha/target | a@x0 diagnostic | takeoff frac | L/R crests | verdicts)');
  for (const cfg of CONFIGS) {
    console.log(`\n-- ${cfg.name} --`);
    for (const m of matrix.filter((x) => x.config === cfg.name)) {
      const v = [m.aframeOK ? '' : 'A-FRAME', m.rightOK ? '' : 'short-right',
                 m.alphaOK ? '' : `dA=${m.dAlpha === null ? '?' : m.dAlpha.toFixed(1)}`]
                .filter(Boolean).join(' ') || 'PASS';
      console.log(`${m.preset.padEnd(11)} a ${String(m.stageAlpha === null ? '?' : m.stageAlpha.toFixed(1)).padStart(5)}/${String(m.target).padEnd(3)} (a@x0 ${String(m.alpha0 === null ? '?' : m.alpha0.toFixed(1)).padStart(5)}) frac ${m.frac.toFixed(2)}  L ${m.leftCrests.toFixed(2)} R ${m.rightCrests.toFixed(2)}  ${v}`);
    }
  }

  if (swing.length) {
    console.log('\n== H0 swing (STAGE-MEDIAN alpha excursion across H0 -0.3 / default / +0.3) ==');
    for (const s of swing)
      console.log(`${s.config.padEnd(6)} ${s.preset.padEnd(11)} H0 ${s.H0}  alphas [${s.alphas.map((a) => a === null ? '?' : a.toFixed(1)).join(', ')}]  swing ${s.swing === null ? '?' : s.swing.toFixed(1)}  ${s.swingOK ? 'ok' : 'FAIL'}`);
  }
}
if (errors.length) console.error('\nCONSOLE ERRORS:\n' + [...new Set(errors)].join('\n'));
