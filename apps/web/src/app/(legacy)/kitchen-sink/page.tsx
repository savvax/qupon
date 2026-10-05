import { KitchenSinkDemo } from "./demo";
import { AmountCell } from "@/components/ui/AmountCell";
import { SimulatedBadge } from "@/components/ui/SimulatedBadge";
import { StatusChip } from "@/components/ui/StatusChip";
import { Timeline } from "@/components/ui/Timeline";
import type { Amount } from "@/lib/api";

export const metadata = { title: "Qupon · UI kit" };

const STATUS_GROUPS: [string, string[]][] = [
  ["series", ["Active", "Matured", "Retiring", "Closed"]],
  ["investor", ["Active", "Suspended"]],
  [
    "action (10)",
    [
      "Announced",
      "RecordStruck",
      "SnapshotComplete",
      "Funded",
      "Settling",
      "Completed",
      "Retiring",
      "Cancelled",
      "VotingOpen",
      "Finalized",
    ],
  ],
  ["entitlement", ["Snapshotted", "Paid", "Retired"]],
  ["schedule", ["Projected", "Announced", "InProgress", "Completed"]],
  ["vote", ["For", "Against", "Abstain"]],
  ["unknown (fallback)", ["SomethingNew"]],
];

const AMOUNTS: [string, Amount | undefined][] = [
  ["KZT display", { minor: "100000", display: "1,000.00 KZT", currency: "tKZT" }],
  ["USDC display", { minor: "1000000", display: "1.00 USDC", currency: "USDC" }],
  ["no display · USDC 6dp", { minor: "1234567", display: "", currency: "USDC" }],
  ["no display · KZT 2dp", { minor: "325000", display: "", currency: "tKZT" }],
  ["undefined", undefined],
];

const TIMELINE = [
  {
    label: "Announce",
    state: "done" as const,
    at: "2026-09-20T10:00:00+05:00",
    signature:
      "4J3pSbG7fNfUX9VZXvCjJFh3Pv2VkD1Ry8StQqPq6bFgWHXn5ydEPAmxCvfX1QqTMdgKkTQEH7kq5FZ5THJ1W8Z",
  },
  { label: "Strike record", state: "done" as const, at: "2027-02-27T18:00:00+05:00" },
  {
    label: "Snapshot",
    state: "current" as const,
    detail: "waiting for confirm",
  },
  { label: "Fund escrow", state: "pending" as const },
  { label: "Pay batch 1/3", state: "failed" as const, detail: "InsufficientFunds" },
  { label: "Complete", state: "pending" as const },
];

const SIG =
  "4J3pSbG7fNfUX9VZXvCjJFh3Pv2VkD1Ry8StQqPq6bFgWHXn5ydEPAmxCvfX1QqTMdgKkTQEH7kq5FZ5THJ1W8Z";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-2 mt-8 text-xs font-semibold uppercase tracking-wider text-neutral-500">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** Dev-only gallery of every UI-kit component and state. No Storybook. */
export default function KitchenSinkPage() {
  return (
    <section>
      <h1 className="text-lg font-semibold">UI kit · kitchen sink</h1>
      <p className="mb-2 text-xs text-neutral-500">
        every component state on one page · dev reference for the console and portal
      </p>

      <Section title="StatusChip · all statuses">
        <div className="space-y-2">
          {STATUS_GROUPS.map(([group, statuses]) => (
            <div key={group} className="flex flex-wrap items-center gap-1.5">
              <span className="w-40 shrink-0 text-xs text-neutral-600">{group}</span>
              {statuses.map((s) => (
                <StatusChip key={s} status={s} />
              ))}
            </div>
          ))}
        </div>
      </Section>

      <Section title="SimulatedBadge">
        <div className="flex flex-wrap gap-2">
          <SimulatedBadge />
          <SimulatedBadge label="KYC" />
          <SimulatedBadge label="ARDFM registration" />
          <SimulatedBadge label="Swift delivery" />
          <SimulatedBadge label="fiat payout" />
        </div>
      </Section>

      <Section title="AmountCell · right-align via parent text-right">
        <div className="inline-block min-w-56 space-y-1 rounded border border-neutral-800 p-3">
          {AMOUNTS.map(([label, amount]) => (
            <div key={label} className="flex items-baseline justify-between gap-6">
              <span className="text-xs text-neutral-600">{label}</span>
              <span className="text-right">
                <AmountCell amount={amount} />
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Timeline · done / current / pending / failed">
        <div className="max-w-md">
          <Timeline steps={TIMELINE} />
        </div>
      </Section>

      <Section title="Tx reference (used by Timeline / Toast)">
        <div className="font-mono text-xs text-neutral-500">{SIG}</div>
      </Section>

      <KitchenSinkDemo />
    </section>
  );
}
