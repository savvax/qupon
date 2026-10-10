import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

// Task 9106: UX review round 2.

test("phones: investor history cards keep net, status and record date", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "investor", baseURL);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/investor");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Portfolio");
  const card = page.locator("section[aria-labelledby=history] li").first();
  await expect(card).toBeVisible();
  // "Record date" is also the glossary-term button (task 1530 language pass); .first() is the visible label.
  for (const label of ["Net", "Status", "Record date"])
    await expect(card.getByText(label, { exact: true }).first()).toBeVisible();
  // no horizontal page scroll
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("autopilot names the step and the series, with the command folded", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "registrar", baseURL);
  await page.goto("/registrar/autopilot");
  await expect(page.getByText("Strike record date").first()).toBeVisible();
  await expect(page.getByText("QPNb1").first()).toBeVisible();
  const cmd = page.locator("details").first();
  await expect(cmd.locator("code")).toBeHidden();
  await cmd.locator("summary").click();
  await expect(cmd.locator("code")).toContainText("strike_record");
});

test("dates follow the locale (RU 28.02.2027, EN Feb 28, 2027)", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "registrar", baseURL);
  await page.goto("/registrar/actions");
  await page.getByRole("tab", { name: "All" }).click();
  await expect(page.getByText("Feb 28, 2027").first()).toBeVisible();
  await page
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: "ru", url: baseURL ?? "" }]);
  await page.reload();
  await page.getByRole("tab", { name: "Все" }).click();
  await expect(page.getByText("28.02.2027").first()).toBeVisible();
});

test("404 has a heading; /login has no header sign-in", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.goto("/login");
  await expect(
    page.getByRole("banner").getByRole("link", { name: "Sign in" }),
  ).toHaveCount(0);
});
