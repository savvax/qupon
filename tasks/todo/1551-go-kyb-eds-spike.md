---
id: 1551
title: KYB via НУЦ РК e-signature (spike)
agent: claude
tier: T2
depends_on: []
verify: make verify
timeout_min: 180
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1551 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1551: KYB via НУЦ РК e-signature (spike)
Go `internal/eds`: verify a CMS signature over a server challenge with a GOST 34.10-2015 certificate chained to the NCA RK test root; extract БИН/ИИН and signer role OIDs (1.2.398.3.3.4.1.2.1/.2); on success issue the SAS attestation with `method = NCA_EDS`. Exit with `BLOCKED:1551` if no pure-Go GOST implementation verifies the NCA test vectors within 3 hours.

## Finish
`make verify` green, commits carry `task: 1551`, `reports/worklog/1551.md` written. Print `DONE:1551` or `BLOCKED:1551 <reason>`.

## Review feedback (round 1, 2026-10-10 12:10) — fix every blocking item first; your previous work is already committed on this branch

### Summary
Fail. The parsing, CMS-structure and error-path code is tidy and its tests assert real values. But the spike never ran its own go/no-go test against NCA test vectors, so the \"Not BLOCKED\" claim in the worklog is unsupported. Everything was tested against a self-made PKI that uses Russian TC26 256-bit OIDs and a made-up layout: ИИН/БИН read from an invented DN attribute, roles read from a CMS signed attribute. Real НУЦ РК certificates use 1.2.398.3.10.* GOST-2015 512-bit OIDs, which this library doesn't parse. They also carry IIN/BIN as prefixed serialNumber and OU values and put roles in ExtendedKeyUsage. So this verifier would most likely reject every real NCA signature. The 'issue the SAS attestation with method = NCA_EDS' step is also not wired. Next step: verify a real NCA test certificate and CMS, or print BLOCKED:1551 with the finding. I could not run `go test ./internal/eds/...` because Bash was denied here, so this review relies on reading the code and the orchestrator's green `make verify`.

### Blocking
- services/registrar/internal/eds/eds.go:154 — The task's own go/no-go gate was skipped. The task says to stop with BLOCKED if no pure-Go GOST library "verifies the NCA test vectors". No НУЦ РК material was ever used. The worker instead pinned the Russian RFC 6986 and RFC 7091 vectors and a self-made PKI ("Qupon GOST Test Root", CryptoPro-A curve, 1.2.643.* OIDs), then wrote "Not BLOCKED". There is good reason to think the real path fails. The verifier only accepts the Russian 256-bit OIDs 1.2.643.7.1.1.2.2 and 1.2.643.7.1.1.3.2 (eds.go:154-159). `x509gost` only knows 1.2.643.* key and signature OIDs (go-gostcrypto@v0.1.0/x509gost/oids.go). НУЦ РК GOST-2015 certificates use the Kazakh 1.2.398.3.10.1.* arc with 512-bit keys, so `x509gost.ParseCertificate` and the algorithm checks would most likely reject them. Nothing ever chains to the real NCA RK test root.
  **Fix:** Download the public НУЦ РК developer test pack from pki.gov.kz/developers. Commit only public material under `services/registrar/internal/eds/testdata/`: the NCA RK GOST test root and intermediate (PEM), one GOST-2015 legal-entity test signer certificate, and one CMS over a fixed challenge signed with that test key (made with NCALayer, kalkan or OpenSSL gost-engine). Never commit the .p12 or a private key. Add `TestVerifyNCATestVector`: `NewVerifier(testRootPEM).Verify(cms, challenge, fixedNow)` must succeed and assert the exact ИИН, БИН and role read from that certificate. To make it pass, map the KZ algorithm, hash and curve OIDs (1.2.398.3.10.1.1.2.3.x, 1.2.398.3.10.1.3.x, and the KZ curve parameter OIDs) to the matching TC26 parameters and digest, and accept 512-bit Streebog. If the fixtures can't be obtained, or the library still can't verify them, rewrite `reports/worklog/1551.md` with the real finding and print `BLOCKED:1551 <reason>` as the task requires.
