# Sentinel-2 whitewater locus vs the model's break line — 2026-09-23

VALIDATION_PLAN source rank 3, run. Four cloud-free Sentinel-2 L2A frames
over Pleasure Point on SC116 days of 1.32–1.50 m at −0.30…+0.47 m tide give a
georeferenced foam edge along all seven mapped spots at 10 m/px, and against
it the shipped bed is contradicted in 4 of 28 spot-frames where the plane
baseline is contradicted in 12 and the measured-only bed in 10: from Sewer
Peak to Second Peak, foam is routinely 45–185 m seaward of the plane and
measured lines and mostly inside the reef line's reach. Down-point the
picture inverts — no frame shows foam out at the reef arm's line (seaward of
the foam edge in 13 of 16 cells at 38th through Private's, by 40–155 m in
10 of them) while the plane line sits within ±20 m of the foam edge in 8 of
those 16 — so on these frames
the fitted reef is doing work at the apex and is unsupported below 38th. A
single frame bounds the locus from the shore side only (foam means something
broke at or seaward of it; no foam proves nothing), so this is a
falsification instrument, not a fit: it retires the plane at the apex and it
cannot yet decide the down-point reef.

Everything here is "on the NCEI 2012 interpolant" (VALIDATION_PLAN,
2026-09-01 addendum). Files: `assets/sentinel2-locus-2026-09-23/`
(`forcing.json`, `loci.json`, `model_lines.json`, `residuals.json`,
`residuals.md`, four overlays); instruments
`scripts/measure_sentinel2_locus.py` and `scripts/compare_sentinel2_line.mjs`;
raw windows and every intermediate table under ignored `qa/sentinel2-locus/`.

## 1. What the pixel buys, and what it cannot

The three bed arms the app ships (`#bed=reef|plane|measured`) place the break
line 40–180 m apart at most spots for these forcings — 4 to 18 pixels. A
10 m pixel plus Sentinel-2's absolute geolocation (≤ 10.6 m at 95.5 % with the
global reference image, ESA data-quality reports) is taken as **σ = 8 m** per
edge (`PIXEL_REG_SIGMA_M`: half-pixel quantisation 5 m and ~5 m registration
in quadrature, rounded up). So the pixel resolves *which arm* the foam edge
is nearer, and any offset above 2σ = 16 m. It cannot resolve:

* **which wave broke.** The foam in a frame is the trace of the last few
  breakers; the largest set wave breaks seaward of the Hs locus by
  construction. The `H0 = H1/10` arm (1.27 Hs) is carried to bound this, and
  the verdict rule below uses it.
* **instant vs mean.** One frame is one instant of a 2–3 minute set cycle
  (MEASUREMENT_LESSONS 1, 15). A lull shows less foam, never more; the
  2023-11-25 frame (Tp 20 s) is a lull and reads as such.
* **anything kinematic.** No peel direction, no zipper speed. Geometry only,
  as the plan said.
* **offsets under ~16 m**, and the ~4–20 m the stage frame itself can carry
  (OSM node origin; the 2026-09-05 projection's 0.06 m residual is not the
  binding term, the node position is).

## 2. Data access — what worked

All anonymous, no account, verified 2026-09-23:

| source | endpoint | how it was read |
|---|---|---|
| Sentinel-2 L2A | Microsoft Planetary Computer STAC `https://planetarycomputer.microsoft.com/api/stac/v1`, collection `sentinel-2-l2a` | `pystac-client` search on a point + datetime range; assets signed with `planetary_computer.sign_inplace`; `rasterio` windowed reads of B02/B03/B04/B08 (10 m) and SCL (20 m, nearest-upsampled) from the COGs — no whole-tile download. `python3 -m pip install --user --break-system-packages pystac-client planetary-computer rasterio requests` installed cleanly on Homebrew 3.14 (rasterio 1.5.1 wheel bundles GDAL). The STAC `query` extension is not advertised (`DoesNotConformTo: QUERY`) but `eo:cloud_cover` filters are honoured; the table below was built without one anyway. |
| SC116 forcing | CDIP THREDDS `.../MOP_alongshore/SC116_hindcast.nc` | `.dds` for length, `.ascii?waveTime[lo:1:hi],waveHs[...],waveTp[...],waveDp[...],waveFlagPrimary[...]` in 20 000-record chunks from 2017-01-01 (index from `waveTime[0]`), the grammar of `data/climatology/build_cdip_climatology.py`. 72 290 hourly records, 1483221600…1743462000. |
| tide | NOAA CO-OPS `api/prod/datagetter`, station 9413450, `product=water_level&datum=MSL&units=metric&time_zone=gmt` | 6-min verified series ±30 min around each acquisition, linearly interpolated to the acquisition second. |
| wind (whitecap falsifier) | NDBC 46042 annual stdmet via `view_text_file.php`; Watsonville ASOS (KWVI) via the Iowa Mesonet ASOS archive | 46042 is offline from 2023-11-25 03:50 UTC through at least February 2024 (the 2024 files return "Unable to access data file"), so KWVI carries all five dates; IEM rate-limits rapid calls — one range request instead of five. |

