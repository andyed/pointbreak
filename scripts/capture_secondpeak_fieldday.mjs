// Second Peak field-day capture rig: the jury's hash beside the clip's own
// forcing, at three cameras, with the baked break line projected through the
// LIVE camera so "in frame / out of frame / how many pixels" is read off the
// drawn frame rather than inferred (MEASUREMENT_LESSONS 4, 11).
//
// Arms are forcings, not lip mechanisms — CURL_JURY §3 already showed the lip
// arms pixel-identical at this pose, and measure_secondpeak_fieldday.mjs says
// why (the reef window is 0 across the foreground the Lookout sees). Each arm
// is its own boot (about:blank between), every frame a pure function of the
// sim clock at speed=0.
//
//   jury           day=big&h0=1.4&tide=0.732        the jury / morning-loop hash (PLEASURE_POINT_CAPTURE "Model mapping")
//   jury_legacy    + reef=legacy                    the pre-refit wedge at the same hash
//   clip_verified  day=overhead&h0=0.778&tide=0.500 the 15:28 clip: SC116 Hs, CO-OPS verified tide, T 16
//   clip_surfline  day=overhead&h0=0.914&tide=0.357 the 15:28 clip: Surfline 3 ft, predicted tide, T 16
//   clip_setwave   day=overhead&h0=1.4&tide=0.500   E[Hmax] of the clip's sea at the verified tide
//
// Usage: node scripts/capture_secondpeak_fieldday.mjs [outdir]
// BASE_URL (default http://127.0.0.1:8141), PLAYWRIGHT_DIR.
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
let chromium;
for (const path of [process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname].filter(Boolean)) {
  try { ({ chromium } = await import(path)); break; } catch { /* next */ }
}
assert.ok(chromium, 'Set PLAYWRIGHT_DIR to the Playwright index.mjs');
const OUT = resolve(process.argv[2] || 'qa/secondpeak-fieldday-2026-09-24');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8141';
mkdirSync(OUT, { recursive: true });

const W = 1000, H = 625;
const COMMON = 'preset=secondpeak&controls=0&q=high&speed=0&sim=48';
const ARMS = [
  { name: 'jury',          hash: 'day=big&h0=1.4&tide=0.732' },
  { name: 'jury_legacy',   hash: 'day=big&h0=1.4&tide=0.732&reef=legacy' },
  { name: 'clip_verified', hash: 'day=overhead&h0=0.778&tide=0.500' },
  { name: 'clip_surfline', hash: 'day=overhead&h0=0.914&tide=0.357' },
  { name: 'clip_setwave',  hash: 'day=overhead&h0=1.4&tide=0.500' },
];
const CAMS = [{ name: 'lookout', sims: [48, 52] }, { name: 'cliff', sims: [48, 52] }, { name: 'drone', sims: [48] }];

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function boot(url) {
  await page.goto('about:blank');
  await page.goto(url);
  await page.waitForFunction(() => window.__pointbreak?.uniforms?.u_time?.value === 48, null, { timeout: 60000 });
}

