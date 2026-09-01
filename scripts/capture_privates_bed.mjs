// Privates mapped-bed candidate: BEFORE (synthetic stage) vs AFTER (measured
// bed via `build_geo_profiles.py --truncate 0.5`) at identical pinned clocks.
//
// Two builds are served side by side — the BEFORE tree (a `git archive main`
// export, or any checkout) and this one — and every cell is a cold load of the
// same hash on each, so a pair differs only by the build. Frames go to --out
// with a contact sheet (before left, after right) and a metrics.json read off
// the probe API (window.__pointbreak), camera-independent, so the numbers do
// not move with the framing (MEASUREMENT_LESSONS 11).
//
//   node scripts/capture_privates_bed.mjs --before=/path/to/main-tree [--out=qa/img/privates-bed]
//
// Clocks: 45 s is the set PEAK at the live break line by construction
// (u_setRef re-references the envelope there, see model-glsl.js), and
// 45 + 0.5/dF is the LULL half a set beat later. Both builds get the same
// clock; note the envelope's reference differs between them (no bake before,
// so u_setRef = 0), which is part of what the bed changes, not a rig artefact.
//
// Identity check: the six mapped presets are captured on both builds at one
// pinned frame each and compared byte-for-byte; the profiles are numerically
// identical across the flag, so the renders must be too.

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
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (k, d) => { const a = args.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const BEFORE_ROOT = flag('before', null);
if (!BEFORE_ROOT) { console.error('need --before=<path to the BEFORE tree>'); process.exit(1); }
const OUT = resolve(ROOT, flag('out', 'qa/img/privates-bed'));
const PORT_BEFORE = parseInt(flag('port-before', '8231'), 10);
const PORT_AFTER = parseInt(flag('port-after', '8232'), 10);
const VIEW = { width: 1280, height: 720 };
const COMMON = 'controls=0&q=high&speed=0';

const CAMS = ['drone', 'cliff', 'cover'];
// The card state is the bare preset (the site card's own ocean); day=small is
// the curated small-summer bundle (H0 0.7, T 9, tide +0.35, dF 0.015).
const STATES = [
  { id: 'card', label: 'site card', hash: 'preset=privates' },
  { id: 'daysmall', label: 'day=small', hash: 'preset=privates&day=small' },
];
const MAPPED = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks'];
const SET_ANCHOR_S = 45;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
function serve(root, port) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
      if (p.endsWith('/')) p += 'index.html';
      const file = join(root, p);
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream',
                           'Cache-Control': 'no-store' });
      res.end(body);
    } catch { res.writeHead(404).end('not found'); }
  });
  return new Promise((r) => server.listen(port, '127.0.0.1', () => r(server)));
}

const gitShort = (dir) => {
  try { return execSync('git rev-parse --short HEAD', { cwd: dir, stdio: 'pipe' }).toString().trim(); }
  catch { return null; }
};

