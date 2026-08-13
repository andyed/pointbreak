# Topanga Point: the only engineering-grade α profile at a California point break

Pulled and read in full 2026-08-13. This is the single most directly comparable
prior art to what `pointbreak` computes, and it changes two things in this repo:
it validates the **alongshore α profile** as the right instrument, and it puts
hard numbers against the ≥58° authored targets that the M5 wedge cannot reach.

---

## 1. What the document actually is

**Integral Consulting Inc. (2023).** *Topanga Surf Quality Impact Assessment
Report — Topanga Lagoon Restoration Project.* Prepared for the Resource
Conservation District of the Santa Monica Mountains and Moffatt & Nichol.
**November 10, 2023.** ~49 pp.

Provenance chain, because the citation is three levels deep and easy to get wrong:

```
Topanga Lagoon Restoration Project DEIR (SCH 2022050478, Draft Feb 2024)
└── DEIR Appendices bundle (446 MB, 2,727 pp.)
    └── M&N (2023), Topanga Lagoon Restoration, Shoreline Morphology Analyses
        └── Appendix B: Topanga Surf Quality Impact Assessment Report  ← Integral
```

- Source PDF: `https://b0e10c6b-183c-4b9c-9876-33636ee7bd6c.filesusr.com/ugd/a4773f_72220b5b12804c1c8bb594cdc0958295.pdf`
  (listed as "DEIR Appendices" at topangalagoonrestoration.org/library)
- Surf report occupies **pp. 141–185** of that bundle (duplicated at pp. 678–723).
- **Correction to earlier notes in this repo:** it is *not* "Appendix H", and the
  report is dated **2023**, not 2024. 2024 is the DEIR release year. Integral's
  Santa Cruz office (200 Washington St., Suite 201) authored it.

## 2. The method, step for step

Integral runs **XBeach 2D in nonhydrostatic mode with the reduced two-layer
model (`no+`)** — wave-resolving, individual waves, no empirical breaker
parameterisation. Grid: **5 ft resolution** in the breaking region, domain 1 km
offshore × 1.5 km alongshore either side of the lagoon mouth. **35 minutes** of
real-world time per scenario.

Peel-angle extraction, verbatim from §3.1.3:

