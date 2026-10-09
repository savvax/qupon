import { describe, expect, it } from "vitest";
import { httpHref } from "./httpUrl";

describe("httpHref (org website link gate)", () => {
  it("links only http(s) URLs", () => {
    expect(httpHref("https://kaziron.kz")).toBe("https://kaziron.kz");
    expect(httpHref("http://example.kz/pricing")).toBe(
      "http://example.kz/pricing",
    );
  });

  it("compares the scheme case-insensitively (task 1423)", () => {
    expect(httpHref("HTTPS://example.kz")).toBe("HTTPS://example.kz");
    expect(httpHref("JavaScript:alert(1)")).toBeNull();
  });

  it("keeps scripted and scheme-less values as inert text", () => {
    expect(httpHref("javascript:alert(1)")).toBeNull();
    expect(httpHref("data:text/html,x")).toBeNull();
    expect(httpHref("kaziron.kz")).toBeNull();
    expect(httpHref("")).toBeNull();
  });
});
