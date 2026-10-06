# 03 — Domain rules, entitlement math, ISO 20022 mapping, test vectors

These rules are the "Corporate Action Logic" 25% of the score. Implement them exactly; the test vectors in `fixtures/entitlement.json` are the contract between the Rust crate, the on-chain program and the Go service.

## 1. Kazakhstan market rules we mirror (with sources)

| Rule | Source | How Qupon applies it |
|---|---|---|
| Coupon/principal is paid to holders registered **at the start of the last day of the period** for which the payment is made (local time of the CSD) | Law "On the Securities Market" art. 31, https://prg.kz/m/amp/document/1041258/7/370000 | `record_at` = period_end date at 00:00 Asia/Almaty (= previous day 19:00 UTC). `strike_record` is only valid when `clock ≥ record_at`. |
| Issuer transfers funds to the CSD ≥ 2 business days before period end; CSD pays holders within 2 business days; reports to issuer within 10 working days | KCSD paying-agent rules, https://backend.kcsd.kz/sk/document/740/ru/rules_payment_agent_NEW | Escrow must be funded (`Funded`) before `pay_batch`; `payment_at` defaults to `period_end + 2 days`; `complete_action` is the report. |
| Prospectus payment windows vary (e.g. 20 calendar days after period end) | BCC prospectus example | `payment_at` is a parameter; UI shows "due by". |
| Typical corporate bond: face 1,000 KZT, semi-annual or quarterly coupon, 30/360 | KASE listings (BTRKb33: 1,000 KZT, 15.95%, semi-annual, 30/360) | defaults in `series:init`. |
| Term changes (coupon, tenor) go through a bondholders' meeting, then registration with the regulator (ARDFM), then KASE disclosure | KASE news MFNKb1 (14% → 16%, 5 → 10 years, registered 8 Jun 2026) | BMET → `finalize_meeting` → `apply_terms_change` (registrar step labelled "ARDFM registration — simulated"). |
| Meeting quorum/thresholds under art. 18-2 | **UNVERIFIED** — John (lawyer) to confirm | configurable `quorum_bps` (default 5000) and `approval_bps` (default 6667 of votes cast, abstentions count toward quorum only). Never claim these are statutory. |
| Early redemption: trading suspended on notice; delisting after redemption | KASE Trading Rules item 77(1); delisting notices | MCAL pauses the mint at record date and closes the mint after retirement. |
| KASE disclosure notice format | e.g. https://kase.kz/en/information/news/show/1577089 | `notice` generator produces the same shape. |
| Withholding tax | configurable per investor; **default 0 bps**. Do not assert KZ tax law in the UI — show "tax rate per investor class (configurable)". | |

## 2. Entitlement math (integer, deterministic)

All amounts are integers in minor units of the settlement currency (`tiyn` = 1/100 KZT for tKZT; 1e-6 for USDC). Intermediate math in u128. `round_half_up(x/y)` = `(x + y/2) / y` for positive integers.

```
accrual_days = day_count(period_start, period_end)       // see §3
gross       = round_half_up(units * face * rate_bps * accrual_days, 10_000 * basis)   // basis = 360 or 365
tax         = round_half_up(gross * tax_bps, 10_000)
net         = gross - tax
principal   = units * face                                 // REDM / MCAL (PCAL: units * face * factor_bps / 10_000)
payout      = net + principal                              // what pay_batch transfers to the holder; tax goes to tax_vault
```

