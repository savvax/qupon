# 00 — The brief (verbatim requirements, judging, deadlines)

Source: https://superteam.fun/earn/listing/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain (fetched 2026-10-05).
Main hackathon: Colosseum Crypto World's Fair, https://colosseum.com/worldsfair (Sep 14 – Oct 12, 2026).

## Deadlines (all equal; Asia/Almaty = UTC+5)

| What | Official | Almaty | Our target |
|---|---|---|---|
| Colosseum product submission | Oct 12, 2026 23:59 PT | **Oct 13, 11:59** | **Oct 12, 20:00** |
| Superteam Earn: KASE side track | 2026-10-13T06:59Z | Oct 13, 11:59 | Oct 12, 21:00 |
| Superteam Earn: Superteam Kazakhstan general track ($5,000) | 2026-10-13T06:59Z | Oct 13, 11:59 | Oct 12, 21:00 |
| Superteam KZ program registration / Demo Day (general track) | Oct 8 / Oct 10 | — | Oct 8 / attend Oct 10 |
| KASE side-track winners | by Oct 27, 2026 | — | expect slippage |
| Colosseum winners | by Dec 5, 2026 | — | — |

## Challenge (verbatim)

> KASE and Superteam Kazakhstan invite builders to automate corporate actions for tokenized financial instruments using blockchain.
> Build a working prototype that can: **Identify eligible holders → Calculate entitlements → Execute or initiate the action → Record the outcome on-chain**.
> The core on-chain components must be built on Solana.

Eligibility: all teams must also be officially registered for the main hackathon (Colosseum). Listing is regional: Kazakhstan only (Earn profile location must be Kazakhstan; changing location triggers a 21‑day cooldown).

## Required scenarios (every submission must demonstrate all three)

1. **Coupon Payment** — identify tokenized bondholders on a specified record date, calculate each investor's coupon entitlement, execute the payment on-chain or initiate a clearly demonstrated settlement flow.
2. **Bond Redemption** — at maturity identify holders, calculate principal due, execute or initiate settlement, and burn, retire, lock, or otherwise mark the tokens as redeemed.
3. **One Additional Corporate Action** — e.g. early or partial redemption, dividend payment, tender offer or buyback, bondholder voting, modification of instrument terms, token conversion, or another action proposed by the team.

## Minimum prototype requirements

- A test tokenized financial instrument
- Holder registry
- Record-date mechanism
- Entitlement calculation
- Coupon payment
- Bond redemption
- One additional corporate action
- Verifiable on-chain record of the resulting action

External or fiat payment rails may be simulated, but the entitlement logic and Solana-based corporate action flow must be functional.

## Worked example (verbatim) — this is an acceptance test

Face value $1,000; annual coupon 10%; semi-annual; maturity 2 years.
An investor holding 10 bonds on the record date is entitled to **10 × $1,000 × 10% ÷ 2 = $500**.
At maturity the same holder is entitled to **$10,000 principal plus any final coupon due**.
The system should calculate the amounts, initiate or execute settlement, redeem the tokens, and record the action on-chain.

## Submission requirements (KASE track)

- Working prototype
- Demo video
- Source code repository
- Short technical overview covering architecture, record-date logic, entitlement calculations, settlement flow, and Solana components
- Clearly distinguish implemented functionality from simulated integrations

## Judging criteria (KASE track)

| Criterion | Weight |
|---|---|
| Technical Execution — quality and completeness of implementation | 30% |
| Corporate Action Logic — holders, record dates, entitlements, settlement, redemption | 25% |
| Product & UX — clarity and usability | 20% |
| Real-World Applicability — fit into financial-market infrastructure | 15% |
| Innovation — original approaches to automation and lifecycle management | 10% |

Prizes: $700 / $500 / $350 / $250 / $200 in USDG (Solana Foundation pays; KYC with a Kazakhstan document after winning).

## Colosseum requirements (main hackathon)

- Judged only on work done Sep 14 – Oct 12 (commit history matters; disclose any pre-existing code in the form).
- Form: product name + description; blockchains/tools; teammates + backgrounds; location; logo; GitHub repo (public, or private with access for hackathon@colosseum.com); **presentation/pitch video 2–3 min**; **product demo video ≤ 3 min**; go-to-market, demand validation, distribution plans. English only.
- Judging (startup competition): founder–market fit, insight, product + execution, market size, founder communication, viability, traction.
- Weekly 1‑minute video updates strongly recommended.
- Solana ecosystem track: $100,000 (10 × $10,000); grand prize $30,000; 20 × $15,000.

## Superteam Kazakhstan general track (same project, extra $5,000)

Pitch ≤ 2 min on YouTube/Loom/Vimeo, demo ≤ 3 min, repo must be a specific repository, all team members' Colosseum profiles complete, program registration by Oct 8, Demo Day Oct 10. We make the pitch exactly 2:00 so it fits all three submissions.
