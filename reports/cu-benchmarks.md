# Compute-unit benchmarks — `qupon_bonds`

Generated on 2026-10-10 (UTC) by `QUPON_CU_REPORT=1 cargo test -p qupon_bonds --test cu_benchmarks` (`programs/qupon_bonds/tests/cu_benchmarks.rs`). Every number below comes from that run; do not edit by hand.

## Measurements

| Instruction | Scenario | Holders | CU | CU per holder | Marginal CU per holder | Share of the 1.4M limit |
|---|---|---:|---:|---:|---:|---:|
| admit_trade | legacy pause | — | 31579 | — | — | 2.3% |
| complete_action | legacy pause | — | 18271 | — | — | 1.3% |
| finalize_snapshot | legacy pause | — | 15590 | — | — | 1.1% |
| fund_action | legacy pause | — | 16920 | — | — | 1.2% |
| pay_batch | legacy pause | 1 | 20445 | 20445 | — | 1.5% |
| pay_batch | legacy pause | 4 | 51384 | 12846 | 10313 | 3.7% |
| pay_batch | legacy pause | 5 | 61197 | 12239 | 9813 | 4.4% |
| pay_batch, worst case | worst case (Token-2022 cash, 15% tax) | 1 | 27587 | 27587 | — | 2.0% |
| pay_batch, worst case | worst case (Token-2022 cash, 15% tax) | 4 | 69983 | 17495 | 14132 | 5.0% |
| pay_batch, worst case | worst case (Token-2022 cash, 15% tax) | 5 | 79634 | 15926 | 9651 | 5.7% |
| release_trade | legacy pause | — | 17289 | — | — | 1.2% |
| release_trade (force) | legacy pause | — | 21583 | — | — | 1.5% |
| retire_batch | legacy pause | 1 | 11714 | 11714 | — | 0.8% |
| retire_batch | legacy pause | 5 | 26030 | 5206 | 3579 | 1.9% |
| retire_batch | legacy pause | 12 | 74333 | 6194 | 6900 | 5.3% |
| retire_batch, worst case | worst case (suspended holders) | 1 | 13214 | 13214 | — | 0.9% |
| retire_batch, worst case | worst case (suspended holders) | 5 | 30530 | 6106 | 4329 | 2.2% |
| retire_batch, worst case | worst case (suspended holders) | 12 | 68333 | 5694 | 5400 | 4.9% |
| snapshot_batch | legacy pause | 1 | 16789 | 16789 | — | 1.2% |
| snapshot_batch | legacy pause | 4 | 42718 | 10679 | 8643 | 3.1% |
| snapshot_batch | legacy pause | 8 | 84290 | 10536 | 10393 | 6.0% |
| strike_record | legacy pause | — | 12553 | — | — | 0.9% |

*CU per holder* is the whole transaction divided by the holders in it; *marginal* is the increase per added holder against the previous measured size of the same instruction AND scenario (rows are grouped by instruction, then scenario, then holders ascending).

## Batch constants and headroom

| Batch | Constant | CLI sends | Highest CU at the CLI size | Share of the CLI's 600k limit | Highest CU at the on-chain maximum | Share of the 1.4M limit | Holders that fit in 600k CU |
|---|---|---:|---:|---:|---:|---:|---:|
| `snapshot_batch` | `SNAPSHOT_BATCH_MAX = 8` | 8 | 84290 | 14.0% | 84290 | 6.0% | ~61 |
| `pay_batch` | `PAY_BATCH_MAX = 5` | 4 | 69983 | 11.7% | 79634 | 5.7% | ~44 |
| `retire_batch` | `RETIRE_BATCH_MAX = 12` | 12 | 74333 | 12.4% | 74333 | 5.3% | ~106 |

## Plan-15 instruction budgets

Every instruction added in plan 15 (task 91512), one measured scenario each. The budget is the reference figure × 1.25 rounded up to the next 1,000 CU, and the test asserts the measured transaction never exceeds it.

| Instruction | Scenario | CU | Budget | Share of the 1.4M limit |
|---|---|---:|---:|---:|
| set_payout_route | holder chooses the bank (PDA created, cheapest of 5) | 8169 | 13000 | 0.6% |
| pay_batch | 5 holders, wallet route | 53697 | 81000 | 3.8% |
| pay_batch | 5 holders, one bank-routed to the agent | 70049 | 97000 | 5.0% |
| pay_batch | 5 holders, redemption (pay + burn) | 87234 | 115000 | 6.2% |
| confirm_bank_payout | agent confirms the bank transfer | 11027 | 14000 | 0.8% |
| declare_default | unfunded coupon, one day past grace | 10623 | 14000 | 0.8% |
| attach_disclosure | registrar anchors the seev.031 hash | 7829 | 10000 | 0.6% |
| admit_trade | a month into the period (TradeAccrued) | 43604 | 59000 | 3.1% |
| snapshot_batch | hooked series, 5 positions | 74085 | 108000 | 5.3% |

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
