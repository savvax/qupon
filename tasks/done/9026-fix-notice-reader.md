---
id: 9026
title: Notice reader — strip Anchor discriminator, 404 on missing action, scale amounts by cash-mint decimals
agent: claude
tier: T1
depends_on: [026]
verify: make verify
timeout_min: 40
---
## Goal
Review pass found `GET /actions/{pda}/notice` cannot work on real chain data.

## Read first
- services/registrar/internal/notice/reader.go, internal/chain (client Fetch* helpers), fixtures/notices/, docs/03-domain.md §7

## Steps
1. reader.go:59 and :103 pass raw account bytes (incl. the 8-byte Anchor discriminator) to `chain.DecodeCorporateAction`/`DecodeSeries`. Use `chain.Client.FetchCorporateAction`/`FetchSeries` (they verify and strip the discriminator). Map `rpc.ErrNotFound`/nil value to `ErrActionNotFound` → HTTP 404.
2. Amounts: scale minor units by the cash mint's decimals (tKZT 2, USDC 6 — read the mint account or `config/devnet.json`) and set the currency label from the cash mint (tKZT/USDC), never hard-coded "KZT".
3. Tests: a reader-level test with a fake RPC returning `discriminator ‖ body` bytes for the brief INTR (10 units, 10%, 180/360 → 50,000 minor with 2 decimals) must render `500.00 tKZT`; a 404 test.

## Acceptance criteria
- [ ] New tests pass; `make verify` green.
