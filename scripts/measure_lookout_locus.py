#!/usr/bin/env python3
"""Photograph -> breaking-locus ranges, and the residual against the baked line.

docs/research/LOOKOUT_LOCUS_RESIDUAL_2026-09-23.md is the write-up; this is the
instrument. The Lookout pose (SCALE_AND_BROW_2026-09-05 §0) is over-determined,
so every image row below the horizon is a known depression angle and therefore
a known range on the water plane. Four lines of trigonometry:

    f      = (H/2) / tan(vfov/2)                     pinhole focal length, px
    ray    = F + ((u - W/2)/f) R - ((v - H/2)/f) U   camera basis in ENU
    t      = -(eye - tide) / ray_up                  hit the water plane
    ground = t * ray                                 (E, N) from the eye

F is the forward axis (true heading, pitched down), R = F rotated clockwise in
the horizontal plane (right of north is east), U = R x F. This is the
right-handed frame the site actually has; the renderer's three.js embedding is
its mirror (see the doc), which is why a `#cam=lookout` capture has to be
flipped before it is overlaid.

Pose numbers are READ from model-lines.json (written by
scripts/measure_lookout_line.mjs from manifest.json + main.js LOOKOUT), never
re-typed here; the stage bases come from data/model/pp_geo_profiles.js.

Steps, in order, each printed:
  0. horizon self-check: auto-detect the sky/sea row, forward-compute the level
     row from the pose (312.9 vs 313, MEASUREMENT_LESSONS 2).
  1. whitewater: luma/saturation threshold in a fixed ROI, per-column seaward
     edge, two bands (documented in locus-annotations.json `whitewater_auto`).
  2. manual annotations (locus-annotations.json) -> range, bearing, ENU, stage.
  3. uncertainty per point: eye +-0.75 m (GPS-minus-DEM), horizon +-1 px, and
     the sea-horizon dip the solved pitch does not include (systematic).
  4. with --model: the residual, feature by feature, arm by arm; overlays.

Usage:
  python3 scripts/measure_lookout_locus.py                       # measure + residual + figures
  python3 scripts/measure_lookout_locus.py --no-model            # observation side only
  python3 scripts/measure_lookout_locus.py --renders reef=a.png,plane=b.png,measured=c.png [--no-mirror]
  python3 scripts/measure_lookout_locus.py --crops DIR            # the 2x annotation crops
"""
import argparse
import json
import math
import os
import re
import sys

import cv2
import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
ASSETS = os.path.join(ROOT, 'docs/research/assets/lookout-locus-2026-09-23')
PHOTO = os.path.join(ROOT, 'docs/research/assets/pleasure-point-2026-09-05/cliff-cam-reference.jpg')
EYE_SIGMA_M = 0.75      # manifest elevation_check gps_minus_dem_median_m
HORIZON_PX = 1.0        # +-1 px on the horizon row
EARTH_R_M = 6_371_000.0
REFRACTION_K = 0.13     # terrestrial refraction coefficient for the horizon dip


# ---------------------------------------------------------------- pose ----
def load_pose(model_path):
    """Pose from the mjs run (manifest + main.js LOOKOUT), or the same numbers
    typed once as a fallback so the observation side runs without the bake."""
    if model_path and os.path.exists(model_path):
        m = json.load(open(model_path))
        p = m['pose']
        jacks = next((e for e in m['presets'] if e['preset'] == 'jacks'), m['presets'][0])
        return dict(width=p['width'], height=p['height'], vfov_deg=p['vfovDeg'], pitch_deg=p['pitchDeg'],
                    heading_deg=p['headingDeg'], enu=p['enuM'], eye_msl=jacks['camera']['eyeMslM'],
                    tide=m['forcing']['tide'], source=os.path.relpath(model_path, ROOT)), m
    return dict(width=1280, height=960, vfov_deg=31.4, pitch_deg=5.59, heading_deg=187.3,
                enu=[817.1, 542.3], eye_msl=13.28, tide=0.316, source='fallback constants'), None


