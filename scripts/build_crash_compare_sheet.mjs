// Side-by-side contact sheet for two measure_crash_transport.mjs runs.
//
// The transport rig writes one run per directory (frames + measure.json). A
// before/after judgment needs the SAME tracked clocks from both runs in one
// row, with the numbers under them — this lays them out. It reads only what
// the runs wrote; nothing is re-rendered here.
//
//   node scripts/build_crash_compare_sheet.mjs --a=qa/crash-transport/landed \
//        --b=qa/crash-transport/legible --out=qa/crash-transport/compare.html
//
// Row order per cell: A after, B after, B alone (splash=0), then the fixed
// legibility window from A and B, then the numbers. A and B are matched by cell
// id (preset-cam) and clock index; a cell missing from one run is listed, not
// silently dropped.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, relative, join } from 'node:path';

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith('--')).map((a) => {
  const s = a.replace(/^--/, ''); const eq = s.indexOf('=');
  return eq < 0 ? [s, 'true'] : [s.slice(0, eq), s.slice(eq + 1)];
}));
if (!flags.a || !flags.b) { console.error('usage: --a=<runDir> --b=<runDir> [--out=<html>]'); process.exit(2); }
const A = resolve(flags.a), B = resolve(flags.b);
const OUT = resolve(flags.out || join(dirname(A), 'compare.html'));
const load = (d) => JSON.parse(readFileSync(join(d, 'measure.json'), 'utf8'));
const ma = load(A), mb = load(B);
const rel = (d, p) => relative(dirname(OUT), join(d, p)).split('\\').join('/');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const pct = (v, p = 2) => (Number.isFinite(v) ? (100 * v).toFixed(p) + '%' : '—');
const num = (v) => (v === null || v === undefined ? '—' : v);

const ids = [...new Set([...Object.keys(ma.cells), ...Object.keys(mb.cells)])];
const sections = [];
const summary = [];
for (const id of ids) {
  const ca = ma.cells[id], cb = mb.cells[id];
  if (!ca || !cb || !ca.frames?.length || !cb.frames?.length) {
    sections.push(`<section><h2>${esc(id)}</h2><p class="note">present in ${ca ? 'A' : ''}${ca && cb ? ' and ' : ''}${cb ? 'B' : ''} only, or no event framed — not compared.</p></section>`);
    continue;
  }
  const n = Math.min(ca.frames.length, cb.frames.length);
  const head = cb.frames.slice(0, n).map((f) => `<th>${esc(f.id)}<br><small>t ${f.t} s · τ ${f.tau > 0 ? '+' : ''}${f.tau} s</small></th>`).join('');
  const imgRow = (label, dir, cell, key, cls = '') => `<tr><th>${label}</th>${cell.frames.slice(0, n).map((f) => (f[key]
    ? `<td><a href="${rel(dir, id + '/' + f[key])}"><img class="${cls}" src="${rel(dir, id + '/' + f[key])}" loading="lazy"></a></td>` : '<td></td>')).join('')}</tr>`;
  const numRow = (label, cell) => `<tr><th>${label}</th>${cell.clocks.slice(0, n).map((c) => `<td class="num">on/off ${pct(c.frac, 3)} of frame${c.win
    ? `<br>mask ${pct(c.win.maskFrac, 1)} of window<br>luma in ${num(c.win.lumaIn)} · foam ${num(c.win.lumaFoam)}<br>contrast vs foam <b>${num(c.win.contrastFoam)}</b> · vs all ${num(c.win.contrastAll)}<br>texture ratio vs foam <b>${num(c.win.texRatioFoam)}</b> · vs all ${num(c.win.texRatioAll)}` : ''}</td>`).join('')}</tr>`;
  const ga = ca.gates || {}, gb = cb.gates || {};
  const gateLine = (g) => `pre-break absent <b>${g.absentPreBreak}</b> · begins at landing <b>${g.beginsAtLanding}</b> (${g.originAheadOfBendM} m ahead of bend, 0.9·ceil ${g.expectedReachM}) · monotonic <b>${g.monotonic}</b> · rate ${g.rateMean} m/s (spread ${g.rateSpread}) → scales <b>${g.scalesWithTime}</b> · decays <b>${g.decays}</b> · zero at end <b>${g.zeroAtEnd}</b> · no teleport <b>${g.noTeleport}</b> · peak coverage ${pct(g.coverageMaxFrac, 3)}`;
  const la = ga.legibility?.liveMean || {}, lb = gb.legibility?.liveMean || {};
  const winNote = (c) => (c.window ? `window ${c.window.w}×${c.window.h} @ (${c.window.x0}, ${c.window.y0})` : 'no window');
  // Windows compare by placement (x0, y0, w, h) — not by object identity, so an
  // added diagnostic key in a later run does not read as a moved window.
  // The offset is reported in px; a few px is the roller's own mound moving the
  // projected landing (rig runs before 2026-09-01's gain-0 placement fix), and
  // is immaterial to a 200x125 window. Beyond 10 px the arms are not comparable.
  const winOff = (ca.window && cb.window) ? Math.hypot(ca.window.x0 - cb.window.x0, ca.window.y0 - cb.window.y0) : null;
  summary.push({ id, a: { cov: ga.coverageMaxFrac, ...la }, b: { cov: gb.coverageMaxFrac, ...lb }, winOff, sameStation: ca.xStar === cb.xStar && ca.tImp === cb.tImp,
    inFrame: cb.window ? cb.window.inFrame !== false : false });
  sections.push(`<section><h2>${esc(id)} <small>H₀ ${cb.meta.H0} m · T ${cb.meta.T} s · ξ ${cb.meta.xi} · station x* A ${ca.xStar} / B ${cb.xStar} m · impact t A ${ca.tImp} / B ${cb.tImp} s · ${winNote(ca)} / ${winNote(cb)}</small></h2>
<p class="gates"><b>A (${esc(ma.label || 'A')})</b>: ${gateLine(ga)}</p>
<p class="gates"><b>B (${esc(mb.label || 'B')})</b>: ${gateLine(gb)}</p>
<div class="scroll"><table><tr><th></th>${head}</tr>
${imgRow(`A after<br><small>${esc(ma.label || 'A')}</small>`, A, ca, 'after')}
${imgRow(`B after<br><small>${esc(mb.label || 'B')}</small>`, B, cb, 'after')}
${imgRow('B alone<br><small>splash=0</small>', B, cb, 'alone')}
${ca.frames[0].crop ? imgRow('A crop', A, ca, 'after', 'crop').replace(/after_/g, 'crop_after_') : ''}
${cb.frames[0].crop ? imgRow('B crop', B, cb, 'after', 'crop').replace(/after_/g, 'crop_after_') : ''}
${imgRow('A window', A, ca, 'winAfter', 'win')}
${imgRow('B window', B, cb, 'winAfter', 'win')}
${numRow('A numbers', ca)}
${numRow('B numbers', cb)}
</table></div></section>`);
}

