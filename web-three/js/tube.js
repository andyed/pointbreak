// The swept breaker ribbon (#tube=1, 2026-09-24, default OFF; TUBE builds only).
//
// WHY A SECOND SURFACE. The water grid is a displaced height field: past the
// cusp a thrown lip is multivalued in z (the crest passes over the trough),
// which no single-valued h(x, z) plus a bounded horizontal offset can carry.
// The #curl bend folds the mesh and the curtain hangs a sheet off it, and the
// result measured as a faceted hook with a thin veil, never a tube with a mouth
// (CLASSIC_WAVE_PROGRESS, LIP_DESCENT_EXPERIMENT). WEB_THREE_SPEC M6 part 4
// names the standard fix — promote the crest band to explicit swept geometry
// and blend it back into the height field — and this is that geometry.
//
// WHAT IT IS. A strip mesh like the curtain: position.x is alongshore world
// metres, position.y + 0.5 is the profile parameter u in [0,1]. Per vertex the
// shader evaluates the shared breaker profile (shared/breaker-profile-glsl.js,
// PHYSICAL metres in the wave's vertical plane) at this station's lifecycle
// age, and places it in world about the DRAWN crest: horizontally along the
// local propagation direction (the rayPhase gradient, the classic block's
// waveDir), vertically by VIS — the same exaggeration the rest of the water is
// drawn at. Both ends are evaluations of the shipped surfacePos, so the ribbon
// is C0 on the drawn water at a back seam behind the crest and at the
// profile's own landing (bpReach*VIS along the sweep axis from the crest
// source; since 2026-09-24 the shared receiver breakerLandingFrameAt — the
// point the deposit, roller and spray are seeded from — is plunge-scaled under
// TUBE to sit there too). Where the profile weight is zero the vertex collapses
// onto the shipped surface, so nothing pokes out of a spilling wave or a lull.
//
// WHAT THE GRID GIVES UP. Under TUBE, choppyPos caps the cusp parameter at
// S = 0.98 and zeroes the bend at plunging stations (shaders.js, the
// `#ifdef TUBE` blocks), so the height field stays single-valued and this
// ribbon owns everything past the cusp. The curtain is hidden (main.js).
//
// CLOCK. age = breakerLandingFrameAt(x, t).z + CRASH_PEAK_S — the same
// mod(w t - rayPhase(x, breakLine(x)))/w clock choppyPos calls ageB and the
// descent curtain reads; chosen over recomputing ageB because the one call
// also returns the landing z and ceiling, so the ribbon and the impact
// consumers cannot disagree about where the foot is. The crest anchor is the
// LIVE crest source (CURTAIN_VERT's zc construction), not the impact pose:
// the seams are re-evaluated on the live surface every frame, so the ribbon
// stays attached to the water that is actually drawn.
//
// Not a fluid: an authored strip on the shared clock, seek-safe by
// construction (no history). Track D owns facet quality. The material is
// TUBE_FRAG below (Track H, #tubelook; docs/research/TUBE_LOOK_2026-09-24.md).

import { SURFACE_PRELUDE, SURFACE_GLSL } from './shaders.js';

// Alongshore columns of the strip. The curtain's 240 (2.4 m) was tried first
// and drew the ~4 m tube (V_p x 0.72 s at Sewers' ~6 m/s peel) as TWO
// triangles — a teal wedge. 2400 puts ~17 columns across it. Affordable because
// a vertex whose profile weight is zero (all but the ~1% under the ribbon)
// skips every surfacePos evaluation and parks below the water.
export const TUBE_SEG_X = 2400;
export const TUBE_SEG_U = 24;
export const TUBE_SPAN_M = 570;

