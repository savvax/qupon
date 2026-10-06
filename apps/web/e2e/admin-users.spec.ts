import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

test("users: create, disable, reset-link modal, reset page sets a password", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "admin", baseURL);
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "Users" })).toBeVisible();

  // Seeded rows: role/status badges, a disabled user, demo users read-only.
  const mira = page.getByRole("row").filter({ hasText: "mira@qupon.test" });
  await expect(mira).toBeVisible();
  const blocked = page
    .getByRole("row")
    .filter({ hasText: "blocked@qupon.test" });
  await expect(blocked.getByText("Disabled")).toBeVisible();
  const demoRow = page.getByRole("row").filter({ hasText: "investor@demo.kz" });
  await expect(demoRow.getByText("Demo", { exact: true })).toBeVisible();
  await expect(demoRow.getByRole("button")).toHaveCount(0);

  // Filters: role=investor leaves only investors.
  await page.getByLabel("Role", { exact: true }).selectOption("investor");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "registrar@qupon.test" }),
  ).toHaveCount(0);
  await expect(mira).toBeVisible();

  // Create user (Investor role, no org) — wait for hydration after the GET-form
  // navigation so the dialog button's handler is attached.
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Create user" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Email").fill("timur@newbank.kz");
  await dialog.getByLabel("Full name").fill("Timur Tenge");
  await dialog.getByLabel("Initial password").fill("first-password-123");
  await dialog.getByRole("button", { name: "Create user" }).click();
  await expect(page.getByText("User created")).toBeVisible({
    timeout: 15_000,
  });
  const row = page.getByRole("row").filter({ hasText: "timur@newbank.kz" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.getByText("Active")).toBeVisible();

  // Edit: disable the user.
  await row.getByRole("button", { name: "Edit user" }).click();
  const edit = page.getByRole("dialog");
  await edit.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Disabled" }).click();
  await expect(
    edit.getByText("Disabling signs the user out everywhere"),
  ).toBeVisible();
  await edit.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("User updated")).toBeVisible({
    timeout: 15_000,
  });
  await expect(row.getByText("Disabled")).toBeVisible({ timeout: 15_000 });

  // Reset link: modal shows a one-time URL with copy button and expiry.
  await row.getByRole("button", { name: "Reset link" }).click();
  const reset = page.getByRole("dialog");
  await reset.getByRole("button", { name: "Generate link" }).click();
  const urlInput = reset.getByLabel("Reset link URL");
  await expect(urlInput).toHaveValue(/\/reset\/.+/, { timeout: 15_000 });
  await expect(reset.getByText(/Expires .+\(Almaty\)/)).toBeVisible();
  await expect(reset.getByText("Copy it now")).toBeVisible();
  await expect(reset.getByRole("button", { name: "Copy" })).toBeVisible();

  // The reset page (public) sets a password with that token (mock backend).
  const token = (await urlInput.inputValue()).split("/reset/")[1];
  // the person resetting is signed out (a signed-in visitor to /login is sent home)
  await page.context().clearCookies();
  await page.goto(`/reset/${token}`);
  await expect(
    page.getByRole("heading", { name: "Set a new password" }),
  ).toBeVisible();
  await page
    .getByLabel("New password", { exact: true })
    .fill("second-password-456");
  await page.getByLabel("Repeat the password").fill("second-password-456");
  await page.getByRole("button", { name: "Set password" }).click();
  await expect(
    page.getByText("Password set. Sign in with the new password."),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("main").getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login/);
});

test("organisations: list and create", async ({ page, baseURL }) => {
  await signInAs(page, "admin", baseURL);
  await page.goto("/admin/organizations");
  await expect(
    page.getByRole("heading", { name: "Organisations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("row").filter({ hasText: "Demo Issuer JSC" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Create organisation" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Name").fill("Bereke Bank");
  await dialog.getByRole("combobox", { name: "Kind" }).click();
  await page.getByRole("option", { name: "Issuer" }).click();
  await dialog.getByLabel("BIN").fill("220840012345");
  await dialog.getByRole("button", { name: "Create organisation" }).click();
  await expect(page.getByText("Organisation created")).toBeVisible({
    timeout: 15_000,
  });
  const row = page.getByRole("row").filter({ hasText: "Bereke Bank" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row).toContainText("220840012345");
});

test("RU strings render on users, organizations and the reset page", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "admin", baseURL);
  await page.context().addCookies([
    {
      name: "NEXT_LOCALE",
      value: "ru",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
  await page.goto("/admin/users");
  await expect(
    page.getByRole("heading", { name: "Пользователи" }),
  ).toBeVisible();
  await expect(page.getByText("Организация").first()).toBeVisible();
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: "blocked@qupon.test" })
      .getByText("Отключён"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Создать пользователя" }).click();
  await expect(
    page.getByRole("dialog").getByLabel("Начальный пароль"),
  ).toBeVisible();

  await page.goto("/admin/organizations");
  await expect(
    page.getByRole("heading", { name: "Организации" }),
  ).toBeVisible();

  await page.goto("/reset/kakoy-to-token");
  await expect(
    page.getByRole("heading", { name: "Новый пароль" }),
  ).toBeVisible();
  await expect(page.getByLabel("Повторите пароль")).toBeVisible();
});
