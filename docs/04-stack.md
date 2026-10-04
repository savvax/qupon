# 04 — Stack, versions, install, gotchas (verified 2026-10-05)

| Component | Version | Install / notes |
|---|---|---|
| Agave (Solana CLI) | **4.3.0** (2026-09-18) | `sh -c "$(curl -sSfL https://release.anza.xyz/v4.3.0/install)"`; devnet already runs Alpenglow (since 2026‑09‑25) and SBPFv3. `solana config set -u devnet`. |
| Anchor | **1.2.0** (2026-09-04) | `cargo install --git https://github.com/otter-sec/anchor avm --force && avm install 1.2.0 && avm use 1.2.0`. Repo moved to otter-sec/anchor. If `anchor build` complains about platform tools under Agave 4.3: `anchor build --tools-version v1.57`. Anchor v2 is alpha — do not use. |
| Rust | stable ≥ 1.89 | `rustup update stable` |
| Token-2022 | program v11; crates `spl-token-2022-interface` 3.1.2 (use in program), `spl-token-2022` 11.1.0 (off-chain); JS `@solana-program/token-2022` 0.19.0 | Program id `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`. Anchor: `anchor_spl::token_interface` + `anchor_spl::token_2022_extensions` (has `pausable`, `permanent_delegate`, `metadata_pointer`, `token_metadata`, `default_account_state`, `mint_close_authority` CPI helpers). No init-constraints for `default_account_state`/`pausable` in Anchor 1.2 → create the mint client-side (Kit) and validate in `init_series`. |
| Node / pnpm | Node 22 LTS, pnpm 9 | `corepack enable` |
| @solana/kit | **8.4.0** | primary TS client; `@solana-program/token` 0.17.0, `@solana-program/system` 0.15.0 |
| Codama | codama 1.11.0, `@codama/nodes-from-anchor` 1.5.6, `@codama/renderers-js` 2.5.0 | `pnpm codama` script generates `clients/ts/src/generated` from `target/idl/qupon_bonds.json` |
| wallet-adapter | 0.15.40 (web3.js 1.99 peer) | only in `apps/web`; keep Kit for everything else |
| Go | **1.25** | `github.com/solana-foundation/solana-go/v2` v2.1.0 (RPC, ws); Borsh decode by hand or `github.com/near/borsh-go`; SQLite `modernc.org/sqlite`; router `github.com/go-chi/chi/v5`; lint `golangci-lint` |
| LiteSVM | litesvm 0.17.0, anchor-litesvm 0.4.0 | default Anchor 1.x test template (`anchor init --test-template litesvm`); load Token-2022 via `add_program_from_file("tests/fixtures/spl_token_2022.so")` (dump with `solana program dump TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb tests/fixtures/spl_token_2022.so -u devnet`). |
| Surfpool | 1.6.0 | `curl --proto '=https' --tlsv1.2 -sSfL https://run.surfpool.run/ | bash`; `anchor test` uses it by default; `--validator legacy` for solana-test-validator. |
| solana-verify | 0.5.2 | `cargo install solana-verify --locked`; run once before submission. |
| Helius | free plan: 1M credits/mo, 10 RPS | `https://devnet.helius-rpc.com/?api-key=…`; `getProgramAccountsV2` (paginated, `changedSinceSlot`), DAS `getTokenAccounts {mint}`; webhooks. |
| USDC devnet | mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU` (SPL Token, 6 dec) | faucet.circle.com: 20 USDC per address every 2 h |
| SOL devnet | faucet.solana.com (GitHub login → higher limit); `solana airdrop 2` is IP-limited | fund 5 keypairs on day 1 and keep them |
| Squads v4 (optional T2) | program `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf` on devnet, `@sqds/multisig` 2.1.4 | issuer/paying-agent multisig |
| Solana Attestation Service (optional T2) | program `22zoJMtdu4tQc2PzL74ZUT7FrwgB1Udec8DdW4yw4BdG`, `sas-lib` 1.0.10 | KYC attestation |
| Token ACL (sRFC-37) | program `TACLkU6CiCdkQN2MjoyDkVg2yAH9zkxiHDsiztQ52TP` (devnet) | NOT used in T0/T1 — our own Investor registry + thaw replaces it; mention as compatible roadmap |

## Gotchas
- **Devnet SOL reserve**: `~/.config/qupon/funder1.json` (≈22 SOL) and `funder2.json` hold the human's devnet test SOL (Phantom path m/44'/501'/0'/0'); top up roles with `solana transfer --from ~/.config/qupon/funder1.json <pubkey> <sol> --allow-unfunded-recipient -u devnet` instead of rate-limited airdrops. Never commit these files.
- **LiteSVM ≥ 0.17 for SBPFv3**: Agave 4.3 platform-tools emit SBPFv3; LiteSVM 0.10 (Anchor 1.2 template default) fails `add_program` with `InvalidAccountData`. LiteSVM 0.17 needs host rustc ≥ 1.97.1 → `rust-toolchain.toml` pins 1.97.1, but workspace `rust-version` stays 1.89 (it also binds the SBF build, whose platform-tools rustc is 1.95).
- **Program id** `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd`; deploy keypair at `~/.config/qupon/qupon_bonds-program.json` (never in git); `make program-keypair` copies it into `target/deploy/` of each worktree. Avm's `anchor` lives in `~/.cargo/bin` — a Homebrew/npm `anchor` wrapper earlier on PATH is wrong (Makefile prepends `~/.cargo/bin`).
- **Toolchain pins via mise** (macOS dev box): `mise.toml` pins node 22 / go 1.25 / pnpm 9; Makefile, `ops/lib.sh`, `ops/doctor.sh` put `~/.local/share/mise/shims` first on PATH. `ops/wallets.sh` needs bash ≥ 4 (`brew install bash`).
- **Pausable blocks mint, burn and transfer.** Order for redemption: pay → `complete_action` (resume) → `retire_batch` (burn) → `close_series`.
- **Permanent delegate burn**: use `burn_checked` with the series PDA as delegate signer; works on thawed accounts only.
- **DefaultAccountState=Frozen**: ATAs are created frozen; `register_investor` thaws with the series PDA (freeze authority). Suspended investors are frozen again.
- **Token-2022 account size varies** (TLV extensions): never filter `getProgramAccounts` by `dataSize`; filter `memcmp{offset:0, bytes:<mint>}` and `memcmp{offset:32, bytes:<owner>}`.
- **Anchor 1.x transfer-hook `#[interface]` was removed** — we do not use transfer hooks at all.
- **`@coral-xyz/anchor` → `@anchor-lang/core`** (TS); we don't need it because Codama generates a Kit client.
- **Devnet public RPC**: 100 req/10 s/IP — use Helius for the Go service and tests on devnet; LiteSVM for unit tests.
- **Phantom dropped Blinks** — no Actions/Blinks.
- **Alpenglow**: `confirmed` ≈ `finalized` on devnet; nothing to change in code, but don't rely on `processed`.
- **SBPFv3**: address 0 reads succeed silently; stricter stack frames — avoid huge stack arrays in instruction handlers; box large accounts.
- **Clock in tests**: LiteSVM `svm.warp_to_slot()` and set the `Clock` sysvar to control `unix_timestamp`.
- **Z.ai plan**: GLM-5.3 consumes 3× quota at peak (Mon–Fri 11:00–15:00 Astana); Flash 0.4×; schedule heavy GLM runs off-peak.
- **Claude Code `-p` runs do not auto-wait on usage limits** — the orchestrator sleeps and retries.
