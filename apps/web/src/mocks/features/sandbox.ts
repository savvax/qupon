import { couponGross, days30E360, divHalfUp } from "../../lib/accrual";
import type { ActivityLike, ScheduleItem } from "../../lib/api";
import type { StepId } from "../../lib/actionFlow";
import {
  addDays,
  type Sandbox,
  type SandboxAction,
  type SandboxCreated,
  type SandboxEntitlement,
  type SandboxHolder,
  type SandboxNext,
  type SandboxScenario,
  type ScenarioKind,
} from "../../lib/sandbox";
import type { MockHandler } from "./types";

/**
 * Mock-mode judge sandbox (task 1532 on the 1524 contract): an event-sourced stand-in for the registrar's autopilot.
 * A sandbox is a seed (creation time + the scenarios run so far); every read replays the bond's life up to "now":
 * issue → coupon 1 → maturity (last coupon + principal, paid and burned atomically), one bond day = 1 s, the
 * brief's numbers (1,000 ₸ face, 10 % semi-annual, 10 / 25 / 65 bonds → 500 / 1,250 / 3,250 ₸, the pension fund
 * pays 15 % tax and takes the bank route). SIMULATED: signatures and addresses are fixtures, nothing touches devnet.
 *
 * `fx-<status>[-suffix]` ids are frozen fixtures, one per state (e2e, design review): the bond stands still at that
 * moment; a scenario run on one unfreezes that instance (use a unique suffix, the bare ids stay pristine).
 */

const DAY = 1000; // ms per bond day (daySecs = 1)
const FACE = 100_000n; // 1,000.00 tKZT
const RATE = 1000; // 10 %
const CUR = "tKZT";
const WALLET_UNITS = 5n;
/** The autopilot leaves the visitor wallet's payout this long for its own Claim, then pays it itself. */
const CLAIM_WINDOW = 60_000;
// custodial demo investors: their own keys, never one of the e2e test wallets (e2e/wallets.ts)
const DEMO_HOLDERS: Omit<SandboxHolder, "units" | "kind">[] = [
  { owner: "A1tynCap1ta1DemoHo1derSandbox1111111111111", label: "Altyn Capital", route: "wallet", taxRateBps: 0 },
  { owner: "DanaKDemoHo1derSandbox111111111111111111111", label: "Dana K.", route: "wallet", taxRateBps: 0 },
  { owner: "NomadPensionDemoHo1derSandbox11111111111111", label: "Nomad Pension", route: "bank", taxRateBps: 1500 },
];
const DEMO_UNITS = [10n, 25n, 65n];

type Seed = {
  id: string;
  createdAt: number;
  wallet: string | null;
  /** scenario times, ms after createdAt */
  skipAt: number | null;
  cureAt: number | null;
  trades: number[];
  refusals: number[];
  scenarios: { kind: ScenarioKind; at: number }[];
  /** frozen fixture: the bond stands at this offset from createdAt (re-anchored on every read) */
  frozen: number | null;
};

type Ev = {
  at: number;
  kind: string;
  actor: NonNullable<SandboxNext["actor"]>;
  action?: number;
  payload: Record<string, string | number | boolean>;
  tx: string;
  /** when the step became possible (record date, payment date, end of the grace day) */
  gate?: number;
};

// ---------- deterministic fixtures for keys and signatures ----------

const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function fake(seed: string, len: number): string {
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  let out = "";
  for (let i = 0; i < len; i++) {
    h = Math.imul(h ^ (h >>> 13), 1597334677) >>> 0;
    out += B58[h % 58];
  }
  return out;
}
const sig = (id: string, tx: string) => fake(`${id}:${tx}`, 88);
const key = (id: string, what: string) => fake(`${id}#${what}`, 44);
const tickerOf = (id: string) =>
  `SBX-${fake(id, 6).toUpperCase().replace(/[^A-Z0-9]/g, "Q")}`;
const iso = (ms: number) =>
  `${new Date(ms + 5 * 3_600_000).toISOString().slice(0, 19)}+05:00`;
