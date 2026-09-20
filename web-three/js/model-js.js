// JS twin of the model math the CPU needs — surfer placement and the Follow
// camera cannot read the GPU, so the HEIGHT path of model-glsl.js (carrier +
// boil + chop + bore), the M2 choppy offset, and surferState() are re-derived
// here in plain JS. MODEL.md stays the source of truth; model-glsl.js is its
// executable form; this file copies constants from there verbatim.
// KEEP IN SYNC: any change to the shader model must land here too (the foam /
// pocket / crest *shading* bookkeeping is deliberately NOT mirrored — only
// what moves geometry). Grep marker: MODEL-TWIN.
//
// All functions take (…, t, P) where t is SIMULATION seconds (the one shared
// clock; rate independence lives in main.js) and P is a plain-object snapshot
// of the model uniforms: { T, H0, alphaRad, xi, sections, dF, chop, aframe,
// geoMix, contourX2, contourX3, stageStart, stageEnd }.

import { GAMMA, G } from './dispersion.js';   // one JS home for the physics constants
import { peelVelocity } from './peel-geometry.js';  // one definition of the peel speed

const PI  = Math.PI;
// MODEL-TWIN: display wavelength, m. Exported as the ONE JS definition
// (sound.js imports it); the GLSL const in model-glsl.js is the GPU source of
// truth and must stay numerically identical.
export const LAM = 90.0;
// MODEL-TWIN: visual amplitude gain. A uniform on the GPU since 2026-09-05
// (#vis=), so the twin has to track it or the rider rides a different sea from
// the one drawn. main.js calls setVis() from the same flag that sets u_vis.
let VIS = 3.2;
export function setVis(v) { if (Number.isFinite(v) && v > 0) VIS = v; }
export function getVis() { return VIS; }
export const BREAK_HEIGHT_ATTEN_PER_L = 0.35; // MODEL-TWIN: shared/model-glsl.js

// ---------- GLSL-style helpers ----------
const fract = (x) => x - Math.floor(x);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const mix   = (a, b, t) => a + (b - a) * t;
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

// MODEL-TWIN of postBreakHeightRetention(). A break mask starts the loss; it
// does not instantaneously stand in for the loss. At full break weight the
// carrier retains 70% after one local wavelength and 50% after two.
export function postBreakHeightRetention(runM, localWaveLenM, breakWeight = 1) {
  const wavelengths = Math.max(runM, 0) / Math.max(localWaveLenM, 1);
  const brokenRetention = Math.exp(-BREAK_HEIGHT_ATTEN_PER_L * wavelengths);
  return mix(1, brokenRetention, clamp(breakWeight, 0, 1));
}

// ---------- hash / noise (bit-for-bit the model-glsl formulas) ----------
function hash11(p) { p = fract(p * 0.1031); p *= p + 33.33; return fract((p + p) * p); }
function hash21(x, y) {
  // GLSL: q = fract(p.xyx*0.1031); q += dot(q, q.yzx + 33.33)
  let qx = fract(x * 0.1031), qy = fract(y * 0.1031), qz = fract(x * 0.1031);
  const d = qx * (qy + 33.33) + qy * (qz + 33.33) + qz * (qx + 33.33);
  qx += d; qy += d; qz += d;
  return fract((qx + qy) * qz);
}
function vnoise1(x) {
  const i = Math.floor(x); let f = x - i; f = f * f * (3 - 2 * f);
  return mix(hash11(i), hash11(i + 1), f);
}
function vnoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  return mix(
    mix(hash21(ix, iy),     hash21(ix + 1, iy),     fx),
    mix(hash21(ix, iy + 1), hash21(ix + 1, iy + 1), fx), fy);
}

// ---------- bathymetry (MODEL-TWIN of coastCurve / breakLine / reefWindow) ----------
function geoWeight(P) {
  return clamp(P.geoMix ?? 0, 0, 1) * ((P.aframe ?? 0) >= 0.5 ? 0 : 1);
}

export function coastCurve(x, P) {
  const xx = mix(x, Math.abs(x), P.aframe);
  const synthetic = xx * xx / 5000;
  const stageStart = P.stageStart ?? -110, stageEnd = P.stageEnd ?? 290;
  const gx = clamp(x, stageStart, stageEnd);
  const measured = (P.contourX2 ?? 1 / 5000) * gx * gx
                 + (P.contourX3 ?? 0) * gx * gx * gx;
  return mix(synthetic, measured, geoWeight(P));
}

