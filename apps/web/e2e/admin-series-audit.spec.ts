import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./session";

const noOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

/** Click EN|RU and wait for the heading to follow. The first click can land before
 * hydration attaches the handler (right after a native form navigation) → retry once. */
async function switchLocale(page: Page, locale: "en" | "ru", h1: string) {
  const btn = page.getByRole("button", { name: locale, exact: true });
  const heading = page.getByRole("heading", { level: 1 });
  await btn.click();
  await expect
    .poll(() => heading.textContent(), { timeout: 4000 })
    .toBe(h1)
    .catch(async () => {
      await btn.click();
      await expect(heading).toHaveText(h1);
    });
}

test("admin series: hide a series, KASE ticker and organisation controls", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInAs(page, "admin", baseURL);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/admin/series");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Series");
  const table = page.getByRole("table");
  await expect(table).toContainText("QPNb1");
  await expect(table).toContainText("KZ2C0QUPON01");
  await expect(
    page.getByRole("switch", { name: "Feature on the home page" }).first(),
  ).toBeChecked();

  // Hide the first series: the switch PATCHes /admin/series/{mint}, the mock applies, the table refreshes.
  await page.getByRole("switch", { name: "Hide from lists" }).first().click();
  await expect(page.getByText("Series visibility updated")).toBeVisible();
  await expect(table).toContainText("Hidden");
  // ON = visible: the row is now hidden, so its switch reads unchecked with the "show" label.
  await expect(
    page.getByRole("switch", { name: "Show in lists" }).first(),
  ).not.toBeChecked();
  // Undo so reruns start from the fixture state.
  await page.getByRole("switch", { name: "Show in lists" }).first().click();
  await expect(page.getByText("Series visibility updated")).toBeVisible();

  // The KASE ticker input is validated before anything is sent.
  const ticker = page.getByLabel("KASE ticker").first();
  await ticker.fill("not!a@ticker");
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Use 2–12 letters or digits.")).toBeVisible();

  // Ticker + organisation save through the Radix select.
  await ticker.fill("QPNB");
  await page.getByRole("combobox", { name: "Organisation" }).first().click();
  await page.getByRole("option", { name: "Demo Issuer JSC" }).click();
  await page.getByRole("button", { name: "Save" }).first().click();
  await expect(page.getByText("Series settings saved")).toBeVisible();

  // RU renders with real translations.
  await switchLocale(page, "ru", "Выпуски");
  await expect(table).toContainText("Тикер KASE");
  await expect(
    page.getByRole("switch", { name: "Скрыть из списков" }).first(),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(await noOverflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("admin audit: filters narrow the feed and the CSV link carries them", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInAs(page, "admin", baseURL);
  await page.goto("/admin/audit");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Audit log");
  const table = page.getByRole("table");
  await expect(table).toContainText("POST /registrar/investors");
  await expect(table).toContainText("POST /auth/reset");

  // Filter by route substring: only matching rows survive.
  await page.getByLabel("Route").fill("/admin/series");
  await page.getByRole("button", { name: "Apply" }).click();
  await page.waitForURL(/route=%2Fadmin%2Fseries/);
  await expect(table).toContainText("PATCH /admin/series/");
  await expect(table).not.toContainText("POST /registrar/investors");

  // The CSV export link keeps every active filter.
  await expect(page.getByRole("link", { name: "Export CSV" })).toHaveAttribute(
    "href",
    /\/api\/bo-get\/admin\/audit\?route=%2Fadmin%2Fseries&format=csv$/,
  );

  // Failed-only across all routes: the failed write is left, the successes are gone.
  await page.getByLabel("Route").fill("");
  await page.getByLabel("Result", { exact: true }).selectOption("false");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(table).toContainText("series_exists");
  await expect(table).not.toContainText("series settings updated");

  // RU renders with real translations.
  await switchLocale(page, "ru", "Журнал действий");
  await expect(table).toContainText("Ошибка");
  expect(errors).toEqual([]);
});
