// Shared harness for the impact-plume rigs (probe_crash.mjs, capture_crash_ab.mjs).
//
// Two things live here so both rigs read the same instrument:
//   * the Playwright / pngjs lookup used by every sibling rig (ancestor walk
//     through node_modules and the psychodeli-webgl-port sibling), and
//   * installPlumeProbe — a browser-side function that compiles the EXACT
//     PLUME_VERT text as a float readback pass over the page's live uniforms
//     (measure_lip_descent.mjs's method for CURTAIN_VERT). No CPU copy of the
//     wave equations: the numbers reported are the puff centres the GPU
//     places (memory lesson: claims about the picture come from GPU readback
//     or opened frames, never from model-js).
//
// The plume material binds u_roller to u_crash (main.js ensurePlumeMesh), so
// the probe does the same: strength read here is the plume's own.
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const walk = (rel) => {
  const out = [];
  for (let d = ROOT; ; d = dirname(d)) {
    out.push(join(d, 'node_modules', rel));
    out.push(join(d, 'psychodeli-webgl-port/node_modules', rel));
    if (dirname(d) === d) break;
  }
  return out;
};
async function firstImport(cands, name) {
  for (const c of cands.filter(Boolean)) {
    try { return await import(c); } catch { /* next */ }
  }
  console.error(`${name} not found. Set PLAYWRIGHT_DIR / PNGJS_DIR to the module's index file.`);
  process.exit(1);
}
export async function loadChromium() {
  return (await firstImport([process.env.PLAYWRIGHT_DIR, ...walk('playwright/index.mjs')], 'playwright')).chromium;
}
export async function loadPNG() {
  const m = await firstImport([process.env.PNGJS_DIR, ...walk('pngjs/lib/png.js')], 'pngjs');
  return m.PNG || m.default?.PNG;
}

// Number of arch samples per station: puffs are placed at s = i/(N-1) with
// every random fixed at 0.5 (no radial/along-line/tumble offset), so the
// readback is the arch's spine — the centre line the cluster is built around.
export const PLUME_SAMPLES = 17;

