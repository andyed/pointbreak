# The crash: impact plume and whitewater handoff (`#crash=1`) — 2026-09-24

Status: **unfinished, flag-gated, default byte-identical.** The plume exists
as a compiled, probed mesh; it has not yet been seen drawing in a captured
frame (§5). Field reference and A/B instruments are complete. Base commit
`c1e78ab`; nothing merged from `main` after it.

## 1. Field reference

Source: the restored clean clip (`pointbreak-pleasure-point-2026-08-15-1528-
unique-clean.mp4`, SHA-256 `11428e3f…`, re-verified 2026-09-24, 30 fps,
2288 × 1286). The event is the one FIELD_WAVE_MOTION_2026-09-15 bracketed by
hand (curtain 351/358, plume 365/372). Eight frames at that annotation's
seven-frame stride, cropped to the head: `assets/crash-2026-09-24/field/`
(83 KB total). Ratios are pixels over pixels; the camera is uncalibrated, so
no metre is reported. Rows were read from 3× ruler-gridded zooms of the
event's column band (x 660–800) and are manual annotations (±3 px), the way
the 2026-09-15 brackets were; the automatic 90th-percentile luma profile in
the same band is the check (`field-ratios.json`, `automatic[]`: bright rows
first appear at frame 365, top row 762 → 755 → 753 over 365/372/379,
within 3–6 px of the manual tops).

| quantity | value |
|---|---|
| visible face height (crest row 749 → foreground-foam boundary 797) | 48 px |
| plume top over the foam boundary, frame 372 | **1.00 × face** (top at the crest line) |
| plume top over the foam boundary, frame 365 (onset) | 0.94 × face |
| whitewater line top, frame 386 | 0.94 × face |
| plume alongshore extent, frame 372 (x 650–800) | **3.1 × face** |
| plume extent at onset, frame 365 | 2.5 × face |
| curtain depth below the crest, frame 358 | 0.44 × face |
| curtain (358) → broad plume (365/372) | 7–14 frames, **0.23–0.47 s** |
| plume (372) → merged whitewater (379/386) | 7–14 frames, 0.23–0.47 s |

The plume never rises much above the crest line from this low cliff camera;
it is broad (three faces along the line), dense white, and it becomes the
whitewater line within half a second. The frames' dark face stays readable
to the right of the event throughout.

## 2. What the drawn wave does at the landing (GPU transect, Sewers x = −52)

`curlProbe` at t = birth + 0.8 s (tauD 0.38): the lip's forward-most drawn
point is at (y 7.8, z −230.1) from source z −240; the tip (max y 9.17) at
source −235; the fold puts source z −242…−230 at drawn z −230…−237. The
shared landing zL = −229.6 (`breakerLandingFrameAt`) is therefore drawn at
y ≈ 7.8–10 m **behind the lip**, and rises from 6.0 m at impact to 10.0 m at
tauD 0.38 as the crest arrives at it (probe rows, all three stations). This
is LIP_DESCENT's "the receiving face can be above or behind the lip"
measured again. The face ahead of the lip reaches y 3.2 m at source −222
(= zc + 1.9 h_crest, drawn z −227, 3 m ahead of the lip) and the trough
(y −1.0) at −210.

Consequence: a plume standing on the shared landing stands on the crest's
back. The first cut did exactly that and read as a translucent sail behind
the crest (`qa/crash-2026-09-24/close_crash_*.jpg`, the `crash` arm). The
retained design anchors the plume between the **live lip** (CURTAIN_VERT's
own tip construction) and a **contact point** at zc + `PLUME_REACH_HC` = 1.9
crest heights (the descent experiment's full-plunge receiver is 1.6). That
reach is the one authored offset the plume adds to the shared landing frame;
locus, ceiling, clock and strength are `impactLandingAt` /
`breakerLandingFrameAt` unchanged.

## 3. Design as committed

`PLUME_VERT/FRAG` (shaders.js), built by `main.js ensurePlumeMesh()` only on
a `#crash` boot or on `__pointbreak.setCrash(g>0)`:

- **Volume, not a sheet.** Two ribbon cuts (a dome on the landing; a
  lip→contact arch) were rejected on opened frames — both read as a
  translucent sail from every camera. The committed plume is an instanced
  cluster of 5000 seeded puffs (h_crest-scale, radius 0.16–0.36 h_crest,
  billboarded, rotated), centres on the lip→contact chord humped along the
  chord's outward normal (up and shoreward) by `PLUME_OVER × splashUpPeakM`,
  spread ±1.4 h_crest along the line, sliding toward the contact as they
  collapse. Fragment: sphere-normal Lambert with the water's own floor
  (0.42 + 0.58 N·sun), two-octave boil erosion of the rim that deepens with
  life.
- **Clock.** tauD from `impactLandingAt`: erupt 0–0.28 s, hold to 0.45 s,
  gone by 0.90 s after impact. Authored seconds; no state; seek-exact.
- **Strength.** The plume material binds `u_roller` to `u_crash`, so
  `impactLandingAt(x,t).w` = gain × the roller's contact ramp × lifecycle
  impact peak. Spilling sites read zero from the same knob; no second
  landing or clock.
- **Build.** Compiled under `ROLLER` privately (the landing helpers live
  under `#ifdef ROLLER` in the shared model, which this track does not edit).
  The grid material carries no define and no branch.

### Shared-clock reconciliation

Model: curtain visible from ~0.25 s local age, impact at `CRASH_PEAK_S` 0.42,
curtain gone 0.72; plume 0.42 → 1.32. Field: curtain → broad plume
0.23–0.47 s (sampling bracket; 0.70 s is the wide bound the 09-15 note kept),
plume → merged whitewater 0.23–0.47 s. Model curtain-onset → plume-peak is
0.42 + 0.28 − 0.25 = 0.45 s (inside the bracket); plume end is 1.07 s after
curtain onset against the field's 0.7–0.93 s to the merged line. The plume
is ~0.15–0.35 s long by the field's definition of "merged", but the model's
grid bore is present from local age 0.55 underneath it, so the handoff is
covered; **no shared constant was moved**, and the field's event definitions
are still not aligned with the model's birth/impact definitions (Second Peak
context vs Sewers, uncalibrated camera).

