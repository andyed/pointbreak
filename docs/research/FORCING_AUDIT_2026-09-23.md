# Forcing audit — is the water the model is fed the water that arrives at Pleasure Point? (2026-09-23)

**Finding, in three sentences.** The model shoals SC116's `waveHs` twice: `u_H0`
is declared deep-water and re-shoaled by `Ks(h)` from `cg0`, but MOP's Hs is
already at the 15.03 m prediction site (`metaWaterDepth`, both SC116 files),
so `#day=live` over-forces height by `Ks(15.03 m; T) − 1` = **+2.1 % at 14 s,
+4.6 % at 15 s, +7.2 % at 16 s, +9.8 % at 17 s**, and the month table — which
*meant* to divide this out — divided by a shallow-water Ks of 0.9759 that the
shader stopped using on 2026-08-26, so it over-forces by **+2.1 % (T 13) to
+7.2 % (T 15)** at the card periods. Every tide constant reproduces CO-OPS
9413450 to the millimetre, the seven cards sit at the p88–p99 of the SC116
hindcast (Sewers 2.2 m at 15 s is a top-1 % hour, p96.5 in winter), the
authored `dF` is below the spectra's 0.010 Hz resolution floor and the 0.15
envelope floor sits inside the bracket the 2025–26 nowcast spectra give
(0.061–0.208), and 8.4 % of surf hours (Hs > 1 m) arrive outside the 188–216°
band. Both pre-registered field days are in the current SC116 nowcast (it now
runs 2025-04-01 → present; the hindcast still ends 2025-03-31), and the larger
forcing error on those days is not the shoaling but the **non-tidal residual:
the water at Monterey stood +0.13 m (08-15) and +0.18 m (09-05) above the
prediction the pre-registration used**.

Instrument: `scripts/audit_forcing.py` (numpy only; raw pulls in
`qa/forcing-audit/`, ignored; reduced tables in
`docs/research/assets/forcing-2026-09-23/*.json`). JS twin of the proposed
correction: `scripts/lib/deshoal.mjs`, pinned to the Python by
`tests/deshoal.test.js`. Nothing shipped changes; every proposal is behind a
flag in §7. Hindcast cache SHA-256 `9b30d2f4…4907` is the same bytes
`pp_cdip_climatology.json` records.

## 1. Deep-water vs nearshore: the double shoaling

**What MOP references.** Not guessed: `metaWaterDepth` = 15.03 m in
`SC116_nowcast.nc` and `SC116_hindcast.nc`, and column 7 of
`CA_v1.1_transect_definitions.txt` ("Prediction site depth, in meters":
SC116 −15.03). The files carry no vertical datum for the depth
(`geospatial_vertical_origin` "sea surface"); the ±0.86/+0.76 m tide columns
below bracket what that ambiguity does to Ks (< 1.2 %). O'Reilly et al. (2016)
is the cited method: buoy spectra transformed shoreward through linear
refraction to the site, so `waveHs` is the spectral Hm0 *at 15.03 m* — the
closure check in PP_SPECTRAL_SETS (Hm0 from the 20 bands = `waveHs` to
0.0000 m) confirms it is nothing more exotic.

