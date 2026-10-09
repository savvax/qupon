---
id: 1533
title: investor — claim, payout route, calendar, yield, holder lookup, signing guard
agent: glm
tier: T1
depends_on: [1530, 1502, 1525]
verify: make verify
timeout_min: 180
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1533 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)
- docs/design/language.md (from 1530)
- apps/web/src/app/globals.css

## Plan section
### Task 1533: investor — claim, payout route, calendar, yield, holder lookup, signing guard

**Agent:** glm · **Depends on:** 1530, 1502, 1525 · **Role:** frontend

- [ ] Claim button per unpaid funded entitlement (wallet-signed `pay_batch` for one holder via a new builder in `src/lib/portal.ts`; demo investor via the session proxy).
- [ ] Payout route card (wallet / bank: IBAN-like text hashed client-side with WebCrypto, only the hash leaves the browser; SIMULATED bank badge), signed by the wallet.
- [ ] Portfolio header: "Claimable now · Next coupon in N days · Received to date", plus a "Claim all" button.
- [ ] Payout calendar for the next 12 months of record/payment dates (from `/holders/{owner}`).
- [ ] Positions with clean, accrued and dirty value and YTM (`yield.ts`), plus default/cure badges.
- [ ] Public `/holder/[address]` page (no login) rendering `/holders/{owner}`.
- [ ] `walletSigner.ts`: before sending, compare the signed transaction's message bytes with the bytes we built; mismatch → abort with a clear error (unit test with a tampering mock wallet).

**Acceptance:** specs + unit tests green; Opus design score ≥ 8; `make verify` green.

## Finish
`make verify` green, commits carry `task: 1533`, `reports/worklog/1533.md` written. Print `DONE:1533` or `BLOCKED:1533 <reason>`.
