// Exact TUBE_VERT GPU readback — the swept breaker ribbon, as numbers.
// Pattern: scripts/measure_lip_descent.mjs. No CPU copy of the wave equations
// (MEASUREMENT_LESSONS 4): the page's own TUBE_VERT text runs as a float
// fragment pass sharing the live uniforms, textures and clock, and the face
// under the jet is read back through the page's curlProbe (compiled with the
// TUBE define in a #tube boot, so it is the tube-arm grid).
//
// Sewers card day (H0 2.2 m, T 15 s), stations x = -84, -52, -20, local age
// 0 -> 1.0 s in 0.05 s steps. Asserts: finite; back seam C0 (< 0.05 m) while
// the sheet is attached (age <= 0.40); landing seam C0 (< 0.05 m) from impact
// on; the profile's own landing within [0.9, 1.6] crest heights; a cavity
// (max vertical gap jet - face > 0.3 h_C for some age); seek independence.
// Also counts z-folds in the grid transect on both arms (u_tube 1 / 0) — the
// grid must be single-valued under the ribbon.
//
// Usage: node scripts/probe_tube.mjs [outdir]
// BASE_URL defaults to http://127.0.0.1:8132 (python3 scripts/serve.py 8132);
// PLAYWRIGHT_DIR may name Playwright's index.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
let chromium;
for (const path of [process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname].filter(Boolean)) {
  try { ({ chromium } = await import(path)); break; } catch { /* next */ }
}
assert.ok(chromium, 'Set PLAYWRIGHT_DIR to the Playwright index.mjs');
const out = resolve(process.argv[2] || 'qa/tube-2026-09-24');
const base = process.env.BASE_URL || 'http://127.0.0.1:8132';
mkdirSync(out, { recursive: true });
const SRC = ['web-three/js/main.js', 'web-three/js/shaders.js', 'web-three/js/tube.js',
  'shared/model-glsl.js', 'shared/breaker-profile-glsl.js'];
const sources = Object.fromEntries(SRC.map(p => [p, readFileSync(new URL('../' + p, import.meta.url), 'utf8')]));
const expose = 'camera, controls, state, surferGroup, sprayPoints, uniforms,';
assert.ok(sources['web-three/js/main.js'].includes(expose), 'main.js expose anchor moved');

const STATIONS = [-84, -52, -20];
const AGES = Array.from({ length: 21 }, (_, i) => Math.round(i * 5) / 100);   // 0 .. 1.00
const NU = 25;              // vertices across the profile (TUBE_SEG_U 24 segments)
const ROWS = 8;
const SEAM_M = 0.05;

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 625 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/web-three/js/main.js', r => r.fulfill({
  body: sources['web-three/js/main.js'].replace(expose, expose + ' renderer,'), contentType: 'application/javascript',
}));

await page.goto('about:blank');
// FLAGS appends extra hash params (e.g. '&classic=1&descent=1' to probe the
// shared frame's 1.6 h_C receiver under the ribbon).
const FLAGS = process.env.FLAGS || '';
await page.goto(`${base}/web-three/#preset=sewers&month=card&cam=cliff&tube=1&speed=0&sim=48&q=high&controls=0${FLAGS}`);
await page.waitForFunction(() => window.__pointbreak?.uniforms?.u_time.value === 48, null, { timeout: 60000 });
await page.evaluate(async ({ NU, ROWS }) => {
  const THREE = await import('/web-three/vendor/three.module.js');
  const { TUBE_VERT } = await import('/web-three/js/tube.js');
  const p = window.__pointbreak;
  if (!p.tubeBuild) throw new Error('not a TUBE build');
  let frag = TUBE_VERT;
  for (const v of ['float vTubeA', 'vec2  vTubeUV', 'vec3  vTubeN', 'vec3  vTubeW', 'vec3  vTubeK']) {
    if (!frag.includes('varying ' + v + ';')) throw new Error('TUBE_VERT varying anchor changed: ' + v);
    frag = frag.replace('varying ' + v + ';', v + ';');
  }
  frag = frag.replace('void main(){\n  float x0 = position.x;',
    `uniform float u_probeX;\nvec3 position;\nvoid main(){\nposition = vec3(u_probeX, floor(gl_FragCoord.x)/${(NU - 1).toFixed(1)} - 0.5, 0.0);\n  float x0 = position.x;`);
  const final = 'gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);';
  if (!frag.includes(final)) throw new Error('TUBE_VERT instrumentation anchor changed');
  frag = frag.replace(final, `float row = floor(gl_FragCoord.y);
      if (row < 0.5) gl_FragColor = vec4(P, vTubeA);
      else if (row < 1.5) gl_FragColor = vec4(PB, wB);
      else if (row < 2.5) gl_FragColor = vec4(PL, wL);
      else if (row < 3.5) gl_FragColor = vec4(Pc, age);
      else if (row < 4.5) gl_FragColor = vec4(pr.x, pr.y, sigma, hCd);
      else if (row < 5.5) gl_FragColor = vec4(weight, D, sL, zc);
      else if (row < 6.5) gl_FragColor = vec4(W, tip);
      else gl_FragColor = vec4(N, clearP);`);
  const uniforms = { ...p.uniforms, u_probeX: { value: 0 } };
  const material = new THREE.ShaderMaterial({ uniforms, fragmentShader: frag, defines: { TUBE: 1 },
    vertexShader: 'void main(){gl_Position=vec4(position.xy*2.0,0.0,1.0);}' });
  const scene = new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));
  const rt = new THREE.WebGLRenderTarget(NU, ROWS, { type: THREE.FloatType, depthBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const camera = new THREE.Camera();
  window.probeTube = x => {
    uniforms.u_probeX.value = x;
    const previous = p.renderer.getRenderTarget();
    p.renderer.setRenderTarget(rt); p.renderer.render(scene, camera);
    const a = new Float32Array(NU * ROWS * 4);
    p.renderer.readRenderTargetPixels(rt, 0, 0, NU, ROWS, a);
    p.renderer.setRenderTarget(previous);
    const row = r => Array.from({ length: NU }, (_, i) => [...a.slice((r * NU + i) * 4, (r * NU + i) * 4 + 4)]);
    return { P: row(0), PB: row(1)[0], PL: row(2)[0], Pc: row(3)[0], prof: row(4), frame: row(5)[0], W: row(6), N: row(7) };
  };
  p.controls.dispatchEvent({ type: 'start' });
  p.setView([12, 11, -190], [-52, 4, -229]);
}, { NU, ROWS });

