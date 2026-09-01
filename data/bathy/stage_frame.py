"""Stage-frame helpers shared by the bathymetry build scripts.

The stage frame is the local-meter frame of ../osm/pp_geometry.json: origin at
the Pleasure Point apex, x east, y north, equirectangular projection with a
spherical R and a cos(lat0) scaling on longitude. process_bathy.py (the shipped
pp_bathy.json) and build_candidate_grids.py (the candidate grids) both import
this module so the projection is written exactly once — a candidate grid that
disagreed with pp_bathy.json by a projection constant would look like a reef
feature.

Stdlib only. Every function here is pure.
"""
import json
import math
import re

R = 6371000.0


def load_origin(geo_path):
    """(lat0, lon0) of the stage origin from pp_geometry.json."""
    geo = json.load(open(geo_path))
    return geo['origin']['lat'], geo['origin']['lon'], geo


def make_projector(lat0, lon0):
    """Return (to_xy, to_latlon) for the stage frame anchored at (lat0, lon0).

    to_xy(lat, lon) -> (x, y) meters; to_latlon(x, y) -> (lat, lon). Exact
    inverses of each other under the equirectangular approximation.
    """
    coslat = math.cos(math.radians(lat0))
    k = math.radians(1) * R

    def to_xy(lat, lon):
        return ((lon - lon0) * k * coslat, (lat - lat0) * k)

    def to_latlon(x, y):
        return (lat0 + y / k, lon0 + x / (k * coslat))

    return to_xy, to_latlon


def parse_opendap_ascii(path):
    """Parse an NCEI THREDDS OPeNDAP .ascii Band1 subset.

    Returns (rows, lats, lons): rows[r][c] is the elevation at (lats[r],
    lons[c]). Fill values (-99999) are passed through untouched, as
    process_bathy.py always has; callers that care mask them.
    """
    rows, lats, lons = [], [], []
    section = None
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line.startswith('Band1.Band1['):
                section = 'grid'
                continue
            if re.match(r'^Band1\.lat($|\[)', line):
                section = 'lat'
                continue
            if re.match(r'^Band1\.lon($|\[)', line):
                section = 'lon'
                continue
            if not line or line.startswith(('Dataset', 'Grid', 'ARRAY', 'MAPS',
                                            'Float', '}', '---')):
                continue
            if section == 'grid' and line.startswith('['):
                vals = line.split(',')[1:]  # drop "[i]" row index
                rows.append([float(v) for v in vals])
            elif section == 'lat':
                lats = [float(v) for v in line.split(',')]
            elif section == 'lon':
                lons = [float(v) for v in line.split(',')]
    assert rows and lats and lons, \
        f'parse failure: {len(rows)} rows, {len(lats)} lats, {len(lons)} lons'
    assert len(rows) == len(lats) and len(rows[0]) == len(lons)
    return rows, lats, lons


class StageGrid:
    """A row-major elevation grid on the stage frame: elev[r][c] sits at
    x = x0 + c*dx, y = y0 + r*dy. This is the pp_bathy.json layout."""

    def __init__(self, x0, y0, dx, dy, rows):
        self.x0, self.y0, self.dx, self.dy = x0, y0, dx, dy
        self.rows = rows
        self.nrows = len(rows)
        self.ncols = len(rows[0])

    @classmethod
    def from_latlon_grid(cls, rows, lats, lons, to_xy):
        """Wrap a lat/lon-aligned grid (NCEI ascii) as a stage grid. The
        lat/lon lattice maps to a rectangular x/y lattice under the
        equirectangular projection, so dx/dy come from the corner posts."""
        x0, y0 = to_xy(lats[0], lons[0])
        x1, y1 = to_xy(lats[-1], lons[-1])
        dx = (x1 - x0) / (len(lons) - 1)
        dy = (y1 - y0) / (len(lats) - 1)
        return cls(x0, y0, dx, dy, rows)

    @classmethod
    def from_json(cls, path):
        d = json.load(open(path))
        return cls(d['x0'], d['y0'], d['dx'], d['dy'], d['elev'])

    def x_max(self):
        return self.x0 + (self.ncols - 1) * self.dx

    def y_max(self):
        return self.y0 + (self.nrows - 1) * self.dy

    def sample(self, x, y):
        """Bilinear elevation at stage (x, y); None outside the grid or if any
        of the four surrounding posts is missing (None / NaN)."""
        fc, fr = (x - self.x0) / self.dx, (y - self.y0) / self.dy
        if fc < 0 or fr < 0:  # int() truncates toward zero; keep the edge honest
            return None
        c, r = int(fc), int(fr)
        if not (0 <= c < self.ncols - 1 and 0 <= r < self.nrows - 1):
            return None
        tc, tr = fc - c, fr - r
        z00, z01 = self.rows[r][c], self.rows[r][c + 1]
        z10, z11 = self.rows[r + 1][c], self.rows[r + 1][c + 1]
        for z in (z00, z01, z10, z11):
            if z is None or z != z:
                return None
        return (z00 * (1 - tc) * (1 - tr) + z01 * tc * (1 - tr)
                + z10 * (1 - tc) * tr + z11 * tc * tr)
