---
id: 049
title: OpenAPI 3.1 spec for the registrar REST API (contract for Go handlers and the web client)
agent: flash
tier: T1
depends_on: [001]
verify: make verify
timeout_min: 30
---
## Goal
Write the API contract first so the Go service and the web app can be built in parallel against it.

## Read first
- docs/02-architecture.md (REST section, DTO hints)
- docs/01-product.md

## Steps
1. `services/registrar/openapi.yaml`: every endpoint listed in the architecture doc with request/response schemas: SeriesDTO, InvestorDTO, ActionDTO (status enum, kind enum, ISO ids, dates ISO 8601 with +05:00, amounts as `{minor: string, display: string, currency: string}`), EntitlementDTO, ScheduleItem, ReconcileReport, ActivityItem, AdvanceRequest/Response, error schema `{code, message, onchainError?}`; explorer URLs as fields.
2. Validate with `npx @redocly/cli lint` if available (otherwise `python -c 'import yaml'` parse); add `make openapi-lint`.

## Acceptance criteria
- [ ] Spec lints; every path in docs/02 present; DTO fields documented.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/049.md`, then print exactly `DONE:049` or `BLOCKED:049 <reason>`.
