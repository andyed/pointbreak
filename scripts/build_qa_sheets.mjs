// QA contact sheets — deterministic frame grids you can open and scan.
//
// ONE parameterised generator, driven by the SHEETS spec below. Each sheet is
// rows x 5 clock columns; each cell is a pinned capture labelled with the exact
// hash it was taken at (a live link into the app) plus numbers read off the
// running page. Adding a third sheet is a few lines in SHEETS.
//
// Usage:
//   node scripts/build_qa_sheets.mjs                      # both sheets -> qa/
//   node scripts/build_qa_sheets.mjs --sheets=break       # one sheet
//   node scripts/build_qa_sheets.mjs --port=8219 --out=qa
//   node scripts/build_qa_sheets.mjs --base=http://localhost:8127/  # reuse a server
//   node scripts/build_qa_sheets.mjs --limit=1                      # 1 row/group, smoke
//   node scripts/build_qa_sheets.mjs --html-only                    # re-render from JSON
//   node scripts/build_qa_sheets.mjs --mode=published --note='…'    # the published set
// Serves the repo itself via scripts/serve.py (cache OFF — see that file) on
// --port and kills it on exit, unless --base is given.
//
// PUBLISHING — CURRENT STATE, NOT AN ARCHIVE (2026-08-20)
//   These sheets back the visual essay at https://mindbendingpixels.com/pleasurepoint/.
//   There is exactly ONE published set, at qa/published/, and a new publish
//   REPLACES it. No dated directories, no manifest, no retention policy: the
//   question a reader has is "what does the model do now", and an archive
//   answers a question nobody asked while costing 54 MB a copy.
//
//   1. PROVENANCE. A current-state page needs its stamp MORE than an archive
//      would, because "current" is meaningless without saying current as of
//      WHAT. Every page and every JSON sidecar carries the build date, the
//      capture timestamp, the commit (short + full), the branch, whether the
//      tree was DIRTY, and an app digest — a SHA-256 over the exact files
//      build_site.py ships as sim/. There is no version string in the app to
//      read, so the digest is the app build's identity: it moves when the
//      shipped bytes move, which a commit sha does not do on a dirty tree. A
//      dirty build says so in a red banner at the top of every sheet, because a
//      published QA artifact built from uncommitted code cannot be reproduced
//      from its own stamp.
//   2. LINKS. --mode=local (default) points cell links at the house dev port;
//      --mode=published points them at ../sim/, the path the essay bundle
//      mirrors the app to. --linkbase= overrides either. A published page whose
//      links only resolve on one laptop is broken for every other reader.
//   3. SUBSAMPLING. Local mode is the working instrument and keeps the FULL
//      matrix (125 frames). Published mode emits a slim view of the same
//      instrument — see PUB_ROWS below for which rows survive and why. The
//      columns are never cut: on the break sheet the sequence IS the artifact,
//      and on the set sheet lull→peak→lull is the whole demonstration.
//   4. FRAME BUDGET. Published frames are downscaled and WebP-encoded in-browser
//      (canvas.toDataURL) rather than shipped at capture resolution. The essay
//      bundle is 9.9 MB; the published QA set has to sit under that, not beside
//      it. --pubwidth / --pubquality tune it; the run prints the achieved total.
//
// WHY THE CLOCKS ARE DERIVED, NOT PICKED
//   Sheet 1 (break progression) columns span ONE WAVE'S BREAK EVENT, measured
//   per row: from the last clock at which the model's foam AT THE TRACKED CREST
//   is still at or below CREST_FOAM_PRE to the first at which it reaches
//   CREST_FOAM_BREAK, at the takeoff station where a crest first meets the
//   line. Measured at Second Peak that is 3.85-4.40 s, i.e. 0.25-0.275 T, on
//   every row that breaks. See the two notes below for the two things this
//   replaced — a whole-period span, and then an anchor at peak crest height.
//   Sheet 2 (sets) columns span ONE SET BEAT 1/dF. setEnv peaks at the live
//   break line at t = SET_ANCHOR_S = 45 s by construction (#arm anchor: the
//   envelope is re-referenced to u_setRef, so the s/cg term cancels there), so
//   columns are 45 + (1/dF)*(0.5 + k/4), k = 0..4 — lull, building, PEAK,
//   easing, lull. Phase is read back per cell through the repo's own setEnv
//   twin fed from the live uniforms, never a re-derivation.
//
// WHY THE BREAK SHEET IS ANCHORED ON THE BREAK EVENT (2026-08-20, second pass)
//   The first pass below fixed the SPAN and left the ANCHOR wrong. Andy looked
//   at the rebuilt sheet and said it still did not make sense; opening the
//   frames rather than the numbers showed why. Column 1 already carried an
//   established whitewater band immediately up-line of the mark — foam_model
//   0.87 in the first column — and the tracked wave then DECAYED across the row
//   (cliff/day=small crest 2.98 -> 2.94 -> 2.85 -> 2.74 -> 2.71 m) instead of
//   breaking. The most salient moving thing in the sequence was the next
//   unbroken swell closing in from the top of frame, so the page annotated one
//   wave and showed another.
//
//   THE ANCHOR WAS THE BUG. t* was the argmax of crest HEIGHT on a transect
//   straddling the break line — and a wave is tallest AT the line, where it is
//   already breaking. The old anchor therefore sat at or after break onset by
//   construction. It was a correct measurement of the wrong instant, which is
//   the same shape of error as lesson 12 one level up.
//
//   Now the row IS the break event, measured per row (measureBreakEvent): from
//   the last clock at which the model's foam AT THE TRACKED CREST is still at
//   or below CREST_FOAM_PRE, to the first at which it reaches CREST_FOAM_BREAK,
//   at the takeoff station where a crest first meets the line. Reading foam at
//   the crest rather than at a fixed point in the water is the other half of
//   the fix: at a point break the bore left by previous waves never goes quiet
//   at a fixed station, which is exactly how a column whose wave had not broken
//   could report foam 0.87.
//
//   The marker follows: the ring is the largest `pocket` ALONG THE TRACKED
//   CREST — this wave's own breaking point — and is WITHHELD when that is below
//   RING_MIN_POCKET, so the pre-break columns carry no ring instead of ringing
//   the previous wave. An empty column 1 is what "still unbroken" looks like.
//
//   ACCEPTANCE, per row, printed by the run and on the page: foam at the tracked
//   crest must start pre-break and end broken. A row that cannot (day=small and
//   h0=0.7, both H0 0.70 m at a site whose measured peel floor is 1.08 m) is
//   LABELLED a non-breaking case and kept out of the published set rather than
//   given a header promising a break its frames do not contain.
//
// WHY THE BREAK SHEET NO LONGER SPANS A WHOLE PERIOD (2026-08-20, first pass)
//   It used to span one full T at T/5 per column, and the sequence very nearly
//   ALIASED BACK ONTO ITSELF. A crest advances exactly one crest spacing per
//   period, so k*T/5 puts the tracked wave k/5 of a spacing along: by column 5
//   it sits 0.8 of a spacing on, i.e. 0.2 of a spacing from where the NEXT wave
//   upstream sat in column 1. That ratio is not a property of the site — it
//   cancels the local wavelength exactly (advance/spacing = dt/T), so it was
//   0.8 on every row of the sheet, at every camera, at every H0. Andy's read of
//   the published page — "it's hard to see what's happening here... which wave
//   are we tracking?" — was the aliasing, not a rendering fault.
//
//   Two changes, both measured (scripts/measure_break_sequence.mjs):
//   1. SPAN. WAVE_SPAN_T = 1/4, columns T/16 apart, so the crest advances 0.25
//      of a spacing across the whole row instead of 0.80 and never approaches
//      its neighbour's slot. What still MOVES over that span is the thing a
//      point break is about: the breakpoint travels down the line at
//      Vp = c/sin(alpha), which is faster than c. Measured at Second Peak from
//      the anchor clock, the model's own zipper locus (pocket along the break
//      line) moves 37 -> 55 m of line at day=small (+17.6 m in 2.25 s) and
//      42 -> 88 m at day=big (+46.3 m in 4.25 s) while the crest itself
//      advances a quarter of a spacing. Laid out over a full T instead, the
//      same read comes back to where it started — 36/56/88/4/36 at day=small,
//      56/72/92/44/56 at day=modelcard — which is the aliasing as a number
//      rather than as an argument. Longer spans were also rejected from the
//      other side: at day=big the tracked wave has PEELED OFF THE STAGE END by
//      ~0.35 T (pocket 0.99 -> 0.00 between 0.30 T and 0.40 T), so a longer
//      sheet loses its own subject in the last columns whether or not it
//      aliases. Two bounds, two unrelated mechanisms, shorter one wins.
//   2. A MARKER. The tracked wave is identified at the anchor clock and drawn
//      in every column at its projected screen position (see trackedWave).
//      Computed from the model, so if it drifts off the crest the sheet is
//      reporting something real; markerOffM/markerOffPx are in the JSON and the
//      worst case is printed per row.
//
// WHY THE SET SHEET'S CREST IS AN ENVELOPE, NOT AN INSTANT (2026-08-19)
//   The crest at a fixed station is a CARRIER (period T = 12-15 s) inside a SET
//   ENVELOPE (period 1/dF = 125-167 s). The set sheet's columns are 1/(4dF) =
//   31-42 s apart, i.e. 2.1-3.5 carrier periods — a spacing with no relation to
//   T, so an instantaneous single-station read samples the carrier at an
//   arbitrary phase in every column and ALIASES it into a number the sheet
//   labels as the set. Measured at The Hook (drone, january, aim station
//   x = -14.5): the instantaneous crest at the five column clocks reads
//   1.04/3.63/3.13/1.25/0.98 m — a set that appears to peak in column 2 and be
//   half over by column 3 — while the same station swept every 1 s across that
//   beat carries waves of 2.11-5.30 m, the tallest arriving at t = 184 s, 3.9 s
//   (0.027 beat) BEFORE the column-3 clock. Column 3 just happens to land
//   between two waves there. So the set sheet reduces the aim station over ONE
//   FULL CARRIER PERIOD centred on its column clock (crestEnvM) and reports
//   that; the raw instant stays in the JSON as crestM. The wave-period sheet
//   keeps the instant — there the carrier IS the subject.
//   Widening the transect instead does NOT work and was measured: at the same
//   station and clock a +-135 m transect (three display wavelengths) reads 3.46
//   against the envelope's 5.27, because height also falls off away from the
//   break line, so a spatial max over deep water is not the local envelope.
//
// DETERMINISM
//   speed=0 & controls=0 & q=high pinned, fixed viewport, cold load through
//   about:blank per row (a hash-only goto on a warm page races the app's own
//   needsReloadForHash reload — see measure_peel_visibility.mjs). Column 0 is
//   captured straight off that cold load at #sim=t0; columns 1..4 advance the
//   clock with __pointbreak.setSim + two rAF ticks, the mode
//   capture_temporal.mjs validated against per-frame reloads.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync,
  readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

import { setEnv, SET_ANCHOR_S } from '../web-three/js/model-js.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// pointbreak ships no node_modules on purpose. Resolve Playwright from wherever
// it already exists. The sibling-repo probe walks every ANCESTOR of the repo
// root rather than assuming '../..' — inside a git worktree
// (.claude/worktrees/<id>/) the sibling is four levels further up, which is how
// the older rigs' hardcoded relative path misses it.
const PW_CANDIDATES = [process.env.PLAYWRIGHT_DIR];
for (let dir = ROOT; ; dir = dirname(dir)) {
  PW_CANDIDATES.push(join(dir, 'node_modules/playwright/index.mjs'));
  PW_CANDIDATES.push(join(dir, 'psychodeli-webgl-port/node_modules/playwright/index.mjs'));
  if (dirname(dir) === dir) break;
}
let chromium;
for (const c of PW_CANDIDATES.filter(Boolean)) {
  try { ({ chromium } = await import(c)); break; } catch { /* try next */ }
}
if (!chromium) {
  console.error('playwright not found. Set PLAYWRIGHT_DIR=/path/to/playwright/index.mjs');
  process.exit(1);
}
const args = process.argv.slice(2);
const flags = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => {
  const s = a.replace(/^--/, ''); const eq = s.indexOf('=');
  return eq < 0 ? [s, 'true'] : [s.slice(0, eq), s.slice(eq + 1)];
}));
const PORT = Number(flags.port || 8219);
const VIEW = { width: 1000, height: 625 };

// ---------------------------------------------------------------------------
// PROVENANCE — what a published sheet has to be able to say about itself.
// ---------------------------------------------------------------------------
function git(...a) {
  try { return execFileSync('git', a, { cwd: ROOT }).toString().trim(); }
  catch { return null; }
}
const COMMIT_FULL = git('rev-parse', 'HEAD') || 'unknown';
const COMMIT = git('rev-parse', '--short', 'HEAD') || 'unknown';
const BRANCH = git('rev-parse', '--abbrev-ref', 'HEAD') || 'unknown';
// Untracked files count. qa/ is gitignored so a previous snapshot never dirties
// a build; anything that DOES show here is real uncommitted state.
const DIRTY_FILES = (git('status', '--porcelain') || '').split('\n').filter(Boolean);
const DIRTY = DIRTY_FILES.length > 0;

// The app has no version string to read, so its identity is a digest over the
// exact files build_site.py mirrors to sim/ — the bytes a reader of a published
// sheet would actually be running when they click a cell. Unlike the commit sha
// this moves on a dirty tree, which is the case that needs an identity most.
const APP_FILES = [
  'web-three/index.html', 'shared/params.js', 'shared/model-glsl.js', 'shared/cdip.js',
  'data/model/pp_geo_profiles.js', 'data/model/pp_depth_patches.js',
  'data/climatology/pp_monthly_ocean.js',
];
function digestApp() {
  const h = createHash('sha256');
  const walk = (rel) => {
    const abs = join(ROOT, rel);
    if (!existsSync(abs)) return;
    const st = statSync(abs);
    if (st.isDirectory()) {
      for (const e of readdirSync(abs).sort()) walk(join(rel, e));
    } else if (/\.(js|html|css)$/.test(rel)) {
      h.update(rel); h.update(readFileSync(abs));
    }
  };
  for (const f of [...APP_FILES, 'web-three/js', 'web-three/css'].sort()) walk(f);
  return h.digest('hex').slice(0, 12);
}
const APP_DIGEST = digestApp();

const MODE = flags.mode === 'published' ? 'published' : 'local';
// ONE published set, replaced in place. qa/ (local) is the full working
// instrument; qa/published/ is what build_site.py ships.
const QA_ROOT = resolve(ROOT, flags.out || 'qa');
const OUT = MODE === 'published' ? join(QA_ROOT, 'published') : QA_ROOT;
const IMG = join(OUT, 'img');
const NOTE = flags.note || '';

// Published frame raster. MEASURED on two representative frames (a busy
// big-day cliff view and the subtle August lull at Second Peak, which is the
// hard case — faint structure on flat water):
//
//   encoding                    busy     subtle    x55 frames
//   source PNG 1000x625        217 KB    561 KB     11.7-30.1 MB
//   600x375  webp q0.82        6.9 KB   10.6 KB      0.37-0.57 MB
//   800x500  webp q0.88       13.0 KB   23.4 KB      0.70-1.26 MB
//   800x500  jpeg q0.85       26.4 KB   34.8 KB      1.42-1.87 MB
//
// WebP over JPEG on data, not preference: at 800 px it is 33-45% SMALLER than
// JPEG at a LOWER quality tier. Support is universal in any browser that can
// run the WebGL sim this page links into, so it costs no reader anything.
//
// 800 px over 600 px on legibility. 600 stays under budget too, but the fine
// foam speckle and the thin dark break line visibly soften there, and judging
// those is what a contact sheet is FOR — a cell too compressed to read is
// worthless however small it is. 800 is 2.7x the ~301 px a cell occupies in
// the 1760 px grid, so it is retina-sharp where it is displayed and still
// useful opened on its own. The whole published set lands near 1.2 MB against
// a 9.9 MB essay bundle, so the headroom is better spent here than saved.
const PUB_W = Math.max(120, Number(flags.pubwidth || 800));
const PUB_H = Math.round((PUB_W * VIEW.height) / VIEW.width);
const PUB_QUALITY = Math.min(1, Math.max(0.3, Number(flags.pubquality || 0.88)));

// Where the CELL LINKS point. Deliberately NOT the capture server: captures run
// on their own short-lived port so they never touch the dev server you are
// reading the sheet on, but a link into a dead port is useless.
//   local     — 8127, the house dev port (scripts/serve.py default).
//   published — ../sim/, relative from qa/<sheet>.html up to the essay bundle
//               root, where build_site.py mirrors the app. Kept relative so the
//               bundle survives a domain or path move.
const LINK_DEFAULT = MODE === 'published' ? '../sim/' : 'http://localhost:8127/';
const LINK_BASE = (flags.linkbase || LINK_DEFAULT).replace(/\/?$/, '/');

const ESSAY_URL = 'https://mindbendingpixels.com/pleasurepoint/';
const REPO_URL = 'https://github.com/andyed/pointbreak';
const COMMIT_URL = `${REPO_URL}/commit/${COMMIT_FULL}`;
// Whitewater luma levels. 205 is the level the #wwarea A/B is quoted at in
// docs/CONTROLS.md; 160 is its looser companion. Both reported so a cell that
// is "nearly breaking" is distinguishable from flat water.
const FOAM_HI = 205, FOAM_LO = 160;
// Attachment corridor, WORLD metres relative to the break line (+ = shoreward).
// A fixed pixel band does not work: measured at sewers/drone/month=january the
// projected baked line sits at py ~300 while the drawn whitewater bands sit at
// py 320-470, so a +-14 px band read 0.3% foam on a frame with three fat foam
// lines in it — and read HIGHER on August than on January, which is backwards.
// The corridor is the same construction measure_peel_visibility.mjs uses (the
// bright core migrates shoreward inside it as the front advances, so a point
// sample under-reads by construction), widened to +45 m to cover the bore.
const CORRIDOR_M = [-15, 45];
const CORRIDOR_N = 25;   // samples per station across the corridor

// ---------------------------------------------------------------------------
// THE TRACKED WAVE — span, marker, framing (2026-08-20)
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// THE BREAK EVENT — where the row starts and stops (2026-08-20, second pass)
// ---------------------------------------------------------------------------
// The first pass fixed the span and left the ANCHOR wrong, and the frames said
// so: column 1 already carried an established whitewater band up-line of the
// mark, and the tracked wave then decayed across the row instead of breaking
// (cliff/day=small crest 2.98 -> 2.71 m, foam_model 0.87 in COLUMN ONE).
//
// The cause: t* was the argmax of crest HEIGHT on a transect straddling the
// break line. A wave is tallest at the line, and at the line it is already
// breaking — so the old anchor sat at or after break onset by construction. It
// was a correct measurement of the wrong instant.
//
// The row is now anchored and spanned by the BREAK EVENT of the tracked wave,
// read off the model's own per-wave channels AT THE CREST (not at a fixed point
// in the water, where the ambient bore from previous waves never goes quiet):
//
//   foam  whitewater at the crest -> is THIS wave breaking
//   brk   surf-zone mask          -> has THIS wave entered the surf zone
//   crest crestNear*(1-brk)       -> the unbroken-crest indicator; dies at the break
//
// The window runs from the last clock at which foam-at-the-crest is still at or
// below CREST_FOAM_PRE to the first at which it reaches CREST_FOAM_BREAK.
//
// THE THRESHOLD IS MEASURED, NOT PICKED. Swept at T/40 across 1.8 T at each
// row's takeoff station, the bank is bimodal in peak foam-at-the-crest: the
// rows that break reach a plateau at 0.858 / 0.888 / 0.890 / 0.890, and the
// rows that do not top out at 0.193 and 0.341. Nothing lands between 0.35 and
// 0.85, so 0.60 sits in an empty gap rather than on a slope.
const CREST_FOAM_PRE = 0.02;
const CREST_FOAM_BREAK = 0.60;

