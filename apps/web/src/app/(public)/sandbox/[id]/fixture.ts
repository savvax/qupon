/**
 * Sandbox shell fixture (task 1530): one demo-clock series with the brief's numbers, played frame by frame in the
 * browser. Nothing here touches the API or devnet — the live sandbox engine replaces this data (task 1532).
 * SIMULATED: signatures below are examples, not devnet transactions.
 *
 * Coupon 2 of SWND28: 1,000 ₸ face, 10 % semi-annual (30E/360, 180 days) → 50 ₸ per bond; holders of 10 / 25 / 65
 * bonds get 500 / 1,250 / 3,250 ₸ gross; the non-resident pension fund pays 15 % (487.50 ₸) to the tax vault and
 * takes its 2,762.50 ₸ net through the paying agent to its bank.
 */
import type { Actor } from "@/components/ui/ActorChip";
import type { FlowStepState } from "@/components/ui/ActionFlow";
import type { FlowRecipient } from "@/components/ui/MoneyFlow";
import type { RailNode } from "@/components/ui/LifecycleRail";
import { STEP_ACTOR as FLOW_ACTOR } from "@/lib/actionFlow";

export const CURRENCY = "tKZT";
/** One bond day lasts 2 s: a half-year coupon period plays in 6 minutes. */
export const DAY_SECS = 2;

export const SERIES = {
  ticker: "SWND28",
  name: "Steppe Wind 2028",
  issuer: "Steppe Wind JSC",
  isin: "KZ2C00SWND28",
  faceMinor: "100000",
  rateBps: 1000,
};

const sig = (seed: string) =>
  `${seed}${"5q3vKp9WmT2xRb7NcYh4LdJ8gFs6ZaE1uQw".slice(0, 44 - seed.length)}x7Lm9Q2rT5vY8bN3kC6dF1gH4jW`;

export const HOLDERS = [
  { id: "altyn", name: "Altyn Capital", units: "10", net: "50000", tax: "0", route: "wallet" },
  { id: "dana", name: "Dana K.", units: "25", net: "125000", tax: "0", route: "wallet" },
  { id: "nomad", name: "Nomad Pension", units: "65", net: "276250", tax: "48750", route: "bank" },
] as const;

export const ESCROW_REQUIRED = "500000"; // Σ net + tax

export type Role = "public" | "issuer" | "registrar" | "investor";
export const ROLES: Role[] = ["public", "issuer", "registrar", "investor"];

/** Which sandbox role may press a step's button. `anyone` = every role; the paying agent is played by the registrar. */
export const ROLE_CAN: Record<Actor, Role[]> = {
  anyone: ["public", "issuer", "registrar", "investor"],
  issuer: ["issuer"],
  registrar: ["registrar"],
  holder: ["investor"],
  payingAgent: ["registrar"],
};

export const STEP_IDS = ["announce", "record", "snapshot", "fund", "pay", "complete"] as const;
export type StepId = (typeof STEP_IDS)[number];
/** Who may push each step: the program's own rules (actionFlow.STEP_ACTOR); the record date is the strike. */
export const STEP_ACTOR: Record<StepId, Actor> = {
  announce: FLOW_ACTOR.announce,
  record: FLOW_ACTOR.strike,
  snapshot: FLOW_ACTOR.snapshot,
  fund: FLOW_ACTOR.fund,
  pay: FLOW_ACTOR.pay,
  complete: FLOW_ACTOR.complete,
};

export type Frame = {
  /** sandbox.now.<key> (title), sandbox.nowDetail.<key> (optional second line) */
  now: string;
  tone: "default" | "attention" | "danger" | "done";
  actor?: Actor;
  /** sandbox.btn.<key> */
  button?: string;
  /** Seconds from the frame's start to the deadline the clock counts to (sandbox.clock.<clockKey>). */
  clock?: { key: string; in: number };
  flow: Record<StepId, FlowStepState>;
  /** Escrow funded (minor units) and the money-flow state. */
  funded: string;
  moneyState: "normal" | "defaulted" | "cured";
  legs: Record<string, FlowRecipient["status"]>;
  /** Transactions this frame adds to the feed (sandbox.tx.<key>). */
  tx: { key: string; values?: Record<string, string>; sig: string }[];
  /** The rail status of coupon 2. */
  rail: RailNode["status"];
};

