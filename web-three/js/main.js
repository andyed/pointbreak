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
import { makeState, applyPreset, PRESETS, describeGeoState, PARAM_DEFS,
         reefWindowKnots } from '../../web/js/params.js';
import { GRID_VERT, GRID_FRAG, SKY_VERT, SKY_FRAG, BED_VERT, BED_FRAG,
         SPRAY_VERT, SPRAY_FRAG } from './shaders.js';
import { makeSurferMesh, updateSurfer } from './surfer.js';
import { setAudioEnabled, toggleAudio, isAudioEnabled, updateAudio } from './sound.js';
import { coastCurve, coastCurveSlope, swellPhi, peelAngleAt, m4RideSolve, contourZ, rayPhase,
         oceanH as oceanHJS, surferState as surferStateJS } from './model-js.js';
import { iribarrenMeasured } from './bed.js';
import { applyBed, EMPTY_BED, MSL_ABOVE_NAVD88, cliffTop, TIDE_RANGE, tideLabel,
         bakeBreakLine, breakZAt, derivedAlphaDeg, BREAK_Z_MIN, BREAK_Z_MAX,
         reefFitFor, bakeRefraction, REFR_ZC_MIN, REFR_ZC_MAX,
         wavelengthAtStation, psiAt, PEEL_SMOOTH_M, setLocusSmoothing,
         setReefNose, REEF_NOSE_FRAC_TUNED, bedElevBlended } from './bed.js';
import { makeSection } from './section.js';
import { applyConditionDay, nextGoodDay, CONDITION_DAYS } from './conditions.js';
import { fetchTodaysOcean, cachedOcean, applyOcean, describeOcean } from '../../web/js/cdip.js';

// ---------- stage ----------
// ~600x500 m world window, same coordinates as web/: x along the coast
// (zipper peels +x), z shoreward. Centered on the break at the origin, biased
// +10 m shoreward to match web/'s drone framing (z = -uv.y*170 + 10).
const STAGE_W = 600, STAGE_D = 500, STAGE_Z0 = 10;
// ---------- quality tiers ----------
// MEASURED 2026-08-12 (GPU timer queries, not wall clock — wall clock is
// rAF-capped on a fast machine and reports 8.3 ms for every configuration):
// GPU time scales LINEARLY with water-grid triangles — full 4.37 ms, half
// 2.00, quarter 0.90 — while 4x the pixels cost only 1.57x. The seabed mesh is
// free (0.98 vs 0.90 with it hidden). So this app is vertex-bound, not
// fill-bound, and the naive fallback (drop the resolution) would buy almost
// nothing: grid density is the lever. Tiers halve triangles roughly 2x a step.
const QUALITY_TIERS = [
  { name: 'high',   segX: 512, segZ: 384 },
  { name: 'medium', segX: 362, segZ: 272 },
  { name: 'low',    segX: 256, segZ: 192 },
  { name: 'potato', segX: 181, segZ: 136 },
];
let qualityIdx = 0;          // set from #q= below, else auto-tuned at runtime
let qualityLocked = false;   // #q= pins the tier and disables auto-fallback
let SEG_X = QUALITY_TIERS[0].segX, SEG_Z = QUALITY_TIERS[0].segZ;
{   // parse #q= before the geometry is built; full hash parsing happens later
  const q = new URLSearchParams(location.hash.replace(/^#/, '')).get('q');
  if (q) {
    const i = QUALITY_TIERS.findIndex((t) => t.name === q.toLowerCase());
    if (i >= 0) { qualityIdx = i; qualityLocked = true; SEG_X = QUALITY_TIERS[i].segX; SEG_Z = QUALITY_TIERS[i].segZ; }
  }
}

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
let structuralBreaker = 1;   // shipped path; #shape=legacy is the reversible A/B
let noclipEnabled = false;   // #noclip=1: disable the world-collision clamp

// ---------- conditions bank (screensaver "good day" curator) ----------
// A named condition-day rides on top of the site preset: it swaps the OCEAN
// (H0/T/tide/chop/dF), never the reef. #day=<key> picks one, #day=live pulls
// today's SC116 nowcast, #drift=1 hard-switches through the surf-worthy days
// every DRIFT_PERIOD_S of SIM time (rate independent — pause freezes the
// drift, speed scales it, same contract as the Tour camera).
const DRIFT_PERIOD_S = 300;
let activeDayKey = null;     // conditions.js key currently applied (drift cursor)
let activeDayLabel = null;   // HUD suffix; also set by day=live from the nowcast
let driftEnabled = false;
let driftLeg = 0;            // last drift interval acted on (floor(sim/period))

// ---------- the grid ----------
// PlaneGeometry is authored in XY; rotate onto XZ (y up) then shift so
// position.xz is the model coordinate directly — the vertex shader displaces
// y and never needs a separate model transform to stay in sync with web/.
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
// Factored so a quality change can rebuild the grid without duplicating the
// skirt maths (which must stay identical across tiers or the horizon moves).
function makeWaterGeometry(segX, segZ) {
  const g = new THREE.PlaneGeometry(STAGE_W, STAGE_D, segX, segZ);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, STAGE_Z0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, stretchAxis(pos.getX(i), STAGE_W / 2));
    pos.setZ(i, STAGE_Z0 + stretchAxis(pos.getZ(i) - STAGE_Z0, STAGE_D / 2));
  }
  g.computeBoundingSphere();
  return g;
}
// Built here, not above: makeWaterGeometry is hoisted but CORE/FAR_EXTENT are
// `const` and would be in the temporal dead zone at an earlier call site.
let geo = makeWaterGeometry(SEG_X, SEG_Z);

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
  u_breakShape: { value: structuralBreaker },
  u_geoMix:   { value: state.geoMix },
  u_contourFit: { value: new THREE.Vector2(state.contourX2, state.contourX3) },
  u_stageBounds: { value: new THREE.Vector2(state.stageStart, state.stageEnd) },
  u_reefWin:    { value: new THREE.Vector4(...reefWindowKnots(state.stageStart, state.stageEnd)) },
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
  // M6 part 3 (staged, water only — see the spec). Off unless #psi=1.
  u_refrTex:    { value: EMPTY_BED },
  u_psiMix:     { value: 0 },
  u_refrZ:      { value: new THREE.Vector2(REFR_ZC_MIN, REFR_ZC_MAX) },
  u_refrPsi:    { value: new THREE.Vector2(0, 1) },
  u_refrKappa:  { value: 0 },
  // modeled-domain matte (shaders.js provenanceAt) — #matte=0 reverts
  u_matte:      { value: 1 },
  // Land-vertex wave-math skip threshold, m above still water (shaders.js
  // surfacePos). A uniform rather than a const so it can be A/B'd inside ONE
  // page session — GPU timing across separate browser launches is too noisy
  // to resolve the effect (3.1-4.4 ms for identical configs, measured).
  u_landSkipM:  { value: 6.0 },
};
applyBed(uniforms, state.geoSpot, state.tide || 0, state.bedShape || 0);