// What the measured event turns out to be. All four breaking rows at Second
// Peak span 0.25-0.275 T from "still unbroken" to "whitewater at the crest"
// (3.85 / 4.40 / 4.25 / 3.85 s at T = 14 / 16 / 17 / 14), so the break event
// has a near-constant duration in periods even though the periods differ by
// 20%. The span is taken from each row's own measurement, not from this number.
//
// WAVE_SPAN_T is now only a CEILING, kept for the aliasing bound: the crest
// advances exactly (span/T) crest spacings whatever the site, so a span at or
// above half a period puts the tracked wave nearer its neighbour's place than
// its own. A row whose measured event is longer than this is clamped to it,
// ending at the break, and says so.
const WAVE_SPAN_T = 1 / 2;

// A row that never reaches CREST_FOAM_BREAK does not break, and no span can
// make it. It falls back to the crest indicator's own collapse — the last clock
// fully unbroken (>= this) to the first with the crest gone (<= the second) —
// and is LABELLED as a non-breaking case rather than given a header that
// promises a break the frames do not contain. It is also kept out of the
// published set (PUB_ROWS).
const CREST_IND_FULL = 0.90, CREST_IND_GONE = 0.05;

// How far the crest ribbon reaches, in metres of break line either side of the
// breakpoint. Asymmetric because the shoulder AHEAD of the peel (+x, down the
// point) is the part of the wave still to break, and that is the half worth
// marking. The indicator it follows is crestNear*(1-brk)*env^2 (model-glsl
// `crest`), which lives on the unbroken shoulder and dies in the whitewater, so
// the ribbon also ends at the peel by itself rather than by a rule.
// Both reaches are kept SHORT on purpose: a ribbon long enough to leave the
// frame stops reading as a mark ON something and starts reading as a rule drawn
// ACROSS the picture, which is the opposite of unobtrusive. Measured at
// cliff/day=small, where a 135 m ribbon spanned 1086 px of a 1000 px frame.
const RIB_BACK_M = 22, RIB_FWD_M = 58, RIB_STEP_M = 4;
const RIB_HALF_M = 22, RIB_N = 89;      // shore-normal search window per station
const LINE_STEP_M = 4;                   // break-line stations for the pocket scan

// Marker ink. NOT text (WCAG 1.4.3 does not apply), but it has to survive both
// near-black water and blown-out foam, so every stroke is drawn twice: a dark
// casing first, the amber over it. Amber is --warn, the same token the sheet
// uses for "look here".
const MARK_INK = 'rgba(255,209,102,0.95)';
const MARK_CASE = 'rgba(0,0,0,0.5)';

// Framing. The cell is cropped to a window that contains the tracked wave
// across ALL FIVE columns of its row — one window per row, so the wave moves
// through a fixed frame rather than being re-centred out of its own motion.
// The camera is never touched, so the row's camera drift stays 0.00 m and the
// cell hash still reproduces the full frame in the simulator.
const CROP_PAD = 0.35;      // of the marker bbox's larger side, each way
const CROP_MIN_FRAC = 0.42; // never crop below this fraction of frame width
const CROP_MAX_ZOOM = 2.4;  // and never magnify more than this
// Below this the crop is not worth the caveat it costs: a row that says
// "cropped to 993x621, 1.01x closer" has traded an honest full frame for a
// footnote and 7 px. Measured at cliff/h0=0.7, whose breakpoint travels 52 m,
// so its five-column bbox is nearly the frame.
const CROP_MIN_ZOOM = 1.06;
// The crop is framed on the SUBJECT, which is the breakpoint and the water
// immediately either side of it — not on the whole ribbon. A cliff camera looks
// nearly along the line, so even 80 m of crest projects across the frame and a
// bbox over all of it would ask for no crop at all.
const CROP_REACH_M = 40;

// The ring is withheld below this. pocket is crestNear*bell(d)*env^2*reef read
// along the crest, so it is the model's own "this wave is at the line here";
// before the tracked wave arrives it is small everywhere, and a ring placed
// anyway would be sitting on the PREVIOUS wave. Column 1 is meant to have no
// ring — that is what "still unbroken" looks like.
const RING_MIN_POCKET = 0.10;

const GENERATED = new Date();

// The block that rides into every page AND every JSON sidecar. `capturedAt` is
// the sim's own capture run; `builtAt` is when the page was emitted. They differ
// under --html-only, which re-renders old frames — the frames are the capture's,
// so the page must not claim they are today's.
const PROVENANCE = {
  capturedAt: GENERATED.toISOString(),
  commit: COMMIT, commitFull: COMMIT_FULL, branch: BRANCH,
  dirty: DIRTY, dirtyCount: DIRTY_FILES.length,
  dirtyFiles: DIRTY_FILES.slice(0, 40),
  appDigest: APP_DIGEST, appDigestAlgo: 'sha256/12 over the files build_site.py ships as sim/',
  mode: MODE, note: NOTE,
  essayUrl: ESSAY_URL, repoUrl: REPO_URL, commitUrl: COMMIT_URL,
};

// ---------------------------------------------------------------------------
// SHEET SPEC — the whole configuration surface. A sheet is:
//   { id, title, blurb, clock, notes[], groups[{ id, label, note, base, rows[] }] }
// A row is { id, label, sub, hash } — `hash` is appended to the group's base.
// ---------------------------------------------------------------------------

// Sheet 1 rows. The four curated condition bundles (web-three/js/conditions.js)
// move H0 AND T AND tide AND dF together, which is what a real day does; the
// two h0-only rows move height alone against the site card's own period/tide,
// so the sheet can separate "bigger day" from "bigger swell".
const BREAK_ROWS = [
  { id: 'day-small', label: 'small summer windswell', sub: 'bundle · day=small', hash: 'day=small' },
  { id: 'day-modelcard', label: 'model-card day', sub: 'bundle · day=modelcard', hash: 'day=modelcard' },
  { id: 'day-overhead', label: 'overhead WNW, low tide', sub: 'bundle · day=overhead', hash: 'day=overhead' },
  { id: 'day-big', label: 'big clean groundswell', sub: 'bundle · day=big', hash: 'day=big' },
  { id: 'h0-low', label: 'H₀ 0.7 m only', sub: 'height only · h0=0.7', hash: 'h0=0.7' },
  { id: 'h0-high', label: 'H₀ 2.5 m only', sub: 'height only · h0=2.5', hash: 'h0=2.5' },
];

const PRESET_LABELS = {
  sewers: 'Sewers', firstpeak: 'First Peak', secondpeak: 'Second Peak',
  jacks: "Jack's (38th)", thehook: 'The Hook', sharks: 'Sharks',
  privates: 'Privates',
};
const PRESET_NOTE = { privates: 'synthetic stage — no measured bed' };
const LOCATION_KEYS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks', 'privates'];
const SEASON_PRESETS = ['sewers', 'secondpeak'];
const SEASON_MONTHS = [
  { key: 'january', label: 'January', note: 'the big month — H₀ p75 1.245 m' },
  { key: 'october', label: 'October', note: 'autumn shoulder — H₀ p75 0.801 m' },
  { key: 'august', label: 'August', note: 'the flat one — H₀ p75 0.585 m; ZERO hours ≥ 1.3 m in 25 years' },
];

// ---------------------------------------------------------------------------
// WHAT THE PUBLISHED SET KEEPS, AND WHY
//
// Local mode is the working instrument: the full matrix, 125 frames. Published
// mode is a slim view of the SAME instrument, cut on ROWS only.
//
// Columns are never cut. On the break sheet the five clocks across the tracked
// wave's quarter-period ARE the artifact — a progression reduced to three shots
// stops showing progression. On the set sheet the five columns are lull →
// building → PEAK → easing → lull, which is the entire demonstration that the
// envelope floor work exists to make; drop the lulls and the page argues nothing.
//
// Rows are where the redundancy is:
//   BREAK — small vs big, two bundle rows instead of six. A bundle moves H0, T,
//     tide and df together the way a real day does, so the pair carries the size
//     story end to end (0.70 m / T 9 s against 2.50 m / T 17 s). The two h0-only
//     rows exist to separate height from period, which is a QA question, not a
//     reader's. day=modelcard and day=overhead sit between the two kept rows.
//   SETS/locations — Sewers, Second Peak, Privates instead of all seven. Those
//     three span the shipped Iribarren range end to end (xi 1.15 the most
//     plunging, 0.65 the most spilling) and include the ONE synthetic-stage
//     site, which is where the n/a honesty story lives. The four dropped sites
//     interpolate between the two mapped ones.
//   SETS/seasons — January vs August only, on both presets. Those are the
//     extremes the CDIP climatology actually settles (p75 1.245 m against
//     0.585 m, and zero hours at or above 1.3 m in 25 Augusts). October is the
//     shoulder: it is there to catch a monotonicity break, which is QA.
//
// Every sheet says on the page what the full local matrix covers, so the cut is
// visible to a reader rather than silently presented as the whole instrument.
const PUB_ROWS = {
  // day-small is NOT here, and that is a measurement rather than a taste. At
  // H0 = 0.70 m Second Peak sits below its own measured 1.08 m peel floor, and
  // the wave never breaks properly: whitewater at the tracked crest peaks at
  // 0.193 against the 0.858-0.890 every breaking row reaches. A published row
  // whose header promises a break the frames do not contain is the thing this
  // page exists not to do, so the small end published here is the smallest day
  // that DOES break. day-small stays on the local sheet, labelled.
  'break-progression': ['day-modelcard', 'day-big'],
  'sets-locations-seasons': [
    'loc-sewers', 'loc-secondpeak', 'loc-privates',
    'sea-sewers-january', 'sea-sewers-august',
    'sea-secondpeak-january', 'sea-secondpeak-august',
  ],
};

const SHEETS = [
  {
    id: 'break-progression',
    file: 'break-progression.html',
    title: 'Break progression',
    blurb: 'ONE wave through its own break: five clocks from the last at which it is still unbroken '
      + 'to the first at which its crest is whitewater, marked in every frame. The window is that '
      + 'wave\'s measured break event, not a fixed slice of the period. Six wave sizes — two of which '
      + 'do not break, and say so.',
    // Published mode ships a row subset, so the standing description of the
    // sheet has to match the page a reader is actually looking at. A lede that
    // promises six rows over a two-row grid is its own small dishonesty.
    pubBlurb: 'ONE wave through its own break: five clocks from the last at which it is still '
      + 'unbroken to the first at which its crest is whitewater, marked in every frame. The window '
      + 'is that wave\'s measured break event, not a fixed slice of the period. The two ends of the '
      + 'range that breaks here.',
    clock: { kind: 'wave', n: 5 },
    groups: [
      {
        id: 'cliff', label: 'Cliff camera — low, in profile',
        note: 'The low profile view is where a break reads: throw, curtain and the collapse behind it are all edge-on. '
            + 'Site is Second Peak, chosen over the more plunging Sewers (ξ 1.15) because Sewers puts its bluff across the '
            + 'lower half of the cliff frame at small sizes, which occludes the break line rather than showing it.',
        base: 'preset=secondpeak&cam=cliff', rows: BREAK_ROWS,
        // LOCAL ONLY, and for the same reason day-small is: the frames do not
        // carry the claim. From the cliff stand the break is several hundred
        // metres off, so the tracked crest lands within ~20 px of the horizon
        // and the whitewater burst that the acceptance series measures at 0.86
        // is a few pixels of grey. The crop cannot rescue it — it is bounded at
        // 2.4x before upsampling goes soft, and going closer means capturing at
        // a higher device scale factor, which moves the pixel-corridor
        // coordinates foamStats depends on (deliberate work, not a side effect).
        // The drone group shows the same rows, same derived clocks, legibly.
        pubDrop: true,
      },
      {
        id: 'cover', label: 'Cover camera — the close-up',
        note: 'The same wave and the same derived clocks from 16 m, at eye height on the face side, riding the '
            + 'travelling breakpoint. This row exists to answer a different question from the other two: not '
            + '"is the model right" but "is the SURFACE convincing as water" — the magazine-cover question, which '
            + 'no stage-scale camera can be pointed at. Read it for material and light, not for peel geometry: '
            + 'tonal separation between wave and sky, whether the lip is an edge or a smear, whether whitewater is '
            + 'a material or a gradient, and whether the surface carries any detail at all this close.',
        base: 'preset=secondpeak&cam=cover', rows: BREAK_ROWS,
        // LOCAL ONLY for now. The close-up is a NEW camera (2026-08-22) and its
        // framing has had exactly one live look; publishing a cover-readiness
        // claim off a shot nobody has signed off is the same error the cliff
        // group's pubDrop guards against, in the other direction. Promote it
        // once the framing is settled.
        pubDrop: true,
      },
      {
        id: 'cover-curl', label: 'Cover camera — the #curl bundle (Sewers)',
        note: 'The OPT-IN lip arm, at the stack the 2026-08-25 live session judged — '
            + 'curl=1&lip=1&curtain=1&look=foam&sapp=0.22&onset=1, all default OFF. Site is Sewers, not '
            + 'Second Peak: the bend and its curtain gate on plunge, and at ξ 0.65 (Second Peak) the lip '
            + 'barely goes over, so a bundle group there would show frames that do not carry the claim. '
            + 'Sewers (ξ 1.15) reaches the 132° bend backstop; the cover camera rides the breakpoint at '
            + '16 m, so the bluff that keeps Sewers off the cliff group does not occlude here. Read it for '
            + 'the bundle’s claims in order: the lip is a tube with thickness, not a translated sheet '
            + '(#curl); the space under it is closed by falling water (#curtain); whitewater is a '
            + 'perforated material, not a smooth blur (#look=foam); the approach term at 0.22 keeps the '
            + 'crest an arcing lip rather than a straight-edged deck (#sapp); over-ceiling breaking water '
            + 'bends down to its ceiling instead of standing as a box (#earn, rides with #curl); and the '
            + 'overturn develops BEHIND the zipper head (#onset) — verdict 2026-08-25: "big improvement, '
            + 'no more flying saucers". KNOWN MISSING, same verdict: the crash — the lip lands with no '
            + 'impact event.',
        base: 'preset=sewers&cam=cover&curl=1&lip=1&curtain=1&look=foam&sapp=0.22&onset=1',
        rows: BREAK_ROWS,
        // LOCAL ONLY, structurally: published QA is CURRENT STATE, and an
        // opt-in arm is not the current state — publishing it would claim the
        // shipped model draws a curtain it does not draw. Promote only if the
        // bundle itself is promoted to default.
        pubDrop: true,
      },
      {
        id: 'drone-curl', label: 'Drone camera — the #curl bundle from above (Sewers)',
        note: 'The same judged stack, plan view — this is the shot that convicted the "flying saucer" '
            + '(2026-08-25): the pocket bell extends ~25 m ahead of the travelling breakpoint, and before '
            + '#onset it handed that unbroken water the mature fold reach, drawing a detached white plate '
            + 'off the END of each whitewater line, moated by the stretch band. Read the line ENDS: they '
            + 'must feather out into foam, never dock a plate. The head keeps a compact nascent fold '
            + '(the overturn develops over ~0.2T behind the head, Basco’s plunge cycle) and the '
            + 'sim 39 head block stays at its ceiling (fill 1.011 — the #earn floor is not suppressed at '
            + 'onset; the first cut of #onset was, and the block stood back up at 1.414).',
        base: 'preset=sewers&cam=drone&curl=1&lip=1&curtain=1&look=foam&sapp=0.22&onset=1',
        rows: BREAK_ROWS,
        // LOCAL ONLY: same structural rule as cover-curl above.
        pubDrop: true,
      },
      {
        id: 'drone', label: 'Drone camera — overhead',
        note: 'Same six rows, same derived clocks, from above: this is where the along-crest peel (the zipper) reads instead. Tilted 15° off nadir since 2026-08-22 — it stood at 6.25°, near enough to straight down that a crest had no silhouette and the shot could only show the plan of the break, never its form.',
        base: 'preset=secondpeak&cam=drone', rows: BREAK_ROWS,
      },
    ],
  },
  {
    id: 'sets-locations-seasons',
    file: 'sets-locations-seasons.html',
    title: 'Sets — locations × seasons',
    blurb: 'Five clocks across one set beat 1/Δf, phased lull → building → peak → easing → lull.',
    clock: { kind: 'set', n: 5 },
    groups: [
      {
        id: 'locations', label: 'Locations — all seven presets, month=january',
        pubLabel: 'Locations — three presets, month=january',
        note: 'The location axis: every shipped site preset at the same climatological month, so what differs between rows is the reef.',
        pubNote: 'The location axis: three shipped site presets at the same climatological month, so what differs '
            + 'between rows is the reef. Sewers and Second Peak are the ends of the breaker-character range '
            + '(ξ 1.15 against 0.65); Privates is the synthetic-stage site.',
        base: 'cam=drone',
        rows: LOCATION_KEYS.map((k) => ({
          id: `loc-${k}`, label: PRESET_LABELS[k],
          sub: `preset=${k}` + (PRESET_NOTE[k] ? ` · ${PRESET_NOTE[k]}` : ''),
          hash: `preset=${k}&month=january`,
        })),
      },
      {
        id: 'seasons', label: 'Seasons — two presets × three months',
        pubLabel: 'Seasons — two presets × two months',
        note: 'The season axis: January (peak), October (shoulder), August (flat). Sewers and Second Peak only — see "What was left out".',
        pubNote: 'The season axis at its two extremes: January (the peak month, H₀ p75 1.245 m) against August '
            + '(the flat one, 0.585 m). Sewers and Second Peak only — see "What was left out".',
        base: 'cam=drone',
        rows: SEASON_PRESETS.flatMap((p) => SEASON_MONTHS.map((m) => ({
          id: `sea-${p}-${m.key}`, label: `${PRESET_LABELS[p]} · ${m.label}`,
          sub: m.note, hash: `preset=${p}&month=${m.key}`,
        }))),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// PNG decode (no deps; mirrors measure_peel_visibility.mjs)
// ---------------------------------------------------------------------------
function decodePNG(buf) {
  let off = 8, w = 0, h = 0, colorType = 0; const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); colorType = data[9]; }
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const ch = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = w * ch;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = out.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? cur[i - ch] : 0, b = prev[i], c = i >= ch ? prev[i - ch] : 0;
      let v = line[i];
      if (f === 1) v += a; else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += (pa <= pb && pa <= pc) ? a : (pb <= pc ? b : c);
      }
      cur[i] = v & 0xff;
    }
    prev = cur;
  }
  return { w, h, ch, data: out };
}

