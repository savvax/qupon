import { expect, test } from "@playwright/test";
import { ADDRESSES, injectWallets } from "./wallets";

const header = (page: import("@playwright/test").Page) =>
  page.locator("header").first();

test("no wallet installed: install links, mobile deep links and a read-only view by address", async ({
  page,
}) => {
  await page.goto("/investor");
  await expect(
    page.getByText(/No Solana wallet found in this browser/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet" }).last().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "No Solana wallet in this browser" }),
  ).toBeVisible();
  for (const w of ["Phantom", "Solflare", "Backpack"])
    await expect(
      dialog.getByRole("link", { name: new RegExp(w) }).first(),
    ).toBeVisible();
  await expect(
    dialog.getByRole("link", { name: "Open in Phantom" }),
  ).toHaveAttribute("href", /^https:\/\/phantom\.app\/ul\/browse\//);
  await expect(dialog.getByText(/switch your wallet to Devnet/)).toBeVisible();

  await dialog.getByLabel("Solana address").fill("not-an-address");
  await dialog.getByRole("button", { name: "View" }).click();
  await expect(dialog.getByText(/That is not a Solana address/)).toBeVisible();
  await dialog.getByLabel("Solana address").fill(ADDRESSES[0]);
  await dialog.getByRole("button", { name: "View" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Wallet (view only)" }),
  ).toBeVisible();
  await expect(page.getByText("Read-only").first()).toBeVisible();

  // the top-bar chip offers to stop viewing
  await page.getByRole("button", { name: /DL8G…aJEo/ }).click();
  await page.getByRole("menuitem", { name: "Stop viewing" }).click();
  await expect(
    page.getByText(/No Solana wallet found in this browser/),
  ).toBeVisible();
});

test("one wallet: the button names it and connects in one click", async ({
  page,
}) => {
  await injectWallets(page, ["Phantom"]);
  await page.goto("/");
  const connect = header(page).getByRole("button", { name: "Connect Phantom" });
  await expect(connect).toBeVisible();
  await connect.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    header(page).getByRole("button", { name: /DL8G…aJEo/ }),
  ).toBeVisible();
  await header(page)
    .getByRole("button", { name: /DL8G…aJEo/ })
    .click();
  await expect(page.getByText("Connected with Phantom")).toBeVisible();
  await page.getByRole("menuitem", { name: "Disconnect" }).click();
  await expect(
    header(page).getByRole("button", { name: "Connect Phantom" }),
  ).toBeVisible();
});

test("several wallets: the dialog lists the detected ones and connects the chosen one", async ({
  page,
}) => {
  await injectWallets(page, ["Phantom", "Solflare"]);
  await page.goto("/investor");
  await expect(page.getByText(/2 Solana wallets found/)).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet" }).last().click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "Connect a Solana wallet" }),
  ).toBeVisible();
  await expect(dialog.getByText("Detected in this browser")).toHaveCount(2);
  await expect(dialog.getByRole("link", { name: /Backpack/ })).toBeVisible(); // not installed → install link
  await dialog.getByRole("button", { name: /Solflare/ }).click();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Investor wallet" }),
  ).toBeVisible();
  await expect(page.getByText("7XVB…tLau").first()).toBeVisible();
});

test("a rejected connection is explained and can be retried", async ({
  page,
}) => {
  await injectWallets(page, ["Phantom", "Solflare"]);
  await page.addInitScript(() => {
    (window as unknown as { __rejectConnect: boolean }).__rejectConnect = true;
  });
  await page.goto("/investor");
  await page.getByRole("button", { name: "Connect wallet" }).last().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Phantom/ })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: /cancelled|could not connect/ }),
  ).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __rejectConnect: boolean }).__rejectConnect = false;
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Phantom/ })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("RU: the wallet dialog speaks Russian", async ({ page, baseURL }) => {
  await page.context().addCookies([
    {
      name: "NEXT_LOCALE",
      value: "ru",
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
  await page.goto("/investor");
  await page.getByRole("button", { name: "Подключить кошелёк" }).last().click();
  await expect(
    page.getByRole("heading", { name: "В этом браузере нет кошелька Solana" }),
  ).toBeVisible();
  await expect(
    page.getByText("Или посмотрите кошелёк по адресу"),
  ).toBeVisible();
});

// Extensions are invisible to the server: the first client render must match the server HTML.
for (const n of [0, 1, 2])
  test(`no hydration errors with ${n} wallets`, async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(e.message.slice(0, 120)));
    page.on("console", (m) => {
      if (m.type() === "error") errs.push(m.text().slice(0, 120));
    });
    await injectWallets(page, ["Phantom", "Solflare"].slice(0, n));
    for (const path of ["/", "/investor"]) {
      await page.goto(path, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
    }
    expect(errs).toEqual([]);
  });
