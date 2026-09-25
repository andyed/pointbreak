// GPU transect probe for the bore behind the head — the shipped frame and the
// #bore= wedge, as numbers. Pattern: scripts/probe_tube.mjs (MEASUREMENT
// LESSONS 4: no CPU twin; the page's own SURFACE_PRELUDE + SURFACE_GLSL runs
// as a float fragment pass on the live uniforms, textures and clock).
//
// For each rig and clock, shore-normal transects at a sweep of stations x.
// Per source sample: displaced (y, z), model foam, pocket, brk, the lifecycle
// (age, frontZ, impact, bore), the carrier amplitude, and — on a BORE build —
// the wedge gain, its per-crest age and face fraction. The analysis finds the
// first crest inside the line (the wave the lifecycle clocks), its front-face
// trough, H_f = crest - trough (displayed m), and reports:
//   * whiteFrac      — the contiguous run of model foam >= FOAM_THR from the
//                      crest down the front face, as a fraction of H_f: the
//                      Field seat's "bore band / H_f" measured on the surface
//                      instead of on pixels
//   * foamPeakDz     — where the foam maximum sits relative to the crest, m
//                      (negative = seaward, on the back face)
//   * frontDz        — life.y (the shipped bore front) minus the crest z, m
//   * moundM         — the height the structural mound adds at the crest
//                      band (u_moundH 0.5 -> 0, re-read, differenced)
//   * wedgeM         — on a BORE build, the height u_bore adds (1 -> 0)
// Usage: node scripts/probe_bore.mjs [outdir]   (BASE_URL, PLAYWRIGHT_DIR,
// ARMS="default,bore" — each arm is its own boot; RIGS="sewers,secondpeak")
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
let chromium;
for (const path of [process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname].filter(Boolean)) {
  try { ({ chromium } = await import(path)); break; } catch { /* next */ }
}
assert.ok(chromium, 'Set PLAYWRIGHT_DIR to the Playwright index.mjs');
const OUT = resolve(process.argv[2] || 'qa/bore-2026-09-24');
const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:8145';
mkdirSync(OUT, { recursive: true });

const COMMON = 'controls=0&q=high&speed=0&sim=48';
const RIGS = {
  sewers:     { hash: `preset=sewers&month=card&cam=cliff&${COMMON}`, xs: range(-120, 60, 6) },
  secondpeak: { hash: `preset=secondpeak&cam=lookout&day=big&h0=1.4&tide=0.732&${COMMON}`, xs: range(-150, 150, 6) },
};
const ARMS = (process.env.ARMS || 'default,bore').split(',');
const SIMS = (process.env.SIMS || '52,54').split(',').map(Number);
const N = 512, Z0 = -60, Z1 = 80;   // defaults; the station loop re-centres on zb
const FOAM_THR = 0.30;   // model foam at which the fragment's knee+threshold reads ~half white
function range(a, b, step) { const o = []; for (let v = a; v <= b + 1e-9; v += step) o.push(v); return o; }

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 1000, height: 625 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
// Expose the renderer (probe_tube's route trick) so the probe can render to its own target.
const mainSrc = await (await fetch(`${BASE_URL}/web-three/js/main.js`)).text();
const expose = 'camera, controls, state, surferGroup, sprayPoints, uniforms,';
assert.ok(mainSrc.includes(expose), 'main.js expose anchor moved');
await page.route('**/web-three/js/main.js', r => r.fulfill({
  body: mainSrc.replace(expose, expose + ' renderer,'), contentType: 'application/javascript',
}));

