import { describe, expect, it } from "vitest";
import { activeHref } from "./nav";

describe("activeHref", () => {
  const hrefs = ["/issuer", "/issuer/series", "/issuer/series/new"];
  it("picks the deepest matching item", () => {
    expect(activeHref("/issuer/series/new", hrefs)).toBe("/issuer/series/new");
    expect(activeHref("/issuer/series/Mint1", hrefs)).toBe("/issuer/series");
    expect(activeHref("/issuer", hrefs)).toBe("/issuer");
  });
  it("does not match a sibling prefix", () => {
    expect(activeHref("/issuers", hrefs)).toBeUndefined();
  });
});
