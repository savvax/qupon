#!/usr/bin/env bash
# Mainnet deploy of qupon_bonds (docs/07-mainnet.md). DRY RUN BY DEFAULT: checks the keypair and the build and
# prints the plan and a rent estimate computed locally — it sends nothing and reads nothing from mainnet.
#   ops/deploy-mainnet.sh                 # dry run
#   ops/deploy-mainnet.sh --execute       # real deploy: needs MAINNET_RPC_URL, MAINNET_DEPLOYER_KEYPAIR,
#                                         # MAINNET_UPGRADE_AUTHORITY and typing the program id. Agents never run this.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$HOME/.cargo/bin:$PATH"
EXECUTE=0; [ "${1:-}" = "--execute" ] && EXECUTE=1
PKP="$HOME/.config/qupon/program-keypair.json"
SO=target/deploy/qupon_bonds.so

DECLARED=$(sed -n 's/^declare_id!("\(.*\)");/\1/p' programs/qupon_bonds/src/lib.rs)
CONFIG_ID=$(jq -r .programId config/mainnet-beta.json)
[ -f "$PKP" ] || { echo "missing $PKP (the QPN1zd… program keypair)" >&2; exit 1; }
[ "$(solana-keygen pubkey "$PKP")" = "$DECLARED" ] || { echo "program keypair does not match declare_id! ($DECLARED)" >&2; exit 1; }
[ "$CONFIG_ID" = "$DECLARED" ] || { echo "config/mainnet-beta.json programId ($CONFIG_ID) != declare_id! ($DECLARED)" >&2; exit 1; }
[ -f "$SO" ] || { echo "no $SO — run 'anchor build --verifiable' first (reproducible build for mainnet)" >&2; exit 1; }

SIZE=$(wc -c < "$SO" | tr -d ' ')
# Upgradeable programs reserve 2× the binary by default; rent-exempt minimum = (128 + bytes) × 3480 × 2 lamports.
PD_BYTES=$((45 + SIZE * 2))
LAMPORTS=$(( (128 + PD_BYTES) * 3480 * 2 + (128 + 36) * 3480 * 2 ))
BUFFER=$(( (128 + 37 + SIZE) * 3480 * 2 ))
SOL=$(awk -v l="$LAMPORTS" 'BEGIN { printf "%.3f", l / 1e9 }')
BUF_SOL=$(awk -v l="$BUFFER" 'BEGIN { printf "%.3f", l / 1e9 }')
cat <<PLAN
qupon_bonds mainnet deploy plan
  program id        $DECLARED (same vanity id as devnet)
  binary            $SO ($SIZE bytes)
  program data      $PD_BYTES bytes (2× for upgrades)
  rent estimate     ~$SOL SOL locked (+ ~$BUF_SOL SOL transient buffer during the deploy, refunded) + fees
  upgrade authority ${MAINNET_UPGRADE_AUTHORITY:-<set MAINNET_UPGRADE_AUTHORITY, ideally a Squads multisig vault>}
  after deploy      publish the IDL, verify the build (solana-verify), fill config/mainnet-beta.json wallets,
                    add the official KZTE mint in Admin → Cash assets, set NETWORK config on the mainnet instance
PLAN

if [ "$EXECUTE" != 1 ]; then echo "dry run: nothing sent. Re-run with --execute to deploy."; exit 0; fi

: "${MAINNET_RPC_URL:?set MAINNET_RPC_URL}" "${MAINNET_DEPLOYER_KEYPAIR:?set MAINNET_DEPLOYER_KEYPAIR}" "${MAINNET_UPGRADE_AUTHORITY:?set MAINNET_UPGRADE_AUTHORITY}"
read -r -p "Type the program id to deploy it to MAINNET with real SOL: " typed
[ "$typed" = "$DECLARED" ] || { echo "aborted"; exit 1; }
# The RPC URL may carry an API key: never echo it.
solana program deploy "$SO" --url "$MAINNET_RPC_URL" --keypair "$MAINNET_DEPLOYER_KEYPAIR" \
  --program-id "$PKP" --upgrade-authority "$MAINNET_DEPLOYER_KEYPAIR" --max-len $((SIZE * 2)) 2>&1 | sed -E 's#https?://[^ ]+#<rpc>#g'
solana program set-upgrade-authority "$DECLARED" --url "$MAINNET_RPC_URL" --keypair "$MAINNET_DEPLOYER_KEYPAIR" \
  --new-upgrade-authority "$MAINNET_UPGRADE_AUTHORITY" --skip-new-upgrade-authority-signer-check 2>&1 | sed -E 's#https?://[^ ]+#<rpc>#g'
echo "deployed: https://explorer.solana.com/address/$DECLARED"
