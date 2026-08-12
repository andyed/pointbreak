// Temporal capture + measurement harness (Track 6, 2026-08-11).
//
// WHY THIS EXISTS
// The 2026-08-11 external-validity audit graded the sim from ONE frozen frame
// (`sim=42`), so every claim the model makes about TIME went unobserved: how
// fast the zipper peels down the point, how often sets arrive, whether foam
// persists and advects or flickers in place. This harness captures an N-frame
// sequence on a fixed SIM-time step and measures those three things straight
// off the rendered pixels — no CPU twin anywhere in the path. It is the
// replacement acceptance instrument for `rideMetric`, which scores through the
// displaced JS twin (`main.js:887`) and therefore certifies twin
// self-consistency rather than what the GPU drew.
//
// DETERMINISM
// Wall-clock capture is not comparable run to run: the sim integrates
// `simTime += dt*state.speed` off rAF timestamps (`main.js:578-580`), so two
// runs of the same nominal sequence land on different phases. Here the clock is
// driven instead:
//   1. `#sim=<t0>` seeds the first frame through applyHashParams (`main.js:807,
//      :811`), which also anchors the drift clock (`main.js:815`) — the same
//      contract scripts/capture_audit_matrix.mjs relies on.
//   2. `state.speed = 0` is then set through the debug hook, which zeroes the
//      accumulation term while leaving `state.paused` false — so the surfer /
//      audio / spray block at `main.js:736` still runs against the injected
//      time. (`#speed=0` in the hash does NOT work: `parseFloat('0') || 1`
//      at `main.js:801` is a falsy-default trap and yields 1.)
//   3. Each subsequent frame is `__pointbreak.setSim(t)` (`main.js:830`)
//      followed by two rAF ticks, so the render loop has copied simTime into
//      `u_time` and drawn before the screenshot.
// `--reload-each` does the literal per-frame `#sim=` + reload instead; it is
// slower by a module re-init per frame and exists to VALIDATE mode (2) rather
// than to be used. `--verify-clock` runs both and reports the residual.
//
// USAGE
//   node scripts/capture_temporal.mjs <sequence> [--flags]
//   node scripts/capture_temporal.mjs zipper --preset=sewers
//   node scripts/capture_temporal.mjs cadence --preset=secondpeak --out=/tmp/x
//   node scripts/capture_temporal.mjs foam --preset=jacks --binM=2
//   node scripts/capture_temporal.mjs zipper --preset=sewers --analyze-only
//   node scripts/capture_temporal.mjs zipper --preset=sewers --verify-clock
//   node scripts/capture_temporal.mjs custom --hash='preset=sewers&cam=drone&hud=0' \
//        --t0=200 --dt=0.5 --n=48
//
// Named sequences (SEQUENCES below) fix t0/dt/n/viewport for the three
// measurements; every field is overridable on the command line, and `custom`
// takes a raw hash. Output: <out>/<name>/frame_0000.png … plus manifest.json
// (every parameter, per-frame sim time, camera matrices, live model state) and
// metrics.json (the measurements). Re-analysis needs no browser.
//
// FLAGS
//   --out=DIR        sequence root (default: scratchpad/temporal)
//   --base=URL       renderer URL (default http://localhost:8127/web-three/)
//   --preset=NAME    overrides the preset inside the sequence hash
//   --hash=STR       full hash override (implies `custom`)
//   --t0 --dt --n    sim start (s), sim step (s), frame count
//   --w --h          viewport px
//   --binM=M         world bin size for the analysis grid, metres
//   --analyze-only   skip capture, re-measure the PNGs already in <out>/<name>
//   --no-analyze     capture only
//   --reload-each    per-frame hash nav + reload instead of setSim()
//   --verify-clock   capture 3 frames both ways and report the pixel residual
//   --keep           do not wipe existing PNGs in the output dir first
//   --rig=nadir      override the hash camera with a straight-down measurement
//                    rig (--alt, --cx, --cz, --halfw). The Drone preset is a
//                    tilted 50-degree shot that puts the surf zone in the top
//                    strip of frame and spends most pixels on empty lagoon; a
//                    nadir rig makes the pixel->world map near-uniform and
//                    frames the whole reef. The camera never feeds back into
//                    the model, so this changes the SAMPLING, not the thing
//                    sampled.