Tile choice: the point sits in the overlap of T10SEG and T10SEF, but 10SEG's
data footprint ends at 36.9515 N and truncates the seaward 350 m of the
window; **10SEF holds the whole window** and is used throughout. Reprocessed
duplicates of the same datatake (two items per tile on some dates) are
listed as they come.

Sentinel-2 L2A reflectance = (DN − 1000)/10 000 for processing baseline ≥ 04.00
(all four main scenes are 05.09/05.10; the 2021 scene is 02.12, no offset).

## 3. Candidate table — every swell-qualified acquisition, 2017-01 … 2025-03

569 acquisitions over the point; 29 with SC116 Hs ≥ 1.2 m, Tp ≥ 12 s and a
good primary flag at the record nearest the acquisition (always the following
:00 hour, 99–509 s later). Selection rules, stated before the frames were
looked at: tide ≤ +0.5 m MSL ("low-to-mid"), and SCL cloud/shadow/cirrus over
the **surf strip** — the station scan lines the measurement uses, not the
whole 2.2 × 1.8 km window — ≤ 5 %. Local time is PST except September (PDT).
"SCL-11 px" counts pixels the scene classifier calls snow; over this reef
that is dense foam, a free foam indicator.

| acquisition (UTC) | local | SC116 Hs m | Tp s | Dp ° | tide m MSL | tiles (scene cloud) | surf-strip cloud (10SEF) | SCL-11 px | outcome |
|---|---|---|---|---|---|---|---|---|---|
| 2024-12-24 18:57 | 10:57 | 2.38 | 18.2 | 190 | −0.28 | 10SEG 59%, 10SEF 35% | 100% | 0 | cloud |
| 2023-01-14 18:57 | 10:57 | 2.32 | 15.4 | 207 | +0.05 | 10SEG 100%, 10SEF 100% | 100% | 0 | cloud |
| 2023-12-30 18:58 | 10:58 | 2.29 | 16.7 | 203 | +0.90 | 10SEG 44%, 10SEF 26% | 100% | 0 | cloud; tide |
| 2023-01-09 18:57 | 10:57 | 2.19 | 14.3 | 210 | +1.00 | 10SEG 100%, 10SEF 100% | 100% | 0 | cloud; tide |
| 2024-02-18 18:54 | 10:54 | 1.83 | 16.7 | 202 | −0.43 | 10SEG 27%, 10SEF 60% | **10%** | 113 | cloud (supplementary, §5) |
| 2023-01-04 18:57 | 10:57 | 1.80 | 15.4 | 203 | +0.53 | 10SEG 100%, 10SEF 100% | 100% | 0 | cloud; tide |
| 2022-03-15 18:51 | 11:51 | 1.76 | 18.2 | 194 | +0.14 | 10SEG 100%, 10SEF 100% | 100% | 0 | cloud |
| **2023-09-26 18:51** | 11:51 | 1.50 | 15.4 | 208 | +0.22 | 10SEG 36%, 10SEF 49% | 0% | 351 | **used** |
| 2020-01-25 18:56 | 10:56 | 1.47 | 15.4 | 206 | +0.93 | 10SEG 67%, 10SEF 51% | 99% | 51 | cloud; tide |
| 2020-12-30 18:58 | 10:58 | 1.44 | 20.0 | 189 | +0.79 | 10SEG 25%, 10SEF 64% | 100% | 0 | cloud; tide |
| 2018-01-15 19:03 | 11:03 | 1.41 | 18.2 | 194 | +0.53 | 10SEG 78%, 10SEF 77% | 44% | 50 | cloud; tide |
| **2023-11-25 18:57** | 10:57 | 1.41 | 20.0 | 185 | +0.47 | 10SEG 0%, 10SEF 0% | 0% | 34 | **used** |
| **2024-01-04 18:58** | 10:58 | 1.37 | 14.3 | 210 | −0.26 | 10SEG 11%, 10SEF 13% | 0% | 407 | **used** |
| 2019-01-10 18:57 | 10:57 | 1.36 | 13.3 | 210 | +0.59 | 10SEG 40%, 10SEF 66% | 5% | 161 | tide |
| 2019-01-15 18:57 | 10:57 | 1.35 | 15.4 | 206 | −0.07 | 10SEG 99%, 10SEF 100% | 100% | 0 | cloud |
| 2022-01-04 18:58 | 10:58 | 1.34 | 15.4 | 208 | +1.14 | 10SEG 75%, 10SEF 48% | 100% | 0 | cloud; tide |
| 2021-01-04 18:57 | 10:57 | 1.32 | 20.0 | 192 | +0.27 | 10SEG 77%, 10SEF 99% | 100% | 0 | cloud |
| **2021-01-09 18:57** | 10:57 | 1.32 | 15.4 | 207 | −0.30 | 10SEG 3%, 10SEF 4% | 2% | 94 | **used** |
| 2021-01-29 18:56 | 10:56 | 1.29 | 14.3 | 197 | +1.05 | 10SEG 11%, 10SEF 4% | 1% | 78 | tide |
| 2023-03-05 18:52 | 10:52 | 1.29 | 14.3 | 207 | +0.44 | 10SEG 29%, 10SEF 55% | 0% | 66 | usable, cut by the 4-scene cap |
| 2023-12-25 18:58 | 10:58 | 1.27 | 20.0 | 186 | +0.61 | 10SEG 99%, 10SEF 96% | 100% | 0 | cloud; tide |
| 2023-11-15 18:56 | 10:56 | 1.27 | 13.3 | 205 | +1.21 | 10SEG 89%, 10SEF 63% | 100% | 0 | cloud; tide |
| 2025-03-31 18:58 | 11:58 | 1.26 | 14.3 | 188 | +0.33 | 10SEG 37%, 10SEF 39% | 100% | 0 | cloud |
| 2024-12-29 18:58 | 10:58 | 1.23 | 18.2 | 193 | +0.52 | 10SEG 48%, 10SEF 76% | 100% | 0 | cloud; tide |
| 2022-06-03 18:49 | 11:49 | 1.23 | 18.2 | 193 | −0.35 | 10SEG 79%, 10SEF 77% | 3% | 0 | usable, cut by the 4-scene cap |
| 2018-12-01 18:57 | 10:57 | 1.22 | 12.3 | 210 | −0.15 | 10SEG 30%, 10SEF 54% | 90% | 0 | cloud |
| 2024-12-19 18:58 | 10:58 | 1.21 | 20.0 | 185 | +0.67 | 10SEG 5%, 10SEF 0% | 0% | 248 | tide |
| 2024-11-14 18:55 | 10:55 | 1.21 | 20.0 | 186 | +0.40 | 10SEG 49%, 10SEF 34% | 100% | 0 | cloud |
| 2024-02-03 18:56 | 10:56 | 1.20 | 14.3 | 203 | −0.33 | 10SEG 98%, 10SEF 100% | 100% | 0 | cloud |

