#!/usr/bin/env python3
"""Luma at the fold locus vs the face below it, from capture_lip_ab.mjs output.

Reads the rig's manifest and, for every frame, samples luma along the three
model-anchored screen segments each station recorded (lip column at the baked
line, face 12 m seaward, open water 45 m seaward). Per station the statistic
is the MAX along the segment — the segments sweep world height because the
displayed crest height is not knowable screen-side, and the lip claim is about
the brightest thing on that column. Per frame we report the median over
CURL-WINDOW stations (|x - headX| <= 15 m) of those maxima, per band: the
first cut medianed over the full +-30 m span and a compact curl vanished into
the statistic (sim-42 head whitening 228 -> 242 at the pixels, delta 0.0 in
the summary) — the domain must match the question (MEASUREMENT_LESSONS 8c).

Acceptance (TODO Track 5 aerated lip): ON frames put the lip band clearly
above face and water; OFF frames are the measured glass baseline. The
spilling-vs-plunging contrast reads from the sharks vs sewers rigs.

Usage: python3 scripts/measure_lip_luma.py [capture_dir]
"""
import json
import statistics
import sys
from pathlib import Path

from PIL import Image


def seg_max_luma(px, w, h, p0, p1, steps=16):
    vals = []
    for i in range(steps + 1):
        t = i / steps
        x = p0[0] + (p1[0] - p0[0]) * t
        y = p0[1] + (p1[1] - p0[1]) * t
        xi, yi = int(round(x)), int(round(y))
        if 0 <= xi < w and 0 <= yi < h:
            r, g, b = px[xi, yi][:3]
            vals.append(0.299 * r + 0.587 * g + 0.114 * b)
    return max(vals) if vals else None


def main():
    cap = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/pointbreak-lip-ab')
    manifest = json.loads((cap / 'manifest.json').read_text())
    rows = []
    for fr in manifest['frames']:
        img = Image.open(cap / fr['png']).convert('RGB')
        px = img.load()
        w, h = img.size
        bands = {'lip': [], 'face': [], 'water': []}
        for st in fr['stations']:
            if abs(st['x'] - fr['headX']) > 15.0:
                continue          # outside the curl window (8c: domain first)
            for band in bands:
                p0, p1 = st[band]
                if not (p0[2] and p1[2]):
                    continue          # off-frustum station
                v = seg_max_luma(px, w, h, p0, p1)
                if v is not None:
                    bands[band].append(v)
        med = {k: (round(statistics.median(v), 1) if v else None)
               for k, v in bands.items()}
        rows.append({'rig': fr['rig'], 'arm': fr['arm'], 'sim': fr['sim'],
                     'xi': fr['xi'], 'headX': fr['headX'],
                     'n': len(bands['lip']), **med})
    fmt = '{rig:>14} {arm:>4} sim={sim:<3} xi={xi:<5} headX={headX:<8} ' \
          'lip={lip!s:>6} face={face!s:>6} water={water!s:>6} (n={n})'
    for r in rows:
        print(fmt.format(**r))
    # OFF->ON deltas per rig/sim
    print('\nOFF -> ON lip-band delta (median of station maxima):')
    by = {(r['rig'], r['sim'], r['arm']): r for r in rows}
    for rig in sorted({r['rig'] for r in rows}):
        for sim in sorted({r['sim'] for r in rows if r['rig'] == rig}):
            off, on = by.get((rig, sim, 'off')), by.get((rig, sim, 'on'))
            if off and on and off['lip'] is not None and on['lip'] is not None:
                print(f'  {rig:>14} sim={sim:<3} lip {off["lip"]:6.1f} -> {on["lip"]:6.1f}'
                      f'   lip-face ON {on["lip"] - on["face"]:+6.1f}'
                      f'   (OFF {off["lip"] - off["face"]:+6.1f})')
    (cap / 'luma.json').write_text(json.dumps(rows, indent=2))


if __name__ == '__main__':
    main()
