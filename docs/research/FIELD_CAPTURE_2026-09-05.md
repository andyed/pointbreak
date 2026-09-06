# Field capture pre-registration — Pleasure Point, 2026-09-05

Written **before** any footage exists and before the model is run against it,
per VALIDATION_PLAN "Next run — what to change" ("Pre-register: date, hour,
tide, SC116 Hs/Tp/Dp written down before the model is run").

Rig: iPhone 16 on a DJI Osmo gimbal (DJI Mimo). First capture of this project
that is an actual camera at the break rather than a screen recording of a
surf cam (cf. PLEASURE_POINT_CAPTURE_2026-08-15, both of whose "field"
sources were recordings of a web player).

## 1. Pre-registered conditions

Fetched 2026-09-05 ~10:04 PDT, before any capture.

**Forcing — CDIP MOP SC116** (`.../MOP_alongshore/SC116_nowcast.nc`, the same
transect and endpoint `shared/cdip.js` consumes for `#day=live`):

| quantity | value |
|---|---|
| newest nowcast record | 2026-09-05 08:00 PDT |
| `waveHs` | 0.828 m (2.7 ft) |
| `waveTp` | 16.7 s |
| `waveDp` | 189° (S) |
| trend, prior 24 h | 0.71 → 0.83 m, Tp stepping 11.1 → 16.7 s |
| forecast through the day | 0.85 m at 08:00 → 0.82 at 14:00 → 0.80 at 17:00, Tp 16.7 → 15.4 s, Dp 191–193° |

**Tide — NOAA CO-OPS 9413450 (Monterey), predictions on MSL, metric.** This is
the model's own tide axis: `bed.js` TIDE_RANGE is MLLW..MHHW about MSL at
9413450, and the station's published datums (MSL 1.893, MLLW 1.031,
MHHW 2.657 m) reproduce the shipped range endpoints −0.862 / +0.764 exactly.
Quoting tide in these units removes the datum ambiguity flagged in the
2026-08-15 note.

| PDT | m about MSL |
|---|---|
| 09:00 | +0.21 |
| 11:00 | +0.14 (daylight minimum) |
| 13:00 | +0.25 |
| 14:00 | +0.40 |
| 16:00 | +0.76 |
| 18:00 | +0.89 (daylight maximum) |

Santa Cruz 9413745, on MLLW for the field log: L 3.25 ft 10:57, H 5.60 ft
17:33. 9413745 publishes no datums, so it is not used for the conversion.

## 2. What the model says about this day, stated before the footage

Both of the model's axes put today outside its own measured healthy regime,
and the tide axis does so at **every** spot.

**Tide.** `PEEL_FLOOR[*].tideBandM` — the interval in which the tide-0 peel
floor holds — tops out at 0.00 m (Sewers, Jack's, The Hook) or +0.01 m (First
Peak, Second Peak, Sharks). Today's daylight minimum is **+0.14 m**. So at no
hour of daylight today is any mapped spot inside its measured tide band, and
`peelFloorH0()` returns null everywhere. Per TIDE_FLOOR §4 the tide also
crosses the +0.33…+0.66 m (spot-dependent) level around 13:00–15:00, above
which the card state itself is off the reef; from ~16:00 the tide is at or
above MHHW (+0.764), i.e. off the top of the range the model accepts at all.

**Height.** SC116 `waveHs` feeds `setDerivedH0()` directly, so 0.84 m is
comparable to `floorH0` as-is: Sewers 1.62, First Peak 1.38, Second Peak 1.11,
The Hook 1.09, Jack's 0.78, Sharks 0.81, Privates null. Today clears the floor
at Jack's and Sharks only.

**Falsifiable consequence, checkable in the field on a phone.** Loading
`#day=live` today should raise the off-basis clamp disclosure (floor exists,
request below it, floor declined on tide-domain grounds) at Sewers, First
Peak, Second Peak and The Hook; pass through raw at Jack's and Sharks; and
show no floor at Privates.

