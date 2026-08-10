// web-three M0 shaders — displaced-grid renderer over the SAME model GLSL as
// web/ (spliced from web/js/model-glsl.js; MODEL.md is the source of truth).
// Written GLSL1-style (varying / gl_FragColor) on purpose: three.js
// ShaderMaterial prefixes translate those for WebGL2, so the shared chunk
// stays version-agnostic and identical between renderers.
//
// M0 is mechanical parity: VERTICAL displacement only, minimal flat-ish
// shading — just enough to see the geometry. The M1 shading pass (detail
// normals, fresnel/glitter, subsurface, foam-in-surface) replaces the
// fragment shader wholesale; don't polish it here.

import { MODEL_GLSL } from '../../web/js/model-glsl.js';

// Varyings the spec names: world pos, displaced normal, foam, pocket, crest, brk.
const VARYINGS = `
varying vec3  vWorldPos;
varying vec3  vNormal;
varying float vFoam;
varying float vPocket;
varying float vCrest;
varying float vBrk;
`;

export const GRID_VERT = `
uniform float u_time;   // simulation seconds (speed-scaled, pausable, JS-side)
uniform vec2  u_cell;   // grid cell size in metres (x, z) — normal FD step
${VARYINGS}
${MODEL_GLSL}

void main() {
  // geometry is authored in world metres on the XZ stage (see main.js), so
  // position.xz IS the model coordinate — no extra transform to keep in sync
  vec2 xz = position.xz;

  float foam, pocket, brk, crest;
  float h = ocean(xz, u_time, foam, pocket, brk, crest);

  // displaced normal by central finite difference at one grid cell (the
  // spec's "finite diff in UV space"): one cell, not a fixed metre step, so
  // the normal tracks whatever resolution the grid is built at
  float ex = u_cell.x, ez = u_cell.y;
  vec3 N = vec3(
    oceanH(xz - vec2(ex, 0.0), u_time) - oceanH(xz + vec2(ex, 0.0), u_time),
    2.0*max(ex, ez),
    oceanH(xz - vec2(0.0, ez), u_time) - oceanH(xz + vec2(0.0, ez), u_time));

  vec3 wp = vec3(xz.x, h, xz.y);   // M0: vertical displacement only
  vWorldPos = wp;
  vNormal   = normalize(N);
  vFoam     = foam;
  vPocket   = pocket;
  vCrest    = crest;
  vBrk      = brk;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(wp, 1.0);
}
`;

export const GRID_FRAG = `
uniform float u_time;
${VARYINGS}
${MODEL_GLSL}

// same diffuse marine-layer light direction as web/
vec3 sunDir = normalize(vec3(-0.45, 0.42, -0.28));

void main() {
  vec2 xz = vWorldPos.xz;
  vec3 N = normalize(vNormal);

  // NorCal palette constants lifted verbatim from web/ waterColor():
  // slate blue -> grey-green shelf -> murky sand-green inner
  float shoreT = smoothstep(-250.0, 60.0, xz.y - breakLine(xz.x));
  vec3 deep  = vec3(0.10, 0.15, 0.19);
  vec3 shelf = vec3(0.11, 0.21, 0.22);
  vec3 inner = vec3(0.19, 0.27, 0.26);
  vec3 col   = mix(deep, mix(shelf, inner, smoothstep(0.5, 1.0, shoreT)), shoreT);

  // crest faces catch light; unbroken swell lines stay legible from above
  col += vec3(0.03, 0.10, 0.10) * clamp(vWorldPos.y*0.35, 0.0, 1.2);
  col += vec3(0.05, 0.13, 0.12) * vCrest;

  // flat-ish lambert so the displaced geometry reads; real shading is M1
  float lam = clamp(dot(N, sunDir), 0.0, 1.0);
  col *= 0.55 + 0.65*lam;

  // the pocket: glassy lit face (web/ pocket tint, no lip spray yet)
  vec3 pocketCol = mix(vec3(0.15, 0.38, 0.36), vec3(0.10, 0.30, 0.33), clamp(u_xi*0.4, 0.0, 1.0));
  col = mix(col, pocketCol, clamp(vPocket*1.4, 0.0, 0.85));

  // whitewater: flat white-ish mix; foam-in-surface treatment is M1
  col = mix(col, vec3(0.93, 0.95, 0.96), clamp(vFoam*1.15, 0.0, 0.92));

  // gentle grade for parity with web/'s output transform
  col = pow(clamp(col, 0.0, 1.0), vec3(0.92));
  gl_FragColor = vec4(col, 1.0);
}
`;
