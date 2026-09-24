// The model's break line for one real day, projected into the Lookout
// photograph (docs/research/LOOKOUT_LOCUS_RESIDUAL_2026-09-23.md).
//
// Headless. Imports bed.js the way tests/reef-activation-runtime.test.js does
// (a resolve hook for the bare `three` specifier), so the line comes from the
// bake's own code — bakeBreakLine + breakZAt + breakGapAt + breakCandidates —
// not a twin of it (MEASUREMENT_LESSONS 4). Nothing here changes the bake.
//
// Per preset x bed arm x H0 arm it writes every station of the 600 m bake as
//   stage (x, z)  ->  ENU (E, N)  ->  camera (u, v) row/col in the 1280x960
//   fixture frame, horizontal range and true bearing from the eye
// so scripts/measure_lookout_locus.py can put the line on the photograph and
// subtract it from the photographed whitewater.
//
// POSE. Read from the same two sources the app reads, never re-typed:
//   * docs/research/assets/pleasure-point-2026-09-05/manifest.json — the
//     frame's ENU position, true heading, vertical fov, pixel size;
//   * web-three/js/main.js `const LOOKOUT = {...}` — pitch (solved from the
//     horizon row) and eye height over the DEM ground.
// The eye elevation is bed.js bedElevAt at the station, exactly as
// lookoutStation() computes it, so the camera here IS `#cam=lookout`.
//
// PROJECTION is done in ENU, right-handed, with the camera's right vector
// = forward rotated clockwise (right of north is east). Until 2026-09-24 the
// renderer embedded the stage as three.js (x = along, y = up, z = shore), the
// left-handed image of that frame, so a `#cam=lookout` capture was the
// horizontal MIRROR of this projection (the residual doc's check). The
// embedding is now world z = -stage z (#mirror=0 reverts), so captures and
// this projection agree without a flip.
//
// H0 ARMS. SC116 publishes Hs at the -15 m MOP point (CDIP_LIVE_DATA.md). The
// bake treats H0 as deep water (dispersion.js shoaledHeight), so the raw Hs is
// one arm and Hs / Ks(T, h) at the station depth is the other; both are
// reported, 12 m as well as 15 m because the task asked for 12.
//
// Usage:
//   node scripts/measure_lookout_line.mjs                       # jacks + secondpeak
//   node scripts/measure_lookout_line.mjs --preset=jacks --h0=0.902 --t=16.67 --tide=0.316
//   --deshoal=15,12   station depths for the de-shoaled H0 arms (metres)
//   --out=<path>      JSON (default docs/research/assets/lookout-locus-2026-09-23/model-lines.json)
import { registerHooks } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'three') {
      return { url: new URL('../web-three/vendor/three.module.js', import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const bed = await import('../web-three/js/bed.js');
const { PRESETS, PEEL_FLOOR, peelFloorH0 } = await import('../shared/params.js');
const { PP_GEO_DATA } = await import('../data/model/pp_geo_profiles.js');
const D = await import('../web-three/js/dispersion.js');

// ---------- arguments ----------
const arg = (k, dflt) => {
  const a = process.argv.find((s) => s.startsWith(`--${k}=`));
  return a ? a.slice(k.length + 3) : dflt;
};
const PRESET_KEYS = arg('preset', 'jacks,secondpeak').split(',').filter(Boolean);
const HS = Number(arg('h0', '0.902'));       // SC116 waveHs, 2026-09-05 10:00 PDT
const T = Number(arg('t', '16.67'));         // SC116 waveTp
const TIDE = Number(arg('tide', '0.316'));   // NOAA 9413450 verified, m about MSL
const DESHOAL = arg('deshoal', '15,12').split(',').map(Number).filter(Number.isFinite);
const OUT = arg('out', join(ROOT, 'docs/research/assets/lookout-locus-2026-09-23/model-lines.json'));
for (const [k, v] of Object.entries({ HS, T, TIDE })) {
  if (!Number.isFinite(v)) throw new Error(`${k} is not finite`);
}

// ---------- the pose, from the app's two sources ----------
const FRAME = 'cliff-cam-reference.jpg';
const manifest = JSON.parse(readFileSync(join(ROOT, 'docs/research/assets/pleasure-point-2026-09-05/manifest.json'), 'utf8'));
const frame = manifest.frames.find((f) => f.file === FRAME);
if (!frame) throw new Error(`${FRAME} not in manifest`);
const mainSrc = readFileSync(join(ROOT, 'web-three/js/main.js'), 'utf8');
const lookoutBlock = (mainSrc.match(/const LOOKOUT = \{([\s\S]*?)\};/) || [])[1];
if (!lookoutBlock) throw new Error('main.js: const LOOKOUT block not found');
const num = (key) => {
  const m = lookoutBlock.match(new RegExp(`${key}:\\s*(-?[0-9.]+)`));
  if (!m) throw new Error(`main.js LOOKOUT.${key} not found`);
  return Number(m[1]);
};
const POSE = {
  frame: FRAME,
  enuM: [frame.camera.stage_x_m, frame.camera.stage_y_m],   // ENU metres from the OSM apex origin
  headingDeg: frame.camera.heading_true_deg,
  vfovDeg: frame.camera.vfov_deg,
  pixels: frame.camera.pixels,      // [4032, 3024] original; the fixture derivative is 1280x960
  width: 1280, height: 960,
  pitchDeg: num('pitchDeg'),
  eyeH: num('eyeH'),
  stageProjection: manifest.stage_projection,
};
// The app's LOOKOUT block carries the same heading/fov — check they agree
// with the manifest rather than trusting either alone.
for (const [k, mk] of [['headingDeg', 'headingDeg'], ['vfovDeg', 'vfovDeg']]) {
  const app = num(k);
  if (Math.abs(app - POSE[mk]) > 1e-6) throw new Error(`main.js LOOKOUT.${k} ${app} != manifest ${POSE[mk]}`);
}
const enuApp = lookoutBlock.match(/enuM:\s*\[\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*\]/);
if (!enuApp || Math.abs(Number(enuApp[1]) - POSE.enuM[0]) > 1e-6 || Math.abs(Number(enuApp[2]) - POSE.enuM[1]) > 1e-6) {
  throw new Error('main.js LOOKOUT.enuM disagrees with the manifest');
}

const DEG = Math.PI / 180;
const f_px = (POSE.height / 2) / Math.tan(POSE.vfovDeg / 2 * DEG);   // pinhole focal length, px
const hfovDeg = 2 * Math.atan((POSE.width / 2) / f_px) / DEG;
// Camera basis in ENU (E, N, Up). Forward pitched down by pitchDeg; right is
// forward rotated clockwise in the horizontal plane; up = right x forward.
const h = POSE.headingDeg * DEG, p = POSE.pitchDeg * DEG;
const F = [Math.cos(p) * Math.sin(h), Math.cos(p) * Math.cos(h), -Math.sin(p)];
const R = [Math.cos(h), -Math.sin(h), 0];
const U = [Math.sin(p) * Math.sin(h), Math.sin(p) * Math.cos(h), Math.cos(p)];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Horizon self-check (SCALE_AND_BROW §0): the level row, forward from the pose.
const levelRow = POSE.height / 2 - f_px * Math.tan(p);

// ---------- stage <-> ENU ----------
function enuToStage(pr, dE, dN) {
  return [dE * pr.stageAlongENU[0] + dN * pr.stageAlongENU[1],
          dE * pr.stageShoreENU[0] + dN * pr.stageShoreENU[1]];
}
function stageToEnu(pr, x, z) {
  return [pr.stageOriginENU[0] + x * pr.stageAlongENU[0] + z * pr.stageShoreENU[0],
          pr.stageOriginENU[1] + x * pr.stageAlongENU[1] + z * pr.stageShoreENU[1]];
}

// Project an ENU point on the water plane (elevation = tide, m MSL) into the frame.
function project(eyeMslM, E, N) {
  const d = [E - POSE.enuM[0], N - POSE.enuM[1], TIDE - eyeMslM];
  const cf = dot(d, F), cr = dot(d, R), cu = dot(d, U);
  const u = POSE.width / 2 + f_px * cr / cf;
  const v = POSE.height / 2 - f_px * cu / cf;
  const range = Math.hypot(d[0], d[1]);
  const bearing = ((Math.atan2(d[0], d[1]) / DEG) + 360) % 360;
  const inFrame = cf > 0 && u >= 0 && u < POSE.width && v >= 0 && v < POSE.height;
  return { u, v, range, bearing, inFrame };
}

// ---------- H0 arms ----------
const Ks = (depthM) => D.shoaledHeight(1, T, depthM);   // the bake's own shoaling coefficient
const H0_ARMS = [{ label: 'raw', H0: HS, note: 'SC116 waveHs used as deep-water H0, as #h0= and #day=live do' }];
for (const dep of DESHOAL) {
  H0_ARMS.push({ label: `deshoal${dep}`, H0: HS / Ks(dep), KsAt: Ks(dep), depthM: dep,
                 note: `Hs / Ks(T=${T}, h=${dep} m) from dispersion.js shoaledHeight` });
}
// A photograph of a breaking wave samples the SET waves, not the significant
// height: the waves that break furthest out are the largest of the group.
// Rayleigh statistics at the forcing point: H_1/10 = 1.27 Hs, and the expected
// maximum of ~100 waves (about half an hour at 16.7 s) = 1.53 Hs. These arms
// ask where the bake puts the line for those waves on the same bed.
for (const mult of arg('h0mult', '1.27,1.53').split(',').map(Number).filter(Number.isFinite)) {
  H0_ARMS.push({ label: `set${mult.toFixed(2)}`, H0: HS * mult, mult,
                 note: `${mult} x Hs (Rayleigh: 1.27 = H_1/10, 1.53 = E[Hmax] of 100 waves)` });
}
const BED_ARMS = [{ bedShape: 0, label: 'reef' }, { bedShape: 1, label: 'plane' }, { bedShape: 2, label: 'measured' }];

// main.js bakes across [-STAGE_W/2, STAGE_W/2], STAGE_W = 600; 128 texels.
const X_RANGE = [-300, 300];
const BREAK_N = 128;
const xAtI = (i) => X_RANGE[0] + (X_RANGE[1] - X_RANGE[0]) * (i / (BREAK_N - 1));

const out = { generated: new Date().toISOString(), pose: { ...POSE, f_px, hfovDeg, levelRow, horizonRowMeasured: 313 },
              forcing: { Hs: HS, T, tide: TIDE, source: 'manifest.json conditions (SC116 10:00 PDT, 9413450 verified 11:12 PDT)' },
              h0Arms: H0_ARMS, presets: [] };

for (const key of PRESET_KEYS) {
  const preset = PRESETS[key];
  if (!preset) throw new Error(`unknown preset ${key}`);
  const spot = preset.geoSpot;
  const pr = PP_GEO_DATA.profiles[spot];
  if (!pr) throw new Error(`${key}: no geo profile`);
  const [cx, cz] = enuToStage(pr, POSE.enuM[0] - pr.stageOriginENU[0], POSE.enuM[1] - pr.stageOriginENU[1]);
  const groundNavd = bed.bedElevAt(spot, cx, cz);
  const eyeMsl = groundNavd - bed.MSL_ABOVE_NAVD88 + POSE.eyeH;     // lookoutStation(), metres MSL
  // What the app does with this day's H0 (main.js setDerivedH0): the floor
  // declines off its basis (T != basisT, tide outside tideBandM), and the
  // off-basis DISCLOSURE fires only when the request is under the tide-0 floor.
  const spec = PEEL_FLOOR[key] || null;
  const floor = peelFloorH0(key, { T, tideM: TIDE });
  const floorAtCardT = peelFloorH0(key, { T: preset.T, tideM: TIDE });
  const offBasis = spec !== null && floor === null && HS < spec.floorH0;
  const act = bed.reefActivationH0(spot, X_RANGE, { T, tide: TIDE });
  const entry = {
    preset: key, spot, cardT: preset.T, cardH0: preset.H0,
    stageBoundsM: pr.stageBoundsM,
    camera: { stageX: cx, stageZ: cz, groundNavd88M: groundNavd, eyeMslM: eyeMsl, eyeAboveWaterM: eyeMsl - TIDE },
    dayHandling: {
      peelFloorH0: floor, peelFloorH0AtCardT: floorAtCardT,
      floorSpec: spec ? { floorH0: spec.floorH0, basisT: spec.basisT, tideBandM: spec.tideBandM } : null,
      offBasisDisclosure: offBasis, appliedH0: HS,
      reefActivationH0: act ? act.H0 : null,
      note: floor === null
        ? 'peelFloorH0() null: T off basis and tide above tideBandM; raw H0 draws'
        : 'floor exists at this state',
    },
    arms: [],
  };
  for (const ha of H0_ARMS) for (const ba of BED_ARMS) {
    const opts = { H0: ha.H0, T, tide: TIDE, bedShape: ba.bedShape };   // main.js: no smoothM, no peel (flags off)
    const baked = bed.bakeBreakLine(spot, X_RANGE, opts);
    if (!baked) throw new Error(`${key}: bake returned null`);
    const cands = bed.breakCandidates(spot, X_RANGE, opts, 1);
    const stations = [];
    for (let i = 0; i < BREAK_N; i++) {
      const x = xAtI(i);
      const z = bed.breakZAt(x, X_RANGE[0], X_RANGE[1]);
      const gap = bed.breakGapAt(x, X_RANGE[0], X_RANGE[1]) ? 1 : 0;
      const c = cands.stations[i];
      const breaking = c && c.crossings.length > 0 ? 1 : 0;
      const [E, N] = stageToEnu(pr, x, z);
      const pj = project(eyeMsl, E, N);
      const depth = (bed.MSL_ABOVE_NAVD88 + TIDE) - bed.bedElevBlended(spot, x, z, ba.bedShape);
      // rounded to 2 dp: the asset directory has a size budget and 1 cm on a
      // line the DEM places to +-0.3 m is not information
      stations.push({ i, x: round2(x), z: round2(z), depthM: round2(depth), gap, breaking,
                      u: round2(pj.u), v: round2(pj.v), range: round2(pj.range), bearing: round2(pj.bearing),
                      inFrame: pj.inFrame ? 1 : 0,
                      inStage: x >= pr.stageBoundsM[0] && x <= pr.stageBoundsM[1] ? 1 : 0 });
    }
    // The model's takeoff: the up-point end of the stage window on the line
    // (the reef window opens at stageStart; the zipper starts there).
    const xTake = pr.stageBoundsM[0];
    const zTake = bed.breakZAt(xTake, X_RANGE[0], X_RANGE[1]);
    const [tE, tN] = stageToEnu(pr, xTake, zTake);
    const take = { x: xTake, z: zTake, ...project(eyeMsl, tE, tN) };
    const inF = stations.filter((s) => s.inFrame && !s.gap);
    entry.arms.push({
      h0Arm: ha.label, H0: ha.H0, bed: ba.label, bedShape: ba.bedShape,
      anchorX: cands.anchorX, anchorPick: cands.anchorPick,
      nInFrame: inF.length,
      rangeInFrame: inF.length ? [Math.min(...inF.map((s) => s.range)), Math.max(...inF.map((s) => s.range))] : null,
      takeoff: take, stations,
    });
  }
  // DEPTH UNDER THE PHOTOGRAPH. For a lattice of image pixels below the
  // horizon, the water-plane point each one sees, the bed there (shipped and
  // plane), and the deep-water H0 the criterion would need to break at that
  // depth: H0_needed = gamma*h / Ks(h), Ks from dispersion.js. This is what
  // says whether a photographed break the line misses is a wave-height error
  // or a bed error (VALIDATION_PLAN "Reading the outcome honestly").
  const grid = { colStep: 20, rowStep: 4, rows: [340, 520], cols: [0, POSE.width], cells: [] };
  const invert = (u, v) => {
    const a = (u - POSE.width / 2) / f_px, b = -(v - POSE.height / 2) / f_px;
    const ray = [F[0] + a * R[0] + b * U[0], F[1] + a * R[1] + b * U[1], F[2] + a * R[2] + b * U[2]];
    if (ray[2] >= -1e-9) return null;
    const t = -(eyeMsl - TIDE) / ray[2];
    return [POSE.enuM[0] + t * ray[0], POSE.enuM[1] + t * ray[1]];
  };
  const wl = bed.MSL_ABOVE_NAVD88 + TIDE;
  for (let v = grid.rows[0]; v < grid.rows[1]; v += grid.rowStep) {
    for (let u = grid.cols[0]; u < grid.cols[1]; u += grid.colStep) {
      const g = invert(u, v);
      if (!g) continue;
      const [x, z] = enuToStage(pr, g[0] - pr.stageOriginENU[0], g[1] - pr.stageOriginENU[1]);
      const dShip = wl - bed.bedElevBlended(spot, x, z, 0);
      const dPlane = wl - bed.bedElevBlended(spot, x, z, 1);
      const need = (d) => (d > 0.35 ? D.GAMMA * d / Ks(d) : null);
      grid.cells.push([u, v, round2(x), round2(z), round2(dShip), round2(dPlane), round2(need(dShip)), round2(need(dPlane))]);
    }
  }
  grid.columns = ['col', 'row', 'stageX', 'stageZ', 'depthShippedM', 'depthPlaneM', 'H0neededShipped', 'H0neededPlane'];
  entry.depthGrid = grid;
  // A preset whose bake never enters the frame keeps its summary rows and
  // drops the per-station and per-pixel payload: the asset directory has a
  // 1.5 MB budget and out-of-frame stations carry no residual.
  if (!entry.arms.some((a) => a.nInFrame > 0)) {
    for (const a of entry.arms) delete a.stations;
    delete entry.depthGrid;
    entry.note = 'no station of any arm projects into the frame; stations and depth grid omitted';
  } else if (out.presets.length) {
    // Secondary presets: in-frame stations only, and no depth grid (the grid
    // is a property of the frame, not the preset; the first preset carries it).
    for (const a of entry.arms) a.stations = a.stations.filter((s) => s.inFrame);
    delete entry.depthGrid;
    entry.note = 'secondary preset: only in-frame stations kept; depth grid on the first preset';
  }
  out.presets.push(entry);
}
function round2(v) { return v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100; }

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));

// ---------- report ----------
const r1 = (v) => (Number.isFinite(v) ? v.toFixed(1) : 'n/a');
console.log(`pose: f ${f_px.toFixed(1)} px, hfov ${hfovDeg.toFixed(2)} deg, level row ${levelRow.toFixed(1)} (photo horizon 313)`);
for (const ha of H0_ARMS) console.log(`H0 arm ${ha.label}: ${ha.H0.toFixed(3)} m${ha.KsAt ? ` (Ks ${ha.KsAt.toFixed(3)} at ${ha.depthM} m)` : ''}`);
for (const e of out.presets) {
  console.log(`\n${e.preset} (${e.spot}): camera stage (${r1(e.camera.stageX)}, ${r1(e.camera.stageZ)}), eye ${e.camera.eyeMslM.toFixed(2)} m MSL, `
    + `${e.camera.eyeAboveWaterM.toFixed(2)} m over the water; stage [${e.stageBoundsM}]`);
  console.log(`  floor at T=${T}, tide ${TIDE}: ${e.dayHandling.peelFloorH0} (spec floorH0 ${e.dayHandling.floorSpec?.floorH0}, `
    + `basisT ${e.dayHandling.floorSpec?.basisT}, band ${JSON.stringify(e.dayHandling.floorSpec?.tideBandM)}); `
    + `off-basis disclosure ${e.dayHandling.offBasisDisclosure}; reef activation H0 ${r1(e.dayHandling.reefActivationH0)} m`);
  console.log('  h0arm     bed       in-frame  range(m) at col 900 / 1150   takeoff x,z -> range,col,row');
  for (const a of e.arms) {
    const at = (col) => {
      const s = (a.stations || []).filter((q) => q.inFrame && !q.gap).sort((p, q) => p.u - q.u);
      for (let i = 1; i < s.length; i++) {
        const A = s[i - 1], B = s[i];
        if ((A.u - col) * (B.u - col) <= 0 && A.u !== B.u) {
          const t = (col - A.u) / (B.u - A.u);
          return A.range + t * (B.range - A.range);
        }
      }
      return NaN;
    };
    console.log(`  ${a.h0Arm.padEnd(9)} ${a.bed.padEnd(9)} ${String(a.nInFrame).padStart(4)}/128  ${r1(at(900)).padStart(6)} / ${r1(at(1150)).padStart(6)}`
      + `        ${r1(a.takeoff.x)},${r1(a.takeoff.z)} -> ${r1(a.takeoff.range)} m, col ${r1(a.takeoff.u)}, row ${r1(a.takeoff.v)}${a.takeoff.inFrame ? '' : ' (out of frame)'}`);
  }
}
console.log(`\nwrote ${OUT}`);
