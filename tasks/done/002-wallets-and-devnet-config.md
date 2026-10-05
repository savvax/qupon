---
id: 002
title: Devnet wallets, tKZT test mint, config/devnet.json, funding helpers
agent: glm
tier: T0
depends_on: [001]
verify: make verify
timeout_min: 45
---
## Goal
Make devnet usable with one command: keypairs for registrar, issuer, paying agent, three investors and an outsider; a tKZT Token-2022 mint (2 decimals) with metadata; funding helpers; `config/devnet.json` filled with public keys.

## Read first
- docs/02-architecture.md (Config and secrets)
- docs/04-stack.md
- .env.example
- config/devnet.json

## Steps
1. `ops/wallets.sh`: creates the 7 keypairs under `~/.config/qupon/` if missing (`solana-keygen new --no-bip39-passphrase -s -o`), prints pubkeys, tries `solana airdrop 2` for each with retries, prints faucet URLs on failure, and writes the pubkeys into `config/devnet.json` (jq).
2. `clients/ts/scripts/create-tkzt.ts` (Kit + @solana-program/token-2022): creates mint tKZT, decimals 2, MetadataPointer + TokenMetadata {name: 'Test Tenge', symbol: 'tKZT', uri: ''}, mint authority = registrar; mints 100,000,000 tKZT to issuer and 1,000,000 to each investor; writes `tkztMint` to `config/devnet.json`; idempotent (skips if mint already set and exists).
3. `clients/ts/scripts/fund-usdc.ts`: creates USDC ATAs for issuer/investors and prints the Circle faucet instructions per address (cannot automate); checks balances.
4. `clients/ts/src/lib/config.ts` + `keys.ts`: load `config/devnet.json` and `.env`, helper `loadKeypair(envVar)` returning a Kit `KeyPairSigner`.

## Acceptance criteria
- [ ] Running `ops/wallets.sh && pnpm tsx clients/ts/scripts/create-tkzt.ts` on a fresh machine with SOL available ends with `config/devnet.json` containing all pubkeys and the tKZT mint; re-running changes nothing.
- [ ] Unit test for `config.ts` (reads a temp JSON) passes in `pnpm test`.
- [ ] No private keys anywhere in the repo (grep for `[` followed by 64 numbers in JSON).

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/002.md`, then print exactly `DONE:002` or `BLOCKED:002 <reason>`.
