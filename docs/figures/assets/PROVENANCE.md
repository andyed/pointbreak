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

## Regeneration 2026-09-24 — unmirrored site, refit reef

The seven `cliff_<key>.png` frames, `fig-week.svg` and `fig-week-render.png`
were regenerated at commit `b78be48` (main) after two model changes landed
the same day: the stage → world mirror was removed (`604ea6a`; `#mirror=0`
reverts) and the reef was refit with an intertidal crest allowed
(`56219d7`; `#reef=legacy` reverts). Same rig as before — Drone camera,
1280×720, `sim=42`, `speed=0`, `month=card`, tide 0 — driven this time against
an already-running `scripts/serve.py` on port 8238 through the capture
script's new `--base=` flag (`--port=` moves its built-in server; both were
added so a capture never fights a preview port).

What changed in the pictures:

- **Handedness.** Every frame is now the geographically correct-handed site.
  The previous set (2026-08-26) was the mirror image: at Sewers, First Peak,
  Second Peak, Jack's, The Hook and Sharks the breaking head has moved from
  the left third of the frame to the right third and the peel runs
  screen-left, with the shore band (where one is in frame — Jack's, Sharks)
  now bottom-left. The sun glint sits on the right, as
  `docs/research/MIRROR_VERIFICATION_2026-09-23.md` §7 notes it would.
- **Reef.** Second Peak, Jack's and Privates now carry the intertidal wedge
  (crest +0.142 m NAVD88, `REEF_REFIT_2026-09-24.md` §6), and Sharks' crest
  moved to 0.96 m below MSL. The frames are captured at tide 0 (MSL), where
  nothing is exposed, so no shelf is visible in them; at MLLW the three spots
  would show a ~1,500–2,600 m² shelf. The break line sits at the same
  offshore station as before at every spot.
- **Privates** is not a mirror comparison: the 2026-08-26 frame predated the
  mapped bed (2026-09-02) and showed the fogged synthetic stage; the new frame
  is the surveyed platform with the cove bottom-right. `gen_week.py`'s footer
  no longer says six of seven run on surveyed bathymetry.

The spec line under each panel is read from `shared/params.js` as before, so
it now carries the retargeted peel bank (α 38/50/41/37/41/36/31).

The og hero **was replaced on 2026-09-24** (Andy's call) with the capture made at
b78be48 by `capture_og_hero.mjs`: Sewers, Drone camera, unmirrored, on the refit
reef. It carries bright lip-geometry facets on the two breaking heads at card
size; that is the shipped renderer's lip, not a capture defect, and it is on the
TODO. `og-card.svg`/`.png` were regenerated from it (`gen_og.py`,
`render_check.mjs`). The 2026-08-10 asset it replaced was the mirror image of
the site.

## Social-preview inset

`og_hero.png` is a 1280×752 crop of the renderer at Sewers, Drone camera. The
accepted asset is the 2026-09-24 capture at b78be48 (see above); the 2026-08-10
capture from commit `38e67ad` it replaced was mirrored. `gen_og.py` embeds the accepted capture and
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
