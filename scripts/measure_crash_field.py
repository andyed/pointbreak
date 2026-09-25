#!/usr/bin/env python3
"""Field reference for the impact plume: eight frames of one lip-throw ->
plume -> whitewater event from the restored Pleasure Point clip, cropped to
the head, plus RATIOS only (pixels over pixels, frames over frames). The
camera is uncalibrated, so no metre is reported.

The event is the one FIELD_WAVE_MOTION_2026-09-15 bracketed by hand (manual
annotations: curtain between source frames 351/358, broad plume between
365/372, merged whitewater by 379). Frames 344..393 at that annotation's own
seven-frame stride span it.

Two kinds of number come out, and they are kept apart in the JSON:

  automatic — per frame, in the event's column band, the row profile of the
  90th-percentile luma (not the median: the plume is narrower than the band)
  gives the highest bright row (PLUME_LUMA) and the count of bright rows;
  the crest row is where the profile first drops into the face's dark level
  below the grey backwater. The trough is NOT read automatically: the wave
  ahead is a whitewater line, so the visible face ends at that foam boundary.

  manual — rows read off 3x ruler-gridded zooms of the same band on
  2026-09-24 (crest line, foreground-foam boundary, plume top, alongshore
  extent). These are visual annotations with about +/-3 px uncertainty, the
  way the 2026-09-15 event brackets were declared, and they are what the
  ratios in the note quote. The automatic numbers are the check on them.

Usage: python3 scripts/measure_crash_field.py <clip.mp4> [--out DIR] [--no-hash]
"""
import argparse
import hashlib
import json
import os
import sys

import cv2
import numpy as np

REF_SHA256 = "11428e3fa283bea0834c724c7a6c79d6bb6b506ae9e0885525d43ee08e962695"
FRAMES = [344, 351, 358, 365, 372, 379, 386, 393]
FPS = 30
# Head crop (source px): the center-left patch the 2026-09-15 annotation
# names, with the unbroken face to its right and the whitewater line ahead.
CROP = dict(x0=560, y0=690, x1=1060, y1=840)
# Column band of the collapsing patch, source px.
BAND = (660, 800)
# Row range searched, source px.
ROWS = (700, 830)
PLUME_LUMA = 175       # thrown/tumbling white water
FACE_DARK = 112        # the face is darker than this; the backwater is ~104-110 grey
                       # so the crest is read as the first row BELOW 100 after the backwater

