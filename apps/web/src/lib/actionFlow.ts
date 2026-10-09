/**
 * Action-page flow logic, mirrored from the Go executor (internal/executor
 * NextStep) and the on-chain event set (docs/02-architecture.md): next-step
 * buttons, timeline construction from the activity feed, and one-line
 * explanations for on-chain error names. Pure functions — vitest-covered.
 */
import type { ActionDTO, ActivityLike } from "./api";

/**
 * An action as the flow sees it: the API's `ActionDTO`, plus the plan-15 states the API does not expose yet
 * (docs/design/language.md §11): `Defaulted` (D4) and bank-routed payouts that sit with the paying agent
 * (`PaidToAgent` entitlements, D6). Only fixtures (gallery, sandbox) set them; the API client never invents them.
 */
export type FlowAction = Omit<ActionDTO, "status"> & {
  status: ActionDTO["status"] | "Defaulted";
  /** holders whose payout went to the paying agent (entitlement PaidToAgent) and awaits bank confirmation */
  bankPending?: number;
};

/** One row of an action timeline (stepper + timeline card on the registrar action page). */
export type TimelineStep = {
  id: StepId;
  label: string;
  state: "done" | "current" | "pending" | "failed";
  /** Extra detail under a timeline row: a `steps.detail.*` message key with its values. */
  detail?: StepDetail;
  /** tx signature of the step, when it executed on-chain */
  signature?: string | null;
  /** when the step happened (ISO 8601 with +05:00), shown in Almaty time */
  at?: string | null;
};

export type StepId =
  | "announce"
  | "strike"
  | "snapshot"
  | "finalize"
  | "fund"
  | "pay"
  | "complete"
  | "retire"
  | "close"
  | "sweep"
  | "votes"
  | "meet_finalize"
  | "apply"
  // plan 15 D6: never in a timeline (stepsForKind); nextStep offers it while bank payouts await confirmation
  | "confirm_bank";

/** Console button labels (task 030 wording). */
export const STEP_LABELS: Record<StepId, string> = {
  announce: "Announce",
  strike: "Strike record date",
  snapshot: "Snapshot holders",
  finalize: "Finalize",
  fund: "Fund escrow (issuer)",
  pay: "Pay holders",
  complete: "Complete",
  retire: "Retire tokens",
  close: "Close series",
  sweep: "Sweep escrow",
  votes: "Cast votes (portal)",
  meet_finalize: "Finalize meeting",
  confirm_bank: "Confirm bank payout",
  apply: "Apply terms change (ARDFM registration — SIMULATED)",
};

/** Steps an action kind walks through, in order. */
export function stepsForKind(kind: ActionDTO["kind"]): StepId[] {
  if (kind === "BMET") {
    return [
      "announce",
      "strike",
      "snapshot",
      "finalize",
      "votes",
      "meet_finalize",
      "apply",
    ];
  }
  if (kind === "REDM" || kind === "MCAL") {
    return [
      "announce",
      "strike",
      "snapshot",
      "finalize",
      "fund",
      "pay",
      "complete",
      "retire",
      "close",
    ];
  }
  return [
    "announce",
    "strike",
    "snapshot",
    "finalize",
    "fund",
    "pay",
    "complete",
  ];
}

/** event kind (ingest) or synthetic advance:<step> (Go) → timeline step. */
const EVENT_TO_STEP: Record<string, StepId> = {
  ActionAnnounced: "announce",
  RecordStruck: "strike",
  HolderSnapshotted: "snapshot",
  SnapshotFinalized: "finalize",
  ActionFunded: "fund",
  EntitlementPaid: "pay",
  PaidToAgent: "pay", // plan 15 D6: a bank-routed holder is paid to the paying agent
  ActionCompleted: "complete",
  EscrowSwept: "sweep",
  UnitsRetired: "retire",
  SeriesClosed: "close",
  VoteCast: "votes",
  MeetingFinalized: "meet_finalize",
  TermsChanged: "apply",
  "advance:strike_record": "strike",
  "advance:snapshot_batch": "snapshot",
  "advance:finalize_snapshot": "finalize",
  "advance:fund_action": "fund",
  "advance:pay_batch": "pay",
  "advance:complete_action": "complete",
  "advance:sweep_escrow": "sweep",
  "scheduler:sweep_escrow": "sweep",
  "advance:retire_batch": "retire",
  "advance:close_series": "close",
  "advance:meeting_finalize": "meet_finalize",
  "advance:apply_terms_change": "apply",
};

