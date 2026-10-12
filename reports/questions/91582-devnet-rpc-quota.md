# 91582 — devnet RPC quota exhausted on both prod servers (P0, owner action)

`reports/audit/new-server-sweep.md` A91582-1: every server-side chain read 502s on BOTH deployments
(new primary `api.185-216-25-91.sslip.io` and old `api.85-192-29-7.sslip.io`). The old server's error
names the cause: `getProgramAccounts() on https://devnet.helius-rpc.com → 429` (keyed `RPC_URL` from
`.env`, `ops/deploy-vps.sh:15`). Browser-side devnet reads are healthy, so this is provider quota, not
devnet. The bonds board, all 4 showcase dossiers, `/schedule`, `/holders/*` and the registrar actions
registry are down — the scored demo surface.

**Need:** raise/replace the Helius devnet quota (or switch `RPC_URL` to another provider) and redeploy
both boxes; I cannot do this from the repo (no ssh, keys are secrets).

**Default taken:** audit report filed; sweep tools kept in `reports/audit/tools/` so phase 1 can be
re-run in one command once RPC is restored (three findings are parked as unverifiable until then).
