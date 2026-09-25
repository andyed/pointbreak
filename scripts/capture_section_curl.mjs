// Section-curl capture rig (docs/research/SECTION_CURL_2026-09-24.md).
//
// Matched frames across the arms of the two flags this track adds, at the
// clocks scripts/probe_section_curl.mjs found one section shutting, plus the
// og pose for the gap fix and a byte-for-byte default-parity check against a
// second server on pristine main. Each arm is its own boot (about:blank
// between); every frame is a pure function of the sim clock at speed=0, and
// the camera pose is recorded per frame so arm-to-arm drift would be caught
// (MEASUREMENT_LESSONS 11).
//
// Rigs
//   og                 the og hero pose (capture_og_hero.mjs): Sewers, drone,
//                      sim 42, the card's 640x376 clip at DSF 2 and the two
//                      gap heads B and C at 3x — arms default / gapfix only
//   sewers_close       fixed eye [12, 11, -190] -> [-52, 4, -229] (stage),
//                      Sewers card day; section flank at x = -73
//   secondpeak_drone   #cam=drone, Second Peak card month; section flank at
//                      x = 15, steady head at x ~ 82-88
//   secondpeak_lookout #cam=lookout on the field hash (day=big&h0=1.4&tide=0.732)
// Each clock frame is the full 1000x625 view plus a crop centred on the
// section station's projected screen position (the event is ~12 m wide and
// the drone is far), so the wall/curtain/plume/bore can be read at 1:1.
//
// Usage: node scripts/capture_section_curl.mjs [--out=qa/section-curl-2026-09-24]
//        [--rigs=og,sewers_close,secondpeak_drone,secondpeak_lookout]
//        [--arms=default,gapfix,sectioncurl,bundle] [--q=72] [--parity]
// BASE_URL (default http://127.0.0.1:8146), MAIN_URL (parity), PLAYWRIGHT_DIR.
import { mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';
let chromium;
for (const path of [process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname].filter(Boolean)) {
  try { ({ chromium } = await import(path)); break; } catch { /* next */ }
}
assert.ok(chromium, 'Set PLAYWRIGHT_DIR to the Playwright index.mjs');
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const body = a.replace(/^--/, ''), i = body.indexOf('=');
  return i < 0 ? [body, '1'] : [body.slice(0, i), body.slice(i + 1)];
}));
const OUT = resolve(flags.out || 'qa/section-curl-2026-09-24');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8146';
const MAIN_URL = process.env.MAIN_URL || '';
const Q = Number(flags.q ?? 62);   // ~35 KB per 1000x625 frame: 60-odd frames under the 2 MB qa budget
mkdirSync(OUT, { recursive: true });

