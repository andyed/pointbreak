# Wave scale and the cliff brow, measured against the fixture — 2026-09-05

Two measurements made possible by `#cam=lookout`, the camera that replays the
photographic fixture's pose (CONTROLS.md `cam`; pose in
`docs/research/assets/pleasure-point-2026-09-05/manifest.json`). Both are
measurements. **Nothing here is wired**, and the first one should not be wired
without a decision, because it moves every wave in the project.

## 0. The pose solution checks itself

The Lookout pose is solved, not authored: eye height from the DEM, bearing from
EXIF, field of view from the focal length, pitch from the photograph's horizon
row. Those four are over-determined, and they agree — computing the horizon row
forward from (eye 13.0 m, pitch 5.59°, vfov 31.4°, 960 px) returns **312.9**
against the **313** measured in the photograph. That is the check that licenses
everything below.

It also delivers what VALIDATION_PLAN called "the single thing standing between
px/s and m/s", without a scale reference in the water: with eye height known,
every image row below the horizon is a known depression angle and therefore a
known distance on the water plane. Read off the photograph
(`scripts` companion in the session scratchpad; the mapping is four lines of
trigonometry):

| feature in `cliff-cam-reference.jpg` | range |
|---|---|
| near shrubs and the fence | inside 50 m |
| inside whitewater field | 75–150 m |
| the sitting lineup | 150–250 m |
| the peeling wave carrying a rider | 210–280 m |
| outer line | 300–500 m |

A lineup 150–250 m off the cliff at Pleasure Point is right, which is the
sanity check on the mapping itself.

## 1. RETRACTED — the drawn wave is depth-limited; I measured the wrong surface

**Everything this section originally claimed is withdrawn.** It reported that
the drawn wave is ~5x too large and that "the surface amplitude does not respect
the depth limit its own break criterion imposes", from a table of `eta_max`
sampled with a probe I had added that same afternoon
(`__pointbreak.surfaceRay`). That probe reads **model-js `oceanH`, the CPU
twin**, not the drawn surface — and the twin is not depth-limited.

`model-js.js` computes `grow = 1 + 0.85*exp(-d/90)*reef`. That is `growSyn`
alone, the synthetic pre-bathymetry stand-in, and it amplifies `P.H0` rather
than `Heff`, so there is no sheltering either. `model-glsl.js ocean()` computes
`grow = mix(growSyn, growGeo, u_depthMix)` with
`growGeo = min(Hsh, GAMMA*dep) / Heff`. At every mapped spot `u_depthMix` is 1,
so **the shader and the twin sit at opposite ends of that mix.** Every number in
the retracted table was the uncapped synthetic path. Its two headline features
follow trivially from that and are artefacts: the gain was spot-independent
because `growSyn` never reads the bed, and `eta_max/(gamma*h)` climbed with H0
because nothing in that path is capped.

This is MEASUREMENT_LESSONS 4 exactly — an instrument that scores a replica
certifies the replica — and 2, prove the probe before trusting the measurement.
The probe was written and used inside the same hour, and its output was
plausible, which is what made it dangerous.

### What the GPU actually draws

Re-measured with `scripts/probe_wave_shape.mjs`, the repo's own instrument,
whose GPU leg is MODEL_GLSL verbatim bound to the live uniform objects (its
internal JS cross-check agrees to a median of 0.019 m, p95 0.047, over a GPU
range of −0.895 to +4.090 m). Jack's, card state H0 1.1, T 13, `depthMix` 1,
sim 42. `Hdisp` is displayed height; physical height is `Hdisp / VIS` with
`VIS = 3.2`:

| x | depth (m) | Hdisp | H_phys = Hdisp/3.2 | gamma*depth | H_phys/(gamma*h) |
|---|---|---|---|---|---|
| −74 | 6.12 | 4.00 | 1.25 | 4.77 | 0.26 |
| −74 | 2.07 | 2.18 | 0.68 | 1.61 | 0.42 |
| −74 | 1.43 | 3.73 | 1.17 | 1.12 | 1.04 |
| 9 | 2.06 | 5.35 | 1.67 | 1.61 | 1.04 |
| 9 | 1.63 | 3.08 | 0.96 | 1.27 | 0.76 |
| 92 | 2.21 | 4.94 | 1.54 | 1.72 | 0.90 |
| 92 | 1.45 | 3.07 | 0.96 | 1.13 | 0.85 |

**H_phys never exceeds ~1.05 of gamma*h.** The depth limit is applied and it
holds. There is no defect here to fix, and the "cap the crest at the
criterion's own gamma*h" change is a no-op against code that already does it.

### So why does the render look several times bigger than the photograph?

Because it is, deliberately, and the source says so. `VIS = 3.2` in
model-glsl.js: *"visual amplitude gain: physical heights are nearly invisible
at landscape scale; exaggerate, don't lie about kinematics."* Every height term
is physical up to the last multiply, which is why the break threshold comment
warns that letting VIS into the criterion made it "~3x too eager".

