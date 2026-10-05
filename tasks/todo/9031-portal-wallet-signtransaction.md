---
id: 9031
title: Portal — sign with the wallet's signTransaction (not signMessage); par price; keyless public RPC
agent: claude
tier: T1
depends_on: [031]
verify: make verify
timeout_min: 45
---
## Goal
Review pass: `apps/web/src/lib/walletSigner.ts:44` "signs" transactions with `adapter.signMessage` over the compiled message bytes. Phantom and other wallets refuse or warn on that, so vote and subscribe from the portal cannot work on devnet.

## Read first
- apps/web/src/lib/walletSigner.ts, apps/web/src/app/portal/page.tsx, apps/web/src/components/Providers.tsx
- programs/qupon_bonds/src/instructions/{subscribe.rs,meeting.rs} (subscribe requires price_per_unit == face_value)

## Steps
1. Build the transaction with the generated Kit client as now, compile it to wire bytes, deserialize as a web3.js `VersionedTransaction` (web3.js is allowed in apps/web for wallet glue), call the wallet adapter's `signTransaction` (or `sendTransaction`), then send/confirm. Remove the `signMessage` capability check in `portal/page.tsx`.
2. Subscribe price: read-only, equal to the series face value (`faceValue.minor`), with a note "placement at par"; the total = units × face.
3. `Providers.tsx`: document that `NEXT_PUBLIC_RPC_URL` is shipped to browsers — default `https://api.devnet.solana.com`, never the keyed `RPC_URL` from `.env`.
4. Unit test for the transaction-building helper (no wallet needed): the message has the owner as fee payer/signer and the program id `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd`.

## Acceptance criteria
- [ ] No `signMessage` left in the signing path; tests pass; `make verify` green.
