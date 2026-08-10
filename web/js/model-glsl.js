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
uniform float u_aframe;   // 0 point break, 1 Middle Peak (abs fold)
uniform float u_surfer;   // 0 off, 1 riding
uniform float u_geoMix;   // 1 = OSM/NCEI stage profile, 0 = synthetic fallback
uniform vec2 u_contourFit;// NCEI equal-elevation contour: x2*x^2 + x3*x^3
uniform vec2 u_stageBounds;// OSM canon-neighbor midpoints in local stage metres

// ---------- seabed (NCEI patch on the stage frame) ----------
uniform sampler2D u_bed;  // RGBA8: R high byte, G low byte of NAVD88 elevation
uniform float u_depthMix; // 1 = real seabed drives the model, 0 = synthetic
uniform vec4 u_bedRect;   // patch extent in stage metres: x0, z0, x1, z1
uniform vec2 u_bedSize;   // patch texel dimensions (nx, nz)
uniform vec2 u_bedElev;   // quantization window, m NAVD88: min, max
uniform float u_waterLevel; // MSL above NAVD88 + tide offset, m

// ---------- constants ----------
const float PI  = 3.14159265;
const float G   = 9.81;
const float LAM = 90.0;   // display wavelength, m (shoaled ~15 s swell at ~8 m depth)
const float VIS = 3.2;    // visual amplitude gain: physical heights are nearly
                          // invisible at landscape scale; exaggerate, don't lie about kinematics
const float GAMMA = 0.78; // depth-limited breaker index H/h (McCowan solitary-wave
                          // limit; Battjes/Nairn put field values ~0.7-0.9)

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
// For mapped Pleasure Point spots, curve comes from the NCEI equal-elevation
// contour through the OSM surf node. The synthetic quadratic remains the
// explicit fallback for West Side presets and the A-frame mechanism.
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

float breakLine(float x){
  float xx = mix(x, abs(x), u_aframe);
  float m  = tan(clamp(u_alpha, 0.06, 1.45));  // alpha->0 guarded: closeout, not NaN
  // sections: shallow patches meet the break criterion early (z_b pulled seaward)
  float sec = u_sections * 55.0 * (vnoise1(xx*0.02+7.3) - 0.5) * 2.0;
  return m*xx - coastCurve(x) + min(sec, 0.0)*step(0.05, u_sections);
}

