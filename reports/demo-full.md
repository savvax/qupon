# Qupon — full lifecycle on Solana devnet (`make demo`)

Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet) · cluster devnet · run 2026-10-09T05:45:03.840Z

**Result:** all scenarios succeeded ✓ (S0 issuance & registry, S1 coupons, S2 redemption, S3 meeting → terms change, S4 early redemption)

_Time compression: each record date is struck ≈45 s after its announcement; coupons use the real civil periods (30E/360). The brief's literal 500.00 / 10,500.00 figures are also proven by `programs/qupon_bonds/tests/brief.rs`; here the meeting raises the rate to 12% before redemption, so the final coupon is 600.00 per 10 bonds. BTRK-demo is scaled to devnet faucet limits (face 1 USDC)._

## S0 — Issuance and holder registry (QPNb1, tKZT)

- Series **QPNb1-tmmkq3**: face 1,000 KZT (100,000 tiyn), 10% semi-annual, 30E/360, 2026-07-03 → 2028-07-03
- Bond mint: [EMNWDRF5AZSN5Dhf3SqoU9d9hH77AxXFTmGWghpyvDYf](https://explorer.solana.com/address/EMNWDRF5AZSN5Dhf3SqoU9d9hH77AxXFTmGWghpyvDYf?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/27L9xQa7TkCp2vaMhs3PByy86SYcxA66xcW82VCpHcaYFBTFmeVxLf2JWPo1D8WY28kL8KZyvAwuABra3WNkr2U7?cluster=devnet) | ok |
| kyc:attest investor1 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor2 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor3 — SAS attestation by the KYC provider | — | ok |
| investor:register investor1 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/4acSXf11VoKehUZTxhbbdWCTNHukGoE9KzkwvXhGz18vrW37TFvqotf93pEjDjt6mijN7jmUqZPHJbt8yLbmuAq4?cluster=devnet) | ok |
| investor:register investor2 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/5txWPe13fHMJT1gFnsAvY7AmyvgPXd15Nu2UcXY8S4LQQZxEEBgCM4nYUsXk7Qis3y552uqiu944ganGYno1SQe4?cluster=devnet) | ok |
| investor:register investor3 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/5bCJkEwqfMGkvGYcyjY3ggNTsruzHKAwyebjqcaYciWW41EjkQhGsnLiFpxdaVG2tBT7uNrSTXSCYhUyDHeeHN69?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 10 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/4Tj4k3SYEv1vxEeEV5c5F3HNH2NNWVwkyP4WD5G6wtSfUXyqvxnWofkX6q7eiNT6o1Zp4KAaPPmdkuBm58dmAfrs?cluster=devnet) | ok |
| subscribe 25 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/5f15LtEUQ8sdFSJuJ3or5ZafHYiKTCwcDUPhkW6dWQi8XDNn9dPaXLErnWscNymRQQMMQY7Tmggx65xdnymFV1NB?cluster=devnet) | ok |
| subscribe 65 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/4JtrbbXv3FJw3HidHf5gA4tQYafwnZZw8SGVuf6PSrWghHWwDWGfExxoYkyLoickadCiLhkVMvKrJKdsLV71DKdu?cluster=devnet) | ok |

## S1 — Coupon payment INTR #1 at 10%

