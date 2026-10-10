# Qupon — full lifecycle on Solana devnet (`make demo`)

Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet) · cluster devnet · run 2026-10-10T23:10:42.187Z

**Result:** all scenarios succeeded ✓ (S0 issuance & registry, S1 coupons, S2 redemption, S3 meeting → terms change, S4 early redemption)

_Time compression: each record date is struck ≈45 s after its announcement; coupons use the real civil periods (30E/360). The brief's literal 500.00 / 10,500.00 figures are also proven by `programs/qupon_bonds/tests/brief.rs`; here the meeting raises the rate to 12% before redemption, so the final coupon is 600.00 per 10 bonds. BTRK-demo is scaled to devnet faucet limits (face 1 USDC)._

## S0 — Issuance and holder registry (QPNb1, tKZT)

- Series **QPNb1-tmprvt**: face 1,000 KZT (100,000 tiyn), 10% semi-annual, 30E/360, 2026-07-03 → 2028-07-03
- Bond mint: [Hbpx4hDCybUHJ9zJXfMKeENSvByWUsnpVKDMneN7MV9s](https://explorer.solana.com/address/Hbpx4hDCybUHJ9zJXfMKeENSvByWUsnpVKDMneN7MV9s?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/34W8uZGjtMpHH3TRgkC3NUQucFTSqAPJwKvc9wo4BuzuRWzKj1VFVSRioiSZoFtd2UiWw3QQ7JYEjRg3BMHUKDDS?cluster=devnet) | ok |
| kyc:attest investor1 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor2 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor3 — SAS attestation by the KYC provider | — | ok |
| investor:register investor1 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/J4KTgciTo1cVXDNqnVSHVYPvaRjifGFEYo66kmzTJLKehZWXP6q22xxiKiudFcNchexuY2MCLHV8czZx4hfaeJv?cluster=devnet) | ok |
| investor:register investor2 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/kDwcxoxSvvCLzZUwELQn92HLGCBEGpujgqB7ddbTNDjSMYexNJuAVVx26t7xAsG24PasKND1wjScTJci2JZXXWt?cluster=devnet) | ok |
| investor:register investor3 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/3rU9Khd6EHfYtHYvpbfcfLqU3wDkQrgphaZEQUtavxiT6UJ2wUVAUQCgeLTHyGPrA545xMt8mM57rUaDTduKeesK?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 10 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/31rt6mCUuX15YSbRwqc9eCHJTA5R5UaEXzrmfYtMY3DLwsXsJUgLK6rzWMVvQ3E7ZRH25H5E4MdWGvmXumcFKq8g?cluster=devnet) | ok |
| subscribe 25 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/5CmUixAXqKdHkoxNsqsqo14wuyVSDGNZZ5ymcJRCRFX7sXzm2hAQrA6AKvodUFDEwGfAKJzuP4JQ8JPhhMcs729W?cluster=devnet) | ok |
| subscribe 65 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/29CAvj3RYVC1fdmUvh9RaaJSfHVgg7fH6xwcGABpcNcWvkr5XpvDS3DC28Tkh8WqySbQjPsV2v64V8wnPzDJwcuE?cluster=devnet) | ok |

## S1 — Coupon payment INTR #1 at 10%

