#!/usr/bin/env python3
"""Head-crop and squint sheets for the ribbon-material A/B (Track H, 2026-09-24).

Reads the frames scripts/capture_tube_look_matrix.mjs wrote, builds:

  sheet-head-crops-52-54.jpg   2x head crops at 52 s and 54 s, one row per arm
  sheet-squint-52.png          the Squint seat's companion: the 52 s head crop
                               at 1/8 scale, Gaussian r 2, blown back up; with
                               the count of bright blobs (luma >= 0.85 max)
  squint-52.json               the blob counts and simple luma stats per arm

and, with --prune, deletes every matrix frame that is not in KEEP so the
committed set stays under the 2 MB budget, rewriting manifest.json to list
what survived and how many were captured.

    python3 scripts/build_tube_look_sheets.py [qa/tube-look-2026-09-24] [--prune]

Labels are black on white (21:1) so the sheet is readable at any size.
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else 'qa/tube-look-2026-09-24')
PRUNE = '--prune' in sys.argv
ARMS = ['default', 'classicdescent', 'tube', 'tubeclassic', 'tubeclassic_glass']
LABEL = {'default': 'default', 'classicdescent': 'classic+descent', 'tube': 'tube',
         'tubeclassic': 'tube+classic (aerated, new default)', 'tubeclassic_glass': 'tube+classic #tubelook=0 (glass)'}
# Head crops in the sewers_close frame (1000 x 625), by clock. The head runs
# toward the camera and right; 52 s is the jury's clock, 54 s the next.
CROP = {52: (560, 250, 1000, 530), 54: (600, 280, 1000, 480)}
KEEP_SIMS = (52, 54)
FONT = ImageFont.load_default()


def label(im, text):
    d = ImageDraw.Draw(im)
    w = d.textlength(text, font=FONT)
    d.rectangle((4, 4, 4 + w + 8, 4 + 16), fill='white')
    d.text((8, 6), text, fill='black', font=FONT)
    return im


def head_crop(arm, sim, scale=2):
    im = Image.open(OUT / f'sewers_close_{arm}_{sim}.jpg').convert('RGB').crop(CROP[sim])
    return im.resize((im.width * scale, im.height * scale), Image.LANCZOS)


def squint(im):
    small = im.resize((max(im.width // 8, 1), max(im.height // 8, 1)), Image.BOX)
    small = small.filter(ImageFilter.GaussianBlur(2))
    return small, small.resize(im.size, Image.BILINEAR)


def blobs(small):
    """Connected components of luma >= 0.85 * max, 4-neighbour, on the squint."""
    l = np.asarray(small.convert('L')).astype(float)
    m = l >= 0.85 * l.max()
    seen = np.zeros_like(m, bool)
    n = 0
    sizes = []
    for y, x in zip(*np.where(m)):
        if seen[y, x]:
            continue
        n += 1
        stack = [(y, x)]
        seen[y, x] = True
        size = 0
        while stack:
            cy, cx = stack.pop()
            size += 1
            for ny, nx in ((cy + 1, cx), (cy - 1, cx), (cy, cx + 1), (cy, cx - 1)):
                if 0 <= ny < m.shape[0] and 0 <= nx < m.shape[1] and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True
                    stack.append((ny, nx))
        sizes.append(size)
    return n, sorted(sizes, reverse=True), float(l.max()), float(l.mean())


# ---- sheet 1: 2x head crops, 52 and 54 ----
cells = {(a, s): label(head_crop(a, s), f'{LABEL[a]}  {s} s') for a in ARMS for s in KEEP_SIMS}
cw = {s: max(cells[(a, s)].width for a in ARMS) for s in KEEP_SIMS}
rh = max(im.height for im in cells.values())
sheet = Image.new('RGB', (sum(cw.values()) + 12, rh * len(ARMS) + 4 * (len(ARMS) + 1)), (24, 24, 24))
for r, a in enumerate(ARMS):
    x = 4
    for s in KEEP_SIMS:
        sheet.paste(cells[(a, s)], (x, 4 + r * (rh + 4)))
        x += cw[s] + 4
sheet.save(OUT / 'sheet-head-crops-52-54.jpg', quality=88, optimize=True)

# ---- sheet 2: squint companions at 52 ----
stats = {}
row = []
for a in ARMS:
    crop = Image.open(OUT / f'sewers_close_{a}_52.jpg').convert('RGB').crop(CROP[52])
    small, back = squint(crop)
    n, sizes, lmax, lmean = blobs(small)
    stats[a] = {'brightBlobs': n, 'blobSizesPx8': sizes[:6], 'lumaMax': round(lmax, 1), 'lumaMean': round(lmean, 1)}
    row.append(label(back, f'{LABEL[a]}  blobs {n}'))
w = sum(im.width for im in row) + 4 * (len(row) + 1)
sq = Image.new('RGB', (w, row[0].height + 8), (24, 24, 24))
x = 4
for im in row:
    sq.paste(im, (x, 4))
    x += im.width + 4
sq.save(OUT / 'sheet-squint-52.png', optimize=True)
(OUT / 'squint-52.json').write_text(json.dumps({'crop52': CROP[52], 'method': '1/8 BOX downscale, Gaussian r 2, blobs = 4-connected luma >= 0.85 max', 'arms': stats}, indent=2))
for a in ARMS:
    print(a, stats[a])

# ---- prune ----
if PRUNE:
    keep = {f'sewers_close_{a}_{s}.jpg' for a in ARMS for s in KEEP_SIMS}
    keep |= {f'secondpeak_lookout_{a}_52.jpg' for a in ('default', 'tubeclassic')}
    man = json.loads((OUT / 'manifest.json').read_text())
    captured = len(man['frames'])
    removed = 0
    for f in man['frames']:
        if f['file'] not in keep and (OUT / f['file']).exists():
            (OUT / f['file']).unlink()
            removed += 1
    man['frames'] = [f for f in man['frames'] if f['file'] in keep]
    man['pruned'] = {'captured': captured, 'removed': removed, 'kept': sorted(keep),
                     'why': 'commit budget 2 MB; rerun capture_tube_look_matrix.mjs for the full 46-56 s set'}
    man['totalBytes'] = sum(f['bytes'] for f in man['frames'])
    (OUT / 'manifest.json').write_text(json.dumps(man, indent=2))
    print(f'pruned {removed} of {captured} frames; kept {len(keep)}')
