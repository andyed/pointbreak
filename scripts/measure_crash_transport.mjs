// Transported crash — origin, displacement, lifetime, screen coverage.
//
// WHY THIS EXISTS. NEXT_INVESTMENTS 2 asks for a crash that LANDS and then
// TRAVELS: an impact deposit at the curtain landing and a roller carried
// down-face/down-line with the bore. `#roller=` (model-glsl impactSourceAt)
// is the flag-gated prototype. Its acceptance gates are all verbs of motion —
// absent pre-break, begins at the landing, advances monotonically, decays
// without teleporting to the next carrier, trajectory scales with elapsed
// time — and MEASUREMENT_LESSONS 1 says a still frame cannot support any of
// them. So this rig follows ONE crest's impact event through a tracked
// sequence of clocks and reads the field, the geometry and the rendered pixels
// at each, from the cover, drone and cliff cameras, at Sewers and Second Peak.
//
// WHAT IT READS, and from where (lesson 4: measure the surface that ships):
//   * the model field, through `__pointbreak.curlProbe` row 3 — the shipped
//     SURFACE_GLSL text run as a fragment pass, so `deposit`, `roller`,
//     `rollerZ`, `rollerTau` are the shader's own numbers at the source
//     coordinate, not a JS twin;
//   * the crest the deposit should land ahead of, as the argmax of the
//     DISPLAYED height along the same transect at the impact clock (row 0),
//     so "begins at the curtain landing" is checked against measured geometry
//     and not against the formula that placed it;
//   * the rendered effect, as the pixel diff between `#roller=1` and the same
//     page with the gain set to 0 (`__pointbreak.setRoller`) at the SAME clock
//     — everything else in the frame is bit-identical, so the diff IS the
//     effect: its pixel count is the screen coverage and its centroid is the
//     on-screen trajectory.
// Three further checks the acceptance list names:
//   * DEFAULT BIT-IDENTITY: with --baseline=<pristine tree> the rig serves that
//     tree on a second port and diffs its default frame against this tree's
//     default frame at two clocks per cell. Any non-zero count fails.
//   * SEEK SAFETY: a clean load at `sim=t` must equal a clean load at another
//     clock that then seeks to t (and back). The roller is a pure function of
//     (source xz, t), so this must hold to the byte.
//   * GRACEFUL NEAR-ZERO: Sharks (xi 0.45, spilling) and Privates (bed-less,
//     xi 0.35) are probed once each; their max field over the transect and
//     their on/off pixel diff must both read ~0.
//
// OUTPUT. Frames under qa/crash-transport/<preset>-<cam>/ — before_kk.png
// (gain 0), after_kk.png (gain 1), alone_kk.png (gain 1 and #splash=0, so two
// effects cannot impersonate one event — NEXT_INVESTMENTS 2 "Rollback"), plus a
// 2.5x crop of each around the projected landing for the two stage-scale
// cameras — and one index.html contact sheet per run. measure.json carries
// every number printed. qa/ is gitignored: the generator is the artifact.
//
// Usage:
//   node scripts/measure_crash_transport.mjs                         # all cells
//   node scripts/measure_crash_transport.mjs --presets=sewers --cams=cover
//   node scripts/measure_crash_transport.mjs --baseline=/path/to/pristine/tree
//   node scripts/measure_crash_transport.mjs --no-frames               # numbers only
//   node scripts/measure_crash_transport.mjs --port=8243 --out=qa/crash-transport
// Serves the repo on its own port (scripts/serve.py) unless --base is given.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Same ancestor walk build_qa_sheets.mjs uses: inside a git worktree the
// sibling repo that owns node_modules is several levels further up.
const walk = (rel) => {
  const out = [];
  for (let d = ROOT; ; d = dirname(d)) {
    out.push(join(d, 'node_modules', rel));
    out.push(join(d, 'psychodeli-webgl-port/node_modules', rel));
    if (dirname(d) === d) break;
  }
  return out;
};
async function firstImport(cands, name) {
  for (const c of cands.filter(Boolean)) {
    try { return await import(c); } catch { /* next */ }
  }
  console.error(`${name} not found. Set PLAYWRIGHT_DIR / PNGJS_DIR.`);
  process.exit(1);
}
const { chromium } = await firstImport([process.env.PLAYWRIGHT_DIR, ...walk('playwright/index.mjs')], 'playwright');
const pngMod = await firstImport([process.env.PNGJS_DIR, ...walk('pngjs/lib/png.js')], 'pngjs');
const PNG = pngMod.PNG || pngMod.default?.PNG;

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const s = a.replace(/^--/, ''); const eq = s.indexOf('=');
  return eq < 0 ? [s, 'true'] : [s.slice(0, eq), s.slice(eq + 1)];
}));
const PORT = Number(flags.port || 8243);
const OUT = resolve(flags.out || join(ROOT, 'qa/crash-transport'));
const FRAMES = flags['no-frames'] !== 'true';
const VIEW = { width: 1000, height: 625 };
const COMMON = 'controls=0&q=high&speed=0';
const SET_ANCHOR_S = 45;
const PRESETS = (flags.presets || 'sewers,secondpeak').split(',').filter(Boolean);
const CAMS = (flags.cams || 'cover,drone,cliff').split(',').filter(Boolean);
const GAIN = Number(flags.gain || 1);
// Seconds after impact at which the sequence is read. Three or more distinct
// separations (the linearity check, lesson 3), one inside the deposit's life,
// several across the roller's, one PAST its end (must read zero).
const TAUS = [0.15, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0, 5.2];
// Two pre-impact clocks: before the crest has crossed the line at the station
// (age wraps near T) and after the crossing but before contact (the bend is
// still accelerating; the curtain is forming). Both must read zero.
const PRE = [{ id: 'pre-cross', dt: -0.8 }, { id: 'pre-contact', dt: -0.2 }];
const TRANSECT = { back: 30, fwd: 90, n: 481 };   // 0.25 m steps around the line
const CROP = { w: 320, h: 200, zoom: 2.5 };

