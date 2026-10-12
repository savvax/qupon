import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Task 91587, the sandbox replay on a small recorded fixture (e2e/fixtures/sandbox-replay.json, served for
 * /replay/sandbox.json via page.route): the banner says REPLAY, the recorded run plays to "Coupon 1 paid" with
 * the recorded scenario results and no action buttons, and the page never calls the registrar API or any
 * Solana RPC — the whole point of the replay is that it needs neither at view time.
 */
test.use({ reducedMotion: "reduce" });

const fixture = readFileSync(
  path.join(__dirname, "fixtures/sandbox-replay.json"),
  "utf8",
);
const nowBar = (page: Page) =>
  page.getByRole("region", { name: "Now", exact: true });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("qupon.tour.sandbox", "done");
    } catch {
      /* best effort: the flag only dismisses the guided tour */
    }
  });
  await page.route("**/replay/sandbox.json", (route) =>
    route.fulfill({ contentType: "application/json", body: fixture }),
  );
});

test("replay: banner, plays at ×2 to Coupon 1 paid, recorded scenarios, read-only", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (r) => requests.push(r.url()));

  await page.goto("/sandbox/replay");
  await expect(page.locator("[data-tour=replay-banner]")).toContainText(
    /REPLAY — a real devnet run recorded .+ Solana Explorer/,
  );
  await expect(
    page.getByRole("link", { name: "Run your own live" }),
  ).toHaveAttribute("href", "/sandbox/new");

  // it starts at the issue, then the recording plays by itself
  await expect(nowBar(page).locator("p").first()).toContainText(
    /SBX-\w{6} is placed: 100 bonds with 3 investors/,
  );

  // ×2: the six-second fixture is over in three
  await page.getByRole("button", { name: "×1", exact: true }).click();
  await expect(nowBar(page).locator("p").first()).toContainText(
    /Coupon 1 paid: 4,512\.50 ₸ to 3 holders and 487\.50 ₸ to the tax vault/,
    { timeout: 20_000 },
  );

  // the recorded scenario results appear read-only: no button anywhere in the cards
  const trade = page.locator("[data-scenario=dvp_trade]");
  await expect(trade.getByRole("status")).toContainText(
    /Settled: 5 bonds for [\d,.]+ ₸ = 5,000\.00 clean \+ [\d,.-]+ accrued/,
  );
  expect(
    await trade
      .locator("a[href^='https://explorer.solana.com/tx/']")
      .first()
      .getAttribute("href"),
  ).toMatch(
    /^https:\/\/explorer\.solana\.com\/tx\/[1-9A-HJ-NP-Za-km-z]{80,90}\?cluster=devnet$/,
  );
  await expect(
    page.locator("[data-scenario=non_kyc_transfer]").getByRole("status"),
  ).toContainText("Refused (AccountFrozen)");
  // the glossary chips stay (they explain the terms); the four run buttons are gone
  for (const name of [
    "Skip funding",
    "Fund and cure",
    "Try the transfer",
    "Trade 5 bonds",
  ])
    expect(
      await page
        .locator("[data-scenario]")
        .getByRole("button", { name })
        .count(),
      name,
    ).toBe(0);
  // the claim button of a live run has no place in a recording either
  expect(await page.getByRole("button", { name: /Claim / }).count()).toBe(0);

  // the one thing the page may talk to is itself: no registrar proxy, no session, no Solana RPC
  const offlimits = requests.filter(
    (u) =>
      /\/api\/(bo|bo-get|bo-upload|session)\//.test(u) ||
      /api\.devnet\.solana\.com|solana-rpc|\/rpc$/.test(u),
  );
  expect(offlimits).toEqual([]);
});

test("replay not recorded yet: the localized state offers the live sandbox", async ({
  page,
}) => {
  await page.route("**/replay/sandbox.json", (route) =>
    route.fulfill({ status: 404, body: "not found" }),
  );
  await page.goto("/sandbox/replay");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "No replay recorded yet",
  );
  await expect(
    page.getByRole("link", { name: "Run your own live" }),
  ).toHaveAttribute("href", "/sandbox/new");
});
