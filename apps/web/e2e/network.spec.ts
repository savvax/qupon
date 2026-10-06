import { expect, type Page, test } from "@playwright/test";
import { signInAs } from "./session";

const mainnet = (page: Page, baseURL?: string) =>
  page.context().addCookies([
    {
      name: "qupon_mock_network",
      value: "mainnet-beta",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);

test("devnet: badge, explorer links carry ?cluster=devnet, demo sign-in offered", async ({
  page,
}) => {
  await page.goto("/login");
  await expect(page.locator("[data-network=devnet]").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Try it as…" })).toBeVisible();
});

test.describe("mainnet preview (mock)", () => {
  test("red badge, no demo sign-in, explorer links without cluster", async ({
    page,
    baseURL,
  }) => {
    await mainnet(page, baseURL);
    await page.goto("/login");
    await expect(
      page.locator("[data-network=mainnet-beta]").first(),
    ).toHaveText("Mainnet");
    await expect(page.getByRole("heading", { name: "Try it as…" })).toHaveCount(
      0,
    );

    await signInAs(page, "registrar", baseURL);
    await page.goto("/registrar/investors");
    const href = await page
      .getByRole("link", { name: /DL8G/ })
      .first()
      .getAttribute("href");
    expect(href).toMatch(/^https:\/\/explorer\.solana\.com\/address\/DL8G\w+$/);
  });

  test("a write needs the typed confirmation; cancel sends nothing", async ({
    page,
    baseURL,
  }) => {
    await mainnet(page, baseURL);
    await signInAs(page, "registrar", baseURL);
    await page.goto("/registrar/investors");
    const writes: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/bo/") && r.method() !== "GET")
        writes.push(r.headers()["x-confirm-network"] ?? "none");
    });

    const confirmHeading = page.getByRole("heading", {
      name: "Confirm a mainnet transaction",
    });
    await page.getByRole("button", { name: "Suspend" }).first().click();
    const suspendDialog = page.getByRole("dialog", {
      name: /Suspend this investor/,
    });
    await suspendDialog.getByRole("button", { name: "Suspend" }).click();
    await expect(confirmHeading).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(confirmHeading).toHaveCount(0);
    expect(writes).toEqual([]);

    // still in the suspend dialog: try again and confirm for real
    await suspendDialog.getByRole("button", { name: "Suspend" }).click();
    await expect(confirmHeading).toBeVisible();
    const sign = page.getByRole("button", { name: "Sign on mainnet" });
    await page.getByLabel(/Type “mainnet”/).fill("devnet");
    await expect(sign).toBeDisabled();
    await page.getByLabel(/Type “mainnet”/).fill("mainnet");
    await sign.click();
    await expect(page.getByText("Investor suspended")).toBeVisible({
      timeout: 15_000,
    });
    expect(writes).toEqual(["mainnet-beta"]);
  });
});

test("admin network page shows readiness and the mainnet checklist", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "admin", baseURL);
  await page.goto("/admin/network");
  await expect(page.getByRole("heading", { name: "Network" })).toBeVisible();
  await expect(page.locator("[data-check=program_deployed]")).toHaveAttribute(
    "data-ok",
    "true",
  );
  await expect(
    page.getByRole("heading", { name: "Mainnet launch checklist" }),
  ).toBeVisible();
  await expect(page.getByText("ops/deploy-mainnet.sh")).toBeVisible();
});
