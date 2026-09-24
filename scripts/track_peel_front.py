#!/usr/bin/env python3
"""Track one crest's peel front through the 2026-08-15 Surfline field clip.

Observation half of the peel-speed residual (VALIDATION_PLAN "4-5 ft is the
test of whether the model's 4.8-10 m/s zipper is anywhere near right").
Companion: scripts/solve_cam_pose.py converts these px/s to m/s.

WHY A NEW TRACKER
FIELD_WAVE_MOTION_2026-09-15 recorded a thresholded-component tracker that
joined the older foreground bore and switched subjects. Threshold selection
cannot establish subject identity. This one keys on *becoming* white, not
*being* white: a pixel counts only in the frame window where its luma rises
through the foam threshold, so standing foam, the inside bore and the old
broken portion of the same crest contribute nothing. The peel front is the
down-line (image-left, the peel direction in this camera) edge of the newly
broken pixels, followed frame to frame with a continuity gate so it cannot
jump to a different crest.

WHAT IT REPORTS, per clean sequence (2-12 s and 34-44 s, the two progressions
FIELD_WAVE_MOTION identified):
  * front x(t), y(t) in source pixels, a robust line fit -> px/s alongshore
    (image-x) and cross-shore (image-y) of the FRONT;
  * the crest's own cross-shore advance from row lag cross-correlation in the
    same window (measure_cam.py method) with the lag-linearity check;
  * the alongshore lag cross-correlation in the break band as a second,
    independent estimate of the peel;
  * a fixed-fence null control: phase correlation of a land ROI, which must
    read ~0 px/s or the camera moved.

USAGE
  python3 scripts/track_peel_front.py qa/surfline-cam-2026-09-23/field-clean.mp4 \
      --out docs/research/assets/surfline-cam-2026-09-23 --qa qa/surfline-cam-2026-09-23

Requires the exact clean reference clip (hash checked). Needs cv2, numpy, scipy.
Frames with people at scale stay in the ignored --qa directory.
"""
import argparse, hashlib, json, sys
from pathlib import Path
import cv2, numpy as np
from scipy.stats import theilslopes

REF_SHA = '11428e3fa283bea0834c724c7a6c79d6bb6b506ae9e0885525d43ee08e962695'
FPS = 30
# The outer breaking line sits in this row band in every clean frame; the
# inside bore (y > 800) and the far field (y < 650) are excluded by design.
BAND = (650, 800)
FOAM_THR = 150          # luma above which a pixel is foam (grey, 0-255)
RISE_LAG = 30           # frames (1 s): a pixel is "new" if it was below FOAM_THR this long ago.
                        # 4 frames was tried first: the head's fresh white is then a few
                        # fragments and the section spilling to its right wins the pick.
# Sequences identified as clean single-crest progressions (clean-clip seconds).
SEQUENCES = {'seqA': (2.0, 12.0), 'seqB': (34.0, 44.0)}
# Seed x (source px) of the active head at each sequence's first frame, read
# off the band strips (qa/.../seq*_band_strip.png). Without a seed the largest
# newly-white component wins, and on 2 s that is the already-broken section
# spilling at the right edge, not the head — the subject-identity failure
# FIELD_WAVE_MOTION recorded, in a new costume.
SEEDS = {'seqA': 1500, 'seqB': 1610}
GATE_PX = 60            # max front jump per frame; grows with frames since last lock
GATE_GROW = 15
# x0,x1,y0,y1. FIELD_WAVE_MOTION's ROI (600-1100, 1140-1240) is iceplant and
# path: phase-correlation response ~0.09 there, so it gates out and any drift
# it reports is noise. The right-hand rail top is textured and static:
# response 0.85 in every frame.
FENCE_ROI = (1900, 2250, 940, 1010)


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        while chunk := f.read(8 << 20):
            h.update(chunk)
    return h.hexdigest()


def read_frames(cap, f0, f1):
    cap.set(cv2.CAP_PROP_POS_FRAMES, f0)
    out = []
    for _ in range(f0, f1):
        ok, bgr = cap.read()
        if not ok:
            break
        out.append(cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY))
    return out


