#!/bin/sh
# Fake `qupon` CLI for tests: logs its argv, then replays a canned JSON
# contract. Behaviour driven by env vars:
#   FAKE_CLI_LOG     append every invocation's argv here
#   FAKE_CLI_STDOUT  print this file's contents on stdout (default: ok JSON)
#   FAKE_CLI_STDERR  print this file's contents on stderr
#   FAKE_CLI_EXIT    exit code (default 0)
#   FAKE_CLI_SLEEP   sleep this many seconds before replying (concurrency tests)
#   FAKE_CLI_FAIL   exit 1 (stderr) when the command equals this (per-command failure)
#   FAKE_CLI_STATE  dir: remember each kyc:attest's type/residency/tax-bps per owner and
#                   refuse investor:register whose attributes differ — the on-chain refusal
#                   register_investor gives (KycAttestationInvalid, 6031), so attest/register
#                   mismatches fail in CI instead of only on devnet (task 91540)
[ -n "$FAKE_CLI_LOG" ] && printf '%s\n' "$*" >>"$FAKE_CLI_LOG"
# the executor prepends --json, so the command is $1 or $2
cmd="$1"; [ "$1" = "--json" ] && cmd="$2"
if [ -n "$FAKE_CLI_FAIL" ] && { [ "$1" = "$FAKE_CLI_FAIL" ] || [ "$2" = "$FAKE_CLI_FAIL" ]; }; then
  printf 'qupon: simulated failure for %s\n' "$FAKE_CLI_FAIL" >&2
  exit 1
fi
if [ -n "$FAKE_CLI_STATE" ]; then
  case "$cmd" in
  kyc:attest)
    vals=$(printf '%s\n' "$@" | awk '$0=="--owner"{getline; o=$0} $0=="--type"{getline; t=$0} $0=="--residency"{getline; r=$0} $0=="--tax-bps"{getline; x=$0} END{printf "%s %s %s %s\n", o, t, r, x}')
    mkdir -p "$FAKE_CLI_STATE" && printf '%s\n' "$vals" >"$FAKE_CLI_STATE/${vals%% *}" || exit 1
    ;;
  investor:register)
    vals=$(printf '%s\n' "$@" | awk '$0=="--owner"{getline; o=$0} $0=="--type"{getline; t=$0} $0=="--residency"{getline; r=$0} $0=="--tax-bps"{getline; x=$0} END{printf "%s %s %s %s\n", o, t, r, x}')
    if [ "$(cat "$FAKE_CLI_STATE/${vals%% *}" 2>/dev/null)" != "$vals" ]; then
      printf 'qupon: simulated KycAttestationInvalid (6031): investor:register %s differs from the last kyc:attest for this owner\n' "${vals#* }" >&2
      exit 1
    fi
    ;;
  esac
fi
[ -n "$FAKE_CLI_SLEEP" ] && sleep "$FAKE_CLI_SLEEP"
[ -f "$FAKE_CLI_STDOUT" ] && cat "$FAKE_CLI_STDOUT"
[ -f "$FAKE_CLI_STDERR" ] && cat "$FAKE_CLI_STDERR" >&2
exit "${FAKE_CLI_EXIT:-0}"