export function coastCurveSlope(x, P) {
  const aframe = P.aframe ?? 0;
  const xx = mix(x, Math.abs(x), aframe);
  const synthetic = 2 * xx / 5000 * (aframe >= 0.5 ? Math.sign(x) : 1);
  const stageStart = P.stageStart ?? -110, stageEnd = P.stageEnd ?? 290;
  const measured = x >= stageStart && x <= stageEnd
    ? 2 * (P.contourX2 ?? 1 / 5000) * x + 3 * (P.contourX3 ?? 0) * x * x
    : 0;
  return mix(synthetic, measured, geoWeight(P));
}

// MODEL-TWIN of swellPhi/contourZ/rayS/peelAngleAt — see model-glsl.js for the
// 2026-08-10 frame change (the swell carries the angle; the break line follows
// the contour).
// MODEL-TWIN of swellPhi: alpha is the DEEP-WATER direction, refracted to
// breaking depth by Snell. Must stay bit-identical to model-glsl.js — the
// rider is placed from this and drawn from that.
export function swellPhi(P) {
  const a  = clamp(P.alphaRad, 0.06, 1.45);
  const hb = Math.max(P.H0 / GAMMA, 0.4);         // depth-limited breaking depth
  const c0 = 9.81 * P.T / (2 * PI);
  const cb = Math.sqrt(9.81 * hb);
  const s  = Math.sin(a) * clamp(cb / Math.max(c0, 0.1), 0, 1);
  return clamp(Math.asin(clamp(s, 0, 1)), 0.04, 1.45);
}

export function contourZ(x, z, P) { return z + coastCurve(x, P); }

export function rayS(x, z, P) {
  const phi = swellPhi(P);
  const xx  = mix(x, Math.abs(x), P.aframe);
  return xx * Math.sin(phi) + contourZ(x, z, P) * Math.cos(phi);
}

// MODEL-TWIN of model-glsl.js rayPhase(): the spatial phase, radians.
//
// M6 part 3. The Psi form needs the baked table, which lives in bed.js, which
// imports THREE — and this file must stay THREE-free so node --test can reach
// it. So the caller INJECTS it as P.phaseFn (main.js builds it from the bake);
// with no phaseFn this is exactly the frozen-LAM plane wave the model has
// always used. Same injection contract as m4RideSolve's zbFn.
export function rayPhase(x, z, P) {
  return P.phaseFn ? P.phaseFn(x, z) : (2 * PI / LAM) * rayS(x, z, P);
}

// Realized peel angle at station x, radians (diagnostic — HUD and docs).
export function peelAngleAt(x, P) {
  const cc = coastCurveSlope(x, P);
  return Math.atan(-cc) - Math.atan(-Math.tan(swellPhi(P)) - cc);
}

// MODEL-TWIN of the GLSL breakLine()'s sections term: shallow patches meet the
// break criterion early, so the line is pulled SEAWARD (never shoreward) by up
// to 55*sections metres. The GPU adds this on top of the baked line too, so a
// consumer that wants the drawn line at a station (the Cover aim) adds it to
// bed.js breakZAt. Numerically identical to the shader; keep it so.
export function sectionShift(x, P) {
  const xx = mix(x, Math.abs(x), P.aframe);
  const sec = P.sections * 55 * (vnoise1(xx * 0.02 + 7.3) - 0.5) * 2;
  return Math.min(sec, 0) * (P.sections >= 0.05 ? 1 : 0);
}

export function breakLine(x, P) {
  // the break line IS the contour through the surf node (contourZ = 0)
  return -coastCurve(x, P) + sectionShift(x, P);
}

// MODEL-TWIN of the GLSL reefWindow. Knots ride on P (P.reefWin), same
// injection contract as zbFn/phaseFn; the legacy synthetic constants are the
// fallback so a P without them is the pre-2026-08-11 behaviour exactly.
export function reefWindow(x, P) {
  const xx = mix(x, Math.abs(x), P.aframe);
  const w = P.reefWin || [-110, -35, 215, 290];
  return smoothstep(w[0], w[1], xx) * (1 - smoothstep(w[2], w[3], xx));
}

// MODEL-TWIN: seconds after boot at which the first set crests on the break
// line — see the GLSL SET_ANCHOR_S header for the 2026-08-18 measurement
// (probe_arm_terms.mjs: env at the line 0.00-0.24 across the whole house
// capture window after the 6a cg fix). Keep numerically identical to the GPU.
export const SET_ANCHOR_S = 45.0;

// Set-envelope modulation depth. env = (1-m) + m*cos(...), so the peak is 1.0
// for every m and the FLOOR is 1-2m. The shipped 0.425 puts the floor at 0.15,
// derived from the SC116 spectra two ways in PP_SPECTRAL_SETS.md section 7 —
// see the u_setDepth header in shared/model-glsl.js. Keep numerically identical
// to the GPU. #env=0 restores 0.5 (floor 0), the pre-2026-08-18 behaviour.
export const SET_DEPTH = 0.425;
export const SET_DEPTH_LEGACY = 0.5;

