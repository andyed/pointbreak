// "Today's Ocean" — live nearshore conditions at Pleasure Point from CDIP's MOP
// model, transect SC116 (~150 m off the break, hourly nowcast). Endpoint grammar
// and gotchas documented in docs/research/CDIP_LIVE_DATA.md:
//   - read the time-dimension length N from .dds FIRST; newest record is N-1
//   - thredds.cdip.ucsd.edu sends open CORS headers (verified 2026-08-09)
//   - ~15 s abort + localStorage stale-while-error (server occasionally stalls)

const BASE = 'https://thredds.cdip.ucsd.edu/thredds/dodsC/cdip/model/MOP_alongshore/SC116_nowcast.nc';
const CACHE_KEY = 'pointbreak.sc116';
const TIMEOUT_MS = 15000;

async function fetchText(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

// .ascii responses look like:  name[1]\n  v1, v2, ...\n  (blank-line separated)
function parseAsciiVar(text, name) {
  const re = new RegExp(name + '(?:\\.' + name + ')?\\[[^\\]]*\\]\\s*\\n([^\\n]+)');
  const m = text.match(re);
  if (!m) return null;
  const v = parseFloat(m[1].split(',')[0]);
  return Number.isFinite(v) ? v : null;
}

export async function fetchTodaysOcean() {
  // 1) time-dimension length from the structure
  const dds = await fetchText(BASE + '.dds');
  const dim = dds.match(/waveTime\s*=\s*(\d+)/);
  if (!dim) throw new Error('no waveTime dim in .dds');
  const n = parseInt(dim[1], 10) - 1;
  if (!(n >= 0)) throw new Error('empty time dim');

  // 2) newest bulk record
  const idx = `[${n}:1:${n}]`;
  const txt = await fetchText(
    `${BASE}.ascii?waveTime${idx},waveHs${idx},waveTp${idx},waveDp${idx}`);
  const out = {
    time: parseAsciiVar(txt, 'waveTime'),
    hs: parseAsciiVar(txt, 'waveHs'),
    tp: parseAsciiVar(txt, 'waveTp'),
    dp: parseAsciiVar(txt, 'waveDp'),
    fetched: Date.now(),
    stale: false,
  };
  if (out.hs == null || out.tp == null) throw new Error('parse failed');
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(out)); } catch (_) { /* private mode */ }
  return out;
}

export function cachedOcean() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return { ...JSON.parse(raw), stale: true };
  } catch (_) { return null; }
}

// Map buoy/model reality into model-card parameters. Direction is OBSERVED,
// CARRIED, and NOT YET APPLIED — see Track 3 in TODO.md and the "Direction in
// the code" section of docs/research/EXTERNAL_VALIDITY_AUDIT_2026-08-11.md.
// (The older claim here — that peel geometry is a property of the shelf, not
// the swell — is now qualified: the reef owns spot identity, but a ~15–30°
// seasonally and period-structured incident band modulates the peel. Wiring it
// is gated on the reef owning the break line, Track 1.)
export function applyOcean(state, o) {
  state.H0 = Math.min(3.0, Math.max(0.4, o.hs));
  state.T = Math.min(18, Math.max(8, o.tp));
  // INERT field: nothing reads this yet. It exists so the observation survives
  // to the point where Track 3c can wire it, instead of being dropped here
  // while describeOcean() prints "from N°" in the HUD. Do not make it drive
  // rendering without the MODEL.md alpha split (Track 3a).
  state.swellDpObserved = (o.dp != null && Number.isFinite(o.dp)) ? o.dp : null;
  state.preset = null; // live conditions, not a named preset
}

export function describeOcean(o) {
  const when = o.time ? new Date(o.time * 1000) : new Date(o.fetched);
  const hh = String(when.getHours()).padStart(2, '0');
  const mm = String(when.getMinutes()).padStart(2, '0');
  const dir = o.dp != null ? ` from ${Math.round(o.dp)}°` : '';
  return `${o.hs.toFixed(2)} m @ ${o.tp.toFixed(1)} s${dir} · SC116 ${hh}:${mm}${o.stale ? ' (cached)' : ''}`;
}
