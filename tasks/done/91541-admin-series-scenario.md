---
id: 91541
title: admin: per-series autopilot scenario (no_autofund) and visibility
agent: glm
tier: T1
depends_on: [1522]
verify: make verify
timeout_min: 180
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

## Review feedback (round 1, 2026-10-10 12:42) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Fail: two fixes needed before merge. Backend, openapi (both copies identical), the generated schema, mock and the web unit test are correct, and the narrow Go and web tests pass. (1) The required Go tests for the noAutofund PATCH and list are missing: there is no test that the flag survives a later settings PATCH, or that demoClock/inDefault come from the chain. (2) At 390 px the autopilot switch has no visible label (design 7/10). Fix: add an lg:hidden label in SeriesAutopilot.

### Blocking
- services/registrar/internal/api/admin_test.go:326 — The task's Do list requires "Go tests (patch + list)" for the new fields, but the diff changes no *_test.go file. Nothing tests that PATCH {noAutofund} reaches SetSeriesNoAutofund, that a later PATCH without noAutofund keeps the flag (UpsertSeriesSettings must not reset it), that the audit row carries noAutofund, or that GET /admin/series returns noAutofund/demoClock/inDefault. go test passes only because nothing exercises these paths.
  **Fix:** In services/registrar/internal/api/admin_test.go, add TestAdminSeriesNoAutofund using the same setup as TestAdminHideSeriesAndList (store.Open, Deps{Auth, Read: fakeRead{}}, signIn admin). (1) PATCH /admin/series/<fMint> with {"noAutofund":true}: expect 200, response series.noAutofund == true, and st.NoAutofundSeries(ctx)[fMint] == true. (2) PATCH {"hidden":true} with no noAutofund: expect the flag still true in NoAutofundSeries. (3) GET /admin/series: expect the row to have noAutofund true, hidden true, and demoClock/inDefault equal to fakeRead's series DaySecs and InDefault==1. Set non-zero values on the fake, or a local variant, so these fields are actually checked. (4) PATCH {"noAutofund":false}: expect the mint to be gone from NoAutofundSeries. Optionally check the latest audit row's detail includes "noAutofund".
- apps/web/src/app/(cabinet)/admin/series/SeriesRowControls.tsx:197 — Design: on the 390 px phone card the autopilot switch shows only "On"/"Вкл" with no visible label. The column header "Autopilot funds the escrow" exists only in the lg+ table, so on phones the operator can't see what the switch controls except by guessing from the hint. The label is only in aria-label. Design score is 7, which blocks.
  **Fix:** In SeriesAutopilot (apps/web/src/app/(cabinet)/admin/series/SeriesRowControls.tsx:197), make this the first child of the outer div: <span className="text-[11px] font-bold uppercase tracking-wide text-n500 lg:hidden">{t("colAutopilot")}</span>. It matches the existing KASE TICKER label style and stays hidden on desktop, where the column header already names it. Re-run shots for /admin/series at 390 in en/ru.

### Acceptance criteria not met
- Go tests (patch + list) — No *_test.go in the diff. The only references to noAutofund in Go tests are the scheduler tests from task 1522.

Design score: 7/10
