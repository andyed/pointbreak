// Per-spot reef knobs served to bed.js through a `node:module` load hook.
//
// Extracted verbatim from scripts/measure_peel_band_field.mjs (2026-09-24) so
// the scorecard (scripts/score_reef_fit.mjs) and the field instrument share
// ONE patch set and ONE hook. Nothing shipped is edited: the knob arms
// parameterise three constants of bed.js in memory, per spot:
//   crest   metres added to the wedge crest depth — the table row's on the
//           shipped arm since 2026-09-24, clamp(0.75*h_b, 1.2, 3.0) on
//           #reef=legacy (positive = deeper); same patch site as
//           measure_reef_activation_sensitivity.mjs, keyed by spot
//   beta    the wedge strike angle off shore-parallel, overriding the fitted
//           value AFTER the fit loop (the reef function is rebuilt at that
//           angle through the fit's own evaluate(), so its derived line
//           bearing against the card is carried too)
//   ceil    HYPOTHETICAL: metres added to the arm's crest cap (since the
//           2026-09-24 refit REEF_CREST_CEIL_EL = MLLW + 0.1 m on the shipped
//           table arm; the old -0.5 m NAVD88 cap on #reef=legacy) at the
//           crest target and the post clamp (the dry-post gate stays, so
//           land is never touched). The shipped invariant (reef-audit.test.js
//           aboveCeil = 0) forbids it; it exists to show what the observed
//           peel would need when the ceiling is what binds, and every such
//           arm must be audited with bed.reefAudit and labelled outside.
//
// Two ways to reach a knob bed:
//   bedFor(knobs)             a SEPARATE module instance at bed.js?band=<json>
//                             (the field instrument's arms; the shipped import
//                             at the plain URL is untouched)
//   registerReefKnobs(knobs)  the PLAIN bed.js URL is served patched, so every
//                             instrument that imports bed.js by its ordinary
//                             specifier (measure_break_activation.mjs,
//                             measure_physics_residuals.mjs,
//                             measure_reef_fit_signed.mjs, ...) scores the knob
//                             bake through the hooks it already uses. Must be
//                             called BEFORE the first import that reaches
//                             bed.js — the same rule as bed-source.mjs. With
//                             no finite knob the shipped source is served
//                             byte for byte (no patch is applied at all).
// At zero knobs the patched module reproduces the shipped bed.js import
// bit-for-bit (measure_peel_band_field.mjs gate(); PEEL_BAND_FIELD §4).
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const BED_URL = new URL('../../web-three/js/bed.js', import.meta.url).href;
export const THREE_URL = new URL('../../web-three/vendor/three.module.js', import.meta.url).href;
const BED_SRC = readFileSync(fileURLToPath(BED_URL), 'utf8');

