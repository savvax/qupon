---
id: 047
title: Hand-written seev.031 / seev.036 sample XML for the brief's coupon (golden files)
agent: flash
tier: T1
depends_on: [001]
verify: make verify
timeout_min: 25
---
## Goal
Give the Go exporter (task 025) a target to match and judges a readable example.

## Read first
- docs/03-domain.md (§6 mapping)
- docs/research/01-market-kase-iso20022-prior-art.md (§3)

## Steps
1. `fixtures/iso20022/seev031.QPNb1-INTR-0001.xml` (announcement for the brief's coupon: ISIN KZ2C0QUPON001, 10.00%, period 2026-07-03→2027-01-03, record 2027-01-03T00:00+05:00, payment 2027-01-05, DayCntBsis A001) and `seev036.QPNb1-INTR-0001.<owner>.xml` (holder with 10 units: gross/net 500.00 tKZT, SplmtryData with placeholder tx signature).
2. Well-formed (checked with `xmllint --noout` or Python `xml.dom.minidom`); namespaces `urn:iso:std:iso:20022:tech:xsd:seev.031.001.15` / `seev.036.001.16`; a README in the folder explaining which elements are populated and why XSD validation is out of scope.

## Acceptance criteria
- [ ] Both files parse; element names follow the mapping table exactly.

## Finish
Run `make verify`, commit on your task branch, write `reports/worklog/047.md`, then print exactly `DONE:047` or `BLOCKED:047 <reason>`.
