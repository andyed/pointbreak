# Surf Science References for the Point-Break Model

Literature grounding for the simplified peeling point-break model: narrow-band swell +
planar shelf tilted at angle θ to swell direction → shoaling (Green's law) + refraction
(Snell) + break criterion (H/h ≈ 0.78) → breakpoint ("zipper") traveling along the crest
at peel speed Vp ≈ c/sin(α).

All citations below were verified against secondary sources (reference lists of Scarfe et
al. 2003/2009 reviews, publisher pages, USGS catalog) on 2026-08-09. Anything not
directly confirmed is flagged inline.

---

## 1. Peel angle and makeability — Walker (1974a)

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

## 2. Surfing-reef science — Mead & Black (2001a/b/c), JCR Special Issue 29

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
(heights capped at 4 m).

**CORRECTED 2026-08-13.** The table that stood here carried four wrong values and a
mislabelled column, and the "world-class ≈ 30–60°" rule of thumb below it could not be
sourced at all. Re-read verbatim from Hutt, J.A., Black, K.P. & Mead, S.T. (2001),
*J. Coastal Research* SI 29, 66–81 (JSTOR 25736206), as reproduced in full in
Barlow, M. (2013), PhD thesis, Leeds Beckett Univ., Table 1.1, p.12
(eprints.leedsbeckett.ac.uk/id/eprint/592):

| Rating | Description                                              | **peel angle LIMIT** (°) | min/max H_b (m) |
|--------|----------------------------------------------------------|--------------------------|-----------------|
| 1      | beginner, not yet able to ride the face                  | 90          | 0.7 / 1.00  |
| 2      | learner, rides laterally along the wave                  | 70          | 0.65 / 1.50 |
| 3      | can generate speed by "pumping"                          | 60          | 0.60 / 2.50 |
| 4      | begins standard manoeuvres on occasion                   | 55          | 0.55 / 4.00 |
| 5      | standard manoeuvres consecutively, single wave           | 50          | 0.5 / >4.00 |
| 6      | standard consecutively; advanced on occasion             | 40          | 0.45 / >4.00|
| 7      | top amateur, consecutive advanced manoeuvres             | 29          | 0.4 / >4.00 |
| 8      | professional surfers                                     | 27          | 0.35 / >4.00|
| 9      | top 44 surfers                                           | *not reached* | 0.3 / >4.00 |
| 10     | surfers in the future                                    | *not reached* | 0.3 / >4.00 |

What was wrong, and why it matters:

- Rating 5 is **50**, not 46; rating 6 is **40**, not 45; rating 3 (**60**) was missing
  entirely; and **there is no 20** — ratings 9–10 read "not reached", i.e. waves not yet
  surfed by the world's best. The 46/45/20 figures look like band-edge interpolations of
  the "20–45 / 46–55 / 56–70" bins that circulate on secondary web pages, not anchors.
- The column is a **limit**, not a typical value: the *minimum* α a surfer of that skill
  can negotiate. A rating-2 surfer needs α **≥ 70°**. A break is NOT "a rating-2 break"
  because it measures 70°. The old header (`α (deg)`) invited exactly that misreading,
  and the model's authored targets appear to have inherited it.
- **"World-class breaks concentrate α ≈ 30–60°" is WITHDRAWN — unsourceable.** The
  literature points the other way: Mead, S.T., Black, K.P., Green, M., Hume, T.M.,
  Hutt, J.A. & Sayce, A. (1997), *High seabed gradients and **low** peel angles produce
  world-class surfing breaks*, NZ Marine Science Society Annual Conf., Univ. of Auckland.
  Also "low angles creating fast surfing waves and high angles creating slow waves"
  (Scarfe, Elwany, Mead & Black 2003, Scripps Tech. Rep., 3–4) and "high peel angles do
  not necessarily prevent surfers from riding waves, whereas low peel angles do"
  (Scarfe, Healy & Rennie 2009, *JCR* 25(3), 545). Reconciliation: α must clear a
  **floor** (~30°, Walker 1974) to be surfable; **quality** sits at the low end of the
  surfable band. The withdrawn rule of thumb conflated floor with optimum.

### 2.3.1 Measured peel angles at real point breaks — the evidence is one series

Searched 2026-08-13, two independent sweeps plus first-hand full-text greps of the
primary PDFs. **No measured peel angle exists — peer-reviewed or grey — for Pleasure
Point, Steamer Lane, The Hook, 38th, Sewer Peak, Cowell's, or any Santa Cruz break.**
The negative is positively supported, not a failed search:

- **Storlazzi et al. (2007), USGS OFR 2007-1270** — the Pleasure Point survey this
  project already leans on (§4): **zero occurrences of "peel"**. It does contain a
  14 m wave gauge and a shore camera under *"Subtask 2.2 — Spatial and Temporal
  Variation in Breaking Wave Patterns"*, but reduces breaking to timex/variance
  imagery; no break-line orientation is ever computed.
- **Save The Waves / Integral / Black Surf Santa Cruz (2025)**, *Climate Vulnerability
  of California's Natural Surfing Capital* (31 SC breaks): exactly one occurrence of
  "peel" — the list item `m. Peel Angle` inside a *recommended contents template* for
  future assessments. Not a value, not attached to a break.
- **Atkin, Reineman, Reiblich & Revell (2020)**, *Shore & Beach* 88(2), names Steamer
  Lane and argues California breaks still *lack* quantitative baselines, citing peel
  angle only as something baseline studies "are to establish".
- **California Coastal Commission (2008)**, Revised Findings A-3-SCO-07-015 (the
  Pleasure Point seawall) imposes a permanent legal *Surf Monitoring* condition for
  "wave breaking patterns" — specified only as "wave height, period and wave break
  **character**". The one enforceable long-run Pleasure Point wave-monitoring mandate
  has no geometric metric attached.
- Tellingly, **Integral Consulting** advertises automated peel-angle extraction
  ("Automated peel angle analysis from wave path extraction", integral-corp.com Surf
  Science) and **did** apply it at **Topanga Point** — Integral Consulting Inc. (2023),
  *Topanga Surf Quality Impact Assessment Report*, Nov 10 2023, Appendix B of M&N's
  *Shoreline Morphology Analyses* in the Topanga Lagoon Restoration DEIR appendices
  (SCH 2022050478). XBeach 2D nonhydrostatic, 5 ft grid, 35 min per scenario, α
  computed for every breaking wave and reported as an alongshore profile. **Modelled,
  and validated only qualitatively against a surfer focus group** — so it is not a
  measured α and does not break the negative above. Full extraction, method, and the
  section-averaged α table: [TOPANGA_PEEL_ANGLE_2023.md](TOPANGA_PEEL_ANGLE_2023.md).
  The same firm was later a named technical partner on the Santa Cruz study above,
  whose vulnerability metric is **surfability — "percentage of time with surfable
  conditions in daylight hours"**, an availability scalar with no geometry in it, and
  peel angle appears once as a line item in a template for *future* assessments.
  Two studies, two questions: an availability scalar is the right instrument for a
  climate-vulnerability assessment, and that assessment answered its own question.
  What follows for this project is narrower and forward-looking — **the technique is
  proven on this coastline; it has not yet been pointed at this reef.**

Mead's own California leg (May/June 1998; Mead 2000 PhD, Waikato) surveyed El Capitan,
Fort Point, Rincon Point, The Wedge and Ventura Point — meso-scale components plus
*qualitative* descriptors only (Rincon: "low to moderate steepness, slow to moderate
peel"), **no numeric peel-angle column for any break**. Fort Point, ~120 km north, is
the nearest surveyed break to Santa Cruz. *(Break list is second-hand at moderate
confidence; the "no numeric α" finding is consistent with both Scarfe reviews, which
were verified directly.)*

**The opening this leaves — inventoried from the report itself, 2026-08-13.** An
earlier draft of this section claimed OFR 2007-1270's imagery was "precisely the input
class consumed by Wave Peel Tracking" and sat in "already-public archives". **Both
halves were wrong**; the report was then read directly. What it actually holds, from
its Table 2 and §Subtask 2.2:

| product | count | scenes | what it is |
|---|---|---|---|
| digital stills, 8 MP | **30,317** | Hook, 38th, Jack's, PP 3rd peak, PP 1st peak (3,027 each), plus zooms, two composites, one panoramic | instantaneous frames |
| video "time averages" | **12,744** | s5 PP 1st peak, s18 PP 3rd peak, s23 38th–Jack's, s32 Hook–38th | timex **and** variance, each from ~3,000 frames at 5 Hz over a **10-minute** window |

Collected late spring 2006 → late spring 2007.

**Why WPT is the wrong method here.** Wave Peel Tracking (Thompson, Zelich, Watterson &
Baldock 2021) and the CNN breakpoint+crest detector (Atkin, McIntosh & Bryan, ICCE 2022)
both consume a *frame sequence* — they track a breakpoint through time. The archived
video products are 10-minute **averages**; the raw 5 Hz frames are not among the
described products. A timex cannot yield a peel angle, because the peel is kinematic and
the averaging has integrated it away.

**What each product can actually deliver:**

1. **Stills → peel angle, one frame at a time.** A rectified oblique still shows the
   whitewater boundary *and* the unbroken crest simultaneously, and α is the angle
   between them at the breakpoint — the original Walker/Palmer definition, measurable
   without any time series. This is close to how Mead (2000) checked Bingin against
   aerial photography. 3,027 stills at First Peak alone, and the same again at four
   other named breaks. Rectification needs camera pose and ground control; the report's
   own terrestrial and airborne lidar of the bluffs supplies the control points.
2. **Timex + variance → mean breaking position**, which is what the model's
   `H₀Ks ≥ γh` locus actually predicts. This is a *closer* match to what the model
   computes than peel angle is, and it is the "compare breaking position against an
   independent estimate" of TODO Phase 3. The report notes the variance images
   delineate the surf zone even where sun angle defeats the timex (its Fig. 14).
3. **AWAC in 14 m water → contemporaneous forcing.** Wave height, period and direction
   every 20 min alongside the imagery, so frames can be binned by *measured* conditions.
   That is the difference between a validation and an anecdote.
4. **SEA SWATHplus 234 kHz interferometric swath bathymetry + lidar → the resolution
   problem.** This model runs on the NOAA NCEI 1/3 arc-second DEM (~10 m posts), and
   this project's own conclusion is that 10 m cannot resolve the 6° contour-to-crest
   angle that sets the peel. A dedicated swath survey of this reef is far finer. It may
   show that the reef the model cannot find is simply below the DEM's resolution.

**The access caveat that governs all of it.** The OFR is a 23-page *description*. Its
front matter reads: "For data files described in this report, please contact: Dr. Curt
D. Storlazzi (Project Chief), USGS Pacific Science Center, 400 Natural Bridges Drive,
Santa Cruz, CA 95060." The imagery was posted to the web live in 2006–07 for county
agencies; that service is long gone. So this is **a data request to a USGS lab 3 km from
the break**, not a download. Nothing here is blocked — but "already public" was wrong.

One convenient alignment: the survey's vertical control came from NOAA CO-OPS tide
station **9413450 (Monterey)** — the same station this model extrapolates its
MSL − NAVD88 = 0.905 m datum from. Any comparison inherits one datum assumption rather
than two.

The one published per-wave series at a point break — Raglan "The Ledge", NZ, one ride,
30 July 2001, α at 1 s intervals (Scarfe 2008 PhD, Univ. of Waikato, Table 2-3 p.44,
from Scarfe 2002a MSc; reproduced as Fig. 12 in Scarfe, Healy & Rennie 2009):

| t (s) | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
|-------|---|---|---|---|---|---|---|---|
| α (°) | 0 | 48 | 50 | **69** | 22 | **69** | 45 | 30 |

Method caveat that matters here: the breakpoint locus is measured (photogrammetric
rectification of 1 fps oblique video) but the **crest orientation comes from a refraction
model** — the authors hedge it as "22° to 69° *in the modelled scenario*". Every
published α for a natural break shares this hybrid character.

Read it for structure, not for a mean: **69° occurs twice in eight seconds, as the
escape section that lets the surfer out of a barrelling closeout**, alternating with
22–30° sections. Non-closeout mean ≈ 48°. **No point break is documented anywhere with
a sustained mean α above 55°.**

Two further calibration points, both modelled rather than instrument-measured:

- **Bingin, Bali** — ~**35°** along the wedge, **40–55°** in the take-off zone
  (Mead 2000 PhD, WBEND refraction model cross-checked against aerial photos). A
  world-class Indonesian reef point sits in the 35–55° band.
- **Scarfe, Healy & Rennie (2009)**'s only numeric α is a worked figure example at
  **~52°**, which they gloss as "fast but surfable". Worth sitting with: the number
  our bank assigns to Second Peak (58) is *above* the value the review literature
  uses to illustrate a fast wave. A much larger instrument-measured dataset exists — Manu
Bay, Raglan, ~1.6 M breakpoint+crest pairs, 2017–2020, the first work to detect both
directly from imagery (Atkin, McIntosh & Bryan, ICCE 2022) — but it defers all numbers
to Atkin (2021), Proc. 25th Australasian Coasts & Ports Conf., which is not obtainable
online. That is the highest-value missing document for this project.

The only literature hook for a *deliberately* high-α wave: "long boarders desire waves
with higher peel angles and lower breaking intensities than short boarders" (Scarfe et
al. 2003, 2) — qualitative, no numbers.

**Consequence for this model's acceptance framing.** The bank authors **one α per
spot** and the acceptance test compares a single derived number against it. The only
measured point-break series has α running 0 → 48 → 50 → 69 → 22 → 69 → 45 → 30 within
**eight seconds of one ride** — a range wider than the entire spread of this project's
seven authored targets, inside a single wave. Two things follow. First, a spatially
varying α along the stage is what a real point break does, so the "dead down-point
third" measured on Second Peak / Jack's / Sharks (`WEB_THREE_SPEC.md`, "Where the peel
actually lives") is not prima facie a defect — the Raglan series opens at α = 0, a
closeout. Second, a scalar target is the weaker instrument: the honest comparison is a
**distribution** over the stage, not a median against one number. That is a cheap change
to the acceptance test and it should precede any further reef-shape work.

**Model mapping (revised 2026-08-13).** The planar-shelf tilt θ controls α (for a plane
shelf, post-refraction crest-to-depth-contour obliquity ≈ α). A defensible target band
is **~30–50°**, above Walker's ~30° surfable floor and consistent with the only measured
point-break series; the breaking-intensity regression maps shelf steepness to the
barrel-vs-mush axis; the components taxonomy justifies a local ridge/focus bump for
sections. Targets in the high 50s–70s are **learner-grade on the Hutt limit scale and
unsupported by any measurement** — see `WEB_THREE_SPEC.md` "The reef-shape sweep" for
the measured consequence: this project's own wedge saturates at ~45°.

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

- **Ocean Community Next Gen** — Unity ocean shader package, **BSD 3-Clause**,
  https://github.com/eliasts/Ocean_Community_Next_Gen (1.1k★ / 173 forks / 101
  commits; last commit **2020-05-19**, inactive). Lineage: the 2009 Unity forum
  community ocean shader → HeadHunter → Laurent Clave (mobile + boat physics) →
  Elias Tsiantas (optimization pass, shader LODs, editor rewrite). Read
  2026-08-11.

  **This is the commodity substrate, named.** `Ocean.cs` is a Tessendorf-style
  **IFFT over a Phillips spectrum** — `P_spectrum(vec_k, wind)` with the usual
  `L = |wind|²/g` fetch scale, `Fourier.FFT2(..., FourierDirection.Backward)`
  for the surface and a second transform for the choppy displacement, animated
  by `√(g·k)·t`. That is exactly the "FFT deep-water ocean … Tessendorf-style
  IFFT or a Gerstner sum" that MODEL.md §6 nominates as the substrate half of
  the layering, and exactly what CLAUDE.md's "don't rewrite deep-water ocean"
  rule points at. It is a good, well-optimized instance of the commodity thing.

  **Deep water only, and that is structural, not an omission.** The dispersion
  is `ω = √(gk)` — no `tanh(kh)` — so there is no depth in the model at any
  point. No bathymetry, no shoaling, no refraction, no breaking. `hasShore`,
  `shoreDistance`, `shoreStrength` are shader-side blend/foam near a shoreline,
  not physics: they fade the surface, they do not change the wave. Everything
  MODEL.md §1.1–§1.3 builds on begins where this package ends. It confirms the
  layering thesis rather than competing with it — the break layer is the
  contribution precisely because packages like this one already solve the other
  half well and stop cleanly at the surf zone.

  **But §6's substrate hook is now in tension with §4.5, and this is what makes
  that visible.** §6 was written when the plan was to composite the zipper over
  a bought-in surface. Since §2.2/§2.3 the water is not a composite: `web-three`
  displaces a grid from the shared model, and §4.5 rules that **surface height
  under the rider is physics-owned, one evaluation, shared**. Dropping an
  independent FFT surface in beside it would recreate the exact defect §4.5 was
  written to kill — two authorities for one quantity, no arbitration rule.
  If a substrate is ever added, the only form consistent with §4.5 is as a
  *perturbation gated by the same depth field* — deep-water chop whose amplitude
  dies as `h` falls, so it vanishes before the surf zone where the zipper owns
  the surface — not as a second surface that the break layer draws on top of.
  Worth recording now, because the tension is invisible until someone tries it.

  **Licence contrast worth noting.** BSD 3-Clause, so unlike Celeris (GPL-3.0)
  this one could be read and reimplemented without licence entanglement. The
  point is mostly moot: a Phillips-spectrum IFFT is textbook Tessendorf, and
  there is no reason to route it through a Unity port. Wrong engine either way
  (Unity C#; the 2020 "WebGL fix" commit means Unity's WebGL export target, not
  a browser-native library).

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

  **Full read, 2026-08-11.** Notes from the paper itself rather than the
  abstract, in the order they bear on this project.

  *The scheme.* Extended Boussinesq in the Madsen & Sørensen (1992) form.
  Advective and bottom-slope terms go through **KP07** (Kurganov & Petrova
  2007, second-order well-balanced positivity-preserving central-upwind FVM);
  the dispersive terms are added as central-FDM source terms in KP07's final
  step. Positivity preservation is what buys the moving shoreline — no wet/dry
  bookkeeping. Time integration is 3rd-order Adams–Bashforth predictor with an
  optional 4th-order Adams–Moulton corrector, so the state history is three
  full fields deep. The dispersive terms make the flux equations implicit, one
  tridiagonal system per row and per column, solved by **cyclic reduction**
  (Thomas is serial and would force a GPU→host→GPU round trip each step). That
  implicit solve, not the physics, is the part that makes a WebGL2 port real
  work. State is packed as `float4` textures with `w, P, Q` in r/g/b, and they
  report **single precision is sufficient** — KP07 stayed robust — which is the
  relevant fact for float32 render targets here.

  *Compute is no longer the reason not to.* Conical-island benchmark (Briggs et
  al. 1995), 601×601 cells at constant Δt = 0.005 s: **under 15 s** on an NVIDIA
  Quadro K600 with a 1.8 GHz Xeon. Their comparison point is Fuhrman & Madsen
  at 234×201 taking **3.3 h** on a Pentium 4. A K600 is a 2013 entry-level part.
  This project's depth patch is 96×84 posts over 680×580 m. Worth stating
  because it removes an argument the project never actually leaned on: MODEL.md
  §5 rejects a solver on *intent* ("a reading of the wave, not a hindcast"), not
  on cost. That rationale is untouched by this paper. What the 15 s number kills
  is only the unstated assumption that a solver would be too slow to consider —
  it would not be, at this scale, on this hardware.

  *Validity covers this site.* The extended Boussinesq form is stated accurate
  for **kd < 3**. At T = 14 s, L₀ = 306 m and k₀ = 0.021 m⁻¹, so kd = 0.4 at
  20 m depth and still only 2.0 at 100 m. The entire nearshore domain qualifies.
  Where still water elevation is undefined (land above sea level) they set d = 0
  and the equations **degenerate to NLSW automatically** — structurally the same
  switch as `u_depthMix = 0` for the synthetic presets.

  *No explicit breaking model.* §2.5 of the paper: breaking is not treated
  directly; numerical dissipation from the **minmod limiter** imitates it. It
  validates — on the H/d = 0.18 conical island, where the soliton genuinely
  breaks, their run-up matches measurement about as well as Lynett et al. (2002)
  and Tonelli & Petti (2010), both of which *do* carry explicit breaking models,
  and better than Fuhrman & Madsen (2008), which over-predicts gauge #22 by
  ~25%. See the note against MODEL.md §4.5 item 2: in a phase-resolving solver,
  "how much energy is lost" is not a quantity anyone declares.

  *Formulas worth having independent of adopting the solver.*
  - Wet/dry velocity regularization: `u = √2·h·P / √(h⁴ + max(h⁴, ε))`, reused
    for Manning friction `f = g·n² / h^(1/3)`. A principled form of the
    `isFinite()` guard CLAUDE.md asks for.
  - Sponge-layer damping: `γ(x,y) = ½(1 + cos(π(L_s − D(x,y))/L_s))`, with L_s
    the layer width and D the normal distance to the absorbing boundary.
  - Eckart (1952) explicit dispersion approximation:
    `k = (ω²/g)·√(coth(ω²d/g))`. An alternative to the Guo (2002) form §4.5
    declares physics-owned; worth a numerical A/B if `dispersion.js` is
    revisited, given §4.5 already records the comment and the code disagreeing
    by 4.98%.
  - Solitary wave insertion: `η = H_s·sech²(k_s·((x−x₀)cos θ + (y−y₀)sin θ))`
    with `k_s = √(3|H_s|/4d³)`, `c_s = √(g(H_s + d))`.

  *What it would not fix.* Celeris refracts whatever bathymetry it is handed.
  MODEL.md §2.4 found that over ~10 m NCEI posts, straight shore-parallel
  contours make refraction forget the deep-water angle — 38° and 70° both arrive
  at ~9°, V_p runs 38–50 m/s, every preset collapses to the same closeout. A
  phase-resolving solver reproduces that *more* faithfully, not less. The
  binding constraint is contour obliquity below grid resolution, and it stays
  binding under any scheme that resolves phase. Celeris is the existence proof
  for the road not taken; it is not a route around M4.

  *Open, not verified:* whether the Lynett group has published a later
  WebGPU/browser Celeris variant. If one exists the licence-and-portability
  conclusion above needs revisiting. Not checked as of 2026-08-11.

  *Validation benchmarks used, for reference if quantitative fidelity is ever
  claimed here:* Synolakis (1987) solitary run-up on a 1:19.85 planar beach;
  Whalin (1971) focusing over a semicircular shoal; Briggs et al. (1995)
  solitary run-up on a conical island.

