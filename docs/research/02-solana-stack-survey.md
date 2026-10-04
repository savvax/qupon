# Solana stack survey for a 7‑day tokenized‑bond / corporate‑actions prototype on devnet (as of 2026‑10‑05)

Versions/dates pulled live from npm, crates.io, pkg.go.dev, GitHub releases and official docs on 2026‑10‑05. "Deployed on devnet" claims come from docs/READMEs, not from RPC checks.

## 1. Solana CLI / Agave
- Stable Agave **v4.3.0, 2026‑09‑18** (crates `solana-cli`/`agave-validator`/`solana-test-validator` 4.3.0; `4.5.0-alpha.1` on crates.io). Install `sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"`; pin with `https://release.anza.xyz/v4.3.0/install`; update via `agave-install update`. All-in-one installer: `curl --proto '=https' --tlsv1.2 -sSfL https://solana-install.solana.workers.dev | bash` (Rust, Solana CLI, Anchor CLI, Surfpool, Node, Yarn).
- `solana-test-validator` still shipped, but Anchor 1.x defaults `anchor test`/`anchor localnet` to **Surfpool**; `--validator legacy` for the old validator.
- Devnet faucet: faucet.solana.com "2 requests every 8 hours", GitHub sign‑in unlocks a higher limit; `solana airdrop` IP rate‑limited. Public devnet RPC limits: 100 req/10 s/IP, 40 req/10 s per method, 40 concurrent connections.
- **Alpenglow live on devnet since 2026‑09‑25** (testnet 09‑24); `confirmed` ≈ `finalized` (~100–150 ms), ~75% fewer txs in `getBlock` (no vote txs), no program‑model change.
- SBPFv3 is the current bytecode target (platform‑tools ≥ v1.56); SIMD‑0500 (Agave v4.4) will reject v0–v2 deployments. Build with `--arch v3` (Anchor 1.2 default). Address 0 is readable; stricter 4096‑byte stack frames.

## 2. Anchor
- **1.2.0 (2026‑09‑04)**: crates `anchor-lang`/`anchor-spl`/`anchor-client` 1.2.0; npm `@anchor-lang/core` 1.2.0. Legacy 0.32.2 still patched. **Anchor v2 is alpha — skip.**
- Repo moved to **otter-sec/anchor**: `cargo install --git https://github.com/otter-sec/anchor avm --force && avm install 1.2.0 && avm use 1.2.0`. avm resolves the matching platform‑tools; 1.2.0 recommends Solana 4.1.2 / platform‑tools v1.57 — if `anchor build` complains under Agave 4.3.0, pass `--tools-version v1.57`.
- Breaking changes in 1.0.0: `@coral-xyz/anchor` → `@anchor-lang/core`; CLI no longer shells to `solana`; `anchor test` uses Surfpool; duplicate mutable accounts rejected unless `dup`; legacy IDL account replaced by Program Metadata Program (`anchor idl init/upgrade/fetch`); `program` removed from `CpiContext`; `#[interface]` removed → `#[instruction(discriminator = <EXPR>)]`; one `#[error_code]` per program; `Context` lifetimes reduced to one. 1.1.x/1.2.0 no breaking changes; 1.2.0 added TS error constants, pausable‑mint helpers, PDA‑signer support in generated CPI/client types.
- Testing: `anchor init` default test template = **LiteSVM (Rust)**; `--test-template mollusk` or mocha available; `anchor test` runs Surfpool by default (`--validator legacy`, `--skip-local-validator`).
- Token‑2022 in Anchor: `anchor_spl::token_interface::{Mint, TokenAccount, TokenInterface}` with constraints `mint::decimals/authority/freeze_authority/token_program`, `token::*`, `associated_token::*`, `extensions::{close_authority::authority, permanent_delegate::delegate, transfer_hook::*, metadata_pointer::*, group_pointer::*, group_member_pointer::*}`. CPI helpers in `anchor_spl::token_2022_extensions`: cpi_guard, default_account_state, immutable_owner, interest_bearing_mint, memo_transfer, metadata_pointer, mint_close_authority, non_transferable, **pausable**, permanent_delegate, token_group, token_metadata, transfer_fee, transfer_hook, confidential_transfer. **Gaps in 1.2.0:** no `scaled_ui_amount` or `permissioned_burn` helpers and no `default_account_state`/`pausable` *init constraints* — create the mint client‑side with Kit and validate in the program.
- TS: `@anchor-lang/core` depends on web3.js 1.x; for a Kit front end generate the client with Codama.

