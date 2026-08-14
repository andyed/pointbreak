#!/usr/bin/env python3
"""Prototype renders behind docs/MAP_VIEW_SPEC.md — the evidence, regenerable.

The spec argues that a wide view of Pleasure Point fails at true elevation
range and works when cropped and range-clipped. This produces both renders so
that claim can be re-checked rather than taken on trust (the Gemini Spark
trial's viewer had no generator; see experiments/cliff-topography/README.md).

  --wide   9.4 km of coast, ramp mapped over the FULL DEM range. The surf band
           is 7.8% of that range, so the shore platform reads as a smear. This
           is the negative control.
  --point  ~2 km crop, underwater ramp clipped to 0-9 m depth. The platform,
           its seaward edge (the h_s the peel ceiling depends on), and the
           seven canon spots all become legible.

NOT the map view itself — no break lines, no reef-authority overlay, no
camera. A still-image prototype of the RAMP and CROP rules only, which are
the parts of the spec that needed proving.

Deps: numpy + Pillow (the only scripts in this repo that need them).

  python3 scripts/prototype_map_view.py [--wide] [--point] [--out=DIR]
"""

import json, math, os, sys

try:
    import numpy as np
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("needs numpy and Pillow:  pip install numpy pillow")

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, ".."))

MSL_ABOVE_NAVD88 = 0.905          # NOAA CO-OPS 9413450 Monterey
CANON = ["Sewer Peak", "First Peak", "Second Peak", "38th",
         "The Hook", "Shark's Cove", "Private's"]

# The crop that holds the seven canon spots with margin. Sewers (294.8, -62.7)
# to Privates (1418.0, 1014.0) is 1556 m apart — wider than the sim's
# 1280 m render patch, which is why the sim cannot frame the point.
POINT_CROP = (-150, 1900, -560, 1350)

# Ramp clips. Underwater 0-9 m spans the whole ramp: the surf band is 7.9 m of
# the DEM's 102 m relief, so mapping the full range wastes ~92% of it.
SURF_DEPTH_M, LAND_HEIGHT_M = 9.0, 22.0
SUN_AZ_DEG, SUN_ALT_DEG = 300.0, 35.0
WATERLINE_BAND_M = 0.45


def load():
    with open(os.path.join(ROOT, "data/bathy/pp_bathy.json")) as f:
        b = json.load(f)
    with open(os.path.join(ROOT, "data/osm/pp_geometry.json")) as f:
        g = json.load(f)
    return b, g


def shade(C, dx, dy, slope_gain):
    """Hillshade. slope_gain is vertical exaggeration for the SHADING only —
    the spec requires any VE be displayed, never silently baked."""
    gy, gx = np.gradient(C, dy, dx)
    slope = np.arctan(np.hypot(gx, gy) * slope_gain)
    aspect = np.arctan2(-gx, gy)
    az, alt = math.radians(SUN_AZ_DEG), math.radians(SUN_ALT_DEG)
    return np.clip(np.sin(alt) * np.cos(slope)
                   + np.cos(alt) * np.sin(slope) * np.cos(az - aspect), 0, 1)


def colorize(C, hs, depth_span, land_span):
    depth = MSL_ABOVE_NAVD88 - C
    h, w = C.shape
    img = np.zeros((h, w, 3), float)
    sea = depth > 0
    d = np.clip(depth[sea] / depth_span, 0, 1)
    img[sea, 0] = 0.04 + 0.62 * (1 - d)
    img[sea, 1] = 0.30 + 0.46 * (1 - d)
    img[sea, 2] = 0.42 + 0.26 * (1 - d)
    land = ~sea
    l = np.clip((C[land] - MSL_ABOVE_NAVD88) / land_span, 0, 1)
    img[land, 0] = 0.30 + 0.40 * l
    img[land, 1] = 0.22 + 0.28 * l
    img[land, 2] = 0.17 + 0.20 * l
    img *= (0.25 + 0.90 * hs)[:, :, None]
    img[np.abs(depth) < WATERLINE_BAND_M] = [0.90, 0.95, 0.97]
    return np.clip(img, 0, 1)


def render(b, g, crop, depth_span, land_span, slope_gain, scale, out):
    E = np.array(b["elev"], float)
    dx, dy, x0, y0 = b["dx"], b["dy"], b["x0"], b["y0"]
    if crop:
        XA, XB, YA, YB = crop
        ia, ib = int((XA - x0) / dx), int((XB - x0) / dx)
        ja, jb = int((YA - y0) / dy), int((YB - y0) / dy)
        C = E[ja:jb, ia:ib]
    else:
        XA, YA = x0, y0
        C = E
    h, w = C.shape
    img = colorize(C, shade(C, dx, dy, slope_gain), depth_span, land_span)
    im = Image.fromarray((img * 255).astype("uint8")).transpose(Image.FLIP_TOP_BOTTOM)
    im = im.resize((w * scale, h * scale), Image.LANCZOS)
    dr = ImageDraw.Draw(im)
    n = 0
    for s in g["spots"]:
        if s.get("name") not in CANON:
            continue
        px = (s["x"] - XA) / dx * scale
        py = (h - 1 - ((s["y"] - YA) / dy)) * scale
        if not (0 <= px < im.size[0] and 0 <= py < im.size[1]):
            continue
        r = 3 + scale
        dr.ellipse([px - r, py - r, px + r, py + r],
                   fill=(245, 250, 252), outline=(8, 10, 14), width=max(2, scale))
        n += 1
    im.save(out)
    print(f"  {os.path.basename(out)}  {im.size[0]}x{im.size[1]}px  "
          f"{w*dx:.0f}x{h*dy:.0f} m  {n} spots")


def main():
    args = [a for a in sys.argv[1:]]
    outdir = next((a.split("=", 1)[1] for a in args if a.startswith("--out=")), "/tmp")
    want_wide = "--wide" in args or not any(a in args for a in ("--wide", "--point"))
    want_point = "--point" in args or not any(a in args for a in ("--wide", "--point"))
    b, g = load()
    E = np.array(b["elev"], float)
    print(f"DEM {E.shape[1]}x{E.shape[0]} posts, {b['dx']*E.shape[1]:.0f}x{b['dy']*E.shape[0]:.0f} m, "
          f"relief {E.min():.1f}..{E.max():.1f} m NAVD88")
    if want_wide:
        print("negative control — full range over 9.4 km:")
        render(b, g, None, 14.0, 28.0, 4.0, 2,
               os.path.join(outdir, "map-proto-wide.png"))
    if want_point:
        print(f"the spec's rules — {POINT_CROP[1]-POINT_CROP[0]}x{POINT_CROP[3]-POINT_CROP[2]} m crop, "
              f"ramp clipped to {SURF_DEPTH_M:.0f} m depth:")
        render(b, g, POINT_CROP, SURF_DEPTH_M, LAND_HEIGHT_M, 12.0, 3,
               os.path.join(outdir, "map-proto-point.png"))


if __name__ == "__main__":
    main()
