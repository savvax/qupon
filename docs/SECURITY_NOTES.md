# Security notes — `qupon_bonds` program

Scope: the Anchor 1.2 program in `programs/qupon_bonds` (Solana devnet only). Off-chain services (Go registrar, TS CLI, web) hold no authority the program does not check itself; they only crank instructions that the program validates. This is a hackathon prototype, not audited.

## Trust model

| Role | Key | Can do | Checked by |
|---|---|---|---|
| Registrar (KCSD / KASE as DFA operator) | `Series.registrar` | create series, register / suspend / reinstate investors, announce cash events, cancel, close series, finalize meetings, apply terms changes (stands in for the **SIMULATED** ARDFM registration), update token metadata | `has_one = registrar` / explicit key comparison |
| Issuer | `Series.issuer` | announce bondholder meetings, free allocation (`issue_units`), fund escrow | `has_one = issuer` / explicit comparison |
| Paying agent | `Series.paying_agent` | crank strike / snapshot / pay / complete / retire, fund escrow | `require_operator` (registrar or paying agent) |
| Investor | wallet in `Investor.owner` | subscribe (DvP), vote with snapshot weight | signer + PDA seeds bind the account to the signer |
| Series PDA `["series", mint]` | program | mint, freeze/thaw, pause/resume, burn (permanent delegate), close mint | Token-2022 authorities validated in `init_series` |
| Action PDA `["action", series, index]` | program | owns the escrow; pays holders and the tax vault | ATA derivation + `has_one = escrow` |

KYC: `register_investor` requires a Solana Attestation Service attestation for the wallet, owned by the SAS program (a closed = revoked attestation fails), under our credential/schema constants, not expired, with attributes equal to the registration; `kyc_ref` stores its address. The KYC provider is **SIMULATED** (a devnet keypair). SAS only lets the credential's authorized signers create attestations; a signer later removed from the credential is not re-checked on read (ponytail: pass the credential account and check `authorized_signers` if providers rotate).

## Invariants the program enforces

- **Bond mint shape** (`init_series`): exactly MetadataPointer (→ the mint itself, pointer authority registrar or none), TokenMetadata (update authority registrar), DefaultAccountState = Frozen, PermanentDelegate / Pausable / MintCloseAuthority / mint / freeze authority = series PDA, decimals 0, supply 0, not paused — and **no other extension** (a transfer hook, transfer fee or non-transferable flag would change behaviour after validation). ISIN = 12 ASCII alphanumerics, ticker printable ASCII zero-padded, dates are Almaty midnights.
- **Holder registry**: new token accounts start frozen; only `register_investor` thaws (series PDA). An unregistered wallet cannot receive the bond (Token-2022 `AccountFrozen`).
- **One open action per series** (`Series.open_action`); amounts are recomputed on-chain from civil dates and series terms (`EntitlementCalcMismatch` otherwise) — clients cannot choose the coupon rate, period or principal.
- **Record date**: `strike_record` only at `clock ≥ record_at`; it pauses the mint, so no transfer, mint or burn can change the register while the snapshot is taken; `finalize_snapshot` requires Σ snapshotted units == mint supply and the exact-fraction rounding bound (each holder rounded half-up once).
- **Settlement**: pay only from a fully funded escrow (`Underfunded`); each entitlement is paid once (status flag re-read per account, so a holder listed twice in one batch is paid once); `complete_action` requires every holder paid and `total_paid == total_net + total_principal`.
- **Redemption order** pay → complete (resume) → retire → close is enforced by statuses; `close_series` requires supply 0 and runs once (the mint account is gone afterwards).
- **Batches** are bounded (snapshot 8, pay 5, retire 12) and idempotent.
- **Griefing**: escrow / tax-vault ATAs are `init_if_needed` (their PDAs are predictable — a pre-created ATA must not block `announce_action` / `init_series`); Entitlement PDAs are created with a pre-funding-safe helper; units moved after the redemption resume into an un-snapshotted registered wallet are retired through an `[Investor, ATA]` pair so nobody can block `close_series`.
- **Arithmetic**: all money math in u128 with checked conversions; counters use `checked_add`; no `unwrap`/`expect` in handlers.
- **Events** on every state transition (28 types) for an independent audit trail.

## Known limitations (documented, out of scope for the prototype)

- **Residual cash**: over-funding leaves the surplus in the action escrow, and withheld tax accumulates in the series tax vault; there is no withdrawal instruction yet (tax remittance to the tax authority is out of scope).
- **Closed cash accounts**: if a holder closes their registered cash ATA before payment, `pay_batch` for them fails and the action cannot complete until the registrar re-registers that holder's cash account (no instruction for that yet).
- **Meeting thresholds** (quorum 50%, approval 2/3 of votes cast) are series configuration, not asserted as Kazakh law.
- **Registrar key** is a single signer; Squads multisig for issuer/registrar is an optional T2 task.
- **Holder order in the snapshot hash** is not enforced on-chain (enforcing it would make a missed holder unrecoverable with the mint paused); the CLI snapshots in ascending owner order and the off-chain reconciler flags a mismatch.
- **Clock**: deadlines use the cluster's `unix_timestamp`, which validators can skew by seconds — irrelevant for day-scale record dates, visible only in the compressed demo timeline.

## What an auditor should look at first

1. `instructions/init_series.rs::validate_bond_mint` — the whole security model depends on the mint's authorities and extension set.
2. `instructions/snapshot.rs` and `instructions/settle.rs` — `remaining_accounts` validation (Investor ↔ ATA ↔ Entitlement binding) and the paid/retired flags.
3. `instructions/retire.rs` — permanent-delegate burns (including the thaw of frozen accounts) and the orphan `[Investor, ATA]` path.
4. Signer checks in `announce_action` (registrar vs issuer by kind) and `require_operator`.

`cargo clippy -- -W clippy::pedantic` remaining warnings are documentation style (`# Errors` sections), Anchor idioms (`Context` passed by value, `use super::*`) and casts proven in range (civil-date fields); none affect behaviour.
