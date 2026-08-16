// Derive B_spot — the break-line COMPASS bearing — from the emergent M4 line.
//
// MODEL.md 2.6.1 defines B_spot as site character, "authored, one constant per
// spot", and 2.6.3 leaves it provisional (~25-80 deg) and "not yet defensible —
// gated on Track 1". Track 1 landed: the reef owns the break line. So the line
// HAS a bearing now, and B_spot stops being a declaration and becomes a
// measurement of the model's own geometry — the same move the 2026-08-13 alpha
// retarget made when it replaced authored targets with per-spot ceilings.
//
// This matters more than a missing constant. MODEL.md 2.6.2a records that every
// attempt to reach Track 3 while routing AROUND B_spot produced an answer the
// visible wave contradicts: anchoring alpha to the measured incidence through
// the straight-contour identity gives 17-29 deg across the bank, which are
// closeouts. The identity fails because it assumes the break line follows the
// contours. B_spot is exactly the angle by which it does not.
//
// Method. The stage basis in data/model/pp_geo_profiles.js is not arbitrary:
// stageAlongENU is the NCEI equal-elevation CONTOUR tangent through the spot
// (verified — atan2(N,E) of Sewer Peak's stageAlongENU is 11.2 deg, exactly its
// published bathyContourTangentDeg). So a break line measured in stage
// coordinates is measured against the depth contour, and rotating it into ENU
// gives a compass bearing directly:
//
//     dir_ENU = stageAlongENU * cos(psi) + stageShoreENU * sin(psi)
//     B_spot  = atan2(E, N)                       // degrees true
//
// where psi = atan(dz/dx) is the line's obliquity to the contour. psi IS the
// peel-making obliquity; B_spot is that obliquity expressed as a bearing.
//
// Two estimators are reported and BOTH must be read. End-to-end is what
// measure_alpha_profile.mjs uses and cannot be faked by a staircase; total
// least squares uses every station and is not hostage to two endpoints. A gap
// between them means the line is not straight enough for a single constant to
// describe, which is itself the answer to "can B_spot be one number?"
//
//   node scripts/measure_bspot.mjs [--json]

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
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PP_GEO_DATA } from '../data/model/pp_geo_profiles.js';
import { PRESETS as BANK } from '../web/js/params.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8195;   // not 8194 (measure_alpha_profile) or 8127 (the dev server)
const JSON_OUT = process.argv.includes('--json');
const OUT_PATH = join(ROOT, 'data', 'model', 'pp_bspot.json');

// privates has geoSpot null — no OSM/NCEI frame, so no compass bearing exists
// for it. Named rather than silently skipped.
const SPOTS = Object.keys(BANK).filter((k) => BANK[k].geoSpot);
const NO_FRAME = Object.keys(BANK).filter((k) => !BANK[k].geoSpot);

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
               '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream',
                         'Cache-Control': 'no-store' });
    res.end(body);
  } catch { res.writeHead(404).end('not found'); }
});
await new Promise((r) => server.listen(PORT, r));

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const errors = [];
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const DEG = 180 / Math.PI;
const wrap360 = (d) => ((d % 360) + 360) % 360;

// Total least squares (principal axis) — minimises perpendicular distance, so
// it does not privilege x the way ordinary least squares does. Returns the
// line's obliquity to the stage-along axis, in radians.
function tlsSlopeRad(pts) {
  const n = pts.length;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const mz = pts.reduce((s, p) => s + p.z, 0) / n;
  let sxx = 0, szz = 0, sxz = 0;
  for (const p of pts) {
    const dx = p.x - mx, dz = p.z - mz;
    sxx += dx * dx; szz += dz * dz; sxz += dx * dz;
  }
  // Principal-axis angle of the 2x2 scatter matrix.
  return 0.5 * Math.atan2(2 * sxz, sxx - szz);
}

// Stage obliquity -> compass bearing, through the spot's own ENU basis.
function toCompass(geoSpot, psiRad) {
  const prof = PP_GEO_DATA.profiles[geoSpot];
  if (!prof) return null;
  const [aE, aN] = prof.stageAlongENU;
  const [sE, sN] = prof.stageShoreENU;
  const c = Math.cos(psiRad), s = Math.sin(psiRad);
  const E = aE * c + sE * s;
  const N = aN * c + sN * s;
  return wrap360(Math.atan2(E, N) * DEG);
}

