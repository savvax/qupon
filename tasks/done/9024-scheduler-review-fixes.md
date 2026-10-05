---
id: 9024
title: 024 review fixes — scheduler nil clock panic, approvals dedup stalls repeated batch steps
agent: claude
tier: T1
depends_on: [024]
verify: make verify
timeout_min: 30
---
## Goal
Review of 024: `main.go` builds the Scheduler without `Now` → nil-func panic on the first tick (kills the registrar). `approvals.dedup_key UNIQUE` + INSERT OR IGNORE drops every re-proposal after the first executed one → snapshot/pay/retire batches stall in approval mode. Web proxy: upstream fetch failure → non-JSON 500.

## Acceptance criteria
- [ ] Scheduler defaults its clock; dedup only among pending rows (migration 004); proxy answers JSON 502 when the API is down; tests; `make verify` green.