// MODEL-TWIN of GLSL setPhase/setEnv. P.setRef is the stage-median rayS of
// the live break line (main.js computes it; the GPU gets it as u_setRef);
// P.setAnchor mirrors u_setAnchor. Both default 0, so a P without them — the
// node tests, and any caller predating the anchor — gets the legacy phase
// bit-identically. P.cgLegacy (#cg=0) re-arms the retired 0.5*LAM/T for the
// 6a A/B, mirroring u_cgLegacy/groupSpeedM; tRef and s/cg move together.
// P.setDepth mirrors u_setDepth (modulation depth; floor = 1 - 2m). It defaults
// to SET_DEPTH_LEGACY, not the shipped SET_DEPTH, for the same reason setRef
// and setAnchor default to 0: a P without it — node tests, any caller predating
// the floor — must reproduce the legacy envelope bit-identically. main.js and
// sound.js pass the live uniform.
export function setEnv(s, t, P) {
  const cg = P.cgLegacy ? 0.5 * LAM / P.T : G * P.T / (4 * PI);
  const tRef = (SET_ANCHOR_S - (P.setRef ?? 0) / cg) * (P.setAnchor ?? 0);
  const m = P.setDepth ?? SET_DEPTH_LEGACY;
  return (1 - m) + m * Math.cos(2 * PI * P.dF * (t - tRef - s / cg));
}

function crestShape(phase, q) {
  const c01 = Math.max(0.5 + 0.5 * Math.cos(phase), 0);   // pow(neg, frac) guard
  return Math.pow(c01, q) - 0.5 / q;
}

// ---------- ocean height (MODEL-TWIN of ocean()'s h path only) ----------
export function oceanH(x, z, t, P) {
  const k = 2 * PI / LAM, w = 2 * PI / P.T;
  const zb = breakLine(x, P);
  const d  = zb - z;                          // >0 seaward of break line
  const reef = reefWindow(x, P);

  const grow  = 1 + 0.85 * Math.exp(-Math.max(d, 0) / 90) * reef;
  const brk   = smoothstep(-6, 14, z - zb) * reef;
  const decay = postBreakHeightRetention(z - zb, LAM, reef);

  const s     = rayS(x, z, P);
  // Crest phase follows rayPhase (shoals under P.phaseFn). setEnv stays on the
  // metric ray coordinate but now runs the physical cg = gT/4pi, mirroring
  // the shader (2026-08-13 group-speed unification).
  const theta = w * t - rayPhase(x, z, P);
  const env   = setEnv(s, t, P), env2 = env * env;
  // MODEL-TWIN of the GLSL q schedule (flattened 2026-08-18 with the forward-
  // pitch correction; P.pitchOdd mirrors u_pitchOdd for the #pitch=0 A/B).
  // The pitch term itself has no twin here BY CONSTRUCTION: `skew` is
  // mix(0, ..., u_depthMix) and this twin is the synthetic depthMix = 0 path
  // (no excess, no lift, no shoreFade), so skew is identically zero. If a depth
  // path is ever added here, the EVEN map has to come with it — see the GLSL
  // comment for why an odd one is symmetric no matter what it is scaled by.
  const q     = (P.pitchOdd ? 1.6 : 2.2)
              + (P.pitchOdd ? 3.2 : 1.5) * Math.exp(-Math.abs(d) / 55) * (0.6 + 0.5 * P.xi);
  const amp   = 0.5 * P.H0 * grow * decay * env;
  let h = amp * crestShape(-theta, q) * 2;

  // the boil beside the takeoff (glassy dome, kinks the surface slightly)
  const bx = -22;
  const bz = -coastCurve(bx, P) - 8;
  const boil = Math.exp(-((x - bx) * (x - bx) + (z - bz) * (z - bz)) / (2 * 5.5 * 5.5));
  h += 0.10 * P.H0 * boil * (0.8 + 0.2 * Math.sin(t * 0.7));

  // wind chop (the boil slicks it flat)
  const chopG = P.chop * (1 - 0.9 * boil);
  h += chopG * 0.22 * (vnoise2(x * 0.11, z * 0.11 + t * 0.6) - 0.5)
     + chopG * 0.10 * (vnoise2(x * 0.31 - t * 0.9, z * 0.31) - 0.5);

  // the broken front's foamy mound has height
  const boreBand = brk * env2 * Math.exp(-Math.abs(z - zb) / 9);
  h += 0.30 * P.H0 * boreBand * (0.75 + 0.25 * vnoise2(x * 0.2, t * 0.8));

  h *= VIS;
  return Number.isFinite(h) ? h : 0;   // NaN guard (house rule)
}

