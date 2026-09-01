#!/usr/bin/env python3
"""Render the bathymetry-candidate comparison figure for
docs/research/BATHY_SOURCES_2026-09-01.md.

Three panels on the 3 m stage lattice, x -300..3200, y -1500..2100:
  left   NCEI 1/3" (shipped grid, bilinear onto 3 m) hillshade
  middle CUDEM 1/9" hillshade
  right  CUDEM - NCEI difference, diverging, ±2 m
with the OSM coastline and the seven canon spots overlaid, and the -2/-5/-10/
-15 m contours of each grid drawn as thin lines on its own panel.

Stdlib + numpy + Pillow; no matplotlib. Output:
  docs/figures/assets/bathy_candidates_2026-09-01.png
"""
import json
import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
BATHY = os.path.join(HERE, '..', '..', 'data', 'bathy')
sys.path.insert(0, BATHY)
from stage_frame import StageGrid, load_origin  # noqa: E402

lat0, lon0, geo = load_origin(os.path.join(BATHY, '..', 'osm', 'pp_geometry.json'))
CANON = ['Sewer Peak', 'First Peak', 'Second Peak', '38th', 'The Hook', "Shark's Cove", "Private's"]


def arr(g):
    return np.array([[np.nan if v is None else v for v in r] for r in g.rows], float)


cud = StageGrid.from_json(os.path.join(BATHY, 'pp_bathy_cudem19.json'))
ncei = StageGrid.from_json(os.path.join(BATHY, 'pp_bathy.json'))
U = arr(cud)
xs = cud.x0 + cud.dx * np.arange(cud.ncols)
ys = cud.y0 + cud.dy * np.arange(cud.nrows)
N = np.full(U.shape, np.nan)
for r, y in enumerate(ys):
    for c, x in enumerate(xs):
        v = ncei.sample(x, y)
        if v is not None:
            N[r, c] = v

SCALE = 4  # stage lattice cells per output pixel -> 12 m/px, 292 x 300 px per panel
def down(a):
    H, W = a.shape
    H2, W2 = H // SCALE, W // SCALE
    return a[:H2*SCALE, :W2*SCALE].reshape(H2, SCALE, W2, SCALE).mean(axis=(1, 3))


def hillshade(z, az=315.0, alt=45.0, cell=3.0 * SCALE):
    zz = np.where(np.isfinite(z), z, np.nanmean(z))
    gy, gx = np.gradient(zz, cell)
    slope = np.arctan(2.0 * np.hypot(gx, gy))   # 2x vertical exaggeration
    aspect = np.arctan2(-gx, gy)
    a, h = math.radians(az), math.radians(alt)
    hs = np.sin(h) * np.cos(slope) + np.cos(h) * np.sin(slope) * np.cos(a - aspect)
    return np.clip(hs, 0, 1)


def to_img(hs, z, water_tint=True):
    """Hillshade as greyscale, tinted blue below 0 and tan above."""
    g = (60 + 170 * hs)
    rgb = np.stack([g, g, g], -1)
    if water_tint:
        wet = z < 0
        rgb[..., 0] = np.where(wet, g * 0.75, g * 1.0)
        rgb[..., 1] = np.where(wet, g * 0.88, g * 0.95)
        rgb[..., 2] = np.where(wet, g * 1.05, g * 0.85)
    rgb[~np.isfinite(z)] = 30
    return Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')[::-1])  # y up


def diff_img(d, lim=2.0):
    t = np.clip(d / lim, -1, 1)
    # blue (CUDEM deeper) .. white .. red (CUDEM shallower)
    r = np.where(t > 0, 255, 255 * (1 + t))
    b = np.where(t < 0, 255, 255 * (1 - t))
    gch = 255 * (1 - np.abs(t))
    rgb = np.stack([r, gch, b], -1)
    rgb[~np.isfinite(d)] = 205   # land / no data: neutral grey
    return Image.fromarray(np.clip(rgb, 0, 255).astype('uint8')[::-1])


