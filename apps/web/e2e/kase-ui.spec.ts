import { expect, test } from "@playwright/test";

const MINT_QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const MINT_BTRK = "BTRKDeM0BondMint1111111111111111111111111111";

test.beforeEach(async ({ page }) => {
  await page.goto("/login?next=/issuer");
  await page.getByRole("button", { name: /Issuer/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Demo issuer",
  );
});

test("wizard imports a KASE ticker and highlights schedule mismatches", async ({
  page,
}) => {
  await page.goto("/issuer/series/new");
  await page.getByRole("button", { name: "Import", exact: true }).click(); // empty ticker → inline error
  await expect(
    page.getByText("Ticker must be 2–12 letters or digits."),
  ).toBeVisible();

  await page.getByLabel("KASE ticker").fill("TEBNb10");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    page.getByText(/Imported TEBNb10 \(ForteBank\)/),
  ).toBeVisible();

  // Prefilled terms from the fixture: name, ISIN, 8 % semi-annual, dates.
  await expect(page.getByLabel("Series name")).toHaveValue("TEBNb10");
  await expect(page.getByLabel("ISIN")).toHaveValue("KZ2C00000065");
  await expect(page.getByLabel("Coupon rate")).toHaveValue("8.00");
  await expect(page.getByLabel("Issue date")).toHaveValue("2006-11-29");
  await expect(page.getByLabel("Maturity date")).toHaveValue("2026-11-29");

  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: /schedule vs this issue/ }),
  ).toBeVisible();
  // Historical KASE fixings (8.5 %) surface as mismatches; current-rate rows match.
  await expect(
    page.getByRole("row", { name: /Mismatch/ }).first(),
  ).toBeVisible();
  await expect(page.getByRole("row", { name: /Matches/ }).first()).toBeVisible();
});

test("wizard import of an unknown ticker says so without breaking the form", async ({
  page,
}) => {
  await page.goto("/issuer/series/new");
  await page.getByLabel("KASE ticker").fill("NOPEb1");
  await page.getByRole("button", { name: "Import", exact: true }).click();
  await expect(
    page.getByText("kase.kz has no bond with this ticker."),
  ).toBeVisible();
  await expect(page.getByLabel("Series name")).toHaveValue("");
});

test("bond page shows the KASE panel with source and quote time; RU renders", async ({
  page,
}) => {
  await page.goto(`/bonds/${MINT_QPNB1}`);
  const panel = page.getByTestId("kase-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("KASE · TEBNb10")).toBeVisible();
  await expect(panel.getByText("67.52%")).toBeVisible();
  await expect(panel.getByText(/Source: kase\.kz · fetched/)).toBeVisible();
  await expect(panel.getByText(/No recent trades/)).toBeVisible();
  await expect(
    panel.getByText(/securities of 48 titles/),
  ).toBeVisible();

  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "ru", url: new URL(page.url()).origin },
  ]);
  await page.goto(`/bonds/${MINT_QPNB1}`);
  await expect(panel.getByText("Чистая цена")).toBeVisible();
  await expect(panel.getByText(/Источник: kase\.kz/)).toBeVisible();
});

// Review focus: kase.kz down → the panel degrades; no page breaks (task 1002 e2e).
test("a series whose KASE ticker is unavailable still renders the bond page", async ({
  page,
}) => {
  await page.goto(`/bonds/${MINT_BTRK}`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "BTRKdemo",
  );
  const panel = page.getByTestId("kase-panel");
  await expect(panel).toBeVisible();
  await expect(
    panel.getByText("kase.kz market data is unavailable right now."),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "Schedule" })).toBeVisible();
});
