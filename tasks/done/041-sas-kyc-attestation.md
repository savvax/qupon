---
id: 041
title: T2: Solana Attestation Service credential check in register_investor
agent: claude
tier: T2
depends_on: [019]
verify: make verify
timeout_min: 60
---
## Goal
Optional: replace the registrar's KYC attributes with an SAS attestation issued by a 'KYC provider' keypair.

## Read first
- docs/04-stack.md (SAS)
- https://solana.com/docs/tools/attestations

## Steps
1. Issue a `KYC` schema + attestation per investor with `sas-lib`; `register_investor` accepts the attestation account and verifies issuer + schema + expiry (read-only parse of the SAS account layout) before thawing.

## Acceptance criteria
- [ ] Registering without a valid attestation fails in a test; README roadmap updated. Skip if time is short.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/041.md`, then print exactly `DONE:041` or `BLOCKED:041 <reason>`.