Two nulls worth naming (LESSONS 3). Every ≥ 1.8 m day in eight years is
under cloud at 11 am — big swell comes with the front that brings it — so the
frames this instrument can ever see are 1.2–1.5 m days, which at this reef
means the peel floor's neighbourhood (`PEEL_FLOOR` floorH0 0.62–1.24 m), not
the card states. And scene-level `eo:cloud_cover` is useless here: the
2023-09-26 frame is 36–49 % cloudy as a tile and 0 % over the surf strip.

## 4. Per-scene forcing, tide, hashes

The model was run at T = SC116 Tp (band-quantised, PP_CDIP_CLIMATOLOGY), the
CO-OPS tide, and three H0 arms: `hs` (Hs as MOP reports it on the 10–15 m
contour), `deshoaled` = Hs / Ks(12 m, T) with the model's own Green's-law Ks
from `dispersion.js` (the arm the verdicts use — the model's H0 is a
deep-water height and re-shoals to Hs at 12 m), and `h10` = 1.27 Hs. All
inside the `h0` control's 0.4–3.0 m and the tide axis [−0.862, 0.764]; no
clamp fired. Solar geometry computed from the acquisition time (not in the
STAC item). Wind at the nearest KWVI hourly observation (18:53 UTC);
46042 where it was reporting.

