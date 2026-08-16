// Public permalink contract for web-three. The app intentionally reads the
// fragment only: static hosting never needs to receive or round-trip state.
export function readHashParams(hash = globalThis.location?.hash || '') {
  return new URLSearchParams(String(hash).replace(/^#/, ''));
}

// `controls` is the product-facing name. `hud` remains a compatibility alias
// for older captures and embeds. An explicit modern value wins over legacy
// state, and either explicit surface overrides Tour's clean-screen default.
export function shouldShowControls(params, { tour = false } = {}) {
  const controls = params.get('controls');
  if (controls === '1') return true;
  if (controls === '0') return false;
  if (params.has('hud')) return params.get('hud') !== '0';
  return !tour;
}

export function parseSpeedParam(value, fallback = 1) {
  if (value === null || value === '') return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 0), 4);
}

// ---------------------------------------------------------------------------
// Writing the permalink back
// ---------------------------------------------------------------------------
// Only ROUND-TRIP params are written. The hash carries three kinds of thing
// (CONTROLS.md): controls a reader changes through the UI, and instrument /
// A-B-revert / feature flags that are typed into a URL deliberately. Writing
// the second kind back would bury a shared link in flags the sharer never
// chose, and re-applying them live would mean re-baking the reef on every
// keystroke. So the writer covers controls only, and everything else stays
// boot-only and out of the emitted hash.
//
// Order is fixed and matches CONTROLS.md's table rather than insertion order,
// so the same view always serialises to the same string — otherwise two people
// on the same screen produce different links and neither can tell why.
export const ROUND_TRIP_PARAMS = [
  'preset', 'cam', 'day', 'month', 'h0', 'tide', 'bed',
  'surfer', 'section', 'audio', 'speed', 'controls',
];

// Values equal to these are omitted: a default-state view must serialise to a
// bare URL, or every link a reader copies carries noise they did not set.
// The URL records what the reader CHOSE, not what they were handed. Trade-off
// taken knowingly: if a shipped default ever changes, an old link that omitted
// it changes meaning too. That is the cost of short, honest links, and it is
// why anything an author pins deliberately (a capture, an essay embed) should
// keep writing the value explicitly rather than relying on the default.
const OMIT_WHEN = {
  surfer: '0', section: '0', audio: '0', speed: '1', bed: 'reef',
  preset: 'secondpeak', cam: 'free',
};

// `snapshot` is a plain {param: value} bag; null/undefined/'' means "not set".
// Returns the fragment WITHOUT a leading '#', empty string for a default view.
export function writeHashParams(snapshot = {}) {
  const out = new URLSearchParams();
  for (const key of ROUND_TRIP_PARAMS) {
    const raw = snapshot[key];
    // Not `!raw`: speed=0 and h0=0 are real values that must survive. Only
    // genuinely absent things are skipped.
    if (raw === null || raw === undefined || raw === '') continue;
    const v = String(raw);
    if (OMIT_WHEN[key] === v) continue;
    out.set(key, v);
  }
  return out.toString();
}

// The boot-only params of a fragment, normalised to a stable comparable string.
// Unknown keys are treated as boot-only: an unrecognised param is more likely a
// flag this function has not been taught about than something safe to ignore.
export function bootOnlyParams(hash = '') {
  const p = readHashParams(hash);
  const kept = [...p.entries()]
    .filter(([k]) => !ROUND_TRIP_PARAMS.includes(k) && k !== 'hud')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return kept.map(([k, v]) => `${k}=${v}`).join('&');
}

// Whether a hash edit needs a full reload rather than a live re-apply.
//
// It compares the two fragments rather than inspecting only the new one. The
// asymmetry matters and cost a bug: editing #month=july&m4=0 down to
// #month=august applies live, but m4Enabled was set at BOOT and applyLiveParams
// never touches it — so the app keeps m4=0 while the URL claims the default.
// Removing a boot-only flag has to reload for the same reason adding one does.
export function needsReloadForHash(nextHash = '', prevHash = '') {
  return bootOnlyParams(nextHash) !== bootOnlyParams(prevHash);
}

// Renderer-only visual-fidelity probe. The default stays the shipped image;
// named values make matched captures reviewable without numeric flag lore.
export function parseFidelityLook(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'foam') return 1;
  if (key === 'full') return 2;
  return 0;
}
