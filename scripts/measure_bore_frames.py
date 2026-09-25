#!/usr/bin/env python3
"""White band thickness over face height on rendered frames — the Field seat's
luma-run method (CURL_TRUTH §1.3, assets/curl-truth-2026-09-24/measurements.json)
applied to the bore matrix, with the seat's re-set thresholds for the brighter
render (CURL_JURY §5: face = teal-tinted, luma < 175 below the horizon; foam =
luma > 205, neutral).

Per frame, every image column inside a y-window under the horizon is read top
to bottom: the longest neutral bright run (the bore band, or the lip line)
and, directly below its foot, the longest teal dark run (the unbroken front
face down to the trough). H_f is the face read where the crest is NOT covered:
the p90 of dark runs over columns whose bright run is thin (<= 4 px) inside
the same head window, so the ratio is bore thickness over the adjacent
unbroken face, exactly as the field table pairs them. The bore thickness is
the median bright run over the columns whose bright run exceeds a quarter of
H_f (the covered stretch of the head window); knuckle width is the count of
those columns over H_f (a foreshortened lower bound, as in the field).

Windows (image rows) are fixed per rig once and applied to every arm and clock
(MEASUREMENT_LESSONS 11: the instrument is pinned, never re-aimed at the
signal); they are recorded in the output. Annotated crops are written beside
the JSON so the runs can be checked by eye.

Usage: python3 scripts/measure_bore_frames.py <framedir> [--out <json>]
"""
import argparse
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

# Head windows: rows (y0, y1) and columns (x0, x1) that hold the live head at
# every clock of the matrix for that rig, read once off the default frames.
WINDOWS = {
    # Sewers close: the near wave's crest runs y ~300-350 from x ~400 to the
    # right edge, its face down to y ~600; the impact slab sits at x 450-850.
    'sewers_close':       {'rows': (240, 620), 'cols': (350, 1000)},
    # Lookout: the near wave fills the lower half; crest y ~290-340, trough
    # ~470-500. The far head at the right edge is under 30 px and unreadable.
    'secondpeak_lookout': {'rows': (270, 520), 'cols': (60, 940)},
    # Second Peak cliff (card day): the only pose that shows a head from the
    # side; crest band y ~250-330, face to ~420.
    'secondpeak_cliff':   {'rows': (230, 450), 'cols': (40, 980)},
}
GAP_PX = 8   # a run may bridge gaps this long (specular glitter breaks the teal face run)
BRIGHT_L, NEUTRAL = 200, 34     # bright: luma > 200 and |R-B| < 34 (white, not sky-blue glint)
FACE_L, TEAL = 175, 8           # face: luma < 175 and G - R > 8 (teal-tinted water)


def luma(a):
    return 0.299*a[..., 0] + 0.587*a[..., 1] + 0.114*a[..., 2]


def close_gaps(mask, gap):
    """Bridge False gaps of at most `gap` samples between True samples."""
    m = np.array(mask, dtype=bool).copy()
    idx = np.flatnonzero(m)
    for a, b in zip(idx[:-1], idx[1:]):
        if 1 < b - a <= gap + 1:
            m[a:b] = True
    return m


def longest_run(mask):
    """(start, length) of the longest True run in a 1-D bool array."""
    mask = close_gaps(mask, GAP_PX)
    best = (0, 0); start = None
    for i, v in enumerate(list(mask) + [False]):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start > best[1]:
                best = (start, i - start)
            start = None
    return best