// ---------------------------------------------------------------------------
// in-page helpers
// ---------------------------------------------------------------------------
function setup() {
  const pb = window.__pointbreak;
  const cam = pb.camera;
  const project = (x, y, z) => {
    cam.updateMatrixWorld(true);
    const v = new (cam.position.constructor)(x, y, z); v.project(cam);
    return { px: (v.x * 0.5 + 0.5) * innerWidth, py: (1 - (v.y * 0.5 + 0.5)) * innerHeight,
      inFront: v.z > -1 && v.z < 1 };
  };
  window.__ct = {
    meta: () => {
      const st = pb.state, aim = pb.aimProbe(), sa = pb.stageAlpha();
      return { T: st.T, H0: st.H0, xi: st.xi, aimX: aim.raw ? aim.raw.x : 0,
        aimZ: aim.raw ? aim.raw.z : 0, camPos: aim.camPos, cam: aim.cam,
        stage: sa ? [sa.stageLo, sa.stageHi] : null, depthMix: pb.uniforms.u_depthMix.value };
    },
    // The transect at station x around the shipped break line's SOURCE z.
    transect: (x, back, fwd, n) => {
      const zb = pb.curlProbe(x, 0, 1, 2)[0].bLine;
      const rows = pb.curlProbe(x, zb - back, zb + fwd, n) || [];
      let dep = null, rol = null, apex = null, bend = null;
      for (const r of rows) {
        if (!dep || r.deposit > dep.deposit) dep = r;
        if (!rol || r.roller > rol.roller) rol = r;
        if (r.land < 0.5 && (!apex || r.y > apex.y)) apex = r;
        // the bend's centre: where the overturn angle peaks (bandZ = 1 at the
        // phase crest), read off the shipped geometry's curl channel
        if (r.land < 0.5 && (!bend || r.curl > bend.curl)) bend = r;
      }
      // Integrated mass along the transect, metres of field: a size the
      // gates can compare across clocks without depending on the peak sample.
      const dz = (fwd + back) / (n - 1);
      let depM = 0, rolM = 0;
      for (const r of rows) { depM += r.deposit * dz; rolM += r.roller * dz; }
      const pick = (r) => (r ? { z0: r.z0, z: r.z, y: r.y, deposit: r.deposit, roller: r.roller,
        rollerZ: r.rollerZ, tau: r.rollerTau, ceil: r.ceil, foam: r.foam, pocket: r.pocket, curl: r.curl,
        impactPeak: r.impactPeak, breakMask: r.breakMask, reefWin: r.reefWin, farFade: r.farFade } : null);
      return { zb, dep: pick(dep), rol: pick(rol), apex: pick(apex), bend: pick(bend), depM, rolM,
        camPos: pb.camera.position.toArray() };
    },
    project: (x, y, z) => project(x, y, z),
    // The break-line station whose displaced surface point projects nearest
    // the frame centre: the crest THIS camera frames. The camera is fixed by
    // its preset and does not move for the measurement (lesson 11); choosing
    // which of the many stations to follow is the only framing decision here.
    // Only stations the LIFECYCLE crashes at are candidates (impact peak at
    // least a quarter of the stage's best): a station in the reef window's
    // feather or a section gap frames nothing, whatever the camera does.
    stationNearCentre: (lo, hi, step) => {
      const cand = [];
      for (let x = lo; x <= hi; x += step) {
        const zb = pb.curlProbe(x, 0, 1, 2)[0].bLine;
        const q = pb.curlProbe(x, zb, zb + 1, 2)[0];
        if (q.land > 0.5) continue;
        const sc = project(x, q.y, q.z);
        if (!sc.inFront) continue;
        const d = Math.hypot(sc.px - innerWidth / 2, sc.py - innerHeight / 2);
        cand.push({ x: +x.toFixed(2), d: +d.toFixed(0), px: +sc.px.toFixed(0), py: +sc.py.toFixed(0),
          impactPeak: q.impactPeak, breakMask: q.breakMask, reefWin: q.reefWin });
      }
      if (!cand.length) return null;
      const peakMax = Math.max(...cand.map((c) => c.impactPeak));
      const inside = (c) => c.px >= 0 && c.px <= innerWidth && c.py >= 0 && c.py <= innerHeight;
      const live = cand.filter((c) => c.impactPeak >= 0.25 * peakMax && c.breakMask > 0.5);
      // Prefer a live station INSIDE the frame; else the nearest live one, and
      // say so — a camera that frames no crashing station cannot show a crash.
      const pool = live.filter(inside).length ? live.filter(inside) : (live.length ? live : cand);
      let best = null;
      for (const c of pool) if (!best || c.d < best.d) best = c;
      best.framed = inside(best);
      best.stagePeakMax = +peakMax.toFixed(3);
      best.liveInFrame = live.filter(inside).length;
      best.stationsInFrame = cand.filter(inside).map((c) => c.x);
      return best;
    },
    setRoller: (g) => pb.setRoller(g),
    setSplash: (g) => { pb.uniforms.u_splash.value = g; },
    splash: () => pb.uniforms.u_splash.value,
  };
}