| scene | local time | SC116 Hs / Tp / Dp | tide m MSL | Ks(12 m) | H0 hs / deshoaled / h10 (m) | sun el. / az. | wind | 46042 offshore |
|---|---|---|---|---|---|---|---|---|
| S2A_MSIL2A_20230926T185131_R113_T10SEF_20230927T023437 | 2023-09-26 11:51:31 PDT | 1.505 / 15.38 / 208.0 | +0.221 | 1.103 | 1.505 / 1.365 / 1.911 | 48.6° / 154° | KWVI 4 kt @ 160° | N 4.6–4.9 m/s, gust 6.4–7.6; WVHT 4.8 m @ 14.8 s from 290–294° |
| S2A_MSIL2A_20231125T185721_R113_T10SEF_20241111T023436 | 2023-11-25 10:57:21 PST | 1.411 / 20.00 / 184.8 | +0.472 | 1.233 | 1.411 / 1.145 / 1.792 | 30.7° / 164° | KWVI 7 kt @ 90° | offline (last record 03:50 UTC that day) |
| S2A_MSIL2A_20240104T185801_R113_T10SEF_20240104T231055 | 2024-01-04 10:58:01 PST | 1.374 / 14.29 / 209.5 | −0.264 | 1.072 | 1.374 / 1.282 / 1.745 | 27.8° / 161° | KWVI 3 kt @ 110° | offline |
| S2A_MSIL2A_20210109T185751_R113_T10SEF_20210110T053434 | 2021-01-09 10:57:51 PST | 1.321 / 15.38 / 206.6 | −0.300 | 1.103 | 1.321 / 1.198 / 1.678 | 28.3° / 160° | KWVI 6 kt @ 110° | E 0.2–0.8 m/s; WVHT 4.1 m @ 14.8 s from 282° |
| S2B_MSIL2A_20240218T185439_R113_T10SEF_20240218T223624 (supp.) | 2024-02-18 10:54:39 PST | 1.835 / 16.67 / 202.0 | −0.428 | 1.140 | 1.835 / 1.610 / 2.330 | 37.3° / 153° | KWVI 9 kt @ 120° | offline |

Raster windows (`qa/sentinel2-locus/<item>/window.tif`, 180 × 225 px at 10 m,
bands B02 B03 B04 B08 SCL, EPSG:32610, deflate; regenerated bit-identically by
`extract`), SHA-256:

* 2023-09-26 `a63dfbc70b3e9766e95471bf4d09d4478d9a9c73ceaf6871ec4a3ccf8b75d4a0`
* 2023-11-25 `26416d901090542adb2985ebb28fba6b9ff44bcad32109d41e81c310fde56c85`
* 2024-01-04 `25f5106e0d77186e7755d0bf515d7df7a65eb6a219fdfe3a3f88e7ea53f10c5d`
* 2021-01-09 `77dc0952a1b982f2b646da37649f4d541ea4a7b52b6b982619dfe9758120a9e6`
* 2024-02-18 `ac66fbeab61251e4ad85fd932bd6a71518da29c2570d509169d969edec3a4856`

COG URLs, STAC item links, tide URLs and the SC116 record times are in
`forcing.json`.

## 5. The mask — calibrated, and what it caught

The first mask was wrong and the picture said so (memory: visual work needs
an eye). A red-band threshold with an NDWI > 0 gate lit the whole shallow
bench and the continuous swash band from Sewers to Private's and put the
"outer edge" on the *inner* foam band — exactly the reform-line failure the
plan warned about. Its outer edge is kept in the tables as the **dense band**
column so the size of that mistake is visible: 0–350 m shoreward of the foam
edge.

The shipped mask (`whitewater_masks()`):

* **foam** = NIR (B08) above the scene's own clear-water median + K × MAD
  (K = 6; 4 and 9 carried as the threshold band), SCL ∈ {6 water, 11 "snow"},
  NDWI > −0.05, and a **whiteness** gate: blue excess over water ≥ half the
  NIR excess. Clear water is nearly black in NIR (median 0.001–0.005, MAD
  0.001–0.004 on the four scenes), so sparse outer-reef streaks clear the bar
  where bright shallow sand (red-bright, NIR-dark) does not.
* The whiteness gate exists because the NIR-only version read **kelp**. On
  2023-11-25, with the lowest threshold of the set (0.009), components 300–500
  m SW of Sewer Peak at B02 0.009 vs water 0.023, B08 0.011 — blue-dark,
  NIR-bright — pulled Sewers' seaward envelope to −429 m. Foam is white: on
  the 2023-09-26 outer streaks the blue excess is 0.022 against a NIR excess
  of 0.030 (a ~10 % foam-fraction mixed pixel). The gate removes the kelp
  and keeps the streaks.
* components < 3 px dropped; a station's edge needs a ≥ 10 m run along the
  scan (one pixel).

Per-scene calibration (foam threshold at K = 6, mask pixels K = 4/6/9, dense
band pixels): 2023-09-26 0.029, 3446/2835/2371, 2089 · 2023-11-25 0.009,
1490/1261/1078, 1097 · 2024-01-04 0.018, 2967/2768/2579, 2288 · 2021-01-09
0.016, 3032/2761/2491, 2924 · **2024-02-18 0.176**, 1119/668/380, 1066.

That last number is the supplementary scene's own verdict on itself: its
water NIR MAD is eight times the clear scenes' — haze, the 10 % cloud the
strip rule rejected it for. Only 4–16 of 23–31 stations find foam at all and
the edges scatter (§6). It was measured because it is the biggest usable
swell in eight years; **no residual is read from it.**

