import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
/** Random base58 mint so repeated runs never hit the mock's asset_exists. */
const freshMint = () =>
  Array.from(
    { length: 44 },
    () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)],
  ).join("");

test("assets table, add-by-mint with warnings, then enable", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "admin", baseURL);
  await page.goto("/admin/assets");
  await expect(
    page.getByRole("heading", { name: "Cash assets" }),
  ).toBeVisible();

  // Seeded presets: enabled rows, a disabled one (KZTE-dev) with a freeze-authority chip.
  await expect(
    page.getByRole("row").filter({ hasText: "tKZT" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "dKZT" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Freeze authority live").first()).toBeVisible();
  await expect(
    page.locator("a[href*='explorer.solana.com']").first(),
  ).toBeVisible();

  // Add by mint address: paste → verify → warnings shown (Review Focus).
  const mint = freshMint();
  await page.getByRole("button", { name: "Add asset" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Mint address").fill(mint);
  await page.getByRole("button", { name: "Verify on-chain" }).click();
  await expect(dialog.getByText("Verified on-chain")).toBeVisible({
    timeout: 15_000,
  });
  await expect(dialog.getByText("Decimals")).toBeVisible();
  await expect(dialog.getByText("SPL", { exact: true })).toBeVisible();
  await expect(dialog.getByText("Freeze authority live")).toBeVisible();
  await expect(dialog.getByText("Mint authority live")).toBeVisible();

  // Fill metadata, keep it disabled on save.
  await dialog.getByLabel("Ticker").fill("FAKE");
  await dialog.getByLabel("Name").fill("Fake devnet token");
  await page.getByRole("button", { name: "Save asset" }).click();
  await expect(page.getByText("Asset added (disabled)")).toBeVisible({
    timeout: 15_000,
  });

  const row = page.getByRole("row").filter({ hasText: "FAKE" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByRole("switch")).toHaveAttribute(
    "aria-checked",
    "false",
  );

  // Enabling a freezable mint asks for an explicit confirmation first.
  await row.getByRole("switch").click();
  await expect(
    page.getByText("This mint has a freeze authority"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Enable anyway" }).click();
  await expect(page.getByText("Asset enabled")).toBeVisible({
    timeout: 15_000,
  });
  await expect(row.getByRole("switch")).toHaveAttribute("aria-checked", "true");
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
  await page.goto("/admin/assets");
  await expect(
    page.getByRole("heading", { name: "Денежные активы" }),
  ).toBeVisible();
  await expect(page.getByText(/идентифицируются адресом минта/)).toBeVisible();
  await expect(
    page.getByText("Активен freeze authority").first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "Добавить актив" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Адрес минта", { exact: true })).toBeVisible();
  // Empty field + verify → the base58 validation error in Russian.
  await dialog.getByRole("button", { name: "Проверить в блокчейне" }).click();
  await expect(
    dialog.getByText("Введите корректный base58-адрес Solana"),
  ).toBeVisible();
});
