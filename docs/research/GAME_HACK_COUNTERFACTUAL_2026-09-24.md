# The one-shot surf-game counterfactual (2026-09-24)

**Question.** If the ask had been "make me a surfing game" and nothing else,
what would have been built, how long would it take, and how does the picture
compare with the renderer that derives its wave from measured bathymetry and
linear theory? Five sibling tracks were building the curl and crash the right
way; this track built the hack so the two can be judged at the eye.

**Artifact.** `experiments/surf-game-hack/` — `index.html`, `hack.js`
(691 lines, 22 `SHORTCUT:` markers in place), `capture.mjs`. Standalone: it
imports only `web-three/vendor/three.module.js` and nothing from `shared/` or
`web-three/`. Serve the repo (`python3 scripts/serve.py 8135`) and open
`/experiments/surf-game-hack/`. `c` toggles pocket/cliff camera, space pauses;
`#cam=cliff&t=25&speed=0` pins the clock (the page warms 4 s of particles and
camera lag before holding). `#dbg=phase` paints the sheet by break phase.

**Captures.** `qa/game-hack-2026-09-24/` — six pocket frames across the set's
second (1.35×) wave and two cliff frames, 1000×625 JPEG q80, 200 KB total,
`manifest.json` carries sim clock and camera position per frame.

**Reference frame.** `qa/descent-2026-09-15/verified/after-0.50.jpg` (the
current renderer at the pocket, pre-unmirror so its handedness is reversed
relative to the hack; the comparison is of the picture, not the peel
direction).

## What a game does

A crest **spline** (five hand-placed control points bending shoreward down the
point), a **swept sheet** whose 17-point cross-section is lerped between six
hand-drawn keyframes (round swell → feathering → pitching lip → open tube →
impact/collapse → whitewater bore) and resampled through a Catmull-Rom to 48
points so the normals do not band. The lip is a **fold** in the profile
polyline (out over the lip, back under it), so the curtain has two sides and a
thickness, and it is collapsed onto the face in the swell keyframe. A **break
phase** at each station is `(time since the peel passed) / Tbreak`, and the
peel point moves along the spline at a constant `Vp`: that *is* the peel. Foam
is three octaves of scrolling value noise masked by per-profile-point weights
(crest, lip, front) gated on phase. Spray, an impact plume (haze + a sparse
bright core), and whitewater mist are point sprites with typed launch speeds,
0.45 g, and typed lifetimes. A capsule on a box rides profile point 12 at the
phase-0.25 station. The pocket camera is an exponential lag (τ 0.55 s
position, 0.35 s target) on a frame anchored 13 m down the line from the
phase-0.36 station. Sets are a timetable: 1.0/1.35/1.12 × 2.3 m, 13.5 s apart,
14 s lull.

## Build time

About 20 minutes wall clock from empty directory to the committed captures
(18:33 → 18:53), across nine capture iterations. Roughly half of that was
fixing three things that had nothing to do with waves: the shore plane's local
→ world z mapping was inverted (the cliff camera was inside the hill); the
ocean's vertex normal was built in plane-local space and never rotated, so the
ocean shaded with a sideways normal while the wave sheet's flat trough shaded
correctly and looked like a white shelf beside it; and a `String.replace` of a
GLSL macro hit only the first occurrence once a second use was added, which
silently killed the wave mesh. The wave itself — profile keyframes, phase
sweep, foam, particles, camera — took about ten minutes and four iterations
to reach the frames committed here.

## The shortcut ledger

Every row is also a `SHORTCUT:` comment at the line where it is taken.

| shortcut | what it fakes | what the model has to supply instead |
|---|---|---|
| `H0 = 2.3 m`, set scale `[1.0, 1.35, 1.12]` | wave size, "the big one" | offshore H₀, Green's-law shoaling `Ks = √(cg₀/cg)`, the depth-limited cap `γh` over the surveyed bed |
| `Vp = 8.5 m/s` constant | peel speed, hence the ride | `Vp = c / sin α` with `c` from local depth and α from the break line's angle to the swell |
| `Tbreak = 4.6 s` constant | how long feather → whitewater takes at a station | Iribarren ξ (spilling vs plunging), the local depth gradient, the lip's fall time `~√(2H/g)` |
| six drawn profile keyframes | the overturning shape; whether it barrels at all | crest steepness, when the front face passes vertical, lip ejection velocity, the falling sheet's trajectory |
| five-point spline | where the break line is | the emergent `H₀Ks ≥ γh` locus over NCEI bathymetry and the OSM contour fit |
| break phase = time since the peel passed | where along the crest each stage sits | phase set by depth under the *moving* crest and by ξ; the model's "tube length" is a consequence, not a parameter |
| stationary crest line; arrival by translating it seaward-to-shoreward over `Trise` and scaling it up | shoaling and the approach | a wave that keeps travelling shoreward while it breaks; the break line is where the moving wave meets depth. This is the single biggest lie in the file: consecutive waves occupy the same line, so wave *n*'s bore sat inside wave *n+1*'s swell until a drift term was bolted on |
| bore slides shoreward at `0.45c` and sinks out over 8 s | the whitewater's life | the broken wave keeps its own celerity and dissipates by a bore energy-flux law |
| taper `smooth(0, 34 m)` at the apex, linear shrink down the point | the shoulder | the refraction pattern over the bed |
| `lump` = two sinusoids along the crest | a crest that is not a ruler line | section noise σ_h, directional spread |
| painted foam: crest feathers at phase 0.03, lip whitens at 0.16–0.40, front whitens after 0.52 | aeration | aeration from the plunge geometry with a decay time |
| "thin green" = `pow(up, 2.2)` × backlight factor | light through the lip | refraction and subsurface transport (the renderer does not do this either) |
| particle plume: 300/s haze + 45/s core, launch 3–10 m/s, life 0.7–2.2 s, 0.45 g | the crash | plume clocked from the lip's fall time and impact energy |
| sun placed where the pocket camera sees spec | lighting | time of day, site azimuth |
| capsule glued to profile point 12 at phase 0.25 | a surfer | a rider model, makeability |
| set timetable | sets and lulls | two beating spectral components and Δf |
| sky gradient + exp fog | atmosphere | nothing — the renderer does the same |

