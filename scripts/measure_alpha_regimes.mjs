// Track 1c'-c.10 discriminator (2026-08-14): the stage-median peel angle is an
// average over three regimes that mean different things, and only one of them
// is the wedge. This splits them, and prices each station against its OWN
// local Snell ceiling instead of the one per-spot number peel-ceiling.test.js
// evaluates.
//
// WHY. `stageAlpha()` has been the acceptance instrument since 2026-08-13, and
// it reads 28.4 at Sharks against a 36 target — the gap the spec attributes to
// "wedge saturation at the Snell bound". But the stage is not all reef. Per
// station along the baked line this reports:
//
//   LIMITER-PINNED  |dz/dx| >= 2.9, i.e. the line is riding bakeBreakLine's
//                   SLEW_M_PER_M = 3.0 clamp. derivedAlphaDeg there measures
//                   the limiter, not the wave (it reads 67-71 deg on every
//                   spot, and 25-40 deg ABOVE the local refraction ceiling,
//                   which is physically impossible for a planar component).
//   ON-REEF         the wedge lifts the bed under the break point by >= 0.30 m
//                   and the line is not pinned. THIS is what the reef fit
//                   actually delivers.
//   OFF-REEF        the wedge has faded out; the line follows the natural DEM.
//                   Low alpha here is the dead down-point third (TODO 1c'-c.4),
//                   not a reef defect.
//
// LOCAL CEILING. peel-ceiling.test.js evaluates sin(a_max) = c_b/c_s once per
// spot from formula depths. Along the stage both depths vary, so this measures
// them per station off the actual bed:
//   h_b(x) = still-water depth at the baked break point
//   h_s(x) = still-water depth at the reef's seaward edge on that ray (march
//            seaward until the wedge's lift over the measured bed dies)
// Where the wedge has faded, h_s -> h_b and the ceiling goes vacuous (asin->90):
// true, and useless. Only ON-REEF stations can say whether a SHAPE change has
// room, which is the whole question c.10 asks.
//
//   node scripts/measure_alpha_regimes.mjs [--spot=sharks] [--tide=0] [--all] [--profile]
//
// Needs the dev server up: python3 scripts/serve.py

const PW_CANDIDATES = [
  process.env.PLAYWRIGHT_DIR,
  new URL('../../psychodeli-webgl-port/node_modules/playwright/index.mjs', import.meta.url).pathname,
  new URL('../node_modules/playwright/index.mjs', import.meta.url).pathname,
].filter(Boolean);
let chromium;
for (const c of PW_CANDIDATES) {
  try { ({ chromium } = await import(c)); break; } catch { /* try next */ }
}
if (!chromium) {
  console.error('playwright not found. Set PLAYWRIGHT_DIR=/path/to/playwright/index.mjs');
  process.exit(1);
}

const flags = Object.fromEntries(process.argv.slice(2)
  .filter((a) => a.startsWith('--')).map((a) => a.replace(/^--/, '').split(/=(.*)/s).slice(0, 2)));
const ALL_SPOTS = ['sewers', 'firstpeak', 'secondpeak', 'jacks', 'thehook', 'sharks'];
const SPOTS = 'all' in flags ? ALL_SPOTS : [flags.spot || 'sharks'];
const TIDE = Number(flags.tide ?? 0);
const BASE = flags.base || 'http://localhost:8127/web-three/';
const PROFILE = 'profile' in flags;

// bakeBreakLine's SLEW_M_PER_M is 3.0; 2.9 catches the pinned run without
// catching an honest steep stretch.
const SLEW_PINNED = 2.9;
const LIFT_MIN = 0.30;   // m of wedge lift at the break point = "on reef"

const med = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const f = (v, n = 1) => (v === null || v === undefined || !Number.isFinite(v)) ? '   --' : v.toFixed(n).padStart(5);

const browser = await chromium.launch({ args: ['--use-angle=metal'] });
const page = await browser.newPage({ viewport: { width: 800, height: 500 } });
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 300)));