def track_front(frames, t0, seed_x, debug_dir=None, tag=''):
    """Follow the down-line edge of newly-broken pixels through one sequence."""
    y0, y1 = BAND
    band = np.stack([f[y0:y1, :] for f in frames]).astype(np.float32)
    band = np.stack([cv2.GaussianBlur(b, (5, 5), 0) for b in band])
    T, H, W = band.shape
    rows = []
    prev = (float(seed_x), 0.5 * (y0 + y1))
    gap = 0
    for i in range(RISE_LAG, T):
        new = (band[i] > FOAM_THR) & (band[i - RISE_LAG] < FOAM_THR)
        m = new.astype(np.uint8)
        m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
        if n <= 1:
            rows.append((t0 + i / FPS, np.nan, np.nan, 0)); continue
        # candidates: components with enough area; pick by continuity with the
        # previous front (nearest left edge), else the largest.
        cands = [(k, st[k]) for k in range(1, n) if st[k][cv2.CC_STAT_AREA] >= 40]
        if not cands:
            rows.append((t0 + i / FPS, np.nan, np.nan, 0)); continue
        # continuity gate: the front cannot jump more than GATE_PX between
        # locked frames (>1800 px/s would be absurd); after a loss the gate
        # widens by GATE_GROW per frame so the same head can be re-acquired.
        # Prefer the component whose down-line edge is nearest the previous
        # front; the row term keeps it on the outer line.
        tol = GATE_PX + GATE_GROW * gap
        def cost(c):
            s = c[1]
            dxl = abs(s[cv2.CC_STAT_LEFT] - prev[0])
            dy = abs(s[cv2.CC_STAT_TOP] + s[cv2.CC_STAT_HEIGHT] / 2 - (prev[1] - y0))
            return dxl + 2 * dy
        k, s = min(cands, key=cost)
        if abs(s[cv2.CC_STAT_LEFT] - prev[0]) > tol:
            gap += 1
            rows.append((t0 + i / FPS, np.nan, np.nan, 0)); continue
        gap = 0
        ys, xs = np.nonzero(lab == k)
        # the front: the down-line (leftmost) 5 % of the component's pixels
        q = np.percentile(xs, 5)
        sel = xs <= q + 2
        fx = float(xs[sel].mean()); fy = float(ys[sel].mean()) + y0
        prev = (fx, fy)
        rows.append((t0 + i / FPS, fx, fy, int(st[k][cv2.CC_STAT_AREA])))
        if debug_dir is not None and i % 15 == 0:
            vis = cv2.cvtColor(frames[i][y0 - 40:y1 + 40, :], cv2.COLOR_GRAY2BGR)
            vis[40:40 + H][new] = (0, 0, 255)
            cv2.circle(vis, (int(fx), int(fy - y0 + 40)), 8, (0, 255, 0), 2)
            cv2.imwrite(str(debug_dir / f'front_{tag}_{i:04d}.png'), vis)
    return np.array(rows, float)


def robust_rate(t, v):
    ok = np.isfinite(v)
    if ok.sum() < 10:
        return dict(slope=None, lo=None, hi=None, n=int(ok.sum()))
    b, a, lo, hi = theilslopes(v[ok], t[ok])
    r = float(np.corrcoef(t[ok], v[ok])[0, 1])
    return dict(slope=float(b), lo=float(lo), hi=float(hi), intercept=float(a), n=int(ok.sum()), r=r)


def stepwise(t, v, win_s=1.0):
    """Central-difference velocity over a 1 s window at each locked sample:
    the peel is not uniform (a section can close out ahead of the head), so
    the slope of one line through the whole sequence is not the number to
    report on its own."""
    ok = np.isfinite(v)
    tt, vv = t[ok], v[ok]
    out = []
    for i in range(len(tt)):
        j0 = np.searchsorted(tt, tt[i] - win_s / 2); j1 = np.searchsorted(tt, tt[i] + win_s / 2) - 1
        if j1 > j0 and tt[j1] - tt[j0] >= 0.6 * win_s:
            out.append((vv[j1] - vv[j0]) / (tt[j1] - tt[j0]))
    if len(out) < 5:
        return dict(median=None, q1=None, q3=None, n=len(out))
    q1, med, q3 = np.percentile(out, [25, 50, 75])
    return dict(median=float(med), q1=float(q1), q3=float(q3), n=len(out), p10=float(np.percentile(out, 10)), p90=float(np.percentile(out, 90)))


