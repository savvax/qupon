---
id: 9203
title: Throttle back-office writes made by demo users (protect devnet operator SOL)
agent: claude
tier: T1
depends_on: [205, 206, 207, 208]
verify: make verify
timeout_min: 60
---
## Goal
With `DEMO_LOGIN=1` anyone can sign in as the demo issuer/registrar/investor and trigger CLI runs that spend the
operator keypairs' devnet SOL (series creation, onboarding, advance, demo subscribe/vote). Add a throttle so a
script cannot drain them. Real (non-demo) users are not throttled.

## Read first
- `services/registrar/internal/api/rbac.go` (`requireRole`, user in context via `auth.UserFrom`)
- `services/registrar/internal/auth/limiter.go` (`Limiter.Allow(key, now)`)
- `services/registrar/internal/api/api.go` (where the write routes are registered)

## Steps
1. In `rbac.go` add `func demoThrottle(l *auth.Limiter, now func() time.Time) func(http.Handler) http.Handler`: after
   `requireRole`, if the context user `IsDemo`, call `l.Allow("demo:"+user.Role, now())`; on false answer
   `429` with `writeErrorCode(w, 429, "demo_throttled", "demo limit reached — try again in a few minutes")`.
2. Add `Deps.DemoLimit *auth.Limiter` (nil = no throttle). `cmd/registrar/main.go` sets
   `auth.NewLimiter(30, time.Hour)` (30 writes per demo role per hour).
3. Wrap every POST route under `/issuer/`, `/registrar/`, `/demo/`, `/actions/{pda}/advance` and
   `/approvals/{id}/approve` with it (after the role check).
4. Table test in `internal/api/auth_test.go`: a demo registrar with a `NewLimiter(2, time.Hour)` gets
   200/503-or-whatever-the-route-returns twice, then 429 `demo_throttled`; a non-demo registrar is never 429.
   Use the existing `newAuthServer` / `doPost` helpers and the `/_test/registrar` pattern (add a test-only
   POST route `/_test/registrar-write` wrapped like the real writes if that is simpler).

## Acceptance criteria
- [ ] Demo users get 429 `demo_throttled` after the limit; non-demo users never do.
- [ ] Both `openapi.yaml` copies document 429 on the throttled routes.
- [ ] `make verify` green; `reports/worklog/9203.md` written.

## Finish
Run `make verify`, commit with `task: 9203`, then print exactly `DONE:9203` or `BLOCKED:9203 <reason>`.
