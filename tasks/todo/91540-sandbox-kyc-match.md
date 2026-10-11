---
id: 91540
title: "URGENT: sandbox onboarding fails on production — KYC attestation data must match the registration"
agent: glm
tier: T1
depends_on: []
verify: make verify
timeout_min: 180
---
## Goal
On production every `POST /demo/sandbox` fails:
`executor_failed: register Altyn Capital: cli investor:register refused: KycAttestationInvalid (6031)`.
`register_investor` (programs/qupon_bonds/src/instructions/register_investor.rs:66) requires the SAS attestation data
(investor_type · residency · tax_rate_bps) to EQUAL the registration's. The sandbox (`services/registrar/internal/sandbox/sandbox.go`
`place()`) calls `kyc:attest --owner X` with the defaults (individual / resident / 0 bps) and then
`investor:register --type legal_entity --residency resident --tax-bps <holder tax>` — they never match. And the three
custodial holders (the devnet demo investors 1–3, keys from `QUPON_INVESTOR<n>_KEYPAIR`) already have attestations from
the demo scripts, which `kyc:attest` does not overwrite ("attestation … already exists"). The fake CLI in the tests hides it.

## Do
- CLI `kyc:attest` (clients/ts/src/commands/kyc.ts): add `--replace`: if an attestation for the owner exists with
  DIFFERENT data, close it (sas-lib close-attestation instruction, signed by the KYC provider as authority) and create the
  new one in the same transaction or right after; if the data is equal, skip as today. Print `{ok, attestation, owner,
  replaced: bool}`. Unit-test the data comparison / instruction building (no network).
- Sandbox `place()`: call `kyc:attest --owner X --type <t> --residency <r> --tax-bps <tax> --replace` with EXACTLY the values
  it then passes to `investor:register` (one source of truth per holder, incl. the visitor's wallet: individual /
  resident / 1000 bps unless the holder spec says otherwise). Update the fake-CLI tests to assert the attest and
  register argv carry the same type/residency/tax.
- Make the fake CLI used by the sandbox tests fail `investor:register` when its type/residency/tax differ from the last
  `kyc:attest` for that owner, so this class of bug fails in CI from now on.

## Acceptance
`go test ./services/registrar/...` and `pnpm --filter @qupon/client test` green; `make verify` green.
Commit `fix(sandbox): attest KYC with the data the registration uses` (`task: 91540`).
The lead re-deploys and runs `e2e/live/sandbox.spec.ts` against production after the merge.

## Finish
Write `reports/worklog/91540.md` (3–6 lines), commit with `task: 91540`, print `DONE:91540` or `BLOCKED:91540 <reason>`.
