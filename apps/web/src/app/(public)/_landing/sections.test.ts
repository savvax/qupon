import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BEYOND } from "./sections";

/** Landing evidence links are hand-copied from the demo report; a one-char typo makes Explorer show "not found". */
describe("landing BEYOND tx signatures", () => {
  const report = readFileSync(
    path.resolve(
      import.meta.dirname,
      "../../../../../../reports/demo-plan15.md",
    ),
    "utf8",
  );

  it("every card links a tx that exists in reports/demo-plan15.md", () => {
    expect(BEYOND.length).toBe(5);
    for (const b of BEYOND) {
      expect(report, `${b.key} (${b.step})`).toContain(b.tx);
    }
  });
});
