# Live deployment of platform v2 — https://qupon.85-192-29-7.sslip.io (2026-10-06)

Deployed main (plans 6–12 merged so far: accounts and sign-up, wallet linking, KYC with documents, notifications, kase.kz data, cash-asset registry with tenge stand-ins and faucet, issuer organisations, admin panel, reports, mainnet-ready profile, motion and UX rounds) with `ops/deploy-vps.sh`; the production SQLite was copied to `/data/backup-20261006/` first (migration 006 rebuilds `users`).

- **API:** `/healthz` ok; `GET /network` → `{network: devnet, mainnet: false, demoLogin: true}`; `GET /assets` lists the enabled settlement tokens.
- **Config:** `PUBLIC_URL=https://qupon.<host>` now written by the deploy script (absolute links in admin password-reset and organisation-invite responses).
- **Live e2e** (`E2E_BASE_URL=https://qupon.85-192-29-7.sslip.io pnpm -C apps/web e2e:live`): **6/6** — public pages, legacy redirects, demo sign-in per role, a real series created on devnet, and the new read-only v2 walk (`e2e/live/v2.spec.ts`: platform section, sign-up path, network/assets, KYC queue, notifications bell, issuer organisation, notifications page).
- **Screenshots** (EN/RU × 1440/390 for the landing platform section and sign-up; registrar KYC queue and reports, issuer organisation and team): [`reports/ui/live-v2/`](ui/live-v2).
- **Not automated:** the self-custody walk (sign up → link a browser wallet by signature → apply with documents → registrar approval → subscribe) needs a wallet extension; run it by hand with Phantom/Solflare on devnet.

Operational note: from this workstation the VPS was intermittently unreachable (ssh and https time-outs) while the server stayed up — the uplink is a phone hotspot; the deploy's build step was re-run detached on the server.
