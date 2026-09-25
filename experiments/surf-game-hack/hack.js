// surf-game-hack — the one-shot counterfactual.
//
// What a surfing GAME does when nobody asks it to be a wave model: a crest
// spline, a swept tube whose cross-section is lerped between hand-drawn
// keyframes by a "break phase" that slides along the spline at a constant
// speed, foam painted on with scrolling noise, a particle burst where the lip
// is declared to land, and a camera that chases the peel with a little lag.
// Nothing here knows about depth, period, shoaling, refraction, or a reef.
//
// Every shortcut is marked `SHORTCUT:` in place, with what it fakes and what
// a physical model would have to supply instead. Standalone: imports only the
// vendored three.js; touches nothing in web-three/ or shared/.
//
// URL hash: #cam=pocket|cliff  &t=<sim seconds, pins the clock>  &speed=<x>
//           &hud=0             &w=<width>&h=<height> (viewport hint only)
// Keys:     c toggles camera, space pauses.

import * as THREE from '../../web-three/vendor/three.module.js';

// ---------------------------------------------------------------- params ---
const P = {
  // SHORTCUT: wave height is a number I typed. The model derives H from the
  // offshore height, Green's-law shoaling, and the depth-limited cap γh over a
  // surveyed bed; here the second wave of the set is "the big one" by fiat.
  H0: 2.3,                        // m, trough-to-crest of a set wave scale 1
  setScale: [1.0, 1.35, 1.12],    // three waves per set
  // SHORTCUT: peel speed is a constant. The model has Vp = c / sin(α) with α
  // set by how the break line is angled against the swell, c from depth.
  Vp: 8.5,                        // m/s along the crest spline
  // SHORTCUT: the time from feather to whitewater at a station is a constant.
  // Physically it depends on the Iribarren number (spilling vs plunging) and
  // the local depth gradient; the lip's fall is ~ sqrt(2H/g) which nobody here
  // computes.
  Tbreak: 4.6,                    // s from phase 0 to 1 at one station
  Trise: 4.5,                     // s the swell takes to arrive and stand up
  period: 13.5,                   // s between waves in a set
  lull: 14.0,                     // s after the third wave
  c: 7.5,                         // m/s apparent approach speed of the swell
  // SHORTCUT: the whole wave's character is decided by which keyframe set is
  // used. There is no ξ, no α; "does it barrel" is answered by the artist.
};
const CYCLE = P.setScale.length * P.period + P.lull;

