#!/usr/bin/env bash
# Uptime watchdog (task 1541): checks PUBLIC_URL (web app), API_URL /healthz and
# /admin/system (RPC + operator balances from operators[].low), and RPC getHealth.
# Posts to Telegram if TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID are set, otherwise prints.
# Exit code 1 on any failure. Cron-able.
#
# Env: PUBLIC_URL (web app host), API_URL (registrar host, e.g. https://api.<host>),
#      ADMIN_TOKEN, RPC_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
# Never prints ADMIN_TOKEN or the keyed RPC_URL (label only).
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck disable=SC1091  # .env is untracked operator config
[ -f "$ROOT/.env" ] && set -a && source "$ROOT/.env" && set +a

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

RPC_URL="${RPC_URL:-https://api.devnet.solana.com}"
# Redacted RPC label: scheme + host only; never leak the api-key query string.
rpc_label="$(printf '%s' "$RPC_URL" | sed -E 's#^(https?://[^/?]+).*#\1#')"
url="${PUBLIC_URL:-}"
api="${API_URL:-}"
fail=0
notes=()

note() { notes+=("$1"); }
ok() { note "OK: $1"; }
fail_note() { note "FAIL: $1${2:+ — $2}"; fail=1; }

# "set"/"unset" for a secret, without ever expanding its value.
state() { if [ -n "${!1:-}" ]; then echo set; else echo unset; fi; }

# Fetch helper: prints response body, empty on error.
fetch() { curl -fsS --max-time 10 "$@" 2>/dev/null || true; }

if [ "$DRY_RUN" = 1 ]; then
  echo "dry-run — checks that would run (env: PUBLIC_URL=${url:-unset} API_URL=${api:-unset} RPC_URL=$rpc_label):"
  note "PUBLIC_URL ${url:-<unset, fails>} responds"
  note "$api/healthz returns ok"
  note "$api/admin/system with ADMIN_TOKEN (currently $(state ADMIN_TOKEN)) reports rpc ok and operators not low"
  note "RPC getHealth on $rpc_label"
  printf '%s\n' "${notes[@]}"
  exit 0
fi

# 1) Web app reachable
if [ -n "$url" ] && [ -n "$(fetch "$url")" ]; then
  ok "PUBLIC_URL $url responds"
else
  fail_note "PUBLIC_URL ${url:-unset} not reachable"
fi

# 2) Registrar liveness
if [ -n "$api" ] && fetch "$api/healthz" | grep -q "ok"; then
  ok "/healthz"
else
  fail_note "/healthz" "$([ -n "$api" ] || echo 'API_URL unset')"
fi

# 3) /admin/system: RPC ok + operator balances (operators[].low flags)
if [ -z "${ADMIN_TOKEN:-}" ]; then
  fail_note "/admin/system" "ADMIN_TOKEN unset"
elif [ -z "$api" ]; then
  fail_note "/admin/system" "API_URL unset"
else
  sys=$(fetch -H "Authorization: Bearer $ADMIN_TOKEN" "$api/admin/system")
  if [ -z "$sys" ]; then
    fail_note "/admin/system" "no response"
  elif ! printf '%s' "$sys" | grep -q '"rpc":{"ok":true'; then
    fail_note "/admin/system" "rpc not ok"
  elif printf '%s' "$sys" | grep -q '"operators":\[\]'; then
    fail_note "/admin/system" "no operators probed"
  else
    low_ops=$(printf '%s' "$sys" | grep -o '"name":"[^"]*","address":"[^"]*","sol":[0-9.e+-]*,"low":true' || true)
    if [ -n "$low_ops" ]; then
      fail_note "/admin/system low operators: $(printf '%s' "$low_ops" | sed -E 's/.*"name":"([^"]*)".*/\1/' | tr '\n' ' ')"
    else
      ok "/admin/system (operators funded)"
    fi
  fi
fi

# 4) RPC liveness
if fetch -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getHealth"}' "$RPC_URL" | grep -q '"result":"ok"'; then
  ok "RPC $rpc_label"
else
  fail_note "RPC $rpc_label"
fi

body="Qupon watchdog $(TZ=Asia/Almaty date '+%F %T %Z')
$(printf '%s\n' "${notes[@]}")"

if [ -n "${TELEGRAM_BOT_TOKEN:-}" ] && [ -n "${TELEGRAM_CHAT_ID:-}" ]; then
  if ! fetch -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/sendMessage" \
    -d chat_id="$TELEGRAM_CHAT_ID" --data-urlencode text="$body" >/dev/null; then
    echo "watchdog: telegram send failed" >&2
  fi
else
  printf '%s\n' "$body"
fi
exit "$fail"
