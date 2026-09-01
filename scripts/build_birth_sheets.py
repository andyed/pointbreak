#!/usr/bin/env python3
"""Before/after contact sheets for the #birth A/B (for a human to judge).

One sheet per (rig, sim): the full default frame on top, then one row per arm
with a crop around the default arm's head (drone) or around the projected
break line (cliff), labelled with the arm's hash suffix. Windows come from the
default arm's manifest geometry, identical for every arm in the row.

    python3 scripts/build_birth_sheets.py qa/img/birth
    SHEET_ARMS=default,wid,w21,w28 SHEET_CROP=crest python3 scripts/build_birth_sheets.py qa/img/wrapw

SHEET_ARMS picks and orders the rows (default: every arm in the manifest,
`default` first). SHEET_CROP=crest centres the drone crop on the default
arm's model crest locus behind the head (stations k -60..-20) instead of on
the head, for the wrap-ramp sweep whose subject is the horizontal crest edge.
"""
import json, os, sys
from PIL import Image, ImageDraw

def crop_box(ref, shape, drone, mode='head'):
    w, h = shape
    if drone and mode == 'crest':
        pts = [s['crestLoc'] for s in ref['stations'] if -60 <= s['k'] <= -20 and s.get('crestLoc') and s['crestLoc'][2] == 1]
        if pts:
            cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
            x0, y0 = int(cx - 300), int(cy - 150)
            return (max(0, x0), max(0, y0), min(w, x0 + 600), min(h, y0 + 300))
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
    env_order = os.environ.get('SHEET_ARMS')
    order = env_order.split(',') if env_order else (['default'] + [a for a in man['arms'] if a != 'default'])
    crop_mode = os.environ.get('SHEET_CROP', 'head')
    label_of = lambda fr: (fr.get('armHash') if fr.get('armHash') is not None else man['arms'].get(fr['arm'], '')) or '(shipped default)'
    for (rig, sim), arms in sorted(by.items()):
        ref = arms.get('default')
        if not ref:
            continue
        full = Image.open(os.path.join(root, ref['png'])).convert('RGB')
        drone = 'drone' in rig
        box = crop_box(ref, full.size, drone, crop_mode)
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
            d.text((740, 80 + 18 * i), f'{a:8s} {label_of(arms[a])}', fill=(220, 220, 220))
        y = top_h
        for a in rows:
            im = Image.open(os.path.join(root, arms[a]['png'])).convert('RGB').crop(box)
            if scale != 1:
                im = im.resize((cw * scale, ch * scale), Image.NEAREST)
            d.rectangle((0, y, 1440, y + 24), fill=(40, 40, 40))
            wr = arms[a].get('wrap')
            wtxt = f'   wrap width {wr["m"]:.1f} m = {(wr["s"] or 2.4):.2f} s' if wr and wr.get('m') is not None else ''
            d.text((8, y + 6), f'{a}   {label_of(arms[a])}   head x={arms[a].get("headX")}{wtxt}', fill=(255, 230, 120))
            sheet.paste(im, (0, y + 26))
            y += ch * scale + 26
        out = os.path.join(root, f'sheet_{rig}_{sim:03d}.png')
        sheet.save(out)
        print('wrote', out)

if __name__ == '__main__':
    main()