Rounding is done **per holder** (never per unit then multiplied): this is how a CSD computes payment lists and it keeps Σ(holder gross) within `holders / 2` minor units of `supply × exact per-unit coupon`. `finalize_snapshot` checks Σ gross against the **exact** per-unit fraction, not the rounded one: `2 × |Σ gross × 10_000 × basis − supply × face × rate_bps × days| ≤ holders_snapshotted × 10_000 × basis` (each holder's half-up error is in (−½, ½], so the sum stays within holders/2; error `RoundingDrift` otherwise; `entitlement::rounding_within_tolerance`). Comparing with `supply × per_unit_gross` would be wrong: rounding the per-unit amount first can drift by supply/2 (MCAL 47 days: 10 units → 20,824 vs 10 × 2,082 = 20,820). `per_unit_gross = round_half_up(face * rate_bps * accrual_days, 10_000 * basis)` is informational (stored for display and ISO export).

The brief's example: units 10, face 100,000 tiyn (1,000 KZT), rate 1,000 bps, semi-annual regular period = 180 days (30/360): gross = 10 × 100,000 × 1,000 × 180 / (10,000 × 360) = **50,000 tiyn = 500.00 KZT**. Redemption: principal 1,000,000 tiyn = 10,000 KZT plus the final coupon 50,000.

## 3. Day count

`THIRTY_360` (default; 30E/360): with `d1 = min(D1, 30)`, `d2 = min(D2, 30)`: `days = 360*(Y2−Y1) + 30*(M2−M1) + (d2−d1)`. Regular semi-annual = 180, quarterly = 90, monthly = 30, annual = 360. Example: 2026‑07‑03 → 2026‑08‑20 = 47.
`ACT_365`: actual calendar days / 365 (basis 365).
`ACT_ACT`: reserved — reject with `UnsupportedDayCount` (do not fake it).

Dates on-chain are unix timestamps; the Y/M/D used by `THIRTY_360` are derived in **UTC** from the timestamp (both Rust and Go must use the same civil-from-days algorithm, Howard Hinnant's). Period boundaries are stored as the UTC timestamp of the Almaty midnight (19:00 UTC previous day), so the derived UTC date is the previous day — therefore `THIRTY_360` must take the dates **passed explicitly as civil dates** (`period_start_ymd`, `period_end_ymd` packed as `yyyymmdd u32`) in `announce_action`, and the timestamps are only used for clock checks. The program verifies `accrual_days` supplied by the client against its own computation from the ymd fields (error `EntitlementCalcMismatch`).

## 4. Record-date mechanism (deterministic snapshot)

1. `strike_record`: requires `clock.unix_timestamp ≥ record_at`; CPI `pause` on the bond mint (Token-2022 Pausable); stores `snapshot_slot`.
2. `snapshot_batch` (crank, any order, idempotent): for each `[Investor, bond ATA, Entitlement]` triple: verify ATA.owner == Investor.owner and ATA.mint == series.mint; if `amount == 0` skip; if Entitlement exists skip (`AlreadyProcessed` is not an error inside a batch); else create and fill; update totals and `snapshot_hash = sha256(prev_hash ‖ owner(32) ‖ units u64 LE)`.
3. `finalize_snapshot`: `units_snapshotted == mint.supply` (every holder captured; impossible to miss someone because transfers are paused), rounding check (§2). Off-chain, the Go reconciler recomputes the same hash by iterating investors sorted by owner pubkey ascending — the CLI MUST snapshot in that order so the hash matches.
4. While paused: no transfers, mints or burns. `complete_action` resumes. For redemption, retirement happens after resume (Pausable blocks burns): any residual movement after the record date is economically void and the `retire_batch` burns whatever units each registered ATA holds, then `close_series` requires `supply == 0`.

### 4a. Secondary trades in flight (Solana DvP)

Secondary trades between registered investors settle through the Solana Foundation's DvP program (`dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq`, devnet and mainnet): each party funds an escrow with a plain transfer and the settlement authority moves both legs in one transaction. Qupon does not call that program; it controls which escrows may hold bonds.

1. `CreateDvp` creates the bond escrow **frozen** (DefaultAccountState). `admit_trade` (registrar or paying agent) thaws it only for a trade of this series' bond against its cash asset, between two Active investors, delivered to the parties themselves, whose settlement authority is the registrar or the paying agent. Delivery needs the buyer's own thawed account, so an unregistered buyer cannot be settled to.
2. A paused mint blocks the DvP program's settle, cancel and reclaim alike (devnet run 2026-10-06, `reports/dvp-spike-2026-10-06.md`), and escrowed units have no Investor record, so `finalize_snapshot` could never reach Σ = supply. Therefore `strike_record` fails with `TradesInFlight` while `Series.open_trades > 0`: before a record date the operator settles or cancels every admitted trade and calls `release_trade`. A cancelled trade returns the units to the seller, who is then the holder of record.
3. `release_trade` needs the escrow closed or empty, and freezes an escrow that still exists, so no unit can enter it afterwards (anyone can recreate an ATA; a recreated one is frozen by default).
4. The DvP program's cancel is atomic over both legs and reverts if any refund account is missing or frozen (a seller who closed their empty bond account, a cash issuer that froze the buyer). A record date must not depend on that, so `release_trade(force = true)` returns the escrowed units to the seller's registered bond account with the series PDA's permanent-delegate authority — the seller stays the holder of record, the buyer takes the cash back with the DvP program's `ReclaimDvp`. If the seller closed that account, anyone recreates the ATA first; the forced release thaws it.

Alternative when Pausable CPI misbehaves on devnet (fallback, do not implement unless needed): freeze every registered ATA in `strike_record` batches and thaw in `complete_action`.

## 5. Corporate-action state machine

```
Announced ─cancel→ Cancelled
Announced ─strike_record→ RecordStruck ─snapshot_batch*→ RecordStruck ─finalize_snapshot→ SnapshotComplete
SnapshotComplete ─fund_action*→ Funded ─pay_batch*→ Settling ─complete_action→ Completed            (INTR)
                                                                   └complete_action→ Retiring ─retire_batch*→ Retiring ─close_series→ Completed (REDM/MCAL/PCAL; Series → Closed)
BMET: Announced → RecordStruck → (finalize_snapshot) VotingOpen ─cast_vote*→ VotingOpen ─finalize_meeting→ Finalized ─apply_terms_change→ Completed
```
One open action per series at a time (statuses other than Completed/Cancelled block a new `announce_action`).

## 6. ISO 20022 mapping (seev.031 notification, seev.036 confirmation)

| ISO element | Qupon source |
|---|---|
| `CorpActnGnlInf/CorpActnEvtId` (CORP) | `CorporateAction.corp_id` e.g. `QPNb1-INTR-0001` |
| `CorpActnGnlInf/OffclCorpActnEvtId` (COAF) | `official_id` (empty → omit element) |
| `CorpActnGnlInf/EvtTp` | kind → `INTR`, `REDM`, `MCAL`, `PCAL`, `BMET`, `CHAN` |
| `CorpActnGnlInf/MndtryVlntryEvtTp` | `MAND` for INTR/REDM/MCAL/PCAL, `VOLU` for BMET (voting), `MAND` for CHAN |
| `CorpActnGnlInf/UndrlygScty/FinInstrmId/ISIN` | `Series.isin` |
| `CorpActnDtls/DtDtls/AnncmntDt`, `RcrdDt`, `PmtDt` | `announced_at`, `record_at`, `payment_at` (ISO 8601, Asia/Almaty offset) |
| `CorpActnDtls/PrdDtls/IntrstPrd` | `period_start`, `period_end` |
| `CorpActnDtls/RateAndAmtDtls/IntrstRateUsdForPmt` | `rate_bps / 100` with 2 decimals (`10.00`) |
| `CorpActnDtls/DayCntBsis` | `A001` (30/360) / `A005` (ACT/365) |
| seev.036 `AcctDtls/SfkpgAcct` | holder bond ATA (base58) ; `AcctOwnr` = owner pubkey |
| seev.036 `AcctDtls/ConfdBal` | `Entitlement.units` |
| seev.036 `CorpActnConfDtls/CshMvmntDtls/CdtDbtInd` = `CRDT`; `GrssCshAmt`, `NetCshAmt`, `WhldgTaxAmt`, `PstngAmt`, `PstngDt`, `ValDt` | gross, net, tax, net (+principal), paid_at |
| `SplmtryData` / `AddtlInf` | Solana tx signature, slot, program id, cluster |

Namespaces: `urn:iso:std:iso:20022:tech:xsd:seev.031.001.15` and `urn:iso:std:iso:20022:tech:xsd:seev.036.001.16` (latest versions in the ISO archive, Feb 2025). Output must be well-formed XML with those root elements; XSD validation is out of scope — say so in README.

## 7. KASE-style notice template

EN: `/KASE, {payment_date}/ – {issuer_name} has paid the {n}{suffix} coupon on its bonds {isin} ({ticker}). Amount paid: {total_net} {ccy} to {holders} holders of record as of {record_date} (start of day, Almaty). Payment was settled on Solana devnet, transaction(s): {tx_links}. The next coupon payment is scheduled for {next_coupon_date}.`
RU: `/KASE, {payment_date}/ – {issuer_name} выплатил(а) {n}-й купон по облигациям {isin} ({ticker}). Сумма выплаты: {total_net} {ccy}, держателей: {holders}, дата фиксации реестра: {record_date} (начало дня, Алматы). Расчёты проведены в Solana devnet, транзакции: {tx_links}. Следующая выплата купона: {next_coupon_date}.`
Redemption, early redemption and terms-change notices follow the real KASE headlines: "… paid principal and final coupon …", "… full early redemption of bonds …", "… changes to prospectus registered: coupon rate {old}% → {new}% …".

## 8. Test vectors (must pass in Rust `crates/entitlement`, on-chain tests, and Go)

See `fixtures/entitlement.json`. Summary:

| id | units | face | rate_bps | day_count | start → end | days | tax_bps | gross | tax | net | principal |
|---|---|---|---|---|---|---|---|---|---|---|---|
| brief_coupon_10 | 10 | 100000 | 1000 | THIRTY_360 | 2026-07-03 → 2027-01-03 | 180 | 0 | 50000 | 0 | 50000 | 0 |
| brief_coupon_25 | 25 | 100000 | 1000 | THIRTY_360 | same | 180 | 0 | 125000 | 0 | 125000 | 0 |
| brief_coupon_65 | 65 | 100000 | 1000 | THIRTY_360 | same | 180 | 0 | 325000 | 0 | 325000 | 0 |
| brief_redemption_10 | 10 | 100000 | 1000 | THIRTY_360 | same (final) | 180 | 0 | 50000 | 0 | 50000 | 1000000 |
| tax_10pct | 10 | 100000 | 1000 | THIRTY_360 | same | 180 | 1000 | 50000 | 5000 | 45000 | 0 |
| btrk_semi_7 | 7 | 100000 | 1595 | THIRTY_360 | same | 180 | 0 | 55825 | 0 | 55825 | 0 |
| mcal_accrued_47d | 10 | 100000 | 1595 | THIRTY_360 | 2026-07-03 → 2026-08-20 | 47 | 1000 | 20824 | 2082 | 18742 | 1000000 |
| usdc_btrk_3 | 3 | 1000000000 | 1595 | THIRTY_360 | same regular | 180 | 0 | 239250000 | 0 | 239250000 | 0 |
| half_up_tie | 1 | 100000 | 1 | THIRTY_360 | 18 days (2026-01-01 → 2026-01-19) | 18 | 0 | 1 | 0 | 1 | 0 |
| act365_184d | 10 | 100000 | 1000 | ACT_365 | 2026-07-03 → 2027-01-03 | 184 | 0 | 50411 | 0 | 50411 | 0 |
| eom_30e | — | — | — | THIRTY_360 days only | 2026-01-31 → 2026-02-28 | 28 | — | — | — | — | — |
| new_rate_after_vote | 10 | 100000 | 1200 | THIRTY_360 | 2027-01-03 → 2027-07-03 | 180 | 0 | 60000 | 0 | 60000 | 0 |

Derivations: mcal_accrued_47d gross = 10 × 100000 × 1595 × 47 / 3,600,000 = 20,823.61… → 20,824; tax = 2,082.4 → 2,082. act365_184d = 10 × 100000 × 1000 × 184 / 3,650,000 = 50,410.96 → 50,411. half_up_tie = 100000 × 1 × 18 / 3,600,000 = 0.5 → 1 (banker's rounding would give 0 — the test pins half-up).