const almatyDate = (ms: number) => iso(ms).slice(0, 10);
const amount = (minor: bigint) => ({
  minor: minor.toString(),
  display: `${(Number(minor) / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} KZT`,
  currency: CUR,
});

/** "YYYY-MM-DD" + n months, the day clamped to the month's end. */
function addMonths(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number) as [number, number, number];
  const last = new Date(Date.UTC(y, m - 1 + n + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + n, Math.min(d, last))).toISOString().slice(0, 10);
}
const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

// ---------- the bond's life ----------

type Period = { k: number; start: string; end: string; record: number; payment: number };

/** Coupon 1 and maturity: record date = period end (00:00), payment two days later (docs/03-domain.md). */
function periods(issue: string): Period[] {
  return [1, 2].map((k) => {
    const start = addMonths(issue, 6 * (k - 1));
    const end = addMonths(issue, 6 * k);
    const record = dayDiff(issue, end) * DAY;
    return { k, start, end, record, payment: record + 2 * DAY };
  });
}

type Holding = Omit<SandboxHolder, "units"> & { units: bigint };

function initialHolders(seed: Seed): Holding[] {
  const out: Holding[] = DEMO_HOLDERS.map((h, i) => ({ ...h, kind: "demo", units: DEMO_UNITS[i]! }));
  if (seed.wallet)
    out.push({ owner: seed.wallet, label: "Your wallet", route: "wallet", taxRateBps: 0, kind: "wallet", units: WALLET_UNITS });
  return out;
}

/** One trade = 5 bonds from Dana K. (or the largest holder) to Altyn Capital at clean 100 % + accrued. */
function tradeLeg(hs: Holding[]) {
  const buyer = hs[0]!;
  const seller = hs[1]!.units >= 5n ? hs[1]! : [...hs].sort((a, b) => Number(b.units - a.units))[0]!;
  return { seller, buyer, units: 5n };
}

function accruedAt(issue: string, ps: Period[], at: number, units: bigint) {
  const day = Math.floor(at / DAY);
  const settle = addDays(issue, day);
  const p = ps.find((x) => x.payment > at) ?? ps.at(-1)!;
  const exCoupon = at >= p.record;
  const days = exCoupon ? -days30E360(settle, addDays(issue, p.payment / DAY)) : days30E360(p.start, settle);
  const acc = couponGross(units, FACE, RATE, Math.abs(days));
  return { settle, days, accrued: days < 0 ? -acc : acc };
}

