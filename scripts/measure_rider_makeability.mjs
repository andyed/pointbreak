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
const { m4RideSolve, RIDER_POCKET_M } = await import('../web-three/js/model-js.js');
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
export const FAIL_CAPPED_ABOVE = 0.60; // retained: a per-spot reading, not a bar
// Arm 2's bar. Under the integrated pocket rule most of the lineup IS makeable
// at its own minSkill, so the shipped rider agreeing there is correct and not a
// regression. What must hold is that where the pocket genuinely fails, the
// metric separates the kinematic rider from the dynamic one.
export const MIN_SEPARATION = 0.50;

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
// Arm 4 (A1): the REAL m4RideSolve with a board speed declared, i.e. the
// shipped rider once he has a velocity of his own. This is the arm Track A1 has
// to win, and it is scored by exactly the same function as arms 2 and 3 — no
// separate bar, no separate notion of a loss.
export function dynamicTrajectory(key, state, kappa, zbFn, boardMps) {
  const P = { ...riderP(key, state, kappa), boardMps };
  const st = { n: null, prevX: null };
  const out = [];
  for (let t = 0; t < SECS; t += DT) {
    const s = m4RideSolve(t, P, zbFn, st);
    if (s && !s.waiting && !s.fallen) out.push({ t, x: s.x });
  }
  return out;
}

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
  let x = null, lag = 0, down = null;
  for (let t = 0; t < SECS; t += DT) {
    const s = m4RideSolve(t, P, zbFn, st);      // takeoff timing only
    if (!s || s.waiting) { x = null; lag = 0; down = null; continue; }
    if (down !== null && down === st.n) continue;   // still down from this crest
    if (x === null) { x = s.x; lag = 0; down = null; }  // take off where the real rider does
    const v = peelAt(x, omega, stencil, phaseAt, zbFn);
    if (!Number.isFinite(v)) { x = null; lag = 0; continue; }
    // same pocket rule as the real rider: give up ground where the peel is
    // faster, and be lost only once the accumulated gap exceeds the pocket.
    lag += Math.max(0, v - boardMps) * DT;
    if (lag > RIDER_POCKET_M) {
      // Lost. STAY lost until the next crest, exactly as m4RideSolve does with
      // st.fallen — a reference that remounts on the next frame chops one ride
      // into many and scores a different thing from the rider it is a
      // reference for. (Measured: Privates 0.00 vs the real rider's 1.00
      // before this, purely from the segmentation.)
      down = st.n; x = null; lag = 0; continue;
    }
    x += Math.min(v, boardMps) * DT;
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
//
// NOT "the first station where V_peel exceeds him". That was the first cut and
// it is too strict to be true. Measured: at Sewers the peel touches 6.4 m/s
// against a 6 m/s board on 98 frames out of 5401 and the total lag that builds
// is 0.04 m — a surfer makes that wave, and an instantaneous threshold calls
// the whole ride lost at the first sample over the line.
//
// A rider is beaten when he has fallen out of the POCKET, which is a distance,
// so the loss condition has to be integrated: he closes the gap where the peel
// is slower than he is and gives it up where the peel is faster, and he is lost
// when the accumulated gap passes RIDER_POCKET_M. Brief pinches are survivable
// and sustained ones are not, which is the actual shape of the thing.
//
// RIDER_POCKET_M is imported from model-js.js rather than restated: the rider
// and the instrument that judges him must not hold two copies of the rule
// (MODEL.md 4.5). Returns the x where the pocket is lost, or null.
export function predictLossX(x0, xEnd, boardMps, omega, stencil, phaseAt, zbFn) {
  if (!Number.isFinite(boardMps)) return null;
  const STEP = 1;
  let lag = 0;
  for (let x = x0; x <= xEnd; x += STEP) {
    const v = peelAt(x, omega, stencil, phaseAt, zbFn);
    if (!Number.isFinite(v)) continue;
    // time the breakpoint takes to cross this step, versus the time he takes
    const dtPeel = STEP / Math.max(v, 1e-3);
    const dtHim = STEP / boardMps;
    lag += Math.max(0, (dtHim - dtPeel)) * v;   // metres of line he gives up here
    if (lag > RIDER_POCKET_M) return x;
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
  const dyn = dynamicTrajectory(key, state, kappa, zbFn, board);
  const sr = splitRides(shipped), rr = splitRides(ref), dr = splitRides(dyn);
  return {
    key, spot: PRESETS[key].label, stencil, boardMps: board,
    uncapped: scoreArm(sr, Infinity, omega, stencil, phaseAt, zbFn),
    capped:   scoreArm(sr, board, omega, stencil, phaseAt, zbFn),
    reference: scoreArm(rr, board, omega, stencil, phaseAt, zbFn),
    dynamic:  scoreArm(dr, board, omega, stencil, phaseAt, zbFn),
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
    console.log(mdTable(['spot', 'board m/s', 'arm1 uncapped ↑', 'arm2 shipped@board ↓',
                         'arm3 reference ↑', 'arm4 REAL dynamic ↑', 'dyn rides'],
      rows.map((r) => [r.spot, r.boardMps, fmt(r.uncapped.agreement),
                       fmt(r.capped.agreement), fmt(r.reference.agreement),
                       fmt(r.dynamic.agreement), r.dynamic.rides])));
  }

  // ---------- the bars ----------
  const B = out.bake;
  const a1 = Math.min(...B.map((r) => r.uncapped.agreement));
  const a2 = Math.max(...B.map((r) => r.capped.agreement));
  const a3 = Math.min(...B.map((r) => r.reference.agreement));
  const a4 = Math.min(...B.map((r) => r.dynamic.agreement));
  const sep = Math.max(...B.map((r) => r.dynamic.agreement - r.capped.agreement));
  const sepAt = B.filter((r) => r.dynamic.agreement - r.capped.agreement > 0.5).map((r) => r.spot);
  const pass = { arm1: a1 >= PASS_UNCAPPED, arm2: sep >= MIN_SEPARATION,
                 arm3: a3 >= PASS_REFERENCE, arm4: a4 >= PASS_REFERENCE };
  out.verdict = { worstUncapped: a1, bestCapped: a2, worstReference: a3, worstDynamic: a4,
                  separation: sep, separatesAt: sepAt, pass,
                  allPass: pass.arm1 && pass.arm2 && pass.arm3 && pass.arm4 };

  console.log('\n## Verdict (bake stencil)\n');
  console.log(mdTable(['arm', 'what it proves', 'bar', 'worst/best', 'result'], [
    ['1 uncapped', 'regression guard: no hallucinated losses', `>= ${PASS_UNCAPPED}`, fmt(a1), pass.arm1 ? 'PASS' : 'FAIL'],
    ['2 separation', `the metric tells the two riders apart (${sepAt.length ? sepAt.join(', ') : 'nowhere'})`, `>= ${MIN_SEPARATION}`, fmt(sep), pass.arm2 ? 'PASS' : 'FAIL'],
    ['3 reference @ board', 'the target is reachable, not merely strict', `>= ${PASS_REFERENCE}`, fmt(a3), pass.arm3 ? 'PASS' : 'FAIL'],
    ['4 REAL dynamic @ board', 'A1: the shipped rider, given a speed, obeys Walker', `>= ${PASS_REFERENCE}`, fmt(a4), pass.arm4 ? 'PASS' : 'FAIL'],
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
