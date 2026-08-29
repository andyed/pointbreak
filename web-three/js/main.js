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
         reefWindowKnots, PEEL_FLOOR, peelFloorH0 } from '../../shared/params.js';
import { GRID_VERT, GRID_FRAG, SKY_VERT, SKY_FRAG, BED_VERT, BED_FRAG,
         SPRAY_VERT, SPRAY_FRAG, CURTAIN_VERT, CURTAIN_FRAG,
         SURFACE_PRELUDE, SURFACE_GLSL } from './shaders.js';
import { makeSurferMesh, updateSurfer } from './surfer.js';
import { setAudioEnabled, toggleAudio, isAudioEnabled, updateAudio } from './sound.js';
import { coastCurve, coastCurveSlope, swellPhi, peelAngleAt, m4RideSolve, contourZ, rayPhase,
         rayS, oceanH as oceanHJS, surferState as surferStateJS,
         SET_DEPTH, SET_DEPTH_LEGACY } from './model-js.js';
import { iribarrenMeasured } from './bed.js';
import { applyBed, EMPTY_BED, MSL_ABOVE_NAVD88, cliffTop, TIDE_RANGE, tideLabel,
         bakeBreakLine, breakZAt, derivedAlphaDeg, breakGapAt, BREAK_Z_MIN, BREAK_Z_MAX,
         reefFitFor, bakeRefraction, REFR_ZC_MIN, REFR_ZC_MAX,
         wavelengthAtStation, psiAt, PEEL_SMOOTH_M, setLocusSmoothing,
         setReefNose, REEF_NOSE_FRAC_TUNED,
         setReefAmp, setReefFlank, getReefShape, reefAudit,
         setShelter, getShelter, setDensityLine, breakCandidates,
         breakExcessProfile, setOnsetMerge, getOnsetMerge,
         cameraFloorY, UNMAPPED_DIP_M } from './bed.js';
import { makeSection } from './section.js';
import { applyConditionDay, nextGoodDay, CONDITION_DAYS } from './conditions.js';
import { burnoffFog } from './fog.js';
import { MONTHLY_OCEAN, MONTHLY_OCEAN_PCT, getMonthlyOcean } from '../../data/climatology/pp_monthly_ocean.js';
import { fetchTodaysOcean, cachedOcean, applyOcean, describeOcean } from '../../shared/cdip.js';
import { readHashParams, shouldShowControls, parseSpeedParam, parseFidelityLook,
         writeHashParams, needsReloadForHash, ROUND_TRIP_PARAMS } from './url-params.js';
import { create as createFisheyeMenu } from '../vendor/fisheye/fisheye-menu.js';
import { PP_GEO_DATA } from '../../data/model/pp_geo_profiles.js';
import {
  directionPhaseForSpot, parseDirectionParam, refractionDirectionOptions,
} from './incident-direction.js';

// ---------- stage ----------
// ~600x500 m world window, same coordinates as web/: x along the coast
// (zipper peels +x), z shoreward. Centered on the break at the origin, biased
// +10 m shoreward to match web/'s drone framing (z = -uv.y*170 + 10).
const STAGE_W = 600, STAGE_D = 500, STAGE_Z0 = 10;
// Where the horizontal-offset bound starts saturating, as a FRACTION of the
// live ceiling (shaders.js: min(OFF_MAX_M, S/k) — a length the wave supplies,
// not a constant). A fraction rather than metres because the ceiling moves
// with the local wavenumber: 0.75 against the old flat 20 m reproduces the
// 15 m knee the first cut shipped, and against the shoaling ceiling it stays
// in the same relative place instead of drifting toward it.
const OFF_KNEE_FRAC = 0.75;
// Drone obliquity. The tilt is measured OFF NADIR (0 = straight down), which
// is the drone-operator convention and the one the "not fully top down"
// framing note used. The station is derived from it rather than authored, so
// the angle is the knob and the geometry follows: 15 deg at 365 m puts the
// camera 97.8 m shoreward of what it looks at, against the 40 m (6.25 deg) it
// stood at before. If this ever wants to be an angle above the HORIZON
// instead, it is DRONE_ALT_M / tan(angle) and the constant below is the only
// line that changes.
const DRONE_ALT_M = 365;
const DRONE_TILT_DEG = 15;
const DRONE_OFFSET_M = DRONE_ALT_M * Math.tan(DRONE_TILT_DEG * Math.PI / 180);
// Cover camera (the close-up). Standoff is the one knob worth touching: at
// 16 m a ~5 m crest subtends most of a 28 deg frame, which is the cover crop.
// Eye height is near the surface on purpose — a lip reads as an overhang only
// against a low horizon — and the aim sits a little above still water so the
// frame carries the lip rather than centring on the trough.
const COVER_STANDOFF_M = 16;
const COVER_EYE_M = 2.4;
const COVER_AIM_Y_M = 3.2;
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
  const q = readHashParams().get('q');
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
let activeMonthKey = null;   // climatological month currently applied (#month=)
let clampEnabled = true;     // #clamp=0 A/B revert: draw the requested H0 raw
let activeClamp = null;      // set by setDerivedH0() when the peel floor binds

let lastWrittenHash = null;  // what writeHash() last put in the URL (see hashchange)
// Boot reads the hash, then flips this. Without the gate the first
// refreshHUD() would serialise the default view over the author's link
// before applyHashParams() had a chance to read it.
let hashSyncReady = false;
const ROUND_TRIP_KEYS = new Set(ROUND_TRIP_PARAMS);
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
  u_gapMask:    { value: 1 },   // section-gap masking ON; #gap=0 is the A/B revert
  u_headRead:   { value: 1 },   // comet-head aging ON — the first "#head=0 way better" verdict was
                                // judged on a drifted OrbitControls camera; the clean-load rematch
                                // (2026-08-14 night) went to #head=1. #head=0 stays the A/B revert.
  u_pockSize:   { value: 1 },   // pocket footprint ~ H_eff ON; #pock=0 is the A/B revert
  u_lipSize:    { value: 1 },   // pocket->whitewater path carries the foam field's own size
                                // factor (model-glsl foamSizeAt): lipFoam and GRID_FRAG's
                                // pocket foam floor were the only two foam terms outside the
                                // SIZE_AUDIT contract. #lipn=0 is the A/B revert
  u_stripeLife: { value: 0 },   // per-stripe along-crest lifecycle clock; #slife=1 arms it
                                // (feature flag, OFF pending a live verdict — repo convention
                                // for unverified visual mechanisms)
  u_lipAer:     { value: 1 },   // aerated lip/curl whitening keyed to the fold geometry;
                                // #lip=0 is the pre-anatomy A/B revert
  u_breakMix:   { value: 0 },
  u_breakX:     { value: new THREE.Vector2(-300, 300) },
  u_breakZ:     { value: new THREE.Vector2(BREAK_Z_MIN, BREAK_Z_MAX) },
  u_surferPos:  { value: new THREE.Vector4() },
  // M6 part 3 (staged, water only — see the spec). Off unless #psi=1.
  u_refrTex:    { value: EMPTY_BED },
  u_psiMix:     { value: 0 },
  u_shelterMix: { value: 1 },  // H_eff sheltering field; #shelter=0 reverts to flat H0
  u_refrZ:      { value: new THREE.Vector2(REFR_ZC_MIN, REFR_ZC_MAX) },
  u_refrPsi:    { value: new THREE.Vector2(0, 1) },
  u_refrKappa:  { value: 0 },
  // Set-envelope anchor (2026-08-18): u_setRef = stage-median rayS of the
  // live break line (recomputed each frame below); u_setAnchor gates the
  // whole re-reference — #arm=0 is the A/B revert to the legacy phase, under
  // which the house capture clocks (sim 36-54) sample a set lull at the line
  // (the 6b arm diagnosis; see model-glsl.js u_setRef header).
  u_setRef:     { value: 0 },
  u_setAnchor:  { value: 1 },
  // Set-envelope modulation depth (2026-08-18): the envelope was zero-floored
  // at 100% depth, so the lull drew water flatter than the physical sea for a
  // large part of every beat. Floor = 1 - 2m = 0.15, derived from the SC116
  // spectra (PP_SPECTRAL_SETS section 7). #env=0 restores the zero floor.
  u_setDepth:   { value: SET_DEPTH },
  u_armRead:    { value: 1 },   // comet tail in metres behind the head; #arm bisects
  // Crest-clock continuity (2026-08-18): the foam clocks are sawtooths whose
  // snap lands on a crest line and drew a straight hard foam edge. Ramped by
  // default; #wrap=0 restores the raw mod() (see crestClockS in model-glsl).
  u_crestWrap:  { value: 1 },
  // Marine-layer fog dial (shaders.js FOG_GLSL/SKY_GLSL): u_fogAmt scales the
  // shipped density (1 = the pre-knob image, exactly — x1.0 is exact in IEEE),
  // u_fogBank arms drifting density banks (0 = uniform layer). state.fog /
  // state.fogBank are the source of truth (drawer sliders, #fog=/#bank=,
  // condition days); the frame sync writes them here, through the burn-off
  // envelope (fog.js) when state.burnoff is armed.
  u_fogAmt:     { value: 1 },
  u_fogBank:    { value: 0 },
  // modeled-domain matte (shaders.js provenanceAt) — #matte=0 reverts
  u_matte:      { value: 1 },
  u_wwArea:     { value: 1 },  // 4a' whitewater-area coupling; #wwarea=0 is the pre-fix A/B
  u_cgLegacy:   { value: 0 },  // 6a group-speed A/B; #cg=0 re-arms the retired 0.5*LAM/T envelope speed
  u_crestRead:  { value: 1 },  // Track 5 crest-first read (face darkening + fresh core); #crest=0 reverts
  u_kelpDark:   { value: 1 },  // kelp wedge dark over the reef (NAIP polarity); #kelp=0 reverts
  // Forward pitch: the EVEN phase-skew map + its retuned q schedule (the
  // 2026-08-10 odd map was fore-aft symmetric by construction). #pitch=0
  // re-arms the odd form AND its q schedule together, so the A/B is exact.
  u_pitchOdd:   { value: 0 },
  // Field-video fidelity probe: 0 shipped/current, 1 foam material only,
  // 2 foam + per-wave hierarchy + tightened face/lip. #look= names the A/B.
  u_fidelityLook: { value: 0 },
  // Lip overturn (shaders.js choppyPos). Promoted with lip/curtain/onset after
  // the 2026-08-26 all-preset matrix removed detached head plates on every
  // mapped drone view; #curl=0 restores the translated throw/drop path.
  u_curl:       { value: 1 },
  // #earn=0 reverts: inside the #curl bend, over-ceiling breaking water earns
  // the arc angle that returns its apex to the ceiling (the head-block fix and
  // the "reference height, not a clamp" decision — see choppyPos). Ships ON as
  // part of the promoted bend; it becomes inert on the #curl=0 revert arm.
  u_earn:       { value: 1 },
  // The crash: curl accelerates into the shared impact clock, releases, then
  // splash/spray take the landing. #splash=0 is the pre-crash A/B revert;
  // positive values remain a gain on the calibrated 0.90*H0 burst.
  u_splash:     { value: 1 },
  // #sapp= unbundles the approach-term strength from #look=full. 0.22 is now
  // the calibrated default: it halves the measured runaway-offset population
  // and removes the oversized head plate; #sapp=0.42 is the legacy A/B.
  u_sApp:       { value: 0.22 },
  // Overturn develops behind the zipper head (causality gate on the breaker
  // clock). Promoted with the anatomy bundle; #onset=0 restores the symmetric
  // pocket that handed fully-developed fold reach to water ahead of the head.
  u_onset:      { value: 1 },
  // #drop=legacy: restore the pre-2026-08-18 dropMag, which was proportional to
  // the height it was subtracted from and weighted only by `pocket`, so the
  // wave came out flattest exactly at the breaking pocket (median crest /
  // depth-limited ceiling 0.78 there against 1.05 one station away). The fix
  // ships ON — this is the revert arm for the A/B, not a feature flag.
  u_legacyDrop: { value: 0 },
  // Soft knee on choppyPos' horizontal-offset bound, metres (#knee). The bound
  // itself (OFF_MAX_M = 20 m, shaders.js) is UNCHANGED; what changes is that a
  // hard min() mapped every over-limit vertex onto one surface, collapsing the
  // neighbourhood's relative displacement and drawing a flat faceted slab on
  // the breaking crest. Measured pile-up before the fix: the |off| histogram
  // decays to 247 samples in the 16-18 m bin and then spikes to 1135 in
  // 18-20 m, 3.3% sitting at >= 19.5 m. Ships ON — a defect fix, not a look —
  // with `#knee=0` as the bit-identical revert arm. See the note at the clamp.
  u_offKnee:    { value: OFF_KNEE_FRAC },
  // Wave-derived offset ceiling, S/k — the cusp condition written as a length
  // (S = 1 and |off| = 1/k are the same statement; 1/k = LAM/2pi is also the
  // Gerstner cusp radius). Replaces a flat 20 m that had no wave in it and
  // could not be right at two sizes at once. Scale-free: it tightens on its
  // own as the wavelength shoals. Ships ON, `#lamcap=0` reverts to the flat
  // ceiling. Aimed at the crease class (S small, offsets large anyway), NOT at
  // the crest slab — that is the Sapp calibration, see the note at the clamp.
  u_lamCap:     { value: 1 },
  // Instrument: drop the offset bound entirely so the RAW distribution can be
  // read (it is how 73.6 m was found under a 20 m clamp). JS-only on purpose —
  // no hash param, because an unbounded mesh is not a state anyone should be
  // able to land on from a URL.
  u_offUnbound: { value: 0 },
  // The choppy solve's amplitude. lam = S/(a*k^2) is derived from h = a*cos(kx)
  // and wants the CARRIER's amplitude; it reads abs(h), the instantaneous
  // displacement, which goes to zero between crests. ocean() has always held
  // the honest number and now returns it.
  //
  // DEFAULT OFF, AND THE REASON IS A MEASUREMENT, NOT CAUTION (2026-08-22).
  // The substitution is correct and it makes things WORSE as it stands,
  // because S was calibrated on top of the wrong amplitude. Bounded, at
  // sewers t = 36/42/54: fold points 365/531/359 -> 415/563/440, i.e. +6..+23%,
  // and folded transects 78/96/74% -> 83/96/87%. Unbounded, which is where the
  // mechanism shows: max |off| 73.4 -> 145.4 m — DOUBLED — while the BULK
  // improves (samples over 20 m 455 -> 375, fold points 1091 -> 940). So the
  // carrier amplitude fixes the middle of the distribution and blows up its
  // tail, in the lull and the far field, exactly where amp -> 0 and lam
  // = S/(a*k^2) has nothing left to divide by. The old 0.30*H0*VIS floor was
  // covering that, which is why it existed.
  //
  // THE REAL FINDING: with the true 'a', S finally MEANS what it says (the
  // cusp parameter of h = a*cos), and every S constant in choppyPos — Sapp
  // 0.42, Sover's 0.15 + 1.30*plunge — was tuned against an 'a' that was
  // roughly 2x the carrier at crests and near zero in troughs. Turning this on
  // without re-deriving those is the documented trap: fixing a feature's SCALE
  // invalidates the thresholds tuned to it, and accuracy drops. Re-tune S
  // against the honest 'a', THEN flip this. The plumbing and the number stay
  // available in the meantime.
  u_carrierAmp: { value: 0 },
  // Instrument for the S re-derivation sweep (shaders.js choppyPos). Scales
  // the cusp parameter as one number so the mis-scaling introduced by the
  // honest carrier amplitude can be READ OFF the fold statistics rather than
  // argued from algebra. Default 1 = shipped. JS-only; if a value is adopted
  // it gets baked into the constants and this goes away.
  u_sScale:     { value: 1 },
  // The lip throw measured in the wave's own length (shaders.js choppyPos).
  // The shipped form is face height times a magic 5.0 — a magnitude with no
  // wave length in it, convicted by the argmax at ~51 m of throw on a crest
  // whose ceiling is 7.34 m. Default OFF until the calibration is measured.
  u_throwLen:   { value: 0 },
  // Let the breaking-excess size signal through the clamps that were eating
  // it (shaders.js choppyPos). Measured: excess runs 0.43/0.95/1.62/1.94 over
  // H0 0.7/1.5/2.5/3.0 and was clamped at 1.5 by sizeGate and again at 1.8 by
  // S. Growth is keyed to (excessQ - 1), which is zero at the card day, so
  // that day is bit-exact by construction. Default OFF pending measurement.
  u_sGrow:      { value: 0 },
  // Land-vertex wave-math skip threshold, m above still water (shaders.js
  // surfacePos). A uniform rather than a const so it can be A/B'd inside ONE
  // page session — GPU timing across separate browser launches is too noisy
  // to resolve the effect (3.1-4.4 ms for identical configs, measured).
  u_landSkipM:  { value: 6.0 },
};
applyBed(uniforms, state.geoSpot, state.tide || 0, state.bedShape || 0);

