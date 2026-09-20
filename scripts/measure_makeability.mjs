// Is the shipped lineup a DIFFICULTY FIELD, or is it flat?
//
// Walker's (1972) makeable criterion states a surf break's playability as one
// inequality: a rider holds the curl iff his own speed can match the speed the
// breakpoint travels along the break line,
//
//   V_surfer  >=  V_peel  =  c / sin(alpha)
//
// with c the crest celerity and alpha the peel angle.  The repo already
// computes BOTH sides.  Nothing here models a surfer, and nothing here is
// wired into the renderer: this instrument asks only whether the seven
// surveyed spots, swept over the tide and swell they ship with, produce a
// VARIED and READABLE spread of required speeds -- the precondition for a game
// -- or whether every station reads uniformly makeable (no challenge) or
// uniformly closed out (no ride).
//
// WHY V_peel IS READ OFF THE PHASE FIELD AND NOT OFF c/sin(alpha).
// peel-geometry.js already returns lineVelocityMps: the breakpoint's speed
// along the locus, derived from the spatial phase gradient rather than from
// the sine form.  The two are the same quantity, but the phase form stays
// finite and signed where sin(alpha) -> 0, and it cannot disagree with the
// alpha the HUD and the rider use, because it is computed from the same
// derivatives in the same call.  The sine form is retained here ONLY as the
// gate (below).
//
// THE GATE (MEASUREMENT_LESSONS 4).  An instrument that re-derives the physics
// it is measuring certifies itself.  This one reads the SHIPPED
// bed.derivedPeelGeometry after the SHIPPED bakeRefraction + bakeBreakLine, so
// the line, the phase and the angle are the renderer's own.  On top of that,
// every station is checked against Walker's sine form:
//
//   | |lineVelocityMps| - phaseSpeedMps / sin|alpha| |  /  (c/sin|alpha|)
//
// must stay under GATE_TOL.  That is an identity, not a fit: a station that
// breaks it means the phase derivatives and the reported angle have come
// apart, and the run exits 1.  Stations too close to alpha = 0 to evaluate the
// sine form (|alpha| < GATE_MIN_DEG) are excluded from the gate and counted.
//
// WHAT IS DECLARED RATHER THAN MEASURED.  Exactly one thing: BOARD_SPEEDS, the
// ladder of rider speeds the stations are scored against.  It is a physical
// ceiling (a human on a surfboard, not a peel angle), so it cannot be read off
// this bathymetry, and it is stated here as a tunable rather than buried:
// 6 / 8 / 10 / 12 m/s spans a competent trim to about the fastest speed
// reported for a surfer on an open face.  Every per-station quantity is
// exported raw, so the ladder can be re-cut from summary.json without
// re-running the sweep.  The Hutt et al. (2001) skill bands are reported
// ALONGSIDE, on |alpha| directly, as the literature's own (independent)
// difficulty read -- they are not used to define makeability.
//
// RIDE LENGTH is arc length along the baked line, summed over contiguous
// stations that are makeable at a given board speed AND not inside a baked
// section gap.  A gap is the wave closing out: not "too fast to make", but no
// line to ride.  The two are reported separately on purpose.
//
// THE HEADLINE PER STATE is minSkillMps: the slowest board speed on the ladder
// that still yields a contiguous ride of at least RIDE_MIN_M.  null = the
// state gives no real ride at any speed on the ladder.  Sweeping THAT over
// spot x tide x H0 is the difficulty field the game question turns on.
//
// Headless, no renderer.  measure_break_activation.mjs is imported first
// because its module body installs the `three` resolve hook and picks the bed
// source before bed.js is loaded; it also owns --bed and --map-privates, which
// therefore work here unchanged.
//
// Usage:
//   node scripts/measure_makeability.mjs                  # card + tide + h0 + field
//   node scripts/measure_makeability.mjs --mode=card      # seven spots, card state
//   node scripts/measure_makeability.mjs --mode=tide      # card H0/T over the tide
//   node scripts/measure_makeability.mjs --mode=h0        # H0 ladder at tide 0
//   node scripts/measure_makeability.mjs --mode=field     # spot x tide x H0
//   node scripts/measure_makeability.mjs --mode=line --preset=secondpeak
//                                                         # every station, one state
//   --preset=<key>  --tide=<m>  --h0=<m>  --t=<s>  --out=qa/makeability  --json
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// MUST be first: installs the resolve hook / bed source that bed.js needs.
const R = await import('./measure_break_activation.mjs');
const bed = await import('../web-three/js/bed.js');
const { PRESETS, PEEL_FLOOR } = await import('../shared/params.js');

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const [X0, X1] = R.X_RANGE;

