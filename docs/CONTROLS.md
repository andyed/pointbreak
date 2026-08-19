# URL hash controls (web-three)

Every hash param the runtime actually parses (`applyHashParams()` plus the
early `#q=` read in `web-three/js/main.js`). Hash, not query — no server
round-trip, so the deployed sim stays a pure static file. Combine with `&`:

```
web-three/#preset=secondpeak&cam=cliff&tide=-0.5&sim=42&controls=0
```

## The hash round-trips (2026-08-16)

Params of kind **control** are now written back to the URL as you use the app,
so the address bar is always a shareable permalink of what is on screen. Params
of every other kind (`instrument`, `A/B revert`, `feature flag`, `sweep knob`,
`debug`, `compatibility`) are **boot-only**: read once at load, never written.

Three rules follow, and they are the whole contract:

1. **Only what you chose is written.** A default-state view serialises to a bare
   URL. `surfer=0`, `speed=1`, `bed=reef`, `preset=secondpeak`, `cam=free` are
   omitted rather than spelled out. The trade-off is deliberate: if a shipped
   default ever changes, an old link that omitted it changes meaning too, so an
   author pinning a specific view for a capture or an essay embed should keep
   writing the value explicitly.
2. **Boot-only params you typed are preserved.** Loading `#m4=0&sim=42` and then
   nudging the tide keeps both — the writer owns the control keys and nothing
   else.
3. **Editing the URL by hand does the right thing.** A change confined to
   control params re-applies live. A change to the boot-only set — adding one
   *or removing one* — reloads, because those are applied once at boot and the
   live path does not touch them. Removing is not the symmetric no-op it looks
   like: dropping `m4=0` from the URL without a reload would leave the app at
   `m4=0` while the URL claimed the default.

Writes are debounced (120 ms) and use `replaceState`, so dragging a slider is
one write rather than sixty and the back button is not filled with slider
frames. `replaceState` does not fire `hashchange`, so the app never re-reads its
own writes. Serialisation order is fixed and matches the table below, so the
same view always produces the same link.

Not covered: `#day=live` writes `day=live` back, but the fetched ocean is
whatever the nowcast says *at load time* — the link reproduces the mode, not
the conditions. That is the intended meaning of `live` and not a defect.

Two kinds of flag, named as such below: a **feature flag** gates work that is
landed but not yet default (default off, judged as an ensemble — TODO Track 1c);
an **A/B revert** turns a shipped default OFF so a regression can be bisected
without checking out old code. (The ensemble was judged on 2026-08-13 and
REJECTED — no combination of the four feature flags ships; see
`WEB_THREE_SPEC.md` "The ensemble, judged". They remain individually useful for
A/B measurement.) A third kind, **sweep knob**, exposes a shipped constant so
it can be measured across a range; it defaults to the shipped value.

