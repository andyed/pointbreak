#!/usr/bin/env python3
"""Generate per-spot seabed patches on the stage frame for both renderers.

Companion to build_geo_profiles.py. That script fits the *planform* (the
equal-elevation contour through each OSM surf node). This one carries the
*depth*: it resamples the NCEI DEM onto each mapped spot's local stage frame so
the shader can ask "how deep is the water here" instead of "how far am I from
an authored break line".

Datum: the DEM is NAVD88. Water level is MSL + tide, and MSL - NAVD88 = 0.905 m
measured at NOAA CO-OPS station 9413450 (Monterey), the nearest station that
publishes a NAVD88 relationship — Santa Cruz (9413745) is a secondary station
and publishes none. Carried explicitly as MSL_ABOVE_NAVD88 so the ~40 km
extrapolation across Monterey Bay stays visible rather than baked into a
magic number.

Usage:
  python3 data/model/build_depth_patches.py           # write the module
  python3 data/model/build_depth_patches.py --check   # verify it is current
"""
import base64, hashlib, json, math, struct, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BATHY = ROOT / 'data/bathy/pp_bathy.json'
GEO = ROOT / 'data/model/pp_geo_profiles.js'
OUT = ROOT / 'data/model/pp_depth_patches.js'

# NOAA CO-OPS 9413450 (Monterey), metric datums, pulled 2026-08-10:
# MSL 1.893 m, NAVD88 0.988 m on the station's own staff.
MSL_ABOVE_NAVD88 = 0.905
# Same station, same pull: the tide does not roam freely. Relative to NAVD88,
# MLLW is +0.043 m and MHHW +1.669 m, so around MSL the real excursion is
# -0.862 .. +0.764 m. A slider that allowed +2 m was letting the water sit
# 1.2 m above any tide that has ever occurred here.
TIDE_MIN_M, TIDE_MAX_M = -0.862, 0.764
MLLW_ABOVE_NAVD88, MHHW_ABOVE_NAVD88 = 0.043, 1.669

# Stage patch: a bit wider than the 600x500 m playfield so the shader's
# bilinear taps and the far skirt never sample outside the patch.
# Extent doubled 2026-08-12: the old ±340 x ±290 cut ended in straight seams a
# drone frame could see (the "goofy straight lines" report). The NCEI subset on
# disk spans ~5.3 x 2.7 km in the apex frame, so the patches were using a
# sliver of data already fetched; the wave model's domain (stage bounds, reef
# windows, break march in x) is UNCHANGED — the extra terrain is scene context
# that lets the fog-out land on real layout instead of a rectangle edge.
X0, X1 = -640.0, 640.0
Z0, Z1 = -520.0, 520.0
NX, NZ = 180, 148        # ~7.2 x 7.0 m posts; the DEM itself is ~10 m, so this
                         # resamples without pretending to add resolution.

# Uint16 quantization window, metres NAVD88. 1/65535 of 60 m = 0.9 mm steps —
# far below DEM error, so quantization is not a modelling choice.
E_MIN, E_MAX = -30.0, 30.0


def load_geo_profiles():
    """Parse the generated JS module's JSON payload."""
    txt = GEO.read_text()
    start = txt.index('Object.freeze(') + len('Object.freeze(')
    end = txt.rindex(');')
    return json.loads(txt[start:end])


class Bed:
    """Bilinear sampler over the NCEI grid in local ENU metres."""

    def __init__(self, b):
        self.x0, self.y0 = b['x0'], b['y0']
        self.dx, self.dy = b['dx'], b['dy']
        self.nc, self.nr = b['ncols'], b['nrows']
        self.e = b['elev']

    def at(self, x, y):
        fc = (x - self.x0) / self.dx
        fr = (y - self.y0) / self.dy
        c = min(max(int(math.floor(fc)), 0), self.nc - 2)
        r = min(max(int(math.floor(fr)), 0), self.nr - 2)
        tc = min(max(fc - c, 0.0), 1.0)
        tr = min(max(fr - r, 0.0), 1.0)
        e = self.e
        return (e[r][c] * (1 - tc) * (1 - tr) + e[r][c + 1] * tc * (1 - tr)
                + e[r + 1][c] * (1 - tc) * tr + e[r + 1][c + 1] * tc * tr)


