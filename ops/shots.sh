#!/usr/bin/env bash
# Screenshots of the given routes in mock mode: locales × 1440/390, full page PNG → <out>/<slug>-<locale>-<width>.png
# usage: bash ops/shots.sh <out-dir> /route [/route …]   (from a worktree or the repo root; E2E_PORT isolates servers)
# SHOT_LOCALES defaults to the locales the app ships (kk once task 1504 merged).
set -uo pipefail
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/bin:/opt/homebrew/bin:$PATH"
mkdir -p "$1"; OUT="$(cd "$1" && pwd)"; shift
ROOT="$(git rev-parse --show-toplevel)"
DEF="en ru"; grep -q '"kk"' "$ROOT/apps/web/src/i18n/request.ts" 2>/dev/null && DEF="en ru kk"
cd "$ROOT/apps/web" && SHOT_OUT="$OUT" SHOT_ROUTES="$*" SHOT_LOCALES="${SHOT_LOCALES:-$DEF}" \
  pnpm exec playwright test e2e/shots.spec.ts --reporter=line 2>&1 | tail -n 20
ls "$OUT" | head -n 80