async function boot(url) {
  await page.goto('about:blank');
  await page.goto(url);
  await page.waitForFunction(() => window.__pointbreak?.uniforms?.u_time?.value === 48, null, { timeout: 60000 });
  await page.evaluate(async ({ N }) => {
    const THREE = await import('/web-three/vendor/three.module.js');
    const { SURFACE_PRELUDE, SURFACE_GLSL } = await import('/web-three/js/shaders.js');
    const p = window.__pointbreak;
    const bore = !!p.boreBuild;
    const frag = `${SURFACE_PRELUDE}\n${SURFACE_GLSL}\n` +
      'uniform vec4 u_probe;\n' +
      'void main(){\n' +
      '  float i = floor(gl_FragCoord.x);\n' +
      '  float zz = mix(u_probe.y, u_probe.z, i/max(u_probe.w - 1.0, 1.0));\n' +
      '  vec2 xz = vec2(u_probe.x, zz);\n' +
      '  float f, pk, b, c, l, a, k;\n' +
      '  vec3 P = surfacePos(xz, u_time, f, pk, b, c, l, a, k);\n' +
      '  float f2, p2, b2, c2, ca; float hh = ocean(xz, u_time, f2, p2, b2, c2, ca);\n' +
      '  vec4 life = breakerLifecycleAtX(xz.x, u_time);\n' +
      '  float gB = 0.0, ageB = -99.0, fracB = 0.0;\n' +
      (bore ? '  gB = boreWedgeAt(xz, u_time, breakPermissionAt(xz, u_time), ageB, fracB);\n' : '') +
      '  if (gl_FragCoord.y < 1.0)      gl_FragColor = vec4(P.y, P.z, f, pk);\n' +
      '  else if (gl_FragCoord.y < 2.0) gl_FragColor = life;\n' +
      '  else if (gl_FragCoord.y < 3.0) gl_FragColor = vec4(b, ca, breakLine(xz.x), l);\n' +
      '  else gl_FragColor = vec4(gB, ageB, fracB, u_depthMix > 0.5 ? crestCeilM(xz) : -1.0);\n' +
      '}';
    const defines = { ROLLER: 1 };
    if (p.tubeBuild) defines.TUBE = 1;
    if (bore) defines.BORE = 1;
    const material = new THREE.ShaderMaterial({
      uniforms: Object.assign({ u_probe: { value: new THREE.Vector4() } }, p.uniforms),
      defines, vertexShader: 'void main(){gl_Position=vec4(position.xy*2.0,0.0,1.0);}', fragmentShader: frag });
    const scene = new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));
    const rt = new THREE.WebGLRenderTarget(N, 4, { type: THREE.FloatType, depthBuffer: false,
      minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    const cam = new THREE.Camera();
    window.probeBore = (x, z0, z1) => {
      material.uniforms.u_probe.value.set(x, z0, z1, N);
      const prev = p.renderer.getRenderTarget();
      p.renderer.setRenderTarget(rt); p.renderer.render(scene, cam);
      const a = new Float32Array(N * 4 * 4);
      p.renderer.readRenderTargetPixels(rt, 0, 0, N, 4, a);
      p.renderer.setRenderTarget(prev);
      const out = [];
      for (let i = 0; i < N; i++) {
        const g = i * 4, m = (N + i) * 4, c = (2 * N + i) * 4, r = (3 * N + i) * 4;
        out.push({ z0: z0 + (z1 - z0) * i / (N - 1), y: a[g], z: a[g + 1], foam: a[g + 2], pocket: a[g + 3],
          age: a[m], frontZ: a[m + 1], impact: a[m + 2], bore: a[m + 3],
          brk: a[c], amp: a[c + 1], zb: a[c + 2], land: a[c + 3],
          gB: a[r], ageB: a[r + 1], fracB: a[r + 2], ceil: a[r + 3] });
      }
      return out;
    };
  }, { N });
}

async function transect(x, sim, overrides, z0 = Z0, z1 = Z1) {
  return page.evaluate(async ({ x, sim, overrides, Z0, Z1 }) => {
    const p = window.__pointbreak;
    const saved = {};
    for (const [k, v] of Object.entries(overrides)) { saved[k] = p.uniforms[k].value; p.uniforms[k].value = v; }
    p.setSim(sim);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (Math.abs(p.uniforms.u_time.value - sim) > 1e-5) throw new Error('clock mismatch');
    const tr = window.probeBore(x, Z0, Z1);
    for (const [k, v] of Object.entries(saved)) p.uniforms[k].value = v;
    return { tr, T: p.state.T, H0: p.state.H0, xi: p.state.xi, vis: p.uniforms.u_vis.value };
  }, { x, sim, overrides, Z0: z0, Z1: z1 });
}

// The first crest inside the line: the y-maximum over source z in
// [zb - 4, zb + 0.9 * local period run]; then its front-face trough (the y
// minimum shoreward of it before y rises again by 10 % of the range).
function analyse(tr, T) {
  const zb = tr[0].zb;
  const cSlow = 3.5;  // m/s lower bound on the crest's run so the window holds one crest
  const cand = tr.filter(s => s.z0 >= zb - 4 && s.z0 <= zb + cSlow * T * 0.9 && s.land < 0.5);
  if (!cand.length) return null;
  // the crest of THIS lifecycle's wave: the max y whose front face lies ahead
  const iC = cand.reduce((b, s, i) => s.y > cand[b].y ? i : b, 0);
  const crest = cand[iC];
  let iT = iC, best = crest.y;
  for (let i = iC + 1; i < cand.length; i++) { if (cand[i].y < best) { best = cand[i].y; iT = i; } else if (cand[i].y > best + 0.10 * (crest.y - best) && crest.y - best > 0.05) break; }
  const trough = cand[iT];
  const Hf = crest.y - trough.y;
  const face = cand.slice(iC, iT + 1);
  // contiguous run of foam >= thr from the crest down the face
  const run = thr => { let end = crest; for (const s of face) { if (s.foam >= thr) end = s; else break; } return end; };
  const e30 = run(0.30), e15 = run(0.15);
  const foamPeak = face.reduce((b, s) => s.foam > b.foam ? s : b, face[0]);
  const backPeak = cand.slice(Math.max(0, iC - 60), iC).reduce((b, s) => s.foam > b.foam ? s : b, cand[Math.max(0, iC - 60)] || crest);
  return {
    zb, age: crest.age, frontZ: crest.frontZ, impact: crest.impact, bore: crest.bore, brk: crest.brk,
    crestZ0: crest.z0, crestZ: crest.z, crestY: crest.y, troughZ: trough.z, troughY: trough.y, Hf, amp: crest.amp,
    ceil: crest.ceil, faceRunM: trough.z - crest.z,
    frontDz: crest.frontZ - crest.z0,
    whiteFrac30: Hf > 0.05 ? (crest.y - e30.y) / Hf : null,
    whiteFrac15: Hf > 0.05 ? (crest.y - e15.y) / Hf : null,
    foamAtCrest: crest.foam, foamPeak: foamPeak.foam, foamPeakDz: foamPeak.z0 - crest.z0,
    backFoamPeak: backPeak.foam, backFoamPeakDz: backPeak.z0 - crest.z0,
    gB: crest.gB, ageB: face.length > 3 ? face[3].ageB : crest.ageB, wedgeGainMax: Math.max(...face.map(s => s.gB)),
  };
}

