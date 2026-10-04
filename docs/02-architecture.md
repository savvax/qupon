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

**Creation sequence** (one tx; the PDA cannot sign, so the registrar is the *temporary* mint authority): `CreateAccount` (space for the fixed extensions, lamports for + ~512 B of metadata) → `InitializeMetadataPointer(authority=registrar, metadata=mint)` → `InitializePermanentDelegate(series)` → `InitializePausableConfig(series)` → `InitializeMintCloseAuthority(series)` → `InitializeDefaultAccountState(Frozen)` → `InitializeMint2(decimals 0, mint_authority=registrar, freeze_authority=series)` → `InitializeTokenMetadata(update_authority=registrar, mint_authority=registrar signs)` → `UpdateField…` (registrar) → `SetAuthority(MintTokens → series)`. **Metadata update authority = registrar**: `apply_terms_change`/`close_series` require the registrar signer for the metadata CPI. `init_series` rejects the mint unless: all five extensions + TokenMetadata present and **no other extension** (allowlist — a transfer hook/fee/non-transferable would change behaviour after validation), pointer → mint itself, default state Frozen, decimals 0 (`InvalidMintExtensions`), supply 0 (`SupplyNotZero`), not paused (`MintPaused`); delegate, pause, close, mint and freeze authorities = series PDA and metadata update authority = registrar (`InvalidAuthority`). Reference implementation: `programs/qupon_bonds/tests/common/mod.rs::create_bond_mint`.

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
tax_vault Pubkey (ATA of series PDA for cash_mint); open_action Option<Pubkey> (the one non-final action; set by announce_action, cleared by cancel/complete); reserved [u8;64]
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

### Instructions (signer → effect → emitted event)

