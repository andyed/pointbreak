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
// is C0 on the drawn water at a back seam behind the crest and at the shared
// landing (breakerLandingFrameAt — the point the deposit, roller and spray are
// seeded from). Where the profile weight is zero the vertex collapses onto the
// shipped surface, so nothing pokes out of a spilling wave or a lull.
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
// construction (no history). Track D owns facet quality; shading here is
// deliberately modest.

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
  vec3 Pc = vec3(x0, -2.0, zc), PL = Pc, PB = Pc;
  vec2  pEnd  = breakerProfile(1.0, CRASH_PEAK_S, u_xi, hC, c);
  float sL    = max(pEnd.x, 0.05);
  float D     = 0.35*hCd;
  if (live) {
    // Anchor: the shipped surface at the live crest source. Under TUBE the grid
    // does not bend at plunging stations, so this is the capped crest.
    float f1, p1, b1, c1, a1, k1;
    Pc = surfacePos(vec2(x0, zc), u_time, f1, p1, b1, c1, l1, a1, k1);
    // Landing seam: the shared frame's landing z, reached along the sweep axis
    // (dir.y >= 0.3 is guaranteed above). Its x drifts from x0 by the swell
    // obliquity, ~1 m at Sewers — the deposit/roller seeded at (x0, zL) are
    // several metres wide, so the two stay under one another.
    vec2 srcL = vec2(x0, zc) + dir*((zL - zc)/max(dir.y, 0.3));
    float f2, p2, b2, c2, a2, k2;
    PL = surfacePos(srcL, u_time, f2, p2, b2, c2, l2, a2, k2);
    // Horizontal stretch sigma: the profile's own landing distance sL (physical,
    // evaluated at impact so neither tip nor clearing clips it) is mapped onto
    // the distance between the DRAWN crest and the DRAWN landing. The vertical
    // is VIS-exaggerated like the rest of the water; sigma is what keeps the
    // foot on the landing every other impact consumer uses.
    D = max(dot(PL.xz - Pc.xz, dir), 0.35*hCd);   // landing stays ahead of the crest
  }
  float sigma = D/sL;
  if (live) {
    // Back seam: the profile's u = 0 end (age 0: no clearing yet) at s = -0.5 hC.
    vec2 pBack = breakerProfile(0.0, 0.0, u_xi, hC, c);
    vec2 srcB  = vec2(x0, zc) + dir*(pBack.x*sigma);
    float f3, p3, b3, c3, l3, a3, k3;
    PB = surfacePos(srcB, u_time, f3, p3, b3, c3, l3, a3, k3);
  }

  // Profile -> world about the drawn crest.
  vec2 pr = breakerProfile(u, age, u_xi, hC, c);
  vec3 W  = vec3(Pc.x + dir.x*pr.x*sigma, Pc.y + (pr.y - hC)*VIS, Pc.z + dir.y*pr.x*sigma);

  // Seams. The back seam holds until the upper edge starts clearing after
  // impact (a cleared edge is the trailing edge of falling water, and pulling
  // it back up the face is the defect the descent experiment removed). The
  // landing seam attaches as the jet ARRIVES: a jet in flight has a free tip —
  // that open edge is the mouth of the tube — and is C0 on the landing from
  // impact on.
  float tip    = clamp(age/CRASH_PEAK_S, 0.0, 1.0);
  float clearP = smoothstep(CRASH_PEAK_S, CRASH_PEAK_S + 1.5*CRASH_SIGMA_S, age);
  float wB = (1.0 - smoothstep(0.0, 0.15, u)) * (1.0 - smoothstep(0.0, 0.25, clearP));
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
  vec3 cav = Pc + vec3(dir.x, 0.0, dir.y)*(0.5*D) - vec3(0.0, 0.5*hCd, 0.0);
  if (dot(N, W - cav) < 0.0) N = -N;

  float gate = weight * breakMask(x0) * farFadeAt(vec2(x0, zc)) * (1.0 - l1) * (1.0 - l2);
  // Zero weight: parked under the water with alpha 0, so nothing pokes out.
  if (!live) { P = Pc; gate = 0.0; }
  if (!(P.x == P.x && P.y == P.y && P.z == P.z)) { P = Pc; gate = 0.0; }   // NaN guard (house rule)
  if (!(N.x == N.x && N.y == N.y && N.z == N.z)) N = vec3(0.0, 1.0, 0.0);

  vTubeA  = clamp(gate, 0.0, 1.0);
  vTubeUV = vec2(x0, u);
  vTubeN  = N;
  vTubeW  = P;
  vTubeK  = vec3(age, clamp(pr.x/sL, 0.0, 1.0), hCd);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
}
`;

// Modest shading: glassy exterior, dark green-black interior with a fresnel-lit
// lip, thin-lip translucency toward the sun (a backlit lip reads bright green),
// and aerated streaks running down the jet on the SECONDS clock, as
// CURTAIN_FRAG does. No fog: the ribbon lives within a few hundred metres of
// every camera that can see it. Facet quality is Track D's.
export const TUBE_FRAG = `
varying float vTubeA;
varying vec2  vTubeUV;
varying vec3  vTubeN;
varying vec3  vTubeW;
varying vec3  vTubeK;
uniform float u_time;
uniform vec3  u_camStage;   // the eye in STAGE coordinates (main.js frame loop)

// SKY_GLSL's sunDir, copied rather than spliced: this pass needs one vector,
// not the dome. Keep in step with shaders.js if the sun ever moves.
const vec3 TUBE_SUN = normalize(vec3(-0.45, 0.42, -0.28));

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
  vec3 col = mix(ext, inn, inside);

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

  float alpha = vTubeA * (0.88 + 0.12*streak);
  gl_FragColor = vec4(col, alpha);
}
`;