// --------------------------------------------------------------- profile ---
// Cross-section keyframes in (n, y) with n = shoreward offset in units of H,
// y = height above trough in units of H. 17 points, fixed roles:
//  0 back trough  1 back low  2 back mid  3 back high  4 crest
//  5 lip outer top  6 lip outer front  7 lip tip  8 lip inner  9 lip root
// 10 face top  11 face upper  12 face mid  13 face low  14 foot
// 15 front trough  16 front far
// The lip (5..9) is a fold: the polyline goes out over the lip and back under
// it, so the curtain has two sides and a thickness. In the swell keyframe the
// fold is collapsed onto the face.
//
// SHORTCUT: the overturning shape is drawn, not computed. A model would have
// to supply the crest steepness, when the front face passes vertical, the lip
// ejection velocity, and the trajectory of the falling sheet.
const KEYS = [
  { at: 0.00, pts: [ // K0 unbroken swell, round
    [-3.0,-0.5],[-2.0,0.18],[-1.2,0.55],[-0.55,0.88],[0,1.0],
    [0.12,0.985],[0.22,0.955],[0.30,0.915],[0.24,0.90],[0.13,0.94],
    [0.35,0.88],[0.52,0.70],[0.68,0.48],[0.86,0.27],[1.08,0.10],[1.6,-0.22],[2.8,-0.5] ] },
  { at: 0.14, pts: [ // K1 feathering: crest sharp, face concave, lip leaning
    [-3.0,-0.5],[-2.0,0.16],[-1.2,0.50],[-0.50,0.86],[0,1.02],
    [0.14,1.03],[0.28,1.00],[0.38,0.93],[0.32,0.88],[0.18,0.90],
    [0.22,0.82],[0.28,0.62],[0.36,0.42],[0.50,0.24],[0.75,0.08],[1.4,-0.22],[2.8,-0.5] ] },
  { at: 0.30, pts: [ // K2 pitching: lip thrown out and hooking down
    [-3.0,-0.5],[-2.0,0.16],[-1.2,0.50],[-0.50,0.86],[0,1.05],
    [0.30,1.12],[0.72,1.10],[1.00,0.90],[0.88,0.86],[0.50,0.95],
    [0.18,0.82],[0.10,0.60],[0.14,0.40],[0.30,0.22],[0.62,0.07],[1.4,-0.22],[2.8,-0.5] ] },
  { at: 0.48, pts: [ // K3 open tube: curtain reaches the trough
    [-3.0,-0.5],[-2.0,0.15],[-1.2,0.48],[-0.50,0.84],[0,1.05],
    [0.36,1.15],[1.00,1.00],[1.30,0.15],[1.18,0.60],[0.70,1.02],
    [0.16,0.86],[0.02,0.62],[0.05,0.40],[0.24,0.20],[0.60,0.05],[1.6,-0.22],[2.8,-0.5] ] },
  { at: 0.66, pts: [ // K4 impact / collapse: tube compressing, curtain landed
    [-3.0,-0.5],[-2.0,0.12],[-1.2,0.40],[-0.50,0.70],[0,0.85],
    [0.40,0.90],[0.95,0.72],[1.35,0.14],[1.10,0.45],[0.60,0.74],
    [0.30,0.65],[0.25,0.50],[0.35,0.35],[0.50,0.20],[0.75,0.08],[1.6,-0.22],[2.8,-0.5] ] },
  { at: 0.86, pts: [ // K5 whitewater bore, pushed shoreward
    [-3.0,-0.5],[-2.0,0.06],[-1.2,0.20],[-0.40,0.36],[0.20,0.45],
    [0.50,0.50],[0.85,0.48],[1.15,0.40],[1.05,0.36],[0.75,0.40],
    [0.85,0.38],[1.10,0.32],[1.35,0.24],[1.60,0.14],[1.90,0.05],[2.4,-0.22],[3.2,-0.5] ] },
];
const NPC = KEYS[0].pts.length;   // control points per keyframe
// The 17 control points are lerped, then resampled through a Catmull-Rom to
// NP smooth samples so the sheet's normals do not band at every control point.
const NP = 48;
// Per-profile-point weights the shader uses to place foam. Lip = the fold;
// crest = where feathering starts; front = whitewater side.
const LIP_W   = [0,0,0,0,0.15, 0.2,0.45,1,1,0.9, 0.3,0,0,0,0,0,0];
const CREST_W = [0,0,0,0.1,0.8, 0.7,0.4,0.5,0.5,0.4, 0.2,0,0,0,0,0,0];
const FRONT_W = [0,0,0,0.1,0.4, 0.7,0.9,1,1,0.9, 0.9,0.9,0.9,1,1,0.6,0];

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// sample a per-control-point weight table at resampled index i
function weightAt(table, i) {
  const u = (i / (NP - 1)) * (NPC - 1), k = Math.min(NPC - 2, Math.floor(u)), t = u - k;
  return table[k] + (table[k + 1] - table[k]) * t;
}
const ctrl = new Float32Array(NPC * 2);
// Fill out[] (NP × 2) with the (n, y) profile at break phase phi (0..1).
function profileAt(phi, out) {
  phi = Math.min(1, Math.max(0, phi));
  let k = 0;
  while (k < KEYS.length - 2 && phi > KEYS[k + 1].at) k++;
  const A = KEYS[k], B = KEYS[k + 1];
  const t = smooth(A.at, B.at, phi);
  for (let i = 0; i < NPC; i++) {
    ctrl[i * 2]     = A.pts[i][0] + (B.pts[i][0] - A.pts[i][0]) * t;
    ctrl[i * 2 + 1] = A.pts[i][1] + (B.pts[i][1] - A.pts[i][1]) * t;
  }
  // uniform Catmull-Rom through the control polyline
  for (let i = 0; i < NP; i++) {
    const u = (i / (NP - 1)) * (NPC - 1), k0 = Math.min(NPC - 2, Math.floor(u)), f = u - k0;
    const im = Math.max(0, k0 - 1), i0 = k0, i1 = k0 + 1, i2 = Math.min(NPC - 1, k0 + 2);
    const f2 = f * f, f3 = f2 * f;
    for (let c = 0; c < 2; c++) {
      const p0 = ctrl[im * 2 + c], p1 = ctrl[i0 * 2 + c], p2 = ctrl[i1 * 2 + c], p3 = ctrl[i2 * 2 + c];
      out[i * 2 + c] = 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
    }
  }
}

// ---------------------------------------------------------------- spline ---
// SHORTCUT: the break line is five points I placed by hand to look like a
// right-hand point curving into a cove. The model gets it as the emergent
// H0·Ks ≥ γh locus over measured bathymetry and an OSM contour fit.
// Frame: y up, shore at -z (ocean at +z). A right-hander peels toward +x for
// a surfer facing shore. n (shoreward) is therefore roughly -z.
const CTRL = [
  new THREE.Vector3(-70, 0, 14), new THREE.Vector3(-30, 0, 7), new THREE.Vector3(8, 0, 0),
  new THREE.Vector3(45, 0, -9), new THREE.Vector3(78, 0, -24),
];
const spline = new THREE.CatmullRomCurve3(CTRL, false, 'centripetal', 0.5);
const NS = 180;                                   // stations along the crest
const stationPts = spline.getSpacedPoints(NS - 1); // NS points, equal arc steps
const L = spline.getLength();
const stationT = [], stationN = [];                // tangent (peel dir), shoreward normal
for (let i = 0; i < NS; i++) {
  const a = stationPts[Math.max(0, i - 1)], b = stationPts[Math.min(NS - 1, i + 1)];
  const T = b.clone().sub(a).setY(0).normalize();
  stationT.push(T);
  stationN.push(new THREE.Vector3(T.z, 0, -T.x)); // rotate tangent -90° about y → points -z-ish
}

// ------------------------------------------------------------------ noise ---
const GLSL_NOISE = /* glsl */`
  float hash21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    float a = hash21(i), b = hash21(i+vec2(1,0)), c = hash21(i+vec2(0,1)), d = hash21(i+vec2(1,1));
    return mix(mix(a,b,f.x), mix(c,d,f.x), f.y);
  }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for(int k=0;k<4;k++){ v += a*vnoise(p); p = p*2.03 + 17.1; a *= 0.5; } return v; }
`;
// SHORTCUT: fog and sky are a two-colour gradient and an exp fog; the model
// renderer does the same, so this is not where the physics buys anything.
const GLSL_FOG = /* glsl */`
  uniform vec3 uFogColor; uniform float uFogDensity;
  vec3 applyFog(vec3 c, float dist){ float f = 1.0 - exp(-dist*uFogDensity); return mix(c, uFogColor, clamp(f,0.0,1.0)); }
`;
const GLSL_SUN = /* glsl */`
  uniform vec3 uSunDir; uniform vec3 uSkyZenith; uniform vec3 uSkyHorizon;
  vec3 skyAt(vec3 d){ float h = clamp(d.y, 0.0, 1.0); return mix(uSkyHorizon, uSkyZenith, pow(h, 0.55)); }
  float specBlinn(vec3 N, vec3 V, float shin){ vec3 H = normalize(uSunDir + V); return pow(max(dot(N,H),0.0), shin); }
`;

