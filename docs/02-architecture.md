# 02 — Architecture spec (the contract every agent builds against)

Read `03-domain.md` for the business rules and test vectors. This file fixes names, layouts and interfaces so that work done in parallel fits together. If you must deviate, change this file in the same commit and say why in the task's DONE note.

## Repository layout (monorepo)

```
qupon/
├── Anchor.toml  Cargo.toml  package.json (pnpm workspaces)  go.work  Makefile
├── programs/qupon_bonds/            # Anchor 1.2 program (Rust)
├── crates/entitlement/              # pure Rust math crate shared by the program and tests
├── fixtures/entitlement.json        # shared test vectors (Rust + Go must agree bit-for-bit)
├── clients/ts/                      # @solana/kit + Codama generated client + CLI (qupon)
│   ├── src/generated/               # codama output — never edit by hand
│   ├── src/cli.ts                   # `qupon` CLI (commander)
│   └── scripts/                     # create-bond-mint.ts, create-tkzt.ts, demo.ts
├── services/registrar/              # Go 1.25 service: scheduler, reader, reconciler, ISO 20022, REST
├── apps/web/                        # Next.js 15 console + investor portal
├── config/devnet.json               # program id, mints, wallets (public keys only)
├── docs/                            # this folder; README.md and TECHNICAL_OVERVIEW.md at repo root/docs
├── tasks/ prompts/ ops/ .claude/ .pi/  # agent workflow (not part of the product)
└── reports/                         # demo logs, nightly reports
```

## On-chain program `qupon_bonds` (Anchor 1.2.0, SBPFv3)

Program id: `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd` (keypair outside git at `~/.config/qupon/program-keypair.json`); recorded in `config/devnet.json` and `declare_id!`.

### Design principles
1. All corporate-action state lives on-chain; off-chain only schedules, batches, reconciles, exports.
2. Record date = deterministic snapshot while the bond mint is **paused** (Token-2022 Pausable). No indexer trust.
3. Every amount is an integer in minor units of the settlement currency (tiyn for tKZT, 1e-6 for USDC). Math in u128, round half-up at holder level (see 03-domain).
4. Batch instructions take holders via `remaining_accounts` in fixed-size triples/pairs; idempotent (re-running a batch that is already processed is a no-op, not an error).
5. Authorities: `registrar` (operator), `issuer`, `paying_agent` — three pubkeys stored in `Series`; for the demo they may be the same keypair, but checks are explicit.

### Token-2022 bond mint (created client-side, validated in `init_series`)
Extensions: `MetadataPointer` + `TokenMetadata` (name, symbol=ticker, uri, additional fields: `isin`, `face_value`, `coupon_rate_bps`, `frequency`, `day_count`, `maturity`, `status`), `DefaultAccountState = Frozen`, `PermanentDelegate = series PDA`, `Pausable` (authority = series PDA), `MintCloseAuthority = series PDA`. `mint_authority = series PDA`, `freeze_authority = series PDA`, decimals = 0 (1 token = 1 bond). The cash mint is any SPL Token or Token-2022 mint (tKZT: Token-2022, 2 decimals; USDC devnet: SPL Token, 6 decimals) — use `anchor_spl::token_interface` everywhere.

**Creation sequence** (one tx; the PDA cannot sign, so the registrar is the *temporary* mint authority): `CreateAccount` (space for the fixed extensions, lamports for + ~512 B of metadata) → `InitializeMetadataPointer(authority=registrar, metadata=mint)` → `InitializePermanentDelegate(series)` → `InitializePausableConfig(series)` → `InitializeMintCloseAuthority(series)` → `InitializeDefaultAccountState(Frozen)` → `InitializeMint2(decimals 0, mint_authority=registrar, freeze_authority=series)` → `InitializeTokenMetadata(update_authority=registrar, mint_authority=registrar signs)` → `UpdateField…` (registrar) → `SetAuthority(MintTokens → series)`. **Metadata update authority = registrar**: `apply_terms_change`/`close_series` require the registrar signer for the metadata CPI. `init_series` (see also docs/SECURITY_NOTES.md) rejects the mint unless: the MetadataPointer authority is the registrar or none (`InvalidAuthority`); all five extensions + TokenMetadata present and **no other extension** (allowlist — a transfer hook/fee/non-transferable would change behaviour after validation), pointer → mint itself, default state Frozen, decimals 0 (`InvalidMintExtensions`), supply 0 (`SupplyNotZero`), not paused (`MintPaused`); delegate, pause, close, mint and freeze authorities = series PDA and metadata update authority = registrar (`InvalidAuthority`). Reference implementation: `programs/qupon_bonds/tests/common/mod.rs::create_bond_mint`.

### Accounts (PDAs)

`Series` — seeds `["series", mint]`
```
bump u8; mint Pubkey; cash_mint Pubkey; registrar Pubkey; issuer Pubkey; paying_agent Pubkey;
isin [u8;12]; ticker [u8;16] (zero-padded ascii);
face_value u64 (minor units of cash_mint per bond); coupon_rate_bps u32; frequency u8 (1,2,4,12);
day_count u8 (0=THIRTY_360, 1=ACT_ACT, 2=ACT_365);
issue_date i64; maturity_date i64; next_coupon_date i64; period_start i64;
status u8 (0 Active, 1 Matured, 2 Retiring, 3 Closed);
total_issued u64; action_count u32; quorum_bps u16; approval_bps u16;
tax_vault Pubkey (ATA of series PDA for cash_mint); open_action Option<Pubkey> (the one non-final action; set by announce_action, cleared by cancel/complete); open_trades u32 (admitted Solana DvP trades not yet released; `strike_record` requires 0); hook u8; record_kind u8; record_seq u32; record_at i64; ckpt_count u32; ckpt_late u32 (transfer-hook gate, plan 15 D1'); day_secs u32 (0 = real Almaty clock, 1..86 399 s per civil day = demo clock, plan 15 D7); issue_ymd u32 (packed yyyymmdd of the issue civil date — the demo anchor; derived on-chain on the real clock); reserved [u8;30] — everything after open_action is carved from the original reserved, so the account stays 389 B and older series read 0
```

