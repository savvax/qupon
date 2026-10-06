import Link from "next/link";
import { formatDateTime } from "@/lib/format";
import { getLocale, getTranslations } from "next-intl/server";
import { StableLabel } from "@/components/i18n/StableLabel";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { type Column, DataTable } from "@/components/ui/DataTable";
import { boFetch } from "@/lib/bo";
import type { KycApplication } from "@/lib/kyc";
import { cx } from "@/lib/ui/cx";

const STATUSES = ["submitted", "approved", "rejected"] as const;
type Status = (typeof STATUSES)[number];

export async function generateMetadata() {
  const t = await getTranslations("kyc.registrar");
  return { title: `${t("title")} · Qupon` };
}

/** Registrar KYC queue (spec §5.3): applications by status; review is SIMULATED (no vendor). */
export default async function RegistrarKycPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const t = await getTranslations("kyc.registrar");
  const locale = await getLocale();
  const wanted = (await searchParams).status;
  const status: Status = STATUSES.includes(wanted as Status)
    ? (wanted as Status)
    : "submitted";
  const list = await boFetch<{ applications: KycApplication[] }>(
    `/registrar/kyc?status=${status}`,
  ).catch(() => null);

  const columns: Column<KycApplication>[] = [
    {
      key: "applicant",
      header: t("col.applicant"),
      render: (a) => (
        <Link
          href={`/registrar/kyc/${a.id}`}
          className="block font-semibold text-g700 hover:underline"
        >
          {a.fullName}
          <span className="block text-xs font-normal text-n500">
            {a.userEmail}
          </span>
        </Link>
      ),
    },
    {
      key: "wallet",
      header: t("col.wallet"),
      render: (a) => <Address value={a.wallet} />,
    },
    {
      key: "profile",
      header: t("col.profile"),
      render: (a) =>
        `${t(`types.${a.investorType}`)} · ${t(`residencies.${a.residency}`)}`,
      hideBelow: "md",
    },
    {
      key: "series",
      header: t("col.series"),
      align: "right",
      render: (a) => <span className="num">{a.seriesMints.length}</span>,
    },
    {
      key: "submitted",
      header: t("col.submitted"),
      render: (a) =>
        formatDateTime(new Date(a.createdAt * 1000).toISOString(), locale),
      hideBelow: "sm",
    },
    {
      key: "status",
      header: t("col.status"),
      render: (a) => (
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
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight">{t("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-n600">{t("lead")}</p>
      </header>
      <nav
        aria-label={t("filter")}
        className="inline-flex gap-1 rounded-btn border border-n200 bg-n0 p-1"
      >
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/registrar/kyc?status=${s}`}
            aria-current={s === status ? "page" : undefined}
            className={cx(
              "rounded-sm px-3 py-1.5 text-sm font-semibold transition-colors",
              s === status
                ? "bg-g600 text-white"
                : "text-n600 hover:bg-n50 hover:text-n900",
            )}
          >
            <StableLabel>{t(`tabs.${s}`)}</StableLabel>
          </Link>
        ))}
      </nav>
      {list === null ? (
        <p
          role="alert"
          className="rounded-card bg-err-bg p-4 text-sm text-err-fg"
        >
          {t("unavailable")}
        </p>
      ) : (
        <DataTable
          columns={columns}
          rows={list.applications}
          rowKey={(a) => String(a.id)}
          empty={t(`empty.${status}`)}
        />
      )}
      <p className="text-xs text-n500">{t("simulated")}</p>
    </div>
  );
}
