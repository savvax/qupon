---
id: 91579
title: /proof reaches All checks pass fast
agent: glm
tier: T1
depends_on: [91576]
verify: make verify
timeout_min: 150
---
## Goal
A91567-2 of `reports/audit/live-sweep.md`: `/proof` sub-checks take ~45–90 s against the public devnet RPC before
"All checks pass"; a judge may leave before it finishes. (91576 already added an RPC fallback — build on it.)

## Do
- Fetch the manifest's transactions with bounded parallelism (e.g. 6–8 in flight) instead of one by one, and batch account
  reads (`getMultipleAccounts`); keep every check the page performs (no check skipped, no result cached across sessions
  that would make the verification less independent).
- Show progress per check (n / total) so a judge sees it moving; target "All checks pass" < 15 s on public devnet RPC for the
  biggest proof mint (measure before/after with a Playwright timing script against `pnpm start` locally; numbers in worklog).
- Handle 429 with backoff (public RPC rate limits) instead of failing a check.

## Constraints
Pre-submission (code freeze 2026-10-12 12:00 Almaty); smallest safe change; en/ru/kk key parity; never weaken a test; no secrets;
do not deploy; never name other hackathon participants.

## Finish
Commit with `task: 91579`, write `reports/worklog/91579.md` (3–6 lines), print `DONE:91579` or `BLOCKED:91579 <reason>`.
