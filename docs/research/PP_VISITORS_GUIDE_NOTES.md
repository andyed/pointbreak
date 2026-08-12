# Pleasure Point — visitor's-guide ground truth

Two guide sources, read 2026-08-09. Culture/geography sources, not measurement
sources — use for preset character, naming, and along-point structure, not for
numbers that MODEL.md derives elsewhere.

1. "A Visitor's Guide to Longboarding Pleasure Point," Surfer.com.
   https://www.surfer.com/culture/a-visitors-guide-to-longboarding-pleasure-point
2. "A Beginner's Guide to Surfing Pleasure Point," Sunny California (local
   surf shop blog).
   https://sunnycalifornia.com/blogs/news/beginners-guide-surfing-pleasure-point

## Facts extracted

- **Takeoff zones**: distinct spots span First Peak to 38th Avenue. Pleasure
  Point proper begins at 33rd Ave; the Hook is the separate spot at 41st Ave,
  east of PP proper (street numbers increase eastward on the East Side).
- **Second Peak**: the softer-breaking section, longboard-favored; peels
  ~100 yards (~90 m) on a good day.
- **Seasonality — year-round break** (unusual for a CA point; wide swell window):
  - *Winter (W swells)*: groomed by Monterey Bay refraction, bent into the East
    Side coves, power and size reduced — but double-overhead still shows at the
    top of the point.
  - *Summer (S swells)*: aim directly at the point; the zone becomes a
    "smorgasbord of peaks" — many simultaneous takeoff zones.
- **Culture**: named in the 1920s for a Prohibition-era speakeasy above the
  break, not for the surf. Laid-back counterpart to harder-breaking Steamer
  Lane. Jack O'Neill's house overlooked the break.

## Model implications

- **Second Peak preset**: high peel angle α (mellow), low-to-moderate ξ
  (spilling), ride length on the order of 90 m — a concrete acceptance number
  for the preset: a rider at Second Peak should hold the pocket ~90 m before
  the wave shuts down. This is the longboard-feel reference preset.
- **Swell-direction knob** (Phase 3, today's-ocean): direction should modulate
  more than amplitude:
  - W (winter): apply a refraction attenuation factor (Monterey Bay grooming)
    but allow the largest Hs at the *top* of the point — size decays down-point.
  - S (summer): little attenuation, and raise section noise σ_h / secondary
    zipper count — the "smorgasbord of peaks" is multiple concurrent break
    zones, not one clean zipper.
- **Stage extent**: First Peak → 38th Ave spans several takeoff zones; the
  ~600×500 m stage should keep the down-point neighbors (at least Second Peak)
  inside the playable area rather than modeling First Peak in isolation.
- **The Hook**: at 41st Ave, technically outside "PP proper" (which begins at
  33rd) but part of the same continuous down-point sequence — see the spot
  canon below.

## The golden rule (Sunny California guide) — along-point gradient

> "the waves get larger, faster, and more powerful as you move up the point"

This is the single most model-shaped fact in either guide: wave character is a
**monotonic function of down-point position**, not a set of independent spots.
The spots are positions on ONE continuous zipper whose parameters vary with u
(the down-point coordinate):

- α(u): low at the top (fast, steep, tapered walls) → high down-point (soft,
  slow, forgiving). Peel angle is a *field*, not a constant.
- Effective power/size decays down-point (shelter increases).
- **Activation threshold rises down-point**: Jack's "needs a bit more swell to
  really activate"; Privates "can shut down if there is little to no swell."
  Small swell = only the upper point breaks; big swell = everything lights up.
- Tide matters down-point: Privates "usually breaks on a lower tide" — tide is
  a Phase 3 today's-ocean input, and a hazard cue (high tide pins exits
  against the cliff; strong down-point current).

Design consequence: presets can collapse from separate parameter *sets* into
takeoff *positions* u₀ along one continuous point, with α(u), depth(u), and an
activation threshold(u). One model, seven doors into it.

## Spot canon, top → down-point (Sunny California guide)

1. **Sewers** — very top; fastest, most competitive.
2. **First Peak** — premier high-performance right; steeper tapered walls,
   shortboard zone.
3. **Second Peak** — toward 38th; softer, slower; longboard/progression zone
   (~90 m peel per the Surfer.com guide).
4. **38th Ave / Jack's** — O'Neill's green house overlooks it; needs more
   swell to activate; gentle rollers when on.
5. **The Hook** — 41st Ave; classic right, mixed bag, handles size, a bit
   faster; own parking lot, steep stair exit.
6. **Sharks** — further down; space, mellow lines.
7. **Privates** — most sheltered; slow easy takeoffs; lower-tide, needs swell.

