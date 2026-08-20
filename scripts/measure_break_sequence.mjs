// How far does the tracked wave get, and how far does its breakpoint peel?
//
// WHY THIS EXISTS. The QA break sheet's five columns used to span one full wave
// period T. A crest advances exactly one crest spacing per period, so column k
// sat k/5 of a spacing along and column 5 sat 0.80 of a spacing on — 0.20 of a
// spacing from where the NEXT wave upstream had been in column 1. The sheet
// very nearly aliased back onto itself, which is what "it's hard to see what's
// happening here... which wave are we tracking?" was reporting.
//
// The ratio is arithmetic, not a measurement: advance/spacing = dt/T, and the
// local wavelength cancels, so it is 0.80 at every site, size and camera. What
// is NOT arithmetic is the other half of the trade — how much of the BREAK you
// give up by shortening the span. This measures that, per row, so the span in
// build_qa_sheets.mjs (WAVE_SPAN_T) is a measured choice rather than a taste.
//
// It reports, at each candidate span:
//   * where the model's own zipper locus (argmax of `pocket` along the break
//     line — see the trackedWave note in build_qa_sheets.mjs) sits in each of
//     the five columns, and how far it travelled across the row;
//   * whether the tracked wave SURVIVES all five columns, which is the binding
//     constraint at the big end: at day=big it has peeled off the stage by
//     about 0.35 T and the last columns have no subject left;
//   * the foam fraction along the line, so "the break progresses" is a number.
//
// Usage:
//   node scripts/measure_break_sequence.mjs                       # default rows
//   node scripts/measure_break_sequence.mjs --port=8231 --json=out.json
//   node scripts/measure_break_sequence.mjs --rows=day=small,day=big
//   node scripts/measure_break_sequence.mjs --spans=0.25,0.33,0.5
//   node scripts/measure_break_sequence.mjs --base=http://localhost:8127/
//
// Serves the repo on its own port (scripts/serve.py) unless --base is given, so
// it never touches a dev server you are reading a sheet on.
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Same ancestor walk build_qa_sheets.mjs uses: inside a git worktree the
// sibling repo that owns node_modules is several levels further up.
const PW = [process.env.PLAYWRIGHT_DIR];
for (let d = ROOT; ; d = dirname(d)) {
  PW.push(join(d, 'node_modules/playwright/index.mjs'));
  PW.push(join(d, 'psychodeli-webgl-port/node_modules/playwright/index.mjs'));
  if (dirname(d) === d) break;
}
let chromium;
for (const c of PW.filter(Boolean)) {
  try { ({ chromium } = await import(c)); break; } catch { /* try next */ }
}
if (!chromium) {
  console.error('playwright not found. Set PLAYWRIGHT_DIR=/path/to/playwright/index.mjs');
  process.exit(1);
}

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const s = a.replace(/^--/, ''); const eq = s.indexOf('=');
  return eq < 0 ? [s, 'true'] : [s.slice(0, eq), s.slice(eq + 1)];
}));
const PORT = Number(flags.port || 8231);
const VIEW = { width: 1000, height: 625 };
const COMMON = 'controls=0&q=high&speed=0';
const SET_ANCHOR_S = 45;
const NCOL = 5;

const ROWS = (flags.rows || 'day=small,day=modelcard,day=overhead,day=big,h0=0.7,h0=2.5')
  .split(',').map((h) => h.trim()).filter(Boolean);
const CAMS = (flags.cams || 'cliff,drone').split(',');
const SPANS = (flags.spans || '0.2,0.25,0.3333,0.4,0.5,0.75,1.0')
  .split(',').map(Number).filter((v) => v > 0);
const PRESET = flags.preset || 'secondpeak';

// ---------------------------------------------------------------------------
// In-page probes. Deliberately the SAME reads build_qa_sheets.mjs makes, so a
// span chosen here is a span measured on the instrument that will use it
// (MEASUREMENT_LESSONS 4: a probe that scores a replica certifies the replica).
// ---------------------------------------------------------------------------
function setup() {
  const pb = window.__pointbreak;
  const fractf = (v) => v - Math.floor(v);
  const hash11 = (p) => { p = fractf(p * 0.1031); p *= p + 33.33; return fractf((p + p) * p); };
  const vnoise1 = (v) => {
    const i = Math.floor(v); let f = v - i; f = f * f * (3 - 2 * f);
    return hash11(i) + (hash11(i + 1) - hash11(i)) * f;
  };
  const secU = pb.uniforms.u_sections.value;
  const secShift = (x) => (secU >= 0.05
    ? Math.min(secU * 55 * (vnoise1(x * 0.02 + 7.3) - 0.5) * 2, 0) : 0);
  window.__seq = {
    line: (step) => (pb.lineProbe(step) || [])
      .map((p) => ({ x: p.x, z: p.z + secShift(p.x), gap: Boolean(p.gap) })),
    crestAt: (x, z, half, n) => {
      const rows = pb.curlProbe(x, z - half, z + half, n) || [];
      let y = -Infinity, zz = null;
      for (const r of rows) if (r.land < 0.5 && r.y > y) { y = r.y; zz = r.z; }
      return Number.isFinite(y) ? { y, z: zz } : null;
    },
  };
}

