# ISO 20022 golden samples

Hand-written, well-formed XML matching the mapping table in `docs/03-domain.md` §6.
The Go exporter (services/registrar) must produce equivalent output for the brief's
coupon (`fixtures/entitlement.json`, `brief_coupon_10`).

## Files
- `seev031.QPNb1-INTR-0001.xml` — CorporateActionNotification (MT564-like), ns `seev.031.001.15`.
- `seev036.QPNb1-INTR-0001.owner.xml` — MovementConfirmation (MT566-like) for one holder
  with 10 units: gross/net 500.00 tKZT, ns `seev.036.001.16`.

## Populated elements (seev.031)
`CorpActnEvtId` (CORP = corp id), `EvtTp` = INTR, `MndtryVlntryEvtTp` = MAND,
`UndrlygScty/FinInstrmId/ISIN`, `AnncmntDt` / `RcrdDt` / `PmtDt` (Asia/Almaty offset,
record at start of day), `IntrstPrd` (180 days, 30/360), `IntrstRateUsdForPmt` = 10.00,
`DayCntBsis` = A001. `OffclCorpActnEvtId` (COAF) is omitted: empty `official_id` → omit.

## Populated elements (seev.036)
`AcctOwnr` (owner pubkey), `SfkpgAcct` (bond ATA, base58), `ConfdBal` = 10 units,
`CdtDbtInd` = CRDT, `GrssCshAmt` / `WhldgTaxAmt` / `NetCshAmt` / `PstngAmt` (tax_bps = 0),
`PstngDt` / `ValDt`, `SplmtryData/AddtlInf` with a SIMULATED tx-signature placeholder.
For REDM/MCAL events, `PstngAmt` = net cash + principal repayment.

## Scope
Both files are checked for well-formedness only (`xmllint --noout` or Python
`xml.dom.minidom`). Full XSD validation against the official ISO 20022 schemas is
out of scope for this hackathon; element names follow the §6 mapping table exactly.
Account keys and tx signature are SIMULATED placeholders, not real devnet values.
