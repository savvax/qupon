---
id: 91587
title: 3-minute sandbox replay — a real recorded devnet run played back with no API or RPC at view time
agent: glm
tier: T1
depends_on: [1540]
verify: make verify
timeout_min: 150
---
## Goal
The judge's "Try it in 3 minutes" sandbox depends on live devnet (public RPC rate limits made it slow/fail today). Add a
**replay**: one real sandbox run, recorded from the production API, played back in the browser in ≤ 3 minutes with the
same UI, needing nothing at view time but the static web app. Every signature in it is real and opens on Solana Explorer
(devnet). The live sandbox stays as is. The replay is clearly labelled (AGENTS.md rule 6).

## Do
1. **Recorder** `apps/web/scripts/record-sandbox.mjs` (Node ≥ 22, global fetch, no new deps). Usage:
   `node apps/web/scripts/record-sandbox.mjs <apiBaseUrl> [out=apps/web/public/replay/sandbox.json]`.
   - Create a sandbox exactly like the page does (`apps/web/src/app/(public)/sandbox/new/SandboxStart.tsx` →
     POST `/demo/sandbox`, same body / requestId scheme), then poll GET `/demo/sandbox/{id}` every 2 s.
   - Keep a frame only when the JSON changed (ignore `serverTime`): `{ "t": <ms since start>, "sandbox": <body> }`.
   - Run the two judge scenarios at the moments the live e2e does (`apps/web/e2e/live/sandbox.spec.ts`: after
     "Coupon 1 paid", `dvp_trade` then `non_kyc_transfer` via POST `/demo/sandbox/{id}/scenario`), recording each
     scenario response as `{ "t", "scenario": "<kind>", "result": <body> }`.
   - Stop at the e2e's end state (or 20 min), write `{ "recordedAt", "api": "<host only>", "frames": [...],
     "scenarios": [...] }`. Print a one-line summary (frames, duration, tx signatures count). Exit ≠ 0 on failure.
2. **Replay page** `/[locale]/sandbox/replay` (`apps/web/src/app/(public)/sandbox/replay/page.tsx`):
   - Fetch `/replay/sandbox.json` client-side; if missing → a localized "replay not recorded yet" state with the live CTA.
   - Render the existing `SandboxView` fed from the frames. Minimal `SandboxView` change: an optional
     `source?: () => Promise<Sandbox | null>` used instead of `pollSandbox` (default unchanged) and `replay?: boolean`
     that hides the scenario buttons and the Claim button; in replay the recorded scenario results appear in the
     scenario panels at their recorded time (read-only).
   - Virtual clock: play frames in order; every gap between frames is capped at 3 s (identical stretches skipped) so a
     full run plays in ≤ 180 s; controls: play/pause, speed ×1/×2, restart; a progress bar with the step names.
     Countdowns may jump at compressed gaps but must never show negative time.
   - Sticky banner (en/ru/kk in `apps/web/messages/*.json`): "REPLAY — a real devnet run recorded <date>. Every
     signature opens on Solana Explorer. [Run your own live →]" linking to `/sandbox/new`.
   - The page makes NO request to the registrar API or any Solana RPC (explorer links are plain anchors).
3. **Entry points:** landing Hero (`apps/web/src/app/(public)/_landing/Hero.tsx`) keeps its live CTA and gains a
   secondary link "Watch a 3-minute replay" → `/sandbox/replay`; the sandbox failure card (`SandboxStart.tsx`, task 91584)
   gains "Watch a recorded run instead" → `/sandbox/replay`. No other UI change.
4. **Tests:** unit test for the frame scheduler (gap cap, total ≤ 180 s for a 9-minute fixture, ends on the last frame,
   scenarios placed at their time); a mock e2e for `/sandbox/replay` using a small fixture in `apps/web/e2e/fixtures/`
   (served via `page.route` for `/replay/sandbox.json`): banner visible, plays at ×2 to "Coupon 1 paid", and asserts
   that no request goes to the API host or any RPC. Keep every existing test green (unit + mock e2e).
5. Commit WITHOUT `apps/web/public/replay/sandbox.json` (the lead records the real run against production and commits
   it). Worklog: how to record, the frame/byte size of your fixture.

## Constraints
Web + one script only; no registrar/program changes; do not run the recorder against production (use the mock or a
local registrar); devnet only; never print RPC URLs or keys; never name other hackathon participants; English in code,
en/ru/kk for UI strings.

## Finish
Commit `feat(web): 3-minute sandbox replay of a recorded devnet run` (`task: 91587`), write `reports/worklog/91587.md`,
print `DONE:91587` or `BLOCKED:91587 <reason>`.
