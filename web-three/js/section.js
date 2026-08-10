// Live shore-normal cross-section: the bed-shape -> wave causal chain, drawn.
//
// This is the analysis view, not scenery. Along one shore-normal transect it
// plots the four terms the model actually evaluates, on one depth axis:
//
//   bed(z)        the NCEI seabed
//   still water   MSL + tide
//   H0*Ks(z)      Green's-law shoaled height, if the wave never broke
//   gamma*h(z)    the most height this depth can carry (McCowan)
//
// Breaking is where those last two cross. Move the tide, change the swell, or
// switch spots and the crossing point slides along the profile — which is the
// whole claim "bed shape drives the wave", made falsifiable instead of asserted.
//
// Deliberately a 2D canvas overlay rather than 3D geometry: a profile read
// against a depth axis is a chart, and charts belong in chart space.

import { bedElevBlended, MSL_ABOVE_NAVD88, planeResidualRms, TIDE_RANGE, tideLabel } from './bed.js';

const GAMMA = 0.78;        // must match model-glsl.js
const G = 9.81;
const Z0 = -260, Z1 = 180; // transect span in stage metres (seaward -> inland)
const N = 220;

// muriel dark tokens, shared with docs/figures
const INK = '#e6e4d2', BG = 'rgba(15,18,22,0.93)';
const TEAL = '#4a8f85', SAND = '#c9a86a', FOAM = '#eef2f3', SLATE = '#8fa3ad';