def load_profiles():
    src = open(os.path.join(ROOT, 'data/model/pp_geo_profiles.js')).read()
    body = src[src.index('Object.freeze(') + len('Object.freeze('):src.rindex(')')]
    return json.loads(body)['profiles']


class Pose:
    def __init__(self, p, eye_delta=0.0, pitch_delta_deg=0.0):
        self.W, self.H = p['width'], p['height']
        self.f = (self.H / 2) / math.tan(math.radians(p['vfov_deg'] / 2))
        self.pitch = math.radians(p['pitch_deg'] + pitch_delta_deg)
        self.heading = math.radians(p['heading_deg'])
        self.enu = p['enu']
        self.eye_above_water = p['eye_msl'] + eye_delta - p['tide']
        h, pt = self.heading, self.pitch
        self.F = np.array([math.cos(pt) * math.sin(h), math.cos(pt) * math.cos(h), -math.sin(pt)])
        self.R = np.array([math.cos(h), -math.sin(h), 0.0])
        self.U = np.array([math.sin(pt) * math.sin(h), math.sin(pt) * math.cos(h), math.cos(pt)])

    def level_row(self):
        return self.H / 2 - self.f * math.tan(self.pitch)

    def pixel_to_ground(self, u, v):
        """(u, v) -> dict(range, bearing, dE, dN) on the water plane, or None above the horizon."""
        ray = self.F + ((u - self.W / 2) / self.f) * self.R - ((v - self.H / 2) / self.f) * self.U
        if ray[2] >= -1e-9:
            return None
        t = -self.eye_above_water / ray[2]
        dE, dN = t * ray[0], t * ray[1]
        return dict(range=math.hypot(dE, dN), bearing=(math.degrees(math.atan2(dE, dN)) + 360) % 360,
                    dE=dE, dN=dN, E=self.enu[0] + dE, N=self.enu[1] + dN)

    def ground_to_pixel(self, E, N):
        d = np.array([E - self.enu[0], N - self.enu[1], -self.eye_above_water])
        cf, cr, cu = d @ self.F, d @ self.R, d @ self.U
        if cf <= 0:
            return None
        return (self.W / 2 + self.f * cr / cf, self.H / 2 - self.f * cu / cf)


def enu_to_stage(pr, E, N):
    dE, dN = E - pr['stageOriginENU'][0], N - pr['stageOriginENU'][1]
    return (dE * pr['stageAlongENU'][0] + dN * pr['stageAlongENU'][1],
            dE * pr['stageShoreENU'][0] + dN * pr['stageShoreENU'][1])


def horizon_dip_deg(eye_above_water):
    # geometric dip sqrt(2h/R), reduced by terrestrial refraction
    return math.degrees(math.sqrt(2 * eye_above_water / EARTH_R_M) * math.sqrt(1 - REFRACTION_K))


# ------------------------------------------------------------ observe ----
def detect_horizon(gray, cols=(0, 1000), rows=(280, 350)):
    prof = gray[:, cols[0]:cols[1]].mean(axis=1)
    d = prof[1:] - prof[:-1]
    r = np.arange(rows[0], rows[1])
    i = int(r[np.argmin(d[r])])
    return i, float(d[i])


def whitewater_edges(img, ann):
    """Per-column seaward-most masked row inside the ROI, split into two bands."""
    wa = ann['whitewater_auto']
    y0, y1 = wa['roi_rows']
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    luma = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    mask = np.zeros(luma.shape, bool)
    mask[y0:y1] = (luma[y0:y1] > 195) & (hsv[y0:y1, :, 1] < 60)
    # drop specks: opening with a 3x3 keeps the bands, kills lone glitter pixels
    mask = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_OPEN, np.ones((3, 3), np.uint8)).astype(bool)
    split = wa['split_row']
    bands = {'wave_b': {}, 'wave_a': {}}
    for x in range(mask.shape[1]):
        ys = np.nonzero(mask[:, x])[0]
        if ys.size == 0:
            continue
        b = ys[ys < split]
        a = ys[ys >= split]
        if b.size >= 3:
            bands['wave_b'][x] = int(b.min())
        if a.size >= 3:
            bands['wave_a'][x] = int(a.min())
    return mask, bands