def lag_speed(series, seps, dt, maxlag_s=2.0):
    """measure_cam.py's lag cross-correlation: a real propagation doubles its
    lag when the separation doubles."""
    T = series.shape[0]
    rows = []
    for d in seps:
        if series.shape[1] <= d:
            continue
        best = (0, -9.0)
        p, q = series[:, :-d], series[:, d:]
        L = int(maxlag_s / dt)
        for lag in range(-L, L + 1):
            if lag >= 0:
                u, v = p[:T - lag], q[lag:]
            else:
                u, v = p[-lag:], q[:T + lag]
            if u.shape[0] < 0.4 * T:
                continue
            uc, vc = u - u.mean(0), v - v.mean(0)
            r = float(np.nanmean((uc * vc).sum(0) / (np.sqrt((uc ** 2).sum(0) * (vc ** 2).sum(0)) + 1e-9)))
            if r > best[1]:
                best = (lag, r)
        lag, r = best
        rows.append(dict(sep_px=d, lag_frames=int(lag), lag_s=lag * dt, r=r,
                         px_per_s=(d / (lag * dt)) if lag else None))
    solid = [x for x in rows if x['lag_frames']]
    med = float(np.median([x['px_per_s'] for x in solid])) if solid else None
    # linearity: regress lag on separation through the origin; report r^2
    lin = None
    if len(solid) >= 2:
        s = np.array([x['sep_px'] for x in solid]); l = np.array([x['lag_frames'] for x in solid], float)
        k = (s * l).sum() / (s * s).sum()
        ss_res = ((l - k * s) ** 2).sum(); ss_tot = ((l - l.mean()) ** 2).sum() + 1e-9
        lin = dict(frames_per_px=float(k), r2=float(1 - ss_res / ss_tot))
    return dict(rows=rows, median_px_per_s=med, linearity=lin)