### 2.3.2 Why a planar wedge saturates — the refraction ceiling (verified 2026-08-13)

This project measured a ceiling (`WEB_THREE_SPEC.md`, "The reef-shape sweep"): no
wedge amplitude or flank width takes stage-median α much past ~45°, and enlarging the
wedge past a point makes it *worse*. That is not an implementation defect. Two primary
sources state the mechanism, both read directly rather than via summary.

**Mead, S.T. (2000), PhD thesis, Univ. of Waikato** (the thesis behind Mead & Black
2001, *JCR* SI 29:5–20). Refraction is the antagonist of peel angle:

> "Waves must peel at an angle along the crest for surfing, but refraction tends to
> align wave crests parallel to the isobaths. If waves are refracted too much before
> breaking on the wedge, the peel angle is decreased past surfable limits; waves begin
> to close-out."

And the part that kills "just make the wedge bigger" — verified verbatim at mead.txt
4167–4171:

> "as the depth of a wedge increases, the amount of refraction occurring on the wedge
> prior to breaking increases. As a result, the wedge must be rotated at a greater
> angle to the favoured orthogonal direction in order to maintain a surfable peel angle
> at breaking."

**Size and orientation are coupled.** Scaling a fixed-orientation planar wedge drives
peel angle *down*. Mead quantifies it across two real reefs in one wave climate:
Narrowneck (to ~11 m depth, ~450 m arm) has its wedge "rotated to ~85° to the favoured
orthogonal direction", while the much smaller Mount Maunganui reef (<95 m, ~4.5 m) "is
set 30° less, at close to 55°".