// Bright-pixel statistics over the attachment corridor. This is the pixel-side
// answer to "did anything actually break here" — independent of the model-side
// pocket/brk read, so a cell where the two disagree is visible rather than
// silently averaged away.
//
// Each station contributes CORRIDOR_N samples interpolated between its two
// projected corridor endpoints (projection is near-affine over 60 m, so two
// endpoints suffice). Each sample is the MAX luma of its 3x3 neighbourhood, not
// the mean: the shipped foam is a speckled cellular texture, and a 3x3 mean over
// it fell below the 205 level on frames that plainly carry whitewater (measured
// at secondpeak/drone/month=october, 0.0% by mean against modelFoam 0.32). Max
// is the right reducer for "is there whitewater in this patch".
function foamStats(pngBuf, stations) {
  const { w, h, ch, data } = decodePNG(pngBuf);
  const meanAt = (px, py) => {
    let m = -Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = Math.round(px) + dx, y = Math.round(py) + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const o = (y * w + x) * ch;
      const L = 0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2];
      if (L > m) m = L;
    }
    return Number.isFinite(m) ? m : NaN;
  };
  let n = 0, hi = 0, lo = 0, max = 0, sum = 0;
  for (const s of stations) {
    for (let i = 0; i < CORRIDOR_N; i++) {
      const f = i / (CORRIDOR_N - 1);
      const L = meanAt(s.pxA + (s.pxB - s.pxA) * f, s.pyA + (s.pyB - s.pyA) * f);
      if (!Number.isFinite(L)) continue;
      n++; sum += L; if (L >= FOAM_HI) hi++; if (L >= FOAM_LO) lo++;
      if (L > max) max = L;
    }
  }
  return n
    ? { bandPx: n, fracHi: hi / n, fracLo: lo / n, maxLuma: +max.toFixed(1), meanLuma: +(sum / n).toFixed(1) }
    : { bandPx: 0, fracHi: 0, fracLo: 0, maxLuma: 0, meanLuma: 0 };
}

// ---------------------------------------------------------------------------
// In-page probes
// ---------------------------------------------------------------------------

// Everything the sheet needs about the state a cell was captured in, plus the
// break line projected into frame pixels (live camera matrices, so it follows
// whichever cam preset the row asked for).
function readState(CORR) {
  const pb = window.__pointbreak;
  const u = pb.uniforms, st = pb.state;
  const cam = pb.camera;
  cam.updateMatrixWorld(true);
  const W = innerWidth, H = innerHeight;
  const proj = (x, y, z) => {
    const v = new (cam.position.constructor)(x, y, z); v.project(cam);
    return { px: (v.x * 0.5 + 0.5) * W, py: (1 - (v.y * 0.5 + 0.5)) * H, ndcZ: v.z };
  };
  // lineProbe returns the BAKE only. The GLSL breakLine() the foam attaches to
  // is that plus the sections term, which pulls patches up to sections*55 m
  // SEAWARD; mirror it here (double-precision twin of the GLSL hash, same as
  // measure_peel_visibility.mjs) or the corridor is offset by up to 22 m at
  // Sewers.
  const fractf = (v) => v - Math.floor(v);
  const hash11 = (p) => { p = fractf(p * 0.1031); p *= p + 33.33; return fractf((p + p) * p); };
  const vnoise1 = (v) => {
    const i = Math.floor(v); let f = v - i; f = f * f * (3 - 2 * f);
    return hash11(i) + (hash11(i + 1) - hash11(i)) * f;
  };
  const secU = u.u_sections.value;
  const secShift = (x) => (secU >= 0.05
    ? Math.min(secU * 55 * (vnoise1(x * 0.02 + 7.3) - 0.5) * 2, 0) : 0);
  const line = pb.lineProbe(6) || [];
  const stations = line.map((p) => {
    const zg = p.z + secShift(p.x);
    const s = proj(p.x, 0, zg);
    const a = proj(p.x, 0, zg + CORR[0]), b = proj(p.x, 0, zg + CORR[1]);
    return { x: p.x, z: zg, px: s.px, py: s.py, gap: p.gap,
      pxA: a.px, pyA: a.py, pxB: b.px, pyB: b.py,
      visible: s.px >= 0 && s.px < W && s.py >= 0 && s.py < H && s.ndcZ < 1 };
  }).filter((s) => s.visible && !(s.gap > 0.5));
  const aim = pb.aimProbe ? pb.aimProbe() : null;
  const hud = (id) => (document.getElementById(id)?.textContent || '').trim();
  return {
    sim: pb.sim(),
    preset: st.preset, day: pb.day(),
    // main.js reads tide as `state.tide || 0` everywhere and never initialises
    // it, so a row that sets no tide (h0=/month= rows) has it undefined here.
    H0: st.H0, T: st.T, dF: st.dF, tide: st.tide || 0, chop: st.chop, xi: st.xi, alpha: st.alpha,
    setRef: u.u_setRef.value, setAnchor: u.u_setAnchor.value,
    setDepth: u.u_setDepth.value, cgLegacy: u.u_cgLegacy.value > 0.5,
    quality: u.u_cell ? [u.u_cell.value.x, u.u_cell.value.y] : null,
    camera: cam.position.toArray().map((v) => +v.toFixed(2)),
    target: pb.controls.target.toArray().map((v) => +v.toFixed(2)),
    aim: aim && aim.raw ? { x: +aim.raw.x.toFixed(1), z: +aim.raw.z.toFixed(1), errDeg: aim.errDeg } : null,
    hudGeo: hud('hudGeo'), hudAlpha: hud('hudAlpha'), hudSwell: hud('hudSwell'),
    stations,
  };
}

// GPU read of the displaced surface on a short shore-normal transect straddling
// the break line at world x. Returns the crest height and the model's own
// breaking bookkeeping there, so "the wave is 2.1 m and breaking" and "the wave
// is 0.4 m and not" are separable without looking at a picture.
function probeTransect({ x, zLine, halfM, n }) {
  const rows = window.__pointbreak.curlProbe(x, zLine - halfM, zLine + halfM, n);
  if (!rows || !rows.length) return null;
  let crest = -Infinity, foam = 0, brk = 0, pocket = 0, ceil = null;
  for (const r of rows) {
    if (r.land > 0.5) continue;
    if (r.y > crest) crest = r.y;
    foam = Math.max(foam, r.foam); brk = Math.max(brk, r.brk);
    pocket = Math.max(pocket, r.pocket);
    // curlProbe returns ceil = null where there is no measured bed. Folding a
    // null into Math.max would print it as 0; carrying it through prints n/a.
    if (r.ceil !== null) ceil = Math.max(ceil ?? 0, r.ceil);
  }
  return Number.isFinite(crest)
    ? { crest, foam, brk, pocket, ceil } : null;
}

// ---------------------------------------------------------------------------
// THE TRACKED WAVE
//
// Answers "which wave am I looking at" with the model's own bookkeeping rather
// than with a hand-placed annotation, so the marker is falsifiable: if it drifts
// off the crest the sheet is telling you something about the model.
//
//   BREAKPOINT. `pocket` in model-glsl is
//       crestNear(thetaL) * bell(d) * env^2 * reef,
//   and d = breakLine(x) - z is zero ON the line, so sampled along the line the
//   bell is 1 and pocket IS the crest-proximity bell: it peaks exactly where a
//   crest is crossing. The shader's own comment calls it "the zipper's locus".
//   The breakpoint is the parabola-refined argmax of that scan over the stage.
//   Across columns the argmax is scored with a small distance penalty from the
//   PREVIOUS column's breakpoint, so the row follows one wave rather than
//   hopping to whichever crest happens to be tallest (the same continuity
//   discipline m4RideSolve uses, and lesson 8's "change the selection").
//
//   RIBBON. From the breakpoint, march out along x and take the argmax of the
//   `crest` channel on a shore-normal window, seeded at the previous station's
//   z. That channel is crestNear*(1-brk)*env^2, so it follows the crest LOCUS
//   (carrier phase, not the skewed shape — see the thetaL note in model-glsl)
//   and switches itself off inside the whitewater. The ribbon therefore ends at
//   the peel without being told to.
//
//   SELF-CHECK. offM is the distance from the breakpoint to the tallest
//   displaced surface point on a shore-normal transect at the same station —
//   i.e. how far the marker sits from the crest it claims to be on. It is
//   carried per cell into the JSON and the worst case is printed per row.
//
// Camera use is read-only and identical to readState's: live matrices, so the
// marker follows whichever cam preset the row asked for. Nothing here moves the
// clock, the camera or any uniform.
function trackedWave({ watchX, seedZ, lineStep, ribStep, ribBack, ribFwd, ribHalf, ribN, ringMin }) {
  const pb = window.__pointbreak;
  const cam = pb.camera;
  cam.updateMatrixWorld(true);
  const W = innerWidth, H = innerHeight;
  const proj = (x, y, z) => {
    const v = new (cam.position.constructor)(x, y, z); v.project(cam);
    return { px: (v.x * 0.5 + 0.5) * W, py: (1 - (v.y * 0.5 + 0.5)) * H, ndcZ: v.z };
  };
  // Same line construction as readState: the bake plus the sections shift, or
  // the corridor and the marker would describe different lines.
  const fractf = (v) => v - Math.floor(v);
  const hash11 = (p) => { p = fractf(p * 0.1031); p *= p + 33.33; return fractf((p + p) * p); };
  const vnoise1 = (v) => {
    const i = Math.floor(v); let f = v - i; f = f * f * (3 - 2 * f);
    return hash11(i) + (hash11(i + 1) - hash11(i)) * f;
  };
  const secU = pb.uniforms.u_sections.value;
  const secShift = (x) => (secU >= 0.05
    ? Math.min(secU * 55 * (vnoise1(x * 0.02 + 7.3) - 0.5) * 2, 0) : 0);
  const raw = pb.lineProbe(lineStep) || [];
  if (!raw.length) return { baked: false, bp: null, ribbon: [] };
  const line = raw.map((p) => ({ x: p.x, z: p.z + secShift(p.x), gap: Boolean(p.gap) }));
  const zbAt = (x) => {
    if (x <= line[0].x) return line[0].z;
    if (x >= line[line.length - 1].x) return line[line.length - 1].z;
    for (let i = 1; i < line.length; i++) if (line[i].x >= x) {
      const a = line[i - 1], b = line[i];
      return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x);
    }
    return 0;
  };
  const sa = pb.stageAlpha ? pb.stageAlpha() : null;
  const stageLo = sa ? sa.stageLo : line[0].x;
  const stageHi = sa ? sa.stageHi : line[line.length - 1].x;

  // ---- the tracked crest ----
  // Marched in x by the argmax of the DISPLACED HEIGHT, which is defined at
  // every station whether or not the wave has broken there. (The `crest`
  // channel was the first pass's indicator and is better conditioned before the
  // break, but it is crestNear*(1-brk): it switches itself off exactly where the
  // wave breaks, which is where this sheet now spends most of its columns.)
  // Adjacent crests are >= 15.5 m apart anywhere in this bank at the break, so a
  // +-9 m window seeded at the previous station cannot reach the neighbour.
  const peakAt = (x, zc, half, n) => {
    const rows = pb.curlProbe(x, zc - half, zc + half, n) || [];
    let i = -1, best = -Infinity;
    for (let k = 0; k < rows.length; k++) {
      if (rows[k].land > 0.5) continue;
      if (rows[k].y > best) { best = rows[k].y; i = k; }
    }
    if (i < 0) return null;
    let z = rows[i].z;
    if (i > 0 && i < rows.length - 1 && rows[i - 1].land < 0.5 && rows[i + 1].land < 0.5) {
      const a = rows[i - 1].y, b = rows[i].y, c = rows[i + 1].y;
      const den = a - 2 * b + c;
      if (Math.abs(den) > 1e-9) {
        const d = (a - c) / (2 * den);
        if (Math.abs(d) <= 1) z = rows[i].z + d * (rows[i + 1].z - rows[i - 1].z) * 0.5;
      }
    }
    return { z, y: best, foam: rows[i].foam, brk: rows[i].brk,
      crest: rows[i].crest, pocket: rows[i].pocket,
      edge: i <= 1 || i >= rows.length - 2 };
  };

  // The WATCH STATION is fixed for the row: the takeoff, where a crest first
  // meets the line, so where this wave's break starts and its peel begins.
  // seedZ carries the crest from the previous column, so the row follows ONE
  // wave through its break rather than re-acquiring whatever is tallest.
  const wx = Number.isFinite(watchX) ? watchX : (stageLo + stageHi) / 2;
  const seed = peakAt(wx, Number.isFinite(seedZ) ? seedZ : zbAt(wx),
    Number.isFinite(seedZ) ? 9 : ribHalf, ribN);
  if (!seed) return { baked: true, bp: null, ribbon: [], watchX: wx };

  const ribbon = [{ x: wx, ...seed }];
  const march = (dir, reach) => {
    let zp = seed.z;
    for (let d = ribStep; d <= reach; d += ribStep) {
      const x = wx + dir * d;
      if (x < stageLo || x > stageHi) break;
      const p = peakAt(x, zp, 9, 61);
      if (!p || p.edge) break;
      if (dir < 0) ribbon.unshift({ x, ...p }); else ribbon.push({ x, ...p });
      zp = p.z;
    }
  };
  // Down-point is +x (m4RideSolve rides the +x branch), so the shoulder still
  // to break is ahead of the watch station and gets the longer reach.
  march(-1, ribBack);
  march(1, ribFwd);

  // ---- the ring: where THIS wave is breaking ----
  // pocket = crestNear(theta) * bell(d) * env^2 * reef, so read along the crest
  // it is largest at the station where the crest is closest to the break line —
  // this wave's own breaking point. Before the wave reaches the line anywhere it
  // is small everywhere, and the ring is WITHHELD rather than placed on the
  // previous wave, which is exactly what the first pass did.
  let bi = -1, bv = -Infinity;
  for (let i = 0; i < ribbon.length; i++) if (ribbon[i].pocket > bv) { bv = ribbon[i].pocket; bi = i; }
  let bp = null;
  if (bi >= 0 && ribbon[bi].pocket >= ringMin) {
    const r = ribbon[bi];
    const s = proj(r.x, r.y, r.z);
    bp = { x: +r.x.toFixed(2), z: +r.z.toFixed(2), y: +r.y.toFixed(2),
      px: +s.px.toFixed(1), py: +s.py.toFixed(1), pocket: +r.pocket.toFixed(3),
      foam: +r.foam.toFixed(3), brk: +r.brk.toFixed(3),
      // A breaking point belongs ON the break line. This is how far off it sits
      // — the ring's own error bar, and the first thing that would grow if the
      // crest march ever wandered onto the wrong wave.
      offLineM: +Math.abs(r.z - zbAt(r.x)).toFixed(2),
      vis: s.ndcZ < 1 && s.px > -600 && s.px < W + 600 && s.py > -600 && s.py < H + 600 };
    if (!bp.vis) bp = null;
  }

  const rib = ribbon.map((p) => {
    const s = proj(p.x, p.y, p.z);
    return { x: +p.x.toFixed(1), z: +p.z.toFixed(2), y: +p.y.toFixed(2),
      px: +s.px.toFixed(1), py: +s.py.toFixed(1),
      vis: s.ndcZ < 1 && s.px > -600 && s.px < W + 600 && s.py > -600 && s.py < H + 600 };
  }).filter((p) => p.vis);

  // The BREAK LINE under the tracked crest, projected. The crop needs it: a
  // crest is a thin horizontal thing, and a window fitted to it alone lands on
  // the horizon with the wave's whole face below the frame — which is what the
  // first cropped build did. The line is where the wave is going, so a window
  // containing both contains the surf zone.
  const lineProj = [];
  for (let x = ribbon[0].x; x <= ribbon[ribbon.length - 1].x; x += ribStep * 2) {
    const s = proj(x, 0, zbAt(x));
    if (s.ndcZ < 1) lineProj.push({ x: +x.toFixed(1), px: +s.px.toFixed(1), py: +s.py.toFixed(1) });
  }

  // The acceptance numbers, all read ON the tracked wave.
  return {
    baked: true, stageLo, stageHi, sim: pb.sim(), watchX: wx,
    bp, ribbon: rib, lineProj,
    crestZ: +seed.z.toFixed(2),
    crestOffLineM: +(seed.z - zbAt(wx)).toFixed(2),   // < 0 = still seaward
    foamAtWatch: +seed.foam.toFixed(3),
    brkAtWatch: +seed.brk.toFixed(3),
    crestIndAtWatch: +seed.crest.toFixed(3),
    foamCrestMax: +Math.max(...ribbon.map((p) => p.foam)).toFixed(3),
    pocketCrestMax: +Math.max(...ribbon.map((p) => p.pocket)).toFixed(3),
    crestIndMax: +Math.max(...ribbon.map((p) => p.crest)).toFixed(3),
    ribbonSpanM: +(ribbon[ribbon.length - 1].x - ribbon[0].x).toFixed(1),
  };
}

// The same read, but along the RIDEABLE STAGE rather than at one station: the
// model's own answer to "is this thing breaking, and how big is it". Camera-
// independent by construction, so it cannot be moved by the framing the way a
// pixel measure can (MEASUREMENT_LESSONS 11), and it is the ONLY read available
// at Privates, which has no measured bed and therefore no baked line to project.
function probeStage({ nStations, halfM, n, aimX }) {
  const pb = window.__pointbreak;
  const line = pb.lineProbe(4) || [];
  const sa = pb.stageAlpha ? pb.stageAlpha() : null;
  // Fallback for an unbaked (synthetic-stage) site: sweep the authored stage
  // span about z = 0 with a wide window. Reported as `baked: false` so a reader
  // never mistakes it for the mapped sites' measurement.
  const baked = line.length > 0;
  const lo = baked ? (sa ? sa.stageLo : line[0].x) : -100;
  const hi = baked ? (sa ? sa.stageHi : line[line.length - 1].x) : 200;
  const zAt = (x) => {
    if (!baked) return 0;
    if (x <= line[0].x) return line[0].z;
    if (x >= line[line.length - 1].x) return line[line.length - 1].z;
    for (let i = 1; i < line.length; i++) if (line[i].x >= x) {
      const a = line[i - 1], b = line[i];
      return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x);
    }
    return 0;
  };
  const half = baked ? halfM : halfM * 2;
  const out = [];
  for (let i = 0; i < nStations; i++) {
    const x = lo + ((hi - lo) * i) / (nStations - 1);
    const z = zAt(x);
    const rows = pb.curlProbe(x, z - half, z + half, n) || [];
    let crest = -Infinity, foam = 0, pocket = 0, ceil = null;
    for (const r of rows) {
      if (r.land > 0.5) continue;
      if (r.y > crest) crest = r.y;
      foam = Math.max(foam, r.foam);
      pocket = Math.max(pocket, r.pocket);
      if (r.ceil !== null) ceil = Math.max(ceil ?? 0, r.ceil);
    }
    out.push({ x: +x.toFixed(1), z: +z.toFixed(1),
      crest: Number.isFinite(crest) ? +crest.toFixed(2) : null,
      foam: +foam.toFixed(3), pocket: +pocket.toFixed(3),
      ceil: ceil === null ? null : +ceil.toFixed(2) });
  }
  const crests = out.map((s) => s.crest).filter((v) => v !== null);
  const foams = out.map((s) => s.foam);
  // The station nearest where the camera is aimed (the baked line's action
  // centroid). The stage MAX barely moves across one wave period — some wave is
  // always cresting somewhere on 200 m of line — so the per-column progression
  // only shows up in a single station's read.
  let atAim = out[0];
  if (Number.isFinite(aimX))
    for (const s of out) if (Math.abs(s.x - aimX) < Math.abs(atAim.x - aimX)) atAim = s;
  return {
    baked, stageLo: +lo.toFixed(1), stageHi: +hi.toFixed(1), stations: out, atAim,
    crestMaxM: crests.length ? Math.max(...crests) : null,
    // The depth-limited ceiling, or null where the site has no measured bed.
    // Privates runs u_depthMix = 0, and there crestCeilM is not a depth limit
    // at all (see MEASUREMENT_LESSONS 12) — reporting a number there invited
    // the 2026-08-18 sheet's "5.20 m against a 2.34 m ceiling, 2.2x over",
    // which divided a synthetic crest by 1.878*H0. n/a is the honest read,
    // matching what the pixel corridor already says on the same row.
    ceilM: (() => {
      const c = out.map((s) => s.ceil).filter((v) => v !== null);
      return c.length ? Math.max(...c) : null;
    })(),
    ceilValid: out.some((s) => s.ceil !== null),
    foamMax: Math.max(...foams),
    // share of the stage that is carrying whitewater at this clock — the
    // model-side "how much of the line is breaking"
    foamFrac: foams.filter((v) => v >= 0.15).length / foams.length,
    pocketMax: Math.max(...out.map((s) => s.pocket)),
  };
}

