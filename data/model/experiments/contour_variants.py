#!/usr/bin/env python3
"""Contour-fit variant sweep for the Pleasure Point stage profiles.

Question: Private's fails the constrained contour fit z = c2*x^2 + c3*x^3 at
16.62 m RMS while the six neighbouring canon spots fit at 0.22-1.53 m. Does any
defensible change to (A) the reference elevation, (B) the stage window, or
(C) the branch selection bring it under the 5 m usable floor WITHOUT moving
the six mapped fits by more than their own baseline RMS? (D) reports two
reference fit forms so the data's own smoothness can be told from the form's
stiffness.

Read-only: reuses build_geo_profiles.py by import and never writes
pp_geo_profiles.js. Results are recorded in
docs/research/PRIVATES_CONTOUR_2026-09-01.md.

    python3 data/model/experiments/contour_variants.py > sweep.md
"""

from __future__ import annotations

import itertools
import json
import math
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import build_geo_profiles as bgp  # noqa: E402

USABLE_M = 5.0
JUMP_M = 15.0  # a 15 m shore-normal step between 10 m lines is a branch change, not a contour

# (label, option value) for each factor.
REFS = [
    ("node", ("node", 0.0)),
    ("node-0.5", ("node", -0.5)),
    ("node-1.0", ("node", -1.0)),
    ("fix-2.0", ("fixed", -2.0)),
    ("fix-3.0", ("fixed", -3.0)),
]
WINDOWS = [
    ("neighbors", ("neighbors", 250.0)),
    ("sym<=150", ("symmetric", 150.0)),
    ("+-100", ("fixed", 100.0)),
]
BRANCHES = ["nearest", "track"]

PRIVATES = "Private's"
SIX = [name for name in bgp.CANON if name != PRIVATES]


# ---------------------------------------------------------------- linear algebra

def _solve(a: list[list[float]], b: list[float]) -> list[float]:
    """Gaussian elimination with partial pivoting; tiny systems only."""
    n = len(b)
    m = [row[:] + [b[i]] for i, row in enumerate(a)]
    for col in range(n):
        pivot = max(range(col, n), key=lambda r: abs(m[r][col]))
        if abs(m[pivot][col]) < 1e-18:
            raise ValueError("singular normal equations")
        m[col], m[pivot] = m[pivot], m[col]
        for r in range(n):
            if r == col:
                continue
            f = m[r][col] / m[col][col]
            for c in range(col, n + 1):
                m[r][c] -= f * m[col][c]
    return [m[i][n] / m[i][i] for i in range(n)]


def polyfit_rms(points: list[tuple[float, float]], powers: tuple[int, ...]) -> tuple[list[float], float]:
    """Least-squares z = sum c_k x^k over the given powers; returns (coeffs, rms)."""
    k = len(powers)
    a = [[sum(x ** (p + q) for x, _ in points) for q in powers] for p in powers]
    b = [sum((x ** p) * z for x, z in points) for p in powers]
    c = _solve(a, b)
    rms = math.sqrt(sum((sum(ci * x ** p for ci, p in zip(c, powers)) - z) ** 2 for x, z in points) / len(points))
    return c, rms


def ma5_rms(points: list[tuple[float, float]]) -> float:
    """RMS of the data about its own 5-point moving average (edge-shortened).

    A reference for how rough the selected contour is before any form is
    imposed; not a candidate runtime form.
    """
    pts = sorted(points)
    zs = [z for _, z in pts]
    total = 0.0
    for i, z in enumerate(zs):
        lo, hi = max(0, i - 2), min(len(zs), i + 3)
        total += (z - sum(zs[lo:hi]) / (hi - lo)) ** 2
    return math.sqrt(total / len(zs))


def branch_jumps(points: list[tuple[float, float]]) -> tuple[int, float]:
    pts = sorted(points)
    steps = [abs(z1 - z0) for (_, z0), (_, z1) in zip(pts, pts[1:])]
    return sum(1 for s in steps if s > JUMP_M), (max(steps) if steps else 0.0)


def multivalued(lines: list[tuple[float, list[float]]]) -> tuple[int, int, float]:
    """(lines with >= 2 crossings, lines with 0 crossings, mean crossings per line)."""
    counts = [len(c) for _, c in lines]
    return sum(1 for c in counts if c >= 2), sum(1 for c in counts if c == 0), sum(counts) / max(len(counts), 1)


def runtime_curve(m: dict, x: float) -> float:
    """MODEL-TWIN of bed.js spotContourCurve: the fit, clamped to its own bounds."""
    gx = min(max(x, m["stage"][0]), m["stage"][1])
    return m["c2"] * gx * gx + m["c3"] * gx ** 3


