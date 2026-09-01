#!/usr/bin/env python3
"""Compare the candidate bathymetry grids against pp_bathy.json on the stage frame.

Reads the pp_bathy*.json products, prints markdown tables:

  1. per-spot node elevation (NAVD88 m) at the canon spots, every grid
  2. seaward normal at the 10 m and 15 m contours, walked from each spot down
     the smoothed gradient (the MODEL.md 2.6.3 `N_ref` estimator: boxcar
     smoothing, 5 m steps, bearing of -grad z at the stopping point), with the
     walk length and the stop reason
  3. shore-normal transect from each spot: elevation at 100..400 m offshore,
     least-squares slope over 0..400 m as 1:N, distance to the -10 and -15 m
     crossings, and the steepest 10 m step in the first 600 m (a shelf edge
     shows up here; a smooth ramp does not)
  4. within 300 m of each spot on the 3 m lattice: RMS of (fine - NCEI
     bilinear), and the 2..80 m-scale roughness of each grid (RMS of the grid
     minus its own +/-40 m boxcar)
  5. contour obliquity: seaward normal at the 5 and 10 m contours minus the
     OSM coast normal at the spot

"Contour at h" means elev_NAVD88 = -h. MSL is 0.905 m above NAVD88 at CO-OPS
9413450, so a 10 m *depth below MSL* contour is elev = -9.1; the bearings move
by well under a degree between the two definitions and the doc says which one
it used. Stdlib + numpy; does not need the rasterio venv.

    python3 compare_candidates.py > /dev/stdout
"""
import json
import math
import os
import sys

import numpy as np

from stage_frame import StageGrid, load_origin

HERE = os.path.dirname(os.path.abspath(__file__))
lat0, lon0, geo = load_origin(os.path.join(HERE, '..', 'osm', 'pp_geometry.json'))
CANON = ['Sewer Peak', 'First Peak', 'Second Peak', '38th', 'The Hook', "Shark's Cove", "Private's"]
SPOTS = [s for s in geo['spots'] if s['name'] in CANON]
STEP = 5.0            # walk step, m
MAX_WALK = 3000.0     # give up beyond this
SMOOTH_M = 40.0       # +/- boxcar half-width in metres (= +/-4 posts on the 10 m grid)


def arr(g):
    return np.array([[np.nan if v is None else v for v in r] for r in g.rows], float)


class Field:
    """A stage grid as a numpy array with a NaN-aware boxcar and a sampled gradient."""

    def __init__(self, name, grid, smooth_m=SMOOTH_M):
        self.name, self.g = name, grid
        self.z = arr(grid)
        hw_c = max(1, int(round(smooth_m / grid.dx)))
        hw_r = max(1, int(round(smooth_m / abs(grid.dy))))
        self.hw = (hw_r, hw_c)
        self.zs = self.boxcar(self.z, hw_r, hw_c)

    @staticmethod
    def boxcar(z, hr, hc):
        v = np.where(np.isfinite(z), z, 0.0)
        m = np.isfinite(z).astype(float)
        def box(a):
            p = np.pad(a, ((hr + 1, hr), (hc + 1, hc)))
            cs = p.cumsum(0).cumsum(1)
            H, W = a.shape
            return (cs[2*hr+1:2*hr+1+H, 2*hc+1:2*hc+1+W] - cs[0:H, 2*hc+1:2*hc+1+W]
                    - cs[2*hr+1:2*hr+1+H, 0:W] + cs[0:H, 0:W])
        sv, sm = box(v), box(m)
        out = np.full_like(z, np.nan)
        ok = sm > 0.5 * (2*hr+1) * (2*hc+1)   # need half the window to be data
        out[ok] = sv[ok] / sm[ok]
        return out

    def _bilinear(self, a, x, y):
        g = self.g
        fc, fr = (x - g.x0) / g.dx, (y - g.y0) / g.dy
        if fc < 0 or fr < 0:
            return None
        c, r = int(fc), int(fr)
        if not (0 <= c < g.ncols - 1 and 0 <= r < g.nrows - 1):
            return None
        tc, tr = fc - c, fr - r
        q = a[r:r+2, c:c+2]
        if not np.all(np.isfinite(q)):
            return None
        return float(q[0,0]*(1-tc)*(1-tr) + q[0,1]*tc*(1-tr) + q[1,0]*(1-tc)*tr + q[1,1]*tc*tr)

    def sample(self, x, y, smoothed=False):
        return self._bilinear(self.zs if smoothed else self.z, x, y)

    def grad(self, x, y, h=None):
        """Central-difference gradient of the smoothed field, m/m, at (x, y)."""
        h = h or max(self.g.dx, abs(self.g.dy))
        zx1, zx0 = self.sample(x + h, y, True), self.sample(x - h, y, True)
        zy1, zy0 = self.sample(x, y + h, True), self.sample(x, y - h, True)
        if None in (zx1, zx0, zy1, zy0):
            return None
        return ((zx1 - zx0) / (2*h), (zy1 - zy0) / (2*h))


