# Qupon — secondary trade settled by Solana DvP on devnet (`make demo-trade`)

Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet) · cluster devnet · run 2026-10-10T23:13:21.349Z

**Result:** secondary trade settled through Solana DvP ✓ · trade unwound before the record date armed the transfer-hook gate ✓ · coupon paid on the post-trade register (15 / 25 / 60) ✓

_Time compression: the record date is struck ≈45 s after its announcement; the coupon uses the real civil period (30E/360)._

## S0 — Issuance and holder registry (QPNb1, tKZT)

- Series **QPNb1-tmpsdu**: face 1,000 KZT (100,000 tiyn), 10% semi-annual, 30E/360, 2026-07-03 → 2028-07-03
- Bond mint: [3aUBBHmaD89o2qhegVAmsPbR1U1fMAcYhJKR7sSNYApK](https://explorer.solana.com/address/3aUBBHmaD89o2qhegVAmsPbR1U1fMAcYhJKR7sSNYApK?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/4fu2NBJdgJAtZpUahfHirnpcYvPPR9VGVx5omCY75mFZYD2GqUAuCym9uEbJqmRpbu9tn4tNEAmnrnehtGUN9KkG?cluster=devnet) | ok |
| kyc:attest investor1 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor2 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor3 — SAS attestation by the KYC provider | — | ok |
| investor:register investor1 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/2BMSh2jc7dUCzSXtJzgV3TbLf43fTv8HkzcD1imctrJpukS8exgenKqsjXmxHMLBeXyruWSUHyXfHSxeJ8XvPKfX?cluster=devnet) | ok |
| investor:register investor2 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/G4VGEBjPk1bYY9J8yVvnRmZPWRf2tderMcpUuxa4dPp85GPyrMn4SNjxPYftpM9EYN3qRpArxwWcjpcDjEyGPit?cluster=devnet) | ok |
| investor:register investor3 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/284JAggZAMEtbG28aPnb8CfqEQzwM355nyw2siWaNhJtg4XVt91SS6AL8Pv4XKfTbjcQdEyFbxMsw6FMsBcyStca?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 10 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/2nCb8BDWBiQHcngzJstEemDmW7B74t84CNfwybeFSvLTNCJ3wXtJYZfhpKwkbSw7PtFMb1ZLWN7p8kiAsA8vzFhb?cluster=devnet) | ok |
| subscribe 25 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/2dWkfNgHSA4ytShs17ainRqSG45dMCrotseWd7MCk1CBLYurArYPUrZUru8vDsekMXQcuhvSaJyw1BnAcou4ibYY?cluster=devnet) | ok |
| subscribe 65 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/2CGm2QBTcwRZ7k23836NDyNRbvWc8ahoDSgzpLpewsvsyPjBxVrquvsaAoqXajsVEKdSP4x2kQWRW8z3RCqBXpnk?cluster=devnet) | ok |

## S5 — Secondary trade settled by the Solana DvP program

investor3 sells 5 bonds at par (5000.00 tKZT) to investor1 on the Solana Foundation's DvP program [dvp34bdb…](https://explorer.solana.com/address/dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq?cluster=devnet). The registrar is the settlement authority; Qupon only decides which escrow may hold the bond.