# Height of the photographed feature above the water plane. The projection
# assumes the feature is ON the plane; a feature h metres above it at
# depression angle d projects h / tan(d) metres too far out (19 m per metre at
# 3 deg, 34 m per metre at 1.7 deg). A breaking crest of 1.5-2 m (a 0.9 m Hs
# set wave shoaled to its break) and the top of its foam sit ~1.0 m over still
# water, +-0.5; a rider stands mid-face; a sitting surfer's board is at the
# plane. The doc reports the +-0.5 m sensitivity alongside the pose envelope.
FEATURE_HEIGHT_M = {'crest': 1.0, 'whitewater': 1.0, 'peel_head': 1.0, 'riders': 0.5,
                    'lineup': 0.0, 'outer_dark': 0.0, 'inshore': 0.0}


def feature_height(fname):
    for k, h in FEATURE_HEIGHT_M.items():
        if fname.startswith(k):
            return h
    return 0.0


def summarize_points(pose, pts, profiles, spots=('38th',), sigma_pose=None, height_m=0.0, depth=None):
    rows = []
    for (u, v) in pts:
        g = pose.pixel_to_ground(u, v)
        if g is None:
            continue
        rec = dict(col=u, row=v, range=g['range'], bearing=g['bearing'], E=g['E'], N=g['N'])
        # height correction along the same ground ray
        dep = math.atan2(pose.eye_above_water, g['range'])
        rec['range_hc'] = g['range'] - height_m / math.tan(dep)
        scale = rec['range_hc'] / g['range']
        E_hc = pose.enu[0] + g['dE'] * scale
        N_hc = pose.enu[1] + g['dN'] * scale
        for s in spots:
            rec[f'stage_{s}'] = list(enu_to_stage(profiles[s], g['E'], g['N']))
            rec[f'stage_{s}_hc'] = list(enu_to_stage(profiles[s], E_hc, N_hc))
        if sigma_pose:
            rs = [pp.pixel_to_ground(u, v) for pp in sigma_pose['envelope']]
            rs = [r['range'] for r in rs if r]
            rec['range_lo'], rec['range_hi'] = min(rs) * scale, max(rs) * scale
            rd = sigma_pose['dip'].pixel_to_ground(u, v)
            rec['range_dip_corrected'] = rd['range'] * scale if rd else None
        if depth is not None:
            rec.update(depth.at(u, v))
        rows.append(rec)
    return rows


class DepthGrid:
    """Nearest-cell lookup into the mjs run's per-pixel DEM sample."""
    def __init__(self, grid):
        self.cols = grid['columns']
        self.cells = {(c[0], c[1]): c for c in grid['cells']}
        self.cs, self.rs = grid['colStep'], grid['rowStep']
        self.r0 = grid['rows'][0]

    def at(self, u, v):
        key = (int(round(u / self.cs) * self.cs), int(self.r0 + round((v - self.r0) / self.rs) * self.rs))
        c = self.cells.get(key)
        if not c:
            return dict(dem_depth_shipped=None, dem_depth_plane=None, h0_needed_shipped=None, h0_needed_plane=None)
        return dict(dem_depth_shipped=c[4], dem_depth_plane=c[5], h0_needed_shipped=c[6], h0_needed_plane=c[7])


def med(vals):
    vals = [v for v in vals if v is not None and math.isfinite(v)]
    return float(np.median(vals)) if vals else float('nan')


