# Submission — copy-paste blocks per form field

Order: Colosseum first (it gives the project link) → Superteam Earn, KASE side track → Superteam Earn, Superteam Kazakhstan general track. Deadline for all three: **2026-10-13 06:59 UTC (11:59 Almaty)**; target Colosseum by Oct 12 20:00, Earn by 21:00. Fields marked `<<FILL: …>>` need the team's own input; everything else is final.

## Human checklist — every `<<FILL>>` in this file, one place

- [ ] Make https://github.com/savvax/qupon **public** (or shared with hackathon@colosseum.com)
- [ ] Team names / backgrounds (Colosseum "Team / backgrounds")
- [ ] Pitch video 2:00 and demo video ≤ 3:00 (YouTube unlisted — Colosseum, Earn, tweet)
- [ ] Logo 512×512 PNG
- [ ] Validation conversations (GTM block)
- [ ] Colosseum project page + profile links; program-registration confirm (general KZ track)
- [ ] X link for the Earn forms; tweet posted and its link

Facts used below (verify before pasting): program `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd` (devnet, verifiable build — `reports/verified-build.md`), full devnet run with 60 linked transactions — `reports/demo-full.md`, secondary trade through the Solana DvP program with the record-date guard, 20 linked transactions — `reports/demo-trade.md`, 116 program tests, 28 instructions / 28 events / 44 error codes, repo https://github.com/savvax/qupon (must be **public** or shared with hackathon@colosseum.com before submitting).

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

Tokenization solved issuance, not servicing. Every coupon, redemption and bondholder meeting is still a manual reconciliation between issuer, depository and brokers; the industry spends an estimated $58B a year on corporate-action processing and 46% of event data is still handled manually (DTCC; Chainlink industry initiative).

In Qupon the corporate action is an on-chain object. A bond is a Token-2022 mint that only KYC-attested wallets can hold (frozen by default). For each action (coupon, redemption, early call, meeting) the program gates the record date, snapshots every holder and computes gross, tax and net per holder with Kazakhstan conventions (30E/360, rounding once per holder). The issuer pre-funds an escrow, holders are paid in batches, redeemed units are burned, and every transition emits an event. Votes are weighted by the snapshot; an approved proposal changes the coupon on-chain.

Around the engine is a platform: investor accounts with KYC review ending in a Solana Attestation Service attestation, holder notifications, kase.kz data, settlement in any registered token (USDC or tenge stand-ins), an admin console — mainnet-ready.

A Go registrar reconciles the chain and exports ISO 20022 seev.031/seev.036 and KASE-style notices. One command runs every scenario on devnet: 60 linked transactions. Judges need no account: a sandbox bond lives a coupon cycle in minutes, an autopilot services the curated showcase, and a public /proof page re-verifies every action in the browser.

Holders sign their payout routes, missed payments default and cure on-chain, and DvP trades carry accrued interest.

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

Distribution: white-label through depositories and brokers, whose existing issuer and holder relationships carry the product into every listed issue. The first deployment is a pilot issue on KASE's DFA platform serviced end to end; the same engine is offered to Solana real-world-asset issuers as a hosted servicing API.

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
| Website | `https://qupon.fun` — public landing and bond board; all three roles in the browser via one-click demo sign-in at `/login` (issuer, registrar, investor — no wallet needed) |
| X link | `<<FILL: the project's X (Twitter) link>>` |
| Pitch / demo video | `<<FILL: links>>` |
| Official hackathon submission confirmation | Yes · `<<FILL: Colosseum project link>>` · `<<FILL: Colosseum profile link>>` |