// ---------- standable surface sample (partial mirror of GRID_VERT's choppyPos) ----------
// The renderer slides every surface point horizontally (M2 choppy), so a body
// placed at raw model (x, z) would sit beside the drawn water. Returns the
// height at the SOURCE point plus the SHARPENING part of the vertex shader's
// offset — world position ≈ (x + ox, h, z + oz).
// Deliberate deviation from choppyPos: the two pocket-gated terms (past-cusp
// lambda and the shoreward lip throw) are omitted. Those terms ARE the fold —
// they map a pocket source point into the thrown lip, and placing the rider
// there buried the board in whitewater on plunging presets (Slot close-up,
// M3 verification). A surfer stands on the face under the lip, not inside
// it, so the rider follows only the standable displacement.
// The far fade is omitted too: the ride line lives deep inside the stage
// (fade = 1 there). Normal is a height-FD normal (e = 2 m, same step as the
// shaders): adequate on the unbroken face; displaced-position FD only
// matters inside the fold, where no one is standing.
export function surfaceAt(x, z, t, P) {
  const h = oceanH(x, z, t, P);
  const e = 2.0;
  const hpx = oceanH(x + e, z, t, P), hmx = oceanH(x - e, z, t, P);
  const hpz = oceanH(x, z + e, t, P), hmz = oceanH(x, z - e, t, P);
  const gx = (hpx - hmx) / (2 * e), gz = (hpz - hmz) / (2 * e);

  const d      = breakLine(x, P) - z;
  const steep  = Math.exp(-Math.max(d, 0) / 70) * reefWindow(x, P);
  const plunge = smoothstep(0.45, 1.25, P.xi);
  // MODEL-TWIN of choppyPos's overturn form (M6 part 1, corrected 2026-08-11):
  // cusp at S = lam*a*k^2 = 1, so lam = S/(a*k^2) from the local displayed
  // amplitude. APPROACH term only — the fold terms stay omitted here for the
  // reason documented above (the rider stands on the face, not inside the lip).
  const kk_    = 2 * PI / LAM;
  const aEst   = Math.min(Math.max(Math.abs(h), 0.6), 12.0);
  const lam    = (0.42 * steep) / (aEst * kk_ * kk_);

  let ox = lam * gx, oz = lam * gz;
  const len = Math.hypot(ox, oz);
  if (len > 20) { ox *= 20 / len; oz *= 20 / len; }   // same 20 m clamp as the shader
  if (!Number.isFinite(ox) || !Number.isFinite(oz)) { ox = 0; oz = 0; }

  let nx = hmx - hpx, ny = 2 * e, nz = hmz - hpz;
  const nl = Math.hypot(nx, ny, nz);
  if (nl > 1e-9 && Number.isFinite(nl)) { nx /= nl; ny /= nl; nz /= nl; }
  else { nx = 0; ny = 1; nz = 0; }                     // degenerate guard

  // plunge is also returned: the omitted fold terms converge extra water onto
  // the crest, so the DRAWN surface sits O(1 m) above h near the pocket on
  // plunging presets — callers placing bodies compensate with plunge (the
  // Slot buried the board to the shins without this; M3 verification)
  return { h, ox, oz, nx, ny, nz, plunge };
}

// ---------- the surfer (MODEL-TWIN of surferState) ----------
// Closed-form rider on the zipper: no state. Ride the shoreward/front face of
// the crest, pumping between bottom turn and top turn on a 6 s cycle.
// Returns model-space position + ground velocity + the pump phase value.
export const PUMP_PERIOD = 6.0;   // seconds, same cycle the wake/lean shaders use

