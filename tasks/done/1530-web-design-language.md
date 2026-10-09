---
id: 1530
title: design language v2 + golden screens (Opus)
agent: claude
tier: T0
depends_on: []
verify: make verify
timeout_min: 240
plan: docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
---
## Goal
Implement task 1530 of plan 15 exactly as written below (the plan section is copied verbatim). The acceptance criteria at the end of the section are the definition of done; an Opus reviewer checks them before merge.

## Read first
- AGENTS.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md
- docs/superpowers/plans/2026-10-09-plan15-judge-experience.md (Global Constraints, Review Focus)

## Plan section
### Task 1530: design language v2 + golden screens (Opus)

**Agent:** claude (Opus) · **Depends on:** — (mock mode) · use skills `taste` / `frontend-design`


- Scroll-reveal must never hide content: animate transform only, never start at opacity 0. Full-page screenshot, print and slow devices all show the whole page.
- Hero card shows the last **completed** payout: amount, number of holders, tx link. It never shows "0.00 ₸ · Not paid yet".
- Header has a single primary CTA "Try it in 3 minutes", plus a "View as: Public · Issuer · Registrar · Investor" switch that goes to the demo roles in one click. Connect-wallet is secondary.
- Trust layer appears everywhere: a network chip "Devnet · slot N · updated 3 s ago", Implemented/Simulated/Demo-clock provenance chips next to features, and "Export issue audit (CSV)" on the bond dossier.

**Deliverables:**
- `docs/design/language.md` — principles (institutional, calm, data-dense, provable), type scale, spacing rhythm, color roles (brand green kept, a data-viz palette, status semantics incl. **Defaulted**/**Cured**/**Demo clock**/**Simulated**/**Verified on-chain**), density modes (operator vs public), motion rules, iconography, empty/loading/error patterns, copy tone, provenance chips ("On-chain ✓" / "Simulated" / "Demo clock").
- Tokens v2 in `globals.css` (`@theme`), no breaking renames without codemods.
- New primitives in `apps/web/src/components/ui/`: `LifecycleRail` (a bond's life: issue → coupons → calls/meeting → maturity, each node = action with status, tx count, link), `ActionFlow` (record → snapshot → fund → pay → complete with live state, permissionless badges, planned vs effective record time), `MoneyFlow` (escrow → holders/tax vault/bank agent, amounts), `ProvenanceChip`, `NowBar` (next step, who can do it, one primary button), `GlossaryTerm` (dotted underline + popover), `TourStep`, `CountdownClock` (demo-clock aware).
- **Golden screens** (fully built, en/ru, kk strings via keys): landing hero + "Try it in 3 minutes" CTA; bond dossier `/bonds/[mint]`; action console `/registrar/actions/[pda]`; sandbox shell `/sandbox/[id]` (mock data).
- Gallery `/ui` updated with every primitive in every state.


## Finish
`make verify` green, commits carry `task: 1530`, `reports/worklog/1530.md` written. Print `DONE:1530` or `BLOCKED:1530 <reason>`.