// ---------------------------------------------------------------------------
// Browser driving
// ---------------------------------------------------------------------------
const COMMON = 'controls=0&q=high&speed=0';

// Published-frame byte accounting, reported at the end of the run so the budget
// is a measured number rather than an intention.
let pubBytes = 0, rawBytes = 0;

async function coldLoad(page, base, hash) {
  // about:blank first: a hash-only goto on a warm page fires the app's own
  // needsReloadForHash -> location.reload(), which races the navigation and
  // detaches the frame (MEASUREMENT_LESSONS / measure_peel_visibility.mjs).
  await page.goto('about:blank');
  await page.goto(`${base}web-three/#${hash}`, { waitUntil: 'load' });
  await page.waitForTimeout(2600);   // shader compile + bake + first frames
}

async function setClock(page, t) {
  await page.evaluate(async (tt) => {
    window.__pointbreak.setSim(tt);
    // two rAF ticks: the loop must copy simTime -> u_time and then draw
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }, t);
  await page.waitForTimeout(120);
}

// ---------------------------------------------------------------------------
// THE BREAK EVENT of one wave, timed from the model.
//
// Seeds on the crest nearest the break line at the watch station at the set
// anchor, walks time BACKWARD until that crest is unbroken and FORWARD until it
// is whitewater, and reads foam/brk/crest AT THE CREST the whole way. Returns
// the window plus the crest's z at every clock, so the capture loop can seed
// column 1's marker with the same wave this measured.
//
// Walking backward is the whole point. The clock the sheet wants is "before it
// breaks", and there is no forward-only way to find that from a set anchor that
// already sits mid-break.
async function measureBreakEvent(page, st, xw, zw) {
  const T = st.T;
  const dt = T / 40;
  const read = async (t, zTarget, win) => {
    await setClock(page, +t.toFixed(3));
    return page.evaluate(({ x, z, half, n, zt, w }) => {
      const rows = (window.__pointbreak.curlProbe(x, z - half, z + half, n) || [])
        .filter((r) => r.land < 0.5);
      let best = -Infinity, bi = -1;
      for (let i = 0; i < rows.length; i++) {
        if (zt !== null && Math.abs(rows[i].z - zt) > w) continue;
        if (rows[i].y > best) { best = rows[i].y; bi = i; }
      }
      if (bi < 0) return null;
      return { z: +rows[bi].z.toFixed(2), y: +rows[bi].y.toFixed(3),
        foam: +rows[bi].foam.toFixed(3), brk: +rows[bi].brk.toFixed(3),
        crest: +rows[bi].crest.toFixed(3) };
    }, { x: xw, z: zw, half: 150, n: 401, zt: zTarget, w: win });
  };
  // Seed: the local maximum of the surface nearest the line at the set anchor.
  await setClock(page, SET_ANCHOR_S);
  const seed = await page.evaluate(({ x, z, half, n }) => {
    const rows = (window.__pointbreak.curlProbe(x, z - half, z + half, n) || [])
      .filter((r) => r.land < 0.5);
    const maxima = [];
    for (let i = 2; i < rows.length - 2; i++)
      if (rows[i].y > rows[i - 1].y && rows[i].y >= rows[i + 1].y) maxima.push(rows[i]);
    const pick = (maxima.length ? maxima : rows)
      .reduce((a, b) => (Math.abs(b.z - z) < Math.abs(a.z - z) ? b : a));
    return { z: +pick.z.toFixed(2) };
  }, { x: xw, z: zw, half: 150, n: 401 });
  if (!seed) return null;

  const back = [], fwd = [];
  let z = seed.z;
  for (let i = 1; i <= 40; i++) {                     // one T back
    const r = await read(SET_ANCHOR_S - i * dt, z, 14);
    if (!r) break;
    z = r.z; back.push({ t: +(SET_ANCHOR_S - i * dt).toFixed(3), ...r });
  }
  z = seed.z;
  for (let i = 1; i <= 32; i++) {                     // 0.8 T forward
    const r = await read(SET_ANCHOR_S + i * dt, z, 14);
    if (!r) break;
    z = r.z; fwd.push({ t: +(SET_ANCHOR_S + i * dt).toFixed(3), ...r });
  }
  const at0 = await read(SET_ANCHOR_S, seed.z, 6);
  const track = [...back.reverse(), { t: SET_ANCHOR_S, ...(at0 || {}) }, ...fwd]
    .filter((r) => Number.isFinite(r.y));

  // FIRST rise, then walk back to the last quiet clock before it. Scanning
  // backward from the end instead finds the LAST quiet clock, which at day=big
  // sits after the tracked wave has already broken and the tracker has picked up
  // the following bore — it reported the SECOND event as if it were the first.
  let iBr = -1;
  for (let i = 0; i < track.length; i++)
    if (track[i].foam >= CREST_FOAM_BREAK) { iBr = i; break; }
  let iOn = -1;
  if (iBr > 0) for (let i = iBr - 1; i >= 0; i--)
    if (track[i].foam <= CREST_FOAM_PRE) { iOn = i; break; }

  const peakFoam = Math.max(...track.map((r) => r.foam));
  let breaks = iOn >= 0 && iBr > iOn;
  let why = 'foam at the crest crosses the break threshold';
  if (!breaks) {
    // No break to show. Fall back to the crest indicator's own collapse, which
    // every row has, and mark the row so the header cannot promise otherwise.
    why = `foam at the crest never reaches ${CREST_FOAM_BREAK} (peak ${peakFoam.toFixed(3)})`;
    for (let i = 0; i < track.length; i++)
      if (track[i].crest <= CREST_IND_GONE) { iBr = i; break; }
    if (iBr > 0) for (let i = iBr - 1; i >= 0; i--)
      if (track[i].crest >= CREST_IND_FULL) { iOn = i; break; }
  }
  if (!(iOn >= 0 && iBr > iOn)) {   // nothing usable: the old crest-arrival clock
    const iNear = track.reduce((a, r, i) => (Math.abs(track[i].z - zw) < Math.abs(track[a].z - zw) ? i : a), 0);
    iBr = iNear; iOn = Math.max(0, iNear - 10);
    why = 'no usable transition; the window is a quarter period ending at the crest arrival';
  }
  return {
    watchX: xw, watchZ: zw, breaks, why, peakFoamAtCrest: +peakFoam.toFixed(3),
    tOn: track[iOn].t, tBreak: track[iBr].t,
    eventS: +(track[iBr].t - track[iOn].t).toFixed(3),
    eventFracT: +((track[iBr].t - track[iOn].t) / T).toFixed(4),
    foamOn: track[iOn].foam, foamBreak: track[iBr].foam,
    crestZOn: track[iOn].z, crestOffLineOnM: +(track[iOn].z - zw).toFixed(1),
    sweepFrom: track[0].t, sweepTo: track[track.length - 1].t, sweepN: track.length,
    track,
  };
}

// Measured crest arrival at the break line. Sweeps one wave period around the
// set peak, reading the GPU surface each step, then refines the argmax with a
// parabola through its two neighbours.
// KEPT for the set sheet's fallback path only — as the BREAK sheet's anchor it
// was the defect: a wave is tallest at the line, and at the line it is already
// breaking, so this instant is at or after break onset by construction.
async function measureCrestArrival(page, st, xProbe, zProbe) {
  const T = st.T;
  const t0 = SET_ANCHOR_S - T / 2, N = 40;
  const samples = [];
  for (let i = 0; i <= N; i++) {
    const t = t0 + (T * i) / N;
    await setClock(page, t);
    const p = await page.evaluate(probeTransect, { x: xProbe, zLine: zProbe, halfM: 4, n: 33 });
    samples.push({ t, crest: p ? p.crest : NaN });
  }
  let iMax = 0;
  for (let i = 1; i < samples.length; i++)
    if (samples[i].crest > samples[iMax].crest) iMax = i;
  let tStar = samples[iMax].t;
  if (iMax > 0 && iMax < samples.length - 1) {
    const a = samples[iMax - 1].crest, b = samples[iMax].crest, c = samples[iMax + 1].crest;
    const den = a - 2 * b + c;
    if (Math.abs(den) > 1e-9) tStar += ((a - c) / (2 * den)) * (T / N);
  }
  return { tStar, crestM: samples[iMax].crest, sweepFrom: t0, sweepTo: t0 + T, sweepN: N + 1 };
}

// Sub-clocks per carrier period for the set sheet's crest envelope. 12 puts a
// sample every T/12 = 1.0-1.25 s, which resolves a 12-15 s crest to better than
// 4% of its height (cos is flat at its peak): measured at The Hook the swept
// maximum is 5.30 m at 1 s resolution against 5.27 m from the 12-sample
// envelope. The window is CENTRED on the column clock and spans exactly one T,
// so it contains exactly one crest arrival and always includes the column's own
// instant — the envelope can never read below the number it replaces.
const ENV_SUBCLOCKS = 12;

// The tallest wave to cross ONE station within one carrier period of the
// column clock — the set sheet's honest "how big is it here now". See the
// header note: the alternative (one instant) aliases the carrier, and widening
// the transect in space does not substitute for sweeping it in time.
async function measureStationEnvelope(page, T, t, station, halfM) {
  let best = -Infinity, tStar = t;
  for (let j = 0; j < ENV_SUBCLOCKS; j++) {
    const tt = +(t + (j / ENV_SUBCLOCKS - 0.5) * T).toFixed(3);
    await setClock(page, tt);
    const p = await page.evaluate(probeTransect,
      { x: station.x, zLine: station.z, halfM, n: 193 });
    if (p && p.crest > best) { best = p.crest; tStar = tt; }
  }
  await setClock(page, t);   // the cell's hash must still reproduce its frame
  return Number.isFinite(best)
    ? { crestEnvM: +best.toFixed(2), crestEnvAtT: tStar } : { crestEnvM: null, crestEnvAtT: null };
}

// A small exact-ratio label: 1/16, 1/8, 3/16, 1/4 rather than 0.0625 T.
function ratioLabel(num, den) {
  const g = (a, b) => (b ? g(b, a % b) : a);
  const d = g(num, den) || 1;
  const p = num / d, q = den / d;
  return q === 1 ? `${p}` : (p === 1 ? `1/${q}` : `${p}/${q}`);
}

function clocksFor(sheet, st, crest, ev) {
  if (sheet.clock.kind === 'wave') {
    const T = st.T, n = sheet.clock.n;
    // The row runs from the last clock at which the tracked wave is still
    // UNBROKEN at the watch station to the first at which it is whitewater —
    // its own break event, measured (measureBreakEvent), not a fraction of T
    // chosen in advance. Measured at Second Peak the four breaking rows come out
    // at 0.25-0.275 T, near-constant in periods across T = 14-17 s, but the span
    // is each row's own number.
    let spanS = ev.eventS;
    let clamped = false;
    // ALIASING CEILING. The crest advances exactly (span/T) crest spacings
    // whatever the site — advance/spacing = dt/T cancels the local wavelength —
    // so a span at or above half a period puts the tracked wave nearer its
    // neighbour's place than its own. If an event is longer than that, the row
    // ends at the break and starts later than onset, and says so.
    if (spanS > WAVE_SPAN_T * T) { spanS = WAVE_SPAN_T * T; clamped = true; }
    const t0 = ev.tBreak - spanS;
    const spacing = spanS / (n - 1);
    const advOf = (k) => (k * spacing) / T;            // crest spacings advanced
    const frac = (k) => k / (n - 1);
    // Phases are positions in the row's OWN event, so they are honest for every
    // row without asserting anything a shared header cannot know. A row that
    // does not break says so instead of promising one.
    const phases = ev.breaks
      ? ['still unbroken', 'a quarter into the break', 'halfway through the break',
        'three quarters through', 'breaking — whitewater at the crest']
      : ['crest intact', 'a quarter through', 'halfway', 'three quarters', 'crest gone'];
    return {
      period: T, periodLabel: `wave period T = ${T.toFixed(1)} s`,
      spacing, spanFrac: +(spanS / T).toFixed(4), spanS: +spanS.toFixed(3),
      breaks: ev.breaks, clamped,
      watchX: +ev.watchX.toFixed(1),
      tOn: ev.tOn, tBreak: ev.tBreak, eventS: ev.eventS, eventFracT: ev.eventFracT,
      peakFoamAtCrest: ev.peakFoamAtCrest,
      advance: Array.from({ length: n }, (_, k) => +advOf(k).toFixed(4)),
      how: (ev.breaks
        ? `the tracked wave's own BREAK EVENT at the takeoff station x = ${ev.watchX.toFixed(0)} m, `
          + `where a crest first meets the line. Measured by seeding on the crest nearest the line at `
          + `SET_ANCHOR_S = ${SET_ANCHOR_S} s and walking time back and forward over `
          + `${ev.sweepN} clocks (${ev.sweepFrom.toFixed(1)}–${ev.sweepTo.toFixed(1)} s), reading the model's `
          + `foam AT THE CREST: still unbroken at t = ${ev.tOn.toFixed(2)} s (foam ${ev.foamOn.toFixed(2)}, `
          + `crest ${Math.abs(ev.crestOffLineOnM).toFixed(0)} m ${ev.crestOffLineOnM < 0 ? 'seaward of' : 'inside'} `
          + `the line) and whitewater at t = ${ev.tBreak.toFixed(2)} s (foam ${ev.foamBreak.toFixed(2)}). `
        : `this row does NOT break — ${ev.why} — so the window is the crest indicator's own collapse, `
          + `from fully unbroken at t = ${ev.tOn.toFixed(2)} s to crest gone at t = ${ev.tBreak.toFixed(2)} s, `
          + `at the takeoff station x = ${ev.watchX.toFixed(0)} m. `)
        + `Columns are ${spanS.toFixed(2)} s apart / ${(spanS / 4).toFixed(2)} s per step, `
        + `${(spanS / T).toFixed(3)} of a period, so the tracked crest advances `
        + `${(spanS / T).toFixed(2)} of a crest spacing across the whole row.`
        + (clamped ? ` The measured event ran ${ev.eventS.toFixed(2)} s and was CLAMPED to half a period `
          + 'so the sequence cannot alias onto the next wave; the row ends at the break.' : ''),
      times: Array.from({ length: n }, (_, k) => t0 + k * spacing),
      phases,
      subs: Array.from({ length: n }, (_, k) => `${(frac(k) * 100).toFixed(0)}% of the event `
        + `· crest ${advOf(k).toFixed(2)} Λ on`),
    };
  }
  const P = 1 / st.dF, n = sheet.clock.n;
  return {
    period: P, periodLabel: `set beat 1/Δf = ${P.toFixed(1)} s (Δf = ${st.dF} Hz)`,
    spacing: P / 4,
    how: `setEnv peaks at the live break line at t = SET_ANCHOR_S = ${SET_ANCHOR_S} s `
       + `(#arm anchor re-references the envelope to u_setRef = ${st.setRef.toFixed(1)} m, so the `
       + `s/cg term cancels there); columns are 45 + P·(0.5 + k/4), k = 0..4 — a full beat from `
       + `lull through the peak back to lull.`,
    times: Array.from({ length: n }, (_, k) => SET_ANCHOR_S + P * (0.5 + k / 4)),
    phases: ['lull', 'building', 'SET PEAK', 'easing', 'lull'],
    subs: ['anchor', '+1/4 beat', '+1/2 beat', '+3/4 beat', '+1 beat'],
  };
}

// ---------------------------------------------------------------------------
// Frame rendering — crop, marker, encode
//
// Captures stay full-resolution PNG in memory because foamStats measures THEM —
// the pixel corridor must read the frame the camera drew, not a re-encoded or
// annotated one. Everything here runs AFTER that measurement, on a copy.
//
// It runs in a second, blank browser page: this repo ships no node_modules, and
// Chromium already has a canvas and a good WebP encoder. The sim page is never
// touched, so nothing here can perturb the state a cell was captured in.
//
// THE MARKER IS DRAWN HERE, NOT IN THE PAGE, for exactly that reason: an overlay
// in the sim page would be inside the screenshot the pixel corridor reads, and
// foam_pix would then be partly a measurement of the marker.
// ---------------------------------------------------------------------------

// The crop window for one ROW: the union of the tracked wave's projected extent
// across all five of its columns, padded, aspect-locked to the viewport and
// clamped inside it. One window per row, so the wave moves through a fixed
// frame instead of being re-centred out of its own motion — and the camera is
// never touched, so camDriftM stays exactly what it was.
function cropForRow(cells, view) {
  const pts = [];
  for (const c of cells) {
    if (!c.marker) continue;
    // Frame on the WATCH STATION, which is fixed for the row, not on the ring,
    // which does not exist in the pre-break columns. Both the crest and the
    // break line under it go in: a crest alone is a thin horizontal thing, and a
    // window fitted to one lands on the horizon with the wave's face below the
    // frame — measured, that is exactly what the first cropped build did.
    const wx = c.marker.watchX;
    if (c.marker.bp) pts.push([c.marker.bp.px, c.marker.bp.py]);
    for (const p of c.marker.ribbon || [])
      if (Math.abs(p.x - wx) <= CROP_REACH_M) pts.push([p.px, p.py]);
    for (const p of c.marker.lineProj || [])
      if (Math.abs(p.x - wx) <= CROP_REACH_M) pts.push([p.px, p.py]);
  }
  if (pts.length < 4) return null;           // nothing tracked: ship the frame whole
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [px, py] of pts) {
    x0 = Math.min(x0, px); x1 = Math.max(x1, px);
    y0 = Math.min(y0, py); y1 = Math.max(y1, py);
  }
  // Clip the bbox to the frame first: a ribbon that runs off the side would
  // otherwise pull the window out to a place with no pixels in it.
  x0 = Math.max(0, x0); x1 = Math.min(view.width, x1);
  y0 = Math.max(0, y0); y1 = Math.min(view.height, y1);
  if (!(x1 > x0) || !(y1 > y0)) return null;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const pad = CROP_PAD * Math.max(x1 - x0, y1 - y0);
  let w = Math.max((x1 - x0) + 2 * pad, ((y1 - y0) + 2 * pad) * (view.width / view.height));
  // Bounds, both stated as ratios so they survive a viewport change: never
  // tighter than CROP_MIN_FRAC of the frame, never more than CROP_MAX_ZOOM.
  w = Math.min(view.width, Math.max(w, view.width * CROP_MIN_FRAC, view.width / CROP_MAX_ZOOM));
  let h = w * (view.height / view.width);
  if (h > view.height) { h = view.height; w = h * (view.width / view.height); }
  const sx = Math.round(Math.min(Math.max(cx - w / 2, 0), view.width - w));
  const sy = Math.round(Math.min(Math.max(cy - h / 2, 0), view.height - h));
  const sw = Math.round(w), sh = Math.round(h);
  const zoom = +(view.width / sw).toFixed(2);
  if (zoom < CROP_MIN_ZOOM) return null;   // not worth the caveat
  return { sx, sy, sw, sh, zoom };
}

