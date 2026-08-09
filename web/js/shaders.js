// GLSL sources for the zipper point-break model. See docs/MODEL.md and
// glsl/zipper.md — the break line z_b(x) IS the peel line: a stationary
// diagonal on the shelf; each advancing crest crosses it progressively in x,
// which produces the traveling breakpoint (the zipper) with no per-wave state.

export const VERT = `#version 300 es
layout(location=0) in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

export const FRAG = `#version 300 es
precision highp float;

uniform vec2  u_res;
uniform float u_time;     // simulation seconds (speed-scaled, pausable, JS-side)
uniform float u_T;        // swell period, s
uniform float u_H0;       // deep-water height, m
uniform float u_alpha;    // peel angle, radians (break-line slope m = tan(alpha))
uniform float u_xi;       // Iribarren: <0.5 spilling, 0.5-3.3 plunging (Battjes)
uniform float u_sections; // crest noise -> early-breaking patches
uniform float u_dF;       // group beat, Hz (set period = 1/dF)
uniform float u_tau;      // foam e-folding, s
uniform float u_chop;     // local wind-sea texture 0..1
uniform float u_aframe;   // 0 point break, 1 Middle Peak (abs fold)
uniform float u_view;     // 0 drone (ortho top-down), 1 cliff (raymarch)
uniform float u_surfer;   // 0 off, 1 riding

out vec4 fragColor;

// ---------- constants ----------
const float PI  = 3.14159265;
const float G   = 9.81;
const float LAM = 90.0;   // display wavelength, m (shoaled ~15 s swell at ~8 m depth)
const float VIS = 3.2;    // visual amplitude gain: physical heights are nearly
                          // invisible at landscape scale; exaggerate, don't lie about kinematics

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
// crests bow gently seaward at the edges — long lines following the coast
// contour around the point (ref: "long, sloping lines follow the contour")
float coastCurve(float x){
  float xx = mix(x, abs(x), u_aframe);
  return xx*xx/5000.0;
}

float breakLine(float x){
  float xx = mix(x, abs(x), u_aframe);
  float m  = tan(clamp(u_alpha, 0.06, 1.45));  // alpha->0 guarded: closeout, not NaN
  // sections: shallow patches meet the break criterion early (z_b pulled seaward)
  float sec = u_sections * 55.0 * (vnoise1(xx*0.02+7.3) - 0.5) * 2.0;
  return m*xx - coastCurve(x) + min(sec, 0.0)*step(0.05, u_sections);
}

// the reef is finite: breaking ramps in at the takeoff and the lines
// "lose steam in deeper water" past the end of the shelf
float reefWindow(float x){
  float xx = mix(x, abs(x), u_aframe);
  return smoothstep(-110.0, -35.0, xx) * (1.0 - smoothstep(215.0, 290.0, xx));
}

// ---------- the surfer ----------
// The zipper position is closed-form (theta = 2*pi*n at z = z_b), so the surfer
// needs no state: ride the face just seaward of the break line, pumping between
// bottom turn (far from the line) and top turn (near it). Returns (x, z, vx, vz).
vec4 surferState(float t){
  float k = 2.0*PI/LAM;
  float w = 2.0*PI/u_T;
  float m = tan(clamp(u_alpha, 0.06, 1.45));
  float vx = (LAM/u_T)/m;                  // zipper ground speed along x

  // ride window runs TOWARD the cliff camera (distant takeoff -> hero frame),
  // and in A-frame mode starts at the apex either way
  float x0 = -18.0;   // takeoff right beside the boil
  float span = 225.0;
  float rideT = span/max(vx, 0.5);
  float ph = mod(t, rideT);
  float xApprox = x0 + vx*ph;

  // snap to the nearest real zipper so the surfer sits on an actual crest
  float n  = floor((w*t - k*m*xApprox)/(2.0*PI) + 0.5);
  float xs = (w*t - 2.0*PI*n)/(k*m);

  // pumping: carve down (bottom turn) and back up the face, ~6 s cycle
  float pump    = sin(t*2.0*PI/6.0);
  float faceOff = 11.0 + 5.0*pump;         // metres seaward of the break line
  float zs      = m*xs - xs*xs/5000.0 - faceOff;   // track the bowed break line
  float vz      = m*vx - 5.0*(2.0*PI/6.0)*cos(t*2.0*PI/6.0);
  return vec4(xs, zs, vx, vz);
}

// Carrier crest with group envelope. Groups travel at cg = c/2 (deep-water).
float setEnv(float z, float t){
  float c  = LAM/u_T;
  float cg = 0.5*c;
  return 0.5 + 0.5*cos(2.0*PI*u_dF*(t - z/cg));
}

// Sharpened crest profile: q=1 sinusoid-ish, q>2 peaked (Gerstner cusp stand-in)
float crestShape(float phase, float q){
  float c01 = 0.5 + 0.5*cos(phase);
  return pow(c01, q) - 0.5/q;   // rough mean removal, visual only
}

