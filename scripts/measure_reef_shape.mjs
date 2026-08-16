// Track 1c'-c.3: can a reef shape make the reef OWN the break line?
//
// The 2026-08-13 diagnosis left one structural item: the drawn line sits a
// median of 40-191 m from the fitted wedge crest, and that distance tracks the
// stage-median alpha error. Everything else (the low-H0 branch flips, the dead
// down-point third, the inert anchor band) is downstream of it. Two levers are
// in the wedge, and REEF_AMP_MAX is the interesting one because it appears
// TWICE: as the lift clamp AND inside `bound`, which is where the reef ceases
// to exist. Raising it extends the reef seaward into deeper water, which is
// what can put reef under the break line rather than merely more reef under
// the crest.
//
// Scored on the instruments that survived yesterday:
//   stageA   stage-median derived alpha (the acceptance instrument)
//   dA       stageA - target
//   crestOff median |line - wedge crest|
// plus the M5 clamp invariants from reefAudit(), because peel angle bought by
// deepening posts or breaching the -0.5 m ceiling is not peel angle, it is a
// broken guarantee. A config that violates them is reported FAIL regardless of
// how good its alpha looks.
//
//   node scripts/measure_reef_shape.mjs [--json] [--amps=3.2,5,7] [--flanks=45,80,120]

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
const PORT = 8198;
const JSON_OUT = process.argv.includes('--json');
const arg = (k, d) => {
  const a = process.argv.find((v) => v.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3).split(',').map(Number) : d;
};
const AMPS = arg('amps', [3.2, 5, 7]);
const FLANKS = arg('flanks', [45, 80, 120]);
const PRESETS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks'];
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

const rows = [];
for (const amp of AMPS) {
  for (const flank of FLANKS) {
    for (const preset of PRESETS) {
      const url = `http://localhost:${PORT}/web-three/#preset=${preset}&sim=42&hud=0&month=card`
                + `&reefamp=${amp}&reefflank=${flank}`;
      await page.goto(url, { waitUntil: 'load' });
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(1700);
      const r = await page.evaluate(() => {
        const pb = window.__pointbreak;
        if (!pb) return null;
        const sa = pb.stageAlpha(), co = pb.crestOffset(), au = pb.reefAudit();
        return { preset: pb.state.preset, target: pb.state.alpha, shape: pb.reefShape(),
                 stageA: sa && sa.median, crestOff: co && co.median,
                 audit: au && { deepened: au.deepened, aboveCeil: au.aboveCeil,
                                dryTouched: au.dryTouched, maxRaiseM: au.maxRaiseM,
                                residualDeg: au.residualDeg, withinTol: au.withinTol } };
      });
      if (!r || r.preset !== preset) throw new Error(`preset did not apply: ${preset}`);
      // Prove the knob is live per row, not once — a stale cache would otherwise
      // read as "this shape does nothing" (the #nose=1 bit-identical trap).
      if (Math.abs(r.shape.amp - amp) > 1e-6 || Math.abs(r.shape.flank - flank) > 1e-6)
        throw new Error(`shape did not apply: asked ${amp}/${flank}, got ${JSON.stringify(r.shape)}`);
      const a = r.audit || {};
      rows.push({ amp, flank, preset, target: r.target, stageA: r.stageA,
                  dAlpha: r.stageA - r.target, crestOff: r.crestOff,
                  safe: a.deepened === 0 && a.aboveCeil === 0 && a.dryTouched === 0,
                  maxRaiseM: a.maxRaiseM, residualDeg: a.residualDeg });
      if (!JSON_OUT) process.stderr.write('.');
    }
    if (!JSON_OUT) process.stderr.write(` amp=${amp} flank=${flank}\n`);
  }
}

await browser.close();
server.close();

const score = (amp, flank) => {
  const rs = rows.filter((r) => r.amp === amp && r.flank === flank);
  return {
    amp, flank,
    onTarget: rs.filter((r) => Math.abs(r.dAlpha) <= ALPHA_TOL).length,
    meanAbsDA: rs.reduce((s, r) => s + Math.abs(r.dAlpha), 0) / rs.length,
    medCrestOff: [...rs.map((r) => r.crestOff)].sort((a, b) => a - b)[Math.floor(rs.length / 2)],
    unsafe: rs.filter((r) => !r.safe).length,
    maxRaiseM: Math.max(...rs.map((r) => r.maxRaiseM || 0)),
  };
};

if (JSON_OUT) {
  const scores = [];
  for (const amp of AMPS) for (const flank of FLANKS) scores.push(score(amp, flank));
  console.log(JSON.stringify({ rows, scores }, null, 2));
} else {
  console.log('\n== reef-shape sweep (Track 1c\'-c.3) ==');
  console.log('onTarget = spots with |stage-median alpha - target| <= 5 deg');
  console.log('unsafe   = spots violating an M5 clamp invariant (deepened / above ceiling / dry touched)\n');
  console.log('amp  flank  onTarget  mean|dA|  med crestOff  maxRaise  unsafe');
  for (const amp of AMPS) for (const flank of FLANKS) {
    const s = score(amp, flank);
    console.log(`${String(s.amp).padEnd(4)} ${String(s.flank).padEnd(5)}  ${String(s.onTarget).padStart(5)}/6  `
      + `${s.meanAbsDA.toFixed(1).padStart(7)}  ${s.medCrestOff.toFixed(0).padStart(11)}m  `
      + `${s.maxRaiseM.toFixed(1).padStart(7)}m  ${s.unsafe ? 'FAIL ' + s.unsafe : 'ok'}`);
  }
  console.log('\nper-spot stage-median alpha (derived / target), by shape:');
  for (const amp of AMPS) for (const flank of FLANKS) {
    const rs = rows.filter((r) => r.amp === amp && r.flank === flank);
    console.log(`  amp ${String(amp).padEnd(4)} flank ${String(flank).padEnd(4)} `
      + rs.map((r) => `${r.preset.slice(0, 6)} ${r.stageA.toFixed(0)}/${r.target}`).join('  '));
  }
}
if (errors.length) console.error('\nCONSOLE ERRORS:\n' + [...new Set(errors)].join('\n'));
