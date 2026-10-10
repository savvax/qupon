import { describe, expect, it } from "vitest";
import type { ActionDTO, SeriesDTO } from "./api";
import { boardStage } from "./boardStage";

const base = {
  status: "Active",
  inDefault: false,
  nextCouponDate: "2027-01-03T00:00:00+05:00",
} satisfies Pick<SeriesDTO, "status" | "inDefault" | "nextCouponDate">;

// 2026-10-09T12:00:00+05:00 — inside the fixture's world.
const NOW = new Date("2026-10-09T12:00:00+05:00").getTime();

const action = (
  status: ActionDTO["status"],
  recordAt = "2027-01-02T00:00:00+05:00",
) =>
  ({
    status,
    recordAt,
    kind: "INTR",
    pda: "P",
    seriesMint: "M",
    mandatory: "MAND",
    corpId: "C",
  }) as ActionDTO;

describe("boardStage", () => {
  it("prefers default, from the series flag or the open action", () => {
    expect(boardStage({ ...base, inDefault: true }, null, NOW)).toBe(
      "inDefault",
    );
    expect(boardStage(base, action("Defaulted"), NOW)).toBe("inDefault");
  });

  it("closed, matured and retiring series are redeemed", () => {
    for (const status of ["Closed", "Matured", "Retiring"] as const)
      expect(boardStage({ ...base, status }, null, NOW)).toBe("redeemed");
  });

  it("maps the open action to voting, paying and record-soon", () => {
    expect(boardStage(base, action("VotingOpen"), NOW)).toBe("voting");
    expect(boardStage(base, action("Funded"), NOW)).toBe("paying");
    expect(boardStage(base, action("Settling"), NOW)).toBe("paying");
    expect(boardStage(base, action("Announced"), NOW)).toBe("recordSoon");
    expect(boardStage(base, action("RecordStruck"), NOW)).toBe("live");
  });

  it("an announced action already past its record date is not record-soon", () => {
    expect(
      boardStage(base, action("Announced", "2026-10-01T00:00:00+05:00"), NOW),
    ).toBe("live");
  });

  it("without an action, a record date within 10 days is soon; later is just issued", () => {
    // next coupon 2027-01-03 → record 2027-01-02, far from 2026-10-09
    expect(boardStage(base, null, NOW)).toBe("issued");
    const soon = { ...base, nextCouponDate: "2026-10-15T00:00:00+05:00" }; // record in 5 days
    expect(boardStage(soon, null, NOW)).toBe("recordSoon");
    const edge = { ...base, nextCouponDate: "2026-10-20T00:00:00+05:00" }; // record in 10 days
    expect(boardStage(edge, null, NOW)).toBe("recordSoon");
    const far = { ...base, nextCouponDate: "2026-10-21T00:00:00+05:00" }; // record in 11 days
    expect(boardStage(far, null, NOW)).toBe("issued");
  });
});
