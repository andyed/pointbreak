#!/usr/bin/env python3
"""Edge metrics for the plan-view hard-edge investigation (#birth, 2026-09-01).

Reads the manifest written by scripts/capture_birth_ab.mjs and, per (rig, sim),
compares every arm against the `default` arm inside windows that are FIXED on
the default arm's own geometry (its projected break line and head), so the
instrument never re-frames on the foam it measures (MEASUREMENT_LESSONS 11).

Per frame:
  diff        differing pixels vs default (bit-identity proof for birth0)
  bnd_p90/99  foam-luma gradient magnitude at the whitewater boundary
  hough_best  fraction of boundary pixels on the single best straight line
  hough_vert  same, restricted to shore-normal (screen-vertical) lines
  win_res     median RMS perpendicular residual of 48 px windowed line fits
  win_straight fraction of those windows with residual < 1.5 px
  head_grad   peak |dL/dx| across the head, in a band fixed on the head
  head_w1090  10-90% transition width (px) of the luma step across the head
  ahead_L     mean luma of a fixed region 10-45 m AHEAD of the head at the
              line (the not-yet-broken side); ahead_bright = fraction > 170
  behind_L    the same region 10-45 m behind the head, for reference

Crest-locus metrics (wrap-ramp width sweep, 2026-09-01). The manifest's
stations carry `crestLoc`, the model's own crest (argmax surface height on a
shore-normal transect) projected to screen. Profiles run along screen y
through those points, in windows fixed on the DEFAULT arm's crest:
  cb_grad / cb_w1090   peak |dL/dy| and 10-90% width (px) of the luma step
                       across the crest BEHIND the head (stations k -70..-20;
                       medians). From the drone this is the horizontal knife.
  cb_hough_horiz       fraction of foam-boundary pixels in the behind-crest box
                       on the best screen-horizontal (shore-parallel) line
  cb_hough_best        same, any orientation
  ch_grad / ch_w1090   the same step at the HEAD (stations k -10..+10) - from
                       the cliff and lineup this is the visible crest of the
                       breaking wave, i.e. what a wider ramp costs

    python3 scripts/measure_foam_edge.py qa/img/birth [--debug] [--crest]
"""
import json, os, sys
import numpy as np
from PIL import Image

L_FOAM = 170.0      # foam-bright luma threshold (calibrated on the drone frames:
                    # water tops out ~120-140, whitewater sits 190-245)
CHROMA_MAX = 70.0   # foam is near-neutral; teal water carries chroma > 70

def luma(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722])

def load(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float64)

def gauss1d(a, sigma, axis):
    r = int(3 * sigma)
    x = np.arange(-r, r + 1)
    k = np.exp(-0.5 * (x / sigma) ** 2); k /= k.sum()
    pad = [(0, 0)] * a.ndim; pad[axis] = (r, r)
    ap = np.pad(a, pad, mode='edge')
    out = np.zeros_like(a)
    for i, kv in enumerate(k):
        sl = [slice(None)] * a.ndim; sl[axis] = slice(i, i + a.shape[axis])
        out += kv * ap[tuple(sl)]
    return out

def gauss2d(a, sigma):
    return gauss1d(gauss1d(a, sigma, 0), sigma, 1)

def gradient(l):
    g = gauss2d(l, 1.5)
    gy, gx = np.gradient(g)
    return gx, gy, np.hypot(gx, gy)

def erode(m):
    p = np.pad(m, 1, mode='constant')
    out = m.copy()
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            out &= p[1 + dy:1 + dy + m.shape[0], 1 + dx:1 + dx + m.shape[1]]
    return out

def median3(m):
    p = np.pad(m.astype(np.uint8), 1, mode='edge')
    s = np.zeros(m.shape, dtype=np.int32)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            s += p[1 + dy:1 + dy + m.shape[0], 1 + dx:1 + dx + m.shape[1]]
    return s >= 5

