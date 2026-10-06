import Link from "next/link";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { listPublicSeries } from "@/lib/api";
import { boFetch } from "@/lib/bo";
import { type KycApplication, formatBytes, pct } from "@/lib/kyc";
import { KycDecision } from "./KycDecision";

export async function generateMetadata() {
  const t = await getTranslations("kyc.registrar");
  return { title: `${t("detailTitle")} · Qupon` };
}

/** One KYC application: applicant, documents, requested series, decision (spec §5.3, review SIMULATED). */
export default async function KycApplicationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const t = await getTranslations("kyc.registrar");
  const locale = (await getLocale()) === "ru" ? "ru" : "en";
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [res, series] = await Promise.all([
    boFetch<{ application: KycApplication }>(`/registrar/kyc/${id}`).catch(
      () => null,
    ),
    listPublicSeries().catch(() => []),
  ]);
  if (!res) notFound();
  const a = res.application;
  const ticker = (mint: string) =>
    series.find((s) => s.mint === mint)?.ticker ??
    `${mint.slice(0, 4)}…${mint.slice(-4)}`;

  return (
    <div className="space-y-6">
      <nav className="text-sm text-n500">
        <Link
          href="/registrar/kyc"
          className="font-semibold text-g700 hover:underline"
        >
          {t("title")}
        </Link>{" "}
        / #{a.id}
      </nav>
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-extrabold tracking-tight">{a.fullName}</h1>
        <Badge
          tone={
            a.status === "approved"
              ? "success"
              : a.status === "rejected"
                ? "danger"
                : "warn"
          }
        >
          {t(`states.${a.status}`)}
        </Badge>
      </header>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-bold">{t("applicant")}</h2>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <Field label={t("email")}>{a.userEmail}</Field>
              <Field label={t("col.wallet")}>
                <Address value={a.wallet} />
              </Field>
              <Field label={t("type")}>{t(`types.${a.investorType}`)}</Field>
              <Field label={t("residency")}>
                {t(`residencies.${a.residency}`)}
              </Field>
              <Field label={t("tax")}>{pct(a.taxBps, locale)}</Field>
              <Field label={t("col.submitted")}>
                {new Date(a.createdAt * 1000).toLocaleString(locale)}
              </Field>
            </dl>
          </Card>
          <Card>
            <h2 className="text-lg font-bold">{t("documents")}</h2>
            {(a.documents ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-n500">{t("noDocuments")}</p>
            ) : (
              <ul className="mt-3 divide-y divide-n100 rounded-card border border-n200">
                {(a.documents ?? []).map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm"
                  >
                    <Badge tone="neutral">
                      {t(
                        `docKinds.${d.kind === "proof_of_address" ? "proof_of_address" : "id_document"}`,
                      )}
                    </Badge>
                    <a
                      href={`/api/bo-get/documents/${d.id}`}
                      className="min-w-0 flex-1 truncate font-semibold text-g700 hover:underline"
                    >
                      {d.filename}
                    </a>
                    <span className="text-xs text-n500">
                      {formatBytes(d.size)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-bold">{t("seriesTitle")}</h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {a.seriesMints.map((m) => (
                <li key={m}>
                  <Badge tone="neutral">{ticker(m)}</Badge>
                </li>
              ))}
            </ul>
          </Card>
          <KycDecision
            application={a}
            tickers={Object.fromEntries(
              a.seriesMints.map((m) => [m, ticker(m)]),
            )}
          />
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold text-n500">{label}</dt>
      <dd className="mt-0.5 break-words">{children}</dd>
    </div>
  );
}