// ---------------------------------------------------------------------------
// In-page reads. Everything comes off window.__pointbreak; nothing here moves
// the clock, the camera or a uniform.
// ---------------------------------------------------------------------------
function readMetrics() {
  const pb = window.__pointbreak;
  const st = pb.state, u = pb.uniforms;
  const hud = (id) => (document.getElementById(id)?.textContent || '').trim();
  const line = pb.lineProbe(2) || [];
  const baked = line.length > 0;
  const sa = pb.stageAlpha ? pb.stageAlpha(2) : null;
  const lo = (st.stageStart ?? -110) + 10, hi = (st.stageEnd ?? 290) - 10;
  const zAt = (x) => {
    if (!baked) return 0;
    if (x <= line[0].x) return line[0].z;
    if (x >= line[line.length - 1].x) return line[line.length - 1].z;
    for (let i = 1; i < line.length; i++) if (line[i].x >= x) {
      const a = line[i - 1], b = line[i];
      return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x);
    }
    return 0;
  };
  // Stage sweep along the break line (or z = 0 on the synthetic stage, with a
  // wider window — the same fallback build_qa_sheets.mjs probeStage uses).
  const half = baked ? 40 : 80;
  const N = 41;
  const stations = [];
  for (let i = 0; i < N; i++) {
    const x = lo + (hi - lo) * i / (N - 1);
    const z = zAt(x);
    const rows = pb.curlProbe(x, z - half, z + half, 321) || [];
    let crest = -Infinity, crestZ = null, foam = 0, pocket = 0, ceil = null, ceilAtCrest = null;
    let depthMin = Infinity, depthAtLine = null, bedBacked = false;
    for (const r of rows) {
      if (r.land > 0.5) continue;
      if (r.y > crest) { crest = r.y; crestZ = r.z; ceilAtCrest = r.ceil; }
      foam = Math.max(foam, r.foam); pocket = Math.max(pocket, r.pocket);
      if (r.ceil !== null) { ceil = Math.max(ceil ?? 0, r.ceil); bedBacked = true; }
      if (Number.isFinite(r.depth)) depthMin = Math.min(depthMin, r.depth);
      if (depthAtLine === null || Math.abs(r.z0 - z) < Math.abs(depthAtLine.z0 - z)) depthAtLine = r;
    }
    stations.push({
      x: +x.toFixed(1), zLine: +z.toFixed(1),
      crest: Number.isFinite(crest) ? +crest.toFixed(3) : null,
      crestZ: crestZ === null ? null : +crestZ.toFixed(1),
      ceilMax: ceil === null ? null : +ceil.toFixed(3),
      ceilAtCrest: ceilAtCrest === null || ceilAtCrest === undefined ? null : +ceilAtCrest.toFixed(3),
      fillAtCrest: ceilAtCrest ? +(crest / ceilAtCrest).toFixed(3) : null,
      foam: +foam.toFixed(3), pocket: +pocket.toFixed(3),
      depthMin: Number.isFinite(depthMin) ? +depthMin.toFixed(2) : null,
      depthAtLine: depthAtLine ? +depthAtLine.depth.toFixed(2) : null,
      bedBacked,
    });
  }
  const crests = stations.filter((s) => s.crest !== null);
  const peak = crests.reduce((b, s) => (b === null || s.crest > b.crest ? s : b), null);
  const pocketSt = stations.reduce((b, s) => (b === null || s.pocket > b.pocket ? s : b), null);
  const fills = stations.map((s) => s.fillAtCrest).filter((v) => v !== null);
  const tp = pb.takeoffProfile ? pb.takeoffProfile(1) : null;
  const ride = pb.m4Ride ? pb.m4Ride() : null;
  const aim = pb.aimProbe ? pb.aimProbe() : null;
  const reef = pb.reefAudit ? pb.reefAudit() : null;
  const bakeX = line.length ? [line[0].x, line[line.length - 1].x] : null;
  // The break line at the OSM node: the node is the stage origin (0, 0) in the
  // stage frame (build_geo_profiles.py stageOriginENU), so z of the line at
  // x = 0 IS the line-vs-node offset, shore-normal (seaward negative).
  const lineAtNode = baked ? zAt(0) : null;
  const lineZ = line.map((p) => p.z);
  return {
    sim: pb.sim(), preset: st.preset, day: pb.day(),
    geoSpot: st.geoSpot ?? null, geoRequestedSpot: st.geoRequestedSpot ?? null, geoMix: st.geoMix,
    stageStart: st.stageStart, stageEnd: st.stageEnd, geoFitRmse: st.geoFitRmse,
    H0: st.H0, T: st.T, tide: st.tide || 0, dF: st.dF, xi: st.xi, alphaTarget: st.alpha,
    depthMix: u.u_depthMix.value, setRef: u.u_setRef.value,
    hudGeo: hud('hudGeo'), hudAlpha: hud('hudAlpha'), hudSwell: hud('hudSwell'),
    baked, bakeX, lineAtNodeZ: lineAtNode === null ? null : +lineAtNode.toFixed(2),
    lineZRange: lineZ.length ? [+Math.min(...lineZ).toFixed(1), +Math.max(...lineZ).toFixed(1)] : null,
    stageAlpha: sa ? { median: sa.median, medianClean: sa.medianClean, pinnedN: sa.pinnedN, stations: sa.stations } : null,
    bedBackedStations: stations.filter((s) => s.bedBacked).length, stations: stations.length,
    crestMaxM: peak ? peak.crest : null, crestMaxAtX: peak ? peak.x : null,
    ceilAtCrestMax: peak ? peak.ceilAtCrest : null,
    fillAtCrestMax: peak ? peak.fillAtCrest : null,
    ceilStageMax: (() => { const c = stations.map((s) => s.ceilMax).filter((v) => v !== null); return c.length ? Math.max(...c) : null; })(),
    fillMedian: fills.length ? [...fills].sort((a, b) => a - b)[Math.floor(fills.length / 2)] : null,
    fillMax: fills.length ? Math.max(...fills) : null,
    pocketStation: pocketSt ? { x: pocketSt.x, crest: pocketSt.crest, ceilAtCrest: pocketSt.ceilAtCrest, fill: pocketSt.fillAtCrest, pocket: pocketSt.pocket, depthAtLine: pocketSt.depthAtLine } : null,
    depthAtLineRange: (() => { const d = stations.map((s) => s.depthAtLine).filter((v) => v !== null); return d.length ? [Math.min(...d), Math.max(...d)] : null; })(),
    foamFrac: stations.filter((s) => s.foam >= 0.15).length / stations.length,
    takeoff: tp ? { takeoffX: tp.takeoffX, frac: +tp.frac.toFixed(3), xLo: tp.xLo, xHi: tp.xHi, leftCrests: +tp.leftCrests.toFixed(2), rightCrests: +tp.rightCrests.toFixed(2) } : null,
    rideSpan: { xLo: (st.stageStart ?? -110) + 10, xHi: (st.stageEnd ?? 290) - 10 },
    ride: ride ? { x: ride.x, z: ride.z, waiting: ride.waiting, n: ride.n } : null,
    aim: aim ? { raw: aim.raw, ok: aim.ok, cam: aim.cam } : null,
    reefAudit: reef ? { withinTol: reef.withinTol, deepened: reef.deepened, aboveCeil: reef.aboveCeil, dryTouched: reef.dryTouched, postsTouched: reef.postsTouched, fitDerivedDeg: reef.fitDerivedDeg, residualDeg: reef.residualDeg, hbM: reef.hbM, maxRaiseM: reef.maxRaiseM } : null,
    peelClamp: pb.peelClamp ? pb.peelClamp() : null,
    stations,
  };
}

