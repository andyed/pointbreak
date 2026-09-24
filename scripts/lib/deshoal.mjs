// De-shoaling for a derived ocean — PROPOSED, NOT WIRED.
//
// `u_H0` is declared deep-water and the shared GLSL re-shoals it with
// `shoalingKsAt(h)` = sqrt(cg0/cg(h)) at every station. CDIP MOP SC116
// `waveHs` is already at the MOP prediction site, 15.03 m (metaWaterDepth in
// both SC116 files), so feeding it straight into `u_H0` — which is what
// `#day=live` does via applyOcean() — shoals it twice: the drawn height at
// every depth is Hs*Ks(h) instead of Hs*Ks(h)/Ks(15.03). The month table has
// the same defect with a different sign convention: pp_monthly_ocean.js was
// divided by a SHALLOW-water Ks (0.9759 at 14.8 s) that the shader no longer
// uses (finite-depth cg since commit 09c7f4a).
//
// The correction is the coastal-engineering "equivalent deep-water height":
//
//     H0' = Hs_site / Ks(T, site depth)
//
// Refraction is deliberately NOT divided out: MOP carried the swell through
// it, and the model applies no Kr from deep water on its default path (the
// Psi bake starts at the stated reference depth when #direction= is used).
//
// Twin: scripts/audit_forcing.py deshoal_h0(); tests/deshoal.test.js pins the
// two to 1e-4 through docs/research/assets/forcing-2026-09-23/q1_deshoal.json.
// Flag design and the numbers: docs/research/FORCING_AUDIT_2026-09-23.md.
//
// Kept out of shared/ on purpose: nothing in the renderer imports this.

import { groupVelocityAt, G } from '../../web-three/js/dispersion.js';

export const SC116_SITE_DEPTH_M = 15.03;

// shoalingKsAt() in shared/model-glsl.js, unclamped inputs, same clamp.
export function shoalingKs(T, h) {
  const omega = 2 * Math.PI / T;
  const cg0 = G * T / (4 * Math.PI);
  const ks = Math.sqrt(cg0 / groupVelocityAt(omega, h));
  return Math.min(Math.max(ks, 0.7), 2.6);
}

// Equivalent deep-water height for a site Hs at `siteDepthM`. Finite-guarded:
// a NaN Hs or T returns null so a caller can fall back to the raw value.
export function deshoalH0(hsSite, T, siteDepthM = SC116_SITE_DEPTH_M) {
  if (!Number.isFinite(hsSite) || !Number.isFinite(T) || T <= 0) return null;
  const ks = shoalingKs(T, siteDepthM);
  return Number.isFinite(ks) && ks > 0 ? hsSite / ks : null;
}
