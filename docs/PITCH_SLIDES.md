# Pitch deck outline — Qupon (10 slides)

1. **Title** — Qupon. Corporate actions engine for tokenized bonds on Solana. Team, KASE × Superteam Kazakhstan track, program id `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd` (devnet).
2. **Problem** — servicing is still manual: ~$58B/yr industry spend, 46% of event data handled by hand, >45% of brokers lost ≥ $1M to a single error (DTCC, ValueExchange; cited in `docs/07-submission.md`). No standardized corporate-action events on Solana.
3. **Why now** — KASE = registered DFA platform operator #001 (May 2026), Solana + BitGo, tokenized debt launch December 2026; CSD may keep register of tokenized holders (July 2026). [source: `docs/01-product.md`]
4. **Product** — corporate action as an on-chain object: announce → strike (pause mint at record date) → snapshot → fund escrow → pay → complete. Coupons (INTR), redemption (REDM), early call (MCAL), meetings (BMET → CHAN).
5. **Demo frame** — devnet run screenshot: 100 bonds / 3 investors; coupons 500.00 / 1,250.00 / 3,250.00 tKZT; vote 10%→12% (65/25/10 weights); redemption + burn; every step an explorer tx link. [source: `reports/demo-full.md`]
6. **Architecture** — Anchor 1.2 program (Token-2022: Pausable, PermanentDelegate, DefaultAccountState, Metadata) · pure entitlement crate (half-up per holder, 30E/360) · Go registrar service (ISO 20022 seev.031/036, KASE notice) · Next.js consoles · `@solana/kit` + Codama client.
7. **Differentiation** — vs issuance platforms (no lifecycle servicing), vs off-chain TA systems (no shared record date), vs ad-hoc RWA payouts (no standardized events, no ISO 20022, no on-chain voting). Qupon: the whole lifecycle, on-chain, KZ-convention correct.
8. **Market** — Kazakhstan DFA market from December 2026 (NBK notes, then corporate bonds); second: Solana RWA bond issuers distributing yield ad hoc today.
9. **Business model + GTM** — per-event fee or bps on coupon flow; white-label for CSDs/brokers. GTM: one pilot issue with KASE's DFA platform + CSD as registrar. KYC, Swift delivery, ARDFM registration simulated in demo (labelled).
10. **Team + ask** — fintech backend engineering + securities law. Ask: pilot with KASE and the Central Securities Depository; intro to a first issuer. Links: repo, deployed console, demo video, `reports/demo-full.md`.
