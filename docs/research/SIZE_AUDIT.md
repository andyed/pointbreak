# Size audit — where wave height gets normalized away (2026-08-11)

Delegated read-only sweep of both renderers, prompted by the screensaver
mission's #1 item ("as the waves get bigger, we should get a curl and crash").
Question: where does H₀ fail to reach a visually-scaling term? Findings are
file:line as of commit a0185fa; ✅ marks items fixed the same day.

## Master finding

`web/js/model-glsl.js` — `growGeo = min(Hsh, Hlim)/max(u_H0, 0.05)` is later
consumed as `amp = 0.5*u_H0*growGeo*…`, so wherever depth-limited breaking wins
(`Hlim = γ·dep`), **u_H0 cancels exactly**: the surface height inside the surf
zone is `0.5·γ·dep` — H₀-independent — on the shipped path of all six mapped
presets. Physically defensible (depth-limited breaking is real) but it is the
root cause: a 0.7 m and a 2.5 m day produce literally the same surface
shoreward of the line, and every downstream visual reads that surface.

**Consequence:** until M4 lets the breaking locus move seaward into deeper
water (where `Hlim = H₀` at the natural break depth), size CANNOT buy face
height at the fixed line. Size must enter through gates instead — which is what
the same-day fixes do.

Two derived terms were worse than invariant — **inverted** (smaller swell →
bigger value), both from dividing an H₀-free `h` by `u_H0`:

- ✅ `web-three/js/shaders.js` `hN = h/(u_H0*VIS)` → throw/drop were *larger*
  on a 0.7 m day. Fixed: violence in metres (`hM = h/VIS`), calibrated to the
  1.5 m model card.
- `web-three/js/shaders.js` `hMean = vWorldPos.y/(u_H0*VIS)` — backlit-crest
  SSS glow dimmer on bigger swell. **Open.**

## Fixed 2026-08-11 (same session)

1. ✅ Curl overturn: `S = lam·a·k²` cusp form (see correction below), size
   entering via breaking excess (`sizeGate = clamp(Hsh/Hlim, 0, 1.5)`, mix'd
   by `u_depthMix`). At the fixed line excess scales ~linearly with H₀
   (≈0.6 / ≈1.1 / 1.5-clamped at 0.7 / 1.5 / 2.5 m).
2. ✅ Throw/drop in metres (above).
3. ✅ Sound: crash gain never read H₀ at all — `sizeAmp = 0.45 + 0.55·min(H₀/1.5, 2)`.

## Open, ranked by visual impact for "bigger crashes harder"

1. **Foam block is entirely H₀-free** (`model-glsl.js` streaks/lace/impact/
   bore/trail terms, and both vehicles' foam whitening) — whitewater amount,
   extent and brightness identical at every size. Highest-impact remaining item.
2. **`breakerLifecycleAtX`** — the canonical "how hard did it crash" number
   (impact/bore) is ξ- and envelope-gated only; no H₀ term. Feeds mound, foam
   bands, spray pass.
3. **Spray count/opacity/size** — launch *height* scales with H₀ (correct);
   droplet count (5200 fixed), point size and alpha do not.
4. Bore front width/speed fixed metres (`frontSpeed = mix(2.4, 4.1, plunge)`;
   physically bore celerity ≈ √(g·h)).
5. Crest peakedness `q` is ξ/distance-only; real sharpness rises with a·k ∝ H.
6. SSS `hMean` inversion (above); lip white paint, lipFoam, crumb — ξ-only.
7. Minor: 20 m absolute offset clamp; sound 15 m reference distance; raymarcher
   height tint saturates at h ≈ 3.4 m.

## Correction to the 2026-08-10 curl claim

Commit a0185fa asserted "Q = lam·k, and Q = 1 is the cusp." **Wrong** — the
derivation was amplitude-blind. For `off = lam·∇h` on `h = a·cos(kx)`,
`dx/dx₀ = 1 − lam·a·k²·cos`, so the cusp is

    S := lam · a · k² = 1        (not lam·k = 1)

With displayed amplitude a ≈ 7 m, a·k ≈ 0.49: the "Q = 1.13" measured that day
was S ≈ 0.55 — never cusped, which is exactly what the screen showed (sharpen,
then round over). Fixed by parametrizing the shader in S directly and solving
`lam = S/(a_local·k²)` from the local displayed amplitude: the cusp is reached
at S = 1 by construction, at any amplitude. A second consequence of the master
finding closed at the same time: since `a` was H₀-free inside the break,
`Q·a·k` was size-invariant by that route too.

The audit also notes `LAM = 90` is itself a fixed constant independent of T and
H₀ — that is M6 part 3 (wavelength shoaling), still the live item.

## Critique pass (muriel-critique delegate, same day) — NEEDS REVISION

Six-capture before/after sweep graded against a Surfline-cam standard. Credits:
violence now monotonic 0.7 → 1.5 → 2.5 (before set was flat-to-inverted), the
before-2.5 paper-ribbon crest and its white polygon artifact are gone. Findings:

1. **HIGH, fixed same day:** the metre-calibrated drop kept the old QUADRATIC
   form (1.55·hM²) — ~7.5 m of crest drop on a 2.5 m day, so the big face
   subtended barely more screen than the 1.5 m one. A fall distance scales
   like the height, not its square; now 3.0·hM, same value at the 1.5 m card.
2. **HIGH, pre-existing (crash-system scope, not this change):** spray columns
   render as bead-strings floating above the crest, unattached to any lip —
   present in the before set too. Needs ballistic arcs from the peel point and
   a crest-relative kill ceiling.
3. **HIGH, resolved as semantics:** before-1.5 didn't break where after-1.5
   peels. DECISION: the 1.5 m anchor pins GEOMETRY (crest position/height —
   which match within pixels), not appearance. The old S never cusped, so
   before-1.5's non-breaking was the bug itself; after-1.5 expressing the fold
   is the fix working, and the critique judged it "the most believable capture
   in the set."
4. MEDIUM/LOW, queued: lip is an opaque unfeathered teal tube (needs
   foam-white blend along the crest edge by excess + impact foam at the
   landing line); foam sheet edges polygonal, no age gradient; onion-ring
   banding on the overturn (tessellation); no wind texture at size.
