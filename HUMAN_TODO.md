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
- [x] 2026-10-05 — deploy: done by the lead on the team VPS (human decision: VPS instead of Vercel/Fly). Console https://qupon.185-216-25-91.sslip.io, API https://api.185-216-25-91.sslip.io (primary VPS, user@185.216.25.91; the old box root@85.192.29.7 stays as fallback); redeploy with `ops/deploy-vps.sh`. With ADVANCE_TOKEN set, anyone using the public console can advance the *open* demo action (intended for judges; announcing new actions stays CLI-only). To lock it: empty ADVANCE_TOKEN in /home/user/qupon/web.env on the primary (/opt/qupon/web.env on the old box) and `docker compose up -d web` — the API then answers 401.
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
- [ ] 2026-10-10 18:24 (from 91537-worktree-reassigned)
    # 91537 — verify runs in a worktree that now belongs to task 91519
    
    **What happened.** Session 91537 started in `.worktrees/glm-8`. After an interruption, the queue re-assigned
    `glm-8` to `task/91519-cli-series-list` (it is registered there now, tip 3ea86cd4, and its lifecycle — deleted
    and re-created between rounds — matches the `getcwd` failures reported by the verifier). The automated
    `make verify` for 91537 still uses the session's original cwd `glm-8`, so it either hits a deleted directory
    (`make: getcwd: No such file or directory`) or would verify the wrong branch.
    
    **Where 91537's work actually is.** Branch `task/91537-web-learn-plan15` @ `381ef50d`
    (`feat(web): /learn explains the plan-15 mechanics`, `task: 91537`), checked out in
    **`/Users/dev/code/hackatons/kase/qupon-kit-w91537`** — `make verify` green there (re-run after each round),
    rebased on main, status clean. All acceptance items pass (unit tests incl. messages/glossary, guidance.spec,
    locale-stability.spec, typecheck, lint, screenshots 1440/390 × en/ru/kk in `reports/design/91537/`).
    
    **Why I did not "fix" it by retaking glm-8.** glm-8 is a live worker's worktree; re-registering it to my branch
    would break task 91519 and re-trigger mutual deletion (this already caused the round-1 SIGKILL storms).
    
    **Decision needed (default in bold).** Re-point 91537's verification to
    `/Users/dev/code/hackatons/kase/qupon-kit-w91537` (**default: run `make verify` there; merge
    `task/91537-web-learn-plan15`; then `git worktree remove /Users/dev/code/hackatons/kase/qupon-kit-w91537`**),
    or explicitly free `glm-8` and hand it back to 91537.
- [ ] 2026-10-11 01:34 (91548) rebase conflict on task/91548-design-fix-format-font (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
- [ ] 2026-10-11 04:01 (from 91552-worktree-collision)
    # 91552 — two agents share this worktree; my uncommitted edits were destroyed
    
    ## What happened
    - Around 03:01–03:03 (+05) a second agent (task 91551-design-action-flow; its 15 files appear as uncommitted
      modifications in this worktree) interleaved `git stash` cycles with mine: all nine of my uncommitted files were
      reset to HEAD while theirs stayed. `git stash list` ended empty.
    - Recovery: my exact changeset survived as dangling stash commit `42768c0d` ("WIP on task/91552…");
      `git checkout 42768c0d -- <9 files>` restored it bit-identically (79+/54−) and I committed immediately
      (10ad0880) so further stash collisions cannot eat it. Their uncommitted files were never touched and are still
      in the worktree for them to commit.
    - Question: was 91551 supposed to run in `.worktrees/glm-7` too? If yes, expect more stash races; if not, its
      agent picked the wrong worktree. Default taken: recovered, committed only my files, continued.
    
    ## Pre-existing, time-flaky `e2e/locale-stability` failures at HEAD (not from 91552)
    - Cabinet NowBar `<p>` width is locale-variable on /investor, /registrar, /issuer/series/new; whether it fails
      depends on which action the mock's live clock currently promotes ("Fund escrow" vs "Confirm bank payout"
      observed 40 min apart). File: `components/shell/StepNowBar.tsx` (task 91551's scope, finding 10).
    - kk 390 `/` hero: the eyebrow (`Hero.tsx`, plain `t("hero.badge")`) makes kk content ~16 px taller, shifting the
      centered h1 up 8 px — this is finding 3 itself (task 91549).
- [ ] 2026-10-12 07:37 (from 91582-devnet-rpc-quota)
    # 91582 — devnet RPC quota exhausted on both prod servers (P0, owner action)
    
    `reports/audit/new-server-sweep.md` A91582-1: every server-side chain read 502s on BOTH deployments
    (new primary `api.185-216-25-91.sslip.io` and old `api.85-192-29-7.sslip.io`). The old server's error
    names the cause: `getProgramAccounts() on https://devnet.helius-rpc.com → 429` (keyed `RPC_URL` from
    `.env`, `ops/deploy-vps.sh:15`). Browser-side devnet reads are healthy, so this is provider quota, not
    devnet. The bonds board, all 4 showcase dossiers, `/schedule`, `/holders/*` and the registrar actions
    registry are down — the scored demo surface.
    
    **Need:** raise/replace the Helius devnet quota (or switch `RPC_URL` to another provider) and redeploy
    both boxes; I cannot do this from the repo (no ssh, keys are secrets).
    
    **Default taken:** audit report filed; sweep tools kept in `reports/audit/tools/` so phase 1 can be
    re-run in one command once RPC is restored (three findings are parked as unverifiable until then).
