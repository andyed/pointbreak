#!/usr/bin/env python3
"""USGS OFR 2007-1270 (Storlazzi et al. 2007) -> the numbers the model can be
checked against.

The report is the only surveyed dataset under this break, and its data release
is not public (VALIDATION_PLAN.md "Ground truth status 2026-09-01"). The PDF
is. This instrument reads everything quantitative out of the PDF and puts it on
the stage frame:

  (a) the printed AWAC statistics, plus Fig. 11's monthly means / +-1 SD
      digitised from the raster;
  (b) the Fig. 9 colour-coded SWATHplus map, georeferenced from its own
      graticule ticks and colour-inverted through its own legend, sampled
      along the shore-normal through every named spot and compared with the
      two interpolants the repo ships (NCEI 1/3" 2012, CUDEM 1/9");
  (d) every statement about wave breaking patterns, verbatim, with page;
  (e) the datum / survey-geometry statements, verbatim, with page;
  (c) the timex figures (14, 15): the camera position is printed, so the
      range-per-pixel of an oblique frame at the break is computed and
      reported. No locus is digitised — see the evidence note for why.

Provenance rule: every number carries `source` = "printed" (text on page N),
"figure-raster" (read off a figure's pixels) or "derived" (arithmetic on the
above). Digitised values carry the instrument's own calibration residual.

Usage:
  python3 scripts/extract_ofr_2007_1270.py \
      --pdf qa/ofr-2007-1270/of2007-1270.pdf \
      --out docs/research/assets/ofr-2007-1270-2026-09-23
  (the PDF: curl -sL -o qa/ofr-2007-1270/of2007-1270.pdf
      https://pubs.usgs.gov/of/2007/1270/of2007-1270.pdf ; qa/ is gitignored)

Needs poppler (pdftotext, pdfimages, pdfinfo), numpy, Pillow. Stdlib otherwise.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
GEO_PATH = ROOT / 'data/osm/pp_geometry.json'
MANIFEST = ROOT / 'docs/research/assets/pleasure-point-2026-09-05/manifest.json'
NCEI_PATH = ROOT / 'data/bathy/pp_bathy.json'
CUDEM_PATH = ROOT / 'data/bathy/pp_bathy_cudem19.json'

PDF_URL = 'https://pubs.usgs.gov/of/2007/1270/of2007-1270.pdf'
DOI = '10.3133/ofr20071270'
# NOAA CO-OPS 9413450 datums, epoch 1983-2001 (build_depth_patches.py): NAVD88
# sits 0.043 m below MLLW, which is also what the report's App. 3 adds.
MLLW_ABOVE_NAVD88 = 0.043
MSL_ABOVE_NAVD88 = 0.905

# PDF page -> printed page. The body starts at PDF page 7 = printed 1.
PRINTED_OFFSET = 6

CANON = ['Sewer Peak', 'First Peak', 'Second Peak', '38th', 'The Hook',
         "Shark's Cove", "Private's"]
PROFILE_OFFSETS_M = [50, 100, 150, 200, 250, 300, 400, 500]


# ---------------------------------------------------------------- utilities
def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(cmd: list[str]) -> str:
    return subprocess.run(cmd, check=True, capture_output=True, text=True).stdout


def dms(deg: int, minutes: float, sign: int = 1) -> float:
    return sign * (deg + minutes / 60.0)


class Stage:
    """The manifest's stage projection: least-squares fit to the 12 spots."""

    def __init__(self):
        m = json.load(open(MANIFEST))['stage_projection']
        self.lat0, self.lon0 = m['origin_lat'], m['origin_lon']
        self.kx, self.ky = m['metres_per_deg_lon'], m['metres_per_deg_lat']

    def to_xy(self, lat, lon):
        return ((lon - self.lon0) * self.kx, (lat - self.lat0) * self.ky)

    def to_latlon(self, x, y):
        return (self.lat0 + y / self.ky, self.lon0 + x / self.kx)


class Grid:
    """A pp_bathy*.json grid on the stage frame; bilinear, null-aware."""

    def __init__(self, path: Path):
        d = json.load(open(path))
        self.name = path.name
        self.x0, self.y0, self.dx, self.dy = d['x0'], d['y0'], d['dx'], d['dy']
        rows = d['elev']
        self.z = np.array([[np.nan if v is None else v for v in r] for r in rows], dtype=float)
        self.nrows, self.ncols = self.z.shape
        # Orientation check against the file's own spot table.
        self.spot_elev = {s['name']: s['elev_navd88_m'] for s in d['spot_elev']}

    def at(self, x, y):
        fx = (x - self.x0) / self.dx
        fy = (y - self.y0) / self.dy
        if fx < 0 or fy < 0 or fx > self.ncols - 1 or fy > self.nrows - 1:
            return None
        i, j = int(math.floor(fx)), int(math.floor(fy))
        i = min(i, self.ncols - 2); j = min(j, self.nrows - 2)
        tx, ty = fx - i, fy - j
        q = self.z[j:j + 2, i:i + 2]
        if np.isnan(q).any():
            return None
        v = (q[0, 0] * (1 - tx) + q[0, 1] * tx) * (1 - ty) + (q[1, 0] * (1 - tx) + q[1, 1] * tx) * ty
        return float(v)


# ---------------------------------------------------------------- 1. text
def page_texts(pdf: Path) -> list[str]:
    txt = run(['pdftotext', '-layout', str(pdf), '-'])
    return txt.split('\f')


def find_page(pages: list[str], needle: str) -> int | None:
    pat = re.compile(r'\s+'.join(re.escape(w) for w in needle.split()))
    for i, p in enumerate(pages):
        if pat.search(re.sub(r'\s+', ' ', p)):
            return i + 1
    return None


def printed(pages, needle):
    p = find_page(pages, needle)
    return {'pdf_page': p, 'printed_page': (p - PRINTED_OFFSET) if p and p > PRINTED_OFFSET else None}


