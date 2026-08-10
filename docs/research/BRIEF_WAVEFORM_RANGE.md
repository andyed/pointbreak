# Brief — widening the range of wave forms

**For an agent working on `pointbreak`. Analysis and formulation, not a
renderer rewrite.**

Repo: https://github.com/andyed/pointbreak · Live:
https://mindbendingpixels.com/pleasurepoint/

The model currently produces **one wave form with knobs on it**. We want it to
span the real taxonomy — and to do so in a way that is derived rather than
dialled, because the site now has measured bathymetry to derive from.

---

## 1. The architecture you are writing against

- **Kinematic, not a fluid solver.** No Navier–Stokes, no Boussinesq, nothing
  conserves mass or momentum. A phase travels along a break line and produces
  wave-shaped motion. A solver is out of scope; assume it stays that way.
- **One shared GLSL string** (`web/js/model-glsl.js`) spliced into two
  renderers — a raymarcher and a three.js displaced grid — so they cannot
  drift. `web-three/js/model-js.js` is a hand-maintained JS twin of the same
  math for CPU-side consumers (rider, cameras, the cross-section overlay).
  Anything you propose must be expressible as closed-form GLSL, or CPU-side
  behind a small uniform seam.
- **Real bathymetry.** NOAA NCEI 1/3″ DEM resampled per site to a 96×84 patch,
  sampled in-shader by `bedElevM()`. `depth = (MSL + tide) − bed`, with
  MSL−NAVD88 = 0.905 m from NOAA CO-OPS 9413450. Tide is bounded to the
  published excursion (−0.862…+0.764 m) and is a **level only** — no
  tide-generating forces, no tidal currents.
- **Coastline** from OpenStreetMap: a cubic fit `C_geo(x)` to the measured
  equal-elevation contour through each site's surf node.
- **Deliberate exaggeration:** heights are scaled ×3.2 (`VIS`) for landscape
  legibility. State explicitly whether each formulation you propose wants true
  or exaggerated scale — mixing them is how we shipped a bug where a viewing
  gain leaked into a breaking criterion.

## 2. What the model produces today, precisely

The free surface is a **sharpened raised cosine**:

```glsl
c01 = max(0.5 + 0.5*cos(theta), 0.0);
h   = amp * (pow(c01, q) - 0.5/q) * 2.0;      // the -0.5/q is rough mean removal
q   = 1.6 + 3.2*exp(-|d|/55) * (0.6 + 0.5*xi) // d = distance to the break line
theta = w*t - k*(z + coastCurve(x));  LAM = 90 m
```

plus, near breaking, a phase skew `theta -= skew·sin(theta)` for forward pitch,
and Tessendorf choppy horizontal displacement (`xy += λ∇h`) pushed past the
cusp limit at the pocket to fold a lip.

Amplitude comes from Green's law `Ks = √(cg₀/cg)`, `cg = √(gh)`, capped by
depth-limited breaking `H = min(H₀·Ks, γh)`, γ = 0.78 (McCowan).

**Be blunt about this in your analysis:** `pow(cos, q)` is not a wave. It is a
crest-sharpening hack with no derivation. It is symmetric about the crest by
construction, its mean removal is approximate, and `q` is fitted by eye. It is
the single largest piece of unearned physics in the model.

Other knobs: `σ` section noise (early-breaking patches), `Δf` two-component
beat for sets/lulls, `chop`, and an A-frame fold (`abs(x)`).

## 3. What that cannot express

1. **Shallow-water wave forms.** Real shoaling waves progress
   sinusoidal → Stokes (skewed: peaked crest, flat trough) → cnoidal (long flat
   troughs, isolated peaks) → solitary. We have none of these; we have a
   power-of-cosine. The organising parameter is the **Ursell number**
   `U = H·L²/h³`, which decides *which family applies where* — and we now have
   `H`, `L` and `h` everywhere, so it is computable per point.
2. **The full breaker taxonomy.** ξ nominally selects breaker type, but only
   spilling and plunging are represented, as a blend. Collapsing and surging
   (Battjes: ξ ≳ 3.3) do not exist. Sharks and Privates at low swell should
   plausibly surge; they cannot.
3. **Skewness vs asymmetry as separate quantities.** These are distinct and
   separately measurable in the literature: vertical skewness (crest peakiness)
   and horizontal asymmetry (forward pitch). We conflate them into `q` plus one
   ad-hoc skew term.
4. **Spectral width.** Sets come from exactly two beating components. Real
   spectra have a width and a directional spread; narrow-band and broad-band
   seas look and break differently.
5. **Crossing swells.** No wave–wave interaction, so no wedging peak where two
   trains meet — a real and visually distinctive form.
6. **Cliff rebound.** Pleasure Point has a cliff and a rock platform; backwash
   and reflection off it are absent.

## 4. What we want from you

1. **A waveform family selected by Ursell number.** Propose a closed-form
   surface that transitions sinusoidal → Stokes → cnoidal as `U` rises, with
   the crossover criteria stated and cited. Cnoidal theory needs Jacobi
   elliptic functions; say honestly whether a usable approximation exists in a
   fragment shader, or whether this wants a small lookup texture (we already
   bake one for the seabed, so that pattern is available and cheap).
2. **Skewness and asymmetry as derived quantities**, not knobs — driven by the
   local `H/h` and bed slope. There is empirical literature on how both evolve
   through the shoaling zone; anchor to it.
3. **The full breaker taxonomy across ξ**, including collapsing and surging,
   with what each does to the *surface*, not just to the foam.
4. **Spectral width as a parameter.** What minimal change turns the
   two-component beat into something with a width — and what does that do to
   set structure and to the peakiness of individual waves?
5. **Rank the list by (visual payoff ÷ implementation cost)** given a
   closed-form kinematic model. We would rather ship two derived forms than six
   dialled ones.

## 5. Constraints

- **Verified citations only.** The repo's standing rule. We already build on
  Walker (peel angle), Mead & Black (bathymetric components), Hutt (skill
  bands), Battjes (Iribarren thresholds), McCowan (breaker index). Do not
  invent references or page numbers; if you are unsure a paper says a thing,
  say so.
- **Separate physics from legibility cheats.** We publish a "What it does not
  model" list and intend to keep it accurate. Anything that is a fudge should
  be labelled a fudge in your text, so it can be labelled one in ours.
- **Derived beats dialled.** The project's whole claim is that the seabed
  decides the wave. A parameter the user sets is a last resort; a quantity
  computed from `h`, `∇h`, `H` and `T` is the goal.
- **Watch the shared-GLSL constraint.** Both renderers splice the same string.
  A change to the surface function changes the raymarcher too, and the JS twin
  must be updated in lockstep or CPU and GPU silently disagree.

## 6. Known adjacent defect — do not trip over it

The amplitude envelope does not follow the break line. `grow` only boosts
seaward of `zb` (`max(d,0)`), so the model's tallest water does not sit where
depth says the wave breaks. Measured at Sewers: face height under the rider
averages 1.03 m against 5.27 m available at the same station. A part-built
emergent break line sits behind `?m4=1` (see `docs/WEB_THREE_SPEC.md` §M4).

This is being fixed separately. Your waveform work should assume it will be —
i.e. assume `zb` will eventually be where the wave actually breaks — but do not
depend on it landing first.

## 7. Deliverable

A markdown analysis for `docs/research/`, containing:

- the proposed surface formulation, explicit enough to implement
- the Ursell/ξ regime map that selects between forms
- per-item cost estimate against the constraints above
- **what would falsify each proposal** — the model is unvalidated, and we are
  trying to add forms that could be *shown wrong* rather than merely tuned