def foam_mask(rgb):
    l = luma(rgb)
    chroma = rgb.max(axis=2) - rgb.min(axis=2)
    return median3((l > L_FOAM) & (chroma < CHROMA_MAX))

def boundary(mask):
    return mask & ~erode(mask)

def hough(ys, xs, shape):
    """Fraction of boundary pixels on the best line (2 px rho bins, 1 deg)."""
    if len(xs) < 20:
        return dict(best=0.0, best_theta=None, vert=0.0, horiz=0.0)
    thetas = np.deg2rad(np.arange(0, 180, 1.0))
    diag = int(np.hypot(*shape)) + 2
    acc = np.zeros((len(thetas), diag), dtype=np.int32)
    cos, sin = np.cos(thetas), np.sin(thetas)
    for i in range(len(thetas)):
        rho = xs * cos[i] + ys * sin[i]
        b = ((rho + diag / 2) / 2.0).astype(int)
        b = b[(b >= 0) & (b < diag)]
        acc[i] = np.bincount(b, minlength=diag)
    n = float(len(xs))
    best_i = np.unravel_index(acc.argmax(), acc.shape)
    vert_rows = [i for i, t in enumerate(np.rad2deg(thetas)) if t <= 3 or t >= 177]
    horiz_rows = [i for i, t in enumerate(np.rad2deg(thetas)) if 87 <= t <= 93]
    return dict(best=acc.max() / n, best_theta=float(np.rad2deg(thetas[best_i[0]])),
                vert=acc[vert_rows].max() / n, horiz=acc[horiz_rows].max() / n)

