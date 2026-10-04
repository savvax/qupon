#!/usr/bin/env bash
# Toolchain check. Exit non-zero if the pinned major versions are missing.
set -uo pipefail
export PATH="$HOME/.local/share/mise/shims:$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$HOME/go/bin:/usr/local/go/bin:$PATH"
ok=0
v() { printf '  %-14s %s\n' "$1" "$2"; }
S=$(solana --version 2>/dev/null | awk '{print $2}'); v solana "${S:-MISSING}"; [[ "$S" == 4.3.* ]] || { echo "  !! need Agave 4.3.x"; ok=1; }
A=$(anchor --version 2>/dev/null | awk '{print $2}'); v anchor "${A:-MISSING}"; [[ "$A" == 1.2.* ]] || { echo "  !! need Anchor 1.2.x"; ok=1; }
v cargo "$(cargo --version 2>/dev/null | awk '{print $2}')"
v rustc "$(rustc --version 2>/dev/null | awk '{print $2}')"
N=$(node --version 2>/dev/null); v node "${N:-MISSING}"; [[ "$N" == v22* ]] || { echo "  !! need Node 22"; ok=1; }
v pnpm "$(pnpm --version 2>/dev/null || echo MISSING)"
G=$(go version 2>/dev/null | awk '{print $3}'); v go "${G:-MISSING}"; [[ "$G" == go1.25* ]] || { echo "  !! need Go 1.25"; ok=1; }
v pi "$(pi --version 2>/dev/null || echo MISSING)"
v surfpool "$(surfpool --version 2>/dev/null | head -1 || echo MISSING)"
v jq "$(jq --version 2>/dev/null || echo MISSING)"
v tmux "$(tmux -V 2>/dev/null || echo MISSING)"
v claude "$(claude --version 2>/dev/null || echo MISSING)"
v spl-token "$(spl-token --version 2>/dev/null | awk '{print $2}' || echo MISSING)"
v solana-verify "$(solana-verify --version 2>/dev/null | awk '{print $2}' || echo not-installed)"
[ -n "${ZAI_API_KEY:-}" ] && v ZAI_API_KEY set || v ZAI_API_KEY "NOT SET (pi workers need it)"
exit $ok