# Manual annotations (source rows/columns), read from ruler zooms — see docstring.
MANUAL = {
    "crest_row": 749,            # top of the dark face in the band, frames 344-358
    "foam_boundary_row": 797,    # where the visible face meets the whitewater line ahead
    "events": {
        "344": {"state": "unbroken face, lip feathering", "plume_top_row": None, "extent_x": None},
        "351": {"state": "lip feathering / first curtain", "plume_top_row": None, "extent_x": None},
        "358": {"state": "distinct curtain to row ~770 at x 700-790", "plume_top_row": None, "extent_x": [700, 790]},
        "365": {"state": "plume onset: white mass x 660-780, rows 752-782", "plume_top_row": 752, "extent_x": [660, 780]},
        "372": {"state": "broad plume, top at the crest line", "plume_top_row": 749, "extent_x": [650, 800]},
        "379": {"state": "tumbling whitewater, merging", "plume_top_row": 751, "extent_x": [640, 850]},
        "386": {"state": "merged whitewater line, top ~752", "plume_top_row": 752, "extent_x": [640, 1000]},
        "393": {"state": "whitewater line", "plume_top_row": 753, "extent_x": [640, 1000]},
    },
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 22), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("--out", default="docs/research/assets/crash-2026-09-24/field")
    ap.add_argument("--no-hash", action="store_true")
    a = ap.parse_args()
    if not a.no_hash:
        got = sha256(a.clip)
        if got != REF_SHA256:
            sys.exit(f"clip hash {got} != reference {REF_SHA256}")
    os.makedirs(a.out, exist_ok=True)
    cap = cv2.VideoCapture(a.clip)
    frames = {}
    for n in FRAMES:
        cap.set(cv2.CAP_PROP_POS_FRAMES, n)
        ok, img = cap.read()
        if not ok:
            sys.exit(f"could not read frame {n}")
        frames[n] = img
    cap.release()

    def profile(img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY).astype(np.float32)
        band = g[ROWS[0]:ROWS[1], BAND[0]:BAND[1]]
        return np.percentile(band, 90, axis=1), np.median(band, axis=1)

    face_px = MANUAL["foam_boundary_row"] - MANUAL["crest_row"]
    out = {"source_sha256": REF_SHA256, "fps": FPS, "frames": FRAMES,
           "crop_xyxy": [CROP["x0"], CROP["y0"], CROP["x1"], CROP["y1"]],
           "band_x": list(BAND), "rows": list(ROWS), "plume_luma": PLUME_LUMA, "face_dark": FACE_DARK,
           "manual": MANUAL, "face_px_manual": face_px, "automatic": [], "ratios": {}}
    total = 0
    for n in FRAMES:
        img = frames[n]
        p90, med = profile(img)
        bright = np.where(p90 > PLUME_LUMA)[0]
        top_row = int(bright[0]) + ROWS[0] if len(bright) else None
        dark = np.where(med < 100)[0]
        crest_auto = int(dark[0]) + ROWS[0] if len(dark) else None
        crop = img[CROP["y0"]:CROP["y1"], CROP["x0"]:CROP["x1"]]
        name = f"frame_{n}_{n / FPS:06.3f}s.jpg"
        cv2.imwrite(os.path.join(a.out, name), crop, [cv2.IMWRITE_JPEG_QUALITY, 82])
        total += os.path.getsize(os.path.join(a.out, name))
        out["automatic"].append({"frame": n, "clean_s": round(n / FPS, 3), "file": name,
                                 "bright_top_row_p90": top_row, "bright_rows_p90": int(len(bright)),
                                 "crest_row_auto": crest_auto,
                                 "band_p90_max": float(p90.max()), "band_med_min": float(med.min())})
    # Ratios the note quotes, from the manual rows.
    ev = MANUAL["events"]
    plume_top = ev["372"]["plume_top_row"]
    out["ratios"] = {
        "face_px": face_px,
        "plume_top_over_face_372": round((MANUAL["foam_boundary_row"] - plume_top) / face_px, 3),
        "plume_top_over_face_365": round((MANUAL["foam_boundary_row"] - ev["365"]["plume_top_row"]) / face_px, 3),
        "whitewater_top_over_face_386": round((MANUAL["foam_boundary_row"] - ev["386"]["plume_top_row"]) / face_px, 3),
        "plume_top_vs_crest_372_faces": round((MANUAL["crest_row"] - plume_top) / face_px, 3),
        "plume_width_over_face_372": round((ev["372"]["extent_x"][1] - ev["372"]["extent_x"][0]) / face_px, 3),
        "plume_width_over_face_365": round((ev["365"]["extent_x"][1] - ev["365"]["extent_x"][0]) / face_px, 3),
        "curtain_depth_over_face_358": round((770 - MANUAL["crest_row"]) / face_px, 3),
        "curtain_to_plume_frames": [7, 14], "curtain_to_plume_s": [round(7 / FPS, 3), round(14 / FPS, 3)],
        "plume_to_merged_frames": [7, 14], "plume_to_merged_s": [round(7 / FPS, 3), round(14 / FPS, 3)],
        "distinct_plume_frames": [7, 14],
    }
    out["total_jpeg_bytes"] = total
    with open(os.path.join(a.out, "field-ratios.json"), "w") as f:
        json.dump(out, f, indent=2)
    print(json.dumps(out["ratios"], indent=1))
    for r in out["automatic"]:
        print(r)
    print("jpeg bytes", total)


if __name__ == "__main__":
    main()