import { mkdirSync, existsSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';

// ---------------------------------------------------------------- args ------
const rawArgs = process.argv.slice(2);
const flags = {};
const positional = [];
for (const a of rawArgs) {
  if (a.startsWith('--')) {
    const [k, ...v] = a.slice(2).split('=');
    flags[k] = v.length ? v.join('=') : '1';
  } else positional.push(a);
}
const num = (k, d) => (flags[k] !== undefined && Number.isFinite(parseFloat(flags[k])) ? parseFloat(flags[k]) : d);

const SCRATCH = '/private/tmp/claude-501/-Users-andyed-Documents-dev/f3519e92-8703-4f55-bd14-9f6ce72c6584/scratchpad';
const OUT_ROOT = flags.out || join(SCRATCH, 'temporal');
const BASE = flags.base || 'http://localhost:8127/web-three/';

// Named sequences. dt is chosen against the phenomenon's own time scale:
// the zipper moves tens of metres per second so it needs sub-second steps;
// set cadence is a ~125-167 s beat so it needs ~10 min of sim at a step that
// still resolves the T~15 s carrier (aliasing check comes free — the carrier
// peak in the autocorrelation validates the instrument).
// A hard constraint learned the expensive way: the foam signal is isolated as a
// departure from each bin's own TEMPORAL median (see analyze()), so the capture
// window must span several carrier periods. At 8 s of sim on a T = 15 s swell
// the median is the instantaneous field, the residual collapses to noise pinned
// in place, and the zipper cross-correlation returns ~0 m/s at r = 0.97 —
// confidently wrong. Every sequence below spans >= 4 T.
const SEQUENCES = {
  zipper:  { hash: 'preset=sewers&cam=drone&hud=0', t0: 200, dt: 0.4, n: 160, w: 1280, h: 720, binM: 2 },
  cadence: { hash: 'preset=sewers&cam=drone&hud=0', t0: 200, dt: 2.0, n: 260, w: 960,  h: 540, binM: 6 },
  foam:    { hash: 'preset=sewers&cam=drone&hud=0', t0: 200, dt: 1.0, n: 120, w: 1280, h: 720, binM: 2 },
  custom:  { hash: 'preset=sewers&cam=drone&hud=0', t0: 200, dt: 1.0, n: 60,  w: 1280, h: 720, binM: 3 },
};

const seqName = positional[0] || (flags.hash ? 'custom' : 'zipper');
const seqDef = SEQUENCES[seqName];
if (!seqDef) { console.error(`unknown sequence "${seqName}" — one of ${Object.keys(SEQUENCES).join(', ')}`); process.exit(1); }

let hash = flags.hash || seqDef.hash;
if (flags.preset) hash = hash.replace(/preset=[^&]*/, `preset=${flags.preset}`);
if (flags.cam) hash = hash.replace(/cam=[^&]*/, `cam=${flags.cam}`);

const CFG = {
  name: flags.name || `${seqName}_${(hash.match(/preset=([^&]*)/) || [, 'x'])[1]}`,
  hash, t0: num('t0', seqDef.t0), dt: num('dt', seqDef.dt), n: Math.round(num('n', seqDef.n)),
  w: Math.round(num('w', seqDef.w)), h: Math.round(num('h', seqDef.h)), binM: num('binM', seqDef.binM),
  reloadEach: flags['reload-each'] === '1',
  // nadir is the DEFAULT measurement rig: the Drone preset is a tilted 50-deg
  // shot that puts the surf zone in the top strip and spends most of the frame
  // on empty lagoon. `--rig=hash` keeps whatever camera the hash asked for.
  rig: flags.rig || 'nadir',
  alt: num('alt', 600),
  // cx/cz/halfw default to "unset" -> autoframe() finds the surf zone from a
  // short wide prescan, so the rig follows each preset's own re-centred stage
  // instead of a Sewers-shaped constant.
  cx: flags.cx !== undefined ? num('cx', 0) : null,
  cz: flags.cz !== undefined ? num('cz', 0) : null,
  halfw: flags.halfw !== undefined ? num('halfw', 150) : null,
};
const OUT = join(OUT_ROOT, CFG.name);

// ------------------------------------------------------------ playwright ----
// No node_modules in this repo on purpose; borrow the sibling install exactly
// as scripts/capture_audit_matrix.mjs does.
async function loadChromium() {
  const cands = [process.env.PLAYWRIGHT_DIR,
    '/Users/andyed/Documents/dev/psychodeli-webgl-port/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const c of cands) { try { return (await import(c)).chromium; } catch { /* next */ } }
  return null;
}

// ---------------------------------------------------------------- capture ---
// Snapshot everything a later re-analysis (or a reader of the sidecar) needs:
// the live model state, and the camera matrices the pixel->world map is built
// from. THREE stores Matrix4.elements column-major; kept raw so the inverse
// projection here is literally Vector3.unproject().
const PAGE_SNAPSHOT = () => {
  const pb = window.__pointbreak;
  const c = pb.camera;
  const s = pb.state;
  const txt = (id) => (document.getElementById(id) || {}).textContent || null;
  return {
    sim: pb.sim(),
    camera: {
      position: [c.position.x, c.position.y, c.position.z],
      fov: c.fov, aspect: c.aspect,
      matrixWorld: Array.from(c.matrixWorld.elements),
      projectionMatrixInverse: Array.from(c.projectionMatrixInverse.elements),
    },
    state: {
      preset: s.preset, geoSpot: s.geoSpot, alpha: s.alpha, xi: s.xi, T: s.T, H0: s.H0,
      dF: s.dF, tau: s.tau, chop: s.chop, tide: s.tide, sections: s.sections,
      speed: s.speed, paused: s.paused, surfer: s.surfer, bedShape: s.bedShape,
      stageStart: s.stageStart, stageEnd: s.stageEnd, geoMix: s.geoMix,
    },
    uniforms: {
      breakMix: pb.uniforms.u_breakMix.value, psiMix: pb.uniforms.u_psiMix.value,
      depthMix: pb.uniforms.u_depthMix.value, breakShape: pb.uniforms.u_breakShape.value,
      breakX: [pb.uniforms.u_breakX.value.x, pb.uniforms.u_breakX.value.y],
    },
    hud: { alpha: txt('hudAlpha'), swell: txt('hudSwell'), lam: txt('hudLam'), geo: txt('hudGeo') },
    devicePixelRatio: window.devicePixelRatio,
    canvas: [document.getElementById('gl').clientWidth, document.getElementById('gl').clientHeight],
  };
};

// Straight-down measurement rig. The camera is pure sampling — nothing in the
// model reads it — so replacing the Drone preset's tilted 50-degree shot with a
// nadir view is a change of instrument, not of subject. up = -z puts +x to the
// right and +z (shoreward) down the frame, which is the orientation every
// metric below assumes. controls.update() is stubbed rather than merely
// disabled: `enabled=false` blocks input only, and main.js:733 calls update()
// every frame, which would re-derive the pose from OrbitControls' spherical
// state and undo the rig.
const APPLY_NADIR = ({ alt, cx, cz, halfw, w, h }) => {
  const pb = window.__pointbreak, c = pb.camera;
  pb.controls.enabled = false;
  pb.controls.update = () => {};
  c.up.set(0, 0, -1);
  c.position.set(cx, alt, cz);
  pb.controls.target.set(cx, 0, cz);
  c.lookAt(cx, 0, cz);
  // half-width covered on the ground = alt*tan(fovV/2)*aspect; solve for fovV
  c.fov = 2 * Math.atan((halfw / (w / h)) / alt) * 180 / Math.PI;
  c.updateProjectionMatrix();
  c.updateMatrixWorld(true);
  return { fov: c.fov, groundHalfWidth_m: halfw, groundHalfDepth_m: halfw / (w / h) };
};

// Advance the sim clock and wait for the render loop to have consumed it.
// Two rAF ticks: the first frame() call may already have been queued with the
// old time, the second is guaranteed to draw with the new one.
const STEP_AND_SETTLE = (t) => new Promise((res) => {
  window.__pointbreak.setSim(t);
  requestAnimationFrame(() => requestAnimationFrame(() => res(window.__pointbreak.sim())));
});

async function capture() {
  const chromium = await loadChromium();
  if (!chromium) { console.error('playwright not found'); process.exit(1); }
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  if (flags.keep !== '1') for (const f of readdirSync(OUT)) if (f.endsWith('.png')) unlinkSync(join(OUT, f));

  const browser = await chromium.launch({ args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: CFG.w, height: CFG.h } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  const url0 = `${BASE}#${CFG.hash}&sim=${CFG.t0}`;
  await page.goto(url0, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });   // hash-only nav would not re-init the modules
  await page.waitForTimeout(2600);            // shader compile + first bakes, as in capture_audit_matrix
  // Freeze the accumulator, not the loop (see header, step 2).
  await page.evaluate(() => { window.__pointbreak.state.speed = 0; });
  let rig = null;
  if (CFG.rig === 'nadir') {
    if (CFG.cx === null || CFG.cz === null || CFG.halfw === null) {
      // Wide prescan over the whole stage, then re-aim. Steps of T/5 so the
      // eight frames cover more than a carrier period and no single wave phase
      // decides the framing.
      const st0 = await page.evaluate(() => window.__pointbreak.state);
      const wide = { alt: 900, cx: 0.5 * ((st0.stageStart ?? -110) + (st0.stageEnd ?? 290)), cz: -40, halfw: 300, w: CFG.w, h: CFG.h };
      await page.evaluate(APPLY_NADIR, wide);
      const bufs = [];
      for (let i = 0; i < 8; i++) {
        await page.evaluate(STEP_AND_SETTLE, CFG.t0 + i * (st0.T / 5));
        bufs.push(await page.screenshot());
      }
      const camWide = (await page.evaluate(PAGE_SNAPSHOT)).camera;
      const af = autoframe(bufs, camWide, CFG.w, CFG.h);
      if (af) {
        if (CFG.cx === null) CFG.cx = Math.round(af.cx);
        if (CFG.cz === null) CFG.cz = Math.round(af.cz);
        if (CFG.halfw === null) CFG.halfw = Math.round(af.halfw);
        console.log(`  autoframe: surf zone at x ${CFG.cx} +/- ${CFG.halfw} m, z ${CFG.cz} m (${af.hotBins} hot bins)`);
      } else {
        CFG.cx ??= 0; CFG.cz ??= -60; CFG.halfw ??= 190;
        console.warn('  autoframe found no foam — falling back to the whole stage');
      }
    }
    rig = await page.evaluate(APPLY_NADIR, { alt: CFG.alt, cx: CFG.cx, cz: CFG.cz, halfw: CFG.halfw, w: CFG.w, h: CFG.h });
    console.log(`  nadir rig: alt ${CFG.alt} m at (${CFG.cx}, ${CFG.cz}), fov ${rig.fov.toFixed(1)} deg, ground ${(2 * CFG.halfw).toFixed(0)} x ${(2 * rig.groundHalfDepth_m).toFixed(0)} m, ${(2 * CFG.halfw / CFG.w).toFixed(3)} m/px`);
  }

  const frames = [];
  for (let i = 0; i < CFG.n; i++) {
    const t = CFG.t0 + i * CFG.dt;
    if (CFG.reloadEach) {
      await page.goto(`${BASE}#${CFG.hash}&sim=${t}`, { waitUntil: 'load' });
      await page.reload({ waitUntil: 'load' });
      await page.waitForTimeout(2600);
      await page.evaluate(() => { window.__pointbreak.state.speed = 0; });
      if (CFG.rig === 'nadir') await page.evaluate(APPLY_NADIR, { alt: CFG.alt, cx: CFG.cx, cz: CFG.cz, halfw: CFG.halfw, w: CFG.w, h: CFG.h });
    }
    const got = await page.evaluate(STEP_AND_SETTLE, t);
    if (Math.abs(got - t) > 1e-6) {
      console.warn(`WARN frame ${i}: sim drifted, asked ${t} got ${got} (speed not zeroed?)`);
    }
    const file = `frame_${String(i).padStart(4, '0')}.png`;
    await page.screenshot({ path: join(OUT, file) });
    frames.push({ i, sim: t, file });
    if (i % 20 === 0) process.stdout.write(`  frame ${i}/${CFG.n} (sim ${t.toFixed(1)} s)\n`);
  }

  const snap = await page.evaluate(PAGE_SNAPSHOT);
  const manifest = { generated: new Date().toISOString(), tool: 'scripts/capture_temporal.mjs',
    sequence: seqName, cfg: CFG, base: BASE, url0, rig, frames, page: snap, consoleErrors: errors };
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close();
  if (errors.length) console.error(`CONSOLE ERRORS (${errors.length}):\n` + errors.slice(0, 10).join('\n'));
  console.log(`captured ${frames.length} frames -> ${OUT}`);
  return manifest;
}

// -------------------------------------------------------- clock validation --
// Prove the setSim() path equals the literal per-frame `#sim=` reload path
// before trusting any number that came out of it. Same three sim times, both
// drive modes, compared as mean |luma| difference over the frame.
async function verifyClock() {
  const chromium = await loadChromium();
  if (!chromium) { console.error('playwright not found'); process.exit(1); }
  const dir = join(OUT, '_clockcheck');
  mkdirSync(dir, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal'] });
  const page = await browser.newPage({ viewport: { width: CFG.w, height: CFG.h } });
  const times = [CFG.t0, CFG.t0 + CFG.dt, CFG.t0 + 7 * CFG.dt];

  await page.goto(`${BASE}#${CFG.hash}&sim=${CFG.t0}`, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(2600);
  await page.evaluate(() => { window.__pointbreak.state.speed = 0; });
  for (const t of times) {
    await page.evaluate(STEP_AND_SETTLE, t);
    await page.screenshot({ path: join(dir, `setsim_${t}.png`) });
  }
  for (const t of times) {
    await page.goto(`${BASE}#${CFG.hash}&sim=${t}`, { waitUntil: 'load' });
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(2600);
    await page.evaluate(() => { window.__pointbreak.state.speed = 0; });
    await page.evaluate(STEP_AND_SETTLE, t);
    await page.screenshot({ path: join(dir, `reload_${t}.png`) });
  }
  await browser.close();
  const out = [];
  for (const t of times) {
    const a = decodePNG(readFileSync(join(dir, `setsim_${t}.png`)));
    const b = decodePNG(readFileSync(join(dir, `reload_${t}.png`)));
    let sum = 0, max = 0;
    for (let i = 0; i < a.width * a.height; i++) {
      const d = Math.abs(luma(a.data, i * 4) - luma(b.data, i * 4));
      sum += d; if (d > max) max = d;
    }
    out.push({ sim: t, meanAbsLuma255: (sum / (a.width * a.height)) * 255, maxAbsLuma255: max * 255 });
  }
  console.log('CLOCK VALIDATION (setSim vs per-frame #sim reload):');
  for (const r of out) console.log(`  sim ${r.sim}: mean |dLuma| ${r.meanAbsLuma255.toFixed(3)}/255, max ${r.maxAbsLuma255.toFixed(1)}/255`);
  writeFileSync(join(dir, 'clockcheck.json'), JSON.stringify(out, null, 2));
  return out;
}

// -------------------------------------------------------------- PNG decode --
// Hand-rolled so re-analysis needs neither a browser nor a dependency (this
// repo ships no node_modules by design). Playwright writes 8-bit
// non-interlaced RGBA/RGB; anything else is refused loudly rather than
// silently mis-read.
function decodePNG(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let p = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('latin1', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(`unsupported PNG: depth ${bitDepth} color ${colorType} interlace ${interlace}`);
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const out = Buffer.alloc(height * stride);
  // PNG per-scanline filters (spec 9.2): each row's filter byte selects the
  // predictor; reconstruction is sequential, so this cannot be vectorised away.
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride, up = dst - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? out[dst + x - ch] : 0;
      const b = y > 0 ? out[up + x] : 0;
      const c = (x >= ch && y > 0) ? out[up + x - ch] : 0;
      let v = raw[src + x];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      out[dst + x] = v & 0xff;
    }
  }
  return { width, height, channels: ch, data: out };
}
const luma = (d, o) => (0.2126 * d[o] + 0.7152 * d[o + 1] + 0.0722 * d[o + 2]) / 255;

// -------------------------------------------------- pixel -> world mapping ---
// Exact inverse of the render camera: NDC -> projectionMatrixInverse ->
// matrixWorld (this is what THREE's Vector3.unproject does), then the ray is
// intersected with the still-water plane y=0. Foam sits within ~1 m of that
// plane and the drone eye is 365 m up, so the plane assumption costs well
// under a metre of along-shore error — three orders below the speeds measured.
function applyM(e, v) {
  const [x, y, z] = v;
  const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
  return [(e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
          (e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
          (e[2] * x + e[6] * y + e[10] * z + e[14]) * w];
}
function buildPixelWorldMap(cam, W, H, grid) {
  const { matrixWorld: MW, projectionMatrixInverse: PI } = cam;
  // binIdx per pixel, -1 = ray never meets the water plane (sky) or off-grid
  const map = new Int32Array(W * H).fill(-1);
  for (let py = 0; py < H; py++) {
    const ny = 1 - ((py + 0.5) / H) * 2;
    for (let px = 0; px < W; px++) {
      const nx = ((px + 0.5) / W) * 2 - 1;
      const near = applyM(MW, applyM(PI, [nx, ny, -1]));
      const far = applyM(MW, applyM(PI, [nx, ny, 1]));
      const dy = far[1] - near[1];
      if (dy > -1e-9) continue;                 // looking at or above the horizon
      const t = (0 - near[1]) / dy;
      if (t < 0) continue;
      const wx = near[0] + t * (far[0] - near[0]);
      const wz = near[2] + t * (far[2] - near[2]);
      const ix = Math.floor((wx - grid.x0) / grid.binM);
      const iz = Math.floor((wz - grid.z0) / grid.binM);
      if (ix < 0 || ix >= grid.nx || iz < 0 || iz >= grid.nz) continue;
      map[py * W + px] = iz * grid.nx + ix;
    }
  }
  return map;
}

// Reduce one decoded frame to the world grid: mean luma per bin, plus mean
// warmth (R-B) which separates the tan beach from neutral water and foam.
function binImage(img, map, nBins) {
  const { width: W, height: H, channels: ch, data: d } = img;
  const sum = new Float64Array(nBins), warm = new Float64Array(nBins), cnt = new Float64Array(nBins);
  for (let i = 0; i < W * H; i++) {
    const b = map[i];
    if (b < 0) continue;
    const o = i * ch;
    sum[b] += luma(d, o); warm[b] += (d[o] - d[o + 2]) / 255; cnt[b]++;
  }
  const mean = new Float64Array(nBins).fill(NaN), warmth = new Float64Array(nBins).fill(NaN);
  for (let b = 0; b < nBins; b++) if (cnt[b] > 0) { mean[b] = sum[b] / cnt[b]; warmth[b] = warm[b] / cnt[b]; }
  return { mean, warmth, cnt };
}

// World grid shared by the prescan and the analysis (mirrors main.js:34).
function makeGrid(binM) {
  const STAGE_W = 600, STAGE_D = 500, STAGE_Z0 = 10;
  return { binM, x0: -STAGE_W / 2, z0: STAGE_Z0 - STAGE_D / 2,
           nx: Math.ceil(STAGE_W / binM), nz: Math.ceil(STAGE_D / binM) };
}
const WARM_CUT = 0.035;   // R-B above this is beach, not water/foam (see analyze)

// Where is the surf zone? A short wide prescan, reduced to the brightest
// water bins (foam is the brightest thing on the water — VISUAL_GROUND_TRUTH
// point 1), then framed on their extent. A brightness percentile is used here
// rather than the temporal-residual method the measurements use, because the
// prescan is deliberately too short for a temporal background — it only has to
// aim the camera, not measure anything.
function autoframe(buffers, cam, W, H) {
  const grid = makeGrid(4), nBins = grid.nx * grid.nz;
  const map = buildPixelWorldMap(cam, W, H, grid);
  const acc = new Float64Array(nBins), warmAcc = new Float64Array(nBins), n = new Float64Array(nBins);
  for (const buf of buffers) {
    const { mean, warmth } = binImage(decodePNG(buf), map, nBins);
    for (let b = 0; b < nBins; b++) if (Number.isFinite(mean[b])) { acc[b] += mean[b]; warmAcc[b] += warmth[b]; n[b]++; }
  }
  const vals = [], idx = [];
  for (let b = 0; b < nBins; b++) {
    if (n[b] < buffers.length) continue;
    if (warmAcc[b] / n[b] > WARM_CUT) continue;
    vals.push(acc[b] / n[b]); idx.push(b);
  }
  if (!vals.length) return null;
  const cut = quantile(vals, 0.97);
  const xs = [], zs = [];
  for (let i = 0; i < idx.length; i++) {
    if (vals[i] < cut) continue;
    xs.push(grid.x0 + ((idx[i] % grid.nx) + 0.5) * grid.binM);
    zs.push(grid.z0 + (Math.floor(idx[i] / grid.nx) + 0.5) * grid.binM);
  }
  if (xs.length < 20) return null;
  // Two foam populations exist on this stage and brightness cannot tell them
  // apart: the reef break (what the zipper measurement is about) and the
  // shorebreak/swash at the waterline, which is broader and just as bright.
  // Taking the median z lands on the swash and frames the wrong band — it did,
  // on the first run, at z = +122 m when the Sewers break line sits near
  // z = -120 m. Cluster the hot bins in z and keep the most SEAWARD cluster
  // that carries real weight: the break line is always seaward of its own
  // whitewater, and of the shorebreak.
  const CLUSTER_M = 12;
  const hist = new Map();
  for (const z of zs) { const k = Math.floor(z / CLUSTER_M); hist.set(k, (hist.get(k) || 0) + 1); }
  const keys = [...hist.keys()].sort((a, b) => a - b);   // ascending z = seaward first
  const need = Math.max(8, xs.length * 0.06);
  let k0 = null;
  for (const k of keys) if (hist.get(k) >= need) { k0 = k; break; }
  if (k0 === null) k0 = keys[0];
  // grow the cluster through contiguous occupied z-bins
  let kLo = k0, kHi = k0;
  while (hist.has(kHi + 1) && hist.get(kHi + 1) >= need * 0.4) kHi++;
  const zLo = kLo * CLUSTER_M, zHi = (kHi + 1) * CLUSTER_M;
  const sel = [];
  for (let i = 0; i < xs.length; i++) if (zs[i] >= zLo && zs[i] <= zHi) sel.push(xs[i]);
  if (sel.length < 20) return null;
  const x1 = quantile(sel, 0.03), x2 = quantile(sel, 0.97);
  const cz = 0.5 * (zLo + zHi);
  const halfw = Math.max(90, 0.5 * (x2 - x1) + 45);
  return { cx: 0.5 * (x1 + x2), cz, halfw, hotBins: sel.length, allHotBins: xs.length,
           clusterZ_m: [zLo, zHi], foamCut: cut };
}

// ------------------------------------------------------------- statistics ---
const median = (a) => { const s = Float64Array.from(a).sort(); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : 0.5 * (s[n / 2 - 1] + s[n / 2])) : NaN; };
const quantile = (a, q) => { const s = Float64Array.from(a).sort(); return s.length ? s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] : NaN; };

// Normalised cross-correlation of two 1-D profiles at integer lag `L`
// (profile b compared against a shifted by L samples), plus a parabolic
// refinement of the peak so a shift smaller than one bin is still recoverable.
function bestLag(a, b, maxLag) {
  const n = a.length;
  const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
  const ma = mean(a), mb = mean(b);
  const A = a.map((x) => x - ma), B = b.map((x) => x - mb);
  let best = -Infinity, bestL = 0; const curve = new Map();
  for (let L = -maxLag; L <= maxLag; L++) {
    let num = 0, da = 0, db = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      const j = i - L;
      if (j < 0 || j >= n) continue;
      num += A[j] * B[i]; da += A[j] * A[j]; db += B[i] * B[i]; cnt++;
    }
    if (cnt < n * 0.5 || da <= 0 || db <= 0) continue;
    const r = num / Math.sqrt(da * db);
    curve.set(L, r);
    if (r > best) { best = r; bestL = L; }
  }
  const ym = curve.get(bestL - 1), y0 = curve.get(bestL), yp = curve.get(bestL + 1);
  let sub = 0;
  if (ym !== undefined && yp !== undefined) {
    const den = ym - 2 * y0 + yp;
    if (Math.abs(den) > 1e-12) sub = Math.max(-1, Math.min(1, 0.5 * (ym - yp) / den));
  }
  return { lag: bestL + sub, r: best };
}

// Phase-gradient speed: the estimator that actually answers "how fast does the
// break run down the point".
//
// Cross-correlating consecutive along-shore profiles is confounded here. The
// model multiplies foam by a STATIC along-shore stripe — model-glsl.js's
// `foam *= 0.72 + 0.28*vnoise1(x*0.045 + 3.1)`, a function of x alone with a
// ~22 m period and no t — so the brightest along-shore structure never moves
// whatever the peel does, and the correlation peak is pinned at lag 0 with
// r ~ 0.98. A multiplicative, time-independent amplitude field changes |C| but
// not arg(C), so extracting each column's phase at the driving frequency and
// differentiating along x sees straight through it.
//
// For a column whose residual is r(t) ~ A*cos(w*(t - tb)), the Fourier
// coefficient at w has arg = -w*tb, so tb(x) = -arg(C)/w and the propagation
// speed is dx/dtb = -w/(dphi/dx). Amplitude-weighted, phase unwrapped along x.
function phaseSpeed(profiles, times, xs, freqHz) {
  const w = 2 * Math.PI * freqHz;
  const n = xs.length;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let t = 0; t < profiles.length; t++) {
    const c = Math.cos(w * times[t]), s = Math.sin(w * times[t]);
    for (let i = 0; i < n; i++) { const v = profiles[t][i]; re[i] += v * c; im[i] -= v * s; }
  }
  return fitPhase(re, im, xs, w);
}

// Shared tail of phaseSpeed: unwrap the phase along the coordinate, fit it
// amplitude-weighted, and turn the gradient into a speed.
function fitPhase(re, im, xs, w) {
  const n = xs.length;
  const amp = new Float64Array(n), ph = new Float64Array(n);
  for (let i = 0; i < n; i++) { amp[i] = Math.hypot(re[i], im[i]); ph[i] = Math.atan2(im[i], re[i]); }
  // keep only columns that actually carry the driving frequency
  const cut = quantile(Array.from(amp), 0.5);
  const keep = []; for (let i = 0; i < n; i++) if (amp[i] >= cut && amp[i] > 0) keep.push(i);
  if (keep.length < 8) return null;
  // unwrap along x over the kept columns
  const un = [ph[keep[0]]];
  for (let j = 1; j < keep.length; j++) {
    let d = ph[keep[j]] - ph[keep[j - 1]];
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    un.push(un[j - 1] + d);
  }
  // amplitude-weighted least squares of unwrapped phase against x
  let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let j = 0; j < keep.length; j++) {
    const wt = amp[keep[j]], x = xs[keep[j]], y = un[j];
    sw += wt; sx += wt * x; sy += wt * y; sxx += wt * x * x; sxy += wt * x * y;
  }
  const den = sw * sxx - sx * sx;
  if (Math.abs(den) < 1e-12) return null;
  const slope = (sw * sxy - sx * sy) / den;         // rad per metre
  const icpt = (sy - slope * sx) / sw;
  let ssTot = 0, ssRes = 0; const ym = sy / sw;
  for (let j = 0; j < keep.length; j++) {
    const wt = amp[keep[j]], x = xs[keep[j]], y = un[j];
    ssTot += wt * (y - ym) ** 2; ssRes += wt * (y - (slope * x + icpt)) ** 2;
  }
  const speed = Math.abs(slope) > 1e-9 ? -w / slope : Infinity;
  // total phase run across the measured span, in wave cycles: below ~0.15 of a
  // cycle the whole reef is effectively breaking at once whatever the fitted
  // speed says, so this is the number that decides "peel" vs "closeout".
  const span = xs[keep[keep.length - 1]] - xs[keep[0]];
  return { slope_rad_per_m: slope, speed_m_per_s: speed, r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
           columnsUsed: keep.length, span_m: span, phaseRun_cycles: Math.abs(slope * span) / (2 * Math.PI),
           lagAcrossSpan_s: Math.abs(slope * span) / w };
}