/** Every event of the sandbox's life, as far as the seed's scenarios allow (a default without a cure ends it). */
function lifeOf(seed: Seed, issue: string) {
  const ps = periods(issue);
  const ticker = tickerOf(seed.id);
  const evs: Ev[] = [];
  const push = (at: number, kind: string, actor: Ev["actor"], payload: Ev["payload"] = {}, action?: number, tx?: string, gate?: number) =>
    evs.push({ at, kind, actor, payload, action, tx: tx ?? `${kind}@${at}#${evs.length}`, gate });

  const hs = initialHolders(seed);
  const supply = hs.reduce((a, h) => a + h.units, 0n);
  push(-9000, "SeriesInitialized", "registrar", { ticker, face_value: FACE.toString(), coupon_rate_bps: RATE });
  hs.forEach((h, i) => {
    push(-8000 + i * 900, "InvestorRegistered", "registrar", { owner: h.owner, tax_rate_bps: h.taxRateBps });
    push(-7600 + i * 900, "UnitsIssued", "registrar", { owner: h.owner, units: h.units.toString() });
  });

  // trades move units between holders before the coupons read them
  const trades = [...seed.trades].sort((a, b) => a - b).map((at) => {
    const leg = tradeLeg(hs);
    const { settle, days, accrued } = accruedAt(issue, ps, at, leg.units);
    const clean = FACE * leg.units;
    const t = { at, seller: leg.seller.owner, buyer: leg.buyer.owner, units: leg.units, settle, days, accrued, clean };
    leg.seller.units -= leg.units;
    leg.buyer.units += leg.units;
    const tx = `trade@${at}`;
    push(at, "TradeAdmitted", "registrar", { seller: t.seller, buyer: t.buyer, units: "5", cash_amount: (clean + accrued).toString() }, undefined, `${tx}:admit`);
    push(at + 400, "TradeAccrued", "registrar", { units: "5", seller: t.seller, buyer: t.buyer, clean: clean.toString(), accrued: accrued.toString(), cash_amount: (clean + accrued).toString(), accrued_days: days, settle_ymd: settle }, undefined, tx);
    return t;
  });
  const unitsAt = (owner: string, at: number) => {
    const h0 = initialHolders(seed).find((h) => h.owner === owner)!.units;
    return trades.reduce((u, t) => (t.at >= at ? u : t.seller === owner ? u - t.units : t.buyer === owner ? u + t.units : u), h0);
  };

  type Plan = { k: number; announce: number; record: number; payment: number; holders: Holding[]; fundAt: number | null; defaultAt: number | null; curedAt: number | null; completeAt: number | null };
  const plans: Plan[] = [];
  let announce = 1500;
  let skipUsed = false;
  for (const p of ps) {
    const k = p.k;
    const redm = k === ps.length;
    const R = Math.max(p.record, announce + 500);
    const P = p.payment;
    push(announce, "ActionAnnounced", "registrar", { index: k }, k);
    push(R + 400, "RecordStruck", "anyone", { index: k }, k, undefined, R);
    const holders = initialHolders(seed)
      .map((h) => ({ ...h, units: unitsAt(h.owner, R) }))
      .filter((h) => h.units > 0n);
    const plan: Plan = { k, announce, record: R, payment: P, holders, fundAt: null, defaultAt: null, curedAt: null, completeAt: null };
    plans.push(plan);
    let gross = 0n;
    let tax = 0n;
    holders.forEach((h, i) => {
      const g = couponGross(h.units, FACE, RATE, 180);
      const tx = divHalfUp(g * BigInt(h.taxRateBps), 10_000n);
      gross += g;
      tax += tx;
      push(R + 900 + i * 500, "HolderSnapshotted", "anyone", { owner: h.owner, units: h.units.toString(), gross: g.toString(), tax: tx.toString(), net: (g - tx).toString(), principal: redm ? (FACE * h.units).toString() : "0" }, k);
    });
    const F = R + 900 + holders.length * 500 + 200;
    const principal = redm ? FACE * holders.reduce((a, h) => a + h.units, 0n) : 0n;
    const required = gross + principal;
    push(F, "SnapshotFinalized", "anyone", { units_snapshotted: supply.toString(), holders_snapshotted: holders.length, total_gross: gross.toString(), total_tax: tax.toString(), total_net: (gross - tax).toString() }, k);
    let fundAt = F + 500;
    if (!skipUsed && seed.skipAt !== null && seed.skipAt <= fundAt) {
      skipUsed = true;
      const defaultAt = Math.max(P, F) + DAY + 400;
      plan.defaultAt = defaultAt;
      push(defaultAt, "ActionDefaulted", "anyone", { required: required.toString(), escrow_balance: "0", shortfall: required.toString() }, k, undefined, defaultAt - 400);
      if (seed.cureAt === null || seed.cureAt < defaultAt) break; // in default until someone cures it
      fundAt = seed.cureAt + 300;
      plan.curedAt = fundAt;
      push(fundAt, "ActionFunded", "issuer", { amount: required.toString(), escrow_balance: required.toString(), required: required.toString(), fully_funded: true }, k, `cure@${fundAt}`);
      push(fundAt, "DefaultCured", "issuer", { late_secs: Math.round((fundAt - P) / 1000) }, k, `cure@${fundAt}`);
    } else {
      push(fundAt, "ActionFunded", "issuer", { amount: required.toString(), escrow_balance: required.toString(), required: required.toString(), fully_funded: true }, k);
    }
    plan.fundAt = fundAt;
    const payStart = Math.max(P, fundAt + 300) + 300;
    let last = payStart;
    holders.forEach((h, i) => {
      const at = h.kind === "wallet" ? payStart + CLAIM_WINDOW : payStart + i * 450;
      last = Math.max(last, at);
      const g = couponGross(h.units, FACE, RATE, 180);
      const t = divHalfUp(g * BigInt(h.taxRateBps), 10_000n);
      const paid = g - t + (redm ? FACE * h.units : 0n);
      const tx = `pay@${k}:${h.owner}`;
      push(at, h.route === "bank" ? "PaidToAgent" : "EntitlementPaid", "anyone", { owner: h.owner, [h.route === "bank" ? "amount" : "paid"]: paid.toString(), net: (g - t).toString(), principal: redm ? (FACE * h.units).toString() : "0" }, k, tx, i === 0 ? P : undefined);
      if (redm) push(at, "UnitsRetired", "anyone", { owner: h.owner, units: h.units.toString() }, k, tx);
    });
    const banked = holders.filter((h) => h.route === "bank");
    banked.forEach((h, i) => push(last + 1200 + i * 300, "BankPayoutConfirmed", "payingAgent", { owner: h.owner }, k));
    const completeAt = last + (banked.length ? 1200 + banked.length * 300 : 0) + 800;
    plan.completeAt = completeAt;
    push(completeAt, "ActionCompleted", "anyone", { holders_paid: holders.length, total_paid: (required - tax).toString() }, k);
    if (redm) push(completeAt + 800, "SeriesClosed", "registrar", { total_retired: supply.toString() }, k);
    announce = completeAt + 1000;
  }
  evs.sort((a, b) => a.at - b.at);
  return { ps, evs, plans, trades, supply, ticker, skipUsed };
}

