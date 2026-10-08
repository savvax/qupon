import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { boFetch } from "@/lib/bo";
import { formatDateTime } from "@/lib/format";
import { metaTitle } from "@/lib/meta";

type AuditEntryRow = {
  id: number;
  ts: number;
  userId: number;
  email?: string;
  role: string;
  route: string;
  ok: boolean;
  detail: string;
};

type Filters = {
  user?: string;
  role?: string;
  route?: string;
  ok?: string;
  from?: string;
  to?: string;
};

const FILTER_KEYS = ["user", "role", "route", "ok", "from", "to"] as const;

const FIELD =
  "h-10 w-full rounded-btn border border-n300 bg-n0 px-3 text-sm focus:border-g600";

export async function generateMetadata() {
  return { title: await metaTitle("adminAudit") };
}

/** Admin audit log (platform v2 §5.2): filtered feed of every audited write + CSV export.
 * Filters are plain GET-form params so the page stays a server component. */
export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("admin.audit");
  const q = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = sp[k]?.trim();
    if (v) q.set(k, v);
  }
  let entries: AuditEntryRow[] = [];
  let down = false;
  try {
    entries =
      (await boFetch<{ entries: AuditEntryRow[] }>(`/admin/audit?${q}`))
        .entries ?? [];
  } catch {
    down = true; // session/role gates are enforced by the layout; show a notice
  }

  const roleLabel = (role: string) =>
    t.has(`roles.${role}`) ? t(`roles.${role}`) : role;

  const columns: Column<AuditEntryRow>[] = [
    {
      key: "ts",
      header: t("colTime"),
      render: (e) => (
        <span className="num whitespace-nowrap">
          {formatDateTime(new Date(e.ts * 1000).toISOString())}
        </span>
      ),
    },
    {
      key: "user",
      header: t("colUser"),
      render: (e) => (
        <span className="whitespace-nowrap">{e.email || `#${e.userId}`}</span>
      ),
    },
    {
      key: "role",
      header: t("colRole"),
      render: (e) => (
        <span className="whitespace-nowrap">{roleLabel(e.role)}</span>
      ),
    },
    {
      key: "route",
      header: t("colRoute"),
      hideBelow: "md",
      render: (e) => (
        <span
          className="block max-w-[22rem] truncate font-mono text-xs"
          title={e.route}
        >
          {e.route}
        </span>
      ),
    },
    {
      key: "ok",
      header: t("colOk"),
      render: (e) => (
        <Badge tone={e.ok ? "success" : "danger"}>
          {e.ok ? t("resultOk") : t("resultFailed")}
        </Badge>
      ),
    },
    {
      key: "detail",
      header: t("colDetail"),
      hideBelow: "lg",
      render: (e) => <span className="text-n600">{e.detail}</span>,
    },
  ];

  const csvHref = `/api/bo-get/admin/audit?${q.toString() ? `${q}&` : ""}format=csv`;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-n600">{t("lead")}</p>
        </div>
        <a
          href={csvHref}
          className="inline-flex h-10 items-center gap-2 rounded-btn border border-n300 bg-n0 px-4 text-sm font-semibold hover:border-g600"
        >
          {t("exportCsv")}
        </a>
      </header>

      <Card>
        <form
          method="get"
          className="grid grid-cols-2 gap-3 md:grid-cols-6 md:items-end"
        >
          {(
            [
              ["user", "text", t("user"), t("userPlaceholder"), sp.user],
              ["route", "text", t("route"), "/admin/series", sp.route],
              ["from", "date", t("from"), "", sp.from],
              ["to", "date", t("to"), "", sp.to],
            ] as const
          ).map(([name, type, label, placeholder, value]) => (
            <div
              key={name}
              className={type === "date" ? "max-w-40" : "min-w-0"}
            >
              <label
                htmlFor={`f-${name}`}
                className="mb-1 block text-[13px] font-semibold text-n700"
              >
                {label}
              </label>
              <input
                id={`f-${name}`}
                name={name}
                type={type}
                defaultValue={value ?? ""}
                placeholder={placeholder || undefined}
                className={FIELD}
              />
            </div>
          ))}
          <div>
            <label
              htmlFor="f-role"
              className="mb-1 block text-[13px] font-semibold text-n700"
            >
              {t("role")}
            </label>
            <select
              id="f-role"
              name="role"
              defaultValue={sp.role ?? ""}
              className={FIELD}
            >
              <option value="">{t("allRoles")}</option>
              {["admin", "registrar", "issuer", "investor", "reset"].map(
                (r) => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ),
              )}
            </select>
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <label
                htmlFor="f-ok"
                className="mb-1 block text-[13px] font-semibold text-n700"
              >
                {t("result")}
              </label>
              <select
                id="f-ok"
                name="ok"
                defaultValue={sp.ok ?? ""}
                className={FIELD}
              >
                <option value="">{t("resultAll")}</option>
                <option value="true">{t("resultOk")}</option>
                <option value="false">{t("resultFailed")}</option>
              </select>
            </div>
            <button
              type="submit"
              className="inline-flex h-10 shrink-0 items-center rounded-btn bg-p600 px-4 text-sm font-semibold text-white hover:bg-p700"
            >
              {t("apply")}
            </button>
          </div>
        </form>
      </Card>

      {down ? (
        <p className="rounded-card border border-warn-bd bg-warn-bg px-4 py-2 text-sm text-warn-fg">
          {t("unreachable")}
        </p>
      ) : (
        <Card>
          <DataTable
            columns={columns}
            rows={entries}
            rowKey={(e) => String(e.id)}
            empty={t("empty")}
          />
        </Card>
      )}
    </div>
  );
}
