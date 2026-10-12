---
id: 1560
title: devnet crowd run — one bond, 1,000 holders, coupon + redemption, report + proof manifest
agent: glm
tier: T0
depends_on: []
verify: make verify
timeout_min: 240
---
## Goal
Prove Qupon at scale on devnet: one hooked DEMO-clock series with **1,000 KYC'd holders**, 200 secondary transfers right after the
record date, a coupon (INTR) paid to every record-date holder and a redemption (REDM, atomic pay + burn) that retires the whole
devnet run; we need ours today. **No program changes.** Speed matters: deadline today.

## Read first
- AGENTS.md
- clients/ts/scripts/demo-plan15.ts (series on the DEMO clock, step()/until() pattern, report sections)
- clients/ts/scripts/lib/proof.ts (proof manifest writer)
- clients/ts/src/commands/kyc.ts (`planAttest`), clients/ts/src/commands/investor.ts (`investor:register`, `issue`)
- clients/ts/src/lib/hook.ts (transfer-hook extra accounts), clients/ts/src/commands/trade.ts (hooked transfer usage)
- clients/ts/src/commands/action.ts (`sortedBatches`, `runBatches`, `splitPayBatch`, `ensureCashAtas` — snapshot/pay already batch over all holders)

## What to build
1. `clients/ts/scripts/demo-crowd.ts` + Makefile target `demo-crowd` (`N` env, default 1000; `RESUME=<run id>` env).
2. **Onboarding in-process** (no CLI process per holder — 3,000 spawns take hours). Build instructions with the Codama
   builders / existing helpers and send them yourself:
   - generate N keypairs, saved to `logs/crowd-<id>/holders.json` (logs/ is gitignored — never commit keys);
   - per holder: SAS attestation (KYC provider signs, SIMULATED provider) + `register_investor` (registrar signs) — pack as many
     holders per tx as fit in 1,232 bytes (measure with a unit test, ≥ 2);
   - allocation with **`issue_units`** (issuer signs, no cash leg) — several holders per tx; holders never need SOL or tKZT;
   - fee payer = registrar/issuer; 16–24 txs in flight; retry with backoff on 429 / blockhash expiry;
   - **idempotent**: skip a holder whose attestation / Investor PDA / issued units already exist, so `RESUME` continues a crashed run.
   - Units per holder: seeded 1–20; **holder #1 gets exactly 10** (the brief's example).
3. Series: `series:create --demo-day-secs <small>` with transfer hook (same as demo-plan15), 1,000 KZT face, 10% semi-annual,
   30E/360, tKZT. Announce INTR #1 only **after** onboarding finishes (record_at = now + ~120 s, payment shortly after).
4. **200 hooked transfers** between random holders right after record_at (snapshot-then-transfer, as the hook requires),
   in-process, holder keys sign, registrar pays fees. Pick one example pair for the report (seller paid on the record-date balance).
5. Crank steps through the existing CLI commands (one call each, they batch over all holders), outsider key where permissionless:
   `action:snapshot` → `action:finalize-snapshot` (Σ snapshotted == supply) → `action:fund` (issuer) → `action:pay` →
   `action:complete`; then REDM: announce → snapshot → finalize → fund → `action:pay` (pay + burn) → complete → `series:close`
   (supply 0). If a CLI command is too slow or breaks at 1,000 holders, fix it minimally in the CLI (no program change) and note it.
   - accounts (program, series, mint, cash mint, escrow);
   - per action: holders at record, supply at record, budget, holders paid, total paid, escrow left (must be 0 or dust ≤ 1 tiyn/holder), tx count;
   - holder #1: 10 bonds → coupon **500.00**, principal **10,000.00**, 10 bonds burned — tx links;
   - the transfer example pair; Σ snapshotted == supply for both actions (from the finalize event);
   - wall-clock and SOL spent per phase (onboarding, transfers, coupon, redemption) — lamport diffs of the payer keys;
   - representative explorer links (first and last tx of each phase), not all 3,000.
7. Proof manifest via `scripts/lib/proof.ts` → `reports/devnet-proof-crowd.json` (series, announce/finalize/pay samples/complete/close);
   `pnpm qupon proof:verify reports/devnet-proof-crowd.json` must print `ok: true`.
8. README: one bullet next to the existing demo bullets: "1,000-holder devnet run: coupon + redemption, every holder paid —
   [`reports/demo-crowd-1000.md`]". Nothing else in README.

## Budget and safety
- Devnet only. Before the run: abort if `~/.config/qupon/funder1.json` < 20 SOL; top up registrar/issuer/KYC provider from funder1
  only as needed. **Total spend ≤ 25 SOL** for N=1000; print the spend per phase.
- Run `N=20 make demo-crowd` first; only then N=1000. Commit only the N=1000 report and manifest.

## Acceptance
- [ ] Unit tests (vitest, no network) for: seeded unit distribution (holder #1 = 10, sum = supply), tx packing within 1,232 bytes, resume skip logic.
- [ ] `N=20` run green end to end (mention in worklog).
- [ ] `N=1000` run green: every holder of record paid for INTR #1 and REDM, supply 0 after close, Σ == supply in both finalize events, escrow left ≤ dust.
- [ ] `reports/demo-crowd-1000.md` + `reports/devnet-proof-crowd.json` committed; `proof:verify` ok.
- [ ] README bullet added.
- [ ] Open `/proof/<mint>` of the crowd series in the local web app (`pnpm --filter web dev`): note in the worklog whether it loads and
      verifies 1,000 holders and how long it takes. If it fails or takes > 30 s, do NOT fix it here — write a follow-up task
      `tasks/todo/91590-proof-page-1000-holders.md` (agent: glm) with the measured numbers.
- [ ] `make verify` green. Commit `feat(demo): 1,000-holder devnet run (task: 1560)`.
