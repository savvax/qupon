/**
 * The judge sandbox API (task 1524) as the web app uses it — the one place its contract lives; the Go side matches
 * these shapes. Every date-time is a real instant (what is on-chain); the bond's own calendar is derived from
 * `clock` (a demo-clock series: bond day n starts at issueTs + n × daySecs, see `bondDate`).
 *
 *   POST /demo/sandbox                 SandboxCreateRequest → 201 SandboxCreated
 *        429 {code: "demo_throttled"} (3 per IP per hour, 30 per day) · 400 {code: "bad_wallet"} · 502 {code: "executor_failed"}
 *   GET  /demo/sandbox/{id}            → 200 Sandbox · 404 {code: "sandbox_not_found"} (expired after 24 h)
 *   POST /demo/sandbox/{id}/scenario   {kind: ScenarioKind} → 200 SandboxScenario
 *        409 {code: "scenario_unavailable", message} when the bond's state does not allow it (e.g. cure without a default)
 *
 * The browser reaches them through the Next proxies without a session (/api/bo/demo/sandbox…, /api/bo-get/demo/
 * sandbox/<id>); the proxy forwards X-Forwarded-For (rate limits are per visitor, not per web server) and the
 * `qupon_sandbox` cookie (value = sandbox id, set by the proxy on create, 24 h).
 */
import type { Actor } from "@/components/ui/ActorChip";
import type { FlowAction, StepId } from "./actionFlow";
import type {
  ActivityLike,
  Amount,
  EntitlementDTO,
  ScheduleItem,
  SeriesDTO,
} from "./api";
import { boPost } from "./boClient";

export type ScenarioKind =
  "skip_funding" | "cure" | "non_kyc_transfer" | "dvp_trade";
export const SCENARIOS: ScenarioKind[] = [
  "skip_funding",
  "cure",
  "non_kyc_transfer",
  "dvp_trade",
];

/** `requestId` makes the create idempotent: a retried or doubled request returns the same sandbox. */
export type SandboxCreateRequest = { wallet?: string; requestId: string };

/** The demo clock: one bond day lasts `daySecs` real seconds from `issueTs` (unix seconds, = the issue date). */
export type SandboxClock = { daySecs: number; issueTs: number };

export type SandboxLinks = {
  /** the public bond page, "/bonds/<mint>" */
  bond: string;
  /** devnet explorer link of the bond mint */
  explorer: string;
};

export type SandboxCreated = {
  id: string;
  mint: string;
  /** "SBX-4F2KQ1" */
  ticker: string;
  clock: SandboxClock;
  schedule: ScheduleItem[];
  links: SandboxLinks;
};

export type SandboxHolder = {
  owner: string;
  /** "Altyn Capital" for the custodial demo investors, "Your wallet" for the visitor's */
  label: string;
  /** bonds held now (decimal string) */
  units: string;
  /** on-chain payout route; "bank" pays the paying agent, whose bank transfer is SIMULATED */
  route: "wallet" | "bank";
  taxRateBps: number;
  /** `wallet` = the visitor's own wallet (POST {wallet}): SAS-attested, registered and funded by the faucet */
  kind: "demo" | "wallet";
};

/** ActionDTO with the plan-15 states (Defaulted, bank payouts with the paying agent) and the default/cure times. */
export type SandboxAction = FlowAction & {
  defaultedAt?: string | null;
  curedAt?: string | null;
};

/** On-chain Entitlement status 3 = PaidToAgent: paid to the paying agent for a bank-routed holder. */
export type SandboxEntitlement = Omit<EntitlementDTO, "status"> & {
  status: EntitlementDTO["status"] | "PaidToAgent";
};

/** dvp_trade: the program's TradeAccrued event (clean + accrued = the cash leg; accrued < 0 in the ex-coupon window). */
export type TradeAccrued = {
  units: string;
  seller: string;
  buyer: string;
  clean: Amount;
  accrued: Amount;
  cash: Amount;
  accruedDays: number;
  /** civil settlement date on the bond's calendar, YYYY-MM-DD */
  settleDate: string;
};

export type SandboxScenario = {
  kind: ScenarioKind;
  /** unix ms */
  at: number;
  /** devnet transactions it produced; a refused transfer is sent with skipPreflight, so its failed tx is here too */
  signatures: string[];
  /** program / Token-2022 error name of a refusal (non_kyc_transfer), e.g. "AccountFrozen" */
  error?: string | null;
  /** transaction (or simulation) log lines of a refusal */
  logs?: string[];
  trade?: TradeAccrued | null;
};

export type SandboxNext = {
  /** what the autopilot pushes next: a step of the open action, "declare_default", "announce", or null when done */
  step: StepId | "declare_default" | null;
  actor: Actor | null;
  /** unix ms when it becomes possible (record date, payment date, grace day end…), null = now */
  at: number | null;
};

