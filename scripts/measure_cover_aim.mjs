// Cover-camera aim acceptance: does the close-up frame the break head?
//
// WHY THIS EXISTS. The Cover camera aimed at the baked line's action CENTROID
// — the mean (x, z) of the line over the stage. On a curved line that mean is
// not ON the line: at Sewers it sits 65 m shoreward of the line at its own x,
// so the shot framed a section gap from ~80 m and the crash-transport rig read
// 0.07 % cover coverage against 0.32 % from the cliff (TODO 2026-09-01). This
// rig measures the framing directly: where the live break head is, and where
// it lands in the frame, over one wave period around the set peak.
//
// WHAT IT READS (lesson 4: the surface that ships, not a twin of it):
//   * the break head, per clock, as the argmax of the shipped `pocket` channel
//     sampled ON the shader's own break line (`curlProbe` rows 1-2: pocket is
//     crestNear*bell(d)*env^2*reef and d = 0 on the line, so it IS the crest-
//     proximity bell — the sheets' breakpoint marker uses the same fact);
//     stations inside a section gap (breakMask 0) are not candidates, because
//     the lifecycle fires no crash there. The head's world point is the
//     DISPLACED surface at that source (row 0), i.e. the crest top.
//   * the frame, through THREE's own projection of the page camera (`v.project`)
//     — the live camera for the shipped arm, and a CLONE of it re-posed for each
//     hypothetical aim, so candidates are scored with the same fov/aspect/near
//     the page renders with, not a re-derived pinhole.
//
// THE METRICS, per (preset, day, camera):
//   * at the set peak (t = SET_ANCHOR_S): angular error to the head (deg), its
//     NDC offset from frame centre, and the eye->head distance in metres;
//   * over one period (t = 45 + k*T/N): the fraction of clocks at which the
//     head projects into the MIDDLE THIRD of the frame (|ndc| <= 1/3 both axes,
//     in front of the eye), and the fraction in frame at all. A still camera
//     cannot hold a travelling head centred for a whole period — the head sweeps
//     the line once per T — so this fraction is bounded by geometry; what it
//     tells apart is "frames a crashing station" from "frames nothing".
//
// The candidate aims scored alongside the live camera (each posed with the
// Cover rig's own geometry — +standoff down-point, +0.55*standoff shoreward,
// eye 2.4 m, aim 3.2 m above still water):
//   centroid    the pre-fix formula (the probe proof: on the pristine tree it
//               must agree with `live` unless the world clamp moved the eye)
//   lineAtCx    the line point at the centroid's x
//   headAt45    the measured head at the set peak, on the line
//   takeoff     where a crest first meets the line (takeoffProfile)
//
// Usage:
//   node scripts/measure_cover_aim.mjs --label=before --root=/pristine/tree
//   node scripts/measure_cover_aim.mjs --label=after
//   node scripts/measure_cover_aim.mjs --label=after --compare=qa/cover-aim/before
//   flags: --presets=a,b  --days=card,small  --nclock=16  --port=8251
//          --out=qa/cover-aim  --no-frames  --base=http://host:port/
// Serves --root (default: this tree) on --port via scripts/serve.py.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const walk = (rel) => {
  const out = [];
  for (let d = ROOT; ; d = dirname(d)) {
    out.push(join(d, 'node_modules', rel));
    out.push(join(d, 'psychodeli-webgl-port/node_modules', rel));
    if (dirname(d) === d) break;
  }
  return out;
};
let chromium;
for (const c of [process.env.PLAYWRIGHT_DIR, ...walk('playwright/index.mjs')].filter(Boolean)) {
  try { ({ chromium } = await import(c)); break; } catch { /* next */ }
}
if (!chromium) { console.error('playwright not found. Set PLAYWRIGHT_DIR=/path/to/playwright/index.mjs'); process.exit(1); }

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const s = a.replace(/^--/, ''); const eq = s.indexOf('=');
  return eq < 0 ? [s, 'true'] : [s.slice(0, eq), s.slice(eq + 1)];
}));
const LABEL = flags.label || 'run';
const PORT = Number(flags.port || 8251);
const OUT = resolve(flags.out || join(ROOT, 'qa/cover-aim'), LABEL);
const FRAMES = flags['no-frames'] !== 'true';
const VIEW = { width: 1000, height: 625 };
const COMMON = 'cam=cover&controls=0&q=high&speed=0';
const SET_ANCHOR_S = 45;
const NCLOCK = Number(flags.nclock || 16);
const PRESETS = (flags.presets || 'sewers,firstpeak,secondpeak,jacks,thehook,sharks,privates').split(',').filter(Boolean);
const DAYS = (flags.days || 'card,small').split(',').filter(Boolean);
const STEP_M = 2;
// Cover rig geometry, mirrored from main.js for the hypothetical cameras. If
// COVER_STANDOFF_M / COVER_EYE_M / COVER_AIM_Y_M move there, move them here.
const COVER = { standoff: 16, eye: 2.4, aimY: 3.2 };
// Frames for the eye: the set peak, and one second on (the crash has landed).
const SHOT_CLOCKS = [SET_ANCHOR_S, SET_ANCHOR_S + 1.0];

