---
id: 91102
title: Notification bell badge pop when the unread count rises
agent: glm
tier: T1
depends_on: [805]
verify: make verify
timeout_min: 30
---
## Goal

Task 1102 asked for a "notification bell badge pop", but `components/shell/NotificationBell.tsx` is created by task 805, which had not been merged when 1102 ran. Apply the pop once the bell exists.

## Read first

- `docs/superpowers/plans/2026-10-06-plan6-12-platform-v2.md` — Task 1102, §5.6 lines
- `apps/web/src/components/motion/Pulse.tsx` — the one-off change trigger pattern
- `apps/web/src/app/globals.css` — `--animate-qp-*` tokens and the reduced-motion block

## Steps

1. In `NotificationBell.tsx`, when the polled unread count increases after first render, play a one-off scale pop on the count badge (reuse the `Pulse` pattern: CSS keyframe restarted on change, never on first render; or add `--animate-qp-badge-pop` next to the other tokens).
2. No pop under `prefers-reduced-motion` (the global block in globals.css already enforces this for CSS animations).

## Acceptance criteria

- Badge pops once on count increase, not on mount; no animation under reduced motion; `make verify` green.