const DONE_STATUSES: Record<StepId, string[]> = {
  // an Announced action has been announced: the step is done even before its event is indexed
  announce: [
    "Announced",
    "RecordStruck",
    "SnapshotComplete",
    "Funded",
    "Settling",
    "Completed",
    "Retiring",
    "VotingOpen",
    "Finalized",
  ],
  strike: ["RecordStruck"].concat([
    "SnapshotComplete",
    "Funded",
    "Settling",
    "Completed",
    "Retiring",
    "VotingOpen",
    "Finalized",
  ]),
  snapshot: [
    "SnapshotComplete",
    "Funded",
    "Settling",
    "Completed",
    "Retiring",
    "VotingOpen",
    "Finalized",
  ],
  finalize: [
    "SnapshotComplete",
    "Funded",
    "Settling",
    "Completed",
    "Retiring",
    "VotingOpen",
    "Finalized",
  ],
  fund: ["Funded", "Settling", "Completed", "Retiring"],
  pay: ["Completed", "Retiring"],
  complete: ["Completed", "Retiring"],
  retire: [], // derived from holdersRetired below
  close: [], // derived from series status / SeriesClosed event below
  sweep: [], // derived from the sweep activity row below (task 1414)
  votes: ["Finalized"],
  meet_finalize: ["Finalized"],
  apply: [], // BMET Completed — derived below
  confirm_bank: ["Completed", "Retiring"],
};

function stepDone(step: StepId, a: FlowAction, seriesClosed: boolean): boolean {
  if (step === "retire")
    return (
      a.holdersRetired != null &&
      a.holdersSnapshotted != null &&
      a.holdersRetired >= a.holdersSnapshotted &&
      a.holdersSnapshotted > 0
    );
  if (step === "close") return seriesClosed;
  if (step === "apply") return a.status === "Completed" && a.kind === "BMET";
  return DONE_STATUSES[step].includes(a.status);
}

export type StepDetail = {
  key: "snapshotted" | "paid" | "retired" | "voted";
  values: Record<string, number | string>;
};

/** Extra human detail under a timeline row (translated by the page: steps.detail.<key>). */
function stepDetail(step: StepId, a: FlowAction): StepDetail | undefined {
  const hs = a.holdersSnapshotted ?? 0;
  switch (step) {
    case "snapshot":
      return a.status === "RecordStruck"
        ? { key: "snapshotted", values: { count: hs } }
        : undefined;
    case "pay": {
      const paid = a.holdersPaid ?? 0;
      return hs > 0
        ? { key: "paid", values: { done: paid, count: hs } }
        : undefined;
    }
    case "retire": {
      const r = a.holdersRetired ?? 0;
      return hs > 0
        ? { key: "retired", values: { done: r, count: hs } }
        : undefined;
    }
    case "votes": {
      const voted =
        BigInt(a.votesFor ?? "0") +
        BigInt(a.votesAgainst ?? "0") +
        BigInt(a.votesAbstain ?? "0");
      const total = BigInt(a.unitsSnapshotted ?? "0");
      if (a.status !== "VotingOpen" || total === 0n) return undefined;
      return {
        key: "voted",
        values: { done: voted.toString(), count: total.toString() },
      };
    }
    default:
      return undefined;
  }
}

/**
 * Build the vertical timeline: done/current/pending per step, signatures and
 * timestamps from the activity feed (ingested events first, advance:* audit
 * rows as fallback). `seriesClosed` comes from the series status.
 */