## 3. Token‑2022 (Token Extensions)
Program `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`. Rust `spl-token-2022` 11.1.0 and **`spl-token-2022-interface` 3.1.2** (2026‑09‑23; depend on the interface from programs); JS `@solana-program/token-2022` 0.19.0 (peer `@solana/kit ^8.3`, every extension ix incl. pause/resume, scaled UI amount, permissioned burn, confidential transfer via `@solana/zk-sdk`); legacy `@solana/spl-token` 0.4.15; CLI `spl-token-cli` 5.6.1.

| Extension | Status (Oct 2026) | Use |
|---|---|---|
| MetadataPointer + TokenMetadata | GA | ISIN, maturity, coupon, status |
| DefaultAccountState (frozen) | GA | KYC gating |
| PermanentDelegate | GA | forced redemption/burn |
| Pausable | GA (program v11 on devnet) | freeze trading during record date |
| MintCloseAuthority | GA | retire the mint |
| PermissionedBurn | new; mainnet status UNVERIFIED | optional |
| ScaledUiAmount | GA | cosmetic only |
| InterestBearing | GA | cosmetic; avoid for coupon bonds |
| TransferHook | GA | not needed |
| ConfidentialTransfer | ZK ElGamal proof program re‑enabled on mainnet 2026‑06‑17 | nice‑to‑have only |

