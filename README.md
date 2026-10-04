# Qupon (WIP)

**Qupon is the corporate-actions engine for tokenized bonds on Solana** — identify holders → calculate entitlements → settle → record, following Kazakhstan market rules and emitting ISO 20022 messages. Built for the KASE × Superteam Kazakhstan side track of Colosseum's Crypto World's Fair (Solana devnet only).

> Work in progress — full README lands with task 038.

## Implemented vs simulated

| Element | Status |
|---|---|
| Bond token, holder registry, record date, entitlement math, coupon payment, redemption, burn/close, voting, terms change, on-chain events | **Implemented on Solana devnet** |
| Cash leg | Real token transfers: USDC devnet (Circle) and test tKZT (Token-2022); fiat KZT and Evo/digital tenge are **simulated** by our mint |
| KYC | **Simulated**: registrar records attributes (type, residency, tax rate); no KYC provider integrated |
| ISO 20022 seev.031 / seev.036 | Generated from on-chain state; Swift network delivery **simulated** (downloadable files) |
| ARDFM registration of terms change | **Simulated** by registrar signature step |
| KASE disclosure notice | Generated automatically; publication on kase.kz **not** integrated |
| Multisig issuer approval (Squads), SAS KYC attestation | Optional T2; if not shipped, listed as roadmap |

## Quick start

```bash
bash ops/bootstrap.sh   # toolchain (Agave 4.3.0, Anchor 1.2.0, Node 22, pnpm 9, Go 1.25)
make doctor             # check pins
make verify             # build + tests + lint for every component (no network)
```
