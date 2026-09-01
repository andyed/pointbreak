// Birth-ramp A/B capture rig (#birth=, EXPERIMENT 2026-09-01).
//
// The claim under test (TODO 2026-08-30, "foam terminates on hard straight
// edges in plan view"): the breakpoint lifecycle clock is a function of x
// alone, so its T -> 0 snap at the zipper head prints a shore-normal straight
// foam edge from the drone. #birth ramps the DEPOSIT behind the head instead
// of the clock. This rig captures pinned clocks per arm from BOTH the drone
// (where the artifact lives) and the cliff (where the 2026-08-28 chasing-foam
// defect would show as a brighter not-yet-broken side), and records per frame
// the camera and the model's own head position projected to screen, so the
// measurement (scripts/measure_foam_edge.py) can fix its windows on the
// DEFAULT arm's geometry and never re-frame on the signal it measures
// (MEASUREMENT_LESSONS 11). Cold load through about:blank per config: a
// warm-page hash goto races the app's own boot-only reload.
//
// Serves THIS checkout itself (scripts/serve.py, no-store) on its own port so
// a worktree never measures the main checkout's dev server by accident.
//
//   node scripts/capture_birth_ab.mjs [outdir]
//   BIRTH_ARMS=default,birth0,A   BIRTH_RIGS=sewers_drone   BIRTH_TIMES=52
//
// Wrap-ramp width sweep (#wrapw / #wrapl, 2026-09-01) reuses the rig: arms
// wid/w21/w28/w42/w56/l50 and the lineup rigs. `wid` is the bit-identity arm,
// the shipped 2.4 s written in metres at the PRESET's c = LAM/T, so it is a
// function of the rig. Every frame also records the model's own crest locus
// (argmax surface height per station, through curlProbe) projected to screen,
// so the horizontal plan-view edge can be measured in windows fixed on the
// default arm's crest rather than on the pixels being measured.
//
// Playwright is resolved from a sibling repo, like every other rig here.

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../../../../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'qa/img/birth'));
const PORT = Number(process.env.BIRTH_PORT || 8241);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const BASE = 'controls=0&q=high&speed=0';

const ALL_RIGS = {
  // The live repro (#preset=sewers&cam=drone&h0=2.20&sim=44|52) and its cliff twin.
  sewers_drone:     'preset=sewers&cam=drone&h0=2.20',
  sewers_cliff:     'preset=sewers&cam=cliff&h0=2.20',
  // One other mapped preset, card H0 (what ships).
  secondpeak_drone: 'preset=secondpeak&cam=drone',
  secondpeak_cliff: 'preset=secondpeak&cam=cliff',
  // The lineup camera is where the #wrap ramp was first measured (CONTROLS.md).
  sewers_lineup:     'preset=sewers&cam=lineup&h0=2.20',
  secondpeak_lineup: 'preset=secondpeak&cam=lineup',
};
// Preset periods, for arms whose hash depends on the site (shared/params.js).
const PRESET_T = { sewers: 15, secondpeak: 14 };
const LAM = 90;
const presetOf = (rig) => rig.split('_')[0];
const ALL_ARMS = {
  default: '',
  birth0:  '&birth=0',                          // bit-identity proof arm
  A:       '&birth=0.12',                       // one-sided deposit ramp, 0.12*LAM = 10.8 m
  A2:      '&birth=0.25',                       // wider one-sided ramp, 22.5 m
  B:       '&birth=0.12&birthlead=0.5',         // centred world-x blend across the snap
  C:       '&birth=0.12&birthrag=0.6',          // one-sided, ragged edge
  head0:   '&head=0',                           // diagnostic: no comet at all (owner check)
  arm0:    '&arm=0',                            // diagnostic: temporal comet, no set anchor
  // Owner bisection for the hard edge, one mechanism off per arm.
  legacy:  '&shape=legacy',                     // no structural bands / mound
  crest0:  '&crest=0',                          // no pocket foam floor / fresh-foam core
  lip0:    '&lip=0',                            // no aerated-lip whitening
  curl0:   '&curl=0',                           // legacy throw/drop instead of the bend
  onset0:  '&onset=0',                          // fold gates off the breaker clock
  wwarea0: '&wwarea=0',                         // no re-breaking area boost
  splash0: '&splash=0',                         // no crash burst
  gap0:    '&gap=0',                            // no section-gap masking (Andy's A/B)
  wrap0:   '&wrap=0',                           // raw carrier clock (reference)
  // Wrap-ramp width sweep (crestClockS width; shipped = 2.4 s = 14.4 m at sewers,
  // 15.4 m at secondpeak). Metres are nominal at c = LAM/T.
  wid:     (rig) => `&wrapw=${2.4 * LAM / PRESET_T[presetOf(rig)]}`,   // identity arm
  w21:     '&wrapw=21',
  w28:     '&wrapw=28',
  w42:     '&wrapw=42',
  w56:     '&wrapw=56',
  l50:     '&wrapl=0.5',                        // 0.5 LAM = 45 m; 0.5 T in seconds
};
const armHashFor = (arm, rig) => (typeof ALL_ARMS[arm] === 'function' ? ALL_ARMS[arm](rig) : ALL_ARMS[arm]);
const pick = (env, all) => (process.env[env] ? process.env[env].split(',') : Object.keys(all))
  .filter((k) => { if (!(k in all)) throw new Error(`unknown ${env} entry ${k}`); return true; });
