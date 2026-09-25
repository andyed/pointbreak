// Lip-facet elimination matrix (docs/research/LIP_FACETS_2026-09-24.md).
//
// The og hero's heads render as bright angular polygons ("facets", "a white
// plate"). This rig reproduces that at two poses and toggles the existing A/B
// flags one at a time at the SAME sim clock and camera, so the owner of the
// defect is found by elimination before anything is shaped (CLAUDE.md
// "convict by flag elimination, then probe"). Each cell is one flag arm; the
// crops are the heads at 2x the shipped render resolution.
//
// Poses
//   og     the og hero pose, capture_og_hero.mjs verbatim: Drone camera at
//          Sewers, sim 42, 1000x750 CSS at DSF 2. The renderer caps its pixel
//          ratio at 1.5, so a higher DSF would upscale rather than zoom; the
//          2x pass is instead a 3000x2250 DSF 1 viewport at the same aspect
//          (vertical FOV is fixed, so the framing is identical and the render
//          has 2x the pixels of the shipped 1500x1125).
//   close  the fixed Sewers close camera used by the classic captures: eye
//          [12, 11, -190], target [-52, 4, -229] in STAGE coordinates (setView
//          converts), sim 52, 1000x625. Zoom pass 2000x1250.
//
// Requires the dev server: python3 scripts/serve.py 8134
//
// Usage:
//   node scripts/capture_lip_facets_ab.mjs [--out=qa/lip-facets-2026-09-24]
//        [--base=http://127.0.0.1:8134] [--poses=og,close] [--arms=base,curl0,...]
//        [--sheet-only]            # recompose the contact sheets from the PNGs
//        [--diff=base,underside0]  # pixel A/B of two captured arms, no capture
//
// Output: <out>/frames/<pose>_<arm>.png (full frame), <out>/frames/<pose>_<arm>_<head>.png
// (2x head crops), <out>/manifest.json, <out>/sheet_<pose>.jpg (q80 contact
// sheet, rows = arms, labelled with the exact hash) and sheet_<pose>.html.

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

import { existsSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const body = a.replace(/^--/, ''), i = body.indexOf('=');
  return i < 0 ? [body, '1'] : [body.slice(0, i), body.slice(i + 1)];
}));
const OUT = resolve(flags.out || join(ROOT, 'qa/lip-facets-2026-09-24'));
const FRAMES = join(OUT, 'frames');
const BASE_URL = flags.base || 'http://127.0.0.1:8134';
const SETTLE_MS = 2600;

// Common pins: quality locked so the auto-fallback cannot move the grid
// between arms; clock frozen; no rider, no UI.
const COMMON = 'preset=sewers&surfer=0&hud=0&controls=0&speed=0&q=high';

// Head crop boxes are in the pose's 1x CSS frame; the zoom pass scales them.
export const POSES = {
  og: {
    hash: `${COMMON}&cam=drone&sim=42`,
    view: { width: 1000, height: 750 }, dsf: 2, zoom: 3,
    // the card's 640x376 clip (capture_og_hero.mjs CLIP)
    clip: { x: 230, y: 275, width: 640, height: 376 },
    heads: {           // the three bright polygons on the shipped og_hero.png
      headA: { x: 330, y: 300, width: 100, height: 75 },
      headB: { x: 585, y: 300, width: 100, height: 75 },
      headC: { x: 640, y: 465, width: 100, height: 75 },
    },
  },
  close: {
    hash: `${COMMON}&cam=free&sim=52`,
    setView: { eye: [12, 11, -190], target: [-52, 4, -229] },
    view: { width: 1000, height: 625 }, dsf: 1, zoom: 2,
    clip: null,
    heads: {           // the plate on the crest, 1000x625 frame
      head: { x: 430, y: 220, width: 320, height: 160 },
    },
  },
};

// One switch per arm. `base` is the shipped default. The hash fragments are
// the documented CONTROLS.md A/B reverts and feature flags.
export const ARMS = {
  base:      '',
  curl0:     '&curl=0',
  curtain0:  '&curtain=0',
  lip0:      '&lip=0',
  onset0:    '&onset=0',
  fft0:      '&fft=0',
  splash0:   '&splash=0',
  classic1:  '&classic=1',
  lookfull:  '&look=full',
  qmedium:   '&q=medium',
  qlow:      '&q=low',
  qpotato:   '&q=potato',
  // GRID_FRAG diagnostic views (FACETDEBUG build): facing, raw normal, paint owner
  dbgfacing: '&facetdebug=1',
  dbgnormal: '&facetdebug=2',
  dbgpaint:  '&facetdebug=3',
  // the fix arm (FOLDCULL build) and facing views of the arms that kept a plate
  underside0:    '&underside=0',
  underside0dbg: '&underside=0&facetdebug=1',
  lookfulldbg:   '&look=full&facetdebug=1',
  curl0dbg:      '&curl=0&facetdebug=1',
};