def measure(path, win):
    img = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    L = luma(img)
    y0, y1 = win['rows']; x0, x1 = win['cols']
    bright = (L > BRIGHT_L) & (np.abs(img[..., 0] - img[..., 2]) < NEUTRAL)
    face = (L < FACE_L) & ((img[..., 1] - img[..., 0]) > TEAL)
    cols = []
    for x in range(x0, x1):
        b = bright[y0:y1, x]
        bs, bl = longest_run(b)
        # face directly under the bright run's foot (or from the window top if no bright run)
        f0 = y0 + bs + bl if bl else y0
        fs, fl = longest_run(face[f0:y1, x])
        cols.append({'x': x, 'bright_top': y0 + bs if bl else None, 'bright_h': int(bl),
                     'face_top': f0 + fs if fl else None, 'face_h': int(fl)})
    bh = np.array([c['bright_h'] for c in cols]); fh = np.array([c['face_h'] for c in cols])
    # Per-column pairing: the band and the dark face directly under it belong
    # to the same wave at the same depth, so b/(b+f) is the band's share of
    # that column's face and cancels the foreshortening a cross-column H_f
    # cannot. Columns need a band (> 6 px) and a face under it (> 10 px); a
    # specular glint is a band with no face under it or a band under 6 px, so
    # the default's glitter drops out here where the cross-column ratio counted it.
    paired = (bh > 6) & (fh > 10)
    col_frac = bh[paired] / (bh[paired] + fh[paired]) if paired.sum() else np.array([])
    thin = bh <= 4
    hf = float(np.percentile(fh[thin], 90)) if thin.sum() >= 10 and fh[thin].max() > 0 else float(np.percentile(fh, 90))
    covered = bh > 0.25*hf if hf > 0 else bh > 8
    bore_h = float(np.median(bh[covered])) if covered.sum() else 0.0
    bore_p90 = float(np.percentile(bh[covered], 90)) if covered.sum() else 0.0
    # band top vs the crest line of the adjacent unbroken face (negative = below)
    tops_b = [c['bright_top'] for c, cv in zip(cols, covered) if cv and c['bright_top'] is not None]
    tops_f = [c['face_top'] for c, th in zip(cols, thin) if th and c['face_top'] is not None]
    top_offset = (float(np.median(tops_f)) - float(np.median(tops_b))) if tops_b and tops_f else None
    return {
        'file': os.path.basename(path), 'window': win,
        'Hf_px': round(hf, 1), 'bore_px_median': round(bore_h, 1), 'bore_px_p90': round(bore_p90, 1),
        'bore_over_Hf': round(bore_h/hf, 3) if hf > 0 else None,
        'bore_p90_over_Hf': round(bore_p90/hf, 3) if hf > 0 else None,
        'covered_cols': int(covered.sum()), 'covered_over_Hf': round(covered.sum()/hf, 2) if hf > 0 else None,
        'paired_cols': int(paired.sum()),
        'frac_col_median': round(float(np.median(col_frac)), 3) if col_frac.size else None,
        'frac_col_p25': round(float(np.percentile(col_frac, 25)), 3) if col_frac.size else None,
        'frac_col_p75': round(float(np.percentile(col_frac, 75)), 3) if col_frac.size else None,
        'paired_over_Hf': round(paired.sum()/hf, 2) if hf > 0 else None,
        'band_top_above_crest_px': None if top_offset is None else round(top_offset, 1),
        'band_top_over_Hf': None if (top_offset is None or hf <= 0) else round(top_offset/hf, 3),
        'cols': cols,
    }, img


def annotate(img, m, out):
    im = Image.fromarray(img.astype(np.uint8)); d = ImageDraw.Draw(im)
    y0, y1 = m['window']['rows']; x0, x1 = m['window']['cols']
    d.rectangle([x0, y0, x1, y1], outline=(255, 220, 0))
    for c in m['cols'][::3]:
        if c['bright_h']:
            d.line([c['x'], c['bright_top'], c['x'], c['bright_top'] + c['bright_h']], fill=(255, 60, 60))
        if c['face_h']:
            d.line([c['x'], c['face_top'], c['x'], c['face_top'] + c['face_h']], fill=(60, 255, 90))
    d.text((x0 + 4, y0 + 4), f"Hf {m['Hf_px']} px  bore {m['bore_px_median']} px = {m['bore_over_Hf']}", fill=(255, 255, 0))
    im.crop((x0 - 20, max(0, y0 - 40), x1 + 20, y1 + 40)).save(out, quality=80)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('framedir')
    ap.add_argument('--out', default=None)
    ap.add_argument('--annotate', action='store_true')
    a = ap.parse_args()
    out = a.out or os.path.join(a.framedir, 'measurements_rendered.json')
    rows = []
    for f in sorted(os.listdir(a.framedir)):
        if not f.endswith('.jpg'):
            continue
        rig = next((r for r in WINDOWS if f.startswith(r + '_')), None)
        if rig is None:
            continue
        m, img = measure(os.path.join(a.framedir, f), WINDOWS[rig])
        rest = f[len(rig) + 1:-4]
        arm, sim = rest.rsplit('_', 1)
        m.update({'rig': rig, 'arm': arm, 'sim': int(sim)})
        if a.annotate:
            os.makedirs(os.path.join(a.framedir, 'ann'), exist_ok=True)
            annotate(img, m, os.path.join(a.framedir, 'ann', 'ann_' + f))
        rows.append(m)
        print(f"{f:40s} Hf {m['Hf_px']:6.1f}  bore {m['bore_px_median']:5.1f} px  xcol {m['bore_over_Hf']}  | paired {m['paired_cols']:4d} cols  b/(b+f) med {m['frac_col_median']}  p25 {m['frac_col_p25']}  p75 {m['frac_col_p75']}  span/Hf {m['paired_over_Hf']}")
    slim = [{k: v for k, v in r.items() if k != 'cols'} for r in rows]
    with open(out, 'w') as fh:
        json.dump({'thresholds': {'bright_luma': BRIGHT_L, 'neutral_rb': NEUTRAL, 'face_luma': FACE_L, 'teal_gr': TEAL},
                   'windows': WINDOWS, 'rows': slim}, fh, indent=1)
    print('wrote', out)


if __name__ == '__main__':
    sys.exit(main())
