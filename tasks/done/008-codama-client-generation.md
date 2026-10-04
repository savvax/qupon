---
id: 008
title: Codama pipeline: IDL → typed @solana/kit client in clients/ts/src/generated
agent: glm
tier: T0
depends_on: [005]
verify: make verify
timeout_min: 30
---
## Goal
Generate the TypeScript client from the Anchor IDL so the CLI, scripts and web app share typed instruction builders and account decoders.

## Read first
- docs/04-stack.md (Codama)
- clients/ts/package.json

## Steps
1. `clients/ts/codama.config.ts` (or `scripts/codama.ts`): `rootNodeFromAnchor(idl)` → `renderVisitor` from `@codama/renderers-js` into `src/generated`; add `pnpm codama` script and `make client`.
2. Commit the generated code (judges should see it builds without tools) and add a CI step that regenerates and `git diff --exit-code`s to catch drift.
3. Smoke test: decode a `Series` account from a fixture produced by the LiteSVM test (export base64 account data into `clients/ts/test/fixtures/series.b64` from a Rust test using `std::fs::write` behind an env flag).

## Acceptance criteria
- [ ] `pnpm codama && pnpm typecheck` green; `src/generated/accounts/series.ts` exists and decodes the fixture in `pnpm test`.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/008.md`, then print exactly `DONE:008` or `BLOCKED:008 <reason>`.
