// The model's break line for one real day, projected into the Lookout
// photograph — the computational half of scripts/measure_lookout_line.mjs,
// extracted 2026-09-24 (unchanged) so scripts/score_reef_fit.mjs can project
// a knob bake through the same pose and the same arms. The script keeps its
// argument parsing, its file write and its console report; this module holds
// the pose read, the projection and the per-preset arm loop, all
// parameterised on the bed module they read (never a twin, LESSONS 4).
//
// See the script's header for the pose sources, the frame conventions and the
// H0 arms. Nothing here changes the bake.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(HERE, '..', '..');

// docs/research/assets/pleasure-point-2026-09-05/cliff-cam-reference.jpg — the
// frame whose pose main.js `LOOKOUT` and the manifest both carry.
export const FRAME = 'cliff-cam-reference.jpg';
export const DEFAULT_FORCING = { HS: 0.902, T: 16.67, TIDE: 0.316 };   // SC116 10:00 PDT Hs / Tp; 9413450 verified tide
export const DEFAULT_DESHOAL = [15, 12];
export const DEFAULT_H0MULT = [1.27, 1.53];
export const DEG = Math.PI / 180;

// main.js bakes across [-STAGE_W/2, STAGE_W/2], STAGE_W = 600; 128 texels.
export const X_RANGE = [-300, 300];
export const BREAK_N = 128;
export const xAtI = (i) => X_RANGE[0] + (X_RANGE[1] - X_RANGE[0]) * (i / (BREAK_N - 1));

export function round2(v) { return v === null || !Number.isFinite(v) ? null : Math.round(v * 100) / 100; }

// ---------- the pose, from the app's two sources ----------
// Read from the manifest and main.js `const LOOKOUT = {...}`, never re-typed;
// the two are checked against each other rather than either trusted alone.
export function readLookoutPose(root = ROOT) {
  const manifest = JSON.parse(readFileSync(join(root, 'docs/research/assets/pleasure-point-2026-09-05/manifest.json'), 'utf8'));
  const frame = manifest.frames.find((f) => f.file === FRAME);
  if (!frame) throw new Error(`${FRAME} not in manifest`);
  const mainSrc = readFileSync(join(root, 'web-three/js/main.js'), 'utf8');
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
  for (const [k, mk] of [['headingDeg', 'headingDeg'], ['vfovDeg', 'vfovDeg']]) {
    const app = num(k);
    if (Math.abs(app - POSE[mk]) > 1e-6) throw new Error(`main.js LOOKOUT.${k} ${app} != manifest ${POSE[mk]}`);
  }
  const enuApp = lookoutBlock.match(/enuM:\s*\[\s*(-?[0-9.]+)\s*,\s*(-?[0-9.]+)\s*\]/);
  if (!enuApp || Math.abs(Number(enuApp[1]) - POSE.enuM[0]) > 1e-6 || Math.abs(Number(enuApp[2]) - POSE.enuM[1]) > 1e-6) {
    throw new Error('main.js LOOKOUT.enuM disagrees with the manifest');
  }
  return POSE;
}

