# Qupon — full lifecycle on Solana devnet (`make demo`)

Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet) · cluster devnet · run 2026-10-05T03:42:54.136Z

**Result:** all scenarios succeeded ✓ (S0 issuance & registry, S1 coupons, S2 redemption, S3 meeting → terms change, S4 early redemption)

_Time compression: each record date is struck ≈45 s after its announcement; coupons use the real civil periods (30E/360). The brief's literal 500.00 / 10,500.00 figures are also proven by `programs/qupon_bonds/tests/brief.rs`; here the meeting raises the rate to 12% before redemption, so the final coupon is 600.00 per 10 bonds. BTRK-demo is scaled to devnet faucet limits (face 1 USDC)._

## S0 — Issuance and holder registry (QPNb1, tKZT)

- Series **QPNb1-tmf0ae**: face 1,000 KZT (100,000 tiyn), 10% semi-annual, 30E/360, 2026-07-03 → 2028-07-03
- Bond mint: [2fkKZcp3YrDqR2fGKKj2uBg1svpXDkswSmZ15Ltpdox1](https://explorer.solana.com/address/2fkKZcp3YrDqR2fGKKj2uBg1svpXDkswSmZ15Ltpdox1?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/2Y6C5qFDqkbBUjH5RYLPZdKfVYY8jDj6roH5uDZwpeDawm3G4G5h41A6qHj8GvLQGgspNP7RKdN7tfQQkDmVmpu3?cluster=devnet) | ok |
| investor:register investor1 (KYC SIMULATED) | [tx](https://explorer.solana.com/tx/5yZsPhqi7tJq256RKD4KeC7DJeF31ubhrdMM1aQVCKP6UdE9s4u69jV9Ci735BxoJUqjXGFj5pbe3gmKXfUucQS7?cluster=devnet) | ok |
| investor:register investor2 (KYC SIMULATED) | [tx](https://explorer.solana.com/tx/5mmJU9vFDevNajmC9puPBPr4MvvbJu5hs9Z9Wce7wRX9caSXhnkGdui9jtwEzinXDxPUaSVYK2jj5yPhXaVNBaHX?cluster=devnet) | ok |
| investor:register investor3 (KYC SIMULATED) | [tx](https://explorer.solana.com/tx/4sxQqfD6fi8sgDGdWrjmtU8e8rGdeCRkhrMPnGES1y3WCDrAMPmk8tx2QeTeNeykkxSwmGL4bQJeY5zALmN1n8D?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 10 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/2Tiaz8Reku7GqavaxvzjxcjLxA61oRbhbERw94KbfeSdAvD3dFee3U4rb3rhdbY5gnJVM8YXQQuUhn2YgwW3ZwrU?cluster=devnet) | ok |
| subscribe 25 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/3BwAUwan3q7ypuN6yMNJ77iuwpshqWiaKsPTVtEgSudvN7osVuSaNyxQLepboXiwf4a6PGJqnxBKNNcZZzoXzNrt?cluster=devnet) | ok |
| subscribe 65 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/CD3gN7Mb15mUfD6NqnzAzY7ppXDKGxLh44j62bEsFuEKtNsCzJxJR5jSrWNpSir2L9kkfhsZ8HALaSL3mSPgDrb?cluster=devnet) | ok |

## S1 — Coupon payment INTR #1 at 10%

Record date = pause the mint, snapshot every holder on-chain; 10 bonds → 500.00, 25 → 1,250.00, 65 → 3,250.00.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%) | [tx](https://explorer.solana.com/tx/4NmLEXBSEaiUJw6hs3245AJmFkFSWjStRZTqMaV4VgWZ4iFvmg9FdJoiEfhKBoTQYskF955MvkC1pFthq6EvhEQN?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/4iAutgTMjpM7tG6oct8H7Cb47UedvLf9sqE1HyhYVUiKXFXEF9g4SVS4mLpp5Dhi1SJ3UWr3CVERNhTnzyV6TAZZ?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/WoXRQDcwBm2DoykGDCKredgUZKWdJ3hv6tRieUXzRV2VVG8WSqDUBZWY29ktJuoWF7P6ASbTPzdh9LmcFuj7fjM?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/VLThaXxfuqgncV5jBg4KMw3DtDsiGp9qd2BeA1nswMGroECgoCGa4qqkrK44vAK1HzthWpz78UuJJsc9yNV4Myv?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/SbWkZPAzaQVWDgrg7b9FNyQdMnAP5sB632yxpSpr9WL4nkmUCzMrH5UGnQmgjJUYiAHx8ZgHyVYmKKJMgL69XtL?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/4timJdNAASBt2MTVgWR9ryUxk5SAeaDdKxw3dFEwdv1KDEnWKmYNtzy4ivY3hpVrX8nqeDG3fA4ooaHumQUFJzye?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/31LCKEnF9aBkfHYPDvcceHDcQ1YigKYqF6sV8C6uuJK5RWKQdyk6XLKXGsWTsM8t4kHz3TuAF61zjoyrmDQ4WWbZ?cluster=devnet) | ok |

**INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%)** — action [DkSQMx7w…](https://explorer.solana.com/address/DkSQMx7w2UNjLzPxjAfTxRwNr3oYWhhYCod35HXuYP16?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT ✓ |
| investor2 | 25 | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT ✓ |
| investor3 | 65 | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT ✓ |

## S3 — Bondholder meeting → coupon 10% → 12% (terms change)

Votes weighted by snapshot units: 65 For / 25 Against / 10 Abstain → quorum 100% ≥ 50%, approval 65/90 ≥ 66.67% → Approved. The registrar's signature stands in for the ARDFM registration (SIMULATED).

| Step | Transaction | Status |
|---|---|---|
| meeting:announce — issuer proposes 12% | [tx](https://explorer.solana.com/tx/4d5DzWLtk5ywwkvuTdRPpqWtEMWqbTMC8N7ukwc9WqKq5ZEjLwSZz49uqzKioBbYJ3bcqjuLAxb6hC9CgHNjjZWX?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/4N1rV922er9pdXHY1Jo6SE8hrWUWrK4xibULF5Xp5xbLhwm1UtPSifCRcvkBewrP6xsKDYwyiXQLpRSLuKRc4kd?cluster=devnet) | ok |
| action:snapshot — voting weights | [tx](https://explorer.solana.com/tx/4T477yvq3XJg1zrebbmqEkuJogk3YtVrXHqjDjTy1boGMSoiftHzXJ12UwUHfnJGBvgBitkc8B7BB5rbQZNarr8s?cluster=devnet) | ok |
| action:finalize-snapshot — voting opens (register resumes) | [tx](https://explorer.solana.com/tx/5NVREi7zWjsBcwkA8BtJ3onaMnFrGFvjPQzHTwVG7bxCWLpjN6ARczDGJSWZYU8LwHnsU2GRhZqM6Vw8vnD4eUzQ?cluster=devnet) | ok |
| vote For — investor3 (65 bonds) | [tx](https://explorer.solana.com/tx/3TuPN9P7VBbJb285p4uzGSJr7G35SPc6uZogWzjZgbt1seoWp4wZ57bHP9PSTBAVvz5eUr4BcvHQTdaHxkzw8iXa?cluster=devnet) | ok |
| vote Against — investor2 (25 bonds) | [tx](https://explorer.solana.com/tx/32qxeUVZQpPXnG6Gtk5WYfey9pRcLHeBrf9xTo4UfHdQ6vQx3uURkgdHJdc7B9CKuU7gi54GmUKr3qakjGWfVwHo?cluster=devnet) | ok |
| vote Abstain — investor1 (10 bonds) | [tx](https://explorer.solana.com/tx/3PEkAoHNWXnt3ZJ2WoDcpreVpKGLDm75TSpHg4vpbYzyZ4UyYpMaTSeUiM1JTZxfrYHZoxLA5eMkoSuqVfjjhg5A?cluster=devnet) | ok |
| meeting:finalize — Approved | [tx](https://explorer.solana.com/tx/3nJBifRJe3aYYQB3wzE2Ga7rGV9UbQ15rn9UAeSEKgPMdyxPfrYLFB85cwaCnn3matC5sE6wLRaFGiFdSf9Jnu3f?cluster=devnet) | ok |
| meeting:apply — coupon_rate_bps 1200 on the series and in token metadata | [tx](https://explorer.solana.com/tx/5dLcjcTjiMafLRq4cGKNJYshVnkq5EUgS1JnwVWLitezEKNiSRbRoUQCLeZeAgXHr14TVuVTtezj2m7rNPEg6VSP?cluster=devnet) | ok |

## S1 (cont.) — Coupons at the new rate

INTR #2 and #3 at 12%: 10 bonds → 600.00, 25 → 1,500.00, 65 → 3,900.00.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #2 (2027-01-03 → 2027-07-03, 12%) | [tx](https://explorer.solana.com/tx/2gxcG1FMiSqTGBXvtDJ8pHB2K3zorLnWRjYhR3qg7BtcLBgK68dKo5m4NNDxfqY4gyYSYAkfJ215MYshAR6Yuc2q?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/2vMrmDYSYq3HHYVt9TPAazUXy87SDvGqHGX43jRFDezmuDK8iAvY4PnEvP5GuDDjw6Dz42ANr3SmzhTzT9NjjD1A?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/3MqMCEcDG7AbmcxpdfssdpBeBC6Wqfefp3Ajv6r11xPjegdqpJznxsJGqyyBWgDohduWpxqBYqHttpnqna4qwPq2?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/513vjUmee1xqSqWixDFUHKSyZHhREknKMov7NVNHyJFeDm9JKA8XxL82ExmQ2DThVEZ88uFv7kmXqeeY18QgFuTG?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/2G63gSstkWHpuXphGbUmo6fEtHb3hdMfi9bLadu47MVAFzFgn15fmSCieYsYjmREedcvSuJjXgmJWyrQzmjajNWX?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/31czJzhrbP9Ak3vjrwTZG1HzaTJPMwmETUVYpSckqr6PzLK4RV96gm6tLzaxGvA5xDH7QfCExN5ZW59Ku2DvHGLK?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/3b9YMaQ47KLK8TkupLCipy27mzTTbgKiRFeyKLmETtEKnbvKVG9FsJ9aG6dWkf8PAQJ8GswKB9piNwmkFDKip3aR?cluster=devnet) | ok |
| action:announce INTR #3 (2027-07-03 → 2028-01-03, 12%) | [tx](https://explorer.solana.com/tx/4DYdHnNoJHEeUY41zcsxQdgaHsHRUmFJtDjLXAN2FubkvQbmC38Gqc35KxNePqRDcBwzDUkccYGTvmjKLAJXmNqJ?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/ATZmQRtdEMBSbARuhjYBZ1mugmTX3XLf4GbYwCKA2WHvqSkW5MHqPsMyKyMc7heA7FgEaBgTxKKAdaMxHHy7jdC?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/58dPuKqCUh26XDbnRvZ4NoFcNLQZGToXqGpE3BxwZpSrkQZuRHCoUNFgVcvzYFE86Ha9Rs3MpFd4AJk8TNPM42ha?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/x8zVntnmLqwtkawUvSuog1o8wDsBe7ma391FMaXJKQbt8C8NEnZVJiyfsso2bkPp8WgyrwywjJBuRichTt7Bb55?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/3PCmu6y9fJdhGiViLLso6t8yj7WDaYoCXUiMwVVVqjonD7GC42ZuDrSxRbdC5u4iGFqUJx1YaRVy372LbsMpwwgs?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/3qbv1FNyMy73ZtTsdbGYzxtheZbQFSJz94XBWhpwCub6dNJ6wDLdZs2vPvts6v2p8NEwSSVMKg9y9zkBBmqibRkD?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/4zaFWi1c5ts1mBAjGKHHtAkkPVTz3TZBCiWdAfun27Ej3G1SZ8yQARa1Fr5mdvDaXN4cp1yZnirDanoX95hGHm7C?cluster=devnet) | ok |

**INTR #2 (2027-01-03 → 2027-07-03, 12%)** — action [FDxcyBd3…](https://explorer.solana.com/address/FDxcyBd3hCtPWgXgEypszcvoL6e2k3Aa6m8hoYGCyLdt?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT ✓ |

**INTR #3 (2027-07-03 → 2028-01-03, 12%)** — action [ES6AXbZB…](https://explorer.solana.com/address/ES6AXbZBiheVUzJZHHu7p1jrs7bWtsVNjrxNz9pc9Ktg?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT ✓ |

## S2 — Redemption at maturity (principal + final coupon), burn, close

10 bonds → 1,000,000 principal + 60,000 final coupon = 10,600.00 tKZT. Units are burned through the permanent delegate and the mint is closed (metadata status=REDEEMED).

| Step | Transaction | Status |
|---|---|---|
| action:announce REDM (2028-01-03 → 2028-07-03, final coupon 12% + principal) | [tx](https://explorer.solana.com/tx/5wCVUxfHXPc1gLRQarm3kzq2gecTrCWJ39C4QxL8SV6KvTck9uZVHh92YehVLavMCoeuA7f4EFQsigQG2wrdjuKx?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/5znwpDkkFdcu46Q5t9SumHpMpYyunEYXWAMcg94EiDVTQ4B8gknDUopQRMvQqTSXH8ZUzXPTEBJyMjLGpwRXVbY2?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/31BF18xFqZvy1vdcUWSduzv4D2AmpySRbZi4vij6bY1sT8vDu7hQqfRytAhmz2tNCTYtFgQni15D7QBQeVKyMT5S?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/4V58cGaiHZCg8epxv454JqsyB1ETp8eDwpiTcvymPXrvV6y5B3h84BEpYYoQBpVc5UR35Q2qVmYwXSXe5ypmgCrd?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/4asLBsLc5m5A675AG66JpcNKgnLdVkwXBkZxPMrofWcLC4urCPtJX57C7mio5PyuFLjA4KSvGh8SpYQvEhRJmvUC?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/5dGhg7BjH5pFrVX2gGpGXVUFua94FmDQrexZ4TvvKzuC9q3c2TTz9kkB7biiKK51gkU8xhr5DCs8EdYkV594yMQR?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/3dLxJSJT275FSGPSc444Ro2nhKSeQ355hb687PMjTChtYx2Vq2zKjv53ccP3USqA3gvqjgGwBpiw6Eyt5DYetMGq?cluster=devnet) | ok |
| action:retire — burn every unit (permanent delegate) | [tx](https://explorer.solana.com/tx/5EyyhishaQbpTAG4xP6FeY7HGBsk8Wv4tibn5RqqToyvvzixYVUFKvUSk1XCFcuiJ17sMHJoZmWf7SZyuEFAC8pd?cluster=devnet) | ok |
| series:close — metadata REDEEMED, mint closed, series Closed | [tx](https://explorer.solana.com/tx/3a7g7HtY68C1t4kEhLYJCnKak9fWVPcbEH4YaQoSbPcPBczhyfLrp9Nv2Lr5dTQ9d7EgAXk5HWmby3XhVkvsM2N6?cluster=devnet) | ok |

**REDM (2028-01-03 → 2028-07-03, final coupon 12% + principal)** — action [GmK726FM…](https://explorer.solana.com/address/GmK726FMUFruUwhrWVMGi9uiFqdbLuZYqiKT2ZRrhUZo?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 10000.00 tKZT | 10600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 25000.00 tKZT | 26500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 65000.00 tKZT | 68900.00 tKZT ✓ |

## S0 — Second series in USDC (BTRK-demo, 15.95%)

- Series **BTRK-tmf0ae** mirrors KASE BTRKb33 terms (15.95%, semi-annual, 30E/360) settling in Circle devnet USDC; face scaled to 1 USDC for faucet limits.
- Bond mint: [4o1fsyKsLabwy47E2i9gcL44fvbghPfP89p42XzrXJxy](https://explorer.solana.com/address/4o1fsyKsLabwy47E2i9gcL44fvbghPfP89p42XzrXJxy?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/4kBv5LYczmMhNmRQHweF7GM1hsJbe4kjMfAh4T9zEKX3uJVzJ9BZnj6oEAWz3fMezDkxnJ6AqCXJDgXqrDW8s5tJ?cluster=devnet) | ok |
| investor:register investor1 (KYC SIMULATED) | [tx](https://explorer.solana.com/tx/61S7c5SZsXSbhAcWgXjsbMRxXCP86UiiGGXwgYEGocHN8PjWNAYyRgss3t3NhtLDKF2RHaut8HVEg6EYiQF6ticE?cluster=devnet) | ok |
| investor:register investor2 (KYC SIMULATED) | [tx](https://explorer.solana.com/tx/54W4ERgSHPGbSGUAGDrChTtSKx2gkzqRFBeBMV75EDAKx3K1bLpZhYm7KSsT6JUJwHQy9q3mhzqog4bR9jnRbPBu?cluster=devnet) | ok |
| investor:register investor3 (KYC SIMULATED) | [tx](https://explorer.solana.com/tx/5bzHcf8cbw8XmetDQZg4rozJKanozuCsayG8KUqnLN885tuzPUB54FBP266kThM1rWAp4ZkRxqLTiA62fq8DRcKe?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 3 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/27iPFdTdrrKv6ETR2nnKsVWjQ2ksrKJQGSkeWx1r65iicnFXhr7C9YsFTRJGSae2AY2Gq6E45DwENVPXpcC5hC4n?cluster=devnet) | ok |
| subscribe 3 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/55hvXLJdnCxjDELacbAVPpg5NGqsjixrj9mKmdbNzvjfJMFpcY99D3zioRkHW5c3nUiSDbKNFC9cQgtM3g9k7urz?cluster=devnet) | ok |
| subscribe 4 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/gNRbRbfPKjh4ySsuWuzsvHEPYkiqbkTrsF7icLZurWRmBRYh827NXB6gxVre9uaVC3Xpf3eguFmRiaPVoSPQxhg?cluster=devnet) | ok |

## S1 — USDC coupon INTR #1 at 15.95%


| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (180 days, 15.95%) | [tx](https://explorer.solana.com/tx/4EnorN37fEMoca29L86JWWNeVK2FXpfFPW4tArBtRgkuxCGGRRuepGHNC2ZZAkggqv17nAbVqsb4kFUXtJvpCEWS?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/3Ba9nri3xgbHYMCv7crMomp8nrxVhW2SF2uJp9oFVXwBJBSnvfYbShRBQXewWtG7TFE4SWQqX4fDxYp7dUfP3qTs?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/4uQ7h8R8iWR77NPv1zBJvG6diHqVX9FAiMgBCzFv55zyiHr4hpsygJHCUPkpp7PQfyEj8D25qfmqTFFk2HQkrarC?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/5nmLv1z51zvZo7wWvMRCGSRXEF3A9SLon13seAtE5VcULQaE1jjXqMAWxxsMDD6iUMQVuuhB25PnD4XEQrpXu47f?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/2U98HXVdy1oQY4QFjd7rX7DVN6zWskA41GsK1s2segcJvXuDCaDTbDvY73dPY8Yhgo1Y1ViT2vF6usTGmhbrjqBZ?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/5LVM9rW22MHSHufk4aXBJEDhTQmR8SXuH2UTf7pdEQTJge4BDMy4RNtyQWedmFx37wXWEsbUj7WGmJJsWqwfDLyr?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/3ALBqLd23JfLh7KpKeAAmMu8Ln33BNDrLxeNCMBbGkqUfiycJ6HwM4xRC9FW9vEWEASrxW6XeEaqfyeAqeoaiakk?cluster=devnet) | ok |

**INTR #1 (180 days, 15.95%)** — action [6sjHtktG…](https://explorer.solana.com/address/6sjHtktGfzniLWbdFTZPNrNAbbzrCwYr3FTV8QrzcqmN?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 3 | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC ✓ |
| investor2 | 3 | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC ✓ |
| investor3 | 4 | 0.319000 USDC | 0.000000 USDC | 0.319000 USDC | 0.000000 USDC | 0.319000 USDC ✓ |

## S4 — Early redemption (MCAL) with 47 accrued days, burn, close

Call on 2027-02-20: principal 1 USDC per bond + accrued coupon 1,000,000 × 15.95% × 47/360 per bond, rounded half-up per holder.

| Step | Transaction | Status |
|---|---|---|
| action:announce MCAL (2027-01-03 → 2027-02-20, 47 days) | [tx](https://explorer.solana.com/tx/2yqoVD9M99wP6JLZevXUVM3Ug4tQLZoMYmW8B94crWerjNc18RQRn9u4jMvQo9Ut9SidD8SyBPFv6muoiNssrpfF?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/3TEohUnvG7kEhLma7gb9DNuno1UpJTuiLSkxC5uWENuSc87e2MCxMwavweDxpi58U3GkHKF6YhSu2UKiyzf7eaQ4?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/2FYQsuPEE7WVYoWQKVPh22mXBEmnCPFkQui2MpBb2AkMqM1WxcGBowX3aY9agpZmBirNSKx4CbYb679W8a7PEFvb?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/5ketc4JtC9jdAtbPHPSvAvYoKPGBhrpKT7jSDdpDbZFdXG9sP63cKdEK8MWPYbQj5a8tTkwVsH46dYi8qLr1pysc?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/Q3Mx91o1h1AP3gbQtqaSi8ym15VE326HEFuPWK1VZ9axdLMqbEiN7MW6udtKT2WadYKspMPrNpwPSxZvYUsCaVE?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/57tfkGzxw7Tx96tBeEEwaH9p8JkP8iZwUHuRNTxLYEkVZuYMwdejMqyaF5iSmLAhFVRqQZNfCLrTHnq2CSPy5vXb?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/nkbvSe8QCFjyPrRWSTBEgihHpzc5imDy7btVpUfM5ZBmhW2Jt5XsiU7VCu17yZ1J64JdEMBpUFEk2yrLTSk4pMQ?cluster=devnet) | ok |
| action:retire | [tx](https://explorer.solana.com/tx/2H4k2gFoEtjRywFfvCn5WRBtCmtgNgPB8T5xffZpr7BaF8xeb9H9YdgEp8rLTdtdxnFZMtR8AHMbxFEh8tWoYqPu?cluster=devnet) | ok |
| series:close | [tx](https://explorer.solana.com/tx/4gWyNCgL6RnCk5e5kiKdziYpVzgXoSCHCuv8HaMfGLHD6QRQ15ibmrd21hGs9cP8UsoraXo8rNC5n4NTxg2GtY9S?cluster=devnet) | ok |

**MCAL (2027-01-03 → 2027-02-20, 47 days)** — action [AfQStcMF…](https://explorer.solana.com/address/AfQStcMFk4PT2KxoiVLtMV1AaKhftCdaQcHeHjiDPkPo?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 3 | 0.062471 USDC | 0.000000 USDC | 0.062471 USDC | 3.000000 USDC | 3.062471 USDC ✓ |
| investor2 | 3 | 0.062471 USDC | 0.000000 USDC | 0.062471 USDC | 3.000000 USDC | 3.062471 USDC ✓ |
| investor3 | 4 | 0.083294 USDC | 0.000000 USDC | 0.083294 USDC | 4.000000 USDC | 4.083294 USDC ✓ |

## Implemented vs simulated

| Element | Status |
|---|---|
| Bond token, holder registry, record date, entitlement math, coupon payment, redemption, burn/close, voting, terms change, on-chain events | **Implemented on Solana devnet** |
| Cash leg | Real token transfers: USDC devnet (Circle) and test tKZT (Token-2022); fiat KZT and Evo/digital tenge are **simulated** by our mint |
| KYC | **Simulated**: registrar records attributes (type, residency, tax rate); no KYC provider integrated |
| ISO 20022 seev.031 / seev.036 | Generated from on-chain state; Swift network delivery **simulated** (downloadable files) |
| ARDFM registration of terms change | **Simulated** by registrar signature step |
| KASE disclosure notice | Generated automatically; publication on kase.kz **not** integrated |
| Multisig issuer approval (Squads), SAS KYC attestation | Optional T2; if not shipped, listed as roadmap |
