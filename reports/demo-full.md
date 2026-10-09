# Qupon — full lifecycle on Solana devnet (`make demo`)

Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet) · cluster devnet · run 2026-10-09T15:36:54.024Z

**Result:** all scenarios succeeded ✓ (S0 issuance & registry, S1 coupons, S2 redemption, S3 meeting → terms change, S4 early redemption)

_Time compression: each record date is struck ≈45 s after its announcement; coupons use the real civil periods (30E/360). The brief's literal 500.00 / 10,500.00 figures are also proven by `programs/qupon_bonds/tests/brief.rs`; here the meeting raises the rate to 12% before redemption, so the final coupon is 600.00 per 10 bonds. BTRK-demo is scaled to devnet faucet limits (face 1 USDC)._

## S0 — Issuance and holder registry (QPNb1, tKZT)

- Series **QPNb1-tmnc80**: face 1,000 KZT (100,000 tiyn), 10% semi-annual, 30E/360, 2026-07-03 → 2028-07-03
- Bond mint: [4kJDgyLjY4HW7b9UbrbcEtLgVnR3D62ZaGfgZ1TVfPAn](https://explorer.solana.com/address/4kJDgyLjY4HW7b9UbrbcEtLgVnR3D62ZaGfgZ1TVfPAn?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/1PLxyhWzbv2JM1avFmbyw1wWNUiub6hQwmLsccweXi5NHKHBHWpkUzcGsTViJtq8gpFYZL34u3ZcqbMm6e82i6n?cluster=devnet) | ok |
| kyc:attest investor1 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor2 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor3 — SAS attestation by the KYC provider | — | ok |
| investor:register investor1 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/5F98C8TibQrYagkofJRFjLqg7heByjEK3QsaZe65CENwJRZbS6qxPjwmCuAx96WPGM8owRVynSRyBTZ2HhLMWEGj?cluster=devnet) | ok |
| investor:register investor2 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/3BqpxavCr1PCtV2A9EksYK3hJCpdFjeTq2qS8paLbetYz7mNonDJ3qT7G2YfDM7GLHaoxBgYw89y5nhALhDJ9Sra?cluster=devnet) | ok |
| investor:register investor3 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/2fqnTJr3pX5Ld2X3S7GppR9nh79Vd7GNsHLPwE1cTi291jS2JPN6V36VFyZAvhB7iHQesaz1eraPv69dj4fZcMAp?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 10 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/2bBLgFmk2eiTSXx48EVJCDahM3rydqtdSGUePawGdQXdubWFndXVLXJ1KJ78QsHtd7Ta34VHpuR2SAvA2HzhcepV?cluster=devnet) | ok |
| subscribe 25 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/4B2YzuTM959nPNvr5DQqktvBxeVZuXuKEWYSN8JuvqH2vvupJVtfbeF9Ha3YSL1dbYzS9WXzgxrCFpkmpw7Yvbrp?cluster=devnet) | ok |
| subscribe 65 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/2W182HiM5uVh53mjG8NhVpYGWtNN9osuC1fDcwvkU8z3Ka3wPvxBEb3tjVnGg2wVJ286wrVgHG25wtE1MKpuq3Pc?cluster=devnet) | ok |

## S1 — Coupon payment INTR #1 at 10%