// ---------- declared parameters (the only ones) ----------
export const BOARD_SPEEDS = [6, 8, 10, 12];   // m/s, rider ceiling ladder
export const RIDE_MIN_M = 50;                 // arc length that counts as "a ride"
// Sections are split on PHYSICAL features only -- never on a speed threshold.
// A first attempt split them wherever V_req exceeded a ceiling, which made
// every section end at a near-ceiling station and drove its difficulty metric
// to the ceiling by construction: the instrument was measuring its own cut.
// The dividers below are speed-independent, so the decomposition stays fixed
// while the board ladder moves.
export const ALPHA_MIN_DEG = 2;               // |alpha| under this is the peel reversing
export const SECTION_MIN_M = 15;              // shorter stretches are not a section
export const GATE_TOL = 1e-6;                 // Walker identity, relative
export const GATE_MIN_DEG = 0.05;             // below this the sine form is singular
// Hutt, Black & Mead (2001), Table 2: peel-angle bands by surfer skill.
// Reported, never used to classify makeability.
export const HUTT_BANDS = [
  { name: 'beginner',     minDeg: 70 },
  { name: 'intermediate', minDeg: 55 },
  { name: 'advanced',     minDeg: 40 },
  { name: 'expert',       minDeg: 27 },
  { name: 'pro',          minDeg: 0  },
];

const fmt = (v, d = 1) => (v === null || v === undefined || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
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

export function huttBand(alphaDeg) {
  const a = Math.abs(alphaDeg);
  return (HUTT_BANDS.find((b) => a >= b.minDeg) || HUTT_BANDS[HUTT_BANDS.length - 1]).name;
}

// ---------- one state -> every station on the baked line ----------
// state: { H0, T, tide }.  Returns the raw per-station record; no thresholds
// are applied here, so the ladder and RIDE_MIN_M can be re-cut downstream.
export function stationsFor(key, state) {
  const real = R.bakeReal(key, state);           // bakeRefraction + bakeBreakLine, shipped path
  const omega = 2 * Math.PI / state.T;
  const rows = [];
  for (let i = 0; i < real.xs.length; i++) {
    const x = real.xs[i];
    const g = bed.derivedPeelGeometry(x, X0, X1, { omega });
    if (!g || !Number.isFinite(g.lineVelocityMps) || !Number.isFinite(g.alphaDeg)) {
      rows.push({ x, z: real.z[i], gap: !!real.gap[i], alphaDeg: NaN, cMps: NaN,
                  vPeelMps: NaN, vReqMps: NaN, band: null, gateRel: null });
      continue;
    }
    const vReq = Math.abs(g.lineVelocityMps);
    // Walker's sine form, for the gate only.
    const s = Math.sin(Math.abs(g.alphaRad));
    const walker = Math.abs(g.alphaDeg) >= GATE_MIN_DEG && s > 0 ? g.phaseSpeedMps / s : null;
    rows.push({
      x, z: real.z[i], gap: !!real.gap[i],
      alphaDeg: g.alphaDeg, cMps: g.phaseSpeedMps,
      vPeelMps: g.lineVelocityMps,                 // signed: sign is peel DIRECTION
      vReqMps: vReq,                               // magnitude: what the rider must hold
      band: huttBand(g.alphaDeg),
      gateRel: walker === null ? null : Math.abs(vReq - walker) / walker,
    });
  }
  return rows;
}

// ---------- scoring ----------
// A run is a maximal stretch of contiguous stations that are ungapped and
// makeable at vBoard.  Length is arc length along the line, so a steeply
// oblique section is not credited with only its x-extent.
export function scoreLadder(rows) {
  const per = {};
  for (const v of BOARD_SPEEDS) {
    let bestM = 0, bestStartX = null, curM = 0, curStartX = null, okN = 0, n = 0;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!Number.isFinite(r.vReqMps)) { curM = 0; curStartX = null; continue; }
      n++;
      const ok = !r.gap && r.vReqMps <= v;
      if (!ok) { curM = 0; curStartX = null; continue; }
      okN++;
      if (curStartX === null) { curStartX = r.x; curM = 0; }
      const p = rows[i - 1];
      if (p && Number.isFinite(p.vReqMps) && !p.gap && p.vReqMps <= v) {
        curM += Math.hypot(r.x - p.x, r.z - p.z);
      }
      if (curM > bestM) { bestM = curM; bestStartX = curStartX; }
    }
    per[v] = { makeFrac: n ? okN / n : NaN, longestRunM: bestM, runStartX: bestStartX };
  }
  const minSkill = BOARD_SPEEDS.find((v) => per[v].longestRunM >= RIDE_MIN_M) ?? null;
  return { per, minSkillMps: minSkill };
}