export function surferState(t, P) {
  // MODEL-TWIN of model-glsl surferState()'s u_breakMix branch: with an
  // emergent break line the crest/line crossing has no closed form, so main.js
  // solves it once per frame (m4RideSolve below) and passes the result through
  // P.m4Ride — the same value it uploads as u_surferPos, so mesh and shader
  // wake stay on one rider.
  if (P.m4Ride) return P.m4Ride;

  const k = 2 * PI / LAM;
  const w = 2 * PI / P.T;
  // c/sin(phi) along the break line — see model-glsl.js surferState
  const sp = Math.max(Math.sin(swellPhi(P)), 0.05);
  const cp = Math.max(Math.cos(swellPhi(P)), 0.05);
  const vx = (LAM / P.T) / sp;

  const gw = geoWeight(P);
  const x0 = mix(-18, Math.max(-18, (P.stageStart ?? -110) + 20), gw);
  const x1 = mix(x0 + 225, Math.max(x0 + 40, (P.stageEnd ?? 290) - 20), gw);
  const span = x1 - x0;
  const rideT = span / Math.max(vx, 0.5);
  const ph = t - rideT * Math.floor(t / rideT);   // GLSL mod()
  const xApprox = x0 + vx * ph;

  // snap to the nearest real zipper so the surfer sits on an actual crest
  const n  = Math.floor((w * t - k * sp * xApprox) / (2 * PI) + 0.5);
  const xs = (w * t - 2 * PI * n) / (k * sp);

  const pump    = Math.sin(t * 2 * PI / PUMP_PERIOD);
  const faceOff = 11 + 5 * pump;              // metres shoreward onto the front face
  const xfold   = mix(xs, Math.abs(xs), P.aframe);
  // crest snap in the CONTOUR frame — see model-glsl.js surferState for why a
  // bare z shift fails
  const zcTarget = -(P.rideOffset || 0);      // break line is contourZ = 0
  const nz       = Math.floor((w * t - k * (xfold * sp + zcTarget * cp)) / (2 * Math.PI) + 0.5);
  const zcCrest  = ((w * t - 2 * Math.PI * nz) / k - xfold * sp) / cp;
  const zs       = zcCrest + faceOff - coastCurve(xs, P);
  const vz       = -coastCurveSlope(xs, P) * vx
                 + 5 * (2 * PI / PUMP_PERIOD) * Math.cos(t * 2 * PI / PUMP_PERIOD);
  return { x: xs, z: zs, vx, vz, pump };
}

// ---------- the M4 rider: continuity solve on the emergent line ----------
// The first cut re-scanned every x each frame for the global minimum phase
// residual and took whichever crest scored best. Measured 2026-08-11
// (Playwright u_surferPos + bit-exact CPU replication): the winning crest
// changes between frames, so the rider teleported — median 1-s |dx| 28-220 m,
// >30 m hops (up to ~570 m) on 5-84 of 300 frames at 1/30 s, and 8-95% of
// samples landed outside the mapped stage because the scan ran to the baked
// +/-290 m where the contour fit is clamped.
//
// A rider follows ONE crest. Persistent state st = { n, prevX }: pick the
// crest index n when it arrives at the takeoff (up-point stage edge), solve
// THAT crest's crossing with the baked line each frame — S(x) along the line
// is smooth, so bracket at 2 m and bisect — follow it down-point, and hand
// off to the crest now nearest the takeoff when it runs off the stage end.
// The march is clamped to [stageStart, stageEnd], never the baked +/-290.
// The stage usually spans less than one wavelength of ray distance, so there
// are windows with no crest on the line; the rider waits at the takeoff
// (st.prevX = null there, so the next ride re-anchors at the takeoff side).
//
// zbFn is the baked emergent line (bed.js breakZAt bound to the bake bounds);
// keeping it a callback keeps this file pure/node-testable and bed.js the
// only owner of the bake.
const RIDE_EDGE = 10;   // m inside the stage bounds — same margin the old scan used
// The rider's own phase stencil. Deliberately NOT shared with bed.js's wider
// one: see peelVelocity() in peel-geometry.js for the measured divergence.
const RIDE_PHASE_STENCIL_M = 1.5;

// ---------- A1: the rider's own velocity (default OFF) ----------
// Until now the rider WAS the breakpoint: x was the exact phase root on the
// break line and vx was the peel speed, so the gap between his speed and
// V_peel was zero by construction and he could not be beaten. These give him a
// speed of his own, so the peel can leave him.
//
// Gated on P.boardMps. Absent -> every line below is skipped and the solve is
// bit-identical to the shipped kinematic rider, which is what the active user
// base keeps getting until this is proven. Track A1 of
// docs/research/GAME_PROJECTION_2026-09-19.md.
//
// RIDER_POCKET_M is the declared parameter: how far behind the breakpoint a
// surfer can sit and still be in the curl rather than in the whitewater behind
// it. It is a property of a person on a board, not of this bathymetry, so it
// cannot be measured off the bed and is stated here rather than buried. 18 m
// is a little over one board-and-pocket at this scale; the authored face offset
// (11 + 5*pump) is the shoreward companion to it.
export const RIDER_POCKET_M = 18;
// Two different things, and conflating them cost a silent revert to the
// kinematic rider. A SLOW FRAME is still elapsed ride time and must be
// integrated (clamped, for stability); only a genuine clock DISCONTINUITY —
// setSim, a tab wake, a preset rebake — may restart the ride.
//
// The first version used one threshold for both: any dt over 0.1 s became
// dt = 0, and dt = 0 counted as a new ride, which re-pinned the rider onto the
// breakpoint. In the app at speed 8 with a throttled pane the per-frame dt is
// ~0.27 s, so EVERY frame reset him and he never accumulated a metre of lag —
// he looked exactly like the old kinematic rider while reporting a board
// speed. Any device dipping under 10 fps would have done the same thing
// silently. Found by running it in the renderer; headless, where dt is a fixed
// 1/30, could not see it.
const RIDER_MAX_DT_S = 0.1;    // integration step clamp
const RIDER_JUMP_S = 1.0;      // above this the clock has jumped, not lagged