// Biased autocorrelation of a mean-removed series — biased (divide by n, not
// n-k) so long lags are damped rather than amplified by their thin support.
function autocorr(series, maxLag) {
  const m = series.reduce((s, x) => s + x, 0) / series.length;
  const A = series.map((x) => x - m);
  const denom = A.reduce((s, x) => s + x * x, 0);
  const out = [];
  for (let k = 0; k <= maxLag; k++) {
    let s = 0;
    for (let i = 0; i + k < A.length; i++) s += A[i] * A[i + k];
    out.push(denom > 0 ? s / denom : 0);
  }
  return out;
}
// First interior local maximum above `minLag`, parabolically refined.
function firstPeak(ac, minLag) {
  for (let k = minLag; k < ac.length - 1; k++) {
    if (ac[k] > ac[k - 1] && ac[k] >= ac[k + 1] && ac[k] > 0) {
      const den = ac[k - 1] - 2 * ac[k] + ac[k + 1];
      const sub = Math.abs(den) > 1e-12 ? 0.5 * (ac[k - 1] - ac[k + 1]) / den : 0;
      return { lag: k + Math.max(-1, Math.min(1, sub)), r: ac[k] };
    }
  }
  return null;
}

// -------------------------------------------------------------- analysis ----
// Everything below works on a world-space grid, never on raw pixels, so the
// numbers come out in metres and seconds without a screen-space fudge factor.
//
// Foam is isolated as a TEMPORAL residual rather than an absolute threshold.
// The audit measured the foam/water step at ~20/255 (VISUAL_GROUND_TRUTH
// wants ~130), so any fixed brightness cut is arbitrary; subtracting each
// bin's own temporal median removes the static water/land/sky background and
// leaves exactly the transient bright field, which is what whitewater is.
function analyze(manifest) {
  const cam = manifest.page.camera;
  const W = manifest.cfg.w, H = manifest.cfg.h, binM = manifest.cfg.binM;
  const grid = makeGrid(binM);
  const nBins = grid.nx * grid.nz;
  const map = buildPixelWorldMap(cam, W, H, grid);

  const N = manifest.frames.length;
  const lumaT = [];      // per frame: mean luma per bin (NaN where unseen)
  const warmAcc = new Float64Array(nBins);   // R-B, for the land mask
  const cntAcc = new Float64Array(nBins);
  for (const f of manifest.frames) {
    const img = decodePNG(readFileSync(join(OUT, f.file)));
    if (img.width !== W || img.height !== H) throw new Error(`frame ${f.file} is ${img.width}x${img.height}, expected ${W}x${H}`);
    const { mean, warmth } = binImage(img, map, nBins);
    for (let b = 0; b < nBins; b++) if (Number.isFinite(mean[b])) { warmAcc[b] += warmth[b]; cntAcc[b]++; }
    lumaT.push(mean);
  }

  // Water mask: a bin must be seen in every frame and must not be warm. Land
  // in these captures is a tan blob (R noticeably above B); water and foam are
  // neutral-to-blue. WARM_CUT sits between the two populations — reported below
  // as a bin count so a bad split is visible instead of silent.
  const water = [];
  for (let b = 0; b < nBins; b++) {
    if (cntAcc[b] === 0) continue;
    let seen = true;
    for (let i = 0; i < N; i++) if (!Number.isFinite(lumaT[i][b])) { seen = false; break; }
    if (!seen) continue;
    if (warmAcc[b] / cntAcc[b] > WARM_CUT) continue;
    water.push(b);
  }

  // Background = per-bin temporal median; residual = the transient bright part.
  const bg = new Float64Array(nBins);
  for (const b of water) { const s = []; for (let i = 0; i < N; i++) s.push(lumaT[i][b]); bg[b] = median(s); }
  const resid = [];
  for (let i = 0; i < N; i++) {
    const r = new Float64Array(nBins);
    for (const b of water) r[b] = Math.max(0, lumaT[i][b] - bg[b]);
    resid.push(r);
  }
  const isWater = new Uint8Array(nBins); for (const b of water) isWater[b] = 1;

  const dt = manifest.cfg.dt;
  const st = manifest.page.state;
  const out = { sequence: manifest.sequence, preset: st.preset, geoSpot: st.geoSpot,
    modelState: st, hud: manifest.page.hud, frames: N, dt, binM,
    rig: manifest.cfg.rig === 'nadir'
      ? { kind: 'nadir', alt_m: manifest.cfg.alt, cx_m: manifest.cfg.cx, cz_m: manifest.cfg.cz,
          halfWidth_m: manifest.cfg.halfw, metresPerPixel: (2 * manifest.cfg.halfw) / W }
      : { kind: 'hash', hash: manifest.cfg.hash },
    windowSpan_s: (N - 1) * dt, carrierPeriods: ((N - 1) * dt) / st.T,
    grid: { nx: grid.nx, nz: grid.nz, waterBins: water.length, totalBins: nBins, warmCut: WARM_CUT } };

  // ---- 1. ZIPPER SPEED -----------------------------------------------------
  // The break band is found from the data, not asserted: for each along-shore
  // column, the cross-shore bin whose residual is most active over the whole
  // sequence IS the break line as rendered. The along-shore foam profile in
  // that band is then cross-correlated frame to frame; the lag is the distance
  // the peel travelled in dt.
  const BAND_BINS = Math.max(2, Math.round(24 / binM));   // +/-24 m of break line
  const zBreak = new Int32Array(grid.nx).fill(-1);
  const colAct = new Float64Array(grid.nx);
  for (let ix = 0; ix < grid.nx; ix++) {
    let best = 0, bestIz = -1;
    for (let iz = 0; iz < grid.nz; iz++) {
      const b = iz * grid.nx + ix;
      if (!isWater[b]) continue;
      let a = 0; for (let i = 0; i < N; i++) a += resid[i][b];
      if (a > best) { best = a; bestIz = iz; }
    }
    zBreak[ix] = bestIz; colAct[ix] = best / N;
  }
  const cols = []; for (let ix = 0; ix < grid.nx; ix++) if (zBreak[ix] >= 0 && colAct[ix] > 0) cols.push(ix);
  const profA = [];
  for (let i = 0; i < N; i++) {
    const p = new Array(cols.length).fill(0);
    for (let ci = 0; ci < cols.length; ci++) {
      const ix = cols[ci]; let s = 0, c = 0;
      for (let dz = -BAND_BINS; dz <= BAND_BINS; dz++) {
        const iz = zBreak[ix] + dz; if (iz < 0 || iz >= grid.nz) continue;
        const b = iz * grid.nx + ix; if (!isWater[b]) continue;
        s += resid[i][b]; c++;
      }
      p[ci] = c ? s / c : 0;
    }
    profA.push(p);
  }
  // ---- the 2-D break geometry, measured ------------------------------------
  // Peel speed is not a property of the crest alone or of the break line alone:
  // breaking at station x happens when the crest phase reaches z_b(x), so
  //   t_b(x) = phi(x, z_b(x))/w,  dt_b/dx = (kx + kz*dz_b/dx)/w
  // and V_p follows. Sampling phase along a jittery argmax break line (or
  // averaging it over a band 0.5 wave cycles deep in z) both failed: the first
  // was noise-dominated (R2 0.23), the second silently measured the cross-shore
  // gradient through dz_b/dx (R2 0.81 on a number that was mostly kz*slope).
  // So measure the two wavenumber components and the break-line slope
  // SEPARATELY, then combine them. Phase differences are taken between
  // ADJACENT bins and wrapped, which needs no global unwrapping and is stable.
  const wCar = 2 * Math.PI / st.T;
  const times = manifest.frames.map((f) => f.sim);
  const Cre = new Float64Array(nBins), Cim = new Float64Array(nBins);
  for (let t = 0; t < N; t++) {
    const cc = Math.cos(wCar * times[t]), ss = Math.sin(wCar * times[t]);
    for (const b of water) { const v = resid[t][b]; Cre[b] += v * cc; Cim[b] -= v * ss; }
  }
  const ampB = new Float64Array(nBins), phB = new Float64Array(nBins);
  for (const b of water) { ampB[b] = Math.hypot(Cre[b], Cim[b]); phB[b] = Math.atan2(Cim[b], Cre[b]); }
  const ampCut = quantile(water.map((b) => ampB[b]), 0.80);
  const active = new Uint8Array(nBins);
  for (const b of water) if (ampB[b] >= ampCut) active[b] = 1;
  const wrapPi = (d) => { while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  function gradComponent(step, sameRowGuard) {
    let sw = 0, ss = 0, cnt = 0;
    for (const b of water) {
      if (!active[b]) continue;
      const b2 = b + step;
      if (b2 < 0 || b2 >= nBins || !active[b2]) continue;
      if (sameRowGuard && (b % grid.nx) === grid.nx - 1) continue;
      const wt = Math.min(ampB[b], ampB[b2]);
      ss += wt * wrapPi(phB[b2] - phB[b]); sw += wt; cnt++;
    }
    return sw > 0 ? { k: ss / sw / binM, pairs: cnt } : null;
  }
  const gx = gradComponent(1, true), gz = gradComponent(grid.nx, false);
  // break-line slope: 5-column median smooth of the argmax line, then an
  // activity-weighted straight-line fit over the columns that actually break
  const actCut = quantile(cols.map((ix) => colAct[ix]), 0.5);
  const bx = [], bz = [], bw = [];
  for (let ci = 2; ci < cols.length - 2; ci++) {
    const ix = cols[ci];
    if (colAct[ix] < actCut) continue;
    const win = [-2, -1, 0, 1, 2].map((d) => zBreak[cols[ci + d]]);
    bx.push(grid.x0 + (ix + 0.5) * binM);
    bz.push(grid.z0 + (median(win) + 0.5) * binM);
    bw.push(colAct[ix]);
  }
  let dzdx = NaN, breakFitR2 = NaN;
  if (bx.length > 8) {
    let sw = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (let i = 0; i < bx.length; i++) { const wt = bw[i]; sw += wt; sx += wt * bx[i]; sy += wt * bz[i]; sxx += wt * bx[i] * bx[i]; sxy += wt * bx[i] * bz[i]; }
    dzdx = (sw * sxy - sx * sy) / (sw * sxx - sx * sx);
    const icpt = (sy - dzdx * sx) / sw; const ym = sy / sw;
    let tot = 0, res2 = 0;
    for (let i = 0; i < bx.length; i++) { tot += bw[i] * (bz[i] - ym) ** 2; res2 += bw[i] * (bz[i] - (dzdx * bx[i] + icpt)) ** 2; }
    breakFitR2 = tot > 0 ? 1 - res2 / tot : NaN;
  }
  let geom = null;
  if (gx && gz && Number.isFinite(dzdx)) {
    const kx = gx.k, kz = gz.k, kmag = Math.hypot(kx, kz);
    const dtdx = (kx + kz * dzdx) / wCar;           // s per metre of x
    const vpx = 1 / dtdx;                            // along the x axis
    const vp = vpx * Math.sqrt(1 + dzdx * dzdx);     // along the break line (Walker's V_p)
    const sinA = Math.abs(kx + kz * dzdx) / (kmag * Math.sqrt(1 + dzdx * dzdx));
    geom = {
      kx_rad_per_m: kx, kz_rad_per_m: kz, kMag_rad_per_m: kmag,
      measuredWavelength_m: 2 * Math.PI / kmag, frozenLAM_m: 90,
      measuredCelerity_m_per_s: wCar / kmag,
      crestBearing_deg_from_alongshore: Math.atan2(Math.abs(kx), Math.abs(kz)) * 180 / Math.PI,
      breakLineSlope_dz_dx: dzdx, breakLineFitR2: breakFitR2,
      breakLineBearing_deg: Math.atan(dzdx) * 180 / Math.PI,
      peelAngle_alpha_deg: Math.asin(Math.min(1, sinA)) * 180 / Math.PI,
      Vp_alongX_m_per_s: vpx, Vp_alongBreakLine_m_per_s: vp,
      breakLagAcrossReef_s: Math.abs(dtdx) * (bx[bx.length - 1] - bx[0]),
      reefSpan_m: bx[bx.length - 1] - bx[0],
      pairsX: gx.pairs, pairsZ: gz.pairs, activeBins: active.reduce((s, v) => s + v, 0),
    };
  }

  const MAX_ALONG_M = 260;   // > any plausible Vp*dt; wide enough for a 40 m/s peel at dt=0.5
  const zipLags = [], zipR = [];
  for (let i = 0; i + 1 < N; i++) {
    const { lag, r } = bestLag(profA[i], profA[i + 1], Math.round(MAX_ALONG_M / binM));
    if (Number.isFinite(lag) && r > 0.5) { zipLags.push((lag * binM) / dt); zipR.push(r); }
  }
  // Independent check that does not depend on frame-to-frame tracking: the
  // along-shore spatial period of the foam pattern is Vp*T for a peeling wave.
  const meanA = new Array(cols.length).fill(0);
  for (let ci = 0; ci < cols.length; ci++) { let s = 0; for (let i = 0; i < N; i++) s += profA[i][ci]; meanA[ci] = s / N; }
  const acX = autocorr(profA[0].map((v, ci) => v - meanA[ci]), Math.min(cols.length - 2, Math.round(500 / binM)));
  const pkX = firstPeak(acX, Math.max(3, Math.round(20 / binM)));
  // The empirical break line, dumped so the measurement geometry can be
  // checked against what the model claims rather than trusted: [x_m, z_m,
  // mean residual] per along-shore column.
  const breakProfile = cols.map((ix) => [grid.x0 + (ix + 0.5) * binM, grid.z0 + (zBreak[ix] + 0.5) * binM, colAct[ix]]);
  out.zipper = {
    geometry: geom,
    breakProfile,
    // full along-shore residual profiles, so the peel can be read directly as
    // an x-t diagram instead of only through the correlation summary
    alongshoreX_m: cols.map((ix) => grid.x0 + (ix + 0.5) * binM),
    alongshoreProfiles: profA.map((p) => p.map((v) => Number(v.toFixed(5)))),
    breakProfile_z_range_m: [Math.min(...breakProfile.map((r) => r[1])), Math.max(...breakProfile.map((r) => r[1]))],
    method: 'cross-correlation of the along-shore foam-residual profile in the empirical break band',
    bandHalfWidth_m: BAND_BINS * binM, columnsUsed: cols.length,
    // PRIMARY estimator (see phaseSpeed): break timing per along-shore column,
    // read at the break line itself. Averaging a +/-24 m band first would smear
    // the carrier across ~0.5 of a cycle in z (dphi/dz = w/c) and attenuate the
    // very signal being timed, so the phase is taken per BIN and sampled on
    // z = zBreak(x).
    phase: (() => {
      const w = 2 * Math.PI / st.T, times = manifest.frames.map((f) => f.sim);
      const re = new Float64Array(cols.length), im = new Float64Array(cols.length);
      for (let t = 0; t < N; t++) {
        const cc = Math.cos(w * times[t]), ss = Math.sin(w * times[t]);
        for (let ci = 0; ci < cols.length; ci++) {
          const b = zBreak[cols[ci]] * grid.nx + cols[ci];
          const v = resid[t][b];
          re[ci] += v * cc; im[ci] -= v * ss;
        }
      }
      return fitPhase(re, im, cols.map((ix) => grid.x0 + (ix + 0.5) * binM), w);
    })(),
    phaseBandAveraged: phaseSpeed(profA, manifest.frames.map((f) => f.sim), cols.map((ix) => grid.x0 + (ix + 0.5) * binM), 1 / st.T),
    pairsAccepted: zipLags.length, pairsTotal: N - 1,
    speed_m_per_s: { median: median(zipLags), p25: quantile(zipLags, 0.25), p75: quantile(zipLags, 0.75),
                     min: zipLags.length ? Math.min(...zipLags) : NaN, max: zipLags.length ? Math.max(...zipLags) : NaN },
    correlation_median: median(zipR),
    alongshorePattern: pkX ? { period_m: pkX.lag * binM, r: pkX.r, impliedVp_m_per_s: (pkX.lag * binM) / st.T } : null,
    walkerReference: walker(st),
  };

  // ---- 2. SET CADENCE ------------------------------------------------------
  // Two series off the same frames: total foam residual (rectified — sensitive
  // to breaking activity) and mean water luma (unrectified — the honest
  // envelope). Autocorrelation of each; the carrier peak near T validates the
  // instrument, the long peak is the set beat.
  const foamSeries = resid.map((r) => { let s = 0; for (const b of water) s += r[b]; return s / water.length; });
  const lumaSeries = lumaT.map((r) => { let s = 0; for (const b of water) s += r[b]; return s / water.length; });
  const maxLag = Math.floor(N * 0.6);
  const acFoam = autocorr(foamSeries, maxLag), acLuma = autocorr(lumaSeries, maxLag);
  const carrierLag = Math.max(1, Math.round(st.T / dt));
  const setMinLag = Math.max(carrierLag * 2, Math.round(30 / dt));
  out.cadence = {
    method: 'autocorrelation of per-frame foam residual and mean water luma',
    span_s: (N - 1) * dt, sampleStep_s: dt,
    authored_dF_Hz: st.dF, authored_setPeriod_s: 1 / st.dF, carrierPeriod_T_s: st.T,
    carrierPeak_s: (() => { const p = firstPeak(acFoam, 2); return p ? p.lag * dt : null; })(),
    setPeak_foam_s: (() => { const p = firstPeak(acFoam, setMinLag); return p ? { period_s: p.lag * dt, r: p.r } : null; })(),
    setPeak_luma_s: (() => { const p = firstPeak(acLuma, setMinLag); return p ? { period_s: p.lag * dt, r: p.r } : null; })(),
    // Both group speeds the audit flagged as live, with the resulting spatial
    // set-band length so a reader can see which one the picture is showing.
    groupSpeed_authored_LAMover2T_m_per_s: 0.5 * 90 / st.T,
    groupSpeed_physical_gTover4pi_m_per_s: 9.81 * st.T / (4 * Math.PI),
    setBandLength_authored_m: (0.5 * 90 / st.T) / st.dF,
    setBandLength_physical_m: (9.81 * st.T / (4 * Math.PI)) / st.dF,
    series: { foam: foamSeries, luma: lumaSeries },
  };

  // ---- 3. FOAM ADVECTION / PERSISTENCE ------------------------------------
  // Cross-shore profile shift = advection speed. Then two decorrelation
  // curves: Eulerian (bin against itself over time) and Lagrangian (the same
  // comparison after shifting the field by the measured advection). Foam that
  // persists and drifts holds Lagrangian correlation far longer than Eulerian;
  // foam that flickers in place loses both at lag 1.
  const rows = []; for (let iz = 0; iz < grid.nz; iz++) { let c = 0; for (let ix = 0; ix < grid.nx; ix++) if (isWater[iz * grid.nx + ix]) c++; if (c > grid.nx * 0.2) rows.push(iz); }
  const profB = [];
  for (let i = 0; i < N; i++) {
    const p = new Array(rows.length).fill(0);
    for (let ri = 0; ri < rows.length; ri++) {
      const iz = rows[ri]; let s = 0, c = 0;
      for (let ix = 0; ix < grid.nx; ix++) { const b = iz * grid.nx + ix; if (!isWater[b]) continue; s += resid[i][b]; c++; }
      p[ri] = c ? s / c : 0;
    }
    profB.push(p);
  }
  const advLags = [];
  for (let i = 0; i + 1 < N; i++) {
    const { lag, r } = bestLag(profB[i], profB[i + 1], Math.round(40 / binM));
    if (Number.isFinite(lag) && r > 0.5) advLags.push((lag * binM) / dt);
  }
  // INSTRUMENT CONTROL. The same phase estimator, pointed cross-shore at the
  // carrier, must return the wave celerity travelling SHOREWARD (+z, per
  // main.js:32). A wrong sign or a wrong world mapping shows up here as a
  // negative or absurd number, so the along-shore result above is only
  // believable when this control passes.
  const zsRows = rows.map((iz) => grid.z0 + (iz + 0.5) * binM);
  out.control = {
    note: 'cross-shore carrier phase speed; must be positive (shoreward) and near sqrt(g*h) in the surf zone',
    crossShoreCarrier: phaseSpeed(profB, manifest.frames.map((f) => f.sim), zsRows, 1 / st.T),
    shallowWaterCelerity_at_hb_m_per_s: Math.sqrt(9.81 * (st.H0 / 0.78)),
    deepWaterCelerity_LAMoverT_m_per_s: 90 / st.T,
  };

  const advMed = median(advLags);
  const shiftBins = Number.isFinite(advMed) ? Math.round((advMed * dt) / binM) : 0;
  const maxK = Math.min(12, N - 1);
  const eul = [], lag2 = [];
  for (let k = 1; k <= maxK; k++) {
    let nE = 0, dA = 0, dB = 0, nL = 0, lA = 0, lB = 0;
    for (const b of water) {
      const iz = Math.floor(b / grid.nx), ix = b % grid.nx;
      for (let i = 0; i + k < N; i++) {
        const a = resid[i][b], c = resid[i + k][b];
        nE += a * c; dA += a * a; dB += c * c;
        const iz2 = iz + shiftBins * k;
        if (iz2 < 0 || iz2 >= grid.nz) continue;
        const b2 = iz2 * grid.nx + ix; if (!isWater[b2]) continue;
        const c2 = resid[i + k][b2];
        nL += a * c2; lA += a * a; lB += c2 * c2;
      }
    }
    eul.push(dA > 0 && dB > 0 ? nE / Math.sqrt(dA * dB) : 0);
    lag2.push(lA > 0 && lB > 0 ? nL / Math.sqrt(lA * lB) : 0);
  }
  const efold = (curve) => { for (let i = 0; i < curve.length; i++) if (curve[i] < Math.E ** -1) { const prev = i ? curve[i - 1] : 1; const f = (prev - Math.E ** -1) / Math.max(prev - curve[i], 1e-9); return (i + f) * dt; } return null; };
  out.foam = {
    method: 'cross-shore residual-profile cross-correlation (advection) + Eulerian vs Lagrangian decorrelation (persistence)',
    advection_m_per_s: { median: advMed, p25: quantile(advLags, 0.25), p75: quantile(advLags, 0.75), pairsAccepted: advLags.length },
    // The shader's own front speed, for comparison — model-glsl breakerLifecycleAtX
    // uses mix(2.4, 4.1, smoothstep(0.45,1.25,xi)).
    shaderFrontSpeed_m_per_s: 2.4 + (4.1 - 2.4) * smoothstep(0.45, 1.25, st.xi),
    eulerianCorr: eul, lagrangianCorr: lag2,
    eulerian_efold_s: efold(eul), lagrangian_efold_s: efold(lag2),
    authored_tau_s: st.tau, boreEfold_s: 3.2, ageWindow_s: 0.62 * st.T,
    lagsSeconds: Array.from({ length: maxK }, (_, i) => (i + 1) * dt),
  };
  return out;
}
function smoothstep(a, b, x) { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// Walker (1974) peel-speed reference: V_p = c/sin(alpha). The celerity used is
// shallow-water sqrt(g*h_b) at the depth-limited breaking depth h_b = H0/gamma
// (gamma 0.78), which is the same construction the spec's M5 table used.
function walker(st) {
  const GAMMA = 0.78, G = 9.81;
  const hb = st.H0 / GAMMA;
  const c = Math.sqrt(G * hb);
  const rows = {};
  const add = (label, deg) => { const s = Math.sin(deg * Math.PI / 180); rows[label] = { alphaDeg: deg, Vp_m_per_s: s > 1e-6 ? c / s : Infinity }; };
  add('authoredAlpha', st.alpha);
  add('alpha10_visibleCrestAngle', 10);   // audit finding 3: refraction collapses the authored angle to ~8-10 deg on screen
  return { breakingDepth_hb_m: hb, celerity_c_m_per_s: c, gamma: GAMMA, cases: rows,
           specBand_m_per_s: [5, 8], specMeasured_m_per_s: [4.8, 10.0] };
}

// ----------------------------------------------------------------- report ---
function report(m) {
  const f2 = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
  const L = [];
  L.push(`\n=== ${m.sequence} · ${m.preset} (${m.geoSpot || 'synthetic'}) · ${m.frames} frames @ dt=${m.dt}s · bin ${m.binM} m ===`);
  L.push(`model: H0 ${m.modelState.H0} m, T ${m.modelState.T} s, alpha ${m.modelState.alpha} deg authored, xi ${m.modelState.xi}, dF ${m.modelState.dF} Hz, tau ${m.modelState.tau} s, tide ${m.modelState.tide ?? 0} m`);
  L.push(`hud alpha: ${m.hud.alpha}`);
  L.push(`window: ${f2(m.windowSpan_s, 1)} s of sim = ${f2(m.carrierPeriods, 1)} carrier periods` +
         (m.carrierPeriods < 4 ? '   *** TOO SHORT: the temporal background is unreliable below ~4 T ***' : ''));
  L.push(m.rig.kind === 'nadir'
    ? `rig: nadir ${m.rig.alt_m} m over (${m.rig.cx_m}, ${m.rig.cz_m}), ${f2(2 * m.rig.halfWidth_m, 0)} m across frame, ${f2(m.rig.metresPerPixel, 3)} m/px`
    : `rig: hash camera (${m.rig.hash})`);
  L.push(`grid: ${m.grid.waterBins} water bins of ${m.grid.totalBins} (warm/land cut ${m.grid.warmCut})`);
  L.push(`break band: z ${f2(m.zipper.breakProfile_z_range_m[0], 0)}..${f2(m.zipper.breakProfile_z_range_m[1], 0)} m over ${m.zipper.columnsUsed} along-shore columns`);
  const z = m.zipper;
  L.push(`\n[1] ZIPPER SPEED`);
  if (z.geometry) {
    const g = z.geometry;
    L.push(`  PRIMARY, measured 2-D break geometry (${g.activeBins} active bins, ${g.pairsX}+${g.pairsZ} phase pairs):`);
    L.push(`    crest wavenumber  kx ${g.kx_rad_per_m.toExponential(3)} rad/m, kz ${g.kz_rad_per_m.toExponential(3)} rad/m`);
    L.push(`    -> wavelength ${f2(g.measuredWavelength_m, 1)} m (authored LAM ${g.frozenLAM_m} m), celerity ${f2(g.measuredCelerity_m_per_s)} m/s`);
    L.push(`    crest bearing off shore-parallel ${f2(g.crestBearing_deg_from_alongshore, 1)} deg`);
    L.push(`    break line dz/dx ${f2(g.breakLineSlope_dz_dx, 3)} (= ${f2(g.breakLineBearing_deg, 1)} deg, fit R2 ${f2(g.breakLineFitR2)})`);
    L.push(`    => peel angle alpha = ${f2(g.peelAngle_alpha_deg, 1)} deg  (authored ${m.modelState.alpha} deg)`);
    L.push(`    => Vp = ${f2(g.Vp_alongBreakLine_m_per_s, 1)} m/s along the break line (${f2(g.Vp_alongX_m_per_s, 1)} m/s along x, ${g.Vp_alongX_m_per_s > 0 ? '+x down-point' : '-x up-point'})`);
    L.push(`    break lag end to end over ${f2(g.reefSpan_m, 0)} m of reef: ${f2(g.breakLagAcrossReef_s, 2)} s = ${f2(g.breakLagAcrossReef_s / m.modelState.T, 3)} wave periods`);
  }
  L.push(`  SECONDARY, profile cross-correlation (${z.pairsAccepted}/${z.pairsTotal} pairs, median r=${f2(z.correlation_median)}) —`);
  L.push(`    confounded by the static along-shore foam stripe; expect ~0 whatever the peel does`);
  L.push(`    translation = ${f2(z.speed_m_per_s.median)} m/s  (IQR ${f2(z.speed_m_per_s.p25)}..${f2(z.speed_m_per_s.p75)}, range ${f2(z.speed_m_per_s.min)}..${f2(z.speed_m_per_s.max)})`);
  if (z.alongshorePattern) L.push(`    along-shore foam period ${f2(z.alongshorePattern.period_m, 1)} m -> Vp = period/T = ${f2(z.alongshorePattern.impliedVp_m_per_s)} m/s (independent of tracking)`);
  const w = z.walkerReference;
  L.push(`    Walker c/sin(a): c=${f2(w.celerity_c_m_per_s)} m/s at h_b=${f2(w.breakingDepth_hb_m)} m`);
  for (const [k, v] of Object.entries(w.cases)) L.push(`      ${k.padEnd(26)} a=${v.alphaDeg} deg -> Vp ${f2(v.Vp_m_per_s)} m/s`);
  L.push(`    spec band ${w.specBand_m_per_s.join('-')} m/s; spec M5 measured ${w.specMeasured_m_per_s.join('-')} m/s`);
  const c = m.cadence;
  L.push(`\n[2] SET CADENCE  (${f2(c.span_s, 0)} s of sim at ${c.sampleStep_s} s steps)`);
  L.push(`    authored 1/dF = ${f2(c.authored_setPeriod_s, 1)} s (dF ${c.authored_dF_Hz} Hz), carrier T = ${c.carrierPeriod_T_s} s`);
  L.push(`    carrier peak in foam autocorr: ${f2(c.carrierPeak_s, 1)} s  [instrument check]`);
  L.push(`    set peak, foam residual: ${c.setPeak_foam_s ? f2(c.setPeak_foam_s.period_s, 1) + ' s (r=' + f2(c.setPeak_foam_s.r) + ')' : 'none found'}`);
  L.push(`    set peak, mean luma:     ${c.setPeak_luma_s ? f2(c.setPeak_luma_s.period_s, 1) + ' s (r=' + f2(c.setPeak_luma_s.r) + ')' : 'none found'}`);
  L.push(`    group speed authored LAM/2T = ${f2(c.groupSpeed_authored_LAMover2T_m_per_s)} m/s -> set band ${f2(c.setBandLength_authored_m, 0)} m`);
  L.push(`    group speed physical gT/4pi = ${f2(c.groupSpeed_physical_gTover4pi_m_per_s)} m/s -> set band ${f2(c.setBandLength_physical_m, 0)} m  (x${f2(c.groupSpeed_physical_gTover4pi_m_per_s / c.groupSpeed_authored_LAMover2T_m_per_s)})`);
  const fo = m.foam;
  L.push(`\n[3] FOAM ADVECTION / PERSISTENCE`);
  L.push(`    shoreward advection ${f2(fo.advection_m_per_s.median)} m/s (IQR ${f2(fo.advection_m_per_s.p25)}..${f2(fo.advection_m_per_s.p75)}, ${fo.advection_m_per_s.pairsAccepted} pairs); shader front speed ${f2(fo.shaderFrontSpeed_m_per_s)} m/s`);
  L.push(`    Eulerian decorrelation e-fold ${f2(fo.eulerian_efold_s, 1)} s; Lagrangian (advection-following) ${f2(fo.lagrangian_efold_s, 1)} s`);
  const ct = m.control;
  L.push(`    [control] cross-shore carrier phase speed ${ct.crossShoreCarrier ? f2(ct.crossShoreCarrier.speed_m_per_s) : 'n/a'} m/s (R2 ${ct.crossShoreCarrier ? f2(ct.crossShoreCarrier.r2) : '-'}) — must be POSITIVE/shoreward; sqrt(g*h_b)=${f2(ct.shallowWaterCelerity_at_hb_m_per_s)}, LAM/T=${f2(ct.deepWaterCelerity_LAMoverT_m_per_s)}`);
  L.push(`    corr @ lags ${fo.lagsSeconds.slice(0, 6).map((s) => s.toFixed(1) + 's').join(' ')}`);
  L.push(`      eulerian   ${fo.eulerianCorr.slice(0, 6).map((v) => f2(v)).join('  ')}`);
  L.push(`      lagrangian ${fo.lagrangianCorr.slice(0, 6).map((v) => f2(v)).join('  ')}`);
  L.push(`    authored tau ${fo.authored_tau_s} s; bore e-fold ${fo.boreEfold_s} s; foam-age window 0.62T = ${f2(fo.ageWindow_s, 1)} s`);
  console.log(L.join('\n'));
}

// ------------------------------------------------------------------ main ----
if (flags['verify-clock'] === '1') {
  await verifyClock();
} else {
  let manifest;
  if (flags['analyze-only'] === '1') {
    manifest = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
  } else {
    manifest = await capture();
  }
  if (flags['no-analyze'] !== '1') {
    const metrics = analyze(manifest);
    writeFileSync(join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 2));
    report(metrics);
    console.log(`\nmetrics -> ${join(OUT, 'metrics.json')}`);
  }
}
