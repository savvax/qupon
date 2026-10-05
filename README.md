# Qupon (WIP)
[![CI](https://github.com/savvax/qupon/actions/workflows/ci.yml/badge.svg)](https://github.com/savvax/qupon/actions/workflows/ci.yml)

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

## Reproducible build & verification

The deployed program is a deterministic `solana-verify` docker build (solana-verify 0.5.2, image `solanafoundation/solana-verifiable-build:4.3.0`):

- Program id: [`QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd`](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd?cluster=devnet)
- Build hash (SHA-256, on-chain match confirmed): `804e0ca8d39a0812874ef95f85b67cbb2e0b42a515949dda43cdfb7450e84fb9`

```bash
# reproduce the build and compare with the deployed program
cargo install solana-verify --locked   # 0.5.2
solana-verify verify-from-repo https://github.com/savvax/qupon \
  --program-id QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd \
  --library-name qupon_bonds \
  --base-image solanafoundation/solana-verifiable-build:4.3.0

# fetch the published IDL (Program Metadata Program)
anchor idl fetch QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd --provider.cluster devnet
```

The IDL is also readable in the [explorer's IDL tab](https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd/idl?cluster=devnet).
