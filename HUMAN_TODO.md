# HUMAN_TODO — questions and requests from agents to the human (newest at the bottom)

Format: `- [ ] YYYY-MM-DD HH:MM (task NNN) <question>. Default if unanswered: <what the agent will assume>.`
The human answers inline under the item. The planner pass folds answers into tasks.

- [ ] 2026-10-05 00:00 (kit) Confirm the product name: "Qupon" (default) or another. Default: Qupon.
- [ ] 2026-10-05 00:00 (kit) Confirm the third corporate action: bondholder meeting → coupon change (default) or early redemption only. Default: meeting + MCAL bonus.
- [x] 2026-10-05 00:00 (kit) Provide `.env` (Helius key, Z.ai key) and run `ops/wallets.sh`, fund wallets (SOL via faucet.solana.com, USDC via faucet.circle.com).
- [ ] 2026-10-05 00:00 (kit) Lawyer check: art. 18-2 quorum/approval thresholds for bondholder meetings — we default to 50% quorum / 2/3 approval as *configurable*, not statutory. Confirm wording for README.
- [x] 2026-10-05 04:53 (021) rebase conflict on task/021-go-chain-reader (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved by the lead (both sides kept; api.Deps struct introduced to stop api.New signature conflicts); merged.
- [x] 2026-10-05 05:01 (026) rebase conflict on task/026-go-kase-notice (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved by the lead (both sides kept; api.Deps struct introduced to stop api.New signature conflicts); merged.
- [x] 2026-10-05 05:28 (022) rebase conflict on task/022-go-reconcile (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
    Resolved by the lead (both sides kept; api.Deps struct introduced to stop api.New signature conflicts); merged.
- [x] 2026-10-05 — deploy: done by the lead on the team VPS (human decision: VPS instead of Vercel/Fly). Console https://qupon.85-192-29-7.sslip.io, API https://api.85-192-29-7.sslip.io; redeploy with `ops/deploy-vps.sh`. With ADVANCE_TOKEN set, anyone using the public console can advance the *open* demo action (intended for judges; announcing new actions stays CLI-only). To lock it: empty ADVANCE_TOKEN in /opt/qupon/web.env on the server and `docker compose up -d web` — the API then answers 401.
- [ ] 2026-10-05 19:09 (103) rebase conflict on task/103-ui-radix-components (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
- [ ] 2026-10-05 21:50 (208) rebase conflict on task/208-bo-demo-investor (branch kept) — resolve by hand or let the lead/planner split; then delete blocked_reason.
