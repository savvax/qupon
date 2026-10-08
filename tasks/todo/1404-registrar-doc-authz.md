---
id: 1404
title: Registrar: KYC documents can't be published; series ownership fails closed
agent: glm
tier: T0
depends_on: []
verify: make verify
timeout_min: 45
---
## Goal
1. Privacy (services/registrar/internal/api/org.go ~L258-270): attaching an existing document to a series rewrites its kind and makes it public — an issuer can publish a colleague's `id_document`/`proof_of_address`. Reject when the document kind is a KYC kind (`kycKinds[d.Kind]`) and require `d.OwnerUserID == u.ID`.
2. Authz (org.go ~L367-373, `seriesMintOf` inside `issuerOwnsSeries`): on a chain read error it returns ("", true) and the ownership check passes. Return 502 on read error; pass through only when `deps.Read == nil`.

## Acceptance criteria
- Test: user A uploads an id_document; issuer B in the same org attaches it → 400/404; anonymous GET /documents/{id} → 404.
- Test: fake reader errors on the first FetchCorporateAction → cross-org POST /issuer/actions/{pda}/fund gets 403 or 502, never 200.
- `make verify` green; `reports/worklog/1404.md`.