const STEP_OF: Record<string, StepId | "declare_default"> = {
  ActionAnnounced: "announce",
  RecordStruck: "strike",
  HolderSnapshotted: "snapshot",
  SnapshotFinalized: "finalize",
  ActionFunded: "fund",
  EntitlementPaid: "pay",
  PaidToAgent: "pay",
  BankPayoutConfirmed: "confirm_bank",
  ActionCompleted: "complete",
  ActionDefaulted: "declare_default",
  SeriesClosed: "close",
};

/** The sandbox as GET /demo/sandbox/{id} returns it, `rel` ms after creation. */
function view(seed: Seed, rel: number): Sandbox {
  const issueTs = Math.floor(seed.createdAt / 1000);
  const abs = (r: number) => seed.createdAt + r;
  const issue = almatyDate(seed.createdAt);
  const { ps, evs, plans, trades, supply, ticker } = lifeOf(seed, issue);
  const past = evs.filter((e) => e.at <= rel);
  const mint = key(seed.id, "mint");
  const explorer = (kind: "address" | "tx", v: string) => `https://explorer.solana.com/${kind}/${v}?cluster=devnet`;
  const actionPda = (k: number) => key(seed.id, `action${k}`);
  const of = (k: number, kind: string) => past.filter((e) => e.action === k && e.kind === kind);
  const has = (k: number, kind: string) => of(k, kind).length > 0;
  const closed = past.some((e) => e.kind === "SeriesClosed");

  const actions: SandboxAction[] = plans
    .filter((p) => p.announce <= rel)
    .map((p) => {
      const k = p.k;
      const redm = k === ps.length;
      const snaps = of(k, "HolderSnapshotted");
      const paid = past.filter((e) => e.action === k && (e.kind === "EntitlementPaid" || e.kind === "PaidToAgent"));
      const sum = (rows: Ev[], f: string) => rows.reduce((a, e) => a + BigInt(String(e.payload[f] ?? e.payload.amount ?? "0")), 0n);
      const gross = sum(snaps, "gross");
      const tax = sum(snaps, "tax");
      const funded = sum(of(k, "ActionFunded"), "amount");
      const paidOut = sum(paid, "paid"); // EntitlementPaid.paid, PaidToAgent.amount
      // each pay sends the holder's net (+ principal) and its withheld tax to the tax vault
      const paidTax = sum(snaps.filter((s) => paid.some((e) => e.payload.owner === s.payload.owner)), "tax");
      const status: SandboxAction["status"] = has(k, "ActionCompleted")
        ? "Completed"
        : paid.length
          ? "Settling"
          : has(k, "ActionFunded")
            ? "Funded"
            : has(k, "ActionDefaulted")
              ? "Defaulted"
              : has(k, "SnapshotFinalized")
                ? "SnapshotComplete"
                : has(k, "RecordStruck")
                  ? "RecordStruck"
                  : "Announced";
      return {
        pda: actionPda(k),
        seriesMint: mint,
        kind: redm ? "REDM" : "INTR",
        mandatory: "MAND",
        corpId: `${ticker}-${redm ? "REDM" : "INTR"}-000${k}`,
        announcedAt: iso(abs(p.announce)),
        recordAt: iso(abs(ps[k - 1]!.record)),
        paymentAt: iso(abs(p.payment)),
        periodStart: ps[k - 1]!.start,
        periodEnd: ps[k - 1]!.end,
        accrualDays: 180,
        rateBps: RATE,
        perUnitGross: amount(5000n),
        perUnitPrincipal: amount(redm ? FACE : 0n),
        cashMint: key("tKZT", "mint"),
        escrow: key(seed.id, `escrow${k}`),
        escrowBalance: amount(funded - paidOut - paidTax),
        status,
        snapshotSlot: has(k, "RecordStruck") ? 300_000_000 + Math.floor(p.record / 400) : null,
        unitsSnapshotted: snaps.length ? sum(snaps, "units").toString() : null,
        holdersSnapshotted: snaps.length || null,
        holdersPaid: paid.length,
        totalGross: amount(gross),
        totalTax: amount(tax),
        totalNet: amount(gross - tax),
        totalPaid: amount(paidOut + paidTax),
        holdersRetired: redm ? of(k, "UnitsRetired").length : null,
        completedAt: has(k, "ActionCompleted") ? iso(abs(of(k, "ActionCompleted")[0]!.at)) : null,
        explorerUrl: explorer("address", actionPda(k)),
        bankPending: of(k, "PaidToAgent").length - of(k, "BankPayoutConfirmed").length,
        defaultedAt: has(k, "ActionDefaulted") ? iso(abs(of(k, "ActionDefaulted")[0]!.at)) : null,
        curedAt: has(k, "DefaultCured") ? iso(abs(of(k, "DefaultCured")[0]!.at)) : null,
      };
    });

  const open = actions.find((a) => a.status !== "Completed") ?? actions.at(-1);
  const k = open ? actions.indexOf(open) + 1 : 0;
  const entitlements: SandboxEntitlement[] = open
    ? of(k, "HolderSnapshotted").map((e) => {
        const owner = String(e.payload.owner);
        const confirmed = of(k, "BankPayoutConfirmed").some((x) => x.payload.owner === owner);
        const paidEv = past.find((x) => x.action === k && (x.kind === "EntitlementPaid" || x.kind === "PaidToAgent") && x.payload.owner === owner);
        return {
          pda: key(seed.id, `ent${k}:${owner}`),
          actionPda: open.pda,
          owner,
          units: String(e.payload.units),
          gross: amount(BigInt(String(e.payload.gross))),
          tax: amount(BigInt(String(e.payload.tax))),
          net: amount(BigInt(String(e.payload.net))),
          principal: amount(BigInt(String(e.payload.principal))),
          status: !paidEv ? "Snapshotted" : paidEv.kind === "PaidToAgent" && !confirmed ? "PaidToAgent" : "Paid",
          paidAt: paidEv ? iso(abs(paidEv.at)) : null,
        };
      })
    : [];

  const holders: SandboxHolder[] = initialHolders(seed).map((h) => {
    const burned = past.some((e) => e.kind === "UnitsRetired" && e.payload.owner === h.owner);
    const units = trades.reduce((u, t) => (t.at > rel ? u : t.seller === h.owner ? u - t.units : t.buyer === h.owner ? u + t.units : u), h.units);
    return { ...h, units: burned ? "0" : units.toString() };
  });

  // what the autopilot does next; a default waits for the issuer (the cure scenario)
  const upcoming = evs.find((e) => e.at > rel && STEP_OF[e.kind]);
  const defaulted = open?.status === "Defaulted";
  const next: SandboxNext = defaulted
    ? { step: "fund", actor: "issuer", at: null }
    : upcoming
      ? { step: STEP_OF[upcoming.kind]!, actor: upcoming.actor, at: abs(upcoming.gate ?? upcoming.at) }
      : { step: null, actor: null, at: null };

  const activity: ActivityLike[] = past
    .map((e, i) => {
      const s = sig(seed.id, e.tx);
      return {
        id: i + 1,
        ts: Math.floor(abs(e.at) / 1000),
        kind: e.kind,
        sig: s,
        slot: 300_000_000 + Math.floor((e.at + 9000) / 400),
        actionPda: e.action ? actionPda(e.action) : null,
        payload: e.payload,
        explorerUrl: explorer("tx", s),
      };
    })
    .reverse();

  const scenarios: SandboxScenario[] = seed.scenarios
    .filter((s) => s.at <= rel)
    .map((s) => scenarioResult(seed, s, issue, trades))
    .reverse();

  const schedule: ScheduleItem[] = ps.map((p) => {
    const a = actions[p.k - 1];
    return {
      couponNumber: p.k,
      periodStart: p.start,
      periodEnd: p.end,
      recordDate: iso(abs(p.record)),
      paymentDate: iso(abs(p.payment)),
      amountPerUnit: amount(5000n),
      totalAmount: amount(5000n * supply),
      actionPda: a?.pda ?? null,
      status: !a ? "Projected" : a.status === "Completed" ? "Completed" : a.status === "Announced" ? "Announced" : "InProgress",
    };
  });

  return {
    id: seed.id,
    clock: { daySecs: DAY / 1000, issueTs },
    serverTime: abs(rel),
    expiresAt: seed.createdAt + 24 * 3_600_000,
    wallet: seed.wallet,
    autofund: seed.skipAt === null || seed.cureAt !== null,
    series: {
      pda: key(seed.id, "series"),
      mint,
      cashMint: key("tKZT", "mint"),
      issuer: key("sandbox", "issuer"),
      payingAgent: key("sandbox", "agent"),
      isin: `KZ2C0SBX${fake(seed.id, 4).toUpperCase().replace(/[^A-Z0-9]/g, "0")}`,
      ticker,
      faceValue: amount(FACE),
      couponRateBps: RATE,
      frequency: 2,
      dayCount: "THIRTY_360",
      issueDate: issue,
      maturityDate: ps.at(-1)!.end,
      nextCouponDate: iso(abs(ps.find((p) => p.payment > rel)?.payment ?? ps.at(-1)!.payment)),
      status: closed ? "Closed" : "Active",
      totalIssued: closed ? "0" : supply.toString(),
      quorumBps: 5000,
      approvalBps: 5000,
      openAction: open && open.status !== "Completed" ? open.pda : null,
      openTrades: 0,
      explorerUrl: explorer("address", mint),
      inDefault: defaulted,
    },
    schedule,
    actions,
    holders,
    entitlements,
    next,
    activity,
    scenarios,
    links: { bond: `/bonds/${mint}`, explorer: explorer("address", mint) },
  };
}