const PIN = 'surfer=0&hud=0&controls=0&speed=0&q=high';
const ARMS = {
  default: '',
  gapfix: '&gapfix=1',
  sectioncurl: '&sectioncurl=1',
  bundle: '&sectioncurl=1&gapfix=1&tube=1&classic=1&descent=1',
};
const RIGS = {
  og: { hash: `preset=sewers&${PIN}&cam=drone&sim=42`, view: { width: 1000, height: 750 }, dsf: 2,
        clip: { x: 230, y: 275, width: 640, height: 376 },
        heads: { headB: { x: 585, y: 300, width: 100, height: 75 }, headC: { x: 640, y: 465, width: 100, height: 75 } },
        arms: ['default', 'gapfix'], sims: [42] },
  sewers_close: { hash: `preset=sewers&month=card&cam=cliff&${PIN}&sim=48`, setView: [[12, 11, -190], [-52, 4, -229]],
                  view: { width: 1000, height: 625 }, dsf: 1, section: { x: -73 }, head: { x: -60 },
                  arms: ['default', 'sectioncurl', 'bundle'], sims: [44.8, 45.0, 45.15, 45.3, 45.6, 46.0] },
  // gapfix moves nothing at Second Peak's card clocks (its gap is off the
  // reef, SECTION_GAP_FOAM table) and sectioncurl alone is the close rig's
  // job; the drone keeps the two arms that differ at this scale. The 2 MB
  // qa budget is what sets the clock and arm counts here.
  secondpeak_drone: { hash: `preset=secondpeak&month=card&cam=drone&${PIN}&sim=48`,
                      view: { width: 1000, height: 625 }, dsf: 1, section: { x: 15 }, head: { x: 85 },
                      arms: ['default', 'bundle'], sims: [49.2, 49.7, 50.2, 50.6] },
  // The drone sits at 0.57 m/px: a 12 m section is a 20 px patch there, so a
  // close pose mirrors the Sewers one about the Second Peak flank (eye 64 m
  // down-point and 40 m shoreward of the station, 11 m up) to read the wall,
  // curtain and plume at 1:1. Stage coordinates through setView, as Sewers.
  secondpeak_close: { hash: `preset=secondpeak&month=card&cam=cliff&${PIN}&sim=48`, setView: [[79, 11, -68], [15, 4, -108]],
                      view: { width: 1000, height: 625 }, dsf: 1, section: { x: 15 }, head: { x: 85 },
                      arms: ['default', 'sectioncurl', 'bundle'], sims: [49.2, 49.5, 49.7, 49.9, 50.2, 50.6] },
  secondpeak_lookout: { hash: `preset=secondpeak&cam=lookout&day=big&h0=1.4&tide=0.732&${PIN}&sim=48`,
                        view: { width: 1000, height: 625 }, dsf: 1, section: { x: 15 },
                        arms: ['default', 'bundle'], sims: [49.5, 49.7, 50.2] },
};
const rigNames = (flags.rigs || Object.keys(RIGS).join(',')).split(',');
const armNames = (flags.arms || Object.keys(ARMS).join(',')).split(',');

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const errors = [];
async function boot(ctx, url) {
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('about:blank');
  await page.goto(url);
  await page.waitForFunction(() => !!window.__pointbreak?.uniforms?.u_time, null, { timeout: 60000 });
  await page.waitForTimeout(2600);
  return page;
}
// Stage point -> CSS pixel in the current camera. World = stage with z
// negated under the shipped mirror (root group scale.z = -1).
async function project(page, x) {
  return page.evaluate(({ x }) => {
    const p = window.__pointbreak;
    const r = p.curlProbe(x, 0, 1, 2)[0];
    const zLine = r.bLine, y = Math.max(r.y, 0);
    const V = p.camera.position.constructor;
    const v = new V(x, y, p.state.mirror === 0 ? zLine : -zLine);
    p.camera.updateMatrixWorld();
    v.project(p.camera);
    return { x, zLine, sx: (v.x + 1) / 2 * innerWidth, sy: (1 - v.y) / 2 * innerHeight, inFront: v.z < 1 };
  }, { x });
}
async function frameAt(page, sim, settle = 2) {
  return page.evaluate(async ({ sim, settle }) => {
    const p = window.__pointbreak;
    p.setSim(sim);
    for (let i = 0; i < settle; i++) await new Promise((r) => requestAnimationFrame(r));
    if (Math.abs(p.uniforms.u_time.value - sim) > 1e-5) throw new Error('clock mismatch');
    const u = p.uniforms;
    return { sim: p.sim(), camera: p.camera.position.toArray().map((v) => +v.toFixed(3)),
             target: p.controls.target.toArray().map((v) => +v.toFixed(3)),
             flags: { gapFix: u.u_gapFix?.value ?? null, sectionCurl: u.u_sectionCurl?.value ?? null, sectionXi: u.u_sectionXi?.value ?? null,
                      tube: u.u_tube.value, classic: u.u_classicWave.value, descent: u.u_lipDescent.value, tubeBuild: !!p.tubeBuild },
             state: { H0: p.state.H0, T: p.state.T, xi: p.state.xi, tide: p.state.tide, sections: p.state.sections } };
  }, { sim, settle });
}
const clampBox = (cx, cy, w, h, view) => ({
  x: Math.round(Math.min(Math.max(cx - w / 2, 0), view.width - w)),
  y: Math.round(Math.min(Math.max(cy - h / 2, 0), view.height - h)), width: w, height: h });

