// The publishing contract for the QA contact sheets (2026-08-20).
//
// A published sheet's cell links are RELATIVE — `../../sim/web-three/#…` from
// qa/<snapshot-id>/<sheet>.html — because a published page whose links only
// resolve on one laptop is broken for every other reader. That relative path is
// a joint fact about two files that do not import each other:
//
//   scripts/build_qa_sheets.mjs  chooses the link base
//   scripts/build_site.py        chooses where the snapshot and the app land
//
// Change either destination and every cell link on every published sheet 404s,
// silently, with nothing in the repo disagreeing. The first test below is that
// missing disagreement: it walks the published link base from the deployed
// sheet's own directory and asserts it arrives at the app.
//
// The rest pin the promises the pages make about themselves: that provenance is
// on the page rather than only in the HTML source, that a dirty build is a
// banner rather than a field, and that publishing QA stays opt-in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const rig = readFileSync(new URL('../scripts/build_qa_sheets.mjs', import.meta.url), 'utf8');
const site = readFileSync(new URL('../scripts/build_site.py', import.meta.url), 'utf8');

test('a published cell link walks from the deployed sheet to the deployed app', () => {
  // The generator's published default.
  const m = rig.match(/const LINK_DEFAULT = MODE === 'published' \? '([^']+)'/);
  assert.ok(m, 'no published LINK_DEFAULT in build_qa_sheets.mjs');
  const linkBase = m[1];

  // Where build_site.py puts the snapshot tree and where it puts the app. Both
  // are read out of the file rather than restated, so this test fails on the
  // edit that breaks the links rather than on a copy of it.
  const qaDest = site.match(/QA_ITEMS = \[\s*\('qa\/snapshots',\s*'([^']+)'\)/)?.[1];
  assert.ok(qaDest, 'no qa/snapshots entry in build_site.py QA_ITEMS');
  const appDest = site.match(/\('web-three\/index\.html',\s*'([^']+)'\)/)?.[1];
  assert.ok(appDest, 'no web-three/index.html entry in build_site.py ITEMS');

  // A sheet is one directory deep inside the snapshot tree: <qaDest>/<id>/x.html
  const sheetDir = path.posix.join(qaDest, '2026-08-20-abc1234');
  const resolved = path.posix.normalize(path.posix.join(sheetDir, linkBase, 'web-three/index.html'));
  assert.equal(resolved, appDest,
    `published cell links resolve to ${resolved}, but build_site.py ships the app at ${appDest}`);

  // And it must stay relative — an absolute base pins the bundle to one host.
  assert.ok(!/^https?:|^\//.test(linkBase),
    `published link base ${linkBase} is absolute; the bundle must survive a domain or path move`);
});

