---
id: 007
title: register_investor / suspend / reinstate / subscribe (DvP) / issue_units
agent: claude
tier: T0
depends_on: [005]
verify: make verify
timeout_min: 60
---
## Goal
Implement the holder registry and primary placement so that only KYC'd wallets can hold the bond and placement is an atomic delivery-versus-payment.

## Read first
- docs/02-architecture.md (instructions 2–5)
- docs/01-product.md (S0)

## Steps
1. `register_investor(kyc: KycParams{investor_type, residency, tax_rate_bps, kyc_ref})`: creates Investor PDA, creates bond ATA (init_if_needed, Token-2022) and cash ATA (init_if_needed) with payer = registrar, CPI `thaw_account` with series PDA signer seeds. Emit `InvestorRegistered`.
2. `suspend_investor` → CPI `freeze_account`; `reinstate_investor` → thaw.
3. `subscribe(units, price_per_unit)`: investor signer; checks Investor Active and series Active; CPI `transfer_checked` cash investor→issuer cash ATA (amount = units × price, u128 math); CPI `mint_to` units to investor bond ATA with series PDA signer; `total_issued += units`. Emit `Subscribed`.
4. `issue_units(units)`: issuer signer; mint without cash. Emit `UnitsIssued`.
5. Tests: register + subscribe happy path (balances checked both legs); unregistered wallet: a transfer to its frozen ATA fails; suspended investor cannot subscribe; subscribe with insufficient cash fails.

## Acceptance criteria
- [ ] All tests green in LiteSVM.
- [ ] A frozen (unregistered) ATA cannot receive tokens — proven by a test, and documented in README later.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/007.md`, then print exactly `DONE:007` or `BLOCKED:007 <reason>`.