**Anything else**
```
Technical overview (architecture, record-date logic, entitlement calculations, settlement flow, Solana components): https://github.com/savvax/qupon/blob/main/docs/TECHNICAL_OVERVIEW.md
Full devnet run with an explorer link for every transaction (coupon, redemption, bondholder meeting → terms change, early redemption): https://github.com/savvax/qupon/blob/main/reports/demo-full.md
Secondary trade settled through the Solana Foundation's DvP program, record date protected (explorer link per transaction): https://github.com/savvax/qupon/blob/main/reports/demo-trade.md
Judge sandbox — "Try it in 3 minutes": a visitor's own devnet bond whose whole coupon cycle passes in minutes, default and cure included, no sign-in: https://qupon.fun/sandbox/new
Public proof pages that re-verify every action in the browser (plus a static HTML export): https://qupon.fun/proof
Plan-15 instructions on devnet, one report (holder-signed payout routes, default + cure, disclosure hash on-chain, DvP trades with accrued interest, pay + burn in one instruction): https://github.com/savvax/qupon/blob/main/reports/demo-plan15.md
Curated showcase series serviced end to end by the autopilot: https://github.com/savvax/qupon/blob/main/reports/showcase.md
Program: QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd (devnet, verifiable build).
Product tour with screenshots of every role on devnet: https://github.com/savvax/qupon#product-tour--every-role-in-the-browser
Platform v2 (accounts, KYC with on-chain attestation, kase.kz data, tenge cash assets, notifications, admin, mainnet-ready): https://github.com/savvax/qupon#platform-v2--accounts-kyc-kase-data-cash-assets-admin
Live deployment check with screenshots: https://github.com/savvax/qupon/blob/main/reports/live-v2.md
Implemented vs simulated (canonical table — docs/TECHNICAL_OVERVIEW.md, copied verbatim):

| Element | Status |
|---|---|
| Bond token, holder registry, record date, entitlement math, coupon payment, redemption, burn/close, voting, terms change, on-chain events | **Implemented on Solana devnet** |
| Cash leg | Real token transfers: USDC devnet (Circle) and test tKZT (Token-2022); fiat KZT and Evo/digital tenge are **simulated** by our mint |
| KYC | **Attested on-chain, provider simulated**: a KYC-provider keypair issues a Solana Attestation Service attestation per wallet (type, residency, tax rate); `register_investor` refuses a wallet without a live, matching attestation. The provider is a demo keypair, not a licensed KYC firm |
| KYC document review | **Simulated vendor**: documents are uploaded and stored (content-addressed, owner/registrar access only); a registrar decides by hand. Approval produces real SAS attestations and registrations on devnet |
| ISO 20022 seev.031 / seev.036 | Generated from on-chain state; Swift network delivery **simulated** (downloadable files) |
| ARDFM registration of terms change | **Simulated** by registrar signature step |
| KASE disclosure notice | Generated automatically; publication on kase.kz **not** integrated |
| kase.kz | **Read integration** with public kase.kz data (bond terms, schedule, market data — cached); disclosure-package **submission simulated** |
| Secondary settlement | **Implemented on Solana devnet** through the Solana Foundation's DvP program: Qupon admits the trade's bond escrow, refuses a record date while a trade is open and can return escrowed bonds to the seller. Order matching and a trading venue are not included |
| Term-sheet import | **Experimental** — pasted KASE text is parsed into series terms by an LLM (Z.ai GLM) with a SIMULATED regex fallback; every field is confirmed by the issuer before issuance |
| Multisig issuer approval (Squads) | Demo: a 2-of-3 Squads vault is the paying agent and funds a coupon (`make demo-squads`, report `reports/demo-squads.md`); multisig registrar is roadmap |
| Digital tenge / KZT tokens | Devnet stand-ins KZTE-dev and dKZT (our mints, faucet for investors); Evo KZTE on mainnet is registered as a disabled asset pending its official mint — **no mainnet deployment** |
| Mainnet | **Ready, not deployed** — one code base with a network profile per deployment, typed write confirmations and a dry-run deploy script; everything runs on devnet |

Meeting thresholds (quorum 50%, approval ⅔ of votes cast) are series configuration, not a statement of Kazakh law.
```

Checkboxes: scope ✓ · KYC acknowledgement ✓ (a Kazakhstan identity document must be ready for Sumsub after winning) · Earn profile location Kazakhstan, unchanged for 21+ days.

## Superteam Earn — Superteam Kazakhstan general track

Same fields as above; additionally: program registration done by Oct 8 (`<<FILL: confirm>>`), pitch ≤ 2:00 and demo ≤ 3:00 (the same videos), every member's Colosseum profile complete.

---

## Tweet (≤ 280 characters)
```
Tokenization doesn't end at issuance. Qupon services tokenized bonds on @solana: record date → per-holder entitlements → coupons, redemption, votes → ISO 20022. 60 devnet txs, one command. For the @KASE_official × @SuperteamKZ track at @ColosseumOrg <<FILL: repo or video link>>
```

## Weekly 1-minute updates (Colosseum)
- **Oct 6:** program live on devnet: registry, record date, coupon payment end to end (show `reports/demo-coupon.md`).
- **Oct 9:** all scenarios on devnet with one command (`make demo`), REST API and ISO 20022 export; UI walk-through.
- **Oct 12:** final demo, verified build, what is simulated vs implemented, pilot ask.
