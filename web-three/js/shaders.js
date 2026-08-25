// web-three shaders — displaced-grid renderer over the SAME model GLSL as
// web/ (spliced from shared/model-glsl.js; MODEL.md is the source of truth).
// Written GLSL1-style (varying / gl_FragColor) on purpose: three.js
// ShaderMaterial prefixes translate those for WebGL2, so the shared chunk
// stays version-agnostic and identical between renderers.
//
// M1 is the shading pass (WEB_THREE_SPEC.md "Shading", ranked by visual ROI):
//   1. detail spectrum (fbm ripple in the normal field, two drift directions)
//   2. Schlick fresnel + sun glitter + procedural marine-layer sky reflection
//   3. subsurface transmission through thin backlit crests
//   4. foam IN the surface (rough normals, lit albedo, kills fresnel locally)
//   5. aerial perspective (fog matched to the sky dome; far skirt, no seam)
// M2 is horizontal choppy displacement (spec "Displacement") — the reason
// web-three exists: grid points slide toward the crests (Tessendorf choppy),
// past the cusp limit at the pocket when xi plunges, so the lip pitches and
// folds. Normals come from finite differences on the DISPLACED positions.
// The model itself is untouched — everything here is renderer-side geometry
// and texture. Breaker anatomy adds one canonical lifecycle shared with
// model-glsl: the grid shapes the face/lip/impact mound, while a sparse point
// pass gives only the impact its airy volume.

import { MODEL_GLSL } from '../../shared/model-glsl.js';

// Varyings the spec names: world pos, displaced normal, foam, pocket, crest,
// brk — plus the boil slick (recomputed in the vertex stage; ocean() keeps it
// internal) so the fragment can damp ripple detail over the glassy dome.
const VARYINGS = `
varying vec3  vWorldPos;
varying vec3  vNormal;
varying float vFoam;
varying float vPocket;
varying float vCrest;
varying float vBrk;
varying float vLand;   // 1 where the seabed surfaced above the water
varying float vDepth;  // still-water depth at this point, m (99 = no bathymetry)
varying float vBoil;
varying float vAerLip; // aerated-lip mask, keyed to the fold geometry (#lip=1)
// The angle this vertex's crest band was rotated through by #curl, in turns
// (phi/PI, so 0.5 = the lip is horizontal and 1.0 = it has come right over).
// Written by the vertex stage; geometry owns the throw, the foam path owns the
// whitening, and this varying is the one number that crosses between them.
// WIRED 2026-08-18: it is now the aeration CURTAIN KEY whenever #curl is on
// (choppyPos, lipKey). Before that the two flags contradicted each other —
// vAerLip keyed off throwMag, which #curl computes and then does not apply, so
// "#curl=1&lip=1" painted a curtain where no lip existed. The fragment stage
// still reads only vAerLip; this stays available for shading that wants the
// raw overturn angle rather than the aeration mask derived from it.
varying float vCurl;
`;

// ---------- detail spectrum (renderer-side; the model stays in model-glsl) ----------
// Requires MODEL_GLSL spliced first (uses vnoise2, LAM, u_T, u_chop).
// DETAIL_OCTAVES is the single perf knob — per spec, the first thing to drop
// under load. 4 octaves from ~6 m down to ~0.6 m wavelength.
const DETAIL_GLSL = `
#define DETAIL_OCTAVES 4

float detailH(vec2 p, float t){
  // two drift directions: odd octaves ride an oblique wind sea, even octaves
  // follow the swell (+z shoreward) slower than the carrier so the texture
  // visibly lags the crests instead of freezing onto them. Speeds are in
  // m/s of simulation time — rate independence lives in the JS clock.
  vec2 swell = vec2(0.0, 1.0) * (0.25 * LAM / u_T) * t;
  vec2 wind  = vec2(0.916, -0.402) * 1.15 * t;
  float a = 0.5, f = 0.16, sum = 0.0;
  for (int i = 0; i < DETAIL_OCTAVES; i++) {
    vec2 drift = mod(float(i), 2.0) < 0.5 ? swell : wind;
    sum += a * (vnoise2((p - drift) * f) - 0.5);
    a *= 0.55; f *= 2.15;
  }
  return sum;
}

// central finite difference; e sits below the finest octave (~0.6 m) so the
// gradient sees every band. Fragment-stage only cost — no geometry involved.
vec2 detailGrad(vec2 p, float t){
  float e = 0.15;
  return vec2(
    detailH(p + vec2(e, 0.0), t) - detailH(p - vec2(e, 0.0), t),
    detailH(p + vec2(0.0, e), t) - detailH(p - vec2(0.0, e), t)) / (2.0 * e);
}
`;

// ---------- kelp canopy ----------
// VISUAL_GROUND_TRUTH.md item 5 names kelp as a water-level cue and it was
// entirely absent; worse, the polarity was INVERTED. The bottom-showing-through
// term below paints the shallow reef tongue bright sandy-teal, while the NAIP
// ortho (references/sat_usgs_z16_pleasurepoint.jpg, USGS/NAIP, public domain)
// shows the reef at Pleasure Point as a near-black olive WEDGE running seaward
// from the point. Inverted value polarity is an instant-fake tell at thumbnail
// size, so this is the shading fix, not decoration.
//
// TUNED AGAINST THE ORTHO, not invented. Patch means sampled off that image:
// canopy core RGB (42, 56, 63) against adjacent open water (126, 150, 149) —
// a per-channel ratio of (0.34, 0.37, 0.42), i.e. the canopy sits at roughly
// four tenths of open water and kills red hardest, so it reads cold and dark
// rather than merely dimmer. That RATIO is the acceptance target for the
// colour code in GRID_FRAG; the constants there were solved to hit it.
//
// WHERE it grows. DEPTH is the only gate, and that is a deliberate choice made
// against two rejected alternatives, both measured first with a debug pass that
// wrote the candidate gates to RGB (kelpdbg/drone_secondpeak.png, session
// scratchpad):
//   * reefWindow(x) — REJECTED. It is the authored finite-reef ENVELOPE around
//     one surf node, not the reef's footprint: on Second Peak its plateau plus
//     feathers span ~150 m of a ~600 m-wide drone frame, so gating on it
//     confined the whole canopy to a vertical strip about a quarter of the
//     frame wide. The mudstone platform at Pleasure Point runs the length of
//     the point; the surf node is a feature ON it, not its extent.
//   * breakLine(x) as the scour edge — REJECTED. Physically it is the right
//     rule (holdfasts do not survive the breaking zone) but the break line is
//     currently DEM noise (the ROOT DEFECT), and in the debug pass it sat ~90 m
//     seaward of the visible whitewater. Hanging a hard, high-contrast shading
//     boundary on it would import that noise straight into the value structure
//     and leave a bright gap band between the kelp and the foam. Depth is the
//     physical scour variable anyway — orbital velocity at the bed — and it
//     comes from the bathymetry directly, not from the broken derivation.
//
// So, on depth alone, with the ortho setting both edges:
//   * inner 1.2 -> 3.4 m: the canopy dies on the inner bar. At Pleasure Point
//     kelp grows right through the outer lineup — the ortho shows it reaching
//     the whitewater fringe — so it must cover the ~2.2 m reef flat, and it
//     does, at about half density, thickening seaward.
//   * outer 5.0 -> 8.5 m: AUTHORED (MODEL.md 4.5 — physics owns the field,
//     authorship owns the character). The real limit is light (~20 m), but this
//     stage's bathymetry tops out near 8 m, so a 20 m limit would never land in
//     frame. Thinning where the mapped reef gives way puts the seaward edge
//     ~200 m out, where the ortho puts it. Nothing in the wave field reads
//     this: it is a shading mask, downstream of everything.
//
// RAMP WIDTHS ARE NOT TASTE. A first cut used 1.0 m and 2.0 m ramps and the
// canopy edge came back visibly BLOCKY (kelp/drone_secondpeak.png, first
// iteration): the DEM residual is 0.31-0.93 m, so a 1 m ramp puts the mask's
// own contour inside the noise band and the 7 m posts draw themselves. Both
// ramps are now 2.2-3.5 m — several times the residual — and the clump noise
// carries the edge structure instead, which is also what actually breaks the
// boundary up in the ortho. Same lesson as the ROOT DEFECT, one layer up: do
// not put a high-contrast boundary on a quantity whose ramp is narrower than
// the error in the field under it.
//
// DENSITY (kelp polarity, part 2 — 2026-08-18, #kelp=0 reverts). The 2026-08-11
// fix above got the CLUMP colour right and the WEDGE wrong: at ~half coverage
// the un-kelped lanes between clumps still show the bright sand return, so the
// tongue reads as bright teal with dark holes — net polarity still inverted vs
// the ortho, and the 2026-08-14 hero read measured the cost (the upper-half
// mottle owns the contrast budget while the break line is the least
// differentiated stripe). The ortho wedge is near-continuous canopy with thin
// open lanes, not clumps in bright lanes, so behind u_kelpDark the clump
// thresholds drop (0.24->0.08, 0.64->0.44): the same three-octave field now
// saturates over most of the band and the lanes shrink to channels. The band
// gates and their 2.2-3.5 m ramps are untouched — the blocky-edge falsification
// below was about ramp width vs DEM residual, and this changes neither.
// Coupled lane fix (mudstone bed albedo) lives at the bedAlb code in GRID_FRAG.
//
// MEASURED (clock-pinned drone captures, sim=42, 1000x750, #kelp=0 vs default):
// upper-half luma std (the mottle) 11.4->6.7 at sewers, 16.4->13.0 at
// secondpeak; break-band / upper-half luma ratio 1.97->2.20 (sewers) and
// 1.88->2.11 (secondpeak) — the break line is the brightest structure in both
// frames now. The #kelp=0 revert reproduced the shipped frame to 4 px at
// +-1 LSB (rasterization noise); secondpeak bit-identical.
//
// Anchored, so the noise is static in world space: holdfasts do not advect.
// Requires MODEL_GLSL spliced first (vnoise2, waterDepthM, u_depthMix).
const KELP_GLSL = `
uniform float u_kelpDark;   // 1 = dark-wedge polarity (default); #kelp=0 reverts

// The reef-band gate WITHOUT the clump noise: where the mudstone platform is,
// canopy and lane alike. Same gates and ramps as kelpMask so it introduces no
// new boundary (the blocky-edge lesson). Used by GRID_FRAG's bed albedo.
float kelpBandMask(float depthM){
  float scour = smoothstep(1.2, 3.4, depthM);
  float outer = 1.0 - smoothstep(5.0, 8.5, depthM);
  return scour * outer;
}

float kelpMask(vec2 xz, float depthM){
  // depthM is 99 where a preset has no bathymetry behind it, so the outer gate
  // alone switches the whole canopy off there; u_depthMix is belt-and-braces
  // for a fractional cross-fade.
  float scour = smoothstep(1.2, 3.4, depthM);           // dies on the inner bar
  float outer = 1.0 - smoothstep(5.0, 8.5, depthM);     // authored reef edge
  // Early-out BEFORE the noise (perf, 2026-08-12). The gates above are pure
  // arithmetic; the three octaves below are the expensive part, and outside the
  // 1.2-8.5 m depth band their result is multiplied by zero. That band is a
  // minority of any frame — deep water, dry land and every synthetic preset
  // (depthM = 99) fall outside it — so this skips 3 vnoise2 per fragment on
  // most of the screen, in BOTH stages (GRID_VERT calls this too). Bit-exact:
  // the branch returns the value the full path would have produced.
  if (scour * outer <= 0.0) return 0.0;
  // Patchy, never a sheet: the ortho shows clumps tens of metres across with
  // open lanes between them. Three octaves — ~50 m blobs carry the shape, ~16 m
  // roughens them, and the ~5 m octave sits BELOW the 7 m DEM post so the post
  // grid can never be the finest structure in the mask.
  float p = vnoise2(xz*0.020 + vec2(11.3, -4.1))*0.56
          + vnoise2(xz*0.062 - vec2( 3.7,  8.9))*0.30
          + vnoise2(xz*0.190 + vec2(21.7,  5.3))*0.14;
  // NOTE: not named "patch" — that is a reserved word in GLSL ES 3.0
  // (tessellation), and three.js's WebGL2 prefix makes this file ES 3.0.
  // Thresholds mix on u_kelpDark: shipped 0.24/0.64 (~half coverage), dark
  // wedge 0.08/0.44 (canopy saturates, lanes become channels) — see header.
  float clump = smoothstep(mix(0.24, 0.08, u_kelpDark),
                           mix(0.64, 0.44, u_kelpDark), p);
  float k = scour * outer * clump * clamp(u_depthMix, 0.0, 1.0);
  if (!(k == k)) k = 0.0;   // NaN guard (house rule)
  return clamp(k, 0.0, 1.0);
}
`;

// ---------- marine-layer sky ----------
// Ported from web/'s skyColor() so both renderers share the palette. Noise is
// self-contained (renamed sky*) because the sky-dome material does NOT splice
// MODEL_GLSL — and the rename avoids redefinition where the water fragment
// splices both.
export const SKY_GLSL = `
vec3 sunDir = normalize(vec3(-0.45, 0.42, -0.28));

float skyHash21(vec2 p){ vec3 q = fract(vec3(p.xyx)*0.1031); q += dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float skyNoise2(vec2 p){
  vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(skyHash21(i),skyHash21(i+vec2(1,0)),f.x), mix(skyHash21(i+vec2(0,1)),skyHash21(i+vec2(1,1)),f.x), f.y);
}

vec3 skyColor(vec3 rd, float t){
  // marine-layer haze: near-white horizon, soft grey-blue zenith (ref photos)
  float horiz = pow(1.0 - max(rd.y, 0.0), 2.2);
  vec3 sky = mix(vec3(0.52, 0.62, 0.72), vec3(0.88, 0.90, 0.91), horiz);
  float sun = pow(max(dot(rd, sunDir), 0.0), 300.0);
  sky += vec3(0.9, 0.85, 0.75)*sun*0.8;          // diffuse glow, no hard disc
  // thin high overcast rather than puffy cumulus
  if (rd.y > 0.02) {
    vec2 cp = rd.xz/(rd.y+0.08)*1.6 + vec2(t*0.004, 0.0);
    float cl = skyNoise2(cp)*0.6 + skyNoise2(cp*2.7)*0.3;
    sky = mix(sky, vec3(0.93, 0.93, 0.92), smoothstep(0.5, 0.85, cl)*0.45*smoothstep(0.02,0.2,rd.y));
  }
  return sky;
}
`;

// Everything the displaced surface needs BEFORE the surface functions
// themselves. Factored out of GRID_VERT (2026-08-18) together with
// SURFACE_GLSL below so `curlProbe` (main.js) can evaluate the SHIPPED
// geometry in a fragment pass rather than re-deriving it in JS —
// MEASUREMENT_LESSONS 4: an instrument that scores a replica certifies the
// replica. Composition is unchanged, so GRID_VERT compiles the same text it
// always did.
export const SURFACE_PRELUDE = `
uniform float u_time;   // simulation seconds (speed-scaled, pausable, JS-side)
uniform vec2  u_cell;   // core grid cell size in metres (x, z) — normal FD step
uniform float u_fidelityLook; // 0 current, 1 foam, 2 connected face/lip probe
uniform float u_curl;   // #curl=1: lip overturn (rotation, not throw). Default 0.
uniform float u_earn;   // #earn=0 reverts: over-fill earns bend (floor on the
                        // arc angle inside the #curl branch). Default 1; inert
                        // unless u_curl is on.
uniform float u_legacyDrop; // #drop=legacy: restore the pre-2026-08-18 dropMag
                            // (the one that flattened the pocket). A/B only.
uniform float u_offKnee;    // #knee: soft knee as a FRACTION of the live offset
                            // ceiling. 0 = the pre-2026-08-22 hard clamp
                            // (bit-identical revert). Default OFF_KNEE_FRAC.
uniform float u_lamCap;     // #lamcap=0: revert the wave-derived offset ceiling
                            // S/k back to the flat 20 m. Ships ON.
uniform float u_offUnbound; // instrument (JS-only): remove the bound entirely
                            // to read the raw offset distribution. Never ship.
uniform float u_carrierAmp; // #amp=1: use ocean()'s carrier amplitude in the
                            // choppy solve. Default OFF pending the S re-tune.
uniform float u_sScale;     // instrument (JS-only): scale the cusp parameter S,
                            // for the re-derivation sweep. Default 1.
uniform float u_throwLen;   // #throwlen: express the lip throw as a fraction of
                            // the cusp length S/k instead of face height.
uniform float u_sGrow;      // #sgrow: let the breaking-excess size signal past
                            // the sizeGate and S clamps that were eating it.
${MODEL_GLSL}
${DETAIL_GLSL}
${KELP_GLSL}
`;

