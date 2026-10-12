import { expect, test } from "@playwright/test";

test("bond board lists series and opens a bond page with three tabs", async ({
  page,
}) => {
  await page.goto("/bonds");
  await expect(
    page.getByRole("heading", { level: 1, name: "Bonds" }),
  ).toBeVisible();
  const first = page.locator("table a[href^='/bonds/']").first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(page).toHaveURL(/\/bonds\/\w+$/);
  for (const tab of ["Schedule", "Corporate actions", "Terms"]) {
    await expect(page.getByRole("tab", { name: tab })).toBeVisible();
  }
  await page.getByRole("tab", { name: "Terms" }).click();
  await expect(page.getByText("ISIN", { exact: true })).toBeVisible();
});

test("the board defaults to All: the completed redemption showcase is listed, not hidden (A91567-3)", async ({
  page,
}) => {
  await page.goto("/bonds");
  // "All" is the default tab; the closed showcase (Astana Metro, the redemption scenario)
  // is visible without touching the filter
  await expect(page.getByRole("tab", { name: "All" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const metro = page
    .getByRole("table")
    .first()
    .getByRole("row")
    .filter({ hasText: "Astana Metro" });
  await expect(metro).toBeVisible();
  // the Active filter still works and still hides the closed series
  await page.getByRole("tab", { name: "Active" }).click();
  await expect(metro).toHaveCount(0);
});

test("unknown mint is a 404, not a crash", async ({ page }) => {
  const res = await page.goto("/bonds/11111111111111111111111111111111");
  expect(res?.status()).toBe(404);
});

test("no horizontal scroll on the bond board at 390 px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/bonds");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
