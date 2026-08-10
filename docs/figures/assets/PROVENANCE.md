# Asset provenance — fig-week.svg raster material

The seven `cliff_*.png` frames in this directory are simulated wave-character
captures from the pointbreak renderer's preset bank, taken during the
`wf_bf7f351c-cf9` web-three capture sweep (Playwright headless Chromium,
Cliff camera, sim time t=42, one frame per preset). Source captures at
1280×720 live at
`/private/tmp/claude-501/-Users-andyed-Documents-dev/595c8ebb-16b5-4e6f-a0ad-1916f6721c1c/scratchpad/web-three-caps/final/`
and were downscaled to 640px wide (Lanczos resample, PIL) for repo weight.

Regenerate with `web-three-caps/capture-final.js` against the same seven
preset keys (`cowells`, `jacks`, `secondpeak`, `firstpeak`, `thehook`,
`theslot`, `middlepeak`) at Cliff camera, sim t=42.

These are renders of the wave model, not photographs, and not geography —
three of the seven preset names (Cowell's, The Slot, Middle Peak) are West
Side (Steamer Lane) spot names carried over from an earlier preset bank; see
`docs/research/PP_VISITORS_GUIDE_NOTES.md` for the pending Pleasure Point
canon retarget. The frames claim wave character (peel angle, barrel-ness,
sectioning), not spot geography.
