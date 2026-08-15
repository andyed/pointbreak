# Pleasure Point observation and social capture — 2026-08-15

This note records the conditions used for the 2026-08-15 Pointbreak social
capture and fixes the evidence boundary around the accompanying Pleasure Point
webcam recording. The render is a reproducible model configuration, not a
validation result.

## Observations supplied with the recording

The field reference was a screen recording titled
`Screen Recording 2026-08-15 at 7.36.25 AM.mov`. The recorded page periodically
auto-scrolled, approximately once per minute, so those interludes are not ocean
motion and must be excluded before any timing measurement.

The supplied condition snapshots were:

- nearshore report: 2 ft at observation time, forecast 4 ft at 2 pm;
- wind: NNW 1 mph;
- primary swell: SSW (198 degrees), 1.7 ft at 15 s;
- secondary swell: W (279 degrees), 2.4 ft at 8 s;
- tide: incoming, 2.4 ft;
- NDBC 46042 (36.787 N, 122.408 W), 6:40 am: significant wave height 4.6 ft,
  dominant period 17 s, mean direction SSW 208 degrees;
- the 46042 history held at 4.6 ft / 17 s for most half-hour samples from
  1:10–6:40 am, with short departures to 3.9–4.3 ft / 16–17 s.

These values are not interchangeable measurements. The 4.6 ft buoy value is
offshore significant wave height, while the nearshore 2 ft report describes
surf at the break. They are retained together as forcing and visual context,
not averaged into one wave height.

## Model mapping

The clean capture permalink is:

```text
http://localhost:8127/web-three/#preset=secondpeak&cam=cliff&day=big&h0=1.4&tide=0.732&controls=0
```

| Observation | Pointbreak setting | Boundary |
|---|---|---|
| Second Peak / Pleasure Point view | `preset=secondpeak`, `cam=cliff` | Viewpoint match, not camera calibration |
| 4.6 ft buoy significant height | `h0=1.4` m (4.59 ft) | Offshore forcing; not a claim of a 4.6 ft breaking face |
| 17 s dominant period | `day=big` gives `T=17` s | Direct carrier-period match |
| Incoming tide, 2.4 ft | `tide=0.732` m | Unit conversion; datum alignment remains approximate |
| Clean groundswell | `day=big` gives `chop=0.05`, `dF=0.004` | Authored spectral width, not measured from the recording |
| SSW 198–208 degrees | not mapped | Live incident direction is still an open model input |
| NNW/N wind | not mapped | Wind forcing is still open |

The explicit `h0` and `tide` values override those two fields from the named
`big` condition day; its 17 s period, chop, and beat spacing remain active.

## Deterministic 16-second loop

The source was rendered with `scripts/capture_temporal.mjs` from simulation
time 42 s at 30 fps, high quality, for 511 frames: one complete 17 s carrier
period plus its endpoint. The delivery file is:

```text
pointbreak-2026-08-15-loop-16s-1080-square.mp4
```

It is a silent 1080 by 1080, 30 fps, H.264/yuv420p encode at approximately
8 Mbps. A one-second wrap dissolve overlaps the end of the 17 s source with
its beginning, yielding a 16 s delivery while joining adjacent carrier phases
instead of hard-cutting the evolving foam field.

The video is a social artifact and is intentionally not committed to this
repository. The simulator URL, source clock, and encoding facts above are the
reproduction record.

## What the recording can establish about periodicity

There are two different periods in play:

1. **Carrier period:** the interval between successive wave crests. The buoy
   reports a dominant 17 s period and the render is configured to `T=17`.
2. **Set cadence:** the slower group envelope. Pointbreak currently authors
   this through `dF`; the supplied condition snapshots do not measure it.

The screen recording can independently test carrier periodicity only after the
original file is available for frame measurement. Use a fixed image-space
transect, timestamp at least four comparable crest passages, and report the
individual intervals plus median and spread. Treat each auto-scroll-free span
as a separate segment; never close an interval across an auto-scroll or stitch
gap. The recording can test set cadence only if its uninterrupted ocean spans
cover multiple complete groups, which a roughly one-minute page cycle is
unlikely to provide.

Until that pass is run, the precise claim is: **the model was configured to the
reported 17 s buoy period; the field video comparison remains unmeasured.**

## Social copy

> Pleasure Point, reconstructed from this morning's conditions: 4.6 ft at 17
> seconds, SSW swell, incoming tide.
>
> A 16-second loop from Pointbreak, our open-source, still-unvalidated ocean
> model. Field comparison is underway.
>
> https://github.com/andyed/pointbreak
