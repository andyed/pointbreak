#!/usr/bin/env python3
"""Field vs render, one table: the bore band's share of the face.

Field rows come from docs/research/assets/curl-truth-2026-09-24/measurements.json
(the Field seat's luma runs on the 2026-08-15 clip: bright_h over the
adjacent unbroken face_h). Render rows come from measure_bore_frames.py's
per-column pairing b/(b+f) — the same ratio read on the same wave in the same
column. Prints markdown.

Usage: python3 scripts/build_bore_table.py qa/bore-2026-09-24/measurements_rendered.json
"""
import json
import sys
from collections import defaultdict

FIELD = 'docs/research/assets/curl-truth-2026-09-24/measurements.json'


def field_rows():
    m = json.load(open(FIELD))
    # Pair each event's bore reading with its face reading (H_f at the head).
    by_event = defaultdict(dict)
    for r in m:
        ev, rest = r['label'].split('_', 1)
        by_event[ev][rest] = r
    out = []
    for ev, rows in sorted(by_event.items()):
        # the unbroken face read at each frame (face / face_ahead / wall boxes)
        faces = {v['f']: v['face_h'] for k, v in rows.items() if k.endswith('_face') or k.endswith('_face_ahead') or k.endswith('_wall')}
        for k, b in sorted(rows.items(), key=lambda kv: kv[1]['f']):
            if not k.endswith('_bore') and not k.endswith('_bore2'):
                continue
            # H_f at the same frame, else the nearest earlier face read of the event
            earlier = [f for f in faces if f <= b['f']]
            if not earlier:
                continue
            fref = max(earlier); hf = faces[fref]
            out.append((ev, b['f'], b['bright_h'], hf, b['bright_h'] / hf, fref))
    return out


def main():
    rend = json.load(open(sys.argv[1]))['rows']
    print('| source | rig / event | clock | band px | H_f px | band / H_f | span of band / H_f |')
    print('|---|---|---|---|---|---|---|')
    for ev, f, bh, hf, ratio, fref in field_rows():
        note = '' if fref == f else f' (face f{fref})'
        print(f'| field 08-15 | event {ev} | f{f}{note} | {bh} | {hf} | **{ratio:.2f}** | — |')
    for r in sorted(rend, key=lambda r: (r['rig'], r['arm'], r['sim'])):
        med = r.get('frac_col_median'); span = r.get('paired_over_Hf')
        p25, p75 = r.get('frac_col_p25'), r.get('frac_col_p75')
        cell = '—' if med is None else f"**{med:.2f}** ({p25:.2f}–{p75:.2f})"
        print(f"| render | {r['rig']} / {r['arm']} | {r['sim']} s | {r['bore_px_median']} | {r['Hf_px']} | {cell} | {span if span is not None else '—'} |")


if __name__ == '__main__':
    main()