const poseNames = (flags.poses || Object.keys(POSES).join(',')).split(',').filter(Boolean);
const armNames = (flags.arms || Object.keys(ARMS).join(',')).split(',').filter(Boolean);
for (const p of poseNames) if (!POSES[p]) throw new Error(`unknown pose ${p}`);
for (const a of armNames) if (!(a in ARMS)) throw new Error(`unknown arm ${a}`);

if (!existsSync(FRAMES)) mkdirSync(FRAMES, { recursive: true });
const manifestPath = join(OUT, 'manifest.json');
let manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { baseUrl: BASE_URL, frames: {} };

// #q= is boot-only and the common pin says q=high; an arm that sets q wins by
// coming last (URLSearchParams.get returns the FIRST match, so strip the pin).
function armHash(pose, arm) {
  let h = POSES[pose].hash + ARMS[arm];
  const m = ARMS[arm].match(/&q=(\w+)/);
  if (m) h = h.replace('&q=high', '') ;
  return h;
}

const scale = (box, s) => ({ x: box.x * s, y: box.y * s, width: box.width * s, height: box.height * s });

async function loadCell(browser, pose, hash, view, dsf) {
  const ctx = await browser.newContext({ viewport: view, deviceScaleFactor: dsf });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto('about:blank');
  await page.goto(`${BASE_URL}/web-three/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(SETTLE_MS);
  const P = POSES[pose];
  if (P.setView) {
    await page.evaluate(({ eye, target }) => window.__pointbreak.setView(eye, target), P.setView);
    await page.waitForTimeout(400);
  }
  const probe = await page.evaluate(() => {
    const pb = window.__pointbreak;
    return {
      preset: pb.state?.preset, sim: pb.sim(),
      camStage: pb.toStage(pb.camera.position.toArray()),
      target: pb.toStage(pb.controls.target.toArray()),
      curl: pb.uniforms.u_curl.value, lipAer: pb.uniforms.u_lipAer.value,
      onset: pb.uniforms.u_onset.value, fft: pb.uniforms.u_fft.value,
      classic: pb.uniforms.u_classicWave.value, look: pb.uniforms.u_fidelityLook.value,
      cell: pb.uniforms.u_cell.value.toArray(),
      pixelRatio: window.devicePixelRatio,
    };
  });
  if (probe.preset !== 'sewers') throw new Error(`preset did not apply for ${hash}: ${probe.preset}`);
  return { ctx, page, probe, errors };
}

if (!flags['sheet-only'] && !flags.diff) {
  const browser = await chromium.launch({ args: ['--use-angle=metal'] });
  for (const pose of poseNames) {
    const P = POSES[pose];
    for (const arm of armNames) {
      const hash = armHash(pose, arm);
      const key = `${pose}_${arm}`;
      const rec = { pose, arm, hash, files: {} };

      // 1x pass: the pose as shipped (full frame + the card clip for og).
      {
        const { ctx, page, probe, errors } = await loadCell(browser, pose, hash, P.view, P.dsf);
        const full = join(FRAMES, `${key}.png`);
        await page.screenshot({ path: full, clip: P.clip || undefined });
        rec.files.full = full.replace(OUT + '/', '');
        rec.probe1x = probe; rec.errors = errors;
        await ctx.close();
      }
      // zoom pass: same framing, zoom x the pixels; head crops only.
      {
        const view = { width: P.view.width * P.zoom, height: P.view.height * P.zoom };
        const { ctx, page, probe, errors } = await loadCell(browser, pose, hash, view, 1);
        for (const [head, box] of Object.entries(P.heads)) {
          const f = join(FRAMES, `${key}_${head}.png`);
          await page.screenshot({ path: f, clip: scale(box, P.zoom) });
          rec.files[head] = f.replace(OUT + '/', '');
        }
        rec.probeZoom = probe; rec.errorsZoom = errors;
        await ctx.close();
      }
      manifest.frames[key] = rec;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      console.log(`${key}  ${hash}  cam ${rec.probe1x.camStage.map((v) => v.toFixed(1))}`);
    }
  }
  await browser.close();
}

// ---- pixel A/B (--diff=armA,armB) -----------------------------------------
// Fraction of pixels that differ by more than 8/255 in any channel, per file,
// decoded in a canvas so no image library is needed. Written to diff_<A>_<B>.json.
if (flags.diff) {
  const [A, B] = flags.diff.split(',');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  // data: URLs, not file://, so the canvas is not tainted by a foreign origin
  const dataUrl = (f) => 'data:image/png;base64,' + readFileSync(join(OUT, f)).toString('base64');
  const report = {};
  for (const pose of poseNames) {
    const ra = manifest.frames[`${pose}_${A}`], rb = manifest.frames[`${pose}_${B}`];
    if (!ra || !rb) continue;
    for (const k of Object.keys(ra.files)) {
      const r = await page.evaluate(async ([fa, fb]) => {
        const load = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
        const [a, b] = await Promise.all([load(fa), load(fb)]);
        const cv = document.createElement('canvas'); cv.width = a.width; cv.height = a.height;
        const cx = cv.getContext('2d', { willReadFrequently: true });
        cx.drawImage(a, 0, 0); const da = cx.getImageData(0, 0, cv.width, cv.height).data;
        cx.drawImage(b, 0, 0); const db = cx.getImageData(0, 0, cv.width, cv.height).data;
        let n = 0, sum = 0;
        for (let i = 0; i < da.length; i += 4) {
          const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
          if (d > 8) { n++; sum += d; }
        }
        return { w: a.width, h: a.height, changed: n, frac: n / (da.length / 4), meanDelta: n ? sum / n : 0 };
      }, [dataUrl(ra.files[k]), dataUrl(rb.files[k])]);
      report[`${pose}_${k}`] = r;
      console.log(`${pose} ${k.padEnd(6)} ${A} vs ${B}: ${(100 * r.frac).toFixed(2)} % of ${r.w}x${r.h} px changed (mean |d| ${r.meanDelta.toFixed(1)}/255)`);
    }
  }
  writeFileSync(join(OUT, `diff_${A}_${B}.json`), JSON.stringify(report, null, 2));
  await browser.close();
  process.exit(0);
}

// ---- contact sheets ------------------------------------------------------
// Rows = arms, columns = the frame (downscaled to card width) then the head
// crops at native zoom pixels. Rendered as HTML and screenshotted to JPEG q80
// so the sheet needs no image library.
{
  const browser = await chromium.launch();
  for (const pose of poseNames) {
    const P = POSES[pose];
    const rows = armNames.filter((a) => manifest.frames[`${pose}_${a}`]);
    if (!rows.length) continue;
    const heads = Object.keys(P.heads);
    const frameW = pose === 'og' ? 460 : 500;    // og: the card panel width
    const frameH = pose === 'og' ? Math.round(460 * P.clip.height / P.clip.width)
                                 : Math.round(500 * P.view.height / P.view.width);
    const cropW = P.heads[heads[0]].width * P.zoom, cropH = P.heads[heads[0]].height * P.zoom;
    const cells = rows.map((arm) => {
      const r = manifest.frames[`${pose}_${arm}`];
      const img = (f, w, h) => `<img src="${f}" width="${w}" height="${h}">`;
      return `<tr><td class="lab"><b>${arm}</b><br><code>#${r.hash}</code></td>
        <td>${img(r.files.full, frameW, frameH)}</td>
        ${heads.map((h) => `<td>${img(r.files[h], cropW, cropH)}</td>`).join('')}</tr>`;
    }).join('\n');
    const html = `<!doctype html><meta charset="utf-8"><style>
      body{margin:0;background:#111;color:#eee;font:12px/1.35 -apple-system,Helvetica,sans-serif}
      table{border-collapse:collapse} td{padding:3px;vertical-align:top}
      td.lab{width:170px;padding:6px} code{font-size:10px;color:#9cf;word-break:break-all}
      th{font-weight:normal;color:#aaa;text-align:left;padding:4px 6px}
      img{display:block;image-rendering:auto}</style>
      <table><tr><th>lip-facets ${pose} pose<br>rows = one flag each</th>
        <th>frame (${pose === 'og' ? 'card panel width' : '1x'})</th>
        ${heads.map((h) => `<th>${h} at ${P.zoom}x</th>`).join('')}</tr>${cells}</table>`;
    const ctx = await browser.newContext({ viewport: { width: 200 + frameW + heads.length * (cropW + 6) + 40, height: 800 } });
    const page = await ctx.newPage();
    // Written beside the frames and opened as file://, so relative <img>
    // paths resolve (a setContent page has no origin to load them from).
    const htmlPath = join(OUT, `sheet_${pose}.html`);
    writeFileSync(htmlPath, html);
    await page.goto(`file://${htmlPath}`, { waitUntil: 'load' });
    await page.waitForTimeout(300);
    const out = join(OUT, `sheet_${pose}.jpg`);
    await page.screenshot({ path: out, fullPage: true, type: 'jpeg', quality: 80 });
    await ctx.close();
    console.log(`sheet ${out}  ${(statSync(out).size / 1024).toFixed(0)} kB`);
  }
  await browser.close();
}
