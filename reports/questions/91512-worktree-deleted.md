# 91512: worktree glm-7 deleted mid-task; shell unusable

**Task**: 91512 compute-unit benchmarks for plan-15 instructions (test + report).

**State when blocked**:
- The previous attempt's work was complete on paper: `programs/qupon_bonds/tests/cu_benchmarks.rs`
  extended with all 9 plan-15 scenarios, budgets = reference × 1.25 rounded up to 1,000,
  `reports/cu-benchmarks.md` regenerated with `QUPON_CU_REPORT=1`.
  It was committed as `a9193201` ("wip(91512): resume previous attempt") in worktree `glm-7`.
- `cargo test -p qupon_bonds --test cu_benchmarks` passed locally (1 passed) in that worktree.
- `make verify` then failed in `anchor build`/IDL (`could not compile qupon_bonds (lib)`); root cause
  not yet diagnosed when the environment died.

**What happened**:
- `.worktrees/glm-7` (this agent's cwd) was deleted at ~10:56 while the task was running;
  `.git/worktrees/glm-7` metadata is pruned as well.
- Branch `task/91512-cu-benchmarks-plan15` was recreated fresh from main at `4a50163f`
  (reflog: single "Created from main" entry, 10:56) — the wip commits are NOT on it.
  They should still exist as objects (`a9193201`, parent `7ca5c939`) until gc.
- Every bash invocation now fails at spawn ("Working directory does not exist"), so no
  git/make/commit/rebase is possible from this session.

**Asked of the human/orchestrator**:
1. Recreate the worktree for `task/91512-cu-benchmarks-plan15` (e.g.
   `git worktree add .worktrees/glm-7 task/91512-cu-benchmarks-plan15`) — or reset that branch
   to `a9193201` to restore the finished work — and respawn this task.
2. Note the pending `make verify` failure for the record: `anchor idl build` errored while
   `cargo test -p qupon_bonds` compiled the same lib fine; re-check after restore (may have been
   a transient/race with parallel workers, or an `idl-build` feature-gated error worth a look).

**Default taken**: none possible; no shell.
