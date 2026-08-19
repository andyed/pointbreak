// ABSOLUTE SCALE FROM PIXELS — TODO Track 6: "crest spacing in a drone frame vs
// dispersion — confirms LAM shoaling with no replica involved", plus the drawn
// height-to-length ratio that decides "dune vs wave".
//
// NO REPLICA. Every measured number comes from PIXELS of the shipped renderer
// plus the camera projection. `model-js.js` (the CPU twin) is never consulted
// for the measured side and could not be: the vertex shader displaces the
// surface HORIZONTALLY (`off = lam*grad`), throws the lip and carves the face
// AFTER ocean() has run (shaders.js surfacePos), so the twin is not the drawn
// surface. dispersion.js / bed.js supply only the PREDICTION under test.
//
// ---------------------------------------------------------------------------
// INSTRUMENT 1 (primary) — the DIPSTICK: drawn surface elevation by occlusion
// ---------------------------------------------------------------------------
// Vertical rods of known world position are injected into the live scene along
// a shore-normal transect at x = cx. They are opaque, unlit, depth-tested, so
// the water mesh hides whatever is below the surface. Scanning each rod from
// the top down, the LOWEST still-visible height is the drawn water surface
// elevation at that station. This is an occlusion test on known geometry, not
// a luma feature: it does not care how the water is shaded, which is the whole
// point (see "how this could be lying" below).
//
// The camera sits OFF TO THE SIDE (offset in +x, perpendicular to the
// transect) at a steep depression, with a wide viewport. Two things follow:
//   * z maps to the image horizontal and y to the image vertical, so no two
//     rods can overlap however closely they are spaced (2 m here), and the
//     whole profile comes from ONE frame;
//   * the y resolution is (transect length / frame width) / cos(depression) —
//     measured ~0.2 m, and reported per run as etaResolutionM.
// A shoreward-looking rig was tried first and is unusable: there the rod image
// and the transect share an image axis, which forces ~1 m of y per pixel and
// makes the rods occlude each other.
//
// ---------------------------------------------------------------------------
// INSTRUMENT 2 (cross-check) — luma crest detection in a near-nadir frame
// ---------------------------------------------------------------------------
// The task's literal form: find the crest lines in the image and convert to
// metres. Luma is sampled along the transect IN WORLD SPACE (project (cx,0,z)
// for z at 0.25 m steps, sample the frame bilinearly) so the abscissa is
// metres and perspective foreshortening never enters — MEASUREMENT_LESSONS's
// warning that pixel spacing depends on where in the frame you measure is
// handled by construction rather than by correction. Band-pass, take the
// analytic-signal phase, read crest positions off the phase.
// The camera is at 80 deg depression, where a crest of height h is displaced
// along the transect by only h/tan(80) ~ 1 m; the dipstick's own eta removes
// even that.
//
// ---------------------------------------------------------------------------
// PROOFS, run per configuration, recorded in the manifest
// ---------------------------------------------------------------------------
//   P1  the camera look-at must project to frame centre (centerErrPx);
//   P2  project -> unproject round trip on every luma sample (rtMaxM);
//   P3  three markers of KNOWN height (0/3/6 m) injected at the transect and
//       put through a two-view solve (marker_proof.tsv);
//   P4  the dipstick re-run at a second depression (80 deg vs 70 deg). A rod is
//       occluded where the sight ray grazes the surface, which is up to
//       ~eta/tan(dep) metres to the SIDE of the rod; if that mattered the two
//       depressions would disagree. Reported as etaCheckMaxDiffM.
//   P5  a #psi=0 control arm. With the shoaling phase field off the model
//       reverts to the frozen LAM = 90 m plane wave, so the instrument must
//       measure ~90/cos(phi) m at EVERY depth. If it does, the depth-dependent
//       spacing measured with psi on is a property of the render, not of the
//       ruler.
//
// HOW THIS COULD BE LYING (stated because an earlier version did):
//   * A luma feature need not sit at the same phase of the wave in two
//     different views. The first version of this script solved for elevation by
//     triangulating the SAME band-passed luma feature across three depressions
//     (70/35/18 deg). It passed its own residual test and returned a surface
//     floating 5.5-10.9 m above still water, which the dipstick shows is wrong
//     by about that whole offset: view-dependent shading moved the feature.
//     Nothing here now infers HEIGHT from luma.
//   * The dipstick's occlusion point is the grazing point, not the rod — P4.
//   * A rod inside an overturning lip reads the overhang, not the surface
//     under it. Transects are kept SEAWARD of the drawn break line for that
//     reason, and their shoreward end is recorded.
//   * One frozen clock is one frozen clock (MEASUREMENT_LESSONS 1). The set
//     envelope multiplies the drawn amplitude, so H is a per-clock number; two
//     clocks are run for every configuration and both are reported.
//
// Usage: python3 scripts/serve.py 8212
//        node scripts/measure_wave_scale.mjs <outdir> [--base=...] [--xs=..] [--maxT=2]
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inflateSync, deflateSync } from 'node:zlib';

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname,
].filter(Boolean);
let chromium;
for (const c of PW_CANDIDATES) { try { ({ chromium } = await import(c)); break; } catch { /* next */ } }
if (!chromium) { console.error('playwright not found; set PLAYWRIGHT_DIR'); process.exit(1); }

const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const s = a.replace(/^--/, ''); const eq = s.indexOf('=');
  return eq < 0 ? [s, undefined] : [s.slice(0, eq), s.slice(eq + 1)];
}));
const OUT = resolve(args.filter((a) => !a.startsWith('--'))[0] || '/tmp/pointbreak-scale');
const BASE = flags.base || 'http://localhost:8212/web-three/';
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const WIDE = { width: 3000, height: 760 };     // dipstick frames
const NADIR = { width: 1600, height: 1000 };   // luma + photo frames
const ROD_DZ = 2;                              // dipstick station spacing, m
const ROD_TOP = 9, ROD_BOT = -6;               // rod scan range, m about still water
const LUMA_DZ = 0.25;
const COMMON = 'cam=free&controls=0&q=high&speed=0&noclip=1';

