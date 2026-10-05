---
id: 015
title: REDM/MCAL/PCAL: principal + final coupon, retire_batch (burn via permanent delegate), close_series
agent: claude
tier: T0
depends_on: [011]
verify: make verify
timeout_min: 60
---
## Goal
Required scenario 2 and the bonus early redemption: pay principal, burn tokens, close the mint, mark REDEEMED.

## Read first
- docs/02-architecture.md (instructions 14–15)
- docs/03-domain.md (§4 retirement order)
- docs/01-product.md (S2, S4)

## Steps
1. `announce_action` kinds Redemption/EarlyRedemption/PartialRedemption: `per_unit_principal = face` (PCAL: face × factor_bps / 10000; add `factor_bps` to args), coupon part accrued per `accrual_days` (final period for REDM; period_start→call_date for MCAL); `payment_at ≥ record_at`; MCAL allowed only if `call_date < maturity_date`.
2. `retire_batch`: pairs [Entitlement, bond ATA] max 12; action Retiring; `burn_checked` via permanent delegate (series PDA signer) of the ATA's current balance (≥ Entitlement.units expected; burn whatever is there); Entitlement Retired; `total_retired`, `holders_retired`. Emit `UnitsRetired`.
3. `close_series`: registrar; `holders_retired == holders_snapshotted`; `mint.supply == 0` else `SupplyNotZero`; metadata update_field `status=REDEEMED` (requires metadata update authority = registrar — consistent with task 006 decision); CPI `close_account` on the mint (MintCloseAuthority = series PDA) sending lamports to registrar; `Series.status = Closed`; action Completed. Emit `SeriesClosed`.
4. Tests: redemption of the brief holder: cash +10,500.00 tKZT, bond ATA balance 0, mint closed (account data empty); MCAL with 47 accrued days on a 15.95% series pays 20,824 coupon part per 10 units; `close_series` fails while supply > 0; un-ignore `redemption_pays_principal_plus_final_coupon`.

## Acceptance criteria
- [ ] Tests green including the previously ignored brief test.
- [ ] Order pay → complete(resume) → retire → close is enforced by status checks and covered by a test that tries to retire before complete.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/015.md`, then print exactly `DONE:015` or `BLOCKED:015 <reason>`.