export const SURFACE_GLSL = `
// stage rect for the far fade — mirrors STAGE_* in main.js
const vec2 STAGE_HALF   = vec2(300.0, 250.0);
const vec2 STAGE_CENTER = vec2(0.0, 10.0);

// Horizontal-offset bound for choppyPos. OFF_MAX_M is unchanged from the
// original hard clamp (2026-08-10) — this is the mesh backstop, and the
// 2026-08-22 soft knee deliberately does not move it. OFF_KNEE_M is where
// saturation begins; see the long note at the clamp itself.
const float OFF_MAX_M  = 20.0;
// Plunging throw as a fraction of the cusp length S/k. Calibrated against the
// shipped throw at the 1.5 m model-card day — see the note at the throw.
const float THROW_FRAC = 0.30;
// Mesh backstop for the cusp parameter under #sgrow. Deliberately well ABOVE
// the working range rather than inside it: a guard, not a physical statement.
const float S_CAP_HARD = 3.2;
// Same 0.144 ratio the legacy arm's 5.0 -> 0.72 carries, so the connected-look
// probe shrinks the throw identically whichever length it is measured in.
const float THROW_FRAC_FULL = 0.0432;

// far skirt: the stretched outer cells (see main.js) are far bigger than
// LAM and would alias the carrier into low-frequency junk, so displacement
// and its bookkeeping fade to mean sea level; fog has ~killed the surface
// by then, only the fresnel-on-flat-water read remains (which is correct).
// Factored out because M2's displaced-position FD samples need the same fade.
float farFadeAt(vec2 xz){
  vec2 dOut = max(abs(xz - STAGE_CENTER) - STAGE_HALF, vec2(0.0));
  return 1.0 - smoothstep(100.0, 800.0, length(dOut));
}

// Depth-limited DISPLAYED crest height at a station, metres above still water.
// min(H0*Ks, gamma*h) is the wave height the water CAN carry (MODEL.md 2.2, and
// 4.5: physics owns the cap). The sharpened crestShape puts ~0.8 of it above the
// mean, and VIS is the viewing exaggeration the rest of the geometry is drawn
// at — applied AFTER the physical threshold, never inside it (4.5's last row).
// One authority: the #curl bend sizes itself off this, and the crest-height
// instrument reads the same function back off the GPU rather than transcribing
// it into JS (MEASUREMENT_LESSONS 4).
//
// Two entry points, one body: the (dep, Ks) overload is for callers that
// already hold both, so the hot vertex path does not re-fetch the bed for a
// number it computed four lines earlier.
float crestCeilM(float dep, float Ks){
  return clamp(0.8*VIS*min(u_H0*Ks, GAMMA*dep), 0.5, 14.0);
}
float crestCeilM(vec2 xz0){
  float dep = modelDepthM(xz0);
  return crestCeilM(dep, clamp(sqrt((G*u_T/(4.0*PI))/sqrt(G*dep)), 0.7, 2.6));
}

// ---- M2: choppy horizontal displacement (the reason web-three exists) ----
// Tessendorf choppy: each grid point slides horizontally toward the nearest
// crest by lam * grad(h). Sign note: our FD gradient points UP-slope, and
// sharpening means points converge ON crests (the Gerstner parametric form
// offsets by +(Q/k)*dh/dx), so the offset here is +lam*grad — the spec's
// "xy -= lambda*grad" pairs with the spectral -i*k/|k| gradient convention;
// same physical displacement. lam is in world METRES (grad is dimensionless
// slope), so nothing here depends on grid resolution.
// Outs are the model's bookkeeping at the SOURCE point (Tessendorf: material
// properties travel with the displaced point), already far-faded.
vec3 choppyPos(vec2 xz0, float t, out float foam, out float pocket, out float brk, out float crest, out float aer, out float curl){
  float fade = farFadeAt(xz0);
  aer = 0.0;
  curl = 0.0;
  if (fade <= 0.001) {   // deep in the skirt: flat calm, skip 5 ocean() evals
    foam = 0.0; pocket = 0.0; brk = 0.0; crest = 0.0;
    return vec3(xz0.x, 0.0, xz0.y);
  }

  float carrierAmp;
  float h = ocean(xz0, t, foam, pocket, brk, crest, carrierAmp);

  // horizontal height gradient by central FD. e = 2 m: well under LAM/8 so
  // the carrier slope is resolved, but above the finest bore/chop noise so
  // the offset field stays smooth instead of shredding the mesh.
  float e = 2.0;
  vec2 grad = vec2(
    oceanH(xz0 + vec2(e, 0.0), t) - oceanH(xz0 - vec2(e, 0.0), t),
    oceanH(xz0 + vec2(0.0, e), t) - oceanH(xz0 - vec2(0.0, e), t)) / (2.0*e);

  // lambda ramps with steepness near the break line (same shoaling e-fold the
  // model uses to grow the wave), and the pocket term pushes it PAST the cusp
  // limit when xi says plunging: converging points overshoot and the crest
  // folds. Self-intersection accepted per spec — a folding lip that z-fights
  // beats a smooth mound. Spilling sites (low xi, e.g. Privates) keep lam low: crests
  // sharpen a little and the bore stays a mound.
  float d      = breakLine(xz0.x) - xz0.y;        // >0 seaward of the line
  float steep  = exp(-max(d, 0.0)/70.0) * reefWindow(xz0.x);
  float plunge = smoothstep(0.45, 1.25, u_xi);    // Battjes: plunging from ~0.5
  // M6 part 1, CORRECTED 2026-08-11 (size audit, docs/research/SIZE_AUDIT.md).
  // The 2026-08-10 version asserted "Q = lam*k, and Q = 1 is the cusp". That
  // derivation was amplitude-blind and WRONG: for off = lam*grad on
  // h = a*cos(k x), dx/dx0 = 1 - lam*a*k^2*cos, so the cusp is
  //
  //     S := lam * a * k^2 = 1        (not lam*k = 1)
  //
  // With the displayed amplitude a ~ 7 m, a*k ~ 0.49, so the "Q = 1.13"
  // measured yesterday never actually cusped -- the crest sharpened and
  // rounded, which is what the screen showed. Parametrize by S directly and
  // solve lam = S/(a*k^2) from the LOCAL displayed amplitude: the cusp is now
  // reached by construction at S = 1 whatever the amplitude, and S is the one
  // dimensionless overturn knob.
  // M6 part 3: the cusp parameter is S = lam*a*k^2, so k must be the LOCAL
  // wavenumber or the solved lam is wrong by (k_local/k_LAM)^2 — a factor of
  // ~1.9 in 2 m of water. kLocalAt collapses to 2*PI/LAM when u_psiMix is off.
  float kk     = kLocalAt(xz0);
  // ---- THE AMPLITUDE THE SOLVE ACTUALLY WANTS (2026-08-22, #amp=0 reverts) --
  // lam = S/(a*k^2) is solved from h = a*cos(k*x), where 'a' is the CARRIER's
  // amplitude. This read it off abs(h) — the instantaneous DISPLACEMENT, a
  // different quantity that goes to zero twice a period. Every pathology in
  // this neighbourhood traces back to that substitution:
  //   * the trough creases (lam blowing up over near-flat water — the
  //     2026-08-11 "pack ice" polygonal crack web, whose fix was to FLOOR the
  //     estimate rather than to stop using the wrong signal);
  //   * the 20 m offset clamp's pile-up, because |off| = lam*|grad| runs away
  //     wherever the true slope outruns aEst*k (measured 2026-08-22: raw
  //     offsets to 73.6 m on a ~5 m crest band);
  //   * and the floor itself, which only existed to paper over the first.
  // ocean() has held the honest number all along (amp = 0.5*Heff*grow*decay*
  // env*shoreFade) and now hands it out. Carrier only — no chop, no boil, no
  // whitewater mound, no setup lift — which is exactly right: those are the
  // terms that were polluting the estimate, and none of them is in the model
  // the cusp solve is derived from.
  //
  // The clamp stays as a guard, not as a mechanism. The LOW end can be far
  // smaller now (a genuinely small carrier in the lull SHOULD sharpen little)
  // but not zero, or lam divides by nothing; the high end is unchanged.
  // #amp=0 restores the abs(h) estimate and its 0.30*H0*VIS floor verbatim, so
  // the A/B is exact and every measurement above can be re-run against it.
  float aLegacy = clamp(abs(h), max(0.6, 0.30*u_H0*VIS), 12.0);
  float aTrue   = clamp(carrierAmp, 0.05, 12.0);
  float aEst    = u_carrierAmp > 0.5 ? aTrue : aLegacy;   // displayed metres
  // M6 part 1c: size enters through the breaking excess. ocean() computes
  // Hsh/Hlim for the foam gate; the curl never saw it. Recomputed here (4
  // lines) rather than widening ocean()'s signature, which both vehicles
  // splice. NOTE (audit master finding): inside the surf zone the surface
  // height itself is H0-INVARIANT (amp = 0.5*gamma*dep once depth-limited), so
  // this gate is the ONLY route size has into the fold until M4 lets the break
  // move seaward into deeper water. At the fixed line excess scales ~linearly
  // with H0 (0.7 m day ~ 0.6, 1.5 m ~ 1.0-1.2, 2.5 m ~ 1.5 clamped), so big
  // days fold harder and small days crumble, from one physical number.
  float depQ    = modelDepthM(xz0);
  float KsQ     = clamp(sqrt((G*u_T/(4.0*PI))/sqrt(G*depQ)), 0.7, 2.6);
  float excessQ = (u_H0*KsQ) / max(GAMMA*depQ, 0.05);
  // ---- the size signal, and the three clamps that were eating it (#sgrow) --
  // MEASURED at sewers pocket stations: mean breaking excess runs 0.43 / 0.95 /
  // 1.62 / 1.94 across H0 0.7 / 1.5 / 2.5 / 3.0 — a clean 4.5x monotone size
  // signal, exactly what "a bigger day breaks harder" should feed on. It was
  // then discarded twice before reaching a pixel: sizeGate clamps it at 1.5
  // (saturating by H0 2.5 — measured 1.487 -> 1.500 from 2.5 to 3.0) and S
  // clamps the sum at 1.8. That is why the throw saturates at BOTH forms
  // (16.01 -> 16.03 shipped, 15.27 -> 15.31 cusp-length) and why re-expressing
  // it in the wave's own length changed nothing: the length was never the
  // problem, the caps were.
  //
  // The card day sits at excess 0.95, right at the breaking limit — so growth
  // keyed to (excessQ - 1) is exactly ZERO there and the calibration day is
  // unchanged BY CONSTRUCTION, not by tuning. Below the limit nothing changes
  // either; only days that genuinely break harder than the card day get more.
  //
  // The hard cap survives as a mesh backstop, but well above the working range
  // rather than inside it — the distinction OFF_MAX_M failed to make before
  // #lamcap, one level up. And letting S grow is only safe BECAUSE of #lamcap:
  // the offset ceiling is S/k, so it grows with S instead of being outrun by it.
  float sizeGate = mix(1.0, clamp(excessQ, 0.0, mix(1.5, 3.0, u_sGrow)), u_depthMix);
  float connectedLook = step(1.5, u_fidelityLook);
  // S calibrated against the old convergence at the 1.5 m model-card day
  // (approach ~0.42, full pocket on plunging ~1.4 before the gate). Field
  // diagnosis at the sim-42 Cliff peak showed that the shared 0.42 approach
  // term still bunched several shore-normal rows into a hard planar wall even
  // with structural anatomy and plunge disabled. Full keeps the pocket-owned
  // break sharpening but halves the broad approach compression, restoring a
  // curved lead-in to the hinge. Current/foam retain the authored 0.42 path.
  // ---- Sapp's missing gate (2026-08-22, rides with #amp=1) ---------------
  // Sover is gated by sizeGate, i.e. by the BREAKING EXCESS Hsh/(gamma*h).
  // Sapp never was: it is exp(-d/70)*reefWindow, pure geometry, so it
  // sharpens water by PROXIMITY TO THE LINE whether or not that water is
  // anywhere near breaking. Under the old floored amplitude estimate that was
  // harmless — the floor capped lam — and it is precisely what breaks when the
  // honest carrier amplitude arrives: in a lull or the far field, a -> 0 while
  // Sapp stays at full strength, so lam = S/(a*k^2) has nothing left to divide
  // by. That is the measured 145 m tail, and it is why removing the floor on
  // its own made things worse.
  //
  // So the floor is not replaced by a smaller floor; it is replaced by the
  // physics it was standing in for. A wave sharpens as it approaches breaking,
  // and "approaching breaking" is a quantity this function already computes.
  // Gated on u_carrierAmp because the two are ONE change: the honest amplitude
  // needs the honest gate, and the legacy arm must stay bit-identical.
  float appGate = mix(1.0, smoothstep(0.35, 0.95, excessQ), u_depthMix*u_carrierAmp);
  float Sapp   = mix(0.42, 0.22, connectedLook) * steep * appGate;
  float Sover  = (0.15 + 1.30*plunge) * pocket * sizeGate;
  // u_sScale: INSTRUMENT for the 2026-08-22 S re-derivation. With the honest
  // carrier amplitude (#amp=1) every constant feeding S is mis-scaled, because
  // all of them were fitted against an estimate that ran ~1.6x the carrier at
  // crests. Rather than guess a new set, scale the whole sum and measure which
  // factor reproduces the shipped fold statistics — that factor IS the
  // mis-scaling, read off the output instead of derived from algebra. Default
  // 1.0, so the shipped path is untouched; JS-only (setSScale).
  // ---- the singularity, removed by construction rather than clamped -------
  // excessQ above is computed from u_H0 — the DAY's swell height — so it is
  // blind to the set envelope and cannot tell a lull from a peak. That is why
  // gating Sapp on it improved the bulk and left the tail untouched. Meanwhile
  // aTrue's 0.05 m low clamp permits lam = S/(a*k^2) ~ 2000 m at a single
  // station, which is the 145 m outlier.
  //
  // Clamping 'a' harder would be another floor. The honest statement is that a
  // wave sharpens IN PROPORTION TO ITS OWN SIZE: a tiny carrier in a lull is
  // nowhere near cusping. Make S proportional to the carrier and the
  // singularity cancels algebraically —
  //     lam = S/(a*k^2) = (S0*a/aRef)/(a*k^2) = S0/(aRef*k^2)
  // — finite as a -> 0, with no floor anywhere. aRef is the same reference the
  // retired floor used (0.30*H0*VIS), so at the calibration amplitude the gate
  // is 1 and nothing moves. Under the amp arm only.
  float ampGate = mix(1.0, clamp(aTrue / max(0.30*u_H0*VIS, 0.05), 0.0, 1.0), u_carrierAmp);
  // The cap grows with how far past the breaking limit this water is. Zero
  // growth at excess <= 1 (the card day and below), so that day is bit-exact.
  float sCap   = mix(1.8, min(1.8 + 0.8*max(excessQ - 1.0, 0.0), S_CAP_HARD), u_sGrow);
  float S      = clamp((Sapp + Sover) * u_sScale * ampGate, 0.0, sCap);      // >1 folds; cap guards the mesh
  // Field-fidelity probe: the old full over-cusp range produced a broad
  // self-intersecting sheet. From the cliff camera its DoubleSide underside
  // read as several detached black manta polygons, not one wave face. Keep
  // the authored fold untouched for current/foam; full stops just before the
  // cusp so the crest can hinge visually without becoming a separate ribbon.
  if (connectedLook > 0.5) S = min(S, 0.98);
  // #curl division of labour: the choppy term takes the crest TO the cusp and
  // stops there (S = 1 is the vertical tangent, by construction above); the
  // rotation below owns everything past it. Left uncapped, two mechanisms fold
  // the same band and their overhangs compose into a self-intersection the
  // grid cannot carry (S alone already reaches 1.8 at Sewers).
  if (u_curl > 0.5) S = min(S, 1.0);
  float lam    = S / (aEst * kk * kk);

  vec2 off = lam * grad;

  // Structural face anatomy. On the shoreward/front quadrant of the carrier,
  // pull the face down into a concavity before throwing the crest ribbon over
  // it. This negative space is the cliff-scale barrel cue; simply increasing
  // the whole wave would leave the old rounded mound.
  float thetaRaw = 2.0*PI/u_T*t - rayPhase(xz0);
  float frontPhase = smoothstep(0.02, 0.78, -sin(thetaRaw))
                   * smoothstep(-0.35, 0.82, cos(thetaRaw));
  float hingeSigma = mix(9.0, 16.0, connectedLook);
  float hingeBand = exp(-(d*d)/(2.0*hingeSigma*hingeSigma))*reefWindow(xz0.x);
  float anatomy = clamp(u_breakShape, 0.0, 1.0)*plunge;
  // Full trades the narrow/deep cut for a wider, shallower sloping face. The
  // dark pocket therefore belongs to the face all the way up to the lip.
  h -= mix(0.34, 0.20, connectedLook)*u_H0*VIS*frontPhase*hingeBand*anatomy;

  // lip throw & curl: toward-crest convergence folds the crest symmetrically;
  // a plunging lip is thrown SHOREWARD (+z) and curled DOWNWARD (-y).
  // This forms a cycloid-like barrel instead of a flat horizontal overhang.
  // M6 part 1a: VIOLENCE IN METRES. This used hN = h/(H0*VIS) -- face height
  // NORMALIZED by the swell height -- so a 2.5 m day threw its lip exactly as
  // far as a 0.7 m day. Shape stays xi-governed (plunge); the throw and drop
  // now scale with the actual face height in metres, calibrated so the 1.5 m
  // model-card day renders identically to the old constants
  // (7.5*hN = 7.5*hM/1.5 = 5.0*hM at H0 = 1.5; likewise 3.5*hN^2 = 1.55*hM^2).
  // hM capped at 3.5 m: the biggest physical face this stage produces is
  // ~3.2 m at H0 = 2.5, and the 20 m offset clamp below still backstops the
  // mesh. Honest-physics note (TODO mission 1): bigger H0 also LOWERS measured
  // Iribarren, so size buys violence here, not barrel shape -- hollowness
  // stays the conditions bank's job.
  float hM = clamp(h / VIS, 0.0, 3.5);              // physical face height, m
  float lipJit = 0.65 + 0.7*vnoise2(vec2(xz0.x*0.11, t*0.45));

  float lipTip = mix(1.0, 1.0 + 0.65*frontPhase, anatomy);
  lipTip = mix(lipTip, 1.0 + 0.18*frontPhase*anatomy, connectedLook);
  // #curl replaces this pair (see the rotation below), it does not stack on
  // top of them: throw/drop translate the crest band without preserving its
  // thickness, which is precisely the "thin shell" read the rotation exists to
  // fix. Blending rather than branching so the two are one continuum.
  float legacyLip = 1.0 - clamp(u_curl, 0.0, 1.0);
  // ---- the throw, in the wave's own length (2026-08-22, #throwlen) --------
  // CONVICTED BY THE ARGMAX, not by argument. At sewers t=42 the largest raw
  // offset in the stage is 145.4 m, at x = 0, 7.3 m shoreward of the break
  // line in 3.67 m of water with pocket 0.80. Disabling the throw and drop
  // (#curl=1 -> legacyLip = 0) drops it to 94.0 m at the same station, so THIS
  // TERM CONTRIBUTES ~51 m of horizontal displacement on a crest whose ceiling
  // is 7.34 m.
  //
  // The form is why. mix(5.0, 0.72)*pocket*plunge*hM*lipJit*lipTip is metres of
  // FACE HEIGHT times a magic 5.0 and three dimensionless factors: a magnitude
  // with no length of the WAVE's in it, exactly the defect the offset bound had
  // before #lamcap, and bounded by nothing until the final ceiling catches it.
  // hM is also capped at 3.5 m, so on a big day the throw stops growing with
  // the wave and just saturates — the same size-blindness SIZE_AUDIT went
  // through the foam terms to remove.
  //
  // The honest length is the one this function already computes for the
  // ceiling: S/k, the cusp length (S = 1 and |off| = 1/k are the same
  // statement; 1/k = LAM/2pi is the Gerstner cusp radius). A plunging jet is
  // thrown a fraction of it, and that fraction is dimensionless and
  // size-free — so the throw shoals with the wavelength on its own, grows with
  // the overturn through S, and can never outrun the ceiling that bounds the
  // whole offset, because it is measured in the same units as that ceiling.
  //
  // THROW_FRAC is calibrated below, not guessed. #throwlen=0 is the exact
  // revert; the arms are a uniform branch so each is bit-exact.
  float throwLen = S / max(kk, 1e-4);          // the cusp length, metres
  float throwMag;
  if (u_throwLen > 0.5) {
    // connectedLook tempers the throw here exactly as it does in the legacy
    // arm (5.0 -> 0.72, a factor 0.144): the #look=full probe's whole claim is
    // a connected hinge instead of a detached thrown ribbon, and that claim is
    // independent of which length the throw is measured in.
    throwMag = mix(THROW_FRAC, THROW_FRAC_FULL, connectedLook)
             * pocket * plunge * lipJit * lipTip * throwLen;
  } else {
    throwMag = mix(5.0, 0.72, connectedLook)
             * pocket * plunge * hM * lipJit * lipTip;
  }
  if (!(throwMag == throwMag)) throwMag = 0.0;   // NaN guard (house rule)
  off.y += throwMag * legacyLip;

  // Curl downward. LINEAR in face height — the first metre-calibration kept
  // the old quadratic (1.55*hM^2) and the critique caught it eating the crest
  // at size: ~7.5 m of drop on a 2.5 m day, so the big face subtended barely
  // more screen than the 1.5 m one. A fall distance scales like the height
  // fallen from, not its square. 3.0*hM matches the old drop at the 1.5 m
  // model-card day (3.5*hN^2 = 5.9 m ~ 3.0*1.95).
  //
  // ---- RE-SCOPED 2026-08-18 (the pocket-crest audit). ------------------
  // WHAT IT IS FOR, AND WHETHER THAT SURVIVES. dropMag was added
  // 2026-08-10 (3e28d38) "so a plunging lip forms a cycloid-like barrel
  // rather than a flat horizontal overhang": throwMag translates the crest
  // band SHOREWARD at constant height, so the throw alone leaves a flat
  // shelf. That defect is still live on the default path — #wrap is the foam
  // clock, #arm is the peel arm, #lip is fragment colour, and #curl (the
  // honest cure: a bend that lowers as it pitches) is flag-gated OFF. So the
  // term is NOT retired: something has to bend the thrown ribbon down.
  //
  // WHAT WAS WRONG WAS WHERE IT APPLIED. It was proportional to
  // hM = h/VIS — the height it is subtracted FROM — and weighted only by
  // pocket. That makes it a MULTIPLICATIVE shrink of the whole water
  // column wherever the wave is breaking: h -= (3.0/VIS)*pocket*plunge*... *h,
  // i.e. up to ~0.94*h at pocket = 1. So the wave was FLATTEST EXACTLY WHERE
  // THE DEPTH LIMIT SAYS IT MUST BE TALLEST. Measured before the fix
  // (scripts/measure_pocket_crest.mjs, Sewers q=high, sims 36-54, 4 clocks x
  // 36 stations): median crest / depth-limited ceiling = 0.78 at pocket
  // stations against 1.05 away from the pocket, and monotone in pocket —
  // 1.015 / 0.772 / 0.467 for pocket at apex in [0,0.2) / [0.2,0.4) /
  // [0.4,0.6). Sharks (xi 0.45) showed no defect at all, which is the
  // mechanism confirming itself: plunge = 0 there, so dropMag is 0.
  //
  // THE FIX, in two terms that were both already in this function:
  //  * PROPORTIONAL TO frontPhase, which is ZERO AT THE CREST (it gates on
  //    -sin(thetaRaw), and the crest is theta = 0) and peaks ~0.9 rad
  //    SHOREWARD of it. That is the already-gone-over side — the water that
  //    should fall. The crest line itself is what the depth limit says must
  //    stand up, so nothing may pull it down. frontPhase was previously only
  //    a weak modulator here (mix(1.0, 0.72+0.82*frontPhase, anatomy)) and
  //    vanished entirely when u_breakShape = 0; the defect does not care
  //    about breakShape, so neither does the fix.
  //  * SCOPED TO THE BAND ABOVE THE BEND LINE and keyed to the height above
  //    it, not to h. Same 0.35*h_crest line #curl bends from, from the same
  //    crestCeilM authority, so the two mechanisms agree about where the lip
  //    starts. Below it the face is untouched and keeps standing.
  // Written as a FRACTION of that band, clamped below 1: a drop that could
  // exceed the band would invert the crest, which is the failure mode being
  // removed, not a stronger version of the effect. 0.80 is calibrated to
  // land the same violence on the front face as the old term did at the card
  // day (0.80*dyD ~ 3.9 m against 3.0*hM = 5.9 m) while leaving the crest at
  // its ceiling; the 0.28/3.0 ratio of the #look=full arm is preserved.
  // MEASURED AFTER: pocket fill 0.78 -> 1.08 (per clock 1.12/1.11/1.08/1.01),
  // neighbours unchanged at 1.05 — which is the calibrated norm, not 1.0:
  // crestCeilM is a reference height and non-breaking water sits just over it.
  //
  // #drop=legacy restores the pre-fix term verbatim for the A/B. Uniform
  // branch, not a mix, so each arm is exact (the #curl precedent above).
  float yBendD = 0.35*crestCeilM(depQ, KsQ);
  float dyD    = max(h - yBendD, 0.0);
  float dropMag;
  if (u_legacyDrop > 0.5) {
    dropMag = mix(3.0, 0.28, connectedLook)
            * pocket * plunge * hM * lipJit
            * mix(1.0, 0.72 + 0.82*frontPhase, anatomy);
  } else {
    dropMag = clamp(mix(0.80, 0.075, connectedLook)
                    * pocket * plunge * lipJit * frontPhase, 0.0, 0.85) * dyD;
  }
  if (!(dropMag == dropMag)) dropMag = 0.0;   // NaN guard (house rule)
  h -= dropMag * legacyLip;

  // ---- #curl: the lip overturns (2026-08-18, flag-gated, default OFF) ----
  // WHY A BEND AND NOT MORE THROW. Everything above this line is a
  // single-valued height field plus a horizontal offset. ocean()'s forward
  // pitch is a PHASE SKEW (theta -= skew*sin(theta)): it can drive the front
  // face toward vertical and can never pass it, because an overhang is
  // multivalued in z and no reparametrisation of a single-valued h(theta) is.
  // The choppy term CAN fold the MESH (that is what S > 1 means, and the
  // shipped renderer does reach it at Sewers), but it folds symmetrically
  // about the crest, and the throw/drop pair above then TRANSLATES the crest
  // band without preserving its thickness — worse, dropMag subtracts up to
  // ~3*hM at the pocket, so the shipped wave is at its FLATTEST exactly where
  // it should be at its tallest. Measured at Sewers, x = -104, sim 36: the
  // pocket crest stood 5.5 m against 8.3 m on the same wave one station away.
  // That is the "smooth rounded dune / thin shell" read (Andy, 2026-08-18).
  //
  // A plunging lip is a BEND: the upper face curves forward onto a circular
  // arc of radius R, the jet leaves the crest tangentially and comes over. The
  // classical bend deformer is exact and cheap — a point dy above the bend
  // line travels to arc angle th = dy/R:
  //
  //     dz = dy*(1 - cos th)/th ,   y = yBend + dy*sin(th)/th
  //
  // Three properties matter here, and they are why this replaces the rotation
  // that was tried first (FALSIFIED, see below):
  //   * it NEVER LIFTS. sin(th)/th <= 1, so no vertex ends higher than it
  //     started; the crest lowers as it pitches, which is what a real one does.
  //   * arc length is preserved, so the band KEEPS ITS THICKNESS — the curl
  //     projects as a tube with volume rather than a zero-thickness sheet.
  //   * it overhangs where the face is steeper than 1/sin(th). dz'/dz0 =
  //     1 + sin(th)*dh/dz0, and dh/dz0 is strongly negative on a cusped face,
  //     so past ~90 deg of bend the map z0 -> z folds by construction.
  //
  // FALSIFIED, 2026-08-18: a rigid rotation of the crest band about a pivot on
  // the crest line (phi up to 2.35 rad, pivot 0.12-0.45*hCrest). A rotation
  // lifts everything seaward of its pivot by -dz*sin(phi), and since h falls
  // going seaward while that lever grows, the two nearly cancel — the crest
  // came out as a FLAT-TOPPED SLAB, a rectangular block sitting on the water
  // (scratchpad evidence/curl, sewers_cliff_sim36_curl-on). Narrowing the
  // seaward tail to 0.55 sigma did not fix it (apex 8.8 -> 12.4 m, +41% over
  // the depth-limited ceiling). The bend has no pivot and therefore no lever.
  //
  // UNIFORM BRANCH, not a mix: with the flag off the shipped image must be
  // bit-identical, and the bend is only the identity to within float rounding.
  // The branch is uniform, so the default path pays nothing for this.
  if (u_curl > 0.5) {
  // Displayed crest height at this station — the depth-limited ceiling, shared
  // with the crest-height instrument and with dropMag's bend line above
  // (crestCeilM). No new authority: the same KsQ/depQ the excess gate uses.
  float hCrest = crestCeilM(depQ, KsQ);
  // WHERE THE BEND STARTS. Below this the face is untouched, so it keeps
  // standing while the lip goes over it; above it the water curves forward.
  float yBend  = 0.35*hCrest;
  if (h > yBend) {
    float dyB = h - yBend;
    // WHICH water bends: only near the crest line. The crest at this station
    // is at theta = 0, and rayPhase grows shoreward at k, so the crest sits
    // theta/k_z metres away in z. k_z is the SHORE-NORMAL component — crests
    // are oblique by swellPhi, so the along-z spacing is k*cos(phi), floored
    // (a 76 deg swell would otherwise put the crest at infinity).
    float kz     = max(kk*cos(swellPhi()), 0.25*kk);
    float thetaW = mod(thetaRaw + PI, 2.0*PI) - PI;    // wrapped to (-PI, PI]
    float dzC    = -thetaW/max(kz, 1e-3);              // + shoreward of the crest
    // xi sets CHARACTER, exactly as it does for the foam: a plunging lip is
    // COMPACT and thrown clear of the face, a spilling one barely overturns
    // and smears along the crest. Same Battjes 0.45-1.25 smoothstep the rest
    // of the lip machinery uses. Scaled BY THE CREST HEIGHT rather than fixed
    // in metres — a jet is a fraction of the wave it comes off, so a small day
    // must not throw a curtain sized for a big one.
    float sigZ  = clamp(mix(0.85, 0.50, plunge)*hCrest, 2.5, 10.0);
    float bandZ = exp(-(dzC*dzC)/(2.0*sigZ*sigZ));
    // HOW HARD it bends. 1/R in units of the crest height, so the barrel
    // radius scales with the wave: 0.30 at pure spilling (a crest that rounds
    // over, ~11 deg of bend at the top) and 2.60 at full plunge (R ~ 0.38
    // hCrest, ~97 deg at the top — past vertical, the lip is over).
    // HOW FAR PAST THE LIMIT the wave is — the same breaking excess the phase
    // skew keys off (MODEL.md 2.2), so the overturn arrives when and where the
    // model already says the wave is breaking, and takes its size dependence
    // through the same route. pocket keeps it attached to the TRAVELLING
    // breakpoint, so the lip peels down the point with the zipper.
    // FALSIFIED FIRST CUT: smoothstep(0.95, 1.40, excessQ) as the gate. It
    // reads like the right shape and is self-defeating — AT the break line
    // excess is ~1.0 by construction (that locus IS H0*Ks = gamma*h), so it
    // evaluated to 0.03 exactly where pocket = 1, and only reached 1.4 well
    // inshore where pocket had already decayed. Measured at Second Peak,
    // sim 36/48: best station pocket 0.99, overturn 3.4 deg. Linear clamp
    // instead, the same idiom as sizeGate above.
    float overGate = mix(1.0, clamp(excessQ, 0.0, 1.5), u_depthMix);
    float kEff = (mix(0.30, 2.60, plunge)/max(hCrest, 0.5))
               * overGate * pocket * bandZ * (0.80 + 0.30*lipJit);
    float th   = clamp(dyB*kEff, 0.0, 2.30);   // 132 deg; the mesh backstop
    // ---- over-fill earns overturn (#earn=0 reverts; 2026-08-25) ----------
    // THE DECISION on "crestCeilM is a reference height, not a clamp"
    // (TODO 2026-08-19, PSI_SPEC Phase 3): it stays a reference. Standing a
    // few percent over it is legal — the measured norm at month=card is
    // ~1.05 across all six mapped sites, and clamping was the old dropMag
    // world (and the facet-slab lesson: hard limits on fields make planes).
    // But water that is over the reference AND breaking may not simply
    // STAND; the over-limit height is routed into the bend instead. The
    // head block (fill 1.13, bend only 50 deg at the top vertex) is exactly
    // the case the multiplicative gates cannot reach: kEff decays with
    // pocket at the break head, so the tallest water gets the least bend.
    // A floor on the arc angle inverts that: from the bend's own map,
    // apex-back-at-the-ceiling means sin(th)/th = 0.65/(fill - 0.35), and
    // the floor is that angle — zero at fill <= 1 by construction, growing
    // with the over-fill, so over-fill EARNS overturn instead of standing.
    // sqrt(6(1-r)) inverts sin(th)/th to 3% over the working range; the
    // (1 + 0.22(1-r)) factor trims that to < 1.5% (checked r = 0.5..0.9).
    // Gates on the floor, each with a reason: pocket (breaking-ness — a
    // non-breaking crest over the reference keeps standing, which IS the
    // decision) and the bend's own plunge blend (character: a spiller's
    // over-fill crumbles at ~1/3 of the return angle rather than being
    // thrown — forcing the full return at Sharks would plunge-ify a spilling
    // wave, the invariant PSI_SPEC Phase 0 names). Deliberately NOT bandZ:
    // the head's apex sits OFF the crest phase line (forward pitch and chop
    // move the tallest water away from theta = 0), so bandZ is ~0.35 exactly
    // at the block — gating the floor by it reproduces the failure the floor
    // exists to fix (measured 2026-08-25: with bandZ in the gate the head
    // row was bit-identical across arms). The floor's own trigger already
    // scopes it: fill > 1 only happens on crest-top water, and pocket keeps
    // it at the travelling breakpoint.
    float fillQ  = h/max(hCrest, 0.5);
    float rNeed  = clamp(0.65/max(fillQ - 0.35, 1e-3), 0.0, 1.0);
    float thNeed = sqrt(6.0*(1.0 - rNeed))*(1.0 + 0.22*(1.0 - rNeed));
    float earnG  = smoothstep(0.10, 0.40, pocket) * mix(0.30, 1.0, plunge);
    if (u_earn > 0.5) th = min(max(th, thNeed*earnG), 2.30);
    if (!(th == th)) th = 0.0;                 // NaN guard (house rule)
    // Stable arc form: the (1-cos th)/th and sin(th)/th factors are written
    // over th, not over kEff, so kEff -> 0 is the identity with no divide.
    float sTh = th > 1e-4 ? sin(th)/th : 1.0;
    float cTh = th > 1e-4 ? (1.0 - cos(th))/th : 0.0;
    off.y += dyB*cTh;
    h      = yBend + dyB*sTh;
    curl   = th/PI;   // hook for the lip-aeration path: turns of overturn
  }
  }

  // ---- aerated lip (#lip=1, read by GRID_FRAG through u_lipAer) ----------
  // The curl was CLEAN GLASS: the fold above is pure geometry, every foam
  // term paints the surface band behind the line, and in field footage the
  // plunging lip is the whitest thing in frame — aerated water, born AT the
  // lip (Andy, 2026-08-18 live; hero-read criterion 3, "curl locatable").
  // Keyed to the fold's own mechanism variables, not to a screen-space band:
  //  * curtain — plunging overturn. Gated on the cusp parameter S = Sapp +
  //    Sover (pre-cap: the cap protects the mesh, not the physics claim) so
  //    aeration begins where convergence actually approaches the fold, and
  //    weighted by the applied lip throw normalized by the physical face
  //    height, which puts full white exactly on the thrown ribbon — BOTH
  //    sides of it, so the documented #look=full dark fold-underside facets
  //    (the "manta" class) are covered by the honest aerated curtain.
  //  * spill — low-xi crests aerate gently at the crest instead of throwing
  //    a curtain (Battjes): a capped pocket term, no S gate, so Sharks/
  //    Privates crumble white at ~a third of Sewers' curtain.
  // pocket carries env2/reef (lulls stay dark — no standing white stripe)
  // and the H_eff footprint; aerSize re-applies the sheltered-height
  // brightness the hM normalization divided out (identity at the 1.5 m
  // model-card day, the sizeAmp contract). breakMask: a section gap is line
  // transport, not a breaking crest — no aerated lip there. Early-out keeps
  // the texture fetches off the ~99% of vertices with no pocket.
  // THE CURTAIN KEY: how much of the lip has actually gone over. Which term
  // answers that depends on which mechanism is drawing the lip, and the two
  // contradicted each other until 2026-08-18. With #curl OFF the lip IS the
  // throw, so the applied throw normalized by face height is the honest key.
  // With #curl ON, throwMag is still computed but NEVER APPLIED (legacyLip = 0
  // — the lip bends onto an arc instead), so keying on it painted an aerated
  // curtain across water that has no lip in it. curl = theta/PI, the turns of
  // overturn the bend actually performed, is the same quantity measured on the
  // mechanism that is running; the bend already writes it (as vCurl) and this
  // is what it was written for. Full white by half a turn: past 90 deg the lip
  // is over and its underside is the aerated face. The 0.10 floor keeps the
  // long spilling tail of the bend (a few degrees, out where bandZ is dying)
  // from painting a standing white smear.
  float lipKey = u_curl > 0.5 ? smoothstep(0.10, 0.50, curl)
                              : clamp(throwMag / max(1.2*hM, 0.5), 0.0, 1.0);
  float aerCurtain = smoothstep(0.80, 1.15, Sapp + Sover) * lipKey;
  float aerSpill   = 0.30 * pocket * (1.0 - plunge);
  aer = max(aerCurtain, aerSpill);
  if (aer > 0.003) {
    float aerSize = mix(1.0, clamp(u_H0*shelterAt(xz0.x)/1.5, 0.70, 1.40), u_depthMix);
    aer = clamp(aer * aerSize, 0.0, 1.0) * breakMask(xz0.x);
  } else {
    aer = 0.0;
  }
  if (!(aer == aer)) aer = 0.0;   // NaN guard (house rule)

  // guards: bounded (foam-front FD spikes must not shred the mesh), finite,
  // and faded with the skirt exactly like the height
  //
  // ---- SOFT KNEE (2026-08-22, #knee=0 reverts) --------------------------
  // THE BOUND WAS A FACET GENERATOR. This was min(offLen, OFF_MAX_M): every
  // vertex whose desired offset exceeded the bound was mapped onto the SAME
  // sphere of radius OFF_MAX_M, so relative displacement across the whole
  // over-limit neighbourhood collapsed to zero and the mesh rendered a PLANE
  // with a ruler-straight silhouette — the "white faceted slab on the crest"
  // (Andy, live, 2026-08-22).
  //
  // Measured at sewers/lineup sim 42 (27,000 samples, 45 transects, defaults):
  // the |off| histogram decays monotonically through the 16-18 m bin —
  // 1599 / 979 / 652 / 504 / 430 / 247 — and then SPIKES to 1135 in 18-20 m,
  // with 892 samples (3.3%) at >= 19.5 m and max exactly 20.00. A tail does
  // not do that; a pile-up against a wall does. Those vertices carry mean
  // pocket 0.222 against 0.042 for the field at large, i.e. they sit on the
  // breaking crest, which is where the slab is seen.
  //
  // NOT THE LIP THROW, and this change does not pretend to fix that argument.
  // #curl=1 computes throwMag and never applies it (legacyLip = 0) and caps S
  // at 1.0: the pile-up goes 892 -> 922, i.e. unchanged. #look=full, which
  // drops the broad approach term Sapp 0.42 -> 0.22, halves it: 892 -> 400.
  // So the DRIVER is Sapp. That is a taste call about how much the approach
  // should converge and it belongs to the #look unbundling, not here.
  //
  // What this change does is mechanical and orthogonal: keep the SAME bound,
  // remove the CORNER. Identity below the knee, then tanh-saturating to
  // OFF_MAX_M:
  //
  //     |off| <= k :  |off|
  //     |off| >  k :  k + (M - k)*tanh((|off| - k)/(M - k))
  //
  // Three properties are the reason it is this map and not a rescale:
  //   * C1 at the knee (tanh'(0) = 1), so nothing kinks where it engages;
  //   * STRICTLY MONOTONIC above it, so distinct desired offsets stay
  //     distinct — the neighbourhood keeps its relative displacement and
  //     compresses instead of flattening, which is the whole point;
  //   * it never REACHES M, so the mesh backstop the hard clamp existed for
  //     is strictly tighter than it was, not looser.
  // k = 15 m leaves 94.3% of samples bit-identical (measured: 5.74% of
  // samples exceed 15 m). tanh is written out because this material compiles
  // as GLSL ES 1.00 (three.js ShaderMaterial, no glslVersion: GLSL3), where
  // tanh() does not exist.
  //
  // ---- MEASURED AFTER, AND IT IS A PARTIAL FIX. Do not read it as more. ----
  // Same rig, same clocks, three arms in one build:
  //   hard clamp   : 892 samples >= 19.5 m (3.30%), 2 sitting exactly on 20.00
  //   soft knee k=15: 667 (2.47%), ZERO on the bound  -- -25%, and the
  //                   coincident-vertex population is gone by construction
  //   UNBOUNDED    : 1073 samples over 20 m, max 73.6 m
  // So the raw field genuinely wants to move up to 73.6 m on a ~5 m crest
  // band. The knee asymptotes at 20, so those 4% are no longer identical but
  // are still compressed into the last 2 m, and the faceted slab is still
  // visible from the lineup camera. The corner is gone; the crowding is not.
  //
  // THE ROOT CAUSE IS UPSTREAM OF THIS BOUND, in lam = S/(aEst*kk*kk).
  // The over-20 m samples carry mean pocket 0.317 against 0.042 for the field
  // at large (7.5x) at median y 1.84 m -- the mid-face under the pocket, where
  // Sover drives S toward 1.8 while aEst is modest. Re-measured on the
  // UNBOUNDED arm, so the numbers are not saturated (the first pass of this
  // A/B was run on clamped output, where two different S values both exceed
  // the bound and read identical -- that comparison could not have discovered
  // a difference and should not have been trusted):
  //   shipped                          1073 over 20 m, max 73.6, mean 4.49 m
  //   #curl=1     (S capped at 1.0)    1036 (-3%),     max 70.9, mean 4.31 m
  //   #look=full  (Sapp 0.42 -> 0.22)   519 (-52%),    max 60.0, mean 2.70 m
  // Sapp is confirmed as the driver on unsaturated data, and the cusp cap is
  // confirmed irrelevant to it. But even Sapp = 0.22 leaves a 60 m tail, so
  // halving the approach term is not a bound either. The next fix is to bound
  // lam IN ITS OWN TERMS -- against the local crest spacing, the Tessendorf
  // convention, which is a length the wave supplies -- rather than against a
  // magic 20 m in world space downstream of it.
  //
  // ---- THE CEILING IS THE WAVE'S, NOT A CONSTANT (#lamcap=0 reverts) -----
  // OFF_MAX_M = 20 m is a world-space number with no wave in it. It cannot be
  // right at two sizes at once, and it was measured above to be the wrong KIND
  // of bound: the field wants 73.6 m, so a constant ceiling can only decide how
  // hard to crush the overshoot, never whether the overshoot is legitimate.
  //
  // There is an exact length to bound against, and this function already
  // computes both of its factors. For off = lam*grad on h = a*cos(k*x),
  // dx/dx0 = 1 - lam*a*k^2*cos, so S := lam*a*k^2 = 1 is the cusp (the note at
  // S's declaration derives this). At the steepest point |grad| = a*k, so
  //
  //     |off| = lam*|grad| = (S/(a*k^2))*(a*k) = S/k
  //
  // i.e. S = 1 and |off| = 1/k are THE SAME STATEMENT, one written as a
  // dimensionless overturn knob and one as a length. 1/k = LAM/2pi is also the
  // Gerstner cusp radius, so this is the classical bound arriving twice.
  //
  // The bound therefore is |off| <= S/k -- "the displacement this much overturn
  // implies at this wavelength" -- and it is SCALE-FREE: it shrinks with the
  // shoaling wavelength on its own (LAM 90 m -> 66 m raises k by 1.36x and
  // tightens the ceiling by the same factor) and needs no size calibration.
  //
  // WHY THE FIELD EVER EXCEEDS IT, which is the actual defect: |off| is
  // lam*|grad| with the TRUE local gradient, while lam was solved from aEst,
  // a FLOORED amplitude ESTIMATE. Wherever the real slope outruns aEst*k --
  // chop riding a low-amplitude estimate, a foam-front FD spike, the trough
  // where aEst is on its floor -- the two disagree and the product runs away.
  // Bounding at S/k restores the identity the solve assumed. This is the same
  // mechanism as the documented trough-crease pathology (lam = S/(a*k^2)
  // amplifying chop where the amplitude estimate bottoms out), so the bound is
  // aimed at both and is measured against both below.
  //
  // STATED PLAINLY, so the next reader does not expect too much: at the POCKET
  // S is near its 1.8 cap and k is the deep-ish carrier, so S/k lands at
  // 19-26 m and this ceiling is close to the old 20 m there. It is not a cure
  // for the crest slab -- that is the Sapp calibration, measured above at -52%
  // and belonging to the #look unbundling. What it does own is everywhere S is
  // SMALL and the offsets were large anyway: the creases.
  //
  // ---- MEASURED. The prediction above is half right, and the half it gets
  // ---- wrong is in this change's favour, so read the numbers not the prose.
  // Three-arm A/B in ONE build at ONE clock (sewers, lineup, sim 42), which
  // separates this from the knee that shipped an hour earlier:
  //   1 old hard clamp, flat 20 m : mean |off| 3.90 m, 2203 fold points
  //   2 knee only,      flat 20 m : mean |off| 3.89 m, 2250 fold points
  //   3 knee + S/k ceiling        : mean |off| 2.75 m, 1280 fold points
  // Arms 1 and 2 are indistinguishable in the frame AND in the numbers -- the
  // knee alone changes nothing, which is what the earlier note already
  // conceded. Arm 3 is where the faceted slab leaves the frame.
  //
  // SIX CLOCKS, sewers (u_time driven directly; setSim needs a paint and
  // silently returns the same clock four times if you do not):
  //   t = 30/36/42/48/54/60 fold points 928/810/907/1106/674/938
  //                                  -> 500/365/531/ 482/359/524  (-41..-56%)
  //   mean |off| -25..-30% at every clock
  //   CREST HEIGHT BIT-IDENTICAL AT EVERY CLOCK: 8.28 / 8.59 / 9.72 / 8.71 /
  //   11.60 / 9.37 m. The fold reduction is not paid for in wave height, which
  //   is the failure mode this whole area keeps producing (see dropMag).
  //   Folded transects 91-100% -> 74-96%: it still folds. "A folding lip that
  //   z-fights beats a smooth mound" survives.
  //
  // AND IT DISCRIMINATES, which is the result worth keeping. At SHARKS
  // (xi 0.45, spilling, H0 1.0 -- plunge = 0, so Sover ~ 0 and the ceiling is
  // tight) fold points go 523/574/509 -> 83/85/75 at t = 36/42/48, an 84-85%
  // cut, folded transects 70% -> 39-48%, crest unchanged (4.15/4.50/4.24 m).
  // A spilling wave should not overturn, and now it mostly does not. So the
  // bound removes crease noise where the physics says there is no lip and
  // keeps the overturn where the physics says there is one -- from one length,
  // with no per-site tuning.
  //
  // u_offKnee : knee as a FRACTION of the live ceiling. 0 = hard clamp, the
  //             bit-identical pre-2026-08-22 revert (#knee=0). Default
  //             OFF_KNEE_FRAC. (It was metres for one commit; a fraction is
  //             the only thing that means anything against a moving ceiling.)
  // u_lamCap  : 1 = ceiling is min(OFF_MAX_M, S/k). 0 = the flat OFF_MAX_M.
  // u_offUnbound : no bound at all. INSTRUMENT — this is how the raw offset
  //             distribution was read. Not safe for the mesh; JS-only, there
  //             is deliberately no hash param for it.
  float offLen = length(off);
  float offMax = u_lamCap > 0.5
               ? min(OFF_MAX_M, S / max(kk, 1e-4))
               : OFF_MAX_M;
  float offTarget;
  if (u_offUnbound > 0.5) {
    offTarget = offLen;                          // instrument
  } else if (u_offKnee <= 0.0) {
    offTarget = min(offLen, offMax);             // hard clamp
  } else {
    float k = clamp(u_offKnee, 0.0, 1.0) * offMax;
    if (offLen <= k) {
      offTarget = offLen;                        // below the knee: identity
    } else {
      float span = max(offMax - k, 1e-3);
      float e2   = exp(-2.0*(offLen - k)/span);  // tanh, written out
      offTarget  = k + span*(1.0 - e2)/(1.0 + e2);
    }
  }
  off *= offTarget / max(offLen, 1e-6);
  if (!(dot(off, off) == dot(off, off))) off = vec2(0.0);   // NaN guard (house rule)

  foam   *= fade;
  pocket *= fade;
  crest  *= fade;
  aer    *= fade;
  return vec3(xz0.x + off.x*fade, h*fade, xz0.y + off.y*fade);
}

// Terrain wins wherever the seabed stands above the water surface. Applied
// after choppyPos so the bed never inherits the wave's horizontal
// displacement, and applied identically to the FD taps so normals stay
// correct across the waterline instead of shearing along it. With
// u_depthMix = 0 the bed sits at -999 m and can never win, so presets with no
// bathymetry behind them render exactly as before.
// Highest the displayed surface can reach ON DRY GROUND, metres above still
// water. Not the open-water crest bound: where the bed is already above the
// waterline the wave is depth-limited to nothing, so the only thing that can
// still arrive is the set's water pull-back — setupLiftM, capped at
// 0.3*H0*VIS = 2.88 m at the H0 3.0 m ceiling, and confined shoreward of the
// 2 m contour. 6 m is a bit over 2x that cap.
// Calibrated, not guessed: at the first cut (16 m, the open-water crest bound)
// this test fired on 0-11.6% of vertices and 0% at three spots — measurably
// useless. Above 6 m it covers 19-42% of each patch. The swash check
// (npm run check:swash) is the guard: it measures the breathing waterline
// directly, so clipping the run-up would show up as a breathe regression.
uniform float u_landSkipM;   // = CREST_CEIL_M; huge value disables the skip

vec3 surfacePos(vec2 xz0, float t, out float foam, out float pocket,
                out float brk, out float crest, out float land,
                out float aer, out float curl){
  // Bed FIRST (2026-08-12 perf). This used to run choppyPos — five ocean()
  // evaluations — and only then discover the bed was above it and throw the
  // whole result away, on every vertex over dry land, three times per vertex
  // (main() calls this for P, Px and Pz to build the FD normal). The app is
  // vertex-bound (GPU timing 2026-08-12: cost is linear in water-grid
  // triangles, near-flat in pixels), and 20-44% of each patch is dry ground,
  // so that was the single largest pure waste in the frame.
  // Above CREST_CEIL_M no wave can reach, so the answer is known without the
  // wave: bit-identical output, minus the work.
  float bedY = mix(-999.0, bedElevM(xz0) - u_waterLevel, u_depthMix);
  if (bedY > u_landSkipM) {
    foam = 0.0; pocket = 0.0; brk = 0.0; crest = 0.0; aer = 0.0; curl = 0.0;
    land = 1.0;
    return vec3(xz0.x, bedY, xz0.y);
  }
  vec3 P = choppyPos(xz0, t, foam, pocket, brk, crest, aer, curl);
  land = 0.0;
  if (bedY > P.y) {
    P = vec3(xz0.x, bedY, xz0.y);
    land = 1.0;
    // No surf on dry sand — and no overturn either: max(bed, water) is what
    // keeps the shoreline a consequence, so a thrown lip that lands below the
    // bed is clamped to the bed here exactly like every other wave term.
    foam = 0.0; pocket = 0.0; brk = 0.0; crest = 0.0; aer = 0.0; curl = 0.0;
  }
  return P;
}
`;