// Camera basis in ENU (E, N, Up) for a pose: forward pitched down by pitchDeg;
// right is forward rotated clockwise in the horizontal plane; up = right x forward.
export function cameraOf(POSE) {
  const f_px = (POSE.height / 2) / Math.tan(POSE.vfovDeg / 2 * DEG);   // pinhole focal length, px
  const hfovDeg = 2 * Math.atan((POSE.width / 2) / f_px) / DEG;
  const h = POSE.headingDeg * DEG, p = POSE.pitchDeg * DEG;
  const F = [Math.cos(p) * Math.sin(h), Math.cos(p) * Math.cos(h), -Math.sin(p)];
  const R = [Math.cos(h), -Math.sin(h), 0];
  const U = [Math.sin(p) * Math.sin(h), Math.sin(p) * Math.cos(h), Math.cos(p)];
  // Horizon self-check (SCALE_AND_BROW §0): the level row, forward from the pose.
  const levelRow = POSE.height / 2 - f_px * Math.tan(p);
  return { f_px, hfovDeg, F, R, U, levelRow };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

// ---------- stage <-> ENU ----------
export function enuToStage(pr, dE, dN) {
  return [dE * pr.stageAlongENU[0] + dN * pr.stageAlongENU[1],
          dE * pr.stageShoreENU[0] + dN * pr.stageShoreENU[1]];
}
export function stageToEnu(pr, x, z) {
  return [pr.stageOriginENU[0] + x * pr.stageAlongENU[0] + z * pr.stageShoreENU[0],
          pr.stageOriginENU[1] + x * pr.stageAlongENU[1] + z * pr.stageShoreENU[1]];
}

// Project an ENU point on the water plane (elevation = tide, m MSL) into the frame.
export function projectPoint(POSE, cam, TIDE, eyeMslM, E, N) {
  const d = [E - POSE.enuM[0], N - POSE.enuM[1], TIDE - eyeMslM];
  const cf = dot(d, cam.F), cr = dot(d, cam.R), cu = dot(d, cam.U);
  const u = POSE.width / 2 + cam.f_px * cr / cf;
  const v = POSE.height / 2 - cam.f_px * cu / cf;
  const range = Math.hypot(d[0], d[1]);
  const bearing = ((Math.atan2(d[0], d[1]) / DEG) + 360) % 360;
  const inFrame = cf > 0 && u >= 0 && u < POSE.width && v >= 0 && v < POSE.height;
  return { u, v, range, bearing, inFrame };
}

// ---------- H0 arms ----------
export function h0ArmsFor(D, { HS, T, DESHOAL = DEFAULT_DESHOAL, H0MULT = DEFAULT_H0MULT }) {
  const Ks = (depthM) => D.shoaledHeight(1, T, depthM);   // the bake's own shoaling coefficient
  const H0_ARMS = [{ label: 'raw', H0: HS, note: 'SC116 waveHs used as deep-water H0, as #h0= and #day=live do' }];
  for (const dep of DESHOAL) {
    H0_ARMS.push({ label: `deshoal${dep}`, H0: HS / Ks(dep), KsAt: Ks(dep), depthM: dep,
                   note: `Hs / Ks(T=${T}, h=${dep} m) from dispersion.js shoaledHeight` });
  }
  // A photograph of a breaking wave samples the SET waves, not the significant
  // height: the waves that break furthest out are the largest of the group.
  // Rayleigh statistics at the forcing point: H_1/10 = 1.27 Hs, and the expected
  // maximum of ~100 waves (about half an hour at 16.7 s) = 1.53 Hs.
  for (const mult of H0MULT) {
    H0_ARMS.push({ label: `set${mult.toFixed(2)}`, H0: HS * mult, mult,
                   note: `${mult} x Hs (Rayleigh: 1.27 = H_1/10, 1.53 = E[Hmax] of 100 waves)` });
  }
  return H0_ARMS;
}
export const BED_ARMS = [{ bedShape: 0, label: 'reef' }, { bedShape: 1, label: 'plane' }, { bedShape: 2, label: 'measured' }];

// ---------- the whole projection, per preset ----------
// deps: { bed, PRESETS, PEEL_FLOOR, peelFloorH0, PP_GEO_DATA, D } — the modules
// the caller imported through its own hooks (bed source, three).
export function lookoutModelLines(deps, { presetKeys, HS = DEFAULT_FORCING.HS, T = DEFAULT_FORCING.T, TIDE = DEFAULT_FORCING.TIDE,
                                          DESHOAL = DEFAULT_DESHOAL, H0MULT = DEFAULT_H0MULT, POSE = readLookoutPose() } = {}) {
  const { bed, PRESETS, PEEL_FLOOR, peelFloorH0, PP_GEO_DATA, D } = deps;
  for (const [k, v] of Object.entries({ HS, T, TIDE })) {
    if (!Number.isFinite(v)) throw new Error(`${k} is not finite`);
  }
  const cam = cameraOf(POSE);
  const Ks = (depthM) => D.shoaledHeight(1, T, depthM);
  const H0_ARMS = h0ArmsFor(D, { HS, T, DESHOAL, H0MULT });
  const project = (eyeMslM, E, N) => projectPoint(POSE, cam, TIDE, eyeMslM, E, N);

  const out = { generated: new Date().toISOString(), pose: { ...POSE, f_px: cam.f_px, hfovDeg: cam.hfovDeg, levelRow: cam.levelRow, horizonRowMeasured: 313 },
                forcing: { Hs: HS, T, tide: TIDE, source: 'manifest.json conditions (SC116 10:00 PDT, 9413450 verified 11:12 PDT)' },
                h0Arms: H0_ARMS, presets: [] };

  for (const key of presetKeys) {
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
      const a = (u - POSE.width / 2) / cam.f_px, b = -(v - POSE.height / 2) / cam.f_px;
      const ray = [cam.F[0] + a * cam.R[0] + b * cam.U[0], cam.F[1] + a * cam.R[1] + b * cam.U[1], cam.F[2] + a * cam.R[2] + b * cam.U[2]];
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
  return out;
}

// ---------- the residual against the photographed locus ----------
// A port of scripts/measure_lookout_locus.py residual_for(): model minus photo
// at each photo point's image column, against the height-corrected photo
// position (the model line is on the water plane). The photo points are the
// observation side recorded in locus-measured.json (2 dp), so a residual
// re-formed here can differ from residual.json by the rounding of those
// points (<= 0.01 m on a median); the python is the record, this is the
// scorecard's reader of it.
export const RESIDUAL_FEATURES = ['whitewater_edge_wave_a', 'whitewater_edge_wave_b', 'crest_wave_a', 'crest_wave_b', 'lineup_cluster'];
export function modelLineAtCol(arm, col) {
  const st = arm.stations.filter((s) => s.inFrame && !s.gap).sort((a, b) => a.u - b.u);
  for (let i = 1; i < st.length; i++) {
    const a = st[i - 1], b = st[i];
    if ((a.u - col) * (b.u - col) <= 0 && a.u !== b.u) {
      const t = (col - a.u) / (b.u - a.u);
      return { v: a.v + t * (b.v - a.v), range: a.range + t * (b.range - a.range), x: a.x + t * (b.x - a.x), z: a.z + t * (b.z - a.z) };
    }
  }
  return null;
}
// numpy median: the mean of the two middle values when even
export function npMedian(v) {
  const s = v.filter(Number.isFinite).sort((a, b) => a - b);
  if (!s.length) return NaN;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : 0.5 * (s[m - 1] + s[m]);
}
export function residualFor(arm, featurePts, spotKey = '38th') {
  const out = [];
  for (const rec of featurePts) {
    const m = modelLineAtCol(arm, rec.col);
    if (m === null) continue;
    const [px, pz] = rec[`stage_${spotKey}_hc`];
    out.push({ col: rec.col, d_range: m.range - rec.range_hc, d_row: m.v - rec.row, d_x: m.x - px, d_z: m.z - pz,
               model_range: m.range, photo_range: rec.range_hc });
  }
  return out;
}
export function residualSummary(arm, measured, spotKey = '38th') {
  const features = {};
  for (const k of RESIDUAL_FEATURES) {
    const r = residualFor(arm, measured.features[k].points, spotKey);
    features[k] = { n: r.length, d_range_median: round2(npMedian(r.map((q) => q.d_range))),
                    d_range_min: r.length ? round2(Math.min(...r.map((q) => q.d_range))) : null,
                    d_range_max: r.length ? round2(Math.max(...r.map((q) => q.d_range))) : null,
                    d_z_median: round2(npMedian(r.map((q) => q.d_z))), d_x_median: round2(npMedian(r.map((q) => q.d_x))),
                    d_row_median: round2(npMedian(r.map((q) => q.d_row))),
                    model_range_median: round2(npMedian(r.map((q) => q.model_range))),
                    photo_range_median: round2(npMedian(r.map((q) => q.photo_range))) };
  }
  return { h0Arm: arm.h0Arm, H0: round2(arm.H0), bed: arm.bed, features };
}