def max_delta(base: dict, var: dict) -> float:
    """Largest |z_var - z_base| of the runtime curve over the BASELINE window."""
    lo, hi = int(math.floor(base["stage"][0])), int(math.ceil(base["stage"][1]))
    return max(abs(runtime_curve(var, x) - runtime_curve(base, x)) for x in range(lo, hi + 1))


def max_delta_unclamped(base: dict, var: dict) -> float:
    """Same, for the bare coefficients: separates a fit change from a bounds change."""
    lo, hi = int(math.floor(base["stage"][0])), int(math.ceil(base["stage"][1]))
    return max(abs((var["c2"] - base["c2"]) * x * x + (var["c3"] - base["c3"]) * x ** 3) for x in range(lo, hi + 1))


def gate(res: dict, base: dict) -> dict:
    """Both acceptance gates for one full-canon run."""
    p = res[PRIVATES]
    privates_ok = "error" not in p and p["rmse"] <= USABLE_M
    within_all, worst = True, 0.0
    for name in SIX:
        m, b = res[name], base[name]
        if "error" in m:
            within_all = False
            continue
        d = max_delta(b, m)
        within_all &= d <= b["rmse"] + 1e-9
        worst = max(worst, d / b["rmse"])
    return {"privates_ok": privates_ok, "within_all": within_all, "worst_ratio": worst,
            "verdict": "PASS" if (privates_ok and within_all) else "fail"}


# ---------------------------------------------------------------------- sweep

def load():
    osm = json.loads(bgp.OSM_PATH.read_text())
    bathy = json.loads(bgp.BATHY_PATH.read_text())
    spots = {spot["name"]: spot for spot in osm["spots"]}
    canon_u = [spots[name]["u"] for name in bgp.CANON]
    return spots, canon_u, bathy


def run(spots, canon_u, bathy, options: dict) -> dict:
    out = {}
    for index, name in enumerate(bgp.CANON):
        try:
            out[name] = bgp._measure(name, spots, canon_u, index, bathy, options)
        except ValueError as exc:  # no crossing / too few samples: a result, not a crash
            out[name] = {"error": str(exc)}
    return out


def enrich(m: dict) -> dict:
    """Add the reference numbers (D) and roughness diagnostics to a measurement."""
    if "error" in m:
        return m
    pts = m["points"]
    _, m["rms_lin"] = polyfit_rms(pts, (1, 2, 3))
    _, m["rms_free"] = polyfit_rms(pts, (0, 1, 2, 3))
    m["rms_ma5"] = ma5_rms(pts)
    m["jumps"], m["max_step"] = branch_jumps(pts)
    m["multi"], m["empty"], m["mean_cands"] = multivalued(m["lines"])
    return m


def fmt(v, nd=2, width=0):
    s = "-" if v is None else (f"{v:.{nd}f}" if isinstance(v, float) else str(v))
    return s.rjust(width) if width else s


def variant_table(label: str, res: dict, base: dict) -> tuple[list[str], dict]:
    rows = [
        f"### {label}",
        "",
        "| spot | n | RMS x²+x³ | RMS x+x²+x³ | RMS free cubic | RMS MA5 | tangent ° | Δtangent ° | max|Δz| vs base (runtime, clamped) | max|Δz| coefficients only | base RMS | within? |",
        "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|:---:|",
    ]
    within_all = True
    privates_ok = False
    worst_ratio = 0.0
    for name in bgp.CANON:
        m, b = res[name], base[name]
        if "error" in m:
            rows.append(f"| {name} | – | fail | | | | | | | | {fmt(b['rmse'])} | no |")
            if name != PRIVATES:
                within_all = False
            continue
        d = max_delta(b, m)
        du = max_delta_unclamped(b, m)
        within = d <= b["rmse"] + 1e-9
        if name != PRIVATES:
            within_all &= within
            worst_ratio = max(worst_ratio, d / b["rmse"])
        else:
            privates_ok = m["rmse"] <= USABLE_M
        rows.append(
            f"| {name} | {len(m['points'])} | {fmt(m['rmse'])} | {fmt(m['rms_lin'])} | {fmt(m['rms_free'])} | "
            f"{fmt(m['rms_ma5'])} | {fmt(m['tangent_deg'], 1)} | {fmt(m['tangent_deg'] - b['tangent_deg'], 1)} | "
            f"{fmt(d)} | {fmt(du)} | {fmt(b['rmse'])} | {'yes' if within else 'NO'} |"
        )
    verdict = "PASS" if (privates_ok and within_all) else "fail"
    rows.append("")
    rows.append(
        f"Private's usable (≤ {USABLE_M:.0f} m): **{'yes' if privates_ok else 'no'}** · "
        f"mapped six unchanged (max|Δz| ≤ own baseline RMS): **{'yes' if within_all else 'no'}** "
        f"(worst max|Δz|/baseRMS = {worst_ratio:.2f}) · verdict **{verdict}**"
    )
    rows.append("")
    return rows, {"privates_ok": privates_ok, "within_all": within_all, "worst_ratio": worst_ratio, "verdict": verdict}


