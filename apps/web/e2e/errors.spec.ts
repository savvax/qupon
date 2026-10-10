import { expect, test, type Page } from "@playwright/test";

/** Next dev paints its error overlay on top of the boundary — close it so the design is visible. */
async function closeDevOverlay(page: Page) {
  for (const name of ["Close", "close"]) {
    const btn = page.getByRole("button", { name, exact: true }).first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => {});
      return;
    }
  }
}

test("404 page renders in the new design, EN and RU", async ({ page }) => {
  const res = await page.goto("/does-not-exist");
  expect(res?.status()).toBe(404);
  await expect(
    page.getByRole("main").getByText("Page not found"),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Home" }),
  ).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("link", { name: "Bonds" }),
  ).toBeVisible();
  await page.screenshot({ path: "../../reports/ui/errors-404-en.png" });

  await page.getByRole("radio", { name: "Русский" }).click();
  await expect(
    page.getByRole("main").getByText("Страница не найдена"),
  ).toBeVisible();
  await page.screenshot({ path: "../../reports/ui/errors-404-ru.png" });
});

test("500 page (mock registrar outage) renders the error boundary", async ({
  page,
}) => {
  const res = await page.goto("/bonds/boom");
  expect(res?.status()).toBe(500);
  await closeDevOverlay(page);
  await expect(
    page.getByText("The registrar service is unavailable"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try again", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "../../reports/ui/errors-500-en.png" });

  await page.getByRole("radio", { name: "Русский" }).click();
  await expect(page.getByText("Сервис регистратора недоступен")).toBeVisible();
  await page.screenshot({ path: "../../reports/ui/errors-500-ru.png" });
});

test("every public page has a title ending in · Qupon", async ({ page }) => {
  await page.goto("/bonds");
  await expect(page).toHaveTitle(/· Qupon$/);
  // Bond detail via the board (mock mode always lists series).
  await page.getByRole("table").getByRole("link").first().click();
  await expect(page).toHaveTitle(/· Qupon$/);
  for (const path of ["/", "/login", "/forbidden", "/does-not-exist"]) {
    await page.goto(path);
    await expect(page).toHaveTitle(/· Qupon$/);
  }
});
