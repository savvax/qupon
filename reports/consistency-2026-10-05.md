# Consistency check — 2026-10-05 10:45 Almaty (task 043, lead)

| # | Check | Result |
|---|---|---|
| 1 | IDL (`target/idl/qupon_bonds.json`) vs `docs/02-architecture.md`: every instruction name and every argument | ✅ 19/19 instructions, all args present |
| 2 | Counts in README / TECHNICAL_OVERVIEW vs IDL and test run | ✅ 19 instructions, 4 account types, 31 errors, 18 events; 50 program tests (49 LiteSVM + 1 unit, `make verify` log) |
| 3 | CLI commands and `make` targets named in README, TECHNICAL_OVERVIEW, 02, 04, SUBMISSION_FINAL | ✅ all exist (21 CLI commands registered) |
| 4 | Relative links and repo paths in those docs | ✅ none broken |
| 5 | Explorer links in README, TECHNICAL_OVERVIEW, `reports/demo-full.md`, `reports/demo-coupon.md` (checked via devnet RPC — explorer answers curl with 429) | ✅ 83 tx signatures confirmed without error; 5 addresses exist |
| 6 | Implemented-vs-simulated table (README) vs what `make demo` runs (`reports/demo-full.md` S0–S4) and the SUBMISSION_FINAL "anything else" text | ✅ consistent |
| 7 | REST list in 02 vs merged API (023 `/advance`, `ADVANCE_TOKEN`) | ⚠️ fixed in this commit (body `autofund`, bearer token) |

## Open before Gate 3 (re-run this check at the final sweep)
- README implemented-vs-simulated row "Multisig issuer approval (Squads), SAS KYC attestation — Optional T2; if not shipped, listed as roadmap": replace with the final state once 040/041 are decided.
- Deployed console/API URL (task 032) missing from README, SUBMISSION_FINAL ("Website") and TECHNICAL_OVERVIEW.
- 024 (scheduler) and 030 (console actions) are in progress; their README/02 mentions need the same check after merge.
