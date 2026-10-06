import { getTranslations } from "next-intl/server";
import { listSeries, type Schemas } from "@/lib/api";
import { boFetch } from "@/lib/bo";
import { Approvals } from "../_components/Approvals";
import { metaTitle } from "@/lib/meta";

export async function generateMetadata() {
  return { title: await metaTitle("registrarAutopilot") };
}

type Approval = Schemas["Approval"];

const fetchApprovals = async (status: "pending" | "executed") =>
  (await boFetch<{ approvals: Approval[] }>(`/approvals?status=${status}`))
    .approvals ?? [];

/** Autopilot approvals: the scheduler's pending queue and what it already ran (Plan 3 Task 5). */
export default async function RegistrarAutopilotPage() {
  const t = await getTranslations("registrar.autopilot");
  // Public read; degrade to empty lists when the scheduler surface is absent.
  const [pending, executed, series] = await Promise.all([
    fetchApprovals("pending").catch(() => [] as Approval[]),
    fetchApprovals("executed").catch(() => [] as Approval[]),
    listSeries().catch(() => []),
  ]);
  const tickers = Object.fromEntries(series.map((s) => [s.mint, s.ticker]));
  return (
    <div className="mx-auto max-w-[1200px]">
      <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
      <p className="mt-1 mb-6 text-sm text-n600">{t("lead")}</p>
      <Approvals pending={pending} executed={executed} tickers={tickers} />
    </div>
  );
}
