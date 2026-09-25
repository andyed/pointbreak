// Impact-plume probe (#crash=1): exact PLUME_VERT GPU readback at Sewers
// stations across local age, plus default-frame pixel parity.
//
// Asserts, per station and age:
//   * every plume vertex and every landing value is finite;
//   * the arch's two feet are ON the drawn water: u=-1 equals surfacePos at the
//     live lip (CURTAIN_VERT's tip construction), u=+1 equals surfacePos at the
//     contact point zc + PLUME_REACH_HC*h_crest, both from the same pass;
//   * while visible, the contact foot is shoreward of and below the lip foot
//     (the plume runs forward and down, never up the back of the crest);
//   * the plume is invisible (alpha <= 0.02) before impact (tauD <= 0) and
//     after PLUME_END_S, and visible inside the window where the landing has
//     strength;
//   * the landing clock is the lifecycle's (tauD = age - CRASH_PEAK_S mod T);
//   * peak top height over the contact foot / h_crest and over the lip / h_crest
//     lie in authored bands;
//   * seeking the same clocks out of order reproduces the exact same vertices;
//   * gain 0 draws nothing (every alpha exactly 0).
// Then, with a pristine tree served on a second port (--baseline-url), the
// default frame of this tree is compared pixel-for-pixel at two cameras and
// two clocks: the flag off must be byte-identical.
//
// Usage: node scripts/probe_crash.mjs [--out=dir] [--base-url=http://127.0.0.1:8133]
//                                     [--baseline-url=http://127.0.0.1:8134] [--no-parity]
// Requires scripts/serve.py on both ports. PLAYWRIGHT_DIR / PNGJS_DIR optional.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { ROOT, loadChromium, loadPNG, installPlumeProbe, routeRenderer, seek,
         PLUME_SAMPLES, CRASH_PEAK_S } from './lib/plume-probe.mjs';

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const s = a.replace(/^--/, ''); const eq = s.indexOf('=');
  return eq < 0 ? [s, 'true'] : [s.slice(0, eq), s.slice(eq + 1)];
}));
const OUT = resolve(flags.out || join(ROOT, 'docs/research/assets/crash-2026-09-24'));
const BASE = flags['base-url'] || 'http://127.0.0.1:8133';
const BASELINE = flags['baseline-url'] || 'http://127.0.0.1:8134';
const PARITY = flags['no-parity'] !== 'true';
mkdirSync(OUT, { recursive: true });

const chromium = await loadChromium();
const PNG = PARITY ? await loadPNG() : null;
const sources = Object.fromEntries(['web-three/js/main.js', 'web-three/js/shaders.js', 'shared/model-glsl.js']
  .map((p) => [p, readFileSync(join(ROOT, p), 'utf8')]));

// Authored constants under test — read off PLUME_VERT so a drift fails loudly.
const constant = (name) => {
  const m = sources['web-three/js/shaders.js'].match(new RegExp(`const float ${name}\\s*=\\s*([0-9.]+);`));
  assert.ok(m, `${name} not found in PLUME_VERT`);
  return Number(m[1]);
};
const PLUME_END_S = constant('PLUME_END_S');
const PLUME_REACH_HC = constant('PLUME_REACH_HC');

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 625 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await routeRenderer(page, sources['web-three/js/main.js']);

