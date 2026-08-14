# URL hash controls (web-three)

Every hash param the runtime actually parses (`applyHashParams()` plus the
early `#q=` read in `web-three/js/main.js`). Hash, not query — no server
round-trip, so the deployed sim stays a pure static file. Combine with `&`:

```
web-three/#preset=secondpeak&cam=cliff&tide=-0.5&sim=42&controls=0
```

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
| `psi` | `0` | on | A/B revert: `0` = frozen-LAM plane wave instead of the baked Ψ shoaling phase field. Default ON since 2026-08-13 (M6p3 step 4) — rider and audio both solve in phase now | A/B revert |
| `wwarea` | `0` | on | A/B revert: `0` = pre-4a′ foam (no re-breaking area boost). Default ON since 2026-08-13: whitewater scales with the broken area so tide legibility survives the foam gate; measured low/high bright-px ratio 1.80×→2.66× at L≥205 (physical band 1.93–4.95×) | A/B revert |
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