`Investor` — seeds `["investor", series, owner]`
```
bump u8; series Pubkey; owner Pubkey; bond_ata Pubkey; cash_ata Pubkey;
investor_type u8 (0 Individual, 1 Legal); residency u8 (0 Resident, 1 NonResident);
tax_rate_bps u16; status u8 (0 Active, 1 Suspended); kyc_ref [u8;32] (hash of off-chain KYC record);
registered_at i64
```

`CorporateAction` — seeds `["action", series, action_index:u32 LE]`
```
bump u8; series Pubkey; index u32;
kind u8 (0 Interest INTR, 1 Redemption REDM, 2 EarlyRedemption MCAL, 3 PartialRedemption PCAL,
         4 Meeting BMET, 5 TermsChange CHAN);
mandatory u8 (0 MAND, 1 VOLU, 2 CHOS);
corp_id [u8;16]  (CORP, our id e.g. "QPNb1-INTR-0001"); official_id [u8;16] (COAF, registrar/KASE-assigned, may be empty);
announced_at i64; record_at i64; payment_at i64; period_start i64; period_end i64; accrual_days u32;
rate_bps u32; per_unit_gross u64 (coupon part); per_unit_principal u64 (0 for INTR);
cash_mint Pubkey; escrow Pubkey (ATA of action PDA);
status u8 (0 Announced, 1 RecordStruck, 2 SnapshotComplete, 3 Funded, 4 Settling, 5 Completed,
           6 Retiring, 7 Cancelled, 8 VotingOpen, 9 Finalized);
snapshot_slot u64; snapshot_hash [u8;32]; units_snapshotted u64; holders_snapshotted u32; holders_paid u32;
total_gross u64; total_tax u64; total_net u64; total_paid u64; total_retired u64; holders_retired u32;
// meeting fields
proposal_new_rate_bps u32; proposal_new_maturity i64; voting_ends_at i64;
votes_for u64; votes_against u64; votes_abstain u64; result u8 (0 Pending, 1 Approved, 2 Rejected, 3 NoQuorum);
completed_at i64; factor_bps u16 (PCAL only); total_principal u64 (Σ holder principal); reserved [u8;64]
```

`Entitlement` — seeds `["entitlement", action, owner]`
```
bump u8; action Pubkey; owner Pubkey; units u64; gross u64; tax u64; net u64; principal u64;
status u8 (0 Snapshotted, 1 Paid, 2 Retired); paid_at i64;
vote u8 (0 None, 1 For, 2 Against, 3 Abstain); voted_at i64
```

`TradeAdmission` — seeds `["trade", series, swap_dvp]` (one admitted Solana DvP trade; closed by `release_trade`)
```
bump u8; series Pubkey; swap_dvp Pubkey (the DvP program's SwapDvp record); escrow Pubkey (its bond-leg ATA);
seller Pubkey; buyer Pubkey; units u64; cash_amount u64; admitted_at i64
```

### Instructions (signer → effect → emitted event)

