# Field-comparator ballot — curl jury 2026-09-24

Seat: Field comparator. Lens: side-by-side against Andy's 2026-08-15 Second Peak footage, ratios only.
Reference: `docs/research/CURL_TRUTH_2026-09-24.md` §1.2–1.3 and `assets/curl-truth-2026-09-24/measurements.json`
(events A outer peel, B section collapse, C thin head; H_f 49–59 px at the head). Nothing else read.

Rendered: `scratchpad/jury-matrix/secondpeak_lookout_<arm>_<46|48|50|52>.jpg` (site-matched: H0 1.4 m, T ~16 s, +0.73 m),
`sewers_close_<arm>_<clock>.jpg` (different spot, plunging card — lip-projection / curtain / plume only),
`qa/game-hack-2026-09-24/pocket_*.jpg`, `cliff_*.jpg`.

## 0. Two facts that frame everything below

1. **At Second Peak Lookout the four arms are pixel-identical.** Per-clock luma difference of each arm against
   `default`: mean |Δ| ≤ 0.01, at most 17 pixels differ by >20 (JPEG noise). `classicdescent`, `tube`, `tubeclassic`
   change nothing at the site the footage was shot at. Every departure from the footage in the Second Peak row is
   shared by all four arms; the arms can only be ranked on Sewers, and Sewers is not the site.
2. **Rendered exposure is ~1.4× the footage.** Rendered face luma 90–140 (footage <95), rendered foam 205–225 (footage
   >185, sky 217). The field thresholds (<95 dark, >185 bright) were re-set as: face = teal-tinted (G−R > 14) and
   luma <175 below the horizon; lip/foam = luma >205 and neutral; descending sheet = luma >182 neutral; cavity =
   luma <80 teal. Sky was masked by the horizon row (y 222–223 at Sewers, 214–220 at Second Peak). Raw boxes in
   `jury/measurements_rendered.json`, annotated crops in `jury/crops/ann_*.png`.

## 1. Ratio table

H_f = vertical crest-to-trough at the head, image px. All other columns ÷ H_f. "none" = not visible; "n/a" = not in
frame or undefined at that pose. Field row uses §1.3 brackets; letters mark which event.