def rounded(obj, nd=2):
    """Round every float in a JSON-able structure: the asset directory has a
    size budget and a range known to +-6% does not carry 12 decimals."""
    if isinstance(obj, float):
        return None if not math.isfinite(obj) else round(obj, nd)
    if isinstance(obj, dict):
        return {k: rounded(v, nd) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [rounded(v, nd) for v in obj]
    return obj


# ------------------------------------------------------------ residual ----
def model_line_at_col(arm, col):
    """Interpolate the arm's projected (v, range, stage) at an image column over
    in-frame, non-gap stations. Returns None where the line is not in frame."""
    st = sorted((s for s in arm['stations'] if s['inFrame'] and not s['gap']), key=lambda s: s['u'])
    for a, b in zip(st, st[1:]):
        if (a['u'] - col) * (b['u'] - col) <= 0 and a['u'] != b['u']:
            t = (col - a['u']) / (b['u'] - a['u'])
            return dict(v=a['v'] + t * (b['v'] - a['v']), range=a['range'] + t * (b['range'] - a['range']),
                        x=a['x'] + t * (b['x'] - a['x']), z=a['z'] + t * (b['z'] - a['z']))
    return None


def residual_for(arm, feature_pts, spot_key):
    """Model minus photo at each photo point's column, against the
    height-corrected photo position (the model line is on the water plane)."""
    out = []
    for rec in feature_pts:
        m = model_line_at_col(arm, rec['col'])
        if m is None:
            continue
        px, pz = rec[f'stage_{spot_key}_hc']
        out.append(dict(col=rec['col'], d_range=m['range'] - rec['range_hc'], d_row=m['v'] - rec['row'],
                        d_x=m['x'] - px, d_z=m['z'] - pz, model_range=m['range'], photo_range=rec['range_hc']))
    return out


# ------------------------------------------------------------- figures ----
# BGR. Every legend colour is >= 8:1 against the (12,12,12) legend box: the
# magenta is (255,128,255) rather than (255,64,255), which sits at 6.9:1.
COL = {'wave_a': (0, 200, 255), 'wave_b': (0, 140, 255), 'lineup': (255, 220, 0), 'crest': (60, 255, 60),
       'reef': (255, 128, 255), 'plane': (0, 255, 255), 'measured': (255, 255, 255), 'horizon': (255, 255, 255)}


def draw_text(img, text, org, color=(255, 255, 255), scale=0.5, bg=(12, 12, 12)):
    (w, h), base = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, scale, 1)
    x, y = org
    cv2.rectangle(img, (x - 3, y - h - 4), (x + w + 3, y + base + 2), bg, -1)
    cv2.putText(img, text, (x, y), cv2.FONT_HERSHEY_SIMPLEX, scale, color, 1, cv2.LINE_AA)


def draw_observation(img, pose, ann, bands, horizon_row):
    cv2.line(img, (0, horizon_row), (img.shape[1], horizon_row), COL['horizon'], 1)
    for name, key in (('wave_b', 'wave_b'), ('wave_a', 'wave_a')):
        for x, y in bands[key].items():
            cv2.circle(img, (x, y), 1, COL[name], -1)
    for fname, feat in ann['features'].items():
        if feat['type'] == 'polyline' and fname.startswith('crest'):
            pts = np.array(feat['points'], np.int32)
            cv2.polylines(img, [pts], False, COL['crest'], 1, cv2.LINE_AA)
        elif fname == 'lineup_cluster':
            for (x, y) in feat['points']:
                cv2.circle(img, (x, y), 4, COL['lineup'], 1, cv2.LINE_AA)
        elif fname.startswith('riders') or fname.startswith('peel_head'):
            for (x, y) in feat['points']:
                cv2.drawMarker(img, (x, y), COL['crest'], cv2.MARKER_TILTED_CROSS, 9, 1, cv2.LINE_AA)


def draw_model(img, arm, color, dashed=False):
    st = sorted((s for s in arm['stations'] if s['inFrame'] and not s['gap']), key=lambda s: s['u'])
    pts = [(int(round(s['u'])), int(round(s['v']))) for s in st]
    for i, (a, b) in enumerate(zip(pts, pts[1:])):
        if dashed and i % 2:
            continue
        cv2.line(img, a, b, color, 2, cv2.LINE_AA)


def legend(img, lines, x=8, y=24):
    for text, color in lines:
        draw_text(img, text, (x, y), color)
        y += 20


