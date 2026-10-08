---
id: 1406
title: Registrar: CLI survives client disconnect; demo sign-in not one shared rate bucket
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 45
---
## Goal
1. internal/executor/executor.go ~L197-199: any parent-context cancellation (client disconnect, shutdown) is reported as "timed out after 120s"/504 and kills the CLI mid-batch. Handlers for advance/approve/fund run the CLI with `context.WithoutCancel(r.Context())` (120 s cap stays); report "timed out" only when `errors.Is(err, context.DeadlineExceeded)`.
2. Rate limit (internal/api/auth.go ~L137 clientIP, apps/web/src/app/api/session/start.ts ~L64): the web server calls /auth/login and /auth/demo without X-Forwarded-For, so all visitors share one 20/min bucket — the 21st demo click during judging gets 429. Forward the incoming request's X-Forwarded-For (as set by Caddy) from startSession; registrar trusts XFF only from the internal network (keep current trust rules).

## Acceptance criteria
- Executor test with a sleep shim: cancel parent after 50 ms → run completes (or error is not "timed out").
- Auth test: two different XFF values get separate buckets; same XFF 21 times → 429.
- `make verify` green; `reports/worklog/1406.md`.
