---
id: 005
title: Program skeleton: accounts, errors, events, PDAs, init_series with extension validation
agent: claude
tier: T0
depends_on: [001, 003]
verify: make verify
timeout_min: 60
---
## Goal
Lay down the on-chain data model from `docs/02-architecture.md` and implement `init_series`, including strict validation of the Token-2022 mint extensions and authorities.

## Read first
- docs/02-architecture.md
- docs/03-domain.md
- docs/04-stack.md (Gotchas)

## Steps
1. Define `Series`, `Investor`, `CorporateAction`, `Entitlement` with `#[account]` + `InitSpace`; enums as `u8` with `TryFrom`; constants for seeds; error enum with the exact names from the architecture doc; events for every transition (define all now, emit later).
2. `init_series(params: InitSeriesParams)`: accounts registrar (signer, payer), mint (InterfaceAccount<Mint> under Token-2022), cash_mint (InterfaceAccount<Mint>, any token program), series PDA, tax_vault ATA (init, authority = series PDA, token program = cash mint's program), system/token/ata programs. Validate via `StateWithExtensions`: MetadataPointer present, DefaultAccountState == Frozen, PermanentDelegate == series PDA, PausableConfig authority == series PDA, MintCloseAuthority == series PDA, mint_authority == series PDA, freeze_authority == series PDA, decimals == 0, supply == 0. Store params; `next_coupon_date = issue_date + period`.
3. Add `crates/entitlement` as a dependency of the program (path dep, no std).
4. LiteSVM test helpers in `programs/qupon_bonds/tests/common/mod.rs`: create a Token-2022 mint with all extensions client-side (spl-token-2022 instructions), create cash mint (SPL token), fund keypairs, `set_clock(ts)`.
5. Tests: init_series happy path; init_series fails with `InvalidMintExtensions` when DefaultAccountState is missing; fails with `InvalidAuthority` when permanent delegate ≠ PDA.

## Acceptance criteria
- [ ] `cargo test -p qupon_bonds` green with the three tests above.
- [ ] `anchor build` produces `target/idl/qupon_bonds.json` containing all four account types and every error code.
- [ ] Instruction table in `docs/02-architecture.md` still matches the code (update the doc if signatures changed).

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/005.md`, then print exactly `DONE:005` or `BLOCKED:005 <reason>`.
