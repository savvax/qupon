---
id: 91557
title: the judge sandbox gets its own custodial holder keys (no shared KYC attestations)
agent: flash
tier: T1
depends_on: [91556]
verify: make verify
timeout_min: 120
---
## Goal
The sandbox's three custodial holders fall back to the devnet demo investors 1–3 (`QUPON_INVESTOR<n>_KEYPAIR`). Their SAS
KYC attestation is per wallet, and the sandbox now re-attests them with its own data (`kyc:attest --replace`, task 91540),
so every sandbox run breaks `make demo` / `make seed-showcase` registrations (KycAttestationInvalid) and vice versa.
Give the sandbox dedicated holder wallets.

## Do
- `services/registrar/entrypoint.sh`: add `SANDBOX_INVESTOR1 SANDBOX_INVESTOR2 SANDBOX_INVESTOR3` to the role list, so
  `QUPON_SANDBOX_INVESTOR<n>_KEYPAIR_JSON` becomes a file and `QUPON_SANDBOX_INVESTOR<n>_KEYPAIR` (the sandbox already
  prefers it — `holderKeypair()` in internal/sandbox/sandbox.go).
- `ops/deploy-vps.sh` secrets block: for n in 1 2 3, if `$HOME/.config/qupon/sandbox-holder<n>.json` exists (or
  `QUPON_SANDBOX_INVESTOR<n>_KEYPAIR` is set) write `QUPON_SANDBOX_INVESTOR<n>_KEYPAIR_JSON=<one-line JSON array>` like the
  other keys. Never print or commit key material.
- Docs: one line in docs/04-stack.md (Gotchas) explaining why sandbox keys are separate.
- Do NOT generate keys or touch devnet (the lead does).

## Acceptance
`bash -n` + shellcheck clean for both scripts; Go tests green; `make verify` green.
Commit `fix(sandbox): dedicated custodial holder keys` (`task: 91557`).

## Finish
Write `reports/worklog/91557.md` (3–6 lines), commit with `task: 91557`, print `DONE:91557` or `BLOCKED:91557 <reason>`.
