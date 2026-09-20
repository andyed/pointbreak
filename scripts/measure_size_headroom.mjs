// Is the ~1.5x H0 headroom perceptually flat?
//
// GAME_PROJECTION_2026-09-19 0.2 measured, per spot, the depth under the baked
// break line at the card state and called gamma*h there "the depth-limited
// breaking ceiling" -- 1.43-1.66x each spot's card H0. C3 reading (1) proposes
// running the spots nearer that ceiling as a free, real change, and "What would
// falsify this plan" says: if Sewers at 3.0 does not read bigger than Sewers at
// 2.2, the 1.5x is a number without a sensation.
//
// This instrument sweeps H0 from each card value past that number and reports
// the quantities that would make a wave READ as bigger. It is offline and
// numerical: no renderer, no capture. (VISUAL_CAPTURE's rule -- headless
// Chromium parks rAF when occluded, so a screenshot of an animated field is
// frozen -- is why the question is settled on numbers first.)
//
// WHAT IS MEASURED, per (spot, H0), at tide 0 and card T:
//
//   1. BREAKING HEIGHT AT THE LINE. Hb = min(H0*shelter*Ks(h), gamma*h)
//      evaluated at the depth under the SHIPPED baked line, station by station
//      across the spot's stage bounds. Not the offshore H0. If this saturates,
//      nothing downstream can grow.
//   2. WHERE THE LINE IS. Median z of the baked line, its shift from the card
//      state, the depth under it, and bed.js depthBreakOffset (including how
//      often that hits its own +160 m clamp).
//   3. BROKEN AREA. From the bake's own excess field: the area inside the
//      stage x-range where F = H_eff*Ks - gamma*h >= 0, its fraction of the wet
//      stage, and the surf-zone width (line -> last breaking z).
//   4. FACE STEEPNESS. bed.js iribarrenMeasured (the shipped readout, on the
//      plane-fit slope and the OFFSHORE H0) alongside a local xi built on the
//      bed slope AT the line and the height the line actually breaks at.
//   5. WHICH CLAMP BINDS FIRST. Every candidate is evaluated per station, and
//      the first H0 on the ladder at which each one binds on the median station
//      is reported. The clamp CONSTANTS are read out of the shipped sources by
//      regex (pinConstants below) rather than retyped, so a drift fails loudly
//      instead of producing a twin.
//
// Apparent size is reported too, because "reads as bigger" is an ON SCREEN
// claim and the line moves seaward as H0 rises. Two camera classes, both from
// main.js literals: the aim-following shots (Lineup, Cover, Drone) hold a FIXED
// standoff from the baked line, so their subtended height tracks Hb exactly;
// the fixed-station shots (Free) do not, so their range grows with the shift.
//
// WHAT IS DECLARED RATHER THAN MEASURED. Two things, both stated here:
//   H0_MULTS   the ladder of H0 multiples, as multiples of each spot's card H0
//              so every spot is swept over the same relative range.
//   CREST_FRAC 0.8 -- the share of the breaking height that sits ABOVE still
//              water. Not invented here: it is breakerCeilM's own leading
//              factor (model-glsl.js), pinned from source below, and it is what
//              turns a breaking height into the face height the hM cap clamps.
// Everything else is read from the shipped code.
//
// THE GATE (MEASUREMENT_LESSONS 4). Three checks, run at EVERY rung of every
// sweep, not once:
//   G1  the excess field this script sweeps equals bed.js breakExcessProfile
//       on the same lattice (max abs difference, must be 0).
//   G2  the line selection replica equals the SHIPPED bake read back through
//       breakZAt on the stage grid (max abs dz, must be 0).
//   G3  NEW, and the one that certifies the quantity this script exists to
//       report -- the DEPTH UNDER THE LINE, from which every number above is
//       built. At every texel where the line is a true interpolated crossing
//       (not slew-clamped, not a fallback, not gapped), the shipped residual
//       shoaledHeight(H0*shelter, T, h) - gamma*h is recomputed at h = the depth
//       this script reads under the line. It must be under G3_REL of gamma*h at
//       that station: the depth read under the line satisfies the shipped break
//       criterion, within a two-term bound, both terms DERIVED:
//         max( |dF/dz| * MARCH_DZ ,  G3_REL * gamma*h )
//       The first term is the march's own resolution: the crossing is found by
//       linear interpolation inside one bracketing lattice interval, so it
//       cannot be more than MARCH_DZ off, and at a steep station that step is
//       worth |dF/dz|*MARCH_DZ of excess. The second is a floor for flat
//       stations, where |dF/dz| is legitimately near zero and the first term
//       collapses to nothing (MEASUREMENT_LESSONS 13: check the denominator's
//       domain, not just its value).
//       Two earlier forms were tried and are recorded because they failed for
//       instructive reasons: a pure curvature bound |F''|*dz^2/8 under-reads by
//       up to 6x, because F's slope KINKS at the depth grid's own ~7 m cell
//       boundaries and a second difference on the 2 m lattice cannot see a
//       sub-lattice kink; and a pure relative bound flags steep stations, where
//       25 mm of excess is a quarter of a march step and entirely expected.
//       The run PRINTS the measured margin and the negative control's bite, so
//       neither is taken on trust.
//   G3-NC  the NEGATIVE CONTROL for G3, because a gate with no teeth passes
//       everything. The same residual is recomputed with the depth taken at
//       tide + G3_PROBE_M, i.e. deliberately reading the bed the bake did NOT
//       use, and G3 is REQUIRED TO FAIL on it. If the perturbed run also passes,
//       G3 is not measuring what it claims and the whole run exits 1.
// A failure of any of these exits 1.
//
// Headless, Node only. measure_break_activation.mjs is imported first because
// its module body installs the `three` resolve hook and picks the bed source
// before bed.js loads; --bed and --map-privates therefore work here unchanged.
//
// Usage:
//   node scripts/measure_size_headroom.mjs                 # everything
//   node scripts/measure_size_headroom.mjs --preset=sewers
//   node scripts/measure_size_headroom.mjs --mode=sweep|clamps|xi|apparent|all
//   --tide=<m>  --out=qa/size-headroom  --json
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// MUST be first: installs the resolve hook / bed source that bed.js needs.
const R = await import('./measure_break_activation.mjs');
const bed = await import('../web-three/js/bed.js');
const D = await import('../web-three/js/dispersion.js');
const { PRESETS } = await import('../shared/params.js');
const { PP_DEPTH_DATA } = await import('../data/model/pp_depth_patches.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const [X0, X1] = R.X_RANGE;
const { GAMMA, G } = D;

// ---------- declared parameters (the only two) ----------
// Multiples of each spot's card H0. 1.43-1.66 is the projection's own ceiling
// ratio, so the ladder straddles it and runs to 5x to find where saturation
// actually bites rather than assuming it bites at the ceiling.
export const H0_MULTS = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0, 2.5, 3.0, 4.0, 5.0];
// Share of the breaking height above still water. breakerCeilM's own factor,
// pinned from source below; named here because it is what converts Hb into the
// face height that hM clamps.
export const CREST_FRAC_NAME = 'breakerCeilM leading factor';
// Half-stencil for the LOCAL bed slope under the line, metres. Declared, and
// declared wide: at +/-10 m the measured bed's own roughness dominates and the
// local xi jitters by 30% rung to rung. 25 m is about a quarter of the 90 m
// locus smoothing length the renderer already applies to the break line, so it
// is the scale at which "the slope the face is on" is a meaningful quantity.
export const SLOPE_STENCIL_M = 25;
// G3's bound: the residual of the shipped break criterion at the depth this
// script reads under the line, as a fraction of gamma*h at that station.
export const G3_REL = 0.01;
// G3's negative control: the tide error the gate must REFUSE, metres. Chosen at
// the scale of a real mistake (reading the wrong tide step), not at the scale of
// the noise -- if the gate cannot see 0.1 m of water it cannot see anything.
export const G3_PROBE_M = 0.1;

