# Asset provenance — fig-week.svg raster material

The seven `cliff_*.png` frames in this directory are renders from the
pointbreak model, one per Pleasure Point site, captured headlessly at
1280×720 (Playwright + Chromium, `--use-angle=metal`), Drone camera,
simulation clock jumped to a fixed t = 42 s so re-runs are comparable.

Regenerate both the captures and the figure:

```bash
node scripts/capture_presets.mjs      # writes cliff_<key>.png here
python3 docs/figures/gen_week.py      # rebuilds fig-week.svg from them
```

The capture script reads the site keys straight out of `web/js/params.js` and
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