| # | Instruction | Signer | Preconditions | Effect | Event |
|---|---|---|---|---|---|
| 1 | `init_series(params)` | registrar | mint as above; cash_mint any token program; params: `{issuer, paying_agent, isin, ticker, face_value>0, coupon_rate_bps, frequency∈{1,2,4,12}, day_count (ACT_ACT → UnsupportedDayCount), issue_date and maturity_date are midnights of the series clock, first coupon ≤ maturity, day_secs (0 = real, else 1..86 399 = demo clock, D7), issue_ymd (demo calendar anchor; real clock: derived from issue_date, a non-zero argument must agree), quorum_bps, approval_bps ≤ 10000}` | create Series (`period_start = issue_date`, `next_coupon_date = issue_date + 12/frequency months` on the series clock, end-of-month clamped), create tax_vault ATA and validate the mint authorities/extensions
| 2 | `register_investor(kyc)` | registrar | Series.status Active; `kyc_attestation` is a live SAS attestation (owner = SAS program, credential `KYC_CREDENTIAL`, schema `KYC_SCHEMA`, nonce = owner, not expired) whose data equals `kyc` (type, residency, tax) and `kyc.kyc_ref` = its address (`KycAttestationInvalid`) | create Investor; create bond ATA if missing (payer registrar) and **thaw** it (CPI thaw_account, series PDA signer); create cash ATA if missing | `InvestorRegistered` |
| 3 | `suspend_investor` / `reinstate_investor` | registrar | suspend: status Active (`InvestorSuspended`); reinstate: status Suspended, or Active with a frozen bond ATA (`InvestorNotActive` otherwise) | status flag; suspend freezes the bond ATA unless it is already frozen, reinstate thaws it. A bond ATA its owner closed and recreated comes back frozen (DefaultAccountState): reinstate on the still-Active investor thaws it again | `InvestorStatusChanged` |
| 4 | `subscribe(units, price_per_unit)` | investor | Investor Active; placement open (Series.status Active, now < issue window end or always for demo) | `price_per_unit == face_value` (placement at par — the investor cannot pick the price, else `InvalidParams`); mint not paused (`MintPaused`); transfer `units*price` cash investor→issuer cash account (any token account of `series.issuer` for `cash_mint`); mint `units` to investor (series PDA mint authority); total_issued += units | `Subscribed` |
| 5 | `issue_units(units)` | issuer | Investor Active | mint without cash (free allocation / demo) | `UnitsIssued` |
| 6 | `announce_action(args)` | registrar (INTR/REDM/MCAL/PCAL) or issuer (BMET); CHAN is never announced (it results from an approved BMET) → `InvalidParams` | Series Active; `open_action` is None (`ActionAlreadyOpen`); `now < record_at ≤ payment_at`; mandatory = MAND for cash kinds, VOLU for BMET. Cash kinds: `period_*_ymd` must be the Almaty dates of the Almaty-midnight `period_*_ts` (`InvalidDates`); `accrual_days` = crate day count (`EntitlementCalcMismatch`); `period_start_ts == Series.period_start` and `rate_bps == Series.coupon_rate_bps`; INTR ends at `next_coupon_date`, REDM at `maturity_date`, MCAL/PCAL before both. BMET: `voting_ends_at > record_at`, a rate or maturity proposal; quorum/approval come from Series. Args: `{kind, mandatory, corp_id, official_id, record_at, payment_at, period_start_ymd, period_end_ymd, period_start_ts, period_end_ts, accrual_days, rate_bps, factor_bps, proposal_new_rate_bps, proposal_new_maturity, voting_ends_at}` | create CorporateAction (PDA index = action_count), escrow ATA (authority = action PDA); `per_unit_gross` = crate `per_unit_gross`, `per_unit_principal` = face (REDM/MCAL) or round(face × factor_bps / 10000) (PCAL); action_count += 1; open_action = action | `ActionAnnounced` |
| 7 | `cancel_action` | registrar | status Announced (`WrongStatus`) | status Cancelled; Series.open_action = None | `ActionCancelled` |
| 8 | `strike_record` | anyone (plan 15 D2: permissionless crank) | status Announced; Series.open_trades == 0 (`TradesInFlight`); now ≥ record_at (clock) — for demo a `--force` flag is NOT allowed on-chain; use short periods instead | CPI `pause` mint; status RecordStruck; snapshot_slot = clock.slot | `RecordStruck` |
| 9 | `snapshot_batch` | anyone (plan 15 D2: permissionless crank) | status RecordStruck; mint paused (`MintNotPaused`); ≤ 8 triples (`BatchTooLarge`); the ATA must be `Investor.bond_ata` and the Entitlement address the PDA for (action, owner) (`InvalidParams`); Entitlement is created griefing-safe (works if its address was pre-funded); holder order is **not** enforced on-chain (a missed holder can always be added later) — the CLI snapshots ascending by owner and the reconciler flags a hash mismatch otherwise | remaining_accounts = N × [Investor PDA, bond ATA (owner==investor.owner, mint==series.mint), Entitlement PDA (init if needed, payer = crank)]; skip zero balances; for each new entitlement: units=ata.amount; compute gross/tax/net/principal (03-domain); totals += ; holders_snapshotted += 1; snapshot_hash = sha256(snapshot_hash ‖ owner ‖ units_le) | `HolderSnapshotted` per holder |
| 10 | `finalize_snapshot` | anyone (plan 15 D2: permissionless crank) | status RecordStruck; units_snapshotted == mint.supply | status SnapshotComplete; for BMET: CPI `resume` (votes use snapshot weights, so trading continues during the voting window) and status VotingOpen; refuses an empty snapshot (`NothingToDo`) | `SnapshotFinalized` |
| 11 | `fund_action(amount)` | issuer or paying_agent | status SnapshotComplete or Funded; amount > 0 | transfer min(amount, shortfall) cash funder → escrow (never more than net + tax + principal − balance; `NothingToDo` when nothing is owed); if escrow.amount ≥ total_net + total_tax + total_principal → status Funded | `ActionFunded` |
| 12 | `pay_batch` | anyone (plan 15 D2: permissionless crank) | status Funded or Settling (SnapshotComplete → `Underfunded`); ≤ 10 triples (`BatchTooLarge`) | remaining = N × [Entitlement (w), Investor, holder cash ATA (w)] — ATA must be `Investor.cash_ata`; for each Snapshotted entitlement: transfer net + principal escrow→holder (action PDA signer), tax escrow→tax_vault; status Paid, paid_at; holders_paid += 1; total_paid += net + principal; status Settling. Paid entitlements are skipped (idempotent, duplicates in one batch paid once) | `EntitlementPaid` per holder |
| 12a | `pay_batch` (plan 15 layout) | anyone | as above; remaining accounts per holder = [Entitlement (w), Investor, PayoutRoute PDA `["route", investor]`, cash destination (w), bond ATA (w)], ≤ 5 holders (CLI sends 4); fixed accounts add the bond `mint` (w) and the Token-2022 program | REDM/MCAL: pay net + principal, then burn the holder's units as permanent delegate in the same instruction (thaw first if suspended; legacy series lift the pause for the batch and restore it), entitlement → Retired, `total_retired`/`holders_retired` updated, so `close_series` follows `complete_action` directly | `EntitlementPaid`, `UnitsRetired` |
| 13 | `complete_action` | anyone (plan 15 D2: permissionless crank) | status Settling; holders_paid == holders_snapshotted and total_paid == total_net + total_principal (`PaymentsIncomplete`) | CPI `resume`. INTR: Series.period_start = period_end; next_coupon_date = `add_months_almaty(issue_date, k × 12/frequency)` for the next coupon number k (computed from issue_date, never by stepping — end-of-month clamping would drift), capped at maturity (the final coupon is paid with REDM); open_action = None; status Completed. PCAL: no burn, holders keep their units; Series.face_value −= per_unit_principal (outstanding face, later coupons and REDM accrue on it), period_start = period_end, next_coupon_date advanced only if the call date reached it; open_action = None; status Completed. REDM/MCAL: status Retiring; Series.status Retiring (open_action stays until close_series) | `ActionCompleted` |
| 14 | `retire_batch` | anyone (plan 15 D2: permissionless crank) | action status Retiring (so only after pay → complete); ≤ 12 pairs (`BatchTooLarge`) | remaining = N × [Entitlement (w), bond ATA (w)] with ATA.mint = series mint and ATA.owner = entitlement owner; a frozen (suspended) ATA is thawed first (permanent delegate cannot burn frozen accounts); burn the ATA's whole balance via permanent delegate (series PDA signer, burn_checked); Entitlement Retired; total_retired, holders_retired. Retired entitlements are skipped (idempotent). A pair may also be [Investor, its bond ATA] for a registered wallet without an Entitlement (units moved after the resume): its balance is burned too, not counted as a holder — so nobody can block `close_series` | `UnitsRetired` |
| 15 | `close_series` | registrar | action Retiring; mint.supply == 0 (`SupplyNotZero`); holders_retired == holders_snapshotted | registrar tops up the mint's rent (returned by the close), metadata `update_field status=REDEEMED` (registrar = update authority), CPI close mint (MintCloseAuthority = series PDA, lamports → registrar); Series.status Closed, open_action None; action Completed | `SeriesClosed` |
| 16 | `cast_vote(choice)` | investor (owner) | kind BMET (`InvalidParams`); status VotingOpen and now < voting_ends_at (`VotingClosed`); Entitlement PDA (action, signer) — vote == None (`AlreadyVoted`); choice 1 For / 2 Against / 3 Abstain | Entitlement.vote, voted_at; votes_* += units (snapshot weight) | `VoteCast` |
| 17 | `finalize_meeting` | registrar | kind BMET; status VotingOpen; now ≥ voting_ends_at or every snapshotted unit voted (`VotingOpen`) | quorum: (for+against+abstain) × 10000 ≥ units_snapshotted × quorum_bps else NoQuorum; approval: for × 10000 ≥ (for+against) × approval_bps (and for+against > 0) → Approved else Rejected; status Finalized; Rejected/NoQuorum also clear open_action | `MeetingFinalized` |
| 18 | `apply_terms_change` | registrar (signature = SIMULATED ARDFM registration) | kind BMET; status Finalized; result Approved (`NotApproved`); a proposed maturity must be an Almaty midnight ≥ next_coupon_date | Series.coupon_rate_bps / maturity_date updated, effective for the current unpaid coupon period onward (the next INTR announce must use the new rate); metadata update_field `coupon_rate_bps` / `maturity` (+ exact rent top-up by the registrar); open_action None; status Completed | `TermsChanged` (`regulator_registration_simulated: true`) |
| 19 | `admit_trade` | registrar or paying_agent | Series Active; mint not paused (`MintPaused`); `swap_dvp` is a SwapDvp record of the Solana DvP program (`DVP_PROGRAM_ID`, 458 bytes) with mint_a = bond mint, mint_b = cash_mint, settlement_authority = registrar or paying_agent, settlement destinations = the parties themselves, user_a / user_b = owners of the passed `seller` / `buyer` Investor records (`InvalidTrade`), both Active; `escrow` = ATA of `swap_dvp` for the bond mint | thaw the escrow (series PDA signer); create TradeAdmission; open_trades += 1 | `TradeAdmitted` |
| 20 | `release_trade(force)` | registrar or paying_agent | TradeAdmission of this series and escrow; `seller` = the admission's seller Investor, `seller_bond_ata` = its registered bond account (`InvalidTrade`); the escrow is closed (the DvP program closes it on settle/cancel/reject) or holds 0 units, else `TradeStillOpen` unless `force` | `force` with units in the escrow: thaw the seller's bond account if frozen, move the units back to it as permanent delegate, re-freeze it if the seller is Suspended. A still-existing escrow is frozen; close TradeAdmission (rent → signer); open_trades −= 1 | `TradeReleased` (with `returned_units`) |
| 21 | `sweep_escrow` | registrar/paying_agent | action Completed, Retiring or Cancelled (nobody can be owed from the escrow) | transfer the escrow's whole balance → an issuer cash account (token authority = series.issuer), close the escrow (rent → signer) | `EscrowSwept` |
| 22 | `init_hook` | registrar | the mint's TransferHook program id = this program (`InvalidMintExtensions`); series not hooked yet (`AlreadyProcessed`) | create the validation account `["extra-account-metas", mint]` with 3 extra metas (series; checkpoints of the source and destination owners, owner = bytes 32..64 of the token accounts); `series.hook = 1` | — |
| 23 | — | — | (spike-only `init_checkpoint` removed in 1510: checkpoints are created by `register_investor` and `admit_trade` on hooked series; one created after the pending `record_at` starts at its `record_seq` and counts in `Series.ckpt_late`) | — | — |
| 24 | — | — | (spike-only `mark_snapshotted` removed in 1510: `snapshot_batch` advances checkpoints) | — | — |
| 25 | `execute(amount)` | Token-2022 (transfer hook, SPL `Execute` discriminator) | source token account has `TransferHookAccount.transferring` (`NotTransferring` — a direct call never passes); hooked series with a pending record and `now ≥ record_at`: redemption kinds → `RecordLocked`; else both owners' checkpoints must have `last_seq ≥ record_seq` (`HolderNotSnapshotted`) | none (read-only gate) | — |