// Sign flips of the peel direction, ignoring stations too close to alpha = 0
// to have a meaningful sign (R.REVERSAL_DEG is the break-field rig's own bar).
export function reversalsOf(rows) {
  let last = 0, flips = 0;
  for (const r of rows) {
    if (!Number.isFinite(r.alphaDeg) || Math.abs(r.alphaDeg) < R.REVERSAL_DEG) continue;
    const s = Math.sign(r.alphaDeg);
    if (last && s !== last) flips++;
    last = s;
  }
  return flips;
}

export function summarise(key, state) {
  const rows = stationsFor(key, state);
  const live = rows.filter((r) => Number.isFinite(r.vReqMps));
  const gated = live.filter((r) => r.gateRel !== null);
  const vs = live.map((r) => r.vReqMps).sort((a, b) => a - b);
  const q = (p) => (vs.length ? vs[Math.min(vs.length - 1, Math.floor(p * vs.length))] : NaN);
  const ladder = scoreLadder(rows);
  const bands = {};
  for (const r of live) bands[r.band] = (bands[r.band] || 0) + 1;
  return {
    key, spot: PRESETS[key].label, state,
    stations: rows.length, live: live.length,
    gapFrac: rows.length ? rows.filter((r) => r.gap).length / rows.length : NaN,
    vReq: { p10: q(0.10), median: q(0.50), p90: q(0.90), min: vs[0], max: vs[vs.length - 1] },
    cMedian: live.length ? live.map((r) => r.cMps).sort((a, b) => a - b)[live.length >> 1] : NaN,
    alphaMedian: live.length
      ? live.map((r) => Math.abs(r.alphaDeg)).sort((a, b) => a - b)[live.length >> 1] : NaN,
    bands, reversals: reversalsOf(rows),
    sections: enumerateSections(rows),
    ...ladder,
    gate: {
      checked: gated.length,
      skippedNearZeroAlpha: live.length - gated.length,
      maxRel: gated.length ? Math.max(...gated.map((r) => r.gateRel)) : 0,
    },
    rows,
  };
}

// ---------- sections: the progression unit ----------
// A SECTION is a maximal stretch of line between physical dividers: a baked
// gap (the wave closing out) or the peel passing through alpha = 0 (the wave
// breaking outward from a point, where V_peel is unbounded and the direction
// flips). Both are features of the water, not of the rider, so the same piece
// of wave keeps the same index at every skill level.
//
// A rider does NOT have to traverse a section end to end -- he takes off
// somewhere inside it and holds on until he is beaten. So difficulty is not
// reported as one number: per board speed, `runs[v]` is the longest makeable
// stretch WITHIN the section, and `opensAt` is the slowest ladder speed that
// yields at least SECTION_MIN_M of it. That is the unlock condition.
export function enumerateSections(rows) {
  const out = [];
  let cur = null;
  const divider = (r) => !Number.isFinite(r.vReqMps) || r.gap
    || Math.abs(r.alphaDeg) < ALPHA_MIN_DEG;
  const close = () => {
    if (cur && cur.lengthM >= SECTION_MIN_M) {
      const v = cur._v.slice().sort((a, b) => a - b);
      cur.index = out.length;
      cur.vReq = { p10: v[Math.floor(0.1 * v.length)], median: v[v.length >> 1],
                   p90: v[Math.floor(0.9 * v.length)], min: v[0], max: v[v.length - 1] };
      cur.alphaMedianDeg = cur._a.slice().sort((a, b) => a - b)[cur._a.length >> 1];
      cur.band = huttBand(cur.alphaMedianDeg);
      cur.runs = {};
      for (const vb of BOARD_SPEEDS) {
        let best = 0, run = 0;
        for (let j = 0; j < cur._pts.length; j++) {
          const p = cur._pts[j];
          if (p.v > vb) { run = 0; continue; }
          if (j > 0 && cur._pts[j - 1].v <= vb) run += Math.hypot(p.x - cur._pts[j - 1].x, p.z - cur._pts[j - 1].z);
          if (run > best) best = run;
        }
        cur.runs[vb] = best;
      }
      cur.opensAt = BOARD_SPEEDS.find((vb) => cur.runs[vb] >= SECTION_MIN_M) ?? null;
      delete cur._v; delete cur._a; delete cur._pts;
      out.push(cur);
    }
    cur = null;
  };
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (divider(r)) { close(); continue; }
    if (!cur) cur = { x0: r.x, x1: r.x, lengthM: 0, _v: [], _a: [], _pts: [] };
    const p = rows[i - 1];
    if (p && !divider(p)) cur.lengthM += Math.hypot(r.x - p.x, r.z - p.z);
    cur.x1 = r.x;
    cur._v.push(r.vReqMps);
    cur._a.push(Math.abs(r.alphaDeg));
    cur._pts.push({ x: r.x, z: r.z, v: r.vReqMps });
  }
  close();
  return out;
}

