// 6b discriminator: overlay the BAKED break line (lineProbe) on a captured
// drone frame and measure where the frame's bright foam actually sits relative
// to it. Separates the three unseparated causes of the alpha disagreement:
//   (a) render doesn't express the peel  -> line's local luma is low AND the
//       bright clusters sit far from the line
//   (b) detector captured by a brighter non-break feature -> line is bright,
//       but a BRIGHTER cluster sits elsewhere (e.g. swash, shoreward)
//   (c) peel real but low-contrast      -> line luma ~= background, no
//       dominant off-line cluster
//
// Per config it writes:
//   <name>_raw.png       untouched capture
//   <name>_overlay.png   capture + baked line (magenta), top luma clusters
//                        (yellow boxes, ranked), camera-target landmark (cyan)
//   <name>_analysis.json station lumas/percentiles, cluster table with world
//                        coordinates and signed distance to the line
// plus a matched #look / #head verdict pack at the pinned hero state, and a
// manifest recording the camera per run (MEASUREMENT_LESSONS 11 — the drone
// PRESET is deterministic, not auto-framed, but the proof is recorded anyway).
//
// Projection honesty: line points are projected at y=0 (sea level) AND y=3 m
// (approx. scaled crest height); the per-station pixel delta is reported as
// projection uncertainty. The projection itself is verified by (1) projecting
// the camera's own look-at target, which must land at frame center, and
// (2) a project->unproject round trip on every station (reported max error).
//
// Usage: node scripts/measure_peel_visibility.mjs <outdir> [--base=http://localhost:8201/web-three/]
// Serve the repo first: python3 scripts/serve.py 8201
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

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

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--'))
  .map((a) => a.replace(/^--/, '').split('=')));
const OUT = resolve(args.filter((a) => !a.startsWith('--'))[0] || '/tmp/pointbreak-6b');
const BASE = flags.base || 'http://localhost:8201/web-three/';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// Hero state = the 2026-08-14 failed hero read: sewers/drone/sim=42, 1000x750.
// speed=0 pins the clock (parseSpeedParam clamps to [0,4]; 0 freezes),
// controls=0 keeps UI luma out of the histogram, q=high pins the quality tier.
const VIEW = { width: 1000, height: 750 };
const COMMON = 'cam=drone&controls=0&q=high&speed=0';
const CONFIGS = [
  { name: 'sewers_sim42', preset: 'sewers', sim: 42 },
  { name: 'sewers_sim48', preset: 'sewers', sim: 48 },
  { name: 'secondpeak_sim42', preset: 'secondpeak', sim: 42 },
];
// The pending live-A/B verdict pack, all at the pinned hero state.
const PACK = [
  { name: 'pack_sewers_sim42_look-current', extra: 'look=current', check: { u: 'u_fidelityLook', v: 0 } },
  { name: 'pack_sewers_sim42_look-foam', extra: 'look=foam', check: { u: 'u_fidelityLook', v: 1 } },
  { name: 'pack_sewers_sim42_look-full', extra: 'look=full', check: { u: 'u_fidelityLook', v: 2 } },
  { name: 'pack_sewers_sim42_head-1', extra: 'head=1', check: { u: 'u_headRead', v: 1 } },
  { name: 'pack_sewers_sim42_head-0', extra: 'head=0', check: { u: 'u_headRead', v: 0 } },
];

// ---------------------------------------------------------------------------
// PNG decode/encode (no deps; decode mirrors scripts/measure_argmax_vs_line.mjs)
// ---------------------------------------------------------------------------
function decodePNG(buf) {
  let off = 8; let w = 0, h = 0; const idat = [];
  let colorType = 0;
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

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function encodePNG(w, h, rgb) {   // rgb = Buffer w*h*3, filter 0 per row
  const stride = w * 3;
  const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Overlay drawing on an RGB buffer
// ---------------------------------------------------------------------------
function setPx(rgb, w, h, x, y, col) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const o = (y * w + x) * 3;
  rgb[o] = col[0]; rgb[o + 1] = col[1]; rgb[o + 2] = col[2];
}
function drawDot(rgb, w, h, x, y, col, r = 1) {
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
    setPx(rgb, w, h, x + dx, y + dy, col);
}
function drawLine(rgb, w, h, x0, y0, x1, y1, col) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= steps; i++)
    setPx(rgb, w, h, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps, col);
}
function drawBox(rgb, w, h, x0, y0, x1, y1, col) {
  drawLine(rgb, w, h, x0, y0, x1, y0, col); drawLine(rgb, w, h, x1, y0, x1, y1, col);
  drawLine(rgb, w, h, x1, y1, x0, y1, col); drawLine(rgb, w, h, x0, y1, x0, y0, col);
}
function drawCross(rgb, w, h, x, y, col, r = 8) {
  drawLine(rgb, w, h, x - r, y, x + r, y, col);
  drawLine(rgb, w, h, x, y - r, x, y + r, col);
}

