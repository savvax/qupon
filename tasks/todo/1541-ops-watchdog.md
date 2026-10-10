---
id: 1541
title: uptime watchdog
agent: flash
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1541 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1541: uptime watchdog

**Agent:** flash · **Depends on:** —

`ops/watchdog.sh` (cron-able): checks `PUBLIC_URL`, `/healthz`, `/admin/system` RPC/operator balances (token from env), posts to Telegram if `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` are set, otherwise prints; exits non-zero on failure; README line in `deploy/vps/README.md`. **Acceptance:** `bash ops/watchdog.sh --dry-run` prints the checks; shellcheck clean.

## Finish
`make verify` green, commits carry `task: 1541`, `reports/worklog/1541.md` written. Print `DONE:1541` or `BLOCKED:1541 <reason>`.

## Review feedback (round 1, 2026-10-10 10:17) — fix every blocking item first; your previous work is already committed on this branch

### Summary
The structure is fine (cron-able, Telegram or print, exit code, README), but it can't merge. The dry-run prints ADMIN_TOKEN because `${ADMIN_TOKEN:-unset}` expands to the token itself. The keyed Helius RPC_URL goes into every log line and Telegram message. /healthz and /admin/system are fetched from PUBLIC_URL, but the VPS Caddyfile serves the web app and the API on separate hosts, so the watchdog would alarm on every run. Operator balances skip the `low` flags from /admin/system. Each fix is a few lines.

### Blocking
- ops/watchdog.sh:31 — Dry-run prints the admin session token. `${ADMIN_TOKEN:+set}${ADMIN_TOKEN:-unset}` expands to `set<token>` when ADMIN_TOKEN is set, and the script sources `.env`, so `bash ops/watchdog.sh --dry-run` on the VPS writes the admin bearer token to the terminal or cron log. The worklog's claim that the watchdog never logs ADMIN_TOKEN is wrong. Line 33 has the same bug for OPERATOR_PUBKEY (a public key, so only cosmetic there).
  **Fix:** Compute the state separately: `tok=unset; [ -n "${ADMIN_TOKEN:-}" ] && tok=set` and print `(currently $tok)`. Do the same for OPERATOR_PUBKEY. Never expand the token value anywhere in output.
- ops/watchdog.sh:66 — The keyed RPC URL leaks to stdout and Telegram. In production RPC_URL is `https://devnet.helius-rpc.com/?api-key=…` (docs/04-stack.md:17,56). The script prints `$RPC_URL` in the dry-run header (line 28) and in both live notes (`OK: RPC $RPC_URL` / `FAIL: RPC $RPC_URL`, lines 66/68). Those notes go into the Telegram message body and the cron log. The registrar spec says the RPC probe never prints the RPC URL; the script breaks that rule.
  **Fix:** Derive a redacted label once: `rpc_label=$(printf '%s' "$RPC_URL" | sed -E 's#^(https?://[^/?]+).*#\1#')`. Use `$rpc_label` in place of `$RPC_URL` on lines 28, 66 and 68. Keep the raw `$RPC_URL` only as the curl argument.
- ops/watchdog.sh:46 — In the real deployment one check always fails, so every run alarms. deploy/vps/Caddyfile serves the web app on `qupon.$QUPON_HOST` and the registrar on `api.$QUPON_HOST`. The script sends PUBLIC_URL, `$PUBLIC_URL/healthz` and `$PUBLIC_URL/admin/system` to the same host. The web app has no /healthz route, and the registrar has no `/` route. Either value of PUBLIC_URL makes the watchdog exit 1 forever.
  **Fix:** Add `API_URL` (the registrar base, e.g. `https://api.<host>`). Use PUBLIC_URL only for check 1 (the web root). Use `$API_URL/healthz` and `$API_URL/admin/system` for checks 2 and 3, and fail with `API_URL unset` when it is empty. Add API_URL to the header comment, the dry-run lines and deploy/vps/README.md.
- ops/watchdog.sh:72 — The task says operator balances come from `/admin/system`. The script ignores the `operators[]` array that endpoint returns (registrar, issuer and paying agent, each with a `low` flag set below 0.5 SOL). Instead it checks one optional OPERATOR_PUBKEY for a balance above 0 lamports. An operator down to 1 lamport passes, and the issuer and paying-agent wallets are never checked, so the watchdog misses the main failure mode it exists to catch.
  **Fix:** In check 3, keep the response body (`sys=$(fetch -H "Authorization: Bearer $ADMIN_TOKEN" "$API_URL/admin/system")`). Fail if the body lacks `"rpc":{"ok":true`, if it contains `"operators":[]`, or if it contains `"low":true`. Name the low operators, e.g. `grep -o '"name":"[^"]*","address":"[^"]*","sol":[0-9.e+-]*,"low":true'`. Drop the OPERATOR_PUBKEY getBalance block, or keep it as an extra check with a 0.5 SOL (500000000 lamport) threshold.

### Acceptance criteria not met
- `bash ops/watchdog.sh --dry-run` prints the checks — Not run: the sandbox denied Bash for shellcheck and script runs. Reading the code, the dry-run prints 5 check lines and exits 0. It also prints the raw ADMIN_TOKEN (line 31) and the keyed RPC_URL (line 28). A dry-run that leaks secrets fails the AGENTS.md no-secrets rule.
- Checks PUBLIC_URL, /healthz, /admin/system RPC/operator balances (token from env) — All three use the same base URL, but deploy/vps/Caddyfile puts web and API on separate hosts. Operator balances skip /admin/system `operators[].low` and use a single optional OPERATOR_PUBKEY with a > 0 threshold.
- No secrets / AGENTS.md non-negotiable 3 — ADMIN_TOKEN is echoed in dry-run. The Helius api-key URL goes to stdout and Telegram.