// curlProbe scratch (see __pointbreak.curlProbe). Built lazily: a headless
// measurement pays for it, a normal page load never allocates the target.
let curlProbeRT = null, curlProbeMat = null, curlProbeQuad = null,
    curlProbeScene = null, curlProbeCam = null;

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

// ---------- the curtain (default ON; #curtain=0 reverts) ----------
// The falling sheet joining the bent lip back down to the face — the geometry
// the 2026-08-22 overhang measurement said was missing (TODO, top). A strip:
// x alongshore in world metres, y the fall parameter; both edges are authored
// by CURTAIN_VERT from the shipped surfacePos, so the curtain hangs from the
// drawn lip and lands on the drawn face with no seam to tune. Gated on the
// bend's own overturn (vCurl's source), so it draws NOTHING unless curl is on —
// the two are one promoted anatomy bundle and are judged together.
const curtainMat = new THREE.ShaderMaterial({
  vertexShader: CURTAIN_VERT,
  fragmentShader: CURTAIN_FRAG,
  uniforms,
  transparent: true,
  depthWrite: true,            // it must OCCLUDE the bare water behind it
  side: THREE.DoubleSide,      // seen from the beach and from inside the barrel
});
const curtainMesh = new THREE.Mesh(new THREE.PlaneGeometry(570, 1, 240, 12), curtainMat);
curtainMesh.frustumCulled = false;  // positions are shader-authored
curtainMesh.visible = true;
scene.add(curtainMesh);

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
  // shared objects — one sim time, and the fog dial so a socked-in day
  // flattens the dome to the same haze the surface fog fades toward
  uniforms: { u_time: uniforms.u_time, u_fogAmt: uniforms.u_fogAmt },
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
    // 6a group-speed A/B (#cg=0): keeps the twins on the shader's envelope.
    cgLegacy: uniforms.u_cgLegacy.value > 0.5,
    // Forward-pitch A/B (#pitch=0): the twin has no skew (depthMix = 0 path)
    // but DOES carry the q schedule, so it has to revert with the shader.
    pitchOdd: uniforms.u_pitchOdd.value > 0.5,
    // Set-envelope anchor: the uniforms are the one source (updated in the
    // frame sync below), so twin heights and GPU foam agree about when the
    // set is on the line. See model-js setEnv.
    setRef: uniforms.u_setRef.value, setAnchor: uniforms.u_setAnchor.value,
    // Set-envelope modulation depth (#env). Same one-source rule: the twin
    // heights, the audio voice envelope and the GPU surface must share a floor.
    setDepth: uniforms.u_setDepth.value,
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

// ---------- camera aim: the BAKED line owns "where to look" ----------
// TODO Track 2 cheap partial. The rigs aimed via authored breakLineJS while
// the drawn line is the baked H0*Ks >= gamma*h locus (bed.js bakeBreakLine),
// which sits elsewhere — 5-9 deg of aim error. MODEL.md 4.5 assigns break
// LOCATION to physics, and the camera is a consumer of location, so the rigs
// now frame the bake's ACTION CENTROID: the mean (x, z) of the baked line over
// the stage with section-gap stations excluded (a gap is a withdrawn breaking
// claim — aiming at one frames water that deliberately does nothing).
//
// STABILITY over accuracy: the centroid is smoothed with a first-order lag in
// SIM seconds (rate independence — pause freezes it, speed scales it with the
// waves), because a camera that twitches when the tide moves the bake reads
// worse than a slightly-off camera. A preset switch SNAPS instead: gliding the
// aim across a re-centered world would pan through 100s of metres of nothing.
// #aim=0 is the A/B revert (authored-line aim, bit-identical to the old rigs).
let aimEnabled = true;
const AIM_TAU_S = 6;                  // aim glide time constant, sim seconds
const AIM_STEP_M = 5;                 // centroid sampling step along the stage
const aimState = { x: 0, z: 0, ok: false, preset: null };

// Raw (unsmoothed) action centroid of the current bake, or null without one.
// Same stage restriction as stageAlpha(): the bake's flat flanks are not surf.
function bakedAimCentroid() {
  if (!lastBaked) return null;
  const P = modelP();
  const lo = (P.stageStart ?? -110) + 10, hi = (P.stageEnd ?? 290) - 10;
  let sx = 0, sz = 0, n = 0;
  for (let x = lo; x <= hi; x += AIM_STEP_M) {
    if (breakGapAt(x, lastBaked.x0, lastBaked.x1)) continue;
    const z = breakZAt(x, lastBaked.x0, lastBaked.x1);
    if (!Number.isFinite(z)) continue;
    sx += x; sz += z; n++;
  }
  return n ? { x: sx / n, z: sz / n } : null;
}

function updateAim(simDt) {
  if (!aimEnabled || !lastBaked) { aimState.ok = false; return; }
  const c = bakedAimCentroid();
  if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.z)) { aimState.ok = false; return; }
  if (!aimState.ok || aimState.preset !== state.preset) {
    aimState.x = c.x; aimState.z = c.z;
    aimState.ok = true; aimState.preset = state.preset;
    return;
  }
  // First-order lag: k depends only on elapsed sim seconds, never on frame
  // rate — 63% of a tide-moved line is absorbed after AIM_TAU_S seconds
  // whether that took 60 frames or 600.
  const k = 1 - Math.exp(-Math.max(simDt, 0) / AIM_TAU_S);
  aimState.x += (c.x - aimState.x) * k;
  aimState.z += (c.z - aimState.z) * k;
}