1. Extract breaking locations from model output for each wave scenario.
2. Determine areas of high breaking density (the "whitewater") to delineate the
   **wave path** — a composite / summation of breaking snapshots over the whole
   simulation, restricted to the **top ⅓ of wave heights** ("since most surfers
   tend to surf the highest waves").
3. Delineate the **wave crest** for each individual wave at the wave path.
4. α = the **intersection angle** between the individual breaking wave crest and
   the wave path.

α and its alongshore position are computed **for every breaking wave** over the
35 minutes, for every scenario.

### Why this matters here

This is our `markBreak` / `lineProbe` split, arrived at independently. Their
"wave path" is our baked break line; their "wave crest" is our crest; α is the
same intersection. Two differences worth copying:

- **Their break line is a statistical composite over 35 min of waves**, not a
  per-frame geometric criterion crossing. That is structurally immune to the
  single-crossing branch-flip failure documented in `pointbreak-project` / the
  ROOT DEFECT — a density map cannot teleport 22–70 m because one texel of DEM
  residual moved the seaward-most crossing.
- **They restrict to the top ⅓ of wave heights** before building the line. We
  bake over everything.

### The validation is qualitative — read this before citing it as ground truth

§3.2.2, verbatim: the model was run on existing bathymetry "to establish a
baseline peel angle to **qualitatively validate** the surf model results with the
surf description from the surf focus group." Bathymetry is the USACE 2014 DEM.

So Topanga's α values are **XBeach output checked against surfer prose** — the
same epistemic status as this repo's authored α targets from surf-guide
character descriptions. It is *not* measured α. §2.3.1 of
[SURF_SCIENCE_REFS.md](SURF_SCIENCE_REFS.md) survives intact: still no measured
peel angle at any California point break, including this one.

## 3. The numbers

**Optimal peel angle for recreational surfing: 30–65°** (their §3.1.1).

Maneuver mapping, after Scarfe et al. (2002) at Raglan:

| Maneuver | α |
|---|---|
| Takeoff | 45–60° |
| Cutback | ≥ 55° (softer waves) |
| Re-entry | 50–55° |
| Speed section | ≈ 40° (steeper waves) |

**Existing-conditions α down the point** (three sections, delimited by the
landmarks surfers actually navigate by — turning point, restrooms, 2nd stairs,
3rd stairs):

- All three wave cases start **steep** before the turn down the point.
- After the turn, past the restrooms, the wave **softens** (α rises).
- Restrooms → 2nd stairs: all waves **steepen again** as the wave speeds up.
  The oblique south swell is steepest and fastest — **α ≈ 30°** there, against
  **α ≈ 55°** for the largest wave case.
- 2nd → 3rd stairs: softens again, "more rippable", all three cases **≈ 50°**.

**Section-averaged α, Wave Case 1** (their Table 4 — the sensitive case, 2 ft /
15 s / 230°):

| Scenario | Turning→Restrooms | Restrooms→2nd | 2nd→3rd |
|---|---|---|---|
| Alt 1, 100-yr flood, 1 yr post | 51 | 43 | 38 |
| Alt 2, 100-yr flood, 1 yr post | 45 | 42 | 41 |
| Alt 4, 100-yr flood, 1 yr post | 47 | 38 | 40 |
| Alt 1, 100-yr flood, 5 yr post | 49 | 38 | 40 |
| Alt 2, 100-yr flood, 5 yr post | 47 | 39 | 40 |
| Alt 4, 100-yr flood, 5 yr post | 53 | 41 | 40 |
| Alt 1, dry, 1 yr post | 49 | 40 | 35 |
| Alt 2, dry, 1 yr post | 51 | 43 | 42 |
| Alt 1, dry, 5 yr post | 48 | 38 | 31 |
| Alt 2, dry, 5 yr post | 48 | 41 | 35 |
| Existing, 0.0 ft SLR | 53 | 32 | 44 |
| Existing, 1.6 ft SLR | 47 | 39 | 34 |

All units are degrees. **The whole table lives in 31–53°.** Nothing at a
functioning California point break, across 12 scenarios and three alongshore
sections, exceeds 53°.

**Wave cases** (from a July 24, 2023 in-person surfer focus group, not from a
climatology):

| Case | H (ft) | T (s) | Dir (° from N) | Character |
|---|---|---|---|---|
| 1 | 2 | 15 | 230 | long-period south, defined sets, oblique across the point |
| 2 | 4 | 11 | 255 | small west, near shore-normal, peaky, less defined sets |
| 3 | 7 | 10 | 260 | large west, infrequent |

**Sea level rise.** At **1.6 ft**: α drops near the turn, rises restrooms→2nd
stairs, drops 2nd→3rd; waves break further offshore, "similar to current
conditions with higher tide." Their framing is that SLR pushes the break off the
optimal water level. At **6.6 ft**: wave breaking becomes "quasi-unrecognizable"
— breaking over the helipad, restrooms, revetment, on the beach and *inside the
lagoon*. **α could not be computed at all** at 6.6 ft (Table 4 note). Their
headline conclusion: SLR dominates; the restoration alternatives move α no more
than the flood/drought interannual swing does, and that difference dissipates
within 5 years post-construction.

## 4. What this changes for `pointbreak`

**(a) The ≥58° α targets are the weaker side of the fork.** `TODO 1c'-c` /
`pointbreak-project` item 7 leaves an open fork: either the M5 wedge needs a
component that is not a widened plane, or the ≥58° targets (Sharks 66, Privates
70, Second Peak 58 — all derived from surf-guide character prose) are wrong. The
only engineering study of a California point break, validated the same
qualitative way, produces **31–53° across every section and scenario**, and puts
the recreational optimum at 30–65° with *quality at the low end* — consistent
with Mead et al. (1997), "high seabed gradients and **low** peel angles produce
world-class surfing breaks", already cited in §2.2 of SURF_SCIENCE_REFS.

The wedge plateaus at 33–43° for targets ≥58°. Topanga says a real point break
in that class runs 31–53°. **The wedge may be closer to right than the targets
are.** This does not settle it — Topanga is not Pleasure Point, and PP's apex
rotation is 111° against Topanga's much gentler point — but it inverts which
side of the fork carries the burden of proof.

**(b) Their α profile is non-monotonic, and so is ours.** Steep at takeoff →
soft past the restrooms → steep again → soft at the end. This is the same shape
as the "dead down-point third" documented on 2026-08-13, except at Topanga the
softening is *canon*, described by the focus group, and not treated as a defect.
Worth re-reading our stage-α profiles with that in mind before "fixing" the tail.

**(c) Landmark-anchored sections beat a single station.** They report α averaged
over three named sections between physical landmarks, never at one station. That
is independent support for the `stageAlpha()` decision (commit db87cf1) — and it
suggests going further: report α per named section (Turning→Restrooms style)
rather than a single stage median, since the profile is genuinely non-monotonic
and a median hides it.

**(d) Copy the composite break line.** Building the wave path from a *density
composite of breaking over many waves*, restricted to the top ⅓ by height, is a
plausible structural fix for the branch-flip / DEM-noise defect that no
line-global tool (smooth, peeldir, morphological closing) survived. It changes
the line from "where does the criterion cross on this frame" to "where does
breaking concentrate over 35 minutes". Candidate for the TODO 1c' track.

**(e) What this establishes for the essay: the gap is not a tooling gap.** The
capability exists and has been exercised carefully on this coast — a
focus-group-grounded, wave-resolving α study for a Malibu-area lagoon EIR in
2023. The same firm was later a named partner on the 2025 Santa Cruz
climate-vulnerability study covering 31 breaks, whose metric is **surfability =
% of daylight hours with surfable conditions**; peel angle appears there once,
as line item `m` in a *recommended contents template* for future assessments.

Read that as two studies answering two different questions rather than as an
omission: an availability scalar is the right instrument for a
climate-vulnerability assessment, and that assessment answered its own question.
The conclusion that matters here is narrower and forward-looking — **the
technique is proven on this coastline; it has not yet been pointed at this
reef.**

*Register note, 2026-08-13.* This paragraph previously closed "the tool existed,
the authors overlapped, the gap stayed open." The live essay was softened away
from that framing the same day (Andy's call, immediately after opening contact
with Integral), and this file is **public on GitHub** — a reader following the
essay to the repo would otherwise land on the sharper version. Aligned
deliberately: same facts, no indictment. Keep any future edit in this register.

## 5. Citation

> Integral Consulting Inc. 2023. *Topanga Surf Quality Impact Assessment Report,
> Topanga Lagoon Restoration Project.* Prepared for Resource Conservation
> District of the Santa Monica Mountains and Moffatt & Nichol. November 10, 2023.
> Appendix B *in* Moffatt & Nichol, *Topanga Lagoon Restoration, Shoreline
> Morphology Analyses*; DEIR Appendices, Topanga Lagoon Restoration Project
> (SCH 2022050478).

Their own references worth chasing — **checked against CrossRef 2026-08-13, and
two of the four are defective in the source document. Cite the corrected forms
below, not the EIR's:**

- **Scarfe, B.E., W.P. de Lange, A.K. Chong, K.P. Black & S.T. Mead (2002).** The
  influence of surfing wave parameters on manoeuvre type from field
  investigations at Raglan, New Zealand. *Proc. 2nd Surfing Arts, Science and
  Issues Conf. (SASIC 2)*, 74–89. — source of the maneuver/α table above; the
  one place α is tied to specific maneuvers. **Not in CrossRef** (unindexed
  conference proceedings), so unverifiable by DOI; consistent with the Scarfe
  material already verified in [SURF_SCIENCE_REFS.md](SURF_SCIENCE_REFS.md) §2.
- **Mendonça, A., C.J. Fortes, R. Capitão, M.G. Neves, J.S. Antunes do Carmo &
  T. Moura (2012).** Hydrodynamics around an Artificial Surfing Reef at Leirosa,
  Portugal. *J. Waterway, Port, Coastal & Ocean Eng.* 138(3):226–235.
  **VERIFIED** — `10.1061/(ASCE)WW.1943-5460.0000128`. Source of their α
  definition figure.
- **Zijlema, M., G. Stelling & P. Smit (2011).** ⚠️ **The EIR's citation does not
  resolve.** It gives the title *"Simulating nearshore wave transformation with
  non-hydrostatic wave-flow modeling"* with a bare "TU Delft" and no venue; that
  title returns nothing in CrossRef. The real paper by those three authors in
  that year is **SWASH: An operational public domain code for simulating wave
  fields and rapidly varied flows in coastal waters**, *Coastal Engineering*
  58(10):992–1012, `10.1016/j.coastaleng.2011.05.015` (**VERIFIED**). This is
  the reference carrying their whole nonhydrostatic-over-Boussinesq
  justification, so it matters that it is malformed.
- **Deltares (2010).** XBeach Model Description and Manual. ⚠️ **Internal
  inconsistency in the EIR:** the in-line citation in §3.1.2 reads
  "(Deltacrest 2010)" while the reference list reads "Deltares 2010". Deltares
  is correct; "Deltacrest" is not an organisation.

Nothing in *this* file's own chain of claims depends on either defective
reference — they are Integral's justification for their model choice, not for
any α value quoted above. Recorded because if the essay or README ever cites
Integral's methodology chain, it should cite the corrected forms.

## 6. Local artifacts

Working copies are in the session scratchpad, **not committed** (446 MB source):

- `topanga_DEIR_appendices.pdf` — full 2,727-page bundle
- `topanga_surf_quality_2023.pdf` — the 49-page surf report, extracted (4.3 MB)
- `topanga_FEIR_appendices.pdf` — FEIR appendices, 913 pp. (43 MB), not yet read
- `deir_app.txt` — full text extraction, 5.0 MB

The 49-page extract is the one worth keeping. Figures 12–14 and 22–24 (composite
breaking maps, the α-alongshore plots) are the ones to look at directly; the text
dump loses them.