def extract_text_numbers(pages: list[str]) -> dict:
    """Every printed number the model can use, with the page it sits on."""
    def stmt(text, needle=None):
        return {'text': text, 'source': 'printed', **printed(pages, needle or text[:60])}

    awac = {
        'Hs_m': {'min': 0.34, 'mean': 0.92, 'sd': 0.27, 'max': 5.10,
                 **printed(pages, '0.34 m, 0.92'), 'source': 'printed',
                 'note': 'significant wave height at the AWAC, 13 m transducer depth, 8,927 hourly bursts 2006-05-19 .. 2007-06-05'},
        'Tp_s': {'min': 3.2, 'mean': 12.3, 'sd': 2.1, 'max': 23.8,
                 **printed(pages, 'wave periods during the study period were 3.2'), 'source': 'printed'},
        'Dp_deg_true': {'mean': 211.3, 'sd': 8.6, 'min': 182.7, 'max': 240.6,
                        **printed(pages, 'wave direction during the study period was 211.3'), 'source': 'printed',
                        'note': 'the report calls the printed statistic "mean wave direction"; Fig. 11 bottom panel is "Mean Wave Direction [deg]"'},
        'bursts': {'wave_bursts': 8927, 'individual_waves': '>400,000', 'current_profiles': 26794,
                   **printed(pages, 'Overall, 8,927 wave bursts'), 'source': 'printed'},
        'deployments': [
            {'n': 1, 'deployed': '2006-05-19', 'recovered': '2006-08-21', 'current': 6769, 'wave': 2255},
            {'n': 2, 'deployed': '2006-08-24', 'recovered': '2006-11-29', 'current': 6985, 'wave': 2327},
            {'n': 3, 'deployed': '2007-12-04 [sic; 2006-12-04]', 'recovered': '2007-03-12', 'current': 7059, 'wave': 2352},
            {'n': 4, 'deployed': '2007-03-14', 'recovered': '2007-06-05', 'current': 5981, 'wave': 1993},
        ],
        'deployments_source': {**printed(pages, 'TABLE 1: AWAC deployment log'), 'source': 'printed', 'note': 'Table 1'},
        'instrument': {
            'model': 'Nortek 1 MHz AWAC (S/N 2074)', 'transducer_depth_m': 13,
            'lat': dms(36, 56.907), 'lon': dms(121, 58.722, -1),
            'lat_dms': "N 36 56.907'", 'lon_dms': "W 121 58.722'",
            'position_fix': 'Garmin GPS-76 (consumer GPS)',
            'bins': 34, 'bin_size_m': 0.5, 'first_bin_above_bed_m': 1.0, 'blanking_m': 0.4,
            'wave_ensemble': '1 h, 1024 samples at 2 Hz surface tracking (8.5 min)',
            'current_ensemble': '20 min, 6 min average at 1 Hz',
            'compass_offset_deg_magnetic': -10,
            **printed(pages, 'Location Latitude: N 36'), 'source': 'printed', 'note': 'Appendix 4; Fig. 10 caption says "deployed at a depth of 13 m"; Task 2 text says "a depth of 14 m"'},
        'surf_zone_heights': None,
        'surf_zone_note': 'The report prints no surf-zone wave height. The only breaking-wave sizes are the two figure captions: "small (0.5 m) waves (08/15/2006)" (Fig. 14) and "larger (1.5 m) waves (09/20/2006)" (Fig. 15), unattributed to an instrument.',
    }

    camera = {
        'lat': dms(36, 57.407), 'lon': dms(121, 58.254, -1),
        'lat_dms': "N 36 57.407'", 'lon_dms': "W 121 58.254'",
        'position_fix': 'Garmin GPS-76 (consumer GPS)',
        'hardware': 'Erdman Video Systems C5050-PT; Olympus SP-350 still; Sony FCB-EX480A block video camera',
        'still_scenes': 9, 'still_rate': '1 per hour', 'video_scenes': 4, 'video_rate': '5 frames/s for 10 min',
        'host': 'a private residence on East Cliff Drive',
        **printed(pages, 'Location Latitude: N 36'), 'source': 'printed', 'note': 'Appendix 5 (the same printed page as the AWAC location; App. 5 is the next page)'}
    camera_p = find_page(pages, 'Erdman Video Systems')
    camera['pdf_page'] = camera_p; camera['printed_page'] = camera_p - PRINTED_OFFSET

    scenes = [
        ('p1', 'Still', 'Hook', 3027), ('p2', 'Still', '38th Avenue', 3027), ('p3', 'Still', "Jack's", 3027),
        ('p4', 'Still', 'Pleasure Point 3rd peak', 3027), ('p5', 'Still', 'Pleasure Point 1st peak', 3027),
        ('p10', 'Still', 'Hook zoom', 1326), ('p11', 'Still', '38th Avenue zoom', 1355),
        ('p20', 'Still', 'Pleasure Point 3rd peak zoom', 1355), ('p21', 'Still', 'Pleasure Point 1st peak zoom', 1398),
        ('d12', 'Still', 'Pleasure Point composite', 3443), ('d14', 'Still', 'Hook-38th Avenue composite', 3427),
        ('d38', 'Still', 'Study Area panoramic', 2878),
        ('s5', 'Video', 'Pleasure Point 1st peak', 3257), ('s18', 'Video', 'Pleasure Point 3rd peak', 3173),
        ('s23', 'Video', "38th Avenue-Jack's", 3166), ('s32', 'Video', 'Hook-38th Avenue', 3148)]
    table2 = {'rows': [{'scene': a, 'type': b, 'description': c, 'images': d} for a, b, c, d in scenes],
              'totals': {'still': 30317, 'video': 12744},
              **printed(pages, 'TABLE 2: Digital imaging system data acquisition statistics'), 'source': 'printed'}

    timex = [
        {'figure': 14, 'date_local': '2006-08-15 12:20:23', 'frames': 3003, 'rate_hz': 5.01, 'window_min': 10,
         'caption_wave_height_m': 0.5,
         'caption': 'Video camera data from a period with small (0.5 m) waves (08/15/2006). LEFT: Average of more than 3,000 images taken at 5 Hz. RIGHT: Variance of more than 3,000 images taken at 5 Hz. Note that, due to the sun angle, it is difficult to delineate the region of wave breaking and whitewater (wave bores); however, these areas are easily identifiable as white regions in the variance data.',
         'timestamp_source': 'figure-raster (burned-in header "Aug 15 06 12:20:23 3003 images averaged over 10.minutes, 5.01 frames/sec.")',
         **printed(pages, 'FIGURE 14: Video camera data from a period with small'), 'source': 'printed'},
        {'figure': 15, 'date_local': '2006-09-20 11:41:26', 'frames': 3002, 'rate_hz': 5.0, 'window_min': 10,
         'caption_wave_height_m': 1.5,
         'caption': 'Video camera data from a period with larger (1.5 m) waves (09/20/2006). LEFT: Average of more than 3,000 images taken at 5 Hz. RIGHT: Variance of more than 3,000 images taken at 5 Hz. Note the much larger regions of wave breaking and whitewater (wave bores) as compared to the period of smaller waves shown above in FIGURE 14.',
         'timestamp_source': 'figure-raster (burned-in header "Sep 20 06 11:41:26 3002 images averaged over 10.minutes, 5.0 frames/sec.")',
         **printed(pages, 'FIGURE 15: Video camera data from a period with larger'), 'source': 'printed'},
        {'figure': 13, 'date_local': '2006-08-02 15:49:17 and 15:50:05', 'type': 'two merged 8 MP stills',
         'caption': 'Two merged 8 mega-pixel digital still photographs taken of the Pleasure Point surf breaks.',
         'timestamp_source': 'figure-raster (burned-in headers "Aug 02 06 15:49:17" / "Aug 02 06 15:50:05")',
         **printed(pages, 'Two merged 8 mega-pixel digital still photographs'), 'source': 'printed'},
    ]

    breaking_statements = [stmt(t, n) for t, n in [
        ('The spatial and temporal variation in waves and their breaking patterns at the study site were documented.', 'waves and their breaking patterns at the study site were documented'),
        ('Large winter swells typically arrive from the northwest and west; however, this area also experiences un-refracted waves out of the southwest during the summer.', 'Large winter swells typically arrive from the northwest'),
        ('The Pleasure Point area in northern Monterey Bay is a complex coastal setting of sea cliffs and small pocket beaches that are influenced by a variable wave climate due to its south-facing orientation.', 'complex coastal setting of sea cliffs and small pocket beaches'),
        ('Wave breaking patterns were documented using a web-based camera system deployed at a private residence on East Cliff Drive.', 'Wave breaking patterns were documented using a web-based camera'),
        ('This video monitoring made it possible to track wave breaking patterns, rip-channel development and potentially infer rock reef and/or sand-bar location(s) under a range of wave and tide conditions.', 'track wave breaking patterns, rip-channel development'),
        ('The video monitoring makes it possible to track wave breaking patterns (FIGURE 13-15), rip channel development and potentially infer sand-bar location(s) under a range of wave conditions.', 'track wave breaking patterns (FIGURE 13-15)'),
        ('Note the much larger regions of wave breaking and whitewater (wave bores) as compared to the period of smaller waves shown above in FIGURE 14.', 'Note the much larger regions of wave breaking'),
        ('They also provide a basis for calculating potential changes to wave transformations into the shore at Pleasure Point.', 'calculating potential changes to wave transformations'),
    ]]
    breaking_negative = {
        'peel_occurrences': sum(len(re.findall(r'\bpeel', p, re.I)) for p in pages),
        'breaking_position_numbers': 0,
        'note': 'No peel angle, peel direction, peel speed, breaking position, breaker depth or surf-zone width is printed anywhere in the report. The words "peel", "breaker depth", "surf zone width" do not occur. The breaking record is the imagery itself, which the PDF reproduces only as Figs. 13-15.'}

    geometry_statements = [stmt(t, n) for t, n in [
        ('This provided broad spatial coverage from approximately 0.5 km offshore into water depths of 3-4 m; the shallower portion of the swath bathymetry thus overlapped the deeper portion of the CPS survey.', 'approximately 0.5 km offshore into water depths of 3-4 m'),
        ('In total, more than 3,242,199 soundings were acquired during this survey, extending from water depths just less 2 m to more than 21 m (FIGURE 9).', 'extending from water depths just less 2 m'),
        ('Twenty-five shore-normal and 23 shore-parallel track lines were collected (FIGURE 6). ... Data was collected into water depths less than 1 m and out into depths of more than 12 m.', 'Twenty-five shore-normal and 23 shore-parallel'),
        ('In total, more than 103,033 data points were acquired during the one day of surveying, extending from mean sea level down to water depths just less than 12 m.', 'more than 103,033 data points'),
        ('No direct vertical control was available in the study area during the survey. Instead, vertical control was established using observed water levels from the National Ocean Service (NOS, 2007) Tide Station #9413450 located in Monterey Harbor ... the maximum deviation between the reference station and Santa Cruz is approximately 10 cm at full tide range.', 'No direct vertical control was available'),
        ('These data were then entered into the SEA Swath Processor acquisition software to establish Mean Lower Low Water (MLLW) as the vertical datum of the survey.', 'establish Mean Lower Low Water (MLLW) as the vertical datum'),
        ('For reference, NAVD 88 is 0.04 cm below MLLW at the benchmark. [sic: 0.04 m; App. 3 adds 0.043 m]', 'NAVD 88 is 0.04 cm below MLLW'),
        ('added 0.043 to grid depth in order to correct for difference between MLLW and NAVD 88.', 'added 0.043 to grid depth'),
        ('In January, 2006, data were collected from the intertidal bedrock platform during a period of extremely low tides. This field effort collected data of the seacliff, beach, and intertidal reef.', 'data were collected from the intertidal bedrock platform'),
        ('Because ground-based lidar scanning can be performed with a horizontal look angle, not only is the cliff topography point density much higher that from an airborne platform, but geologic features such as sea caves and wave cut notches can also be captured.', 'sea caves and wave cut notches'),
        ('SWATHplus ... Accuracy: 0.1 m or 1% accuracy versus water depth ... Spatial Resolution: 0.2 m raw, 1.0 m processed ... Quantitative Horizontal Positional Accuracy Assessment: +-0.2 m; Quantitative Vertical Positional Accuracy Assessment: +-0.3 m', 'Accuracy: 0.1 m or 1% accuracy versus water depth'),
        ('CPS ... Quantitative Horizontal Positional Accuracy Assessment: +-0.05 m; Quantitative Vertical Positional Accuracy Assessment: +-0.15 m; reasonable variations in water temperature and salinity (not measured), however, can affect depth estimates by as much as 3% of the water depth.', 'can affect depth estimates by as much as 3%'),
        ('Survey: 10/13/2005 YD286 - 10/14/2005 YD287, 10/17/2005 YD290 - 10/19/005 YD292; Number of Lines: 97 (89 ~straight, 8 shore-parallel); Water depths: 1-22 m', 'Number of Lines: 97'),
        ('Terrestrial lidar ... Georeferenced Horizontal and Vertical Positional Accuracy Assessment: +-0.50 m; final DEM point spacing 20 cm.', 'Georeferenced Horizontal and Vertical Positional Accuracy Assessment'),
    ]]
    geometry_negative = {'note': 'No reef-crest elevation, bench elevation, seawall elevation, profile depth or slope is printed. Figs. 4, 6 and 9 are coverage maps; no cross-shore profile is drawn anywhere in the report. The only bathymetric picture with a depth scale is Fig. 9.'}

    return {'awac': awac, 'camera': camera, 'table2': table2, 'timex_figures': timex,
            'breaking_pattern_statements': breaking_statements, 'breaking_pattern_negative': breaking_negative,
            'geometry_statements': geometry_statements, 'geometry_negative': geometry_negative}


