#!/usr/bin/env python3
"""Solve what can be solved of the Surfline "Pleasure Point" cam's pose from
the 2026-08-15 field clip, and convert tracked peel kinematics to metres.

WHAT THE FRAME CONTAINS, AND WHAT THAT PERMITS
The only land in frame is the cliff-top fence, the path behind it and iceplant
on the brow. No stairs, riprap, cross-street, house, seawall corner or distant
coastline is visible, and the near water below the brow is occluded by the
fence. So there is no land control point whose stage coordinate can be fixed
from OSM or the DEM, and a full pinhole solve (solvePnP / calibrateCamera) is
not possible from this clip. That is stated, not worked around.

What the frame does permit, and this script does:
  1. HORIZON: the sea/sky edge, fitted as a line across the width of a
     people-free median frame -> horizon row y_h(x) and roll.
  2. EYE HEIGHT, FOCAL-LENGTH-FREE: a vertical object of known height h on a
     horizontal plane at depth H below the eye subtends h_px = h * (y_base -
     y_h) / H, independent of focal length. Two independent bars:
       * fence posts (h = 1.15 +- 0.10 m) -> height above the terrace, plus the
         CUDEM terrace elevation -> eye height above the sea surface;
       * sitting surfers in the lineup (torso above water 0.85 +- 0.15 m) ->
         eye height above the sea surface directly.
  3. FOCAL LENGTH: cannot be solved; it is BRACKETED (see f_bracket in the
     output) and every f-dependent number is reported across the bracket.
  4. GROUND MAPPING: pinhole, principal point at the image centre, pitch from
     y_h and f, roll from the horizon slope, plane at the tide-adjusted sea
     surface. Alongshore (image-x) ground scale at a row is H / (y - y_h) to
     first order and does not depend on f; range (image-y) scale does.
  5. CONVERSION of scripts/track_peel_front.py's px/s to m/s, with the
     H +- 2 m and f-bracket sensitivities.

USAGE
  python3 scripts/solve_cam_pose.py --clip qa/surfline-cam-2026-09-23/field-clean.mp4 \
      --kin docs/research/assets/surfline-cam-2026-09-23/peel_kinematics_px.json \
      --out docs/research/assets/surfline-cam-2026-09-23
"""
import argparse, hashlib, json, math, sys
from pathlib import Path
import cv2, numpy as np
from scipy.stats import theilslopes

REF_SHA = '11428e3fa283bea0834c724c7a6c79d6bb6b506ae9e0885525d43ee08e962695'
W, H_IMG = 2288, 1286
CX, CY = W / 2, H_IMG / 2
# Sea surface on the model's MSL axis for 2026-08-15 15:28 PDT (CO-OPS 9413450
# datums: MSL 1.893, MLLW 1.031 m station datum; tide 4.0 ft MLLW).
TIDE_MLLW_M = 4.0 * 0.3048
MSL_MINUS_MLLW = 1.893 - 1.031
TIDE_MSL_M = TIDE_MLLW_M - MSL_MINUS_MLLW          # +0.357 m
MSL_ABOVE_NAVD88 = 0.905
SEA_NAVD88 = MSL_ABOVE_NAVD88 + TIDE_MSL_M           # 1.262 m

# ---- hand-read control points (source pixels, from gridded crops in qa/) ----
# Vertical bars only: there is nothing in frame with a fixable stage coordinate.
FENCE_POSTS = [
    # x, y_top, y_base, note. Base = where the post meets the brow ground; the
    # two readable posts are the ones whose base is not hidden by iceplant.
    dict(x=1330, y_top=1110, y_base=1250, note='mid-frame post, base at vegetation line'),
    dict(x=2010, y_top=965, y_base=1092, note='right-of-frame post at the path edge'),
]
FENCE_POST_M = (1.15, 0.10)          # post height above ground, m (mean, sd)
SITTER_M = (0.85, 0.15)              # sitting surfer, top of head above water, m
# CUDEM 1/9" terrace elevation at the cliff brow between 33rd and 38th Ave
# (data/bathy/pp_bathy_cudem19.json, shore-normal profiles): 10.0-11.5 m NAVD88.
TERRACE_NAVD88 = (10.75, 0.75)
# Focal-length bracket, px. Lower/upper from the widest/narrowest lens a fixed
# surf cam plausibly runs (HFOV ~83 deg .. ~50 deg at 2288 px); central value
# from the sitting lineup sitting 130 +- 25 m from the eye (OSM node offshore
# distance 107-111 m plus ~20 m brow setback) at its median row.
F_BRACKET = (1300, 1800, 2500)