export const TUBE_VERT = `
${SURFACE_PRELUDE}
${SURFACE_GLSL}
varying float vTubeA;     // alpha: profile weight x breakMask x farFade x (1-land)
varying vec2  vTubeUV;    // (alongshore metres, u) for the streak texture
varying vec3  vTubeN;     // normal oriented AWAY from the cavity
varying vec3  vTubeW;     // world position
varying vec3  vTubeK;     // (age s, jet fraction 0..1, displayed ceiling m)
varying vec4  vTubeM;     // material inputs (TUBE_FRAG, #tubelook): (sheet thinness 0 root .. ~0.45 tip,
                          //  grid white at the back seam, grid white at the crest anchor,
                          //  cavity closure 0 open .. 1 face risen onto the roof)

// The grid's own whiteness at a surfacePos evaluation, on the grid's own
// mapping: GRID_FRAG soft-knees the foam mask (1 - exp(-1.55 foam)) and ramps
// it 0.15 -> 0.75 for fresh foam; the aerated-lip key (aer, TUBE block in
// choppyPos) mixes in at its own value. The ribbon's back seam takes this so
// its white is continuous in value with the crest foam it grows out of.
float tubeGridWhite(float foam, float aer){
  float fm = smoothstep(0.15, 0.75, 1.0 - exp(-1.55*clamp(foam, 0.0, 1.0)));
  float w = max(fm, clamp(aer, 0.0, 1.0));
  if (!(w == w)) w = 0.0;
  return w;
}

// One station's frame, all from the shared model. zc is the LIVE crest source
// (theta = 0 sits thetaW/kz shoreward of the line — CURTAIN_VERT's construction).
void tubeFrame(float x0, out float age, out float zc, out float hCd, out float c,
               out vec2 dir, out float zL){
  vec4 landing = breakerLandingFrameAt(x0, u_time);   // (landing z, ceiling, age - CRASH_PEAK_S, zc at impact)
  age = landing.z + CRASH_PEAK_S;
  zL  = landing.x;
  float zb = breakLine(x0);
  float w  = 2.0*PI/u_T;
  float kk = kLocalAt(vec2(x0, zb));
  float thetaB = w*u_time - rayPhase(vec2(x0, zb));
  float thetaW = mod(thetaB + PI, 2.0*PI) - PI;
  float kz = max(kk*cos(swellPhi()), 0.25*kk);
  zc  = zb + thetaW/kz;
  hCd = crestCeilM(vec2(x0, zc));
  c   = w/max(kk, 1e-4);                              // phase speed, m/s
  // Sweep axis: the local propagation direction from the carrier phase. Guarded
  // to point shoreward — the profile's s is "shoreward metres".
  float e = 2.0;
  vec2 pg = vec2(rayPhase(vec2(x0 + e, zc)) - rayPhase(vec2(x0 - e, zc)),
                 rayPhase(vec2(x0, zc + e)) - rayPhase(vec2(x0, zc - e)))/(2.0*e);
  dir = pg/max(length(pg), 1e-4);
  if (!(dir.y > 0.3)) dir = vec2(0.0, 1.0);
}

void main(){
  float x0 = position.x;
  float u  = position.y + 0.5;
  float age, zc, hCd, c, zL; vec2 dir;
  tubeFrame(x0, age, zc, hCd, c, dir, zL);
  float hC = hCd/VIS;                                 // PHYSICAL crest height, m
  float tubeOn = clamp(u_tube, 0.0, 1.0);
  float weight = breakerProfileWeight(age, u_xi) * tubeOn;

  // A vertex the profile gives no weight draws nothing (alpha 0, discarded),
  // so it skips the three surfacePos evaluations below and parks under the
  // water. That is what pays for TUBE_SEG_X columns.
  bool live = weight > 0.001;
  float l1 = 0.0, l2 = 0.0;
  // The grid's foam and aerated-lip outputs at the crest anchor (1) and the
  // back seam (3) — read for the material (vTubeM), not for placement.
  float f1 = 0.0, a1 = 0.0, f3 = 0.0, a3 = 0.0;
  vec3 Pc = vec3(x0, -2.0, zc), PL = Pc, PB = Pc;
  // The profile's own landing L = (sL, 0): the ground-frame ballistic reach
  // (BREAKER_PROFILE_V2_2026-09-24 sec 2; 0.75 hC at Sewers, 0.12 at Second
  // Peak, 0.895 at any depth-limited full-plunge pair).
  float sL    = max(bpReach(u_xi, hC, c), 0.05);
  // Horizontal stretch sigma = VIS (sec 5.1). The world draws vertical metres
  // at VIS and horizontal metres at 1; the shared receiver already places its
  // landing CURT_REACH*hC with hC DISPLAYED, i.e. VIS times the physical reach
  // along the ground, and the ribbon takes the same anisotropy so the section
  // keeps the aspect the probe measured on it (a 0.69 by 0.63 hC lens at
  // Sewers, not a sliver). Until 2026-09-24 sigma was D/sL with D the drawn
  // distance to breakerLandingFrameAt's zL (0.9 hC, 1.6 under classic descent),
  // which stretched the v2 reach 1.2-2.1x at Sewers and ~7x at Second Peak.
  float sigma = VIS;
  // Drawn crest-to-landing-seam distance along the sweep axis: reported to
  // the probe (reachRatio); the tip is placed at sL*sigma regardless.
  float D     = sL*sigma;
  if (live) {
    // Anchor: the shipped surface at the live crest source. Under TUBE the grid
    // does not bend at plunging stations, so this is the capped crest.
    float p1, b1, c1, k1;
    Pc = surfacePos(vec2(x0, zc), u_time, f1, p1, b1, c1, l1, a1, k1);
    // Landing seam: the drawn water under the tip, sL*VIS along the sweep axis
    // from the DRAWN crest (dir.y >= 0.3 is guaranteed above). The receiver
    // seeds the deposit, roller and spray at the SOURCE point zc + CURT_REACH*
    // hC*plunge, the same distance in source space; but the grid's choppy
    // offset draws a source point ahead of the crest pulled back toward it
    // (MEASURED 2026-09-24, probe_tube: 2.4 m at Sewers for a 7 m reach), so
    // one evaluation there lands 0.6 hC behind the tip. One fixed-point step
    // inverts the drift: re-evaluate at the source moved by the miss, which
    // puts the seam within centimetres of the tip's plan position. The
    // vertical miss that remains (the carved face stands 0.35 hC above the
    // profile's y = 0) is the sec 6 seam contract, absorbed on the face leg's
    // flat run into the landing over u 0.85..1.
    vec2 tgt  = Pc.xz + dir*(sL*sigma);
    vec2 srcL = vec2(x0, zc) + dir*(sL*sigma);
    float f2, p2, b2, c2, a2, k2;
    PL = surfacePos(srcL, u_time, f2, p2, b2, c2, l2, a2, k2);
    // Two steps, each bounded by the reach itself: on the default landing the
    // residual fold under the ribbon (TUBE_MESH sec "cusp cap") makes the
    // source->drawn map non-monotone and the first miss reads 4-7 m; an
    // unbounded step there would chase the overhang. A miss the bound refuses
    // is left to the seam blend.
    float bound = sL*sL*sigma*sigma;
    vec2 miss = tgt - PL.xz;
    if (dot(miss, miss) > 0.01 && dot(miss, miss) < bound) {
      srcL += miss;
      PL = surfacePos(srcL, u_time, f2, p2, b2, c2, l2, a2, k2);
      miss = tgt - PL.xz;
      if (dot(miss, miss) > 0.01 && dot(miss, miss) < bound) {
        PL = surfacePos(srcL + miss, u_time, f2, p2, b2, c2, l2, a2, k2);
      }
    }
    D  = dot(PL.xz - Pc.xz, dir);
    // Back seam: the profile's u = 0 end at s = -0.5 hC (fixed for all ages).
    vec2 pBack = breakerProfile(0.0, 0.0, u_xi, hC, c);
    vec2 srcB  = vec2(x0, zc) + dir*(pBack.x*sigma);
    float p3, b3, c3, l3, k3;
    PB = surfacePos(srcB, u_time, f3, p3, b3, c3, l3, a3, k3);
  }

  // Profile -> world about the drawn crest.
  vec2 pr = breakerProfile(u, age, u_xi, hC, c);
  vec3 W  = vec3(Pc.x + dir.x*pr.x*sigma, Pc.y + (pr.y - hC)*VIS, Pc.z + dir.y*pr.x*sigma);

  // Seams. The back seam holds for the WHOLE life (sec 5.2): v2's roof stays
  // rooted at the crest and thins in place, so there is no cleared trailing
  // edge to release — v1 let go after impact (1 - smoothstep(0, 0.25, clearP))
  // because its upper edge slid down the parabola, and with the v2 family
  // that release only let the u = 0 row drift off surfacePos after 0.42 s.
  // The landing seam attaches as the jet ARRIVES: a jet in flight has a free
  // tip — that open edge is the mouth of the tube — and is C0 on the landing
  // from impact on.
  float tip    = clamp(age/CRASH_PEAK_S, 0.0, 1.0);
  float clearP = bpCollapse(age);   // post-impact collapse 0..1 (read back by the probe; not a seam key)
  float wB = 1.0 - smoothstep(0.0, 0.15, u);
  float wL = smoothstep(0.85, 1.0, u) * smoothstep(0.75, 1.0, tip);
  vec3 P = mix(W, PB, wB);
  P = mix(P, PL, wL);

  // Normal by finite differences on the un-seamed profile. Along u the profile
  // is analytic; along x the age changes with the station (the sweep), guarded
  // across the lifecycle wrap at the head where the neighbour reads age ~T.
  float du = 1.0/${TUBE_SEG_U.toFixed(1)};
  vec2 prU2 = breakerProfile(min(u + du, 1.0), age, u_xi, hC, c);
  vec2 prU1 = breakerProfile(max(u - du, 0.0), age, u_xi, hC, c);
  vec3 dU = vec3(dir.x*(prU2.x - prU1.x)*sigma, (prU2.y - prU1.y)*VIS, dir.y*(prU2.x - prU1.x)*sigma);
  float dx = ${(TUBE_SPAN_M / TUBE_SEG_X).toFixed(4)};   // one column, metres
  float age2 = breakerLandingFrameAt(x0 + dx, u_time).z + CRASH_PEAK_S;
  if (abs(age2 - age) > 0.5) age2 = age;
  vec2 prX = breakerProfile(u, age2, u_xi, hC, c);
  vec3 dX = vec3(dx + dir.x*(prX.x - pr.x)*sigma, (prX.y - pr.y)*VIS, dir.y*(prX.x - pr.x)*sigma);
  vec3 N = cross(dU, dX);
  if (!(dot(N, N) > 1e-10)) N = vec3(0.0, 1.0, 0.0);
  N = normalize(N);
  // Orient away from the cavity: its centre is half way to the landing and
  // half a ceiling below the crest.
  vec3 cav = Pc + vec3(dir.x, 0.0, dir.y)*(0.5*sL*sigma) - vec3(0.0, 0.5*hCd, 0.0);
  if (dot(N, W - cav) < 0.0) N = -N;

  float gate = weight * breakMask(x0) * farFadeAt(vec2(x0, zc)) * (1.0 - l1) * (1.0 - l2);
  // Zero weight: parked under the water with alpha 0, so nothing pokes out.
  if (!live) { P = Pc; gate = 0.0; }
  if (!(P.x == P.x && P.y == P.y && P.z == P.z)) { P = Pc; gate = 0.0; }   // NaN guard (house rule)
  if (!(N.x == N.x && N.y == N.y && N.z == N.z)) N = vec3(0.0, 1.0, 0.0);

  // Sheet thinness for the material: bpThickness is the mass-conserving
  // kinematic stretch of the free-falling sheet, root thickness at sigma 0
  // thinning toward the tip (Sewers: ~0.58 of root at the tip, so thin ~0.42).
  // The tip is the oldest, most-stretched water and is what aerates first.
  // sigma is read as the horizontal fraction of reach, which on the two jet
  // legs IS the profile's sigma; the back and face legs get 0 and ~1, and the
  // fragment gates their white by leg, not by thinness.
  float sigM   = clamp(pr.x/sL, 0.0, 1.0);
  float thick0 = BP_ROOT_THICK*hC*bpPlunge(u_xi);
  float thin   = 1.0 - bpThickness(sigM, u_xi, hC, c)/max(thick0, 1e-4);
  if (!(thin == thin)) thin = 0.0;   // NaN guard (house rule)
  // Cavity closure for the material (sec 5.3): on the face leg, bpFaceClosure
  // is 1 where the face has risen onto the roof's underside (that water is
  // the bore) and 0 where the lens is still open (that water is the cavity's
  // dark wall). The sheet legs take the closure of the face point at the SAME
  // sigma — the face rises to the underside at sigma = f — so the roof's
  // underside and the risen face, coincident there, are shaded alike.
  float closure = (u >= BP_U_ROOT) ? bpFaceClosure(u, age)
                : (u > BP_U_APEX)  ? bpFaceClosure(BP_U_ROOT + (1.0 - BP_U_ROOT)*sigM, age)
                : 0.0;
  if (!(closure == closure)) closure = 0.0;   // NaN guard (house rule)

  vTubeA  = clamp(gate, 0.0, 1.0);
  vTubeUV = vec2(x0, u);
  vTubeN  = N;
  vTubeW  = P;
  vTubeK  = vec3(age, sigM, hCd);
  vTubeM  = vec4(clamp(thin, 0.0, 1.0), tubeGridWhite(f3, a3), tubeGridWhite(f1, a1), clamp(closure, 0.0, 1.0));
  gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
}
`;

