// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminOrganizationsPage from "./page";

const bo = vi.hoisted(() => ({ orgs: [] as Record<string, unknown>[] }));

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => (key: string) => `${ns}.${key}`,
  getLocale: async () => "en",
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/bo", () => ({
  boFetch: async () => ({ organizations: bo.orgs }),
}));
vi.mock("./OrgControls", () => ({ OrgControls: () => null }));

afterEach(() => {
  cleanup();
  bo.orgs = [];
});

/** Task 1423: the website column links http(s) URLs in any case; a stored javascript:
 *  value (legacy, predates the API check) renders as inert text, never an anchor. */
describe("admin organizations website column", () => {
  it("links an uppercase HTTPS scheme and keeps javascript: as plain text", async () => {
    bo.orgs = [
      {
        id: 1,
        name: "A JSC",
        kind: "issuer",
        bin: "",
        website: "HTTPS://example.kz",
        createdAt: 0,
      },
      {
        id: 2,
        name: "B JSC",
        kind: "issuer",
        bin: "",
        website: "javascript:alert(1)",
        createdAt: 0,
      },
    ];
    render(await AdminOrganizationsPage());
    // desktop table and mobile cards both render the column
    const [first] = screen.getAllByRole("link", { name: "HTTPS://example.kz" });
    expect(first?.getAttribute("href")).toBe("HTTPS://example.kz");
    expect(
      screen.queryByRole("link", { name: "javascript:alert(1)" }),
    ).toBeNull();
    for (const el of screen.getAllByText("javascript:alert(1)")) {
      expect(el.tagName).toBe("SPAN");
    }
  });
});
