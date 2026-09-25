# Sections own the crash (2026-09-24)

Track K of the second curl wave. Two flags, both default byte-identical
(build defines, the `#roller`/`#tube` precedent; parity below):

- **`#gapfix=1`** — the one multiply the verifier proposed
  ([SECTION_GAP_FOAM](SECTION_GAP_FOAM_2026-09-24.md) §5): `pocket *= mask`
  at its source, plus the crest companion `crest = crestNear·(1 − brk·mask)·env²`.
  Measured: every gap column at Sewers loses its pocket head and its fold and
  keeps its crest; the open-line head is unchanged to three decimals.
- **`#sectioncurl=1`** — ξ becomes a station quantity, `xiAt(x)`. The steady
  head falls to a spilling value; where the section field `breakLine` already
  reads steps the line seaward ahead of the head, ξ rises to `#sectionxi`
  (0.95) and the whole plunging chain — lifecycle impact bell and front speed,
  bend, fold reach, curtain gate, profile weight, spray, splash, `lipFoam`,
  crumb, steepness `q`, pocket tint — inherits it through one `plungeAt(x)`.
  Measured at Second Peak: the section at x = 15 goes wall → curtain → plume
  → bore in 1.7 s on the station's own lifecycle clock (curl 0 → 0.55 → 0,
  fold 0 → 7.1 m) while the head at x = 82–88 crumbles (curl ≤ 0.10) through
  the same clocks. The default at the same station peaks at curl 0.17.

