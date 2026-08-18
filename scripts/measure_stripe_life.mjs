// Per-stripe lifecycle acceptance instrument (#slife, TODO hero read item (a)).
//
// THE QUESTION: with #slife=1, do the INNER re-breaking stripes carry an
// along-crest freshness gradient (fresh head -> decayed tail) pointing the
// same way as the break-line comet, where #slife=0 is flat?
//
// METHOD. Hero state (#preset=sewers&cam=drone), clock-pinned via sim= and
// speed=0 (same discipline as capture_fidelity_ab.mjs), OFF vs ON at four
// clocks spanning the set's active window. World->screen goes through the
// frame's own recorded camera (projectionMatrix * matrixWorldInverse; foam
// sits within ~1 m of the y=0 plane and the drone eye is hundreds of metres
// up, so the plane assumption is sub-metre — capture_temporal.mjs's
// argument), and the model side is evaluated by an EXACT Node twin built
// from the captured bakes (see "the model twin" below), never re-derived.
//
// WHAT THE 2026-08-18 RUN ESTABLISHED, and how (the strong evidence is
// upstream of the rank stats — read this before re-tuning against them):
//   1. IMPLEMENTATION EXACT: the shader's rendered carve field (a temporary
//      u_stripeLife=2 grayscale branch, since removed) matched this twin at
//      r = 0.995 / MAE 0.004 over 1842 samples — the clock and carve render
//      precisely as derived.
//   2. THE CARVE OWNS THE STRIPES: forcing the carve to 0 removed the inner
//      stripes from the frame entirely — the mechanism multiplies exactly
//      the pixels that band uniformly in the OFF arm.
//   3. The pixel-level rank statistics below are DILUTED, not decisive:
//      per-station base uncertainty (~±0.04 whiteness) is comparable to the
//      residual foam signal on old stripes, carving foam re-enables the
//      foam-damped ripple field (glint partially refills the luma), and at
//      inner-stripe ages (15+ s) the along factor works near its floor. They
//      are printed as context; the acceptance rests on 1 + 2 + the OFF/ON
//      frames themselves. The read quality stays a live-verdict question,
//      which is why #slife defaults OFF.
//
// Usage: python3 scripts/serve.py 8203   (separate shell), then
//        node scripts/measure_stripe_life.mjs [outdir] [--analyze-only]

import { inflateSync } from 'node:zlib';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname,
].filter(Boolean);
let chromium;
for (const candidate of PW_CANDIDATES) {
  try { ({ chromium } = await import(candidate)); break; } catch { /* next */ }
}
if (!chromium) {
  console.error('playwright not found. Set PLAYWRIGHT_DIR=/path/to/playwright/index.mjs');
  process.exit(1);
}

const OUT = resolve(process.argv[2] || '/tmp/pointbreak-stripe-life');
const PORT = 8203;                       // serve.py, started separately
// Spans the set's ACTIVE window (dF 0.008 -> 125 s cycle at sewers): the
// first sweep used 36/42/48/54 and found 54 a full lull and 48 nearly one —
// an honest null (nothing to modulate), but no evidence either way.
const TIMES = [30, 36, 42, 48];
const BASE_HASH = 'preset=sewers&cam=drone&controls=0&q=high&speed=0';
const OFF_IN = 28, OFF_OUT = 170, OFF_STEP = 4;   // inner band, m shoreward of the line

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// ---- PNG decode + luma (capture_temporal.mjs, verbatim: dependency-free) ----
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