**Henriquez, M. (2004), "Artificial Surf Reefs", MSc thesis, TU Delft** derives the
bound. For straight parallel contours the peel angle *is* the incidence angle at
breaking (θ_b = α), so Snell gives his eq. 3.5:

    sin α / c_b  =  sin θ_s / c_s

Since sin θ_s ≤ 1, the ceiling follows immediately:

    **sin α_max = c_b / c_s**

— c_b the celerity at breaking depth, c_s the celerity where refraction over the
component begins. **It contains no wedge dimension at all**, which is exactly why
widening ours saturated. Henriquez states the consequence (henriquez.txt 1038–1040):

> "when refraction starts in deep water, it is impossible to obtain surfable peel
> angles no matter how large the offshore wave angle θ0 is"

and finds the tilt optimum is non-monotonic (2709–2712): "Increasing the reef angle β
will result in greater peel angles up to a certain point. This point is where the reef
angle is β ≈ 65°−70°. Higher reef angles will not result in significantly higher peel
angles and will only result in oscillating peel angles and lower breaker heights." His
Fig. 4.2 varies β = 60/70/80° on a straight-contour reef and the peel angle sits at
~30–38° **for all three** along the body of the ride.

*(The closed form above is our derivation from his eq. 3.5, not a printed statement in
the thesis. It is checked against his Fig. 3.3 in `tests/peel-ceiling.test.js`, which
reproduces the published peak α at h_s = 3–8 m to within a few degrees.)*

