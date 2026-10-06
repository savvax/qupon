# Submission — copy-paste blocks per form field

Order: Colosseum first (it gives the project link) → Superteam Earn, KASE side track → Superteam Earn, Superteam Kazakhstan general track. Deadline for all three: **2026-10-13 06:59 UTC (11:59 Almaty)**; target Colosseum by Oct 12 20:00, Earn by 21:00. Fields marked `<<FILL: …>>` need the team's own input; everything else is final.

Facts used below (verify before pasting): program `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd` (devnet, verifiable build — `reports/verified-build.md`), full devnet run with 71 linked transactions — `reports/demo-full.md`, secondary trade through the Solana DvP program with the record-date guard, 21 linked transactions — `reports/demo-trade.md`, 60 program tests, repo https://github.com/savvax/qupon (must be **public** or shared with hackathon@colosseum.com before submitting).

---

## Colosseum (colosseum.com/arena)

**Product name**
```
Qupon
```

**Tagline**
```
Corporate-actions engine for tokenized bonds on Solana
```

**Description** (≤ 300 words)
```
Qupon is the corporate-actions engine for tokenized bonds on Solana: identify holders, calculate entitlements, settle, and record the outcome on-chain.

Tokenization solved issuance, not servicing. Every coupon, redemption and bondholder meeting is still a manual reconciliation between issuer, depository and brokers; the industry spends an estimated $58B a year on corporate-action processing and 46% of event data is still handled manually (Chainlink industry initiative; DTCC).

In Qupon the corporate action is an on-chain object. A bond is a Token-2022 mint that only KYC-attested wallets can hold (frozen by default). For each action (coupon, redemption, early call, bondholder meeting with a terms change) the program pauses the mint at the record date, snapshots every holder and computes gross, tax and net per holder with Kazakhstan conventions (30E/360, rounding once per holder). The issuer pre-funds an escrow, holders are paid in batches, redeemed units are burned, and every transition emits an event. Votes are weighted by the snapshot; an approved proposal changes the coupon on the series and in the token metadata.

Around the engine is a platform: investors sign up, link their own wallet by signature and pass a KYC review that ends in a Solana Attestation Service attestation; holders are notified of every action and payout; bond data comes from kase.kz; settlement runs in any registered token (USDC, or tenge stand-ins for Evo's KZTE); an admin console watches operators and the audit trail. The same build is mainnet-ready behind a typed confirmation.

A Go registrar reconciles the chain and exports ISO 20022 seev.031/seev.036 and KASE-style notices. One command runs every scenario on devnet: 71 linked transactions.

Secondary trades settle on the Solana Foundation's DvP program; Qupon is the servicing layer above.

Built for the KASE × Superteam Kazakhstan track: KASE, Kazakhstan's first registered digital-asset platform operator, builds on Solana.
```

**Blockchains / tools**
```
Solana (devnet), Token-2022 (Pausable, PermanentDelegate, DefaultAccountState, MetadataPointer/TokenMetadata, MintCloseAuthority), Anchor 1.2, LiteSVM, Solana Attestation Service, Solana DvP program (secondary settlement), Wallet Standard, @solana/kit + Codama, Helius RPC, Circle devnet USDC, kase.kz public data, Go (solana-go), Next.js, solana-verify
```

**Location / track:** Kazakhstan · Solana ecosystem

**Team / backgrounds**
```
<<FILL: names, roles, one line each (e.g. Go backend engineer in fintech; lawyer for securities regulation)>>
```

**GitHub:** `https://github.com/savvax/qupon` · **Pitch video (2:00):** `<<FILL: YouTube unlisted link>>` · **Demo video (≤ 3:00):** `<<FILL: YouTube unlisted link>>` · **Logo:** `<<FILL: 512×512 PNG>>`

**Go-to-market and demand validation**
```
Wedge: KASE's digital-asset platform (registered operator #001, building on Solana, tokenized notes first, bonds next) together with the Central Securities Depository, which may now keep the register of tokenized-asset holders. Our first goal is one pilot issue serviced end to end on Solana: registry, record date, coupon, redemption and ISO 20022 output for the depository's existing systems.

Market: KASE lists 765 corporate bond issues from 169 issuers with 16.8 trillion KZT outstanding (KASE, H1 2026 results), and Kazakhstan has over 5 million retail accounts in nominee holding (Forbes.kz). Second market: Solana real-world-asset issuers that distribute yield ad hoc today and have no standard corporate-action events.

Business model: a per-event fee or basis points on coupon flow, white-labelled for depositories and brokers.

Validation: the track is sponsored by the exchange itself. Conversations so far: <<FILL: who you spoke to (role, organisation), what they confirmed>>.
```

**Pre-existing code / third-party disclosure**
```
All code in the repository was written during the hackathon, between 2026-10-05 and 2026-10-12 (commit history). Third-party open-source dependencies: Anchor, SPL Token-2022, @solana/kit and @solana-program clients (Codama-generated code is checked in under clients/ts/src/generated), LiteSVM, solana-go, chi, modernc sqlite, Next.js, Solana wallet-adapter; the Solana Foundation's DvP program (its IDL is vendored for client generation and its devnet binary is a test fixture; the program itself is not ours). AI coding agents (Claude Code; GLM models via pi) were used under the team's direction; product design, specifications, review and decisions are the team's.
```