What it is not: a tube. The section's peak plunge weight is 0.68 and the
fold reads as the grid's angular white polygon (the LIP_FACETS class), not a
lip with a cavity. And `tube.js` still reads `u_xi` (not this track's file),
so a `#tube=1` ribbon draws at the spot ξ under the flag.

## 1. The gap fix, measured

`scripts/probe_section_gap_foam.mjs --arms=base,gapfix` (per-column GPU
transect maxima through `__pointbreak.curlProbe`, |x| ≤ 240 m, 328 columns,
card forcing, `cam=drone`, `q=high`). "gap" = `breakMask` < 0.5. Data:
`qa/section-curl-2026-09-24/gapfix_probe.json` (gap-column rows kept, the rest
stripped for the qa budget).

| cell | arm | gap cols | `pocket` > 0.7 | fold > 1.5 m | fold max | heads in gap | `crest` > 0.5 | open-line head (x, curl, fold) |
|---|---|---:|---:|---:|---:|---|---:|---|
| Sewers 42 | base | 45 | 12 | 23 | 12.97 m | 2 (x −133.0, −108.1) | 45 | 7.6, 0.519, 14.592 m |
| | gapfix | 45 | **0** | **0** | 1.16 m | **0** | 45 | 7.6, 0.519, 14.592 m |
| Sewers 46 | base | 45 | 21 | 20 | 15.17 m | 1 (x −84.7, feather 0.19) | 45 | −59.8, 0.707, 11.137 m |
| | gapfix | 45 | **0** | 1 | 2.52 m | **0** | 45 | −59.8, 0.707, 11.137 m |
| Sewers 50 | base | 45 | 11 | 10 | 15.56 m | 2 (x −121.3, −93.5) | 43 | −40.7, 0.731, 11.625 m |
| | gapfix | 45 | **0** | **0** | 0.34 m | **0** | 45 | −40.7, 0.731, 11.625 m |
| Second Peak 42 | base | 16 | 0 | 0 | 0 | 0 | 16 | (pocket max in gap 0.288) |
| | gapfix | 16 | 0 | 0 | 0 | 0 | 16 | (pocket max in gap 0.006) |

- The pocket maximum inside the gap goes 0.995 → 0.228 (sim 42), 1.0 →
  0.367 (46), 0.996 → 0.052 (50): what survives is the 3-texel feather, where
  the mask is between 0 and 1 by design. The one remaining fold > 1.5 m at
  sim 46 (2.5 m) is on that feather.
- `brk`, `foam` > 0.5 and the lifecycle terms are unchanged in the gap (45/45
  both arms): the whitewater blocks keep their present edge, as §5 predicted.
  Nothing outside the gap run (x −146…−82) and its feather moves; the
  open-line "fold > 1.5 m" count drops by one at sims 42 and 46 because the
  feather columns with mask 0.5–1 are counted as open.
- **The crest companion, at the line.** The per-column `crest` maximum is
  dominated by approaching crests seaward of the line (45/45 both arms), so it
  was measured on the shoreward side of the line (z ∈ [z_b, z_b + 12 m]) at
  the two gap heads and head A, Sewers sim 42: head C (x −108.1, `brk` at the
  line 0.967) crest 0.765 → **0.995**; head B (x −133.0, `brk` at the line
  0.094 — the crest there is still seaward of the inside ramp) 0.921 → 0.922;
  head A (open line) 0.771 → 0.771. The gap now draws the crest passing
  through where `(1 − brk)` had removed it.

Frames (og pose, the card's 640×376 clip at DSF 2, heads at 3×):
`qa/section-curl-2026-09-24/og_default_42.jpg` vs `og_gapfix_42.jpg`,
`og_{default,gapfix}_42_head{B,C}.png`. In the default the two whitewater
blocks each end at the gap edge with a bright angular polygon capping the
edge (B on the upper block, C alone on dark water lower right); under
`#gapfix` both polygons are gone, the blocks' edges are where they were, and
a dark crest ridge runs on through the gap where the polygons stood. Head C at
3× goes from a white faceted plate to a dark crest line with a faint foam
smear at its foot (the residue floor, which `brk` keeps).

**The two documented claims, reconciled in code** (`web-three/js/bed.js`
gapArr comment; `shared/model-glsl.js` `ocean()` at `mask`): "rendered as NOT
BREAKING" means no breaking *event* at the line — no lifecycle impact / bore
/ spray, no aerated lip or curtain, and under `#gapfix` no pocket head, fold
or pocket-lip paint, with the crest drawn through. It does not mean the water
past the depth limit is un-broken: `brk` stays depth's permission, so the
residue floor and the hump gate keep their whitewater. The defect was a
pocket-keyed head on a line segment that is transport, not a crest; `brk`
surviving the gap was deliberate and stays.

## 2. Sections as the plunging events — the design

Five lines:

1. **One field.** `sectionNoise(x)` is the noise `breakLine` already reads
   (`vnoise1(xx·0.02 + 7.3) − 0.5`, one `#define` so the two readers cannot
   drift); the line is pulled seaward by `u_sections·110·min(noise, 0)` m.
2. **Where a section shuts** is the *leading flank* of a pull: the analytic
   slope of that field (`sectionNoiseSlope`, exact, no second sample) where
   the pull increases with the peel coordinate. There the crest — which
   arrives in the order of z_b — reaches the stations ahead of the head
   before or with the head, so a stretch breaks nearly at once: the
   closeout inside the peel that the footage calls a section walling up. The
   pull's core and trailing flank resume the peel's order, already broken,
   and read as bore. `sectionShut(x) = smoothstep(0.25, 0.65, slope) ·
   smoothstep(0, 0.1, pull) · smoothstep(0.05, 0.15, σ_h) · step(0.05, σ_h)`.
3. **Effective ξ.** `xiAt(x) = mix(min(ξ, 0.42), max(ξ, sectionxi),
   sectionShut(x))`; `plungeAt(x) = smoothstep(0.45, 1.25, xiAt(x))`. Every
   consumer of the old spot constant reads these two names.
4. **The clock is the station's own lifecycle** (`breakerLifecycleAtX` age at
   the line): bend accelerating as u² to `CRASH_PEAK_S` = 0.42 s (the wall,
   then the curtain as the bend passes the curtain's 0.30-turn gate),
   impact bell σ 0.20 s and release over 1.5 σ (the plume), bore window from
   0.18–0.55 s fading 2.6–3.8 s. No event clock was added; the plunge weight
   only sets how hard each station does what it already did.
5. **Default build compiles the shipped text.** Under no `SECTION_CURL`
   define, `xiAt(x)` and `plungeAt(x)` are macros for `u_xi` and
   `smoothstep(0.45, 1.25, u_xi)`; under no `GAP_FIX` define the two pocket /
   crest lines are the shipped ones. A uniform-branch version was measured
   at 4–6 default pixels by 1/255 and one float ulp of displaced z against
   pristine main (ANGLE-Metal contraction), which is why the defines exist.

Authored numbers and their basis:

| number | value | basis |
|---|---|---|
| spilling ξ at the head | `min(ξ, 0.42)` | under the Battjes 0.45 foot of the shared ramp (plunge exactly 0); inside the bed's own ξ₀ 0.23–0.44 at every card state ([CURL_TRUTH](CURL_TRUTH_2026-09-24.md) §3) |
| section ξ (`#sectionxi`) | 0.95 → plunge 0.68 | the curtain's 0.30-turn gate opens near plunge 0.5 (`rollerContactGain`'s calibration) and Sewers' authored 1.15 is 0.96; the field's curtain is 0.5–0.6 H_f with the lip ≤ 0.3 H_f ahead of the face (§1.3), a modest plunge. A spot authored higher keeps its own value at its sections |
| slope ramp | 0.25 → 0.65 of the steepest flank the field can make (slope = d pull / d xx × 25 m; a full 0→1 swing over half a lattice reads 1.5) | 0.65 is what Second Peak's one on-reef lobe (x 20–48, amplitude 0.6) reaches; 0.25 is below any flank that pulls the line a metre. Names one quarter-lattice: 12–16 m |
| σ_h ramp | 0.05 → 0.15 | anchored on the one spot with footage: the clip is Second Peak (σ_h 0.15) and its one crash is a section shutting; Privates' 0.05 is the DEM's peel with no reef patch (MODEL 2.1) and the same `step(0.05)` that arms `breakLine`'s shift; Jack's / Sharks (0.10) at half weight |
| pull gate | `smoothstep(0, 0.1, pull)` | the flank counts only once the line is in fact pulled (`breakLine` clips positive noise) |

Where the field puts sections (x-only; `probe_section_curl.mjs` "lobes",
`shut` ≥ 0.25): Second Peak x 13.5–29.6 (16 m, on the reef, `shut` 1, ξ
0.95) and x 113–131 (18 m, reef 0.2–0.5); Sewers x −92…−70 (22 m, but its
up-point half is the section gap, mask 0–0.8) and x 13.5–29.6 (reef
0.7–0.83). The deep lobes at x −72…−56 and x 132–148 that the depth reading
would have named are at reef 0 at Second Peak — a fact about the shipped
field's seed, and the reason the flank reading was chosen: it is the brief's
own sentence ("the crest is about to close ahead of the head") and it finds
a section on Second Peak's reef where the depth reading found a 0.28.

Clock mapping to §1.3 (Second Peak, x = 14.9, onset = first fold, sim 49.3):

| field phase (§1.3) | field duration | model, on the station's lifecycle clock | model duration |
|---|---|---|---|
| wall standing | ~0.3 s | 49.3–49.6: fold 1.5 → 5.5 m, curl < 0.31, aer 0.09 (crest still dark) | 0.3 s |
| curtain → impact | 0.13–0.40 s | 49.6–49.8: curl 0.31 → 0.55 → 0.40, aer 0.53 → 1.0 → 0.83 (curtain gate open) | 0.2 s |
| impact → collapsed bore | 0.40–0.67 s | 49.9–50.2: curl released to 0, fold plateau 6.9–7.0 m, yMax 6.65 m at 49.9 | 0.4 s |
| bore smoothing, total | ~1.5 s | 50.3–51.0: fold 7.0 → 3.8 m, yMax 5.8 → 5.2 m; total onset → smoothing | 1.7 s |

## 3. One section shutting — Second Peak, card month

`scripts/probe_section_curl.mjs --preset=secondpeak` (fine sweep, 0.1 s;
`qa/section-curl-2026-09-24/sweep_secondpeak.json`; the default build at
the same station in `sweep_secondpeak_default.json`). Section column x = 14.9
(`shut` 1, ξ_eff 0.95); steady head = the strongest non-section pocket
column at the same clock (x 82–88).

| sim | section: pocket | curl (turns) | aer | fold m | yMax m | ceiling m | head x | head curl | head aer | head fold m | default at x 14.9: curl / fold |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 49.2 | 0.965 | 0 | 0.09 | 0 | 5.94 | 5.54 | 88 | 0 | 0.28 | 0.18 | 0 / 0 |
| 49.3 | 0.964 | 0.001 | 0.09 | 1.53 | 6.07 | 5.54 | 88 | 0 | 0.28 | 0.24 | 0 / 0.28 |
| 49.5 | 0.962 | 0.136 | 0.09 | 3.77 | 6.36 | 5.54 | 88 | 0.02 | 0.28 | 0.64 | 0.04 / 0.69 |
| 49.6 | 0.961 | 0.307 | 0.53 | 5.47 | 6.19 | 5.54 | 88 | 0.05 | 0.28 | 0.83 | 0.10 / 1.21 |
| **49.7** | 0.960 | **0.547** | **1.00** | **7.07** | 5.80 | 5.54 | 88 | 0.09 | 0.28 | 1.06 | **0.17 / 1.69** |
| 49.8 | 0.959 | 0.395 | 0.83 | 7.39 | 6.15 | 5.54 | 88 | 0.09 | 0.28 | 1.10 | 0.13 / 1.64 |
| 49.9 | 0.955 | 0.127 | 0.09 | 7.00 | **6.65** | 5.56 | 88 | 0.04 | 0.28 | 0.83 | 0.04 / 1.40 |
| 50.2 | 0.934 | 0 | 0.09 | 6.98 | 5.97 | 5.58 | 88 | 0 | 0.28 | 0.56 | 0 / 0.90 |
| 50.6 | 0.872 | 0 | 0.08 | 6.41 | 5.52 | 5.55 | 35 | 0 | 0.28 | 0.02 | 0 / 0.22 |
| 51.0 | 0.779 | 0 | 0.07 | 3.82 | 5.16 | 5.27 | 35 | 0 | 0.29 | 0.00 | — |

- The section overturns 0.55 turns and folds 7.1 m; the head at the same
  clocks never passes 0.10 turns or 1.2 m: **the barrel is local and the
  head spills.** The default build at the same station peaks at 0.17 turns /
  1.7 m — and its head (x 88) folds *more* than that (2.5 m), because ξ 0.65
  is the same everywhere.
- **Plume height.** yMax peaks 6.65 m at 49.9 against a 5.56 m ceiling: 1.1
  m, 0.20 of the ceiling, above the prior crest. The field says ≤ 0.15 H_f.
  Slightly over, and it is the structural mound (`impactBand`) on the
  lifecycle, not the curl — the bend never lifts.
- **Duration.** onset 49.3 → smoothing 51.0 = 1.7 s against the field's
  ~1.5 s; the curtain phase (0.2 s) sits inside the field's 0.13–0.40 s.

### Frames

Close rig `secondpeak_close` (eye [79, 11, −68] → [15, 4, −108], stage;
the drone at 0.57 m/px renders the 16 m section as a 20 px patch, so the
Sewers close pose was mirrored about the Second Peak flank). All
`qa/section-curl-2026-09-24/secondpeak_close_<arm>_<sim>.jpg`, 1000×625.

| sim | `sectioncurl=1` | what is in the frame |
|---|---|---|
| 49.2 | `..._sectioncurl_49p2.jpg` | a dark, glassy crest across the frame; at the station (screen 498, 340) a small white knuckle on the crest line, the face below it dark and sloped, the lip ahead (right) a thin bright line. The wall. |
| 49.5 | `..._sectioncurl_49p5.jpg` | an angular white polygon ~100 px wide stands on the crest at the station with a short pointed piece hanging below it — the fold, whitened by the aerated lip, and the first of the curtain. Face ahead dark. |
| 49.7 | `..._sectioncurl_49p7.jpg` | the polygon at full size with a vertical white streak running from its underside down the face: the curtain sheet (curl 0.55, aer 1.0). Face ahead still dark. |
| 49.9 | `..._sectioncurl_49p9.jpg` | polygon widened and flattened, the streak gone, a pale base spreading beneath it: the plume, forward not up. |
| 50.2 | `..._sectioncurl_50p2.jpg` | a flat pale plate along the crest with white streaking down the face: the bore forming. |
| 50.6 | `..._sectioncurl_50p6.jpg` | the plate lower and wider, whitewater on the face beneath it, the crest line to the right dark again. |
| 49.7, default | `..._default_49p7.jpg` | the same crest with a 2–3 px white lump at the station and nothing else: the spilling head at ξ 0.65. |
| 49.7, bundle | `..._bundle_49p7.jpg` | `tube=1&classic=1&descent=1` added: a translucent teal ribbon hangs where the polygon was (the ribbon reads `u_xi` 0.65, so it is a spiller's stub, not the section's), and a stray white streak lies on the flat water lower right. Not the arm to judge this track on. |

Against the field sheet
`assets/curl-truth-2026-09-24/event-B-section-collapse_11.2-13.3s.jpg`
(f356 wall → f364 curtain 28 px → f372 shut → f380 broad lumpy plume → f388
bore with crest lumps → f400 smoothing): the *sequence and its clock* are
now the same event — a stretch stands dark, a half-face sheet drops, the
plume goes forward, the bore is there within half a second, the face ahead
stays dark. The *material* is not: the field's wall is dark water that
becomes a saturated white plume; the model's wall becomes an angular white
polygon (the grid fold, LIP_FACETS class) with a thin curtain, and the plume
is a pale plate. Criteria 7 (wall first, ~0.3 s), 8 (curtain, not a
full-height sheet; 0.2 s), 9 (forward, bore in 0.4 s; height 0.20 vs ≤ 0.15)
and 10 (face ahead dark) are met in kind; 9's height is 30 % over, and
"broad and lumpy" is not what a faceted polygon is.

Drone (`secondpeak_drone_{default,bundle}_{49p2,49p7,50p2,50p6}.jpg` plus
`_section.jpg` crops centred on the station): at 0.57 m/px the event is a
~60 px bright patch on the crest that brightens and widens 49.7 → 50.6 and
grows a whitewater tail; in the default the same place is a thin flat white
line. The drone cannot tell a wall from a curtain; it can tell that the
break has a *local* event and a spilling head elsewhere.

## 4. Sewers

Field at Sewers: `shut` = 1 on x −92…−70, but x −92…−82 is the section gap
and −84…−76 its feather, so the on-line part of the flank is x −76…−70
(`shut` 0.86 at −72). Swept at x = −73 (`sweep_sewers.json`; pocket arrives
43.6, onset 44.9): curl peaks **0.23** turns at 45.1 with fold 2.6 m at 45.2
(aer 0.34), released by 45.4; the head at x −64 through the same clocks curl
0, fold 0, aer 0.40 (spilling). Sewers' authored ξ 1.15 is kept at the
section, so this is not the ξ; the flank's up-point half being masked (the
lifecycle mound is partial there) is the candidate, not investigated.

