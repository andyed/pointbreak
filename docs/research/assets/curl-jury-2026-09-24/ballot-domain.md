# Surf-domain ballot — curl jury, 2026-09-24

Seat: surfer / coastal engineer. Rubric: CURL_TRUTH_2026-09-24 §4 (criteria 1–6, 11, must-not list; 7–10 only if a section shuts). Site reference: the three field sheets (events A, B, C) plus the f1050 locator. Judged from the drawn frames only; no tube/classic/hack research notes were read.

Frames: `scratchpad/jury-matrix/<rig>_<arm>_<clock>.jpg` (Sewers close cam, card day H0 2.2 m T 15 s; Second Peak Lookout, field day H0 1.4 m tide +0.73 m; clocks 46/48/50/52 s) and `qa/game-hack-2026-09-24/` (arm `hack`, pocket 21.4–29.9 s, cliff 25/29.9 s).

## Two findings that frame every table below

**F1 — At Second Peak the four arms drew the same picture.** Greyscale pixel diff against `default` at every clock: `classicdescent` 0.01–0.02 %, `tube` 0.00–0.01 %, `tubeclassic` 0.01–0.02 % of pixels differ by more than 8 levels; that is JPEG noise. The opt-in arms contribute nothing on the field-day forcing at the field pose. Every Second Peak row below is therefore one row.

**F2 — At Sewers, `tube` alone barely touches the frame.** `tube` vs `default`: 1.3–1.5 % of pixels at 46–50 s, 5.3 % at 52 s. `classicdescent` and `tubeclassic`: 15.7 % → 34.1 % rising through the carrier, and `tubeclassic` tracks `classicdescent` to within 0.3 % at every clock. Whatever `tube` adds, it adds a small thing on top of whichever lip profile is active; the visible difference between arms is the classic profile.

**What the site looks like (from the sheets, for calibration):** a white knuckle 0.8–1.5 face-heights wide at the left end of a thick round bore; dark sloped face ahead; a thin hook every 0.5–1 s that merges without detaching; the one crash is a section walling up, a half-height curtain, a broad forward plume, then lumpy bore. No frame of 1,825 shows a cavity.

---

## Arm: `default` (shipped renderer: heightfield bend + curtain)

### Sewers (card day; plunging is a look decision here)

| # | criterion | score | evidence |
|---|---|---|---|
| 1 | dark sloped face ahead of the break, ≥1 H_f | PASS | sewers 46/48: right of the head the face is dark, readable, concave and unbroken for well over a face-height. Weakens by 50/52 where the near face is pale glass. |
| 2 | compact knuckle, top level with crest | FAIL | sewers 46: the head is a low-poly white polyhedron ("paper boat") with hard planar facets; sewers 52: a flat white slab lying across and above the crest. Not a knuckle at any clock. |
| 3 | thin, irregular, short-lived lip line | FAIL | no bright scalloped edge at any clock; the white is a solid faceted body with straight edges (52). |
| 4 | thick round-topped bore behind the head | FAIL | sewers 46–52: behind the head is glossy dark water with specular glints; zero foam, zero bore. |
| 5 | whitewater ages into lace | FAIL | no whitewater exists to age, any clock. |
| 6 | one active subject per wave | PASS | one head per frame. (The pale curtain band to its right at 48–52 is a second bright object but on the same crest.) |
| 7–10 | section-shut sequence | NA | no frame shows a section walling up. |
| 11 | pitched lip with cavity | look decision | sewers 46: the concave fold right of the head reads as an open hollow. Allowed at Sewers per §3 only as a flagged look, and it is drawn as the steady head, not a section event. |
| MN-a | lip stands >0.15 H_f above crest | FAIL | sewers 52: the slab's top sits roughly 0.2–0.25 H_f above the crest line before anything falls. |
| MN-b | full-height sheet / flap over the face | PASS | the curtain band (48–52 right) is crest-hugging, not a face-covering flap. |
| MN-c | smooth pale face + dark folded ribbon | borderline | sewers 50/52: the near face is smooth pale glass; the dark fold (46, right) sits on a dark face, so the exact `sim_current_058` pairing is not present. Flag, do not block. |
| MN-d | head is a bright horizontal band, not a knuckle | FAIL | sewers 48/50/52: the pale curtain along the crest right of the head is a planar horizontal band. |
| MN-e | cavity on a card day | look decision | as row 11. |

