---
id: 91553
title: showcase on a judging-length demo clock (1 civil day = 1 hour)
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
---
## Goal
The curated showcase (task 1535 definitions, seeded by `make seed-showcase`, task 91542) runs at 1 civil day = 4 s: a
1-year bond passes maturity 24 minutes after seeding, so judges arriving on Oct 12–13 see four redeemed bonds. Slow the
showcase clock to 1 civil day = 3600 s (a 1-year bond lives ~15 real days; the semi-annual coupon falls ~7.5 days after
issue) and make the seeding put each series in its scenario state *now*, without waiting for derived record dates.

## Read first
- services/registrar/internal/api/showcase.go (+ test; the Go table is the single source), config/showcase.json (exported
  from it), clients/ts/scripts/seed-showcase.ts (+ its plan test), clients/ts/src/commands/action.ts (on a demo-clock
  series `action:announce` derives record = period end − 1 series-day when no `--record-at` is given — with 1 h days that
  is ~7 real days away), reports/showcase.md, docs/02-architecture.md (demo clock, default due = one series day).

## Do
- Showcase table: `DaySecs: 3600` for all four series; re-export `config/showcase.json` (`EXPORT_SHOWCASE=1` Go test) and
  update any test that pinned 4.
- seed-showcase: pass explicit near-term timestamps so each state is reached within minutes (`--record-at +60`,
  `--payment-at +120` style, or absolute unix seconds): coupon → first coupon paid now; redemption → redeemed and closed
  now; meeting → voting open with two votes cast and `--voting-ends-at` ~3 real days ahead; early call → MCAL announced
  with record/payment ~1 real day ahead (the autopilot will then complete it). The program only requires
  now < record ≤ payment, so paying the first coupon before its period end is allowed.
- Keep the dry-run plan test green and extend it to assert the explicit timestamps.
- Do NOT run it against devnet (the lead re-seeds and hides the old showcase in 1540).

## Acceptance
Go + TS tests green; `config/showcase.json` shows daySecs 3600; `make verify` green.
Commit `feat(demo): showcase on a judging-length demo clock` (`task: 91553`).

## Finish
Write `reports/worklog/91553.md` (3–6 lines), commit with `task: 91553`, print `DONE:91553` or `BLOCKED:91553 <reason>`.
