#!/usr/bin/env python3
"""Measure real surf kinematics from a cam recording — the observation half of
the validation experiment (TODO Phase 3, "FIRST VALIDATION PASS").

WHY THIS EXISTS
The project's largest honesty gap is that nothing has ever been compared with
an independent observation. The model side already reports peel angle
(bed.js derivedAlphaDeg), break locus (lineProbe) and zipper speed
(capture_temporal.mjs). This is the other side of that comparison.

WHAT IT MEASURES, AND WHY THESE THREE
  1. CROSS-SHORE crest propagation (px/s) — lag cross-correlation between rows.
     Robust: waves march shoreward continuously, so the signal is periodic and
     the lag grows linearly with separation (that linearity is the check).
  2. ALONGSHORE propagation in the break band (px/s) — the peel. Same method
     along x. A peel shows a lag that grows with separation; a standing bore
     shows ZERO lag at every separation, which is a real and distinguishable
     result, not a failure.
  3. Repeat interval (s) — autocorrelation of surf-zone brightness. Scale-free,
     so it can be compared with CDIP Tp with no calibration at all.

WHAT IT DELIBERATELY DOES NOT DO
  * No absolute metres. px -> m needs camera pose or a scale reference in the
    water plane; alongshore and cross-shore foreshorten DIFFERENTLY in an
    oblique cam, so a single scalar cannot convert both. Ratios of same-axis
    speeds are safe; sin(alpha) = c/Vp across axes is NOT, until pose is solved.
  * No appearance metrics. Codec, exposure and auto-white-balance dominate foam
    brightness in a cam stream; that comparison is not defensible yet.

FIRST USE (2026-08-12, Surfline "Pleasure Point Overview", cam clock 1:23pm):
  * A 48 s capture was a BUFFERING player — 3 of 78 steps showed any change,
    max 1.3 grey levels. Zero kinematic value. The motion gate below exists so
    that never silently becomes a measurement.
  * A 35 s capture was live: cross-shore 6.0 px/s (r=0.79, linear at 6 and
    12 px separation); alongshore ZERO lag out to 90 px at 30 fps, i.e. the
    outer band was a standing bore, not a peeling front, on a small day; no
    repeat interval resolvable in 35 s.

USAGE
  python3 scripts/measure_cam.py <video> [--fps=4] [--band=296,366] [--x=640,900]
  python3 scripts/measure_cam.py clip.mov --fps=30 --window=2,12

Needs numpy + Pillow + ffmpeg (dev-only; the repo itself stays dependency-free).
Record 2-3 MINUTES for period/set structure — 35 s supports 2-3 cycles at most.
"""
import argparse, glob, os, subprocess, sys, tempfile

try:
    import numpy as np
    from PIL import Image
except ImportError:
    sys.exit("needs numpy and Pillow: pip install numpy pillow")

ap = argparse.ArgumentParser()
ap.add_argument('video')
ap.add_argument('--fps', type=float, default=4.0)
ap.add_argument('--band', default='296,366', help='y0,y1 of the outer break band')
ap.add_argument('--x', default='640,900', help='x0,x1 alongshore window over the break')
ap.add_argument('--cross-x', default='300,600', help='x0,x1 strip for cross-shore')
ap.add_argument('--cross-y', default='250,420', help='y0,y1 rows for cross-shore')
ap.add_argument('--window', default=None, help='start,dur seconds to analyse')
ap.add_argument('--motion-threshold', type=float, default=1.5,
                help='mean |frame diff| (grey levels) below which the clip is called frozen')
a = ap.parse_args()
pair = lambda s: tuple(int(v) for v in s.split(','))
by0, by1 = pair(a.band); ax0, ax1 = pair(a.x)
cx0, cx1 = pair(a.cross_x); cy0, cy1 = pair(a.cross_y)

tmp = tempfile.mkdtemp(prefix='cammeas_')
cmd = ['ffmpeg', '-v', 'error']
if a.window:
    s, d = a.window.split(','); cmd += ['-ss', s, '-t', d]
cmd += ['-i', a.video, '-vf', f'fps={a.fps}', '-q:v', '2', os.path.join(tmp, 'f_%05d.jpg'), '-y']
subprocess.run(cmd, check=True)
fs = sorted(glob.glob(os.path.join(tmp, 'f_*.jpg')))
if len(fs) < 20:
    sys.exit(f'only {len(fs)} frames extracted — need a longer clip or higher --fps')
