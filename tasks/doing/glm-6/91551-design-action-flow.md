---
id: 91551
title: "design pre-flight (Opus review): corporate-action flow truth (console and sandbox)"
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
- `reports/design/preflight/opus-review.md` — your findings (4, 7, 8, 10, 11, 16) and the "Task grouping" section (your file list and gate)
- `docs/design/language.md`; the screenshots the review used: `reports/design/preflight/opus/`
- apps/web/e2e/sweep.spec.ts (`SWEEP_OUT`, `SWEEP_ROUTES`) for re-shots

## Scope (from the review's grouping — touch only these files; other tasks own the rest)
- Files: `lib/actionFlow.ts`, `lib/actionFlow.test.ts`, `components/ui/ActionFlow.tsx`,
     `app/(cabinet)/registrar/actions/[pda]/page.tsx`, `app/(cabinet)/registrar/page.tsx`,
     `app/(cabinet)/registrar/_components/Pipeline.tsx`, `app/(cabinet)/CabinetNow.tsx`,
     `app/(public)/sandbox/[id]/SandboxView.tsx`, `app/(public)/sandbox/[id]/panels.tsx`, `lib/tours.ts`.
   - Gate: vitest for actionFlow, locale-stability (`/registrar`), re-shots of `/registrar`, the three console
     fixtures and `/sandbox/fx-{paying,defaulted}`.

## Do
- Implement each listed finding; if one is impossible as written, implement the closest equivalent and explain it in
  `reports/design/preflight/fixes.md` (`#<finding> — …`).
- en/ru/kk strict key parity; kk is the longest — check it at 390.
- Re-shoot the screens named in your gate with `SWEEP_OUT=reports/design/preflight/opus-after` and commit them.

## Acceptance
Every listed finding implemented (or explained); the gate in the grouping passes; `make verify` green.
Commit `fix(web): design pre-flight — corporate-action flow truth (console and sandbox)` (`task: 91551`).

## Finish
Write `reports/worklog/91551.md` (3–6 lines), commit with `task: 91551`, print `DONE:91551` or `BLOCKED:91551 <reason>`.

## Review feedback (round 1, 2026-10-11 03:21) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Findings 4, 7, 8, 11 and 16 are implemented correctly and match the console and sandbox screenshots. Two things block the merge. First, finding #10 copied the Alerts card above the Pipeline instead of moving it, so /registrar shows Alerts twice and has two data-tour=\"alerts\" elements. Second, commit b41d636 brings in another task's out-of-scope changes (findings 9, 17, 18, 19 files and globals.css). To fix: delete the second Alerts card, re-shoot /registrar, and drop b41d636 from the branch.

### Blocking
- apps/web/src/app/(cabinet)/registrar/page.tsx:118 — Finding #10 says to move the Alerts card above the Pipeline. The worker added a new card above it but left the old one below, so /registrar now shows Alerts twice (see the registrar-en-1440 screenshot, where the same three rows appear at the top and the bottom). There are also two elements with data-tour="alerts", so the tour step can point at the wrong one.
  **Fix:** Delete the second `<Card data-tour="alerts">…<Alerts alerts={deriveAlerts(actions)} /></Card>` block after the Pipeline div (around lines 118-123), keeping only the one at line 107. Then re-shoot /registrar into reports/design/preflight/opus-after (en/ru/kk × 1440/390) and commit.
- apps/web/src/components/ui/ActorChip.tsx — Commit b41d636 ("commit changes the agent left uncommitted") changes files outside this task's scope. They belong to grouping task 4 (findings 9, 17, 18, 19): ProvenanceChip.tsx, ActorChip.tsx, WalletButton.tsx, PublicShell.tsx, NetworkBadge.tsx, PortfolioHeader.tsx, PayoutCalendar.tsx, ProofView.tsx and globals.css, plus reports/ui/*.png. The task says "touch only these files; other tasks own the rest". Merging this commit will conflict with or duplicate task 4's branch, and nobody has reviewed it against that task's gate.
  **Fix:** Remove b41d636 from this branch (`git revert b41d636` or rebase it out) so the branch only touches the 10 files in the scope list, plus messages bankPending, sweep.spec.ts, reports and the worklog. If the changes are wanted, land them through the task-4 branch.

### Acceptance criteria not met
- #10 Defaulted ranks first, alerts above the pipeline, Pipeline cleanup, tours reordered — RANK has Defaulted: -1 and the NowBar leads with the default. The Pipeline changes are done: corpId moved to title, '!' badge removed, bank icon plus sr-only label, sentence-case heads. Tours are reordered. But the Alerts card was copied, not moved, so it renders twice.
- Stay within the listed file scope — b41d636 changes 9 component and css files owned by grouping task 4.

Design score: 6/10
