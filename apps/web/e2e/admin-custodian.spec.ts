import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

const TREASURY = "TreasuryWa11etAddress55555555555555555555555";

test("custodian page: SIMULATED banner, deposit mints, withdrawal burns", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "admin", baseURL);
  await page.goto("/admin/custodian");
  await expect(
    page.getByRole("heading", { name: "Wrapped digital tenge custodian" }),
  ).toBeVisible();

  // SIMULATED everywhere: banner + seeded ledger row
  await expect(page.getByText("SIMULATED", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "CBDC-2026-0001" }),
  ).toBeVisible();
  await expect(
    page.locator("a[href*='explorer.solana.com']").first(),
  ).toBeVisible();

  // Deposit: reference + amount + treasury → dKZT minted, row appears
  await page.getByRole("button", { name: "Record movement" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("CBDC reference").fill("CBDC-2026-0042");
  await dialog.getByLabel("Amount").fill("250000");
  await dialog.getByLabel("Treasury address").fill(TREASURY);
  await dialog.getByRole("button", { name: "Mint dKZT (SIMULATED)" }).click();
  await expect(page.getByText("dKZT minted (SIMULATED)")).toBeVisible({
    timeout: 15_000,
  });
  const depositRow = page
    .getByRole("row")
    .filter({ hasText: "CBDC-2026-0042" });
  await expect(depositRow).toBeVisible({ timeout: 15_000 });
  await expect(depositRow.getByText("250,000")).toBeVisible();
  await expect(depositRow.getByText("Deposit").first()).toBeVisible();

  // Withdrawal: reference + amount → burn
  await page.getByRole("button", { name: "Record movement" }).click();
  await dialog.getByRole("combobox", { name: "Movement" }).click();
  await page.getByRole("option", { name: "Withdrawal (burn)" }).click();
  await dialog.getByLabel("CBDC reference").fill("CBDC-OUT-0042");
  await dialog.getByLabel("Amount").fill("1000");
  await dialog.getByRole("button", { name: "Burn dKZT (SIMULATED)" }).click();
  await expect(page.getByText("dKZT burned (SIMULATED)")).toBeVisible({
    timeout: 15_000,
  });
  const withdrawRow = page
    .getByRole("row")
    .filter({ hasText: "CBDC-OUT-0042" });
  await expect(withdrawRow).toBeVisible({ timeout: 15_000 });
  await expect(withdrawRow.getByText("Withdrawal").first()).toBeVisible();
});

test("RU strings render", async ({ page, baseURL }) => {
  await signInAs(page, "admin", baseURL);
  await page.context().addCookies([
    {
      name: "NEXT_LOCALE",
      value: "ru",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
  await page.goto("/admin/custodian");
  await expect(
    page.getByRole("heading", { name: "Кастодиан цифрового тенге" }),
  ).toBeVisible();
  await expect(page.getByText("СИМУЛИРОВАНО", { exact: true })).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "CBDC-2026-0001" })
      .getByText("Депозит"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Записать операцию" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText("Операция кастодиана (СИМУЛИРОВАНО)"),
  ).toBeVisible();
  // empty reference + submit → nothing happens until fields are filled (button stays disabled)
  await expect(
    dialog.getByRole("button", { name: /Выпустить dKZT \(СИМУЛИРОВАНО\)/ }),
  ).toBeDisabled();
});
