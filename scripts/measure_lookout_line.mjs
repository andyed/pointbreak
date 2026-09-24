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
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
// The pose read, the projection, the arms and the per-preset loop live in
// scripts/lib/lookout-line.mjs (extracted 2026-09-24, unchanged) so
// scripts/score_reef_fit.mjs projects a knob bake through the same code.
import { lookoutModelLines, DEFAULT_FORCING } from './lib/lookout-line.mjs';

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
const HS = Number(arg('h0', String(DEFAULT_FORCING.HS)));       // SC116 waveHs, 2026-09-05 10:00 PDT
const T = Number(arg('t', String(DEFAULT_FORCING.T)));          // SC116 waveTp
const TIDE = Number(arg('tide', String(DEFAULT_FORCING.TIDE))); // NOAA 9413450 verified, m about MSL
const DESHOAL = arg('deshoal', '15,12').split(',').map(Number).filter(Number.isFinite);
const H0MULT = arg('h0mult', '1.27,1.53').split(',').map(Number).filter(Number.isFinite);
const OUT = arg('out', join(ROOT, 'docs/research/assets/lookout-locus-2026-09-23/model-lines.json'));

const out = lookoutModelLines({ bed, PRESETS, PEEL_FLOOR, peelFloorH0, PP_GEO_DATA, D },
                              { presetKeys: PRESET_KEYS, HS, T, TIDE, DESHOAL, H0MULT });
const H0_ARMS = out.h0Arms;
const { f_px, hfovDeg, levelRow } = out.pose;

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
