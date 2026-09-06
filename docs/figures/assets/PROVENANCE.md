# Asset provenance — rendered raster material

The seven `cliff_*.png` frames in this directory are renders from the
pointbreak model, one per Pleasure Point site, captured headlessly at
1280×720 (Playwright + Chromium, `--use-angle=metal`), Drone camera,
simulation clock jumped to a fixed t = 42 s so re-runs are comparable. They
were regenerated on 2026-08-26 after the judged breaker anatomy became the
default: lip bend, aeration, connected curtain, causal onset, and
`Sapp = 0.22`. The optional `look=foam` material is not enabled.
Both capture URLs set `speed=0`; shader warm-up therefore cannot advance the
supposedly pinned model clock before the screenshot.

Regenerate both the captures and the figure:

```bash
node scripts/capture_presets.mjs      # writes cliff_<key>.png here
python3 docs/figures/gen_week.py      # rebuilds fig-week.svg from them
```

The capture script reads the site keys straight out of `shared/params.js` and
asserts the requested preset actually applied before screenshotting, so the
frames cannot silently drift from the bank. `gen_week.py` reads the same file
for the parameter line under each panel.

**These are renders, not photographs**, and the model is not validated against
this break — see the repository README's "What it does not model". The frames
claim wave character (peel angle, barrel-ness, sectioning), not photographic
truth.

The file names retain the `cliff_` prefix from the original Cliff-camera sweep
on 2026-08-09. The camera moved to Drone on 2026-08-10, because the Cliff
station now stands on the real NCEI terrain and put a foreground of sand in
half the panels.

Historical note: the first version of this sheet carried three west-side spot
names (Cowell's, The Slot, Middle Peak) inherited from an early preset bank.
The bank was retargeted to the real Pleasure Point canon on 2026-08-10 and no
borrowed names remain.

## Social-preview inset

`og_hero.png` is a 1280×752 crop of the renderer at Sewers, Drone camera. The
accepted asset remains the 2026-08-10 capture from commit `38e67ad`. A
2026-08-26 recapture with the promoted anatomy default looked worse at card size
and was deliberately deferred. `gen_og.py` embeds the accepted capture and
`render_check.mjs` rasterises the card at 2×:

```bash
# Optional: produce a review candidate. Do not replace the accepted asset
# without visual approval.
node docs/figures/capture_og_hero.mjs
python3 docs/figures/gen_og.py
node docs/figures/render_check.mjs docs/figures/og-card.svg \
  docs/figures/og-card.png 2
```

The inset is a simulated render, not aerial photography; the card labels it
`SIMULATED` in the adjacent high-contrast caption.

## Bathymetry candidates sheet (2026-09-01)

`bathy_candidates_2026-09-01.png` is generated, not captured:
`python3 docs/figures/gen_bathy_candidates.py` reads `data/bathy/pp_bathy.json`
and `data/bathy/pp_bathy_cudem19.json`, block-means the 3 m stage lattice to
12 m/px, and draws hillshades of both grids, their −2/−5/−10/−15 m NAVD88
contours, the OSM coastline, the seven canon spots, and a submerged-only
CUDEM − NCEI difference at ±2 m. Data: NOAA NCEI (public domain) on an
OSM-derived frame (ODbL; © OpenStreetMap contributors). Read with
`docs/research/BATHY_SOURCES_2026-09-01.md`.

## Photographs (2026-09-05)

Three files in this directory are **photographs, not renders**, and the essay
labels them as Plates rather than Figures so the Fig. sequence keeps meaning
one thing:

| file | frame |
|---|---|
| `field_stairs_2026-09-05.jpg` | the 38th Avenue stairs descending into riprap and whitewater |
| `field_sign_hazards_2026-09-05.jpg` | the county "Changing Ocean Shore Hazards" placard beside the ordinance sign |
| `field_sign_tidepools_2026-09-05.jpg` | the "Welcome to Pleasure Point Tide Pools" poster |

Author's own, hand-held iPhone 15 Pro, cliff top at 38th Avenue,
2026-09-05 11:12–11:13 PDT. Conditions at capture, both measured rather than
estimated: tide +0.316 m above MSL (NOAA CO-OPS 9413450 verified water level)
and SC116 nowcast Hs 0.902 m, Tp 16.7 s, Dp 188.5°.

These are 1400 px (stairs) and 900 px (signs) JPEG derivatives with the EXIF
rotation baked into the raster, so the stored pixels are the displayed pixels
and the `width`/`height` attributes in the essay are honest. The full ten-frame
capture, with each frame's camera pose — position in stage coordinates, GPS
altitude, true heading, field of view, and the bearing and range to every canon
spot — is the benchmark fixture at
`docs/research/assets/pleasure-point-2026-09-05/`, whose README carries the
method. Originals stay in the local Photos library; the `photos_uuid` in that
fixture's `manifest.json` is the key to re-pull any of them.