const pending = { altyn: "pending", dana: "pending", nomad: "pending", tax: "pending" } as const;
const paid = { altyn: "paid", dana: "paid", nomad: "agent", tax: "paid" } as const;

export const SCENARIOS: Record<"coupon" | "default", Frame[]> = {
  coupon: [
    {
      now: "announced",
      tone: "default",
      actor: "anyone",
      button: "snapshot",
      clock: { key: "record", in: 40 },
      flow: { announce: "done", record: "current", snapshot: "pending", fund: "pending", pay: "pending", complete: "pending" },
      funded: "0",
      moneyState: "normal",
      legs: pending,
      tx: [],
      rail: "live",
    },
    {
      now: "snapshotted",
      tone: "default",
      actor: "issuer",
      button: "fund",
      clock: { key: "payment", in: 90 },
      flow: { announce: "done", record: "done", snapshot: "done", fund: "current", pay: "pending", complete: "pending" },
      funded: "0",
      moneyState: "normal",
      legs: pending,
      tx: [{ key: "snapshot", values: { n: "3" }, sig: sig("Snap2") }],
      rail: "live",
    },
    {
      now: "funded",
      tone: "default",
      actor: "anyone",
      button: "pay",
      flow: { announce: "done", record: "done", snapshot: "done", fund: "done", pay: "current", complete: "pending" },
      funded: ESCROW_REQUIRED,
      moneyState: "normal",
      legs: pending,
      tx: [{ key: "fund", sig: sig("Fund2") }],
      rail: "live",
    },
    {
      now: "agent",
      tone: "attention",
      actor: "payingAgent",
      button: "confirm",
      flow: { announce: "done", record: "done", snapshot: "done", fund: "done", pay: "done", complete: "current" },
      funded: ESCROW_REQUIRED,
      moneyState: "normal",
      legs: paid,
      tx: [
        { key: "payWallet", values: { who: "Altyn Capital", amount: "500.00" }, sig: sig("PayA") },
        { key: "payWallet", values: { who: "Dana K.", amount: "1,250.00" }, sig: sig("PayD") },
        { key: "payAgent", values: { who: "Nomad Pension", amount: "2,762.50" }, sig: sig("PayN") },
      ],
      rail: "live",
    },
    {
      now: "complete",
      tone: "default",
      actor: "anyone",
      button: "complete",
      flow: { announce: "done", record: "done", snapshot: "done", fund: "done", pay: "done", complete: "current" },
      funded: ESCROW_REQUIRED,
      moneyState: "normal",
      legs: { ...paid, nomad: "paid" },
      tx: [{ key: "bank", values: { who: "Nomad Pension" }, sig: sig("Bank") }],
      rail: "live",
    },
    {
      now: "done",
      tone: "done",
      clock: { key: "next", in: 360 },
      flow: { announce: "done", record: "done", snapshot: "done", fund: "done", pay: "done", complete: "done" },
      funded: ESCROW_REQUIRED,
      moneyState: "normal",
      legs: { ...paid, nomad: "paid" },
      tx: [{ key: "complete", sig: sig("Done2") }],
      rail: "done",
    },
  ],
  default: [
    {
      now: "short",
      tone: "attention",
      actor: "anyone",
      button: "declare",
      clock: { key: "grace", in: 12 },
      flow: { announce: "done", record: "done", snapshot: "done", fund: "current", pay: "pending", complete: "pending" },
      funded: "200000",
      moneyState: "normal",
      legs: pending,
      tx: [],
      rail: "live",
    },
    {
      now: "defaulted",
      tone: "danger",
      actor: "issuer",
      button: "cure",
      flow: { announce: "done", record: "done", snapshot: "done", fund: "defaulted", pay: "pending", complete: "pending" },
      funded: "200000",
      moneyState: "defaulted",
      legs: { altyn: "defaulted", dana: "defaulted", nomad: "defaulted", tax: "defaulted" },
      tx: [{ key: "default", sig: sig("Dflt") }],
      rail: "defaulted",
    },
    {
      now: "cured",
      tone: "default",
      actor: "anyone",
      button: "pay",
      flow: { announce: "done", record: "done", snapshot: "done", fund: "done", pay: "current", complete: "pending" },
      funded: ESCROW_REQUIRED,
      moneyState: "cured",
      legs: pending,
      tx: [{ key: "cure", sig: sig("Cure") }],
      rail: "cured",
    },
    {
      now: "curedPaid",
      tone: "done",
      flow: { announce: "done", record: "done", snapshot: "done", fund: "done", pay: "done", complete: "done" },
      funded: ESCROW_REQUIRED,
      moneyState: "cured",
      legs: { ...paid, nomad: "paid" },
      tx: [
        { key: "payWallet", values: { who: "Altyn Capital", amount: "500.00" }, sig: sig("PayA2") },
        { key: "payWallet", values: { who: "Dana K.", amount: "1,250.00" }, sig: sig("PayD2") },
        { key: "payWallet", values: { who: "Nomad Pension", amount: "2,762.50" }, sig: sig("PayN2") },
        { key: "complete", sig: sig("Done3") },
      ],
      rail: "cured",
    },
  ],
};