export const GRID_VERT = `
${SURFACE_PRELUDE}
${VARYINGS}
${SURFACE_GLSL}

void main() {
  // geometry is authored in world metres on the XZ stage (see main.js), so
  // position.xz IS the model coordinate — no extra transform to keep in sync
  vec2 xz = position.xz;

  float foam, pocket, brk, crest, land, aer, curl;
  vec3 P = surfacePos(xz, u_time, foam, pocket, brk, crest, land, aer, curl);

  // normals by finite differences on the DISPLACED positions (spec M2) — the
  // height-only FD of M1 is blind to the fold. Forward differences at one
  // core cell: central would push the (already 3x M1) vertex cost to 5x for
  // a half-cell phase shift invisible at ~1.2 m cells.
  float f2, p2, b2, c2, l2, a2, k2;
  vec3 Px = surfacePos(xz + vec2(u_cell.x, 0.0), u_time, f2, p2, b2, c2, l2, a2, k2);
  vec3 Pz = surfacePos(xz + vec2(0.0, u_cell.y), u_time, f2, p2, b2, c2, l2, a2, k2);
  vec3 N = cross(Pz - P, Px - P);            // +y up for an unfolded surface
  if (!(dot(N, N) > 1e-12)) N = vec3(0.0, 1.0, 0.0);   // degenerate fold cell
  N = normalize(N);

  // boil slick — mirrors ocean()'s internal boil dome (same constants); passed
  // down as a varying so both stages can damp ripple detail over the glass
  vec2 boilPos = vec2(-22.0, -coastCurve(-22.0) - 8.0);   // matches ocean()'s boil
  float boil = exp(-dot(xz - boilPos, xz - boilPos)/(2.0*5.5*5.5));

  // kelp slick — same damping mechanism as the boil dome, one stop weaker.
  // A canopy is a viscous surface load: it flattens the short ripple it floats
  // in without stopping the swell underneath, which is why kelp beds read as
  // smooth dark patches in every aerial of this coast (VISUAL_GROUND_TRUTH.md
  // item 5). Not passed down as a varying: the fragment recomputes it, because
  // the mask carries a ~16 m noise octave that grid-rate interpolation of a
  // varying would smear into a wash.
  float kelp = kelpMask(xz, mix(99.0, waterDepthM(xz), u_depthMix));

  // fine displacement octaves at reduced amplitude (spec: "full detail lives
  // in normals"); damped in foam and over the boil, matching the fragment.
  // Sampled at the DISPLACED xz so the vertex bump and the fragment's
  // detailGrad (which reads vWorldPos.xz) stay the same field.
  float fade = farFadeAt(xz);
  float vAmp = 0.16 * (0.5 + 0.5*u_chop)
             * (1.0 - 0.85*clamp(foam, 0.0, 1.0)) * (1.0 - 0.9*boil)
             * (1.0 - 0.55*kelp);
  P.y += detailH(P.xz, u_time) * vAmp * fade * (1.0 - land);  // sand doesn't ripple

  vWorldPos = P;
  vNormal   = N;
  vFoam     = foam;      // choppyPos already far-faded the outs
  vPocket   = pocket;
  vCrest    = crest;
  vBrk      = brk;
  vBoil     = boil;
  vLand     = land;
  vCurl     = curl;   // aeration hook (see VARYINGS); 0 unless #curl=1
  vDepth    = mix(99.0, waterDepthM(xz), u_depthMix);
  vAerLip   = aer;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
}
`;

