# Live deployment check — https://qupon.85-192-29-7.sslip.io (2026-10-06)

VPS (Ubuntu 26.04, Docker Compose: registrar + web + Caddy), deployed with `ops/deploy-vps.sh` after the box was reprovisioned.

- **Health and hardening:** API `/healthz` and web 200; HSTS, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, no `X-Powered-By`; secrets only in `/opt/qupon/*.env` (mode 600); `api-key` occurs 0 times in the container logs.
- **Live e2e** (`E2E_BASE_URL=… pnpm -C apps/web e2e:live`): 4/4 — public pages, legacy redirects (308), demo sign-in for each role, real series creation on devnet. Report: [`reports/e2e-live.md`](e2e-live.md).
- **Full coupon on production** through the cabinets (demo issuer → demo registrar) on `QPNb1-tmg46q`: announce `3MSd…yab4` → strike `2RAR…EGqg` (TooEarly ×5 first, explained in the UI) → snapshot `2qVc…WS1y` → finalize `4ecZ…JYfD` → fund `rReZ…fZnA` → pay `2qrT…zpWL` → complete `5Wwz…s9Vb`.
- **Fresh data for visitors:** `make demo-seed` → `QPNb1-tmggpn` (mint `C56beDXfLCSGnVUmZVkz2dc3KWMLLNMUjA62nbbdmTyu`, 10 / 25 / 65 bonds, nothing announced), indexed with `REINDEX=1 ops/deploy-vps.sh`.
- Screenshots of the live site, EN/RU × 1440/390: [`reports/ui/live/`](ui/live).