**Evaluated on this bank, with this model's own dispersion code** (`tests/peel-ceiling.test.js`,
ceiling at h_s = 5 / 6 / 8 m):

| spot | H₀ | h_b | ceiling (°) | target | |
|---|---|---|---|---|---|
| Sewers | 2.2 | 3.88 | 62 / 54 / 45 | 38 | ok |
| First Peak | 1.8 | 3.22 | 54 / 48 / 40 | 50 | ok |
| Second Peak | 1.5 | 2.78 | 49 / 43 / 37 | 58 | **over** |
| The Hook | 1.5 | 2.70 | 48 / 43 / 36 | 48 | **at the bound** |
| Jack's | 1.1 | 2.11 | 41 / 37 / 32 | 62 | **over** |
| Sharks | 1.0 | 1.95 | 39 / 35 / 30 | 66 | **over** |
| Private's | 0.7 | 1.42 | 33 / 30 / 26 | 70 | **over** |

**Five of seven authored targets exceed the physical bound at every shelf depth
tried** — and the two that clear it, Sewers and First Peak, are precisely the two spots
that hit their targets in the reef sweep. Sharks is the sharpest case: its reef ends
near the 6 m contour, giving a bound of 35°, and the best measured configuration
produced **exactly 35**. The wedge is not underperforming. It is saturated.