def sha256(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        while chunk := f.read(8 << 20):
            h.update(chunk)
    return h.hexdigest()


def median_frame(cap, step=30):
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fr = []
    for i in range(0, n, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, i)
        ok, b = cap.read()
        if ok:
            fr.append(cv2.cvtColor(b, cv2.COLOR_BGR2GRAY))
    return np.median(np.stack(fr), axis=0).astype(np.uint8)


def fit_horizon(med):
    """Strongest bright-to-dark vertical step per column in the sea/sky band,
    robust line through them. The marine-layer sky is brighter than the sea."""
    g = cv2.blur(med.astype(np.float32), (31, 5))
    dy = np.diff(g, axis=0)
    xs, ys = [], []
    for x in range(100, W - 100, 20):
        col = dy[400:700, x]
        xs.append(x); ys.append(int(np.argmin(col)) + 400 + 0.5)
    xs, ys = np.array(xs, float), np.array(ys, float)
    b, a, _, _ = theilslopes(ys, xs)
    ok = np.abs(ys - (a + b * xs)) < 6
    b2, a2 = np.polyfit(xs[ok], ys[ok], 1)
    rms = float(np.sqrt(np.mean((ys[ok] - (a2 + b2 * xs[ok])) ** 2)))
    return dict(a=float(a2), b=float(b2), roll_deg=float(math.degrees(math.atan(b2))),
                rms_px=rms, n_used=int(ok.sum()), n_total=int(len(xs)),
                y_at_centre=float(a2 + b2 * CX))


def yh(hz, x):
    return hz['a'] + hz['b'] * x


def sitters(cap, hz, frames=(30, 150, 600, 900, 1080, 1500, 1700)):
    """Dark torso blobs in the lineup band; height above the waterline in px."""
    out = []
    for fi in frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, fi)
        ok, b = cap.read()
        if not ok:
            continue
        g = cv2.cvtColor(b, cv2.COLOR_BGR2GRAY).astype(np.float32)
        band = g[700:820, 0:1300]
        bg = cv2.medianBlur(band.astype(np.uint8), 31).astype(np.float32)
        m = ((bg - band) > 28).astype(np.uint8)
        n, lab, st, cen = cv2.connectedComponentsWithStats(m, 8)
        for k in range(1, n):
            x, y, w, h, a = st[k]
            if 6 <= h <= 40 and 3 <= w <= 30 and a >= 20 and w < 1.6 * h:
                yb = 700 + y + h
                out.append(dict(frame=fi, x=float(x + w / 2), y_base=float(yb), h_px=int(h),
                                delta_px=float(yb - yh(hz, x + w / 2))))
    return out