function scenarioResult(
  seed: Seed,
  s: { kind: ScenarioKind; at: number },
  issue: string,
  trades: ReturnType<typeof lifeOf>["trades"],
): SandboxScenario {
  const at = seed.createdAt + s.at;
  if (s.kind === "non_kyc_transfer")
    return {
      kind: s.kind,
      at,
      signatures: [sig(seed.id, `refused@${s.at}`)],
      error: "AccountFrozen",
      logs: [
        "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb invoke [1]",
        "Program log: Instruction: TransferChecked",
        "Program log: Error: Account is frozen",
        "Program TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb failed: custom program error: 0x11",
      ],
    };
  if (s.kind === "dvp_trade") {
    const t = trades.find((x) => x.at === s.at)!;
    return {
      kind: s.kind,
      at,
      signatures: [sig(seed.id, `trade@${s.at}:admit`), sig(seed.id, `trade@${s.at}`)],
      trade: {
        units: t.units.toString(),
        seller: t.seller,
        buyer: t.buyer,
        clean: amount(t.clean),
        accrued: amount(t.accrued),
        cash: amount(t.clean + t.accrued),
        accruedDays: t.days,
        settleDate: t.settle,
      },
    };
  }
  const life = lifeOf(seed, issue);
  const fundTx = life.evs.find((e) => e.kind === "DefaultCured");
  return {
    kind: s.kind,
    at,
    signatures: s.kind === "cure" && fundTx ? [sig(seed.id, fundTx.tx)] : [],
  };
}

