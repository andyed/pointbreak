// Physics-core residuals: the model's own per-spot numbers beside the standard
// closed-form surf relations, with the residual and its basis stated.
//
// MODEL.md 1 claims the GPU model is physics-owned for dispersion (Guo 2002),
// shoaling (Ks = sqrt(cg0/cg)), depth-limited breaking (H0*Ks >= gamma*h,
// gamma = 0.78), breaker type (Iribarren) and the peel speed Vp = c/sin(alpha).
// Nobody had put the derived numbers next to the textbook relations. This
// does, for each shipped preset at the card ocean and at card +/-30 % H0
// (tide 0, card T), and it writes one JSON of evidence for
// docs/research/PHYSICS_CORE_AUDIT_2026-09-23.md.
//
// WHAT IS MEASURED (model side). Everything on the line comes from the
// SHIPPED bake, read back through measure_size_headroom.measureState (which
// runs the LESSONS-4 gates G1-G3 at every rung: the excess field is bed.js's
// own, the replica line is the bake's own, the depth under the line satisfies
// the shipped criterion). Per station on the 2 m stage grid: depth under the
// line h, Ks(h), Hb = min(H_eff*Ks, gamma*h), local bed slope tan(beta) over a
// +/-25 m stencil, and the bake's own signed peel geometry (derivedAlphaDeg,
// its phase speed omega/|grad Phi| and the along-line peel speed). Stage
// medians exclude limiter-pinned and section-gap stations (main.js stageAlpha's
// own reductions).
//
// WHAT IS COMPARED (relation side), all closed forms in this file:
//   1. Hb, hb      Komar & Gaughan (1972) Hb = 0.56 H0 (H0/L0)^(-1/5);
//                  breaker index gamma_b: McCowan 0.78 (the model), Weggel
//                  (1972) gamma_b = b(m) - a(m) Hb/(g T^2) on the local slope,
//                  Battjes & Stive (1985) 0.5 + 0.4 tanh(33 H0/L0).
//   2. Ks          the shipped Guo-k shoaling coefficient against the exact
//                  linear-theory Ks from a bisection root of
//                  omega^2 = g k tanh(kh), at the depth under the line; and
//                  whether the 0.7/2.6 clamp or the growSyn mix is live.
//   3. xi          authored preset xi, bed.js iribarrenMeasured (plane-fit
//                  slope, offshore H0/L0), and two local forms on the slope
//                  AT the line: xi0 = tan(beta)/sqrt(H0/L0) and
//                  xib = tan(beta)/sqrt(Hb/L0). Battjes (1974) thresholds.
//   4. Vp, alpha   c = sqrt(g hb) and the linear c = omega/k(hb); Vp = c/sin
//                  of the authored alpha and of the derived alpha; the bake's
//                  own along-line peel speed; cg-based zipper; Walker's ~30 deg
//                  floor and the Hutt et al. (2001) skill-limit table.
//   5. face angle  the model's own shape function h = Hb*crestShape(theta', q)
//                  with theta' = theta - s(1 - cos theta), s = 0.8 (the clamp,
//                  saturated at the line because excess = 1 there), q at
//                  d = 0, differentiated against the local k. Physical (VIS
//                  removed). Carini et al. (2021) 22 deg spilling / 30 deg
//                  plunging. The GPU leg (probe_wave_shape.mjs) is the
//                  authority on the DRAWN face; this closed form is the
//                  explanation, and the doc reports both.
//   6. setup       setupPeakM = 0.3 H0 against Guza & Thornton (1981)
//                  0.17 Hs and the Longuet-Higgins & Stewart / Bowen et al.
//                  (1968) shoreline setup (3 gamma^2/8)/(1 + 3 gamma^2/8) hb.
//
// WHAT IS DECLARED. H0_MULTS (0.7, 1.0, 1.3), the +/-25 m slope stencil
// (measure_size_headroom.SLOPE_STENCIL_M, reused not retyped), and the Hutt
// table transcribed from SURF_SCIENCE_REFS 2.3 (verbatim from Barlow 2013
// Table 1.1). Everything else is read from the shipped code.
//
// Usage:
//   node scripts/measure_physics_residuals.mjs                 # all seven
//   node scripts/measure_physics_residuals.mjs --preset=sewers
//   --out=qa/physics-core   --tide=0   --json (print the summary)
//   --gpu=<dir>  fold a probe_wave_shape.mjs output directory in (its
//                summary.json), so the doc's face-angle row carries the GPU
//                number beside the closed form.
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// MUST be first: installs the `three` resolve hook and the bed source.
const R = await import('./measure_break_activation.mjs');
const SH = await import('./measure_size_headroom.mjs');
const bed = await import('../web-three/js/bed.js');
const D = await import('../web-three/js/dispersion.js');
const { PRESETS, PEEL_FLOOR } = await import('../shared/params.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const [X0, X1] = R.X_RANGE;
const { GAMMA, G } = D;

// ---------- declared ----------
export const H0_MULTS = [0.7, 1.0, 1.3];
// Hutt, Black & Mead (2001) Table (SURF_SCIENCE_REFS 2.3): the peel-angle
// LIMIT is the minimum alpha a surfer of that rating can negotiate. A wave at
// alpha therefore needs at least the lowest rating whose limit is <= alpha.
export const HUTT_LIMITS = [
  { rating: 1, limitDeg: 90, label: 'beginner' },
  { rating: 2, limitDeg: 70, label: 'learner' },
  { rating: 3, limitDeg: 60, label: 'pumping' },
  { rating: 4, limitDeg: 55, label: 'occasional manoeuvres' },
  { rating: 5, limitDeg: 50, label: 'consecutive manoeuvres' },
  { rating: 6, limitDeg: 40, label: 'advanced on occasion' },
  { rating: 7, limitDeg: 29, label: 'top amateur' },
  { rating: 8, limitDeg: 27, label: 'professional' },
];
export const WALKER_FLOOR_DEG = 30;
// Carini, Chickadel & Jessup (2021, part 2) face angle at breaking onset.
export const CARINI_DEG = { spilling: 22, plunging: 30 };
// Guza & Thornton (1981): shoreline setup ~0.17 x offshore significant height.
export const GT81_SETUP_PER_HS = 0.17;

// ---------- closed forms (pure) ----------
export const deepL0 = (T) => G * T * T / (2 * Math.PI);

// Exact linear dispersion by bisection: omega^2 = g k tanh(k h).
export function kExact(omega, h) {
  const f = (k) => G * k * Math.tanh(k * h) - omega * omega;
  let lo = 1e-6, hi = 100;
  for (let i = 0; i < 80; i++) { const m = 0.5 * (lo + hi); if (f(m) < 0) lo = m; else hi = m; }
  return 0.5 * (lo + hi);
}
export function cgExact(omega, h) {
  const k = kExact(omega, h), x = 2 * k * h;
  return 0.5 * (1 + x / Math.sinh(x)) * omega / k;
}
export function ksExact(T, h) {
  const omega = 2 * Math.PI / T;
  return Math.sqrt((G * T / (4 * Math.PI)) / cgExact(omega, h));
}
// Green's law proper (shallow asymptote), referenced to deep water: Ks_green
// = (cg0 / sqrt(g h))^(1/2). Reported so the doc can say how far the line is
// from the asymptote MODEL.md names the law after.
export function ksGreenShallow(T, h) {
  return Math.sqrt((G * T / (4 * Math.PI)) / Math.sqrt(G * h));
}

// Komar & Gaughan (1972): Hb = 0.56 H0 (H0/L0)^(-1/5).
export function hbKomarGaughan(H0, T) {
  return 0.56 * H0 * Math.pow(H0 / deepL0(T), -0.2);
}
// Weggel (1972): Hb/hb = b - a Hb/(g T^2), a = 43.75(1 - e^(-19 m)),
// b = 1.56/(1 + e^(-19.5 m)), m = beach slope.
export function gammaWeggel(m, Hb, T) {
  const a = 43.75 * (1 - Math.exp(-19 * m));
  const b = 1.56 / (1 + Math.exp(-19.5 * m));
  return b - a * Hb / (G * T * T);
}
// Battjes & Stive (1985): gamma = 0.5 + 0.4 tanh(33 H0/L0). Defined on Hrms
// in a random-wave dissipation model; reported as the third standard form.
export function gammaBattjesStive(H0, T) {
  return 0.5 + 0.4 * Math.tanh(33 * H0 / deepL0(T));
}
export function breakerClass(xi0) {
  return xi0 < 0.5 ? 'spilling' : xi0 <= 3.3 ? 'plunging' : 'surging';
}
export function huttRating(alphaDeg) {
  if (!Number.isFinite(alphaDeg)) return null;
  const a = Math.abs(alphaDeg);
  for (const r of HUTT_LIMITS) if (r.limitDeg <= a) return r;
  return { rating: 9, limitDeg: null, label: 'not reached (below the rating-8 limit)' };
}
// Longuet-Higgins & Stewart (1964) / Bowen, Inman & Simmons (1968): inside
// the surf zone d eta/dx = -K dh/dx with K = (3 gamma^2/8)/(1 + 3 gamma^2/8),
// so the shoreline setup above the breakpoint set-down is ~K hb.
export function setupLHS(hb, gamma = GAMMA) {
  const K = (3 * gamma * gamma / 8) / (1 + 3 * gamma * gamma / 8);
  return { K, shorelineM: K * hb, setdownAtBreakM: -gamma * gamma * hb / 16 };
}

// The model's own shape function (model-glsl.js ocean()), physical metres:
//   h(theta) = Hb * crestShape(theta', q),  theta' = theta - s (1 - cos theta)
//   crestShape(p, q) = (0.5 + 0.5 cos p)^q - 0.5/q
// and dh/dx = (dh/dtheta) k. Front face = the side theta' compresses, i.e. the
// steepest descent toward the shore. Returns the physical steepest front
// slope, the phase compression at that point, and the angle.
export function crestShapeJS(p, q) {
  return Math.pow(Math.max(0.5 + 0.5 * Math.cos(p), 0), q) - 0.5 / q;
}
export function faceAngleClosedForm({ Hb, k, xi, s = 0.8, dAtLine = 0, vis = 1 }) {
  const q = 2.2 + 1.5 * Math.exp(-Math.abs(dAtLine) / 55) * (0.6 + 0.5 * xi);
  const N = 8192;
  let maxFront = 0, maxBack = 0, thetaAtMax = null;
  let prev = null, prevTh = null;
  for (let i = 0; i <= N; i++) {
    const th = -Math.PI + 2 * Math.PI * i / N;
    const thp = th - s * (1 - Math.cos(th));
    const h = Hb * crestShapeJS(-thp, q);      // ocean(): crestShape(-theta, q)
    if (prev !== null) {
      const dhdth = (h - prev) / (th - prevTh);
      const slope = dhdth * k;                  // theta = omega t - S, |grad S| = k
      // Along +z (shoreward) the phase S increases, so theta decreases; a
      // shoreward-descending face has dh/dtheta > 0.
      if (slope > maxFront) { maxFront = slope; thetaAtMax = 0.5 * (th + prevTh); }
      if (-slope > maxBack) maxBack = -slope;
    }
    prev = h; prevTh = th;
  }
  const compression = thetaAtMax === null ? null : 1 - s * Math.sin(thetaAtMax);
  return {
    q, s, maxFrontSlope: maxFront, maxBackSlope: maxBack,
    frontDegPhys: Math.atan(maxFront) * 180 / Math.PI,
    frontDegDisp: Math.atan(maxFront * vis) * 180 / Math.PI,
    frontOverBack: maxFront / Math.max(maxBack, 1e-9),
    phaseCompressionAtMax: compression,
    HbK: Hb * k,
  };
}

// ---------- helpers ----------
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const r3 = (v) => (Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null);
const arg = (name, dflt = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};

// ---------- one (spot, H0) state ----------
export function measureResiduals(key, state) {
  const p = PRESETS[key];
  const spot = p.geoSpot;
  const { H0, T, tide } = state;
  const omega = 2 * Math.PI / T;
  const L0 = deepL0(T);
  const ms = SH.measureState(key, state);          // gates G1-G3 run inside
  if (ms.gate.g1 !== 0 || ms.gate.g2 !== 0 || ms.gate.g3Fails !== 0) {
    throw new Error(`${key} H0=${H0}: measureState gate failed ${JSON.stringify(ms.gate)}`);
  }
  // bed.js is now baked at this key/state (measureState -> bakeReal). Read the
  // per-station geometry off the SHIPPED bake through its own accessor.
  const xs = R.stageGrid(key);
  const wl = bed.MSL_ABOVE_NAVD88 + tide;
  const shelterOn = bed.getShelter();
  const st = [];
  for (const x of xs) {
    const z = bed.breakZAt(x, X0, X1);
    const gap = bed.breakGapAt(x, X0, X1);
    const h = wl - bed.bedElevBlended(spot, x, z, 0);
    const hh = Math.max(h, 0.05);
    const eff = H0 * (shelterOn ? D.shelterFactor(x) : 1);
    const Ks = D.shoaledHeight(1, T, hh);
    const Hb = D.heightAt(eff, T, hh);
    const eA = bed.bedElevBlended(spot, x, z - SH.SLOPE_STENCIL_M, 0);
    const eB = bed.bedElevBlended(spot, x, z + SH.SLOPE_STENCIL_M, 0);
    const tanB = Math.abs((eB - eA) / (2 * SH.SLOPE_STENCIL_M));
    const pg = bed.derivedPeelGeometry(x, X0, X1, { omega });
    st.push({ x, z, gap, h, Ks, Hb, eff, tanB,
              alphaDeg: pg?.alphaDeg ?? NaN,
              cPhase: pg?.phaseSpeedMps ?? NaN,          // omega/|grad Phi| on the baked field
              vpLine: pg?.lineVelocityMps ?? NaN,        // the bake's own along-line peel speed
              dzdx: pg?.dzdx ?? NaN,
              // the two bearings alpha is the difference of (peel-geometry.js):
              // the line's, from the bake, and the refracted crest's, from Psi
              breakBearingDeg: Number.isFinite(pg?.breakBearingRad) ? pg.breakBearingRad * 180 / Math.PI : NaN,
              crestBearingDeg: Number.isFinite(pg?.crestBearingRad) ? pg.crestBearingRad * 180 / Math.PI : NaN });
  }
  // stageAlpha's reductions: exclude limiter-pinned (backward slope >= GAP_SLOPE)
  // and gapped stations from the medians.
  const zArr = st.map((s) => s.z);
  const stats = R.stageStats(zArr, st.map((s) => s.alphaDeg), xs);
  const clean = st.filter((s, i) => !stats.pinned[i] && !s.gap);
  const med = (f) => median(clean.map(f));

  const hb = med((s) => s.h);
  const Hb = med((s) => s.Hb);
  const Ks = med((s) => s.Ks);
  const tanB = med((s) => s.tanB);
  const alphaDerived = stats.medianClean;
  const alphaAuth = p.alpha;
  const HbKG = hbKomarGaughan(H0, T);

  // 1. breaker height and depth
  const gammaModel = Hb / hb;                              // 0.78 at a true crossing by construction
  const gW = gammaWeggel(tanB, Hb, T);
  const gBS = gammaBattjesStive(H0, T);
  const hbFromKG = { weggel: HbKG / gW, mccowan: HbKG / GAMMA };

  // 2. shoaling: shipped (Guo k) vs exact linear at the depth under the line
  const KsEx = ksExact(T, hb);
  const KsGreen = ksGreenShallow(T, hb);
  const ksClampLive = clean.filter((s) => s.Ks >= 2.6 - 1e-9 || s.Ks <= 0.7 + 1e-9).length / Math.max(clean.length, 1);

  // 3. Iribarren
  const xiPlane = bed.iribarrenMeasured(spot, { H0, T });
  const xi0Local = tanB / Math.sqrt(H0 / L0);
  const xibLocal = tanB / Math.sqrt(Hb / L0);

  // 4. peel speed and angle
  const cSW = Math.sqrt(G * hb);
  const cLin = omega / D.wavenumberAt(omega, hb);
  const cgLin = D.groupVelocityAt(omega, hb);
  const cPhase = med((s) => s.cPhase);
  const vpLine = med((s) => Math.abs(s.vpLine));
  const sinA = (a) => Math.sin(Math.abs(a) * Math.PI / 180);
  const vp = {
    authSW: cSW / sinA(alphaAuth),
    authLin: cLin / sinA(alphaAuth),
    derivedSW: Number.isFinite(alphaDerived) ? cSW / sinA(alphaDerived) : NaN,
    derivedLin: Number.isFinite(alphaDerived) ? cLin / sinA(alphaDerived) : NaN,
    cgAuth: cgLin / sinA(alphaAuth),
    cgDerived: Number.isFinite(alphaDerived) ? cgLin / sinA(alphaDerived) : NaN,
    bakeLine: vpLine,
  };

  // 5. face angle, closed form on the model's own shape function
  const kLine = D.wavenumberAt(omega, hb);
  const face = faceAngleClosedForm({ Hb, k: kLine, xi: p.xi, vis: SH.K.vis.value });
  // The structural bracket: s = 0 is the symmetric carrier (no pitch at all),
  // s = 1 is the monotonicity limit of the phase map (dtheta'/dtheta = 1 - s
  // sin(theta) reaches 0 on the back face). The shipped 0.8 sits between them.
  const faceS0 = faceAngleClosedForm({ Hb, k: kLine, xi: p.xi, s: 0 });
  const faceS1 = faceAngleClosedForm({ Hb, k: kLine, xi: p.xi, s: 1 });
  const carini = CARINI_DEG[breakerClass(xi0Local)];

  // 6. setup
  const setupModel = 0.3 * H0;                              // model-glsl.js setupPeakM (u_depthMix = 1)
  const lhs = setupLHS(hb);
  const setup = {
    modelM: setupModel, modelDispM: setupModel * SH.K.vis.value,
    gt81M: GT81_SETUP_PER_HS * H0,
    lhsBowenM: lhs.shorelineM, lhsK: lhs.K, setdownAtBreakM: lhs.setdownAtBreakM,
    band015HbM: 0.15 * Hb, band020HbM: 0.20 * Hb,
  };

  const floor = PEEL_FLOOR[key];
  return {
    key, label: p.label, spot, state, mult: +(H0 / p.H0).toFixed(2),
    basis: { H0, T, tide, bedSource: R.BED_SOURCE || 'ncei13 (shipped)', L0: r3(L0),
             stations: st.length, clean: clean.length, pinned: stats.pinnedN,
             gapFrac: r3(ms.gapFrac), shelter: shelterOn,
             belowPeelFloor: floor ? H0 < floor.floorH0 : null, peelFloorH0: floor?.floorH0 ?? null },
    gate: ms.gate,
    breaking: {
      hbM: r3(hb), HbM: r3(Hb), HbOverH0: r3(Hb / H0), tanBetaLocal: r3(tanB),
      betaLocalDeg: r3(Math.atan(tanB) * 180 / Math.PI), betaPlaneDeg: r3(bed.planeSlopeDeg(spot)),
      HbKomarGaughanM: r3(HbKG), HbResidualVsKG: r3(Hb / HbKG - 1),
      gammaModel: r3(gammaModel), gammaWeggel: r3(gW), gammaBattjesStive: r3(gBS),
      hbFromKGWeggelM: r3(hbFromKG.weggel), hbFromKGMcCowanM: r3(hbFromKG.mccowan),
      hbResidualVsKGWeggel: r3(hb / hbFromKG.weggel - 1),
      gammaResidualVsWeggel: r3(GAMMA / gW - 1),
    },
    shoaling: {
      KsShipped: r3(Ks), KsExact: r3(KsEx), KsResidual: r3(Ks / KsEx - 1),
      KsGreenShallow: r3(KsGreen), KsVsGreen: r3(Ks / KsGreen - 1),
      clampLiveFrac: r3(ksClampLive), growSynLive: false,   // u_depthMix = 1 on every mapped preset
      khAtLine: r3(kLine * hb),
    },
    iribarren: {
      authored: p.xi, plane: r3(xiPlane), local0: r3(xi0Local), localB: r3(xibLocal),
      classAuthored: breakerClass(p.xi), classPlane: breakerClass(xiPlane), classLocal0: breakerClass(xi0Local),
      authoredOverLocal0: r3(p.xi / xi0Local),
    },
    peel: {
      alphaAuthoredDeg: alphaAuth, alphaDerivedDeg: r3(alphaDerived), alphaResidualDeg: r3(alphaDerived - alphaAuth),
      breakBearingDeg: r3(med((s) => s.breakBearingDeg)), crestBearingDeg: r3(med((s) => s.crestBearingDeg)),
      zLineMedianM: r3(med((s) => s.z)),
      cShallowMps: r3(cSW), cLinearMps: r3(cLin), cgLinearMps: r3(cgLin), cPhaseBakeMps: r3(cPhase),
      vp: Object.fromEntries(Object.entries(vp).map(([k, v]) => [k, r3(v)])),
      huttAuthored: huttRating(alphaAuth), huttDerived: huttRating(alphaDerived),
      aboveWalkerFloorAuthored: alphaAuth >= WALKER_FLOOR_DEG,
      aboveWalkerFloorDerived: Number.isFinite(alphaDerived) ? Math.abs(alphaDerived) >= WALKER_FLOOR_DEG : null,
    },
    face: {
      q: r3(face.q), s: face.s, HbK: r3(face.HbK),
      frontDegPhys: r3(face.frontDegPhys), frontDegDisp: r3(face.frontDegDisp),
      frontOverBack: r3(face.frontOverBack), phaseCompressionAtMax: r3(face.phaseCompressionAtMax),
      frontDegPhysS0: r3(faceS0.frontDegPhys), frontDegPhysS1: r3(faceS1.frontDegPhys),
      steepnessHbOverL: r3(Hb * kLine / (2 * Math.PI)),
      cariniDeg: carini, cariniClass: breakerClass(xi0Local),
      deficitDeg: r3(carini - face.frontDegPhys), ratioToCarini: r3(face.frontDegPhys / carini),
      gpu: null,
    },
    setup: Object.fromEntries(Object.entries(setup).map(([k, v]) => [k, r3(v)])),
    setupResiduals: {
      modelOverGT81: r3(setupModel / setup.gt81M),
      modelOverLHSBowen: r3(setupModel / setup.lhsBowenM),
      modelOverHb: r3(setupModel / Hb),
    },
  };
}

// ---------- the peel window ----------
// The derived alpha as a function of H0 through the SHIPPED bake (R.bakeReal,
// stageAlpha's own reductions), with the two bearings it is the difference of.
// The window is the contiguous H0 range around the card where the stage-median
// alpha clears Walker's ~30 deg floor; `null` if the card itself does not.
export const WINDOW_MULTS = Array.from({ length: 15 }, (_, i) => +(0.7 + 0.05 * i).toFixed(2));
export function peelWindow(key, { tide = 0, mults = WINDOW_MULTS } = {}) {
  const p = PRESETS[key];
  const omega = 2 * Math.PI / p.T;
  const rungs = [];
  for (const m of mults) {
    const H0 = +(p.H0 * m).toFixed(3);
    const real = R.bakeReal(key, { H0, T: p.T, tide });
    const stats = R.stageStats(real.z, real.alpha, real.xs);
    const bb = [], cb = [], hs = [];
    const wl = bed.MSL_ABOVE_NAVD88 + tide;
    real.xs.forEach((x, i) => {
      if (stats.pinned[i] || real.gap[i]) return;
      const pg = bed.derivedPeelGeometry(x, X0, X1, { omega });
      if (Number.isFinite(pg?.breakBearingRad)) bb.push(pg.breakBearingRad * 180 / Math.PI);
      if (Number.isFinite(pg?.crestBearingRad)) cb.push(pg.crestBearingRad * 180 / Math.PI);
      hs.push(wl - bed.bedElevBlended(p.geoSpot, x, real.z[i], 0));
    });
    rungs.push({ mult: m, H0, alphaDeg: r3(stats.medianClean), zMedianM: r3(median(real.z)),
                 hbM: r3(median(hs)), breakBearingDeg: r3(median(bb)), crestBearingDeg: r3(median(cb)),
                 gapFrac: r3(real.gap.reduce((a, b) => a + b, 0) / real.gap.length) });
  }
  const ok = rungs.map((r) => Number.isFinite(r.alphaDeg) && Math.abs(r.alphaDeg) >= WALKER_FLOOR_DEG);
  const ic = rungs.findIndex((r) => r.mult === 1);
  let lo = null, hi = null;
  if (ok[ic]) {
    let a = ic, b = ic;
    while (a > 0 && ok[a - 1]) a--;
    while (b < rungs.length - 1 && ok[b + 1]) b++;
    lo = rungs[a].H0; hi = rungs[b].H0;
    // an open end means the sweep, not the model, bounded it
    if (a === 0) lo = { openBelow: rungs[0].H0 };
    if (b === rungs.length - 1) hi = { openAbove: rungs[rungs.length - 1].H0 };
  }
  return { key, label: p.label, alphaAuthoredDeg: p.alpha, floorDeg: WALKER_FLOOR_DEG,
           peelFloorH0: PEEL_FLOOR[key]?.floorH0 ?? null, cardH0: p.H0, windowLoH0: lo, windowHiH0: hi, rungs };
}
export function windowMarkdown(windows) {
  const cell = (v) => (v === null ? 'card below floor' : typeof v === 'object' ? `open (${Object.values(v)[0]})` : f2(v));
  const out = ['### R4b. The peel window: derived α across 0.7×–1.4× card H0\n'];
  out.push(mdTable(['spot', 'α auth', 'card H0', 'peel floor (4.6)', '|α| ≥ 30° from', 'to', ...WINDOW_MULTS.map((m) => `×${m}`)],
    windows.map((w) => [w.label, `${w.alphaAuthoredDeg}°`, f2(w.cardH0), w.peelFloorH0 === null ? 'n/a' : f2(w.peelFloorH0),
      cell(w.windowLoH0), cell(w.windowHiH0), ...w.rungs.map((r) => f1(r.alphaDeg))])));
  out.push('\nBearings the α above is the difference of (stage medians, degrees from the stage x axis; line from the bake, crest from the baked Ψ):\n');
  out.push(mdTable(['spot', 'quantity', ...WINDOW_MULTS.map((m) => `×${m}`)],
    windows.flatMap((w) => [
      [w.label, 'line bearing', ...w.rungs.map((r) => f1(r.breakBearingDeg))],
      [w.label, 'crest bearing', ...w.rungs.map((r) => f1(r.crestBearingDeg))],
      [w.label, 'hb (m)', ...w.rungs.map((r) => f2(r.hbM))],
    ])));
  return out.join('\n');
}

// Fold a probe_wave_shape.mjs run in: per preset, the median over sims of the
// per-station steepest physical front face at the stations nearest the line.
export function foldGpu(rows, gpuDir) {
  const f = join(gpuDir, 'summary.json');
  if (!existsSync(f)) return rows;
  const recs = JSON.parse(readFileSync(f, 'utf8'));
  for (const row of rows) {
    if (row.mult !== 1) continue;
    const mine = recs.filter((r) => r.preset === row.key);
    if (!mine.length) continue;
    const phys = [], raw = [], disp = [], folds = [];
    for (const r of mine) {
      for (const s of r.spaceStats || []) {
        if (Number.isFinite(s.frontSlopeDegPhys)) phys.push(s.frontSlopeDegPhys);
        if (Number.isFinite(s.frontSlopeDegRaw)) raw.push(Math.atan(Math.tan(s.frontSlopeDegRaw * Math.PI / 180) / SH.K.vis.value) * 180 / Math.PI);
        if (Number.isFinite(s.frontSlopeDeg)) disp.push(s.frontSlopeDeg);
        if (Number.isFinite(s.folds)) folds.push(s.folds);
      }
    }
    row.face.gpu = {
      sims: mine.map((r) => r.sim), stations: phys.length,
      frontDegPhysDisplaced: r3(median(phys)), frontDegPhysRaw: r3(median(raw)),
      frontDegDisplayed: r3(median(disp)), foldsMedian: r3(median(folds)),
      H0: mine[0].H0, T: mine[0].T, xi: mine[0].xi, prov: mine[0].prov,
    };
  }
  return rows;
}

// ---------- the doc's tables, from the JSON and nothing else ----------
// One decimal below 5 % so a 0.3 % residual does not print as "-0 %".
const pct = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${(100 * v).toFixed(Math.abs(v) < 0.05 ? 1 : 0)} %` : 'n/a');
const f1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a');
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : 'n/a');
const f3 = (v) => (Number.isFinite(v) ? v.toFixed(3) : 'n/a');
function mdTable(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}
export function tablesMarkdown(rows) {
  const lab = (r) => `${r.label} ×${r.mult}${r.basis.belowPeelFloor ? ' †' : ''}`;
  const basis = (r) => `H0 ${f2(r.state.H0)} m, T ${r.state.T} s, tide 0`;
  const out = [];
  out.push('### R1. Breaker height and depth at the drawn line\n');
  out.push(mdTable(['spot', 'hb (m)', 'Hb (m)', 'Hb/H0', 'Hb K&G (m)', 'Hb resid.', 'tan β line', 'γb Weggel', 'γb B&S85', 'hb from K&G+Weggel (m)', 'hb resid.', 'basis'],
    rows.map((r) => { const b = r.breaking; return [lab(r), f2(b.hbM), f2(b.HbM), f2(b.HbOverH0), f2(b.HbKomarGaughanM), pct(b.HbResidualVsKG),
      f3(b.tanBetaLocal), f2(b.gammaWeggel), f2(b.gammaBattjesStive), f2(b.hbFromKGWeggelM), pct(b.hbResidualVsKGWeggel), basis(r)]; })));
  out.push('\n### R2. Shoaling coefficient at the line\n');
  out.push(mdTable(['spot', 'Ks shipped (Guo k)', 'Ks exact linear', 'resid.', 'Ks Green shallow', 'shipped vs Green', 'kh', 'clamp live', 'growSyn live', 'basis'],
    rows.map((r) => { const s = r.shoaling; return [lab(r), f3(s.KsShipped), f3(s.KsExact), pct(s.KsResidual), f3(s.KsGreenShallow), pct(s.KsVsGreen),
      f2(s.khAtLine), pct(s.clampLiveFrac), s.growSynLive ? 'yes' : 'no', basis(r)]; })));
  out.push('\n### R3. Breaker type: authored ξ against the bed\n');
  out.push(mdTable(['spot', 'ξ authored', 'class', 'ξ plane-fit (iribarrenMeasured)', 'ξ0 local (H0)', 'class', 'ξb local (Hb)', 'authored / local ξ0', 'β line (°)', 'β plane (°)', 'basis'],
    rows.map((r) => { const x = r.iribarren, b = r.breaking; return [lab(r), f2(x.authored), x.classAuthored, f2(x.plane), f2(x.local0), x.classLocal0, f2(x.localB),
      f1(x.authoredOverLocal0), f2(b.betaLocalDeg), f2(b.betaPlaneDeg), basis(r)]; })));
  out.push('\n### R4. Peel angle and peel speed at the line\n');
  out.push(mdTable(['spot', 'α authored', 'α derived (stage median)', 'Δα', 'c √(g hb)', 'c linear', 'cg', 'Vp c/sin α auth', 'Vp c/sin α derived', 'Vp bake (along line)', 'Vp cg/sin α auth', 'Hutt rating auth / derived', 'basis'],
    rows.map((r) => { const p = r.peel; return [lab(r), `${p.alphaAuthoredDeg}°`, `${f1(p.alphaDerivedDeg)}°`, `${f1(p.alphaResidualDeg)}°`, f2(p.cShallowMps), f2(p.cLinearMps), f2(p.cgLinearMps),
      f1(p.vp.authSW), f1(p.vp.derivedSW), f1(p.vp.bakeLine), f1(p.vp.cgAuth), `${p.huttAuthored?.rating ?? 'n/a'} / ${p.huttDerived?.rating ?? 'n/a'}`, basis(r)]; })));
  out.push('\n### R5. Front-face angle, physical (VIS removed)\n');
  out.push(mdTable(['spot', 'Hb/L', 'q at line', 'face s=0', 'face shipped s=0.8', 'face s=1 (limit)', 'front/back', 'GPU displaced', 'GPU raw', 'Carini target', 'deficit', 'basis'],
    rows.map((r) => { const f = r.face; return [lab(r), f3(f.steepnessHbOverL), f2(f.q), `${f1(f.frontDegPhysS0)}°`, `${f1(f.frontDegPhys)}°`, `${f1(f.frontDegPhysS1)}°`, f2(f.frontOverBack),
      f.gpu ? `${f1(f.gpu.frontDegPhysDisplaced)}°` : 'n/a', f.gpu ? `${f1(f.gpu.frontDegPhysRaw)}°` : 'n/a', `${f.cariniDeg}° (${f.cariniClass})`, `${f1(f.deficitDeg)}°`, basis(r)]; })));
  out.push('\n### R6. Set-peak setup\n');
  out.push(mdTable(['spot', 'setupPeakM 0.3·H0 (m)', 'displayed ×VIS (m)', 'G&T81 0.17·Hs (m)', 'model / G&T81', 'LHS64/Bowen68 K·hb (m)', 'model / LHS', '0.15–0.20·Hb (m)', 'model / Hb', 'basis'],
    rows.map((r) => { const s = r.setup, q = r.setupResiduals; return [lab(r), f2(s.modelM), f2(s.modelDispM), f2(s.gt81M), f2(q.modelOverGT81), f2(s.lhsBowenM), f2(q.modelOverLHSBowen),
      `${f2(s.band015HbM)}–${f2(s.band020HbM)}`, f2(q.modelOverHb), basis(r)]; })));
  out.push('\n† below the spot\'s measured peel floor (`PEEL_FLOOR`, MODEL.md 4.6): the line has collapsed to the inshore branch, so α there measures the collapse, not a peel.');
  return out.join('\n');
}

// ---------- main ----------
async function main() {
  const only = arg('preset');
  const tide = Number(arg('tide', '0'));
  const out = join(ROOT, arg('out', 'qa/physics-core'));
  mkdirSync(out, { recursive: true });
  const keys = only ? [only] : Object.keys(PRESETS);
  const rows = [];
  for (const key of keys) {
    for (const m of H0_MULTS) {
      const H0 = +(PRESETS[key].H0 * m).toFixed(3);
      const row = measureResiduals(key, { H0, T: PRESETS[key].T, tide });
      rows.push(row);
      const b = row.breaking, s = row.shoaling, x = row.iribarren, pl = row.peel, f = row.face, su = row.setup;
      console.log(`${key.padEnd(10)} x${m} H0=${H0.toFixed(2)} T=${PRESETS[key].T} | hb ${b.hbM} Hb ${b.HbM} (KG ${b.HbKomarGaughanM}, ${(100 * b.HbResidualVsKG).toFixed(0)}%) ` +
        `gW ${b.gammaWeggel} | Ks ${s.KsShipped} ex ${s.KsExact} | xi auth ${x.authored} plane ${x.plane} loc0 ${x.local0} | ` +
        `a ${pl.alphaAuthoredDeg}/${pl.alphaDerivedDeg} c ${pl.cShallowMps} Vp ${pl.vp.authSW}/${pl.vp.derivedSW}/${pl.vp.bakeLine} | ` +
        `face ${f.frontDegPhys} vs ${f.cariniDeg} | setup ${su.modelM} vs GT ${su.gt81M} LHS ${su.lhsBowenM}` +
        (row.basis.belowPeelFloor ? '  [below peel floor]' : ''));
    }
  }
  const gpuDir = arg('gpu');
  if (gpuDir) foldGpu(rows, join(ROOT, gpuDir));
  const windows = keys.map((key) => peelWindow(key, { tide }));
  for (const w of windows) {
    console.log(`${w.key.padEnd(10)} peel window |alpha| >= ${WALKER_FLOOR_DEG}: ${JSON.stringify(w.windowLoH0)} .. ${JSON.stringify(w.windowHiH0)}  ` +
      w.rungs.map((r) => `${r.mult}:${r.alphaDeg}`).join(' '));
  }
  const summary = {
    generated: new Date().toISOString(), bedSource: R.BED_SOURCE || 'ncei13 (shipped)',
    declared: { H0_MULTS, WINDOW_MULTS, slopeStencilM: SH.SLOPE_STENCIL_M, tide, HUTT_LIMITS, WALKER_FLOOR_DEG, CARINI_DEG, GT81_SETUP_PER_HS },
    pinned: Object.fromEntries(Object.entries(SH.K).map(([k, v]) => [k, v.value])),
    rows, windows,
  };
  writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 1));
  writeFileSync(join(out, 'tables.md'), tablesMarkdown(rows) + '\n\n' + windowMarkdown(windows) + '\n');
  if (process.argv.includes('--json')) console.log(JSON.stringify(summary, null, 1));
  console.log(`\nwrote ${join(out, 'summary.json')} and tables.md`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) await main();