// ----------------------------------------------------------------- scene ---
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 1500);

// SHORTCUT: the sun is placed where it makes the face sparkle for the pocket
// camera (down the line, lowish). No time of day, no site azimuth.
const SUN = new THREE.Vector3(-0.62, 0.42, 0.40).normalize();
const SKY_ZENITH = new THREE.Color(0.50, 0.58, 0.68);
const SKY_HORIZON = new THREE.Color(0.80, 0.83, 0.85);
const FOG_COLOR = new THREE.Color(0.76, 0.80, 0.83);
const common = {
  uTime: { value: 0 }, uSunDir: { value: SUN },
  uSkyZenith: { value: SKY_ZENITH }, uSkyHorizon: { value: SKY_HORIZON },
  uFogColor: { value: FOG_COLOR }, uFogDensity: { value: 0.0038 },
};

// Sky dome
scene.add(new THREE.Mesh(new THREE.SphereGeometry(1200, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: common,
  vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: GLSL_SUN + `varying vec3 vDir; void main(){
    vec3 c = skyAt(vDir);
    float s = max(dot(vDir, uSunDir), 0.0);
    c += vec3(1.0, 0.97, 0.9) * (pow(s, 600.0)*0.9 + pow(s, 12.0)*0.12); // disc + haze glow
    gl_FragColor = vec4(c, 1.0); }`,
})));

