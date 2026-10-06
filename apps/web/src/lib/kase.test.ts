import { describe, expect, it } from "vitest";
import { compareKaseSchedule } from "./kase";
import type { PreviewRow } from "./schedulePreview";

const row = (n: number, periodStart: string, periodEnd: string): PreviewRow => ({
  n,
  periodStart,
  periodEnd,
  perUnitMinor: 100n,
});

describe("compareKaseSchedule (wizard KASE side panel, task 1002)", () => {
  const kase = [
    { recordDate: "2027-04-20", start: "2027-03-01", end: "2027-03-31", rate: 1000 },
    { recordDate: "2027-10-20", start: "2027-09-01", end: "2027-09-30", rate: 1000 },
  ];
  const preview = [
    row(1, "2026-09-01", "2027-03-01"),
    row(2, "2027-03-01", "2027-09-01"),
  ];

  it("matches when KASE's fixation falls inside the preview period and the rate equals", () => {
    const out = compareKaseSchedule(kase, preview, 1000);
    expect(out.map((r) => r.mismatch)).toEqual([false, false]);
  });

  it("matches a shifted (partial) KASE period inside the window, but not a different rate", () => {
    const partial = [
      { recordDate: "2027-02-01", start: "2027-01-15", end: "2027-02-28", rate: 1000 },
    ];
    expect(
      compareKaseSchedule(partial, [preview[0]!], 1000)[0]?.mismatch,
    ).toBe(false); // fixation 2027-01-15 lies inside 2026-09-01..2027-03-01
    expect(
      compareKaseSchedule(partial, [preview[0]!], 950)[0]?.mismatch,
    ).toBe(true); // rate differs from the wizard's coupon
  });

  it("highlights a KASE fixation outside the preview period", () => {
    const out = compareKaseSchedule(
      [{ recordDate: "2028-04-20", start: "2028-03-01", end: "2028-03-31", rate: 1000 }],
      preview,
      1000,
    );
    expect(out.map((r) => r.mismatch)).toEqual([true, true]);
  });

  it("flags rows KASE lists but the preview does not (and vice versa)", () => {
    const onlyFirst = compareKaseSchedule(kase, [preview[0]!], 1000);
    expect(onlyFirst[1]?.mismatch).toBe(true);
    expect(onlyFirst[1]?.kase).toBeDefined();
    expect(onlyFirst[1]?.preview).toBeUndefined();

    const longer = compareKaseSchedule([kase[0]!], preview, 1000);
    expect(longer[1]?.mismatch).toBe(true);
    expect(longer[1]?.preview).toBeDefined();
  });
});