// ---------------------------------------------------------------------------
// in-page helpers
// ---------------------------------------------------------------------------
function setup(cover) {
  const pb = window.__pointbreak;
  const V3 = pb.camera.position.constructor;
  const clamp1 = (v) => Math.min(Math.max(v, -1), 1);
  const score = (cam, x, y, z) => {
    cam.updateMatrixWorld(true);
    const v = new V3(x, y, z); v.project(cam);
    const fwd = cam.getWorldDirection(new V3());
    const to = new V3(x, y, z).sub(cam.position);
    const dist = to.length();
    const deg = Math.acos(clamp1(fwd.dot(to.normalize()))) * 180 / Math.PI;
    const inFront = v.z > -1 && v.z < 1;
    return { nx: v.x, ny: v.y, deg, dist, inFront,
      inFrame: inFront && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1,
      midThird: inFront && Math.abs(v.x) <= 1 / 3 && Math.abs(v.y) <= 1 / 3 };
  };
  // A clone of the page camera re-posed with the Cover rig's geometry around a
  // hypothetical aim point: same fov, aspect, near, far as the shipped shot.
  const posed = (ax, az) => {
    const c = pb.camera.clone();
    c.position.set(ax + cover.standoff, cover.eye, az + cover.standoff * 0.55);
    c.lookAt(ax, cover.aimY, az);
    c.updateMatrixWorld(true);
    return c;
  };
  window.__ca = {
    meta: () => {
      const st = pb.state, aim = pb.aimProbe(), sa = pb.stageAlpha();
      const tp = pb.takeoffProfile ? pb.takeoffProfile(1) : null;
      return { T: st.T, H0: st.H0, xi: st.xi, preset: st.preset, day: pb.day(),
        centroid: aim.raw, coverAim: aim.coverAim || null, camPos: aim.camPos, target: aim.target,
        fov: pb.camera.fov, aspect: pb.camera.aspect,
        stage: sa ? [sa.stageLo, sa.stageHi] : null, takeoffX: tp ? tp.takeoffX : null };
    },
    // The shader's own break line (with sections) at each stage station, once.
    lineScan: (lo, hi, step) => {
      const out = [];
      for (let x = lo; x <= hi; x += step) {
        const q = pb.curlProbe(x, 0, 1, 2)[0];
        out.push({ x, zb: q.bLine, mask: q.breakMask, reef: q.reefWin });
      }
      return out;
    },
    // The head at the current clock: pocket along the line, argmax over
    // non-gap stations, plus every separate local maximum (other crests).
    headScan: (line) => {
      const rows = [];
      for (const s of line) {
        const q = pb.curlProbe(s.x, s.zb, s.zb + 1, 2)[0];
        if (q.land > 0.5) continue;
        rows.push({ x: s.x, zb: s.zb, mask: s.mask, y: q.y, z: q.z, pocket: q.pocket, crest: q.crest, brk: q.brk, foam: q.foam });
      }
      const live = rows.filter((r) => r.mask > 0.5);
      if (!live.length) return { head: null, heads: [], rows };
      let head = live[0];
      for (const r of live) if (r.pocket > head.pocket) head = r;
      const heads = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (r.mask <= 0.5 || r.pocket < 0.35 * head.pocket) continue;
        const l = rows[i - 1], n = rows[i + 1];
        if ((l && l.pocket > r.pocket) || (n && n.pocket > r.pocket)) continue;
        if (heads.length && Math.abs(heads[heads.length - 1].x - r.x) < 12) continue;
        heads.push(r);
      }
      return { head, heads, rows };
    },
    // Score world point(s) against the live camera and each hypothetical aim.
    score: (pts, aims) => {
      const cams = { live: pb.camera };
      for (const [k, a] of Object.entries(aims)) if (a) cams[k] = posed(a.x, a.z);
      const out = {};
      for (const [k, c] of Object.entries(cams)) out[k] = pts.map((p) => (p ? score(c, p.x, p.y, p.z) : null));
      return out;
    },
    camOf: (a) => { const c = posed(a.x, a.z); return { pos: c.position.toArray(), target: [a.x, cover.aimY, a.z] }; },
  };
}

