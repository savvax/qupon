---
id: 91301
title: Re-thaw a registered investor's recreated bond account
agent: claude
tier: T2
depends_on: [1301]
verify: make verify
timeout_min: 45
---
## Goal
Found while reviewing 1301, not verified: an Active investor can close their empty bond ATA; anyone can recreate it, but DefaultAccountState makes it frozen, and the only thaw paths are `register_investor` (`init`, fails for an existing Investor) and `reinstate_investor` (needs status Suspended, and `suspend_investor` would first have to freeze an already frozen account). If that holds, the investor can never hold the bond again.

## Read first
- `programs/qupon_bonds/src/instructions/register_investor.rs` (`handle_set_investor_status`), `programs/qupon_bonds/tests/registry.rs`
- `programs/qupon_bonds/src/instructions/trade.rs` (`release_trade` already thaws the seller's account on a forced return)

## Steps
- Write the LiteSVM test first: register, close the empty bond ATA as the owner, recreate it, try to issue units. If it passes today, close this task with the test only.
- Otherwise add the smallest fix: `reinstate_investor` (or `suspend_investor`) must not fail on an account that is already in the target state, or a dedicated registrar instruction thaws the registered bond account of an Active investor. Update `docs/02-architecture.md`.

## Acceptance criteria
- The test above passes; a Suspended investor's account still stays frozen through every path.
- `make verify` green; `reports/worklog/91301.md` written.

## Out of scope
Anything else in the registry.
