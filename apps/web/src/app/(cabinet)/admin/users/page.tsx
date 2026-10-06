import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { boFetch } from "@/lib/bo";
import { metaTitle } from "@/lib/meta";
import { UserDialog, UserRowActions, type UserDTO } from "./UserDialog";

type Filters = { q?: string; role?: string; status?: string };

const FIELD =
  "h-10 w-full rounded-btn border border-n300 bg-n0 px-3 text-sm focus:border-g600";

export async function generateMetadata() {
  return { title: await metaTitle("adminUsers") };
}

/** Admin user directory (platform v2 §5.2): search, role/status filters, create,
 * edit role/org/status, issue a one-time reset link. Filters are GET-form params. */
export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<Filters>;
}) {
  const sp = await searchParams;
  const t = await getTranslations("admin.users");
  const roles = await getTranslations("cabinet.roles");

  const q = new URLSearchParams();
  for (const k of ["q", "role", "status"] as const) {
    const v = sp[k]?.trim();
    if (v) q.set(k, v);
  }
  let users: UserDTO[] = [];
  let orgs: { id: number; name: string }[] = [];
  let down = false;
  try {
    const [u, o] = await Promise.all([
      boFetch<{ users: UserDTO[] }>(`/admin/users?${q}`),
      boFetch<{ organizations: { id: number; name: string }[] }>(
        "/admin/organizations",
      ),
    ]);
    users = u.users ?? [];
    orgs = o.organizations ?? [];
  } catch {
    down = true; // the layout already gates the role; show a notice
  }

  const orgName = (id: number | null) =>
    id == null ? "—" : (orgs.find((o) => o.id === id)?.name ?? `#${id}`);
  const roleLabel = (role: string) => (roles.has(role) ? roles(role) : role);

  const columns: Column<UserDTO>[] = [
    {
      key: "name",
      header: t("colUser"),
      render: (u) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-semibold">{u.name}</span>
          <span className="truncate text-xs text-n500">{u.email}</span>
        </span>
      ),
    },
    {
      key: "role",
      header: t("colRole"),
      render: (u) => (
        <span className="flex items-center gap-1.5">
          <Badge tone="neutral">{roleLabel(u.role)}</Badge>
          {u.isDemo && <Badge tone="info">{t("demoBadge")}</Badge>}
        </span>
      ),
    },
    {
      key: "org",
      header: t("colOrg"),
      hideBelow: "md",
      render: (u) => <span className="text-n600">{orgName(u.orgId)}</span>,
    },
    {
      key: "status",
      header: t("colStatus"),
      render: (u) => (
        <Badge
          tone={
            u.status === "active"
              ? "success"
              : u.status === "disabled"
                ? "danger"
                : "neutral"
          }
        >
          {t(`statuses.${u.status}`, { defaultValue: u.status })}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: t("colActions"),
      align: "right",
      render: (u) => <UserRowActions user={u} orgs={orgs} />,
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
        <UserDialog orgs={orgs} />
      </header>

      <Card>
        <form
          method="get"
          className="grid grid-cols-2 gap-3 md:grid-cols-4 md:items-end"
        >
          <div className="min-w-0">
            <label
              htmlFor="f-q"
              className="mb-1 block text-[13px] font-semibold text-n700"
            >
              {t("search")}
            </label>
            <input
              id="f-q"
              name="q"
              type="text"
              defaultValue={sp.q ?? ""}
              placeholder={t("searchPlaceholder")}
              className={FIELD}
            />
          </div>
          <div>
            <label
              htmlFor="f-role"
              className="mb-1 block text-[13px] font-semibold text-n700"
            >
              {t("colRole")}
            </label>
            <select
              id="f-role"
              name="role"
              defaultValue={sp.role ?? ""}
              className={FIELD}
            >
              <option value="">{t("allRoles")}</option>
              {["admin", "registrar", "issuer", "investor"].map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="f-status"
              className="mb-1 block text-[13px] font-semibold text-n700"
            >
              {t("colStatus")}
            </label>
            <select
              id="f-status"
              name="status"
              defaultValue={sp.status ?? ""}
              className={FIELD}
            >
              <option value="">{t("allStatuses")}</option>
              {["active", "disabled", "pending"].map((s) => (
                <option key={s} value={s}>
                  {t(`statuses.${s}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex h-10 items-center rounded-btn bg-p600 px-4 text-sm font-semibold text-white hover:bg-p700"
            >
              {t("apply")}
            </button>
          </div>
        </form>
      </Card>

      {down ? (
        <EmptyState title={t("unreachable")} body={t("unreachableBody")} />
      ) : (
        <DataTable
          columns={columns}
          rows={users}
          rowKey={(u) => String(u.id)}
          empty={t("empty")}
        />
      )}
    </div>
  );
}
