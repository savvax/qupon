import { getLocale, getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { boFetch } from "@/lib/bo";
import { formatDate } from "@/lib/format";
import { toLocale } from "@/i18n/locale";
import { metaTitle } from "@/lib/meta";
import { httpHref } from "@/lib/httpUrl";
import { OrgControls, type OrgDTO } from "./OrgControls";

export async function generateMetadata() {
  return { title: await metaTitle("adminOrganizations") };
}

/** Admin organisations (platform v2 §5.2): issuer and registrar companies
 * whose staff share access to their series; create and edit. */
export default async function AdminOrganizationsPage() {
  const t = await getTranslations("admin.orgs");
  const locale = toLocale(await getLocale());
  let orgs: OrgDTO[] = [];
  let down = false;
  try {
    orgs =
      (await boFetch<{ organizations: OrgDTO[] }>("/admin/organizations"))
        .organizations ?? [];
  } catch {
    down = true; // the layout already gates the role; show a notice
  }

  const columns: Column<OrgDTO>[] = [
    {
      key: "name",
      header: t("colName"),
      render: (o) => <span className="font-semibold">{o.name}</span>,
    },
    {
      key: "kind",
      header: t("colKind"),
      render: (o) => (
        <Badge tone="neutral">
          {t(`kinds.${o.kind}`, { defaultValue: o.kind })}
        </Badge>
      ),
    },
    {
      key: "bin",
      header: t("colBin"),
      hideBelow: "md",
      render: (o) => <span className="num">{o.bin || "—"}</span>,
    },
    {
      key: "website",
      header: t("colWebsite"),
      hideBelow: "lg",
      render: (o) => {
        if (!o.website) return <span className="text-n400">—</span>;
        // legacy values that predate the http(s) check render as inert text, never a link
        const href = httpHref(o.website);
        return href ? (
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-p700 underline"
          >
            {o.website}
          </a>
        ) : (
          <span className="text-n700">{o.website}</span>
        );
      },
    },
    {
      key: "createdAt",
      header: t("colCreated"),
      hideBelow: "md",
      render: (o) => (
        <span className="num whitespace-nowrap">
          {formatDate(new Date(o.createdAt * 1000).toISOString(), locale)}
        </span>
      ),
    },
    {
      key: "actions",
      header: t("colActions"),
      align: "right",
      render: (o) => <OrgControls org={o} />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-n600">{t("lead")}</p>
        </div>
        <OrgControls />
      </header>
      {down ? (
        <EmptyState title={t("unreachable")} body={t("unreachableBody")} />
      ) : (
        <DataTable
          columns={columns}
          rows={orgs}
          rowKey={(o) => String(o.id)}
          empty={t("empty")}
        />
      )}
    </div>
  );
}