const RIGS = pick('BIRTH_RIGS', ALL_RIGS);
const ARMS = pick('BIRTH_ARMS', ALL_ARMS);
const TIMES = (process.env.BIRTH_TIMES || '44,52').split(',').map(Number);

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

// Own server, own port, killed on exit. Health-checked before every config and
// respawned if it has gone away (a 48-capture run lost its server mid-matrix
// once; the rig must not lose the run with it).
let server = null;
const kill = () => { if (server) { try { server.kill('SIGTERM'); } catch { /* gone */ } server = null; } };
const alive = async () => { try { return (await fetch(`${BASE_URL}/web-three/index.html`)).ok; } catch { return false; } };
const ensureServer = async () => {
  if (await alive()) return;
  kill();
  server = spawn('python3', [join(ROOT, 'scripts/serve.py'), String(PORT)], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 50; i++) {
    if (await alive()) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`dev server did not come up on ${BASE_URL}`);
};
process.on('exit', kill); process.on('SIGINT', () => { kill(); process.exit(130); });
await ensureServer();

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

// The manifest accumulates across runs (upsert by png), so rigs can be
// captured in separate invocations and a failed run keeps what it got.
const MANIFEST = join(OUT, 'manifest.json');
const manifest = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, 'utf8'))
  : { root: ROOT, baseUrl: BASE_URL, viewport: [1440, 900], times: TIMES, rigs: {}, arms: {}, frames: [] };
for (const r of RIGS) manifest.rigs[r] = ALL_RIGS[r];
for (const a of ARMS) manifest.arms[a] = typeof ALL_ARMS[a] === 'function' ? '(per preset; see frame.armHash)' : ALL_ARMS[a];
const upsert = (frame) => {
  const i = manifest.frames.findIndex((f) => f.png === frame.png);
  if (i >= 0) manifest.frames[i] = frame; else manifest.frames.push(frame);
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
};

