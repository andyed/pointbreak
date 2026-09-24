# Agent branch triage — RESOLVED, nothing is orphaned

Written 2026-08-30, **corrected 2026-08-30 after verification**. Untracked
working note, not project documentation.

## Verdict

**All the agent-fan-out work is already in `main`.** No wave-shape work is
orphaned. **All 12 worktrees are stale** — the 10 `worktree-agent-*` and both
detached ones — and are safe to remove. Nothing needs integrating, rebasing or
domain review.

The earlier version of this note concluded the opposite. It was wrong. The
error is recorded below because the same trap will catch the next session.

## The evidence

Every one of the nine branches landed on `main` as its own commit, same
subject line, during 2026-08-18..08-20:

| branch tip | landed in main as | subject |
|---|---|---|
| `3be8ac8` | `2b1d463` | anchor the set envelope to the live break line (#arm) |
| `60d6db2` | `d35b797` | physically derived floor under the set envelope (#env) |
| `9e742a7` | `a2b10c1` | the forward-pitch term is an EVEN map (#pitch) |
| `b289143` | `4405b50` | the wave is tallest where it breaks — dropMag re-scoped |
| `4c71d8c` | `a078e01` | per-stripe along-crest lifecycle clock (#slife) |
| `2079ce8` | `7190daf` | no measured bed, no ceiling — crestCeilM reports n/a |
| `8410734` | `14b51a3` | the pocket→whitewater path had no size |
| `4c5b7f4` | `8f54ebc` | the crest clock is continuous (#wrap) |
| `d459898` | `abddba5` | verify the 6a group-speed fix in pixels (#cg=0) |

`a53a59217b544bdd3` needs no row: its tip `bbcdd08` **is** a commit on `main`.

Three independent confirmations:

1. **The distinctive uniforms are all live in the working tree** — `u_pitchOdd`,
   `u_legacyDrop`, `u_stripeLife`, `u_setRef`, `SET_ANCHOR_S`, `crestClockS`,
   `stripeAgeAt`, `groupSpeedM`, `cgLegacy`, and `u_setDepth` with m = 0.425.
   These names exist nowhere but those branches.
2. **78–100% of each branch's added code lines appear verbatim in `main`.** The
   residue is reworded comments and lines `main` has since *superseded* — e.g.
   `afee537d`'s `return 0.5 + 0.5*cos(setPhase(s, t))` is the old `setEnv`,
   replaced by the modulation-depth form that landed later.
3. **Direct file diff.** `9e742a7:shared/model-glsl.js` vs
   `a2b10c1:shared/model-glsl.js` differ only by `main` additionally carrying
   the `#wrap` work. Main is a strict superset.

## The trap, for next time

**`git cherry` is NOT a reliable already-landed test.** It compares *patch-ids*,
which are hashes of the diff text. Work that landed by rebase or light rewrite
produces a different diff against a different base, so its patch-id differs and
`git cherry` reports `+` — "not upstream" — for code that is fully upstream.
Measured on the `#pitch` pair: branch `a009329d627f`, main `26c54903b34e`,
identical content.

The earlier note trusted `git cherry`, read nine `+` marks as nine orphaned
branches, and invented a 4,500-line integration job that does not exist.

**The tell was in the merge-bases and got missed.** They are not all `c13f231`;
they are seven different commits — `2b1d463`, `d272940`, `c6d2ae7`, `a91b2ee`,
`6c32ffe`, `f19b0fe`, `c13f231` — and several *are the landing commits of the
sibling branches*. `a23ed78`'s base is `2b1d463`, which is `#arm` landing. The
agents forked sequentially from a `main` that was already absorbing their work.

What to use instead: compare content, not patches — grep the distinctive
identifier, diff the file at both revisions, or match subject lines in the log.

## Remaining cleanup (safe)

Nothing here holds unlanded work. Removing all 12:

```
git worktree list --porcelain | awk '/^worktree/ && /\.claude\/worktrees/ {print $2}' \
  | xargs -n1 git worktree remove --force
git branch -D $(git branch --list 'worktree-agent-*' 'claude/*')
```

The two non-agent detached worktrees were checked separately and are **also
landed** — the earlier draft of this note wrongly flagged them as live work:

- `jovial-hofstadter-05ec3c` @ `ec9d0fc` — "bundle pp_monthly_ocean.js". Already
  in `main`: `scripts/build_site.py:66-67` carries that exact tuple. Not a live
  build bug.
- `zealous-driscoll-2134ff` @ `7f27167` — 5 commits of bed-clamp/url-param tests
  and hygiene. 92% of its lines are in `main`; `tests/url-params.test.js`,
  `tests/breaker-anatomy.test.js` and the 8196 port fix all exist there. The 5
  residual lines are assertion regexes `main` has since *evolved* — e.g. the old
  `float dropMag = mix\(...\)` pattern cannot match because the `#drop=legacy`
  re-scope made `dropMag` a uniform branch, and
  `tests/breaker-anatomy.test.js:96-97` asserts both arms of it instead.