// Ocean: a big plane with two sines and a noise ripple in the vertex shader.
// SHORTCUT: the ocean is decoration. No dispersion, no shoaling; the ripple
// never interacts with the wave mesh sitting on top of it.
const oceanUniforms = { ...common };
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 220, 220), new THREE.ShaderMaterial({
  uniforms: oceanUniforms,
  vertexShader: GLSL_NOISE + `uniform float uTime; varying vec3 vW; varying vec3 vN;
    void main(){
      vec3 p = position; // plane is rotated so local (x,y)->(x,-z) in world
      vec2 w = vec2(p.x, -p.y);
      float h = 0.10*sin(w.x*0.09 + w.y*0.05 + uTime*0.9) + 0.07*sin(w.y*0.21 - uTime*1.3)
              + 0.06*(fbm(w*0.35 + uTime*0.12)-0.5);
      p.z = h;
      // finite-difference normal in world (cheap; good enough for spec)
      float e = 0.6;
      float hx = 0.10*0.09*cos(w.x*0.09 + w.y*0.05 + uTime*0.9);
      float hy = 0.10*0.05*cos(w.x*0.09 + w.y*0.05 + uTime*0.9) + 0.07*0.21*cos(w.y*0.21 - uTime*1.3);
      // plane local (x, y) is world (x, -z): world normal = (-dh/dx, 1, +dh/dz) with dh/dz = -hy
      vN = normalize(vec3(-hx, 1.0, -hy));
      vec4 wp = modelMatrix*vec4(p,1.0); vW = wp.xyz;
      gl_Position = projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: GLSL_NOISE + GLSL_FOG + GLSL_SUN + `uniform float uTime; varying vec3 vW; varying vec3 vN;
    void main(){
      vec3 N = normalize(vN + 0.08*vec3(fbm(vW.xz*0.8+uTime*0.3)-0.5, 0.0, fbm(vW.zx*0.8-uTime*0.25)-0.5));
      vec3 V = normalize(cameraPosition - vW);
      float fres = pow(1.0 - max(dot(N,V),0.0), 3.0);
      vec3 deep = vec3(0.05, 0.14, 0.15);
      vec3 col = mix(deep, skyAt(reflect(-V,N))*0.9, 0.08 + 0.8*fres);
      col += vec3(1.0,0.98,0.94) * specBlinn(N,V,180.0) * 0.9;
      gl_FragColor = vec4(applyFog(col, length(cameraPosition - vW)), 1.0); }`,
}));
ocean.rotation.x = -Math.PI / 2;
ocean.position.y = -0.05;
scene.add(ocean);

// Shore: a beach ramp and a cliff. Heights typed in; the model reads the same
// terrain the water sits on. SHORTCUT: scenery.
{
  const g = new THREE.PlaneGeometry(700, 160, 140, 40);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), yLocal = pos.getY(i);
    // rotation.x = -π/2 sends local +y to world -z; with position.z = -128 the
    // plane spans z ∈ [-208, -48]: yLocal = -80 is the waterline (z = -48).
    const zWorld = -128 - yLocal;
    const inland = -zWorld - 48;                  // 0 at waterline, + inland
    let h = -0.4 + inland * 0.05;                 // beach ramp
    h += smooth(14, 26, inland) * (7 + 1.5 * Math.sin(x * 0.07)); // cliff step
    pos.setZ(i, h);
  }
  g.computeVertexNormals();
  const shore = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color: 0x6f6a58, fog: false }));
  shore.rotation.x = -Math.PI / 2;
  shore.position.z = -128; // plane centre so its far edge sits at z=-208, near edge at -48
  scene.add(shore);
  const hemi = new THREE.HemisphereLight(0xb8c4cc, 0x3a3a30, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff2e0, 1.4); sun.position.copy(SUN).multiplyScalar(100); scene.add(sun);
}

// ---------------------------------------------------------- wave meshes ---
// One swept sheet per live wave. Positions are rebuilt on the CPU each frame
// (180 stations × 17 profile points = 3060 verts): cheap, and it keeps the
// morph logic in one place.
const waveMat = new THREE.ShaderMaterial({
  side: THREE.DoubleSide, uniforms: { ...common },
  vertexShader: `attribute float aPhase; attribute float aLip; attribute float aCrest; attribute float aFront; attribute float aHn;
    varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vPhase; varying float vLip; varying float vCrest; varying float vFront; varying float vHn;
    void main(){ vUv = uv; vPhase = aPhase; vLip = aLip; vCrest = aCrest; vFront = aFront; vHn = aHn;
      vN = normalize(normalMatrix*normal); vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz;
      vN = normalize((modelMatrix*vec4(normal,0.0)).xyz);
      gl_Position = projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: GLSL_NOISE + GLSL_FOG + GLSL_SUN + `uniform float uTime;
    varying vec3 vW; varying vec3 vN; varying vec2 vUv; varying float vPhase; varying float vLip; varying float vCrest; varying float vFront; varying float vHn;
    void main(){
      vec3 V = normalize(cameraPosition - vW);
      vec3 N = normalize(vN); if (dot(N, V) < 0.0) N = -N;   // double-sided sheet
      // Face colour: dark bottle green in the trough, thinner/brighter water up
      // the face where light transmits through the lip (a look, not a transport
      // computation — SHORTCUT: no refraction, no subsurface).
      vec3 deep = vec3(0.05, 0.14, 0.15);              // same as the ocean plane
      vec3 thin = vec3(0.14, 0.52, 0.46);
      float up = clamp(vHn, 0.0, 1.0);
      // the flat trough must look exactly like the ocean plane it sits in, so
      // low on the profile the normal gets the ocean's noise bump and the
      // colour is the ocean's mix; the green only comes in up the face.
      float low = 1.0 - smoothstep(0.05, 0.35, up);
      N = normalize(N + low*0.08*vec3(fbm(vW.xz*0.8+uTime*0.3)-0.5, 0.0, fbm(vW.zx*0.8-uTime*0.25)-0.5));
      // backlight: the thin green lives where the lip is between the sun and
      // the eye (a look, not transport)
      float back = max(dot(-V, uSunDir), 0.0);
      vec3 col = mix(deep*0.8, thin, pow(up, 2.2) * (0.35 + 0.9*vLip) * (0.55 + 0.6*back));
      // draw-up ribs on the face: noise stretched up the profile, scrolling
      // along the crest so the surface reads as moving.
      float ribs = fbm(vec2(vW.x*0.9 + vW.z*0.4 - uTime*1.5, vUv.y*14.0));
      col *= 1.0 - (1.0-low)*(0.15 - 0.3*ribs);
      // sky reflection with fresnel, then sun spec
      float fres = pow(1.0 - max(dot(N,V),0.0), 2.6);
      col = mix(col, skyAt(reflect(-V,N))*0.92, mix(0.10 + 0.7*fres, 0.08 + 0.8*fres, low));
      col += vec3(1.0,0.98,0.94) * (specBlinn(N,V,90.0)*0.14 + specBlinn(N,V,500.0)*1.1);
      // SHORTCUT: foam is painted. Feather at the crest as phase starts, the
      // lip goes white as it pitches, everything on the front goes white after
      // impact. A model has aeration from the plunge geometry and a decay time.
      vec2 fu = vec2(vUv.x*L_SCALE - uTime*0.9, vUv.y*6.0);
      float n1 = fbm(fu*1.7 + vec2(0.0, uTime*0.6));
      float n2 = fbm(fu*4.5 - vec2(uTime*1.7, 0.0));
      float n3 = vnoise(vec2(vUv.x*L_SCALE*5.0 - uTime*3.0, vUv.y*38.0));   // streaks down the curtain
      float feather = vCrest * smoothstep(0.03, 0.16, vPhase) * (1.0 - smoothstep(0.55, 0.8, vPhase));
      float lipW    = vLip   * smoothstep(0.16, 0.40, vPhase) * 0.9;
      float white   = vFront * smoothstep(0.52, 0.78, vPhase) + smoothstep(0.80, 0.95, vPhase) * (0.55 + 0.45*n1);
      float mask = feather*0.9 + lipW*1.1 + white*1.3;
      float foam = smoothstep(0.55 - 0.5*mask, 0.85 - 0.5*mask, n1*0.5 + n2*0.35 + n3*0.25);
      foam = clamp(foam * min(mask*1.6, 1.0), 0.0, 1.0);
      float wrapL = dot(N, uSunDir)*0.5 + 0.5;
      vec3 foamCol = vec3(0.95, 0.97, 0.98) * (0.72 + 0.28*wrapL) * (0.8 + 0.2*n2)
                   + vec3(0.9,0.95,1.0) * pow(back, 8.0) * 0.25;   // sun through the curtain
      col = mix(col, foamCol, foam);
      #ifdef DBG_PHASE
        col = mix(vec3(1.0,0.2,0.1), vec3(0.1,0.3,1.0), vPhase) * (0.5 + 0.5*max(dot(N, uSunDir), 0.0));
      #endif
      gl_FragColor = vec4(applyFog(col, length(cameraPosition - vW)), 1.0); }`,
  defines: { L_SCALE: (L / 6).toFixed(1), ...(location.hash.includes('dbg=phase') ? { DBG_PHASE: 1 } : {}) },
});

class WaveSheet {
  constructor() {
    const g = new THREE.BufferGeometry();
    const n = NS * NP;
    this.pos = new Float32Array(n * 3);
    this.phase = new Float32Array(n);
    this.hn = new Float32Array(n);
    const uv = new Float32Array(n * 2), lip = new Float32Array(n), crest = new Float32Array(n), front = new Float32Array(n);
    const idx = [];
    for (let s = 0; s < NS; s++) for (let p = 0; p < NP; p++) {
      const v = s * NP + p;
      uv[v * 2] = s / (NS - 1); uv[v * 2 + 1] = p / (NP - 1);
      lip[v] = weightAt(LIP_W, p); crest[v] = weightAt(CREST_W, p); front[v] = weightAt(FRONT_W, p);
      if (s < NS - 1 && p < NP - 1) idx.push(v, v + NP, v + 1, v + 1, v + NP, v + NP + 1);
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('aPhase', new THREE.BufferAttribute(this.phase, 1));
    g.setAttribute('aHn', new THREE.BufferAttribute(this.hn, 1));
    g.setAttribute('aLip', new THREE.BufferAttribute(lip, 1));
    g.setAttribute('aCrest', new THREE.BufferAttribute(crest, 1));
    g.setAttribute('aFront', new THREE.BufferAttribute(front, 1));
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, waveMat);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.prof = new Float32Array(NP * 2);
    this.stationPhase = new Float32Array(NS);
    this.stationH = new Float32Array(NS);
    this.stationOff = new Float32Array(NS);   // seaward offset (approach)
    this.active = false;
  }
  // tau: seconds since this wave's birth. scale: set-wave height multiplier.
  update(tau, scale) {
    const life = P.Trise + L / P.Vp + P.Tbreak + 7.0;
    if (tau < 0 || tau > life) { this.active = false; this.mesh.visible = false; return; }
    this.active = true; this.mesh.visible = true;
    const H = P.H0 * scale;
    // SHORTCUT: the swell "arrives" by translating a stationary crest line
    // seaward-to-shoreward over Trise and scaling it up. Real shoaling is a
    // wavelength shortening and a height growth from depth; here it is an
    // envelope. The crest line itself never moves after arrival, which is the
    // single biggest lie in this file: a real wave keeps travelling shoreward
    // while it breaks, and the break line is where the moving wave meets depth.
    const arrive = smooth(0, P.Trise, tau);
    const env = 0.25 + 0.75 * arrive;
    const seaward = (1 - arrive) * P.c * P.Trise * 0.75;
    const fade = 1 - smooth(life - 2.0, life, tau);
    const sPeel = P.Vp * (tau - P.Trise);          // peel point along the spline
    for (let s = 0; s < NS; s++) {
      const arc = (s / (NS - 1)) * L;
      // SHORTCUT: break phase is (time since the peel passed) / Tbreak. The
      // model's phase is set by depth under the moving crest and by ξ.
      const since = (sPeel - arc) / P.Vp;          // s since the peel passed here
      const phi = Math.min(1, Math.max(0, since / P.Tbreak));
      this.stationPhase[s] = phi;
      // Taper: builds over the first 15 m from the apex, shrinks down the point
      // (SHORTCUT: the shoulder is a linear taper, not a refraction pattern).
      // A slow sinusoid along the crest so the top is not a ruler line.
      const lump = 1 + 0.06 * Math.sin(arc * 0.13 + tau * 0.7) + 0.04 * Math.sin(arc * 0.31 - tau * 0.4);
      const taper = smooth(0, 34, arc) * (1 - 0.32 * arc / L) * (1 - 0.25 * smooth(L - 25, L, arc)) * lump;
      // SHORTCUT: after impact the bore slides shoreward at 0.45c and sinks
      // into the flat ocean over 8 s. A model would have the broken wave keep
      // its own celerity and dissipate by a bore energy-flux law; here it
      // simply stops existing before it reaches the beach.
      const afterImpact = Math.max(0, since - 0.66 * P.Tbreak);
      const decay = 1 - smooth(1.5, 8.0, afterImpact);
      const whitewaterSag = (1 - 0.15 * smooth(0.7, 1.0, phi)) * decay;
      this.stationH[s] = H * env * taper * fade * whitewaterSag;
      this.stationOff[s] = seaward - 0.45 * P.c * afterImpact;  // negative = shoreward
    }
    const pos = this.pos, ph = this.phase, hn = this.hn, prof = this.prof;
    for (let s = 0; s < NS; s++) {
      profileAt(this.stationPhase[s], prof);
      const Hs = this.stationH[s], base = stationPts[s], N = stationN[s];
      const ox = base.x - N.x * this.stationOff[s], oz = base.z - N.z * this.stationOff[s];
      for (let p = 0; p < NP; p++) {
        const v = (s * NP + p);
        const n = prof[p * 2] * Hs, y = prof[p * 2 + 1] * Hs;
        pos[v * 3] = ox + N.x * n; pos[v * 3 + 1] = y; pos[v * 3 + 2] = oz + N.z * n;
        ph[v] = this.stationPhase[s];
        hn[v] = Hs > 0.01 ? y / Hs : 0;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aPhase.needsUpdate = true;
    this.geo.attributes.aHn.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.sPeel = sPeel; this.H = H * env;
  }
  // World point of CONTROL-point index pc (0..16) at arc position `arc` (m).
  pointAt(arc, pc, out) {
    const p = Math.round((pc / (NPC - 1)) * (NP - 1));
    const f = Math.min(NS - 1.001, Math.max(0, (arc / L) * (NS - 1)));
    const s = Math.floor(f), t = f - s;
    const a = (s * NP + p) * 3, b = ((s + 1) * NP + p) * 3;
    out.set(this.pos[a] + (this.pos[b] - this.pos[a]) * t, this.pos[a + 1] + (this.pos[b + 1] - this.pos[a + 1]) * t, this.pos[a + 2] + (this.pos[b + 2] - this.pos[a + 2]) * t);
    return out;
  }
  phaseAt(arc) { const f = Math.min(NS - 1, Math.max(0, Math.round((arc / L) * (NS - 1)))); return this.stationPhase[f]; }
}
const sheets = [new WaveSheet(), new WaveSheet(), new WaveSheet()];

// ------------------------------------------------------------- particles ---
// SHORTCUT: spray and the impact plume are point sprites with a typed
// lifetime, typed launch speed, and g. The model would clock the plume from
// the lip's fall time and the impact energy; here the burst lives 1.8 s
// because that looked right.
const NPART = 7000;
const part = {
  pos: new Float32Array(NPART * 3), vel: new Float32Array(NPART * 3),
  age: new Float32Array(NPART), life: new Float32Array(NPART), size: new Float32Array(NPART),
  next: 0,
};
part.age.fill(1e9); part.life.fill(1);
const partGeo = new THREE.BufferGeometry();
partGeo.setAttribute('position', new THREE.BufferAttribute(part.pos, 3));
partGeo.setAttribute('aAge', new THREE.BufferAttribute(part.age, 1));
partGeo.setAttribute('aLife', new THREE.BufferAttribute(part.life, 1));
partGeo.setAttribute('aSize', new THREE.BufferAttribute(part.size, 1));
const partMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: { ...common },
  vertexShader: `attribute float aAge; attribute float aLife; attribute float aSize; varying float vA; varying float vD;
    void main(){ float u = aAge/aLife; vA = (u > 1.0) ? 0.0 : (1.0-u)*(1.0-u) * smoothstep(0.0, 0.08, u);
      vec4 mv = modelViewMatrix*vec4(position,1.0); vD = -mv.z;
      gl_PointSize = aSize * (1.0 + 1.5*u) * 520.0 / max(-mv.z, 1.0);
      gl_Position = projectionMatrix*mv; }`,
  fragmentShader: GLSL_FOG + `varying float vA; varying float vD;
    void main(){ vec2 q = gl_PointCoord - 0.5; float r = length(q);
      float g = fract(sin(dot(gl_PointCoord*37.0 + vec2(vA*3.0), vec2(12.9898,78.233)))*43758.5453);
      float a = smoothstep(0.5, 0.1, r) * vA * (0.16 + 0.12*g);
      if (a < 0.003) discard;
      vec3 c = applyFog(vec3(0.94, 0.96, 0.97), vD);
      gl_FragColor = vec4(c, a); }`,
});
const points = new THREE.Points(partGeo, partMat);
points.frustumCulled = false;
scene.add(points);
function emit(p, v, life, size) {
  const i = part.next; part.next = (part.next + 1) % NPART;
  part.pos[i * 3] = p.x; part.pos[i * 3 + 1] = p.y; part.pos[i * 3 + 2] = p.z;
  part.vel[i * 3] = v.x; part.vel[i * 3 + 1] = v.y; part.vel[i * 3 + 2] = v.z;
  part.age[i] = 0; part.life[i] = life; part.size[i] = size;
}
function stepParticles(dt) {
  const g = 9.81;
  for (let i = 0; i < NPART; i++) {
    if (part.age[i] > part.life[i]) continue;
    part.age[i] += dt;
    const k = 1 - 1.6 * dt;                     // air drag
    part.vel[i * 3] *= k; part.vel[i * 3 + 1] = part.vel[i * 3 + 1] * k - g * 0.45 * dt; part.vel[i * 3 + 2] *= k;
    part.pos[i * 3] += part.vel[i * 3] * dt; part.pos[i * 3 + 1] += part.vel[i * 3 + 1] * dt; part.pos[i * 3 + 2] += part.vel[i * 3 + 2] * dt;
    if (part.pos[i * 3 + 1] < -0.2) part.age[i] = part.life[i] + 1; // hit the water
  }
  partGeo.attributes.position.needsUpdate = true;
  partGeo.attributes.aAge.needsUpdate = true;
  partGeo.attributes.aLife.needsUpdate = true;
  partGeo.attributes.aSize.needsUpdate = true;
}
const rnd = (a, b) => a + Math.random() * (b - a);
const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Vector3();
function emitFrom(sheet, dt) {
  if (!sheet.active) return;
  const sPeel = sheet.sPeel;
  // spray off the lip tip, phase 0.2..0.5, blown up and back by an offshore
  // wind (SHORTCUT: wind is a constant vector)
  for (let k = 0; k < Math.floor(140 * dt) + (Math.random() < 140 * dt % 1 ? 1 : 0); k++) {
    const phi = rnd(0.2, 0.5), arc = sPeel - phi * P.Vp * P.Tbreak;
    if (arc < 0 || arc > L) continue;
    sheet.pointAt(arc, 6 + Math.floor(Math.random() * 2), _p);
    const T = stationT[Math.min(NS - 1, Math.round((arc / L) * (NS - 1)))];
    const N = stationN[Math.min(NS - 1, Math.round((arc / L) * (NS - 1)))];
    _v.set(rnd(-1, 1), rnd(1.5, 4.5), rnd(-1, 1)).addScaledVector(T, rnd(1, 3)).addScaledVector(N, rnd(-3.5, -1.0));
    emit(_p, _v, rnd(0.7, 1.4), rnd(0.18, 0.4) * sheet.H);
  }
  // impact plume, phase 0.55..0.75, peaked at 0.63, from where the curtain
  // lands (profile point 7 = lip tip)
  const rate = 300 * dt;
  for (let k = 0; k < Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0); k++) {
    const phi = 0.62 + rnd(-0.09, 0.16) * Math.sqrt(Math.random());
    const arc = sPeel - phi * P.Vp * P.Tbreak;
    if (arc < 0 || arc > L) continue;
    sheet.pointAt(arc, 7, _p);
    _p.y = Math.max(_p.y, 0.1);
    const si = Math.min(NS - 1, Math.round((arc / L) * (NS - 1)));
    const T = stationT[si], N = stationN[si];
    _v.set(0, rnd(3, 8.5) * Math.sqrt(sheet.H / P.H0), 0).addScaledVector(T, rnd(-1.5, 1.5)).addScaledVector(N, rnd(-3, 1.5)).add(_q.set(rnd(-1.2, 1.2), 0, rnd(-1.2, 1.2)));
    emit(_p, _v, rnd(1.1, 2.0), rnd(0.14, 0.34) * sheet.H);
  }
  // impact core: few, large, bright, short-lived — the "explosion" read
  const core = 45 * dt;
  for (let k = 0; k < Math.floor(core) + (Math.random() < core % 1 ? 1 : 0); k++) {
    const phi = 0.62 + rnd(-0.05, 0.08);
    const arc = sPeel - phi * P.Vp * P.Tbreak;
    if (arc < 0 || arc > L) continue;
    sheet.pointAt(arc, 7, _p); _p.y = Math.max(_p.y, 0.2);
    const si = Math.min(NS - 1, Math.round((arc / L) * (NS - 1)));
    _v.set(0, rnd(5, 10) * Math.sqrt(sheet.H / P.H0), 0).addScaledVector(stationT[si], rnd(-1, 1)).addScaledVector(stationN[si], rnd(-2.5, 0.5));
    emit(_p, _v, rnd(0.7, 1.1), rnd(0.45, 0.8) * sheet.H);
  }
  // whitewater mist, thin, along the broken section
  const mist = 60 * dt;
  for (let k = 0; k < Math.floor(mist) + (Math.random() < mist % 1 ? 1 : 0); k++) {
    const phi = rnd(0.75, 1.0), arc = sPeel - phi * P.Vp * P.Tbreak;
    if (arc < 0 || arc > L) continue;
    sheet.pointAt(arc, 5 + Math.floor(Math.random() * 6), _p);
    _v.set(rnd(-0.5, 0.5), rnd(0.5, 2), rnd(-0.5, 0.5));
    emit(_p, _v, rnd(0.8, 1.6), rnd(0.3, 0.6) * sheet.H);
  }
}