const mat = new THREE.ShaderMaterial({
  vertexShader: GRID_VERT,
  fragmentShader: GRID_FRAG,
  uniforms,
  side: THREE.DoubleSide,   // free camera can dive below the surface
});
const waterMesh = new THREE.Mesh(geo, mat);
scene.add(waterMesh);

// ---------- adaptive quality (auto-fallback) ----------
// Reported 2026-08-12: slow on a mid-end Windows box. We cannot profile that
// machine, and the local numbers are useless for it (an M3 Max is rAF-capped),
// so the honest fix is to MEASURE ON THE USER'S MACHINE and step down. GPU
// timing showed cost is ~linear in water-grid triangles, so a tier step (~2x
// fewer triangles) is worth roughly 2x — dropping the render resolution would
// not be, which is why this scales geometry rather than pixels.
// Rate-independent and sim-independent: it watches real frame time only.
const QUALITY_TARGET_MS = 22;    // ~45 fps; below this we are dropping frames
const QUALITY_WARMUP_FRAMES = 60;   // ignore shader compile + first-bake spikes
const QUALITY_WINDOW = 90;
let qFrames = [], qWarmup = 0, qSettled = false;
function rebuildWaterGeometry() {
  const t = QUALITY_TIERS[qualityIdx];
  SEG_X = t.segX; SEG_Z = t.segZ;
  const old = waterMesh.geometry;
  waterMesh.geometry = makeWaterGeometry(SEG_X, SEG_Z);
  geo = waterMesh.geometry;
  old.dispose();
  // The FD normal step is one CORE cell, so it MUST follow the tier or the
  // lighting changes with quality (normals sampled at the wrong scale).
  uniforms.u_cell.value.set(STAGE_W / (SEG_X * CORE), STAGE_D / (SEG_Z * CORE));
  refreshHUD();
}
function considerQuality(dtMs) {
  if (qualityLocked || qSettled) return;
  if (qWarmup < QUALITY_WARMUP_FRAMES) { qWarmup++; return; }
  qFrames.push(dtMs);
  if (qFrames.length < QUALITY_WINDOW) return;
  qFrames.sort((a, b) => a - b);
  const median = qFrames[Math.floor(qFrames.length / 2)];
  qFrames = [];
  if (median > QUALITY_TARGET_MS && qualityIdx < QUALITY_TIERS.length - 1) {
    qualityIdx++;
    rebuildWaterGeometry();
    qWarmup = 0;               // re-warm before judging the new tier
  } else {
    qSettled = true;           // fast enough (or already at the floor): stop
  }
}

// ---------- airborne impact whitewater ----------
// Deterministic stations/seeds keep A/B captures reproducible. This is a
// deliberately sparse volume: the Point reference is clean dark lanes with a
// narrow collapsing head, not the opaque particle blizzard of a surf game.
function makeSprayGeometry(count = 5200) {
  let seed = 0x51f15e;
  const random = () => {
    seed = (1664525*seed + 1013904223) >>> 0;
    return seed/4294967296;
  };
  const pos = new Float32Array(count*3);
  for (let i = 0; i < count; i++) {
    pos[i*3] = -285 + 570*random();
    pos[i*3 + 1] = random();
    pos[i*3 + 2] = random();
  }
  const sprayGeo = new THREE.BufferGeometry();
  sprayGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return sprayGeo;
}
const sprayMat = new THREE.ShaderMaterial({
  vertexShader: SPRAY_VERT,
  fragmentShader: SPRAY_FRAG,
  uniforms,
  transparent: true,
  depthWrite: false,
  blending: THREE.NormalBlending,
});
const sprayPoints = new THREE.Points(makeSprayGeometry(), sprayMat);
sprayPoints.frustumCulled = false; // positions are shader-authored from seeds
scene.add(sprayPoints);

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