// ---- world -> screen through the recorded camera ----
function applyM(e, v) {
  const [x, y, z] = v;
  const w = 1 / (e[3] * x + e[7] * y + e[11] * z + e[15]);
  return [(e[0] * x + e[4] * y + e[8] * z + e[12]) * w,
          (e[1] * x + e[5] * y + e[9] * z + e[13]) * w,
          (e[2] * x + e[6] * y + e[10] * z + e[14]) * w];
}
// P * MWI applied in sequence: world -> view -> clip (each applyM divides by w;
// for the affine MWI w stays 1, so chaining is exact).
function worldToPixel(cam, W, H, wx, wy, wz) {
  const view = applyM(cam.mwi, [wx, wy, wz]);
  const ndc = applyM(cam.proj, view);
  if (!Number.isFinite(ndc[0]) || !Number.isFinite(ndc[1]) || Math.abs(ndc[2]) > 1) return null;
  const px = Math.round((ndc[0] + 1) / 2 * W);
  const py = Math.round((1 - ndc[1]) / 2 * H);
  if (px < 4 || px >= W - 4 || py < 4 || py >= H - 4) return null;   // 9x9 kernel margin
  return [px, py];
}
function sampleLuma(img, px, py) {   // 3x3 mean, robust to 1-px aliasing
  let s = 0, n = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const o = ((py + dy) * img.width + (px + dx)) * img.channels;
    s += luma(img.data, o); n++;
  }
  return s / n;
}
// Foam MASS: min(R,G,B) box-averaged over 9x9 px (~5 m at the drone rig).
// Two falsified samplers before this one: raw 3x3 LUMA — carving foam
// un-damps the ripple field (fragment detailGrad is foam-damped), so carved
// pixels regain sun glint and their luma can RISE while the foam falls; and
// 3x3 min-channel — glint is spectrally white (sun), so a small kernel still
// counts it as foam. The separation is SPATIAL, not spectral: foam is smooth
// bright mass tens of metres wide, glint is 1-2 px speckle over teal, so a
// ~5 m box keeps the foam band's value while speckle dilutes toward the
// water base.
function sampleWhite(img, px, py) {
  let s = 0, n = 0;
  for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
    const o = ((py + dy) * img.width + (px + dx)) * img.channels;
    s += Math.min(img.data[o], img.data[o + 1], img.data[o + 2]) / 255; n++;
  }
  return s / n;
}

// ---- capture ----
const ANALYZE_ONLY = process.argv.includes('--analyze-only');
const META_PATH = join(OUT, 'frames_meta.json');
let frames = {};
const errors = [];
if (!ANALYZE_ONLY) {
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

let cameraProof = null;
for (const arm of [0, 1]) {
  for (const sim of TIMES) {
    const hash = `${BASE_HASH}&sim=${sim}` + (arm ? '&slife=1' : '');
    // Hash-only navigations don't reload, and the app's own hashchange
    // handler reloads itself when the boot-only set changes — racing
    // page.reload(). Blank the page first so every goto is a clean boot.
    await page.goto('about:blank');
    await page.goto(`http://localhost:${PORT}/web-three/#${hash}`, { waitUntil: 'load' });
    await page.waitForTimeout(2600);
    const meta = await page.evaluate(() => {
      const pb = window.__pointbreak;
      const u = pb.uniforms;
      pb.camera.updateMatrixWorld(true);
      return {
        sim: pb.sim(),
        slife: u.u_stripeLife.value,
        cameraPos: pb.camera.position.toArray(),
        proj: [...pb.camera.projectionMatrix.elements],
        mwi: [...pb.camera.matrixWorldInverse.elements],
        line: pb.lineProbe(5),
        // Everything the Node-side model twin needs to evaluate the SAME
        // rayPhase/breakLine the shader runs (the baked tables live CPU-side
        // in the DataTextures) — so the instrument predicts the carve field
        // exactly instead of re-deriving the kinematics by hand.
        model: {
          T: u.u_T.value, tau: u.u_tau.value, alpha: u.u_alpha.value,
          H0: u.u_H0.value, sections: u.u_sections.value,
          geoMix: u.u_geoMix.value, psiMix: u.u_psiMix.value,
          breakMix: u.u_breakMix.value, aframe: u.u_aframe.value,
          contourFit: [u.u_contourFit.value.x, u.u_contourFit.value.y],
          stageBounds: [u.u_stageBounds.value.x, u.u_stageBounds.value.y],
          kappa: u.u_refrKappa.value,
          refrZ: [u.u_refrZ.value.x, u.u_refrZ.value.y],
          refrPsi: [u.u_refrPsi.value.x, u.u_refrPsi.value.y],
          psiTex: Array.from(u.u_refrTex.value.image.data),
          psiN: u.u_refrTex.value.image.width,
          breakTex: Array.from(u.u_breakTex.value.image.data),
          breakN: u.u_breakTex.value.image.width,
          breakX: [u.u_breakX.value.x, u.u_breakX.value.y],
          breakZDec: [u.u_breakZ.value.x, u.u_breakZ.value.y],
        },
      };
    });
    if (meta.sim !== sim) throw new Error(`clock mismatch: wanted ${sim}, got ${meta.sim}`);
    if (meta.slife !== arm) throw new Error(`flag mismatch: wanted slife=${arm}, got ${meta.slife}`);
    // Lesson 11: the two arms of an A/B must share a frame. cam=drone is a
    // fixed preset, but prove it rather than assume it.
    const rig = JSON.stringify([meta.cameraPos, meta.proj]);
    if (!cameraProof) cameraProof = rig;
    else if (rig !== cameraProof) throw new Error('camera drift between arms/clocks');
    const file = join(OUT, `slife${arm}_${String(sim).padStart(3, '0')}.png`);
    await page.screenshot({ path: file });
    frames[`${arm}_${sim}`] = { file, meta };
    console.log(`captured slife=${arm} sim=${sim}`);
  }
}
await browser.close();
writeFileSync(META_PATH, JSON.stringify(frames));
} else {
  frames = JSON.parse(readFileSync(META_PATH, 'utf8'));
}

