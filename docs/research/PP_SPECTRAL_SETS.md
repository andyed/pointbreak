# Set structure at Pleasure Point — what 25 years of spectra can and cannot say

Built 2026-08-16 by `data/climatology/build_spectral_sets.py` from the CDIP MOP
SC116 directional spectra: 218,975 hourly records, 20 frequency bands each, on
the same transect as `PP_CDIP_CLIMATOLOGY.md`. Numbers in
`../../data/climatology/pp_spectral_sets.json`.

The target is README.md's own admission:

> the two-component beat that produces sets here is **invented rather than
> measured**

`MODEL.md` carries the invention as `Δf ~ 0.006 Hz`; the preset bank spans `dF`
0.004–0.018. The question was whether the spectra could replace those.

**Headline: they cannot replace the number.** Read §4 before touching `dF`, and
note that §5 is a RETRACTION of a claim this document made on 2026-08-16 and
withdrew the same day.

**But they CAN constrain the envelope's FLOOR** — a different quantity, added as
§7 on 2026-08-18. The floor is the beating components' amplitude ratio, which is
local to the spectral peak and therefore immune to the band-cutoff artifact that
makes §4's σ_f unusable (1.28× swing vs 6.1×). That is the one number this
dataset hands the model.

## 1. The authored Δf is below the instrument's resolution

MOP's grid is **0.005 Hz** wide through the swell range. Two swell peaks must
sit at least two bands apart to show a trough between them, so the smallest Δf
this dataset can resolve is **0.010 Hz**.

`MODEL.md`'s 0.006 Hz is below that floor. Two components 0.006 Hz apart land in
adjacent bands and are indistinguishable from one broad peak.

This is not a processing problem. No partitioning scheme, interpolation, or
threshold recovers structure the grid never recorded. **This dataset can neither
confirm nor refute the authored value**, and any Δf quoted from it is
conditioned on being ≥ 0.010 Hz — the measured distribution is truncated from
below, not sampled from.

## 2. The two-component picture describes a minority of surf hours

Partitioning each spectrum into swell systems (a second peak counts if it clears
25% of the primary and the trough between falls to 70% of the smaller):

| | hours | bimodal |
|---|---|---|
| all | 218,975 | 23.8% |
| Hs ≥ 1.0 m | 33,039 | 12.6% |
| Hs ≥ 1.5 m | 9,498 | 11.1% |
| Hs ≥ 2.0 m | 3,039 | **8.9%** |

**The absolute level is threshold-dependent and must not be quoted alone.**
Across a 3×3 grid of peak/trough thresholds and three band cutoffs it ranges
3.2%–39.3%. Two things survive every combination:

- bimodality is a **minority** state, even at the loosest settings;
- it gets **rarer as the surf gets bigger** — the size trend above is measured
  at fixed thresholds, so the choice cancels out of the comparison.

On the days this model exists to draw, the spectrum is single-peaked roughly
nine times in ten. A two-component beat is not the usual mechanism here; it is
an occasional one.

## 3. When there are two components, they arrive from the same direction

Direction separation between the two partitions, from `waveMeanDirection`:
**median 11.4°, p90 23.4°.**

This is the one clean positive result, and it *supports* a simplification the
model already makes. Refraction into Monterey Bay collimates everything —
`PP_CDIP_CLIMATOLOGY.md` measures a 25°-wide arrival band with R = 0.989 — so
even a genuine two-swell sea reaches Pleasure Point as two periods from
essentially one bearing. The model's scalar beat does not need a directional
term. That was an assumption; it is now a measurement.

## 4. The bridge that failed, and why it is in this document

Spectral width is the obvious continuous substitute for a two-component Δf.
Longuet-Higgins ν, converted to an absolute width σ_f = ν·(m₁/m₀), is in hertz
and directly comparable.

It is stable across sea state — σ_f p50 moves only 0.0185 → 0.0188 Hz from all
hours to Hs ≥ 1.5 m — which is exactly what made it look publishable.

It is not stable across the one choice that is arbitrary: **where the swell band
ends.**

