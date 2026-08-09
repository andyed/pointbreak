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
  'u_sections', 'u_dF', 'u_tau', 'u_chop', 'u_aframe', 'u_view']) {
  U[name] = gl.getUniformLocation(prog, name);
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
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
