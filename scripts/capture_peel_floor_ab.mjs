// Peel-floor A/B frames for the eye (2026-09-01): the #month= states the
// re-measured PEEL_FLOOR moves, old floor (left) vs new floor (right), drone
// and cliff, at each spot's pinned SET-PEAK clock. Both arms use an explicit
// #h0= so they run on the same build; the probe's stage-median signed alpha
// is read off the running page and printed on the frame.
//
//   python3 scripts/serve.py 8231 &
//   node scripts/capture_peel_floor_ab.mjs [--base=http://127.0.0.1:8231/] [--out=qa/img/peel-floor]
//
// Output: <out>/frames/<spot>_<month>_<cam>_h<H0>.png, <out>/<spot>.png (the
// contact sheet, old left / new right), <out>/readback.json (probe numbers).
// Playwright is resolved from PLAYWRIGHT_DIR or the sibling repo, as in
// scripts/capture_presets.mjs. The frames are gitignored (qa/*).
const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  '/Users/andyed/Documents/dev/psychodeli-webgl-port/node_modules/playwright/index.mjs',
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
].filter(Boolean);
let chromium;
for (const c of PW_CANDIDATES) { try { ({ chromium } = await import(c)); break; } catch { /* next */ } }
if (!chromium) { console.error('playwright not found; set PLAYWRIGHT_DIR'); process.exit(1); }

import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRESETS } from '../shared/params.js';
import { SET_ANCHOR_S } from '../web-three/js/model-js.js';
import { getMonthlyOcean } from '../data/climatology/pp_monthly_ocean.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--'))
  .map((a) => { const t = a.replace(/^--/, ''); const i = t.indexOf('='); return i < 0 ? [t, '1'] : [t.slice(0, i), t.slice(i + 1)]; }));
const BASE = flags.base || 'http://127.0.0.1:8231/';
const OUT = resolve(ROOT, flags.out || 'qa/img/peel-floor');
mkdirSync(join(OUT, 'frames'), { recursive: true });

// The states the re-measurement moves (MODEL.md 4.6, 2026-09-01), old -> new.
const PAIRS = [
  { key: 'jacks',     month: 'july',    oldH0: 0.85, newH0: 0.78 },
  { key: 'sewers',    month: 'january', oldH0: 1.61, newH0: 1.62 },
  { key: 'firstpeak', month: 'january', oldH0: 1.26, newH0: 1.38 },
  { key: 'thehook',   month: 'june',    oldH0: 1.05, newH0: 1.09 },
];
const CAMS = ['drone', 'cliff'];
// SET PEAK = the set sheet's middle column: setEnv peaks at the line at
// SET_ANCHOR_S and the beat is 1/dF, so 45 + 1/dF is the next peak (the
// sheet's k = 2 column, 45 + P*(0.5 + 2/4)).
const peakClock = (key) => +(SET_ANCHOR_S + 1 / PRESETS[key].dF).toFixed(3);

const VIEW = { width: 1280, height: 720 };
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