export function buildTimeline(
  a: FlowAction,
  activity: ActivityLike[],
  seriesClosed: boolean,
): TimelineStep[] {
  const mine = activity.filter(
    (ev) => ev.actionPda === a.pda || ev.action_pda === a.pda,
  );
  // latest event per step wins (batches repeat HolderSnapshotted/EntitlementPaid)
  const byStep = new Map<StepId, ActivityLike>();
  for (const ev of mine) {
    const step = EVENT_TO_STEP[ev.kind];
    if (step && (!byStep.has(step) || ev.id >= (byStep.get(step)?.id ?? 0)))
      byStep.set(step, ev);
  }
  // BMET finalize_snapshot flips to VotingOpen in the same tx — fold it in.
  if (
    !byStep.has("votes") &&
    a.kind === "BMET" &&
    DONE_STATUSES.votes.includes(a.status)
  ) {
    const fin = byStep.get("finalize");
    if (fin) byStep.set("votes", fin);
  }

  const steps = stepsForKind(a.kind);
  // Task 1414: "Escrow swept" joins the timeline only once a sweep activity row
  // exists — complete/cancel leave no pending sweep step to render.
  if (byStep.has("sweep")) steps.push("sweep");
  const cancelled = a.status === "Cancelled";
  let currentAssigned = false;
  return steps.map((step) => {
    const ev = byStep.get(step);
    let done = stepDone(step, a, seriesClosed) || ev !== undefined;
    let state: TimelineStep["state"];
    if (done) {
      state = "done";
    } else if (cancelled) {
      state = "pending";
    } else if (!currentAssigned) {
      state = "current";
      currentAssigned = true;
      done = false;
    } else {
      state = "pending";
    }
    return {
      id: step,
      label: STEP_LABELS[step],
      state,
      detail: stepDetail(step, a),
      signature: ev?.sig && !ev.sig.startsWith("advance-") ? ev.sig : undefined,
      at: ev
        ? new Date(ev.ts * 1000).toISOString()
        : step === "announce"
          ? (a.announcedAt ?? undefined)
          : undefined,
    };
  });
}

/** The clock a step waits on or races: the NowBar counts down to `at` (CountdownClock; demo-clock aware). */
export type TimeGate = { at: number; kind: "record" | "payment" | "vote" };

export type NextStep = {
  step: StepId | null;
  label?: string;
  wait?: string;
  /** record: the step is next but TooEarly until then; payment: the funding deadline; vote: the voting window */
  gate?: TimeGate;
};

const at = (iso?: string | null) => (iso ? new Date(iso).getTime() : NaN);

/**
 * The step the console can run right now (mirror of executor.NextStep; the
 * chain re-checks every precondition — TooEarly etc. surfaces as an error).
 * `autofund` is always sent by the console: the operator pressing
 * "Fund escrow (issuer)" IS the issuer approval.
 */
