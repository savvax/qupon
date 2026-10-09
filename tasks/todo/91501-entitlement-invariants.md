---
id: 91501
title: randomized invariants for the entitlement crate (no new dependencies)
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 120
---
## Goal
Fixtures prove specific numbers; invariants prove the math holds for every input. Add deterministic randomized tests.

## Read first
- crates/entitlement/src/*.rs (per-holder half-up rounding, tax, `accrued_signed`, day counts, CivilClock)
- docs/03-domain.md §2 (rounding rules)

## Do
- `crates/entitlement/tests/invariants.rs` with a tiny xorshift PRNG (seeded, no `rand`/`proptest` dependency), 10,000
  iterations per property:
  - per holder `net + tax == gross`, `tax == round_half_up(gross × tax_bps)`;
  - Σ per-holder gross differs from `round(total units × per-unit)` by at most `holders / 2` minor units (state the
    exact bound you prove in a comment);
  - `accrued_signed(start, settle) == −accrued_signed(settle, start)` and `days` likewise; `accrued(start, start) == 0`;
  - accrued is monotonic in settle date within one period; 30E/360 day count never exceeds 360 per year;
  - CivilClock demo: `civil(ts(d)) == d` for random dates and `day_secs` in 1..86399.
- If an invariant fails, do NOT weaken it: write `BLOCKED:91501 <counterexample>`.

## Acceptance
`cargo test -p entitlement` green in < 10 s; `make verify` green. Commit `test(entitlement): randomized invariants`
(`task: 91501`).

## Finish
Write `reports/worklog/91501.md` (3–6 lines), commit with `task: 91501`, print `DONE:91501` or `BLOCKED:91501 <reason>`.