Clock: all time checks use `Clock::get()?.unix_timestamp`. Date math goes through the series clock (`SeriesClock`, src/clock.rs, a wrapper over `entitlement::CivilClock`): real series keep Almaty midnights byte-for-byte; demo series (`day_secs` seconds per civil day anchored at `issue_date`/`issue_ymd`, plan 15 D7) run the same civil-date math on compressed days and are labelled DEMO everywhere. Tests set the clock (LiteSVM `warp_to_slot` / set sysvar). The demo uses short real periods (e.g. record_at = now + 60 s).

Batch sizing: snapshot 8 holders/tx (3 accounts each + fixed), pay 5 holders/tx on-chain max (the CLI sends 4: 5 triples exceed the 1232-byte tx limit without a lookup table), retire 12 holders/tx; every CLI tx sets a 600k compute-unit limit. Measured in LiteSVM (`reports/cu-benchmarks.md`): about 10–11k CU per holder for snapshot, 10–17k for pay and 4–12k for retire; the heaviest batch at the size the CLI sends (snapshot 8) used 82,790 CU, 13.8% of that limit, and the worst measured batch (retire 12) used 56,333 CU, 4.0% of the 1.4M compute limit, so compute is not what limits the batch sizes. The CLI pages over Investor PDAs (`getProgramAccounts` filter discriminator + series) in deterministic order (by owner pubkey ascending) so the snapshot hash is reproducible off-chain.

