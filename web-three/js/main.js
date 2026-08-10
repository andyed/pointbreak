// pointbreak web-three — M1: displaced PlaneGeometry over the shared model
// GLSL with the full shading pass (detail normals, fresnel+glitter, sss,
// foam-in-surface, aerial perspective). Rate-independent like web/: simulation
// time advances by wall dt * state.speed and is the only clock the shaders see.
//
// Params + presets are imported straight from web/ (single source of truth);
// keys 1-7 / space / S / V match web/'s bindings, with V cycling camera
// presets (Free -> Cliff -> Drone) instead of toggling two views.

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';
import { makeState, applyPreset, PRESETS, describeGeoState } from '../../web/js/params.js';
import { GRID_VERT, GRID_FRAG, SKY_VERT, SKY_FRAG } from './shaders.js';
import { makeSurferMesh, updateSurfer } from './surfer.js';
import { coastCurve } from './model-js.js';

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
scene.background = new THREE.Color(0xdfe3e5);   // horizon grey fallback behind the sky dome

const camera = new THREE.PerspectiveCamera(50, 1, 0.5, 5000);

const state = makeState();

// ---------- the grid ----------
// PlaneGeometry is authored in XY; rotate onto XZ (y up) then shift so
// position.xz is the model coordinate directly — the vertex shader displaces
// y and never needs a separate model transform to stay in sync with web/.
const geo = new THREE.PlaneGeometry(STAGE_W, STAGE_D, SEG_X, SEG_Z);
geo.rotateX(-Math.PI / 2);
geo.translate(0, 0, STAGE_Z0);

// Far skirt (spec Shading 5: "plane extends past fog distance"): the outer
// 20% of grid parameter space is stretched from the stage edge out to
// FAR_EXTENT, C1-continuous at the core boundary (linear slope flows into a
// quadratic tail) so cell density has no visible kink. The vertex shader
// fades displacement out there — big cells can't sample the carrier — and
// fog finishes the job before the geometry ends.
const CORE = 0.8, FAR_EXTENT = 4000;
function stretchAxis(v, half) {
  const n = v / half, a = Math.abs(n), s = Math.sign(n);
  if (a <= CORE) return s * a * (half / CORE);          // core keeps the stage
  const m = a - CORE, slope = half / CORE;
  const A = (FAR_EXTENT - half - slope * (1 - CORE)) / ((1 - CORE) * (1 - CORE));
  return s * (half + slope * m + A * m * m);
}
{
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, stretchAxis(pos.getX(i), STAGE_W / 2));
    pos.setZ(i, STAGE_Z0 + stretchAxis(pos.getZ(i) - STAGE_Z0, STAGE_D / 2));
  }
  geo.computeBoundingSphere();
}

const uniforms = {
  u_time:     { value: 0 },
  // FD normal step = one CORE cell (the stretch leaves 80% of segments on the stage)
  u_cell:     { value: new THREE.Vector2(STAGE_W / (SEG_X * CORE), STAGE_D / (SEG_Z * CORE)) },
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
  u_geoMix:   { value: state.geoMix },
  u_contourFit: { value: new THREE.Vector2(state.contourX2, state.contourX3) },
  u_stageBounds: { value: new THREE.Vector2(state.stageStart, state.stageEnd) },
};

const mat = new THREE.ShaderMaterial({
  vertexShader: GRID_VERT,
  fragmentShader: GRID_FRAG,
  uniforms,
  side: THREE.DoubleSide,   // free camera can dive below the surface
});
scene.add(new THREE.Mesh(geo, mat));

// ---------- sky dome ----------
// Same procedural marine-layer sky the water reflects and fogs toward, drawn
// inside-out. depthWrite off so the water always paints over it; re-centered
// on the camera each frame so vertex position doubles as view direction.
const skyMat = new THREE.ShaderMaterial({
  vertexShader: SKY_VERT,
  fragmentShader: SKY_FRAG,
  uniforms: { u_time: uniforms.u_time },   // shared clock object — one sim time
  side: THREE.BackSide,
  depthWrite: false,
});
const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(4200, 48, 24), skyMat);
skyMesh.frustumCulled = false;   // it surrounds the camera by construction
scene.add(skyMesh);

// ---------- the surfer (M3) ----------
// Procedural low-poly rider behind the S toggle (default off). Pose comes
// from model-js.js — the JS twin of the shader model — so the board tracks
// the same displaced surface the vertex shader draws. The wake foam is the
// model's own u_surfer path; it lines up because both read surferState.
const surferGroup = makeSurferMesh();
scene.add(surferGroup);

// snapshot of the model uniforms for the JS twin (alpha already in radians)
function modelP() {
  return {
    T: state.T, H0: state.H0, alphaRad: state.alpha * Math.PI / 180,
    xi: state.xi, sections: state.sections, dF: state.dF,
    chop: state.chop, aframe: state.aframe,
    geoMix: state.geoMix, contourX2: state.contourX2, contourX3: state.contourX3,
    stageStart: state.stageStart, stageEnd: state.stageEnd,
  };
}

// ---------- cameras ----------
// JS-side break line for camera placement only (sections omitted — cameras
// shouldn't jitter when the sections slider moves). Mirrors breakLine().
function breakLineJS(x) {
  const a = Math.min(Math.max(state.alpha * Math.PI / 180, 0.06), 1.45);
  const xx = state.aframe ? Math.abs(x) : x;
  return Math.tan(a) * xx - coastCurve(x, modelP());
}

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.maxDistance = 2000;