export type Sandbox = {
  id: string;
  clock: SandboxClock;
  /** unix ms when the response was built: the client corrects its own clock by it */
  serverTime: number;
  /** unix ms; after it GET answers 404 */
  expiresAt: number;
  /** the visitor's wallet when it was included (POST {wallet}) */
  wallet: string | null;
  /** false after skip_funding until a cure: the autopilot does not fund the next coupon */
  autofund: boolean;
  series: SeriesDTO & { inDefault?: boolean };
  schedule: ScheduleItem[];
  /** every action of the series, oldest first */
  actions: SandboxAction[];
  holders: SandboxHolder[];
  /** entitlements of the open action (else the latest one); rows appear one by one as the snapshot runs */
  entitlements: SandboxEntitlement[];
  next: SandboxNext;
  /** the series' indexed events, newest first; every row carries its devnet signature */
  activity: ActivityLike[];
  /** scenarios run so far, newest first */
  scenarios: SandboxScenario[];
  links: SandboxLinks;
};

/** Create a sandbox through the session proxy (no sign-in needed); throws BoError (429 demo_throttled…). */
export const createSandbox = (req: SandboxCreateRequest) =>
  boPost<SandboxCreated>("demo/sandbox", req);

/** The /sandbox/new failure card (A91580-2): throttling keeps its own sentence, every other refusal
 * (executor CLI error, an upstream 429 buried in the message, network) reads "devnet busy"; the raw
 * message is never the headline — it goes under the collapsed technical details. */
export function sandboxFailureKind(e: {
  status: number;
  code: string;
  message?: string;
}): "throttled" | "busy" {
  return e.status === 429 || e.code === "demo_throttled" ? "throttled" : "busy";
}

export const runScenario = (id: string, kind: ScenarioKind) =>
  boPost<SandboxScenario>(`demo/sandbox/${id}/scenario`, { kind });

/** Browser poll through /api/bo-get (same origin; mock mode keeps one in-process state). null = gone (404). */
export async function pollSandbox(id: string): Promise<Sandbox | null> {
  const res = await fetch(`/api/bo-get/demo/sandbox/${id}`, {
    cache: "no-store",
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`sandbox ${id}: HTTP ${res.status}`);
  return normalizeSandbox((await res.json()) as Sandbox);
}

/** Activity rows from the Go store may name their action `action_pda` (see ActivityLike): read both as `actionPda`. */
export const normalizeSandbox = (s: Sandbox): Sandbox => ({
  ...s,
  activity: s.activity.map((e) => ({
    ...e,
    actionPda: e.actionPda ?? e.action_pda ?? null,
  })),
});

/** The autopilot's audit rows (`scheduler:pay_batch`, …) name their step, not an indexed event kind (task 91564). */
export const isSchedulerStep = (kind: string) => kind.startsWith("scheduler:");

/** "scheduler:pay_batch" → "pay batch", the {step} of the sandbox.tx.scheduler sentence (task 91564). */
export const schedulerStep = (kind: string) =>
  kind.slice("scheduler:".length).replaceAll("_", " ");

/** Feed rows: a `scheduler:*` audit row is dropped when the indexed event of the same transaction is
 *  present — one sentence and one explorer link per devnet transaction (task 91564). */
export function dedupeFeedActivity(activity: ActivityLike[]): ActivityLike[] {
  const indexed = new Set(
    activity.filter((e) => !isSchedulerStep(e.kind)).map((e) => e.sig),
  );
  return activity.filter(
    (e) => !isSchedulerStep(e.kind) || !indexed.has(e.sig),
  );
}

export const SANDBOX_ID = /^[\w-]{1,40}$/;
/** The visitor's sandbox: httpOnly cookie (value = sandbox id, 24 h) set by the proxy on create. */
export const SANDBOX_COOKIE = "qupon_sandbox";

const DAY = 86_400_000;
/** "YYYY-MM-DD" + n days (UTC civil arithmetic). */
export const addDays = (ymd: string, n: number) =>
  new Date(Date.parse(`${ymd}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** The bond's calendar at real instant `ms`: bond day number since issue and its civil date. */
export function bondDate(
  issueDate: string,
  clock: SandboxClock,
  ms: number,
): { day: number; date: string } {
  const day = Math.max(
    0,
    Math.floor((ms / 1000 - clock.issueTs) / clock.daySecs),
  );
  return { day, date: addDays(issueDate, day) };
}

/** The action the page is about: the open one, else the latest one (null before the first announcement). */
export function currentAction(s: Sandbox): SandboxAction | null {
  const open = s.actions.find(
    (a) => a.status !== "Completed" && a.status !== "Cancelled",
  );
  return open ?? s.actions.at(-1) ?? null;
}