const sumRows = summary.map((s) => `<tr><td>${esc(s.id)}</td><td>${pct(s.a.cov, 3)}</td><td>${pct(s.b.cov, 3)}</td><td>${pct(s.a.maskFracWin, 1)}</td><td>${pct(s.b.maskFracWin, 1)}</td><td>${num(s.a.contrastFoam)}</td><td>${num(s.b.contrastFoam)}</td><td>${num(s.a.texRatioFoam)}</td><td>${num(s.b.texRatioFoam)}</td><td>${s.sameStation ? 'same' : 'DIFFERENT'}</td><td>${s.winOff === null ? 'none' : s.winOff === 0 ? 'same' : s.winOff <= 10 ? `offset ${s.winOff.toFixed(1)} px` : `DIFFERENT (${s.winOff.toFixed(0)} px)`}${s.inFrame ? '' : ' (landing OFF-FRAME: window numbers are not about the landing)'}</td></tr>`).join('\n');
const html = `<!doctype html><meta charset="utf-8"><title>crash transport — ${esc(ma.label || 'A')} vs ${esc(mb.label || 'B')}</title>
<style>body{font:14px system-ui;margin:20px;background:#111;color:#ddd}h1{font-size:20px}h2{font-size:16px;margin:28px 0 6px}small{color:#999;font-weight:normal}
.scroll{overflow-x:auto}table{border-collapse:collapse}th{font-weight:normal;text-align:left;padding:4px 6px;color:#bbb;vertical-align:top;white-space:nowrap}td{padding:2px}
img{width:250px;display:block}img.crop{width:250px}img.win{width:250px}td.num{font:12px ui-monospace,monospace;color:#aaa;vertical-align:top;white-space:nowrap;padding:6px}
.gates{color:#bbb;max-width:130ch}b{color:#fff}p.note{max-width:100ch;color:#aaa}
table.sum td,table.sum th{padding:3px 10px;font:12px ui-monospace,monospace;border-bottom:1px solid #333}</style>
<h1>Transported crash — A: ${esc(ma.label || 'A')} (${ma.generated}) vs B: ${esc(mb.label || 'B')} (${mb.generated})</h1>
<p class="note">Same rig, same stations, same clocks, same fixed windows (the last two columns of the summary say so per cell — a DIFFERENT there means the two arms are not comparable, lesson 11). Coverage is the on/off pixel diff; the window numbers are read inside a fixed rectangle at the landing. Judge in sequence, by eye; the numbers say how much changed and where, not whether it reads as a crash.</p>
<table class="sum"><tr><th>cell</th><th>A peak cov</th><th>B peak cov</th><th>A win mask</th><th>B win mask</th><th>A contrast vs foam</th><th>B contrast vs foam</th><th>A tex ratio</th><th>B tex ratio</th><th>station/clock</th><th>window</th></tr>
${sumRows}</table>
${sections.join('\n')}`;
writeFileSync(OUT, html);
console.log(`-> ${OUT}`);
if (!existsSync(OUT)) process.exit(1);