// Draw one frame: optional crop, optional tracked-wave marker, then encode.
// `mime` is 'image/webp' for a published cell and 'image/png' everywhere else.
async function renderFrame(encoder, pngBuf, { crop, marker, W, H, mime, quality }) {
  const out = await encoder.evaluate(async (o) => {
    const img = new Image();
    img.src = `data:image/png;base64,${o.b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = o.W; c.height = o.H;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const cr = o.crop || { sx: 0, sy: 0, sw: img.width, sh: img.height };
    g.drawImage(img, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, o.W, o.H);
    if (o.marker) {
      const kx = o.W / cr.sw, ky = o.H / cr.sh;
      const P = (p) => [(p.px - cr.sx) * kx, (p.py - cr.sy) * ky];
      // Widths scale with the OUTPUT raster, not with the crop, so the marker
      // is the same weight in a cropped cell and an uncropped one — and they are
      // chosen for the size the cell is READ at, not the size the file is. A
      // published frame is 800 px wide and is displayed about 300 px wide in the
      // grid, so a stroke that looks right at 800 is sub-pixel where it matters.
      // These survive that 0.37x and are still unobtrusive opened on their own.
      const u = o.W / 1000;
      const twice = (draw) => {
        g.lineJoin = 'round'; g.lineCap = 'round';
        g.lineWidth = 7.0 * u; g.strokeStyle = o.caseInk; draw();
        g.lineWidth = 3.0 * u; g.strokeStyle = o.ink; draw();
      };
      const rib = o.marker.ribbon || [];
      if (rib.length > 1) {
        twice(() => {
          g.beginPath(); g.moveTo(...P(rib[0]));
          for (const p of rib.slice(1)) g.lineTo(...P(p));
          g.stroke();
        });
      }
      if (o.marker.bp) {
        const [x, y] = P(o.marker.bp);
        const r = 14 * u;
        twice(() => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); });
        // a short stem below the ring, so the mark still reads as "here" when
        // the cell is 300 px wide and the ring is 3 px across
        twice(() => {
          g.beginPath(); g.moveTo(x, y + r * 1.35); g.lineTo(x, y + r * 3.1); g.stroke();
        });
      }
    }
    const url = c.toDataURL(o.mime, o.quality);
    // Chromium falls back to PNG SILENTLY if the mime is unsupported, which
    // would quietly ship 4x the bytes. Report what actually came back.
    return { mime: url.slice(5, url.indexOf(';')), data: url.slice(url.indexOf(',') + 1) };
  }, { b64: pngBuf.toString('base64'), W, H, mime, quality,
    crop: crop || null, marker: marker || null, ink: MARK_INK, caseInk: MARK_CASE });
  if (out.mime !== mime)
    throw new Error(`frames wanted ${mime}, browser produced ${out.mime}`);
  return Buffer.from(out.data, 'base64');
}

// Kept as a named wrapper so the published-encode contract is one call site and
// one assertion: published cells are WebP, never a silent PNG.
const encodeFrame = (encoder, pngBuf, w, h, quality, crop, marker) =>
  renderFrame(encoder, pngBuf, { crop, marker, W: w, H: h, mime: 'image/webp', quality });

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------
async function captureSheet(page, base, sheet, encoder) {
  const out = { id: sheet.id, groups: [] };
  for (const group of sheet.groups) {
    // A group can be local-only for the same reason a row can: the frames do
    // not carry the claim the header makes. See the cliff group's pubDrop note.
    if (MODE === 'published' && group.pubDrop) continue;
    // In published mode a group describes the subset it actually shows.
    const g = {
      id: group.id, base: group.base, rows: [],
      label: (MODE === 'published' && group.pubLabel) || group.label,
      note: (MODE === 'published' && group.pubNote) || group.note,
    };
    // Published mode captures only the kept rows — the cut is at CAPTURE time,
    // not at render time, so a published run is also a faster run.
    const keep = MODE === 'published' ? PUB_ROWS[sheet.id] : null;
    let rows = keep ? group.rows.filter((r) => keep.includes(r.id)) : group.rows;
    if (flags.limit) rows = rows.slice(0, Number(flags.limit));
    for (const row of rows) {
      const rowHash = `${group.base}&${row.hash}&${COMMON}`;
      process.stdout.write(`  ${sheet.id}/${group.id}/${row.id} … `);
      await coldLoad(page, base, `${rowHash}&sim=${SET_ANCHOR_S}`);
      let st = await page.evaluate(readState, CORRIDOR_M);

      // Probe transect: the baked line's action centroid is where the cameras
      // are already aiming, so it is also where "did this break" should be
      // asked. Fall back to the middle of the visible line.
      const mid = st.stations[Math.floor(st.stations.length / 2)];
      const xProbe = st.aim ? st.aim.x : (mid ? mid.x : 0);
      const zProbe = st.aim ? st.aim.z : (mid ? mid.z : 0);

      // WATCH STATION: the takeoff, where a crest first meets the line, so
      // where this wave's break starts and its peel begins. The #aim centroid is
      // where the CAMERA looks; the takeoff is where the BREAK happens, and the
      // row is about the break.
      const takeoff = await page.evaluate(() => {
        const tp = window.__pointbreak.takeoffProfile
          ? window.__pointbreak.takeoffProfile(1) : null;
        return tp ? tp.takeoffX : null;
      });
      const xWatch = Number.isFinite(takeoff) ? takeoff : xProbe;
      const zWatch = await page.evaluate((x) => {
        const pb = window.__pointbreak;
        const fractf = (v) => v - Math.floor(v);
        const hash11 = (p) => { p = fractf(p * 0.1031); p *= p + 33.33; return fractf((p + p) * p); };
        const vnoise1 = (v) => {
          const i = Math.floor(v); let f = v - i; f = f * f * (3 - 2 * f);
          return hash11(i) + (hash11(i + 1) - hash11(i)) * f;
        };
        const secU = pb.uniforms.u_sections.value;
        const shift = secU >= 0.05
          ? Math.min(secU * 55 * (vnoise1(x * 0.02 + 7.3) - 0.5) * 2, 0) : 0;
        const L = (pb.lineProbe(4) || []).map((p) => ({ x: p.x, z: p.z }));
        if (!L.length) return 0;
        if (x <= L[0].x) return L[0].z + shift;
        if (x >= L[L.length - 1].x) return L[L.length - 1].z + shift;
        for (let i = 1; i < L.length; i++) if (L[i].x >= x) {
          const a = L[i - 1], b = L[i];
          return a.z + (b.z - a.z) * (x - a.x) / (b.x - a.x) + shift;
        }
        return shift;
      }, xWatch);

      let crest = null, event = null;
      if (sheet.clock.kind === 'wave') {
        // The break EVENT is the anchor and the span. measureCrestArrival is
        // kept for the record, but its t* is at or after break onset by
        // construction and is no longer what the row is built on.
        event = await measureBreakEvent(page, st, xWatch, zWatch);
        crest = await measureCrestArrival(page, st, xProbe, zProbe);
      }
      const clocks = clocksFor(sheet, st, crest, event);

      const cells = [];
      const shots = [];   // the raw captures, held until the row's crop is known
      // Continuity seed for the tracked wave: the crest the EVENT measurement
      // was following, at the anchor clock, then each column's own crest. The
      // marker therefore follows the same wave the span was measured on.
      let seedZ = event ? event.crestZOn : null;
      for (let k = 0; k < clocks.times.length; k++) {
        const t = +clocks.times[k].toFixed(2);
        const hash = `${rowHash}&sim=${t}`;
        if (k === 0) await coldLoad(page, base, hash);   // a real reload-path frame
        else await setClock(page, t);
        const live = await page.evaluate(readState, CORRIDOR_M);
        if (k === 0) st = live;
        if (Math.abs(live.sim - t) > 1e-3) throw new Error(`${row.id} col ${k}: clock ${live.sim} != ${t}`);
        const stage = await page.evaluate(probeStage,
          { nStations: 11, halfM: 45, n: 193, aimX: xProbe });
        // The tracked wave. Break sheet only: the set sheet's subject is the
        // ENVELOPE across 2-3 carrier periods per column, so a single-wave
        // marker there would point at a different wave in every column and
        // claim they were one. Its clocks and its reducer are untouched.
        let marker = null;
        if (sheet.clock.kind === 'wave') {
          marker = await page.evaluate(trackedWave, {
            watchX: xWatch, seedZ, lineStep: LINE_STEP_M, ribStep: RIB_STEP_M,
            ribBack: RIB_BACK_M, ribFwd: RIB_FWD_M, ribHalf: RIB_HALF_M, ribN: RIB_N,
            ringMin: RING_MIN_POCKET,
          });
          if (marker && Number.isFinite(marker.crestZ)) seedZ = marker.crestZ;
        }
        const stem = `img/${sheet.id}_${group.id}_${row.id}_c${k}`;
        // Always capture PNG at full resolution: foamStats measures THIS buffer,
        // and a lossy corridor read would be a measurement of the encoder.
        const buf = await page.screenshot();
        const foam = foamStats(buf, live.stations);
        const rel = MODE === 'published' ? `${stem}.webp` : `${stem}.png`;
        // The file is WRITTEN after the whole row is captured, because the crop
        // window is a property of the row, not of one column.
        shots.push({ k, buf, stem, rel });
        // Set sheet only, and strictly AFTER the frame is captured: the crest
        // envelope moves the clock across one carrier period and puts it back.
        // (Nothing in frame moves as a side effect — the #aim target is the
        // baked line's centroid, which does not depend on t, and camDrift below
        // records what the cameras actually did rather than assuming this.)
        const crestEnv = (sheet.clock.kind === 'set' && stage.atAim)
          ? await measureStationEnvelope(page, live.T, t, stage.atAim, stage.baked ? 45 : 90)
          : { crestEnvM: null, crestEnvAtT: null };
        // Envelope through the repo's own twin (web-three/js/model-js.js setEnv),
        // fed from the live uniforms — not a re-derivation of the formula here.
        const env = setEnv(live.setRef, t, {
          T: live.T, dF: live.dF, setRef: live.setRef,
          setAnchor: live.setAnchor, setDepth: live.setDepth, cgLegacy: live.cgLegacy,
        });
        cells.push({
          k, t, hash, img: rel, phase: clocks.phases[k],
          env: +env.toFixed(3),
          crestM: stage.atAim ? stage.atAim.crest : null,      // at the aim station, THIS INSTANT
          crestEnvM: crestEnv.crestEnvM,                       // tallest wave there within +-T/2
          crestEnvAtT: crestEnv.crestEnvAtT,                   // when that wave crossed it
          crestMaxM: stage.crestMaxM,                          // anywhere on the stage, this instant
          ceilM: stage.ceilM,          // null = no measured bed, no ceiling
          ceilValid: stage.ceilValid,
          modelFoamMax: +stage.foamMax.toFixed(3),
          modelFoamFrac: +stage.foamFrac.toFixed(3),
          modelPocketMax: +stage.pocketMax.toFixed(3),
          baked: stage.baked,
          stageStations: stage.stations,
          pixFracHi: foam.bandPx ? +foam.fracHi.toFixed(4) : null,
          pixFracLo: foam.bandPx ? +foam.fracLo.toFixed(4) : null,
          pixMaxLuma: foam.bandPx ? foam.maxLuma : null,
          corridorSamples: foam.bandPx,
          // MEASUREMENT_LESSONS 11: the #aim cameras frame the baked line's
          // action centroid and smooth over ~6 s of sim time, so jumping the
          // clock COULD move the instrument between columns of the same row.
          // Recorded per cell and reduced to camDriftM below so a row whose
          // frame moved is visible rather than assumed away.
          cam: live.camera, aimErrDeg: live.aim ? live.aim.errDeg : null,
          // The tracked wave, as the model reports it. bpX is the breakpoint's
          // world x on the break line; offM/offPx are how far the drawn mark
          // sits from the tallest displaced surface point at that station —
          // the marker's own error bar.
          marker: marker && (marker.bp || (marker.ribbon || []).length) ? marker : null,
          bpX: marker && marker.bp ? marker.bp.x : null,
          // THE ACCEPTANCE SERIES. All read ON the tracked wave, not at a fixed
          // point in the water where the bore from previous waves never goes
          // quiet — which is why the first pass could report foam 0.87 in a
          // column whose wave had not broken.
          foamCrest: marker ? marker.foamCrestMax : null,
          foamAtWatch: marker ? marker.foamAtWatch : null,
          brkAtWatch: marker ? marker.brkAtWatch : null,
          crestInd: marker ? marker.crestIndAtWatch : null,
          crestOffLineM: marker ? marker.crestOffLineM : null,
          pocketCrest: marker ? marker.pocketCrestMax : null,
          // The ring's own error bar: a breaking point belongs ON the line.
          markerOffM: marker && marker.bp ? marker.bp.offLineM : null,
        });
      }

      // ---- the row's framing, then its files ----
      // One crop for the row (see cropForRow), applied to every column, so the
      // reader's window is fixed and the wave moves inside it.
      const crop = sheet.clock.kind === 'wave' ? cropForRow(cells, VIEW) : null;
      for (const s of shots) {
        const cell = cells[s.k];
        const mk = cell.marker;
        if (MODE === 'published') {
          const enc = await encodeFrame(encoder, s.buf, PUB_W, PUB_H, PUB_QUALITY, crop, mk);
          writeFileSync(join(OUT, s.rel), enc);
          pubBytes += enc.length; rawBytes += s.buf.length;
        } else if (crop || mk) {
          // Local mode keeps BOTH: the cell shows the cropped, marked frame and
          // clicking it opens the marked full frame. The uncropped view is the
          // one that says where on the point you are, and losing it to a crop
          // would trade one legibility problem for another.
          const cellPng = await renderFrame(encoder, s.buf,
            { crop, marker: mk, W: VIEW.width, H: VIEW.height, mime: 'image/png' });
          writeFileSync(join(OUT, s.rel), cellPng);
          const full = await renderFrame(encoder, s.buf,
            { crop: null, marker: mk, W: VIEW.width, H: VIEW.height, mime: 'image/png' });
          writeFileSync(join(OUT, `${s.stem}_full.png`), full);
          cell.imgFull = `${s.stem}_full.png`;
        } else {
          writeFileSync(join(OUT, s.rel), s.buf);
        }
        s.buf = null;   // 5 x ~300 KB per row; let it go
      }
      // FLAT = this cell promised a break and drew none. "Promised" is per
      // sheet: a wave-period sheet promises one at every column, a set-beat
      // sheet only at its peak column — its lull columns are SUPPOSED to be
      // small, and flagging them would make the honest result look like a bug.
      // Both instruments have to agree before a cell is called failed: the
      // camera-independent model read AND the pixels (where pixels exist).
      // On the break sheet the LAST column is where a break is promised: the
      // window ends at the clock the model says this wave is whitewater. Column
      // 1 is deliberately pre-break now, so flagging it would flag the fix.
      for (const c of cells) {
        const promised = sheet.clock.kind === 'wave'
          ? c.k === cells.length - 1
          : c.phase === 'SET PEAK';
        const pixSaysFlat = c.pixFracLo === null ? true : c.pixFracLo === 0;
        c.flat = promised && c.modelFoamMax < 0.05 && pixSaysFlat;
      }
      // Largest camera displacement between any two columns of this row.
      const camDriftM = Math.max(...cells.map((c) => Math.max(...cells.map((d) =>
        Math.hypot(c.cam[0] - d.cam[0], c.cam[1] - d.cam[1], c.cam[2] - d.cam[2])))));
      // ---- ACCEPTANCE: does the break actually progress across this row? ----
      // Measured, never asserted. foamCrest is the model's whitewater AT THE
      // TRACKED CREST, so it is this wave's own breaking state rather than the
      // ambient bore at a fixed point in the water. The row passes when it
      // starts pre-break and ends clearly broken, and rises on the way.
      // foamAtWatch, not foamCrestMax: the window was derived from the foam at
      // the crest AT THE TAKEOFF STATION, and acceptance has to be the same
      // quantity in the same place or the two can disagree. They did — at
      // h0=0.7 the along-crest maximum reaches 0.86 while the takeoff station
      // itself peaks at 0.341, because that wave breaks somewhere else on the
      // line entirely. Both numbers are in the JSON; this is the one the window
      // is about (MEASUREMENT_LESSONS 8c: check what a summary is over).
      const foamSeries = cells.map((c) => (c.foamAtWatch === null || c.foamAtWatch === undefined
        ? null : c.foamAtWatch));
      const haveFoam = foamSeries.every((v) => v !== null);
      const rises = haveFoam
        && foamSeries[0] <= CREST_FOAM_PRE * 3
        && foamSeries[foamSeries.length - 1] >= CREST_FOAM_BREAK
        // near-monotone: at most one step may go down, and never by much
        && foamSeries.filter((v, i) => i > 0 && v < foamSeries[i - 1] - 0.05).length <= 1;
      const accept = { pass: Boolean(rises), foam: foamSeries,
        first: haveFoam ? foamSeries[0] : null,
        last: haveFoam ? foamSeries[foamSeries.length - 1] : null,
        breaks: clocks.breaks !== undefined ? clocks.breaks : null };

      // How far the tracked breakpoint travelled down the line across the row,
      // and the worst distance the ring sat from the break line it belongs on.
      const bpXs = cells.map((c) => c.bpX).filter((v) => v !== null && v !== undefined);
      const peelM = bpXs.length > 1 ? +(bpXs[bpXs.length - 1] - bpXs[0]).toFixed(1) : null;
      // Only over the columns where this wave is actually AT the line. Before
      // that the crest is legitimately 14-19 m seaward, so the distance measures
      // the wave's approach rather than the ring's accuracy.
      const offs = cells.filter((c) => c.markerOffM !== null && c.markerOffM !== undefined
        && c.foamAtWatch >= 0.15).map((c) => c.markerOffM);
      const markerOffMaxM = offs.length ? +Math.max(...offs).toFixed(2) : null;
      // Columns with NO ring are not a failure here: before the tracked wave
      // reaches the line there is no breaking point to ring, and column 1 is
      // supposed to be one of them.
      const noRing = cells.filter((c) => c.bpX === null || c.bpX === undefined).length;
      g.rows.push({
        ...row, rowHash, camDriftM: +camDriftM.toFixed(2),
        clocks: { ...clocks, times: clocks.times.map((v) => +v.toFixed(2)) },
        crop, peelM, markerOffMaxM, noRing, accept, event,
        crest, state: {
          preset: st.preset, day: st.day, H0: st.H0, T: st.T, dF: st.dF, tide: st.tide,
          xi: st.xi, alpha: st.alpha, chop: st.chop,
          hudGeo: st.hudGeo, hudAlpha: st.hudAlpha, hudSwell: st.hudSwell,
          camera: st.camera, target: st.target, setRef: +st.setRef.toFixed(2),
          setDepth: st.setDepth, probe: { x: +xProbe.toFixed(1), z: +zProbe.toFixed(1) },
        },
        cells,
      });
      const nFlat = cells.filter((c) => c.flat).length;
      const crestOf = (c) => (c.crestEnvM ?? c.crestM);
      console.log(`H₀ ${st.H0.toFixed(2)} m · ${clocks.periodLabel}`
        + ` · crest ${cells.map((c) => (crestOf(c) === null ? '—' : crestOf(c).toFixed(1))).join('/')} m`
        + (sheet.clock.kind === 'set'
          ? ` (inst ${cells.map((c) => (c.crestM === null ? '—' : c.crestM.toFixed(1))).join('/')})` : '')
        + ` · foam ${cells.map((c) => c.modelFoamMax.toFixed(2)).join('/')}`
        + ` · pix ${cells.map((c) => (c.pixFracLo === null ? 'n/a' : (c.pixFracLo * 100).toFixed(1))).join('/')}%`
        + ` · camDrift ${camDriftM.toFixed(2)} m`
        + (sheet.clock.kind === 'wave'
          ? `\n      BREAK EVENT ${clocks.breaks ? 'yes' : 'NO'} · watch x ${clocks.watchX} m`
            + ` · unbroken t ${clocks.tOn} -> whitewater t ${clocks.tBreak}`
            + ` (${clocks.eventS} s = ${clocks.eventFracT} T${clocks.clamped ? ', CLAMPED' : ''})`
            + ` · peak foam at crest ${clocks.peakFoamAtCrest}`
            + `\n      foam AT THE CREST ${cells.map((c) => (c.foamAtWatch === null || c.foamAtWatch === undefined ? '—' : c.foamAtWatch.toFixed(2))).join(' -> ')}`
            + `   ${accept.pass ? 'ACCEPT' : '*** ACCEPTANCE FAIL ***'}`
            + `\n      crest off line ${cells.map((c) => (c.crestOffLineM === null || c.crestOffLineM === undefined ? '—' : c.crestOffLineM.toFixed(0))).join('/')} m`
            + ` · ring x ${cells.map((c) => (c.bpX === null || c.bpX === undefined ? '—' : c.bpX.toFixed(0))).join('/')} m`
            + ` (peel ${peelM === null ? '—' : `${peelM > 0 ? '+' : ''}${peelM} m`})`
            + ` · ring off line ≤ ${markerOffMaxM === null ? 'n/a' : `${markerOffMaxM} m`}`
            + (noRing ? ` · ${noRing} column(s) with no ring (pre-break)` : '')
            + (crop ? ` · crop ${crop.sw}×${crop.sh} (${crop.zoom}×)` : ' · uncropped')
          : '')
        + (nFlat ? `  [${nFlat} FLAT]` : ''));
    }
    out.groups.push(g);
  }
  return out;
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// CONTRAST — every readable colour below is computed against the two page
// backgrounds and stated. Formula: WCAG 2.x relative luminance
//   L = 0.2126 R + 0.7152 G + 0.0722 B, channel c -> c/12.92 (c <= 0.04045)
//   else ((c + 0.055)/1.055)^2.4, ratio = (L_light + 0.05)/(L_dark + 0.05).
// House floor is 8:1 on ALL readable text (CLAUDE.md), which is well above
// WCAG AA. Frame imagery is exempt — it is not text.
//
//   backgrounds     --bg   #0d1117  L = 0.005483
//                   --panel #161b22 L = 0.010700
//
//   token        hex       L         on --bg   on --panel
//   --ink        #e6edf3   0.838624  16.02:1   14.64:1
//   --ink-dim    #a8b8c8   0.467759   9.33:1    8.53:1
//   --link       #7fd7e8   0.589391  11.52:1   10.53:1
//   --warn       #ffd166   0.678202  13.12:1   12.00:1
//   --bad        #ff9a9a   0.467043   9.32:1    8.52:1
//   --ok         #7ee0a6   0.605001  11.81:1   10.79:1   (clean-tree stamp)
//
// Lowest ratio anywhere on these pages is 8.52:1 (--bad on --panel), so the
// 8:1 floor holds for every label, caption, value, hash and table header.
// --line/--line2 are hairlines and chip borders only; nothing is read off them.
// The dirty-build banner reverses nothing — it is --bad text on --panel, the
// 8.52:1 case, not white-on-red.
const CSS = `/* generated by scripts/build_qa_sheets.mjs — see the contrast block in that file */
:root{
  color-scheme: dark;
  --bg:#0d1117; --panel:#161b22;
  --ink:#e6edf3;      /* 16.02:1 on --bg, 14.64:1 on --panel */
  --ink-dim:#a8b8c8;  /*  9.33:1 on --bg,  8.53:1 on --panel */
  --link:#7fd7e8;     /* 11.52:1 on --bg, 10.53:1 on --panel */
  --warn:#ffd166;     /* 13.12:1 on --bg, 12.00:1 on --panel */
  --bad:#ff9a9a;      /*  9.32:1 on --bg,  8.52:1 on --panel */
  --ok:#7ee0a6;       /* 11.81:1 on --bg, 10.79:1 on --panel */
  --line:#30363d; --line2:#3d4652;   /* hairlines only, never text */
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;max-width:100%;overflow-x:hidden}
body{background:var(--bg);color:var(--ink);
  font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif}
a{color:var(--link)}
.wrap{max-width:1760px;margin:0 auto;padding:22px 18px 64px}
h1{font-size:25px;margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:18px;margin:0 0 4px}
.lede{color:var(--ink-dim);margin:0 0 14px;max-width:78ch}
.meta{background:var(--panel);border:1px solid var(--line);border-radius:8px;
  padding:12px 14px;margin:0 0 22px}
.meta dl{display:grid;grid-template-columns:max-content 1fr;gap:3px 14px;margin:0}
.meta dt{color:var(--ink-dim);font-size:13px}
.meta dd{margin:0;font-size:13px}
.meta code, code{font-family:var(--mono);font-size:12.5px}
.groupnote{color:var(--ink-dim);font-size:13.5px;margin:0 0 10px;max-width:88ch}
.group{margin:30px 0 0}
.grid{display:grid;grid-template-columns:176px repeat(5,minmax(0,1fr));
  gap:8px;align-items:start}
.colhead{position:sticky;top:0;z-index:3;background:var(--panel);
  border:1px solid var(--line);border-radius:6px;padding:6px 8px;
  font-size:12.5px;font-weight:600}
.colhead .sub{display:block;color:var(--ink-dim);font-weight:400;font-size:11.5px}
.corner{position:sticky;top:0;left:0;z-index:4;background:var(--panel);
  border:1px solid var(--line);border-radius:6px;padding:6px 8px;
  font-size:12.5px;font-weight:600}
.rowhead{position:sticky;left:0;z-index:2;background:var(--panel);
  border:1px solid var(--line);border-radius:6px;padding:8px 9px;font-size:12.5px}
.rowhead .title{font-weight:600;display:block;margin-bottom:2px}
.rowhead .sub{color:var(--ink-dim);font-size:11.5px;display:block;margin-bottom:6px}
.rowhead dl{display:grid;grid-template-columns:max-content 1fr;gap:1px 8px;margin:0;
  font-size:11.5px}
.rowhead dt{color:var(--ink-dim)}
.rowhead dd{margin:0;font-variant-numeric:tabular-nums}
.rowhead .base{display:block;margin-top:6px;font-family:var(--mono);font-size:10.5px;
  color:var(--link);word-break:break-all;text-decoration:none}
.cell{background:var(--panel);border:1px solid var(--line);border-radius:6px;
  padding:6px;display:flex;flex-direction:column;gap:5px;min-width:0}
.cell.flat{border-color:var(--bad)}
.cell img{display:block;width:100%;height:auto;border-radius:3px;background:#000}
.nums{display:flex;flex-wrap:wrap;gap:3px 8px;font-size:11.5px;
  font-variant-numeric:tabular-nums;color:var(--ink-dim)}
.nums b{color:var(--ink);font-weight:600}
.badge{display:inline-block;border:1px solid var(--line2);border-radius:999px;
  padding:0 6px;font-size:11px;color:var(--ink-dim)}
.badge.peak{color:var(--warn);border-color:var(--warn)}
.badge.flat{color:var(--bad);border-color:var(--bad);font-weight:600}
/* The tracked wave's own readout. --warn on --panel is 12.00:1, and the badge
   border is a hairline, never read. */
.badge.track{border-color:var(--line2);cursor:help}
.badge.track.unbroken{color:var(--ink-dim)}   /* 8.53:1 on --panel */
.badge.track.breaking{color:var(--warn)}      /* 12.00:1 */
.badge.track.broken{color:var(--ok);border-color:var(--ok)}  /* 10.79:1 */
.badge.track .fm{opacity:1}
.badge.lost{color:var(--bad);border-color:var(--bad);cursor:help}
/* A row that does not break says so where the header would otherwise promise
   one. --bad is 8.52:1 on --panel. */
.rowhead .nobreak{display:block;margin-top:6px;color:var(--bad);font-size:11px;line-height:1.35}
.rowhead .nobreak b{color:var(--bad)}
.foamrow{display:flex;gap:4px;align-items:baseline;font-size:11px;
  font-variant-numeric:tabular-nums;color:var(--ink-dim);margin-top:5px}
.foamrow b{color:var(--ink)}
.rowhead .cropnote{display:block;margin-top:6px;color:var(--ink-dim);font-size:11px;line-height:1.35}
.rowhead .cropnote b{color:var(--ink)}
.hash{font-family:var(--mono);font-size:10.5px;line-height:1.35;color:var(--link);
  word-break:break-all;text-decoration:none;display:block}
.hash:hover{text-decoration:underline}
.foot{margin-top:34px;border-top:1px solid var(--line);padding-top:14px;
  color:var(--ink-dim);font-size:13px;max-width:88ch}
.foot b{color:var(--ink)}
ul{margin:6px 0 0;padding-left:20px}
li{margin:3px 0}
.alert{border:1px solid var(--bad);border-radius:8px;padding:10px 13px;margin:0 0 18px;
  color:var(--bad);font-size:13.5px}
.alert b{color:var(--bad)}
/* Provenance. Not a source comment — a published QA artifact has to state its
   own build on the page a reader is looking at. */
.prov{background:var(--panel);border:1px solid var(--line);border-radius:8px;
  padding:12px 14px;margin:0 0 14px}
.prov h3{margin:0 0 7px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;
  color:var(--ink-dim);font-weight:600}
.prov dl{display:grid;grid-template-columns:max-content 1fr;gap:3px 14px;margin:0}
.prov dt{color:var(--ink-dim);font-size:13px}
.prov dd{margin:0;font-size:13px;min-width:0;overflow-wrap:anywhere}
.prov .clean{color:var(--ok);font-weight:600}
.prov .dirty{color:var(--bad);font-weight:600}
.provlinks{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:9px;
  padding-top:9px;border-top:1px solid var(--line);font-size:13px}
.dirtybanner{border:1px solid var(--bad);border-radius:8px;padding:11px 14px;
  margin:0 0 16px;background:var(--panel);color:var(--bad);font-size:13.5px}
.dirtybanner b{color:var(--bad)}
.dirtybanner ul{color:var(--bad)}
.dirtybanner code{color:var(--bad)}
.standing{background:var(--panel);border:1px solid var(--line);border-radius:8px;
  padding:12px 14px;margin:0 0 18px;font-size:13.5px;color:var(--ink-dim);max-width:88ch}
.standing b{color:var(--ink)}
.standing p{margin:0 0 8px}
.standing p:last-child{margin:0}
/* The published set is a SUBSET of the local matrix. That is a scope statement,
   so it sits with the standing caveats rather than in a footnote. */
.subset{border-left:3px solid var(--warn)}
.subset b{color:var(--ink)}
/* n/a is a result here, not a gap. It carries its reason on hover and the
   footer spells both classes out — a reader must never have to guess. */
.na{color:var(--warn);font-weight:600;border-bottom:1px dotted var(--warn);cursor:help}
.rowhead .nabed{display:block;margin-top:5px;color:var(--warn);font-size:11px;line-height:1.35}
@media (max-width:900px){
  .grid{grid-template-columns:140px repeat(5,minmax(0,1fr));gap:6px}
}
`;

// ---------------------------------------------------------------------------
// Provenance, links, standing caveats — the blocks that make a sheet publishable
// ---------------------------------------------------------------------------

// `up` is the relative prefix from THIS page back to the snapshot root, so the
// same block serves a sheet (up = '') and the snapshots index (up = '').
function provenanceHTML(p, builtAt) {
  const stale = p.capturedAt !== builtAt;
  return `<section class="prov">
  <h3>Provenance</h3>
  <dl>
    <dt>captured</dt><dd>${esc(p.capturedAt)}${stale ? ` <span style="color:var(--ink-dim)">(frames; page re-rendered ${esc(builtAt)})</span>` : ''}</dd>
    ${stale ? '' : `<dt>built</dt><dd>${esc(builtAt)}</dd>`}
    <dt>commit</dt><dd><code>${esc(p.commit)}</code> · <code>${esc(p.commitFull)}</code></dd>
    <dt>branch</dt><dd><code>${esc(p.branch)}</code></dd>
    <dt>working tree</dt><dd>${p.dirty
      ? `<span class="dirty">DIRTY — ${p.dirtyCount} uncommitted path${p.dirtyCount === 1 ? '' : 's'} at capture time</span>`
      : '<span class="clean">clean</span>'}</dd>
    <dt>app build</dt><dd><code>${esc(p.appDigest)}</code> — ${esc(p.appDigestAlgo)}</dd>
    ${p.note ? `<dt>note</dt><dd>${esc(p.note)}</dd>` : ''}
    <dt>links resolve to</dt><dd><code>${esc(p.linkBase || '')}</code> (<code>${esc(p.mode)}</code> mode)</dd>
  </dl>
  <div class="provlinks">
    <a href="${esc(p.essayUrl)}">Visual essay ↗</a>
    <a href="${esc(p.repoUrl)}">Repository ↗</a>
    <a href="${esc(p.commitUrl)}">This exact commit ↗</a>
  </div>
</section>`;
}

// A published artifact built from uncommitted code cannot be reproduced from
// its own stamp. That is worth a banner, not a field.
function dirtyBannerHTML(p) {
  if (!p.dirty) return '';
  const files = (p.dirtyFiles || []);
  return `<div class="dirtybanner">
<b>Built from a DIRTY working tree.</b> ${p.dirtyCount} path${p.dirtyCount === 1 ? ' was' : 's were'}
uncommitted when these frames were captured, so commit <code>${esc(p.commit)}</code> does <b>not</b> reproduce
them — checking that commit out gives you different code from the one that drew these pictures.
Treat every number here as provisional until the sheet is rebuilt from a clean tree.
<ul>${files.map((f) => `<li><code>${esc(f)}</code></li>`).join('')}
${p.dirtyCount > files.length ? `<li>… and ${p.dirtyCount - files.length} more</li>` : ''}</ul>
</div>`;
}

// What the sheet IS and what it is NOT. Standing text, on every page, because a
// published page is read by people who did not build it.
const STANDING = `<section class="standing">
<p><b>What this is.</b> A QA instrument. Deterministic captures of the pointbreak wave model at clocks
pinned by the model itself, laid out so a defect is visible by scanning rather than by hunting. Every cell
is labelled with the exact URL hash it was taken at and links into the simulator at that state, so any frame
here can be reopened and argued with.</p>
<p><b>What this is not.</b> Not a validation. The model is <b>unvalidated against measured surf</b> — a first
validation pass, model residuals against an independent record of a specific day, is the largest open gap in
the project. These sheets check the model against <i>itself</i>: that it is deterministic, that its phases
differ, that something breaks where something should. They cannot tell you whether it matches Pleasure Point.
Not a surf report, not a forecast, and not usable for any decision about entering the water.</p>
<p><b>What a still cannot show.</b> No frame here supports a claim with a verb of motion in it. What each cell
states is a <i>position at a known clock</i>, read out of the model; the frames are ordered by the model's own
clock rather than by inspection, so a reader may compare those positions across a row. The pictures themselves
still cannot tell you which way anything is going, and nothing on these pages is measured off them except the
pixel foam fraction, which is labelled as such.</p>
<p><b>Licence.</b> Code, docs and these renders are <b>MIT</b> (© 2026 Andy Edmonds). The frames are Produced
Works under ODbL — the coastline geometry they are drawn over is OpenStreetMap-derived, and the seabed is
NOAA NCEI (public domain). Attribution below is required; share-alike is not triggered by a rendering.
The full file-by-file split is <code>LICENSES.md</code> in the repository.</p>
<p><span style="color:var(--ink-dim)">Coastline &amp; spots: OpenStreetMap contributors, ODbL 1.0 ·
Bathymetry: NOAA NCEI Monterey Bay 1/3″ coastal DEM, NAVD88 ·
Seasonality: CDIP MOP v1.1 SC116 hindcast (Scripps).</span></p>
</section>`;

// The two ways this sheet legitimately says n/a. Both are results — a number
// would be the dishonest option — so they are explained where they appear.
const NA_NOTE = `<p><b>Where this sheet says <span class="na">n/a</span>, and why.</b> Two measures go blank at
<b>Privates</b>, and only at Privates, because that site's coastline defeats the contour fit (16.5 m RMS) and
it runs on a <i>synthetic stage</i> rather than a surveyed seabed. <b>foam<sub>pix</sub></b> needs a baked break
line to project a corridor onto; with no measured bed there is no baked line, so there is nothing to sample and
the cell reads <code>n/a</code> instead of sampling an arbitrary band of pixels. <b>ceilM</b>, the depth-limited
crest ceiling in the JSON, is <code>null</code> for the same root cause one step further on: the site runs
<code>u_depthMix = 0</code>, the seabed sampler is a 1×1 stand-in, and the depth the shader reads back is the
storage format's quantization floor rather than a seabed — so γh never binds and the "ceiling" would be
<code>1.878·H₀</code> wearing a depth limit's name. <b>Privates has no measured bed and therefore no ceiling to
be over.</b> An earlier sheet did print that number and produced a headline defect ("2.2× over its ceiling")
that was entirely an artifact of dividing by it. Everything else on the Privates row — crest, foam<sub>model</sub>,
the set envelope — is measured the same way as every other site and is directly comparable.</p>`;

// What the tracked wave is doing in this cell, derived from the model reads
// rather than asserted. Each phrase is a STATE at a known clock, never a verb
// of motion (MEASUREMENT_LESSONS 1): the reader infers the motion from five
// states in the model's own clock order, which is exactly the inference a still
// cannot support on its own and an ordered sequence can.
function trackedLabel(cell, row) {
  if (!row || cell.foamAtWatch === null || cell.foamAtWatch === undefined) return '';
  const f = cell.foamAtWatch;
  const d = cell.crestOffLineM;
  // What state the tracked wave is IN, from its own foam. The wording follows
  // the number, so a cell can never promise a break the frame does not contain.
  const state = f >= 0.60 ? 'breaking'
    : f >= 0.15 ? 'starting to break'
      : 'unbroken';
  const cls = f >= 0.60 ? 'broken' : (f >= 0.15 ? 'breaking' : 'unbroken');
  const where = (d === null || d === undefined) ? ''
    : (d < -1 ? ` · crest ${Math.abs(d).toFixed(0)} m outside the line`
      : (d > 1 ? ` · crest ${d.toFixed(0)} m inside the line` : ' · crest on the line'));
  const ring = (cell.bpX === null || cell.bpX === undefined)
    ? '<span title="No part of this wave is at the break line yet, so there is no breaking point to ring. An empty column 1 is what &quot;still unbroken&quot; looks like.">no ring — not at the line yet</span>'
    : `<span title="The ring: the point on the tracked crest with the largest pocket, which is this wave's own breaking point. Down the point is +x.">ring at x = ${cell.bpX >= 0 ? '+' : ''}${cell.bpX.toFixed(0)} m</span>`;
  return `<span class="badge track ${cls}" title="Read from the model's foam AT THE TRACKED CREST, not at a fixed point in the water — the bore left by previous waves never goes quiet there, which is how the first version of this sheet reported 0.87 in a column whose wave had not broken.">${esc(state)}<span class="fm"> · foam on the crest ${f.toFixed(2)}</span></span>`
    + `<span>${esc(where.replace(/^ · /, ''))}</span>`
    + `<span>${ring}</span>`;
}

function cellHTML(base, cell, row) {
  const url = `${base}web-three/#${cell.hash}`;
  const cls = 'cell' + (cell.flat ? ' flat' : '');
  const badge = cell.flat
    ? '<span class="badge flat">FLAT — no whitewater at the line</span>'
    : (cell.phase === 'SET PEAK' ? '<span class="badge peak">SET PEAK</span>' : '');
  const imgHref = cell.imgFull || cell.img;
  const imgTitle = cell.imgFull
    ? `open the uncropped ${VIEW.width}×${VIEW.height} frame, marker and all`
    : `open the full ${VIEW.width}×${VIEW.height} frame`;
  const tracked = trackedLabel(cell, row);
  return `<div class="${cls}">
  <a href="${esc(imgHref)}" title="${esc(imgTitle)}"><img src="${esc(cell.img)}" alt="frame at sim ${cell.t} s" width="${VIEW.width}" height="${VIEW.height}" loading="lazy"></a>
  <div class="nums"><span><b>t ${cell.t.toFixed(1)} s</b></span>${badge}</div>
  ${tracked ? `<div class="nums">${tracked}</div>` : ''}
  <div class="nums">
    <span>env <b>${cell.env.toFixed(2)}</b></span>
    ${cell.crestEnvM === undefined || cell.crestEnvM === null
      // Set sheet: the headline crest is the tallest wave to cross the aim
      // station within +-T/2 of this clock. The instant it replaces is kept
      // beside it, because the FRAME shows the instant — a reader comparing
      // number to picture must be able to see both.
      ? `<span>crest <b>${cell.crestM === null ? '—' : cell.crestM.toFixed(2) + ' m'}</b></span>`
      : `<span>crest<sub>±T/2</sub> <b>${cell.crestEnvM.toFixed(2)} m</b></span>`
        + `<span>inst ${cell.crestM === null ? '—' : cell.crestM.toFixed(2)}</span>`}
  </div>
  <div class="nums">
    <span>foam<sub>model</sub> <b>${cell.modelFoamMax.toFixed(2)}</b> (${(cell.modelFoamFrac * 100).toFixed(0)}% of stage)</span>
    <span>foam<sub>pix</sub> ${cell.pixFracLo === null
      ? '<b class="na" title="No measured bed at this site, so there is no baked break line to project a pixel corridor onto. n/a is the result, not a gap — see the footer.">n/a</b>'
      : `<b>${(cell.pixFracLo * 100).toFixed(1)}%</b>`}</span>
  </div>
  <a class="hash" href="${esc(url)}" title="${esc('#' + cell.hash)}">#${esc(cell.hash)}</a>
</div>`;
}

function rowHTML(base, row) {
  const s = row.state;
  return `<div class="rowhead">
  <span class="title">${esc(row.label)}</span>
  <span class="sub">${esc(row.sub)}</span>
  <dl>
    <dt>H₀</dt><dd>${s.H0.toFixed(2)} m</dd>
    <dt>T</dt><dd>${s.T.toFixed(1)} s</dd>
    <dt>tide</dt><dd>${s.tide.toFixed(2)} m</dd>
    <dt>Δf</dt><dd>${s.dF} Hz</dd>
    <dt>ξ</dt><dd>${s.xi.toFixed(2)}</dd>
    <dt>step</dt><dd>${row.clocks.spacing.toFixed(2)} s</dd>
    ${row.clocks.spanS === undefined ? '' : `<dt>row spans</dt><dd>${row.clocks.spanS.toFixed(2)} s</dd>`}
    ${row.peelM === null || row.peelM === undefined ? ''
    : `<dt>peel</dt><dd title="Ring x in the first ringed column against the last — two model reads at two known clocks, not a motion read off the pictures.">${row.peelM >= 0 ? '+' : ''}${row.peelM.toFixed(0)} m</dd>`}
    ${row.markerOffMaxM === null || row.markerOffMaxM === undefined ? ''
    : `<dt>ring off line</dt><dd title="Worst distance, over this row's ringed columns, between the ring and the break line. A breaking point belongs on the line, so this is the ring's own error bar.">≤ ${row.markerOffMaxM.toFixed(2)} m</dd>`}
    <dt>cam drift</dt><dd>${row.camDriftM === undefined ? '—' : row.camDriftM.toFixed(2) + ' m'}</dd>
  </dl>
  ${row.accept ? `<div class="foamrow" title="The model's whitewater AT THE TRACKED CREST, at the takeoff station the window was measured at, for each of the five clocks. This is the row's acceptance: it must start pre-break and end broken.">foam on the crest
    <b>${row.accept.foam.map((v) => (v === null ? '—' : v.toFixed(2))).join(' → ')}</b>
    ${row.accept.pass ? '' : '<span style="color:var(--bad)">✗</span>'}</div>` : ''}
  ${row.clocks && row.clocks.breaks === false
    ? `<span class="nobreak"><b>This row does not break.</b> ${esc(row.clocks.peakFoamAtCrest !== undefined
      ? `Whitewater at the tracked crest peaks at ${row.clocks.peakFoamAtCrest} against the ${CREST_FOAM_BREAK} the breaking rows all pass.`
      : '')} The five clocks span the crest indicator's own collapse instead, and the row is kept out of the published set.</span>`
    : ''}
  <span class="sub" style="margin-top:6px">${esc(s.hudGeo || '')}</span>
  ${row.cells.some((c) => c.baked === false)
    ? '<span class="nabed">Synthetic stage — no measured bed here, so the depth ceiling and the pixel'
      + ' corridor read <span class="na" title="Explained in full at the foot of this page.">n/a</span>'
      + ' on this row. The crest and model foam are measured as everywhere else.</span>'
    : ''}
  ${row.crop ? `<span class="cropnote">Cropped to ${row.crop.sw}×${row.crop.sh} of the ${VIEW.width}×${VIEW.height}
    capture (${row.crop.zoom}× closer), the same window in all five columns. Camera untouched — that is what the
    <b>cam drift</b> above still measures.</span>` : ''}
  <a class="base" href="${esc(base)}web-three/#${esc(row.rowHash)}&amp;sim=${row.clocks.times[0]}" title="${esc('#' + row.rowHash)}">#${esc(row.rowHash)}</a>
</div>` + row.cells.map((c) => cellHTML(base, c, row)).join('\n');
}

function sheetHTML(sheet, data, base, extras) {
  // The column header is shared, but the phases are not: a row that does not
  // break gets "crest intact -> crest gone" instead of "still unbroken ->
  // breaking". Take the wording from a row that BREAKS where one exists, or the
  // local sheet's header would describe every row by its first one, which is
  // day=small — a row that does not break. Rows that disagree with the header
  // say so in their own header, in red, next to their own cells.
  const allRows = data.groups.flatMap((g) => g.rows);
  const clock0 = (allRows.find((r) => r.clocks && r.clocks.breaks) || allRows[0]).clocks;
  // A header saying "breaking — whitewater at the crest" over a row that does
  // not break is the exact thing this sheet exists not to do, and one header
  // serves every row. So the vivid wording is used only when EVERY row breaks
  // (the published set); where any row does not, the header states the position
  // in the window and nothing else, and what each wave is actually doing stays
  // in the cells, where it is that row's own read.
  const allBreak = sheet.clock.kind !== 'wave'
    || allRows.every((r) => r.clocks && r.clocks.breaks);
  const NEUTRAL = ['start of the window', 'a quarter through', 'halfway',
    'three quarters through', 'end of the window'];
  const cols = allBreak ? clock0.phases
    : clock0.phases.map((p, i) => NEUTRAL[i] || p);
  // Column headers carry the clock and, on the break sheet, the ONE thing about
  // the wave that is true in every row at that clock: how far the tracked crest
  // has advanced, in crest spacings. That ratio is exactly k/denom whatever the
  // site, size or camera — advance/spacing = dt/T — so it can be stated once
  // over the whole grid. What the wave is DOING at that clock differs by row, so
  // it is labelled per cell, from that row's own model reads, rather than
  // asserted here over rows it might be wrong about.
  const subs = clock0.subs
    || cols.map((_, i) => (i === 0 ? 'anchor'
      : `+${i}/${sheet.clock.kind === 'wave' ? '5 T' : '4 beat'}`));
  const flats = [];
  for (const g of data.groups) for (const r of g.rows) for (const c of r.cells)
    if (c.flat) flats.push(`${g.id} / ${r.label} / column ${c.k + 1} (t = ${c.t.toFixed(1)} s)`);
  const groups = data.groups.map((g) => `
<section class="group">
  <h2>${esc(g.label)}</h2>
  <p class="groupnote">${esc(g.note)}</p>
  <div class="grid">
    <div class="corner">row ↓ / clock →</div>
    ${cols.map((c, i) => `<div class="colhead">${i + 1}. ${esc(c)}<span class="sub">${esc(subs[i])}</span></div>`).join('\n    ')}
    ${g.rows.map((r) => rowHTML(base, r)).join('\n    ')}
  </div>
</section>`).join('\n');

  const first = allRows.find((r) => r.clocks && r.clocks.breaks) || allRows[0];
  const prov = { ...(data.provenance || PROVENANCE), linkBase: data.linkBase || base };
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(sheet.title)} — pointbreak QA</title>
<style>${CSS}</style>
<div class="wrap">
<h1>${esc(sheet.title)}</h1>
<p class="lede">${esc((prov.mode === 'published' && sheet.pubBlurb) || sheet.blurb)}</p>
${dirtyBannerHTML(prov)}
${provenanceHTML(prov, GENERATED.toISOString())}
${STANDING}
${prov.mode === 'published' && PUB_NOTES[sheet.id]
    ? `<section class="standing subset">${PUB_NOTES[sheet.id]}</section>` : ''}
${flats.length ? `<div class="alert"><b>${flats.length} cell${flats.length === 1 ? '' : 's'} drew flat water where a break was promised.</b><ul>${flats.map((f) => `<li>${esc(f)}</li>`).join('')}</ul></div>` : ''}
<div class="meta"><dl>
  <dt>viewport</dt><dd>${VIEW.width} × ${VIEW.height} px, deviceScaleFactor 1</dd>
  <dt>pinned</dt><dd><code>${esc(COMMON)}</code> — frozen clock, no UI in frame, quality tier pinned</dd>
  <dt>clock spacing</dt><dd>${esc(first.clocks.periodLabel)}, columns ${first.clocks.spacing.toFixed(2)} s apart. ${esc(first.clocks.how)}</dd>
  ${sheet.clock.kind === 'wave' ? `<dt>the marks</dt><dd>One wave is tracked across each row. The <b>line</b> is
    its crest, marched station by station along the break line from the takeoff by the argmax of the displaced
    surface, seeded each column from the previous one, so the row follows the same wave rather than re-acquiring
    whatever is tallest. The <b>ring</b> is the point on that crest with the largest <code>pocket</code> —
    <code>crestNear(θ)·bell(d)·env²·reef</code> in <code>shared/model-glsl.js</code>, whose <code>d</code> term
    peaks where the crest is closest to the break line, so read along the crest it is <i>this wave's own breaking
    point</i>. Both are computed from the model and projected through the live camera matrices, not placed by hand.
    <b>Before the wave reaches the line there is no ring</b>, because there is no breaking point to ring; an empty
    first column is what <i>still unbroken</i> looks like, and a ring there would be sitting on the previous wave.
    <b>The mark carries its own error bar</b>: <code>markerOffM</code> in the JSON, and <b>ring off line</b> in each
    row header, is how far the ring sits from the break line over the columns where the wave is actually at it —
    a breaking point belongs on the line, so a mark that wandered onto the wrong wave would say so there.</dd>
  ${allBreak ? '' : `<dt>column headers</dt><dd>Neutral on this sheet, because <b>not every row here breaks</b> and
    one header serves them all. A header reading "breaking — whitewater at the crest" over a row that does not
    break is the failure this page exists to avoid, so it states the position in the window and nothing else; what
    each wave is actually doing is in the cell, from that row's own reads. The published sheet, whose rows all
    break, gets the fuller wording.</dd>`}
  <dt>the acceptance</dt><dd><b>foam on the crest</b> in each row header is the model's whitewater at the tracked
    crest at each of the five clocks. It is this sheet's own pass/fail: a row must start <i>pre-break</i> and end
    <i>broken</i>. It is read on the crest and not at a fixed point in the water on purpose — at a point break the
    line is more or less permanently breaking somewhere, so a fixed station never goes quiet between waves, and an
    earlier version of this sheet reported foam 0.87 in a column whose own wave had not broken. Rows that cannot
    pass are labelled on the page and kept out of the published set rather than given a header that promises a
    break their frames do not contain.</dd>
  <dt>framing</dt><dd>Cells are <b>cropped</b> to a window containing the tracked wave across all five columns of
    that row, computed from the marker's own projected extent and identical in every column, so the wave moves
    through a fixed frame instead of being re-centred out of its own motion. The <b>camera is never moved</b> — the
    crop is a pixel operation on the captured frame, which is why <b>cam drift</b> is still 0.00 m and why each
    cell's hash still reopens the full state. Each row header states its crop and how much closer it is;
    ${prov.mode === 'published' ? 'the full uncropped frame is one click away in the simulator, at the cell hash.'
    : 'clicking the image opens the uncropped frame, marker and all.'}</dd>` : ''}
  <dt>numbers</dt><dd><b>env</b> — set envelope at the break line, through the repo's own <code>setEnv</code> twin
    (<code>web-three/js/model-js.js</code>) fed from the live uniforms.<br>
    <b>crest</b> — tallest displaced surface point on the ±45 m shore-normal transect nearest where the camera
    is aimed, read straight off the GPU through <code>__pointbreak.curlProbe</code> (which runs the shipped
    shader chunk, not a re-derivation). One of 11 transects along the stage; the stage-wide max is in the JSON as
    <code>crestMaxM</code>, and it barely moves across a wave period because some wave is always cresting
    somewhere on 200 m of line. These are <b>displayed</b> metres — the renderer applies a viewing gain of
    <code>VIS = 3.2</code> (<code>shared/model-glsl.js</code>), so they are not physical wave heights.<br>
    <b>crest<sub>±T/2</sub></b> (set sheet only) — the same read swept across <b>one full wave period centred on
    the column clock</b> (12 sub-clocks) and maxed: the tallest wave to cross that station around this moment.
    This is the set sheet's headline number, and <b>inst</b> beside it is the single instant the frame shows.
    A set beat is 31–42 s per column against a 12–15 s wave, so the two are unrelated phases and an instant
    aliases the carrier into a number that claims to be about sets — measured at The Hook, the instant reads
    3.13 m in the peak column where the envelope reads 5.27 m and the biggest wave (5.30 m) crossed 3.9 s
    earlier. When they disagree, the wave is simply between crests at that station in that frame.<br>
    <b>foam<sub>model</sub></b> — the shader's own foam field at those same transects: peak value, and the share of
    the 11 stations carrying foam ≥ 0.15. Camera-independent, so the framing cannot move it.<br>
    <b>foam<sub>pix</sub></b> — the camera's answer: share of samples at luma ≥ ${FOAM_LO} over the whitewater
    <i>attachment corridor</i>, ${CORRIDOR_N} points per line station spanning ${CORRIDOR_M[0]} m to
    +${CORRIDOR_M[1]} m across the break line in <i>world</i> metres (sections shift included), each the max of its
    3×3 neighbourhood. Reads <code>n/a</code> where there is no baked line to project (Privates).
    It is corridor-local: whitewater that has already advected shoreward is outside it by design.<br>
    <b>ceilM</b> (JSON only) — the depth-limited crest ceiling <code>0.8·VIS·min(H₀K<sub>s</sub>, γh)</code> at those
    transects. <code>null</code> at Privates, and that is a result, not a gap: with no measured bed the site runs
    <code>u_depthMix = 0</code>, the seabed sampler is a 1×1 stand-in, and the depth the shader reads back is the
    storage format's own quantization floor (a flat 30.91 m stage-wide) rather than a seabed. <code>γh</code> then
    never binds and the "ceiling" is <code>1.878·H₀</code> wearing a depth limit's name, while the crest above it
    came from the depth-free synthetic branch. <b>Privates has no measured bed and therefore no ceiling to be over.</b>
    Its crest at the January set peak (5.32 m) is in family with all six mapped sites (4.99–5.32 m) on the same day.</dd>
  <dt>links</dt><dd>Every hash is a live link into <code>${esc(base)}web-three/</code> at that exact state, so clicking a
    suspicious frame drops you into the simulator at it. ${prov.mode === 'published'
      ? 'Those links are <b>relative to this page</b> and resolve against the simulator published beside the essay, so they work wherever this bundle is served from.'
      : 'That is a local dev server — start it with <code>python3 scripts/serve.py 8127</code>. A sheet built with <code>--mode=published</code> points at the deployed simulator instead.'}
    Row headers link to column 1. ${prov.mode === 'published'
      ? `Clicking the <b>image</b> opens that frame on its own. Frames were captured at ${VIEW.width}×${VIEW.height} and are
    published at ${PUB_W}×${PUB_H} WebP to keep this page a reasonable download; every measurement on it was taken from the
    full-resolution capture before any crop, marker or downscale, and the hash link reopens the state at full fidelity in the
    simulator, which is better evidence than any still.`
      : `Clicking the <b>image</b> opens the uncropped ${VIEW.width}×${VIEW.height} frame instead.`}
    Captures were taken on their own separate port so they never touched your dev server.</dd>
</dl></div>
${groups}
<div class="foot">
${extras}
${NA_NOTE}
<p><b>Method caveat.</b> Column 1 of every row is captured from a cold load at its own <code>#sim=</code>; columns 2–5 advance the clock with <code>__pointbreak.setSim()</code> plus two rAF ticks — the mode <code>scripts/capture_temporal.mjs</code> validated against per-frame reloads. Each cell's hash reproduces its frame either way.</p>
<p><b>Camera drift, recorded not assumed.</b> The <code>#aim</code> cameras frame the baked line's action centroid
and smooth over ~6 s of sim time, so advancing the clock <i>could</i> move the instrument between columns of one row
(MEASUREMENT_LESSONS 11: an instrument that frames itself on the signal is not a fixed instrument). Each row header
carries the largest camera displacement between any two of its five columns. A row with a non-trivial drift there
is comparing slightly different windows, and its numbers should be read accordingly. The camera legitimately
<i>does</i> differ between rows — the break line moves with H₀ — so only within-row drift is a concern.</p>
<p><b>Stills, not motion.</b> Nothing here is a motion read off the pictures (MEASUREMENT_LESSONS 1). The positions
in the cells and the <b>peel</b> in the row headers are model reads at clocks the model itself derived, and the
frames are ordered by that clock, so the ordering is established rather than inferred — which is precisely what
lesson 1's third failure ("peel direction is rightward, confirmed across two frames") lacked. Read as pictures,
these frames still cannot tell you which way the peel runs.</p>
<p><a href="index.html">← all QA sheets in this build</a>
 · <a href="${esc(sheet.id)}.json">raw measurements (JSON)</a> — the same provenance block, machine-readable
 · <a href="${esc(prov.essayUrl)}">the essay</a>
 · <a href="${esc(prov.repoUrl)}">the repo</a>
 · <a href="${esc(prov.commitUrl)}">commit <code>${esc(prov.commit)}</code></a></p>
</div>
</div>
`;
}

// Published mode ships a SUBSET of the rows. Silent truncation is exactly the
// thing these sheets exist to avoid, so the cut is stated per sheet, on the
// page, with the reason — and the local matrix it was cut from is named.
const PUB_NOTES = {
  'break-progression': `
<p><b>This is the published view: 2 of 6 rows.</b> The full local sheet runs six wave sizes — four condition
bundles (<code>day=small</code>, <code>modelcard</code>, <code>overhead</code>, <code>big</code>) and two
<code>h0=</code>-only rows that hold period and tide fixed. Published here are the two <b>ends of the range that
breaks at this site</b>: the model-card day (H₀ 1.50 m, T 14 s) against the big groundswell (H₀ 2.50 m, T 17 s).
The <code>h0=</code> rows separate height from period, which is a QA question rather than a reader's, and
<code>day=overhead</code> sits between the two kept rows.</p>
<p><b>Why the small end is not the smallest day.</b> <code>day=small</code> is H₀ 0.70 m, and Second Peak's
<i>measured peel floor</i> is 1.08 m — below it the baked break line abandons the oblique reef branch and the
peel collapses (stage α 6.6° against a 41° target). Measured on the same instrument as every other row,
whitewater at the tracked crest there peaks at <b>0.193</b>, against <b>0.858–0.890</b> for every row that
breaks. It is not a small break; it is not a break. Publishing it under a header that says
<i>breaking — whitewater at the crest</i> would be the exact failure this page exists to avoid, so it stays on
the local sheet, labelled, with its own numbers on it.
<b>All five clocks are kept in every row</b>: this sheet is a progression, and a progression sampled at three
points stops being one.</p>
<p><b>Why only the drone camera.</b> The local sheet shows the same rows and the same derived clocks from the
cliff stand as well, and that view is the better one in principle — throw, curtain and collapse are all edge-on
from a low profile. In practice the break at Second Peak is several hundred metres off that stand, so the
tracked crest lands within about 20 px of the horizon and the whitewater burst this page measures at 0.86 is a
few pixels of grey. The crop is bounded at 2.4× before upsampling turns soft, so it cannot rescue the frame;
reaching further needs capture at a higher device scale factor, which moves the pixel-corridor coordinates the
foam measurement depends on. That is deliberate work rather than a side effect, so the cliff rows stay on the
local sheet until it is done.</p>`,

  'sets-locations-seasons': `
<p><b>This is the published view: 7 of 13 rows.</b> The full local sheet runs all seven site presets at
<code>month=january</code> plus two presets across three months. Published here are three sites and two
months. The sites are <b>Sewers</b> (ξ 1.15, the most plunging in the bank), <b>Second Peak</b> (ξ 0.65, the
most spilling) and <b>Privates</b> (the one synthetic-stage site, which is where the <span class="na"
title="Explained in full at the foot of this page.">n/a</span> readings on this page come from) — the two ends
of the breaker-character range plus the honest edge case. The four omitted sites sit between the two mapped
ones. The months are <b>January</b> and <b>August</b>, the two the CDIP record actually separates: H₀ p75
1.245 m against 0.585 m, with zero hours at or above Hs 1.3 m across twenty-five Augusts. October is the
shoulder month and is in the local sheet to catch a monotonicity break, which is QA rather than exposition.
<b>All five clocks are kept in every row</b>: lull → building → peak → easing → lull is the demonstration.</p>`,
};

// Per-sheet honesty block: what was sampled, what was deliberately left out.
// Silent truncation is the thing to avoid, so the omissions are on the page.
const SHEET_NOTES = {
  'break-progression': `
<p><b>What the five clocks are (2026-08-20).</b> They are that row's own <b>break event</b>, measured rather than
chosen: from the last clock at which the model's whitewater <i>at the tracked crest</i> is still at or below
0.02, to the first at which it reaches 0.60, at the <b>takeoff station</b> — the place where a crest first meets
the break line, so where this wave's break starts and its peel begins. The window is found by seeding on the
crest nearest the line at the set anchor and walking time <i>backwards</i> until that crest is unbroken and
forwards until it is whitewater. Walking backwards is the whole point: the clock this sheet needs is
<i>before it breaks</i>, and there is no forward-only way to find that from an anchor that already sits
mid-break.</p>
<p><b>Two things this sheet got wrong first, both recorded because the numbers hid them.</b>
<i>(1) The span.</i> The columns used to run one full wave period at T/5. A crest advances exactly one crest
spacing per period, so column 5 sat 0.80 of a spacing on — 0.20 from where the <i>next wave upstream</i> had been
in column 1, and the sheet very nearly aliased back onto itself. That ratio is not site-specific: advance ÷
spacing = Δt ÷ T cancels the local wavelength, so it was 0.80 on every row, at every camera, at every H₀. It is
visible in the sheet's own reads — laid out over a full T the tracked breakpoint goes
<code>36 / 56 / 88 / 4 / 36</code> at <code>day=small</code>, back on column 1's station to the metre.
<i>(2) The anchor, which survived the first fix.</i> The row was anchored on the argmax of crest <b>height</b> at
the break line. A wave is tallest <i>at</i> the line, and at the line it is already breaking — so the anchor sat
at or after break onset by construction, and the frames showed it: an established whitewater band up-line of the
mark in column 1, foam 0.87 in the first cell, and the tracked wave then <i>decaying</i> across the row
(crest 2.98 → 2.71 m) rather than breaking. A correct measurement of the wrong instant.</p>
<p><b>Why the foam is read at the crest and not at a station.</b> At a point break the line is more or less
permanently breaking somewhere, so whitewater at a <i>fixed point in the water</i> never goes quiet between
waves — it is the bore left by the wave before. That is how a column whose own wave had not broken could report
foam 0.87. Every acceptance number on this sheet is read <b>on the tracked crest</b>, so it is this wave's state
and nobody else's.</p>
<p><b>What is on this sheet.</b> Six wave sizes at <code>preset=secondpeak</code>. Four rows are the curated
<i>condition bundles</i> from <code>web-three/js/conditions.js</code>: a bundle moves H₀, period, tide
and Δf together, the way a real day does. Two rows are <code>h0=</code> only, which moves swell height
against the site card's own T = 15 s, tide and Δf — so the pair isolates height from period and tide.
Read the bundle rows for "what does this day look like" and the h0 rows for "what does size alone do".</p>
<p><b>What was left out.</b> <code>day=pulse</code> and <code>day=stormy</code> (the bank has six days; the
four sampled span the surf-worthy range and <code>stormy</code> is marked <code>good: false</code>).
One site only — cross-site comparison is the other sheet's job. Second Peak is ξ 0.65, so it spills more
than it plunges; Sewers (ξ 1.15) is the site to open if you are judging throw specifically. Tide is not
swept independently: it rides inside the bundles, which is why the bundle and h0 rows are not directly
comparable and are labelled as such.</p>
<p><b>The foam number can be occluded.</b> It samples the <i>projected</i> attachment corridor whether or not
terrain sits in front of it, so a low camera behind a bluff reads low foam for a wave that is breaking fine.
The model-side <code>pocket</code>/<code>brk</code> readings in the JSON are the check; a cell is only
flagged FLAT when both the pixels and the model say nothing broke.</p>
<p><b>The marker can be wrong, and it will say so.</b> The line is the tracked crest and the ring is the point on
it with the largest <code>pocket</code> — this wave's own breaking point. Both are model reads, not annotations,
so each carries a number. <b>ring off line</b> in the row header is the worst distance, over the columns where
this wave is actually at the line, between the ring and the break line it belongs on. And where no part of the
wave has reached the line yet there is <b>no ring at all</b>, rather than a ring on the previous wave: an empty
column 1 is what <i>still unbroken</i> looks like, and it is the single clearest tell that the anchor is now in
the right place.</p>
<p><b>A row that does not break says so.</b> Acceptance is measured per row and printed on it: whitewater at the
tracked crest must start pre-break and end broken. Two rows cannot pass, and both are H₀ 0.70 m at a site whose
measured peel floor is 1.08 m — <code>day=small</code> peaks at 0.193 and <code>h0=0.7</code> at 0.341, against
0.858–0.890 for every row that breaks. Their headers say <i>crest intact → crest gone</i> instead of promising a
break, their five clocks span the crest indicator's own collapse, and they are kept out of the published set.
The gap between 0.35 and 0.85 is empty across the whole bank, which is why the 0.60 line sits in it.</p>
<p><b>Stills in a known order.</b> Each cell states a <i>position</i> at a <i>known clock</i>; nothing on this page
claims a direction of travel from the pictures. The row header's <b>peel</b> is the difference between two model
reads at two model-derived clocks, not a motion measured off the frames — which is the distinction
MEASUREMENT_LESSONS 1 is about. The frames are ordered by the model's own clock, so the ordering is established
rather than inferred, and that is the only reason a reader may read the five states as a sequence.</p>`,
  'sets-locations-seasons': `
<p><b>What <code>month=</code> actually does.</b> It sets H₀ to that month's <b>p75</b> significant wave
height at CDIP SC116 (MOP v1.1, whole years 2000–2024, 218,975 hours used), de-shoaled from the 15 m
contour to the deep-water H₀ the shader re-shoals from. <b>Size only.</b> Period is seasonless in this
data — the interpolated spectral peak is 14.4–15.2 s in every month — so a month restores the site
card's own T, chop and Δf and changes nothing but height. Tide is not a CDIP product and is left alone.
<code>month=</code> and <code>day=</code> are mutually exclusive; an explicit <code>h0=</code> beats both.
August is the flat one for a measured reason: across 2000–2024 there are <b>zero hours</b> at or above
Hs 1.3 m in July or August. See <code>docs/research/PP_CDIP_CLIMATOLOGY.md</code>.</p>
<p><b>What is on this sheet.</b> The location axis is all seven presets at <code>month=january</code>
(7 rows). The season axis is two presets × three months (6 rows): January the peak month, October the
autumn shoulder, August the flat one. <code>privates</code> is the <b>synthetic-stage</b> site — it has
no measured bed, so its reef is authored rather than surveyed, and the app says so in its readout.
Camera is <code>cam=drone</code> throughout: a set is a property of the whole lineup, and the overhead
view is the one that shows the envelope arriving down the point.</p>
<p><b>What was left out.</b> 7 presets × 12 months × 5 clocks would be 420 frames. The sampled
7 + 6 = 13 rows cover the location axis completely at one month and the season axis at its two extremes
plus a shoulder, on the two sites with the most contrast in ξ (Sewers 1.15, Second Peak 0.65).
Not sampled: the other five presets across months; the nine unsampled months; any tide or Δf variation
(a month touches neither).</p>
<p><b>Why the crest number is swept, not sampled (2026-08-19).</b> A set sheet is about the <i>envelope</i>, and this
sheet's columns are one quarter of a set beat apart — 31–42 s — against a carrier wave of 12–15 s. Those two
periods have no relation, so a single-instant crest at one station lands on an arbitrary point of the passing
wave in every column. It looked exactly like a model defect: The Hook read
<code>1.04 / 3.63 / <b>3.13</b> / 1.25 / 0.98</code> m across the beat, a set apparently peaking a column early
and half over by the peak column. Sweeping that same station every 1 s across the beat found waves of
2.11–5.30 m with the biggest arriving at t = 184 s, <b>3.9 s (0.027 beat) before</b> the peak column's own clock —
the envelope was where it was designed to be and the instrument was reading between two waves. The headline
<code>crest<sub>±T/2</sub></code> is now the max over one carrier period centred on the column clock; the instant
is printed beside it because that is what the frame shows. Nothing in the model moved.
See <code>docs/research/MEASUREMENT_LESSONS.md</code> 12.</p>
<p><b>Why the lull is not flat.</b> <code>#env</code> floors the set envelope at 0.15 instead of exactly
zero — <code>env = (1−m) + m·cos(…)</code>, m = 0.425, so the peak is unchanged at 1.0 by construction and
only the trough rises. That floor is derived from the SC116 spectra two independent ways, not picked.
Columns 1 and 5 are the lull; if they read as dead flat water, that is the regression this sheet is for.</p>`,
};

function indexHTML(built) {
  const items = built.map(({ sheet, data }) => {
    let cells = 0, flats = 0, rows = 0;
    for (const g of data.groups) for (const r of g.rows) {
      rows++; for (const c of r.cells) { cells++; if (c.flat) flats++; }
    }
    return `<li style="margin:14px 0">
  <a href="${esc(sheet.file)}" style="font-size:16px;font-weight:600">${esc(sheet.title)}</a>
  <div class="lede" style="margin:2px 0 0">${esc((MODE === 'published' && sheet.pubBlurb) || sheet.blurb)}</div>
  <div class="nums" style="margin-top:4px"><span>${rows} rows</span><span>${cells} frames</span>
  <span>${flats ? `<span class="badge flat">${flats} flat</span>` : '<span class="badge">no flat cells</span>'}</span></div>
</li>`;
  }).join('\n');
  const prov = { ...(built[0]?.data?.provenance || PROVENANCE),
    linkBase: built[0]?.data?.linkBase || LINK_BASE };
  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>pointbreak QA sheets</title>
<style>${CSS}</style>
<div class="wrap">
<h1>pointbreak — QA contact sheets</h1>
<p class="lede">Deterministic frame grids for scanning. Every cell is labelled with the exact URL hash it was
captured at and links into the live app at that state; every clock spacing is derived from the model, not picked.</p>
${dirtyBannerHTML(prov)}
${provenanceHTML(prov, GENERATED.toISOString())}
${STANDING}
<ul style="list-style:none;padding:0">${items}</ul>
<div class="foot">
<p>Regenerate with <code>node scripts/build_qa_sheets.mjs</code>; the published set with
<code>node scripts/build_qa_sheets.mjs --mode=published --note='…'</code>.</p>
<p>${prov.mode === 'published'
    ? 'This is the <b>current</b> published set, not an archive: a new publish replaces it in place. '
      + 'What "current" means is the provenance block above — there is no other answer to it.'
    : 'Generated into <code>qa/</code>, which is git-ignored — the frames are regenerable and are '
      + 'not committed (see commit <code>b013197</code>, which removed 6.7 MB of unreferenced screenshots).'}</p>
</div>
</div>
`;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
let server = null;
function stopServer() {
  if (server && !server.killed) { try { server.kill('SIGTERM'); } catch { /* gone */ } server = null; }
}
process.on('exit', stopServer);
process.on('SIGINT', () => { stopServer(); process.exit(130); });

// --html-only re-renders the pages from the JSON already in <out>, no browser
// and no server. Same reason capture_temporal.mjs has --analyze-only: a
// presentation bug should not cost a re-capture.
if (flags['html-only']) {
  const wantedIds = flags.sheets ? flags.sheets.split(',') : null;
  const rebuilt = [];
  for (const sheet of SHEETS) {
    if (wantedIds && !wantedIds.some((w) => sheet.id.startsWith(w))) continue;
    const p = join(OUT, `${sheet.id}.json`);
    if (!existsSync(p)) { console.warn(`skip ${sheet.id}: no ${p}`); continue; }
    const data = JSON.parse(readFileSync(p, 'utf8'));
    writeFileSync(join(OUT, sheet.file), sheetHTML(sheet, data, data.linkBase || LINK_BASE, SHEET_NOTES[sheet.id] || ''));
    rebuilt.push({ sheet, data });
    console.log(`-> ${join(OUT, sheet.file)}`);
  }
  writeFileSync(join(OUT, 'index.html'), indexHTML(rebuilt));
  console.log(`done (html only) -> ${OUT}`);
  process.exit(0);
}

let base = flags.base;
if (!base) {
  server = spawn('python3', [join(ROOT, 'scripts/serve.py'), String(PORT)],
    { cwd: ROOT, stdio: 'ignore' });
  base = `http://localhost:${PORT}/`;
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`${base}web-three/index.html`); if (r.ok) break; } catch { /* not up */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  console.log(`serving ${ROOT} on ${base} (own server, killed on exit)`);
}
if (!base.endsWith('/')) base += '/';

console.log(`mode=${MODE}  out=${OUT}\n  commit ${COMMIT} (${COMMIT_FULL}) on ${BRANCH}`
  + `  tree ${DIRTY ? `DIRTY (${DIRTY_FILES.length})` : 'clean'}  app ${APP_DIGEST}`
  + `\n  cell links -> ${LINK_BASE}web-three/`);

const wanted = flags.sheets ? flags.sheets.split(',') : null;
const todo = SHEETS.filter((s) => !wanted || wanted.some((w) => s.id.startsWith(w)));
if (!todo.length) { console.error(`no sheet matches --sheets=${flags.sheets}`); stopServer(); process.exit(1); }

if (existsSync(IMG) && !flags.keep) rmSync(IMG, { recursive: true, force: true });
mkdirSync(IMG, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: VIEW, deviceScaleFactor: 1 });
// Separate blank page for the crop/marker/encode pass, so nothing that stage
// does can touch the state a cell was captured in — and so the marker is drawn
// outside the screenshot the pixel corridor reads. Needed in BOTH modes now:
// local frames are marked and cropped too, they are just not re-encoded lossily.
const encoder = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