Ud, Nd = down(U), down(N)
D = Ud - Nd
D[(Ud >= 0) | (Nd >= 0)] = np.nan   # land in either grid: not the question
panels = [('NCEI 1/3" (shipped), bilinear to 3 m', to_img(hillshade(Nd), Nd), Nd),
          ('CUDEM 1/9" 2023v1', to_img(hillshade(Ud), Ud), Ud),
          ('CUDEM − NCEI ±2 m, red: CUDEM shallower', diff_img(D), None)]

W, H = panels[0][1].size
PAD, TOP = 12, 40
out = Image.new('RGB', (PAD + len(panels) * (W + PAD), TOP + H + 70), (250, 250, 248))
draw = ImageDraw.Draw(out)
try:
    font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 12)
    small = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 10)
except Exception:
    font = small = ImageFont.load_default()


def to_px(x, y, ox):
    px = ox + (x - cud.x0) / (cud.dx * SCALE)
    py = TOP + H - (y - cud.y0) / (cud.dy * SCALE)
    return px, py


def contours(z, level, ox, color):
    """Cheap contour: mark cells where the sign of (z - level) changes with a right/up neighbour."""
    s = np.sign(z - level)
    cx = (s[:, 1:] * s[:, :-1] < 0)
    cy = (s[1:, :] * s[:-1, :] < 0)
    rows, cols = np.where(cx)
    for r, c in zip(rows, cols):
        px, py = to_px(cud.x0 + (c + 0.5) * cud.dx * SCALE, cud.y0 + r * cud.dy * SCALE, ox)
        draw.point((px, py), fill=color)
    rows, cols = np.where(cy)
    for r, c in zip(rows, cols):
        px, py = to_px(cud.x0 + c * cud.dx * SCALE, cud.y0 + (r + 0.5) * cud.dy * SCALE, ox)
        draw.point((px, py), fill=color)


coast = np.array(geo['coast'], float)
for i, (title, img, z) in enumerate(panels):
    ox = PAD + i * (W + PAD)
    out.paste(img, (ox, TOP))
    draw.text((ox, 10), title, fill=(20, 20, 20), font=font)
    if z is not None:
        for level, col in [(-2, (255, 230, 90)), (-5, (255, 170, 60)), (-10, (255, 90, 40)), (-15, (200, 40, 120))]:
            contours(z, level, ox, col)
    pts = [to_px(x, y, ox) for x, y in coast if cud.x0 <= x <= cud.x_max() and cud.y0 <= y <= cud.y_max()]
    if len(pts) > 1:
        draw.line(pts, fill=(0, 0, 0), width=1)
    for sp in geo['spots']:
        if sp['name'] in CANON:
            px, py = to_px(sp['x'], sp['y'], ox)
            draw.ellipse((px-3, py-3, px+3, py+3), outline=(0, 0, 0), fill=(255, 255, 255))
            if i == 0:
                draw.text((px + 5, py - 6), sp['name'], fill=(0, 0, 0), font=small)
    # scale bar 500 m
    sx0, sy0 = to_px(cud.x0 + 150, cud.y0 + 120, ox)
    sx1, _ = to_px(cud.x0 + 650, cud.y0 + 120, ox)
    draw.line([(sx0, sy0), (sx1, sy0)], fill=(0, 0, 0), width=3)
    draw.text((sx0, sy0 + 4), '500 m', fill=(0, 0, 0), font=small)

legend = ('Stage frame, x east / y north, origin = PP apex. Contours: −2 (yellow), −5 (orange), −10 (red), −15 m (magenta) NAVD88, '
          'each grid\'s own. Black = OSM coastline; dots = canon spots. Hillshade 2× vertical exaggeration, light from NW. '
          '12 m/px after 4×4 block mean of the 3 m lattice.')
import textwrap
for i, line in enumerate(textwrap.wrap(legend, 165)):
    draw.text((PAD, TOP + H + 8 + 16 * i), line, fill=(40, 40, 40), font=small)
os.makedirs(os.path.join(HERE, 'assets'), exist_ok=True)
outp = os.path.join(HERE, 'assets', 'bathy_candidates_2026-09-01.png')
out.save(outp, optimize=True)
print(outp, out.size, f'{os.path.getsize(outp)/1e3:.0f} kB')