| rig / arm | clock | H_f px | knuckle (head) width | lip projection ahead of face | curtain (descending sheet) | plume above prior crest | bore band | dark face readable ≥1 H_f ahead |
|---|---|---|---|---|---|---|---|---|
| **FIELD Second Peak 08-15** (A / B / C) | — | 49–56 A, 57–59 B, 49–55 C | 0.8–1.5 A, 0.5–0.8 C | none A, ≤0.3 B (eyeballed), ≤0.1 C | none A/C; 0.5–0.6 B (closeout section only) | none A/C; ≤0.15 B | 0.5–0.65 A, 0.4–0.55 B, 0.35–0.4 C | yes, all three (feather zone ~1 H_f A, ~0.5 C) |
| secondpeak_lookout **all four arms** (identical) — far head, x 896–984 | 46 / 48 | 30–38 (dark run under the far crest) | 2.0–2.5 (thin white line 75–80 px along the crest; not a knuckle) | ≤0.1–0.15 (small hook at the curl, 3–5 px) | none | none | **0.06–0.12** (white line 2–4 px thick); no aerated band behind — right of the head is the frame edge | yes — the whole near face (>10 H_f of the far head) is unbroken dark face; but it carries a specular glitter field 100–140 px tall (luma >235) that the overcast footage has no counterpart for |
| secondpeak_lookout all arms — far head | 50 / 52 | 16–23 | ~3 (line 60–70 px) | ≤0.15 | none | none | 0.1–0.2 (2–4 px) | yes |
| sewers_close **default** | 52 (50) | ~150 (130–190; trough is the shadow band at y 455–485; tube-arm cavity 130 px confirms) | 3.5+ (slab x 472→999, clipped; ≥530 px) — site-specific, not scored | **0.53** (slab underside 80 px below the crest line at x 735; 0.35 at t50) — a flat polygonal slab lying along the crest, not a line | none as a descending sheet (slab is horizontal) | **0.3** (slab top stands 45–70 px above the adjacent unbroken crest; 0.2 at t46) | 0.4–0.5 (smooth pale sheet x 800–1000, 75 px; luma 190–215, textureless) — site-specific | yes (≥3 H_f of teal face left of the slab) |
| sewers_close **classicdescent** | 52 (50) | ~150 | same as default | **0.7–0.85** (wedge leading edge 100–130 px ahead of the crest plane) | **1.5** (white wedge tip at y 489 vs crest line y 266 at x 834 → 220 px; 0.75 at t50) | 0.3 (white hump top y 252 vs crest ~300 at x 600) | as default | yes |
| sewers_close **tube** | 52 (50) | ~150 | same as default | white: **0.05** (thin sliver 8 px along the crest, x 560–720); glassy: ~0.5 (translucent teal wedge x 660–750, dark cavity behind) | white: none; glassy: 0.85 (wedge descends y 300→430) | none (≤0.05) | as default | yes |
| sewers_close **tubeclassic** | 52 (50) | ~150 | same as default | white: **0.05–0.1**; glassy: ~1.0 (ribbon leading edge ~150 px ahead) | white: none; glassy: **1.5** (ribbon y 280→500, dark cavity to y 460) | none | as default | yes |
| game-hack pocket_22p6 pitch (default + hack) | 22.6 s | ~78 (crest y 300 → tip/trough y 375 at head column) | n/a (pose along the barrel) | 0.5–0.8 (overturning curl, tip 40–60 px ahead) | 0.9–1.0 (curl descends full face; lands clear of face at 23.8) | **~1.1** (mist column top y ~215 vs crest 300 = 85 px) | 0.55 (45 px whitewater behind, x 600–700) | yes (dark wall left of head) |
| game-hack pocket_23p8 tube | 23.8 s | ~67 (crest y 305 → 372) | n/a | 0.8–1.0 (barrel) | 1.0 (lip lands clear, cavity open) | **2.3–2.6** (spray to y ~130–150; 155–175 px above crest) | ~0.6 | yes |
| game-hack cliff_25 / cliff_29p9 lineup | 25 / 29.9 s | ~30 (face band y 288→~318) | ~3 (white head 170 px wide at t25; 120 px at t29.9) | ≤0.1 | none | ~0.3 (faint mist 8–10 px above crest at t25) | 0.5–0.7 (white band y 290–318 = 28–35 px, but a smooth wedge/streak, not lumpy) | yes (long dark face left of head at t25; at t29.9 the head has run to the left edge) |

Camera pose and lens differ from the footage (footage: uncalibrated, ~11 m elevation, oblique seaward; renders:
Lookout pose along the crest at near water level, Sewers close pose in the pocket). Vertical ratios within one frame
are honest for heights, along-crest widths are foreshortened lower bounds, throw depth toward the camera is not
measurable in either. Rendered H_f at Sewers is ±25 % because the trough is a shading junction, not a luma run.

## 2. Per arm: two ratios furthest from the field, one closest

Field targets are the steady-head case (events A and C), which is what the forcing card reproduces. B's curtain
(0.5–0.6) and plume (≤0.15) belong to a closeout section and are quoted where a render shows a throw.

**default**
- Furthest: **lip projection 0.53 vs ≤0.1–0.3** (a flat slab several H_f long lying along the crest; footage lip is a
  thin bright line that projects ≤0.3 and crumbles in 8–12 frames). **Plume-equivalent 0.3 vs none/≤0.15** (the slab's
  top stands above the unbroken crest; in 1,825 field frames nothing rises >0.15 H_f above the prior crest line).
- Closest: **curtain — none**, matching A and C; and at Second Peak the shared far-head lip hook ≤0.15 matches C's ≤0.1.

**classicdescent**
- Furthest: **curtain 1.5 vs 0.5–0.6 (B) or none (A/C)** — 2.5–3× the tallest thing the footage ever threw, and the
  footage's curtain lands within 8 ± 4 frames on a 1–2 H_f closeout section, not on a peeling head. **Lip projection
  0.7–0.85 vs ≤0.3** — the wedge leads the face by most of a face height.
- Closest: **plume-equivalent 0.3**, same as default (still 2× B's bound, but the wedge goes forward and down, not up —
  which is the one thing §1.3 says the plume must do).

