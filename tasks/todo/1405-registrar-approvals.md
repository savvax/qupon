---
id: 1405
title: Registrar: approvals can't run twice; stale proposals expire; reject endpoint
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 60
---
## Goal
1. Double execution (internal/api/approvals.go ~L68-83, internal/store/approvals.go ~L107): two concurrent approve clicks both run the CLI. Claim first: `UPDATE approvals SET status='running' WHERE id=? AND status='pending'`, check rows affected (409 if 0), set back to pending on failure.
2. Stuck scheduler (internal/scheduler/scheduler.go ~L207, migrations/004): an announce approval with a fixed `--record-at` that nobody approves before the record date can never run, stays pending forever and blocks re-proposal (dedup is on pending rows). In `propose`, mark pending rows of the series whose dedup_key differs from the current Decide step as `stale`; also stale an announce approval whose record-at is in the past.
3. Add `POST /registrar/approvals/{id}/reject` (registrar role) → status `rejected`; show it in the web autopilot list (Reject button, EN+RU) and in openapi.yaml.

## Acceptance criteria
- Test: two parallel approves against a counting fake executor → executor called once, second gets 409.
- Scheduler test with fake clock: propose announce, advance past RecordAt, tick → old row stale, fresh proposal exists.
- Reject endpoint test (role check + status). `make verify` green; `reports/worklog/1405.md`.
