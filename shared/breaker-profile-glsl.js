// The breaking-crest cross-section family (Track A, 2026-09-24; v2 the same
// evening, Track G: a thinning roof after impact and the ground-frame launch).
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
//   0.00 .. 0.10    back face up to the crest apex A
//   0.10 .. 0.45    the jet's upper surface, apex to tip, along the ballistic
//                   (post-impact: the roof, sagging onto its own underside)
//   0.45 .. 0.80    the jet's underside, tip back to the lip root R
//   0.80 .. 1.00    the concave face, root down to the landing seam L
//                   (post-impact: rising to the roof's underside behind a
//                   front that runs from the landing back to the root)
//   u = 1.00        landing seam L = (sL, 0) on the trough ahead
//
// The region enclosed between the underside leg and the face leg is the tube.
// Before impact the tip is in the air and the underside/face legs meet only at
// the root, so the curve does not self-intersect; at impact the tip reaches L
// and the tube closes into a lens. After impact the lens COLLAPSES rather than
// clearing: the roof stays rooted at the crest and thins to nothing, and the
// cavity shortens from the landing side. Fixed u fractions keep the ribbon's
// topology stable across age, so Track B can bind vertex rows to legs once.
//
// Seam contract (what Track B blends to the real surfacePos):
//   B = (-0.5 hC, hC (1 - 0.5 tan 30 deg)) = (-0.5 hC, 0.711 hC). The back
//       face is assumed to fall at Stokes' limiting crest angle: a 120-degree
//       crest has each flank 30 degrees below horizontal. This is the assumed
//       height-field value at the seam, not a measurement of the grid.
//   L = (sL, 0): the landing, at still-water level on the face/trough ahead.
//       sL = BP_LAUNCH_REL * plunge(xi) * c * sqrt(2 hC / g)  (ballistic reach
//       with a ground-frame launch speed, below).
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
// The jet's horizontal launch speed RELATIVE TO THE CREST SOURCE POINT, as a
// fraction of the phase speed c, at full plunge. s is measured from a point
// that itself moves at c, so a launch at BP_LAUNCH_REL*c here is
// (1 + BP_LAUNCH_REL)*c = 1.5 c in the ground frame. Basis, in order:
// (1) Longuet-Higgins (1981) gives the jet's ground-frame horizontal velocity
//     as of order the crest speed, the excess over c being what carries the
//     lip clear of the crest; a crest-relative launch at c (the v1 reading)
//     is 2 c in the ground frame, faster than any measured tip. Bonmarin
//     (1989) reports jet geometry as ratios of wave height (in refs.bib; not
//     re-read, no number is taken from it).
// (2) The field (CURL_TRUTH 2026-09-24 sec 1.3): the steady head's lip
//     projects <= 0.1-0.3 face heights ahead of the face and the one section
//     collapse throws a curtain of 0.5-0.6 face heights that lands on the
//     face within a fraction of a second. No lip lands clear of the face.
// (3) The model's own receiver: at depth-limited pairs (c = sqrt(g h),
//     hC = 0.8*GAMMA*h) this launch lands the lip at 0.895 hC, on top of
//     CURT_REACH = 0.9 in model-glsl.js, which was authored from the same
//     classical picture ("about a face height ahead"). The v1 crest-frame
//     reading landed at 1.79 hC and needed the 1.6 classic extension to be
//     received at all.
// The value inside the (1)-(2) bracket is fixed by (3), so the profile and
// the shared landing agree without a second constant.
const float BP_LAUNCH_REL = 0.5;
// Width, in the face leg's parameter, of the front along which the cavity
// closes after impact (a soft front: Peregrine's splash-up is a broad region
// at the landing, not a point). Authored; only the softness is at stake.
const float BP_CLOSE_W = 0.5;
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
// renderer's shared choice, inherited, not re-derived here. At the spilling
// end this family produces NOTHING on purpose: the field's spilling head is
// Duncan's (1999) bulge and Longuet-Higgins & Turner's aerated wedge, a
// material event on the grid's crest band, not a thrown sheet over a cavity
// (BREAKER_PROFILE_V2_2026-09-24.md, decision 3).
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
// The jet's horizontal launch speed relative to the crest source point.
float bpLaunchSpeed(float xi, float c){ return BP_LAUNCH_REL*bpPlunge(xi)*c; }
// Ballistic reach in the crest-source frame. The lip leaves the crest
// horizontally (Longuet-Higgins / Peregrine plunging-jet picture) at
// bpLaunchSpeed relative to the crest, and lands where it meets still water:
// sL = v * sqrt(2 hC / g). At full plunge and depth-limited c = sqrt(g h),
// hC = 0.8*0.78 h, this is a constant 0.895 hC (CURT_REACH is 0.9); at the
// sheet's (hC 3, c 6) it is 0.78 hC. Second Peak (xi 0.65) lands at 0.12 hC,
// The Hook (0.8) at 0.32, Sewers (1.15) at 0.75: the field's <= 0.3 face
// height lip projection at the steady head and its half-face curtain at a
// section collapse bracket this range.
float bpReach(float xi, float hC, float c){
  return bpLaunchSpeed(xi, c)*bpFallTime(hC);
}
// How far the post-impact collapse has run: 0 until impact, 1 by release.
float bpCollapse(float age){ return smoothstep(BP_IMPACT_S, BP_RELEASE_S, age); }
// How closed the cavity is under the face leg at u (0 outside the face leg):
// 1 where the face has risen onto the roof's underside, 0 where the lens is
// still open. The front runs from the landing (u = 1) back to the root
// (u = BP_U_ROOT) over the release window. Exposed for the ribbon: where this
// is 1 the face leg and the underside coincide, so the face leg should not be
// drawn as a second lit surface there.
float bpFaceClosure(float u, float age){
  if (u < BP_U_ROOT) return 0.0;
  float f = (clamp(u, 0.0, 1.0) - BP_U_ROOT)/(1.0 - BP_U_ROOT);
  float front = (1.0 + BP_CLOSE_W)*(1.0 - bpCollapse(clamp(age, -1.0, 20.0)));
  return smoothstep(front - BP_CLOSE_W, front, f);
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
// Sheet thickness at sigma. Every particle keeps the launch speed v (relative
// to the crest, the frame in which the sheet is fed steadily) and gains g t
// downward, so the sheet's arc speed is sqrt(v^2 + (g t)^2) and a
// mass-conserving sheet thins by v / sqrt(v^2 + (g t)^2) (kinematic stretching
// of a free-falling sheet). Root thickness BP_ROOT_THICK*hC, times the
// plunging blend so a spilling crest has no sheet at all.
float bpThickness(float sigma, float xi, float hC, float c){
  float plunge = bpPlunge(xi);
  float v = max(bpLaunchSpeed(xi, c), 1e-3);
  float gt = BP_G*sigma*bpFallTime(hC);
  float stretch = inversesqrt(1.0 + (gt*gt)/(v*v));
  return BP_ROOT_THICK*hC*plunge*stretch;
}
// The sheet's underside at sigma with taper t (1 at the root, 0 at the tip).
vec2 bpUnderside(float sigma, float taper, float xi, float hC, float c, float sL){
  return bpJet(sigma, hC, sL) - bpThickness(sigma, xi, hC, c)*taper*bpJetNormal(sigma, hC, sL);
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
// (breakerCeilM / VIS). c: local phase speed m/s (sets the jet's launch speed).
vec2 breakerProfile(float u, float age, float xi, float hC, float c){
  u   = clamp(u, 0.0, 1.0);
  age = clamp(age, -1.0, 20.0);
  xi  = clamp(xi, 0.0, 5.0);
  hC  = clamp(hC, 0.05, 50.0);
  c   = clamp(c, 0.0, 50.0);
  float sL  = bpReach(xi, hC, c);
  float rho = bpRoundness(xi)*bpPlunge(xi);   // spilling: no cavity at all
  // Leading edge of the sheet along the parabola: linear in age up to impact,
  // because horizontal reach is linear in time for a horizontal launch. The
  // trailing edge stays at the crest for the whole life (v1 cleared it to the
  // landing after impact, which read as a flap sliding down the face).
  float sig1 = clamp(age/BP_IMPACT_S, 0.0, 1.0);
  // Post-impact collapse. What a landed lip does (Peregrine 1983's
  // overturn -> impact -> splash-up -> bore; Kimmoun & Branger 2007's time
  // series): the sheet stays rooted at the crest, thins and aerates, and the
  // trapped cavity closes from the landing side as the splash-up fills it.
  // The field agrees on the one thing this fixes: the crest line is conserved
  // through the collapse to within ~0.1 face heights (CURL_TRUTH sec 1.3), so
  // the roof's root does not leave the crest.
  float col = bpCollapse(age);

  vec2 B  = vec2(-BP_BACK_S*hC, hC*(1.0 - BP_BACK_S*BP_BACK_TAN));
  vec2 A0 = bpJet(0.0, hC, sL);                            // crest apex (0, hC)
  vec2 L  = vec2(sL, 0.0);
  // Lip root: the underside of the sheet at the crest, fixed for all ages.
  vec2 R  = bpUnderside(0.0, 1.0, xi, hC, c, sL);
  // The roof thins from the top down onto its fixed underside: the apex sags
  // by the root thickness (<= 0.12 hC * plunge) over the release window and
  // the underside, the cavity's roof, never rises, so the cavity is
  // non-increasing in age everywhere.
  vec2 A  = mix(A0, R, col);

  vec2 P;
  if (u < BP_U_APEX) {
    P = mix(B, A, u/BP_U_APEX);
  } else if (u < BP_U_TIP) {
    float f = (u - BP_U_APEX)/(BP_U_TIP - BP_U_APEX);
    float sig = sig1*f;
    // Jet top: the parabola from the apex to the tip. After impact it sags by
    // col of the local thickness toward the underside (taper 1 - f, as the
    // underside's), so at full collapse the two coincide and the sheet is
    // gone. With no sheet yet (age <= 0) the leg is the apex point.
    P = bpJet(sig, hC, sL) - bpThickness(sig, xi, hC, c)*(1.0 - f)*col*bpJetNormal(sig, hC, sL);
  } else if (u < BP_U_ROOT) {
    float f = (u - BP_U_TIP)/(BP_U_ROOT - BP_U_TIP);
    float sig = sig1*(1.0 - f);
    // Underside, tip back to root. The sheet thins to a point at its leading
    // edge (the tip is the oldest, most-stretched water): taper f is 0 at the
    // tip and 1 at the root, which closes the section at the tip and keeps
    // the underside off the face as the tip arrives at the landing. With no
    // sheet yet (age <= 0, sig = 0) the leg walks apex -> root linearly, the
    // limit of the small-age case, so the family is continuous through the
    // lifecycle wrap. Fixed for all ages after impact: this is the roof.
    P = bpUnderside(sig, f, xi, hC, c, sL);
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
    vec2 F = g*g*R + 2.0*g*f*C + f*f*L;
    // After impact the cavity closes from the landing side: behind a front
    // that runs from f = 1 (the landing) back to f = 0 (the root) over the
    // release window (bpFaceClosure), the face rises to the roof's underside
    // at the same sigma = f (R at f = 0, L at f = 1, the same endpoints), so
    // the lens shortens toward the root and is gone by release. Ahead of the
    // front the cavity keeps its section shape; it shortens, it does not
    // flatten.
    float k = bpFaceClosure(u, age);
    vec2 U = bpUnderside(f, 1.0 - f, xi, hC, c, sL);
    P = mix(F, U, k);
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
