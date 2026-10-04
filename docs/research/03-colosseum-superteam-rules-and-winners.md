# Crypto World's Fair + Superteam KZ × KASE side track — strategy research (as of 2026-10-05)

## 1. Official Colosseum rules (Crypto World's Fair Hackathon Rules PDF, FAQ)

| Topic | Finding |
|---|---|
| Contest period | Starts 6:00am PT Sep 14, 2026; ends **11:59pm PT Oct 12, 2026** → 13 Oct 06:59 UTC = **13 Oct 11:59 Asia/Almaty**. |
| Winners | Announced by December 5, 2026. Multiple evaluation rounds → shortlist → judging panel → 15‑min Zoom interviews. |
| Eligibility | 18+. Excluded: Afghanistan, Belarus, Cuba, Iran, North Korea, Russia, Somalia, Syria, occupied Ukrainian regions, Venezuela, Yemen; OFAC persons; Administrator/Sponsor employees. **Kazakhstan not excluded.** |
| Teams | One team per entrant; one submission per team; no max size stated; every member creates an account; Team Leader adds them; prizes go to the Team Leader. Solo allowed. |
| Pre‑existing code | Allowed with disclosure in the form; only work in the window is judged; misrepresentation → disqualification. Composing with existing protocols encouraged. |
| AI code | No rule; Colosseum has backed founders who built MVPs entirely with AI coding tools. |
| IP / open source | Entrants retain IP; open source not mandatory (judging criterion); private repos allowed with access for hackathon@colosseum.com. All content in English. |
| Portal fields | Product name + description; blockchains/tools; teammates + backgrounds; location; logo; GitHub repo; **2–3‑min pitch video**; **≤3‑min demo video**; GTM + demand validation. |
| Judging | functionality/code quality, impact/TAM, novelty, UX of blockchain integration, open‑source/composability, viability/team; FAQ: founder‑market fit, insight, product+execution, market size, founder communication, viability, traction. |
| Prizes | Contingent on prize acceptance docs + due diligence; wallet may be required; taxes excluded. $30k grand prize; 20 × $15k; $5k public good; $5k university; Solana track $100k = 10 × $10k. |
| Weekly updates | Optional, strongly recommended: 1‑minute video. |

Sources: https://colosseum.com/legal/Crypto%20World's%20Fair%20Hackathon%20Rules.pdf · https://colosseum.com/hackathon · https://colosseum.com/worldsfair

## 2. Superteam Earn side‑track mechanics (from the Earn open‑source repo and public API)
- **Separate submission required** on Earn per side track; multiple side tracks allowed; winners announced shortly after Colosseum winners, by email.
- **KASE listing**: deadline `2026-10-13T06:59:00Z`; region Kazakhstan; token USDG; rewards 700/500/350/250/200; Solana Foundation pays → KYC (Sumsub, Kazakhstan document); winners commitment date `2026-10-27T18:59:59Z`; contact https://t.me/d1asaur; published 25 Sep 2026.
- **Form fields**: Link to Your Submission (required); Tweet Link (optional); Project Name*; Project Description*; Project GitHub Link*; Project Website; Project X Link; Pitch deck/video link*; Official hackathon submission confirmation*; Colosseum project link; Colosseum profile link; "Anything Else?"; scope checkbox; KYC acknowledgement. Editable until deadline.
- **Region enforcement**: Submit button disabled unless the Earn profile location = Kazakhstan; **changing location triggers a 21‑day cooldown** — too late to change now. Pick a submitter whose profile already says Kazakhstan.
- **Two more KZ listings** with the identical deadline: "Colosseum Crypto World's Fair Hackathon | Superteam Kazakhstan Track" ($5,000: 2,000/1,200/800/500 best student/300 first‑time/200 best idea; priorities not restrictions; demo ≤3 min, pitch ≤2 min; program registration deadline Oct 8, Demo Day Oct 10; winners by 11 Nov) and "Superteam Kazakhstan x iDos Games" (games only).
- CWF Earn hub lists 38 side tracks, ~$461k; CertiK audit credits and Adevar pre‑audit credits are also available.

Sources: https://github.com/SuperteamDAO/earn (crypto-worlds-fair.tsx, SubmissionDrawer.tsx, region.ts, locationCooldown.ts, KYCModal.tsx) · https://superteam.fun/api/listings/details/superteam-kazakhstan-x-kase-side-track-corporate-actions-on-blockchain · https://superteam.fun/api/hackathon/crypto-worlds-fair · https://docs.superteam.fun/the-superteam-handbook/community/faqs/superteam-earn-faq

## 3. Past Superteam Kazakhstan side tracks
| Hackathon | Track | Prize | Submissions | Winners |
|---|---|---|---|---|
| Frontier 2026 | Side Track Superteam Kazakhstan | $4,000 | 27 | Cartographer (LLM analytics for Solana DEX data), BalanceX, Seeker Vault |
| Frontier 2026 | Superteam KZ x S1lkPay (payments/fintech/RWA) | $3,000 | 17 | Enclz (on‑chain spend policy for AI agents), SilkGuard, slkp |
| Frontier 2026 | Superteam KZ & METAFORRA | $3,000 | n/a | gulliant‑primitive, Enclz, saul_goodman |
Takeaways: small pools (17–27 entries, 3 prizes); winners linked GitHub/Colosseum pages; the same project won two tracks; announcements slipped 3–10 weeks. **No prior KASE sponsorship of a Superteam/Colosseum track** — this is KASE's first.

