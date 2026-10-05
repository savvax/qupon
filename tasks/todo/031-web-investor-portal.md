---
id: 031
title: Investor portal: holdings, schedule, entitlement history, wallet-signed vote and subscribe (DvP)
agent: glm
tier: T1
depends_on: [029, 018]
verify: make verify
timeout_min: 60
---
## Goal
The investor side: connect a wallet and act on-chain directly from the browser.

## Read first
- docs/01-product.md (S0, S3)
- clients/ts/src/generated
- apps/web/lib

## Steps
1. `/portal`: connect wallet → investor status (registered? suspended?), holdings per series (units, face value total), next coupon date and estimated amount (computed with the TS daycount lib), entitlement history (from API), open meetings with For/Against/Abstain buttons building `cast_vote` with the generated client and signing with wallet-adapter (bridge web3.js 1.x signer → Kit `TransactionSigner`; keep the bridge in `lib/walletSigner.ts`), subscribe form (units, price) building `subscribe`.
2. Explorer link after each signed tx; toasts for errors with on-chain error names.

## Acceptance criteria
- [ ] With investor keypairs imported into Phantom (devnet), voting and subscribing from the browser succeed and show in the console; typecheck/lint green.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/031.md`, then print exactly `DONE:031` or `BLOCKED:031 <reason>`.
