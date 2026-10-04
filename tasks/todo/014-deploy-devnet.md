---
id: 014
title: Deploy program to devnet; program id management; make deploy
agent: glm
tier: T0
depends_on: [005]
verify: make verify
timeout_min: 30
---
## Goal
Deploy the program to devnet and make the program id flow into every component.

## Read first
- docs/04-stack.md
- Anchor.toml
- config/devnet.json

## Steps
1. `ops/deploy.sh`: `anchor keys sync` (keeps `target/deploy/qupon_bonds-keypair.json` — add to .gitignore? NO: the program keypair must be kept by the human; store under `~/.config/qupon/program-keypair.json` and symlink), `anchor build`, `anchor deploy --provider.cluster devnet --provider.wallet $QUPON_REGISTRAR_KEYPAIR`, `anchor idl init`/`upgrade` to the Program Metadata Program, write `programId` to `config/devnet.json`, print explorer link.
2. Document SOL needed (~3–5 SOL for a program of this size) in HUMAN_TODO if the registrar wallet is short.
3. `make deploy` wired.

## Acceptance criteria
- [ ] Program visible at `https://explorer.solana.com/address/<programId>?cluster=devnet`; IDL fetchable with `anchor idl fetch`; `config/devnet.json.programId` set; `declare_id!` matches.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/014.md`, then print exactly `DONE:014` or `BLOCKED:014 <reason>`.
