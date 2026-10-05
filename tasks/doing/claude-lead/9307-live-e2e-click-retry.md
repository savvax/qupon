---
id: 9307
title: Live e2e cabinets spec retries the demo click until it navigates (hydration race)
agent: claude
tier: T1
depends_on: []
verify: make verify
timeout_min: 20
---
Dress rehearsal against the local devnet stack: 3/4 live specs green; cabinets failed because the second role click landed before hydration. Retry with toPass. Finish with DONE:9307.