Exactly seven spots — matches the 1–7 preset keys. NOTE: the current preset
bank (TODO Phase 1: Cowell's / Jack's / Second Peak / First Peak / The Slot /
Middle Peak) mixes in **West Side** spots — Cowell's, The Slot, and Middle Peak
are Steamer Lane–area waves, a few miles from Pleasure Point. Candidate
correction: retarget the preset bank to the PP canon above (decision pending —
flagged 2026-08-09). **RESOLVED 2026-08-10:** the bank was retargeted to the
canon above. The A-frame survived as a *parameter* rather than a named site,
which is the method-naming convention doing its job — the mechanism keeps its
name, the venue does not.

## Color for the eventual explainer essay

The speakeasy naming story and the O'Neill house are the essay's opening
texture — the place was named for pleasure before surfing gave the name its
second meaning.

## Lineup etiquette — source for a possible story/game mode

3. "Right of way question," surfing-waves.com forum, 27–28 March 2019.
   https://surfing-waves.com/forum/viewtopic.php?f=9&t=36508
   Read 2026-08-11. Culture source. A visitor drops in at **First Peak** from the
   inside on a longboarder who was already up and outside, and asks the forum who
   was right. Regulars answer: the wave belongs to the surfer already riding, and
   the poster describes First Peak that day as unusually competitive.

**Why it matters here.** The rules argued in that thread are *the* rules a
multi-agent lineup would need, and they are per-break, not universal — the thread
itself contrasts longboard-priority spots with shortboard-favoured ones, and notes
that Pleasure Point posts its own guidelines on a sign. Extracted, in the form a
sim could use:

- **Priority** goes to the surfer closest to the breaking part of the wave (the
  curl/peak), which at a peeling right means the surfer furthest up-point.
- **First up wins** — once someone is riding, the wave is theirs, and the deeper
  or later surfer must yield.
- **Collision avoidance is the inside surfer's burden**, unconditionally — the
  duty holds even when you believe you had the right of way.
- **Density is the variable.** The complaint is not about the rules but about
  crowd: at First Peak on a good day the rules are contested continuously.

**Model implications, if a story/game mode ever happens.** These are agent rules,
not wave rules — none of them touch MODEL.md. The interesting coupling is that
priority is defined by *position relative to the moving break point*, which the
model already computes: the zipper's instantaneous break location **is** the
priority reference, so "who has the wave" is derivable from the same `u(t)` that
drives the peel. That is the cheap and correct hook — a lineup mode should read
priority off the break line rather than carrying a separate rules system. The
open defect noted in the repo (amplitude envelope not following the break line)
would have to be fixed first, or every priority call would be made against a
break point that is not where the tallest water is.

## Reading a surf report — the vocabulary the app should speak

4. "How to Read a Surf Report: A guide for tracking waves and finding surf,"
   Warm Winds (Rhode Island surf shop). Read 2026-08-11.
   https://www.warmwinds.com/blog/guides-4/how-to-read-a-surf-reporta-guide-for-tracking-waves-and-finding-surf-51
   Culture/vocabulary source, not a measurement source. Useful because it is the
   register an actual surfer uses, which is the register the HUD and the
   conditions bank should be in.

**The distinction the model already makes but the UI did not.** Swell height is
trough-to-crest in deep water; wave height is trough-to-crest on a wave *about
to break*. They are different numbers and the guide is emphatic about it. That
is exactly `u_H0` versus `min(Hsh, Hlim)` — the model has both and only ever
showed H₀. Measured on the repo's own dispersion module at T = 14 s: H₀ 0.8 m
breaks at 1.31 m, H₀ 1.5 breaks at 2.17, H₀ 2.8 breaks at 3.57. The HUD's
`swell` row reports the deep-water number; the number a surfer would quote is
the breaking one, and both belong there.

**Period is the energy readout, not a texture knob.** 6–12 s = windswell, weak,
small waves at the coast; 12–20 s = groundswell, powerful, "the best surf for
most areas". The conditions bank already spans 9–17 s, so it covers both
regimes — but the app never says which one it is showing. A `windswell` /
`groundswell` label costs one comparison and tells the viewer what they are
looking at.

**Swell window** — the range of directions with unobstructed straight-line
access to a break. This is the concept `PP_SWELL_CLIMATOLOGY.md` found
surf-forecast getting wrong for Pleasure Point (their window runs ~045–225°
through S and E, discarding the W–NW quadrant that is PP's actual winter
source after it wraps Soquel Point). Worth stating in the essay in these terms,
because "swell window" is the phrase a surfer already owns.

**Model implications.** None to MODEL.md. Three to the HUD and the bank:
report breaking height alongside H₀, label the period regime, and name the
swell window. All three are vocabulary, and all three are already computable
from state the model has.
