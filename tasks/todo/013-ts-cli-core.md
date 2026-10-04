---
id: 013
title: qupon CLI: series/investor/action commands for the INTR flow with auto-batching
agent: glm
tier: T0
depends_on: [008, 011, 006, 044, 045]
verify: make verify
timeout_min: 60
---
## Goal
The CLI is the hands of the system (the Go service shells out to it). Implement the commands for issuance and the coupon flow.

## Read first
- docs/02-architecture.md (TypeScript client and CLI)
- clients/ts/src/generated
- clients/ts/src/lib/pda.ts

## Steps
1. File ownership for parallel work: `src/cli.ts` only registers command groups from `src/commands/index.ts`; each group lives in its own file (`src/commands/series.ts`, `investor.ts`, `action.ts`, `state.ts`); later tasks add new files + one line in `index.ts`. Use `src/lib/daycount.ts` (task 044) and `src/lib/batch.ts`/`format.ts`/`explorer.ts` (task 045) — do not reimplement them. Commands: global options `--rpc`, `--keypair`, `--json`; `series:init` (reads series params from `config/devnet.json` by name), `investor:register`, `investor:suspend`, `subscribe`, `issue`, `action:announce` (civil dates/accrual days via `src/lib/daycount.ts`), `action:cancel`, `action:strike`, `action:snapshot` (lists Investor PDAs via `getProgramAccounts` filtered by discriminator + series, sorts by owner ascending, builds batches of 8, sends sequentially, idempotent), `action:finalize-snapshot`, `action:fund`, `action:pay` (batches of 10), `action:complete`, `state:dump` (all PDAs of a series → JSON), `explorer`.
2. Transaction helper with blockhash refresh, retry on `BlockhashNotFound`, `confirmed` commitment; prints `{ok:true, signature, slot}` JSON on success.
3. Vitest: daycount fixtures; batching logic (pure function) with 0, 7, 8, 9, 23 holders.

## Acceptance criteria
- [ ] `pnpm build` produces `dist/cli.js`; `node dist/cli.js --help` lists all commands; unit tests green.
- [ ] Manual devnet run of the INTR flow succeeds (task 016 automates it).

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/013.md`, then print exactly `DONE:013` or `BLOCKED:013 <reason>`.
