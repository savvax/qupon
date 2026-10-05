import { expect, test } from "@playwright/test";
import { generateKeyPairSigner } from "@solana/kit";

/** Sign in as the demo registrar (mock mode fakes the token, deploys use DEMO_LOGIN=1). */
async function demoRegistrar(page: import("@playwright/test").Page) {
  await page.goto("/registrar");
  if (page.url().includes("/login")) {
    await page
      .getByRole("button", { name: /Registrar|Регистратор/ })
      .first()
      .click();
    await expect(page).toHaveURL(/\/registrar$/);
  }
}

test("dashboard: kpis, pipeline columns and the record-date alert", async ({
  page,
}) => {
  await demoRegistrar(page);
  await expect(page.getByRole("heading", { name: "Pipeline" })).toBeVisible();
  for (const col of [
    "Announced",
    "Record struck",
    "Snapshot complete",
    "Funded",
    "Settling",
    "Completed",
  ])
    await expect(
      page.getByRole("heading", { name: col, exact: true }),
    ).toBeVisible();
  // The mock's announced BTRKdemo coupon (record date already passed) lands in column 1 + alerts.
  await expect(
    page.getByRole("link", { name: /BTRKdemo/ }).first(),
  ).toBeVisible();
  await expect(page.getByText(/Record date has passed/)).toBeVisible();
});

test("investors table lists attested holders; suspend and reinstate write through runWrite", async ({
  page,
}) => {
  await demoRegistrar(page);
  await page.goto("/registrar/investors");
  await expect(page.getByRole("heading", { name: "Investors" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /DL8G/ })).toBeVisible();
  await expect(page.getByText("Active", { exact: true }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Non-resident" })).toBeVisible();

  await page.getByRole("button", { name: "Suspend" }).first().click();
  await expect(page.getByText("Suspend this investor?")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Suspend" })
    .click();
  await expect(page.getByText("Investor suspended")).toBeVisible({
    timeout: 15_000,
  });
});

test("onboard dialog validates the wallet before anything is sent", async ({
  page,
}) => {
  await demoRegistrar(page);
  await page.goto("/registrar/investors");
  await page.getByRole("button", { name: "Onboard investor" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Onboard investor" })
    .click();
  await expect(
    page.getByText("Enter a valid base58 Solana address"),
  ).toBeVisible();
});

test("RU locale renders the dashboard without raw keys", async ({
  page,
  context,
}) => {
  await page.goto("/login");
  await context.addCookies([
    { name: "NEXT_LOCALE", value: "ru", url: new URL(page.url()).origin },
  ]);
  await demoRegistrar(page);
  await expect(page.getByRole("heading", { name: "Конвейер" })).toBeVisible();
  await page.goto("/registrar/investors");
  await expect(page.getByRole("heading", { name: "Инвесторы" })).toBeVisible();
});

/**
 * Full on-chain flow (Plan 3 Task 3 Step 3): onboards a fresh random wallet
 * into the first registered series on a real deployment, then suspend →
 * reinstate. Runs only with E2E_BASE_URL (deployed site + devnet); the mock
 * mode above covers the UI wiring.
 */
test("onboard a fresh wallet, suspend, reinstate (live)", async ({ page }) => {
  // Live gate: a deployment URL, not a local dev server (those run mock mode).
  const live =
    process.env.E2E_BASE_URL &&
    !/localhost|127\.0\.0\.1/.test(process.env.E2E_BASE_URL);
  test.skip(!live, "needs the deployed registrar API (E2E_BASE_URL)");
  await demoRegistrar(page);
  await page.goto("/registrar/investors");

  const owner = (await generateKeyPairSigner()).address;
  await page.getByRole("button", { name: "Onboard investor" }).click();
  await page.getByLabel("Wallet address").fill(owner);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Onboard investor" })
    .click();
  await expect(page.getByText("Investor onboarded")).toBeVisible({
    timeout: 60_000,
  });
  await page.reload();
  const row = page.getByRole("row").filter({ hasText: owner.slice(0, 4) });
  await expect(row.getByText("Active", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await row.getByRole("button", { name: "Suspend" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Suspend" })
    .click();
  await expect(page.getByText("Investor suspended")).toBeVisible({
    timeout: 60_000,
  });
  await expect(row.getByText("Suspended", { exact: true })).toBeVisible({
    timeout: 30_000,
  });

  await row.getByRole("button", { name: "Reinstate" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Reinstate" })
    .click();
  await expect(page.getByText("Investor reinstated")).toBeVisible({
    timeout: 60_000,
  });
  await expect(row.getByText("Active", { exact: true })).toBeVisible({
    timeout: 30_000,
  });
});