**The bank's golden rule is backwards.** `params.js` raises α down-point ("alpha rises
(mellower) … as you move away from the corner") while lowering H₀ from 2.2 to 0.7.
But smaller waves break shallower, refract more, and therefore have a *lower* ceiling:
the bank asks for the highest peel angles at exactly the spots physics constrains
hardest. Mead records the same effect measured at Raglan (citing Hutt 1997) — 15° vs
40° of offshore-to-breakpoint direction change for 4 m vs 1 m waves on one bathymetry.

**What does produce a high peel angle** — not planar tilt:

- "large peel angles are generally associated with **nonuniform bottom contours**"
  — Boqué Ciurana & Aguilar (2020), *JMSE* 8(8):599, citing Walker (1974a).
- In Henriquez's own model the high values come from "the relatively rapid change of
  the reef angle β at the reef tip and due to wave focusing at the reef tip" — a
  *rotating* strike plus focusing, not a steeper plane.
- Real designed reefs are therefore **not constant-orientation planes**: Narrowneck's
  arms rotate from 85° offshore to 65° inshore (Weppe 2010 MSc, Waikato, citing Black
  1998 / Black & Mead 2001b), the stated principle being to hold peel angle constant by
  "gradually decreasing the reef angle β shoreward" (Mead, Black & Hutt 1998).
