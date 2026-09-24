// Model side of research/SENTINEL2_LOCUS_2026-09-23.md: bake the break line
// for each Sentinel-2 scene's forcing, project it to lat/lon, and measure the
// shore-normal offset from the whitewater edge scripts/measure_sentinel2_locus.py
// extracted.
//
// Headless, on the bake's own code (bed.js bakeBreakLine / breakZAt), imported
// through scripts/measure_break_activation.mjs so the `three` resolve hook and
// the --bed=<tag> source switch are the ones every other instrument uses.
//
// Per scene (from docs/research/assets/sentinel2-locus-2026-09-23/loci.json):
//   forcing   T = SC116 waveTp at the acquisition hour (band-quantised, see
//             PP_CDIP_CLIMATOLOGY.md); tide = CO-OPS 9413450 verified MSL level,
//             clamped to the model's tide axis [-0.862, 0.764]; H0 in three
//             variants, all clamped to the control's 0.4–3.0 m:
//               hs         H0 = Hs as MOP reports it on the ~12 m contour
//               deshoaled  H0 = Hs / Ks(12 m, T), Ks from dispersion.js
//                          (the model's own Green's-law shoaling, so the
//                          reef sees Hs again when it re-shoals to 12 m)
//               h10        H0 = 1.27 Hs — the 1/10-highest wave. NOT a
//                          forcing claim: the outer whitewater edge in a
//                          single frame is the envelope of the LARGEST recent
//                          breakers, so this arm bounds how much of any
//                          offset is wave-height statistics rather than bed.
//   bed arms  reef (shipped, bedShape 0), plane (1), measured (2) — the
//             three-way A/B docs/CONTROLS.md `bed` ships.
//   stations  the same stage x the locus script scanned (10 m steps inside
//             stageBoundsM ± 10); z from breakZAt on the 128-texel line.
//   offset    z_model - z_obs in stage metres along the shore normal:
//             POSITIVE = the model breaks SHOREWARD of the observed outer
//             whitewater edge (later / closer in), negative = seaward.
//             z_obs is the K = 6 arm; K = 4 and 9 give the threshold band.
//
// Frames: stage -> ENU = origin + along*x + shore*z (pp_geo_profiles.js);
// ENU -> lat/lon via the 2026-09-05 stage projection (manifest.json).
//
// Usage:
//   node scripts/compare_sentinel2_line.mjs                # writes model_lines.json, residuals.json, residuals.md
//   node scripts/compare_sentinel2_line.mjs --bed=cudem19  # same on an alternate bed (output tagged)
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const ASSETS = join(ROOT, 'docs', 'research', 'assets', 'sentinel2-locus-2026-09-23');

// Registers the `three` hook and the --bed source switch before bed.js loads.
const I = await import('./measure_break_activation.mjs');
const bed = await import('../web-three/js/bed.js');
const D = await import('../web-three/js/dispersion.js');
const { PRESETS } = await import('../shared/params.js');
const { PP_GEO_DATA } = await import('../data/model/pp_geo_profiles.js');
const { PP_DEPTH_DATA } = await import('../data/model/pp_depth_patches.js');

const [X0, X1] = I.X_RANGE;
const BED_TAG = I.BED_SOURCE || '';
const OUT_SUFFIX = BED_TAG ? `.${BED_TAG}` : '';

// docs/research/assets/pleasure-point-2026-09-05/manifest.json stage_projection
export const STAGE_PROJECTION = {
  originLat: 36.954095, originLon: -121.976216, mPerDegLon: 88857.8, mPerDegLat: 111193.2,
};
// docs/CONTROLS.md rows `h0` and `tide`
export const H0_CLAMP = [0.4, 3.0];
export const TIDE_CLAMP = PP_DEPTH_DATA.tideRangeM;          // [-0.862, 0.764]
export const MOP_DEPTH_M = 12;                                // SC116 sits on the 10–15 m contour
export const H10_OVER_HS = 1.27;                              // Rayleigh H1/10 / Hs
export const ARMS = { reef: 0, plane: 1, measured: 2 };
export const K_OBS = { shipped: 'k6', band: ['k4', 'k9'] };
// 10 m pixel (±5 m edge quantisation) + S2 L1C absolute geolocation, 10.6 m
// at 95.5 % with the GRI (ESA S2 data-quality reports), taken as ~5 m 1σ:
// sqrt(5² + 5.3²) ≈ 7.3 m, rounded up. One value, stated once.
export const PIXEL_REG_SIGMA_M = 8;

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);
const round = (v, d = 1) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);

