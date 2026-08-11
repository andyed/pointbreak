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

const PI  = Math.PI;
const LAM = 90.0;   // MODEL-TWIN: display wavelength, m
const VIS = 3.2;    // MODEL-TWIN: visual amplitude gain

// ---------- GLSL-style helpers ----------
const fract = (x) => x - Math.floor(x);
const clamp = (x, a, b) => Math.min(Math.max(x, a), b);
const mix   = (a, b, t) => a + (b - a) * t;
function smoothstep(a, b, x) {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
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
  const hb = Math.max(P.H0 / 0.78, 0.4);          // GAMMA = 0.78
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

// Realized peel angle at station x, radians (diagnostic — HUD and docs).
export function peelAngleAt(x, P) {
  const cc = coastCurveSlope(x, P);
  return Math.atan(-cc) - Math.atan(-Math.tan(swellPhi(P)) - cc);
}

export function breakLine(x, P) {
  const xx = mix(x, Math.abs(x), P.aframe);
  const sec = P.sections * 55 * (vnoise1(xx * 0.02 + 7.3) - 0.5) * 2;
  // the break line IS the contour through the surf node (contourZ = 0)
  return -coastCurve(x, P) + Math.min(sec, 0) * (P.sections >= 0.05 ? 1 : 0);
}

export function reefWindow(x, P) {
  const xx = mix(x, Math.abs(x), P.aframe);
  return smoothstep(-110, -35, xx) * (1 - smoothstep(215, 290, xx));
}

function setEnv(s, t, P) {
  const cg = 0.5 * LAM / P.T;                 // deep-water group speed = c/2
  return 0.5 + 0.5 * Math.cos(2 * PI * P.dF * (t - s / cg));
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
  const decay = 1 - 0.68 * brk;

  const s     = rayS(x, z, P);
  const theta = w * t - k * s;
  const env   = setEnv(s, t, P), env2 = env * env;
  const q     = 1.6 + 3.2 * Math.exp(-Math.abs(d) / 55) * (0.6 + 0.5 * P.xi);
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
// Closed-form rider on the zipper: no state. Ride the face just seaward of
// the break line, pumping between bottom turn and top turn on a 6 s cycle.
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
  const faceOff = 11 + 5 * pump;              // metres seaward of the break line
  const xfold   = mix(xs, Math.abs(xs), P.aframe);
  // crest snap in the CONTOUR frame — see model-glsl.js surferState for why a
  // bare z shift fails
  const zcTarget = -(P.rideOffset || 0);      // break line is contourZ = 0
  const nz       = Math.floor((w * t - k * (xfold * sp + zcTarget * cp)) / (2 * Math.PI) + 0.5);
  const zcCrest  = ((w * t - 2 * Math.PI * nz) / k - xfold * sp) / cp;
  const zs       = zcCrest - faceOff - coastCurve(xs, P);
  const vz       = -coastCurveSlope(xs, P) * vx
                 - 5 * (2 * PI / PUMP_PERIOD) * Math.cos(t * 2 * PI / PUMP_PERIOD);
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

export function m4RideSolve(t, P, zbFn, st) {
  const k = 2 * PI / LAM, w = 2 * PI / P.T;
  const xLo = (P.stageStart ?? -110) + RIDE_EDGE;
  const xHi = (P.stageEnd ?? 290) - RIDE_EDGE;
  if (!(xHi > xLo) || !(P.T > 0)) return null;
  const S = (x) => rayS(x, zbFn(x), P);
  const targetOf = (n) => (w * t - 2 * PI * n) / k;

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
  const nTakeoff = Math.floor((w * t - k * sMin) / (2 * PI));

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

  // ground velocity along the line: S(x(t)) = (w*t - 2*pi*n)/k, so
  // dx/dt = c / (dS/dx) with c = LAM/T. Floored: a near-shore-parallel
  // emergent line (derived alpha -> 0) is a closeout, not a divide by zero.
  const e = 1.5;
  const xa = Math.max(x - e, xLo), xb = Math.min(x + e, xHi);
  const dSdx = (S(xb) - S(xa)) / Math.max(xb - xa, 1e-6);
  // waiting keeps a token down-point heading: with vx = 0 the board's forward
  // vector is the pump term alone, which flips sign every half cycle and spun
  // the mesh 180 degrees on the spot. He faces the ride he is waiting for.
  const vx = waiting ? 2 : clamp((LAM / P.T) / Math.max(dSdx, 0.02), 2, 90);
  const zb = zbFn(x);
  const dzbdx = (zbFn(xb) - zbFn(xa)) / Math.max(xb - xa, 1e-6);

  const pump    = Math.sin(t * 2 * PI / PUMP_PERIOD);
  const faceOff = 11 + 5 * pump;       // same face position the authored path uses
  const z  = zb - faceOff;
  const vz = (waiting ? 0 : dzbdx * vx)
           - 5 * (2 * PI / PUMP_PERIOD) * Math.cos(t * 2 * PI / PUMP_PERIOD);
  if (!Number.isFinite(x) || !Number.isFinite(z)
      || !Number.isFinite(vx) || !Number.isFinite(vz)) return null;
  return { x, z, vx, vz, pump, waiting };
}
