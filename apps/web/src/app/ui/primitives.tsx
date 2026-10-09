import type { ReactNode } from "react";
import { ActionFlow, type FlowStep } from "@/components/ui/ActionFlow";
import { type Actor, ActorChip } from "@/components/ui/ActorChip";
import { Button } from "@/components/ui/Button";
import { CountdownClock } from "@/components/ui/CountdownClock";
import { GlossaryTerm } from "@/components/ui/GlossaryTerm";
import { LifecycleRail, type RailNode } from "@/components/ui/LifecycleRail";
import { MoneyFlow } from "@/components/ui/MoneyFlow";
import { NetworkChip } from "@/components/ui/NetworkChip";
import { NowBar } from "@/components/ui/NowBar";
import { type Provenance, ProvenanceChip } from "@/components/ui/ProvenanceChip";
import { TourStep } from "@/components/ui/TourStep";
import { StepNowBar } from "@/components/shell/StepNowBar";
import type { FlowAction } from "@/lib/actionFlow";
import {
  CURRENCY,
  ESCROW_REQUIRED,
  recipients,
} from "../(public)/sandbox/[id]/fixture";

const SIG = "4J3pSbG7fNfUX9VZXvCjJFh3Pv2VkD1Ry8StQqPq6bFgWHXn5ydEPAmxCvfX1QqTMdgKkTQEH7kq5FZ5THJ1W8Z";
const SIG2 = "3Sp4jVLUu8FWeCJiKDA6mruYgRBMhJW9uCJdM2iNPvFrMdKaTrLoVe9nvCGdz9cAoPzVKYtu2";
const EXPLORER = `https://explorer.solana.com/tx/${SIG}?cluster=devnet`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="mb-2 text-xs font-semibold tracking-wider text-n500 uppercase">
        {title}
      </h2>
      {children}
    </section>
  );
}

const SWATCHES: [string, string][] = [
  ["demo", "bg-demo-bg text-demo-fg border-demo-bd"],
  ["bank", "bg-bank-bg text-bank-fg border-bank-bd"],
  ["cure", "bg-cure-bg text-cure-fg border-cure-bd"],
  ["default", "bg-default text-white border-default"],
  ["warn (simulated)", "bg-warn-bg text-warn-fg border-warn-bd"],
  ["g50 / g700 (on-chain)", "bg-g50 text-g700 border-g200"],
];
const VIZ = ["holder", "tax", "bank", "escrow", "short", "pending"];

const rail = (status: RailNode["status"][]): RailNode[] => [
  { id: "i", kind: "issue", title: "Issue", date: "2026-09-01T00:00:00+05:00", status: status[0]!, statusLabel: "Placed", txCount: 104, href: "#" },
  { id: "c1", kind: "coupon", title: "Coupon 1", date: "2027-03-01T00:00:00+05:00", status: status[1]!, amount: { minor: "5000", currency: CURRENCY }, txCount: 9, href: "#" },
  { id: "m", kind: "meeting", title: "Bondholder meeting", date: "2027-04-15T00:00:00+05:00", status: status[2]!, statusLabel: "Approved", note: "10% → 12%", txCount: 6 },
  { id: "c2", kind: "coupon", title: "Coupon 2", date: "2027-09-01T00:00:00+05:00", status: status[3]!, amount: { minor: "6000", currency: CURRENCY } },
  { id: "call", kind: "call", title: "Early call", date: "2028-01-10T00:00:00+05:00", status: status[4]!, amount: { minor: "102000", currency: CURRENCY } },
  { id: "mat", kind: "maturity", title: "Maturity", date: "2028-09-01T00:00:00+05:00", status: status[5]!, amount: { minor: "106000", currency: CURRENCY } },
];

const flow = (
  states: FlowStep["state"][],
  actors: Actor[] = ["registrar", "anyone", "anyone", "issuer", "anyone", "anyone"],
): FlowStep[] =>
  ["Announced", "Record date", "Snapshot", "Funded", "Paid", "Completed"].map((label, i) => ({
    id: label,
    label,
    state: states[i]!,
    actor: actors[i],
    at: states[i] === "done" ? `2027-08-3${i < 2 ? 0 : 1}T0${i}:4${i}:00+05:00` : undefined,
    tx: states[i] === "done" ? (i % 2 ? SIG : SIG2) : undefined,
    detail: label === "Paid" && states[i] === "done" ? "3 of 3 holders paid" : label === "Snapshot" && states[i] === "done" ? "Σ 100 = supply" : undefined,
    record: label === "Record date" ? { planned: "2027-08-31T00:00:00+05:00", effective: states[i] === "done" ? (states[3] === "defaulted" ? "2027-08-31T00:00:42+05:00" : "2027-08-31T00:00:00+05:00") : null } : undefined,
    downloads: label === "Announced" ? [{ label: "seev.031", href: "#" }] : label === "Completed" && states[i] === "done" ? [{ label: "seev.036 (ZIP)", href: "#" }] : undefined,
  }));