export const GRID_FRAG = `
uniform float u_time;
${VARYINGS}
${MODEL_GLSL}
${SKY_GLSL}
${DETAIL_GLSL}
${KELP_GLSL}

// fog density paired with the grid's ~4 km skirt (main.js FAR_EXTENT): the
// plane outlives the fog, so the horizon is a fade, never a geometry seam.
// The marine layer hugs the surface (HAZE_H): near-horizontal cliff rays run
// their whole length through it, but the drone's near-vertical rays only
// cross HAZE_H metres of haze — without this the top-down view greys out.
uniform float u_camUnder;   // 1 when the eye is below the water surface
uniform float u_matte;      // 1 = matte the unmodeled world (#matte=0 reverts)
uniform float u_crestRead;  // Track 5 crest-first read (face darkening + fresh-foam core); #crest=0 reverts
uniform float u_lipAer;     // aerated lip/curl whitening on the fold geometry; #lip=1 arms it (default OFF)
uniform float u_fidelityLook; // 0 current, 1 foam material, 2 + lifecycle/face/lip (#look=)
const float FOG_DENSITY = 0.0011;
const float HAZE_H      = 70.0;

// ---- modeled-domain provenance ----
// 1 where the model has authority, ramping to 0 where it does not: outside
// the stage rect (constants mirror STAGE_* in main.js and GRID_VERT), and —
// when a measured bed drives the water — outside the NCEI patch, whose edge
// is an extrapolation ramp, not data (BED_VERT flags the same boundary).
// The audit's instant-fake tells (far-field silvering, edge-of-bake junk, the
// featureless land blob) all live out there: the render should stop CLAIMING
// that region rather than keep dressing it. Ramps are hundreds of metres —
// this is a fade of assertion, not a drawn border.
// RADIAL, not rectangular (rewritten 2026-08-12). The first version took
// max(|xz - c| - half) per axis, which is a RECTANGLE: its ramp met the terrain
// along axis-aligned lines and drew a hard tan/grey edge straight across the
// land — the "goofy straight lines" this feature exists to help with, made
// worse once the DEM reached 9.4 km of coast. A radial falloff has no corners
// and no preferred direction, so the fade reads as distance, not as a border.
//
// Normalized to the MEASURED PATCH (u_bedRect), so the fade tracks the data
// actually held: it begins 62% of the way out and is full at the patch edge —
// with the 2026-08-12 extent that is a ~200-240 m ramp, hundreds of times the
// DEM residual, so no post grid can print itself along the boundary.
// Synthetic presets carry no patch and fall back to the stage ellipse.
float provenanceAt(vec2 xz){
  const vec2 STAGE_HALF   = vec2(320.0, 270.0);
  const vec2 STAGE_CENTER = vec2(0.0, 10.0);
  vec2 c = STAGE_CENTER, halfExt = STAGE_HALF;
  if (u_depthMix > 0.5) {
    c = 0.5*(u_bedRect.xy + u_bedRect.zw);
    halfExt = max(0.5*(u_bedRect.zw - u_bedRect.xy), vec2(1.0));
  }
  float r = length((xz - c) / halfExt);   // 1.0 on the ellipse through the edge
  float prov = 1.0 - smoothstep(0.62, 1.0, r);
  return mix(1.0, prov, clamp(u_matte, 0.0, 1.0));
}

// foam microstructure: rougher, higher-frequency than the water detail — foam
// is IN the surface (perturbs normals, receives sun), not painted on it
float foamBumpH(vec2 p, float t){
  // rotate the sample domain off-axis: value-noise lattice drift along x/y
  // reads as vertical streaking from the drone (M1 critique) — a ~37 deg
  // rotation breaks the alignment without touching the texture statistics
  p = mat2(0.80, -0.60, 0.60, 0.80) * p;
  return vnoise2(p*1.35 + vec2(t*0.25, -t*0.18)) * 0.65
       + vnoise2(p*3.30 - vec2(t*0.12,  t*0.09)) * 0.35;
}
vec2 foamGrad(vec2 p, float t){
  float e = 0.12;
  return vec2(
    foamBumpH(p + vec2(e, 0.0), t) - foamBumpH(p - vec2(e, 0.0), t),
    foamBumpH(p + vec2(0.0, e), t) - foamBumpH(p - vec2(0.0, e), t)) / (2.0 * e);
}

void main() {
  vec2 xz = vWorldPos.xz;
  float t = u_time;
  vec3 V = normalize(cameraPosition - vWorldPos);
  float dist = length(cameraPosition - vWorldPos);
  float boil  = clamp(vBoil, 0.0, 1.0);

  // ---- 0. land ----
  // The shore is not a backdrop card: it is the NCEI seabed wherever the bed
  // stands above the water surface, so the waterline is wherever depth crosses
  // zero. Beach-to-cliff by height above the water, wet-dark near the
  // waterline (the swash keeps the lower band saturated), matched to the
  // marine-layer reference in docs/research/VISUAL_GROUND_TRUTH.md.
  // STAIR-STEP (drone critique, 2026-08-11): this used to branch on the
  // interpolated vLand varying, which decides land vs water at GRID
  // resolution — the waterline stair-stepped along triangle edges and read as
  // texel blocks at 1x zoom. Re-threshold per fragment on the bilinear bed
  // elevation (the exact field the vertex land test displaced from) and widen
  // the crossing into a swash band: the boundary is now a smooth
  // fragment-space curve, and the band blends water into wet sand the way the
  // swash actually does. vLand still gates the vertex geometry; here it only
  // survives inside bedYf, so grid resolution no longer draws the line.
  // Height above the CURRENT lifted mean level, not still water: the setup
  // lift (MODEL.md 2.5) is what walks the waterline up and down the beach on
  // the set rhythm, and thresholding on still water here would pin the
  // visible line and erase the breathe the vertex geometry already performs.
  float bedYf = mix(-999.0, bedElevM(xz) - u_waterLevel - VIS*setupLiftM(xz, t), u_depthMix);
  float landF = smoothstep(-0.22, 0.18, bedYf);   // swash band, ~0.4 m of elevation
  vec3 landCol = vec3(0.0);
  if (landF > 0.001) {
    float above = max(bedYf, 0.0);   // m above still water, fragment-exact
    // static swash-band wetness, unioned with the model's set-peak drying
    // band (call must precede the vec3 below, which hides the function)
    float wetness = max(1.0 - smoothstep(0.05, 1.30, above), wetSand(xz, t));
    vec3 wetSand  = vec3(0.30, 0.27, 0.23);
    vec3 drySand  = vec3(0.60, 0.53, 0.41);
    vec3 cliffCol = vec3(0.52, 0.46, 0.36);
    vec3 albedo = mix(mix(drySand, wetSand, wetness), cliffCol,
                      smoothstep(1.8, 6.5, above));
    // Marine terrace (2026-08-12, "land mass styling"). Above the cliff band
    // the blob was uniform cliffCol — the audit's "featureless tan carrying
    // zero place identity". The bluff top at Pleasure Point is a vegetated
    // terrace, so: low-saturation scrub clumps over dirt, elevation-gated.
    // Value structure only — no props are invented, and the clump noise is
    // the same field the water and kelp use, so it reads as one scene.
    vec3 dirtCol  = vec3(0.47, 0.42, 0.33);
    vec3 scrubCol = vec3(0.31, 0.33, 0.23);
    float terrace = smoothstep(6.5, 10.0, above);
    float veg = smoothstep(0.35, 0.75,
        vnoise2(xz*0.055 + vec2(7.7, -3.1))*0.6 + vnoise2(xz*0.21)*0.4);
    albedo = mix(albedo, mix(dirtCol, scrubCol, veg), terrace);
    // roughen with the same noise field the water uses, so the two surfaces
    // read as one scene rather than two asset libraries. The third, sub-metre
    // octave is the blocky-sand fix: the two coarse octaves alone left the
    // 7 m DEM posts reading as evenly-shaded squares from the drone.
    float grain = vnoise2(xz*1.7)*0.42 + vnoise2(xz*0.42)*0.33 + vnoise2(xz*6.1)*0.25;
    albedo *= 0.86 + 0.28*grain;
    // second half of the blocky-sand fix: the mesh normal (vNormal) is a
    // grid-cell FD over the bilinear bed, whose slope is piecewise-constant
    // per 7 m post — Lambert shading drew every post as a facet. FD the bed
    // field per fragment at half a post instead (BED_FRAG's trick, wider e),
    // so shading crosses post edges smoothly.
    float eL = 3.5;
    float hxL = bedElevM(xz + vec2(eL, 0.0)) - bedElevM(xz - vec2(eL, 0.0));
    float hzL = bedElevM(xz + vec2(0.0, eL)) - bedElevM(xz - vec2(0.0, eL));
    vec3 Nl = normalize(vec3(-hxL, 2.0*eL, -hzL));
    float lamL = 0.42 + 0.58*clamp(dot(Nl, sunDir), 0.0, 1.0);
    landCol = albedo * lamL;
  }
  if (landF > 0.997) {
    // solidly ashore: fog and return, skipping the whole water stack.
    // The modeled-domain matte applies HERE TOO — this early return used to
    // skip it, so unmodeled land stayed sharp while the water beside it faded
    // (the striped far cliff in the 2026-08-11 free-cam report). Same
    // treatment, same pre-fog placement as section 4.6 below.
    float provL = provenanceAt(xz);
    if (provL < 1.0) {
      float lumaL = dot(landCol, vec3(0.299, 0.587, 0.114));
      vec3 matteL = mix(vec3(lumaL), vec3(0.55, 0.60, 0.61), 0.4);
      // Land fades HARDER than water (pow pulls the ramp earlier, floor 0.0
      // rather than 0.22): we model surf, not the town — inland the fade
      // should finish, not hover at 22%. The wider DEM means this now lands
      // on real coastline shape, which is what makes a full fade read as
      // marine layer instead of a missing asset ("don't render what we don't
      // model; real layout covers the gaps" — Andy, 2026-08-12).
      landCol = mix(matteL, landCol, pow(provL, 1.8));
      // FINISH the fade (island-fix follow-up): matteL preserves luminance, so
      // far land still showed terrain grain as a textured grey plain, and the
      // held-plateau silhouette printed a faint straight seam against the sky.
      // Below prov 0.35 converge on one flat haze tone — texture, and with it
      // every seam it could draw, ends before the geometry does.
      landCol = mix(vec3(0.60, 0.63, 0.64), landCol, smoothstep(0.0, 0.35, provL));
    }
    float dyL = max(cameraPosition.y - vWorldPos.y, 0.0);
    float inLayerL = dyL > HAZE_H ? HAZE_H / dyL : 1.0;
    vec3 colL = mix(landCol, skyColor(-V, t), 1.0 - exp(-dist * inLayerL * FOG_DENSITY));
    gl_FragColor = vec4(colL, 1.0);
    return;
  }

  // foam mask: vFoam interpolates the model's bore mask across grid cells, so
  // its edges land on ruler-straight cell-aligned lines (M1 critique #5).
  // Erode per-fragment with drifting noise so the front dissolves into
  // fingers/lace instead of terminating on the grid.
  // Two-octave erosion, low frequency dominant: a single ~1 m noise aliases
  // into per-pixel dither from the drone (0.57 m/px up there) — the ~3 m
  // octave carries the fingering, the fine octave only roughens edges.
  //
  // AGE (foam critique, 2026-08-11): a constant-threshold erosion carved the
  // DECAYING aftermath field into hard polygonal plates with bright seams —
  // pack ice, not dissolving whitewater. Foam must change character with age,
  // not just density. tSince is the same seconds-since-the-crest clock
  // ocean()'s residue decays on (rayS comes with the spliced MODEL_GLSL), so
  // the fragment ages in lockstep with the model's own foam decay.
  float wA = 2.0*PI/u_T;
  // crestClockS ramps the sawtooth across its wrap: ageK below is a 0/1 LOOK
  // flip (erosion amplitude, threshold width, and a 2x aftermath multiplier),
  // so the raw mod() drew the hardest edge in the frame along the crest line.
  // See crestClockS in model-glsl.js for the measurement; #wrap=0 reverts.
  float tSince = crestClockS(mod(wA*t - rayPhase(xz), 2.0*PI)/wA);
  float ageK = smoothstep(1.2, 0.62*u_T, tSince);   // 0 fresh -> 1 aftermath
  float foamLook = step(0.5, u_fidelityLook);
  float fullLook = step(1.5, u_fidelityLook);
  // The folded grid is DoubleSide for the shipped renderer, but its underside
  // is exactly the detached manta/ribbon silhouette seen from the cliff. Full
  // treats the pitching edge as a visual hinge: show the continuous front
  // face and let the thin white crest below describe the lip.
  if (fullLook > 0.5 && !gl_FrontFacing) discard;
  // advect the erosion lattice shoreward with age: the aftermath pattern
  // smears with the swash instead of sitting on a static noise grid. The
  // mod() jump in tSince lands on the crest line, where foam is fresh and the
  // seam is repainted before it can read.
  vec2 axz = xz - vec2(0.0, 1.1)*min(tSince, 7.0);
  float er = vnoise2(axz*0.35 + vec2(t*0.08, -t*0.05))*0.65
           + vnoise2(axz*0.90 + vec2(t*0.10, -t*0.07))*0.35;
  // FIELD-VIDEO PROBE (2026-08-15): real whitewater is a perforated material,
  // not a smooth translucent blur. Domain-warp three isotropic scales into
  // clumps, cells and pores. Fresh foam keeps mostly connected white mass;
  // aging raises the threshold so holes merge into lace. fwidth keeps the
  // threshold antialiased at the cliff camera instead of aliasing into glitter.
  vec2 cellQ = axz;
  float foamCell = 0.5;
  float materialCoverage = 1.0;
  // Uniform branch: the shipped/current renderer pays none of the five extra
  // noise samples. The experimental paths accept the fragment cost explicitly.
  if (foamLook > 0.5) {
    vec2 cellP = mat2(0.80, -0.60, 0.60, 0.80) * axz;
    vec2 cellWarp = vec2(
      vnoise2(cellP*0.12 + vec2(8.3, t*0.035)),
      vnoise2(cellP*0.12 + vec2(-5.7, -t*0.028))) - 0.5;
    cellQ = cellP + 5.5*cellWarp;
    foamCell = vnoise2(cellQ*0.24 + vec2(t*0.08, -t*0.04))*0.52
             + vnoise2(cellQ*0.72 - vec2(t*0.05,  t*0.03))*0.32
             + vnoise2(cellQ*1.85 + vec2(-t*0.03, t*0.02))*0.16;
    float cellCut = mix(0.40, 0.60, ageK);
    float cellAA = max(fwidth(foamCell)*1.5, 0.018);
    float cellInk = smoothstep(cellCut - cellAA, cellCut + cellAA, foamCell);
    materialCoverage = mix(0.52 + 0.48*cellInk,
                           0.12 + 0.88*cellInk, ageK);
  }
  float foamM = clamp(vFoam, 0.0, 1.0);
  // SATURATION (ice-floe critique, 2026-08-11): where fresh sources overlap
  // (impact mound + bore + lip foam landing on the same spot) the summed mask
  // rides its clamp ceiling across whole regions; the threshold below then
  // saturates everywhere inside them and the erosion noise has nothing left
  // to carve, so overlap rendered as a solid hard-edged white plate (seen at
  // the right edge of drone frames). Soft-knee the sum instead of letting the
  // hard clamp be the ceiling: 1-exp(-1.55) ~ 0.79 puts fully summed foam
  // INSIDE the threshold ramp, so the stipple keeps carving at any density
  // and overlap reads as denser lace, never a facet. Sparse foam only gets a
  // mild lift, absorbed by the 0.15 threshold floor.
  foamM = 1.0 - exp(-1.55*foamM);
  // fresh foam keeps the hard eroded fingering; with age the noise stops
  // carving (amplitude down) and the threshold ramp widens (soft gradient
  // instead of a binary cell edge), then the whole sheet thins toward film.
  float erAmp  = mix(0.50, 0.18, ageK);
  float hiEdge = mix(0.75, 1.10, ageK);
  foamM = smoothstep(0.15, hiEdge, foamM + (er - 0.5)*erAmp);
  // aftermath never saturates: filmy, not plates. With #head the aged film
  // thins further still — the between-stripe aftermath is where the hero
  // read's contrast budget was leaking (this does NOT touch the stripes:
  // they ride their crests and are tSince-fresh by construction, which is
  // why an ageK carve alone measured near-null — see the comet carve below).
  foamM *= mix(1.0, mix(0.70, 0.50, u_headRead), ageK);
  // Track 5 attachment: the zipper's active break is ALWAYS whitewater — the
  // pocket gets a foam floor the erosion cannot carve away, so the head at
  // the line never renders dimmer than its own trailing bore. vPocket is
  // env^2-gated in the model, so lulls stay dark and this cannot paint a
  // standing white stripe on the line.
  //
  // SIZE-NORMALIZED 2026-08-19 (#lipn=0 reverts, same flag as the model's
  // lipFoam — one defect, two limbs). The claim this floor encodes is RELATIVE
  // ("never dimmer than its own trailing bore") but it was written as the
  // ABSOLUTE constant 0.72, and the bore it is floored against is size-scaled
  // (foamSizeAt, down to the 0.55 clamp). So on a small day the "floor" sat far
  // ABOVE the field it was meant to hold up: at Sewers month=august the model
  // foam field was scaled x0.55 while this term still forced 0.72 wherever
  // vPocket >= 0.667 — which, on a closed-out line, is most of the stage.
  // foamSizeAt is exactly 1.0 at the 1.5 m card day, so the floor is unchanged
  // there and the relative claim is now true at every size instead of one.
  foamM = max(foamM, u_crestRead * 0.72 * mix(1.0, foamSizeAt(xz.x), u_lipSize)
                     * clamp(vPocket*1.5, 0.0, 1.0));
  // COMET CARVE (2026-08-14, #head=0 A/B): direction from altitude. The
  // line-attached stripe's whitewater encodes when the zipper passed each
  // station (age since this column's crest crossed the line), but the foam
  // threshold above re-saturates any dense mask to the same white, so the
  // gradient never reached the pixels — the hero read saw static chalk.
  // Post-threshold multiplicative carve on the ZIPPER clock, confined to
  // ~25 m of the line (the same attachment discipline as freshCore: inner
  // re-breaking stripes are untouched): the stripe's old end dissolves to
  // ~30% while the live breakpoint stays at full white — each stripe becomes
  // a comet, and the comet points the peel. Placed after the pocket floor:
  // at the live head lifeAge ~ 0 so the floor is never carved.
  float zbC = breakLine(xz.x);
  vec4 lifeC = breakerLifecycleAtX(xz.x, t);
  // SEAM DIRECTION (Andy, 2026-08-14 night): the first carve was a moving
  // freshness window — its trailing edge chased the head at zipper speed, and
  // the mod() reset re-brightened foam under the old bore before the new bore
  // arrived, so seams crawled INWARD at the break edges where real broken
  // boundaries spread outward and fade in place. Two changes: (1) foam
  // shoreward of the current wave's bore front (lifeC.y) belongs to the
  // PREVIOUS wave — age it one period older instead of letting the wrap
  // repaint it; (2) tau 4->9 s and floor 0.30->0.45, so the tail dissolves in
  // place instead of visibly translating.
  // Same wrap ramp as the model comet (crestClockS): the carve is a 2x
  // multiplier, so a snap in lifeC.x prints a vertical seam on the stripe.
  float lifeClk = crestClockS(lifeC.x);
  float foamAge = mix(lifeClk + u_T, lifeClk,
                      smoothstep(xz.y - 3.0, xz.y + 3.0, lifeC.y));
  float onStripe = exp(-pow((xz.y - zbC)/25.0, 2.0));
  // #arm (2026-08-18): the 9 s carve clock has the same defect the model's
  // comet tail had — the head's along-line speed varies ~13x, so a temporal
  // tail collapses to ~30 m where the head crawls (the visible oblique arm)
  // and stretches ~390 m on the fast flank. Convert age to metres behind the
  // head (age*w/|dS/dx| along the line, exactly as the model does) and carve
  // on a 110 m e-fold — gentler than the model tail's 55 m, so the carve
  // grades what the model term draws instead of re-eroding it. Legacy clock
  // under #arm=0 / #arm=anchor.
  float eC = 2.0;
  float wC = 2.0*PI/u_T;
  float dSdxC = abs(rayPhase(vec2(xz.x + eC, breakLine(xz.x + eC)))
                  - rayPhase(vec2(xz.x - eC, breakLine(xz.x - eC)))) / (2.0*eC);
  float behindC = foamAge * wC / max(dSdxC, 1e-3);
  float carveTail = mix(exp(-foamAge/9.0), exp(-behindC/110.0), u_armRead);
  foamM *= mix(1.0, 0.45 + 0.55*carveTail, onStripe*u_headRead);
  // PER-STRIPE CARVE (#slife=1, default OFF — hero read open item (a)). The
  // comet carve above exists because the foam threshold re-saturates dense
  // masks to the same white; the INNER re-breaking stripes hit the identical
  // wall, so they get the same post-threshold treatment, extended inward on
  // the canonical per-stripe clock (stripeAgeAt in model-glsl — derivation,
  // and the falsified model-side placement, at its definition). alongF/lagF
  // is the exact decomposition of that age into the within-stripe
  // along-crest ramp (e-fold T/3, the comet's period-relative family) and
  // the whole-period stripe lag (e-fold 2.4*tau, the trail/lace foam-decay
  // family). Confined to the inner field — the 25 m line band already
  // belongs to the comet — and capped at 1.0: a carve dissolves tails, the
  // head keeps full white, so the freshest stripe stays the subject. Each
  // stripe's head is the alongF wrap seam, a step that travels at Vp: the
  // traveling breakpoint, per stripe, pointing the same way as the comet
  // because both ride the same phase field. Downstream shading over the
  // canonical clock, never a new clock.
  if (u_stripeLife > 0.5) {
    float stripeAgeF = stripeAgeAt(xz, t);
    float alongF = mod(stripeAgeF, u_T);
    float lagF = stripeAgeF - alongF;
    float stripeCarve = (0.45 + 0.55*exp(-alongF/max(0.33*u_T, 1.0)))
                      * (0.55 + 0.45*exp(-lagF/max(2.4*u_tau, 1.0)));
    float innerF = smoothstep(zbC + 12.0, zbC + 34.0, xz.y);
    foamM *= mix(1.0, min(stripeCarve, 1.0), innerF);
  }
  // Probe 1 changes only the material response. Probe 2 additionally spends
  // the contrast budget on one live head: the line-attached zipper and its
  // current bore stay bright while re-breaking stripes resolve as dim film.
  // This is downstream shading over the canonical lifecycle, never a new clock.
  foamM *= mix(1.0, materialCoverage, foamLook);
  float liveHead = onStripe * exp(-lifeC.x/3.2);
  float liveBore = exp(-pow((xz.y - lifeC.y)/13.0, 2.0)) * exp(-lifeC.x/5.5);
  float hierarchy = mix(0.48 + 0.20*(1.0 - ageK), 1.0,
                        clamp(max(liveHead, 0.78*liveBore), 0.0, 1.0));
  foamM *= mix(1.0, hierarchy, fullLook);

  // ---- 1. detail spectrum: fragment-stage normal perturbation ----
  // damped where foam owns the surface and over the boil slick; wind chop
  // raises the ripple energy on top of a glassy-day floor.
  // detailVis: one grid cell spans many detail wavelengths at distance, so the
  // full-amplitude gradient is pure undersampling noise past ~300 m (critique
  // #3) — fade the perturbation with distance and hand its variance to a
  // wider specular lobe below (LEAN-style transfer).
  float detailVis = exp(-dist * 0.003);
  // kelp damps ripple the same way the boil dome does, one stop weaker — see
  // the vertex stage, which flattens the matching displacement octaves. Both
  // stages must agree or the geometry and the normals describe two surfaces.
  // Computed once here and reused by the colour code below, so the mask costs
  // nothing beyond the vDepth varying the vertex stage already interpolates.
  float kelpM  = kelpMask(xz, vDepth);
  float damp = (1.0 - 0.85*foamM) * (1.0 - 0.9*boil) * (1.0 - 0.55*kelpM);
  vec2 g = detailGrad(xz, t) * (0.55 + 0.55*u_chop) * damp * detailVis;
  // M2's folded lip shows its underside (material is DoubleSide); flip the
  // geometric normal for back faces so the curl shades as a surface, not a hole
  vec3 Ng = normalize(vNormal) * (gl_FrontFacing ? 1.0 : -1.0);   // wave-scale normal
  vec3 N = normalize(vec3(Ng.x - g.x, Ng.y, Ng.z - g.y)); // + ripple detail
  // Track 5: how steeply this water stands, gated to the RAISED part of the
  // wave so chop ripple over flat water cannot trip it. Drives the face
  // darkening below (VISUAL_GROUND_TRUTH: the face must darken as it
  // steepens) — unblocked by #psi landing, since tuning this against
  // under-steepened geometry would have baked in a compensation.
  // FRONT FACES ONLY, and faded out of the pocket: current/foam retain M2's
  // authored folded lip, while full narrows it geometrically above. Darkening
  // flipped steep normals would still paint any remaining underside as a
  // camera-dependent black polygon, so the face cue stays on the front face.
  float pocketSteepGate = mix(1.0 - clamp(vPocket*1.2, 0.0, 1.0),
                              1.0 - 0.25*clamp(vPocket, 0.0, 1.0), fullLook);
  float steepF = clamp((1.0 - Ng.y) * mix(5.0, 6.2, fullLook), 0.0, 1.0)
               * smoothstep(0.4, 1.6, vWorldPos.y) * u_crestRead
               * (gl_FrontFacing ? 1.0 : 0.0)
               * pocketSteepGate;

  // foam roughness normal (used for foam's own lighting below); influence kept
  // low — foam under a marine layer is lit mostly ambiently, strong normal
  // shading was reading as grey streaks (critique #1)
  vec2 fg = foamGrad(xz, t) * 0.25 * foamM;
  vec3 Nf = normalize(vec3(N.x - fg.x, N.y, N.z - fg.y));

  // base albedo: web/'s NorCal palette (slate blue -> shelf -> murky inner).
  // TONAL SEPARATION (critique, 2026-08-11): at screensaver distance the frame
  // compressed into one mid-grey band — water, foam and sky within a stop of
  // each other. Same hues (ratios preserved), values pulled DOWN ~30% so the
  // dark water body sets the floor, fresh foam the near-white ceiling, and the
  // marine-layer sky sits between: three distinct values at thumbnail size.
  float shoreT = smoothstep(-250.0, 60.0, xz.y - breakLine(xz.x));
  vec3 deep  = vec3(0.065, 0.10, 0.135);
  vec3 shelf = vec3(0.075, 0.145, 0.155);
  vec3 inner = vec3(0.135, 0.195, 0.185);
  vec3 base  = mix(deep, mix(shelf, inner, smoothstep(0.5, 1.0, shoreT)), shoreT);
  base += vec3(0.03, 0.10, 0.10) * clamp(vWorldPos.y*0.35, 0.0, 1.2);

  // ---- bottom showing through ----
  // Beer-Lambert up-and-back through vDepth metres of water, over the same
  // sand albedo the beach uses. Not refraction — no ray is bent — but it is
  // the real extinction law, so the shallows brighten and warm exactly where
  // the reef is shallow. This is the cheapest honest way to see the bed
  // driving the break: the wave stands up over the sand you can see.
  // Red dies first, blue last, which is why shallow water over sand reads teal
  // rather than simply paler. Coefficients are COASTAL, not open-ocean: clear
  // blue-water Kd (~0.06/m at 490 nm) leaves the bottom faintly visible at
  // 10 m, and Monterey Bay is kelp-and-plankton turbid. Tripling it puts the
  // bottom out of sight by ~6 m, which is what makes the shallow reef read as
  // a bright shape against dark water instead of an even wash.
  //
  // KELP (polarity fix, 2026-08-11): with sand as the only bottom albedo this
  // term is what painted the shallow reef BRIGHT — the exact inverse of the
  // NAIP ortho, where the reef is the darkest water in frame. The canopy is
  // handled as what it physically is, in two coupled places rather than as a
  // paint-over:
  //   1. it REPLACES the bottom. Macrocystis blades reflect a few percent,
  //      greenest in the green band, against sand's ~50%, so the shallow
  //      return that made the tongue glow simply stops arriving.
  //   2. it SHADES THE COLUMN. The canopy floats in the upper metres and eats
  //      the volume backscatter that lights open water, which is why the bed
  //      reads darker than the water beside it and not merely un-bright.
  // The transmission and the blade albedo were solved together against the
  // ortho ratio quoted at KELP_GLSL: over the 2.2 m reef flat they land the
  // canopy at (0.40, 0.37, 0.38) of the un-kelped water versus the measured
  // (0.34, 0.37, 0.42). The deliberate departure is red — held a little high,
  // blue a little low, because this palette's DEEP water is blue-slate and a
  // neutral darkening would have left the canopy and the deep water the same
  // colour AND the same value, so the wedge would not read as a shape. The
  // olive lift below is what separates them by hue at matched value; kelp
  // canopy is genuinely brown-olive, so the departure buys the read honestly.
  float kelp = kelpM * (1.0 - 0.85*foamM);   // whitewater hides the bed
  vec3 kExt = vec3(0.45, 0.20, 0.16);
  // Track 5 face darkening, part 1: vDepth is the STILL-WATER column, so a
  // standing face over shallow reef kept showing the vertical sand return and
  // rendered BRIGHT exactly where photos show the steep face dark (the
  // tone-inversion the 2026-08-11 audit measured). Light crossing a steep
  // face travels a longer diagonal path through more water — stretch the
  // Beer-Lambert path with steepness and the sand return dies on the face.
  float pathM = max(vDepth, 0.0) * 2.0 * (1.0 + mix(2.5, 3.2, fullLook)*steepF);   // down and back up
  // KELP polarity, part 2 (2026-08-18, #kelp=0 reverts; density half at
  // KELP_GLSL): the LANES between canopy clumps sit over the same mudstone
  // platform the kelp roots in, not over open beach sand — the Purisima
  // shelf here is dark rock under algal turf. Painting them with the beach's
  // sand albedo is what kept the tongue bright between clumps (ortho lanes
  // measure ~open-water value, not sandy-teal). Gated on the SAME depth band
  // and ramps as the canopy (kelpBandMask), so no new boundary is introduced
  // and the sub-1.2 m swash keeps its genuine sand return.
  float reefBand = kelpBandMask(vDepth) * clamp(u_depthMix, 0.0, 1.0) * u_kelpDark;
  vec3 laneAlb = mix(vec3(0.60, 0.53, 0.41), vec3(0.20, 0.185, 0.14), reefBand);
  vec3 bedAlb = mix(laneAlb, vec3(0.035, 0.062, 0.048), kelp);
  vec3 bottomLit = bedAlb * (0.35 + 0.45*clamp(dot(Ng, sunDir), 0.0, 1.0));
  vec3 through = bottomLit * exp(-kExt * pathM);
  base = mix(base, base + through, u_depthMix * (1.0 - 0.85*foamM));
  base *= mix(vec3(1.0), vec3(0.44, 0.52, 0.58), kelp);
  base += vec3(0.018, 0.026, 0.012) * kelp;   // olive canopy near the surface

  float lam = clamp(dot(N, sunDir), 0.0, 1.0);
  base *= 0.62 + 0.50*lam;   // gentle slope shading so faces still read
  // Track 5 face darkening, part 2: the water body itself — a steep face is
  // lit by less sky (it sees the horizon, not the zenith dome) and its
  // volume backscatter drops with the grazing illumination.
  base *= 1.0 - mix(0.30, 0.40, fullLook)*steepF;
  // ---- 2. fresnel + glitter ----
  // Schlick, F0 ~ 0.02: near-black looking straight down, mirror at grazing.
  // cosV comes from the GEOMETRIC normal: the ripple perturbation saturates
  // the grazing term almost everywhere, silvering the whole far field
  // (critique #4) — detail N drives glitter only. The reflected sky is
  // attenuated slightly: wave-slope masking keeps real water a stop darker
  // than the sky it mirrors (palette itself stays shared with web/ per spec).
  // Foam kills fresnel and glitter locally — bubbles scatter, they don't reflect.
  float cosV = max(dot(Ng, V), 0.0);
  float fres = 0.02 + 0.98*pow(1.0 - cosV, 5.0);
  float specKill = 1.0 - 0.95*foamM;
  // 0.74 (was 0.88): part of the tonal-separation pass — the mirrored sky was
  // lifting the whole far field to within a stop of the sky itself, so the
  // horizon read as one band. Real wave-slope masking keeps water a full stop
  // darker than what it reflects; sky stays untouched and therefore distinct.
  vec3 refl = skyColor(reflect(-V, Ng), t) * 0.74;
  vec3 col = mix(base, refl, clamp(fres * specKill, 0.0, 1.0));
  // broad sheen = the diffuse marine-layer light; tight glitter = sun hits on
  // the detail normals — thousands of sub-pixel sparkles in motion. As detail
  // fades with distance its slope variance transfers into a wider lobe
  // (exponent 750 -> ~90, gain eased down), so the far field carries a
  // coherent glitter path toward the sun instead of shot noise.
  float RdotV = max(dot(reflect(-sunDir, N), V), 0.0);
  float glitExp  = mix(90.0, 750.0, detailVis);
  float glitGain = mix(0.9,  2.60,  detailVis);
  col += vec3(0.90, 0.88, 0.84) * pow(RdotV, 40.0)    * 0.30 * specKill;
  col += vec3(1.00, 0.96, 0.86) * pow(RdotV, glitExp) * glitGain * specKill;

  // ---- 3. subsurface transmission ----
  // backlit thin water glows green-teal; crest lines are thin, the pocket is
  // the thinnest (the Pleasure Point money cue). heightAboveMean because only
  // the raised part of the wave has sky behind it to transmit. Gated by
  // geometry: only sun-shadowed faces transmit (dot(V,-sunDir) alone is
  // per-view nearly constant, which painted every crest with the same stripe,
  // critique #2), and crest thinness is weighted toward the pocket so the
  // glow concentrates where the spec says it should be strongest.
  float back  = max(dot(V, -sunDir), 0.0);
  float trans = clamp(dot(-sunDir, Ng), 0.0, 1.0);
  float pocketW = 0.25 + 0.75*clamp(vPocket*1.6, 0.0, 1.0);
  float thin  = clamp(vCrest*pocketW + 1.4*vPocket, 0.0, 1.5);
  // SIZE_AUDIT item 6: dividing by u_H0*VIS was INVERTED — a taller face
  // normalized its own height away, so the crest glow got DIMMER as H0 rose.
  // Height enters in metres now. 4.8 = 1.5*VIS: the H0 = 1.5 m model-card
  // day calibration, so the 1.5 m day renders exactly as before and bigger
  // faces saturate the clamp instead of dividing themselves dark.
  float hMean = clamp(vWorldPos.y / 4.8, 0.0, 1.0);
  float sss   = pow(back, 3.0) * thin * hMean * trans;
  col += vec3(0.16, 0.42, 0.38) * sss * 1.5;

  // pocket tint (reduced vs M0 — fresnel+sss now carry the pocket) and
  // thrown-lip spray for plunging waves, both kept from web/
  vec3 pocketCol = mix(vec3(0.15, 0.38, 0.36), vec3(0.10, 0.30, 0.33), clamp(u_xi*0.4, 0.0, 1.0));
  col = mix(col, pocketCol, clamp(vPocket*1.4, 0.0, 0.55));
  // Pocket tint happens after the base face lighting, so re-establish the
  // field-reference value structure here: one dark sloping front, followed
  // immediately by one fine white lip. This is front-face only because full
  // has already rejected the opaque underside above.
  float facePocket = fullLook * steepF;
  col *= 1.0 - 0.44*facePocket;
  float connectedLip = max(vPocket,
                           0.34*smoothstep(0.48, 0.82, vCrest)
                           * smoothstep(0.35, 1.35, vWorldPos.y));
  float lip = smoothstep(0.5, 1.5, u_xi)
            * mix(vPocket, connectedLip, fullLook);
  float lipOld = vnoise2(xz*0.6 + t);
  float lipTexture = 1.2*lipOld;
  if (fullLook > 0.5) {
    float lipCells = vnoise2(cellQ*0.58 + vec2(17.0, -9.0));
    // A narrow continuous hinge, with cell noise breaking its opacity rather
    // than breaking the line into isolated white pieces.
    lipTexture = (0.38 + 0.67*smoothstep(0.38, 0.66, lipCells))
               * smoothstep(0.26, 0.68, vCrest)
               * (0.42 + 0.58*exp(-lifeC.x/3.0));
  }
  float lipMask = lip * lipTexture;
  col = mix(col, vec3(0.98), clamp(lipMask, 0.0, mix(0.9, 0.96, fullLook)));

  // ---- 4. foam IN the surface ----
  // web/'s two-octave clump texture, but lit mostly ambiently: under a marine
  // layer whitewater is bright from every direction, and stacking texture x
  // sun shading multiplicatively dropped it to wet-grey (critique #1) — the
  // clump texture and sun term are narrow modulations on a white base now.
  // Structure (bore, streaks, lace, spray, crumb) arrives inside vFoam.
  float ftex = 0.58 + 0.42*(vnoise2(xz*0.35 + vec2(t*0.15, -t*0.1))*0.6
                          + vnoise2(xz*1.15 - vec2(t*0.08, t*0.05))*0.4);
  ftex = mix(ftex, 0.42 + 0.58*foamCell, foamLook);
  float lamF = clamp(dot(Nf, sunDir), 0.0, 1.0);
  // fresh whitewater is the brightest thing in frame (tonal ceiling, raised
  // from 0.93 as part of the value-range stretch); with age it grades to a
  // thin blue-grey film that lets the darkened water body read through — the
  // bright->filmy gradient the aftermath was missing.
  vec3 foamCol = vec3(0.97, 0.98, 0.99) * (0.82 + 0.18*ftex) * (0.86 + 0.14*lamF);
  // plate breaker (ice-floe critique, second half): exactly where the mask
  // saturates, deepen the clump-texture modulation so a dense sheet still
  // shows bubble structure instead of rendering as untextured paper white.
  // Only the top of the mask range is touched, so ordinary foam is unchanged.
  float plateT = smoothstep(0.72, 0.95, foamM);
  foamCol *= 1.0 - 0.16*plateT*(1.0 - ftex);
  // Track 5 fresh-foam core: freshly aerated impact foam is DENSE — its
  // texture contrast collapses toward solid white (the photos' ~130-value
  // step lives here, not in a brighter white). CONFINED to the head zone at
  // the baked line: "fresh" alone also lifts the inner bores (every crest
  // re-breaking inshore is fresh behind itself), which measured as a null on
  // the 6b argmax discriminator — the head and its competitor rose together.
  // Attachment means the LINE holds the ceiling; distance to it is the one
  // signal the inner field cannot fake.
  float nearLine = exp(-pow((xz.y - breakLine(xz.x))/25.0, 2.0));
  float freshCore = u_crestRead * (1.0 - ageK) * smoothstep(0.55, 0.90, foamM)
                  * max(nearLine, clamp(vPocket*1.4, 0.0, 1.0));
  foamCol = mix(foamCol, vec3(1.0), 0.6*freshCore);
  vec3 filmCol = mix(base, vec3(0.60, 0.68, 0.70), 0.6);
  // deeper film with #head: the aged tail grades toward water so the fresh
  // head owns the stripe's brightness (comet read, same A/B as the tail carve)
  foamCol = mix(foamCol, filmCol, (0.55 + 0.13*u_headRead)*ageK);
  col = mix(col, foamCol, clamp(foamM*mix(1.15, 0.90, ageK), 0.0, 0.97));

  // ---- 4.7 aerated lip (#lip=1, default OFF) ----
  // The curl itself, whitened where the FOLD is: vAerLip is computed in the
  // vertex stage from the fold's own mechanism variables (cusp parameter S,
  // the applied lip throw, pocket/plunge/H_eff — see choppyPos), so this
  // paints the pitching crest and the thrown curtain's BOTH faces — which is
  // also the honest cover for the documented dark fold-underside facets —
  // never a screen-space band. Applied AFTER the foam threshold and carves,
  // deliberately outside their pipeline: the comet/stripe carves dissolve
  // whitewater TAILS, and the lip is not a tail — at the live head lifeC.x
  // ~ 0 anyway, so ordering and mechanism agree. A mix, not an add, so
  // stacking on the comet head brightens toward one white ceiling instead of
  // doubling. lipFresh is the metric #arm family: metres behind the
  // traveling breakpoint (behindC above), e-fold 85 m between the model
  // tail's 55 and the carve's 110 — the lip is freshest at the head, and its
  // trailing curtain grades into the bore's whitewater instead of cutting
  // off. Floor 0.40: a curling crest a tail-length behind the head is still
  // aerated water, just not the subject.
  if (u_lipAer > 0.5) {
    float lipFresh = 0.40 + 0.60*exp(-behindC/85.0);
    float aerM = clamp(vAerLip, 0.0, 1.0) * lipFresh;
    // ftex modulation keeps the curtain aerated water, not paper white
    vec3 aerCol = vec3(0.97, 0.985, 1.0) * (0.88 + 0.12*ftex);
    col = mix(col, aerCol, clamp(aerM, 0.0, 0.95));
  }

  // swash-band blend into the fragment-exact land colour computed above:
  // partial landF fragments are the widened shoreline crossing. Pre-fog on
  // both sides so the haze applies once to the mixed result.
  col = mix(col, landCol, landF);

  // ---- 4.6 modeled-domain matte ----
  // Pre-fog, same rule as the land blend: haze applies once to the matted
  // result. Structure stays visible but stops asserting — desaturated toward
  // a marine grey so the fade reads as atmosphere, not as a broken region.
  float prov = provenanceAt(xz);
  if (prov < 1.0) {
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 matte = mix(vec3(luma), vec3(0.55, 0.60, 0.61), 0.4);
    col = mix(matte, col, mix(0.22, 1.0, prov));
    // Same hard finish as the land path, same constant. Without it, beyond
    // the patch the rim's land/water boundary extrudes as a dead-straight
    // shoreline where flat-toned land met fresnel-toned water — the diagonal
    // seam in the down-coast view. Both sides of a boundary we do not model
    // must converge on ONE tone; then no unmodeled edge can draw a line.
    col = mix(vec3(0.60, 0.63, 0.64), col, smoothstep(0.0, 0.35, prov));
  }

  // ---- 5. aerial perspective ----
  // fog toward the same procedural sky the dome draws, evaluated along the
  // view ray — the far plane converges on exactly what surrounds it
  float dy = max(cameraPosition.y - vWorldPos.y, 0.0);
  float inLayer = dy > HAZE_H ? HAZE_H / dy : 1.0;   // ray fraction inside the haze
  float fog = 1.0 - exp(-dist * inLayer * FOG_DENSITY);
  col = mix(col, skyColor(-V, t), fog);

  // ---- 6. seen from underneath ----
  // Above ~48.6deg from vertical the surface is a total-internal mirror, and
  // everything the sky contributes is squeezed into Snell's window overhead.
  // Sharing the ABOVE-water branch here is what made an early dive look like a
  // grey lid: the surface was being lit as if the sun were on this side of it.
  if (u_camUnder > 0.5) {
    float up = clamp(dot(Ng, normalize(vWorldPos - cameraPosition)), 0.0, 1.0);
    float window = smoothstep(0.62, 0.80, up);       // sin(48.6deg) ~ 0.75
    vec3 through = skyColor(refract(-V, -Ng, 1.0/1.333), t);
    vec3 mirror  = vec3(0.07, 0.16, 0.17) * 1.4;     // the water column, mirrored back
    col = mix(mirror, through, window);
    col = mix(col, vec3(0.93, 0.95, 0.96), clamp(foamM, 0.0, 0.9));  // foam from below
    col = mix(vec3(0.06, 0.15, 0.16), col, exp(-0.022*dist));        // murk
  }

  // gentle grade for parity with web/'s output transform
  col = pow(clamp(col, 0.0, 1.0), vec3(0.92));
  if (!(col.r == col.r)) col = vec3(0.0);   // NaN guard (house rule)
  gl_FragColor = vec4(col, 1.0);
}
`;

