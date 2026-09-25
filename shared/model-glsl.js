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
// Renderer anatomy flags also gate the shared experimental impact landing.
uniform float u_curl;        // on by default; #curl=0 restores throw/drop
uniform float u_onset;       // causal overturn; #onset=0 restores held pose
uniform float u_classicWave; // #classic=1 authored hook, default off
uniform float u_lipDescent;  // #classic=1&descent=1 contact experiment, default off
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
uniform float u_splash;     // #splash=1: concentrated impact spray + surface
                            // aeration on the shared lifecycle bell.
// #roller=: the TRANSPORTED crash — an impact deposit at the curtain landing
// plus a roller carried down-face/down-line with the bore, both seeded by
// impactSourceAt() on the lifecycle clock. Gain. EVERY roller symbol is
// compiled only under #define ROLLER (main.js sets it on the grid material
// when the page boots with #roller): a uniform branch on u_roller was measured
// to move 1-3 pixels of the default frame by 1-12 levels against the pristine
// tree (compiler contraction around the inserted blocks), so the default build
// must compile the pristine TEXT, not merely the same values.
#ifdef ROLLER
uniform float u_roller;
#endif
// #bore=: the AERATED WEDGE — the spilling breaker's whitewater as a body on
// the front face behind the head (Longuet-Higgins & Turner 1974's turbulent
// wedge, Duncan 1999's bulge), riding WITH the crest, thinning down-point with
// the carrier. Gain. Same build discipline as ROLLER: every bore symbol is
// compiled only under #define BORE (main.js sets it when the page boots with
// #bore), so the default build compiles the pristine text and is byte-identical.
// See boreWedgeAt() and docs/research/BORE_2026-09-24.md.
#ifdef BORE
uniform float u_bore;
#endif
uniform float u_pockSize;   // 1 = pocket footprint scales with H_eff, 0 = #pock=0 A/B revert
uniform float u_hump;       // head hump gain, #hump= (EXPERIMENT 2026-09-10, default 0 = off)
uniform float u_moundH;     // structural impact/bore mound height multiplier, #moundh= (shipped 0.5 since 2026-09-10; 1 = pre-fix)
uniform float u_frontW;     // structural front band width multiplier, #frontw= (EXPERIMENT 2026-09-10, default 1)
// ---- sections own the crash (2026-09-24, SECTION_CURL_2026-09-24.md) ----
uniform float u_gapFix;      // 1 = the pocket and the crest honour breakMask (#gapfix=1); 0 = shipped
uniform float u_sectionCurl; // 1 = xi is local: spilling head, plunging where a section shuts (#sectioncurl=1)
uniform float u_sectionXi;   // the xi a shutting section rises to under #sectioncurl (#sectionxi=, default 0.95)
uniform float u_lipSize;    // 1 = the pocket->whitewater path carries foamSizeAt() like the
                            // rest of the foam field, 0 = #lipn=0 A/B revert (size-free lip)
uniform float u_stripeLife; // 1 = per-stripe along-crest lifecycle clock (#slife=1), default 0
uniform float u_pitchOdd;   // 1 = #pitch=0 A/B revert: the pre-2026-08-18 ODD skew map
                            // (and its q schedule), which cannot pitch at all. 0 = shipped.
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
// SHIPPED (WEB_THREE_SPEC.md "M6 part 3, closed out"): default ON since
// 2026-08-13 on bed-backed sites — rider, audio crest solve and setEnv group
// speed all run the same baked phase authority (main.js psiPhaseFn). #psi=0
// is the frozen-LAM A/B revert. A prior version of this note said "off by
// default, water only"; it outlived the flip by 11 days and seeded a spec
// (docs/PSI_SPEC.md) proposing work that had already shipped — comments about
// staging state go stale, so this one now names the closeout record instead.
uniform sampler2D u_refrTex;
uniform float u_psiMix;     // 0 = frozen-LAM plane wave, 1 = baked Psi
uniform float u_shelterMix; // 1 = H_eff sheltering field, 0 = flat H0 (#shelter=0)
uniform vec2 u_refrZ;       // contour-z range the table spans
uniform vec2 u_refrPsi;     // decode window for Psi, radians
uniform float u_refrKappa;  // alongshore wavenumber, rad/m (Snell invariant)

// ---------- set-envelope anchor (2026-08-18, the 6b arm diagnosis) ----------
// Stage-median rayS of the LIVE break line, metres (main.js, per frame; 0 on
// the authored fallback, whose line is contourZ = 0 where rayS ~ 0 already).
// The group envelope's spatial reference was implicitly the AUTHORED contour:
// cos(2pi*dF*(t - s/cg)) peaks at s = 0 at t = 0, and the authored line lay at
// s ~ 0. M4 moved the shipped line 74-247 m SEAWARD (s = -74..-247 at Sewers)
// and the anchor never followed — then the 6a cg unification (3.00 -> 11.71
// m/s, 2026-08-13) stretched the band pattern 3.9x. Measured consequence
// (scripts/probe_arm_terms.mjs): at the house capture clocks sim 36-54 the
// set peak sits ~490 m shoreward of the line, env at the line is 0.00-0.24,
// and every line-attached foam term (all env^2-gated) is <= 0.055 before any
// material threshold — the peel arm cannot light at the hero state while the
// env^1-keyed swash residue still can, which is exactly the 6b luma split.
// u_setRef re-references the envelope to the line; u_setAnchor is the #arm=0
// A/B revert (0 = legacy phase, bit-identical).
uniform float u_setRef;
uniform float u_setAnchor;
// Second arm factor, same #arm family: 1 = comet tail measured in metres
// behind the traveling breakpoint (see the cometFoam block), 0 = the legacy
// 2.5 s temporal tail. #arm=anchor / #arm=tail bisect the pair.
uniform float u_armRead;

// ---------- set-envelope modulation depth (2026-08-18, the lull defect) ------
// setEnv was 0.5 + 0.5*cos(...): 100% modulation, floored at EXACTLY ZERO.
// Measured consequence (scripts/measure_wave_scale.mjs, secondpeak x = 80 over
// one 166.7 s beat): drawn H swings 15.7x, 6.30 m down to 0.40 m, and the
// height exaggeration swings 3.21x down to 0.22x — for 3 of 10 sampled clocks
// the render draws water FLATTER than the physical sea it claims to be (drawn
// H/L 0.006-0.013 against a physical 0.021). For a thing built to be watched
// unattended that is dead water for a large part of every cycle.
//
// An exact zero is the unphysical part. A two-component beat has envelope
// amplitude ranging |a1 - a2| .. (a1 + a2), so the envelope FLOOR IS the
// component amplitude ratio, floor = |a1 - a2|/(a1 + a2), which vanishes only
// when the two components are EXACTLY equal — a coincidence, not a sea state.
// The floor is therefore derivable rather than tunable, and it is derived from
// this repo's own 25-year SC116 spectra in docs/research/PP_SPECTRAL_SETS.md
// section 7 by two independent estimators that agree:
//   * adjacent-band amplitude ratio at the model's own dF -> floor 0.075-0.163;
//   * matching the measured LULL DUTY CYCLE (time fraction below a threshold
//     inside one 1/dF window, 108,000 windows) -> floor 0.135-0.171.
// Landed value 0.15, i.e. modulation depth m = 0.425. See the doc for what the
// spectra could NOT support and for the uncertainty this number carries.
//
// FORM: a modulation depth, NOT a clamp. max(env, floor) would flatten the
// waveform bottom and change the shape of the cadence; (1-m) + m*cos keeps the
// envelope sinusoidal, leaves the PEAK at exactly 1.0 for every m (so the set
// peak — already too steep, same measurement — is untouched by construction),
// and raises only the trough, to 1 - 2m.
// #env=0 restores m = 0.5 and the zero floor, bit-identically.
uniform float u_setDepth;

// ---------- crest-clock continuity (2026-08-18, the hard-foam-edge report) ---
// 1 = the crest clock is ramped across its wrap (shipped), 0 = the raw
// sawtooth (#wrap=0 A/B revert, bit-identical to the pre-fix build).
// See crestClockS() for the measurement.
uniform float u_crestWrap;
// Wrap-ramp WIDTH override, seconds (#wrapw= metres / #wrapl= fraction of LAM,
// EXPERIMENT 2026-09-01, plan-view hard edge). 0 = the shipped CREST_WRAP_S
// expression, bit-identical; > 0 replaces the width and lifts the quarter-
// period clamp to 0.75 T so a sweep can reach ~0.6 LAM. Always seconds here:
// the metres -> seconds conversion (at c = LAM/T) lives in the JS flag parser.
uniform float u_wrapS;
// ---- brow sharpening (#brow=, EXPERIMENT 2026-09-05; 0 = the shipped ground).
// OFF reproduces the pre-flag frame to <= 1 level: 42 of 1,228,800 pixels move
// by one level on one channel at the Lookout pose, which is compiler scheduling
// around the added uniform, not a path change -- browSharpen early-returns.
// Measured, not assumed; the #lip flag carries the same caveat for the same
// reason, while #birth's untouched uniform branch is 0 differing pixels. The NCEI 1/3" grid spends 32 m of horizontal
// run on the 11.7 m marine-terrace cliff at 38th Avenue -- a 20 deg ramp where
// the photographs show a near-vertical face over talus (measured along the
// #cam=lookout view ray, research/SCALE_AND_BROW_2026-09-05.md section 2). The
// consequence is not cosmetic: at the fixture pose the frame's bottom edge
// first meets terrace-level ground about 3 m out, and on a ramp that ground
// has already fallen away, so a cliff camera has no near field at all and the
// riprap band and the wave-cut bench have nothing to sit on.
//
// This is a LAND-ONLY monotone remap of elevation, applied at the end of
// bedElevM so every consumer -- vertex land test, fragment shading, the seabed
// mesh, waterDepthM -- sees the same ground by construction, the same reason
// the extrapolation ramp lives there. It is not a bed change: nothing at or
// below BROW_LO metres above still water is touched, so the surf zone, the
// waterline, the swash band and the held 2 m coastal plain are all identical,
// and nothing the model computes from depth can move.
uniform float u_brow;          // 0 = off; 1 = full sharpening
uniform float u_browPlateauM;  // terrace height above still water, metres
// ---- the birth ramp (#birth=, EXPERIMENT 2026-09-01; all three default 0 =
// the shipped frame, bit-identical). Whitewater deposit develops over a finite
// distance behind the zipper head instead of appearing at full strength on
// the line x = x_head. See birthWeight() / birthAge() below.
uniform float u_birthW;     // ramp width as a fraction of LAM; 0 = off
uniform float u_birthLead;  // fraction of the ramp placed AHEAD of the head (0 = one-sided)
uniform float u_birthRag;   // noise jitter of the ramp position, in ramp widths

// ---------- constants ----------
// GPU SOURCE OF TRUTH for the shared physics constants. GLSL cannot import, so
// the JS side carries exactly one mirror of each: G and GAMMA live in
// web-three/js/dispersion.js, LAM in web-three/js/model-js.js. Change a value
// here and there together, nowhere else.
const float PI  = 3.14159265;
const float G   = 9.81;
const float LAM = 90.0;   // display wavelength, m (shoaled ~15 s swell at ~8 m depth)
// Visual amplitude gain: physical heights are nearly invisible at landscape
// scale; exaggerate, don't lie about kinematics. Every height term in this file
// is PHYSICAL up to the last multiply -- which is why the break criterion's own
// comment warns that letting VIS into the threshold made it ~3x too eager.
//
// A uniform since 2026-09-05 (#vis=<gain>) rather than a const, so the matched
// Lookout pose can price it against the photograph it exaggerates
// (research/SCALE_AND_BROW_2026-09-05.md section 1). The #define keeps all ~60
// call sites reading VIS, so the diff is the declaration and nothing else.
// Default 3.2 = the shipped look, unchanged.
uniform float u_vis;
#define VIS u_vis
const float GAMMA = 0.78; // depth-limited breaker index H/h (McCowan solitary-wave
                          // limit; Battjes/Nairn put field values ~0.7-0.9)