| cutoff | σ_f (Hz) | implied set period | Goda Qp |
|---|---|---|---|
| 0.090 Hz (T ≥ 11.1 s) | 0.0082 | 121.7 s | 4.99 |
| 0.100 Hz (T ≥ 10.0 s) | 0.0104 | 95.8 s | 4.19 |
| 0.110 Hz (T ≥ 9.1 s) | 0.0154 | 65.1 s | 3.30 |
| 0.125 Hz (T ≥ 8.0 s) | 0.0187 | 53.4 s | 2.94 |
| 0.160 Hz (T ≥ 6.2 s) | 0.0275 | 36.3 s | 2.40 |
| 0.250 Hz (T ≥ 4.0 s) | 0.0441 | 22.7 s | 1.95 |
| 0.400 Hz (T ≥ 2.5 s) | 0.0500 | 20.0 s | 1.88 |

m₂ is dominated by the highest frequency retained, so ν inherits the cutoff:
**6.1× swing in σ_f** across defensible choices, against **2.65× in Qp**.

Concretely: at a 0.125 Hz cutoff this analysis says the model's Δf implies sets
**3× too long** and should be retuned toward 0.019 Hz. At 0.090 Hz it says the
model is **nearly right**. Both from the same 25 years. The number would have
been a statement about the analyst, not the ocean.

It is recorded here rather than dropped because the failure is the reusable
part: a quantity can be beautifully stable along the axis you thought to check
and set entirely by an axis you did not. Goda's Qp is the least cutoff-sensitive
of the three (2.65× vs 6.1× over the same range) and is where a future
groupiness bridge should start — but it is dimensionless and does not convert to a Δf
without an assumption that smuggles the answer back in.

## 5. RETRACTED — the "internal inconsistency" was mine

**This section originally claimed MODEL.md contradicted itself**: that
`Δf ~0.006 Hz` implies 11.3 waves per set while its own adjacent "sets of ~5–7"
implies Δf 0.0096–0.0135 Hz. **That claim was wrong and is withdrawn.**

