# Submission — copy-paste blocks per form field

Order: Colosseum first (it gives the project link) → Superteam Earn, KASE side track → Superteam Earn, Superteam Kazakhstan general track. Deadline for all three: **2026-10-13 06:59 UTC (11:59 Almaty)**; target Colosseum by Oct 12 20:00, Earn by 21:00. Fields marked `<<FILL: …>>` need the team's own input; everything else is final.

Facts used below (verify before pasting): program `QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd` (devnet, verifiable build — `reports/verified-build.md`), full devnet run with 69 linked transactions — `reports/demo-full.md`, 50 program tests, repo https://github.com/savvax/qupon (must be **public** or shared with hackathon@colosseum.com before submitting).

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

In Qupon the corporate action is an on-chain object. A bond is a Token-2022 mint that only KYC-registered wallets can hold (frozen by default), with pause, permanent-delegate and close authorities held by the program. For each action (coupon, redemption, early call, bondholder meeting with a terms change) the program pauses the mint at the record date, snapshots every holder into an Entitlement account, and computes gross, tax and net per holder with Kazakhstan market conventions: record date at the start of the last day of the period, 30E/360, rounding once per holder. It recomputes every figure itself, requires the issuer to pre-fund an escrow, pays holders in batches, burns redeemed units, and emits an event for every transition. Votes are weighted by the snapshot; an approved proposal changes the coupon on the series and in the token metadata.

A Go registrar service reconciles the chain against its own calculation and exports ISO 20022 seev.031/seev.036 messages and KASE-style disclosure notices, so depositories and brokers can consume the result with tools they already use.

One command runs coupon payments, a redemption, a bondholder meeting and an early redemption on devnet: 69 transactions, each linked in the repository, with every payout checked against the on-chain entitlement.

Built for the KASE × Superteam Kazakhstan track: KASE is Kazakhstan's first registered digital-asset platform operator and builds on Solana. Qupon is the servicing layer such a platform needs.
```

**Blockchains / tools**
```
Solana (devnet), Token-2022 (Pausable, PermanentDelegate, DefaultAccountState, MetadataPointer/TokenMetadata, MintCloseAuthority), Anchor 1.2, LiteSVM, @solana/kit + Codama, Helius RPC, Circle devnet USDC, Go (solana-go), Next.js, solana-verify
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
All code in the repository was written during the hackathon, between 2026-10-05 and 2026-10-12 (commit history). Third-party open-source dependencies: Anchor, SPL Token-2022, @solana/kit and @solana-program clients (Codama-generated code is checked in under clients/ts/src/generated), LiteSVM, solana-go, chi, modernc sqlite, Next.js, Solana wallet-adapter. AI coding agents (Claude Code; GLM models via pi) were used under the team's direction; product design, specifications, review and decisions are the team's.
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
| Website | `<<FILL: deployed console URL (task 032)>>` |
| Pitch / demo video | `<<FILL: links>>` |
| Official hackathon submission confirmation | Yes · `<<FILL: Colosseum project link>>` · `<<FILL: Colosseum profile link>>` |

**Anything else**
```
Technical overview (architecture, record-date logic, entitlement calculations, settlement flow, Solana components): https://github.com/savvax/qupon/blob/main/docs/TECHNICAL_OVERVIEW.md
Full devnet run with an explorer link for every transaction (coupon, redemption, bondholder meeting → terms change, early redemption): https://github.com/savvax/qupon/blob/main/reports/demo-full.md
Program: QPN1zdVm6PgMdJo4YxemtDxxbUczqaAk9sDsJQsJ2qd (devnet, verifiable build).
Implemented vs simulated: bond token, registry, record date, entitlement math, coupons, redemption, burn/close, voting and terms change run on Solana devnet; fiat KZT is simulated by a test Token-2022 mint (USDC devnet is real), KYC is simulated by registrar-recorded attributes, Swift delivery of the ISO 20022 files and the ARDFM registration of a terms change are simulated, and the KASE notice is generated but not published. Meeting thresholds (50% quorum, 2/3 approval) are series configuration, not a legal claim.
```

Checkboxes: scope ✓ · KYC acknowledgement ✓ (a Kazakhstan identity document must be ready for Sumsub after winning) · Earn profile location Kazakhstan, unchanged for 21+ days.

## Superteam Earn — Superteam Kazakhstan general track

Same fields as above; additionally: program registration done by Oct 8 (`<<FILL: confirm>>`), pitch ≤ 2:00 and demo ≤ 3:00 (the same videos), every member's Colosseum profile complete.

---

## Tweet (≤ 280 characters)
```
Tokenization doesn't end at issuance. Qupon services tokenized bonds on @solana: record date → per-holder entitlements → coupons, redemption, votes → ISO 20022. 69 devnet txs, one command. For the @KASE_official × @SuperteamKZ track at @ColosseumOrg <<FILL: repo or video link>>
```

## Weekly 1-minute updates (Colosseum)
- **Oct 6:** program live on devnet: registry, record date, coupon payment end to end (show `reports/demo-coupon.md`).
- **Oct 9:** all scenarios on devnet with one command (`make demo`), REST API and ISO 20022 export; UI walk-through.
- **Oct 12:** final demo, verified build, what is simulated vs implemented, pilot ask.
