// Lip-facet transect probe (docs/research/LIP_FACETS_2026-09-24.md).
//
// The elimination matrix (capture_lip_facets_ab.mjs) says WHICH switch owns
// the bright polygons at the heads. This reads the GPU surface itself through
// __pointbreak.curlProbe — the shipped surfacePos, same uniforms, same bed
// textures (GPU path owns picture claims) — along shore-normal transects at
// the grid's own vertex columns, sampled at 1/16 of a core cell so every 16th
// sample IS a grid vertex, and reports the fold as the MESH sees it:
//
//   layers      1 + reversals of the chord direction in z: how many layers of
//               the sheet a vertical ray through the fold crosses.
//   foldCells   chords (vertex j -> j+1) whose displaced z runs backwards
//               (dz < 0: the overturned band). This is how many triangles wide
//               the plate is along z.
//   aerCells    chords across which vAerLip goes from < 0.1 to > 0.9: how
//               many triangles the white paint takes to saturate.
//   maxJumpDeg  largest angle between consecutive chord normals in (z, y) —
//               the forward-difference normal at vertex j IS the chord j->j+1
//               normal (GRID_VERT), so this is the per-triangle normal
//               discontinuity the fragment interpolates across.
//   backChords  chords whose normal has N.y < 0 (from above they are back
//               faces; the fragment flips Ng by gl_FrontFacing per triangle).
//   fineReach   the fold's horizontal reach on the fine 0.1 m sampling, so
//               the mesh's rendition can be judged against the surface it is
//               sampling.
//
// Usage: node scripts/probe_lip_facets.mjs [--base=http://127.0.0.1:8134]
//        [--out=qa/lip-facets-2026-09-24/probe.json] [--sim=42] [--hash=...]

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname,
].filter(Boolean);
let chromium;
for (const candidate of PW_CANDIDATES) {
  try { ({ chromium } = await import(candidate)); break; } catch { /* next */ }
}
if (!chromium) { console.error('playwright not found. Set PLAYWRIGHT_DIR'); process.exit(1); }

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const body = a.replace(/^--/, ''), i = body.indexOf('=');
  return i < 0 ? [body, '1'] : [body.slice(0, i), body.slice(i + 1)];
}));
const BASE_URL = flags.base || 'http://127.0.0.1:8134';
const OUT = resolve(flags.out || join(ROOT, 'qa/lip-facets-2026-09-24/probe.json'));
const SIM = Number(flags.sim || 42);
const HASH = flags.hash || `preset=sewers&surfer=0&hud=0&controls=0&speed=0&q=high&cam=drone&sim=${SIM}`;

// Grid vertex lattice in the core (main.js makeWaterGeometry + stretchAxis):
// PlaneGeometry parameter v in [-half, half] maps to v/CORE inside the core.
const STAGE_W = 600, STAGE_D = 500, STAGE_Z0 = 10, CORE = 0.8;
const SEG_X = 512, SEG_Z = 384;                       // q=high
const CELL_X = STAGE_W / (SEG_X * CORE), CELL_Z = STAGE_D / (SEG_Z * CORE);
const vx = (i) => (-STAGE_W / 2 + i * STAGE_W / SEG_X) / CORE;
const vz = (j) => STAGE_Z0 + (-STAGE_D / 2 + j * STAGE_D / SEG_Z) / CORE;
const SUB = 16, N = 1024;                             // 64 cells per transect

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
await page.goto('about:blank');
await page.goto(`${BASE_URL}/web-three/#${HASH}`, { waitUntil: 'load' });
await page.waitForTimeout(2600);
const meta = await page.evaluate(() => {
  const pb = window.__pointbreak;
  return { preset: pb.state.preset, sim: pb.sim(), cell: pb.uniforms.u_cell.value.toArray(),
           curl: pb.uniforms.u_curl.value, lipAer: pb.uniforms.u_lipAer.value };
});
if (meta.preset !== 'sewers') throw new Error(`preset ${meta.preset}`);
if (Math.abs(meta.cell[1] - CELL_Z) > 1e-6) throw new Error(`cell mismatch ${meta.cell} vs ${CELL_X},${CELL_Z}`);

