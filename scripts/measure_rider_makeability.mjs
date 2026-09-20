// The rider acceptance gate — replaces adherence with agreement.
//
// WHY THIS EXISTS. scripts/measure_ride.mjs gates CI at 0.9 on rideMetric,
// which is face height under the rider divided by the best crest height at his
// own station (main.js). That number is MAXIMISED BY SITTING EXACTLY ON THE
// BREAKPOINT -- its own comment says a ride that "has drifted off the wave reads
// low here". It is the right instrument for the question it was built for (does
// moving the phase field onto the baked Psi cost the rider his wave?) and the
// wrong one for a rider who is allowed to lose: a correct dynamic rider scores
// low by construction and the gate calls it a regression.
//
// So this gate does not ask "is he still glued to the peel". It asks:
//
//     GIVEN a board speed, did he hold what the makeability field says he
//     should hold, and lose what it says he should lose?
//
// Agreement, not adherence. A rider who holds everything scores 1.0 only when
// the field says everything was holdable at his speed; at a speed where the
// field predicts a loss, holding on anyway is a MISS. That is the property
// rideMetric does not have and cannot be given.
//
// WHAT IS SCORED. A trajectory: [{ t, x }] on the baked line, from any source.
// Three arms run here, and the third is what keeps the gate honest:
//
//   1 shipped/uncapped  the real m4RideSolve at unbounded board speed. A
//                       REGRESSION GUARD, not a discriminator: at infinite speed
//                       nothing can outrun him, so the only thing it can catch
//                       is the predictor hallucinating a loss. Stated plainly
//                       because a bar that cannot fail should not be dressed up
//                       as evidence.
//   2 shipped/capped    the same real rider at the SPOT'S OWN minSkillMps from
//                       the makeability field. MUST score LOW: he is the
//                       breakpoint, so he rides straight through pinches that
//                       beat a real surfer at that speed. If this scored high
//                       the metric would still be adherence in disguise.
//   3 reference/capped  a synthetic rider who advances at min(V_peel, V_board)
//                       and is lost where the peel outruns him, at the same
//                       speed. MUST score high -- otherwise the target is
//                       unreachable and the gate is unfair rather than strict.
//
// Arms 2 and 3 are the real content: same field, same speed, same spot, and the
// two riders must land on opposite sides. That separation is the thing
// rideMetric cannot produce at any threshold.
//
// HEADLESS, NO PLAYWRIGHT. m4RideSolve lives in model-js.js, which is
// deliberately THREE-free so node can reach it, and the bake comes from bed.js
// through measure_break_activation.mjs's resolve hook. So this runs the REAL
// solve against the REAL bake in about a second, and never meets the headless
// rAF parking that VISUAL_CAPTURE.md documents.
//
// THE STENCIL CAVEAT, and why it is printed rather than buried. "The peel
// speed" is not yet one number: m4RideSolve reads dPhi/dx over a 1.5 m stencil
// and bed.js over 14.06 m, and those disagree by up to 51% at Second Peak (see
// peelVelocity() in peel-geometry.js). This gate scores against bed.js's, which
// is the one the makeability field and the section decomposition are built on,
// and ALSO reports the score at the rider's own stencil. Until Track A picks
// one, the gap between those two columns is the size of the ambiguity, and a
// gate that hid it would be asserting a precision it does not have.
//
// Usage:
//   node scripts/measure_rider_makeability.mjs                  # all spots
//   node scripts/measure_rider_makeability.mjs --preset=sewers
//   --board=6  --secs=180  --dt=0.0333  --out=qa/rider-makeability  --json
//
// Exit 1 if any arm misses its bar.
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const R = await import('./measure_break_activation.mjs');   // installs the three hook
const MK = await import('./measure_makeability.mjs');
const bed = await import('../web-three/js/bed.js');
const { m4RideSolve } = await import('../web-three/js/model-js.js');
const { PRESETS } = await import('../shared/params.js');
const { PP_GEO_DATA } = await import('../data/model/pp_geo_profiles.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const [X0, X1] = R.X_RANGE;

// ---------- declared parameters ----------
export const SECS = 180;               // sim seconds per arm
export const DT = 1 / 30;
export const LOSS_TOL_M = 12;          // agreement window on a predicted loss x
export const PASS_UNCAPPED = 1.00;     // arm 1: a hallucinated loss is a bug
export const PASS_REFERENCE = 0.90;    // arm 3 bar
export const FAIL_CAPPED_ABOVE = 0.60; // arm 2 must stay BELOW this

const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a');
const arg = (n, d = null) => {
  const h = process.argv.find((a) => a.startsWith(`--${n}=`));
  return h ? h.slice(n.length + 3) : d;
};
function mdTable(headers, rows) {
  return [`| ${headers.join(' | ')} |`, `|${headers.map(() => '---').join('|')}|`,
    ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

// ---------- the model P the renderer builds, rebuilt headlessly ----------
export function riderP(key, state, kappa) {
  const pr = PP_GEO_DATA.profiles[R.spotOf(key)];
  return {
    T: state.T, H0: state.H0, alphaRad: PRESETS[key].alpha * Math.PI / 180,
    xi: PRESETS[key].xi, sections: PRESETS[key].sections, chop: PRESETS[key].chop, aframe: 0,
    geoMix: 1, contourX2: pr.contourFit.x2, contourX3: pr.contourFit.x3,
    stageStart: pr.stageBoundsM[0], stageEnd: pr.stageBoundsM[1],
    phaseFn: R.phaseTwin(key, kappa),        // same Psi field bed.js uses
  };
}

// V_peel at a station, from the SHIPPED geometry. `stencil` selects whose:
// 'bake' is bed.js derivedPeelGeometry (what the makeability field is built
// on), 'rider' is m4RideSolve's own 1.5 m total difference.
export function peelAt(x, omega, stencil, phaseAt, zbFn) {
  if (stencil === 'bake') {
    const g = bed.derivedPeelGeometry(x, X0, X1, { omega });
    return g && Number.isFinite(g.lineVelocityMps) ? Math.abs(g.lineVelocityMps) : NaN;
  }
  const e = 1.5;
  const S = (xx) => phaseAt(xx, zbFn(xx));
  const dSdx = (S(x + e) - S(x - e)) / (2 * e);
  const dzdx = (zbFn(x + e) - zbFn(x - e)) / (2 * e);
  if (!Number.isFinite(dSdx) || Math.abs(dSdx) < 1e-10) return NaN;
  return Math.abs((omega / dSdx) * Math.hypot(1, dzdx));
}

// ---------- trajectories ----------
// Arm 1 and 2: the real shipped solve. One trajectory, scored at two speeds.
export function shippedTrajectory(key, state, kappa, zbFn) {
  const P = riderP(key, state, kappa);
  const st = { n: null, prevX: null };
  const out = [];
  for (let t = 0; t < SECS; t += DT) {
    const s = m4RideSolve(t, P, zbFn, st);
    if (s && !s.waiting) out.push({ t, x: s.x });
  }
  return out;
}

// Arm 3: the reference dynamic rider. This is NOT a model of surfing -- it is
// the minimal thing that obeys Walker: advance along the line at the peel speed
// you can actually hold, and be lost when the peel outruns you. A1's rider has
// to at least reproduce this, or it is not implementing the criterion.
export function referenceTrajectory(key, state, kappa, zbFn, boardMps, stencil, phaseAt) {
  const P = riderP(key, state, kappa);
  const omega = 2 * Math.PI / state.T;
  const st = { n: null, prevX: null };
  const out = [];
  let x = null;
  for (let t = 0; t < SECS; t += DT) {
    const s = m4RideSolve(t, P, zbFn, st);      // takeoff timing only
    if (!s || s.waiting) { x = null; continue; }
    if (x === null) x = s.x;                    // take off where the real rider does
    const v = peelAt(x, omega, stencil, phaseAt, zbFn);
    if (!Number.isFinite(v)) { x = null; continue; }
    if (v > boardMps) { x = null; continue; }   // outrun: the ride ends here
    x += v * DT;
    if (x > P.stageEnd - 10) { x = null; continue; }
    out.push({ t, x });
  }
  return out;
}

// ---------- scoring ----------
// Split a trajectory into rides (x resets backward on a hand-off), then for each
// ride compare where it ENDED against where the field says it should have.
export function splitRides(traj) {
  const rides = [];
  let cur = null;
  for (let i = 0; i < traj.length; i++) {
    const p = traj[i], prev = traj[i - 1];
    const broke = !prev || p.x < prev.x - 1 || p.t - prev.t > DT * 2.5;
    if (broke) { if (cur && cur.length > 1) rides.push(cur); cur = []; }
    cur.push(p);
  }
  if (cur && cur.length > 1) rides.push(cur);
  return rides;
}

// Where should a rider of this speed lose the wave, having taken off at x0?
// The first station downstream where V_peel exceeds him. null = he completes.
export function predictLossX(x0, xEnd, boardMps, omega, stencil, phaseAt, zbFn) {
  for (let x = x0; x <= xEnd; x += 2) {
    const v = peelAt(x, omega, stencil, phaseAt, zbFn);
    if (Number.isFinite(v) && v > boardMps) return x;
  }
  return null;
}

// Scored over the span the rider ACTUALLY RODE, never against a stage-end
// threshold. A first cut asked whether he reached stageEnd - 14; that scored
// Sewers 1.00 and Second Peak 0.00 purely because Sewers' rides happen to end
// past an arbitrary line and Second Peak's do not. A ride that ends because the
// crest ran out is not a loss, and no fixed x can tell the two apart.
//
//   predictedLoss = the first station inside [x0, xEnd] where V_peel > V_board
//   null          -> he should have held everything he rode. Agree iff he did.
//   non-null      -> he should have been beaten there. Agree iff he stopped
//                    within LOSS_TOL_M of it.
//
// The shipped rider rides straight through a predicted loss, which is exactly
// the disagreement arm 2 is looking for.
export function scoreArm(rides, boardMps, omega, stencil, phaseAt, zbFn) {
  let agree = 0, held = 0, lost = 0;
  const detail = [];
  for (const ride of rides) {
    const x0 = ride[0].x, xLast = ride[ride.length - 1].x;
    const predicted = predictLossX(x0, xLast, boardMps, omega, stencil, phaseAt, zbFn);
    let ok;
    if (predicted === null) { ok = true; held++; }          // nothing should have beaten him
    else { ok = Math.abs(xLast - predicted) <= LOSS_TOL_M; lost++; }
    if (ok) agree++;
    detail.push({ x0: +x0.toFixed(1), xLast: +xLast.toFixed(1),
                  predictedLossX: predicted === null ? null : +predicted.toFixed(1), ok });
  }
  return { rides: rides.length, agreement: rides.length ? agree / rides.length : NaN,
           predictedHold: held, predictedLoss: lost, detail };
}

export function runSpot(key, stencil) {
  const state = R.cardOf(key);
  const real = R.bakeReal(key, state);
  const kappa = real.kappa;
  const omega = 2 * Math.PI / state.T;
  const phaseAt = R.phaseTwin(key, kappa);
  const zbFn = (x) => bed.breakZAt(x, X0, X1);

  // The capped arms use the SPOT'S OWN speed, read from the makeability field,
  // not one global number. A first cut ran everything at 6 m/s, which produced
  // no reference rides at all on Second Peak, Sharks and Privates -- correctly,
  // because the field says those spots need 8-10 m/s, so a 6 m/s rider cannot
  // even take off. Asking a spot to be rideable below its own minimum is a bug
  // in the question, not a failure of the rider.
  const board = MK.summarise(key, state).minSkillMps ?? Math.max(...MK.BOARD_SPEEDS);
  R.bakeReal(key, state);                 // MK.summarise rebakes; restore this spot's bake

  const shipped = shippedTrajectory(key, state, kappa, zbFn);
  const ref = referenceTrajectory(key, state, kappa, zbFn, board, stencil, phaseAt);
  const sr = splitRides(shipped), rr = splitRides(ref);
  return {
    key, spot: PRESETS[key].label, stencil, boardMps: board,
    uncapped: scoreArm(sr, Infinity, omega, stencil, phaseAt, zbFn),
    capped:   scoreArm(sr, board, omega, stencil, phaseAt, zbFn),
    reference: scoreArm(rr, board, omega, stencil, phaseAt, zbFn),
  };
}

async function main() {
  const only = arg('preset');
  const presets = only ? [only] : R.MAPPED;
  const out = { generated: new Date().toISOString(),
                declared: { SECS, DT, LOSS_TOL_M, PASS_UNCAPPED, PASS_REFERENCE, FAIL_CAPPED_ABOVE },
                bake: {}, rider: {} };
  for (const stencil of ['bake', 'rider']) {
    out[stencil === 'bake' ? 'bake' : 'rider'] = presets.map((k) => runSpot(k, stencil));
  }

  for (const stencil of ['bake', 'rider']) {
    const rows = out[stencil];
    console.log(`\n## Arms, V_peel from the ${stencil === 'bake' ? 'BAKE stencil (14.06 m, the makeability field\'s)' : "RIDER stencil (1.5 m, m4RideSolve's)"}\n`);
    console.log(mdTable(['spot', 'board m/s', 'rides', 'arm1 uncapped ↑', 'arm2 shipped@board ↓', 'arm3 reference@board ↑', 'ref rides'],
      rows.map((r) => [r.spot, r.boardMps, r.uncapped.rides, fmt(r.uncapped.agreement),
                       fmt(r.capped.agreement), fmt(r.reference.agreement), r.reference.rides])));
  }

  // ---------- the bars ----------
  const B = out.bake;
  const a1 = Math.min(...B.map((r) => r.uncapped.agreement));
  const a2 = Math.max(...B.map((r) => r.capped.agreement));
  const a3 = Math.min(...B.map((r) => r.reference.agreement));
  const pass = { arm1: a1 >= PASS_UNCAPPED, arm2: a2 < FAIL_CAPPED_ABOVE, arm3: a3 >= PASS_REFERENCE };
  out.verdict = { worstUncapped: a1, bestCapped: a2, worstReference: a3, pass,
                  allPass: pass.arm1 && pass.arm2 && pass.arm3 };

  console.log('\n## Verdict (bake stencil)\n');
  console.log(mdTable(['arm', 'what it proves', 'bar', 'worst/best', 'result'], [
    ['1 uncapped', 'regression guard: no hallucinated losses', `>= ${PASS_UNCAPPED}`, fmt(a1), pass.arm1 ? 'PASS' : 'FAIL'],
    ['2 shipped @ board', 'the metric is NOT adherence in disguise', `< ${FAIL_CAPPED_ABOVE}`, fmt(a2), pass.arm2 ? 'PASS' : 'FAIL'],
    ['3 reference @ board', 'the target is reachable, not merely strict', `>= ${PASS_REFERENCE}`, fmt(a3), pass.arm3 ? 'PASS' : 'FAIL'],
  ]));

  const dir = join(ROOT, arg('out', 'qa/rider-makeability'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(out));
  if (process.argv.includes('--json')) console.log(JSON.stringify(out, null, 1));
  console.log(`\nwrote ${join(dir, 'summary.json')}`);
  if (!out.verdict.allPass) process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) await main();
