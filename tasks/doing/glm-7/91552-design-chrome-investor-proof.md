---
id: 91552
title: "design pre-flight (Opus review): shared chrome, investor, proof"
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
---
## Goal
Task 1537's Opus design review (`reports/design/preflight/opus-review.md`) found what still keeps Qupon behind the best
the exact change (files, tokens/classes, en/ru/kk copy) and why it matters to judges.

## Read first
- `reports/design/preflight/opus-review.md` — your findings (9, 17, 18, 19, 20) and the "Task grouping" section (your file list and gate)
- `docs/design/language.md`; the screenshots the review used: `reports/design/preflight/opus/`
- apps/web/e2e/sweep.spec.ts (`SWEEP_OUT`, `SWEEP_ROUTES`) for re-shots

## Scope (from the review's grouping — touch only these files; other tasks own the rest)
- Files: `components/ui/ProvenanceChip.tsx`, `components/ui/ActorChip.tsx`, `components/wallet/WalletButton.tsx`,
     `components/shell/PublicShell.tsx`, `components/shell/NetworkBadge.tsx`,
     `app/(cabinet)/investor/_components/PortfolioHeader.tsx`, `app/(cabinet)/investor/_components/PayoutCalendar.tsx`,
     `components/proof/ProofView.tsx`.
   - Gate: locale-stability, re-shots of `/`, `/investor` and `/proof/<plan-15 mint>` at 1440/390.

Tasks 1 and 2 both touch the landing, but in different files: 1 changes presentation, 2 changes data selection.
Task 3 only reads `ActorChip`, which task 4 edits. They can merge in any order.

## Do
- Implement each listed finding; if one is impossible as written, implement the closest equivalent and explain it in
  `reports/design/preflight/fixes.md` (`#<finding> — …`).
- en/ru/kk strict key parity; kk is the longest — check it at 390.
- Re-shoot the screens named in your gate with `SWEEP_OUT=reports/design/preflight/opus-after` and commit them.

## Acceptance
Every listed finding implemented (or explained); the gate in the grouping passes; `make verify` green.
Commit `fix(web): design pre-flight — shared chrome, investor, proof` (`task: 91552`).

## Finish
Write `reports/worklog/91552.md` (3–6 lines), commit with `task: 91552`, print `DONE:91552` or `BLOCKED:91552 <reason>`.

## Review feedback (round 1, 2026-10-11 03:35) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Findings 9, 17, 18, 19 and 20 are implemented as specified, with sensible documented deviations, and the committed after-shots look good (design 8/10). The branch is still blocked: the orchestrator's catch-up commit a4196e64 brought ~1,300 changed lines of task 91551's unreviewed WIP from the shared worktree into it. Drop that commit (and move those changes to 91551's branch) and the 91552 work at 607f0095 can merge.

### Blocking
-  — The branch contains another task's unreviewed work. The last commit a4196e64 ("chore: commit changes the agent left uncommitted after DONE", task: 91552) pulled task 91551's uncommitted WIP from the shared worktree into this branch. That is 15 files and +946/−382 lines, all outside 91552's scope: CabinetNow.tsx, registrar/actions/[pda]/page.tsx (412 lines), registrar/page.tsx, Pipeline.tsx, sandbox panels.tsx (587 lines), SandboxView.tsx, StepNowBar.tsx, ActionFlow.tsx, lib/actionFlow.ts, actionFlow.test.ts, tours.ts, the sweep.spec.ts INTR3/DFLT/REDM fixtures (its own comment says "task 91551 re-shots") and messages en/ru/kk `bankPending`. The worker's own reports/questions/91552-worktree-collision.md says these files belong to 91551. Merging would ship 91551's half-done, unreviewed work under 91552's id. It would also conflict with or duplicate 91551's own branch.
  **Fix:** Drop commit a4196e64 from task/91552-design-chrome-investor-proof: `git reset --hard 607f0095` on this branch, or `git revert a4196e64`. Before that, save the 91551 files to task 91551's branch or worktree, e.g. `git diff 607f0095 a4196e64 > /tmp/91551.patch` and apply the patch there. Then re-run make verify on 607f0095. Separately, the orchestrator should stop giving 91551 and 91552 the same worktree (.worktrees/glm-7).

### Acceptance criteria not met
- Touch only the files the grouping assigns — Commit a4196e64 adds 15 files that belong to task 91551.

Design score: 8/10
