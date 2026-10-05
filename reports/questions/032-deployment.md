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