def bearing(dx, dy):
    """Compass bearing (deg, 0 = north, 90 = east) of the stage vector (dx, dy)."""
    return math.degrees(math.atan2(dx, dy)) % 360.0


def wrap180(a):
    return (a + 180.0) % 360.0 - 180.0


def walk(field, x, y, h):
    """Walk downhill from (x, y) in STEP m steps until elev <= -h. Returns
    (bearing of -grad at the stop, distance walked, stop reason, elev)."""
    d = 0.0
    zmin, d_at_min = float('inf'), 0.0
    while d < MAX_WALK:
        gr = field.grad(x, y)
        if gr is None:
            return None, d, 'off-grid/nodata', field.sample(x, y, True)
        gx, gy = gr
        n = math.hypot(gx, gy)
        if n < 1e-6:
            return None, d, 'flat', field.sample(x, y, True)
        ux, uy = -gx / n, -gy / n     # downhill = seaward
        z = field.sample(x, y, True)
        if z is not None and z <= -h:
            return bearing(ux, uy), d, 'ok', z
        if z is not None and z < zmin - 0.01:
            zmin, d_at_min = z, d
        elif d - d_at_min > 200:      # 200 m without getting deeper: a closed low
            return None, d, f'trapped in a low', zmin
        x, y, d = x + STEP * ux, y + STEP * uy, d + STEP
    return None, d, 'max walk', field.sample(x, y, True)


def coast_normal(sp):
    t = math.radians(sp['coast_tangent_deg'])
    return math.sin(t), -math.cos(t)     # right of tangent = seaward


def transect(field, sp, out_to=1500.0, step=10.0):
    nx, ny = coast_normal(sp)
    cx, cy = sp['x'] - nx * sp['offshore_m'], sp['y'] - ny * sp['offshore_m']  # coast point
    ds = np.arange(0, out_to + step / 2, step)
    zs = np.array([np.nan if (v := field.sample(cx + nx*d, cy + ny*d)) is None else v for d in ds])
    return ds, zs


def first_crossing(ds, zs, level):
    ok = np.isfinite(zs)
    for i in range(1, len(ds)):
        if ok[i-1] and ok[i] and zs[i-1] > level >= zs[i]:
            t = (zs[i-1] - level) / (zs[i-1] - zs[i])
            return ds[i-1] + t * (ds[i] - ds[i-1])
    return None


def fmt(v, nd=1, w=7):
    return f'{v:{w}.{nd}f}' if v is not None and v == v else f"{'—':>{w}}"


