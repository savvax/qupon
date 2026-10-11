import { expect, test, type Page } from "@playwright/test";

// Live e2e for the judge sandbox (task 91543): the whole journey on the deployment — the landing CTA issues
// this browser's own devnet sandbox (the test's context is fresh, so its qupon_sandbox cookie is its own), the
// demo clock starts one coupon period in (task 91574), so coupon 1 lands ~2 minutes in and the bond year runs in ~5. No mocks anywhere.
test.skip(!process.env.E2E_BASE_URL, "live e2e: set E2E_BASE_URL");

const nowBar = (page: Page) =>
  page.getByRole("region", { name: "Now", exact: true });
const scenario = (page: Page, kind: string) =>
  page.locator(`[data-scenario="${kind}"]`);
const EXPLORER =
  /^https:\/\/explorer\.solana\.com\/tx\/[1-9A-HJ-NP-Za-km-z]{80,90}\?cluster=devnet$/;

test("@live sandbox: a judge's own bond pays coupon 1, trades with accrued, refuses a non-KYC transfer", async ({
  page,
}: {
  page: Page;
}) => {
  // create + 3 investors × (attest, register, faucet, place) + coupon 1 ≈ 2 minutes (task 91574); maturity closes at ~5.
  test.setTimeout(600_000);
  // the tour would cover the feed (same dismissal as the mock-mode spec)
  await page.addInitScript(() => {
    try {
      localStorage.setItem("qupon.tour.sandbox", "done");
    } catch {
      /* best effort: the flag only dismisses the guided tour */
    }
  });

  await page.goto("/");
  await page
    .locator("main")
    .getByRole("link", { name: "Try it in 3 minutes" })
    .click();
  // the Go service's id is 10 unambiguous lowercase chars (internal/sandbox code()); the mock's is 8.
  await expect(page).toHaveURL(/\/sandbox\/[a-z0-9]{10}$/, {
    timeout: 180_000,
  });
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    /SBX-[2-9A-HJKMNP-Z]{6}/,
  );

  // the demo clock is visible: "1 day = 1 s" on the calendar card
  const calendar = page.getByRole("region", { name: "Bond calendar" });
  await expect(calendar).toContainText(/1 day = 1 s/);
  await expect(calendar).toContainText(/Day \d+ of \d+/);

  // coupon 1: announce ~15 s after create → record → snapshot → fund → pay — ≤ 3 minutes (task 91574).
  // The page polls itself every 2 s; expect() polls the DOM until the Now bar flips to "paid".
  await expect(nowBar(page).locator("p").first()).toContainText(
    /Coupon 1 paid: [\d,]+\.\d{2} ₸ to 3 holders and [\d,]+\.\d{2} ₸ to the tax vault/,
    { timeout: 420_000 },
  );

  // every step of that coupon was a real devnet transaction
  const feed = page.getByRole("region", { name: "Transactions" });
  // the feed collapses to 6 rows (preflight #11): expand before counting (task 91564)
  const showAll = feed.getByRole("button", { name: /Show all \d+/ });
  if (await showAll.isVisible()) await showAll.click();
  const links = feed.locator("a[href^='https://explorer.solana.com/tx/']");
  expect(await links.count()).toBeGreaterThanOrEqual(8);
  for (const href of await links.evaluateAll((as) =>
    as.map((a) => a.getAttribute("href")),
  ))
    expect(href).toMatch(EXPLORER);

  // dvp_trade before maturity closes the series (4 devnet transactions server-side)
  const trade = scenario(page, "dvp_trade");
  await trade.getByRole("button", { name: "Trade 5 bonds" }).click();
  const settled = trade.getByRole("status");
  await expect(settled).toContainText(
    /Settled: 5 bonds for [\d,.]+ ₸ = [\d,.]+ clean \+ [\d,.-]+ accrued \(\d+ days, 30E\/360\)/,
    { timeout: 120_000 },
  );
  expect(await settled.locator("a").first().getAttribute("href")).toMatch(
    EXPLORER,
  );

  // non_kyc_transfer: the refusal is on-chain (sent with skipPreflight, so the failed tx has a signature)
  const refuse = scenario(page, "non_kyc_transfer");
  await refuse.getByRole("button", { name: "Try the transfer" }).click();
  const refused = refuse.getByRole("status");
  await expect(refused).toContainText(
    /Refused \(.+\): an outsider's bond account stays frozen/,
    {
      timeout: 120_000,
    },
  );
  await expect(feed).toContainText("Transfer to a wallet without KYC refused");
  expect(await refused.locator("a").first().getAttribute("href")).toMatch(
    EXPLORER,
  );
});
