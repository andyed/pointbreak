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
import { GRID_VERT, GRID_FRAG, SKY_VERT, SKY_FRAG, BED_VERT, BED_FRAG } from './shaders.js';
import { makeSurferMesh, updateSurfer } from './surfer.js';
import { setAudioEnabled, toggleAudio, isAudioEnabled, updateAudio } from './sound.js';
import { coastCurve, rayS, swellPhi, peelAngleAt,
         oceanH as oceanHJS, surferState as surferStateJS } from './model-js.js';
import { applyBed, EMPTY_BED, MSL_ABOVE_NAVD88, cliffTop, TIDE_RANGE, tideLabel,
         bakeBreakLine, breakZAt, derivedAlphaDeg, BREAK_Z_MIN, BREAK_Z_MAX } from './bed.js';
import { makeSection } from './section.js';

// ---------- stage ----------
// ~600x500 m world window, same coordinates as web/: x along the coast
// (zipper peels +x), z shoreward. Centered on the break at the origin, biased
// +10 m shoreward to match web/'s drone framing (z = -uv.y*170 + 10).
const STAGE_W = 600, STAGE_D = 500, STAGE_Z0 = 10;
const SEG_X = 512, SEG_Z = 384;

const canvas = document.getElementById('gl');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, stencil: false });
} catch (e) {
  document.getElementById('nogl').style.display = 'block';
  throw e;
}
// cap DPR: ~1M ocean() evals per frame in the vertex stage, retina x2 adds
// nothing at landscape scale (same rationale as web/)
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

// Initialize audio on first click anywhere on the page (browser policy)


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
  u_bed:        { value: EMPTY_BED },
  u_depthMix:   { value: 0 },
  u_bedRect:    { value: new THREE.Vector4() },
  u_bedSize:    { value: new THREE.Vector2(1, 1) },
  u_bedElev:    { value: new THREE.Vector2(-30, 30) },
  u_waterLevel: { value: MSL_ABOVE_NAVD88 },
  u_bedShape:   { value: 0 },
  u_bedPlane:   { value: new THREE.Vector3() },
  u_camUnder:   { value: 0 },
  u_rideOffset: { value: 0 },
  u_breakTex:   { value: EMPTY_BED },
  u_breakMix:   { value: 0 },
  u_breakX:     { value: new THREE.Vector2(-300, 300) },
  u_breakZ:     { value: new THREE.Vector2(BREAK_Z_MIN, BREAK_Z_MAX) },
  u_surferPos:  { value: new THREE.Vector4() },
};
applyBed(uniforms, state.geoSpot, state.tide || 0, state.bedShape || 0);

const mat = new THREE.ShaderMaterial({
  vertexShader: GRID_VERT,
  fragmentShader: GRID_FRAG,
  uniforms,
  side: THREE.DoubleSide,   // free camera can dive below the surface
});
scene.add(new THREE.Mesh(geo, mat));

// ---------- the seabed ----------
// Its own surface so the free camera can dive and watch the floor descend.
// A quarter of the water grid's density in each axis: the bed is a smooth
// ~7 m-post field with no ocean() evaluations, so this costs ~1.5% of the
// water pass. Same footprint and skirt stretch, so the two agree at the edges.
const bedGeo = new THREE.PlaneGeometry(STAGE_W, STAGE_D, SEG_X / 4, SEG_Z / 4);
bedGeo.rotateX(-Math.PI / 2);
bedGeo.translate(0, 0, STAGE_Z0);
{
  const pos = bedGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, stretchAxis(pos.getX(i), STAGE_W / 2));
    pos.setZ(i, STAGE_Z0 + stretchAxis(pos.getZ(i) - STAGE_Z0, STAGE_D / 2));
  }
  bedGeo.computeBoundingSphere();
}
const bedMat = new THREE.ShaderMaterial({
  vertexShader: BED_VERT, fragmentShader: BED_FRAG, uniforms,
  side: THREE.DoubleSide,
});
const bedMesh = new THREE.Mesh(bedGeo, bedMat);
scene.add(bedMesh);

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
    rideOffset: uniforms.u_rideOffset.value,
  };
}

