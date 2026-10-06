import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

test("member account lists linked wallets and offers to link the connected one", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "member", baseURL);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Account" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wallets" })).toBeVisible();
  await expect(page.getByText("DL8G…aJEo")).toBeVisible();
  await expect(page.getByText("Primary")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Connect wallet" }),
  ).toBeVisible();
  // the top bar links back here and shows the network
  await expect(page.locator("[data-network=devnet]").first()).toBeVisible();
});

test("demo accounts cannot link wallets", async ({ page, baseURL }) => {
  await signInAs(page, "investor", baseURL);
  await page.goto("/account");
  await expect(page.getByText(/cannot link wallets/)).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Create your own account" }),
  ).toBeVisible();
});

test("RU strings render", async ({ page, baseURL }) => {
  await signInAs(page, "member", baseURL);
  await page
    .context()
    .addCookies([
      { name: "NEXT_LOCALE", value: "ru", url: baseURL ?? "http://localhost:3000" },
    ]);
  await page.goto("/account");
  await expect(page.getByRole("heading", { name: "Аккаунт" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Кошельки" })).toBeVisible();
});