### Errors (non-exhaustive, name them exactly)
`Unauthorized`, `InvalidMintExtensions`, `InvalidAuthority`, `InvestorNotActive`, `InvestorSuspended`, `SeriesNotActive`, `ActionAlreadyOpen`, `InvalidDates`, `TooEarly`, `WrongStatus`, `MintNotPaused`, `MintPaused`, `AccountMintMismatch`, `AccountOwnerMismatch`, `SupplyMismatch`, `Underfunded`, `AlreadyProcessed`, `NothingToDo`, `MathOverflow`, `RoundingDrift`, `VotingClosed`, `VotingOpen`, `AlreadyVoted`, `NoQuorum`, `NotApproved`, `SupplyNotZero`, `BatchTooLarge`, `EntitlementCalcMismatch`. Also `UnsupportedDayCount`, `InvalidParams`, `PaymentsIncomplete`, `KycAttestationInvalid`. Codes are positional (6000 + index in `programs/qupon_bonds/src/error.rs`) — append only, never reorder, `TradesInFlight`, `TradeStillOpen`, `InvalidTrade`.

### Events
Every event carries `series`, `action` (where relevant), `index`, `slot`, `timestamp`, and the fields a seev message needs (see 03-domain mapping); `ActionAnnounced` also carries `official_id` (COAF), `cash_mint`, `escrow`, `factor_bps` and the meeting proposal. The escrow and tax_vault ATAs are created with `init_if_needed` so that anyone pre-creating them (their PDAs are predictable) cannot block `announce_action`/`init_series`. Use Anchor `#[event]` + `emit!`.