const aimOn = () => aimEnabled && aimState.ok;

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
  // Cliff/Lineup/Drone aim at the baked line's action centroid when a bake
  // exists (see "camera aim" above); each closure keeps its authored-line
  // framing as the fallback (unmapped site, A-frame, #m4=0) and as the #aim=0
  // A/B revert. Lineup and Drone translate their whole rig with the aim point
  // so the pos/target geometry (and therefore the shot's character) is
  // unchanged — only where it is parked moves.
  { name: 'Cliff',  pos: () => cliffStation(cliffStationX()),
    target: () => aimOn() ? [aimState.x, 2, aimState.z]
                          : [-30, 2, breakLineJS(-30) - 25], fov: 30 },
  { name: 'Lineup', pos: () => aimOn() ? [aimState.x + 35, 8.5, aimState.z - 30]
                                       : [35, 8.5, breakLineJS(35) - 30],
    target: () => aimOn() ? [aimState.x, 4.0, aimState.z + 2]
                          : [0, 4.0, breakLineJS(0) + 2], fov: 32 },
  // Drone is deliberately NOT nadir (2026-08-22). It was pos.y = 365 over a
  // 40 m shoreward offset, i.e. atan(40/365) = 6.25 deg off straight down —
  // near enough to top-down that the wave read as a plan diagram: a crest has
  // no silhouette from directly above, so height, fold and lip all project
  // onto nothing and the shot could only ever show the PLAN of the break
  // (peel direction, foam area) and never its FORM. Tilting to
  // DRONE_TILT_DEG off nadir gives the crest something to stand up against.
  // Altitude is held and the station moves, so the scale of the shot is
  // unchanged to within 1/cos(tilt) = 3.5%; only the obliquity moves.
  //
  // NOTE FOR THE INSTRUMENTS: the QA sets sheet shoots every row at cam=drone
  // and reports a bright-PIXEL fraction, which is a projection of the scene
  // into THIS camera. Those numbers are not comparable across this change —
  // rebuild the sheet rather than diffing pix columns over it.
  { name: 'Drone',  pos: () => aimOn() ? [aimState.x, DRONE_ALT_M, aimState.z + DRONE_OFFSET_M]
                                       : [0, DRONE_ALT_M, STAGE_Z0 + DRONE_OFFSET_M],
    target: () => aimOn() ? [aimState.x, 0, aimState.z]
                          : [0, 0, STAGE_Z0] },
  // The headland shot. Round-2 finding (ROUND2_FINDINGS_2026-08-11): Sewer
  // Peak's DEM patch already carries 111.5 deg of coastline rotation including
  // the OSM apex — the Drone framing just crops it (footprint ends z=+173 m,
  // the corner's limbs sweep to +320). Higher and aimed shoreward, the corner
  // is in frame; a camera fix, not geometry work.
  // ---- Cover: the close-up (2026-08-22) ----------------------------------
  // The magazine-cover shot, and the only camera in the bank built to judge
  // APPEARANCE rather than to read the model. Every other preset frames the
  // stage: Cliff and Lineup stand off tens of metres to keep a peel in frame,
  // Drone reads the plan. None of them puts water close enough to ask whether
  // the surface is convincing AS WATER, which is the question a cover asks.
  //
  // Geometry, and why each number: it stands COVER_STANDOFF_M off the aim
  // point — the baked line's action centroid, i.e. the travelling breakpoint,
  // so the shot is on the pocket by construction and follows it as the peel
  // runs — down-point of it (aim.x + standoff) so the wave is coming toward
  // the lens and presents its face rather than being seen edge-on, and
  // SHOREWARD of it (aim.z + standoff*0.55) so the camera looks BACK at the
  // advancing face, which is the side a wave's face is on and where a water
  // photographer sits. (First cut had this seaward and framed the BACK of the
  // swell — an unlit dark hump against sky, no lip, no pocket. The face is
  // shoreward of the crest; the sign is the whole shot.)
  // COVER_EYE_M is deliberately near the surface: a lip only
  // overhangs against a low horizon, and from any height the barrel closes up.
  // Telephoto (fov 28) crops the stage out and lets the wave fill the frame.
  //
  // A HAZARD, stated: this parks the camera close to, and sometimes inside,
  // breaking water — which is what it is for. The world-collision clamp
  // (#noclip) is what keeps it out of the mesh; if the clamp ever fights the
  // framing, that is the clamp doing its job and the standoff wants raising,
  // not the clamp disabling.
  { name: 'Cover',  pos: () => aimOn()
      ? [aimState.x + COVER_STANDOFF_M, COVER_EYE_M, aimState.z + COVER_STANDOFF_M*0.55]
      : [COVER_STANDOFF_M, COVER_EYE_M, breakLineJS(COVER_STANDOFF_M) + COVER_STANDOFF_M*0.55],
    target: () => aimOn() ? [aimState.x, COVER_AIM_Y_M, aimState.z]
                          : [0, COVER_AIM_Y_M, breakLineJS(0)], fov: 28 },
  { name: 'Point',  pos: () => [0, 560, 200],                                 target: () => [0, 0, 140] },
  { name: 'Follow', pos: () => cliffStation(cliffStationX()),                 target: () => [0, 2, breakLineJS(0) - 11] },
  // Tour's own pos/target is only where it is parked before the first cut —
  // the legs resolve through CAM_PRESETS by name (TOUR_SHOTS). Kept in step
  // with Drone so the park frame and the first leg are the same shot.
  { name: 'Tour',   pos: () => [0, DRONE_ALT_M, STAGE_Z0 + DRONE_OFFSET_M],   target: () => [0, 0, STAGE_Z0] },
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

// Aim tracking stops the moment the user grabs the orbit and stays off until
// the next explicit camera choice: the reader's framing outranks the rig's.
let userOrbited = false;
controls.addEventListener('start', () => { userOrbited = true; });
// The shots that follow the aim point per frame while the user has not taken
// over. Follow is deliberately absent — it tracks the rider, who already rides
// the baked line (m4RideSolve), so it aims off the bake by construction.
const AIM_SHOTS = new Set(['Cliff', 'Lineup', 'Drone', 'Cover']);