// ------------------------------------------------------------------ PNG codec
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
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c); }
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  return { w, h, ch, data: out };
}
const CRC_TABLE = (() => { const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(b) { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const o = Buffer.alloc(12 + data.length); o.writeUInt32BE(data.length, 0); o.write(type, 4, 'ascii'); data.copy(o, 8); o.writeUInt32BE(crc32(o.subarray(4, 8 + data.length)), 8 + data.length); return o; }
function encodePNG(w, h, rgb) {
  const stride = w * 3; const raw = Buffer.alloc(h * (stride + 1));
  for (let y = 0; y < h; y++) { raw[y * (stride + 1)] = 0; rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function bilinear(png, px, py) {
  const { w, h, ch, data } = png;
  if (!(px >= 0 && py >= 0 && px <= w - 1 && py <= h - 1)) return NaN;
  const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
  const fx = px - x0, fy = py - y0;
  const L = (x, y) => { const o = (y * w + x) * ch; return 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]; };
  return L(x0, y0) * (1 - fx) * (1 - fy) + L(x1, y0) * fx * (1 - fy) + L(x0, y1) * (1 - fx) * fy + L(x1, y1) * fx * fy;
}
const isRod = (png, px, py) => {          // magenta rod pixel
  const x = Math.round(px), y = Math.round(py);
  if (x < 0 || y < 0 || x >= png.w || y >= png.h) return false;
  const o = (y * png.w + x) * png.ch;
  return png.data[o] > 140 && png.data[o + 2] > 110 && png.data[o + 1] < 100;
};
function setPx(rgb, w, h, x, y, col) { x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= w || y >= h) return; const o = (y * w + x) * 3; rgb[o] = col[0]; rgb[o + 1] = col[1]; rgb[o + 2] = col[2]; }
function drawLine(rgb, w, h, x0, y0, x1, y1, col) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= n; i++) setPx(rgb, w, h, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n, col);
}
function drawDot(rgb, w, h, x, y, col, r = 2) { for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) setPx(rgb, w, h, x + dx, y + dy, col); }
function drawCross(rgb, w, h, x, y, col, r = 12) { drawLine(rgb, w, h, x - r, y, x + r, y, col); drawLine(rgb, w, h, x, y - r, x, y + r, col); }

// ------------------------------------------------------------------ DSP (luma)
function fft(re, im, inverse) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inverse ? 2 : -2) * Math.PI / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
  if (inverse) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
// Everything longer than spanM is shading trend, not wave: aerial perspective,
// the depth ramp, the shoreward brightening. Without this the largest Fourier
// component of the luma profile IS the trend (measured 170 m on a 130 m window).
function detrend(sig, dz, spanM) {
  const w = Math.max(2, Math.round(spanM / dz / 2));
  const n = sig.length, out = new Float64Array(n);
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) cum[i + 1] = cum[i] + sig[i];
  for (let i = 0; i < n; i++) { const a = Math.max(0, i - w), b = Math.min(n, i + w + 1); out[i] = sig[i] - (cum[b] - cum[a]) / (b - a); }
  return out;
}
function analyticPhase(sig, dz, loM, hiM) {
  const n0 = sig.length; let n = 1; while (n < n0 * 2) n <<= 1;
  const mean = sig.reduce((a, b) => a + b, 0) / n0;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n0; i++) {
    const f = i / (n0 - 1), a = 0.25;
    const wgt = f < a / 2 ? 0.5 * (1 + Math.cos(2 * Math.PI / a * (f - a / 2)))
      : f > 1 - a / 2 ? 0.5 * (1 + Math.cos(2 * Math.PI / a * (f - 1 + a / 2))) : 1;
    re[i] = (sig[i] - mean) * wgt;
  }
  fft(re, im, false);
  for (let i = 0; i < n; i++) {
    const fr = (i <= n / 2 ? i : i - n) / (n * dz);
    const g = (i === 0 || i > n / 2) ? 0 : (1 / fr >= loM && 1 / fr <= hiM ? 2 : 0);
    re[i] *= g; im[i] *= g;
  }
  fft(re, im, true);
  const ph = new Float64Array(n0);
  for (let i = 0; i < n0; i++) ph[i] = Math.atan2(im[i], re[i]);
  const un = new Float64Array(n0); un[0] = ph[0];
  for (let i = 1; i < n0; i++) { let d = ph[i] - ph[i - 1];
    while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; un[i] = un[i - 1] + d; }
  return un;
}
function invertMono(xs, ys, target) {      // x where the table y(x) crosses target
  for (let i = 0; i < ys.length - 1; i++) {
    const a = ys[i], b = ys[i + 1];
    if ((target >= a && target <= b) || (target <= a && target >= b)) {
      const den = Math.abs(b - a) < 1e-12 ? 1e-12 : b - a;
      return xs[i] + (xs[i + 1] - xs[i]) * ((target - a) / den);
    }
  }
  return NaN;
}

