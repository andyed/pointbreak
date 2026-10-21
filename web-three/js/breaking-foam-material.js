import { SKY_GLSL, FOG_GLSL } from './shaders.js';

// Opaque attached whitewater. Position, rotation, overlap and birth/death
// belong to the volume mesh; this response introduces no motion clock.
export const BREAKING_FOAM_VOLUME_FRAG = `
precision highp float;
uniform float u_time;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vLocal;
varying vec3 vFoam;

${SKY_GLSL}
// The shared fog's value noise has the same hash/interpolation as skyNoise2.
// Reuse it without importing the entire wave model into this fragment.
float vnoise2(vec2 p){ return skyNoise2(p); }
${FOG_GLSL}

void main(){
  if (vFoam.z < 0.002) discard;
  vec3 N = normalize(vNormal);
  vec3 V = normalize(u_camStage - vWorldPos);

  // Weak fine breakup travels WITH each rotating lobe. Coarse local colour
  // patches read as mottled stones; actual occlusion and turned geometry
  // must supply the broad grey recesses between overlapping masses.
  vec3 q = vLocal*14.0 + vec3(vFoam.x*13.1, vFoam.x*7.7, vFoam.x*19.3);
  float fold = sin(q.x + 0.42*sin(q.z))*sin(q.y*1.17 - 0.35*cos(q.x));
  float localFootprint = max(length(dFdx(vLocal)), length(dFdy(vLocal)));
  float detail = 1.0 - smoothstep(0.04, 0.12, localFootprint);
  float recess = smoothstep(0.12, 0.72, fold)*detail;

  // A few rounded sub-lobes soften the perfectly smooth ellipsoid shading.
  // The field is fixed in the instance: its real orientation supplies all
  // motion. Convert its derivatives through the actual deformed surface,
  // including nonuniform axes, rather than rotating normals in screen space.
  vec3 r = vLocal*5.0 + vec3(vFoam.x*17.3, vFoam.x*11.9, vFoam.x*5.7);
  float subLobe = 0.5*sin(r.x + 0.35*sin(r.z))*sin(r.y - 0.35*cos(r.x))
                + 0.5*cos(r.z + 0.30*sin(r.y));
  float subDetail = 1.0 - smoothstep(0.14, 0.40, localFootprint);
  vec3 dx = dFdx(vWorldPos), dyP = dFdy(vWorldPos);
  float localScale = max(length(dx), length(dyP))/max(localFootprint, 1e-5);
  vec3 rx = cross(dyP, N), ry = cross(N, dx);
  float det = dot(dx, rx);
  vec2 subSlope = vec2(dFdx(subLobe), dFdy(subLobe));
  if (abs(det) > 1e-8) {
    vec3 slope = (subSlope.x*rx + subSlope.y*ry)
                 * (0.035*localScale*subDetail/det);
    // At most twelve degrees: preserve the actual mass and avoid craggy
    // rocks or sparkle from unresolved normal variation at the silhouette.
    slope *= min(1.0, 0.22/max(length(slope), 1e-5));
    N = normalize(N - slope);
  }

  // A broad sky supplies most of the light beneath the marine layer. The
  // direct sun contributes only a small directional cue: no plastic glint
  // or per-lobe silhouette rim to separate the overlapping mass into beads.
  float sky = 0.5 + 0.5*N.y;
  float sun = max(dot(N, sunDir), 0.0);
  float diffuse = 0.70 + 0.22*sky + 0.08*sun;
  float recessShade = 1.0 - 0.03*recess;
  float albedoVariation = 0.97 + 0.03*vFoam.x;
  vec3 col = vec3(0.985, 0.995, 0.980)*diffuse*recessShade*albedoVariation;

  // Same atmospheric law and display curve as the attached grid, so a
  // volume does not remain luminous where its supporting surface fades.
  float dist = length(u_camStage - vWorldPos);
  float dy = max(u_camStage.y - vWorldPos.y, 0.0);
  col = mix(col, skyColor(-V, u_time), fogAmount(dist, dy, vWorldPos.xz, u_time));
  col = pow(clamp(col, 0.0, 1.0), vec3(0.92));
  gl_FragColor = vec4(col, 1.0);
}
`;
