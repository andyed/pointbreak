// pointbreak web — WebGL2 boilerplate + render loop.
// Rate-independent: simulation time advances by wall dt * state.speed and is
// the only clock the shader sees.

import { VERT, FRAG } from './shaders.js';
import { makeState } from './params.js';
import { buildUI } from './ui.js';

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', { antialias: false });
if (!gl) {
  document.getElementById('nogl').style.display = 'block';
  throw new Error('WebGL2 unavailable');
}

function compile(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error('shader: ' + gl.getShaderInfoLog(s));
  }
  return s;
}

const prog = gl.createProgram();
gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
  throw new Error('link: ' + gl.getProgramInfoLog(prog));
}
gl.useProgram(prog);

// fullscreen triangle
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
const buf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, buf);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

const U = {};
for (const name of ['u_res', 'u_time', 'u_T', 'u_H0', 'u_alpha', 'u_xi',
  'u_sections', 'u_dF', 'u_tau', 'u_chop', 'u_aframe', 'u_view', 'u_surfer',
  'u_geoMix', 'u_contourFit', 'u_stageBounds',
  // The raymarcher is the reference implementation and stays depth-free:
  // u_depthMix = 0 collapses every seabed term in model-glsl.js back to the
  // synthetic stand-ins. The sampler is still bound to a 1x1 texture because
  // an unbound sampler is undefined behaviour, not a no-op.
  'u_bed', 'u_depthMix', 'u_bedRect', 'u_bedSize', 'u_bedElev', 'u_waterLevel',
  'u_bedShape', 'u_bedPlane', 'u_rideOffset',
  'u_breakTex', 'u_breakMix', 'u_breakX', 'u_breakZ', 'u_surferPos',
]) {
  U[name] = gl.getUniformLocation(prog, name);
}

// 1x1 placeholder on unit 0 so u_bed is never an unbound sampler.
{
  const bedTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, bedTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
                new Uint8Array([0, 0, 0, 255]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

const state = makeState();
buildUI(state, () => { /* uniforms read every frame; nothing to do eagerly */ });

// cap DPR: this is a fullscreen fragment raymarch, retina x2 is wasted heat
const DPR = Math.min(window.devicePixelRatio || 1, 1.5);
function resize() {
  const w = Math.floor(canvas.clientWidth * DPR);
  const h = Math.floor(canvas.clientHeight * DPR);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w; canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}
window.addEventListener('resize', resize);

let simTime = 0;
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1); // clamp tab-switch jumps
  last = now;
  if (!state.paused && Number.isFinite(dt)) simTime += dt * state.speed;

  resize();
  gl.uniform2f(U.u_res, canvas.width, canvas.height);
  gl.uniform1f(U.u_time, simTime);
  gl.uniform1f(U.u_T, state.T);
  gl.uniform1f(U.u_H0, state.H0);
  gl.uniform1f(U.u_alpha, state.alpha * Math.PI / 180);
  gl.uniform1f(U.u_xi, state.xi);
  gl.uniform1f(U.u_sections, state.sections);
  gl.uniform1f(U.u_dF, state.dF);
  gl.uniform1f(U.u_tau, state.tau);
  gl.uniform1f(U.u_chop, state.chop);
  gl.uniform1f(U.u_aframe, state.aframe);
  gl.uniform1f(U.u_view, state.view);
  gl.uniform1f(U.u_surfer, state.surfer);
  gl.uniform1f(U.u_geoMix, state.geoMix);
  gl.uniform2f(U.u_contourFit, state.contourX2, state.contourX3);
  gl.uniform2f(U.u_stageBounds, state.stageStart, state.stageEnd);
  gl.uniform1i(U.u_bed, 0);
  gl.uniform1f(U.u_depthMix, 0.0);
  gl.uniform4f(U.u_bedRect, -1.0, -1.0, 1.0, 1.0);
  gl.uniform2f(U.u_bedSize, 1.0, 1.0);
  gl.uniform2f(U.u_bedElev, -30.0, 30.0);
  gl.uniform1f(U.u_waterLevel, 0.905);
  gl.uniform1f(U.u_bedShape, 0.0);
  gl.uniform3f(U.u_bedPlane, 0.0, 0.0, 0.0);
  gl.uniform1f(U.u_rideOffset, 0.0);   // depth-free reference: authored line stands
  gl.uniform1i(U.u_breakTex, 0);       // same 1x1 placeholder; never sampled
  gl.uniform1f(U.u_breakMix, 0.0);     // M4 is web-three only; this stays authored
  gl.uniform2f(U.u_breakX, -300.0, 300.0);
  gl.uniform2f(U.u_breakZ, -400.0, 400.0);
  gl.uniform4f(U.u_surferPos, 0.0, 0.0, 0.0, 0.0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Read-only capture/debug seam. The canonical values still live in state and
// params.js; this only makes headless verification observable.
window.__pointbreak = { state, uniforms: U };
