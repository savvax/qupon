#!/usr/bin/env bash
# Hide every throw-away demo series (task 91519): keep the mints listed in
# config/devnet.json (series.*.mint) and config/featured-series.txt, write every
# other on-chain series mint into config/hidden-series.txt (header preserved,
# sorted, unique). Already-hidden mints are kept, so the list never shrinks
# by accident. --dry-run prints the diff only.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; shift; fi
[ "$#" -eq 0 ] || { echo "usage: ops/hide-demo-series.sh [--dry-run]" >&2; exit 2; }

HIDDEN=config/hidden-series.txt
FEATURED=config/featured-series.txt
HEADER=$(grep -E '^\s*#' "$HIDDEN" 2>/dev/null || true)
mints_of() { grep -vE '^\s*(#|$)' "$1" 2>/dev/null || true; }

# Keep-set: configured + curated mints ('__none__' guard keeps grep -f well-defined).
KEEP=$( { jq -r '.series[].mint | select(. != "")' config/devnet.json; mints_of "$FEATURED"; } | sort -u )
KEEP=${KEEP:-__none__}

# On-chain mints from the CLI (JSON on stdout, logs on stderr).
LISTED=$(ops/qupon series:list --status all | jq -r '.series[].mint')

# New hidden list = (on-chain ∪ already hidden) − keep-set.
HIDDEN_MINTS=$(printf '%s\n%s\n' "$LISTED" "$(mints_of "$HIDDEN")" | grep -vE '^\s*$' | sort -u | grep -vxF -f <(printf '%s\n' "$KEEP") || true)

NEW_FILE=$(printf '%s\n\n%s\n' "$HEADER" "$HIDDEN_MINTS")
if [ "$DRY_RUN" -eq 1 ]; then
	echo "--dry-run: would rewrite $HIDDEN:" >&2
	diff -u "$HIDDEN" <(printf '%s\n' "$NEW_FILE") >&2 || true
	exit 0
fi
TMP=$(mktemp)
printf '%s\n' "$NEW_FILE" >"$TMP"
mv "$TMP" "$HIDDEN"
echo "wrote $HIDDEN ($(printf '%s' "$HIDDEN_MINTS" | grep -c . || true) mints hidden, keep-set: $(printf '%s\n' "$KEEP" | grep -c . || true))" >&2
