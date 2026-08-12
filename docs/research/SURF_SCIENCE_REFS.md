# Surf Science References for the Point-Break Model

Literature grounding for the simplified peeling point-break model: narrow-band swell +
planar shelf tilted at angle θ to swell direction → shoaling (Green's law) + refraction
(Snell) + break criterion (H/h ≈ 0.78) → breakpoint ("zipper") traveling along the crest
at peel speed Vp ≈ c/sin(α).

All citations below were verified against secondary sources (reference lists of Scarfe et
al. 2003/2009 reviews, publisher pages, USGS catalog) on 2026-08-09. Anything not
directly confirmed is flagged inline.

---

## 1. Peel angle and makeability — Walker (1974)

Walker's Look Laboratory work is the origin of the peel-angle formalism and the
"makeable wave" criterion. Peel angle α is the angle between the trail of broken
whitewater (the peel line) and the crest of the unbroken wave; α ∈ (0°, 90°], with
α = 0° a closeout.

Geometry: the crest advances at celerity c normal to itself. In steady peeling, the
breakpoint travels along the (stationary) peel line at ground speed

    Vp = c / sin(α)

since the peel-line velocity component normal to the crest must equal c. The component
along the moving crest is c/tan(α). A wave is *makeable* when the surfer's attainable
speed Vs satisfies Vs ≥ c/sin(α), i.e. α ≥ arcsin(c/Vs). Walker (1974a) put the
practical minimum peel angle for surfing near ~30°; later measurement work on surfer
speed limits is Dally (2001b) and Moores (2001).

**Citations (verified):**
- Walker, J.R., 1974a. *Recreational surfing parameters.* LOOK Laboratory TR-30,
  University of Hawaii, Department of Ocean Engineering, Honolulu, Hawaii. (~311 p.)
- Walker, J.R., 1974b. *Wave transformations over a sloping bottom and over a
  three-dimensional shoal.* Ph.D. thesis, Department of Ocean Engineering, University
  of Hawaii, Honolulu.
- Walker, J.R. and Palmer, R.Q., 1971. *The general surf site concept.* LOOK Laboratory
  TR-18, University of Hawaii, Honolulu. (Source of the peel-angle definition as "the
  included angle between the peel-line and a line tangent to the crest-line at the
  breaking point.")
- Dally, W.R., 2001b. The maximum speed of surfers. *J. Coastal Research*, SI 29, 33–40.

**Model mapping:** α is the emergent output of the shelf-tilt geometry (below); Vp is
the zipper's advection speed along the crest. Walker's ~30° floor and the c/sin(α)
divergence as α → 0 bound the playable/plausible range of θ.

---

## 2. Surfing-reef science — Mead & Black (2001), JCR Special Issue 29

The core corpus is *Journal of Coastal Research* Special Issue No. 29 (2001), K.P.
Black (ed.), "Natural and Artificial Reefs for Surfing and Coastal Protection."

**Citations (verified, with SI 29 page ranges):**
- Mead, S.T. and Black, K.P., 2001a. Field studies leading to the bathymetric
  classification of world-class surfing breaks. *JCR* SI 29, 5–20.
- Mead, S.T. and Black, K.P., 2001b. Functional component combinations controlling
  surfing quality at world-class surfing breaks. *JCR* SI 29, 21–32.
- Mead, S.T. and Black, K.P., 2001c. Predicting the breaker intensity of surfing waves.
  *JCR* SI 29, 51–65. (Widely cited as "Predicting the breaking intensity…"; the SI 29
  table of contents entry uses "breaker intensity.")
- Hutt, J.A., Black, K.P. and Mead, S.T., 2001. Classification of surf breaks in
  relation to surfing skill. *JCR* SI 29, 66–81.

### 2.1 Breaking intensity (Mead & Black 2001c)

From 28 world-class breaks: fit a cubic curve to the barrel cross-section ("wave
vortex"); the vortex length-to-width ratio is the best single indicator of breaking
intensity (lower ratio = rounder vortex = hollower, more intense wave). Regression
against the *orthogonal seabed gradient* — the bed slope measured along the wave
orthogonal (travel direction), not the beach-normal slope:

    vortex_ratio Y = 0.065·X + 0.821    (R² = 0.71)

where X is the orthogonal seabed gradient expressed such that steeper gradients give
lower vortex ratios (flatter bed → larger ratio → mushier wave; consistent with X as
the run of a 1:X slope — confirm against the original figure before hard-coding).
They classify intensity into medium / medium-high / high / very high / extreme bands,
and argue the Iribarren-type parameters are too coarse for surfing waves because they
lump all breaker types. Offshore wind raises effective intensity; onshore lowers it.

### 2.2 Bathymetric components taxonomy (Mead & Black 2001a, 2001b)

Seven components (note: seven, not six — *ridge* is often dropped in summaries), split
into **preconditioning** (ramp, focus, platform: align/shoal but don't break the wave)
and **breaking** (wedge, ledge, ridge, pinnacle):

- **Ramp** — large-scale seaward-dipping plane; refracts and organizes swell; no
  breaking on it.
- **Focus** — seabed ridge causing convergence: local peak in H, easier takeoff.
- **Platform** — flat plane; carries the preconditioned wave to the breaker component
  without further transformation.
- **Wedge** — planar component tilted at an angle to the favored orthogonal direction,
  shallow enough to break the wave; the main breaking component of most breaks; its
  orientation sets refraction and hence peel angle.
- **Ledge** — very steep wedge (gradient > 1:4) with a platform shoreward; little
  refraction; plunging waves; orientation critical.
- **Ridge** — focus-shaped but not convergence-oriented; locally steepens the bed →
  lower α, higher intensity for a section.
- **Pinnacle** — abrupt, small-area intensity spike; often defines the takeoff zone.

Common configurations: Ramp/Wedge, Ramp/Platform/Wedge, Ramp/Focus/Wedge,
Ramp/Ledge/Platform. Each component has a "favored orthogonal direction"; deviation
from it raises or lowers peel angle.

### 2.3 Peel-angle ranges vs. wave quality / skill (Hutt et al. 2001)

Hutt et al. revalidated Walker's beginner/intermediate/expert scheme as a 1–10 skill
rating from 28 world-class Pacific/Indonesian breaks, on peel angle + wave height
(heights capped at 4 m). Verified anchor values (full table: Hutt et al. 2001, 66–81):

| Rating | Surfer class                     | α (deg) | H (m)      |
|--------|----------------------------------|---------|------------|
| 1      | absolute beginner                | ≈ 90    | 0.70–1.00  |
| 2      | learner (whitewater→green waves) | ≈ 70    | 0.65–1.50  |
| 4–5    | standard maneuvers, consecutively| ≈ 55–46 | 0.5 – >4   |
| 6–7    | advanced (top amateur ≈ 29°)     | ≈ 45–29 | 0.4 – >4   |
| 8+     | professional / world-class       | ≈ 27–20 | 0.35 – >4  |

Rule of thumb from the same literature: 56–70° beginner waves, 46–55° intermediate,
20–45° fast waves for advanced surfers; world-class breaks concentrate α ≈ 30–60°.

**Model mapping:** the planar-shelf tilt θ directly controls α (for a plane shelf,
post-refraction crest-to-depth-contour obliquity ≈ α). Target α ≈ 30–60° for a
"Pleasure Point" feel; the breaking-intensity regression maps shelf steepness to the
barrel-vs-mush visual axis; components taxonomy justifies adding a local "ridge/focus"
bump to make sections.

---

## 3. Break criteria: McCowan, Green, Snell, Iribarren

Textbook chain (Komar 1998; Dean & Dalrymple 1991), all standard:

- Shallow-water celerity: `c = sqrt(g·h)`, group speed ≈ c.
- Green's law (shoaling on gently varying depth): `H ∝ h^(−1/4)`
  (from full linear shoaling `Ks = sqrt(Cg0/Cg)`, shallow-water limit).
- Snell refraction: `sin(θ)/c = const` → crests rotate toward depth contours.
- Depth-limited breaking (McCowan's solitary-wave limit): `H_b / h_b = γ ≈ 0.78`.

Breaker-type classification via the Iribarren number / surf-similarity parameter
(Iribarren & Nogales 1949; Battjes 1974):

    ξ0 = tan(β) / sqrt(H0 / L0),   L0 = g·T² / 2π

with Battjes' (1974) deep-water thresholds: **spilling ξ0 < 0.5, plunging 0.5–3.3,
surging/collapsing > 3.3** (breaker-referenced form ξb uses ~0.4 and ~2.0).

**Citations (verified via secondary sources — original texts not inspected):**
- McCowan, J., 1894. On the highest wave of permanent type. *Philosophical Magazine*,
  Ser. 5, Vol. 38, 351–358.
- Battjes, J.A., 1974. Surf similarity. *Proc. 14th Int. Conf. Coastal Engineering*
  (Copenhagen), ASCE, 466–480.
- Iribarren, C.R. and Nogales, C., 1949. Protection des ports. *XVIIth Int. Navigation
  Congress*, Lisbon, Section II-4, 31–80. (Page range not independently verified.)
- Komar, P.D., 1998. *Beach Processes and Sedimentation*, 2nd ed. Prentice Hall, 544 p.
- Dean, R.G. and Dalrymple, R.A., 1991. *Water Wave Mechanics for Engineers and
  Scientists.* World Scientific.

**Model mapping:** γ = 0.78 fixes the breakpoint locus (the zipper line) given the
depth field; ξ is the natural single dial for the "barrel vs. mushy" visual parameter —
low ξ → spilling foam rollers, mid ξ → plunging lip/vortex, with the caveat (Mead &
Black 2001c) that ξ under-resolves differences *within* the plunging class; use their
gradient→vortex-ratio regression for barrel shape once plunging.

---

## 4. Santa Cruz / northern Monterey Bay specifically

- Storlazzi, C.D., Barnard, P.L., Collins, B.D., Finlayson, D.P., Golden, N.E.,
  Hatcher, G.A., Kayen, R.E., and Ruggiero, P., 2007. *High-Resolution Topographic,
  Bathymetric, and Oceanographic Data for the Pleasure Point Area, Santa Cruz County,
  California: 2005–2007.* USGS Open-File Report 2007-1270, 23 p.
  https://doi.org/10.3133/ofr20071270 — bluff topography + inner-shelf bathymetry off
  East Cliff Drive (32nd–41st Ave, i.e. the Pleasure Point–Hook reach) plus wave/current
  measurements, collected for the seawall EIA. **The** primary bathymetry source for
  this model's shelf geometry.
- Storlazzi, C.D. and Wingfield, D.K., 2005. *Spatial and Temporal Variations in
  Oceanographic and Meteorologic Forcing Along the Central California Coast,
  1980–2002.* USGS Scientific Investigations Report 2005-5085. — wave climate
  (heights, periods, approach directions, seasonality) for the model's swell input.
- Storlazzi, C.D. and Griggs, G.B., 2000. Influence of El Niño–Southern Oscillation
  (ENSO) events on the evolution of central California's shoreline. *GSA Bulletin*
  112(2), 236–249. — episodic wave-climate extremes and S/SW approach events.
- O'Reilly, W.C., Olfe, C.B., Thomas, J., Seymour, R.J., and Guza, R.T., 2016. The
  California coastal wave monitoring and prediction system. *Coastal Engineering* 116,
  118–132. — CDIP/MOP spectral refraction transforms of offshore buoys to the 10-m
  contour; MOP points cover northern Monterey Bay and give realistic H/T/θ inputs.

Qualitative refraction picture (county EIR / USGS material, not a peer-reviewed surf
study): NW groundswell wraps around Point Santa Cruz and refracts into the
north-facing bay, arriving at Pleasure Point roughly from the S/SW with narrowed
directional spread — supporting the model's narrow-band, obliquely incident swell
assumption. **No peer-reviewed measurement of peel angle or breaking intensity at
Pleasure Point or Steamer Lane was found**; the closest scientific artifacts are the
USGS surveys above. (Raichle, A.W., 1998, Shore and Beach 66(2), 26–30, did numerical
surf prediction for Mavericks — nearest published surf-specific modeling in the region.)

**Model mapping:** OFR 2007-1270 justifies the "tilted planar shelf" reduction — the
Pleasure Point reach is a gently dipping mudstone shore platform; SIR 2005-5085 and MOP
set plausible (H0, T, θ) ranges per season.

---

## 5. Real-time simulation of breaking/peeling waves (graphics)

- Tessendorf, J., 2001 (updated 2004). Simulating ocean water. *SIGGRAPH Course
  Notes.* — FFT spectral height fields; the "choppy wave" horizontal displacement
  sharpens crests and self-intersects at incipient breaking (a cheap break indicator).
- Yuksel, C., House, D.H., and Keyser, J., 2007. Wave particles. *ACM Trans. Graphics*
  26(3) (SIGGRAPH 2007). — Lagrangian wave-front particles → height field;
  unconditionally stable, real-time; the closest published analog to advecting a
  "zipper" front along a crest.
- Thürey, N., Müller-Fischer, M., Schirm, S., and Gross, M., 2007. Real-time breaking
  waves for shallow water simulations. *Proc. Pacific Graphics 2007.* — detects steep
  fronts in a shallow-water height field, spawns connected-particle sheets for the
  plunging lip + spray/foam.
- Jeschke, S. and Wojtan, C., 2017. Water wave packets. *ACM Trans. Graphics* 36(4)
  (SIGGRAPH 2017). — Lagrangian packets carrying wave-group energy with correct
  dispersion, refraction over varying depth, and a shoaling/breaking heuristic.
- Jeschke, S., Skřivan, T., Müller-Fischer, M., Chentanez, N., Macklin, M., and
  Wojtan, C., 2018. Water surface wavelets. *ACM Trans. Graphics* 37(4) (SIGGRAPH
  2018). — wavelet-discretized wave field; real-time dispersion/refraction on large
  domains. (Author list beyond Jeschke/Wojtan verified only via publisher listing.)

**Model mapping:** the project's approach — analytic crest/zipper kinematics driving a
procedural surface — is closest in spirit to wave particles (front advection) plus a
Thürey-style lip/foam spawn at the breakpoint; Tessendorf choppy displacement remains
the cheapest crest-sharpening term for the unbroken wall.

### 5.1 Shipped implementations (prior art, not papers)

- **Storm Breakers** — Unity URP ocean package, CC0-1.0,
  https://github.com/Stormrider31/Storm-Breakers (106★ / 20 forks / 14 commits;
  open-sourced when the author went back to salaried work). Proprietary wave model,
  no cited literature; ships **breaking waves** with lip VFX, procedural splash audio,
  buoyancy, and shoreline demos. Read 2026-08-11.

  **Why it is the relevant precedent, and where it stops.** It is the closest thing to
  a commodity "breaking wave near a shore" substrate that actually shipped, and CC0
  means it can be read without licence entanglement — which is exactly the role the
  "don't rewrite deep-water ocean" rule reserves for a commodity package. But it breaks
  waves *as an effect*, on an authored shoreline, in a game engine. It has no measured
  bathymetry, no peel angle, no Iribarren number, and no notion of a break line whose
  position is set by depth. It cannot answer "where does this wave break at Pleasure
  Point," which is the whole question here. Useful for foam/lip/audio craft and for
  buoyancy-driven rider feel; not a source of wave kinematics, and not a substrate this
  project can adopt (wrong engine — see the parked-TouchDesigner note in CLAUDE.md for
  how vehicle choices get decided).

---

*Compiled 2026-08-09. Verification notes: JCR SI 29 titles/pages taken from the
reference list of Scarfe, B.E., Elwany, M.H.S., Mead, S.T., and Black, K.P., 2003,
"The Science of Surfing Waves and Surfing Breaks — A Review," Scripps Institution of
Oceanography Technical Report (eScholarship qt6h72j1fz), cross-checked against Scarfe,
Healy & Rennie 2009, JCR 25(3), 539–557.*

- **Celeris** — Tavakkol, S. and Lynett, P., 2017. "Celeris: A GPU-accelerated
  open source software with a Boussinesq-type wave solver for real-time
  interactive simulation and visualization." *Computer Physics Communications*
  217, 117–127. Preprint: arXiv:1611.05984. Code:
  https://github.com/SasanTV/Celeris — read 2026-08-11.

  Extended Boussinesq equations solved by a hybrid finite-volume /
  finite-difference scheme with moving shoreline boundaries, GPU-accelerated,
  faster than real time, validated against three standard non-breaking and
  breaking benchmarks. It is the existence proof for the option this project
  did NOT take: a phase-resolving solver in which shape, breaking, peel and
  direction are all outputs of one computation and therefore cannot contradict
  each other (MODEL.md §4.5).

  **Licence, and what that means here.** The code is **GPL-3.0**, C++/DirectX,
  no browser build, 19 stars, inactive. It cannot be vendored: GPL-3.0 would
  extend to the combined work and this repository's MIT half cannot be
  relicensed away (LICENSES.md). The *method* is a different matter — a
  published numerical scheme is not copyrightable, and implementing from the
  paper is clean where reading the source is not. If a solver is ever wanted
  here, the path is the paper, not the repository.
