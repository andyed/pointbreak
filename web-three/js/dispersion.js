// Linear wave dispersion, shoaling, and the shore-normal phase integral.
//
// M6 part 3. This is the physics that makes the wavelength a function of depth
// instead of the frozen `LAM = 90 m` the model has carried since before the
// seabed existed. It is deliberately a SEPARATE, PURE module:
//
//   - no `three` import, so `node --test` can exercise it (bed.js imports THREE
//     at module scope, which is why the M5 fit tests had to be deferred);
//   - no bathymetry import either — every entry point takes an `elevAt(zc)`
//     callback, so the caller decides whether that is the real NCEI grid, the
//     M5-augmented grid, or an analytic ramp.
//
// bed.js owns the texture packing and the bathymetry; this file owns the maths.
// Keep it that way: the moment this module reaches for a grid it stops being
// testable, which is the whole reason it exists.

export const G = 9.81;

// Guo (2002), "Simple and explicit solution of wave dispersion equation",
// Coastal Engineering 45, 71-74. With y = omega^2*h/g:
//
//     k*h = y / [1 - exp(-y^(5/4))]^(2/5)
//
// Explicit, no iteration, and measured max error 0.79% against the exact root
// of omega^2 = g*k*tanh(k*h) over y in [1e-3, 50] — matching the paper's
// claim. Verified in tests/dispersion.test.js against a bisection reference.
//
// CORRECTION 2026-08-11: bed.js previously used `k*h = y/sqrt(tanh(y))` while
// citing Guo and claiming "within ~1%". That is a different approximation and
// its measured max error is 4.98%, at y ~ 0.69 (h ~ 39 m at T = 15 s) — the
// intermediate-depth band the phase integral spends most of its length in.
// The bake was dormant when that was written, so nothing shipped on it.
//
// The depth floor is load-bearing. As h -> 0 the exact k -> omega/sqrt(g*h)
// diverges, so an unfloored call on dry land returns a wavenumber of hundreds
// of radians per metre and any phase integral built on it is noise. Callers
// that integrate must ALSO stop at a propagating-depth cutoff; the floor here
// only keeps a single sample finite.
export function wavenumberAt(omega, h, floorM = 0.05) {
  const hh = Math.max(h, floorM);
  const y = omega * omega * hh / G;
  return (y / Math.pow(1 - Math.exp(-Math.pow(y, 1.25)), 0.4)) / hh;
}

export function wavelengthAt(omega, h, floorM = 0.05) {
  return 2 * Math.PI / wavenumberAt(omega, h, floorM);
}

// Shallow-water limit, L = T*sqrt(g*h). The acceptance target for the bake:
// at breaking depth the Guo wavelength must land within 10% of this.
export function shallowWavelength(T, h) {
  return T * Math.sqrt(G * Math.max(h, 1e-3));
}

// Deep-water wavelength, gT^2/2pi.
export function deepWavelength(T) {
  return G * T * T / (2 * Math.PI);
}

// Alongshore (contour-parallel) wavenumber. Snell's invariant for a straight
// contour: k*sin(phi) is conserved at every depth, so this single number is the
// whole of the swell's obliquity and it never needs re-deriving inshore.
export function alongshoreKappa(omega, swellDeg) {
  return (omega * omega / G) * Math.sin(swellDeg * Math.PI / 180);
}

// Local incidence from shore-normal, radians. sin(phi) = kappa/k, so the wave
// straightens as k grows shoreward. Returns pi/2 at the caustic (k <= kappa).
export function incidenceAt(omega, h, kappa, floorM = 0.05) {
  const k = wavenumberAt(omega, h, floorM);
  return Math.asin(Math.min(kappa / Math.max(k, 1e-6), 1));
}

// Shore-normal wavenumber, sqrt(k^2 - kappa^2). Floored rather than allowed to
// go imaginary: past the caustic the ray has turned parallel to the contour and
// cannot travel further shoreward, and the correct degenerate behaviour is for
// the phase to advance alongshore only. Flooring also keeps Psi monotonic,
// which the rider's inversion depends on.
export function normalWavenumber(omega, h, kappa, floorM = 0.05) {
  const k = wavenumberAt(omega, h, floorM);
  return Math.sqrt(Math.max(k * k - kappa * kappa, 1e-6));
}

export const MIN_PROPAGATING_DEPTH = 0.5;

