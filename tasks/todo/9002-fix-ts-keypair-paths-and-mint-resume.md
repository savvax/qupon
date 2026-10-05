---
id: 9002
title: TS keypair paths expand $HOME/~; create-bond-mint can resume; wallets.sh bash guard
agent: flash
tier: T1
depends_on: [002, 006]
verify: make verify
timeout_min: 25
---
## Goal
`.env` keypair paths are `$HOME/.config/qupon/*.json`; `process.loadEnvFile` does not expand variables, so every TS script fails to read keypairs.

## Steps
1. `clients/ts/src/lib/keys.ts` `loadKeypair(path)`: expand a leading `$HOME` or `~` with `os.homedir()`; vitest for both forms.
2. `clients/ts/scripts/create-bond-mint.ts`: if the saved mint keypair's address already exists on-chain, skip the create transaction and only run the metadata field writes; write `config.mint` right after the first transaction.
3. `ops/wallets.sh`: add `[ "${BASH_VERSINFO[0]}" -ge 4 ] || { echo "needs bash >= 4 (brew install bash)"; exit 1; }` at the top.

## Acceptance criteria
- [ ] Tests pass; `make verify` green. Do not run anything against devnet.