A = np.stack([np.asarray(Image.open(f).convert('L'), float) for f in fs])
T, H, W = A.shape
dt = 1.0 / a.fps
print(f'{len(fs)} frames, {W}x{H}, dt={dt:.3f}s, {T*dt:.1f}s of record')

# ---- motion gate: a buffering player is not an observation -----------------
band = A[:, by0:by1, :]
diffs = np.abs(np.diff(band, axis=0)).mean(axis=(1, 2))
moving = (diffs > a.motion_threshold).sum()
print(f'\nMOTION GATE: {moving}/{len(diffs)} steps above {a.motion_threshold} grey levels '
      f'(median {np.median(diffs):.2f}, max {diffs.max():.2f})')
if moving < 0.5 * len(diffs):
    print('  >>> CLIP IS ESSENTIALLY FROZEN (buffering/paused player). No kinematics. <<<')
    sys.exit(2)

bg = np.median(A, axis=0)
D = A - bg[None]

def lag_speed(series, seps, label, dt):
    print(f'\n{label}')
    rows = []
    for dx in seps:
        if series.shape[1] <= dx: continue
        best = (None, -9.0)
        p, q = series[:, :-dx], series[:, dx:]
        for lag in range(-int(2/dt), int(2/dt) + 1):
            if lag >= 0: u, v = p[:T-lag], q[lag:]
            else:        u, v = p[-lag:],  q[:T+lag]
            if u.shape[0] < max(40, 0.4*T): continue
            uc, vc = u - u.mean(0), v - v.mean(0)
            r = float(np.nanmean((uc*vc).sum(0) /
                                 (np.sqrt((uc**2).sum(0)*(vc**2).sum(0)) + 1e-9)))
            if r > best[1]: best = (lag, r)
        lag, r = best
        sp = float('inf') if not lag else dx/(lag*dt)
        rows.append((dx, lag, r, sp))
        print(f'  sep {dx:4d} px -> lag {lag:+4d} fr ({lag*dt:+.3f} s), r={r:.3f}, '
              f'{"unresolved" if not lag else f"{sp:+9.1f} px/s"}')
    # linearity IS the validity check: a real propagation doubles its lag when
    # the separation doubles. Zero lag at every separation = standing, not fast.
    solid = [x for x in rows if x[1]]
    if not solid:
        print('  => NO propagation resolved: zero lag at every separation.')
        print('     That is a RESULT (a standing bore pulsing in phase), not a failure.')
    else:
        sps = [x[3] for x in solid]
        print(f'  => {np.median(sps):+.1f} px/s (median of {len(sps)} separations, '
              f'spread {min(sps):+.1f}..{max(sps):+.1f})')
    return rows

lag_speed(D[:, by0:by1, :].mean(axis=1)[:, ax0:ax1], [10, 20, 40, 60, 90],
          f'ALONGSHORE (peel) — break band y {by0}-{by1}, x {ax0}-{ax1}', dt)
lag_speed(D[:, :, cx0:cx1].mean(axis=2)[:, cy0:cy1], [6, 12, 20, 30],
          f'CROSS-SHORE (crest) — x {cx0}-{cx1}, y {cy0}-{cy1}', dt)

# ---- repeat interval: scale-free, compare directly with CDIP Tp -------------
sig = D[:, by0:by1, ax0:ax1].mean(axis=(1, 2)); sig -= sig.mean()
ac = np.correlate(sig, sig, 'full')[len(sig)-1:]; ac /= (ac[0] + 1e-9)
peaks = [(i*dt, ac[i]) for i in range(2, len(ac)-2)
         if ac[i] > ac[i-1] and ac[i] > ac[i+1] and ac[i] > 0.15]
print('\nREPEAT INTERVAL (autocorrelation of surf-zone brightness)')
if peaks:
    for t, v in peaks[:5]: print(f'  lag {t:6.2f} s  r={v:.3f}')
    print(f'  => dominant ~{peaks[0][0]:.1f} s  (compare with CDIP SC116 Tp for the cam clock)')
else:
    print('  none above r=0.15 — record too short or sea too disorganised.')
cycles = T*dt/12.0
print(f'  record holds ~{cycles:.1f} cycles of a 12 s wave; want >10 for a real estimate.')