## TypeScript client and CLI (`clients/ts`)
- Generated client via Codama from `target/idl/qupon_bonds.json` (`pnpm codama`), runtime `@solana/kit` 8.x, `@solana-program/token-2022`, `@solana-program/token`.
- `qupon` CLI (commander), every command has `--json` and `--rpc`, keypairs from `--keypair <path>` or env `QUPON_KEYPAIR`:
  `series:init`, `investor:register`, `investor:suspend`, `subscribe`, `issue`, `action:announce`, `action:cancel`, `action:strike`, `action:snapshot` (auto-batches all investors), `action:finalize-snapshot`, `action:fund`, `action:pay` (auto-batches), `action:complete`, `action:retire` (auto-batches), `series:close`, `action:sweep` (finished action's escrow → issuer, idempotent), `vote`, `meeting:finalize`, `meeting:apply`, `state:dump` (all PDAs of a series as JSON), `explorer` (prints links).
- Secondary trades (`src/commands/trade.ts`, rules in 03-domain §4a): `trade:create` (registrar: `CreateDvp` on the Solana DvP program + `admit_trade` in one transaction; prints `swapDvp`), `trade:fund --side seller|buyer` (investor: verifies the on-chain record, then one plain `TransferChecked` into the escrow), `trade:settle` (registrar: `SettleDvp` + `release_trade`), `trade:cancel [--force]` (registrar: `CancelDvp` + `release_trade`; `--force` skips the DvP program and returns the escrowed bonds to the seller), `trade:list`; `state:dump` also prints `trades`. The DvP program's client is generated by the same `pnpm codama` into `src/dvp/generated` from the vendored IDL `idl/dvp_swap_program.json`; helpers in `src/lib/dvp.ts`.
- Scripts: `create-tkzt.ts`, `create-bond-mint.ts`, `demo-coupon.ts`, `demo-full.ts` (writes `reports/*.md` with tx links; `DEMO_TRADE=1` = `make demo-trade` → `reports/demo-trade.md`).
- Exit code ≠ 0 on any failure; JSON output on stdout only, logs on stderr (Go execs it).

## Go registrar service (`services/registrar`)
Packages: `internal/chain` (RPC client via `github.com/solana-foundation/solana-go/v2`, Borsh decoders for the four accounts, discriminators = first 8 bytes of sha256("account:<Name>")), `internal/entitlement` (math mirror; reads `fixtures/entitlement.json`), `internal/reconcile`, `internal/executor` (exec `qupon` CLI with JSON), `internal/scheduler` (ticker loop; dry-run; approval gate), `internal/iso20022` (seev.031 / seev.036 structs → XML), `internal/notice` (KASE-style text EN/RU/KK), `internal/disclosure` (anchors the deterministic seev.031 via `disclosure:attach`, plan 15 D9), `internal/store` (SQLite via modernc.org/sqlite), `internal/api` (chi router, OpenAPI at `/openapi.yaml`).

REST (JSON): `GET /series`, `GET /series/{mint}`, `GET /series/{mint}/investors`, `GET /series/{mint}/schedule`, `GET /series/{mint}/actions`, `GET /actions/{pda}`, `GET /actions/{pda}/entitlements`, `GET /actions/{pda}/reconcile`, `POST /actions/{pda}/advance` (runs the next step through the executor; body `{confirm:true, autofund?:bool}`; signs with the operator keys, so it requires a back-office session with role registrar — also served as `POST /registrar/actions/{pda}/advance`). Back-office auth: `POST /auth/login|/auth/demo|/auth/logout`, `GET /me`; bearer session tokens (sha256-hashed at rest, 12 h), roles issuer / registrar / investor_demo / admin; demo sign-in only with `DEMO_LOGIN=1`, `GET /actions/{pda}/iso/seev031.xml`, `GET /entitlements/{pda}/iso/seev036.xml`, `GET /actions/{pda}/notice?lang=en|ru|kk`, `GET /actions/{pda}/disclosure-hash` (plan 15 D9: `{hash, onchain, match}` — re-hash of the anchored seev.031), `GET /schedule` (planned actions for every series), `GET /approvals?status=pending|executed|all` and `POST /approvals/{id}/approve` (the scheduler's approval gate; approve runs the stored argv via the executor and honours `ADVANCE_TOKEN`), `GET /activity`, `GET /healthz`.

Secondary trades (`internal/api/trades.go`, rules in 03-domain §4a): `GET /series/{mint}/trades` (public; `{openTrades, items}` read from the `TradeAdmission` accounts and the two escrow token accounts — `status` is `closed` when an escrow account is gone, `ready` when both legs cover `units` / `cashAmount`, else `awaiting_funding`; `GET /series/{mint}` carries `openTrades` too) · registrar: `POST /registrar/series/{mint}/trades {seller, buyer, units}` → `trade:create`, `POST /registrar/series/{mint}/trades/{swapDvp}/settle` → `trade:settle`, `POST …/cancel {force?}` → `trade:cancel [--force]` · demo investors: `POST /demo/investor/series/{mint}/trades/{swapDvp}/fund {side}` → `trade:fund --keypair` with the server-held keypair whose public key is that party (`QUPON_INVESTOR_KEYPAIR`, `QUPON_INVESTOR1..3_KEYPAIR`; otherwise `403 not_demo_investor`). A trade not admitted in that series is `404 trade_not_found` before any CLI run. While `Series.open_trades > 0` the next step of an Announced action is a wait (`open secondary trades: settle or cancel them first (N)`) in both `POST …/advance` and the scheduler, which never settles or cancels a trade itself.

## Web app (`apps/web`, Next.js 15 app router, Tailwind, wallet-adapter)

**Routes** (EN/RU via next-intl, cookie `NEXT_LOCALE`; every page renders a calm empty/error state when the API is down — no error overlay):

- Public: `/` landing (scenarios, live stats, implemented-vs-simulated table) · `/bonds` board · `/bonds/[mint]` terms, schedule, action history · `/login` (email + password, or one-click demo issuer / registrar / investor) · `/forbidden` (wrong role) · `/ui` component gallery.
- Issuer cabinet — `requireRole(path, "issuer")`: `/issuer` dashboard · `/issuer/series` · `/issuer/series/new` wizard (terms → schedule preview → issue on-chain) · `/issuer/series/[mint]` (announce INTR/REDM/MCAL, call bondholder meeting, fund escrow).
- Registrar cabinet — `requireRole(path, "registrar")`: `/registrar` pipeline + alerts · `/registrar/investors` (KYC onboarding, suspend/reinstate) · `/registrar/actions` · `/registrar/actions/[pda]` (next step with polling, entitlements, funding, reconcile, ISO 20022 + KASE notice downloads) · `/registrar/activity` (on-chain events + operator audit) · `/registrar/autopilot` (scheduler approvals).
- Investor cabinet — open (no back-office session): `/investor` portfolio · `/investor/placement` (DvP at par) · `/investor/meetings` (vote) · `/investor/statements` (seev.036 per payout). Identity resolution: connected wallet → self-custody (signs in the browser); session role `investor_demo` → the demo custodial wallet (server-signed, labelled DEMO); neither → a chooser card ("Connect wallet" / "Try the demo investor").
- Legacy prototype links 308-redirect (`next.config.ts`): `/console` → `/registrar`, `/series/:mint` → `/bonds/:mint`, `/actions/:pda` → `/registrar/actions/:pda`, `/portal` → `/investor`, `/kitchen-sink` → `/ui`.

**Sessions.** The session token never reaches client JS. Next route handlers `POST /api/session/login|demo|logout` call the Go API, then set/clear the httpOnly cookie `qupon_session` (Secure in production, SameSite=Lax, Path=/, Max-Age 43 200 = 12 h — `src/lib/session.ts`). Server components call `getSession()` → `GET /me` with `Authorization: Bearer <token>` over the server-to-server base `API_INTERNAL_URL`; `requireRole(path, …roles)` redirects signed-out users to `/login?next=<path>` and wrong roles to `/forbidden`. Demo sign-in posts `POST /auth/demo {role}` and only works when the Go API runs with `DEMO_LOGIN=1`; demo identities carry a visible DEMO pill everywhere.

**Write proxy `POST /api/bo/[...path]`.** Browser writes never call the Go API directly: the proxy accepts JSON only (415 otherwise), checks `Origin` equals the served host (CSRF, 403 otherwise), forwards the bearer from the cookie, and 403s any path outside the allowlist `^(issuer|registrar|demo)/…` with no `..`/`//` (`src/app/api/bo/allowlist.ts`; auth routes are excluded — they have their own handlers). Clients use `boPost()` + the `useRunWrite()` hook: pending toast → success toast with explorer tx link(s), or an inline error that names and explains the on-chain error (EN/RU, `errors.onchain.*`). In dev with `API_MOCKING=enabled` the proxy and demo sign-in run without the Go API (`mock:<role>` tokens, `{mock:true}` responses) so the Playwright suite needs no chain.

**Auth endpoints (Go `internal/api/auth.go`, `internal/auth`)**, consumed by the session handlers: `POST /auth/login {email, password}` — bcrypt cost 12, 5 failed attempts per email per minute (failures only, unknown emails pay a dummy bcrypt) plus 20 sign-ins per client IP per minute on `/auth/login` and `/auth/demo`; `POST /auth/demo {role}` — gated by `DEMO_LOGIN`; `POST /auth/logout`; `GET /me`. Tokens are 32 random bytes and only their sha256 digest is stored (SQLite `sessions`, TTL 12 h). Every write route is wrapped in `requireRole(...)`: RBAC lives in Go only (the web gates pages for navigation, never for authority), and the middleware appends an audit row (user, role, route, params digest, result, signatures) served at `GET /registrar/audit`. CORS stays read-only: wildcard for GET only, never with credentials.

"Implemented" vs "Simulated" badges on UI steps that are simulated (ARDFM registration, Swift delivery).

## Platform v2 additions (plans 6–12, spec `docs/superpowers/specs/2026-10-06-qupon-platform-v2-design.md`)

**Storage** (`migrations/006_platform.sql`): `organizations`, `invites`, `reset_links`, `wallets` + `wallet_challenges`, `documents` (content-addressed files under `DATA_DIR/docs`, mode 0600), `kyc_applications`, `notifications` (unique per user + dedup key), `cash_assets`, `series_settings` (hidden/featured/KASE ticker/org), `kase_cache`; `users` gained `investor` role, `org_id`, `status`, `locale`.

**Go packages**: `internal/network` (deployment profile from the base config; `mainnetGuard`: on mainnet demo routes 403 `demo_disabled`, writes need `X-Confirm-Network: mainnet-beta` → else 428), `internal/assets` (on-chain mint verification for the cash-asset registry), `internal/kase` (kase.kz client: 1 req/s, 5 s timeout, cache TTL 1 h / 5 min, degrades on 5xx), `internal/notify` (fan-out of ingested events to holders' accounts — called by `internal/ingest` after each stored event, failures logged, never blocking), `internal/reports` (CSV statements, tax and holder reports), `internal/termsheet` (EXPERIMENTAL term-sheet import: pasted KASE text → series terms through an OpenAI-compatible LLM — Z.ai GLM by default, `TERMSHEET_LLM_*` / `ZAI_API_KEY` — with a SIMULATED regex fallback; 20 s timeout, one retry, 64 KB cap; route `POST /issuer/import/termsheet`).

**REST, platform** (session routes are role-checked in Go): `POST /auth/signup` · `PATCH /me/profile`, `POST /me/password` · `POST /me/wallets/challenge`, `POST|GET /me/wallets`, `DELETE /me/wallets/{address}` (ed25519 over `Qupon wallet link\n<email>\n<address>\nnonce:<n>`) · `POST|GET /me/documents`, `GET /documents/{id}` · `POST|GET /me/kyc`, `GET /registrar/kyc[?status]`, `GET /registrar/kyc/{id}`, `POST /registrar/kyc/{id}/approve|reject` · `GET /me/notifications[?unread=1&limit]`, `GET /me/notifications/count`, `POST /me/notifications/read {ids|all}` · `GET /me/reports/statement|tax`, `GET /registrar/reports/holders/{mint}`, `GET /issuer/reports/payouts/{pda}` · `GET /assets`, `GET|POST /admin/assets`, `PATCH /admin/assets/{mint}` · `GET /kase/bonds/{ticker}[/…]`, `GET /kase/news/{issuer}`, `GET /kase/series/{mint}`, `GET /actions/{pda}/kase-check`, `GET /actions/{pda}/disclosure.zip`, `POST /actions/{pda}/disclosure/submit` (SIMULATED) · `/admin/users[/{id}[/reset-link]]`, `/admin/organizations[/{id}]`, `/admin/series`, `/admin/audit`, `/admin/system` · `GET /network`.

**Web**: `/signup`, `/reset/[token]`, `/invite/[token]`, `/account` (+ `/account/notifications`), investor `/investor/kyc` and `/investor/reports`, registrar `/registrar/kyc[/id]` and `/registrar/reports`, issuer `/issuer/organization|team|documents`, `/print/[report]`, admin `/admin` (overview, users, organisations, series, assets, audit, system, network). Shell: Solana wallet button (Wallet Standard detection, `components/wallet`), notification bell, network badge. Proxies: `/api/bo` (JSON writes; PATCH/DELETE), `/api/bo-get` (session downloads), `/api/bo-upload` (multipart documents). i18n: `messages/<locale>.json` + feature namespaces `messages/<locale>/<ns>.json`; `StableLabel`/`StableText` keep control boxes identical in EN and RU. Motion: `components/motion` + `--animate-qp-*` tokens; entrances only after hydration, everything off under reduced motion.

## Data flow for one coupon
Scheduler (Go) notices `next_coupon_date − 5d` → creates announcement via executor (`qupon action:announce`) → at record_at `action:strike` → `action:snapshot` → `action:finalize-snapshot` → waits for `fund` (issuer presses Fund in console or scheduler in `--autofund` demo mode) → `action:pay` → `action:complete` → `action:sweep` (best-effort escrow → issuer; a failed sweep never fails the finished action) → reconciler re-reads chain and marks the event verified → ISO/notice endpoints serve files → UI polls `/actions/{pda}`.

## Config and secrets
`config/devnet.json`: `{ programId, tkztMint, usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", wallets: { registrar, issuer, payingAgent, investors[] } }` (public keys only). Secrets only in `.env` (git-ignored): `HELIUS_API_KEY`, `RPC_URL`, `ZAI_API_KEY`, keypair paths under `~/.config/qupon/*.json`.


### Hooked series: record date by transfer-hook gate (plan 15 D1', tasks 1509–1510)
- New series: the bond mint carries Token-2022 `TransferHook` = this program; `init_hook` (before any registration) writes `["extra-account-metas", mint]` with 3 extra metas (series; checkpoints of the source and destination owners).
- `announce_action` arms `Series.{record_kind, record_seq = index + 1, record_at}` and resets `ckpt_late`; `cancel_action` disarms (`record_at = 0`).
- From `record_at` the hook (`execute`) lets a transfer pass only if both owners' `Checkpoint.last_seq ≥ record_seq`; redemption kinds lock the register (`RecordLocked`). `subscribe`/`issue_units` fail with `RecordPending`. `strike_record` is not used (`WrongStatus`).
- `snapshot_batch` (anyone, from `record_at`, status Announced → RecordStruck on the first batch) takes positions: `[Investor, bond ATA, Entitlement (w), Checkpoint (w)]` or an admitted escrow `[TradeAdmission, escrow ATA, seller's Entitlement (w), escrow Checkpoint (w), seller Investor]` (escrowed units belong to the seller; a closed escrow is a zero position). Each position advances its checkpoint once (`positions_done += 1`); a holder's entitlement is recomputed on their total units and the set hash swaps their leaf.
- `finalize_snapshot`: `positions_done + ckpt_late == ckpt_count` (`PositionsIncomplete`) and `units_snapshotted ≥ supply` (holders' own burns after their snapshot can only lower supply); INTR/PCAL/BMET disarm the gate (`record_at = 0`, ex-date trading), REDM/MCAL keep it.
- `release_trade` refuses between `record_at` and the final snapshot (`RecordPending`); a forced release burns from the escrow and mints to the seller (a transfer would re-enter this program through Token-2022, which Solana forbids); it closes the escrow checkpoint (`ckpt_count − 1`).
- Legacy (non-hooked) series keep strike → pause → snapshot; INTR/PCAL now resume at `finalize_snapshot`, REDM/MCAL stay paused until `complete_action`.

### Default and cure (plan 15 D4, task 1512)
- `declare_default` (anyone): action SnapshotComplete, `now ≥ payment_at + one series day` (`NotOverdue`), escrow < net + tax + principal → status **Defaulted (10)**, `defaulted_at`, `Series.in_default = 1`, `defaults_count += 1`, event `ActionDefaulted { required, escrow_balance, shortfall, … }`. Coupons keep trading (the record is final); redemptions keep the register frozen.
- `fund_action` also accepts Defaulted; when the escrow covers the action → Funded, `cured_at`, `in_default = 0`, event `DefaultCured { late_secs }`; payment then goes to the record-date holders. A new action cannot be announced while one is in default (`ActionAlreadyOpen`).

### Holder-chosen payout route (plan 15 D6, task 1514)
- `set_payout_route(route, bank_ref_hash)` (the holder; `has_one owner`): creates/updates `PayoutRoute ["route", investor] {investor, route (0 wallet, 1 bank), bank_ref_hash, updated_at}`; bank needs a non-zero sha256 of the bank details, wallet a zero hash; event `PayoutRouteSet`. Nobody else can choose or change it.
- `pay_batch`: a bank-routed holder's payout must go to the paying agent's cash ATA (`AccountOwnerMismatch` otherwise), entitlement → `PaidToAgent (3)`, `CorporateAction.bank_pending += 1`, event `PaidToAgent`; redemptions still burn now.
- `confirm_bank_payout(reference_hash)` (paying agent): `PaidToAgent → Paid` (coupon) or `Retired` (redemption), `bank_pending −= 1`, event `BankPayoutConfirmed`. `complete_action` requires `bank_pending == 0` (`BankPayoutsPending`). The bank transfer itself is SIMULATED.

### Disclosure anchoring and accrued interest on trades (plan 15 D9, task 1515)
- `attach_disclosure(hash)` (registrar, once per action, any status but Cancelled): `CorporateAction.disclosure_hash` = sha256 of the action's seev.031 XML; `AlreadyAttached` on a second call; event `DisclosureAttached`. CLI `disclosure:attach --file`.
- `admit_trade` takes the series' open action as an optional last account (required when `series.open_action` is set, must match) and emits `TradeAccrued {units, cash_amount, settle_ymd, accrued_days, accrued, clean}`: accrual from `series.period_start`, or from an open INTR action's `period_end` once its record date is struck (RecordStruck … Settling, Defaulted) — negative accrued, the seller keeps the coupon. Event only; `clean = cash_amount − accrued`. `trade:create` prints the same split (`tradeAccrued`).
- `CorporateAction.reserved` is now 7 bytes (`bank_pending` u32 + `disclosure_hash` 32 taken from it); account size unchanged.

### Security review of the plan-15 wave (task 1519)
- `fund_action` with the escrow already covered (cash sent to the ATA directly) moves nothing but still advances to `Funded` / cures — a pre-funded escrow can no longer brick an action.
- `CorporateAction.finalize_delay: u32` (reserved 7 → 3) = seconds from `record_at` to `finalize_snapshot`; `declare_default` is due at `max(payment_at, record_at + finalize_delay) + grace`, so a late snapshot still leaves the issuer a full grace to fund.
- `pay_batch`: a holder whose destination does not match the route (route flipped after the crank read it, or a substituted account) is skipped — nothing moves, the entitlement stays `Snapshotted` — instead of failing the whole batch.
- `TradeAccrued` treats a trade as ex-coupon from the open coupon's `record_at` whatever its status (hooked series strike lazily).
- Trust assumption: bank-routed payouts complete only when the paying agent confirms them (`bank_pending`).
