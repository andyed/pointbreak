# Visual ground truth — marine-layer day photos

References: two stills of Pleasure Point supplied in-session 2026-08-09, both
typical marine-layer conditions — exactly the "grade vs Surfline PP cam"
regime the spec's acceptance test names.

1. Aerial drone still (cliff-top houses, riprap, full lineup, one broken wave
   mid-frame) — the *scene*. Observations ranked by shading ROI below.
2. Low/water-level still (single peeling wave, rider at the pocket, whitewater
   trailing, paddlers, kelp bands, birds) — the *wave*. See "The zipper,
   photographed" section.

## What the photo says the renderer must get right

1. **The read is foam, not faces.** On a small mushy day the unbroken swell
   lines are barely darker than the surrounding water — almost all of the
   "ocean" signal is the geometry of white water: a wide ragged bore patch,
   tens of meters laterally, with streaky decay trailing far behind the
   break. Foam is the brightest element in frame (strong albedo step vs
   mid-gray water). If foam distribution is right, the scene reads even with
   modest face shading; the reverse is false.
2. **Marine-layer light = no glitter.** Overcast sky → broad soft sheen, no
   sparkle field, low-saturation gray-green water, slightly warm gray sky
   reflection. Kelp-dark patches punctuate. The spec's fresnel+glitter (M1
   item 2) needs a sky-state switch: glitter amplitude ∝ sun visibility;
   default PP mood is DIFFUSE. Sunny-day glitter is the special case, not the
   default.
3. **Aerial perspective is strong and low-contrast.** Hills dissolve into the
   marine layer; no hard horizon. Confirms M1 item 5 (fog matched to sky) as
   high-value.
4. **The crowd is a realism cue.** Dozens of sitting surfers = 2–10 px dark
   marks (body dark, board lighter) scattered around the takeoff zone and
   shoulder. A static "lineup" scatter — sitting riders bobbing with the
   surface — would be a near-free, high-yield realism feature, and it
   solves silhouette-scale calibration for the M3 rider (the rider should
   match these mark sizes at Cliff-cam distance). Candidate M3+ item.
5. **Cliff backdrop:** buff/tan cliff + riprap band with white swash at the
   base, houses along the top. A simple backdrop card (spec says cliffs may
   come later) would anchor scale and place. The wet cliff base's white
   swash line marks the inshore boundary of the playfield.
6. **Whitewater persistence.** The broken wave's foam field survives well
   after the passing of the crest — decay time on the order of tens of
   seconds, advected shoreward. Foam lifetime is a visible parameter, not
   cosmetic.

## The zipper, photographed (photo 2 — water-level)

One frame contains the whole model: glassy unbroken shoulder → feathering
crest at the pocket → long broken whitewater section trailing down-line. The
pocket transition is COMPACT — a few meters of wave, not a gradient across
the whole face. brk/pocket/foam fields have a photographic ground truth now.

1. **Three-tone value structure carries the wave.** Flats read light silver
   (sky reflection at grazing incidence); the rising unbroken face is the
   DARKEST thing in frame (steep face reflects dark water/kelp, not sky);
   foam is white. Bright flat / dark face / white foam — value, not color, is
   the read. A shader that doesn't darken the face as it steepens will never
   read at water level. (This is fresnel geometry doing the work: face
   normals tilt toward the viewer → transmission/dark; flats mirror the
   bright sky.)
2. **Spilling onset = a thin feathering line.** Low-ξ breaking starts as a
   white crest-edge thread, not a lip. The ξ dial's low end has a specific
   look: feather → crumble → bore.
3. **Foam ages visibly along the broken section.** Fresh whitewater at the
   pocket is bright, chunky, vertically tumbling (bore mound); down-line it
   flattens to lacy streaks, then dissolves into gray. The lateral foam-age
   gradient IS the zipper's time history made visible — foam age should
   drive texture (chunky → lace → dissolving), not just opacity.
4. **Rider scale calibration:** crouched rider at the pocket, face roughly
   chest-to-shoulder height (~1–1.5 m); rider is a full dark silhouette,
   board barely visible. Paddlers prone on light-colored boards; sitting
   surfers beyond the shoulder. Matches photo 1's mark-scale conclusion.
5. **Kelp bands** read as dark smooth patches beyond the break (surface
   texture damping — same mechanism as the boil slick). Gulls low over the
   water are a cheap ambient-life cue.
6. **Camera note:** this near-water framing (shoulder-level, telephoto-ish)
   is its own preset candidate — a "Lineup" camera between Cliff and Follow;
   it is the view most viewers know from surf photography.

## Acceptance implication

Add to the M1/M2 grading rubric: judge captures in MARINE-LAYER mode against
this photo's qualities (foam-dominant read, diffuse sheen, fog) — not against
generic sunny-ocean renders. The Surfline cam on a gray morning is the target,
and the model should nail gray before it attempts golden hour.
