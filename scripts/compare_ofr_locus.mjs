// The model's break line against USGS OFR 2007-1270.
//
// The report prints no breaking position (its timex figures are oblique and
// carry no ground control — extract_ofr_2007_1270.py, timex_geometry), so
// the comparison this instrument can make is the one the report's Fig. 9
// supports: bake the line at the forcing the report's image windows had, put
// it on the stage frame, and read the bed the SWATHplus swath drew at that
// place against the bed the model drew it on. A depth residual at the line
// is a cross-shore offset through the local slope: the bed that reaches h_b
// sooner breaks the wave sooner.
//
// Per mapped preset x forcing window x bed mode (0 measured+reef, 1 plane,
// 2 measured), headless, the bake's own code (bed.js bakeBreakLine, read back
// through breakZAt exactly as measure_break_activation.mjs does):
//
//   line offset       metres from the OSM coastline along the shore-normal
//                     through the spot node (the profile frame of
//                     fig9_profiles.json), at the node station and averaged
//                     over |x| <= 40 m
//   h_model           depth at the line on the bed the line was baked on
//   h_ncei/cudem/fig9 depth at that offset on each grid (profiles JSON)
//   implied shift     -(h_fig9 - h_model) / slope, metres, +seaward
//
// Forcing: the report's Hs is at the AWAC (13 m). The model's H0 is deep
// water, so Hs is de-shoaled with the model's own Ks at 13 m for the window's
// Tp. Windows come from the assets' conditions.json (SC116 hindcast + CO-OPS
// tide) and extracted.json (captions, Fig. 11 monthly means).
//
// Usage:
//   node scripts/compare_ofr_locus.mjs                 # shipped bed modules
//   node scripts/compare_ofr_locus.mjs --bed=cudem19   # CUDEM-built modules
//   --assets=<dir>   default docs/research/assets/ofr-2007-1270-2026-09-23
import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { bedSourceTag, registerBedSource } from './lib/bed-source.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const BED_SOURCE = registerBedSource(bedSourceTag());
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') {
      return { url: new URL('../web-three/vendor/three.module.js', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
const bed = await import('../web-three/js/bed.js');
const { PRESETS } = await import('../shared/params.js');
const { PP_GEO_DATA } = await import('../data/model/pp_geo_profiles.js');
const D = await import('../web-three/js/dispersion.js');

const argOf = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const ASSETS = join(ROOT, argOf('assets', 'docs/research/assets/ofr-2007-1270-2026-09-23'));
const extracted = JSON.parse(readFileSync(join(ASSETS, 'extracted.json'), 'utf8'));
const conditions = JSON.parse(readFileSync(join(ASSETS, 'conditions.json'), 'utf8'));
const profiles = JSON.parse(readFileSync(join(ASSETS, 'fig9_profiles.json'), 'utf8'));

const X_RANGE = [-300, 300];           // main.js [-STAGE_W/2, STAGE_W/2]
const [X0, X1] = X_RANGE;
const AWAC_DEPTH_M = 13;               // App. 4 transducer depth
const MLLW_ABOVE_NAVD88 = 0.043;
const MODES = [[0, 'measured+reef'], [1, 'plane'], [2, 'measured']];

// deep-water H0 from a height measured at depth d for period T: H = H0 * Ks
function deshoal(H, T, d) {
  const omega = 2 * Math.PI / T;
  const cg0 = D.G * T / (4 * Math.PI);
  const Ks = Math.sqrt(cg0 / D.groupVelocityAt(omega, d));
  return { H0: H / Ks, Ks };
}

// The forcing windows. Hs: the caption's (AWAC) where printed, else SC116.
const monthly = Object.fromEntries(extracted.fig11_monthly.months.map((m) => [m.month, m]));
const WINDOWS = [];
for (const key of ['fig14', 'fig15']) {
  const w = conditions.windows[key];
  const T = w.sc116.waveTp;
  const cap = deshoal(w.caption_Hs_m, T, AWAC_DEPTH_M);
  const mop = deshoal(w.sc116.waveHs, T, 15);
  WINDOWS.push({ id: `${key}-caption`, label: `${key} ${w.local}, caption Hs ${w.caption_Hs_m} m at the AWAC, SC116 Tp ${T.toFixed(1)} s, tide ${w.tide_msl_m.toFixed(2)}`,
                 H0: cap.H0, Ks: cap.Ks, T, tide: w.tide_msl_m, Hs: w.caption_Hs_m, HsSource: 'caption (AWAC, 13 m)' });
  WINDOWS.push({ id: `${key}-sc116`, label: `${key} ${w.local}, SC116 Hs ${w.sc116.waveHs.toFixed(2)} m at 15 m, Tp ${T.toFixed(1)} s, tide ${w.tide_msl_m.toFixed(2)}`,
                 H0: mop.H0, Ks: mop.Ks, T, tide: w.tide_msl_m, Hs: w.sc116.waveHs, HsSource: 'SC116 hindcast (15 m)' });
}
for (const [mon, label] of [['2006-08', 'Aug 2006'], ['2006-09', 'Sep 2006']]) {
  const m = monthly[mon];
  const s = deshoal(m.Hs_m.mean, m.Tp_s.mean, AWAC_DEPTH_M);
  WINDOWS.push({ id: `monthly-${mon}`, label: `${label} monthly mean (Fig. 11): Hs ${m.Hs_m.mean} m, Tp ${m.Tp_s.mean} s, tide 0`,
                 H0: s.H0, Ks: s.Ks, T: m.Tp_s.mean, tide: 0, Hs: m.Hs_m.mean, HsSource: 'Fig. 11 monthly mean (AWAC, 13 m)' });
}

// stage (x, z) of a spot -> ENU (metres, apex frame)
function toENU(spot, x, z) {
  const p = PP_GEO_DATA.profiles[spot];
  const [ox, oy] = p.stageOriginENU, [ax, ay] = p.stageAlongENU, [sx, sy] = p.stageShoreENU;
  return [ox + x * ax + z * sx, oy + x * ay + z * sy];
}

function profileOf(spot) {
  const p = profiles.profiles.find((q) => q.spot === spot);
  if (!p) throw new Error(`no Fig. 9 profile for ${spot}`);
  return p;
}
// offset along the profile normal from its coast origin
function offsetOf(prof, E, N) {
  return (E - prof.coast_origin_xy[0]) * prof.normal_enu[0] + (N - prof.coast_origin_xy[1]) * prof.normal_enu[1];
}
// linear interpolation of a sample field along the profile (10 m steps)
function sampleAt(prof, field, off) {
  const S = prof.samples;
  if (off < S[0].offset_m || off > S[S.length - 1].offset_m) return null;
  const i = Math.min(Math.floor(off / 10), S.length - 2);
  const a = S[i], b = S[i + 1];
  if (a[field] == null || b[field] == null) return null;
  if (field.startsWith('fig9') && (a.fig9_clipped || b.fig9_clipped)) return null;
  const t = (off - a.offset_m) / 10;
  return a[field] * (1 - t) + b[field] * t;
}
function slopeAt(prof, field, off, dz = 20) {
  const a = sampleAt(prof, field, off - dz), b = sampleAt(prof, field, off + dz);
  return a == null || b == null ? null : (a - b) / (2 * dz);   // depth increases seaward: -(dElev/dOff)
}
function swathEdge(prof) { return prof.swath_inshore_edge; }

function bake(key, spot, w, bedShape) {
  bed.bakeRefraction(spot, { T: w.T, tide: w.tide, bedShape, swellDeg: PRESETS[key].alpha, xRef: 0 });
  const baked = bed.bakeBreakLine(spot, X_RANGE, { H0: w.H0, T: w.T, tide: w.tide, bedShape, smoothM: 0, peel: null });
  if (!baked) return null;
  const wl = bed.MSL_ABOVE_NAVD88 + w.tide;
  const at = (x) => {
    const z = bed.breakZAt(x, X0, X1);
    if (!Number.isFinite(z)) return null;
    const gap = Boolean(bed.breakGapAt(x, X0, X1));
    const eb = bed.bedElevBlended(spot, x, z, bedShape);
    return { x, z, gap, h: eb === bed.BED_UNKNOWN ? null : wl - eb };
  };
  const node = at(0);
  const band = [];
  for (let x = -40; x <= 40; x += 2) { const r = at(x); if (r && !r.gap) band.push(r); }
  return { node, band };
}

const rows = [];
for (const key of Object.keys(PRESETS)) {
  const spot = PRESETS[key].geoSpot;
  if (!spot || !PP_GEO_DATA.profiles[spot]?.contourFit?.usable) continue;
  const prof = profileOf(spot);
  for (const w of WINDOWS) {
    for (const [mode, modeName] of MODES) {
      const b = bake(key, spot, w, mode);
      const rec = { preset: key, spot, window: w.id, H0: +w.H0.toFixed(3), Hs: w.Hs, Ks13: +w.Ks.toFixed(3), T: w.T, tide: w.tide, bedShape: mode, bedMode: modeName };
      if (!b || !b.node) { rows.push({ ...rec, line: null }); continue; }
      const [E, N] = toENU(spot, b.node.x, b.node.z);
      const off = offsetOf(prof, E, N);
      const offBand = b.band.length ? b.band.map((r) => offsetOf(prof, ...toENU(spot, r.x, r.z))) : [];
      const offMean = offBand.length ? offBand.reduce((a, c) => a + c, 0) / offBand.length : null;
      const wl = bed.MSL_ABOVE_NAVD88 + w.tide;
      const hOf = (field) => { const e = sampleAt(prof, field, off); return e == null ? null : wl - e; };
      const hN = hOf('ncei_elev_navd88_m'), hC = hOf('cudem19_elev_navd88_m'), hF = hOf('fig9_elev_navd88_m');
      const slope = slopeAt(prof, 'ncei_elev_navd88_m', off);
      const edge = swathEdge(prof);
      rows.push({ ...rec, line: { x: 0, z: +b.node.z.toFixed(1), gap: b.node.gap, ENU: [+E.toFixed(1), +N.toFixed(1)] },
                  offset_m: +off.toFixed(1), offset_band_mean_m: offMean == null ? null : +offMean.toFixed(1), band_n: b.band.length,
                  h_model_m: b.node.h == null ? null : +b.node.h.toFixed(2),
                  h_ncei_m: hN == null ? null : +hN.toFixed(2), h_cudem_m: hC == null ? null : +hC.toFixed(2),
                  h_fig9_m: hF == null ? null : +hF.toFixed(2),
                  swath_covers_line: edge ? off >= edge.offset_m : false,
                  swath_inshore_edge_m: edge ? edge.offset_m : null,
                  ncei_slope: slope == null ? null : +slope.toFixed(4),
                  implied_shift_m: (hF == null || b.node.h == null || !slope) ? null : +(-(hF - b.node.h) / slope).toFixed(0),
                  cudem_vs_model_shift_m: (hC == null || b.node.h == null || !slope) ? null : +(-(hC - b.node.h) / slope).toFixed(0) });
    }
  }
}

// ---- report
const L = [];
L.push(`# Model break line vs OFR 2007-1270 Fig. 9 — bed source: ${BED_SOURCE || 'shipped (NCEI 2012)'}\n`);
L.push('Offsets are metres seaward of the OSM coastline along the shore-normal through the spot node; h = depth at the line (m, at the window\'s tide); shift = -(h_fig9 - h_model)/slope, +seaward. "-" = the line is shoreward of the swath\'s inshore edge (no sounding there) or a clipped reading.\n');
for (const w of WINDOWS) {
  L.push(`## ${w.label}\n`);
  L.push(`H0 (deep water) = Hs / Ks = ${w.Hs} / ${w.Ks.toFixed(3)} = ${w.H0.toFixed(2)} m (${w.HsSource})\n`);
  L.push('| preset | bed | line z | offset m | band mean | h_model | h_ncei | h_cudem | h_fig9 | swath edge m | slope | shift vs fig9 | shift vs cudem |');
  L.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const r of rows.filter((q) => q.window === w.id)) {
    const f = (v, d = 1) => (v == null ? '-' : (typeof v === 'number' ? v.toFixed(d) : String(v)));
    if (!r.line) { L.push(`| ${r.preset} | ${r.bedMode} | no line | | | | | | | | | | |`); continue; }
    L.push(`| ${r.preset} | ${r.bedMode} | ${f(r.line.z)}${r.line.gap ? ' (gap)' : ''} | ${f(r.offset_m)} | ${f(r.offset_band_mean_m)} | ${f(r.h_model_m, 2)} | ${f(r.h_ncei_m, 2)} | ${f(r.h_cudem_m, 2)} | ${f(r.h_fig9_m, 2)} | ${f(r.swath_inshore_edge_m, 0)} | ${f(r.ncei_slope, 4)} | ${f(r.implied_shift_m, 0)} | ${f(r.cudem_vs_model_shift_m, 0)} |`);
  }
  L.push('');
}
const tag = BED_SOURCE ? `.${BED_SOURCE}` : '';
writeFileSync(join(ASSETS, `locus_compare${tag}.json`), JSON.stringify({ bedSource: BED_SOURCE || 'shipped', windows: WINDOWS, rows }, null, 1));
while (L.length && L[L.length - 1] === '') L.pop();
writeFileSync(join(ASSETS, `locus_compare${tag}.md`), L.join('\n') + '\n');
console.log(L.join('\n'));
