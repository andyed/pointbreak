// The publishing contract for the QA contact sheets (2026-08-20).
//
// A published sheet's cell links are RELATIVE — `../sim/web-three/#…` from
// qa/<sheet>.html — because a published page whose links only resolve on one
// laptop is broken for every other reader. That relative path is a joint fact
// about two files that do not import each other:
//
//   scripts/build_qa_sheets.mjs  chooses the link base
//   scripts/build_site.py        chooses where the QA set and the app land
//
// Change either destination and every cell link on every published sheet 404s,
// silently, with nothing in the repo disagreeing. The first test below is that
// missing disagreement: it walks the published link base from the deployed
// sheet's own directory and asserts it arrives at the app.
//
// The rest pin the promises the pages make about themselves: that publishing is
// current state rather than an archive, that the published set is a stated
// subset rather than a silent truncation, that provenance is on the page rather
// than only in the HTML source, that a dirty build is a banner rather than a
// field, and that the essay's outbound link cannot ship pointing at nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const rig = readFileSync(new URL('../scripts/build_qa_sheets.mjs', import.meta.url), 'utf8');
const site = readFileSync(new URL('../scripts/build_site.py', import.meta.url), 'utf8');
const essay = readFileSync(new URL('../docs/figures/index.html', import.meta.url), 'utf8');

test('the essay exposes a machine-readable last-updated date', () => {
  assert.match(essay,
    /<time datetime="\d{4}-\d{2}-\d{2}">Last updated [^<]+<\/time>/,
    'the essay header has no visible, machine-readable last-updated date');
});

// Where build_site.py puts the QA set and where it puts the app. Read out of
// the file rather than restated, so a test fails on the edit that breaks the
// links rather than on a copy of it.
const qaDest = site.match(/QA_ITEMS = \[\s*\('qa\/published',\s*'([^']+)'\)/)?.[1];
const appDest = site.match(/\('web-three\/index\.html',\s*'([^']+)'\)/)?.[1];

test('a published cell link walks from the deployed sheet to the deployed app', () => {
  const m = rig.match(/const LINK_DEFAULT = MODE === 'published' \? '([^']+)'/);
  assert.ok(m, 'no published LINK_DEFAULT in build_qa_sheets.mjs');
  const linkBase = m[1];
  assert.ok(qaDest, 'no qa/published entry in build_site.py QA_ITEMS');
  assert.ok(appDest, 'no web-three/index.html entry in build_site.py ITEMS');

  // A published sheet sits at the ROOT of the QA destination: <qaDest>/x.html.
  // (It used to be one deeper, under a dated snapshot directory. That is the
  // exact kind of move this test exists to catch.)
  const resolved = path.posix.normalize(path.posix.join(qaDest, linkBase, 'web-three/index.html'));
  assert.equal(resolved, appDest,
    `published cell links resolve to ${resolved}, but build_site.py ships the app at ${appDest}`);

  // And it must stay relative — an absolute base pins the bundle to one host.
  assert.ok(!/^https?:|^\//.test(linkBase),
    `published link base ${linkBase} is absolute; the bundle must survive a domain or path move`);
});