# ---------------------------------------------------------------- 2. Fig 11
def digitise_fig11(png: Path) -> dict:
    """Monthly mean +-1 SD from Fig. 11 (p. 11). Frames are black rectangles,
    the series is red; the x axis runs April 2006 .. June 2007 across the
    frame, points at monthly ticks May 2006 .. May 2007. Every geometric
    constant is detected, then asserted."""
    im = np.asarray(Image.open(png).convert('RGB')).astype(int)
    H, W, _ = im.shape
    dark = im.sum(axis=2) < 200
    # y axis: the tallest dark column
    cols = dark.sum(axis=0)
    x_axis = int(np.argmax(cols))
    # panel frames: dark rows spanning > 45 % of the width, clustered
    rows = [y for y in range(H) if dark[y].sum() > 0.45 * W]
    assert len(rows) >= 5, rows
    # panel tops: rows 7, 237/238, 468 ; bottoms: 173?, 403, 633. Find the
    # bottom of the first panel as the first x-axis row below its top with a
    # long-ish dark run.
    tops = []
    for y in rows:
        if not tops or y - tops[-1] > 30:
            tops.append(y)
    # tops now holds [7, 237, 403, 468, 633] style; separate tops/bottoms by spacing
    panels = []
    cands = sorted(set(rows))
    groups = []
    for y in cands:
        if groups and y - groups[-1][-1] <= 2:
            groups[-1].append(y)
        else:
            groups.append([y])
    lines = [float(np.mean(g)) for g in groups]
    # Expect: top1, (bottom1 may be missing), top2, bottom2, top3, bottom3
    if len(lines) == 5:
        top1, top2, bot2, top3, bot3 = lines
        h = bot2 - top2
        bot1 = top1 + h
    elif len(lines) == 6:
        top1, bot1, top2, bot2, top3, bot3 = lines
    else:
        raise AssertionError(f'unexpected frame lines {lines}')
    panels = [(top1, bot1, 2.5, 0.5, 'Hs_m'), (top2, bot2, 18.0, 8.0, 'Tp_s'), (top3, bot3, 230.0, 170.0, 'Dp_deg')]
    # right frame edge: the right end of the first panel's top frame line (the
    # right-hand frame column itself is anti-aliased below the dark threshold)
    right = int(np.where(dark[int(round(top1))])[0].max())
    assert right - x_axis > 0.8 * W, (x_axis, right)
    x_left = x_axis
    months = 14  # April 2006 .. June 2007
    dxm = (right - x_left) / months
    red = (im[:, :, 0] > 150) & (im[:, :, 1] < 110) & (im[:, :, 2] < 110)
    labels = ['2006-05', '2006-06', '2006-07', '2006-08', '2006-09', '2006-10', '2006-11', '2006-12',
              '2007-01', '2007-02', '2007-03', '2007-04', '2007-05']
    out = {'source': 'figure-raster', 'figure': 11, 'printed_page': 11,
           'method': 'red error bar column at each monthly tick; mean = bar midpoint, sd = half-span; y scaled by the panel frame (axis min at frame bottom, max at frame top)',
           'frame_px': {'x_axis': x_axis, 'x_right': right, 'month_px': round(dxm, 2), 'panels': [(round(a, 1), round(b, 1)) for a, b, *_ in panels]},
           'months': []}
    for k, label in enumerate(labels, start=1):
        xc = x_left + k * dxm
        # the error bar is the column (within +-3 px) with the largest red extent
        best = None
        for x in range(int(round(xc)) - 3, int(round(xc)) + 4):
            ys = np.where(red[:, x])[0]
            if len(ys) and (best is None or len(ys) > best[1]):
                best = (x, len(ys), ys)
        rec = {'month': label, 'x_px': best[0]}
        for top, bot, vmax, vmin, name in panels:
            ys = best[2][(best[2] >= top) & (best[2] <= bot)]
            if len(ys) < 3:
                rec[name] = None
                continue
            y_hi, y_lo = float(ys.min()), float(ys.max())     # top of bar = mean+sd
            val = lambda y: vmin + (bot - y) / (bot - top) * (vmax - vmin)
            mean = (val(y_hi) + val(y_lo)) / 2
            sd = (val(y_hi) - val(y_lo)) / 2
            rec[name] = {'mean': round(mean, 2), 'sd': round(sd, 2)}
        out['months'].append(rec)
    # digitiser precision: one pixel of the frame height
    out['px_resolution'] = {n: round((vmax - vmin) / (bot - top), 3) for top, bot, vmax, vmin, n in panels}
    means = [m['Hs_m']['mean'] for m in out['months'] if m['Hs_m']]
    out['check'] = {'mean_of_monthly_Hs_means': round(float(np.mean(means)), 3),
                    'printed_overall_mean_Hs': 0.92,
                    'note': 'not the same statistic (monthly means are unweighted by burst count) but should agree to ~0.05 m'}
    return out