async function setClock(page, t) {
  await page.evaluate(async (tt) => {
    window.__pointbreak.setSim(tt);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
  await page.waitForTimeout(120);
}
async function coldLoad(page, base, hash) {
  await page.goto('about:blank');
  await page.goto(`${base}web-three/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await page.evaluate(setup, COVER);
}

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

const SERVED = resolve(flags.root || ROOT);
let base = flags.base;
if (!base) base = await serve(SERVED, PORT);
if (!base.endsWith('/')) base += '/';

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
const out = { label: LABEL, served: SERVED, generated: new Date().toISOString(), view: VIEW, nclock: NCLOCK, cover: COVER, cells: [] };
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : '—');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : '—');
const pct = (v) => (Number.isFinite(v) ? (100 * v).toFixed(0) + '%' : '—');

try {
  for (const preset of PRESETS) {
    for (const day of DAYS) {
      const dayQ = day === 'card' ? '' : `&day=${day}`;
      const hash = `preset=${preset}${dayQ}&${COMMON}&sim=${SET_ANCHOR_S}`;
      await coldLoad(page, base, hash);
      const meta = await page.evaluate(() => window.__ca.meta());
      const cell = { preset, day, hash, meta, clocks: [], candidates: {}, frames: [] };
      out.cells.push(cell);
      if (!meta.stage || !meta.centroid) {
        console.log(`\n== ${preset}/${day}: no bake (authored fallback) — skipped`);
        continue;
      }
      const line = await page.evaluate((a) => window.__ca.lineScan(a.lo, a.hi, a.step),
        { lo: meta.stage[0], hi: meta.stage[1], step: STEP_M });
      const zbAt = (x) => {
        let best = line[0];
        for (const s of line) if (Math.abs(s.x - x) < Math.abs(best.x - x)) best = s;
        return best.zb;
      };
      // ---- head trajectory over one period from the set peak ----
      const T = meta.T;
      const pts = [];
      for (let k = 0; k < NCLOCK; k++) {
        const t = +(SET_ANCHOR_S + k * T / NCLOCK).toFixed(3);
        await setClock(page, t);
        const h = await page.evaluate((l) => window.__ca.headScan(l), line);
        pts.push({ k, t, head: h.head, heads: h.heads });
      }
      const head45 = pts[0].head;
      // ---- candidate aims (time-independent) ----
      // A LEAD down-line of the set-peak head: the head at t=45 then sits up-line
      // of the aim, approaching, and reaches the aim L/Vp later. Snaps to the
      // nearest non-gap station at or beyond the lead, inside the stage.
      const leadAim = (L) => {
        if (!head45) return null;
        const want = head45.x + L;
        const cands = line.filter((s) => s.mask > 0.5 && s.x >= want - STEP_M / 2);
        const s = cands.length ? cands[0] : line.filter((s) => s.mask > 0.5).pop();
        return s ? { x: s.x, z: s.zb } : null;
      };
      const aims = {
        centroid: { x: meta.centroid.x, z: meta.centroid.z },
        lineAtCx: { x: meta.centroid.x, z: zbAt(meta.centroid.x) },
        headAt45: head45 ? { x: head45.x, z: head45.zb } : null,
        head45L8: leadAim(8), head45L16: leadAim(16), head45L24: leadAim(24),
        takeoff: Number.isFinite(meta.takeoffX) ? { x: meta.takeoffX, z: zbAt(meta.takeoffX) } : null,
      };
      if (meta.coverAim) aims.coverAimRaw = { x: meta.coverAim.x, z: meta.coverAim.z };
      const scored = await page.evaluate((a) => window.__ca.score(a.pts, a.aims),
        { pts: pts.map((p) => (p.head ? { x: p.head.x, y: p.head.y, z: p.head.z } : null)), aims });
      // any-head variant: is ANY crossing crest in the middle third at this clock
      const anyPts = pts.map((p) => p.heads.map((h) => ({ x: h.x, y: h.y, z: h.z })));
      const anyScored = {};
      for (let k = 0; k < pts.length; k++) {
        const s = await page.evaluate((a) => window.__ca.score(a.pts, a.aims), { pts: anyPts[k], aims });
        for (const [cam, arr] of Object.entries(s)) (anyScored[cam] ||= []).push(arr.some((r) => r && r.midThird));
      }
      for (const [cam, arr] of Object.entries(scored)) {
        const valid = arr.filter(Boolean);
        const at45 = arr[0];
        cell.candidates[cam] = {
          aim: cam === 'live' ? null : aims[cam],
          cam: cam === 'live' ? { pos: meta.camPos, target: meta.target } : await page.evaluate((a) => window.__ca.camOf(a), aims[cam]),
          deg45: at45 ? at45.deg : null, ndc45: at45 ? [at45.nx, at45.ny] : null, dist45: at45 ? at45.dist : null,
          inFront45: at45 ? at45.inFront : null,
          midThirdFrac: valid.length ? valid.filter((r) => r.midThird).length / valid.length : null,
          inFrameFrac: valid.length ? valid.filter((r) => r.inFrame).length / valid.length : null,
          anyHeadMidThirdFrac: anyScored[cam] ? anyScored[cam].filter(Boolean).length / anyScored[cam].length : null,
          meanDist: valid.length ? valid.reduce((s, r) => s + r.dist, 0) / valid.length : null,
          perClock: arr,
        };
      }
      cell.clocks = pts.map((p) => ({ k: p.k, t: p.t,
        head: p.head ? { x: p.head.x, y: +p.head.y.toFixed(2), z: +p.head.z.toFixed(2), zb: +p.head.zb.toFixed(2), pocket: +p.head.pocket.toFixed(3) } : null,
        nHeads: p.heads.length, headsX: p.heads.map((h) => h.x) }));

      const c = cell.candidates;
      console.log(`\n== ${preset}/${day}  T ${T} s · H0 ${meta.H0} m · centroid (${f1(meta.centroid.x)}, ${f1(meta.centroid.z)}) · line at cx z ${f1(aims.lineAtCx.z)} (${f1(meta.centroid.z - aims.lineAtCx.z)} m shoreward of it)`
        + ` · head at t=45: ${head45 ? `x ${head45.x} z ${f1(head45.z)} pocket ${f2(head45.pocket)}` : 'none'} · takeoff x ${f1(meta.takeoffX)}`);
      console.log(`   head x over the period: ${pts.map((p) => (p.head ? p.head.x : '—')).join(' ')}`);
      console.log('   camera        deg@45   ndc@45          dist@45  midThird  anyMid  inFrame  meanDist');
      for (const [cam, r] of Object.entries(c)) {
        console.log(`   ${cam.padEnd(12)} ${f1(r.deg45).padStart(6)}   ${r.ndc45 ? `(${f2(r.ndc45[0])}, ${f2(r.ndc45[1])})`.padEnd(15) : '—'.padEnd(15)}`
          + ` ${f1(r.dist45).padStart(6)} m  ${pct(r.midThirdFrac).padStart(6)}   ${pct(r.anyHeadMidThirdFrac).padStart(5)}   ${pct(r.inFrameFrac).padStart(5)}   ${f1(r.meanDist).padStart(6)} m`);
      }
      // ---- frames for the eye: the live camera at the set peak and +1 s ----
      if (FRAMES) {
        for (const t of SHOT_CLOCKS) {
          await setClock(page, t);
          const name = `${preset}_${day}_t${t.toFixed(1)}.png`;
          await page.screenshot({ path: join(OUT, name) });
          cell.frames.push({ t, file: name, hash: `preset=${preset}${dayQ}&${COMMON}&sim=${t}` });
        }
      }
    }
  }
} finally {
  await browser.close();
  stopServers();
}

writeFileSync(join(OUT, 'measure.json'), JSON.stringify(out, null, 1));

// ---- summary table: live camera per cell ----
console.log(`\n${LABEL}: live Cover camera, per cell`);
console.log('preset      day    deg@45  dist@45  midThird  anyMid  inFrame');
for (const cell of out.cells) {
  const r = cell.candidates.live;
  if (!r) { console.log(`${cell.preset.padEnd(11)} ${cell.day.padEnd(6)} (no bake)`); continue; }
  console.log(`${cell.preset.padEnd(11)} ${cell.day.padEnd(6)} ${f1(r.deg45).padStart(6)}  ${f1(r.dist45).padStart(6)} m  ${pct(r.midThirdFrac).padStart(6)}   ${pct(r.anyHeadMidThirdFrac).padStart(5)}   ${pct(r.inFrameFrac).padStart(5)}`);
}

// ---- optional before/after contact sheet ----
if (FRAMES && flags.compare) {
  const beforeDir = resolve(flags.compare);
  const before = JSON.parse(readFileSync(join(beforeDir, 'measure.json'), 'utf8'));
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const rel = (dir, f) => join(dir, f).replace(dirname(OUT) + '/', '../');
  const rows = [];
  for (const cell of out.cells) {
    const b = before.cells.find((c) => c.preset === cell.preset && c.day === cell.day);
    if (!b || !cell.frames.length) continue;
    const bl = b.candidates.live || {}, al = cell.candidates.live || {};
    const cols = cell.frames.map((f, i) => {
      const bf = b.frames[i];
      return `<td><div class="lab">before · t ${f.t}</div><a href="${rel(beforeDir, bf.file)}"><img src="${rel(beforeDir, bf.file)}" loading="lazy"></a></td>`
        + `<td><div class="lab">after · t ${f.t}</div><a href="${rel(OUT, f.file)}"><img src="${rel(OUT, f.file)}" loading="lazy"></a></td>`;
    }).join('');
    rows.push(`<section><h2>${esc(cell.preset)} / ${esc(cell.day)} <small>T ${cell.meta.T} s · H₀ ${cell.meta.H0} m</small></h2>
<p class="num">head at set peak → frame centre: before ${f1(bl.deg45)}° at ${f1(bl.dist45)} m, after ${f1(al.deg45)}° at ${f1(al.dist45)} m · head in middle third over one T: before ${pct(bl.midThirdFrac)}, after ${pct(al.midThirdFrac)} · in frame: before ${pct(bl.inFrameFrac)}, after ${pct(al.inFrameFrac)}</p>
<table><tr>${cols}</tr></table></section>`);
  }
  const html = `<!doctype html><meta charset="utf-8"><title>cover aim — before / after</title>
<style>body{font:14px system-ui;margin:20px;background:#111;color:#ddd}h2{font-size:16px;margin:26px 0 4px}small{color:#999;font-weight:normal}
table{border-collapse:collapse}td{padding:3px;vertical-align:top}img{width:${Math.floor(1900 / (2 * SHOT_CLOCKS.length))}px;display:block}.lab{font:12px ui-monospace,monospace;color:#aaa;margin-bottom:2px}
p.num{font:12px ui-monospace,monospace;color:#bbb;margin:2px 0 6px}</style>
<h1>Cover camera aim — before (${esc(before.label)}, ${esc(before.served)}) vs after (${esc(LABEL)}, ${esc(SERVED)})</h1>
<p>Live Cover camera at the set peak (t = ${SET_ANCHOR_S} s) and one second on. Generated ${out.generated} by scripts/measure_cover_aim.mjs; numbers in each arm's measure.json. Judge the shot by eye; the numbers only say whether a crashing station is framed.</p>
${rows.join('\n')}`;
  writeFileSync(join(OUT, 'compare.html'), html);
  console.log(`\n-> ${join(OUT, 'compare.html')}`);
}
console.log(`-> ${join(OUT, 'measure.json')}`);
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
