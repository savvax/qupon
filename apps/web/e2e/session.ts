import type { Page } from "@playwright/test";

/**
 * Mock-mode session without the login UI: `issuer` | `registrar` | `investor` (demo identities) or the
 * mock-only accounts `admin` and `member` (a self-registered investor). See mockUser in src/lib/session.ts.
 */
export async function signInAs(
  page: Page,
  who: "issuer" | "registrar" | "investor" | "admin" | "member",
  baseURL: string | undefined,
) {
  await page.context().addCookies([
    {
      name: "qupon_session",
      value: `mock:${who}`,
      url: baseURL ?? "http://localhost:3000",
    },
  ]);
}
