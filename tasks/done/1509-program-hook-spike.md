---
id: 1509
title: Spike — transfer-hook gate for the record date (go/no-go for plan 15 D1')
agent: claude
tier: T0
depends_on: []
verify: make verify
timeout_min: 240
---
## Goal
Prove, in LiteSVM with the real Token-2022 and the vendored Solana DvP program, that the Qupon program can act as the
transfer hook of a bond mint and gate transfers by the record date: (1) Anchor 1.2 `execute` with the SPL discriminator;
(2) extra account metas resolved from the series PDA and the token-account owners; (3) DvP Settle passes leg-A extras
through our hook; (4) a direct `execute` call outside a transfer is rejected; (5) after `record_at` a transfer fails
unless both holders are snapshotted, and snapshot-then-transfer in one transaction succeeds; (6) the mint extension set
(TransferHook + DefaultAccountState + PermanentDelegate + Pausable + MetadataPointer/TokenMetadata + MintCloseAuthority)
is accepted; (7) CU cost of a hooked transfer. Outcome: GO (code kept as the base of 1510) or NO-GO (fall back to D1).
