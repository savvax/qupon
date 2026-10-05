# Verified build — qupon_bonds (task 036)

Date: 2026-10-05 (updated after task 041) · program id `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd` (devnet)

## Deterministic build

```bash
solana-verify build --library-name qupon_bonds \
  --base-image solanafoundation/solana-verifiable-build:4.3.0
solana-verify get-executable-hash target/deploy/qupon_bonds.so
# 3d419567507446c814766547e41b3ea4a539ffc86c21cd57a7c9e2b6dd510ccb
```

- solana-verify **0.5.2**. The default image (3.0.1, cargo 1.84) cannot build our
  dependency tree (edition2024) — the `--base-image` pin above is **required**.
- Local `anchor build` (macOS, platform-tools) produces a *different* hash
  (`d4514f67…`) — not wrong, just a different build env; judges must use docker.

## On-chain match

- Current binary (task 041, SAS KYC attestation in `register_investor`): docker-built .so deployed with the
  registrar upgrade authority, tx `2gLcsLiSogQaWpJkMrG2K5qhT9wNjpyAy45zozNsrXwVsujewZhLAaVMy3z6EixkaaGJp7mJupuz5oE9bqS7FQae`
  (previous verified binaries: 036 `804e0ca8…`).
- `solana-verify get-program-hash QPN1zd… -u devnet` →
  `3d419567507446c814766547e41b3ea4a539ffc86c21cd57a7c9e2b6dd510ccb` ✅ matches.

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
above) and update the hash in README + this file.
