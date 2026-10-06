# Qupon — secondary trade settled by Solana DvP on devnet (`make demo-trade`)

Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet) · cluster devnet · run 2026-10-06T10:18:56.344Z

**Result:** secondary trade settled through Solana DvP ✓ · record date refused while a trade was admitted ✓ · coupon paid on the post-trade register (15 / 25 / 60) ✓

_Time compression: the record date is struck ≈45 s after its announcement; the coupon uses the real civil period (30E/360)._

## S0 — Issuance and holder registry (QPNb1, tKZT)

- Series **QPNb1-tmhdud**: face 1,000 KZT (100,000 tiyn), 10% semi-annual, 30E/360, 2026-07-03 → 2028-07-03
- Bond mint: [Da5eWyeRHrP6N2kGbvWMhQRoM4vHgNFCRRkJb6iTK1a4](https://explorer.solana.com/address/Da5eWyeRHrP6N2kGbvWMhQRoM4vHgNFCRRkJb6iTK1a4?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/2fx2rJ6tLxSNERmQSSGZGrE6FxYzKzWJgLwGKybLyEU8gooRQstyzRygG6qZmS4zZPTYVRu7bwaUTCrSXEb6pZBR?cluster=devnet) | ok |
| kyc:attest investor1 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor2 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor3 — SAS attestation by the KYC provider | — | ok |
| investor:register investor1 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/2saQiph64P4Da4vBjLpLiyAi3AYGnYA3ZFPH29y11weAGhcf6QY6hoVM7h7cGbb7BiyseBAwXCMr8hc9n4qsryPf?cluster=devnet) | ok |
| investor:register investor2 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/3PPHGDrasP3DrRLsbbH37N7ZWeMSHoUi6W2pGJVXJYA2oh8xbG1XnpQXpnGv8RMj3hVhmY8gPv3bGBjjEd89Eson?cluster=devnet) | ok |
| investor:register investor3 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/433TqhD5u4V8MpaPRaLvYHdpVabp8E67hwBdBGsd1xQ7iyKc2g8Zkmm2Ej8LtdXctXVpebpGESz9V5eE5NJny8MH?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 10 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/4DmqUkxyNEbwUFUXeHnhgBYn7vPd4LGwfJ6Aj4teKKHgVTAefGp6NuDKSgAmvL2i7kMPniXU18eCU3A3QHhShX7i?cluster=devnet) | ok |
| subscribe 25 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/2X5JqVHPweYK6M6PABr3wrUGx2QVskoSC3KQzetkA1AAtuh1Xifn3jmu8BurXaz4WzcS9jMPjztuSY2if1CYPtGy?cluster=devnet) | ok |
| subscribe 65 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/3wmBbmVQNLHoBqqDWTCZefomdB6uzzNnWzCNSe7Wms3iBLobCRZYNHduw1d9xY1diTdLdnosFCWbYGyzQCeXU2o4?cluster=devnet) | ok |

## S5 — Secondary trade settled by the Solana DvP program

investor3 sells 5 bonds at par (5000.00 tKZT) to investor1 on the Solana Foundation's DvP program [dvp34bdb…](https://explorer.solana.com/address/dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq?cluster=devnet). The registrar is the settlement authority; Qupon only decides which escrow may hold the bond.

