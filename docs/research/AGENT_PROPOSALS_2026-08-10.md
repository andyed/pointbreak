# External agent proposals, 2026-08-10 — leads and verification status

Two analyses were commissioned from a second agent (Gemini) against
`BRIEF_WAVEFORM_RANGE.md` and a companion brief on surfboard dynamics. Source
documents are in the author's Google Drive and were **not machine-readable from
here** — everything below is assessed from the summaries the agent returned.

**Nothing here has been merged into the model.** This file exists so the good
leads survive and the bad numbers do not quietly become code. The repo rule is
verified citations only; the failure mode in these proposals is subtler than
invented papers — it is **real papers cited with coefficients that do not match
them**, which is harder to catch and worse if it lands.

## Verification status

| Claim / source | Status | Evidence |
|---|---|---|
| Ursell 1953, "The long-wave paradox…", Camb. Phil. Soc. | **Verified link** | Cambridge Core URL resolves to the correct paper |
| Savitsky 1964, planing hull hydrodynamics, Marine Technology | **Plausible, unverified** | OnePetro MTSN link consistent with the known citation |
| Hornung & Killen 1976, JFM — stationary oblique breaking wave for surfboard testing | **Plausible, unverified** | Real JFM paper; title and venue match |
| "Walker 1974" peel-angle link | **DISPROVEN** | PDF extracted: it is Pierro & Benedet, *Surfing Engineered Beaches*, Coastal Planning & Engineering (2008). Not Walker. May cite him. |
| "Doering & Bowen 1995" link | **DISPROVEN as a link** | Points to an MDPI *J. Mar. Sci. Eng.* 7(10):367 article, unrelated to the 1995 Coastal Engineering paper |
| "Ruessink et al. 2012" link | **Not a source** | The URL is a Google *search* query, not a paper |
| "Battjes 1974" link (both documents) | **Secondary** | coastalwiki.org page, not the 1974 paper |
| Ruessink B(Ur) and φ(Ur, tanβ) coefficients | **UNVERIFIED — suspect** | See below. Could not reach the primary (ScienceDirect 403); coastalwiki does not carry the parameterisation |
| Abreu et al. 2010 waveform | **Real family, formula suspect** | See below |

## The lead worth keeping

Organising the surface by **Ursell number** `Ur = HL²/d³` is right, and Ursell
1953 checks out. We can compute `H`, `L` and `d` at every point already, so the
regime map is available without new data.

The **Abreu / Ruessink family is the correct thing to reach for**. A
single-expression skewed-and-asymmetric waveform with two shape parameters
(`r` peakiness, `φ` forward pitch), no Jacobi elliptic functions and no lookup
texture, is exactly what a fragment shader wants, and it would retire
`pow(cos, q)` — the piece of unearned physics the brief named. Pursue it. Just
not from these numbers.

## Three specific problems to resolve before any of it is implemented

**1. Abreu is an orbital-VELOCITY waveform, applied here to surface elevation.**
Abreu et al. (2010) and the Ruessink parameterisation are, to the best of my
knowledge, formulated for near-bed orbital velocity in sediment-transport work.
Using that shape for free-surface elevation may well be defensible — the
skew/asymmetry behaviour is analogous — but it is a **substitution, and must be
labelled as one**, not presented as the paper's surface profile. Check the
primary before adopting.

**2. The amplitude factor looks inverted.** The proposal writes

    eta = H * (1/sqrt(1-r^2)) * [ sin(th) + r sin(ph)/(1+sqrt(1-r^2)) ]
                              / [ 1 - r cos(th-ph) ]

My recollection of Abreu 2010 is that the leading factor is `f = sqrt(1-r^2)`,
**not its reciprocal**. If so, wave amplitude would *grow* with skewness instead
of being preserved — at r = 0.75 that is a factor of ~2.3 in the wrong
direction, which in this model would silently inflate breaking. Verify against
the paper; do not take my recollection as authority either.

**3. The Ruessink coefficients do not match what I recall of the paper.**
Proposed:

    B(Ur)   = tanh(0.1 * Ur^0.86)
    phi(Ur) = -pi/2 + (pi/2) * tanh(0.2 / Ur^0.5)

My recollection of Ruessink et al. (2012) is that **B is a logistic in
log(Ur)** — roughly `p1 + (p2-p1)/(1+exp((p3-log Ur)/p4))` — not a tanh of a
power law, and that the phase form, while similar in shape, uses fitted
constants closer to 0.8 and 0.67 than 0.2 and 0.5. I could not reach the
primary to confirm (ScienceDirect 403). **Treat every constant here as
unverified.** This is the highest-risk item in either proposal, because both
were ranked "ship immediately" and they would go straight into the shared GLSL.

## Two unlabelled inventions

Both appear alongside cited material with no derivation, and the brief
explicitly asked for fudges to be labelled:

- `R_vortex = 0.5 * H_b * (1 - exp(-0.6(xi - 0.4)))` — tube radius from ξ
- `R_c ≈ 0.1 * xi^2` — standing-wave reflection coefficient at steep rock

They may be reasonable fits. They are not presented as fits.

## An internal inconsistency between the two documents

The ξ breaker thresholds changed between them: the dynamics analysis gave
surging at ξ > 2.0; the waveform analysis gave collapsing 2.0–3.3 and surging
≥ 3.3. The latter is closer to the deep-water (ξ₀) convention `MODEL.md`
already cites. The two conventions (deep-water H₀ versus breaker height H_b)
carry different thresholds and were mixed without comment.

**More important than which convention:** our `u_xi` is a **dialled knob**, not
computed from `tan β / sqrt(H/L₀)` at all. Any formulation keyed to a real ξ is
mis-keyed against our input. This is also an opportunity — we now have bed
slope from the NCEI DEM plus H₀ and T, so **ξ should become derived**, which is
the project's stated preference anyway.

## An axis transposition in the dynamics analysis

It gives `alpha(z) = arctan(|dx_b/dz|)` and `V_p(z)`. Our frame is **x
along-shore, z shoreward**: `breakLine(x)` returns a z, so the break line is
`z_b(x)` and peel angle is `alpha(x) = atan(dz_b/dx)` — which is what
`bed.js derivedAlphaDeg()` computes. Implemented verbatim the proposal
differentiates along the wrong axis: dimensionally consistent, wrong for us.

## What was genuinely good, and should be kept

- **Scale separation.** Both analyses insist hydrodynamic quantities be
  computed at true SI scale (`h_true = h_vis / 3.2`) with the ×3.2 exaggeration
  applied only at the displacement step. This is correct and it is exactly the
  class of bug already shipped once here, when `VIS` leaked into the breaking
  criterion and made γ roughly three times too eager.
- **Makeability as a path integral.** Replacing Walker's point check with
  `tau = integral( 1/V_s - 1/V_p ) dz >= 0` over the ride is a real
  improvement, and it becomes necessary once α is a field rather than a
  constant. Keep this idea regardless of what happens to the rest.
- **A parametric coordinate inside the curl.** Attaching the rider to an
  interior arc coordinate `s ∈ [0,1]` on the lip is the right instinct for a
  region where the surface is multi-valued in y and a heightfield cannot
  represent position at all.
- **Failure modes stated as conditions rather than keyframes**, which is what
  was asked for.

## Recommended next step

Do not implement from these summaries. Fetch the three primaries — Abreu et al.
2010 (Coastal Engineering), Ruessink et al. 2012 (Coastal Engineering), and
Walker 1974 — and re-derive the coefficients from source. If the Abreu family
survives that check, it is a strong candidate to replace `pow(cos, q)`, and the
Ursell regime map is a good spine for the work either way.