Stations: every 10 m of stage x inside each spot's `stageBoundsM` ± 10 m
(11–31 per spot), scanned along the shore normal from z = −450 to +150 m at
2 m in the spot's own stage frame (`pp_geo_profiles.js` origin/along/shore;
+z shoreward). Per station: seaward-most foam edge at each K; the dense-band
edge; cloud fraction. Per spot: median and q10 (seaward envelope) of the
station edges.

## 6. Residuals

Offset = z_model − z_obs along the shore normal, stage metres. **Positive =
the model line sits shoreward of the observed foam edge.** z_model is the
`breakZAt` readback of `bakeBreakLine` on the same stations, per bed arm and
H0 arm. "foam edge" is the K = 6 median across stations, with q10 (seaward
envelope) and the dense band beside it. Each cell: offset of the deshoaled
line, [q25, q75] across stations, then the offset for H0 = Hs and for
H0 = H1/10. The K = 4…9 threshold band moves any cell by 4–15 m and never
changes a verdict (full table: `assets/…/residuals.md`).

**Verdict rule**, fixed before the numbers were read: an arm is
**contradicted (X)** when its H1/10 line is still more than 2σ = 16 m
shoreward of the median foam edge — foam is typical where the model says even
a 1-in-10 wave is unbroken. Otherwise *consistent*, which is not
confirmation. Among consistent arms, *closest* is the deshoaled line nearest
the foam edge when it leads the next arm by ≥ 16 m. The q10 envelope is a
bound and is never scored.