| param | values | default | what it does | kind |
|---|---|---|---|---|
| `preset` | `sewers` `firstpeak` `secondpeak` `jacks` `thehook` `sharks` `privates` | `secondpeak` | site preset: reef, stage bounds, card ocean (params.js) | control |
| `day` | a conditions.js key (`small` `modelcard` `pulse` `overhead` `big` `stormy` …) or `live` | preset ocean | named condition day rides on top of the preset (ocean only, never the reef); `live` pulls today's MOP SC116 nowcast, cache fallback | control |
| `month` | `january` … `december` | none — the site card | climatological month: sets H₀ to the **p75** swell height typical of that month at CDIP SC116, de-shoaled to deep water (`data/climatology/pp_monthly_ocean.js`). **Size only** — period is seasonless here (14.4–15.2 s every month), and tide/chop/Δf are not in the bulk pull. Mutually exclusive with `day`; an explicit `h0` wins. Percentile named in the HUD. **Opt-in: a bare URL is each spot's own card ocean.** A global January default shipped briefly on 2026-08-16 and was reverted — it replaced all seven per-spot card H₀s, which are the calibration input for `shared/model-glsl.js` `SHELTER_*`, and collapsed the peel at Sewers (α 38→5) and First Peak (50→1). `card` is accepted as an alias for "no month" | control |
| `drift` | `1` | off | screensaver mode: hard-switch through the surf-worthy condition days every 300 s of sim time | control |
| `tide` | metres MSL, clamped to [−0.862, 0.764] (MLLW…MHHW) | 0 | water level; moves the break position, not the breaking depth | control |
| `bed` | `reef` `plane` `measured` | `reef` | seabed A/B: measured+synthetic reef / least-squares plane / measured only — the causal demo for the peel | control |
| `surfer` | `1` / `0` | off | show the procedural rider | control |
| `section` | `1` | off | cross-section chart overlay (section.js) | control |
| `controls` | `1` / `0` | shown | explicitly show or hide the app bar, drawer, and reveal affordance; `1` overrides Tour's clean-screen default | control |
| `hud` | `1` / `0` | shown | legacy alias for `controls`; retained for existing permalinks and captures | compatibility |
| `audio` | `1` | off | arm procedural surf audio; starts on the first user gesture (browser policy) | control |
| `sim` | seconds | 0 | seed the sim clock — deterministic captures (`sim=42` is the house probe clock) | instrument |
| `speed` | 0–4 | 1 | sim time scale (`0` freezes) | control |
| `h0` | metres, clamped 0.4–3.0 | preset | override swell height | control |
| `cam` | `free` `cliff` `lineup` `drone` `point` `follow` `tour` | `free` | camera preset; `tour` is the screensaver auto-cut | control |
| `q` | `high` `medium` `low` `potato` | auto | pins the quality tier (grid density — the app is vertex-bound) and disables auto-fallback | control |
| `m4` | `0` | on | A/B revert: `0` = authored break line instead of the emergent H₀Kₛ ≥ γh locus | A/B revert |
| `aim` | `0` | on | A/B revert: `0` = cameras aim via the authored `breakLineJS` proxy (pre-2026-08-18 rigs). On, Cliff/Lineup/Drone (and their Tour legs) frame the **baked** line's action centroid — stage stations, section gaps excluded — smoothed over ~6 s of sim time so a tide-moved bake glides the frame; grabbing the orbit hands the framing back to the reader until the next camera choice. No bake (unmapped site, A-frame, `m4=0`) falls back to the authored rigs | A/B revert |
| `matte` | `0` | on | A/B revert: `0` = disable the modeled-domain matte (water and land) | A/B revert |
| `shape` | `legacy` / `structural` | `structural` | A/B revert: `legacy` = pre-anatomy breaker shading | A/B revert |
| `noclip` | `1` | off | disable the world-collision camera clamp (x-ray debugging) | debug |
| `look` | `foam` / `full` | shipped image | renderer-only visual-fidelity probe (`u_fidelityLook`): `foam` = foam material only, `full` = foam + per-wave lifecycle hierarchy + connected face/lip; any other value keeps the shipped image. Named values make matched captures reviewable without numeric flag lore (`parseFidelityLook`, url-params.js) | instrument |
| `psi` | `0` | on | A/B revert: `0` = frozen-LAM plane wave instead of the baked Ψ shoaling phase field. Default ON since 2026-08-13 (M6p3 step 4) — rider and audio both solve in phase now | A/B revert |
| `crest` | `0` | on | A/B revert: `0` = pre-Track-5 read (no face darkening, no pocket foam floor, no fresh-foam white core at the line). Spec "Track 5, first pass" | A/B revert |
| `kelp` | `0` | on | A/B revert: `0` = pre-2026-08-18 kelp value polarity (bright sand lanes over the reef tongue). On, the canopy saturates over the reef band and the lanes take a mudstone bed albedo, so the wedge reads DARK as in the NAIP ortho. Measured at sewers/drone sim=42: upper-half luma std 11.4→6.7, break-band/upper-half ratio 1.97→2.20 (secondpeak 1.88→2.11) | A/B revert |
| `pitch` | `0` | on | A/B revert: `0` = the pre-2026-08-18 forward-pitch term, `theta -= skew·sin(theta)`, **and** its `q = 1.6 + 3.2·…` crest schedule (both revert together, so the A/B is exact). That term was an ODD map of θ and `crestShape` is EVEN in its argument, so the composed height was fore-aft symmetric for **every** skew: measured front/back max-slope ratio 1.000000, As −0.0001 across the whole reachable (s, q) plane. On, the map is the EVEN `theta -= skew·(1 − cos theta)` with `skew = clamp(excess·0.82, 0, 0.8)`, a flattened `q = 2.2 + 1.5·exp(−\|d\|/55)·(0.6 + 0.5·ξ)`, and the crest **locus** terms (`tSince`, `crestNear` → the pocket footprint) split off onto the unskewed carrier phase — the odd map's phase crawl at the crest had been dilating the pocket bell ~30%, and every fold/lip constant sat on top of that. Measured at secondpeak/drone (sims 42/48/54 medians), break line: As **+0.12 → −0.70** (R12 target −0.72), Sk 0.28 → 0.24 (0.28), biphase ψ **+24° → −71°** (R12 −69°), B 0.31 → 0.74 (0.775), front/back **0.96 → 2.3**, face chord 10.4° → 16.9° displayed. Weighted mean-square (Sk, As) error vs the R12 targets over 44 gauges 0.398 → 0.021; `0` reproduces the pre-fix build to 0.000000 over 720 gauge statistics. **Known cost:** the pocket footprint shrinks ×0.19–0.63 (the odd map had been dilating the `crestNear` window 1.6×), so the plunging tube at Sewers is smaller in the low profile view — drone and spilling sites read unchanged. Default ON — a defect fix restoring documented intent (MODEL.md §2.2), not a new look — but it changes every wave, so the `0` side is the bisect handle | A/B revert |
| `wwarea` | `0` | on | A/B revert: `0` = pre-4a′ foam (no re-breaking area boost). Default ON since 2026-08-13: whitewater scales with the broken area so tide legibility survives the foam gate; measured low/high bright-px ratio 1.80×→1.95× at L≥205 (2.17× at L≥160; physical band 1.93–4.95×). Earlier 2.5–2.7× readings were inflated by the Ψ-freeze dead zone suppressing inner foam — see spec Addendum 4 | A/B revert |
| `cg` | `0` | on | A/B revert: `0` = retired set-envelope group speed `0.5·LAM/T` (≈3.0 m/s at T=15) instead of the physical `gT/4π` (≈11.7 m/s) the 2026-08-13 unification shipped. Re-arms the 375 m set band the cadence audit measured, for A/B measurement in one build; drives `setEnv`/`setupLiftM` (GLSL) and the JS twins (`model-js` setEnv, `sound.js` voice envelope) together. The fixed-point beat period 1/dF does not move | A/B revert |
| `gap` | `0` | on | A/B revert: `0` = disable section-gap masking, so baked section gaps stop cutting the break envelope — the V returns | A/B revert |
| `head` | `0` | on | A/B revert: `0` = disable comet-head whitewater aging. Default ON: the first "`head=0` way better" verdict was judged on a drifted OrbitControls camera; the clean-load rematch (2026-08-14) went to `head=1` | A/B revert |
| `pock` | `0` | on | A/B revert: `0` = pocket footprint stops scaling with H_eff (fixed 7.5 m bell). On, the footprint scales by `clamp(H₀·shelter/1.5, 0.70, 1.50)` — unity at the 1.5 m model-card day | A/B revert |
| `slife` | `1` | off | feature flag: per-stripe along-crest lifecycle clock (hero read open item (a)). The canonical clock is `stripeAgeAt` in model-glsl — `tSince + phaseLag/ω`, the time since each water column's wave first broke at the line, a phase-lagged copy of the zipper's along-crest age — and the read is a post-threshold carve in GRID_FRAG (same discipline as the `#head` comet carve, extended inward): within-stripe freshness on a T/3 e-fold, stripe-to-stripe lag on 2.4·τ, so inner stripes gain a fresh-head→decayed-tail gradient pointing the peel, direction-locked to the comet by construction. Default OFF pending a live verdict | feature flag |
| `lip` | `1` | off | feature flag: aerated lip/curl (Track 5 "the lip lacks the field footage's aerated volume"; live report 2026-08-18 "the wave is curling not the foam"). The curl whitens on its own breaking GEOMETRY: a vertex-stage mask (`vAerLip`, GRID_VERT `choppyPos`) keyed to the fold's cusp parameter S and the applied lip throw normalized by face height — full white exactly on the thrown curtain, both faces, which also covers the documented dark fold-underside facets — plus a gentler capped pocket term for spilling character (low ξ crumbles at ~⅓ of a plunging curtain's white). H_eff-scaled (unity at the 1.5 m card day), section-gap masked, lull-dark via pocket's env². Read as a post-carve mix in GRID_FRAG, freshest at the traveling breakpoint on the `#arm` metric clock (85 m e-fold behind the head). Measured (capture_lip_ab.mjs + measure_lip_luma.py, curl-window medians at the head, pinned sims 36–54): sewers/drone lip band 183–225 → 210–232, lip−face ON +44/+86/+132 at three clocks (the fourth puts both bands inside one wide white curtain); OFF reproduces the pre-flag frame to ≤ 1 px. Sharks (ξ 0.45) lip moves ≤ +3 — spilling stays gentle. Default OFF pending a live verdict | feature flag |
| `arm` | `0` / `anchor` / `tail` | on (both) | A/B revert for the 6b dark-arm pair; `0` reverts both halves, `anchor`/`tail` keep only the named half. **anchor**: the group envelope is re-referenced to the LIVE break line (`u_setRef` = stage-median rayS of the baked line) with a set cresting there at t = 45 s (`SET_ANCHOR_S`) — the phase's old `s = 0` reference was the pre-M4 authored contour, and after the 6a cg unification the deterministic house clocks (sim 36–54) sampled a set NULL at the line: env 0.00–0.24, every env²-gated line foam term ≤ 0.055. Cadence 1/Δf untouched. **tail**: the comet decays over metres behind the traveling breakpoint (55 m e-fold via age·ω/\|dS/dx\|) instead of a 2.5 s clock, which collapsed to 8–20 m where the head crawls (the visible 40–70° arm) | A/B revert |
| `wrap` | `0` | on | A/B revert: `0` = the raw `mod()` foam clocks (bit-identical to the pre-2026-08-18 build). Every foam clock in the model is a sawtooth that snaps from T back to 0 when the next crest arrives, and that snap lands on a level set of `rayPhase` — a crest line, very nearly shore-parallel after refraction — so it drew a straight hard edge sweeping shoreward, terminating the foam instead of dissolving it. `crestClockS` ramps the clock back to zero over the last `CREST_WRAP_S` = 2.4 s (~14 m at c = Λ/T) instead of snapping, which is the crest's own foam-injection width. Measured at the lineup camera (sewers, sim 42): shipped foamM jumped 0.87→0.13 across one 0.25 m step and 91.6% of frame columns carried a ≥60-level one-pixel row jump; after, max Δ 0.099 and 1.5% of columns. The comet's line clock gets the same ramp (its wrap is a level set in x — a vertical seam): cometFoam jump 0.845 → 0.048 | A/B revert |
| `dline` | `1` / `2` | off | feature flag: density-composite break line (Topanga method) — `1` = density peaks feed anchor/continuity (falsified: worse chatter), `2` = per-station density mode is the line (kills low-H₀ flip chatter at Sharks; costs ~2° α). Measured 2026-08-13, spec "The density-composite line" | feature flag |
| `smooth` | `1` | off | feature flag: 90 m wave-scale break-line smoothing (kills A-frames, currently also the taxonomy) | feature flag |
| `peeldir` | `1` | off | feature flag: direction-monotonicity constraint on the break line | feature flag |
| `nose` | `1` or a float, clamped [0, 1.0] | off | feature flag: reef nose v2 — down-point taper of the uplift amplitude in stage fraction; `1` = the tuned 0.25, a float tunes it directly. Swept to the definitional bound 2026-08-13: the taper mechanism is EXHAUSTED, no fraction passes | feature flag |
| `reefamp` | float m, clamped [0.5, 12] | `3.2` | sweep knob: M5 wedge max uplift (`REEF_AMP_MAX`). Appears twice in the wedge — the lift clamp AND `bound`, where the reef ceases to exist — so it also sets how far seaward the reef reaches. Measured to SATURATE by ~5 m | sweep knob |
| `reefflank` | float m, clamped [14, 300] | `80` | sweep knob: wedge cross-strike feather half-width (`REEF_FLANK_W`). The effective lever on stage-median α — 45→80 nearly halves mean \|Δα\| (adopted 2026-08-13 with the retarget); 120+ is worse (shelf, not reef) | sweep knob |
| `curl` | `1` | off | feature flag: lip **overturn** as a bend. The shipped lip is a horizontal throw (`throwMag`) plus a downward drop (`dropMag`) on top of the Tessendorf fold; the fold is real (S > 1 does make the mesh multivalued) but the pair translates the crest band without preserving its thickness. (`dropMag` also used to subtract up to ~3·hM **at the pocket**, so the wave was flattest where it should be tallest — that was an independent second cause of the same read, present at default settings, and it is fixed on the default path as of 2026-08-18; see `#drop`. `#curl` masked it only because it switches the throw/drop pair off entirely.) `1` replaces that pair with the classical **bend**: water above `0.35·h_crest` curves onto an arc of radius `R = h_crest/mix(0.30, 2.60, plunge)` — `dz = dy·(1−cos θ)/θ`, `y = y_bend + dy·sin θ/θ` with `θ = dy/R`. It never lifts (`sin θ/θ ≤ 1`), preserves arc length (so the curl has thickness), and overhangs wherever the face is steeper than `1/sin θ`. ξ sets how far over it goes and how compact it is (σ_z scales with `h_crest`), the breaking excess `H₀Kₛ/γh` scales it, and `pocket` keeps it attached to the travelling breakpoint. Also caps the choppy cusp at `S = 1` so two mechanisms do not fold the same band. Exposes `vCurl` (turns of overturn), which is now the `#lip` aeration **curtain key whenever `#curl` is on** (wired 2026-08-18). Before that the two flags contradicted each other: the curtain keyed off `throwMag`, which `#curl` computes and then never applies, so `#curl=1&lip=1` painted an aerated curtain across water with no lip in it — measured at 18 of 288 Sewers stations with full white at < 0.10 turns of overturn, all now suppressed, with no strong-bend station losing aeration. Measured at Sewers q=high: max bend 132°, stray trough folds 20.4 → 14.2 m (the median-pocket-crest figure it used to quote, 5.16 → 7.88 m, measured the `dropMag` defect rather than the bend, and the default now stands at 7.96 m without `#curl`); Sharks (ξ 0.45) moves 12°, i.e. spilling barely overturns. Default OFF pending a live verdict | feature flag |
| `drop` | `legacy` | fixed | A/B revert: `legacy` restores the pre-2026-08-18 `dropMag` (GRID_VERT `choppyPos`), which flattened the wave exactly where it breaks. The term exists to bend the thrown lip down — `throwMag` translates the crest band shoreward at constant height, so the throw alone leaves a flat shelf (that is what it was added for, 3e28d38) — but it was written as `3.0·pocket·plunge·hM·lipJit`, and `hM = h/VIS` **is the height it is subtracted from**. So it was a multiplicative shrink of the whole water column wherever `pocket > 0` (up to ~0.94·h), biting hardest at the crest, which is the tallest point on it. The shipped fix keys it to `frontPhase` (zero at the crest, θ = 0; peaks ~0.9 rad shoreward — the water that has already gone over) and scopes it to the band above the same `0.35·h_crest` bend line `#curl` uses, as a fraction of that band clamped below 1 so it can never invert the crest. Measured (`scripts/measure_pocket_crest.mjs`, Sewers q=high, 4 pinned clocks × 36 stations, crest read back off the GPU): median crest / depth-limited ceiling `γh` at pocket stations **0.78 → 1.08**, against 1.05 for the same stage away from the pocket (so ~1.05, not 1.0, is the calibrated norm — `crestCeilM` is a reference height, not a clamp); monotone collapse with `pocket` (1.015 / 0.772 / 0.467 by bin) **removed**. Non-pocket stations and Sharks (ξ 0.45, `plunge` = 0, so `dropMag` was always 0 there) are unchanged to 3 decimals. Ships ON — this row is the revert arm, not a feature flag | A/B revert |
| `shelter` | `0` | on | A/B revert: `H_eff` sheltering field (MODEL.md §2.6.7) — smaller/weaker waves down-point, bake AND drawn field together. `0` = flat H₀ | A/B revert |

**Removed:** `#swell=` (2026-08-11). It wrote `state.swellDeg`, which nothing
read — the refraction bake takes `swellDeg: state.alpha` — so the knob looked
wired and was not; a real direction knob needs the MODEL.md §2.4/§4.5 α split
first (docs/research/EXTERNAL_VALIDITY_AUDIT_2026-08-11.md, "Direction in the
code"; TODO Track 3).