- Mead's taxonomy assigns the *ridge* the opposite job: it "provides a section of
  steeper seabed gradient, causing a **decrease** in peel angle and increase in breaker
  intensity" (Scarfe et al. 2003, Scripps).

**And a warning about forcing it.** The Borth (Wales) physical model (Rigden, Stewart,
Allsop & Johnson 2013, HR Wallingford HRPP576) targeted 45–65° and its designs measured
**72–85°** — recorded as a *failure*: on the companion Jumeirah model peel angle went
"up to 80° as wave breaking did not progress along the crest". High peel angle off a
planar structure signals a wave that has stopped peeling, i.e. a closeout. If this
model were forced to 66° at Sharks, that is what it would be drawing.

#### The counter-evidence, recorded because it cuts against the above

High peel angles are not absurd in themselves, and one source deliberately designs for
the very band this project authored. Kept here rather than filed away:

- **ASR Ltd's own prescription for an *easy* reef** (Boscombe, target difficulty 4–5):
  "Peel angles, which determine the 'speed' of the surfing ride, should be a minimum of
  50° and an average of around 60°." — Black & Mead (2009), *The Reef Journal* 1(1):183.
  So 50–60° *is* a stated design intent for a mellow wave. Caveats: designer
  self-report, and no measured peel angle for Boscombe exists.
