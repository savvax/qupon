---
id: 91550
title: "design pre-flight (Opus review): live data and public bond pages"
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
- `reports/design/preflight/opus-review.md` — your findings (1, 2, 6, 12, 15) and the "Task grouping" section (your file list and gate)
- `docs/design/language.md`; the screenshots the review used: `reports/design/preflight/opus/`
- apps/web/e2e/sweep.spec.ts (`SWEEP_OUT`, `SWEEP_ROUTES`) for re-shots

## Scope (from the review's grouping — touch only these files; other tasks own the rest)
- Files: `services/registrar/internal/api/api.go`, `services/registrar/internal/api/api_test.go`,
     `services/registrar/openapi.yaml`, `services/registrar/internal/api/openapi.yaml`, `lib/api-schema.d.ts`
     (generated), `lib/api.ts`, `mocks/api.ts`, `app/(public)/_landing/live.ts`, `app/(public)/bonds/page.tsx`,
     `app/(public)/bonds/[mint]/page.tsx`, `components/ui/DataTable.tsx`.
   - Gate: `make verify` (Go plus web), plus a live check of a QPNb1 dossier journal after deploy.

## Do
- Implement each listed finding; if one is impossible as written, implement the closest equivalent and explain it in
  `reports/design/preflight/fixes.md` (`#<finding> — …`).
- en/ru/kk strict key parity; kk is the longest — check it at 390.
- Re-shoot the screens named in your gate with `SWEEP_OUT=reports/design/preflight/opus-after` and commit them.

## Acceptance
Every listed finding implemented (or explained); the gate in the grouping passes; `make verify` green.
Commit `fix(web): design pre-flight — live data and public bond pages` (`task: 91550`).

## Finish
Write `reports/worklog/91550.md` (3–6 lines), commit with `task: 91550`, print `DONE:91550` or `BLOCKED:91550 <reason>`.
