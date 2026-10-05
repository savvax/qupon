---
id: 052
title: Playwright smoke tests against the mock API: series list, series page, action page states
agent: glm
tier: T1
depends_on: [030]
verify: make verify
timeout_min: 40
---
## Goal
Catch UI regressions from parallel work without a human clicking.

## Read first
- apps/web
- services/registrar/openapi.yaml

## Steps
1. `apps/web/e2e/*.spec.ts` with Playwright (chromium): pages render, status timeline shows all steps for a Completed action from mock data, download links present, SIMULATED badges where expected; `pnpm e2e` script; CI job (allowed to be optional/non-blocking).

## Acceptance criteria
- [ ] `pnpm e2e` green locally against the mock API.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/052.md`, then print exactly `DONE:052` or `BLOCKED:052 <reason>`.