**tube**
- Furthest: **curtain (glassy) 0.85 vs none**, and **lip projection (glassy) ~0.5 vs ≤0.1–0.3** — a translucent wedge
  with a dark cavity behind it, the exact configuration §1.2 says never occurs in the footage ("no frame shows a lip
  landing clear of the face with dark cavity behind it"). At Sewers that is by design; the point here is only that the
  footage has no such shape to match against.
- Closest: **white lip 0.05 vs ≤0.1 (C)** — the only arm family whose white lip reads as the footage's "thin luminous
  lip over a dark face"; plume none matches A/C.

**tubeclassic**
- Furthest: **curtain (glassy ribbon) 1.5 vs none** and **lip projection (glassy) ~1.0 vs ≤0.3** — the largest
  descending geometry of the four.
- Closest: **white lip 0.05–0.1** (as tube) and plume none.

**Shared by all four at Second Peak (the site row):** the head is a white line **0.06–0.12 H_f thick** where the
footage's saturated bore is **0.35–0.65 H_f** (3–5× too thin); no round-topped bore sits behind the head; no knuckle
0.5–1.5 H_f wide sits at the head (the white is a line 2–3 H_f long along the crest, not a lump); no 0.5–1 s hook
cycle is visible in four clocks; and the near face carries a specular glitter field the overcast footage does not
have. None of the arms changes any of this.

## 3. Ranking by summed |ln(render / field)|

Scored only where both sides have a value and the rig is admissible for that ratio: **Sewers lip projection, curtain,
plume** (the three lip-phase ratios the task admits from Sewers). Second Peak ratios are identical across arms and
drop out of a ranking; Sewers knuckle and bore are site-specific and excluded. Field targets: lip 0.1 (C; A has none),
curtain none, plume none. A "none" on either side is scored at the field's own resolution floor, 0.1 H_f. Two
scorings, because the tube arms' descending sheets are glassy, not white, and the footage never shows a sheet of
either kind:

| arm | lip | curtain | plume | **sum, any material** | sum, white only |
|---|---|---|---|---|---|
| default | 0.53 → 1.67 | none → 0 | 0.3 → 1.10 | **2.77** | 2.77 |
| tube | 0.5 (glassy) → 1.61 | 0.85 (glassy) → 2.14 | none → 0 | **3.75** | 0.69 |
| tubeclassic | 1.0 (glassy) → 2.30 | 1.5 (glassy) → 2.71 | none → 0 | **5.01** | 0.69 |
| classicdescent | 0.78 → 2.05 | 1.5 → 2.71 | 0.3 → 1.10 | **5.86** | 5.86 |

**Ranked (any visible geometry counts):** 1. default · 2. tube · 3. tubeclassic · 4. classicdescent.
**If only white water counts:** 1= tube, tubeclassic · 3. default · 4. classicdescent.

Either way classicdescent is last: it is the only arm whose *white* water both leads the face by ~0.8 H_f and
descends 1.5 H_f, and the footage's one throw did 0.3 and 0.55. Default's problem is a slab that is too thick and too
long, not a throw. The tube arms' white lip is the closest thing in the matrix to the footage's thin line; what they
add is a glassy sheet the footage never shows.

**Caveat, stated plainly:** this is ordinal, not metric. Pose and lens differ between footage and renders and between
the two render rigs; Sewers is a different spot on a plunging card; H_f at Sewers is ±25 %; and the ratios that would
discriminate at the site — bore thickness, knuckle width, hook cycle — are identical across arms because no arm
fires at Second Peak. A ranking on Sewers lip geometry says which arm's *throw* is least unlike the footage; it says
nothing about which arm would look like Second Peak, because at Second Peak they all look the same.

## 4. Files

- Ballot: `scratchpad/jury/FIELD_BALLOT.md` (this file)
- Measurements: `scratchpad/jury/measurements_rendered.json`; scripts `jury/measure.py`, `jury/measure2.py`
- Crops: `jury/crops/sewers_arms_50.png`, `sewers_arms_52.png` (four arms side by side);
  `ann_sewers_<arm>_<clock>.png` (lip box red, ≥182 sheet orange, crest rows green, horizon blue);
  `sp_farhead_strip.png` (Second Peak far head, 4× at 46/48/50/52); `sw_head_<arm>_<50|52>.png`;
  `ann_gh_<frame>.png`; `gh_pitch_22p6.png`, `gh_tube_23p8.png`.
