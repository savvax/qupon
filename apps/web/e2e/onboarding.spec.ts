import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

/**
 * Investor onboarding checklist (task 808) in mock mode: the `mock:member`
 * account sees the five devnet steps, the faucet buttons per test asset write
 * through POST /me/faucet and flip the test-cash row, RU strings render, and
 * a mainnet profile shows no checklist at all.
 */

const cookies = (baseURL: string | undefined, rest: Record<string, string>) =>
  Object.entries(rest).map(([name, value]) => ({
    name,
    value,
    url: baseURL ?? "http://localhost:3000",
  }));

test("checklist rows, faucet buttons flip the test-cash step", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "member", baseURL);
  await page.goto("/investor");

  await expect(
    page.getByRole("heading", { name: "Getting started on devnet" }),
  ).toBeVisible();

  // account and wallet are done; KYC, test cash and subscription are pending.
  const row = (key: string) => page.locator(`li[data-key=${key}]`);
  await expect(row("account")).toHaveAttribute("data-done", "true");
  await expect(row("walletLinked")).toHaveAttribute("data-done", "true");
  await expect(row("kycApproved")).toHaveAttribute("data-done", "false");
  await expect(row("subscribed")).toHaveAttribute("data-done", "false");

  // one faucet button per test asset (testAssets ∩ enabled registry)
  await expect(
    page.getByRole("button", { name: "Get KZTE-dev" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Get dKZT" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Get USDC" })).toHaveCount(0);

  await page.getByRole("button", { name: "Get KZTE-dev" }).click();
  await expect(page.getByText("Test KZTE-dev is on its way")).toBeVisible({
    timeout: 15_000,
  });
  await expect(row("testCashReceived")).toHaveAttribute("data-done", "true", {
    timeout: 15_000,
  });
});

test("RU strings render", async ({ page, baseURL }) => {
  await signInAs(page, "member", baseURL);
  await page.context().addCookies(cookies(baseURL, { NEXT_LOCALE: "ru" }));
  await page.goto("/investor");

  await expect(
    page.getByRole("heading", { name: "Начало работы в devnet" }),
  ).toBeVisible();
  await expect(page.getByText("Кошелёк привязан")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Получить dKZT" }),
  ).toBeVisible();
});

test("no checklist on a mainnet profile", async ({ page, baseURL }) => {
  await signInAs(page, "member", baseURL);
  await page
    .context()
    .addCookies(cookies(baseURL, { qupon_mock_network: "mainnet-beta" }));
  await page.goto("/investor");

  await expect(
    page.getByRole("heading", { name: "Getting started on devnet" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Get KZTE-dev" })).toHaveCount(
    0,
  );
  // the KYC banner stands in: still exactly one onboarding block (task 91109)
  await expect(
    page.getByRole("heading", { name: /Two steps to your first bond/ }),
  ).toBeVisible();
  await expect(
    page.locator("section[aria-labelledby^=onboarding]"),
  ).toHaveCount(1);
});
