import { expect, test } from "@playwright/test";

const INTR = "ActnINTR0001Dem0PDA111111111111111111111111111";
const BMET = "ActnBMET0002Dem0PDA1111111111111111111111111111";

test.beforeEach(async ({ page }) => {
  await page.goto("/login?next=/registrar/actions");
  await page.getByRole("button", { name: /Registrar/ }).click();
  await expect(page).toHaveURL(/\/registrar\/actions$/);
  // the URL flips before the client navigation lands; wait for the page itself
  await expect(
    page.getByRole("heading", { level: 1, name: "Corporate actions" }),
  ).toBeVisible();
});

test("actions list opens a completed coupon with every step done and all holders paid", async ({
  page,
}) => {
  // a click before hydration is lost: retry until the tab is really active
  const all = page.getByRole("tab", { name: "All" });
  await expect(async () => {
    await all.click();
    await expect(all).toHaveAttribute("aria-selected", "true", {
      timeout: 1000,
    });
  }).toPass();
  await page.locator(`a[href="/registrar/actions/${INTR}"]`).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Coupon");
  // completed: the status pill says it; no grey "Action completed" box (task 9106)
  await expect(page.getByText("Action completed")).toHaveCount(0);
  const paid = page.locator("table").getByText("Paid", { exact: true });
  await expect(paid).toHaveCount(3);
  await expect(page.getByText("Fully funded").first()).toBeVisible();
});

test("a meeting shows the proposal, the vote columns and the voting wait", async ({
  page,
}) => {
  await page.goto(`/registrar/actions/${BMET}`);
  await expect(page.getByText("10.00% → 12.00%").first()).toBeVisible();
  await expect(page.locator("table").getByText("Not voted")).toHaveCount(3);
  await expect(page.getByText(/Voting is open/)).toBeVisible();
});

test("an unknown action is a 404", async ({ page }) => {
  const res = await page.goto(
    "/registrar/actions/11111111111111111111111111111111",
  );
  expect(res?.status()).toBe(404);
});