def fence_null(frames):
    """Phase correlation of a land ROI against the sequence's own median frame.
    Pedestrians cross this ROI (people walk the path), which kills a
    correlation against any single frame; the median frame is people-free, so
    each frame's shift from it is a camera number. A fixed camera reads a flat
    series at ~0 px with no trend; the Theil-Sen slope is the drift rate the
    kinematics would have to be corrected by. Frames whose response drops
    below 0.3 (a pedestrian in the ROI) are excluded."""
    x0, x1, y0, y1 = FENCE_ROI
    win = cv2.createHanningWindow((x1 - x0, y1 - y0), cv2.CV_32F)
    roi = np.stack([f[y0:y1, x0:x1] for f in frames]).astype(np.float32)
    ref = np.median(roi, axis=0)
    sh = np.array([(*cv2.phaseCorrelate(ref, r, win)[0], cv2.phaseCorrelate(ref, r, win)[1]) for r in roi])
    ok = sh[:, 2] > 0.3
    t = np.arange(len(frames)) / FPS
    bx = theilslopes(sh[ok, 0], t[ok])[0]; by = theilslopes(sh[ok, 1], t[ok])[0]
    return dict(n=int(len(sh)), n_gated=int(ok.sum()),
                p95_abs_px_vs_median=[float(np.percentile(np.abs(sh[ok, 0]), 95)), float(np.percentile(np.abs(sh[ok, 1]), 95))],
                drift_px_per_s=[float(bx), float(by)])


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('video', type=Path)
    ap.add_argument('--out', type=Path, default=Path('docs/research/assets/surfline-cam-2026-09-23'))
    ap.add_argument('--qa', type=Path, default=Path('qa/surfline-cam-2026-09-23'))
    a = ap.parse_args()
    if sha256(a.video) != REF_SHA:
        sys.exit('this protocol requires the exact clean reference clip')
    a.out.mkdir(parents=True, exist_ok=True); a.qa.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(a.video))
    assert int(round(cap.get(cv2.CAP_PROP_FPS))) == FPS and int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) == 1825
    dt = 1.0 / FPS
    result = dict(source_sha256=REF_SHA, fps=FPS, band=BAND, foam_thr=FOAM_THR, rise_lag_frames=RISE_LAG,
                  sequences={})
    for name, (s0, s1) in SEQUENCES.items():
        f0, f1 = int(s0 * FPS), int(s1 * FPS)
        frames = read_frames(cap, f0, f1)
        tr = track_front(frames, s0, SEEDS[name], a.qa, name)
        t, fx, fy = tr[:, 0], tr[:, 1], tr[:, 2]
        seq = dict(window_s=[s0, s1], n_frames=len(frames), n_tracked=int(np.isfinite(fx).sum()))
        seq['front_x'] = robust_rate(t, fx)
        seq['front_y'] = robust_rate(t, fy)
        seq['front_x_stepwise'] = stepwise(t, fx)
        seq['front_y_stepwise'] = stepwise(t, fy)
        # motion gate (MEASUREMENT_LESSONS 2): a frozen player is not an observation.
        # Same cadence as FIELD_WAVE_MOTION's check (0.1 s steps, half-res): at
        # 1/30 s the same motion reads ~0.9 grey levels and would fail a 1.5 gate.
        band = np.stack([f[BAND[0]:BAND[1], :] for f in frames]).astype(np.float32)
        diffs = np.abs(np.diff(band[::3, :, ::2], axis=0)).mean(axis=(1, 2))
        seq['motion_gate'] = dict(step_s=0.1, median_abs_diff=float(np.median(diffs)), frac_above_1p5=float((diffs > 1.5).mean()))
        bg = np.median(band, axis=0)
        D = band - bg[None]
        # alongshore lag cross-correlation over the break band, restricted to the
        # x-range the front actually crossed, so the standing outer foam is not in it
        ok = np.isfinite(fx)
        xa, xb = int(np.nanmin(fx)) - 50, int(np.nanmax(fx)) + 50
        xa, xb = max(xa, 0), min(xb, band.shape[2])
        seq['alongshore_lag'] = dict(x_range=[xa, xb], **lag_speed(D.mean(axis=1)[:, xa:xb], [10, 20, 40, 60, 90], dt))
        # cross-shore in the same 10 s window, rows of the outer line only.
        # 10 s holds well under one carrier period of 16 s, so this is a check;
        # the reported crest speed is the full-clip measurement below.
        full = np.stack([f[660:800, xa:xb] for f in frames]).astype(np.float32)
        full -= np.median(full, axis=0)[None]
        seq['crossshore_lag_window'] = dict(x_range=[xa, xb], y_range=[660, 800], **lag_speed(full.mean(axis=2), [6, 12, 20, 30], dt, maxlag_s=6.0))
        seq['fence_null'] = fence_null(frames)
        seq['track'] = [[round(float(r[0]), 3), None if not np.isfinite(r[1]) else round(float(r[1]), 1),
                         None if not np.isfinite(r[2]) else round(float(r[2]), 1), int(r[3])] for r in tr]
        result['sequences'][name] = seq
        print(f"{name} {s0}-{s1}s: tracked {seq['n_tracked']}/{len(frames)} frames; "
              f"front x {seq['front_x'].get('slope')} px/s [{seq['front_x'].get('lo')}, {seq['front_x'].get('hi')}] r={seq['front_x'].get('r')}; "
              f"front y {seq['front_y'].get('slope')} px/s; "
              f"alongshore lag {seq['alongshore_lag']['median_px_per_s']} lin={seq['alongshore_lag']['linearity']}; "
              f"cross-shore(window) {seq['crossshore_lag_window']['median_px_per_s']} lin={seq['crossshore_lag_window']['linearity']}; "
              f"fence drift {seq['fence_null']['drift_px_per_s']} px/s")
    # ---- cross-shore crest advance on the whole clip, 10 Hz, outer-line rows ----
    # The row lag cross-correlation needs several carrier cycles (60 s holds ~4
    # of a 16 s swell); it is measured over the columns both tracked heads
    # crossed, rows 660-800, and mapped at the front's row by the pose script.
    xa = min(int(np.nanmin([min(v for v in [r[1] for r in s['track']] if v is not None) for s in result['sequences'].values()])), 900)
    xb = max(int(np.nanmax([max(v for v in [r[1] for r in s['track']] if v is not None) for s in result['sequences'].values()])), 1650)
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    rows = []
    for i in range(1825):
        ok, bgr = cap.read()
        if not ok:
            break
        if i % 3:
            continue
        g = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        rows.append(g[660:800, xa:xb].astype(np.float32).mean(axis=1))
    rows = np.stack(rows); rows -= np.median(rows, axis=0)[None]
    cs = lag_speed(rows, [6, 12, 18, 24, 30, 40], 0.1, maxlag_s=8.0)
    result['crossshore_full_clip'] = dict(x_range=[xa, xb], y_range=[660, 800], sample_hz=10, row_for_mapping=730, **cs)
    for s in result['sequences'].values():
        s['crossshore_lag'] = dict(result['crossshore_full_clip'])
    print('cross-shore (full clip, rows 660-800, x %d-%d): %s px/s, linearity %s' % (xa, xb, cs['median_px_per_s'], cs['linearity']))
    with open(a.out / 'peel_kinematics_px.json', 'w') as f:
        json.dump(result, f, indent=1)
    print('wrote', a.out / 'peel_kinematics_px.json')


if __name__ == '__main__':
    main()
