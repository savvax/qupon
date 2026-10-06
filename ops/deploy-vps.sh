#!/usr/bin/env bash
# One command: deploy the registrar API + console to a VPS with Docker Compose and Caddy (automatic HTTPS).
#   ops/deploy-vps.sh [root@host]          (default root@85.192.29.7; QUPON_HOST overrides <ip-dashes>.sslip.io)
#   REINDEX=1 ops/deploy-vps.sh            restart the registrar only, so it indexes series made by `make demo-seed`
# The server needs docker + docker compose. Secrets go over ssh stdin into /opt/qupon/*.env (mode 600) — never
# into git, argv or logs: RPC_URL (keyed devnet RPC), QUPON_USERS (back-office accounts, optional) and the devnet
# operator keypairs the executor signs with (registrar, issuer, paying agent, KYC provider, demo investor).
# DEMO_LOGIN=1 enables demo sign-in.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
TARGET="${1:-${VPS_TARGET:-root@85.192.29.7}}"
IP="${TARGET#*@}"
HOST="${QUPON_HOST:-${IP//./-}.sslip.io}"
[ -f .env ] && set -a && source .env && set +a
: "${RPC_URL:?RPC_URL (keyed devnet RPC) missing in .env}"
SSH=(ssh -o BatchMode=yes "$TARGET")

if [ "${REINDEX:-}" = 1 ]; then
  # New series created outside the app (make demo-seed): the registrar indexes every Series account at startup.
  "${SSH[@]}" 'cd /opt/qupon/src/deploy/vps && docker compose restart registrar'
  curl -fsS -m 30 --retry 10 --retry-delay 3 --retry-all-errors "https://api.$HOST/healthz" >/dev/null && echo "registrar re-indexed"
  exit 0
fi

echo "== source → $TARGET:/opt/qupon/src"
"${SSH[@]}" 'mkdir -p /opt/qupon/src'
rsync -az --delete \
  --exclude .git --exclude node_modules --exclude target --exclude .next --exclude logs \
  --exclude .env --exclude .worktrees --exclude .playwright-mcp \
  ./ "$TARGET:/opt/qupon/src/"

echo "== secrets (server-side only)"
kp() { tr -d ' \n' < "$1"; }
{
  echo "RPC_URL=$RPC_URL"
  echo "DEMO_LOGIN=1"
  # absolute links the API hands out: admin password-reset links, organisation invites (platform v2)
  echo "PUBLIC_URL=https://qupon.$HOST"
  [ -z "${QUPON_USERS:-}" ] || echo "QUPON_USERS=$QUPON_USERS"
  echo "QUPON_REGISTRAR_KEYPAIR_JSON=$(kp "$QUPON_REGISTRAR_KEYPAIR")"
  echo "QUPON_ISSUER_KEYPAIR_JSON=$(kp "$QUPON_ISSUER_KEYPAIR")"
  echo "QUPON_PAYING_AGENT_KEYPAIR_JSON=$(kp "$QUPON_PAYING_AGENT_KEYPAIR")"
  # KYC provider signs SAS attestations; investor3 is the demo investor's custodial wallet (POST /demo/investor/*).
  echo "QUPON_KYC_PROVIDER_KEYPAIR_JSON=$(kp "${QUPON_KYC_PROVIDER_KEYPAIR:-$HOME/.config/qupon/kyc-provider.json}")"
  echo "QUPON_INVESTOR_KEYPAIR_JSON=$(kp "${QUPON_INVESTOR_KEYPAIR:-$HOME/.config/qupon/investor3.json}")"
} | "${SSH[@]}" 'umask 077; cat > /opt/qupon/registrar.env'
"${SSH[@]}" 'umask 077; : > /opt/qupon/web.env' # nothing secret for the web yet; kept for compose's env_file

echo "== build (one image at a time: 1 vCPU) and start"
# Hidden series now live in series_settings (imported once by the registrar at startup, task 600);
# admins manage them from /admin/series. QUPON_HOST persists next to compose.yml (excluded from
# rsync --delete), so a manual `docker compose up` keeps routing.
"${SSH[@]}" "cd /opt/qupon/src/deploy/vps && printf \"QUPON_HOST=%s\\n\" $HOST > .env && docker compose build registrar && docker compose build web && docker compose up -d --remove-orphans"

echo "== health"
for _ in $(seq 1 30); do
  curl -fsS -m 10 "https://api.$HOST/healthz" >/dev/null 2>&1 && curl -fsS -m 20 -o /dev/null "https://qupon.$HOST/" && break
  sleep 10
done
# Final check fails the deploy (the loop above only waits): both the API and the console must answer.
curl -fsS -m 10 "https://api.$HOST/healthz" && curl -fsS -m 20 -o /dev/null "https://qupon.$HOST/" \
  || { echo "health check failed — ssh $TARGET 'cd /opt/qupon/src/deploy/vps && docker compose ps && docker compose logs --tail 50'" >&2; exit 1; }
echo
echo "console: https://qupon.$HOST   API: https://api.$HOST"
