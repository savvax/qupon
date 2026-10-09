# Qupon — plan 15 instructions on Solana devnet (`make demo-plan15`)

Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet) · cluster devnet · run 2026-10-09T15:26:06.379Z

**Result:** every plan-15 instruction succeeded on devnet ✓ (demo clock, hook record date, permissionless crank, payout route + bank confirmation, disclosure anchoring, default + cure, accrued interest on a DvP trade, atomic pay + burn)

_DEMO clock: one civil day = 2 s on this series (labelled DEMO everywhere), so a semi-annual coupon period lasts ~6 minutes and the default grace (one series day) is 2 s. Bank transfers are SIMULATED: the payout goes to the paying agent's cash account and the agent confirms it with a reference hash._

## P0 — A series on the DEMO clock, transfer-hook record date

- Series **QPNd-tmnbmb**: face 1,000 KZT, 10% semi-annual, 30E/360, 2026-10-09 → 2027-10-09 on a 2 s/day DEMO clock; investor1 10, investor2 25, investor3 65 bonds.

| Step | Transaction | Status |
|---|---|---|
| series:create --demo-day-secs 2 (mint with transfer hook + init_series + init_hook) | — | ok |
| kyc:attest investor1 (SIMULATED KYC provider, SAS attestation) | — | ok |
| investor:register investor1 | [tx](https://explorer.solana.com/tx/33cCmCZXDKYY24cr2Drg2Twf1u3oVhRSoa4oJACqdCpeWrBQ2SVuzfw6p4jwU1fGuKg5ZVMjnSy3B7uezFDUzjgj?cluster=devnet) | ok |
| kyc:attest investor2 (SIMULATED KYC provider, SAS attestation) | — | ok |
| investor:register investor2 | [tx](https://explorer.solana.com/tx/319ccZj4XaB1vSCZQibPp14rcsmXQnQxxt4Mf7r36ZUXi8tW1K74HGX8bjgSznaZRHB45Ub4tTh6LFLbcGhJBC3m?cluster=devnet) | ok |
| kyc:attest investor3 (SIMULATED KYC provider, SAS attestation) | — | ok |
| investor:register investor3 | [tx](https://explorer.solana.com/tx/Fjh65tXLvauLJVX4wf1rryBEz69D2quh4oCGR16UTaPE3ESpEyvszat94sixqLxX8wDss2JYq56k2bVbMyEEeP7?cluster=devnet) | ok |
| subscribe 10 bonds — investor1 | [tx](https://explorer.solana.com/tx/2mb24Li3qrjTw4bwqDi5GnXcC2XTmEUBN153JZS7hGtZA5hsry8y4WEJVeQCJvaMMX4mWBVNvxmoG4FD2B39UiFU?cluster=devnet) | ok |
| subscribe 25 bonds — investor2 | [tx](https://explorer.solana.com/tx/524nuaHo8hB3V3KTdWJfYtvtYw4tWLDdMV7HW3e62FvZCeUtvBVEg12YhEVShaLHbFXiYheWAsovKTfdFcMvDRF9?cluster=devnet) | ok |
| subscribe 65 bonds — investor3 | [tx](https://explorer.solana.com/tx/icb4Kwzmdmrgj3wpErdWZho3nLZivis3mRJNiKk8NosP11mF1fpw2LeaybrdAgjYMJZ57XacRLLM5JhvtynK5Gr?cluster=devnet) | ok |

## P1 — The holder chooses where payouts go (plan 15 D6)

Only the holder's own signature sets the route (`has_one = owner`; the registrar cannot redirect it — `programs/qupon_bonds/tests/payout_route.rs`). investor2 asks for a bank account (only the sha256 of the details goes on-chain).

| Step | Transaction | Status |
|---|---|---|
| payout:route bank — signed by investor2 | [tx](https://explorer.solana.com/tx/xxNBG1YLimYpDwtX2waTBzGR8q33tpSJZs1Ex6w22hFZf8YMkZyNcJAqut27sMWT8igLgvjeFmyjZhB6d3pxET4?cluster=devnet) | ok |

## P2 — Coupon INTR #1: anchored notice, permissionless crank, default and cure (plan 15 D2, D4, D9)

The record date arms the transfer-hook gate (the register never pauses). Every crank step is pushed by an outsider key. The issuer misses the payment date; one series day later anyone declares the default; the issuer's late funding cures it and the record-date holders are paid.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (registrar) | [tx](https://explorer.solana.com/tx/2PNnG21fMcneUN95ZtRhT9gqhDisS4vEMcruUAETFDFYEgoithVQuZyFvLUfATM8tME4oc9qdFoJXEJtfmWBx5AS?cluster=devnet) | ok |
| disclosure:attach — sha256 e45e9974cdf9304c… of the notice anchored once (registrar) | [tx](https://explorer.solana.com/tx/3dsJLizw1ufUAVjDZmtuKoigzyyfcM1smBKojW6MmvGYZcnZW4zLF2RPVa6JQL7TpYuTSWLM8PHtSTAjhWnu3aLg?cluster=devnet) | ok |
| disclosure:attach again — AlreadyAttached | — | rejected as expected ✓ |
| action:snapshot — pushed by an outsider (permissionless, set hash) | [tx](https://explorer.solana.com/tx/5PKcFSJjmkVbDCiYAS7x2aNUvcqtuyVTyEencPssGbwV5hfdZ5Fw77p2bN4mmGf4w3JjNX4q8GKKfKZY48sZwZW8?cluster=devnet) | ok |
| action:finalize-snapshot — outsider | [tx](https://explorer.solana.com/tx/2cnBqgTiduZsBF3XxCVzbSGCjHhCqSJwGNpmPkerMJhoMGiQsnjiZW4Jf2sWQUaCbKxB8fWrznpXCsvqMeWNL9hn?cluster=devnet) | ok |
| action:default — outsider declares the default (payment date + one series day, escrow short) | [tx](https://explorer.solana.com/tx/2BvYuaWjSbNxVv3Lb618fTsxeWcNeM8DxZT8Kde33bdXJDLLUhxRs8uWMMAuExaVnf4ERePP75bp2fRGjfgFiBGF?cluster=devnet) | ok |
| action:fund — the issuer's late funding cures the default | [tx](https://explorer.solana.com/tx/4oWHQsu2wgzoeTtz9h9Updp4qRFujcQbthTszxcag982qGvQtjUdEvTJrc2QgEgKc8ZogRsCspae4J2XbfQrGypu?cluster=devnet) | ok |
| action:pay — outsider; investor2's coupon goes to the paying agent (bank route) | [tx](https://explorer.solana.com/tx/4cza6XhK3KZLmxtccCYr3YTCTefjmE7uA5SpCfCPbgGxHB58DCNNjSK9q5qwAy4XbLLLDCo8uW1qabVqnqYYdvhE?cluster=devnet) | ok |
| action:complete before the bank payout is confirmed — BankPayoutsPending | — | rejected as expected ✓ |
| payout:confirm-bank — paying agent confirms investor2's transfer (reference hash; transfer SIMULATED) | [tx](https://explorer.solana.com/tx/ByrjD8fKtiFdZijuETYpaXL4Zy4JHPmZXs8rxQ8rsuHbrwEwVPtLbpUoDtH8M9xpmZTDFTEaym5oMuiTa2tpVCj?cluster=devnet) | ok |
| action:complete — outsider (reconciled: all paid, nothing pending) | [tx](https://explorer.solana.com/tx/441QHVFtkugQ35XBwETmWPo1RXvfTurDFxJ6knWx64HJFTMu4H1iVJaAq8CGhBSRvFYHFHsGqeUa5gvrwX39SSsG?cluster=devnet) | ok |

## P3 — Secondary trade carries its accrued interest (task 1515)

investor3 sells 5 bonds at par to investor1 through Solana DvP; `admit_trade` emits `TradeAccrued` (clean + accrued = cash leg) on the series' day count.
- Cash leg 500000 = clean 497500 + accrued 2500 (18 days).

| Step | Transaction | Status |
|---|---|---|
| trade:create — CreateDvp + admit_trade (TradeAccrued) | [tx](https://explorer.solana.com/tx/5inUUPFvRRdDQW9YDur9q544kbKL38MrhRC3a1r49xCwsL4NQFKvJnWtiZAAJxccKmnSUYCJt4TJgLsDRzCDZ7BA?cluster=devnet) | ok |
| trade:fund seller — investor3 | [tx](https://explorer.solana.com/tx/5h3v8sSUG7Peaqj3WiprrZvnfhoHon4JQ89RYv8TzvLkF8X7Lo31j6CdqY6SqGFU6rqNC12kC8bLZKG8FvjjkfNF?cluster=devnet) | ok |
| trade:fund buyer — investor1 | [tx](https://explorer.solana.com/tx/3NsV3qDUJjQmTgZD7PZuG7zpt1tYrw2f3BDgW6yJUcTSB5MRsNpcxWb9tWX1K6xQsJbmtYgGE71NPNvpbcRU3yiQ?cluster=devnet) | ok |
| trade:settle — SettleDvp + release_trade | [tx](https://explorer.solana.com/tx/63f3tMr1fs1RWnRTznX6XibYDjuc3fPNCxiaYhs8haNgQWmnXrMjtBcKWFM1HUHmZPL3deKoENKtmVeHhzW4D2R8?cluster=devnet) | ok |

## P4 — Redemption: pay and burn in one instruction (plan 15 D5)

At maturity every holder's principal + final coupon is paid and their units are burned in the same `pay_batch`; investor2's redemption goes through the bank route and is confirmed by the agent.

| Step | Transaction | Status |
|---|---|---|
| action:announce REDM (registrar) | [tx](https://explorer.solana.com/tx/PXwQtN4j8E3YFJGDb6MNcAuodC9E2gDr6Vo4Rrh931RJumsLZPhU8YXT8YiBTYfnrrFHXyH9AWVeZUs8sdn8iDj?cluster=devnet) | ok |
| action:snapshot — outsider | [tx](https://explorer.solana.com/tx/dmzMNyGUGSoij1ekrKGLWL8FWtzdTB8usKNoJUZNCy5dJVDnuwPWaM2EnChwGBVwQfu8RE8FuXQbXRnjsr4mna3?cluster=devnet) | ok |
| action:finalize-snapshot — outsider | [tx](https://explorer.solana.com/tx/3jUcQv6gVYdFsoZTCSHUd2BMKCtEU5bwKcyimVBkjSBpLSzEQHwzqk6cZn3xSJY5BbbbzpWVkc5Nk7YhU57Gf6rK?cluster=devnet) | ok |
| action:fund — issuer | [tx](https://explorer.solana.com/tx/3AG67SmVZQseTvE9kWbZ81EJcHdSyqNb7U1tnNZJ3jLFtZhL93aD4dhXcteak1jW887FhRmdWWLD5WDoNSKoLm9t?cluster=devnet) | ok |
| action:pay — outsider: pay + burn atomically | [tx](https://explorer.solana.com/tx/LmoQyxw28GZz9CiTifTTpptFUiCKBRwqjwJJKH2PTXwA2HFPNCiqr5ofxUY5cwu9fdiFQi5YVg8tGPshQszcbUa?cluster=devnet) | ok |
| payout:confirm-bank — paying agent (investor2, SIMULATED transfer) | [tx](https://explorer.solana.com/tx/4LwDQvpUgzL8WXJ8Kz8KRVVs3AgUCvU5kdot8ztj2sVVjRbzJ58oQeb8397m61AiBX4qEJq29PnjRyLGYiBdf2Mp?cluster=devnet) | ok |
| action:complete — outsider | [tx](https://explorer.solana.com/tx/38PeHLapvd2kMLWsXD9Mr7DRfcZM6RaFMjpPt6cd7gEEL1axoqFTLHetmir9RBWmBj5hfssrXaqVtmuvJBDavMnt?cluster=devnet) | ok |
| action:retire — nothing left to burn (no double count) | — | ok |
| series:close — metadata REDEEMED, mint closed | [tx](https://explorer.solana.com/tx/5PKUGg8N9getNz13ZMCwnGFEY3sw1Defd12sMVbPWeQ5DUNw557eVUVREQq4W8r47v7LCkmpwLwTfwRRS9x8f6cm?cluster=devnet) | ok |