Frames `sewers_close_{default,sectioncurl,bundle}_{44p8,45,45p15,45p3,45p6,46}.jpg`
(eye [12, 11, −190] → [−52, 4, −229]). Default 45.15: the head at the
crest's peak carries a fold with white splashes on the face beneath it and a
white foam patch mid-face. `sectioncurl` 45.15: the same crest glassy and
smooth, the face splashes gone — the head spills — and the section at −73
(screen 358, 309) a modest pitched lip at the left of the peak, not a
polygon. Bundle 45.15: two teal ribbons standing on the crest (the tube at
the spot ξ 1.15 — Sewers is the one spot where the ribbon and the section
agree on ξ). Honest per CURL_TRUTH §3 ("spilling head with pitched-lip
sections"), and the least dramatic of the three rigs.

## 5. Second Peak lookout, field hash

`preset=secondpeak&cam=lookout&day=big&h0=1.4&tide=0.732`,
`secondpeak_lookout_{default,bundle}_{49p5,49p7,50p2}.jpg`: unbroken swell
in both arms at all three clocks — the jury's open item 1 (nothing breaks at
Second Peak on the field day; Track J). The section field is x-only, so the
flank is at the same x, but the crest never reaches a line there. Two dark
triangular shards on the inner water (screen ~600, 500 and ~930, 450) are
present in the default frame too: pre-existing, not this track's.

