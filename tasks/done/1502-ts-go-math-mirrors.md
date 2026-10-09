---
id: 1502
title: TS + Go mirrors of the clock and accrued math; yield math
agent: glm
tier: T1
depends_on: [1501]
verify: make verify
timeout_min: 60
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1502 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1502: TS + Go mirrors of the clock and accrued math; yield math

**Agent:** glm · **Depends on:** 1501 · **Role:** ts-client

**Files:** `clients/ts/src/lib/clock.ts` (if 1511 already added it, extend), `clients/ts/src/lib/accrued.ts`, `clients/ts/src/lib/yield.ts`, tests `*.test.ts` reading `fixtures/entitlement.json`; Go `services/registrar/internal/entitlement/accrued.go` (+ `CivilClock`) with table tests over the same JSON; `fixtures/entitlement.json` gains `yield_cases`.

**Interfaces — Produces:** TS `accruedSigned(units, face, rateBps, dayCount, start: Ymd, settle: Ymd): { amount: bigint; days: number }`; `dirtyPrice(cleanPerUnit: bigint, accruedPerUnit: bigint): bigint`; `ytm({ cleanPrice, face, rateBps, frequency, settle, maturity, dayCount }): number` (Newton–Raphson on the street-convention price, tolerance 1e-10, ≤ 100 iterations, returns annual rate as a fraction); `currentYield(rateBps, face, cleanPrice): number`. Go `entitlement.AccruedSigned(...) (int64, int32, error)`, `entitlement.CivilClock`.

- [ ] Vectors (add to fixtures): `{"id":"par_bond_ytm_equals_coupon","clean":100000,"face":100000,"rate_bps":1000,"frequency":2,"settle":"2026-10-03","maturity":"2027-10-03","ytm":0.10}`, `{"id":"discount_95","clean":95000,"face":100000,"rate_bps":1000,"frequency":2,"settle":"2026-10-03","maturity":"2027-10-03","ytm":0.15592}` (two whole periods, settle on a coupon date: 95 = 5/x + 105/x², x = 1 + y/2 → y = 0.155920; tolerance 1e-5).
- [ ] Tests first, then implementation, then `pnpm --filter @qupon/client test`, `go test ./services/registrar/internal/entitlement/...`, `make verify`, commit `feat(math): accrued/clock mirrors in TS and Go; yield to maturity`.

**Acceptance:** all fixture vectors pass in TS and Go; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1502`, `reports/worklog/1502.md` written. Print `DONE:1502` or `BLOCKED:1502 <reason>`.