// ---------- clamp constants, READ FROM THE SHIPPED SOURCES ----------
// Retyping a constant makes a twin (MEASUREMENT_LESSONS 4). Each of these is
// extracted from the file that owns it; a miss throws, so a rename or a retune
// fails this instrument loudly instead of being silently measured against a
// stale number.
function pin(file, re, label, group = 1) {
  const src = readFileSync(join(ROOT, file), 'utf8');
  const m = src.match(re);
  if (!m) throw new Error(`pinConstants: ${label} not found in ${file} — the shipped source moved; fix the regex, do not retype the number`);
  return { value: Number(m[group]), file, label };
}
export function pinConstants() {
  return {
    // dispersion.js shoaledHeight: Green's-law Ks clamp
    ksLo: pin('web-three/js/dispersion.js', /Math\.min\(Math\.max\(Math\.sqrt\(cg0 \/ cg\), ([\d.]+)\), [\d.]+\)/, 'Ks floor'),
    ksHi: pin('web-three/js/dispersion.js', /Math\.min\(Math\.max\(Math\.sqrt\(cg0 \/ cg\), [\d.]+\), ([\d.]+)\)/, 'Ks ceiling'),
    // model-glsl.js breakerCeilM: displayed crest ceiling + the 0.8 above-SWL share
    crestFrac:  pin('shared/model-glsl.js', /return clamp\(([\d.]+)\*VIS\*min\(u_H0\*Ks, GAMMA\*dep\), [\d.]+, [\d.]+\);/, 'breakerCeilM above-SWL share'),
    ceilDispHi: pin('shared/model-glsl.js', /return clamp\([\d.]+\*VIS\*min\(u_H0\*Ks, GAMMA\*dep\), [\d.]+, ([\d.]+)\);/, 'breakerCeilM displayed ceiling'),
    // shaders.js choppyPos: physical face-height cap feeding the lip throw
    hmCap: pin('web-three/js/shaders.js', /float hM = clamp\(h \/ VIS, 0\.0, ([\d.]+)\);/, 'hM face cap'),
    // shaders.js choppyPos: the size gate on the fold (u_sGrow = 0 = shipped)
    sizeGate: pin('web-three/js/shaders.js', /float sizeGate = mix\(1\.0, clamp\(excessQ, 0\.0, mix\(([\d.]+), [\d.]+, u_sGrow\)\), u_depthMix\);/, 'sizeGate cap'),
    // model-glsl.js ocean(): the skew clamp and its gain at u_pitchOdd = 0
    skewGain: pin('shared/model-glsl.js', /float skewGain = mix\(([\d.]+), [\d.]+, u_pitchOdd\);/, 'skew gain (pitchOdd 0)'),
    skewCap:  pin('shared/model-glsl.js', /float skew   = mix\(0\.0, clamp\(excess\*skewGain, 0\.0, ([\d.]+)\), u_depthMix\);/, 'skew cap'),
    // bed.js depthBreakOffset: the shoreward/seaward rider-shift clamp
    offsetHi: pin('web-three/js/bed.js', /return Math\.min\(Math\.max\(breakLineZ - z, -\d+\), (\d+)\);/, 'depthBreakOffset seaward clamp'),
    offsetLo: pin('web-three/js/bed.js', /return Math\.min\(Math\.max\(breakLineZ - z, -(\d+)\), \d+\);/, 'depthBreakOffset shoreward clamp'),
    // shared/params.js / main.js: the H0 the UI can actually ask for
    h0Slider: pin('shared/params.js', /key: 'H0',\s*label: '[^']*',\s*min: [\d.]+,\s*max: ([\d.]+),/, 'H0 slider max'),
    // main.js: viewing exaggeration, and the two camera classes
    vis:      pin('web-three/js/main.js', /u_vis:\s*\{ value: ([\d.]+) \}/, 'VIS'),
    coverStandoff: pin('web-three/js/main.js', /const COVER_STANDOFF_M = ([\d.]+);/, 'Cover standoff'),
    coverEye:      pin('web-three/js/main.js', /const COVER_EYE_M = ([\d.]+);/, 'Cover eye height'),
    stageZ0:  pin('web-three/js/main.js', /const STAGE_W = \d+, STAGE_D = \d+, STAGE_Z0 = (\d+);/, 'stage shoreward edge'),
    stageD:   pin('web-three/js/main.js', /const STAGE_W = \d+, STAGE_D = (\d+), STAGE_Z0 = \d+;/, 'stage depth'),
  };
}
export const K = pinConstants();
// Lineup's rig, from its CAM_PRESETS closure literals (main.js): the camera sits
// (+35, 8.5, -30) off the aim point and looks at (0, 4.0, +2) off it, so the eye
// -> aim distance is a CONSTANT no matter where the aim point is.
const LINEUP_STANDOFF_M = Math.hypot(35, 8.5 - 4.0, -32);
const COVER_STANDOFF_3D_M = Math.hypot(K.coverStandoff.value, K.coverEye.value,
                                       K.coverStandoff.value * 0.55);