// Authored finite-reef envelope. OSM spot partitions do not claim to measure
// physical reef edges, so geo profiles shape the break but do not replace it.
float reefWindow(float x){
  float xx = mix(x, abs(x), u_aframe);
  return smoothstep(-110.0, -35.0, xx) * (1.0 - smoothstep(215.0, 290.0, xx));
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
  return mix(mix(e00, e10, f.x), mix(e01, e11, f.x), f.y);
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
  float k = 2.0*PI/LAM;
  float w = 2.0*PI/u_T;
  float m = tan(clamp(u_alpha, 0.06, 1.45));
  float vx = (LAM/u_T)/m;                  // zipper ground speed along x

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
  float n  = floor((w*t - k*m*xApprox)/(2.0*PI) + 0.5);
  float xs = (w*t - 2.0*PI*n)/(k*m);

  // pumping: carve down (bottom turn) and back up the face, ~6 s cycle
  float pump    = sin(t*2.0*PI/6.0);
  float faceOff = 11.0 + 5.0*pump;         // metres seaward of the break line
  float xfold   = mix(xs, abs(xs), u_aframe);
  float zs      = m*xfold - coastCurve(xs) - faceOff;
  float vz      = (m - coastCurveSlope(xs))*vx
                - 5.0*(2.0*PI/6.0)*cos(t*2.0*PI/6.0);
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
  // rounding can push c01 a hair below 0 at troughs; pow(negative, fractional)
  // is NaN — showed up as vertex speckles on web-three's regular grid
  float c01 = max(0.5 + 0.5*cos(phase), 0.0);
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

  // ---- shoaling ----
  // Synthetic stand-in (kept for presets with no bathymetry behind them) and
  // the real thing: Green's law Ks = sqrt(cg0/cg), shallow-water cg = sqrt(gh).
  // Capped at 2.6 because breaking intervenes long before Ks runs away.
  float dep     = modelDepthM(xz);
  float growSyn = 1.0 + 0.85*exp(-max(d,0.0)/90.0)*reef;
  float cg0     = G*u_T/(4.0*PI);          // deep-water group speed, gT/4pi
  float Ks      = clamp(sqrt(cg0/sqrt(G*dep)), 0.7, 2.6);
  float Hsh     = u_H0 * Ks;               // shoaled height if it never broke
  float Hlim    = GAMMA * dep;             // most height this depth can carry
  // Depth-limited breaking: past the limit a wave is a bore whose height is
  // set by the water it is in, not by the swell that made it. Without this cap
  // Green's law keeps growing the wave across the whole inner shelf and the
  // stage reads as one undifferentiated foam field instead of a peeling wave.
  float growGeo = min(Hsh, Hlim) / max(u_H0, 0.05);
  float grow    = mix(growSyn, growGeo, u_depthMix);

  // ---- breaking ----
  // The zipper still owns the PEEL (that is this project's contribution), but
  // depth now owns PERMISSION: a wave cannot break in deep water, and must in
  // the shallows. gamma = H/h against McCowan's ~0.78 gates the zipper mask,
  // which is what finally carries whitewater all the way to the sand.
  float brkZip  = smoothstep(-6.0, 14.0, z - zb) * reef;
  // Break where the shoaled wave exceeds what the depth can carry. Comparing
  // Hsh against the limit (rather than H/d against gamma) is the same McCowan
  // criterion but survives the cap above, which pins H/d at gamma everywhere
  // shallow and would otherwise report "breaking" across the entire inside.
  // PHYSICAL heights only: VIS is a viewing exaggeration (see its
  // declaration), and letting it in here made the threshold ~3x too eager.
  float excess  = Hsh / max(Hlim, 0.05);
  float gate    = smoothstep(0.90, 1.25, excess);
  brk           = mix(brkZip, max(brkZip, gate*step(0.02, u_depthMix)), u_depthMix);
  float decay   = 1.0 - 0.68*brk;          // broken wave has dumped its energy

  // ---- the wave dies in the swash ----
  // Without this the inshore wave settles at 32% amplitude and runs to the
  // stage edge forever, which is exactly why the beach was invisible.
  float shoreFade = mix(1.0, smoothstep(0.0, 1.6, waterDepthM(xz)), u_depthMix);

  float theta  = w*t - k*(z + coastCurve(x));  // crest at theta=0 mod 2pi; bowed lines
  // ---- forward pitch ----
  // Real shoaling waves are asymmetric: steep front face, gentle back. Skewing
  // the phase by sin(theta) steepens the shoreward face, scaled by how close
  // this water is to breaking. Symmetric crests are most of what reads as
  // "moving bump" instead of "wave about to break".
  float skew   = mix(0.0, clamp(excess*0.62, 0.0, 0.8), u_depthMix);
  theta       -= skew*sin(theta);
  float env    = setEnv(z, t);
  float env2   = env*env;                  // lulls really disappear
  float q      = 1.6 + 3.2*exp(-abs(d)/55.0)*(0.6 + 0.5*u_xi);
  float amp    = 0.5*u_H0 * grow * decay * env * shoreFade;
  float h      = amp * crestShape(-theta, q) * 2.0;

  // the boil: fixed upwelling over a shallow rock beside the takeoff —
  // glassy dome, chop suppressed, waves kink slightly over it
  float m_ = tan(clamp(u_alpha, 0.06, 1.45));
  float boilX = -22.0;
  float boilZ = m_*mix(boilX, abs(boilX), u_aframe) - coastCurve(boilX) - 8.0;
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
    float pathZ = m2*mix(x, abs(x), u_aframe) - coastCurve(x) - 11.0;
    float wake = behind * exp(-pow(z - pathZ, 2.0)/(2.0*3.0*3.0));
    foam = clamp(foam + wake*0.75, 0.0, 1.0);
  }

  h *= VIS;
  if (!(h == h)) h = 0.0;  // NaN guard
  return h;
}

float oceanH(vec2 xz, float t){ float f,p,b,c; return ocean(xz, t, f, p, b, c); }
`;
