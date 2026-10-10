# Compute-unit benchmarks — `qupon_bonds`

Generated on 2026-10-10 (UTC) by `QUPON_CU_REPORT=1 cargo test -p qupon_bonds --test cu_benchmarks` (`programs/qupon_bonds/tests/cu_benchmarks.rs`). Every number below comes from that run; do not edit by hand.

## Measurements

| Instruction | Holders | CU | CU per holder | Marginal CU per holder | Share of the 1.4M limit |
|---|---:|---:|---:|---:|---:|
| snapshot_batch | 1 | 16789 | 16789 | — | 1.2% |
| snapshot_batch | 4 | 62218 | 15554 | 15143 | 4.4% |
| snapshot_batch | 5 | 53861 | 10772 | -8357 | 3.8% |
| snapshot_batch | 8 | 81290 | 10161 | 9143 | 5.8% |
| pay_batch | 1 | 21945 | 21945 | — | 1.6% |
| pay_batch | 4 | 46884 | 11721 | 8313 | 3.3% |
| pay_batch | 5 | 55197 | 11039 | 8313 | 3.9% |
| pay_batch, worst case | 1 | 26087 | 26087 | — | 1.9% |
| pay_batch, worst case | 4 | 72983 | 18245 | 15632 | 5.2% |
| pay_batch, worst case | 5 | 81115 | 16223 | 8132 | 5.8% |
| retire_batch | 1 | 13214 | 13214 | — | 0.9% |
| retire_batch | 5 | 32030 | 6406 | 4704 | 2.3% |
| retire_batch | 12 | 47333 | 3944 | 2186 | 3.4% |
| retire_batch, worst case | 1 | 11714 | 11714 | — | 0.8% |
| retire_batch, worst case | 5 | 33530 | 6706 | 5454 | 2.4% |
| retire_batch, worst case | 12 | 50333 | 4194 | 2400 | 3.6% |
| strike_record | — | 12553 | — | — | 0.9% |
| finalize_snapshot | — | 15590 | — | — | 1.1% |
| fund_action | — | 16920 | — | — | 1.2% |
| complete_action | — | 18271 | — | — | 1.3% |
| admit_trade | — | 30079 | — | — | 2.1% |
| release_trade | — | 15789 | — | — | 1.1% |
| release_trade (force) | — | 21583 | — | — | 1.5% |

*CU per holder* is the whole transaction divided by the holders in it; *marginal* is the increase per added holder against the previous measured size of the same instruction.

## Batch constants and headroom

| Batch | Constant | CLI sends | Highest CU at the CLI size | Share of the CLI's 600k limit | Highest CU at the on-chain maximum | Share of the 1.4M limit | Holders that fit in 600k CU |
|---|---|---:|---:|---:|---:|---:|---:|
| `snapshot_batch` | `SNAPSHOT_BATCH_MAX = 8` | 8 | 81290 | 13.5% | 81290 | 5.8% | ~64 |
| `pay_batch` | `PAY_BATCH_MAX = 5` | 4 | 72983 | 12.2% | 81115 | 5.8% | ~42 |
| `retire_batch` | `RETIRE_BATCH_MAX = 12` | 12 | 50333 | 8.4% | 50333 | 3.6% | ~174 |

## Plan-15 instruction budgets

Every instruction added in plan 15 (task 91512), one measured scenario each. The budget is the reference figure × 1.25 rounded up to the next 1,000 CU, and the test asserts the measured transaction never exceeds it.

| Instruction | Scenario | CU | Budget | Share of the 1.4M limit |
|---|---|---:|---:|---:|
| set_payout_route | holder chooses the bank (PDA created, cheapest of 5) | 8169 | 13000 | 0.6% |
| pay_batch | 5 holders, wallet route | 71697 | 81000 | 5.1% |
| pay_batch | 5 holders, one bank-routed to the agent | 76049 | 97000 | 5.4% |
| pay_batch | 5 holders, redemption (pay + burn) | 87234 | 115000 | 6.2% |
| confirm_bank_payout | agent confirms the bank transfer | 11027 | 14000 | 0.8% |
| declare_default | unfunded coupon, one day past grace | 10623 | 14000 | 0.8% |
| attach_disclosure | registrar anchors the seev.031 hash | 7829 | 10000 | 0.6% |
| admit_trade | a month into the period (TradeAccrued) | 27104 | 59000 | 1.9% |
| snapshot_batch | hooked series, 5 positions | 84585 | 108000 | 6.0% |

"Highest" takes the worst-case row where one exists. "Holders that fit in 600k CU" extrapolates linearly from the 1-holder and the on-chain-maximum measurements. The test asserts that every measured transaction stays below 1,400,000 CU and that every batch at the size the CLI sends stays below the 600,000 CU limit the CLI sets. Where the extrapolated figure is above the constant, compute is not what bounds the batch: the account count and the 1232-byte transaction size are (docs/02-architecture.md, "Batch sizing").

## Method

- LiteSVM (in-process SVM) running the deployed program binary `target/deploy/qupon_bonds.so`, the devnet Token-2022 binary (`tests/fixtures/spl_token_2022.so`) for the bond leg and the devnet DvP binary for the trade instructions. One transaction per row: `SetComputeUnitLimit(1,400,000)` plus the measured instruction, registrar as fee payer; the figure is `compute_units_consumed` of the whole transaction.
- Plain rows: legacy SPL Token cash mint (as `setup_bond` creates), no withholding tax, 10 units per holder. The SPL Token program is the build LiteSVM bundles: p-token (pinocchio), not a devnet dump; a cluster still on the older SPL Token build pays more per SPL cash transfer than measured here.
- `pay_batch, worst case`: Token-2022 cash mint without extensions (tKZT-like) and 15% withholding tax, so each holder costs two Token-2022 transfers (net to the holder, tax to the vault).
- `retire_batch, worst case`: every holder suspended, so each frozen account is thawed before the burn.
- `snapshot_batch` creates one Entitlement per holder. The single calls come from the 4-holder coupon; `release_trade` re-freezes an empty escrow, the forced one first returns 10 units to the seller.
- Holders, mints and therefore PDAs are random keys, so the figures vary from run to run — `snapshot_batch` most, because it derives each Entitlement PDA on-chain (one bump search per holder).
- LiteSVM does not enforce the 1232-byte packet size: `pay_batch` with 5 holders is a compute figure only; on a cluster that batch needs a v0 transaction with an address lookup table, which is why the CLI sends 4.
- The plan-15 table measures `set_payout_route` for all five holders and keeps the cheapest: Anchor discovers the route PDA's bump on-chain, so one call costs ~1.5k CU more per search step and a single random-key draw is noise, not program cost. The `pay_batch` rows keep their single draw — the budget's headroom absorbs the spread.