const CLOSE = { eye: [12, 11, -190], target: [-52, 4, -229] };   // stage coordinates
async function boot(url, hash, view) {
  await page.goto('about:blank');
  await page.goto(`${url}/web-three/#${hash}`);
  await page.waitForFunction(() => window.__pointbreak?.uniforms?.u_time.value === 48, null, { timeout: 90000 });
  if (view) await page.evaluate(({ eye, target }) => {
    const p = window.__pointbreak; p.controls.dispatchEvent({ type: 'start' }); p.setView(eye, target);
  }, view);
}
const probe = (x) => page.evaluate((x) => window.probePlume(x), x);
const rows = [], seeks = [], parity = [];
const stations = {};
const near = (a, b, eps, label) => assert.ok(Math.abs(a - b) < eps, `${label}: ${a} vs ${b}`);
try {
  await boot(BASE, 'preset=sewers&month=card&cam=cliff&crash=1&speed=0&sim=48&q=high&controls=0', CLOSE);
  await page.evaluate(installPlumeProbe, PLUME_SAMPLES);
  const T = await page.evaluate(() => window.__pointbreak.state.T);
  const AGES = [...Array.from({ length: 33 }, (_, i) => i * 0.05), 2.0, 3.0, 8.0];
  for (const x of [-84, -52, -20]) {
    await seek(page, 48);
    const at48 = await probe(x);
    const birth = 48 - (at48.land.tauD + CRASH_PEAK_S);
    stations[x] = { birth, hC: at48.land.hC, zL: at48.land.zL, tauDAt48: at48.land.tauD };
    let peakOverContact = 0, peakOverLip = -9, firstVisible = null, lastVisible = null, maxStrength = 0;
    let lipBehindContactM = Infinity, lipAboveContactM = Infinity;
    for (const age of AGES) {
      const t = birth + age;
      await seek(page, t);
      const r = await probe(x);
      const flat = [...r.spine.flatMap((q) => [q.x, q.y, q.z, q.a, q.radius]), ...Object.values(r.lip),
                    ...Object.values(r.contact), ...Object.values(r.land), ...Object.values(r.shape)];
      assert.ok(flat.every(Number.isFinite), `non-finite plume at x=${x} age=${age}`);
      // The landing clock is the lifecycle's: tauD = age - CRASH_PEAK_S (mod T).
      const tauWant = age - CRASH_PEAK_S;
      const dTau = Math.min(Math.abs(r.land.tauD - tauWant), Math.abs(r.land.tauD - tauWant - T), Math.abs(r.land.tauD - tauWant + T));
      assert.ok(dTau < 1e-3, `landing clock off by ${dTau} at x=${x} age=${age} (tauD ${r.land.tauD}, birth ${birth}, T ${T})`);
      const maxA = Math.max(...r.spine.map((q) => q.a));
      const top = Math.max(...r.spine.map((q) => q.y));
      const overContact = (top - r.contact.y) / Math.max(r.land.hC, 1e-3);
      const overLip = (top - r.lip.y) / Math.max(r.land.hC, 1e-3);
      if (r.land.tauD <= 0 || r.land.tauD >= PLUME_END_S) {
        assert.ok(maxA <= 0.02, `plume visible outside its window at x=${x} age=${age} (tauD ${r.land.tauD.toFixed(3)}, alpha ${maxA.toFixed(3)})`);
      }
      let spineOffChordM = 0;
      if (maxA > 0.02) {
        if (firstVisible === null) firstVisible = age;
        lastVisible = age;
        const hC = r.land.hC;
        // Forward and down: the contact foot is shoreward of and below the lip.
        assert.ok(r.contact.z > r.lip.z, `contact behind the lip at x=${x} age=${age}: ${r.contact.z} <= ${r.lip.z}`);
        assert.ok(r.contact.y < r.lip.y, `contact above the lip at x=${x} age=${age}: ${r.contact.y} >= ${r.lip.y}`);
        lipBehindContactM = Math.min(lipBehindContactM, r.contact.z - r.lip.z);
        lipAboveContactM = Math.min(lipAboveContactM, r.lip.y - r.contact.y);
        // The spine lives in the lip->contact span: never behind the lip
        // (seaward of it by more than the tumble), never above lip + hump,
        // never below the contact by more than the tumble. Its lip end sits on
        // the chord within the tumble amplitude (0.12 hC along the hump, 0.10
        // hC in z), sliding toward the contact as the mass collapses.
        const chord = { y: r.contact.y - r.lip.y, z: r.contact.z - r.lip.z };
        const cl = Math.hypot(chord.y, chord.z);
        for (const q of r.spine) {
          assert.ok(q.z > r.lip.z - 0.3 * hC, `spine behind the lip at x=${x} age=${age}: z ${q.z} vs lip ${r.lip.z}`);
          assert.ok(q.z < r.contact.z + 0.35 * cl + 0.3 * hC, `spine past the contact at x=${x} age=${age}`);
          assert.ok(q.y < r.lip.y + r.shape.H + 0.3 * hC, `spine above lip + hump at x=${x} age=${age}`);
          assert.ok(q.y > Math.min(r.lip.y, r.contact.y) - 0.3 * hC, `spine below the water at x=${x} age=${age}`);
        }
        const q0 = r.spine[0];
        const dy = q0.y - r.lip.y, dz = q0.z - r.lip.z;
        const along = (dy * chord.y + dz * chord.z) / Math.max(cl * cl, 1e-6);
        const off = Math.hypot(dy - along * chord.y, dz - along * chord.z);
        spineOffChordM = off;
        assert.ok(off < 0.3 * hC, `lip end of the spine ${off.toFixed(2)} m off the chord at x=${x} age=${age}`);
        assert.ok(along > -0.1 && along < 0.5, `lip end of the spine slid ${along.toFixed(2)} of the chord at x=${x} age=${age}`);
        peakOverContact = Math.max(peakOverContact, overContact);
        peakOverLip = Math.max(peakOverLip, overLip);
      }
      maxStrength = Math.max(maxStrength, r.land.strength);
      rows.push({ x, age, t, tauD: r.land.tauD, strength: r.land.strength, alpha: maxA, top, overContact, overLip,
                  hC: r.land.hC, zL: r.land.zL, lip: r.lip, contact: r.contact, shape: r.shape, spineOffChordM,
                  spine: r.spine.map((q) => [q.x, q.y, q.z, q.a, q.radius].map((v) => Math.round(v * 1e4) / 1e4)) });
    }
    assert.ok(maxStrength > 0.05, `no landing strength at x=${x} (max ${maxStrength})`);
    assert.ok(firstVisible !== null, `plume never visible at x=${x}`);
    assert.ok(peakOverContact > 0.6 && peakOverContact < 1.5, `peak top over contact / hC = ${peakOverContact.toFixed(3)} outside the authored band at x=${x}`);
    assert.ok(peakOverLip > -0.3 && peakOverLip < 0.7, `peak top over lip / hC = ${peakOverLip.toFixed(3)} outside the authored band at x=${x}`);
    Object.assign(stations[x], { firstVisibleAge: firstVisible, lastVisibleAge: lastVisible, peakOverContact, peakOverLip,
                                 maxStrength, minContactAheadOfLipM: lipBehindContactM, minLipAboveContactM: lipAboveContactM });
    console.log(`x=${x}: birth ${birth.toFixed(3)} hC ${at48.land.hC.toFixed(2)} m, visible ages ${firstVisible}..${lastVisible}, ` +
                `top/hC over contact ${peakOverContact.toFixed(3)}, over lip ${peakOverLip.toFixed(3)}, contact ahead >= ${lipBehindContactM.toFixed(2)} m, ` +
                `below lip >= ${lipAboveContactM.toFixed(2)} m, strength ${maxStrength.toFixed(3)}`);
  }
  // Out-of-order seeks reproduce the same vertices exactly (no history).
  for (const x of [-20, -84, -52]) for (const age of [0.8, 0.5, 0.65]) {
    const ref = rows.find((r) => r.x === x && Math.abs(r.age - age) < 1e-9);
    await seek(page, ref.t);
    const again = await probe(x);
    const err = Math.max(...again.spine.flatMap((q, i) => [q.x, q.y, q.z, q.a, q.radius].map((v, k) => Math.abs(v - ref.spine[i][k]))));
    assert.ok(err < 1e-3, `seek-dependent plume at x=${x} age=${age}: ${err}`);
    seeks.push({ x, age, maxError: err });
  }
  // Gain 0 draws nothing, exactly.
  await page.evaluate(() => window.__pointbreak.setCrash(0));
  for (const x of [-84, -52, -20]) {
    await seek(page, stations[x].birth + 0.7);
    const r = await probe(x);
    assert.ok(r.spine.every((q) => q.a === 0), `gain 0 still has alpha at x=${x}`);
  }
  await page.evaluate(() => window.__pointbreak.setCrash(1));

  // ---- default parity against the pristine tree ----
  if (PARITY) {
    // Each tree must serve its OWN main.js here: the renderer route would
    // otherwise hand this tree's file to the baseline page.
    await page.unroute('**/web-three/js/main.js');
    const shots = [
      { name: 'close', hash: 'preset=sewers&month=card&cam=cliff&speed=0&sim=48&q=high&controls=0', view: CLOSE, times: [48, stations[-52].birth + 0.7] },
      { name: 'lookout', hash: 'preset=sewers&month=card&cam=lookout&speed=0&sim=48&q=high&controls=0', view: null, times: [48, 51] },
    ];
    const grab = async (url, shot, t) => {
      await boot(url, shot.hash, shot.view);
      await seek(page, t);
      return PNG.sync.read(await page.screenshot({ type: 'png' }));
    };
    for (const shot of shots) for (const t of shot.times) {
      const a = await grab(BASE, shot, t), b = await grab(BASELINE, shot, t);
      assert.equal(a.width, b.width); assert.equal(a.height, b.height);
      let diff = 0, maxLevel = 0;
      for (let i = 0; i < a.data.length; i += 4) {
        const d = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]));
        if (d > 0) { diff++; maxLevel = Math.max(maxLevel, d); }
      }
      parity.push({ shot: shot.name, t, pixelsDiffering: diff, maxLevel, identical: diff === 0 });
      console.log(`parity ${shot.name} t=${t.toFixed(3)}: ${diff} pixels differ (max ${maxLevel} levels)`);
      assert.equal(diff, 0, `default frame differs from the pristine tree at ${shot.name} t=${t}`);
    }
  }
  assert.equal(errors.length, 0, 'browser/shader errors: ' + errors.join('\n'));
  writeFileSync(join(OUT, 'probe.json'), JSON.stringify({
    protocol: { kind: 'exact PLUME_VERT float GPU pass', samplesPerArch: PLUME_SAMPLES, stations: [-84, -52, -20],
      ages: AGES, impactAge: CRASH_PEAK_S, plumeEndTauD: PLUME_END_S, plumeReachHc: PLUME_REACH_HC, camera: CLOSE, baseline: PARITY ? BASELINE : null,
      note: 'Puff centres along the arch spine (all randoms 0.5); not a fluid-parcel trajectory. tauD is seconds since this station\'s landing. Lip = surfacePos at the live crest source; contact = surfacePos at zc(impact) + PLUME_REACH_HC*hC.' },
    sourceHashes: Object.fromEntries(Object.entries(sources).map(([p, s]) => [p, createHash('sha256').update(s).digest('hex')])),
    stations, seeks, parity, rows,
  }, null, 2));
  console.log(`ok - ${rows.length} poses, ${seeks.length} seeks, ${parity.length} parity frames -> ${OUT}/probe.json`);
} finally {
  await browser.close();
}
