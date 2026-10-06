import { expect, test } from "@playwright/test";

test("sign-up lands on /investor with the onboarding banner", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Create an account" }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(
    page.getByRole("heading", { name: "Create an investor account" }),
  ).toBeVisible();
  await page.getByLabel("Full name").fill("Aigerim Seitkali");
  await page.getByLabel("Email").fill("aigerim@example.kz");
  await page.getByLabel("Password").fill("short");
  await expect(page.getByText("Use at least 10 characters")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create account" }),
  ).toBeDisabled();
  await page.getByLabel("Password").fill("steppe-bonds-2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/investor$/);
  // one onboarding block: the devnet checklist, its current step is KYC (the mock member has a wallet)
  await expect(
    page.locator("section[aria-labelledby^=onboarding]"),
  ).toHaveCount(1);
  await expect(page.locator("li[aria-current=step]")).toHaveAttribute(
    "data-key",
    "kycApproved",
  );
  await page
    .locator("li[aria-current=step]")
    .getByRole("link", { name: "Apply" })
    .click();
  await expect(page).toHaveURL(/\/investor\/kyc$/);
});

test("a taken email is explained on the field; RU renders", async ({
  page,
  baseURL,
}) => {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Mira");
  await page.getByLabel("Email").fill("member@qupon.test");
  await page.getByLabel("Password").fill("steppe-bonds-2026");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/already exists/)).toBeVisible();
  await page
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: "ru", url: baseURL ?? "" }]);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Регистрация инвестора" }),
  ).toBeVisible();
});