const out = [];
for (const preset of SPOTS) {
  // sim=42 is the house probe clock; hud=0 keeps the panel out of the render.
  const url = `http://localhost:${PORT}/web-three/#preset=${preset}&sim=42&hud=0&month=card`;
  await page.goto(url, { waitUntil: 'load' });
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1600);
  const r = await page.evaluate(() => {
    const pb = window.__pointbreak;
    if (!pb) return null;
    // Stage bounds, not the ~600 m bake: the flanks are outside any rideable
    // stage and would drag a bearing no one surfs into the fit.
    const t = pb.takeoffProfile(1);
    return { preset: pb.state.preset, geoSpot: pb.state.geoSpot,
             line: pb.lineProbe(2), stageLo: t.xLo, stageHi: t.xHi };
  });
  if (!r || r.preset !== preset) throw new Error(`preset did not apply: ${preset}`);

  const line = r.line.filter((p) => p.x >= r.stageLo && p.x <= r.stageHi
                                 && Number.isFinite(p.z));
  if (line.length < 8) throw new Error(`${preset}: only ${line.length} usable stations`);

  const dx = line[line.length - 1].x - line[0].x;
  const dz = line[line.length - 1].z - line[0].z;
  const psiEnd = Math.atan2(dz, dx);
  const psiTls = tlsSlopeRad(line);

  // Residual scatter about the TLS axis, in metres — how straight the line
  // actually is. A single-constant B_spot is only honest if this is small
  // relative to the stage.
  const c = Math.cos(psiTls), s = Math.sin(psiTls);
  const mx = line.reduce((a, p) => a + p.x, 0) / line.length;
  const mz = line.reduce((a, p) => a + p.z, 0) / line.length;
  const perp = line.map((p) => Math.abs(-(p.x - mx) * s + (p.z - mz) * c));
  const rms = Math.sqrt(perp.reduce((a, v) => a + v * v, 0) / perp.length);

  out.push({
    preset,
    geoSpot: r.geoSpot,
    stageM: r.stageHi - r.stageLo,
    stations: line.length,
    contourTangentDeg: PP_GEO_DATA.profiles[r.geoSpot]?.bathyContourTangentDeg ?? null,
    obliquityEndDeg: psiEnd * DEG,
    obliquityTlsDeg: psiTls * DEG,
    bSpotEndDeg: toCompass(r.geoSpot, psiEnd),
    bSpotTlsDeg: toCompass(r.geoSpot, psiTls),
    straightnessRmsM: rms,
    alphaTarget: BANK[preset].alpha,
  });
  if (!JSON_OUT) process.stderr.write('.');
}

await browser.close();
server.close();

const payload = {
  generated: 'scripts/measure_bspot.mjs',
  note: 'B_spot derived from the emergent M4 break line; see MODEL.md 2.6.1/2.6.3.',
  conditions: 'each preset at its own card ocean, #sim=42, default flags',
  noFrame: NO_FRAME,
  spots: out,
};
await writeFile(OUT_PATH, JSON.stringify(payload, null, 2) + '\n');

if (JSON_OUT) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log('\n== B_spot from the emergent break line ==');
  console.log('obliquity = angle of the line to its own depth contour (stage-along axis)');
  console.log('B_spot    = that obliquity as a compass bearing, degrees true');
  console.log('rms       = perpendicular scatter about the fitted axis (straightness)\n');
  console.log('spot         stage   contour   obliq(end)  obliq(TLS)   B_end   B_TLS    rms    alpha');
  for (const s of out) {
    console.log(`${s.preset.padEnd(12)} ${s.stageM.toFixed(0).padStart(4)}m  `
      + `${s.contourTangentDeg.toFixed(1).padStart(6)}  `
      + `${s.obliquityEndDeg.toFixed(1).padStart(10)}  ${s.obliquityTlsDeg.toFixed(1).padStart(10)}  `
      + `${s.bSpotEndDeg.toFixed(1).padStart(6)}  ${s.bSpotTlsDeg.toFixed(1).padStart(6)}  `
      + `${s.straightnessRmsM.toFixed(1).padStart(5)}m  ${String(s.alphaTarget).padStart(5)}`);
  }
  if (NO_FRAME.length) console.log(`\nno OSM/NCEI frame (geoSpot null), skipped: ${NO_FRAME.join(', ')}`);
  console.log(`\nwrote ${OUT_PATH}`);
}
if (errors.length) console.error('CONSOLE ERRORS:\n' + [...new Set(errors)].join('\n'));