| scene | spot (stations with foam) | foam edge med / q10 / dense (m) | reef | plane | measured |
|---|---|---|---|---|---|
| 2023-09-26 | Sewer Peak (26/26) | −87 / −144 / −82 | +88 [+76,+95] · Hs +72 · H1/10 −61 | +152 [+104,+160] · Hs +137 · H1/10 +93 **X** | +88 [+76,+95] · Hs +72 · H1/10 +30 **X** |
| 2023-09-26 | First Peak (11/11) | −68 / −72 / −60 | +47 [+13,+68] · Hs +12 · H1/10 −35 | +107 [+104,+109] · Hs +93 · H1/10 +54 **X** | +70 [+65,+72] · Hs +58 · H1/10 +26 **X** |
| 2023-09-26 | Second Peak (19/19) | −96 / −106 / −87 | +62 [+25,+70] · Hs +45 · H1/10 +10 | +85 [+82,+90] · Hs +73 · H1/10 +39 **X** | +79 [+75,+85] · Hs +66 · H1/10 +33 **X** |
| 2023-09-26 | 38th (31/31) | −210 / −312 / +70 | +151 [−10,+189] · Hs +145 · H1/10 +130 **X** | +174 [+71,+268] · Hs +163 · H1/10 +130 **X** | +178 [+67,+264] · Hs +167 · H1/10 +138 **X** |
| 2023-09-26 | The Hook (29/29) | −316 / −434 / +38 | +259 [−23,+277] · Hs +250 · H1/10 +224 **X** | +297 [+11,+399] · Hs +284 · H1/10 +249 **X** | +278 [−20,+364] · Hs +266 · H1/10 +231 **X** |
| 2023-09-26 | Shark's Cove (30/30) | −70 / −404 / −25 | +17 [−28,+249] · Hs +4 · H1/10 −28 | +32 [+3,+284] · Hs +20 · H1/10 −14 | +17 [−19,+263] · Hs +4 · H1/10 −28 |
| 2023-09-26 | Private's (23/23) | −68 / −89 / −58 | −44 [−50,−33] · Hs −55 · H1/10 −86 | +4 [−2,+13] · Hs −10 · H1/10 −50 | −39 [−49,−31] · Hs −52 · H1/10 −86 |
| 2023-11-25 | Sewer Peak (26/26) | −33 / −82 / +30 | +54 [+41,+81] · Hs +21 · H1/10 −107 | +126 [+110,+136] · Hs +93 · H1/10 +48 **X** | +54 [+41,+81] · Hs +21 · H1/10 −25 |
| 2023-11-25 | First Peak (11/11) | +16 / +6 / +16 | +6 [+1,+11] · Hs −72 · H1/10 −112 | +45 [+42,+48] · Hs +15 · H1/10 −25 | +6 [+1,+11] · Hs −19 · H1/10 −52 |
| 2023-11-25 | Second Peak (17/19) | +12 / −7 / +17 | −47 [−83,+1] · Hs −93 · H1/10 −124 | −3 [−81,+12] · Hs −29 · H1/10 −65 | −6 [−83,+6] · Hs −34 · H1/10 −70 |
| 2023-11-25 | 38th (31/31) | +48 / +20 / +52 | −117 [−133,−85] · Hs −136 · H1/10 −157 | −64 [−83,−47] · Hs −90 · H1/10 −125 | −64 [−83,−46] · Hs −90 · H1/10 −119 |
| 2023-11-25 | The Hook (23/29) | +24 / −19 / +40 | −74 [−136,−26] · Hs −100 · H1/10 −122 | −19 [−40,+7] · Hs −44 · H1/10 −79 | −53 [−64,−24] · Hs −79 · H1/10 −112 |
| 2023-11-25 | Shark's Cove (30/30) | +10 / −18 / +24 | −100 [−120,−83] · Hs −128 · H1/10 −143 | −22 [−89,+7] · Hs −49 · H1/10 −85 | −42 [−104,−23] · Hs −69 · H1/10 −100 |
| 2023-11-25 | Private's (22/23) | +55 / −22 / +64 | −150 [−164,−69] · Hs −172 · H1/10 −205 | −93 [−111,−10] · Hs −124 · H1/10 −166 | −138 [−143,−67] · Hs −170 · H1/10 −205 |
| 2024-01-04 | Sewer Peak (26/26) | −59 / −104 / −33 | +46 [+27,+70] · Hs +37 · H1/10 −64 | +87 [+51,+145] · Hs +77 · H1/10 +38 **X** | +46 [+27,+70] · Hs +37 · H1/10 +3 |
| 2024-01-04 | First Peak (11/11) | −120 / −130 / −110 | +55 [+33,+94] · Hs +45 · H1/10 +21 **X** | +144 [+139,+148] · Hs +135 · H1/10 +100 **X** | +108 [+104,+116] · Hs +101 · H1/10 +73 **X** |
| 2024-01-04 | Second Peak (19/19) | −110 / −124 / −90 | +43 [+27,+61] · Hs +37 · H1/10 +16 | +84 [+67,+94] · Hs +76 · H1/10 +45 **X** | +78 [+62,+87] · Hs +71 · H1/10 +41 **X** |
| 2024-01-04 | 38th (31/31) | −70 / −96 / −56 | −18 [−52,−4] · Hs −27 · H1/10 −43 | +19 [−11,+28] · Hs +12 · H1/10 −19 | +19 [−0,+26] · Hs +12 · H1/10 −16 |
| 2024-01-04 | The Hook (29/29) | −24 / −44 / −10 | −95 [−117,−58] · Hs −104 · H1/10 −135 | −5 [−45,+15] · Hs −13 · H1/10 −43 | −38 [−71,−18] · Hs −46 · H1/10 −74 |
| 2024-01-04 | Shark's Cove (21/30) | −40 / −48 / −32 | −65 [−88,−61] · Hs −78 · H1/10 −100 | −3 [−10,+0] · Hs −12 · H1/10 −45 | −28 [−33,−25] · Hs −35 · H1/10 −62 |
| 2024-01-04 | Private's (6/23) | +37 / −22 / −15 | −155 [−202,−98] · Hs −161 · H1/10 −186 | −100 [−165,−44] · Hs −110 · H1/10 −145 | −155 [−198,−98] · Hs −161 · H1/10 −186 |
| 2021-01-09 | Sewer Peak (26/26) | −103 / −149 / −115 | +81 [+55,+99] · Hs +67 · H1/10 −45 | +144 [+77,+177] · Hs +130 · H1/10 +91 **X** | +81 [+55,+99] · Hs +67 · H1/10 +28 **X** |
| 2021-01-09 | First Peak (11/11) | −160 / −164 / −156 | +87 [+70,+122] · Hs +76 · H1/10 +47 **X** | +184 [+173,+187] · Hs +172 · H1/10 +137 **X** | +149 [+142,+150] · Hs +139 · H1/10 +111 **X** |
| 2021-01-09 | Second Peak (19/19) | −116 / −139 / −116 | +44 [+16,+53] · Hs +33 · H1/10 +12 | +91 [+61,+104] · Hs +80 · H1/10 +50 **X** | +85 [+56,+97] · Hs +74 · H1/10 +45 **X** |
| 2021-01-09 | 38th (31/31) | −46 / −64 / −64 | −29 [−75,−7] · Hs −34 · H1/10 −48 | −1 [−17,+8] · Hs −11 · H1/10 −40 | +4 [−8,+10] · Hs −6 · H1/10 −30 |
| 2021-01-09 | The Hook (29/29) | −62 / −82 / −62 | −39 [−71,−16] · Hs −50 · H1/10 −70 | +39 [−8,+50] · Hs +29 · H1/10 +1 | +7 [−23,+16] · Hs −3 · H1/10 −30 |
| 2021-01-09 | Shark's Cove (30/30) | −50 / −70 / −55 | −48 [−69,−40] · Hs −56 · H1/10 −78 | +6 [−16,+20] · Hs −5 · H1/10 −37 | −14 [−36,−3] · Hs −23 · H1/10 −49 |
| 2021-01-09 | Private's (21/23) | −72 / −100 / −72 | −54 [−61,−31] · Hs −63 · H1/10 −88 | −5 [−9,+2] · Hs −18 · H1/10 −54 | −50 [−61,−28] · Hs −62 · H1/10 −88 |
| 2024-02-18 supp. (hazy, unscored) | Sewer Peak (25/26) | +38 / −74 / −17 | −164 [−240,−96] | −58 [−103,+15] | −123 [−142,−21] |
| 2024-02-18 supp. | First Peak (9/11) | −6 / −105 / −98 | −86 [−92,−72] | −27 [−40,−8] | −46 [−68,−29] |
| 2024-02-18 supp. | Second Peak (9/19) | −80 / −101 / −84 | −40 [−48,−33] | +7 [−26,+15] | +2 [−30,+10] |
| 2024-02-18 supp. | 38th (9/31) | −96 / −107 / −74 | −65 [−80,−51] | −12 [−19,+1] | −14 [−22,+1] |
| 2024-02-18 supp. | The Hook (4/29) | +44 / +14 / −58 | −134 [−150,−117] | −119 [−150,−86] | −134 [−150,−117] |
| 2024-02-18 supp. | Shark's Cove (8/30) | −1 / −57 / −33 | −108 [−114,−84] | −96 [−99,−62] | −108 [−110,−78] |
| 2024-02-18 supp. | Private's (16/23) | −65 / −95 / −66 | −94 [−101,−75] | −62 [−78,−42] | −94 [−101,−75] |

