// Control panel. Plain DOM, no framework. All readable text >= 8:1 contrast
// against the panel background (verified in css/style.css comments).

import { PARAM_DEFS, PRESETS, applyPreset } from './params.js';
import { fetchTodaysOcean, cachedOcean, applyOcean, describeOcean } from './cdip.js';

export function buildUI(state, onChange) {
  const panel = document.getElementById('panel');
  const sliders = {};

  // --- presets ---
  const presetRow = document.createElement('div');
  presetRow.className = 'presets';
  const presetBtns = {};
  Object.entries(PRESETS).forEach(([key, p], i) => {
    const b = document.createElement('button');
    b.textContent = `${i + 1} ${p.label}`;
    b.title = `Preset: ${p.label}`;
    b.addEventListener('click', () => selectPreset(key));
    presetBtns[key] = b;
    presetRow.appendChild(b);
  });
  panel.appendChild(presetRow);

  function selectPreset(key) {
    applyPreset(state, key);
    refresh();
    onChange();
  }

  // --- view toggle ---
  const viewRow = document.createElement('div');
  viewRow.className = 'viewrow';
  const viewBtns = [];
  ['Drone', 'Cliff'].forEach((name, i) => {
    const b = document.createElement('button');
    b.textContent = name;
    b.addEventListener('click', () => { state.view = i; refresh(); onChange(); });
    viewBtns.push(b);
    viewRow.appendChild(b);
  });
  const surferBtn = document.createElement('button');
  surferBtn.textContent = 'Surfer';
  surferBtn.title = 'Toggle the rider (S)';
  surferBtn.addEventListener('click', () => { state.surfer = 1 - state.surfer; refresh(); onChange(); });
  viewRow.appendChild(surferBtn);
  panel.appendChild(viewRow);

  // --- sliders ---
  const grid = document.createElement('div');
  grid.className = 'sliders';
  for (const def of PARAM_DEFS) {
    const label = document.createElement('label');
    label.textContent = def.label;
    const val = document.createElement('span');
    val.className = 'val';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = def.min; input.max = def.max; input.step = def.step;
    input.addEventListener('input', () => {
      state[def.key] = parseFloat(input.value);
      if (def.key !== 'speed') state.preset = null;
      val.textContent = fmt(state[def.key], def);
      markPreset();
      onChange();
    });
    sliders[def.key] = { input, val, def };
    grid.appendChild(label); grid.appendChild(input); grid.appendChild(val);
  }
  panel.appendChild(grid);

  // --- today's ocean ---
  const live = document.createElement('div');
  live.className = 'live';
  const liveBtn = document.createElement('button');
  liveBtn.textContent = "Today's Ocean";
  liveBtn.title = 'Fetch live conditions at Pleasure Point (CDIP MOP SC116)';
  const liveStatus = document.createElement('span');
  liveStatus.className = 'livestatus';
  liveStatus.textContent = '—';
  liveBtn.addEventListener('click', async () => {
    liveStatus.textContent = 'fetching…';
    try {
      const o = await fetchTodaysOcean();
      applyOcean(state, o);
      liveStatus.textContent = describeOcean(o);
    } catch (err) {
      const c = cachedOcean();
      if (c) {
        applyOcean(state, c);
        liveStatus.textContent = describeOcean(c);
      } else {
        liveStatus.textContent = 'unavailable (offline?)';
      }
    }
    refresh();
    onChange();
  });
  live.appendChild(liveBtn); live.appendChild(liveStatus);
  panel.appendChild(live);

  function fmt(v, def) {
    const digits = def.step < 0.01 ? 3 : def.step < 1 ? 2 : 0;
    return v.toFixed(digits) + def.unit;
  }

  function markPreset() {
    for (const [key, b] of Object.entries(presetBtns)) b.classList.toggle('on', state.preset === key);
    viewBtns.forEach((b, i) => b.classList.toggle('on', state.view === i));
    surferBtn.classList.toggle('on', state.surfer === 1);
  }

  function refresh() {
    for (const { input, val, def } of Object.values(sliders)) {
      input.value = state[def.key];
      val.textContent = fmt(state[def.key], def);
    }
    markPreset();
  }
  refresh();

  // --- keyboard ---
  const presetKeys = Object.keys(PRESETS);
  window.addEventListener('keydown', (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const n = parseInt(e.key, 10);
    if (n >= 1 && n <= presetKeys.length) { selectPreset(presetKeys[n - 1]); return; }
    if (e.key === 'v' || e.key === 'V') { state.view = 1 - state.view; refresh(); onChange(); }
    if (e.key === 's' || e.key === 'S') { state.surfer = 1 - state.surfer; refresh(); onChange(); }
    if (e.key === ' ') { state.paused = !state.paused; e.preventDefault(); }
    if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('hidepanel');
  });

  return { refresh };
}
