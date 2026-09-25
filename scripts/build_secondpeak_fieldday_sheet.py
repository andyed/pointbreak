#!/usr/bin/env python3
"""Contact sheet for SECONDPEAK_FIELDDAY_2026-09-24.md.

Top: the field frame (event-locator_f1050.jpg, the 15:28 clip from the Second
Peak cliff rail). Then three rows of model frames from
scripts/capture_secondpeak_fieldday.mjs: the Lookout pose (what the jury saw),
the Second Peak cliff pose (the footage's own viewpoint), and 4x crops of the
Lookout frame's right edge, columns 800-1000 / rows 200-300, where the baked
line projects (manifest.json inFrameCols). Labels boxed for contrast.

    python3 scripts/build_secondpeak_fieldday_sheet.py [qa/secondpeak-fieldday-2026-09-24]
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'qa/secondpeak-fieldday-2026-09-24'
FIELD = ROOT / 'docs/research/assets/curl-truth-2026-09-24/event-locator_f1050.jpg'
man = json.loads((OUT / 'manifest.json').read_text())
by = {(f['arm'], f['cam'], f['sim']): f for f in man['frames']}

TILE_W = 500
FONT = ImageFont.load_default()
LABELS = {
    'jury': 'jury hash: h0 1.4, T 17, tide +0.732 (refit)',
    'jury_legacy': 'jury hash, #reef=legacy (pre-refit)',
    'clip_verified': 'clip: Hs 0.778, T 16, tide +0.500 (verified)',
    'clip_surfline': 'clip: 3 ft 0.914, T 16, tide +0.357 (predicted)',
    'clip_setwave': 'clip E[Hmax] 1.40, T 16, tide +0.500',
}


def label(img, text):
    d = ImageDraw.Draw(img)
    w = d.textlength(text, font=FONT) + 8
    d.rectangle([4, 4, 4 + w, 20], fill=(0, 0, 0))
    d.text((8, 6), text, fill=(255, 255, 0), font=FONT)
    return img


def tile(path, text, w=TILE_W):
    im = Image.open(path).convert('RGB')
    im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    return label(im, text)


def crop4(path, text, box=(800, 200, 1000, 300), scale=2.5):
    im = Image.open(path).convert('RGB').crop(box)
    im = im.resize((round(im.width * scale), round(im.height * scale)), Image.NEAREST)
    return label(im, text)


def row(tiles, gap=6):
    h = max(t.height for t in tiles)
    w = sum(t.width for t in tiles) + gap * (len(tiles) - 1)
    out = Image.new('RGB', (w, h), (24, 24, 24))
    x = 0
    for t in tiles:
        out.paste(t, (x, 0))
        x += t.width + gap
    return out


arms = ['jury', 'jury_legacy', 'clip_surfline', 'clip_verified']
field = tile(FIELD, 'FIELD 2026-08-15 15:28, Second Peak cliff rail (event-locator_f1050)', w=1000)
r1 = row([tile(OUT / by[(a, 'lookout', 48)]['file'], 'cam=lookout  ' + LABELS[a]) for a in arms])
r2 = row([tile(OUT / by[(a, 'cliff', 48)]['file'], 'cam=cliff  ' + LABELS[a]) for a in arms])
r3 = row([crop4(OUT / by[(a, 'lookout', 48)]['file'], 'lookout cols 800-1000 x2.5  ' + a) for a in arms])
rows = [field, r1, r2, r3]
W = max(r.width for r in rows)
H = sum(r.height for r in rows) + 8 * (len(rows) - 1)
sheet = Image.new('RGB', (W, H), (24, 24, 24))
y = 0
for r in rows:
    sheet.paste(r, (0, y))
    y += r.height + 8
sheet.save(OUT / 'sheet.jpg', quality=80, optimize=True)
print(f'wrote {OUT / "sheet.jpg"} {sheet.size} {(OUT / "sheet.jpg").stat().st_size / 1e3:.0f} KB')
