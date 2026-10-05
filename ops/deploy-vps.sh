#!/usr/bin/env bash
# One command: deploy the registrar API + console to a VPS with Docker Compose and Caddy (automatic HTTPS).
#   ops/deploy-vps.sh [root@host]          (default root@85.192.29.7; QUPON_HOST overrides <ip-dashes>.sslip.io)
#   ops/deploy-vps.sh --config [root@host] only refresh the executor's series config (after make demo-ui; no restart:
#                                          the registrar and the CLI re-read it on every call)
# The server needs docker + docker compose. Secrets go over ssh stdin into /opt/qupon/*.env (mode 600) — never
# into git, argv or logs: RPC_URL (keyed devnet RPC), ADVANCE_TOKEN (kept across deploys) and the devnet operator
# keypairs the executor signs with (registrar, issuer, paying agent).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
CONFIG_ONLY=0; [ "${1:-}" = "--config" ] && { CONFIG_ONLY=1; shift; }
TARGET="${1:-${VPS_TARGET:-root@85.192.29.7}}"
IP="${TARGET#*@}"
HOST="${QUPON_HOST:-${IP//./-}.sslip.io}"
[ -f .env ] && set -a && source .env && set +a
: "${RPC_URL:?RPC_URL (keyed devnet RPC) missing in .env}"
SSH=(ssh -o BatchMode=yes "$TARGET")

push_config() {
  echo "== executor config (config/devnet.json + every on-chain series)"
  (cd clients/ts && pnpm -s tsx scripts/series-config.ts) | "${SSH[@]}" 'cat > /opt/qupon/devnet.json'
}
[ "$CONFIG_ONLY" = 1 ] && { push_config; exit 0; }

echo "== source → $TARGET:/opt/qupon/src"
"${SSH[@]}" 'mkdir -p /opt/qupon/src'
rsync -az --delete \
  --exclude .git --exclude node_modules --exclude target --exclude .next --exclude logs \
  --exclude .env --exclude .worktrees --exclude .playwright-mcp \
  ./ "$TARGET:/opt/qupon/src/"

push_config

echo "== secrets (server-side only)"
TOKEN=$("${SSH[@]}" 'grep -s "^ADVANCE_TOKEN=" /opt/qupon/web.env | cut -d= -f2-' || true)
[ -n "$TOKEN" ] || TOKEN=$(openssl rand -hex 24)
kp() { tr -d ' \n' < "$1"; }
{
  echo "RPC_URL=$RPC_URL"
  echo "ADVANCE_TOKEN=$TOKEN"
  echo "QUPON_REGISTRAR_KEYPAIR_JSON=$(kp "$QUPON_REGISTRAR_KEYPAIR")"
  echo "QUPON_ISSUER_KEYPAIR_JSON=$(kp "$QUPON_ISSUER_KEYPAIR")"
  echo "QUPON_PAYING_AGENT_KEYPAIR_JSON=$(kp "$QUPON_PAYING_AGENT_KEYPAIR")"
} | "${SSH[@]}" 'umask 077; cat > /opt/qupon/registrar.env'
echo "ADVANCE_TOKEN=$TOKEN" | "${SSH[@]}" 'umask 077; cat > /opt/qupon/web.env'

echo "== build (one image at a time: 1 vCPU) and start"
# QUPON_HOST persisted next to compose.yml (excluded from rsync --delete), so a manual `docker compose up` keeps routing.
"${SSH[@]}" "cd /opt/qupon/src/deploy/vps && echo QUPON_HOST=$HOST > .env && docker compose build registrar && docker compose build web && docker compose up -d --remove-orphans"

echo "== health"
for i in $(seq 1 30); do
  curl -fsS -m 10 "https://api.$HOST/healthz" >/dev/null 2>&1 && curl -fsS -m 20 -o /dev/null "https://qupon.$HOST/" && break
  sleep 10
done
# Final check fails the deploy (the loop above only waits): both the API and the console must answer.
curl -fsS -m 10 "https://api.$HOST/healthz" && curl -fsS -m 20 -o /dev/null "https://qupon.$HOST/" \
  || { echo "health check failed — ssh $TARGET 'cd /opt/qupon/src/deploy/vps && docker compose ps && docker compose logs --tail 50'" >&2; exit 1; }
echo
echo "console: https://qupon.$HOST   API: https://api.$HOST"
