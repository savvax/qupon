import { expect, test, type Page } from "@playwright/test";
import { signInAs } from "./session";

/**
 * Secondary trades (plan 13) against the mock registrar API: the registrar creates and settles trades, an open
 * trade blocks the record date on the action page (with the way to clear it), and the investor sees their leg.
 * Mock fixtures (src/mocks/features/trades.ts): QPNb1 holders 10 / 25 / 65, face 1,000 KZT — a ready trade of
 * 5 bonds at par (5,000.00) and one of 10 bonds still awaiting funding.
 */
const BTRK = "BTRKDeM0BondMint1111111111111111111111111111";
const ANNOUNCED = "ActnINTR0003Dem0PDA111111111111111111111111111"; // BTRKdemo coupon, status Announced

const rows = (page: Page) => page.locator("tbody tr");

async function createTrade(page: Page) {
  // a click before hydration is lost: retry until the dialog is really open
  await expect(async () => {
    await page.getByRole("button", { name: "New trade" }).click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
  }).toPass();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Bonds").fill("5");
  return dialog;
}

test("registrar creates a trade at par, sees it, and settles the ready one", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "registrar", baseURL);
  await page.goto("/registrar");
  await page.getByRole("link", { name: "Trades" }).first().click();
  await expect(page).toHaveURL(/\/registrar\/trades/);
  await expect(page.getByRole("heading", { name: "Trades" })).toBeVisible();
  // The fixture trades live on QPNb1; the showcase series (task 1535) are also pickable
  // and the first of them is selected by default. Radix select: a click before hydration is
  // lost — retry until picking QPNb1 really navigates with its mint.
  await expect(async () => {
    await page.getByRole("combobox", { name: "Series" }).click();
    await page.getByRole("option", { name: "QPNb1" }).click();
    await expect(page).toHaveURL(/mint=QpNb1Dem0BondMint/, {
      timeout: 2_000,
    });
  }).toPass({ timeout: 20_000 });
  // implemented flow, with its scope stated
  await expect(
    page.getByRole("link", {
      name: "Settled atomically by the Solana DvP program",
    }),
  ).toHaveAttribute(
    "href",
    "https://explorer.solana.com/address/dvp34bdbcEm4f4FCUjGV4mDAkDshaQR4LkK8fdcsyZq?cluster=devnet",
  );
  await expect(
    page.getByText(/Order matching.*not part of Qupon/),
  ).toBeVisible();
  await expect(page.getByText("SIMULATED")).toHaveCount(0);

  const before = await rows(page).count();
  expect(before).toBeGreaterThanOrEqual(2);
  await expect(page.getByText("Awaiting funding").first()).toBeVisible();

  // 5 bonds × 1,000.00 = 5,000.00 shown before anything is sent
  const dialog = await createTrade(page);
  await expect(dialog.getByText("5,000.00").first()).toBeVisible();
  await dialog.getByRole("button", { name: "Create trade" }).click();
  await expect(page.getByText("Trade created")).toBeVisible({
    timeout: 15_000,
  });
  await expect(rows(page)).toHaveCount(before + 1);

  // the ready trade settles; the toast links its transaction
  const ready = rows(page).filter({ hasText: "Ready to settle" }).first();
  await ready.getByRole("button", { name: "Settle" }).click();
  const toast = page
    .getByText("Trade settled: bonds and cash moved in one transaction")
    .locator("xpath=ancestor::*[.//a[contains(@href,'/tx/')]][1]");
  await expect(toast.locator("a[href*='explorer.solana.com/tx/']")).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(rows(page).filter({ hasText: "Closed" }).first()).toBeVisible();

  // a trade that is not funded cannot be settled; demo funding of both legs makes it ready
  const waiting = rows(page).filter({ hasText: "Awaiting funding" }).first();
  await expect(waiting.getByRole("button", { name: "Settle" })).toBeDisabled();
  const readyBefore = await rows(page)
    .filter({ hasText: "Ready to settle" })
    .count();
  await waiting.getByRole("button", { name: "Fund both legs (demo)" }).click();
  await expect(page.getByText("Cash leg funded")).toBeVisible({
    timeout: 15_000,
  });
  await expect(rows(page).filter({ hasText: "Ready to settle" })).toHaveCount(
    readyBefore + 1,
  );
});

test("an open trade blocks the record date; the action page links Trades, cancelling clears it", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "registrar", baseURL);
  await page.goto(`/registrar/actions/${ANNOUNCED}`);
  await expect(
    page.getByRole("button", { name: "Strike record date" }),
  ).toBeVisible();

  await page.goto(`/registrar/trades?mint=${BTRK}`);
  const dialog = await createTrade(page);
  await dialog.getByRole("button", { name: "Create trade" }).click();
  await expect(page.getByText("Trade created")).toBeVisible({
    timeout: 15_000,
  });
  try {
    await page.goto(`/registrar/actions/${ANNOUNCED}`);
    await expect(
      page.getByText("Open secondary trades: settle or cancel them first (1)"),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Strike record date" }),
    ).toHaveCount(0);
    await page.getByRole("link", { name: "Go to Trades" }).click();
    await expect(page).toHaveURL(
      new RegExp(`/registrar/trades\\?mint=${BTRK}`),
    );
  } finally {
    // the mock is shared by the whole run: always clear the trade so other specs still see the strike button
    await page.goto(`/registrar/trades?mint=${BTRK}`);
    const open = rows(page).filter({ hasText: "Awaiting funding" }).first();
    await expect(async () => {
      await open
        .getByRole("button", { name: "Return bonds to seller" })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible({ timeout: 1000 });
    }).toPass();
    await expect(
      page.getByText(/the buyer takes the cash back themselves/),
    ).toBeVisible();
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Return bonds to seller" })
      .click();
    await expect(page.getByText(/Trade released/)).toBeVisible({
      timeout: 15_000,
    });
  }
  await page.goto(`/registrar/actions/${ANNOUNCED}`);
  await expect(
    page.getByRole("button", { name: "Strike record date" }),
  ).toBeVisible();
});

test("the demo investor sees their open trade with the funding button", async ({
  page,
}) => {
  await page.goto("/investor");
  await page.getByRole("button", { name: "Try the demo investor" }).click();
  await expect(
    page.getByRole("heading", { name: "Open trades" }),
  ).toBeVisible();
  // investor3 (65 bonds) sells 10 at par: 10 × 1,000.00 = 10,000.00
  await expect(page.getByText(/You sell 10 bonds for/)).toBeVisible();
  await expect(page.getByText("10,000.00").first()).toBeVisible();
  await page.getByRole("button", { name: "Deliver 10 bonds" }).click();
  await expect(page.getByText("Your leg is in escrow").first()).toBeVisible({
    timeout: 15_000,
  });
});

test("RU: the trades page renders without raw keys", async ({
  page,
  baseURL,
}) => {
  await signInAs(page, "registrar", baseURL);
  await page
    .context()
    .addCookies([
      { name: "NEXT_LOCALE", value: "ru", url: baseURL ?? "http://localhost" },
    ]);
  await page.goto("/registrar/trades");
  await expect(page.getByRole("heading", { name: "Сделки" })).toBeVisible();
  await expect(
    page.getByText("Расчёты проходят атомарно через программу Solana DvP"),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("trades.");
});
