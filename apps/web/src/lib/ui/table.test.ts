import { describe, expect, it } from "vitest";
import { visibleColumns } from "./table";

describe("visibleColumns", () => {
  it("drops columns hidden below the breakpoint", () => {
    const cols = [{ key: "a" }, { key: "b", hideBelow: "md" as const }];
    expect(visibleColumns(cols, "sm").map((c) => c.key)).toEqual(["a"]);
    expect(visibleColumns(cols, "lg").map((c) => c.key)).toEqual(["a", "b"]);
  });
});
