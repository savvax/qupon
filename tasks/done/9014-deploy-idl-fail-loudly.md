---
id: 9014
title: ops/deploy.sh — fail loudly when the IDL is not published
agent: flash
tier: T1
depends_on: [014]
verify: make verify
timeout_min: 15
---
## Goal
`anchor idl init … || anchor idl upgrade … || true` hides IDL failures, but "IDL fetchable" is an acceptance criterion of 014.

## Steps
1. Remove `|| true`; after init/upgrade run `anchor idl fetch --provider.cluster devnet <programId> > /dev/null` and exit non-zero with a clear message if it fails.
2. Do not run the deploy (it spends SOL); only `bash -n ops/deploy.sh` and `shellcheck` if installed.

## Acceptance criteria
- [ ] Script syntax-checks; `make verify` green.
