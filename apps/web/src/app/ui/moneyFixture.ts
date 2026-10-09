/**
 * Gallery fixture for MoneyFlow (task 1530): coupon 2 of a demo bond with the brief's numbers — 1,000 ₸ face,
 * 10 % semi-annual → 50 ₸ per bond; holders of 10 / 25 / 65 bonds get 500 / 1,250 / 3,250 ₸ gross; the pension
 * fund pays 15 % (487.50 ₸) to the tax vault and takes 2,762.50 ₸ through the paying agent to its bank.
 * SIMULATED: the signatures are examples, not devnet transactions.
 */
import type { FlowRecipient } from "@/components/ui/MoneyFlow";

export const CURRENCY = "tKZT";
export const ESCROW_REQUIRED = "500000"; // Σ net + tax

const sig = (seed: string) =>
  `${seed}${"5q3vKp9WmT2xRb7NcYh4LdJ8gFs6ZaE1uQw".slice(0, 44 - seed.length)}x7Lm9Q2rT5vY8bN3kC6dF1gH4jW`;

const HOLDERS = [
  { id: "altyn", name: "Altyn Capital", units: "10", net: "50000", route: "wallet" },
  { id: "dana", name: "Dana K.", units: "25", net: "125000", route: "wallet" },
  { id: "nomad", name: "Nomad Pension", units: "65", net: "276250", route: "bank" },
] as const;

/** Money-flow recipients with each leg's status (altyn / dana / nomad / tax). */
export function recipients(
  legs: Record<string, FlowRecipient["status"]>,
  unitsLabel: (units: string) => string,
): FlowRecipient[] {
  return [
    ...HOLDERS.map((h) => ({
      id: h.id,
      kind: h.route === "bank" && legs[h.id] === "agent" ? ("agent" as const) : ("holder" as const),
      label: h.name,
      sub: unitsLabel(h.units),
      amount: h.net,
      status: legs[h.id] ?? "pending",
      tx: legs[h.id] === "paid" ? sig(`Pay${h.id.slice(0, 1).toUpperCase()}`) : null,
    })),
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