def build():
    bathy = json.loads(BATHY.read_text())
    geo = load_geo_profiles()
    bed = Bed(bathy)

    patches = {}
    for name, p in geo['profiles'].items():
        if not p.get('contourFit', {}).get('usable'):
            continue  # unmapped presets keep the synthetic ramp; no fake bed
        ox, oy = p['stageOriginENU']
        ax, ay = p['stageAlongENU']
        sx, sy = p['stageShoreENU']

        vals, lo, hi = [], 1e9, -1e9
        for j in range(NZ):
            z = Z0 + (Z1 - Z0) * j / (NZ - 1)
            for i in range(NX):
                x = X0 + (X1 - X0) * i / (NX - 1)
                ex = ox + x * ax + z * sx
                ey = oy + x * ay + z * sy
                v = bed.at(ex, ey)
                lo, hi = min(lo, v), max(hi, v)
                q = int(round((min(max(v, E_MIN), E_MAX) - E_MIN)
                              / (E_MAX - E_MIN) * 65535))
                vals.append(min(max(q, 0), 65535))

        # Least-squares plane through the real bed: elev = a + b*x + c*z.
        # This is the A/B counterfactual — the same overall depth scale, slope
        # and orientation with the STRUCTURE removed, so toggling it isolates
        # "shape of the reef" from "how deep and how steep it is". A hand-picked
        # ramp would confound the two.
        # SUBMERGED POSTS ONLY. Fitting over the whole patch let the cliff set
        # the plane: roughly a third of each stage frame is dry land, and its
        # rise dominated both the fitted slope and the residual. That made the
        # A/B claim ("same depth scale, mean slope and orientation, structure
        # removed") false — the counterfactual plane carried the cliff's slope,
        # so switching to it changed the beach as well as the reef, which is
        # the one thing the demo exists to hold constant. It also inflated the
        # reported reef structure ~8x (2.57 m vs 0.32 m at Second Peak).
        # ...and WINDOWED to the surf zone (2026-08-12). The patch extent was
        # doubled so the scene has real terrain out to where the fog takes over,
        # but the plane is a counterfactual for the BREAK, not for the whole
        # frame: fitting it across the extra offshore span tilted it enough that
        # Second Peak's plane stopped crossing the propagating-depth cutoff
        # inside the refraction span (tests/dispersion.test.js caught it). The
        # window below is the pre-extension cut, i.e. the domain the wave model
        # actually uses, so "same depth scale and mean slope, structure removed"
        # keeps meaning what it meant.
        FIT_X0, FIT_X1 = -340.0, 340.0
        FIT_Z0, FIT_Z1 = -280.0, 300.0
        n = 0
        sx = sz = sxx = szz = sxz = se = sxe = sze = 0.0
        for j in range(NZ):
            z = Z0 + (Z1 - Z0) * j / (NZ - 1)
            if z < FIT_Z0 or z > FIT_Z1:
                continue
            for i in range(NX):
                x = X0 + (X1 - X0) * i / (NX - 1)
                if x < FIT_X0 or x > FIT_X1:
                    continue
                e = (vals[j * NX + i] / 65535) * (E_MAX - E_MIN) + E_MIN
                if e >= MSL_ABOVE_NAVD88:
                    continue
                n += 1
                sx += x; sz += z; se += e
                sxx += x * x; szz += z * z; sxz += x * z
                sxe += x * e; sze += z * e
        # solve the 3x3 normal equations by Cramer's rule
        M = [[n, sx, sz], [sx, sxx, sxz], [sz, sxz, szz]]
        rhs = [se, sxe, sze]
        def det3(m):
            return (m[0][0]*(m[1][1]*m[2][2] - m[1][2]*m[2][1])
                    - m[0][1]*(m[1][0]*m[2][2] - m[1][2]*m[2][0])
                    + m[0][2]*(m[1][0]*m[2][1] - m[1][1]*m[2][0]))
        D = det3(M)
        def sub(col):
            return det3([[rhs[r] if c == col else M[r][c] for c in range(3)]
                         for r in range(3)])
        plane = [sub(0)/D, sub(1)/D, sub(2)/D] if abs(D) > 1e-9 else [0.0, 0.0, 0.0]
        # residual reported over the SAME window as the fit, for the same reason
        _res = [((vals[j*NX+i]/65535)*(E_MAX-E_MIN)+E_MIN
                 - (plane[0] + plane[1]*(X0+(X1-X0)*i/(NX-1))
                    + plane[2]*(Z0+(Z1-Z0)*j/(NZ-1))))
                for j in range(NZ) for i in range(NX)
                if (vals[j*NX+i]/65535)*(E_MAX-E_MIN)+E_MIN < MSL_ABOVE_NAVD88
                and FIT_X0 <= X0+(X1-X0)*i/(NX-1) <= FIT_X1
                and FIT_Z0 <= Z0+(Z1-Z0)*j/(NZ-1) <= FIT_Z1]
        rms = (sum(r*r for r in _res) / max(len(_res), 1)) ** 0.5

        raw = struct.pack('<%dH' % len(vals), *vals)
        patches[name] = {
            'elevMinM': round(lo, 2),
            'elevMaxM': round(hi, 2),
            # a + b*x + c*z, metres NAVD88 on the stage frame
            'planeFit': [round(v, 6) for v in plane],
            # how much vertical structure the plane throws away — this IS the
            # reef, quantified. Small rms means the A/B has little to show.
            # Submerged posts only; see the fit above for why.
            'planeResidualRmsM': round(rms, 2),
            'planeFitDomain': 'submerged',
            'planeFitSamples': n,
            # fraction of the patch that is dry land at MSL — a quick sanity
            # signal that the stage actually contains a shoreline
            'landFractionAtMsl': round(
                sum(1 for v in vals
                    if (v / 65535) * (E_MAX - E_MIN) + E_MIN > MSL_ABOVE_NAVD88)
                / len(vals), 4),
            'u16': base64.b64encode(raw).decode('ascii'),
        }

    return {
        'version': 1,
        'generatedFrom': {
            'bathy': 'data/bathy/pp_bathy.json',
            'bathySha256': hashlib.sha256(BATHY.read_bytes()).hexdigest(),
            'geoProfiles': 'data/model/pp_geo_profiles.js',
            'geoSha256': hashlib.sha256(GEO.read_bytes()).hexdigest(),
            'datum': 'NAVD88',
        },
        'mslAboveNavd88M': MSL_ABOVE_NAVD88,
        'tideRangeM': [TIDE_MIN_M, TIDE_MAX_M],
        'mllwAboveNavd88M': MLLW_ABOVE_NAVD88,
        'mhhwAboveNavd88M': MHHW_ABOVE_NAVD88,
        'mslSource': 'NOAA CO-OPS station 9413450 (Monterey), metric datums; '
                     'nearest station publishing a NAVD88 relationship',
        'grid': {'x0': X0, 'x1': X1, 'z0': Z0, 'z1': Z1, 'nx': NX, 'nz': NZ,
                 'elevMinM': E_MIN, 'elevMaxM': E_MAX},
        'patches': patches,
    }


def render(data):
    return (
        '// GENERATED by data/model/build_depth_patches.py; do not edit by hand.\n'
        '// NCEI seabed resampled onto each mapped spot\'s stage frame.\n'
        '// Elevation is NAVD88; water level = mslAboveNavd88M + tide.\n'
        'export const PP_DEPTH_DATA = Object.freeze(' +
        json.dumps(data, indent=2) + ');\n'
    )


def main():
    data = build()
    text = render(data)
    if '--check' in sys.argv:
        if not OUT.exists() or OUT.read_text() != text:
            print('STALE: %s does not match its sources' % OUT.name)
            return 1
        print('current: %s' % OUT)
        return 0
    OUT.write_text(text)
    print('wrote %s (%d patches, %d KB)' % (OUT.name, len(data['patches']),
                                            len(text) // 1024))
    for n, p in data['patches'].items():
        print('  %-14s elev %6.2f..%6.2f m  land@MSL %5.1f%%'
              % (n, p['elevMinM'], p['elevMaxM'], 100 * p['landFractionAtMsl']))
    return 0


if __name__ == '__main__':
    sys.exit(main())