// ---------------------------------------------------------------- surfer ---
// A capsule on the face at the pocket. No physics, no control: it is glued to
// profile point 12 at the station where phase = 0.2. SHORTCUT: no rider model,
// no makeability; the surfer is always exactly where the game wants him.
const surfer = new THREE.Group();
{
  const wet = new THREE.MeshLambertMaterial({ color: 0x1a1c20 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.72, 4, 10), wet);
  body.position.y = 0.62; surfer.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), wet);
  head.position.set(0, 1.22, 0); surfer.add(head);
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.07, 0.5), new THREE.MeshLambertMaterial({ color: 0xf2f2ee }));
  board.position.y = 0.08; surfer.add(board);
  scene.add(surfer);
  surfer.visible = false;
}

// ---------------------------------------------------------------- cameras ---
// SHORTCUT (worth keeping): the pocket camera is an exponential lag on a
// target that rides the peel. The model renderer already has camera presets;
// the lag is the only thing here that is purely a feel decision.
const camState = { mode: 'pocket', pos: new THREE.Vector3(), tgt: new THREE.Vector3(), init: false };
const CLIFF_POS = new THREE.Vector3(-40, 9.5, -63), CLIFF_TGT = new THREE.Vector3(-12, 1.0, 4);
const FOV = { pocket: 62, cliff: 36 };
function pocketFrame(sheet, outPos, outTgt) {
  // pocket = station where phase ≈ 0.28 (lip pitching, tube just behind)
  const arcPk = Math.min(L - 1, Math.max(4, sheet.sPeel - 0.36 * P.Vp * P.Tbreak));
  const si = Math.min(NS - 1, Math.round((arcPk / L) * (NS - 1)));
  const T = stationT[si], N = stationN[si];
  sheet.pointAt(arcPk, 4, _q);                        // crest at the pocket
  outTgt.copy(_q).addScaledVector(N, sheet.H * 0.5); outTgt.y = sheet.H * 0.62;
  // camera: on the shoulder ahead of the peel, in the trough just shoreward of
  // the face, a little under crest height so the eye looks into the mouth
  outPos.copy(_q).addScaledVector(T, 13.0).addScaledVector(N, sheet.H * 1.7);
  outPos.y = Math.max(1.4, sheet.H * 0.8);
}
function updateCamera(dt, focusSheet) {
  const wantPos = new THREE.Vector3(), wantTgt = new THREE.Vector3();
  if (camState.mode === 'cliff' || !focusSheet) { wantPos.copy(CLIFF_POS); wantTgt.copy(CLIFF_TGT); }
  else pocketFrame(focusSheet, wantPos, wantTgt);
  if (!camState.init || camState.mode === 'cliff') { camState.pos.copy(wantPos); camState.tgt.copy(wantTgt); camState.init = true; }
  else {
    const kp = 1 - Math.exp(-dt / 0.55), kt = 1 - Math.exp(-dt / 0.35);
    camState.pos.lerp(wantPos, kp); camState.tgt.lerp(wantTgt, kt);
  }
  camera.position.copy(camState.pos);
  camera.lookAt(camState.tgt);
  if (camera.fov !== FOV[camState.mode]) { camera.fov = FOV[camState.mode]; camera.updateProjectionMatrix(); }
}

