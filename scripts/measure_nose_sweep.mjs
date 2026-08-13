// Track 1c': can the nose EVER own the break line?
//
// The ensemble judgement (spec, "The ensemble, judged") left the reef bounded
// on two sides: it must produce an oblique locus strong enough to survive
// wave-scale smoothing, and the nose at its tuned 0.25 cannot. But 0.25 sat
// under a 0.30 tuning clamp; the definitional bound is 1.0 (all relief spent
// by the stage end). This sweeps #nose=<f> across the full range, each
// fraction measured two ways:
//
//   bare    — nose only (does a stronger nose break the alpha fit?)
//   smooth  — nose + #smooth=1 (the acceptance condition: with the noise-peel
//             smoothed away, does reef authority alone hold the line?)
//
// Same instrument and scoring as measure_ensemble.mjs: one fresh page per
// (spot, config), takeoffProfile(1) + lineProbe alpha nearest x = 0, judged
// against the acceptance triple (A-frames 0 with Sewers exempt, right branch
// >= 1.5 crests, |alpha - target| <= 5 deg).
//
//   node scripts/measure_nose_sweep.mjs [--json]

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
const PORT = 8192;
const JSON_OUT = process.argv.includes('--json');

const PRESETS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks'];
const fracsArg = process.argv.find((a) => a.startsWith('--fracs='));
const FRACS = fracsArg ? fracsArg.slice(8).split(',').map(Number) : [0, 0.25, 0.4, 0.55, 0.7, 0.85, 1.0];
const MODES = ['bare', 'smooth'];
const EDGE = 0.08;
const ALPHA_TOL = 5;

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

async function measure(preset, frac, mode) {
  let url = `http://localhost:${PORT}/web-three/#preset=${preset}&sim=42&hud=0`;
  // toFixed(3): the bare string "1" is the TUNED shorthand in main.js's hash
  // parser (nose=1 -> 0.25), so a whole-number fraction must carry decimals to
  // be read as a fraction. Caught by the f=1.0 rows coming back bit-identical
  // to f=0.25 on the first run.
  if (frac > 0) url += `&nose=${frac.toFixed(3)}`;
  if (mode === 'smooth') url += `&smooth=1`;
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
    return { preset: pb.state.preset, target: pb.state.alpha, alpha0, prof };
  });
  if (!r || r.preset !== preset) throw new Error(`preset did not apply: ${r && r.preset}`);
  return r;
}

const rows = [];
for (const mode of MODES) {
  for (const frac of FRACS) {
    for (const preset of PRESETS) {
      const r = await measure(preset, frac, mode);
      const interior = r.prof.frac > EDGE && r.prof.frac < 1 - EDGE;
      const aframe = interior && r.prof.leftCrests >= 1;
      rows.push({
        mode, frac, preset, target: r.target, alpha0: r.alpha0,
        takeoffFrac: r.prof.frac, leftCrests: r.prof.leftCrests,
        rightCrests: r.prof.rightCrests, aframe,
        aframeOK: preset === 'sewers' ? true : !aframe,
        rightOK: r.prof.rightCrests >= 1.5,
        alphaOK: r.alpha0 !== null && Math.abs(r.alpha0 - r.target) <= ALPHA_TOL,
        dAlpha: r.alpha0 === null ? null : r.alpha0 - r.target,
      });
      if (!JSON_OUT) process.stderr.write('.');
    }
    if (!JSON_OUT) process.stderr.write(` ${mode} f=${frac}\n`);
  }
}

await browser.close();
server.close();

if (JSON_OUT) {
  console.log(JSON.stringify(rows, null, 2));
} else {
  console.log('\n== 1c\' nose sweep ==');
  console.log('pass = A-frame OK (Sewers exempt) AND right crests >= 1.5 AND |dAlpha| <= 5\n');
  for (const mode of MODES) {
    console.log(`-- ${mode} --`);
    console.log('frac   pass  spurious-Aframes  mean|dAlpha|   per-spot alpha (derived/target)');
    for (const frac of FRACS) {
      const rs = rows.filter((r) => r.mode === mode && r.frac === frac);
      const pass = rs.filter((r) => r.aframeOK && r.rightOK && r.alphaOK).length;
      const spur = rs.filter((r) => r.preset !== 'sewers' && r.aframe).length;
      const mean = rs.reduce((s, r) => s + Math.abs(r.dAlpha ?? 99), 0) / rs.length;
      const detail = rs.map((r) => `${r.preset.slice(0, 6)} ${r.alpha0 === null ? '?' : r.alpha0.toFixed(0)}/${r.target}`).join('  ');
      console.log(`${String(frac).padEnd(5)} ${String(pass).padStart(3)}/6   ${String(spur).padStart(6)}            ${mean.toFixed(1).padStart(5)}     ${detail}`);
    }
    console.log('');
  }
}
if (errors.length) console.error('CONSOLE ERRORS:\n' + [...new Set(errors)].join('\n'));