Record date = pause the mint, snapshot every holder on-chain; 10 bonds → 500.00, 25 → 1,250.00, 65 → 3,250.00.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%) | [tx](https://explorer.solana.com/tx/3XneX4aF1dsK9KQqc53eAPTY94M8igGzNr7dWGnoruWR6XibxskoBYcuUSPPfanf9SZyG29LtQBeyenKek9EVJvu?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/33PUVKfVKFfm7DRoaKvEf4ZzJinpbVPsAbrRmcxHaquoXRwPogNxyJnDi3NKsAcArNWyzR6z1h2efemxhX15oTBm?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/3puaZM5qn59CVh9Spv1bMQ16avFmKdxfdgXFBcoCQV2TxkNdujWFugAXURX1UBi5pt58ouehDCP23uAxGEtLDvkY?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/352ABQZ9HkKTb1Tiwfu3PQVtMF3wzM6mSsSsnp43wa7r6XwT9chqPh6K88t6sAqZz9VkENaS97CD5vhaiAuuACxS?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/3aBwjnECCWeDxmqoZiSUDyxQYyM2xVyWqAy4icCaiq36c2ZuTetTL29P32168apFrzLgviofDcMa9djmVMQXiSbZ?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/4TG7vsArMYfVHE7S1wxAGrtqYNYqndFK1BYKZ4xX8URgdDMaVTpizcD2c3sXeAt883qTwnQMCCAjBUVr3VJ4MzvG?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/3s7gT3sHxs32PErFzdz4jTY3BjEmPNZYfWK93C3hy5TSAQkTGxHGqBTPxzk6nTvECa3XjyqyZtH45mBekDDm7g4k?cluster=devnet) | ok |

**INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%)** — action [9Bo7m1hm…](https://explorer.solana.com/address/9Bo7m1hmpY9Rxdba9YA4kG9yJU2MvP3L26oviEM5Ca4e?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT ✓ |
| investor2 | 25 | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT ✓ |
| investor3 | 65 | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT ✓ |

## S3 — Bondholder meeting → coupon 10% → 12% (terms change)

Votes weighted by snapshot units: 65 For / 25 Against / 10 Abstain → quorum 100% ≥ 50%, approval 65/90 ≥ 66.67% → Approved. The registrar's signature stands in for the ARDFM registration (SIMULATED).

| Step | Transaction | Status |
|---|---|---|
| meeting:announce — issuer proposes 12% | [tx](https://explorer.solana.com/tx/4DZALuod2rQmHqdhFcWcPgduMqecTLmsYZj11g7dgRR5nLn6cS2S2KV7Jy1oZkhgfDZv5fuX2FsUshyfgnTU8GhQ?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/2jrS8EMcW1aW7zihNpqCToP5ZYJS3G4s93Cg9DCpbh8MpDonjSahVeMnr5ePAkryboWfiSYTR3Pxe2422LJrhgVC?cluster=devnet) | ok |
| action:snapshot — voting weights | [tx](https://explorer.solana.com/tx/2k2wZKipuSfNjkB4UG7AyT8SE7ZNUaE1rNNsYk6v65frdqs8r4ne9E3rtkDh3MeYDC9YLdg7jy7h8Q9AxgkJLWfp?cluster=devnet) | ok |
| action:finalize-snapshot — voting opens (register resumes) | [tx](https://explorer.solana.com/tx/5GTk7KJh1jFTUekSMnnAfUvREG5s7ZZyQT9uHNztK1ciVLViF3ptA4r2JZbsGQHeUXBA7SueN2megdxFgDGyXuji?cluster=devnet) | ok |
| vote For — investor3 (65 bonds) | [tx](https://explorer.solana.com/tx/3PuvvSLudaoQnt5yp44AbaMS53HtSe1Lup68bf97XioUXmRFWvZzUMZ6QxY27gSgsaewtfCDA3i4fKxnxWqf7gsb?cluster=devnet) | ok |
| vote Against — investor2 (25 bonds) | [tx](https://explorer.solana.com/tx/4qNkDSRuJCLt7gfKSPWaQRc8oSfxfr5TjZYFka7eRbbspCnqkCLgi5ys7rLwkqSTefgnUPbGDs8vPBpbAdFrfmW9?cluster=devnet) | ok |
| vote Abstain — investor1 (10 bonds) | [tx](https://explorer.solana.com/tx/2hEt9dLJ7AeXiC2tavT9sMMZhj8r6rAuQ4BH9MDqrxEvidjdkyQxP2kjZX9DHeTxBGBWN5pqWfY6FyF1bk6mnpMv?cluster=devnet) | ok |
| meeting:finalize — Approved | [tx](https://explorer.solana.com/tx/58q818qwHVdVTUtXzaJ54q98Qd9AKBNfV7FVnScVsQrJ3SAgNB6q91R2ioM4BN2vrHmG5f7uQehj1gn6JqLfVEEY?cluster=devnet) | ok |
| meeting:apply — coupon_rate_bps 1200 on the series and in token metadata | [tx](https://explorer.solana.com/tx/4NNV5EjJ7NUAq6V7Q2NFTL63Zi9cJZtJLvVF1ueXPYedeqG44Q79onDbhgzbhTTS78hSwGCMTZC6ms3nuQMNwvew?cluster=devnet) | ok |

## S1 (cont.) — Coupons at the new rate

INTR #2 and #3 at 12%: 10 bonds → 600.00, 25 → 1,500.00, 65 → 3,900.00.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #2 (2027-01-03 → 2027-07-03, 12%) | [tx](https://explorer.solana.com/tx/3BG96TL2VzYUmQRUaBZVd5sxL8qMRcM1T3BuopoKzpsehP2icqSxoeELUgf6sF6HFBetwgcfeif2QnbyAhC9DYJC?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/3zmGHJDWdjccFhYf3ut6cNrXhVenXRWbm2RRQW37AZZYVXHdVBLsotcLuRgQ379W2P7viVgrf4KbWasAxzhwnoVF?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/393rBJyZBK2nEa3CmJMUqEd8ux38jvWjXEPQdy3Nb6zhsyyUZuLef7EQkQt9sBGNS3bUqsE4fEcPWKPj6WwEBdmX?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/4UgtWUEy23MdPWdsVGzMYVTYWsfep2c2sq2fMTzNs53FVSF6JvW9mDR13Q6eXbnQSpWBVtN6F7A6y2wwkXnow7Hg?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/4WgSN4tHr6gt5fvdY3vrxHHFe8yXnTDVPywPjMQMSUYHtfdrSDnKre2QdAMxT1XKWE67y9ZRWAHDM8cMEfby5TP6?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/53xPE7ggx6iqyccereKSjcULih8JcgsSeNFZNbQZ3zYZL3bHfLjKCSntR2bx2dFfLe4qxNcWiQk63rdCaYhDaP8j?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/BjaDkmXgWkBsDGs33FRiaFd7KTzHgEPyJqKQopW3e568zNppxXbLK7E9e8NpM1joYvA33SU5xrySTwfEH1ej9xG?cluster=devnet) | ok |
| action:announce INTR #3 (2027-07-03 → 2028-01-03, 12%) | [tx](https://explorer.solana.com/tx/2NY6v8zwaiNvUwWb1Hg9CZENJ7wTKaCtrtNngGempFdDFNnBsTZ4MnxUxAzcc7PXJTvog3jfSLMtR6E4P3w7oywU?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/5jnt5SaCnDeQLzNBKcexjhX4sGDsPHBUV5rfJL91ynapATsDQCvd3Bso1LYNXpfDgvK8mGq71yHPqjYw3q84YQnx?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/4j8igJv3m6jBUc4UNuV8F9o1XRp1zA3osj277uEqErsFU77sjmLh73iX6FW2tKCyymHK1gMpBEXRjPGoxA7wU47d?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/2cqEPsJzR6zhiWpJxdZrRjorQFuVa5m6whH6AZhYfpt5QFZUE5Hifewdg49LJdu7XY2qUaBM66HNndyPtN1LcWj5?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/9wraGaChEDwSZJh7wJ5A6vueED6s5EQFs6AxYJvsz5NeQ3QEVmYyZVpg5FKoty5RXUm1HZDi15CmkkMfBioZsXs?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/25v57FSKFn4thnoQRF1RXPLNxCUqd1A2ydATy2u1XwnfnaArMNprovHU38YaALUtUYWMS5c8xfHDHifCF3Q7Lbgq?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/3hNNjpgFxxGXLf9Ba5Tn7XPkRm51QboY1jG8FRfHkGfJTamfTi6chtX2VYy1Gb3qp6pJbRrW4GVcXFpY1u4WboGr?cluster=devnet) | ok |

**INTR #2 (2027-01-03 → 2027-07-03, 12%)** — action [GM41yMzr…](https://explorer.solana.com/address/GM41yMzr7UHyTpT1ZCSbDzaevm1x9Qr7ky7j5G4kVT5r?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT ✓ |

**INTR #3 (2027-07-03 → 2028-01-03, 12%)** — action [Avbntz4S…](https://explorer.solana.com/address/Avbntz4SzZJ1M4is4LzqDxL18RqDT6zeRio2HKSkx9kN?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT ✓ |

## S2 — Redemption at maturity (principal + final coupon), burn, close

10 bonds → 1,000,000 principal + 60,000 final coupon = 10,600.00 tKZT. Units are burned through the permanent delegate and the mint is closed (metadata status=REDEEMED).

| Step | Transaction | Status |
|---|---|---|
| action:announce REDM (2028-01-03 → 2028-07-03, final coupon 12% + principal) | [tx](https://explorer.solana.com/tx/2c9YRwrjYUT6nuXuyuDvBXidyMnELJvifDLjfGawSNAE6BH1uBTvNuD7DbGCfjiHhBwum7e5GCSnf2Rx8wY8TiLG?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/4nveagtJhTHGzQbRbbNaK7ioYsxAEuahfXL23S5vo2Tb8hTvqTCt3hzzr7Vkg4iAfiWyx4GekqFTGVTisTXNWGDW?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/2JxHU61R9BMEoVwcbHwtdKffJLMAxiBiG4SkwXkqwkjg7KHyVP4Cdx26Au1vtwzP34ifMYHdDb4DzzWp1QgUSxRh?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/5c9JBjKb6F2pet1tBdfN9tkoXMkFLANjLenBSSaHEhDsdR6jAuexrRq5o1bRhFZpRyz1rCYjBDTx2EaZNGmz4FB8?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/Gsrj5RENoQuKoVVov1vddJWDayr5w5ku5o8TASHLrLaKAvFzro15Ue87VSUojoUKvUHspqWBLSYU75ZXG9gEusp?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/2pRssuqcEQfcEb2hoxXi8CyeSKqm1mTuW1hxWdCHevsTEdqS4cLyUMLwAF3gacQG41Rq8puQFmA117haCfA2hRtg?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/5dsUvy2CJdRskzi3WiXLPJdwFbd4tgoyRLbb7huoCHjxm1ajmxEegBExdf3PcTL7SFL7RLt3RXiCbjY7JmBisiAa?cluster=devnet) | ok |
| action:retire — burn every unit (permanent delegate) | [tx](https://explorer.solana.com/tx/4Qu9EpuzhhV5K2cjrNAnUxGMBRXSieT1ZoarzpuLbsVHixmNV3JkKoB6b4ASukshK1oxANiAtGuMiEHBjzkXkVFu?cluster=devnet) | ok |
| series:close — metadata REDEEMED, mint closed, series Closed | [tx](https://explorer.solana.com/tx/3MJMmfyMAoCLj9R6LWGJ4NLoSiwwEBzomCabtUnHKrcBjqG2D1Y3cGh9F98tDeyNTPjc8KDUqFLMJyPdmx6vKjPi?cluster=devnet) | ok |

**REDM (2028-01-03 → 2028-07-03, final coupon 12% + principal)** — action [Aa8xRAoL…](https://explorer.solana.com/address/Aa8xRAoL2HtapeAbbL6PaHgP3itpnr94m1vDiWxaKvA9?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 10000.00 tKZT | 10600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 25000.00 tKZT | 26500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 65000.00 tKZT | 68900.00 tKZT ✓ |

## S0 — Second series in USDC (BTRK-demo, 15.95%)

- Series **BTRK-tmmkq3** mirrors KASE BTRKb33 terms (15.95%, semi-annual, 30E/360) settling in Circle devnet USDC; face scaled to 1 USDC for faucet limits.
- Bond mint: [7W4Eb1j5BnZJ5qb8n6SDDHQb5nkVcPEgxg917MHX8Jsa](https://explorer.solana.com/address/7W4Eb1j5BnZJ5qb8n6SDDHQb5nkVcPEgxg917MHX8Jsa?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/4MJ6ixVMiKp9TdrPPAKeuCiFJ4oVGZ8v3bNHMmj2TtwwXALs5envyke3Yv8vGjA9yBxCLrVVfa9QV6QuKB8MRJkC?cluster=devnet) | ok |
| kyc:attest investor1 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor2 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor3 — SAS attestation by the KYC provider | — | ok |
| investor:register investor1 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/63fKr8KqHjvb4tTEy7DSrkHrGHpNVbPUtBk1FGmCTwBryrT1bYuLqQnP8aUcac7eMNnpmNvJ3wZnguepeiLrwttv?cluster=devnet) | ok |
| investor:register investor2 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/FcHkYQnuVzHjWMWP85MB9vDgnzfiW59QtySFS6UUd6LrG5gXKFK9smRLniyDEKkTUZ65L6DZMtkyJVWQNW1A7bx?cluster=devnet) | ok |
| investor:register investor3 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/4xVtc5tYf1rdmr66TFyR5FJNVW34XLryywibHRSmSe7Cn9fpvdHXt8MzWTRhRe6AUm2Yww9MDdmnvE7nQY7rRNQG?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 3 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/22XBHuxXBj28JfmP8WAm4qg4DQAyLC3R8yvaA83hFf6KKwwGuNotgVYVHqhjnqxmCfkxkGL35EPjtvrX7NzxD94G?cluster=devnet) | ok |
| subscribe 3 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/61V58scdhxRjmNb19CMA2qcJvpmUy9WgB4pGFj7mckYPNXZ1mueXkbhTyTwCesGjNbYND2FjdbheHwC53DAKc1DR?cluster=devnet) | ok |
| subscribe 4 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/3vR1W354jZY2LYgxwHnHA68qnuBQWEjLDQyopfM5G2C55kS8QFj43wit5qoh85xzfnkU6b149SAVqbnB3gg8s3sB?cluster=devnet) | ok |

## S1 — USDC coupon INTR #1 at 15.95%


| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (180 days, 15.95%) | [tx](https://explorer.solana.com/tx/3fvSueBX42WcXqWJYWyppAXEEBhv9R3yiyaT8xJ4e8KtFxAXY4enf5bzeqNcZZ5mcP2qA2NMpTMSKvuFJrrxB2GZ?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/32znnrpxhyMStN7wTGxDtx7xvnBWfVQEgHDaTm1g5duzPtzjjG8xv6VADaNT8ZEDmZwxtu2xwgKzFMdpAeFRGDJZ?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/4z4Ti2uMj1XKUur1PevyEg3qHmL3SwRqbANNaBNMmF5kmxfdGXg8AxkNkx9bxx2NJAQ1aLJtbVDEEWDLwCscaPMH?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/3Gv61KNEdHFJoTTHbKicFaeXDbnMc2EWH2BmegMWQCLg6m19ezHhZ3vjz7Jw9puk88KSKgHwiSnvLMi8NBqLd9zp?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/jgFN1Chwc32LbXtmZtw13LQ9DY6BSsWQ8u2rnghcvr85K5RxJpGYfJkZaT2mhT8ok693djSQ298pjjHMf56Advx?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/4siFY5mtHM687NMnGkECV2XRVDRFmYtSDf1gWC2LYGU7WfMLmXrng7FuvNvkQMuvbSHh67EUSAC2KNNykrJKxXSL?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/2neeJUtU6gPcDUNoFyYPszyWHFSqqFk21mmrZAmdfGmWHJW7wPhgsyUFrdgAknZQuUMFA2N3MXthAhDBvmboJDJz?cluster=devnet) | ok |

**INTR #1 (180 days, 15.95%)** — action [43igmr1E…](https://explorer.solana.com/address/43igmr1Ew5X671MPWAfbTR5ogSrYmCAU7YT5giU2c7Zo?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 3 | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC ✓ |
| investor2 | 3 | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC ✓ |
| investor3 | 4 | 0.319000 USDC | 0.000000 USDC | 0.319000 USDC | 0.000000 USDC | 0.319000 USDC ✓ |

## S4 — Early redemption (MCAL) with 47 accrued days, burn, close

Call on 2027-02-20: principal 1 USDC per bond + accrued coupon 1,000,000 × 15.95% × 47/360 per bond, rounded half-up per holder.

| Step | Transaction | Status |
|---|---|---|
| action:announce MCAL (2027-01-03 → 2027-02-20, 47 days) | [tx](https://explorer.solana.com/tx/J221xevicZKx81LTiVyd9BaNuRFPpekH6hLWqw5usgCr9n4mgq5TFBamEah8jpiKHEnQnLf9oZyM4VcQeQyXxE9?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/2zcoHc1besC4hy5QMuszHKrR3F8CHhFF93v5BwdB13tEuVzGBz13HdSGAxxNonMjFx7xm3LsJLoKJByT92xNDn9N?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/5HPQsh5z1TpnsGsbL98am2LFfjxXHf2XRUTU55C2kV2ct2jStJ19YS64TcNrhxcpudN4XEHxDNQBuEzGc7zPL34Y?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/5JXavigeU8VAAh6G1Qybtdewae8yRk9b9EtcaY45KbSKz1NqU3dAakSPdGMiigpHDjjMkdqbz9CYcDJPPqezGGz1?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/51A38ewt4dFmN2z4S4LeiPNCaLtdPkiAwNL65ZPr6zCSp7UfbvgDJkdVEPB9KweYvM8i76S7rWiSRvcVPugKMtKc?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/LcaWZxZmwwAB7id8DEUkwEBRaDHYTM6yBbNDkiBHEJX2Xn6vxUSnqUuDuGJh6Ktjw4p4D54u2eRkytEpgnruL4V?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/crBZEYtPUEZWBoSiZYDmiU8rYdL8XurLSPFvmrLY9YyfMZ24P5Faq7qfjQbv2HUvJd8K66CYihuoEM6RaZJGXPe?cluster=devnet) | ok |
| action:retire | [tx](https://explorer.solana.com/tx/23GJ3HR1EmVFWqiF4MhFFAChFiESMUh2YHbyQqYhmXeTJjmwgpLQVUzLvHhgmJo2WXnexjaW7pg2zH8NHnnAUsSm?cluster=devnet) | ok |
| series:close | [tx](https://explorer.solana.com/tx/4djFuHJvhx8vhQ7KbwQszy1ipdccDMBq5QWma1zY9WqED8nVesXww3icFCXdhKKCKBn9tzdgREwgA1FgKfeEyVkp?cluster=devnet) | ok |

**MCAL (2027-01-03 → 2027-02-20, 47 days)** — action [BNT6AWxe…](https://explorer.solana.com/address/BNT6AWxey2jWAf3iQBxdxZwRJ19x957BbWPbprBYZrQZ?cluster=devnet)

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
