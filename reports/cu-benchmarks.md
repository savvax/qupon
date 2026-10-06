# Compute-unit benchmarks — `qupon_bonds`

Generated on 2026-10-06 (UTC) by `QUPON_WRITE_CU_REPORT=1 cargo test -p qupon_bonds --test cu_benchmarks` (`programs/qupon_bonds/tests/cu_benchmarks.rs`). Every number below comes from that run; do not edit by hand.

## Measurements

| Instruction | Holders | CU | CU per holder | Marginal CU per holder | Share of the 1.4M limit |
|---|---:|---:|---:|---:|---:|
| snapshot_batch | 1 | 19227 | 19227 | — | 1.4% |
| snapshot_batch | 5 | 60583 | 12116 | 10339 | 4.3% |
| snapshot_batch | 8 | 86725 | 10840 | 8714 | 6.2% |
| pay_batch | 1 | 14941 | 14941 | — | 1.1% |
| pay_batch | 5 | 33533 | 6706 | 4648 | 2.4% |
| pay_batch | 8 | 47477 | 5934 | 4648 | 3.4% |
| pay_batch | 10 | 56773 | 5677 | 4648 | 4.1% |
| pay_batch, worst case | 1 | 20774 | 20774 | — | 1.5% |
| pay_batch, worst case | 5 | 62642 | 12528 | 10467 | 4.5% |
| pay_batch, worst case | 8 | 94043 | 11755 | 10467 | 6.7% |
| pay_batch, worst case | 10 | 114977 | 11497 | 10467 | 8.2% |
| retire_batch | 1 | 15636 | 15636 | — | 1.1% |
| retire_batch | 5 | 44032 | 8806 | 7099 | 3.1% |
| retire_batch | 12 | 93725 | 7810 | 7099 | 6.7% |
| retire_batch, worst case | 1 | 19013 | 19013 | — | 1.4% |
| retire_batch, worst case | 5 | 60917 | 12183 | 10476 | 4.4% |
| retire_batch, worst case | 12 | 134249 | 11187 | 10476 | 9.6% |
| strike_record | — | 12220 | — | — | 0.9% |
| finalize_snapshot | — | 9789 | — | — | 0.7% |
| fund_action | — | 13094 | — | — | 0.9% |
| complete_action | — | 18802 | — | — | 1.3% |
| admit_trade | — | 22848 | — | — | 1.6% |
| release_trade | — | 12916 | — | — | 0.9% |
| release_trade (force) | — | 18708 | — | — | 1.3% |

*CU per holder* is the whole transaction divided by the holders in it; *marginal* is the increase per added holder against the previous measured size of the same instruction.

## Batch constants and headroom

| Batch | Constant | CLI sends | Highest CU at the CLI size | Share of the CLI's 600k limit | Highest CU at the on-chain maximum | Share of the 1.4M limit | Holders that fit in 600k CU |
|---|---|---:|---:|---:|---:|---:|---:|
| `snapshot_batch` | `SNAPSHOT_BATCH_MAX = 8` | 8 | 86725 | 14.5% | 86725 | 6.2% | ~61 |
| `pay_batch` | `PAY_BATCH_MAX = 10` | 8 | 94043 | 15.7% | 114977 | 8.2% | ~56 |
| `retire_batch` | `RETIRE_BATCH_MAX = 12` | 12 | 134249 | 22.4% | 134249 | 9.6% | ~56 |

"Highest" takes the worst-case row where one exists. "Holders that fit in 600k CU" extrapolates linearly from the 1-holder and the on-chain-maximum measurements. The test asserts that every measured transaction stays below 1,400,000 CU and that every batch at the size the CLI sends stays below the 600,000 CU limit the CLI sets. Where the extrapolated figure is above the constant, compute is not what bounds the batch: the account count and the 1232-byte transaction size are (docs/02-architecture.md, "Batch sizing").

## Method

- LiteSVM (in-process SVM) running the deployed program binary `target/deploy/qupon_bonds.so`, the devnet Token-2022 binary (`tests/fixtures/spl_token_2022.so`) for the bond leg and the devnet DvP binary for the trade instructions. One transaction per row: `SetComputeUnitLimit(1,400,000)` plus the measured instruction, registrar as fee payer; the figure is `compute_units_consumed` of the whole transaction.
- Plain rows: legacy SPL Token cash mint (as `setup_bond` creates), no withholding tax, 10 units per holder. The SPL Token program is the build LiteSVM bundles: p-token (pinocchio), not a devnet dump; a cluster still on the older SPL Token build pays more per SPL cash transfer than measured here.
- `pay_batch, worst case`: Token-2022 cash mint without extensions (tKZT-like) and 15% withholding tax, so each holder costs two Token-2022 transfers (net to the holder, tax to the vault).
- `retire_batch, worst case`: every holder suspended, so each frozen account is thawed before the burn.
- `snapshot_batch` creates one Entitlement per holder. The single calls come from the 8-holder coupon; `release_trade` re-freezes an empty escrow, the forced one first returns 10 units to the seller.
- Holders, mints and therefore PDAs are random keys, so the figures vary from run to run — `snapshot_batch` most, because it derives each Entitlement PDA on-chain (one bump search per holder).
- LiteSVM does not enforce the 1232-byte packet size: `pay_batch` with 10 holders is a compute figure only; on a cluster that batch needs a v0 transaction with an address lookup table, which is why the CLI sends 8.