// -------------------------------------------------------------- schedule ---
// SHORTCUT: sets are a fixed timetable — three waves 13.5 s apart, 14 s lull,
// heights 1.0/1.35/1.12. The model beats two spectral components and lets
// the set structure fall out of Δf.
function scheduleAt(sim) {
  const cyc = Math.floor(sim / CYCLE), tc = sim - cyc * CYCLE;
  const waves = [];
  for (let k = 0; k < P.setScale.length; k++) {
    const birth = cyc * CYCLE + k * P.period;
    waves.push({ id: cyc * 10 + k, tau: sim - birth, scale: P.setScale[k] });
  }
  // the previous cycle's tail may still be alive
  for (let k = 0; k < P.setScale.length; k++) {
    const birth = (cyc - 1) * CYCLE + k * P.period;
    waves.push({ id: (cyc - 1) * 10 + k, tau: sim - birth, scale: P.setScale[k] });
  }
  return waves.filter((w) => w.tau >= 0 && w.tau < P.Trise + L / P.Vp + P.Tbreak + 2.0);
}
const slotOf = new Map();
function assignSlots(waves) {
  for (const s of sheets) s.claim = null;
  for (const w of waves) if (slotOf.has(w.id)) { sheets[slotOf.get(w.id)].claim = w; }
  for (const w of waves) if (!slotOf.has(w.id)) {
    const free = sheets.findIndex((s) => !s.claim);
    if (free >= 0) { slotOf.set(w.id, free); sheets[free].claim = w; }
  }
  for (const [id, slot] of slotOf) if (!waves.find((w) => w.id === id)) slotOf.delete(id);
}

