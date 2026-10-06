---
id: 1110
title: Landing "How it works" — steps light up in sequence as you scroll, progress rail
agent: claude
tier: T1
depends_on: [1109]
verify: make verify
timeout_min: 30
---
## Goal
Scroll-driven (CSS only, GPU-only, reduced-motion off) cascade on the five step numbers and a progress rail under the steps on desktop.
## Acceptance criteria
- No change on browsers without animation-timeline; locale-stability and landing e2e green; make verify; worklog.
