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
| `matte` | `0` | on | A/B revert: `0` = disable the modeled-domain matte (water and land) | A/B revert |
| `shape` | `legacy` / `structural` | `structural` | A/B revert: `legacy` = pre-anatomy breaker shading | A/B revert |
| `noclip` | `1` | off | disable the world-collision camera clamp (x-ray debugging) | debug |
| `look` | `foam` / `full` | shipped image | renderer-only visual-fidelity probe (`u_fidelityLook`): `foam` = foam material only, `full` = foam + per-wave lifecycle hierarchy + connected face/lip; any other value keeps the shipped image. Named values make matched captures reviewable without numeric flag lore (`parseFidelityLook`, url-params.js) | instrument |
| `psi` | `0` | on | A/B revert: `0` = frozen-LAM plane wave instead of the baked Ψ shoaling phase field. Default ON since 2026-08-13 (M6p3 step 4) — rider and audio both solve in phase now | A/B revert |
| `crest` | `0` | on | A/B revert: `0` = pre-Track-5 read (no face darkening, no pocket foam floor, no fresh-foam white core at the line). Spec "Track 5, first pass" | A/B revert |
| `kelp` | `0` | on | A/B revert: `0` = pre-2026-08-18 kelp value polarity (bright sand lanes over the reef tongue). On, the canopy saturates over the reef band and the lanes take a mudstone bed albedo, so the wedge reads DARK as in the NAIP ortho. Measured at sewers/drone sim=42: upper-half luma std 11.4→6.7, break-band/upper-half ratio 1.97→2.20 (secondpeak 1.88→2.11) | A/B revert |
| `wwarea` | `0` | on | A/B revert: `0` = pre-4a′ foam (no re-breaking area boost). Default ON since 2026-08-13: whitewater scales with the broken area so tide legibility survives the foam gate; measured low/high bright-px ratio 1.80×→1.95× at L≥205 (2.17× at L≥160; physical band 1.93–4.95×). Earlier 2.5–2.7× readings were inflated by the Ψ-freeze dead zone suppressing inner foam — see spec Addendum 4 | A/B revert |
| `gap` | `0` | on | A/B revert: `0` = disable section-gap masking, so baked section gaps stop cutting the break envelope — the V returns | A/B revert |
| `head` | `0` | on | A/B revert: `0` = disable comet-head whitewater aging. Default ON: the first "`head=0` way better" verdict was judged on a drifted OrbitControls camera; the clean-load rematch (2026-08-14) went to `head=1` | A/B revert |
| `pock` | `0` | on | A/B revert: `0` = pocket footprint stops scaling with H_eff (fixed 7.5 m bell). On, the footprint scales by `clamp(H₀·shelter/1.5, 0.70, 1.50)` — unity at the 1.5 m model-card day | A/B revert |
| `dline` | `1` / `2` | off | feature flag: density-composite break line (Topanga method) — `1` = density peaks feed anchor/continuity (falsified: worse chatter), `2` = per-station density mode is the line (kills low-H₀ flip chatter at Sharks; costs ~2° α). Measured 2026-08-13, spec "The density-composite line" | feature flag |
| `smooth` | `1` | off | feature flag: 90 m wave-scale break-line smoothing (kills A-frames, currently also the taxonomy) | feature flag |
| `peeldir` | `1` | off | feature flag: direction-monotonicity constraint on the break line | feature flag |
| `nose` | `1` or a float, clamped [0, 1.0] | off | feature flag: reef nose v2 — down-point taper of the uplift amplitude in stage fraction; `1` = the tuned 0.25, a float tunes it directly. Swept to the definitional bound 2026-08-13: the taper mechanism is EXHAUSTED, no fraction passes | feature flag |
| `reefamp` | float m, clamped [0.5, 12] | `3.2` | sweep knob: M5 wedge max uplift (`REEF_AMP_MAX`). Appears twice in the wedge — the lift clamp AND `bound`, where the reef ceases to exist — so it also sets how far seaward the reef reaches. Measured to SATURATE by ~5 m | sweep knob |
| `reefflank` | float m, clamped [14, 300] | `80` | sweep knob: wedge cross-strike feather half-width (`REEF_FLANK_W`). The effective lever on stage-median α — 45→80 nearly halves mean \|Δα\| (adopted 2026-08-13 with the retarget); 120+ is worse (shelf, not reef) | sweep knob |
| `shelter` | `0` | on | A/B revert: `H_eff` sheltering field (MODEL.md §2.6.7) — smaller/weaker waves down-point, bake AND drawn field together. `0` = flat H₀ | A/B revert |

**Removed:** `#swell=` (2026-08-11). It wrote `state.swellDeg`, which nothing
read — the refraction bake takes `swellDeg: state.alpha` — so the knob looked
wired and was not; a real direction knob needs the MODEL.md §2.4/§4.5 α split
first (docs/research/EXTERNAL_VALIDITY_AUDIT_2026-08-11.md, "Direction in the
code"; TODO Track 3).
