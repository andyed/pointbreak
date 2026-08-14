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