## 6. Parity

Default boot, PNG, byte-for-byte against pristine main (`git archive main`
served on 8147): `qa/section-curl-2026-09-24/parity.json` — og Sewers drone
42, Sewers close 45.15, Second Peak drone 49.7, Second Peak lookout 49.7:
**byte-identical, all four.** Numerically, `curlProbe` at 61 columns × 512
samples × 10 fields (y, z, pocket, brk, foam, curl, aer, crest, line, mask)
differs by exactly 0 between main and the branch at two cases, and main
against itself renders 0 differing pixels (the instrument's floor is zero).
The uniform-only version of the same design measured 4–6 px at 1/255 and
3e-5 m of z, which is what the build defines fixed.

## 7. Limits

- **Width.** The flank is 12–16 m — about three ceilings (5.5 m) at Second
  Peak — against the footage's 1–2 face heights. That is the narrowest the
  50 m-lattice section field can name; a finer field is a break-line
  decision (it moves the line), not this track's.
- **Material.** The section's overturn is the grid's fold and paints as an
  angular polygon; the plume is the structural mound, 0.20 of the ceiling
  above the crest (field ≤ 0.15). Direction 2 and 3 of the jury (foam on the
  ribbon, a thinning roof) apply to this event exactly as to the head.
- **`tube.js` reads `u_xi`.** Under `#tube=1&sectioncurl=1` the ribbon
  draws at the spot ξ (a spiller's stub at Second Peak, Sewers' full ribbon
  everywhere at Sewers). One-line follow-up in tube.js:
  `breakerProfile(u, age, xiAt(x0), hC, c)` and `breakerProfileWeight(age,
  xiAt(x0))`.
- **The rider's surface query** keeps its pinned `defines` literal (as under
  `#tube`), so with the flags on the rider reads the unflagged surface.
