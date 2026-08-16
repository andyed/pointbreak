#!/usr/bin/env python3
"""Generate fig-week.svg — the seven Pleasure Point sites as wave-character studies.

Replaces the hand-built contact sheet that carried three borrowed west-side
names. Every panel is now a real site on this point, ordered apex -> down-point
(the golden-rule gradient), with its parameters read straight out of
shared/params.js so the caption can never drift from what the model runs.

Captures come from scripts/capture_presets.mjs. Run that first:
  node scripts/capture_presets.mjs
  python3 docs/figures/gen_week.py
"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PARAMS = ROOT / 'shared/params.js'
ASSETS = ROOT / 'docs/figures/assets'
OUT = ROOT / 'docs/figures/fig-week.svg'

BG, INK, FOAM, KELP, SAND, SLATE = '#0f1216', '#e6e4d2', '#eef2f3', '#1d2b28', '#c9a86a', '#8fa3ad'

# Character reads, keyed by preset. Derived from each site's own xi/sigma, not
# invented: feather -> crumble -> plunge as xi rises, sparse -> heavy sectioning
# as sigma rises.
READS = {
    'sewers':     ['hollow plunging lip, heavy', 'sectioning at the apex'],
    'firstpeak':  ['steeper tapered wall,', 'crumble building toward a lip'],
    'secondpeak': ['glassy shoulder, mellow', 'crumble at the pocket'],
    'jacks':      ['soft crumble along the face,', 'light peel, rare section'],
    'thehook':    ['curling lip at the pocket,', 'mixed crumble and section'],
    'sharks':     ['slow rolling shoulder,', 'wide mellow lines'],
    'privates':   ['thin feathering crest,', 'barely spilling, sheltered'],
}


def load_presets():
    """Parse the PRESETS object literal out of params.js (no JS runtime here)."""
    txt = PARAMS.read_text()
    body = txt[txt.index('export const PRESETS = {'):]
    body = body[:body.index('\n};')]
    out = []
    for line in body.splitlines():
        m = re.match(r"\s*(\w+):\s*\{(.+)\},?\s*$", line)
        if not m:
            continue
        key, fields = m.group(1), m.group(2)
        d = {'key': key}
        for fm in re.finditer(r"(\w+):\s*(?:'([^']*)'|\"([^\"]*)\"|([-\d.]+)|(null))", fields):
            name = fm.group(1)
            if fm.group(2) is not None or fm.group(3) is not None:
                d[name] = fm.group(2) if fm.group(2) is not None else fm.group(3)
            elif fm.group(4) is not None:
                d[name] = float(fm.group(4))
            else:
                d[name] = None
        out.append(d)
    return out


def esc(s):
    return (s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
             .replace("'", '&#39;'))


def main():
    presets = load_presets()
    missing = [p['key'] for p in presets if not (ASSETS / f"cliff_{p['key']}.png").exists()]
    if missing:
        print('MISSING captures for: ' + ', '.join(missing))
        print('run:  node scripts/capture_presets.mjs')
        return 1

    COLS, CW, GAP, M = 4, 366, 24, 40
    IMG_H, CAP_H = 206, 118
    ROW_H = IMG_H + CAP_H
    W = M * 2 + COLS * CW + (COLS - 1) * GAP
    H = M + 34 + 26 + 2 * ROW_H + GAP + 46

    o = [f'<svg viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" '
         f'xmlns:xlink="http://www.w3.org/1999/xlink" role="img">',
         '<title>Seven Pleasure Point sites as simulated wave-character studies</title>',
         '<desc>Cliff-view frames from the pointbreak model, one per site, ordered '
         'apex to down-point, each labelled with the parameters the model ran.</desc>',
         f'''<style>
 .wk-bg {{ fill: {BG}; }}
 .wk-title {{ fill: {INK}; font: 700 27px Georgia, "Times New Roman", serif; }}
 .wk-sub {{ fill: {FOAM}; font: 400 15px -apple-system, "Helvetica Neue", Arial, sans-serif; }}
 .wk-name {{ fill: {FOAM}; font: 700 19px -apple-system, "Helvetica Neue", Arial, sans-serif; }}
 .wk-spec {{ fill: {INK}; font: 400 14.5px ui-monospace, SFMono-Regular, Menlo, monospace; }}
 .wk-read {{ fill: #cccbbb; font: italic 400 14.5px -apple-system, "Helvetica Neue", Arial, sans-serif; }}
 .wk-foot {{ fill: #cccbbb; font: 400 14px -apple-system, "Helvetica Neue", Arial, sans-serif; }}
 .wk-badge {{ fill: {SAND}; }}
 .wk-badge-t {{ fill: {BG}; font: 700 12px -apple-system, "Helvetica Neue", Arial, sans-serif; letter-spacing: .07em; }}
 .wk-rule {{ stroke: rgba(230,228,210,0.18); stroke-width: 1; }}
 .wk-frame {{ fill: none; stroke: rgba(230,228,210,0.20); stroke-width: 1; }}
</style>''',
         f'<rect class="wk-bg" x="0" y="0" width="{W}" height="{H}"/>']

    o.append(f'<text class="wk-title" x="{M}" y="{M + 18}">SEVEN SITES — one point, apex to down-point</text>')
    # WIP badge, top right
    bw = 236
    o.append(f'<rect class="wk-badge" x="{W - M - bw}" y="{M + 2}" width="{bw}" height="22" rx="3"/>')
    o.append(f'<text class="wk-badge-t" x="{W - M - bw + 11}" y="{M + 17}">WORK-IN-PROGRESS RENDER</text>')
    o.append(f'<text class="wk-sub" x="{M}" y="{M + 44}">'
             'Simulated frames from the pointbreak model — not photographs, and not validated against this break.</text>')

    top = M + 34 + 26
    for i, p in enumerate(presets):
        c, r = i % COLS, i // COLS
        x = M + c * (CW + GAP)
        y = top + r * ROW_H
        href = f"assets/cliff_{p['key']}.png"
        o.append(f'<clipPath id="wk-clip{i}"><rect x="{x}" y="{y}" width="{CW}" height="{IMG_H}" rx="3"/></clipPath>')
        # crop to the lower 55% of the 1280x720 capture: the HUD lives up top
        ar = CW / IMG_H
        # drone frames are useful edge to edge; take a centred band rather
        # than the lower slice the cliff camera needed to dodge its HUD
        sh = 720 * 0.78
        sw = sh * ar
        o.append(f'<g clip-path="url(#wk-clip{i})">'
                 f'<svg x="{x}" y="{y}" width="{CW}" height="{IMG_H}" '
                 f'viewBox="{(1280 - sw) / 2:.1f} {(720 - sh) / 2:.1f} {sw:.1f} {sh:.1f}" '
                 f'preserveAspectRatio="xMidYMid slice">'
                 f'<image xlink:href="{href}" href="{href}" x="0" y="0" width="1280" height="720"/>'
                 f'</svg></g>')
        o.append(f'<rect class="wk-frame" x="{x}" y="{y}" width="{CW}" height="{IMG_H}" rx="3"/>')
        o.append(f'<circle cx="{x + 22}" cy="{y + 22}" r="13" fill="{KELP}" stroke="{SAND}" stroke-width="1.5"/>')
        o.append(f'<text x="{x + 22}" y="{y + 27}" text-anchor="middle" fill="{FOAM}" '
                 f'font="700 14px sans-serif" font-size="14" font-weight="700" '
                 f'font-family="-apple-system, sans-serif">{i + 1}</text>')

        ty = y + IMG_H + 26
        o.append(f'<text class="wk-name" x="{x}" y="{ty}">{esc(p["label"])}</text>')
        o.append(f'<line class="wk-rule" x1="{x}" y1="{ty + 9}" x2="{x + CW}" y2="{ty + 9}"/>')
        spec = (f'α{p["alpha"]:.0f}° · ξ{p["xi"]:g} · '
                f'σ{p["sections"]:g} · T{p["T"]:g}s · H0 {p["H0"]:g}m')
        o.append(f'<text class="wk-spec" x="{x}" y="{ty + 30}">{spec}</text>')
        for j, line in enumerate(READS.get(p['key'], ['', ''])):
            o.append(f'<text class="wk-read" x="{x}" y="{ty + 52 + j * 20}">{esc(line)}</text>')

    fy = H - 26
    o.append(f'<line class="wk-rule" x1="{M}" y1="{fy - 22}" x2="{W - M}" y2="{fy - 22}"/>')
    o.append(f'<text class="wk-foot" x="{M}" y="{fy}">'
             'α peel angle · ξ Iribarren (barrel-ness) · σ section noise · '
             'T period · H0 swell height. Six of the seven run on surveyed NCEI bathymetry; '
             'Privates runs on a synthetic stage and is labelled as such in the app.</text>')
    o.append('</svg>')
    OUT.write_text('\n'.join(o))
    print(f'wrote {OUT.name} ({W}x{H}) — {len(presets)} sites')
    for p in presets:
        print(f"  {p['label']:<16} α{p['alpha']:.0f} ξ{p['xi']:g}  geo={p['geoSpot']}")
    return 0


if __name__ == '__main__':
    sys.exit(main())