// snapshot of the model uniforms for the JS twin (alpha already in radians).
// m4Ride is the frame's emergent-line rider solve (null off the M4 path): the
// JS twin's surferState() returns it verbatim, exactly as the GLSL twin
// returns u_surferPos, so mesh, Follow camera, audio and wake share one rider.
function modelP() {
  return {
    T: state.T, H0: state.H0, alphaRad: state.alpha * Math.PI / 180,
    xi: state.xi, sections: state.sections, dF: state.dF,
    chop: state.chop, aframe: state.aframe,
    geoMix: state.geoMix, contourX2: state.contourX2, contourX3: state.contourX3,
    stageStart: state.stageStart, stageEnd: state.stageEnd,
    reefWin: reefWindowKnots(state.stageStart, state.stageEnd),
    rideOffset: uniforms.u_rideOffset.value,
    m4Ride,
    // M6 part 3: the JS twin's phase field. Null off the Psi path, which makes
    // rayPhase() fall back to the frozen-LAM plane wave — the branch the twin
    // has always run. Set once per frame by the refraction bake below.
    phaseFn: psiPhaseFn,
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
// Lineup = low telephoto water view used to judge face/lip negative space;
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
// The along-shore station Cliff/Follow stand at. 210 was tuned on Second Peak
// and is past stageEnd for EVERY mapped spot (Sewers ends at x=75.6): each
// preset re-centers the world on its own surf node, and off the measured
// bounds the coastline swings inland — at Sewers the waterline recedes from
// z≈126 at the peak to z≈252 at x=210, so a camera parked there stood ~290 m
// inland with the bluff plateau filling the frame. Clamp to the preset's own
// down-point stage end instead; the synthetic site keeps the original number.
function cliffStationX() {
  return state.geoSpot ? Math.min(210, state.stageEnd ?? 215) : 210;
}

const CAM_PRESETS = [
  { name: 'Free',   pos: () => [-140, 55, -230],                              target: () => [40, 0, 40] },
  // Cliff aims at the peak, seaward of the break — not down the coast axis:
  // the stand is a plateau 30-45 m inland whose up-coast top runs at roughly
  // eye level, so a shot along the shore toward x=-120 keeps that bluff in
  // half the frame at every mapped spot. Telephoto (30) crops the foreground
  // the same way Follow's zoom does.
  { name: 'Cliff',  pos: () => cliffStation(cliffStationX()),                 target: () => [-30, 2, breakLineJS(-30) - 25], fov: 30 },
  { name: 'Lineup', pos: () => [35, 8.5, breakLineJS(35) - 30],               target: () => [0, 4.0, breakLineJS(0) + 2], fov: 32 },
  { name: 'Drone',  pos: () => [0, 365, STAGE_Z0 + 40],                       target: () => [0, 0, STAGE_Z0] },
  // The headland shot. Round-2 finding (ROUND2_FINDINGS_2026-08-11): Sewer
  // Peak's DEM patch already carries 111.5 deg of coastline rotation including
  // the OSM apex — the Drone framing just crops it (footprint ends z=+173 m,
  // the corner's limbs sweep to +320). Higher and aimed shoreward, the corner
  // is in frame; a camera fix, not geometry work.
  { name: 'Point',  pos: () => [0, 560, 200],                                 target: () => [0, 0, 140] },
  { name: 'Follow', pos: () => cliffStation(cliffStationX()),                 target: () => [0, 2, breakLineJS(0) - 11] },
  { name: 'Tour',   pos: () => [0, 365, STAGE_Z0 + 40],                       target: () => [0, 0, STAGE_Z0] },
];
let camIdx = 0;
const BASE_FOV = 50;

// Tour = the screensaver camera: hard cuts Drone -> Cliff -> Follow on a fixed
// SIM-time cadence (rate independence: pausing freezes the cut clock too, and
// speed scaling shortens the shots with the waves). No easing by design — a
// cut reads as a camera change; a glide reads as a mistake.
const TOUR_SHOTS = ['Drone', 'Cliff', 'Follow'];
const TOUR_CUT_S = 24;
let tourLeg = -1;   // last leg applied; -1 forces a cut on the first frame

function applyCam(i) {
  camIdx = i;
  const p = CAM_PRESETS[i];
  camera.position.set(...p.pos());
  controls.target.set(...p.target());
  // Follow and Tour own the camera every frame; OrbitControls would fight the
  // track. Leaving them restores free orbiting and the wide field of view.
  const scripted = p.name === 'Follow' || p.name === 'Tour';
  controls.enabled = !scripted;
  if (!scripted) { camera.fov = p.fov || BASE_FOV; camera.updateProjectionMatrix(); }
  if (p.name === 'Tour') tourLeg = -1;   // re-entering always cuts immediately
  controls.update();
  refreshHUD();
}

// hard cut to a named shot (Tour legs reuse the presets' own framing)
function cutToShot(name) {
  const p = CAM_PRESETS.find((c) => c.name === name);
  camera.position.set(...p.pos());
  controls.target.set(...p.target());
  camera.fov = p.fov || BASE_FOV;
  camera.updateProjectionMatrix();
  camera.lookAt(controls.target);
}

// per-frame Follow update: telephoto tracking, zoom ∝ 1/distance (web/ parity:
// zoom factor clamp(1500/dist, 2, 6.5); fov = 2*atan(1/zoom) is the same
// mapping web/'s ray basis rd = fw*zoom + ... encodes)
function updateFollowCam(sWorld) {
  // Stand where the Cliff preset stands — the comment above CAM_PRESETS always
  // said Follow was on the real cliff, but this hardcoded an offset off the old
  // tilted break line instead, which put it out to sea once the line moved.
  const [cx, cy, cz] = cliffStation(cliffStationX());
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
const hudXi = document.getElementById('hudXi');
const hudLam = document.getElementById('hudLam');
const hudSwell = document.getElementById('hudSwell');
const topPreset = document.getElementById('topPreset');
const topCam = document.getElementById('topCam');
const siteControls = document.getElementById('siteControls');
const cameraControls = document.getElementById('cameraControls');
const menuToggle = document.getElementById('menuToggle');
const menuClose = document.getElementById('menuClose');
const drawerBackdrop = document.getElementById('drawerBackdrop');
const controlDrawer = document.getElementById('controlDrawer');
const breakKeys = document.getElementById('breakKeys');
const uiReveal = document.getElementById('uiReveal');

function syncControlUI() {
  if (topPreset) topPreset.textContent = state.paused
    ? `${state.preset ? PRESETS[state.preset].label : 'Custom'} · paused`
    : (state.preset ? PRESETS[state.preset].label : 'Custom');
  if (topCam) topCam.textContent = CAM_PRESETS[camIdx].name;

  siteControls?.querySelectorAll('[data-preset]').forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.preset === state.preset));
  });
  cameraControls?.querySelectorAll('[data-camera]').forEach((button) => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.camera) === camIdx));
  });

  const toggleStates = {
    surfer: Boolean(state.surfer),
    audio: isAudioEnabled(),
    pause: Boolean(state.paused),
    section: Boolean(showSection),
  };
  document.querySelectorAll('[data-action]').forEach((button) => {
    const active = toggleStates[button.dataset.action];
    if (typeof active !== 'boolean') return;
    button.setAttribute('aria-pressed', String(active));
    const stateLabel = button.querySelector('.control-state');
    if (stateLabel) stateLabel.textContent = active ? 'On' : 'Off';
  });

  breakKeys?.querySelectorAll('[data-shortcut]').forEach((button, index) => {
    button.setAttribute('aria-pressed', String(presetKeys[index] === state.preset));
  });
  const shortcutStates = {
    s: Boolean(state.surfer),
    m: isAudioEnabled(),
    c: Boolean(showSection),
    ' ': Boolean(state.paused),
  };
  document.querySelectorAll('.command-keys [data-shortcut]').forEach((button) => {
    const active = shortcutStates[button.dataset.shortcut];
    if (typeof active === 'boolean') button.setAttribute('aria-pressed', String(active));
  });
}

