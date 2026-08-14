// M6 part 3 acceptance: the wavelength must be a function of depth.
//
// These run headless because dispersion.js deliberately imports neither THREE
// nor the bathymetry (bed.js does both, which is why its M5 tests are still
// deferred to a browser). The bed used here is each spot's own SUBMERGED-FIT
// PLANE from pp_depth_patches.js — the same plane the renderer's `#bed=plane`
// A/B swaps in, so this is the repo's own counterfactual seabed, not an
// invented ramp.
//
// The load-bearing test is `the frozen wavelength flattens the shoaling ramp`.
// It asserts the defect, not just the fix: with LAM frozen at 90 m the crest
// barely steepens on the way in, which is the measured reason the fold reads as
// "peaks and subsides" rather than "pitches".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as D from '../web-three/js/dispersion.js';

const { PP_DEPTH_DATA } = await import('../data/model/pp_depth_patches.js');
const MSL = PP_DEPTH_DATA.mslAboveNavd88M;
const T = 15, OMEGA = 2 * Math.PI / T;
const LAM_FROZEN = 90;   // the constant this work replaces

// Exact root of omega^2 = g*k*tanh(k*h), by bisection — the reference Guo
// approximates. Independent of the code under test on purpose.
function exactK(omega, h) {
  const f = (k) => D.G * k * Math.tanh(k * h) - omega * omega;
  let lo = 1e-6, hi = 10;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi);
    if (f(mid) < 0) lo = mid; else hi = mid;
  }
  return 0.5 * (lo + hi);
}

// elevAt for a spot's submerged-fit plane at the stage origin (x = 0).
function planeBed(spot) {
  const pf = PP_DEPTH_DATA.patches[spot].planeFit;
  return (zc) => pf[0] + pf[2] * zc;
}

test('Guo (2002) is within 1% of the exact dispersion root, everywhere', () => {
  // Swept, not sampled. The predecessor form (y/sqrt(tanh y)) passed at every
  // round depth anyone would think to spot-check and peaked at 4.98% between
  // them, at h ~ 39 m — which is why this walks the whole band.
  let worst = 0, worstH = 0;
  for (let h = 0.3; h < 400; h *= 1.02) {
    const err = Math.abs(D.wavenumberAt(OMEGA, h) - exactK(OMEGA, h)) / exactK(OMEGA, h);
    if (err > worst) { worst = err; worstH = h; }
  }
  assert.ok(worst < 0.01,
    `max k error ${(worst * 100).toFixed(2)}% at h=${worstH.toFixed(1)} m exceeds 1%`);
});

test('both asymptotes hold: deep-water gT^2/2pi, shallow-water T*sqrt(gh)', () => {
  const deep = D.wavelengthAt(OMEGA, 500);
  assert.ok(Math.abs(deep - D.deepWavelength(T)) / D.deepWavelength(T) < 0.01,
    `deep-water L ${deep.toFixed(1)} vs gT^2/2pi ${D.deepWavelength(T).toFixed(1)}`);

  // The spec's acceptance criterion, at the depth it actually matters: the
  // wave breaks in shallow water, so L at the break must be the shallow form.
  for (const H0 of [0.7, 1.5, 2.5]) {
    const hb = D.breakingDepth(H0, T);
    const L = D.wavelengthAt(OMEGA, hb);
    const Lsw = D.shallowWavelength(T, hb);
    assert.ok(Math.abs(L - Lsw) / Lsw < 0.10,
      `H0=${H0}: L(h_b=${hb.toFixed(2)}) = ${L.toFixed(1)} vs T*sqrt(gh) ${Lsw.toFixed(1)}`);
  }
});