Score over the 28 main cells (4 scenes × 7 spots), `residuals.json.summary`:

| arm | contradicted | consistent | closest |
|---|---|---|---|
| reef (shipped) | **4** | 24 | 6 |
| plane | **12** | 16 | 8 |
| measured only | **10** | 18 | 1 |

De-shoaling matters at the pixel scale: Hs → Hs/Ks lowers H0 by 6–19 % and
moves every line 10–75 m shoreward (compare the deshoaled cell with its
"Hs" value), so the raw-Hs arm reads 1–7 px more favourably for every bed.
The deshoaled arm is the one the model's H0 means; the verdicts use H1/10
and are unchanged either way.

## 7. Reading it

**Apex (Sewer Peak, First Peak, Second Peak).** On the three frames with
real foam, the foam edge sits 60–160 m seaward of the OSM node, and the
plane line is 84–184 m shoreward of it (38–137 m even at H1/10) —
contradicted 9 times in 9 apex cells outside the lull, and once more at
Sewers on the lull day. Measured-only fails the same test 8 times: without
the synthetic reef the 2012 interpolant is too deep at the apex to break a
1.3–1.5 m swell where the foam says it breaks. The reef arm is contradicted
twice, both at First Peak (2024-01-04 +21 m and 2021-01-09 +47 m at H1/10,
foam 120–160 m out), and stays within reach — H1/10 line seaward of the foam
at Sewers on every frame, within 2σ of it at Second Peak (+10 to +16 m). That
is the plan's "reef is doing real work" reading, for the locus only, at
three spots, on the shipped interpolant.

**Down-point (38th, The Hook, Shark's Cove, Private's).** The reef arm's
line is seaward of the foam edge in 13 of 16 cells, by 40–155 m in 10 of
them, and no frame shows foam out there; the plane line is within ±20 m of
the foam edge in 8 of the 16, which is why "closest" goes 8–6 to the plane
overall. The frame
cannot distinguish "the reef line is wrong" from "the set that would have
reached it had not arrived", so this is not a contradiction. It is, across
four independent frames at two tides, a consistent absence, and the
plan's "everything wrong at one spot only → suspect that spot's reef fit"
now reads as "everything unsupported below 38th → the reef fits from
Jack's down are the ones to doubt first" — consistent with
CUDEM_BED_2026-09-01's finding that the two interpolants disagree most
there.

**2023-09-26, 38th and The Hook.** Foam 200–430 m out at 29–31 of 31
stations, every arm contradicted by 130–250 m. 46042 was reading a 4.8 m,
14.8 s WNW swell that morning; MOP transforms it to 1.5 m at SC116. Either
the largest wrapped waves were breaking on the outer shelf at 5–6 m depth
(H1/10 of 1.9 m does not get the model there; Hmax ≈ 2 Hs might), or MOP's
1.5 m is low for that wrap, or the patches are not breaking waves (§8).
Left as the open item; it is the one cell family where H0 is the suspect
rather than the bed.

**2023-11-25** is a lull in a 20 s swell: a thin band hugging the shore,
foam edge shoreward of the node at every down-point spot. It contradicts
only the plane at Sewers and says nothing else. Kept because a lull frame is
a result and because it is where the kelp was found.

