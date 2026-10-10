// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { YieldBlock } from "./YieldBlock";

/**
 * Round-3 review fix: the trade ticket must never throw during render.
 * Fractional units ("1.5" → BigInt(non-integer)) and sub-tick prices
 * ("0.001%" → cleanPerUnit 0n) show ticket.invalid instead of crashing
 * the whole dossier via bonds/error.tsx.
 */

vi.mock("next-intl", () => ({
  useTranslations: () =>
    Object.assign(
      (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${Object.values(values).join(",")}` : key,
      { has: () => true },
    ),
}));

afterEach(cleanup);

const props = {
  face: 100_000n, // 1,000 KZT
  rateBps: 1_000,
  frequency: 2,
  dayCount: "THIRTY_360",
  currency: "KZT",
  issueDate: "2026-10-09T00:00:00+05:00",
  maturityDate: "2027-10-09T00:00:00+05:00",
  periodStart: "2026-10-09",
  today: "2026-10-19",
  redeemed: false,
  locale: "en" as const,
};

describe("YieldBlock ticket input guards", () => {
  it("floors a fractional bond count to a whole number instead of throwing", async () => {
    render(<YieldBlock {...props} />);
    const units = screen.getByLabelText(/ticket.units/i);
    await userEvent.clear(units);
    await userEvent.type(units, "1.5");
    // BigInt(1.5) would throw RangeError during render; floor keeps the ticket alive for 1 bond
    expect(screen.getByText(/ticket\.clean:1\b/i)).toBeTruthy();
  });

  it("shows ticket.invalid for a sub-tick clean price instead of throwing", async () => {
    render(<YieldBlock {...props} />);
    const price = screen.getByLabelText(/ticket.price/i);
    await userEvent.clear(price);
    await userEvent.type(price, "0.001");
    expect(screen.getByText("ticket.invalid")).toBeTruthy();
  });

  it("computes the split at par for 10 bonds", () => {
    render(<YieldBlock {...props} />);
    // 10 × 1,000 KZT clean + 10 days accrued at 10%/2 (30E/360): 27.78 KZT
    expect(screen.getByText(/ticket.clean:10/i)).toBeTruthy();
    expect(screen.getByText(/ticket.accrued:10/i)).toBeTruthy();
  });
});