So the render/photograph mismatch at the Lookout pose is not a bug report. It
is the first time that authored choice has been placed beside the thing it
exaggerates, at a matched pose, with both at the same forcing. What the pair
prices is whether 3.2 is the right number — a look decision, and a defensible
one, but now a measurable one.

## 1b. Real finding: the CPU twin has drifted on the height path

Found by accident while retracting the above, and independent of it.
`model-js.js` says of itself "KEEP IN SYNC: any change to the shader model must
land here too", and `oceanH` is declared a "MODEL-TWIN of ocean()'s h path
only". It has drifted in two ways — no `growGeo` (so no depth limit) and `P.H0`
where the shader uses `Heff` (so no sheltering). At Jack's card state the twin
reaches about 5.7 m where the GPU reaches 4.09 m, roughly 1.4x.

That twin places the surfer, feeds the Follow camera and drives the audio. The
drift is already known in outline — CONTROLS.md's POV entry calls the CPU path
the "known-drift CPU surface" and POV fails closed rather than mounting it —
but the mechanism and the size do not appear to be written down anywhere, and
"opposite ends of a mix at every mapped spot" is a stronger statement than
"drift". Not fixed here.

## 2. The cliff brow is a 20° ramp, and that is why the cliff camera has no near field

`cliff-cam-reference.jpg` has iceplant and a post-and-rail fence across the
bottom quarter of frame. The render at the identical pose has water to the
bottom edge. The cause is not shading — it is the land profile.
`__pointbreak.bedRay` along the same view ray (metres about MSL, negative
distance is inland of the eye):

```
 -40 .. 0 m   12.85 -> 11.73   the terrace, flat to ~1 m over 40 m
   0 ..  2    11.73 -> 11.28   the drop begins AT the eye
   2 .. 20    11.28 ->  1.99
  20 .. 32     1.99 ->  0.01   waterline
```

So the DEM spends **32 m of horizontal run on 11.7 m of fall — a 20° slope**.
The fixture photographs show a near-vertical face with talus below it. At this
pose the frame's bottom edge first meets terrace-level ground about 3 m out;
with a real brow that ground is still terrace, and fills the bottom of frame as
it does in the photograph. With a 20° ramp it has already fallen half a metre
by 3 m and keeps falling away, so it leaves the bottom of frame and what fills
it is distant water.

This is the same interpolation deficit BATHY_SOURCES §7 documents from the
seaward side — the 2020 land lidar ends 39–114 m shoreward of every canon node
— seen from the composition side. It is *above* water, so sharpening it would
not touch the bed under the surf zone, and it is the one change that would make
items 3 and 4 of the cliffside list (riprap band, wave-cut bench) visible at
all: right now there is no near-field geometry to put them on.

## What would settle each

1. **Wave scale.** Per-spot `eta_max / H0` on each preset's own break with the
   shoaling term instrumented, against the analytic Ks for that period and
   depth. Then a decision about where the gain belongs.
2. **The brow.** An opt-in, off-by-default land-profile sharpener, measured the
   way every other flag here is, with the A/B captured from `#cam=lookout` and
   graded against the fixture frame.

## 3. `#brow` — built, measured, not promoted (2026-09-05)

`#brow=<0..1>` (CONTROLS.md) sharpens the cliff brow: a land-only monotone
remap of height-above-water inside [2 m, `#browtop`], identity in both
directions outside it, applied at the end of `bedElevM` so every consumer sees
one ground. Nothing at or below 2 m over still water moves, so no depth the
model computes can move. A JS twin in `__pointbreak.bedRay` keeps the probe
reporting the ground actually drawn — without it the probe would have quietly
certified the unsharpened profile, which it did on the first run.

Profile along the Lookout view ray at Jack's, metres about MSL:

| d (m) | 0 | 4 | 8 | 12 | 16 | 18 | 20 | 32 |
|---|---|---|---|---|---|---|---|---|
| `brow=0` | 11.73 | 10.64 | 9.54 | 7.83 | 4.86 | 3.38 | 1.99 | 0.01 |
| `brow=1` | 11.73 | 10.87 | 10.46 | 9.73 | 8.03 | 6.67 | 1.99 | 0.01 |

A uniform 20° ramp becomes a flat terrace to about 12 m, a 44–67° face to the
talus at 20 m, and the unchanged beach below. In frame, land goes from a sliver
to the bottom-left quarter (30,088 differing pixels at 0.5, 156,062 at 1) and
the mat/face/beach banding from the re-measured terrace palette becomes
readable for the first time. No faceting or stair-stepping at 1280×960.

OFF reproduces the pre-flag frame **to ≤ 1 level**: 42 px of 1,228,800 move by
one level on one channel. That is compiler scheduling around the added uniform,
not a path change — `browSharpen` early-returns — and it is the same caveat
`#lip` carries, weaker than `#birth`'s 0 differing pixels.

Not promoted. It is invented above-water geometry standing in for a surface the
1/3" grid cannot resolve, and it is a judgement call whether the repo wants
that even clearly flagged and off by default.
