# Qupon — full lifecycle on Solana devnet (`make demo`)

Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet) · cluster devnet · run 2026-10-05T09:06:36.490Z

**Result:** all scenarios succeeded ✓ (S0 issuance & registry, S1 coupons, S2 redemption, S3 meeting → terms change, S4 early redemption)

_Time compression: each record date is struck ≈45 s after its announcement; coupons use the real civil periods (30E/360). The brief's literal 500.00 / 10,500.00 figures are also proven by `programs/qupon_bonds/tests/brief.rs`; here the meeting raises the rate to 12% before redemption, so the final coupon is 600.00 per 10 bonds. BTRK-demo is scaled to devnet faucet limits (face 1 USDC)._

## S0 — Issuance and holder registry (QPNb1, tKZT)

- Series **QPNb1-tmffgw**: face 1,000 KZT (100,000 tiyn), 10% semi-annual, 30E/360, 2026-07-03 → 2028-07-03
- Bond mint: [E4EHdADP27wBY82ZxyNZPXcH6Rb1jPLQyuociampkFuD](https://explorer.solana.com/address/E4EHdADP27wBY82ZxyNZPXcH6Rb1jPLQyuociampkFuD?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/543yRcbQ1jvscwDaArRXFPZLGmMKUz3rS1Zu2r4EZbTvJvGZUDzybAnhBMxWkHBdSSWSeBxtsHE8DPbCw2AW3UQE?cluster=devnet) | ok |
| kyc:attest investor1 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor2 — SAS attestation by the KYC provider | [tx](https://explorer.solana.com/tx/3UQXaZe2An2YpWMLGGLzrENd37xcR6yoj1CJAXmnMnyS85GX5Wf4JGtPEphd7m5XnHFejtSqcV25qiqGYrwLRyHQ?cluster=devnet) | ok |
| kyc:attest investor3 — SAS attestation by the KYC provider | [tx](https://explorer.solana.com/tx/63pCBhL7CZgJNSudhet33rrsHmGnbVM7L1yM1zVEkH9qTqYzh1cSiNehXBGWu8yTUKkZVU8t3HzMXgwdKjms8Lcs?cluster=devnet) | ok |
| investor:register investor1 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/4qqK8NDmvtw5gQzHvF1vk36C5jUvSeYwDNgPAE7XFz3HpHcvXyNay63NQzQMZ7ki4r5azAsKEBgvDZimGxHcQ7YV?cluster=devnet) | ok |
| investor:register investor2 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/55iG2xL1XaVdJdv3mb8gE7i6MX6TwVGppLAcVeKRxM6TAATUB69gbpTx1KSMz81TMVqWwv4kKJuxuPH6ubk1LFpH?cluster=devnet) | ok |
| investor:register investor3 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/48mQTuqgiZYFnYJE7B65bVBm8JRxmJuQw2S6uHwLmpTx4PTe9dmAvUaT4w4gH1WLx88Bn9ZtVn9NdRVwZ4EPd1Ac?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 10 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/MP37yjvgfotpTmYpGLhyxW5VspVwktXiy3oGxsWkjA4MZd4SeUusw3h2HmUdBnpRLW2kHM4vwwTPMogr2muyj9N?cluster=devnet) | ok |
| subscribe 25 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/54DChJi7CcyQjohZPEfCEvzp4e7ymeGviEowvD2rPmAuJUnaDBuxQBLwFn2tGjykm9FWp5qxJ68CdztLVY74m3KU?cluster=devnet) | ok |
| subscribe 65 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/2JYz2KmdY8GFBdCe9gkorfQP627bzb536BytkSiGYRqjieWz2WkcexEkHzMvGNAK2mUTTTHbc8u9R7K6ga7DQToR?cluster=devnet) | ok |

## S1 — Coupon payment INTR #1 at 10%