# ---------------------------------------------------------------- 3. Fig 9
def georef_fig9(png: Path) -> dict:
    """Affine px->lon/lat from the graticule ticks in the bottom and right
    margins. Ticks are the short dark marks just outside the frame; labels
    were read from the 4x-upscaled raster (121 59'30"W .. 121 57'30"W at 30"
    and 36 57'30"N .. 36 56'30"N at 30")."""
    im = np.asarray(Image.open(png).convert('RGB')).astype(int)
    H, W, _ = im.shape
    lum = im.sum(axis=2) / 3
    # frame: the last column / row before the white margin
    # (the raster's outermost 1-px border is excluded: it is the figure's
    # neatline, not the map frame the ticks hang off)
    right_frame = max(x for x in range(W - 30, W - 3) if (lum[:, x] < 140).sum() > 0.8 * H)
    bottom_frame = max(y for y in range(H - 30, H - 3) if (lum[y, :] < 140).sum() > 0.8 * W)
    # bottom ticks: dark pixels in the two rows just below the frame line
    def clusters(idx):
        out = []
        for i in idx:
            if out and i - out[-1][-1] <= 2:
                out[-1].append(i)
            else:
                out.append([i])
        return [float(np.mean(c)) for c in out]
    xt = clusters(sorted(set(np.where(lum[bottom_frame + 2:bottom_frame + 4, 8:right_frame - 8] < 140)[1] + 8)))
    yt = clusters(sorted(set(np.where(lum[8:bottom_frame - 2, right_frame + 1:right_frame + 3] < 140)[0] + 8)))
    assert len(xt) == 5, xt
    assert len(yt) == 3, yt
    lons = [-(121 + (59 + 30 / 60) / 60), -(121 + 59 / 60), -(121 + (58 + 30 / 60) / 60), -(121 + 58 / 60), -(121 + (57 + 30 / 60) / 60)]
    lats = [36 + (57 + 30 / 60) / 60, 36 + 57 / 60, 36 + (56 + 30 / 60) / 60]
    bx = np.polyfit(lons, xt, 1)   # x = bx[0]*lon + bx[1]
    by = np.polyfit(lats, yt, 1)
    resx = np.max(np.abs(np.polyval(bx, lons) - xt))
    resy = np.max(np.abs(np.polyval(by, lats) - yt))
    m_per_px_x = (30 / 3600) * 111193.2 * math.cos(math.radians(36.955)) / (xt[1] - xt[0])
    m_per_px_y = (30 / 3600) * 111193.2 / (yt[1] - yt[0])
    return {'ticks_x_px': [round(v, 1) for v in xt], 'ticks_y_px': [round(v, 1) for v in yt],
            'tick_lons': lons, 'tick_lats': lats,
            'affine': {'x_of_lon': [float(bx[0]), float(bx[1])], 'y_of_lat': [float(by[0]), float(by[1])]},
            'tick_fit_residual_px': {'x': round(float(resx), 2), 'y': round(float(resy), 2)},
            'm_per_px': {'x': round(m_per_px_x, 3), 'y': round(m_per_px_y, 3)},
            'frame_px': {'right': right_frame, 'bottom': bottom_frame},
            'image_px': [W, H]}


def legend_lut(im: np.ndarray) -> dict:
    """Legend bar (x ~20-37, y ~348-479): 1 m at the top, 20 m at the bottom,
    label rows evenly spaced, so depth is linear in row. Returns hue per row."""
    H, W, _ = im.shape
    sat = im.max(axis=2) - im.min(axis=2)
    blk = sat[:, :80] > 90
    cols = [x for x in range(80) if blk[:, x].sum() > 100]
    assert cols, 'legend bar not found'
    x0, x1 = min(cols), max(cols)
    rows = [y for y in range(H) if blk[y, x0:x1 + 1].sum() > 0.7 * (x1 - x0 + 1)]
    y0, y1 = min(rows), max(rows)
    hues, depths = [], []
    for y in range(y0, y1 + 1):
        rgb = im[y, x0 + 2:x1 - 1].mean(axis=0)
        hues.append(hue_of(rgb))
        depths.append(1.0 + 19.0 * (y - y0) / (y1 - y0))
    return {'bar_px': {'x': [x0, x1], 'y': [y0, y1]}, 'hue_deg': [round(h, 1) for h in hues], 'depth_m': [round(d, 3) for d in depths],
            'note': 'legend labels 1m/3ft (top), 5m/16ft, 10m/33ft, 15m/49ft, 20m/66ft (bottom); label rows equally spaced -> linear'}


def hue_of(rgb) -> float:
    r, g, b = [float(v) / 255 for v in rgb]
    mx, mn = max(r, g, b), min(r, g, b)
    if mx - mn < 1e-6:
        return float('nan')
    if mx == r:
        h = (g - b) / (mx - mn) % 6
    elif mx == g:
        h = (b - r) / (mx - mn) + 2
    else:
        h = (r - g) / (mx - mn) + 4
    return 60.0 * h


