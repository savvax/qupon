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
- [ ] 2026-10-05 11:17 (from 032-deployment)
    # 032 — human deployment logins needed (Vercel + Fly.io)
    
    The repo now ships everything except the account logins. Please run:
    
    1. **API (Fly.io)**, from the repo root:
       - `fly apps create qupon-registrar`
       - `fly volumes create qupon_data --size 1`
       - `fly deploy --dockerfile services/registrar/Dockerfile`
       - `fly secrets set ADVANCE_TOKEN=<random token>` (token of your choice; the web app's server route sends it)
       - `fly sftp shell` → `put config/devnet.json /data/config/devnet.json` (qupon CLI config for the executor)
    2. **Web (Vercel)**: import the repo, root dir `apps/web`; set env `NEXT_PUBLIC_API_URL=https://qupon-registrar.fly.dev`, `NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com` (public, keyless), `ADVANCE_TOKEN=<same token>` — server-side only, never `NEXT_PUBLIC_`.
    3. Reply with the final URLs if they differ from the documented placeholders (`qupon.vercel.app`, `qupon-registrar.fly.dev`) so README/`.env.example` can be updated.
    
    Default assumed: the placeholder hostnames above.