- services/registrar/internal/eds/eds.go:377 — ИИН/БИН and role extraction follows a made-up certificate layout, so it would fail on every real НУЦ certificate. The code treats 1.2.398.3.3.4.1 as a DN attribute (it isn't one). `isIinBin` requires exactly 12 digits, but НУЦ writes `SERIALNUMBER=IIN<12 digits>` and `OU=BIN<12 digits>`, so the prefixed values are skipped and OU is never read. The result is ErrNoIinBin. Role OIDs 1.2.398.3.3.4.1.2.1 and .2.2 are certificate ExtendedKeyUsage values (.2.1 = first head/CEO, .2.2 = person authorised to sign). The code instead looks for them in a CMS signed attribute (type 1.2.398.3.3.4.1.2) that NCALayer doesn't produce, so every real signature returns ErrNoRole. The labels "signer" and "approver" are also wrong. The tests pass only because the test PKI builds that same invented layout (eds_test.go:118-121, 327-329, 354-356).
  **Fix:** In `iinBinOf`, parse RawSubject: take IIN = the subject serialNumber with the "IIN" prefix stripped (must then be 12 digits), and BIN = the OU with the "BIN" prefix stripped. Set `IsEntity` when BIN is present. Delete `oidIinBin`. Move role detection from the signed attributes to the signer certificate's ExtKeyUsage: read `cert.Stdlib.UnknownExtKeyUsage`, map 1.2.398.3.3.4.1.2.1 to "ceo" and 1.2.398.3.3.4.1.2.2 to "authorized_signer", and return ErrNoRole for legal-entity certificates without either. Change the test PKI to match: subject `SERIALNUMBER=IIN…` and `OU=BIN…`, roles in an EKU extension (2.5.29.37), no role signed attribute. Keep the missing-role failure case, built from a certificate without the role EKU. The NCA test-vector test from the first item must assert these values from the real certificate.
- services/registrar/internal/eds/eds.go:129 — Required step "on success issue the SAS attestation with method = NCA_EDS" is not done. `Result.Attest()` returns a plain struct that nothing uses. Nothing calls `kyc:attest` through the executor, and `NCA_EDS` is never recorded anywhere.
  **Fix:** Only needed once the first item is a GO. In `internal/api`, add a function such as `attestFromEDS(ctx, deps, seriesName, owner string, res *eds.Result)`. It should build an `OnboardRequest` from `res.Attest()` (InvestorType, default resident, taxBps 0) and reuse `onboardInvestor` (registrar.go:137), so `kyc:attest` and `investor:register` run through the executor. The SAS schema has no method field, so record `method: NCA_EDS` and the ИИН/БИН in the audit entry; note that in docs/02-architecture.md. Add a table test with the fake executor: a verified result calls `kyc:attest --type legal_entity …` and the audit row has `NCA_EDS`; a failed `Verify` makes no executor calls. Add no HTTP route; if one is ever added, it goes behind its own `mount<Feature>` anchor.

### Acceptance criteria not met
- …with a GOST 34.10-2015 certificate chained to the NCA RK test root — Only a self-made root over Russian 1.2.643.* OIDs and the CryptoPro-A 256-bit curve is used. No НУЦ РК test root or certificate is in the repo or the tests, and x509gost/oids.go knows no KZ 1.2.398.3.10.* OIDs.
- Extract БИН/ИИН and signer role OIDs 1.2.398.3.3.4.1.2.1/.2 — iinBinOf reads an invented DN attribute 1.2.398.3.3.4.1, or a bare 12-digit serialNumber. Real certificates carry IIN<12> and OU=BIN<12>. roleOf reads CMS signed attributes, not the certificate ExtKeyUsage where НУЦ puts these OIDs.
- On success issue the SAS attestation with method = NCA_EDS — Result.Attest() returns a struct that nothing consumes. There is no kyc:attest call and NCA_EDS is not stored anywhere.
- BLOCKED:1551 if no pure-Go GOST implementation verifies the NCA test vectors — The NCA test vectors were never tried. The worklog's 'Not BLOCKED' rests on Russian RFC vectors and a self-made PKI.
