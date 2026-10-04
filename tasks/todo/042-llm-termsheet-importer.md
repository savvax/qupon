---
id: 042
title: T2: paste a KASE news item / prospectus excerpt → structured series params (LLM-assisted)
agent: glm
tier: T2
depends_on: [029]
verify: make verify
timeout_min: 45
---
## Goal
Optional innovation: the inverse of the Swift/Chainlink pilot — unstructured KASE text in, structured on-chain terms out, with human confirmation.

## Read first
- docs/research/01-market-kase-iso20022-prior-art.md (KASE news formats)

## Steps
1. Go endpoint `POST /import/termsheet` that calls an LLM (Z.ai GLM via OpenAI-compatible API, key from env; SIMULATED fallback with regex for the demo) to extract ISIN, ticker, face, rate, frequency, day count, dates; UI page `/import` showing the parsed fields for confirmation and a `series:init` button.

## Acceptance criteria
- [ ] Pasting the BTRKb33 listing text yields correct params; the feature is labelled experimental.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/042.md`, then print exactly `DONE:042` or `BLOCKED:042 <reason>`.
