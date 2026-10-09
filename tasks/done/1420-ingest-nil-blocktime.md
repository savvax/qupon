---
id: 1420
title: Ingest skips a nil-BlockTime signature after the fresh window
agent: claude
tier: T1
depends_on: [1415]
verify: make verify
timeout_min: 30
---
## Goal
Review of 1415: a not-found signature with nil BlockTime counts as young forever and blocks the cursor. Track first-seen time per signature; skip once older than freshWindow.
## Acceptance criteria
- Test: nil-BlockTime not-found signature blocks within the window, is skipped after it.
- make verify green; reports/worklog/1420.md.