// Sparse impact volume. These are not free-running particles with their own
// simulation clock: every point samples breakerLifecycleAtX(), so the airborne
// collapse cannot outrun the surface mound or leave foam at a different locus.
export const SPRAY_VERT = `
uniform float u_time;
varying float vSprayAlpha;
varying float vSprayShade;
${MODEL_GLSL}

void main(){
  float x0 = position.x;
  float seedY = position.y;
  float seedZ = position.z;
  vec4 life = breakerLifecycleAtX(x0, u_time);
  float plunge = smoothstep(0.45, 1.25, u_xi);

  // PER-PARTICLE BALLISTICS (spray critique, 2026-08-11). The old pass flew
  // every droplet on the ONE shared lifecycle phase plus a constant hover
  // offset, so the whole population rose and floated in lockstep — detached
  // bead-strings above the wave. Each droplet now owns a hashed launch delay
  // and flight time: it leaves the LIP at the breaking front's position at
  // launch time, arcs ballistically shoreward, and lands inside the trailing
  // foam, where its alpha melts out.
  float h1 = hash21(vec2(x0*1.73, seedY*31.7));
  float h2 = hash21(vec2(seedZ*47.9, x0*0.61));
  float Tf    = 0.45 + 0.75*seedY;                  // flight time, s
  float delay = CRASH_PEAK_S - 0.25 + 0.95*h1;      // staggered launches across the crash
  float tf    = life.x - delay;                     // this droplet's own flight clock, s
  float u01   = clamp(tf/Tf, 0.0, 1.0);
  float airborne = (tf > 0.0 && tf < Tf) ? 1.0 : 0.0;

  // anchor: the front's position when THIS droplet launched (life.y is the
  // front now; frontSpeed mirrors breakerLifecycleAtX's mix(2.4, 4.1, plunge)).
  float frontSpeed = mix(2.4, 4.1, plunge);
  float zLaunch = life.y - frontSpeed*tf*airborne;
  // shoreward ballistic drift slower than the front (0.30-1.15x), so most
  // droplets fall behind the head and land in the trail, not ahead of it
  float vz = frontSpeed*(0.30 + 0.85*h2);

  // vertical: lip height down to the foam, apex taxonomy- and size-gated.
  // Heights in metres of DISPLAYED face (u_H0*VIS): identity at the 1.5 m
  // calibration day like every size factor.
  float yLip = 0.15 + u_H0*VIS*(0.50 + 0.30*seedZ);
  float lift = u_H0*VIS*(0.22 + 0.70*seedY)*(0.30 + 0.70*plunge);
  float x = x0 + (seedZ - 0.5)*2.4 + (h2 - 0.5)*1.8*u01;   // randomized spacing + drift
  float z = zLaunch + vz*tf;
  float y = yLip*(1.0 - u01) + 4.0*lift*u01*(1.0 - u01);   // parabola: lip -> apex -> foam
  vec3 world = vec3(x, y, z);
  vec4 mv = modelViewMatrix*vec4(world, 1.0);

  float grain = 0.40 + 0.60*smoothstep(0.08, 0.98, h1);
  // launch-window weight: droplets only leave while the crash is actually
  // throwing water (widened impact bell); life.z + life.w keeps mid-flight
  // droplets lit through the bore phase instead of gating on the fast-decaying
  // impact term alone.
  float lw = exp(-0.5*pow((delay - CRASH_PEAK_S)/(CRASH_SIGMA_S*2.6), 2.0));
  float live = clamp(u_breakShape, 0.0, 1.0)*(life.z + 0.8*life.w)*lw*grain*airborne;
  // fade in fast off the lip, melt out over the last quarter of the arc so
  // splashdown reads as joining the foam, not popping off
  float ends = smoothstep(0.0, 0.10, u01)*(1.0 - smoothstep(0.72, 1.0, u01));
  // SIZE_AUDIT open item 3: launch height already scales with H0 but droplet
  // opacity did not. Same 1.5 m calibration anchor (factor == 1.0 at H0 = 1.5,
  // so every 1.5 m preset is unchanged); tighter clamp than the foam factor
  // because alpha saturates faster than surface whiteness.
  float sizeSpray = clamp(u_H0/1.5, 0.7, 1.4);
  vSprayAlpha = live*(0.30 + 0.70*seedY)*ends*sizeSpray;
  vSprayShade = 0.72 + 0.28*seedZ;
  gl_PointSize = clamp((2.5 + 6.5*seedY)*(1.0 - 0.30*u01)*310.0/max(-mv.z, 12.0), 1.0, 15.0);
  gl_Position = projectionMatrix*mv;
}
`;

