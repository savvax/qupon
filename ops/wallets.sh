#!/usr/bin/env bash
# Create devnet keypairs for the demo roles, airdrop SOL (best effort), write pubkeys into config/devnet.json.
set -uo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"; cd "$ROOT"
export PATH="$HOME/.local/share/solana/install/active_release/bin:$PATH"
D="$HOME/.config/qupon"; mkdir -p "$D"
roles=(registrar issuer paying-agent investor1 investor2 investor3 outsider)
for r in "${roles[@]}"; do
  [ -f "$D/$r.json" ] || solana-keygen new --no-bip39-passphrase -s -o "$D/$r.json" >/dev/null
done
solana config set -u devnet >/dev/null
declare -A PK
for r in "${roles[@]}"; do PK[$r]=$(solana-keygen pubkey "$D/$r.json"); printf '%-13s %s\n' "$r" "${PK[$r]}"; done
echo; echo "airdropping (devnet is rate-limited; use https://faucet.solana.com with GitHub login if this fails):"
for r in registrar issuer paying-agent investor1 investor2 investor3 outsider; do
  ok=0
  for i in 1 2 3; do solana airdrop 2 "${PK[$r]}" >/dev/null 2>&1 && { echo "  $r +2 SOL"; ok=1; break; } || sleep 5; done
  [ "$ok" = 1 ] || echo "  $r airdrop FAILED — get SOL at https://faucet.solana.com (GitHub login gives more) for: ${PK[$r]}"
done
tmp=$(mktemp)
jq --arg r "${PK[registrar]}" --arg i "${PK[issuer]}" --arg p "${PK[paying-agent]}" --arg a "${PK[investor1]}" --arg b "${PK[investor2]}" --arg c "${PK[investor3]}" --arg o "${PK[outsider]}" \
  '.wallets.registrar=$r | .wallets.issuer=$i | .wallets.payingAgent=$p | .wallets.investors=[$a,$b,$c] | .wallets.outsider=$o' config/devnet.json > "$tmp" && mv "$tmp" config/devnet.json
echo; echo "balances:"; for r in "${roles[@]}"; do printf '  %-13s %s\n' "$r" "$(solana balance "${PK[$r]}" 2>/dev/null)"; done
echo; echo "USDC devnet: send each investor/issuer address to https://faucet.circle.com (20 USDC per address / 2h)."
echo "Program deploy needs ~3–5 SOL on the registrar; the faucet with GitHub login gives more per request."