class Fig9Depth:
    """Depth at a Fig. 9 pixel via hue, or None off the swath."""

    def __init__(self, png: Path, lut: dict, logo_box=(555, 385, 665, 445)):
        self.im = np.asarray(Image.open(png).convert('RGB')).astype(int)
        H, W, _ = self.im.shape
        sat = self.im.max(axis=2) - self.im.min(axis=2)
        self.swath = sat > 70
        x0, x1 = lut['bar_px']['x']; y0, y1 = lut['bar_px']['y']
        self.swath[y0 - 60:H, 0:110] = False            # legend + its text
        lx0, ly0, lx1, ly1 = logo_box
        self.swath[ly0:ly1, lx0:lx1] = False            # USGS logo (green)
        self.lut_h = np.array(lut['hue_deg']); self.lut_d = np.array(lut['depth_m'])
        # hue per pixel
        r, g, b = [self.im[:, :, i].astype(float) for i in range(3)]
        mx = np.maximum(np.maximum(r, g), b); mn = np.minimum(np.minimum(r, g), b)
        d = np.where(mx - mn < 1e-6, 1, mx - mn)
        h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
        self.hue = h
        # nearest legend row by circular hue distance; the ramp is monotone
        # red(0) -> magenta(300) so a plain nearest-neighbour is exact there
        self.depth = np.full((H, W), np.nan)
        ys, xs = np.where(self.swath)
        hp = self.hue[ys, xs]
        dh = np.abs((hp[:, None] - self.lut_h[None, :] + 180) % 360 - 180)
        self.depth[ys, xs] = self.lut_d[np.argmin(dh, axis=1)]

        # the map's own stretch vs the legend labels: L = a*D + b, fitted by
        # calibrate() on the sounding-backed zone; identity until then
        self.cal = None

    def at(self, x, y, win=1):
        """Raw legend reading L (metres, as the legend labels the colour)."""
        xi, yi = int(round(x)), int(round(y))
        H, W = self.depth.shape
        if xi < win or yi < win or xi >= W - win or yi >= H - win:
            return None
        q = self.depth[yi - win:yi + win + 1, xi - win:xi + win + 1]
        q = q[~np.isnan(q)]
        if len(q) < (2 * win + 1) ** 2 * 0.6:
            return None
        return float(np.median(q))

    LEGEND_MIN, LEGEND_MAX = 1.0, 20.0

    def calibrate(self, pairs, lo=10.0):
        """pairs: (legend_read L, reference depth D). Fit L = a*D + b on D >= lo,
        unclipped L. The ramp ends are then where the legend clips."""
        P = np.array([(L, D) for L, D in pairs if D >= lo and self.LEGEND_MIN + 0.05 < L < self.LEGEND_MAX - 0.1])
        a, b = np.polyfit(P[:, 1], P[:, 0], 1)
        resid = (P[:, 0] - b) / a - P[:, 1]
        self.cal = {'a': float(a), 'b': float(b), 'fit_domain_ref_depth_m': f'>= {lo}', 'n': int(len(P)),
                    'rms_after_m': round(float(np.sqrt((resid ** 2).mean())), 2),
                    'ramp_floor_m': round((self.LEGEND_MIN - b) / a, 2), 'ramp_ceiling_m': round((self.LEGEND_MAX - b) / a, 2)}
        return self.cal

    def cal_depth(self, L):
        """Calibrated depth, or a bound when the reading sits on a ramp end."""
        if L is None:
            return None, None
        if self.cal is None:
            return L, None
        a, b = self.cal['a'], self.cal['b']
        if L <= self.LEGEND_MIN + 0.05:
            return self.cal['ramp_floor_m'], 'floor'
        if L >= self.LEGEND_MAX - 0.1:
            return self.cal['ramp_ceiling_m'], 'ceiling'
        return (L - b) / a, None