class Pose:
    """Pinhole camera, principal point at centre, no distortion. Camera frame:
    +x right, +y down, +z forward. World: X forward (along the heading
    projected on the plane), Y left, Z up, eye at height H above the plane."""

    def __init__(self, f, H, hz):
        self.f, self.H = f, H
        self.roll = math.atan(hz['b'])
        # y_h at the centre column sits above the principal point by f*tan(pitch)
        self.pitch = math.atan((CY - hz['y_at_centre']) / f)   # positive = looking down

    def ray(self, x, y):
        u, v = x - CX, y - CY
        # undo roll (image rotated by roll about the optical axis)
        c, s = math.cos(-self.roll), math.sin(-self.roll)
        u, v = c * u - s * v, s * u + c * v
        d = np.array([u, v, self.f], float)
        d /= np.linalg.norm(d)
        # pitch: rotate about the camera x axis so the optical axis tilts down
        cp, sp = math.cos(self.pitch), math.sin(self.pitch)
        # camera y (down) and z (forward) -> world X (forward) and Z (up):
        # forward = cos(p)*z_cam - sin(p)*y_cam ; up = -(sin(p)*z_cam + cos(p)*y_cam)
        fwd = cp * d[2] - sp * d[1]
        up = -(sp * d[2] + cp * d[1])
        left = -d[0]
        return np.array([fwd, left, up])

    def ground(self, x, y):
        r = self.ray(x, y)
        if r[2] >= -1e-9:
            return None
        t = self.H / (-r[2])
        return np.array([r[0] * t, r[1] * t])   # (forward, left) metres

    def jacobian(self, x, y, e=0.5):
        gx = (self.ground(x + e, y) - self.ground(x - e, y)) / (2 * e)
        gy = (self.ground(x, y + e) - self.ground(x, y - e)) / (2 * e)
        return np.stack([gx, gy], axis=1)   # d(fwd,left)/d(x,y), m/px


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--clip', type=Path, required=True)
    ap.add_argument('--kin', type=Path, required=True)
    ap.add_argument('--out', type=Path, default=Path('docs/research/assets/surfline-cam-2026-09-23'))
    ap.add_argument('--model', type=Path, default=None, help='model_peel JSON from scripts/compare_peel_speed.mjs, for the figure')
    a = ap.parse_args()
    if sha256(a.clip) != REF_SHA:
        sys.exit('this protocol requires the exact clean reference clip')
    a.out.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(str(a.clip))
    med = median_frame(cap)
    hz = fit_horizon(med)

    # ---- eye height, f-free ----
    posts = []
    for p in FENCE_POSTS:
        hpx = p['y_base'] - p['y_top']; d = p['y_base'] - yh(hz, p['x'])
        posts.append(dict(**p, h_px=hpx, delta_px=d, H_above_base_m=FENCE_POST_M[0] * d / hpx))
    H_fb = float(np.mean([p['H_above_base_m'] for p in posts]))
    # error: 10 px reading on ~130 px, plus the post-height sd
    H_fb_sd = H_fb * math.hypot(FENCE_POST_M[1] / FENCE_POST_M[0], 10 / 130)
    terrace_above_sea = TERRACE_NAVD88[0] - SEA_NAVD88
    H_eye_fence = H_fb + terrace_above_sea
    H_eye_fence_sd = math.hypot(H_fb_sd, TERRACE_NAVD88[1])
    sit = sitters(cap, hz)
    Hs = np.array([SITTER_M[0] * s['delta_px'] / s['h_px'] for s in sit])
    H_eye_sit = float(np.median(Hs)); q1, q3 = np.percentile(Hs, [25, 75])
    # combine by inverse variance (sitter sd from the IQR of the per-blob values)
    # standard error of the median from the IQR, plus the sitter-height sd in quadrature
    sit_sd = math.hypot(0.7413 * (q3 - q1) / math.sqrt(len(Hs)), H_eye_sit * SITTER_M[1] / SITTER_M[0])
    w1, w2 = 1 / H_eye_fence_sd ** 2, 1 / sit_sd ** 2
    H_eye = (w1 * H_eye_fence + w2 * H_eye_sit) / (w1 + w2)
    H_eye_sd = math.sqrt(1 / (w1 + w2))

    # ---- kinematics -> metres ----
    kin = json.load(open(a.kin))
    seqs = {}
    for name, s in kin['sequences'].items():
        tr = np.array([[t, x if x is not None else np.nan, y if y is not None else np.nan]
                       for t, x, y, _ in s['track']], float)
        ok = np.isfinite(tr[:, 1])
        xm, ym = float(np.nanmedian(tr[ok, 1])), float(np.nanmedian(tr[ok, 2]))
        vx_fit = s['front_x']['slope']; vy_fit = s['front_y']['slope']
        vx_step = s.get('front_x_stepwise', {}); vy_step = s.get('front_y_stepwise', {})
        c_px = s['crossshore_lag']['median_px_per_s']
        c_row = s['crossshore_lag'].get('row_for_mapping', ym)
        along_lag = s['alongshore_lag']['median_px_per_s']
        conv = {}
        for f in F_BRACKET:
            for Hk, Hv in (('H-2', H_eye - 2), ('H', H_eye), ('H+2', H_eye + 2)):
                P = Pose(f, Hv, hz)
                J = P.jacobian(xm, ym)
                Jc = P.jacobian(xm, c_row)
                def vp(vx, vy):
                    v = J @ np.array([vx, vy]); return float(np.linalg.norm(v)), v
                Vp_fit, vvec = vp(vx_fit, vy_fit)
                Vp_step = None
                if vx_step.get('median') is not None:
                    Vp_step = sorted(vp(vx_step[k], vy_step[k])[0] for k in ('q1', 'median', 'q3'))
                Vp_lag = vp(along_lag, 0)[0] if along_lag else None
                # crest normal speed: the crest is near image-horizontal, so its
                # advance is the range scale at its row times the row speed
                c_m = float(np.linalg.norm(Jc @ np.array([0.0, c_px]))) if c_px else None
                rng = float(P.ground(xm, ym)[0])
                ratio = (c_m / Vp_fit) if (c_m and Vp_fit) else None
                alpha = math.degrees(math.asin(min(ratio, 1))) if ratio else None
                conv[f'f{f}|{Hk}'] = dict(
                    f_px=f, H_m=round(Hv, 2), pitch_deg=round(math.degrees(P.pitch), 3),
                    front_range_m=round(rng, 1), lateral_m_per_px=round(float(abs(J[1, 0])), 4),
                    range_m_per_px_at_crest_row=round(float(abs(Jc[0, 1])), 4),
                    Vp_fit_mps=round(Vp_fit, 2),
                    Vp_step_q1_med_q3_mps=[round(v, 2) for v in Vp_step] if Vp_step else None,
                    Vp_lag_mps=round(Vp_lag, 2) if Vp_lag else None,
                    c_mps=round(c_m, 2) if c_m else None,
                    c_over_Vp=round(ratio, 3) if ratio else None,
                    alpha_deg=round(alpha, 1) if alpha is not None else None,
                    alpha_note=None if (ratio is None or ratio <= 1) else 'c > Vp at this f: no real peel angle; f too long or c is the bore not the crest')
        seqs[name] = dict(front_median_px=[xm, ym], crest_row_px=c_row, front_x_px_per_s=vx_fit,
                          front_y_px_per_s=vy_fit, front_x_stepwise=vx_step, crossshore_px_per_s=c_px,
                          alongshore_lag_px_per_s=along_lag, conversions=conv)

    pose = dict(
        source_sha256=REF_SHA, image=[W, H_IMG], principal_point=[CX, CY],
        method='horizon + focal-length-free vertical scale bars; full PnP not possible (no land control point with a fixable stage coordinate in frame)',
        horizon=hz,
        sea_surface=dict(tide_ft_mllw=4.0, tide_m_msl=round(TIDE_MSL_M, 3), sea_navd88_m=round(SEA_NAVD88, 3),
                         note='the plane the rays are intersected with; at a 4-6 deg grazing angle a 0.36 m plane error moves range by ~2.4 %'),
        fence_posts=posts, fence_post_height_m=FENCE_POST_M, H_above_fence_base_m=[round(H_fb, 2), round(H_fb_sd, 2)],
        terrace_navd88_m=TERRACE_NAVD88, terrace_above_sea_m=round(terrace_above_sea, 2),
        H_eye_from_fence_m=[round(H_eye_fence, 2), round(H_eye_fence_sd, 2)],
        sitters=dict(n=len(sit), height_m=SITTER_M, h_px_median=float(np.median([s['h_px'] for s in sit])),
                     delta_px_median=float(np.median([s['delta_px'] for s in sit])),
                     H_eye_median_m=round(H_eye_sit, 2), H_eye_iqr_m=[round(float(q1), 2), round(float(q3), 2)], sd_used=round(sit_sd, 2)),
        H_eye_m=[round(H_eye, 2), round(H_eye_sd, 2)],
        f_bracket_px=F_BRACKET,
        f_note='not solvable from this frame; central value from the lineup range, bounds from plausible surf-cam lenses',
        pitch_deg_by_f={f: round(math.degrees(Pose(f, H_eye, hz).pitch), 3) for f in F_BRACKET},
        reprojection_residual_px=None,
        reprojection_note='no control-point solve was possible, so no reprojection residual exists; the horizon line fit rms is the only geometric residual',
        sequences=seqs,
    )
    with open(a.out / 'cam_pose.json', 'w') as fh:
        json.dump(pose, fh, indent=1)
    json.dump(dict(fence_posts=FENCE_POSTS, sitters=sit, horizon_fit=hz), open(a.out / 'control_points.json', 'w'), indent=1)
    print(f"horizon y={hz['y_at_centre']:.1f} at centre, roll {hz['roll_deg']:.2f} deg, rms {hz['rms_px']:.2f} px ({hz['n_used']}/{hz['n_total']} cols)")
    print(f"H above fence base {H_fb:.2f}+-{H_fb_sd:.2f} m; terrace above sea {terrace_above_sea:.2f}; H_eye(fence) {H_eye_fence:.2f}+-{H_eye_fence_sd:.2f}")
    print(f"H_eye(sitters) {H_eye_sit:.2f} IQR {q1:.1f}-{q3:.1f} n={len(sit)}; combined H_eye {H_eye:.2f}+-{H_eye_sd:.2f} m")
    for name, s in seqs.items():
        for k in (f'f{F_BRACKET[1]}|H-2', f'f{F_BRACKET[1]}|H', f'f{F_BRACKET[1]}|H+2', f'f{F_BRACKET[0]}|H', f'f{F_BRACKET[2]}|H'):
            c = s['conversions'][k]
            print(f"{name} {k}: range {c['front_range_m']} m, Vp fit {c['Vp_fit_mps']} step {c['Vp_step_q1_med_q3_mps']} lag {c['Vp_lag_mps']} m/s; c {c['c_mps']} m/s; alpha {c['alpha_deg']}")
    print('wrote', a.out / 'cam_pose.json', a.out / 'control_points.json')
    if a.model and a.model.exists():
        plot(med, hz, kin, pose, json.load(open(a.model)), a.out / 'peel_speed_overlay.png')
        print('wrote', a.out / 'peel_speed_overlay.png')