const units = (u: string) => `${u} bonds`;

/** One coupon of QPNb1 (the brief's numbers) in every status the NowBar handles, Defaulted/PaidToAgent included. */
function statusFixtures(now: number): [string, FlowAction][] {
  const at = (days: number) => new Date(now + days * 86_400_000).toISOString();
  const a: FlowAction = {
    pda: "ActnINTR0002Fixture111111111111111111111111111",
    seriesMint: "QpNb1Dem0BondMint1111111111111111111111111111",
    kind: "INTR",
    mandatory: "MAND",
    corpId: "QPNb1-INTR-0002",
    recordAt: at(2),
    paymentAt: at(3),
    perUnitGross: { minor: "5000", display: "50.00 KZT", currency: CURRENCY },
    perUnitPrincipal: { minor: "0", display: "0.00 KZT", currency: CURRENCY },
    cashMint: "Cash111111111111111111111111111111111111111",
    escrow: "Escrow11111111111111111111111111111111111111",
    status: "Announced",
    explorerUrl: "https://explorer.solana.com/address/x?cluster=devnet",
  };
  const past = { recordAt: at(-3), paymentAt: at(-2) };
  return [
    ["Announced", a],
    ["RecordStruck", { ...a, ...past, status: "RecordStruck", holdersSnapshotted: 1, unitsSnapshotted: "10" }],
    ["SnapshotComplete", { ...a, recordAt: at(-1), status: "SnapshotComplete" }],
    ["Defaulted", { ...a, ...past, status: "Defaulted" }],
    ["Funded", { ...a, ...past, status: "Funded" }],
    ["Settling", { ...a, ...past, status: "Settling", holdersSnapshotted: 3, holdersPaid: 3, bankPending: 1 }],
    ["Retiring", { ...a, ...past, kind: "REDM", status: "Retiring", holdersSnapshotted: 3, holdersRetired: 1 }],
    ["VotingOpen", { ...a, ...past, kind: "BMET", status: "VotingOpen", unitsSnapshotted: "100", votingEndsAt: at(1) }],
    ["Completed", { ...a, ...past, status: "Completed" }],
  ];
}

