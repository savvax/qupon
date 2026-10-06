import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./session";

const noOverflow = (page: Page) =>
  page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );

/** Click EN|RU and wait for the heading to follow (retries once pre-hydration, as in admin-series-audit). */
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

const QPNB1 = "QpNb1Dem0BondMint1111111111111111111111111111";
const ACTION_PDA_1 = "ActnINTR0001Dem0PDA111111111111111111111111111";

test("investor: statement filters, tax year, CSV keeps the filters (brief numbers)", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInAs(page, "member", baseURL);
  await page.goto("/investor/reports");

  // Statement defaults: the first holder's coupon (500.00 tKZT) and redemption principal (10,000.00).
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  const table = page.getByRole("table").first();
  await expect(table).toContainText("500.00");
  await expect(table).toContainText("10,000.00");

  // Filter to 2026: the redemption (2028) drops out.
  await page.getByLabel("From").fill("2026-01-01");
  await page.getByLabel("To").fill("2026-12-31");
  await page.getByRole("button", { name: "Apply" }).first().click();
  await page.waitForURL(/from=2026-01-01/);
  await expect(table).toContainText("500.00");
  await expect(table).not.toContainText("10,000.00");

  // The CSV download keeps every active filter.
  const csv = page.locator(
    "a[href='/api/bo-get/me/reports/statement?from=2026-01-01&to=2026-12-31&format=csv']",
  );
  await expect(csv).toBeVisible();
  const res = await page.request.get(
    `${baseURL}/api/bo-get/me/reports/statement?from=2026-01-01&to=2026-12-31&format=csv`,
  );
  expect(res.status()).toBe(200);
  const body = await res.text();
  expect(body.startsWith("\ufeff")).toBe(true); // UTF-8 BOM
  expect(body).toContain("payment_date,series,isin");
  expect(body).toContain("# report,statement");
  expect(body).toContain("500.00");

  // Tax certificate: 2026 has the coupon, 2028 the redemption principal.
  await page.getByLabel("Year").selectOption("2028");
  await page.getByRole("button", { name: "Apply" }).nth(1).click();
  await page.waitForURL(/year=2028/);
  await expect(page.getByRole("table").nth(1)).toContainText("10,000.00");

  // RU renders with natural translations: locale money groups and the translated status.
  await switchLocale(page, "ru", "Отчёты");
  await expect(page.getByRole("table").first()).toContainText("Начислено");
  // RU money groups (U+202F) and the translated status; the 2028 redemption sits in the tax table/KPIs.
  await expect(page.locator("body")).toContainText(/10\s000,00/);
  await expect(page.getByRole("table").first()).toContainText("Выплачено");
  expect(await noOverflow(page)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("registrar: holder register, printable view and CSV", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInAs(page, "registrar", baseURL);
  await page.goto("/registrar/reports");

  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  const table = page.getByRole("table");
  await expect(table).toContainText("10");
  await expect(table).toContainText("25");
  await expect(table).toContainText("65");
  await expect(
    page.locator(
      `a[href='/api/bo-get/registrar/reports/holders/${QPNB1}?format=csv']`,
    ),
  ).toBeVisible();

  // Printable view: sheet + Save as PDF (the browser print dialog).
  await page.getByRole("link", { name: "Printable view" }).click();
  await page.waitForURL(new RegExp(`/print/holders\\?mint=${QPNB1}`));
  await expect(
    page.getByRole("heading", { name: "Qupon · Holder register" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save as PDF" })).toBeVisible();
  await expect(page.getByRole("table")).toContainText("65");
  expect(await noOverflow(page)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

test("issuer: payout report button opens the printable payout sheet", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await signInAs(page, "issuer", baseURL);
  await page.goto(`/issuer/series/${QPNB1}`);
  await page.getByRole("link", { name: "Payout report" }).first().click();
  await page.waitForURL(new RegExp(`/print/payouts\\?pda=${ACTION_PDA_1}`));

  // The brief's coupon split over 10/25/65 units.
  await expect(
    page.getByRole("heading", { name: "Qupon · Payout report" }),
  ).toBeVisible();
  const table = page.getByRole("table");
  await expect(table).toContainText("500.00");
  await expect(table).toContainText("1,250.00");
  await expect(table).toContainText("3,250.00");
  await expect(
    page.locator(
      `a[href='/api/bo-get/issuer/reports/payouts/${ACTION_PDA_1}?format=csv']`,
    ),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("reports access matrix: an investor cannot open the registrar register", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "member", baseURL);
  await page.goto(`/print/holders?mint=${QPNB1}`);
  await expect(
    page.getByText("Your role cannot open this report."),
  ).toBeVisible();
});
