---
id: 9030
title: Real devnet UI walkthrough — `make demo-ui` setup, local QUPON_CLI wrapper, screenshots in reports/ui-walkthrough.md
agent: claude
tier: T1
depends_on: [030, 024]
verify: make verify
timeout_min: 90
---
## Goal
030's acceptance (a human runs the coupon flow from the UI; screenshots) was not met — agents have no browser. Provide a one-command setup (fresh series + announced coupon), run the real API + web against devnet, click every step in a browser and record screenshots.

## Acceptance criteria
- [ ] `make demo-ui` prints the action and the config to start the API with; `make api` works with the executor out of the box (QUPON_CLI wrapper).
- [ ] `reports/ui-walkthrough.md` has real devnet screenshots of each phase with tx links; bugs found are fixed or filed.