def main() -> int:
    spots, canon_u, bathy = load()
    base = {k: enrich(v) for k, v in run(spots, canon_u, bathy, {}).items()}

    out: list[str] = []
    out.append("# Contour-fit variant sweep (generated by data/model/experiments/contour_variants.py)")
    out.append("")
    out.append(f"Grid: NCEI 1/3 arc-second, texel {bathy['dx']} × {bathy['dy']} m. Scan lines every "
               f"{bgp.LINE_STEP_M:.0f} m along, ±{bgp.SCAN_HALF_M:.0f} m shore-normal at 1 m. "
               f"Usable floor {USABLE_M:.0f} m RMS. Branch-jump threshold {JUMP_M:.0f} m between adjacent lines.")
    out.append("")

    # ------------------------------------------------------------ baseline
    out.append("## Baseline (node elevation, neighbour-midpoint window, nearest-to-origin branch)")
    out.append("")
    out.append("| spot | node elev NAVD88 | window m | n | RMS x²+x³ | RMS x+x²+x³ | RMS free cubic | RMS MA5 | lines multi / empty / mean crossings | jumps >15 m | max step m | tangent ° | OSM tangent ° |")
    out.append("|---|---:|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|")
    for name in bgp.CANON:
        m = base[name]
        out.append(
            f"| {name} | {fmt(m['elev0'])} | [{m['stage'][0]:.1f}, {m['stage'][1]:.1f}] | {len(m['points'])} | "
            f"{fmt(m['rmse'])} | {fmt(m['rms_lin'])} | {fmt(m['rms_free'])} | {fmt(m['rms_ma5'])} | "
            f"{m['multi']} / {m['empty']} / {m['mean_cands']:.2f} | {m['jumps']} | {fmt(m['max_step'], 1)} | "
            f"{fmt(m['tangent_deg'], 1)} | {fmt(m['osm_tangent_deg'], 1)} |"
        )
    out.append("")

    pm = base[PRIVATES]
    out.append("### Private's baseline contour (x along, z shore-normal, fit, residual, crossings on that line)")
    out.append("")
    out.append("| x | z sel | fit | resid | crossings |")
    out.append("|---:|---:|---:|---:|---|")
    by_x = dict(pm["lines"])
    for x, z in pm["points"]:
        f = pm["c2"] * x * x + pm["c3"] * x ** 3
        cands = ", ".join(f"{c:.0f}" for c in by_x[x])
        out.append(f"| {x:.0f} | {z:.1f} | {f:.1f} | {z - f:.1f} | {cands} |")
    out.append("")

    # ------------------------------------------------------------ the 30 variants
    summary: list[tuple] = []
    detail: list[str] = []
    for (rl, ref), (wl, win), br in itertools.product(REFS, WINDOWS, BRANCHES):
        opts = {"ref": ref, "window": win, "branch": br}
        res = {k: enrich(v) for k, v in run(spots, canon_u, bathy, opts).items()}
        label = f"ref={rl} · window={wl} · branch={br}"
        rows, verdict = variant_table(label, res, base)
        detail.extend(rows)
        p = res[PRIVATES]
        summary.append((
            rl, wl, br,
            None if "error" in p else p["rmse"],
            None if "error" in p else len(p["points"]),
            None if "error" in p else p["tangent_deg"],
            None if "error" in p else p["ref_offset"],
            None if "error" in p else p["stage"],
            verdict,
            p.get("error"),
        ))

    out.append("## Summary: all 30 variants (A × B × C), Private's and the six-unchanged gate")
    out.append("")
    out.append("| ref | window | branch | Private's RMS | n | Private's tangent ° | ref offset m | Private's window | six unchanged? | worst Δ/RMS | verdict |")
    out.append("|---|---|---|---:|---:|---:|---:|---|:---:|---:|:---:|")
    for rl, wl, br, rms, n, tan, off, stage, v, err in summary:
        if err:
            out.append(f"| {rl} | {wl} | {br} | fail ({err.split(': ', 1)[-1]}) | – | – | – | – | {'yes' if v['within_all'] else 'no'} | {v['worst_ratio']:.2f} | {v['verdict']} |")
        else:
            out.append(
                f"| {rl} | {wl} | {br} | {rms:.2f} | {n} | {tan:.1f} | {off:.1f} | [{stage[0]:.1f}, {stage[1]:.1f}] | "
                f"{'yes' if v['within_all'] else 'no'} | {v['worst_ratio']:.2f} | **{v['verdict']}** |"
            )
    out.append("")
    passing = [s for s in summary if s[8]["verdict"] == "PASS"]
    out.append(f"Variants passing both gates: **{len(passing)} of {len(summary)}**"
               + (": " + "; ".join(f"{a}/{b}/{c}" for a, b, c, *_ in passing) if passing else "."))
    out.append("")
    out.append("## Per-variant tables (all seven spots each)")
    out.append("")
    out.extend(detail)

    # ------------------------------------------------------------ inflator diagnostics
    out.append("## Diagnostics: the three claimed inflators, one factor at a time")
    out.append("")

    out.append("### (1) Reference elevation — window and branch at baseline")
    out.append("")
    out.append("| ref | Private's target NAVD88 | ref offset m | tangent ° | n | RMS x²+x³ | RMS MA5 | lines multi / empty | jumps | six median RMS | six max RMS |")
    out.append("|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|")
    for rl, ref in REFS:
        res = {k: enrich(v) for k, v in run(spots, canon_u, bathy, {"ref": ref}).items()}
        p = res[PRIVATES]
        six = sorted(r["rmse"] for n, r in res.items() if n != PRIVATES and "error" not in r)
        six_med = six[len(six) // 2] if six else None
        if "error" in p:
            out.append(f"| {rl} | fail: {p['error'].split(': ', 1)[-1]} | | | | | | | | {fmt(six_med)} | {fmt(max(six) if six else None)} |")
        else:
            out.append(
                f"| {rl} | {p['target']:.2f} | {p['ref_offset']:.1f} | {p['tangent_deg']:.1f} | {len(p['points'])} | {p['rmse']:.2f} | "
                f"{p['rms_ma5']:.2f} | {p['multi']} / {p['empty']} | {p['jumps']} | {fmt(six_med)} | {fmt(max(six) if six else None)} |"
            )
    out.append("")

    out.append("### (2) Window — Private's at node elevation, nearest branch; symmetric half-width sweep")
    out.append("")
    out.append("| half-width m | n | RMS x²+x³ | RMS MA5 | jumps | max step m | RMS track-branch |")
    out.append("|---:|---:|---:|---:|---:|---:|---:|")
    for half in range(50, 251, 25):
        res = enrich(run(spots, canon_u, bathy, {"window": ("fixed", float(half))})[PRIVATES])
        trk = run(spots, canon_u, bathy, {"window": ("fixed", float(half)), "branch": "track"})[PRIVATES]
        out.append(f"| ±{half} | {len(res['points'])} | {res['rmse']:.2f} | {res['rms_ma5']:.2f} | {res['jumps']} | {res['max_step']:.1f} | {trk['rmse']:.2f} |")
    out.append("")
    out.append("One-sided fits of the baseline Private's selection (same points, split at x = 0):")
    out.append("")
    out.append("| side | n | RMS x²+x³ | RMS MA5 | jumps |")
    out.append("|---|---:|---:|---:|---:|")
    for side, pts in (("x ≤ 0 (toward Shark's)", [p for p in pm["points"] if p[0] <= 0]),
                      ("x ≥ 0 (toward Trees)", [p for p in pm["points"] if p[0] >= 0])):
        if len(pts) >= 3:
            _, _, r = bgp._fit_x2_x3(pts)
            j, _ = branch_jumps(pts)
            out.append(f"| {side} | {len(pts)} | {r:.2f} | {ma5_rms(pts):.2f} | {j} |")
    out.append("")

    out.append("### (2b) Window — the existing 250 m cap on the neighbour-midpoint window, swept (global rule, all seven)")
    out.append("")
    out.append("The 250 m cap was assumed, never calibrated (MEASUREMENT_LESSONS 5). Sewer Peak's window reaches -201.2 m, Shark's Cove's +189.7 m, The Hook's -174.8 m, 38th's +174.8 m, so any cap below those clips a mapped spot.")
    out.append("")
    out.append("| cap m | Private's window | n | Private's RMS | six unchanged? | worst Δ/RMS | six spots clipped | verdict |")
    out.append("|---:|---|---:|---:|:---:|---:|---|:---:|")
    for cap in range(100, 251, 10):
        res = run(spots, canon_u, bathy, {"window": ("neighbors", float(cap))})
        g = gate(res, base)
        p = res[PRIVATES]
        clipped = [n for n in SIX if "error" not in res[n] and res[n]["stage"] != base[n]["stage"]]
        prms = "fail" if "error" in p else f"{p['rmse']:.2f}"
        pn = "–" if "error" in p else str(len(p["points"]))
        pw = "–" if "error" in p else f"[{p['stage'][0]:.1f}, {p['stage'][1]:.1f}]"
        out.append(f"| {cap} | {pw} | {pn} | {prms} | {'yes' if g['within_all'] else 'no'} | {g['worst_ratio']:.2f} | {', '.join(clipped) or '—'} | **{g['verdict']}** |")
    out.append("")

    out.append("### (2c) Window — end the stage where the contour departs the frame (slope threshold, global rule, all seven)")
    out.append("")
    out.append("Walking outward from x = 0, the stage ends at the last line before the selected contour steps more than slope × 10 m shore-normal between adjacent lines, i.e. before it has turned more than atan(slope) from the stage tangent. Applied to all seven; a side that never departs keeps its neighbour-midpoint bound.")
    out.append("")
    out.append("| slope (deg) | Private's window | n | Private's RMS | Private's x²,x³ | six unchanged? | worst Δ/RMS | six spots truncated (their max step m) | verdict |")
    out.append("|---|---|---:|---:|---|:---:|---:|---|:---:|")
    for slope in (0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 1.0, 1.5, 2.0):
        res = run(spots, canon_u, bathy, {"truncate": slope})
        g = gate(res, base)
        p = res[PRIVATES]
        trunc = [f"{n} ({base[n]['max_step']:.1f})" for n in SIX if "error" not in res[n] and res[n]["stage"] != base[n]["stage"]]
        prms = "fail" if "error" in p else f"{p['rmse']:.2f}"
        pn = "–" if "error" in p else str(len(p["points"]))
        pw = "–" if "error" in p else f"[{p['stage'][0]:.1f}, {p['stage'][1]:.1f}]"
        pc = "–" if "error" in p else f"{p['c2']:.3e}, {p['c3']:.3e}"
        out.append(f"| {slope} ({math.degrees(math.atan(slope)):.0f}°) | {pw} | {pn} | {prms} | {pc} | {'yes' if g['within_all'] else 'no'} | {g['worst_ratio']:.2f} | {', '.join(trunc) or '—'} | **{g['verdict']}** |")
    out.append("")
    out.append("Private's adjacent-line steps (m shore-normal per 10 m along), walking down-point from x = 0:")
    out.append("")
    steps = [(x1, abs(z1 - z0)) for (x0, z0), (x1, z1) in zip(pm["points"], pm["points"][1:]) if x1 > 0]
    out.append(", ".join(f"x={x:.0f}: {s:.1f}" for x, s in steps))
    out.append("")
    out.append("Up-point (x < 0), from x = 0 outward:")
    out.append("")
    steps = [(x0, abs(z1 - z0)) for (x0, z0), (x1, z1) in zip(pm["points"], pm["points"][1:]) if x1 <= 0][::-1]
    out.append(", ".join(f"x={x:.0f}: {s:.1f}" for x, s in steps))
    out.append("")

    out.append("### (3) Branch selection — node elevation, neighbour window")
    out.append("")
    out.append("| spot | lines | multi-valued lines | nearest: RMS / jumps / max step | track: RMS / jumps / max step | lines where the two disagree |")
    out.append("|---|---:|---:|---|---|---:|")
    trk_all = {k: enrich(v) for k, v in run(spots, canon_u, bathy, {"branch": "track"}).items()}
    for name in bgp.CANON:
        b, t = base[name], trk_all[name]
        bz, tz = dict(b["points"]), dict(t["points"])
        disagree = sum(1 for x in bz if x in tz and abs(bz[x] - tz[x]) > 1e-9)
        out.append(
            f"| {name} | {len(b['lines'])} | {b['multi']} | {b['rmse']:.2f} / {b['jumps']} / {b['max_step']:.1f} | "
            f"{t['rmse']:.2f} / {t['jumps']} / {t['max_step']:.1f} | {disagree} |"
        )
    out.append("")

    print("\n".join(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