const results = { baseUrl: BASE_URL, sims: SIMS, foamThr: FOAM_THR, arms: {} };
for (const arm of ARMS) {
  results.arms[arm] = {};
  for (const rigName of (process.env.RIGS || 'sewers,secondpeak').split(',')) {
    const rig = RIGS[rigName];
    const flag = arm === 'default' ? '' : arm.split('+').map(f => '&' + f.replace(/^&/, '')).join('');
    await boot(`${BASE_URL}/web-three/#${rig.hash}${flag}`);
    const isBore = await page.evaluate(() => !!window.__pointbreak.boreBuild);
    assert.equal(isBore, flag.includes('bore='), `build flag matches arm ${arm}`);
    const rows = [];
    for (const sim of SIMS) {
      for (const x of rig.xs) {
        // The line's z is a property of the station (Sewers sits near z = -230,
        // Second Peak near 0): read zb from a coarse pass, then sample a fine
        // window from just seaward of the line to one period's run inside it.
        const coarse = await transect(x, sim, {}, -320, 320);
        const zbHere = coarse.tr[0].zb;
        const zLo = zbHere - 15, zHi = zbHere + 125;
        const base = await transect(x, sim, {}, zLo, zHi);
        const a = analyse(base.tr, base.T);
        if (process.env.DEBUG && (!a || a.brk < 0.3 || a.Hf < 0.05)) console.log(`  reject x=${x}: ${a ? `brk ${a.brk.toFixed(2)} Hf ${a.Hf.toFixed(2)} age ${a.age.toFixed(2)} crestZ0 ${a.crestZ0.toFixed(1)} zb ${a.zb.toFixed(1)}` : 'no candidates (land or window)'}`);
        if (!a || a.brk < 0.3 || a.Hf < 0.05) continue;
        // mound and wedge heights by differencing at the same source samples
        const noMound = await transect(x, sim, { u_moundH: 0 }, zLo, zHi);
        const iC = base.tr.findIndex(s => s.z0 === a.crestZ0);
        const band = (t2) => { let m = 0; for (let i = Math.max(0, iC - 20); i < Math.min(base.tr.length, iC + 60); i++) m = Math.max(m, base.tr[i].y - t2.tr[i].y); return m; };
        a.moundM = band(noMound);
        if (isBore) {
          const noWedge = await transect(x, sim, { u_bore: 0 }, zLo, zHi);
          a.wedgeM = band(noWedge);
          const aOff = analyse(noWedge.tr, base.T);
          a.whiteFrac30_off = aOff?.whiteFrac30 ?? null;
          a.HfOff = aOff?.Hf ?? null;
        }
        rows.push({ sim, x, ...a, T: base.T, H0: base.H0, xi: base.xi, vis: base.vis });
      }
    }
    results.arms[arm][rigName] = rows;
    const brief = rows.map(r => ({ sim: r.sim, x: r.x, age: +r.age.toFixed(2), Hf: +r.Hf.toFixed(2), frontDz: +r.frontDz.toFixed(1),
      foamCrest: +r.foamAtCrest.toFixed(2), fpkDz: +r.foamPeakDz.toFixed(1), bkPk: +r.backFoamPeak.toFixed(2), bkDz: +r.backFoamPeakDz.toFixed(1),
      w30: r.whiteFrac30 === null ? null : +r.whiteFrac30.toFixed(2), w15: r.whiteFrac15 === null ? null : +r.whiteFrac15.toFixed(2),
      mound: +r.moundM.toFixed(2), wedge: r.wedgeM === undefined ? null : +r.wedgeM.toFixed(2), gB: +r.wedgeGainMax.toFixed(2), ageB: +r.ageB.toFixed(2),
      w30off: r.whiteFrac30_off === undefined ? null : (r.whiteFrac30_off === null ? null : +r.whiteFrac30_off.toFixed(2)) }));
    console.log(`\n== ${arm} / ${rigName} (T ${rows[0]?.T}, H0 ${rows[0]?.H0}, xi ${rows[0]?.xi}) ==`);
    console.table(brief);
  }
}
writeFileSync(`${OUT}/probe.json`, JSON.stringify(results, null, 1));
await browser.close();
if (errors.length) { console.error('BROWSER ERRORS:\n' + errors.join('\n')); process.exit(1); }
console.log(`wrote ${OUT}/probe.json`);
