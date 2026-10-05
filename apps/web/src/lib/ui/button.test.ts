import { describe, expect, it } from "vitest";
import { buttonClasses } from "./button";

describe("buttonClasses", () => {
  it("primary md by default", () => {
    const c = buttonClasses({});
    expect(c).toContain("bg-g600");
    expect(c).toContain("h-10");
  });
  it("sizes map to 32/40/48 px", () => {
    expect(buttonClasses({ size: "sm" })).toContain("h-8");
    expect(buttonClasses({ size: "lg" })).toContain("h-12");
  });
  it("destructive uses the error palette", () => {
    expect(buttonClasses({ variant: "destructive" })).toContain("text-err-fg");
  });
});
