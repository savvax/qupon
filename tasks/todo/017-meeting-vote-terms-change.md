---
id: 017
title: BMET: cast_vote (snapshot-weighted), finalize_meeting (quorum/approval), apply_terms_change (CHAN)
agent: claude
tier: T0
depends_on: [010]
verify: make verify
timeout_min: 60
---
## Goal
Required scenario 3: a bondholder meeting whose approved resolution changes the coupon rate on-chain.

## Read first
- docs/02-architecture.md (instructions 16–18)
- docs/03-domain.md (§1 meetings, §5)
- docs/01-product.md (S3)

## Steps
1. `cast_vote(choice)`: owner signer; action kind Meeting; status VotingOpen; `clock < voting_ends_at`; `Entitlement.vote == None` else `AlreadyVoted`; adds `units` to votes_for/against/abstain. Emit `VoteCast`.
2. `finalize_meeting`: registrar; `clock ≥ voting_ends_at` OR all snapshotted units voted; quorum = cast ≥ units_snapshotted × quorum_bps / 10000 → else NoQuorum; approval = for ≥ (for+against) × approval_bps / 10000 → Approved else Rejected; status Finalized. Emit `MeetingFinalized`.
3. `apply_terms_change`: registrar (SIMULATED regulator registration — comment + event field `regulator_registration: Simulated`); result Approved; sets `Series.coupon_rate_bps = proposal_new_rate_bps` and `maturity_date` if provided; metadata update_field `coupon_rate`; status Completed; clears open_action. Emit `TermsChanged{old_rate, new_rate}`.
4. Tests: 3 holders vote 10 For / 25 For / 65 Against → rejected (35 < 2/3 of 100); 65 For / 25 Against / 10 Abstain → approved; no quorum when only 10 units vote and quorum 5000; double vote rejected; vote after end rejected; after apply, announcing the next INTR yields per_unit_gross 6,000 (12%).

## Acceptance criteria
- [ ] Tests green; next-coupon-at-new-rate asserted (fixture `new_rate_after_vote`).

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/017.md`, then print exactly `DONE:017` or `BLOCKED:017 <reason>`.
