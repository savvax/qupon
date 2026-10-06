import { expect, test } from "@playwright/test";

const INTR = "ActnINTR0001Dem0PDA111111111111111111111111111";
const INTR_OFF = "ActnINTR0003Dem0PDA111111111111111111111111111";
const BMET = "ActnBMET0002Dem0PDA1111111111111111111111111111";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/login?next=/registrar/actions");
  await page.getByRole("button", { name: /Registrar/ }).click();
  await expect(page).toHaveURL(/\/registrar\/actions$/);
  // wait for the client navigation to commit before any page.goto
  await expect(
    page.getByRole("heading", { level: 1, name: "Corporate actions" }),
  ).toBeVisible();
}

test("the schedule check card confirms a matching fixation date", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/registrar/actions/${INTR}`);
  await expect(
    page.getByRole("heading", { name: "KASE schedule check" }),
  ).toBeVisible();
  await expect(page.getByText("Match", { exact: true })).toBeVisible();
  await expect(page.getByText("2027-02-28").first()).toBeVisible();
});

test("the schedule check card flags a fixation mismatch", async ({ page }) => {
  await signIn(page);
  await page.goto(`/registrar/actions/${INTR_OFF}`);
  await expect(page.getByText("Mismatch", { exact: true })).toBeVisible();
  // both dates stay visible on the card for the registrar to compare
  const card = page.locator("section", {
    has: page.getByRole("heading", { name: "KASE schedule check" }),
  });
  await expect(card.getByText("2026-09-28")).toBeVisible();
  await expect(card.getByText("2026-09-27")).toBeVisible();
});

test("a meeting has no coupon period to check", async ({ page }) => {
  await signIn(page);
  await page.goto(`/registrar/actions/${BMET}`);
  await expect(
    page.getByText("This action has no coupon period to compare."),
  ).toBeVisible();
});

test("the disclosure package downloads and submits to KASE — SIMULATED", async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/registrar/actions/${INTR}`);
  // mock mode has no registrar service: fulfil the ZIP link locally
  await page.route("**/actions/*/disclosure.zip", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="disclosure.demo.zip"',
      },
      body: "PK\u0003\u0004demo",
    }),
  );
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download ZIP" }).click();
  const zip = await download;
  expect(zip.suggestedFilename()).toBe("disclosure.demo.zip");

  await page
    .getByRole("button", { name: /Submit to KASE\s— SIMULATED/ })
    .click();
  await expect(page.getByText("Submitted (audit row recorded)")).toBeVisible();
  // the simulated note is always on the card
  await expect(
    page.getByText(/SIMULATED: submission records an audit row only/),
  ).toBeVisible();
});

test("RU strings render on the schedule check and disclosure cards", async ({
  page,
  baseURL,
}) => {
  await signIn(page);
  await page.context().addCookies([
    {
      name: "NEXT_LOCALE",
      value: "ru",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
  await page.goto(`/registrar/actions/${INTR}`);
  await expect(
    page.getByRole("heading", { name: "Сверка графика KASE" }),
  ).toBeVisible();
  await expect(page.getByText("Совпадает", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Пакет раскрытия" }),
  ).toBeVisible();
});
