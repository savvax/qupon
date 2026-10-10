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