- **A natural break estimated at 60–70°.** The pre-existing right at Cables (Perth)
  "on average about 60–70°" — unsurfable because it was *too large*, not too slow
  (Bancroft 1999, UWA honours thesis).
- **Walker's own central value**, via the same thesis: "A peel angle of about 50° is
  typical according to studies of many sites."

**The reconciliation, and the precise claim this project should make.** The bound
`sin α_max = c_b/c_s` is not a universal prohibition on 60° waves — it is a constraint
given *where refraction starts* and *how deep the wave breaks*. A 60° peel is reachable
where breaking is deep relative to the onset of refraction, or where contours are
nonuniform. What the table above shows is narrower and harder to escape: **at these
spots' own breaking depths — set by their own authored H₀ of 0.7–1.5 m — a planar
component on this shelf cannot deliver 58–70°.** Sharks would need c_b/c_s ≈ 0.91,
i.e. refraction beginning essentially at the break point. That is a statement about
Pleasure Point at small swell, not about surfing in general.

**A convention conflict worth knowing about.** The Cables design brief (Perth ASRC 1994,
via Bancroft) states "30 degrees is appropriate for beginners, and 60 degrees is
desirable for professional boardriders" — **exactly inverted** relative to Hutt et al.
(2001), where 90° is the beginner limit and 27° the professional one, and relative to
Mead et al. (1997) tying world-class breaks to *low* peel angles. Both are grey or
committee sources on the ASRC side. Unresolved; do not build on either number without
checking which convention a source is using.

