---
id: 020
title: Go registrar skeleton: config, logging, SQLite store, chi HTTP server, healthz, OpenAPI stub
agent: glm
tier: T1
depends_on: [001]
verify: make verify
timeout_min: 45
---
## Goal
Stand up the service so that reader/reconciler/executor/scheduler/ISO tasks can plug in.

## Read first
- docs/02-architecture.md (Go registrar service)
- services/registrar/go.mod

## Steps
1. `cmd/registrar/main.go` with flags/env (`RPC_URL`, `PROGRAM_ID`, `DB_PATH`, `QUPON_CLI` path, `PORT`); `internal/config`; `internal/store` (modernc.org/sqlite, migrations in `migrations/*.sql`: series, actions, entitlements, activity, runs); `internal/api` (chi, JSON helpers, CORS for localhost:3000, `/healthz`, `/openapi.yaml` static); structured logging (slog).
2. `internal/chain/types.go`: Go structs for Series/Investor/CorporateAction/Entitlement mirroring the Rust layout (field order matters for Borsh).
3. Makefile target `make api`; `go test ./...` with a store test (temp DB).

## Acceptance criteria
- [ ] `go run ./cmd/registrar` serves `/healthz` → 200; tests green; lint clean.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/020.md`, then print exactly `DONE:020` or `BLOCKED:020 <reason>`.
