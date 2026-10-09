---
id: 91541
title: admin: per-series autopilot scenario (no_autofund) and visibility
agent: glm
tier: T1
depends_on: [1522]
verify: make verify
timeout_min: 90
---
## Goal
Task 1522 added `series_settings.no_autofund` (migration 007) and the scheduler honours it, but nobody can set it.
Expose it in the admin panel so an operator can let a demo coupon default on purpose, and manage visibility in one place.

## Read first
- services/registrar/internal/api/admin.go (`adminListSeries`, `adminPatchSeries`, `adminSeriesRow`)
- services/registrar/internal/store/series_settings.go (`SetSeriesNoAutofund`, `NoAutofundSeries`; do NOT change
  `UpsertSeriesSettings` semantics for the other fields)
- apps/web/src/app/(cabinet)/admin/series (the admin series table), docs/design/language.md, apps/web/messages/{en,ru,kk}

## Do
- `GET /admin/series` rows gain `noAutofund` (bool) and, read from chain where the row already has the series,
  `demoClock` (daySecs, 0 = real) and `inDefault`.
- `PATCH /admin/series/{mint}` accepts an optional `noAutofund` (bool) — stored with `SetSeriesNoAutofund`, other fields
  unchanged when absent. Audit log row like the existing admin changes.
- Web admin series table: a toggle column "Autopilot funds the escrow" (on = default), with a one-line hint "Off: the
  coupon defaults after its grace day — use for the default/cure demo"; DEMO clock and IN DEFAULT badges.
- openapi (both copies identical) + `apps/web/src/lib/api-schema.d.ts` (`pnpm gen`); Go tests (patch + list), a web unit
  test or spec for the toggle in mock mode; en/ru/kk strings.

## Acceptance
`go test ./services/registrar/...`, web typecheck/lint/test and the admin spec green; `make verify` green.
Commit `feat(admin): per-series autopilot scenario toggle` (`task: 91541`).

## Finish
Write `reports/worklog/91541.md` (3–6 lines), commit with `task: 91541`, print `DONE:91541` or `BLOCKED:91541 <reason>`.