async function coldLoad(page, base, hash) {
  await page.goto('about:blank');
  await page.goto(`${base}web-three/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const beforeRoot = resolve(BEFORE_ROOT);
  const sBefore = await serve(beforeRoot, PORT_BEFORE);
  const sAfter = await serve(ROOT, PORT_AFTER);
  const builds = {
    before: { base: `http://127.0.0.1:${PORT_BEFORE}/`, root: beforeRoot, commit: gitShort(beforeRoot) },
    after:  { base: `http://127.0.0.1:${PORT_AFTER}/`,  root: ROOT,       commit: gitShort(ROOT) },
  };
  const browser = await chromium.launch({ args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: VIEW });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const cells = [];
  const metrics = { before: {}, after: {} };

  for (const state of STATES) {
    // Clocks are per STATE (the lull depends on dF), identical across builds.
    let clocks = null;
    for (const which of ['before', 'after']) {
      const b = builds[which];
      // metrics once per state x clock, at cam=drone (camera-independent read)
      if (!clocks) {
        await coldLoad(page, b.base, `${state.hash}&cam=drone&sim=${SET_ANCHOR_S}&${COMMON}`);
        const dF = await page.evaluate(() => window.__pointbreak.state.dF);
        clocks = [SET_ANCHOR_S, +(SET_ANCHOR_S + 0.5 / dF).toFixed(1)];
      }
      for (const t of clocks) {
        for (const cam of CAMS) {
          const hash = `${state.hash}&cam=${cam}&sim=${t}&${COMMON}`;
          await coldLoad(page, b.base, hash);
          const check = await page.evaluate(() => ({ preset: window.__pointbreak.state.preset, sim: window.__pointbreak.sim() }));
          if (check.preset !== 'privates') throw new Error(`${which} ${hash}: preset ${check.preset}`);
          if (Math.abs(check.sim - t) > 1e-3) throw new Error(`${which} ${hash}: clock ${check.sim} != ${t}`);
          const file = `${which}_${state.id}_${cam}_sim${t}.png`;
          await page.screenshot({ path: join(OUT, file) });
          if (cam === 'drone') {
            metrics[which][`${state.id}@${t}`] = await page.evaluate(readMetrics);
          }
          cells.push({ which, state: state.id, stateLabel: state.label, cam, t, hash, file });
          console.log(`  ${which.padEnd(6)} ${state.id.padEnd(9)} ${cam.padEnd(5)} sim=${t}`);
        }
      }
    }
  }

  // Identity check on the six mapped presets: one pinned frame each.
  const identity = [];
  for (const key of MAPPED) {
    const hash = `preset=${key}&cam=drone&sim=${SET_ANCHOR_S}&${COMMON}`;
    const bufs = {};
    const geo = {};
    for (const which of ['before', 'after']) {
      await coldLoad(page, builds[which].base, hash);
      const st = await page.evaluate(() => {
        const s = window.__pointbreak.state;
        return { preset: s.preset, geoSpot: s.geoSpot, stageStart: s.stageStart, stageEnd: s.stageEnd,
                 x2: s.contourX2, x3: s.contourX3, rmse: s.geoFitRmse };
      });
      if (st.preset !== key) throw new Error(`${which} ${key}: preset ${st.preset}`);
      geo[which] = st;
      bufs[which] = await page.screenshot({ path: join(OUT, `identity_${which}_${key}.png`) });
    }
    const identical = bufs.before.equals(bufs.after);
    identity.push({ key, hash, identical, bytes: [bufs.before.length, bufs.after.length], geo });
    console.log(`  identity ${key.padEnd(10)} ${identical ? 'IDENTICAL' : 'DIFFERS'} (${bufs.before.length} / ${bufs.after.length} bytes)`);
  }

  await browser.close();
  sBefore.close(); sAfter.close();

  const result = { capturedAt: new Date().toISOString(), view: VIEW, builds: { before: { commit: builds.before.commit, root: builds.before.root }, after: { commit: builds.after.commit, root: builds.after.root } },
                   states: STATES, cams: CAMS, cells, metrics, identity, errors };
  await writeFile(join(OUT, 'metrics.json'), JSON.stringify(result, null, 2));
  await writeFile(join(OUT, 'index.html'), renderSheet(result));
  let bytes = 0;
  for (const c of cells) bytes += (await stat(join(OUT, c.file))).size;
  for (const i of identity) bytes += i.bytes[0] + i.bytes[1];
  console.log(`\nwrote ${OUT} — ${cells.length} pair cells + ${identity.length} identity pairs, ${(bytes / 1e6).toFixed(1)} MB of PNG`);
  if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); }
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function fmt(v, d = 2) { return v === null || v === undefined ? 'n/a' : (typeof v === 'number' ? v.toFixed(d) : String(v)); }

