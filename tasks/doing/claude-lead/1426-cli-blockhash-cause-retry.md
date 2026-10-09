---
id: 1426
title: CLI retries a blockhash error nested in the simulation failure
agent: claude
tier: T0
depends_on: [1407]
verify: make verify
timeout_min: 20
---
## Goal
make demo failed at action:complete: Kit reports 'Transaction simulation failed' with cause 'Blockhash not found'; sendInstructions only matched the top-level message, so it never re-signed. Match the cause too.