// ---------- the curtain (#curtain=1, 2026-08-24, default OFF) ----------
// THE VOID, CLOSED WITH GEOMETRY. The bend (#curl) takes the crest band over
// itself and stops: past the tip there is nothing — a lip hanging over open
// water, measured on the pocket transects as foam-bright top samples with bare
// water directly beneath (TODO 2026-08-22: 21 of 279 overhang bins, worst gap
// 7.67 m). A real plunging lip is joined to the face by a falling CURTAIN, and
// the space the curtain encloses is the barrel. Painting the foam out would
// treat the symptom; this is the recommended fix (1): real geometry joining
// the thrown lip back down to the face.
//
// HOW IT IS BUILT. A strip mesh, shader-authored like the spray but CONNECTED:
// position.x is alongshore world metres, position.y is the fall parameter
// v in [0,1] (0 = lip tip, 1 = landing). Both ends are evaluations of the
// SHIPPED surface, not estimates of it:
//   * the tip is surfacePos at the crest source point — the vertex the bend
//     carries farthest over — so the curtain hangs from the drawn lip, and
//     moves with every term that moves the lip (choppy, throw ceiling, bend);
//   * the landing is surfacePos at a source point CURT_REACH·h_crest
//     shoreward, so the bottom edge sits ON the drawn face. C0 at both ends
//     by construction — no seam to tune.
// Between them a quadratic Bezier whose control point continues the bend's
// own tangent at the tip (t = (sin th, cos th) in the (z, y) plane), so the
// jet leaves the lip tangentially instead of kinking off it.
//
// WHAT GATES IT. The curl out of surfacePos — th/PI, the turns of overturn
// the bend actually performed. No overturn, no curtain: spilling sites hang
// nothing, lulls hang nothing, and with u_curl = 0 the gate is identically
// zero (curl is only written by the bend). #curtain therefore REQUIRES
// #curl=1 to draw anything; that is the roadmap, not an accident — the
// curtain is the piece the bend was measured to be missing, and the two are
// judged together (#curl=1&lip=1&curtain=1). breakMask is applied the same
// way the aer path applies it: a section gap is line transport, not a
// breaking crest, and hangs no curtain.
//
// CURT_REACH: the landing sits 0.9·h_crest shoreward of the crest source.
// AUTHORED, in the wave's own length (the #lamcap lesson: no world-space
// constants in displacement paths). The 0.9 is the classical plunging-jet
// picture — the jet lands roughly a face height ahead — and is the knob the
// Mead & Black vortex-ratio refinement would replace (MODEL.md 1.4).
export const CURTAIN_VERT = `
${SURFACE_PRELUDE}
${SURFACE_GLSL}
varying float vCurtA;    // curtain alpha: overturn gate x far fade
varying vec2  vCurtUV;   // (alongshore metres, fall parameter v) for streaks
const float CURT_REACH = 0.9;

void main(){
  float x0 = position.x;               // alongshore, world metres
  float v  = position.y + 0.5;         // PlaneGeometry y in [-0.5, 0.5] -> [0,1]

  // The crest source point nearest the break line — the zipper's lip. Same
  // construction as the bend's dzC, solved for z instead of measured from it:
  // theta falls shoreward at kz, so the crest (theta = 0) sits thetaW/kz
  // shoreward of the break line.
  float zb     = breakLine(x0);
  float w      = 2.0*PI/u_T;
  float kk     = kLocalAt(vec2(x0, zb));
  float thetaB = w*u_time - rayPhase(vec2(x0, zb));
  float thetaW = mod(thetaB + PI, 2.0*PI) - PI;
  float kz     = max(kk*cos(swellPhi()), 0.25*kk);
  float zc     = zb + thetaW/kz;

  // Both ends of the curtain are the shipped surface itself.
  float f1, p1, b1, c1, l1, a1, curlT;
  vec3 Ptip = surfacePos(vec2(x0, zc), u_time, f1, p1, b1, c1, l1, a1, curlT);
  float hC   = crestCeilM(vec2(x0, zc));
  float f2, p2, b2, c2, l2, a2, k2;
  vec3 Pland = surfacePos(vec2(x0, zc + CURT_REACH*hC), u_time, f2, p2, b2, c2, l2, a2, k2);

  // Overturn gate: full curtain only where the lip is genuinely over
  // (curl = th/PI; 0.35 turns = 63 deg). Land kills it — a lip clamped to
  // the bed hangs nothing (surfacePos already zeroed curl there, but the
  // landing can be ashore of the tip on the last metres of the point).
  float gate = smoothstep(0.30, 0.55, curlT) * breakMask(x0)
             * (1.0 - l1) * (1.0 - l2) * farFadeAt(vec2(x0, zc));

  // Tangent continuation: the bend's arc direction at the tip, in (z, y) —
  // with the y component FLOORED AT ZERO. Below 90 deg of overturn the arc
  // tangent still points upward, and the first cut used it raw: the control
  // point sat ABOVE the lip and the curtain arced up out of the crest before
  // falling — a pale veil floating over the wave (live report 2026-08-24).
  // The curtain inherits the bend's own contract: it never lifts.
  float thTip = curlT*PI;
  vec2  tan2  = vec2(sin(thTip), min(cos(thTip), 0.0));
  float span  = distance(Ptip.zy, Pland.zy);
  vec2  ctrl  = Ptip.zy + tan2*0.45*span;
  ctrl.y = min(ctrl.y, Ptip.y);   // belt and braces: no control point above the lip

  // Quadratic Bezier tip -> landing, walked only as far as the overturn has
  // earned: the fall parameter is v*gate, so a marginal station hangs a short
  // jet growing off the lip instead of a full-size sheet at ghost alpha —
  // the second half of the same floating-veil defect. Full gate = full drop,
  // C0 at the landing exactly when the overturn is complete.
  float vG = v*gate;
  float u1 = 1.0 - vG;
  vec2 zy = u1*u1*Ptip.zy + 2.0*u1*vG*ctrl + vG*vG*Pland.zy;
  vec3 P  = vec3(x0, zy.y, zy.x);
  if (!(P.x == P.x && P.y == P.y && P.z == P.z)) P = Ptip;   // NaN guard (house rule)

  // A young jet is still water, not gauze: opacity rises much faster than
  // geometric reach (sqrt), so what exists reads solid.
  vCurtA  = sqrt(gate);
  vCurtUV = vec2(x0, v);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
}
`;