| # | Instruction | Signer | Preconditions | Effect | Event |
|---|---|---|---|---|---|
| 1 | `init_series(params)` | registrar | mint as above; cash_mint any token program; params: `{issuer, paying_agent, isin, ticker, face_value>0, coupon_rate_bps, frequency∈{1,2,4,12}, day_count (ACT_ACT → UnsupportedDayCount), issue_date and maturity_date are Almaty midnights, first coupon ≤ maturity, quorum_bps, approval_bps ≤ 10000}` | create Series (`period_start = issue_date`, `next_coupon_date = issue_date + 12/frequency months` in Almaty local time, end-of-month clamped), create tax_vault ATA | `SeriesInitialized` |
| 2 | `register_investor(kyc)` | registrar | Series.status Active | create Investor; create bond ATA if missing (payer registrar) and **thaw** it (CPI thaw_account, series PDA signer); create cash ATA if missing | `InvestorRegistered` |
| 3 | `suspend_investor` / `reinstate_investor` | registrar | — | status flag; suspend freezes the bond ATA | `InvestorStatusChanged` |
| 4 | `subscribe(units, price_per_unit)` | investor | Investor Active; placement open (Series.status Active, now < issue window end or always for demo) | `price_per_unit == face_value` (placement at par — the investor cannot pick the price, else `InvalidParams`); mint not paused (`MintPaused`); transfer `units*price` cash investor→issuer cash account (any token account of `series.issuer` for `cash_mint`); mint `units` to investor (series PDA mint authority); total_issued += units | `Subscribed` |
| 5 | `issue_units(units)` | issuer | Investor Active | mint without cash (free allocation / demo) | `UnitsIssued` |
| 6 | `announce_action(args)` | registrar (INTR/REDM/MCAL/PCAL) or issuer (BMET); CHAN is never announced (it results from an approved BMET) → `InvalidParams` | Series Active; `open_action` is None (`ActionAlreadyOpen`); `now < record_at ≤ payment_at`; mandatory = MAND for cash kinds, VOLU for BMET. Cash kinds: `period_*_ymd` must be the Almaty dates of the Almaty-midnight `period_*_ts` (`InvalidDates`); `accrual_days` = crate day count (`EntitlementCalcMismatch`); `period_start_ts == Series.period_start` and `rate_bps == Series.coupon_rate_bps`; INTR ends at `next_coupon_date`, REDM at `maturity_date`, MCAL/PCAL before both. BMET: `voting_ends_at > record_at`, a rate or maturity proposal; quorum/approval come from Series. Args: `{kind, mandatory, corp_id, official_id, record_at, payment_at, period_start_ymd, period_end_ymd, period_start_ts, period_end_ts, accrual_days, rate_bps, factor_bps, proposal_new_rate_bps, proposal_new_maturity, voting_ends_at}` | create CorporateAction (PDA index = action_count), escrow ATA (authority = action PDA); `per_unit_gross` = crate `per_unit_gross`, `per_unit_principal` = face (REDM/MCAL) or round(face × factor_bps / 10000) (PCAL); action_count += 1; open_action = action | `ActionAnnounced` |
| 7 | `cancel_action` | registrar | status Announced (`WrongStatus`) | status Cancelled; Series.open_action = None | `ActionCancelled` |
| 8 | `strike_record` | registrar or paying_agent | status Announced; now ≥ record_at (clock) — for demo a `--force` flag is NOT allowed on-chain; use short periods instead | CPI `pause` mint; status RecordStruck; snapshot_slot = clock.slot | `RecordStruck` |
| 9 | `snapshot_batch` | registrar/paying_agent (crank) | status RecordStruck; mint paused (`MintNotPaused`); ≤ 8 triples (`BatchTooLarge`); the ATA must be `Investor.bond_ata` and the Entitlement address the PDA for (action, owner) (`InvalidParams`); Entitlement is created griefing-safe (works if its address was pre-funded); holder order is **not** enforced on-chain (a missed holder can always be added later) — the CLI snapshots ascending by owner and the reconciler flags a hash mismatch otherwise | remaining_accounts = N × [Investor PDA, bond ATA (owner==investor.owner, mint==series.mint), Entitlement PDA (init if needed, payer = crank)]; skip zero balances; for each new entitlement: units=ata.amount; compute gross/tax/net/principal (03-domain); totals += ; holders_snapshotted += 1; snapshot_hash = sha256(snapshot_hash ‖ owner ‖ units_le) | `HolderSnapshotted` per holder |
| 10 | `finalize_snapshot` | registrar/paying_agent | status RecordStruck; units_snapshotted == mint.supply | status SnapshotComplete; for BMET: status VotingOpen | `SnapshotFinalized` |
| 11 | `fund_action(amount)` | issuer or paying_agent | status SnapshotComplete or Funded; amount > 0 | transfer cash funder → escrow; if escrow.amount ≥ total_net + total_tax + total_principal → status Funded | `ActionFunded` |
| 12 | `pay_batch` | registrar/paying_agent | status Funded or Settling (SnapshotComplete → `Underfunded`); ≤ 10 triples (`BatchTooLarge`) | remaining = N × [Entitlement (w), Investor, holder cash ATA (w)] — ATA must be `Investor.cash_ata`; for each Snapshotted entitlement: transfer net + principal escrow→holder (action PDA signer), tax escrow→tax_vault; status Paid, paid_at; holders_paid += 1; total_paid += net + principal; status Settling. Paid entitlements are skipped (idempotent, duplicates in one batch paid once) | `EntitlementPaid` per holder |
| 13 | `complete_action` | registrar/paying_agent | status Settling; holders_paid == holders_snapshotted and total_paid == total_net + total_principal (`PaymentsIncomplete`) | CPI `resume`. INTR: Series.period_start = period_end; next_coupon_date = `add_months_almaty(issue_date, k × 12/frequency)` for the next coupon number k (computed from issue_date, never by stepping — end-of-month clamping would drift), capped at maturity (the final coupon is paid with REDM); open_action = None; status Completed. REDM/MCAL/PCAL: status Retiring; Series.status Retiring (open_action stays until close_series) | `ActionCompleted` |
| 14 | `retire_batch` | registrar/paying_agent | action status Retiring | remaining = N × [Entitlement, bond ATA]; burn `units` via permanent delegate (series PDA signer, burn_checked); Entitlement status Retired; totals | `UnitsRetired` |
| 15 | `close_series` | registrar | action Retiring and holders_retired == holders_snapshotted; mint.supply == 0 | CPI close mint (MintCloseAuthority, lamports → registrar); metadata status=REDEEMED (update_field CPI before close); Series.status Closed; action status Completed | `SeriesClosed` |
| 16 | `cast_vote(choice)` | investor (owner) | action kind BMET; status VotingOpen; now < voting_ends_at; Entitlement.vote == None | vote, weight = units; votes_* += units | `VoteCast` |
| 17 | `finalize_meeting` | registrar | kind BMET; now ≥ voting_ends_at (or all units voted) | quorum: (for+against+abstain) ≥ units_snapshotted × quorum_bps/10000 else NoQuorum; approval: for ≥ (for+against) × approval_bps/10000 → Approved else Rejected; status Finalized | `MeetingFinalized` |
| 18 | `apply_terms_change` | registrar | kind BMET; result Approved; not yet applied | Series.coupon_rate_bps = proposal (effective next period), maturity if set; CPI metadata update_field `coupon_rate`; status Completed | `TermsChanged` |

Clock: all time checks use `Clock::get()?.unix_timestamp`. Tests set the clock (LiteSVM `warp_to_slot` / set sysvar). The demo uses short real periods (e.g. record_at = now + 60 s).

Batch sizing: snapshot 8 holders/tx (3 accounts each + fixed), pay 10 holders/tx, retire 12 holders/tx. The CLI pages over Investor PDAs (`getProgramAccounts` filter discriminator + series) in deterministic order (by owner pubkey ascending) so the snapshot hash is reproducible off-chain.

