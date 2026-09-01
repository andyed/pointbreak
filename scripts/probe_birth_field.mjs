// Field probe for the plan-view hard-edge investigation (#birth, 2026-09-01).
//
// Samples the SHIPPED model (surfacePos via __pointbreak.curlProbe, the same
// GLSL GRID_VERT compiles — MEASUREMENT_LESSONS 4) on a source-frame grid
// across the zipper head: x along the line, z as an offset from the baked
// break line. Prints foam / pocket / brk as character maps so the x-only snap
// can be located by eye and by number, and dumps the raw grid as JSON.
//
//   node scripts/probe_birth_field.mjs [hash-suffix] [outfile.json]
//   e.g. node scripts/probe_birth_field.mjs '&head=0'

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../../../../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
].filter(Boolean);
let chromium;
for (const c of PW_CANDIDATES) { try { ({ chromium } = await import(c)); break; } catch { /* next */ } }
if (!chromium) { console.error('playwright not found'); process.exit(1); }

import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SUFFIX = process.argv[2] || '';
const OUTFILE = process.argv[3] || '';
const PORT = Number(process.env.BIRTH_PORT || 8242);
const SIM = Number(process.env.BIRTH_SIM || 52);
const HASH = `preset=sewers&cam=drone&h0=2.20&controls=0&q=high&speed=0&sim=${SIM}${SUFFIX}`;
const XS = []; for (let x = -100; x <= 30; x += 4) XS.push(x);
const DZ0 = -30, DZ1 = 70, NZ = 26;   // 4 m steps in z offset from the line

const server = spawn('python3', [join(ROOT, 'scripts/serve.py'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
const kill = () => { try { server.kill('SIGTERM'); } catch { /* gone */ } };
process.on('exit', kill);
for (let i = 0; i < 50; i++) {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/web-three/index.html`); if (r.ok) break; } catch { /* wait */ }
  await new Promise((r) => setTimeout(r, 100));
}
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('about:blank');
await page.goto(`http://127.0.0.1:${PORT}/web-three/#${HASH}`, { waitUntil: 'load' });
await page.waitForTimeout(2600);

const data = await page.evaluate(({ XS, DZ0, DZ1, NZ }) => {
  const pb = window.__pointbreak;
  const ride = pb.m4Ride ? pb.m4Ride() : null;
  const line = pb.lineProbe(1) || [];
  const zAt = (x) => { let b = line[0]; for (const p of line) if (Math.abs(p.x - x) < Math.abs(b.x - x)) b = p; return b.z; };
  const rows = XS.map((x) => {
    const zb = zAt(x);
    const s = pb.curlProbe(x, zb + DZ0, zb + DZ1, NZ) || [];
    return { x, zb, foam: s.map((r) => r.foam), pocket: s.map((r) => r.pocket), brk: s.map((r) => r.brk),
             aer: s.map((r) => r.aer), y: s.map((r) => r.y) };
  });
  return { sim: pb.sim(), headX: ride ? ride.x : null, headZ: ride ? ride.z : null,
           birth: pb.birth ? pb.birth() : null, rows };
}, { XS, DZ0, DZ1, NZ });

await browser.close(); kill();

const glyph = (v) => { if (!(v === v)) return '?'; const g = ' .:-=+*#%@'; return g[Math.min(9, Math.max(0, Math.floor(v * 9.999)))]; };
const dzs = Array.from({ length: NZ }, (_, i) => DZ0 + (DZ1 - DZ0) * i / (NZ - 1));
console.log(`hash #${HASH}\nsim ${data.sim}  head x=${data.headX?.toFixed(2)} z=${data.headZ?.toFixed(2)}  birth=${JSON.stringify(data.birth)}`);
console.log(`columns: z offset from the baked line, ${DZ0}..${DZ1} m (${((DZ1 - DZ0) / (NZ - 1)).toFixed(1)} m/col); rows: x`);
for (const field of ['foam', 'pocket', 'brk']) {
  console.log(`\n== ${field} ==      ` + dzs.map((d) => (d % 20 === 0 ? String(d).padStart(2).slice(-2) : '  ')).join('').replace(/ {2}/g, '  '));
  for (const r of data.rows) {
    const mark = data.headX !== null && Math.abs(r.x - data.headX) < 2 ? '<HEAD' : '';
    console.log(`x=${String(r.x).padStart(5)} zb=${r.zb.toFixed(0).padStart(5)} |${r[field].map(glyph).join('')}| ${mark}`);
  }
}
if (OUTFILE) { writeFileSync(OUTFILE, JSON.stringify(data)); console.log('wrote', OUTFILE); }