// ---------- ladders ----------
export function tideLadder(n = 7) {
  const [lo, hi] = bed.TIDE_RANGE;
  return Array.from({ length: n }, (_, i) => +(lo + (hi - lo) * (i / (n - 1))).toFixed(3));
}
export const H0_LADDER = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5];

// ---------- main ----------
async function main() {
  const mode = arg('mode', 'all');
  const only = arg('preset');
  const presets = only ? [only] : R.MAPPED;
  const outDir = join(ROOT, arg('out', 'qa/makeability'));
  const summary = {
    generated: new Date().toISOString(),
    bedSource: R.BED_SOURCE || 'shipped',
    declared: { BOARD_SPEEDS, RIDE_MIN_M, GATE_TOL, GATE_MIN_DEG },
    huttBands: HUTT_BANDS, modes: {},
  };
  let gateMax = 0, gateChecked = 0;
  const track = (s) => { gateMax = Math.max(gateMax, s.gate.maxRel); gateChecked += s.gate.checked; return s; };
  const strip = ({ rows, ...rest }) => rest;   // rows only kept for --mode=line
  // A field cell keeps only a digest of its sections: 315 cells x full section
  // records is ~1 MB, which is the class of artifact .gitignore keeps out. The
  // digest still answers "how many sections, and at what speed do they open".
  const digest = ({ rows, sections, ...rest }) => ({
    ...rest, sectionN: sections.length,
    sectionOpensAt: sections.map((s) => s.opensAt),
    sectionLenM: sections.map((s) => +s.lengthM.toFixed(1)),
  });

  if (mode === 'line') {
    const key = only || 'secondpeak';
    const c = R.cardOf(key);
    const st = { H0: num('h0', c.H0), T: num('t', c.T), tide: num('tide', 0) };
    const s = track(summarise(key, st));
    summary.modes.line = s;
    console.log(`\n## ${s.spot} — every station, H0 ${st.H0} m, T ${st.T} s, tide ${st.tide} m\n`);
    console.log(mdTable(['x m', 'z m', 'α°', 'c m/s', 'V_req m/s', 'Hutt band', 'gap', 'makes @6/8/10/12'],
      s.rows.map((r) => [fmt(r.x), fmt(r.z), fmt(r.alphaDeg, 2), fmt(r.cMps, 2), fmt(r.vReqMps, 2),
        r.band ?? 'n/a', r.gap ? 'GAP' : '',
        BOARD_SPEEDS.map((v) => (Number.isFinite(r.vReqMps) && !r.gap && r.vReqMps <= v ? '●' : '·')).join('')])));
  }

  if (mode === 'card' || mode === 'all') {
    const rowsOut = presets.map((k) => track(summarise(k, R.cardOf(k))));
    summary.modes.card = rowsOut.map(strip);
    console.log('\n## Card state — the lineup as it ships\n');
    console.log(mdTable(['spot', 'H0 m', 'T s', 'α° med', 'c m/s', 'V_req p10 / med / p90', 'gap frac',
                         'rev', 'ride m @6 / 8 / 10 / 12', 'min skill m/s'],
      rowsOut.map((s) => [s.spot, s.state.H0, s.state.T, fmt(s.alphaMedian), fmt(s.cMedian, 2),
        `${fmt(s.vReq.p10, 1)} / ${fmt(s.vReq.median, 1)} / ${fmt(s.vReq.p90, 1)}`,
        fmt(s.gapFrac, 2), s.reversals,
        BOARD_SPEEDS.map((v) => fmt(s.per[v].longestRunM, 0)).join(' / '),
        s.minSkillMps ?? 'none'])));
  }

  if (mode === 'sections' || mode === 'all') {
    const rowsOut = presets.map((k) => track(summarise(k, R.cardOf(k))));
    summary.modes.sections = rowsOut.map(({ rows, ...s }) => ({ key: s.key, spot: s.spot, state: s.state, sections: s.sections }));
    console.log(`\n## Sections at card state — the progression unit\n`);
    console.log(`Split on physical dividers only — a baked gap, or the peel through α = 0. At least ${SECTION_MIN_M} m long.`);
    console.log(`"ride m" is the longest makeable stretch INSIDE the section at each board speed.\n`);
    console.log(mdTable(['spot', '#', 'x range m', 'length m', 'V_req p10 / med / p90', 'α° med', 'Hutt',
                         'ride m @6 / 8 / 10 / 12', 'opens at'],
      rowsOut.flatMap((s) => (s.sections.length ? s.sections : [null]).map((sec, i) => (sec === null
        ? [i === 0 ? s.spot : '', '—', '—', '—', '—', '—', '—', '—', 'no section']
        : [i === 0 ? s.spot : '', sec.index, `${fmt(sec.x0, 0)} → ${fmt(sec.x1, 0)}`, fmt(sec.lengthM, 0),
           `${fmt(sec.vReq.p10, 1)} / ${fmt(sec.vReq.median, 1)} / ${fmt(sec.vReq.p90, 1)}`,
           fmt(sec.alphaMedianDeg, 1), sec.band,
           BOARD_SPEEDS.map((v) => fmt(sec.runs[v], 0)).join(' / '),
           sec.opensAt ?? 'never'])))));
    const tot = rowsOut.reduce((n, s) => n + s.sections.length, 0);
    console.log(`\n${tot} sections across ${rowsOut.length} spots at card state.`);
  }

  if (mode === 'windows' || mode === 'all') {
    // The tide band over which a spot yields a ride, per board speed. This is
    // what constrains WHERE a session can be spent: a spot is not a place you
    // can always go, it is a place that is open for part of the cycle.
    const tides = tideLadder(13);
    const win = {};
    for (const k of presets) {
      const scored = tides.map((tide) => {
        const c = R.cardOf(k);
        return track(summarise(k, { H0: c.H0, T: c.T, tide }));
      });
      win[k] = {};
      for (const v of BOARD_SPEEDS) {
        const open = tides.filter((t, i) => scored[i].per[v].longestRunM >= RIDE_MIN_M);
        win[k][v] = open.length
          ? { loM: Math.min(...open), hiM: Math.max(...open), steps: open.length, spanFrac: open.length / tides.length }
          : null;
      }
    }
    summary.modes.windows = { tides, win };
    console.log(`\n## Tide windows at card H0/T — the band where a ride of ≥ ${RIDE_MIN_M} m exists\n`);
    console.log(mdTable(['spot', ...BOARD_SPEEDS.map((v) => `${v} m/s`), 'widest'],
      presets.map((k) => {
        const cells = BOARD_SPEEDS.map((v) => {
          const w = win[k][v];
          return w ? `${w.loM.toFixed(2)} → ${w.hiM.toFixed(2)}` : 'closed';
        });
        const best = BOARD_SPEEDS.map((v) => win[k][v]?.spanFrac ?? 0);
        return [PRESETS[k].label, ...cells, `${(100 * Math.max(...best)).toFixed(0)}% of range`];
      })));
  }

  if (mode === 'tide' || mode === 'all') {
    const tides = tideLadder();
    const grid = {};
    for (const k of presets) {
      grid[k] = tides.map((tide) => {
        const c = R.cardOf(k);
        return track(summarise(k, { H0: c.H0, T: c.T, tide }));
      });
    }
    summary.modes.tide = { tides, grid: Object.fromEntries(Object.entries(grid).map(([k, v]) => [k, v.map(digest)])) };
    console.log(`\n## Tide sweep at card H0/T — min skill m/s (ride ≥ ${RIDE_MIN_M} m), "none" = no ride at any ladder speed\n`);
    console.log(mdTable(['spot', ...tides.map((t) => `${t > 0 ? '+' : ''}${t.toFixed(2)} m`)],
      presets.map((k) => [PRESETS[k].label, ...grid[k].map((s) => s.minSkillMps ?? 'none')])));
  }

  if (mode === 'h0' || mode === 'all') {
    const grid = {};
    for (const k of presets) {
      grid[k] = H0_LADDER.map((H0) => track(summarise(k, { H0, T: R.cardOf(k).T, tide: 0 })));
    }
    summary.modes.h0 = { ladder: H0_LADDER, grid: Object.fromEntries(Object.entries(grid).map(([k, v]) => [k, v.map(digest)])) };
    console.log('\n## H0 ladder at tide 0 — min skill m/s; PEEL_FLOOR floorH0 marked ▲ (MODEL.md 4.6)\n');
    console.log(mdTable(['spot', ...H0_LADDER.map((h) => `${h.toFixed(2)}`), 'floorH0'],
      presets.map((k) => {
        const floor = PEEL_FLOOR[k]?.floorH0 ?? null;
        return [PRESETS[k].label,
          ...grid[k].map((s, i) => {
            const mark = floor !== null && H0_LADDER[i] >= floor
              && (i === 0 || H0_LADDER[i - 1] < floor) ? '▲' : '';
            return `${s.minSkillMps ?? 'none'}${mark}`;
          }),
          floor === null ? 'n/a' : floor.toFixed(2)];
      })));
    console.log('\n### Longest ride (m) at 10 m/s, same ladder\n');
    console.log(mdTable(['spot', ...H0_LADDER.map((h) => `${h.toFixed(2)}`)],
      presets.map((k) => [PRESETS[k].label, ...grid[k].map((s) => fmt(s.per[10].longestRunM, 0))])));
  }

  if (mode === 'field' || mode === 'all') {
    const tides = tideLadder(5);
    const cells = [];
    for (const k of presets) {
      for (const tide of tides) {
        for (const H0 of H0_LADDER) {
          cells.push(digest(track(summarise(k, { H0, T: R.cardOf(k).T, tide }))));
        }
      }
    }
    summary.modes.field = { tides, h0: H0_LADDER, cells };
    const withRide = cells.filter((c) => c.minSkillMps !== null);
    const hist = {};
    for (const c of cells) { const kk = c.minSkillMps ?? 'none'; hist[kk] = (hist[kk] || 0) + 1; }
    summary.modes.fieldStats = { cells: cells.length, withRide: withRide.length, hist };
    console.log(`\n## Difficulty field — ${cells.length} states (${presets.length} spots × ${tides.length} tides × ${H0_LADDER.length} H0)\n`);
    console.log(mdTable(['min skill m/s', 'states', 'share'],
      [...BOARD_SPEEDS.map((v) => String(v)), 'none'].map((kk) => {
        const n = hist[kk] || 0;
        return [kk, n, `${(100 * n / cells.length).toFixed(1)}%`];
      })));
  }

  // ---------- the gate ----------
  summary.gate = { checked: gateChecked, maxRel: gateMax, tol: GATE_TOL,
                   pass: gateChecked > 0 && gateMax <= GATE_TOL };
  mkdirSync(outDir, { recursive: true });
  // Minified on purpose: this is a committed, diffable artifact read by tooling,
  // and the pretty form costs ~35% for indentation nothing reads.
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(summary));
  if (process.argv.includes('--json')) console.log(JSON.stringify(summary, null, 1));

  console.log(`\n## Gate — Walker identity |V_line| == c/sin|α|\n`);
  console.log(`stations checked ${gateChecked}, max relative error ${gateMax.toExponential(2)}, tol ${GATE_TOL.toExponential(0)} → ${summary.gate.pass ? 'PASS' : 'FAIL'}`);
  console.log(`\nwrote ${join(outDir, 'summary.json')}`);
  if (!summary.gate.pass) process.exitCode = 1;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) await main();
