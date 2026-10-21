// Fragment-only response of the attached aerated body. Its lobes and their
// derivatives come from the shared model; this module invents no events,
// displacement, texture clock, or coverage mask.
export const WHITEWATER_MATERIAL_GLSL = `
#ifdef BREAKING_BODY
vec3 breakingWhitewaterColor(vec4 roll, vec3 geometricNormal, vec3 lightDir,
                             float faceHeight, float laceAge){
  vec3 N = normalize(geometricNormal);
  // Tangents in stage coordinates. The grid's phase/material ownership is
  // Lagrangian; this frame only turns the shared lobe slopes toward the light.
  vec3 tx = vec3(1.0, 0.0, 0.0) - N*N.x;
  tx = normalize(tx + vec3(0.0, 0.0, 1e-4));
  vec3 ta = normalize(cross(tx, N));
  if (ta.z < 0.0) ta = -ta;
  // dx is per source metre, darc per normalized front. A bounded relief
  // slope gives round illuminated shoulders without a new glitter normal.
  float sx = clamp(0.16*faceHeight*roll.y, -1.20, 1.20);
  float sa = clamp(0.23*roll.z, -1.40, 1.40);
  vec3 lobeN = normalize(N - tx*sx - ta*sa);
  float sky = 0.5 + 0.5*clamp(lobeN.y, -1.0, 1.0);
  float sun = max(dot(lobeN, lightDir), 0.0);
  float hollow = 1.0 - smoothstep(0.08, 0.40, roll.x);
  float crown = smoothstep(0.40, 0.80, roll.x);
  // Grey is aerated water in a local recess. The entire front remains
  // opaque; a continuous dark lower fascia would turn it back into glass.
  float light = (0.73 + 0.19*sky + 0.08*sun) * (1.0 - 0.25*hollow);
  light = mix(light, 0.985, 0.24*crown);
  vec3 fresh = vec3(0.985, 0.995, 0.980)*light;
  vec3 aged = vec3(0.64, 0.73, 0.72)*(0.85 + 0.15*sky);
  return mix(fresh, aged, 0.64*laceAge);
}
#endif
`;