test('local and published modes do not share a link default', () => {
  // The whole point of the mode switch: a published sheet must not carry the
  // dev port, and a local sheet must not carry a path that only exists in a
  // deploy bundle.
  const local = rig.match(/const LINK_DEFAULT = MODE === 'published' \? '[^']+' : '([^']+)'/)?.[1];
  assert.ok(local, 'no local LINK_DEFAULT');
  assert.match(local, /^http:\/\/localhost:\d+\//, 'the local default is not a dev-server URL');
  assert.ok(!/localhost|127\.0\.0\.1/.test(
    rig.match(/const LINK_DEFAULT = MODE === 'published' \? '([^']+)'/)[1]),
  'the PUBLISHED default names localhost');
  // --linkbase= still overrides either, so neither default is a dead end.
  assert.match(rig, /flags\.linkbase \|\| LINK_DEFAULT/);
});

test('publishing QA is opt-in, not a side effect of building the site', () => {
  assert.match(site, /--with-qa/, 'build_site.py has no --with-qa flag');
  assert.match(site, /if args\.with_qa:/, 'the QA items are not gated on the flag');
  // QA_ITEMS must be a separate list — folding it into ITEMS would publish on
  // every build, and would also make a missing snapshot a hard failure.
  // (Anchored at a line start: `ITEMS = [` is a substring of `QA_ITEMS = [`.)
  const itemsBlock = site.match(/^ITEMS = \[([\s\S]*?)^\]/m);
  assert.ok(itemsBlock, 'no ITEMS list in build_site.py');
  assert.ok(!itemsBlock[1].includes('qa/'),
    'a qa/ entry is inside ITEMS, so it would ship on every site build');
});

test('provenance reaches the page and the JSON, not just the HTML source', () => {
  // Rendered into a visible section, not a comment.
  assert.match(rig, /function provenanceHTML\(/);
  assert.match(rig, /<section class="prov">/);
  for (const field of ['capturedAt', 'commitFull', 'branch', 'appDigest'])
    assert.ok(rig.includes(`p.${field}`) || rig.includes(`${field}:`),
      `provenance field ${field} is never rendered`);
  // The same block is what goes into the sidecars.
  assert.match(rig, /provenance: \{ \.\.\.PROVENANCE, linkBase: LINK_BASE \}/);
  // And onto both page kinds.
  for (const fn of ['sheetHTML', 'indexHTML']) {
    const body = rig.slice(rig.indexOf(`function ${fn}(`));
    assert.ok(body.slice(0, 4000).includes('provenanceHTML('),
      `${fn} does not render the provenance block`);
  }
});

test('a dirty tree is a banner, and the commit alone is not offered as reproduction', () => {
  assert.match(rig, /function dirtyBannerHTML\(/);
  // Rendered ABOVE the provenance block on the sheet — a reader must meet it
  // before they read any number.
  const sheet = rig.slice(rig.indexOf('function sheetHTML('));
  const banner = sheet.indexOf('dirtyBannerHTML(prov)');
  const prov = sheet.indexOf('provenanceHTML(prov');
  assert.ok(banner > 0 && prov > banner,
    'the dirty banner is not rendered above the provenance block');
  // Untracked files count as dirty: a new uncommitted module is exactly the
  // case where the commit sha lies about what ran.
  assert.match(rig, /git\('status', '--porcelain'\)/);
  assert.ok(!/--porcelain[^\n]*--untracked-files=no/.test(rig),
    'untracked files are excluded from the dirty check');
});

test('the app build has an identity that moves when the shipped bytes move', () => {
  // There is no version string in the app, and a commit sha does not move on a
  // dirty tree — which is the case that needs an identity most. The digest is
  // over the files build_site.py actually ships, so it answers "what would a
  // reader clicking a cell be running".
  assert.match(rig, /const APP_DIGEST = digestApp\(\)/);
  assert.match(rig, /createHash\('sha256'\)/);
  for (const f of ['shared/model-glsl.js', 'shared/params.js', 'web-three/index.html'])
    assert.ok(rig.includes(f), `${f} is not in the app digest input set`);
});

test('the n/a cells explain themselves on the page', () => {
  // These sheets legitimately report n/a at Privates (no measured bed, so no
  // baked line to project a corridor onto and no depth ceiling to be under).
  // A published reader cannot be left to guess at a blank.
  assert.match(rig, /const NA_NOTE = /);
  assert.ok(/Privates has no measured bed and therefore no ceiling to\s*\n?be over/.test(rig)
    || rig.includes('no measured bed and therefore no ceiling'),
  'the n/a note does not state why there is no ceiling at Privates');
  // and the marker itself carries a reason without needing the footer
  assert.match(rig, /class="na" title="No measured bed/);
});

test('the standing block states what the sheet is not', () => {
  // README is explicit that the model is unvalidated and that a first
  // validation pass is the largest open gap. A published QA artifact that
  // omits that reads as a validation.
  assert.match(rig, /unvalidated against measured surf/);
  assert.match(rig, /QA instrument/);
  assert.match(rig, /not a forecast|Not a surf report, not a forecast/i);
  // Licence per LICENSES.md: renders are MIT, ODbL attribution still required.
  assert.match(rig, /MIT/);
  assert.match(rig, /ODbL/);
});

test('snapshots accumulate under a dated, commit-stamped id and are retained by rule', () => {
  assert.match(rig, /const SNAP_ID = `\$\{new Date\(\)\.toISOString\(\)\.slice\(0, 10\)\}-\$\{COMMIT\}`/);
  assert.match(rig, /const KEEP = Math\.max\(1, Number\(flags\.keep \|\| (\d+)\)\)/);
  // Retirement must keep the row and drop only the bytes, or the index stops
  // being a record of what was published.
  assert.match(rig, /e\.retired = true/);
  assert.match(rig, /rmSync\(dir, \{ recursive: true, force: true \}\)/);
});