Record date = pause the mint, snapshot every holder on-chain; 10 bonds → 500.00, 25 → 1,250.00, 65 → 3,250.00.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%) | [tx](https://explorer.solana.com/tx/3vEYmTBZcUY37bG9zkg5yQRXtD4Epo92oxM7kTfyuqaWBUhapeYC4PWHZircNqBgPGnhS2qjow7nQKkKuwnMbFJ2?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/W4UgRY8o1M79zDk8HdTFtEPQk6Q5nb6s8KM8ozZHFtLVDax5HGvb7io9hXhocBrPPwdUSiCLtmubAtz6kNHCTw7?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/jyfzCHons2efTL9Pjx9t6Ch9aM6BnWNadq42ZxJd6eRHDCMDfZGxrXxXv4jidM5QQbu35oS9V36gYib6Py6qK8Q?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/5xhGXqWaFGDkJWAQpKTjYJmqbTqEHCzH1oyqDqdhQQF4Z8mp4XMUzBZvQcj5hysQepBUYLaQVqv5y7HGwWyDRFL3?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/4WW58BRi3HM9F39ePn8Fh81ArVwUqQu95EzaWaWCBGF2JDu9jUZU3TgbA33Cs7mm4NUWuzhRdgsxVCocpXpA3B2Z?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/3hhF9XXEZH32NpDbChciRzT37siouXBAQhuZXsLcvDv1PJL7JuaArf6PZSg8ihCGxN8b5EgoA9YzqHKBvx7byTeV?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/5msxMxpCJgDn4hh3BGppZbLaPKTd7hwqHNMVYNh75XSai954V75mdAQWVSPCUn4yyy9wVKMZEoMA5ArUAhj1wRx6?cluster=devnet) | ok |

**INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%)** — action [27UUWECy…](https://explorer.solana.com/address/27UUWECyfb2yqdjH4Eip2UgkZdCheQTiztnLBfe2ixNt?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT ✓ |
| investor2 | 25 | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT ✓ |
| investor3 | 65 | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT ✓ |

## S3 — Bondholder meeting → coupon 10% → 12% (terms change)

Votes weighted by snapshot units: 65 For / 25 Against / 10 Abstain → quorum 100% ≥ 50%, approval 65/90 ≥ 66.67% → Approved. The registrar's signature stands in for the ARDFM registration (SIMULATED).

| Step | Transaction | Status |
|---|---|---|
| meeting:announce — issuer proposes 12% | [tx](https://explorer.solana.com/tx/3bvoddyR6MtwuLbWC5cxx7z6V8jZFZ9ozUmd3HwFjsY6xe4rrVBFwR977pZvxQ9fXghFejZZs9sGdytdJZvfk7RA?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/35Ha45KnZDCVcGyUsFDAPeibr51ewLg6yc6s8FBfKCLmBEaW4Xw56ebyi6KtNVcjDBncTfjvQ3YZqkzBCrpDAaEq?cluster=devnet) | ok |
| action:snapshot — voting weights | [tx](https://explorer.solana.com/tx/2JWtZXeJUBgRMevzep7fW7Rfr464RqhqcpJDt5HCGnphb66asCiVzPZqPVP7tnMB4rkWft5soVYRWTferNsJT94T?cluster=devnet) | ok |
| action:finalize-snapshot — voting opens (register resumes) | [tx](https://explorer.solana.com/tx/3LhhkDiwZKUA48hxQy3uVsEd4rMR18wvgvNnCGKkxkFk7NxJfUmuZDEgRkRvCvD4U5bsotNC3SAxRcMoq9xihtWP?cluster=devnet) | ok |
| vote For — investor3 (65 bonds) | [tx](https://explorer.solana.com/tx/3MdodAE526BJBLNBaALFK8Z5evJJvuAKHST4KEiYftTi6EtJN19Hr1LMr4qPQDccmnW2gGhu3DhLJSkLTQzM3pVi?cluster=devnet) | ok |
| vote Against — investor2 (25 bonds) | [tx](https://explorer.solana.com/tx/2nRVBweN7tfhYYF68QityX9xVkkEBxQvGwNwQZmhViFHi4aBHW3bktPJzsotDFES13ZUs5tPUp1g4oyVqZSNo4Bx?cluster=devnet) | ok |
| vote Abstain — investor1 (10 bonds) | [tx](https://explorer.solana.com/tx/2Wz1DaNKJ9bcvwQppWM9t4HHov3KRK3KXKUgim6UyDiG8HCuMVEfMrXxWsZfx9pgksAayeWgfQYT6y5hUxK68EQS?cluster=devnet) | ok |
| meeting:finalize — Approved | [tx](https://explorer.solana.com/tx/45YceEp795KChZYMSt5BWGHSDJVGXZEuWjph3vvSdfJoBhemQGVvvH9Vmac8yjiyFvYQtCW1u2XrwTo7kH6HGwLe?cluster=devnet) | ok |
| meeting:apply — coupon_rate_bps 1200 on the series and in token metadata | [tx](https://explorer.solana.com/tx/2L1xfQzoqz2rnXQzfALdV8coZFbQEZbyeueA3jJ42gBaheia3WnVLdWuUr9hWDoBRKXn1VvBQPzfaYHCgyQwPrZv?cluster=devnet) | ok |

## S1 (cont.) — Coupons at the new rate

INTR #2 and #3 at 12%: 10 bonds → 600.00, 25 → 1,500.00, 65 → 3,900.00.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #2 (2027-01-03 → 2027-07-03, 12%) | [tx](https://explorer.solana.com/tx/2sLfCdqswwY2szx3N4HkzrTUfdxHjfybWYkfratTXPcmUAVhWGsQVMML6FoM7giokH43DK5P6Z1xfsUsQz4kEqJQ?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/46qYt2RZenivJwu9Z89ktpNHyTkae2KynL2VPNZ5tiKarA6s3hPcA4oQZoiaBAizkuGHTYYxHE4GVRV5SoQugnzS?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/5QN8oNMufp2fwDiH4Cuxy1rcg9zcp3uHLJBSTj6ovRx7nQvDqL2LEbnbtatYk9bTP5K86s9uX8cFKFgJP63CXTx3?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/2w5CeBwTkvcb336koGaPm9H494eydUE1N24nDSjq25Sq1yy8rwMXZn7UG7L7vAGb1fbSaaNgf9o29HnowjNNLKjK?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/3niKwSt4mjfTPs6XikL9x8NTR3WkvvJRJHtRxCGc34UCeHbAV7UosSoX3ge6VEm5inYvFtpL71Appj9apsq899dM?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/526op8aJEfStSsfAHX8QYC7V27rZk81bLxrvhJQ5SW5jRyKpDFooxkNNM9yLvGRZzyAcPbRGvHxTadMkFLuArCqj?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/RdHgHUdkTbadfLFSSy87v7uRKoBVfYJXTX6zNzzLLLg3PYmNWuTPuhUMf66DjrTUWSY34HWjC3jU8bNsytwkG9Z?cluster=devnet) | ok |
| action:announce INTR #3 (2027-07-03 → 2028-01-03, 12%) | [tx](https://explorer.solana.com/tx/61suXawRKwmuoNCQWQnLXQGFE2xhVm8MWe1cqvQ8cTxzCFjxSS53AfMXcqfbCcTvyCkjWBMWNKApk3ERDci24uSk?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/2Md4JfXht5MJoUkdHwGMxVgY8wDwtFGJL8nFvfWgRcpBMk1bUsqnJmpLdoPJTx1ZoTMgMF8hpaEBnG34LJMgF4D7?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/4WDgx7jThnv2hGpxvZzd234XkeRzLCRRhbXaQYEYxAz9gGk8ERzJXSH58vhSbTVpG79ma3kdCkd7ry387gWEgMZr?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/4Hcd3gDrptyhWnjykxT2DNPxnn3GeGYfZXbghHcys9s8oxfF9ufo2XD9GGQckdUfYj9n8RdRsmZRs41KcLjoWcvp?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/2vxfU3c68aibLdKvNQWLJdLGMKKrFrFqxJDerHRyD1yTt3epRFWpKwNikcRrMypL84wNqubXQVbd7zt5p3hetdWP?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/2eY9osFJqeGSCEdMnadi5nv1S1qWKT7ndfySH8Fu1YSPw4rhjKNgNcQVG6tNUm8U45DhwNdppP4a3RogjgVAFiUj?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/Rd8o1nmMo9Z6k1DkCQ5GFyhqpAvBGsozjeA3ohxkns1cd2P5bBo9hwpidd4ftfCqmZ3rEcwd9iDmX8FxUYYR7Dn?cluster=devnet) | ok |

**INTR #2 (2027-01-03 → 2027-07-03, 12%)** — action [E1WrcW9i…](https://explorer.solana.com/address/E1WrcW9iowYETt3go9pP7bgC9DbpnqoqABLCKFwjzXni?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT ✓ |

**INTR #3 (2027-07-03 → 2028-01-03, 12%)** — action [GarPGDGF…](https://explorer.solana.com/address/GarPGDGFT1mgSi7mxtbxUtAWD2QNFDt58wQjAuwgRpx5?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT ✓ |

## S2 — Redemption at maturity (principal + final coupon), burn, close

10 bonds → 1,000,000 principal + 60,000 final coupon = 10,600.00 tKZT. Units are burned through the permanent delegate and the mint is closed (metadata status=REDEEMED).

| Step | Transaction | Status |
|---|---|---|
| action:announce REDM (2028-01-03 → 2028-07-03, final coupon 12% + principal) | [tx](https://explorer.solana.com/tx/46p4qnwqbatyvvpDSqXKwXfXzbX44Rt8MZkdJRx5RWNex2hh4fHCdz4DSFtCmnnQMeAC6Fo23KZdaBCAFV1qJfqZ?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/3a3pCKehFFU6a62XCZ27NWdxkQYDPJwpZafsNovTeiLDDsJ9YT4tBpp5pxptrfz4MayeSzGhXhtbFBegSZ3maz6s?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/3MDrVXBmAF8HH5KJkUY7TPfgXoiGPjkuM9zYQvekWAa9rFqyHxQsj4aCMWnjRKuBf7MmS9z38uB5ZLrszgdLKjBR?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/2dJEMN2TE6RhMPA6VoRPgm1BNcuSHYCvMpX3RZMmz5HP5Ufn61a2jFNFRYMyfpidnrWzJ5SfAVEhHPZQsSmnbzYc?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/2P42VyPMd3RxETVk8DsojWmUrexU5FDNA4hY6MwetoZsEEPJDy3qTzADG7ZyPMCLDf4VRpwWynSm234Nm94Wcahd?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/4P2MrpRSTpqyw34vG5DGWYHh4VGsCdiLdjALDZWWE6jTYiSzNpWeoVf1L9Jk5o8c8Go1knjMkRqEhNf9jR663oDN?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/28S5o2tQuBC6siGRWVUhcHA6JJN1StRUT4tuN2UfUsLSrQBPQEjmKUtf4UDB9iUz1ZK26SD4eKnPiqedQeiyz828?cluster=devnet) | ok |
| action:retire — burn every unit (permanent delegate) | [tx](https://explorer.solana.com/tx/2z8sjdYNHSDSzxMMdN1GoMz39q5CPhAqWmnAA4fL5UMRvDVwBkLnLupvFZQkfA2fzuu9epSW1hJUAZPjYF9oNZ76?cluster=devnet) | ok |
| series:close — metadata REDEEMED, mint closed, series Closed | [tx](https://explorer.solana.com/tx/6496Napntq1fgeQueAvE5TAwxxuL7qu7f6ASGUX1D6NSveiUUZu1vW3hS1X4kDMfSU6b4hjeryuKiEhEmutbSoS3?cluster=devnet) | ok |

**REDM (2028-01-03 → 2028-07-03, final coupon 12% + principal)** — action [Ewjbt1BM…](https://explorer.solana.com/address/Ewjbt1BMxiWd1ZTdTpYd9F4hHS1cJKfAWymf6ZRE83WT?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 10000.00 tKZT | 10600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 25000.00 tKZT | 26500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 65000.00 tKZT | 68900.00 tKZT ✓ |

## S0 — Second series in USDC (BTRK-demo, 15.95%)

- Series **BTRK-tmffgw** mirrors KASE BTRKb33 terms (15.95%, semi-annual, 30E/360) settling in Circle devnet USDC; face scaled to 1 USDC for faucet limits.
- Bond mint: [Fwd4aP1pVyaVU2aD62S15yAJeyrJroCS2QDXWh4FXoGc](https://explorer.solana.com/address/Fwd4aP1pVyaVU2aD62S15yAJeyrJroCS2QDXWh4FXoGc?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/53PWVJ4hsFZkAMU8jnGKbtKi7WeoWXv7rRXhZn1GQaWqUHTGqhy1vub3AfPg3d7Jq7i6BJwEXtYSiTqRmHKUoKLG?cluster=devnet) | ok |
| kyc:attest investor1 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor2 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor3 — SAS attestation by the KYC provider | — | ok |
| investor:register investor1 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/5yFeTxXuiP8hWcvKpvdPsRiLz97udxkQ74wVuGoiFpFXbVLBASvG2wiGnth8b3iM4kcMkAGM65FXBecsEvv1iyyi?cluster=devnet) | ok |
| investor:register investor2 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/3BB7VnEimkhdXdsfwCyuwaLyzezA4B66U61cE4gWPMgfue2XMyMC7tJNFwozwPg5THWudMByPzmxgyY3tehvM8fy?cluster=devnet) | ok |
| investor:register investor3 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/63hYFrupDA77CbvJXmNhUfx68VLXiYKxjRftz1QETWWKDNVMw8yupHqBNWPSjw9YY12awLf1NLJQmNepnCVoGMYz?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 3 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/46VhxxfbdetNUnppCnFTAFuqU6oCpVyfmHACqL7sMmRFLh9X5PcEtELkCSLdTitqNQZ2CrCoY6KxNZ83wb47He3R?cluster=devnet) | ok |
| subscribe 3 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/5aeLM8qDrjy1g77FLHghr1ZHb76d6K7zcz2dRonZHdGk99BSEbVqyGqKsVNwsML8xcvyQmyxmGHF2V8UhaMfPGVC?cluster=devnet) | ok |
| subscribe 4 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/22PJKCiGiELFetLAEKZTRGqYWCgyHtDvdW72wUXh44qT5nQRL4ewgRSvBukJ6GfUwZcGdboHRLGBUz2WecgAXtuq?cluster=devnet) | ok |

## S1 — USDC coupon INTR #1 at 15.95%


| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (180 days, 15.95%) | [tx](https://explorer.solana.com/tx/2R5VzQWk8EoPVhWvB7nj8AsbryVH6okU6PgdCKhsZkRx6qaPvM3vLAWbpJ5LdUmat2riCLFadC4zfsw9uhhE1vN2?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/4nbjJUm9E9pzzBf3FFzxnyMjU53Xnzdjt63ibJt1PaKCFjt4UMUQPFeMtK2hBFPrqeC7jMTkCMRyPmCUTNFiviG1?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/4DDoYzXTmrqjd9b7txq7ZL36ycYaXVrKjPGR53um3NGY5vPv8jYPAqnFSzfRDtzgrjeYnRQ9UhkL1u2PePqHQkBa?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/4P3muwAbxTs2RnzNdhc117VBCTRxAbqGvm58xduMuccUxMfr9abhhYQj5YZ2pokKVAf4PLaRzZ82PqjN5APVdvU?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/5rPLMsZ6DoB8x4NBnmHJ5AdNf2BwDuHw4NyaBrpxoBUjLCoRiB2Z9uRHfW8KyEeufWV3wHQBUSxnujm8VF2D3exh?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/3Nhf4WQG8LPP5Bp1f7FCdQryiu4ZEESGmucwBrth8R9KFFAJWW1NCu1ir3R3USYmBFbkoAqjauAkf2QHYsdQoCwg?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/5zCa4e7otZiMskckFmTMAgJU3e8X3P2dfHgWEznyuADYkKtXzcvpxGns3J8DKB4bJ22W9SsLxi7iaXXQeBtqmTtM?cluster=devnet) | ok |

**INTR #1 (180 days, 15.95%)** — action [4DZKNwKb…](https://explorer.solana.com/address/4DZKNwKb1AT7uNGWDfmdcLAn5qViXdRYnf5GX1bNVJNW?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 3 | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC ✓ |
| investor2 | 3 | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC ✓ |
| investor3 | 4 | 0.319000 USDC | 0.000000 USDC | 0.319000 USDC | 0.000000 USDC | 0.319000 USDC ✓ |

## S4 — Early redemption (MCAL) with 47 accrued days, burn, close

Call on 2027-02-20: principal 1 USDC per bond + accrued coupon 1,000,000 × 15.95% × 47/360 per bond, rounded half-up per holder.

| Step | Transaction | Status |
|---|---|---|
| action:announce MCAL (2027-01-03 → 2027-02-20, 47 days) | [tx](https://explorer.solana.com/tx/cnhRkuXFw5PBpVEdqppr2GfHsgxRfbthXDxf2S7rCBQWBW6NTrUGS18yURTFyjbNJeBa6bBtGXMKWk4KskAfAgG?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/3AtXEjand2sutmPE6eFZXJw2RuDQz45W2kPHYGdznSMAWU1uJ6pGT17w3fr26cZFZjn4g24yRqMmofPRv86iPuZR?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/4nvAgSAcpmYdPZ1PYaJ8ZRZJ9GqzswCakZN7M9uxwz5jdNcEnsxbqn97BFiDUBrEtKLF125qzr1rhXQzNsdKoHqH?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/2gWRBLaTwPmago4E3eQmcPyuh7bugsdjoM3UxFMHPatTE8wFhoGv5K36JCWjB2uQ7WAWeMZ87YBrCVUPMnFhc9uc?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/4wmNVWdW4QhUGp1inUJ6mmqNF8HyUwzKzqgSu5KTWRVAAzkFvphZyACHfDYnrJvrHTz4HTd1U3dr2h9MipiZTCst?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/24qWU2mLt6v72SsoXQkA9hryFAEThkvHHhcnB6ZjgYu388JNBDo6ZTWDKiLqdLoeeE57uxrQk4ZHoMR9pt4UiVgF?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/2zobR93ydqwNjCNFhpCSHA1tbDE7snUEUSYCP9RvcoKm2BSZhLVcX7QCRxhoTwrkuXvgNgywk1W9n67LhFq2hHXd?cluster=devnet) | ok |
| action:retire | [tx](https://explorer.solana.com/tx/QSsEhMexzeWemCPyfAi7HequfcqBmdfAqQA3aZtdmLjX3UaA76SdAA1XeHq4qKx4NxQGAGPFxhsih6uVuLCDBhS?cluster=devnet) | ok |
| series:close | [tx](https://explorer.solana.com/tx/5bM6otVvPGYrw9mZNT59EA5oZkcyYdZWkKdnqtPTuzKdFpxdT5vG9d9JAdWx3PYCodv7amkEbAiY78MQtbeXTyqt?cluster=devnet) | ok |

**MCAL (2027-01-03 → 2027-02-20, 47 days)** — action [tnNXA5hU…](https://explorer.solana.com/address/tnNXA5hUjr6Bup3MMPQe7DCRafzVrpek3tJRic77cKj?cluster=devnet)

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
