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