// Cliff = web/'s cliff camera (16 m over the point, shooting the lineup);
// Drone = high near-top-down matching web/'s ortho drone window (~±170 m in
// z at fov 50 -> height ≈ 170/tan(25°) ≈ 365 m; slight z offset keeps the
// look-at well-conditioned and puts seaward at the top of frame like web/).
// Follow = web/'s surfer-follow cliff shot: telephoto from the point, target
// tracking surferState, zoom ∝ 1/distance (updated per-frame in the loop —
// the pos/target here only seed the switch-in frame).
const CAM_PRESETS = [
  { name: 'Free',   pos: () => [-140, 55, -230],                              target: () => [40, 0, 40] },
  { name: 'Cliff',  pos: () => [210, 16, breakLineJS(210) - 45],              target: () => [-120, 3, breakLineJS(-120) - 10] },
  { name: 'Drone',  pos: () => [0, 365, STAGE_Z0 + 40],                       target: () => [0, 0, STAGE_Z0] },
  { name: 'Follow', pos: () => [210, 16, breakLineJS(210) - 45],              target: () => [0, 2, breakLineJS(0) - 11] },
];
let camIdx = 0;
const BASE_FOV = 50;

function applyCam(i) {
  camIdx = i;
  const p = CAM_PRESETS[i];
  camera.position.set(...p.pos());
  controls.target.set(...p.target());
  // Follow owns the camera every frame; OrbitControls would fight the track.
  // Leaving Follow restores free orbiting and the wide field of view.
  controls.enabled = p.name !== 'Follow';
  if (p.name !== 'Follow') { camera.fov = BASE_FOV; camera.updateProjectionMatrix(); }
  controls.update();
  refreshHUD();
}

// per-frame Follow update: telephoto tracking, zoom ∝ 1/distance (web/ parity:
// zoom factor clamp(1500/dist, 2, 6.5); fov = 2*atan(1/zoom) is the same
// mapping web/'s ray basis rd = fw*zoom + ... encodes)
function updateFollowCam(sWorld) {
  const cx = 210, cz = breakLineJS(210) - 45;
  camera.position.set(cx, 16, cz);
  const dist = Math.hypot(sWorld.x - cx, sWorld.z - cz);
  const zoom = Math.min(Math.max(1500 / Math.max(dist, 40), 2.0), 6.5);
  camera.fov = 2 * Math.atan(1 / zoom) * 180 / Math.PI;
  camera.updateProjectionMatrix();
  controls.target.set(sWorld.x, 2.0, sWorld.z);   // web/ aims at (x, 2, z)
  camera.lookAt(controls.target);
}

// ---------- HUD ----------
const hudPreset = document.getElementById('hudPreset');
const hudCam = document.getElementById('hudCam');
const hudSurfer = document.getElementById('hudSurfer');
const hudGeo = document.getElementById('hudGeo');
function refreshHUD() {
  const p = state.preset ? PRESETS[state.preset].label : 'custom';
  hudPreset.textContent = state.paused ? p + ' (paused)' : p;
  hudCam.textContent = CAM_PRESETS[camIdx].name;
  hudSurfer.textContent = state.surfer ? 'on' : 'off';
  hudGeo.textContent = describeGeoState(state);
}

// ---------- keyboard (parity with web/) ----------
const presetKeys = Object.keys(PRESETS);
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const n = parseInt(e.key, 10);
  if (n >= 1 && n <= presetKeys.length) { applyPreset(state, presetKeys[n - 1]); refreshHUD(); return; }
  if (e.key === 'v' || e.key === 'V') applyCam((camIdx + 1) % CAM_PRESETS.length);
  if (e.key === 's' || e.key === 'S') { state.surfer = 1 - state.surfer; refreshHUD(); }
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
  uniforms.u_geoMix.value = state.geoMix;
  uniforms.u_contourFit.value.set(state.contourX2, state.contourX3);
  uniforms.u_stageBounds.value.set(state.stageStart, state.stageEnd);

  // surfer pose + Follow camera share one surferState/surfaceAt evaluation.
  // The follow shot tracks the ride line even with the rider hidden (S off)
  // so V-cycling never lands on a dead camera.
  const following = CAM_PRESETS[camIdx].name === 'Follow';
  surferGroup.visible = state.surfer === 1;
  if (surferGroup.visible || following) {
    const sWorld = updateSurfer(surferGroup, simTime, modelP());
    if (following) updateFollowCam(sWorld);
  }

  // OrbitControls.update() re-derives position from its spherical state and
  // would undo the follow track (enabled=false only blocks input, not update)
  if (!following) controls.update();
  skyMesh.position.copy(camera.position);   // keep the dome centered on the eye
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

applyCam(0);
refreshHUD();
resize();
requestAnimationFrame(frame);

// headless-capture/debug hook: Playwright verification drives the free camera,
// reads rider state, and can jump the sim clock (e.g. straight to mid-ride)
// through this. Not a public API — the UI stays keyboard-led.
window.__pointbreak = {
  camera, controls, state, surferGroup, uniforms,
  sim: () => simTime,
  setSim: (t) => { if (Number.isFinite(t)) simTime = t; },
};