def fig9_profiles(png: Path, geo: dict, stage: Stage, ncei: Grid, cudem: Grid, excerpt_dir: Path) -> dict:
    gref = georef_fig9(png)
    im = np.asarray(Image.open(png).convert('RGB')).astype(int)
    lut = legend_lut(im)
    dep = Fig9Depth(png, lut)
    ax, bx = gref['affine']['x_of_lon']; ay, by = gref['affine']['y_of_lat']

    def px_of(lat, lon):
        return (ax * lon + bx, ay * lat + by)

    def fig9_at_xy(x, y):
        lat, lon = stage.to_latlon(x, y)
        return dep.at(*px_of(lat, lon))

    coast = np.array(geo['coast']); cu = np.array(geo['coast_u'])

    def nearest_coast(px, py):
        best = None
        for i in range(len(coast) - 1):
            a, b = coast[i], coast[i + 1]
            ab = b - a; t = float(np.clip(np.dot([px - a[0], py - a[1]], ab) / max(np.dot(ab, ab), 1e-9), 0, 1))
            q = a + t * ab; d = math.hypot(px - q[0], py - q[1])
            if best is None or d < best[0]:
                best = (d, q, cu[i] + t * (cu[i + 1] - cu[i]))
        return best

    # --- calibration: digitised depth vs the NCEI interpolant over the whole
    # swath, binned by NCEI depth. Beyond ~10 m the NCEI grid rests on real
    # soundings (BATHY_SOURCES §7), so the deep bins measure the digitiser.
    cal = {}
    ys, xs = np.where(dep.swath)
    sel = (ys % 4 == 0) & (xs % 4 == 0)
    pairs = []
    for y, x in zip(ys[sel], xs[sel]):
        d9 = dep.at(x, y)
        if d9 is None:
            continue
        lon = (x - bx) / ax; lat = (y - by) / ay
        sx, sy = stage.to_xy(lat, lon)
        e = ncei.at(sx, sy)
        if e is None:
            continue
        pairs.append((d9, -e + MLLW_ABOVE_NAVD88))   # both as depth below MLLW
    pairs = np.array(pairs)
    fit = dep.calibrate(pairs, lo=10.0)
    # shallow-side consistency: the same affine refitted on 3-8 m (NCEI there
    # is interpolated, so this is a check of ramp linearity, not a calibration)
    m38 = (pairs[:, 1] >= 3) & (pairs[:, 1] < 8) & (pairs[:, 0] > 1.05)
    a38, b38 = np.polyfit(pairs[m38, 1], pairs[m38, 0], 1)
    fit['refit_3_8m_a_b'] = [round(float(a38), 3), round(float(b38), 3)]
    for lo, hi in [(0, 3), (3, 5), (5, 8), (8, 10), (10, 12), (12, 14), (14, 16), (16, 22)]:
        m = (pairs[:, 1] >= lo) & (pairs[:, 1] < hi)
        if m.sum() < 20:
            continue
        r = pairs[m, 0] - pairs[m, 1]
        unclipped = m & (pairs[:, 0] > 1.05) & (pairs[:, 0] < 19.9)
        rc = (pairs[unclipped, 0] - fit['b']) / fit['a'] - pairs[unclipped, 1]
        cal[f'{lo}-{hi} m'] = {'n': int(m.sum()), 'raw_mean_resid_m': round(float(r.mean()), 2), 'raw_rms_m': round(float(np.sqrt((r ** 2).mean())), 2),
                              'n_unclipped': int(unclipped.sum()),
                              'cal_mean_resid_m': None if unclipped.sum() < 20 else round(float(rc.mean()), 2),
                              'cal_rms_m': None if unclipped.sum() < 20 else round(float(np.sqrt((rc ** 2).mean())), 2)}
    calibration = {'n_pairs': int(len(pairs)), 'ramp_fit': fit, 'by_ncei_depth_bin': cal,
                   'residual_sign': 'fig9 - ncei, both metres below MLLW; raw = legend reading, cal = through the ramp fit',
                   'note': 'NCEI matches the CSMP 2 m soundings to 0.076 m RMS from the 10 m isobath out (BATHY_SOURCES_2026-09-01 §3), so the >= 10 m zone calibrates the digitiser; the ramp fit is then applied unchanged shoreward, where the residual is swath vs interpolant. Readings on a ramp end are bounds, not values.'}

    # --- swath inshore edge + profiles along every spot's shore normal
    profiles = []
    for s in geo['spots']:
        d, q, u = nearest_coast(s['x'], s['y'])
        n = np.array([s['x'] - q[0], s['y'] - q[1]]) / max(d, 1e-9)
        samples = []
        inshore = None
        for off in range(0, 801, 10):
            px, py = q[0] + off * n[0], q[1] + off * n[1]
            lat, lon = stage.to_latlon(px, py)
            ix, iy = px_of(lat, lon)
            L = dep.at(ix, iy)
            d9, clip = dep.cal_depth(L)
            en = ncei.at(px, py); ec = cudem.at(px, py)
            rec = {'offset_m': off, 'x': round(px, 1), 'y': round(py, 1),
                   'fig9_legend_read_m': None if L is None else round(L, 2),
                   'fig9_depth_mllw_m': None if d9 is None else round(d9, 2),
                   'fig9_clipped': clip,
                   'fig9_elev_navd88_m': None if d9 is None else round(-d9 + MLLW_ABOVE_NAVD88, 2),
                   'ncei_elev_navd88_m': None if en is None else round(en, 2),
                   'cudem19_elev_navd88_m': None if ec is None else round(ec, 2)}
            if d9 is not None and inshore is None:
                inshore = {'offset_m': off, 'fig9_depth_mllw_m': round(d9, 2), 'clipped': clip}
            samples.append(rec)
        profiles.append({'spot': s['name'], 'u_m': s['u'], 'node_xy': [s['x'], s['y']],
                         'coast_origin_xy': [round(float(q[0]), 1), round(float(q[1]), 1)],
                         'normal_enu': [round(float(n[0]), 4), round(float(n[1]), 4)],
                         'node_offshore_m': round(float(d), 1),
                         'swath_inshore_edge': inshore, 'samples': samples})

    # --- the two printed instrument sites
    sites = {}
    for name, lat, lon, printed_depth in [('AWAC', dms(36, 56.907), dms(121, 58.722, -1), 13.0)]:
        x, y = stage.to_xy(lat, lon)
        L = fig9_at_xy(x, y); d9, clip = dep.cal_depth(L); en = ncei.at(x, y); ec = cudem.at(x, y)
        sites[name] = {'lat': lat, 'lon': lon, 'stage_xy': [round(x, 1), round(y, 1)],
                       'printed_depth_m': printed_depth, 'printed_depth_note': 'transducer depth, App. 4; tide state not stated (+-0.9 m about MSL)',
                       'fig9_legend_read_m': None if L is None else round(L, 2),
                       'fig9_depth_mllw_m': None if d9 is None else round(d9, 2), 'fig9_clipped': clip,
                       'ncei_depth_mllw_m': None if en is None else round(-en + MLLW_ABOVE_NAVD88, 2),
                       'cudem19_depth_mllw_m': None if ec is None else round(-ec + MLLW_ABOVE_NAVD88, 2)}
    cx, cy = stage.to_xy(dms(36, 57.407), dms(121, 58.254, -1))
    sites['camera'] = {'lat': dms(36, 57.407), 'lon': dms(121, 58.254, -1), 'stage_xy': [round(cx, 1), round(cy, 1)],
                       'ground_elev_navd88_m': {'ncei': ncei.at(cx, cy), 'cudem19': cudem.at(cx, cy)},
                       'nearest_coast_m': round(float(nearest_coast(cx, cy)[0]), 1)}

    # --- verification overlay: OSM coast + spots + AWAC + profile samples on Fig. 9
    ov = Image.open(png).convert('RGB'); dr = ImageDraw.Draw(ov)
    pts = [px_of(*stage.to_latlon(x, y)) for x, y in coast]
    dr.line(pts, fill=(255, 255, 0), width=1)
    for s in geo['spots']:
        x, y = px_of(*stage.to_latlon(s['x'], s['y']))
        dr.ellipse([x - 3, y - 3, x + 3, y + 3], outline=(255, 255, 255), width=1)
    for p in profiles:
        if p['spot'] in CANON + ['Bombora']:
            a = px_of(*stage.to_latlon(*p['coast_origin_xy']))
            b = px_of(*stage.to_latlon(p['coast_origin_xy'][0] + 500 * p['normal_enu'][0], p['coast_origin_xy'][1] + 500 * p['normal_enu'][1]))
            dr.line([a, b], fill=(255, 255, 255), width=1)
    ax_, ay_ = px_of(sites['AWAC']['lat'], sites['AWAC']['lon'])
    dr.rectangle([ax_ - 3, ay_ - 3, ax_ + 3, ay_ + 3], outline=(0, 0, 0), width=2)
    ov.save(excerpt_dir / 'fig9_overlay_osm.png', optimize=True)

    return {'georeference': gref, 'legend': {'bar_px': lut['bar_px'], 'note': lut['note'], 'rows': len(lut['hue_deg'])},
            'calibration': calibration, 'sites': sites, 'profiles': profiles,
            'source': 'figure-raster', 'figure': 9, 'printed_page': 9,
            'method': 'graticule-tick affine (5 lon x 3 lat ticks), hue -> depth through the legend bar, 3x3 median, sampled along the OSM shore-normal through each spot node from the nearest coastline point'}


# ---------------------------------------------------------------- 4. timex
def timex_geometry(sites: dict, geo: dict, stage: Stage) -> dict:
    """What an oblique timex from the printed camera position can resolve.
    The Sony FCB-EX480A is an 18x block camera: HFOV 48 deg (wide) .. 2.8 deg
    (tele); the reproduced panels are ~400 x 300 px. Range resolution of a
    water-plane point at range R from a camera h above the water, one pixel
    of tilt: dR = R^2 / h * (VFOV / rows)."""
    cam = sites['camera']
    ground = cam['ground_elev_navd88_m']['cudem19'] or cam['ground_elev_navd88_m']['ncei']
    h_cam = ground - MSL_ABOVE_NAVD88 + 3.0     # eave mount, ~3 m above ground (assumed)
    cx, cy = cam['stage_xy']
    rows = []
    for s in geo['spots']:
        if s['name'] not in CANON:
            continue
        R = math.hypot(s['x'] - cx, s['y'] - cy)
        brg = (math.degrees(math.atan2(s['x'] - cx, s['y'] - cy)) + 360) % 360
        dep = math.degrees(math.atan2(h_cam, R))
        rows.append({'spot': s['name'], 'range_m': round(R, 0), 'bearing_true_deg': round(brg, 1),
                     'depression_deg': round(dep, 2),
                     'm_per_px_wide_36deg_vfov': round(R * R / h_cam * math.radians(36) / 300, 1),
                     'm_per_px_tele_10deg_vfov': round(R * R / h_cam * math.radians(10) / 300, 1)})
    return {'camera_height_above_msl_m_assumed': round(h_cam, 1), 'ground_elev_navd88_m': ground,
            'panel_px': [400, 300], 'lens': 'Sony FCB-EX480A, 18x zoom, HFOV 48-2.8 deg; zoom state per scene not printed',
            'per_spot': rows,
            'controls_available': 'none in the water plane; the horizon fixes tilt and roll given f; pan and f need >= 2 surveyed land points in frame; the OSM coastline is the bluff base, hidden from a bluff-top camera',
            'verdict': 'not digitised: at 250-650 m range the 300-row panel resolves 6-60 m per pixel cross-shore before any pose error, and no control point in the water plane is printed'}


# ---------------------------------------------------------------- conditions
IMAGE_WINDOWS = {
    'fig14': {'utc': '2006-08-15T19:20Z', 'local': '2006-08-15 12:20 PDT', 'caption_Hs_m': 0.5},
    'fig15': {'utc': '2006-09-20T18:41Z', 'local': '2006-09-20 11:41 PDT', 'caption_Hs_m': 1.5},
    'fig13': {'utc': '2006-08-02T22:49Z', 'local': '2006-08-02 15:49 PDT', 'caption_Hs_m': None},
}


