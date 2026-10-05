import { expect, test } from "@playwright/test";

test("landing: hero, five steps, RU, no console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("#how li")).toHaveCount(5);
  await expect(page.locator("#simulated")).toContainText("Implemented");
  await page.getByRole("button", { name: "ru", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Каждый купон",
  );
  await page.getByRole("button", { name: "en", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Every coupon",
  );
  expect(errors).toEqual([]);
});