const FREE_CAM = [-140, 55, -230];   // main.js CAM_PRESETS 'Free' pos()

// ---------- small helpers ----------
const fmt = (v, d = 2) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const quant = (v, p) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : NaN; };
function mdTable(headers, rows) {
  const out = [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`];
  for (const r of rows) out.push(`| ${r.join(' | ')} |`);
  return out.join('\n');
}
const arg = (name, dflt = null) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : dflt;
};
const num = (name, dflt) => { const v = arg(name); return v === null ? dflt : Number(v); };

// ---------- one (spot, H0) state ----------
// basis is H0-independent at fixed (T, tide) — fieldBasis's own contract — so
// the whole ladder for a spot is one basis and a multiply per cell.
const basisCache = new Map();
function basisFor(key, T, tide) {
  const ck = `${key}|${T}|${tide}`;
  if (!basisCache.has(ck)) basisCache.set(ck, R.fieldBasis(key, { T, tide }));
  return basisCache.get(ck);
}

export function measureState(key, state) {
  const spot = R.spotOf(key);
  const { H0, T, tide } = state;
  const basis = basisFor(key, T, tide);
  const field = R.fieldFor(basis, H0);
  const fit = bed.reefFitFor(spot);
  if (!fit) throw new Error(`${key}: no reef fit`);
  const sel = R.selectShipped(basis, field, fit);
  const real = R.bakeReal(key, state);          // the SHIPPED bake, read back
  const wl = bed.MSL_ABOVE_NAVD88 + tide;
  const L0 = G * T * T / (2 * Math.PI);
  const stage = R.stageOf(key);
  const dxTex = (X1 - X0) / (R.BREAK_N - 1);

  // ---- G1: the field IS bed.js's own excess profile on the same lattice ----
  let g1 = 0, latticeMismatch = 0;
  for (let i = 0; i < R.BREAK_N; i++) {
    const prof = bed.breakExcessProfile(spot, R.stationX(i), R.shippedOpts(state));
    if (prof.zs.length !== basis.stations[i].zs.length) { latticeMismatch++; continue; }
    g1 = Math.max(g1, R.maxAbsDiff(prof.fs, field.F[i]));
  }
  // ---- G2: the replica IS the shipped bake on the readback grid ----
  const zRep = real.xs.map((x) => R.lineAt(sel.z, x));
  const g2 = R.maxAbsDiff(zRep, real.z);

  // ---- G3: the depth read under the line satisfies the shipped criterion ----
  // Only at texels where the line is a true interpolated crossing: slew-clamped
  // and fallback stations are NOT crossings and would fail by construction.
  let g3Checked = 0, g3Fails = 0, g3Pinned = 0, g3NcFails = 0, edgeBreak = 0;
  const g3Rel = [], g3NcRel = [];
  for (let i = 0; i < R.BREAK_N; i++) {
    const s = basis.stations[i];
    // EXCLUDED, and counted: markBreakCrossings' "breaking from the first step"
    // branch records the seaward march start z0 as a crossing when the wave is
    // ALREADY breaking at the edge of the depth grid. That is not an
    // interpolated zero — F there is positive, by tenths of gamma*h — so it
    // would fail G3 by construction. It is also the saturation mechanism this
    // instrument is looking for, so it is reported (clamps.edgeBreak) rather
    // than merely skipped.
    const atGridEdge = sel.z[i] <= s.zs[0] + 1e-6;
    if (atGridEdge) edgeBreak++;
    const trueCrossing = sel.onsets[i].crossings.length > 0 && sel.raw[i] === sel.z[i]
      && sel.gap[i] === 0 && !atGridEdge;
    if (!trueCrossing) { g3Pinned++; continue; }
    const z = sel.z[i];
    const F = field.F[i];
    const j = Math.min(Math.max(Math.round((z - s.zs[0]) / R.MARCH_DZ), 1), F.length - 2);
    const d1 = Math.abs(F[j + 1] - F[j - 1]) / (2 * R.MARCH_DZ);
    const residAt = (waterLevel) => {
      const h = waterLevel - bed.bedElevBlended(spot, s.x, z, 0);
      const abs = Math.abs(D.shoaledHeight(H0 * s.shelter, T, h) - GAMMA * h);
      const tol = Math.max(d1 * R.MARCH_DZ, G3_REL * GAMMA * Math.max(h, 1e-9));
      return abs / tol;                       // 1.0 = exactly at the bound
    };
    const rel = residAt(wl);
    g3Checked++; g3Rel.push(rel);
    if (!(rel <= 1)) g3Fails++;
    // negative control: the bed the bake did NOT use
    const relNc = residAt(wl + G3_PROBE_M);
    g3NcRel.push(relNc);
    if (!(relNc <= 1)) g3NcFails++;
  }

  // ---- 1/2/4: per-station quantities on the stage grid ----
  const rows = [];
  for (let n = 0; n < real.xs.length; n++) {
    const x = real.xs[n], z = real.z[n];
    const shelter = bed.getShelter() ? D.shelterFactor(x) : 1;
    const eff = H0 * shelter;
    const h = wl - bed.bedElevBlended(spot, x, z, 0);
    const Ks = D.shoaledHeight(1, T, Math.max(h, 0.05));           // shipped Ks, via shoaledHeight(1,...)
    const Hb = D.heightAt(eff, T, Math.max(h, 0.05));              // min(H0*Ks, gamma*h), SHIPPED
    const gh = GAMMA * Math.max(h, 0.05);
    const excessQ = (eff * Ks) / Math.max(gh, 0.05);               // shaders.js excessQ, at the line
    // local bed slope in z at the line, +/- 10 m — the slope the face is on
    const eA = bed.bedElevBlended(spot, x, z - SLOPE_STENCIL_M, 0);
    const eB = bed.bedElevBlended(spot, x, z + SLOPE_STENCIL_M, 0);
    const tanBloc = Math.abs((eB - eA) / (2 * SLOPE_STENCIL_M));
    const off = bed.depthBreakOffset(spot, x, z, { H0, T, tide, bedShape: 0 });
    // the drawn crest, in displayed metres, by breakerCeilM's own formula
    const ceilDisp = Math.min(Math.max(K.crestFrac.value * K.vis.value * Math.min(eff * Ks, gh), 0.5), K.ceilDispHi.value);
    rows.push({ x, z, h, Ks, Hb, gh, excessQ, tanBloc, off,
                faceM: K.crestFrac.value * Hb, ceilDisp,
                ceilDispClamped: K.crestFrac.value * K.vis.value * Math.min(eff * Ks, gh) > K.ceilDispHi.value,
                offClampedHi: Math.abs(off - K.offsetHi.value) < 1e-6,
                offClampedLo: Math.abs(off + K.offsetLo.value) < 1e-6,
                gap: !!real.gap[n] });
  }

  // ---- 3: broken area and surf-zone width, from the bake's own field ----
  let brokenM2 = 0, wetM2 = 0;
  const widths = [];
  for (let i = 0; i < R.BREAK_N; i++) {
    const s = basis.stations[i];
    if (s.x < stage.start || s.x > stage.end) continue;
    const F = field.F[i], zs = s.zs;
    wetM2 += zs.length * R.MARCH_DZ * dxTex;
    // exact positive-set length on the piecewise-linear F
    let len = 0, lastPos = null, firstPos = null;
    for (let j = 0; j + 1 < zs.length; j++) {
      const fa = F[j], fb = F[j + 1];
      if (fa >= 0 && fb >= 0) len += R.MARCH_DZ;
      else if (fa >= 0 || fb >= 0) len += R.MARCH_DZ * Math.abs(fa >= 0 ? fa : fb) / Math.max(Math.abs(fa - fb), 1e-12);
      if (fa >= 0) { if (firstPos === null) firstPos = zs[j]; lastPos = zs[j]; }
    }
    if (F[zs.length - 1] >= 0) lastPos = zs[zs.length - 1];
    brokenM2 += len * dxTex;
    if (firstPos !== null && lastPos !== null) widths.push(lastPos - firstPos);
  }

  // ---- 4: Iribarren ----
  const xiShipped = bed.iribarrenMeasured(spot, { H0, T });     // plane-fit slope, OFFSHORE H0
  const HbMed = median(rows.map((r) => r.Hb));
  const tanBlocMed = median(rows.map((r) => r.tanBloc));
  const xiLocal = tanBlocMed / Math.sqrt(Math.max(HbMed, 1e-6) / L0);

  // ---- 5: clamp bindings, as a fraction of live stage stations ----
  const nSt = rows.length;
  const frac = (p) => rows.filter(p).length / Math.max(nSt, 1);
  const clamps = {
    ksHi:       frac((r) => r.Ks >= K.ksHi.value - 1e-9),
    ksLo:       frac((r) => r.Ks <= K.ksLo.value + 1e-9),
    hmCap:      frac((r) => r.faceM > K.hmCap.value),
    ceilDisp:   frac((r) => r.ceilDispClamped),
    skewCap:    frac((r) => r.excessQ * K.skewGain.value > K.skewCap.value),
    sizeGate:   frac((r) => r.excessQ > K.sizeGate.value),
    offsetHi:   frac((r) => r.offClampedHi),
    offsetLo:   frac((r) => r.offClampedLo),
    offStage:   frac((r) => r.z < K.stageZ0.value - K.stageD.value),
    offGrid:    frac((r) => r.z <= PP_DEPTH_DATA.grid.z0 + R.MARCH_DZ),
    edgeBreak:  edgeBreak / R.BREAK_N,
    h0Slider:   H0 > K.h0Slider.value ? 1 : 0,
  };

  // ---- apparent size: the two camera classes ----
  const xc = 0.5 * (stage.lo + stage.hi);
  const zc = median(rows.map((r) => r.z));
  const ceilMed = median(rows.map((r) => r.ceilDisp));
  const subtend = (dist) => 2 * Math.atan(0.5 * ceilMed / Math.max(dist, 1e-6)) * 180 / Math.PI;
  const freeRange = Math.hypot(FREE_CAM[0] - xc, FREE_CAM[1], FREE_CAM[2] - zc);

  return {
    key, spot, state,
    stations: nSt,
    gapFrac: rows.filter((r) => r.gap).length / Math.max(nSt, 1),
    // 1. breaking height at the line
    HbMedian: HbMed, HbP90: quant(rows.map((r) => r.Hb), 0.9), HbMax: Math.max(...rows.map((r) => r.Hb)),
    HbOverH0: HbMed / H0,
    // 2. where the line is
    zMedian: zc, depthMedian: median(rows.map((r) => r.h)), depthP90: quant(rows.map((r) => r.h), 0.9),
    offMedian: median(rows.map((r) => r.off)), offMax: Math.max(...rows.map((r) => r.off)),
    KsMedian: median(rows.map((r) => r.Ks)),
    excessQMedian: median(rows.map((r) => r.excessQ)),
    // 3. broken area
    brokenM2, wetM2, brokenFrac: wetM2 > 0 ? brokenM2 / wetM2 : NaN,
    surfWidthMedian: median(widths),
    // 4. steepness
    xiShipped, xiLocal, tanBlocMed, xiAuthored: PRESETS[key].xi,
    // 5. clamps
    clamps,
    // apparent size
    ceilDispMedian: ceilMed,
    subtendLineupDeg: subtend(LINEUP_STANDOFF_M),
    subtendCoverDeg: subtend(COVER_STANDOFF_3D_M),
    subtendFreeDeg: subtend(freeRange), freeRangeM: freeRange,
    gate: { g1, latticeMismatch, g2, g3Checked, g3Fails, g3Pinned, g3NcFails,
            g3RelP99: quant(g3Rel, 0.99), g3RelMax: g3Rel.length ? Math.max(...g3Rel) : 0,
            g3NcRelMedian: median(g3NcRel) },
  };
}

// The ladder for a spot: card H0 times H0_MULTS, plus the projection's own
// "ceiling" (gamma * median depth under the CARD line) as an explicit rung, plus
// the H0 slider maximum if it falls inside the range.
export function ladderFor(key, cardCeilM) {
  const H0 = PRESETS[key].H0;
  const v = new Set(H0_MULTS.map((m) => +(H0 * m).toFixed(3)));
  if (Number.isFinite(cardCeilM)) v.add(+cardCeilM.toFixed(3));
  if (K.h0Slider.value > H0 && K.h0Slider.value < H0 * 5) v.add(K.h0Slider.value);
  return [...v].sort((a, b) => a - b);
}

// First rung at which a clamp binds on more than `thresh` of the stage.
function firstBind(sweep, name, thresh = 0.5) {
  const hit = sweep.find((s) => s.clamps[name] > thresh);
  return hit ? hit.state.H0 : null;
}

// ---------- main ----------
async function main() {
  const mode = arg('mode', 'all');
  const only = arg('preset');
  const presets = only ? [only] : R.MAPPED;
  const tide = num('tide', 0);
  const outDir = join(ROOT, arg('out', 'qa/size-headroom'));
  const summary = {
    generated: new Date().toISOString(),
    bedSource: R.BED_SOURCE || 'shipped',
    question: 'GAME_PROJECTION 0.2 / C3(1): is the ~1.5x H0 headroom perceptually flat?',
    declared: { H0_MULTS, CREST_FRAC_NAME, SLOPE_STENCIL_M, tide },
    pinned: Object.fromEntries(Object.entries(K).map(([k, v]) => [k, { value: v.value, file: v.file, label: v.label }])),
    standoffs: { lineupM: LINEUP_STANDOFF_M, coverM: COVER_STANDOFF_3D_M, freeCam: FREE_CAM },
    spots: {},
  };
  const gate = { g1: 0, g2: 0, g3Checked: 0, g3Fails: 0, g3NcFails: 0,
                 g3RelMax: 0, g3RelP99: 0, g3NcRelMedian: 0,
                 bound: G3_REL, probeM: G3_PROBE_M, latticeMismatch: 0, states: 0 };
  const track = (s) => {
    gate.g1 = Math.max(gate.g1, s.gate.g1); gate.g2 = Math.max(gate.g2, s.gate.g2);
    gate.g3Checked += s.gate.g3Checked; gate.g3Fails += s.gate.g3Fails;
    gate.g3RelMax = Math.max(gate.g3RelMax, s.gate.g3RelMax);
    gate.g3RelP99 = Math.max(gate.g3RelP99, s.gate.g3RelP99);
    gate.g3NcFails += s.gate.g3NcFails;
    gate.g3NcRelMedian = Math.max(gate.g3NcRelMedian, s.gate.g3NcRelMedian);
    gate.latticeMismatch += s.gate.latticeMismatch; gate.states++;
    return s;
  };

  const sweeps = {};
  for (const key of presets) {
    const T = PRESETS[key].T, H0card = PRESETS[key].H0;
    const card = track(measureState(key, { H0: H0card, T, tide }));
    const ceil = GAMMA * card.depthMedian;     // the projection's 0.2 "ceiling", re-derived here
    sweeps[key] = { card, ceilM: ceil, ceilRatio: ceil / H0card,
                    rungs: ladderFor(key, ceil).map((H0) => track(measureState(key, { H0, T, tide }))) };
  }

  // ---------- 0. the headline ----------
  console.log(`\n# Is the ~1.5x H0 headroom flat?  (tide ${tide.toFixed(2)} m, card T, ${presets.length} spots)\n`);
  console.log(`GAME_PROJECTION 0.2's "ceiling" column is gamma x the depth under the CARD line.`);
  console.log(`That number is re-derived here, and then the line is allowed to MOVE.\n`);
  console.log(mdTable(['spot', 'card H0', '0.2 ceiling gamma*h', 'ratio',
                       'Hb at card', 'Hb at ceiling H0', 'Hb at H0 3.0', 'dlnHb/dlnH0 card→ceil', 'verdict'],
    presets.map((k) => {
      const s = sweeps[k];
      const at = (h0) => s.rungs.reduce((b, r) => Math.abs(r.state.H0 - h0) < Math.abs(b.state.H0 - h0) ? r : b);
      const a = s.card, b = at(s.ceilM);
      const slope = Math.log(b.HbMedian / a.HbMedian) / Math.log(b.state.H0 / a.state.H0);
      return [PRESETS[k].label, fmt(PRESETS[k].H0, 2), fmt(s.ceilM, 2), fmt(s.ceilRatio, 2),
              fmt(a.HbMedian, 2), fmt(b.HbMedian, 2), fmt(at(3.0).HbMedian, 2), fmt(slope, 2),
              slope > 0.8 ? 'NOT flat' : slope > 0.3 ? 'partial' : 'FLAT'];
    })));
  console.log(`\nSlope 1.0 = the breaking height at the line grows in exact proportion to H0.`);
  console.log(`Slope 0 = flat: the depth cap holds the wave at the same size however big the swell.`);

  // ---------- 1-3. the sweep ----------
  if (mode === 'sweep' || mode === 'all') {
    for (const k of presets) {
      const s = sweeps[k];
      console.log(`\n## ${PRESETS[k].label} — H0 ladder, tide ${tide.toFixed(2)}, T ${PRESETS[k].T} s`);
      console.log(`card H0 ${PRESETS[k].H0} m · 0.2 ceiling ${fmt(s.ceilM, 2)} m · slider max ${K.h0Slider.value} m\n`);
      console.log(mdTable(['H0 m', 'Hb med m', 'Hb/H0', 'h under line m', 'z line m', 'shift m',
                           'depthOff m', 'crest disp m', 'broken m²', 'broken frac', 'surf width m',
                           'gap frac', 'xi shipped', 'xi local', 'Lineup °', 'Free °'],
        s.rungs.map((r) => [fmt(r.state.H0, 2), fmt(r.HbMedian, 2), fmt(r.HbOverH0, 2),
          fmt(r.depthMedian, 2), fmt(r.zMedian, 1), fmt(r.zMedian - s.card.zMedian, 1),
          fmt(r.offMedian, 1), fmt(r.ceilDispMedian, 1),
          fmt(r.brokenM2, 0), fmt(r.brokenFrac, 3), fmt(r.surfWidthMedian, 0),
          fmt(r.gapFrac, 2), fmt(r.xiShipped, 3), fmt(r.xiLocal, 3),
          fmt(r.subtendLineupDeg, 1), fmt(r.subtendFreeDeg, 1)])));
    }
  }

  // ---------- 5. which clamp binds first ----------
  if (mode === 'clamps' || mode === 'all') {
    console.log(`\n## Which clamp binds first, and at what H0\n`);
    console.log(`First rung at which the clamp binds on > 50% of live stage stations. "—" = never on this ladder.`);
    console.log(`Constants are read from the shipped sources, not retyped:`);
    for (const [n, c] of Object.entries(K)) console.log(`  ${n.padEnd(14)} ${String(c.value).padEnd(7)} ${c.label} (${c.file})`);
    console.log('');
    const names = [
      ['skewCap', `skew ${K.skewCap.value} (model-glsl)`],
      ['sizeGate', `sizeGate ${K.sizeGate.value} (shaders)`],
      ['hmCap', `hM ${K.hmCap.value} m face (shaders)`],
      ['ceilDisp', `breakerCeilM ${K.ceilDispHi.value} displayed`],
      ['offsetHi', `depthBreakOffset +${K.offsetHi.value} m`],
      ['offsetLo', `depthBreakOffset -${K.offsetLo.value} m`],
      ['ksHi', `Ks ${K.ksHi.value}`],
      ['ksLo', `Ks ${K.ksLo.value}`],
      ['offStage', `line off the ${K.stageD.value} m stage`],
      ['offGrid', 'line off the depth grid'],
      ['edgeBreak', 'already breaking at the grid edge'],
      ['h0Slider', `H0 slider ${K.h0Slider.value} m`],
    ];
    console.log(mdTable(['spot', ...names.map(([, l]) => l)],
      presets.map((k) => [PRESETS[k].label,
        ...names.map(([n]) => { const b = firstBind(sweeps[k].rungs, n); return b === null ? '—' : fmt(b, 2); })])));
    console.log(`\nBinding AT THE CARD STATE (fraction of stage stations already clamped):\n`);
    console.log(mdTable(['spot', ...names.map(([, l]) => l)],
      presets.map((k) => [PRESETS[k].label, ...names.map(([n]) => fmt(sweeps[k].card.clamps[n], 2))])));
  }

  // ---------- 4. Iribarren ----------
  if (mode === 'xi' || mode === 'all') {
    console.log(`\n## Iribarren — does size make the wave read MORE spilling?\n`);
    console.log(`xi shipped = bed.iribarrenMeasured: tan(plane-fit beta) / sqrt(H0/L0), on the OFFSHORE H0.`);
    console.log(`xi local   = tan(bed slope AT the line, +/-${SLOPE_STENCIL_M} m stencil) / sqrt(Hb/L0), on the height it breaks at.`);
    console.log(`xi authored = PRESETS[k].xi — and u_xi.value = state.xi (main.js:224, :2024), so the`);
    console.log(`AUTHORED number is what reaches the shader. iribarrenMeasured is a HUD readout only`);
    console.log(`(main.js:1315, bed.js's own comment says so).\n`);
    console.log(mdTable(['spot', 'xi authored', 'xi shipped @card', 'xi shipped @×1.5', 'xi shipped @×2',
                         'xi local @card', 'xi local @×1.5', 'xi local @×2', 'tanβ local card → ×2'],
      presets.map((k) => {
        const s = sweeps[k], H0 = PRESETS[k].H0;
        const at = (m) => s.rungs.reduce((b, r) => Math.abs(r.state.H0 - H0 * m) < Math.abs(b.state.H0 - H0 * m) ? r : b);
        return [PRESETS[k].label, fmt(PRESETS[k].xi, 2),
          fmt(s.card.xiShipped, 3), fmt(at(1.5).xiShipped, 3), fmt(at(2).xiShipped, 3),
          fmt(s.card.xiLocal, 3), fmt(at(1.5).xiLocal, 3), fmt(at(2).xiLocal, 3),
          `${fmt(s.card.tanBlocMed, 4)} → ${fmt(at(2).tanBlocMed, 4)}`];
      })));
  }

  // ---------- apparent size ----------
  if (mode === 'apparent' || mode === 'all') {
    console.log(`\n## Apparent size — "bigger" is an ON SCREEN claim, and the line moves\n`);
    console.log(`Lineup / Cover / Drone AIM at the baked line and hold a FIXED standoff from it`);
    console.log(`(main.js CAM_PRESETS: Lineup ${fmt(LINEUP_STANDOFF_M, 1)} m, Cover ${fmt(COVER_STANDOFF_3D_M, 1)} m),`);
    console.log(`so their subtended crest height tracks the drawn crest exactly. Free is a fixed`);
    console.log(`station at [${FREE_CAM}] and its range GROWS as the line marches seaward.\n`);
    console.log(mdTable(['spot', 'card: crest disp m / Lineup ° / Free ° / range m',
                         '×1.5: crest / Lineup ° / Free ° / range', '×2: crest / Lineup ° / Free ° / range',
                         'Lineup ° ×2/card', 'Free ° ×2/card'],
      presets.map((k) => {
        const s = sweeps[k], H0 = PRESETS[k].H0;
        const at = (m) => s.rungs.reduce((b, r) => Math.abs(r.state.H0 - H0 * m) < Math.abs(b.state.H0 - H0 * m) ? r : b);
        const cell = (r) => `${fmt(r.ceilDispMedian, 1)} / ${fmt(r.subtendLineupDeg, 1)} / ${fmt(r.subtendFreeDeg, 1)} / ${fmt(r.freeRangeM, 0)}`;
        return [PRESETS[k].label, cell(s.card), cell(at(1.5)), cell(at(2)),
          fmt(at(2).subtendLineupDeg / s.card.subtendLineupDeg, 2),
          fmt(at(2).subtendFreeDeg / s.card.subtendFreeDeg, 2)];
      })));
  }

  // ---------- write + gate ----------
  for (const k of presets) {
    const s = sweeps[k];
    summary.spots[k] = { label: PRESETS[k].label, cardH0: PRESETS[k].H0, T: PRESETS[k].T,
                         ceilM: s.ceilM, ceilRatio: s.ceilRatio, rungs: s.rungs };
  }
  // The negative control must FAIL on most of what it checks, or G3 has no teeth.
  const ncBite = gate.g3Checked ? gate.g3NcFails / gate.g3Checked : 0;
  summary.gate = { ...gate, ncBite,
    pass: gate.g1 === 0 && gate.g2 === 0 && gate.latticeMismatch === 0
          && gate.g3Checked > 0 && gate.g3Fails === 0 && ncBite > 0.9 };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary));
  if (process.argv.includes('--json')) console.log(JSON.stringify(summary, null, 1));

  console.log(`\n## Gate\n`);
  console.log(`G1  exported field == bed.breakExcessProfile   max |dF| ${gate.g1.toExponential(2)} m over ${gate.states} states (lattice mismatches ${gate.latticeMismatch})`);
  console.log(`G2  replica line  == shipped bakeBreakLine     max |dz| ${gate.g2.toExponential(2)} m`);
  console.log(`G3  depth under the line satisfies the shipped criterion: ${gate.g3Checked} true-crossing texels, ${gate.g3Fails} over the bound`);
  console.log(`    |resid| / max(|dF/dz|*MARCH_DZ, ${G3_REL}*gamma*h): p99 ${gate.g3RelP99.toExponential(2)}, max ${gate.g3RelMax.toExponential(2)} (1.0 = the bound; margin ${(1 / Math.max(gate.g3RelMax, 1e-12)).toFixed(1)}x)`);
  console.log(`G3-NC  same check at tide + ${G3_PROBE_M} m (the bed the bake did NOT use): ${gate.g3NcFails}/${gate.g3Checked} = ${(100 * ncBite).toFixed(1)}% REFUSED, worst-state median residual ${gate.g3NcRelMedian.toFixed(1)}x the bound — the gate has teeth`);
  console.log(`\n→ ${summary.gate.pass ? 'PASS' : 'FAIL'}`);
  console.log(`\nwrote ${join(outDir, 'summary.json')}`);
  if (!summary.gate.pass) process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) await main();
