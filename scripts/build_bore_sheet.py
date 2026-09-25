#!/usr/bin/env python3
"""One sheet: default over #bore=1 at the head, 3x crops, four clocks — the
same layout as the field sheets in assets/curl-truth-2026-09-24 so the two can
be read side by side. Crops follow the head-relative read in
measurements_rendered.json (head_x per frame) when present, else a fixed box.

Usage: python3 scripts/build_bore_sheet.py qa/bore-2026-09-24 [rig] [--out sheet.jpg]
"""
import json
import os
import sys

from PIL import Image, ImageDraw

CROP_W, CROP_H, SCALE = 400, 90, 2.0


def main():
    d = sys.argv[1]
    rig = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith('--') else 'secondpeak_fieldday'
    out = os.path.join(d, f'sheet-{rig}.jpg')
    if '--out' in sys.argv:
        out = sys.argv[sys.argv.index('--out') + 1]
    meas = {r['file']: r for r in json.load(open(os.path.join(d, 'measurements_rendered.json')))['rows']}
    sims = sorted({r['sim'] for r in meas.values() if r['rig'] == rig})
    arms = ['default', 'bore']
    sheet = Image.new('RGB', (int(CROP_W*SCALE)*len(sims), int(CROP_H*SCALE)*len(arms)), (20, 20, 20))
    draw = ImageDraw.Draw(sheet)
    for j, arm in enumerate(arms):
        for i, sim in enumerate(sims):
            f = f'{rig}_{arm}_{sim}.jpg'
            m = meas.get(f)
            img = Image.open(os.path.join(d, f))
            # centre the crop on the bore arm's head at this clock (the default has
            # no head to find), so both rows show the same water
            ref = meas.get(f'{rig}_bore_{sim}.jpg', m)
            head = (ref or {}).get('head') or {}
            cx = head.get('head_x', 500)
            rows = (ref or m)['window']['rows']
            cy = (rows[0] + rows[1]) // 2
            box = (max(0, cx - CROP_W//3), max(0, cy - CROP_H//2), min(img.width, cx - CROP_W//3 + CROP_W), min(img.height, cy - CROP_H//2 + CROP_H))
            crop = img.crop(box).resize((int(CROP_W*SCALE), int(CROP_H*SCALE)), Image.LANCZOS)
            x0, y0 = i*int(CROP_W*SCALE), j*int(CROP_H*SCALE)
            sheet.paste(crop, (x0, y0))
            label = f'{arm}  {sim} s'
            if m and m.get('head'):
                h = m['head']
                label += f"   Hf {h['Hf_face_px']:.0f} px  band/Hf {h['bore_15_45_over_Hf']}"
            draw.rectangle([x0, y0, x0 + 8*len(label) + 8, y0 + 16], fill=(0, 0, 0))
            draw.text((x0 + 4, y0 + 2), label, fill=(255, 230, 0))
    sheet.save(out, quality=82)
    print('wrote', out, sheet.size, os.path.getsize(out)//1024, 'KB')


if __name__ == '__main__':
    main()
