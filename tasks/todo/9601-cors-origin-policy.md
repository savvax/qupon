---
id: 9601
title: Pin the CORS decision with a test and a doc line (no behaviour change)
agent: claude
tier: T1
depends_on: []
verify: make verify
timeout_min: 30
---
## Goal
Decision (lead, 2026-10-06): keep `corsReadOnly` as it is on main — GET/HEAD echo the request Origin with `Vary: Origin`, never `Access-Control-Allow-Credentials`; writes get no CORS headers. Feature tasks kept rewriting this block because a scanner flags it, which caused rebase conflicts. Pin it so nobody changes it again.

## Steps
- Add a table case to `TestCORSReadOnly` (services/registrar/internal/api/api_test.go) asserting that no response (GET, OPTIONS, POST) ever carries `Access-Control-Allow-Credentials`.
- Add one line under Gotchas in `docs/04-stack.md`: "CORS: public reads echo Origin without credentials (decided, task 9601). Scanners flag it; do not change `corsReadOnly` in feature tasks."
- Delete `reports/questions/601-cors-wildcard.md` if present (answered here).

## Acceptance criteria
- `corsReadOnly` code unchanged; the new test passes; the doc line exists; `make verify` green.

## Out of scope
Any change to CORS behaviour.