### Second Peak (field day; spilling is the physics and the footage)

| # | criterion | score | evidence |
|---|---|---|---|
| 1 | dark sloped face | PASS (hollow) | sp 46: the second-row wall is dark and sloped for its whole length, but there is no break for it to be "ahead of". |
| 2 | knuckle head | FAIL | no white head anywhere; the only crest feature is a ~30 px glassy curl at the far right (sp 46, x≈900). |
| 3 | thin lip line | FAIL | the bright line along the near crest and second-row crest (sp 46–52) is sun-glint on glass, not foam. |
| 4 | bore | FAIL | no bore at any clock. |
| 5 | lace | FAIL | no whitewater at any clock. |
| 6 | one active subject | FAIL | three parallel unbroken walls of equal visual weight (sp 48); no live head to be subordinate to. |
| 7–10 | section shut | NA | — |
| 11 | pitched lip + cavity | PASS | none drawn, correctly. |
| MN-a | lip above crest | PASS | nothing stands above the crest. |
| MN-b | full-height sheet | PASS | — |
| MN-c | pale face + dark ribbon | borderline | sp 46–52: the near face is smooth pale teal glass; no dark folded ribbon. Flag. |
| MN-d | bright horizontal band, not knuckle | FAIL | sp 46–52: the specular glitter strip along the second-row crest is the only "head-like" feature and it is a horizontal band. |
| MN-e | cavity on card day | PASS | none. |
| render defect | — | note | sp 50/52: black triangular tears in the near surface at (≈700,480) and (≈900,440); mesh, not water. |

**Site verdict:** the field pose on the field day renders an unbroken glassy swell. The footage at this exact pose shows a spilling knuckle with a bore. Fails the site test before any lip question arises.

---

## Arm: `classicdescent` (opt-in hooked lip + curtain descent handoff)

### Sewers

| # | criterion | score | evidence |
|---|---|---|---|
| 1 | dark sloped face | PASS | sewers 46/48: same dark concave face right of the head as default. |
| 2 | knuckle head | FAIL | sewers 46: two small faceted white wedges at the crest; 48: a white block; 50/52: a white blade. Faceted geometry, not an aerated bulge. |
| 3 | thin irregular lip line | FAIL | edges are straight and planar (52); nothing scalloped or foam-bright. |
| 4 | bore | FAIL | glossy water behind the head at every clock. |
| 5 | lace | FAIL | no whitewater. |
| 6 | one subject | PASS | one head per frame. |
| 7–10 | section shut | NA | the 52 s blade is a descending curtain, but no wall preceded it and no plume follows in the sampled clocks; cannot score 7–10. |
| 11 | cavity | look decision | sewers 46: the default's dark fold is still there right of the head; the arm itself adds no cavity. |
| MN-a | lip above crest | PASS | sewers 46/48: the wedges sit at or within ~0.1 H_f of the crest; nothing stands up like default's 52 slab. |
| MN-b | full-height sheet | PASS | sewers 52: the descending blade reaches about half the face, which is the sheet-B proportion (28 px on a 59 px wall). |
| MN-c | pale face + dark ribbon | borderline | as default (shared face). |
| MN-d | bright horizontal band | FAIL | same pale curtain band along the crest right of the head (48–52). |
| MN-e | cavity on card day | look decision | as row 11. |

### Second Peak — identical to `default` (F1); same table, same site failure.

---

## Arm: `tube` (opt-in explicit swept ribbon replacing the fold)

### Sewers

