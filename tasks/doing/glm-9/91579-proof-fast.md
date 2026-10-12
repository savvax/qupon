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

## Review feedback (round 1, 2026-10-12 07:23) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The code is sound. Bounded parallelism, the batched entitlement read, 429 backoff, the retry when a node returns null for a known transaction, and the ETA line (all three locales) all keep every check, and no test was weakened. The fallback endpoint was swapped from a dead one to OnFinality. The task's goal is speed, though, and there is no evidence the change is faster. The only post-change timing (87 s) is worse than the baseline (36.6 s / 57.2 s), and the worker blames IP throttling. Under 15 s is credibly impossible on keyless RPC and has been escalated to the human. Before merging, a clean back-to-back timing of base vs HEAD must show no regression. Tests and screenshots were not run here because Bash was denied.

### Blocking
- reports/worklog/91579.md:5 — There is no evidence the change makes /proof faster, and the only post-change number is slower. The acceptance criterion is 'All checks pass' in under 15 s on public devnet RPC, measured before and after. The worklog records a baseline of 36.6 s (28 tx) and 57.2 s (46 tx). After the change, the only figure is 'best observed 87 s', attributed to an IP penalty box. On a judge-facing page during the code freeze, a possible regression with no clean measurement cannot merge. The worker's report that the public-node quota makes under 15 s impossible is credible and is escalated in reports/questions/91579-keyed-devnet-rpc.md, but that does not show this change is at least no worse than before.
  **Fix:** Re-run `pnpm --filter @qupon/web build && node apps/web/scripts/proof-timing.mjs` from a clean IP (another network or a fresh VPS) for both the base commit 02996f91 and HEAD, back to back, and put both JSON rows in the worklog. Merge only if HEAD is no slower than base for both mints (28 tx and 46 tx). If HEAD is slower, change the lane pacing in apps/web/src/lib/proof/endpoints.ts: (a) set the OnFinality lane's starting interval to 2000 ms, not 700, since its measured ceiling is about 0.5 req/s, so it does not 429-storm and double into 4 s; and (b) cut the pool width in chain.ts from 7 to 3 (the old value) if extra requests in flight only add 429s. Then measure again.

### Acceptance criteria not met
- 'All checks pass' < 15 s on public devnet RPC, measured before/after — Worklog: before 36.6 s / 57.2 s; after, best observed 87 s (IP reported as penalised). No clean after-measurement. The under-15 s target is escalated to the human as needing a keyed RPC.
