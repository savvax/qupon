# Task 1533 cannot run in worktree glm-1 — assignment/branch mismatch (needs orchestrator fix)

Spawned with task 1533 (investor v2 review fixes) and cwd `.worktrees/glm-1`, but:

1. glm-1 is checked out on `task/91538-web-landing-plan15` (a different task) and a live
   91538 agent is editing `apps/web/src/app/(public)/_landing/*` in this worktree right now.
2. Task 1533's branch `task/1533-web-investor-v2` is checked out in `.worktrees/glm-6`
   (wip snapshot `669497a0`), which is idle but its orchestrator is alive and will reuse it.
3. The 1533 wip originally sat in glm-1 (`fe91096`) and was moved to glm-6 mid-session at
   ~11:15; `make verify` for this spawn failed with `getcwd: cannot access parent
   directories` (harness ran from a deleted dir during the reshuffle — environmental).

Hard limits forbid branch create/switch/rename and touching other worktrees, so no safe
commit path exists from this spawn.

**Default taken:** none — stopped with `BLOCKED:1533`.

**Suggested fix (pick one):**
- Re-spawn 1533 in the worktree that holds its branch (glm-6), or
- move branch `task/1533-web-investor-v2` back into glm-1 after the 91538 agent finishes,
  then re-spawn 1533 here with the wip `669497a0` (or dangling `fe91096`) applied.

The 1533 review-fix work itself is well-scoped and the base tree is green on all gates
(Rust, clients/ts, Go incl. slow `internal/api`, apps/web, openapi) — only the six items
in the round-1 review remain.