// ---------------------------------------------------------------------------
// Luma analysis
// ---------------------------------------------------------------------------
function lumaOf(data, ch, o) {
  return 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
}
function buildLuma(png) {
  const { w, h, ch, data } = png;
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = lumaOf(data, ch, i * ch);
  return L;
}
function localMeanLuma(L, w, h, px, py, r = 2) {
  let s = 0, n = 0;
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const x = Math.round(px) + dx, y = Math.round(py) + dy;
    if (x < 0 || y < 0 || x >= w || y >= h) continue;
    s += L[y * w + x]; n++;
  }
  return n ? s / n : NaN;
}
// Connected components over pixels with L >= thr, on a 2x-downsampled grid.
function brightClusters(L, w, h, thr, ds = 2) {
  const gw = Math.floor(w / ds), gh = Math.floor(h / ds);
  const hot = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy++) for (let gx = 0; gx < gw; gx++) {
    let m = 0;
    for (let dy = 0; dy < ds; dy++) for (let dx = 0; dx < ds; dx++)
      m = Math.max(m, L[(gy * ds + dy) * w + gx * ds + dx]);
    if (m >= thr) hot[gy * gw + gx] = 1;
  }
  const seen = new Uint8Array(gw * gh);
  const clusters = [];
  for (let i = 0; i < gw * gh; i++) {
    if (!hot[i] || seen[i]) continue;
    const stack = [i]; seen[i] = 1;
    let n = 0, sx = 0, sy = 0, peak = 0, sum = 0;
    let x0 = gw, x1 = 0, y0 = gh, y1 = 0;
    while (stack.length) {
      const j = stack.pop();
      const gx = j % gw, gy = (j / gw) | 0;
      n++; sx += gx; sy += gy;
      x0 = Math.min(x0, gx); x1 = Math.max(x1, gx);
      y0 = Math.min(y0, gy); y1 = Math.max(y1, gy);
      let m = 0, s = 0, c = 0;
      for (let dy = 0; dy < ds; dy++) for (let dx = 0; dx < ds; dx++) {
        const v = L[(gy * ds + dy) * w + gx * ds + dx];
        m = Math.max(m, v); s += v; c++;
      }
      peak = Math.max(peak, m); sum += s / c;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + ox, ny = gy + oy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const k = ny * gw + nx;
        if (hot[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
      }
    }
    clusters.push({
      areaPx: n * ds * ds,
      cx: (sx / n) * ds + ds / 2, cy: (sy / n) * ds + ds / 2,
      peakLuma: +peak.toFixed(1), meanLuma: +(sum / n).toFixed(1),
      bbox: [x0 * ds, y0 * ds, (x1 + 1) * ds, (y1 + 1) * ds],
    });
  }
  clusters.sort((a, b) => b.areaPx - a.areaPx);
  return clusters;
}
function percentileOf(sortedL, v) {   // fraction of frame pixels darker than v
  let lo = 0, hi = sortedL.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (sortedL[m] < v) lo = m + 1; else hi = m; }
  return lo / sortedL.length;
}
function quantile(sortedL, q) { return sortedL[Math.min(sortedL.length - 1, Math.floor(q * sortedL.length))]; }