// ------------------------------------------------------------------ loop ---
const hash = Object.fromEntries(location.hash.slice(1).split('&').filter(Boolean).map((kv) => kv.split('=')));
let sim = 0, speed = hash.speed !== undefined ? parseFloat(hash.speed) : 1;
camState.mode = hash.cam === 'cliff' ? 'cliff' : 'pocket';
const hud = document.getElementById('hud');
if (hash.hud === '0') hud.classList.add('hidden');
let paused = false;

function step(dt) {
  sim += dt;
  const waves = scheduleAt(sim);
  assignSlots(waves);
  let focus = null, focusPhase = -1;
  for (const s of sheets) {
    if (s.claim) s.update(s.claim.tau, s.claim.scale); else s.update(-1, 1);
    if (s.active) { emitFrom(s, dt); }
  }
  // focus wave: the one whose peel is currently on the spline (prefer the
  // one with the smallest sPeel that is > 0)
  for (const s of sheets) if (s.active && s.sPeel > -6 && s.sPeel < L + 0.35 * P.Vp * P.Tbreak) {
    if (!focus || s.sPeel < focus.sPeel) focus = s;
  }
  if (!focus) for (const s of sheets) if (s.active && (!focus || s.claim.tau < focus.claim.tau)) focus = s;
  stepParticles(dt);
  // surfer
  if (focus && focus.sPeel > 6 && focus.sPeel < L) {
    const arcS = Math.max(2, focus.sPeel - 0.25 * P.Vp * P.Tbreak);
    focus.pointAt(arcS, 12, _p);
    const si = Math.min(NS - 1, Math.round((arcS / L) * (NS - 1)));
    surfer.position.copy(_p).addScaledVector(stationN[si], 0.2); surfer.position.y += 0.05;
    // board nose along the peel direction (+T), body leaning back into the face
    surfer.rotation.set(0, Math.atan2(stationT[si].x, stationT[si].z) - Math.PI / 2, 0);
    surfer.rotateOnAxis(new THREE.Vector3(0, 0, 1), 0.18); // slight lean back into the face
    surfer.visible = true;
    focusPhase = focus.phaseAt(arcS);
  } else surfer.visible = false;
  updateCamera(dt, focus);
  common.uTime.value = sim;
  return { waves, focus, focusPhase };
}