def plot(med, hz, kin, pose, model, path):
    """One figure: (a) the two tracked fronts over the people-free median
    frame's water rows; (b) observed Vp and alpha across the focal bracket
    against the model arms. No video frame with people at scale is written."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig, (ax0, ax1, ax2) = plt.subplots(3, 1, figsize=(9, 10.5), gridspec_kw=dict(height_ratios=[1.1, 1, 1]))
    y0, y1 = 480, 860
    ax0.imshow(cv2.resize(med[y0:y1], None, fx=0.5, fy=0.5), cmap='gray', extent=[0, W, y1, y0], vmin=40, vmax=220)
    xx = np.array([0, W]); ax0.plot(xx, yh(hz, xx), color='#ffd400', lw=1, label='horizon fit')
    for name, col in (('seqA', '#ff5a36'), ('seqB', '#39c0ff')):
        tr = np.array([[t, x if x is not None else np.nan, y if y is not None else np.nan] for t, x, y, _ in kin['sequences'][name]['track']], float)
        ax0.plot(tr[:, 1], tr[:, 2], '.', ms=2.5, color=col, label=f"{name} front {kin['sequences'][name]['window_s'][0]:.0f}-{kin['sequences'][name]['window_s'][1]:.0f} s")
    ax0.set_xlim(0, W); ax0.set_ylim(y1, y0); ax0.set_ylabel('source row (px)'); ax0.set_xlabel('source column (px)')
    ax0.legend(loc='lower left', fontsize=8, framealpha=0.85)
    ax0.set_title('Surfline Pleasure Point cam, 2026-08-15 15:28 PDT: tracked peel fronts on the median frame', fontsize=10)
    fs = np.array([1300, 1500, 1800, 2100, 2500])
    H = pose['H_eye_m'][0]
    for name, col in (('seqA', '#ff5a36'), ('seqB', '#39c0ff')):
        sq = pose['sequences'][name]
        st = sq['front_x_stepwise']; sty = kin['sequences'][name]['front_y_stepwise']
        med_v, q1_v, q3_v, al = [], [], [], []
        for f in fs:
            P = Pose(int(f), H, hz)
            xm, ym = sq['front_median_px']
            J = P.jacobian(xm, ym); Jc = P.jacobian(xm, sq['crest_row_px'])
            vals = sorted(float(np.linalg.norm(J @ np.array([st[k], sty[k]]))) for k in ('q1', 'median', 'q3'))
            q1_v.append(vals[0]); med_v.append(vals[1]); q3_v.append(vals[2])
            c = float(np.linalg.norm(Jc @ np.array([0.0, sq['crossshore_px_per_s']])))
            al.append(math.degrees(math.asin(min(c / vals[1], 1))))
        ax1.fill_between(fs, q1_v, q3_v, color=col, alpha=0.25)
        ax1.plot(fs, med_v, '-o', color=col, ms=4, label=f'{name} observed Vp (stepwise median, IQR band)')
        ax2.plot(fs, al, '-o', color=col, ms=4, label=f'{name} observed alpha = asin(c/Vp)')
    arms = {(a['h0'], a['bed']): a for a in model['arms']}
    for key, ls in ((('reported', 'measured+reef'), '-'), (('buoy1.4', 'measured+reef'), '--')):
        arm = arms.get(key)
        if not arm:
            continue
        ax1.axhline(arm['stage']['Vp_mps']['median'], color='#666', ls=ls, lw=1,
                    label=f"model Vp median, H0 {arm['H0_m']} m ({arm['stage']['Vp_mps']['median']:.0f} m/s)")
        ax2.axhline(arm['stage']['alphaDeg']['median'], color='#666', ls=ls, lw=1,
                    label=f"model alpha median, H0 {arm['H0_m']} m ({arm['stage']['alphaDeg']['median']:.1f} deg)")
    ax1.axvspan(1300, 1600, color='#8c8', alpha=0.15, label='f where observed c matches sqrt(g h_b), 3.8-4.7 m/s')
    ax1.set_ylabel('Vp (m/s)'); ax1.set_ylim(0, 14); ax1.legend(fontsize=7, loc='upper left'); ax1.grid(alpha=0.3)
    ax1.set_title(f"Observed vs model peel speed; eye height {pose['H_eye_m'][0]:.1f} +- {pose['H_eye_m'][1]:.1f} m; focal length bracketed, not solved", fontsize=10)
    ax2.set_xlabel('assumed focal length f (px, 2288 px frame)'); ax2.set_ylabel('alpha (deg)'); ax2.set_ylim(0, 95)
    ax2.axvspan(1300, 1600, color='#8c8', alpha=0.15); ax2.legend(fontsize=7, loc='upper left'); ax2.grid(alpha=0.3)
    fig.tight_layout()
    fig.savefig(path, dpi=110)


if __name__ == '__main__':
    main()