| # | criterion | score | evidence |
|---|---|---|---|
| 1 | dark sloped face | PASS | sewers 46/48: shared dark concave face right of the head. |
| 2 | knuckle head | FAIL | sewers 46: the default's white faceted blob is still there, now with a dark-teal hole punched in it; 50/52: the head is a translucent glass step / vertical glass panel. No white bulge. |
| 3 | thin lip line | FAIL | sewers 48: a single tiny curled hook (~0.1 H_f) at the crest; it is clear glass, not a bright edge, and there is one of it. |
| 4 | bore | FAIL | glossy water behind the head, every clock. |
| 5 | lace | FAIL | no whitewater. |
| 6 | one subject | PASS | one head. |
| 7–10 | section shut | NA | — |
| 11 | cavity | look decision | sewers 46: a small dark hollow inside the head; sewers 52: a vertical glass wall with a dark teal interior behind it. Both are cavities at Sewers on the card day; drawn as the steady head. |
| MN-a | lip above crest | PASS | sewers 52: the glass panel replaces default's standing slab and does not rise above the crest. |
| MN-b | full-height sheet | PASS | the 52 s panel is ~0.4 H_f. |
| MN-c | pale face + dark ribbon | borderline | as default. |
| MN-d | bright horizontal band | FAIL | shared crest curtain band (48–52). |
| MN-e | cavity on card day | look decision | as row 11. |

### Second Peak — identical to `default` (F1); same table, same site failure.

---

## Arm: `tubeclassic` (both opt-ins)

### Sewers

| # | criterion | score | evidence |
|---|---|---|---|
| 1 | dark sloped face | PASS | sewers 46/48: shared dark concave face. |
| 2 | knuckle head | FAIL | sewers 46–52: the head is a clear curling ribbon with a dark interior; no white bulge, no aeration at any clock. |
| 3 | thin irregular lip line | FAIL (closest) | sewers 48: a slender ribbon hook a few percent of H_f thick, the right thickness; but it is clear glass, not a bright edge, unscalloped, and persists 46→52 rather than living 0.3–0.7 s. |
| 4 | bore | FAIL | glossy water behind the head, every clock. |
| 5 | lace | FAIL | no whitewater. |
| 6 | one subject | FAIL at 46, PASS after | sewers 46: two simultaneous hollows on the crest (head, and a second white-rimmed hollow further right); 48–52 one. |
| 7–10 | section shut | NA | — |
| 11 | pitched lip with cavity | look decision | sewers 52: a clear arched lip projecting ~0.3–0.4 H_f ahead of the face with a dark roughly elliptical cavity behind it, landing on the face. The most literal §4-11 object in the matrix; allowed at Sewers only as a flagged look, and it is drawn as the steady head. |
| MN-a | lip above crest | PASS | the ribbon leaves the crest line and curls down; nothing stands up. |
| MN-b | full-height sheet | PASS | the ribbon is ~0.35–0.45 H_f. |
| MN-c | pale face + dark ribbon | borderline+ | sewers 52: the face under the lip is pale glass and the ribbon reads dark from inside — closest of the four to the `sim_current_058` pairing. Flag. |
| MN-d | bright horizontal band | FAIL | shared crest curtain band (48–52). |
| MN-e | cavity on card day | look decision | as row 11. |

### Second Peak — identical to `default` (F1); same table, same site failure.

---

## Arm: `hack` (game-style wave, `qa/game-hack-2026-09-24/`)

