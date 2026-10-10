import { describe, expect, it } from "vitest";
import { payoutCalendar } from "./holder";
import type { UpcomingPayout } from "./holder";

const up = (recordAt: string, paymentAt: string): UpcomingPayout => ({
  mint: "M",
  ticker: "QPNb1",
  kind: "INTR",
  actionPda: null,
  recordAt,
  paymentAt,
});

describe("payoutCalendar", () => {
  const now = new Date("2026-10-05T12:00:00+05:00");

  it("spans 12 civil months from now, keeping months without events", () => {
    const months = payoutCalendar([], now);
    expect(months).toHaveLength(12);
    expect(months[0]!.key).toBe("2026-10");
    expect(months[11]!.key).toBe("2027-09");
    expect(months.every((m) => m.events.length === 0)).toBe(true);
  });

  it("buckets each payout's record and payment date into its month (Almaty civil)", () => {
    const months = payoutCalendar(
      [up("2026-10-28T00:00:00+05:00", "2026-10-30T00:00:00+05:00")],
      now,
    );
    expect(months[0]!.events).toHaveLength(2); // record + payment in October
    expect(months[0]!.events.map((e) => e.kind).sort()).toEqual([
      "payment",
      "record",
    ]);
    expect(months[1]!.events).toHaveLength(0);
  });

  it("keeps a payment that lands on the first day of the next month in that month", () => {
    const months = payoutCalendar(
      [up("2026-10-28T00:00:00+05:00", "2026-11-01T00:00:00+05:00")],
      now,
    );
    expect(months[0]!.events).toHaveLength(1);
    expect(months[0]!.events[0]!.kind).toBe("record");
    expect(months[1]!.events).toHaveLength(1);
    expect(months[1]!.events[0]!.kind).toBe("payment");
  });
});
