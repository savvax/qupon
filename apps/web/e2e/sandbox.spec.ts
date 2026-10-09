import { expect, type Page, test } from "@playwright/test";
import { injectWallets } from "./wallets";

/**
 * Task 1532, the judge sandbox on the mock registrar (src/mocks/features/sandbox.ts): the landing CTA creates a
 * sandbox and lands on it; every state of the bond (frozen fixtures `fx-<state>`) has its Now bar, coupon sheet,
 * register and money; every transaction links to the devnet explorer; the four scenarios, the role lens, "Use my
 * wallet", the expired and throttled pages; phones never scroll sideways.
 */
test.use({ reducedMotion: "reduce" });

const nowBar = (page: Page) => page.getByRole("region", { name: "Now", exact: true });
const rail = (page: Page) => page.getByRole("region", { name: "Life of the bond" });
const scenario = (page: Page, kind: string) => page.locator(`[data-scenario="${kind}"]`);
const EXPLORER = /^https:\/\/explorer\.solana\.com\/tx\/[1-9A-HJ-NP-Za-km-z]{80,90}\?cluster=devnet$/;

test.beforeEach(async ({ page }) => {
  // the tour has its own test (guidance.spec.ts); here it would cover the feed
  await page.addInitScript(() => {
    try {
      localStorage.setItem("qupon.tour.sandbox", "done");
    } catch {}
  });
});

// every state of the bond's life → what the Now bar says
const STATES: [string, RegExp][] = [
  ["issued", /SBX-\w{6} is placed: 100 bonds with 3 investors/],
  ["announced", /Coupon 1 is announced/],
  ["snapshot", /Record date passed: 2 of 3 holders snapshotted/],
  ["funding", /Snapshot final: 3 holders, Σ 100 bonds = supply\. The issuer funds 5,000\.00 ₸ now/],
  ["funded", /The escrow holds 5,000\.00 ₸\. Anyone can push the payout to 3 holders/],
  ["paying", /Paying: 2 of 3 holders paid/],
  ["bank", /Nomad Pension chose the bank route: 2,762\.50 ₸ is with the paying agent/],
  ["paid", /Coupon 1 paid: 4,512\.50 ₸ to 3 holders and 487\.50 ₸ to the tax vault/],
  ["skipped", /Funding skipped: the escrow holds 0 of 5,000\.00 ₸/],
  ["defaulted", /Coupon 1 is in default: 5,000\.00 ₸ short/],
  ["cured", /Coupon 1 paid: 4,512\.50 ₸/],
  ["maturity", /Paying: 2 of 3 holders paid/],
  ["redeemed", /Redeemed: .*The series is closed/],
  ["wallet", /Your 250\.00 ₸ is ready/],
];

test("every state of the bond has its Now bar, coupon sheet and register", async ({ page }) => {
  test.setTimeout(180_000);
  for (const [state, title] of STATES) {
    await page.goto(`/sandbox/fx-${state}`);
    await expect(nowBar(page).locator("p").first(), state).toContainText(title);
    await expect(page.getByRole("heading", { level: 1 }), state).toContainText(/SBX-\w{6}: your own bond/);
  }
  // the loud states and their evidence
  await page.goto("/sandbox/fx-defaulted");
  await expect(nowBar(page)).toHaveClass(/bg-err-bg/);
  await expect(rail(page)).toContainText("Defaulted");
  await expect(page.getByText("Unpaid: in default").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Fund 5,000.00 ₸ and cure" })).toBeVisible();
  await page.goto("/sandbox/fx-cured");
  await expect(rail(page)).toContainText("Cured");
  await page.goto("/sandbox/fx-snapshot");
  await expect(page.getByText("Waiting for the snapshot").first()).toBeVisible();
  await page.goto("/sandbox/fx-redeemed");
  await expect(page.getByText("Paid, bonds burned").first()).toBeVisible();
  await expect(scenario(page, "dvp_trade").getByRole("button", { name: "Trade 5 bonds" })).toBeDisabled();
});

test("money: the payout bands, the bank leg simulated, every transaction on the explorer", async ({ page }) => {
  await page.goto("/sandbox/fx-bank");
  const money = page.getByRole("region", { name: "Where the money of Coupon 1 goes" });
  await expect(money).toContainText("Paying agent");
  await expect(money).toContainText("Simulated");
  await expect(page.getByText("With the paying agent").first()).toBeVisible();
  const feed = page.getByRole("region", { name: "Transactions" });
  const links = feed.locator("a[href^='https://explorer.solana.com/tx/']");
  expect(await links.count()).toBeGreaterThanOrEqual(10);
  for (const href of await links.evaluateAll((as) => as.map((a) => a.getAttribute("href"))))
    expect(href).toMatch(EXPLORER);
  // the steps carry their transactions too
  const flow = page.locator("[data-tour=steps]");
  expect(await flow.locator("a[href*='explorer.solana.com/tx/']").count()).toBeGreaterThanOrEqual(5);
});

test("the landing CTA creates a sandbox, and the visitor gets the same one back", async ({ page }) => {
  await page.goto("/");
  await page.locator("main").getByRole("link", { name: "Try it in 3 minutes" }).click();
  await expect(page).toHaveURL(/\/sandbox\/[a-z0-9]{8}$/, { timeout: 30_000 });
  const url = page.url();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/SBX-\w{6}/);
  await expect(page.getByText("Bond calendar")).toBeVisible();
  await page.goto("/sandbox/new");
  await expect(page).toHaveURL(url);
  // the old shared link now gives everyone their own bond
  await page.goto("/sandbox/demo");
  await expect(page).toHaveURL(url);
});