**The three-way comparison the plan asked for**: model closer than both
baselines on locus at the apex, yes; down-point, not shown. Peel direction
was never on this instrument's menu.

## 8. What would falsify this

* **Whitecaps.** Foam that is not breaking. Excluded for these frames: wind
  3–9 kt (1.5–4.6 m/s) from 90–160° at KWVI at the acquisition hour on all
  five dates, calm at 46042 on 2021-01-09 and N 4.6–4.9 m/s (offshore at the
  point) on 2023-09-26. Below whitecap onset everywhere.
* **Kelp.** Caught once, removed by the whiteness gate (§5). A canopy
  patch that is also foam-covered would pass; none of the outer components
  on the four frames is blue-dark.
* **Sun glint.** Specular, spectrally flat, passes the whiteness gate. Sun
  elevation is 28–31° on three frames (glint on a near-nadir view needs a
  ~30° face slope — breaking faces only) and 48.6° on 2023-09-26, where a
  ~21° slope suffices. Glint would show as crest-parallel streaks across the
  whole field rather than localised patches; the 2023-09-26 outer patches are
  localised, but this is the frame where glint on steep unbroken faces cannot
  be ruled out from the spectrum alone, and it is the frame with the anomaly.
* **Reform line mistaken for the outer break.** Was the first result; the
  dense-band column shows it sits 0–350 m shoreward of the foam edge. Any
  future mask that puts the edge at the dense band's outer edge has repeated
  it.
* **MOP Hs is a model.** A 20 % Hs error moves the lines by roughly what
  the Hs → Hs/Ks column shows (10–75 m). The apex verdicts survive a 20 %
  shift; the 2023-09-26 down-point anomaly may not.
* **Frame = instant.** More frames on the same day cannot exist; more days
  can. Two more usable acquisitions (2023-03-05, 2022-06-03) are sitting in
  the table and would test whether the down-point absence persists.
* **Tide.** Monterey harbour verified level applied at the point; the
  2026-09-05 capture found observed running 0.18 m above predicted, which is
  why verified rather than predicted is used. A 0.1 m tide error is ~7 m of
  line on a 1:70 slope, under σ.

## 9. Reproduction

```
python3 -m pip install --user --break-system-packages pystac-client planetary-computer rasterio requests
python3 scripts/measure_sentinel2_locus.py candidates      # ~10 min: STAC + SC116 + CO-OPS + SCL windows -> qa/sentinel2-locus/candidates.json
python3 scripts/measure_sentinel2_locus.py extract \
  --scenes S2A_MSIL2A_20230926T185131_R113_T10SEF_20230927T023437,S2A_MSIL2A_20231125T185721_R113_T10SEF_20241111T023436,S2A_MSIL2A_20240104T185801_R113_T10SEF_20240104T231055,S2A_MSIL2A_20210109T185751_R113_T10SEF_20210110T053434 \
  --supplementary S2B_MSIL2A_20240218T185439_R113_T10SEF_20240218T223624
node scripts/compare_sentinel2_line.mjs                    # bakes 5 scenes x 7 spots x 3 beds x 3 H0 arms; writes model_lines/residuals
python3 scripts/measure_sentinel2_locus.py overlay         # four PNGs
node scripts/compare_sentinel2_line.mjs --bed=cudem19      # the same residual on the CUDEM 1/9" bed, output suffixed .cudem19
```

`forcing.json` was assembled from `loci.json` + `residuals.json` with solar
geometry added (NOAA solar equations at 36.955 N 121.965 W). Wind pulls:
`https://www.ndbc.noaa.gov/view_text_file.php?filename=46042h2023.txt.gz&dir=data/historical/stdmet/`
and
`https://mesonet.agron.iastate.edu/cgi-bin/request/asos.py?station=WVI&data=sknt&data=drct&data=gust&year1=2023&month1=9&day1=26&year2=2024&month2=2&day2=19&tz=Etc/UTC&format=onlycomma`.

Data: Copernicus Sentinel data 2021–2024, processed by ESA, via Microsoft
Planetary Computer. Wave data from CDIP, Scripps Institution of Oceanography
(MOP v1.1). Tide: NOAA CO-OPS. Wind: NOAA NDBC; Iowa Environmental Mesonet
ASOS archive.

## 10. Next

Run `compare_sentinel2_line.mjs --bed=cudem19` on the same four loci. The
observation side is fixed and hashed; the only thing that changes is the
interpolant, and CUDEM_BED_2026-09-01 §7 says the two disagree by 6–20° in
contour normal and up to 1.3 m in depth exactly where this note finds the
reef unsupported. If the CUDEM lines land inside the foam down-point where
the NCEI lines do not, the residual has chosen a bed; if they do not, the
down-point reef fits are the suspect, on either grid.
