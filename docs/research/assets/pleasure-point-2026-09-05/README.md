# Pleasure Point field fixture — 2026-09-05

Ten photographs from the cliff top at 38th Avenue, 11:12–11:14 PDT, with the
camera pose of each one recorded in `manifest.json`. This is the project's
first *photographic* fixture: every earlier "field" reference was a screen
recording of a web player (PLEASURE_POINT_CAPTURE_2026-08-15).

Hand-held iPhone 15 Pro, no gimbal and no tripod — so these are **stills for
visual benchmarking, not kinematic material**. Nothing here can be fed to
`scripts/measure_cam.py`; the fixed-pose video take described in
`docs/research/FIELD_CAPTURE_2026-09-05.md` §3 is a separate thing.

## What makes them a benchmark rather than an album

Each frame carries a solved-enough pose: WGS84 position, GPS altitude, true
heading from the EXIF `GPSImgDirection` tag, 35 mm-equivalent focal length and
the horizontal/vertical field of view derived from it, plus the camera's
position in the model's own **stage coordinates** and the bearing and range to
every canon spot. The stage projection is fitted by least squares to the
twelve named spots in `data/osm/pp_geometry.json` and reproduces their `x`/`y`
to 0.06 m, so `stage_x_m` / `stage_y_m` are directly comparable with
`cliffStation()` in `web-three/js/main.js`.

That is what a comparison needs: a render placed at the same point, aimed on
the same bearing, at the same field of view, under the same forcing.

Caveats on the pose. GPS horizontal error is 2.6–5.3 m on nine frames and
16.9 m on `sign-tide-pools.jpg`, which is flagged `gps_fix_rejected` and should
not be used for anything positional. Heading is the magnetometer's true-north
solution, good to a few degrees, not survey-grade. Tilt is not recorded at all.
So: good enough to place and aim a render, not good enough to rectify pixels to
metres.

### Elevation: the DEM is the value, the phone is the check

`GPSAltitude` carries `GPSAltitudeRef` 0 — above sea level — and CoreLocation
reports an orthometric altitude rather than an ellipsoidal height, so these are
roughly MSL metres and the field is named `altitude_m_gps_msl`.

Each frame also carries `ground_elev_navd88_m` / `ground_elev_msl_m`, sampled
bilinearly from `data/bathy/pp_bathy.json` at the camera's stage position. On
the nine usable frames the phone reads **+0.46 to +1.97 m above the DEM ground
surface, median +0.75, sd 0.47** — which is what a hand-held phone over a 10 m
-posted DEM that rounds off the cliff brow should do. Two instruments that share
no machinery agree at the metre level, and the essay's stated 10–12 m cliff sits
inside both.

Read that as a consistency check and nothing more. It is one device, one datum
and one afternoon, so a systematic vertical bias would be invisible here, and
repeated fixes from the same phone on the same walk do not compound into
confidence — they share the device, the route and the bias. The value a render
camera should use is the DEM's, which is what `cliffStation()` already reads;
the phone corroborates that choice rather than replacing it.

## Conditions, measured not estimated

| quantity | value |
|---|---|
| tide at 11:12 | **+0.316 m above MSL** — NOAA CO-OPS 9413450 *verified* water level |
| SC116 nowcast, 10:00 | Hs 0.902 m, Tp 16.7 s, Dp 188.5° |
| sky | sun out, scattered cirrus and small cumulus |

The predicted tide for that hour was +0.14 m; the water actually ran ~0.18 m
high, which is why the verified series is the one recorded. Either number is
far above every spot's `PEEL_FLOOR[*].tideBandM`, which tops out at 0.00–0.01 m,
so at capture time `peelFloorH0()` returned null everywhere and Hs 0.902 m
cleared `floorH0` only at Jack's and Shark's Cove. These frames are therefore
a **high-tide, small-swell** reference, and that is a regime the model's own
measured basis says it is outside of. Do not read them as the peel benchmark.

The sky matters too: `VISUAL_GROUND_TRUTH.md` was written from two
marine-layer stills and concluded the default Pleasure Point mood is DIFFUSE
with glitter as the special case. This set is the **sunny** case — hard
shadows, a real specular field on the water, blue sky with cirrus. It is the
counterpart that document asked for, not a contradiction of it.

## The frames

| file | mm (eq) | heading | what it is for |
|---|---|---|---|
| `cliff-cam-reference.jpg` | 48 | 187° | The Cliff preset's target frame: post-and-rail fence and iceplant in the near field, coyote-brush clump, full lineup, horizon. |
| `one-subject-peel.jpg` | 24 | 168° | One dominant breaking subject — the 2026-08-15 least-faithful target #1. |
| `lineup-density.jpg` | 48 | 192° | Rider scale: ~30 sitting surfers as 2–10 px marks. |
| `cliff-face-bench.jpg` | 24 | 234° | Cliff stratigraphy and the wave-cut bench. |
| `bench-pocket-tele.jpg` | 67 | 231° | The bench edge and swash boundary, close. |
| `stairs-riprap-swash.jpg` | 67 | 135° | Inshore boundary and human scale; a surfer at the head of the steps. |
| `stairs-into-whitewater.jpg` | 67 | 149° | The stair descent, landscape — riprap, algae line, kelp wrack, full-frame whitewater. |
| `up-coast-haze.jpg` | 48 | 83° | Aerial perspective over ~20 km of Monterey Bay; the haze law. |
| `sign-tide-pools.jpg` | 24 | 201° | Interpretive signage. |
| `sign-hazards.jpg` | 24 | 106° | The county hazard placard. |

## Provenance

Originals are in the local Photos library and are not committed; each frame's
`photos_uuid` in `manifest.json` is the key to re-pull it. What ships here is a
1280 px, quality-65 JPEG derivative — 1280 px because that is the width
`scripts/capture_presets.mjs` renders at, so a fixture frame and a render frame
compare at native size without either being resampled.

EXIF was read with ImageIO (`CGImageSourceCopyPropertiesAtIndex`) rather than a
third-party tool, so HEIC needed no conversion before the metadata was read.

These are the author's own photographs. The signage frames incidentally
reproduce two public placards, credited in place on the signs themselves.

## The fixture is wired to a camera

`cliff-cam-reference.jpg` is replayed by the renderer's **`#cam=lookout`**
preset (`web-three/js/main.js`, `LOOKOUT`), which reads its position, bearing,
field of view and eye height from this manifest and solves its pitch from the
photograph's horizon row. A capture at `#cam=lookout` and this photograph are
the same frame and can be laid side by side without registration. Everything
the preset needs is in `manifest.json`; nothing about it is authored.