// ---------- store, fixtures, handlers ----------

type Store = { seeds: Map<string, Seed>; byRequest: Map<string, string> };
// globalThis: route handlers and pages may load this module twice in dev; both must see one store
const g = globalThis as typeof globalThis & { __quponSandbox?: Store };
const store: Store = (g.__quponSandbox ??= { seeds: new Map(), byRequest: new Map() });

class MockHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

type Marks = { R1: number; P1: number; R2: number; P2: number };
type Fixture = { at: (m: Marks) => number; skip?: boolean; cure?: (m: Marks) => number; wallet?: boolean; trade?: (m: Marks) => number; refusal?: number };
/** One frozen moment per state of the bond (R = record date, P = payment date of coupon 1 / maturity). */
export const FIXTURES: Record<string, Fixture> = {
  issued: { at: () => 800 },
  announced: { at: (m) => m.R1 - 100_000 },
  snapshot: { at: (m) => m.R1 + 1500 },
  funding: { at: (m) => m.R1 + 2800 },
  funded: { at: (m) => m.R1 + 3400 },
  paying: { at: (m) => m.R1 + 4300 },
  bank: { at: (m) => m.R1 + 5000 },
  paid: { at: (m) => m.R1 + 7000 },
  skipped: { at: (m) => m.R1 + 3500, skip: true },
  defaulted: { at: (m) => m.R1 + 30_000, skip: true },
  cured: { at: (m) => m.R1 + 17_000, skip: true, cure: (m) => m.R1 + 12_000 },
  maturity: { at: (m) => m.R2 + 4300 },
  redeemed: { at: (m) => m.R2 + 30_000 },
  wallet: { at: (m) => m.R1 + 6000, wallet: true },
  trade: { at: (m) => m.R1 - 50_000, trade: (m) => m.R1 - 60_000 },
  refused: { at: () => 8000, refusal: 3000 },
};
const FX = /^fx-([a-z]+)(?:-[\w]+)?$/;
const MOCK_WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";

