// QA contact sheets — deterministic frame grids you can open and scan.
//
// ONE parameterised generator, driven by the SHEETS spec below. Each sheet is
// rows x 5 clock columns; each cell is a pinned capture labelled with the exact
// hash it was taken at (a live link into the app) plus numbers read off the
// running page. Adding a third sheet is a few lines in SHEETS.
//
// Usage:
//   node scripts/build_qa_sheets.mjs                      # both sheets -> qa/
//   node scripts/build_qa_sheets.mjs --sheets=break       # one sheet
//   node scripts/build_qa_sheets.mjs --port=8219 --out=qa
//   node scripts/build_qa_sheets.mjs --base=http://localhost:8127/  # reuse a server
//   node scripts/build_qa_sheets.mjs --limit=1                      # 1 row/group, smoke
//   node scripts/build_qa_sheets.mjs --html-only                    # re-render from JSON
// Serves the repo itself via scripts/serve.py (cache OFF — see that file) on
// --port and kills it on exit, unless --base is given.
//
// WHY THE CLOCKS ARE DERIVED, NOT PICKED
//   Sheet 1 (break progression) columns span ONE WAVE PERIOD T, anchored on a
//   MEASURED crest arrival at the break line: the rig sweeps sim time across
//   one T around the set peak, reads the displaced surface off the GPU through
//   __pointbreak.curlProbe at the break-line transect, and takes the argmax.
//   Columns are then t* + k*T/5, k = 0..4.
//   Sheet 2 (sets) columns span ONE SET BEAT 1/dF. setEnv peaks at the live
//   break line at t = SET_ANCHOR_S = 45 s by construction (#arm anchor: the
//   envelope is re-referenced to u_setRef, so the s/cg term cancels there), so
//   columns are 45 + (1/dF)*(0.5 + k/4), k = 0..4 — lull, building, PEAK,
//   easing, lull. Phase is read back per cell through the repo's own setEnv
//   twin fed from the live uniforms, never a re-derivation.
//
// DETERMINISM
//   speed=0 & controls=0 & q=high pinned, fixed viewport, cold load through
//   about:blank per row (a hash-only goto on a warm page races the app's own
//   needsReloadForHash reload — see measure_peel_visibility.mjs). Column 0 is
//   captured straight off that cold load at #sim=t0; columns 1..4 advance the
//   clock with __pointbreak.setSim + two rAF ticks, the mode
//   capture_temporal.mjs validated against per-frame reloads.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

import { setEnv, SET_ANCHOR_S } from '../web-three/js/model-js.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// pointbreak ships no node_modules on purpose. Resolve Playwright from wherever
// it already exists. The sibling-repo probe walks every ANCESTOR of the repo
// root rather than assuming '../..' — inside a git worktree
// (.claude/worktrees/<id>/) the sibling is four levels further up, which is how
// the older rigs' hardcoded relative path misses it.
const PW_CANDIDATES = [process.env.PLAYWRIGHT_DIR];
for (let dir = ROOT; ; dir = dirname(dir)) {
  PW_CANDIDATES.push(join(dir, 'node_modules/playwright/index.mjs'));
  PW_CANDIDATES.push(join(dir, 'psychodeli-webgl-port/node_modules/playwright/index.mjs'));
  if (dirname(dir) === dir) break;
}
let chromium;
for (const c of PW_CANDIDATES.filter(Boolean)) {
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
const OUT = resolve(ROOT, flags.out || 'qa');
const IMG = join(OUT, 'img');
const PORT = Number(flags.port || 8219);
// Where the CELL LINKS point. Deliberately NOT the capture server: captures run
// on their own short-lived port so they never touch the dev server you are
// reading the sheet on, but a link into a dead port is useless. 8127 is the
// house dev port (scripts/serve.py default).
const LINK_BASE = (flags.linkbase || 'http://localhost:8127/').replace(/\/?$/, '/');
const VIEW = { width: 1000, height: 625 };
// Whitewater luma levels. 205 is the level the #wwarea A/B is quoted at in
// docs/CONTROLS.md; 160 is its looser companion. Both reported so a cell that
// is "nearly breaking" is distinguishable from flat water.
const FOAM_HI = 205, FOAM_LO = 160;
// Attachment corridor, WORLD metres relative to the break line (+ = shoreward).
// A fixed pixel band does not work: measured at sewers/drone/month=january the
// projected baked line sits at py ~300 while the drawn whitewater bands sit at
// py 320-470, so a +-14 px band read 0.3% foam on a frame with three fat foam
// lines in it — and read HIGHER on August than on January, which is backwards.
// The corridor is the same construction measure_peel_visibility.mjs uses (the
// bright core migrates shoreward inside it as the front advances, so a point
// sample under-reads by construction), widened to +45 m to cover the bore.
const CORRIDOR_M = [-15, 45];
const CORRIDOR_N = 25;   // samples per station across the corridor

const COMMIT = (() => {
  try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT }).toString().trim(); }
  catch { return 'unknown'; }
})();
const GENERATED = new Date();

// ---------------------------------------------------------------------------
// SHEET SPEC — the whole configuration surface. A sheet is:
//   { id, title, blurb, clock, notes[], groups[{ id, label, note, base, rows[] }] }
// A row is { id, label, sub, hash } — `hash` is appended to the group's base.
// ---------------------------------------------------------------------------

// Sheet 1 rows. The four curated condition bundles (web-three/js/conditions.js)
// move H0 AND T AND tide AND dF together, which is what a real day does; the
// two h0-only rows move height alone against the site card's own period/tide,
// so the sheet can separate "bigger day" from "bigger swell".
const BREAK_ROWS = [
  { id: 'day-small', label: 'small summer windswell', sub: 'bundle · day=small', hash: 'day=small' },
  { id: 'day-modelcard', label: 'model-card day', sub: 'bundle · day=modelcard', hash: 'day=modelcard' },
  { id: 'day-overhead', label: 'overhead WNW, low tide', sub: 'bundle · day=overhead', hash: 'day=overhead' },
  { id: 'day-big', label: 'big clean groundswell', sub: 'bundle · day=big', hash: 'day=big' },
  { id: 'h0-low', label: 'H₀ 0.7 m only', sub: 'height only · h0=0.7', hash: 'h0=0.7' },
  { id: 'h0-high', label: 'H₀ 2.5 m only', sub: 'height only · h0=2.5', hash: 'h0=2.5' },
];