// Height field + break bookkeeping packed together.
// Returns h; outs: foam, pocket, brk (surf-zone mask), crest (unbroken crest lines)
float ocean(vec2 xz, float t, out float foam, out float pocket, out float brk, out float crest){
  float x = xz.x, z = xz.y;
  float k = 2.0*PI/LAM;
  float w = 2.0*PI/u_T;
  float zb = breakLine(x);
  float d  = zb - z;                       // >0 seaward of break line
  float reef = reefWindow(x);              // 0 off the shelf: mellow takeoff, fade-out

  // shoaling: grow + sharpen approaching the line (Green's-law stand-in)
  float grow  = 1.0 + 0.85*exp(-max(d,0.0)/90.0)*reef;
  brk         = smoothstep(-6.0, 14.0, z - zb) * reef;
  float decay = 1.0 - 0.68*brk;            // broken wave has dumped its energy

  float theta  = w*t - k*(z + coastCurve(x));  // crest at theta=0 mod 2pi; bowed lines
  float env    = setEnv(z, t);
  float env2   = env*env;                  // lulls really disappear
  float q      = 1.6 + 3.2*exp(-abs(d)/55.0)*(0.6 + 0.5*u_xi);
  float amp    = 0.5*u_H0 * grow * decay * env;
  float h      = amp * crestShape(-theta, q) * 2.0;

  // the boil: fixed upwelling over a shallow rock beside the takeoff —
  // glassy dome, chop suppressed, waves kink slightly over it
  float m_ = tan(clamp(u_alpha, 0.06, 1.45));
  vec2 boilPos = vec2(-22.0, m_*22.0*u_aframe + m_*(-22.0)*(1.0-u_aframe) - 8.0);
  float boil = exp(-dot(xz - boilPos, xz - boilPos)/(2.0*5.5*5.5));
  h += 0.10*u_H0*boil*(0.8 + 0.2*sin(t*0.7));

  // wind chop: broadband local texture, killable; the boil slicks it flat
  float chopG = u_chop * (1.0 - 0.9*boil);
  h += chopG * 0.22 * (vnoise2(xz*0.11 + vec2(0.0, t*0.6)) - 0.5)
     + chopG * 0.10 * (vnoise2(xz*0.31 - vec2(t*0.9, 0.0)) - 0.5);

  // time since last crest passed this point
  float tSince = mod(theta, 2.0*PI)/w;
  float tau = max(u_tau, 0.5);

  // pocket: crest currently crossing the break line — the zipper's locus
  float crestNear = smoothstep(0.55, 0.98, cos(theta));
  pocket = crestNear * exp(-(d*d)/(2.0*22.0*22.0)) * env2 * reef;
  // unbroken crest lines (approaching swell stays legible from above)
  crest = crestNear * (1.0 - brk) * env2;

  // the broken front is a rolling foamy mound, not a flat sheet — give it height
  float boreBand = brk * env2 * exp(-abs(z - zb)/9.0);
  h += 0.30*u_H0 * boreBand * (0.75 + 0.25*vnoise2(vec2(x*0.2, t*0.8)));

  // fresh whitewater, broken into shore-normal streaks (never a solid sheet)
  float streaks = 0.45 + 0.55*vnoise2(vec2(x*0.16, z*0.028) + vec2(1.7, t*0.015));
  foam = brk * env2 * exp(-tSince/tau) * streaks;
  foam += boreBand * 0.85 * exp(-tSince/(0.5*u_T));

  // foam lace: dimmer, longer-lived residue; two octaves so cells don't read blocky
  float laceN = vnoise2(vec2(x*0.22, z*0.045) + vec2(0.0, t*0.02))*0.62
              + vnoise2(vec2(x*0.74, z*0.15) - vec2(t*0.01, 0.0))*0.38;
  float lace = brk * env2 * exp(-tSince/(2.4*tau)) * smoothstep(0.45, 0.72, laceN);
  foam += lace * 0.4;

  // pocket spray: whitewater thrown at the zipper itself, heavier when plunging
  foam += pocket * (0.45 + 0.75*smoothstep(0.3, 1.4, u_xi));

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
    float m2 = tan(clamp(u_alpha, 0.06, 1.45));
    float pathZ = m2*mix(x, abs(x), u_aframe) - 11.0;
    float wake = behind * exp(-pow(z - pathZ, 2.0)/(2.0*3.0*3.0));
    foam = clamp(foam + wake*0.75, 0.0, 1.0);
  }

  h *= VIS;
  if (!(h == h)) h = 0.0;  // NaN guard
  return h;
}

float oceanH(vec2 xz, float t){ float f,p,b,c; return ocean(xz, t, f, p, b, c); }

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
  float h = ocean(xz, t, foam, pocket, brk, crest);
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
  vec3 ro = vec3(xCam, 16.0, breakLine(xCam) - 45.0);  // cliff height: shoot OVER foreground crests
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
