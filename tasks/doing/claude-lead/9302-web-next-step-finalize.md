---
id: 9302
title: Next-step label after a full snapshot says Finalize (mirror executor.NextStep investor count)
agent: claude
tier: T1
depends_on: []
verify: make verify
timeout_min: 30
---
Found in the live check: after every holder was snapshotted the button still read "Snapshot holders" while the server ran finalize. nextStep() takes the series investor count like executor.NextStep. Finish with DONE:9302.