const PRESET_LABELS = {
  sewers: 'Sewers', firstpeak: 'First Peak', secondpeak: 'Second Peak',
  jacks: "Jack's (38th)", thehook: 'The Hook', sharks: 'Sharks',
  privates: 'Privates',
};
const PRESET_NOTE = { privates: 'synthetic stage — no measured bed' };
const LOCATION_KEYS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks', 'privates'];
const SEASON_PRESETS = ['sewers', 'secondpeak'];
const SEASON_MONTHS = [
  { key: 'january', label: 'January', note: 'the big month — H₀ p75 1.245 m' },
  { key: 'october', label: 'October', note: 'autumn shoulder — H₀ p75 0.801 m' },
  { key: 'august', label: 'August', note: 'the flat one — H₀ p75 0.585 m; ZERO hours ≥ 1.3 m in 25 years' },
];

const SHEETS = [
  {
    id: 'break-progression',
    file: 'break-progression.html',
    title: 'Break progression',
    blurb: 'One wave through its break, five clocks across one wave period T, at six wave sizes.',
    clock: { kind: 'wave', n: 5 },
    groups: [
      {
        id: 'cliff', label: 'Cliff camera — low, in profile',
        note: 'The low profile view is where a break reads: throw, curtain and the collapse behind it are all edge-on. '
            + 'Site is Second Peak, chosen over the more plunging Sewers (ξ 1.15) because Sewers puts its bluff across the '
            + 'lower half of the cliff frame at small sizes, which occludes the break line rather than showing it.',
        base: 'preset=secondpeak&cam=cliff', rows: BREAK_ROWS,
      },
      {
        id: 'drone', label: 'Drone camera — overhead',
        note: 'Same six rows, same derived clocks, from above: this is where the along-crest peel (the zipper) reads instead.',
        base: 'preset=secondpeak&cam=drone', rows: BREAK_ROWS,
      },
    ],
  },
  {
    id: 'sets-locations-seasons',
    file: 'sets-locations-seasons.html',
    title: 'Sets — locations × seasons',
    blurb: 'Five clocks across one set beat 1/Δf, phased lull → building → peak → easing → lull.',
    clock: { kind: 'set', n: 5 },
    groups: [
      {
        id: 'locations', label: 'Locations — all seven presets, month=january',
        note: 'The location axis: every shipped site preset at the same climatological month, so what differs between rows is the reef.',
        base: 'cam=drone',
        rows: LOCATION_KEYS.map((k) => ({
          id: `loc-${k}`, label: PRESET_LABELS[k],
          sub: `preset=${k}` + (PRESET_NOTE[k] ? ` · ${PRESET_NOTE[k]}` : ''),
          hash: `preset=${k}&month=january`,
        })),
      },
      {
        id: 'seasons', label: 'Seasons — two presets × three months',
        note: 'The season axis: January (peak), October (shoulder), August (flat). Sewers and Second Peak only — see "What was left out".',
        base: 'cam=drone',
        rows: SEASON_PRESETS.flatMap((p) => SEASON_MONTHS.map((m) => ({
          id: `sea-${p}-${m.key}`, label: `${PRESET_LABELS[p]} · ${m.label}`,
          sub: m.note, hash: `preset=${p}&month=${m.key}`,
        }))),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// PNG decode (no deps; mirrors measure_peel_visibility.mjs)
// ---------------------------------------------------------------------------
function decodePNG(buf) {
  let off = 8, w = 0, h = 0, colorType = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  return { w, h, ch, data: out };
}

// Bright-pixel statistics over the attachment corridor. This is the pixel-side
// answer to "did anything actually break here" — independent of the model-side
// pocket/brk read, so a cell where the two disagree is visible rather than
// silently averaged away.
//
// Each station contributes CORRIDOR_N samples interpolated between its two
// projected corridor endpoints (projection is near-affine over 60 m, so two
// endpoints suffice). Each sample is the MAX luma of its 3x3 neighbourhood, not
// the mean: the shipped foam is a speckled cellular texture, and a 3x3 mean over
// it fell below the 205 level on frames that plainly carry whitewater (measured
// at secondpeak/drone/month=october, 0.0% by mean against modelFoam 0.32). Max
// is the right reducer for "is there whitewater in this patch".
function foamStats(pngBuf, stations) {
  const { w, h, ch, data } = decodePNG(pngBuf);
  const meanAt = (px, py) => {
    let m = -Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = Math.round(px) + dx, y = Math.round(py) + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const o = (y * w + x) * ch;
      const L = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
      if (L > m) m = L;
    }
    return Number.isFinite(m) ? m : NaN;
  };
  let n = 0, hi = 0, lo = 0, max = 0, sum = 0;
  for (const s of stations) {
    for (let i = 0; i < CORRIDOR_N; i++) {
      const f = i / (CORRIDOR_N - 1);
      const L = meanAt(s.pxA + (s.pxB - s.pxA) * f, s.pyA + (s.pyB - s.pyA) * f);
      if (!Number.isFinite(L)) continue;
      n++; sum += L; if (L >= FOAM_HI) hi++; if (L >= FOAM_LO) lo++;
      if (L > max) max = L;
    }
  }
  return n
    ? { bandPx: n, fracHi: hi / n, fracLo: lo / n, maxLuma: +max.toFixed(1), meanLuma: +(sum / n).toFixed(1) }
    : { bandPx: 0, fracHi: 0, fracLo: 0, maxLuma: 0, meanLuma: 0 };
}

// ---------------------------------------------------------------------------
// In-page probes
// ---------------------------------------------------------------------------

// Everything the sheet needs about the state a cell was captured in, plus the
// break line projected into frame pixels (live camera matrices, so it follows
// whichever cam preset the row asked for).
function readState(CORR) {
  const pb = window.__pointbreak;
  const u = pb.uniforms, st = pb.state;
  const cam = pb.camera;
  cam.updateMatrixWorld(true);
  const W = innerWidth, H = innerHeight;
  const proj = (x, y, z) => {
    const v = new (cam.position.constructor)(x, y, z); v.project(cam);
    return { px: (v.x * 0.5 + 0.5) * W, py: (1 - (v.y * 0.5 + 0.5)) * H, ndcZ: v.z };
  };
  // lineProbe returns the BAKE only. The GLSL breakLine() the foam attaches to
  // is that plus the sections term, which pulls patches up to sections*55 m
  // SEAWARD; mirror it here (double-precision twin of the GLSL hash, same as
  // measure_peel_visibility.mjs) or the corridor is offset by up to 22 m at
  // Sewers.
  const fractf = (v) => v - Math.floor(v);
  const hash11 = (p) => { p = fractf(p * 0.1031); p *= p + 33.33; return fractf((p + p) * p); };
  const vnoise1 = (v) => {
    const i = Math.floor(v); let f = v - i; f = f * f * (3 - 2 * f);
    return hash11(i) + (hash11(i + 1) - hash11(i)) * f;
  };
  const secU = u.u_sections.value;
  const secShift = (x) => (secU >= 0.05
    ? Math.min(secU * 55 * (vnoise1(x * 0.02 + 7.3) - 0.5) * 2, 0) : 0);
  const line = pb.lineProbe(6) || [];
  const stations = line.map((p) => {
    const zg = p.z + secShift(p.x);
    const s = proj(p.x, 0, zg);
    const a = proj(p.x, 0, zg + CORR[0]), b = proj(p.x, 0, zg + CORR[1]);
    return { x: p.x, z: zg, px: s.px, py: s.py, gap: p.gap,
      pxA: a.px, pyA: a.py, pxB: b.px, pyB: b.py,
      visible: s.px >= 0 && s.px < W && s.py >= 0 && s.py < H && s.ndcZ < 1 };
  }).filter((s) => s.visible && !(s.gap > 0.5));
  const aim = pb.aimProbe ? pb.aimProbe() : null;
  const hud = (id) => (document.getElementById(id)?.textContent || '').trim();
  return {
    sim: pb.sim(),
    preset: st.preset, day: pb.day(),
    // main.js reads tide as `state.tide || 0` everywhere and never initialises
    // it, so a row that sets no tide (h0=/month= rows) has it undefined here.
    H0: st.H0, T: st.T, dF: st.dF, tide: st.tide || 0, chop: st.chop, xi: st.xi, alpha: st.alpha,
    setRef: u.u_setRef.value, setAnchor: u.u_setAnchor.value,
    setDepth: u.u_setDepth.value, cgLegacy: u.u_cgLegacy.value > 0.5,
    quality: u.u_cell ? [u.u_cell.value.x, u.u_cell.value.y] : null,
    camera: cam.position.toArray().map((v) => +v.toFixed(2)),
    target: pb.controls.target.toArray().map((v) => +v.toFixed(2)),
    aim: aim && aim.raw ? { x: +aim.raw.x.toFixed(1), z: +aim.raw.z.toFixed(1), errDeg: aim.errDeg } : null,
    hudGeo: hud('hudGeo'), hudAlpha: hud('hudAlpha'), hudSwell: hud('hudSwell'),
    stations,
  };
}

// GPU read of the displaced surface on a short shore-normal transect straddling
// the break line at world x. Returns the crest height and the model's own
// breaking bookkeeping there, so "the wave is 2.1 m and breaking" and "the wave
// is 0.4 m and not" are separable without looking at a picture.
function probeTransect({ x, zLine, halfM, n }) {
  const rows = window.__pointbreak.curlProbe(x, zLine - halfM, zLine + halfM, n);
  if (!rows || !rows.length) return null;
  let crest = -Infinity, foam = 0, brk = 0, pocket = 0, ceil = 0;
  for (const r of rows) {
    if (r.land > 0.5) continue;
    if (r.y > crest) crest = r.y;
    foam = Math.max(foam, r.foam); brk = Math.max(brk, r.brk);
    pocket = Math.max(pocket, r.pocket); ceil = Math.max(ceil, r.ceil);
  }
  return Number.isFinite(crest)
    ? { crest, foam, brk, pocket, ceil } : null;
}

// The same read, but along the RIDEABLE STAGE rather than at one station: the
// model's own answer to "is this thing breaking, and how big is it". Camera-
// independent by construction, so it cannot be moved by the framing the way a
// pixel measure can (MEASUREMENT_LESSONS 11), and it is the ONLY read available
// at Privates, which has no measured bed and therefore no baked line to project.
function probeStage({ nStations, halfM, n, aimX }) {
  const pb = window.__pointbreak;
  const line = pb.lineProbe(4) || [];
  const sa = pb.stageAlpha ? pb.stageAlpha() : null;
  // Fallback for an unbaked (synthetic-stage) site: sweep the authored stage
  // span about z = 0 with a wide window. Reported as `baked: false` so a reader
  // never mistakes it for the mapped sites' measurement.
  const baked = line.length > 0;
  const lo = baked ? (sa ? sa.stageLo : line[0].x) : -100;
  const hi = baked ? (sa ? sa.stageHi : line[line.length - 1].x) : 200;
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
  const half = baked ? halfM : halfM * 2;
  const out = [];
  for (let i = 0; i < nStations; i++) {
    const x = lo + ((hi - lo) * i) / (nStations - 1);
    const z = zAt(x);
    const rows = pb.curlProbe(x, z - half, z + half, n) || [];
    let crest = -Infinity, foam = 0, pocket = 0, ceil = 0;
    for (const r of rows) {
      if (r.land > 0.5) continue;
      if (r.y > crest) crest = r.y;
      foam = Math.max(foam, r.foam);
      pocket = Math.max(pocket, r.pocket); ceil = Math.max(ceil, r.ceil);
    }
    out.push({ x: +x.toFixed(1), z: +z.toFixed(1),
      crest: Number.isFinite(crest) ? +crest.toFixed(2) : null,
      foam: +foam.toFixed(3), pocket: +pocket.toFixed(3), ceil: +ceil.toFixed(2) });
  }
  const crests = out.map((s) => s.crest).filter((v) => v !== null);
  const foams = out.map((s) => s.foam);
  // The station nearest where the camera is aimed (the baked line's action
  // centroid). The stage MAX barely moves across one wave period — some wave is
  // always cresting somewhere on 200 m of line — so the per-column progression
  // only shows up in a single station's read.
  let atAim = out[0];
  if (Number.isFinite(aimX))
    for (const s of out) if (Math.abs(s.x - aimX) < Math.abs(atAim.x - aimX)) atAim = s;
  return {
    baked, stageLo: +lo.toFixed(1), stageHi: +hi.toFixed(1), stations: out, atAim,
    crestMaxM: crests.length ? Math.max(...crests) : null,
    ceilM: out.length ? Math.max(...out.map((s) => s.ceil)) : null,
    foamMax: Math.max(...foams),
    // share of the stage that is carrying whitewater at this clock — the
    // model-side "how much of the line is breaking"
    foamFrac: foams.filter((v) => v >= 0.15).length / foams.length,
    pocketMax: Math.max(...out.map((s) => s.pocket)),
  };
}

// ---------------------------------------------------------------------------
// Browser driving
// ---------------------------------------------------------------------------
const COMMON = 'controls=0&q=high&speed=0';

async function coldLoad(page, base, hash) {
  // about:blank first: a hash-only goto on a warm page fires the app's own
  // needsReloadForHash -> location.reload(), which races the navigation and
  // detaches the frame (MEASUREMENT_LESSONS / measure_peel_visibility.mjs).
  await page.goto('about:blank');
  await page.goto(`${base}web-three/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600);   // shader compile + bake + first frames
}

async function setClock(page, t) {
  await page.evaluate(async (tt) => {
    window.__pointbreak.setSim(tt);
    // two rAF ticks: the loop must copy simTime -> u_time and then draw
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
  await page.waitForTimeout(120);
}

// Measured crest arrival at the break line. Sweeps one wave period around the
// set peak, reading the GPU surface each step, then refines the argmax with a
// parabola through its two neighbours.
async function measureCrestArrival(page, st, xProbe, zProbe) {
  const T = st.T;
  const t0 = SET_ANCHOR_S - T / 2, N = 40;
  const samples = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + (T * i) / N;
    await setClock(page, t);
    const p = await page.evaluate(probeTransect, { x: xProbe, zLine: zProbe, halfM: 4, n: 33 });
    samples.push({ t, crest: p ? p.crest : NaN });
  }
  let iMax = 0;
  for (let i = 1; i < samples.length; i++)
    if (samples[i].crest > samples[iMax].crest) iMax = i;
  let tStar = samples[iMax].t;
  if (iMax > 0 && iMax < samples.length - 1) {
    const a = samples[iMax - 1].crest, b = samples[iMax].crest, c = samples[iMax + 1].crest;
    const den = a - 2 * b + c;
    if (Math.abs(den) > 1e-9) tStar += ((a - c) / (2 * den)) * (T / N);
  }
  return { tStar, crestM: samples[iMax].crest, sweepFrom: t0, sweepTo: t0 + T, sweepN: N + 1 };
}

function clocksFor(sheet, st, crest) {
  if (sheet.clock.kind === 'wave') {
    const T = st.T, n = sheet.clock.n;
    return {
      period: T, periodLabel: `wave period T = ${T.toFixed(1)} s`,
      spacing: T / n,
      how: `crest measured on the break line at t* = ${crest.tStar.toFixed(2)} s `
         + `(argmax of the GPU-read crest height over ${crest.sweepN} clocks spanning `
         + `${crest.sweepFrom.toFixed(1)}–${crest.sweepTo.toFixed(1)} s, i.e. one T centred on the `
         + `set peak at SET_ANCHOR_S = ${SET_ANCHOR_S} s); columns are t* + k·T/5.`,
      times: Array.from({ length: n }, (_, k) => crest.tStar + (k * T) / n),
      phases: ['crest on the line', '+T/5', '+2T/5', '+3T/5', '+4T/5'],
    };
  }
  const P = 1 / st.dF, n = sheet.clock.n;
  return {
    period: P, periodLabel: `set beat 1/Δf = ${P.toFixed(1)} s (Δf = ${st.dF} Hz)`,
    spacing: P / 4,
    how: `setEnv peaks at the live break line at t = SET_ANCHOR_S = ${SET_ANCHOR_S} s `
       + `(#arm anchor re-references the envelope to u_setRef = ${st.setRef.toFixed(1)} m, so the `
       + `s/cg term cancels there); columns are 45 + P·(0.5 + k/4), k = 0..4 — a full beat from `
       + `lull through the peak back to lull.`,
    times: Array.from({ length: n }, (_, k) => SET_ANCHOR_S + P * (0.5 + k / 4)),
    phases: ['lull', 'building', 'SET PEAK', 'easing', 'lull'],
  };
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------
async function captureSheet(page, base, sheet) {
  const out = { id: sheet.id, groups: [] };
  for (const group of sheet.groups) {
    const g = { id: group.id, label: group.label, note: group.note, base: group.base, rows: [] };
    const rows = flags.limit ? group.rows.slice(0, Number(flags.limit)) : group.rows;
    for (const row of rows) {
      const rowHash = `${group.base}&${row.hash}&${COMMON}`;
      process.stdout.write(`  ${sheet.id}/${group.id}/${row.id} … `);
      await coldLoad(page, base, `${rowHash}&sim=${SET_ANCHOR_S}`);
      let st = await page.evaluate(readState, CORRIDOR_M);

      // Probe transect: the baked line's action centroid is where the cameras
      // are already aiming, so it is also where "did this break" should be
      // asked. Fall back to the middle of the visible line.
      const mid = st.stations[Math.floor(st.stations.length / 2)];
      const xProbe = st.aim ? st.aim.x : (mid ? mid.x : 0);
      const zProbe = st.aim ? st.aim.z : (mid ? mid.z : 0);

      let crest = null;
      if (sheet.clock.kind === 'wave') crest = await measureCrestArrival(page, st, xProbe, zProbe);
      const clocks = clocksFor(sheet, st, crest);

      const cells = [];
      for (let k = 0; k < clocks.times.length; k++) {
        const t = +clocks.times[k].toFixed(2);
        const hash = `${rowHash}&sim=${t}`;
        if (k === 0) await coldLoad(page, base, hash);   // a real reload-path frame
        else await setClock(page, t);
        const live = await page.evaluate(readState, CORRIDOR_M);
        if (k === 0) st = live;
        if (Math.abs(live.sim - t) > 1e-3) throw new Error(`${row.id} col ${k}: clock ${live.sim} != ${t}`);
        const stage = await page.evaluate(probeStage,
          { nStations: 11, halfM: 45, n: 193, aimX: xProbe });
        const rel = `img/${sheet.id}_${group.id}_${row.id}_c${k}.png`;
        const buf = await page.screenshot({ path: join(OUT, rel) });
        const foam = foamStats(buf, live.stations);
        // Envelope through the repo's own twin (web-three/js/model-js.js setEnv),
        // fed from the live uniforms — not a re-derivation of the formula here.
        const env = setEnv(live.setRef, t, {
          T: live.T, dF: live.dF, setRef: live.setRef,
          setAnchor: live.setAnchor, setDepth: live.setDepth, cgLegacy: live.cgLegacy,
        });
        cells.push({
          k, t, hash, img: rel, phase: clocks.phases[k],
          env: +env.toFixed(3),
          crestM: stage.atAim ? stage.atAim.crest : null,      // at the aim station
          crestMaxM: stage.crestMaxM,                          // anywhere on the stage
          ceilM: stage.ceilM,
          modelFoamMax: +stage.foamMax.toFixed(3),
          modelFoamFrac: +stage.foamFrac.toFixed(3),
          modelPocketMax: +stage.pocketMax.toFixed(3),
          baked: stage.baked,
          stageStations: stage.stations,
          pixFracHi: foam.bandPx ? +foam.fracHi.toFixed(4) : null,
          pixFracLo: foam.bandPx ? +foam.fracLo.toFixed(4) : null,
          pixMaxLuma: foam.bandPx ? foam.maxLuma : null,
          corridorSamples: foam.bandPx,
          // MEASUREMENT_LESSONS 11: the #aim cameras frame the baked line's
          // action centroid and smooth over ~6 s of sim time, so jumping the
          // clock COULD move the instrument between columns of the same row.
          // Recorded per cell and reduced to camDriftM below so a row whose
          // frame moved is visible rather than assumed away.
          cam: live.camera, aimErrDeg: live.aim ? live.aim.errDeg : null,
        });
      }
      // FLAT = this cell promised a break and drew none. "Promised" is per
      // sheet: a wave-period sheet promises one at every column, a set-beat
      // sheet only at its peak column — its lull columns are SUPPOSED to be
      // small, and flagging them would make the honest result look like a bug.
      // Both instruments have to agree before a cell is called failed: the
      // camera-independent model read AND the pixels (where pixels exist).
      for (const c of cells) {
        const promised = sheet.clock.kind === 'wave' || c.phase === 'SET PEAK';
        const pixSaysFlat = c.pixFracLo === null ? true : c.pixFracLo === 0;
        c.flat = promised && c.modelFoamMax < 0.05 && pixSaysFlat;
      }
      // Largest camera displacement between any two columns of this row.
      const camDriftM = Math.max(...cells.map((c) => Math.max(...cells.map((d) =>
        Math.hypot(c.cam[0] - d.cam[0], c.cam[1] - d.cam[1], c.cam[2] - d.cam[2])))));
      g.rows.push({
        ...row, rowHash, camDriftM: +camDriftM.toFixed(2),
        clocks: { ...clocks, times: clocks.times.map((v) => +v.toFixed(2)) },
        crest, state: {
          preset: st.preset, day: st.day, H0: st.H0, T: st.T, dF: st.dF, tide: st.tide,
          xi: st.xi, alpha: st.alpha, chop: st.chop,
          hudGeo: st.hudGeo, hudAlpha: st.hudAlpha, hudSwell: st.hudSwell,
          camera: st.camera, target: st.target, setRef: +st.setRef.toFixed(2),
          setDepth: st.setDepth, probe: { x: +xProbe.toFixed(1), z: +zProbe.toFixed(1) },
        },
        cells,
      });
      const nFlat = cells.filter((c) => c.flat).length;
      console.log(`H₀ ${st.H0.toFixed(2)} m · ${clocks.periodLabel}`
        + ` · crest ${cells.map((c) => (c.crestM === null ? '—' : c.crestM.toFixed(1))).join('/')} m`
        + ` · foam ${cells.map((c) => c.modelFoamMax.toFixed(2)).join('/')}`
        + ` · pix ${cells.map((c) => (c.pixFracLo === null ? 'n/a' : (c.pixFracLo * 100).toFixed(1))).join('/')}%`
        + ` · camDrift ${camDriftM.toFixed(2)} m`
        + (nFlat ? `  [${nFlat} FLAT]` : ''));
    }
    out.groups.push(g);
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// CONTRAST — every readable colour below is computed against the two page
// backgrounds and stated. Formula: WCAG 2.x relative luminance
//   L = 0.2126 R + 0.7152 G + 0.0722 B, channel c -> c/12.92 (c <= 0.04045)
//   else ((c + 0.055)/1.055)^2.4, ratio = (L_light + 0.05)/(L_dark + 0.05).
// House floor is 8:1 on ALL readable text (CLAUDE.md), which is well above
// WCAG AA. Frame imagery is exempt — it is not text.
//
//   backgrounds     --bg   #0d1117  L = 0.005483
//                   --panel #161b22 L = 0.010700
//
//   token        hex       L         on --bg   on --panel
//   --ink        #e6edf3   0.838624  16.02:1   14.64:1
//   --ink-dim    #a8b8c8   0.467759   9.33:1    8.53:1
//   --link       #7fd7e8   0.589391  11.52:1   10.53:1
//   --warn       #ffd166   0.678202  13.12:1   12.00:1
//   --bad        #ff9a9a   0.467043   9.32:1    8.52:1
//
// Lowest ratio anywhere on these pages is 8.52:1 (--bad on --panel), so the
// 8:1 floor holds for every label, caption, value, hash and table header.
// --line/--line2 are hairlines and chip borders only; nothing is read off them.
const CSS = `/* generated by scripts/build_qa_sheets.mjs — see the contrast block in that file */
:root{
  color-scheme: dark;
  --bg:#0d1117; --panel:#161b22;
  --ink:#e6edf3;      /* 16.02:1 on --bg, 14.64:1 on --panel */
  --ink-dim:#a8b8c8;  /*  9.33:1 on --bg,  8.53:1 on --panel */
  --link:#7fd7e8;     /* 11.52:1 on --bg, 10.53:1 on --panel */
  --warn:#ffd166;     /* 13.12:1 on --bg, 12.00:1 on --panel */
  --bad:#ff9a9a;      /*  9.32:1 on --bg,  8.52:1 on --panel */
  --line:#30363d; --line2:#3d4652;   /* hairlines only, never text */
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;max-width:100%;overflow-x:hidden}
body{background:var(--bg);color:var(--ink);
  font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
a{color:var(--link)}
.wrap{max-width:1760px;margin:0 auto;padding:22px 18px 64px}
h1{font-size:25px;margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:18px;margin:0 0 4px}
.lede{color:var(--ink-dim);margin:0 0 14px;max-width:78ch}
.meta{background:var(--panel);border:1px solid var(--line);border-radius:8px;
  padding:12px 14px;margin:0 0 22px}
.meta dl{display:grid;grid-template-columns:max-content 1fr;gap:3px 14px;margin:0}
.meta dt{color:var(--ink-dim);font-size:13px}
.meta dd{margin:0;font-size:13px}
.meta code, code{font-family:var(--mono);font-size:12.5px}
.groupnote{color:var(--ink-dim);font-size:13.5px;margin:0 0 10px;max-width:88ch}
.group{margin:30px 0 0}
.grid{display:grid;grid-template-columns:176px repeat(5,minmax(0,1fr));
  gap:8px;align-items:start}
.colhead{position:sticky;top:0;z-index:3;background:var(--panel);
  border:1px solid var(--line);border-radius:6px;padding:6px 8px;
  font-size:12.5px;font-weight:600}
.colhead .sub{display:block;color:var(--ink-dim);font-weight:400;font-size:11.5px}
.corner{position:sticky;top:0;left:0;z-index:4;background:var(--panel);
  border:1px solid var(--line);border-radius:6px;padding:6px 8px;
  font-size:12.5px;font-weight:600}
.rowhead{position:sticky;left:0;z-index:2;background:var(--panel);
  border:1px solid var(--line);border-radius:6px;padding:8px 9px;font-size:12.5px}
.rowhead .title{font-weight:600;display:block;margin-bottom:2px}
.rowhead .sub{color:var(--ink-dim);font-size:11.5px;display:block;margin-bottom:6px}
.rowhead dl{display:grid;grid-template-columns:max-content 1fr;gap:1px 8px;margin:0;
  font-size:11.5px}
.rowhead dt{color:var(--ink-dim)}
.rowhead dd{margin:0;font-variant-numeric:tabular-nums}
.rowhead .base{display:block;margin-top:6px;font-family:var(--mono);font-size:10.5px;
  color:var(--link);word-break:break-all;text-decoration:none}
.cell{background:var(--panel);border:1px solid var(--line);border-radius:6px;
  padding:6px;display:flex;flex-direction:column;gap:5px;min-width:0}
.cell.flat{border-color:var(--bad)}
.cell img{display:block;width:100%;height:auto;border-radius:3px;background:#000}
.nums{display:flex;flex-wrap:wrap;gap:3px 8px;font-size:11.5px;
  font-variant-numeric:tabular-nums;color:var(--ink-dim)}
.nums b{color:var(--ink);font-weight:600}
.badge{display:inline-block;border:1px solid var(--line2);border-radius:999px;
  padding:0 6px;font-size:11px;color:var(--ink-dim)}
.badge.peak{color:var(--warn);border-color:var(--warn)}
.badge.flat{color:var(--bad);border-color:var(--bad);font-weight:600}
.hash{font-family:var(--mono);font-size:10.5px;line-height:1.35;color:var(--link);
  word-break:break-all;text-decoration:none;display:block}
.hash:hover{text-decoration:underline}
.foot{margin-top:34px;border-top:1px solid var(--line);padding-top:14px;
  color:var(--ink-dim);font-size:13px;max-width:88ch}
.foot b{color:var(--ink)}
ul{margin:6px 0 0;padding-left:20px}
li{margin:3px 0}
.alert{border:1px solid var(--bad);border-radius:8px;padding:10px 13px;margin:0 0 18px;
  color:var(--bad);font-size:13.5px}
.alert b{color:var(--bad)}
@media (max-width:900px){
  .grid{grid-template-columns:140px repeat(5,minmax(0,1fr));gap:6px}
}
`;

function cellHTML(base, cell) {
  const url = `${base}web-three/#${cell.hash}`;
  const cls = 'cell' + (cell.flat ? ' flat' : '');
  const badge = cell.flat
    ? '<span class="badge flat">FLAT — no whitewater at the line</span>'
    : (cell.phase === 'SET PEAK' ? '<span class="badge peak">SET PEAK</span>' : '');
  return `<div class="${cls}">
  <a href="${esc(cell.img)}" title="open the full ${VIEW.width}×${VIEW.height} frame"><img src="${esc(cell.img)}" alt="frame at sim ${cell.t} s" width="${VIEW.width}" height="${VIEW.height}" loading="lazy"></a>
  <div class="nums"><span><b>t ${cell.t.toFixed(1)} s</b></span>${badge}</div>
  <div class="nums">
    <span>env <b>${cell.env.toFixed(2)}</b></span>
    <span>crest <b>${cell.crestM === null ? '—' : cell.crestM.toFixed(2) + ' m'}</b></span>
  </div>
  <div class="nums">
    <span>foam<sub>model</sub> <b>${cell.modelFoamMax.toFixed(2)}</b> (${(cell.modelFoamFrac * 100).toFixed(0)}% of stage)</span>
    <span>foam<sub>pix</sub> <b>${cell.pixFracLo === null ? 'n/a' : (cell.pixFracLo * 100).toFixed(1) + '%'}</b></span>
  </div>
  <a class="hash" href="${esc(url)}" title="${esc('#' + cell.hash)}">#${esc(cell.hash)}</a>
</div>`;
}

function rowHTML(base, row) {
  const s = row.state;
  return `<div class="rowhead">
  <span class="title">${esc(row.label)}</span>
  <span class="sub">${esc(row.sub)}</span>
  <dl>
    <dt>H₀</dt><dd>${s.H0.toFixed(2)} m</dd>
    <dt>T</dt><dd>${s.T.toFixed(1)} s</dd>
    <dt>tide</dt><dd>${s.tide.toFixed(2)} m</dd>
    <dt>Δf</dt><dd>${s.dF} Hz</dd>
    <dt>ξ</dt><dd>${s.xi.toFixed(2)}</dd>
    <dt>step</dt><dd>${row.clocks.spacing.toFixed(2)} s</dd>
    <dt>cam drift</dt><dd>${row.camDriftM === undefined ? '—' : row.camDriftM.toFixed(2) + ' m'}</dd>
  </dl>
  <span class="sub" style="margin-top:6px">${esc(s.hudGeo || '')}</span>
  <a class="base" href="${esc(base)}web-three/#${esc(row.rowHash)}&amp;sim=${row.clocks.times[0]}" title="${esc('#' + row.rowHash)}">#${esc(row.rowHash)}</a>
</div>` + row.cells.map((c) => cellHTML(base, c)).join('\n');
}

function sheetHTML(sheet, data, base, extras) {
  const cols = data.groups[0].rows[0].clocks.phases;
  const flats = [];
  for (const g of data.groups) for (const r of g.rows) for (const c of r.cells)
    if (c.flat) flats.push(`${g.id} / ${r.label} / column ${c.k + 1} (t = ${c.t.toFixed(1)} s)`);
  const groups = data.groups.map((g) => `
<section class="group">
  <h2>${esc(g.label)}</h2>
  <p class="groupnote">${esc(g.note)}</p>
  <div class="grid">
    <div class="corner">row ↓ / clock →</div>
    ${cols.map((c, i) => `<div class="colhead">${i + 1}. ${esc(c)}<span class="sub">${i === 0 ? 'anchor' : `+${i}/${sheet.clock.kind === 'wave' ? '5 T' : '4 beat'}`}</span></div>`).join('\n    ')}
    ${g.rows.map((r) => rowHTML(base, r)).join('\n    ')}
  </div>
</section>`).join('\n');

  const first = data.groups[0].rows[0];
  const commit = data.commit || COMMIT, when = data.generated || GENERATED.toISOString();
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(sheet.title)} — pointbreak QA</title>
<style>${CSS}</style>
<div class="wrap">
<h1>${esc(sheet.title)}</h1>
<p class="lede">${esc(sheet.blurb)}</p>
${flats.length ? `<div class="alert"><b>${flats.length} cell${flats.length === 1 ? '' : 's'} drew flat water where a break was promised.</b><ul>${flats.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
<div class="meta"><dl>
  <dt>build</dt><dd><code>${esc(commit)}</code></dd>
  <dt>captured</dt><dd>${esc(when)}</dd>
  <dt>viewport</dt><dd>${VIEW.width} × ${VIEW.height} px, deviceScaleFactor 1</dd>
  <dt>pinned</dt><dd><code>${esc(COMMON)}</code> — frozen clock, no UI in frame, quality tier pinned</dd>
  <dt>clock spacing</dt><dd>${esc(first.clocks.periodLabel)}, columns ${first.clocks.spacing.toFixed(2)} s apart. ${esc(first.clocks.how)}</dd>
  <dt>numbers</dt><dd><b>env</b> — set envelope at the break line, through the repo's own <code>setEnv</code> twin
    (<code>web-three/js/model-js.js</code>) fed from the live uniforms.<br>
    <b>crest</b> — tallest displaced surface point on the ±45 m shore-normal transect nearest where the camera
    is aimed, read straight off the GPU through <code>__pointbreak.curlProbe</code> (which runs the shipped
    shader chunk, not a re-derivation). One of 11 transects along the stage; the stage-wide max is in the JSON as
    <code>crestMaxM</code>, and it barely moves across a wave period because some wave is always cresting
    somewhere on 200 m of line. These are <b>displayed</b> metres — the renderer applies a viewing gain of
    <code>VIS = 3.2</code> (<code>shared/model-glsl.js</code>), so they are not physical wave heights.<br>
    <b>foam<sub>model</sub></b> — the shader's own foam field at those same transects: peak value, and the share of
    the 11 stations carrying foam ≥ 0.15. Camera-independent, so the framing cannot move it.<br>
    <b>foam<sub>pix</sub></b> — the camera's answer: share of samples at luma ≥ ${FOAM_LO} over the whitewater
    <i>attachment corridor</i>, ${CORRIDOR_N} points per line station spanning ${CORRIDOR_M[0]} m to
    +${CORRIDOR_M[1]} m across the break line in <i>world</i> metres (sections shift included), each the max of its
    3×3 neighbourhood. Reads <code>n/a</code> where there is no baked line to project (Privates).
    It is corridor-local: whitewater that has already advected shoreward is outside it by design.</dd>
  <dt>links</dt><dd>Every hash is a live link into <code>${esc(base)}web-three/</code> at that exact state — start the dev
    server there (<code>python3 scripts/serve.py 8127</code>) and clicking a suspicious frame drops you into the app at it.
    Row headers link to column 1. Clicking the <b>image</b> opens the full ${VIEW.width}×${VIEW.height} frame instead.
    Captures were taken on their own separate port so they never touched your dev server.</dd>
</dl></div>
${groups}
<div class="foot">
${extras}
<p><b>Method caveat.</b> Column 1 of every row is captured from a cold load at its own <code>#sim=</code>; columns 2–5 advance the clock with <code>__pointbreak.setSim()</code> plus two rAF ticks — the mode <code>scripts/capture_temporal.mjs</code> validated against per-frame reloads. Each cell's hash reproduces its frame either way.</p>
<p><b>Camera drift, recorded not assumed.</b> The <code>#aim</code> cameras frame the baked line's action centroid
and smooth over ~6 s of sim time, so advancing the clock <i>could</i> move the instrument between columns of one row
(MEASUREMENT_LESSONS 11: an instrument that frames itself on the signal is not a fixed instrument). Each row header
carries the largest camera displacement between any two of its five columns. A row with a non-trivial drift there
is comparing slightly different windows, and its numbers should be read accordingly. The camera legitimately
<i>does</i> differ between rows — the break line moves with H₀ — so only within-row drift is a concern.</p>
<p><b>Stills, not motion.</b> A contact sheet cannot support a claim with a verb of motion in it (MEASUREMENT_LESSONS 1). It can show that the phases differ and that something breaks; it cannot show which way the peel runs.</p>
<p><a href="index.html">← all QA sheets</a> · <a href="${esc(sheet.id)}.json">raw measurements (JSON)</a></p>
</div>
</div>
`;
}

// Per-sheet honesty block: what was sampled, what was deliberately left out.
// Silent truncation is the thing to avoid, so the omissions are on the page.
const SHEET_NOTES = {
  'break-progression': `
<p><b>What is on this sheet.</b> Six wave sizes at <code>preset=secondpeak</code>. Four rows are the curated
<i>condition bundles</i> from <code>web-three/js/conditions.js</code>: a bundle moves H₀, period, tide
and Δf together, the way a real day does. Two rows are <code>h0=</code> only, which moves swell height
against the site card's own T = 15 s, tide and Δf — so the pair isolates height from period and tide.
Read the bundle rows for "what does this day look like" and the h0 rows for "what does size alone do".</p>
<p><b>What was left out.</b> <code>day=pulse</code> and <code>day=stormy</code> (the bank has six days; the
four sampled span the surf-worthy range and <code>stormy</code> is marked <code>good: false</code>).
One site only — cross-site comparison is the other sheet's job. Second Peak is ξ 0.65, so it spills more
than it plunges; Sewers (ξ 1.15) is the site to open if you are judging throw specifically. Tide is not
swept independently: it rides inside the bundles, which is why the bundle and h0 rows are not directly
comparable and are labelled as such.</p>
<p><b>The foam number can be occluded.</b> It samples the <i>projected</i> attachment corridor whether or not
terrain sits in front of it, so a low camera behind a bluff reads low foam for a wave that is breaking fine.
The model-side <code>pocket</code>/<code>brk</code> readings in the JSON are the check; a cell is only
flagged FLAT when both the pixels and the model say nothing broke.</p>`,
  'sets-locations-seasons': `
<p><b>What <code>month=</code> actually does.</b> It sets H₀ to that month's <b>p75</b> significant wave
height at CDIP SC116 (MOP v1.1, whole years 2000–2024, 218,975 hours used), de-shoaled from the 15 m
contour to the deep-water H₀ the shader re-shoals from. <b>Size only.</b> Period is seasonless in this
data — the interpolated spectral peak is 14.4–15.2 s in every month — so a month restores the site
card's own T, chop and Δf and changes nothing but height. Tide is not a CDIP product and is left alone.
<code>month=</code> and <code>day=</code> are mutually exclusive; an explicit <code>h0=</code> beats both.
August is the flat one for a measured reason: across 2000–2024 there are <b>zero hours</b> at or above
Hs 1.3 m in July or August. See <code>docs/research/PP_CDIP_CLIMATOLOGY.md</code>.</p>
<p><b>What is on this sheet.</b> The location axis is all seven presets at <code>month=january</code>
(7 rows). The season axis is two presets × three months (6 rows): January the peak month, October the
autumn shoulder, August the flat one. <code>privates</code> is the <b>synthetic-stage</b> site — it has
no measured bed, so its reef is authored rather than surveyed, and the app says so in its readout.
Camera is <code>cam=drone</code> throughout: a set is a property of the whole lineup, and the overhead
view is the one that shows the envelope arriving down the point.</p>
<p><b>What was left out.</b> 7 presets × 12 months × 5 clocks would be 420 frames. The sampled
7 + 6 = 13 rows cover the location axis completely at one month and the season axis at its two extremes
plus a shoulder, on the two sites with the most contrast in ξ (Sewers 1.15, Second Peak 0.65).
Not sampled: the other five presets across months; the nine unsampled months; any tide or Δf variation
(a month touches neither).</p>
<p><b>Why the lull is not flat.</b> <code>#env</code> floors the set envelope at 0.15 instead of exactly
zero — <code>env = (1−m) + m·cos(…)</code>, m = 0.425, so the peak is unchanged at 1.0 by construction and
only the trough rises. That floor is derived from the SC116 spectra two independent ways, not picked.
Columns 1 and 5 are the lull; if they read as dead flat water, that is the regression this sheet is for.</p>`,
};

function indexHTML(built) {
  const items = built.map(({ sheet, data }) => {
    let cells = 0, flats = 0, rows = 0;
    for (const g of data.groups) for (const r of g.rows) {
      rows++; for (const c of r.cells) { cells++; if (c.flat) flats++; }
    }
    return `<li style="margin:14px 0">
  <a href="${esc(sheet.file)}" style="font-size:16px;font-weight:600">${esc(sheet.title)}</a>
  <div class="lede" style="margin:2px 0 0">${esc(sheet.blurb)}</div>
  <div class="nums" style="margin-top:4px"><span>${rows} rows</span><span>${cells} frames</span>
  <span>${flats ? `<span class="badge flat">${flats} flat</span>` : '<span class="badge">no flat cells</span>'}</span></div>
</li>`;
  }).join('\n');
  const commit = built[0]?.data?.commit || COMMIT;
  const when = built[0]?.data?.generated || GENERATED.toISOString();
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>pointbreak QA sheets</title>
<style>${CSS}</style>
<div class="wrap">
<h1>pointbreak — QA contact sheets</h1>
<p class="lede">Deterministic frame grids for scanning. Every cell is labelled with the exact URL hash it was
captured at and links into the live app at that state; every clock spacing is derived from the model, not picked.</p>
<div class="meta"><dl>
  <dt>build</dt><dd><code>${esc(commit)}</code></dd>
  <dt>captured</dt><dd>${esc(when)}</dd>
  <dt>regenerate</dt><dd><code>node scripts/build_qa_sheets.mjs</code></dd>
</dl></div>
<ul style="list-style:none;padding:0">${items}</ul>
<div class="foot"><p>Generated into <code>qa/</code>, which is git-ignored — the PNGs are regenerable and are
not committed (see commit <code>b013197</code>, which removed 6.7 MB of unreferenced screenshots).</p></div>
</div>
`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
let server = null;
function stopServer() {
  if (server && !server.killed) { try { server.kill('SIGTERM'); } catch { /* gone */ } server = null; }
}
process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(130); });

// --html-only re-renders the pages from the JSON already in <out>, no browser
// and no server. Same reason capture_temporal.mjs has --analyze-only: a
// presentation bug should not cost a re-capture.
if (flags['html-only']) {
  const wantedIds = flags.sheets ? flags.sheets.split(',') : null;
  const rebuilt = [];
  for (const sheet of SHEETS) {
    if (wantedIds && !wantedIds.some((w) => sheet.id.startsWith(w))) continue;
    const p = join(OUT, `${sheet.id}.json`);
    if (!existsSync(p)) { console.warn(`skip ${sheet.id}: no ${p}`); continue; }
    const data = JSON.parse(readFileSync(p, 'utf8'));
    writeFileSync(join(OUT, sheet.file), sheetHTML(sheet, data, data.linkBase || LINK_BASE, SHEET_NOTES[sheet.id] || ''));
    rebuilt.push({ sheet, data });
    console.log(`-> ${join(OUT, sheet.file)}`);
  }
  writeFileSync(join(OUT, 'index.html'), indexHTML(rebuilt));
  console.log(`done (html only) -> ${OUT}`);
  process.exit(0);
}

let base = flags.base;
if (!base) {
  server = spawn('python3', [join(ROOT, 'scripts/serve.py'), String(PORT)],
    { cwd: ROOT, stdio: 'ignore' });
  base = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${base}web-three/index.html`); if (r.ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`serving ${ROOT} on ${base} (own server, killed on exit)`);
}
if (!base.endsWith('/')) base += '/';

const wanted = flags.sheets ? flags.sheets.split(',') : null;
const todo = SHEETS.filter((s) => !wanted || wanted.some((w) => s.id.startsWith(w)));
if (!todo.length) { console.error(`no sheet matches --sheets=${flags.sheets}`); stopServer(); process.exit(1); }

if (existsSync(IMG) && !flags.keep) rmSync(IMG, { recursive: true, force: true });
mkdirSync(IMG, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const built = [];
try {
  for (const sheet of todo) {
    console.log(`\n== ${sheet.id} ==`);
    const captured = await captureSheet(page, base, sheet);
    const data = {
      generated: GENERATED.toISOString(), commit: COMMIT, base, linkBase: LINK_BASE, viewport: [VIEW.width, VIEW.height],
      common: COMMON, foamThresholds: [FOAM_HI, FOAM_LO],
      corridorM: CORRIDOR_M, corridorN: CORRIDOR_N, ...captured,
    };
    writeFileSync(join(OUT, `${sheet.id}.json`), JSON.stringify(data, null, 2));
    writeFileSync(join(OUT, sheet.file), sheetHTML(sheet, data, LINK_BASE, SHEET_NOTES[sheet.id] || ''));
    built.push({ sheet, data });
    console.log(`-> ${join(OUT, sheet.file)}`);
  }
  writeFileSync(join(OUT, 'index.html'), indexHTML(built));
} finally {
  await browser.close();
  stopServer();
}

if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`\ndone -> ${OUT}  (open ${LINK_BASE}qa/ or file://${OUT}/index.html)`);