// pinned clock: jump to t-4 with the camera snapped, then warm 4 s at 60 Hz so
// particles and the camera lag converge; then hold if speed=0.
if (hash.t !== undefined) {
  const T = parseFloat(hash.t);
  sim = Math.max(0, T - 4);
  camState.init = false;
  for (let i = 0; i < 240; i++) step(1 / 60);
  sim = T;
  step(0);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!isFinite(dt) || dt < 0) dt = 0;
  const r = paused ? step(0) : step(dt * speed);
  const f = r.focus;
  if (!hud.classList.contains('hidden')) {
    hud.textContent = `surf-game-hack   sim ${sim.toFixed(1)} s   cam ${camState.mode}   speed ${speed}${paused ? ' (paused)' : ''}\n` +
      `waves live ${r.waves.length}   focus ${f ? `H=${f.H.toFixed(2)} m  peel ${Math.max(0, f.sPeel).toFixed(0)}/${L.toFixed(0)} m  Vp=${P.Vp} m/s` : '-'}\n` +
      `c: camera   space: pause   #cam=cliff|pocket &t=<s> &speed=<x>`;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
addEventListener('keydown', (e) => {
  if (e.key === 'c') { camState.mode = camState.mode === 'pocket' ? 'cliff' : 'pocket'; camState.init = false; }
  if (e.key === ' ') { paused = !paused; e.preventDefault(); }
});

window.__hack = { get sim() { return sim; }, camera, P, L, sheets, camState, step };
