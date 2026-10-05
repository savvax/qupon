#!/usr/bin/env bash
# Deploy the program to devnet and propagate the program id (task 014 may extend this).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
[ -f .env ] && set -a && source .env && set +a
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
KP="${QUPON_REGISTRAR_KEYPAIR:-$HOME/.config/qupon/registrar.json}"
PKP="$HOME/.config/qupon/program-keypair.json"
mkdir -p target/deploy
# Never mint a new program id: a fresh keypair + `anchor keys sync` would rewrite declare_id! everywhere.
[ -f "$PKP" ] || { echo "missing $PKP — restore the QPN1zd… program keypair (see docs/04-stack.md); refusing to generate one" >&2; exit 1; }
DECLARED=$(sed -n 's/^declare_id!("\(.*\)");/\1/p' programs/qupon_bonds/src/lib.rs)
[ "$(solana-keygen pubkey "$PKP")" = "$DECLARED" ] || { echo "program keypair does not match declare_id! ($DECLARED)" >&2; exit 1; }
ln -sf "$PKP" target/deploy/qupon_bonds-keypair.json
anchor keys sync
anchor build
# --no-idl: the IDL goes up below with retries over RPC_URL (Anchor 1.2 deploy would write it once over public devnet and abort on failure)
anchor deploy --no-idl --provider.cluster devnet --provider.wallet "$KP"   # public devnet: anchor prints the URL (keyed RPC_URL would leak)
PID=$(solana-keygen pubkey "$PKP")
tmp=$(mktemp); jq --arg p "$PID" '.programId=$p' config/devnet.json > "$tmp" && mv "$tmp" config/devnet.json
# Publish the IDL (Program Metadata Program). Right after an upgrade the write can fail transiently — retry.
publish_idl() {
  anchor idl upgrade --provider.cluster "${RPC_URL:-devnet}" --provider.wallet "$KP" --filepath target/idl/qupon_bonds.json "$PID" ||
    anchor idl init --provider.cluster "${RPC_URL:-devnet}" --provider.wallet "$KP" --filepath target/idl/qupon_bonds.json "$PID"
}
ok=0; for i in 1 2 3 4; do publish_idl && { ok=1; break; }; echo "IDL publish attempt $i failed; retrying" >&2; sleep $((i * 15)); done
[ "$ok" = 1 ] || { echo "error: failed to publish IDL for $PID" >&2; exit 1; }
# Verify the IDL is actually fetchable on devnet (acceptance criterion of task 014).
if ! anchor idl fetch --provider.cluster "${RPC_URL:-devnet}" "$PID" >/dev/null; then
  echo "error: IDL for $PID is not fetchable on devnet" >&2; exit 1
fi
echo "deployed: https://explorer.solana.com/address/$PID?cluster=devnet"