export function nextStep(
  a: FlowAction,
  now = Date.now(),
  /** bond mint supply (series.totalIssued): once units_snapshotted reaches it, finalize (executor.NextStep) */
  supply?: bigint,
  /** the series' open secondary trades: strike_record fails with TradesInFlight while any is admitted */
  openTrades = 0,
): NextStep {
  const hs = a.holdersSnapshotted ?? 0;
  switch (a.status) {
    case "Announced":
      if (openTrades > 0)
        return {
          step: null,
          wait: `open secondary trades: settle or cancel them first (${openTrades})`,
        };
      return at(a.recordAt) > now
        ? { step: "strike", label: STEP_LABELS.strike, gate: { at: at(a.recordAt), kind: "record" } }
        : { step: "strike", label: STEP_LABELS.strike };
    case "RecordStruck": {
      // finalize_snapshot needs every outstanding unit in the snapshot (executor.NextStep:
      // units_snapshotted == mint supply). Zero-balance investors are never snapshotted, so
      // counting holders never settles; supply 0 means nothing can be snapshotted at all.
      const units = BigInt(a.unitsSnapshotted ?? "0");
      if (supply !== undefined) {
        if (supply <= 0n)
          return {
            step: null,
            wait: "no bonds outstanding — nothing to snapshot",
          };
        if (units >= supply)
          return { step: "finalize", label: STEP_LABELS.finalize };
      }
      return { step: "snapshot", label: STEP_LABELS.snapshot };
    }
    case "SnapshotComplete":
    case "Defaulted": // the cure is funding: the record-date holders keep their claims (D4)
      return Number.isNaN(at(a.paymentAt))
        ? { step: "fund", label: STEP_LABELS.fund }
        : { step: "fund", label: STEP_LABELS.fund, gate: { at: at(a.paymentAt), kind: "payment" } };
    case "Funded": // Go executor: always pay (idempotent batches → Settling)
      return { step: "pay", label: STEP_LABELS.pay };
    case "Settling":
      if (hs > 0 && (a.holdersPaid ?? 0) < hs)
        return { step: "pay", label: STEP_LABELS.pay };
      if ((a.bankPending ?? 0) > 0)
        return { step: "confirm_bank", label: STEP_LABELS.confirm_bank };
      return { step: "complete", label: STEP_LABELS.complete };
    case "Retiring":
      if ((a.holdersRetired ?? 0) < hs)
        return { step: "retire", label: STEP_LABELS.retire };
      return { step: "close", label: STEP_LABELS.close };
    case "VotingOpen": {
      const voted =
        BigInt(a.votesFor ?? "0") +
        BigInt(a.votesAgainst ?? "0") +
        BigInt(a.votesAbstain ?? "0");
      const total = BigInt(a.unitsSnapshotted ?? "0");
      const open = a.votingEndsAt
        ? new Date(a.votingEndsAt).getTime() > now
        : true;
      if (open && voted < total)
        return a.votingEndsAt
          ? { step: null, wait: "voting still open", gate: { at: at(a.votingEndsAt), kind: "vote" } }
          : { step: null, wait: "voting still open" };
      return { step: "meet_finalize", label: STEP_LABELS.meet_finalize };
    }
    case "Finalized":
      if (a.result === "Approved")
        return { step: "apply", label: STEP_LABELS.apply };
      return {
        step: null,
        wait: `meeting ${a.result?.toLowerCase() ?? "not approved"} — nothing to apply`,
      };
    case "Completed":
      return { step: null, wait: "action completed" };
    case "Cancelled":
      return { step: null, wait: "action cancelled" };
    default:
      return { step: null, wait: `unknown status ${a.status}` };
  }
}

/**
 * On-chain error names (docs/02-architecture.md §Errors) → one-line operator
 * explanation. `explainOnchainError` scans any error text for a known name so
 * CLI stderr, `{"error": …}` and Anchor logs all map.
 */
