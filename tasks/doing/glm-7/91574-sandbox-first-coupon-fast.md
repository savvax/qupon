---
id: 91574
title: judge sandbox reaches coupon 1 within the promised 3 minutes
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 150
---
## Goal
Finding A91571-3 (`reports/audit/judge-score.md`): "Try it in 3 minutes" → first money ≈ 5 min (create 42 s, first announce
≈ issue + 177 s on the 1 day = 1 s clock, `services/registrar/internal/sandbox/sandbox.go:29-31`).

## Do
- Make the first coupon announce land ≤ 30 s after the series exists, so coupon 1 is paid ≤ 3 min from the click, by
  shifting the sandbox calendar (e.g. issue date backdated in demo days so the first record/payment dates are near) — check
  what the program accepts for issue/record/payment dates (`programs/qupon_bonds`, series:create terms) and keep all dates
  consistent and honest (calendar card, "Day N of M", accrued interest in the DvP scenario, maturity still reachable).
- If the program forbids a past issue date, shorten the first coupon period on the sandbox terms instead; if neither is
  safe, report BLOCKED with the reason — do not change the program.
- Unit tests in `internal/sandbox` for the computed schedule; mock-mode sandbox e2e green; update
  `apps/web/e2e/live/sandbox.spec.ts` timeouts/comments only if the timings change (keep every assertion).
- Measure in a local devnet run if keys are available (`make api` with SCHEDULER=1) and put the timings in the worklog.

## Constraints
Pre-submission (code freeze 2026-10-12 12:00 Almaty). Smallest safe change; never weaken a test; do not deploy; never
print or commit secrets; never name other hackathon participants or compare with them anywhere.

## Finish
Commit with `task: 91574`, write `reports/worklog/91574.md` (3–6 lines), print `DONE:91574` or `BLOCKED:91574 <reason>`.
