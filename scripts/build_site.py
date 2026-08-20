#!/usr/bin/env python3
"""Assemble the public Pleasure Point page + simulation into a deploy bundle.

The simulator is not self-contained: web-three/ imports the shared model and
preset bank from shared/, which in turn imports the generated geo/depth data
from data/model/. So the bundle mirrors that relative layout rather than
flattening it — the import specifiers stay untouched and the deployed app is
byte-identical to the local one.

  <out>/index.html            the field guide
  <out>/og-card.png           social preview (gen_og.py -> render_check.mjs)
  <out>/fig-*.svg, assets/    figures (fig-week references assets/ at runtime)
  <out>/sim/web-three/        the app
  <out>/sim/shared/           params.js + model-glsl.js (imported by web-three)
  <out>/sim/data/model/       generated geo profiles + depth patches
  <out>/qa/                   QA snapshots, --with-qa ONLY (see below)
  <out>/qa/index.html         snapshot index, newest first
  <out>/qa/<date>-<sha>/      one snapshot: sheets, JSON sidecars, img/

QA snapshots are OPT-IN. They are heavy (~125 PNGs per snapshot) and publishing
them is a deliberate act, not a side effect of rebuilding the essay, so --with-qa
is required. The snapshot tree mirrors under qa/ exactly the way the app mirrors
under sim/, and for the same reason: a sheet built with `--mode=published` links
its cells at ../../sim/, which resolves only if both keep their shape.

Usage:
  python3 scripts/build_site.py                       # default target, no QA
  python3 scripts/build_site.py --out <dir>
  python3 scripts/build_site.py --with-qa             # ship qa/snapshots too
"""
import argparse, re, shutil, sys
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
    ('docs/figures/fig-floor.svg',     'fig-floor.svg'),
    ('docs/figures/assets',            'assets'),
    ('docs/figures/vendor',            'vendor'),
    ('docs/figures/js',                'js'),
    ('web-three/index.html',           'sim/web-three/index.html'),
    ('web-three/js',                   'sim/web-three/js'),
    ('web-three/css',                  'sim/web-three/css'),
    ('web-three/vendor',               'sim/web-three/vendor'),
    ('shared/params.js',               'sim/shared/params.js'),
    ('shared/model-glsl.js',           'sim/shared/model-glsl.js'),
    ('shared/cdip.js',                 'sim/shared/cdip.js'),
    ('data/model/pp_geo_profiles.js',  'sim/data/model/pp_geo_profiles.js'),
    ('data/model/pp_depth_patches.js', 'sim/data/model/pp_depth_patches.js'),
    ('data/climatology/pp_monthly_ocean.js',
     'sim/data/climatology/pp_monthly_ocean.js'),
]

# Same (source, destination) shape, but only copied under --with-qa. qa/ is
# git-ignored and regenerable, so unlike ITEMS a missing source here is a
# "you have not built a snapshot yet", not a broken repository.
QA_ITEMS = [
    ('qa/snapshots', 'qa'),
]

# Verification renders and capture scripts are development artefacts; the
# published page embeds the live app instead.
EXCLUDE_SUFFIX = ('-render.png', 'index-desktop.png', 'index-mobile.png')
EXCLUDE_NAMES = {'render_check.mjs'}

# Static/dynamic relative ES-module imports. Bare imports such as `three` are
# supplied by the page's import map and deliberately do not participate.
LOCAL_IMPORT = re.compile(
    r'''\b(?:from|import)\s*(?:\(\s*)?['"](\.{1,2}/[^'"]+)['"]''')


def copy(src: Path, dst: Path):
    dst.parent.mkdir(parents=True, exist_ok=True)
    if src.is_dir():
        if dst.exists():
            shutil.rmtree(dst)
        shutil.copytree(src, dst)
    else:
        shutil.copy2(src, dst)


def missing_local_imports(out: Path):
    """Return relative module imports that the assembled bundle cannot load."""
    missing = []
    for module in out.rglob('*.js'):
        text = module.read_text(encoding='utf-8')
        for spec in LOCAL_IMPORT.findall(text):
            target = (module.parent / spec).resolve()
            if not target.is_relative_to(out) or not target.is_file():
                missing.append((module.relative_to(out), spec))
    return missing


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', default=str(DEFAULT_OUT))
    ap.add_argument('--with-qa', action='store_true',
                    help='also publish qa/snapshots/ (opt-in; see the module docstring)')
    args = ap.parse_args()
    out = Path(args.out).resolve()

    items = list(ITEMS)
    if args.with_qa:
        for src, rel in QA_ITEMS:
            if not (ROOT / src).exists():
                print(f'--with-qa: no snapshot at {src}. Build one first:\n'
                      "  node scripts/build_qa_sheets.mjs --mode=published --note='…'")
                return 1
            items.append((src, rel))

    missing = [s for s, _ in items if not (ROOT / s).exists()]
    if missing:
        print('MISSING sources:\n  ' + '\n  '.join(missing))
        return 1

    out.mkdir(parents=True, exist_ok=True)
    for src, rel in items:
        copy(ROOT / src, out / rel)

    # prune dev artefacts that ride along inside copied directories
    removed = 0
    for p in out.rglob('*'):
        if p.is_file() and (p.name in EXCLUDE_NAMES or p.name.endswith(EXCLUDE_SUFFIX)):
            p.unlink(); removed += 1

    missing_imports = missing_local_imports(out)
    if missing_imports:
        print('MISSING local module imports:')
        for module, spec in missing_imports:
            print(f'  {module}: {spec}')
        return 1

    files = [p for p in out.rglob('*') if p.is_file()]
    total = sum(p.stat().st_size for p in files)
    print(f'built {out}')
    print(f'  {len(files)} files, {total/1024:.0f} KB (pruned {removed} dev artefacts)')
    qa_dir = out / 'qa'
    if args.with_qa:
        qa_files = [p for p in qa_dir.rglob('*') if p.is_file()]
        qa_bytes = sum(p.stat().st_size for p in qa_files)
        snaps = sorted(p.name for p in qa_dir.iterdir() if p.is_dir())
        print(f'  qa: {len(qa_files)} files, {qa_bytes/1024:.0f} KB, '
              f'{len(snaps)} snapshot(s): {", ".join(snaps)}')
    elif qa_dir.exists():
        print('  qa: left as-is (no --with-qa). Rerun with --with-qa to refresh it.')
    big = sorted(files, key=lambda p: -p.stat().st_size)[:5]
    for p in big:
        print(f'    {p.stat().st_size/1024:7.0f} KB  {p.relative_to(out)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