for (const spot of SPOTS) {
  // Hash-only nav does NOT reload the app — without the blank hop every spot
  // returns the FIRST spot's numbers.
  await page.goto('about:blank');
  await page.goto(`${BASE}#preset=${spot}&hud=0&tide=${TIDE}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2400);

  const r = await page.evaluate(async ({ spot, tide, LIFT_EPS, MARCH_MAX }) => {
    const bed = await import('/web-three/js/bed.js');
    const disp = await import('/web-three/js/dispersion.js');
    const { PRESETS } = await import('/shared/params.js');
    const card = PRESETS[spot];
    // bed.js keys on the OSM canon name (state.geoSpot), NOT the preset key.
    const audit = window.__pointbreak.reefAudit();
    if (!audit) return { error: `no reef fit for ${spot}` };
    const geo = audit.spot;
    const st = window.__pointbreak.stageAlpha(2);
    if (!st) return { error: `no baked line for ${spot}` };
    const wl = bed.MSL_ABOVE_NAVD88 + tide;
    const omega = 2 * Math.PI / card.T;
    const celerity = (h) => omega / disp.wavenumberAt(omega, h);
    const lift = (x, z) => bed.bedElevBlended(geo, x, z, 0) - bed.bedElevAt(geo, x, z);

    const pr = window.__pointbreak.lineProbe(2).filter((q) => q.x >= st.stageLo && q.x <= st.stageHi);
    const rows = [];
    for (let i = 0; i < pr.length; i++) {
      const p = pr[i];
      const slope = i ? Math.abs((p.z - pr[i - 1].z) / (p.x - pr[i - 1].x)) : 0;
      const hb = wl - bed.bedElevBlended(geo, p.x, p.z, 0);
      const liftAtBreak = lift(p.x, p.z);
      let zEdge = null;
      for (let d = 0; d <= MARCH_MAX; d += 2) {
        if (lift(p.x, p.z - d) < LIFT_EPS) { zEdge = p.z - d; break; }   // seaward is -z
      }
      const hs = zEdge === null ? null : wl - bed.bedElevBlended(geo, p.x, zEdge, 0);
      let ceil = null;
      if (hs !== null && hb > 0.05 && hs > hb) {
        const ratio = celerity(hb) / celerity(hs);
        ceil = ratio >= 1 ? null : Math.asin(ratio) * 180 / Math.PI;
      }
      rows.push({ x: p.x, a: p.a, slope, hb, hs, ceil, lift: liftAtBreak });
    }
    return { spot, geo, T: card.T, H0: card.H0, target: card.alpha,
      stageLo: st.stageLo, stageHi: st.stageHi, stageMed: st.median,
      stageMedClean: st.medianClean ?? null, stagePinnedN: st.pinnedN ?? null, rows };
  }, { spot, tide: TIDE, LIFT_EPS: 0.05, MARCH_MAX: 400 });

  if (r.error) { console.error(`${spot}: ${r.error}`); continue; }

  const pinned = r.rows.filter((q) => q.slope >= SLEW_PINNED);
  const onReef = r.rows.filter((q) => q.slope < SLEW_PINNED && q.lift >= LIFT_MIN);
  const offReef = r.rows.filter((q) => q.slope < SLEW_PINNED && q.lift < LIFT_MIN);
  const onCeil = onReef.filter((q) => q.ceil !== null);
  const headroom = med(onCeil.map((q) => q.ceil - q.a));

  console.log(`\n${r.spot}  T ${r.T}s  H0 ${r.H0}m  target ${r.target}  tide ${TIDE}  stage ${r.stageLo.toFixed(0)}..${r.stageHi.toFixed(0)} m`);
  console.log(`  stageAlpha() median          ${f(r.stageMed)}   <- all three regimes mixed (kept for continuity with recorded sweeps)`);
  if (r.stageMedClean !== null)
    console.log(`  stageAlpha() medianClean     ${f(r.stageMedClean)}   <- limiter-pinned excluded in-app (${r.stagePinnedN} sta) — the HUD number`);
  console.log(`  LIMITER-PINNED  ${String(pinned.length).padStart(3)} sta  alpha ${f(med(pinned.map((q) => q.a)))}   (riding SLEW_M_PER_M — an artifact, not a peel)`);
  console.log(`  ON-REEF         ${String(onReef.length).padStart(3)} sta  alpha ${f(med(onReef.map((q) => q.a)))}   ceiling ${f(med(onCeil.map((q) => q.ceil)))}   headroom ${f(headroom)}`);
  console.log(`  OFF-REEF        ${String(offReef.length).padStart(3)} sta  alpha ${f(med(offReef.map((q) => q.a)))}   (bare DEM — the dead down-point third)`);
  console.log(`  reef coverage of stage ${(100 * onReef.length / Math.max(r.rows.length, 1)).toFixed(0)}%   |   ON-REEF vs target: ${f(med(onReef.map((q) => q.a)) - r.target)} deg`);

  if (PROFILE) {
    console.log('\n      x  regime   alpha  ceiling    h_b    h_s   lift');
    for (const q of r.rows.filter((_, i) => i % 5 === 0)) {
      const reg = q.slope >= SLEW_PINNED ? 'PINNED' : (q.lift >= LIFT_MIN ? 'reef  ' : 'bare  ');
      console.log(`${String(q.x).padStart(7)}  ${reg} ${f(q.a)} ${f(q.ceil)} ${f(q.hb, 2)} ${f(q.hs, 2)} ${f(q.lift, 2)}`);
    }
  }
}
if (errs.length) console.error('\npageerrors:', errs);
await browser.close();
