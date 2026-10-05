---
id: 027
title: REST read models for the UI: series, investors, schedule, actions, entitlements, activity; OpenAPI
agent: glm
tier: T1
depends_on: [021, 022]
verify: make verify
timeout_min: 45
---
## Goal
Everything the web app needs, in one JSON shape, with explorer links precomputed.

## Read first
- docs/02-architecture.md (REST)
- apps/web (to be built in 030)

## Steps
1. Handlers for every GET in the architecture doc; DTOs with human-readable amounts (`amountMinor`, `amountDisplay`, `currency`), status names, ISO kind codes, explorer URLs; pagination for entitlements; `GET /activity` from the store.
2. `openapi.yaml` written by hand (keep in sync) and served; httptest-based tests for each handler with a fake chain reader.

## Acceptance criteria
- [ ] `curl localhost:8080/series` returns demo data; OpenAPI validates with `redocly lint` or `swagger-cli` if available (optional).

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/027.md`, then print exactly `DONE:027` or `BLOCKED:027 <reason>`.
