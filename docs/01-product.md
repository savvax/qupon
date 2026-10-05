# 01 — Product spec: Qupon

**One line:** Qupon is the corporate-actions engine for tokenized bonds on Solana — identify holders → calculate entitlements → settle → record, following Kazakhstan market rules and emitting ISO 20022 messages.

**Why now:** KASE is registered digital-financial-asset (DFA) platform operator #001 (May 2026), builds on Solana with BitGo custody, plans tokenized notes first and bonds/stocks trading in December 2026; the Central Securities Depository may now keep the register of DFA holders (July 2026). Nobody on Solana services bonds through their lifecycle in a standardized way.

## Personas and surfaces

| Persona | Real-world counterpart | Surface | Can do |
|---|---|---|---|
| Registrar / paying agent | KCSD (Central Securities Depository) or KASE as DFA operator | Registrar Console (web) | onboard investors (KYC attributes), announce actions, strike record date, snapshot, verify funding, pay, complete, retire, close; download seev.031/036 XML and KASE-style notice |
| Issuer | A KASE-listed company (e.g. Baiterek) | Console (issuer tab) or CLI | create series, fund escrow before record date, propose terms change, call bonds early |
| Investor | Retail or institutional holder with a KYC'd wallet | Investor Portal (web, wallet) | subscribe (DvP), see holdings/schedule/entitlements/history, vote |
| Auditor / judge | KASE judges | Explorer links, README, XML files | verify every state transition on devnet |

## Scenarios (all run on Solana devnet)

### S0 Issuance
1. Issuer/registrar creates bond series **QPNb1**: face 1,000 KZT (100,000 tiyn), coupon 10.00% (1000 bps), semi-annual (2), day count 30/360, 2 years, settlement currency tKZT (Token-2022 test tenge, 2 decimals). ISIN-like id `KZ2C0QUPON01` (test), ticker `QPNb1`.
2. A second series **BTRK-demo** mirrors real KASE bond BTRKb33 (Baiterek, 15.95%, semi-annual, 30/360, 1,000 KZT) but settles in **USDC devnet** — shows multi-currency.
3. Three investors are registered (individual resident, individual non-resident, legal entity) with tax rates (default 0 bps; configurable). Their ATAs are thawed on registration. A 4th wallet without KYC cannot receive tokens (frozen by default) — show the failure.
4. Primary placement via `subscribe` = atomic DvP: investor pays price × units in tKZT, program mints units. Units: 10 / 25 / 65 (total 100).

### S1 Coupon (INTR) — required scenario 1
1. Registrar announces INTR #1: period start → end, record date = start of the last day of the period (KZ law art. 31), payment date, rate 1000 bps, days 180 (30/360) → per-unit gross 5,000 tiyn (50.00 KZT).
2. At record date: `strike_record` pauses the mint; `snapshot_batch` writes Entitlement per holder: 10 units → 50,000 tiyn (500.00 KZT) — the brief's example; 25 → 1,250.00; 65 → 3,250.00. `finalize_snapshot` asserts Σ units == supply (100) and stores the snapshot hash.
3. Issuer funds escrow with ≥ Σ net. `pay_batch` transfers net to each holder's cash ATA (tax to tax vault), marks Paid, emits `EntitlementPaid`. `complete_action` reconciles (holders_paid == holders_snapshotted, total_paid == Σ net), resumes the mint, advances `next_coupon_date`.
4. Console shows: status timeline with tx links, entitlement table, "Download seev.031" (announcement) and "Download seev.036" (per-holder confirmation), KASE-style notice text.

### S2 Redemption (REDM) — required scenario 2
1. At maturity: announce REDM with per-unit principal 100,000 tiyn + final coupon 5,000 tiyn.
2. Same strike → snapshot → fund → pay. Holder with 10 units receives 1,000,000 + 50,000 tiyn = 10,500.00 KZT (brief: $10,000 principal plus final coupon).
3. `complete_action` → status Retiring, mint resumed; `retire_batch` burns each holder's units via permanent delegate; `close_series` closes the mint (supply 0) and sets status REDEEMED/Closed; metadata field `status=REDEEMED`.

### S3 Bondholder meeting → terms change (BMET → CHAN) — required scenario 3
1. Issuer proposes raising the coupon from 10% to 12% (mirrors MFNKb1, June 2026: 14% → 16% registered by ARDFM).
2. Announce BMET with proposal payload (new_rate_bps=1200), record date, voting window, quorum 5000 bps (50% of units), approval 6667 bps (2/3 of votes cast) — thresholds are series config, NOT asserted as law.
3. Strike → snapshot (weights). Investors vote from wallets (`cast_vote`): For/Against/Abstain weighted by snapshot units.
4. `finalize_meeting` after voting ends: quorum and approval check → result Approved. `apply_terms_change` (registrar signature = simulated "ARDFM registration") updates Series coupon_rate_bps effective from the next period and updates token metadata `coupon_rate`.
5. The next INTR uses 12%: 10 units → 600.00 KZT. Show the difference.

### S4 Bonus: early redemption (MCAL) on the BTRK-demo series
Announce EarlyRedemption with call date < maturity, principal + accrued coupon for the partial period (30/360 accrued days), same settle/retire/close path, in USDC.

## Implemented vs simulated (goes verbatim into README and both submissions)

| Element | Status |
|---|---|
| Bond token, holder registry, record date, entitlement math, coupon payment, redemption, burn/close, voting, terms change, on-chain events | **Implemented on Solana devnet** |
| Cash leg | Real token transfers: USDC devnet (Circle) and test tKZT (Token-2022); fiat KZT and Evo/digital tenge are **simulated** by our mint |
| KYC | **Simulated**: registrar records attributes (type, residency, tax rate); no KYC provider integrated |
| ISO 20022 seev.031 / seev.036 | Generated from on-chain state; Swift network delivery **simulated** (downloadable files) |
| ARDFM registration of terms change | **Simulated** by registrar signature step |
| KASE disclosure notice | Generated automatically; publication on kase.kz **not** integrated |
| Multisig issuer approval (Squads), SAS KYC attestation | Optional T2; if not shipped, listed as roadmap |

## Non-goals for the hackathon
Secondary trading venue, order book, fiat on/off-ramp, real KYC vendor, mainnet deployment, confidential transfers, Token ACL integration (listed as compatible roadmap items).

## Demo video storyboard (≤ 3:00)
0:00–0:30 issuance + KYC gating (frozen wallet fails) · 0:30–1:30 coupon: announce, strike (pause), snapshot table = 500/1,250/3,250, fund, pay, complete, explorer links, seev.036, KASE notice · 1:30–2:10 meeting: proposal, three wallet votes, finalize, new rate in metadata · 2:10–2:40 redemption: principal + final coupon, burn, mint closed · 2:40–3:00 implemented-vs-simulated table, repo, program ID.