// 1. Find the heads: scan every vertex column across the stage core, one
//    coarse transect each, and keep the columns where the bend has gone past
//    a quarter turn (curl = th/PI > 0.25, i.e. 45 deg) somewhere.
const coarse = await page.evaluate(({ xs }) => xs.map((x) => {
  const rows = window.__pointbreak.curlProbe(x, -300, 300, 1024);
  let best = null;
  for (const r of rows) if (r.land < 0.5 && (!best || r.curl > best.curl)) best = r;
  return { x, curl: best?.curl ?? 0, z0: best?.z0 ?? null, aer: best?.aer ?? 0, pocket: best?.pocket ?? 0 };
}), { xs: Array.from({ length: SEG_X * CORE + 1 }, (_, i) => vx(i + SEG_X * (1 - CORE) / 2)).filter((x) => Math.abs(x) <= 240) });
const active = coarse.filter((c) => c.curl > 0.25);
// cluster contiguous columns into heads
const heads = [];
for (const c of active) {
  const h = heads[heads.length - 1];
  if (h && c.x - h.cols[h.cols.length - 1].x < 2.5 * CELL_X) h.cols.push(c); else heads.push({ cols: [c] });
}
for (const h of heads) {
  h.peak = h.cols.reduce((a, b) => (b.curl > a.curl ? b : a));
  h.xSpanM = h.cols[h.cols.length - 1].x - h.cols[0].x + CELL_X;
  h.xCells = h.cols.length;
}

// 2. Fine transects through each head: the peak column and its neighbours,
//    z sampled so every SUB-th sample is a grid vertex.
function analyse(rows) {
  const verts = rows.filter((_, k) => k % SUB === 0);
  const chords = [];
  for (let j = 0; j + 1 < verts.length; j++) {
    const a = verts[j], b = verts[j + 1];
    const dz = b.z - a.z, dy = b.y - a.y;
    // normal of the chord in (z, y), +y up for an unfolded surface: (-dy, dz)
    const ang = Math.atan2(dz, -dy);     // angle of N = (-dy, dz) measured as atan2(N.y, N.z)
    chords.push({ z0: a.z0, dz, dy, ang, ny: dz / Math.hypot(dz, dy), aer0: a.aer, aer1: b.aer,
                  curl0: a.curl, curl1: b.curl, foam0: a.foam, pocket0: a.pocket,
                  land: Math.max(a.land, b.land) });
  }
  const wet = chords.filter((c) => c.land < 0.5);
  const back = wet.filter((c) => c.dz < 0);
  let maxJump = 0, maxJumpZ = null;
  for (let j = 0; j + 1 < wet.length; j++) {
    let d = Math.abs(wet[j + 1].ang - wet[j].ang);
    if (d > Math.PI) d = 2 * Math.PI - d;
    if (d > maxJump) { maxJump = d; maxJumpZ = wet[j + 1].z0; }
  }
  // the white paint's rise: first vertex with aer > 0.9 vs last before it with aer < 0.1
  let aerCells = null, aerFrom = null;
  const hi = verts.findIndex((v) => v.aer > 0.9);
  if (hi > 0) {
    let lo = hi - 1;
    while (lo > 0 && verts[lo].aer >= 0.1) lo--;
    aerCells = hi - lo; aerFrom = verts[lo].z0;
  }
  // fine-sampled fold reach: sum of backwards travel in displaced z
  let fineReach = 0;
  for (let k = 0; k + 1 < rows.length; k++) {
    if (rows[k].land > 0.5 || rows[k + 1].land > 0.5) continue;
    const d = rows[k + 1].z - rows[k].z;
    if (d < 0) fineReach -= d;
  }
  const meshReach = back.reduce((s, c) => s - c.dz, 0);
  // layers a vertical ray can cross: each reversal of the chord direction in z
  // starts a new layer of the sheet (forward -> back -> forward = 3 layers)
  let flips = 0;
  for (let j = 0; j + 1 < wet.length; j++) if ((wet[j].dz < 0) !== (wet[j + 1].dz < 0)) flips++;
  const layers = flips + 1;
  const curlMax = Math.max(...rows.map((r) => (r.land < 0.5 ? r.curl : 0)));
  const aerMax = Math.max(...rows.map((r) => (r.land < 0.5 ? r.aer : 0)));
  return {
    foldCells: back.length, layers, backChords: back.map((c) => +c.z0.toFixed(2)),
    meshReachM: +meshReach.toFixed(2), fineReachM: +fineReach.toFixed(2),
    maxJumpDeg: +(maxJump * 180 / Math.PI).toFixed(1), maxJumpAtZ0: maxJumpZ,
    aerCells, aerFromZ0: aerFrom, curlMax: +curlMax.toFixed(3), aerMax: +aerMax.toFixed(3),
    chordNormalsDeg: wet.map((c) => +(c.ang * 180 / Math.PI).toFixed(0)),
    vertexAer: verts.map((v) => +v.aer.toFixed(2)), vertexCurl: verts.map((v) => +v.curl.toFixed(2)),
    vertexY: verts.map((v) => +v.y.toFixed(2)), vertexZ: verts.map((v) => +v.z.toFixed(2)),
    vertexZ0: verts.map((v) => +v.z0.toFixed(2)),
    // which paint can whiten the fold: foam / pocket at the vertices, and the
    // section mask + reef window that gate the aerated lip at this column
    vertexFoam: verts.map((v) => +v.foam.toFixed(2)), vertexPocket: verts.map((v) => +v.pocket.toFixed(2)),
    breakMask: +rows[0].breakMask.toFixed(3), reefWin: +rows[0].reefWin.toFixed(3),
    foamAtFold: +Math.max(...back.map((c) => c.foam0), 0).toFixed(2),
    pocketAtFold: +Math.max(...back.map((c) => c.pocket0), 0).toFixed(2),
  };
}

