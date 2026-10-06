# 07 — Mainnet readiness

Qupon runs on devnet. The same build is mainnet-ready: one registrar instance serves one network, chosen by its
base config (`QUPON_CONFIG=config/mainnet-beta.json`). Nothing is deployed to mainnet until a person completes the
checklist below and runs the deploy script with `--execute`.

## What changes on mainnet (enforced in code)
| Guard rail | Where |
|---|---|
| Red "Mainnet" badge on every page | `NetworkBadge` (web) from `GET /network` |
| Demo sign-in and demo writes refused (`403 demo_disabled`), demo panel hidden | `mainnetGuard` (Go), login page |
| Every issuer/registrar/admin write needs a typed confirmation ("mainnet") → header `X-Confirm-Network: mainnet-beta`, else `428 confirmation_required` | `useRunWrite` + `MainnetConfirm` (web), `mainnetGuard` (Go) |
| Explorer links without `?cluster=devnet` | `network.ExplorerURL` (Go), `explorerHref` (web) |
| Cash assets only by verified mint address; KZTE ships disabled until its official mint is added | `config/mainnet-beta.json`, Admin → Cash assets |

## Launch checklist (Admin → Network shows the same list and live checks)
1. Licensing: issue under an AIFC/AFSA licence or the National Bank's digital-asset sandbox; registrar and paying-agent agreements.
2. Reproducible build: `anchor build --verifiable`, then `solana-verify` against the repository.
3. Upgrade authority on a Squads multisig, not a single key (`MAINNET_UPGRADE_AUTHORITY`).
4. Operator keys (registrar, issuer, paying agent) in an HSM/KMS; fill `wallets` in `config/mainnet-beta.json` with their public keys.
5. Funding: ≈ 7.4 SOL locked for program rent (2× binary for upgrades) + ≈ 3.7 SOL transient buffer + operator SOL for fees; paying-agent float in the cash asset.
6. KZTE: take the Evo mint address from Intebix / Eurasian Bank, add it in Admin → Cash assets, check decimals and authorities, enable it.
7. A mainnet RPC provider with an SLA; keyed URLs stay server-side.
8. A real KYC provider in place of the SIMULATED review.
9. Monitoring: failed actions, low operator balances, RPC errors; registrar database backups.

## Deploy
```bash
ops/deploy-mainnet.sh            # dry run: checks keypair/config/build, prints the plan and a local rent estimate
MAINNET_RPC_URL=… MAINNET_DEPLOYER_KEYPAIR=… MAINNET_UPGRADE_AUTHORITY=<squads vault> ops/deploy-mainnet.sh --execute
```
The script never prints the RPC URL and asks to type the program id before sending anything.
