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
ln -sf "$PKP" target/deploy/qupon_bonds-keypair.json
anchor keys sync
anchor build
anchor deploy --provider.cluster devnet --provider.wallet "$KP"
PID=$(solana-keygen pubkey "$PKP")
tmp=$(mktemp); jq --arg p "$PID" '.programId=$p' config/devnet.json > "$tmp" && mv "$tmp" config/devnet.json
if ! { anchor idl init --provider.cluster "${RPC_URL:-devnet}" --provider.wallet "$KP" --filepath target/idl/qupon_bonds.json "$PID" 2>/dev/null || \
  anchor idl upgrade --provider.cluster "${RPC_URL:-devnet}" --provider.wallet "$KP" --filepath target/idl/qupon_bonds.json "$PID"; }; then
  echo "error: failed to publish IDL for $PID" >&2; exit 1
fi
# Verify the IDL is actually fetchable on devnet (acceptance criterion of task 014).
if ! anchor idl fetch --provider.cluster "${RPC_URL:-devnet}" "$PID" >/dev/null; then
  echo "error: IDL for $PID is not fetchable on devnet" >&2; exit 1
fi
echo "deployed: https://explorer.solana.com/address/$PID?cluster=devnet"
