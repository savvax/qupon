---
id: 038
title: Final submission texts: Colosseum form answers, Earn answers, tweet, weekly update outline
agent: claude
tier: T1
depends_on: [034]
verify: make verify
timeout_min: 30
---
## Goal
Fill `docs/07-submission.md` drafts with final, specific, honest text.

## Read first
- docs/07-submission.md
- README.md
- docs/TECHNICAL_OVERVIEW.md

## Steps
1. Rewrite the description (≤ 300 words), GTM/demand validation (use whatever the human recorded in HUMAN_TODO as conversations), disclosure paragraph, 'anything else' block with links, tweet; add a `docs/SUBMISSION_FINAL.md` with copy-paste blocks per form field.

## Acceptance criteria
- [ ] Texts are specific (program id, numbers, links), English, no buzzwords; reviewed by `reviewer`.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/038.md`, then print exactly `DONE:038` or `BLOCKED:038 <reason>`.
