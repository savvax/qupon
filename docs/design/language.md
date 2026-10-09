# Qupon design language v2

Task 1530. The rules every Qupon screen follows, and the primitives that carry them. Tokens live in
`apps/web/src/app/globals.css` (`@theme`); primitives in `apps/web/src/components/ui/`; every primitive in every
state is on `/ui`. Golden screens built on this language: landing `/`, bond dossier `/bonds/[mint]`, action console
`/registrar/actions/[pda]`, sandbox shell `/sandbox/[id]`.

## 1. Principles

1. **Institutional.** Qupon serves a registrar, an issuer and a stock exchange. It looks like a back office that a
   KASE operator would trust: brand green on calm off-white, deep teal-ink for the few dark surfaces, no gradients
   as decoration, no playful illustration.
2. **Calm.** One thing moves at a time, and only to say what changed. Nothing blinks for attention except the step
   that is live right now.
3. **Data-dense where people work, generous where they first land.** Operators get 13 px tables, one-row flows and
   everything above the fold. Judges and the public get 16 px text, air and one clear button.
4. **Provable.** Every claim sits next to its evidence: an amount next to its transaction, a feature next to its
   provenance chip, a calculation next to the on-chain number it reproduces. If we cannot prove it, we say it is
   simulated.
5. **The life of the bond first.** A bond is a sequence of dated events. Pages lead with that sequence (coupon
   sheet, action steps), then the money, then the details.

The one memorable element is the **coupon sheet**: the LifecycleRail draws the bond's events as stubs separated by
perforations, the way bearer-bond coupons were clipped from the certificate. Everything around it stays quiet.

## 2. Type

One family, **Manrope** (Latin + Cyrillic), with tabular figures (`.num`) for every number, date, amount, slot
and signature. No second display face, no monospace for data labels (monospace is reserved for raw documents such
as the KASE notice text).

| Step | Size / line | Use |
|---|---|---|
| `text-micro` | 11 / 16 | chips, legend, axis ticks |
| `text-xs` | 12 / 16 | captions, table meta |
| `text-dense` | 13 / 20 | operator tables, ActionFlow, journal |
| `text-sm` | 14 / 20 | body in cards, public tables |
| `text-base` | 16 / 24 | public body, card titles |
| `text-lg` | 18 / 28 | section titles |
| `text-title` | 28 / 34 | page h1 (dossier, console, sandbox) |
| display | `clamp(1.85rem, …, 2.9rem)` / 1.08 | landing hero only |

Weights: 500 body, 600 labels, 700 headings and amounts, 800 h1/display. Sentence case everywhere; no tracked
all-caps eyebrows on new screens (the legacy DataTable header keeps its caps until it is redone). Line length ≤ 65 ch
for prose (`max-w-[62ch]`, `max-w-2xl`).

## 3. Spacing and shape

4 px base; rhythm 4 · 8 · 12 · 16 · 24 · 40 · 64 · 96. Inside a card: 16 px (phone) / 20 px (desktop). Between
cards in a column: 24 px. Between page sections: 40 px (operator), 64–96 px (landing).

Radii encode hierarchy, not decoration: 8 px chips-in-cards and inputs (`radius-sm`), 10 px buttons and rows
(`radius-btn`), 16 px cards (`radius-card`), 24 px the landing hero only (`radius-hero`). Chips are pills.
Elevation: borders do the work; `shadow-raise` only for floating things (popover, tour card), `shadow-dock` only
for the docked NowBar.

## 4. Colour roles

Brand (kept from v1): KASE green `g600 #028a29` for the primary action and "done/paid"; deep ink `p900 #071d25`
for the hero, the escrow node and "Now" pills; neutrals `n0…n900` with a green cast; page `n50`.

Small text on the `n50` page background uses `n600` or darker (`n500` there is 4.28:1, below AA); `n500` is for
white cards only (4.56:1).

**Status semantics** (each pair ≥ 4.5:1 for 12 px bold text; measured: demo 7.8, bank 6.8, cure 6.6, Defaulted
white-on-red 6.8, simulated 5.9, on-chain 5.8, verified white-on-green 4.5):

| State | Tokens | Where |
|---|---|---|
| Verified on-chain / Paid / Done | `g50` / `g700` (chip), solid `g600` when re-verified | ProvenanceChip `onchain`, `verified`; rail and flow checks |
| In progress / Next | `p900` pill + `g400` live ring | NowBar pill, current step, live stub |
| Simulated | `warn-bg` / `warn-fg`, **dashed** edge + faint hatch | ProvenanceChip `simulated`, paying-agent row, sandbox banner |
| Demo clock | `demo-bg #f1edff` / `demo-fg #4b2fb0` + clock glyph | ProvenanceChip `demo`, CountdownClock |
| Bank route / paid to agent | `bank-bg` / `bank-fg`, `viz-bank` | MoneyFlow agent leg |
| **Defaulted** | solid `default #b4171d`, white text | the loudest state in the system: rail stub, flow step, NowBar `danger` |
| **Cured** | `cure-bg` / `cure-fg` (teal, not plain green) | recovered, but its history stays visible |
| Roadmap | dashed `n300` outline, `n600` text | not built yet |

**Data-viz palette** (MoneyFlow, register shares, votes): `viz-holder #179647`, `viz-tax #c28a1c`,
`viz-bank #2f64c9`, `viz-escrow #0b2f3a`, `viz-short #c2262d`, `viz-pending #cbd4cf`. Distinct in hue and
lightness; never the only carrier of meaning — every band has a labelled row with its amount and status.

## 5. Density modes