// Green's-law Ks the model applies at depth h (dispersion.js shoaledHeight).
export function shoalingKs(T, h) {
  const cg0 = D.G * T / (4 * Math.PI);
  const cg = D.groupVelocityAt(2 * Math.PI / T, h);
  return clamp(Math.sqrt(cg0 / cg), 0.7, 2.6);
}

export function forcingFor(scene) {
  const { hs, tp } = scene.sc116;
  const T = tp;
  const Ks12 = shoalingKs(T, MOP_DEPTH_M);
  const tideRaw = scene.tide_msl_m;
  const tide = clamp(tideRaw, TIDE_CLAMP[0], TIDE_CLAMP[1]);
  const H0 = {
    hs: clamp(hs, H0_CLAMP[0], H0_CLAMP[1]),
    deshoaled: clamp(hs / Ks12, H0_CLAMP[0], H0_CLAMP[1]),
    h10: clamp(hs * H10_OVER_HS, H0_CLAMP[0], H0_CLAMP[1]),
  };
  return { T, Ks12: round(Ks12, 4), tideRaw, tide, tideClamped: tide !== tideRaw, H0,
           H0_hs: round(H0.hs, 3), H0_deshoaled: round(H0.deshoaled, 3), H0_h10: round(H0.h10, 3) };
}

export function stageToLonLat(profile, x, z) {
  const [ox, oy] = profile.stageOriginENU;
  const [ax, ay] = profile.stageAlongENU;
  const [sx, sy] = profile.stageShoreENU;
  const ex = ox + ax * x + sx * z, ey = oy + ay * x + sy * z;
  return [STAGE_PROJECTION.originLon + ex / STAGE_PROJECTION.mPerDegLon,
          STAGE_PROJECTION.originLat + ey / STAGE_PROJECTION.mPerDegLat];
}

// The bake, exactly as main.js's default path runs it (measure_break_activation
// bakeReal), with the bed arm on the opts. Returns z(x) readers on the line.
export function bakeLine(presetKey, { H0, T, tide, bedShape }) {
  const spot = PRESETS[presetKey].geoSpot;
  bed.bakeRefraction(spot, { T, tide, bedShape, swellDeg: PRESETS[presetKey].alpha, xRef: 0 });
  const baked = bed.bakeBreakLine(spot, I.X_RANGE, { H0, T, tide, bedShape, smoothM: 0, peel: null });
  if (!baked) throw new Error(`${presetKey}: bake returned null`);
  return {
    z: (x) => bed.breakZAt(x, X0, X1),
    gap: (x) => bed.breakGapAt(x, X0, X1),
  };
}

const median = (v) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
};
const quantile = (v, q) => {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return null;
  const p = (s.length - 1) * q, i = Math.floor(p);
  return s[i] + (s[Math.min(i + 1, s.length - 1)] - s[i]) * (p - i);
};
const mean = (v) => { const s = v.filter(Number.isFinite); return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null; };

function stats(offsets) {
  const v = offsets.filter(Number.isFinite);
  return { n: v.length, median: round(median(v)), mean: round(mean(v)),
           q25: round(quantile(v, 0.25)), q75: round(quantile(v, 0.75)),
           absMedian: round(Math.abs(median(v) ?? NaN)) };
}

export function compareScene(scene) {
  const forcing = forcingFor(scene);
  const out = { forcing, spots: {} };
  for (const key of I.MAPPED) {
    const spotName = PRESETS[key].geoSpot;
    const obs = scene.spots[spotName];
    if (!obs) continue;
    const profile = PP_GEO_DATA.profiles[spotName];
    const perArm = {};
    for (const [arm, bedShape] of Object.entries(ARMS)) {
      const variants = {};
      for (const [vName, H0] of Object.entries(forcing.H0)) {
        const line = bakeLine(key, { H0, T: forcing.T, tide: forcing.tide, bedShape });
        const stations = obs.stations.map((st) => {
          const zm = line.z(st.x);
          const rec = { x: st.x, zModel: round(zm), gap: line.gap(st.x) };
          for (const k of ['k4', 'k6', 'k9']) {
            const zo = st[`outer_${k}`];
            rec[`off_${k}`] = zo === null || zo === undefined ? null : round(zm - zo);
          }
          return rec;
        });
        const offsets = {};
        for (const k of ['k4', 'k6', 'k9']) offsets[k] = stats(stations.map((s) => s[`off_${k}`]));
        const zModelMedian = round(median(stations.map((s) => s.zModel)));
        // Against the seaward ENVELOPE of the foam (q10 of the station outer
        // edges): foam is intermittent on the outer reef, so the envelope is
        // the frame's best estimate of where anything broke at all.
        const offEnvelope = obs.z_obs_q10 === null || obs.z_obs_q10 === undefined ? null : round(zModelMedian - obs.z_obs_q10);
        // a polyline for the figure (4 m), inside the stage window
        const lo = profile.stageBoundsM[0] + 10, hi = profile.stageBoundsM[1] - 10;
        const lonlat = [];
        for (let x = lo; x <= hi + 1e-9; x += 4) lonlat.push(stageToLonLat(profile, x, line.z(x)).map((v) => round(v, 6)));
        variants[vName] = { H0: round(H0, 3), stations, offsets, zModelMedian, offEnvelope,
                            gapFrac: round(mean(stations.map((s) => (s.gap ? 1 : 0))), 2),
                            lonlat: vName === 'deshoaled' ? lonlat : undefined };
      }
      perArm[arm] = variants;
    }
    const zObs = obs.stations.map((s) => s.outer_k6);
    out.spots[spotName] = { preset: key, nStations: obs.stations.length,
                            nWithWhitewater: obs.n_with_whitewater,
                            cloudFracOnStations: obs.cloud_frac_on_stations,
                            zObsMedian: round(median(zObs)), zObsQ10: obs.z_obs_q10 ?? null,
                            zDenseMedian: obs.z_dense_median ?? null,
                            zObsBand: [round(median(obs.stations.map((s) => s.outer_k9))), round(median(obs.stations.map((s) => s.outer_k4)))],
                            arms: perArm };
  }
  return out;
}