const built = [];
try {
  for (const sheet of todo) {
    console.log(`\n== ${sheet.id} ==`);
    const captured = await captureSheet(page, base, sheet, encoder);
    const data = {
      // `generated`/`commit` kept as-is for anything already reading the JSON;
      // `provenance` is the full block, and is what the pages render from.
      generated: GENERATED.toISOString(), commit: COMMIT,
      provenance: { ...PROVENANCE, linkBase: LINK_BASE },
      base, linkBase: LINK_BASE, viewport: [VIEW.width, VIEW.height],
      common: COMMON, foamThresholds: [FOAM_HI, FOAM_LO],
      corridorM: CORRIDOR_M, corridorN: CORRIDOR_N,
      publishedFrames: MODE === 'published'
        ? { format: 'webp', width: PUB_W, height: PUB_H, quality: PUB_QUALITY,
          capturedAt: [VIEW.width, VIEW.height], measuredOn: 'the full-resolution PNG capture' }
        : null,
      ...captured,
    };
    writeFileSync(join(OUT, `${sheet.id}.json`), JSON.stringify(data, null, 2));
    writeFileSync(join(OUT, sheet.file), sheetHTML(sheet, data, LINK_BASE, SHEET_NOTES[sheet.id] || ''));
    built.push({ sheet, data });
    console.log(`-> ${join(OUT, sheet.file)}`);
  }
  writeFileSync(join(OUT, 'index.html'), indexHTML(built));
} finally {
  await browser.close();
  stopServer();
}

