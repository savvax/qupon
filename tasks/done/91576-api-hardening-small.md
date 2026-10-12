---
id: 91576
title: small API hardening from the security audit
agent: flash
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 60
---
## Goal
Findings A91570-3 and A91570-5 (`reports/audit/security-hygiene.md`) and A91571-5 (`reports/audit/judge-score.md`).

## Do
- `GET /approvals` (`services/registrar/internal/api/api.go:255`): back-office only — wrap in the same role guard the
  registrar routes use; update tests and any web caller (must send the session).
- 502 bodies: return a short stable message + error code; log the internal Anchor/RPC string server-side only. Keep the
  existing machine-readable error codes the web maps (grep the web for them) unchanged.
- `/proof` in-browser verifier: on RPC failure retry once against a second public devnet endpoint (configurable list,
  default `https://api.devnet.solana.com` then the second one already used elsewhere in the web, if any), show which RPC
  answered. Tests for the fallback.

## Constraints
Pre-submission (code freeze 2026-10-12 12:00 Almaty). Smallest safe change; never weaken a test; do not deploy; never
print or commit secrets; never name other hackathon participants or compare with them anywhere.

## Finish
Commit with `task: 91576`, write `reports/worklog/91576.md` (3–6 lines), print `DONE:91576` or `BLOCKED:91576 <reason>`.

## Review feedback (round 1, 2026-10-12 04:47) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Not mergeable yet, because of one small gap. The /approvals role guard, the central sanitizing of 502 bodies with server-side logging, and the /proof RPC fallback with its tests are all in place and correct. The Go approvals tests pass, and the /proof screenshots look clean. But the five chain_unavailable 502 sites in reports.go now drop the internal error without logging it, which misses the task's 'log server-side' requirement. The fix is to add one slog.Error line before each site.

### Blocking
- services/registrar/internal/api/reports.go:208 — Task asks for 502 bodies to carry a short stable message and for the internal Anchor/RPC string to be logged server-side only. The five chain_unavailable sites (lines 208, 239, 269, 309, 314) now drop `err` completely. The client gets the fixed message, but nothing is logged, so chain-read failures on the report endpoints no longer leave any trace on the server.
  **Fix:** At each of the 5 sites, add `slog.Error("upstream call failed", "code", "chain_unavailable", "error", err)` just before `writeErrorCode(...)`. That matches the writeError 502 branch in api.go:392; import log/slog if needed. Optionally add one Go test asserting a 502 from writeError returns `chain read failed` without the raw error text.

### Acceptance criteria not met
- 502 bodies: short stable message plus error code, internal string logged server-side only, web-mapped codes unchanged — The writeError 502 branch sanitizes and logs, which covers every writeError(…502…) site. The reports.go chain_unavailable sites sanitize but do not log. sandbox.go executor_failed still returns err.Error(); the worklog says this was deliberate. Codes are unchanged.

Design score: 8/10
