"use client";

import { useTranslations } from "next-intl";
import { Address } from "@/components/ui/Address";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { Tabs } from "@/components/ui/Tabs";
import type { ActivityLike } from "@/lib/api";
import { formatDateTime } from "@/lib/format";

/** One operator write (Go GET /registrar/audit): who ran what, with which result. */
export type AuditItem = {
  id: number;
  ts: number;
  userId: number;
  role: string;
  route: string;
  params?: Record<string, unknown> | null;
  ok: boolean;
  detail: string;
  signatures?: string[] | null;
};

const almaty = (unixSeconds: number) =>
  formatDateTime(new Date(unixSeconds * 1000).toISOString());

const dash = "—";

/** Activity page tabs: on-chain events (public feed) and the operator audit trail. */
export function ActivityTabs({
  events,
  audit,
}: {
  events: ActivityLike[];
  audit: AuditItem[];
}) {
  const t = useTranslations("registrar.activity");
  const roles = useTranslations("cabinet.roles");

  const eventCols: Column<ActivityLike>[] = [
    {
      key: "ts",
      header: t("time"),
      value: (r) => r.ts,
      render: (r) => almaty(r.ts),
      mono: true,
    },
    {
      key: "kind",
      header: t("kind"),
      value: (r) => r.kind,
      render: (r) => <Badge status={r.kind} />,
    },
    {
      key: "series",
      header: t("series"),
      value: (r) => r.seriesMint ?? "",
      render: (r) => (r.seriesMint ? <Address value={r.seriesMint} /> : dash),
    },
    {
      key: "sig",
      header: t("tx"),
      value: (r) => r.sig,
      render: (r) => (r.sig ? <Address value={r.sig} kind="tx" /> : dash),
    },
  ];

  const auditCols: Column<AuditItem>[] = [
    {
      key: "ts",
      header: t("time"),
      value: (r) => r.ts,
      render: (r) => almaty(r.ts),
      mono: true,
    },
    {
      key: "user",
      header: t("user"),
      value: (r) => r.userId,
      render: (r) => (
        <span>
          #{r.userId}
          <span className="ml-2 text-xs text-n500">
            {roles.has(r.role) ? roles(r.role) : r.role}
          </span>
        </span>
      ),
      mono: true,
    },
    { key: "route", header: t("route"), value: (r) => r.route, mono: true },
    {
      key: "ok",
      header: t("result"),
      value: (r) => (r.ok ? 1 : 0),
      render: (r) =>
        r.ok ? (
          <Badge tone="success">{t("ok")}</Badge>
        ) : (
          <Badge tone="danger">{t("failed")}</Badge>
        ),
    },
    {
      key: "sigs",
      header: t("signatures"),
      value: (r) => r.signatures?.length ?? 0,
      render: (r) =>
        r.signatures && r.signatures.length > 0 ? (
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            {r.signatures.map((s) => (
              <Address key={s} value={s} kind="tx" />
            ))}
          </span>
        ) : (
          dash
        ),
    },
  ];

  return (
    <Tabs
      items={[
        {
          value: "onchain",
          label: t("onchain"),
          content: (
            <DataTable
              columns={eventCols}
              rows={events}
              rowKey={(r) => String(r.id)}
              initialSort={{ key: "ts", dir: "desc" }}
              empty={t("emptyEvents")}
            />
          ),
        },
        {
          value: "audit",
          label: t("audit"),
          content: (
            <DataTable
              columns={auditCols}
              rows={audit}
              rowKey={(r) => String(r.id)}
              initialSort={{ key: "ts", dir: "desc" }}
              empty={t("emptyAudit")}
            />
          ),
        },
      ]}
    />
  );
}