// The ribbon's material (Track H, 2026-09-24). Two looks behind u_tubeLook:
//
//   #tubelook=0  the 2026-09-24 glass ribbon (text kept verbatim below): sky
//                fresnel over a lit green-blue body, sun spec, green-black
//                interior, backlit thin lip, aerated streaks building to impact.
//                The jury's "dry barrel / glass box" — right shape, wrong material.
//   default      aerated. The footage (CURL_TRUTH §1.2) never shows a glassy
//                sheet: what it shows is a thin, scalloped, luminous white line
//                along the crest at the head (hooks 0.3–0.7 s that merge), a
//                streaked bright fall, a dark face under it, and foam where the
//                fall meets the face. The Field seat measured this build's
//                WHITE lip at 0.05–0.10 face heights and ranked it the closest
//                thing in the matrix to that line; the glassy 1.0–1.5 H_f
//                ribbon is what it never shows. So the white is the material
//                and the green is where it has not aerated yet.
//
// Where the white comes from, in order:
//   1. lip line — a Gaussian band about the tip (u = BP_U_TIP) whose width and
//      presence are modulated by value noise along the ribbon's alongshore
//      coordinate on the SECONDS clock (features ~1.4 m, ~0.55 s: the hooks);
//   2. thinness — bpThickness' kinematic stretch (vTubeM.x): the tip is the
//      oldest, thinnest water and aerates first; rises with age toward impact;
//   3. streaks — CURTAIN_FRAG's recipe, run along the fall (sigma), entrained
//      darker toward the landing; the landing jet is white after impact;
//   4. landing seam — foam where the jet meets the face (u -> 1, post-impact);
//   5. back seam — continuous in value with the grid's own crest foam, read
//      through surfacePos at the seam (vTubeM.y) and the crest anchor (.z), so
//      the ribbon and the head are one bright mass, not two objects.
// Palette and lighting follow GRID_FRAG's foam: near-white, ambient-heavy
// (0.86 + 0.14 Lambert), capped at a 0.95 mix so the ribbon is never whiter
// than the crest foam it grows from. The body where thick is translucent
// green (alpha 0.80, backlit toward the sun); the cavity face and anything
// seen from inside is dark green-black. No opaque glass panel. No fog: the
// ribbon lives within a few hundred metres of every camera that can see it.
export const TUBE_FRAG = `
varying float vTubeA;
varying vec2  vTubeUV;
varying vec3  vTubeN;
varying vec3  vTubeW;
varying vec3  vTubeK;
varying vec4  vTubeM;
uniform float u_time;
uniform vec3  u_camStage;   // the eye in STAGE coordinates (main.js frame loop)
uniform float u_tubeLook;   // 1 aerated (default in a TUBE build), 0 the glass ribbon (#tubelook=0)

// SKY_GLSL's sunDir, copied rather than spliced: this pass needs one vector,
// not the dome. Keep in step with shaders.js if the sun ever moves.
const vec3 TUBE_SUN = normalize(vec3(-0.45, 0.42, -0.28));
// Leg boundaries in u, mirroring BP_U_APEX / BP_U_TIP / BP_U_ROOT: the profile
// GLSL is spliced into the vertex prelude, not into this fragment.
const float TL_U_APEX = 0.10;
const float TL_U_TIP  = 0.45;
const float TL_U_ROOT = 0.80;

float thash21(vec2 p){ vec3 q = fract(vec3(p.xyx)*0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y)*q.z); }
float tnoise2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 w = f*f*(3.0 - 2.0*f);
  return mix(mix(thash21(i), thash21(i + vec2(1.0, 0.0)), w.x),
             mix(thash21(i + vec2(0.0, 1.0)), thash21(i + vec2(1.0, 1.0)), w.x), w.y);
}

void main(){
  if (vTubeA < 0.02) discard;
  vec3 V = normalize(u_camStage - vTubeW);
  vec3 N = normalize(vTubeN);
  float facing = dot(N, V);                       // > 0 seen from outside, < 0 from inside
  vec3  Nf = facing < 0.0 ? -N : N;
  float inside = smoothstep(0.05, -0.15, facing);
  float fres = pow(1.0 - clamp(dot(Nf, V), 0.0, 1.0), 4.0);
  vec3  col;
  float alpha;

  // #tubelook=2: instrument. Paints (u, age/0.72, inside) so a frame says which
  // leg and which lifecycle phase a pixel belongs to, instead of the shading
  // having to be read backwards for it.
  if (u_tubeLook > 1.5) {
    gl_FragColor = vec4(vTubeUV.y, clamp(vTubeK.x/0.72, 0.0, 1.0), inside, 1.0);
    return;
  }

  if (u_tubeLook < 0.5) {
    // ---- the 2026-09-24 glass ribbon, verbatim (#tubelook=0) ----
    // Exterior: glassy water — sky fresnel over a lit green-blue body, sun spec.
    vec3  water = vec3(0.05, 0.30, 0.30);
    vec3  sky   = vec3(0.60, 0.72, 0.82);
    float lam   = 0.45 + 0.55*clamp(dot(Nf, TUBE_SUN), 0.0, 1.0);
    vec3  ext   = mix(water*lam, sky, 0.08 + 0.45*fres);
    float spec  = pow(max(dot(reflect(-TUBE_SUN, Nf), V), 0.0), 120.0);
    ext += vec3(1.0, 0.97, 0.90)*spec*0.6;

    // Interior: green-black, opening toward a fresnel-lit rim at the mouth.
    vec3 inn = vec3(0.015, 0.075, 0.070);
    inn = mix(inn, vec3(0.10, 0.40, 0.36), 0.5*fres);
    col = mix(ext, inn, inside);

    // Thin lip toward the sun: the jet thins toward its foot, and looking at the
    // sun through it the sheet transmits green.
    float jet  = vTubeK.y;
    float thin = smoothstep(0.30, 0.80, jet);
    float backlit = pow(max(dot(V, -TUBE_SUN), 0.0), 3.0) * thin;
    col += vec3(0.20, 0.70, 0.45)*backlit*0.8;
    col += vec3(0.50, 0.80, 0.70)*fres*0.25*(1.0 - inside);   // lip edge

    // Aerated streaks down the jet on the simulation clock (rate independence);
    // aeration builds toward impact and the landing jet is white after it.
    float streak = tnoise2(vec2(vTubeUV.x*0.9, vTubeUV.y*3.0 - u_time*1.4));
    float ageK   = smoothstep(0.15, 0.45, vTubeK.x);
    float aerW   = smoothstep(0.55, 0.85, streak) * jet * (0.25 + 0.75*ageK);
    // 0.42 is CRASH_PEAK_S; MODEL_GLSL is not spliced into this fragment.
    aerW = max(aerW, 0.55*smoothstep(0.42, 0.62, vTubeK.x)*smoothstep(0.4, 1.0, jet));
    vec3 foamCol = mix(vec3(0.78, 0.82, 0.81), vec3(0.97), 0.4 + 0.6*streak);
    col = mix(col, foamCol, clamp(aerW, 0.0, 0.95));

    alpha = vTubeA * (0.88 + 0.12*streak);
  } else {
    // ---- aerated (default) ----
    float u    = vTubeUV.y;
    float x    = vTubeUV.x;          // alongshore metres: the crest coordinate
    float age  = vTubeK.x;           // s since this station's crest crossed the line
    float sig  = vTubeK.y;           // fraction of the ballistic reach: 0 root, 1 tip/landing
    float thin = vTubeM.x;           // kinematic sheet thinness, 0 root .. ~0.45 tip
    float closure = vTubeM.w;        // bpFaceClosure: 1 where the face has risen onto the roof (bore), 0 where the lens is open
    float lam  = 0.45 + 0.55*clamp(dot(Nf, TUBE_SUN), 0.0, 1.0);

    // Legs. Soft 0.03 shoulders so the boundaries do not draw lines.
    float onBack = 1.0 - smoothstep(TL_U_APEX - 0.03, TL_U_APEX + 0.03, u);   // back face to the apex
    float onFace = smoothstep(TL_U_ROOT - 0.03, TL_U_ROOT + 0.03, u);         // root down to the landing
    float onJet  = (1.0 - onBack)*(1.0 - onFace);                               // the sheet, both sides

    // Body: translucent green water where thick. Lit like the grid's face
    // (Lambert over a dark base), a faint sky fresnel — a third of the glass
    // ribbon's — and transmission toward the sun that grows with thinness:
    // the thin lip is what backlights, not the root.
    vec3  body = vec3(0.10, 0.40, 0.38)*(0.55 + 0.45*lam);
    float backlit = pow(max(dot(V, -TUBE_SUN), 0.0), 3.0);
    body += vec3(0.16, 0.60, 0.40)*backlit*(0.25 + 0.75*clamp(thin*2.2, 0.0, 1.0))*onJet;
    body  = mix(body, vec3(0.60, 0.72, 0.82), 0.06 + 0.22*fres);

    // Cavity: green-black on the concave face leg from any side — the face
    // under the lip is dark water (CURL_TRUTH §4 criteria 1 and 10) — and on
    // the sheet's underside seen from inside (0.6: the hollow the Squint seat
    // ranked tube+classic first for). The white below is laid over it at half
    // weight on the inside, so the hollow stays dark between streaks.
    vec3  cav  = vec3(0.012, 0.062, 0.058);
    cav = mix(cav, vec3(0.06, 0.26, 0.24), 0.35*fres);
    // Behind the closure front there is no hollow to be inside of: the
    // underside is the top of the bore there, so the seen-from-inside darkening
    // fades with closure. The face leg keeps its dark base; the bore white
    // below is laid over it where the face has risen.
    float cavW = max(0.60*inside*(1.0 - closure), onFace);
    col = mix(body, cav, cavW);

    // ---- the white ----
    float ageK = smoothstep(0.10, 0.45, age);                  // toward impact (0.42 s)
    // Hooks: value noise along the crest on the seconds clock. Cells ~1.4 m
    // along x and ~0.55 s in time, so a hook lives 0.3–0.7 s and merges into
    // its neighbours (CURL_TRUTH §1.3: 15–20 frames patch-to-merge), never on
    // a metronome. A finer second octave scallops the edge.
    float hookN = tnoise2(vec2(x*0.7, u_time*1.8));
    float hook  = smoothstep(0.40, 0.80, hookN);
    float scal  = tnoise2(vec2(x*2.3 + 7.0, u_time*1.1));
    // 1. Lip line about the tip. Core sigma 0.03 in u (~0.1 h_C of sheet, the
    //    Field seat's 0.05–0.10 H_f), opening to 0.10 inside a hook. Present
    //    from the first instants: a pitching PP lip is white, not glass.
    float dTip    = abs(u - TL_U_TIP);
    float sigL    = 0.045 + 0.085*hook;
    float lipLine = exp(-dTip*dTip/(2.0*sigL*sigL)) * (0.65 + 0.35*scal) * smoothstep(0.02, 0.12, age);
    // 2. Thinness: the stretched sheet aerates. Zero at the root, ~1 at the tip.
    float aerThin = smoothstep(0.04, 0.30, thin) * (0.50 + 0.50*ageK) * onJet;
    // 3. Streaks down the fall (CURTAIN_FRAG's recipe on sigma so both sides of
    //    the sheet streak the same way), denser toward the tip and with age;
    //    below crest level the sheet is a curtain and mostly white (the
    //    footage's descending sheet); the landing jet is white after impact.
    float streak    = tnoise2(vec2(x*0.9, sig*4.0 - u_time*1.4));
    float aerStreak = smoothstep(0.30, 0.70, streak) * (0.35 + 0.65*sig) * (0.55 + 0.45*ageK) * onJet;
    // The fallen fraction: the jet is y = h_C (1 - sigma^2), so sigma^2 of the
    // crest height has been dropped. The footage's curtain is white by ~0.4-0.6
    // H_f of fall (CURL_TRUTH §1.3, event B); the sheet near the root, having
    // fallen nothing, is still green water.
    float fell      = sig*sig;
    float aerFall   = smoothstep(0.12, 0.55, fell) * (0.70 + 0.30*streak) * (0.70 + 0.30*ageK) * onJet;
    // 0.42 is CRASH_PEAK_S; MODEL_GLSL is not spliced into this fragment.
    float aerLand   = 0.80*smoothstep(0.42, 0.62, age)*smoothstep(0.35, 1.0, sig)*onJet;
    // 4. Landing seam: foam where the jet meets the face, from impact on. And
    //    the bore: the water between the root and the landing that has risen
    //    onto the roof's underside is the collapsing bore (CURL_TRUTH §4
    //    criterion 4, 0.4–0.65 H_f of saturated white, lumpy). Keyed on the
    //    profile's own closure front (bpFaceClosure, BREAKER_PROFILE_V2 §5.3),
    //    not the clock: white behind the front, the cavity's dark wall ahead of
    //    it, at every station. Until 2026-09-24 this was smoothstep(0.40, 0.60,
    //    age) over the whole face leg, which whitened the open lens too.
    //    The sheet legs carry the closure of the face point at their sigma, so
    //    the roof's underside — coincident with the risen face — whitens with it.
    float seamL = smoothstep(0.86, 1.0, u) * smoothstep(0.36, 0.50, age) * (0.60 + 0.40*streak);
    float lump  = tnoise2(vec2(x*1.6 + 3.0, u*6.0 - u_time*0.9));
    float boreW = (1.0 - onBack) * closure * (0.70 + 0.30*lump);
    // 5. Back seam: the grid's own white at the seam (vTubeM.y) grading to the
    //    apex over the back leg; the apex is at least the grid's crest white
    //    and, with age, a hooked knuckle of its own.
    float apexW = max(vTubeM.z, 0.55*ageK*(0.60 + 0.40*hook));
    float backW = mix(vTubeM.y, apexW, smoothstep(0.0, TL_U_APEX, u)) * onBack;

    float W = max(max(aerThin, max(max(aerStreak, aerFall), aerLand)), max(max(seamL, boreW), backW));
    W *= mix(1.0, 0.5, inside*(1.0 - closure));   // the hollow stays dark between streaks while it is a hollow
    W  = max(W, lipLine);             // the lip line is white from both sides
    W  = clamp(W, 0.0, 0.95);         // never whiter than the grid's crest foam

    // Foam: CURTAIN_FRAG's two-tone by streak, GRID_FRAG's ambient-heavy
    // lighting, entrained darker toward the landing along the fall.
    vec3 foamCol = mix(vec3(0.80, 0.84, 0.83), vec3(0.985), 0.35 + 0.65*streak) * (0.86 + 0.14*lam);
    foamCol *= 1.0 - 0.14*sig*onJet;
    col = mix(col, foamCol, W);
    // Sun spec only on the un-aerated body: bubbles scatter, they do not reflect.
    float spec = pow(max(dot(reflect(-TUBE_SUN, Nf), V), 0.0), 120.0);
    col += vec3(1.0, 0.97, 0.90)*spec*0.25*(1.0 - W)*(1.0 - cavW);

    // Translucent where it is still green water (the face shows through the
    // root of the sheet), solid where it is foam or cavity.
    alpha = vTubeA * mix(0.70, 0.97, max(W, cavW));
  }
  if (!(col.x == col.x && col.y == col.y && col.z == col.z)) col = vec3(0.5);   // NaN guard (house rule)
  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;
