// Second Peak on "the field day": what the model declares at the jury's hash,
// at the afternoon clip's own forcing, and where the Lookout camera is
// standing when it looks for it.
//
// CURL_JURY_2026-09-24 §1/§3 judged five lip arms at
//   #preset=secondpeak&cam=lookout&day=big&h0=1.4&tide=0.732
// and found every arm pixel-identical with "nothing breaking". That hash was
// built on 2026-08-15 for the MORNING social loop (PLEASURE_POINT_CAPTURE
// "Model mapping": h0 1.4 = the 46042 offshore buoy's 4.6 ft Hs; tide 0.732 =
// "incoming 2.4 ft" converted to metres with the datum left "approximate"),
// not for the 15:28 clip the jury judged against (3 ft at 16 s, 4.0 ft MLLW =
// +0.357 m MSL predicted / +0.500 verified; FORCING_AUDIT §3). And `cam=lookout`
// is the 38th Avenue fixture pose (main.js LOOKOUT, absolute ENU), which under
// the Second Peak preset stands several hundred metres down-point of the
// stage it is asked to show.
//
// Headless, on the bake's own code through the same instrument the scorecard
// uses (measure_peel_band_field.mjs measureCell: bed.js bakeRefraction /
// bakeBreakLine / derivedPeelGeometry, read on the 2 m stage grid). Both reef
// arms: the shipped table (the 2026-09-24 refit) and #reef=legacy.
//
//   node scripts/measure_secondpeak_fieldday.mjs            # table + JSON
//   --out=qa/secondpeak-fieldday-2026-09-24   --quiet
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { bedFor } from './lib/reef-knobs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const arg = (k, d) => { const a = process.argv.find((s) => s.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const OUT = (() => { const o = arg('out', 'qa/secondpeak-fieldday-2026-09-24'); return isAbsolute(o) ? o : join(ROOT, o); })();
const QUIET = process.argv.includes('--quiet');

// measure_peel_band_field.mjs registers the `three` hook, imports bed.js at
// its plain URL and exports measureCell; its main() runs only when it is the
// entry script.
const PB = await import('./measure_peel_band_field.mjs');
const bedTable = await bedFor({});            // zero knobs == the shipped bed.js, bit for bit (PEEL_BAND §4 gate)
const { PRESETS, PEEL_FLOOR, PEEL_FLOOR_LEGACY, PEEL_FLOOR_BASIS, peelFloorH0, reefWindowKnots } = await import('../shared/params.js');
const { PP_GEO_DATA } = await import('../data/model/pp_geo_profiles.js');
const { CONDITION_DAYS } = await import('../web-three/js/conditions.js');

export const KEY = 'secondpeak';
export const SPOT = PRESETS[KEY].geoSpot;
const X_RANGE = [-300, 300];                   // main.js STAGE_W
const MLLW_ABOUT_MSL = bedTable.TIDE_RANGE[0]; // -0.862 m (CO-OPS 9413450)
const FT = 0.3048;

const day = (k) => CONDITION_DAYS.find((d) => d.key === k);
const big = day('big'), overhead = day('overhead');