function marks(createdAt: number): Marks {
  const ps = periods(almatyDate(createdAt));
  return { R1: ps[0]!.record, P1: ps[0]!.payment, R2: ps[1]!.record, P2: ps[1]!.payment };
}

function fixtureSeed(id: string, f: Fixture, now: number): Seed {
  // the offset depends on the calendar (month lengths): settle it against the creation date it implies
  let rel = f.at(marks(now));
  rel = f.at(marks(now - rel));
  const m = marks(now - rel);
  const seed: Seed = {
    id,
    createdAt: now - rel,
    wallet: f.wallet ? MOCK_WALLET : null,
    skipAt: f.skip ? 0 : null,
    cureAt: f.cure ? f.cure(m) : null,
    trades: f.trade ? [f.trade(m)] : [],
    refusals: f.refusal !== undefined ? [f.refusal] : [],
    scenarios: [],
    frozen: rel,
  };
  if (f.skip) seed.scenarios.push({ kind: "skip_funding", at: 0 });
  if (seed.cureAt !== null) seed.scenarios.push({ kind: "cure", at: seed.cureAt });
  for (const at of seed.trades) seed.scenarios.push({ kind: "dvp_trade", at });
  for (const at of seed.refusals) seed.scenarios.push({ kind: "non_kyc_transfer", at });
  return seed;
}

