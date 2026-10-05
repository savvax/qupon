#!/usr/bin/env bash
# One-shot toolchain install for Linux (Debian/Ubuntu) and macOS. Idempotent. Re-run `bash ops/doctor.sh` after.
# Pins: Agave 4.3.0, Anchor 1.2.0 (otter-sec/anchor via avm), Node 22, pnpm 9, Go 1.25, pi (earendil-works), Surfpool.
set -euo pipefail
OS=$(uname -s)
say() { printf '\n==> %s\n' "$*"; }

say "system packages"
if [ "$OS" = "Linux" ] && command -v apt-get >/dev/null; then
  sudo apt-get update -y && sudo apt-get install -y build-essential pkg-config libssl-dev libudev-dev llvm libclang-dev protobuf-compiler curl git jq tmux xmllint 2>/dev/null || \
  sudo apt-get install -y build-essential pkg-config libssl-dev libudev-dev llvm libclang-dev protobuf-compiler curl git jq tmux libxml2-utils
elif [ "$OS" = "Darwin" ]; then
  command -v brew >/dev/null || { echo "install Homebrew first"; exit 1; }
  brew install jq tmux coreutils protobuf libxml2 2>/dev/null || true
fi

say "rust"
command -v cargo >/dev/null || curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
export PATH="$HOME/.cargo/bin:$PATH"; rustup update stable >/dev/null

say "agave 4.3.0"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
if ! solana --version 2>/dev/null | grep -q ' 4\.3\.'; then sh -c "$(curl -sSfL https://release.anza.xyz/v4.3.0/install)"; fi
solana config set -u devnet >/dev/null

say "anchor 1.2.0 via avm (otter-sec/anchor)"
if ! anchor --version 2>/dev/null | grep -q ' 1\.2\.'; then
  cargo install --git https://github.com/otter-sec/anchor avm --force
  avm install 1.2.0 && avm use 1.2.0
fi

say "spl-token CLI, solana-verify (optional)"
command -v spl-token >/dev/null || cargo install spl-token-cli --locked || true
command -v solana-verify >/dev/null || cargo install solana-verify --locked || true

say "mise pins (node 22, go 1.25, pnpm 9) if mise is present — avoids replacing a global node/go"
if command -v mise >/dev/null; then (cd "$(dirname "$0")/.." && mise trust -q mise.toml && mise install); export PATH="$HOME/.local/share/mise/shims:$PATH"; fi

say "node 22 + pnpm 9"
if ! node --version 2>/dev/null | grep -q '^v22'; then
  if [ "$OS" = "Darwin" ]; then brew install node@22 && brew link --overwrite node@22; else
    curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs; fi
fi
corepack enable >/dev/null 2>&1 || npm i -g corepack; corepack prepare pnpm@9 --activate

say "go 1.25"
if ! go version 2>/dev/null | grep -q 'go1\.25'; then
  if [ "$OS" = "Darwin" ]; then brew install go; else
    GOV=1.25.1; ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')
    curl -fsSL "https://go.dev/dl/go${GOV}.linux-${ARCH}.tar.gz" -o /tmp/go.tgz && sudo rm -rf /usr/local/go && sudo tar -C /usr/local -xzf /tmp/go.tgz
    export PATH="/usr/local/go/bin:$PATH"; fi
fi
go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@latest 2>/dev/null || go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest || true

say "surfpool"
command -v surfpool >/dev/null || curl --proto '=https' --tlsv1.2 -sSfL https://run.surfpool.run/ | bash || true

say "pi coding agent (earendil-works)"
command -v pi >/dev/null || npm install -g @earendil-works/pi-coding-agent

say "claude code"
command -v claude >/dev/null || npm install -g @anthropic-ai/claude-code
echo "Log in once: run 'claude' in this repo, accept workspace trust, then /login (Max subscription)."

say "PATH lines for your shell profile"
cat <<'P'
export PATH="$HOME/.cargo/bin:$HOME/.local/share/solana/install/active_release/bin:$HOME/go/bin:/usr/local/go/bin:$PATH"
P
say "done — now: cp .env.example .env && edit; bash ops/wallets.sh; bash ops/doctor.sh"