/** Task 1530 primitives in every state (fixture data; EN gallery). */
export function PrimitivesGallery() {
  return (
    <>
      <Section title="Tokens v2 · status semantics and data-viz roles">
        <div className="flex flex-wrap gap-2">
          {SWATCHES.map(([name, cls]) => (
            <span key={name} className={`rounded-btn border px-3 py-2 text-xs font-bold ${cls}`}>
              {name}
            </span>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-3">
          {VIZ.map((v) => (
            <span key={v} className="inline-flex items-center gap-1.5 text-xs text-n600">
              <span className="size-4 rounded-sm" style={{ background: `var(--color-viz-${v})` }} />
              viz-{v}
            </span>
          ))}
        </div>
      </Section>

      <Section title="ProvenanceChip · every kind, plain and linked">
        <div className="flex flex-wrap items-center gap-2">
          {(["onchain", "verified", "simulated", "demo", "roadmap"] as Provenance[]).map((k) => (
            <ProvenanceChip key={k} kind={k} />
          ))}
          <ProvenanceChip kind="onchain" href={EXPLORER} />
          <ProvenanceChip kind="verified" href={EXPLORER} />
        </div>
      </Section>

      <Section title="ActorChip · who can push a step">
        <div className="flex flex-wrap items-center gap-2">
          {(["anyone", "issuer", "registrar", "holder", "payingAgent"] as Actor[]).map((a) => (
            <ActorChip key={a} actor={a} />
          ))}
          <ActorChip actor="anyone" long />
        </div>
      </Section>

      <Section title="NetworkChip · with slot, without slot">
        <div className="flex flex-wrap items-center gap-2">
          <NetworkChip slot={451_203_118} />
          <NetworkChip />
        </div>
      </Section>

      <Section title="CountdownClock · future, demo clock, passed">
        <div className="space-y-2 text-sm">
          <CountdownClock label="Record date" to={Date.now() + 3 * 86_400_000 + 4 * 3_600_000} />
          <CountdownClock label="Payment date" to={Date.now() + 95_000} daySecs={2} />
          <CountdownClock label="Payment date" to={Date.now() - 40_000} />
        </div>
      </Section>

      <Section title="GlossaryTerm · dotted underline, click for the definition">
        <p className="max-w-2xl text-n700">
          Whoever holds the bond at the <GlossaryTerm term="recordDate">record date</GlossaryTerm> is in the{" "}
          <GlossaryTerm term="snapshot">snapshot</GlossaryTerm>; the issuer funds the{" "}
          <GlossaryTerm term="escrow">escrow</GlossaryTerm>, and every later step is{" "}
          <GlossaryTerm term="permissionless">permissionless</GlossaryTerm>. Missed payment →{" "}
          <GlossaryTerm term="default" />, late funding → <GlossaryTerm term="cure" />.
        </p>
      </Section>

      <Section title="TourStep · first and last step">
        <div className="flex flex-wrap gap-4">
          <TourStep step={1} total={4} title="What happens now">
            This bar names the next step, who may take it and gives you the one button.
          </TourStep>
          <TourStep step={4} total={4} title="Every step is a transaction">
            Each line is one transaction with an explorer link.
          </TourStep>
        </div>
      </Section>

      <Section title="NowBar · default / attention / danger / done (inline here; docked on phones in pages)">
        <div className="space-y-3">
          <NowBar
            dock="none"
            title="The escrow holds 5,000.00 ₸. Anyone can push the payout to the 3 holders."
            clock={<CountdownClock label="Payment date" to={Date.now() + 86_400_000} daySecs={2} />}
            actors={["anyone"]}
            action={<Button>Pay holders</Button>}
          />
          <NowBar
            dock="none"
            tone="attention"
            title="Payment date passed: the escrow holds 2,000.00 of 5,000.00 ₸."
            detail="After the grace day anyone can record a default."
            actors={["anyone"]}
            action={<Button>Declare default</Button>}
          />
          <NowBar
            dock="none"
            tone="danger"
            title="Coupon 2 is in default: 3,000.00 ₸ short."
            detail="The bond keeps trading; record-date holders keep their claims."
            actors={["issuer"]}
            action={<Button>Fund and cure</Button>}
          />
          <NowBar dock="none" tone="done" title="Coupon 2 paid: 5,000.00 ₸ to 3 holders." />
        </div>
      </Section>

      <Section title="StepNowBar · the next step for each action status (actionFlow.nextStep; e2e/guidance.spec)">
        <div className="space-y-3">
          {statusFixtures(Date.now()).map(([status, action]) => (
            <div key={status} data-fixture={status}>
              <StepNowBar
                dock="none"
                action={action}
                ticker="QPNb1"
                supply={100n}
                button={status === "Completed" ? undefined : <Button size="sm">Open action</Button>}
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="LifecycleRail · done / live / upcoming, then defaulted / cured / cancelled">
        <div className="space-y-4">
          <LifecycleRail locale="en" nodes={rail(["done", "done", "done", "live", "upcoming", "upcoming"])} />
          <LifecycleRail locale="en" title="" nodes={rail(["done", "defaulted", "done", "cured", "cancelled", "upcoming"])} />
        </div>
      </Section>

      <Section title="ActionFlow · completed, waiting on the issuer, defaulted (with a late strike)">
        <div className="space-y-6 rounded-card border border-n200 bg-n0 p-5">
          <ActionFlow locale="en" steps={flow(["done", "done", "done", "done", "done", "done"])} />
          <ActionFlow locale="en" steps={flow(["done", "done", "done", "current", "pending", "pending"])} />
          <ActionFlow locale="en" steps={flow(["done", "done", "done", "defaulted", "pending", "skipped"])} />
        </div>
      </Section>

      <Section title="MoneyFlow · paid (bank + tax), mid-payout, defaulted, cured">
        <div className="space-y-4">
          <MoneyFlow
            currency={CURRENCY}
            locale="en"
            issuer={{ label: "Steppe Wind JSC", address: "8zqKjKvQUmo38zTjwppjnQZdaFBf3ipZVZMhV26g3yma" }}
            escrow={{ required: ESCROW_REQUIRED, funded: ESCROW_REQUIRED, fundTx: SIG, address: "EscrowDem0PDA11111111111111111111111111111111" }}
            recipients={recipients({ altyn: "paid", dana: "paid", nomad: "agent", tax: "paid" }, units)}
            sampleTx
          />
          <MoneyFlow
            currency={CURRENCY}
            locale="en"
            issuer={{ label: "Steppe Wind JSC" }}
            escrow={{ required: ESCROW_REQUIRED, funded: ESCROW_REQUIRED, fundTx: SIG }}
            recipients={recipients({ altyn: "paid", dana: "pending", nomad: "pending", tax: "pending" }, units)}
            sampleTx
          />
          <MoneyFlow
            currency={CURRENCY}
            locale="en"
            issuer={{ label: "Steppe Wind JSC" }}
            escrow={{ required: ESCROW_REQUIRED, funded: "200000", fundTx: SIG }}
            recipients={recipients({ altyn: "defaulted", dana: "defaulted", nomad: "defaulted", tax: "defaulted" }, units)}
            state="defaulted"
            sampleTx
          />
          <MoneyFlow
            currency={CURRENCY}
            locale="en"
            issuer={{ label: "Steppe Wind JSC" }}
            escrow={{ required: ESCROW_REQUIRED, funded: ESCROW_REQUIRED, fundTx: SIG }}
            recipients={recipients({ altyn: "paid", dana: "paid", nomad: "paid", tax: "paid" }, units)}
            state="cured"
            sampleTx
          />
        </div>
      </Section>
    </>
  );
}