for (const rig of RIGS) {
  for (const arm of ARMS) {
    for (const sim of TIMES) {
      const armHash = armHashFor(arm, rig);
      const hash = `${ALL_RIGS[rig]}&${BASE}&sim=${sim}${armHash}`;
      await ensureServer();
      await page.goto('about:blank');
      try {
        await page.goto(`${BASE_URL}/web-three/#${hash}`, { waitUntil: 'load' });
      } catch (e) {
        console.warn(`load failed (${e.message.split('\n')[0]}); restarting server and retrying once`);
        kill(); await ensureServer();
        await page.goto('about:blank');
        await page.goto(`${BASE_URL}/web-three/#${hash}`, { waitUntil: 'load' });
      }
      await page.waitForTimeout(2600);
      const probe = await page.evaluate(() => {
        const pb = window.__pointbreak;
        const cam = pb.camera;
        const V3 = cam.position.constructor;
        const proj = (x, y, z) => {
          const v = new V3(x, y, z).project(cam);
          return [Math.round((v.x * 0.5 + 0.5) * innerWidth * 10) / 10,
                  Math.round((1 - (v.y * 0.5 + 0.5)) * innerHeight * 10) / 10,
                  (v.z > -1 && v.z < 1) ? 1 : 0];
        };
        const line = pb.lineProbe ? pb.lineProbe(2) : null;
        const zAt = (x) => {
          if (!line || !line.length) return null;
          let best = line[0];
          for (const p of line) if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
          return best.z;
        };
        const ride = pb.m4Ride ? pb.m4Ride() : null;
        const headX = ride && Number.isFinite(ride.x) ? ride.x : null;
        // The break line, projected: every 5 m of x across +-90 m of the head,
        // at water level and 6 m up (a crest's worth), plus 30 m shoreward, so
        // the analysis can build screen windows from the MODEL's geometry
        // rather than from the pixels it is about to measure.
        // The crest LOCUS at each station: argmax of the displaced surface
        // height over a shore-normal transect through the shipped shader
        // (curlProbe), -30..+60 m of the line at 0.9 m steps. The window stops
        // 30 m seaward so the next (approaching) crest, ~LAM further out,
        // cannot be picked. Land samples are excluded.
        const crestAt = (x, zl) => {
          if (!pb.curlProbe) return null;
          const s = pb.curlProbe(x, zl - 30, zl + 60, 101) || [];
          let best = null;
          for (const r of s) {
            if (!(r.land < 0.5) || !Number.isFinite(r.y) || !Number.isFinite(r.z)) continue;
            if (!best || r.y > best.y) best = r;
          }
          return best ? { y: Math.round(best.y * 100) / 100, z: Math.round(best.z * 100) / 100 } : null;
        };
        const stations = [];
        if (headX !== null) {
          for (let k = -90; k <= 90; k += 5) {
            const x = headX + k;
            const zl = zAt(x);
            if (zl === null) continue;
            const cr = crestAt(x, zl);
            stations.push({ k, x: Math.round(x * 100) / 100, zLine: Math.round(zl * 100) / 100,
                            sea: proj(x, 0.0, zl), crest: proj(x, 6.0, zl),
                            shore: proj(x, 0.0, zl + 30),
                            crestY: cr ? cr.y : null, crestZ: cr ? cr.z : null,
                            crestLoc: cr ? proj(x, cr.y, cr.z) : null });
          }
        }
        return {
          sim: pb.sim(),
          birth: pb.birth ? pb.birth() : null,
          wrap: pb.wrap ? pb.wrap() : null,
          headRead: pb.uniforms.u_headRead.value, armRead: pb.uniforms.u_armRead.value,
          xi: pb.state.xi, h0: pb.state.H0, T: pb.state.T,
          camera: cam.position.toArray().map((v) => Math.round(v * 100) / 100),
          target: pb.controls.target.toArray().map((v) => Math.round(v * 100) / 100),
          headX: headX === null ? null : Math.round(headX * 100) / 100,
          headZ: ride && Number.isFinite(ride.z) ? Math.round(ride.z * 100) / 100 : null,
          headScreen: headX === null ? null : proj(headX, 0.0, zAt(headX) ?? 0),
          stations,
        };
      });
      if (probe.sim !== sim) throw new Error(`clock mismatch: wanted ${sim}, got ${probe.sim}`);
      const png = `${rig}_${arm}_${String(sim).padStart(3, '0')}.png`;
      await page.screenshot({ path: join(OUT, png) });
      upsert({ rig, arm, sim, hash, armHash, png, ...probe });
      console.log(`captured ${png}  head x=${probe.headX} screen=${JSON.stringify(probe.headScreen)} birth=${JSON.stringify(probe.birth)} wrap=${JSON.stringify(probe.wrap)}`);
    }
  }
}

await browser.close();
kill();
if (errors.length) { console.error('CONSOLE ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`done - ${manifest.frames.length} captures in ${OUT}`);
