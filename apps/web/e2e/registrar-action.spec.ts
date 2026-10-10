import { expect, test } from "@playwright/test";

const INTR = "ActnINTR0001Dem0PDA111111111111111111111111111";
const BMET = "ActnBMET0002Dem0PDA1111111111111111111111111111";
const DEFAULTED = "ActnINTR0006Dem0PDA111111111111111111111111111";
const BANK = "ActnREDM0007Dem0PDA111111111111111111111111111";

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
  // cold dev server: the detail route compiles on first visit — the default 5 s expect timeout flakes under load
  await expect(page).toHaveURL(new RegExp(`/registrar/actions/${INTR}`), {
    timeout: 30_000,
  });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Coupon",
    {
      timeout: 30_000,
    },
  );
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
test("a defaulted coupon shows the shortfall, the red fund step, the declaration tx and the cure", async ({
  page,
}) => {
  await page.goto(`/registrar/actions/${DEFAULTED}`);
  // the loudest state in the system: status pill, shortfall, and when it was declared
  await expect(page.getByText("In default", { exact: true })).toBeVisible();
  await expect(page.getByText(/In default since/)).toBeVisible();
  await expect(page.getByText(/Shortfall:/)).toBeVisible();
  await expect(page.getByText("2,000.00").first()).toBeVisible();
  // the fund step is red, the declaration is its own timeline step with its tx
  await expect(
    page.getByText("Defaulted", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Default declared", { exact: true }),
  ).toBeVisible();
  // the cure is funding — the NowBar offers it to the issuer
  await expect(
    page.getByText(/In default: the issuer cures it by funding/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Fund escrow" })).toBeVisible();
});

test("bank-routed payouts await the paying agent's confirmation with a reference", async ({
  page,
}) => {
  await page.goto(`/registrar/actions/${BANK}`);
  // every PaidToAgent row is in the panel with its route hash
  await expect(
    page.getByRole("heading", { name: "Bank confirmations" }),
  ).toBeVisible();
  await expect(page.getByText(/2 payouts waiting/)).toBeVisible();
  await expect(
    page.locator("table").getByText("Paid to agent", { exact: true }),
  ).toHaveCount(2);
  await expect(page.getByText(/route hash a1b2/).first()).toBeVisible();
  // the NowBar links to the panel instead of an advance button (one reference per holder)
  await expect(
    page.getByRole("link", { name: "Confirm bank payout" }),
  ).toHaveAttribute("href", "#bank");
  // confirm one payout with a reference (mock write succeeds with a signature)
  const ref = page.getByLabel("Transfer reference").first();
  await ref.fill("KZ-9f3-2211");
  await page
    .getByRole("button", { name: "Confirm", exact: true })
    .first()
    .click();
  await expect(page.getByText("Bank payout confirmed")).toBeVisible();
  // the confirmation is an on-chain write: its toast links the tx on the devnet explorer (AGENTS.md)
  const toastBox = page.locator('div[aria-live="polite"]');
  await expect(
    toastBox.locator('a[href*="explorer.solana.com/tx/"]'),
  ).toBeVisible();
});

test("the disclosure hash panel re-hashes the served seev.031 in the browser", async ({
  page,
}) => {
  await page.goto(`/registrar/actions/${INTR}`);
  // a click before hydration is lost (dev server): retry until the panel actually answers
  await expect(async () => {
    await page.getByRole("button", { name: "Verify in browser" }).click();
    await expect(
      page.getByText(/Served bytes hash to the anchored value/),
    ).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  // both hashes are shown so the operator can compare by eye
  await expect(
    page.getByText(
      "e69e6726894709998fb8a9c481c0ac2fe99401ed8a93cb0c2ad748a7a4194916",
    ),
  ).toHaveCount(2);
});

test("the registrar board has a Defaulted column and alerts for overdue funding and the bank", async ({
  page,
}) => {
  await page.goto("/registrar");
  // the board never hides a default: its own red column with a count
  await expect(
    page.getByRole("heading", { name: /^In default/i }).filter({
      has: page.getByText("1", { exact: true }),
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /QPNb1-INTR-0006/ }).first(),
  ).toBeVisible();
  // alerts: the default, and the two payouts waiting on the paying agent
  await expect(
    page.getByText(/In default — the issuer cures it by funding/),
  ).toBeVisible();
  await expect(page.getByText(/2 bank payouts await/)).toBeVisible();
});
