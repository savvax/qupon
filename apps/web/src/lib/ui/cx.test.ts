import { describe, expect, it } from "vitest";
import { cx } from "./cx";

describe("cx", () => {
  it("joins truthy class names with single spaces", () => {
    expect(cx("a", false, null, undefined, "b", "", "c")).toBe("a b c");
  });
});