// ---------- A2: what losing it looks like ----------
// TODO.md's long-standing intent, "section outruns surfer -> fall + tumble in
// whitewater", with the trigger now measured rather than authored.
//
// TWO FAILURE MODES, AND THEY ARE NOT THE SAME EVENT. The makeability field
// already separates them and they deserve different outcomes:
//   'outrun'   the peel beat him. He is behind the curl, the whitewater lands
//              on him, and he goes over. A wipeout.
//   'closeout' the wave shut down ahead of him -- a baked section gap. Nobody
//              was beaten; the wave simply ended. A kickout, not a fall.
// Losing a race is not the same as the race ending, and a model that renders
// both as a tumble is telling the player something false about the water.
//
// The gap predicate is INJECTED as P.gapFn, the same contract as zbFn and
// phaseFn and for the same reason: bed.js owns the bake and imports THREE,
// this file must stay THREE-free so node can reach it. Absent -> closeouts are
// simply not detected and every loss reads as an outrun.
const TUMBLE_S = 2.0;        // how long the whitewater has him
const TUMBLE_PUSH_M = 26;    // how far shoreward it carries him over that time
const TUMBLE_DRIFT_FRAC = 0.35;  // of his last along-line speed, decaying

// nearest sign change of S(x) - target to prevX (continuity, not global best),
// bisected to sub-mm. Returns null when the crest is not on the line here.
function crestCrossing(target, S, xLo, xHi, prevX) {
  const STEP = 2;
  let bestLo = null, bestHi = null, bestDist = Infinity;
  let pf = S(xLo) - target;
  for (let x = xLo + STEP; x <= xHi + STEP; x += STEP) {
    const xc = Math.min(x, xHi);
    const f = S(xc) - target;
    if ((pf <= 0) !== (f <= 0)) {
      const mid = xc - STEP * 0.5;
      const dist = prevX === null ? mid - xLo : Math.abs(mid - prevX);
      if (dist < bestDist) { bestDist = dist; bestLo = xc - STEP; bestHi = xc; }
    }
    pf = f;
    if (xc >= xHi) break;
  }
  if (bestLo === null) return null;
  let lo = bestLo, hi = bestHi, fLo = S(lo) - target;
  for (let i = 0; i < 34; i++) {
    const mid = 0.5 * (lo + hi), fm = S(mid) - target;
    if ((fm <= 0) === (fLo <= 0)) { lo = mid; fLo = fm; } else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// M6 part 3, step 2: solved in PHASE (radians) rather than in the ray
// coordinate S (metres). The two are the same statement while the wavelength is
// constant — phase = k*S — but under the shoaling wavelength there is no single
// k to divide by, so S stops being a usable crest label and the phase does not.
//
// The phase comes from rayPhase(), i.e. from P.phaseFn when the caller supplies
// one and the frozen-LAM plane wave otherwise — the same injection contract as
// zbFn, and for the same reason (bed.js owns the bake and imports THREE).
//
// The legacy branch is EXACTLY the old arithmetic, not an approximation of it:
// with phase = k*S, dx/dt = w/(dPhi/dx) = (LAM/T)/(dS/dx), and the old dS/dx
// floor of 0.02 and the new dPhi/dx floor both saturate the same [2, 90] clamp.
export function m4RideSolve(t, P, zbFn, st) {
  const w = 2 * PI / P.T;
  const xLo = (P.stageStart ?? -110) + RIDE_EDGE;
  const xHi = (P.stageEnd ?? 290) - RIDE_EDGE;
  if (!(xHi > xLo) || !(P.T > 0)) return null;
  // S here is the CREST LABEL along the break line, now in radians.
  const S = (x) => rayPhase(x, zbFn(x), P);
  const targetOf = (n) => w * t - 2 * PI * n;

  // The takeoff is where a crest FIRST meets the line: the minimum of S over
  // the stage, not the up-point stage edge. At Second Peak S is monotone and
  // the two coincide, but at Sewer Peak the emergent line is more oblique
  // than the crest over the up-point half, so the S minimum sits mid-stage —
  // the wave breaks first AT the peak and the crossing splits into a left
  // and a right. This model rides the down-point (+x) branch, so the march
  // is restricted to x >= takeoff. (Assuming the edge instead made the
  // Sewers rider wait forever: no crest ever crossed S(stageStart).)
  const STEP = 2;
  let takeoffX = xLo, sMin = S(xLo);
  for (let x = xLo + STEP; x <= xHi + STEP; x += STEP) {
    const xc = Math.min(x, xHi);
    const s = S(xc);
    if (s < sMin) { sMin = s; takeoffX = xc; }
    if (xc >= xHi) break;
  }
  const scanLo = Math.max(takeoffX - STEP, xLo);
  // most recent crest to have arrived at the takeoff: floor, so its
  // down-point crossing satisfies S(x) = target >= sMin by construction
  // (sMin is now a phase, so the k factor the old form carried is gone)
  const nTakeoff = Math.floor((w * t - sMin) / (2 * PI));

  if (!Number.isFinite(st.n)) { st.n = nTakeoff; st.prevX = null; }
  let x = crestCrossing(targetOf(st.n), S, scanLo, xHi, st.prevX);
  if (x === null && st.n !== nTakeoff) {
    // the followed crest ran off the stage end (or the sim clock jumped):
    // hand off to the crest now at the takeoff and start the next ride
    st.n = nTakeoff; st.prevX = null;
    x = crestCrossing(targetOf(st.n), S, scanLo, xHi, null);
  }
  const waiting = x === null;          // between crests: wait at the takeoff
  if (waiting) x = takeoffX;
  st.prevX = waiting ? null : x;

  // ground velocity along the line: S(x(t)) = w*t - 2*pi*n with S in radians,
  // so differentiating gives dx/dt = w / (dS/dx). Under the frozen wavelength
  // that is identically the old (LAM/T)/(dS_metres/dx). Floored: a
  // near-shore-parallel emergent line (derived alpha -> 0) is a closeout, not a
  // divide by zero, and the clamp below is what actually bounds it.
  const e = RIDE_PHASE_STENCIL_M;
  const xa = Math.max(x - e, xLo), xb = Math.min(x + e, xHi);
  const dSdx = (S(xb) - S(xa)) / Math.max(xb - xa, 1e-6);
  const zb = zbFn(x);
  const dzbdx = (zbFn(xb) - zbFn(xa)) / Math.max(xb - xa, 1e-6);
  // peelVelocity() is the ONE definition of w/(dPhi/dx) and of the along-line
  // conversion (peel-geometry.js); bed.js derivedPeelGeometry reaches the same
  // function by the other route. The stencil above stays this call site's own —
  // see the note there, the two forms disagree by up to 51% at bed.js's wider
  // stencil, so sharing a stencil would move the rider, not just the code.
  const peel = peelVelocity({ omega: w, phaseAlongDx: Math.max(dSdx, 1e-4), dzdx: dzbdx });
  // waiting keeps a token down-point heading: with vx = 0 the board's forward
  // vector is the pump term alone, which flips sign every half cycle and spun
  // the mesh 180 degrees on the spot. He faces the ride he is waiting for.
  // ?? NaN, not ?? 0: a non-finite dSdx used to make vx NaN and drop the whole
  // solve through the isFinite guard below, returning null. peelVelocity()
  // reports that case as null instead, and defaulting it to a number would turn
  // a refused solve into a 2 m/s ride — a behaviour change this refactor is not
  // allowed to make.
  const vx = waiting ? 2 : clamp(peel.xVelocityMps ?? NaN, 2, 90);

  // ---------- A1: let the peel leave him ----------
  // Everything above solved for the BREAKPOINT. If a board speed is declared,
  // the rider is a second body that chases it and can lose.
  //
  // He holds the pocket while the peel is slower than he is; where it is
  // faster he does his best and the breakpoint pulls away. `lag` is that gap,
  // and RIDER_POCKET_M is how much of it he survives.
  //
  // Path dependence is the real cost, and it is new: the shipped solve is a
  // pure function of (t, P) given the crest index, which is what makes it
  // seek-safe and screenshot-testable. A rider with momentum cannot be. The
  // integration therefore resets on any clock discontinuity rather than
  // pretending to be reversible, and a caller that jumps time (setSim) gets a
  // fresh ride, not a silently wrong one.
  let rx = x, rvx = vx, lagM = 0, fallen = false;
  let lostTo = null, tumbling = false, tumbleZ = 0;
  const board = Number(P.boardMps);
  if (Number.isFinite(board) && board > 0) {
    const dtRaw = Number.isFinite(st.lastT) ? t - st.lastT : 0;
    const jumped = !Number.isFinite(st.lastT) || dtRaw < 0 || dtRaw > RIDER_JUMP_S;
    const dt = jumped ? 0 : Math.min(dtRaw, RIDER_MAX_DT_S);
    st.lastT = t;
    const newRide = !Number.isFinite(st.xRider) || st.rideN !== st.n || waiting || jumped;
    if (newRide) {
      st.xRider = x; st.rideN = st.n;
      st.fallen = false; st.lostTo = null; st.fellT = null; st.fellX = null; st.fellVx = null;
    } else if (!st.fallen) {
      // the peel speed AT HIS station, not at the breakpoint's
      const ea = Math.max(st.xRider - e, xLo), eb = Math.min(st.xRider + e, xHi);
      const dS = (S(eb) - S(ea)) / Math.max(eb - ea, 1e-6);
      const vPeelHere = peelVelocity({ omega: w, phaseAlongDx: Math.max(dS, 1e-4) }).xVelocityMps;
      const want = Number.isFinite(vPeelHere) ? Math.abs(vPeelHere) : board;
      st.xRider += Math.min(want, board) * dt;
      if (st.xRider > xHi) { st.xRider = x; st.rideN = st.n; }
    }
    lagM = x - st.xRider;

    // A2: decide IF and HOW this ride ends, before moving him any further.
    if (!st.fallen && !waiting) {
      const shutAhead = typeof P.gapFn === 'function' && P.gapFn(st.xRider);
      if (shutAhead) {
        st.fallen = true; st.lostTo = 'closeout'; st.fellT = t; st.fellX = st.xRider;
        st.fellVx = rvx;
      } else if (lagM > RIDER_POCKET_M) {
        st.fallen = true; st.lostTo = 'outrun';   st.fellT = t; st.fellX = st.xRider;
        st.fellVx = rvx;
      }
    }
    fallen = !!st.fallen && !waiting;
    lostTo = fallen ? (st.lostTo || 'outrun') : null;

    if (fallen) {
      // Tumbling, then swimming. Only an OUTRUN tumbles: a closeout is a
      // kickout and he simply stops where the wave stopped.
      const since = Math.max(0, t - (st.fellT ?? t));
      tumbling = lostTo === 'outrun' && since < TUMBLE_S;
      if (tumbling) {
        const u = since / TUMBLE_S;                  // 0 -> 1 through the tumble
        const decay = (1 - u) * (1 - u);             // the soup lets go of him
        // carried along-line at a fraction of his last speed, and SHOREWARD by
        // the bore -- eased so the push is hardest right after he goes over
        st.xRider = (st.fellX ?? st.xRider) + (st.fellVx ?? 0) * TUMBLE_DRIFT_FRAC
                                              * TUMBLE_S * (u - u * u * 0.5) * 2;
        tumbleZ = TUMBLE_PUSH_M * (1 - decay);
      } else {
        tumbleZ = lostTo === 'outrun' ? TUMBLE_PUSH_M : 0;
      }
    }

    rx = fallen ? st.xRider : Math.min(st.xRider, x);
    // his ground speed is what he is actually doing, not what the curl is doing
    const ra = Math.max(rx - e, xLo), rb = Math.min(rx + e, xHi);
    const rdS = (S(rb) - S(ra)) / Math.max(rb - ra, 1e-6);
    const rPeel = peelVelocity({ omega: w, phaseAlongDx: Math.max(rdS, 1e-4) }).xVelocityMps;
    rvx = waiting ? 2 : clamp(Math.min(Math.abs(rPeel ?? board), board), 2, 90);
    if (fallen) rvx = clamp((st.fellVx ?? 2) * (tumbling ? TUMBLE_DRIFT_FRAC : 0.15), 2, 90);
  }

  const zbR = (Number.isFinite(board) && board > 0) ? zbFn(rx) : zb;
  const rxa = Math.max(rx - e, xLo), rxb = Math.min(rx + e, xHi);
  const dzbdxR = (Number.isFinite(board) && board > 0)
    ? (zbFn(rxb) - zbFn(rxa)) / Math.max(rxb - rxa, 1e-6) : dzbdx;

  const pump    = Math.sin(t * 2 * PI / PUMP_PERIOD);
  const faceOff = 11 + 5 * pump;       // shoreward/front face; same as authored path
  // A2: the whitewater carries him shoreward off the face he was riding.
  const z  = zbR + faceOff + tumbleZ;
  const vz = (waiting ? 0 : dzbdxR * rvx)
           + 5 * (2 * PI / PUMP_PERIOD) * Math.cos(t * 2 * PI / PUMP_PERIOD);
  if (!Number.isFinite(rx) || !Number.isFinite(z)
      || !Number.isFinite(rvx) || !Number.isFinite(vz)) return null;
  // x/vx are the RIDER's when a board speed is declared and the breakpoint's
  // otherwise, so every existing consumer (mesh heading, POV gaze, follow cam)
  // keeps working and starts following the rider the moment he has a speed.
  // breakX/lagM/fallen are additive: nothing shipped reads them yet.
  return { x: rx, z, vx: rvx, vz, pump, waiting, breakX: x, lagM,
           fallen, lostTo, tumbling };
}