/** Coupon 1 and the issue, already on the feed when the sandbox opens (seconds before opening). */
export const HISTORY: { key: string; values?: Record<string, string>; sig: string; ago: number }[] = [
  { key: "complete1", sig: sig("Done1"), ago: 95 },
  { key: "pay1", values: { n: "3" }, sig: sig("Pay1"), ago: 104 },
  { key: "fund1", sig: sig("Fund1"), ago: 131 },
  { key: "snapshot", values: { n: "3" }, sig: sig("Snap1"), ago: 162 },
  { key: "announce", values: { n: "2" }, sig: sig("Ann2"), ago: 60 },
  { key: "issue", sig: sig("Issue"), ago: 400 },
].sort((a, b) => a.ago - b.ago);

/** The rail of the sandbox bond; coupon 2's status follows the frame. Demo-calendar dates. */
export function railNodes(
  title: (key: string, values?: Record<string, string | number>) => string,
  coupon2: RailNode["status"],
): RailNode[] {
  const per = { minor: "5000", currency: CURRENCY };
  return [
    { id: "issue", kind: "issue", title: title("issue"), date: "2026-09-01T00:00:00+05:00", status: "done", statusLabel: title("issued"), txCount: 104 },
    { id: "c1", kind: "coupon", title: title("coupon", { n: 1 }), date: "2027-03-01T00:00:00+05:00", status: "done", amount: per, txCount: 9 },
    { id: "c2", kind: "coupon", title: title("coupon", { n: 2 }), date: "2027-09-01T00:00:00+05:00", status: coupon2, amount: per, txCount: coupon2 === "live" ? undefined : 8 },
    { id: "c3", kind: "coupon", title: title("coupon", { n: 3 }), date: "2028-03-01T00:00:00+05:00", status: "upcoming", amount: per },
    { id: "mat", kind: "maturity", title: title("maturity"), date: "2028-09-01T00:00:00+05:00", status: "upcoming", amount: { minor: "105000", currency: CURRENCY } },
  ];
}

/** Money-flow recipients for a frame. */
export function recipients(
  legs: Frame["legs"],
  unitsLabel: (units: string) => string,
): FlowRecipient[] {
  const holders: FlowRecipient[] = HOLDERS.map((h) => ({
    id: h.id,
    kind: h.route === "bank" && legs[h.id] === "agent" ? "agent" : "holder",
    label: h.route === "bank" && legs[h.id] === "agent" ? "Nomad Pension" : h.name,
    sub: unitsLabel(h.units),
    amount: h.net,
    status: legs[h.id] ?? "pending",
    tx: legs[h.id] === "paid" ? sig(`Pay${h.id.slice(0, 1).toUpperCase()}`) : null,
  }));
  return [
    ...holders,
    {
      id: "tax",
      kind: "tax",
      label: "tax",
      amount: "48750",
      status: legs.tax ?? "pending",
      tx: legs.tax === "paid" ? sig("PayN") : null,
    },
  ];
}