---

## Superteam Earn — KASE side track

| Field | Value |
|---|---|
| Link to submission | `<<FILL: Colosseum project page>>` |
| Tweet link | `<<FILL: after posting the tweet below>>` |
| Project name | Qupon |
| Description | the Colosseum description above |
| GitHub | `https://github.com/savvax/qupon` |
| Website | `https://qupon.85-192-29-7.sslip.io` — public landing and bond board; all three roles in the browser via one-click demo sign-in at `/login` (issuer, registrar, investor — no wallet needed) |
| Pitch / demo video | `<<FILL: links>>` |
| Official hackathon submission confirmation | Yes · `<<FILL: Colosseum project link>>` · `<<FILL: Colosseum profile link>>` |

**Anything else**
```
Technical overview (architecture, record-date logic, entitlement calculations, settlement flow, Solana components): https://github.com/savvax/qupon/blob/main/docs/TECHNICAL_OVERVIEW.md
Full devnet run with an explorer link for every transaction (coupon, redemption, bondholder meeting → terms change, early redemption): https://github.com/savvax/qupon/blob/main/reports/demo-full.md
Secondary trade settled through the Solana Foundation's DvP program, record date protected (explorer link per transaction): https://github.com/savvax/qupon/blob/main/reports/demo-trade.md
Program: QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd (devnet, verifiable build).
Product tour with screenshots of every role on devnet: https://github.com/savvax/qupon#product-tour--every-role-in-the-browser
Platform v2 (accounts, KYC with on-chain attestation, kase.kz data, tenge cash assets, notifications, admin, mainnet-ready): https://github.com/savvax/qupon#platform-v2--accounts-kyc-kase-data-cash-assets-admin
Live deployment check with screenshots: https://github.com/savvax/qupon/blob/main/reports/live-v2.md
Implemented vs simulated (same wording as the site's table):

| Element | Status |
|---|---|
| Bond token, holder registry, record date, entitlements, coupon payment, redemption, burn and close, voting, terms change, on-chain events | **Implemented** — Running on Solana devnet. |
| Cash leg | **Test tokens** — Real token transfers from an admin-managed registry: devnet USDC (Circle), tKZT and two tenge stand-ins (KZTE-dev, dKZT) with an investor faucet. Evo's KZTE is pre-registered for mainnet, off until its official mint is added. |
| KYC | **Review simulated** — Investors upload documents and a registrar decides by hand — no licensed KYC vendor. Approval is real: a Solana Attestation Service attestation and the on-chain registration. |
| ISO 20022 seev.031 / seev.036 | **Delivery simulated** — Generated from on-chain state; Swift delivery is replaced by downloadable files. |
| ARDFM registration of a terms change | **Simulated** — Represented by a registrar signature step. |
| KASE | **Read only** — Bond data is read from kase.kz and cached; the disclosure notice and package are generated automatically — submission to KASE is simulated. |
| Mainnet | **Ready, not deployed** — Network profile, write confirmations and a dry-run deploy script are in place; everything runs on devnet. |
| Secondary settlement | **Implemented** — Trades between registered investors settle on devnet through the Solana Foundation's DvP program; Qupon admits the escrow, refuses a record date while a trade is open and can return the bonds to the seller. Order matching and a trading venue are not included. |
| Term-sheet import | **Experimental** — pasted KASE text is parsed into series terms by an LLM (Z.ai GLM) with a SIMULATED regex fallback; every field is confirmed by the issuer before issuance. |
| Multisig issuer approval (Squads) | **Roadmap** — Planned. |

Meeting thresholds (quorum 50%, approval ⅔ of votes cast) are series configuration, not a statement of Kazakh law.
```

Checkboxes: scope ✓ · KYC acknowledgement ✓ (a Kazakhstan identity document must be ready for Sumsub after winning) · Earn profile location Kazakhstan, unchanged for 21+ days.

## Superteam Earn — Superteam Kazakhstan general track

Same fields as above; additionally: program registration done by Oct 8 (`<<FILL: confirm>>`), pitch ≤ 2:00 and demo ≤ 3:00 (the same videos), every member's Colosseum profile complete.

---

## Tweet (≤ 280 characters)
```
Tokenization doesn't end at issuance. Qupon services tokenized bonds on @solana: record date → per-holder entitlements → coupons, redemption, votes → ISO 20022. 71 devnet txs, one command. For the @KASE_official × @SuperteamKZ track at @ColosseumOrg <<FILL: repo or video link>>
```

## Weekly 1-minute updates (Colosseum)
- **Oct 6:** program live on devnet: registry, record date, coupon payment end to end (show `reports/demo-coupon.md`).
- **Oct 9:** all scenarios on devnet with one command (`make demo`), REST API and ISO 20022 export; UI walk-through.
- **Oct 12:** final demo, verified build, what is simulated vs implemented, pilot ask.