test('the essay links to the QA set only in bundles that carry it', () => {
  // A dead link out of the published essay is worse than no link, and --with-qa
  // is opt-in, so the link cannot simply live in the source file.
  assert.ok(essay.includes('QA_LINK_BEGIN') && essay.includes('QA_LINK_END'),
    'the essay has no QA_LINK_BEGIN/QA_LINK_END block');
  const open = essay.indexOf('<!-- QA_LINK_BEGIN');
  assert.ok(open >= 0, 'the QA link block is not commented out in the source essay');
  const close = essay.indexOf('QA_LINK_END -->', open);
  assert.ok(close > open, 'the QA link block is not closed as a comment');
  const block = essay.slice(open, close);

  // Inert in the source file: no live href to qa/ outside the comment.
  const outside = essay.slice(0, open) + essay.slice(close);
  assert.ok(!/href="qa\//.test(outside),
    'the essay carries a live qa/ link outside the conditional block; '
    + 'it would 404 in any bundle built without --with-qa');

  // The link target must match where build_site.py actually puts the set.
  assert.match(block, /href="qa\/"/, 'the QA link does not point at qa/');
  assert.equal(qaDest, 'qa',
    `the essay links to qa/ but build_site.py ships the set at ${qaDest}`);

  // An HTML comment cannot contain "--", or the browser ends it early and the
  // rest of the block leaks into the page as text.
  assert.ok(!block.replace('<!-- QA_LINK_BEGIN', '').includes('--'),
    'the QA link block contains "--", which terminates the HTML comment early');

  // The markers wrap MARKUP AND NOTHING ELSE. Injection deletes the two marker
  // strings, so any prose between them renders as an essay paragraph — which is
  // exactly what shipped the first time this was built, and what a reader would
  // have seen: a note about build_site.py sitting in the middle of section 05.
  const payload = essay.slice(open + '<!-- QA_LINK_BEGIN'.length, close).trim();
  assert.ok(payload.startsWith('<'),
    'the QA link block does not start with markup; everything between the '
    + `markers becomes visible page text. Found: ${payload.slice(0, 80)}`);
  assert.ok(!/^\s*[A-Za-z]/m.test(payload.replace(/<[^>]*>/g, '').replace(/&\w+;/g, '')
    .split('\n').filter((l) => /^[A-Z][a-z]+ [a-z]/.test(l.trim())
      && !/^(Every|Those|They)/.test(l.trim())).join('\n')),
  'the QA link block appears to contain commentary outside its markup');

  // build_site.py must actually enable it, only under the flag, and must refuse
  // a non-markup payload rather than publish it.
  assert.match(site, /def enable_qa_link\(/);
  assert.match(site, /if args\.with_qa:\n\s+if not enable_qa_link\(out \/ 'index\.html'\)/);
  assert.match(site, /if not payload\.startswith\('<'\)/,
    'build_site.py does not guard against injecting prose as page content');
});

test('the essay QA link says what the sheets are and are not', () => {
  const block = essay.slice(essay.indexOf('<!-- QA_LINK_BEGIN'), essay.indexOf('QA_LINK_END -->'));
  assert.match(block, /current as of/i, 'the link does not say the set is current-as-of a stamp');
  assert.match(block, /not a validation/i, 'the link does not say it is not a validation');
  assert.match(block, /deterministic/i, 'the link does not say the captures are deterministic');
  // And it must not sit on the kelp card: sand links there are 6.51:1.
  assert.ok(!/class="callout"/.test(block),
    'the QA link is inside a kelp .callout, where its sand link would be 6.51:1');
  assert.match(block, /class="qa-note"/);
  assert.match(essay, /\.qa-note \{[^}]*background: var\(--mg-bg\)/,
    '.qa-note is not on the page background, so its link contrast is not the 8.31:1 row');
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

test('publishing is current state, with no archive machinery left behind', () => {
  // Andy asked for one published set that a new publish replaces. Half-removed
  // archive machinery is worse than either choice: it is dead code that still
  // reads as a promise. Nothing dated, no manifest, no retention.
  // (`flags.keep` is NOT in this list: that is the unrelated "reuse the img
  // directory" switch, which predates any of this.)
  for (const ghost of ['SNAP_ID', 'SNAP_ROOT', 'updateManifest', 'readManifest',
    'snapshotIndexHTML', 'manifest.json', 'retired', 'flags.keep || 4']) {
    assert.ok(!rig.includes(ghost), `archive machinery survives in the rig: ${ghost}`);
  }
  assert.ok(!site.includes('snapshot'), 'build_site.py still refers to snapshots');
  // One destination, replaced in place.
  assert.match(rig, /const OUT = MODE === 'published' \? join\(QA_ROOT, 'published'\) : QA_ROOT/);
});

test('the published set is a stated subset, cut on rows and never on columns', () => {
  // The columns ARE the artifact on both sheets: a progression sampled at three
  // points is not a progression, and a set beat without its lulls does not show
  // the envelope floor the model work exists to demonstrate.
  assert.ok(!/PUB_(COLS|CLOCKS)|clock\.n = |columns.*slice\(/.test(rig),
    'something in the rig cuts columns for publication');
  assert.match(rig, /const PUB_ROWS = \{/);

  // Every id named in PUB_ROWS must actually exist as a row, or the published
  // sheet silently ships fewer rows than intended — a typo would be invisible.
  const pubBlock = rig.slice(rig.indexOf('const PUB_ROWS = {'), rig.indexOf('const SHEETS = ['));
  const wanted = [...pubBlock.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1])
    .filter((s) => /^(day|h0|loc|sea)-/.test(s));
  assert.ok(wanted.length > 0, 'PUB_ROWS names no rows');
  for (const id of wanted) {
    // Row ids are either literal (BREAK_ROWS) or built from a template.
    const literal = rig.includes(`id: '${id}'`);
    const templated = /^loc-/.test(id)
      ? rig.includes('id: `loc-${k}`') && rig.includes(`'${id.slice(4)}'`)
      : /^sea-/.test(id) && rig.includes('id: `sea-${p}-${m.key}`');
    assert.ok(literal || templated, `PUB_ROWS names ${id}, which no sheet row produces`);
  }

  // The page's own description of itself must match the page. A lede promising
  // "six wave sizes" over a two-row grid, or a group header reading "all seven
  // presets" over three, is a small dishonesty on a sheet whose whole claim is
  // that it does not truncate silently.
  assert.match(rig, /pubBlurb:/, 'no published blurb override');
  assert.match(rig, /\(prov\.mode === 'published' && sheet\.pubBlurb\) \|\| sheet\.blurb/);
  assert.match(rig, /\(MODE === 'published' && group\.pubLabel\) \|\| group\.label/);
  assert.match(rig, /\(MODE === 'published' && group\.pubNote\) \|\| group\.note/);
  // Any group whose default label counts rows ("all seven", "three months")
  // needs an override, or it will describe the local matrix on a published page.
  for (const m of rig.matchAll(/label: '([^']*(?:seven|three months)[^']*)'/g)) {
    const after = rig.slice(rig.indexOf(m[0]), rig.indexOf(m[0]) + 400);
    assert.match(after, /pubLabel:/,
      `group label "${m[1]}" counts rows but has no pubLabel override`);
  }

  // And the cut has to be visible to a reader on the page, per sheet.
  assert.match(rig, /const PUB_NOTES = \{/);
  for (const id of ['break-progression', 'sets-locations-seasons'])
    assert.ok(new RegExp(`'${id}': \``).test(rig.slice(rig.indexOf('const PUB_NOTES'))),
      `no published-subset note for ${id}`);
  assert.match(rig, /All five clocks are kept in every row/);
});

test('published frames are re-encoded for the budget, but never measured after', () => {
  // The essay bundle is 9.9 MB. QA has to sit under it, not beside it — the
  // full-resolution PNG set was 54 MB, which would BE the deploy.
  assert.match(rig, /const PUB_W = /);
  // Published cells go through ONE call site, and that call site names WebP.
  assert.match(rig, /mime: 'image\/webp'/,
    'the published encode path does not name image/webp');
  // Silent PNG fallback would quietly ship ~4x the bytes, so the encoder's
  // actual output mime is checked rather than assumed.
  assert.match(rig, /if \(out\.mime !== mime\)\s*\n?\s*throw new Error/,
    'renderFrame does not check what mime the browser actually produced');

  // foamStats must run on the full-resolution capture. Measuring a downscaled,
  // lossily-encoded — or MARKED, or CROPPED — frame would make the pixel
  // corridor a measurement of the rig (MEASUREMENT_LESSONS 4: instruments that
  // score a replica certify the replica).
  const cap = rig.slice(rig.indexOf('async function captureSheet('));
  const shot = cap.indexOf('await page.screenshot()');
  const foam = cap.indexOf('foamStats(buf, live.stations)');
  const enc = cap.indexOf('encodeFrame(');
  const mark = cap.indexOf('renderFrame(encoder');
  assert.ok(shot >= 0 && foam > shot, 'foamStats does not read the raw screenshot buffer');
  assert.ok(enc > foam, 'the frame is encoded before it is measured');
  assert.ok(mark > foam, 'the frame is marked or cropped before it is measured');
  // And the marker must be drawn in the ENCODER page, never in the sim page —
  // an overlay there would be inside the screenshot foamStats reads.
  assert.ok(!/page\.evaluate\([^)]*drawMarker|addStyleTag|document\.body\.append/.test(rig),
    'something draws into the sim page, which the pixel corridor would then measure');

  // The run must report the achieved size, so the budget is measured.
  assert.match(rig, /against the 9\.9 MB essay bundle/);
});

test('published pages are emitted diff-clean', () => {
  assert.match(rig, /const cleanHTML = \(html\) => html\.replace\(\/\[ \\t\]\+\$\/gm, ''\)/);
  assert.match(rig, /writeFileSync\(join\(OUT, sheet\.file\), cleanHTML\(sheetHTML\(/);
  assert.match(rig, /writeFileSync\(join\(OUT, 'index\.html'\), cleanHTML\(indexHTML\(/);
});

// ---------------------------------------------------------------------------
// The break sheet's anchor, span and marker (2026-08-20).
//
// Two passes, two different bugs, both invisible in the numbers alone.
//
// SPAN. The columns spanned one full wave period at T/5. A crest advances
// exactly one crest spacing per period, so the tracked wave ended the row 0.80
// of a spacing along — 0.20 from where the NEXT wave upstream started — and the
// five columns read as five near-identical parallel lines. The ratio is
// site-independent (advance/spacing = dt/T cancels the local wavelength).
//
// ANCHOR, which survived the first fix. t* was the argmax of crest HEIGHT at
// the break line. A wave is tallest AT the line, and at the line it is already
// breaking, so the anchor sat at or after break onset BY CONSTRUCTION: column 1
// carried an established whitewater band and the tracked wave then decayed
// across the row. The row is now the wave's own measured break event.
// ---------------------------------------------------------------------------
test('the break sheet is anchored on a measured break event, not on peak height', () => {
  // The anchor must come from a transition the model reports, walked BACKWARD
  // from the set anchor — there is no forward-only way to find "before it
  // breaks" from a clock that already sits mid-break.
  assert.match(rig, /async function measureBreakEvent\(/);
  assert.match(rig, /const CREST_FOAM_PRE = /);
  assert.match(rig, /const CREST_FOAM_BREAK = /);
  assert.match(rig, /SET_ANCHOR_S - i \* dt/,
    'the event measurement does not walk time backwards from the set anchor');
  // FIRST rise then walk back, not last-quiet-clock: scanning backward from the
  // end finds a clock after the tracked wave has already broken.
  assert.match(rig, /if \(track\[i\]\.foam >= CREST_FOAM_BREAK\) \{ iBr = i; break; \}/);
  assert.match(rig, /if \(track\[i\]\.foam <= CREST_FOAM_PRE\) \{ iOn = i; break; \}/);
  // And the row is built on the event, not on the crest-height argmax.
  assert.match(rig, /const clocks = clocksFor\(sheet, st, crest, event\)/);
  assert.match(rig, /const t0 = ev\.tBreak - spanS/,
    'the window does not end at the measured break');
  assert.ok(!/times: Array\.from\(\{ length: n \}, \(_, k\) => crest\.tStar/.test(rig),
    'the row is still anchored on the crest-height argmax t*');
});

test('the break window is bounded so the sequence cannot alias onto the next wave', () => {
  // Parsed, not eval'd: the constant is a literal ratio or a decimal, and a
  // test that can run arbitrary source is not a test of the source.
  const m = rig.match(/const WAVE_SPAN_T = ([\d.]+)(?:\s*\/\s*([\d.]+))?\s*;/);
  assert.ok(m, 'no WAVE_SPAN_T in the rig, or it is not a literal ratio');
  const span = m[2] ? Number(m[1]) / Number(m[2]) : Number(m[1]);
  assert.ok(Number.isFinite(span), `WAVE_SPAN_T did not parse: ${m[0]}`);
  assert.ok(span > 0 && span <= 0.5,
    `WAVE_SPAN_T is ${span}: at or above half a period the tracked crest gets closer to `
    + 'its neighbour\'s slot than to its own, which is the aliasing the first pass replaced');
  assert.match(rig, /if \(spanS > WAVE_SPAN_T \* T\) \{ spanS = WAVE_SPAN_T \* T; clamped = true; \}/,
    'a measured event longer than the ceiling is not clamped');
  // The old full-period formula and its labels must be gone, not merely unused.
  assert.ok(!/crest\.tStar \+ \(k \* T\) \/ n/.test(rig),
    'the full-period column formula is still in the rig');
  assert.ok(!/'\+T\/5'|'\+2T\/5'/.test(rig), 'the +kT/5 column labels survive');
});

test('acceptance is measured, on the tracked crest, and can fail', () => {
  // The page must not be able to promise a break its frames do not contain.
  assert.match(rig, /const accept = \{ pass: Boolean\(rises\)/);
  assert.match(rig, /foamSeries\[0\] <= CREST_FOAM_PRE \* 3/,
    'acceptance does not require the row to START pre-break');
  assert.match(rig, /foamSeries\[foamSeries\.length - 1\] >= CREST_FOAM_BREAK/,
    'acceptance does not require the row to END broken');
  assert.match(rig, /ACCEPTANCE FAIL/, 'a failing row is not reported by the run');
  // Read ON the tracked crest, at the same station the window was derived at.
  // A fixed point in the water never goes quiet between waves at a point break,
  // which is how the first version reported foam 0.87 in a pre-break column.
  assert.match(rig, /const foamSeries = cells\.map\(\(c\) => \(c\.foamAtWatch/,
    'acceptance does not read the foam at the tracked crest at the watch station');
  // And a non-breaking row must be labelled rather than dressed up.
  assert.match(rig, /This row does not break/);
  assert.match(rig, /'crest intact', 'a quarter through', 'halfway', 'three quarters', 'crest gone'/,
    'a non-breaking row still gets break-promising column headers');
});

test('the tracked wave is a model read with its own error bar', () => {
  // The marker must come from the model, not from a pixel search or a constant:
  // a mark that is computed is falsifiable, and a mark that is placed is not.
  assert.match(rig, /function trackedWave\(/);
  assert.match(rig, /this wave's own breaking point/,
    'the ring is not documented as the tracked wave\'s own breaking point');
  // Withheld before the wave reaches the line, or it rings the PREVIOUS wave —
  // which is what the first pass did, and what the frames showed.
  assert.match(rig, /const RING_MIN_POCKET = /);
  assert.match(rig, /if \(bi >= 0 && ribbon\[bi\]\.pocket >= ringMin\)/);
  assert.match(rig, /no ring — not at the line yet/,
    'a pre-break cell does not say why it has no ring');
  // offM: how far the ring sits from the line it belongs on.
  assert.match(rig, /offLineM/);
  assert.match(rig, /ring off line/, 'the marker error is not on the page');
  // Break sheet only. The set sheet's columns are 2-3 carrier periods apart, so
  // one wave cannot be followed across them and a marker claiming otherwise
  // would be the exact error MEASUREMENT_LESSONS 12 is about.
  assert.match(rig, /if \(sheet\.clock\.kind === 'wave'\) \{\s*\n\s*marker = await page\.evaluate\(trackedWave/,
    'the marker is not gated to the wave sheet');
  const capture = rig.slice(rig.indexOf('async function captureSheet('));
  assert.match(capture, /const crop = sheet\.clock\.kind === 'wave' \? cropForRow/,
    'the crop is not gated to the wave sheet');
});

test('a row that cannot show a break is not published', () => {
  // day-small is H0 0.70 m at a site whose measured peel floor is 1.08 m: its
  // whitewater at the tracked crest peaks at 0.193 against 0.858-0.890 for
  // every row that breaks. It stays on the local sheet, labelled.
  const pubBlock = rig.slice(rig.indexOf('const PUB_ROWS = {'), rig.indexOf('const SHEETS = ['));
  const breakRow = pubBlock.match(/'break-progression': \[([^\]]*)\]/);
  assert.ok(breakRow, 'no published row list for the break sheet');
  assert.ok(!/day-small/.test(breakRow[1]),
    'day-small is published, but it does not break at Second Peak');
  // and the page has to say why, not silently drop it
  assert.match(rig, /Why the small end is not the smallest day/);
  assert.match(rig, /peel floor/);
});

test('framing is a crop, so the camera guarantees survive', () => {
  // MEASUREMENT_LESSONS 11: an instrument that re-frames itself on the signal is
  // not a fixed instrument. The crop is a pixel operation on an already-captured
  // frame, identical across a row, so camDriftM keeps meaning what it meant.
  assert.match(rig, /function cropForRow\(/);
  assert.match(rig, /const crop = sheet\.clock\.kind === 'wave' \? cropForRow\(cells, VIEW\) : null/);
  // One window per ROW, applied to every column: a per-column crop centred on
  // the breakpoint would hold the subject still and delete the motion the sheet
  // exists to show.
  const body = rig.slice(rig.indexOf('function cropForRow('), rig.indexOf('async function renderFrame('));
  assert.ok(/for \(const c of cells\)/.test(body),
    'cropForRow does not union over the row\'s columns');
  // Nothing may move the camera between columns.
  assert.ok(!/controls\.target\.set|camera\.position\.set|setCam\(/.test(rig),
    'the rig moves the camera, which would break the camDrift assertion');
  assert.match(rig, /camDriftM/);
  // And the row has to say on the page that it was cropped.
  assert.match(rig, /class="cropnote"/);
});