| # | criterion | score | evidence |
|---|---|---|---|
| 1 | dark sloped face ahead of the break | PASS | pocket 22.6/23.8: dark, readable, sloped face ahead of the lip for more than a face-height; cliff 25: dark wall ahead of the white head. |
| 2 | compact knuckle, top level with crest | PASS (cliff) / FAIL (pocket) | cliff 25: a compact white head at the right end of a dark wall, top level with the crest — the only frame in the whole matrix that reads as sheet-A silhouette at distance. Pocket 23.8: the head is a thrown lip, not a knuckle. |
| 3 | thin irregular lip line | FAIL | pocket 21.4 feathers thin, then 22.6–25 the lip is a thick smooth white sheet, not a scalloped few-percent edge. |
| 4 | thick round-topped bore | FAIL | pocket 29.9 / cliff 29.9: the whitewater is a flat straight white strip below the crest, not a round-topped bore level with it. |
| 5 | lace | FAIL | pocket 29.9: uniform white band, no grey lumps, no perforation. |
| 6 | one subject | PASS | one wave, one head, every frame. |
| 7–10 | section shut | NA | 25 impact / 26.6 plume are the steady head landing, not a section walling up first. |
| 11 | pitched lip with cavity | FAIL | pocket 23.8: full cavity behind a lip thrown ~0.5 H_f ahead, landing clear of the face, on a Pleasure Point lineup on a card-scale day. |
| MN-a | lip above crest | FAIL | pocket 22.6–26.6: the spray plume rises ~0.3 H_f or more above the crest line. |
| MN-b | full-height sheet | borderline | pocket 23.8: the curtain covers ~0.6–0.7 of the face; not full-height, but well past the 0.5 curtain of sheet B. |
| MN-c | pale face + dark ribbon | PASS | face is dark, ribbon is white. |
| MN-d | bright horizontal band | FAIL | cliff 29.9: a straight white ribbon runs the whole line as a geometric strip. |
| MN-e | cavity on card day | FAIL | pocket 23.8. |

---

## Answers

### (1) Rank for "reads as Pleasure Point breaking"

None passes. Second Peak decides nothing (F1: identical, all unbroken). Ordered by distance from the sheets:

1. **hack** — the only arm with a white head level with the crest ahead of a dark face (cliff 25) and whitewater that actually trails the head; loses on the tube, the rising plume and the geometric foam strip.
2. **tubeclassic** — the only sim arm whose lip curls like water at a plausible projection (~0.3–0.4 H_f) with nothing standing above the crest; loses on zero foam anywhere.
3. **classicdescent** — lip stays at the crest and the 52 s descent has the half-face proportion of sheet B; loses because it is a white blade, not water.
4. **tube** — removes default's standing slab at 50/52 but replaces it with a glass box and punches a hole in the head at 46; near-invisible footprint (F2).
5. **default** — the slab stands ~0.2 H_f above the crest at 52 (must-not), faceted paper geometry, no foam.

### (2) Rank for "reads as a breaking wave at all"

1. **hack** — unmistakably a wave breaking, in every frame.
2. **tubeclassic** — a glassy barrel; wrong for this coast but water bending.
3. **tube** — a crease with a hollow and a glass lip; reads as a wave folding, barely.
4. **classicdescent** — white blocks and a descending blade; reads as a paper model.
5. **default** — a paper boat on a swell.

### (3) First defect a surfer would call out, per arm

- **default:** "The lip is a paper boat" — a hard-edged white polyhedron sitting on and above the crest with no foam under or behind it (sewers 52).
- **classicdescent:** "That's a fin, not a curtain" — the descending lip is a flat white triangular blade (sewers 52) and the crest lip is white blocks (46/48).
- **tube:** "It's a glass box" — the head is a translucent vertical panel with a dark interior and no white anywhere near it (sewers 52); at 46 it is the default slab with a hole.
- **tubeclassic:** "Dry barrel" — clear-glass lip and cavity with no white at the lip tip, no knuckle, no bore, no spray (sewers 52).
- **hack:** "It's throwing on a spilling point" — a full tube with a plume rising above the crest (pocket 23.8/26.6), and the whitewater is a straight geometric ribbon (cliff 29.9).
- **All four sim arms, shared:** at Second Peak on the field day nothing breaks at all — the field pose shows an unbroken glassy wall with mesh tears (sp 50/52); the footage at this pose shows a knuckle and a bore.

### (4) Which arm the tube work should build on

Build on **tubeclassic**: it is the only arm whose lip has water-like curvature and a plausible projection with nothing standing above the crest, and F2 shows the classic profile is what actually replaces the default head (15–34 % of pixels) while `tube` alone only punches a hole in it (1.5 %). Build it as a foam problem, not a geometry problem — neither arm draws a knuckle, a bore or any whitewater, and neither draws anything at Second Peak, which is where the footage lives.

---

Crops used for the close calls are in `scratchpad/jury/crops/` (2× upscales of sewers 46/52 heads per arm, Second Peak far-right curl, and the 50 s surface tears).