### Errors (non-exhaustive, name them exactly)
`Unauthorized`, `InvalidMintExtensions`, `InvalidAuthority`, `InvestorNotActive`, `InvestorSuspended`, `SeriesNotActive`, `ActionAlreadyOpen`, `InvalidDates`, `TooEarly`, `WrongStatus`, `MintNotPaused`, `MintPaused`, `AccountMintMismatch`, `AccountOwnerMismatch`, `SupplyMismatch`, `Underfunded`, `AlreadyProcessed`, `NothingToDo`, `MathOverflow`, `RoundingDrift`, `VotingClosed`, `VotingOpen`, `AlreadyVoted`, `NoQuorum`, `NotApproved`, `SupplyNotZero`, `BatchTooLarge`, `EntitlementCalcMismatch`. Also `UnsupportedDayCount`, `InvalidParams`, `PaymentsIncomplete`. Codes are positional (6000 + index in `programs/qupon_bonds/src/error.rs`) — append only, never reorder.

### Events
Every event carries `series`, `action` (where relevant), `index`, `slot`, `timestamp`, and the fields a seev message needs (see 03-domain mapping); `ActionAnnounced` also carries `official_id` (COAF), `cash_mint`, `escrow`, `factor_bps` and the meeting proposal. The escrow and tax_vault ATAs are created with `init_if_needed` so that anyone pre-creating them (their PDAs are predictable) cannot block `announce_action`/`init_series`. Use Anchor `#[event]` + `emit!`.

## TypeScript client and CLI (`clients/ts`)
- Generated client via Codama from `target/idl/qupon_bonds.json` (`pnpm codama`), runtime `@solana/kit` 8.x, `@solana-program/token-2022`, `@solana-program/token`.
- `qupon` CLI (commander), every command has `--json` and `--rpc`, keypairs from `--keypair <path>` or env `QUPON_KEYPAIR`:
  `series:init`, `investor:register`, `investor:suspend`, `subscribe`, `issue`, `action:announce`, `action:cancel`, `action:strike`, `action:snapshot` (auto-batches all investors), `action:finalize-snapshot`, `action:fund`, `action:pay` (auto-batches), `action:complete`, `action:retire` (auto-batches), `series:close`, `vote`, `meeting:finalize`, `meeting:apply`, `state:dump` (all PDAs of a series as JSON), `explorer` (prints links).
- Scripts: `create-tkzt.ts`, `create-bond-mint.ts`, `demo-coupon.ts`, `demo-full.ts` (writes `reports/*.md` with tx links).
- Exit code ≠ 0 on any failure; JSON output on stdout only, logs on stderr (Go execs it).

## Go registrar service (`services/registrar`)
Packages: `internal/chain` (RPC client via `github.com/solana-foundation/solana-go/v2`, Borsh decoders for the four accounts, discriminators = first 8 bytes of sha256("account:<Name>")), `internal/entitlement` (math mirror; reads `fixtures/entitlement.json`), `internal/reconcile`, `internal/executor` (exec `qupon` CLI with JSON), `internal/scheduler` (ticker loop; dry-run; approval gate), `internal/iso20022` (seev.031 / seev.036 structs → XML), `internal/notice` (KASE-style text EN/RU), `internal/store` (SQLite via modernc.org/sqlite), `internal/api` (chi router, OpenAPI at `/openapi.yaml`).

REST (JSON): `GET /series`, `GET /series/{mint}`, `GET /series/{mint}/investors`, `GET /series/{mint}/schedule`, `GET /series/{mint}/actions`, `GET /actions/{pda}`, `GET /actions/{pda}/entitlements`, `GET /actions/{pda}/reconcile`, `POST /actions/{pda}/advance` (runs the next step through the executor; body `{confirm:true}`), `GET /actions/{pda}/iso/seev031.xml`, `GET /entitlements/{pda}/iso/seev036.xml`, `GET /actions/{pda}/notice?lang=en|ru`, `GET /activity`, `GET /healthz`.

## Web app (`apps/web`, Next.js 15 app router, Tailwind, wallet-adapter)
Pages: `/` series list · `/series/[mint]` terms, schedule, holders, actions · `/actions/[pda]` status timeline (each step with tx link + explorer), entitlement table, buttons (announce/strike/snapshot/fund/pay/complete/retire/close, meeting finalize/apply) calling `POST /advance`, downloads (seev.031, seev.036 per row, notice) · `/portal` investor: connect wallet → holdings, next coupon & amount, history, open votes with For/Against/Abstain (wallet-signed via generated client), subscribe form (DvP).
"Implemented" vs "Simulated" badges on UI steps that are simulated (ARDFM registration, Swift delivery).

## Data flow for one coupon
Scheduler (Go) notices `next_coupon_date − 5d` → creates announcement via executor (`qupon action:announce`) → at record_at `action:strike` → `action:snapshot` → `action:finalize-snapshot` → waits for `fund` (issuer presses Fund in console or scheduler in `--autofund` demo mode) → `action:pay` → `action:complete` → reconciler re-reads chain and marks the event verified → ISO/notice endpoints serve files → UI polls `/actions/{pda}`.

## Config and secrets
`config/devnet.json`: `{ programId, tkztMint, usdcMint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU", wallets: { registrar, issuer, payingAgent, investors[] } }` (public keys only). Secrets only in `.env` (git-ignored): `HELIUS_API_KEY`, `RPC_URL`, `ZAI_API_KEY`, keypair paths under `~/.config/qupon/*.json`.
