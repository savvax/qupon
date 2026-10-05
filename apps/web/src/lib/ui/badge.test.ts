import { describe, expect, it } from "vitest";
import { badgeTone, prettifyStatus } from "./badge";

describe("badge", () => {
  it("maps known statuses to tones", () => {
    expect(badgeTone("Paid").fg).toBe("text-g700");
    expect(badgeTone("Suspended").fg).toBe("text-err-fg");
    expect(badgeTone("Funded").fg).toBe("text-warn-fg");
  });
  it("unknown statuses are neutral, never throw", () => {
    expect(badgeTone("SomethingNew").fg).toBe("text-n600");
  });
  it("prettifies camel case", () => {
    expect(prettifyStatus("RecordStruck")).toBe("Record struck");
  });
});