// opts.onTide(metres) fires while the still-water line is dragged. The tide is
// the only continuous control the chart owns, and the water line is where a
// reader already looks for it — keys still work, but nobody guesses [ and ].
export function makeSection(container, opts = {}) {
  const onTide = opts.onTide || (() => {});
  const wrap = document.createElement('div');
  wrap.className = 'section-panel';
  const cv = document.createElement('canvas');
  wrap.appendChild(cv);
  container.appendChild(wrap);
  const ctx = cv.getContext('2d');
  let W = 0, H = 0;
  let view = null;          // last draw's vertical scale + water-line position
  let hot = false;          // pointer is on the handle, or dragging it
  let drag = null;          // { y0, tide0, mPerPx } frozen at pointerdown

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wrap.clientWidth; H = wrap.clientHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  new ResizeObserver(resize).observe(wrap);
  resize();

  // ---- tide drag ----
  // Grab band is generous (14 px) because the line is 1 px and this is the
  // only handle on the chart. Pointer events cover mouse and touch; the CSS
  // sets touch-action: none so a vertical drag doesn't scroll the page.
  const GRAB_PX = 14;
  const near = (e) => view && Math.abs(e.offsetY - view.waterY) <= GRAB_PX
                   && e.offsetX >= view.left && e.offsetX <= view.right;

  cv.addEventListener('pointermove', (e) => {
    if (drag) {
      // metres per pixel frozen at grab time: the axis rescales as the tide
      // moves, so live values would make the drag chase itself
      const t = Math.min(Math.max(drag.tide0 - (e.clientY - drag.y0) * drag.mPerPx, TIDE_RANGE[0]), TIDE_RANGE[1]);
      onTide(Math.round(t * 100) / 100);
      return;
    }
    const h = near(e);
    if (h !== hot) { hot = h; cv.style.cursor = h ? 'ns-resize' : 'default'; }
  });

  cv.addEventListener('pointerdown', (e) => {
    if (!near(e)) return;
    drag = { y0: e.clientY, tide0: view.tide, mPerPx: view.mPerPx };
    hot = true;
    cv.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  const endDrag = (e) => {
    if (!drag) return;
    drag = null;
    try { cv.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    hot = near(e);
    cv.style.cursor = hot ? 'ns-resize' : 'default';
  };
  cv.addEventListener('pointerup', endDrag);
  cv.addEventListener('pointercancel', endDrag);
  cv.addEventListener('pointerleave', () => { if (!drag) { hot = false; cv.style.cursor = 'default'; } });

  // Green's law, identical to the GLSL: Ks = sqrt(cg0/cg), shallow cg = sqrt(gh)
  function shoaled(H0, T, depth) {
    const cg0 = G * T / (4 * Math.PI);
    const Ks = Math.min(Math.max(Math.sqrt(cg0 / Math.sqrt(G * Math.max(depth, 0.35))), 0.7), 2.6);
    return H0 * Ks;
  }

  function draw(state, xStation = 0, tide = 0, bedShape = 0) {
    if (!W || !H) return;
    ctx.clearRect(0, 0, W, H);
    const spot = state.geoSpot;
    const pad = { l: 46, r: 12, t: 16, b: 26 };
    const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;

    if (!spot) {
      ctx.fillStyle = SLATE;
      ctx.font = '13px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('no bathymetry for this preset — synthetic stage', pad.l, H / 2);
      return;
    }

    const wl = MSL_ABOVE_NAVD88 + tide;
    const samples = [];
    let yMin = -2, yMax = 2;
    for (let i = 0; i <= N; i++) {
      const z = Z0 + (Z1 - Z0) * (i / N);
      const bed = bedElevBlended(spot, xStation, z, bedShape) - wl;  // m rel. water
      const depth = Math.max(-bed, 0);
      const Hsh = shoaled(state.H0, state.T, Math.max(depth, 0.35));
      const Hlim = GAMMA * Math.max(depth, 0.35);
      samples.push({ z, bed, depth, Hsh, Hlim });
      yMin = Math.min(yMin, bed - 0.5);
      yMax = Math.max(yMax, Math.min(Hsh, 6), bed + 1);
    }
    // Clamp the axis to the water action. The cliff runs to about +11 m, and
    // letting it set yMax squeezed everything that matters — including the
    // tide's own 3 m range — into a sliver, which made the water line twitchy
    // to drag (24 px covered the whole range). The cliff simply clips.
    yMax = Math.min(yMax, 6);
    yMin = Math.max(yMin, -10);

    const sx = (z) => pad.l + ((z - Z0) / (Z1 - Z0)) * pw;
    const sy = (v) => pad.t + ph - ((v - yMin) / (yMax - yMin)) * ph;
    // captured for the drag handler: metres per pixel is recomputed every draw
    // (yMin/yMax float with the tide), so a drag freezes the value it started
    // with rather than chasing its own feedback.
    view = { mPerPx: (yMax - yMin) / ph, waterY: sy(0), tide, left: pad.l, right: W - pad.r };

    // depth axis
    ctx.strokeStyle = 'rgba(143,163,173,0.25)';
    ctx.fillStyle = SLATE;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.lineWidth = 1;
    for (let v = Math.ceil(yMin / 2) * 2; v <= yMax; v += 2) {
      ctx.beginPath(); ctx.moveTo(pad.l, sy(v)); ctx.lineTo(W - pad.r, sy(v)); ctx.stroke();
      ctx.fillText(`${v > 0 ? '+' : ''}${v}`, 6, sy(v) + 4);
    }

    ctx.save();
    ctx.beginPath(); ctx.rect(pad.l, pad.t, pw, ph); ctx.clip();

    // water body
    ctx.fillStyle = 'rgba(74,143,133,0.20)';
    ctx.beginPath();
    ctx.moveTo(sx(Z0), sy(0));
    for (const s of samples) ctx.lineTo(sx(s.z), sy(Math.min(s.bed, 0)));
    ctx.lineTo(sx(Z1), sy(0));
    ctx.closePath(); ctx.fill();

    // seabed
    ctx.beginPath();
    samples.forEach((s, i) => i ? ctx.lineTo(sx(s.z), sy(s.bed)) : ctx.moveTo(sx(s.z), sy(s.bed)));
    ctx.lineTo(sx(Z1), sy(yMin)); ctx.lineTo(sx(Z0), sy(yMin)); ctx.closePath();
    ctx.fillStyle = 'rgba(201,168,106,0.22)'; ctx.fill();
    ctx.beginPath();
    samples.forEach((s, i) => i ? ctx.lineTo(sx(s.z), sy(s.bed)) : ctx.moveTo(sx(s.z), sy(s.bed)));
    ctx.strokeStyle = SAND; ctx.lineWidth = 2; ctx.stroke();

    // still water line — also the tide handle
    const wy = sy(0);
    ctx.beginPath(); ctx.moveTo(sx(Z0), wy); ctx.lineTo(sx(Z1), wy);
    ctx.strokeStyle = FOAM; ctx.setLineDash([4, 4]);
    ctx.lineWidth = hot ? 2 : 1; ctx.stroke();
    ctx.setLineDash([]);
    // grip on the seaward end, brightened while hovered or dragged
    const gx = pad.l + 16;
    ctx.fillStyle = hot ? FOAM : 'rgba(238,242,243,0.55)';
    ctx.beginPath(); ctx.roundRect(gx - 13, wy - 5, 26, 10, 5); ctx.fill();
    ctx.strokeStyle = BG; ctx.lineWidth = 1;
    for (const o of [-3, 0, 3]) {
      ctx.beginPath(); ctx.moveTo(gx - 6, wy + o); ctx.lineTo(gx + 6, wy + o); ctx.stroke();
    }
    if (hot) {
      ctx.fillStyle = INK;
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText('drag to change tide', gx + 20, wy - 8);
    }

    // the two competing curves, clipped to water
    const wet = samples.filter((s) => s.depth > 0.05);
    const line = (key, color, dash) => {
      ctx.beginPath();
      wet.forEach((s, i) => {
        const y = sy(Math.min(s[key], yMax));
        i ? ctx.lineTo(sx(s.z), y) : ctx.moveTo(sx(s.z), y);
      });
      ctx.strokeStyle = color; ctx.lineWidth = 2;
      ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
    };
    line('Hlim', SLATE, [5, 3]);   // gamma*h — the ceiling
    line('Hsh', TEAL, []);         // H0*Ks   — the shoaling wave

    ctx.restore();

    // breaking point: seaward-most crossing of Hsh over gamma*h
    let brk = null;
    for (let i = 1; i < wet.length; i++) {
      const a = wet[i - 1], b = wet[i];
      if (a.Hsh <= a.Hlim && b.Hsh > b.Hlim) { brk = b; break; }
    }
    if (brk) {
      const bx = sx(brk.z);
      ctx.beginPath(); ctx.moveTo(bx, pad.t); ctx.lineTo(bx, pad.t + ph);
      ctx.strokeStyle = FOAM; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(bx, sy(brk.Hsh), 4, 0, Math.PI * 2);
      ctx.fillStyle = FOAM; ctx.fill();
      ctx.fillStyle = INK;
      ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      const label = `breaks · ${brk.depth.toFixed(1)} m deep`;
      const tw = ctx.measureText(label).width;
      ctx.fillText(label, Math.min(bx + 7, W - pad.r - tw), pad.t + 12);
    }

    // legend + station
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    const key = [[TEAL, 'H₀·Ks shoaled'], [SLATE, 'γh depth limit'], [SAND, 'seabed']];
    let lx = pad.l;
    for (const [c, label] of key) {
      ctx.fillStyle = c; ctx.fillRect(lx, H - 14, 10, 2.5);
      ctx.fillStyle = INK; ctx.fillText(label, lx + 14, H - 10);
      lx += ctx.measureText(label).width + 30;
    }
    ctx.fillStyle = SLATE;
    ctx.textAlign = 'right';
    // top-right: the legend owns the bottom strip, and at narrow widths the
    // two collided
    const bedLabel = bedShape
      ? `PLANE (reef removed, ${planeResidualRms(spot).toFixed(1)} m rms)`
      : 'measured bed';
    ctx.fillText(`${bedLabel} · x=${xStation} m · tide ${tide >= 0 ? '+' : ''}${tide.toFixed(2)} m ${tideLabel(tide)} · seaward ←`,
                 W - pad.r, 11);
    ctx.textAlign = 'left';
  }

  return { draw, el: wrap };
}
