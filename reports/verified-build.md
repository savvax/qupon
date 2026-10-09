# Verified build — qupon_bonds (task 036)

Date: 2026-10-09 (updated after task 1519, plan-15 program wave) · program id `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd` (devnet)

## Deterministic build

```bash
solana-verify build --library-name qupon_bonds \
  --base-image solanafoundation/solana-verifiable-build:4.3.0
solana-verify get-executable-hash target/deploy/qupon_bonds.so
# 4a2e46778847f8b6277194a74ee89e9145fc8c03f8e4e8c9ede3bdda752a3505
```

- solana-verify **0.5.2**. The default image (3.0.1, cargo 1.84) cannot build our
  dependency tree (edition2024) — the `--base-image` pin above is **required**.
- Local `anchor build` (macOS, platform-tools) produces a *different* hash
  (`d4514f67…`) — not wrong, just a different build env; judges must use docker.

## On-chain match

- Current binary (task 1519, plan-15 wave 1510–1515 + review fixes: hook-gated record date, permissionless crank,
  demo clock, default/cure, atomic pay+burn, holder payout routes, disclosure hash, accrued interest on trades):
  docker-built .so (777,600 bytes; program account extended by 200,000 bytes) deployed with the registrar upgrade
  authority, tx `4CRj5VPpCi1jPSPRjjdiWiT718nAP3Zk7dp4v473DR1JBH4WBizvQmwFEgA5d7HXMgQg91GoPgeNyY4hRu4uPwT2`; IDL
  republished (previous verified binaries: 1402 `fbd258bb…`, 1301 `bbe6b2bf…`, 041 `3d419567…`, 036 `804e0ca8…`).
- `solana-verify get-program-hash QPN1zd… -u devnet` →
  `4a2e46778847f8b6277194a74ee89e9145fc8c03f8e4e8c9ede3bdda752a3505` ✅ matches.

## Judges: verify from repo

```bash
cargo install solana-verify --locked   # 0.5.2
solana-verify verify-from-repo https://github.com/savvax/qupon \
  --program-id QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd \
  --library-name qupon_bonds \
  --base-image solanafoundation/solana-verifiable-build:4.3.0
```

Docker required. No `--commit-hash` needed (default branch HEAD; the binary embeds
no git info, so any commit whose `programs/` tree matches produces this hash).

## IDL

`anchor idl fetch QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd --provider.cluster devnet`
works and matches `target/idl/qupon_bonds.json` (published via `ops/deploy.sh`,
Program Metadata Program; see docs/04-stack.md gotcha about RPC for writes).
Explorer: https://explorer.solana.com/address/QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd/idl?cluster=devnet

## Note for future program deploys

`ops/deploy.sh` deploys a local `anchor build` binary — its hash will differ from
the docker build. After any program change, redeploy the docker-built .so (as
above) and update the hash in README + this file:

```bash
solana-verify build --library-name qupon_bonds --base-image solanafoundation/solana-verifiable-build:4.3.0
solana program deploy --url devnet --keypair ~/.config/qupon/registrar.json \
  --program-id QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd target/deploy/qupon_bonds.so
solana-verify get-program-hash QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd -u devnet
```

In a tree where `ops/deploy.sh` ran, `target/deploy/qupon_bonds-keypair.json` is a symlink to a file outside the
repo; the docker build fails on it at the very end — remove the symlink first (the deploy above needs only the
program address). On 2026-10-06 the program was first upgraded with `make deploy` (local build, hash `4723b613…`)
and re-upgraded with the docker build two hours later; the same source, IDL unchanged.