Record date = pause the mint, snapshot every holder on-chain; 10 bonds → 500.00, 25 → 1,250.00, 65 → 3,250.00.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%) | [tx](https://explorer.solana.com/tx/5ZR3CjcJhHaGG1sVCqC4KKpyHd5YtBkwYYvDEULic8yLpHkTqP671MbuMXJrZba77z5YAMLNagUae8FyZnhiEQDz?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/2mqvVtVqPNEpaoRsa4P2TMyjCULigNGDQHTqa3Sy97sNay5epDShqpuaYKa6THL4JXD8NX7NFdFJ8ervsnsRspxY?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/iuKWQBEpgXxBBwo8ZGqRTDBZokpmsjGNSQ1xRpuCBnwvirfjdNZn43ggBafpe2hTSgS6NWbxZfciw9tD3fZ8HLT?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/4DMqXqwanf8KLurhEHsiutXUBeVjNSc9Acc14wqhaYnu1GPgAgbJuFzNC19nFHhsDNpCwBFfScR5LgAUKwsE6zWV?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/3EK99C9FrjmdwrEiJCy1reoXpaiFHLfT1RGvYAVxyc9dqSVwuwQKYMCoLJLx76cQot4kEZcnw6XPznbVhQ6nmhM?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/5Ss7HCMX3k8Drbdwwn5YxgTSG8MoZy3RWbjNVwQs5uw7srCaDdpmV9YfFbxd46EZPz8qskP8hs8JqdofcfaLkM3w?cluster=devnet) | ok |

**INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%)** — action [8VrTnbWZ…](https://explorer.solana.com/address/8VrTnbWZ933PbBZd5D8Jx7cpiVEYYpBcU2J3cyzZYEwA?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT ✓ |
| investor2 | 25 | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT ✓ |
| investor3 | 65 | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT ✓ |

## S3 — Bondholder meeting → coupon 10% → 12% (terms change)

Votes weighted by snapshot units: 65 For / 25 Against / 10 Abstain → quorum 100% ≥ 50%, approval 65/90 ≥ 66.67% → Approved. The registrar's signature stands in for the ARDFM registration (SIMULATED).

| Step | Transaction | Status |
|---|---|---|
| meeting:announce — issuer proposes 12% | [tx](https://explorer.solana.com/tx/FGaLUFyB5KT5etsZQiqNgpEqprvS4zPSTPwBZ7FEt4bihHcuvYA9tQjz4Gkv337D1yJdYv8nCoemLrjbfnhxRT9?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — voting weights | [tx](https://explorer.solana.com/tx/4v74HYqRBhcV1UvwWANvDVqmgcfRXNBRqeduJWzwdKvS5yZYuRxmY77CY17CQ7gDvLMA5576Bax8mzSTGzd6V2gQ?cluster=devnet) | ok |
| action:finalize-snapshot — voting opens (register resumes) | [tx](https://explorer.solana.com/tx/G3mnV2rKqgxQLs4fP3nwmAJrm2SnFF2uZRSJBhwYL2XYQTE3v8DZEKCFJbF6uy4bHoPRqjDXAH5ryKadQrbZ749?cluster=devnet) | ok |
| vote For — investor3 (65 bonds) | [tx](https://explorer.solana.com/tx/5FDR9cn7kicCdoW4MUcxsoLrqoaa3MpCTMp6nCfQ9q87p79kupt4JpHUEoGfAMHc9ADtX78U2pUeu4sM65sHz8ns?cluster=devnet) | ok |
| vote Against — investor2 (25 bonds) | [tx](https://explorer.solana.com/tx/rq5MxC7bLDDxN8eSSgkmiNxAAk5Sxh7beCcNLSsNV9mHBdVk2w63WbxfpcfHxf6zGhYposATFE2D9gBmdvTE6Ly?cluster=devnet) | ok |
| vote Abstain — investor1 (10 bonds) | [tx](https://explorer.solana.com/tx/JpnZMYBGNAtfvbtMJzMpKfVEh278zzsxXaqfJDZkzuV8G7LRQeZPBmxREvRUU4CVqYZ2GXVUvQ4ZNYxHpWC1u1a?cluster=devnet) | ok |
| meeting:finalize — Approved | [tx](https://explorer.solana.com/tx/DdCCdyWLheotoLYttBvbt6kfwus1Aq1KgqZX2r4U6cijFDQ52NEu41vzNrk3YDwiWa7i9vGfssrz3LoydBd7eG3?cluster=devnet) | ok |
| meeting:apply — coupon_rate_bps 1200 on the series and in token metadata | [tx](https://explorer.solana.com/tx/2wseRN5uqX8wn6LmVmEvNsDyNPDhagpG9khy9qCECf6tWJKVm5ftBphuCUegoDcZcqgSB2ieGFiLZ21eP1wtWJPh?cluster=devnet) | ok |

## S1 (cont.) — Coupons at the new rate

INTR #2 and #3 at 12%: 10 bonds → 600.00, 25 → 1,500.00, 65 → 3,900.00.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #2 (2027-01-03 → 2027-07-03, 12%) | [tx](https://explorer.solana.com/tx/35ZntuNRXqxUG6GAPt5jKM53Hcg3EGwGMtz7aXShkHSmzpDXBB7z5qGLwjFmKV8QzVoNkD9TcZUiELbjqXcoQVw2?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/2tfqybWZQX3gho69CFhaukpNwWabvzurCPbKY1pXTEd8vnbVbBGaCfc8fLhefhrefyLacR83jbcdbxhgk4BP3HRj?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/5Vn9NdyExNSpEADUSFPeju6CAmRNbrYDfvVFo2Hug3NcZeLPXRcukvesaBN1DvgLqARUDX5ZQ1WuPJjnsjj9Jyvw?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/4STroq1j763fEVw3d4NLVjFqNghYZi1UFT5wKNTbxSW664mYGmMC5juk45HeYWGLSgrgpy9QbH28TuD9JREXNRJA?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/5JqTtxH9pN5LAg5JMd3Tp7XQyE3HA5wZFP2kAGLJDKxf6BENeuvqdprSsnQ7Dm6U5uY39eT51j3YcHA2nKjmJwDC?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/WPnYxKW7NH6Qy3VVywynDqK2AWJzoBGTTUvYQer6wxejhiw5TaRKVhY2cWM9jbb4kmaZE2vcXmFnitqrZNQLzge?cluster=devnet) | ok |
| action:announce INTR #3 (2027-07-03 → 2028-01-03, 12%) | [tx](https://explorer.solana.com/tx/28BwZ42RZY2nAfmTz4Xmpy5eUBi94RbYDWkLRkceavWzbdJCW7PJx9MjSdYpPKfx6CS9PyzwUFgikuLACSR2LcBC?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/5rjCHFP9JTEcL3rNVGU2q8pVLvc4bL5mpqVURpdeDT5bH2hgDnZJrF8earDC27NSUYqPvC1wnkzrmVZZojcD4vgc?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/5YwfJ6KmVvBXikvu2RGZ6sSEtvV7t9CEmPhrW3QJdi97j5CCaYDtFipYTJzcDmwNis3mUi8UtXvG4TwjbDsbe6KS?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/5GZsmHEZ1pF4jkW3YReBvzmH5mTB2zVfCDYxh7i2MT1zERLgNjs96mCSuWxxWXCSNvEJnfaaf9UPboTfmTSntj6H?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/CqmUFNhttUhSGnY4uGEMXJ9vpACBkVrRnaV9F1FBKtLcQxrTFFWQaC8GPF4HcQNX52KphWU5ezt2CkadAGUCdXg?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/2geEpNTa5qsBPJaNZ3Ri3CynPamMtY1u2PQxyUXHT7n59jnatKKKnkfuRMtfeAaFNJYXXTfPZdqpnh6Ad9vFRCMm?cluster=devnet) | ok |

**INTR #2 (2027-01-03 → 2027-07-03, 12%)** — action [76haQ92G…](https://explorer.solana.com/address/76haQ92GriByTCZm2w7X6cEVw2akLLXwtgEuCMrBJYJn?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT ✓ |

**INTR #3 (2027-07-03 → 2028-01-03, 12%)** — action [5vujEUz5…](https://explorer.solana.com/address/5vujEUz5PXSwyYyTeSqf8w6kzvRnpVyUBa5m1A8kYRK7?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT ✓ |

## S2 — Redemption at maturity (principal + final coupon), burn, close

10 bonds → 1,000,000 principal + 60,000 final coupon = 10,600.00 tKZT. Units are burned through the permanent delegate and the mint is closed (metadata status=REDEEMED).

| Step | Transaction | Status |
|---|---|---|
| action:announce REDM (2028-01-03 → 2028-07-03, final coupon 12% + principal) | [tx](https://explorer.solana.com/tx/22bjdm3DurPpUptweUFs9EsDgx93rnAQDjrbXcTCtF3aWd6umGfsYb6CHGbaML5hYtFGx9cPcEqEBfsQBRdnYsyc?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/2tRnMVBx1x6pMbkcNLCE9CJvdsFCrak9bJmzRzcaJfxbbASqj9scVV2gTi6J7a6xicg8tqZcsQ76D9EaoSPRRetE?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/Cj8Ygij36iL37mfshu6RLjb2qPRdnNMNdM2fzNupz3XLS9xsSTNBKsMcq8uXbsXwWpRnGLsQxsAwixSAHFYuRnk?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/3TqmptLwetFuxV8mtsDviEnapWPFWeaYGAkv1nBkPYQGMU5HHTbgnBH956pFQp6ysYy7jRGELdDJ3iqkrdPrddzc?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/484vAMEC9tjPfCxJhFR82Rc74mLSFsaXuKsHxZA9i221GfxFJN5UMhw8hosR2GKbg1ifKiUyW9AcEHFVC35YJsuV?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/5gTt53hZH84cQHr4PutEB75KBufFcfWWujbv1L5uayhN6JnCkgqckrZS97165SdWM6T53mYXrGRDQK5Tpoecch3o?cluster=devnet) | ok |
| action:retire — burn every unit (permanent delegate) | — | ok |
| series:close — metadata REDEEMED, mint closed, series Closed | [tx](https://explorer.solana.com/tx/6365sqqU2ZRRYtBFEUgLfjkqtDvvSDhKSn684JhEbVcpb7WUAZiz6LbSNk8nyrFYkNM7DuaxUP2bbc3Rbqu2aoX8?cluster=devnet) | ok |

**REDM (2028-01-03 → 2028-07-03, final coupon 12% + principal)** — action [t5CNtfeC…](https://explorer.solana.com/address/t5CNtfeCMNvE7Q8ZvdCTN1HVae57B6UASEzQr72tv7S?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 10 | 600.00 tKZT | 0.00 tKZT | 600.00 tKZT | 10000.00 tKZT | 10600.00 tKZT ✓ |
| investor2 | 25 | 1500.00 tKZT | 0.00 tKZT | 1500.00 tKZT | 25000.00 tKZT | 26500.00 tKZT ✓ |
| investor3 | 65 | 3900.00 tKZT | 0.00 tKZT | 3900.00 tKZT | 65000.00 tKZT | 68900.00 tKZT ✓ |

## S0 — Second series in USDC (BTRK-demo, 15.95%)

- Series **BTRK-tmprvt** mirrors KASE BTRKb33 terms (15.95%, semi-annual, 30E/360) settling in Circle devnet USDC; face scaled to 1 USDC for faucet limits.
- Bond mint: [Hs1CVUGQSR8RsryVu3sAJFc6icH4haCBWeQ55pep6NhC](https://explorer.solana.com/address/Hs1CVUGQSR8RsryVu3sAJFc6icH4haCBWeQ55pep6NhC?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/4UYYsNVBdJGasYB5K4DhfbEoMkzz8P4bRvLXra4JBkSE29MjhfBYv6XTSzdykKrF8eWjoMG7HM6VRJ4WFcGKwXmi?cluster=devnet) | ok |
| kyc:attest investor1 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor2 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor3 — SAS attestation by the KYC provider | — | ok |
| investor:register investor1 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/4cPLPb1CZgfC3fiHzzchwPWAQ3DYyH8xHVbrS6M6oZpeG8Xd6E8maHsDTgMyQfYxof9tQSbyToPDHVmkSnHU5NJi?cluster=devnet) | ok |
| investor:register investor2 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/543RNwBgAtMRKUBUfzydwQtgAzsjBhQbZttSWSmAFAfDuJHCT1wH5jFMNEBDaghfdJpE9awFw6M4j3F9K4Jz9Gtm?cluster=devnet) | ok |
| investor:register investor3 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/3hAeDSmWMWd1V4egqQvaxPXW53j7N5WFVjTPvG8e7XkPhdpjb8xRrj9nCF4TjZedhJkBPHY5faiUTSZvMhL3y8B9?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 3 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/3suG8Y9LQMoj1xFoXq5wAnKJeVuWrywz7P1TXmchzgQLHYh1K1paFMtNDUGT24Kx1LWrnXwugjCnYxP2vqYFcyJQ?cluster=devnet) | ok |
| subscribe 3 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/3fo6ZkipYYgw1g8NMLgAvTdwW68XcMT5bpx6sWDYY8znBmr6meJ4k9stLfHVP2R646ootaZqAjCjm6RCPpqhTgQ6?cluster=devnet) | ok |
| subscribe 4 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/3dhqjXok4ffuz4JW5NvGdG72g5koNaR14EekEsRsMdDvcRLrSzKbtj7oVz46CrBBGAahW5etM8rdRLZR2xBdT8Ar?cluster=devnet) | ok |

## S1 — USDC coupon INTR #1 at 15.95%


| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (180 days, 15.95%) | [tx](https://explorer.solana.com/tx/3zYK3xE9LXKcCJGP1t55RXCnaoPYDumS9FdbKvNQgNAAKuP85a1VkGZM54EBkEaVxvVnW2Jbb56KjPGdhpMykPwv?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/46t1888FePCqHup8a2J9yKjJsWYTgo7gKDypu5EPLw7tpeSvZjNeytbb2dgAQi8TRNSKgrXny7xmKB2xnPWczuip?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/3PUk9FzLusHgpoEVSsV5cUNDHWkTQBNVsoTVF6JB4eMURxXbzeGS73cpUotYmpiJE2haauLzbM2v6cLTAxXYpVX9?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/2ZeGHfju8UpraUDyQEmJt2duWGU4hz4aNs3D4zkor6DMmdvaa5ApjFQX8aL9EWEGL6CndQJGAQLL84UGaot4Kvjh?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/23dp66ysAt1tMXeoFSPBC7AMNx3izsEu6DU1GidytYpRNd1rLT2Q3MHnc7jc23Q4La6R67e18QSKGykt36zZ3cc2?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/3qFSUY954UVsA5kwLzRkhQRmKN5AdEd6paysdA3jGWhtiTcmMUDrySgp9XWnrZLiewuRnego9gWZNdxdRbg5M7T6?cluster=devnet) | ok |

**INTR #1 (180 days, 15.95%)** — action [GZGGNsQv…](https://explorer.solana.com/address/GZGGNsQvtsZDVYrtmyNUtaYzsSvkF8vd3k9MxzyyhBAC?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 3 | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC ✓ |
| investor2 | 3 | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC | 0.000000 USDC | 0.239250 USDC ✓ |
| investor3 | 4 | 0.319000 USDC | 0.000000 USDC | 0.319000 USDC | 0.000000 USDC | 0.319000 USDC ✓ |

## S4 — Early redemption (MCAL) with 47 accrued days, burn, close

Call on 2027-02-20: principal 1 USDC per bond + accrued coupon 1,000,000 × 15.95% × 47/360 per bond, rounded half-up per holder.

| Step | Transaction | Status |
|---|---|---|
| action:announce MCAL (2027-01-03 → 2027-02-20, 47 days) | [tx](https://explorer.solana.com/tx/3yfuvhw7YYFAtdW5MHM8hpab9J1YKciEF8aoCqKZKvve78RpJxpMegNeHPReLqeC5XfRhpuaoFYM8z8yj6oursAM?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/4ZYJi3jVPRDfScBcKakndRofxeUafoPFojJmtmuUkw8WdwTJub57Jy6QxoRZYtLNo1uwAW8rSconzzQ9TdNc4fgH?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/58SeJVdNQVPxqjer1DHQ5SH9y2rV7GacYFU6A457FEsi9piJUd6yuLkV4Zk3YFcjUqpXraMBFUMDoUeJdWMDYVfZ?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/2ZFftK3WdiJubUW9jffJ7bRuTnwYeG6mTcA5hAyV5ULB2EqhtGJowBWLAFyfxdzG5SjShCnfQJHXcNDaYAh6VLbu?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/S8Q3Y6kq6Mkb2KDRKSCLizVdcqCdRA1jnPPtgy58jbjvHivVjFvo4z2CC2BTQuYwUbnDCgHa58daqTVqm6yxHes?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/4eSEVCR71szb5Q2EViiLVMjTuxjWqf36Z4KK5hPBDwrBUouiqsJPieffVFXziTNGtdJZgDke4SDb5KTNHKAdaJzr?cluster=devnet) | ok |
| action:retire | — | ok |
| series:close | [tx](https://explorer.solana.com/tx/5ghzeaq4GpcuMWQ3MAmFeiwxAoeCBoUTTNYAMHCg1Wt2YiHb19jSrGxHraqfaZvPounoLM1evPFqpxB8QbsyreLU?cluster=devnet) | ok |

**MCAL (2027-01-03 → 2027-02-20, 47 days)** — action [7suzTXUs…](https://explorer.solana.com/address/7suzTXUsiiDnb9y3gWj7GvFMMazTiu5HEr1F7jwNqbBu?cluster=devnet)

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