// ---------- the cells ----------
// Every H0/tide pair that has been typed for "the field day", labelled by
// where it came from. T comes from the #day= the hash rides on (big 17 s,
// overhead 16 s) or the card (14 s).
export const CELLS = [
  { id: 'jury',            H0: 1.4,   T: big.T,      tide: 0.732,  note: 'the jury hash: day=big&h0=1.4&tide=0.732 (morning buoy Hs; 2.4 ft typed as +0.732 m MSL)' },
  { id: 'jury_T16',        H0: 1.4,   T: overhead.T, tide: 0.732,  note: 'same, at the afternoon clip\'s 16 s' },
  { id: 'jury_mllw',       H0: 1.4,   T: big.T,      tide: +(2.4 * FT + MLLW_ABOUT_MSL).toFixed(3), note: '2.4 ft read as MLLW: ' + (2.4 * FT + MLLW_ABOUT_MSL).toFixed(3) + ' m MSL' },
  { id: 'clip_surfline',   H0: 0.914, T: overhead.T, tide: 0.357,  note: 'the 15:28 clip: Surfline 3 ft, 4.0 ft MLLW predicted (+0.357 MSL), T 16' },
  { id: 'clip_verified',   H0: 0.778, T: overhead.T, tide: 0.500,  note: 'the 15:28 clip: SC116 Hs 0.778, CO-OPS verified +0.500, T 16' },
  { id: 'clip_surfline_T17', H0: 0.914, T: big.T,    tide: 0.357,  note: 'clip, Surfline height, at day=big\'s 17 s' },
  { id: 'clip_verified_T17', H0: 0.778, T: big.T,    tide: 0.500,  note: 'clip, SC116 height, at day=big\'s 17 s' },
  { id: 'clip_setwave',    H0: 1.40,  T: overhead.T, tide: 0.500,  note: 'E[Hmax] = 1.53 x 0.914 at the verified tide (the wave the surfers ride)' },
  { id: 'clip_setwave_pred', H0: 1.40, T: overhead.T, tide: 0.357, note: 'E[Hmax] at the predicted tide' },
  { id: 'card',            H0: PRESETS[KEY].H0, T: PRESETS[KEY].T, tide: 0, note: 'the model card' },
].map((c) => ({ ...c, tide: Number(c.tide) }));

// ---------- the floor, as the runtime would read it ----------
// #h0= bypasses setDerivedH0 entirely (main.js: "An explicit h0 is the
// author's own number and outranks the peel floor"), so for every hash that
// types h0 the floor is not an actor. Reported anyway, with the reasons it
// would decline, because the jury's verdict cited it.
export function floorVerdict(arm, { T, tide }) {
  const spec = (arm === 'legacy' ? PEEL_FLOOR_LEGACY : PEEL_FLOOR)[KEY];
  const reasons = [];
  if (T !== spec.basisT) reasons.push(`T ${T} s off the ${spec.basisT} s basis`);
  if (tide < spec.tideBandM[0] - 1e-9 || tide > spec.tideBandM[1] + 1e-9)
    reasons.push(`tide ${fmt(tide, 3)} outside the band [${spec.tideBandM[0]}, ${spec.tideBandM[1]}]`);
  const floor = arm === 'legacy' ? null : peelFloorH0(KEY, { T, tideM: tide });
  return { floorH0: spec.floorH0, tideBandM: spec.tideBandM, basisT: spec.basisT,
           applies: reasons.length === 0, declines: reasons,
           runtimeFloor: arm === 'legacy' ? '(legacy arm: runtime reads PEEL_FLOOR only)' : floor,
           routedThroughFloor: false, why: '#h0= is explicit; setDerivedH0 is not called' };
}

function fmt(v, d = 2) { return Number.isFinite(v) ? v.toFixed(d) : '—'; }

// ---------- one arm, all cells ----------
function measureArm(bed, arm, cells = CELLS) {
  bed.setReefFitMode(arm === 'legacy' ? 'legacy' : 'table');
  const fit = bed.reefFitFor(SPOT);
  const pr = PP_GEO_DATA.profiles[SPOT];
  const win = reefWindowKnots(pr.stageBoundsM[0], pr.stageBoundsM[1]);
  const rows = [];
  for (const c of cells) {
    const cell = PB.measureCell(bed, KEY, { H0: c.H0, T: c.T, tide: c.tide }, { keepStations: true });
    const act = bed.reefActivationH0(SPOT, X_RANGE, { T: c.T, tide: c.tide });
    // Where the on-reef stations sit against the reef window: inside the full
    // window (between the inner knots) or on a feather.
    const st = cell.stations;
    const onReef = st.filter((s) => s.onReef);
    const inFull = onReef.filter((s) => s.x >= win[1] && s.x <= win[2]).length;
    const upFeather = onReef.filter((s) => s.x < win[1]).length;
    const downFeather = onReef.filter((s) => s.x > win[2]).length;
    rows.push({
      ...c, arm,
      alpha: cell.alpha, alphaQ1: cell.alphaQ1, alphaQ3: cell.alphaQ3, onReef: cell.onReef, Vp: cell.Vp, c: cell.c,
      healthy: cell.healthy, walker: cell.walker, reversals: cell.reversals,
      gapFrac: cell.gapFrac, pinnedN: cell.pinnedN, nStations: st.length,
      zLine: cell.zLine, depth: cell.depth, dzc: cell.dzc,
      lineBearing: cell.lineBearing, crestBearing: cell.crestBearing,
      onReefWhere: { inFullWindow: inFull, upPointFeather: upFeather, downPointFeather: downFeather },
      activation: act ? { H0: +act.H0.toFixed(3), minReefDepthM: +act.minReefDepthM.toFixed(2), aboveActivation: c.H0 >= act.H0 } : null,
      floor: floorVerdict(arm, c),
      stations: st,
    });
  }
  return { arm, fit: fit ? { crestDepthM: +(bed.MSL_ABOVE_NAVD88 - fit.targetEl).toFixed(3), betaDeg: +fit.betaDeg.toFixed(2), zRef: fit.zRef, hbM: +fit.hbM.toFixed(3) } : null,
           reefWindow: win.map((v) => +v.toFixed(1)), stageBoundsM: pr.stageBoundsM, rows };
}

