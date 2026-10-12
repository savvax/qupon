# Qupon — setup and run guide

[Русская версия](SETUP.ru.md) · [User scenarios guide](USAGE.en.md) · [README](../../README.md)

This guide takes you from a clean machine to the whole product running locally on Solana **devnet**:
the Go registrar API and the Next.js web app with the issuer, registrar, investor and admin cabinets.
Every command below was run on macOS (Apple Silicon) on 2026-10-12 while writing this guide.

![make up — the whole stack with one command](img/setup-terminal.gif)

## Contents

1. [Pick a mode](#1-pick-a-mode)
2. [Prerequisites](#2-prerequisites)
3. [Get the code and the toolchain](#3-get-the-code-and-the-toolchain)
4. [Configuration: `.env` and devnet keypairs](#4-configuration-env-and-devnet-keypairs)
5. [Run everything with one command: `make up`](#5-run-everything-with-one-command-make-up)
6. [UI without keys: `MOCK=1 make up`](#6-ui-without-keys-mock1-make-up)
7. [An admin account](#7-an-admin-account)
8. [Tests and the quality gate](#8-tests-and-the-quality-gate)
9. [Devnet scenarios from the terminal](#9-devnet-scenarios-from-the-terminal)
10. [Running the parts separately](#10-running-the-parts-separately)
11. [Deploying to a server](#11-deploying-to-a-server)
12. [Troubleshooting](#12-troubleshooting)

## 1. Pick a mode

| Mode | What you get | Needs |
| --- | --- | --- |
| **Live site** | https://qupon.fun — everything already deployed on devnet | a browser (and Phantom for your own wallet) |
| **`MOCK=1 make up`** | the whole web UI on fixtures, no chain, no keys | Node 22 + pnpm 9 |
| **`make up`** | the real product locally: registrar API + web app, every button sends real devnet transactions | the full toolchain, `.env`, funded devnet operator keypairs |

The program itself is already deployed on devnet (`QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd`); you do **not**
need to deploy it to run the product.

## 2. Prerequisites

| Tool | Version | Used for |
| --- | --- | --- |
| macOS or Debian/Ubuntu | — | `ops/bootstrap.sh` supports both |
| Homebrew (macOS) | any | system packages |
| bash | ≥ 4 (`brew install bash` on macOS) | `ops/wallets.sh` |
| Node.js | 22 | web app, TS client, `qupon` CLI |
| pnpm | 9 | workspace install |
| Go | 1.26 | registrar API |
| Rust + Agave (Solana CLI) | stable + 4.3.x | keypairs, airdrops, program build/tests |
| Anchor | 1.2.x | only for `make verify` / program work |
| jq | any | scripts |
| Phantom / Solflare / Backpack | browser extension | signing as an investor (switch it to **devnet**) |

## 3. Get the code and the toolchain

```bash
git clone https://github.com/savvax/qupon.git
cd qupon
bash ops/bootstrap.sh   # idempotent: Rust, Agave 4.3.0, Anchor 1.2.0 (avm), Node 22, pnpm 9, Go 1.26 (via mise if present)
make doctor             # prints every tool's version and flags anything off-pin
pnpm install            # workspace deps (apps/web, clients/ts); `make up` also does it on first run
```

`make doctor` marks a wrong version with `!!`. Only the web app needs Node/pnpm; the registrar also needs Go and runs the
TypeScript `qupon` CLI (`ops/qupon`) as its executor, so `clients/ts` must be installed.

`make help` lists every target:

```text
  up        ONE COMMAND: registrar API + web app on devnet with demo sign-in (MOCK=1: web on fixtures, no keys)
  verify    THE GATE: build + tests + lint for every existing component (no network)
  api       run the Go registrar locally (loads .env, defaults PROGRAM_ID from config/devnet.json; API_RPC_URL overrides RPC_URL)
  web       run the web app locally
  demo      run the full lifecycle on devnet (S0–S4), write reports/demo-full.md
  ...
```

## 4. Configuration: `.env` and devnet keypairs

### 4.1 `.env`

```bash
cp .env.example .env
```

The variables that matter for running the product:

| Variable | Meaning |
| --- | --- |
| `RPC_URL` | devnet RPC for the registrar and the CLI. A keyed endpoint (Helius etc.) is best; `https://api.devnet.solana.com` works but rate-limits |
| `QUPON_REGISTRAR_KEYPAIR`, `QUPON_ISSUER_KEYPAIR`, `QUPON_PAYING_AGENT_KEYPAIR` | operator keypairs (paths) the registrar's executor signs with |
| `QUPON_INVESTOR1..3_KEYPAIR`, `QUPON_OUTSIDER_KEYPAIR` | demo investors (the one-click "demo investor" is a custodial wallet) and a non-KYC wallet |
| `QUPON_KYC_PROVIDER_KEYPAIR` | the SIMULATED KYC provider that issues Solana Attestation Service attestations |
| `QUPON_SANDBOX_*` | the public sandbox (`/sandbox/new`) rate limits and custodial holders |

`.env` is git-ignored. Never put mainnet keys there.

### 4.2 Keypairs

The keys live outside the repo, in `~/.config/qupon/`.

**A — You are on the team (or have the team's devnet keys).** Copy the team's `~/.config/qupon/*.json` to the same
place. `config/devnet.json` (in git) already points at the series, the tKZT mint and these operator keys, so `make up`
works immediately and you see the same data as https://qupon.fun.

**B — Your own fresh keys.**

```bash
bash ops/wallets.sh            # registrar, issuer, paying-agent, investor1..3, outsider → ~/.config/qupon; airdrops 2 SOL each
solana-keygen new --no-bip39-passphrase -s -o ~/.config/qupon/kyc-provider.json
```

Fund them: `solana airdrop 2 <address> -u devnet`, or https://faucet.solana.com (a GitHub login gives more SOL),
USDC from https://faucet.circle.com. The registrar and the issuer pay the fees and rent for every operator step —
keep ≥ 2 SOL on each.

With fresh keys the existing series, the tKZT mint and the KYC provider in `config/devnet.json` are not yours: the
deployed program accepts KYC attestations only from the demo provider's SAS credential
(`programs/qupon_bonds/src/constants.rs`, `KYC_PROVIDER` in `clients/ts/src/lib/kyc.ts`). A fully independent setup
therefore means building and deploying your own program (`make deploy`, ~3–5 SOL on the registrar) with your provider's
credential, `ops/qupon kyc:setup`, your own test tenge (`clients/ts/scripts/create-tkzt.ts`) and new series from the
issuer wizard. For running and evaluating the product use path A, the live site or `MOCK=1`.

## 5. Run everything with one command: `make up`

```bash
make up
```

This runs [`ops/up.sh`](../../ops/up.sh), which:

1. installs workspace dependencies if `node_modules` is missing;
2. starts the **registrar API** (`make api`) on `:8080` with: one-click demo sign-in (`DEMO_LOGIN=1`), the autopilot
   scheduler (`SCHEDULER=1`, `AUTOFUND=1` — the sandbox and the showcase advance on their own), the in-process RPC
   gateway (`RPC_GATEWAY=1`, shares and paces devnet calls), the leftover test series from
   `config/hidden-series.txt` hidden, and its SQLite mirror in `./.data/registrar.db`;
3. starts the **web app** (`next dev`) on `:3000`, wired to that API (no mocks);
4. stops both on `Ctrl-C`.

Open **http://localhost:3000** → **Sign in** → pick **Issuer**, **Registrar** or **Investor**, or create an investor
account. The first page load compiles for a few seconds; the first registrar start indexes every series from devnet
(the log says `indexed series … count`).

Knobs (environment variables):

| Variable | Default | Example |
| --- | --- | --- |
| `API_PORT` / `WEB_PORT` | `8080` / `3000` | `API_PORT=8180 WEB_PORT=3100 make up` |
| `API_RPC_URL` | `RPC_URL` from `.env` | `API_RPC_URL=https://api.devnet.solana.com make up` — when your keyed RPC is exhausted |
| `QUPON_USERS` | — | back-office accounts, see [§7](#7-an-admin-account) |
| `DEMO_LOGIN`, `SCHEDULER`, `AUTOFUND`, `RPC_GATEWAY` | `1` | set to `0` to switch a feature off |
| `MOCK` | `0` | `MOCK=1 make up` — web only, fixtures |

Health checks:

```bash
curl -s localhost:8080/healthz          # {"status":"ok"}
curl -s localhost:8080/series | jq length
open http://localhost:3000/login
```

## 6. UI without keys: `MOCK=1 make up`

```bash
MOCK=1 make up      # → http://localhost:3000, no registrar, no chain, no keys
```

The web app serves every page from fixtures (`apps/web/src/mocks`): handy for UI work and for a first look. Buttons
"succeed" without touching the chain. The Playwright suite uses the same mode:

```bash
cd apps/web && pnpm exec playwright install chromium && pnpm e2e
```

## 7. An admin account

The admin panel (`/admin`) has no demo button. Create back-office accounts at registrar start:

```bash
QUPON_USERS='[{"email":"admin@qupon.local","name":"Admin","role":"admin","password":"choose-a-12+-char-password"}]' make up
```

Then sign in at `/login` with that email and password. Roles: `issuer`, `registrar`, `admin`; passwords of 12+
characters. Accounts are upserted on every start.

## 8. Tests and the quality gate

```bash
make verify          # Rust crate + Anchor build + 116 program tests + clippy, TS typecheck/lint/tests, Go build/vet/tests, web typecheck/lint, OpenAPI lint
make test-program    # LiteSVM program tests only
make test-go         # Go tests only
make test-ts         # TS tests only
cd apps/web && pnpm test   # web unit tests (vitest)
```

`make verify` needs no network. `make secrets-scan` runs gitleaks over the history.

## 9. Devnet scenarios from the terminal

These send real devnet transactions with the operator keys and write a report where every transaction is a link:

```bash
make demo-coupon     # S1 coupon            → reports/demo-coupon.md
make demo            # S0–S4 full lifecycle → reports/demo-full.md
make demo-trade      # secondary trade via Solana DvP + record-date guard → reports/demo-trade.md
make demo-squads     # 2-of-3 Squads vault as paying agent → reports/demo-squads.md
make demo-seed       # fresh series with 3 KYC'd holders (10/25/65), nothing announced — fresh data for the UI
make demo-ui         # fresh series + an announced coupon to click through in the console
make seed-showcase   # the four curated showcase series the autopilot services
```

## 10. Running the parts separately

```bash
make api                                   # registrar on :8080 (loads .env)
cd apps/web && API_MOCKING=disabled NEXT_PUBLIC_API_MOCKING=disabled \
  NEXT_PUBLIC_API_URL=http://localhost:8080 API_INTERNAL_URL=http://localhost:8080 pnpm dev
```

The CLI the registrar runs is usable on its own: `ops/qupon --help` (JSON on stdout).

## 11. Deploying to a server

```bash
DEPLOY_RPC_URL=https://api.devnet.solana.com bash ops/deploy-vps.sh   # Docker Compose: registrar + web behind HTTPS
```

The script builds the images on the VPS and writes the server-side secrets (`registrar.env`, mode 600). Details:
[`deploy/vps/README.md`](../../deploy/vps/README.md) and the README's *Deployed* section.

## 12. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| registrar log: `status code: 429` / `max usage reached` | the keyed RPC is exhausted or rate-limited → `API_RPC_URL=https://api.devnet.solana.com make up` (or a new key in `.env`) |
| pages say "Registrar API unavailable" or "Nothing to subscribe to" right after start | the web app gives each registrar read 8 s; on public devnet the first reads of many series are slower. Reload after the registrar has indexed; hide test series you don't need (Admin → Series → Hidden) — fewer series, fewer chain reads |
| `rpc gateway: listen tcp 127.0.0.1:8899: bind: address already in use` | another registrar (or `solana-test-validator`) holds the gateway port → stop it, or `RPC_GATEWAY_ADDR=127.0.0.1:8897 make up` |
| the site loses its styles / shows raw HTML | two `next dev` servers in the same checkout share `apps/web/.next`. Run one `make up` per checkout; to recover: stop it, `rm -rf apps/web/.next`, start again |
| port 3000 or 8080 is taken | `WEB_PORT=3100 API_PORT=8180 make up` |
| `needs bash >= 4` from `ops/wallets.sh` | `brew install bash` |
| the investor's wallet does not sign | switch the wallet to devnet: Phantom → Settings → Developer Settings → **Testnet Mode** (Solana Devnet) |
| `make doctor` shows `!! need Agave 4.3.x` | `bash ops/bootstrap.sh` (it re-points `active_release`); only `make verify` / program work needs it |

Next: [all user scenarios with a real wallet →](USAGE.en.md)
