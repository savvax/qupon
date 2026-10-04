# 07 — Submission kit (checklists, scripts, draft texts)

Order: Colosseum first (gives the project link) → Earn KASE side track → Earn Superteam Kazakhstan track. All close 2026‑10‑13 06:59 UTC (11:59 Almaty). Target: Colosseum by Oct 12 20:00, Earn by 21:00.

## Checklist — Colosseum (colosseum.com/arena)
- [ ] Team leader joined Crypto World's Fair; every member has an account + complete profile (bio, location Kazakhstan, socials); leader added members in the submission portal
- [ ] Product name: Qupon · tagline: "Corporate actions engine for tokenized bonds on Solana"
- [ ] Description (≤ 300 words, below) · blockchains/tools: Solana, Token‑2022 (Pausable, PermanentDelegate, DefaultAccountState, Metadata), Anchor 1.2, @solana/kit, Codama, Helius, USDC devnet, Go
- [ ] Logo (PNG 512×512) · location: Kazakhstan · track: Solana ecosystem
- [ ] GitHub repo public, README complete, `docs/TECHNICAL_OVERVIEW.md`, program id, demo links
- [ ] Pitch video 2:00 (YouTube unlisted) · demo video ≤ 3:00 (YouTube unlisted)
- [ ] GTM + demand validation paragraph (below) · disclosure of pre‑existing/third‑party code (below)
- [ ] Weekly 1‑minute updates posted (Oct 6, 9, 12)

## Checklist — Superteam Earn (KASE side track; repeat for the general KZ track)
- [ ] Submitter's Earn profile: location Kazakhstan (unchanged for 21+ days), wallet attached
- [ ] Link to submission = Colosseum project page · tweet link · project name · description · GitHub · website (deployed console) · X link · pitch deck/video link
- [ ] "Official hackathon submission confirmation" = Yes · Colosseum project link · Colosseum profile link
- [ ] "Anything else": link to technical overview, `reports/demo-full.md` with explorer links, implemented‑vs‑simulated table
- [ ] Scope checkbox + KYC acknowledgement (Kazakhstan document ready for Sumsub after winning)
- [ ] General KZ track: program registration done by Oct 8; pitch ≤ 2:00; demo ≤ 3:00; every member's Colosseum profile complete

## Draft: product description (EN, ≤ 300 words — agents refine in task 042)
Qupon is the corporate‑actions engine for tokenized bonds on Solana. Tokenization solved issuance; it did not solve servicing. Every coupon, redemption and bondholder meeting is still a manual, multi‑party reconciliation: the industry spends ~$58B a year on corporate actions, 46% of event data is processed by hand, and over 45% of brokers have lost ≥ $1M to a single error (DTCC, ValueExchange). On Solana, no RWA issuer emits standardized corporate‑action events.

Qupon makes the corporate action a first‑class on‑chain object. A bond is a Token‑2022 mint (frozen by default, pausable, permanent delegate). Investors are onboarded into an on‑chain registry. For each action — coupon (INTR), redemption (REDM), early call (MCAL), bondholder meeting (BMET → CHAN) — the program pauses the mint at the record date, snapshots every holder into an Entitlement account, computes gross/tax/net per holder with Kazakhstan market conventions (record date at the start of the last day of the period, 30/360, holder‑level rounding), requires the issuer to pre‑fund escrow, pays in batches, and records every transition as an event. A Go registrar service schedules actions, reconciles the chain against its own calculation, and exports ISO 20022 seev.031/seev.036 messages and KASE‑style disclosure notices, so custodians and brokers can consume the result with the tools they already have.

Built for the KASE × Superteam Kazakhstan side track. KASE is Kazakhstan's first registered digital‑asset platform operator, builds on Solana and launches tokenized debt first; the Central Securities Depository may now keep the register of tokenized holders. Qupon is the servicing layer that platform will need.

## Draft: GTM and demand validation
Wedge: KASE's DFA platform (launch December 2026, tokenized NBK notes first, bonds next) and the Central Securities Depository as registrar of DFA holders — one pilot issue serviced end‑to‑end on Solana. Second market: Solana RWA issuers (sovereign and corporate bonds) that distribute yield ad hoc today. Business model: per‑event fee or basis points on coupon flow, white‑label for CSDs/brokers. Validation: the track is sponsored by the exchange itself; conversations with [names/roles John collects during the week]; 765 listed corporate bond issues, 169 issuers, 16.8 trn KZT outstanding, 5M+ retail accounts in nominee holding.

## Draft: pre‑existing code disclosure
All code in the repository was written between 2026‑10‑05 and 2026‑10‑12 (see commit history). Third‑party open‑source used as dependencies: Anchor, SPL Token‑2022, @solana/kit and @solana-program clients (Codama‑generated code is checked in under `clients/ts/src/generated`), solana‑go, chi, modernc sqlite, Next.js, wallet‑adapter. AI coding agents (Claude Code, GLM via pi) were used by the team under the team's direction; design, specifications, review and all product decisions are the team's.

## Pitch script 2:00 (EN) — see doc section 10 for the Russian outline
0:00 Who (team, Go backend in fintech + law) · 0:15 Problem with numbers · 0:45 Why now: KASE #001, Solana, December launch, CSD rule · 1:15 What Qupon does (one console frame) · 1:40 Validation, business model, next step: pilot.

## Demo script ≤ 3:00 (EN)
Issuance + KYC gate (30 s) → coupon run with pause/snapshot/entitlements 500/1,250/3,250, fund, pay, complete, explorer, seev.036, KASE notice (60 s) → meeting: proposal 10%→12%, three votes, finalize, metadata updated (40 s) → redemption: principal + final coupon, burn, mint closed (30 s) → implemented‑vs‑simulated, repo, program id (20 s).

## Tweet (≤ 280 chars)
Tokenization doesn't end at issuance. We built Qupon — a corporate‑actions engine for tokenized bonds on @solana: record date → entitlements → coupon/redemption/voting → ISO 20022, for the @KASE_official × @SuperteamKZ track at @ColosseumOrg Crypto World's Fair. Demo + code: [link]
