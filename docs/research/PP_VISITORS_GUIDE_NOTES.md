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
