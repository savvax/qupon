# Verified build — qupon_bonds (task 036)

Date: 2026-10-06 (updated after tasks 1301 and 91301) · program id `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd` (devnet)

## Deterministic build

```bash
solana-verify build --library-name qupon_bonds \
  --base-image solanafoundation/solana-verifiable-build:4.3.0
solana-verify get-executable-hash target/deploy/qupon_bonds.so
# fbd258bbba79abf8bfb8f991a9c0b30ef6ce33c84b288acd3557bb92872865f5
```

- solana-verify **0.5.2**. The default image (3.0.1, cargo 1.84) cannot build our
  dependency tree (edition2024) — the `--base-image` pin above is **required**.
- Local `anchor build` (macOS, platform-tools) produces a *different* hash
  (`d4514f67…`) — not wrong, just a different build env; judges must use docker.

## On-chain match

- Current binary (task 1402: partial calls keep units and lower the outstanding face, `fund_action` capped at the
  shortfall, `sweep_escrow`): docker-built .so (633,000 bytes; program account extended by 20,000 bytes) deployed
  with the registrar upgrade authority, tx
  `51Kkq7y1BMPCjHsDCMFLBdaZj15fgaqMPjBRSoaUhtigzSZiRYP1zR5fXmE28zr8yFahVxSCbKVDf6XYktHChgQf`; IDL republished
  (previous verified binaries: 1301 `bbe6b2bf…`, 041 `3d419567…`, 036 `804e0ca8…`).
- `solana-verify get-program-hash QPN1zd… -u devnet` →
  `fbd258bbba79abf8bfb8f991a9c0b30ef6ce33c84b288acd3557bb92872865f5` ✅ matches.

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
