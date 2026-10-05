# UI walkthrough — corporate action from announcement to completion (task 030)

Screen: `/actions/[pda]` (linked from `/series/[mint]` → corporate actions table,
and from the coupon schedule rows once announced).

Every step below is one button press in the browser; each sends
`POST /actions/{pda}/advance` (`{confirm:true, autofund:true}`) through the Go
registrar service, which execs the `qupon` CLI. No terminal is needed after the
service is running (`make demo-coupon` / `ops/` start scripts).

> Screenshots: capture at demo time against devnet (or mock mode:
> `API_MOCKING=enabled pnpm dev`) and drop them next to this file, one per
> phase below, named `ui-<n>-<phase>.png`. Agent environments have no browser,
> so they cannot be produced by task 030 itself.

1. **Announced** — header shows the INTR badge, corp id, mandatory chip, record
   and payment dates, per-unit amounts. Timeline shows "Announce" done with its
   tx signature (explorer link + timestamp from the activity feed).
2. **Strike record date** — button click pauses the mint; timeline "Strike
   record date" turns done with signature; snapshot facts (slot, hash, units,
   holders) appear after finalize.
3. **Snapshot holders / Finalize** — entitlement table fills with the brief's
   numbers (10 → 500.00, 25 → 1,250.00, 65 → 3,250.00 KZT); "Snapshot holders"
   row shows per-batch signatures; "Finalize" stores the snapshot hash.
4. **Fund escrow (issuer)** — funding panel shows escrow balance vs required
   (Σ net + tax + principal) with an underfunded → fully funded transition.
5. **Pay holders** — rows flip to Paid, each with its paid tx explorer link;
   timeline shows x/y holders paid.
6. **Complete** — reconcile panel: run reconcile → OK, expected hash ==
   on-chain hash, totals match. Downloads: seev.031 XML, seev.036 per row +
   ZIP, KASE notice EN/RU with copy (SIMULATED badges on Swift delivery and
   ARDFM steps).
7. **REDM/MCAL extra**: Retire tokens → Close series rows (burn + mint close).
8. **BMET extra**: meeting panel — proposal 10.00% → 12.00%, tally bars,
   quorum/approval thresholds, voting countdown; votes are cast from
   `/portal` (wallet); Finalize meeting → Apply terms change
   (ARDFM registration — SIMULATED badge).

Error UX: failed steps render inline with the on-chain error name
(`TooEarly`, `Underfunded`, `WrongStatus`, …) and a one-line explanation
(`apps/web/src/lib/actionFlow.ts` ERROR_EXPLANATIONS).
