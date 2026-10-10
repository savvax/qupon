// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AdminSeriesPage from "./page";

const bo = vi.hoisted(() => ({ series: [] as Record<string, unknown>[] }));

vi.mock("next-intl/server", () => ({
  getTranslations: async (ns: string) => (key: string) => `${ns}.${key}`,
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock("@/lib/bo", () => ({
  boFetch: async () => ({ series: bo.series, organizations: [] }),
}));
vi.mock("@/components/ui/Address", () => ({
  Address: ({ value }: { value: string }) => <span>{value}</span>,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => {} }),
}));
vi.mock("@/lib/useRunWrite", () => ({
  useRunWrite: () => async () => null,
}));

afterEach(() => {
  cleanup();
  bo.series = [];
});

const row = {
  mint: "91541SeriesMint1111111111111111111111111111",
  ticker: "QPNb1",
  hidden: false,
  featured: false,
  noAutofund: true,
  demoClock: 45,
  inDefault: true,
  kaseTicker: "",
  orgId: null,
  updatedAt: 0,
};

/** Task 91541: the autopilot toggle, its phone label and the DEMO clock / IN DEFAULT
 * badges render from /admin/series data; the switch is off for a noAutofund series. */
describe("admin series autopilot column", () => {
  it("renders the off switch with hint, phone label and chain badges", async () => {
    bo.series = [row];
    render(await AdminSeriesPage());

    // the lg+ table column header, then the two lg:hidden labels (table cell + phone card)
    expect(screen.getAllByText("admin.series.colAutopilot").length).toBe(1);
    expect(screen.getAllByText("colAutopilot").length).toBe(2);
    // both toggles (table cell + phone card) are off because noAutofund = true
    for (const toggle of screen.getAllByRole("switch", {
      name: "colAutopilot",
    })) {
      expect(toggle.getAttribute("aria-checked")).toBe("false");
    }
    // one-line hint, in both the table cell and the phone card
    expect(screen.getAllByText("autopilotHint").length).toBe(2);
    // chain badges next to the ticker in both layouts
    expect(screen.getAllByText("admin.series.demoClock").length).toBe(2);
    expect(screen.getAllByText("admin.series.inDefault").length).toBe(2);
  });

  it("hides the badges for a real-clock series that is not in default", async () => {
    bo.series = [{ ...row, noAutofund: false, demoClock: 0, inDefault: false }];
    render(await AdminSeriesPage());
    expect(screen.queryByText("admin.series.demoClock")).toBeNull();
    expect(screen.queryByText("admin.series.inDefault")).toBeNull();
    const toggles = screen.getAllByRole("switch", { name: "colAutopilot" });
    expect(toggles.length).toBe(2);
    for (const toggle of toggles) {
      expect(toggle.getAttribute("aria-checked")).toBe("true");
    }
  });
});
