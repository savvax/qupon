---
id: 1416
title: CSV formula guard, kase cache eviction, Almaty times in scheduler reasons
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 45
---
## Goal
1. `services/registrar/internal/reports/reports.go` (WriteCSV ~L131-141; HoldingTable/PayoutTable ~L145-160): user-entered cells (KYC ref, investor type, residency, series) starting with `= + - @ \t \r` run as formulas in Excel (the BOM makes Excel open the file). Prefix `'` to such cells in WriteCSV; leave cells that parse as numbers untouched.
2. `internal/kase/cache.go`, `internal/store/kase.go`: kase_cache is never evicted and anonymous callers can walk random codes. On put, `DELETE FROM kase_cache WHERE fetched_at < now - 7 days`.
3. `internal/scheduler/scheduler.go` (~L80-83, 101-103): wait reasons and announce logs print UTC; format with the Asia/Almaty location (the UI shows Almaty time).

## Acceptance criteria
- Test: WriteCSV with `=1+1` → `'=1+1`; `-5` numeric unchanged; `-abc` → `'-abc`.
- Test: an old cache row is gone after a put.
- Test: a scheduler reason string contains `+05:00` (or the Almaty-formatted time).
- `make verify` green; `reports/worklog/1416.md`.