Record date = pause the mint, snapshot every holder on-chain; 10 bonds → 500.00, 25 → 1,250.00, 65 → 3,250.00.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%) | [tx](https://explorer.solana.com/tx/2jSm5oz6R7zCQBbnprwrXm4XSm4ubJfgR3QDhUuwq1vaSnT2w9qv2TYKFCU5iga4zQp4T3XNpE97DGrF3Mshyseb?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/2MD9LZGoFA8JfTn1ekWf55smZFTeyYDJaLXgmyEQnogTQMVeiUUpcCSdsUSPbcPwLpsZy7RDBKL12GPoMLfd6jME?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/593kuZvbzzhY5EjBLuGe97S4jyGaWJz7XoWzV6uZQJgRaMtdQbTy2KpLmNJB8tJEhK2VZV7WUdwwGg1Sws9afSd?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/2kByTSs7jFr3Yvf1JU2zaDGR3Ku8bpjH3on5cBhsc677kVeVq4DXtHLoHrarpBZtfVeeQ9cnwm5BjCiA9F96uvH7?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/n7bQJWcT1W53gcVsQNkzyCH7q4mJ3ye9JXyEBC9ytfcW5JwAN4pMh3ejK5jbwdeqBEN4SVdHdh9pmQ8QCBSYaBt?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/J2dx9BM8qTUynF8BWe1PiHNE9jeTJCDdc4hAQZAPnkegg5p3bK853n8rFcKjtEJ5TtKTJBCPmNpQxuAvHeysBpG?cluster=devnet) | ok |

**INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%)** — action [D8hhhikK…](https://explorer.solana.com/address/D8hhhikK3QCj1UgshzzriLXJtthya4N4S41gXNX4zgqR?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT ✓ |
| investor2 | 25 | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT ✓ |
| investor3 | 65 | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT ✓ |

## S3 — Bondholder meeting → coupon 10% → 12% (terms change)

Votes weighted by snapshot units: 65 For / 25 Against / 10 Abstain → quorum 100% ≥ 50%, approval 65/90 ≥ 66.67% → Approved. The registrar's signature stands in for the ARDFM registration (SIMULATED).

| Step | Transaction | Status |
|---|---|---|
| meeting:announce — issuer proposes 12% | [tx](https://explorer.solana.com/tx/2oSSoroyPDNfKT9RUsfnDGmXTh1hrTvP6Fym7itQxZ7Hu3jyvrud14xTCE5znjTZZGN1VoibxXzLf3G1BfJgXSdU?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — voting weights | [tx](https://explorer.solana.com/tx/2y6BBi2g9zseXdXaYDk13r5Bbb3d1tPx1WthFTE2pDCiu89yWsVDEKvvF7KUETHFoKKsum6x5kDK6PCeiWEsQMja?cluster=devnet) | ok |
| action:finalize-snapshot — voting opens (register resumes) | [tx](https://explorer.solana.com/tx/3bfqB5vVkdQABNzoHLVqqxRgFowVCG6fcVFcLskTvcYi7JbYZL9zPuJNgvX2jNjeDV13nB7Ho2iSUAnB4Ps14qM?cluster=devnet) | ok |
| vote For — investor3 (65 bonds) | [tx](https://explorer.solana.com/tx/3VhWcFaRfEomh1AUiDLatRkrBypmU43Zos3CasdQkfBwyykDHAdwLkLHAqXqj8fPhvGDNrj8oaae8xzwvfhZvdtY?cluster=devnet) | ok |
| vote Against — investor2 (25 bonds) | [tx](https://explorer.solana.com/tx/5fB884zc4TNcXkprnXPgG1k6xYHzkXep6yqh7P4k8HeEkRiL3cbEtG1nnbyjyRqAJy1CLAb5vdhJZpF4wrf16uuh?cluster=devnet) | ok |
| vote Abstain — investor1 (10 bonds) | [tx](https://explorer.solana.com/tx/7bkt8kRtCgjKad8Ws5TRrm8iKewKp9EZZxkuBc8RAFGrLN6urvbjKZdtUTvujuXB9mqq2DnRwtesQJZUKQtRpYF?cluster=devnet) | ok |
| meeting:finalize — Approved | [tx](https://explorer.solana.com/tx/PT3rZMax8dgs13ejzP9CmFatPZMzu9FtfHdwZf2Fi4T2w2BN2Gh7G4i8rPZG4kA6hro63aYm6YYAZcZcCDxCb2U?cluster=devnet) | ok |
| meeting:apply — coupon_rate_bps 1200 on the series and in token metadata | [tx](https://explorer.solana.com/tx/3bzfnrF5ykaBs2mwU5ueWmzMzzuRVTxx5WCCCXZaRUtV9qjQzUj9HYuXuAUBJb1wjA2JzKVXxf4inWdZQf5n37xP?cluster=devnet) | ok |

## S1 (cont.) — Coupons at the new rate

INTR #2 and #3 at 12%: 10 bonds → 600.00, 25 → 1,500.00, 65 → 3,900.00.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #2 (2027-01-03 → 2027-07-03, 12%) | [tx](https://explorer.solana.com/tx/42EXXVRicssuC4q61XS8Q2UTPGVSzRgCWset7S4DQFtc2HvetwRdt1Hnte4cZgteRsbnAZdVG2wBMxmBqUwMKaSh?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/4LoVVPPm4Rq93tmffi13Lqoe4NrLxvVY4q7y7GeaknY2QEwR4dquczk5zdafX9aNMEgATrLyj15xDR1QoqQFKadd?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/5N3a6DcsjENhYkPAUWiH8SUZQVF5wtXPd5DW5bfSEc8nsdB7FdNZkzLwhpA4kfAy7EmGFQBHphW9kQd4Pyr7HY1k?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/eFfAFkJqv1cepEVtjLR2X6hTJedgrnH81K4mSkXnyt1UQNpsHdWPXYoybfAqfChuLTziYDdYnaZDVcr1JJ2XroK?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/5YXanSWJBvKuxTTHCDhpxKj8vtGLqHn1rwV13beJ2ZthqvEfQtxEUDVpcypZKe1f9BxFnf6cQcHrhtTWiUMJEXqS?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/3VyN1DtaWtu9S8Uad71kvGym3fdtoLepsbH8aTxbQ5XFBvsSgqN29iTGTuieR3Nma3uJcQtbcmHuRZ9RDi9aaK5W?cluster=devnet) | ok |
| action:announce INTR #3 (2027-07-03 → 2028-01-03, 12%) | [tx](https://explorer.solana.com/tx/5tuGn1MYkaNege5Doig5REGL3EbAmLHh3j8zxUxZhYw5ZYxjUGRfV1pMn9djpF7EwpkJWmmyiRwes8cRR3tVRCxY?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/59DXuqYrRXoQGv98xfkXBx6rHSK5QUqCDsnWCkNuWr2g5927SifbAjVDZSa89y6rLnxro7tgtAj1aTMp5x8zw6KZ?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/3n9tC9M6x3vV4ZefBCUVJoJfZW2pJAGhUmmire1nbDbio93pia4A5VhUC6b85zv9Yv23nXryeXD1NbzVPdTgMngL?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/2RzdmjW7bznaScwRs4b1zPp7hQD41v1cY611cerKguqdMcwWcMjEGpM1EXZjHZzdffr13QCnZnbqNjJLnWqkaBqk?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/SdX16rP6VSyVByEv2yeGjxcTuZPobmn4E3rpCFKiBVwQHFYGybhtrCYTgR7C88kdCzsg6XJKvpq1u3pqmFhApN6?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/5hErcs3aewtHPseELFVr7ovM8SzTS7hJAdzbBLEeoxWGW9qyu1avT7jHKcBf6a72wUAvyHB1u7DD4CJ6mS8MS77J?cluster=devnet) | ok |

**INTR #2 (2027-01-03 → 2027-07-03, 12%)** — action [DiwfdzKH…](https://explorer.solana.com/address/DiwfdzKH6A8eyKf8C6A4EsLeag4VueEpbnFwGzmR9Dmc?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT ✓ |

**INTR #3 (2027-07-03 → 2028-01-03, 12%)** — action [85Wn9KHs…](https://explorer.solana.com/address/85Wn9KHsFa2NS454RsVkRFWfD3juNHyxhufAojWeSsjx?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT ✓ |

## S2 — Redemption at maturity (principal + final coupon), burn, close

10 bonds → 1,000,000 principal + 60,000 final coupon = 10,600.00 tKZT. Units are burned through the permanent delegate and the mint is closed (metadata status=REDEEMED).

| Step | Transaction | Status |
|---|---|---|
| action:announce REDM (2028-01-03 → 2028-07-03, final coupon 12% + principal) | [tx](https://explorer.solana.com/tx/2vW7AgfFyhXin7XSTEu5jMsY8xyocLwaFx1tAY95Au18zbyvEwhLr9jYn1nhdDGp8BuTfCTSjEqm5dW4uJserrfL?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/5pyZsXJDTBC2Q9hwQe5yZMEycdd35NTaMza5fgA6oa3U6fuqMoodhsxx3oxuR58p1mGoBfHdbKszVVZANvNWdWWN?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/5i6bFD6vcaiKjetGh5CKX2ngTq2gNFQsgARczohh2qU9fL1mauAqqF8DW5MEwR7LLnVj9AcNQ4NTW5sdJeUcKAAY?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/2sNyqh7FjrJBsR2RMHrpS7c1Q8D5Df8kuB5oXb73ba4i2aptKwyDAgVv2gzQQy3eWf7zTGKHDEKZSBhaYJ84cLjN?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/5UAqfJejYnKKgmxXVBp2qBDJ35EbK1VjHAY6tcQ4HUhH1wnPc7dEpweWxYb5sG6h6YSxm7WMv3A5idskjrmasdwP?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/3uafeB6bW913XAw2JWLU1VAyZZDFfN9viQVSTH4UhszmN7WkQcRmgeKx1x7YHkuMrUhzTzJj9wevph84eWMf1PZL?cluster=devnet) | ok |
| action:retire — burn every unit (permanent delegate) | — | ok |
| series:close — metadata REDEEMED, mint closed, series Closed | [tx](https://explorer.solana.com/tx/P3jCNmL4jhKo6CrdC14vp3uNqoDmBH54z9oz3deMz55gJ8Jc4gmJ5bxcPmfHFS9qaZWFtrL6TsYSzGe3bFTqdxU?cluster=devnet) | ok |

**REDM (2028-01-03 → 2028-07-03, final coupon 12% + principal)** — action [CkoMaA86…](https://explorer.solana.com/address/CkoMaA86nd9RCSCFxxVprahvAqu3E7yL8k6HgbZhxi6o?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 10000.00 tKZT | 10600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 25000.00 tKZT | 26500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 65000.00 tKZT | 68900.00 tKZT ✓ |

## S0 — Second series in USDC (BTRK-demo, 15.95%)

- Series **BTRK-tmnc80** mirrors KASE BTRKb33 terms (15.95%, semi-annual, 30E/360) settling in Circle devnet USDC; face scaled to 1 USDC for faucet limits.
- Bond mint: [6nnQjq531ZE1rEpLbpgbeWqrGP5QbLt9mDQ24jYwoCbR](https://explorer.solana.com/address/6nnQjq531ZE1rEpLbpgbeWqrGP5QbLt9mDQ24jYwoCbR?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/746uEmAFZA4hGjMDppcgpBRuqWRuyUpoixzTvZpXc7wMHtae8zpTpdvADgaBcTdhmWk2NT6ybHojyPoBqxX5z1g?cluster=devnet) | ok |
| kyc:attest investor1 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor2 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor3 — SAS attestation by the KYC provider | — | ok |
| investor:register investor1 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/5c87ec3coNQLZvE3bwH2LkEwosTa6bxDUVeVCoMsXE7DBr7k6KFPirMfvPbCCqfp9GLQwgNHvJNUbbj9N24Qa33E?cluster=devnet) | ok |
| investor:register investor2 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/4WyU7PvuKqJnH9gmRNLXUSMpeZKXQJ2JwRMmaEwjUZmveNDtgcpEhAFdYnjh8DFvunX1wG99Loht8qh7PKQDLyaQ?cluster=devnet) | ok |
| investor:register investor3 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/5CjdC8RiKtqoLuPauFQhPhs4RQFRwBxtojUpkacmn1ivWvjbbTP9NjfFNkyB3jP5NLizjjzXGhAjh9uVerPq6Uc2?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 3 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/37EqgmiGkuxoSFMjpTGVMkTi2X69YhaUcfeP5XyNPfrkdBtuzM6tZaED2wRYTDMmmeH7FmEyAJtuo2DFV4SFq2rG?cluster=devnet) | ok |
| subscribe 3 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/2mxxkkUYm1x43gXdrzWQekrh7tZzyJF1ZHbSpuLfLoYGyMBLDeg91HJ8gL54K2jEyaDYk4KYKJrUHpBYqwER1eS6?cluster=devnet) | ok |
| subscribe 4 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/3HSsXXvBFmiFbVyNsqAQCpz6G1Jhz6FDMkKu7mKhHCKoTDUSjM3oZC6dHit4fo3m4JSq7KzqpiKz2EQ6beh47NtY?cluster=devnet) | ok |

## S1 — USDC coupon INTR #1 at 15.95%


| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (180 days, 15.95%) | [tx](https://explorer.solana.com/tx/4NQLN3QYpQGWFkoWZ6vTeVdgZvEKBj29MDi8gjVxjTa1ufSSB9VsEAKDCPxMhHmFup1ydEyzNrLvwu96A5Uabdvx?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/4mGKBMSBnpdi6Yin5UTG65uyfHJB4Tjbabb9GNtb6TaUDA7FR6zFZyfi9cw6VaQm9X5vkB1svv2n3NtyqKq45mGc?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/5GXjr1UmUFKG6gXgLcBnWXye7UEcZ1r9tmbC5LmobqqPUWMSiKonCjtsjppZtTtvqAjaX2aXFEzjz7BJDwm96m3T?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/5hdvvPaoGVvaet6cRokqtWhbbSwPCCUH8ZPRvQ6Ch8dmmUiwd4BJ2REgFnzVA6mJbH2NabLBnMkzXKMxWoS3U6Qb?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/2Wy7qW6dG518i36Cp5ndn98En9Ux4WzmWYEdsPTrs3XH9VWuPD9iCmew1REVbt8xDR16mAs6WeMRhLbQf8HN59dA?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/UNoZwKhUQmPfMWa712usmjM1EJt4FYgLPB6aYzihrgJNKYTge7pXFQcNfAJNrNW3MPAHWpKQQUwqWHzssED9rCE?cluster=devnet) | ok |

**INTR #1 (180 days, 15.95%)** — action [Bw7kEHFt…](https://explorer.solana.com/address/Bw7kEHFtJZFD5zy28GuY5kU7qHMWzmkjHL1McnzSXcHL?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 3 | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC ✓ |
| investor2 | 3 | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC ✓ |
| investor3 | 4 | 0.319000 USDC | 0.000000 USDC | 0.319000 USDC | 0.000000 USDC | 0.319000 USDC ✓ |

## S4 — Early redemption (MCAL) with 47 accrued days, burn, close

Call on 2027-02-20: principal 1 USDC per bond + accrued coupon 1,000,000 × 15.95% × 47/360 per bond, rounded half-up per holder.

| Step | Transaction | Status |
|---|---|---|
| action:announce MCAL (2027-01-03 → 2027-02-20, 47 days) | [tx](https://explorer.solana.com/tx/637TcD588RYVR56LEumXooP1DSFyz7neS4Ax7rpdzeCciASWo4Nms4K54EZ2H5Cpy1kx6ze4cuCwBHtAzCeSv7qR?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/3y3hs68ewZ1FCNU9bUm5if61gxBqnVQfSSThhrmkAxAKy8R35Dr45JnUYAQ7NxKnTMX2cGid23SDUS5Y5XmK8PpM?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/3zRYZbY5tKgt8yHpxphGZNEYg26xRkViBjXbkqexbEniCtop4ABJZU1Z1yGoMLtkzz1pXNo9n2JXiMhEEVWVCBsz?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/4Y7NwjJ6FinZ4UPnJe6ksBuwkNCK2pGQmaUtun7hK7u2wcZijoZAbyJM2xRbRAyDdkaqMwxTMx6duQko97i6RT1q?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/3DbiqqXpYz9ypfZVWKDMZWhEChfqWASvVRq2umsX5MWCgfDbz1hM9MZH4Q13QhW2K6iuBiqADhDHF8cdZgJERHkW?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/2pTEZBGgW8SBnMGNp6wtya4GJgEqLUgKUpaBDFJ3u8xA6BGfiMbd1JpyRJvgPcvMUPXJ7dtYh8k3kjpkRv8yKdJs?cluster=devnet) | ok |
| action:retire | — | ok |
| series:close | [tx](https://explorer.solana.com/tx/2eXETZhZ9yMsKmbtRvbkajuiDwtstnSWojgVDoP2z97CD1AwN5749pipSWg5TXFyvyfz8TfXwFY2FUeyVPG18TsN?cluster=devnet) | ok |

**MCAL (2027-01-03 → 2027-02-20, 47 days)** — action [FjEskrUd…](https://explorer.solana.com/address/FjEskrUdfhQxrAAPSbAFw5hfQbMir1gGJsSbG8EdT43B?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 3 | 0.062471 USDC | 0.000000 USDC | 0.062471 USDC | 3.000000 USDC | 3.062471 USDC ✓ |
| investor2 | 3 | 0.062471 USDC | 0.000000 USDC | 0.062471 USDC | 3.000000 USDC | 3.062471 USDC ✓ |
| investor3 | 4 | 0.083294 USDC | 0.000000 USDC | 0.083294 USDC | 4.000000 USDC | 4.083294 USDC ✓ |

## Implemented vs simulated

| Element | Status |
|---|---|
| Bond token, holder registry, record date, entitlement math, coupon payment, redemption, burn/close, voting, terms change, on-chain events | **Implemented on Solana devnet** |
| Cash leg | Real token transfers from an admin-managed registry: USDC devnet (Circle), test tKZT, KZTE-dev and dKZT (our mints standing in for the digital-tenge-backed KZTE and a digital tenge); Evo KZTE is pre-registered for mainnet, disabled until its official mint is added |
| KYC | **Attested on-chain, review simulated**: investors upload documents and apply; a registrar decides by hand; approval issues a Solana Attestation Service attestation (type, residency, tax rate) and registers the wallet — no licensed KYC vendor |
| kase.kz | Public bond data read and cached (terms, schedule, market data); disclosure-package submission **simulated** |
| ISO 20022 seev.031 / seev.036 | Generated from on-chain state; Swift network delivery **simulated** (downloadable files) |
| ARDFM registration of terms change | **Simulated** by registrar signature step |
| KASE disclosure notice | Generated automatically; publication on kase.kz **not** integrated |
| Secondary settlement | **Implemented on Solana devnet** through the Solana Foundation's DvP program: Qupon admits the trade's bond escrow, refuses a record date while a trade is open and can return escrowed bonds to the seller. Order matching and a trading venue are not included |
| Term-sheet import | **Experimental** — pasted KASE text is parsed into series terms by an LLM (Z.ai GLM) with a SIMULATED regex fallback; every field is confirmed by the issuer before issuance |
| Multisig issuer approval (Squads) | Roadmap |
| Mainnet | Mainnet-ready profile, guard and dry-run deploy script; **not deployed** |