`setEnv = ½ + ½·cos(2π·Δf·(t − s/c_g))` is the full envelope cycle, **lull
included**. So `1/Δf` is the set-to-**set** period, while "sets of ~5–7" counts
the waves *inside* one set — the upper part of the same cycle. Half the cosine
sits above `envS = 0.5`, which is **6.0 waves** at the card values (T = 14 s,
Δf = 0.006 Hz), and the consumers square the envelope (`env*env`, "lulls really
disappear"), so the visible set is if anything tighter. Both statements were
right, describing different quantities. Dividing 1/Δf by T gives waves per
*cycle*, roughly twice the set — that division was the error.

It is also refuted empirically, independently of the argument: the temporal
audit measured the set peak at **120.5 s** (foam residual, r = 0.74) and
**120.8 s** (mean luma) at Sewers, whose authored Δf = 0.008 Hz predicts
**125.0 s**. A 3.6% miss on the set-to-set period. If 1/Δf meant the set length
rather than the cycle, that agreement could not happen.

MODEL.md now states both readings explicitly in §2.5.1, added 2026-08-16 so the
next reader does not repeat this.

**Nothing in §§1–4 depends on this section.** The resolution floor, the
bimodality decline, the direction separation and the cutoff artifact were all
measured against the spectra and stand unchanged.

## 6. Recommendation

1. **Do not retune `dF` from this analysis.** §4 is why.
2. ~~Resolve the §5 inconsistency~~ — **withdrawn**, there was none. See §5.
   MODEL.md's Δf and its "sets of ~5–7" annotation are consistent; §2.5.1 now
   says so in the document itself.
3. **Keep the scalar beat; drop any plan for a directional two-component
   model.** §3 measured the assumption and it holds.
4. **Stop describing the beat as unmeasured, and start describing it as
   unresolvable at this instrument's grid.** Those are different admissions,
   and the second one is true.
5. If set structure ever needs to be measured properly, the instrument has to
   change: CDIP **buoy** spectra (station 156) are published on a finer grid
   than the MOP model output, and the temporal harness
   (`TEMPORAL_HARNESS_REVIEW.md`) measures crest recurrence directly from the
   rendered field, which is the only path that observes groups rather than
   inferring them from a spectrum.

## 7. The envelope FLOOR, unlike Δf, this data CAN constrain (2026-08-18)

Added after `scripts/measure_wave_scale.mjs` measured what the zero-floored
envelope does to the render: over one 166.7 s beat at Second Peak x = 80 the
drawn height swings **15.7×** (6.30 → 0.40 m) and the measured height
exaggeration falls to **0.22×**, i.e. for a large part of every cycle the render
draws water *flatter than the physical sea*. See MODEL.md §2.5.2.

The floor is not a free parameter. For a two-component beat the envelope
amplitude ranges |a₁−a₂| … (a₁+a₂), so

    floor = |a₁ − a₂| / (a₁ + a₂)

— the component **amplitude ratio**, which is zero only when the two components
are exactly equal. That is a coincidence, not a sea state. Two estimators, both
run against the same SC116 hindcast §§1–4 use.

### 7.1 Estimator A — adjacent-band amplitude ratio

The model's two components sit Δf = 0.006 Hz apart, which is **one grid step**.
That does not ask the grid to resolve two peaks (§1's floor, which still stands)
— it asks the **local shape of one peak**, which the grid does record. For each
spectrum take the peak band's energy and a neighbour one step away, and
ρ = √(E_n·bw_n / E_p·bw_p); floor = (1−ρ)/(1+ρ).

Measured on surf hours (Hs ≥ 1.0 m, n = 33,039), median floor:

| separation | nominal Δf | stronger neighbour | weaker neighbour |
|---|---|---|---|
| 1 band | 0.005 Hz | 0.058 | 0.134 |
| 2 bands | 0.010 Hz | 0.143 | 0.281 |
| 3 bands | 0.015 Hz | 0.210 | 0.439 |

The model's Δf = 0.006 Hz sits between the first two rows; interpolating gives
**0.075 (stronger neighbour) to 0.163 (weaker)**.

**§4's failure mode does not reach this estimator, and that was checked, not
assumed.** Every arbitrary choice was swept:

| axis | swing in the median floor |
|---|---|
| swell-band cutoff 0.09 → 0.40 Hz (the axis that killed σ_f at **6.1×**) | **1.28×** |
| sea-state gate Hs ≥ 0 … 2.5 m | 1.29× |
| year, all 25 individually (0.041–0.081) | 1.95× |
| **which neighbour** (stronger / weaker) | **2.33×** ← the dominant uncertainty |

The cutoff cannot reach it because the quantity is *local to the peak* and never
touches m₂. The residual ambiguity is genuinely a modelling choice — a
two-component reduction of a broad peak has two candidate partners — and it is
reported rather than hidden.

### 7.2 Estimator B — match the measured lull DUTY CYCLE

Estimator A idealises. This one does not: each hourly swell spectrum is realised
as a random-phase linear sea, the analytic envelope A(t) is taken, and inside
each 1/Δf = 166.7 s window (the model's own set cycle) the time fraction spent
below a threshold × that window's maximum is recorded. 3,000 records, **108,000
windows**. For the model's cosine the same fraction is analytic:
P(env < x) = 1 − arccos((x − (1−m))/m)/π.

| threshold | measured p50 | model, floor 0 | model, floor 0.15 |
|---|---|---|---|
| 0.15 | 0.066 | 0.253 | 0.000 |
| 0.25 | 0.183 | 0.333 | 0.223 |
| 0.35 | 0.333 | 0.403 | 0.322 |
| 0.50 | 0.568 | 0.500 | 0.444 |

The zero-floored model spends **3.8× too long** below 0.15 and 1.8× too long
below 0.25 — the defect is precisely at the deep end, exactly where the dipstick
found it. Least squares over the deep thresholds gives floor **0.143** (p50) /
**0.140** (mean); over 0.25/0.35 only, 0.171; over 0.15/0.25 only, 0.144. The
estimate is stable at **0.135–0.171** across every subset and both statistics.

### 7.3 A negative result worth keeping

The first version of §7.2 measured the envelope **minimum**, expecting the real
sea's many components to *fill* the null and so justify a floor. They do not:
median min(A)/max(A) per set cycle is **0.034**, p5 = 0.007. A many-component
narrow-band envelope is Rayleigh and gets very close to zero within a 167 s
window. **The depth of the model's null is not by itself unphysical.** What is
unphysical is its *duration* — the model holds a deterministic broad trough
every single cycle, where the ocean's deep nulls are brief and randomly timed.
That is why §7.2 fits duty cycle and not depth, and it is why "raise the floor"
is the right fix for the wrong-sounding reason.

### 7.4 What this does and does not license

- It licenses a floor of **0.15 (modulation depth m = 0.425)**, uncertainty
  **0.075–0.171** (the union of §7.1's neighbour bracket at the model's Δf and
  §7.2's fit spread); call it **0.05–0.20** as a working band. The landed value
  sits inside both estimators, near the top of §7.1's and inside §7.2's.
- It does **not** license retuning `dF`. §4 and §6.1 stand unchanged.
- Estimator A's *resolved-bimodal* variant was computed and is **not** quoted as
  the answer: `PEAK_MIN_FRAC = 0.25` forces ρ ≳ 0.5 and hence floor ≲ 0.333 **by
  construction**, and its population is conditioned on Δf ≥ 0.015 Hz, which is
  not the model's Δf. Its median (0.125, n = 4,063) is consistent with §7.1–7.2
  and is recorded as corroboration only.
- The realised-envelope estimators assume linear superposition with random
  phases. That is the standard sea-surface model and is not neutral in the surf
  zone; it is used here only in deep-ish water where the spectrum is defined.

## Rebuild

```bash
uv venv .venv-cdip && uv pip install --python .venv-cdip/bin/python netCDF4 numpy
curl -sL -o data/climatology/.cache/SC116_hindcast.nc \
  https://thredds.cdip.ucsd.edu/thredds/fileServer/cdip/model/MOP_alongshore/SC116_hindcast.nc
./.venv-cdip/bin/python data/climatology/build_spectral_sets.py
```

The 148 MB source is gitignored and regenerable. This script needs netCDF4;
`build_cdip_climatology.py` deliberately does not, because bulk parameters come
down fine over OPeNDAP ASCII and 20-band spectral arrays do not.

**Closure check:** Hm0 recomputed from the spectrum matches the published
`waveHs` to **0.0000 m** across all 221,328 records, so the integration and band
weighting are right. That check should be re-run after any change to the
frequency handling — it is cheap and it is the only thing standing between a
band-weighting slip and a plausible wrong answer.

## 8. §6.5's proposed instrument does not reach the question (2026-08-20)

§6.5 said that if set structure ever needed measuring properly, *the instrument
has to change*, and named CDIP **buoy 156** on the grounds that buoy spectra are
published on a finer grid than MOP model output. That premise was tested before
anything was built on it. **It is false in the band that matters.**

Measured (`check_spectral_grids.py`, both grids pulled over OPeNDAP;
`pp_spectral_grids.json`):

| | SC116 MOP | buoy 156 |
|---|---|---|
| bands | 20 | **64** |
| range | 0.04–0.4 Hz | 0.025–0.58 Hz |
| **spacing at PP's swell peak** (T 14.5 s = 0.0690 Hz) | **0.005 Hz** | **0.005 Hz** |
| resolvable Δf there | 0.010 Hz | **0.010 Hz** |
| authored Δf | | 0.006 Hz — **still below the floor** |

The buoy has 3.2× the bands and is not finer where the swell is. Its extra
resolution is at high frequency: it runs to 0.58 Hz in 0.01 Hz steps against the
model's 0.4 Hz. **Band count is the misleading comparison.** A partitioning
pipeline built on "64 versus 20" would have returned Δf values this grid cannot
support, carrying the provenance of an in-situ instrument — the most persuasive
possible wrong answer. §1's verdict is unchanged and now holds for two
independent sources rather than one.

Where the buoy *is* better, so this is not over-read: it holds 0.005 Hz spacing
across 0.025–0.095 Hz against the model's 0.040–0.075 Hz, so short-period
windswell and long groundswell are better resolved, and it measures water rather
than modelling it. Neither property bears on Δf.

**What this closes.** The first of §6.5's two paths. Δf is not merely
unresolvable at SC116; it is unresolvable at the finer-looking alternative too,
for the same reason. Any future attempt needs a source whose *spacing near
0.069 Hz* is below 0.003 Hz, and that requirement should be checked first, in
one request, before any pipeline is written.

**What this promotes.** §6.5's second path is now the only one left: measure
crest recurrence **directly from the rendered field** with the temporal harness,
which observes groups rather than inferring them from a spectrum. That is also
the only route that can check the authored value against what the model actually
draws, rather than against what an instrument can see.

Full spec, pre-registered outcomes, and the reasoning for stopping at step 1:
`PP_SPECTRAL_PARTITIONS_SPIKE.md` (outcome D).
