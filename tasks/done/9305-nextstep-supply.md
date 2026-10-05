---
id: 9305
title: Snapshot never finishes when a registered investor holds 0 bonds (NextStep compares investors, not units)
agent: claude
tier: T1
depends_on: []
verify: make verify
timeout_min: 45
---
Found in the live check: after onboarding a wallet with no bonds, /advance kept choosing "snapshot" (holders_snapshotted 3 < investors 4) and every click spent a devnet tx. finalize_snapshot requires units_snapshotted == mint supply and the program skips zero balances, so NextStep must compare units with the mint supply. Fix executor + /advance + scheduler + the web mirror; tests. Finish with DONE:9305.