// Runs inside the page. Installs window.probePlume(x) -> {spine, lip, contact,
// land, shape}. `routeRenderer` must have exposed `renderer` first.
export async function installPlumeProbe(samples) {
  const THREE = await import('/web-three/vendor/three.module.js');
  const { PLUME_VERT } = await import('/web-three/js/shaders.js');
  const p = window.__pointbreak;
  if (!p.renderer) throw new Error('renderer not exposed on __pointbreak (route main.js)');
  let frag = PLUME_VERT
    .replace('attribute vec4 aPuff;', 'vec4 aPuff;')
    .replace('attribute vec4 aPuff2;', 'vec4 aPuff2;')
    .replace('varying float vPlA;', 'float vPlA;')
    .replace('varying vec2  vPlUV;', 'vec2 vPlUV;')
    .replace('varying vec3  vPlSeed;', 'vec3 vPlSeed;')
    .replace('varying vec3  vPlSunV;', 'vec3 vPlSunV;');
  const entry = 'void main(){\n#ifdef ROLLER\n';
  if (!frag.includes(entry)) throw new Error('PLUME_VERT entry anchor changed');
  frag = frag.replace(entry, 'uniform float u_probeX;\n' + entry +
    `  aPuff = vec4(u_probeX, floor(gl_FragCoord.x)/${(samples - 1).toFixed(1)}, 0.5, 0.5);\n` +
    '  aPuff2 = vec4(0.5);\n');
  // No vertex id in a fragment pass: the probe reads centres, so the corner is moot.
  const cornerLine = 'vec2 corner0 = vec2((gl_VertexID == 1 || gl_VertexID == 2) ? 1.0 : -1.0, (gl_VertexID >= 2) ? 1.0 : -1.0);';
  if (!frag.includes(cornerLine)) throw new Error('PLUME_VERT corner anchor changed');
  frag = frag.replace(cornerLine, 'vec2 corner0 = vec2(0.0);');
  // A dead station returns early in the mesh; the probe must still write its rows.
  const dead = 'vPlA = 0.0;\n    gl_Position = vec4(0.0, 0.0, 2.0, 1.0);\n    return;';
  if (!frag.includes(dead)) throw new Error('PLUME_VERT dead-station anchor changed');
  frag = frag.replace(dead, 'gl_FragColor = vec4(0.0);\n' +
    '    if (gl_FragCoord.y >= 2.0 && gl_FragCoord.y < 3.0) gl_FragColor = land;\n' +
    '    if (gl_FragCoord.y >= 4.0) gl_FragColor = vec4(env, 0.0);\n    return;');
  const final = 'vPlA = gate;\n  gl_Position = projectionMatrix*mv;';
  if (!frag.includes(final)) throw new Error('PLUME_VERT gl_Position anchor changed');
  frag = frag.replace(final,
    'if (gl_FragCoord.y < 1.0) gl_FragColor = vec4(C, gate);\n' +
    '  else if (gl_FragCoord.y < 2.0) gl_FragColor = vec4(Plip, radius);\n' +
    '  else if (gl_FragCoord.y < 3.0) gl_FragColor = land;\n' +
    '  else if (gl_FragCoord.y < 4.0) gl_FragColor = vec4(Pcon, H);\n' +
    '  else gl_FragColor = vec4(env, zcNow);');
  // A fragment pass has no modelViewMatrix: the sun stays in the stage frame
  // and the billboard offset is dropped (the probe reads centres, not corners).
  const sunLine = 'vPlSunV = normalize(mat3(modelViewMatrix)*PLUME_SUN);';
  const mvLine = 'vec4  mv = modelViewMatrix*vec4(C, 1.0);\n  mv.xy += corner*radius;';
  if (!frag.includes(sunLine) || !frag.includes(mvLine)) throw new Error('PLUME_VERT view-space anchors changed');
  frag = frag.replace(sunLine, 'vPlSunV = PLUME_SUN;').replace(mvLine, 'vec4 mv = vec4(C, 1.0);');
  // The #else arm writes gl_Position too; in a ROLLER compile it is dead text.
  frag = frag.replace('gl_Position = vec4(0.0, 0.0, 2.0, 1.0);   // off-screen', 'gl_FragColor = vec4(0.0);   // off-screen');
  const uniforms = Object.assign({}, p.uniforms, { u_roller: p.uniforms.u_crash, u_probeX: { value: 0 } });
  // Same private defines as main.js ensurePlumeMesh: ROLLER for the landing
  // helpers, TUBE for the profile's bpReach (the contact anchor, 2026-09-24).
  const material = new THREE.ShaderMaterial({
    uniforms, defines: { ROLLER: 1, TUBE: 1 }, fragmentShader: frag,
    vertexShader: 'void main(){ gl_Position = vec4(position.xy*2.0, 0.0, 1.0); }',
  });
  const scene = new THREE.Scene().add(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material));
  const rt = new THREE.WebGLRenderTarget(samples, 5, {
    type: THREE.FloatType, depthBuffer: false,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter,
  });
  const camera = new THREE.Camera();
  window.probePlume = (x) => {
    uniforms.u_probeX.value = x;
    const previous = p.renderer.getRenderTarget();
    p.renderer.setRenderTarget(rt);
    p.renderer.render(scene, camera);
    const a = new Float32Array(samples * 5 * 4);
    p.renderer.readRenderTargetPixels(rt, 0, 0, samples, 5, a);
    p.renderer.setRenderTarget(previous);
    const row = (r) => [...a.slice(r * samples * 4, (r + 1) * samples * 4)];
    const pts = row(0), lip = row(1), land = row(2), con = row(3), env = row(4);
    return {
      // puff centres along the arch spine, s = 0 (lip) .. 1 (contact); a = alpha gate
      spine: Array.from({ length: samples }, (_, i) => ({
        x: pts[i * 4], y: pts[i * 4 + 1], z: pts[i * 4 + 2], a: pts[i * 4 + 3], radius: lip[i * 4 + 3] })),
      lip: { x: lip[0], y: lip[1], z: lip[2] },                 // surfacePos at the live crest source
      contact: { x: con[0], y: con[1], z: con[2] },             // surfacePos at zc + PLUME_REACH_HC*hC
      land: { zL: land[0], hC: land[1], tauD: land[2], strength: land[3] },
      shape: { H: con[3], envelope: env[0], life: env[1], gate: env[2], zcNow: env[3] },
    };
  };
  return true;
}

export const EXPOSE = 'camera, controls, state, surferGroup, sprayPoints, uniforms,';

// Route main.js so the renderer is reachable; every other byte is the tree's.
export async function routeRenderer(page, mainSource) {
  if (!mainSource.includes(EXPOSE)) throw new Error('__pointbreak expose anchor changed');
  await page.route('**/web-three/js/main.js', (r) => r.fulfill({
    body: mainSource.replace(EXPOSE, EXPOSE + ' renderer,'), contentType: 'application/javascript',
  }));
}

// Seek the page to sim t and wait for two frames so the readback sees it.
export async function seek(page, t) {
  await page.evaluate(async (t) => {
    window.__pointbreak.setSim(t);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (Math.abs(window.__pointbreak.uniforms.u_time.value - t) > 1e-5) throw new Error('clock mismatch');
  }, t);
}

export const CRASH_PEAK_S = 0.42;   // mirrors shared/model-glsl.js; the rigs only convert tauD to age
