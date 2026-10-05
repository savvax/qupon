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
- [ ] 2026-10-05 11:17 (from 032-deployment; corrected by lead in 9032 after a local docker run) — **deploy the API and the console (needs your Fly.io + Vercel logins)**
    1. **API (Fly.io)**, from the repo root (`brew install flyctl`, `fly auth login`):
       - `fly apps create qupon-registrar && fly volumes create qupon_data --size 1 --region ams`
       - secrets (server-side only; devnet keys):
         `fly secrets set ADVANCE_TOKEN="$(openssl rand -hex 24)" RPC_URL="<Helius devnet URL from .env>" QUPON_REGISTRAR_KEYPAIR_JSON="$(cat ~/.config/qupon/registrar.json)" QUPON_ISSUER_KEYPAIR_JSON="$(cat ~/.config/qupon/issuer.json)" QUPON_PAYING_AGENT_KEYPAIR_JSON="$(cat ~/.config/qupon/paying-agent.json)"`
         (the public devnet RPC answers the ingest with 429 — the Helius URL is required; keep a copy of the ADVANCE_TOKEN for Vercel: `fly secrets list` shows only digests)
       - `fly deploy` → check `https://qupon-registrar.fly.dev/healthz`
    2. **Web (Vercel)** (`npm i -g vercel`, `vercel login`): import the repo, root dir `apps/web`; env `NEXT_PUBLIC_API_URL=https://qupon-registrar.fly.dev`, `NEXT_PUBLIC_RPC_URL=https://api.devnet.solana.com` (public, keyless), `ADVANCE_TOKEN=<same token>` (server-side only, never `NEXT_PUBLIC_`).
    3. Tell the lead the final URLs if they differ from `qupon.vercel.app` / `qupon-registrar.fly.dev` (README, SUBMISSION_FINAL "Website").
    Note: with ADVANCE_TOKEN set on both, anyone using the public console can advance the *open* demo action (that is the point of the demo; announcing new actions stays CLI-only). To lock it, remove ADVANCE_TOKEN from Vercel only — the API then answers 401.
