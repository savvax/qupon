# internal/iso20022

ISO 20022 export: `seev.031.001.15` (CorporateActionNotification) and
`seev.036.001.16` (CorpActnMvmntConf) rendered from the on-chain account
mirrors in `internal/chain`, per the mapping table in `docs/03-domain.md` §6.

- Pure package: no RPC/network code — endpoints in `internal/api` fetch
  accounts and call `BuildSeev031` / `BuildSeev036`.
- Amounts are minor-unit integers formatted with the cash mint's decimals
  (`50_000` @ 2 → `500.00`); dates render in the Almaty market timezone.
- Solana proof (tx signature, slot, program id, cluster) travels in
  `SplmtryData/AddtlInf`.
- Golden tests compare against `fixtures/iso20022/*.xml` (the brief's
  numbers) and check well-formedness with `xmllint --noout` when installed,
  else a Go parser round-trip.

**XSD validation against the official ISO 20022 schemas is out of scope** for
this hackathon; output is well-formed XML with the correct namespaces and
element names only.