// ---- the model twin: exact rayPhase/breakLine from the captured bakes ----
// The instrument's earlier lives re-derived the kinematics by hand and each
// re-derivation was falsified by the pixels (recorded here as warnings):
//   (1) band-MEAN raw luma — the ~0.42 water base diluted the foam gradient
//       below fit noise; (2) fixed-offset transect x-slope — crosses stripe
//   boundaries (full-period age jumps) as the along-shore depth changes;
//   (3) linear x-slope at all — the along-crest clock is a SAWTOOTH around
//       the current breakpoint, so a line fit reads ~0 wherever the head sits
//       mid-frame; (4) anchoring predicted age to the brightest line-band
//       pixel — swash near the beach captures the argmax (lesson 4/11 family:
//       the anchor shared a variable with the measurand).
// The fix is to stop re-deriving: the captured meta carries the SAME baked
// tables the shader reads (psi, break line) plus the model uniforms, so this
// twin evaluates the clock the mechanism actually runs on, and the pixels are
// compared against the mechanism's own prediction.
const fract = (v) => v - Math.floor(v);
const clampN = (v, a, b) => Math.min(Math.max(v, a), b);
const smoothstepN = (a, b, v) => { const t = clampN((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function hash11(p) { p = fract(p * 0.1031); p *= p + 33.33; return fract((p + p) * p); }
function vnoise1(x) { const i = Math.floor(x); let f = x - i; f = f * f * (3 - 2 * f); return hash11(i) * (1 - f) + hash11(i + 1) * f; }
function makeTwin(m) {
  const geoW = m.geoMix * (m.aframe > 0.5 ? 0 : 1);
  const coastCurve = (x) => {
    const gx = clampN(x, m.stageBounds[0], m.stageBounds[1]);
    const synthetic = x * x / 5000;
    const measured = m.contourFit[0] * gx * gx + m.contourFit[1] * gx * gx * gx;
    return synthetic * (1 - geoW) + measured * geoW;
  };
  const dec16 = (tex, n, f) => {
    f = clampN(f, 0, 1) * (n - 1);
    const i = Math.min(Math.floor(f), n - 1), tf = f - i;
    const at = (j) => (tex[j * 4] * 256 + tex[j * 4 + 1]) / 65535;
    return at(i) * (1 - tf) + at(Math.min(i + 1, n - 1)) * tf;
  };
  const breakTexZ = (x) => {
    const f = (x - m.breakX[0]) / Math.max(m.breakX[1] - m.breakX[0], 1e-3);
    return m.breakZDec[0] + (m.breakZDec[1] - m.breakZDec[0]) * dec16(m.breakTex, m.breakN, f);
  };
  const breakLine = (x) => {
    const sec = m.sections * 55 * (vnoise1(x * 0.02 + 7.3) - 0.5) * 2;
    const base = -coastCurve(x) * (1 - m.breakMix) + breakTexZ(x) * m.breakMix;
    return base + Math.min(sec, 0) * (m.sections >= 0.05 ? 1 : 0);
  };
  const psiLookup = (zc) => {
    const f = (zc - m.refrZ[0]) / Math.max(m.refrZ[1] - m.refrZ[0], 1e-3);
    return m.refrPsi[0] + (m.refrPsi[1] - m.refrPsi[0]) * dec16(m.psiTex, m.psiN, f);
  };
  // psiMix is 1 on mapped presets (shipped default); the legacy plane-wave
  // branch is deliberately not twinned — assert instead of quietly diverging.
  if (m.psiMix < 0.5) throw new Error('twin only supports the baked-psi path (psiMix=1)');
  const rayPhase = (x, z) => m.kappa * x + psiLookup(z + coastCurve(x));
  const w = 2 * Math.PI / m.T;
  const tSince = (x, z, t) => {
    let th = (w * t - rayPhase(x, z)) % (2 * Math.PI);
    if (th < 0) th += 2 * Math.PI;
    return th / w;
  };
  // The fragment carve, verbatim (shaders.js GRID_FRAG #slife block).
  const carve = (x, z, t) => {
    const zb = breakLine(x);
    const lagPhi = Math.max(rayPhase(x, z) - rayPhase(x, zb), 0);
    const age = clampN(tSince(x, z, t) + lagPhi / Math.max(w, 1e-4), 0, 240);
    const alongF = age % m.T;
    const lagF = age - alongF;
    const c = (0.45 + 0.55 * Math.exp(-alongF / Math.max(0.33 * m.T, 1)))
            * (0.55 + 0.45 * Math.exp(-lagF / Math.max(2.4 * m.tau, 1)));
    const innerF = smoothstepN(zb + 12, zb + 34, z);
    return 1 + (Math.min(c, 1) - 1) * innerF;
  };
  return { coastCurve, breakLine, rayPhase, tSince, carve, w };
}

const warmAt = (img, px, py) => {
  const o = (py * img.width + px) * img.channels;
  return (img.data[o] - img.data[o + 2]) / 255;
};
function pearson(a, b) {
  const n = a.length;
  const ma = a.reduce((p, v) => p + v, 0) / n, mb = b.reduce((p, v) => p + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = a[i] - ma, dy = b[i] - mb; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxy / Math.max(Math.sqrt(sxx * syy), 1e-9);
}
function spearman(a, b) {
  const rank = (arr) => {
    const idx = arr.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(arr.length);
    idx.forEach(([, i], k) => { r[i] = k; });
    return r;
  };
  return pearson(rank(a), rank(b));
}

const report = [];
for (const sim of TIMES) {
  const off = frames[`0_${sim}`], on = frames[`1_${sim}`];
  const imgOff = decodePNG(readFileSync(off.file));
  const imgOn = decodePNG(readFileSync(on.file));
  const cam = { proj: off.meta.proj, mwi: off.meta.mwi };
  const twin = makeTwin(off.meta.model);
  const t = sim;                     // u_time is the pinned sim clock (speed=0)

  // Per-station water base: the 10th-percentile whiteness of the station's
  // own cross-shore scan (the between-stripe lanes are foam-free water).
  // Whiteness INCLUDES the water floor, and that floor compressed every
  // earlier ratio toward 1 exactly where the carve is deepest (thin aftermath
  // film barely above base) — the binned ratio-vs-carve check read
  // ANTI-monotone until the base was subtracted. Foam signal = white - base.
  const waterBase = new Map();
  for (const st of off.meta.line) {
    if (st.gap) continue;
    const vals = [];
    for (let o = 16; o <= OFF_OUT; o += OFF_STEP) {
      const p = worldToPixel(cam, imgOff.width, imgOff.height, st.x, 0, st.z + o);
      if (!p || warmAt(imgOff, p[0], p[1]) > 0.08) continue;
      vals.push(sampleWhite(imgOff, p[0], p[1]));
    }
    if (vals.length >= 8) {
      vals.sort((a, b) => a - b);
      waterBase.set(st.x, vals[Math.floor(vals.length * 0.1)]);
    }
  }

  // A. IMPLEMENTATION: does the rendered foam-signal ratio follow the
  // predicted carve? Pearson(carve, foamSigON/foamSigOFF) over inner samples
  // with a real OFF foam signal — the mechanism-vs-pixels check with no
  // hand-derived kinematics in between (the carve itself was separately
  // verified against the shader's own rendered carve field, r = 0.995).
  const predC = [], measRatio = [];
  for (const st of off.meta.line) {
    if (st.gap || !waterBase.has(st.x)) continue;
    const base = waterBase.get(st.x);
    for (let o = OFF_IN; o <= OFF_OUT; o += OFF_STEP) {
      const p = worldToPixel(cam, imgOff.width, imgOff.height, st.x, 0, st.z + o);
      if (!p || warmAt(imgOff, p[0], p[1]) > 0.08) continue;
      const so = sampleWhite(imgOff, p[0], p[1]) - base;
      if (so < 0.06) continue;                     // no OFF foam signal here
      const sn = sampleWhite(imgOn, p[0], p[1]) - base;
      predC.push(twin.carve(st.x, st.z + o, t));
      measRatio.push(Math.max(sn, 0) / so);
    }
  }
  const implR = predC.length >= 20 ? pearson(predC, measRatio) : null;

  // B. ACCEPTANCE: along each ACTUAL stripe — the level set tSince = 2 s
  // behind each crest, exactly where ocean() deposits the band — sample OFF
  // and ON luma and rank-correlate against the stripe's own predicted age.
  // OFF should be ~flat (the diagnosed banding); ON should grade fresh ->
  // decayed (negative rho), and because predicted age rises OPPOSITE the
  // peel by construction, a negative rho IS direction-consistency with the
  // break-line comet (same phase field, same handedness).
  const stripes = [];
  const zSolve = (x, targetPhase) => {   // rayPhase monotone in z: bisection
    let lo = twin.breakLine(x) - 10, hi = twin.breakLine(x) + 260;
    if (twin.rayPhase(x, lo) > targetPhase || twin.rayPhase(x, hi) < targetPhase) return null;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (twin.rayPhase(x, mid) < targetPhase) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  for (let k = 1; k <= 3; k++) {
    const xsS = [], ageS = [], carveS = [], lOffS = [], lOnS = [];
    for (const st of off.meta.line) {
      if (st.gap) continue;
      // The twin's breakLine, NOT lineProbe's z: the probe reports the baked
      // line without the section-noise term, but the shader's stripe clock
      // anchors at breakLine() WITH it — at sewers (sections 0.40) the
      // difference is up to ~22 m of z = ~5 s of x-varying age error, enough
      // to scramble a rank ordering whose whole span is ~12-15 s (this
      // exact mismatch was the fourth falsified instrument variant).
      const zb = twin.breakLine(st.x);
      // crest n at rayPhase = w*t - 2pi*n; the band rides 2 s behind it. Pick
      // n so the band lies k stripes shoreward of the line at this station.
      const phaseLine = twin.rayPhase(st.x, zb);
      const nLine = Math.floor((twin.w * t - phaseLine) / (2 * Math.PI));
      const target = twin.w * t - 2 * Math.PI * (nLine - k) - 2.0 * twin.w;
      const z = zSolve(st.x, target);
      if (z === null || z < zb + 26 || z > zb + 200) continue;
      const p = worldToPixel(cam, imgOff.width, imgOff.height, st.x, 0, z);
      if (!p || warmAt(imgOff, p[0], p[1]) > 0.08) continue;
      if (!waterBase.has(st.x)) continue;
      const base = waterBase.get(st.x);
      const lo = sampleWhite(imgOff, p[0], p[1]) - base;
      if (lo < 0.06) continue;                     // off the foam band (lane/water)
      const lagPhi = Math.max(twin.rayPhase(st.x, z) - phaseLine, 0);
      xsS.push(st.x);
      ageS.push(twin.tSince(st.x, z, t) + lagPhi / twin.w);
      carveS.push(twin.carve(st.x, z, t));
      lOffS.push(lo);
      lOnS.push(Math.max(sampleWhite(imgOn, p[0], p[1]) - base, 0));
    }
    if (xsS.length < 12) { stripes.push({ k, stations: xsS.length }); continue; }
    const rhoOff = spearman(lOffS, ageS);
    const rhoOn = spearman(lOnS, ageS);
    // The direct check: the measured per-point modulation (foam-signal ratio
    // ON/OFF) against the twin's predicted carve at the same point. Age-rank
    // metrics dilute under OFF-band wander; this one asks only "did each
    // sampled point dim by the amount its own clock prescribes".
    const ratioS = lOnS.map((v, i) => v / Math.max(lOffS[i], 1e-3));
    const rCarve = pearson(ratioS, carveS);
    stripes.push({
      k, stations: xsS.length, xRange: [Math.min(...xsS), Math.max(...xsS)],
      ageRangeS: [Math.min(...ageS), Math.max(...ageS)],
      rho: { off: rhoOff, on: rhoOn }, rCarve,
    });
    console.log(`sim=${sim} stripe k=${k} (n ${xsS.length}, age ${Math.min(...ageS).toFixed(1)}-${Math.max(...ageS).toFixed(1)} s)  ` +
                `rho(foamSig,age) OFF ${rhoOff.toFixed(2)}  ON ${rhoOn.toFixed(2)}  r(ratio,carve) ${rCarve.toFixed(2)}`);
  }
  console.log(`sim=${sim} implementation r(predicted carve, measured foam-signal ratio) = ${implR === null ? 'n/a (lull)' : implR.toFixed(2)} (n ${predC.length})`);
  report.push({ sim, implementation: { r: implR, samples: predC.length }, stripes });
}

writeFileSync(join(OUT, 'stripe_life_report.json'), JSON.stringify({
  generated: new Date().toISOString(),
  baseHash: BASE_HASH, times: TIMES, innerBandM: [OFF_IN, OFF_OUT],
  report,
}, null, 2));
console.log(`report -> ${join(OUT, 'stripe_life_report.json')}`);
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
