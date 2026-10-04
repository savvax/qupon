---
id: 006
title: TS script: create the Token-2022 bond mint with the required extensions for a given series PDA
agent: glm
tier: T0
depends_on: [002, 005]
verify: make verify
timeout_min: 45
---
## Goal
Mint creation happens client-side (Anchor 1.2 has no init constraints for Pausable/DefaultAccountState). Write the Kit script that creates a compliant bond mint and metadata.

## Read first
- docs/02-architecture.md (Token-2022 bond mint)
- docs/04-stack.md
- https://solana.com/docs/tokenization/quickstart (pattern)
- clients/ts/src/lib/config.ts

## Steps
1. `clients/ts/src/lib/pda.ts`: derive series/investor/action/entitlement PDAs with `getProgramDerivedAddress` (seeds per architecture doc).
2. `clients/ts/src/lib/bondMint.ts` + `scripts/create-bond-mint.ts --series QPNb1`: computes the series PDA from the new mint keypair, then in one or two transactions: create account with space for extensions (`getMintSize` with extension list), initialize MetadataPointer (authority = series PDA, metadata = mint), DefaultAccountState(Frozen), PermanentDelegate(series PDA), PausableConfig(series PDA), MintCloseAuthority(series PDA), InitializeMint2(decimals 0, mint authority = series PDA, freeze authority = series PDA), then InitializeTokenMetadata + UpdateField for isin/face_value/coupon_rate_bps/frequency/day_count/maturity/status=ACTIVE (payer funds extra rent). Note: metadata init requires update authority = series PDA and the PDA cannot sign client-side → initialize metadata with update authority = registrar first OR set metadata update authority = registrar and let the program's `apply_terms_change`/`close_series` use registrar signature; document the chosen approach in `docs/02-architecture.md` (recommended: update authority = registrar; the program checks registrar signer for metadata updates).
3. Writes the mint address into `config/devnet.json` under `series.<name>.mint`.
4. Vitest: unit test of the extension list / size computation (no network).

## Acceptance criteria
- [ ] `pnpm tsx scripts/create-bond-mint.ts --series QPNb1` on devnet creates a mint whose `spl-token display <mint>` shows all extensions with the right authorities.
- [ ] Running `init_series` (task 007 CLI or a test script) on that mint succeeds.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/006.md`, then print exactly `DONE:006` or `BLOCKED:006 <reason>`.
