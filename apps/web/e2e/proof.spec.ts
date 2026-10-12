import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { rpcKey } from "../src/lib/proof/rpcKey";

/**
 * /proof/[mint] on mocked RPC: the browser's devnet requests are answered from recorded devnet responses
 * (e2e/fixtures/proof-rpc.json, see src/lib/proof/chain.test.ts), so the verifier runs on real chain data offline.
 * PROOF_SHOTS=1 also writes the review screenshots to reports/design/1536/.
 */
test.use({ reducedMotion: "reduce" });

const PLAN15 = "7MBQ7yA7CBgktQZ5k9GCwHPcWtMANUhJgQHCRrXzC35F";
const LEGACY = "E4EHdADP27wBY82ZxyNZPXcH6Rb1jPLQyuociampkFuD";
const RECORDED = JSON.parse(
  readFileSync(path.join(__dirname, "fixtures/proof-rpc.json"), "utf8"),
) as Record<string, unknown>;

async function mockRpc(page: Page, map = RECORDED) {
  await page.route(
    (url) => url.host === "api.devnet.solana.com",
    async (route) => {
      const req = JSON.parse(route.request().postData() ?? "{}") as {
        id: string;
        method: string;
        params?: unknown;
      };
      const k = rpcKey(req.method, req.params);
      await route.fulfill({
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(
          k in map
            ? { jsonrpc: "2.0", id: req.id, result: map[k] }
            : {
                jsonrpc: "2.0",
                id: req.id,
                error: { code: -32601, message: `not recorded: ${req.method}` },
              },
        ),
      });
    },
  );
}

test("plan-15 series: every check passes, every transaction links to the explorer", async ({
  page,
  baseURL,
}) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await mockRpc(page);
  await page
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await page.goto(`/proof/${PLAN15}`);
  const verdict = page.getByTestId("proof-verdict");
  await expect(verdict).toHaveText("All checks pass", { timeout: 30_000 });

  await expect(page.locator('[data-status="fail"]')).toHaveCount(0);
  const actions = page.getByTestId("proof-action");
  await expect(actions).toHaveCount(2);
  const coupon = actions.first();
  for (const id of [
    "entitlements",
    "supply",
    "hash",
    "totals",
    "funded",
    "payouts",
    "default",
    "bank",
    "disclosure",
  ])
    await expect(coupon.locator(`[data-check="${id}"]`)).toHaveAttribute(
      "data-status",
      "pass",
    );
  // the brief's numbers, recomputed: 65 / 25 / 10 bonds → 3,250.00 / 1,250.00 / 500.00 ₸
  // (NBSP before ₸: the one number–sign spacing rule, same as the board's Amount — A91567-7)
  await expect(
    coupon.locator("td", { hasText: /3,250\.00\u00a0₸/ }).first(),
  ).toBeVisible();
  await expect(coupon.getByText("Simulated").first()).toBeVisible(); // the bank leg is labelled

  const txLinks = page.locator('a[href^="https://explorer.solana.com/tx/"]');
  const hrefs = await txLinks.evaluateAll((as) =>
    as.map((a) => a.getAttribute("href") ?? ""),
  );
  expect(hrefs.length).toBeGreaterThanOrEqual(17);
  for (const h of hrefs)
    expect(h).toMatch(
      /^https:\/\/explorer\.solana\.com\/tx\/[1-9A-HJ-NP-Za-km-z]{64,88}\?cluster=devnet$/,
    );

  await expect(
    page.getByRole("heading", { name: "What is real, what is simulated" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("legacy series: the owner-ordered rolling hash (scheme 0) verifies", async ({
  page,
  baseURL,
}) => {
  await mockRpc(page);
  await page
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await page.goto(`/proof/${LEGACY}`);
  await expect(page.getByTestId("proof-verdict")).toHaveText(
    "All checks pass",
    { timeout: 30_000 },
  );
  await expect(
    page.getByText("owner-ordered rolling hash").first(),
  ).toBeVisible();
});

test("a tampered entitlement is caught", async ({ page, baseURL }) => {
  // Add one minor unit to the first entitlement's net (Entitlement: 8 disc + 1 bump + 32 action + 32 owner +
  // units, gross, tax → net at byte 97) in the recorded getProgramAccounts answer.
  const map = structuredClone(RECORDED);
  const key = Object.keys(map).find(
    (k) => k.startsWith("getProgramAccounts") && k.includes('"offset":0'),
  )!;
  const rows = map[key] as { account: { data: [string, string] } }[];
  const bytes = Buffer.from(rows[0]!.account.data[0], "base64");
  bytes.writeBigUInt64LE(bytes.readBigUInt64LE(97) + 1n, 97);
  rows[0]!.account.data[0] = bytes.toString("base64");
  await mockRpc(page, map);
  await page
    .context()
    .addCookies([{ name: "NEXT_LOCALE", value: "en", url: baseURL! }]);
  await page.goto(`/proof/${PLAN15}`);
  await expect(page.getByTestId("proof-verdict")).toHaveText(/checks? failed/, {
    timeout: 30_000,
  });
  await expect(
    page.locator('[data-check="entitlements"][data-status="fail"]'),
  ).toHaveCount(1);
  await expect(page.locator("td", { hasText: "Differs" })).toHaveCount(1);
});

for (const locale of ["en", "ru", "kk"])
  for (const width of [1440, 390])
    test(`renders in ${locale} at ${width} px without sideways scroll`, async ({
      page,
      baseURL,
    }) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await mockRpc(page);
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
      await page
        .context()
        .addCookies([{ name: "NEXT_LOCALE", value: locale, url: baseURL! }]);
      await page.goto(`/proof/${PLAN15}`);
      await expect(page.getByTestId("proof-verdict")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator('[data-status="pass"]').first()).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
      expect(errors).toEqual([]);
      if (process.env.PROOF_SHOTS)
        await page.screenshot({
          path: path.join(
            __dirname,
            `../../../reports/design/1536/proof-${locale}-${width}.png`,
          ),
          fullPage: true,
        });
    });