# ---------------------------------------------------------------- main ----
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--photo', default=PHOTO)
    ap.add_argument('--annotations', default=os.path.join(ASSETS, 'locus-annotations.json'))
    ap.add_argument('--model', default=os.path.join(ASSETS, 'model-lines.json'))
    ap.add_argument('--no-model', action='store_true')
    ap.add_argument('--out-dir', default=ASSETS)
    ap.add_argument('--renders', default='', help='bed=path,... 1280x960 #cam=lookout captures to overlay')
    ap.add_argument('--no-mirror', action='store_true', help='do not flip the renders horizontally')
    ap.add_argument('--crops', default='', help='write the 2x annotation crops to this directory')
    args = ap.parse_args()

    img = cv2.imread(args.photo)
    if img is None:
        sys.exit(f'cannot read {args.photo}')
    H, W = img.shape[:2]
    ann = json.load(open(args.annotations))
    if [W, H] != ann['source_pixels']:
        sys.exit(f'photo is {W}x{H}, annotations expect {ann["source_pixels"]}')
    profiles = load_profiles()
    pose_p, model = load_pose(None if args.no_model else args.model)
    if pose_p['width'] != W or pose_p['height'] != H:
        sys.exit('pose frame size != photo')
    pose = Pose(pose_p)

    if args.crops:
        os.makedirs(args.crops, exist_ok=True)
        for name, (y0, y1, x0, x1, s) in {'horizon': (290, 345, 0, 1280, 1), 'wave_right': (340, 500, 640, 1280, 2),
                                          'wave_left': (340, 500, 0, 640, 2), 'inside': (480, 760, 0, 640, 1)}.items():
            c = cv2.resize(img[y0:y1, x0:x1], None, fx=s, fy=s, interpolation=cv2.INTER_CUBIC)
            for y in range(y0 - y0 % 20 + 20, y1, 20):
                yy = (y - y0) * s
                cv2.line(c, (0, yy), (c.shape[1], yy), (0, 0, 255), 1)
                cv2.putText(c, str(y), (2, yy - 2), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 0, 255), 1)
            for x in range(x0 - x0 % 100 + 100, x1, 100):
                xx = (x - x0) * s
                cv2.line(c, (xx, 0), (xx, c.shape[0]), (0, 255, 255), 1)
                cv2.putText(c, str(x), (xx + 2, 12), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1)
            cv2.imwrite(os.path.join(args.crops, f'crop_{name}.png'), c)
        print(f'crops -> {args.crops}')

    # 0. horizon self-check ------------------------------------------------
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(float)
    hz_row, hz_grad = detect_horizon(gray)
    level = pose.level_row()
    dip = horizon_dip_deg(pose.eye_above_water)
    print(f'pose: {pose_p["source"]}; eye {pose_p["eye_msl"]:.2f} m MSL, {pose.eye_above_water:.2f} m over the water '
          f'(tide {pose_p["tide"]:+.3f}); pitch {pose_p["pitch_deg"]} deg, vfov {pose_p["vfov_deg"]} deg, f {pose.f:.1f} px')
    print(f'horizon: detected row {hz_row} (sky->sea luma step {hz_grad:.1f}); level row from the pose {level:.1f}; '
          f'manual {ann["horizon_row_manual"]}')
    print(f'  sea-horizon dip at this eye height: {dip:.3f} deg = {dip * pose.f * math.pi / 180:.1f} px '
          f'(the solved pitch places LEVEL on the sea horizon; true level is that many px higher, so every range below is a few % long)')

    # the uncertainty poses: eye +-0.75, horizon +-1 px, and the dip correction
    px_deg = math.degrees(math.atan(HORIZON_PX / pose.f))
    envelope = [Pose(pose_p, eye_delta=de, pitch_delta_deg=dp)
                for de in (-EYE_SIGMA_M, 0, EYE_SIGMA_M) for dp in (-px_deg, 0, px_deg)]
    sigma = dict(envelope=envelope, dip=Pose(pose_p, pitch_delta_deg=dip))

    # 1. whitewater --------------------------------------------------------
    mask, bands = whitewater_edges(img, ann)
    c0, c1 = ann['whitewater_auto']['band_columns']
    depth = None
    if model is not None:
        jk = next((e for e in model['presets'] if e['preset'] == 'jacks'), None)
        if jk and jk.get('depthGrid'):
            depth = DepthGrid(jk['depthGrid'])
    obs = dict(pose=pose_p, feature_height_m=FEATURE_HEIGHT_M,
               horizon=dict(detected_row=hz_row, level_row_from_pose=level, dip_deg=dip), features={})

    def summarize(fname, role, pts, extra=None):
        rows = [p['row'] for p in pts]
        fe = dict(role=role, n=len(pts), height_m=feature_height(fname),
                  range_median=med([p['range'] for p in pts]),
                  range_hc_median=med([p['range_hc'] for p in pts]),
                  range_min=min(p['range_hc'] for p in pts), range_max=max(p['range_hc'] for p in pts),
                  range_lo=min(p['range_lo'] for p in pts), range_hi=max(p['range_hi'] for p in pts),
                  range_dip_corrected=med([p['range_dip_corrected'] for p in pts]),
                  stage_38th_median=[med([p['stage_38th_hc'][0] for p in pts]), med([p['stage_38th_hc'][1] for p in pts])],
                  dem_depth_shipped=med([p.get('dem_depth_shipped') for p in pts]),
                  dem_depth_plane=med([p.get('dem_depth_plane') for p in pts]),
                  h0_needed_shipped=med([p.get('h0_needed_shipped') for p in pts]),
                  h0_needed_plane=med([p.get('h0_needed_plane') for p in pts]),
                  rows=[min(rows), max(rows)] if rows else None, points=pts)
        if extra:
            fe.update(extra)
        obs['features'][fname] = fe

    for key in ('wave_b', 'wave_a'):
        fname = f'whitewater_edge_{key}'
        cols = [(x, y) for x, y in bands[key].items() if c0 <= x < c1]
        pts = summarize_points(pose, cols, profiles, sigma_pose=sigma, height_m=feature_height(fname), depth=depth)
        rows = [p['row'] for p in pts]
        summarize(fname, 'a: seaward edge of the whitewater band (auto)', pts,
                  dict(row_p10=float(np.percentile(rows, 10)) if rows else None,
                       row_p90=float(np.percentile(rows, 90)) if rows else None))

    # 2. manual features ---------------------------------------------------
    for fname, feat in ann['features'].items():
        if feat['type'] == 'box':
            x0, y0, x1, y1 = feat['box_xyxy']
            pts = summarize_points(pose, [(x0, y0), (x1, y0), (x0, y1), (x1, y1)], profiles, sigma_pose=sigma)
            obs['features'][fname] = dict(role=feat['role'], range_lo=min(p['range'] for p in pts),
                                          range_hi=max(p['range'] for p in pts), points=pts)
            continue
        pts = summarize_points(pose, feat['points'], profiles, sigma_pose=sigma, height_m=feature_height(fname), depth=depth)
        summarize(fname, feat['role'], pts)

    print('\nOBSERVATION (horizontal metres from the eye along the column\'s ground ray. range = on the plane; '
          'hc = feature height removed; lo/hi = eye +-0.75 m and horizon +-1 px on hc; dip = sea-horizon dip applied; '
          'stage xz in the 38th frame from hc, +z landward; DEM depth and the H0 the criterion needs there, shipped bed)')
    print(f'{"feature":26s} {"rows":>8s} {"h":>4s} {"range":>6s} {"hc":>6s} {"lo":>5s} {"hi":>5s} {"dip":>5s} '
          f'{"stg x":>6s} {"stg z":>6s} {"DEM h":>6s} {"H0need":>6s}')
    for fname, fe in obs['features'].items():
        if 'range_median' not in fe:
            print(f'{fname:26s} {"":>8s} {"":>4s} {fe["range_lo"]:6.0f}-{fe["range_hi"]:<4.0f} (box, reference only)')
            continue
        rs = f'{fe["rows"][0]}-{fe["rows"][1]}' if fe['rows'] else ''
        sx, sz = fe['stage_38th_median']
        dh = f'{fe["dem_depth_shipped"]:6.2f}' if fe['dem_depth_shipped'] == fe['dem_depth_shipped'] else f'{"":>6s}'
        hn = f'{fe["h0_needed_shipped"]:6.2f}' if fe['h0_needed_shipped'] == fe['h0_needed_shipped'] else f'{"":>6s}'
        print(f'{fname:26s} {rs:>8s} {fe["height_m"]:4.1f} {fe["range_median"]:6.0f} {fe["range_hc_median"]:6.0f} '
              f'{fe["range_lo"]:5.0f} {fe["range_hi"]:5.0f} {fe["range_dip_corrected"]:5.0f} {sx:6.0f} {sz:6.0f} {dh} {hn}')

    os.makedirs(args.out_dir, exist_ok=True)
    json.dump(rounded(obs), open(os.path.join(args.out_dir, 'locus-measured.json'), 'w'), separators=(',', ':'))

    # figure: the photograph with the observation --------------------------
    fig = img.copy()
    draw_observation(fig, pose, ann, bands, hz_row)

    # 4. residual ----------------------------------------------------------
    res = None
    if model is not None:
        jacks = next(e for e in model['presets'] if e['preset'] == 'jacks')
        res = dict(preset='jacks', spot=jacks['spot'], arms=[], takeoff_vs_lineup={})
        compare = {
            'whitewater_edge_wave_a': obs['features']['whitewater_edge_wave_a']['points'],
            'whitewater_edge_wave_b': obs['features']['whitewater_edge_wave_b']['points'],
            'crest_wave_a': obs['features']['crest_wave_a']['points'],
            'crest_wave_b': obs['features']['crest_wave_b']['points'],
            'lineup_cluster': obs['features']['lineup_cluster']['points'],
        }
        print('\nRESIDUAL, Jack\'s (38th): model line minus photo, at the photo point\'s image column. '
              'd_range in metres along the ground ray (negative = model INSIDE the photographed feature); '
              'd_z in stage metres (+ = model shoreward); d_row px (+ = model lower in frame = nearer)')
        hdr = f'{"h0 arm":10s} {"bed":9s} {"H0":>5s} | ' + ' | '.join(f'{k[:22]:>22s}' for k in compare)
        print(hdr)
        print(' ' * 28 + '| ' + ' | '.join(f'{"d_range  d_z  d_row":>22s}' for _ in compare))
        for arm in jacks['arms']:
            row = dict(h0Arm=arm['h0Arm'], H0=arm['H0'], bed=arm['bed'], features={})
            cells = []
            for k, pts in compare.items():
                r = residual_for(arm, pts, '38th')
                summ = dict(n=len(r), d_range_median=med([q['d_range'] for q in r]),
                            d_range_min=min((q['d_range'] for q in r), default=float('nan')),
                            d_range_max=max((q['d_range'] for q in r), default=float('nan')),
                            d_z_median=med([q['d_z'] for q in r]), d_x_median=med([q['d_x'] for q in r]),
                            d_row_median=med([q['d_row'] for q in r]),
                            model_range_median=med([q['model_range'] for q in r]),
                            photo_range_median=med([q['photo_range'] for q in r]))
                row['features'][k] = summ
                cells.append(f'{summ["d_range_median"]:7.0f} {summ["d_z_median"]:5.0f} {summ["d_row_median"]:6.0f}')
            res['arms'].append(row)
            print(f'{arm["h0Arm"]:10s} {arm["bed"]:9s} {arm["H0"]:5.2f} | ' + ' | '.join(f'{c:>22s}' for c in cells))
        # takeoff vs lineup
        lu = obs['features']['lineup_cluster']
        for arm in jacks['arms']:
            tk = arm['takeoff']
            res['takeoff_vs_lineup'][f'{arm["h0Arm"]}/{arm["bed"]}'] = dict(
                takeoff_range=tk['range'], takeoff_col=tk['u'], takeoff_in_frame=bool(tk['inFrame']),
                lineup_range_median=lu['range_median'], lineup_cols=[min(p['col'] for p in lu['points']), max(p['col'] for p in lu['points'])])
        tk0 = jacks['arms'][0]['takeoff']
        print(f'\nlineup: median range {lu["range_median"]:.0f} m ({lu["range_min"]:.0f}-{lu["range_max"]:.0f}), cols '
              f'{min(p["col"] for p in lu["points"])}-{max(p["col"] for p in lu["points"])}; model takeoff (stage up-point end, '
              f'x={tk0["x"]:.0f}) at {tk0["range"]:.0f} m, col {tk0["u"]:.0f} -> {"in" if tk0["inFrame"] else "OUT OF"} frame')
        json.dump(rounded(res), open(os.path.join(args.out_dir, 'residual.json'), 'w'), indent=1)

        # model lines on the photograph: raw Hs solid, the H_1/10 set-wave arm dashed
        for arm in jacks['arms']:
            if arm['h0Arm'] == 'raw':
                draw_model(fig, arm, COL[arm['bed']])
            elif arm['h0Arm'] == 'set1.27':
                draw_model(fig, arm, COL[arm['bed']], dashed=True)
        # is any Second Peak station in frame? (the manifest says no)
        sp = next((e for e in model['presets'] if e['preset'] == 'secondpeak'), None)
        if sp:
            n = sum(a['nInFrame'] for a in sp['arms'])
            print(f'secondpeak: {n} in-frame stations over all arms (manifest spots_in_frame = ["38th"])')

    legend(fig, [
        ('cliff-cam-reference.jpg 2026-09-05 11:14 PDT, #cam=lookout pose; Hs 0.90 m Tp 16.7 s tide +0.32 m', (255, 255, 255)),
        ('photo: whitewater seaward edge, wave A (near) / wave B (outer), auto', COL['wave_a']),
        ('photo: crest of the unbroken face, riders, peel heads (manual)', COL['crest']),
        ('photo: sitting lineup (manual)', COL['lineup']),
    ] + ([('model Jack\'s line, H0 = Hs 0.90 (solid) / H_1/10 = 1.15 (dashed): reef', COL['reef']),
          ('plane', COL['plane']), ('measured', COL['measured'])] if res else []))
    cv2.imwrite(os.path.join(args.out_dir, 'photo-overlay.jpg'), fig, [cv2.IMWRITE_JPEG_QUALITY, 82])
    print(f'\nwrote {os.path.join(args.out_dir, "locus-measured.json")}, photo-overlay.jpg' + (', residual.json' if res else ''))

    # render overlays ------------------------------------------------------
    if args.renders and model is not None:
        jacks = next(e for e in model['presets'] if e['preset'] == 'jacks')
        panels = []
        for spec in args.renders.split(','):
            bed, path = spec.split('=', 1)
            r = cv2.imread(path)
            if r is None:
                sys.exit(f'cannot read render {path}')
            if r.shape[:2] != (H, W):
                r = cv2.resize(r, (W, H))
            if not args.no_mirror:
                r = r[:, ::-1].copy()
            draw_observation(r, pose, ann, bands, hz_row)
            arm = next(a for a in jacks['arms'] if a['h0Arm'] == 'raw' and a['bed'] == bed)
            draw_model(r, arm, COL[bed])
            panel = cv2.resize(r, (W // 2, H // 2), interpolation=cv2.INTER_AREA)
            # legend after the downscale so the text stays readable
            legend(panel, [(f'jacks, lookout, bed={bed}; H0 0.90 T 16.7 tide +0.32'
                            + ('' if args.no_mirror else '; MIRRORED'), (255, 255, 255)),
                           (f'model line ({bed}) + photo locus', COL[bed])], x=6, y=18)
            panels.append(panel)
        strip = np.concatenate(panels, axis=1)
        cv2.imwrite(os.path.join(args.out_dir, 'render-overlay.jpg'), strip, [cv2.IMWRITE_JPEG_QUALITY, 80])
        print(f'wrote render-overlay.jpg ({len(panels)} panels)')


if __name__ == '__main__':
    main()