// ---------------------------------------------------------------------------
// Browser side
// ---------------------------------------------------------------------------
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function loadPinned(hash) {
  // Through about:blank: a hash-only goto on a warm page fires the app's own
  // needsReloadForHash -> location.reload(), which races page.reload() and
  // detaches the frame. A cold goto per config sidesteps both that race and
  // the warm-page boot skip capture_fidelity_ab reloads for.
  await page.goto('about:blank');
  await page.goto(`${BASE}#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600);
}

// Project the baked line + landmarks inside the page (live camera matrices).
function probeAndProject() {
  const pb = window.__pointbreak;
  const cam = pb.camera;
  cam.updateMatrixWorld(true);
  const W = innerWidth, H = innerHeight;
  const proj = (x, y, z) => {
    const v = cam.position.clone(); v.set(x, y, z); v.project(cam);
    return { px: (v.x * 0.5 + 0.5) * W, py: (1 - (v.y * 0.5 + 0.5)) * H, ndcZ: v.z };
  };
  const unproj = (px, py) => {   // pixel -> world on the y=0 plane
    const v = cam.position.clone();
    v.set((px / W) * 2 - 1, -((py / H) * 2 - 1), 0.5).unproject(cam);
    const o = cam.position, d = v.sub(o).normalize();
    const t = -o.y / d.y;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  };
  const line = pb.lineProbe(2);
  const stations = (line || []).map((p) => {
    const s0 = proj(p.x, 0, p.z);
    const s3 = proj(p.x, 3, p.z);           // ~scaled crest height
    const rt = unproj(s0.px, s0.py);        // round-trip proof
    return {
      x: p.x, z: p.z, a: p.a, gap: p.gap,
      px: s0.px, py: s0.py,
      dyPx: Math.hypot(s3.px - s0.px, s3.py - s0.py),
      rtErrM: Math.hypot(rt.x - p.x, rt.z - p.z),
      visible: s0.px >= 0 && s0.px < W && s0.py >= 0 && s0.py < H && s0.ndcZ < 1,
    };
  });
  const target = pb.controls.target;
  return {
    sim: pb.sim(),
    camera: pb.camera.position.toArray(),
    target: target.toArray(),
    fov: cam.fov,
    stage: pb.stageAlpha ? pb.stageAlpha() : null,
    landmarkTargetPx: proj(target.x, target.y, target.z),  // must be ~frame center
    originPx: proj(0, 0, 0),
    stations,
  };
}
function unprojectMany(pts) {
  const pb = window.__pointbreak;
  const cam = pb.camera;
  cam.updateMatrixWorld(true);
  const W = innerWidth, H = innerHeight;
  return pts.map(([px, py]) => {
    const v = cam.position.clone();
    v.set((px / W) * 2 - 1, -((py / H) * 2 - 1), 0.5).unproject(cam);
    const o = cam.position, d = v.sub(o).normalize();
    const t = -o.y / d.y;
    return { x: o.x + d.x * t, z: o.z + d.z * t };
  });
}

const MAGENTA = [255, 0, 200], CYAN = [0, 220, 255], YELLOW = [255, 220, 0];
const manifest = {
  generated: new Date().toISOString(), viewport: [VIEW.width, VIEW.height],
  base: BASE, common: COMMON, runs: {},
};

for (const cfg of CONFIGS) {
  const hash = `preset=${cfg.preset}&${COMMON}&sim=${cfg.sim}`;
  await loadPinned(hash);
  const probe = await page.evaluate(probeAndProject);
  if (probe.sim !== cfg.sim) throw new Error(`${cfg.name}: clock mismatch ${probe.sim} != ${cfg.sim}`);

  const rawPath = join(OUT, `${cfg.name}_raw.png`);
  await page.screenshot({ path: rawPath });
  const png = decodePNG(await import('node:fs').then((m) => m.readFileSync(rawPath)));
  const { w, h, ch, data } = png;
  const L = buildLuma(png);
  const sortedL = Float32Array.from(L).sort();
  const p50 = quantile(sortedL, 0.5), p90 = quantile(sortedL, 0.9);
  const p99 = quantile(sortedL, 0.99), p997 = quantile(sortedL, 0.997), max = sortedL[sortedL.length - 1];

  // Per-station local luma vs the frame
  const vis = probe.stations.filter((s) => s.visible);
  for (const s of vis) {
    s.luma = +localMeanLuma(L, w, h, s.px, s.py).toFixed(1);
    s.lumaPct = +percentileOf(sortedL, s.luma).toFixed(4);
  }

  // Brightest clusters, world-located
  const thr = Math.max(180, p997);
  const clusters = brightClusters(L, w, h, thr).slice(0, 8);
  const worlds = await page.evaluate(unprojectMany, clusters.map((c) => [c.cx, c.cy]));
  const zbAt = (x) => {   // interpolate the baked line
    const ln = probe.stations;
    if (!ln.length) return NaN;
    if (x <= ln[0].x) return ln[0].z;
    if (x >= ln[ln.length - 1].x) return ln[ln.length - 1].z;
    for (let i = 1; i < ln.length; i++) if (ln[i].x >= x) {
      const a = ln[i - 1], b = ln[i];
      return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x);
    }
    return ln[ln.length - 1].z;
  };
  clusters.forEach((c, i) => {
    c.rank = i + 1;
    c.world = { x: +worlds[i].x.toFixed(1), z: +worlds[i].z.toFixed(1) };
    c.dzFromLineM = +(worlds[i].z - zbAt(worlds[i].x)).toFixed(1);  // + = shoreward
    // nearest visible station, in pixels
    let dmin = Infinity;
    for (const s of vis) dmin = Math.min(dmin, Math.hypot(s.px - c.cx, s.py - c.cy));
    c.distToLinePx = +dmin.toFixed(1);
  });

  // Overlay
  const rgb = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) {
    rgb[i * 3] = data[i * ch]; rgb[i * 3 + 1] = data[i * ch + 1]; rgb[i * 3 + 2] = data[i * ch + 2];
  }
  for (const c of clusters)
    drawBox(rgb, w, h, c.bbox[0], c.bbox[1], c.bbox[2], c.bbox[3], YELLOW);
  for (let i = 1; i < vis.length; i++)
    drawLine(rgb, w, h, vis[i - 1].px, vis[i - 1].py, vis[i].px, vis[i].py, MAGENTA);
  for (const s of vis) drawDot(rgb, w, h, s.px, s.py, MAGENTA, 1);
  drawCross(rgb, w, h, probe.landmarkTargetPx.px, probe.landmarkTargetPx.py, CYAN);
  writeFileSync(join(OUT, `${cfg.name}_overlay.png`), encodePNG(w, h, rgb));

  const lineLumas = vis.map((s) => s.luma).sort((a, b) => a - b);
  const summary = {
    hash, sim: probe.sim, camera: probe.camera, target: probe.target, fov: probe.fov,
    landmarkTargetPx: probe.landmarkTargetPx,   // proof: should be ~[w/2, h/2]
    projRoundTripMaxErrM: +Math.max(...probe.stations.map((s) => s.rtErrM)).toFixed(3),
    projWaveHeightMaxShiftPx: +Math.max(...probe.stations.map((s) => s.dyPx)).toFixed(1),
    stationsTotal: probe.stations.length, stationsVisible: vis.length,
    frameLuma: { p50: +p50.toFixed(1), p90: +p90.toFixed(1), p99: +p99.toFixed(1), p997: +p997.toFixed(1), max: +max.toFixed(1) },
    clusterThreshold: +thr.toFixed(1),
    lineLuma: {
      median: lineLumas.length ? +lineLumas[Math.floor(lineLumas.length / 2)].toFixed(1) : null,
      max: lineLumas.length ? +lineLumas[lineLumas.length - 1].toFixed(1) : null,
      medianPctOfFrame: vis.length ? +vis.map((s) => s.lumaPct).sort()[Math.floor(vis.length / 2)].toFixed(3) : null,
      fracStationsInTopCluster: vis.length
        ? +(vis.filter((s) => clusters.some((c) => s.px >= c.bbox[0] && s.px <= c.bbox[2] && s.py >= c.bbox[1] && s.py <= c.bbox[3])).length / vis.length).toFixed(3)
        : null,
    },
    clusters,
    stations: vis.map((s) => ({
      x: s.x, z: +s.z.toFixed(1), a: +s.a.toFixed(1),
      px: +s.px.toFixed(1), py: +s.py.toFixed(1), luma: s.luma, lumaPct: s.lumaPct,
    })),
    stageAlpha: probe.stage,
  };
  writeFileSync(join(OUT, `${cfg.name}_analysis.json`), JSON.stringify(summary, null, 2));
  manifest.runs[cfg.name] = { hash, camera: probe.camera, target: probe.target, sim: probe.sim };
  console.log(`${cfg.name}: line median luma ${summary.lineLuma.median} (pct ${summary.lineLuma.medianPctOfFrame}), ` +
    `frame p99 ${summary.frameLuma.p99}, top cluster dz ${clusters[0] ? clusters[0].dzFromLineM : 'n/a'} m, ` +
    `landmark at [${probe.landmarkTargetPx.px.toFixed(0)}, ${probe.landmarkTargetPx.py.toFixed(0)}]`);
}

// ---------------------------------------------------------------------------
// The matched #look / #head verdict pack (stills for the pending live A/B)
// ---------------------------------------------------------------------------
for (const p of PACK) {
  const hash = `preset=sewers&${COMMON}&sim=42&${p.extra}`;
  await loadPinned(hash);
  const state = await page.evaluate((uName) => ({
    sim: window.__pointbreak.sim(),
    u: window.__pointbreak.uniforms[uName]?.value,
    camera: window.__pointbreak.camera.position.toArray(),
  }), p.check.u);
  if (state.sim !== 42) throw new Error(`${p.name}: clock mismatch ${state.sim}`);
  if (state.u !== p.check.v) throw new Error(`${p.name}: ${p.check.u} = ${state.u}, wanted ${p.check.v}`);
  await page.screenshot({ path: join(OUT, `${p.name}.png`) });
  manifest.runs[p.name] = { hash, camera: state.camera, [p.check.u]: state.u };
  console.log(`captured ${p.name}`);
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
await browser.close();
if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`done -> ${OUT}`);