async function setClock(page, t) {
  await page.evaluate(async (tt) => {
    window.__pointbreak.setSim(tt);
    // two rAF ticks: the loop must copy simTime -> u_time and then draw.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
  // Same settle as build_qa_sheets.mjs; shorter gave stale probe reads at q=high.
  await page.waitForTimeout(120);
}
async function setGain(page, g) {
  await page.evaluate(async (gg) => {
    window.__ct.setRoller(gg);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, g);
  await page.waitForTimeout(60);
}
async function setSplash(page, g) {
  await page.evaluate(async (gg) => {
    window.__ct.setSplash(gg);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, g);
  await page.waitForTimeout(60);
}
async function coldLoad(page, base, hash) {
  // about:blank first: a hash-only goto on a warm page fires the app's own
  // needsReloadForHash -> location.reload(), which races the navigation.
  await page.goto('about:blank');
  await page.goto(`${base}web-three/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600);   // shader compile + bake + first frames
  await page.evaluate(setup);
}

// ---------------------------------------------------------------------------
// pixels
// ---------------------------------------------------------------------------
function decode(buf) { return PNG.sync.read(buf); }
// Count differing pixels and their centroid/bbox. tol is per-channel; the two
// frames are the same page at the same clock, so anything above rounding IS
// the effect under test.
function pixelDiff(a, b, tol = 4) {
  const A = decode(a), B = decode(b);
  if (A.width !== B.width || A.height !== B.height) return { count: -1 };
  let count = 0, sx = 0, sy = 0, x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1, maxDelta = 0, sumDelta = 0;
  const W = A.width, H = A.height, da = A.data, db = B.data;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
    if (d > maxDelta) maxDelta = d;
    if (d > tol) {
      count++; sx += x; sy += y; sumDelta += d;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return { count, frac: count / (W * H), cx: count ? sx / count : null, cy: count ? sy / count : null,
    bbox: count ? [x0, y0, x1, y1] : null, maxDelta, meanDelta: count ? sumDelta / count : 0 };
}
function cropPng(buf, cx, cy) {
  const src = decode(buf);
  const w = CROP.w, h = CROP.h, z = CROP.zoom;
  const sw = Math.round(w / z), sh = Math.round(h / z);
  let x0 = Math.round(cx - sw / 2), y0 = Math.round(cy - sh / 2);
  x0 = Math.max(0, Math.min(src.width - sw, x0));
  y0 = Math.max(0, Math.min(src.height - sh, y0));
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const sx = x0 + Math.floor(x / z), sy = y0 + Math.floor(y / z);
    const si = (sy * src.width + sx) * 4, di = (y * w + x) * 4;
    out.data[di] = src.data[si]; out.data[di + 1] = src.data[si + 1];
    out.data[di + 2] = src.data[si + 2]; out.data[di + 3] = 255;
  }
  return PNG.sync.write(out);
}
// |after - before| x gain, on black: the rendered effect isolated from the
// frame it sits in. An instrument image, not a claim about how it looks.
function diffPng(a, b, gain = 4) {
  const A = decode(a), B = decode(b);
  const out = new PNG({ width: A.width, height: A.height });
  for (let i = 0; i < A.width * A.height * 4; i += 4) {
    for (let c = 0; c < 3; c++) out.data[i + c] = Math.min(255, Math.abs(A.data[i + c] - B.data[i + c]) * gain);
    out.data[i + 3] = 255;
  }
  return PNG.sync.write(out);
}
const bytesEqual = (a, b) => a.length === b.length && a.equals(b);

// ---------------------------------------------------------------------------
// servers
// ---------------------------------------------------------------------------
const servers = [];
async function serve(root, port) {
  const s = spawn('python3', [join(ROOT, 'scripts/serve.py'), String(port)], { cwd: root, stdio: 'ignore' });
  servers.push(s);
  const base = `http://localhost:${port}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${base}web-three/index.html`); if (r.ok) return base; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  return base;
}
const stopServers = () => { for (const s of servers) { try { s.kill('SIGTERM'); } catch { /* gone */ } } servers.length = 0; };
process.on('exit', stopServers);
process.on('SIGINT', () => { stopServers(); process.exit(130); });

let base = flags.base;
if (!base) base = await serve(ROOT, PORT);
if (!base.endsWith('/')) base += '/';
let baselineBase = null;
if (flags.baseline) baselineBase = await serve(resolve(flags.baseline), PORT + 1);

// ---------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

if (FRAMES && !existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const out = { generated: new Date().toISOString(), gain: GAIN, taus: TAUS, view: VIEW,
  base, baseline: flags.baseline || null, cells: {}, nearZero: {}, seek: {}, bitIdentity: {} };
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '   —');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '   —');
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : '    —');

// Find the clock at which the crest currently nearest the station impacts:
// scan forward from the anchor until the deposit is born, then read the
// shader's own tau back to pin t_imp. The deposit onset gate is 0.08 s wide so
// the first non-zero sample sits within that of the true impact.
// Also records the largest overturn (curl, turns) the bend reached along the
// transect during the scan: a cell with NO event must be able to say whether
// the curtain would have drawn there at all (CURTAIN_VERT gates at 0.30 turns).
// CURTAIN_VERT's gate is smoothstep(0.30, 0.55, curl) * breakMask * (1 - land)
// * farFade; the same factors are read here so "would the curtain have drawn"
// is answered by the curtain's rule, not by curl alone.
const smooth = (a, b, v) => { const u = Math.min(Math.max((v - a) / (b - a), 0), 1); return u * u * (3 - 2 * u); };
async function findImpact(page, x) {
  let maxCurl = 0, maxGate = 0, maxPeak = 0;
  for (let t = SET_ANCHOR_S; t < SET_ANCHOR_S + 40; t += 0.25) {
    await setClock(page, t);
    const tr = await page.evaluate((a) => window.__ct.transect(a.x, a.back, a.fwd, a.n),
      { x, ...TRANSECT });
    if (tr.bend) {
      maxCurl = Math.max(maxCurl, tr.bend.curl);
      maxGate = Math.max(maxGate, smooth(0.30, 0.55, tr.bend.curl) * tr.bend.breakMask * tr.bend.farFade);
      maxPeak = Math.max(maxPeak, tr.bend.impactPeak);
    }
    if (tr.dep && tr.dep.deposit > 1e-4 && tr.dep.tau > 0 && tr.dep.tau < 0.6) {
      // tau on the deposit sample is the back-traced roller tau at that
      // sample; near the landing the drift is ~0 so it equals the deposit's.
      return { tImp: +(t - tr.dep.tau).toFixed(3), maxCurl, maxGate, maxPeak };
    }
  }
  return { tImp: null, maxCurl, maxGate, maxPeak };
}

try {
  for (const preset of PRESETS) {
    for (const cam of CAMS) {
      const id = `${preset}-${cam}`;
      const hashOn = `preset=${preset}&cam=${cam}&${COMMON}&sim=${SET_ANCHOR_S}&roller=${GAIN}`;
      await coldLoad(page, base, hashOn);
      const meta = await page.evaluate(() => window.__ct.meta());
      const near = meta.stage
        ? await page.evaluate((a) => window.__ct.stationNearCentre(a.lo, a.hi, 2), { lo: meta.stage[0], hi: meta.stage[1] })
        : null;
      const xStar = near ? near.x : +meta.aimX.toFixed(2);
      const { tImp, maxCurl, maxGate, maxPeak } = await findImpact(page, xStar);
      const cell = { preset, cam, meta, xStar, stationPick: near, tImp, maxCurlTurns: +maxCurl.toFixed(3),
        maxCurtainGate: +maxGate.toFixed(3), maxImpactPeak: +maxPeak.toFixed(3), clocks: [], frames: [] };
      out.cells[id] = cell;
      console.log(`\n== ${id}  H0 ${meta.H0} m · T ${meta.T} s · xi ${meta.xi} · station x* ${xStar}${near ? ` (line point ${near.d} px from frame centre${near.framed ? '' : ', NOT IN FRAME'}; ${near.liveInFrame} crashing station(s) in frame of ${near.stationsInFrame.length} framed)` : ' (aim centroid)'}`
        + ` · impact t ${tImp === null ? 'NONE in 40 s' : tImp.toFixed(2) + ' s'}`
        + ` · max overturn ${maxCurl.toFixed(3)} turns, curtain gate ${maxGate.toFixed(3)}, lifecycle impact peak ${maxPeak.toFixed(3)}`);
      if (tImp === null) {
        console.log(maxGate < 0.01
          ? '  no event, and the curtain gate never opened here either: the contact proxy agrees with the curtain (nothing lands, nothing is deposited)'
          : `  NO EVENT although the curtain gate opened to ${maxGate.toFixed(3)}: the contact proxy DISAGREES with the curtain here`);
        continue;
      }

      // The crest at impact, from displayed geometry: the apex along the
      // transect at t_imp (the bend has just released; the apex is the lip).
      await setClock(page, tImp);
      const atImp = await page.evaluate((a) => window.__ct.transect(a.x, a.back, a.fwd, a.n), { x: xStar, ...TRANSECT });
      cell.crestAtImpact = atImp.apex;
      cell.bendAtImpact = atImp.bend;
      cell.zb = atImp.zb;

      const dir = FRAMES ? join(OUT, id) : null;
      if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
      const clocks = [...PRE.map((p) => ({ id: p.id, t: +(tImp + p.dt).toFixed(3), tau: p.dt })),
        ...TAUS.map((tau) => ({ id: `tau${tau.toFixed(2)}`, t: +(tImp + tau).toFixed(3), tau }))];

      console.log('  clock        tau     deposit  at z(src)   roller   centre z   dz(m)  dz/tau   mass(m)  px diff   frac%  meanΔ  diff centroid');
      let k = 0, origin = null;
      for (const c of clocks) {
        await setClock(page, c.t);
        const tr = await page.evaluate((a) => window.__ct.transect(a.x, a.back, a.fwd, a.n), { x: xStar, ...TRANSECT });
        const rec = { ...c, zb: tr.zb, deposit: tr.dep?.deposit ?? 0,
          depositZ: (tr.dep && tr.dep.deposit > 1e-4) ? tr.dep.z0 : null,
          roller: tr.rol?.roller ?? 0, rollerZ: (tr.rol && tr.rol.roller > 1e-4) ? tr.rol.rollerZ : null,
          rollerTau: tr.rol?.tau ?? 0, depM: tr.depM, rolM: tr.rolM, camPos: tr.camPos, apex: tr.apex };
        if (c.tau > 0 && origin === null && rec.deposit > 1e-4) origin = rec.depositZ;
        rec.dz = (rec.rollerZ !== null && origin !== null) ? rec.rollerZ - origin : null;
        rec.dzPerTau = (rec.dz !== null && c.tau > 0) ? rec.dz / c.tau : null;

        // Screen: the effect is the on/off pixel diff at this exact clock.
        let shotOn = null, shotOff = null, shotAlone = null, diff = null;
        if (FRAMES || true) {
          shotOn = await page.screenshot();
          await setGain(page, 0);
          shotOff = await page.screenshot();
          await setGain(page, GAIN);
          diff = pixelDiff(shotOn, shotOff);
          rec.px = diff.count; rec.frac = diff.frac; rec.diffCx = diff.cx; rec.diffCy = diff.cy; rec.bbox = diff.bbox;
          rec.meanDelta = +diff.meanDelta.toFixed(1); rec.maxDelta = diff.maxDelta;
          if (FRAMES) {
            await setSplash(page, 0);
            shotAlone = await page.screenshot();
            await setSplash(page, 1);
          }
        }
        // Where the landing origin projects, for the crop and the trajectory.
        if (origin !== null && tr.rol) {
          const worldZ = tr.rol.z, worldY = tr.rol.y;
          rec.screen = await page.evaluate((a) => window.__ct.project(a.x, a.y, a.z), { x: xStar, y: worldY, z: worldZ });
        }
        if (FRAMES) {
          const kk = String(k).padStart(2, '0');
          const stem = `${kk}_${c.id}`;
          writeFileSync(join(dir, `before_${stem}.png`), shotOff);
          writeFileSync(join(dir, `after_${stem}.png`), shotOn);
          writeFileSync(join(dir, `alone_${stem}.png`), shotAlone);
          writeFileSync(join(dir, `diff_${stem}.png`), diffPng(shotOn, shotOff));
          const frame = { k, id: c.id, t: c.t, tau: c.tau, before: `before_${stem}.png`, after: `after_${stem}.png`, alone: `alone_${stem}.png`, diff: `diff_${stem}.png`,
            hash: `preset=${preset}&cam=${cam}&${COMMON}&sim=${c.t}&roller=${GAIN}` };
          if (cam !== 'cover') {
            // Crops are written after the row: their centre is the projected
            // roller at the first post-impact clock, one centre for the whole
            // row. A pixel operation on captured frames — the camera does not
            // move (lesson 11).
            frame.crop = true;
            frame.shots = { before: shotOff, after: shotOn, alone: shotAlone, stem };
            if (!cell.cropCentre && rec.screen && rec.screen.inFront && c.tau > 0)
              cell.cropCentre = { cx: rec.screen.px, cy: rec.screen.py };
          }
          cell.frames.push(frame);
        }
        cell.clocks.push(rec);
        console.log(`  ${c.id.padEnd(11)} ${f2(c.tau).padStart(5)}  ${f3(rec.deposit).padStart(8)}  ${f1(rec.depositZ).padStart(9)}`
          + `  ${f3(rec.roller).padStart(7)}  ${f1(rec.rollerZ).padStart(9)}  ${f1(rec.dz).padStart(6)}  ${f2(rec.dzPerTau).padStart(6)}`
          + `  ${f2(rec.depM + rec.rolM).padStart(7)}  ${String(rec.px ?? '—').padStart(7)}  ${rec.frac !== undefined ? (100 * rec.frac).toFixed(3).padStart(6) : '     —'}  ${String(rec.meanDelta ?? '—').padStart(5)}`
          + `  ${rec.diffCx !== null && rec.diffCx !== undefined ? `(${rec.diffCx.toFixed(0)}, ${rec.diffCy.toFixed(0)})` : '—'}`);
        k++;
      }

      if (FRAMES) {
        for (const f of cell.frames) {
          if (!f.shots) continue;
          const cc = cell.cropCentre || { cx: VIEW.width / 2, cy: VIEW.height / 2 };
          for (const name of ['before', 'after', 'alone'])
            writeFileSync(join(dir, `crop_${name}_${f.shots.stem}.png`), cropPng(f.shots[name], cc.cx, cc.cy));
          delete f.shots;
        }
      }

      // ---- gates ----
      const pre = cell.clocks.filter((c) => c.tau < 0);
      const post = cell.clocks.filter((c) => c.tau > 0 && c.tau < 5);
      const end = cell.clocks.find((c) => c.tau >= 5);
      const centres = post.filter((c) => c.rollerZ !== null);
      const gates = {};
      // The FIELD at the tracked station is what must be absent before contact.
      // The whole-frame on/off pixel diff at the pre clocks is NOT zero and is
      // not expected to be: the head has already passed the stations a few
      // metres up-line and their events are in flight — the roller is a
      // continuous field along the line, not one puff per wave. Their pixels
      // are reported (prePx) so a reader can see the size, not gated on.
      gates.absentPreBreak = pre.every((c) => c.deposit < 1e-4 && c.roller < 1e-4);
      gates.prePx = pre.map((c) => c.px ?? 0);
      // ORIGIN. The deposit must be born within one clock step of impact, at
      // CURT_REACH*ceil shoreward of the crest. Two measured crests to compare
      // against: the bend's centre (argmax of the overturn angle along the
      // transect at impact — bandZ peaks at the phase crest, which is the same
      // source point the curtain hangs its tip from) and the height apex (the
      // forward pitch and the bend move the tallest water seaward of the phase
      // crest, so this one is expected to read a few metres larger).
      const first = post.find((c) => c.deposit > 1e-4);
      const apex = cell.crestAtImpact, bend = cell.bendAtImpact;
      gates.originAheadOfBendM = first && bend ? +(first.depositZ - bend.z0).toFixed(2) : null;
      gates.originAheadOfApexM = first && apex ? +(first.depositZ - apex.z0).toFixed(2) : null;
      gates.expectedReachM = bend && bend.ceil !== null ? +(0.9 * bend.ceil).toFixed(2) : null;
      gates.bendCurlTurns = bend ? +bend.curl.toFixed(3) : null;
      // Tolerance: the argmax-curl centre is a PROXY for the phase crest the
      // curtain hangs from — th = dyB*kEff, and dyB peaks at the pitched height
      // apex seaward of the phase crest, so the proxy reads seaward by a
      // fraction of the bend band. Measured at Sewers: 1.6 m against a 3.4 m
      // apex offset. A third of the ceiling bounds that without absorbing a
      // wrong landing (a deposit at the bore front would miss by ~10 m).
      const tolM = gates.expectedReachM !== null ? Math.max(1.0, gates.expectedReachM / 2.7) : 1.0;
      gates.originTolM = +tolM.toFixed(2);
      gates.beginsAtLanding = first !== undefined && first.tau <= 0.2
        && gates.originAheadOfBendM !== null && gates.expectedReachM !== null
        && gates.originAheadOfBendM >= gates.expectedReachM - 1.0
        && gates.originAheadOfBendM <= gates.expectedReachM + tolM;
      gates.monotonic = centres.length >= 3 && centres.every((c, i) => i === 0 || c.rollerZ > centres[i - 1].rollerZ);
      const rates = centres.filter((c) => c.tau >= 0.5).map((c) => c.dzPerTau).filter(Number.isFinite);
      gates.rateMean = rates.length ? +(rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(2) : null;
      gates.rateSpread = rates.length >= 3 ? +(Math.max(...rates) - Math.min(...rates)).toFixed(2) : null;
      gates.scalesWithTime = rates.length >= 3 && gates.rateSpread !== null && gates.rateSpread < 0.25 * Math.abs(gates.rateMean);
      // decay: mass falls after its onset peak and is zero past ROLLER_END_S
      const masses = post.map((c) => c.depM + c.rolM);
      const peakI = masses.indexOf(Math.max(...masses));
      gates.decays = masses.slice(peakI).every((m, i, a) => i === 0 || m <= a[i - 1] + 1e-6);
      gates.zeroAtEnd = end ? end.deposit < 1e-4 && end.roller < 1e-4 : null;
      // no teleport: consecutive centres never jump more than 1.5x the transport
      gates.noTeleport = centres.every((c, i) => i === 0
        || Math.abs(c.rollerZ - centres[i - 1].rollerZ) <= 1.5 * Math.abs(gates.rateMean || 4.1) * (c.tau - centres[i - 1].tau) + 0.5);
      gates.coverageMaxFrac = Math.max(...cell.clocks.map((c) => c.frac ?? 0));
      gates.coverageMaxPx = Math.max(...cell.clocks.map((c) => c.px ?? 0));
      cell.gates = gates;
      console.log(`  gates: pre-break field absent ${gates.absentPreBreak} (up-line events in frame: ${gates.prePx.join('/')} px), begins at landing ${gates.beginsAtLanding}`
        + ` (deposit ${gates.originAheadOfBendM} m ahead of the bend centre [curl ${gates.bendCurlTurns} turns], ${gates.originAheadOfApexM} m ahead of the height apex; 0.9*ceil = ${gates.expectedReachM} m, tol +${gates.originTolM}),`
        + ` monotonic ${gates.monotonic}, rate ${gates.rateMean} m/s spread ${gates.rateSpread} -> scales ${gates.scalesWithTime},`
        + ` decays ${gates.decays}, zero at end ${gates.zeroAtEnd}, no teleport ${gates.noTeleport},`
        + ` peak coverage ${(100 * gates.coverageMaxFrac).toFixed(3)}% (${gates.coverageMaxPx} px)`);

      // ---- seek safety (cover only: one camera is enough for a byte test) ----
      if (cam === CAMS[0]) {
        const tk = +(tImp + 1.0).toFixed(3);
        await coldLoad(page, base, `preset=${preset}&cam=${cam}&${COMMON}&sim=${tk}&roller=${GAIN}`);
        const clean = await page.screenshot();
        await coldLoad(page, base, `preset=${preset}&cam=${cam}&${COMMON}&sim=${SET_ANCHOR_S}&roller=${GAIN}`);
        await setClock(page, tk + 7.3);
        await setClock(page, tk);
        const seeked = await page.screenshot();
        const d = pixelDiff(clean, seeked);
        out.seek[id] = { t: tk, bytesEqual: bytesEqual(clean, seeked), pxDiff: d.count };
        console.log(`  seek safety at t=${tk}: clean load vs seek-elsewhere-then-seek-back -> `
          + `${bytesEqual(clean, seeked) ? 'byte-identical' : `${d.count} px differ`}`);
      }

      // ---- default bit-identity against the pristine tree ----
      // Two clean loads of the SAME tree are the control: whatever they differ
      // by is load-to-load GPU noise, and the baseline comparison is read
      // against that floor rather than against zero (lesson 2: prove the probe).
      if (baselineBase) {
        const res = [];
        for (const t of [SET_ANCHOR_S, +(tImp + 1.0).toFixed(3)]) {
          const hash = `preset=${preset}&cam=${cam}&${COMMON}&sim=${t}`;
          await coldLoad(page, base, hash);
          const now = await page.screenshot();
          await coldLoad(page, base, hash);
          const again = await page.screenshot();
          await coldLoad(page, baselineBase, hash);
          const was = await page.screenshot();
          const d = pixelDiff(now, was, 0), dSelf = pixelDiff(now, again, 0);
          res.push({ t, bytesEqual: bytesEqual(now, was), pxDiff: d.count, maxDelta: d.maxDelta,
            selfBytesEqual: bytesEqual(now, again), selfPxDiff: dSelf.count, selfMaxDelta: dSelf.maxDelta });
        }
        out.bitIdentity[id] = res;
        console.log(`  default vs baseline: ${res.map((r) => `t=${r.t} ${r.bytesEqual ? 'byte-identical' : `${r.pxDiff} px differ (max ${r.maxDelta} levels)`}`
          + ` [same-tree control: ${r.selfBytesEqual ? 'byte-identical' : `${r.selfPxDiff} px (max ${r.selfMaxDelta})`}]`).join(' · ')}`);
      }
    }
  }

  // ---- graceful near-zero: spilling and bed-less ----
  for (const preset of ['sharks', 'privates']) {
    await coldLoad(page, base, `preset=${preset}&cam=drone&${COMMON}&sim=${SET_ANCHOR_S}&roller=${GAIN}`);
    const meta = await page.evaluate(() => window.__ct.meta());
    let maxField = 0, maxPx = 0;
    for (let t = SET_ANCHOR_S; t < SET_ANCHOR_S + meta.T; t += meta.T / 8) {
      await setClock(page, t);
      const tr = await page.evaluate((a) => window.__ct.transect(a.x, a.back, a.fwd, a.n), { x: meta.aimX, ...TRANSECT });
      maxField = Math.max(maxField, tr.dep?.deposit ?? 0, tr.rol?.roller ?? 0);
      const on = await page.screenshot(); await setGain(page, 0);
      const off = await page.screenshot(); await setGain(page, GAIN);
      maxPx = Math.max(maxPx, pixelDiff(on, off).count);
    }
    out.nearZero[preset] = { xi: meta.xi, depthMix: meta.depthMix, maxField, maxPx };
    console.log(`\n== ${preset} (xi ${meta.xi}, depthMix ${meta.depthMix}): max field ${maxField.toExponential(2)}, max on/off px ${maxPx}`);
  }
} finally {
  await browser.close();
  stopServers();
}

// ---------------------------------------------------------------------------
// contact sheet
// ---------------------------------------------------------------------------
if (FRAMES) {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rows = [];
  for (const [id, cell] of Object.entries(out.cells)) {
    if (!cell.frames.length) continue;
    const g = cell.gates || {};
    const head = cell.frames.map((f) => `<th>${esc(f.id)}<br><small>t ${f.t} s · τ ${f.tau > 0 ? '+' : ''}${f.tau} s</small></th>`).join('');
    const line = (label, key) => `<tr><th>${label}</th>${cell.frames.map((f) => `<td><a href="${id}/${f[key]}"><img src="${id}/${f[key]}" loading="lazy"></a></td>`).join('')}</tr>`;
    const crop = (label, key) => (cell.frames[0].crop
      ? `<tr><th>${label}<br><small>${CROP.zoom}× crop</small></th>${cell.frames.map((f) => `<td><img class="crop" src="${id}/crop_${key}_${f.after.replace(/^after_/, '').replace(/\.png$/, '')}.png" loading="lazy"></td>`).join('')}</tr>`
      : '');
    const nums = `<tr><th>field</th>${cell.clocks.map((c) => `<td class="num">dep ${c.deposit.toFixed(2)} · roll ${c.roller.toFixed(2)}<br>centre ${c.rollerZ === null ? '—' : c.rollerZ.toFixed(1) + ' m'}${c.dz !== null ? ` · Δz ${c.dz.toFixed(1)}` : ''}<br>on/off ${c.px} px (${(100 * (c.frac || 0)).toFixed(2)}%) · mean Δ ${c.meanDelta} max ${c.maxDelta}</td>`).join('')}</tr>`;
    rows.push(`<section><h2>${esc(id)} <small>H₀ ${cell.meta.H0} m · T ${cell.meta.T} s · ξ ${cell.meta.xi} · station x* ${cell.xStar} m · impact t ${cell.tImp} s</small></h2>
<p class="gates">pre-break field absent <b>${g.absentPreBreak}</b> (up-line events in frame at the pre clocks: ${(g.prePx || []).join('/')} px) · begins at landing <b>${g.beginsAtLanding}</b> (deposit ${g.originAheadOfBendM} m ahead of the bend centre, ${g.originAheadOfApexM} m ahead of the height apex; 0.9·ceil = ${g.expectedReachM} m) · monotonic <b>${g.monotonic}</b> · rate ${g.rateMean} m/s (spread ${g.rateSpread}) → scales with time <b>${g.scalesWithTime}</b> · decays <b>${g.decays}</b> · zero at τ 5.2 <b>${g.zeroAtEnd}</b> · no teleport <b>${g.noTeleport}</b> · peak coverage ${(100 * (g.coverageMaxFrac || 0)).toFixed(3)}%</p>
<div class="scroll"><table><tr><th></th>${head}</tr>${line('before<br><small>roller=0</small>', 'before')}${line('after<br><small>roller=' + GAIN + '</small>', 'after')}${line('alone<br><small>roller=' + GAIN + ' splash=0</small>', 'alone')}${line('|after − before| × 4<br><small>instrument</small>', 'diff')}${crop('before', 'before')}${crop('after', 'after')}${crop('alone', 'alone')}${nums}</table></div></section>`);
  }
  const html = `<!doctype html><meta charset="utf-8"><title>crash transport — tracked sequences</title>
<style>body{font:14px system-ui;margin:20px;background:#111;color:#ddd}h1{font-size:20px}h2{font-size:16px;margin:28px 0 6px}small{color:#999;font-weight:normal}
.scroll{overflow-x:auto}table{border-collapse:collapse}th{font-weight:normal;text-align:left;padding:4px 6px;color:#bbb;vertical-align:top;white-space:nowrap}td{padding:2px}
img{width:250px;display:block}img.crop{width:250px}td.num{font:12px ui-monospace,monospace;color:#aaa;vertical-align:top;white-space:nowrap;padding:6px}
.gates{color:#bbb;max-width:120ch}b{color:#fff}p.note{max-width:100ch;color:#aaa}</style>
<h1>Transported crash (#roller=${GAIN}) — one tracked crest, ${TAUS.length} clocks after impact plus two before</h1>
<p class="note">Each column is ONE clock; the three frame rows are the same page at that clock with the roller gain at 0, at ${GAIN}, and at ${GAIN} with #splash=0 so the shipped spray cannot stand in for the transported mass. Nothing else in the frame differs between rows. Generated ${out.generated} by scripts/measure_crash_transport.mjs; numbers in measure.json. Not promoted — judge by eye, in sequence, not from one column.</p>
${rows.join('\n')}`;
  writeFileSync(join(OUT, 'index.html'), html);
  writeFileSync(join(OUT, 'measure.json'), JSON.stringify(out, null, 2));
  console.log(`\n-> ${join(OUT, 'index.html')}`);
} else if (flags.json) {
  writeFileSync(resolve(flags.json), JSON.stringify(out, null, 2));
  console.log(`\n-> ${resolve(flags.json)}`);
}
if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
