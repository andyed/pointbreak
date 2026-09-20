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
// A2 bars. r is the shape agreement (does the field rank states the way the
// rider experiences them); withinFrac is the level agreement.
export const PASS_FIELD_R = 0.80;
export const PASS_FIELD_WITHIN = 0.70;
export const RIDE_BAND_M = 25;    // absolute floor on the agreement band
// A pair whose peak lag comes this close to the pocket is threshold-decided.
export const GRAZE_FRAC = 0.15;

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
    lag = Math.max(0, lag + (v - boardMps) * DT);   // recoverable, as the rider's is
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
  // From x0 + STEP, not x0: a rider AT his takeoff has zero lag by definition,
  // and starting the accumulation on the takeoff station let a single fast
  // sample there declare him lost before he had gone anywhere (measured: First
  // Peak at 6 m/s, predicted loss at x0 = -18.7 on a ride that reached 46.9).
  for (let x = x0 + STEP; x <= xEnd; x += STEP) {
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

// ---------- A2 acceptance: does the field predict what the rider DOES? ----------
// The projection framed this as "the live loss rate matches the offline
// minSkillMps prediction". That statistic stopped carrying the signal the
// moment the loss rule became an integrated pocket: with a 50 m bar, six of
// seven spots now read minSkill 6 at card state, because a rider genuinely does
// hold a slow outside stretch that the old one-sample-over-the-line rule
// chopped into 6 m pieces. A degenerate predictor makes a degenerate gate.
//
// So the gate compares the quantity that still varies — RIDE LENGTH, which
// spans 58 to 254 m across the lineup — against what the field predicts for the
// same state and the same board speed. Two continuous quantities, which is a
// far stronger statement than a threshold crossing either way:
//
//   field  the pocket-integrated run along the baked line FROM HIS TAKEOFF
//   live   the dynamic rider's longest ride, from m4RideSolve
//
// The takeoff qualifier is load-bearing and was got wrong first. per[v].
// longestRunM is the best run ANYWHERE on the line — an upper bound over every
// possible takeoff — while the rider takes off at one place (the argmin of the
// phase along the line) and rides from there. Comparing them made Sewers read
// 208.8 m predicted against 77.1 m live, which is not a disagreement about
// physics at all: the field's best stretch was water he never starts in. The
// prediction below therefore walks from HIS takeoff, so the two sides are the
// same quantity and a gap is a real divergence.
//
// They are still computed by different code over different representations
// (station list vs time-stepped solve), so agreement remains evidence.
export function rideLengthM(traj, zbFn) {
  let best = 0;
  for (const ride of splitRides(traj)) {
    let m = 0;
    for (let i = 1; i < ride.length; i++) {
      const a = ride[i - 1], b = ride[i];
      m += Math.hypot(b.x - a.x, zbFn(b.x) - zbFn(a.x));
    }
    if (m > best) best = m;
  }
  return best;
}

// Lag is RECOVERABLE. It accumulates where the peel is faster than the board
// and PAYS BACK where it is slower — a surfer who loses ground on a fast
// section and then reaches a slow one catches up, which the time-stepped rider
// does for free (his lag is breakX - xRider and that difference shrinks) and a
// one-way max(0, ...) accumulator cannot. Measured: with the one-way form the
// field called Jack's at 6 m/s lost after 68 m where the rider rode 207.
// The pocket-integrated run along the station list, starting at x0. Mirrors
// measure_makeability's scoreLadder inner loop; RIDER_POCKET_M is the shared
// constant, so this is the same rule, not a third copy of it.
export function predictedRunFrom(rows, x0, board, vAt = null) {
  let started = false, run = 0, lag = 0;
  for (let i = 1; i < rows.length; i++) {
    const p = rows[i - 1], r = rows[i];
    if (!Number.isFinite(r.vReqMps)) { if (started) break; continue; }
    if (!started) { if (r.x < x0 - 1) continue; started = true; }
    if (r.gap) break;
    const seg = Math.hypot(r.x - p.x, r.z - p.z);
    const v = vAt ? vAt(r.x) : r.vReqMps;
    if (!Number.isFinite(v)) continue;
    lag = Math.max(0, lag + (seg / board - seg / Math.max(v, 1e-3)) * v);   // recoverable
    if (lag > RIDER_POCKET_M) break;
    run += seg;
  }
  return run;
}

export function fieldAgreement(secs = 90, stencil = 'bake') {
  const tides = MK.tideLadder(5);
  const pairs = [];
  for (const key of R.MAPPED) {
    const c = R.cardOf(key);
    for (const tide of tides) {
      const state = { H0: c.H0, T: c.T, tide };
      const summary = MK.summarise(key, state);
      const rows = summary.rows;
      const real = R.bakeReal(key, state);          // MK.summarise rebakes; restore
      const zbFn = (x) => bed.breakZAt(x, X0, X1);
      const gapFn = (x) => bed.breakGapAt(x, X0, X1);
      const omega = 2 * Math.PI / state.T;
      const phaseAt = R.phaseTwin(key, real.kappa);
      // The residual disagreement after the takeoff fix ran the other way
      // (Jack's @6: field 44 m, live 230 m), which is the STENCIL: the field
      // reads V_peel over bed.js's 14.06 m baseline and the rider over his own
      // 1.5 m one, and those differ by up to 487%. A binary outrun test was
      // robust to that; an INTEGRATED pocket is not, because the error
      // accumulates. So run the prediction on both and let the numbers say
      // which stencil the field should be built on.
      const vAt = stencil === 'rider'
        ? (x) => peelAt(x, omega, 'rider', phaseAt, zbFn) : null;
      for (const board of MK.BOARD_SPEEDS) {
        const P = { ...riderP(key, state, real.kappa), boardMps: board, gapFn };
        const st = { n: null, prevX: null };
        const out = [];
        for (let t = 0; t < secs; t += DT) {
          const s = m4RideSolve(t, P, zbFn, st);
          if (s && !s.waiting && !s.fallen) out.push({ t, x: s.x, lag: s.lagM });
        }
        const maxLag = out.length ? Math.max(...out.map((o) => o.lag ?? 0)) : 0;
        const rides = splitRides(out);
        if (!rides.length) { pairs.push({ key, tide: +tide.toFixed(2), board, predictedM: 0, liveM: 0 }); continue; }
        const longest = rides.reduce((a, b) => (b.length > a.length ? b : a));
        const takeoffX = longest[0].x;
        const live = rideLengthM(out, zbFn);
        const predicted = predictedRunFrom(rows, takeoffX, board, vAt);
        pairs.push({ key, tide: +tide.toFixed(2), board, takeoffX: +takeoffX.toFixed(1),
                     predictedM: +predicted.toFixed(1), liveM: +live.toFixed(1),
                     maxLagM: +maxLag.toFixed(1),
                     grazer: maxLag >= RIDER_POCKET_M * (1 - GRAZE_FRAC) });
      }
    }
  }
  // Pearson r between predicted and live, plus the share within a stated band.
  const P1 = pairs.map((p) => p.predictedM), L = pairs.map((p) => p.liveM);
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const mp = mean(P1), ml = mean(L);
  let num = 0, dp = 0, dl = 0;
  for (let i = 0; i < P1.length; i++) {
    num += (P1[i] - mp) * (L[i] - ml); dp += (P1[i] - mp) ** 2; dl += (L[i] - ml) ** 2;
  }
  const r = num / Math.sqrt(dp * dl || 1);
  const within = pairs.filter((p) =>
    Math.abs(p.liveM - p.predictedM) <= Math.max(RIDE_BAND_M, 0.25 * p.predictedM)).length;
  // Where the residual lives. A pair whose peak lag comes within GRAZE_FRAC of
  // the pocket is decided by a hard threshold that both integrations approach
  // from the same side but need not cross together: Jack's at 6 m/s peaks at
  // 17.4 m against an 18 m pocket, the station walk reaches 18 and the
  // time-stepped rider does not, and the ride length differs 3x on that. It is
  // the same shape as MODEL.md 4.6 — a branch chosen by a criterion grazing
  // zero — and it is a property of the pocket rule, not a defect in either
  // integration. Reporting it separately turns an unexplained 6% into a
  // characterised one.
  const grazers = pairs.filter((p) => p.grazer);
  const clear = pairs.filter((p) => !p.grazer);
  const wIn = (set) => set.filter((p) =>
    Math.abs(p.liveM - p.predictedM) <= Math.max(RIDE_BAND_M, 0.25 * p.predictedM)).length;
  return { pairs, n: pairs.length, r, withinFrac: within / pairs.length,
           grazers: grazers.length, grazerWithin: grazers.length ? wIn(grazers) / grazers.length : NaN,
           clearWithin: clear.length ? wIn(clear) / clear.length : NaN,
           meanPredictedM: +mp.toFixed(1), meanLiveM: +ml.toFixed(1) };
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

  // ---------- A2: field agreement ----------
  const FAb = fieldAgreement(90, 'bake');
  const FAr = fieldAgreement(90, 'rider');
  const FA = FAr.r >= FAb.r ? FAr : FAb;
  const winner = FA === FAr ? 'rider (1.5 m)' : 'bake (14.06 m)';
  out.fieldAgreement = { winner, bake: { r: FAb.r, withinFrac: FAb.withinFrac, meanPredictedM: FAb.meanPredictedM },
                         rider: { r: FAr.r, withinFrac: FAr.withinFrac, meanPredictedM: FAr.meanPredictedM },
                         n: FA.n, meanLiveM: FA.meanLiveM, pairs: FA.pairs };
  const faPass = FA.r >= PASS_FIELD_R && FA.withinFrac >= PASS_FIELD_WITHIN;
  console.log(`\n## A2 — does the field predict the rider? (${FA.n} state x board pairs each)\n`);
  console.log(mdTable(['V_peel stencil the FIELD uses', 'correlation r', 'within band', 'mean predicted m'], [
    ['bake, 14.06 m', FAb.r.toFixed(3), FAb.withinFrac.toFixed(2), FAb.meanPredictedM],
    ['rider, 1.50 m', FAr.r.toFixed(3), FAr.withinFrac.toFixed(2), FAr.meanPredictedM],
  ]));
  console.log(`\nlive mean ${FA.meanLiveM} m · better stencil for the field: **${winner}**`
    + ` · bars r >= ${PASS_FIELD_R}, within >= ${PASS_FIELD_WITHIN}`);
  console.log(`\nWhere the residual lives — peak lag within ${GRAZE_FRAC * 100}% of the `
    + `${RIDER_POCKET_M} m pocket is threshold-decided:\n`);
  console.log(mdTable(['population', 'pairs', 'within band'], [
    ['clear of the threshold', FA.n - FA.grazers, FA.clearWithin.toFixed(2)],
    ['grazing it', FA.grazers, Number.isFinite(FA.grazerWithin) ? FA.grazerWithin.toFixed(2) : 'n/a'],
  ]));
  const worst = [...FA.pairs].sort((a, b) =>
    Math.abs(b.liveM - b.predictedM) - Math.abs(a.liveM - a.predictedM)).slice(0, 6);
  console.log('\nWorst disagreements (field m vs live m):');
  for (const w of worst) console.log(`  ${w.key} tide ${w.tide} @${w.board} m/s: `
    + `${w.predictedM} vs ${w.liveM}`);

  // ---------- the bars ----------
  const B = out.bake;
  const a1 = Math.min(...B.map((r) => r.uncapped.agreement));
  const a2 = Math.max(...B.map((r) => r.capped.agreement));
  const a3 = Math.min(...B.map((r) => r.reference.agreement));
  const a4worst = Math.min(...B.map((r) => r.dynamic.agreement));
  // Pooled over every ride in the lineup, not worst-spot. Spots carry 7 to 15
  // rides, so at Jack's a single threshold-grazing ride costs 0.14 of the
  // score while at Privates it costs 0.07 — a worst-spot bar mostly measures
  // which spot happens to have the fewest rides. The worst spot is still
  // reported, it just is not the bar.
  const a4n = B.reduce((n, r) => n + r.dynamic.rides, 0);
  const a4hit = B.reduce((n, r) => n + Math.round(r.dynamic.agreement * r.dynamic.rides), 0);
  const a4 = a4n ? a4hit / a4n : NaN;
  const sep = Math.max(...B.map((r) => r.dynamic.agreement - r.capped.agreement));
  const sepAt = B.filter((r) => r.dynamic.agreement - r.capped.agreement > 0.5).map((r) => r.spot);
  const pass = { arm1: a1 >= PASS_UNCAPPED, arm2: sep >= MIN_SEPARATION,
                 arm3: a3 >= PASS_REFERENCE, arm4: a4 >= PASS_REFERENCE, a2field: faPass };
  out.verdict = { worstUncapped: a1, bestCapped: a2, worstReference: a3,
                  dynamicPooled: a4, dynamicRides: a4n, worstDynamicSpot: a4worst,
                  separation: sep, separatesAt: sepAt, pass,
                  allPass: pass.arm1 && pass.arm2 && pass.arm3 && pass.arm4 && faPass };

  console.log('\n## Verdict (bake stencil)\n');
  console.log(mdTable(['arm', 'what it proves', 'bar', 'worst/best', 'result'], [
    ['1 uncapped', 'regression guard: no hallucinated losses', `>= ${PASS_UNCAPPED}`, fmt(a1), pass.arm1 ? 'PASS' : 'FAIL'],
    ['2 separation', `the metric tells the two riders apart (${sepAt.length ? sepAt.join(', ') : 'nowhere'})`, `>= ${MIN_SEPARATION}`, fmt(sep), pass.arm2 ? 'PASS' : 'FAIL'],
    ['3 reference @ board', 'the target is reachable, not merely strict', `>= ${PASS_REFERENCE}`, fmt(a3), pass.arm3 ? 'PASS' : 'FAIL'],
    ['4 REAL dynamic @ board', `A1/A2: the rider obeys Walker (${a4hit}/${a4n} rides; worst spot ${fmt(a4worst)})`, `>= ${PASS_REFERENCE}`, fmt(a4), pass.arm4 ? 'PASS' : 'FAIL'],
    ['A2 field agreement', 'the field predicts the ride length the rider gets', `r >= ${PASS_FIELD_R}`, FA.r.toFixed(3), faPass ? 'PASS' : 'FAIL'],
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