**Two ASR nulls worth not re-deriving.** Narrowneck's seven-year monitoring paper
(Jackson, Corbett, Tomlinson, McGrath & Stuart 2007, *Shore & Beach* 75(4):67–79 —
peer-reviewed) contains **no peel angle at all**; it reports ride geometry instead
(rides averaging 150–200 m, up to 260–270 m; ~30 s average, over 60 s longest; speeds
3.7–7.4 m/s), which is a useful acceptance shape for this model's own ride tests. And
Mount Maunganui was **deliberately designed low/fast** (55°→35°, Black & Mead 2009), so
its sub-50° figures are the spec, not a failure to reach high α — its actual failure was
construction (2,800 m³ built against 6,500 m³ design; Dahm & Gibberd 2013, BOPRC).

**Number traps.** Pratte's "45°", Leirosa's "45°/66°" and Narrowneck's "85°" that
circulate are **reef arm orientations**, not peel angles. Do not cite them as α.
Separately, every published ASR *design* peel angle traces to ASR Ltd, who designed and
built the reefs — designer self-report, no independent verification. And no artificial
reef in the retrieved literature has a published post-construction field-measured peel
angle, with one exception — **Cables (Perth), the only reef with both a design and a
measurement, and they agree**: designed at 45° (ASRC 1994 brief; Lyons 1992 1:40
physical model, with a 25–65° working range under ±20° of swell direction), measured at
"approximately 45 degrees" from circling-helicopter video on 17 Oct 1999. Its own
source (Bancroft 1999, UWA honours thesis, §4.4) flags it as "an approximation on a
single day under a certain set of wave conditions". Verdict there: "the reef is working
to design". Narrowneck, Boscombe, Mount Maunganui, Opunake, Pratte's and Kovalam have
**no** measured peel angle in any retrievable source.

**Point breaks specifically** (mead.txt 4484–4487) — the headland *is* the wedge:

> "the large wedges of headlands must be rotated away from the favoured orthogonal
> direction to compensate for refraction of waves beyond surfable peel angles. As a
> consequence, point-breaks often have better surfing conditions than coasts that are
> oriented towards the dominant swell direction."
