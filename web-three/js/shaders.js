// web-three shaders — displaced-grid renderer over the SAME model GLSL as
// web/ (spliced from web/js/model-glsl.js; MODEL.md is the source of truth).
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
// The model itself is untouched — everything here is renderer-side texture.

import { MODEL_GLSL } from '../../web/js/model-glsl.js';

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
varying float vBoil;
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
${VARYINGS}
${MODEL_GLSL}
${DETAIL_GLSL}

// stage rect for the far fade — mirrors STAGE_* in main.js
const vec2 STAGE_HALF   = vec2(300.0, 250.0);
const vec2 STAGE_CENTER = vec2(0.0, 10.0);

void main() {
  // geometry is authored in world metres on the XZ stage (see main.js), so
  // position.xz IS the model coordinate — no extra transform to keep in sync
  vec2 xz = position.xz;

  float foam, pocket, brk, crest;
  float h = ocean(xz, u_time, foam, pocket, brk, crest);

  // displaced normal by central finite difference at one core grid cell (the
  // spec's "finite diff in UV space"): one cell, not a fixed metre step, so
  // the normal tracks whatever resolution the grid is built at
  float ex = u_cell.x, ez = u_cell.y;
  vec3 N = vec3(
    oceanH(xz - vec2(ex, 0.0), u_time) - oceanH(xz + vec2(ex, 0.0), u_time),
    2.0*max(ex, ez),
    oceanH(xz - vec2(0.0, ez), u_time) - oceanH(xz + vec2(0.0, ez), u_time));

  // boil slick — mirrors ocean()'s internal boil dome (same constants); passed
  // down as a varying so both stages can damp ripple detail over the glass
  float m_ = tan(clamp(u_alpha, 0.06, 1.45));
  vec2 boilPos = vec2(-22.0, m_*22.0*u_aframe + m_*(-22.0)*(1.0-u_aframe) - 8.0);
  float boil = exp(-dot(xz - boilPos, xz - boilPos)/(2.0*5.5*5.5));

  // fine displacement octaves at reduced amplitude (spec: "full detail lives
  // in normals"); damped in foam and over the boil, matching the fragment
  float vAmp = 0.16 * (0.5 + 0.5*u_chop)
             * (1.0 - 0.85*clamp(foam, 0.0, 1.0)) * (1.0 - 0.9*boil);
  h += detailH(xz, u_time) * vAmp;

  // far skirt: the stretched outer cells (see main.js) are far bigger than
  // LAM and would alias the carrier into low-frequency junk, so displacement
  // and its bookkeeping fade to mean sea level; fog has ~killed the surface
  // by then, only the fresnel-on-flat-water read remains (which is correct)
  vec2 dOut = max(abs(xz - STAGE_CENTER) - STAGE_HALF, vec2(0.0));
  float farFade = 1.0 - smoothstep(100.0, 800.0, length(dOut));
  h *= farFade;
  N.xz *= farFade;   // flatten normals with the surface, not before it

  vec3 wp = vec3(xz.x, h, xz.y);
  vWorldPos = wp;
  vNormal   = normalize(N);
  vFoam     = foam * farFade;
  vPocket   = pocket * farFade;
  vCrest    = crest * farFade;
  vBrk      = brk;
  vBoil     = boil;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
}
`;

export const GRID_FRAG = `
uniform float u_time;
${VARYINGS}
${MODEL_GLSL}
${SKY_GLSL}
${DETAIL_GLSL}