test('the wavelength actually compresses across the surf zone', () => {
  // The number the renderer has been drawing wrong: at 2 m of water it lays
  // down 90 m crests where the physics says ~66 m.
  const offshore = D.wavelengthAt(OMEGA, 6);
  const inshore = D.wavelengthAt(OMEGA, 1.9);
  assert.ok(offshore / inshore > 1.6,
    `compression ${offshore.toFixed(1)} -> ${inshore.toFixed(1)} is only ${(offshore / inshore).toFixed(2)}x`);

  let prev = Infinity;
  for (const h of [12, 10, 8, 6, 5, 4, 3, 2, 1.5, 1]) {
    const L = D.wavelengthAt(OMEGA, h);
    assert.ok(L < prev, `L not monotone shoreward at h=${h}`);
    prev = L;
  }

  // The frozen constant is not even a good average: it is right at ~3.7 m and
  // 36-40% too long through the inner surf zone, which is the part in frame.
  const errAt2m = Math.abs(LAM_FROZEN - D.wavelengthAt(OMEGA, 2)) / D.wavelengthAt(OMEGA, 2);
  assert.ok(errAt2m > 0.30, `frozen LAM error at 2 m is only ${(errAt2m * 100).toFixed(0)}%`);
});

test('the frozen wavelength flattens the shoaling ramp (the defect)', () => {
  // Steepness H/L from deep water in to the break point. Physically the crest
  // steepens all the way to breaking; past it, as a bore, it decays — so a
  // FALLING steepness inshore of the break is correct in both models and is
  // not the bug. The bug is the DYNAMIC RANGE of the approach: with L frozen
  // the wave arrives almost as steep as it started, so there is nothing for
  // the fold to develop out of.
  const H0 = 1.5;
  const hb = D.breakingDepth(H0, T);
  const ramp = (frozen) =>
    D.steepnessAt(H0, T, hb, frozen) / D.steepnessAt(H0, T, 10, frozen);

  const real = ramp(null), frozen = ramp(LAM_FROZEN);
  assert.ok(real > 2.2, `real steepening ramp only ${real.toFixed(2)}x`);
  assert.ok(frozen < 1.5, `frozen ramp unexpectedly ${frozen.toFixed(2)}x`);
  assert.ok(real / frozen > 1.7,
    `shoaling ramp gains only ${(real / frozen).toFixed(2)}x from variable L`);
});

test('steepness peaks at the breaking depth, not before or after', () => {
  for (const H0 of [0.7, 1.5, 2.5]) {
    const hb = D.breakingDepth(H0, T);
    let best = -1, bestH = null;
    for (let h = 12; h > 0.3; h -= 0.02) {
      const s = D.steepnessAt(H0, T, h);
      if (s > best) { best = s; bestH = h; }
    }
    assert.ok(Math.abs(bestH - hb) / hb < 0.15,
      `H0=${H0}: steepness peaks at h=${bestH.toFixed(2)} but breaks at ${hb.toFixed(2)}`);
  }
});

test('Psi is monotone non-decreasing on every mapped spot (rider inversion)', () => {
  for (const spot of Object.keys(PP_DEPTH_DATA.patches)) {
    const { psi } = D.integratePsi({
      elevAt: planeBed(spot), waterLevel: MSL, omega: OMEGA,
      kappa: D.alongshoreKappa(OMEGA, 50), zMin: -260, zMax: 170, n: 256,
    });
    for (let i = 1; i < psi.length; i++) {
      assert.ok(psi[i] >= psi[i - 1],
        `${spot}: Psi decreased at sample ${i} (${psi[i - 1]} -> ${psi[i]})`);
    }
    assert.ok(Number.isFinite(psi[psi.length - 1]), `${spot}: Psi ended non-finite`);
  }
});