**Therefore this is not the peel-speed day** VALIDATION_PLAN asks for ("4–5 ft
is the test of whether the model's 4.8–10 m/s zipper is anywhere near right").
It is a different and still-useful test: if the real ocean peels cleanly at
Second Peak at +0.2 m MSL and 0.84 m Hs, the measured tide band is too tight,
which points at the bed — and the bed under the break is interpolant, not
sounding (BATHY_SOURCES §7).

## 3. Capture protocol

The instrument is `scripts/measure_cam.py`, which takes fixed image-space
transects (`--band=y0,y1`, `--x=x0,x1`) and cross-correlates lag against
separation. Every requirement below follows from that.

**The frame must not move.** A gimbal is a motion device; its motors
micro-correct continuously, so "stabilised" is not "fixed". Lock mode, mini
tripod down on a solid rail or the ground, no ActiveTrack, no gesture trigger,
no re-framing mid-take, hands off once recording starts. Smooth gimbal drift
is the dangerous failure: it is invisible in playback and produces a confident
alongshore velocity that is the camera's, exactly the killer VALIDATION_PLAN
lists for edited video.

**Keep something that never moves in frame.** One corner holding cliff edge,
riprap, stairs or a rail post does three jobs at once: control points for a
water-plane homography, a per-frame reference to subtract residual gimbal
drift, and scale. A take framed on water alone cannot be drift-corrected and
cannot be converted to metres. This replaces "a scale reference in the water
plane" as the thing standing between px/s and m/s, and it is strictly better,
because land control points can be read off satellite imagery later.

**Settings.** 4K30, constant frame rate. HDR/Dolby Vision **off** (Settings →
Camera → Record Video) — a per-frame tone curve moves foam luminance, which is
the tracked signal. Exposure, white balance and focus locked before the take,
focus at infinity. Avoid Action mode (heavy crop plus per-frame warp) and
Cinematic mode. Apple's Camera app cannot disable video stabilisation; a
manual camera app that can (Blackmagic Camera is the usual choice — verify the
toggle in-app) is preferable, since with the gimbal doing the mechanical job
EIS is redundant and its warp is a per-frame geometric distortion. Fixed
shutter ~1/60 keeps motion blur constant as light changes. Main 1× lens, not
the ultrawide — its barrel distortion would need calibration before any
rectification.

**Takes.**

1. *Kinematic take* — 3 minutes minimum, unbroken, 1×, framed so the break
   line runs across the frame with real alongshore extent (a peel needs room
   to travel), land in one corner. Second Peak from the cliff. 35 s held ~3
   cycles on 2026-08-12 and resolved no repeat interval; a 16.7 s carrier
   wants >10 cycles, i.e. ≥3 min.
2. *Control-point stills* — from the identical locked pose, before or after
   the take, framing land features whose position is readable in satellite
   imagery: riprap corners, stair heads, the lookout wall end, cliff notches.
   Four or more, well spread. Note where the tripod stood precisely enough to
   find it again, and the phone's height above the ground.
3. *Appearance take* — 2× (a crop of the same optics, so distortion is lower
   than 1×, not higher), on the pocket, 30–60 s, for VISUAL_GROUND_TRUTH:
   foam aging along the broken section, thin-lip onset, the bright-flat /
   dark-face / white-foam value structure.

**Polarizer, if one is to hand.** A CPL cuts surface glare and makes the face
darkening readable, which helps tracking. Use it on take 1 and *not* on take
3: appearance ground truth should be the unfiltered view a renderer is
supposed to match.

**Field log, per take.** Clock time at start (the phone is NTP-synced, so the
file timestamp is trustworthy), spot, camera position, lens, whether the CPL
was on, and what the eye saw — in particular *does it peel, and which way*.
Sun is south-ish and high from mid-morning, so the cliff view is into the
light; that is a real trade against the afternoon, when the light improves and
the tide goes dead.

## 4. Afterward

Pull the **verified** water level (not the prediction) at 9413450 for each
take's clock hour, and the SC116 record for the same hour, before running
`measure_cam.py`. Measure privately; commit derived numbers, not frames.

Sources fetched 2026-09-05: CDIP THREDDS `SC116_nowcast.nc` /
`SC116_forecast.nc`; NOAA CO-OPS datagetter and mdapi, stations 9413450 and
9413745.

## 5. Mimo capture modes — which ones the project can use

Sorted by what they do to the time base and the frame, because that is what
decides whether a clip is an instrument input, a look reference, or a poster.

**Pano — yes, for the station, not for the wave.** The kinematic take is
framed on the break, so it holds only the few land features that fit beside
it. A 240° or 3×3 sweep from the same locked tripod position captures the
whole cliff either way along East Cliff — stairs, riprap corners, lookout
wall, house corners — which over-determines the water-plane homography
instead of scraping by on a bare four points. It is also the cheapest record
of what the Cliff camera preset *should* see: field of view, horizon height in
frame, how much cliff sits in the foreground (`measure_pov.mjs`,
`measure_cam_aim.mjs` currently have no photographic counterpart).

Two limits. The stitched output is resampled into a cylindrical/equirect
projection by an on-device stitcher, so it is a control-point *finder* and a
place record, not a measurement surface — do not solve pose on the stitch.
Check whether the build keeps the source frames; if it does, those are the
useful artifact, since each is individually rectilinear. Failing that, the
clean version of this is a **manual stepped pan**: rotate the locked gimbal in
discrete steps and shoot full-res stills, one per step, unstitched.

Never pano the ocean. A sweep across moving water assembles a single image
from many different moments; the result is geometrically and temporally
inconsistent in a way that looks plausible.

**Timelapse / hyperlapse — no for kinematics, yes for tide.** VALIDATION_PLAN
rules out sources whose time base is altered because they "produce a
clean-looking wrong answer that no pixel test can detect"; a timelapse is that
transformation applied deliberately, and a 16.7 s carrier sampled at one frame
per second or slower is aliased into noise. The legitimate use is the tide
axis, where low time resolution costs nothing: a locked-off sequence across a
tide swing records the waterline climbing the reef, and each frame is a
contour at a known elevation. Given that no public grid holds a measured
surface under the surf zone (BATHY_SOURCES §7), that is the one field method
here that could put a real contour under the break.

Today does not support it — the daylight tide minimum is +0.14 m MSL and the
reef stays covered, so the only waterline available is cliff-base swash. It
needs a daylight minus tide. The next ones deep enough to expose reef *and*
still inside the tide range the model accepts (`TIDE_RANGE` bottoms at
−0.862 m, so anything below that is unrepresentable):

| date | time PDT/PST | m MSL | ft MLLW |
|---|---|---|---|
| Sun 2026-09-27 | 17:48 | −0.72 | 0.5 |
| Mon 2026-09-28 | 18:36 | −0.81 | 0.2 |
| Sat 2026-10-10 | 17:18 | −0.79 | 0.2 |
| Sun 2026-10-11 | 18:00 | −0.84 | 0.1 |
| Fri 2026-11-06 | 14:48 | −0.77 | 0.3 |

2026-11-06 has the most daylight left after the low (sunset ≈ 17:05 PST) and
falls in the season when swell actually arrives, so it is the strongest
candidate for a combined reef-exposure and peel session.

**Slow motion — not for take 1, good for the lip.** iPhone slo-mo files carry
their true capture rate in metadata, so it is recoverable rather than
destroyed, but `measure_cam.py --fps` would be wrong by a factor of 4–8 with
nothing in the output to say so, and the storage cost makes a 3-minute take
impossible. As *appearance* reference it is worth having: lip throw, curtain
connection and aeration at 120–240 fps address exactly the target the
2026-08-15 probe named as the renderer's worst mismatch ("the lip remains
cleaner and less aerated than the footage"). Label it appearance-only and keep
it away from the kinematic instrument.

**ActiveTrack, SpinShot, DynamicZoom, story templates — social artifact only.**
All of them move the camera, which is the failure the whole protocol is built
to avoid; ActiveTrack is the worst case because tracking a rider down the line
drives the peel's apparent velocity toward zero, inverting the measurement.
(Angular peel rate is in principle recoverable from background land motion in
a panned shot, but Mimo exports no gimbal telemetry and a locked frame with
enough alongshore extent gets the same number for free — reach for a pan only
if a peel genuinely outruns the frame.) These belong to the social lane the
16 s loop occupies, not to `docs/research/`.

**The mode that matters most is not a mode: a repeatable pose.** The tide-band
question in §2 is answered by the *same frame* at different tides, which also
means the same `--band` / `--x` transects in `measure_cam.py` and a
day-to-day comparison with no re-registration. So record the station well
enough to reoccupy it: a photo of the tripod feet against a fixed landmark,
the rail post or paving joint it sits on, phone height above ground, and the
gimbal's resting pan/tilt. That is what turns a small high-tide day into the
first row of a series instead of a one-off.