- **Sewers' on-line flank is weak** (0.23 turns) and its strong flank is in
  the gap. Not investigated beyond the sweep.
- **Where sections fall is the field's seed.** Second Peak has one flank on
  its reef; the lookout pose on the field day shows nothing because nothing
  breaks there (Track J).
- Camera and lens differ from the footage; every "face height" here is the
  displayed ceiling `crestCeilM`, VIS applied.

## 8. Files

- `shared/model-glsl.js` — `SECTION_NOISE`, `sectionNoise`, `sectionNoiseSlope`,
  `sectionShut`, `xiAt`/`plungeAt` (`#ifdef SECTION_CURL`), `GAP_FIX` block at
  `pocket`/`crest`, the reconciled `brk` comment; uniforms `u_gapFix`,
  `u_sectionCurl`, `u_sectionXi`. `web-three/js/shaders.js` — every
  `smoothstep(0.45, 1.25, u_xi)` / raw `u_xi` read routed through
  `plungeAt`/`xiAt`. `web-three/js/main.js` — `SECTION_CURL_BUILD`,
  `GAP_FIX_BUILD`, `SECTION_DEFINES` on every model-compiling material, hash
  `gapfix` / `sectioncurl` / `sectionxi`, `curlProbe` row 5 (xiEff, plunge,
  sectionShut, sectionNoise). `web-three/js/bed.js` — the gapArr comment.
- `scripts/probe_section_curl.mjs` — the lobes and the clock sweep.
  `scripts/probe_section_gap_foam.mjs` — `gapfix` arm, `crest` column.
  `scripts/capture_section_curl.mjs` — the frame matrix and parity.
- `qa/section-curl-2026-09-24/` — frames, `manifest.json`, `parity.json`,
  `gapfix_probe.json`, `sweep_secondpeak.json`, `sweep_secondpeak_default.json`,
  `sweep_sewers.json`.
- `docs/CONTROLS.md` — `gapfix`, `sectioncurl`, `sectionxi` rows.