export const ERROR_EXPLANATIONS: Record<string, string> = {
  Unauthorized:
    "this step needs the registrar or paying-agent key — the configured operator wallet does not match",
  InvalidAuthority:
    "authority mismatch — the step must be signed by the authority stored on-chain",
  InvestorNotActive:
    "the investor record is not Active (never registered or suspended)",
  InvestorSuspended:
    "the investor is suspended — reinstate before snapshotting or paying",
  SeriesNotActive:
    "the series is not Active (matured or closed) for this operation",
  ActionAlreadyOpen:
    "another corporate action is still open — complete or cancel it first",
  InvalidDates:
    "dates violate the Almaty-midnight / period rules (record ≤ payment, period = schedule period)",
  TooEarly:
    "the on-chain clock has not reached the scheduled time yet — wait and retry",
  WrongStatus: "the action is not in the status this instruction requires",
  MintNotPaused:
    "record date was not struck — the mint must be paused while snapshotting",
  MintPaused:
    "the mint is paused for the record window — complete or cancel the action to resume",
  AccountMintMismatch:
    "token account belongs to a different mint than expected",
  AccountOwnerMismatch:
    "token account belongs to a different owner than expected",
  SupplyMismatch:
    "snapshot units ≠ mint supply — a holder is missing, run the snapshot step again",
  Underfunded:
    "escrow holds less than Σ net + tax + principal — fund the escrow first",
  AlreadyProcessed:
    "already processed — the step is idempotent, nothing to redo",
  NothingToDo: "nothing to do (e.g. empty snapshot or already-final action)",
  MathOverflow: "amounts exceed u64 in the integer math — split the batch",
  RoundingDrift: "per-holder rounding drifted from half-up — snapshot again",
  EntitlementCalcMismatch:
    "accrual days do not match the crate day count for the period",
  VotingClosed: "the voting window has ended — votes are no longer accepted",
  VotingOpen:
    "voting is still open — finalize after the deadline or full turnout",
  AlreadyVoted: "this wallet already voted (one vote per snapshot entitlement)",
  NoQuorum:
    "turnout below the quorum threshold — the meeting fails for lack of participation",
  NotApproved: "meeting result is not Approved — there is nothing to apply",
  SupplyNotZero:
    "bond mint supply is not zero — retire every holder before closing the series",
  BatchTooLarge:
    "too many holders for one transaction — the CLI batches automatically, retry",
  InvalidParams:
    "invalid instruction parameters (e.g. price ≠ face value, or a CHAN announce)",
  KycAttestationInvalid:
    "no live KYC attestation (Solana Attestation Service) matching this wallet and its attributes",
  TradesInFlight:
    "the series has open secondary trades — settle or cancel them before the record date",
  TradeStillOpen:
    "the trade's bond escrow still holds bonds — settle or cancel the trade first, or return the bonds to the seller",
  InvalidTrade:
    "not a trade of this series: bond against the series' cash asset, between two active investors, with the registrar or paying agent as settlement authority",
};

const ERROR_NAMES = Object.keys(ERROR_EXPLANATIONS).sort(
  (x, y) => y.length - x.length,
);

/** Extract the first known on-chain error name from any error text. */
export function findOnchainError(text: string): string | undefined {
  return ERROR_NAMES.find((name) => text.includes(name));
}

/** owner → tx signature of their EntitlementPaid event (paid-tx column). */
export function paidTxByOwner(
  activity: ActivityLike[],
  actionPda: string,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const ev of activity) {
    if (ev.kind !== "EntitlementPaid" && ev.kind !== "PaidToAgent") continue;
    const pda = ev.actionPda ?? ev.action_pda;
    if (pda !== actionPda) continue;
    const owner = payloadOwner(ev);
    if (owner && ev.sig && !ev.sig.startsWith("advance-"))
      out.set(owner, ev.sig);
  }
  return out;
}

function payloadOwner(ev: ActivityLike): string | undefined {
  const p = ev.payload as Record<string, unknown> | undefined | null;
  const owner = p?.owner;
  return typeof owner === "string" ? owner : undefined;
}

/**
 * Who may push each step on the deployed program: the crank steps need the registrar or paying agent
 * (`require_operator`), funding the issuer or paying agent, votes the holders. Task 1510 (trustless servicing, D2)
 * makes strike/snapshot/finalize/pay/complete/retire/sweep permissionless — flip them to "anyone" with it, and the
 * console shows the "Anyone can push" badge.
 */
export const STEP_ACTOR: Record<
  StepId,
  "anyone" | "issuer" | "registrar" | "holder" | "payingAgent"
> = {
  announce: "registrar",
  // Permissionless crank (plan 15 D2, task 1510): anyone can push these steps; money only goes where the program says.
  strike: "anyone",
  snapshot: "anyone",
  finalize: "anyone",
  fund: "issuer",
  pay: "anyone",
  complete: "anyone",
  retire: "anyone",
  close: "registrar",
  sweep: "registrar",
  votes: "holder",
  meet_finalize: "registrar",
  apply: "registrar",
  // D6: the paying agent confirms each bank payout with its reference (the bank transfer itself is SIMULATED)
  confirm_bank: "payingAgent",
};
