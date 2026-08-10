// pointbreak web-three — M0: displaced PlaneGeometry over the shared model
// GLSL. Rate-independent like web/: simulation time advances by wall dt *
// state.speed and is the only clock the shaders see.
//
// Params + presets are imported straight from web/ (single source of truth);
// keys 1-7 / space / S / V match web/'s bindings, with V cycling camera
// presets (Free -> Cliff -> Drone) instead of toggling two views.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { makeState, applyPreset, PRESETS } from '../../web/js/params.js';
import { GRID_VERT, GRID_FRAG } from './shaders.js';

// ---------- stage ----------
// ~600x500 m world window, same coordinates as web/: x along the coast
// (zipper peels +x), z shoreward. Centered on the break at the origin, biased
// +10 m shoreward to match web/'s drone framing (z = -uv.y*170 + 10).
const STAGE_W = 600, STAGE_D = 500, STAGE_Z0 = 10;
const SEG_X = 512, SEG_Z = 384;

const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
} catch (e) {
  document.getElementById('nogl').style.display = 'block';
  throw e;
}
// cap DPR: ~1M ocean() evals per frame in the vertex stage, retina x2 adds
// nothing at landscape scale (same rationale as web/)
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x8ea2b0);   // marine-layer grey until M1 brings a sky

const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 5000);

const state = makeState();

// ---------- the grid ----------
// PlaneGeometry is authored in XY; rotate onto XZ (y up) then shift so
// position.xz is the model coordinate directly — the vertex shader displaces
// y and never needs a separate model transform to stay in sync with web/.
const geo = new THREE.PlaneGeometry(STAGE_W, STAGE_D, SEG_X, SEG_Z);
geo.rotateX(-Math.PI / 2);
geo.translate(0, 0, STAGE_Z0);

const uniforms = {
  u_time:     { value: 0 },
  u_cell:     { value: new THREE.Vector2(STAGE_W / SEG_X, STAGE_D / SEG_Z) },
  u_T:        { value: state.T },
  u_H0:       { value: state.H0 },
  u_alpha:    { value: state.alpha * Math.PI / 180 },
  u_xi:       { value: state.xi },
  u_sections: { value: state.sections },
  u_dF:       { value: state.dF },
  u_tau:      { value: state.tau },
  u_chop:     { value: state.chop },
  u_aframe:   { value: state.aframe },
  u_surfer:   { value: state.surfer },
};

const mat = new THREE.ShaderMaterial({
  vertexShader: GRID_VERT,
  fragmentShader: GRID_FRAG,
  uniforms,
  side: THREE.DoubleSide,   // free camera can dive below the surface
});
scene.add(new THREE.Mesh(geo, mat));

// ---------- cameras ----------
// JS-side break line for camera placement only (sections omitted — cameras
// shouldn't jitter when the sections slider moves). Mirrors breakLine().
function breakLineJS(x) {
  const a = Math.min(Math.max(state.alpha * Math.PI / 180, 0.06), 1.45);
  const xx = state.aframe ? Math.abs(x) : x;
  return Math.tan(a) * xx - xx * xx / 5000;
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxDistance = 2000;

// Cliff = web/'s cliff camera (16 m over the point, shooting the lineup);
// Drone = high near-top-down matching web/'s ortho drone window (~±170 m in
// z at fov 50 -> height ≈ 170/tan(25°) ≈ 365 m; slight z offset keeps the
// look-at well-conditioned and puts seaward at the top of frame like web/).
const CAM_PRESETS = [
  { name: 'Free',  pos: () => [-140, 55, -230],                              target: () => [40, 0, 40] },
  { name: 'Cliff', pos: () => [210, 16, breakLineJS(210) - 45],              target: () => [-120, 3, breakLineJS(-120) - 10] },
  { name: 'Drone', pos: () => [0, 365, STAGE_Z0 + 40],                       target: () => [0, 0, STAGE_Z0] },
];
let camIdx = 0;

function applyCam(i) {
  camIdx = i;
  const p = CAM_PRESETS[i];
  camera.position.set(...p.pos());
  controls.target.set(...p.target());
  controls.update();
  refreshHUD();
}

// ---------- HUD ----------
const hudPreset = document.getElementById('hudPreset');
const hudCam = document.getElementById('hudCam');
function refreshHUD() {
  const p = state.preset ? PRESETS[state.preset].label : 'custom';
  hudPreset.textContent = state.paused ? p + ' (paused)' : p;
  hudCam.textContent = CAM_PRESETS[camIdx].name;
}

// ---------- keyboard (parity with web/) ----------
const presetKeys = Object.keys(PRESETS);
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= presetKeys.length) { applyPreset(state, presetKeys[n - 1]); refreshHUD(); return; }
  if (e.key === 'v' || e.key === 'V') applyCam((camIdx + 1) % CAM_PRESETS.length);
  if (e.key === 's' || e.key === 'S') state.surfer = 1 - state.surfer;
  if (e.key === ' ') { state.paused = !state.paused; refreshHUD(); e.preventDefault(); }
  if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('hidepanel');
});

// ---------- resize ----------
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
  }
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- loop ----------
let simTime = 0;
let last = performance.now();

function frame(now) {
  const dt = Math.min((now - last) / 1000, 0.1);   // clamp tab-switch jumps
  last = now;
  if (!state.paused && Number.isFinite(dt)) simTime += dt * state.speed;

  resize();
  uniforms.u_time.value = simTime;
  uniforms.u_T.value = state.T;
  uniforms.u_H0.value = state.H0;
  uniforms.u_alpha.value = state.alpha * Math.PI / 180;
  uniforms.u_xi.value = state.xi;
  uniforms.u_sections.value = state.sections;
  uniforms.u_dF.value = state.dF;
  uniforms.u_tau.value = state.tau;
  uniforms.u_chop.value = state.chop;
  uniforms.u_aframe.value = state.aframe;
  uniforms.u_surfer.value = state.surfer;

  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

applyCam(0);
refreshHUD();
resize();
requestAnimationFrame(frame);
