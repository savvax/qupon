---
id: 1407
title: CLI: confirm by block height, no devnet fallback on mainnet, --rpc keeps retries
agent: glm
tier: T0
depends_on: []
verify: make verify
timeout_min: 60
---
## Goal
In `clients/ts/src/lib/tx.ts` and `clients/ts/src/commands/common.ts`:
1. `waitForConfirmation` (~L84-97, 128-141) never checks block height: a dropped tx ends with "timeout waiting…" which doesn't match the blockhash-retry regex, and after 60 s the old blockhash may still land after the CLI exited 1 (registrar records a failure for a tx that succeeded). Pass `lastValidBlockHeight`; poll until confirmed or `getBlockHeight() > lastValidBlockHeight`, then throw "block height exceeded" so the retry branch re-signs safely. Never re-sign while the old blockhash can still land.
2. Status fallback hardcoded to `https://api.devnet.solana.com` (~L65-78): take it from `RPC_FALLBACK_URL`; default none unless RPC_URL contains "devnet".
3. `initCtx` with `--rpc` (common.ts ~L72) skips the retrying transport: make `createRpc(url = getRpcUrl())` and use it in both paths.

## Acceptance criteria
- tx.test.ts fake rpc: null status + growing block height → retry with new blockhash, no throw before expiry; status never confirms and height passes → throws "block height exceeded".
- Unit: RPC_URL mainnet → no devnet fallback. Unit: `--rpc` path retries a stubbed 429.
- `make verify` green; `reports/worklog/1407.md`.
