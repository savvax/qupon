import { expect, test } from "@playwright/test";
import { signInAs } from "./session";

test("overview KPIs link to their pages", async ({ page, baseURL }) => {
  await signInAs(page, "admin", baseURL);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  // Mock fixtures: 7 users (admin/issuer/registrar/investor breakdown as hint),
  // 2 pending KYC applications, 2 series, 2 open on-chain actions, 1 low operator.
  const users = page.locator("main a", { hasText: "Users" });
  await expect(users).toHaveAttribute("href", "/admin/users");
  await expect(users.getByText("7", { exact: true })).toBeVisible();
  await expect(users.getByText(/Administrator\s1/)).toBeVisible();

  const kyc = page.locator("main a", { hasText: "Pending KYC" });
  await expect(kyc).toHaveAttribute("href", "/registrar/kyc");
  await expect(kyc.getByText("2", { exact: true })).toBeVisible();
  await expect(kyc.getByText(/SIMULATED/)).toBeVisible();

  const series = page.locator("main a", { hasText: "Series" });
  await expect(series).toHaveAttribute("href", "/admin/series");
  await expect(series.getByText("2", { exact: true })).toBeVisible();

  const open = page.locator("main a", { hasText: "Open actions" });
  await expect(open).toHaveAttribute("href", "/registrar/actions");
  await expect(open.getByText("2", { exact: true })).toBeVisible();

  const low = page.locator("main a", { hasText: "Low-balance operators" });
  await expect(low).toHaveAttribute("href", "/admin/system");
  await expect(low.getByText("1", { exact: true })).toBeVisible();
});

test("system health: dots, low operator, refresh every 15 s", async ({
  page,
  baseURL,
}) => {
  const calls: number[] = [];
  page.on("request", (r) => {
    if (r.url().includes("/api/bo-get/admin/system")) calls.push(calls.length);
  });
  await signInAs(page, "admin", baseURL);
  await page.clock.install();
  await page.goto("/admin/system");
  await expect(
    page.getByRole("heading", { name: "System health" }),
  ).toBeVisible();
  await expect(page.getByText("Reachable", { exact: true })).toBeVisible();
  // The paying-agent wallet sits under 0.5 SOL in the fixture → flagged.
  await expect(
    page.getByRole("list").getByText("Low", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Updated /)).toBeVisible();

  // Fake-clock jump past the 15 s interval → a second probe fires.
  await page.clock.fastForward("00:16");
  await expect.poll(() => calls.length).toBeGreaterThanOrEqual(2);
});

test("RU strings render on both pages", async ({ page, baseURL }) => {
  await signInAs(page, "admin", baseURL);
  await page.context().addCookies([
    {
      name: "NEXT_LOCALE",
      value: "ru",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "Обзор платформы" }),
  ).toBeVisible();
  await expect(page.getByText("Заявки на KYC")).toBeVisible();
  await expect(page.getByText(/проверка: SIMULATED/)).toBeVisible();

  await page.goto("/admin/system");
  await expect(
    page.getByRole("heading", { name: "Состояние системы" }),
  ).toBeVisible();
  await expect(page.getByText("Доступен", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("list").getByText("Низкий", { exact: true }),
  ).toBeVisible();
});
