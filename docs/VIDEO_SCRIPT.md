# Demo video script — Qupon (≤ 3:00, EN)

Voice-over at ~140 wpm. Word budget per shot noted; total VO ≈ 395 words.
Numbers source: `reports/demo-full.md` (all tx links live on devnet) and `docs/01-product.md` (brief vectors: 10/25/65 units, 1,000 KZT face, 10% semi-annual).

| # | Time | On screen | VO |
|---|------|-----------|----|
| 1 | 0:00–0:10 | Title card: Qupon logo, tagline "Corporate actions engine for tokenized bonds on Solana", program id QPN1zdVm6…J2qd | Qupon services tokenized bonds on Solana — coupon, vote, redeem — fully on-chain. |
| 2 | 0:10–0:30 | Registrar Console → create series QPNb1 (face 1,000 KZT, 10% semi-annual, 30E/360); register 3 investors; try subscribe from unregistered wallet → rejected (frozen by default) | We create the bond as a Token-2022 mint, frozen by default. Three investors pass the KYC gate — KYC itself is simulated — an unregistered wallet is rejected on-chain. |
| 3 | 0:30–0:50 | Announce INTR #1; strike record date → register frozen (mint paused) | Coupon one. The registrar announces it; at record date the program pauses the mint and freezes the register. |
| 4 | 0:50–1:10 | Snapshot table: 10 → 500.00, 25 → 1,250.00, 65 → 3,250.00 tKZT; finalize; issuer funds escrow | Snapshot writes an Entitlement per holder — half-up rounding per holder: 500, 1,250, 3,250 tenge. The issuer pre-funds escrow; the program checks the amount. |
| 5 | 1:10–1:30 | action:pay → investor balances; action:complete; explorer tx; download seev.036 + KASE notice | Payment settles from escrow, the action PDA signs. We reconcile, resume the register, and generate ISO 20022 seev.036 confirmations and the KASE notice — from on-chain state. |
| 6 | 1:30–1:55 | Meeting: propose 10% → 12%; three wallet votes (65 For / 25 Against / 10 Abstain); finalize → Approved | A bondholder meeting. Votes are weighted by snapshot units: 65 for, 25 against, 10 abstain. Quorum 100 percent, approval over two-thirds — approved. |
| 7 | 1:55–2:10 | meeting:apply → coupon_rate 1200 in series + token metadata; INTR #2 table 600/1,500/3,900 | The new rate lands in the series and the token metadata. The next coupon pays 600, 1,500, 3,900. |
| 8 | 2:10–2:35 | Redemption: announce REDM, strike, snapshot, fund, pay — 10,600 / 26,500 / 68,900 tKZT; retire burns units; series:close → REDEEMED | At maturity: principal plus final coupon per holder, then units are burned through the permanent delegate and the mint closes. Status: redeemed. |
| 9 | 2:35–2:50 | Early call MCAL on BTRK-demo in USDC devnet, 47 accrued days, half-up rounding | Bonus: an early call in USDC on a real KASE bond's terms, with accrued-days interest, rounded half-up. |
| 10 | 2:50–3:00 | Implemented-vs-simulated table, GitHub repo, program id, explorer links | Everything you saw is on Solana devnet. KYC, Swift delivery and ARDFM registration are simulated and labelled. Code and every transaction link are in the repo. |

Per-shot word counts fit 140 wpm within each window (e.g. shot 2: ~48 words / 20 s).

**Sources:** 500/1,250/3,250 — brief vector, proven in `programs/qupon_bonds/tests/brief.rs` and `reports/demo-full.md` §S1; 12% vote weights — §S3; 10,600/26,500/68,900 — §S2; MCAL 47 days — §S4.