function refreshHUD() {
  const p = state.preset ? PRESETS[state.preset].label : 'custom';
  hudPreset.textContent = state.paused ? p + ' (paused)' : p;
  hudCam.textContent = CAM_PRESETS[camIdx].name;
  hudSurfer.textContent = state.surfer ? 'on' : 'off';
  if (hudAudio) hudAudio.textContent = isAudioEnabled() ? 'on' : 'off (M)';
  if (hudAlpha) {
    if (uniforms.u_breakMix.value > 0.5) {
      const derived = derivedAlphaDeg(0, uniforms.u_breakX.value.x, uniforms.u_breakX.value.y);
      // M5: with the synthetic reef in the grid (bed mode 0), alpha returns as
      // a character TARGET the reef was fitted to — report target, derived and
      // the synthetic label together, never the derived number alone. If the
      // fit missed tolerance the residual is not hidden: the numbers show it.
      const fit = (state.bedShape || 0) === 0 ? reefFitFor(state.geoSpot) : null;
      hudAlpha.textContent = fit
        ? `α ${fit.targetDeg}° target · ${derived.toFixed(0)}° derived · reef synthetic`
        : `${derived.toFixed(0)}° derived`;
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
  // M6 part 2: xi is AUTHORED and the measured seabed disagrees on every
  // preset. Report both rather than letting the typed number stand alone —
  // the gap is the same finding as the peel angle, and it is what M5 exists
  // to close. The authored value still drives the render; see the spec.
  if (hudXi) {
    const xm = iribarrenMeasured(state.geoSpot, { H0: state.H0, T: state.T });
    hudXi.textContent = xm === null
      ? `${state.xi.toFixed(2)} authored · synthetic stage`
      : `${state.xi.toFixed(2)} authored · ${xm.toFixed(2)} measured ` +
        `(${xm < 0.5 ? 'spilling' : 'plunging'})`;
  }
  // M5 bed mode (B key three-way): 0 measured+reef / 1 plane / 2 measured
  const bedMode = ['bed measured+reef', 'bed plane', 'bed measured'][state.bedShape || 0];
  // Swell size in metres AND feet: the model is metric, surfers are not, and
  // "5 ft" is the unit anyone judging this as a screensaver actually thinks in.
  if (hudSwell) {
    const ft = state.H0 * 3.28084;
    hudSwell.textContent = `${state.H0.toFixed(1)} m (${ft.toFixed(1)} ft) · T ${state.T} s`;
  }
  // M6 part 3: report the wavelength the crests are actually drawn at. Off the
  // Psi path that is the frozen 90 m and saying so is the point — the HUD is
  // where the constant stops being invisible. On it, report the compression
  // across the surf zone (6 m of water -> the breaking depth for this H0).
  if (hudLam) {
    if (uniforms.u_psiMix.value > 0.5 && state.geoSpot) {
      const opts = { T: state.T, tide: state.tide || 0, bedShape: state.bedShape || 0 };
      const outer = wavelengthAtStation(state.geoSpot, -180, opts);
      const inner = wavelengthAtStation(state.geoSpot, 40, opts);
      hudLam.textContent = `L ${outer.toFixed(0)} → ${inner.toFixed(0)} m (shoaling)`;
    } else {
      hudLam.textContent = 'L 90 m (frozen)';
    }
  }
  hudGeo.textContent = `${describeGeoState(state)} · ${structuralBreaker ? 'breaker anatomy' : 'legacy breaker'}`
    + (state.geoSpot ? ` · ${bedMode}` : '')
    + (activeDayLabel ? ` · ${activeDayLabel}` : '');
  syncControlUI();
}

// Swell-height step, clamped to the PARAM_DEFS range. Rounded to the step so
// repeated presses land on clean values instead of drifting on float error.
const H0_DEF = PARAM_DEFS.find((d) => d.key === 'H0');
function stepH0(dir) {
  const v = (state.H0 || 0) + dir * H0_DEF.step;
  const snapped = Math.round(v / H0_DEF.step) * H0_DEF.step;
  state.H0 = Math.min(Math.max(snapped, H0_DEF.min), H0_DEF.max);
  // A hand on the size knob means the day label no longer describes the ocean.
  if (activeDayLabel) { activeDayLabel = null; activeDayKey = null; }
  refreshHUD();
}

function selectPreset(key) {
  if (!PRESETS[key]) return;
  applyPreset(state, key);
  // A site choice owns the reef only. Clear a named condition so the readout
  // cannot imply that the old ocean still describes the new selection.
  activeDayKey = null;
  activeDayLabel = null;
  refreshHUD();
}

function setSectionVisible(visible) {
  showSection = Boolean(visible);
  section.el.style.display = showSection ? '' : 'none';
  refreshHUD();
}

function setMenuOpen(open) {
  document.body.classList.toggle('menu-open', open);
  controlDrawer.setAttribute('aria-hidden', String(!open));
  menuToggle.setAttribute('aria-expanded', String(open));
  menuToggle.setAttribute('aria-label', open ? 'Close controls' : 'Open controls');
  if (open) {
    menuClose.focus();
  } else if (controlDrawer.contains(document.activeElement)) {
    menuToggle.focus();
  }
}

function runShortcut(key) {
  const normalized = key.length === 1 ? key.toLowerCase() : key;
  const n = parseInt(normalized, 10);
  if (n >= 1 && n <= presetKeys.length) {
    selectPreset(presetKeys[n - 1]);
    return true;
  }
  if (normalized === 'v') applyCam((camIdx + 1) % CAM_PRESETS.length);
  else if (normalized === 's') { state.surfer = 1 - state.surfer; refreshHUD(); }
  else if (normalized === ' ') { state.paused = !state.paused; refreshHUD(); }
  else if (normalized === 'h') {
    const hidden = document.body.classList.toggle('hidepanel');
    if (hidden) setMenuOpen(false);
    syncControlUI();
  }
  else if (normalized === 'm') { toggleAudio(); refreshHUD(); }
  else if (normalized === 'c') setSectionVisible(!showSection);
  else if (normalized === '[') { state.tide = Math.max((state.tide || 0) - 0.15, TIDE_RANGE[0]); refreshHUD(); }
  else if (normalized === ']') { state.tide = Math.min((state.tide || 0) + 0.15, TIDE_RANGE[1]); refreshHUD(); }
  else if (normalized === '-' || normalized === '_') stepH0(-1);
  else if (normalized === '=' || normalized === '+') stepH0(+1);
  else if (normalized === 'd') {
    const i = CONDITION_DAYS.findIndex((x) => x.key === activeDayKey);
    const d = applyConditionDay(state, uniforms,
      CONDITION_DAYS[(i + 1 + CONDITION_DAYS.length) % CONDITION_DAYS.length].key);
    if (d) { activeDayKey = d.key; activeDayLabel = d.label; refreshHUD(); }
  }
  else if (normalized === 'b') { state.bedShape = ((state.bedShape || 0) + 1) % 3; refreshHUD(); }
  else if (normalized === 'n') {
    structuralBreaker = structuralBreaker ? 0 : 1;
    uniforms.u_breakShape.value = structuralBreaker;
    refreshHUD();
  }
  else if (normalized === ',') sectionX = Math.max(sectionX - 25, -250);
  else if (normalized === '.') sectionX = Math.min(sectionX + 25, 250);
  else return false;
  return true;
}

// ---------- keyboard (parity with web/) ----------
const presetKeys = Object.keys(PRESETS);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('menu-open')) {
    setMenuOpen(false);
    return;
  }
  if (e.key === 'Tab' && document.body.classList.contains('menu-open')) {
    const focusable = [...controlDrawer.querySelectorAll('button, summary, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((element) => !element.disabled && element.getClientRects().length > 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      last?.focus();
      e.preventDefault();
    } else if (!e.shiftKey && document.activeElement === last) {
      first?.focus();
      e.preventDefault();
    }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // Buttons own Space/letter input while the drawer is open. Without this,
  // activating a visible control could also trigger its keyboard shortcut.
  if (e.target.closest('button, summary, input, select, textarea')) return;
  if (runShortcut(e.key) && e.key === ' ') e.preventDefault();
});

// ---------- cross-section overlay ----------
const section = makeSection(document.body, {
  // dragging the water line is the discoverable form of the [ and ] keys
  onTide: (t) => { state.tide = t; refreshHUD(); },
});
let showSection = false;
let sectionX = 0;
// M4 emergent break line. DEFAULT ON for mapped spots as of 2026-08-11 (see
// WEB_THREE_SPEC.md "M4" — rider continuity landed, envelope measured as
// already following, no capture regression on secondpeak/sewers). #m4=0 is
// the escape hatch; unmapped sites and the A-frame keep the authored line
// regardless (bakeBreakLine returns null there).
let m4Enabled = true;
// the frame's emergent-line rider (model-js m4RideSolve result; null when the
// authored path owns the rider) and its persistent crest-following state.
// The state survives tide/H0 rebakes on purpose — the line moves smoothly and
// the rider keeps following the same crest — and resets on preset change,
// where the crest index means nothing in the re-centered world.
let m4Ride = null;
const m4RideState = { n: null, prevX: null, preset: null };
// M6 part 3, step 1: the water's phase field on the baked Psi. OFF by default —
// the rider, the audio crest solve and setEnv all still assume constant phi, so
// this is a water-only preview until steps 2-3 of the spec's staged path land.
let psiEnabled = false;
// Direction constraint on the baked break line (MODEL.md 4.5). OFF by default:
// it does remove the A-frame on all 18 combos, and it costs the peel — see the
// measured note in WEB_THREE_SPEC. #peeldir=1 to A/B it.
let peelDirEnabled = false;
// Wave-scale smoothing of the break locus. Physically right and visually much
// better (A-frames 8/18 -> 4/18, long continuous peel lines), but it takes the
// peel ANGLE with it — alpha collapses to 5-28 deg against 38-66 deg targets,
// because alpha was being carried by the very locus wander it removes, and the
// reef fit cannot make it back (beta clamps out). Shipping it on would trade a
// torn wave for seven identical mushy ones. #smooth=1 to see it.
let smoothEnabled = false;
// last emergent-line bake, kept at module scope so the takeoff probe can walk
// the same line the rider does rather than re-deriving one that might differ.
let lastBaked = null;
// MODEL-TWIN of the shader's rayPhase(), rebuilt whenever the Psi bake changes.
// Lives at module scope because modelP() is called from cameras and the rider
// alike and every one of them must see the same phase field the GPU does.
let psiPhaseFn = null;
section.el.style.display = 'none';

function initControlUI() {
  presetKeys.forEach((key) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.preset = key;
    button.setAttribute('aria-pressed', 'false');
    button.textContent = PRESETS[key].label;
    button.addEventListener('click', () => {
      selectPreset(key);
      setMenuOpen(false);
    });
    siteControls.append(button);
  });

  CAM_PRESETS.forEach((preset, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.camera = String(index);
    button.setAttribute('aria-pressed', 'false');
    button.textContent = preset.name;
    button.addEventListener('click', () => {
      applyCam(index);
      setMenuOpen(false);
    });
    cameraControls.append(button);
  });

  presetKeys.forEach((key, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.shortcut = String(index + 1);
    button.setAttribute('aria-label', `${index + 1} — ${PRESETS[key].label}`);
    button.setAttribute('aria-pressed', 'false');
    const keycap = document.createElement('kbd');
    keycap.textContent = String(index + 1);
    button.append(keycap);
    breakKeys.append(button);
  });

  document.querySelectorAll('.key-deck [data-shortcut]').forEach((button) => {
    button.addEventListener('click', () => runShortcut(button.dataset.shortcut));
  });

  document.querySelector('[data-action="surfer"]').addEventListener('click', () => {
    state.surfer = 1 - state.surfer;
    refreshHUD();
  });
  document.querySelector('[data-action="audio"]').addEventListener('click', () => {
    toggleAudio();
    refreshHUD();
  });
  document.querySelector('[data-action="pause"]').addEventListener('click', () => {
    state.paused = !state.paused;
    refreshHUD();
  });
  document.querySelector('[data-action="section"]').addEventListener('click', () => {
    setSectionVisible(!showSection);
  });

  menuToggle.addEventListener('click', () => {
    setMenuOpen(!document.body.classList.contains('menu-open'));
  });
  menuClose.addEventListener('click', () => setMenuOpen(false));
  drawerBackdrop.addEventListener('click', () => setMenuOpen(false));
  uiReveal.addEventListener('click', () => {
    document.body.classList.remove('hidepanel');
    syncControlUI();
    menuToggle.focus();
  });
}

