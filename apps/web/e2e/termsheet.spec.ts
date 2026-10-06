import { expect, test } from "@playwright/test";

/**
 * EXPERIMENTAL term-sheet import (task 042) in mock mode: paste KASE text →
 * review table (BTRKb33 fixture, SIMULATED regex source) → "Use these values"
 * prefills the wizard like the KASE import does.
 */
const BTRK_TEXT = `Bonds KZ2C00018703 (BTRKb33) of National Managing Holding Baiterek JSC included in KASE official list.
face value – 1,000 tenge; coupon rate – 15.95% per annum; coupon payment frequency – semi-annual; 30/360;
circulation period – 03.07.2026 – 03.07.2031.`;

test.beforeEach(async ({ page }) => {
  await page.goto("/login?next=/issuer");
  await page.getByRole("button", { name: /Issuer/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Demo issuer",
  );
});

test("pasted term sheet is parsed, reviewed and applied to the wizard", async ({
  page,
}) => {
  await page.goto("/issuer/series/new");
  // a click before hydration is lost: retry until the dialog is really open
  await expect(async () => {
    await page
      .getByRole("button", { name: "Paste a term sheet (experimental)" })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
  }).toPass();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toContainText("experimental");

  // Empty text is refused client-side.
  await dialog.getByRole("button", { name: "Parse" }).click();
  await expect(dialog.getByText("Paste some text first.")).toBeVisible();

  await dialog.getByLabel("Term-sheet text").fill(BTRK_TEXT);
  await dialog.getByRole("button", { name: "Parse" }).click();

  // Review table: source label, ISIN, 15.95 %, confidence column.
  await expect(dialog.getByText("SIMULATED", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/SIMULATED regex fallback/)).toBeVisible();
  await expect(
    dialog.getByRole("row", { name: /ISIN KZ2C00018703 High/ }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("row", { name: /Coupon rate 15\.95% High/ }),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "Use these values" }).click();
  await expect(dialog).toBeHidden();

  // The same wizard fields the KASE import fills.
  await expect(page.getByLabel("Series name")).toHaveValue("BTRKb33");
  await expect(page.getByLabel("ISIN")).toHaveValue("KZ2C00018703");
  await expect(page.getByLabel("Coupon rate")).toHaveValue("15.95");
  await expect(page.getByLabel("Issue date")).toHaveValue("2026-07-03");
  await expect(page.getByLabel("Maturity date")).toHaveValue("2031-07-03");
  await expect(
    page.getByText(/Term-sheet values applied — review every field/),
  ).toBeVisible();

  // Proceeds to issuance: 5 years semi-annual → 10 coupons in the schedule step.
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: /10 coupons/ }),
  ).toBeVisible();
});
