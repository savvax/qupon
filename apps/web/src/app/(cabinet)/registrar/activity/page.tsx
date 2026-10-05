import { getTranslations } from "next-intl/server";
import { listActivity, listSeries } from "@/lib/api";
import { boFetch } from "@/lib/bo";
import { ActivityTabs, type AuditItem } from "../_components/ActivityTabs";
import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("registrarActivity") };
}

/** Registrar activity: on-chain events + the operator audit trail (Plan 3 Task 5). */
export default async function RegistrarActivityPage() {
  const t = await getTranslations("registrar.activity");
  // The on-chain feed is evidence, not a dependency (listActivity degrades to []).
  const [raw, series] = await Promise.all([
    listActivity(200),
    listSeries().catch(() => []),
  ]);
  const events = [...raw].sort((x, y) => y.ts - x.ts || y.id - x.id);
  const tickers = Object.fromEntries(series.map((x) => [x.mint, x.ticker]));
  let audit: AuditItem[] = [];
  let auditDown = false;
  try {
    audit =
      (await boFetch<{ items: AuditItem[] }>("/registrar/audit?limit=200"))
        .items ?? [];
  } catch {
    auditDown = true; // session/role gates are enforced by the layout; show a notice
  }
  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-6 text-sm text-n600">{t("lead")}</p>
      {auditDown && (
        <p className="mb-4 rounded-card border border-warn-bd bg-warn-bg px-4 py-2 text-sm text-warn-fg">
          {t("unreachable")}
        </p>
      )}
      <ActivityTabs events={events} audit={audit} tickers={tickers} />
    </div>
  );
}
