// Exact CURTAIN_VERT GPU readback. No CPU copy of the wave equations.
// Usage: node scripts/measure_lip_descent.mjs [outdir]
// BASE_URL defaults to localhost:8127; PLAYWRIGHT_DIR may name index.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { PRESETS } from '../shared/params.js';
let chromium;
for (const path of [process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname].filter(Boolean)) {
  try { ({ chromium } = await import(path)); break; } catch { /* next */ }
}
assert.ok(chromium, 'Set PLAYWRIGHT_DIR to the Playwright index.mjs');
const out = resolve(process.argv[2] || 'qa/descent-2026-09-15/verified');
const base = process.env.BASE_URL || 'http://127.0.0.1:8127';
mkdirSync(out, { recursive: true });
const sources = Object.fromEntries(['web-three/js/main.js', 'web-three/js/shaders.js', 'shared/model-glsl.js']
  .map(p => [p, readFileSync(new URL('../' + p, import.meta.url), 'utf8')]));
const expose = 'camera, controls, state, surferGroup, sprayPoints, uniforms,';
assert.ok(sources['web-three/js/main.js'].includes(expose));
const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 750 }, deviceScaleFactor: 1 });
const errors = [], rows = [], matrix = [], seeks = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.route('**/web-three/js/main.js', r => r.fulfill({
  body: sources['web-three/js/main.js'].replace(expose, expose + ' renderer,'), contentType: 'application/javascript',
}));
async function boot(preset, roller = 0) {
  await page.goto('about:blank');
  await page.goto(`${base}/web-three/#preset=${preset}&month=card&cam=cliff&classic=1&descent=1&roller=${roller}&speed=0&sim=48&q=high&controls=0`);
  await page.waitForFunction(() => window.__pointbreak?.uniforms?.u_time.value === 48);
  await page.evaluate(async () => {
    const THREE = await import('/web-three/vendor/three.module.js');
    const { CURTAIN_VERT } = await import('/web-three/js/shaders.js');
    const p = window.__pointbreak;
    let frag = CURTAIN_VERT.replace('varying float vCurtA;', 'float vCurtA;').replace('varying vec2  vCurtUV;', 'vec2 vCurtUV;');
    frag = frag.replace('void main(){', 'uniform float u_probeX;\nvec3 position;\nvoid main(){\nposition=vec3(u_probeX,floor(gl_FragCoord.x)/12.0-0.5,0.0);');
    const final = 'gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);';
    if (!frag.includes(final)) throw new Error('CURTAIN_VERT instrumentation anchor changed');
    frag = frag.replace(final, `if(gl_FragCoord.y<1.0)gl_FragColor=vec4(P,vCurtA);
      else if(gl_FragCoord.y<2.0)gl_FragColor=vec4(Ptip,curlT);
      else if(gl_FragCoord.y<3.0)gl_FragColor=vec4(Pland,gate);
      else gl_FragColor=vec4(zc,mod(thetaB,2.0*PI)/w,thTip,vG);`);
    const uniforms = { ...p.uniforms, u_probeX: { value: 0 } };
    const material = new THREE.ShaderMaterial({ uniforms, fragmentShader: frag,
      vertexShader: 'void main(){gl_Position=vec4(position.xy*2.0,0.0,1.0);}' });
    const scene = new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));
    const rt = new THREE.WebGLRenderTarget(13, 4, { type: THREE.FloatType, depthBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const camera = new THREE.Camera();
    window.probeCurtain = x => {
      uniforms.u_probeX.value = x;
      const previous = p.renderer.getRenderTarget();
      p.renderer.setRenderTarget(rt); p.renderer.render(scene, camera);
      const a = new Float32Array(13 * 4 * 4);
      p.renderer.readRenderTargetPixels(rt, 0, 0, 13, 4, a);
      p.renderer.setRenderTarget(previous);
      return { points: [...a.slice(0, 52)], tip: [...a.slice(52, 56)], landing: [...a.slice(104, 108)],
        meta: [...a.slice(156, 160)], head: a[207], tail: a[159] };
    };
    p.controls.dispatchEvent({ type: 'start' });
    p.setView([12, 11, -190], [-52, 4, -229]);
  });
}
async function pose(x, t, descent) {
  return page.evaluate(async ({ x, t, descent }) => {
    const p = window.__pointbreak; p.uniforms.u_lipDescent.value = descent; p.setSim(t);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (Math.abs(p.uniforms.u_time.value - t) > 1e-5) throw new Error('clock mismatch');
    return window.probeCurtain(x);
  }, { x, t, descent });
}
const EPS = 3e-5;
function close(a, b, label) { assert.ok(Math.abs(a - b) < EPS, `${label}: ${a} vs ${b}`); }
function finite(pose) {
  for (const a of [pose.points, pose.tip, pose.landing, pose.meta, [pose.head, pose.tail]])
    assert.ok(a.every(Number.isFinite), 'finite GPU curtain');
}
try {
  await boot('sewers');
  for (const x of [-84, -52, -20]) {
    const first = await pose(x, 48, 0), birth = 48 - first.meta[1];
    let lastHead = 0, lastTail = 0;
    for (const age of [...Array.from({ length: 31 }, (_, i) => i * .025), 1, 1.5, 14.95]) {
      const t = birth + age;
      const before = await pose(x, t, 0), after = await pose(x, t, 1);
      finite(before); finite(after);
      close(Math.min(Math.abs(after.meta[1] - age), Math.abs(after.meta[1] - age - 15)), 0, 'local age');
      // At the exact modulo boundary Float32 can report T rather than 0.
      // Both poses are invisible; compare progress only inside the new event.
      if (age > 0) {
        assert.ok(after.head + EPS >= lastHead && after.tail + EPS >= lastTail, `front/clearing edge retracts at x=${x}, age=${age}`);
        lastHead = after.head; lastTail = after.tail;
      }
      if (age >= .72 || age === 0) close(after.points[3], 0, 'closed event is invisible');
      if (after.points[3] > .02) {
        for (let i = 4; i < 52; i += 4) {
          assert.ok(after.points[i + 1] <= after.points[i - 3] + EPS, 'visible curve falls downward');
          assert.ok(after.points[i + 2] >= after.points[i - 2] - EPS, 'visible curve continues shoreward');
        }
        if (age < .42) for (let i = 0; i < 3; i++) close(after.points[i], after.tip[i], 'attached upper edge before impact');
        if (age >= .42) for (let i = 0; i < 3; i++) close(after.points[48 + i], after.landing[i], 'front rests on receiving surface');
      }
      rows.push({ x, age, t, birth, before, after });
      if (x === -52 && [.3, .4, .5, .6, .7, 1].some(a => Math.abs(a - age) < 1e-7)) {
        for (const [name, flag] of [['before', 0], ['after', 1]]) {
          await pose(x, t, flag);
          await page.screenshot({ path: `${out}/${name}-${age.toFixed(2)}.jpg`, type: 'jpeg', quality: 90 });
        }
      }
    }
  }
  // Seeking in a different order must reproduce the same pose, without history.
  for (const x of [-20, -84, -52]) for (const age of [.6, .3, .5]) {
    const ref = rows.find(r => r.x === x && Math.abs(r.age - age) < 1e-7);
    const actual = await pose(x, ref.t, 1);
    const error = Math.max(...actual.points.map((v, i) => Math.abs(v - ref.after.points[i])));
    assert.ok(error < EPS, 'seek-independent curtain'); seeks.push({ x, age, maxError: error });
  }
  // All presets, both optional-roller builds: finite geometry and off-arm parity.
  // Roller=1 intentionally moves the contact material, so only roller=0 promises
  // an unchanged whole grid. Inert flags must be exact for both builds.
  for (const preset of Object.keys(PRESETS)) for (const roller of [0, 1]) {
    await boot(preset, roller);
    const result = await page.evaluate(async ({ preset, roller }) => {
      const p = window.__pointbreak, u = p.uniforms;
      const station = p.lineProbe(1).reduce((a, b) => Math.abs(a.x) < Math.abs(b.x) ? a : b);
      const xs = [-52, 0, 52], z = station.z, checks = [];
      const original = { classic: u.u_classicWave.value, curl: u.u_curl.value, onset: u.u_onset.value };
      for (const mode of ['active', 'classic-off', 'curl-off', 'onset-off']) {
        u.u_classicWave.value = mode === 'classic-off' ? 0 : original.classic;
        u.u_curl.value = mode === 'curl-off' ? 0 : original.curl;
        u.u_onset.value = mode === 'onset-off' ? 0 : original.onset;
        const arms = [];
        for (const flag of [0, 1]) {
          u.u_lipDescent.value = flag;
          arms.push({ surface: xs.flatMap(x => p.curlProbe(x, z - 70, z + 70, 192)), curtain: xs.map(window.probeCurtain) });
        }
        const fields = Object.keys(arms[0].surface[0]);
        let different = 0, maxError = 0;
        for (let i = 0; i < arms[0].surface.length; i++) for (const k of fields) {
          const a = arms[0].surface[i][k], b = arms[1].surface[i][k];
          if (typeof a === 'number' && (!Number.isFinite(a) || !Number.isFinite(b))) throw new Error('nonfinite surface');
          if (a !== b) { different++; maxError = Math.max(maxError, Math.abs(a - b)); }
        }
        const curtainSame = JSON.stringify(arms[0].curtain) === JSON.stringify(arms[1].curtain);
        const inert = mode !== 'active' || u.u_xi.value <= .45;
        if ((inert || !roller) && different) throw new Error(`${preset}/${roller}/${mode}: grid changed ${different} fields`);
        if (inert && !curtainSame) throw new Error(`${preset}/${roller}/${mode}: inert curtain changed`);
        checks.push({ mode, different, maxError, curtainSame, inert });
      }
      return { preset, roller, checks };
    }, { preset, roller });
    matrix.push(result);
    console.log('Verified', preset, 'roller', roller);
  }
  assert.equal(errors.length, 0, 'browser/shader errors');
} finally {
  writeFileSync(`${out}/measurements.json`, JSON.stringify({
    protocol: { kind: 'exact CURTAIN_VERT float GPU pass', samplesPerSheet: 13,
      x: [-84, -52, -20], ageStep: .025, impactAge: .42, endAge: .72,
      note: 'Curve direction and parameter progress are not a fluid-parcel velocity. Post-contact foot follows the moving receiving surface.' },
    sourceHashes: Object.fromEntries(Object.entries(sources).map(([p, s]) => [p, createHash('sha256').update(s).digest('hex')])),
    rows, matrix, seeks, errors,
  }, null, 2));
  await browser.close();
}
console.log('Verified', rows.length, 'matched curtain poses;', matrix.length, 'preset/build combinations;', seeks.length, 'out-of-order seeks');
