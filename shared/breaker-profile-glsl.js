// The overturning cross-section of a plunging breaker, as a 2D curve in the
// wave's own vertical plane. This is the CONTRACT the swept tube ribbon
// (web-three/js/tube.js) is built on; the body here is a STUB — a crest arc
// joined to a parabolic free-fall jet — that Track A replaces with the
// measured profile. Do not change the two signatures; everything downstream
// (the ribbon, the grid handover in choppyPos, scripts/probe_tube.mjs) reads
// exactly these.
//
// Spliced AFTER MODEL_GLSL (needs PI, CRASH_PEAK_S, CRASH_SIGMA_S), and only
// under `#ifdef TUBE` (shaders.js SURFACE_PRELUDE), so a default build compiles
// the pristine shader text — the #roller precedent.
//
//   vec2  breakerProfile(u, age, xi, hC, c)  -> (s shoreward, y up), PHYSICAL m
//   float breakerProfileWeight(age, xi)      -> 0..1, zero at both lifecycle ends
//
// u in [0,1] walks the curve: 0 is the BACK SEAM at s = -0.5*hC on the back
// face, 1 is the LANDING SEAM at y = 0. age is seconds since this station's
// crest crossed the break line — the same clock breakerCurlCycle runs on:
// 0 = the pitch starts, CRASH_PEAK_S (0.42 s) = impact, released by 0.72 s.
// xi is the Iribarren number (u_xi), hC the PHYSICAL crest height (the
// displayed ceiling breakerCeilM divided by VIS), c the local phase speed
// omega/k in m/s. Callers scale y by VIS when they draw it.
export const BREAKER_PROFILE_GLSL = `
// ---------- breaker profile (STUB — Track A owns the real one) ----------
// The crest sits at profile parameter BP_ARC_U: below it the back arc, above
// it the jet. The upper edge has cleared to the foot by BP_END_S, the same
// CRASH_PEAK_S + 1.5*CRASH_SIGMA_S the bend releases over.
const float BP_ARC_U = 0.35;
const float BP_END_S = CRASH_PEAK_S + 1.5*CRASH_SIGMA_S;   // 0.72 s

// Battjes: spilling below xi ~0.5 throws no jet. Same 0.45-1.25 smoothstep the
// bend, the foam and the curtain all key character off, so a spilling site
// (Sharks 0.45, Privates 0.35) gets exactly zero from this file.
float bpPlunge(float xi){ return smoothstep(0.45, 1.25, xi); }

float breakerProfileWeight(float age, float xi){
  float onW  = smoothstep(0.0, 0.05, age);            // zero before the pitch
  float offW = 1.0 - smoothstep(0.60, BP_END_S, age);  // zero at the bore handoff
  float w = bpPlunge(xi) * onW * offW;
  if (!(w == w)) w = 0.0;                              // NaN guard (house rule)
  return clamp(w, 0.0, 1.0);
}

vec2 breakerProfile(float u, float age, float xi, float hC, float c){
  hC = max(hC, 0.05);
  c  = max(c, 0.1);
  // Free-fall landing distance: a jet leaving the crest horizontally at the
  // phase speed lands c*sqrt(2 hC/g) ahead. Clamped to the [0.9, 1.6] crest
  // heights the shared landing frame spans (CURT_REACH .. the classic-descent
  // receiver), so the stub cannot land outside the band the impact consumers
  // already agree on.
  float tL = sqrt(2.0*hC/G);
  float sL = clamp(c*tL, 0.9*hC, 1.6*hC);
  // Lifecycle on the shared clock. Before impact the tip advances along the
  // jet (linear in the parabola parameter = free-fall kinematics: s ~ t,
  // y ~ t^2); after impact the foot is pinned and the UPPER edge clears down
  // the curve to the foot, so the ribbon collapses onto its landing instead
  // of being pulled back up the face (LIP_DESCENT_EXPERIMENT).
  float tip   = clamp(age/CRASH_PEAK_S, 0.0, 1.0);
  float clearP = smoothstep(CRASH_PEAK_S, BP_END_S, age);
  float pTip  = BP_ARC_U + (1.0 - BP_ARC_U)*tip;
  float p = clamp(u, 0.0, 1.0);
  p = max(p, clearP);   // nothing remains above the clearing edge
  p = min(p, pTip);     // nothing exists past the flying tip
  vec2 pr;
  if (p < BP_ARC_U) {
    // Back arc: quarter-ellipse from the back seam (-0.5 hC, 0.6 hC) up to the
    // crest (0, hC), arriving with a horizontal tangent so the jet leaves C1.
    float a = (p/BP_ARC_U)*0.5*PI;
    pr = vec2(-0.5*hC*cos(a), hC*(0.60 + 0.40*sin(a)));
  } else {
    // Jet: the parabola s = sL*tau, y = hC*(1 - tau^2), tau in [0,1].
    float tau = (p - BP_ARC_U)/(1.0 - BP_ARC_U);
    pr = vec2(sL*tau, hC*(1.0 - tau*tau));
  }
  if (!(pr.x == pr.x && pr.y == pr.y)) pr = vec2(0.0, hC);   // NaN guard (house rule)
  return pr;
}
`;
