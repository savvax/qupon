import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

// The mock inbox is stateful per dev server: run these serially, in order.
test.describe.configure({ mode: "serial" });

test("bell: unread count, panel with the latest, links where the user acts", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "member", baseURL);
  await page.goto("/investor");
  const bell = page.getByRole("button", { name: /Notifications, \d+ unread/ });
  await expect(bell).toBeVisible();
  await expect(page.getByTestId("bell-count")).toHaveText("3");
  await bell.click();
  const panel = page.getByRole("dialog", { name: "Notifications" });
  await expect(panel.getByText("QPNb1: payment received")).toBeVisible();
  await expect(
    panel.getByText("QPNb1: bondholder meeting opened"),
  ).toBeVisible();
  await panel.getByText("QPNb1: payment received").click();
  await expect(page).toHaveURL(/\/investor\/statements$/);
  await expect(page.getByTestId("bell-count")).toHaveText("2");
});

test("full list: unread filter, mark all as read; RU", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "member", baseURL);
  await page.goto("/account/notifications");
  await expect(
    page.getByRole("heading", { level: 1, name: "Notifications" }),
  ).toBeVisible();
  await page.getByLabel(/Unread only/).check();
  await expect(page.getByText("Verification approved")).toHaveCount(0);
  await page.getByRole("button", { name: "Mark all as read" }).click();
  await expect(page.getByText("New", { exact: true })).toHaveCount(0);
  await expect(page.getByTestId("bell-count")).toHaveCount(0); // the bell re-counts at once
  await page
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: "ru", url: baseURL ?? "" }]);
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Уведомления" }),
  ).toBeVisible();
  await expect(page.getByText("Верификация одобрена")).toBeVisible();
});