// fog density paired with the grid's ~4 km skirt (main.js FAR_EXTENT): the
// plane outlives the fog, so the horizon is a fade, never a geometry seam.
// The marine layer hugs the surface (HAZE_H): near-horizontal cliff rays run
// their whole length through it, but the drone's near-vertical rays only
// cross HAZE_H metres of haze — without this the top-down view greys out.
const float FOG_DENSITY = 0.0011;
const float HAZE_H      = 70.0;

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

  // foam mask: vFoam interpolates the model's bore mask across grid cells, so
  // its edges land on ruler-straight cell-aligned lines (M1 critique #5).
  // Erode per-fragment with drifting noise so the front dissolves into
  // fingers/lace instead of terminating on the grid.
  // Two-octave erosion, low frequency dominant: a single ~1 m noise aliases
  // into per-pixel dither from the drone (0.57 m/px up there) — the ~3 m
  // octave carries the fingering, the fine octave only roughens edges.
  float foamM = clamp(vFoam, 0.0, 1.0);
  float er = vnoise2(xz*0.35 + vec2(t*0.08, -t*0.05))*0.65
           + vnoise2(xz*0.90 + vec2(t*0.10, -t*0.07))*0.35;
  foamM = smoothstep(0.15, 0.75, foamM + (er - 0.5) * 0.5);

  // ---- 1. detail spectrum: fragment-stage normal perturbation ----
  // damped where foam owns the surface and over the boil slick; wind chop
  // raises the ripple energy on top of a glassy-day floor.
  // detailVis: one grid cell spans many detail wavelengths at distance, so the
  // full-amplitude gradient is pure undersampling noise past ~300 m (critique
  // #3) — fade the perturbation with distance and hand its variance to a
  // wider specular lobe below (LEAN-style transfer).
  float detailVis = exp(-dist * 0.003);
  float damp = (1.0 - 0.85*foamM) * (1.0 - 0.9*boil);
  vec2 g = detailGrad(xz, t) * (0.55 + 0.55*u_chop) * damp * detailVis;
  vec3 Ng = normalize(vNormal);                          // geometric (wave-scale) normal
  vec3 N = normalize(vec3(Ng.x - g.x, Ng.y, Ng.z - g.y)); // + ripple detail

  // foam roughness normal (used for foam's own lighting below); influence kept
  // low — foam under a marine layer is lit mostly ambiently, strong normal
  // shading was reading as grey streaks (critique #1)
  vec2 fg = foamGrad(xz, t) * 0.25 * foamM;
  vec3 Nf = normalize(vec3(N.x - fg.x, N.y, N.z - fg.y));

  // base albedo: web/'s NorCal palette (slate blue -> shelf -> murky inner)
  float shoreT = smoothstep(-250.0, 60.0, xz.y - breakLine(xz.x));
  vec3 deep  = vec3(0.10, 0.15, 0.19);
  vec3 shelf = vec3(0.11, 0.21, 0.22);
  vec3 inner = vec3(0.19, 0.27, 0.26);
  vec3 base  = mix(deep, mix(shelf, inner, smoothstep(0.5, 1.0, shoreT)), shoreT);
  base += vec3(0.03, 0.10, 0.10) * clamp(vWorldPos.y*0.35, 0.0, 1.2);
  float lam = clamp(dot(N, sunDir), 0.0, 1.0);
  base *= 0.62 + 0.50*lam;   // gentle slope shading so faces still read

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
  vec3 refl = skyColor(reflect(-V, Ng), t) * 0.88;
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
  float hMean = clamp(vWorldPos.y / max(u_H0*VIS, 0.001), 0.0, 1.0);
  float sss   = pow(back, 3.0) * thin * hMean * trans;
  col += vec3(0.16, 0.42, 0.38) * sss * 1.5;

  // pocket tint (reduced vs M0 — fresnel+sss now carry the pocket) and
  // thrown-lip spray for plunging waves, both kept from web/
  vec3 pocketCol = mix(vec3(0.15, 0.38, 0.36), vec3(0.10, 0.30, 0.33), clamp(u_xi*0.4, 0.0, 1.0));
  col = mix(col, pocketCol, clamp(vPocket*1.4, 0.0, 0.55));
  float lip = smoothstep(0.5, 1.5, u_xi) * vPocket;
  col = mix(col, vec3(0.97), clamp(lip*1.2*vnoise2(xz*0.6 + t), 0.0, 0.9));

  // ---- 4. foam IN the surface ----
  // web/'s two-octave clump texture, but lit mostly ambiently: under a marine
  // layer whitewater is bright from every direction, and stacking texture x
  // sun shading multiplicatively dropped it to wet-grey (critique #1) — the
  // clump texture and sun term are narrow modulations on a white base now.
  // Structure (bore, streaks, lace, spray, crumb) arrives inside vFoam.
  float ftex = 0.58 + 0.42*(vnoise2(xz*0.35 + vec2(t*0.15, -t*0.1))*0.6
                          + vnoise2(xz*1.15 - vec2(t*0.08, t*0.05))*0.4);
  float lamF = clamp(dot(Nf, sunDir), 0.0, 1.0);
  vec3 foamCol = vec3(0.93, 0.95, 0.96) * (0.8 + 0.2*ftex) * (0.85 + 0.15*lamF);
  col = mix(col, foamCol, clamp(foamM*1.15, 0.0, 0.97));

  // ---- 5. aerial perspective ----
  // fog toward the same procedural sky the dome draws, evaluated along the
  // view ray — the far plane converges on exactly what surrounds it
  float dy = max(cameraPosition.y - vWorldPos.y, 0.0);
  float inLayer = dy > HAZE_H ? HAZE_H / dy : 1.0;   // ray fraction inside the haze
  float fog = 1.0 - exp(-dist * inLayer * FOG_DENSITY);
  col = mix(col, skyColor(-V, t), fog);

  // gentle grade for parity with web/'s output transform
  col = pow(clamp(col, 0.0, 1.0), vec3(0.92));
  if (!(col.r == col.r)) col = vec3(0.0);   // NaN guard (house rule)
  gl_FragColor = vec4(col, 1.0);
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