// Psi(zc) = integral of the shore-normal wavenumber, shoreward from the seaward
// edge. This is the phase field that replaces `k * rayS` when u_psiMix is on:
// total spatial phase = kappa*x + Psi(zc), exact for a straight contour and
// reducing to the old plane wave when the depth is constant.
//
// Integration STOPS at MIN_PROPAGATING_DEPTH and freezes Psi from there in.
// Past the waterline there is no propagating wave, and the depth floor would
// otherwise make k explode: at 0.05 m, k is ~0.64 rad/m, so the beach alone
// contributed ~64 rad of pure fiction and the phase field came out as noise
// (the mesh detonated when this was first switched on in 2026-08-10's reverted
// build). The shore fade has killed the wave there anyway.
//
// Returns { psi, kappa, psiMin, psiMax, frozenFrom } — frozenFrom is the zc the
// integration stopped at, or null if it ran the whole span.
export function integratePsi({
  elevAt, waterLevel, omega, kappa,
  zMin, zMax, n = 256, minDepth = MIN_PROPAGATING_DEPTH,
}) {
  const psi = new Float32Array(n);
  const dz = (zMax - zMin) / (n - 1);
  let acc = 0, prevKz = null, frozen = false, frozenFrom = null;
  for (let i = 0; i < n; i++) {
    const zc = zMin + dz * i;
    const depth = waterLevel - elevAt(zc);
    if (depth <= minDepth) {
      if (!frozen) { frozen = true; frozenFrom = zc; }
    }
    if (frozen) { psi[i] = acc; continue; }
    const kz = normalWavenumber(omega, depth, kappa);
    if (prevKz !== null) acc += 0.5 * (kz + prevKz) * dz;
    prevKz = kz;
    psi[i] = acc;
  }
  return { psi, kappa, psiMin: psi[0], psiMax: psi[n - 1], frozenFrom };
}

// Linear sample of a baked Psi table. Twin of the shader's texelFetch pair.
export function psiSample(psi, zc, zMin, zMax) {
  const n = psi.length;
  const f = Math.min(Math.max((zc - zMin) / (zMax - zMin), 0), 1) * (n - 1);
  const i = Math.min(Math.floor(f), n - 2);
  return psi[i] + (psi[i + 1] - psi[i]) * (f - i);
}

// Invert Psi (monotonic non-decreasing) — the rider needs the contour position
// of a given crest phase. Bisection: 24 steps over ~430 m is sub-millimetre,
// and this runs once per frame, not per fragment.
export function zcAtPsiIn(psi, target, zMin, zMax) {
  let lo = zMin, hi = zMax;
  for (let i = 0; i < 24; i++) {
    const mid = 0.5 * (lo + hi);
    if (psiSample(psi, mid, zMin, zMax) < target) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// ---------- shoaling / steepness ----------
// MODEL-TWIN of ocean()'s amplitude path: Green's law with the shallow-water
// group speed, then the depth-limited cap. Kept here so the steepness acceptance
// test measures the SAME height the renderer draws, not a second derivation.
export const GAMMA = 0.78;

export function shoaledHeight(H0, T, h) {
  const cg0 = G * T / (4 * Math.PI);                  // deep-water group speed
  const Ks = Math.min(Math.max(Math.sqrt(cg0 / Math.sqrt(G * Math.max(h, 0.05))), 0.7), 2.6);
  return H0 * Ks;
}

// Height actually carried at this depth: shoaled until the depth cannot hold it.
export function heightAt(H0, T, h) {
  return Math.min(shoaledHeight(H0, T, h), GAMMA * Math.max(h, 0.05));
}

// Depth at which the shoaled wave first exceeds what the depth can carry.
// Bisection on (Hsh - gamma*h), which is monotone over the range of interest.
export function breakingDepth(H0, T, { hMin = 0.2, hMax = 30 } = {}) {
  const f = (h) => shoaledHeight(H0, T, h) - GAMMA * h;
  if (f(hMax) > 0) return hMax;
  if (f(hMin) < 0) return hMin;
  let lo = hMin, hi = hMax;
  for (let i = 0; i < 40; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// Steepness H/L at a depth. `frozenL` reproduces the pre-M6-part-3 model for
// the counterfactual: pass LAM = 90 to get the number the renderer used to draw.
export function steepnessAt(H0, T, h, frozenL = null) {
  const omega = 2 * Math.PI / T;
  const L = frozenL === null ? wavelengthAt(omega, h) : frozenL;
  return heightAt(H0, T, h) / L;
}

// ---------- sheltering (H_eff, MODEL.md 2.6.7) ----------
// GLSL twin: SHELTER_X0 / SHELTER_L / shelterAt in model-glsl.js — keep
// numerically identical, or the baked break line and the drawn wave field
// disagree about where breaking happens. Calibration: log-linear fit of the
// card bank's H0 gradient over the canon span (Sewers 2.2 m at u=402 ->
// Private's 0.7 m at u=1977, r^2 = 0.81, PP_MAP_GEOMETRY). 1.0 at the reef
// anchor, so the card H0 stays the wave at the takeoff. Direction-frozen at
// the SC116 reference; L becomes L(D_p) when direction wires.
export const SHELTER_X0 = 24;    // m, reef anchor
export const SHELTER_L = 1675;   // m, apex-shadow e-fold at reference D_p
export function shelterFactor(x) {
  return Math.min(Math.max(Math.exp(-(x - SHELTER_X0) / SHELTER_L), 0.6), 1.25);
}
