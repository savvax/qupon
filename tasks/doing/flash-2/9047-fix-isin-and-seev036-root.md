---
id: 9047
title: Fix test ISIN to 12 chars and seev.036 root element
agent: flash
tier: T1
depends_on: [047, 048]
verify: make verify
timeout_min: 20
---
## Goal
The test ISIN `KZ2C0QUPON001` has 13 characters; an ISIN has 12 and `Series.isin` is `[u8;12]` (the program tests use `KZ2C0QUPON01`). Golden XML must match what the exporter will produce from chain data.

## Read first
- docs/03-domain.md §6, fixtures/iso20022/, fixtures/notices/, config/devnet.json, docs/01-product.md (S0)

## Steps
1. Replace `KZ2C0QUPON001` with `KZ2C0QUPON01` everywhere it appears (`rg -l KZ2C0QUPON001`): docs, fixtures/iso20022/*.xml, fixtures/notices/*, config/devnet.json, README.
2. seev.036 golden file: the business root element of seev.036 (Corporate Action Movement Confirmation) is `CorpActnMvmntConf`, not `CorpActnConf`; rename it (namespace `urn:iso:std:iso:20022:tech:xsd:seev.036.001.16` unchanged). Add one line to fixtures/iso20022/README (create if missing): for REDM/MCAL `PstngAmt` = net + principal.

## Acceptance criteria
- [ ] `rg KZ2C0QUPON001` returns nothing; XML files still well-formed (`xmllint --noout` if available); `make verify` green.
