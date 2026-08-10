#!/usr/bin/env python3
"""Assemble the public Pleasure Point page + simulation into a deploy bundle.

The simulator is not self-contained: web-three/ imports the shared model and
preset bank from web/js/, which in turn imports the generated geo/depth data
from data/model/. So the bundle mirrors that relative layout rather than
flattening it — the import specifiers stay untouched and the deployed app is
byte-identical to the local one.

  <out>/index.html            the field guide
  <out>/og-card.png           social preview (gen_og.py -> render_check.mjs)
  <out>/fig-*.svg, assets/    figures (fig-week references assets/ at runtime)
  <out>/sim/web-three/        the app
  <out>/sim/web/js/           params.js + model-glsl.js (imported by web-three)
  <out>/sim/data/model/       generated geo profiles + depth patches

Usage:
  python3 scripts/build_site.py                       # default target
  python3 scripts/build_site.py --out <dir>
"""
import argparse, shutil, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT.parent / 'mindbendingpixels-www' / 'pleasurepoint'

# (source, destination-relative-to-out). Directories copied wholesale.
ITEMS = [
    ('docs/figures/index.html',        'index.html'),
    ('docs/figures/og-card.png',       'og-card.png'),
    ('docs/figures/fig-topology.svg',  'fig-topology.svg'),
    ('docs/figures/fig-ladder.svg',    'fig-ladder.svg'),
    ('docs/figures/fig-week.svg',      'fig-week.svg'),
    ('docs/figures/assets',            'assets'),
    ('docs/figures/vendor',            'vendor'),
    ('docs/figures/js',                'js'),
    ('web-three/index.html',           'sim/web-three/index.html'),
    ('web-three/js',                   'sim/web-three/js'),
    ('web-three/css',                  'sim/web-three/css'),
    ('web-three/vendor',               'sim/web-three/vendor'),
    ('web/js/params.js',               'sim/web/js/params.js'),
    ('web/js/model-glsl.js',           'sim/web/js/model-glsl.js'),
    ('data/model/pp_geo_profiles.js',  'sim/data/model/pp_geo_profiles.js'),
    ('data/model/pp_depth_patches.js', 'sim/data/model/pp_depth_patches.js'),
]

# Verification renders and capture scripts are development artefacts; the
# published page embeds the live app instead.
EXCLUDE_SUFFIX = ('-render.png', 'index-desktop.png', 'index-mobile.png')
EXCLUDE_NAMES = {'render_check.mjs'}


def copy(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
    else:
        shutil.copy2(src, dst)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(DEFAULT_OUT))
    args = ap.parse_args()
    out = Path(args.out).resolve()

    missing = [s for s, _ in ITEMS if not (ROOT / s).exists()]
    if missing:
        print('MISSING sources:\n  ' + '\n  '.join(missing))
        return 1

    out.mkdir(parents=True, exist_ok=True)
    for src, rel in ITEMS:
        copy(ROOT / src, out / rel)

    # prune dev artefacts that ride along inside copied directories
    removed = 0
    for p in out.rglob('*'):
        if p.is_file() and (p.name in EXCLUDE_NAMES or p.name.endswith(EXCLUDE_SUFFIX)):
            p.unlink(); removed += 1

    files = [p for p in out.rglob('*') if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    print(f'built {out}')
    print(f'  {len(files)} files, {total/1024:.0f} KB (pruned {removed} dev artefacts)')
    big = sorted(files, key=lambda p: -p.stat().st_size)[:5]
    for p in big:
        print(f'    {p.stat().st_size/1024:7.0f} KB  {p.relative_to(out)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
