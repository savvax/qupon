# Compute-unit benchmarks — `qupon_bonds`

Generated on 2026-10-10 (UTC) by `QUPON_CU_REPORT=1 cargo test -p qupon_bonds --test cu_benchmarks` (`programs/qupon_bonds/tests/cu_benchmarks.rs`). Every number below comes from that run; do not edit by hand.

## Measurements

| Instruction | Scenario | Holders | CU | CU per holder | Marginal CU per holder | Share of the 1.4M limit |
|---|---|---:|---:|---:|---:|---:|
| admit_trade | legacy pause | — | 27079 | — | — | 1.9% |
| complete_action | legacy pause | — | 18271 | — | — | 1.3% |
| finalize_snapshot | legacy pause | — | 15590 | — | — | 1.1% |
| fund_action | legacy pause | — | 16920 | — | — | 1.2% |
| pay_batch | legacy pause | 1 | 20445 | 20445 | — | 1.5% |
| pay_batch | legacy pause | 4 | 42384 | 10596 | 7313 | 3.0% |
| pay_batch | legacy pause | 5 | 50697 | 10139 | 8313 | 3.6% |
| pay_batch, worst case | worst case (Token-2022 cash, 15% tax) | 1 | 26087 | 26087 | — | 1.9% |
| pay_batch, worst case | worst case (Token-2022 cash, 15% tax) | 4 | 68483 | 17120 | 14132 | 4.9% |
| pay_batch, worst case | worst case (Token-2022 cash, 15% tax) | 5 | 78115 | 15623 | 9632 | 5.6% |
| release_trade | legacy pause | — | 15789 | — | — | 1.1% |
| release_trade (force) | legacy pause | — | 23083 | — | — | 1.6% |
| retire_batch | legacy pause | 1 | 11714 | 11714 | — | 0.8% |
| retire_batch | legacy pause | 5 | 30530 | 6106 | 4704 | 2.2% |
| retire_batch | legacy pause | 12 | 56333 | 4694 | 3686 | 4.0% |
| retire_batch, worst case | worst case (suspended holders) | 1 | 11714 | 11714 | — | 0.8% |
| retire_batch, worst case | worst case (suspended holders) | 5 | 26030 | 5206 | 3579 | 1.9% |
| retire_batch, worst case | worst case (suspended holders) | 12 | 50333 | 4194 | 3471 | 3.6% |
| snapshot_batch | legacy pause | 1 | 16789 | 16789 | — | 1.2% |
| snapshot_batch | legacy pause | 4 | 42718 | 10679 | 8643 | 3.1% |
| snapshot_batch | legacy pause | 5 | 50861 | 10172 | 8143 | 3.6% |
| snapshot_batch | legacy pause | 8 | 82790 | 10348 | 10643 | 5.9% |
| strike_record | legacy pause | — | 12553 | — | — | 0.9% |

*CU per holder* is the whole transaction divided by the holders in it; *marginal* is the increase per added holder against the previous measured size of the same instruction AND scenario (rows are grouped by instruction, then scenario, then holders ascending).

## Batch constants and headroom

| Batch | Constant | CLI sends | Highest CU at the CLI size | Share of the CLI's 600k limit | Highest CU at the on-chain maximum | Share of the 1.4M limit | Holders that fit in 600k CU |
|---|---|---:|---:|---:|---:|---:|---:|
| `snapshot_batch` | `SNAPSHOT_BATCH_MAX = 8` | 8 | 82790 | 13.8% | 82790 | 5.9% | ~62 |
| `pay_batch` | `PAY_BATCH_MAX = 5` | 4 | 68483 | 11.4% | 78115 | 5.6% | ~45 |
| `retire_batch` | `RETIRE_BATCH_MAX = 12` | 12 | 56333 | 9.4% | 56333 | 4.0% | ~146 |

## Plan-15 instruction budgets

Every instruction added in plan 15 (task 91512), one measured scenario each. The budget is the reference figure × 1.25 rounded up to the next 1,000 CU, and the test asserts the measured transaction never exceeds it.

| Instruction | Scenario | CU | Budget | Share of the 1.4M limit |
|---|---|---:|---:|---:|
| set_payout_route | holder chooses the bank (PDA created, cheapest of 5) | 8169 | 13000 | 0.6% |
| pay_batch | 5 holders, wallet route | 56697 | 81000 | 4.0% |
| pay_batch | 5 holders, one bank-routed to the agent | 61049 | 97000 | 4.4% |
| pay_batch | 5 holders, redemption (pay + burn) | 84234 | 115000 | 6.0% |
| confirm_bank_payout | agent confirms the bank transfer | 11027 | 14000 | 0.8% |
| declare_default | unfunded coupon, one day past grace | 10623 | 14000 | 0.8% |
| attach_disclosure | registrar anchors the seev.031 hash | 7829 | 10000 | 0.6% |
| admit_trade | a month into the period (TradeAccrued) | 33104 | 59000 | 2.4% |
| snapshot_batch | hooked series, 5 positions | 74085 | 108000 | 5.3% |

"Highest" takes the worst-case row where one exists. "Holders that fit in 600k CU" extrapolates linearly from the 1-holder and the on-chain-maximum measurements. The test asserts that every measured transaction stays below 1,400,000 CU and that every batch at the size the CLI sends stays below the 600,000 CU limit the CLI sets. Where the extrapolated figure is above the constant, compute is not what bounds the batch: the account count and the 1232-byte transaction size are (docs/02-architecture.md, "Batch sizing").

## Method

- LiteSVM (in-process SVM) running the deployed program binary `target/deploy/qupon_bonds.so`, the devnet Token-2022 binary (`tests/fixtures/spl_token_2022.so`) for the bond leg and the devnet DvP binary for the trade instructions. One transaction per row: `SetComputeUnitLimit(1,400,000)` plus the measured instruction, registrar as fee payer; the figure is `compute_units_consumed` of the whole transaction.
- Plain rows: legacy SPL Token cash mint (as `setup_bond` creates), no withholding tax, 10 units per holder. The SPL Token program is the build LiteSVM bundles: p-token (pinocchio), not a devnet dump; a cluster still on the older SPL Token build pays more per SPL cash transfer than measured here.
- `pay_batch, worst case`: Token-2022 cash mint without extensions (tKZT-like) and 15% withholding tax, so each holder costs two Token-2022 transfers (net to the holder, tax to the vault).
- `retire_batch, worst case`: every holder suspended, so each frozen account is thawed before the burn.
- Batch rows (snapshot, pay, retire) take the cheapest of 5 random-key draws per batch size, the same rule `set_payout_route` uses: one draw is key noise, not program cost.
         - `snapshot_batch` creates one Entitlement per holder. The single calls come from the 4-holder coupon; `release_trade` re-freezes an empty escrow, the forced one first returns 10 units to the seller.
- Holders, mints and therefore PDAs are random keys, so the figures vary from run to run — `snapshot_batch` most, because it derives each Entitlement PDA on-chain (one bump search per holder).
- LiteSVM does not enforce the 1232-byte packet size: `pay_batch` with 5 holders is a compute figure only; on a cluster that batch needs a v0 transaction with an address lookup table, which is why the CLI sends 4.
- The plan-15 table measures `set_payout_route` for all five holders and keeps the cheapest: Anchor discovers the route PDA's bump on-chain, so one call costs ~1.5k CU more per search step and a single random-key draw is noise, not program cost. Batch rows use the same cheapest-of-5 rule.
