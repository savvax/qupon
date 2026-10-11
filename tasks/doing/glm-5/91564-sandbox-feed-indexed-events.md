---
id: 91564
title: series activity finds indexed events of series created after boot (sandbox feed shows real steps)
agent: glm
tier: T1
depends_on: [91563]
verify: make verify
timeout_min: 150
---
## Goal
Live e2e on prod (2026-10-12): the judge sandbox `/sandbox/<id>` paid coupon 1, but its "Transactions" feed showed only 7
raw rows `scheduler:snapshot_batch`, `scheduler:pay_batch`, … (untranslated kinds) and none of the indexed events
(SeriesInitialized, InvestorRegistered, UnitsIssued, EntitlementPaid, …) although the ingest poller stored them
(registrar log: `ingested event kind=EntitlementPaid sig=33wJ…`). `e2e/live/sandbox.spec.ts:59` fails: 6 links, expected ≥ 8.

Root cause: `store.ListSeriesActivity` (`services/registrar/internal/store/activity.go:73`) matches events keyed by the
Series PDA through `(SELECT json_extract(data,'$.pda') FROM series WHERE mint = ?)`, but the `series` table is filled only
at startup (`cmd/registrar/main.go:62`, the only `UpsertSeries` caller). Any series created after boot (every sandbox,
every issuer-wizard series) has no row → its PDA-keyed events never match. Same bug on `GET /activity?mint=` (`api.go:153`).

## Read first
- `services/registrar/internal/store/activity.go` (ListSeriesActivity), `internal/api/api.go:140-160`, `internal/api/sandbox.go:255-270`
- `services/registrar/internal/chain/client.go:393` (Series PDA = FindProgramAddress(["series", mint], program))
- `apps/web/src/app/(public)/sandbox/[id]/panels.tsx` — `Feed` (~line 1066); `apps/web/messages/{en,ru,kk}/sandbox.json` → `tx`
- `apps/web/e2e/live/sandbox.spec.ts:55-63`

## Do
1. Go: derive the Series PDA from the mint in the callers (export one helper next to chain/client.go:393, e.g.
   `chain.SeriesPDA(program, mint solana.PublicKey) (solana.PublicKey, error)`, and use it at :393 too) and change the store to
   `ListSeriesActivity(ctx, mint, seriesPDA string, limit int)` with `WHERE series_mint IN (?, ?)` — drop the `series`-table
   subquery. Invalid mint in `/activity?mint=` → 400. Store table test: an activity row keyed by the PDA with NO `series` row is
   returned; a row of another series is not.
2. Web `Feed`: an indexed event and the autopilot's `scheduler:<step>` row share the signature — drop a `scheduler:*` row when
   an indexed row with the same `sig` exists. A remaining `scheduler:<step>` row renders a sentence, never the raw kind: new key
   `sandbox.tx.scheduler` = "Autopilot: {step}" (en; ru/kk translated; `{step}` = step with `_` → space). Key parity across
   en/ru/kk (messages.test). Unit test for the dedupe/label (vitest, next to existing panel tests or a small pure helper).
3. `e2e/live/sandbox.spec.ts`: before counting explorer links, click the feed's "Show all N" button when present (the feed
   shows 6 rows collapsed, preflight #11); keep `≥ 8`.
4. Do not deploy; do not touch prod.

## Acceptance
Go store/api tests above green; web unit test green; mock-mode sandbox e2e still green; `make verify` green.
Commit `fix(registrar,web): series activity matches the Series PDA without the boot-time series table` (`task: 91564`).

## Finish
Write `reports/worklog/91564.md` (3–6 lines), commit with `task: 91564`, print `DONE:91564` or `BLOCKED:91564 <reason>`.