// ---------- the patches ----------
// Each `find` must occur exactly once in bed.js; a drift there fails here
// rather than silently sweeping a constant that moved.
export const PATCHES = [
  // Since 2026-09-24 (the refit) bed.js resolves the crest depth and the crest
  // cap per arm on one line each (the table row on the shipped arm, the
  // legacy rule on #reef=legacy), so the crest and ceiling knobs reach both.
  { name: 'crest depth (per spot)',
    find: 'const crestDepth = row ? row.crestDepthM : Math.min(Math.max(0.75 * hb, 1.2), 3.0);',
    replace: 'const crestDepth = (row ? row.crestDepthM : Math.min(Math.max(0.75 * hb, 1.2), 3.0)) + __bandCrest(name);' },
  { name: 'crest target ceiling (per spot, hypothetical)',
    find: 'const targetEl = Math.min(MSL_ABOVE_NAVD88 - crestDepth, crestCeil - crestMargin);',
    replace: 'const targetEl = Math.min(MSL_ABOVE_NAVD88 - crestDepth, crestCeil + __bandCeil(name) - crestMargin);' },
  { name: 'post ceiling (per spot, hypothetical)',
    find: 'return Math.max(Math.min(em + lift, ceilEl) - em, 0);',
    replace: 'return Math.max(Math.min(em + lift, ceilEl + __bandCeil(__reefSpotName)) - em, 0);' },
  { name: 'reef fn spot name (for the post ceiling)',
    find: 'function makeReefFn(betaDeg, targetEl, zRef, seed, reefWin, ceilEl) {',
    replace: 'function makeReefFn(betaDeg, targetEl, zRef, seed, reefWin, ceilEl, __reefSpotName = null) {' },
  { name: 'reef fn call site',
    find: 'const fn = makeReefFn(b, targetEl, zRef, seed, reefWin, crestCeil);',
    replace: 'const fn = makeReefFn(b, targetEl, zRef, seed, reefWin, crestCeil, name);' },
  { name: 'beta override (per spot)',
    find: '  const fit = {\n    spot: name, synthetic: true,',
    replace: '  if (Number.isFinite(__bandBeta(name))) { beta = __bandBeta(name); const __r = evaluate(beta); derived = __r.derived; reefFn = __r.reefFn; signViolations = __r.viol; }\n'
           + '  const fit = {\n    spot: name, synthetic: true,' },
];
export function countOccurrences(src, needle) {
  let n = 0, i = 0;
  while ((i = src.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}
// knobs = { crest: { [spotName]: metres }, beta: { [spotName]: degrees }, ceil: { [spotName]: metres } }
export function patchBedSource(src, knobs) {
  const k = { crest: {}, beta: {}, ceil: {}, ...knobs };
  let out = src;
  for (const p of PATCHES) {
    const n = countOccurrences(out, p.find);
    if (n !== 1) throw new Error(`patch "${p.name}": expected exactly one match in bed.js, found ${n}`);
    out = out.replace(p.find, p.replace);
  }
  const prelude = `const __BAND = ${JSON.stringify(k)};\n`
    + `function __bandCrest(name) { const v = __BAND.crest[name]; return Number.isFinite(v) ? v : 0; }\n`
    + `function __bandBeta(name) { const v = __BAND.beta[name]; return Number.isFinite(v) ? v : NaN; }\n`
    + `function __bandCeil(name) { const v = __BAND.ceil[name]; return Number.isFinite(v) ? v : 0; }\n`;
  return prelude + out;
}

// The three knob maps, always present, unknown keys dropped.
export function normalizeKnobs(knobs = {}) {
  return { crest: knobs.crest || {}, beta: knobs.beta || {}, ceil: knobs.ceil || {} };
}
// True when at least one spot has a finite value on some knob.
export function hasKnobs(knobs) {
  const k = normalizeKnobs(knobs);
  return ['crest', 'beta', 'ceil'].some((n) => Object.values(k[n]).some(Number.isFinite));
}

// ---------- the plain-URL arm ----------
let ACTIVE = null;       // knobs served at the plain bed.js URL, or null
let plainLoaded = false; // set once bed.js has been served at its plain URL
export function registerReefKnobs(knobs) {
  const k = normalizeKnobs(knobs);
  if (!hasKnobs(k)) { ACTIVE = null; return null; }
  if (plainLoaded) throw new Error('registerReefKnobs: bed.js was already imported at its plain URL; register before the first import that reaches bed.js');
  ACTIVE = k;
  return k;
}
export function activeReefKnobs() { return ACTIVE; }

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') return { url: THREE_URL, shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith(BED_URL + '?band=')) {
      const knobs = JSON.parse(decodeURIComponent(url.slice(BED_URL.length + '?band='.length)));
      return { format: 'module', source: patchBedSource(BED_SRC, knobs), shortCircuit: true };
    }
    if (url === BED_URL) {
      plainLoaded = true;
      if (ACTIVE) {
        // Through nextLoad, not from disk: a hook registered after this one
        // (measure_reef_fit_signed.mjs appends its instrument export) still
        // sees the patched text, and the bed-source resolve hook still owns
        // which data modules bed.js reads.
        const r = nextLoad(url, context);
        const src = typeof r.source === 'string' ? r.source : Buffer.from(r.source).toString('utf8');
        return { ...r, source: patchBedSource(src, ACTIVE) };
      }
    }
    return nextLoad(url, context);
  },
});

// A separate bed.js instance carrying these knobs (cached per knob set).
const instances = new Map();
export async function bedFor(knobs = {}) {
  const k = normalizeKnobs(knobs);
  const key = JSON.stringify(k);
  if (instances.has(key)) return instances.get(key);
  const mod = await import(`${BED_URL}?band=${encodeURIComponent(key)}`);
  instances.set(key, mod);
  return mod;
}
