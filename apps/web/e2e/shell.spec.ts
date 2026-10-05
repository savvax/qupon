import { expect, test } from "@playwright/test";

test("public shell renders and switches language", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: /^bonds$|^облигации$/i }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "ru", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /^Облигации$/ }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "en", exact: true }).click();
  await expect(
    page.getByRole("link", { name: /^Bonds$/ }).first(),
  ).toBeVisible();
});

test("no horizontal scroll at 390 px; menu opens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: /menu|меню/i }).click();
  await expect(
    page.getByRole("dialog").getByRole("link", { name: /sign in|войти/i }),
  ).toBeVisible();
});