// ---------- cameras ----------
// JS-side break line for camera placement only (sections omitted — cameras
// shouldn't jitter when the sections slider moves). Mirrors breakLine().
function breakLineJS(x) {
  return -coastCurve(x, modelP());   // the break line is the contour (MODEL.md 2.3)
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
// Cliff/Follow stand on the REAL cliff once bathymetry is loaded: 12 m inland
// of the measured waterline at the camera's along-shore station, eye height
// above the actual ground. Before the seabed existed these shots sat at a
// hand-tuned 16 m over open water, which now puts them inland of the shore
// and buries the lineup behind a sand berm.
const EYE_H = 3.6;                    // standing height above the cliff top
function cliffStation(x) {
  // Shoreward of the break line, not seaward: the line is a contour now, so
  // "+" is the land side. The unmapped site has no measured cliff to stand on.
  if (!state.geoSpot) return [x, 16, breakLineJS(x) + 60];
  const top = cliffTop(state.geoSpot, x, MSL_ABOVE_NAVD88);
  return [x, top.elev + EYE_H, top.z];
}

const CAM_PRESETS = [
  { name: 'Free',   pos: () => [-140, 55, -230],                              target: () => [40, 0, 40] },
  { name: 'Cliff',  pos: () => cliffStation(210),                             target: () => [-120, 3, breakLineJS(-120) - 10] },
  { name: 'Drone',  pos: () => [0, 365, STAGE_Z0 + 40],                       target: () => [0, 0, STAGE_Z0] },
  { name: 'Follow', pos: () => cliffStation(210),                             target: () => [0, 2, breakLineJS(0) - 11] },
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
  // Stand where the Cliff preset stands — the comment above CAM_PRESETS always
  // said Follow was on the real cliff, but this hardcoded an offset off the old
  // tilted break line instead, which put it out to sea once the line moved.
  const [cx, cy, cz] = cliffStation(210);
  camera.position.set(cx, cy, cz);
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
const hudAudio = document.getElementById('hudAudio');
const hudAlpha = document.getElementById('hudAlpha');
function refreshHUD() {
  const p = state.preset ? PRESETS[state.preset].label : 'custom';
  hudPreset.textContent = state.paused ? p + ' (paused)' : p;
  hudCam.textContent = CAM_PRESETS[camIdx].name;
  hudSurfer.textContent = state.surfer ? 'on' : 'off';
  if (hudAudio) hudAudio.textContent = isAudioEnabled() ? 'on' : 'off (M)';
  if (hudAlpha) {
    if (uniforms.u_breakMix.value > 0.5) {
      hudAlpha.textContent =
        `${derivedAlphaDeg(0, uniforms.u_breakX.value.x, uniforms.u_breakX.value.y).toFixed(0)}° derived`;
    } else {
      // alpha is authored at the peak only. Down the point the contour swings
      // away from the swell and the realized peel angle rises on its own, so
      // report both rather than implying one number holds along the whole reef.
      // alpha is the deep-water swell direction; what reaches the break is that
      // refracted, and the peel angle follows from the refracted crest against
      // the contour. Report both — the authored number alone is now misleading.
      const P = modelP();
      const phi = swellPhi(P) * 180 / Math.PI;
      const down = peelAngleAt(P.stageEnd ?? 215, P) * 180 / Math.PI;
      hudAlpha.textContent =
        `${state.alpha}° deep → ${phi.toFixed(0)}° at break · peel ${down.toFixed(0)}°`;
    }
  }
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
  // M for mute/unmute. The keypress is the user gesture the AudioContext needs,
  // so audio can only ever start deliberately.
  if (e.key === 'm' || e.key === 'M') { toggleAudio(); refreshHUD(); }
  // C shows the cross-section (the bed-shape -> wave argument); [ and ] move
  // the tide, which is the cheapest lever that proves it — the breaking point
  // slides along the profile and the whitewater band moves with it.
  if (e.key === 'c' || e.key === 'C') { showSection = !showSection; section.el.style.display = showSection ? '' : 'none'; }
  if (e.key === '[') { state.tide = Math.max((state.tide || 0) - 0.15, TIDE_RANGE[0]); refreshHUD(); }
  if (e.key === ']') { state.tide = Math.min((state.tide || 0) + 0.15, TIDE_RANGE[1]); refreshHUD(); }
  // B swaps the measured seabed for its own least-squares plane: same depth
  // scale and mean slope, structure removed. The A/B that isolates reef SHAPE.
  if (e.key === 'b' || e.key === 'B') { state.bedShape = state.bedShape ? 0 : 1; refreshHUD(); }
  // , and . slide the cross-section's transect along the shore, so the profile
  // can be read where the wave is actually peeling rather than only at x=0.
  if (e.key === ',') sectionX = Math.max(sectionX - 25, -250);
  if (e.key === '.') sectionX = Math.min(sectionX + 25, 250);
});

// ---------- cross-section overlay ----------
const section = makeSection(document.body, {
  // dragging the water line is the discoverable form of the [ and ] keys
  onTide: (t) => { state.tide = t; refreshHUD(); },
});
let showSection = false;
let sectionX = 0;
let m4Enabled = false;   // ?m4=1 — see WEB_THREE_SPEC.md "M4"
section.el.style.display = 'none';

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
  applyBed(uniforms, state.geoSpot, state.tide || 0, state.bedShape || 0);

  // ---- M4: bake the emergent break line ----
  // Cached on (site, swell, tide, bed) — recomputed only when one of those
  // changes, never per frame. The A-frame keeps the authored fold: it mirrors
  // about x=0 and has no measured line to derive from.
  // M4 is INCOMPLETE and off unless ?m4=1. The bake below is correct — the
  // baked line curves through the measured seabed as it should — but two
  // pieces are missing: the rider solve picks an arbitrary x among the many
  // stations where a crest meets the line (measured: it parked at the stage
  // edge, x=262, in 0.56 m of water with a 6.59 m crest available at that same
  // x), and the amplitude envelope still does not follow the emergent line.
  // Shipping it on by default would be a visible regression.
  const baked = (!m4Enabled || state.aframe) ? null
    : bakeBreakLine(state.geoSpot, [-STAGE_W / 2, STAGE_W / 2],
        { H0: state.H0, T: state.T, tide: state.tide || 0, bedShape: state.bedShape || 0 });
  uniforms.u_breakMix.value = baked ? 1 : 0;
  if (baked) {
    uniforms.u_breakTex.value = baked.texture;
    uniforms.u_breakX.value.set(baked.x0, baked.x1);
    // Solve the rider against the same baked line: march x for the station
    // where a crest currently sits on the break line, then drop onto its face.
    const w = 2 * Math.PI / state.T, k = 2 * Math.PI / 90;
    const P = modelP();
    let bestX = 0, bestErr = 1e9;
    for (let x = baked.x0 + 10; x <= baked.x1 - 10; x += 4) {
      const zb = breakZAt(x, baked.x0, baked.x1);
      const ph = (w * simTime - k * rayS(x, zb, P)) / (2 * Math.PI);
      const err = Math.abs(ph - Math.round(ph));
      if (err < bestErr) { bestErr = err; bestX = x; }
    }
    const zb = breakZAt(bestX, baked.x0, baked.x1);
    const pump = Math.sin(simTime * 2 * Math.PI / 6);
    const faceOff = 11 + 5 * pump;
    const vx = (90 / state.T) / Math.max(Math.sin(swellPhi(P)), 0.05);
    uniforms.u_surferPos.value.set(bestX, zb - faceOff, vx, 0);
  }
  // Underwater is a camera state, not a fragment test: sample the JS twin's
  // surface height under the eye. gl_FrontFacing would conflate "below the
  // water" with "under M2's folded lip", which is a different thing entirely.
  // u_rideOffset stays 0. Moving the rider onto the depth-derived breaking
  // locus was tried and measurably made things worse: at Sewers the offset is
  // ~110-133 m, and out there the model's wave is 0.5-1.8 m tall versus 7.3 m
  // on the authored line. Depth currently drives the FOAM mask and the height
  // cap, but the amplitude envelope (grow, reefWindow, setEnv) still peaks at
  // the authored break line — so the two loci disagree and no rider placement
  // satisfies both. The fix is to make the break line itself emergent
  // (WEB_THREE_SPEC.md "M4 — emergent break line"), not to shim the rider.
  // depthBreakOffset() is kept in bed.js: M4 needs exactly that crossing.

  const camH = oceanHJS(camera.position.x, camera.position.z, simTime, modelP());
  uniforms.u_camUnder.value = camera.position.y < camH ? 1 : 0;
  bedMesh.visible = uniforms.u_depthMix.value > 0.5;
  // The section is a chart, not an animation: it only depends on bed, swell
  // and tide, so redraw on change rather than every frame.
  if (showSection) section.draw(state, sectionX, state.tide || 0, state.bedShape || 0);

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
  
  if (!state.paused) {
    updateAudio(camera, simTime, modelP(), uniforms.u_camUnder.value > 0.5);
  }
  
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// ---------- URL params ----------
// So an essay can embed the same build framed several ways without shipping
// several builds. Hash rather than query: no server round-trip, and it keeps
// the deployed sim a pure static file.
//   #preset=secondpeak&cam=cliff&section=1&bed=plane&tide=-0.5&surfer=1&sim=42&hud=0
function applyHashParams() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (!h.toString()) return 0;
  const p = h.get('preset');
  if (p && PRESETS[p]) applyPreset(state, p);
  if (h.has('tide')) state.tide = Math.min(Math.max(parseFloat(h.get('tide')) || 0, TIDE_RANGE[0]), TIDE_RANGE[1]);
  if (h.get('bed') === 'plane') state.bedShape = 1;
  if (h.has('surfer')) state.surfer = h.get('surfer') === '1' ? 1 : 0;
  if (h.get('section') === '1') { showSection = true; section.el.style.display = ''; }
  if (h.get('hud') === '0') document.body.classList.add('hidepanel');
  if (h.get('audio') === '1') setAudioEnabled(true);   // needs a gesture; honoured once one lands
  if (h.get('m4') === '1') m4Enabled = true;          // work-in-progress emergent break line
  if (h.has('swell')) state.swellDeg = Math.min(Math.max(parseFloat(h.get('swell')) || 50, 0), 85);
  if (h.has('speed')) state.speed = Math.min(Math.max(parseFloat(h.get('speed')) || 1, 0), 4);
  const camName = (h.get('cam') || '').toLowerCase();
  const ci = CAM_PRESETS.findIndex((c) => c.name.toLowerCase() === camName);
  applyCam(ci >= 0 ? ci : 0);
  return h.has('sim') ? parseFloat(h.get('sim')) || 0 : 0;
}

applyCam(0);
simTime = applyHashParams();
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
