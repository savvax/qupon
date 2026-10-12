#!/usr/bin/env bash
# One command for the whole product on devnet: Go registrar API (one-click demo sign-in) + web app wired to it.
# Needs .env and the devnet keypairs (docs/guides/SETUP.en.md). Ctrl-C stops both. MOCK=1 = web on fixtures, no keys.
# API_PORT / WEB_PORT change the ports; API_RPC_URL=https://api.devnet.solana.com bypasses a rate-limited RPC_URL.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/mise/shims:$HOME/.cargo/bin:$HOME/go/bin:$PATH" # same toolchain as the Makefile
API_PORT=${API_PORT:-8080}
WEB_PORT=${WEB_PORT:-3000}
[ -d node_modules ] || pnpm install --frozen-lockfile
trap 'kill 0' EXIT
if [ "${MOCK:-0}" = 1 ]; then
  echo "== web (mock API) → http://localhost:$WEB_PORT"
  cd apps/web && API_MOCKING=enabled NEXT_PUBLIC_API_MOCKING=enabled exec pnpm dev -p "$WEB_PORT"
fi
[ -f .env ] || { echo "no .env: cp .env.example .env && bash ops/wallets.sh (or MOCK=1 $0)"; exit 1; }
mkdir -p .data
echo "== registrar → http://localhost:$API_PORT   web → http://localhost:$WEB_PORT"
HIDE_SERIES="$(grep -vE '^[[:space:]]*(#|$)' config/hidden-series.txt | paste -sd, -)" \
  SCHEDULER=${SCHEDULER:-1} AUTOFUND=${AUTOFUND:-1} RPC_GPA_CACHE_TTL=${RPC_GPA_CACHE_TTL:-10s} PUBLIC_URL="http://localhost:$WEB_PORT" \
  RPC_GATEWAY=${RPC_GATEWAY:-1} DEMO_LOGIN=${DEMO_LOGIN:-1} PORT=$API_PORT DATA_DIR="$PWD/.data" DB_PATH="$PWD/.data/registrar.db" \
  EXEC_CONFIG_PATH="$PWD/.data/exec-config.json" make -s api &
(cd apps/web && API_MOCKING=disabled NEXT_PUBLIC_API_MOCKING=disabled \
  NEXT_PUBLIC_API_URL="http://localhost:$API_PORT" API_INTERNAL_URL="http://localhost:$API_PORT" \
  pnpm dev -p "$WEB_PORT") &
wait