/** The seed behind an id: a stored sandbox, or a fixture (bare ids are rebuilt on every read). */
function seedOf(id: string, now: number): Seed | undefined {
  const stored = store.seeds.get(id);
  if (stored) {
    if (stored.frozen !== null) stored.createdAt = now - stored.frozen;
    return stored;
  }
  const fx = FX.exec(id);
  const f = fx ? FIXTURES[fx[1]!] : undefined;
  if (!f) return undefined;
  const seed = fixtureSeed(id, f, now);
  if (id !== `fx-${fx![1]}`) store.seeds.set(id, seed);
  return seed;
}

/** GET /demo/sandbox/{id} at `now` (exported for the unit test). */
export function mockSandbox(id: string, now = Date.now()): Sandbox | undefined {
  const seed = seedOf(id, now);
  return seed && view(seed, seed.frozen ?? now - seed.createdAt);
}

export function mockCreate(body: { wallet?: string; requestId?: string }, now = Date.now()): SandboxCreated {
  const requestId = String(body.requestId ?? "");
  if (requestId.startsWith("throttle"))
    throw new MockHttpError(429, "demo_throttled", "3 sandboxes per visitor per hour");
  const wallet = body.wallet ? String(body.wallet) : null;
  if (wallet !== null && !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(wallet))
    throw new MockHttpError(400, "bad_wallet", "not a base58 Solana address");
  let id = store.byRequest.get(requestId);
  if (!id) {
    id = fake(`${requestId}:${now}`, 8).toLowerCase();
    store.seeds.set(id, { id, createdAt: now, wallet, skipAt: null, cureAt: null, trades: [], refusals: [], scenarios: [], frozen: null });
    if (requestId) store.byRequest.set(requestId, id);
  }
  const s = mockSandbox(id, now)!;
  return { id, mint: s.series.mint, ticker: s.series.ticker, clock: s.clock, schedule: s.schedule, links: s.links };
}

export function mockScenario(id: string, kind: ScenarioKind, now = Date.now()): SandboxScenario {
  const seed = seedOf(id, now);
  if (!seed) throw new MockHttpError(404, "sandbox_not_found", "sandbox not found or expired");
  if (!store.seeds.has(id)) throw new MockHttpError(409, "scenario_unavailable", "bare fixtures are read-only: add a suffix");
  const rel = seed.frozen ?? now - seed.createdAt;
  const s = view(seed, rel);
  const unavailable = (why: string) => new MockHttpError(409, "scenario_unavailable", why);
  if (s.series.status === "Closed" && kind !== "cure") throw unavailable("the series is redeemed and closed");
  if (kind === "skip_funding") {
    if (seed.skipAt !== null) throw unavailable("funding is already skipped");
    const probe = lifeOf({ ...seed, skipAt: rel }, almatyDate(seed.createdAt));
    if (!probe.skipUsed) throw unavailable("no coupon is left to fund");
    seed.skipAt = rel;
  } else if (kind === "cure") {
    if (!s.series.inDefault) throw unavailable("nothing to cure: no coupon is in default");
    seed.cureAt = rel;
  } else if (kind === "dvp_trade") seed.trades.push(rel);
  else if (kind === "non_kyc_transfer") seed.refusals.push(rel);
  else throw new MockHttpError(400, "bad_kind", `unknown scenario ${kind}`);
  seed.scenarios.push({ kind, at: rel });
  if (seed.frozen !== null) seed.frozen = null; // a scenario unfreezes the instance: it lives on from here
  return view(seed, rel + 1).scenarios[0]!;
}

export const handlers: MockHandler[] = [
  {
    method: "POST",
    path: /^\/demo\/sandbox$/,
    reply: (_m, body) => mockCreate((body ?? {}) as { wallet?: string; requestId?: string }),
  },
  {
    method: "GET",
    path: /^\/demo\/sandbox\/([\w-]{1,40})$/,
    reply: (m) => {
      const s = mockSandbox(m[1]!);
      if (!s) throw new MockHttpError(404, "sandbox_not_found", "sandbox not found or expired");
      return s;
    },
  },
  {
    method: "POST",
    path: /^\/demo\/sandbox\/([\w-]{1,40})\/scenario$/,
    reply: (m, body) => mockScenario(m[1]!, String((body as { kind?: string } | null)?.kind) as ScenarioKind),
  },
];