// Aerated falling water: the whitest thing in frame in field footage, streaked
// vertically because it is water in free fall, darkening slightly toward the
// landing where it entrains into the bore. Streak motion runs DOWN the curtain
// on the simulation clock (seconds — rate independence), not the frame clock.
export const CURTAIN_FRAG = `
varying float vCurtA;
varying vec2  vCurtUV;
uniform float u_time;

// Local value noise: MODEL_GLSL's vnoise2 lives in the vertex stage's prelude
// and is not spliced here; the curtain needs one octave, so it carries its
// own copy of the same hash rather than pulling the whole model in.
float chash21(vec2 p){ vec3 q = fract(vec3(p.xyx)*0.1031); q += dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float cnoise2(vec2 p){
  vec2 i = floor(p), f = fract(p);
  vec2 u = f*f*(3.0 - 2.0*f);
  return mix(mix(chash21(i), chash21(i + vec2(1.0, 0.0)), u.x),
             mix(chash21(i + vec2(0.0, 1.0)), chash21(i + vec2(1.0, 1.0)), u.x), u.y);
}

void main(){
  float streak = cnoise2(vec2(vCurtUV.x*0.9, vCurtUV.y*3.0 - u_time*1.4));
  float alpha = vCurtA * (0.80 + 0.20*streak);
  if (alpha < 0.02) discard;
  vec3 foamCol = mix(vec3(0.76, 0.80, 0.79), vec3(0.97), 0.35 + 0.65*streak);
  foamCol *= 1.0 - 0.18*vCurtUV.y;   // entrains darker toward the landing
  gl_FragColor = vec4(foamCol, alpha);
}
`;

