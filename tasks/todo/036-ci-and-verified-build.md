---
id: 036
title: CI green on GitHub; solana-verify build hash; IDL on PMP; config/devnet.json final
agent: glm
tier: T1
depends_on: [014, 035]
verify: make verify
timeout_min: 45
---
## Goal
Reproducibility for judges: CI badge, verifiable build, published IDL.

## Read first
- docs/04-stack.md (solana-verify)
- .github/workflows/ci.yml

## Steps
1. Make CI pass on a clean runner (cache cargo/pnpm; skip network targets); add badge to README.
2. `solana-verify build` (docker required) → record hash in README and `reports/verified-build.md`; `solana-verify verify-from-repo` instructions.
3. `anchor idl upgrade` so `anchor idl fetch <programId>` works; link to explorer's IDL tab.

## Acceptance criteria
- [ ] CI badge green on main; README has the build hash and IDL fetch command.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/036.md`, then print exactly `DONE:036` or `BLOCKED:036 <reason>`.
