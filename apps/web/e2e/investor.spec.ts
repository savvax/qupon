import { expect, test } from "@playwright/test";

/**
 * Investor cabinet (Plan 3 Task 6) against the mock registrar API: the
 * chooser for anonymous visitors, the demo investor's portfolio/placement/
 * statements, and the demo vote flow on the open meeting.
 */

test("anonymous visitor gets the wallet/demo chooser, no crash", async ({
  page,
}) => {
  await page.goto("/investor");
  await expect(
    page.getByRole("main").getByRole("button", { name: "Connect wallet" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Try the demo investor" }),
  ).toBeVisible();
});

test("demo investor sees holdings, history and the petrol portfolio header", async ({
  page,
}) => {
  await page.goto("/investor");
  await page.getByRole("button", { name: "Try the demo investor" }).click();

  // investor3 of the demo runs: 65 × QPNb1 (tKZT) and 30 × BTRKdemo (USDC)
  await expect(page.getByText("QPNb1").first()).toBeVisible();
  await expect(page.getByText("BTRKdemo").first()).toBeVisible();
  await expect(page.getByText("KYC verified").first()).toBeVisible();

  // entitlement history: the paid coupon (65 units → 3,250.00 tKZT)
  await expect(page.getByText("QPNb1-INTR-0001").first()).toBeVisible();
  await expect(page.getByText("3,250.00").first()).toBeVisible();
});

test("demo investor votes on the open meeting (or sees the empty state)", async ({
  page,
}) => {
  await page.goto("/investor/meetings");
  await page.getByRole("button", { name: "Try the demo investor" }).click();

  const forButton = page.getByRole("button", { name: "For", exact: true });
  const empty = page.getByText("No open meetings");
  await expect(forButton.or(empty).first()).toBeVisible({ timeout: 15_000 });
  if (!(await forButton.isVisible().catch(() => false))) {
    // no meeting is open — the page must say so clearly instead of crashing
    await expect(empty).toBeVisible();
    return;
  }

  await forButton.click();
  await expect(page.getByRole("dialog")).toContainText("For");
  await page.getByRole("button", { name: "Cast vote" }).click();
  await expect(page.getByText(/Vote recorded: For/)).toBeVisible({
    timeout: 15_000,
  });
});

test("demo investor subscribes at par and sees the payout statement", async ({
  page,
}) => {
  await page.goto("/investor/placement");
  await page.getByRole("button", { name: "Try the demo investor" }).click();

  await expect(
    page.getByText("Primary placement", { exact: false }).first(),
  ).toBeVisible();
  await page.getByLabel("Units").fill("2");
  await page.getByRole("button", { name: "Subscribe (DvP)" }).click();
  await expect(page.getByText(/Subscribed: 2 × /)).toBeVisible({
    timeout: 15_000,
  });

  await page.goto("/investor/statements");
  await expect(
    page.getByRole("link", { name: "Download" }).first(),
  ).toBeVisible();
});