// pocket along the break line: the model's own zipper locus. `d` is zero on the
// line, so the pocket bell there is the crest-proximity bell and its argmax is
// where a crest is crossing.
function zipper({ seedX, step }) {
  const pb = window.__pointbreak;
  const sa = pb.stageAlpha();
  const line = window.__seq.line(step)
    .filter((p) => p.x >= sa.stageLo && p.x <= sa.stageHi);
  const s = [];
  for (const p of line) {
    if (p.gap) { s.push({ x: p.x, pocket: 0, foam: 0, gap: true }); continue; }
    const rows = pb.curlProbe(p.x, p.z - 0.5, p.z + 0.5, 3) || [];
    const m = rows[1] || {};
    s.push({ x: p.x, pocket: m.pocket || 0, foam: m.foam || 0, gap: false });
  }
  let bi = -1, bv = -Infinity;
  for (let i = 0; i < s.length; i++) {
    if (s[i].gap) continue;
    const sc = Number.isFinite(seedX) ? s[i].pocket - 0.0015 * Math.abs(s[i].x - seedX) : s[i].pocket;
    if (sc > bv) { bv = sc; bi = i; }
  }
  const open = s.filter((v) => !v.gap);
  return {
    t: pb.sim(), stageLo: sa.stageLo, stageHi: sa.stageHi,
    bpX: bi >= 0 && s[bi].pocket > 1e-4 ? s[bi].x : null,
    bpPocket: bi >= 0 ? +s[bi].pocket.toFixed(3) : null,
    pocketMax: open.length ? +Math.max(...open.map((v) => v.pocket)).toFixed(3) : null,
    foamFrac: open.length
      ? +(open.filter((v) => v.foam >= 0.15).length / open.length).toFixed(3) : null,
  };
}

async function setClock(page, t) {
  await page.evaluate(async (tt) => {
    window.__pointbreak.setSim(tt);
    // two rAF ticks: the loop must copy simTime -> u_time and then draw.
    // Without them curlProbe reads the PREVIOUS clock's uniforms and every
    // sample in a sweep comes back identical.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
  // Same settle as build_qa_sheets.mjs. Shorter was tried and produced readings
  // that disagreed with the rig's on the same hash and the same clock: at
  // q=high the draw does not always land inside two rAF on this grid.
  await page.waitForTimeout(120);
}

// ---------------------------------------------------------------------------
let server = null;
const stopServer = () => {
  if (server && !server.killed) { try { server.kill('SIGTERM'); } catch { /* gone */ } server = null; }
};
process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(130); });

