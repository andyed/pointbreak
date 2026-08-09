# Zipper — GLSL-ready parametrization

The break layer from `docs/MODEL.md` §2, reduced to shader form. Written as a
fragment-shader field function so it drops into a GLSL TOP (TouchDesigner) or a
WebGL fragment shader unchanged. No textures required for v0; everything is
closed-form.

## Coordinate frame

Work in "line space": `u` runs along the wave crest (the direction the zipper
travels), `v` runs shoreward (the direction the wave travels). One wave = one moving
band in `v`; the zipper is a moving point in `u`.

```glsl
// ---- uniforms (the model card) ----
uniform float u_time;
uniform float u_period;        // T, seconds (12-15 groundswell)
uniform float u_peelAngle;     // alpha, radians (0.5..1.3; ~1.0 = Second Peak)
uniform float u_iribarren;     // xi0, barrel-ness (Battjes: <0.5 spill, 0.5-3.3 plunge)
uniform float u_sectionNoise;  // sigma_h (0 = Cowell's, 1 = the Slot)
uniform float u_groupDf;       // delta-f for set beating (~0.006 Hz)
uniform float u_foamDecay;     // tau, seconds (~5)
uniform float u_aframe;        // 0 = point break, 1 = Middle Peak event
```

## Wave train with sets

Two beating components give free groupiness (MODEL.md §2 "Sets"):

```glsl
float f0 = 1.0 / u_period;
// group envelope in [0,1]; period 1/df (~2-4 min). Waves inside a set share it.
float setEnv(float t) {
    return 0.5 + 0.5 * cos(6.2831853 * u_groupDf * t);
}
```

Each wave n launches at t_n = n·T with amplitude scaled by `setEnv(t_n)`; waves
below a threshold amplitude simply don't break (the lull).

## The zipper phase

For a wave launched at t_n, the breakpoint position along the crest:

```glsl
// c: crest-normal phase speed (units of line-space/sec, tune visually).
// peel speed derives from peel angle: Vp = c / sin(alpha)
float zipperU(float t, float t_n, float c) {
    float Vp = c / max(sin(u_peelAngle), 0.05);   // alpha->0 guard: closeout
    return Vp * (t - t_n);                        // breakpoint travels +u
}
```

A-frame mode (`u_aframe = 1`): two zippers from apex u=u0, at ±Vp — i.e. use
`abs(u - u0)` in place of `u` everywhere below. That single substitution is the
entire Middle Peak implementation.

## Sections

1-D noise along the crest; where it exceeds a threshold the wave has already broken
regardless of zipper arrival:

```glsl
float sectionBroken(float u, float wave_id) {
    float n = noise1(u * 3.0 + wave_id * 17.0);   // any cheap value noise
    return step(1.0 - u_sectionNoise * 0.5, n);    // 1 = broke early here
}
```

## The field: three zones per fragment

For a fragment at (u, v) relative to the current wave's crest:

```glsl
// s < 0: this point on the crest not yet broken (ahead of zipper)
// s > 0: broken s/Vp seconds ago (behind zipper)
float s   = u < zipperU(t, t_n, c) ? 1.0 : -1.0;
float age = abs(u - zipperU(t, t_n, c)) / Vp;      // seconds since/until break

// ZONE 1 — green face (ahead): steepness ramps as break approaches.
//   Drive a Gerstner-style sharpness Q: Q = mix(Q_deep, Q_cusp, exp(-age/ramp))
// ZONE 2 — the pocket (|u - zipperU| small): peak intensity.
//   Iribarren shapes it: lip throw ~ smoothstep(0.5, 1.5, u_iribarren)  // Battjes spill/plunge boundary
//   Pocket width ~ 1/sin(alpha) (fast peels have long sections working at once)
// ZONE 3 — whitewater (behind): foam = exp(-age / u_foamDecay), advected +v.
```

The visual signature lives in the **pocket traversal**, not the water shading:
render this three-zone field as pure abstraction (Psychodeli idiom) and it still
reads as a peeling wave.

## Composition over a substrate

The zipper layer is substrate-agnostic:

- **v0 (proof of read):** flat colored field, zones only. Does the zipper read?
- **v1 (TD):** composite over the FFTOcean .tox height/normal output; zipper
  modulates displacement amplitude (face), sharpness (pocket), and a foam mask
  (whitewater) fed to the substrate's shading.
- **v2 (web/Psychodeli):** same field warps the fractal domain — face = domain
  steepening, pocket = intensity locus, foam = brightness/turbulence decay.

## Tuning invariants

- Guard `sin(alpha)` — alpha→0 must produce a *closeout* (whole line breaks in a
  frame), not a NaN. `isFinite` discipline as usual.
- Ride duration = crestLength/Vp should land in 30–60 s at Second Peak settings.
- Foam integral: with T≈14 s and tau≈5 s, ~2.5 waves' foam coexists — that ratio
  (foam persistence vs wave spacing) dominates the "heavy day" feel.
- All time in seconds, scaled once by a global speed dial — never bake rate into
  constants (rate-independence rule, as in the main engine).