**What the model does with it.** `applyOcean()` sets `state.H0 = clamp(o.hs,
0.4, 3.0)` and `setDerivedH0(o.hs, …)` compares that number to the peel floor;
`ocean()` then draws `Heff·Ks(h)` with `Ks = sqrt(cg0/cg(h))`, `cg0 = gT/4π`
(deep water). So the drawn height at every depth is `Hs·Ks(h)` where it should
be `Hs·Ks(h)/Ks(15.03)`; the ratio is exactly `Ks(15.03; T)`, at the break as
at the contour. The month table (`pp_monthly_ocean.js`) divides `hsP75` by
`_ks_model(14.8, 15)` = `sqrt(cg0/sqrt(g·15))` = 0.9759 — the shader's
convention *before* commit 09c7f4a (finite-depth `groupVelocityAt`, 2026-08-26)
— and the shader re-shoals at the **card** T (`setMonth` restores it), so the
month path's error is `Ks_finite(T_card, 15.03)/0.9759 − 1`. The builder's
comment even says so ("full linear dispersion gives 1.05 where this gives
0.98 … the point is to invert what the model will re-apply"): the inversion
was right and the target moved.

| T (s) | h/L₀ | Ks(15.03 m) | Ks(10 m) | Ks(15.03) at MLLW / MHHW | builder Ks (shallow, 15 m) | `#day=live` over-force | `#month=` over-force at this card T |
|---|---|---|---|---|---|---|---|
| 12 | 0.067 | 0.9731 | 1.0391 | 0.9814 / 0.9666 | 0.8788 | **−2.7 %** | −0.3 % (Privates) |
| 13 | 0.057 | 0.9966 | 1.0703 | 1.0061 / 0.9890 | 0.9147 | −0.3 % | **+2.1 %** (Jack's, Hook, Sharks) |
| 14 | 0.049 | 1.0212 | 1.1016 | 1.0317 / 1.0127 | 0.9492 | **+2.1 %** | **+4.6 %** (First, Second) |
| 14.8 | 0.044 | 1.0413 | 1.1267 | 1.0526 / 1.0322 | 0.9759 (the one used) | +4.1 % | +6.7 % |
| 15 | 0.043 | 1.0464 | 1.1329 | 1.0578 / 1.0371 | 0.9825 | **+4.6 %** | **+7.2 %** (Sewers) |
| 16 | 0.038 | 1.0719 | 1.1639 | 1.0841 / 1.0619 | 1.0147 | **+7.2 %** | — |
| 16.67 | 0.035 | 1.0890 | 1.1845 | 1.1018 / 1.0786 | 1.0358 | **+8.9 %** (both field days) | — |
| 17 | 0.033 | 1.0975 | 1.1945 | 1.1105 / 1.0868 | 1.0460 | **+9.8 %** | — |

Full table 8–18 s: `assets/forcing-2026-09-23/q1_deshoal.json`. Ks at 10 m is
listed because "the 10–15 m contour" appears in the notes; SC116 is at 15.03 m
and 10 m is not its depth — using it would over-correct by 6–9 %.

**The sign flips at 13 s.** Below h/L₀ ≈ 0.056 (T ≈ 13 s at 15 m) Ks < 1 —
intermediate-depth waves are *smaller* than their deep-water height before
they grow — so a 12 s windswell day is under-forced by 2.7 % and a 17 s
groundswell over-forced by 9.8 %. The card bank's three 13 s spots are within
0.4 % on the live path and 2.1 % over on the month path.

**A second convention residual, recorded and not corrected.** `H0` is the
envelope *peak*: `amp = 0.5·Heff·grow·decay·env`, `env ∈ [0.15, 1.0]`. `Hs` is
the mean of the highest third. For a Rayleigh sea `H_1/10 = 1.27·Hs` and
`H_mean = 0.63·Hs`, so feeding `Hs` as the set-peak draws the set peak 21 %
under and the cycle mean (`0.575·Hs`) 8 % under. It opposes the double
shoaling and is larger; it is a modelling choice about what `H0` *means*,
not a datum error, and `VIS` sits on top of both. Stated so the two are not
netted silently.

**Proposed correction (opt-in, not implemented in the renderer).**

    H0' = Hs_site / Ks_finite(T, 15.03 m)          # equivalent deep-water height

Refraction is *not* divided out: MOP carried the swell through it and the
default path applies no Kr from deep water (the Ψ bake starts at the stated
reference depth only under `#direction=`). Python `deshoal_h0()` in the
script; JS `deshoalH0()` in `scripts/lib/deshoal.mjs` (imports
`dispersion.js`, nothing in `web-three/` imports it). Flag design in §7.

## 2. Card representativeness

Frame: a card `H0` is deep-water by declaration, so it is carried to 15.03 m
with the model's own `Ks(T)` and to SC116 with the spot transect's
hour-matched year-p50 ratio (`pp_mop_alongshore.json`: SC117/Sewers 1.08,
SC114/Jack's 0.97, SC112/Hook 0.92, SC111/Sharks 0.917, SC109/Privates 0.90;
First Peak has no transect and takes SC116's 1.00). Rank = % of 2000–2024
flag-1 hours (n = 218,975) strictly below; `Tp` is band-quantised (14.29,
15.38, 16.67, 18.18 s), so its rank is the % of hours in a lower band; `Ta` is
the continuous mean period and runs 4–5 s under `Tp` here.

| preset | card H0 / T | Hs at 15 m | Hs at SC116 | rank all | DJF | JJA | h/yr ≥ (all) | joint ≥Hs & Tp ≥ T−0.8 s: all / DJF | Tp rank | Ta rank |
|---|---|---|---|---|---|---|---|---|---|---|
| Sewers | 2.2 / 15 | 2.30 | 2.13 | **p99.0** | p96.5 | p100 | 90 | 0.71 % / 2.46 % | p57 | p99 |
| First Peak | 1.8 / 14 | 1.84 | 1.84 | p98.0 | p93.6 | p100 | 175 | 1.37 % / 4.54 % | p33 | p98 |
| Second Peak | 1.5 / 14 | 1.53 | 1.53 | p96.0 | p87.7 | p100 | 354 | 2.70 % / 8.41 % | p33 | p98 |
| Jack's | 1.1 / 13 | 1.10 | 1.13 | p89.4 | p72.0 | p99.7 | 927 | 8.14 % / 21.7 % | p22 | p95 |
| The Hook | 1.5 / 13 | 1.49 | 1.62 | p96.7 | p89.9 | p100 | 286 | 2.34 % / 7.4 % | p22 | p95 |
| Sharks | 1.0 / 13 | 1.00 | 1.09 | p88.1 | p69.5 | p99.6 | 1040 | 9.22 % / 23.8 % | p22 | p95 |
| Privates | 0.7 / 12 | 0.68 | 0.76 | p67.5 | p41.6 | p91.2 | 2846 | 26.9 % / 48.1 % | p17 | p90 |

**Sewers 2.2 m at 15 s** is a deep-water number by declaration, and read
either way it is a rare hour: 2.13 m SC116-equivalent is p99.0 year-round
(90 h/yr at or above), p96.5 in winter; with the period condition, 0.7 % of
all hours and 2.5 % of DJF hours; read naively as the SC116 Hs, 2.2 m is
p99.1. The card bank describes the top 1–4 % of hours at the apex spots and
the top 10–12 % down-point, and July–August contain none of it (SC116's
25-year August maximum is 1.224 m). The card *periods* are ordinary (p22–p57
of Tp) — the bank is size-selected, not period-selected, which matches the
builder's finding that the spectral peak is 14.4–15.2 s in every month.

**Month entries.** `hsP75` reproduces as the month's p75 to ±0.1 % (rank
check 74.9–75.0). The shipped `H0` = `hsP75/0.9759`; the correct
de-shoal is `hsP75/Ks_finite(T_card)`:

| month | hsP75 (SC116) | H0 shipped | H0' at T 13 / 14 / 15 | shipped over-force at T 13 / 14 / 15 |
|---|---|---|---|---|
| January | 1.215 | 1.245 | 1.219 / 1.190 / 1.161 | +2.1 / +4.6 / +7.2 % |
| February | 1.160 | 1.189 | 1.164 / 1.136 / 1.109 | " |
| March | 1.012 | 1.037 | 1.015 / 0.991 / 0.967 | " |
| April | 0.836 | 0.857 | 0.839 / 0.819 / 0.799 | " |
| May | 0.736 | 0.754 | 0.739 / 0.721 / 0.703 | " |
| June | 0.689 | 0.706 | 0.691 / 0.675 / 0.658 | " |
| July | 0.603 | 0.618 | 0.605 / 0.590 / 0.576 | " |
| August | 0.571 | 0.585 | 0.573 / 0.559 / 0.546 | " |
| September | 0.676 | 0.693 | 0.678 / 0.662 / 0.646 | " |
| October | 0.782 | 0.801 | 0.785 / 0.766 / 0.747 | " |
| November | 0.886 | 0.908 | 0.889 / 0.868 / 0.847 | " |
| December | 1.185 | 1.214 | 1.189 / 1.160 / 1.132 | " |

At T 12 (Privates) the shipped table is within 0.3 % by accident of the sign
flip. Every other spot's month is 2–7 % high, in the same direction as the
live path. Against the peel floors this flips nothing: over the 72
month × floored-spot pairs the tide-0 verdict is the same before and after
correction (`q2_cards.json` `month_floor_verdicts`); the tightest clears
after correction are Jack's October (0.785 m against a 0.78 floor) and
Second Peak February (1.136 against 1.11), and the 0.585–0.706 m summer
block is under every floor either way.

## 3. The pre-registered days

**Coverage.** `SC116_hindcast.nc` still ends 2025-03-31T23:30Z
(`time_coverage_end`; `date_modified` 2025-04-10). `SC116_nowcast.nc` now
starts 2025-04-01T00:00Z and ran to 2026-09-24T03:30Z at fetch time — 12,988
hourly records, not the "~16 months rolling" `CDIP_LIVE_DATA.md` describes;
it is the hindcast's continuation. Both days are in it, nothing has rolled
out, and no newer hindcast file exists for SC116 (catalog checked). Both
records are buoy-forced (`waveModelInputSource`
`071p1-222p1-157p1-029p1-642p1:157p1-642p1-156p1-626p1`), not WW3.

**Time base.** Nowcast stamps are on the hour UTC with ±30 min bounds, so
15:28 PDT = 22:28Z falls in record 12046 (22:00Z, bounds 21:30–22:30Z) and
11:12 PDT = 18:12Z in record 12546 (18:00Z). Tide is CO-OPS 9413450 on
**MSL, metric** — the model's own axis — interpolated on the 6-min series to
the clip minute; "observed" is the verified (08-15) / preliminary (09-05)
water level.

| | 2026-08-15 15:28 PDT | 2026-09-05 11:12 PDT |
|---|---|---|
| SC116 record | 12046 · 22:00Z | 12546 · 18:00Z |
| `waveHs` | **0.778 m** (neighbours 0.874 → 0.776 → 0.793 over 19–01Z) | **0.910 m** (0.838 → 0.928 over 15–21Z) |
| `waveTp` / `waveTa` | 16.67 s / 13.50 s | 16.67 s / 12.94 s |
| `waveDp` | 187.5° | 189.4° |
| flag | 1 (good) | 1 (good) |
| the note reported | 3 ft (0.91 m) at 16 s, SSW 202°, tide 4.0 ft after 5.2 ft high 13:22 | 0.902 m, 16.67 s, 188.5° (08:00 record was 0.828 / 16.7 / 189) |
| tide predicted, MSL | +0.373 m (4.05 ft MLLW) | +0.140 m (3.29 ft MLLW) |
| tide observed, MSL | **+0.500 m** (4.47 ft MLLW, verified) | **+0.316 m** (3.86 ft MLLW, preliminary) |
| non-tidal residual | **+0.127 m** | **+0.176 m** |
| CO-OPS hi/lo, Monterey (ft MLLW) | H 5.035 @ 13:24, L 1.44 @ 19:23 | L 3.286 @ 11:08, H 5.777 @ 17:39 |
| CO-OPS hi/lo, Santa Cruz 9413745 | H 4.884 @ 13:18, L 1.426 @ 19:12 | L 3.253 @ 10:57, H 5.604 @ 17:33 |
| Ks(15.03) at the record Tp | 1.089 | 1.089 |
| H0' de-shoaled | 0.714 m at 16.67 s | 0.836 m at 16.67 s |

The 08-15 Surfline figures (3 ft, 202°) do not match SC116 (0.78 m, 187.5°):
a different model, a different node, and a nearshore "surf height" rather
than Hm0. The 5.2 ft high at 13:22 is not CO-OPS at either station (4.88 /
5.04 ft). The 09-05 numbers in the task brief (0.902 / 16.67 / 188.5) were
the nowcast as it stood then; the record has since been re-run to 0.910 /
16.67 / 189.4 as buoy data finalised, which is the drift to expect from a
nowcast product.

**The hashes.** There is no `#T=` parameter; period rides on `day=`
(`conditions.js`), and `#h0=` and `#tide=` outrank the day's own values
(`main.js` reads them after `day=`). `#h0=` is clamped to [0.4, 3.0] and not
snapped, so three decimals survive. `cam=` is deliberately absent — the
Lookout and cam-pose tracks own it. `day=` chosen as the one whose T is
nearest the best period evidence for that clip: the in-clip carrier for
08-15 (16.25 s, r = 0.942), the nowcast band centre for 09-05 (16.67 s; the
0.06 Hz band spans 16.0–17.4 s, so 16 and 17 are both inside it).

```
2026-08-15 15:28 PDT  (record 12046; day=overhead gives T 16, chop 0.1, dF 0.005)
  as shipped (live convention, H0 := Hs)   #preset=secondpeak&day=overhead&h0=0.778&tide=+0.50
  de-shoaled  (H0 := Hs / Ks(16 s, 15.03)) #preset=secondpeak&day=overhead&h0=0.726&tide=+0.50
  predicted-tide variants: tide=+0.37      (for cross-reference with the note's 4.0 ft)
  alternate period, day=big (T 17):        h0=0.778 / de-shoaled h0=0.709

2026-09-05 11:12 PDT  (record 12546; day=big gives T 17, chop 0.05, dF 0.004)
  as shipped                               #preset=secondpeak&day=big&h0=0.910&tide=+0.32
  de-shoaled  (H0 := Hs / Ks(17 s, 15.03)) #preset=secondpeak&day=big&h0=0.829&tide=+0.32
  predicted-tide variants: tide=+0.14      (FIELD_CAPTURE §1's 11:00 value)
  alternate period, day=overhead (T 16):   h0=0.910 / de-shoaled h0=0.849
```

Both days sit above every spot's `tideBandM` (top edge 0.00/+0.01 m) at
either tide value, so `peelFloorH0()` declines at every spot and the H0 draws
raw whichever hash is used; the de-shoal changes the *drawn height*, not the
clamp verdict, on these two days. It does change the pre-registration's
stated prediction: FIELD_CAPTURE §2 compared 0.828 m to `floorH0` "as-is"
and found Jack's (0.78) and Sharks (0.81) cleared; de-shoaled, 0.828/1.0898
= 0.760 m clears neither. At 11:12 (0.910 → 0.836) both clear again. The
comparison was made in the wrong frame; the floor is on the deep-water axis.

## 4. Set structure

Authored `dF` 0.006–0.008 Hz (cards) is 1/Δf = 125–167 s; `day=big` 0.004
(250 s) and `day=overhead` 0.005 (200 s) are longer still. The nowcast's
12,988 twenty-band spectra were reduced the way PP_SPECTRAL_SETS reduced the
hindcast (Hm0 closure 0.0000 m):

| swell-band cutoff | σ_f nowcast (all hours) | set period | σ_f hindcast 2000–24 | set period |
|---|---|---|---|---|
| 0.090 Hz (T ≥ 11.1 s) | 0.0099 Hz | 101 s | 0.0082 | 122 s |
| 0.100 Hz | 0.0124 | 81 s | 0.0104 | 96 s |
| 0.110 Hz | 0.0145 | 69 s | 0.0154 | 65 s |
| 0.125 Hz (T ≥ 8 s) | 0.0176 | 57 s | 0.0187 | 53 s |
| 0.160 Hz | 0.0261 | 38 s | 0.0275 | 36 s |
| 0.250 Hz | 0.0487 | 21 s | 0.0441 | 23 s |
| 0.400 Hz | 0.0706 | 14 s | 0.0500 | 20 s |

**Honest range.** Restricting to the swell band alone (0.09–0.10 Hz cutoff)
the spectral-width bridge gives 0.008–0.012 Hz, i.e. **81–122 s**; across
every defensible cutoff, 0.008–0.071 Hz (**14–122 s**), a 7.1× swing on the
nowcast against 6.1× on the hindcast. The card `dF` (0.006–0.008) sits at
the long edge of the swell-band-only estimate and outside every other one —
but the grid spacing at the swell peak is 0.005 Hz, so nothing below
0.010 Hz is resolvable, and the bridge is set by the analyst's cutoff
(PP_SPECTRAL_SETS §4, unchanged). The spectra bound Δf from above at the
resolution floor and from nowhere below. **Not contradicted, not supported;
do not retune `dF` from this.** The one source that could is the rendered
field itself (temporal harness), which measured 120.5–122.4 s at Sewers
against an authored 125 s.

**The floor `m` is still consistent.** Estimator A (adjacent-band amplitude
ratio at the peak, Hs ≥ 1 m, n = 1,159 nowcast hours):

| separation | nominal Δf | floor, stronger neighbour: nowcast / hindcast | weaker: nowcast / hindcast |
|---|---|---|---|
| 1 band | 0.005 Hz | 0.038 / 0.058 | 0.168 / 0.134 |
| 2 bands | 0.010 Hz | 0.154 / 0.143 | 0.365 / 0.281 |
| 3 bands | 0.015 Hz | 0.209 / 0.210 | 0.555 / 0.439 |

Interpolated to the model's 0.006 Hz: **0.061–0.208** (nowcast) against
0.075–0.163 (hindcast) and the duty-cycle fit 0.143. The shipped floor 0.15
(`m = 0.425`) is inside all three. The nowcast bracket is wider because
1,159 hours is 3.5 % of the hindcast's sample and the neighbour choice is
still the dominant term (§7.1's 2.33×); it does not move the landed value.

## 5. Tide datum chain

CO-OPS 9413450 (Monterey), `datums.json?units=metric`, epoch 1983–2001,
accepted 2011-10-07, station datum metres: MSL 1.893, MLLW 1.031, MHHW 2.657,
NAVD88 0.988, MHW 2.443, MLW 1.364, LAT 0.439, HAT 3.185 (2025-12-05).

| link in the chain | model constant | where | CO-OPS | Δ |
|---|---|---|---|---|
| MSL − NAVD88 | 0.905 | `pp_depth_patches*.js mslAboveNavd88M`, `bed.js MSL_ABOVE_NAVD88` | 1.893 − 0.988 = 0.905 | 0.000 |
| MLLW about MSL | −0.862 | `TIDE_RANGE[0]` | 1.031 − 1.893 = −0.862 | 0.000 |
| MHHW about MSL | +0.764 | `TIDE_RANGE[1]` | 2.657 − 1.893 = +0.764 | 0.000 |
| reef ceiling | −0.5 m NAVD88 | `bed.js REEF_CEIL_EL` | = −1.405 m MSL = −0.543 m below MLLW | authored, consistent |
| observed extremes about MSL | not accepted | `TIDE_FLOOR` §1 says so | −1.592 (2009-01-11) / +1.539 (1983-01-27) | as documented |
| HAT / LAT about MSL | — | — | +1.292 / −1.454 | HAT set 2025-12-05 |
| epoch | — | — | 1983–2001 NTDE still the accepted set on 2026-09-23 | the 2002–2020 NTDE, when adopted, moves MSL/MLLW/MHHW by the ~19-year trend, order 0.02–0.04 m |
| **Santa Cruz 9413745** | not used | FIELD_CAPTURE §1 (log only) | subordinate (type S) of 9413450: no datums published; predictions = Monterey × 0.97 (highs) / 0.99 (lows) on MLLW, −6 / −11 min | at +0.4 m MSL: −0.01 to −0.04 m; 8 min on a tide falling 0.26 m/h: −0.03 m |
| MSL − NAVD88 at Pleasure Point itself | assumed = Monterey | 40 km apart | VDatum REST returned errorCode 412 on four attempts | **unresolved**, expected a few cm |
| **non-tidal residual on the field days** | not modelled | — | +0.127 m (08-15), +0.176 m (09-05) | the largest term in this table |

Every constant reproduces CO-OPS exactly; the chain is sound. What is not in
the chain: the residual (wind setup, pressure, the September value is
preliminary), the epoch, and the Pleasure Point–Monterey MSL separation, in
that order of size. Santa Cruz's subordinate offsets are below all three and
publish no NAVD88 tie, so Monterey remains the only path from the DEM to the
water; a same-hour comparison should use the Monterey *observed* level, not
Santa Cruz's prediction.

## 6. Direction

Over 2000–2024, 33,039 hours had Hs > 1 m at SC116; **8.4 % of them arrive
outside 188–216°** (5.7 % below 188°, 2.7 % above 216°), 4.6 % outside the
p1–p99 band 187–221°; the surf-hour Dp median is 204.5° (p5 187.6, p95
213.4). By season: DJF 8.6 %, MAM 8.4 %, SON 8.2 %, JJA 3.6 % (552 hours).
The 2025-04→2026-09 nowcast runs hotter on the west side — 10.8 % outside,
8.0 % of it above 216°, 11.7 % of DJF surf hours — the kind of spread an
18-month window shows against 25 years. So the "condition, not character"
assumption is violated one surf hour in twelve, and when it is, the swell is
usually *south* of the band (more S, less wrapped NW), not west of it. One
datum correction while here: `metaShoreNormal` in both SC116 files and column
8 of the transect definitions is **136.46°**, not the "~200°" that
`CDIP_LIVE_DATA.md:95` quotes and `MODEL.md` §2.6.5 flags as unverified;
136° sits inside the model's own 115–169° estimator range, and the median
surf-hour incidence at MOP's own normal is +68° (all), +56° (JJA) — grazing,
as §2.6.5's corrected +42…+70° says. Nothing in the SC116 file is near
200°; the nearest transect normal to it is SC118's 189.98°, two transects
west, so the "200°-ish" was never SC116's.

## 7. What changes the picture, ranked by visible effect

1. **Tide residual, +0.13–0.18 m on both field days.** The floor moves
   0.53–0.65 m of H0 per metre of tide and reef activation ~0.55 m/m
   (TIDE_FLOOR §3), so 0.15 m of unmodelled water is worth 0.08–0.10 m of
   H0 — the same size as the whole Ks correction on those days (0.06–0.08 m)
   and on the axis the break line is most sensitive to. Any same-hour
   comparison must use the observed 9413450 level; the hashes above do.
   *Not a model change: a comparison-protocol rule.*
2. **De-shoal the derived oceans** (`#deshoal=1`, default 0). Applies to
   `day=live` and `#month=` only; card H0 and `#h0=` are the author's own
   number and pass through. `applyOcean()`: `state.H0 = clamp(deshoalH0(o.hs,
   o.tp) ?? o.hs)`; `setMonth()`: divide `hsP75` by `Ks_finite(card.T, 15.03)`
   at runtime and regenerate `pp_monthly_ocean.js` to carry `hsP75` alone
   (the builder's `_ks_model` is stale and should go, not be fixed). HUD:
   `H0 = Hs/Ks(15 m) = x.xx m`. Visible effect: −2 to −10 % height on live
   groundswell days, −5 to −7 % on winter months at 14–15 s spots; the
   break line moves shoreward by the same fraction of `h_b`. Changes no
   floor verdict on any shipped month or either field day; changes the
   FIELD_CAPTURE §2 prediction (§3 above).
3. **`Hs` as set-peak vs `Hs` as `H_1/3`.** Larger than 2 and opposite in
   sign (−21 % at the set peak under Rayleigh). A `#hsref=peak|mean` flag
   would scale derived H0 by 1.27 (or 1/0.575 for cycle-mean matching).
   Left as a stated convention: it is a claim about what a monochromatic
   `H0` means, and `VIS` is already an authored exaggeration on top of it.
4. **Transect gradient at the 15 m contour** (SC117 1.08× to SC109 0.90×):
   a `#month=` p75 applied at every spot is 8 % high at Sewers and 10 % low
   at Privates before the reef does anything. Already recorded in
   REEF_ACTIVATION §5; folds into 2 as a per-spot ratio if wanted.
5. **Period quantisation.** `waveTp` is a band centre (16.67 s covers
   16.0–17.4 s) and the app has no `#T=`, so a live day lands on 16 or 17 s;
   Ks differs by 2.4 % between them and the drawn wavelength by 6 % at the
   break to 13 % in deep water.
   Smallest fix: a `#T=` hash parameter (round-trip, clamped 8–18), which
   `applyOcean` already effectively has in `state.T`.
6. **Direction**, 8 % of surf hours off-band. Unwired by design (§2.6);
   nothing here changes the gating on Track 1.
7. **Datum epoch and the PP–Monterey MSL separation**, 0.02–0.05 m
   together. Below the 0.01 m tide-band rungs only in the sense that both
   field days are 0.3–0.5 m above every band; they would matter for a
   low-tide comparison sitting on a band edge.

## 8. What would falsify this

- **Q1** falls if `waveHs` were a deep-water-equivalent height rather than
  Hm0 at the site. The file attributes (`metaWaterDepth` 15.03, no
  "deep-water" anywhere in the DAS, Hm0 closure against the 20-band spectrum)
  say it is at the site; a CDIP statement that MOP bulk parameters are
  back-shoaled to deep water would reverse the sign of the correction. It
  would also fall if the shader's `cg0` were the 15 m group speed rather than
  `gT/4π` — it is not (`model-glsl.js:715`).
- **Q2** ranks move with the transect ratio (year p50 used; the p10–p90 of
  the hour-matched ratio is 1.04–1.11 at Sewers) and with the frame: quoting
  the deep-water number as if it were the SC116 Hs changes Sewers from p99.0
  to p99.1 and Privates from p67.5 to p60.5. A card that a reader wants
  to be "typical winter" rather than "top 3 % of winter" is an authorship
  question, not this audit's.
- **Q3** hashes depend on the nowcast not being re-run again for August
  2026 (the 09-05 record already moved 0.902 → 0.910) and on the 09-05 water
  level being verified at its preliminary value; re-run `audit_forcing.py`
  (online) and diff `q3_days.json`. The 08-15 `day=overhead` choice falls if
  a longer clip measures the carrier above 16.5 s.
- **Q4** is a null with a range: a source with < 0.003 Hz spacing near
  0.069 Hz could resolve the authored Δf; neither MOP nor buoy 156 has it.
  The floor bracket moves if the peak is defined on density `E` rather than
  band energy `E·bw` (bands are equal 0.005 Hz below 0.075 Hz, so only
  peaks at 0.0813–0.1 Hz differ).
- **Q5** falls the day CO-OPS adopts the 2002–2020 epoch for 9413450; the
  three constants should then be re-derived from `datums.json` and will move
  by a few cm together.
- **Q6** is a fraction over flag-1 hours (99.9 % of the record, so the flag
  cannot move it) and over the band as MODEL.md states it; it is 7.1 % over
  all hours regardless of size, and the 18-month nowcast window reads 10.8 %,
  which is the sampling spread to expect, not a trend.

## 9. Sources

All fetched 2026-09-23/24 UTC. Raw responses in `qa/forcing-audit/`
(gitignored); the script re-fetches anything missing.

- `https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_alongshore/SC116_hindcast.nc` — `.dds`, `.das`, `.ascii` bulk (waveTime, waveHs, waveTp, waveTa, waveDp, waveFlagPrimary) in 20k chunks via `build_cdip_climatology._pull`; `.ascii?metaWaterDepth,metaShoreNormal,waveFrequency,waveBandwidth`
- `https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_alongshore/SC116_nowcast.nc` — `.dds`, `.das`, `.ascii` bulk `[0:1:12987]`, `.ascii?waveEnergyDensity[0:1:12987][0:1:19]`, `.ascii?metaWaterDepth,metaShoreNormal,waveFrequency,waveBandwidth`, `.ascii?waveModelInputSource[12040:1:12050],waveTimeBounds[12046:1:12046][0:1:1]` and the same at 12540–12550 / 12546. (curl needs `-g`: the OPeNDAP brackets are otherwise globbed and the request silently fails with exit 3.)
- `https://thredds.cdip.ucsd.edu/thredds/catalog/cdip/model/MOP_alongshore/catalog.html` — SC116 product list (nowcast, forecast, hindcast; no newer hindcast)
- `http://cdip.ucsd.edu/MOP_v1.1/CA_v1.1_transect_definitions.txt` — column definitions; SC116 row
- `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9413450/datums.json?units=metric`
- `https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations/9413745/datums.json?units=metric` (all null), `…/9413745.json`, `…/9413745/tidepredoffsets.json`
- `https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?station=9413450&product=predictions|water_level&datum=MSL&units=metric&interval=6&time_zone=lst_ldt&begin_date=20260815|20260905&end_date=…&format=json`
- `…datagetter?station=9413450|9413745&product=predictions&datum=MLLW&units=english&interval=hilo&…` (both days)
- `https://vdatum.noaa.gov/vdatumweb/api/convert?…s_v_frame=NAVD88&t_v_frame=LMSL…` at Pleasure Point, SC116 and Monterey — errorCode 412 on all four calls, unresolved

Reproduce: `python3 scripts/audit_forcing.py` (online, ~3 min: 5 MB hindcast
bulk + 3.5 MB nowcast spectra) or `--offline` once `qa/forcing-audit/` and
`data/climatology/.cache/` exist; `node --test tests/deshoal.test.js`.
