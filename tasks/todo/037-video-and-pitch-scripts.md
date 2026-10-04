---
id: 037
title: Demo video script with timestamps + subtitles, pitch script 2:00, slide outline (10 slides)
agent: flash
tier: T1
depends_on: [019]
verify: make verify
timeout_min: 30
---
## Goal
Prepare everything the human needs to record in one sitting.

## Read first
- docs/07-submission.md
- docs/01-product.md (storyboard)
- reports/demo-full.md

## Steps
1. `docs/VIDEO_SCRIPT.md`: demo script with per-shot timestamps, exact on-screen actions, voice-over lines (EN, ≤ 420 words for 3:00), subtitle file `docs/demo.srt`.
2. `docs/PITCH_SCRIPT.md`: 2:00 script (≤ 290 words) following team → problem → user → validation → vision, plus `docs/PITCH_SLIDES.md` (10 slides: title, problem with 3 numbers, why now KASE/Solana timeline, product, demo frame, architecture, differentiation vs prior art, market, business model + GTM, team + ask).
3. Generate slides as `docs/pitch.pptx` using the kit's pptx tooling if available (optional) — otherwise Markdown is enough.

## Acceptance criteria
- [ ] Scripts fit the time limits when read at 140 wpm; every number has a source line in the script notes.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/037.md`, then print exactly `DONE:037` or `BLOCKED:037 <reason>`.