let base = flags.base;
if (!base) {
  server = spawn('python3', [join(ROOT, 'scripts/serve.py'), String(PORT)],
    { cwd: ROOT, stdio: 'ignore' });
  base = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${base}web-three/index.html`); if (r.ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
}
if (!base.endsWith('/')) base += '/';

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

const out = { generated: new Date().toISOString(), preset: PRESET, spans: SPANS, rows: {} };
try {
  for (const cam of CAMS) {
    for (const rowHash of ROWS) {
      const id = `${rowHash}/${cam}`;
      await page.goto('about:blank');
      await page.goto(`${base}web-three/#preset=${PRESET}&cam=${cam}&${rowHash}&${COMMON}&sim=${SET_ANCHOR_S}`,
        { waitUntil: 'load' });
      await page.waitForTimeout(2600);
      await page.evaluate(setup);
      const meta = await page.evaluate(() => {
        const pb = window.__pointbreak, st = pb.state, sa = pb.stageAlpha();
        return { T: st.T, H0: st.H0, xi: st.xi, aim: pb.aimProbe().raw,
          alphaMed: sa.medianClean ?? sa.median, stageLo: sa.stageLo, stageHi: sa.stageHi };
      });
      const { T } = meta, aimX = meta.aim.x, aimZ = meta.aim.z;

      // t*, exactly as build_qa_sheets.mjs derives it: argmax of the GPU-read
      // crest height on a +-4 m transect at the aim station, over one T centred
      // on the set anchor.
      let tStar = SET_ANCHOR_S - T / 2, best = -Infinity;
      for (let i = 0; i <= 40; i++) {
        const t = SET_ANCHOR_S - T / 2 + (T * i) / 40;
        await setClock(page, t);
        const c = await page.evaluate(([x, z]) => window.__seq.crestAt(x, z, 4, 33),
          [aimX, aimZ]);
        if (c && c.y > best) { best = c.y; tStar = t; }
      }

      // The local crest spacing at the aim station, measured rather than taken
      // from LAM: the crest advances exactly one of these per period, and it is
      // 15-82 m across this bank against a 90 m deep-water LAM.
      await setClock(page, tStar);
      let z = (await page.evaluate(([x, zz]) => window.__seq.crestAt(x, zz, 45, 385),
        [aimX, aimZ])).z;
      const z0 = z;
      // Window [zp - 4, zp + 8] around the predicted position: at T/64 the
      // crest advances at most 90/64 = 1.4 m, so the window cannot reach the
      // next crest (the closest spacing in this bank is ~15 m) and the track
      // cannot hop.
      const NSTEP = 64;
      let lost = 0;
      for (let i = 1; i <= NSTEP; i++) {
        await setClock(page, tStar + (T * i) / NSTEP);
        const p = await page.evaluate(([x, zp]) => window.__seq.crestAt(x, zp + 2, 6, 97),
          [aimX, z]);
        if (!p) { lost++; break; }
        z = p.z;
      }
      const lamLocal = lost ? NaN : z - z0;

      const rec = { hash: rowHash, cam, T, H0: meta.H0, xi: meta.xi,
        alphaMed: +meta.alphaMed.toFixed(1), aim: meta.aim,
        stage: [meta.stageLo, meta.stageHi], tStar: +tStar.toFixed(3),
        lamLocalM: Number.isFinite(lamLocal) ? +lamLocal.toFixed(1) : null, spans: {} };
      console.log(`\n== ${id}  H0 ${meta.H0.toFixed(2)} m · T ${T} s · stage α ${meta.alphaMed.toFixed(1)}°`
        + ` · t* ${tStar.toFixed(2)} s · local crest spacing ${Number.isFinite(lamLocal) ? lamLocal.toFixed(1) + " m" : "n/a (track lost)"}`);

      for (const frac of SPANS) {
        const cols = [];
        let seedX = null;
        for (let k = 0; k < NCOL; k++) {
          const t = +(tStar + frac * T * (k / (NCOL - 1))).toFixed(3);
          await setClock(page, t);
          const zp = await page.evaluate(zipper, { seedX, step: 4 });
          if (zp.bpX !== null) seedX = zp.bpX;
          cols.push({ k, t, ...zp });
        }
        const bps = cols.map((c) => c.bpX);
        const alive = bps.filter((v) => v !== null).length;
        const travel = bps[0] !== null && bps[NCOL - 1] !== null
          ? +(bps[NCOL - 1] - bps[0]).toFixed(1) : null;
        rec.spans[frac] = { spanS: +(frac * T).toFixed(2), alive, travelM: travel, cols };
        console.log(`  span ${frac.toFixed(4)}·T = ${(frac * T).toFixed(2).padStart(5)} s`
          + `  crest ${frac.toFixed(2)} Λ on`
          + `  bpX ${bps.map((v) => (v === null ? '  —' : v.toFixed(0).padStart(3))).join('/')}`
          + `  travel ${travel === null ? '   —' : `${travel > 0 ? '+' : ''}${travel.toFixed(0)} m`}`
          + `  pocket ${cols.map((c) => (c.pocketMax === null ? '—' : c.pocketMax.toFixed(2))).join('/')}`
          + `  foam ${cols.map((c) => (c.foamFrac === null ? '—' : c.foamFrac.toFixed(2))).join('/')}`
          + (alive < NCOL ? `  [${NCOL - alive} COLUMN(S) LOST]` : ''));
      }
      out.rows[id] = rec;
    }
  }
} finally {
  await browser.close();
  stopServer();
}

// The summary a span choice is actually made on: the largest span at which
// every row still has a tracked wave in all five columns, against the aliasing
// bound (a span of s·T puts the crest s spacings on, so s must stay well under
// one and comfortably under a half).
const worstAlive = {};
for (const frac of SPANS) {
  worstAlive[frac] = Math.min(...Object.values(out.rows)
    .map((r) => (r.spans[frac] ? r.spans[frac].alive : 0)));
}
out.worstAlive = worstAlive;
console.log('\n---- every row keeps its subject up to ----');
for (const frac of SPANS)
  console.log(`  span ${frac.toFixed(4)}·T  crest ${frac.toFixed(2)} Λ on  `
    + `worst row keeps ${worstAlive[frac]}/${NCOL} columns`
    + (worstAlive[frac] === NCOL ? '' : '   <- loses the subject'));

if (flags.json) {
  writeFileSync(resolve(flags.json), JSON.stringify(out, null, 2));
  console.log(`\n-> ${resolve(flags.json)}`);
}
if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