// The frame's facts, read through the live camera. Projects the baked line
// (lineProbe, 5 m) and the reef-window knots at the line's z into pixels.
async function frameAt(sim, settle) {
  return page.evaluate(async ({ sim, settle, W, H }) => {
    const p = window.__pointbreak;
    p.setSim(sim);
    for (let i = 0; i < settle; i++) await new Promise((r) => requestAnimationFrame(r));
    if (Math.abs(p.uniforms.u_time.value - sim) > 1e-5) throw new Error('clock mismatch');
    p.camera.updateMatrixWorld(true);
    const eye = p.toStage(p.camera.position.toArray());
    const proj = (x, y, z) => {
      const v = p.camera.position.clone(); v.set(...p.toWorld([x, y, z])); v.project(p.camera);
      const inFrame = v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
      return { col: +((v.x + 1) / 2 * W).toFixed(0), row: +((1 - v.y) / 2 * H).toFixed(0), inFrame,
               rangeM: +Math.hypot(x - eye[0], z - eye[2]).toFixed(0) };
    };
    const line = (p.lineProbe(5) || []).map((s) => ({ x: s.x, z: +s.z.toFixed(1), a: +s.a.toFixed(1), gap: s.gap ? 1 : 0, ...proj(s.x, 0, s.z) }));
    const inF = line.filter((s) => s.inFrame);
    const win = p.uniforms.u_reefWin.value;
    const knots = [win.x, win.y, win.z, win.w].map((x) => {
      const near = line.reduce((b, s) => Math.abs(s.x - x) < Math.abs(b.x - x) ? s : b, line[0]);
      return { x: +x.toFixed(1), ...proj(x, 0, near.z) };
    });
    // px a face of the state's H0 subtends at the in-frame head's median range
    const f = (H / 2) / Math.tan(p.camera.fov / 2 * Math.PI / 180);
    const ranges = inF.map((s) => s.rangeM).sort((a, b) => a - b);
    const medRange = ranges.length ? ranges[ranges.length >> 1] : null;
    const sa = p.stageAlpha ? p.stageAlpha() : null;
    return {
      sim: p.sim(), state: { H0: p.state.H0, T: p.state.T, tide: p.state.tide, xi: p.state.xi, preset: p.state.preset },
      camera: { stage: eye.map((v) => +v.toFixed(1)), fov: p.camera.fov, target: p.toStage(p.controls.target.toArray()).map((v) => +v.toFixed(1)) },
      peelClamp: p.peelClamp(), clampOn: p.clampOn ? p.clampOn() : null,
      stageAlpha: sa && typeof sa === 'object' ? { median: sa.median ?? sa.alphaMed ?? null, n: sa.n ?? null } : sa,
      line: { stations: line.length, inFrame: inF.length,
              inFrameX: inF.length ? [inF[0].x, inF[inF.length - 1].x] : null,
              inFrameCols: inF.length ? [Math.min(...inF.map((s) => s.col)), Math.max(...inF.map((s) => s.col))] : null,
              inFrameRows: inF.length ? [Math.min(...inF.map((s) => s.row)), Math.max(...inF.map((s) => s.row))] : null,
              rangeM: inF.length ? [ranges[0], ranges[ranges.length - 1]] : null, medianRangeM: medRange,
              faceHeightPx: medRange ? +(f * p.state.H0 / medRange).toFixed(1) : null,
              // the peeling part: stations with alpha in [30, 60] deg and no gap
              peelingInFrame: inF.filter((s) => !s.gap && s.a >= 30 && s.a <= 60).length },
      reefWindowKnots: knots, focalPx: +f.toFixed(0),
      stations: line,
    };
  }, { sim, settle, W, H });
}

const manifest = { baseUrl: BASE_URL, viewport: [W, H], jpegQuality: 80, arms: ARMS, frames: [] };
for (const arm of ARMS) {
  for (const cam of CAMS) {
    await boot(`${BASE_URL}/web-three/#${COMMON}&cam=${cam.name}&${arm.hash}`);
    for (const sim of cam.sims) {
      const probe = await frameAt(sim, 3);
      const file = `${cam.name}_${arm.name}_${sim}.jpg`;
      await page.screenshot({ path: join(OUT, file), type: 'jpeg', quality: 80 });
      const { stations, ...summary } = probe;
      manifest.frames.push({ arm: arm.name, cam: cam.name, hash: `${COMMON}&cam=${cam.name}&${arm.hash}`, sim, file, bytes: statSync(join(OUT, file)).size, ...summary,
                             stations: cam.name === 'lookout' && sim === 48 ? stations : undefined });
      console.log(`${file.padEnd(34)} H0 ${probe.state.H0} T ${probe.state.T} tide ${probe.state.tide}  cam ${probe.camera.stage}  line in frame ${probe.line.inFrame}/${probe.line.stations} x ${JSON.stringify(probe.line.inFrameX)} cols ${JSON.stringify(probe.line.inFrameCols)} rows ${JSON.stringify(probe.line.inFrameRows)} range ${JSON.stringify(probe.line.rangeM)} face ${probe.line.faceHeightPx}px peeling ${probe.line.peelingInFrame}`);
    }
  }
}
manifest.totalBytes = manifest.frames.reduce((s, f) => s + f.bytes, 0);
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
await browser.close();
if (errors.length) { console.error('BROWSER ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`done - ${manifest.frames.length} frames, ${(manifest.totalBytes / 1e6).toFixed(2)} MB in ${OUT}`);
