# Temporal harness review — scripts/capture_temporal.mjs

Second-seat review, 2026-08-12. The harness was written in a round that was
killed before review (ROUND2_FINDINGS notes it "new, never run by a second
seat") and is now the acceptance path. Method: MEASUREMENT_LESSONS lesson 2
(prove the probe) and lesson 9 (scaffolding scan), applied by code-reading
against `web-three/js/main.js` and `web/js/model-glsl.js`, plus one budgeted
live run (68 frames total: 8 prescan + 60 capture, Sewers zipper, dt=1.25 s).

Caveat on the live numbers: the working tree carried uncommitted edits to
`bed.js`, `model-js.js`, `model-glsl.js`, `sound.js` from a concurrent session.
The run measures that tree, not HEAD.

## Verdicts

| Component | Verdict | Evidence |
|---|---|---|
| Clock contract (`#sim=` seed, `speed=0` freeze, setSim + 2 rAF) | **TRUST** | Verified line by line: `simTime += dt*state.speed` main.js:820; hook `setSim` :1108; seed returned :1088, assigned :1089, drift anchor :1093. The `#speed=0` falsy-trap claim is TRUE: `parseFloat(h.get('speed')) || 1` at main.js:1075 yields 1 for `#speed=0`. Header line refs were stale (pre-edit main.js) — refreshed. |
| `--verify-clock` | **TRUST, with limits** | It is a real test, not a re-run: it compares mutate-in-place (setSim) against fresh module init at the same sim time, so it catches hidden accumulated state and non-zeroed speed. But it covers 3 early frames only — it structurally cannot catch mid-sequence state changes (see quality-tier fix below), and it shares STEP_AND_SETTLE with the path under test. |
| Pixel→world map + nadir rig | **TRUST** | Math checked: column-major unproject matches THREE (`applyM` = M4·v with perspective divide), NDC y-flip correct, fov-from-halfw solve correct; orientation errors can't corrupt binning because the map is built from the actual recorded matrices. Empirically validated by the built-in control: cross-shore carrier phase speed **+5.99 m/s shoreward, R2 1.00**, bracketed by √(g·h_b)=5.26 and LAM/T=6.00. |
| Zipper: wavenumber/celerity (kx, kz, λ, c) | **TRUST (after sign fix)** | Measured λ 81.6 m vs authored LAM 90 (model-glsl.js:94), celerity 5.44 m/s vs 5.26–6.0 expected. See fix 1: the raw phase gradients are −k; pre-fix kz implied a *seaward*-travelling carrier, contradicting the passing control. |
| Zipper: peel angle α and Vp | **FIX FIRST** (needs a full-length, un-clipped run) | On the budget run the break-line slope fit is garbage (dz/dx 0.046 at **R2 0.01**), 31/216 break-line columns sat on the seaward frame edge, and the three estimators disagreed: geom +23.5 m/s, phase-at-line −58.8 m/s (r2 0.14), band-averaged +148 m/s (r2 0.12). The code *honestly reports* these fit stats — the instrument self-flags rather than lying. +23.5 = c/sin(13.4°) is internally consistent and within an order of magnitude of the 4.8–10 band; the shortfall vs authored α 38° matches audit finding 3 (refraction-collapsed visible angle; Walker α=10° case → 30.3 m/s). Acceptance requires the full 160-frame dt=0.4 sequence with the clip canary quiet. |
| Zipper: secondary cross-correlation | **TRUST as a null control** | Returned −0.00 m/s at median r 0.92 — exactly the documented static-stripe confound. Confirmed the stripe is real and static: `foam *= 0.72 + 0.28*vnoise1(x*0.045 + 3.1)` at model-glsl.js:779 (x-only, no t; period 2π·… ≈ 22 m — measured along-shore foam period 20.1 m). The report already labels it "expect ~0 whatever the peel does". |
| Set cadence | **UNVERIFIED — not run at full length by anyone** | Method is sound (biased autocorr, carrier peak as instrument check, drift-splice guard verified against main.js:825-834 with drift default OFF at :93). But the budget window (74 s) is shorter than the authored 125 s set period *by design of the budget*, and the carrier instrument check also returned null on this window — so the cadence path has zero empirical validation to date. The 3.4× group-speed claim is computed, not asserted (3.90× at Sewers T=15; 3.4× corresponds to the T=14 presets). Run the full 260-frame cadence sequence off-hours before citing any cadence number. |
| Foam advection / persistence | **TRUST** | +4.98 m/s shoreward, and now **linear across frame separations** (5.36 at 2·dt, 5.14 at 4·dt — lesson-3 check added, see fix 3). Lagrangian e-fold 11.9 s ≫ Eulerian 3.5 s (≈ bore e-fold 3.2 s, model-glsl.js:544): foam persists and advects, not flickering. Measured speed is a plausible blend of the bore front (4.03 m/s, mix(2.4,4.1,plunge) verified at :533) and the carrier-locked break band (5.4–6 m/s). |
| Walker reference | **TRUST** | h_b = H0/0.78, c = √(g·h_b): standard construction, GAMMA verified at model-glsl.js:97. |

## Fixes applied (all in scripts/capture_temporal.mjs)

1. **Sign inversion in the 2-D break geometry** (the one real math bug). The
   phase field is arg(C) = −w·t_b, so `gradComponent` returns −k, and the
   `dtdx = (kx + kz·dzdx)/w` chain inverted Vp_alongX and the
   down-point/up-point label. Now `kx = -gx.k, kz = -gz.k` with derivation
   comment. Validated live: post-fix kz = +0.0756 rad/m ⇒ shoreward carrier at
   5.5 m/s, agreeing with the independent control (+5.99); pre-fix it implied
   seaward. The fitPhase estimators were never affected (they negate via
   `speed = -w/slope`).
2. **Quality-tier pin**: `&q=high` appended to the hash unless `q=` present.
   `considerQuality` (main.js:215) rebuilds the water geometry when the rAF
   median exceeds 22 ms — a headless capture on a loaded box can trip that
   mid-sequence, a nonstationary background under the temporal-median residual
   (same failure class the drift guard refuses). verify-clock cannot catch this
   (3 frames < the 60-warmup + 90-window trigger).
3. **Advection linearity check** (lesson 3, parity with measure_cam.py):
   cross-shore lag now measured at frame separations 1/2/4; per-separation
   medians in `metrics.json` (`advectionBySeparation`) and the report.
4. **Removed an unsupported constant**: `ageWindow_s: 0.62*T` had no
   counterpart in the shader. Replaced with the verified bore window
   [0.18, 3.8] s of age (model-glsl.js:103-106, :543-544).
5. **Seaward-clip canary**: warns when >5% of break-line columns sit on the
   first covered z-row (31/216 = 14% on the live run). α/Vp are untrustworthy
   while it fires.
6. **Header line-number refresh** — all main.js references re-verified
   (rideMetric :1183, hash speed :1075, setSim :1108, u_time :837, drift
   :825-834/:93, controls.update :973).

`npm test` 25/25 after all edits; `--analyze-only` re-run confirmed the canary
fires on the saved budget frames. Capture output deleted after use.

## Recommended, not made

- **Autoframe swash bias**: the brightness prescan aimed the rig at cz = +120 m
  while the residual-measured activity centroid sat at z ≈ 9–39 m — the
  "most seaward bright cluster" heuristic still landed ~100 m shoreward and
  caused the clip above. Fix direction: re-aim from a temporal-residual
  centroid of the first captured frames (two-pass), not prescan brightness.
  Left alone because changing the aiming heuristic deserves its own verified
  round and more frame budget than remained.
- **fitPhase unwraps over non-adjacent kept columns** (gaps after the median
  amplitude cut), which can alias when the true phase step across a gap
  exceeds π, biasing |slope| low (speed high) — plausibly part of the +148 m/s
  band-averaged outlier. Fix needs its own A/B since it moves both
  `zipper.phase` and the control.
- **Run the full-length sequences** (zipper 160 @ dt=0.4, cadence 260 @ dt=2)
  off-hours. Nothing in this review verifies the headline acceptance numbers;
  it verifies the instrument that will produce them.

## Scaffolding scan

Clean. No `TEMP|DEBUG|PROBE|XXX|HACK|FIXME` markers; every `console.log` is
legitimate CLI reporting; no dead flags (`--reload-each`, `--keep`,
`--analyze-only`, `--verify-clock` all reachable); PLAYWRIGHT_DIR resolution
(env override → psychodeli sibling install) matches the
capture_audit_matrix.mjs precedent.