function applyCam(i) {
  camIdx = i;
  userOrbited = false;
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
  userOrbited = false;
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
const hudClamp = document.getElementById('hudClamp');
const hudClampKey = document.getElementById('hudClampKey');
const topMenusEl = document.getElementById('topMenus');
const topPaused = document.getElementById('topPaused');
const siteControls = document.getElementById('siteControls');
const cameraControls = document.getElementById('cameraControls');
const menuToggle = document.getElementById('menuToggle');
const menuClose = document.getElementById('menuClose');
const drawerBackdrop = document.getElementById('drawerBackdrop');
const controlDrawer = document.getElementById('controlDrawer');
const breakKeys = document.getElementById('breakKeys');
const uiReveal = document.getElementById('uiReveal');
const waveSizeControl = document.getElementById('waveSizeControl');
const waveSizeValue = document.getElementById('waveSizeValue');
const monthControl = document.getElementById('monthControl');
const monthValue = document.getElementById('monthValue');
const tideControl = document.getElementById('tideControl');
const tideValue = document.getElementById('tideValue');
const fogControl = document.getElementById('fogControl');
const fogValue = document.getElementById('fogValue');
const fogBankControl = document.getElementById('fogBankControl');
const fogBankValue = document.getElementById('fogBankValue');
const sectionPositionControl = document.getElementById('sectionPositionControl');
const sectionPosition = document.getElementById('sectionPosition');
const sectionPositionValue = document.getElementById('sectionPositionValue');

function syncControlUI() {
  syncTopMenus();
  if (topPaused) topPaused.hidden = !state.paused;

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
    burnoff: Boolean(state.burnoff),
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

  if (waveSizeControl) waveSizeControl.value = String(state.H0);
  if (waveSizeValue) {
    const ft = state.H0 * 3.28084;
    waveSizeValue.textContent = `${state.H0.toFixed(1)} m · ${ft.toFixed(1)} ft`;
  }
  if (tideControl) tideControl.value = String(state.tide || 0);
  if (tideValue) {
    const tide = state.tide || 0;
    tideValue.textContent = `${tide >= 0 ? '+' : ''}${tide.toFixed(2)} m · ${tideLabel(tide)}`;
  }
  if (fogControl) fogControl.value = String(state.fog ?? 1);
  if (fogValue) {
    const f = state.fog ?? 1;
    const word = f < 0.7 ? 'crisp' : f < 1.3 ? 'clear' : f < 2.5 ? 'hazy'
      : f < 4.5 ? 'thick' : 'socked in';
    fogValue.textContent = `×${f.toFixed(1)} · ${word}`;
  }
  if (fogBankControl) fogBankControl.value = String(state.fogBank ?? 0);
  if (fogBankValue) {
    const b = state.fogBank ?? 0;
    fogBankValue.textContent = b < 0.025 ? 'off' : `${Math.round(b * 100)}%`;
  }
  if (monthControl) {
    monthControl.value = activeMonthKey || 'card';
    if (monthValue) {
      const m = activeMonthKey ? getMonthlyOcean(activeMonthKey) : null;
      // Same honesty as the HUD row: the control must not read back a height
      // the model is not drawing.
      monthValue.textContent = !m ? 'Preset ocean'
        : activeClamp?.bound
          ? `p${MONTHLY_OCEAN_PCT} ${m.H0.toFixed(2)} m → drawn ${activeClamp.applied.toFixed(2)} m (peel floor)`
          : `p${MONTHLY_OCEAN_PCT} · ${m.H0.toFixed(2)} m`;
    }
  }
  const dayButton = document.querySelector('[data-cycle="condition-day"]');
  if (dayButton) {
    dayButton.querySelector('.control-state').textContent = activeDayLabel || 'Preset ocean';
  }
  const bedButton = document.querySelector('[data-cycle="bed"]');
  if (bedButton) {
    bedButton.querySelector('.control-state').textContent = ['Measured + reef', 'Plane', 'Measured'][state.bedShape || 0];
  }
  if (sectionPositionControl) sectionPositionControl.hidden = !showSection;
  if (sectionPosition) sectionPosition.value = String(sectionX);
  if (sectionPositionValue) sectionPositionValue.textContent = `${sectionX >= 0 ? '+' : ''}${sectionX} m`;
}

function refreshHUD() {
  const p = state.preset ? PRESETS[state.preset].label : 'custom';
  hudPreset.textContent = state.paused ? p + ' (paused)' : p;
  hudCam.textContent = CAM_PRESETS[camIdx].name;
  hudSurfer.textContent = state.surfer ? 'on' : 'off';
  if (hudAudio) hudAudio.textContent = isAudioEnabled() ? 'on' : 'off (M)';
  if (hudAlpha) {
    const incident = directionPhaseForSpot({
      psiEnabled, geoSpot: state.geoSpot, waveFromDeg: state.swellDp,
      authoredAlphaDeg: state.alpha,
    });
    const directionTxt = incident
      ? `Dₚ ${incident.waveFromDeg.toFixed(0)}° → ${incident.incidentDeg.toFixed(0)}° incidence · `
      : '';
    if (uniforms.u_breakMix.value > 0.5) {
      const derived = derivedAlphaDeg(0, uniforms.u_breakX.value.x, uniforms.u_breakX.value.y);
      // M5: with the synthetic reef in the grid (bed mode 0), alpha returns as
      // a character TARGET the reef was fitted to — report target, derived and
      // the synthetic label together, never the derived number alone. If the
      // fit missed tolerance the residual is not hidden: the numbers show it.
      const fit = (state.bedShape || 0) === 0 ? reefFitFor(state.geoSpot) : null;
      // Report the STAGE median alongside the x = 0 number, never x = 0 alone.
      // x = 0 sits inside the reef fit's own station window, so on its own it
      // says the fit converged, not that the wave peels (2026-08-13 measurement;
      // __pointbreak.stageAlpha above). The two disagree by 40-50 deg on Second
      // Peak, Jack's and Sharks, where the oblique run ends in a dead
      // down-point third.
      const sa = window.__pointbreak && window.__pointbreak.stageAlpha
        ? window.__pointbreak.stageAlpha() : null;
      // Report the limiter-cleaned median: pinned stations read the slew clamp
      // (67-71 deg, physically impossible), and averaging them in overstated
      // the stage on every spot. The excluded count stays visible so a pinned
      // regime is never silently absorbed (TODO "BREAK-LINE V STILL PRESENT").
      const stageTxt = sa
        ? ` · ${(sa.medianClean ?? sa.median).toFixed(0)}° stage` +
          (sa.pinnedN ? ` (${sa.pinnedN}/${sa.stations} pinned excl)` : '')
        : '';
      hudAlpha.textContent = fit
        ? `${directionTxt}α ${fit.targetDeg}° target · ${derived.toFixed(0)}° at x0${stageTxt} · reef synthetic`
        : `${directionTxt}${derived.toFixed(0)}° at x0${stageTxt}`;
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
    // SIZE-CALIBRATION BOUND, said out loud (2026-08-19). The whole foam field
    // is normalized by model-glsl foamSizeAt() = clamp(H0*shelter/1.5, 0.55,
    // 1.6), so OUTSIDE that band whitewater stops responding to swell height:
    // at the reef anchor (shelter = 1) the floor binds below H0 = 0.825 m and
    // the ceiling above 2.4 m. The shipped `h0` control spans 0.4-3.0 m and the
    // SC116 climatology's summer months sit at 0.585-0.80 m, so a third of the
    // reachable low end renders size-blind foam — which is exactly the regime
    // where a QA sheet read "more whitewater at half the swell" and the model
    // could not answer for itself. The clamp stays (a tiny day must still show
    // whitewater); what changes is that it is no longer silent.
    const sizeK = state.H0 / 1.5;
    const clampNote = sizeK < 0.55 ? ' · foam size ×0.55 floor'
      : sizeK > 1.6 ? ' · foam size ×1.6 ceiling' : '';
    hudSwell.textContent =
      `${state.H0.toFixed(1)} m (${ft.toFixed(1)} ft) · T ${state.T} s${clampNote}`;
  }
  // THE CLAMP MUST NOT BE SILENT. When the peel floor binds, the height on
  // screen is not the height the climatology asked for, and a reader who
  // cannot see that cannot tell a season from a floor. Same discipline as
  // Privates announcing its synthetic stage and the month row naming its
  // percentile: name BOTH numbers, and name the flag that reverts it. The row
  // is hidden entirely when nothing is clamped — an always-on "not clamped"
  // would be noise on every other state.
  if (hudClamp && hudClampKey) {
    const c = activeClamp;
    hudClamp.hidden = !c;
    hudClampKey.hidden = !c;
    if (c) {
      const spot = PRESETS[c.spot]?.label || c.spot;
      const measured = `measured ${c.flip.floorLo.toFixed(2)}→${c.flip.floorHi.toFixed(2)} m, `
        + `α ${c.flip.alphaBelow.toFixed(1)}°→${c.flip.alphaAbove.toFixed(1)}° `
        + `against a ${c.flip.alphaTarget}° target`;
      hudClamp.textContent = c.bound
        ? `drawing ${c.applied.toFixed(2)} m — ${c.source} asks for ${c.requested.toFixed(3)} m. `
          + `${spot} loses its peel below ${c.applied.toFixed(2)} m (${measured}). `
          + `Size is clamped here — this is not the season's height. #clamp=0 draws it raw.`
        : `NOT applied. The floor at ${spot} is ${c.flip.floorH0.toFixed(2)} m and `
          + `${c.source} asks for ${c.requested.toFixed(3)} m, but it was ${measured} `
          + `at T ${c.flip.basisT} s and tide 0 — this state is at T ${c.T} s, tide `
          + `${c.tideM >= 0 ? '+' : ''}${c.tideM.toFixed(2)} m, so the number does not describe it. `
          + `Drawing the requested height unclamped; the peel here is whatever the bed gives.`;
    }
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
  // The percentile is named, not implied: p75 is a stated editorial choice
  // (the good day typical of the month, not the median), and a reader who
  // cannot see which percentile is on screen cannot tell that from tuning.
  const monthLabel = activeMonthKey
    ? `${getMonthlyOcean(activeMonthKey).label} · p${MONTHLY_OCEAN_PCT} climatology`
    : null;
  hudGeo.textContent = `${describeGeoState(state)} · ${structuralBreaker ? 'breaker anatomy' : 'legacy breaker'}`
    + (state.geoSpot ? ` · ${bedMode}` : '')
    + (activeDayLabel ? ` · ${activeDayLabel}` : '')
    + (monthLabel ? ` · ${monthLabel}` : '');
  syncControlUI();
  // Every control mutator already ends here, so this is the one place a
  // permalink write can be hung without threading syncHash() through a
  // dozen call sites and forgetting one. Coalesced to a frame, so a slider
  // drag is one write, not sixty.
  if (hashSyncReady) syncHash();
}

// Swell-height step, clamped to the PARAM_DEFS range. Rounded to the step so
// repeated presses land on clean values instead of drifting on float error.
const H0_DEF = PARAM_DEFS.find((d) => d.key === 'H0');
function clearActiveDay() {
  activeDayLabel = null;
  activeDayKey = null;
}

// A month owns H0 and nothing else, so only an H0 change (or a new site) can
// invalidate it — a tide move cannot, which is why this is separate from
// clearActiveDay() rather than folded into it.
function clearActiveMonth() {
  activeMonthKey = null;
}

// ---------- THE PEEL FLOOR: one owner for derived ocean height ----------
// Three things set H0 from a source that is not the site card — a #month=, a
// named #day=, and #day=live's nowcast — and all three route through here.
// One place, per MODEL.md 4.5: the same clamp in three call sites is three
// authorities on one quantity, which is the defect this repo keeps re-finding.
//
// WHAT IT DOES. Below a spot-specific H0 the baked line abandons the oblique
// reef branch and the peel collapses to a closeout — six of six mapped spots,
// measured to 0.01 m and hysteresis-free (shared/params.js PEEL_FLOOR, TODO
// 1c'-d). A derived ocean is held to the healthy side of that boundary.
//
// WHAT IT COSTS, said out loud because the HUD has to say it too: at Sewers
// the floor is 1.61 m and every monthly p75 at SC116 is 0.585-1.245 m, so all
// twelve months clamp to the same height and the seasonal signal — the entire
// reason #month= exists — is gone at that spot. That is a real loss, quantified
// per spot in MODEL.md "The peel floor: when the demo and the simulation
// disagree". It is taken deliberately over the alternative, which is drawing a
// closeout in 56% of the states a reader can reach and calling it Pleasure
// Point.
//
// WHAT IT DOES NOT TOUCH. Authored card H0s (a bare URL), the #h0= override and
// the +/- keys are the reader's or the author's own number and pass through
// untouched — every card H0 already sits above its own floor. `#clamp=0`
// reverts to the raw requested height for A/B.
//
// AND WHAT IT DECLINES TO TOUCH. The floors were measured at tide 0 and each
// site's card period, and the flip threshold is a surface in (H0, T, tide). A
// #month= keeps the card period and does not move the tide, so it sits on that
// basis exactly; a #day= moves all three and does not. Applying an off-basis
// number is MEASUREMENT_LESSONS 13, and here it does measurable harm — clamping
// `#day=small` up to the tide-0 floor took Sewers from alpha 12.8 to 3.9 and
// The Hook from 10.4 to 5.9, i.e. the clamp created two closeouts it was
// written to prevent. peelFloorH0() returns null off-basis and the request
// passes through unchanged, which leaves those states exactly as they shipped.
//
// `presetKey` is explicit because shared/cdip.js applyOcean() nulls
// state.preset ("live conditions, not a named preset") before this runs.
function setDerivedH0(requestedH0, sourceLabel, presetKey = state.preset) {
  const req = Math.min(Math.max(Number(requestedH0) || 0, H0_DEF.min), H0_DEF.max);
  const spec = PEEL_FLOOR[presetKey] || null;
  const floor = clampEnabled
    ? peelFloorH0(presetKey, { T: state.T, tideM: state.tide || 0 })
    : null;
  const bound = floor !== null && req < floor;
  // The state where a floor EXISTS, the request is under it, and the floor
  // declined on domain grounds is its own thing and gets its own disclosure.
  // Saying nothing there would leave a reader looking at a collapsed peel with
  // no account of it, which is the failure mode this row exists for.
  const offBasis = !bound && clampEnabled && spec !== null && floor === null
    && req < spec.floorH0;
  activeClamp = (bound || offBasis)
    ? { bound, offBasis, requested: req, applied: bound ? floor : req,
        source: sourceLabel, spot: presetKey, flip: spec,
        T: state.T, tideM: state.tide || 0 }
    : null;
  state.H0 = bound ? floor : req;
  if (uniforms?.u_H0) uniforms.u_H0.value = state.H0;
  return state.H0;
}

// A named condition-day, applied the one way. Same reason as setDerivedH0:
// applyConditionDay() was called from four places (hash, D key, #drift, boot)
// and each repeated the label bookkeeping, so the clamp would have had to be
// repeated four times too.
function setConditionDay(key) {
  const d = applyConditionDay(state, uniforms, key);
  if (!d) return null;
  activeDayKey = d.key;
  activeDayLabel = d.label;
  clearActiveMonth();
  setDerivedH0(d.H0, d.label);
  return d;
}

// Apply a climatological month: the pMONTHLY_OCEAN_PCT swell height typical of
// that month at SC116, already de-shoaled to the deep-water H0 the shader
// re-shoals from (see pp_monthly_ocean.js). Size only — the month deliberately
// does not touch T, tide, chop or dF. Returns the month or null.
//
// 'card' (or empty) means the site card's own authored ocean. If a month was
// on, its H0 must be handed back too — clearing only the label would leave
// the HUD saying "preset ocean" over January's water.
function setMonth(key) {
  if (!key || key === 'card') {
    if (activeMonthKey) {
      const card = state.preset ? PRESETS[state.preset] : null;
      if (card) {
        // The card's own authored H0, NOT routed through setDerivedH0 — this
        // is the bare-URL state and it must stay bit-identical.
        state.H0 = card.H0;
        if (uniforms?.u_H0) uniforms.u_H0.value = card.H0;
      }
      // Only when a month was actually on. setMonth(null) runs unconditionally
      // at the end of applyLiveParams, so clearing outside this branch wiped
      // the clamp record a #day= had just set two lines earlier — measured: the
      // day states clamped correctly (H0 0.70 -> 1.61 at Sewers) while the HUD
      // stayed silent about it, which is the exact failure this is here to stop.
      activeClamp = null;
    }
    clearActiveMonth();
    refreshHUD();
    return null;
  }
  const m = getMonthlyOcean(key);
  if (!m) return null;
  // Restore the site's own card character first. Without this a month picked
  // after a condition-day would keep that day's T/chop/dF — "January" at storm
  // junk's 9 s period — and the readout would name a month the ocean is not.
  // Tide is deliberately NOT restored: it is orthogonal to size and the user's
  // tide is theirs to keep. The measurement backs the card period here anyway:
  // interpolated spectral peak at SC116 is 14.4-15.2 s in every month.
  const card = state.preset ? PRESETS[state.preset] : null;
  if (card) {
    state.T = card.T;
    state.chop = card.chop;
    state.dF = card.dF;
    if (uniforms?.u_T) uniforms.u_T.value = card.T;
    if (uniforms?.u_chop) uniforms.u_chop.value = card.chop;
    if (uniforms?.u_dF) uniforms.u_dF.value = card.dF;
  }
  // A month and a named condition-day are rival descriptions of the same
  // ocean; the readout must never carry both.
  clearActiveDay();
  activeMonthKey = m.key;
  // The month's climatological p75 is a REQUEST. setDerivedH0 decides what the
  // model can actually draw at this spot and records the gap for the HUD.
  setDerivedH0(m.H0, `${m.label} p${MONTHLY_OCEAN_PCT}`);
  refreshHUD();
  return m;
}

function setH0(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  const snapped = Math.round(v / H0_DEF.step) * H0_DEF.step;
  // NOT routed through setDerivedH0: a typed #h0= or a +/- press is the
  // reader's own number, and the peel floor governs DERIVED oceans only.
  state.H0 = Math.min(Math.max(snapped, H0_DEF.min), H0_DEF.max);
  activeClamp = null;
  clearActiveDay();
  clearActiveMonth();
  refreshHUD();
}

function stepH0(dir) {
  setH0((state.H0 || 0) + dir * H0_DEF.step);
}

function setTide(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  state.tide = Math.min(Math.max(v, TIDE_RANGE[0]), TIDE_RANGE[1]);
  clearActiveDay();
  refreshHUD();
}

// Fog sliders clear the day for the same reason the tide slider does: a named
// day claims the whole morning, air included, and a hand-moved dial makes the
// label a lie. The burn-off toggle does NOT clear it — it is a time envelope
// over whatever base is on screen, not a rival description of the day.
// The dial floors at 0.3, not 0: coastal air is never optically empty, and
// with NO exponential under it the horizon floor in fogAmount() reads as a
// flat grey band ("minimum fog is not great", 2026-08-27 — measured by eye).
// At 0.3 the exponential rebuilds the gradient and the floor just finishes it.
const FOG_MIN = 0.3;
function setFog(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  state.fog = Math.min(Math.max(v, FOG_MIN), 8);
  clearActiveDay();
  refreshHUD();
}

function setFogBank(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  state.fogBank = Math.min(Math.max(v, 0), 1);
  clearActiveDay();
  refreshHUD();
}

function cycleConditionDay() {
  const i = CONDITION_DAYS.findIndex((day) => day.key === activeDayKey);
  const next = CONDITION_DAYS[(i + 1 + CONDITION_DAYS.length) % CONDITION_DAYS.length].key;
  if (setConditionDay(next)) refreshHUD();
}

function cycleBedMode() {
  state.bedShape = ((state.bedShape || 0) + 1) % 3;
  refreshHUD();
}

function setSectionX(value) {
  const v = Number(value);
  if (!Number.isFinite(v)) return;
  sectionX = Math.min(Math.max(Math.round(v / 25) * 25, -250), 250);
  syncControlUI();
}

function selectPreset(key) {
  if (!PRESETS[key]) return;
  applyPreset(state, key);
  // A site choice owns the reef only. Clear a named condition so the readout
  // cannot imply that the old ocean still describes the new selection.
  activeDayKey = null;
  activeDayLabel = null;
  activeClamp = null;   // applyPreset restored the card ocean; nothing is clamped
  clearActiveMonth();
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
  else if (normalized === '[') setTide((state.tide || 0) - 0.15);
  else if (normalized === ']') setTide((state.tide || 0) + 0.15);
  else if (normalized === '-' || normalized === '_') stepH0(-1);
  else if (normalized === '=' || normalized === '+') stepH0(+1);
  else if (normalized === 'd') cycleConditionDay();
  else if (normalized === 'b') cycleBedMode();
  else if (normalized === 'n') {
    structuralBreaker = structuralBreaker ? 0 : 1;
    uniforms.u_breakShape.value = structuralBreaker;
    refreshHUD();
  }
  else if (normalized === ',') setSectionX(sectionX - 25);
  else if (normalized === '.') setSectionX(sectionX + 25);
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
  onTide: setTide,
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
// M6 part 3: the phase field runs on the baked Psi. DEFAULT ON since
// 2026-08-13 (step 4): the rider solves in phase (m4RideSolve consumes
// P.phaseFn, step 2), the audio crest solve inverts rayPhase (sound.js,
// step 3), and setEnv/setupLiftM run the physical cg = gT/4pi — every
// consumer now shares one phase authority, which was the whole precondition
// for the flip. Measured at flip time: alpha-neutral vs base (identical
// stage-median on all six spots), crest spacing 104->55 m across the stage
// vs the frozen 90 m. `#psi=0` is the A/B revert.
let psiEnabled = true;
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

// ---------- appbar menus (break + camera) ----------
// The location and camera readouts ARE the selectors: two fisheye menubar
// items labelled with the current break and shot open their lists (vendored
// fisheye-menu, Fitts's-law item sizing). The spot list is a 1-D map of the
// point: items ordered by
// down-point arclength uM, base height proportional to each spot's stage
// window length (stageBoundsM[1] - stageBoundsM[0]; the windows tile the
// coastline, so the proportions are the coastline's own). Private's preset
// carries geoSpot null on purpose (no mapped reef), so menu geometry maps
// preset -> profile name explicitly instead of reading state semantics.
const SPOT_PROFILE_FOR_PRESET = { privates: "Private's" };
const SPOT_MARK_RGB = [121, 220, 255];   // --accent: the active spot
const SPOT_BLANK_RGB = [13, 20, 24];     // --panel: blank marker, keeps labels aligned

let spotMenuData = null;
let camMenuData = null;
let topBarItems = [];

function syncTopMenus() {
  if (!spotMenuData) return;
  const label = state.preset ? PRESETS[state.preset].label : 'Custom';
  if (topBarItems[0] && topBarItems[0].textContent !== label) topBarItems[0].textContent = label;
  // Panels are rebuilt from these arrays on every open; mutating swatches here
  // is all it takes to move the active markers.
  spotMenuData.children.forEach((child) => {
    child.swatch = child.key === state.preset ? SPOT_MARK_RGB : SPOT_BLANK_RGB;
  });
  const camName = CAM_PRESETS[camIdx].name;
  if (topBarItems[1] && topBarItems[1].textContent !== camName) topBarItems[1].textContent = camName;
  camMenuData?.children.forEach((child) => {
    child.swatch = child.camIdx === camIdx ? SPOT_MARK_RGB : SPOT_BLANK_RGB;
  });
}

function initTopMenus() {
  if (!topMenusEl) return;
  const children = presetKeys.map((key) => {
    const name = PRESETS[key].geoSpot ?? SPOT_PROFILE_FOR_PRESET[key];
    const profile = name ? PP_GEO_DATA.profiles[name] : null;
    const bounds = profile?.stageBoundsM;
    return {
      key,
      label: PRESETS[key].label,
      u: profile ? profile.uM : Infinity,
      weight: bounds ? bounds[1] - bounds[0] : 0,
    };
  }).sort((a, b) => a.u - b.u);
  // A spot with no profile still deserves a visible row: give it the mean
  // length rather than letting weight 0 fall back to 1 (a sliver).
  const known = children.filter((c) => c.weight > 0);
  const meanLen = known.reduce((a, c) => a + c.weight, 0) / Math.max(known.length, 1);
  children.forEach((c) => { if (!(c.weight > 0)) c.weight = meanLen || 1; });

  spotMenuData = { label: 'Break', children };
  camMenuData = {
    label: 'Camera',
    children: CAM_PRESETS.map((p, i) => ({ label: p.name, camIdx: i })),
  };
  createFisheyeMenu(topMenusEl, [spotMenuData, camMenuData], {
    // Budget: 7 x 48 = 336 px. Proportional weights put the shortest window
    // (First Peak, 132.6 m of coast) at ~22 px at rest — small but tappable,
    // and fisheye growth on approach does the rest. The camera menu has no
    // weights, so its seven rows sit uniformly at 48 px.
    baseHeight: 48,
    minHeight: 20,
    fontMin: 13,
    fontMax: 18,
    onSelect: (item) => {
      if (item.key) selectPreset(item.key);
      else if (Number.isInteger(item.camIdx)) applyCam(item.camIdx);
    },
  });
  topBarItems = Array.from(topMenusEl.querySelectorAll('.fisheye-menubar-item'));
  syncTopMenus();
}

function initControlUI() {
  waveSizeControl.min = String(H0_DEF.min);
  waveSizeControl.max = String(H0_DEF.max);
  waveSizeControl.step = String(H0_DEF.step);
  tideControl.min = String(TIDE_RANGE[0]);
  tideControl.max = String(TIDE_RANGE[1]);

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
  document.querySelector('[data-cycle="condition-day"]').addEventListener('click', cycleConditionDay);
  document.querySelector('[data-cycle="bed"]').addEventListener('click', cycleBedMode);
  if (monthControl) {
    for (const m of MONTHLY_OCEAN) {
      const opt = document.createElement('option');
      opt.value = m.key;
      opt.textContent = `${m.label} — ${m.H0.toFixed(2)} m`;
      monthControl.append(opt);
    }
    monthControl.addEventListener('change', () => setMonth(monthControl.value));
  }
  waveSizeControl.addEventListener('input', () => setH0(waveSizeControl.value));
  tideControl.addEventListener('input', () => setTide(tideControl.value));
  fogControl?.addEventListener('input', () => setFog(fogControl.value));
  fogBankControl?.addEventListener('input', () => setFogBank(fogBankControl.value));
  document.querySelector('[data-action="burnoff"]')?.addEventListener('click', () => {
    state.burnoff = !state.burnoff;
    refreshHUD();
  });
  sectionPosition.addEventListener('input', () => setSectionX(sectionPosition.value));

  initTopMenus();

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
      if (setConditionDay(nextGoodDay(activeDayKey))) refreshHUD();
    }
  }

  resize();
  uniforms.u_time.value = simTime;
  uniforms.u_T.value = state.T;
  uniforms.u_H0.value = state.H0;
  const incident = directionPhaseForSpot({
    psiEnabled, geoSpot: state.geoSpot, waveFromDeg: state.swellDp,
    authoredAlphaDeg: state.alpha,
  });
  const directionOptions = refractionDirectionOptions(incident);
  // Alpha still owns reef character and the legacy metric envelope. Direction
  // owns only the baked crest phase in this diagnostic; mixing the two here
  // would refract a 15 m observation a second time inside swellPhi().
  uniforms.u_alpha.value = state.alpha * Math.PI / 180;
  uniforms.u_xi.value = state.xi;
  uniforms.u_sections.value = state.sections;
  uniforms.u_dF.value = state.dF;
  uniforms.u_tau.value = state.tau;
  uniforms.u_chop.value = state.chop;
  uniforms.u_aframe.value = state.aframe;
  // Marine-layer fog: state is the base the reader (or a day) dialled; the
  // burn-off envelope (fog.js) rides on top when armed — dawn sheet, banks at
  // the half-burnt moment, then clear. Sim time, so #speed= scales the
  // morning and #sim= seeds how far into it the view starts.
  if (state.burnoff) {
    const env = burnoffFog(state.fog, state.fogBank, simTime);
    uniforms.u_fogAmt.value = env.fog;
    uniforms.u_fogBank.value = env.bank;
  } else {
    uniforms.u_fogAmt.value = Number.isFinite(state.fog) ? state.fog : 1;
    uniforms.u_fogBank.value = Number.isFinite(state.fogBank) ? state.fogBank : 0;
  }
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
    : incident
      ? bakeRefraction(state.geoSpot, {
          T: state.T, tide: state.tide || 0, bedShape: state.bedShape || 0,
          ...directionOptions, xRef: 0,
        })
      : bakeRefraction(state.geoSpot, {
          T: state.T, tide: state.tide || 0, bedShape: state.bedShape || 0,
          swellDeg: state.alpha, xRef: 0,
        });
  uniforms.u_psiMix.value = refr ? 1 : 0;
  // MODEL-TWIN of the shader's rayPhase(): kappa*x + Psi(contourZ). Null off
  // the Psi path, which makes rayPhase() fall back to the frozen-LAM plane
  // wave. Captured against a P WITHOUT phaseFn (contourZ never reads it, but
  // building modelP() inside its own field would recurse).
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
  // Advance the smoothed camera aim point from THIS frame's bake. Sim-time
  // delta, mirroring the simTime advance above: pause freezes the aim glide
  // with everything else, speed scales it with the waves.
  updateAim((!state.paused && Number.isFinite(dt)) ? dt * state.speed : 0);
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
  // ---- set-envelope anchor: where the LIVE line sits in ray coordinate ----
  // Stage-median rayS along the shipped break line. The baked emergent line
  // sits 74-247 m seaward of the authored contour (Sewers), and the group
  // envelope's legacy reference was the contour (s = 0) — so after the 6a cg
  // fix the house capture clocks sampled a set NULL at the line (probe
  // measurement in the model-glsl u_setRef header). Median over the stage,
  // not the full bake: the flat flanks would dominate a bake-wide summary
  // (MEASUREMENT_LESSONS 8c). ~35 closed-form evaluations per frame —
  // cheaper than the rider solve that precedes it. Authored fallback keeps
  // ref = 0 (its line IS the contour, where rayS ~ 0 already).
  if (baked) {
    const refP = modelP();
    const rLo = (state.stageStart ?? -110) + 10, rHi = (state.stageEnd ?? 290) - 10;
    const ss = [];
    for (let x = rLo; x <= rHi; x += 8) {
      const sRay = rayS(x, breakZAt(x, baked.x0, baked.x1), refP);
      if (Number.isFinite(sRay)) ss.push(sRay);
    }
    ss.sort((a, b) => a - b);
    uniforms.u_setRef.value = ss.length ? ss[Math.floor(ss.length / 2)] : 0;
  } else {
    uniforms.u_setRef.value = 0;
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

  // ---------- aim tracking (see "camera aim" above) ----------
  // The active aim-driven shot re-poses from its own closures every frame, so
  // a tide-moved bake GLIDES the frame (the closures read the smoothed aim
  // point) instead of leaving the camera staring at where the line used to be.
  // Stops for good once the user grabs the orbit; Follow frames are excluded
  // (the rider track owns them); with #aim=0 or no bake, aimOn() is false and
  // the rigs keep their set-once authored framing exactly as before.
  if (!following && aimOn() && !userOrbited) {
    const shot = touring ? TOUR_SHOTS[tourLeg] : CAM_PRESETS[camIdx].name;
    if (AIM_SHOTS.has(shot)) {
      const p = CAM_PRESETS.find((c) => c.name === shot);
      camera.position.set(...p.pos());
      controls.target.set(...p.target());
      // Tour skips controls.update() below, so orient explicitly there.
      if (touring) camera.lookAt(controls.target);
    }
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
      // The floor is in WORLD units and comes back null where there is no bed
      // to stand on. bedElevBlended used to be read here directly, which was
      // wrong twice over: it is NAVD88 rather than water-relative, and with no
      // grid it returns the BED_UNKNOWN sentinel — so at Privates (geoSpot
      // null) the "floor" was -999 m and the eye fell a kilometre through the
      // world and stayed there (measured 2026-08-21: settled 269 m under the
      // drawn ground, 982 m under a held pan, and it never came back).
      const measured = cameraFloorY(state.geoSpot, v.x, v.z, state.bedShape || 0,
                                    uniforms.u_waterLevel.value);
      // No bed bound means no bed is DRAWN either (u_depthMix 0 hides the
      // seabed mesh and the water grid's land path), so there is nothing to
      // collide with — but "nothing to collide with" is not "descend without
      // limit". Hold the declared dip instead of inventing a measurement.
      const floorY = (measured ?? -UNMAPPED_DIP_M) + (isTarget ? 0.0 : 0.4);
      // HARD, not eased (2026-08-21). The old form recovered half the
      // penetration per frame, and it ran after controls.update(), so any
      // input that lowered the eye faster than that per frame held it under
      // permanently: an OrbitControls pan moves at targetDistance*2/clientHeight
      // per pixel, ~15 m/frame from a 700 m orbit, which parked the eye 13.7 m
      // below the drawn terrace at EVERY mapped preset and bed mode — the
      // reported "looking up at the underside of the land" frame. An eased
      // constraint is a suggestion; the invariant is that the eye is never
      // below the bed at the END of a frame. Continuous input now slides the
      // eye ALONG the ground, which is smooth for the same reason the ease
      // was wanted, without leaving the violation standing.
      if (v.y < floorY) v.y = floorY;
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
//   #preset=secondpeak&cam=cliff&shape=legacy&section=1&bed=plane&tide=-0.5&surfer=1&sim=42&controls=0
// The ROUND-TRIP half of the hash contract: every param a reader can also
// change through the UI, in the order their interactions require. Split out of
// applyHashParams so boot and a hand-edited URL run the SAME code — the two
// drifting apart is exactly how a permalink starts describing a view that is
// not on screen. Everything else in applyHashParams (reef-shape sweeps, A/B
// reverts, feature flags, #sim) stays boot-only: re-running it would re-bake
// the reef and re-seed the clock, which is neither cheap nor idempotent.
function applyLiveParams(h, { shapeChanged = false } = {}) {
  const p = h.get('preset');
  if (p && PRESETS[p]) applyPreset(state, p);
  // No preset in the hash means applyPreset never re-ran applyBed, so the bed
  // would still be the load-time default one. Rebuild it explicitly.
  if (shapeChanged && !(p && PRESETS[p]))
    applyBed(uniforms, state.geoSpot, state.tide || 0, state.bedShape || 0);
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
        // applyOcean() nulls state.preset, so the spot has to be captured
        // first or the peel floor would have nothing to look itself up by.
        const spot = state.preset;
        applyOcean(state, o);
        activeDayLabel = `live · ${describeOcean(o)}`;
        clearActiveMonth();
        // The nowcast is a derived ocean like any other. A 0.6 m summer
        // morning at Sewers collapses the peel exactly the way August does.
        setDerivedH0(o.hs, `live SC116 nowcast`, spot);
        refreshHUD();
      })
      .catch(() => { activeDayLabel = 'live unavailable'; refreshHUD(); });
  } else if (dayKey) {
    setConditionDay(dayKey);
  } else {
    // No day in the hash means no named day on screen, or a re-apply would
    // leave a stale label naming an ocean the URL no longer asks for.
    clearActiveDay();
  }
  // #month= rides on the preset like #day= does, and loses to an explicit
  // #h0= below for the same reason #day= loses to #tide=: the specific value
  // in the permalink is the one the author meant.
  //
  // THE DEFAULT OCEAN IS THE SITE CARD, and a month is opt-in. A global
  // DEFAULT_MONTH_KEY shipped briefly on 2026-08-16 and is reverted here: its
  // stated motive was that booting into August shows an empty stage, but the
  // default was never a month — it is each spot's authored card day. The cost
  // was structural, not cosmetic. model-glsl.js SHELTER_* is calibrated by
  // log-linear fit of THE CARD BANK'S OWN H0 GRADIENT (2.2 m at Sewers to 0.7 m
  // at Private's, r^2 = 0.81): "the seven card H0s ARE the guides' sheltering
  // gradient sampled at the spots". One global H0 replaces all seven and
  // removes the calibration input, and measured, it collapsed the peel where
  // the spots sit furthest from it — Sewers alpha 38 -> 5, First Peak 50 -> 1.
  //
  // A seasonal default is still a reasonable goal. It has to SCALE each card
  // H0 by the month's ratio to the annual reference, never replace them, or the
  // down-point energy decay that makes Private's mellower than Sewers goes with
  // it. See TODO "seasonal default".
  //
  // #tide= is read BEFORE the month (and after the day, so an explicit tide
  // still wins over the day's own): the peel floor is only in domain at tide 0,
  // so setMonth has to see the tide the reader actually asked for or it would
  // decide the clamp against a tide the state is about to leave.
  if (h.has('tide')) state.tide = Math.min(Math.max(parseFloat(h.get('tide')) || 0, TIDE_RANGE[0]), TIDE_RANGE[1]);
  setMonth(h.has('month') ? h.get('month') : null);
  // Fog rides on the day the way #tide= does: the day names a whole morning,
  // and an explicit value in the permalink is the author's own air — parsed
  // after the day block so the specific number wins.
  if (h.has('fog')) {
    const v = parseFloat(h.get('fog'));
    if (Number.isFinite(v) && v <= 8) state.fog = Math.max(v, FOG_MIN);
  }
  if (h.has('bank')) {
    const v = parseFloat(h.get('bank'));
    if (Number.isFinite(v) && v >= 0 && v <= 1) state.fogBank = v;
  }
  if (h.has('burnoff')) state.burnoff = h.get('burnoff') === '1';
  // M5 bed modes: reef (default, 0), plane (1), measured/no-reef (2)
  if (h.get('bed') === 'plane') state.bedShape = 1;
  if (h.get('bed') === 'measured') state.bedShape = 2;
  if (h.get('bed') === 'reef') state.bedShape = 0;
  if (h.has('surfer')) state.surfer = h.get('surfer') === '1' ? 1 : 0;
  if (h.get('section') === '1') { showSection = true; section.el.style.display = ''; }
  if (h.get('audio') === '1') setAudioEnabled(true);   // needs a gesture; honoured once one lands
  if (h.has('h0')) {
    const v = parseFloat(h.get('h0'));
    // An explicit h0 is the author's own number and outranks the peel floor
    // as it already outranks the month. Clearing activeClamp matters: a
    // `#month=january&h0=2.0` would otherwise leave the HUD announcing a clamp
    // that this line has just overridden.
    if (Number.isFinite(v)) {
      state.H0 = Math.min(Math.max(v, H0_DEF.min), H0_DEF.max);
      activeClamp = null;
    }
  }
  if (h.has('speed')) state.speed = parseSpeedParam(h.get('speed'), state.speed);
  const camName = (h.get('cam') || '').toLowerCase();
  const ci = CAM_PRESETS.findIndex((c) => c.name.toLowerCase() === camName);
  // Tour is the screensaver: controls default OFF there, but an explicit
  // controls=1 (or legacy hud=1) restores the same canonical app surface.
  const controlsVisible = shouldShowControls(h, { tour: camName === 'tour' });
  document.body.classList.toggle('hidepanel', !controlsVisible);
  // URL-owned clean mode is intentionally not recoverable from inside the
  // frame. The H shortcut still uses hidepanel alone and keeps Show controls.
  document.body.classList.toggle('controls-disabled', !controlsVisible);
  applyCam(ci >= 0 ? ci : 0);
}

function applyHashParams() {
  const h = readHashParams();
  if (!h.toString()) return 0;   // bare URL: the site card's own ocean
  // Track 1c'-c.3 reef-shape sweep (`#reefamp=`, `#reefflank=`). FIRST, before
  // the preset: applyPreset -> applyBed builds the reefed composite, so a shape
  // set afterwards would fit and bake against one bed while the GPU drew
  // another — the authority split this repo keeps re-finding. The module-level
  // applyBed at load time has already run with the defaults, so the shape also
  // gets an explicit rebuild below.
  const shapeChanged = h.has('reefamp') || h.has('reefflank') || h.has('shelter');
  if (h.has('reefamp')) setReefAmp(parseFloat(h.get('reefamp')));
  if (h.has('reefflank')) setReefFlank(parseFloat(h.get('reefflank')));
  // `#shelter=0` A/B: flat H0 in BOTH the bake (setShelter, cache-invalidating
  // like a reef-shape change) and the drawn field (u_shelterMix) — the two
  // must flip together or line and water disagree about where breaking is.
  if (h.has('shelter')) {
    const on = h.get('shelter') !== '0';
    setShelter(on);
    uniforms.u_shelterMix.value = on ? 1 : 0;
  }
  // `#dline=` feature flag: density-composite break line (Topanga method,
  // bed.js densityCandidates). 1 = density peaks feed the anchor/continuity
  // selection; 2 = the per-station density mode IS the line. Bake-side only;
  // the bake cache key carries it, so no explicit invalidation is needed.
  if (h.has('dline')) setDensityLine(parseInt(h.get('dline'), 10) || 0);
  // `#merge=` sweep knob: how far below zero the break criterion's excess must
  // dip before a later positive run counts as a SECOND onset (bed.js
  // setOnsetMerge). 0 = shipped. Bake-side only, and setOnsetMerge clears the
  // bake key itself, so no cache-key member is needed.
  if (h.has('merge')) setOnsetMerge(parseFloat(h.get('merge')));
  // `#clamp=0` A/B revert: draw a derived ocean at its raw requested H0, below
  // the peel floor and all. Read BEFORE applyLiveParams, because that is where
  // #month= / #day= run and the clamp decision is taken inside them.
  if (h.has('clamp')) clampEnabled = h.get('clamp') !== '0';
  applyLiveParams(h, { shapeChanged });
  if (h.get('drift') === '1') driftEnabled = true;
  if (h.has('m4')) m4Enabled = h.get('m4') !== '0';   // emergent break line (default on; #m4=0 = authored)
  // camera aim off the baked line (default on; #aim=0 = authored-line aim)
  if (h.has('aim')) aimEnabled = h.get('aim') !== '0';
  if (h.has('psi')) psiEnabled = h.get('psi') === '1';
  if (h.has('peeldir')) peelDirEnabled = h.get('peeldir') === '1';
  if (h.has('smooth')) smoothEnabled = h.get('smooth') === '1';
  // ONE smoothing length for the fit and the bake — see bed.js setLocusSmoothing.
  setLocusSmoothing(smoothEnabled ? PEEL_SMOOTH_M : 0);
  // M5 nose, v2 (#nose=1): a down-point taper on the uplift AMPLITUDE, in stage
  // fraction, so it no longer flattens the wide stages the way the v1 gradient
  // did (bed.js REEF_NOSE_FRAC). Still default OFF — the fit is on target on all
  // six spots but the visible-crest consequence is unproven. `#nose=<f>` takes
  // an explicit fraction (clamped to [0, 1] by setReefNose — the definitional
  // bound; see REEF_NOSE_FRAC_MAX in bed.js) for tuning.
  if (h.has('nose')) {
    const nv = h.get('nose');
    const f = nv === '1' ? REEF_NOSE_FRAC_TUNED : parseFloat(nv);
    if (Number.isFinite(f)) setReefNose(f);
  }
  if (h.get('shape') === 'legacy') structuralBreaker = 0;
  if (h.get('shape') === 'structural') structuralBreaker = 1;
  uniforms.u_breakShape.value = structuralBreaker;
  // Diagnostic geometry/refraction boundary. D_p is the nearshore true bearing
  // the swell arrives FROM at the ~15 m SC116 reference contour. It is resolved
  // against this spot's measured stage basis and drives the phase/refraction
  // path; state.alpha remains the synthetic reef's character TARGET. Boot-only
  // until the noisy break route can defend a stable B_spot (TODO Track 3).
  if (h.has('direction')) {
    state.swellDp = parseDirectionParam(h.get('direction'));
  }
  // #fog= / #bank= / #burnoff= are ROUND-TRIP controls, parsed inside
  // applyLiveParams (after the day block, so an explicit value wins).
  // modeled-domain matte defaults ON; #matte=0 is the A/B revert
  if (h.get('matte') === '0') uniforms.u_matte.value = 0;
  // 4a' whitewater-area coupling defaults ON; #wwarea=0 is the pre-fix A/B
  if (h.get('wwarea') === '0') uniforms.u_wwArea.value = 0;
  // 6a group-speed A/B: the physical envelope cg = gT/4pi is the default
  // (unified 2026-08-13); #cg=0 re-arms the retired 0.5*LAM/T so the set-band
  // consequence stays measurable in one build. modelP() carries it to the JS
  // twins (model-js setEnv, sound.js voice envelope) so rider/audio follow.
  if (h.get('cg') === '0') uniforms.u_cgLegacy.value = 1;
  // Track 5 crest-first read defaults ON; #crest=0 is the pre-Track-5 A/B
  if (h.get('crest') === '0') uniforms.u_crestRead.value = 0;
  // kelp dark-wedge polarity (Track 1b) defaults ON; #kelp=0 is the pre-fix
  // A/B (bright sand lanes over the reef tongue)
  if (h.get('kelp') === '0') uniforms.u_kelpDark.value = 0;
  // forward pitch (the EVEN skew map + retuned q) defaults ON — it restores
  // documented intent the 2026-08-10 odd map never delivered; #pitch=0 re-arms
  // the odd map and its q schedule together for the exact A/B
  if (h.get('pitch') === '0') uniforms.u_pitchOdd.value = 1;
  uniforms.u_fidelityLook.value = parseFidelityLook(h.get('look'));
  // world-collision clamp defaults ON; #noclip=1 restores x-ray debugging
  if (h.get('noclip') === '1') noclipEnabled = true;
  // section-gap masking defaults ON; #gap=0 is the pre-fix A/B (the V returns)
  if (h.get('gap') === '0') uniforms.u_gapMask.value = 0;
  // comet-head whitewater aging defaults ON (clean-load verdict 2026-08-14);
  // #head=0 is the A/B revert
  if (h.get('head') === '0') uniforms.u_headRead.value = 0;
  // pocket-footprint size coupling defaults ON; #pock=0 is the pre-fix A/B
  if (h.get('pock') === '0') uniforms.u_pockSize.value = 0;
  // pocket->whitewater size normalization defaults ON (2026-08-19 defect fix);
  // #lipn=0 restores the size-blind lipFoam and the absolute 0.72 pocket floor
  if (h.get('lipn') === '0') uniforms.u_lipSize.value = 0;
  // per-stripe along-crest lifecycle clock (feature flag, default OFF pending
  // live verdict); #slife=1 arms it — inner re-breaking stripes gain the
  // phase-lagged copy of the zipper's along-crest age (model-glsl stripeMod)
  if (h.get('slife') === '1') uniforms.u_stripeLife.value = 1;
  // Aerated lip/curl ships with the anatomy bundle; #lip=0 restores the clean
  // glass fold. Existing #lip=1 links remain compatible with the default.
  if (h.get('lip') === '0') uniforms.u_lipAer.value = 0;
  // The #arm pair defaults ON (the peel arm lights at the house capture
  // clocks): set-envelope anchor + metric comet tail. `arm=0` reverts both;
  // `arm=anchor` / `arm=tail` keep only the named half, for bisection.
  // Crest-clock ramp defaults ON (defect fix, 2026-08-18); #wrap=0 restores
  // the raw mod() sawtooth and its hard crest-line foam edge, bit-identical.
  if (h.get('wrap') === '0') uniforms.u_crestWrap.value = 0;
  // Set-envelope floor defaults ON (defect fix, 2026-08-18): the envelope was
  // 100% modulated and zero-floored, and the dipstick measured the render
  // drawing water FLATTER than the physical sea through the lull. #env=0
  // restores modulation depth 0.5 and the exact-zero floor, bit-identically.
  if (h.get('env') === '0') uniforms.u_setDepth.value = SET_DEPTH_LEGACY;
  const armV = h.get('arm');
  if (armV === '0') { uniforms.u_setAnchor.value = 0; uniforms.u_armRead.value = 0; }
  else if (armV === 'anchor') uniforms.u_armRead.value = 0;
  else if (armV === 'tail') uniforms.u_setAnchor.value = 0;
  // Lip overturn ships with the anatomy bundle; #curl=0 restores the old
  // translated throw/drop pair. Existing #curl=1 links remain compatible.
  if (h.get('curl') === '0') uniforms.u_curl.value = 0;
  // #earn is the revert arm for the over-fill bend floor (default on; only
  // reachable through the curl branch, so #earn=0 is the pre-floor bend).
  if (h.get('earn') === '0') uniforms.u_earn.value = 0;
  // #sapp= takes a strength in (0, 1]; anything unparseable keeps the promoted
  // 0.22 rather than sending NaN into the S solve. #sapp=0.42 is the legacy A/B.
  if (h.has('sapp')) {
    const v = parseFloat(h.get('sapp'));
    if (Number.isFinite(v) && v > 0 && v <= 1) uniforms.u_sApp.value = v;
  }
  if (h.get('onset') === '0') uniforms.u_onset.value = 0;
  // #splash= takes a gain: 1 = the calibrated 0.90*H0 burst, higher scales it;
  // 0 is the pre-crash revert. Absence keeps the shipped gain of 1.
  if (h.has('splash')) {
    const v = parseFloat(h.get('splash'));
    if (Number.isFinite(v) && v >= 0 && v <= 3) uniforms.u_splash.value = v;
  }
  // #drop=legacy is a REVERT arm, not a feature flag: the re-scoped dropMag
  // ships on, and this restores the term that flattened the pocket so the two
  // silhouettes can be captured from one build.
  if (h.get('drop') === 'legacy') uniforms.u_legacyDrop.value = 1;
  // #knee: the offset bound's soft knee, metres. `0` is the REVERT arm (the
  // pre-2026-08-22 hard clamp, bit-identical); a float sweeps the knee. Values
  // at or above OFF_MAX_M remove the bound entirely and are an INSTRUMENT for
  // reading the raw offset distribution — not safe for the mesh, which is why
  // this parses as an explicit opt-in rather than defaulting anywhere near it.
  if (h.has('knee')) {
    const kn = parseFloat(h.get('knee'));
    if (Number.isFinite(kn) && kn >= 0 && kn <= 1) uniforms.u_offKnee.value = kn;
  }
  // #lamcap=0 puts the flat 20 m ceiling back, for the A/B against the
  // wave-derived S/k one. Revert arm, not a feature flag.
  if (h.get('lamcap') === '0') uniforms.u_lamCap.value = 0;
  // #amp=1 arms the carrier amplitude. Default OFF pending an S re-tune — see
  // the uniform's note; the flag is a feature flag, not a revert arm.
  if (h.get('amp') === '1') uniforms.u_carrierAmp.value = 1;
  // #throwlen=1 arms the cusp-length throw. Default OFF pending calibration.
  if (h.get('throwlen') === '1') uniforms.u_throwLen.value = 1;
  // #sgrow=1 lets the size signal past the sizeGate/S clamps. Default OFF.
  if (h.get('sgrow') === '1') uniforms.u_sGrow.value = 1;
  // The falling sheet ships with the bend and draws nothing when curl is off;
  // #curtain=0 is the geometry A/B. Existing #curtain=1 links remain compatible.
  if (h.get('curtain') === '0') curtainMesh.visible = false;
  return h.has('sim') ? parseFloat(h.get('sim')) || 0 : 0;
}

// ---------- writing the permalink back ----------
// replaceState, not `location.hash =`: a slider drag would otherwise push a
// history entry per frame and make the back button useless. replaceState also
// does NOT fire hashchange, so the listener below only ever sees a real user
// edit — no re-entrancy guard needed.
//
// Boot-only params already in the URL are preserved verbatim. Someone who
// loaded #m4=0&sim=42 to A/B something must not lose it because they nudged
// the tide; the writer owns the round-trip keys and nothing else.
let hashWriteQueued = false;

function currentHashSnapshot() {
  return {
    preset: state.preset || null,
    cam: CAM_PRESETS[camIdx]?.name.toLowerCase() || null,
    day: activeDayKey,
    // No month under a day (the day claims the ocean); 'card' is written
    // explicitly when no month is on, because with January as the shipped
    // default a bare URL now MEANS January — silence no longer spells "card".
    month: activeDayKey ? null : (activeMonthKey || 'card'),
    // A month or a day already implies its own H0; writing h0 as well would
    // pin the size and make the named ocean unfalsifiable on reload.
    h0: (activeDayKey || activeMonthKey) ? null : state.H0?.toFixed(2),
    tide: state.tide ? state.tide.toFixed(3) : null,
    // A day claims the air like it claims the ocean: under a named day the
    // fog values are the day's own, and writing them as well would pin the
    // day's air and make it unfalsifiable on reload (same rule as h0 above).
    // Burn-off is a mode the reader armed, not part of the day — always written.
    fog: activeDayKey ? null
      : (Number.isFinite(state.fog) ? String(+state.fog.toFixed(2)) : null),
    bank: activeDayKey ? null
      : (Number.isFinite(state.fogBank) ? String(+state.fogBank.toFixed(2)) : null),
    burnoff: state.burnoff ? '1' : '0',
    bed: ['reef', 'plane', 'measured'][state.bedShape || 0],
    surfer: state.surfer ? '1' : '0',
    section: showSection ? '1' : '0',
    audio: isAudioEnabled() ? '1' : '0',
    speed: String(state.speed),
    controls: document.body.classList.contains('controls-disabled') ? '0' : null,
  };
}

function writeHash() {
  const owned = writeHashParams(currentHashSnapshot());
  const kept = readHashParams();
  for (const k of [...kept.keys()]) if (ROUND_TRIP_KEYS.has(k)) kept.delete(k);
  const merged = [owned, kept.toString()].filter(Boolean).join('&');
  const next = `${location.pathname}${location.search}${merged ? '#' + merged : ''}`;
  if (next === location.pathname + location.search + location.hash) return;
  lastWrittenHash = merged;
  history.replaceState(null, '', next);
}

// Coalesce: setTide/setH0 fire on every `input` event, so a drag would
// otherwise rewrite the URL sixty times a second. A timer, NOT rAF —
// requestAnimationFrame is suspended in a hidden tab, which would strand a
// queued write until the tab came back and is the same hidden-tab rAF trap
// that faked a #cam=drone failure on two instruments (2026-08-14). Writing a
// permalink is not a rendering operation and does not belong on the frame clock.
const HASH_WRITE_DEBOUNCE_MS = 120;
function syncHash() {
  if (hashWriteQueued) return;
  hashWriteQueued = true;
  setTimeout(() => { hashWriteQueued = false; writeHash(); }, HASH_WRITE_DEBOUNCE_MS);
}

// A hand-edited URL. Round-trip-only edits re-apply live; anything naming a
// boot-only flag reloads, because applyHashParams() bakes the reef, arms audio
// and seeds the sim clock — re-running it in place would be neither cheap nor
// idempotent, and pretending otherwise is how a control surface starts lying.
addEventListener('hashchange', (e) => {
  const h = location.hash.replace(/^#/, '');
  if (h === lastWrittenHash) return;
  // Compare against the fragment being replaced, not just the new one — see
  // needsReloadForHash. Removing a boot-only flag must reload too.
  const prev = new URL(e.oldURL, location.href).hash;
  if (needsReloadForHash(location.hash, prev)) { location.reload(); return; }
  applyLiveParams(readHashParams());
  refreshHUD();
});

applyCam(0);
simTime = applyHashParams();
// Anchor the drift clock to wherever the hash put the sim, so #sim=9000 does
// not fire a burst of catch-up switches; with no static day picked, drift
// starts inside the good rotation immediately rather than 300 s from now.
driftLeg = Math.floor(Math.max(simTime, 0) / DRIFT_PERIOD_S);   // same floor as the loop
if (driftEnabled && !activeDayKey) setConditionDay(nextGoodDay(null));
refreshHUD();
hashSyncReady = true;
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
  // The peel floor, read back so an audit can tell a clamped state from a
  // healthy one without parsing the HUD. null = nothing clamped.
  peelClamp: () => (activeClamp ? { ...activeClamp } : null),
  clampOn: () => clampEnabled,
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
  setFidelityLook: (look) => { uniforms.u_fidelityLook.value = parseFidelityLook(look); },
  setCurl: (on) => { uniforms.u_curl.value = on ? 1 : 0; },
  setLegacyDrop: (on) => { uniforms.u_legacyDrop.value = on ? 1 : 0; },
  // Offset-bound knee in metres, for sweeps and for the raw-distribution read
  // (>= OFF_MAX_M = 20 removes the bound; instrument only). 0 = hard clamp.
  setOffKnee: (f) => { if (Number.isFinite(f) && f >= 0 && f <= 1) uniforms.u_offKnee.value = f; },
  offKnee: () => uniforms.u_offKnee.value,
  setLamCap: (on) => { uniforms.u_lamCap.value = on ? 1 : 0; },
  setCarrierAmp: (on) => { uniforms.u_carrierAmp.value = on ? 1 : 0; },
  setSScale: (v) => { if (Number.isFinite(v) && v > 0) uniforms.u_sScale.value = v; },
  setThrowLen: (on) => { uniforms.u_throwLen.value = on ? 1 : 0; },
  setCurtain: (on) => { curtainMesh.visible = !!on; },
  setSGrow: (on) => { uniforms.u_sGrow.value = on ? 1 : 0; },
  // Instrument. Leaves the mesh unbounded — read numbers with it, never ship it.
  setOffUnbound: (on) => { uniforms.u_offUnbound.value = on ? 1 : 0; },
  // ---- curlProbe: the displaced surface, as numbers ----
  // Reads back surfacePos() for a shore-normal transect at world x, sampling
  // the SOURCE coordinate z0 uniformly and returning the DISPLACED (x, y, z).
  // That is the only way to answer "does it overhang": an overhang is a fold
  // in the map z0 -> z, so the source parameter has to be visible.
  //
  // It runs the SHIPPED shader chunk (SURFACE_PRELUDE + SURFACE_GLSL, the same
  // text GRID_VERT compiles) as a fragment pass over a float target, sharing
  // this page's uniform objects — bed textures, tide, refraction bake and all.
  // A JS re-derivation would be a second model of the same quantity, which is
  // the mistake MEASUREMENT_LESSONS 4 is about.
  curlProbe: (x = 0, z0 = -60, z1 = 60, n = 1024) => {
    if (!Number.isFinite(x) || !(n > 1)) return null;
    if (!curlProbeRT || curlProbeRT.width !== n) {
      curlProbeRT?.dispose();
      // Three rows: row 0 is the geometry (y, z, land, curl), row 1 the model
      // bookkeeping at the same source point (pocket, brk, foam, aer). The
      // second row is what tells a null apart from a miss — "no overturn here"
      // and "the pocket is not here" are different findings.
      // Row 2 is the CEILING the crest is allowed to reach (crestCeilM, the
      // depth-limited height, shared with the #curl bend), the depth it was
      // computed from, and the shipped break line at this station. Without the
      // ceiling "the pocket crest is 5 m" has no denominator: a crest can only
      // be judged short against what the water can carry.
      //
      // THE CEILING IS GATED ON u_depthMix (2026-08-19). With no measured bed
      // bound, `u_bed` is bed.js's 1x1 all-zeros EMPTY_BED, so bedTexel decodes
      // unit = 0 and bedElevM returns u_bedElev.x — the LOW EDGE OF THE RGBA8
      // QUANTIZATION WINDOW (-30 m NAVD88), a storage constant, at every
      // station. modelDepthM is then a flat 30.91 m stage-wide, gamma*h = 24.1 m
      // never binds, and crestCeilM collapses to 0.8*VIS*H0*Ks(30.9 m) =
      // 1.878*H0 — a rescaled swell height wearing a depth limit's name. The
      // wave drawn over it came from ocean()'s `growSyn` branch, which contains
      // no depth at all, so crest/ceiling there divides two unrelated numbers.
      // Emitting -1 and mapping it to `ceil: null` is the same honesty the
      // pixel corridor already practises at Privates: n/a, not a wrong number.
      // `depth` stays raw (it is what the shader computes, and it is the
      // evidence); `bedBacked` tells a consumer which regime it is reading.
      // The shader term itself is untouched — this is the instrument channel.
      curlProbeRT = new THREE.WebGLRenderTarget(n, 3, {
        type: THREE.FloatType, minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter, depthBuffer: false,
      });
    }
    if (!curlProbeMat) {
      curlProbeMat = new THREE.ShaderMaterial({
        uniforms: Object.assign({ u_probe: { value: new THREE.Vector4() } }, uniforms),
        vertexShader: 'void main(){ gl_Position = vec4(position.xy*2.0, 0.0, 1.0); }',
        fragmentShader: `${SURFACE_PRELUDE}\n${SURFACE_GLSL}\n` +
          'uniform vec4 u_probe;   // x, z0, z1, n\n' +
          'void main(){\n' +
          '  float i = floor(gl_FragCoord.x);\n' +
          '  float zz = mix(u_probe.y, u_probe.z, i/max(u_probe.w - 1.0, 1.0));\n' +
          '  float f, p, b, c, l, a, k;\n' +
          '  vec2 xz = vec2(u_probe.x, zz);\n' +
          '  vec3 P = surfacePos(xz, u_time, f, p, b, c, l, a, k);\n' +
          '  if (gl_FragCoord.y < 1.0)      gl_FragColor = vec4(P.y, P.z, l, k);\n' +
          '  else if (gl_FragCoord.y < 2.0) gl_FragColor = vec4(p, b, f, a);\n' +
          '  else gl_FragColor = vec4(u_depthMix > 0.5 ? crestCeilM(xz) : -1.0,\n' +
          '                           modelDepthM(xz), c, breakLine(xz.x));\n' +
          '}',
      });
      curlProbeQuad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), curlProbeMat);
      curlProbeScene = new THREE.Scene().add(curlProbeQuad);
      curlProbeCam = new THREE.Camera();
    }
    curlProbeMat.uniforms.u_probe.value.set(x, z0, z1, n);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(curlProbeRT);
    renderer.render(curlProbeScene, curlProbeCam);
    const buf = new Float32Array(n * 3 * 4);
    renderer.readRenderTargetPixels(curlProbeRT, 0, 0, n, 3, buf);
    renderer.setRenderTarget(prev);
    const out = [];
    for (let i = 0; i < n; i++) {
      const g = i * 4, m = (n + i) * 4, c = (2 * n + i) * 4;
      out.push({ z0: z0 + (z1 - z0) * i / (n - 1), y: buf[g],
                 z: buf[g + 1], land: buf[g + 2], curl: buf[g + 3],
                 pocket: buf[m], brk: buf[m + 1], foam: buf[m + 2], aer: buf[m + 3],
                 ceil: buf[c] < 0 ? null : buf[c], bedBacked: buf[c] >= 0,
                 depth: buf[c + 1], crest: buf[c + 2], bLine: buf[c + 3] });
    }
    return out;
  },
  // Where does a crest FIRST meet the break line? m4RideSolve takes the takeoff
  // as argmin S over the stage. When that minimum is INTERIOR, crests satisfy
  // the criterion in both directions from it and the peak splits into a left
  // and a right — an A-frame, arrived at geometrically without u_aframe ever
  // being set. This reports where the minimum sits so "one spot has a corner"
  // can be told apart from "the bake does this everywhere".
  // The baked line itself plus its derived alpha, for headless measurement.
  // Foam is a weak instrument; the LINE is the claim (audit 2026-08-11).
  // Camera-aim instrument (read-only): where the active camera is actually
  // looking vs the baked line's raw action centroid. `errDeg` is the angle
  // between the camera's forward direction and the eye->centroid direction —
  // the acceptance number for the baked-line aim (TODO Track 2). Present
  // regardless of #aim so before/after runs use the SAME instrument.
  aimProbe: () => {
    const raw = bakedAimCentroid();
    const fwd = camera.getWorldDirection(new THREE.Vector3());
    let errDeg = null;
    if (raw) {
      const to = new THREE.Vector3(raw.x, 0, raw.z).sub(camera.position).normalize();
      errDeg = Math.acos(Math.min(Math.max(fwd.dot(to), -1), 1)) * 180 / Math.PI;
    }
    return {
      enabled: aimEnabled, ok: aimState.ok,
      aim: aimState.ok ? { x: aimState.x, z: aimState.z } : null,
      raw, errDeg,
      cam: CAM_PRESETS[camIdx].name,
      camPos: camera.position.toArray(),
      target: controls.target.toArray(),
    };
  },
  lineProbe: (step = 5) => {
    if (!lastBaked) return null;
    const out = [];
    for (let x = lastBaked.x0; x <= lastBaked.x1; x += step)
      out.push({ x, z: breakZAt(x, lastBaked.x0, lastBaked.x1),
                 a: derivedAlphaDeg(x, lastBaked.x0, lastBaked.x1),
                 gap: breakGapAt(x, lastBaked.x0, lastBaked.x1) });
    return out;
  },
  // How far does the drawn break line sit from the fitted wedge crest it is
  // supposed to be the break of? This is the ROOT DEFECT as a single number:
  // if the reef owned the line these would track, and any declaration phrased
  // as "the line lies within X of the crest" has something to select among.
  // zc(x) = zRef + tan(beta)*(x - REEF_ANCHOR_X), REEF_ANCHOR_X = 24 (bed.js).
  crestOffset: (step = 4) => {
    if (!lastBaked) return null;
    const fit = (state.bedShape || 0) === 0 ? reefFitFor(state.geoSpot) : null;
    if (!fit) return null;
    const P = modelP();
    const lo = (P.stageStart ?? -110) + 10, hi = (P.stageEnd ?? 290) - 10;
    const tanB = Math.tan(fit.betaDeg * Math.PI / 180);
    const d = [];
    for (let x = lo; x <= hi; x += step)
      d.push(Math.abs(breakZAt(x, lastBaked.x0, lastBaked.x1) - (fit.zRef + tanB * (x - 24))));
    if (!d.length) return null;
    const s = [...d].sort((a, b) => a - b);
    return { median: s[Math.floor(s.length / 2)], min: s[0], max: s[s.length - 1] };
  },
  // The reef shape the bake ACTUALLY used — so a sweep can prove the knob is
  // live rather than inferring it from a number that did not move.
  reefShape: () => getReefShape(),
  // the onset-merge threshold the bake ACTUALLY used, so a sweep can prove the
  // knob is live rather than inferring it from a number that did not move
  // (the `#nose=1` unwired trap, WEB_THREE_SPEC "The anchor band, falsified")
  onsetMerge: () => getOnsetMerge(),
  // The break criterion's CANDIDATE SET, before branch-following picks among
  // it (bed.js breakCandidates). Read-only diagnostic for the low-H0 branch
  // flips: the baked line shows THAT the line jumped, this shows whether the
  // crossings themselves changed (physics) or only which one was taken
  // (selection / anchor). Same opts the frame loop bakes with, so the two
  // always describe the same line.
  crossProbe: (stride = 4) => breakCandidates(state.geoSpot, [-STAGE_W / 2, STAGE_W / 2],
    { H0: state.H0, T: state.T, tide: state.tide || 0, bedShape: state.bedShape || 0 }, stride),
  // The break criterion's EXCESS PROFILE at one station (bed.js
  // breakExcessProfile), plus the depth of each negative dip between onsets.
  // The candidate list is onsets only, so it cannot say whether two branches
  // are separated by a real un-breaking or by a marginal wobble.
  excessProbe: (x = 0) => breakExcessProfile(state.geoSpot, x,
    { H0: state.H0, T: state.T, tide: state.tide || 0, bedShape: state.bedShape || 0 }),
  // The M5 clamp invariants (0 deepened / 0 above the -0.5 m ceiling / 0 dry
  // posts touched / shoreline shift 0) plus the fit residual and checksum.
  // Exposed so a reef-shape sweep can prove it has not bought peel angle by
  // breaking the guarantees that let the wedge into the bed in the first place.
  reefAudit: () => reefAudit(state.geoSpot),
  // Stage-median derived alpha — the ACCEPTANCE instrument since 2026-08-13.
  // The x = 0 readout samples the same neighbourhood the reef fit is tuned at
  // (bed.js reefFitFor, xs = [-16, -8, 0, 8, 16]), so it certifies the fit
  // rather than the wave: measured, alpha in the fit window hits target on all
  // six spots while the stage median is 11 deg at Sharks and ~17 at Second Peak
  // against 66/58 targets. It also overstates the H0 swing 4-8x and at Second
  // Peak moves OPPOSITE to the line it samples. Restricted to the stage on
  // purpose — the bake spans ~600 m and its flat flanks make a whole-bake
  // median true and vacuous (MEASUREMENT_LESSONS 8c).
  // See WEB_THREE_SPEC "Where the peel actually lives".
  stageAlpha: (step = 2) => {
    if (!lastBaked) return null;
    const P = modelP();
    const lo = (P.stageStart ?? -110) + 10, hi = (P.stageEnd ?? 290) - 10;
    const xs = [], as = [], zs = [];
    for (let x = lo; x <= hi; x += step) {
      xs.push(x);
      zs.push(breakZAt(x, lastBaked.x0, lastBaked.x1));
      as.push(derivedAlphaDeg(x, lastBaked.x0, lastBaked.x1));
    }
    if (!as.length) return null;
    // LIMITER-PINNED stations: the line is riding bakeBreakLine's
    // SLEW_M_PER_M = 3.0 clamp (a branch teleport turned into a ramp), so
    // derivedAlphaDeg there measures the limiter, not a wave — it reads
    // 67-71 deg on every spot, above the local refraction ceiling. Threshold
    // and backward-difference stencil mirror measure_alpha_regimes.mjs
    // (SLEW_PINNED = 2.9). `median` stays all-stations for continuity with
    // recorded ensemble/reef-shape sweeps; medianClean is the honest number.
    const pinned = xs.map((x, i) =>
      i > 0 && Math.abs((zs[i] - zs[i - 1]) / (xs[i] - xs[i - 1])) >= 2.9);
    const med = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    const clean = as.filter((_, i) => !pinned[i]);
    const inFit = as.filter((_, i) => Math.abs(xs[i]) <= 16 && !pinned[i]);
    const outFit = as.filter((_, i) => Math.abs(xs[i]) > 16 && !pinned[i]);
    return {
      stageLo: lo, stageHi: hi,
      median: med(as),
      medianClean: clean.length ? med(clean) : null,
      pinnedN: pinned.filter(Boolean).length,
      stations: as.length,
      inFit: inFit.length ? med(inFit) : null,
      outFit: outFit.length ? med(outFit) : null,
    };
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
