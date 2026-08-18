// Shared model GLSL — the one executable form of docs/MODEL.md (see
// WEB_THREE_SPEC.md "Architecture"). Both renderers splice this string:
// web/ into its raymarch fragment shader, web-three/ into its displacement
// vertex shader. Version-agnostic GLSL (no in/out/varying) so it compiles
// under raw #version 300 es and under three.js ShaderMaterial prefixes alike.
// Renderer-specific uniforms (u_res, u_time, u_view) stay in the renderers;
// everything here is model state.
//
// 2026-08-10: this file previously forbade texture calls. Lifted deliberately
// (MODEL.md 2.2): the seabed is real data now, and a sampler is the only sane
// way to carry a 96x84 NCEI patch onto the GPU. texelFetch + manual bilinear
// keeps it portable — no float-texture or linear-filter extension needed.
// Both vehicles are WebGL2, so `uniform sampler2D` compiles in both prefixes.

export const MODEL_GLSL = `
// ---------- model uniforms ----------
uniform float u_T;        // swell period, s
uniform float u_H0;       // deep-water height, m
uniform float u_alpha;    // peel angle, radians (break-line slope m = tan(alpha))
uniform float u_xi;       // Iribarren: <0.5 spilling, 0.5-3.3 plunging (Battjes)
uniform float u_sections; // crest noise -> early-breaking patches
uniform float u_dF;       // group beat, Hz (set period = 1/dF)
uniform float u_tau;      // foam e-folding, s
uniform float u_chop;     // local wind-sea texture 0..1
uniform float u_aframe;   // 0 point break, 1 A-frame (abs fold); no site sets 1
uniform float u_surfer;   // 0 off, 1 riding
uniform float u_breakShape;// 1 = structural breaker anatomy, 0 = legacy ridge A/B
uniform float u_wwArea;   // 4a' whitewater-area coupling: 1 on (default), 0 = pre-fix A/B
uniform float u_cgLegacy; // 6a A/B: 0 physical cg = gT/4pi (default), 1 = retired 0.5*LAM/T (#cg=0)
uniform float u_geoMix;   // 1 = OSM/NCEI stage profile, 0 = synthetic fallback
uniform vec2 u_contourFit;// NCEI equal-elevation contour: x2*x^2 + x3*x^3
uniform vec2 u_stageBounds;// OSM canon-neighbor midpoints in local stage metres
uniform vec4 u_reefWin;   // finite-reef envelope knots: in0, in1, out0, out1 (metres)

// ---------- seabed (NCEI patch on the stage frame) ----------
uniform sampler2D u_bed;  // RGBA8: R high byte, G low byte of NAVD88 elevation
uniform float u_depthMix; // 1 = real seabed drives the model, 0 = synthetic
uniform vec4 u_bedRect;   // patch extent in stage metres: x0, z0, x1, z1
uniform vec2 u_bedSize;   // patch texel dimensions (nx, nz)
uniform vec2 u_bedElev;   // quantization window, m NAVD88: min, max
uniform float u_waterLevel; // MSL above NAVD88 + tide offset, m
uniform float u_bedShape; // 0 = measured seabed, 1 = its least-squares plane
uniform vec3 u_bedPlane;  // a + b*x + c*z, the counterfactual "no reef" bed
// Metres to shift the ride line seaward so it lands on the DEPTH-derived
// breaking position rather than the authored break line. Zero without
// bathymetry. Computed CPU-side once per frame (bed.js depthBreakOffset) —
// finding the H0*Ks = gamma*h crossing needs a march along z, which is far too
// expensive per fragment, and the rider is a single point.
uniform float u_rideOffset;

// ---------- M4: emergent break line ----------
// zBreak(x) baked to a 128x1 texture CPU-side (bed.js bakeBreakLine): the
// H0*Ks = gamma*h crossing has no closed form, and marching it per fragment
// would cost ~140 texture fetches. One-dimensional, and only changes when the
// site, swell or tide does — so it is a lookup, cheaper than the arithmetic
// it replaces.
uniform sampler2D u_breakTex;
uniform float u_breakMix;   // 1 = emergent line, 0 = authored tan(alpha) line
uniform float u_gapMask;    // 1 = honor baked section gaps, 0 = #gap=0 A/B revert
uniform float u_headRead;   // 1 = comet-head whitewater aging, 0 = #head=0 A/B revert
uniform float u_pockSize;   // 1 = pocket footprint scales with H_eff, 0 = #pock=0 A/B revert
uniform float u_stripeLife; // 1 = per-stripe along-crest lifecycle clock (#slife=1), default 0
uniform vec2 u_breakX;      // x range the texture spans
uniform vec2 u_breakZ;      // decode window for z
// Rider solved CPU-side against the same baked line and passed in: with an
// emergent line the zipper position has no closed form either, and the rider
// is a single point. (x, z, vx, vz)
uniform vec4 u_surferPos;

// ---------- M6 part 3: the shoaling wavelength ----------
// LAM below is a frozen 90 m, so the model's crests never compress as they come
// in: at 2 m of water it lays down 90 m spacing where linear theory says ~66 m,
// and the steepening ramp from deep water to the break has 1.4x of dynamic
// range instead of 2.5x. That is the measured reason the crest peaks and
// subsides instead of pitching (tests/dispersion.test.js).
//
// The fix is a depth-dependent phase field. For a straight contour, Snell makes
// the alongshore wavenumber kappa = k*sin(phi) invariant, so the total spatial
// phase separates exactly:
//
//     phase(x, zc) = kappa*x + Psi(zc),   Psi(zc) = integral of sqrt(k^2 - kappa^2)
//
// Psi has no closed form over a measured seabed, so bed.js bakes it to a 256x1
// table (bakeRefraction -> dispersion.js integratePsi) exactly as M4 bakes the
// break line. u_psiMix cross-fades to it; at 0 this whole path costs one mix.
//
// STAGED (WEB_THREE_SPEC.md M6 part 3): step 1 is the WATER ONLY. The rider,
// the audio crest solve and setEnv's group speed all still assume the
// constant-phi plane wave, so with u_psiMix = 1 the rider will drift off the
// crests. That is expected and is why this is off by default (#psi=1 to try).
uniform sampler2D u_refrTex;
uniform float u_psiMix;     // 0 = frozen-LAM plane wave, 1 = baked Psi
uniform float u_shelterMix; // 1 = H_eff sheltering field, 0 = flat H0 (#shelter=0)
uniform vec2 u_refrZ;       // contour-z range the table spans
uniform vec2 u_refrPsi;     // decode window for Psi, radians
uniform float u_refrKappa;  // alongshore wavenumber, rad/m (Snell invariant)

// ---------- constants ----------
// GPU SOURCE OF TRUTH for the shared physics constants. GLSL cannot import, so
// the JS side carries exactly one mirror of each: G and GAMMA live in
// web-three/js/dispersion.js, LAM in web-three/js/model-js.js. Change a value
// here and there together, nowhere else.
const float PI  = 3.14159265;
const float G   = 9.81;
const float LAM = 90.0;   // display wavelength, m (shoaled ~15 s swell at ~8 m depth)
const float VIS = 3.2;    // visual amplitude gain: physical heights are nearly
                          // invisible at landscape scale; exaggerate, don't lie about kinematics
const float GAMMA = 0.78; // depth-limited breaker index H/h (McCowan solitary-wave
                          // limit; Battjes/Nairn put field values ~0.7-0.9)

// Breaker lifecycle in SECONDS, deliberately independent of peel speed. The
// zipper kinematics stay in rayS()/swellPhi(); these only decide how much of
// the already-broken line remains visible behind its moving head.
const float CRASH_PEAK_S = 0.42;
const float CRASH_SIGMA_S = 0.20;
const float BORE_FADE_START_S = 2.60;
const float BORE_END_S = 3.80;
// ---- sheltering (H_eff, MODEL.md 2.6.7) ----
// Energy decay as swell refracts around the apex: down-point (+x) the wave is
// SMALLER AND WEAKER, which is what the golden-rule "mellow" actually is now
// that alpha no longer fakes it (the 2026-08-13 retarget). Calibrated by
// log-linear fit of the card bank's own H0 gradient over the canon span
// (2.2 m at Sewers u=402 -> 0.7 m at Private's u=1977, r^2 = 0.81): the seven
// card H0s ARE the guides' sheltering gradient sampled at the spots, so the
// card value stays true at the takeoff anchor and the field carries the decay
// across the stage. Direction-frozen at the SC116 reference like everything
// else (L becomes L(D_p) when direction wires — W wrap shortens it, S swell
// lengthens it; MODEL.md 2.6.2 rule 2). JS twin: SHELTER_* in dispersion.js —
// keep numerically identical.
const float SHELTER_X0 = 24.0;   // m, reef anchor: where the card H0 is true
const float SHELTER_L  = 1675.0; // m, e-fold of the apex shadow at reference D_p

// ---------- hash / noise ----------
float hash11(float p){ p = fract(p*0.1031); p *= p+33.33; return fract((p+p)*p); }
float hash21(vec2 p){ vec3 q = fract(vec3(p.xyx)*0.1031); q += dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vnoise1(float x){ float i=floor(x), f=fract(x); f=f*f*(3.0-2.0*f); return mix(hash11(i),hash11(i+1.0),f); }
float vnoise2(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x), mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x), f.y);
}

// ---------- bathymetry: the break line (peel line) ----------
// z increases shoreward. Break starts at low x (right-hander peeling +x).
// A-frame: fold x about 0 -> two mirrored zippers.
// For mapped sites the curve comes from the NCEI equal-elevation contour
// through the OSM surf node. The synthetic quadratic remains the explicit
// fallback for the one unmapped site (Privates) and for the A-frame mechanism,
// which folds about x=0 and so cannot use an asymmetric measured contour.
//
// 2026-08-10 FRAME CHANGE (MODEL.md 2.3). The break line used to be tilted off
// the shore by tan(alpha) while the crests ran shore-parallel. The angle
// BETWEEN them was right, so the peel rate was right, but the absolute
// orientation was wrong and the stage/shoreline/cameras all live in the shore
// frame: at Second Peak the line crossed the measured waterline at x = 70 m and
// ran up to 322 m inland by the end of the reef window. The peel had ~120 m of
// water out of ~265 m of reef, and what was left read as a shore-parallel bore
// band, not a peel. Now the SWELL carries the angle and the break line follows
// the measured contour, which is what puts it in the water the whole length of
// the point. See swellPhi() for what alpha means under this convention.
float geoWeight(){
  return clamp(u_geoMix, 0.0, 1.0) * (1.0 - step(0.5, u_aframe));
}

float coastCurve(float x){
  float xx = mix(x, abs(x), u_aframe);
  float synthetic = xx*xx/5000.0;
  float gx = clamp(x, u_stageBounds.x, u_stageBounds.y);
  float measured = u_contourFit.x*gx*gx + u_contourFit.y*gx*gx*gx;
  return mix(synthetic, measured, geoWeight());
}

float coastCurveSlope(float x){
  float xx = mix(x, abs(x), u_aframe);
  float foldSign = mix(1.0, sign(x), u_aframe);
  float synthetic = 2.0*xx/5000.0 * foldSign;
  float inside = step(u_stageBounds.x, x) * step(x, u_stageBounds.y);
  float measured = inside * (2.0*u_contourFit.x*x + 3.0*u_contourFit.y*x*x);
  return mix(synthetic, measured, geoWeight());
}

// ---------- the swell's own direction ----------
// Incidence from shore-normal, radians. Positive = arriving from up-coast
// (-x), so the zipper runs +x: a right. This is the parameter the model was
// missing entirely -- theta_s sat in MODEL.md 3's table and appeared in no
// uniform, which is why crests could only ever arrive shore-parallel.
//
// u_alpha is reused rather than adding a second angle, because the two are the
// same number where the contour is flat. At the spot origin coastCurveSlope=0,
// so the crest-to-break-line angle IS the incidence, and the authored alpha
// keeps its documented meaning (Walker's peel angle at the peak). Away from the
// origin the contour swings and the REALIZED peel angle rises on its own --
// emergent, not authored, so the point mellows down-coast for free. See
// peelAngleAt() for the exact expression; it is NOT phi plus the contour slope,
// because the shear does not preserve angles.
// alpha is the DEEP-WATER swell direction. What the crests actually arrive at
// is that angle refracted, and refraction is most of the story: celerity falls
// from c0 = gT/2pi offshore to sqrt(g*h_b) at breaking depth, and Snell shrinks
// the incidence by exactly that ratio.
//
//   sin(phi_break) = sin(alpha) * c_break / c0
//
// At T=14 s that ratio is ~0.23, so a 58 deg deep-water swell arrives at ~11
// deg — crests very nearly shore-parallel, which is what real waves do and what
// the constant-angle version could not do. Evaluated once from the breaking
// depth (h_b = H0/GAMMA) rather than per fragment, so the crest field stays a
// plane wave and the zipper keeps its closed form.
//
// The consequence is deliberate and physical: the peel angle drops with it, so
// the wave is FASTER than the authored alpha implied. Refraction forgets the
// deep-water angle; that is the real behaviour, not a defect. See MODEL.md 2.4.
float swellPhi(){
  float a  = clamp(u_alpha, 0.06, 1.45);
  float hb = max(u_H0/GAMMA, 0.4);            // depth-limited breaking depth
  float c0 = G*u_T/(2.0*PI);                  // deep-water celerity
  float cb = sqrt(G*hb);                      // shallow-water celerity at break
  float s  = sin(a) * clamp(cb/max(c0, 0.1), 0.0, 1.0);
  return clamp(asin(clamp(s, 0.0, 1.0)), 0.04, 1.45);
}

// Contour-following coordinate: 0 on the break contour, negative seaward.
// Every geometric term below is a function of it, so the crest, the break line
// and the amplitude envelope share one frame instead of three.
float contourZ(vec2 xz){ return xz.y + coastCurve(xz.x); }

// H_eff(x)/H0: the sheltering factor (constants and rationale at SHELTER_*).
// Exponential in stage x, 1.0 at the reef anchor so the card H0 keeps meaning
// "the wave at the takeoff". Clamped as a guard for stages wider than the
// calibration span; on the current ~[-110, 290] m stages the clamp never
// binds (0.85..1.08). Gated by u_depthMix (the synthetic stage has no apex to
// hide behind) and by u_shelterMix for the #shelter=0 A/B. Unset uniforms
// read 0.0, so any consumer that never wires u_shelterMix gets flat H0.
// BAKE TWIN: bed.js shelterFactor() — same constants, same clamp, or the
// break line and the wave field disagree about where breaking happens.
float shelterAt(float x){
  float s = clamp(exp(-(x - SHELTER_X0)/SHELTER_L), 0.6, 1.25);
  return mix(1.0, s, u_depthMix*u_shelterMix);
}

// Realized peel angle at station x -- what a surfer would measure, in radians.
// The contour shear maps break line and crest to different slopes in world
// (x,z), and shear does not preserve angles, so this is the difference of the
// two bearings rather than phi plus a correction. Diagnostic only (HUD, docs):
// nothing in the hot path needs it, because the geometry is exact in the
// contour frame where the angle is phi by construction.
float peelAngleAt(float x){
  float cc = coastCurveSlope(x);
  return atan(-cc) - atan(-tan(swellPhi()) - cc);
}

float breakTexZ(float x){
  float f = clamp((x - u_breakX.x)/max(u_breakX.y - u_breakX.x, 1e-3), 0.0, 1.0)*127.0;
  int i = int(floor(f));
  float tf = f - float(i);
  vec4 a = texelFetch(u_breakTex, ivec2(min(i,127), 0), 0);
  vec4 b = texelFetch(u_breakTex, ivec2(min(i+1,127), 0), 0);
  float za = mix(u_breakZ.x, u_breakZ.y, (a.r*255.0*256.0 + a.g*255.0)/65535.0);
  float zb = mix(u_breakZ.x, u_breakZ.y, (b.r*255.0*256.0 + b.g*255.0)/65535.0);
  return mix(za, zb, tf);
}

// SECTION GAP (2026-08-14). The bake flags limiter-pinned texels in the B
// channel (0 = gap): there the drawn line is a branch teleport turned into a
// ramp by the slew clamp — line transport, not a breaking crest — so the wave
// must pass through UNBROKEN (MODEL.md 4.5: a steep line segment is a section
// gap, not a wrapped crest). Returns 1.0 (breaking allowed) outside gaps, on
// the authored-line fallback (u_breakMix 0), and under the #gap=0 A/B revert.
float breakMask(float x){
  float f = clamp((x - u_breakX.x)/max(u_breakX.y - u_breakX.x, 1e-3), 0.0, 1.0)*127.0;
  int i = int(floor(f));
  float tf = f - float(i);
  float ma = texelFetch(u_breakTex, ivec2(min(i,127), 0), 0).b;
  float mb = texelFetch(u_breakTex, ivec2(min(i+1,127), 0), 0).b;
  return mix(1.0, mix(ma, mb, tf), u_gapMask*u_breakMix);
}

float breakLine(float x){
  float xx = mix(x, abs(x), u_aframe);
  // sections: shallow patches meet the break criterion early (z_b pulled seaward)
  float sec = u_sections * 55.0 * (vnoise1(xx*0.02+7.3) - 0.5) * 2.0;
  // The break line IS the contour through the surf node (contourZ = 0). It no
  // longer carries alpha: the swell does. This is what keeps it seaward of the
  // measured waterline for the whole reef window instead of diving onto the
  // beach at x = 70 m.
  float authored = -coastCurve(x);
  // M4: depth decides where the wave breaks. The authored line stays as the
  // fallback for the unmapped site and the A-frame fold, which have no
  // bathymetry to derive from.
  float base = mix(authored, breakTexZ(x), u_breakMix);
  return base + min(sec, 0.0)*step(0.05, u_sections);
}

// Authored finite-reef envelope. OSM spot partitions do not claim to measure
// physical reef edges, so geo profiles shape the break but do not replace it.
//
// The knots are now PER SPOT (params.js reefWindowKnots): the same rule the
// hard-coded (-110, -35, 215, 290) always expressed — stage bounds feathered
// inward — applied to each spot's own bounds instead of to the one synthetic
// stage that existed when it was written. On the synthetic stage the two are
// bit-identical. See params.js for the measurement that forced this.
float reefWindow(float x){
  float xx = mix(x, abs(x), u_aframe);
  return smoothstep(u_reefWin.x, u_reefWin.y, xx)
       * (1.0 - smoothstep(u_reefWin.z, u_reefWin.w, xx));
}

// ---------- seabed: real depth, not distance-to-an-authored-line ----------
// One texel-fetch quad with hand-rolled bilinear. RGBA8 + manual decode rather
// than a float texture: no extension, exact on every WebGL2 device, and the
// 16-bit window (60 m across 65535 steps) quantizes at ~0.9 mm — three orders
// below DEM error, so this is storage, not a modelling choice.
float bedTexel(ivec2 p){
  ivec2 q = clamp(p, ivec2(0), ivec2(u_bedSize) - ivec2(1));
  vec4 t = texelFetch(u_bed, q, 0);
  float unit = (t.r*255.0*256.0 + t.g*255.0) / 65535.0;
  return mix(u_bedElev.x, u_bedElev.y, unit);
}

// Seabed elevation, metres NAVD88 (positive = dry land above the datum).
float bedElevM(vec2 xz){
  vec2 uv = (xz - u_bedRect.xy) / max(u_bedRect.zw - u_bedRect.xy, vec2(1e-3));
  vec2 tc = clamp(uv, 0.0, 1.0) * (u_bedSize - 1.0);
  ivec2 i0 = ivec2(floor(tc));
  vec2 f = tc - vec2(i0);
  float e00 = bedTexel(i0),                e10 = bedTexel(i0 + ivec2(1,0));
  float e01 = bedTexel(i0 + ivec2(0,1)),   e11 = bedTexel(i0 + ivec2(1,1));
  float measured = mix(mix(e00, e10, f.x), mix(e01, e11, f.x), f.y);
  // A/B counterfactual: the least-squares plane through the SUBMERGED part of
  // this patch keeps the depth scale, mean slope and orientation and throws
  // away only the structure (0.3-0.9 m RMS at these spots).
  //
  // Both halves of that were wrong until 2026-08-10. The plane was fitted over
  // every post, and 20-40% of each stage frame is dry cliff, so the cliff set
  // the slope: the counterfactual came out ~2x too steep (2.07 deg vs 1.05 deg
  // at Second Peak) and the quoted "structure" was ~8x too large (2.56 m vs
  // 0.32 m). Substituting it also reshaped the beach, which is the one thing
  // the A/B has to hold constant to isolate reef SHAPE from depth.
  // Now the plane is submerged-fit AND substituted only where there is water,
  // smoothstepped across the waterline so plane mode has no seam there.
  float plane = u_bedPlane.x + u_bedPlane.y*xz.x + u_bedPlane.z*xz.y;
  float wet = smoothstep(u_waterLevel + 0.15, u_waterLevel - 0.15, measured);
  float e = mix(measured, plane, u_bedShape * wet);
  // EXTRAPOLATION RAMP, applied here so every consumer sees the same ground
  // (2026-08-12). The uv clamp above means each sample outside the patch
  // returns the EDGE elevation, i.e. a flat plateau at whatever height the
  // rim happened to be — and where that rim is above water it drew a pale
  // tableland bounded by the patch RECTANGLE, which is the straight diagonal
  // across the land in the cliff view. BED_VERT already ramped its own copy
  // down (it had to, or the seabed mesh punched a hole in the far water), so
  // the two surfaces disagreed about the same ground. Ramping inside bedElevM
  // makes the land path, the waterline (max(bed, water)), waterDepthM and the
  // seabed mesh agree by construction. Zero inside the patch, so nothing
  // measured moves.
  //
  // DIRECTIONAL BY CONTENT (2026-08-12, the "why do we still have an island"
  // report). The first ramp sank the ground in EVERY direction outside the
  // patch, so inland and down-coast — where the real coast continues — the
  // terrain dove below sea level and the whole landmass read as a finite
  // island in mist. Sink only where the clamped EDGE elevation is already
  // below water (ocean continuing seaward/alongshore); where the edge is land,
  // HOLD its elevation — the coastal terrace continues, and the domain matte
  // plus fog finish it as a hazy landmass rather than a shoreline that ends.
  // The clamp plateau this re-admits was the old tableland bug only because
  // the rectangular matte left it half-lit with a hard albedo edge; under the
  // radial matte (provenanceAt) land fades to ZERO before the plateau's
  // rectangle could read. The 1.5 m band straddling the waterline blends the
  // two regimes so the rule itself draws no contour.
  // ...and the HELD land relaxes toward a low coastal plain (wl + 2 m) over
  // ~500 m rather than holding the rim's full height forever: a 15 m plateau
  // meeting sunk ocean along the patch edge printed its silhouette as a
  // straight haze wall (the diagonal seam in the down-coast view). A 2 m
  // plain casts no silhouette the fog cannot swallow, and still reads as
  // "the coast continues" rather than "the coast ends".
  vec2 dOut = max(max(u_bedRect.xy - xz, xz - u_bedRect.zw), vec2(0.0));
  float dO = length(dOut);
  float oceanic = 1.0 - smoothstep(u_waterLevel - 0.5, u_waterLevel + 1.0, e);
  float landHold = mix(e, min(e, u_waterLevel + 2.0), smoothstep(60.0, 520.0, dO));
  return mix(landHold, e - 0.045 * dO, oceanic);
}

// Still-water depth, metres. Zero on land — the shoreline is wherever this
// crosses zero, so the beach is a consequence of the data, not a drawn prop.
float waterDepthM(vec2 xz){
  return max(u_waterLevel - bedElevM(xz), 0.0);
}

// Depth the wave physics should use: floored so shoaling and H/d stay finite
// in the swash, where the model has nothing useful to say anyway.
float modelDepthM(vec2 xz){
  return max(waterDepthM(xz), 0.35);
}

// ---------- the surfer ----------
// The zipper position is closed-form (theta = 2*pi*n at z = z_b), so the surfer
// needs no state: ride the face just seaward of the break line, pumping between
// bottom turn (far from the line) and top turn (near it). Returns (x, z, vx, vz).
vec4 surferState(float t){
  // With an emergent break line the zipper position has no closed form; main.js
  // solves it against the same baked array and passes it in.
  if (u_breakMix > 0.5) return u_surferPos;

  float k = 2.0*PI/LAM;
  float w = 2.0*PI/u_T;
  // Walker's peel rate, now read straight off the geometry: the breakpoint is
  // where the crest meets the break line, the break line is contourZ = 0, so
  // rayS = xs*sin(phi) = (w*t - 2*pi*n)/k and the breakpoint runs along the
  // line at c/sin(phi). Under the old frame the same speed appeared as
  // c/tan(alpha) because x was measured across the tilted line, not along it.
  float sp = max(sin(swellPhi()), 0.05);   // phi->0 guarded: closeout, not a divide by zero
  float cp = max(cos(swellPhi()), 0.05);
  float vx = (LAM/u_T)/sp;

  // ride window runs TOWARD the cliff camera (distant takeoff -> hero frame),
  // and in A-frame mode starts at the apex either way
  float gw = geoWeight();
  float x0 = mix(-18.0, max(-18.0, u_stageBounds.x + 20.0), gw);
  float x1 = mix(x0 + 225.0, max(x0 + 40.0, u_stageBounds.y - 20.0), gw);
  float span = x1 - x0;
  float rideT = span/max(vx, 0.5);
  float ph = mod(t, rideT);
  float xApprox = x0 + vx*ph;

  // snap to the nearest real zipper so the surfer sits on an actual crest
  float n  = floor((w*t - k*sp*xApprox)/(2.0*PI) + 0.5);
  float xs = (w*t - 2.0*PI*n)/(k*sp);

  // pumping: carve down (bottom turn) and back up the face, ~6 s cycle
  float pump    = sin(t*2.0*PI/6.0);
  float faceOff = 11.0 + 5.0*pump;         // metres seaward of the break line
  float xfold   = mix(xs, abs(xs), u_aframe);
  // Target the depth-derived breaking locus, then SNAP TO THE NEAREST CREST.
  // Shifting z alone is wrong: the offset is not a multiple of the wavelength,
  // so it drops the rider between crests (measured -1.65 m — a trough — at
  // Sewers with a 133 m offset). Crests satisfy theta = 0 mod 2pi, so solve for
  // the nearest n and sit faceOff seaward of that crest's line.
  // With u_rideOffset = 0 the nearest crest IS the zipper crest by construction,
  // so this reduces exactly to the previous behaviour.
  // All of it in the CONTOUR frame now; convert to world z once, at the end.
  float zcTarget = -u_rideOffset;          // break line is contourZ = 0
  float nz       = floor((w*t - k*(xfold*sp + zcTarget*cp))/(2.0*PI) + 0.5);
  float zcCrest  = ((w*t - 2.0*PI*nz)/k - xfold*sp)/cp;
  float zs       = zcCrest - faceOff - coastCurve(xs);
  // The rider tracks along its own crest, so contourZ is constant along the
  // ride and the only vertical motion is the pump plus the contour's own bow.
  float vz       = -coastCurveSlope(xs)*vx
                 - 5.0*(2.0*PI/6.0)*cos(t*2.0*PI/6.0);
  return vec4(xs, zs, vx, vz);
}

// Distance along the wave ray -- the propagation coordinate. Crests are lines
// of constant rayS, so this is the ONE place the swell direction enters the
// height field. A-frame folds x here, giving two zippers running outward.
float rayS(vec2 xz){
  float phi = swellPhi();
  float xx  = mix(xz.x, abs(xz.x), u_aframe);
  return xx*sin(phi) + contourZ(xz)*cos(phi);
}

// ---------- M6 part 3: local wavenumber and the Psi phase field ----------
// Guo (2002) explicit dispersion, k*h = y/[1-exp(-y^1.25)]^0.4 with
// y = omega^2*h/g. MODEL-TWIN of dispersion.js wavenumberAt(): 0.79% max error
// against the exact root, verified in tests/dispersion.test.js. (The previous
// y/sqrt(tanh y) form in bed.js was cited as Guo and is not — 4.98% error.)
float kLocalAt(vec2 xz){
  float omega = 2.0*PI/u_T;
  float h = modelDepthM(xz);
  float y = omega*omega*h/G;
  // pow(0, 0.4) is 0 and the divide would blow up; y is floored by modelDepthM's
  // 0.35 m so this is belt-and-braces, but the mesh is unforgiving about NaN.
  float den = max(pow(1.0 - exp(-pow(y, 1.25)), 0.4), 1e-4);
  float k = (y/den)/h;
  // Off the bathymetry there is no depth to disperse over: fall back to the
  // frozen carrier so synthetic presets and the A-frame are untouched.
  return mix(2.0*PI/LAM, k, u_psiMix*u_depthMix);
}

// Psi(contourZ) from the 256x1 bake. Same 16-bit RG decode as breakTexZ.
float psiLookup(float zc){
  float f = clamp((zc - u_refrZ.x)/max(u_refrZ.y - u_refrZ.x, 1e-3), 0.0, 1.0)*255.0;
  int i = int(floor(f));
  float tf = f - float(i);
  vec4 a = texelFetch(u_refrTex, ivec2(min(i, 255), 0), 0);
  vec4 b = texelFetch(u_refrTex, ivec2(min(i+1, 255), 0), 0);
  float pa = mix(u_refrPsi.x, u_refrPsi.y, (a.r*255.0*256.0 + a.g*255.0)/65535.0);
  float pb = mix(u_refrPsi.x, u_refrPsi.y, (b.r*255.0*256.0 + b.g*255.0)/65535.0);
  return mix(pa, pb, tf);
}

// The spatial phase the crest field runs on. At u_psiMix = 0 this is exactly
// the old k*rayS plane wave, so the legacy path is bit-identical, not merely
// close. At 1 it is kappa*x + Psi(zc) — the same separation of variables, with
// the shore-normal part integrated over the real depth instead of assumed
// constant. A-frame folds x here exactly as rayS does.
float rayPhase(vec2 xz){
  float legacy = (2.0*PI/LAM)*rayS(xz);
  float xx = mix(xz.x, abs(xz.x), u_aframe);
  float baked = u_refrKappa*xx + psiLookup(contourZ(xz));
  return mix(legacy, baked, u_psiMix*u_depthMix);
}

// Carrier crest with group envelope. Groups travel at cg = c/2 (deep-water).
// Takes the RAY coordinate, not z: sets are bands parallel to the crests, so
// with an oblique swell they must arrive along the ray. Passing z made the
// group fronts shore-parallel and out of step with the crests they envelope.
// Group speed: the PHYSICAL deep-water cg = gT/4pi — the same authority the
// shoaling path already uses (Green's law cg0, bed.js march, dispersion.js).
// Until 2026-08-13 this was 0.5*LAM/T, i.e. cg = c/2 applied to the 90 m
// DISPLAY wavelength of an already-shoaled swell — a speed no linear theory
// assigns to this swell at any depth (deep-water L for T=14 s is ~306 m). The
// cadence audit measured the consequence in the time domain: measured carrier
// phase speed matched LAM/T while the set band ran 3.9x short (375 m vs
// 1464 m), so sets crossed the stage at a crawl. The beat period 1/dF at a
// fixed point is cg-independent — the VERIFIED 120.5 s cadence does not move.
// JS twins: setEnv in model-js.js, the voice envelope in sound.js.
// #cg=0 re-arms the retired constant for A/B measurement (u_cgLegacy = 1).
float groupSpeedM(){
  return mix(G*u_T/(4.0*PI), 0.5*LAM/u_T, u_cgLegacy);
}

float setEnv(float s, float t){
  float cg = groupSpeedM();
  return 0.5 + 0.5*cos(2.0*PI*u_dF*(t - s/cg));
}

// ---------- wave setup / setdown: the minute-scale shoreline breath ----------
// Broken waves carry excess momentum flux (radiation stress, Longuet-Higgins &
// Stewart); releasing it in the surf zone tilts the mean water surface upward
// toward the beach. During a set the still-water level near shore therefore
// rides a modest fraction of the breaking height ABOVE its lull position, and
// in the lull the piled water drains back seaward. MODEL.md 5's swash
// exclusion is deliberately overruled here (2026-08-11, Andy, screensaver
// mission): this is the minute-to-minute "tide pull-back" the screen needs,
// and setup/setdown is mean-water-level physics, not per-wave swash.
//
// The driver is the SAME group envelope that pumps the sets (setEnv, period
// 1/u_dF ~ minutes), but smoothed into a lagged, asymmetric response: the
// surge arrives with the broken waves of the set, while the drain is gravity
// pushing a thin sheet back through the surf zone and takes longer. GLSL has
// no per-frame state to integrate an attack/decay envelope-follower with, so
// the asymmetry is analytic in u_time: the phase lag itself swings with
// sin(ph), which delays the falling limb of the cosine (slow drain) more than
// the rising limb (fast surge). Rate independent — everything is a function
// of t and u_dF, never of frame count.
// Peak setup elevation, metres — the envelope maximum (envS = 1) at a station
// where the shallow fade is fully open. Factored out so wetSand() below can
// reconstruct the set-peak waterline analytically from the very number the
// lift itself uses; the two can never drift apart.
// Depth-limited breaking makes H0 the breaking-height scale (H_break =
// GAMMA*h_b with h_b = H0/GAMMA), so scaling by H0 is scaling by H_break:
// bigger days pile more water up the beach — another emergent size cue.
// 0.3 is the TOP of the observed 0.15-0.3*H_break shoreline-setup band;
// raised from 0.2 on 2026-08-11 because the resulting ~8 m waterline breathe
// read as too subtle at drone distance. (The "MODEL.md 2.5 still quotes 0.2"
// follow-up this comment used to carry is DONE — MODEL.md 2.5 says 0.3*H0*envS;
// verified 2026-08-16.) Gated by u_depthMix
// like every bathymetry-derived term (synthetic presets have no measured
// shoreline to move).
float setupPeakM(){ return 0.3*u_H0*u_depthMix; }

float setupLiftM(vec2 xz, float t){
  float cg = groupSpeedM();                        // group speed, as in setEnv
  float ph = 2.0*PI*u_dF*(t - rayS(xz)/cg);        // set-envelope phase at this station
  // Lag in set-cycle radians: base ~0.9 rad (~24 s of a 167 s cycle) keeps the
  // water level trailing the set that raised it; the +0.8*sin(ph) swing holds
  // the level high after the set peaks and releases it quickly when the next
  // set arrives. Always positive (0.1..1.7 rad), so the response never leads.
  float lagPh = 0.9 + 0.8*sin(ph);
  float envS  = 0.5 + 0.5*cos(ph - lagPh);         // smoothed+lagged set envelope, 0..1
  // Confined to the shoreward fringe. The 2 m outer edge is load-bearing (the
  // lineup, the break line and the takeoff never feel the lift); inside it the
  // fade is deliberately steep — full strength out to ~1.2 m of still water
  // (was 0.7 m, steepened 2026-08-11 with the coefficient above), so the whole
  // inner sheet rides the full lift and the breathe survives drone distance.
  float nearShore = 1.0 - smoothstep(1.2, 2.0, waterDepthM(xz));
  return setupPeakM()*envS*nearShore;
}

// ---------- wet sand: the drying band the last set left behind ----------
// Sand standing above the CURRENT water surface but below the waterline the
// last set peak reached reads dark — recently under water, not yet drained.
// Both lines are closed forms of the setup model above, so no history buffer
// is needed: the current line is where the bed meets the lifted surface, the
// set-peak line is the envelope maximum (envS = 1; on emerged sand
// waterDepthM = 0, so the shallow fade is fully open by construction and
// setupPeakM() IS the peak lift there). VIS multiplies both, because the
// renderers compare the bed against the VIS-exaggerated surface (ocean()
// applies h *= VIS after adding the lift) — the band must sit exactly on the
// emergent waterline's own scale or it detaches from the water's edge.
// Returns 0..1: ~1 just above today's waterline, fading to 0 at the set-peak
// line. Deliberately standalone — ocean()'s out-param list must not grow —
// so either renderer can call it wherever it shades emerged bed.
// RENDERER HOOK: in a land branch, darken the sand albedo by this signal,
// e.g. wetness = max(wetness, wetSand(xz, t)) feeding a dry->wet albedo mix.
// web-three GRID_FRAG's land branch is wired; web/'s raymarcher shades the
// beach through its own bed path and can adopt the same call in a follow-up.
float wetSand(vec2 xz, float t){
  float bedAbove = bedElevM(xz) - u_waterLevel;    // m above still water
  float nowLine  = VIS*setupLiftM(xz, t);          // current lifted waterline
  float peakLine = VIS*setupPeakM();               // set-peak waterline (envS = 1)
  // Fully wet from the water's edge; the top fades in before the peak line so
  // the set's highest reach is a soft drying fringe rather than a hard stripe.
  float aboveWater = smoothstep(-0.03, 0.06, bedAbove - nowLine);
  float belowPeak  = 1.0 - smoothstep(0.70*peakLine, peakLine + 0.10, bedAbove);
  return aboveWater*belowPeak*u_depthMix;
}

// One breaker clock for every visual consequence of collapse. Age is measured
// at the canonical break line, not independently at each surface sample: the
// lip, impact front, aerated bore and spray therefore remain one event as the
// zipper moves down the point. Returns (age seconds, front z, impact gain,
// bore gain). Geometry and particles consume this same function.
vec4 breakerLifecycleAtX(float x, float t){
  float w = 2.0*PI/u_T;
  float zb = breakLine(x);
  vec2 atBreak = vec2(x, zb);
  // Same phase field as ocean()'s crests, or the crash detaches from the wave
  // that causes it the moment u_psiMix comes on.
  float thetaBreak = w*t - rayPhase(atBreak);
  float age = mod(thetaBreak, 2.0*PI)/w;

  // A compact plunging impact gives way to a lower, longer-lived bore. The
  // front moves shoreward; the site taxonomy only changes their relative
  // energy, so Privates still crumbles while Sewers throws.
  float plunge = smoothstep(0.45, 1.25, u_xi);
  float frontSpeed = mix(2.4, 4.1, plunge);
  float frontZ = zb + frontSpeed*age;
  float env = setEnv(rayS(atBreak), t);
  // breakMask: no crash fires inside a section gap — the line there is a
  // limiter artifact, and a crash anchored to it paints the V.
  float activity = env*env*reefWindow(x)*breakMask(x);
  // The previous 0.68 s sigma made a 52 m First Peak impact head, while its
  // 0.55*T bore e-fold covered ~297 m: the head moved mathematically but the
  // whole line stayed white, so no crash ran down the wave. A narrow head plus
  // a terminal wake restores foreground/background in time without touching Vp.
  float impactAge = exp(-0.5*pow((age - CRASH_PEAK_S)/CRASH_SIGMA_S, 2.0));
  float boreWindow = smoothstep(0.18, 0.55, age)
                   * (1.0 - smoothstep(BORE_FADE_START_S, BORE_END_S, age));
  float boreAge = boreWindow*exp(-age/3.20);
  // SIZE_AUDIT open item 2: the canonical crash number was xi- and
  // envelope-gated only — no H0 term, so a 2.5 m day crashed exactly as hard
  // as a 0.7 m day. Same H0/1.5 calibration as ocean()'s sizeFoam: factor is
  // exactly 1.0 at the 1.5 m model-card day, so 1.5 m presets are unchanged.
  // Sheltered height here too: a down-point crash on a sheltered wave is a
  // smaller crash. shelterAt already carries the depthMix/shelterMix gates.
  float sizeAmp = mix(1.0, clamp(u_H0*shelterAt(x)/1.5, 0.55, 1.6), u_depthMix);
  float impact = activity*impactAge*(0.18 + 0.82*plunge)*sizeAmp;
  float bore = activity*boreAge*(0.72 + 0.28*(1.0 - plunge))*sizeAmp;
  return vec4(age, frontZ, impact, bore);
}

// ---------- the per-stripe lifecycle clock (#slife, hero read item (a)) ----
// WHEN DID THIS COLUMN'S WAVE FIRST BREAK? The inner re-breaking stripes band
// uniformly because every clock they run on is flat ALONG the stripe: tSince
// is constant along a crest by construction (a foam band is a level set of
// theta), and life.x anchors at the break line only — so 3-4 parallel bands
// read as static texture with no along-crest freshness and no legible peel
// direction (the 2026-08-14 hero read, criteria 1+2).
// The honest along-crest clock: the crest now tSince behind this point
// crossed the break line at this station phaseLag/w seconds before that,
// phaseLag = rayPhase(here) - rayPhase(line) being the phase the wave
// accumulated travelling line -> here. So
//     stripeAge = tSince + phaseLag/w
// reduces exactly to the zipper's clock AT the line (phaseLag = 0; tSince
// equals life.x there — see cometFoam), and along any inner stripe (theta
// constant) it equals thetaBreak(x)/w + const: a phase-lagged copy of the
// zipper's along-crest ramp, slope 1/Vp per metre (Vp = c/sin alpha via
// rayPhase), the lag being that stripe's re-break delay. Nothing new is
// authored, and the gradient direction matches the break-line comet by
// construction — same phase field, same handedness.
// The exact decomposition stripeAge = mod(stripeAge, T) + kT separates the
// within-stripe along-crest ramp (identically the line clock continued
// inward) from the whole-period stripe lag (how many crests stand between
// this water and the line); consumers read the two at different e-folds
// because one lambda cannot serve a ~12 s along-frame ramp and a 15-45 s
// stripe-age spread at once (measured 2026-08-18: a single unwrapped e-fold
// left every visible stripe on its floor, along-crest gradient ~5%).
// CANONICAL and CONSUMED IN THE FRAGMENT (GRID_FRAG per-stripe carve), not
// multiplied into ocean()'s foam terms. That placement was BUILT AND
// FALSIFIED (2026-08-18): a pre-threshold multiplication reaches the pixels
// only through the fragment's soft-knee + erosion nonlinearity, so it
// measured invisible at set-peak clocks (OFF-ON dimming 0.000-0.02 luma at
// sim 48/54), and stacked with the fragment carve it double-crushed the
// heads (sim-36 ON: no stripe brighter than lace). Same discipline as the
// comet: the model owns the clock, the post-threshold carve owns the read.
// All seconds; clamp + max() guards keep downstream exp() finite.
float stripeAgeAt(vec2 xz, float t){
  float w = 2.0*PI/u_T;
  float zb = breakLine(xz.x);
  float tSince = mod(w*t - rayPhase(xz), 2.0*PI)/w;
  float phaseLag = max(rayPhase(xz) - rayPhase(vec2(xz.x, zb)), 0.0);
  return clamp(tSince + phaseLag/max(w, 1e-4), 0.0, 240.0);
}

// Sharpened crest profile: q=1 sinusoid-ish, q>2 peaked (Gerstner cusp stand-in)
float crestShape(float phase, float q){
  // rounding can push c01 a hair below 0 at troughs; pow(negative, fractional)
  // is NaN — showed up as vertex speckles on web-three's regular grid
  float c01 = max(0.5 + 0.5*cos(phase), 0.0);
  return pow(c01, q) - 0.5/q;   // rough mean removal, visual only
}

// Height field + break bookkeeping packed together.
// Returns h; outs: foam, pocket, brk (surf-zone mask), crest (unbroken crest lines)
float ocean(vec2 xz, float t, out float foam, out float pocket, out float brk, out float crest){
  float x = xz.x, z = xz.y;
  float w = 2.0*PI/u_T;
  float zb = breakLine(x);
  float d  = zb - z;                       // >0 seaward of break line
  float reef = reefWindow(x);              // 0 off the shelf: mellow takeoff, fade-out

  // ---- shoaling ----
  // Synthetic stand-in (kept for presets with no bathymetry behind them) and
  // the real thing: Green's law Ks = sqrt(cg0/cg), shallow-water cg = sqrt(gh).
  // Capped at 2.6 because breaking intervenes long before Ks runs away.
  // Setup/setdown water is REAL depth: it feeds the shoaling/breaking terms
  // here and lifts the surface itself further down, which is what walks the
  // emergent waterline (surfacePos takes max(bed, water)) up and down the
  // beach on the set rhythm. In the lifted zone the extra depth also raises
  // Hlim slightly, so the last few metres of surf break a touch later during
  // a set — deeper water genuinely is harder to break.
  float lift    = setupLiftM(xz, t);
  float dep     = modelDepthM(xz) + lift;
  float growSyn = 1.0 + 0.85*exp(-max(d,0.0)/90.0)*reef;
  float cg0     = G*u_T/(4.0*PI);          // deep-water group speed, gT/4pi
  float Ks      = clamp(sqrt(cg0/sqrt(G*dep)), 0.7, 2.6);
  // H_eff, not H0, from here down: sheltering is part of the arriving wave,
  // so it feeds shoaling, the breaking gate AND the drawn amplitude — a wave
  // that is smaller down-point must also break later there, or the line and
  // the height field tell different stories. swellPhi()/setup stay on u_H0:
  // the crest field is a plane wave by construction and the setup is a
  // stage-mean term.
  float Heff    = u_H0 * shelterAt(x);
  float Hsh     = Heff * Ks;               // shoaled height if it never broke
  float Hlim    = GAMMA * dep;             // most height this depth can carry
  // Depth-limited breaking: past the limit a wave is a bore whose height is
  // set by the water it is in, not by the swell that made it. Without this cap
  // Green's law keeps growing the wave across the whole inner shelf and the
  // stage reads as one undifferentiated foam field instead of a peeling wave.
  float growGeo = min(Hsh, Hlim) / max(Heff, 0.05);
  float grow    = mix(growSyn, growGeo, u_depthMix);

  // ---- breaking ----
  // The zipper still owns the PEEL (that is this project's contribution), but
  // depth now owns PERMISSION: a wave cannot break in deep water, and must in
  // the shallows. gamma = H/h against McCowan's ~0.78 gates the zipper mask,
  // which is what finally carries whitewater all the way to the sand.
  // "shoreward of the break line" on its own, without the reef weighting —
  // needed twice below, and they are different claims: inside is whether the
  // wave has ARRIVED, reef is whether this station is on the shelf at all.
  float inside  = smoothstep(-6.0, 14.0, z - zb);
  // breakMask withdraws the ZIPPER's claim inside a section gap (the line is
  // a limiter artifact there); depth's own permission (gate below) stands.
  float mask    = breakMask(x);
  float brkZip  = inside * reef * mask;
  // Break where the shoaled wave exceeds what the depth can carry. Comparing
  // Hsh against the limit (rather than H/d against gamma) is the same McCowan
  // criterion but survives the cap above, which pins H/d at gamma everywhere
  // shallow and would otherwise report "breaking" across the entire inside.
  // PHYSICAL heights only: VIS is a viewing exaggeration (see its
  // declaration), and letting it in here made the threshold ~3x too eager.
  float excess  = Hsh / max(Hlim, 0.05);
  float gate    = smoothstep(0.90, 1.25, excess);
  // Depth owns PERMISSION, the zipper owns DIRECTION (MODEL.md 2.2) — but this
  // was max(brkZip, gate), a union, which lets permission alone break the
  // wave. Under the old tilted break line that was invisible: the zipper mask
  // already covered nearly the whole stage, so the gate was redundant and
  // toggling u_depthMix barely moved the foam. With the break line correctly on
  // the contour the gate dominates instead, breaking water 25-40 m SEAWARD of
  // the line and across the full stage width, reef or no reef — the peel then
  // draws on top of an already-broken field.
  // inside factors out, so depth still decides whether it breaks and the
  // shore break outside the reef window survives (reef = 0, gate = 1), but
  // nothing breaks before the wave has reached the line.
  brk           = mix(brkZip, inside*max(reef*mask, gate), u_depthMix);
  float decay   = 1.0 - 0.68*brk;          // broken wave has dumped its energy

  // ---- the wave dies in the swash ----
  // Without this the inshore wave settles at 32% amplitude and runs to the
  // stage edge forever, which is exactly why the beach was invisible.
  // Setup water counts here too: during a set the raised sheet lets broken
  // waves run farther up the shore before dying; in the lull they die where
  // they always did. The excursion of the wave-covered zone therefore
  // breathes with the same rhythm as the waterline itself.
  float shoreFade = mix(1.0, smoothstep(0.0, 1.6, waterDepthM(xz) + lift), u_depthMix);

  // crest at theta=0 mod 2pi. Lines of constant rayS: bowed by the contour and
  // rotated by the REFRACTED swell incidence (swellPhi). Under u_psiMix the
  // spacing between those lines compresses with the depth (M6 part 3) instead
  // of staying frozen at LAM.
  float theta  = w*t - rayPhase(xz);
  // ---- forward pitch ----
  // Real shoaling waves are asymmetric: steep front face, gentle back. Skewing
  // the phase by sin(theta) steepens the shoreward face, scaled by how close
  // this water is to breaking. Symmetric crests are most of what reads as
  // "moving bump" instead of "wave about to break".
  float skew   = mix(0.0, clamp(excess*0.62, 0.0, 0.8), u_depthMix);
  theta       -= skew*sin(theta);
  float env    = setEnv(rayS(xz), t);
  float env2   = env*env;                  // lulls really disappear
  float q      = 1.6 + 3.2*exp(-abs(d)/55.0)*(0.6 + 0.5*u_xi);
  float amp    = 0.5*Heff * grow * decay * env * shoreFade;
  float h      = amp * crestShape(-theta, q) * 2.0;

  // The mean-surface tilt itself: raise the water by the setup so the
  // shoreline advance/retreat is EMERGENT — the renderers already take
  // max(bed, water), so a higher sheet simply wins farther up the sand.
  // Physical metres here; the trailing VIS multiply exaggerates it exactly
  // as much as the waves that cause it, keeping the two visually consistent.
  h += lift;

  // the boil: fixed upwelling over a shallow rock beside the takeoff —
  // glassy dome, chop suppressed, waves kink slightly over it
  float boilX = -22.0;
  float boilZ = -coastCurve(boilX) - 8.0;   // 8 m seaward of the break contour
  vec2 boilPos = vec2(boilX, boilZ);
  float boil = exp(-dot(xz - boilPos, xz - boilPos)/(2.0*5.5*5.5));
  h += 0.10*u_H0*boil*(0.8 + 0.2*sin(t*0.7));

  // wind chop: broadband local texture, killable; the boil slicks it flat
  float chopG = u_chop * (1.0 - 0.9*boil);
  h += chopG * 0.22 * (vnoise2(xz*0.11 + vec2(0.0, t*0.6)) - 0.5)
     + chopG * 0.10 * (vnoise2(xz*0.31 - vec2(t*0.9, 0.0)) - 0.5);

  // time since last crest passed this point
  float tSince = mod(theta, 2.0*PI)/w;
  float tau = max(u_tau, 0.5);

  // pocket: crest currently crossing the break line — the zipper's locus.
  // The legacy 22 m bell reads as a raised ridge from the cliff. Structural
  // mode contracts it to a few posts so the face/lip transition has a visible
  // hinge rather than a broad cosmetic glow.
  float crestNear = smoothstep(0.55, 0.98, cos(theta));
  // CURL FOOTPRINT ~ SIZE (2026-08-14, #pock=0 A/B): SIZE_AUDIT scaled the
  // crash's BRIGHTNESS with sheltered height but the pocket's spatial extent
  // stayed a constant bell, so from altitude a 2.5 m day carried the same
  // curl zone as a 0.7 m day and "curl scales with size" failed the
  // screensaver read. Same calibration contract as sizeAmp/sizeFoam: factor
  // is exactly 1.0 at the 1.5 m model-card day at the shelter anchor, gated
  // by u_depthMix so synthetic presets are untouched.
  float pockS = mix(1.0, clamp(u_H0*shelterAt(x)/1.5, 0.70, 1.50), u_depthMix*u_pockSize);
  float pocketLegacy = exp(-(d*d)/(2.0*(22.0*pockS)*(22.0*pockS)));
  float pocketCompact = exp(-(d*d)/(2.0*(7.5*pockS)*(7.5*pockS)));
  pocket = crestNear * mix(pocketLegacy, pocketCompact, clamp(u_breakShape, 0.0, 1.0))
         * env2 * reef;
  // unbroken crest lines (approaching swell stays legible from above)
  crest = crestNear * (1.0 - brk) * env2;

  // Legacy keeps a static symmetric mound on the break line. Structural mode
  // transfers that mass into the shared lifecycle: a compact impact at the
  // moving front, followed by a lower aerated bore and a foam train behind it.
  float shape = clamp(u_breakShape, 0.0, 1.0);
  float boreBandLegacy = brk * env2 * exp(-abs(z - zb)/9.0);
  vec4 life = breakerLifecycleAtX(x, t);
  float frontWidth = 2.8 + 0.90*life.x;
  float frontBand = exp(-0.5*pow((z - life.y)/frontWidth, 2.0));
  float impactBand = frontBand*life.z;
  float boreBand = frontBand*life.w;
  float trailStart = smoothstep(zb - 2.0, zb + 1.5, z);
  float trailEnd = 1.0 - smoothstep(life.y - 1.5, life.y + 2.5, z);
  float trailBand = trailStart*trailEnd*life.w;
  float moundNoise = 0.75 + 0.25*vnoise2(vec2(x*0.2, t*0.8));
  float legacyMound = 0.30*u_H0*boreBandLegacy*moundNoise;
  float structuralMound = u_H0*(0.62*impactBand + 0.27*boreBand)*moundNoise;
  h += mix(legacyMound, structuralMound, shape);

  // SIZE_AUDIT open item 1: the whole foam block was H0-free, so whitewater
  // amount and brightness were identical at every size. This factor scales the
  // H0-free foam terms (legacy path + aftermath residue) with swell height;
  // the structural bands get the identical factor via sizeAmp inside
  // breakerLifecycleAtX, so it must NOT be applied to them a second time (see
  // the foam mix below). CALIBRATION CONTRACT (amended for H_eff): at the
  // H0 = 1.5 m model-card day the factor is exactly 1.0 AT THE REEF ANCHOR
  // (shelterAt(SHELTER_X0) == 1); away from the anchor it carries the same
  // sheltering gradient as the wave it foams on. Gated by u_depthMix like the
  // other size routes (synthetic presets untouched).
  float sizeFoam = mix(1.0, clamp(u_H0*shelterAt(x)/1.5, 0.55, 1.6), u_depthMix);

  // Legacy whitewater: broken into shore-normal streaks (never a solid sheet).
  // 6c CHURN FIX (2026-08-13): tSince resets every period, so no decay clock
  // reaches the measured 24 s Lagrangian e-fold — that number was the noise
  // LATTICES, whose old sideways creep (0.4-0.5 m/s over 20-36 m cells) let
  // the foam pattern persist 50-100 s while real whitewater is re-written by
  // every wave. The aftermath lattices now advect SHOREWARD at bore-ish but
  // deliberately DIFFERENT speeds (3.2 / 5.0 / 4.0 m/s): the differential
  // slip is what decorrelates the pattern in a co-moving frame on a ~2-tau
  // timescale — same-speed advection would just freeze it into the tracker.
  // ISOTROPIC, settled 2026-08-13 after three live reports and one
  // overcorrection. The original 6x36 m shore-normal cells smeared sideways
  // from any along-coast camera; the along-crest rotation that replaced them
  // BARBER-POLED — a 2:1 x-elongated lattice advecting shoreward inside a
  // diagonal band reads as foam sliding sideways along the band, and in
  // nadir stills as horizontal smear (Andy caught both). A square cell is
  // the only texture that cannot imply a direction; the crest-parallel
  // organization belongs to the BANDS, not the lattice inside them.
  // "Never a solid sheet" survives — 10 m cells still break the sheet.
  float streaks = 0.45 + 0.55*vnoise2(vec2(x*0.10, (z - 3.2*t)*0.10) + vec2(1.7, 0.0));
  float legacyFoam = brk * env2 * exp(-tSince/tau) * streaks;
  legacyFoam += boreBandLegacy * 0.85 * exp(-tSince/(0.5*u_T));

  // foam lace: dimmer, longer-lived residue; two octaves so cells don't read blocky
  float laceN = vnoise2(vec2(x*0.09, (z - 5.0*t)*0.10))*0.62
              + vnoise2(vec2(x*0.33, (z - 4.0*t)*0.30))*0.38;
  float lace = brk * env2 * exp(-tSince/(2.4*tau)) * smoothstep(0.45, 0.72, laceN);
  legacyFoam += lace * 0.4;

  // Structural whitewater changes character with age instead of only fading:
  // dense granular impact -> coherent low bore -> perforated trailing lace.
  // Isotropic + advected shoreward (see the streaks comment for the full
  // history: shore-normal smeared, along-crest barber-poled, square settles).
  float clumps = vnoise2(vec2(x*0.22, (z - 3.5*t)*0.22))*0.58
               + vnoise2(vec2(x*0.62, (z - 3.0*t)*0.62))*0.42;
  float impactFoam = impactBand*smoothstep(0.20, 0.66, clumps + 0.28);
  float boreFoam = boreBand*(0.62 + 0.38*streaks);
  float trailFoam = trailBand*(0.34 + 0.48*streaks)
                  * exp(-life.x/max(2.4*u_tau, 1.0));
  float trailLace = trailBand*smoothstep(0.48, 0.73, laceN)
                  * exp(-life.x/max(1.8*u_tau, 1.0));
  // COMET HEAD (2026-08-14, #head=0 A/B): direction from altitude. Along the
  // break line the fragment's tSince EQUALS the zipper's age at that station,
  // so the whitewater band already encodes travel direction — but every
  // existing clock hides it: the impact head (0.42 s ~ 6 m at Vp) is
  // invisible from the drone and the residue clocks (1.6-2.4 tau) are
  // near-flat across a whole band, which is why the hero read saw static
  // chalk stripes. A 2.5 s e-fold on the zipper clock paints each band's
  // down-point end bright with a graded tail: the breakpoint reads as a
  // comet, and the comet points the peel. Confined to ~22 m shoreward of the
  // line so the inner re-breaking field cannot ride it (the 6b argmax null:
  // "fresh" alone lifts head and competitor together — attachment to the
  // LINE is the discriminating signal). breakMask: no comet inside a section
  // gap. sizeFoam here because life.x is a clock, not a height — this term
  // is otherwise H0-free (calibration contract, factor 1.0 at 1.5 m).
  float cometFoam = u_headRead * brk * env2 * exp(-life.x/2.5)
                  * exp(-max(z - zb, 0.0)/22.0) * mask * sizeFoam;
  float structuralFoam = 1.55*impactFoam + 0.84*boreFoam
                       + 0.66*trailFoam + 0.42*trailLace
                       + 0.90*cometFoam;
  // Downstream aftermath residue (2026-08-11). The structural bands above are
  // all clocked by life.w, which hard-zeros at BORE_END_S, and trailBand is
  // capped shoreward at the moving front (life.y) — max extent frontSpeed*3.8 s
  // = 9-16 m. So the wake vanished the instant the bore clock ran out and the
  // wide inner-shelf whitewater field had no structural counterpart. Reuse the
  // legacy long-tau residue terms (already computed above) as an aftermath
  // floor: brk is inside-gated so it covers the whole broken field to the sand,
  // and it decays on tau's clock (tau..2.4*tau), decoupled from the live bore.
  // Coefficients keep it dimmer than the legacy field so the impact head stays
  // the bright foreground event. Do NOT widen BORE_END_S instead — the narrow
  // head is what makes the crash travel; the wake belongs to this residue.
  float residue = lace*0.40 + 0.30*brk*env2*exp(-tSince/(1.6*tau))*streaks;
  // 4a' whitewater ∝ broken AREA (Track 4). Every bright term above is clocked
  // to the bore front or decays fast on tSince, so the WIDTH of the broken
  // zone never reaches the picture: a dropping tide breaks over 1.9-5x more
  // area but the extra margin renders as covered-but-dim pixels sitting under
  // the renderer's foam gate (ROUND2 2026-08-11; measured 1.3-1.8x in bright
  // px). Water whose shoaled height still exceeds the depth limit is actively
  // RE-breaking, so its whitewater should clear the gate across the whole
  // broken band — that is the area signal. The boost stays ON tSince's clock
  // (slower, 1.8*tau) so the between-crest lanes survive and the fragment
  // ager's "the mod() seam is repainted at the crest" assumption still holds.
  // The boost fades out of the SWASH (dep under ~0.85 m): the area signal
  // this term exists for lives in the mid-surf-zone breadth, and the swash
  // already captured one instrument (6b). A steady swash-strip bore field
  // was BUILT AND MEASURED WORSE (2026-08-13): the strip's area is nearly
  // tide-invariant, so it DILUTED the low/high contrast (1.80x -> 1.53x at
  // L>=205, pinned nadir rig) — don't retry it for tide legibility.
  // (A Psi-frozen-zone exclusion lived here for a few hours; the frozen zone
  // itself was the defect and integratePsi no longer freezes — see its
  // header. The depth fade below is the part that was always right.)
  // Keyed to env (not env2): the bore field integrates over recent waves.
  // Coefficient sits under the impact head (1.55) so the crash stays the
  // foreground event; sizeFoam scales it downstream with the other H0-free
  // terms. Gated by u_depthMix like every depth route, u_wwArea is the A/B.
  // Texture reuses clumps (already computed above) rather than sampling new
  // noise: ocean() runs five times per vertex via choppyPos's FD, and the
  // renderer is vertex-bound (662c8c1), so the boost adds zero noise calls.
  // Texture: purpose-built ADVECTED noise, not streaks and not clumps.
  // streaks is 6x36 m shore-normal anisotropic by design and at this term's
  // amplitude read as cross-crest rain-streaks from the point camera (Andy,
  // 2026-08-13 — the M1 critique's artifact class, why foamBumpH rotates its
  // lattice). clumps drifts (+0.13, -0.38) m/s — gently SEAWARD — so the
  // sustained field's texture crawled against the shoreward-rushing fronts
  // and the foam read as coming from the wrong direction (Andy, same night).
  // Real whitewater rides the bore: advect the lattice shoreward at 4.5 m/s,
  // between sqrt(g*h_b) ~ 4.3 and the measured 4.03-5.50 m/s band (6c).
  // Coefficient 0.65 -> 0.48 compensated streaks' ~0.72 mean when it left.
  float boreTex = vnoise2(vec2(x*0.16, (z - 4.5*t)*0.16));
  float reBrk = smoothstep(1.02, 1.35, excess) * brk;
  float swashF = smoothstep(0.85, 0.55, dep);
  residue += u_wwArea * u_depthMix * 0.48 * reBrk * env * exp(-tSince/(1.8*tau))
           * (0.55 + 0.45*boreTex) * (1.0 - swashF);
  // Size scaling applies ONCE per term. impactBand/boreBand/trailBand already
  // carry sizeAmp inside life.z/life.w (breakerLifecycleAtX), so multiplying
  // structuralFoam by sizeFoam again made foam quadratic in H0 — down to x0.30
  // at the 0.55 clamp on sub-1.5 m presets. sizeFoam now multiplies only the
  // H0-free terms: the whole legacy path and the residue floor. CALIBRATION
  // CONTRACT: both factors are exactly 1.0 at the H0 = 1.5 m model-card day,
  // so the size-invariance calibration is preserved either way. Lip and crumb
  // stay xi-owned below.
  foam = mix(legacyFoam*sizeFoam, structuralFoam + residue*sizeFoam, shape);

  // pocket spray: whitewater thrown at the zipper itself, heavier when plunging
  // Structural mode keeps this as a thin lip edge; the separate spray pass owns
  // the airy volume, so the surface itself does not turn into a white wall.
  float lipFoam = pocket * (0.45 + 0.75*smoothstep(0.3, 1.4, u_xi));
  foam += lipFoam*mix(1.0, 0.52, shape);

  // spilling crumb: low-xi waves dribble foam down the face before fully breaking
  float crumb = crestNear * (1.0 - brk) * env2
              * exp(-max(d, 0.0)/28.0) * smoothstep(0.55, 0.2, u_xi);
  foam += crumb * 0.6 * (0.6 + 0.4*vnoise2(xz*0.4 + vec2(t*0.3, 0.0)));

  foam = clamp(foam, 0.0, 1.0);

  // along-crest texture so whitewater isn't a uniform bar
  foam *= 0.72 + 0.28*vnoise1(x*0.045 + 3.1);

  // surfer's wake: a bright pencil line trailing along the face
  if (u_surfer > 0.5) {
    vec4 s = surferState(t);
    float behind = smoothstep(s.x + 2.0, s.x - 6.0, x) * smoothstep(s.x - 80.0, s.x - 30.0, x);
    // the ride line: 11 m seaward of whatever break line is LIVE. breakLine()
    // already mixes authored vs baked-emergent by u_breakMix, so the wake
    // follows the M4 line when it is on instead of the pre-M4 authored contour
    // (which sat sideways of the actual peel at mapped spots).
    float pathZ = breakLine(x) - 11.0;
    float wake = behind * exp(-pow(z - pathZ, 2.0)/(2.0*3.0*3.0));
    foam = clamp(foam + wake*0.75, 0.0, 1.0);
  }

  h *= VIS;
  if (!(h == h)) h = 0.0;  // NaN guard
  return h;
}

float oceanH(vec2 xz, float t){ float f,p,b,c; return ocean(xz, t, f, p, b, c); }
`;
