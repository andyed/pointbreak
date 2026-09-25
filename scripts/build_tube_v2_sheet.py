#!/usr/bin/env python3
"""Before/after head-crop sheet for the ribbon-follows-profile-v2 track
(docs/research/TUBE_V2_2026-09-24.md).

Rows are (rig, clock); columns are the pristine main frame (before) and this
tree's frame (after), both the `tube=1&classic=1&descent=1` arm, cropped to
the head at 2x. Frames come from scripts/capture_tube_ab.mjs runs into
qa/tube-v2-2026-09-24/{before,after,after-secondpeak}; the crop boxes are
fixed per rig so before and after show the same pixels (the camera is pinned,
drift 0.000 m per manifest).

    python3 scripts/build_tube_v2_sheet.py [out.jpg]
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'qa' / 'tube-v2-2026-09-24'
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs' / 'research' / 'assets' / 'tube-v2-2026-09-24' / 'head-crops-before-after.jpg'

# (label, before file, after file, crop box in the 1000x625 frame)
ROWS = [
    ('Sewers close, 50 s', 'before/sewers_close_tubeclassic_50.jpg', 'after/sewers_close_tubeclassic_50.jpg', (500, 230, 800, 410)),
    ('Sewers close, 52 s', 'before/sewers_close_tubeclassic_52.jpg', 'after/sewers_close_tubeclassic_52.jpg', (600, 240, 1000, 480)),
    ('Sewers close, 54 s', 'before/sewers_close_tubeclassic_54.jpg', 'after/sewers_close_tubeclassic_54.jpg', (700, 300, 1000, 480)),
    ('Down the line, 48 s', 'before/diag_downline_tubeclassic_48.jpg', 'after/diag_downline_tubeclassic_48.jpg', (560, 100, 1000, 364)),
    ('Second Peak cliff (field day), 54 s', 'before/secondpeak_cliff_tubeclassic_54.jpg', 'after-secondpeak/secondpeak_cliff_tubeclassic_54.jpg', (500, 260, 1000, 380)),
]
SCALE = 2
GUTTER = 12
LABEL_H = 22
COL_W = max((b[2] - b[0]) for *_, b in ROWS) * SCALE

tiles = []
for label, before, after, box in ROWS:
    w, h = (box[2] - box[0]) * SCALE, (box[3] - box[1]) * SCALE
    row = Image.new('RGB', (2 * COL_W + GUTTER, h + LABEL_H), 'white')
    for i, f in enumerate((before, after)):
        p = QA / f
        if not p.exists():
            raise SystemExit(f'missing frame {p}')
        im = Image.open(p).crop(box).resize((w, h), Image.LANCZOS)
        row.paste(im, (i * (COL_W + GUTTER), LABEL_H))
    d = ImageDraw.Draw(row)
    d.text((4, 4), f'{label} - BEFORE (main 951d1f1)', fill='black')
    d.text((COL_W + GUTTER + 4, 4), f'{label} - AFTER (ribbon follows profile v2)', fill='black')
    tiles.append(row)

sheet = Image.new('RGB', (2 * COL_W + GUTTER, sum(t.height for t in tiles) + GUTTER * (len(tiles) - 1)), 'white')
y = 0
for t in tiles:
    sheet.paste(t, (0, y))
    y += t.height + GUTTER
OUT.parent.mkdir(parents=True, exist_ok=True)
sheet.save(OUT, quality=82)
print(f'{OUT} {sheet.size} {OUT.stat().st_size / 1e3:.0f} KB')