// A partial run (--rigs=) merges into the existing manifest: frames of the
// rigs captured now replace theirs, other rigs' entries are kept.
let manifest = { baseUrl: BASE_URL, jpegQuality: Q, frames: [] };
try {
  const prev = JSON.parse(readFileSync(join(OUT, 'manifest.json'), 'utf8'));
  manifest.frames = (prev.frames || []).filter((f) => !rigNames.includes(f.rig));
} catch { /* first run */ }
if (!flags.parity) for (const rigName of rigNames) {
  const rig = RIGS[rigName];
  const ctx = await browser.newContext({ viewport: rig.view, deviceScaleFactor: rig.dsf });
  for (const armName of (rig.arms || armNames).filter((a) => armNames.includes(a))) {
    const page = await boot(ctx, `${BASE_URL}/web-three/#${rig.hash}${ARMS[armName]}`);
    if (rig.setView) await page.evaluate((v) => { const p = window.__pointbreak; p.controls.dispatchEvent({ type: 'start' }); p.setView(...v); }, rig.setView);
    for (const sim of rig.sims) {
      const probe = await frameAt(page, sim);
      const tag = `${rigName}_${armName}_${String(sim).replace('.', 'p')}`;
      const rec = { rig: rigName, arm: armName, sim, files: {}, ...probe };
      if (rig.clip) {
        const f = `${tag}.jpg`;
        await page.screenshot({ path: join(OUT, f), type: 'jpeg', quality: Q, clip: rig.clip });
        rec.files.clip = f;
        for (const [head, box] of Object.entries(rig.heads)) {
          const g = `${tag}_${head}.png`;
          await page.screenshot({ path: join(OUT, g), type: 'png', clip: box });
          rec.files[head] = g;
        }
      } else {
        const f = `${tag}.jpg`;
        await page.screenshot({ path: join(OUT, f), type: 'jpeg', quality: Q });
        rec.files.frame = f;
        if (rig.section) {
          const s = await project(page, rig.section.x);
          rec.sectionScreen = { sx: +s.sx.toFixed(1), sy: +s.sy.toFixed(1), zLine: +s.zLine.toFixed(1), inFront: s.inFront };
          if (s.inFront && s.sx > -50 && s.sx < rig.view.width + 50 && s.sy > -50 && s.sy < rig.view.height + 50) {
            const g = `${tag}_section.jpg`;
            await page.screenshot({ path: join(OUT, g), type: 'jpeg', quality: Q, clip: clampBox(s.sx, s.sy, 360, 225, rig.view) });
            rec.files.section = g;
          }
        }
        if (rig.head) {
          const s = await project(page, rig.head.x);
          rec.headScreen = { sx: +s.sx.toFixed(1), sy: +s.sy.toFixed(1), zLine: +s.zLine.toFixed(1), inFront: s.inFront };
        }
      }
      for (const f of Object.values(rec.files)) rec.bytes = (rec.bytes || 0) + statSync(join(OUT, f)).size;
      manifest.frames.push(rec);
      console.log(`captured ${tag}  cam ${probe.camera}  section@${rec.sectionScreen ? `${rec.sectionScreen.sx},${rec.sectionScreen.sy}` : '-'}  ${(rec.bytes / 1024).toFixed(0)} KB`);
    }
    await page.close();
  }
  await ctx.close();
}
if (!flags.parity) {
  manifest.totalBytes = manifest.frames.reduce((s, f) => s + f.bytes, 0);
  writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1));
  console.log(`frames: ${manifest.frames.length}, ${(manifest.totalBytes / 1e6).toFixed(2)} MB`);
}

// ---- default parity against pristine main: PNG, byte-for-byte ----
if (MAIN_URL) {
  const parity = { baseUrl: BASE_URL, mainUrl: MAIN_URL, cases: [] };
  const CASES = [
    { name: 'og_sewers_drone_42', rig: 'og', sim: 42 },
    { name: 'sewers_close_45p15', rig: 'sewers_close', sim: 45.15 },
    { name: 'secondpeak_drone_49p7', rig: 'secondpeak_drone', sim: 49.7 },
    { name: 'secondpeak_lookout_49p7', rig: 'secondpeak_lookout', sim: 49.7 },
  ];
  for (const c of CASES) {
    const rig = RIGS[c.rig];
    const shots = {};
    for (const [label, url] of [['branch', BASE_URL], ['main', MAIN_URL]]) {
      const ctx = await browser.newContext({ viewport: rig.view, deviceScaleFactor: rig.dsf });
      const page = await boot(ctx, `${url}/web-three/#${rig.hash}`);
      if (rig.setView) await page.evaluate((v) => { const p = window.__pointbreak; p.controls.dispatchEvent({ type: 'start' }); p.setView(...v); }, rig.setView);
      await frameAt(page, c.sim);
      shots[label] = await page.screenshot({ type: 'png' });
      await ctx.close();
    }
    const identical = Buffer.compare(shots.branch, shots.main) === 0;
    let pixels = null;
    if (!identical) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      pixels = await page.evaluate(async ([a, b]) => {
        const load = async (d) => { const img = await createImageBitmap(await (await fetch(d)).blob()); const cv = new OffscreenCanvas(img.width, img.height); const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0); return cx.getImageData(0, 0, img.width, img.height).data; };
        const A = await load(a), B = await load(b);
        let differing = 0, maxDelta = 0;
        for (let i = 0; i < A.length; i += 4) {
          const d = Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2]));
          if (d) { differing++; maxDelta = Math.max(maxDelta, d); }
        }
        return { differing, maxDelta, total: A.length / 4 };
      }, [`data:image/png;base64,${shots.branch.toString('base64')}`, `data:image/png;base64,${shots.main.toString('base64')}`]);
      await ctx.close();
    }
    parity.cases.push({ ...c, hash: rig.hash, identical, bytes: shots.branch.length, pixels });
    console.log(`parity ${c.name}: ${identical ? 'byte-identical' : `${pixels.differing} px differ, max ${pixels.maxDelta}/255`}`);
  }
  writeFileSync(join(OUT, 'parity.json'), JSON.stringify(parity, null, 1));
}
await browser.close();
if (errors.length) { console.error('BROWSER ERRORS:\n' + errors.join('\n')); process.exit(1); }