def fetch_conditions() -> dict:
    """SC116 hindcast (CDIP MOP, the 15 m contour off the point) and CO-OPS
    9413450 verified water level (MSL datum) at the three image windows. The
    AWAC record itself is not public; these are the public stand-ins."""
    import calendar, urllib.request
    base = 'https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_alongshore/SC116_hindcast.nc.ascii?'
    T0 = 946684800  # waveTime[0] = 2000-01-01T00Z, hourly (verified 2026-09-23)
    out = {'sc116_source': base.rstrip('?'), 'coops_source': 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter (station 9413450, water_level, datum MSL, metric, gmt)', 'fetched': '2026-09-23', 'windows': {}}
    for key, w in IMAGE_WINDOWS.items():
        y, mo, d = int(w['utc'][0:4]), int(w['utc'][5:7]), int(w['utc'][8:10]); H, M = int(w['utc'][11:13]), int(w['utc'][14:16])
        t = calendar.timegm((y, mo, d, H, M, 0)); i = (t - T0) // 3600
        txt = urllib.request.urlopen(base + f'waveTime[{i}:1:{i}],waveHs[{i}:1:{i}],waveTp[{i}:1:{i}],waveDp[{i}:1:{i}],waveTa[{i}:1:{i}]', timeout=120).read().decode()
        vals = {k: float(re.search(k + r'\[1\]\s*\n\s*([-\d.]+)', txt).group(1)) for k in ['waveHs', 'waveTp', 'waveDp', 'waveTa']}
        vals['waveTime'] = int(re.search(r'waveTime\[1\]\s*\n\s*(\d+)', txt).group(1))
        b = f'{y:04d}{mo:02d}{d:02d} {H:02d}:{(M // 6) * 6:02d}'
        url = f"https://api.tidesandcurrents.noaa.gov/api/prod/datagetter?begin_date={b.replace(' ', '%20')}&end_date={b.replace(' ', '%20')}&station=9413450&product=water_level&datum=MSL&units=metric&time_zone=gmt&format=json"
        tide = json.load(urllib.request.urlopen(url, timeout=60))['data'][0]
        out['windows'][key] = {**w, 'sc116': vals, 'sc116_index': i,
                               'tide_msl_m': float(tide['v']), 'tide_time_utc': tide['t'], 'tide_quality': tide['q']}
    return out


# ---------------------------------------------------------------- main
def markdown_tables(ex: dict, f11: dict, f9: dict, tg: dict) -> str:
    L = []
    L.append('### (a) AWAC, printed (p. 10-11)\n')
    L.append('| statistic | min | mean | sd | max |\n|---|---:|---:|---:|---:|')
    a = ex['awac']
    L.append(f"| Hs (m) | {a['Hs_m']['min']} | {a['Hs_m']['mean']} | {a['Hs_m']['sd']} | {a['Hs_m']['max']} |")
    L.append(f"| Tp (s) | {a['Tp_s']['min']} | {a['Tp_s']['mean']} | {a['Tp_s']['sd']} | {a['Tp_s']['max']} |")
    L.append(f"| Dp (deg true) | {a['Dp_deg_true']['min']} | {a['Dp_deg_true']['mean']} | {a['Dp_deg_true']['sd']} | {a['Dp_deg_true']['max']} |")
    L.append('\n### (a) Fig. 11 monthly means +- 1 SD, digitised (p. 11)\n')
    L.append('| month | Hs (m) | Tp (s) | Dp (deg) |\n|---|---:|---:|---:|')
    for m in f11['months']:
        f = lambda k: '-' if not m[k] else f"{m[k]['mean']:.2f} +- {m[k]['sd']:.2f}"
        L.append(f"| {m['month']} | {f('Hs_m')} | {f('Tp_s')} | {f('Dp_deg')} |")
    r = f11['px_resolution']
    L.append(f"\nOne pixel = {r['Hs_m']} m / {r['Tp_s']} s / {r['Dp_deg']} deg. Mean of monthly Hs means {f11['check']['mean_of_monthly_Hs_means']} vs printed 0.92.\n")
    L.append('### (b) Fig. 9 digitiser against the NCEI 1/3" grid (depth below MLLW)\n')
    rf = f9['calibration']['ramp_fit']
    L.append(f"Ramp fit on NCEI >= 10 m (n={rf['n']}): legend L = {rf['a']:.3f} D + {rf['b']:+.2f}; RMS after {rf['rms_after_m']} m; ramp floor {rf['ramp_floor_m']} m, ceiling {rf['ramp_ceiling_m']} m; refit on 3-8 m gives a, b = {rf['refit_3_8m_a_b']}.\n")
    L.append('| NCEI depth bin | n | raw mean(fig9-NCEI) | raw RMS | n unclipped | cal mean | cal RMS |\n|---|---:|---:|---:|---:|---:|---:|')
    for k, v in f9['calibration']['by_ncei_depth_bin'].items():
        f = lambda x: '-' if x is None else f'{x:+.2f}'
        g = lambda x: '-' if x is None else f'{x:.2f}'
        L.append(f"| {k} | {v['n']} | {v['raw_mean_resid_m']:+.2f} | {v['raw_rms_m']:.2f} | {v['n_unclipped']} | {f(v['cal_mean_resid_m'])} | {g(v['cal_rms_m'])} |")
    L.append('\n### (b) Depth along the shore-normal through each spot: Fig. 9 swath vs the two interpolants (m NAVD88; Fig. 9 = -depth + 0.043)\n')
    L.append('| spot | swath begins (m from coast) | ' + ' | '.join(f'{o} m' for o in PROFILE_OFFSETS_M) + ' |')
    L.append('|---|---:|' + '|'.join(['---:'] * len(PROFILE_OFFSETS_M)) + '|')
    for p in f9['profiles']:
        if p['spot'] not in CANON + ['Bombora']:
            continue
        by = {s['offset_m']: s for s in p['samples']}
        cells = []
        for o in PROFILE_OFFSETS_M:
            s = by[o]
            f = lambda v: '-' if v is None else f'{v:+.1f}'
            f9c = f(s['fig9_elev_navd88_m'])
            if s['fig9_clipped'] == 'floor':
                f9c = '>=' + f9c
            elif s['fig9_clipped'] == 'ceiling':
                f9c = '<=' + f9c
            cells.append(f"{f9c} / {f(s['ncei_elev_navd88_m'])} / {f(s['cudem19_elev_navd88_m'])}")
        edge = p['swath_inshore_edge']
        L.append(f"| {p['spot']} | {'-' if not edge else str(edge['offset_m']) + ' (h ' + ('<= ' if edge['clipped'] == 'floor' else '') + str(edge['fig9_depth_mllw_m']) + ')'} | " + ' | '.join(cells) + ' |')
    L.append('\nCell = Fig. 9 (calibrated) / NCEI 2012 / CUDEM 1/9". "-" = off the swath (Fig. 9) or a null cell; ">=" = reading on the ramp floor (the bed is that shallow or shallower).\n')
    L.append('### (b) Residuals where the swath exists: fig9 - NCEI and fig9 - CUDEM (m), per spot, offsets with data\n')
    L.append('| spot | offsets with swath | mean(fig9-NCEI) | RMS | mean(fig9-CUDEM) | RMS | closer grid |\n|---|---|---:|---:|---:|---:|---|')
    for p in f9['profiles']:
        if p['spot'] not in CANON + ['Bombora']:
            continue
        rn, rc, offs = [], [], []
        for s in p['samples']:
            if s['fig9_elev_navd88_m'] is None or s['fig9_clipped'] or s['offset_m'] > 500:
                continue
            offs.append(s['offset_m'])
            if s['ncei_elev_navd88_m'] is not None:
                rn.append(s['fig9_elev_navd88_m'] - s['ncei_elev_navd88_m'])
            if s['cudem19_elev_navd88_m'] is not None:
                rc.append(s['fig9_elev_navd88_m'] - s['cudem19_elev_navd88_m'])
        if not offs:
            L.append(f'| {p["spot"]} | none unclipped within 500 m | - | - | - | - | - |')
            continue
        rms = lambda r: math.sqrt(sum(v * v for v in r) / len(r)) if r else float('nan')
        mean = lambda r: sum(r) / len(r) if r else float('nan')
        closer = 'NCEI' if rms(rn) < rms(rc) else 'CUDEM'
        L.append(f"| {p['spot']} | {offs[0]}-{offs[-1]} m (n={len(offs)}) | {mean(rn):+.2f} | {rms(rn):.2f} | {mean(rc):+.2f} | {rms(rc):.2f} | {closer} |")
    s = f9['sites']['AWAC']
    L.append(f"\nAWAC site ({s['stage_xy'][0]}, {s['stage_xy'][1]} stage m): printed transducer depth {s['printed_depth_m']} m; Fig. 9 {s['fig9_depth_mllw_m']} m (legend read {s['fig9_legend_read_m']}); NCEI {s['ncei_depth_mllw_m']} m; CUDEM {s['cudem19_depth_mllw_m']} m (below MLLW).\n")
    L.append('### (c) Timex geometry from the printed camera position\n')
    L.append(f"Camera stage ({f9['sites']['camera']['stage_xy'][0]}, {f9['sites']['camera']['stage_xy'][1]}), ground {tg['ground_elev_navd88_m']:.1f} m NAVD88, assumed {tg['camera_height_above_msl_m_assumed']} m above MSL.\n")
    L.append('| spot | range m | bearing | depression | m/px wide | m/px tele |\n|---|---:|---:|---:|---:|---:|')
    for r in tg['per_spot']:
        L.append(f"| {r['spot']} | {r['range_m']:.0f} | {r['bearing_true_deg']} | {r['depression_deg']} | {r['m_per_px_wide_36deg_vfov']} | {r['m_per_px_tele_10deg_vfov']} |")
    return '\n'.join(L) + '\n'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--pdf', default=str(ROOT / 'qa/ofr-2007-1270/of2007-1270.pdf'))
    ap.add_argument('--out', default=str(ROOT / 'docs/research/assets/ofr-2007-1270-2026-09-23'))
    ap.add_argument('--work', default=None, help='scratch dir for pdfimages output (default: beside the PDF)')
    ap.add_argument('--conditions', action='store_true', help='also fetch SC116 + CO-OPS for the image windows (network)')
    args = ap.parse_args()
    pdf = Path(args.pdf); out = Path(args.out); out.mkdir(parents=True, exist_ok=True)
    work = Path(args.work) if args.work else pdf.parent / 'extract'
    work.mkdir(parents=True, exist_ok=True)

    info = run(['pdfinfo', str(pdf)])
    pages = page_texts(pdf)
    provenance = {'url': PDF_URL, 'doi': DOI, 'sha256': sha256(pdf), 'bytes': pdf.stat().st_size,
                  'pdf_pages': int(re.search(r'Pages:\s+(\d+)', info).group(1)),
                  'title': re.search(r'Subject:\s+(.*)', info).group(1).strip(),
                  'authors': re.search(r'Author:\s+(.*)', info).group(1).strip(),
                  'pdf_creation': re.search(r'CreationDate:\s+(.*)', info).group(1).strip(),
                  'printed_page_offset': PRINTED_OFFSET, 'fetched': '2026-09-23'}

    # figure rasters: Fig 9 is on PDF p.15, Fig 11 on p.17, Figs 13-15 on p.19
    run(['pdfimages', '-png', '-f', '15', '-l', '15', str(pdf), str(work / 'p15')])
    run(['pdfimages', '-png', '-f', '17', '-l', '17', str(pdf), str(work / 'p17')])
    run(['pdfimages', '-png', '-f', '19', '-l', '19', str(pdf), str(work / 'p19')])
    def pick(prefix, w, h):
        for p in sorted(work.glob(prefix + '-*.png')):
            if Image.open(p).size == (w, h):
                return p
        raise FileNotFoundError(f'{prefix} {w}x{h}')
    fig9 = pick('p15', 701, 527); fig11 = pick('p17', 861, 681)
    fig14 = pick('p19', 798, 299); fig15 = pick('p19', 803, 303)

    ex = extract_text_numbers(pages)
    f11 = digitise_fig11(fig11)
    stage = Stage(); geo = json.load(open(GEO_PATH))
    ncei, cudem = Grid(NCEI_PATH), Grid(CUDEM_PATH)
    # orientation check: the file's own spot table must be reproduced
    for g in (ncei, cudem):
        for s in geo['spots']:
            v = g.at(s['x'], s['y']); want = g.spot_elev.get(s['name'])
            if v is not None and want is not None:
                assert abs(v - want) < 0.06, (g.name, s['name'], v, want)
    f9 = fig9_profiles(fig9, geo, stage, ncei, cudem, out)
    tg = timex_geometry(f9['sites'], geo, stage)

    # excerpts (public-domain USGS), small
    Image.open(fig9).convert('RGB').save(out / 'fig9_swath_bathymetry_p9.jpg', quality=85, optimize=True)
    Image.open(fig11).convert('RGB').save(out / 'fig11_awac_monthly_p11.png', optimize=True)
    Image.open(fig15).convert('RGB').save(out / 'fig15_timex_variance_2006-09-20_p13.jpg', quality=85, optimize=True)
    Image.open(fig14).convert('RGB').save(out / 'fig14_timex_variance_2006-08-15_p13.jpg', quality=85, optimize=True)
    ovp = out / 'fig9_overlay_osm.png'
    Image.open(ovp).convert('RGB').save(out / 'fig9_overlay_osm.jpg', quality=85, optimize=True); ovp.unlink()

    extracted = {'provenance': provenance, 'stage_projection': json.load(open(MANIFEST))['stage_projection'],
                 'datums': {'MLLW_above_NAVD88_m': MLLW_ABOVE_NAVD88, 'MSL_above_NAVD88_m': MSL_ABOVE_NAVD88,
                            'note': 'CO-OPS 9413450 epoch 1983-2001; the report converts MLLW->NAVD88 with the same 0.043 m (App. 3)'},
                 **ex, 'fig11_monthly': f11, 'timex_geometry': tg,
                 'fig9': {k: v for k, v in f9.items() if k != 'profiles'}}
    (out / 'extracted.json').write_text(json.dumps(extracted, indent=1))
    (out / 'fig9_profiles.json').write_text(json.dumps({'provenance': provenance, 'georeference': f9['georeference'],
                                                        'calibration': f9['calibration'], 'method': f9['method'],
                                                        'elevation_datum': 'NAVD88 m; fig9_elev = -(depth below MLLW) + 0.043',
                                                        'profiles': f9['profiles']}, indent=1))
    if args.conditions:
        (out / 'conditions.json').write_text(json.dumps(fetch_conditions(), indent=1))
    md = markdown_tables(ex, f11, f9, tg)
    (out / 'tables.md').write_text(md)
    print(md)
    print('georef', json.dumps(f9['georeference']))
    print('sizes:', {p.name: p.stat().st_size for p in out.iterdir()})


if __name__ == '__main__':
    main()