Solana Foundation tokenization docs: quickstart creates a mint with MetadataPointer+TokenMetadata, PausableConfig, PermanentDelegate, DefaultAccountState(frozen) via `@solana/kit` + `@solana-program/token-2022`; access control via **Token ACL (sRFC‑37)** program `TACLkU6CiCdkQN2MjoyDkVg2yAH9zkxiHDsiztQ52TP` (devnet; mainnet UNVERIFIED), gate `GATEzzqxhJnsWF6vHRsgtixxSB8PaQdcqGEVTEHWiULz`; DvP = one atomic transaction with both legs (https://solana.com/docs/tokenization/dvp, reference repo https://github.com/Woody4618/dvp); NAV strikes stored as metadata fields.

## 4. JS/TS clients
- `@solana/kit` **8.4.0 (2026‑09‑28)** — primary. `@solana-program/token-2022` 0.19.0 / `token` 0.17.0 / `system` 0.15.0. Codama 1.11.0, `@codama/renderers-js` 2.5.0, `@codama/nodes-from-anchor` 1.5.6.
- `@solana/web3.js` 1.99.0; 3.0.0 on `next` tag (legacy interop path). Use 1.99 only where forced (wallet‑adapter).
- `gill` 0.14.0 stalled — not recommended. wallet‑adapter 0.15.40 fine for a demo UI. Blinks/Actions: **Phantom no longer supports Blinks** — not recommended.

## 5. Rust / Go clients
- Rust `solana-sdk` 5.0.0 (split crates); `solana-program` 5.1.0; `solana-client` 4.3.0. Let Anchor pin these.
- Go: **`github.com/solana-foundation/solana-go/v2` v2.1.0 (2026‑09‑15, Go ≥ 1.25)**; `programs/` has SPL token, ATA, memo, system but **no Token‑2022 extension builders** → hand‑encode Anchor ixs or drive token ops from TS. `blocto/solana-go-sdk` last release 2024‑05 — not recommended.

## 6. Indexing / RPC / holder snapshot
- Helius free: 1M credits/month, 10 RPS; DAS `getTokenAccounts {mint|owner, limit, cursor, options.showZeroBalance}` returns `last_indexed_slot`, `frozen`; `getProgramAccountsV2` (limit ≤ 10,000, `paginationKey`, `changedSinceSlot`, `withContext`); webhooks 1 credit/event.
- Public devnet RPC: `getTokenLargestAccounts` returns top 20 only; plain `getProgramAccounts` on Token‑2022 works but no pagination; never filter by `dataSize` (TLV).
- Snapshot recipe: pause the mint → `getProgramAccountsV2` (program Token‑2022, `memcmp` mint at offset 0, `dataSlice{offset:32,length:40}`) paginated, persist `context.slot` → cross‑check Σ amounts == supply with `minContextSlot` → store hash on‑chain → resume.

## 7. Identity
SAS program `22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`, `sas-lib` 1.0.10; Civic Pass sunset (2025‑07). Verdict: simulate KYC with our allowlist; SAS attestation as additive T2.

## 8. Multisig / governance
Squads v4 program `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` on devnet, `@sqds/multisig` 2.1.4 (web3.js‑1). SPL Governance/Realms tooling old; **write a ~150‑line vote path in our program instead**.

## 9. Privacy
Light Protocol (cost compression, not privacy), Arcium (mainnet alpha), Token‑2022 confidential balances (several txs, client proofs) — nice‑to‑have only.

## 10. Testing / dev tooling
LiteSVM 0.17.0 (+ `anchor-litesvm` 0.4.0, npm `litesvm` 1.5.0) — default; Mollusk 0.15.1 for CU benchmarks; Surfpool 1.6.0 for e2e against a devnet fork; Bankrun superseded; Solana Playground skip; `solana-verify` 0.5.2 for verified builds; CI: Rust 1.89+, Agave 4.3.0, `avm install 1.2.0`, `anchor build --arch v3`, `cargo test`.

## 11. Settlement stablecoin on devnet
USDC devnet mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (SPL Token, 6 decimals), faucet.circle.com 20 USDC per address every 2 h. Evo/KZTE: no public mint or devnet deployment — mint our own tKZT (Token‑2022, 2 decimals).

## 12. Reference repos
solana-foundation/token-acl, token-acl-gate, Woody4618/access-control-list-acl-demo, Woody4618/dvp, solana.com/docs/tokenization/quickstart and nav-strikes, solana-developers/program-examples (`tokens/token-2022/*`), solana-program/token-2022, solana-foundation/solana-attestation-service, Squads-Protocol/v4.

## Recommended stack for the 7‑day build
| Component | Choice | Version | Why |
|---|---|---|---|
| Validator/CLI | Agave CLI | 4.3.0 | matches devnet |
| Program framework | Anchor | 1.2.0 via avm (otter‑sec/anchor) | stable, Token‑2022 helpers, LiteSVM template |
| Token standard | Token‑2022 | program v11; interface 3.1.2 / JS 0.19.0 | Metadata + Frozen default + PermanentDelegate + Pausable + MintCloseAuthority |
| Allow‑list | own Investor PDA + thaw (Token ACL as roadmap) | — | fewer moving parts |
| CA logic | own Anchor program | — | small, demoable |
| Settlement cash | Circle devnet USDC + own tKZT | — | faucet; no KZTE devnet |
| TS runtime | `@solana/kit` + Codama client | kit 8.4.0, codama 1.11.0 | where all 2026 docs live |
| UI wallet | wallet‑adapter | 0.15.40 | fast |
| Backend | `solana-foundation/solana-go/v2` | 2.1.0 | RPC/indexing; tx via TS CLI |
| RPC | Helius free | — | paginated snapshots |
| Tests | LiteSVM + Surfpool | 0.17.0 / 1.6.0 | fast |
| Nice‑to‑have | Squads, SAS | — | after core |