test("scenarios on a live sandbox: trade with accrued, a refused non-KYC transfer, skipped funding", async ({ page }) => {
  await page.goto("/sandbox/new?fresh=1");
  await expect(page).toHaveURL(/\/sandbox\/[a-z0-9]{8}$/, { timeout: 30_000 });
  await expect(scenario(page, "cure").getByRole("button", { name: "Fund and cure" })).toBeDisabled();

  await scenario(page, "dvp_trade").getByRole("button", { name: "Trade 5 bonds" }).click();
  const traded = scenario(page, "dvp_trade").getByRole("status");
  await expect(traded).toContainText(/Settled: 5 bonds for [\d,.]+ ₸ = 5,000\.00 clean \+ [\d,.-]+ accrued/);
  expect(await traded.locator("a").first().getAttribute("href")).toMatch(EXPLORER);

  await scenario(page, "non_kyc_transfer").getByRole("button", { name: "Try the transfer" }).click();
  await expect(scenario(page, "non_kyc_transfer").getByRole("status")).toContainText("Refused (AccountFrozen)");
  await expect(page.getByRole("region", { name: "Transactions" })).toContainText("Transfer to a wallet without KYC refused");

  await scenario(page, "skip_funding").getByRole("button", { name: "Skip funding" }).click();
  await expect(scenario(page, "skip_funding").getByRole("status")).toContainText("Armed");
  await expect(scenario(page, "skip_funding").getByRole("button", { name: "Skip funding" })).toBeDisabled();
});

test("cure: the issuer funds the shortfall late and the coupon is paid", async ({ page }) => {
  await page.goto(`/sandbox/fx-defaulted-e2e${Date.now()}`);
  await nowBar(page).getByRole("button", { name: "Fund 5,000.00 ₸ and cure" }).click();
  await expect(scenario(page, "cure").getByRole("status")).toContainText("DefaultCured on-chain");
  await expect(rail(page)).toContainText("Cured", { timeout: 20_000 });
});

test("the role lens: anyone, issuer, registrar, investor", async ({ page }) => {
  await page.goto("/sandbox/fx-bank");
  const lens = page.locator("[data-tour=roles]");
  await expect(lens).toContainText("Anyone can push");
  await lens.getByRole("button", { name: "Issuer", exact: true }).click();
  await expect(lens).toContainText("Coupon 1 to fund");
  await expect(lens).toContainText("Funded in full.");
  await lens.getByRole("button", { name: "Registrar", exact: true }).click();
  await expect(lens).toContainText("Bank payouts to confirm");
  await expect(lens).toContainText("Nomad Pension");
  await lens.getByRole("button", { name: "Investor", exact: true }).click();
  await lens.getByRole("button", { name: "Nomad Pension" }).click();
  await expect(lens).toContainText(/Tax withheld\s*487\.50/);
  await expect(lens).toContainText("With the paying agent");
});

test("use my wallet: a new sandbox with the wallet as a fourth holder that can claim", async ({ page }) => {
  await injectWallets(page, ["Phantom"]);
  await page.goto("/sandbox/fx-funded");
  const lens = page.locator("[data-tour=roles]");
  await lens.getByRole("button", { name: "Investor", exact: true }).click();
  await lens.getByRole("button", { name: "Use my wallet" }).click();
  await expect(page).toHaveURL(/\/sandbox\/[a-z0-9]{8}$/, { timeout: 30_000 });
  await page.locator("[data-tour=roles]").getByRole("button", { name: "Investor", exact: true }).click();
  await expect(page.locator("[data-tour=roles]").getByRole("button", { name: "Your wallet" })).toBeVisible();
  // a wallet holder's coupon waits for its own Claim (fixture: the visitor's 5 bonds)
  await page.goto("/sandbox/fx-wallet");
  await expect(nowBar(page)).toContainText("Your 250.00 ₸ is ready");
  await expect(page.getByText("Claimable").first()).toBeVisible();
});

test("an ended sandbox and the per-visitor limit explain themselves", async ({ page }) => {
  await page.goto("/sandbox/fx-nothing-here");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This sandbox has ended");
  await page.addInitScript(() => sessionStorage.setItem("qupon.sandbox.request", "throttle-e2e"));
  await page.goto("/sandbox/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sandbox limit reached");
});

for (const loc of ["ru", "kk"] as const)
  test(`phone, ${loc}: no sideways scroll, the Now bar docks, no console errors`, async ({ page, baseURL }) => {
    const errors: string[] = [];
    // Next 15 dev only: its segment-explorer node (SegmentTrieNode) sometimes shifts every useId under the page, so
    // React reports a mismatch whose diff is nothing but GlossaryTerm ids; any other difference still fails
    const idOnly = (text: string) =>
      text.includes("hydration-mismatch") &&
      text.split("\n").filter((l) => /^[+-]\s{2,}\S/.test(l)).every((l) => l.includes("qp-g"));
    page.on("console", (m) => {
      const text = m.text();
      if (m.type() === "error" && !text.includes("Failed to load resource") && !idOnly(text)) errors.push(text);
    });
    await page.context().addCookies([{ name: "NEXT_LOCALE", value: loc, url: baseURL ?? "" }]);
    await page.setViewportSize({ width: 390, height: 844 });
    for (const state of ["bank", "defaulted", "snapshot", "redeemed"]) {
      await page.goto(`/sandbox/fx-${state}`, { waitUntil: "networkidle" });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${state} ${loc}`).toBeLessThanOrEqual(0);
      await expect(page.locator("[data-nowbar=page]")).toHaveCSS("position", "fixed");
    }
    expect(errors).toEqual([]);
  });