function mdTable(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
          ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}
const fmt = (v) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : (v > 0 ? '+' : '') + v.toFixed(0));

function main() {
  const loci = JSON.parse(readFileSync(join(ASSETS, 'loci.json'), 'utf8'));
  const modelLines = { generated_utc: new Date().toISOString().slice(0, 19) + 'Z', bed_source: BED_TAG || 'shipped (NCEI 1/3" 2012)',
                       stage_projection: STAGE_PROJECTION, h0_clamp: H0_CLAMP, tide_clamp: TIDE_CLAMP,
                       mop_depth_m: MOP_DEPTH_M, pixel_reg_sigma_m: PIXEL_REG_SIGMA_M, scenes: {} };
  const residuals = { generated_utc: modelLines.generated_utc, bed_source: modelLines.bed_source,
                      sign: 'offset = z_model - z_obs (stage m, shore normal); positive = model shoreward of the observed outer whitewater edge',
                      pixel_reg_sigma_m: PIXEL_REG_SIGMA_M, scenes: {} };
  const rows = [];
  // Per (scene, spot). Foam at z means a wave broke at or seaward of z, but
  // WHICH wave is unknown: the largest set wave breaks seaward of the Hs
  // locus by construction, and a stray patch (whitecap, trail) can sit
  // anywhere. So the test is deliberately conservative:
  //   CONTRADICTED  the arm's H1/10 line (the 1-in-10 wave, the most seaward
  //                 line a common wave can earn) is still > 2σ SHOREWARD of
  //                 the MEDIAN station outer edge — foam is typical where
  //                 the model says even a big wave is unbroken.
  //   CONSISTENT    otherwise. Not confirmation: the frame cannot see a line
  //                 seaward of its foam.
  //   closest       among consistent arms, the smallest |offset| of the
  //                 Hs/Ks line from the median foam edge, when it leads the
  //                 next arm by >= 2σ.
  // The seaward envelope (q10) is reported as a bound and never scored.
  // Only the main (non-supplementary) scenes score.
  const score = {};
  for (const arm of Object.keys(ARMS)) score[arm] = { contradicted: 0, consistent: 0, closest: 0 };
  let cells = 0;
  const stationDetail = {};
  for (const scene of loci.scenes) {
    const cmp = compareScene(scene);
    const lines = { forcing: cmp.forcing, supplementary: Boolean(scene.supplementary), spots: {} };
    const res = { forcing: cmp.forcing, supplementary: Boolean(scene.supplementary), reject_reason: scene.reject_reason || '', spots: {} };
    stationDetail[scene.id] = {};
    for (const [spotName, sp] of Object.entries(cmp.spots)) {
      lines.spots[spotName] = {};
      res.spots[spotName] = { preset: sp.preset, nStations: sp.nStations, nWithWhitewater: sp.nWithWhitewater,
                              cloudFracOnStations: sp.cloudFracOnStations, zObsMedian: sp.zObsMedian, zObsQ10: sp.zObsQ10,
                              zDenseMedian: sp.zDenseMedian, zObsBand_k9_k4: sp.zObsBand, arms: {} };
      stationDetail[scene.id][spotName] = {};
      for (const [arm, variants] of Object.entries(sp.arms)) {
        lines.spots[spotName][arm] = { lonlat: variants.deshoaled.lonlat, zModelMedian: variants.deshoaled.zModelMedian };
        res.spots[spotName].arms[arm] = {};
        stationDetail[scene.id][spotName][arm] = {};
        for (const [vName, v] of Object.entries(variants)) {
          res.spots[spotName].arms[arm][vName] = { H0: v.H0, zModelMedian: v.zModelMedian, gapFrac: v.gapFrac,
                                                   offsets: v.offsets, offEnvelope: v.offEnvelope };
          stationDetail[scene.id][spotName][arm][vName] = v.stations;
        }
      }
      const cell = (arm, vName, k = 'k6') => sp.arms[arm][vName].offsets[k];
      const env = (arm) => sp.arms[arm].deshoaled.offEnvelope;
      const big = (arm) => cell(arm, 'h10').median;          // H1/10 line vs median foam edge
      const mid = (arm) => cell(arm, 'deshoaled').median;    // Hs/Ks line vs median foam edge
      let verdicts = {};
      if (sp.nWithWhitewater > 0) {
        for (const arm of Object.keys(ARMS)) verdicts[arm] = big(arm) > 2 * PIXEL_REG_SIGMA_M ? 'contradicted' : 'consistent';
        if (!scene.supplementary) {
          cells++;
          for (const arm of Object.keys(ARMS)) score[arm][verdicts[arm]]++;
          const ok = Object.keys(ARMS).filter((a) => verdicts[a] === 'consistent').sort((a, b) => Math.abs(mid(a)) - Math.abs(mid(b)));
          if (ok.length && (ok.length === 1 || Math.abs(mid(ok[1])) - Math.abs(mid(ok[0])) >= 2 * PIXEL_REG_SIGMA_M)) score[ok[0]].closest++;
        }
      }
      res.spots[spotName].verdicts = verdicts;
      for (const arm of Object.keys(ARMS)) {
        const d = cell(arm, 'deshoaled'), h = cell(arm, 'hs'), t = cell(arm, 'h10');
        const band = [cell(arm, 'deshoaled', 'k4').median, cell(arm, 'deshoaled', 'k9').median];
        rows.push([scene.date + (scene.supplementary ? ' (supp.)' : ''), spotName, arm, `${sp.nWithWhitewater}/${sp.nStations}`,
                   fmt(sp.zObsQ10), fmt(sp.zObsMedian), fmt(sp.zDenseMedian), fmt(sp.arms[arm].deshoaled.zModelMedian),
                   fmt(env(arm)), `${fmt(d.median)} [${fmt(d.q25)}, ${fmt(d.q75)}]`, fmt(h.median), fmt(t.median),
                   `${fmt(band[0])} … ${fmt(band[1])}`, verdicts[arm] || 'no foam']);
      }
    }
    modelLines.scenes[scene.id] = lines;
    residuals.scenes[scene.id] = res;
  }
  residuals.summary = {
    rule: `per (scene, spot) on the main scenes, K = 6: an arm is CONTRADICTED when its H1/10 line sits more than 2σ (${2 * PIXEL_REG_SIGMA_M} m) shoreward of the median station outer foam edge; among consistent arms the Hs/Ks line nearest the median foam edge is 'closest' when it leads the next by >= 2σ; the q10 envelope is a bound, not scored`,
    cells, score,
  };
  writeFileSync(join(ASSETS, `model_lines${OUT_SUFFIX}.json`), JSON.stringify(modelLines));
  writeFileSync(join(ASSETS, `residuals${OUT_SUFFIX}.json`), JSON.stringify(residuals, null, 1));
  mkdirSync(join(ROOT, 'qa', 'sentinel2-locus'), { recursive: true });
  writeFileSync(join(ROOT, 'qa', 'sentinel2-locus', `residual_stations${OUT_SUFFIX}.json`), JSON.stringify(stationDetail));
  const md = mdTable(['scene', 'spot', 'bed', 'stations w/ foam', 'foam envelope q10 (m)', 'foam med (m)', 'dense band med (m)',
                      'z_model med (m)', 'offset vs envelope', 'offset vs med [q25, q75]', 'H0=Hs', 'H0=H1/10',
                      'K=4 … K=9', 'verdict'], rows);
  writeFileSync(join(ASSETS, `residuals${OUT_SUFFIX}.md`), md + '\n\n' + JSON.stringify(residuals.summary) + '\n');
  console.log(md);
  console.log('\nsummary', JSON.stringify(residuals.summary));
  console.log(`\nwrote ${ASSETS}/model_lines${OUT_SUFFIX}.json, residuals${OUT_SUFFIX}.json, residuals${OUT_SUFFIX}.md`);
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();
