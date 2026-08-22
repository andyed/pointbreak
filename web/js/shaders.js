// GLSL sources for the zipper point-break model. See docs/MODEL.md and
// glsl/zipper.md — the break line z_b(x) IS the peel line: a stationary
// diagonal on the shelf; each advancing crest crosses it progressively in x,
// which produces the traveling breakpoint (the zipper) with no per-wave state.
//
// The model math (coastCurve/breakLine/reefWindow/setEnv/ocean + helpers)
// lives in model-glsl.js so web-three/ can splice the identical string —
// this file owns only the raymarch renderer (shading, views, surfer SDF).

import { MODEL_GLSL } from '../../shared/model-glsl.js';

export const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export const FRAG = `#version 300 es
precision highp float;

uniform vec2  u_res;
uniform float u_time;     // simulation seconds (speed-scaled, pausable, JS-side)
uniform float u_view;     // 0 drone (ortho top-down), 1 cliff (raymarch)

out vec4 fragColor;

${MODEL_GLSL}

// ---------- shading ----------
vec3 sunDir = normalize(vec3(-0.45, 0.42, -0.28));

vec3 skyColor(vec3 rd, float t){
  // marine-layer haze: near-white horizon, soft grey-blue zenith (ref photos)
  float horiz = pow(1.0 - max(rd.y, 0.0), 2.2);
  vec3 sky = mix(vec3(0.52, 0.62, 0.72), vec3(0.88, 0.90, 0.91), horiz);
  float sun = pow(max(dot(rd, sunDir), 0.0), 300.0);
  sky += vec3(0.9, 0.85, 0.75)*sun*0.8;          // diffuse glow, no hard disc
  // thin high overcast rather than puffy cumulus
  if (rd.y > 0.02) {
    vec2 cp = rd.xz/(rd.y+0.08)*1.6 + vec2(t*0.004, 0.0);
    float cl = vnoise2(cp)*0.6 + vnoise2(cp*2.7)*0.3;
    sky = mix(sky, vec3(0.93, 0.93, 0.92), smoothstep(0.5, 0.85, cl)*0.45*smoothstep(0.02,0.2,rd.y));
  }
  return sky;
}

vec3 waterColor(vec2 xz, float h, vec3 N, vec3 V, float foam, float pocket, float brk, float crest, float t){
  // base: deep offshore blue -> shelf teal near the line -> sandy turquoise inside
  // cold NorCal Pacific (ref photos): slate blue -> grey-green -> murky sand-green
  float shoreT = smoothstep(-250.0, 60.0, xz.y - breakLine(xz.x));
  vec3 deep  = vec3(0.10, 0.15, 0.19);
  vec3 shelf = vec3(0.11, 0.21, 0.22);
  vec3 inner = vec3(0.19, 0.27, 0.26);
  vec3 base  = mix(deep, mix(shelf, inner, smoothstep(0.5,1.0,shoreT)), shoreT);

  // crest faces catch light; unbroken swell lines stay legible from above
  base += vec3(0.03, 0.10, 0.10) * clamp(h*0.35, 0.0, 1.2);
  base += vec3(0.05, 0.13, 0.12) * crest;

  // fresnel sky reflection + sun glitter
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 refl = skyColor(reflect(-V, N), t);
  vec3 col = mix(base, refl, clamp(fres*0.75, 0.0, 0.75));
  float spec = pow(max(dot(reflect(-sunDir, N), -V), 0.0), 40.0);   // diffuse marine-layer light
  col += vec3(0.9, 0.88, 0.84)*spec*0.45;

  // the pocket: glassy lit face; xi decides lip character
  vec3 pocketCol = mix(vec3(0.15, 0.38, 0.36), vec3(0.10, 0.30, 0.33), clamp(u_xi*0.4,0.0,1.0));
  col = mix(col, pocketCol, clamp(pocket*1.4, 0.0, 0.85));
  // thrown-lip spray for plunging waves (Battjes: plunging above ~0.5)
  float lip = smoothstep(0.5, 1.5, u_xi) * pocket;
  col = mix(col, vec3(0.97), clamp(lip*1.2*vnoise2(xz*0.6 + t), 0.0, 0.9));

  // whitewater: clumpy foam, fine octave on top so cells stay organic
  float ftex = 0.58 + 0.42*(vnoise2(xz*0.35 + vec2(t*0.15, -t*0.1))*0.6
                          + vnoise2(xz*1.15 - vec2(t*0.08, t*0.05))*0.4);
  col = mix(col, vec3(0.93, 0.95, 0.96)*ftex, clamp(foam*1.15, 0.0, 0.92));
  return col;
}

vec3 shade(vec2 xz, float t, vec3 V){
  float foam, pocket, brk, crest;
  // web/ is DEPRECATED (CLAUDE.md). This line is kept in step with the shared
  // model's signature only so the file still compiles; the value is unused.
  float carrierAmpUnused;
  float h = ocean(xz, t, foam, pocket, brk, crest, carrierAmpUnused);
  float e = 2.0;
  vec3 N = normalize(vec3(
    oceanH(xz - vec2(e,0.0), t) - oceanH(xz + vec2(e,0.0), t),
    2.0*e,
    oceanH(xz - vec2(0.0,e), t) - oceanH(xz + vec2(0.0,e), t)));
  return waterColor(xz, h, N, V, foam, pocket, brk, crest, t);
}

// ---------- surfer SDF (cliff view): board + leaning rider silhouette ----------
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0);
  return length(pa - ba*h) - r;
}

float surferSDF(vec3 p, vec4 s, float ys){
  vec2 dir = normalize(vec2(s.z, s.w));
  vec3 c = vec3(s.x, ys, s.y);
  vec3 q = p - c;
  // board: flattened capsule along velocity
  vec3 bA = vec3(-dir.x, 0.0, -dir.y)*1.1, bB = vec3(dir.x, 0.05, dir.y)*1.1;
  float board = sdCapsule(q, bA, bB, 0.28) - 0.0;
  // rider: leaning capsule (lean into the turn with the pump)
  float lean = 0.55*sin(u_time*2.0*PI/6.0);
  vec3 top = vec3(dir.x*lean, 1.55, dir.y*lean);
  float body = sdCapsule(q, vec3(0.0, 0.15, 0.0), top, 0.30);
  return min(board, body);
}

// analytic-ish: sphere-trace the surfer only near the ray's closest approach
bool hitSurfer(vec3 ro, vec3 rd, float t, float tWater, out float tHit){
  vec4 s = surferState(t);
  float ys = oceanH(vec2(s.x, s.y), t) + 0.35;
  vec3 c = vec3(s.x, ys + 0.8, s.y);
  float tc = dot(c - ro, rd);
  if (tc < 0.5 || tc > tWater + 2.0) return false;
  if (length(ro + rd*tc - c) > 3.5) return false;
  float tt = tc - 3.5;
  for (int i = 0; i < 28; i++) {
    float d = surferSDF(ro + rd*tt, s, ys);
    if (d < 0.05) { tHit = tt; return true; }
    tt += max(d*0.9, 0.02);
    if (tt > tc + 3.5) return false;
  }
  return false;
}

// ---------- drone view: oblique orthographic map ----------
vec3 droneView(vec2 uv, float t){
  // world window ~600 m wide: tight enough that the zipper visibly travels
  float aspect = u_res.x/u_res.y;
  vec2 xz = vec2(uv.x*170.0*aspect, -uv.y*170.0 + 10.0);
  vec3 V = normalize(vec3(0.28, 1.0, -0.42));   // oblique for specular life
  vec3 col = shade(xz, t, V);
  if (u_surfer > 0.5) {
    vec4 s = surferState(t);
    float d = length(xz - s.xy);
    col = mix(col, vec3(0.05, 0.06, 0.07), smoothstep(2.6, 1.2, d));
    col = mix(col, vec3(1.0), smoothstep(1.2, 2.2, d)*smoothstep(3.4, 2.6, d)*0.85);
  }
  return col;
}

// ---------- cliff view: heightfield raymarch ----------
float mapH(vec3 p, float t){ return p.y - oceanH(p.xz, t); }

vec3 cliffView(vec2 uv, float t){
  // camera on the cliff: follow the surfer when riding, else a fixed lineup shot
  float xCam = 210.0;
  // Shoreward of the break line now that the line is a contour ("-" used to be
  // the land side when it was tilted off the shore, and is the sea side now).
  vec3 ro = vec3(xCam, 16.0, breakLine(xCam) + 60.0);  // cliff height: shoot OVER foreground crests
  vec3 taFixed = vec3(-120.0, 3.0, breakLine(-120.0) - 10.0);
  vec4 s = surferState(t);
  vec3 ta = mix(taFixed, vec3(s.x, 2.0, s.y), u_surfer);
  float dist = length(ta.xz - ro.xz);
  float zoom = mix(2.1, clamp(1500.0/max(dist, 40.0), 2.0, 6.5), u_surfer);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0,1.0,0.0)));
  vec3 up = cross(rt, fw);
  float aspect = u_res.x/u_res.y;
  vec3 rd = normalize(fw*zoom + rt*uv.x*aspect + up*uv.y);

  if (rd.y > 0.15) return skyColor(rd, t);

  float tt = 1.0, tPrev = 1.0;
  bool hit = false;
  for (int i = 0; i < 110; i++) {
    vec3 p = ro + rd*tt;
    float dh = mapH(p, t);
    if (dh < 0.0) { hit = true; break; }
    tPrev = tt;
    tt += clamp(dh*0.6, 0.35, 14.0);
    if (tt > 2400.0) break;
  }

  vec3 col;
  if (hit) {
    for (int i = 0; i < 6; i++) {          // bisection refine
      float tm = 0.5*(tPrev + tt);
      if (mapH(ro + rd*tm, t) < 0.0) tt = tm; else tPrev = tm;
    }
    vec3 p = ro + rd*tt;
    col = shade(p.xz, t, -rd);
    float fog = 1.0 - exp(-tt*0.0006);
    col = mix(col, skyColor(rd, t)*0.9 + 0.1, fog);
  } else if (rd.y < -0.001) {
    // downward ray that outran the march: far water plane, fogged to horizon —
    // this seam was the "horked horizon" (sky band below the true horizon)
    float tFar = min(-ro.y/rd.y, 12000.0);
    vec3 p = ro + rd*tFar;
    col = shade(p.xz, t, -rd);
    float fog = 1.0 - exp(-tFar*0.0009);
    col = mix(col, skyColor(rd, t)*0.9 + 0.1, fog);
    tt = tFar;
  } else {
    return skyColor(rd, t);
  }

  // the surfer occludes water behind them
  float tS;
  if (u_surfer > 0.5 && hitSurfer(ro, rd, t, tt, tS)) {
    vec3 sp = ro + rd*tS;
    float rim = pow(1.0 - abs(dot(rd, vec3(0.0, 1.0, 0.0))), 2.0);
    col = vec3(0.06, 0.07, 0.08) + vec3(0.25, 0.28, 0.30)*rim*0.4;
    col += vec3(0.9, 0.85, 0.75)*pow(max(dot(reflect(-sunDir, vec3(0.0,1.0,0.0)), -rd), 0.0), 8.0)*0.12;
  }
  return col;
}

void main(){
  vec2 uv = (2.0*gl_FragCoord.xy - u_res) / u_res.y;
  vec3 col = (u_view < 0.5) ? droneView(uv, u_time) : cliffView(uv, u_time);
  // gentle grade + vignette
  col = pow(clamp(col, 0.0, 1.0), vec3(0.92));
  col *= 1.0 - 0.18*dot(uv*0.55, uv*0.55);
  fragColor = vec4(col, 1.0);
}
`;
