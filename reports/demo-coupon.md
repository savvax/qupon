# Demo — coupon payment (scenario S1) on Solana devnet

- Series: **QPNb1-tmevah** (ISIN-like id KZ2C0QUPON01), face 1,000 KZT (100,000 tiyn), 10% semi-annual, 30E/360
- Bond mint: [2AeezQqs6Hf8ei5w6SbrfLUUWmDUz97qwyXBjK3YFB3A](https://explorer.solana.com/address/2AeezQqs6Hf8ei5w6SbrfLUUWmDUz97qwyXBjK3YFB3A?cluster=devnet)
- Program: [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet) · cash: tKZT [HQWXGhNN3SUuaauG1z3vTjzfHRshJxdRYLF9gzzhFmsF](https://explorer.solana.com/address/HQWXGhNN3SUuaauG1z3vTjzfHRshJxdRYLF9gzzhFmsF?cluster=devnet) · cluster: devnet
- Run started: 2026-10-05T01:39:53.776Z

**Result:** all steps succeeded ✓

## Transactions

| Step | Transaction | Slot | Status |
|---|---|---|---|
| S0 create Token-2022 bond mint (extensions validated on-chain) | — |  | ok |
| S0 series:init | [tx](https://explorer.solana.com/tx/xY28qhkkwhk9i2mM2UT6WtjSxWmiwKmPMwPLL3ZbDKunEYXxAupoZ572DmWF1PLsDr5PRUVYNnhgY2stYkiMELR?cluster=devnet) | 507566744 | ok |
| S0 investor:register investor1 (SIMULATED KYC) | [tx](https://explorer.solana.com/tx/2RGRhYw2sD2NGyR3K2E1s4fh2UGyRd2ZBBd5BSwETynNyjJmkR7vNMor9B1gGAvjdTRCpbNUB6jTWRiGhyXYJ4Ue?cluster=devnet) | 507566759 | ok |
| S0 investor:register investor2 (SIMULATED KYC) | [tx](https://explorer.solana.com/tx/4doPp1iBbJPc6KCBoniBKLg7eSA5GxWpQQELktGAt5hDjo42rxUpmtXc1m7vVDYuwncMezEadSBT1ooqFuUhkMcu?cluster=devnet) | 507566774 | ok |
| S0 investor:register investor3 (SIMULATED KYC) | [tx](https://explorer.solana.com/tx/647aFtPsBu5SX1GKJtoDKQcuSES7nHpWvcRVk58fKdufBV7dQeZMSEkhGxdqpza2kTUmGQWB9864ZSLx1V8uTvyv?cluster=devnet) | 507566789 | ok |
| S0 subscribe from an unregistered wallet | — |  | rejected as expected ✓ |
| S0 subscribe 10 bonds — DvP investor1 | [tx](https://explorer.solana.com/tx/5Vma5iQoaFcYFbALEMYz1mfSKaKgrxZWV2KzCGMXHWqXfgiV3zQjWrDKh83NCyt64HrTugpyjFyhjDApr1qBtws5?cluster=devnet) | 507566809 | ok |
| S0 subscribe 25 bonds — DvP investor2 | [tx](https://explorer.solana.com/tx/2mca8kmpSCC7QgusuqH28cZPW5DTdUbMPdhfoDa678mLo9DWGYFCSRXiT9xzv1dwgvLpALLbmAxqX7Xh6k39ZjAF?cluster=devnet) | 507566826 | ok |
| S0 subscribe 65 bonds — DvP investor3 | [tx](https://explorer.solana.com/tx/5C7ymx4zEU5efpKP3o4krmzkpZBPisC2xgtfLZ8VTu9f9rrp8SKSwv6gy7rfjcWeEZf8N2L79e2QrRdLEK5G8LX?cluster=devnet) | 507566842 | ok |
| S1 action:announce INTR #1 (record +90 s, payment +120 s) | [tx](https://explorer.solana.com/tx/4xqw7JdpchKZzqfHhXAiugWP4Qd8raf1kLCa565KqH15smmFTTm8wpVmuW8Bwo7xrPwQwG2NuocjH9KWuAi9G3ca?cluster=devnet) | 507566864 | ok |
| S1 action:strike — record date, bond mint paused | [tx](https://explorer.solana.com/tx/56pdWu1FCTmZHJNpjQ6BznC2amaXdrpuf3Kny684Zu5GCMuaTwNrv8MvKqAyHqTj6igUFdbcovg7bqqNkGcCy4vC?cluster=devnet) | 507567281 | ok |
| S1 action:snapshot — entitlements per holder (sorted by owner) | [tx](https://explorer.solana.com/tx/NJCVUPMmFTNhpGBwvHYz185kLR3aC4tLmknjsxdVnWyBCPUACeXHtR9YbXwy9WHEMqKq5WUfKBhtr42VMdixuYC?cluster=devnet) |  | ok |
| S1 action:finalize-snapshot — Σ units == supply | [tx](https://explorer.solana.com/tx/2rmR6GJpyXp4oxW4Bvw8zktgN51ZwADG3FBokbNvXsxoddtp6DbcHWry6EfXYUQedugHyS4McLYR17PvdCNNPqoz?cluster=devnet) | 507567320 | ok |
| S1 action:fund — issuer pre-funds the escrow | [tx](https://explorer.solana.com/tx/54ytphY3CVWiJidBE2HSz2zUPAEpanQEVKLxUddGbAsa6UWMTHshBUgRzgfyVjXo39hGg1QRrdkHp9ZJNGgehvFq?cluster=devnet) | 507567335 | ok |
| S1 action:pay — net to holders, tax to tax vault | [tx](https://explorer.solana.com/tx/2e7L8ah1Q5eBYaCs3M7eWParsnugme1hgZTcHpWMsCFFS8H3WpUUhxiWNc2MtJwsfTpitrYx9LnDAZuWKvHBuA4G?cluster=devnet) |  | ok |
| S1 action:complete — reconcile, resume mint, next coupon date | [tx](https://explorer.solana.com/tx/4P6CrZVC4xYC6KqUf2KtLBuSVURT2RZQMZThomfTVg3kZjuW2JK62XafruU98RYzSYA6Y4kyHGqibsLExWYu9i3o?cluster=devnet) | 507567373 | ok |

## Entitlements (on-chain) and cash received

| Holder | Bonds | Gross | Tax | Net paid | tKZT balance before → after |
|---|---|---|---|---|---|
| investor1 [DL8G16FC…](https://explorer.solana.com/address/DL8G16FCURnanykUGN95iDXr3gKmxZ94xGU3xt5ZaJEo?cluster=devnet) | 10 | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT | 980000.00  → 980500.00  |
| investor2 [7XVBxDqc…](https://explorer.solana.com/address/7XVBxDqctEz5mMXieqJ7swAa2UbBK2hBSwvoXc9ntLau?cluster=devnet) | 25 | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT | 970000.00  → 971250.00  |
| investor3 [6g4FxBFA…](https://explorer.solana.com/address/6g4FxBFAfC9hSdanqRhvu2eFuYCEUh5cveB7xX5M9rdC?cluster=devnet) | 65 | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT | 930000.00  → 933250.00  |

Brief check: 10 bonds × 1,000 KZT × 10% ÷ 2 = **500.00** ✓ — 25 → 1,250.00 ✓ — 65 → 3,250.00 ✓ (total 5,000.00 = 100 × 50.00). Action: Ai3Cd9JJGoWFNeSpKdP51fgYCQ61LJpwXjKjJ6GGwYMd.

_Time compression: the record date is struck 90 s after the announcement and payment follows at +120 s; the coupon is computed from the real civil period 2026-07-03 → 2027-01-03 (30E/360 = 180 days). tKZT is a test Token-2022 mint (fiat KZT is SIMULATED); KYC is SIMULATED (registrar records a hash)._