export const SPRAY_FRAG = `
varying float vSprayAlpha;
varying float vSprayShade;

void main(){
  vec2 q = gl_PointCoord - vec2(0.5);
  float r = length(q);
  float alpha = vSprayAlpha*(1.0 - smoothstep(0.16, 0.50, r));
  if (alpha < 0.012) discard;
  vec3 foam = mix(vec3(0.76, 0.80, 0.79), vec3(0.98), vSprayShade);
  gl_FragColor = vec4(foam, alpha);
}
`;

// ---------- sky dome ----------
// The dome is re-centered on the camera every frame (main.js), so the vertex
// position IS the view direction — no per-fragment camera math needed.
export const SKY_VERT = `
varying vec3 vDir;
void main() {
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = `
uniform float u_time;
varying vec3 vDir;
${SKY_GLSL}
void main() {
  vec3 col = skyColor(normalize(vDir), u_time);
  col = pow(clamp(col, 0.0, 1.0), vec3(0.92));   // same grade as the water
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Seabed pass — the floor, drawn as its own surface so the free camera can
// dive and actually see the bottom descend. Before this, nothing existed below
// the water surface at all: diving got you the underside of the water plane
// (DoubleSide) and empty fog.
//
// Deliberately coarse (see main.js): the bed is a smooth ~7 m-post field, so
// it needs a fraction of the water grid's density and none of its ocean()
// evaluations. Land above the waterline is discarded here — the water mesh's
// land branch already owns it, and drawing both would z-fight.
// ---------------------------------------------------------------------------
// Past the finite NCEI patch, bedElevM clamps to the edge value, which would
// read as an infinite flat floor out to the 4 km skirt. Ramp it down instead,
// and keep it clearly a fade-to-deep rather than a claim about real depth.
// Shared by BED_VERT and BED_FRAG: the fragment discard has to reproduce the
// vertex elevation exactly, so these two must not be allowed to drift.
const BED_OUTSIDE_GLSL = `
float bedOutside(vec2 xz){
  vec2 lo = u_bedRect.xy, hi = u_bedRect.zw;
  vec2 d = max(max(lo - xz, xz - hi), vec2(0.0));
  return length(d);
}
`;

export const BED_VERT = `
uniform float u_time;
varying vec3  vBedPos;
varying float vBedDepth;   // metres of water overhead (0 at the waterline)
${MODEL_GLSL}
${BED_OUTSIDE_GLSL}

void main(){
  vec2 xz = position.xz;
  // The extrapolation ramp moved INTO bedElevM (2026-08-12) so the seabed and
  // the water grid's land path cannot disagree about the same ground; applying
  // it again here would double it.
  float e = bedElevM(xz) - u_waterLevel;
  vec3 P = vec3(xz.x, e, xz.y);
  vBedPos = P;
  vBedDepth = max(-e, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(P, 1.0);
}
`;

export const BED_FRAG = `
precision highp float;
uniform float u_time;
varying vec3  vBedPos;
varying float vBedDepth;
${MODEL_GLSL}
${DETAIL_GLSL}
${SKY_GLSL}
${BED_OUTSIDE_GLSL}

// Aerial perspective, shared verbatim with GRID_FRAG so the water and the bed
// converge on the same horizon instead of meeting at a seam (2026-08-12).
const float FOG_DENSITY = 0.0011;
const float HAZE_H      = 70.0;

vec3 sunDirB = normalize(vec3(-0.45, 0.42, -0.28));

float bedCaustic(vec2 p, float t) {
    p *= 0.35;
    mat2 rot = mat2(0.866, -0.5, 0.5, 0.866);
    float c = 0.0;
    float a = 1.0;
    for (int i = 0; i < 3; i++) {
        p = rot * p * 1.5;
        float v = sin(p.x + t * 0.8) * cos(p.y - t * 0.8);
        // sharp peaks where the value crosses 0
        c += pow(1.0 - abs(v), 5.0) * a;
        a *= 0.5;
    }
    return c * 0.8;
}

void main(){
  vec2 xz = vBedPos.xz;
  // land is the water mesh's job (its vLand branch) — discarding here keeps
  // the two surfaces from fighting over the same fragments above the waterline.
  //
  // This tested vBedDepth, a VARYING, and that was the black fringe along the
  // whole shoreline. The bed grid is a quarter of the water grid in each axis,
  // so a bed cell straddling the waterline interpolates "still underwater"
  // across ground the fine water mesh has already drawn as beach. The bed then
  // paints a sliver there — and at shoreline sight distances the Beer-Lambert
  // term below has run to murk (0.05, 0.12, 0.13), which against lit sand
  // reads as black, not as water.
  // Re-test against the same field the geometry came from. Exact per fragment
  // and independent of the grid ratio, which the varying could never be.
  // It must reproduce BED_VERT's elevation IN FULL, extrapolation ramp
  // included: testing bare bedElevM punched a hole in the far seabed, because
  // outside the NCEI patch bedElevM clamps to an above-water edge value while
  // the vertex had already ramped that ground down to deep water.
  // The -0.02 epsilon assumed the water surface never dips below still level;
  // at the swash it does — detail chop and the breathing waterline notch the
  // surface locally under the sand, and the bed pokes through the notch as
  // near-black Beer-Lambert murk (the 2026-08-12 "black pixel goo" report,
  // set-phase dependent: 0 goo px at the sim=60 lull, 45 at the sim=110 peak
  // at the default view). Discard anything within SWASH_M of the LIFTED
  // waterline instead: deep enough to cover the chop amplitude, and in water
  // that shallow the murk term had rendered the bed invisible anyway.
  // (First attempt subtracted the lift with the old epsilon — that UN-discards
  // the swash band and drew murk across it: goo went 45 -> 450. Measured.)
  float swashM = 0.35 + VIS*setupLiftM(xz, u_time);
  // Ramp is inside bedElevM now (2026-08-12) — this must match BED_VERT's
  // elevation EXACTLY or the discard test punches holes in the far seabed.
  float eFrag = bedElevM(xz) - u_waterLevel;
  if (eFrag >= -swashM) discard;
  // normal by finite difference on the bed field itself
  float e = 1.5;
  float hx = bedElevM(xz + vec2(e,0.0)) - bedElevM(xz - vec2(e,0.0));
  float hz = bedElevM(xz + vec2(0.0,e)) - bedElevM(xz - vec2(0.0,e));
  vec3 N = normalize(vec3(-hx, 2.0*e, -hz));

  // sand, roughening to darker reef on steep faces — slope is the only
  // substrate cue the DEM actually supports, so it is the only one used
  float slope = 1.0 - clamp(N.y, 0.0, 1.0);
  vec3 sand = vec3(0.60, 0.53, 0.41);
  vec3 reef = vec3(0.24, 0.26, 0.22);
  float grain = vnoise2(xz*1.9)*0.55 + vnoise2(xz*0.5)*0.45;
  vec3 albedo = mix(sand, reef, smoothstep(0.05, 0.35, slope)) * (0.85 + 0.3*grain);

  float lam = 0.35 + 0.65*clamp(dot(N, sunDirB), 0.0, 1.0);

  // Beer-Lambert down from the surface and back to the eye. Same coastal
  // coefficients as the water surface's bottom tint, so a bed seen from above
  // through the surface and the same bed seen from underwater agree.
  // Two separate paths, which the first version conflated: sunlight travelling
  // DOWN the column is attenuated at the full coastal rate, but sight distance
  // through the water is deliberately gentler. Real Monterey Bay visibility is
  // ~3-6 m; at that rate the seafloor is a black frame and illustrates nothing,
  // so horizontal sight is a stated legibility allowance, not a claim.
  vec3 kExt = vec3(0.45, 0.20, 0.16);
  // Floor the downwelling term: pure exp() over a 3 m column lands the sand at
  // ~(0.08,0.17,0.15), which is the murk colour to two decimals — the bed was
  // being drawn and was simply invisible against the water. Ambient scattering
  // in shallow water is real; this keeps the depth trend while restoring the
  // contrast that makes the floor readable as a surface.
  vec3 lightAtBed = mix(vec3(0.38), exp(-kExt * vBedDepth), 0.72) * 1.8;
  
  // Caustics: strongest in shallow water, faded by 8m depth, requires sunlight
  float causticFade = smoothstep(8.0, 1.0, vBedDepth) * clamp(dot(N, sunDirB), 0.0, 1.0);
  if (causticFade > 0.01) {
      float c = bedCaustic(xz, u_time);
      lightAtBed += vec3(0.9, 0.95, 1.0) * c * causticFade * 1.1;
  }

  float sight = length(cameraPosition - vBedPos);
  vec3 col = albedo * lam * lightAtBed;
  vec3 murk = vec3(0.05, 0.12, 0.13);
  col = mix(col, murk, 1.0 - exp(-0.028 * sight));   // e-fold ~36 m

  // AERIAL PERSPECTIVE — this shader had none, so every distant bed fragment
  // converged on the murk constant and rendered as a near-black sliver. Local
  // to the surf zone that is invisible (the water hides it); once the patch
  // extent doubled on 2026-08-12 the far waterline put those slivers on
  // screen as a black band, which check_swash caught at 551 px. The water
  // shader has fogged since M1 — the bed simply never got the same treatment,
  // and murk-without-fog is not a physical endpoint: at 2 km of haze the
  // seabed cannot be darker than the air in front of it.
  // Same law, same constants as GRID_FRAG's section 5, so the two surfaces
  // converge on one horizon rather than meeting at a seam.
  float dyB = max(cameraPosition.y - vBedPos.y, 0.0);
  float inLayerB = dyB > HAZE_H ? HAZE_H / dyB : 1.0;
  vec3 VB = normalize(cameraPosition - vBedPos);
  col = mix(col, skyColor(-VB, u_time), 1.0 - exp(-sight * inLayerB * FOG_DENSITY));
  gl_FragColor = vec4(col, 1.0);
}
`;