for (const h of heads) {
  h.transects = [];
  const ip = Math.round((h.peak.x * CORE + STAGE_W / 2) / (STAGE_W / SEG_X));
  for (const di of [-2, -1, 0, 1, 2]) {
    const x = vx(ip + di);
    // z window: 64 cells centred on the peak's fold, snapped to the lattice
    const jc = Math.round(((h.peak.z0 - STAGE_Z0) * CORE + STAGE_D / 2) / (STAGE_D / SEG_Z));
    const j0 = jc - 32;
    const z0 = vz(j0), z1 = vz(j0) + (N - 1) * CELL_Z / SUB;
    const rows = await page.evaluate(({ x, z0, z1, n }) => window.__pointbreak.curlProbe(x, z0, z1, n), { x, z0, z1, n: N });
    h.transects.push({ x: +x.toFixed(3), col: ip + di, ...analyse(rows) });
  }
}
await browser.close();

const summary = {
  hash: HASH, meta, cellM: [CELL_X, CELL_Z], sub: SUB,
  heads: heads.map((h) => ({
    peakX: h.peak.x, peakCurl: +h.peak.curl.toFixed(3), peakZ0: h.peak.z0, xCells: h.xCells, xSpanM: +h.xSpanM.toFixed(1),
    transects: h.transects,
  })),
  columnsScanned: coarse.length, activeColumns: active.length,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(summary, null, 1));

console.log(`sim ${meta.sim}  cell ${CELL_X.toFixed(3)} x ${CELL_Z.toFixed(3)} m  heads ${heads.length}  (columns with curl>0.25: ${active.length}/${coarse.length})`);
for (const h of summary.heads) {
  console.log(`\nhead at x=${h.peakX.toFixed(1)}  curl ${h.peakCurl}  alongshore ${h.xCells} cells (${h.xSpanM} m)`);
  console.log('  x        foldCells layers meshReach fineReach maxJump  aerCells curlMax aerMax foam@fold pocket@fold brkMask reefWin');
  for (const t of h.transects)
    console.log(`  ${t.x.toFixed(1).padStart(7)}  ${String(t.foldCells).padStart(9)} ${String(t.layers).padStart(6)} ${String(t.meshReachM).padStart(9)} ${String(t.fineReachM).padStart(9)} ${String(t.maxJumpDeg).padStart(7)}  ${String(t.aerCells).padStart(8)} ${String(t.curlMax).padStart(7)} ${String(t.aerMax).padStart(6)} ${String(t.foamAtFold).padStart(9)} ${String(t.pocketAtFold).padStart(11)} ${String(t.breakMask).padStart(7)} ${String(t.reefWin).padStart(7)}`);
}
console.log(`\nwrote ${OUT}`);