if (errors.length) {
  console.error('CONSOLE ERRORS:\n' + errors.join('\n'));
  process.exit(1);
}
console.log(`\ndone -> ${OUT}  (open file://${OUT}/index.html)`);
if (MODE === 'published') {
  const pages = readdirSync(OUT).filter((f) => /\.(html|json)$/.test(f))
    .reduce((n, f) => n + statSync(join(OUT, f)).size, 0);
  const frames = readdirSync(IMG).length;
  const total = pubBytes + pages;
  // The budget is a measured number, not an intention: the essay bundle this
  // ships beside is 9.9 MB, and QA has to sit under it rather than beside it.
  console.log(`published set: ${frames} frames, ${PUB_W}x${PUB_H} webp q${PUB_QUALITY}`
    + `\n  frames ${(pubBytes / 1048576).toFixed(2)} MB  (from ${(rawBytes / 1048576).toFixed(1)} MB of PNG`
    + `, ${(100 - (100 * pubBytes) / rawBytes).toFixed(1)}% smaller)`
    + `\n  pages+json ${(pages / 1048576).toFixed(2)} MB`
    + `\n  TOTAL ${(total / 1048576).toFixed(2)} MB against the 9.9 MB essay bundle`);
}
if (DIRTY) {
  console.warn(`\nNOTE: built from a DIRTY tree (${DIRTY_FILES.length} uncommitted path(s)). `
    + 'Every page says so in a banner. Commit first if this snapshot is going to be published.');
}
