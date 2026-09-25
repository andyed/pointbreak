// The breaking-crest cross-section family (Track A, 2026-09-24).
//
// A single-valued height field cannot carry a thrown lip: past the cusp the
// crest passes OVER the trough and the surface is multivalued in z
// (WEB_THREE_SPEC M6 part 4). This module is the 2-D section that the swept
// crest-band ribbon (Track B) extrudes along the zipper. It is pure GLSL with
// no uniforms: every input is an argument, so the same text runs in the
// renderer, in the experiments/tube-profile.html explorer, and in the headless
// readback probe (scripts/probe_breaker_profile.mjs). No JS transliteration
// exists on purpose -- the CPU twin drifts (memory: GPU path owns picture
// claims).
//
// Frame. (s, y) in PHYSICAL metres at one alongshore station: s is metres
// shoreward of the crest source point (the grid's theta = 0 crest, which
// travels at the phase speed), y is metres above still water. The caller
// applies VIS; hC arrives as breakerCeilM/VIS.
//
// The curve is the whole free surface of the crest band, walked once:
//
//   u = 0.00        back seam B, on the unbroken back face 0.5 hC seaward
//   0.00 .. 0.10    back face up to the crest apex A (post-impact: to the
//                   trailing edge of the clearing sheet)
//   0.10 .. 0.45    the jet's upper surface, apex to tip, along the ballistic
//   0.45 .. 0.80    the jet's underside, tip back to the lip root R
//   0.80 .. 1.00    the concave face, root down to the landing seam L
//   u = 1.00        landing seam L = (sL, 0) on the trough ahead
//
// The region enclosed between the underside leg and the face leg is the tube.
// Before impact the tip is in the air and the underside/face legs meet only at
// the root, so the curve does not self-intersect; at impact the tip reaches L
// and the tube closes. Fixed u fractions keep the ribbon's topology stable
// across age, so Track B can bind vertex rows to legs once.
//
// Seam contract (what Track B blends to the real surfacePos):
//   B = (-0.5 hC, hC (1 - 0.5 tan 30 deg)) = (-0.5 hC, 0.711 hC). The back
//       face is assumed to fall at Stokes' limiting crest angle: a 120-degree
//       crest has each flank 30 degrees below horizontal. This is the assumed
//       height-field value at the seam, not a measurement of the grid.
//   L = (sL, 0): the landing, at still-water level on the face/trough ahead.
//       sL = plunge(xi) * c * sqrt(2 hC / g)  (ballistic reach, below).
// Both seams are fixed for all ages, so the ribbon's edges never move against
// the grid; only the interior does.
//
// Clock. age is seconds since this station's crest crossed the break line,
// the same clock as breakerCurlCycle / breakerLandingFrameAt: 0 = the lip
// starts to pitch, BP_IMPACT_S = 0.42 s = jet impact, release complete by
// 0.72 s. The physical free-fall time from hC is sqrt(2 hC / g) -- 0.78 s for
// a 3 m lip, 0.42 s only for a 0.87 m fall -- so the shared clock runs a big
// lip's fall faster than gravity does. The profile keeps the ballistic SHAPE
// (the parabola) and maps the shared clock onto it linearly in horizontal
// reach, which is exactly how a horizontally launched body traverses its own
// parabola. The warp factor sqrt(2 hC / g) / 0.42 is reported in
// docs/research/BREAKER_PROFILE_2026-09-24.md rather than hidden.
//
// Constants that mirror shared/model-glsl.js carry a BP_ prefix so this text
// can be concatenated after MODEL_GLSL without redefinition errors;
// tests/breaker-profile.test.js asserts they stay equal to the originals.
export const BREAKER_PROFILE_GLSL = `
const float BP_G = 9.81;            // == G in model-glsl.js
const float BP_IMPACT_S = 0.42;     // == CRASH_PEAK_S: the jet lands
const float BP_SIGMA_S = 0.20;      // == CRASH_SIGMA_S
// Release ends 1.5 sigmas after impact, the same endpoint breakerCurlCycle
// and the descent curtain use (0.72 s), so the ribbon hands off to the bore
// exactly when the grid's bend has let go.
const float BP_RELEASE_S = BP_IMPACT_S + 1.5*BP_SIGMA_S;
// Back seam sits half a crest height seaward of the crest source point.
const float BP_BACK_S = 0.5;
// tan(30 deg): Stokes' 120-degree limiting crest puts each flank 30 degrees
// below horizontal, so the back face at -0.5 hC is 0.5*tan(30)*hC below the apex.
const float BP_BACK_TAN = 0.5773503;
// Jet root thickness as a fraction of hC. Authored, in-repo: the shipped
// classic bend widens its crown band by 0.12*hCrest (MODEL.md, silhouette
// experiment). Kept so the ribbon's lip is the same thickness the grid's hook
// already draws; no field measurement of lip thickness exists in this repo.
const float BP_ROOT_THICK = 0.12;
// sqrt(H0/L0) for the model-card day, Sewers H0 2.2 m, T 15 s (L0 = gT^2/2pi =
// 351 m): the wave steepness that converts the authored Iribarren number back
// to a bed slope, tan(beta) = xi*sqrt(H0/L0), for the Mead & Black regression.
const float BP_SQRT_STEEP = 0.0791;
// Battjes (1974) inshore-form thresholds: spilling below 0.4, plunging
// 0.4..2.0, collapsing/surging above 2.0. The roundness ramp runs across the
// plunging band exactly, so it carries no free endpoint.
const float BP_XI_SPILL = 0.4;
const float BP_XI_COLLAPSE = 2.0;
// Leg boundaries in u (see the header). Fixed so ribbon topology is stable.
const float BP_U_APEX = 0.10;
const float BP_U_TIP = 0.45;
const float BP_U_ROOT = 0.80;

// The renderer's plunging blend, byte-for-byte the ramp shaders.js and
// model-glsl.js use (smoothstep(0.45, 1.25, u_xi)), so the profile agrees
// with the grid, the curtain and the splash about how plunging a site is.
// Battjes puts the spilling/plunging boundary at 0.4-0.5; the 1.25 top is the
// renderer's shared choice, inherited, not re-derived here.
float bpPlunge(float xi){ return smoothstep(0.45, 1.25, xi); }

// Mead & Black (2001c, JCR SI 29 pp. 51-65): vortex length/width ratio
// Y = 0.065 X + 0.821 (R^2 0.71) against the orthogonal seabed gradient
// expressed as the run X of a 1:X slope (steeper bed -> lower ratio -> rounder
// tube). X = 1/tan(beta) = 1/(xi*sqrt(H0/L0)). The X-as-run reading is the
// one SURF_SCIENCE_REFS.md 2.1 records and flags to confirm against the
// original figure; the direction (steep = round) is not in doubt.
float bpVortexRatio(float xi){
  return 0.821 + 0.065/(max(xi, 0.05)*BP_SQRT_STEEP);
}
// 0 = almond (flat face, spilling boundary), 1 = round (fully concave face,
// collapsing boundary). Linear in vortex ratio across Battjes' plunging band.
float bpRoundness(float xi){
  float vrSpill = bpVortexRatio(BP_XI_SPILL);
  float vrRound = bpVortexRatio(BP_XI_COLLAPSE);
  return clamp((vrSpill - bpVortexRatio(xi))/max(vrSpill - vrRound, 1e-4), 0.0, 1.0);
}
// Free fall from the apex to still water: t = sqrt(2 hC / g).
float bpFallTime(float hC){ return sqrt(2.0*hC/BP_G); }
// Ballistic reach. The lip leaves the crest horizontally at the phase speed
// (Longuet-Higgins / Peregrine plunging-jet picture; the brief's model) scaled
// by the plunging blend, and lands where it meets still water:
// sL = v * sqrt(2 hC / g). At full plunge and depth-limited c = sqrt(g h),
// hC = 0.8*0.78 h, this is a constant 1.79 hC; at the sheet's (hC 3, c 6) it
// is 1.56 hC. The repo's authored receiver is 0.9..1.6 hC (CURT_REACH, the
// descent note) -- the ballistic answer sits at, and a little past, its top.
float bpReach(float xi, float hC, float c){
  return bpPlunge(xi)*c*bpFallTime(hC);
}
// The jet's upper surface as a function of sigma in [0,1], the fraction of
// the horizontal reach covered. Horizontal launch: s = v t, y = hC - g t^2/2,
// so y = hC (1 - sigma^2) with no explicit time -- the parabola's shape is the
// physics, the clock only decides how much of it has been drawn.
vec2 bpJet(float sigma, float hC, float sL){
  return vec2(sigma*sL, hC*(1.0 - sigma*sigma));
}
// Outward (up/forward) unit normal of the jet surface at sigma.
vec2 bpJetNormal(float sigma, float hC, float sL){
  vec2 tng = vec2(sL, -2.0*hC*sigma);
  float len = length(tng);
  if (len < 1e-6) return vec2(0.0, 1.0);
  tng /= len;
  return vec2(-tng.y, tng.x);
}
// Sheet thickness at sigma. Every particle keeps the launch speed v and gains
// g t downward, so the sheet's arc speed is sqrt(v^2 + (g t)^2) and a
// mass-conserving sheet thins by v / sqrt(v^2 + (g t)^2) (kinematic stretching
// of a free-falling sheet). Root thickness BP_ROOT_THICK*hC, times the
// plunging blend so a spilling crest has no sheet at all.
float bpThickness(float sigma, float xi, float hC, float c){
  float plunge = bpPlunge(xi);
  float v = max(plunge*c, 1e-3);
  float gt = BP_G*sigma*bpFallTime(hC);
  float stretch = inversesqrt(1.0 + (gt*gt)/(v*v));
  return BP_ROOT_THICK*hC*plunge*stretch;
}

// Cross-section of the breaking crest band in the local (s, y) plane at one
// alongshore station. s = metres shoreward of the crest source point (the
// grid's theta = 0 crest), y = metres above still water. PHYSICAL metres:
// the caller applies VIS.
// u in [0,1]: u = 0 is the back seam (on the unbroken back face, ~0.5 hC
// seaward of the crest, matching the heightfield there); u = 1 is the landing
// seam on the trough/face ahead. In between the curve runs over the crest,
// along the thrown lip, down the jet to the landing. The enclosed region
// between the jet and the concave face is the tube.
// age: seconds since this station's crest crossed the break line (same clock
// as breakerCurlCycle / breakerLandingFrameAt: 0 = lip starts to pitch,
// CRASH_PEAK_S = 0.42 s = jet impact, release by 0.72 s, bore after).
// xi: Iribarren number (u_xi). hC: depth-limited crest height in metres
// (breakerCeilM / VIS). c: local phase speed m/s (the jet's horizontal launch speed).
vec2 breakerProfile(float u, float age, float xi, float hC, float c){
  u   = clamp(u, 0.0, 1.0);
  age = clamp(age, -1.0, 20.0);
  xi  = clamp(xi, 0.0, 5.0);
  hC  = clamp(hC, 0.05, 50.0);
  c   = clamp(c, 0.0, 50.0);
  float sL  = bpReach(xi, hC, c);
  float rho = bpRoundness(xi)*bpPlunge(xi);   // spilling: no cavity at all
  // Leading edge of the sheet along the parabola: linear in age up to impact,
  // because horizontal reach is linear in time for a horizontal launch.
  float sig1 = clamp(age/BP_IMPACT_S, 0.0, 1.0);
  // Trailing edge: pinned at the apex until impact, then clears toward the
  // landing over the release window (the descent experiment's handoff: foot
  // fixed at the landing, upper edge advances to it).
  float sig0 = smoothstep(BP_IMPACT_S, BP_RELEASE_S, age);
  float span = sig1 - sig0;
  // The cavity straightens into a bore as the sheet clears.
  rho *= 1.0 - sig0;

  vec2 B = vec2(-BP_BACK_S*hC, hC*(1.0 - BP_BACK_S*BP_BACK_TAN));
  vec2 A = bpJet(sig0, hC, sL);
  vec2 L = vec2(sL, 0.0);
  // Lip root: the underside of the sheet at its trailing edge. The taper is 1
  // there whenever a sheet exists (pre-impact, including age 0 where the
  // sheet is a point), and 0 once it has fully cleared.
  float taperRoot = span > 1e-5 ? 1.0 : (sig0 < 0.5 ? 1.0 : 0.0);
  vec2 R = A - bpThickness(sig0, xi, hC, c)*taperRoot*bpJetNormal(sig0, hC, sL);

  vec2 P;
  if (u < BP_U_APEX) {
    P = mix(B, A, u/BP_U_APEX);
  } else if (u < BP_U_TIP) {
    float f = (u - BP_U_APEX)/(BP_U_TIP - BP_U_APEX);
    P = bpJet(mix(sig0, sig1, f), hC, sL);
  } else if (u < BP_U_ROOT) {
    float f = (u - BP_U_TIP)/(BP_U_ROOT - BP_U_TIP);
    float sig = mix(sig1, sig0, f);
    // The sheet thins to a point at its leading edge (the tip is the oldest,
    // most-stretched water); this closes the section at the tip and keeps
    // the underside off the face as the tip arrives at the landing.
    // With no sheet yet (age <= 0) the leg walks apex -> root linearly, the
    // limit of the small-age case, so the family is continuous through the
    // lifecycle wrap; once cleared it sits at the landing.
    float taper = span > 1e-5 ? clamp((sig1 - sig)/span, 0.0, 1.0)
                              : (sig0 < 0.5 ? f : 0.0);
    P = bpJet(sig, hC, sL) - bpThickness(sig, xi, hC, c)*taper*bpJetNormal(sig, hC, sL);
  } else {
    float f = (u - BP_U_ROOT)/(1.0 - BP_U_ROOT);
    // Concave face, root to landing, as a quadratic Bezier whose control
    // point sits on still water: the face always arrives at the landing
    // horizontally (into the trough), so the descending jet cannot cross it.
    // Roundness slides the control point from mid-trough (almond: a gently
    // concave face) to directly below the root (round: vertical under the
    // lip, then sweeping forward), the Mead & Black shape dial.
    vec2 C = vec2(mix(R.x, L.x, 0.5*(1.0 - rho)), 0.0);
    float g = 1.0 - f;
    P = g*g*R + 2.0*g*f*C + f*f*L;
  }
  // House rule: no NaN leaves a shader. Inputs are clamped so none should
  // arise; the guard makes the contract hold regardless.
  if (!(P.x == P.x && P.y == P.y)) P = (u < 0.5) ? B : L;
  return P;
}

// 0..1 how much of this profile should be drawn instead of the heightfield:
// 0 for spilling (xi < ~0.4, Battjes), rising through plunging; 0 before age 0
// and after the bore handoff. Both ends zero so the modulo crossing is continuous.
float breakerProfileWeight(float age, float xi){
  age = clamp(age, -1.0, 20.0);
  // Same envelope as breakerCurlCycle: quadratic rise into impact (constant
  // angular acceleration of the pitching lip), release over 1.5 sigmas, so
  // the ribbon and the grid's bend share one lifecycle.
  float rise = clamp(age/BP_IMPACT_S, 0.0, 1.0);
  float release = 1.0 - smoothstep(BP_IMPACT_S, BP_RELEASE_S, age);
  float w = rise*rise*release*bpPlunge(clamp(xi, 0.0, 5.0));
  if (!(w == w)) w = 0.0;
  return clamp(w, 0.0, 1.0);
}
`;
