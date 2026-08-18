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

export const GRID_VERT = `
uniform float u_time;   // simulation seconds (speed-scaled, pausable, JS-side)
uniform vec2  u_cell;   // core grid cell size in metres (x, z) — normal FD step
uniform float u_fidelityLook; // 0 current, 1 foam, 2 connected face/lip probe
${VARYINGS}
${MODEL_GLSL}
${DETAIL_GLSL}
${KELP_GLSL}

// stage rect for the far fade — mirrors STAGE_* in main.js
const vec2 STAGE_HALF   = vec2(300.0, 250.0);
const vec2 STAGE_CENTER = vec2(0.0, 10.0);

// far skirt: the stretched outer cells (see main.js) are far bigger than
// LAM and would alias the carrier into low-frequency junk, so displacement
// and its bookkeeping fade to mean sea level; fog has ~killed the surface
// by then, only the fresnel-on-flat-water read remains (which is correct).
// Factored out because M2's displaced-position FD samples need the same fade.
float farFadeAt(vec2 xz){
  vec2 dOut = max(abs(xz - STAGE_CENTER) - STAGE_HALF, vec2(0.0));
  return 1.0 - smoothstep(100.0, 800.0, length(dOut));
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
vec3 choppyPos(vec2 xz0, float t, out float foam, out float pocket, out float brk, out float crest, out float aer){
  float fade = farFadeAt(xz0);
  aer = 0.0;
  if (fade <= 0.001) {   // deep in the skirt: flat calm, skip 5 ocean() evals
    foam = 0.0; pocket = 0.0; brk = 0.0; crest = 0.0;
    return vec3(xz0.x, 0.0, xz0.y);
  }

  float h = ocean(xz0, t, foam, pocket, brk, crest);

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
  // PACK-ICE FIX (drone critique, 2026-08-11): between crests h crosses zero,
  // so the old fixed 0.6 m floor let lam = S/(a k^2) blow up over near-flat
  // water, and the wind-chop gradient (9 m / 3 m noise cells, resolved by the
  // e = 2 m FD) got amplified into grid creases — a polygonal crack web with
  // bright seams across the whole aftermath zone. Verified cause: state.chop=0
  // removes the web, foam-tau toggles do not. Floor the amplitude estimate at
  // a fraction of the day's DISPLAYED swell height instead: crests (|h| well
  // above the floor) are untouched, troughs stop turning noise into folds.
  // This is not a size factor (no H0 = 1.5 identity contract) — it must
  // change trough behavior at every size; that is the fix.
  float aEst   = clamp(abs(h), max(0.6, 0.30*u_H0*VIS), 12.0);  // local displayed amplitude, m
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
  float sizeGate = mix(1.0, clamp(excessQ, 0.0, 1.5), u_depthMix);
  float connectedLook = step(1.5, u_fidelityLook);
  // S calibrated against the old convergence at the 1.5 m model-card day
  // (approach ~0.42, full pocket on plunging ~1.4 before the gate). Field
  // diagnosis at the sim-42 Cliff peak showed that the shared 0.42 approach
  // term still bunched several shore-normal rows into a hard planar wall even
  // with structural anatomy and plunge disabled. Full keeps the pocket-owned
  // break sharpening but halves the broad approach compression, restoring a
  // curved lead-in to the hinge. Current/foam retain the authored 0.42 path.
  float Sapp   = mix(0.42, 0.22, connectedLook) * steep;
  float Sover  = (0.15 + 1.30*plunge) * pocket * sizeGate;
  float S      = clamp(Sapp + Sover, 0.0, 1.8);      // >1 folds; cap guards the mesh
  // Field-fidelity probe: the old full over-cusp range produced a broad
  // self-intersecting sheet. From the cliff camera its DoubleSide underside
  // read as several detached black manta polygons, not one wave face. Keep
  // the authored fold untouched for current/foam; full stops just before the
  // cusp so the crest can hinge visually without becoming a separate ribbon.
  if (connectedLook > 0.5) S = min(S, 0.98);
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
  float throwMag = mix(5.0, 0.72, connectedLook)
                 * pocket * plunge * hM * lipJit * lipTip;
  off.y += throwMag;

  // Curl downward. LINEAR in face height — the first metre-calibration kept
  // the old quadratic (1.55*hM^2) and the critique caught it eating the crest
  // at size: ~7.5 m of drop on a 2.5 m day, so the big face subtended barely
  // more screen than the 1.5 m one. A fall distance scales like the height
  // fallen from, not its square. 3.0*hM matches the old drop at the 1.5 m
  // model-card day (3.5*hN^2 = 5.9 m ~ 3.0*1.95).
  float dropMag = mix(3.0, 0.28, connectedLook)
                * pocket * plunge * hM * lipJit
                * mix(1.0, 0.72 + 0.82*frontPhase, anatomy);
  h -= dropMag;

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
  float aerCurtain = smoothstep(0.80, 1.15, Sapp + Sover)
                   * clamp(throwMag / max(1.2*hM, 0.5), 0.0, 1.0);
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
  float offLen = length(off);
  off *= min(offLen, 20.0) / max(offLen, 1e-6);
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
                out float brk, out float crest, out float land, out float aer){
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
    foam = 0.0; pocket = 0.0; brk = 0.0; crest = 0.0; aer = 0.0;
    land = 1.0;
    return vec3(xz0.x, bedY, xz0.y);
  }
  vec3 P = choppyPos(xz0, t, foam, pocket, brk, crest, aer);
  land = 0.0;
  if (bedY > P.y) {
    P = vec3(xz0.x, bedY, xz0.y);
    land = 1.0;
    foam = 0.0; pocket = 0.0; brk = 0.0; crest = 0.0; aer = 0.0;  // no surf on dry sand
  }
  return P;
}

void main() {
  // geometry is authored in world metres on the XZ stage (see main.js), so
  // position.xz IS the model coordinate — no extra transform to keep in sync
  vec2 xz = position.xz;

  float foam, pocket, brk, crest, land, aer;
  vec3 P = surfacePos(xz, u_time, foam, pocket, brk, crest, land, aer);

  // normals by finite differences on the DISPLACED positions (spec M2) — the
  // height-only FD of M1 is blind to the fold. Forward differences at one
  // core cell: central would push the (already 3x M1) vertex cost to 5x for
  // a half-cell phase shift invisible at ~1.2 m cells.
  float f2, p2, b2, c2, l2, a2;
  vec3 Px = surfacePos(xz + vec2(u_cell.x, 0.0), u_time, f2, p2, b2, c2, l2, a2);
  vec3 Pz = surfacePos(xz + vec2(0.0, u_cell.y), u_time, f2, p2, b2, c2, l2, a2);
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
  float tSince = mod(wA*t - rayPhase(xz), 2.0*PI)/wA;
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
  foamM = max(foamM, u_crestRead * 0.72 * clamp(vPocket*1.5, 0.0, 1.0));
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
  float foamAge = mix(lifeC.x + u_T, lifeC.x,
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
