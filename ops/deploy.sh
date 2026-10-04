#!/usr/bin/env bash
# Deploy the program to devnet and propagate the program id (task 014 may extend this).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
[ -f .env ] && set -a && source .env && set +a
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
KP="${QUPON_REGISTRAR_KEYPAIR:-$HOME/.config/qupon/registrar.json}"
PKP="$HOME/.config/qupon/program-keypair.json"
mkdir -p target/deploy
if [ ! -f "$PKP" ]; then solana-keygen new --no-bip39-passphrase -s -o "$PKP" >/dev/null; fi
cp "$PKP" target/deploy/qupon_bonds-keypair.json
anchor keys sync
anchor build
anchor deploy --provider.cluster devnet --provider.wallet "$KP"
PID=$(solana-keygen pubkey "$PKP")
tmp=$(mktemp); jq --arg p "$PID" '.programId=$p' config/devnet.json > "$tmp" && mv "$tmp" config/devnet.json
anchor idl init --provider.cluster devnet --provider.wallet "$KP" --filepath target/idl/qupon_bonds.json "$PID" 2>/dev/null || \
anchor idl upgrade --provider.cluster devnet --provider.wallet "$KP" --filepath target/idl/qupon_bonds.json "$PID" || true
echo "deployed: https://explorer.solana.com/address/$PID?cluster=devnet"
