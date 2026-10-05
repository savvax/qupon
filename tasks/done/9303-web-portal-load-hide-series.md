---
id: 9303
title: Investor cabinet loads only registered series; hide devnet test series from lists
agent: claude
tier: T1
depends_on: []
verify: make verify
timeout_min: 30
---
Found in the live check: placement took 17 s (82 requests) because loadPortal fetched every series in full and devnet holds ~15 leftover demo series. Two-phase load + NEXT_PUBLIC_HIDE_SERIES deny-list (build arg, set by the deploy from config/hidden-series.txt). Finish with DONE:9303.