// ------------------------------------------------------------------ page setup
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: NADIR, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function loadPinned(hash) {
  await page.goto('about:blank');
  await page.goto(`${BASE}#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(2800);
}

// The model's own prediction. bed.js/dispersion.js only — never model-js.
async function modelProbe(cx, zList) {
  return page.evaluate(async ({ cx, zList }) => {
    const pb = window.__pointbreak;
    const bed = await import('./js/bed.js');
    const disp = await import('./js/dispersion.js');
    const st = pb.state;
    const wl = bed.MSL_ABOVE_NAVD88 + (st.tide || 0);
    const omega = 2 * Math.PI / st.T;
    const kappa = pb.uniforms.u_refrKappa.value;
    const gx = Math.min(Math.max(cx, st.stageStart ?? -110), st.stageEnd ?? 290);
    const cc = (st.geoMix >= 0.5 && (st.aframe || 0) < 0.5)
      ? (st.contourX2 ?? 0) * gx * gx + (st.contourX3 ?? 0) * gx * gx * gx
      : cx * cx / 5000;
    const rows = zList.map((z) => {
      const zc = z + cc;
      const hLocal = wl - bed.bedElevBlended(st.geoSpot, cx, z, st.bedShape || 0);
      const hRef = wl - bed.bedElevBlended(st.geoSpot, 0, zc, st.bedShape || 0);   // the Psi bake's own column
      const hp = Math.max(hRef, 0.05);
      const k = disp.wavenumberAt(omega, hp);
      const kz = disp.normalWavenumber(omega, hp, kappa);
      return { z: +z.toFixed(2), zc: +zc.toFixed(2), hLocalM: +hLocal.toFixed(3), hRefM: +hRef.toFixed(3),
        predLM: +(2 * Math.PI / k).toFixed(2), predLzM: +(2 * Math.PI / kz).toFixed(2),
        incDeg: +(Math.asin(Math.min(kappa / k, 1)) * 180 / Math.PI).toFixed(2),
        physHM: +disp.heightAt(st.H0, st.T, hp).toFixed(3),
        physHshM: +disp.shoaledHeight(st.H0, st.T, hp).toFixed(3),
        micheHL: +(0.142 * Math.tanh(k * hp)).toFixed(4) };
    });
    return { rows, coastCurve: +cc.toFixed(3), kappa, waterLevel: +wl.toFixed(3),
      state: { preset: st.preset, geoSpot: st.geoSpot, T: st.T, H0: st.H0, tide: st.tide, xi: st.xi, alpha: st.alpha,
        dF: st.dF, chop: st.chop, sections: st.sections, stageStart: st.stageStart, stageEnd: st.stageEnd },
      L0: +disp.deepWavelength(st.T).toFixed(1), GAMMA: disp.GAMMA,
      breakingDepthM: +disp.breakingDepth(st.H0, st.T).toFixed(2),
      psiMix: pb.uniforms.u_psiMix.value, depthMix: pb.uniforms.u_depthMix.value,
      day: pb.day(), sim: pb.sim(),
      lineZ: (() => { const l = pb.lineProbe ? pb.lineProbe(2) : null; if (!l) return null;
        let b = 0; for (let i = 1; i < l.length; i++) if (Math.abs(l[i].x - cx) < Math.abs(l[b].x - cx)) b = i; return +l[b].z.toFixed(1); })() };
  }, { cx, zList });
}

// ------------------------------------------------------------------ dipstick
async function dipstickFrame(cx, z0, z1, dep, tag) {
  await page.setViewportSize(WIDE);
  await page.waitForTimeout(250);
  const setup = await page.evaluate(async ({ cx, z0, z1, dep, dz, top, bot }) => {
    const THREE = await import('three');
    const pb = window.__pointbreak; const scene = pb.surferGroup.parent;
    let g = scene.getObjectByName('__dipsticks'); if (g) scene.remove(g);
    g = new THREE.Group(); g.name = '__dipsticks';
    const mat = new THREE.MeshBasicMaterial({ color: 0xff00c8 });
    const geo = new THREE.CylinderGeometry(0.18, 0.18, (top - bot) + 2, 8);
    const zs = []; for (let z = z0; z <= z1 + 1e-9; z += dz) zs.push(+z.toFixed(2));
    for (const z of zs) { const m = new THREE.Mesh(geo, mat); m.position.set(cx, (top + bot) / 2, z); g.add(m); }
    scene.add(g);
    const cz = 0.5 * (z0 + z1), rad = dep * Math.PI / 180, R = 900;
    // the app updates camera.aspect from its own resize listener; do not race it
    pb.camera.aspect = innerWidth / innerHeight;
    pb.camera.position.set(cx + R * Math.cos(rad), R * Math.sin(rad), cz);
    pb.controls.target.set(cx, 0, cz);
    const V = pb.camera.position.constructor;
    let fov = 40;
    for (let it = 0; it < 10; it++) {
      pb.camera.fov = fov; pb.camera.updateProjectionMatrix(); pb.controls.update(); pb.camera.updateMatrixWorld(true);
      let mx = 0, my = 0;
      for (const z of [z0, cz, z1]) for (const y of [bot - 1, top + 1]) {
        const v = new V(cx, y, z); v.project(pb.camera); mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y)); }
      const need = Math.max(mx, my) * 1.06;    // NDC already carries the aspect
      const next = Math.max(0.2, Math.min(78, Math.atan(Math.tan(fov * Math.PI / 360) * need) * 360 / Math.PI));
      if (Math.abs(next - fov) < 0.02) { fov = next; break; } fov = next;
    }
    pb.camera.fov = fov; pb.camera.updateProjectionMatrix(); pb.controls.update(); pb.camera.updateMatrixWorld(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cam = pb.camera;
    const proj = (x, y, z) => { const v = new V(x, y, z); v.project(cam);
      return [(v.x * 0.5 + 0.5) * innerWidth, (1 - (v.y * 0.5 + 0.5)) * innerHeight]; };
    const a = proj(cx, 0, cz), b = proj(cx, 1, cz);
    const ladders = zs.map((z) => { const rungs = [];
      for (let y = top; y >= bot; y -= 0.02) rungs.push([+y.toFixed(2), ...proj(cx, y, z)]);
      return { z, rungs }; });
    return { fov: +cam.fov.toFixed(3), camPos: cam.position.toArray().map((v) => +v.toFixed(1)),
      pxPerMy: +Math.hypot(b[0] - a[0], b[1] - a[1]).toFixed(2),
      centerErrPx: +Math.hypot(a[0] - innerWidth / 2, a[1] - innerHeight / 2).toFixed(3), ladders };
  }, { cx, z0, z1, dep, dz: ROD_DZ, top: ROD_TOP, bot: ROD_BOT });
  await page.waitForTimeout(450);
  const p = join(OUT, `${tag}.png`);
  await page.screenshot({ path: p });
  const png = decodePNG(readFileSync(p));
  const eta = [];
  for (const l of setup.ladders) {
    let lowest = null;
    for (const [y, px, py] of l.rungs) if (isRod(png, px, py)) lowest = y;
    eta.push({ z: l.z, eta: lowest });
  }
  await page.evaluate(() => { const pb = window.__pointbreak; const s = pb.surferGroup.parent;
    const g = s.getObjectByName('__dipsticks'); if (g) s.remove(g); });
  return { fov: setup.fov, camPos: setup.camPos, pxPerMy: setup.pxPerMy, centerErrPx: setup.centerErrPx,
    eta, png: `${tag}.png`, resolutionM: +(1 / setup.pxPerMy).toFixed(3) };
}

// ------------------------------------------------------------------ luma frame
async function lumaFrame(cx, z0, z1, dep, tag, widen = 1) {
  await page.setViewportSize(NADIR);
  await page.waitForTimeout(250);
  const setup = await page.evaluate(async ({ cx, z0, z1, dep, dz, widen }) => {
    const pb = window.__pointbreak;
    const cz = 0.5 * (z0 + z1), rad = dep * Math.PI / 180, R = 1100;
    pb.camera.aspect = innerWidth / innerHeight;
    pb.camera.position.set(cx, R * Math.sin(rad), cz + R * Math.cos(rad));
    pb.controls.target.set(cx, 0, cz);
    const V = pb.camera.position.constructor;
    let fov = 50;
    for (let it = 0; it < 10; it++) {
      pb.camera.fov = fov; pb.camera.updateProjectionMatrix(); pb.controls.update(); pb.camera.updateMatrixWorld(true);
      let mx = 0, my = 0;
      for (const z of [z0, cz, z1]) for (const x of [cx - 60, cx, cx + 60]) for (const y of [0, 8]) {
        const v = new V(x, y, z); v.project(pb.camera); mx = Math.max(mx, Math.abs(v.x)); my = Math.max(my, Math.abs(v.y)); }
      const need = Math.max(mx, my) * 1.08 * widen;
      const next = Math.max(1, Math.min(78, Math.atan(Math.tan(fov * Math.PI / 360) * need) * 360 / Math.PI));
      if (Math.abs(next - fov) < 0.02) { fov = next; break; } fov = next;
    }
    pb.camera.fov = fov; pb.camera.updateProjectionMatrix(); pb.controls.update(); pb.camera.updateMatrixWorld(true);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const cam = pb.camera;
    const proj = (x, y, z) => { const v = new V(x, y, z); v.project(cam);
      return [(v.x * 0.5 + 0.5) * innerWidth, (1 - (v.y * 0.5 + 0.5)) * innerHeight, v.z]; };
    const unproj = (px, py) => { const v = new V((px / innerWidth) * 2 - 1, -((py / innerHeight) * 2 - 1), 0.5).unproject(cam);
      const o = cam.position, d = v.sub(o).normalize(); const t = -o.y / d.y; return [o.x + d.x * t, o.z + d.z * t]; };
    const path = []; let rtMax = 0;
    for (let z = z0; z <= z1 + 1e-9; z += dz) {
      const p = proj(cx, 0, z); path.push([+z.toFixed(2), p[0], p[1]]);
      const u = unproj(p[0], p[1]); rtMax = Math.max(rtMax, Math.hypot(u[0] - cx, u[1] - z));
    }
    const t = proj(cx, 0, cz);
    return { fov: +cam.fov.toFixed(2), camPos: cam.position.toArray().map((v) => +v.toFixed(1)),
      camY: cam.position.y, camZ: cam.position.z, rtMaxM: rtMax,
      centerErrPx: +Math.hypot(t[0] - innerWidth / 2, t[1] - innerHeight / 2).toFixed(3), path };
  }, { cx, z0, z1, dep, dz: LUMA_DZ, widen });
  await page.waitForTimeout(450);
  const p = join(OUT, `${tag}.png`);
  await page.screenshot({ path: p });
  const png = decodePNG(readFileSync(p));
  return { ...setup, luma: setup.path.map(([, px, py]) => bilinear(png, px, py)), img: png, png: `${tag}.png` };
}

// ------------------------------------------------------------------ marker proof
async function markerProof(cx, cz) {
  const heights = [0, 3, 6];
  const known = await page.evaluate(async ({ cx, cz, heights }) => {
    const THREE = await import('three');
    const pb = window.__pointbreak; const scene = pb.surferGroup.parent;
    let g = scene.getObjectByName('__scaleMarkers'); if (g) scene.remove(g);
    g = new THREE.Group(); g.name = '__scaleMarkers';
    const zs = heights.map((_, i) => cz - 40 + i * 40);
    heights.forEach((y, i) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(1.2, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xff00c8, depthTest: false }));
      m.position.set(cx, y, zs[i]); m.renderOrder = 999; g.add(m);
    });
    scene.add(g);
    return heights.map((y, i) => ({ y, z: +zs[i].toFixed(2) }));
  }, { cx, cz, heights });
  await page.setViewportSize(NADIR);
  const seen = [];
  for (const dep of [70, 20]) {
    const s = await page.evaluate(async ({ cx, cz, dep }) => {
      const pb = window.__pointbreak;
      const rad = dep * Math.PI / 180, R = 900;
      pb.camera.position.set(cx, R * Math.sin(rad), cz + R * Math.cos(rad));
      pb.controls.target.set(cx, 0, cz);
      pb.camera.fov = 16; pb.camera.updateProjectionMatrix(); pb.controls.update(); pb.camera.updateMatrixWorld(true);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return { camY: pb.camera.position.y, camZ: pb.camera.position.z };
    }, { cx, cz, dep });
    await page.waitForTimeout(350);
    const p = join(OUT, `_markers_dep${dep}.png`);
    await page.screenshot({ path: p });
    const png = decodePNG(readFileSync(p));
    const { w, h, ch, data } = png;
    const hot = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { const o = i * ch;
      if (data[o] > 150 && data[o + 2] > 120 && data[o + 1] < 90) hot[i] = 1; }
    const seenPx = new Uint8Array(w * h); const blobs = [];
    for (let i = 0; i < w * h; i++) {
      if (!hot[i] || seenPx[i]) continue;
      const st = [i]; seenPx[i] = 1; let n = 0, sx = 0, sy = 0;
      while (st.length) { const j = st.pop(); const x = j % w, y = (j / w) | 0; n++; sx += x; sy += y;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; const k = ny * w + nx;
          if (hot[k] && !seenPx[k]) { seenPx[k] = 1; st.push(k); } } }
      if (n >= 8) blobs.push({ px: sx / n, py: sy / n });
    }
    blobs.sort((a, b) => a.py - b.py);
    const zs = await page.evaluate(({ pts }) => {
      const pb = window.__pointbreak; const cam = pb.camera; cam.updateMatrixWorld(true);
      const V = cam.position.constructor;
      return pts.map(([px, py]) => { const v = new V((px / innerWidth) * 2 - 1, -((py / innerHeight) * 2 - 1), 0.5).unproject(cam);
        const o = cam.position, d = v.sub(o).normalize(); const t = -o.y / d.y; return o.z + d.z * t; });
    }, { pts: blobs.map((b) => [b.px, b.py]) });
    seen.push({ dep, ...s, zs });
  }
  await page.evaluate(() => { const pb = window.__pointbreak; const s = pb.surferGroup.parent;
    const g = s.getObjectByName('__scaleMarkers'); if (g) s.remove(g); });
  const out = [];
  const n = Math.min(...seen.map((s) => s.zs.length));
  for (let i = 0; i < n && i < known.length; i++) {
    let best = null;
    for (let hh = -2; hh <= 12; hh += 0.005) {
      const zt = seen.map((s) => { const a = s.camY / (s.camY - hh); return (s.zs[i] - s.camZ * (1 - a)) / a; });
      const v = Math.abs(zt[0] - zt[1]);
      if (!best || v < best.v) best = { h: hh, z: (zt[0] + zt[1]) / 2, v };
    }
    out.push({ trueY: known[i].y, trueZ: known[i].z,
      recoveredY: +best.h.toFixed(3), recoveredZ: +best.z.toFixed(2), spreadM: +best.v.toFixed(3) });
  }
  return out;
}

// Crest / trough positions of the measured eta profile. Turning points of the
// raw profile are unusable: the dipstick quantizes eta at ~0.2 m, so a flat
// trough produces a dozen spurious crest/trough pairs. Instead the SAME
// band-pass + analytic-phase treatment used on the luma profile is applied to
// eta itself (42-155 m, the whole range linear theory allows in 1-8 m of
// water), and phase = 0 / pi mod 2pi are the crest / trough positions. The
// HEIGHTS are then read off the RAW profile inside each cycle, so the
// band-pass never touches the amplitude.
function phaseExtrema(zs, ys) {
  const clean = ys.map((v, i) => v === null ? (ys[i - 1] ?? ys[i + 1] ?? 0) : v);
  const dz = zs[1] - zs[0];
  const un = analyticPhase(detrend(clean, dz, 170), dz, 42, 155);
  const dir = un[un.length - 1] > un[0] ? 1 : -1;
  const phi = Array.from(un).map((v) => v * dir);
  // LOCAL wavelength from the phase gradient, L(z) = 2*pi / (dphi/dz). This is
  // what lets a large-swell day be measured at all: with H0 = 2.5 m / T = 17 s
  // the break line moves 130 m seaward and the unbroken window inside the Psi
  // bake holds less than one whole wavelength, so crest-to-crest has nothing
  // to span. Central 70% only — the Tukey taper owns the ends.
  const local = [];
  const i0 = Math.floor(zs.length * 0.15), i1 = Math.ceil(zs.length * 0.85);
  const halfWin = Math.max(2, Math.round(10 / dz));
  for (let i = i0; i < i1; i++) {
    const a = Math.max(0, i - halfWin), b = Math.min(zs.length - 1, i + halfWin);
    const g = (phi[b] - phi[a]) / (zs[b] - zs[a]);
    if (g > 1e-4) local.push({ z: zs[i], LzM: 2 * Math.PI / g });
  }
  const out = [];
  for (let n = Math.ceil((phi[0] - Math.PI) / Math.PI); n * Math.PI <= phi[phi.length - 1]; n++) {
    const z = invertMono(zs, phi, n * Math.PI);
    if (!Number.isFinite(z)) continue;
    const kind = ((n % 2) + 2) % 2 === 0 ? 'crest' : 'trough';
    // read the raw extremum within +-8 m of the phase position
    let best = null;
    for (let i = 0; i < zs.length; i++) {
      if (Math.abs(zs[i] - z) > 8 || ys[i] === null) continue;
      if (!best || (kind === 'crest' ? ys[i] > best.eta : ys[i] < best.eta)) best = { z: zs[i], eta: ys[i] };
    }
    if (best) out.push({ kind, z: best.z, eta: best.eta, phaseZ: +z.toFixed(2) });
  }
  out.local = local;
  return out;
}

// ------------------------------------------------------------------ configs
const CONFIGS = flags.configs ? JSON.parse(readFileSync(flags.configs, 'utf8')) : [
  { name: 'secondpeak_sim42',              hash: 'preset=secondpeak&sim=42' },
  { name: 'secondpeak_sim96',              hash: 'preset=secondpeak&sim=96' },
  { name: 'secondpeak_sim150',             hash: 'preset=secondpeak&sim=150' },
  { name: 'sewers_sim42',                  hash: 'preset=sewers&sim=42' },
  { name: 'sewers_sim96',                  hash: 'preset=sewers&sim=96' },
  { name: 'sewers_sim150',                 hash: 'preset=sewers&sim=150' },
  { name: 'secondpeak_big_sim42',          hash: 'preset=secondpeak&day=big&sim=42' },
  { name: 'secondpeak_big_sim96',          hash: 'preset=secondpeak&day=big&sim=96' },
  { name: 'CONTROL_secondpeak_psi0_sim42', hash: 'preset=secondpeak&psi=0&sim=42' },
  { name: 'CONTROL_secondpeak_psi0_sim96', hash: 'preset=secondpeak&psi=0&sim=96' },
];
const XS_TRY = (flags.xs || '80,160,120,40').split(',').map(Number);
const MAX_TRANSECTS = Number(flags.maxT || 2);

const manifest = { generated: new Date().toISOString(), base: BASE,
  wideViewport: [WIDE.width, WIDE.height], nadirViewport: [NADIR.width, NADIR.height],
  rodSpacingM: ROD_DZ, rodRangeM: [ROD_BOT, ROD_TOP], lumaStepM: LUMA_DZ, runs: {} };
const spacingRows = [], hlRows = [], markerRows = [], etaProfiles = {};

for (const cfg of CONFIGS) {
  await loadPinned(`${cfg.hash}&${COMMON}`);
  const simWant = Number((cfg.hash.match(/sim=(-?[\d.]+)/) || [])[1]);
  const run = { hash: cfg.hash, transects: [] };
  let done = 0;

  for (const cx of XS_TRY) {
    if (done >= MAX_TRANSECTS) break;
    const p0 = await modelProbe(cx, [0]);
    if (Number.isFinite(simWant) && p0.sim !== simWant) throw new Error(`${cfg.name}: clock ${p0.sim} != ${simWant}`);
    const zSea = -258 - p0.coastCurve + 2;               // Psi bake floor is contourZ = -260
    const zShore = (p0.lineZ ?? -120) - 12;              // stay seaward of the drawn break line
    if (!(zShore - zSea > 100)) { run.transects.push({ cx, skipped: `window ${(zShore - zSea).toFixed(0)} m`, zSea: +zSea.toFixed(1), zShore: +zShore.toFixed(1) }); continue; }

    const tag = `${cfg.name}_x${cx}`;
    const dip = await dipstickFrame(cx, zSea, zShore, 70, `${tag}_dipstick70`);
    const dip2 = done === 0 ? await dipstickFrame(cx, zSea, zShore, 80, `${tag}_dipstick80`) : null;
    let etaCheckMaxDiffM = null, etaCheckMedDiffM = null;
    if (dip2) {
      let m = 0, k = 0;
      for (let i = 0; i < dip.eta.length; i++) {
        const a = dip.eta[i].eta, b = dip2.eta[i] ? dip2.eta[i].eta : null;
        if (a === null || b === null) continue; m = Math.max(m, Math.abs(a - b)); k++;
      }
      etaCheckMaxDiffM = k ? +m.toFixed(2) : null;
      const diffs = dip.eta.map((e, i) => (e.eta === null || !dip2.eta[i] || dip2.eta[i].eta === null) ? null : Math.abs(e.eta - dip2.eta[i].eta)).filter((v) => v !== null).sort((a, b) => a - b);
      etaCheckMedDiffM = diffs.length ? +diffs[Math.floor(diffs.length / 2)].toFixed(2) : null;
    }
    const zs = dip.eta.map((e) => e.z), ys = dip.eta.map((e) => e.eta);
    const nNull = ys.filter((v) => v === null).length;
    const tp = phaseExtrema(zs, ys);
    etaProfiles[tag] = dip.eta;

    // luma cross-check: crest positions from the image's own shading
    const lum = await lumaFrame(cx, zSea, zShore, 80, `${tag}_luma80`);
    const lumZ = lum.path.map((p) => p[0]);
    let lumaCrests = [];
    if (lum.luma.every(Number.isFinite)) {
      const ph = analyticPhase(detrend(lum.luma, LUMA_DZ, 170), LUMA_DZ, 42, 155);
      const dir = ph[ph.length - 1] > ph[0] ? 1 : -1;
      const phi = Array.from(ph).map((v) => v * dir);
      for (let n = Math.ceil(phi[0] / (2 * Math.PI)); n * 2 * Math.PI <= phi[phi.length - 1]; n++) {
        const z = invertMono(lumZ, phi, n * 2 * Math.PI);
        if (Number.isFinite(z)) lumaCrests.push(z);
      }
      lumaCrests = lumaCrests.map((z) => {     // undo this view's residual height parallax
        let e = 0, best = Infinity;
        for (let i = 0; i < zs.length; i++) if (ys[i] !== null && Math.abs(zs[i] - z) < best) { best = Math.abs(zs[i] - z); e = ys[i]; }
        return +(lum.camZ - (lum.camZ - z) * (lum.camY - e) / lum.camY).toFixed(2);
      });
    }
    const lumaGaps = lumaCrests.slice(1).map((z, i) => +Math.abs(z - lumaCrests[i]).toFixed(2));

    const crests = tp.filter((t) => t.kind === 'crest');
    const troughs = tp.filter((t) => t.kind === 'trough');

    // ---- SPACING, method A: local phase gradient of the measured eta, every 8 m
    for (let i = 0; i < (tp.local || []).length; i += Math.max(1, Math.round(8 / ROD_DZ))) {
      const pt = tp.local[i];
      const mp = (await modelProbe(cx, [pt.z])).rows[0];
      spacingRows.push({ config: cfg.name, x: cx, method: 'phasegrad', z: +pt.z.toFixed(1), zc: mp.zc,
        depthRefM: mp.hRefM, depthLocalM: mp.hLocalM,
        measDzM: +pt.LzM.toFixed(2), lumaDzM: null,
        predLzM: mp.predLzM, ratioLz: +(pt.LzM / mp.predLzM).toFixed(3),
        predLM: mp.predLM, frozenLAMLzM: 90, ratioVsFrozen: +(pt.LzM / 90).toFixed(3),
        incDeg: mp.incDeg, etaResolutionM: dip.resolutionM, etaCheckMedDiffM, etaCheckMaxDiffM });
    }

    // ---- SPACING method B + HEIGHT: one row per interior extremum.
    // Consecutive extrema of the measured eta are half a cycle apart, so a
    // TRIPLE (crest-trough-crest or trough-crest-trough) spans exactly one
    // wavelength and brackets one crest-to-trough height. Both come from the
    // same measured profile at the same place, which is what H/L needs.
    // A large-swell day only ever holds one or two extrema inside the Psi
    // bake, and falls back to 2*|dz| for L (flagged `halfcycle`).
    const emit = async (zA, zMid, zB, method) => {
      const L = Math.abs(zB - zA);
      if (!(L > 30 && L < 210)) return;
      const lo = Math.min(zA, zB), hi = Math.max(zA, zB);
      let hMax = -Infinity, hMin = Infinity, maxSlope = 0, maxSlope6 = 0;
      for (let k = 0; k < zs.length; k++) {
        if (zs[k] < lo || zs[k] > hi || ys[k] === null) continue;
        hMax = Math.max(hMax, ys[k]); hMin = Math.min(hMin, ys[k]);
        if (k + 1 < zs.length && ys[k + 1] !== null && zs[k + 1] <= hi)
          maxSlope = Math.max(maxSlope, Math.abs((ys[k + 1] - ys[k]) / (zs[k + 1] - zs[k])));
        if (k + 3 < zs.length && ys[k + 3] !== null && zs[k + 3] <= hi)
          maxSlope6 = Math.max(maxSlope6, Math.abs((ys[k + 3] - ys[k]) / (zs[k + 3] - zs[k])));
      }
      if (!Number.isFinite(hMax) || !Number.isFinite(hMin)) return;
      const H = +(hMax - hMin).toFixed(2);
      const mp = (await modelProbe(cx, [zMid])).rows[0];
      let lumaNear = null;
      for (let k = 0; k < lumaGaps.length; k++) {
        const mid = 0.5 * (lumaCrests[k] + lumaCrests[k + 1]);
        if (lumaNear === null || Math.abs(mid - zMid) < lumaNear.d) lumaNear = { d: Math.abs(mid - zMid), v: lumaGaps[k] };
      }
      spacingRows.push({ config: cfg.name, x: cx, method, z: +zMid.toFixed(1), zc: mp.zc,
        depthRefM: mp.hRefM, depthLocalM: mp.hLocalM,
        measDzM: +L.toFixed(2), lumaDzM: lumaNear && lumaNear.d < 45 ? lumaNear.v : null,
        predLzM: mp.predLzM, ratioLz: +(L / mp.predLzM).toFixed(3),
        predLM: mp.predLM, frozenLAMLzM: 90, ratioVsFrozen: +(L / 90).toFixed(3),
        incDeg: mp.incDeg, etaResolutionM: dip.resolutionM, etaCheckMedDiffM, etaCheckMaxDiffM });
      if (H < 0.4) return;
      hlRows.push({ config: cfg.name, x: cx, z: +zMid.toFixed(1), method, depthM: mp.hRefM, depthLocalM: mp.hLocalM,
        drawnHM: H, drawnLM: +L.toFixed(2), drawnHL: +(H / L).toFixed(4),
        physHM: mp.physHM, physLM: mp.predLzM, physHL: +(mp.physHM / mp.predLzM).toFixed(4),
        VISnominal: 3.2, measuredHexag: +(H / mp.physHM).toFixed(2),
        steepnessExag: +((H / L) / (mp.physHM / mp.predLzM)).toFixed(2),
        michellLimit17: +(1 / 7).toFixed(4), micheLimitAtDepth: mp.micheHL,
        drawnOverMichell: +((H / L) / (1 / 7)).toFixed(3),
        drawnOverMiche: +((H / L) / mp.micheHL).toFixed(3),
        physOverMiche: +((mp.physHM / mp.predLzM) / mp.micheHL).toFixed(3),
        gamma078: 0.78, drawnHoverDepth: +(H / mp.hRefM).toFixed(3), physHoverDepth: +(mp.physHM / mp.hRefM).toFixed(3),
        maxFaceDeg: +(Math.atan(maxSlope) * 180 / Math.PI).toFixed(1),
        maxFace6Deg: +(Math.atan(maxSlope6) * 180 / Math.PI).toFixed(1),
        etaResolutionM: dip.resolutionM });
    };
    if (tp.length >= 3) {
      for (let i = 0; i + 2 < tp.length; i++) await emit(tp[i].z, tp[i + 1].z, tp[i + 2].z, 'cycle');
    } else if (tp.length === 2) {
      const mid = 0.5 * (tp[0].z + tp[1].z), half = Math.abs(tp[1].z - tp[0].z);
      await emit(mid - half, mid, mid + half, 'halfcycle');
    }

    // annotated evidence frame: a surf-photo view with the measured crests
    // (magenta) and troughs (yellow) projected onto it, the transect in cyan,
    // and the luma-detected crests as green dots
    const photo = await lumaFrame(cx, zSea, zShore, 22, `${tag}_photo`, 3.2);
    {
      const img = photo.img;
      const rgb = Buffer.alloc(img.w * img.h * 3);
      for (let i = 0; i < img.w * img.h; i++) { rgb[i * 3] = img.data[i * img.ch]; rgb[i * 3 + 1] = img.data[i * img.ch + 1]; rgb[i * 3 + 2] = img.data[i * img.ch + 2]; }
      for (let i = 1; i < photo.path.length; i++)
        drawLine(rgb, img.w, img.h, photo.path[i - 1][1], photo.path[i - 1][2], photo.path[i][1], photo.path[i][2], [0, 210, 255]);
      const proj = async (pts) => page.evaluate(({ pts }) => {
        const pb = window.__pointbreak; const cam = pb.camera; cam.updateMatrixWorld(true);
        const V = cam.position.constructor;
        return pts.map(([x, y, z]) => { const v = new V(x, y, z); v.project(cam);
          return [(v.x * 0.5 + 0.5) * innerWidth, (1 - (v.y * 0.5 + 0.5)) * innerHeight]; });
      }, { pts });
      const marks = await proj(tp.map((t) => [cx, t.eta, t.z]));
      tp.forEach((t, i) => drawCross(rgb, img.w, img.h, marks[i][0], marks[i][1],
        t.kind === 'crest' ? [255, 0, 200] : [255, 220, 0], t.kind === 'crest' ? 16 : 10));
      const lmarks = await proj(lumaCrests.map((z) => [cx, 0, z]));
      lmarks.forEach((m) => drawDot(rgb, img.w, img.h, m[0], m[1], [120, 255, 120], 4));
      writeFileSync(join(OUT, `${tag}_annotated.png`), encodePNG(img.w, img.h, rgb));
    }

    run.transects.push({ cx, zSea: +zSea.toFixed(1), zShore: +zShore.toFixed(1), lineZ: p0.lineZ,
      dipstick: { dep: 70, fov: dip.fov, camPos: dip.camPos, pxPerMy: dip.pxPerMy,
        resolutionM: dip.resolutionM, centerErrPx: dip.centerErrPx, nullStations: nNull, png: dip.png },
      dipstickCheck: dip2 ? { dep: 80, pxPerMy: dip2.pxPerMy, maxDiffM: etaCheckMaxDiffM, png: dip2.png } : null,
      luma: { dep: 80, fov: lum.fov, camPos: lum.camPos, rtMaxM: lum.rtMaxM, centerErrPx: lum.centerErrPx,
        crests: lumaCrests, gaps: lumaGaps, png: lum.png },
      photo: { dep: 22, fov: photo.fov, camPos: photo.camPos, centerErrPx: photo.centerErrPx, png: photo.png },
      turningPoints: tp.map((t) => ({ kind: t.kind, z: +t.z.toFixed(1), eta: +t.eta.toFixed(2) })) });
    done++;
  }

  const t0 = run.transects.find((t) => !t.skipped);
  if (t0) {
    const mk = await markerProof(t0.cx, 0.5 * (t0.zSea + t0.zShore));
    mk.forEach((m) => markerRows.push({ config: cfg.name, ...m }));
  }
  run.model = await modelProbe(t0 ? t0.cx : XS_TRY[0], [0]);
  manifest.runs[cfg.name] = run;
  console.log(`${cfg.name}: ${done} transects, ${spacingRows.filter((r) => r.config === cfg.name).length} cycles`);
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
writeFileSync(join(OUT, 'eta_profiles.json'), JSON.stringify(etaProfiles, null, 1));
writeFileSync(join(OUT, 'spacing_vs_depth.json'), JSON.stringify(spacingRows, null, 1));
writeFileSync(join(OUT, 'height_over_length.json'), JSON.stringify(hlRows, null, 1));
writeFileSync(join(OUT, 'marker_proof.json'), JSON.stringify(markerRows, null, 1));
const tsv = (rows, cols) => [cols.join('\t'), ...rows.map((r) => cols.map((c) => r[c]).join('\t'))].join('\n');
writeFileSync(join(OUT, 'spacing_vs_depth.tsv'), tsv(spacingRows,
  ['config', 'x', 'method', 'z', 'depthRefM', 'depthLocalM', 'measDzM', 'lumaDzM', 'predLzM', 'ratioLz', 'ratioVsFrozen', 'incDeg', 'etaResolutionM', 'etaCheckMedDiffM', 'etaCheckMaxDiffM']));
writeFileSync(join(OUT, 'height_over_length.tsv'), tsv(hlRows,
  ['config', 'x', 'z', 'method', 'depthM', 'drawnHM', 'drawnLM', 'drawnHL', 'physHM', 'physLM', 'physHL', 'measuredHexag', 'steepnessExag',
   'micheLimitAtDepth', 'drawnOverMiche', 'physOverMiche', 'drawnOverMichell', 'drawnHoverDepth', 'physHoverDepth', 'maxFaceDeg', 'maxFace6Deg']));
writeFileSync(join(OUT, 'marker_proof.tsv'), tsv(markerRows, ['config', 'trueY', 'recoveredY', 'trueZ', 'recoveredZ', 'spreadM']));

await browser.close();
console.log(`marker proof: ${markerRows.slice(0, 3).map((m) => `${m.trueY}->${m.recoveredY}`).join(' ')}`);
console.log(`rows: spacing ${spacingRows.length}, H/L ${hlRows.length} -> ${OUT}`);
if (errors.length) console.error('CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n'));
