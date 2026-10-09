# Qupon — a 2-of-3 Squads vault funds a coupon as paying agent (`make demo-squads`)

Program [QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet) · cluster devnet · run 2026-10-09T05:50:03.503Z

**Result:** coupon funded by the 2-of-3 Squads vault ✓ · 500.00 / 1,250.00 / 3,250.00 gross paid ✓ · action Completed ✓

## What it shows

Institutional approval for funding a payout: the series' `paying_agent` is a Squads v4 vault PDA owned by a 2-of-3 multisig (registrar, issuer, paying agent). `fund_action` accepts `funder == series.paying_agent`, so the escrow can only be funded after two of the three members approve the proposal on Squads. Pay and complete stay with the registrar. A multisig *registrar* is still roadmap.

- Multisig (2-of-3): [HdHg4TG2YrVY6SFp825uc9LmanBG3Y8imUamG7nLxGk2](https://explorer.solana.com/address/HdHg4TG2YrVY6SFp825uc9LmanBG3Y8imUamG7nLxGk2?cluster=devnet)
- Vault (index 0) = series paying agent: [2M9vRRSePadpnMAdvEZQdBAAAP8U28hN7ZZCdfiy7m6J](https://explorer.solana.com/address/2M9vRRSePadpnMAdvEZQdBAAAP8U28hN7ZZCdfiy7m6J?cluster=devnet)
- Series **QPNsq-tmmlfi**: face 1,000 KZT, 10% semi-annual, 30E/360, 2026-07-03 → 2028-07-03, cash tKZT

Squads devnet app: https://devnet.squads.so/ — the multisig may need to be imported there by its address to show the proposal and approvals.

## Steps

| Step | Transaction | Status |
|---|---|---|
| Squads multisigCreateV2 — members registrar/issuer/paying agent, threshold 2 | [tx](https://explorer.solana.com/tx/3CuXqku2ho2YRLs1SyBi8DpnzT5hcrn8Fbt7Nb8w5JNTwjp5jqYXET9CPjncj27CPmTueJPvv8ju1grL495Z5pyS?cluster=devnet) | ok |
| create Token-2022 bond mint | — | ok |
| series:init --paying-agent <Squads vault> | [tx](https://explorer.solana.com/tx/5unzWAmamHfESHr29bxdD8dqQ8jzyMMe5JSR3HNF1aLstHr8rzoYqsAWvtEtRpwhAoVqP8JBScrnD5YQ9hTc5qhh?cluster=devnet) | ok |
| kyc:attest investor1 (SIMULATED KYC provider, SAS attestation) | — | ok |
| kyc:attest investor2 (SIMULATED KYC provider, SAS attestation) | — | ok |
| kyc:attest investor3 (SIMULATED KYC provider, SAS attestation) | — | ok |
| investor:register investor1 | [tx](https://explorer.solana.com/tx/62CF83mzf6qcjB186ZyyDX6T3adGWWwYPJZzN4NzajjaxMZh4WRa7MRF566SAU3a2bCUaHDngSrw3EkfYQTD7Ptz?cluster=devnet) | ok |
| investor:register investor2 | [tx](https://explorer.solana.com/tx/4SfTLRRu35uWQQeMt6zc4wAVaa2mrWxZz9d5ADC1tgKjjqmBCCLb6XYymiX5ULZ7N9SaAjeNa6T7MLwuHGwGZsQ?cluster=devnet) | ok |
| investor:register investor3 | [tx](https://explorer.solana.com/tx/2dNBjQsQeKbhV5vStHe2XTYqHY2BVhGYLCVFyaeyU6PXMp8CM4onFGxrgQ3zZG1E2mZNH9PLbHEteBH3dBMKSutT?cluster=devnet) | ok |
| subscribe 10 bonds — investor1 | [tx](https://explorer.solana.com/tx/4xpeP2popFDHxio7raYnnFFSuLXaFLLErwnGGjLEJQXRBV18gtJrB3XXAakGtB4ffirt29Scuw9Kp8fiHDbLQth?cluster=devnet) | ok |
| subscribe 25 bonds — investor2 | [tx](https://explorer.solana.com/tx/4XtzPVTG2KmwMFJeg4o58Yn1AhJDNa3sv8XzJcmqwLcmbHZQyrGLvKxnMBQ4TD5XV5ozPfZoAGQ4HqsQzw9CBzDF?cluster=devnet) | ok |
| subscribe 65 bonds — investor3 | [tx](https://explorer.solana.com/tx/fpxLS5Phou1Xbgy2YfqDPXWKskttvRk2C6aoJhyV1YQDQurTbGx5W1j3471uYd1eBfreWdSKnmqFtRt1SKLEBgE?cluster=devnet) | ok |
| action:announce INTR #1 | [tx](https://explorer.solana.com/tx/4XKxFNjdJh3Gt4bQ8S7wMMneJbMpdyaf7mUQSJrehfg3s7342jda17bsVAKjyfaXPEujct6481fmi4duiNhZ3idD?cluster=devnet) | ok |
| action:strike — record date: register frozen (mint paused) | [tx](https://explorer.solana.com/tx/3fzgfjAno7CQ4tDbLRW96MpDkTUkL9Qn86hXkASU5n482qhj69i6gPokN7WzQY9JJyE5YFemL3Fytca4RMvss2XA?cluster=devnet) | ok |
| action:snapshot | [tx](https://explorer.solana.com/tx/W9pW149wFQcVGrEAodnzZjAg7WTm2w357zMgBMM86RBnpEjfL91WK6Bt6NHsVdmxqkaqveqLX9oBS4NCuG8UKge?cluster=devnet) | ok |
| action:finalize-snapshot | [tx](https://explorer.solana.com/tx/39PWQaNjoK4gs8NNxE4TKjd3A9s9wBdDL4H2CS6oBm9heMxPJ8RUm2pb3rPCeKRJnH4Sz93cGcgagvbEzGDYaP5s?cluster=devnet) | ok |
| issuer → vault cash ATA: 5000.00 tKZT (net + tax + principal from the action account) | [tx](https://explorer.solana.com/tx/2hZsbVJuJEhywN9QY5JGC9NzieseyyaCCaduKq52g1yXVPvxuARn9cwDgvLD5u8KRbyjSrBoX7v2Q3XcDnUyUbBW?cluster=devnet) | ok |
| Squads vaultTransactionCreate — fund_action(funder = vault) proposed by the registrar | [tx](https://explorer.solana.com/tx/2HcWQXU55ZemnMrp4fXCA5SJNWbErYRsgf1jQnrKBLsB99PeEqv9WMwkiDgSeyUqrHgNvKy89ikDLj1pfonWcc22?cluster=devnet) | ok |
| Squads proposalCreate | [tx](https://explorer.solana.com/tx/4JmfLo7ZPAviAsiryFyLEAYTWdMUU3gvpd4N9ds5fU9kWoP9uS7gE9EXNd1GA3n8ffWYY1dSqeCfgz4ossA5fQ7S?cluster=devnet) | ok |
| Squads proposalApprove — registrar (1/2) | [tx](https://explorer.solana.com/tx/pZmadp8cEDYs7YeBeV3vH9XkZgrGv1RswXyfhoBcEVHdzDsjc5nFhk1mRiztumdcbzSyXhKMEov8cw762sSByzS?cluster=devnet) | ok |
| Squads proposalApprove — issuer (2/2, threshold met) | [tx](https://explorer.solana.com/tx/61YYXRpB7AfqEGkzDZbW3jD4KWv67o2UdEHgJEMxZVJpHL5zPGFgPakyATZnNedp3RfqH3jkE5NsuyeYYQJQdyYx?cluster=devnet) | ok |
| Squads vaultTransactionExecute — vault signs fund_action, escrow funded | [tx](https://explorer.solana.com/tx/2hiUPCshbHqCZyXAx45cYdLwT5ia9SkJtc79Ny9QmoHbqVGmgR2kTDnLhCBz5C5McH4SQpzW3NrKo52fjMKqounW?cluster=devnet) | ok |
| action:pay — holders paid from escrow | [tx](https://explorer.solana.com/tx/2tZpSiXw7JvUDf9Qr5RrLaMDKKbGWxiurGTqZGQacZuRy5yEoehgcxCY9LppR22kmYPKyeVnqtN6PqCZuzNB6UoF?cluster=devnet) | ok |
| action:complete — reconcile, resume register | [tx](https://explorer.solana.com/tx/3nJycUovVkGpR1xcZ9BrrkF9wAhaYApsExu7owRv4dXAkQfuk7bJXj2B4hraQ7HN2g3VSnCZtmrH2NbV1qAEydph?cluster=devnet) | ok |

## Payouts — INTR #1, action [GTAxYidw…](https://explorer.solana.com/address/GTAxYidwc825a1KHKuo8n9iJuc67kfHk178PraQrefdY?cluster=devnet) Completed ✓

| Holder | Units | Gross | Tax | Net | Received on-chain |
|---|---|---|---|---|---|
| investor1 | 10 | 500.00 tKZT | 0.00 tKZT | 500.00 tKZT | 500.00 tKZT ✓ |
| investor2 | 25 | 1250.00 tKZT | 0.00 tKZT | 1250.00 tKZT | 1250.00 tKZT ✓ |
| investor3 | 65 | 3250.00 tKZT | 0.00 tKZT | 3250.00 tKZT | 3250.00 tKZT ✓ |