// ---------- the Lookout pose in the Second Peak stage frame ----------
// Replicates main.js lookoutStation()/lookoutTarget(): ENU offset from the
// profile's stage origin, rotated by its basis; the heading likewise. Reports
// horizontal bearing of each break-line station off the optical axis against
// the half horizontal field at the jury's 1000 x 625 viewport (aspect 1.6).
// The GPU frame is the authority (capture_secondpeak_fieldday.mjs projects
// through the live camera); this is the geometry that predicts it.
export function lookoutGeometry(bed, line, { aspect = 1000 / 625 } = {}) {
  const LOOKOUT = { enuM: [817.1, 542.3], headingDeg: 187.3, vfovDeg: 31.4, pitchDeg: 5.59, eyeH: 1.55 };  // main.js
  const pr = PP_GEO_DATA.profiles[SPOT];
  const toStage = (dE, dN) => [dE * pr.stageAlongENU[0] + dN * pr.stageAlongENU[1],
                               dE * pr.stageShoreENU[0] + dN * pr.stageShoreENU[1]];
  const [ex, ez] = toStage(LOOKOUT.enuM[0] - pr.stageOriginENU[0], LOOKOUT.enuM[1] - pr.stageOriginENU[1]);
  const ground = bed.bedElevAt(SPOT, ex, ez) - bed.MSL_ABOVE_NAVD88;
  const eyeY = ground + LOOKOUT.eyeH;
  const h = LOOKOUT.headingDeg * Math.PI / 180;
  const [dx, dz] = toStage(Math.sin(h), Math.cos(h));
  const axis = Math.atan2(dz, dx);
  const halfH = Math.atan(Math.tan(LOOKOUT.vfovDeg / 2 * Math.PI / 180) * aspect) * 180 / Math.PI;
  const at = (x, z) => {
    const b = Math.atan2(z - ez, x - ex);
    let off = (b - axis) * 180 / Math.PI; while (off > 180) off -= 360; while (off < -180) off += 360;
    return { x, z: +z.toFixed(1), rangeM: +Math.hypot(x - ex, z - ez).toFixed(0), offAxisDeg: +off.toFixed(1), inHorizontalField: Math.abs(off) <= halfH };
  };
  const stations = line.map((s) => at(s.x, s.z));
  const inField = stations.filter((s) => s.inHorizontalField);
  return {
    eyeStage: { x: +ex.toFixed(1), y: +eyeY.toFixed(2), z: +ez.toFixed(1) }, groundMslM: +ground.toFixed(2),
    headingStage: { dx: +dx.toFixed(3), dz: +dz.toFixed(3) }, halfHorizontalFieldDeg: +halfH.toFixed(1),
    distanceToNodeM: +Math.hypot(ex, ez).toFixed(0),
    stageEnds: [at(pr.stageBoundsM[0], line[0]?.z ?? 0), at(pr.stageBoundsM[1], line[line.length - 1]?.z ?? 0)],
    stationsInField: inField.length, stationsTotal: stations.length,
    inFieldX: inField.length ? [inField[0].x, inField[inField.length - 1].x] : null,
    stations,
  };
}