initControlUI();

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
  // Clamp tab-switch jumps; floor at 0 because the FIRST rAF timestamp can
  // precede the module-eval performance.now() that seeded `last` (Chromium
  // hands the frame's begin time), and a negative dt walked simTime below 0.
  const dtMs = now - last;
  const dt = Math.min(Math.max((now - last) / 1000, 0), 0.1);
  last = now;
  if (Number.isFinite(dtMs) && dtMs > 0) considerQuality(dtMs);
  if (!state.paused && Number.isFinite(dt)) simTime += dt * state.speed;

  // Conditions drift: one hard switch to the next surf-worthy day at each
  // DRIFT_PERIOD_S boundary of SIM time. Interval index, not an accumulator,
  // so it is rate independent and survives setSim() jumps in either direction.
  if (driftEnabled) {
    // max(sim, 0): a sim clock at/below zero is still the zeroth interval, so
    // neither startup jitter nor a setSim() to a negative value fires a switch
    const leg = Math.floor(Math.max(simTime, 0) / DRIFT_PERIOD_S);
    if (leg !== driftLeg) {
      driftLeg = leg;
      const d = applyConditionDay(state, uniforms, nextGoodDay(activeDayKey));
      if (d) { activeDayKey = d.key; activeDayLabel = d.label; refreshHUD(); }
    }
  }

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
  uniforms.u_reefWin.value.fromArray(reefWindowKnots(state.stageStart, state.stageEnd));
  applyBed(uniforms, state.geoSpot, state.tide || 0, state.bedShape || 0);

  // ---- M6 part 3: bake Psi, the depth-dependent phase field ----
  // Ahead of the M4 block because the rider solve below consumes it: with a
  // shoaling wavelength there is no single k, so the crest label the ride
  // follows has to be the phase itself. Cached inside bakeRefraction on
  // (site, T, tide, bed, swell), so this is a map lookup on all but the frames
  // one of those changes.
  // contourZ needs only the coast-curve fields, so give it a minimal snapshot
  // rather than modelP() — which would otherwise have to exist before the
  // phase function it carries.
  const geoP = { aframe: state.aframe, geoMix: state.geoMix,
                 contourX2: state.contourX2, contourX3: state.contourX3,
                 stageStart: state.stageStart, stageEnd: state.stageEnd };
  const refr = (!psiEnabled || state.aframe || !state.geoSpot) ? null
    : bakeRefraction(state.geoSpot, {
        T: state.T, tide: state.tide || 0, bedShape: state.bedShape || 0,
        swellDeg: state.alpha, xRef: 0,
      });
  uniforms.u_psiMix.value = refr ? 1 : 0;
  psiPhaseFn = refr
    ? (x, z) => {
        const xx = state.aframe ? Math.abs(x) : x;
        return refr.kappa * xx + psiAt(contourZ(x, z, geoP));
      }
    : null;
  if (refr) {
    if (uniforms.u_refrTex.value !== refr.texture) {
      uniforms.u_refrTex.value = refr.texture;
      uniforms.u_refrPsi.value.set(refr.psiMin, refr.psiMax);
      uniforms.u_refrKappa.value = refr.kappa;
      refreshHUD();
    }
  }
  // MODEL-TWIN of the shader's rayPhase(): kappa*x + Psi(contourZ). Null off
  // the Psi path, which makes rayPhase() fall back to the frozen-LAM plane
  // wave. Captured against a P WITHOUT phaseFn (contourZ never reads it, but
  // building modelP() inside its own field would recurse).

  // ---- M4: bake the emergent break line ----
  // Cached on (site, swell, tide, bed) — recomputed only when one of those
  // changes, never per frame. The A-frame keeps the authored fold: it mirrors
  // about x=0 and has no measured line to derive from.
  // 2026-08-11 re-measure closed the two gaps that kept this off by default:
  // the amplitude envelope already follows the emergent line (growGeo made
  // depth own the height cap — see the spec's M4 section), and the rider is
  // now a continuity solve (model-js m4RideSolve) instead of a per-frame
  // global re-scan that teleported him across the stage.
  // `peel` hands the bake the site's DIRECTION (MODEL.md 4.5). Pleasure Point
  // is a right; the constraint keeps the baked line from ever reversing.
  const peelP = modelP();
  const baked = (!m4Enabled || state.aframe) ? null
    : bakeBreakLine(state.geoSpot, [-STAGE_W / 2, STAGE_W / 2],
        { H0: state.H0, T: state.T, tide: state.tide || 0, bedShape: state.bedShape || 0,
          smoothM: smoothEnabled ? PEEL_SMOOTH_M : 0,
          peel: peelDirEnabled
            ? { phiRad: swellPhi(peelP), curveAt: (x) => coastCurve(x, peelP) }
            : null });
  lastBaked = baked;
  uniforms.u_breakMix.value = baked ? 1 : 0;
  if (baked) {
    if (uniforms.u_breakTex.value !== baked.texture) {
      // fresh bake (spot/swell/tide/bed-mode changed): the derived-alpha HUD
      // readout follows the REBAKE, not the last keypress, or it reports the
      // previous mode's line until the next key event.
      uniforms.u_breakTex.value = baked.texture;
      uniforms.u_breakX.value.set(baked.x0, baked.x1);
      refreshHUD();
    }
    // Rider continuity on the same baked line: follow ONE crest's crossing
    // frame-to-frame, hand off at the stage end — never re-scan and jump.
    if (m4RideState.preset !== state.preset) {
      m4RideState.n = null; m4RideState.prevX = null;
      m4RideState.preset = state.preset;
    }
    m4Ride = null;   // solve against the authored-path P (m4Ride: null)
    m4Ride = m4RideSolve(simTime, modelP(),
        (x) => breakZAt(x, baked.x0, baked.x1), m4RideState);
    const s = m4Ride || surferStateJS(simTime, modelP());   // NaN-guard fallback
    uniforms.u_surferPos.value.set(s.x, s.z, s.vx, s.vz);
  } else {
    m4Ride = null;
  }
  // Underwater is a camera state, not a fragment test: sample the JS twin's
  // surface height under the eye. gl_FrontFacing would conflate "below the
  // water" with "under M2's folded lip", which is a different thing entirely.
  // u_rideOffset stays 0. Shimming the rider onto the depth locus while the
  // break line stayed authored was tried 2026-08-10 and rejected (it dropped
  // him between crests, and neither locus was where the tallest water was).
  // M4 made the break line itself emergent instead — the shim is history; see
  // WEB_THREE_SPEC.md "M4" for the measurements that closed it.

  const camH = oceanHJS(camera.position.x, camera.position.z, simTime, modelP());
  uniforms.u_camUnder.value = camera.position.y < camH ? 1 : 0;
  bedMesh.visible = uniforms.u_depthMix.value > 0.5;
  // The section is a chart, not an animation: it only depends on bed, swell
  // and tide, so redraw on change rather than every frame.
  if (showSection) section.draw(state, sectionX, state.tide || 0, state.bedShape || 0);

  // Tour: pick the leg from SIM time (never wall clock — pause freezes the
  // cuts, speed scales them) and hard-cut whenever it changes.
  const touring = CAM_PRESETS[camIdx].name === 'Tour';
  let following = CAM_PRESETS[camIdx].name === 'Follow';
  if (touring) {
    const leg = Math.floor(simTime / TOUR_CUT_S) % TOUR_SHOTS.length;
    if (leg !== tourLeg) { tourLeg = leg; cutToShot(TOUR_SHOTS[leg]); }
    following = TOUR_SHOTS[leg] === 'Follow';
  }

  // surfer pose + Follow camera share one surferState/surfaceAt evaluation.
  // The follow shot tracks the ride line even with the rider hidden (S off)
  // so V-cycling never lands on a dead camera.
  surferGroup.visible = state.surfer === 1;
  if (surferGroup.visible || following) {
    const sWorld = updateSurfer(surferGroup, simTime, modelP());
    if (following) updateFollowCam(sWorld);
  }

  // OrbitControls.update() re-derives position from its spherical state and
  // would undo the follow/tour track (enabled=false only blocks input, not
  // update)
  if (!following && !touring) controls.update();
  // ---------- world-collision clamp (#noclip=1 disables) ----------
  // Going under WATER is a feature (Snell's window pass); going under the BED
  // or out into the skirt void is not. Eased, not snapped, so a clamped drag
  // never jolts; runs after controls/tour/follow so it is the last word on
  // the eye each frame. Target is clamped too — a target buried under the
  // terrain is what makes orbits go feral.
  if (!noclipEnabled) {
    const clampEye = (v, isTarget) => {
      // stay inside the neighborhood the model claims (stage + margin);
      // beyond it there is only skirt and, past 4 km, the void under it
      v.x = Math.min(Math.max(v.x, -1200), 1200);
      v.z = Math.min(Math.max(v.z, -1000), 1000);
      if (!isTarget) v.y = Math.min(v.y, 900);
      const floorY = bedElevBlended(state.geoSpot, v.x, v.z, state.bedShape || 0)
                   + (isTarget ? 0.0 : 0.4);
      if (v.y < floorY) v.y += (floorY - v.y) * 0.5;   // ease up, half-life ~1 frame
    };
    clampEye(camera.position, false);
    if (!following && !touring) clampEye(controls.target, true);
  }
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
//   #preset=secondpeak&cam=cliff&shape=legacy&section=1&bed=plane&tide=-0.5&surfer=1&sim=42&hud=0
function applyHashParams() {
  const h = new URLSearchParams(location.hash.replace(/^#/, ''));
  if (!h.toString()) return 0;
  const p = h.get('preset');
  if (p && PRESETS[p]) applyPreset(state, p);
  // Conditions day rides on top of the preset (ocean over reef). Handled
  // before #tide= so an explicit tide in the hash still wins over the day's.
  const dayKey = h.get('day');
  if (dayKey === 'live') {
    // Today's ocean at Pleasure Point (MOP SC116 nowcast, CORS verified).
    // Async by nature; applies when it lands. Offline it falls back to the
    // localStorage cache, and with no cache it quietly keeps the preset —
    // a screensaver must never die on a fetch.
    fetchTodaysOcean()
      .catch(() => cachedOcean() || Promise.reject(new Error('offline, no cache')))
      .then((o) => {
        applyOcean(state, o);
        activeDayLabel = `live · ${describeOcean(o)}`;
        refreshHUD();
      })
      .catch(() => { activeDayLabel = 'live unavailable'; refreshHUD(); });
  } else if (dayKey) {
    const d = applyConditionDay(state, uniforms, dayKey);
    if (d) { activeDayKey = d.key; activeDayLabel = d.label; }
  }
  if (h.get('drift') === '1') driftEnabled = true;
  if (h.has('tide')) state.tide = Math.min(Math.max(parseFloat(h.get('tide')) || 0, TIDE_RANGE[0]), TIDE_RANGE[1]);
  // M5 bed modes: reef (default, 0), plane (1), measured/no-reef (2)
  if (h.get('bed') === 'plane') state.bedShape = 1;
  if (h.get('bed') === 'measured') state.bedShape = 2;
  if (h.get('bed') === 'reef') state.bedShape = 0;
  if (h.has('surfer')) state.surfer = h.get('surfer') === '1' ? 1 : 0;
  if (h.get('section') === '1') { showSection = true; section.el.style.display = ''; }
  if (h.get('hud') === '0') document.body.classList.add('hidepanel');
  if (h.get('audio') === '1') setAudioEnabled(true);   // needs a gesture; honoured once one lands
  if (h.has('m4')) m4Enabled = h.get('m4') !== '0';   // emergent break line (default on; #m4=0 = authored)
  if (h.has('h0')) {
    const v = parseFloat(h.get('h0'));
    if (Number.isFinite(v)) state.H0 = Math.min(Math.max(v, H0_DEF.min), H0_DEF.max);
  }
  if (h.has('psi')) psiEnabled = h.get('psi') === '1';
  if (h.has('peeldir')) peelDirEnabled = h.get('peeldir') === '1';
  if (h.has('smooth')) smoothEnabled = h.get('smooth') === '1';
  // ONE smoothing length for the fit and the bake — see bed.js setLocusSmoothing.
  setLocusSmoothing(smoothEnabled ? PEEL_SMOOTH_M : 0);
  // M5 nose, v2 (#nose=1): a down-point taper on the uplift AMPLITUDE, in stage
  // fraction, so it no longer flattens the wide stages the way the v1 gradient
  // did (bed.js REEF_NOSE_FRAC). Still default OFF — the fit is on target on all
  // six spots but the visible-crest consequence is unproven. `#nose=<f>` takes
  // an explicit fraction (clamped to [0, 0.30] by setReefNose) for tuning.
  if (h.has('nose')) {
    const nv = h.get('nose');
    const f = nv === '1' ? REEF_NOSE_FRAC_TUNED : parseFloat(nv);
    if (Number.isFinite(f)) setReefNose(f);
  }
  if (h.get('shape') === 'legacy') structuralBreaker = 0;
  if (h.get('shape') === 'structural') structuralBreaker = 1;
  uniforms.u_breakShape.value = structuralBreaker;
  // #swell= REMOVED 2026-08-11. It wrote state.swellDeg, which nothing read:
  // the refraction bake takes `swellDeg: state.alpha` (see the bakeRefraction
  // call above), and alpha is authored per spot in params.js. The knob looked
  // wired and was not. Do NOT re-add it as a bare hash param — alpha is
  // semantically overloaded (site character AND incident swell direction), so
  // a real direction knob needs the MODEL.md §2.4/§4.5 variable split first.
  // See docs/research/EXTERNAL_VALIDITY_AUDIT_2026-08-11.md ("Direction in the
  // code") and TODO.md Track 3a (doc) / 3c (wiring, gated on Track 1).
  if (h.has('speed')) state.speed = Math.min(Math.max(parseFloat(h.get('speed')) || 1, 0), 4);
  // modeled-domain matte defaults ON; #matte=0 is the A/B revert
  if (h.get('matte') === '0') uniforms.u_matte.value = 0;
  // world-collision clamp defaults ON; #noclip=1 restores x-ray debugging
  if (h.get('noclip') === '1') noclipEnabled = true;
  const camName = (h.get('cam') || '').toLowerCase();
  const ci = CAM_PRESETS.findIndex((c) => c.name.toLowerCase() === camName);
  // Tour is the screensaver: chrome defaults OFF unless the hash asks for it.
  if (camName === 'tour' && !h.has('hud')) document.body.classList.add('hidepanel');
  applyCam(ci >= 0 ? ci : 0);
  return h.has('sim') ? parseFloat(h.get('sim')) || 0 : 0;
}

applyCam(0);
simTime = applyHashParams();
// Anchor the drift clock to wherever the hash put the sim, so #sim=9000 does
// not fire a burst of catch-up switches; with no static day picked, drift
// starts inside the good rotation immediately rather than 300 s from now.
driftLeg = Math.floor(Math.max(simTime, 0) / DRIFT_PERIOD_S);   // same floor as the loop
if (driftEnabled && !activeDayKey) {
  const d = applyConditionDay(state, uniforms, nextGoodDay(null));
  if (d) { activeDayKey = d.key; activeDayLabel = d.label; }
}
refreshHUD();
resize();
requestAnimationFrame(frame);

// headless-capture/debug hook: Playwright verification drives the free camera,
// reads rider state, and can jump the sim clock (e.g. straight to mid-ride)
// through this. Not a public API — the UI stays keyboard-led.
window.__pointbreak = {
  camera, controls, state, surferGroup, sprayPoints, uniforms,
  sim: () => simTime,
  setSim: (t) => { if (Number.isFinite(t)) simTime = t; },
  day: () => activeDayKey,   // conditions-bank cursor (null = preset ocean)
  setBreakerShape: (enabled) => {
    structuralBreaker = enabled ? 1 : 0;
    uniforms.u_breakShape.value = structuralBreaker;
    refreshHUD();
  },
  // emergent-line A/B without a reload (captures; mirrors #m4=)
  setM4: (enabled) => {
    m4Enabled = Boolean(enabled);
    m4RideState.n = null; m4RideState.prevX = null;
    refreshHUD();
  },
  m4Ride: () => m4Ride,
  // perf A/B: set huge to disable the land-vertex skip, 6.0 to restore
  setLandSkip: (m) => { uniforms.u_landSkipM.value = m; },
  // Where does a crest FIRST meet the break line? m4RideSolve takes the takeoff
  // as argmin S over the stage. When that minimum is INTERIOR, crests satisfy
  // the criterion in both directions from it and the peak splits into a left
  // and a right — an A-frame, arrived at geometrically without u_aframe ever
  // being set. This reports where the minimum sits so "one spot has a corner"
  // can be told apart from "the bake does this everywhere".
  // The baked line itself plus its derived alpha, for headless measurement.
  // Foam is a weak instrument; the LINE is the claim (audit 2026-08-11).
  lineProbe: (step = 5) => {
    if (!lastBaked) return null;
    const out = [];
    for (let x = lastBaked.x0; x <= lastBaked.x1; x += step)
      out.push({ x, z: breakZAt(x, lastBaked.x0, lastBaked.x1),
                 a: derivedAlphaDeg(x, lastBaked.x0, lastBaked.x1) });
    return out;
  },
  takeoffProfile: (step = 1) => {
    if (!lastBaked) return null;
    const P = modelP();
    const xLo = (P.stageStart ?? -110) + 10, xHi = (P.stageEnd ?? 290) - 10;
    const S = (x) => rayPhase(x, breakZAt(x, lastBaked.x0, lastBaked.x1), P);
    const xs = [], ss = [];
    for (let x = xLo; x <= xHi; x += step) { xs.push(x); ss.push(S(x)); }
    let iMin = 0;
    for (let i = 1; i < ss.length; i++) if (ss[i] < ss[iMin]) iMin = i;
    // Depth of the left branch in radians: how far S climbs going UP-point from
    // the takeoff. Below 2*pi no whole crest fits on that side, so there is no
    // left to ride however interior the minimum looks.
    const leftRise = ss[0] - ss[iMin];
    const rightRise = ss[ss.length - 1] - ss[iMin];
    return {
      xLo, xHi, takeoffX: xs[iMin],
      frac: (xs[iMin] - xLo) / Math.max(xHi - xLo, 1e-6),
      leftRise, rightRise,
      leftCrests: leftRise / (2 * Math.PI), rightCrests: rightRise / (2 * Math.PI),
    };
  },
  // shoaling-wavelength A/B without a reload (mirrors #psi=)
  setPsi: (enabled) => {
    psiEnabled = Boolean(enabled);
    m4RideState.n = null; m4RideState.prevX = null;
    refreshHUD();
  },
  psi: () => psiEnabled,
  // M6 part 3 acceptance metric, and M4's before it: the face height under the
  // rider as a fraction of the best crest available at his own station. A ride
  // that has drifted off the wave reads low here even though its (x, z) looks
  // reasonable, which is exactly the failure Psi could have introduced.
  //
  // Computed through the same JS twin that places the rider, so a psi/no-psi
  // A/B compares like with like — and the twin now follows P.phaseFn, so the
  // "best crest" it scans is the one the GPU is actually drawing.
  // Returns null while waiting between crests: there is no ride to score.
  rideMetric: () => {
    const r = m4Ride;
    if (!r || r.waiting) return null;
    const P = modelP();
    const faceH = oceanHJS(r.x, r.z, simTime, P);
    let bestH = -Infinity, bestZ = null;
    for (let z = -280; z <= 300; z += 1) {
      const h = oceanHJS(r.x, z, simTime, P);
      if (h > bestH) { bestH = h; bestZ = z; }
    }
    return {
      t: simTime, x: r.x, z: r.z, faceH, bestH, bestZ,
      ratio: bestH > 1e-3 ? faceH / bestH : null,
    };
  },
};