async function pose(x, t, tube = 1) {
  return page.evaluate(async ({ x, t, tube }) => {
    const p = window.__pointbreak;
    p.uniforms.u_tube.value = tube;
    p.setSim(t);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (Math.abs(p.uniforms.u_time.value - t) > 1e-5) throw new Error('clock mismatch');
    const tubeRead = window.probeTube(x);
    // The grid transect under the ribbon, source z from behind the crest to past the landing.
    const zc = tubeRead.frame[3], zL = tubeRead.frame[3] + tubeRead.frame[1] + 4;
    const transect = p.curlProbe(x, zc - 12, zL + 8, 384).map(s => [s.z0, s.y, s.z, s.curl, s.land]);
    return { tubeRead, transect, vis: p.uniforms.u_vis.value, T: p.state.T, H0: p.state.H0, xi: p.state.xi };
  }, { x, t, tube });
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// Reverse travel of the DISPLACED z along a source transect, metres: the sum
// of every back-step inside the band, and the largest contiguous back-run
// (CLASSIC_WAVE_PROGRESS's "horizontal reach of the largest upper fold"). A
// raw count of back-steps was tried first and measured chop jitter (mm-scale
// steps at 7 cm sampling) on both arms alike; metres discriminate.
const folds = (tr, z0, z1) => {
  let total = 0, run = 0, largest = 0;
  for (let i = 1; i < tr.length; i++) {
    if (tr[i][0] < z0 || tr[i][0] > z1) { run = 0; continue; }
    const back = tr[i - 1][2] - tr[i][2];
    if (back > 0) { total += back; run += back; largest = Math.max(largest, run); } else run = 0;
  }
  return { total: +total.toFixed(3), largest: +largest.toFixed(3) };
};
// Face height under a world (y, z): nearest transect sample by DISPLACED z.
const faceYAt = (tr, z) => {
  let best = null;
  for (const s of tr) { const d = Math.abs(s[2] - z); if (d < 0.75 && (!best || d < best.d)) best = { d, y: s[1] }; }
  return best ? best.y : null;
};

const failures = [], rows = [], seeks = [], sweep = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };
try {
  // ---- the cusp cap sweep: how far S must fall for the grid to be single-valued under the ribbon ----
  // Same station/ages, u_tubeS stepped; the shipped value is restored after.
  const shippedS = await page.evaluate(() => window.__pointbreak.uniforms.u_tubeS.value);
  const first52 = await pose(-52, 48);
  const birth52 = 48 - first52.tubeRead.Pc[3];
  for (const sCap of (process.env.TUBE_S_SWEEP || '0.98,0.8,0.65,0.5,0.4,0.3').split(',').map(Number)) {
    await page.evaluate(v => window.__pointbreak.setTubeS(v), sCap);
    for (const age of [0.2, 0.4, 0.5]) {
      const on = await pose(-52, birth52 + age, 1);
      const r = on.tubeRead, [, D, , zc] = r.frame, hCd = r.prof[0][3];
      const f = folds(on.transect, zc - 5, zc + D + 5);
      let cav = 0;
      for (let i = 0; i < NU; i++) {
        const P = r.P[i]; if (P[3] < 0.02 || r.prof[i][0] <= 0.01) continue;
        const fy = faceYAt(on.transect, P[2]); if (fy !== null) cav = Math.max(cav, P[1] - fy);
      }
      // Crest height on the transect (the cap must not eat the wave).
      const crestY = Math.max(...on.transect.map(s => s[1]));
      sweep.push({ sCap, age, reverseM: f.total, largestM: f.largest, reachRatio: +(D / hCd).toFixed(3), cavityRatio: +(cav / hCd).toFixed(3), crestY: +crestY.toFixed(2) });
    }
  }
  await page.evaluate(v => window.__pointbreak.setTubeS(v), shippedS);
  console.table(sweep);
  for (const x of STATIONS) {
    const first = await pose(x, 48);
    const age48 = first.tubeRead.frame[0] === undefined ? NaN : first.tubeRead.Pc[3];
    assert.ok(Number.isFinite(age48) && age48 >= 0 && age48 < first.T, `age at sim 48 out of range at x=${x}: ${age48}`);
    const birth = 48 - age48;
    let visible = [], cavityMax = 0, cavityAge = null;
    for (const age of AGES) {
      const t = birth + age;
      const on = await pose(x, t, 1);
      const off = await pose(x, t, 0);
      const r = on.tubeRead, vis = on.vis;
      const flat = [...r.P.flat(), ...r.PB, ...r.PL, ...r.Pc, ...r.prof.flat(), ...r.frame, ...r.W.flat(), ...r.N.flat()];
      check(flat.every(Number.isFinite), `non-finite readback at x=${x} age=${age}`);
      const ageGPU = r.Pc[3];
      check(Math.min(Math.abs(ageGPU - age), Math.abs(ageGPU - age - on.T)) < 3e-4, `local age ${ageGPU} vs ${age} at x=${x}`);
      const [weight, D, sL, zc] = r.frame;
      const hCd = r.prof[0][3], hC = hCd / vis, sigma = r.prof[0][2];
      const alpha0 = r.P[0][3], alpha1 = r.P[NU - 1][3];
      const backGap = dist(r.P[0], r.PB), landGap = dist(r.P[NU - 1], r.PL);
      if (age > 0 && age <= 0.40 && alpha0 > 0.02) check(backGap < SEAM_M, `back seam gap ${backGap.toFixed(3)} m at x=${x} age=${age}`);
      if (age >= 0.42 && alpha1 > 0.02) check(landGap < SEAM_M, `landing seam gap ${landGap.toFixed(3)} m at x=${x} age=${age}`);
      const landRatio = sL / hC;
      if (weight > 0.001) check(landRatio >= 0.9 - 1e-3 && landRatio <= 1.6 + 1e-3, `profile landing ${landRatio.toFixed(3)} h_C at x=${x} age=${age}`);
      // Cavity: vertical gap between jet vertices and the face beneath them.
      let cav = 0;
      for (let i = 0; i < NU; i++) {
        const P = r.P[i]; if (P[3] < 0.02 || r.prof[i][0] <= 0.01) continue;
        const fy = faceYAt(on.transect, P[2]); if (fy === null) continue;
        cav = Math.max(cav, P[1] - fy);
      }
      if (cav > cavityMax) { cavityMax = cav; cavityAge = age; }
      const zL = zc + D;
      const foldOn = folds(on.transect, zc - 5, zL + 5), foldOff = folds(off.transect, zc - 5, zL + 5);
      const alphaMax = Math.max(...r.P.map(v => v[3]));
      if (alphaMax > 0.02) visible.push(age);
      rows.push({ x, age, t, birth, weight, alphaMax, alpha0, alpha1, backGap, landGap, hCd, hC, sL, landRatio, D, reachRatio: D / hCd,
        sigma, zc, cavity: cav, cavityRatio: cav / hCd, foldOn: foldOn.total, foldOff: foldOff.total,
        foldLargestOn: foldOn.largest, foldLargestOff: foldOff.largest,
        tip: r.W[0][3], clear: r.N[0][3], P: r.P, PB: r.PB, PL: r.PL, Pc: r.Pc, profile: r.prof.map(v => [v[0], v[1]]) });
    }
    const hCdRef = rows.filter(r => r.x === x)[0].hCd;
    check(cavityMax > 0.3 * hCdRef, `no cavity at x=${x}: max gap ${cavityMax.toFixed(2)} m vs 0.3*h_C ${(0.3 * hCdRef).toFixed(2)}`);
    console.log(`x=${x}: birth ${birth.toFixed(3)} s, h_C ${hCdRef.toFixed(2)} m displayed, visible ages ${visible[0]}..${visible[visible.length - 1]}, cavity max ${cavityMax.toFixed(2)} m at age ${cavityAge}`);
  }
  // Seek independence: re-pose out of order, no history.
  for (const [x, age] of [[-20, 0.4], [-84, 0.15], [-52, 0.6]]) {
    const ref = rows.find(r => r.x === x && Math.abs(r.age - age) < 1e-9);
    const again = (await pose(x, ref.t, 1)).tubeRead;
    const err = Math.max(...again.P.flat().map((v, i) => Math.abs(v - ref.P.flat()[i])));
    check(err < 3e-5, `seek-dependent ribbon at x=${x} age=${age}: ${err}`);
    seeks.push({ x, age, maxError: err });
  }
  check(errors.length === 0, `browser/shader errors: ${errors.slice(0, 3).join(' | ')}`);
} finally {
  const summary = STATIONS.map(x => {
    const rs = rows.filter(r => r.x === x);
    const vis = rs.filter(r => r.alphaMax > 0.02);
    return {
      x, birth: rs[0]?.birth, hCd: rs[0]?.hCd, hC: rs[0]?.hC,
      visibleAges: vis.length ? [vis[0].age, vis[vis.length - 1].age] : null,
      landRatio: rs[0]?.landRatio, reachRatio: rs.map(r => r.reachRatio),
      sigma: rs.map(r => r.sigma),
      backGapMax: Math.max(...rs.filter(r => r.age > 0 && r.age <= 0.4 && r.alpha0 > 0.02).map(r => r.backGap), 0),
      landGapMax: Math.max(...rs.filter(r => r.age >= 0.42 && r.alpha1 > 0.02).map(r => r.landGap), 0),
      cavityMax: Math.max(...rs.map(r => r.cavity), 0), cavityRatioMax: Math.max(...rs.map(r => r.cavityRatio), 0),
      cavityByAge: rs.map(r => [r.age, +r.cavityRatio.toFixed(3)]),
      foldReverseM: { on: rs.map(r => r.foldOn), off: rs.map(r => r.foldOff) },
      foldLargestM: { on: rs.map(r => r.foldLargestOn), off: rs.map(r => r.foldLargestOff) },
      foldLargestMaxM: { on: Math.max(...rs.map(r => r.foldLargestOn)), off: Math.max(...rs.map(r => r.foldLargestOff)) },
    };
  });
  writeFileSync(`${out}/probe.json`, JSON.stringify({
    protocol: { kind: 'exact TUBE_VERT float GPU pass + curlProbe transect (TUBE define)', stations: STATIONS, ages: AGES, flags: FLAGS,
      verticesPerProfile: NU, seamToleranceM: SEAM_M, preset: 'sewers', month: 'card', H0: 2.2, T: 15,
      note: 'World y is displayed (VIS-exaggerated) metres; hC is the physical ceiling hCd/VIS. landRatio is the profile in physical units; reachRatio is the drawn crest-to-landing distance over the displayed ceiling. Cavity = max over jet vertices of (ribbon y - face y at the same displaced z), single instant, not a fluid volume.' },
    sourceHashes: Object.fromEntries(Object.entries(sources).map(([p, s]) => [p, createHash('sha256').update(s).digest('hex')])),
    tubeSShipped: rows.length ? await page.evaluate(() => window.__pointbreak.uniforms.u_tubeS.value).catch(() => null) : null,
    cuspCapSweep: sweep, summary, seeks, failures, errors,
  }, null, 1));
  writeFileSync(`${out}/probe.rows.json`, JSON.stringify(rows));
  await browser.close();
}
console.table(rows.filter(r => r.x === -52).map(r => ({ age: r.age, w: +r.weight.toFixed(3), a0: +r.alpha0.toFixed(2), a1: +r.alpha1.toFixed(2),
  back: +r.backGap.toFixed(3), land: +r.landGap.toFixed(3), reach: +r.reachRatio.toFixed(2), sigma: +r.sigma.toFixed(2),
  cav: +r.cavityRatio.toFixed(2), revOn: r.foldOn, revOff: r.foldOff, bigOn: r.foldLargestOn, bigOff: r.foldLargestOff })));
if (failures.length) { console.error('FAILED:\n' + failures.join('\n')); process.exit(1); }
console.log(`Verified ${rows.length} matched poses over ${STATIONS.length} stations; ${seeks.length} out-of-order seeks; no browser errors.`);