def windowed_fit(ys, xs, win=48, min_pts=30):
    if len(xs) == 0:
        return dict(res_median=None, straight_frac=None, n=0)
    res = []
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    for wy in range(y0, y1 + 1, win // 2):
        for wx in range(x0, x1 + 1, win // 2):
            sel = (xs >= wx) & (xs < wx + win) & (ys >= wy) & (ys < wy + win)
            if sel.sum() < min_pts:
                continue
            p = np.stack([xs[sel], ys[sel]], axis=1).astype(float)
            p -= p.mean(axis=0)
            _, s, vt = np.linalg.svd(p, full_matrices=False)
            perp = p @ vt[1]
            res.append(float(np.sqrt((perp ** 2).mean())))
    if not res:
        return dict(res_median=None, straight_frac=None, n=0)
    res = np.array(res)
    return dict(res_median=float(np.median(res)), straight_frac=float((res < 1.5).mean()), n=int(len(res)))

def bbox_of(points, pad, shape):
    pts = np.array([p[:2] for p in points if p[2] == 1])
    if len(pts) == 0:
        return None
    x0 = max(0, int(pts[:, 0].min() - pad)); x1 = min(shape[1], int(pts[:, 0].max() + pad))
    y0 = max(0, int(pts[:, 1].min() - pad)); y1 = min(shape[0], int(pts[:, 1].max() + pad))
    if x1 <= x0 or y1 <= y0:
        return None
    return (x0, y0, x1, y1)

def region_stats(l, box):
    if box is None:
        return dict(L=None, bright=None)
    x0, y0, x1, y1 = box
    r = l[y0:y1, x0:x1]
    return dict(L=float(r.mean()), bright=float((r > L_FOAM).mean()))

def head_step(l, head, half_w=60, half_h=20):
    """Peak |dL/dx| and 10-90% width of the luma step across the head."""
    if head is None or head[2] != 1:
        return dict(grad=None, w1090=None)
    hx, hy = int(head[0]), int(head[1])
    y0, y1 = max(0, hy - half_h), min(l.shape[0], hy + half_h)
    x0, x1 = max(0, hx - half_w), min(l.shape[1], hx + half_w)
    if x1 <= x0 or y1 <= y0:      # head projects outside the frame (lineup at sewers)
        return dict(grad=None, w1090=None)
    band = gauss1d(l[y0:y1, x0:x1], 2.0, 1).mean(axis=0)     # row-averaged, 2 px smoothed
    d = np.abs(np.diff(band))
    if len(d) == 0:
        return dict(grad=None, w1090=None)
    # 10-90% width of the largest monotone excursion in the band
    lo, hi = band.min(), band.max()
    if hi - lo < 10:
        return dict(grad=float(d.max()), w1090=None)
    i_hi, i_lo = int(band.argmax()), int(band.argmin())
    a, b = sorted((i_hi, i_lo))
    seg = band[a:b + 1]
    t10, t90 = lo + 0.1 * (hi - lo), lo + 0.9 * (hi - lo)
    inside = np.nonzero((seg > t10) & (seg < t90))[0]
    w = float(inside.max() - inside.min() + 1) if len(inside) else 1.0
    return dict(grad=float(d.max()), w1090=w, step=float(hi - lo))

def step_profile(prof):
    """Peak |d/di| and 10-90% width of the largest monotone excursion of a 1-D
    luma profile (already smoothed). Same rule as head_step, on any axis."""
    d = np.abs(np.diff(prof))
    if len(d) == 0:
        return dict(grad=None, w1090=None, step=None)
    lo, hi = prof.min(), prof.max()
    if hi - lo < 10:
        return dict(grad=float(d.max()), w1090=None, step=float(hi - lo))
    i_hi, i_lo = int(prof.argmax()), int(prof.argmin())
    a, b = sorted((i_hi, i_lo))
    seg = prof[a:b + 1]
    t10, t90 = lo + 0.1 * (hi - lo), lo + 0.9 * (hi - lo)
    inside = np.nonzero((seg > t10) & (seg < t90))[0]
    w = float(inside.max() - inside.min() + 1) if len(inside) else 1.0
    return dict(grad=float(d.max()), w1090=w, step=float(hi - lo))

def crest_steps(l, pts, half_h=40, half_w=3):
    """Median peak |dL/dy| and 10-90% width across the crest at the given
    projected crest points (screen-vertical profiles, 7 px column average,
    2 px smoothing). pts = [(x, y, vis), ...]; only vis == 1 are used."""
    grads, widths = [], []
    for p in pts:
        if p is None or p[2] != 1:
            continue
        hx, hy = int(round(p[0])), int(round(p[1]))
        y0, y1 = hy - half_h, hy + half_h
        x0, x1 = hx - half_w, hx + half_w + 1
        if y0 < 0 or y1 > l.shape[0] or x0 < 0 or x1 > l.shape[1]:
            continue
        prof = gauss1d(l[y0:y1, x0:x1], 2.0, 0).mean(axis=1)
        st = step_profile(prof)
        if st['grad'] is not None:
            grads.append(st['grad'])
        if st['w1090'] is not None:
            widths.append(st['w1090'])
    return dict(grad=float(np.median(grads)) if grads else None,
                w1090=float(np.median(widths)) if widths else None,
                n=len(widths))

def crest_pts(ref, k0, k1, shoreward_min=None):
    """Projected crest points for stations k0..k1. With shoreward_min set, keep
    only stations whose crest sits at least that many metres SHOREWARD of the
    break line: behind the head the current (broken) wave has crossed the line,
    so an argmax on the seaward side is the next, approaching crest, not this
    one (seen at sewers sim 52, k -70/-65 and -20..-10)."""
    out = []
    for s in ref['stations']:
        if not (k0 <= s['k'] <= k1) or not s.get('crestLoc'):
            continue
        if shoreward_min is not None:
            if s.get('crestZ') is None or (s['crestZ'] - s['zLine']) < shoreward_min:
                continue
        out.append(s['crestLoc'])
    return out

def crest_ks(ref, k0, k1, shoreward_min=None):
    return [s['k'] for s in ref['stations'] if k0 <= s['k'] <= k1 and s.get('crestLoc')
            and (shoreward_min is None or (s.get('crestZ') is not None and (s['crestZ'] - s['zLine']) >= shoreward_min))]

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else 'qa/img/birth'
    debug = '--debug' in sys.argv
    crest_table = '--crest' in sys.argv
    man = json.load(open(os.path.join(root, 'manifest.json')))
    frames = man['frames']
    by = {}
    for f in frames:
        by.setdefault((f['rig'], f['sim']), {})[f['arm']] = f
    rows = []
    for (rig, sim), arms in sorted(by.items()):
        ref = arms.get('default')
        if ref is None:
            print(f'{rig} sim {sim}: no default arm, skipped'); continue
        ref_rgb = load(os.path.join(root, ref['png']))
        shape = ref_rgb.shape[:2]
        # Windows FIXED on the default arm's geometry.
        line_pts = [s['sea'] for s in ref['stations']] + [s['shore'] for s in ref['stations']] + [s['crest'] for s in ref['stations']]
        win = bbox_of(line_pts, 60, shape)
        ahead_pts = [s['sea'] for s in ref['stations'] if 10 <= s['k'] <= 45] + [s['crest'] for s in ref['stations'] if 10 <= s['k'] <= 45]
        behind_pts = [s['sea'] for s in ref['stations'] if -45 <= s['k'] <= -10] + [s['crest'] for s in ref['stations'] if -45 <= s['k'] <= -10]
        ahead = bbox_of(ahead_pts, 12, shape)
        behind = bbox_of(behind_pts, 12, shape)
        head = ref['headScreen']
        # Crest-locus windows, fixed on the default arm's model crest.
        cb_pts = crest_pts(ref, -70, -20, shoreward_min=5.0)
        cb_ks = crest_ks(ref, -70, -20, shoreward_min=5.0)
        ch_pts = crest_pts(ref, -10, 10)
        cb_box = bbox_of(cb_pts, 40, shape) if cb_pts else None
        for arm, f in sorted(arms.items(), key=lambda kv: (kv[0] != 'default', kv[0])):
            rgb = load(os.path.join(root, f['png']))
            l = luma(rgb)
            diff = np.abs(rgb - ref_rgb).max(axis=2)
            cam_moved = f['camera'] != ref['camera'] or f['target'] != ref['target']
            r = dict(rig=rig, sim=sim, arm=arm, png=f['png'], cam_moved=cam_moved,
                     diff_px=int((diff > 0).sum()), diff_max=float(diff.max()))
            if win is not None:
                x0, y0, x1, y1 = win
                m = foam_mask(rgb)[y0:y1, x0:x1]
                b = boundary(m)
                ys, xs = np.nonzero(b)
                _, _, gm = gradient(l[y0:y1, x0:x1])
                gb = gm[b] if b.any() else np.array([0.0])
                r.update(bnd_px=int(b.sum()), bnd_p50=float(np.percentile(gb, 50)),
                         bnd_p90=float(np.percentile(gb, 90)), bnd_p99=float(np.percentile(gb, 99)))
                h = hough(ys, xs, b.shape)
                r.update(hough_best=h['best'], hough_theta=h['best_theta'], hough_vert=h['vert'], hough_horiz=h['horiz'])
                wf = windowed_fit(ys, xs)
                r.update(win_res=wf['res_median'], win_straight=wf['straight_frac'], win_n=wf['n'])
                if debug:
                    dbg = rgb[y0:y1, x0:x1].copy()
                    dbg[b] = [255, 0, 0]
                    if ahead:
                        ax0, ay0, ax1, ay1 = ahead
                        dbg[max(0, ay0 - y0):ay1 - y0, max(0, ax0 - x0):ax1 - x0, 1] = np.minimum(255, dbg[max(0, ay0 - y0):ay1 - y0, max(0, ax0 - x0):ax1 - x0, 1] + 60)
                    if head and head[2] == 1:
                        hx, hy = int(head[0]) - x0, int(head[1]) - y0
                        if 0 <= hx < dbg.shape[1] and 0 <= hy < dbg.shape[0]:
                            dbg[max(0, hy - 20):hy + 20, max(0, hx - 60):hx + 60, 2] = np.minimum(255, dbg[max(0, hy - 20):hy + 20, max(0, hx - 60):hx + 60, 2] + 60)
                    os.makedirs(os.path.join(root, 'debug'), exist_ok=True)
                    Image.fromarray(dbg.astype(np.uint8)).save(os.path.join(root, 'debug', 'dbg_' + f['png']))
            hs = head_step(l, head)
            r.update(head_grad=hs['grad'], head_w1090=hs['w1090'], head_step=hs.get('step'))
            cb = crest_steps(l, cb_pts); ch = crest_steps(l, ch_pts)
            r.update(cb_grad=cb['grad'], cb_w1090=cb['w1090'], cb_n=cb['n'], cb_ks=cb_ks,
                     ch_grad=ch['grad'], ch_w1090=ch['w1090'], ch_n=ch['n'],
                     cb_hough_horiz=None, cb_hough_best=None, cb_bnd_p99=None)
            if cb_box is not None:
                x0, y0, x1, y1 = cb_box
                mb = foam_mask(rgb)[y0:y1, x0:x1]
                bb = boundary(mb)
                bys, bxs = np.nonzero(bb)
                hb = hough(bys, bxs, bb.shape)
                _, _, gmb = gradient(l[y0:y1, x0:x1])
                gbb = gmb[bb] if bb.any() else np.array([0.0])
                r.update(cb_hough_horiz=hb['horiz'], cb_hough_best=hb['best'],
                         cb_bnd_p99=float(np.percentile(gbb, 99)), cb_bnd_px=int(bb.sum()))
                if debug:
                    dbg = rgb[y0:y1, x0:x1].copy()
                    dbg[bb] = [255, 0, 0]
                    for p in cb_pts:
                        px_, py_ = int(round(p[0])) - x0, int(round(p[1])) - y0
                        if 0 <= px_ < dbg.shape[1] and 0 <= py_ < dbg.shape[0]:
                            dbg[max(0, py_ - 40):py_ + 40, max(0, px_ - 3):px_ + 4, 1] = 255
                    os.makedirs(os.path.join(root, 'debug'), exist_ok=True)
                    Image.fromarray(dbg.astype(np.uint8)).save(os.path.join(root, 'debug', 'crest_' + f['png']))
            a = region_stats(l, ahead); bh = region_stats(l, behind)
            r.update(ahead_L=a['L'], ahead_bright=a['bright'], behind_L=bh['L'], behind_bright=bh['bright'])
            rows.append(r)
    # ---- report ----
    fmt = lambda v, p=2: ('-' if v is None else (f'{v:.{p}f}' if isinstance(v, float) else str(v)))
    cols = ['rig', 'sim', 'arm', 'diff_px', 'bnd_p90', 'bnd_p99', 'hough_best', 'hough_vert', 'win_res', 'win_straight',
            'head_grad', 'head_w1090', 'ahead_L', 'ahead_bright', 'behind_L']
    if crest_table:
        cols = ['rig', 'sim', 'arm', 'diff_px', 'cb_n', 'cb_w1090', 'cb_grad', 'cb_hough_horiz', 'cb_hough_best', 'cb_bnd_p99',
                'ch_n', 'ch_w1090', 'ch_grad', 'ahead_L', 'bnd_p99', 'hough_horiz']
    print('| ' + ' | '.join(cols) + ' |')
    print('|' + '---|' * len(cols))
    for r in rows:
        print('| ' + ' | '.join(fmt(r.get(c)) for c in cols) + ' |' + ('  CAMERA MOVED' if r['cam_moved'] else ''))
    with open(os.path.join(root, 'metrics.json'), 'w') as fh:
        json.dump(rows, fh, indent=1)
    print(f'\nwrote {os.path.join(root, "metrics.json")}')

if __name__ == '__main__':
    main()