function renderSheet(r) {
  const pairs = [];
  for (const state of r.states) {
    const ts = [...new Set(r.cells.filter((c) => c.state === state.id).map((c) => c.t))];
    for (const t of ts) for (const cam of r.cams) {
      const b = r.cells.find((c) => c.which === 'before' && c.state === state.id && c.cam === cam && c.t === t);
      const a = r.cells.find((c) => c.which === 'after' && c.state === state.id && c.cam === cam && c.t === t);
      pairs.push({ state, t, cam, b, a });
    }
  }
  const keys = Object.keys(r.metrics.after);
  const row = (label, f, d) => `<tr><th>${esc(label)}</th>${keys.map((k) => `<td>${esc(fmt(f(r.metrics.before[k]), d))}</td><td class="a">${esc(fmt(f(r.metrics.after[k]), d))}</td>`).join('')}</tr>`;
  const metricRows = [
    row('geoSpot', (m) => m.geoSpot),
    row('geoMix / u_depthMix', (m) => `${m.geoMix} / ${m.depthMix}`),
    row('stage [start, end] m', (m) => `[${m.stageStart}, ${m.stageEnd}]`),
    row('ride span [xLo, xHi] m', (m) => `[${m.rideSpan.xLo}, ${m.rideSpan.xHi}]`),
    row('contour fit RMS m', (m) => m.geoFitRmse),
    row('H0 / T / tide / dF', (m) => `${m.H0} / ${m.T} / ${m.tide} / ${m.dF}`),
    row('HUD stage', (m) => m.hudGeo),
    row('HUD peel α', (m) => m.hudAlpha),
    row('baked line', (m) => m.baked ? `yes, x ∈ [${m.bakeX[0]}, ${m.bakeX[1]}]` : 'no'),
    row('bedBacked stations', (m) => `${m.bedBackedStations} / ${m.stations}`),
    row('crestCeilM stage max', (m) => m.ceilStageMax),
    row('crest max m (station x)', (m) => `${fmt(m.crestMaxM)} (x ${m.crestMaxAtX})`),
    row('ceiling at crest max', (m) => m.ceilAtCrestMax),
    row('fill = crest / ceiling at crest max', (m) => m.fillAtCrestMax, 3),
    row('fill median / max over stations', (m) => `${fmt(m.fillMedian, 3)} / ${fmt(m.fillMax, 3)}`),
    row('pocket station x / crest / ceil / fill', (m) => m.pocketStation ? `${m.pocketStation.x} / ${fmt(m.pocketStation.crest)} / ${fmt(m.pocketStation.ceilAtCrest)} / ${fmt(m.pocketStation.fill, 3)}` : 'n/a'),
    row('depth at line, min..max m', (m) => m.depthAtLineRange ? `${fmt(m.depthAtLineRange[0])} .. ${fmt(m.depthAtLineRange[1])}` : 'n/a'),
    row('stage α median / clean (deg)', (m) => m.stageAlpha ? `${fmt(m.stageAlpha.median, 1)} / ${fmt(m.stageAlpha.medianClean, 1)} (pinned ${m.stageAlpha.pinnedN}/${m.stageAlpha.stations})` : 'n/a (no bake)'),
    row('α target (card)', (m) => m.alphaTarget, 0),
    row('break line at OSM node (z at x=0), m', (m) => m.lineAtNodeZ),
    row('break line z range, m', (m) => m.lineZRange ? `${m.lineZRange[0]} .. ${m.lineZRange[1]}` : 'n/a'),
    row('takeoff x (stage frac)', (m) => m.takeoff ? `${m.takeoff.takeoffX} (${m.takeoff.frac})` : 'n/a'),
    row('rider x / z / waiting', (m) => m.ride ? `${fmt(m.ride.x, 1)} / ${fmt(m.ride.z, 1)} / ${m.ride.waiting}` : 'n/a'),
    row('foam fraction of stage', (m) => m.foamFrac, 2),
    row('reef audit', (m) => m.reefAudit ? `withinTol ${m.reefAudit.withinTol} · deepened ${m.reefAudit.deepened} · aboveCeil ${m.reefAudit.aboveCeil} · dry ${m.reefAudit.dryTouched}` : 'n/a'),
  ].join('\n');
  return `<!doctype html><meta charset="utf-8"><title>Privates mapped-bed candidate — before / after</title>
<style>
body{font:14px/1.4 system-ui,sans-serif;color:#111;background:#fff;margin:24px;max-width:1400px}
h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:28px 0 8px}
.meta{color:#333;font-size:13px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:14px 0 22px}
.pair figure{margin:0}.pair img{width:100%;display:block;border:1px solid #999}
.pair figcaption{font-size:12px;color:#222;padding:4px 0}
.pair figcaption code{font-size:11px;color:#333;word-break:break-all}
.lbl{font-weight:700}.lbl.a{color:#0a3d0a}
table{border-collapse:collapse;font-size:13px}th,td{border:1px solid #bbb;padding:3px 8px;text-align:left;vertical-align:top}
th{background:#f2f2f2}td.a{background:#eef6ee}
.note{background:#f7f7f7;border-left:4px solid #555;padding:8px 12px;margin:12px 0}
</style>
<h1>Privates — synthetic stage (BEFORE) vs mapped bed via <code>--truncate 0.5</code> (AFTER)</h1>
<p class="meta">captured ${esc(r.capturedAt)} · before = ${esc(r.builds.before.commit || '?')} · after = ${esc(r.builds.after.commit || '?')} · ${r.view.width}×${r.view.height} · every cell is a cold load of the hash shown, same clock on both builds.</p>
<div class="note">What to judge by eye: the AFTER ride span ends at x = +60 m down-point of the OSM node (BEFORE: +290 m on the synthetic stage). The DEM says the −0.52 m contour turns 33–38° into the cove there; whether that is where Privates actually breaks is not something the DEM can settle. Also whether the wave on the measured bed reads as Privates (a small, soft down-point wave) or as another copy of the mapped spots.</div>
${pairs.map((p) => `<h2>${esc(p.state.label)} · cam=${esc(p.cam)} · sim=${p.t}</h2>
<div class="pair">
<figure><img src="${esc(p.b.file)}" alt="before ${esc(p.state.id)} ${esc(p.cam)} sim ${p.t}"><figcaption><span class="lbl">BEFORE (synthetic stage)</span> · <code>#${esc(p.b.hash)}</code></figcaption></figure>
<figure><img src="${esc(p.a.file)}" alt="after ${esc(p.state.id)} ${esc(p.cam)} sim ${p.t}"><figcaption><span class="lbl a">AFTER (mapped bed)</span> · <code>#${esc(p.a.hash)}</code></figcaption></figure>
</div>`).join('\n')}
<h2>Probe metrics (window.__pointbreak, read at cam=drone; camera-independent)</h2>
<table><tr><th>metric</th>${keys.map((k) => `<th>before · ${esc(k)}</th><th>after · ${esc(k)}</th>`).join('')}</tr>
${metricRows}
</table>
<h2>Identity check — six mapped presets, one pinned frame each</h2>
<table><tr><th>preset</th><th>hash</th><th>PNG bytes before / after</th><th>identical</th><th>stage before → after</th></tr>
${r.identity.map((i) => `<tr><td>${esc(i.key)}</td><td><code>#${esc(i.hash)}</code></td><td>${i.bytes[0]} / ${i.bytes[1]}</td><td>${i.identical ? 'yes (byte-identical)' : 'NO'}</td><td>[${i.geo.before.stageStart}, ${i.geo.before.stageEnd}] → [${i.geo.after.stageStart}, ${i.geo.after.stageEnd}]</td></tr>`).join('\n')}
</table>
${r.errors.length ? `<h2>Console errors</h2><pre>${esc(r.errors.join('\n'))}</pre>` : ''}
`;
}

await main();
