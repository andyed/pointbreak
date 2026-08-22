// UNDER-THE-SEABED instrument.
//
// Answers one question per configuration: how far below the DRAWN ground can
// the eye be held? Two regimes, both deterministic:
//
//   SUSTAINED  a constant downward input of D metres/frame applied to the eye
//              AND the orbit target, the way a held OrbitControls pan does
//              (pan speed = targetDistance * 2 / clientHeight per pixel, so a
//              700 m orbit at 8 px/frame is ~15 m/frame). Measures whether the
//              clamp's half-recovery can be outrun.
//   IMPULSE    teleport 300 m under, then release. Measures the SETTLED state,
//              which is where a sentinel floor shows up as a permanent hole.
//
// The drawn ground is read back from the shipped shader through curlProbe, not
// re-derived in JS (MEASUREMENT_LESSONS 4):
//   land  -> world y = P.y           (bedElevM - u_waterLevel)
//   water -> world y = -modelDepthM  (the same quantity from the depth row)
//
// Reported penetration is DRAWN GROUND MINUS EYE: positive means the eye is
// under the ground, negative means it is above by that much.
//
// Usage: node scripts/measure_underbed.mjs out.json [--base=http://localhost:8230/web-three/]
//        [--shots=screens_dir] [--tag=before|after]
import { writeFileSync, mkdirSync } from 'node:fs';

// Same playwright discovery as dump_lineprobe.mjs / measure_cam_aim.mjs.
const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../../../../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
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
  .map((a) => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
const out = args.find((a) => !a.startsWith('--'));
const BASE = flags.base || 'http://localhost:8230/web-three/';
const SHOTS = flags.shots || null;
const TAG = flags.tag || 'run';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const DRIVER = async ({ x, z, rates }) => {
  const pb = window.__pointbreak;
  const { camera, controls } = pb;
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const ground = (gx, gz) => {
    const s = pb.curlProbe(gx, gz - 0.75, gz + 0.75, 3);
    if (!s) return null;
    const m = s[1];
    return { y: m.land > 0.5 ? m.y : -m.depth, land: m.land > 0.5 };
  };
  const pen = () => {
    const p = camera.position, g = ground(p.x, p.z);
    return g ? { y: p.y, x: p.x, z: p.z, ground: g.y, land: g.land, pen: g.y - p.y } : null;
  };
  // The EYE sits at the station (that is where penetration is measured);
  // the orbit target is parked 200 m seaward of it.
  const park = () => {
    controls.target.set(x, 0, z - 200);
    camera.position.set(x, 60, z);
    controls.update();
  };

  const res = { sustained: {}, impulse: null };
  for (const D of rates) {
    park();
    await raf();
    let worst = null, last = null;
    for (let i = 0; i < 140; i++) {
      // one frame of held-pan input: eye and target descend together
      camera.position.y -= D;
      controls.target.y -= D;
      await raf();
      last = pen();
      if (last && (!worst || last.pen > worst.pen)) worst = last;
    }
    res.sustained[D] = { worst, last };
  }
  // impulse: drop 300 m under and let go
  park();
  await raf();
  camera.position.set(x, -300, z);
  let lastI = null, worstI = null;
  for (let i = 0; i < 120; i++) {
    await raf();
    lastI = pen();
    if (lastI && (!worstI || lastI.pen > worstI.pen)) worstI = lastI;
  }
  res.impulse = { worst: worstI, settled: lastI };
  res.geoSpot = pb.state.geoSpot;
  res.depthMix = pb.uniforms.u_depthMix.value;
  res.waterLevel = pb.uniforms.u_waterLevel.value;
  return res;
};

const PRESETS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks', 'privates'];
const CONFIGS = [];
for (const p of PRESETS) CONFIGS.push({ preset: p, bed: 'reef' });
for (const b of ['plane', 'measured']) for (const p of ['secondpeak', 'privates'])
  CONFIGS.push({ preset: p, bed: b });
// Two stations: over the bluff (drawn ground is LAND) and over the reef.
const STATIONS = [{ name: 'land', x: 0, z: 215 }, { name: 'water', x: 0, z: -80 }];
const RATES = [15, 2];

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 750 } });
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
const rows = [];
const f = (v) => (v == null ? '   n/a' : v.toFixed(2).padStart(8));
for (const c of CONFIGS) {
  await page.goto(`${BASE}#preset=${c.preset}&bed=${c.bed}&sim=42&cam=free&controls=0&speed=0`,
    { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  for (const st of STATIONS) {
    const r = await page.evaluate(DRIVER, { x: st.x, z: st.z, rates: RATES });
    rows.push({ ...c, station: st.name, ...r });
    console.log(`${c.preset.padEnd(11)} bed=${c.bed.padEnd(9)} ${st.name.padEnd(6)}`
      + ` land=${r.sustained[15].last?.land}`
      + ` sustained15=${f(r.sustained[15].worst?.pen)}`
      + ` sustained2=${f(r.sustained[2].worst?.pen)}`
      + ` settled=${f(r.impulse.settled?.pen)}`);
  }
  if (SHOTS) {
    // A frame from the middle of the sustained-15 descent over the bluff,
    // aimed up at the underside — the reported view.
    await page.evaluate(async ({ x, z }) => {
      const pb = window.__pointbreak;
      const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
      pb.controls.target.set(x, 0, z - 200);
      pb.camera.position.set(x, 60, z);
      pb.controls.update();
      await raf();
      for (let i = 0; i < 90; i++) {
        pb.camera.position.y -= 15;
        pb.controls.target.y -= 15;
        await raf();
      }
      // hold the descent while aiming up at the terrain overhead
      for (let i = 0; i < 5; i++) {
        pb.camera.position.y -= 15;
        pb.controls.target.set(x, pb.camera.position.y + 70, z - 200);
        await raf();
      }
    }, { x: 0, z: 215 });
    await page.screenshot({ path: `${SHOTS}/${TAG}_${c.preset}_${c.bed}.png` });
  }
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(rows, null, 2));
