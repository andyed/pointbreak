# The eikonal travel-time bake: a 2-D generalisation of the reverted Ψ table (2026-09-10)

**Status:** observation, recorded for the backlog. Nothing here is wired.
Read against `docs/MODEL.md` §2.4 and the kept-but-unused
`bed.js bakeRefraction` / `psiAt` / `zcAtPsi` / `incidenceAt`.

## Where it came from

`iamtechartist/ocean-simulation` (MIT, single `index.html`, Three.js, 2 stars,
3 commits; live at <https://iamtechartist.github.io/ocean-simulation/>). A
tropical-island FFT ocean, not a point break. One idea in it is the 2-D form of
something this project built in 1-D and reverted.

## What it does

`buildCoastalField()` solves the eikonal equation **|∇T| = 1/c(h)** over the
real bed once at load, on the CPU, and bakes the result to a texture the wave
shader reads every frame.

1. **Per cell, finite-depth celerity.** Newton on the dispersion relation
   ω² = g k tanh(k h) for a single design period (their T ≈ 7 s swell, k₀ =
   2π/78 m), five iterations, k floored at k₀. Slowness s = k/ω.
2. **Boundary.** Travel time is fixed on the upwave edges of the grid as the
   plane-wave arrival time for the deep-water direction. Land cells (bed above
   +1.8 m) are excluded from the solve, so waves cannot propagate through an
   island or an emerged rock.
3. **Solve.** Monotone Godunov upwind update, fast-sweeping over the four
   diagonal orderings, 8 cycles on a 384² grid, yielding one `await
   requestAnimationFrame` per cycle so the loader stays live. No influence
   mask: arrival wraps around both sides of a headland and diffracts into the
   lee because that is what the minimum-time solution does.
4. **Baked texel, RGBA.**
   - R: travel-time offset from the plane-wave reference, in metres of
     deep-water phase (`T·c₀ − reference`), clamped −10…800.
   - GB: ∇T normalised — the local propagation direction.
   - A: "exposure" — a 7-ray fan (±0.42 rad around the swell direction)
     marched 28 × 12 m upwave through the bed, energy killed by land and
     attenuated 0.87× per shallow step. Cove shelter and headland penumbra as
     a scalar, floored at 0.09 so diffracted arrivals keep some energy.
5. **Use.** The FFT stays the wave source. Its swell-cascade lookup coordinate
   is displaced along the deep-water direction by the R channel
   (`swellCoordinates(p) = p + dir · c.x`), and horizontal displacement is
   rotated into the local ∇T direction. So crests bend to follow the contours
   without the phase field itself changing form.

## Why it matters here

MODEL.md §2.4 records the 1-D version: Ψ(contourZ) = ∫k_z dz baked to a
256-sample table with the alongshore wavenumber conserved (Snell on straight
contours). It makes φ vary with depth properly and was **reverted** because the
rider, audio and JS twin all assume the constant-φ phase. §2.4's finding stands:
on straight, shore-parallel contours refraction *forgets* the deep-water angle
and guarantees a near-closeout, so the peel has to come from contour obliquity.

The eikonal bake is the version of that table that does not need straight
contours. Contour obliquity is in the bed, and the minimum-time field carries
it: the phase offset texel at Second Peak is the integral along whatever path
the reef actually imposes, headland wrap included. It is the only structural
route seen so far to "straight-in crests and a real peel at once" that does not
require inventing sub-grid relief.

## What it would cost, and what it would break

- A one-time CPU solve (tens of ms at 384², trivially cacheable per bed/tide
  bake) and one RGBA float texture. One texture fetch in the phase. No fluid
  solver, no FFT.
- **The same thing that reverted the 1-D table.** Every consumer of
  `rayPhase()` — the zipper closed form, `breakerLifecycleAtX`, the surfer,
  `sound.js`, `model-js.js` — assumes a plane-wave phase with one φ. A 2-D
  travel-time phase makes the crest a curve, and the zipper's `V_p = c/sin(α)`
  closed form has to become a march along that curve. That is the "1-D phase
  traveling along a 2-D curve" §2.4 already names; the bake does the curve
  part, not the march.
- The 7 m NCEI posts (and the CUDEM interpolant, `CUDEM_BED_2026-09-01.md`)
  are the bed it would solve on. Garbage contours in, garbage travel time out;
  the fast sweep is exact about a bed that is itself an interpolation over the
  surf zone.

## Placement

Not scheduled. It belongs after `NEXT_INVESTMENTS.md` rank 3 (finite-depth
set propagation) and would be a candidate mechanism for it, since finite-depth
travel time is exactly what the eikonal field is. Prerequisite is the rank 4
consumer unification, because the reason the 1-D table died was consumer
count, not the table.

Also noted from the same repo, not model-side and not recorded here: screen-
space extinction through scene depth, swash/wetness baked into the sand
material rather than a water sheet, and footprint-faded multi-scale foam
gating. Those are picture-side and handled in `web-three/js/shaders.js`.
