---
id: 1301
title: Secondary trades via Solana DvP — admit the trade escrow, record-date guard
agent: claude
tier: T2
depends_on: []
verify: make verify
timeout_min: 90
---
## Goal
The Solana Foundation published its DvP program on 2026-10-06 (`dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq`, devnet and mainnet). Let two registered investors of a series settle a secondary trade through it without weakening the record date: bond accounts are frozen by default, so the program decides which DvP escrows may hold units, and `strike_record` refuses while any admitted trade is open.

## Read first
- `reports/dvp-spike-2026-10-06.md` — devnet run against a mint with our extension set (escrow starts frozen; a paused mint blocks DvP settle, cancel and reclaim).
- `docs/03-domain.md` §4 and §4a, `docs/02-architecture.md` (Series, TradeAdmission, instructions 8, 19, 20).
- `programs/qupon_bonds/src/instructions/{snapshot,register_investor}.rs`.

## Steps
- `Series.open_trades u32` carved from `reserved` (account size unchanged); `TradeAdmission` PDA `["trade", series, swap_dvp]`.
- `admit_trade` and `release_trade` (registrar or paying agent); `strike_record` requires `open_trades == 0`.
- LiteSVM tests with the devnet DvP binary as a fixture (`make fixtures`); regenerate the Codama client.

## Acceptance criteria
- A trade between two Active investors, bond against the series cash asset, with the registrar or paying agent as settlement authority, can be admitted, funded, settled by the DvP program and released; balances match.
- `admit_trade` rejects a foreign settlement authority, a non-operator signer, investor records that are not the trade's parties, a redirected settlement destination, a suspended party (`InvalidTrade` / `Unauthorized` / `InvestorSuspended`).
- `strike_record` fails with `TradesInFlight` while an admitted trade is open and succeeds after cancel + release; the snapshot then reaches Σ = supply.
- `release_trade` fails with `TradeStillOpen` while the escrow holds units and re-freezes an escrow that still exists; with `force` it returns the units to the seller even when the DvP program cannot cancel (seller closed their bond account), after which the record date can be struck.
- Existing error codes keep their numbers; existing Series accounts read `open_trades == 0`.
- `make verify` green; `reports/worklog/1301.md` written.

## Out of scope
CLI commands, API routes, UI and submission texts (tasks 1302–1305); deploying the upgraded program to devnet (lead, after merge).
