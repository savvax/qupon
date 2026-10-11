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
#   FAKE_CLI_ASSETS comma-separated faucet allow-list (config testAssets mints): asset:faucet
#                   refuses anything else, like resolveTestAsset (devnet shakeout, task 91556)
# The argument checks below mirror the real CLI's validation (payoutRouteArgs, parseSide, …) so a
# registrar argv the real CLI would refuse fails in CI too (task 91556: every bug below shipped
# because the fake CLI accepted whatever it was given).
[ -n "$FAKE_CLI_LOG" ] && printf '%s\n' "$*" >>"$FAKE_CLI_LOG"
# the executor prepends --json, so the command is $1 or $2
cmd="$1"; [ "$1" = "--json" ] && cmd="$2"
if [ -n "$FAKE_CLI_FAIL" ] && { [ "$1" = "$FAKE_CLI_FAIL" ] || [ "$2" = "$FAKE_CLI_FAIL" ]; }; then
  printf 'qupon: simulated failure for %s\n' "$FAKE_CLI_FAIL" >&2
  exit 1
fi
# flag <name> → the token after it in the argv, or "" (boolean/absent): pure sh, no self-match
flag() {
  f="$1"; shift
  prev=""
  for x in "$@"; do
    if [ "$prev" = "$f" ]; then printf '%s\n' "$x"; return; fi
    prev="$x"
  done
}

# payout:route: only the bank route carries a bank reference (payoutRouteArgs)
if [ "$cmd" = "payout:route" ]; then
  route=$(flag --route "$@"); ref=$(flag --bank-ref "$@")
  if [ "$route" = "bank" ] && [ -z "$ref" ]; then
    printf 'qupon: --bank-ref is required for the bank route\n' >&2; exit 1
  fi
  if [ "$route" != "bank" ] && [ -n "$ref" ]; then
    printf 'qupon: --bank-ref only applies to the bank route\n' >&2; exit 1
  fi
fi
# trade:fund --side is the signing investor's side, never the asset (parseSide)
if [ "$cmd" = "trade:fund" ]; then
  side=$(flag --side "$@")
  if [ "$side" != "seller" ] && [ "$side" != "buyer" ]; then
    printf 'qupon: --side: expected seller or buyer, got %s\n' "$side" >&2; exit 1
  fi
fi
# sandbox:refuse sends from the holder's own keypair (the global --keypair option)
if [ "$cmd" = "sandbox:refuse" ]; then
  kp=$(flag --keypair "$@")
  if [ -z "$kp" ]; then
    printf 'qupon: --keypair <path> (the sending holder) is required\n' >&2; exit 1
  fi
fi
# payout:confirm-bank needs the holder and the transfer reference
if [ "$cmd" = "payout:confirm-bank" ]; then
  owner=$(flag --owner "$@"); ref=$(flag --reference "$@")
  if [ -z "$owner" ] || [ -z "$ref" ]; then
    printf 'qupon: --owner and --reference are required\n' >&2; exit 1
  fi
fi
# asset:faucet mints config testAssets only (resolveTestAsset)
if [ "$cmd" = "asset:faucet" ] && [ -n "$FAKE_CLI_ASSETS" ]; then
  mint=$(flag --mint "$@")
  case ",$FAKE_CLI_ASSETS," in
    *",$mint,"*) ;;
    *) printf "qupon: mint '%s' is not in config testAssets\n" "$mint" >&2; exit 1 ;;
  esac
fi
# investor:register resolves --series by name from its config ($QUPON_CONFIG, set by the executor)
# and refuses an unset mint, like the real CLI — the prod race task 91562 fixed: a concurrent config
# rewrite restored the placeholder mint "" mid-onboarding. Works for pretty and compact JSON.
if [ "$cmd" = "investor:register" ] && [ -n "$QUPON_CONFIG" ] && [ -f "$QUPON_CONFIG" ]; then
  name=$(flag --series "$@")
  mint=$(awk -v name="$name" '
    { buf = buf $0 }
    END {
      n = sprintf("\"%s\":", name)
      i = index(buf, n)
      if (i == 0) exit
      rest = substr(buf, i)
      end = index(rest, "}")
      m = index(rest, "\"mint\"")
      if (m == 0 || (end > 0 && m > end)) exit
      v = substr(rest, m)
      sub(/^"mint"[ \t]*:[ \t]*"/, "", v)
      sub(/".*/, "", v)
      print v
    }
  ' "$QUPON_CONFIG")
  if [ -z "$mint" ]; then
    printf 'qupon: series.%s.mint is not set in %s\n' "$name" "$QUPON_CONFIG" >&2
    exit 1
  fi
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
