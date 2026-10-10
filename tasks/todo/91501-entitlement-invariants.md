---
id: 91501
title: randomized invariants for the entitlement crate (no new dependencies)
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
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

## Review feedback (round 1, 2026-10-10 12:26) — fix every blocking item first; your previous work is already committed on this branch

### Summary
This change adds tests only: 6 seeded xorshift invariant tests (10k iterations each, 0.04 s) and a worklog, with no new dependencies, and the commit message is correct. Five of the six properties match the task or test more than it asks: monotonicity is checked across periods, and the demo clock also checks floor_civil. One blocker remains: the Σ-gross drift test checks (h+1)/2 instead of the holders/2 the task specifies. That is one minor unit looser for odd holder counts, and for a single holder it fails to require exact equality. The proof in the comment ignores that the difference is an integer, and the tight bound ⌊h/2⌋ follows directly. The fix is one line plus corrected comment text.

### Blocking
- crates/entitlement/tests/invariants.rs:130 — The Σ-gross drift test checks a weaker bound than the task asks for. The task says Σ gross may differ from round(supply × per-unit) by at most holders/2 minor units and that the invariant must not be weakened. The test uses `bound = (h + 1) / 2`, which allows one extra minor unit whenever h is odd. With h = 1 it allows a drift of 1 even though Σ gross must equal round_total exactly. The proof in the comment on lines 95–102 treats both error intervals as closed, so it never uses the fact that the difference is an integer. Σe_i is in (−h/2, h/2] and δ is in (−½, ½], so Σgross − round_total = Σe_i − δ is an integer strictly inside (−(h+1)/2, (h+1)/2). That gives |·| ≤ ⌊h/2⌋, the bound the task states.
  **Fix:** Line 130: change `let bound = u128::from(h + 1) / 2;` to `let bound = u128::from(h) / 2;`. Rewrite the second bullet of the doc comment (lines 101–102) to say: 'comparing against round_half_up(supply·N, D) adds δ ∈ (−½, ½]; Σ gross − round_total = Σe_i − δ is an integer strictly inside (−(h+1)/2, (h+1)/2), hence |Σ gross − round_half_up(supply·N, D)| ≤ ⌊h/2⌋ ≤ holders/2 minor units.' Update the worklog line in reports/worklog/91501.md from '(h+1)/2' to '⌊h/2⌋'. If the tighter bound ever fails, do not loosen it: print BLOCKED:91501 with the counterexample, as the task says.

### Acceptance criteria not met
- Σ per-holder gross is within holders/2 of round(total units × per-unit), with the exact proved bound stated in a comment — The assertion uses (h+1)/2, which is looser than holders/2 for odd h. The proof ignores integrality, and the tight provable bound is ⌊h/2⌋. The extra `rounding_within_tolerance` check against the exact fraction is a useful addition.