test('Psi clamps shallow depth instead of freezing — bounded beach, no dead zone', () => {
  // A ramp that runs from 8 m of water to 3 m above the waterline. Two
  // regimes were both wrong: the 0.05 m depth floor gave k ~ 0.64 rad/m and
  // ~64 rad of beach fiction (2026-08-10, mesh detonated), and the freeze
  // that replaced it created a phase-DEAD zone shoreward of the FIRST 0.5 m
  // crossing — on a reef coast that is the reef crest, so the whole inner
  // surf zone throbbed as one tSince block and printed razor edges (Andy,
  // live, 2026-08-13). The contract now: k evaluated at max(depth, 0.5 m),
  // Psi STRICTLY increasing everywhere, and the beach's contribution bounded
  // (k(0.5 m) ~ 0.2 rad/m — a few rad over the swash, not 64).
  const elevAt = (zc) => MSL - 8 + (zc + 200) * (11 / 400);
  const out = D.integratePsi({
    elevAt, waterLevel: MSL, omega: OMEGA,
    kappa: D.alongshoreKappa(OMEGA, 50), zMin: -200, zMax: 200, n: 256,
  });
  assert.equal(out.frozenFrom, null, 'nothing freezes anymore');
  for (let i = 1; i < out.psi.length; i++)
    assert.ok(out.psi[i] > out.psi[i - 1], `Psi not strictly increasing at ${i}`);
  // Beach fiction stays bounded: the whole span accumulates far less than the
  // 64 rad the 0.05 m floor produced, and the clamped tail advances at the
  // 0.5 m rate, not the floor rate.
  assert.ok(out.psiMax < 60, `Psi ran to ${out.psiMax.toFixed(1)} rad — fiction leaked in`);
  const kClamp = D.normalWavenumber(OMEGA, 0.5, D.alongshoreKappa(OMEGA, 50));
  const tailRate = (D.psiSample(out.psi, 190, -200, 200) - D.psiSample(out.psi, 150, -200, 200)) / 40;
  assert.ok(Math.abs(tailRate - kClamp) / kClamp < 0.05,
    `beach tail advances at ${tailRate.toFixed(3)} rad/m vs clamped k ${kClamp.toFixed(3)}`);
});

test("Snell's invariant holds and the swell straightens shoreward", () => {
  const kappa = D.alongshoreKappa(OMEGA, 58);   // deep-water 58 deg, as authored
  let prev = Infinity;
  for (const h of [40, 20, 12, 8, 6, 4, 3, 2, 1.2]) {
    const phi = D.incidenceAt(OMEGA, h, kappa);
    assert.ok(phi < prev, `incidence not falling shoreward at h=${h}`);
    prev = phi;
    // kappa = k*sin(phi) at every depth, by construction
    const k = D.wavenumberAt(OMEGA, h);
    assert.ok(Math.abs(k * Math.sin(phi) - kappa) / kappa < 0.01,
      `Snell violated at h=${h}: k*sin(phi)=${(k * Math.sin(phi)).toFixed(5)} vs kappa=${kappa.toFixed(5)}`);
  }
  // Sanity against MODEL.md 2.4's measured chain (17.1 -> 9.4 -> 7.9 deg).
  const deg = (h) => D.incidenceAt(OMEGA, h, kappa) * 180 / Math.PI;
  assert.ok(deg(40) > deg(6) && deg(6) > deg(2), 'incidence chain out of order');
  assert.ok(deg(2) < 12, `crests still ${deg(2).toFixed(1)} deg oblique at 2 m`);
});

test('zcAtPsi inverts psiSample to sub-metre across the WHOLE span', () => {
  const out = D.integratePsi({
    elevAt: planeBed('Second Peak'), waterLevel: MSL, omega: OMEGA,
    kappa: D.alongshoreKappa(OMEGA, 50), zMin: -260, zMax: 170, n: 256,
  });
  // With the clamp (no freeze), Psi is strictly increasing over the full
  // baked span, so the inverse exists EVERYWHERE — including the shallow
  // inner zone where the old frozen shelf made it undefined. That flat shelf
  // was not a harmless non-invertibility: it was the phase-dead zone that
  // printed razor foam edges. Stations past the old ~101 m cutoff included
  // deliberately.
  assert.equal(out.frozenFrom, null, 'nothing freezes anymore');
  for (const zc of [-200, -120, -40, 0, 60, 110, 150]) {
    const back = D.zcAtPsiIn(out.psi, D.psiSample(out.psi, zc, -260, 170), -260, 170);
    assert.ok(Math.abs(back - zc) < 0.5, `round trip ${zc} -> ${back.toFixed(2)}`);
  }
});
