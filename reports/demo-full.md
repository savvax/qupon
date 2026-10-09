# Qupon — full lifecycle on Solana devnet (`make demo`)

Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet) · cluster devnet · run 2026-10-09T05:22:57.454Z

**Result:** FAILED at "action:complete — reconcile, resume register"

_Time compression: each record date is struck ≈45 s after its announcement; coupons use the real civil periods (30E/360). The brief's literal 500.00 / 10,500.00 figures are also proven by `programs/qupon_bonds/tests/brief.rs`; here the meeting raises the rate to 12% before redemption, so the final coupon is 600.00 per 10 bonds. BTRK-demo is scaled to devnet faucet limits (face 1 USDC)._

## S0 — Issuance and holder registry (QPNb1, tKZT)

- Series **QPNb1-tmmk1v**: face 1,000 KZT (100,000 tiyn), 10% semi-annual, 30E/360, 2026-07-03 → 2028-07-03
- Bond mint: [2fiiGFdTq7NznkdTVj3gMAjCCWYKgJzsaXXR9RMfqqA8](https://explorer.solana.com/address/2fiiGFdTq7NznkdTVj3gMAjCCWYKgJzsaXXR9RMfqqA8?cluster=devnet)

| Step | Transaction | Status |
|---|---|---|
| create Token-2022 bond mint (extensions validated by init_series) | — | ok |
| series:init | [tx](https://explorer.solana.com/tx/KMSvyNDX8KbbN9kuSBpHnUxTxBhaDucW8sEKAEHG95Z5gpiHEi4ujc4KWGrqsWnurPYKT9uak1wA4QwutaebAk5?cluster=devnet) | ok |
| kyc:attest investor1 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor2 — SAS attestation by the KYC provider | — | ok |
| kyc:attest investor3 — SAS attestation by the KYC provider | — | ok |
| investor:register investor1 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/QR5jnwbAkKzhpHXUvqQuPkJXrATZDYcUsKdHp5H3dtftfuYsJLKnvjY4DTtZPe8GSD2zGwCvRssbrhydARCgQfZ?cluster=devnet) | ok |
| investor:register investor2 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/44FKHjp7zvWN1PKXmCCsPT6P1PJAHoSMiTGxcGXbHdbjh4CTdhGo85QkStLWAqTAVu4YEgLq57JCKJ3Kxxj9ew8N?cluster=devnet) | ok |
| investor:register investor3 (checks the SAS attestation) | [tx](https://explorer.solana.com/tx/yMb2Vc2UD3Y4ksTF9q1JewCZSzJm5fU1EUFHiZsVDMVzfSXKqUrgTDLFfjzBPEiAz5s7Yo2TBhiSnUf2oojwVUb?cluster=devnet) | ok |
| subscribe from an unregistered wallet (frozen-by-default token account) | — | rejected as expected ✓ |
| subscribe 10 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/3QBbJ76PF7taamo81FaoukSqrRbBxiYPYjMR7PtbdxmZ8tyYbaWjjyY2Ag87xSb3nxpBdYrXBXGa93SZcghokoWn?cluster=devnet) | ok |
| subscribe 25 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/5GrJC6D4N9V3DhawEc5eBMmWqg8MwNiNCuHTVv2KQh35HCcKR9EJxwLyBzepMA36AHzathQPG9QzF8N1fzTBy5xe?cluster=devnet) | ok |
| subscribe 65 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/3knW3Vo1XftcuFrU4vV7LQrodBue13Jw2NdHUnFd9SRuJed2Un9KBo2aUofuQyJk4nw6gEnDB71tPPoj4RVYES3H?cluster=devnet) | ok |

## S1 — Coupon payment INTR #1 at 10%

Record date = pause the mint, snapshot every holder on-chain; 10 bonds → 500.00, 25 → 1,250.00, 65 → 3,250.00.

| Step | Transaction | Status |
|---|---|---|
| action:announce INTR #1 (2026-07-03 → 2027-01-03, 180 days, 10%) | [tx](https://explorer.solana.com/tx/2taaZaKLqRz4JkZF71fKSsT43At6MUx8pgZTYYSiFx8Tx8f18CVGbtRf3FDE7VM6cKz62N3w827JiSGp9M9CfRPK?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/27gPFnA7YUwZELwbpXCdAHPQxZzcqZDHUPPW9zJGkZchRmTmyWxj6Sexbo6bSDG6jfKtRSLf1AoF5hRTJEswZcSB?cluster=devnet) | ok |
| action:snapshot — one Entitlement per holder, sha256 chain | [tx](https://explorer.solana.com/tx/4NGPKntschkSwL3nmxztReKkG9Q96ctaqy1AavZ3QUKYoQGaPni3gpz2sTkWA8ReDLX1ytx4WqTd7Wn9xc3uzj7P?cluster=devnet) | ok |
| action:finalize-snapshot — Σ units == supply, rounding bound | [tx](https://explorer.solana.com/tx/4riCiYNLBuwPUkCh4zs9G39jqT6PpHVZWDZ3ufk3Xd89qNyXJjhXCd6mfpWssyE8Jau6yf3VZ9HTxD5GwhBp1Rio?cluster=devnet) | ok |
| action:fund — issuer pre-funds the escrow (net + tax + principal) | [tx](https://explorer.solana.com/tx/4v4UfUbnZ9kzv12LCcXBc6gmjLBa4pxemf1jzFLGLvWrobvQUJDjyQUzo1iJQmi2SsAhDi448FHdMoh7vXzxGkE?cluster=devnet) | ok |
| action:pay — holders paid from escrow (action PDA signs) | [tx](https://explorer.solana.com/tx/2jwrqaGUbbTeYbx1Epti2j5Pjt5tv71KGFoyWPRPBJgBiYMUoC4f6kCrQe4dnmeLDfqv8fVQpQpbvJ7UwRJA6gCM?cluster=devnet) | ok |
| action:complete — reconcile, resume register | — | FAILED |

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
