# Verified build — qupon_bonds (task 036)

Date: 2026-10-06 (updated after tasks 1301 and 91301) · program id `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd` (devnet)

## Deterministic build

```bash
solana-verify build --library-name qupon_bonds \
  --base-image solanafoundation/solana-verifiable-build:4.3.0
solana-verify get-executable-hash target/deploy/qupon_bonds.so
# bbe6b2bffcef1f7badda656152e4611fd1c801323bab68f298bb38c3bd4d4183
```

- solana-verify **0.5.2**. The default image (3.0.1, cargo 1.84) cannot build our
  dependency tree (edition2024) — the `--base-image` pin above is **required**.
- Local `anchor build` (macOS, platform-tools) produces a *different* hash
  (`d4514f67…`) — not wrong, just a different build env; judges must use docker.

## On-chain match

- Current binary (tasks 1301 + 91301: `admit_trade` / `release_trade`, the record-date guard for Solana DvP trades,
  re-thaw of a recreated bond account): docker-built .so (619,336 bytes) deployed with the registrar upgrade
  authority, tx `3iErTwXSjU4aNa5NxkEFnfQN2YjuoaCbnvy56PTZCZXqXxdurGspBBjcAb2SHPyDZnZryaDGtU4SGVzxzEcZH3CW`
  (previous verified binaries: 041 `3d419567…`, 036 `804e0ca8…`).
- `solana-verify get-program-hash QPN1zd… -u devnet` →
  `bbe6b2bffcef1f7badda656152e4611fd1c801323bab68f298bb38c3bd4d4183` ✅ matches.

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