| | Operator (cabinets) | Public (landing, dossier, sandbox) |
|---|---|---|
| Body | 13–14 px | 14–16 px |
| Table row | 40 px, `text-dense` | 44–48 px |
| Card padding | 16–20 px | 20–24 px |
| Above the fold | NowBar + ActionFlow + KPIs | NowBar + coupon sheet |
| Phone | NowBar docked above the tab bar (`dock="tabbar"`) | NowBar docked at the bottom (`dock="page"`) |

Phones (390 px): no horizontal page scroll, ever. Tables become row cards; KPIs are a 2 × 2 grid; flows become
vertical rails; the MoneyFlow keeps its bands in a 32 px gutter and moves the issuer above the escrow.

## 6. Motion

- **Transform only.** Entrances and scroll reveals animate `translate`/`scale`, never start at `opacity: 0`.
  Full-page screenshots, print, no-JS and slow devices always show the whole page (this fixed the blank landing).
- Server HTML is the final state; client entrances run only after hydration (`useEntrance`).
- One orchestrated moment per page at most: the landing's hero card replays the six steps of the last payout
  (segments and status chip only; the amount, holders and tx are always the real final values).
- Live state = a box-shadow ring (`.qp-live`) on the current step or stub; the element itself never fades.
- Motion that answers an action is welcome (dialog in, toast in, MoneyFlow band highlight while stepping).
- `prefers-reduced-motion`: every CSS animation/transition collapses to 0.01 ms (global rule); JS motion checks
  `useReducedMotion`. Countdowns tick (text), they do not animate.

## 7. Iconography

24 px grid, 1.75 stroke, round caps (`components/shell/icons.tsx`); 16 px grid, 2 stroke inside chips. Glyphs are
semantic, not decorative: ✓ proven, — stand-in, clock = demo time, ⊕ = anyone can push, ! = defaulted, ↓ = file.
Icons beside text are `aria-hidden`; meaning is always in the text (e.g. "10.00% → 12.00%" is text, not an icon).

## 8. Empty, loading, error

- **Empty** = an invitation with the reason: "No snapshot yet: the register appears here once a record date
  passes." Dashed `n300` border, centred `text-sm n600`, one action if there is one.
- **Loading** = `Skeleton` blocks in the final layout's shape (no spinners for page loads). Live values
  (countdowns, network age) render a fixed-width placeholder until mounted — no layout shift, no hydration drift.
- **Error** = what happened + what to do, in the interface's voice, never an apology. External feeds (kase.kz, the
  activity feed, the RPC slot) degrade their own card, never the page.

## 9. Copy tone

Plain verbs, sentence case, the user's words ("Pay holders", "Fund 5,000.00 ₸", "Declare default"). An action keeps
its name through the flow (button "Pay holders" → step "Paid"). Numbers carry their unit (₸ after the amount, Almaty
dates: RU `01.03.2027`, EN `Mar 1, 2027`). The NowBar is one sentence: what happens next and who may do it.
Terms of art get a GlossaryTerm (dotted underline + definition) the first time they appear on a page.
EN and RU strings live in `messages/{en,ru}` (namespaces `kit`, `sandbox` for this task); a label's box never moves
when the language changes (StableLabel / StableText).

## 10. Trust layer: provenance chips and the network chip

| Chip | Says | Use |
|---|---|---|
| `On-chain ✓` (`onchain`) | recorded by the program; links to the tx/account when given `href` | next to amounts, the bond header, the hero payout |
| `Verified on-chain` (`verified`) | re-checked against devnet (e.g. calculation drawer: re-derived gross = on-chain gross) | proof views |
| `Simulated` (`simulated`) | stand-in for an outside system; dashed + hatch | bank payout, KYC vendor, KASE submission, fixture data |
| `Demo clock` (`demo`) | accelerated series time | sandbox, demo series, countdowns |
| `Roadmap` (`roadmap`) | planned | implemented-vs-simulated block |

`NetworkChip`: "Devnet · slot 451,203,118 · updated 3 s ago" in the public header (polls the cluster every 15 s
outside mock mode). Every transaction signature is an explorer link (`Address kind="tx"`); the dossier exports
the whole journal as CSV ("Export issue audit").

## 11. Primitives

| Primitive | Job | States |
|---|---|---|
| `ProvenanceChip` | where a fact comes from | onchain, verified, simulated, demo, roadmap; linked or not |
| `ActorChip` | who may push a step | anyone (⊕, "Anyone can push"), issuer, registrar, holder, paying agent |
| `NetworkChip` | cluster, slot, freshness | devnet / mainnet, with/without slot, live polling |
| `CountdownClock` | time to a deadline | future, due, passed; demo clock with bond-days |
| `GlossaryTerm` | dotted term + popover definition (native `popover`, anchored where supported) | 17 terms |
| `TourStep` | one coach mark: counter, progress, Back / Next / Skip | first, middle, last |
| `NowBar` | the next step, who, one primary button | default, attention, danger (default), done; docked on phones |
| `LifecycleRail` | the coupon sheet | done, live, upcoming, defaulted, cured, cancelled; coupon, meeting, call, maturity |
| `ActionFlow` | an action's steps with time, tx, actor, planned vs effective record, ISO files | done, current, pending, failed, defaulted, skipped |
| `MoneyFlow` | issuer → escrow → holders / tax vault / paying agent, proportional bands, step-through | paid, mid-payout, defaulted (shortfall), cured, bank leg simulated |

Rules of use: one NowBar per page; ActionFlow at the top of an action page; MoneyFlow under the KPIs; the
LifecycleRail directly under the page header (dossier, sandbox). States the API does not expose yet (Defaulted,
PaidToAgent, demo clock) appear only through fixture props (gallery, sandbox) — never invented in the API client.