// ---------- run ----------
// Both arms on the one shipped instance (setReefFitMode invalidates every reef
// cache), left on the table arm afterwards. Exported for tests/secondpeak-fieldday.test.js.
export function measureAll(bed = bedTable, cells = CELLS) {
  const arms = { table: measureArm(bed, 'table', cells), legacy: measureArm(bed, 'legacy', cells) };
  bed.setReefFitMode('table');
  return arms;
}
export { measureArm, bedTable };

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main();

function main() {
const arms = measureAll();
const juryTable = arms.table.rows.find((r) => r.id === 'jury');
const lookout = lookoutGeometry(bedTable, juryTable.stations.map((s) => ({ x: s.x, z: s.z })));

const out = {
  generated: new Date().toISOString(), key: KEY, spot: SPOT,
  hash: 'preset=secondpeak&cam=lookout&day=big&h0=1.4&tide=0.732',
  hashDecoded: { H0: 1.4, T: big.T, tide: 0.732, chop: big.chop, dF: big.dF, source: 'PLEASURE_POINT_CAPTURE_2026-08-15.md "Model mapping" (the morning loop); h0 = 46042 buoy 4.6 ft Hs, tide = 2.4 ft in metres, datum unresolved' },
  clip: { time: '2026-08-15 15:28 PDT', surf: '3-5 ft observed, 3 ft at 16 s SSW', tideMsl: { predicted: 0.357, verified: 0.500 }, H0: { surfline: 0.914, sc116: 0.778, deshoaled: 0.726 }, source: 'FORCING_AUDIT_2026-09-23 §3, SURFLINE_CAM_POSE_2026-09-23' },
  peelFloorBasis: { measured: PEEL_FLOOR_BASIS.measured, modelCommit: PEEL_FLOOR_BASIS.modelCommit },
  arms: Object.fromEntries(Object.entries(arms).map(([k, a]) => [k, { ...a, rows: a.rows.map((r) => ({ ...r, stations: r.id === 'jury' || r.id === 'clip_surfline' ? r.stations : undefined })) }])),
  lookout,
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, 'bake.json'), JSON.stringify(out, null, 1));

if (!QUIET) {
  const line = (r) => `| ${r.id.padEnd(18)} | ${fmt(r.H0)} | ${r.T} | ${r.tide >= 0 ? '+' : ''}${fmt(r.tide, 3)} | ${fmt(r.alpha, 1).padStart(6)} [${fmt(r.alphaQ1, 0)}, ${fmt(r.alphaQ3, 0)}] | ${fmt(r.onReef).padStart(4)} | ${fmt(r.Vp, 1).padStart(5)} | ${fmt(r.c)} | ${r.healthy ? 'yes' : 'no '} / ${r.walker ? 'yes' : 'no '} | ${fmt(r.gapFrac)} | ${fmt(r.zLine, 0).padStart(4)} | ${fmt(r.depth)} | ${r.activation ? fmt(r.activation.H0) : '—'} | ${r.floor.applies ? 'in basis' : r.floor.declines.join('; ')} |`;
  for (const [k, a] of Object.entries(arms)) {
    console.log(`\n## ${k} arm — wedge crest ${a.fit?.crestDepthM} m below MSL, beta ${a.fit?.betaDeg} deg; reef window ${JSON.stringify(a.reefWindow)}, stage ${JSON.stringify(a.stageBoundsM)}`);
    console.log('| cell | H0 | T | tide | alpha med [q1, q3] | on-reef | Vp | c | healthy / Walker | gap | z line | depth | activation H0 | floor (would it apply) |');
    console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of a.rows) console.log(line(r));
  }
  console.log('\n## jury cell, table arm, every 8th stage station');
  console.log('| x | z | on-reef | gap | pinned | depth | alpha | Vp |');
  console.log('|---|---|---|---|---|---|---|---|');
  juryTable.stations.filter((_, i) => i % 8 === 0).forEach((s) => console.log(`| ${s.x} | ${s.z} | ${s.onReef} | ${s.gap} | ${s.pinned} | ${s.depth} | ${s.alpha} | ${s.Vp} |`));
  console.log(`\n## Lookout pose in the Second Peak stage frame`);
  console.log(JSON.stringify({ ...lookout, stations: undefined }, null, 1));
  console.log(`\nwrote ${join(OUT, 'bake.json')}`);
}
}