## 4. Measurements

**Default parity** (`probe_crash.mjs`, this tree vs pristine `c1e78ab` on a
second port): 4 frames (Sewers close × {48, birth+0.7}, Lookout × {48, 51}),
**0 pixels differ** in every frame. Measured on the first (ribbon) cut; the
mechanism that makes it hold — no mesh on a default boot, no grid define, no
grid uniform branch — is unchanged in the committed puff version, but the
parity run was not repeated after the rewrite.

**GPU probe** (exact PLUME_VERT text as a float pass, 17 spine samples,
three Sewers stations, 36 ages each, out-of-order seeks, gain-0). Last full
pass on the ribbon cut: 108 poses finite, feet exactly on the drawn water,
landing clock = lifecycle clock, visible only for tauD ∈ (0, 0.9), peak
top / h_crest 0.65–0.73, 9 seeks exact, gain 0 → alpha 0 everywhere
(`assets/crash-2026-09-24/probe.json`). On the committed puff version the
probe passed x = −84 (top over contact 1.00 h_crest, over lip +0.12, contact
≥2.5 m ahead of and ≥4.0 m below the lip) and **failed the strict
"contact ahead of the lip" assertion at x = −52, age 1.15 by 0.43 m** —
late in the collapse the lip's drawn point has moved ahead of the 1.9 h
contact. Not fixed; either the assertion is loosened for tauD > 0.6 or the
contact should follow the crest after impact.

**Alongshore extent** (probe, t = birth + 0.8): one station's clock lights
~4.5 m of line at Sewers (tauD steps 0.5 s per 2.5 m), against the field's
three face heights — the reason for the ±1.4 h_crest spread.

## 5. What is not done

1. **The puff mesh has not been seen drawing.** Every headless frame at
   `#crash=1` is pixel-identical to default while the probe reports alive
   puffs with alpha 1 at the same clock. Diagnosis so far: (a) the shipped
   spray's identical instanced recipe also draws nothing under headless
   ANGLE/Metal — a position-scaled NDC scatter on the spray geometry drew
   zero pixels while a `gl_VertexID` scatter drew 5000 dots — so `position`
   reads as zero for instanced draws in this rig; corners were moved to
   `gl_VertexID` (committed), and the real shader still draws nothing; (b) a
   plain red plane added to `world` draws, and the mesh IS issued (6 vs 5
   draw calls, +10 000 triangles). The next test was the real vertex shader
   with a solid-red fragment, to split vertex from fragment; it was not run.
   The `qa/` `crash` arm frames are the **first ribbon cut**, kept as the
   record of why that geometry was rejected.
2. Roller frames were captured (`qa/crash-2026-09-24/close_roller_*`,
   `lookout_roller_*`) but only `close_roller_0.80` was opened: at the close
   camera it is near-indistinguishable from default (a slightly brighter
   patch on the crest). The roller promotion question is **not answered**;
   the matched frames exist for the coordinator to open.
3. The plume's look has not been judged by eye at all.

## 6. Reproduction

Serve this tree and a pristine `c1e78ab` checkout (`scripts/serve.py`).
The spec ports 8133/8134 were taken by a sibling agent's baseline mid-run,
so the numbers above were produced on 8143/8144; the scripts default to
8133/8134 and take `--base-url` / `--baseline-url`.

```sh
node scripts/probe_crash.mjs --base-url=http://127.0.0.1:8143 --baseline-url=http://127.0.0.1:8144
node scripts/capture_crash_ab.mjs --base-url=http://127.0.0.1:8143      # 32 JPGs, 0.9 MB
python3 scripts/measure_crash_field.py '/Volumes/andyed/Movies/desktop-captures-2026-09/pointbreak-pleasure-point-2026-08-15-1528-unique-clean.mp4'
```

Playwright is found by the sibling-repo walk or `PLAYWRIGHT_DIR`; pngjs by
`PNGJS_DIR`. The probe and captures route `main.js` to expose `renderer`
(measure_lip_descent's method); parity frames unroute so each tree serves
its own files. Run browser rigs one at a time — two concurrent Chromium
instances on this GPU pushed boot past the timeout.
