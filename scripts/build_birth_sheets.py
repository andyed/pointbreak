#!/usr/bin/env python3
"""Before/after contact sheets for the #birth A/B (for a human to judge).

One sheet per (rig, sim): the full default frame on top, then one row per arm
with a crop around the default arm's head (drone) or around the projected
break line (cliff), labelled with the arm's hash suffix. Windows come from the
default arm's manifest geometry, identical for every arm in the row.

    python3 scripts/build_birth_sheets.py qa/img/birth
"""
import json, os, sys
from PIL import Image, ImageDraw

def crop_box(ref, shape, drone):
    w, h = shape
    if drone and ref.get('headScreen') and ref['headScreen'][2] == 1:
        hx, hy = ref['headScreen'][:2]
        x0, y0 = int(hx - 300), int(hy - 160)
        return (max(0, x0), max(0, y0), min(w, x0 + 600), min(h, y0 + 380))
    pts = [s['sea'] for s in ref['stations'] if s['sea'][2] == 1] + [s['crest'] for s in ref['stations'] if s['crest'][2] == 1]
    if not pts:
        return (0, 0, w, h)
    xs = [p[0] for p in pts]; ys = [p[1] for p in pts]
    x0, x1 = max(0, int(min(xs) - 80)), min(w, int(max(xs) + 80))
    y0, y1 = max(0, int(min(ys) - 120)), min(h, int(max(ys) + 120))
    return (x0, y0, x1, y1)

def main():
    root = sys.argv[1] if len(sys.argv) > 1 else 'qa/img/birth'
    man = json.load(open(os.path.join(root, 'manifest.json')))
    by = {}
    for f in man['frames']:
        by.setdefault((f['rig'], f['sim']), {})[f['arm']] = f
    order = ['default', 'birth0', 'A', 'A2', 'B', 'C']
    for (rig, sim), arms in sorted(by.items()):
        ref = arms.get('default')
        if not ref:
            continue
        full = Image.open(os.path.join(root, ref['png'])).convert('RGB')
        drone = 'drone' in rig
        box = crop_box(ref, full.size, drone)
        cw, ch = box[2] - box[0], box[3] - box[1]
        scale = 2 if cw * 2 <= 1440 else 1
        rows = [a for a in order if a in arms]
        top_h = 450
        sheet = Image.new('RGB', (1440, top_h + len(rows) * (ch * scale + 26)), (20, 20, 20))
        d = ImageDraw.Draw(sheet)
        thumb = full.resize((720, 450))
        sheet.paste(thumb, (0, 0))
        d.rectangle((box[0] / 2, box[1] / 2, box[2] / 2, box[3] / 2), outline=(255, 220, 0), width=2)
        d.text((740, 12), f'{rig}  sim={sim}  default frame (yellow = crop window, fixed on the default arm)', fill=(255, 255, 255))
        d.text((740, 32), f'#{ref["hash"]}', fill=(200, 200, 200))
        d.text((740, 60), 'arms:', fill=(255, 255, 255))
        for i, a in enumerate(rows):
            d.text((740, 80 + 18 * i), f'{a:8s} {man["arms"].get(a, "") or "(shipped default)"}', fill=(220, 220, 220))
        y = top_h
        for a in rows:
            im = Image.open(os.path.join(root, arms[a]['png'])).convert('RGB').crop(box)
            if scale != 1:
                im = im.resize((cw * scale, ch * scale), Image.NEAREST)
            d.rectangle((0, y, 1440, y + 24), fill=(40, 40, 40))
            d.text((8, y + 6), f'{a}   {man["arms"].get(a, "") or "(shipped default)"}   head x={arms[a].get("headX")}', fill=(255, 230, 120))
            sheet.paste(im, (0, y + 26))
            y += ch * scale + 26
        out = os.path.join(root, f'sheet_{rig}_{sim:03d}.png')
        sheet.save(out)
        print('wrote', out)

if __name__ == '__main__':
    main()
