import { describe, expect, it } from "vitest";
import { bondDate } from "./sandbox";

// The dossier's "as of" date for a demo-clock series (task 1535 review): the yield block must
// use the bond's own calendar, not the real one — a showcase bond (daySecs 4) ages 10 civil
// days in 40 real seconds.
const ISSUE_TS = 1_791_000_000;

describe("bondDate", () => {
  it("runs on the demo clock: daySecs 4 → 10 civil days in 40 s", () => {
    expect(
      bondDate(
        "2026-10-09",
        { daySecs: 4, issueTs: ISSUE_TS },
        (ISSUE_TS + 40) * 1000,
      ),
    ).toEqual({
      day: 10,
      date: "2026-10-19",
    });
  });

  it("never returns a date before the issue date", () => {
    expect(
      bondDate("2026-10-09", { daySecs: 4, issueTs: ISSUE_TS }, 0),
    ).toEqual({
      day: 0,
      date: "2026-10-09",
    });
  });
});