// Height attenuation per LOCAL wavelength after breaking. This is the one
// authored closure for dissipation in a kinematic model with no fluid solver:
// at full break weight, carrier height retains exp(-0.35) = 70% after one
// wavelength and 50% after two. The depth-limited cap and shoreFade still own
// the shoaling profile and final swash extinction respectively.
const float BREAK_HEIGHT_ATTEN_PER_L = 0.35;

// Breaker lifecycle in SECONDS, deliberately independent of peel speed. The
// zipper kinematics stay in rayS()/swellPhi(); these only decide how much of
// the already-broken line remains visible behind its moving head.
const float CRASH_PEAK_S = 0.42;
const float CRASH_SIGMA_S = 0.20;
const float BORE_FADE_START_S = 2.60;
const float BORE_END_S = 3.80;
// The curtain lands CURT_REACH*h_crest shoreward of the crest source point.
// Owned by the model since 2026-09-01 because two consumers read it — the
// falling sheet (shaders.js CURTAIN_VERT) is drawn down to it, and the
// transported crash (impactSourceAt, below) is seeded at it. One constant, or
// the deposit lands beside the curtain instead of under it. AUTHORED, in the
// wave's own length: the classical plunging-jet picture puts the landing about
// a face height ahead; the Mead & Black vortex-ratio refinement would replace
// it (MODEL.md 1.4).
const float CURT_REACH = 0.9;
// Transported-crash timescales, SECONDS (rate independence: every reach below
// is a speed in m/s times one of these, never a frame count). The roller must
// be zero again before the lifecycle clock wraps at T (shortest preset 12 s)
// and before breakerCausalGate begins at 0.72*T, or the tail of one crest's
// roller would be handed to the next carrier — the "teleport" the acceptance
// gate forbids. CRASH_PEAK_S + ROLLER_END_S = 5.42 s clears both.
#ifdef ROLLER
const float DEPOSIT_TAU_S = 0.55;   // impact deposit e-fold at the landing
const float ROLLER_TAU_S = 1.60;   // roller mass e-fold while it travels
const float ROLLER_END_S = 5.00;   // smooth hard end of the roller's life
// The SPLASH-UP (Peregrine 1983): the jet's landing throws a sheet of water
// UP, of the order of the breaking height. Its peak is this fraction of the
// depth-limited ceiling (breakerCeilM, the number the bend and the curtain
// size off); its LIFE is not a constant — the sheet is a ballistic in physical
// metres under G, so a bigger wave throws higher AND longer without a second
// duration knob. Dimensionless fraction, in the wave's own length.
const float SPLASHUP_FRAC = 0.70;
// The roller is a bore with volume: its mound is this fraction of the
// EMITTER's physical ceiling (breakerCeilM/VIS). Replaces the first cut's
// 0.16*u_H0, which sized the mound off the deep-water swell instead of the
// breaking scale at the station that threw it.
const float ROLLER_MOUND_FRAC = 0.35;
#endif

// The pitching lip is a short event, not a held pose. Its arc angle grows
// quadratically into impact (constant angular acceleration), then the bend
// releases over 1.5 impact sigmas so splash/bore can own the landing. Zero at
// both lifecycle ends keeps the modulo crossing continuous.
float breakerCurlCycle(float ageS){
  float u = clamp(ageS/max(CRASH_PEAK_S, 1e-3), 0.0, 1.0);
  float accelerate = u*u;
  float release = 1.0 - smoothstep(CRASH_PEAK_S,
                                   CRASH_PEAK_S + 1.5*CRASH_SIGMA_S, ageS);
  return accelerate*release;
}
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
// Seconds after boot at which the first set CRESTS on the break line. The
// envelope's time origin is unowned authorship (no physics constrains which
// instant of the set cycle t = 0 lands on); declared so the deterministic
// house capture window (sim 36-54: the OG hero state and every pinned
// instrument clock) samples an active set at the line — the regime those
// clocks were chosen in before the 6a cg fix moved the sets out from under
// them. Cadence (1/dF) and rate independence untouched: pure seconds.
// JS twin: SET_ANCHOR_S in model-js.js — keep numerically identical.
const float SET_ANCHOR_S = 45.0;
// Width of the crest's foam injection, seconds. See crestClockS(). No JS
// twin: model-js.js carries the height/envelope path, not the foam clocks.
const float CREST_WRAP_S = 2.4;

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