| Step | Transaction | Status |
|---|---|---|
| trade:create — CreateDvp + admit_trade (bond escrow thawed), one transaction | [tx](https://explorer.solana.com/tx/2STgzgEVeq2W5NhYZJRQsKzfbhZvZTXMavAmqJv3JN8bqAizsLwuLKykk5zqgQvDYYhxrSeJjaFqAyGZbdwNCw8F?cluster=devnet) | ok |
| trade:fund seller — investor3 moves 5 bonds into the escrow (plain transfer) | [tx](https://explorer.solana.com/tx/SdZEKtf1sL4RBMR3TGmbas7UKuxhCh9SnaV1qewgiz9kEczBrdHtN45542pep5SqtdnDDpmd15y7N2EwgVyBaA4?cluster=devnet) | ok |
| trade:fund buyer — investor1 moves 5000.00 tKZT into the escrow (plain transfer) | [tx](https://explorer.solana.com/tx/5MrJfSkcry3XPzhTkGo7tRt1u1is8DfcDzw9FEtMBRVnjkk8Mxn3xaNVojS4FbALjrf1HpCQ1hst2orGAab5G5J1?cluster=devnet) | ok |
| trade:settle — SettleDvp moves both legs atomically + release_trade | [tx](https://explorer.solana.com/tx/RqXDhpWvcS1aWBponAJoNMphoqVXNSfhx91Nm51PNwD4gdRiib5Gj4BJ7RVEVnmjg87vZLxY8mKvtE8VRVr6JnQ?cluster=devnet) | ok |

**Trade** [GQsRJE5b…](https://explorer.solana.com/address/GQsRJE5bAE519guCVJ1iC7vKY2q2HoPGhUQtC4J9DiVD?cluster=devnet) — delivery versus payment

| Holder | Bonds before | Bonds after | Cash change |
|---|---|---|---|
| investor1 (buyer) | 10 | 15 ✓ | −5000.00 tKZT ✓ |
| investor3 (seller) | 65 | 60 ✓ | +5000.00 tKZT ✓ |

## S5 (cont.) — A trade in flight cannot cross a record date

A second trade is admitted and funded by the seller only. On the hooked series the register is never paused: an admitted trade may not be released once the gate is armed at the record date (`RecordPending`), so the registrar unwinds it before `record_at`; the seller is then the holder of record and the coupon is paid on 15 / 25 / 60 bonds.

| Step | Transaction | Status |
|---|---|---|
| trade:create — second trade, 5 more bonds | [tx](https://explorer.solana.com/tx/2ERG958U6khzx6VP1kMjyJr9BuLe2Dd6oWxdJYJw91TDxeKF7L9pYENAnZyFZ3b9Zr6W86CvQr4TwMTBoiF1KS47?cluster=devnet) | ok |
| trade:fund seller — 5 bonds in the escrow, buyer has not paid | [tx](https://explorer.solana.com/tx/3uKgmDyM5wwmGZsQpVWwfYfK6jANy5fWHMrPdwMfyPyLacUhcxqd8BSCujbewUasr5fVXhhDr7wi8sXKJCEWj2hR?cluster=devnet) | ok |
| action:announce INTR #1 on the post-trade register (2026-07-03 → 2027-01-03, 180 days, 10%) | [tx](https://explorer.solana.com/tx/4PTve7MCDsqxg6bQ95cjisWbmTBXKbmc75fGcoK5NZAyvMgfGNDm279sbyJ8Ywgmuv1LJouFavfBMUv46RgKCjZi?cluster=devnet) | ok |
| trade:cancel — CancelDvp returns the bonds to the seller + release_trade (before record_at: the hook gate is not armed yet) | [tx](https://explorer.solana.com/tx/48fDZzFapFMSkHHeWDtDe29LGHXaRheJrvLQadWW51zCCqLroABFoFWCHjyTcpB9YWdhZiUJcavGiTXJuxQACx9T?cluster=devnet) | ok |
| record date — transfer-hook gate armed (no strike: the register never pauses) | — | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/346b8GZhKnSmKnEphL4N6DwniFRCE75wPxLa5FZJW2iEEgMGzCg4vNdZqjQpfd1Ev4AuSWueKJZJ3RtzvStmFbHB?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/2oni8XMbREgxUejwSmk3My9kMEd8srnPoBzWKTcUa5mMsZxhMfGBZjKCAnNxm6vCJeMLmakcyvMtdLaeurnQ7hfB?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/34y6uRLcepqM1yZM4kLt9rpVaYBUqGLVaLt5J87JHUuF2KgQN3woZLXhyup955gaifn9BTMjiPeyXxRfKEn7njZK?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/4pxBTdQBcox8aDZai6YMJo7royXwzzQbPVE9nX7iHyD2YmQAPnYkVdARqwYEojreEFaPoew93UsMNbaiYRMiSKcL?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/2Lz1K2N3yUc9G3BpuDqR9P6nHpEkwxu7JFyGRkFQPSeU5Z7ojBwhSbyC5hqVHVXWtm2Jf62SJh5C2yEgEx2XeEjb?cluster=devnet) | ok |

**INTR #1 on the post-trade register (2026-07-03 → 2027-01-03, 180 days, 10%)** — action [8yfvwsU2…](https://explorer.solana.com/address/8yfvwsU2fa4tcAGm1fjRMHhnzXNQfcZuBHxZsER4kDGk?cluster=devnet)

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
| Secondary settlement | **Implemented on Solana devnet** through the Solana Foundation's DvP program: Qupon admits the trade's bond escrow, refuses a record date while a trade is open and can return escrowed bonds to the seller. Order matching and a trading venue are not included |
| Term-sheet import | **Experimental** — pasted KASE text is parsed into series terms by an LLM (Z.ai GLM) with a SIMULATED regex fallback; every field is confirmed by the issuer before issuance |
| Multisig issuer approval (Squads) | Roadmap |
| Mainnet | Mainnet-ready profile, guard and dry-run deploy script; **not deployed** |
