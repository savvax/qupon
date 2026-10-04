#!/usr/bin/env bash
# Claude Code Stop hook: block finishing while `make verify` is red (unless the agent reported BLOCKED).
IN=$(cat)
[ "${QUPON_WORKER:-0}" = "1" ] || exit 0   # gate applies to headless worker runs only
[ "$(printf '%s' "$IN" | jq -r '.stop_hook_active // false')" = "true" ] && exit 0
LAST=$(printf '%s' "$IN" | jq -r '.last_assistant_message // ""')
printf '%s' "$LAST" | grep -q 'BLOCKED:' && exit 0
CWD=$(printf '%s' "$IN" | jq -r '.cwd // "."'); cd "$CWD" || exit 0
[ -f Makefile ] || exit 0
if out=$(make verify 2>&1); then exit 0; fi
jq -n --arg r "make verify failed. Fix the root cause (never weaken tests), re-run make verify, then finish with DONE:<id>. If the failure is outside your task and not quick, finish with BLOCKED:<id> <reason>. Last 60 lines:
$(printf '%s' "$out" | tail -60)" '{decision:"block", reason:$r}'