| Step | Transaction | Status |
|---|---|---|
| trade:create — CreateDvp + admit_trade (bond escrow thawed), one transaction | [tx](https://explorer.solana.com/tx/7Dp3KP2843vkxTFwyDPmBkPrqxnWCvEEQz5wnpceAHhh36Mse7Y5ak7LPFjQ1d62xdK6YAobYo72cQ2uTY67cXp?cluster=devnet) | ok |
| trade:fund seller — investor3 moves 5 bonds into the escrow (plain transfer) | [tx](https://explorer.solana.com/tx/2atwnFvqVnhT3GXwYKHua81L5CMd6fV26p8FhDLkqCkVaJhH6CruNqBzkKSfS8pTTvL3yZVcnSVzrvysSioyciDT?cluster=devnet) | ok |
| trade:fund buyer — investor1 moves 5000.00 tKZT into the escrow (plain transfer) | [tx](https://explorer.solana.com/tx/4Cw6DVL8fakV6zk7x3RfTgscN6oAxsrF7uZbtGpDwvZ7TYRatz2Ehc1cq317Qcpz3EqJcaZWUu7Z8hLvYbWmFduT?cluster=devnet) | ok |
| trade:settle — SettleDvp moves both legs atomically + release_trade | [tx](https://explorer.solana.com/tx/2BhUpZ2GwZuxJ7wyMi4yqFR299KJo2P7nFv9SB7MdRLY3gjJNRq2YPPR2qQxErB2bnF5LQkAa6WeqMjGaTrfnUrT?cluster=devnet) | ok |

**Trade** [EwaugyBm…](https://explorer.solana.com/address/EwaugyBmdxAUyBBAGjBtxPtKkWP27jAQ2Q9SCeFDyarS?cluster=devnet) — delivery versus payment

| Holder | Bonds before | Bonds after | Cash change |
|---|---|---|---|
| investor1 (buyer) | 10 | 15 ✓ | −5000.00 tKZT ✓ |
| investor3 (seller) | 65 | 60 ✓ | +5000.00 tKZT ✓ |

## S5 (cont.) — A trade in flight cannot cross a record date

A second trade is admitted and funded by the seller only. A paused mint would trap those bonds in the escrow with no holder to snapshot, so `strike_record` refuses until the registrar unwinds the trade; the seller is then the holder of record and the coupon is paid on 15 / 25 / 60 bonds.

| Step | Transaction | Status |
|---|---|---|
| trade:create — second trade, 5 more bonds | [tx](https://explorer.solana.com/tx/4fURzRqXaSEp6xh95YRtbAub9QPNJZGfBjcCpuKJP3yW8iW2QSLDQBLZVR9Qd7MmP1LjuoU8DRLgRrPiujXUYDRT?cluster=devnet) | ok |
| trade:fund seller — 5 bonds in the escrow, buyer has not paid | [tx](https://explorer.solana.com/tx/2DcLrFkCwfZq3FpKKYx8rGue2WZXPDZp2kwXtmR4vTM3SpEX5ZtEzEPob5VqLER3MGtE44zv17VZz7sbYgLjsLDT?cluster=devnet) | ok |
| action:announce INTR #1 on the post-trade register (2026-07-03 → 2027-01-03, 180 days, 10%) | [tx](https://explorer.solana.com/tx/4CTFGCzb3XHa2zycSVbzR7FvfirLesZstjm8dXBjEy1CrkWC5EUcF4SD8CFEWaWp4AZAzKfaP6TaQLSPxP7Y1J9d?cluster=devnet) | ok |
| action:strike with a trade admitted — refused with TradesInFlight | — | rejected as expected ✓ |
| trade:cancel — CancelDvp returns the bonds to the seller + release_trade | [tx](https://explorer.solana.com/tx/4c819YTNENmMchjeyhxxtTZnNFdeVm9bCH7eTdDLZK5weLhbvFRMAjjkCdhPfg2TmfDpPPWpjGRF9pqtaq4U6Ye?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/3cAYNbPipDrzzLJ4YGbhFSP1QWMFM8oddWA3KSVVy1pBsEGkxd7Zy6W7FjezfB3uqdHUK7zTnmWrSZJyqEuxaypj?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/WpQX8ifCP4s9qqzCkahXrWvRQKAsTyxKoedCmWNbNVKiMYM4DGwyJKWPoSLLZSrNWQs6rpzCT1bBGgkiWTaV7k3?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/3u31HUtQtiSQx33EQyBLZWeYTtVCQo9shd9M5HuBu9E4szf4JUcs4Yc6UTpRLMvbzgE6CZYDvknNUaDbErUsyuQ9?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/3vmewdLm8NMCFmgwH1s9YHhQdJM9D4XuvodGnMedmJt9okbKCQJquVuy7ou6aE2UAynBL5TZWuTjgrDgkGNHbFFv?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/56JChwfNcV8QZ4yNq53nUDeSebx7goC3Ahj4m4CpLSpSA96QHGbQzweQq9RpD7NuGRort9ogZyCoVqZEPgpKRJjR?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/5BcwKomwyuKMmKj8D76Q22CHPTa5KgHKA7paTzuzqytr4yBunvMzVFaDdgG79q9rrUrZPxtc8rM8J84F7V1ic7mq?cluster=devnet) | ok |

**INTR #1 on the post-trade register (2026-07-03 → 2027-01-03, 180 days, 10%)** — action [3NBSC4Re…](https://explorer.solana.com/address/3NBSC4Re4FrxkMd4BweydPVGKVa7TQw5UYVyTK3x9XSS?cluster=devnet)

| Holder | Units | Gross | Tax | Net | Principal | Received on-chain |
|---|---|---|---|---|---|---|
| investor1 | 15 | 750.00 tKZT | 0.00 tKZT | 750.00 tKZT | 0.00 tKZT | 750.00 tKZT ✓ |
| investor2 | 25 | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT ✓ |
| investor3 | 60 | 3000.00 tKZT | 0.00 tKZT | 3000.00 tKZT | 0.00 tKZT | 3000.00 tKZT ✓ |

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
| Multisig issuer approval (Squads) | Roadmap |
| Mainnet | Mainnet-ready profile, guard and dry-run deploy script; **not deployed** |
