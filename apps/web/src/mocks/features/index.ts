import { handlers as account } from "./account";
import { handlers as admin } from "./admin";
import { handlers as adminSeries } from "./adminSeries";
import { handlers as assets } from "./assets";
import { handlers as kase } from "./kase";
import { handlers as kaseMarket } from "./kaseMarket";
import { handlers as kyc } from "./kyc";
import { handlers as network } from "./network";
import { handlers as notify } from "./notify";
import { handlers as onboarding } from "./onboarding";
import { handlers as org } from "./org";
import { handlers as reports } from "./reports";
import { handlers as termsheet } from "./termsheet";
import { handlers as trades } from "./trades";
import type { MockHandler } from "./types";

const ALL: MockHandler[] = [
  ...network,
  // series settings + audit (task 704) before the overview fixtures (705): its /admin/series also handles PATCH
  ...adminSeries,
  ...admin,
  ...account,
  ...onboarding,
  ...kyc,
  ...notify,
  ...org,
  ...reports,
  ...kase,
  ...kaseMarket,
  ...assets,
  ...trades,
  ...termsheet,
];

/** First feature handler matching method + path ("/admin/users?q=x"), or undefined → the legacy fixtures. */
export function featureMock(
  method: MockHandler["method"],
  pathWithQuery: string,
  body?: unknown,
): { value: unknown } | undefined {
  const url = new URL(pathWithQuery, "http://mock");
  for (const h of ALL) {
    if (h.method !== method) continue;
    const m = h.path.exec(url.pathname);
    if (m) return { value: h.reply(m, body, url.searchParams) };
  }
  return undefined;
}