## 4. Colosseum RWA/fintech winners and what wins
- Breakout (Jul 2025): CargoBill (tokenized trade‑finance payments), Accelerator Cohort 3.
- Cypherpunk (Dec 2025): RWA track — Autonom, Bore.fi, Legasi, Pencil Finance, Watchtower; stablecoin — MCPay, Credible, Cloak, Mercantill, Sp3nd; attn.markets.
- Frontier (Jun 2026): ODL, Housd, Cesto, Crafts, DashX, KinnectFi, Stablecorp, Dropset.
- Pattern: no pure "bond corporate‑actions" winner yet; winners paired a regulated counterparty with a concrete settlement flow.
- Colosseum guidance (blog "Perfecting your hackathon submission"): pitch ≤3 min, "why, not how": team → problem → user → validation → vision; demo 2–3 min on stack, on‑chain logic, architecture, Solana specifics. Mistakes: >3 min, buzzwords, no team background, weak Solana explanation, inaccessible repos. Judges prioritize founder potential and adaptability; may ask about post‑deadline progress. Repo must show significant work during the hackathon and strategic prioritization. Colosseum Copilot v2 (Claude Code skill) benchmarks a concept against 8,286 past submissions.

Sources: https://blog.colosseum.com/perfecting-your-hackathon-submission/ · https://blog.colosseum.com/announcing-the-winners-of-the-solana-cypherpunk-hackathon/ · https://blog.colosseum.com/announcing-the-winners-of-the-solana-frontier-hackathon/ · https://blog.colosseum.com/breakout-winners-confidential-spl-token-solana-ecosystem-report/ · https://colosseum.com/changelog/copilot-v2

## 5. Solana institutional/tokenization narrative
- Foundation "Overview of institutional RWAs on Solana" (30 Jul 2026): $3.7B non‑stablecoin RWA, 313k holders; BUIDL, BENJI, VBILL, ACRED, Baillie Gifford BAGEY (chain as legal register; subscriptions/redemptions settle in USDC); Token Extensions as the compliance layer (transfer hooks, confidential transfers, permanent delegate = "mint‑wide transfer and burn authority"). https://solana.com/news/overview-of-institutional-real-world-assets-on-solana
- Breakpoint 2026 (London, 15–17 Nov) "The Token Supercycle". https://solana.com/news/the-token-supercycle
- Metaplex MPL‑3643 (Oct 2026): ERC‑3643 equivalent — Identity Registry, Compliance Module, Gate (sRFC‑37 Token ACL), Lifecycle Manager for "yield distribution, vesting, corporate actions, recovery"; mainnet alpha, unaudited, access by form. https://www.metaplex.com/docs/smart-contracts/mpl-3643
- Tokenization Workshop (30 Sep) content not published (UNVERIFIED). Solana Foundation Office Hours Oct 5 17:00 UTC = 22:00 Almaty (https://luma.com/colosseum-rxhx).

## 6. Timeline math (Asia/Almaty)
| Step | Official | Almaty | Latest safe |
|---|---|---|---|
| Colosseum registration + profiles; Leader adds members | before submission | — | 11 Oct 20:00 |
| Weekly update videos | weeks of Sep 14/21/28, Oct 5 | — | post week‑4 update 11–12 Oct |
| Superteam KZ program registration / Demo Day | 8 Oct / 10 Oct | — | 8 Oct 23:59 / attend 10 Oct |
| Colosseum submission | 12 Oct 23:59 PDT | **13 Oct 11:59** | **12 Oct 20:00** |
| Earn KASE + KZ track submissions | 13 Oct 06:59 UTC | 13 Oct 11:59 | 13 Oct 09:00 |
| KASE winners | 27 Oct 18:59:59 UTC | 27 Oct 23:59 | expect slippage |
| General KZ track winners | 11 Nov 19:00 UTC | 12 Nov 00:00 | — |
| Colosseum winners | by 5 Dec 2026 | — | stay reachable for Zoom |

## Checklist for both submissions
**Colosseum**: Team Leader registered; each member's profile complete and added; product name; description; blockchains/tools; logo; location; public GitHub repo with README (architecture, record‑date logic, entitlement math, settlement flow, implemented‑vs‑simulated table, devnet program IDs, test instructions); pitch video 2–3 min (make it 2:00 for the KZ track); demo video ≤3 min with explorer links; GTM + demand validation; disclosure of pre‑existing/third‑party code; Solana track; weekly updates; English only.
**Superteam Earn (KASE; repeat for KZ track)**: submitter's profile location Kazakhstan unchanged 21+ days, wallet attached; link to submission; tweet; project name; description; GitHub; website; X; pitch deck/video; "Official hackathon submission confirmation" = Yes; Colosseum project + profile links; "Anything else" (technical overview, tx links, implemented‑vs‑simulated); scope checkbox + KYC acknowledgement; submit Colosseum first, Earn second.