// THE foam-field size factor (SIZE_AUDIT calibration contract, one definition).
// Exactly 1.0 at the H0 = 1.5 m model-card day AT THE REEF ANCHOR
// (shelterAt(SHELTER_X0) == 1); away from the anchor it carries the same
// sheltering gradient as the wave it foams on. Clamped [0.55, 1.6] so a tiny
// day still shows whitewater and a huge one does not blow out, and gated by
// u_depthMix so the synthetic stage is untouched.
//
// This was three copies of one expression: ocean()'s sizeFoam, the lifecycle's
// sizeAmp, and — by omission — the two pocket->whitewater terms that had no
// copy at all (see the lipFoam block and GRID_FRAG's pocket foam floor). It is
// named here because "which terms are inside the contract" is the invariant
// that broke; a factor you cannot point at is a factor a new term forgets.
float foamSizeAt(float x){
  return mix(1.0, clamp(u_H0*shelterAt(x)/1.5, 0.55, 1.6), u_depthMix);
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

// THE SECTION FIELD, once. breakLine() pulls the line seaward by
// u_sections*55*2*sectionNoise metres where this is negative (a shallow patch
// meets the break criterion early); #sectioncurl reads the same field to
// decide where the crest shuts. One noise, two readers, no second authority
// on where sections are. Returns vnoise1 - 0.5, in [-0.5, 0.5].
#define SECTION_NOISE(xx) (vnoise1((xx)*0.02+7.3) - 0.5)
float sectionNoise(float x){
  float xx = mix(x, abs(x), u_aframe);
  return SECTION_NOISE(xx);
}
// d(sectionNoise)/d(xx), per metre of the peel coordinate, analytic:
// vnoise1(p) = mix(h(i), h(i+1), f*f*(3-2f)) with p = xx*0.02 + 7.3, so the
// slope is (h(i+1)-h(i)) * 6f(1-f) * 0.02. Exact for the field breakLine
// reads; no finite difference, no second sample of the noise.
float sectionNoiseSlope(float x){
  float xx = mix(x, abs(x), u_aframe);
  float p = xx*0.02 + 7.3;
  float i = floor(p), f = fract(p);
  return (hash11(i+1.0) - hash11(i)) * 6.0*f*(1.0-f) * 0.02;
}
// Where a section is SHUTTING, 0..1 (#sectioncurl=1 only; the default path
// never calls it). CURL_TRUTH_2026-09-24 1.2 B / 3: the field's one crash is
// a section closing -- a 1-2 face-height stretch walls up, a half-face curtain
// drops, a forward plume becomes bore in ~1.5 s -- and the steady head spills.
// The crest is "about to close ahead of the head" where the break line STEPS
// SEAWARD going down-point: breakLine pulls the line seaward by
// u_sections*110*min(sectionNoise, 0) m, and on the LEADING flank of such a
// pull (pull increasing with xx, the peel coordinate) the crest -- which
// arrives shoreward, in the order of z_b -- reaches the stations ahead of
// the head before or with the head itself, so that stretch breaks nearly at
// once: a closeout inside the peel, the section "walling up ahead". The core
// of the pull and its trailing flank resume the peel's arrival order, already
// broken, and read as bore; they are not the event. Plunging is the honest
// character for the flank: the break sits on the patch's own steep edge, and
// xi is proportional to tan(beta). Authored numbers:
//   slope ramp 0.25->0.65 of the field's steepest possible flank: slope is
//     d(pull)/d(xx) times the half-lattice 25 m (vnoise1 lattice 1/0.02), so a
//     full 0->1 swing over half a lattice reads 1.5; 0.65 is what a lobe of
//     0.6 amplitude -- Second Peak's one on-reef lobe (x 20-48) -- reaches at
//     its steepest, and 0.25 is below any flank that pulls the line a
//     metre. The shutting stretch is one quarter-lattice, ~12 m.
//   pull gate smoothstep(0, 0.1): the flank counts only once the line is in
//     fact pulled (breakLine's min(sec, 0) clips positive noise).
//   sigma_h ramp 0.05->0.15 -- which spots ARE section spots. Anchored on the
//     one spot with footage: the field clip is Second Peak (sigma_h 0.15) and
//     its one crash is a section shutting, so 0.15 is full weight; Privates'
//     0.05 is the DEM's peel with no reef patch (MODEL 2.1) and shuts nothing,
//     the same step(0.05) that arms breakLine's shift; the bank's 0.10 spots
//     (Jack's, Sharks) sit at half weight. Sewers/First Peak/Hook are full.
float sectionShut(float x){
  float n = sectionNoise(x);
  float pull  = clamp(-2.0*n, 0.0, 1.0);                     // fraction of 55*u_sections m
  float slope = max(-2.0*sectionNoiseSlope(x), 0.0) * 25.0;  // pull steepening with xx
  return smoothstep(0.25, 0.65, slope) * smoothstep(0.0, 0.1, pull)
       * smoothstep(0.05, 0.15, u_sections) * step(0.05, u_sections);
}
// EFFECTIVE IRIBARREN at station x. Default (u_sectionCurl = 0): u_xi, the
// per-spot constant, unchanged everywhere -- every consumer below reads this
// and stays byte-identical. Under #sectioncurl=1 the steady head falls to a
// spilling value (min(u_xi, 0.42): below the Battjes 0.45 foot of the shared
// plunge ramp, inside the bed's own xi_0 bracket 0.23-0.44 at every card
// state, CURL_TRUTH 3) and rises where a section shuts to max(u_xi,
// u_sectionXi). 0.95 gives plunge 0.68: a curtain that draws (the curtain's
// 0.30-turn gate opens at plunge ~0.5, rollerContactGain's calibration) but
// not Sewers' full 0.96 -- the field's curtain is 0.5-0.6 H_f with the lip
// <= 0.3 H_f ahead of the face (1.3), a modest plunge, not a tube. Sewers
// (1.15) keeps its authored value at its sections. The station's OWN
// lifecycle clock (breakerLifecycleAtX age) then times the event: wall while
// the bend accelerates to CRASH_PEAK_S, curtain/impact there, release over
// 1.5 sigma, bore after -- no new clock, no new break authority.
// BUILD flag, the #roller / #tube precedent: a default boot compiles the
// pristine text. Routing u_xi through a function-and-branch was measured to
// move 4-6 default pixels by 1/255 and the probe's displaced z by one float
// ulp against pristine main (ANGLE-Metal contracts the inlined arithmetic
// differently), so under no define the two names ARE the shipped expressions,
// character for character, and every consumer below preprocesses back to
// smoothstep(0.45, 1.25, u_xi) / u_xi. u_sectionCurl is the live gate inside
// a SECTION_CURL build (__pointbreak A/B in one session).
#ifdef SECTION_CURL
float xiAt(float x){
  if (u_sectionCurl <= 0.5) return u_xi;
  float xiSpill = min(u_xi, 0.42);
  float xiShut  = max(u_xi, u_sectionXi);
  float xi = mix(xiSpill, xiShut, sectionShut(x));
  if (!(xi == xi)) xi = u_xi;                                  // NaN guard (house rule)
  return xi;
}
// The one plunging blend (Battjes: plunging from ~0.5), at a station. Every
// consumer that used to read smoothstep(0.45, 1.25, u_xi) reads this, so the
// profile, the bend, the curtain gate, the impact bell, the spray and the foam
// inherit a local xi through one function.
float plungeAt(float x){ return smoothstep(0.45, 1.25, xiAt(x)); }
#else
#define xiAt(x) u_xi
#define plungeAt(x) smoothstep(0.45, 1.25, u_xi)
#endif

float breakLine(float x){
  float xx = mix(x, abs(x), u_aframe);
  // sections: shallow patches meet the break criterion early (z_b pulled seaward)
  float sec = u_sections * 55.0 * SECTION_NOISE(xx) * 2.0;
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

// Brow sharpening (#brow=). Monotone remap of height-above-water inside the
// band [BROW_LO, u_browPlateauM], identity outside it in BOTH directions: at or
// below BROW_LO nothing moves (the beach, the talus, the swash and every
// submerged sample), and at or above the plateau nothing moves either (inland
// ground that genuinely rises higher is not flattened). Inside, a power curve
// pushes mid elevations UP, which -- on a profile that is roughly linear in
// distance -- extends the terrace seaward and compresses the fall into a short
// steep face. That is the shape a marine terrace actually has and the shape the
// 10 m posts cannot resolve.
const float BROW_LO = 2.0;     // m above still water; below this, untouched
float browSharpen(float e){
  if (u_brow <= 0.0) return e;                       // untouched when off
  float a = e - u_waterLevel;
  float top = max(u_browPlateauM, BROW_LO + 0.5);
  if (a <= BROW_LO || a >= top) return e;
  float t = (a - BROW_LO) / (top - BROW_LO);
  float s = pow(t, mix(1.0, 0.35, clamp(u_brow, 0.0, 1.0)));
  return u_waterLevel + BROW_LO + (top - BROW_LO) * s;
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
  float ground = mix(landHold, e - 0.045 * dO, oceanic);
  return browSharpen(ground);
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
// needs no state: ride the shoreward/front face of the crest, pumping between
// bottom turn and top turn. Returns (x, z, vx, vz).
//
// LEGACY CALLERS ONLY (2026-09-19). web-three splices MODEL_GLSL wholesale, so
// this function is COMPILED into its shaders, but nothing there calls it: its
// only call sites are the web/ raymarcher (web/js/shaders.js:117, :141, :159).
// web-three reads the rider through u_surferPos, which main.js uploads every
// frame from the one JS solve (m4RideSolve).
//
// WHY THAT MATTERS, and why tests/glsl-rider-authority.test.js pins it: the
// arm below u_breakMix > 0.5 is a KINEMATIC twin — it puts the rider on the
// breakpoint by closed form. That is true today only because the JS rider is
// also kinematic. Once the rider has his own velocity state and can fall behind
// the peel, this body becomes a SECOND, DISAGREEING source for "where is the
// surfer" (MODEL.md 4.5). It is dormant, not safe. A new web-three call site
// would wake it, so the test forbids one.
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
  float faceOff = 11.0 + 5.0*pump;         // metres shoreward onto the front face
  float xfold   = mix(xs, abs(xs), u_aframe);
  // Target the depth-derived breaking locus, then SNAP TO THE NEAREST CREST.
  // Shifting z alone is wrong: the offset is not a multiple of the wavelength,
  // so it drops the rider between crests (measured -1.65 m — a trough — at
  // Sewers with a 133 m offset). Crests satisfy theta = 0 mod 2pi, so solve for
  // the nearest n and sit faceOff shoreward of that crest's line.
  // With u_rideOffset = 0 the nearest crest IS the zipper crest by construction,
  // so this reduces exactly to the previous behaviour.
  // All of it in the CONTOUR frame now; convert to world z once, at the end.
  float zcTarget = -u_rideOffset;          // break line is contourZ = 0
  float nz       = floor((w*t - k*(xfold*sp + zcTarget*cp))/(2.0*PI) + 0.5);
  float zcCrest  = ((w*t - 2.0*PI*nz)/k - xfold*sp)/cp;
  float zs       = zcCrest + faceOff - coastCurve(xs);
  // The rider tracks along its own crest, so contourZ is constant along the
  // ride and the only vertical motion is the pump plus the contour's own bow.
  float vz       = -coastCurveSlope(xs)*vx
                 + 5.0*(2.0*PI/6.0)*cos(t*2.0*PI/6.0);
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

// ---------- M6 part 3: local dispersion and the Psi phase field ----------
// Guo (2002) explicit dispersion, k*h = y/[1-exp(-y^1.25)]^0.4 with
// y = omega^2*h/g. MODEL-TWIN of dispersion.js wavenumberAt(): 0.79% max error
// against the exact root, verified in tests/dispersion.test.js. (The previous
// y/sqrt(tanh y) form in bed.js was cited as Guo and is not — 4.98% error.)
float waveNumberAt(float omega, float h){
  h = max(h, 0.05);
  float y = omega*omega*h/G;
  // pow(0, 0.4) is 0 and the divide would blow up; h is floored, but the mesh
  // is unforgiving about NaN so retain a denominator guard as well.
  float den = max(pow(1.0 - exp(-pow(y, 1.25)), 0.4), 1e-4);
  return (y/den)/h;
}

// Exact finite-depth group velocity evaluated with waveNumberAt's existing k:
// cg = n*c, n = 0.5*(1 + 2kh/sinh(2kh)), c = omega/k. The Taylor branch
// removes the 0/0 at very small kh. MODEL-TWIN of dispersion.js
// groupVelocityAt(); tests/dispersion.test.js sweeps their parity.
float groupVelocityAt(float omega, float h){
  h = max(h, 0.05);
  float k = waveNumberAt(omega, h);
  float x = 2.0*k*h;
  float x2 = x*x;
  float xOverSinh = abs(x) < 1e-3
    ? 1.0 - x2/6.0 + 7.0*x2*x2/360.0
    : x/sinh(x);
  return 0.5*(1.0 + xOverSinh)*omega/k;
}

// Green's-law shoaling coefficient. One function shared by ocean(), the
// renderer's crest/curl diagnostics, and the JS twins in dispersion.js.
float shoalingKsAt(float h){
  float omega = 2.0*PI/u_T;
  float cg0 = G*u_T/(4.0*PI);
  return clamp(sqrt(cg0/groupVelocityAt(omega, h)), 0.7, 2.6);
}

float kLocalAt(vec2 xz){
  float omega = 2.0*PI/u_T;
  float k = waveNumberAt(omega, modelDepthM(xz));
  // Off the bathymetry there is no depth to disperse over: fall back to the
  // frozen carrier so synthetic presets and the A-frame are untouched.
  return mix(2.0*PI/LAM, k, u_psiMix*u_depthMix);
}

// Gradual post-break carrier-height loss. The old 1 - 0.68*brk coupled the
// break/foam mask straight into height and removed 68% as soon as the mask
// reached one. A breaking threshold says where dissipation starts, not that it
// has already happened. Distance travelled shoreward of the line supplies the
// missing evolution coordinate, normalized by the wave's own local length so
// shoaled short waves decay over a proportionally shorter run.
float postBreakHeightRetention(float runM, float localWaveLenM, float breakWeight){
  float wavelengths = max(runM, 0.0)/max(localWaveLenM, 1.0);
  float brokenRetention = exp(-BREAK_HEIGHT_ATTEN_PER_L*wavelengths);
  return mix(1.0, brokenRetention, clamp(breakWeight, 0.0, 1.0));
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

// The one set-cycle phase, radians — setEnv and setupLiftM must share it or
// the whitewater and the shoreline breathe disagree about when the set is in.
// tRef re-references the pattern so a set peaks AT THE LIVE LINE (s = u_setRef)
// at t = SET_ANCHOR_S mod 1/dF (see the u_setRef header for the measurement
// that forced this). u_setAnchor = 0 is the #arm=0 A/B revert: tRef = 0
// reproduces the legacy phase bit-identically. cg comes through groupSpeedM
// so #cg=0 and #arm compose: the legacy-cg A/B re-anchors consistently
// (tRef and s/cg move together).
float setPhase(float s, float t){
  float cg = groupSpeedM();
  float tRef = (SET_ANCHOR_S - u_setRef/cg) * u_setAnchor;
  return 2.0*PI*u_dF*(t - tRef - s/cg);
}

// Modulation depth u_setDepth (see its header): peak is (1-m)+m = 1 for every
// m, trough is 1-2m. m = 0.425 -> floor 0.15; #env=0 -> m = 0.5, floor 0.
float setEnv(float s, float t){
  return (1.0 - u_setDepth) + u_setDepth*cos(setPhase(s, t));
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
  float ph = setPhase(rayS(xz), t);                // set-envelope phase at this station
                                                   // (shared anchor — see setPhase)
  // Lag in set-cycle radians: base ~0.9 rad (~24 s of a 167 s cycle) keeps the
  // water level trailing the set that raised it; the +0.8*sin(ph) swing holds
  // the level high after the set peaks and releases it quickly when the next
  // set arrives. Always positive (0.1..1.7 rad), so the response never leads.
  float lagPh = 0.9 + 0.8*sin(ph);
  // Deliberately NOT floored by u_setDepth (2026-08-18). Coherence with the
  // sets is a PHASE property and it is preserved — both come off setPhase — but
  // setup is radiation-stress release from BROKEN waves, and the small waves of
  // a lull do not break, so the piled water really does drain all the way. Also
  // practical: flooring here would shrink the shoreline breathe excursion,
  // which was deliberately raised (0.2 -> 0.3) to survive drone distance.
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
  float plunge = plungeAt(x);
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
  float sizeAmp = foamSizeAt(x);
  float impact = activity*impactAge*(0.18 + 0.82*plunge)*sizeAmp;
  float bore = activity*boreAge*(0.72 + 0.28*(1.0 - plunge))*sizeAmp;
  return vec4(age, frontZ, impact, bore);
}

// Depth-limited DISPLAYED crest height, metres above still water: the wave
// height the water CAN carry, min(H0*Ks, gamma*h), with ~0.8 of it above the
// mean and VIS applied after the physical threshold. This is the body of
// shaders.js crestCeilM — which now calls it — moved here so the model can size
// the crash off the same number the #curl bend and the curtain size off. One
// authority for "how big is the breaking wave here" (MODEL.md 4.5).
float breakerCeilM(float dep, float Ks){
  return clamp(0.8*VIS*min(u_H0*Ks, GAMMA*dep), 0.5, 14.0);
}
float breakerCeilM(vec2 xz0){
  float dep = modelDepthM(xz0);
  return breakerCeilM(dep, shoalingKsAt(dep));
}

// The contact experiment follows the same plunging character as the classic
// crown and ellipse. All consumers must agree when it is enabled, including
// MODEL_GLSL-only fragment passes that place the transported foam.
float classicDescentWeightAt(float x){
  if (u_lipDescent <= 0.5 || u_classicWave <= 0.5 ||
      u_onset <= 0.5 || u_curl <= 0.5) return 0.0;
  return clamp(u_classicWave, 0.0, 1.0)*plungeAt(x);
}

// Geometry and clock of the existing impact event, available to the falling
// curtain even when the optional transported roller is not compiled.
// (landing source z, displayed ceiling, seconds since impact, crest source z).
// impactLandingAt adds roller strength; it does not derive a second landing.
vec4 breakerLandingFrameAt(float x, float t){
  float w    = 2.0*PI/u_T;
  float phi  = swellPhi();
  float zb   = breakLine(x);
  float kk   = kLocalAt(vec2(x, zb));
  float kz   = max(kk*cos(phi), 0.25*kk);
  float zc   = zb + (w/kz)*CRASH_PEAK_S;
  float hC   = breakerCeilM(vec2(x, zc));
  float zL   = zc + CURT_REACH*hC;
  // The classic hook reaches past the old 0.9-height contact. The opt-in
  // receiver is 1.6 crest heights ahead at full plunge, blended by character.
  // Authored in the wave's length and tested on the displaced surface; this
  // is not a physical ratio inferred from the uncalibrated field video.
  float classic = classicDescentWeightAt(x);
  if (classic > 0.0) zL += (1.6 - CURT_REACH)*hC*classic;
  float ageHere = mod(w*t - rayPhase(vec2(x, breakLine(x))), 2.0*PI)/w;
  float tauD = ageHere - CRASH_PEAK_S;
  return vec4(zL, hC, tauD, zc);
}

#ifdef ROLLER
// The lifecycle's impact channel AT ITS PEAK (impactAge = 1): how hard THIS
// station's crest crashes, independent of where in the impact bell we are
// reading. Exactly the factors breakerLifecycleAtX multiplies into life.z —
// set activity, reef window, section mask, plunge character, sheltered size —
// re-read at the EMISSION time so a roller keeps the strength of the event
// that made it while the set envelope moves on underneath.
float breakerImpactPeakAtX(float x, float tEmit){
  float zb = breakLine(x);
  vec2 atBreak = vec2(x, zb);
  float env = setEnv(rayS(atBreak), tEmit);
  float activity = env*env*reefWindow(x)*breakMask(x);
  float plunge = plungeAt(x);
  return activity*(0.18 + 0.82*plunge)*foamSizeAt(x);
}

// ---------- the transported crash (#roller, 2026-09-01, default OFF) --------
// NEXT_INVESTMENTS 2, slices 1-3. The lip lands (curl -> curtain -> impact
// bell) and then nothing is left of the landing: #splash was measured as
// ~0.1% of drone pixels, a garnish, not transported mass. This is the state
// that mass needs, written as ONE deterministic function of source coordinate
// and canonical time — no particle history, no ping-pong texture — so
// speed=0, permalink clocks and filmsheets stay seek-safe by construction.
//
// SOURCE, not a second authority. The clock is the lifecycle's own: age at
// the break line (mod(w*t - rayPhase(x, zb)), the breakerLifecycleAtX idiom),
// impact at CRASH_PEAK_S — the same instant breakerCurlCycle releases the bend
// and the impact bell peaks. The LOCUS is the curtain's landing: the crest
// source point at impact (zb + c_z*CRASH_PEAK_S, CURTAIN_VERT's zc) plus
// CURT_REACH times the depth-limited crest height (breakerCeilM, the curtain's
// hC). The STRENGTH is the lifecycle impact gain at its peak. Nothing here
// decides anew where or when the wave breaks.
//
// TWO MECHANISMS, one source, one clock (slice 3):
//   deposit — white mass left AT the landing. Stationary, short (DEPOSIT_TAU_S),
//             a band CURT-sized off h_crest. Adds NO height: a narrow raised
//             strip at the landing outlived the curl as a detached plate once
//             already (1fa3f84), so the deposit is material only.
//   roller  — the mass that keeps going. Transported with the BORE: speed is
//             breakerLifecycleAtX's own frontSpeed (mix(2.4, 4.1, plunge)),
//             direction is the wave's propagation ray (grad rayS — sin/cos of
//             the refracted swell angle plus the contour bow), so the
//             down-line component is the along-shore part of that ray and not
//             a chosen speed (the NEXT_INVESTMENTS "unowned quantity" caveat).
//             It spreads as sqrt(1 + tau/1.5) and decays on ROLLER_TAU_S with
//             a smooth end at ROLLER_END_S.
//
// LAGRANGIAN BACK-TRACE. Material at source (x, z) at time t left SOME
// station's landing tau seconds ago and has since moved vel*tau. tau is first
// read off this station's own clock, then refined once at the emitter that
// implies (x0 = x - vel.x*tau): the along-line drift is a few metres against
// the line's smooth age field, so one step converges. Pre-impact at the
// emitter (tau <= 0) or past the roller's life returns zero exactly — that is
// the "absent pre-break" and "no teleport to the next carrier" gates, in code.
//
// CONTACT GATE — THE ONE PLACE THE AUTHORITY IS SPLIT. The curtain draws
// nothing unless the bend has genuinely overturned (CURTAIN_VERT gates on
// curl = th/PI >= 0.30 turns). curl is a vertex-stage OUTPUT of choppyPos
// (shaders.js) and is not available to the model, nor at the emitter station
// from a displaced fragment. The model gates contact on the same xi ->
// curvature map the bend uses instead: the bend's arc angle is
// dyB*mix(0.30, 2.60, plunge)/hCrest with dyB <= 0.65*hCrest, so its ceiling
// reaches the curtain's 0.30-turn gate (0.94 rad) at plunge ~ 0.5. The
// smoothstep below is that crossing, then calibrated against the curtain gate
// the rig measured at three sites (see the constant). Spilling Sharks (xi 0.45
// -> plunge 0) and bed-less Privates (xi 0.35) therefore read zero, which is
// the graceful near-zero slice 4 asks for, from the same knob and not a
// per-site bank.
//
// Returns vec4(deposit, roller, rollerCenterZ, tauSinceImpact). Amplitudes are
// gain-scaled by u_roller and dimensionless (~[0, 1.5]); consumers size the
// foam and the mound from them. Zero everywhere when u_roller = 0.
//
// THE LANDING, ONCE (2026-09-01, second pass). Four consumers now read the
// same station-level event — the deposit here, the roller's emitter here, the
// splash-up sheet (shaders.js SPLASHUP_VERT) and the relocated spray
// (SPRAY_VERT) — so the landing is one function: impactLandingAt(x, t) returns
// (zL landing z, hC ceiling, tauD seconds since THIS station's landing,
// strength = gain*contact*impact peak at emission, or 0 outside the life
// window). Nothing downstream re-derives where or when the crest lands.
float rollerContactGainAt(float x){
  float plunge  = plungeAt(x);
  // CALIBRATED TO THE CURTAIN'S OWN GATE, measured (measure_crash_transport,
  // max overturn along the transect over 40 s, curtain gate = smoothstep(0.30,
  // 0.55, curl)*breakMask*farFade): Sewers xi 1.15 (plunge 0.96) curl 0.60-0.73
  // -> gate 0.63-1.00; First Peak xi 0.85 (plunge 0.50) curl 0.26-0.34 -> gate
  // 0.00-0.07; Second Peak xi 0.65 (plunge 0.16) curl 0.12 -> gate 0. The
  // first cut, smoothstep(0.25, 0.60, plunge), gave First Peak 0.5 and landed
  // a deposit under a curtain that barely draws; this ramp reproduces the
  // measured gates at all three sites.
  float contact = smoothstep(0.48, 0.90, plunge);
  return u_roller * clamp(u_breakShape, 0.0, 1.0) * contact;
}
vec4 impactLandingAt(float x, float t){
  vec4 frame = breakerLandingFrameAt(x, t);
  float zL = frame.x, hC = frame.y, tauD = frame.z;
  float gain = rollerContactGainAt(x);
  float strength = 0.0;
  if (gain > 0.0 && tauD > 0.0 && tauD < ROLLER_END_S) strength = gain * breakerImpactPeakAtX(x, t - tauD);
  vec4 o = vec4(zL, hC, tauD, strength);
  if (!(o.x == o.x)) o.x = breakLine(x);    // NaN guards (house rule)
  if (!(o.y == o.y)) o.y = 0.5;
  if (!(o.z == o.z)) o.z = -1.0;
  if (!(o.w == o.w)) o.w = 0.0;
  return o;
}
// Splash-up kinematics, PHYSICAL metres under G, displayed through VIS like
// every h term (ocean() applies VIS after the physical sum). Peak height is
// SPLASHUP_FRAC of the ceiling; v0 and the flight time follow from it — no
// duration constant, so a bigger day throws higher and longer on its own.
// Both are pure functions of (tauD, hC): seek-safe by construction.
float splashUpPeakM(float hC){ return SPLASHUP_FRAC*hC; }              // displayed
float splashUpFlightS(float hC){ return 2.0*sqrt(2.0*splashUpPeakM(hC)/VIS/G); }
float splashUpHeight(float tauD, float hC){                             // displayed
  float hs = splashUpPeakM(hC)/VIS;                                      // physical peak
  float v0 = sqrt(2.0*G*hs);
  float y  = v0*tauD - 0.5*G*tauD*tauD;
  return max(y, 0.0)*VIS;
}
// geo = (emitter ceiling hC0 [displayed m], roller sigma [m], this station's
// landing z [m], roller z-speed vel.y [m/s]) — what the consumers that shape
// the roller (mound, texture advection, leading edge) need beyond the field.
vec4 impactSourceAt(vec2 sourceXZ, float t, out vec4 geo){
  geo = vec4(0.0);
  float x = sourceXZ.x;
  float plunge  = plungeAt(x);
  float gain    = rollerContactGainAt(x);
  if (gain <= 0.0) return vec4(0.0);

  // The water's propagation ray and the bore's speed along it — both owned
  // elsewhere (rayS, breakerLifecycleAtX); read, not chosen.
  float phi = swellPhi();
  vec2  dir = normalize(vec2(sin(phi) + cos(phi)*coastCurveSlope(x), cos(phi)));
  float frontSpeed = mix(2.4, 4.1, plunge);
  vec2  vel = dir*frontSpeed;

  // ---- deposit: this station's own landing, this station's own clock ----
  vec4  landHere = impactLandingAt(x, t);
  float tauD = landHere.z;
  geo.z = landHere.x;
  geo.w = vel.y;
  float deposit = 0.0;
  if (tauD > 0.0 && tauD < ROLLER_END_S) {
    float hCD  = landHere.y;
    float sigD = max(0.30*hCD, 1.5);                  // >~1.5 cells or it aliases
    float dzD  = sourceXZ.y - landHere.x;
    deposit = landHere.w
            * smoothstep(0.0, 0.08, tauD) * exp(-tauD/DEPOSIT_TAU_S)
            * exp(-0.5*dzD*dzD/(sigD*sigD));
  }

  // ---- roller: back-traced to the station whose landing it left ----
  // Same life window as the deposit: a wrapped tauD (~T at the approaching
  // side) would otherwise back-trace to an up-line emitter and hand its live
  // roller to this pre-break station (measured at First Peak: field present at
  // the pre-contact clocks, 8% of the cover frame). The price is the few metres
  // of down-line drift into a not-yet-impacted station, which is under the
  // probe step at the head.
  float roller = 0.0, zr = 0.0, tau = 0.0;
  if (tauD > 0.0 && tauD < ROLLER_END_S) {
    float x0   = x - vel.x*tauD;
    tau = impactLandingAt(x0, t).z;
    if (tau > 0.0 && tau < ROLLER_END_S) {
      x0 = x - vel.x*tau;
      vec4  land0 = impactLandingAt(x0, t);            // the emitter's landing
      float hC0 = land0.y;
      zr = land0.x + vel.y*tau;                          // where the mass is now
      float sigR = max(0.55*hC0, 2.5) * sqrt(1.0 + tau/1.5);
      float dzr  = sourceXZ.y - zr;
      float endFade = 1.0 - smoothstep(0.70*ROLLER_END_S, ROLLER_END_S, tau);
      roller = land0.w
             * smoothstep(0.0, 0.25, tau) * exp(-tau/ROLLER_TAU_S) * endFade
             * exp(-0.5*dzr*dzr/(sigR*sigR));
      geo.x = hC0;
      geo.y = sigR;
    } else {
      tau = 0.0;
    }
  }

  vec4 outv = vec4(deposit, roller, zr, tau);
  if (!(outv.x == outv.x)) outv.x = 0.0;   // NaN guards (house rule)
  if (!(outv.y == outv.y)) outv.y = 0.0;
  if (!(outv.z == outv.z)) outv.z = 0.0;
  if (!(outv.w == outv.w)) outv.w = 0.0;
  if (!(geo.x == geo.x)) geo.x = 0.0;
  if (!(geo.y == geo.y)) geo.y = 2.5;
  if (!(geo.z == geo.z)) geo.z = 0.0;
  if (!(geo.w == geo.w)) geo.w = 0.0;
  return outv;
}
// The field alone — the probe (main.js curlProbe row 3) and any consumer that
// does not shape the roller read this one.
vec4 impactSourceAt(vec2 sourceXZ, float t){
  vec4 geo;
  return impactSourceAt(sourceXZ, t, geo);
}
#endif

// The carrier's crest bell is intentionally symmetric, but whitewater is not:
// a station may foam only after the zipper has crossed it. Raw lifecycle age
// is 0 at that crossing, grows through the wake, and reads near T on the
// approaching side. Fade that approaching side out before the modulo reset;
// the reset itself is the physical birth of foam at the new breakpoint.
float breakerCausalGate(float ageS){
  return 1.0 - smoothstep(0.72*u_T, 0.90*u_T, ageS);
}

// A real peeling lip carries a compact white leading edge immediately ahead
// of the curl; only the broad wake belongs behind it. Convert time remaining
// before the zipper crossing into metres along the break line so that edge
// keeps the same footprint when local peel speed changes. 0.12*LAM is about
// one crest-edge span; farther-ahead water stays glassy.
float breakerLeadGate(float ageS, float phaseGrad){
  float w = 2.0*PI/u_T;
  float aheadM = max(u_T - ageS, 0.0) * w / max(phaseGrad, 1e-3);
  return 1.0 - smoothstep(0.0, 0.12*LAM, aheadM);
}

// ---------- the crest clock, made continuous (2026-08-18) ----------
// THE HARD FOAM EDGE. Every foam clock in this model is mod(phase, 2pi)/w:
// a sawtooth that runs 0 -> T and then SNAPS back to 0 when the next crest
// arrives. Anything keyed to it inherits that snap, and the snap lands on a
// level set of rayPhase — a crest line. Refraction lands the swell at ~11 deg,
// so a crest line is very nearly shore-parallel: the snap draws a STRAIGHT
// HARD EDGE that sweeps shoreward with the wave and terminates the foam
// instead of dissolving it.
//
// It stayed invisible only while foam had decayed to nothing by tSince = T.
// It has not for a while: the residue/lace/area taus are 1.6-2.4*tau (up to
// 14.4 s against a 15 s period), and GRID_FRAG's ageK is not a decay at all
// but a 0/1 LOOK flip carrying a 2x brightness step. Measured (lineup camera,
// sewers, sim 42, JS mirror of the shipped foam path, 0.25 m steps across the
// seam at three stations): model foam 0.90 -> 0.42, 0.93 -> 0.48, 0.85 -> 0.20
// and the SHIPPED foamM 0.87 -> 0.13, 0.89 -> 0.16, 0.996 -> 0.028 — a
// ~100-luma one-pixel step across 916 of 1029 frame columns.
//
// The 2026-08-18 #arm anchor did not create this; it made it visible, by
// putting a live set on the line at the house clocks where the frame used to
// be flat water. #arm=tail (anchor off) shows no seam because it shows no
// wave.
//
// FIX AT THE SOURCE, not by blurring the output: a crest does not inject foam
// along a mathematical line, it injects over the crest's own width. Ramp the
// clock back to zero over the last CREST_WRAP_S seconds instead of snapping,
// and EVERY consumer — the exp(-age/tau) amplitudes and the look selector
// alike — becomes continuous at one place, for one smoothstep. 2.4 s at
// c = LAM/T = 6 m/s is a ~14 m transition band riding ahead of the crest,
// which is what the approaching bore does to the foam in front of it.
// Clamped to a quarter period so a short-period preset cannot ramp for most
// of its own cycle. u_crestWrap = 0 (#wrap=0) is the bit-identical revert.
// u_wrapS > 0 (#wrapw / #wrapl) swaps the width for an explicit one; the
// uniform branch leaves the shipped path evaluating the identical expression.
// The clamp lifts to 0.75 T on that path: a ramp longer than the period would
// be a clock that never reaches its own age, and 0.75 T is already ~0.6 LAM,
// past anything the sweep asks for. Finite by construction (u_wrapS is
// parsed with an isFinite guard; Tp is floored).
float crestClockS(float ageS){
  float Tp = max(u_T, 1e-3);
  float wrapW = (u_wrapS > 0.0) ? min(u_wrapS, 0.75*Tp) : min(CREST_WRAP_S, 0.25*Tp);
  return ageS * (1.0 - smoothstep(Tp - wrapW, Tp, ageS)*u_crestWrap);
}

// ---------- the birth ramp (#birth=, EXPERIMENT 2026-09-01) ----------
// THE OTHER HARD FOAM EDGE. The zipper lifecycle clock (breakerLifecycleAtX)
// is evaluated at the break line, so it is a function of x alone, and its
// snap T -> 0 at the head is a line of CONSTANT x: a shore-normal straight
// edge in plan view (the drone's vertical line, TODO 2026-08-30). It is
// nearly edge-on from a shore camera, which is why the cliff never showed it.
// crestClockS() must not touch this clock: ramping ages near T back toward
// zero rejuvenates the approaching side (the 2026-08-28 chasing-foam defect,
// see the comet block). So ramp the DEPOSIT, not the clock: foam at a station
// develops over u_birthW*LAM metres behind the head, and until it has
// developed the station shows the PREVIOUS wave's residual (its age plus one
// along-line period). Both sides of the snap then evaluate to that same
// previous-wave value, so the edge dissolves without brightening anything
// ahead of the head. Metric, not temporal, for the #arm reason (the head's
// along-line speed varies ~13x). Seconds stay seconds; the conversion to
// metres is the same behindM geometry the comet already uses.
//   lamLine = 2pi/|dS/dx|, metres per along-line period (head spacing).
//   snapM   = signed metres from the nearest head (negative = ahead of it).
// u_birthLead > 0 places part of the ramp ahead of the head (the centred
// world-x blend variant: it DOES pull head foam ahead, by design, so the
// cliff measurement can price that). u_birthRag jitters the ramp position
// with a static world-space noise so the edge is not a level set of x.
float birthWeight(float behindM, float lamLine, vec2 xz){
  float W = max(u_birthW*LAM, 1e-3);
  float snapM = behindM - lamLine*step(0.5*lamLine, behindM);
  float jit = u_birthRag*W*(2.0*vnoise2(xz*0.13 + vec2(3.7, 1.3)) - 1.0);
  float wgt = smoothstep(-u_birthLead*W, (1.0 - u_birthLead)*W, snapM + jit);
  if (!(wgt == wgt)) wgt = 1.0;   // NaN guard (house rule): fall back to shipped
  return wgt;
}
// The metric comet age under the ramp: previous wave's residual vs the head's
// own, blended by birthWeight. Reduces exactly to exp(-behindM/L) when
// wgt = 1 behind the head and wgt = 0 ahead of it (the shipped reading).
float birthAge(float behindM, float lamLine, float L, float wgt){
  float snapM = behindM - lamLine*step(0.5*lamLine, behindM);
  float prev = exp(-(snapM + lamLine)/max(L, 1e-3));
  float own  = exp(-max(snapM, 0.0)/max(L, 1e-3));
  float a = mix(prev, own, wgt);
  if (!(a == a)) a = exp(-behindM/max(L, 1e-3));
  return a;
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
  float tSince = crestClockS(mod(w*t - rayPhase(xz), 2.0*PI)/w);
  float phaseLag = max(rayPhase(xz) - rayPhase(vec2(xz.x, zb)), 0.0);
  return clamp(tSince + phaseLag/max(w, 1e-4), 0.0, 240.0);
}

// ---------- the aerated wedge (#bore=, 2026-09-24, default OFF) ----------
// WHAT THE FOOTAGE SHOWS (CURL_TRUTH_2026-09-24 SS1.2-1.3): behind the compact
// knuckle at the head, the front face of the broken wave is a thick,
// round-topped bore of saturated white over grey, 0.4-0.65 face heights deep,
// its top LEVEL with the unbroken crest, running with the crest and thinning
// as the wave runs down-point. The shipped frame draws a white line 0.06-0.12
// face heights thick there (the jury's Field seat) over glossy dark water.
//
// WHY THE SHIPPED BORE CANNOT DRAW IT. The lifecycle's bore band (boreBand in
// ocean()) is a Gaussian a few metres wide centred on life.y = zb +
// frontSpeed*age, frontSpeed = 2.4 m/s on a spilling card, while the crest it
// belongs to leaves the line at its own celerity (~4-5 m/s in the break
// depth). Within two seconds the band is metres BEHIND the crest, on the back
// face and in the trough — the wake, not the wedge — and life.w hard-zeros at
// BORE_END_S = 3.8 s where the footage bore runs eight seconds and more behind
// the head. Measured in scripts/probe_bore.mjs (BORE_2026-09-24.md SS2).
//
// THE WEDGE rides the CREST: its locus is the carrier phase (the same theta
// the crest, tSince and the pocket already run on), its clock is the
// lifecycle's own age for the crest this water belongs to (the wave that
// crossed the break line at this station; the crest index is read off the
// phase, so no second clock and no second break line), its permission is the
// break's own brkW (reef, section mask, depth gate), and its size is a
// fraction of the LOCAL carrier amplitude, which already carries
// postBreakHeightRetention, so the bore thins down-point with the wave that
// carries it. One authority preserved: the wedge decides nothing about where
// or when the wave breaks — it reads breakLine, rayPhase and brkW.
//
// Returns the gain in [0, 1]: birth ramp (Duncan: the bulge FORMS over ~half a
// second after the crest crosses) x line attachment x permission x set
// envelope^2 x a slow fade. Outs: ageB = seconds since THIS water's crest
// crossed the line (negative: not yet — causal by construction, no wrap gate
// needed); fracB = how far down the face from that crest this water sits,
// 0 at the crest, 1 at the trough, signed + on the front face, - on the back.
// Callers shape the footprint with boreShape() and the volume with boreBulge().
#ifdef BORE
const float BORE_DEPTH_FRAC = 0.62;  // the white reaches this far down the front face (field 0.4-0.65 H_f; 0.55 measured 0.39-0.44 on frames, the foot thins under the luma threshold)
const float BORE_H_FRAC = 0.18;  // bulge height as a fraction of the carrier's crest-to-trough range
const float BORE_BIRTH_S = 0.55;  // the bulge is fully formed this long after the crest crosses the line
const float BORE_TAU_S = 30.0;  // slow fade on the crest's clock: the footage ratio HOLDS (0.5-0.75 to 7.5 s) while the face shrinks; the carrier's own decay does the thinning, this only subordinates inner crests (age + T)
const float BORE_KNUCKLE_S = 1.2;   // the knuckle is the bore's freshest second: densest, brightest, lumpiest

// ocean()'s brkW, recomputed for a consumer that has no ocean() call (the
// fragment): reef window x section mask, unioned with depth's own permission.
float breakPermissionAt(vec2 xz, float t){
  float reef = reefWindow(xz.x);
  float mask = breakMask(xz.x);
  float dep  = modelDepthM(xz) + setupLiftM(xz, t);
  float Hsh  = u_H0 * shelterAt(xz.x) * shoalingKsAt(dep);
  float gate = smoothstep(0.90, 1.25, Hsh / max(GAMMA*dep, 0.05));
  return mix(reef*mask, max(reef*mask, gate), u_depthMix);
}

float boreWedgeAt(vec2 xz, float t, float permission, out float ageB, out float fracB){
  float w  = 2.0*PI/max(u_T, 1e-3);
  float zb = breakLine(xz.x);
  float thetaHere  = w*t - rayPhase(xz);
  float thetaBreak = w*t - rayPhase(vec2(xz.x, zb));
  // Crests sit at theta = 2 pi m; theta falls shoreward, so the crest just
  // SEAWARD of this water is m = ceil(theta/2pi) and ph in [0, 2pi) measures
  // the phase run down its front face: 0 at that crest, pi at the trough,
  // then up the back face of the next crest shoreward (m - 1).
  float m  = ceil(thetaHere/(2.0*PI));
  float ph = 2.0*PI*m - thetaHere;
  bool front = ph <= PI;
  if (!front) m -= 1.0;                         // back face: the nearer crest owns it
  ageB  = (thetaBreak - 2.0*PI*m)/w;            // when crest m crossed the line at this station
  // fracB is the VERTICAL drop from the crest as a fraction of the carrier's
  // range — the quantity the field table divides by H_f — so it is read off
  // the carrier's own shape at this phase: crestShape(-theta, q) with ocean()'s
  // q schedule and pitch skew (the cosine drop alone put 0.55 at ~96 deg of
  // phase, where a q = 2-4 profile has already fallen 75-95 % of its range, and
  // the wedge covered the whole face — measured in probe_bore.mjs v1).
  float dB    = zb - xz.y;
  float qB    = mix(2.2, 1.6, u_pitchOdd) + mix(1.5, 3.2, u_pitchOdd)*exp(-abs(dB)/55.0)*(0.6 + 0.5*u_xi);
  float depB  = modelDepthM(xz) + setupLiftM(xz, t);
  float excB  = u_H0*shelterAt(xz.x)*shoalingKsAt(depB) / max(GAMMA*depB, 0.05);
  float skewB = mix(0.0, clamp(excB*mix(0.82, 0.62, u_pitchOdd), 0.0, 0.8), u_depthMix);
  float thB   = front ? -ph : (ph - 2.0*PI);      // signed phase from the owning crest, < 0 ahead of it
  thB        -= skewB*mix(1.0 - cos(thB), sin(thB), u_pitchOdd);
  float c01B  = max(0.5 + 0.5*cos(thB), 0.0);
  fracB = (front ? 1.0 : -1.0) * (1.0 - pow(c01B, qB));
  float env    = setEnv(rayS(vec2(xz.x, zb)), t);
  float birth  = smoothstep(0.18, BORE_BIRTH_S, ageB);
  float attach = smoothstep(-4.0, 2.0, xz.y - zb);
  float g = birth * attach * permission * env*env * exp(-max(ageB, 0.0)/BORE_TAU_S);
  if (!(g == g)) { g = 0.0; ageB = -1.0; fracB = 0.0; }   // NaN guard (house rule)
  return clamp(g, 0.0, 1.0);
}
// Material footprint: full over the upper BORE_DEPTH_FRAC of the front face,
// a thin cap over the crest onto its back so the top reads round, not cut.
float boreShape(float fracB){
  float frontS = 1.0 - smoothstep(BORE_DEPTH_FRAC - 0.10, BORE_DEPTH_FRAC + 0.10, fracB);
  float backS  = 1.0 - smoothstep(0.03, 0.10, -fracB);
  return fracB >= 0.0 ? frontS : backS;
}
// The bulge: zero AT the crest (the top stays level with it — nothing in the
// footage rises above the crest line), zero at the wedge foot, round between.
float boreBulge(float fracB){
  float u = clamp(fracB/BORE_DEPTH_FRAC, 0.0, 1.0);
  return fracB > 0.0 ? sin(PI*u) : 0.0;
}
#endif

// Sharpened crest profile: q=1 sinusoid-ish, q>2 peaked (Gerstner cusp stand-in)
float crestShape(float phase, float q){
  // rounding can push c01 a hair below 0 at troughs; pow(negative, fractional)
  // is NaN — showed up as vertex speckles on web-three's regular grid
  float c01 = max(0.5 + 0.5*cos(phase), 0.0);
  return pow(c01, q) - 0.5/q;   // rough mean removal, visual only
}

// Height field + break bookkeeping packed together.
// Returns h; outs: foam, pocket, brk (surf-zone mask), crest (unbroken crest lines),
// carrierAmp (the CARRIER's own amplitude in DISPLAYED metres — see below).
//
// WHY carrierAmp IS AN OUTPUT (2026-08-22). The renderer's choppy term solves
// lam = S/(a*k^2) and needs 'a', the local amplitude of the wave it is
// sharpening. It had no way to ask for it, so choppyPos ESTIMATED it as
// clamp(abs(h), floor, 12) — the instantaneous surface displacement, which is
// a different quantity and goes to ZERO between crests. The floor was there to
// stop lam blowing up in the troughs, and it is the reason a floor was ever
// needed: 'a' was being read off a signal that legitimately crosses zero twice
// a period.
//
// The honest number already exists three lines below as 'amp', derived from
// the shoaling and breaking the model just computed. Handing it out is one
// out-parameter and it costs nothing — ocean() is already evaluated five times
// per vertex for the FD, and this is a value it holds anyway.
//
// It is the CARRIER only: no chop, no boil, no whitewater mound, no setup
// lift. That is deliberate and is the whole point — those terms are exactly
// what was polluting the estimate, and h = a*cos(k*x), the model the cusp
// solve is derived from, has none of them in it. Scaled by VIS so it is in the
// same displayed metres as the h the renderer measures gradients on.
float ocean(vec2 xz, float t, out float foam, out float pocket, out float brk, out float crest,
            out float carrierAmp){
  float x = xz.x, z = xz.y;
  float w = 2.0*PI/u_T;
  float zb = breakLine(x);
  float d  = zb - z;                       // >0 seaward of break line
  float reef = reefWindow(x);              // 0 off the shelf: mellow takeoff, fade-out

  // ---- shoaling ----
  // Synthetic stand-in (kept for presets with no bathymetry behind them) and
  // the real thing: Green's law Ks = sqrt(cg0/cg), with the exact finite-depth
  // group coefficient evaluated from the existing Guo dispersion k.
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
  float Ks      = shoalingKsAt(dep);
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
  // RECONCILED (SECTION_GAP_FOAM_2026-09-24): bed.js's gapArr comment says a
  // gap texel is "rendered as NOT BREAKING". Both sentences are true of
  // different things. NOT BREAKING means no breaking EVENT at the line -- no
  // lifecycle impact/bore/spray (activity carries the mask), no aerated lip
  // or curtain (gated on it), and, under #gapfix, no pocket head or fold and
  // an unbroken crest drawn through the gap. It does not mean the water past
  // the depth limit is un-broken: brk stays depth's permission, so the residue
  // floor and the hump gate keep their whitewater in the gap. What must NOT
  // happen -- and did, until #gapfix -- is a pocket-keyed head painted and
  // folded on the gap segment of a line that is transport, not a crest.
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
  // The break weight WITHOUT the inside ramp — brk below is inside*brkW
  // exactly as before; factored out so the comet head (see cometFoam) can
  // carry full weight AT the line, where inside is still only 0.216.
  float brkW    = mix(reef*mask, max(reef*mask, gate), u_depthMix);
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
  brk           = inside * brkW;   // == mix(brkZip, inside*max(reef*mask, gate), u_depthMix)
  float localWaveLen = 2.0*PI/max(kLocalAt(xz), 1e-3);
  float decay = postBreakHeightRetention(z - zb, localWaveLen, brkW);

  // ---- the wave dies in the swash ----
  // Post-break attenuation above is gradual and wavelength-scaled; this final
  // depth gate is still what actually kills the carrier at the waterline.
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
  // ---- forward pitch (corrected 2026-08-18; the shipped term pitched nothing) ----
  // Real shoaling waves are asymmetric: steep front face, gentle back. The
  // mechanism is a phase map theta -> theta', and it has ONE structural
  // requirement, which the 2026-08-10 implementation missed for eight days:
  //
  //   crestShape() depends on theta only through cos(theta), so it is EVEN in
  //   its argument. Compose an even function with an ODD map and the result is
  //   still even about the crest. "theta -= skew*sin(theta)" is odd, so h was
  //   EXACTLY fore-aft symmetric for every value of skew — measured front/back
  //   max-slope ratio 1.000000 and As -0.0001 over the whole reachable (s,q)
  //   plane (probe_wave_shape.mjs, representation_limit.json). Worse, the odd
  //   map spends its whole budget broadening the crest and narrowing the
  //   trough: it removed Sk 0.66-0.82, which IS the "rounded dune" read.
  //
  //   "1 - cos(theta)" is EVEN, vanishes at the crest (so theta = 0 stays the
  //   crest and tSince/crestNear below keep their meaning), and satisfies
  //   theta'(theta + 2pi) = theta'(theta) + 2pi, so the field stays periodic.
  //
  // The 0.8 clamp is a hard guard, not taste: dtheta'/dtheta = 1 - s*sin(theta).
  // Ahead of the crest (theta < 0) phase is stretched and the front face
  // steepens by at most 1 + s; behind it phase is compressed, and at s = 1
  // the BACK face gets a flat spot at theta = pi/2. s > 1 makes the map
  // non-monotonic in theta (the profile folds in phase), but h is one
  // evaluation per x and stays single-valued for any s. (Corrected 2026-09-23;
  // the old comment said "vertical face" and "multivalued" — both wrong.)
  //
  // s and q were retuned together against Ruessink et al. (2012) Sk/As at the
  // local Ursell number (the audit's own per-gauge targets, stats_gauges.csv).
  // Raising s alone fixes As and overshoots Sk 1.7x; flattening the q schedule
  // (2.2 + 1.5*... instead of 1.6 + 3.2*...) puts BOTH on target and also
  // repairs the offshore Sk deficit, where the old schedule left q ~ 1.8 and a
  // near-sinusoid. Weighted mean-square (Sk, As) error vs R12 over 44 gauges:
  // 0.398 shipped -> 0.161 map-only -> 0.021 retuned.
  //
  // SHAPE vs LOCUS (MODEL.md 4.5's rule, applied). The skew is a transform on
  // the SHAPE of h. The crest's LOCUS — where and when a crest is here — is the
  // carrier phase, and tSince and crestNear below want the locus, not the
  // shape. The odd map conflated them, and not harmlessly: its
  // dtheta'/dtheta = 1 - s*cos(theta) is 1 - s = 0.4 AT THE CREST, so phase
  // crawled there and the crestNear window, nominally +-56.6 deg of carrier
  // phase, actually spanned +-91 deg. The pocket bell — and through it the
  // fold's S_over, the lip throw and the #lip aeration mask — was calibrated on
  // top of that 1.6x dilation. Reading the carrier phase here removes the
  // dilation, so the pocket FOOTPRINT shrinks (measured area x0.19-0.63 across
  // the bank). That is a real, visible consequence, recorded in MODEL.md 2.2a
  // rather than compensated for here: the place to restore the footprint, if it
  // should be restored, is the 0.55/0.98 crestNear thresholds, which belong to
  // the #pock/#lip calibration and not to this fix.
  // #pitch=0 restores the conflation too, so the A/B stays bit-exact.
  float thetaC = theta;                       // carrier phase = the crest locus
  float skewGain = mix(0.82, 0.62, u_pitchOdd);
  float skew   = mix(0.0, clamp(excess*skewGain, 0.0, 0.8), u_depthMix);
  theta       -= skew*mix(1.0 - cos(theta), sin(theta), u_pitchOdd);
  float thetaL = mix(thetaC, theta, u_pitchOdd);   // locus phase
  float env    = setEnv(rayS(xz), t);
  float env2   = env*env;                  // lulls really disappear
  float qBase  = mix(2.2, 1.6, u_pitchOdd);
  float qGain  = mix(1.5, 3.2, u_pitchOdd);
  float q      = qBase + qGain*exp(-abs(d)/55.0)*(0.6 + 0.5*xiAt(x));
  float amp    = 0.5*Heff * grow * decay * env * shoreFade;
  float h      = amp * crestShape(-theta, q) * 2.0;
  // The carrier's amplitude, displayed metres. crestShape carries a mean
  // removal and a factor 2, so this is the scale of the carrier rather than
  // its exact peak — which is what a cusp parameter wants. Guarded finite here
  // so no consumer has to.
  carrierAmp   = amp * VIS;
  if (!(carrierAmp == carrierAmp)) carrierAmp = 0.0;

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

  // Time since last crest passed this point. Two corrections compose here:
  // the clock reads the UNSKEWED carrier phase thetaL (LOCUS, not shape — a
  // skewed phase moves where the clock thinks the crest is, which is what
  // dilated the crestNear window 1.6x; see thetaL), and it is ramped across
  // the wrap so no foam term keyed to it draws a hard crest-line seam
  // (see crestClockS).
  float tSince = crestClockS(mod(thetaL, 2.0*PI)/w);
  float tau = max(u_tau, 0.5);

  // pocket: crest currently crossing the break line — the zipper's locus.
  // The legacy 22 m bell reads as a raised ridge from the cliff. Structural
  // mode contracts it to a few posts so the face/lip transition has a visible
  // hinge rather than a broad cosmetic glow.
  float crestNear = smoothstep(0.55, 0.98, cos(thetaL));
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
  // #gapfix=1 (SECTION_GAP_FOAM_2026-09-24 5): the pocket is the one term
  // every head consumer keys to -- the fold reach Sover, the bend's kEff and
  // earn floor, lipFoam, the fragment's pocket floor, fresh core, tint and
  // pocket-lip white -- and none of them read breakMask, so a crest crossing
  // the gap segment of the line was painted and folded as a breaking head
  // (the og hero's heads B and C). One multiply at the source, one authority;
  // everything downstream inherits it. mix(1, mask, 0) is exactly 1, so the
  // shipped path is untouched.
  // GAP_FIX is a BUILD define (see SECTION_CURL above for why): the default
  // boot compiles the two shipped lines verbatim; u_gapFix is the live gate
  // inside a #gapfix boot.
#ifdef GAP_FIX
  float gapKeep = mix(1.0, mask, u_gapFix);
  pocket = crestNear * mix(pocketLegacy, pocketCompact, clamp(u_breakShape, 0.0, 1.0))
         * env2 * reef * gapKeep;
  // unbroken crest lines (approaching swell stays legible from above). With
  // brk = 1 inside every gap (depth's permission) the gap drew neither a broken
  // nor an unbroken crest; under #gapfix the crest passes through the gap
  // unbroken, which is what MODEL.md 4.5 says happens there.
  crest = crestNear * (1.0 - brk*gapKeep) * env2;
#else
  pocket = crestNear * mix(pocketLegacy, pocketCompact, clamp(u_breakShape, 0.0, 1.0))
         * env2 * reef;
  // unbroken crest lines (approaching swell stays legible from above)
  crest = crestNear * (1.0 - brk) * env2;
#endif

  // Legacy keeps a static symmetric mound on the break line. Structural mode
  // transfers that mass into the shared lifecycle: a compact impact at the
  // moving front, followed by a lower aerated bore and a foam train behind it.
  float shape = clamp(u_breakShape, 0.0, 1.0);
  float boreBandLegacy = brk * env2 * exp(-abs(z - zb)/9.0);
  vec4 life = breakerLifecycleAtX(x, t);
  // #frontw / #moundh (EXPERIMENT 2026-09-10): from the cliff the mound at
  // the head is a ridge a few metres wide standing ABOVE the unbroken crest
  // line — the "bug" — where a real head collapses forward and down. These
  // two knobs let the mound go wider and lower. Measured at the cliff: height
  // is the knob, width is not; at the drone the mound is invisible either way
  // (0.03% of pixels). Verdict "better, ship it": u_moundH ships at 0.5,
  // #moundh=1 is the pre-fix A/B; u_frontW stays 1.
  float frontWidth = (2.8 + 0.90*life.x) * max(u_frontW, 0.05);
  float frontBand = exp(-0.5*pow((z - life.y)/frontWidth, 2.0));
  float impactBand = frontBand*life.z;
  float boreBand = frontBand*life.w;
  float trailStart = smoothstep(zb - 2.0, zb + 1.5, z);
  float trailEnd = 1.0 - smoothstep(life.y - 1.5, life.y + 2.5, z);
  float trailBand = trailStart*trailEnd*life.w;
  float moundNoise = 0.75 + 0.25*vnoise2(vec2(x*0.2, t*0.8));
  float legacyMound = 0.30*u_H0*boreBandLegacy*moundNoise;
  float structuralMound = u_H0*(0.62*impactBand + 0.27*boreBand)*moundNoise*u_moundH;
  h += mix(legacyMound, structuralMound, shape);

  // ---- the aerated wedge (#bore=, default OFF): the bore as a body ----
  // See boreWedgeAt(). Height is a fraction of the LOCAL carrier range (amp
  // carries shoaling, sheltering, the set envelope and the post-break decay),
  // physical metres like every h term here; VIS applies at the end. The
  // wedge OWNS the bore's volume, so the structural bore mound it replaces is
  // withdrawn at the same gain — one mound per mechanism, not two. The impact
  // mound (0.62*impactBand) is a different event and stays. Under the build
  // define so the default path compiles the identical text.
#ifdef BORE
  float boreFoamB = 0.0;
  if (u_bore > 0.0) {
    float ageB, fracB;
    float gB = boreWedgeAt(xz, t, brkW, ageB, fracB);
    // crest lumps: a lattice in the crest's own frame (fracB), rolling over on
    // the seconds clock — the footage's "bore with crest lumps"
    float lumpB = 0.72 + 0.28*vnoise2(vec2(x*0.45 + 1.7, fracB*6.0 + t*0.8));
    h += BORE_H_FRAC * (2.0*amp) * boreBulge(fracB) * gB * lumpB * min(u_bore, 1.5);
    h -= min(u_bore, 1.0) * shape * u_H0*0.27*boreBand*moundNoise*u_moundH;
    boreFoamB = gB * boreShape(fracB) * foamSizeAt(x) * min(u_bore, 1.0);
  }
#endif

  // ---- the crash — impact aeration + ballistic spray (#splash=0 reverts) -
  // Live verdict 2026-08-25 on the lip bundle: "we're missing the crash of
  // the wave." The lip bent over, the curtain closed the fall, and the
  // landing raised only the structural mound above — 0.62*impactBand*u_H0,
  // ~1 m beside a 7.5 m crest, a swell in the bore rather than an event.
  // Real plunging impact ejects a mass comparable to the wave itself
  // (Peregrine 1983's splash-up), briefly, exactly at the landing.
  //
  // Same clock, same locus, new magnitude: the burst rides the lifecycle's
  // own impact bell (CRASH_PEAK_S +/- CRASH_SIGMA_S — a sub-second flash
  // ~0.4 s after each station's crest crosses, so it CHASES THE ZIPPER),
  // in a band narrower than the mound's (floored at 2.2 m: a burst thinner
  // than ~1.5 grid cells cannot be drawn, only aliased — the measure_curl
  // resolution-honesty lesson), ragged by two noise octaves so it reads as
  // ejecta, not a dome. Deliberately NOT keyed on life.z: that product
  // already carries sizeAmp, and a u_H0 prefactor on top of it would scale
  // the crash with the CUBE of the swell (the SIZE_AUDIT double-count
  // defect). Size enters once, through the house factor foamSizeAt; lulls
  // gate through env2 exactly like every lifecycle consumer. plunge floors
  // at 0.25 — a spiller's bore still collapses, at a quarter the violence.
  // The first pass added the NARROW splashBand directly to h and let it outlive
  // the curl. Once the bend released, that raised white strip read as a
  // detached triangular fountain. Removing all lift fixed the plate but also
  // removed the crash. Split the roles instead: the surface signal paints the
  // tight impact aeration while SPRAY_VERT concentrates genuinely airborne
  // volume into the release window. The JS twin deliberately omits both render
  // signals: neither is standable water and the rider must not surf them.
  float impactAgeS = exp(-0.5*pow((life.x - CRASH_PEAK_S)/CRASH_SIGMA_S, 2.0));
  float splashSig  = max(0.45*frontWidth, 2.2);
  float splashBand = exp(-0.5*pow((z - life.y)/splashSig, 2.0));
  float splashRag  = 0.45 + 0.55*(0.5*vnoise2(vec2(x*0.85, t*2.2))
                                + 0.5*vnoise2(vec2(x*2.1 + 7.0, t*3.1)));
  float plgSplash  = plungeAt(x);
  // The upward burst begins as the lip releases, not while it is still
  // accelerating. Without this handoff the burst merely made the held curl
  // taller and more overturned (the opposite of a landing).
  float crashRelease = smoothstep(CRASH_PEAK_S,
                                  CRASH_PEAK_S + CRASH_SIGMA_S, life.x);
  float crashAmp = u_splash * 0.90*u_H0 * (0.25 + 0.75*plgSplash)
                 * env2 * reef * breakMask(x) * foamSizeAt(x)
                 * impactAgeS * crashRelease;
  if (!(crashAmp == crashAmp)) crashAmp = 0.0; // NaN guard (house rule)

  // MATERIAL: the tight ragged burst can remain white after the lip releases;
  // it is foam on the connected surface, not a second geometry owner.
  float splashBurst = crashAmp * splashBand * splashRag;
  if (!(splashBurst == splashBurst)) splashBurst = 0.0; // NaN guard (house rule)

  // ---- the transported crash: deposit + roller (#roller=, default OFF) ----
  // impactSourceAt() is the one source (see its header): the curtain landing
  // on the lifecycle clock, back-traced along the bore's own transport. Read
  // at the SOURCE coordinate like every Lagrangian term in this function; the
  // renderer displaces the result with the water it belongs to and never asks
  // the lifecycle again at the displaced position.
  // Uniform branch: the default frame pays nothing and stays bit-identical.
#ifdef ROLLER
  float rollDeposit = 0.0, rollMass = 0.0;
  if (u_roller > 0.0) {
    vec4 impGeo;
    vec4 imp = impactSourceAt(xz, t, impGeo);
    rollDeposit = imp.x;
    rollMass    = imp.y;
    // HEIGHT, roller only. A roller is a rolling mass of aerated water WITH
    // volume — the structural bore mound already says so at 0.27*u_H0 — so it
    // gets a mound that travels with it, sized off the EMITTER's ceiling
    // (impGeo.x, displayed; /VIS makes it physical like every h term here,
    // VIS applies at the end) — the breaking scale at the station that threw
    // it, not the deep-water swell. The deposit adds none: a narrow raised
    // strip at the landing is exactly the detached plate 1fa3f84 removed; its
    // vertical extent is the splash-up SHEET (shaders.js SPLASHUP_VERT), a
    // ballistic on the same clock, not water height.
    h += ROLLER_MOUND_FRAC*(impGeo.x/VIS)*rollMass*moundNoise;
  }
#endif

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
  float sizeFoam = foamSizeAt(x);

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
  // COMET TAIL IN METRES (2026-08-18, the #arm diagnosis, factor 2 of 2).
  // exp(-life.x/2.5) is a TEMPORAL tail, but the head's along-line speed is
  // w/|dS/dx| (S = the line's phase label), which varies ~13x along the
  // Sewers line: ~43 m/s on the near-shore-parallel up-point flank versus
  // 3-8 m/s on the oblique down-point arm (realized alpha 40-70 deg) — the
  // one segment the drone actually frames. There the 2.5 s clock collapses
  // to 8-20 m of tail, 14-35 px from the drone: measured as the missing
  // along-crest gradient (probe_arm_terms.mjs). The read needs a SPATIAL
  // gradient, so convert age to metres behind the head (exact where S is
  // locally linear) and decay on a 55 m e-fold. Rate independence holds:
  // age stays in seconds, the conversion is pure geometry. Self-limiting:
  // age wraps at T, so a tail can never reach past the previous head. The
  // dSdx floor makes alpha -> 0 a closeout (whole line breaks at once,
  // tail collapses), not a divide-by-zero. u_armRead=0 is the A/B revert.
  // CAUSAL CLOCK (2026-08-28, the "foam chases the wave" report). The
  // carrier/residue clock above still needs crestClockS(): without its broad
  // injection width #wrap=0 leaves the surface foam visibly detached from the
  // breaking lip. The ZIPPER lifecycle is different. Its wrap is the moving
  // breakpoint itself, so ramping ages T-wrapW..T back toward zero paints
  // newborn comet foam on the not-yet-broken side of the head. In the Free
  // camera that was the bright lobe ahead of the curl. Keep the line clock raw:
  // age 0 is attached to the head, increasing age is the trailing wake, and
  // age near T stays the previous/approaching side rather than being
  // rejuvenated. The impact/bore terms already cover the causal head, so the
  // vertical reset is anatomy, not the carrier's old detached hard edge.
  float eA = 2.0;
  float dSdxLine = abs(rayPhase(vec2(x + eA, breakLine(x + eA)))
                     - rayPhase(vec2(x - eA, breakLine(x - eA)))) / (2.0*eA);
  float cometClk = life.x;
  float behindM = cometClk * w / max(dSdxLine, 1e-3);
  float cometMetric = exp(-behindM/55.0);
  // #birth (EXPERIMENT, default off): the metric comet develops over
  // u_birthW*LAM behind the head; see birthWeight(). Uniform branch so the
  // shipped path evaluates the identical expression.
  if (u_birthW > 0.0) {
    float lamLine = 2.0*PI / max(dSdxLine, 1e-3);
    cometMetric = birthAge(behindM, lamLine, 55.0, birthWeight(behindM, lamLine, xz));
  }
  float cometAge = mix(exp(-cometClk/2.5), cometMetric, u_armRead);
  // Attachment weight: brk's -6..14 m inside ramp is only 0.216 AT the line,
  // which shaved the head's seaward half — the one part of the band that
  // touches the line the term exists to mark (measured: line-station comet
  // contribution ~4x under the band peak 8-14 m shoreward). The comet gets
  // its own ramp reaching full weight ~at the line; brkW keeps reef/mask/
  // depth permission identical to brk. Legacy weight under #arm revert.
  float cometW = mix(brk, smoothstep(-5.0, 1.0, z - zb)*brkW, u_armRead);
  float cometFoam = u_headRead * cometW * env2 * cometAge
                  * exp(-max(z - zb, 0.0)/22.0) * mask * sizeFoam;
  // The crash signal marks born-white impact aeration on the connected surface.
  // Normalized against a quarter of its amplitude scale so it saturates fast,
  // then rides the same channel as every other structural band. Its airborne
  // counterpart is the separate deterministic spray pass.
  float splashFoamN = clamp(splashBurst/(0.25*u_H0 + 1e-4), 0.0, 1.0);
  float structuralFoam = 1.55*impactFoam + 0.84*boreFoam
                       + 0.66*trailFoam + 0.42*trailLace
                       + 0.90*cometFoam + 1.25*splashFoamN;
  // Transported crash material (#roller). Born white like the splash, denser
  // than the bore it rides through, textured by the same advected clumps so it
  // reads as whitewater and not as a painted band. Accumulated INSIDE the
  // uniform branch: adding a zero term to the sum above is exact in value but
  // changes the expression the compiler sees, and under fast-math that moved
  // one pixel by one level against the pristine tree. The default path must
  // compile the identical text.
#ifdef ROLLER
  if (u_roller > 0.0) {
    float rollerFoam = (1.45*rollDeposit + 1.05*rollMass) * (0.72 + 0.28*clumps);
    structuralFoam += rollerFoam;
  }
#endif
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
  // so the size-invariance calibration is preserved either way.
  foam = mix(legacyFoam*sizeFoam, structuralFoam + residue*sizeFoam, shape);
#ifdef BORE
  // The wedge is whitewater by definition: a floor, like the pocket's, so the
  // erosion downstream carves lace into it but cannot carve it away.
  foam = max(foam, boreFoamB);
#endif

  // pocket spray: whitewater thrown at the zipper itself, heavier when plunging
  // Structural mode keeps this as a thin lip edge; the separate spray pass owns
  // the airy volume, so the surface itself does not turn into a white wall.
  //
  // SIZE-NORMALIZED 2026-08-19 (#lipn=0 reverts). This term used to read
  // "lip and crumb stay xi-owned", and xi ownership is right — a plunging lip
  // throws more foam than a spilling one. But xi-owned and size-normalized are
  // ORTHOGONAL claims, and the term carried neither sizeFoam nor sizeAmp, so at
  // the break line (where the pocket Gaussian is 1 and pockS therefore drops
  // out) lipFoam was the one foam term in the model that did not know how big
  // the wave was. Consequence: as H0 falls every OTHER term is attenuated
  // toward the 0.55 clamp floor while this one holds full strength, so foam's
  // COMPOSITION shifts onto a size-blind term and, on a plunging preset, that
  // term alone saturates. Measured at Sewers (xi 1.15, coefficient 1.101) on
  // one set beat, month=october vs month=august: sizeFoam 0.550-0.606 vs 0.550
  // — a 2% difference — while stage-max foam went 0.385 -> 0.929, because
  // crestNear > 0.5 went from 3/64 stations to 43/64 and mean lipFoam 0.039 ->
  // 0.519 (13x) at an unchanged coefficient. The August wave was correctly
  // small (crest 3.34 m vs January's 5.17) and correctly whiter than January.
  // foamSizeAt is exactly 1.0 at the 1.5 m card day, so the shipped card look
  // is unchanged by construction; only sub- and super-card days move.
  // pocket is a symmetric crest-locus bell. Keep the broad whitewater wake on
  // the crossed side, then union only a compact metric edge immediately ahead
  // of the curl. This leads the wave without reviving the whole approaching
  // half of the carrier.
  float pocketGate = max(breakerCausalGate(life.x),
                         breakerLeadGate(life.x, dSdxLine));
  float foamPocket = pocket * pocketGate;
  // ---- HEAD HUMP (#hump=, EXPERIMENT 2026-09-10, default off) ----
  // Cliff verdict: the breaking head reads as "a little bug walking the wave
  // tip". Every whitewater term at the head is PAINT — the pocket floor, the
  // fresh core, the aerated lip all whiten the crest and raise nothing, so
  // from a grazing camera the head projects to a sliver. The structural mound
  // above sits on the impact band behind the line and is water-coloured. A
  // tumbling head has bulk: thrown water and aerated mass standing above the
  // smooth crest line, and that silhouette is what a cliff sees. So raise the
  // surface AT the head — the same crossed-side pocket the lip foam rides, so
  // no new locus is introduced — by a fraction of the local breaking ceiling
  // (physical metres; the trailing VIS multiply exaggerates it with the wave
  // that carries it), textured so it is a mass and not a dome, and paint it
  // white below. Gated on the mask the head already has, so a lull or an
  // inactive reef raises nothing. Measured against #head=0 and #roller=2,
  // both of which left the cliff head pixel-identical: the missing thing is
  // height, not density. Not in the JS twin: the rider reads the GPU surface.
  // Shape: a steep-sided plateau, not the bell itself. First cut raised
  // h linearly in foamPocket and read as a smooth cusp at the head and a
  // dark dune where the gate was partial, because height tracked the mask
  // linearly while whiteness is thresholded downstream. Saturate both: any
  // raised water is white, and the rise is a body with a ragged top.
  // Crossed side ONLY. foamPocket unions a lead edge ahead of the curl for the
  // lip; a hump there raised an unbroken crest into a dark dune, because the
  // fragment carves foam ahead of the head. The mass is the collapsed water
  // behind the breakpoint, so it takes the causal gate alone.
  // ...and only where breaking is PERMITTED: brkW is depth's gate and the
  // section mask without the inside ramp (the comet head's own factoring).
  // Without it a crest crossing the line inside a section gap raised a dark
  // dune — the foam is masked there in the fragment, the height was not.
  // ...and only AT THE LINE. Inner crests re-break inshore and carry their
  // own pocket, but the fragment's comet carve (behindC, keyed to the one
  // traveling breakpoint's clock) dissolves their foam to film, so a hump on
  // an inner head stood as a dark dune from the cliff. Same 25 m line window
  // the fresh-foam core uses (GRID_FRAG nearLine): the mass is the primary
  // head's, and inner re-breaks keep their painted head for now.
  float humpLine = exp(-pow((z - zb)/25.0, 2.0));
  // ...and only while the STATION is live. The probe (2026-09-10) found a
  // second rise at x = 110 on a crest that is at the line but whose station
  // the lifecycle clock aged past the live head: the fragment renders that
  // foam as aftermath, so it stood as a dark dune. GRID_FRAG's liveHead is
  // onStripe * exp(-age/3.2); take the same e-fold so the mass exists exactly
  // where the fragment will paint a live head, and decays into the bore.
  float humpLive = exp(-max(life.x, 0.0)/3.2);
  float humpBody = smoothstep(0.12, 0.55, clamp(pocket * breakerCausalGate(life.x), 0.0, 1.0))
                 * smoothstep(0.15, 0.60, brkW) * humpLine * humpLive;
  float humpTex  = 0.55 + 0.45*(0.65*vnoise2(vec2(x*0.45 + t*0.9, z*0.35 - t*0.6))
                                + 0.35*vnoise2(vec2(x*1.3 - t*0.7, z*1.1 + t*0.5)));
  float humpMask = humpBody * humpTex;
  float humpPhys = 0.45 * (breakerCeilM(xz)/VIS) * u_hump;
  if (!(humpPhys == humpPhys)) humpPhys = 0.0;
  h += humpPhys * humpMask;
  float lipFoam = foamPocket * (0.45 + 0.75*smoothstep(0.3, 1.4, xiAt(x)));
  foam += lipFoam*mix(1.0, 0.52, shape)*mix(1.0, sizeFoam, u_lipSize);

  // spilling crumb: low-xi waves dribble foam down the face before fully breaking
  float crumb = crestNear * (1.0 - brk) * env2
              * exp(-max(d, 0.0)/28.0) * smoothstep(0.55, 0.2, xiAt(x));
  foam += crumb * 0.6 * (0.6 + 0.4*vnoise2(xz*0.4 + vec2(t*0.3, 0.0)));

  // the hump is whitewater: never let it stand as bare water
  foam = max(foam, smoothstep(0.04, 0.30, humpMask) * step(0.001, u_hump));
  foam = clamp(foam, 0.0, 1.0);

  // along-crest texture so whitewater isn't a uniform bar
  foam *= 0.72 + 0.28*vnoise1(x*0.045 + 3.1);

  // REMOVED 2026-08-30: the surfer's foam wake. Two trails were drawn behind
  // the rider — this painted foam line and a white quad in surfer.js — and
  // neither survived review. This one hardcoded breakLine(x) - 11.0 as "the
  // ride line", which the front-face sign correction (892231f) made wrong by
  // construction: the rider now sits at breakLine + (11 + 5*pump), so the line
  // was painted ~22 m away on the far side of the break. It also ignored the
  // pump entirely, so it could not have tracked the ride even with the sign
  // right. A real wake is a trail the board leaves in the water it passed
  // through; that is a shape problem, not a Gaussian at a guessed offset.
  // u_surfer is now read only by scripts/measure_rider_surface.mjs.

  h *= VIS;
  if (!(h == h)) h = 0.0;  // NaN guard
  return h;
}

float oceanH(vec2 xz, float t){ float f,p,b,c,a; return ocean(xz, t, f, p, b, c, a); }
`;
