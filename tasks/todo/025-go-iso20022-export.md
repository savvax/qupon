---
id: 025
title: ISO 20022 export: seev.031 (announcement) and seev.036 (per-holder confirmation) from on-chain state
agent: glm
tier: T1
depends_on: [020, 047]
verify: make verify
timeout_min: 60
---
## Goal
The bridge to custodians: standard messages generated from the chain, with the Solana signature as the reference.

## Read first
- docs/03-domain.md (§6 mapping)
- docs/research/01-market-kase-iso20022-prior-art.md (§3)

## Steps
1. `internal/iso20022`: Go structs with `encoding/xml` tags for a *minimal but well-formed* `Document` for `seev.031.001.15` (`CorpActnNtfctn`: `NtfctnGnlInf`, `CorpActnGnlInf{CorpActnEvtId, OffclCorpActnEvtId?, EvtTp, MndtryVlntryEvtTp, UndrlygScty{FinInstrmId{ISIN}}}`, `CorpActnDtls{DtDtls{AnncmntDt, RcrdDt, PmtDt}, PrdDtls, RateAndAmtDtls{IntrstRateUsdForPmt}, DayCntBsis}`, `SplmtryData` with Solana refs) and `seev.036.001.16` (`CorpActnMvmntConf`: `CorpActnGnlInf`, `AcctDtls{SfkpgAcct, AcctOwnr, ConfdBal}`, `CorpActnConfDtls{CshMvmntDtls{CdtDbtInd, GrssCshAmt, NetCshAmt, WhldgTaxAmt, PstngAmt, PstngDt, ValDt}}`, `SplmtryData{tx signature, slot, programId, cluster}`).
2. Endpoints `GET /actions/{pda}/iso/seev031.xml` and `GET /entitlements/{pda}/iso/seev036.xml` (+ `GET /actions/{pda}/iso/seev036.zip` all holders).
3. Golden tests against `fixtures/iso20022/*.xml` (task 047) with the brief's numbers; README note that XSD validation is out of scope. Input is the Go structs from `internal/chain/types.go`, not live RPC — keep this package free of network code.

## Acceptance criteria
- [ ] XML downloads well-formed (`xmllint --noout` in tests if available, else Go parser round-trip); amounts formatted with the cash mint decimals (`500.00`).

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/025.md`, then print exactly `DONE:025` or `BLOCKED:025 <reason>`.
