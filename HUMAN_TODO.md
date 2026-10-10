# HUMAN_TODO — questions and requests from agents to the human (newest at the bottom)

Format: `- [ ] YYYY-MM-DD HH:MM (task NNN) <question>. Default if unanswered: <what the agent will assume>.`
The human answers inline under the item. The planner pass folds answers into tasks.

- [x] 2026-10-05 00:00 (kit) Confirm the product name: "Qupon" (default) or another. Default: Qupon.
    Default applied: Qupon (live, in every submission text).
- [x] 2026-10-05 00:00 (kit) Confirm the third corporate action: bondholder meeting → coupon change (default) or early redemption only. Default: meeting + MCAL bonus.
    Default applied: bondholder meeting → terms change (BMET/CHAN) plus early redemption (MCAL) as bonus; partial call (PCAL) supported on-chain since task 1402.
- [x] 2026-10-05 00:00 (kit) Provide `.env` (Helius key, Z.ai key) and run `ops/wallets.sh`, fund wallets (SOL via faucet.solana.com, USDC via faucet.circle.com).
- [ ] 2026-10-05 00:00 (kit) Lawyer check: art. 18-2 quorum/approval thresholds for bondholder meetings — we default to 50% quorum / 2/3 approval as *configurable*, not statutory. Confirm wording for README.
- [x] 2026-10-05 04:53 (021) rebase conflict on task/021-go-chain-reader (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved by the lead (both sides kept; api.Deps struct introduced to stop api.New signature conflicts); merged.
- [x] 2026-10-05 05:01 (026) rebase conflict on task/026-go-kase-notice (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved by the lead (both sides kept; api.Deps struct introduced to stop api.New signature conflicts); merged.
- [x] 2026-10-05 05:28 (022) rebase conflict on task/022-go-reconcile (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved by the lead (both sides kept; api.Deps struct introduced to stop api.New signature conflicts); merged.
- [x] 2026-10-05 — deploy: done by the lead on the team VPS (human decision: VPS instead of Vercel/Fly). Console https://qupon.85-192-29-7.sslip.io, API https://api.85-192-29-7.sslip.io; redeploy with `ops/deploy-vps.sh`. With ADVANCE_TOKEN set, anyone using the public console can advance the *open* demo action (intended for judges; announcing new actions stays CLI-only). To lock it: empty ADVANCE_TOKEN in /opt/qupon/web.env on the server and `docker compose up -d web` — the API then answers 401.
- [x] 2026-10-05 19:09 (103) rebase conflict on task/103-ui-radix-components (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved: the task was merged (tasks/done/), branch no longer needed.
- [x] 2026-10-05 21:50 (208) rebase conflict on task/208-bo-demo-investor (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved: the task was merged (tasks/done/), branch no longer needed.
- [x] 2026-10-05 23:25 (303) rebase conflict on task/303-cab-registrar-investors (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved: the task was merged (tasks/done/), branch no longer needed.
- [ ] 2026-10-06 06:41 (from 601-cors-wildcard)
    # 601 — CORS wildcard on public reads (scanner finding)
    
    The pi-lens scanner flags `Access-Control-Allow-Origin: *` (`corsReadOnly`, `services/registrar/internal/api/api.go:284`) as "allows any website to make credentialed requests".
    
    - The line is pre-existing `main` code, byte-identical in this worktree; task 601's api.go diff is one line (the `mountAssets` anchor).
    - The scanner's premise does not hold: the middleware never sends `Access-Control-Allow-Credentials`, and the Fetch spec forbids credentialed requests when ACAO is `*` — credentialed cross-origin reads are impossible. Writes get no CORS headers and no `Allow-Headers`, so authenticated cross-origin writes fail preflight; the browser token lives in an httpOnly cookie anyway.
    - The wildcard is the documented mechanism (inline comment) serving public devnet state to the investor portal from any origin.
    
    **Decision needed (default = keep as-is):** keep the documented wildcard, or restrict public reads to a configured origin allowlist (needs a new config knob and the list of portal origins). Follow-up task filed as `tasks/todo/9601-cors-origin-policy.md`.
- [x] 2026-10-06 06:46 (1001) rebase conflict on task/1001-kase-client-api (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved: the task was merged (tasks/done/), branch no longer needed.
- [x] 2026-10-06 06:46 (702) rebase conflict on task/702-system-health-api (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved: the task was merged (tasks/done/), branch no longer needed.
- [x] 2026-10-06 07:43 (704) rebase conflict on task/704-admin-series-audit-pages (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved: the task was merged (tasks/done/), branch no longer needed.
- [x] 2026-10-06 08:46 (1002) rebase conflict on task/1002-kase-ui (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved: the task was merged (tasks/done/), branch no longer needed.
- [ ] 2026-10-09 18:38 (1511) BLOCKED by glm-2: agent committed on branch HEAD instead of task/1511-program-demo-clock (work kept on HEAD) — fix, then delete the blocked_reason line in tasks/todo/1511-program-demo-clock.md.
- [ ] 2026-10-10 12:06 (from 91512-worktree-deleted)
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
- [ ] 2026-10-10 13:32 (from 1533-worktree-branch-mismatch)
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
- [ ] 2026-10-10 13:52 (from 91530-paying-agent-demo)
    # 91530 — paying agent as a one-click demo role?
    
    Task 91530 asks for one-click demo cards for "issuer, registrar, investor, paying agent" on
    `/login`. The backend has no paying-agent identity: `services/registrar/internal/api/auth.go`
    maps exactly `issuer|registrar|investor` (investor → `investor_demo`), and the web `Role` type
    (`apps/web/src/lib/session.ts`) has no paying-agent value — the paying agent is an operator
    wallet, and its step ("Confirm bank payout") is pushed from the registrar console
    (`e2e/guidance.spec.ts`).
    
    **Default taken:** shipped the three working demo roles; a fourth card that errors on click
    would be worse than none. The registrar card's line already names the payout step.
    
    **If a paying-agent demo identity is wanted**, it needs its own task: Go `demoRoles` + store
    role, web `Role`/`ROLE_HOME`, a home cabinet (or a read-only view of bank-routed payouts),
    mock sessions, and e2e. Roughly a backend+web task, not a design one.