def main():
    fields = []
    for label, fn in [('NCEI 1/3" (shipped)', 'pp_bathy.json'),
                      ('NCEI 1/3" wide', 'pp_bathy_ncei13_wide.json'),
                      ('CUDEM 1/9"', 'pp_bathy_cudem19.json'),
                      ('CSMP 2 m', 'pp_bathy_csmp_aptos.json')]:
        p = os.path.join(HERE, fn)
        if os.path.exists(p):
            fields.append(Field(label, StageGrid.from_json(p)))
    names = [f.name for f in fields]

    print('## 1. Node elevation at the canon spots (m NAVD88, bilinear)\n')
    print('| Spot | u (m) | ' + ' | '.join(names) + ' |')
    print('|---|---:|' + '---:|' * len(names))
    for sp in SPOTS:
        row = [fmt(f.sample(sp['x'], sp['y']), 2) for f in fields]
        print(f"| {sp['name']} | {sp['u']:.0f} | " + ' | '.join(row) + ' |')

    for h in (10, 15):
        print(f'\n## 2. Seaward normal at the {h} m contour (elev = -{h}), contour walk, +/-{SMOOTH_M:.0f} m boxcar\n')
        print('| Spot | ' + ' | '.join(f'{n} bearing / walk m' for n in names) + ' |')
        print('|---|' + '---|' * len(names))
        summary = {n: [] for n in names}
        for sp in SPOTS:
            cells = []
            for f in fields:
                b, d, why, z = walk(f, sp['x'], sp['y'], h)
                if b is None:
                    cells.append(f'— ({why} at {d:.0f} m, z {fmt(z,1,0).strip()})')
                else:
                    cells.append(f'{b:.1f}° / {d:.0f}')
                    summary[f.name].append(b)
            print(f"| {sp['name']} | " + ' | '.join(cells) + ' |')
        print('| **range (reached)** | ' + ' | '.join(
            (f'{min(v):.1f}–{max(v):.1f}° ({len(v)}/7)' if v else '—') for v in summary.values()) + ' |')

    print('\n## 3. Shore-normal transect from the OSM coast point through each spot\n')
    print('| Spot | grid | z@100 | z@200 | z@300 | z@400 | slope 0–400 m | d(-10 m) | d(-15 m) | steepest 10 m step, 0–600 m |')
    print('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|')
    for sp in SPOTS:
        for f in fields:
            ds, zs = transect(f, sp)
            zat = {int(d): z for d, z in zip(ds, zs)}
            m = (ds <= 400) & np.isfinite(zs)
            slope = None
            if m.sum() >= 3:
                k = np.polyfit(ds[m], zs[m], 1)[0]
                slope = (1.0 / -k) if k < 0 else float('inf')
            d10, d15 = first_crossing(ds, zs, -10.0), first_crossing(ds, zs, -15.0)
            m6 = ds <= 600
            dz = np.diff(zs[m6])
            steep = np.nanmax(np.abs(dz)) if np.isfinite(dz).any() else None
            where = ds[m6][1:][np.nanargmax(np.abs(dz))] if steep is not None else None
            print(f"| {sp['name']} | {f.name} | {fmt(zat.get(100),1,0)} | {fmt(zat.get(200),1,0)} | {fmt(zat.get(300),1,0)} | {fmt(zat.get(400),1,0)} | "
                  f"{('1:%.0f' % slope) if slope else '—'} | {fmt(d10,0,0)} | {fmt(d15,0,0)} | "
                  f"{(f'{steep:.2f} m @ {where:.0f} m') if steep is not None else '—'} |")

    fine = [f for f in fields if f.g.dx <= 3.5]
    ncei = fields[1] if len(fields) > 1 else fields[0]
    if fine:
        print(f'\n## 4. Residual and roughness within 300 m of each spot (3 m lattice)\n')
        print('Submerged cells only (both grids < 0), so the cliffs do not count as reef texture.\n')
        print('| Spot | grid | n cells | RMS(grid − NCEI bilinear) | p95 abs | roughness RMS (grid − own ±40 m boxcar) | NCEI roughness on same cells |')
        print('|---|---|---:|---:|---:|---:|---:|')
        base = fine[0].g
        xs = base.x0 + base.dx * np.arange(base.ncols)
        ys = base.y0 + base.dy * np.arange(base.nrows)
        X, Y = np.meshgrid(xs, ys)
        # NCEI bilinear onto the fine lattice, once
        N = np.full(X.shape, np.nan)
        for r in range(X.shape[0]):
            for c in range(X.shape[1]):
                v = ncei.sample(X[r, c], Y[r, c])
                if v is not None:
                    N[r, c] = v
        Nf = Field('ncei-on-fine', StageGrid(base.x0, base.y0, base.dx, base.dy, N.tolist()))
        for sp in SPOTS:
            disk = np.hypot(X - sp['x'], Y - sp['y']) <= 300
            for f in fine:
                m = disk & np.isfinite(f.z) & np.isfinite(N) & np.isfinite(f.zs) & np.isfinite(Nf.zs)
                m &= (f.z < 0) & (N < 0)   # submerged in both; the cliffs are not reef
                if m.sum() < 50:
                    print(f"| {sp['name']} | {f.name} | {m.sum()} | — | — | — | — |")
                    continue
                d = (f.z - N)[m]
                rough = (f.z - f.zs)[m]
                nrough = (N - Nf.zs)[m]
                print(f"| {sp['name']} | {f.name} | {m.sum()} | {np.sqrt((d**2).mean()):.2f} | {np.percentile(np.abs(d),95):.2f} | "
                      f"{np.sqrt((rough**2).mean()):.3f} | {np.sqrt((nrough**2).mean()):.3f} |")

    print('\n## 5. Contour obliquity: seaward normal at the contour minus OSM coast normal at the spot\n')
    print('| Spot | coast normal | ' + ' | '.join(f'{n} @5 m / @10 m' for n in names) + ' |')
    print('|---|---:|' + '---|' * len(names))
    for sp in SPOTS:
        nx, ny = coast_normal(sp)
        cn = bearing(nx, ny)
        cells = []
        for f in fields:
            parts = []
            for h in (5, 10):
                b, d, why, z = walk(f, sp['x'], sp['y'], h)
                parts.append('—' if b is None else f'{wrap180(b - cn):+.1f}°')
            cells.append(' / '.join(parts))
        print(f"| {sp['name']} | {cn:.1f}° | " + ' | '.join(cells) + ' |')

    # --- 6. the contour that actually sets the peel: breaking depth ---
    shipped = fields[0]
    cud = next((f for f in fields if 'CUDEM' in f.name), None)
    if cud is not None:
        print('\n## 6. Seaward normal at breaking-depth contours (elev = -2, -3 m), two smoothing widths\n')
        print('The peel is set by the contour at h_b ~ 1.5-3 m, not at 10 m. "±12 m" is ±4 posts on the 3 m')
        print('lattice (the MODEL.md recipe applied literally); "±40 m" is the same physical window as ±4 posts at 10 m.\n')
        variants = [(shipped.name + ' ±40 m', shipped),
                    (cud.name + ' ±40 m', cud),
                    (cud.name + ' ±12 m', Field(cud.name, cud.g, smooth_m=12.0))]
        print('| Spot | coast normal | ' + ' | '.join(f'{n} @2 m / @3 m' for n, _ in variants) + ' |')
        print('|---|---:|' + '---|' * len(variants))
        for sp in SPOTS:
            nx, ny = coast_normal(sp)
            cn = bearing(nx, ny)
            cells = []
            for _, f in variants:
                parts = []
                for h in (2, 3):
                    b, d, why, z = walk(f, sp['x'], sp['y'], h)
                    parts.append('—' if b is None else f'{b:.0f}° ({d:.0f} m)')
                cells.append(' / '.join(parts))
            print(f"| {sp['name']} | {cn:.0f}° | " + ' | '.join(cells) + ' |')

        # --- 7. alongshore structure at fixed distance from the coast ---
        print('\n## 7. Alongshore elevation structure at fixed offshore distance (u = 300..2100 m, 3 m steps)\n')
        print('Elevation sampled along a line parallel to the OSM coastline at the given seaward offset,')
        print('then high-passed with a ±30 m running mean along u. RMS of the high-pass is the 6–60 m-scale')
        print('alongshore texture: peaks, gullies, section boundaries. Column "range" is max−min of the raw line.\n')
        coast = np.array(geo['coast'], float)
        cu = np.array(geo['coast_u'], float)
        def coast_point(u):
            i = np.searchsorted(cu, u)
            i = min(max(i, 1), len(cu) - 1)
            t = (u - cu[i-1]) / (cu[i] - cu[i-1]) if cu[i] != cu[i-1] else 0.0
            p = coast[i-1] + t * (coast[i] - coast[i-1])
            tng = coast[i] - coast[i-1]
            tng /= np.hypot(*tng)
            return p, (tng[1], -tng[0])   # right of tangent = seaward
        us = np.arange(300, 2101, 3.0)
        print('| offset from coast | grid | n valid | RMS high-pass (m) | range (m) | mean (m) |')
        print('|---|---|---:|---:|---:|---:|')
        for off in (60, 100, 150, 250):
            for f in (shipped, cud):
                zs = []
                for u in us:
                    p, nrm = coast_point(u)
                    v = f.sample(p[0] + nrm[0]*off, p[1] + nrm[1]*off)
                    zs.append(np.nan if v is None else v)
                zs = np.array(zs)
                ok = np.isfinite(zs)
                if ok.sum() < 50:
                    print(f'| {off} m | {f.name} | {ok.sum()} | — | — | — |')
                    continue
                k = 10  # ±30 m at 3 m steps
                pad = np.pad(np.where(ok, zs, 0.0), k, mode='edge')
                padm = np.pad(ok.astype(float), k, mode='edge')
                cs, cm = np.cumsum(np.concatenate([[0], pad])), np.cumsum(np.concatenate([[0], padm]))
                sm = (cs[2*k+1:] - cs[:-2*k-1]) / np.maximum(cm[2*k+1:] - cm[:-2*k-1], 1)
                hp = (zs - sm)[ok]
                print(f'| {off} m | {f.name} | {ok.sum()} | {np.sqrt((hp**2).mean()):.3f} | {zs[ok].max()-zs[ok].min():.2f} | {zs[ok].mean():.2f} |')


if __name__ == '__main__':
    main()