async function coldLoad(hash) {
  // about:blank first: a hash-only goto on a warm page fires the app's own
  // needsReloadForHash -> location.reload() (see build_qa_sheets.mjs coldLoad).
  await page.goto('about:blank');
  await page.goto(`${BASE}web-three/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600);   // shader compile + bake + first frames
}
async function setClock(t) {
  await page.evaluate(async (tt) => {
    window.__pointbreak.setSim(tt);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
  await page.waitForTimeout(120);
}
const probe = () => page.evaluate(() => {
  const pb = window.__pointbreak;
  const sa = pb.stageAlpha ? pb.stageAlpha(2) : null;
  const c = pb.peelClamp ? pb.peelClamp() : null;
  return { H0: pb.state.H0, T: pb.state.T, tide: pb.state.tide || 0, preset: pb.state.preset,
           alphaTarget: pb.state.alpha, sim: pb.sim ? pb.sim() : null,
           alpha: sa ? sa.medianClean : null, alphaMedian: sa ? sa.median : null,
           pinned: sa ? sa.pinnedN : null, stations: sa ? sa.stations : null,
           clampBound: c ? Boolean(c.bound) : false };
});

const readback = [];
for (const p of PAIRS) {
  const t = peakClock(p.key);
  for (const arm of ['old', 'new']) {
    const H0 = arm === 'old' ? p.oldH0 : p.newH0;
    for (const cam of CAMS) {
      const hash = `preset=${p.key}&month=${p.month}&h0=${H0.toFixed(2)}&cam=${cam}&hud=0&controls=0&speed=0&sim=${t}`;
      await coldLoad(hash);
      await setClock(t);
      const r = await probe();
      const file = `${p.key}_${p.month}_${cam}_h${H0.toFixed(2)}.png`;
      await page.screenshot({ path: join(OUT, 'frames', file) });
      readback.push({ spot: p.key, label: PRESETS[p.key].label, month: p.month, arm, cam, H0, sim: t, hash, file, ...r });
      console.log(`${p.key} ${p.month} ${cam} ${arm} h0=${H0}: alpha ${r.alpha?.toFixed(1)} (target ${r.alphaTarget}), H0 read ${r.H0}, pinned ${r.pinned}/${r.stations}, sim ${r.sim}`);
    }
  }
}
writeFileSync(join(OUT, 'readback.json'), JSON.stringify(readback, null, 1));

// ---- contact sheets: one per spot, old left / new right, drone over cliff ----
const dataUri = (f) => `data:image/png;base64,${readFileSync(join(OUT, 'frames', f)).toString('base64')}`;
const W = 900, H = Math.round(W * VIEW.height / VIEW.width);
for (const p of PAIRS) {
  const rows = readback.filter((r) => r.spot === p.key);
  const m = getMonthlyOcean(p.month);
  const cell = (r) => `
    <figure>
      <img src="${dataUri(r.file)}" width="${W}" height="${H}">
      <figcaption><b>${r.arm === 'old' ? 'OLD floor' : 'NEW floor'} · H₀ ${r.H0.toFixed(2)} m</b> · ${r.cam} ·
        stage-median signed α <b>${r.alpha === null ? 'n/a' : r.alpha.toFixed(1) + '°'}</b> (target ${r.alphaTarget}°, ${r.pinned} of ${r.stations} stations pinned)
        <span class="hash">#${r.hash}</span></figcaption>
    </figure>`;
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;background:#111;color:#eee;font:15px/1.35 -apple-system,Helvetica,Arial,sans-serif;width:${2 * W + 60}px}
    h1{font-size:22px;margin:18px 24px 4px} .sub{margin:0 24px 14px;color:#bbb}
    .grid{display:grid;grid-template-columns:${W}px ${W}px;gap:14px 20px;padding:0 20px 20px}
    figure{margin:0} img{display:block;background:#000} figcaption{padding:6px 2px 0} b{color:#fff}
    .hash{display:block;color:#8a8;font:12px Menlo,monospace;word-break:break-all}
    .old{color:#f6c} .new{color:#9f9}</style>
    <h1>${PRESETS[p.key].label} — #month=${p.month} (p75 H₀ ${m.H0.toFixed(3)} m) — peel floor <span class="old">${p.oldH0.toFixed(2)}</span> → <span class="new">${p.newH0.toFixed(2)}</span> m</h1>
    <p class="sub">Set-peak clock sim=${peakClock(p.key)} s (SET_ANCHOR_S ${SET_ANCHOR_S} + 1/Δf), tide 0, T ${PRESETS[p.key].T} s, both arms via explicit #h0= on the same build. Left: the 2026-08-20 floor as it draws on today's bake. Right: the 2026-09-01 re-measured floor. α from __pointbreak.stageAlpha(2).medianClean.</p>
    <div class="grid">
      ${cell(rows.find((r) => r.arm === 'old' && r.cam === 'drone'))}${cell(rows.find((r) => r.arm === 'new' && r.cam === 'drone'))}
      ${cell(rows.find((r) => r.arm === 'old' && r.cam === 'cliff'))}${cell(rows.find((r) => r.arm === 'new' && r.cam === 'cliff'))}
    </div>`;
  await page.setViewportSize({ width: 2 * W + 60, height: 2 * H + 260 });
  await page.setContent(html);
  await page.waitForTimeout(200);
  const out = join(OUT, `${p.key}.png`);
  await page.screenshot({ path: out, fullPage: true });
  console.log(`sheet ${out}`);
}
await browser.close();
if (errors.length) console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