## The picture, hack vs reference

Judged against `after-0.50.jpg` at the pocket.

**What the hack gets right.** The composition: horizon a third down, dark
bottle-glass face filling the lower two-thirds, sky sheen on the face at
grazing angles, one hard spec blob on the lower face, the lip under the
horizon. The face colour and its gradient to a thin green band along the
crest. The crest feathering with spray blowing back. The white lip reads as a
breaking wave from the pocket at 20 m. A distinct **sequence** across a wave:
feather → thrown lip → curtain → collapse → bore, with the peel moving down
the line between frames. The cliff view reads as a long wall with a peel and a
whitewater nose at its head.

**What the hack gets wrong.** The lip is a smooth white roll: no glassy
overturning sheet, no spec on the lip, no visible thickness gradient from
thick root to thin tip, and the tube interior is never visible because the
curtain fills the mouth from the pocket camera's angle. The reference's lip is
translucent glass with an aerated edge and a real *fold* you can read the
depth of. The whitewater behind the peel is a flat white slab, not a
turbulent mound. The bore of the previous wave is a straight streak until it
dies. The crest is a straight ruler line from the cliff (two sinusoids do not
make it a wave). The plume is a soft haze with no structure. The surfer is a
bollard. And none of it responds to anything: change the tide, the swell
period, the direction, the spot, and the picture is identical, because there
is nothing to change.

**Net.** At the pocket, at a glance, the hack is competitive with the
reference on composition and colour and loses on the lip, which is the one
thing the reference frame is about. From the cliff the hack is a wall with a
white end. The reference frame has more *information* in it (the curl scales
with wave size, the lip's aeration has a locus); the hack has more *cliché* in
it (the sheen, the spec, the sky), and cliché is what a viewer pattern-matches
first. That is the finding: the physics bought a lip that can be wrong in a
diagnosable way; the hack bought fifteen minutes to a plausible frame and a
lip that can only be re-drawn.

## Worth borrowing into web-three

Judged on whether the piece is *look* (borrow) or *mechanism* (do not).

- **Profile morph keyframes** — as a *presentation* layer, yes. Author the
  overturning cross-section as a small keyframe bank indexed by a phase the
  *model* supplies (from ξ and the depth ratio), and loft it along the model's
  own break line. `profileAt()` + the Catmull-Rom resample + the fold trick in
  `hack.js` are ~40 lines. Do not let the keyframes decide *when* to break.
- **Foam scroll** — yes, cheaply. Three noise terms at different scales (`n1`
  fbm along the crest, `n2` finer, `n3` streaks down the curtain) blended into
  a single threshold, masked by per-profile weights. The streak term is what
  made the curtain stop looking like a pipe.
- **Two-emitter plume** — yes. A dense low-alpha haze plus a sparse
  large-sprite bright core reads as a crash where either alone reads as fog or
  as confetti. Textured sprite alpha (`gl_PointCoord` hash) matters more than
  count. The *clock* (when, how long, how high) should come from the model.
- **Camera lag** — yes. Two time constants (position slower than target) is
  the whole recipe; a `#t=` warm-up of a few seconds before a pinned capture
  makes the lagged camera reproducible.
- **Do not borrow**: the stationary crest line, the constant `Vp`/`Tbreak`,
  the timetable sets, the drawn spline. Each is a quantity `docs/MODEL.md`
  §4.5 already assigns an owner, and each is what made the hack fail the
  moment two waves were alive at once.

## Verdict

The hack took roughly a fifth of the time budget and produces a frame that, at
the pocket, a viewer would accept as a breaking wave before they would accept
the reference — it has the sheen, the spec, the horizon, the green band. It
loses exactly where the renderer has spent its effort: the lip is a painted
roll, not a fold you can read, and there is no tube to look into. From the
cliff it is a wall. And it has no dial: not one frame changes if the swell,
tide, or spot changes, because every quantity a wave model computes is a
literal in this file. What the physics bought is not a prettier picture
today; it is a lip that is *wrong in a way that can be measured and fixed*,
and a picture that moves when the ocean does.
